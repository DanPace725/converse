import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { conversationCosts } from './lib/costs.js';
import { prices } from './report-costs.js';

const usd=n=>n==null?'unknown':'$'+n.toFixed(6);
const range=r=>`${usd(r.min)}–${usd(r.max)}`;
function metrics(record,calls) {
  const requests=new Map(record.context_layer.events.filter(e=>e.kind==='inference_request').map(e=>[e.id,e]));
  const responses=new Map(record.context_layer.events.filter(e=>e.kind==='inference_response').map(e=>[e.metadata.request_id,e]));
  return {calls:calls.length,answer_calls:calls.filter(c=>c.purpose==='answer').length,
    management_calls:calls.filter(c=>c.purpose==='attention-selection'||c.purpose.includes('compaction')).length,
    priced:calls.filter(c=>c.usd_min!=null).length,unknown:calls.filter(c=>c.usd_min==null).length,
    min:calls.reduce((n,c)=>n+(c.usd_min||0),0),max:calls.reduce((n,c)=>n+(c.usd_max||0),0),
    input:calls.reduce((n,c)=>n+(c.counts?.input||0),0),output:calls.reduce((n,c)=>n+(c.counts?.output||0),0),
    cache_reads:calls.reduce((n,c)=>n+(c.counts?.read||0),0),cache_writes:calls.reduce((n,c)=>n+(c.counts?.write||0),0),
    peak_input:Math.max(0,...calls.map(c=>c.counts?.input||0)),
    peak_bytes:Math.max(0,...calls.map(c=>requests.get(c.request_id)?.metadata.input_size?.bytes||0)),
    output_limit_calls:calls.filter(c=>c.status==='incomplete').length,
    recorded_latency_ms:calls.reduce((n,c)=>n+(responses.get(c.request_id)?.metadata.elapsed_ms||0),0)};
}
export function compareBaseline(folder) {
  folder=resolve(folder);
  const ledger=JSON.parse(readFileSync(join(folder,'ledger.json'))),recipe=JSON.parse(readFileSync(join(folder,'recipe.json')));
  const original=JSON.parse(readFileSync(ledger.source)),baseline=JSON.parse(readFileSync(join(folder,'baseline-export.json')));
  const originalCost=conversationCosts(original,prices),baselineCost=conversationCosts(baseline,prices);
  const blockedIds=new Set(baseline.context_layer.events.filter(e=>e.kind==='baseline_preflight_block'||
    (e.kind==='inference_failure'&&/^Next conservative reservation would exceed the authorized/.test(e.content))).map(e=>e.metadata.request_id));
  baselineCost.calls=baselineCost.calls.filter(c=>!blockedIds.has(c.request_id));
  const sourceEvents=original.context_layer.events;
  const runs=[...new Map(sourceEvents.filter(e=>e.kind==='agent_checkpoint').map(e=>[e.metadata.state.run_id,e.metadata.state])).values()];
  const referenceIds=new Set(recipe.turns.map(t=>t.reference_successful_user_id));
  const selectedRuns=runs.filter(s=>s.status==='completed'&&referenceIds.has(s.user_event_id));
  const runIds=new Set(selectedRuns.map(s=>s.run_id));
  const requests=new Map(sourceEvents.filter(e=>e.kind==='inference_request').map(e=>[e.id,e]));
  const successfulCalls=originalCost.calls.filter(c=>runIds.has(requests.get(c.request_id)?.metadata.run_id));
  const successful=metrics(original,successfulCalls),all=metrics(original,originalCost.calls),fresh=metrics(baseline,baselineCost.calls);
  const completed=ledger.turns.filter(t=>t.status==='completed');
  const completedRunIds=new Set(completed.map(t=>t.run_id));
  const matchedSourceIds=new Set(completed.map(t=>recipe.turns[t.turn-1].reference_successful_user_id));
  const matchedRunIds=new Set(selectedRuns.filter(s=>matchedSourceIds.has(s.user_event_id)).map(s=>s.run_id));
  const baselineRequests=new Map(baseline.context_layer.events.filter(e=>e.kind==='inference_request').map(e=>[e.id,e]));
  const matchedOriginal=metrics(original,originalCost.calls.filter(c=>matchedRunIds.has(requests.get(c.request_id)?.metadata.run_id)));
  const matchedBaseline=metrics(baseline,baselineCost.calls.filter(c=>completedRunIds.has(baselineRequests.get(c.request_id)?.metadata.run_id)));
  const perTurn=recipe.turns.map((_,index)=> {
    const t=ledger.turns.find(t=>t.turn===index+1)||{turn:index+1,model:recipe.turns[index].settings.model,status:'not_started',steps:0};
    const calls=baselineCost.calls.filter(c=>baseline.context_layer.events.find(e=>e.id===c.request_id)?.metadata.run_id===t.run_id);
    const sourceRun=selectedRuns.find(s=>s.user_event_id===recipe.turns[t.turn-1].reference_successful_user_id);
    const sourceCalls=originalCost.calls.filter(c=>requests.get(c.request_id)?.metadata.run_id===sourceRun?.run_id);
    return {turn:t.turn,provider:t.provider,model:t.model,status:t.status,steps:t.steps,elapsed_ms:t.elapsed_ms,
      baseline:metrics(baseline,calls),historical_success:metrics(original,sourceCalls)};
  });
  const documents=new Map();
  for(const e of baseline.context_layer.events.filter(e=>e.kind==='document'&&e.metadata.workspace_path))documents.set(e.metadata.workspace_path,e);
  const files=[...documents].map(([path,e])=>({path,characters:e.content.length,actor:e.actor,
    reads:baseline.context_layer.events.filter(r=>r.kind==='workspace_read'&&r.metadata.source_event_id===e.id).length}));
  const data={generated_at:new Date().toISOString(),protocol:ledger.protocol,status:ledger.status,cap_usd:ledger.cap_usd,
    resumptions:ledger.resumptions||[],
    conservative_debit_usd:ledger.debited_usd,source:ledger.source,source_sha256:ledger.source_sha256,
    historical_all:all,historical_successful_runs:successful,baseline:fresh,
    matched_completed_turns:completed.length,matched_historical:matchedOriginal,matched_baseline:matchedBaseline,turns:perTurn,files,
    limitations:['Historical successful runs may include context produced during earlier failed attempts',
      'New generations, artifacts and tool trajectories differ; this is not an isolated causal comparison',
      'Baseline uses fewer tools and different context instructions; output settings and user uploads match',
      'The baseline paused at the initial spending cap; cache expiry during that pause can affect its recorded cost',
      'Baseline byte/time guards are more permissive; provider pricing tier and unknown historical timeout usage remain unresolved',
      'Source and baseline token counters, caching and model output lengths must be evaluated before claiming context savings']};
  writeFileSync(join(folder,'comparison.json'),JSON.stringify(data,null,2));
  const rows=[['Submitted calls','calls'],['Task-model calls','answer_calls'],['Management calls','management_calls'],
    ['Known input tokens','input'],['Known output tokens','output'],['Cache-read tokens','cache_reads'],['Cache-write tokens','cache_writes'],
    ['Largest reported input','peak_input'],['Largest serialized native input (bytes)','peak_bytes'],['Output-limit responses','output_limit_calls'],['Calls with unknown usage','unknown']];
  const text=`# Full-history baseline comparison\n\nStatus: **${ledger.status}**. Spending cap: ${ledger.cap_usd==null?'removed by user authorization':'$'+ledger.cap_usd}; conservative ledger debit: ${usd(ledger.debited_usd)}. Five original substantive prompts were scheduled with the same model order, effort, 16,384-token output allowance and two exact user uploads. Retry-only prompts were omitted. All artifacts remain local.\n\n`
    +`Matched completed turns: **${completed.length} of 5**. The table compares only those same completed workload turns.\n\n| Metric | Matched historical successful turns | Matched fresh baseline turns |\n|---|---:|---:|\n`
    +rows.map(([label,key])=>`| ${label} | ${matchedOriginal[key].toLocaleString()} | ${matchedBaseline[key].toLocaleString()} |`).join('\n')
    +`\n| Known public-rate valuation | ${range(matchedOriginal)} | ${range(matchedBaseline)} |\n\nThe baseline's entire recorded run, including any partial turn, values at **${range(fresh)}**. All five historical successful runs value at ${range(successful)}.\n\n`
    +`The original whole conversation, including failures and its title call, values at ${range(all)} plus unknown timeout usage. Historical successful runs are not a clean failure-free control: they could use preparatory state or workspace actions from failed attempts. Missing usage is excluded from known valuation, not charged as zero.\n\n`
    +`The fresh baseline recorded ${fresh.output_limit_calls} response(s) that exhausted the unchanged output allowance. Their reported usage is included in cost; tools from incomplete responses did not execute. Continuations use saved responses and explicit skipped-tool receipts, rather than replaying completed requests.\n\n`
    +`| Turn | Model | Baseline outcome / steps | Historical successful USD | Baseline USD |\n|---:|---|---|---:|---:|\n`
    +perTurn.map(t=>`| ${t.turn} | ${t.model} | ${t.status} / ${t.steps} | ${range(t.historical_success)} | ${range(t.baseline)} |`).join('\n')
    +`\n\n## What this comparison measures\n\nThe baseline sends complete user/final assistant history and prior tool arguments/results, and retains all native tool exchanges within each turn. It does not select context, run Jev, compact, offload, maintain named state, or use a bounded handoff. It shares workspace and arithmetic execution so those capabilities stay available. Private reasoning is not forwarded between different models. The baseline's SQLite source/segment indexes are audit storage, not a Conclave working projection sent to the model; their text-size ratios must not be called savings.\n\n`
    +`This compares two freely generated trajectories. A lower cost could reflect less reasoning, shorter documents, fewer tools or calls, cache behavior, or different quality. A larger input alone does not establish more expensive billing. Exact original answers, state, and artifacts were not seeded into the baseline. The baseline paused at the initial spending cap; cache expiry during that pause can affect its recorded cost. See [PROTOCOL.md](PROTOCOL.md) and [recipe.json](recipe.json) for all changes.\n\n`
    +`## Saved workspace artifacts\n\n| File | Characters | Writer | Recorded reads of latest version |\n|---|---:|---|---:|\n`
    +files.map(f=>`| [${f.path}](artifacts/${f.path}) | ${f.characters.toLocaleString()} | ${f.actor} | ${f.reads} |`).join('\n')
    +`\n\nReadbacks establish complete inspection under the shared workspace checks, not independent factual validation. Further comparison should inspect numerical assumptions, uncertainty, attribution, preserved constraints, use of the source packet and the final localized plan.\n\n[ledger.json](ledger.json) records reservations and latencies; [baseline-export.json](baseline-export.json) preserves complete requests, responses and tools. [costs.json](costs.json) contains per-call valuation. Public pricing references: [OpenAI](https://developers.openai.com/api/docs/pricing), [Claude](https://platform.claude.com/docs/en/about-claude/pricing), [Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev).\n`;
  writeFileSync(join(folder,'comparison.md'),text);
  const costPath=join(folder,'request-costs.md');
  writeFileSync(costPath,readFileSync(costPath,'utf8').replace(/^Working context:.*\n\n/m,
    'Baseline uses full transcript and tool history; no managed working projection or text-reduction claim applies. Spending preflight blocks were not submitted as paid generations and are excluded from call totals.\n\n'));
  return data;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const data=compareBaseline(process.argv[2]);
 console.log(JSON.stringify({status:data.status,historical_success:data.historical_successful_runs,baseline:data.baseline,files:data.files},null,2));
}
