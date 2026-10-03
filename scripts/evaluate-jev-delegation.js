import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { Store } from '../lib/conclave/store.js';
import { Harness } from '../lib/conclave/harness.js';
import { JevProvider } from '../lib/conclave/provider.js';
import { JevDecisionAdapter } from '../lib/conclave/jev.js';
import { documentIngress } from '../lib/conclave/ingress.js';
import { managementEconomics } from '../lib/conclave/economics.js';

// Four bounded Jev calls over synthetic sources. No task-model inference,
// personal history, workspace writes or live database mutations.
if (process.argv.includes('--replay')) {
  const directory = new URL('../.agent-smoke/jev-delegation/', import.meta.url);
  const saved = JSON.parse(readFileSync(new URL('results.json', directory), 'utf8'));
  const adapter = new JevDecisionAdapter({ name: 'typesafe' });
  const cases = [];
  for (const trial of saved.cases.filter(c => c.query)) {
    const request = saved.calls.find(e => e.kind === 'inference_request' && e.content === 'retrieval-reranking' && e.metadata.payload.state.task === trial.query);
    const response = saved.calls.find(e => e.kind === 'inference_response' && e.metadata.request_id === request.id);
    const candidates = trial.decision.assessment.decisions.map((d, i) => ({ id: d.id,
      ...request.metadata.payload.questions[`item_${i}`].instructions.candidate }));
    const result = await adapter.rerank(candidates, trial.query, async () => response.metadata);
    cases.push({ name: trial.name, deterministic_target_in_top_four: trial.deterministic_target_in_top_four,
      prior_gate_target_in_top_four: trial.delegated_target_in_top_four,
      replay_target_in_top_four: result.ids.slice(0, 4).includes(trial.target_event_id),
      replay_target_first: result.ids[0] === trial.target_event_id, result });
  }
  const replay = { date: new Date().toISOString(), basis: 'Offline replay of saved real Jev responses; no new inference; two hand-authored cases', cases };
  writeFileSync(new URL('replay.json', directory), JSON.stringify(replay, null, 2) + '\n');
  console.log(JSON.stringify(replay, null, 2));
  process.exit(0);
}
if (!process.argv.includes('--live')) {
  console.log('Run with --live for four bounded Jev calls over synthetic sources, or --replay to reevaluate saved responses without inference.');
  process.exit(0);
}
const store = new Store(undefined, { memory: true });
const provider = new JevProvider();
const adapter = new JevDecisionAdapter(provider, { budget: 8000, candidates: 6 });
const conversationIds = [];
const results = { date: new Date().toISOString(), kind: 'bounded synthetic live comparison',
  limitations: 'Two retrieval and two ingress cases; not a matched long-task trial or an answer-quality/cost-savings benchmark.',
  deterministic_inference_calls: 0, cases: [] };
try {
  for (const trial of [
    { name: 'recover-original-code', query: 'recovery code', target: 'Confirmed recovery code: orchard-719. Use this value after restart.',
      noise: 'Recovery code discussion: value not present; this draft only discusses how to recover it.' },
    { name: 'recover-corrected-capacity', query: 'capacity correction', target: 'Confirmed capacity correction: 12 seats replaces the earlier estimate of 20. Use 12 for the current plan.',
      noise: 'Capacity correction discussion: awaiting the actual confirmed quantity; do not use this speculative draft as the capacity.' },
  ]) {
    const id = store.create(trial.name), h = new Harness(store, id, { name: 'openai' }, { model: 'gpt-6-luna', budget: 256000, decisionAdapter: adapter });
    conversationIds.push(id);
    const target = h.ingestText('confirmed.md', trial.target);
    for (let i = 0; i < 5; i++) h.ingestText('draft-' + i + '.md', trial.noise);
    const baseline = h.toolResult('search_history', { query: trial.query }, []);
    const selected = await h.executeTool('search_history', { query: trial.query }, []);
    const decision = store.events(id).findLast(e => e.kind === 'retrieval_decision');
    results.cases.push({ name: trial.name, query: trial.query, target_event_id: target.id,
      deterministic_target_in_top_four: baseline.some(e => e.event_id === target.id),
      delegated_target_in_top_four: selected.some(e => e.event_id === target.id),
      delegated_target_first: selected[0]?.event_id === target.id, decision: decision?.metadata,
      economics: managementEconomics(store.events(id), { provider: 'openai', model: 'gpt-6-luna', adapter }) });
  }
  for (const trial of [
    { name: 'classify-reported-constraint', focus: 'capacity constraint', expected: 'constraint',
      text: 'Capacity constraint supplied by the user: keep exactly 12 seats. Venue remains unconfirmed.\n' },
    { name: 'classify-unresolved-choice', focus: 'external transfer decision', expected: 'question',
      text: 'Open question: which outside destination should receive the artifact? No choice has been approved; do not assume a destination.\n' },
  ]) {
    const id = store.create(trial.name), h = new Harness(store, id, { name: 'openai' }, { model: 'gpt-6-luna', budget: 256000, decisionAdapter: adapter });
    conversationIds.push(id);
    h.addMessage('assistant', 'Synthetic task background: preserve source attribution and unresolved choices. '.repeat(1300));
    const content = trial.text + 'Supporting historical detail.\n'.repeat(350);
    const event = await h.ingestDocument('incoming.md', content, trial.focus);
    const decision = store.events(id).findLast(e => e.kind === 'ingress_decision');
    const projection = store.events(id).findLast(e => e.kind === 'context_transform');
    results.cases.push({ name: trial.name, expected_category: trial.expected,
      observed_category: decision.metadata.classification?.category || null,
      deterministic_excerpt_characters: documentIngress(content, trial.focus, projection.metadata.matched ? { offset: projection.metadata.offset } : null).content.length,
      projected_excerpt_characters: projection.metadata.next_offset == null ? content.length - projection.metadata.offset
        : projection.metadata.next_offset - projection.metadata.offset,
      source_exact: store.source(id, event.id).content === content,
      promoted_to_state: store.context(id).segments.some(s => s.state_key), decision: decision.metadata,
      economics: managementEconomics(store.events(id), { provider: 'openai', model: 'gpt-6-luna', adapter }) });
  }
  results.calls = conversationIds.flatMap(id => store.events(id)).filter(e => ['inference_request', 'inference_response', 'decision_rejection'].includes(e.kind));
  results.inference_calls = results.calls.filter(e => e.kind === 'inference_request').length;
  results.known_usd_min = results.cases.reduce((n, c) => n + c.economics.known_total_usd_min, 0);
  results.known_usd_max = results.cases.reduce((n, c) => n + c.economics.known_total_usd_max, 0);
  const directory = new URL('../.agent-smoke/jev-delegation/', import.meta.url);
  mkdirSync(directory, { recursive: true });
  writeFileSync(new URL('results.json', directory), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify({ inference_calls: results.inference_calls, known_usd: [results.known_usd_min, results.known_usd_max],
    cases: results.cases.map(({ name, deterministic_target_in_top_four, delegated_target_in_top_four, observed_category, expected_category }) =>
      ({ name, deterministic_target_in_top_four, delegated_target_in_top_four, observed_category, expected_category })) }, null, 2));
} finally { store.close(); }
