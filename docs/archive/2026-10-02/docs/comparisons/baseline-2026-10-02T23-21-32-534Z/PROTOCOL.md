# Full-history baseline replay

Initial authorized spend cap: **$5**, October 2, 2026. After the conservative reservation guard paused during turn four, the user explicitly authorized removing the spending guard and finishing the workload. The saved run resumes without repeating completed model responses or workspace actions. All prompts, source attachments, new outputs, SQLite storage and exports stay local. This replay does not modify the hosted application or the source conversation.

The workload uses the five substantive original user prompts, in their original order, with GPT / `gpt-6.1-sol` at medium effort and Claude / `claude-sonnet-5-5` at provider-default effort. The two failure-retry-only messages are omitted. The first objective and later review objective each run once. The two original user uploads enter the workspace immediately before the last prompt, with exact content hashes in `recipe.json`. Model-created historical artifacts are not seeded into the new run: the models must produce their own work.

Conclave's context selection, Jev, compaction, offloading, structured named state, frozen projections and bounded continuation handoffs are disabled. The runner shares only the existing audit storage and workspace/calculation execution helpers. No stored Conclave working projection is supplied to the model. Raw user/final assistant messages and complete prior tool arguments/results are sent again at each turn; within a turn every native tool exchange remains in the prompt. Across provider boundaries old tool exchanges become attributed full-text observations, preserving their complete arguments and results without invalid native envelopes or another model's private signed reasoning. Historical reasoning records and superseded document contents are not independently inserted into the prompt; old versions remain present if the model previously read or wrote them in a retained tool exchange.

The task tools are `calculate`, `calculate_expression`, `workspace_list`, `workspace_read`, `workspace_write`, and `workspace_patch`. Writes retain the same preservation and complete-readback checks. Independent batches are limited to sixteen calls. Final prose ends the turn only after file readback checks. Each turn permits forty model responses. No model response is automatically retried after an uncertain provider failure.

The output allowance remains 16,384 tokens. The local application byte guard is raised from 256,000 to 1,000,000, and the sandbox turn duration is bounded at twenty minutes, so a hosted byte/time guard does not prevent measurement of growing full-history requests. These are disclosed experimental differences. Provider response deadlines remain 180 seconds. New replies and tool trajectories are stochastic and cannot reproduce the original outputs exactly. This is an end-to-end workload comparison, not an isolated estimate of compaction savings.

Before every generation, the selected provider's token preflight is attempted. The ledger reserves output at the highest applicable public rate and input at the highest input/cache-write rate, with input-count headroom. If preflight fails, the generic local tokenizer receives more headroom. The reservation is persisted before the paid request; known usage releases the unused part, while missing usage retains the reservation. The initial run stopped before a conservative reservation would exceed $5. On the user-authorized continuation, reservations and known costs remain tracked but do not stop generation at a monetary limit. Published-rate estimates do not replace provider billing records. Preflight-blocked requests are retained in the audit and excluded from paid-call totals.

`ledger.json` records calls, reservations, price ranges, model usage, cache buckets, latencies and turn outcomes. `baseline-export.json` records the native request/response audit and all tool execution. A timestamped title-named export is written when the run ends. `artifacts/` holds the latest workspace files. The generic cost report's internal storage text-size fields are not a managed projection used by this baseline; comparisons must use the recorded submitted inputs and reported usage.

Run from the Converse repository root:

```powershell
node --env-file-if-exists=.env scripts/replay-baseline.js --source "docs/conversations/Comprehensive Policy Plan to Address Homelessness_2026-10-02T22-44-59-328Z.json" --cap 5 --live
```

Omit `--live` for a local dry-run that prepares the recipe without provider calls. A source-based invocation creates a new replay. To continue this saved run, the authorized command was:

```powershell
node --env-file-if-exists=.env scripts/replay-baseline.js --resume "docs/comparisons/baseline-2026-10-02T23-21-32-534Z" --no-cost-cap --live
```

Resume is allowed after a spending-guard stop with every submitted response accounted for and all tool results saved, or a provider-reported `max_tokens` response with reported input/output usage. Incomplete tool calls from output exhaustion receive explicit skipped-action receipts and do not execute; continuation asks for smaller complete writes or patches using the saved response and calculations. The output allowance remains 16,384 per call. These continuation requests and their costs are included in the metrics. Uncertain paid requests are never automatically replayed. `--no-cost-cap` requires explicit authorization.
