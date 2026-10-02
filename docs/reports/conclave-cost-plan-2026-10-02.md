# Conclave cost reduction plan

October 2, 2026. Focus: reduce total task cost while retaining useful context, source recovery and task fidelity. Mobile conversations are the next acceptance evidence. Detailed conversation exports and per-conversation reports are retained locally; the published release contains app code, rate references and aggregate findings.

## What the saved conversations establish

The latest 11 export snapshots contain 348 logged calls; 346 have priceable usage. Their current public-rate valuation is **$9.950778–$12.853158**, excluding two calls with missing usage. This is not historical invoiced spend. Saved working text is **67.4% smaller** than full source history; that remains a separate capacity result.

| Purpose | Calls | Priced | Current-rate USD |
|---|---:|---:|---:|
| Answer and tool continuations | 303 | 301 | 9.924332–12.810483 |
| Semantic compaction | 8 | 8 | 0.021221–0.036956 |
| Jev selection | 30 | 30 | 0.002607 |
| Separately logged titles | 7 | 7 | 0.002618–0.003112 |

Jev processed 62,072 reported input tokens. Its published rate is **$0.042 per million input tokens, with free output**. [TypeSafe announcement](https://typesafe.ai/blog/introducing-system-one-models-and-jev), checked October 2. The other column's $0.20–$10 input and roughly 5x output describe general LLMs. Disabling this inexpensive selector is a low-priority saving; changed compaction, cache writes, retrieval and answer behavior can matter much more than its direct charge.

[Call-level report](../conversations/cost-reports/index.md), [machine-readable coverage and snapshots](../conversations/cost-reports/costs.json), [model rates](../MODEL_COSTS_2026-10-02.md), [earlier bounded comparisons](conclave-iteration-2026-10-02.md).

## Changes ready for the mobile trial

1. **Fewer repeated prompt tokens.** Compact S/E handles retain attribution, uncertainty and retrieval while removing hashes, full IDs and changing instruction telemetry. Offline reconstruction estimated 13.8% fewer serialized input tokens over 303 historical requests. That reconstruction is not a provider-billed savings measurement.
2. **Keep the prefix stable through tool work.** New Context turns and Agent runs hold one working projection until the next user turn, explicit `refresh_context`, or a logged guard refresh. Tools save edits immediately; receipts and inspection reveal current state. Claude retains signed exchanges while the projection is stable. Each Agent projection is stored once and referenced by checkpoints. Historical runs with no setting continue their previous behavior. Service settings accept `freezeProjection: false` for paired baseline runs.
3. **Use one call for a whole formula.** `calculate_expression` supports numeric arithmetic, powers, parentheses and bounded real-number functions. It keeps intermediate precision and executes no code. The fuel example can now calculate `12000 * (exp(3200 / (450 * 9.80665)) - 1)` in one call instead of a sequence of arithmetic round trips. The legacy calculator remains available. Actual call reduction depends on the model choosing the tool.
4. **Measure cost consistently.** Both repositories carry the same dated rate snapshot, now including Jev. The shared analyzer separates native Claude/Gemini usage from normalized Context usage, prices cache buckets and partial responses, and preserves unknowns. Exports have UTC timestamps; repeated snapshots remain available without doubling totals. The portable Python report delegates USD calculation to the shared analyzer.

The additions have a fixed prompt cost. In a minimal OpenAI fixture, the whole-formula schema adds **74 local o200k tokens**; enabling projection freezing adds another **101** including its refresh schema and instructions. Complete serialized input changes from 3,011 to 3,186 tokens. The refresh schema alone counts 56. These are local encoding measurements, not provider framing or billed usage. There are no extra inference calls from these additions. Additional storage is one projection event per refresh; database traffic reduction has not been benchmarked. Existing token/output limits, revision checks and request byte guard remain enforced.

## Next iteration, in priority order

1. **Analyze the owner's new mobile conversations.** Export at useful checkpoints, then run `node scripts/report-costs.js` without moving downloads, or `python scripts/conclave_report.py` to archive recognized Context exports and produce both reports. Compare completed objectives, answer/tool calls, uncached input, cache reads/writes, output, failures, context/history size and source recovery. Check constraints, revised decisions and numeric intermediates. Preserve incomplete and failed runs. Pair the same prompts and settings with a fresh `freezeProjection: false` baseline; cross-run warm caches and different outputs must remain explicit limitations.
2. **Reduce expensive frontier round trips first.** Confirm adoption of the compound calculator and inspect repeated reads, rejected edits, narration and retries. Keep necessary file readback and fidelity checks. Remove only repeated work with no useful result; do not lower output limits merely to make a run appear cheap. Add settled-state ordering or separate cache boundaries only if actual reads/writes show a remaining prefix problem.
3. **Use excerpts and lossless offload where repeated carry cost dominates.** Keep full originals and retrieve them when needed. Choose document/task examples from the saved conversations. Measure excerpt fidelity, later retrieval calls and total USD; a smaller first request alone is insufficient evidence.
4. **Then make management economic.** Estimate benefit as avoided future carry cost minus Jev, transformation, retrieval and cache-rewrite cost. Evaluate cold and warm-cache cases separately and use a conservative range for remaining calls. Retain the hard request guard independently. Prefer deterministic lossless changes when they suffice; invoke semantic rewriting when its expected benefit and fidelity justify it.

For example, removing 10,000 tokens before five Sonnet 5.5 requests avoids about $0.10 in uncached input or $0.01 in cache reads at this rate snapshot. A 20,000-token Jev review costs $0.00084, but rewriting a 20,000-token five-minute cache prefix can cost $0.05 before any model output. Consequently, a cheap selector alone does not establish a profitable rewrite. An economic trigger should require a positive conservative estimate after all these costs, plus successful recovery and fidelity checks.

Acceptance comes from a completed useful task at lower comparable total USD, without losing required constraints, uncertainty or source access. The previous small sequential comparisons are promising for document/tool work but showed ordinary layered chat can cost more; they do not establish general savings.

## Verification and publication

113 Converse backend tests passed; one live Neon test was skipped. All 17 standalone tests passed. Four desktop/mobile browser checks passed for Agent execution through real HTTP/storage, the expression tool, workspace verification, reload/resume and timestamped downloads. Syntax checks and portable report generation passed. No new paid comparison was run during this cost-focused continuation; new user conversations will be assessed after the owner returns.

Publication verification will be added after the commits reach production.
