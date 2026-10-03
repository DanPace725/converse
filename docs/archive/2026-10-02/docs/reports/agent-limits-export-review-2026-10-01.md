# Two exported conversations: agent limits and delivery

Reviewed October 1, 2026. **The two document runs stopped at the total-token preflight guard, not at the step or time limits.** That guard combines provider-reported tokens already spent with the entire next request's UTF-8 byte size and an output reserve. The UI previously showed only `token_limit` and usage, making a conservative reservation look like exhausted provider tokens. A separate model-switch defect carried Claude's `none` reasoning setting into GPT, which rejected it.

This review reads the two exports without making provider calls or changing either conversation. Evidence includes model requests/responses, checkpoints, tools/results, workspace documents, structured state and context snapshots. It evaluates delivery against the requests and the recorded discussion; it does not independently validate the neuroscience/design claims or inspect hidden reasoning.

## Evidence

| Conversation | Export | Events / snapshots | SHA-256 of original export |
|---|---|---:|---|
| Designing Associative Memory for AI Agents | [JSON](/E:/Coding/converse/converse/test-results/conv_3cb9a9e8-7d42-4f37-8d30-632c321fefe4.json) | 50 / 7 | `7b84a72e142db76e5a28e4161ded22a9691ae54b1c06b1cf6c203b9fc180404d` |
| How the Brain Stores Memories | [JSON](/E:/Coding/converse/converse/test-results/conv_b53ebbe1-a7b3-403a-8dc3-f2b40cd67582.json) | 69 / 14 | `0ab6da1aa1a0c739a24beb2cf5252f743fd749bd64acb23bbafeda2da586e040` |

Export times are 4:09:25 PM and 4:12:49 PM Pacific. Detailed, reproducible measurements are in [measurements.json](/E:/Coding/converse/converse/.agent-smoke/export-review/measurements.json). Run `node scripts/review-agent-exports.js` from the Converse checkout to regenerate them. The script uses a disposable in-memory index and writes only its report output. Browser verification output was directed outside `test-results` to preserve the source exports.

## What ran and why it stopped

| Conversation / objective | Path | Steps | Seconds | Input tokens | Output tokens | Observed result |
|---|---|---:|---:|---:|---:|---|
| Associative: design memory | Agent, GPT | 1 | 36.3 | 1,599 | 1,375 | Model returned a final design; completed |
| Associative: Claude suggestions | Agent, Claude | 1 | 27.4 | 6,615 | 2,525 | Model returned suggestions; completed |
| Associative: save proposal, first attempt | Agent, GPT | 0 | 2.4 | No usage report | No usage report | HTTP 400: reasoning `none` unsupported |
| Associative: save proposal, retry | Agent, GPT | 2 | 48.6 | 13,486 | 1,817 | `workspace_write` → `workspace_read` → token guard |
| Brain: six earlier chat requests | Context | — | — | 17,075 | 1,606 | Five answers, one HTTP 400 rejection |
| Brain: document, summary and salient memory | Agent, GPT | 3 | 42.1 | 21,025 | 1,715 | `workspace_write` → `workspace_read` → `update_state` → token guard |

All five agent runs had a 30-step ceiling, 75,000 total-token allowance, 256,000 context units and 16,384 output tokens per call. Associative runs had 180-second deadlines; the Brain document run had 300 seconds. No run reached its step or time limit. The first two one-step completions are expected for questions answered in prose: a final text response ends the loop. **Max steps is a ceiling, not an instruction to perform that many actions.**

The guard calculation is:

`reported run usage + conservative next-input units + next-output reserve <= total allowance`

| Blocked run | Reported tokens spent | Next input units | Output reserve | Required allowance | Configured allowance |
|---|---:|---:|---:|---:|---:|
| Associative proposal | 15,303 | 49,687 | 16,384 | **81,374** | 75,000 |
| Brain document/memory | 22,740 | 44,887 | 16,384 | **84,011** | 75,000 |

Those next-input figures are **offline reconstructions**, because the old runner checked the limit before logging the blocked request. The reconstruction uses the last inflight checkpoint, its pending exchanges and the recorded context/workspace. It exactly reproduces the recorded sizes of all five submitted calls in these two runs: 26,704 and 39,503 units for Associative; 23,507, 32,352 and 38,289 for Brain.

Actual usage was only 20.4% and 30.3% of the allowance. On their completed calls, input-byte estimates were about 4.89–4.92 times reported input tokens for Associative and 4.44–4.51 times for Brain. These are observations for these prompts, not a universal conversion factor. Using the byte proxy reserves substantial headroom. Raising max steps alone cannot change this guard.

The 16,384 output reserve was also much larger than observed task output; the two blocked runs' largest outputs were 1,771 and 1,185 tokens. Smaller output limits could help fixed-budget tests but risk truncating larger documents. Automatic testing expands the run allowance while retaining the existing per-call output/context settings.

## Delivery against the intentions

**Associative proposal: partial delivery.** Document event 38 saved `associative-memory-proposal.md`, 9,062 characters. It contains the three-layer architecture, minimal typed records, temporal versions, staged retrieval, action-time checks, write security, prospective/shared memory, privacy/deletion propagation, implementation phases, evaluations and open decisions. It attributes GPT's initial design and Claude's additions, marks the result as a proposal and avoids inventing implementation commitments or measured results.

Readback event 46 covers only characters 0–8,000. **The remaining 1,062 characters were not read back.** The result supplied a continuation offset, but the guard prevented the next call. No `update_state` occurred: named-state entries are empty. The document and its excerpt remain stored, but the requested salient-detail retention was not completed through the structured-memory mechanism. There was no final assistant report. Evidence: write call/result 37–40, read call/result 45–47, terminal checkpoint 50.

**Brain discussion: document and memory saved, final reporting incomplete.** Document event 50 saved `distributed-memory-notes.md`, 5,246 characters, including a summary, brain/AI discussion, caveats, model attribution and salient ideas. Readback event 58 covers the full document. The `update_state` call/result at 64–66 saved two source-linked evidence entries:

- `memory-discussion-salient-ideas`: distributed brain networks; parametric, associative, fast/slow and external AI memory; retrieval versus weight learning; provenance/caveats; no chosen architecture.
- `conversation-model-attribution`: the distinct GPT/Claude authors and the historical correction of model visibility.

Both entries mark their resolution as `reported`, with unknown confidence and explicit limitations. They preserve the difference between discussion, synthesis and an approved plan. These named entries are protected by the state mechanism even without pins. No later recall test follows them in this export, so persistence is demonstrated but recall quality is untested. The run stopped before the final reply at checkpoint 69. There is no false completion claim in an assistant reply; the missing reply is a harness/UI delivery gap.

Across both exports, all five tool calls have one matching result, with no orphan result and no reported tool error. There are no shell, browser or external-search tools in these traces. Tools operated on the conversation's virtual workspace, not the Windows repository.

## Jev, context management and usage

**Jev calls: zero. Semantic compaction calls: zero. Offloads: zero. Retrieval tool calls: zero.** Jev was enabled in agent settings, but the manager invokes it under context pressure. These prompts remained far below the 256,000-unit context budget and its pressure threshold. The total-run allowance blocked continuation independently of that context budget. Jev being enabled does not mean a selector call occurs on every step, and loosening run limits does not itself force Jev to run.

All observed provider usage is attributed to task answers/tool generation. The Brain `update_state` generation alone cost 8,496 input + 504 output = 9,000 tokens; this is task-directed memory work, distinct from Jev selection or automatic compaction overhead. No management-call cost or savings can be measured from these exports.

| Export | Submitted calls | Responses with usage | Input | Output | Reported total | Recorded cached input |
|---|---:|---:|---:|---:|---:|---:|
| Associative | 5 | 4 | 21,700 | 5,717 | 27,417 | 3,054 |
| Brain | 9 | 8 | 38,100 | 3,321 | 41,421 | 11,876 |
| **Combined** | **14** | **12** | **59,800** | **9,038** | **68,838** | **14,930** |

Input represents 86.9% of reported total usage. Cached input is included in input, never added again. The mixed-provider export's original aggregate cache field was null; the table sums the cache-read fields actually reported by each provider. Both conversations have one rejected request without a usage response. Their reported totals do not establish billing for those rejections. No pricing snapshot exists, so no dollar cost or net savings is claimed.

The final proposed request has 20,079 bytes of pending exchanges plus a 17,821-byte working-context message in Associative, and 14,076 plus 18,645 bytes in Brain. Saved document text appears in the write arguments, the read result and a working excerpt. This supports durable, inspectable continuation but repeats material. Exact removal of duplicated tool history could improve efficiency; these observations do not establish safe token/dollar savings from a particular compression method.

## Other discrepancies and integrity limits

The earlier model-attribution problem was real at the time. Brain requests 23 and 30 did not include source-attribution records; request 38 did, and the response then named the earlier models correctly. The archived reply denying visible historical model names should not be described as ignoring metadata that was already present in its request. The later document preserves the corrected attribution.

Claude's earlier Associative response introduced itself as Conclave. The later proposal separates the providers' authorship. Current runtime instructions already identify Conclave as the application's context method; this review does not claim that historical replies have been rewritten.

All 21 snapshot values agree with their transform records after object-key normalization. All segment text hashes and source references checked successfully. However, **none of the 21 original order-dependent snapshot hashes can be reproduced by hashing the exported object serialization**. The hosted JSONB path reorders object properties; equal values can therefore have different `JSON.stringify` hashes. This is an audit portability limitation, not evidence here of altered text. Canonical object serialization for future receipt hashes is a separate follow-up. This review does not claim tamper-proof storage.

The historical token-limit finish discarded pending continuation from its final checkpoint. The prior inflight checkpoint remains in the audit and supports reconstruction, but the app's Resume button only drives an already-running checkpoint. The new profile applies to subsequent runs. To finish an old stopped task, submit a follow-up that reads the existing file/version and completes outstanding work; it does not automatically replay archived tool actions.

## Implemented changes and validation

The workspace now provides **Automatic testing** as the default browser run profile, plus **Fixed limits**. Automatic testing starts at 40 steps / 10 minutes / 250,000 total tokens and grows allowances when needed. Each expansion is persisted before further paid work. Its ceilings are 200 steps, one hour from the original run start and 2,000,000 total tokens including conservative reservation. Per-call provider/host timeouts, context/output budgets, missing-usage stops and file-readback checks still apply. It is a flexible bounded loop, and the model can return a final answer earlier.

Specific stop diagnostics are saved in checkpoints and shown beside the composer, including the full preflight arithmetic, provider errors, truncation reasons, step/time limits, missing usage and interruption. Tool-result errors are surfaced even when the model subsequently recovers. Failed user turns retain the actual error in the transcript. Run audit details now separate task, Jev-selection and compaction usage; show elapsed time, tool errors, readbacks, reported cached input and allowance increases; and remain isolated from later chat turns.

The Claude-to-GPT `none` carryover is normalized to `low` for the affected `gpt-6.1-sol` model before submission. The browser disables that unsupported choice for this model. Other unknown model capabilities continue to depend on the selected provider's validation. Fixed-limit settings are captured before creating/loading a conversation, preventing those chosen values from being overwritten by view defaults on first submission. The PWA shell cache version was advanced for the changed assets.

Validation: JavaScript syntax passed; 49 offline checks passed and the external Neon test was skipped; 20 agent/context browser checks passed across desktop/mobile, including detailed failures after reload, automatic expansion, Stop, exports and shared workspace edits. A synthetic run completed 42 steps while expanding both step/token allowances, and separate checks verified absolute time/step/token ceilings and purpose accounting under Jev pressure. Mobile failure rendering was visually inspected. Source-export hashes were rechecked after browser tests.

These are local changes. No deployment, new paid model generation or live sustained-run proof was performed. The exports support reliable tool execution and partial/successful persistence, but do not yet demonstrate long-run autonomy, semantic task acceptance, cross-session recall quality or Jev's net benefit.
