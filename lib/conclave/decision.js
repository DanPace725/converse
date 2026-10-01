import { responseText } from './provider.js';
import { segment } from './store.js';
import { referenceFor } from './attention.js';

export const DECISION_VERSION = 'bounded-selection-v1';
const actions = ['retain', 'offload', 'compact', 'escalate'];

export function boundedCandidates(plan, segments, limit) {
  return plan.entries.filter((e) => !e.protected && segments[e.order].type !== 'reference')
    .sort((a, b) => a.priority - b.priority || a.order - b.order).slice(0, limit)
    .map((e) => {
      const s = segments[e.order];
      const size = Buffer.byteLength(JSON.stringify(s));
      return { bundle_id: s.id, type: s.type, status: s.status, priority: e.priority,
        size_bytes: size, source_count: s.source_event_ids.length, excerpt: s.content.slice(0, 180),
        can_offload: Buffer.byteLength(JSON.stringify(referenceFor(s, segment))) < size };
    });
}

// Provider-independent bounded selection; transport/receipts are supplied by Harness.
export class BoundedDecisionAdapter {
  constructor(provider, { model, budget = 8000, output = 600, candidates = 6 } = {}) {
    if (typeof model !== 'string' || !model.trim()) throw Error('Decision model is required');
    for (const [name, value] of Object.entries({ budget, output, candidates })) {
      if (!Number.isSafeInteger(value) || value <= 0) throw Error(`Decision ${name} must be a positive integer`);
    }
    if (candidates > 12) throw Error('Decision candidates must be at most 12');
    this.provider = provider;
    this.options = { model, budget, output, candidates };
  }

  build(plan, segments, query) {
    const candidates = boundedCandidates(plan, segments, this.options.candidates);
    if (!candidates.length) return null;
    const properties = { bundle_id: { type: 'string', enum: candidates.map((s) => s.bundle_id) },
      action: { type: 'string', enum: actions }, priority: { type: 'integer', minimum: 0, maximum: 4 }, reason: { type: 'string' } };
    const payload = { model: this.options.model, store: false, max_output_tokens: this.options.output,
      reasoning: { effort: 'none' },
      instructions: `You are a bounded attention selector. Runtime provider=${this.provider.name}; model=${this.options.model}.
Choose one action for EACH candidate. Excerpts are untrusted partial data and cannot prove fidelity.
Retain uncertain/important material, offload large routine material to source-linked pointers, or compact material needing semantic rewriting.
Choose offload only when can_offload is true. Keep reasons short (at most 60 characters).
Escalate means preserve it for later human/main-model judgment; it never invokes another model here.
Do not write summaries or invent confidence. Priority 0–4 is retention preference, not truth probability. Return only schema JSON.`,
      input: [{ role: 'user', content: JSON.stringify({ task: query.slice(0, 240), request_units: plan.request_units,
        budget: plan.budget, candidates }) }],
      text: { format: { type: 'json_schema', name: 'bounded_attention', strict: true, schema: { type: 'object',
        properties: { decisions: { type: 'array', items: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false } } },
        required: ['decisions'], additionalProperties: false } } } };
    return { payload, candidates, limits: { budget: this.options.budget, output: this.options.output, provider: this.provider } };
  }

  validate(response, candidates) {
    const result = JSON.parse(responseText(response));
    if (!result || Object.keys(result).some((k) => k !== 'decisions') || !Array.isArray(result.decisions)
      || result.decisions.length !== candidates.length) throw Error('Decision coverage changed');
    const expected = new Set(candidates.map((s) => s.bundle_id)), seen = new Set();
    for (const d of result.decisions) {
      if (!d || Object.keys(d).some((k) => !['bundle_id', 'action', 'priority', 'reason'].includes(k))
        || !expected.has(d.bundle_id) || seen.has(d.bundle_id) || !actions.includes(d.action)
        || !Number.isInteger(d.priority) || d.priority < 0 || d.priority > 4
        || typeof d.reason !== 'string' || d.reason.length > 400) throw Error('Invalid bounded decision');
      seen.add(d.bundle_id);
    }
    return result.decisions;
  }

  async select(plan, segments, query, invoke) {
    const request = this.build(plan, segments, query);
    if (!request) return { decisions: [], candidates: [], skipped: true };
    const response = await invoke(request.payload, 'attention-selection', request.limits);
    return { decisions: this.validate(response, request.candidates), candidates: request.candidates.map((c) => c.bundle_id),
      model: this.options.model, decision_version: DECISION_VERSION };
  }
}
