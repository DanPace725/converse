// Bounded whole-passage extraction. Item IDs remain source-local across batches.
import { extractionPayload, parseExtraction } from './memory-extractor.js';
import { responseText, redact } from './provider.js';

export async function extractPassages(h, event, heads, passages, { purpose = 'memory-extraction' } = {}) {
  const build = list => extractionPayload(event, heads, h.options.model, h.provider.name, list);
  const fits = list => Buffer.byteLength(JSON.stringify(build(list))) + 600 <= 12000;
  const batches = []; let batch = [];
  for (const passage of passages) {
    if (!fits([passage])) throw Error('Memory extraction deferred: a complete passage exceeds the request allowance.');
    if (!fits([...batch, passage])) { batches.push(batch); batch = []; }
    batch.push(passage);
  }
  if (batch.length) batches.push(batch);
  if (batches.length > 8) throw Error('Memory extraction deferred: complete coverage exceeds eight batches.');
  const records = [], calls = []; let invalid = 0;
  for (const items of batches) {
    h.options.signal?.throwIfAborted();
    const started = Date.now();
    const response = await h.call(build(items), purpose, { budget: 12000, output: 600, signal: AbortSignal.timeout(15000) });
    const parsed = parseExtraction(responseText(response), items);
    invalid += parsed.invalid; records.push(...parsed.records);
    calls.push({ passage_ids: items.map(p => p.passage_id), request_id: h.lastRequestId,
      elapsed_ms: Date.now() - started, model: response.model || h.options.model, usage: response.usage || null });
  }
  return { records: records.slice(0, 8), invalid, calls };
}

// Direct evaluation: no task-model fallback, including on provider failure.
export async function jevPassages(h, event, heads, passages) {
  if (!passages.length) return { records: [], calls: [], invalid: 0, jev: null, deferred_passage_ids: [], selector: 'jev' };
  if (!h.decisionAdapter?.selectMemory) throw Error('Jev memory selection unavailable: enable Jev and configure its provider.');
  const jev = await h.decisionAdapter.selectMemory(passages, { source_kind: event.kind, related: heads.slice(0, 4), max_calls: 2 }, h.call.bind(h));
  return { records: jev.records, calls: [], invalid: 0, jev, selector: 'jev',
    deferred_passage_ids: [...jev.oversized, ...(jev.deferred || []), ...jev.decisions.filter(d => d.uncertain && !d.duplicate).map(d => d.passage_id)] };
}

export async function hybridPassages(h, event, heads, passages) {
  let jev = null, error = null;
  try {
    jev = await h.decisionAdapter.selectMemory(passages, { source_kind: event.kind, related: heads.slice(0, 4) }, h.call.bind(h));
  } catch (e) {
    if (h.options.signal?.aborted || e.agent_status) throw e;
    error = redact(e);
  }
  const pending = jev ? new Set([...jev.oversized, ...jev.decisions.filter(d => d.uncertain && !d.duplicate).map(d => d.passage_id)])
    : new Set(passages.map(p => p.passage_id));
  const fallback = passages.filter(p => pending.has(p.passage_id));
  const llm = await extractPassages(h, event, heads, fallback);
  const decisions = new Map(jev?.decisions.map(d => [d.passage_id, d]) || []);
  // A global cap, exact duplicates and stable ordering apply after merging.
  const normalized = text => text.toLowerCase().replace(/\s+/g, ' ').trim();
  const saved = new Set(heads.map(r => normalized(r.content))), byId = new Map(passages.map(p => [p.passage_id, p]));
  const records = [...(jev?.records || []), ...llm.records].filter(r => !saved.has(normalized(byId.get(r.passage_id).content)))
    .sort((a, b) => (decisions.get(b.passage_id)?.keep_probability ?? 1) - (decisions.get(a.passage_id)?.keep_probability ?? 1)
      || a.passage_id - b.passage_id).slice(0, 8).sort((a, b) => a.passage_id - b.passage_id);
  return { ...llm, records, jev, error, fallback_passage_ids: [...pending], selector: 'jev-hybrid' };
}
