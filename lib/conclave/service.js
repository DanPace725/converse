import { sanitizeExport } from './export-sanitizer.js';
import { transcriptFields, transcriptView, conversationDefaults } from './transcript.js';
import { createHash } from 'node:crypto';
import { writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { WorkspaceHarness, workspaceFiles } from './workspace.js';
import { stateView } from './state.js';
import { taskProvider, JevProvider, environment, anthropicPayload } from './provider.js';
import { JevDecisionAdapter } from './jev.js';
import { activity } from './activity.js';
import { AgentHarness, agentState, agentView, agentDefaults, agentCeilings, startAgent, stepAgent, stopAgent, restoreProjection } from './agent.js';
import { segment } from './store.js';
import { inputSize, countInput } from './input-size.js';
import { requestComparison } from './request-comparison.js';
import { effortLevels } from './effort.js';
import { documentChanges, removedSources } from './documents.js';
import { contextAudit } from './telemetry.js';
import { jevTelemetry } from './jev-telemetry.js';
import { registerFrame, listFrames, attestSource, recordBundle, readBundle, linkBundles, queryBundles } from './clp.js';
import { memoryView, commitMemory, changeMemory } from './memory.js';
import { activateMemory } from './memory-controller.js';
import { OpenAIEmbeddingProvider } from './embeddings.js';
import { SQLiteEmbeddingStore } from './embedding-store.js';
import { SemanticRetrieval } from './semantic-retrieval.js';

const defaults = conversationDefaults;
const fail = (message, status = 400) => { const error = Error(message); error.status = status; throw error; };
const clientId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);

// Transport-independent local service. SQLite remains authoritative; browser
// state carries only transcript/display data, never provider credentials.
export class ConclaveService {
  constructor(store, { providerFactory = taskProvider, decisionFactory = () => new JevDecisionAdapter(new JevProvider()),
    memoryModel = providerFactory === taskProvider, memorySelector = process.env.CONCLAVE_MEMORY_SELECTOR || 'task-model',
    embeddingEnabled = providerFactory === taskProvider && process.env.CONCLAVE_EMBEDDINGS !== 'off',
    embeddingFactory = () => new OpenAIEmbeddingProvider(), embeddingBackend,
    pageFetcher,
    availability = () => ({ openai: !!environment('OPENAI_API_KEY'), anthropic: !!environment('ANTHROPIC_API_KEY'), jev: !!(environment('JEV_API_KEY') || environment('TYPESAFE_API_KEY')) }) } = {}) {
    this.store = store;
    this.providerFactory = providerFactory;
    if (!['task-model', 'jev-hybrid'].includes(memorySelector)) throw Error('Invalid memory selector');
    this.memoryModel = memoryModel;
    this.memorySelector = memorySelector;
    this.embeddingEnabled = embeddingEnabled;
    this.embeddingFactory = embeddingFactory;
    this.embeddingBackend = embeddingBackend;
    this.pageFetcher = pageFetcher;
    this.decisionFactory = decisionFactory;
    this.availability = availability;
    this.busy = new Set();
    this.activeAgents = new Map();
    this.backupWarnings = new Map();
  }

  status() { const credentials = this.availability(); return { available: true, credentials, web_search: !!(credentials.openai || credentials.anthropic), defaults, agent_defaults: agentDefaults, agent_ceilings: agentCeilings }; }
  list() { return this.store.list(); }

  clpFrames(conversation) { this.require(conversation); return listFrames(this.store, conversation); }
  clpBundle(conversation, bundleId) { this.require(conversation); return readBundle(this.store, conversation, bundleId); }
  clpQuery(conversation, input) {
    this.require(conversation);
    const { action, conversation_id, ...query } = input || {};
    return queryBundles(this.store, conversation, query);
  }
  async clpWrite(conversation, input, operation) {
    return this.mutate(conversation, () => {
      this.editable(conversation, input);
      const { action, conversation_id, ...value } = input;
      return operation(this.store, conversation, value);
    });
  }
  clpRegisterFrame(conversation, input) { return this.clpWrite(conversation, input, registerFrame); }
  clpAttest(conversation, input) { return this.clpWrite(conversation, input, attestSource); }
  clpRecord(conversation, input) { return this.clpWrite(conversation, input, recordBundle); }
  clpLink(conversation, input) { return this.clpWrite(conversation, input, linkBundles); }

  require(conversation) {
    if (typeof conversation !== 'string' || !/^conv_[a-zA-Z0-9_-]{1,100}$/.test(conversation)) fail('Invalid conversation ID');
    try { this.store.requireConversation(conversation); } catch { fail('Conversation not found', 404); }
  }

  harness(conversation, settings = {}, inference = false) {
    this.require(conversation);
    const options = { ...defaults, memoryModel: this.memoryModel, memorySelector: this.memorySelector, memoryCapacityInspect: !inference, ...settings, mode: 'layered', webSearch: true, pageFetcher: this.pageFetcher };
    if (inference) {
      options.decisionAdapter = this.decisionAdapter(options);
      options.semanticRetrieval = this.semanticRetrieval();
    }
    options.maxCalls = 16;
    return new WorkspaceHarness(this.store, conversation, inference ? this.providerFactory(options.provider) : { name: options.provider }, options);
  }

  decisionAdapter(settings) {
    return settings.jev && this.availability().jev ? this.decisionFactory() : null;
  }

  semanticRetrieval() {
    if (!this.embeddingEnabled || !this.availability().openai) return null;
    return this.semantic ||= new SemanticRetrieval(this.embeddingBackend || new SQLiteEmbeddingStore(this.store), this.embeddingFactory);
  }

  workspaceFile(conversation, path) {
    this.require(conversation);
    const file = workspaceFiles(this.store, conversation).find(f => f.path === path);
    if (!file) fail('Workspace file not found', 404);
    return file;
  }

  sourceEvent(conversation, eventId) {
    this.require(conversation);
    try {
      const event = this.store.source(conversation, eventId);
      return {
        ...event,
        sourceRef: this.store.references(conversation).sources.get(event.id),
      };
    } catch {
      fail('Source not found', 404);
    }
  }

  contextBundle(conversation, bundleId) {
    this.require(conversation);
    try {
      return this.store.describeSegments(conversation, [
        this.store.resolveBundle(conversation, bundleId),
      ])[0];
    } catch {
      fail('Context section not found', 404);
    }
  }

  editable(conversation, input, revision = false) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Invalid edit');
    if (agentState(this.store, conversation)?.status === 'running') fail('Stop the agent before saving an edit', 409);
    if (revision && (!Number.isSafeInteger(input.expected_revision) || input.expected_revision !== this.store.context(conversation).revision))
      fail('Context changed since you opened it. Reload the latest version before saving.', 409);
  }

  async uploadDocument(conversation, input) {
    await this.mutate(conversation, () => {
      this.editable(conversation, input);
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 160
        || /[/\\]/.test(input.name) || !/\.(md|markdown|txt)$/i.test(input.name)
        || typeof input.content !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input.content))
        fail('Upload a UTF-8 Markdown or plain text document (.md, .markdown, .txt) up to 100 KB');
      const path = input.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^[^a-zA-Z0-9_-]+/, '');
      if (!/\.(md|markdown|txt)$/i.test(path)) fail('Use a document filename before its extension');
      if (workspaceFiles(this.store, conversation).some(file => file.path === path))
        fail('A workspace file with this name already exists. Rename the upload or edit the saved file.', 409);
      this.harness(conversation).toolResult('workspace_write', {
        path, filename: input.name, content: input.content, expected_source_event_id: null,
      }, [], { manual: true, upload: true });
    });
    return this.view(conversation);
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

  async changeDocument(conversation, input) {
    await this.mutate(conversation, () => {
      this.editable(conversation, input);
      if (!['remove', 'restore'].includes(input.operation)) fail('Invalid document operation');
      const events = this.store.events(conversation);
      const files = workspaceFiles(this.store, conversation, true);
      const source = input.path ? files.find(f => f.path === input.path) :
        events.find(e => e.id === input.source_event_id && e.kind === 'document' && !e.metadata.workspace_path);
      if (!source) fail('Document not found', 404);
      const sourceId = source.source_event_id || source.id;
      const key = input.path ? 'path:' + input.path : 'source:' + sourceId;
      const previous = documentChanges(events).get(key);
      if (input.operation === 'remove') {
        if (input.expected_source_event_id !== sourceId || previous?.metadata.operation === 'remove') fail('Document version changed; refresh before removing.', 409);
      } else {
        if (previous?.metadata.operation !== 'remove' || input.expected_change_id !== previous.id) fail('Removal changed; refresh before restoring.', 409);
        if (input.path && (workspaceFiles(this.store, conversation).length >= 20 ||
          workspaceFiles(this.store, conversation).reduce((n, f) => n + Buffer.byteLength(f.content), Buffer.byteLength(source.content)) > 500000))
          fail('Restore would exceed the active workspace limits');
      }
      const affected = new Set(input.path ? events.filter(e => e.kind === 'document' && e.metadata.workspace_path === input.path).map(e => e.id) : [sourceId]);
      const current = this.store.context(conversation);
      const sections = input.operation === 'remove' ? current.segments.filter(s => s.source_event_ids.some(id => affected.has(id))) : [];
      // Commit before recording the tombstone; a failed protected edit leaves the
      // document visible. The repository mutation lease serializes hosted edits.
      if (sections.length) this.store.commit(conversation, current.segments.filter(s => !sections.includes(s)),
        'user document removal', current.revision, [], { removed_source_ids: [...affected], removed_bundle_ids: sections.map(s => s.id), edited_by: 'human' });
      this.store.append(conversation, 'document_lifecycle', input.operation, {
        key, operation: input.operation, path: input.path || null, source_event_id: sourceId,
        name: input.path || source.metadata?.filename || source.metadata?.name || 'Document',
      }, 'human');
    });
    return this.view(conversation);
  }

  async countTokens(conversation) {
    let result;
    await this.mutate(conversation, async () => {
      this.editable(conversation, {});
      const view = this.view(conversation), settings = view.settings;
      const provider = this.providerFactory(settings.provider);
      const h = new WorkspaceHarness(this.store, conversation, provider, { ...settings, mode: 'layered', webSearch: true });
      const payload = h.answerPayload();
      result = inputSize(payload, provider, this.store.events(conversation));
      if (result.provider_count == null) {
        result = await countInput(payload, provider);
        this.store.append(conversation, 'token_count', result.method, { ...result, revision: view.context.revision }, 'system');
      }
    });
    return { count: result, view: this.view(conversation) };
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

  async saveMemory(conversation, input) {
    await this.mutate(conversation, () => {
      this.editable(conversation, input);
      const memory = memoryView(this.store, conversation);
      if (input.expected_memory_revision !== memory.revision) fail('Memory changed; reload before editing', 409);
      const old = memory.records.find(r => r.memory_id === input.memory_id);
      if (!old || ['superseded', 'suppressed', 'invalidated'].includes(old.lifecycle)) fail('Memory entry is not editable; reload', 409);
      if (typeof input.content !== 'string' || !input.content.trim() || input.content.trim().length > 2000
        || !['commitment', 'preference', 'claim', 'question'].includes(input.kind)) fail('Use a memory kind and 1–2000 characters');
      const event = this.store.append(conversation, 'user', input.content.trim(), { purpose: 'manual-memory', corrects_memory_id: old.memory_id }, 'human');
      commitMemory(this.store, conversation, [{ kind: input.kind, span_start: 0, span_end: event.content.length, supersedes: old.memory_id }], {
        event, expected_revision: memory.revision, manual: true });
      activateMemory(this.harness(conversation, this.view(conversation).settings), event.content);
    });
    return this.view(conversation);
  }

  async memoryLifecycle(conversation, input) {
    await this.mutate(conversation, () => {
      this.editable(conversation, input);
      changeMemory(this.store, conversation, input.memory_id, input.operation, input.expected_memory_revision);
      activateMemory(this.harness(conversation, this.view(conversation).settings), '');
    });
    return this.view(conversation);
  }

  settings(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Invalid settings');
    const { provider = defaults.provider, model = defaults.model, reasoning = defaults.reasoning, jev = true, freezeProjection = defaults.freezeProjection } = value;
    if (typeof freezeProjection !== 'boolean') fail('Invalid projection setting');
    if (!['openai', 'anthropic'].includes(provider)) fail('Unsupported task provider');
    if ((provider === 'openai' && /^claude-/i.test(model)) || (provider === 'anthropic' && !/^claude-/i.test(model))) fail('Model does not match the selected provider');
    if (typeof model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(model)
      || !['default', 'none', 'low', 'medium', 'high', 'xhigh', 'max'].includes(reasoning) || typeof jev !== 'boolean') fail('Invalid model, reasoning or Jev setting');
    const { budget = defaults.budget, output = defaults.output } = value;
    if (!Number.isSafeInteger(budget) || budget < 64000 || budget > 512000
      || !Number.isSafeInteger(output) || output < 1024 || output > 32768 || output >= budget) fail('Invalid context/output budget');
    // Legacy Claude 'none' meant provider default, not disabled thinking.
    let effort = provider === 'anthropic' && reasoning === 'none' ? 'default' : reasoning;
    if (provider === 'openai' && (effort === 'default' || model === 'gpt-6.1-sol' && effort === 'none')) effort = 'low';
    if (!effortLevels(provider, model).includes(effort)) {
      if (!Object.hasOwn(value, 'reasoning')) effort = provider === 'anthropic' ? 'default' : 'low';
      else fail('Reasoning effort is unsupported by the selected model');
    }
    return { ...defaults, provider, model, reasoning: effort, jev, budget, output, freezeProjection };
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
        await harness.ingestDocument(document.name, documentContent, content, metadata);
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

  async agentStep(conversation, input, options = {}) {
    const controller = new AbortController();
    let release;
    const active = { run_id: input.run_id, controller, done: new Promise(resolve => { release = resolve; }) };
    const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    try {
      await this.mutate(conversation, async () => {
        this.activeAgents.set(conversation, active);
        await stepAgent(this, conversation, input, { ...options, signal });
      });
    } finally {
      if (this.activeAgents.get(conversation) === active) this.activeAgents.delete(conversation);
      release();
    }
    return this.view(conversation);
  }

  async agentStop(conversation, input) {
    const active = this.activeAgents.get(conversation);
    if (active?.run_id === input.run_id) {
      active.controller.abort(Object.assign(Error('Agent stopped by user.'), { name: 'AbortError', agent_status: 'stopped' }));
      await active.done;
    }
    await this.mutate(conversation, () => stopAgent(this, conversation, input.run_id));
    return this.view(conversation);
  }

  activity(conversation, { after = 0, replay = false } = {}) {
    this.require(conversation);
    if (!Number.isSafeInteger(after) || after < 0 || typeof replay !== 'boolean') fail('Invalid activity cursor');
    return { ...activity(this.store, conversation, { after, replay, busy: this.busy.has(conversation) }), model_input: this.modelInput(conversation, { compare: true }) };
  }

  modelInput(conversation, { compare = false } = {}) {
    const events = this.store.events(conversation);
    const lastUser = events.findLast((e) => e.kind === 'user' && e.metadata.web_settings);
    const settings = { ...defaults, ...lastUser?.metadata.web_settings };
    const state = agentState(this.store, conversation);
    const running = state?.status === 'running';
    const selected = running ? state.settings : settings;
    const provider = { name: selected.provider,
      ...(selected.provider === 'anthropic' ? { requestPayload: anthropicPayload } : {}) };
    const h = new (running ? AgentHarness : WorkspaceHarness)(this.store, conversation, provider,
      { ...selected, memoryCapacityInspect: true, webSearch: true, pageFetcher: this.pageFetcher });
    h.continuation = running ? state.continuation : null;
    if (running) restoreProjection(h, state);
    const next = h.projectAnswer(running ? state.pending : []).payload;
    const response = events.findLast(e => e.kind === 'inference_response' && e.content === 'answer');
    const request = response && events.find(e => e.id === response.metadata.request_id && e.metadata.payload);
    const current = compare && events.findLast(e => e.kind === 'inference_request' && e.content === 'answer'
      && e.seq > (lastUser?.seq || 0) && e.metadata.payload);
    const comparisonProvider = current ? { name: current.metadata.provider,
      ...(current.metadata.provider === 'anthropic' ? { requestPayload: anthropicPayload } : {}) } : provider;
    return {
      ...(compare ? { comparison: requestComparison(current ? current.metadata.payload : next, comparisonProvider, events, current || null) } : {}),
      next: {
        ...inputSize(next, provider, events),
        ...(h.memoryCapacityError ? { memory_capacity_error: h.memoryCapacityError } : {}),
        continuation_included: !!running,
      },
      latest: request
        ? {
            request_id: request.id,
            provider: request.metadata.provider,
            model: request.metadata.payload.model,
            revision: request.metadata.context_revision,
            input_tokens: response.metadata.usage?.input_tokens ?? null,
            output_tokens: response.metadata.usage?.output_tokens ?? null,
            timestamp: request.timestamp,
            continuation_included: true,
            ...inputSize(
              request.metadata.payload,
              {
                name: request.metadata.provider,
                ...(request.metadata.provider === "anthropic"
                  ? { requestPayload: anthropicPayload }
                  : {}),
              },
              [],
            ),
          }
        : null,
      byte_guard: selected.budget,
      output_reserve: selected.output,
      review_interval_tokens: 10000,
    };
  }

  transcript(conversation) {
    this.require(conversation);
    const events = this.store.events(conversation);
    const state = agentState(this.store, conversation);
    return transcriptView(events, conversation, { revision: this.store.context(conversation).revision, state, busy: this.busy.has(conversation) });
  }

  view(conversation) {
    return this.store.withReadCache(() => this.viewCached(conversation));
  }

  jevAudit(conversation, options = {}) {
    this.require(conversation);
    return jevTelemetry(this.store.events(conversation), options);
  }

  viewCached(conversation) {
    this.require(conversation);
    const events = this.store.events(conversation);
    const { messages, attachments, settings } = transcriptFields(events, conversation);
    const harness = this.harness(conversation);
    const references = this.store.references(conversation);
    const current = this.store.context(conversation);
    const protections = new Map(
      harness.contextEligibility().map((p) => [p.id, p]),
    );
    const context = {
      ...current,
      segments: this.store
        .describeSegments(conversation, current.segments)
        .map((s) => ({ ...s, protection: protections.get(s.id) })),
    };
    const state = stateView(this.store, conversation);
    const modelInput = this.modelInput(conversation);
    return {
      schema_version: 1,
      conversation_id: conversation,
      created_at: events[0]?.timestamp || null,
      title:
        events.findLast((e) => e.kind === "conversation_title")?.content ||
        events[0]?.content,
      title_generated: events.some((e) => e.kind === "conversation_title"),
      messages,
      attachments: attachments.filter(
        (a) => !removedSources(events).has(a.source_event_id),
      ),
      settings,
      jev: jevTelemetry(events, { enabled: !!settings.jev, available: !!this.availability().jev }),
      embedding_health: (() => {
        const last = events.findLast(e => ['embedding_failure', 'embedding_index', 'embedding_skip'].includes(e.kind));
        return { enabled: this.embeddingEnabled, status: last?.kind === 'embedding_index' ? 'indexed' : last ? 'lexical fallback' : 'not attempted',
          ...(last ? { ...last.metadata, event_id: last.id } : {}) };
      })(),
      context,
      segment_refs: Object.fromEntries(references.segments),
      source_refs: Object.fromEntries(references.sources),
      reference_scope: "conversation",
      removed_documents: [...documentChanges(events).values()]
        .filter((e) => e.metadata.operation === "remove")
        .map((e) => ({ ...e.metadata, change_id: e.id })),
      context_audit: contextAudit(this.store, conversation, {
        limit: 12,
        kind: "context",
      }),
      state: {
        ...state,
        entries: this.store.describeSegments(conversation, state.entries),
      },
      memory: memoryView(this.store, conversation),
      metrics: { ...harness.metrics(), next_request_input: modelInput.next },
      model_input: modelInput,
      busy: this.busy.has(conversation),
      agent: agentView(this.store, conversation),
      workspace: workspaceFiles(this.store, conversation),
      backup_warning: this.backupWarnings.get(conversation) || null,
    };
  }

  shareableExport(conversation) { return sanitizeExport(this.export(conversation)); }

  export(conversation, inspectedView = null) {
    return this.store.withReadCache(() => {
      const view = inspectedView || this.view(conversation);
      const snapshots = this.store.db.prepare('SELECT revision,receipt_id,segments FROM snapshots WHERE conversation_id=? ORDER BY revision').all(conversation)
        .map((row) => ({ ...row, segments: JSON.parse(row.segments) }));
      return { schema_version: 1, engine: 'conclave', exported_at: new Date().toISOString(), conversation_id: conversation,
        events: this.store.events(conversation), snapshots, context: view.context, state: view.state, memory: view.memory, metrics: view.metrics, model_input: view.model_input };
    });
  }

  audit(conversation, options) {
    this.require(conversation);
    return contextAudit(this.store, conversation, options);
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
