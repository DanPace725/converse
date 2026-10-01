import { createHash } from 'node:crypto';
import { writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { WorkspaceHarness, workspaceFiles } from './workspace.js';
import { stateView } from './state.js';
import { OpenAIProvider, JevProvider, environment } from './provider.js';
import { JevDecisionAdapter } from './jev.js';
import { activity } from './activity.js';
import { agentState, agentView, agentDefaults, startAgent, stepAgent, stopAgent } from './agent.js';

const defaults = { model: 'gpt-6-luna', reasoning: 'low', budget: 256000, output: 16384, jev: true };
const fail = (message, status = 400) => { const error = Error(message); error.status = status; throw error; };
const clientId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);

// Transport-independent local service. SQLite remains authoritative; browser
// state carries only transcript/display data, never provider credentials.
export class ConclaveService {
  constructor(store, { providerFactory = () => new OpenAIProvider(), decisionFactory = () => new JevDecisionAdapter(new JevProvider()),
    availability = () => ({ openai: !!environment('OPENAI_API_KEY'), jev: !!(environment('JEV_API_KEY') || environment('TYPESAFE_API_KEY')) }) } = {}) {
    this.store = store;
    this.providerFactory = providerFactory;
    this.decisionFactory = decisionFactory;
    this.availability = availability;
    this.busy = new Set();
    this.backupWarnings = new Map();
  }

  status() { return { available: true, credentials: this.availability(), defaults, agent_defaults: agentDefaults }; }
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
    return new WorkspaceHarness(this.store, conversation, inference ? this.providerFactory() : { name: 'openai' }, options);
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

  settings(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Invalid settings');
    const { model = defaults.model, reasoning = defaults.reasoning, jev = true } = value;
    if (typeof model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(model)
      || !['none', 'low', 'medium', 'high'].includes(reasoning) || typeof jev !== 'boolean') fail('Invalid model, reasoning or Jev setting');
    const { budget = defaults.budget, output = defaults.output } = value;
    if (!Number.isSafeInteger(budget) || budget < 64000 || budget > 512000
      || !Number.isSafeInteger(output) || output < 1024 || output > 32768 || output >= budget) fail('Invalid context/output budget');
    return { ...defaults, model, reasoning, jev, budget, output };
  }

  create(title = 'Converse chat') {
    if (typeof title !== 'string' || title.length > 200) fail('Invalid title');
    const conversation = this.store.create(title.trim() || 'Converse chat');
    this.backup(conversation);
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

  async ask(conversation, input) {
    if (!input || !clientId(input.message_id) || typeof input.content !== 'string' || input.content.length > 100000) fail('Invalid message');
    const attachments = input.attachments ?? [];
    if (!Array.isArray(attachments) || attachments.length > 1) fail('At most one Markdown attachment per message');
    const documents = attachments.map((a) => this.validateAttachment(a));
    if (!input.content.trim() && !documents.length) fail('Message must not be empty');
    const settings = this.settings(input.settings);
    const fingerprint = createHash('sha256').update(JSON.stringify({ content: input.content.trim(), documents, settings })).digest('hex');
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
      const harness = this.harness(conversation, settings, true);
      for (const document of documents) {
        const { content: documentContent, ...metadata } = document;
        harness.ingestText(document.name, documentContent, content, metadata);
      }
      await harness.ask(content, { allowEmpty: documents.length > 0, metadata: { client_message_id: input.message_id,
        attachment_ids: documents.map((a) => a.attachment_id), web_settings: settings, request_fingerprint: fingerprint } });
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

  async agentStep(conversation, input) {
    await this.mutate(conversation, () => stepAgent(this, conversation, input));
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
    const failures = events.filter((e) => e.kind === 'turn_failure');
    const messages = events.filter((e) => ['user', 'assistant'].includes(e.kind) && e.metadata.purpose !== 'manual-state').map((e) => {
      const userEvent = completed.get(e.id);
      const before = events.filter((v) => v.seq < e.seq);
      const response = e.kind === 'assistant' ? before.findLast((v) => v.kind === 'inference_response' && v.content === 'answer') : null;
      const request = response ? requests.get(response.metadata.request_id) : null;
      const user = userEvent ? events.find((v) => v.id === userEvent) : null;
      const model = response?.metadata.model || request?.metadata.payload.model || 'unknown';
      const record = { message_id: e.metadata.client_message_id || e.id, source_event_id: e.id, timestamp: e.timestamp,
        participant_id: e.kind === 'user' ? 'human' : 'gpt', role: e.kind, content: e.content,
        reply_to: user?.metadata.client_message_id || userEvent || null, mentions: [], attachment_ids: e.metadata.attachment_ids || [], status: 'complete' };
      if (e.kind === 'user' && failures.some((v) => v.metadata.user_event_id === e.id)) record.answer_failed = true;
      if (e.kind === 'assistant') Object.assign(record, { provider: 'GPT', model, usage: response?.metadata.usage || null, pricing: null, estimated_cost_usd: null,
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
    const settings = lastUser?.metadata.web_settings || { ...defaults, model: lastRequest?.metadata.payload.model || defaults.model,
      reasoning: lastRequest?.metadata.payload.reasoning?.effort || defaults.reasoning, jev: true };
    return { schema_version: 1, conversation_id: conversation, created_at: events[0]?.timestamp || null,
      title: events[0]?.content, messages, attachments, settings, context: this.store.context(conversation),
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
