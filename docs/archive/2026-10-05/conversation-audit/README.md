# Context, memory, Jev and JSON export audit

Reviewed October 5, 2026. The Brain conversation was recorded October 4; Pain was recorded October 5. Findings refer to the supplied exports, not to a new live trial or independently verified scientific claims.

The systems preserve useful context and audit history, but these conversations do **not** demonstrate optimal automatic memory, retrieval, or Jev use. The largest weakness is continuation handoff losing newly retrieved text and provoking rereading. Export latency is a separate, reproduced implementation problem; it has been fixed locally.

## Observed results

| Measure | Brain | Pain |
|---|---:|---:|
| Human requests | 9 | 10 |
| Completed / failed / stopped | 9 / 0 / 0 | 7 / 2 / 1 |
| Answer dispatches | 32 | 85 |
| Automatic memory entries | 0 | 1 |
| Named state entries | 10 | 8 |
| Paid memory extraction calls | 0 | 0 |
| Jev attempts / responses | 0 / 0 | 18 / 17 |
| Jev changes to logged retrieval order | 0 | 0 |
| Embedding failures | 0 | 26 |
| Large fresh retrievals missing direct output in the next answer request | 0 | 35 |
| Continuation restarts | 0 | 26 |
| Shadow evaluations complete / unavailable | 5 / 4 | 8 / 19 |
| Comparable forecast reconciliations | 5 / 32 | 7 / 84 |
| Final working text / source-history text | 47,787 / 685,468 chars | 20,431 / 364,169 chars |

The final text reductions (93.0% and 94.4%) are real saved-projection measurements. They are **not** evidence of matching token or dollar savings. Canonical source history includes documents and reasoning; exported audit bytes also include repeated requests and checkpoints.

## What worked

- Named state retained source lineage, qualifications, assistant attribution and unresolved questions. Brain's `scale_arithmetic` retains the conversation's correction of the 1,000× volume error; `timeline_estimates` remains unresolved. This verifies preservation of the correction, not the independent correctness of the underlying neuroscience claims.
- Pain's synthesis preserves the distinction between conceptual corpus overlap and empirical evidence about gendered endurance norms. Both workspace documents were saved and read back. The final requested offload/context edit reduced its working text from approximately 49,772 to 20,431 characters.
- The source originals, snapshots, provider receipts, failures and unresolved work remain inspectable. The confidence gates retained deterministic ordering when Jev was uncertain, rather than treating selection priority as factual truth.
- Stop and failure history are present. Pain's missing final response on request 7 is an explicit stopped Agent checkpoint (seq 864), not an unexplained missing answer.

## Weaknesses and oversights

### 1. Fresh evidence is lost during Claude restarts

Pain repeats the same four document reads at offset zero 22–23 times each. There are 120 `retrieve_event` calls and 41 `search_history` calls in total. These are not ordinary pagination: the arguments repeat exactly.

`Harness.projectAnswer()` starts a fresh Claude chain when old page receipts would shrink by at least 8,000 bytes. Its replacement `continuationHandoff()` retains only the first 800 characters of each of the last eight tool receipts. Newly returned results are included in that truncation even when the answering model has not yet observed them. This can leave little actual document text after the attribution/header.

For example, receipt seq 282 returns 16,000 characters from E48; restart seq 284 precedes request seq 285, which receives a handoff instead of that direct output. Reasoning seq 288 then says it needs to actually read the fetched documents because the results were truncated. Similar cases recur. The machine audit lists 35 receipt/next-request pairs; they count missing direct delivery, not complete absence of every excerpt or proof that every restart caused a loop.

**Priority repair:** distinguish observed historical receipts from fresh results. Restart the signed chain while retaining exact new observations; page only when required by the byte guard. Add a replay that requires grounding a synthesis in a newly returned passage across a restart. Repeated identical reads should produce an explicit progress warning or source-specific recovery path.

### 2. Jev spends time without improving the shortlist here

All 17 completed assessments fall back. Across 102 candidate judgments, 86 are uncertain; the 16 confident judgments are all `irrelevant`. There are no confident `useful` or `direct` judgments, so the current gate appropriately declines to reorder anything. All 41 retrieval decisions preserve deterministic selection; no cache hits are logged. One additional reranking attempt fails with a connection timeout.

Completed Jev calls report 28,907 input and 4,960 output tokens and 25.805 seconds of accumulated call latency. Their known valuation is only $0.001214 using the repository's **October 2 rate snapshot**; the failed attempt is unpriced. The main observed cost is latency and continuing expensive answer-model loops, not Jev's token price.

The delegation economics compares Jev with a hypothetical extra task-model judgment using a fixed recovery-size assumption. It does not measure benefit over the free deterministic baseline, source recovery, or useful completion. Broad queries and excerpts drawn from repeated assistant reasoning can reward the wrong candidates; seq 1115 returns reasoning about the Family document, rather than that document's relevant content.

**Priority repair:** repair candidate quality and fresh delivery first. Evaluate source-first/document-specific shortlists, diversify duplicate chunks, and record actual recovered passages and completion. Add a bounded fallback cooldown keyed to source/query/adapter identity so repeated low-confidence calls do not recur through minor query rewording. Preserve the confidence gate; lowering it alone would manufacture apparent activity without establishing quality.

### 3. Automatic memory is much narrower than the apparent product promise

The automatic ledger captures exact human commitments and narrowly triggered candidates from the **new human message**. It does not continuously consolidate assistant discoveries or tool evidence. The trigger vocabulary also excludes the plain word `memory`; neither “save relevant pieces to the memory” nor Brain's “pick out the things ... saved in the memory” invokes paid candidate extraction. Both exports show zero extraction calls.

Brain's empty automatic ledger therefore fits the implemented narrow policy. Its ten useful notes appear only after the answering assistant explicitly writes named state. Pain's sole automatic entry is the opening instruction to explore other models' opinions. It is accurate but low-value compared with the actual intellectual state of the discussion. “Capture completed” and “useful memory saved” are different claims.

**Priority repair:** expose these distinctions in UI/reporting and measure semantic coverage after topic changes. If broader automatic consolidation is desired, add bounded, provenance-preserving candidate capture from completed episodes; keep assistant hypotheses separate from human commitments. These exports do not exercise correction/suppression lifecycle or cross-chat retrieval and cannot validate them.

### 4. Semantic retrieval is unavailable in the Pain run

All 26 failures occur while querying `conclave.embeddings` keys. No embedding inference usage is recorded. Failure receipts account for 26.937 seconds in aggregate and retrieval falls back to lexical search. The exported error does not include the underlying PostgreSQL cause; a missing/unmigrated table is a plausible lead given the documented deployment gap, not a verified diagnosis. Brain records no embedding calls or failures; that is also not proof of successful semantic retrieval.

**Priority repair:** verify the hosted migration and preserve the database error code/cause safely. Detect persistent configuration failure once per session instead of rediscovering it at each newly hydrated request; make degraded retrieval visible. No production migration or credential change was attempted in this audit.

### 5. The cost controller cannot establish useful optimization yet

All 33 periodic reviews across the two exports return `not_needed`. These are local timing checks, not paid Jev attention decisions. Paid attention-selection and compaction calls are zero. The automatic byte guard correctly keeps its distinct role; peaks are 79.2% for Brain and 65.9% for Pain, with output reserve included.

Shadow pricing is intentionally advisory. In Pain, 19/27 evaluations are unavailable, with 14 failing at history loading. Full audit decoding can consume the 200 ms allowance before candidate pricing begins. Only 12/116 forecast reconciliations across both runs are comparable. Fail-open answers are desirable, but they do not demonstrate that the optimization controller is contributing useful decisions.

**Priority repair:** read/index only decision-relevant event metadata for controller evaluation and cache immutable history across a bounded operation. Calibrate summary/recovery costs and add a longer horizon only through matched completion trials. Do not automatically enable cost-triggered mutation from these data.

### 6. Source fidelity can fail even when the source was delivered

Pain's final `corpus_family_relational_field_partial` says actual text “was not returned or inspected.” But receipt seq 1143 and answer request seq 1146 contain the first 16,000 characters of E56. The later request seq 1156 archives that previously observed output; state update seq 1161 then replaces the partial note with the inaccurate no-text claim.

The full 94,129-character document was not reviewed in that step, so “full review pending” is justified. “No actual text returned” is not. The memory system faithfully stores an assistant's mistaken self-report; source links alone do not verify entailment. A related wording overstatement occurs in Brain's seq 313: “They don't lose anything” confuses recoverable originals with a lossless summary.

**Priority repair:** track delivered source ranges explicitly and use them when validating read-status claims. Evaluate both corrected-decision preservation and whether saved notes overstate or understate what was inspected.

## Export repair and evidence

| Offline replay, same canonical records | Before | After |
|---|---:|---:|
| Pain: hydrate + build + compact serialize | 28.424 s | 1.468 s |
| Pain: build only | 27.282 s | 0.337 s |
| Pain: full history decodes | 85 | 1 |
| Brain: hydrate + build + compact serialize | 3.680 s | 0.315 s |
| Brain: full history decodes | 77 | 1 |

The download now wraps its synchronous construction in an existing scoped read cache and reuses the inspection view inside `service.export()`. Standalone engine export uses the same cache. HTTP downloads use compact JSON. Canonical events and snapshots, including original native payloads, are byte-equivalent after JSON serialization; memory/state/metrics/model-input fields remain available. Cache cleanup is tested after success and failure, and later writes appear in subsequent exports.

These timings are local Windows replays, not production button-to-file times. The complete Pain download still carries about 60.5 MB of compact JSON, so cold database reads and network transfer matter. The current route buffers the assembled JSON before chunked transfer; truly incremental database-to-download streaming and a compressed archive format remain future improvements. The supplied exports were preserved at their original paths.

## Reporting changes and reproduction

`scripts/conclave_report.py` now distinguishes all Jev purposes/attempts/responses, automatic and named memory, capture/activation coverage, embedding failure, shadow health, forecast comparability, stopped Agents, repeated retrieval, and fresh-output delivery. It correctly finds split working-context messages after a memory prefix, keeps delegate byte guards separate, and excludes web search from management input. Rough append comparisons remain explicitly heuristic and are not evidence of billed savings.

It supports explicit `--files`, `--output-dir`, `--no-move`, `--json`, and `--skip-costs`. The workspace-root `conclave_report.py` delegates to this implementation so the copies cannot drift.

From the Converse repository:

```powershell
python scripts/conclave_report.py --files 'docs/conversations/Pain, Gender, and Cultural Endurance Norms_2026-10-05T17-14-57-731Z.json' 'docs/conversations/Timeline for Mapping the Human Brain_2026-10-05T17-15-21-185Z.json' --output-dir docs/archive/2026-10-05/conversation-audit --json --skip-costs
node docs/archive/2026-10-05/conversation-audit/value-exports.mjs 'docs/conversations/Pain, Gender, and Cultural Endurance Norms_2026-10-05T17-14-57-731Z.json' 'docs/conversations/Timeline for Mapping the Human Brain_2026-10-05T17-15-21-185Z.json'
```

Generated detail: [machine audit](analysis.json), [conversation reports](conclave_master_report.md), [dated valuations](costs.json), [export measurements](export-performance.json). Known total valuations, including separately logged titles: Brain $1.996494–$2.334145 (42/42 calls priceable); Pain $3.883713–$4.114823 (107/109 priceable). These are dated public-rate valuations, not invoices or matched savings.

Runtime repair scope is export only. The retrieval, memory-policy and controller repairs above are recommendations, not applied changes.

Validation: Conclave syntax passed, 229 source tests passed with one optional replay skipped; migration parity verified for 74 files from source commit `3b969ef`. Converse `npm run check` passed and 188 backend tests passed with one optional live Neon test skipped. Both Python audit-contract tests passed. Offline canonical replay and the hosted API fixture passed; production deployment/download timing was not tested.
