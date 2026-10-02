import { reasoningRecords } from '../reasoning.js';
import { createHash } from 'node:crypto';
import { writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { WorkspaceHarness, workspaceFiles } from './workspace.js';
import { stateView } from './state.js';
import { taskProvider, JevProvider, environment } from './provider.js';
import { JevDecisionAdapter } from './jev.js';
import { activity } from './activity.js';
import { agentState, agentView, agentDefaults, agentCeilings, startAgent, stepAgent, stopAgent } from './agent.js';
import { segment } from './store.js';

const defaults = { provider: 'openai', model: 'gpt-6-luna', reasoning: 'low', budget: 256000, output: 16384, jev: true };
const fail = (message, status = 400) => { const error = Error(message); error.status = status; throw error; };
const clientId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);

// Transport-independent local service. SQLite remains authoritative; browser
// state carries only transcript/display data, never provider credentials.
export class ConclaveService {
  constructor(store, { providerFactory = taskProvider, decisionFactory = () => new JevDecisionAdapter(new JevProvider()),
    availability = () => ({ openai: !!environment('OPENAI_API_KEY'), anthropic: !!environment('ANTHROPIC_API_KEY'), jev: !!(environment('JEV_API_KEY') || environment('TYPESAFE_API_KEY')) }) } = {}) {
    this.store = store;
    this.providerFactory = providerFactory;
    this.decisionFactory = decisionFactory;
    this.availability = availability;
    this.busy = new Set();
    this.backupWarnings = new Map();
  }

  status() { return { available: true, credentials: this.availability(), defaults, agent_defaults: agentDefaults, agent_ceilings: agentCeilings }; }
  list() { return this.store.list(); }

  require(conversation) {
    if (typeof conversation !== 'string' || !/^conv_[a-zA-Z0-9_-]{1,100}$/.test(conversation)) fail('Invalid conversation ID');
    try { this.store.requireConversation(conversation); } catch { fail('Conversation not found', 404); }
  }

  harness(conversation, settings = {}, inference = false) {
    this.require(conversation);
    const options = { ...defaults, ...settings, mode: 'layered' };
    if (inference) options.decisionAdapter = this.decisionAdapter(options);
    options.maxCalls = 16;
    return new WorkspaceHarness(this.store, conversation, inference ? this.providerFactory(options.provider) : { name: options.provider }, options);
  }

  decisionAdapter(settings) {
    return settings.jev && this.availability().jev ? this.decisionFactory() : null;
  }

  workspaceFile(conversation, path) {
    this.require(conversation);
    const file = workspaceFiles(this.store, conversation).find(f => f.path === path);
    if (!file) fail('Workspace file not found', 404);
    return file;
  }

  sourceEvent(conversation, eventId) {
    this.require(conversation);
    try { return this.store.source(conversation, eventId); }
    catch { fail('Source not found', 404); }
  }

  contextBundle(conversation, bundleId) {
    this.require(conversation);
    try { return this.store.resolveBundle(conversation, bundleId); }
    catch { fail('Context section not found', 404); }
  }

  editable(conversation, input, revision = false) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Invalid edit');
    if (agentState(this.store, conversation)?.status === 'running') fail('Stop the agent before saving an edit', 409);
    if (revision && (!Number.isSafeInteger(input.expected_revision) || input.expected_revision !== this.store.context(conversation).revision))
      fail('Context changed since you opened it. Reload the latest version before saving.', 409);
  }

  async saveDocument(conversation, input) {
    await this.mutate(conversation, () => {
      this.editable(conversation, input);
      if (!Object.hasOwn(input, 'expected_source_event_id')) fail('Supply the document version');
      if (input.copied_from_source_event_id) this.sourceEvent(conversation, input.copied_from_source_event_id);
      const h = this.harness(conversation);
      h.toolResult('workspace_write', { path: input.path, content: input.content,
        expected_source_event_id: input.expected_source_event_id,
        copied_from_source_event_id: input.copied_from_source_event_id }, [], { manual: true });
    });
    return this.view(conversation);
  }

  async saveContext(conversation, input) {
    await this.mutate(conversation, () => {
      this.editable(conversation, input, true);
      if (typeof input.content !== 'string' || !input.content.trim() || Buffer.byteLength(input.content) > 100000) fail('Use nonempty context text up to 100 KB');
      const current = this.store.context(conversation);
      const old = current.segments.find(s => s.id === input.bundle_id);
      if (!old) fail('Context section is no longer current', 409);
      if (old.pinned || old.verbatim_required || old.state_key || old.type === 'reference') fail('This section is protected. Edit named entries in Remembered state; references retain their original source.', 409);
      const h = this.harness(conversation, this.view(conversation).settings);
      const make = sourceId => segment(input.content, [...old.source_event_ids, sourceId], {
        type: old.type, status: old.status, parent_bundle_ids: [old.id],
      });
      const next = item => current.segments.map(s => s.id === old.id ? item : s);
      h.checkBudget(h.payload(h.input(next(make('pending-edit'))), { tools: h.tools() }));
      const source = this.store.append(conversation, 'user', input.content, { purpose: 'manual-context', previous_bundle_id: old.id }, 'human');
      this.store.commit(conversation, next(make(source.id)), 'manual working context edit', current.revision, [], { previous_bundle_id: old.id, edited_by: 'human' });
    });
    return this.view(conversation);
  }

  async saveState(conversation, input) {
    await this.mutate(conversation, () => {
      this.editable(conversation, input, true);
      const current = this.store.context(conversation);
      const old = current.segments.find(s => s.state_key === input.key);
      if (!Object.hasOwn(input, 'expected_bundle_id') || input.expected_bundle_id !== (old?.id || null)) fail('This state key already exists or its version changed. Open the current entry before saving.', 409);
      if (typeof input.key !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(input.key) ||
        !['objective', 'constraint', 'decision', 'question', 'evidence'].includes(input.type) ||
        typeof input.content !== 'string' || !input.content.trim() || input.content.trim().length > 2000) fail('Use a valid state key/type and 1–2000 characters');
      if (old?.pinned || old?.verbatim_required) fail('This state entry is protected', 409);
      if (!['active', 'unresolved', 'superseded'].includes(input.status)) fail('Invalid state status');
      const h = this.harness(conversation, this.view(conversation).settings);
      // Check the candidate before appending the human source.
      h.checkBudget(h.payload(h.input([...current.segments.filter(s => s !== old), segment(input.content, ['pending-edit'], { type: input.type })]), { tools: h.tools() }));
      const source = this.store.append(conversation, 'user', input.content.trim(), { purpose: 'manual-state', state_key: input.key }, 'human');
      h.updateState({ expected_revision: current.revision, updates: [{ key: input.key, type: input.type,
        content: input.content, source_event_ids: [...(old?.source_event_ids || []), source.id], status: input.status,
        supersedes: [], conflicts_with: old?.relations.conflicts_with || [], supports: old?.relations.supports || [],
        limitations: [...new Set([...(old?.resolution.limitations || []), 'User edit; not independently verified.'])].slice(0,16) }] });
    });
    return this.view(conversation);
  }

  settings(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Invalid settings');
    const { provider = defaults.provider, model = defaults.model, reasoning = defaults.reasoning, jev = true } = value;
    if (!['openai', 'anthropic'].includes(provider)) fail('Unsupported task provider');
    if ((provider === 'openai' && /^claude-/i.test(model)) || (provider === 'anthropic' && !/^claude-/i.test(model))) fail('Model does not match the selected provider');
    if (typeof model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(model)
      || !['none', 'low', 'medium', 'high'].includes(reasoning) || typeof jev !== 'boolean') fail('Invalid model, reasoning or Jev setting');
    const { budget = defaults.budget, output = defaults.output } = value;
    if (!Number.isSafeInteger(budget) || budget < 64000 || budget > 512000
      || !Number.isSafeInteger(output) || output < 1024 || output > 32768 || output >= budget) fail('Invalid context/output budget');
    // A Claude checkpoint stores 'none'; it is invalid when carried into this GPT model.
    return { ...defaults, provider, model, reasoning: provider === 'anthropic' ? 'none' :
      model === 'gpt-6.1-sol' && reasoning === 'none' ? 'low' : reasoning, jev, budget, output };
  }

  create(title = 'Converse chat') {
    if (typeof title !== 'string' || title.length > 200) fail('Invalid title');
    const conversation = this.store.create(title.trim() || 'Converse chat');
    this.backup(conversation);
    return this.view(conversation);
  }

  async name(conversation, input) {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 80) fail('Invalid conversation title');
    await this.mutate(conversation, () => {
      if (this.store.events(conversation).some(e => e.kind === 'conversation_title')) return;
      this.store.append(conversation, 'conversation_title', input.title.trim(), { generated: true,
        usage: input.usage || null, provenance: input.provenance || null }, 'system');
    });
    return this.view(conversation);
  }

  // Refuse concurrent mutations rather than interleave projection revisions.
  async mutate(conversation, action) {
    this.require(conversation);
    if (this.busy.has(conversation)) fail('This conversation is answering. Wait before changing it.', 409);
    this.busy.add(conversation);
    try { return await action(); }
    finally { this.backup(conversation); this.busy.delete(conversation); }
  }

  validateAttachment(value) {
    if (!value || !clientId(value.attachment_id) || typeof value.name !== 'string' || value.name.length > 240
      || !/\.(md|markdown)$/i.test(value.name) || typeof value.content !== 'string'
      || Buffer.byteLength(value.content, 'utf8') > 200000) fail('Use a Markdown attachment up to 200 KB');
    return { attachment_id: value.attachment_id, name: value.name, content: value.content, mime_type: 'text/markdown',
      sha256: createHash('sha256').update(value.content, 'utf8').digest('hex'), source_sha256: value.sha256 || null };
  }

  revisionMetadata(conversation, messageId) {
    if (messageId === undefined || messageId === null) return {};
    if (!clientId(messageId)) fail('Invalid original message ID');
    const original = this.store.events(conversation).find(e => e.kind === 'user'
      && (e.id === messageId || e.metadata.client_message_id === messageId));
    if (!original) fail('Original message not found in this conversation');
    return { revises_message_id: messageId, revises_event_id: original.id };
  }

  async ask(conversation, input, { onEvent } = {}) {
    if (!input || !clientId(input.message_id) || typeof input.content !== 'string' || input.content.length > 100000) fail('Invalid message');
    const attachments = input.attachments ?? [];
    if (!Array.isArray(attachments) || attachments.length > 1) fail('At most one Markdown attachment per message');
    const documents = attachments.map((a) => this.validateAttachment(a));
    if (!input.content.trim() && !documents.length) fail('Message must not be empty');
    const settings = this.settings(input.settings);
    const revision = this.revisionMetadata(conversation, input.revises_message_id);
    const fingerprint = createHash('sha256').update(JSON.stringify({ content: input.content.trim(), documents, settings, ...revision })).digest('hex');
    await this.mutate(conversation, async () => {
      if (agentState(this.store, conversation)?.status === 'running') fail('Stop the agent before sending a chat message', 409);
      const events = this.store.events(conversation);
      const prior = events.find((e) => e.kind === 'user' && e.metadata.client_message_id === input.message_id);
      const content = input.content.trim();
      if (prior) {
        if (prior.metadata.request_fingerprint !== fingerprint) {
          fail('Message ID already belongs to a different request', 409);
        }
        if (events.some((e) => e.kind === 'turn_complete' && e.metadata.user_event_id === prior.id)) return;
        fail('This request is already saved without a completed answer. Send a new message or resume the chat.', 409);
      }
      for (const document of documents) {
        if (events.some((e) => e.kind === 'document' && e.metadata.attachment_id === document.attachment_id)) fail('Attachment ID is already saved', 409);
      }
      const harness = this.harness(conversation, { ...settings, onEvent }, true);
      for (const document of documents) {
        const { content: documentContent, ...metadata } = document;
        harness.ingestText(document.name, documentContent, content, metadata);
      }
      await harness.ask(content, { allowEmpty: documents.length > 0, metadata: { client_message_id: input.message_id,
        attachment_ids: documents.map((a) => a.attachment_id), web_settings: settings, request_fingerprint: fingerprint, ...revision } });
    });
    return this.view(conversation);
  }

  async remember(conversation, input) {
    await this.mutate(conversation, () => {
      if (agentState(this.store, conversation)?.status === 'running') fail('Stop the agent before changing state', 409);
      return this.harness(conversation).remember(input.key, input.type, input.content);
    });
    return this.view(conversation);
  }

  async agentStart(conversation, input) {
    await this.mutate(conversation, () => startAgent(this, conversation, input));
    return this.view(conversation);
  }

  async agentStep(conversation, input, options) {
    await this.mutate(conversation, () => stepAgent(this, conversation, input, options));
    return this.view(conversation);
  }

  async agentStop(conversation, input) {
    await this.mutate(conversation, () => stopAgent(this, conversation, input.run_id));
    return this.view(conversation);
  }

  activity(conversation, { after = 0, replay = false } = {}) {
    this.require(conversation);
    if (!Number.isSafeInteger(after) || after < 0 || typeof replay !== 'boolean') fail('Invalid activity cursor');
    return activity(this.store, conversation, { after, replay, busy: this.busy.has(conversation) });
  }

  view(conversation) {
    this.require(conversation);
    const events = this.store.events(conversation);
    const requests = new Map(events.filter((e) => e.kind === 'inference_request').map((e) => [e.id, e]));
    const completed = new Map(events.filter((e) => e.kind === 'turn_complete').map((e) => [e.metadata.assistant_event_id, e.metadata.user_event_id]));
    const rationales = reasoningRecords(events);
    const failures = events.filter((e) => e.kind === 'turn_failure');
    const messages = events.filter((e) => ['user', 'assistant'].includes(e.kind) && !e.metadata.purpose?.startsWith('manual-')).map((e) => {
      const userEvent = completed.get(e.id);
      const before = events.filter((v) => v.seq < e.seq);
      const response = e.kind === 'assistant' ? before.findLast((v) => v.kind === 'inference_response' && v.content === 'answer') : null;
      const request = response ? requests.get(response.metadata.request_id) : null;
      const user = userEvent ? events.find((v) => v.id === userEvent) : null;
      const model = response?.metadata.model || request?.metadata.payload.model || 'unknown';
      const provider = (request?.metadata.provider || e.actor) === 'anthropic' ? 'Claude' : 'GPT';
      const record = { message_id: e.metadata.client_message_id || e.id, source_event_id: e.id, timestamp: e.timestamp,
        participant_id: e.kind === 'user' ? 'human' : provider.toLowerCase(), role: e.kind, content: e.content,
        reply_to: user?.metadata.client_message_id || userEvent || null, mentions: [], attachment_ids: e.metadata.attachment_ids || [], status: 'complete' };
      if (e.kind === 'user') {
        record.reasoning = rationales.filter(r => r.user_event_id === e.id);
        const failure = failures.findLast(v => v.metadata.user_event_id === e.id);
        if (failure) { record.answer_failed = true; record.failure = failure.content; }
      }
      if (e.metadata.revises_message_id) record.revises_message_id = e.metadata.revises_message_id;
      if (e.kind === 'assistant') Object.assign(record, { provider, model, usage: response?.metadata.usage || null, pricing: null, estimated_cost_usd: null,
        invocation: { engine: 'conclave', conversation_id: conversation, request_event_id: request?.id || null,
          response_event_id: response?.id || null, context_revision: request?.metadata.context_revision ?? null,
          requested_model: request?.metadata.payload.model || null, reported_model: response?.metadata.model || null,
          response_id: response?.metadata.response_id || null, generation_settings: request ? {
            max_output_tokens: request.metadata.payload.max_output_tokens, reasoning: request.metadata.payload.reasoning,
          } : null, context_message_ids: null, provenance_note: 'Full transformed inputs, tool exchanges and source IDs are in context_layer.events.' } });
      return record;
    });
    const attachments = events.filter((e) => e.kind === 'document' && e.metadata.attachment_id).map((e) => ({
      attachment_id: e.metadata.attachment_id, name: e.metadata.filename, mime_type: e.metadata.mime_type,
      sha256: e.metadata.sha256, source_sha256: e.metadata.source_sha256, content: e.content, source_event_id: e.id,
    }));
    const harness = this.harness(conversation);
    const lastRequest = events.findLast((e) => e.kind === 'inference_request' && e.content === 'answer');
    const lastUser = events.findLast((e) => e.kind === 'user' && e.metadata.web_settings);
    const settings = { ...defaults, ...(lastUser?.metadata.web_settings || { provider: lastRequest?.metadata.provider || defaults.provider, model: lastRequest?.metadata.payload.model || defaults.model,
      reasoning: lastRequest?.metadata.payload.reasoning?.effort || defaults.reasoning, jev: true }) };
    return { schema_version: 1, conversation_id: conversation, created_at: events[0]?.timestamp || null,
      title: events.findLast(e => e.kind === 'conversation_title')?.content || events[0]?.content,
      title_generated: events.some(e => e.kind === 'conversation_title'), messages, attachments, settings, context: this.store.context(conversation),
      state: stateView(this.store, conversation), metrics: harness.metrics(), busy: this.busy.has(conversation),
      agent: agentView(this.store, conversation), workspace: workspaceFiles(this.store, conversation), backup_warning: this.backupWarnings.get(conversation) || null };
  }

  export(conversation) {
    const view = this.view(conversation);
    const snapshots = this.store.db.prepare('SELECT revision,receipt_id,segments FROM snapshots WHERE conversation_id=? ORDER BY revision').all(conversation)
      .map((row) => ({ ...row, segments: JSON.parse(row.segments) }));
    return { schema_version: 1, engine: 'conclave', exported_at: new Date().toISOString(), conversation_id: conversation,
      events: this.store.events(conversation), snapshots, context: view.context, state: view.state, metrics: view.metrics };
  }

  backup(conversation) {
    if (this.store.memoryOnly) return;
    try {
      this.require(conversation);
      this.store.writeView(conversation);
      const path = join(this.store.directory, conversation, 'converse-export.json');
      writeFileSync(path + '.tmp', JSON.stringify(this.export(conversation), null, 2));
      renameSync(path + '.tmp', path);
      this.backupWarnings.delete(conversation);
    } catch {
      this.backupWarnings.set(conversation, 'SQLite history is saved; the automatic JSON copy could not be written. Use Export JSON.');
    }
  }
}
