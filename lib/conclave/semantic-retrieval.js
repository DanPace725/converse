import { embeddingKey, validVector, EMBEDDING_MODEL, EMBEDDING_POLICY } from './embeddings.js';
import { removedSources } from './documents.js';
import { memoryView, suppressedMemorySources } from './memory.js';
import { redact } from './provider.js';

// Semantic scores affect selection only, never capture, correction, or authority.
export function retrievalCatalog(store, conversation) {
  const events = store.events(conversation);
  const excluded = removedSources(events);
  for (const id of suppressedMemorySources(store, conversation)) excluded.add(id);
  const files = new Map(events.filter(e => e.kind === 'document' && e.metadata.workspace_path).map(e => [e.metadata.workspace_path, e.id]));
  for (const e of events) {
    if (e.metadata.revises_event_id) excluded.add(e.metadata.revises_event_id);
    if (e.metadata.workspace_path && files.get(e.metadata.workspace_path) !== e.id) excluded.add(e.id);
  }
  const objective = events.findLast(e => e.kind === 'user' && !e.metadata.purpose?.startsWith('manual-'));
  const memories = memoryView(store, conversation).records.filter(r => !['superseded', 'suppressed', 'invalidated', 'dormant'].includes(r.lifecycle)
    && (!r.scope.objective_id || objective?.metadata.purpose === 'agent-objective' && r.scope.objective_id === objective.id));
  const memoryItems = memories.map(r => ({ kind: 'memory', entity_id: r.memory_id, event_id: r.source_refs.at(-1).event_id,
    offset: 0, end_offset: r.content.length, content: r.content, version: r.version }));
  const sources = store.db.prepare(`SELECT c.*,e.seq,e.kind AS source_kind FROM source_chunks c
    JOIN events e ON e.id=c.event_id WHERE c.conversation_id=? ORDER BY e.seq DESC,c.offset`).all(conversation)
    .filter(r => !excluded.has(r.event_id)).map(r => ({ ...r, kind: 'source', entity_id: r.event_id }));
  const items = [...memoryItems, ...sources].filter(r => r.content.trim()).map(r => ({ ...r,
    content_hash: embeddingKey(r.content), key: embeddingKey([EMBEDDING_MODEL, EMBEDDING_POLICY, r.kind, r.entity_id,
      r.version || r.event_id, r.offset, r.end_offset, r.content]) }));
  return { items, excluded, memoryIds: new Set(memories.map(r => r.memory_id)) };
}

export class SemanticRetrieval {
  constructor(backend, providerFactory) { this.backend = backend; this.providerFactory = providerFactory; }

  async matches(h, query, kind) {
    const state = h.embeddingState ||= { calls: 0, indexed: 0, queries: new Map(), disabled: false };
    if (state.disabled || !String(query).trim()) return [];
    const started = Date.now();
    try {
      h.options.signal?.throwIfAborted();
      const catalog = retrievalCatalog(h.store, h.conversation), current = new Map(catalog.items.map(r => [r.key, r]));
      if (!catalog.items.some(r => r.kind === kind)) return [];
      const queryText = String(query).slice(0, 1024), queryKey = embeddingKey(queryText);
      let vector = state.queries.get(queryKey);
      const keys = await this.backend.keys(h.conversation);
      const pending = catalog.items.filter(r => !keys.has(r.key));
      const batch = pending.slice(0, Math.max(0, 32 - state.indexed));
      const input = [...batch.map(r => r.content), ...(!vector ? [queryText] : [])];
      if (input.length && state.calls < 3) {
        // A UTF-8 byte reserve is deliberately conservative and distinct from native usage.
        const reserve = input.reduce((n, text) => n + Buffer.byteLength(text), 0);
        if (h.options.embeddingAllowance && reserve > h.options.embeddingAllowance()) return [];
        const provider = this.providerFactory();
        await h.store.flush?.(); // Source and memory IDs must exist before the persistent index.
        const request = h.store.append(h.conversation, 'embedding_request', 'Semantic retrieval', {
          provider: 'openai', model: EMBEDDING_MODEL, policy: EMBEDDING_POLICY, batch_size: batch.length,
          query_hash: queryKey, reserved_input_tokens: reserve, reserve_method: 'utf8-byte-upper-bound', run_id: h.options.run_id || null,
        });
        await h.store.flush?.();
        state.calls++;
        let response;
        try {
          response = await provider.embed(input, { signal: AbortSignal.any([
            AbortSignal.timeout(8000), ...(h.options.signal ? [h.options.signal] : []),
            ...(h.options.pageDeadline ? [AbortSignal.timeout(Math.max(1, h.options.pageDeadline() - Date.now()))] : []),
          ]) });
          if (response.model !== EMBEDDING_MODEL || response.vectors?.length !== input.length || !response.vectors.every(validVector)
            || !Number.isSafeInteger(response.usage?.input_tokens) || response.usage.input_tokens < 0)
            throw Error('Invalid embedding response or missing usage');
          h.store.append(h.conversation, 'embedding_response', 'Semantic retrieval', {
            request_id: request.id, provider: 'openai', model: EMBEDDING_MODEL, usage: response.usage,
            status: 'completed', elapsed_ms: Date.now() - started,
          });
        } catch (error) {
          h.store.append(h.conversation, 'embedding_response', 'Semantic retrieval', {
            request_id: request.id, provider: 'openai', model: EMBEDDING_MODEL, usage: null,
            status: 'failed', error: redact(error), elapsed_ms: Date.now() - started,
          });
          throw error;
        }
        // Usage is retained even when cancellation or index persistence fails after payment.
        h.options.signal?.throwIfAborted();
        await this.backend.put(h.conversation, batch.map((r, i) => ({ ...r, vector: response.vectors[i] })));
        state.indexed += batch.length;
        if (!vector) {
          vector = response.vectors.at(-1);
          state.queries.set(queryKey, vector);
        }
        h.store.append(h.conversation, 'embedding_index', 'Bounded incremental index', {
          provider: 'openai', model: EMBEDDING_MODEL, indexed: batch.length, pending: pending.length - batch.length,
          policy: EMBEDDING_POLICY, scope: 'conversation', elapsed_ms: Date.now() - started,
        });
      }
      if (!vector) return [];
      const nearest = await this.backend.nearest(h.conversation, vector, kind, catalog, 20);
      return nearest.filter(r => current.has(r.key) && Number.isFinite(r.similarity) && r.similarity >= 0.3)
        .map(r => ({ ...current.get(r.key), similarity: r.similarity }));
    } catch (error) {
      if (h.options.signal?.aborted) throw error;
      state.disabled = true; // One failure per inference request; no repeated paid retries in the tool loop.
      h.store.append(h.conversation, 'embedding_failure', 'Lexical retrieval fallback', {
        provider: 'openai', model: EMBEDDING_MODEL, error: redact(error), elapsed_ms: Date.now() - started,
      });
      return [];
    }
  }
}

export function hybridChunks(lexical, semantic, limit = 6) {
  const merged = new Map();
  for (const [list, channel] of [[lexical, 'lexical'], [semantic, 'semantic']]) list.forEach((item, i) => {
    const id = item.event_id;
    const current = merged.get(id) || { ...item, matches: item.matches || 0, score: 0, channels: [] };
    current.score += 1 / (60 + i + 1);
    current.channels.push(channel);
    // A shared source can have a better semantic passage than its keyword passage.
    if (channel === 'semantic') { current.similarity = item.similarity; if (!current.matches) Object.assign(current, item); }
    merged.set(id, current);
  });
  return [...merged.values()].sort((a, b) => b.score - a.score || b.matches - a.matches).slice(0, limit);
}

export function embeddingUsage(events) {
  const responses = new Map(events.filter(e => e.kind === 'embedding_response').map(e => [e.metadata.request_id, e]));
  const requests = events.filter(e => e.kind === 'embedding_request');
  return { calls: requests.length, input_tokens: requests.reduce((n, e) => n + (responses.get(e.id)?.metadata.usage?.input_tokens || 0), 0),
    usage_complete: requests.every(e => Number.isSafeInteger(responses.get(e.id)?.metadata.usage?.input_tokens)),
    reserved_unknown_tokens: requests.reduce((n, e) => n + (Number.isSafeInteger(responses.get(e.id)?.metadata.usage?.input_tokens)
      ? 0 : e.metadata.reserved_input_tokens), 0), provider: 'openai', model: EMBEDDING_MODEL };
}
