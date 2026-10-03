# Recent conversation and master report review

Historical review of the pre-repair baseline. The code references and findings below describe that baseline; completed repairs and current verification are recorded in [context repairs](context-repairs-2026-10-02.md).

Reviewed October 2, 2026 against checkout `3ff640d`. This is an investigation and proposed repair sequence; application code and the supplied exports/reports were not changed. No provider inference calls were made.

Sources: [new export](../conversations/conv_b65bc693-2839-4ff5-a3ce-31d9ba602b42.json), [master report](../conversations/master_report.md), its 11 underlying `Processed/` JSON exports, and current implementation. The master report's copy of this conversation ends at 16:58:57 UTC with eight user turns. The new copy ends at 17:31:13 UTC with ten turns and 658 events. They are different snapshots of the same conversation.

## The failure at the end

The user asked the model to optimize context. The Agent run completed, but its requested offloading failed. This was not an API rejection, exhausted context guard, or corrupted revision. All three offload calls were rejected by the engine's protection check. The two subsequent state updates succeeded.

| Export event sequence | Action | Result |
|---|---|---|
| 594 | Read telemetry | Revision 30; saved-context estimate 15,183 tokens; continuation excluded |
| 605–606 | Offload 11 bundles | Rejected on `cb_04bb9932…`, an older document excerpt |
| 616–617 | Offload 7 bundles | Rejected on `cb_46323529…`, an older assistant reply |
| 634–635 | Offload 4 bundles | Rejected on `cb_a9ed7d32…`, an older assistant review |
| 643–645 | Update two named state entries | Succeeded; revision 31 |
| 655–658 | Final answer and completion | Honest partial-result explanation; final context revision 32 |

Each offload batch is atomic: one protected member rejects the entire batch. No offloading succeeded in this turn. The model did not claim it had reduced tokens. Its final statement that some bundles were protected despite `pinned: false` accurately describes the implementation mismatch.

### Why those bundles were protected

Jev's decisions can become run-level mutation guards:

1. [Jev validation](../../lib/conclave/jev.js#L68) escalates a candidate when either action or priority confidence is below 0.65.
2. [Selection planning](../../lib/conclave/harness.js#L296) collects both `retain` and `escalate` decisions as retained IDs.
3. [Agent execution](../../lib/conclave/agent.js#L340) appends those IDs to `state.protected_ids` after every review. They do not expire during that run.
4. [Offloading](../../lib/conclave/harness.js#L314) rejects any requested member of that list, in addition to pins, verbatim requirements, and named state.

The run began with one protected ID, the latest user message. Saved checkpoints show 7 after step one, 13 after step two, 19 after step three, and 21 at completion. At that point 21 of 25 active bundles were in the run guard list; the final answer subsequently made 26 bundles. These counts describe this run, not permanent user pins.

The first three paid reviews each assessed six candidates and escalated all six. The last assessed two and escalated both. That is **20 escalations out of 20 assessed candidates** in this turn. Some action confidences were high but priority confidence was low; for example, one later assessment had action confidence 0.86 and priority confidence 0.39. The current minimum-of-both gate still escalates it.

The working projection exposes `pinned: false` and other saved properties, but does not expose the effective run guard or its lifetime. The model can infer some decisions through the audit tool, but cannot reliably determine operation eligibility. Additional reviews occur between its steps and expand the protected set. This explains its progressively smaller retries.

**Confirmed root cause:** accumulating selection holds plus incomplete operation eligibility information. Low confidence is the proximate source of these holds in this example. This does not establish that Jev's confidence scores are defective; we have not tested their calibration.

### Cost and measurement scope

This turn made seven task-model calls and four paid Jev calls. Reported usage:

| Purpose | Input | Output |
|---|---:|---:|
| Answer/tool loop | 126,247 | 1,492 |
| Jev selection | 8,548 | 1,298 |
| Total | 134,795 | 2,790 |

That is **137,585 reported tokens** to produce two compact state entries and explain three rejected batches. It is a useful regression case for wasted retries and review frequency.

The saved 15,183-token measurement excludes continuation. The final submitted request's local full-input estimate was 26,237; the provider reported 20,805 input tokens. Neither should be replaced by the saved-context-only number. The request guard was 91,217 serialized input units plus 16,384 output-token reserve, or **42.0% of 256,000**. This was not a budget-exhaustion failure.

The revision-30 telemetry followed by a revision-31 state update is normal: the model referred to an earlier tool observation. The current export audit checked all 64 answer requests and found **no revision or workspace-manifest mismatches**. That audit is narrow; it is not a proof of semantic fidelity.

## Master report: resolved, remaining, and misleading findings

| Finding | Current assessment | Follow-up |
|---|---|---|
| Five signed Claude continuation failures | The current code rolls over to a fresh chain when context changes or the signed history becomes too large. Offline regression tests pass. | Retest the same long workflow before calling the historical case resolved in production. |
| Two GPT `reasoning: none` failures | Current server normalizes `none` to `low` for `gpt-6.1-sol`; provider settings are separated in the UI. | Keep regression coverage. These historical errors are not evidence of a new failure. |
| Old 32,000-unit context failure | Current web defaults are 256,000 with a 16,384 output reserve, and oversized tool history has recovery. | Distinguish old configured limits from current defaults; large continuations can still need recovery. |
| Models could not see guide or token telemetry | Resolved and directly exercised in the new export. | Improve scope and effective protection visibility, rather than adding another guide. |
| No named state in this test conversation | The new export contains two source-linked state entries. | Refresh the report. No pins does not mean everything is unprotected: recent/current-user, state, and run holds also matter. |
| Jev enabled but no calls | Several examples predate the periodic-review implementation. Current code and regressions exercise periodic reviews. | Record credentials/adapter availability, trigger, eligibility, and why a review was skipped. Avoid treating every zero as a defect. |
| `Unknown bundle` during state updates | Still a real API usability gap. Several errors use named keys such as `atp.development` or `chess_funnels_hypothesis` where relation arrays require bundle IDs. | Resolve existing named keys explicitly or make target types unambiguous in the schema and errors. Reject unknown/ambiguous targets rather than inventing them. |
| Stale revisions and rejected context edits | Safety checks work, but callers lack precise preflight information and conflict-recovery guidance. | Return current revision, affected IDs, eligibility, and refresh/retry instructions without replaying successful writes. |
| Paid compaction discarded below 15% reduction | Existing minimum-size and failed-batch suppression checks help, but the report still demonstrates poor economics on some workloads. | Prefer lossless offload for suitable older material; budget paid rewriting and estimate amortized benefit. Do not blindly lower the threshold. |
| Some user messages have no answer/failure | Cause cannot be established from the report alone. The two incomplete-usage conversations each have one unanswered inference request. | Expose pending/interrupted/failed/completed turn states and keep unknown usage unknown. Do not label interruption as provider failure without evidence. |

### Reporting corrections

The master report is useful as an exploratory audit, but some flags need correction before they drive decisions:

- **Task and selector budgets are mixed.** The test conversation's per-conversation report says “97% of 8,000.” That 8,000 guard belongs to Jev. Recomputing only answer requests gives **35.3% of the task guard** for the older export, and **42.0%** for the new one. The other app-capability test's answer peak is **75.2%**, rather than its flagged 95% across all purposes. Keep separate answer, selection, and compaction peaks.
- **Turn failure is not tool failure.** The older 11-export set contains eight `turn_failure` events and **19 actual tool-result errors**. The master report discusses some state errors, but “no failures” in a successful-turn report can hide unsuccessful actions. The new test conversation has zero turn failures and four actual tool-result errors, three of them in the last turn. Parse the top-level tool result's `error`; searching for the word or JSON substring can count quoted errors inside telemetry as new failures.
- **Completed is not fully achieved.** The last run correctly ended `completed`, yet the requested offload did not happen. Show “finished with tool errors” alongside run status, with requested/applied/rejected counts. Do not automatically declare the entire task unsuccessful merely because a recoverable tool error occurred.
- **Aggregate savings are estimates, not a quality or billing benchmark.** The report clearly describes its offline bytes-per-token reconstruction. Preserve that caveat. Separate byte reduction, same-encoding tokenizer estimates, reported provider usage, cached-input billing, and output/management cost. Include export timestamps and method versions. A lower context/history character ratio does not demonstrate that constraints survived.
- **Regenerate from the latest snapshot per conversation ID.** The new export adds two turns and 17 calls to this conversation. Deduplicate the root/Processed copies by conversation ID and export timestamp; do not count both. The parser that generated these reports was not present in the inspected checkout, so its implementation has not been reviewed.

## Proposed repair order

1. **Make protection explicit and fix its scope.** Centralize operation eligibility. Return effective protections with reason and lifetime, and eligible IDs, in the model context and telemetry. Keep pins, exact text, named state, and current-task safeguards. Treat Jev retention as an advisory or short-lived review hold rather than accumulating it as a hard prohibition for the full run. An explicit user optimization request should allow the task model to reassess a soft hold using source evidence. Keep atomic mutation, but add a dry-run/preflight returning every blocked ID and reason.
2. **Reduce no-change review and retry costs.** Cache decisions for unchanged task/candidate content and policy version; distinguish `no_change`, `uncertain`, `no_candidates`, and `applied`. Use priority confidence for ordering rather than automatically making an uncertain priority a mutation lock. Repeated identical protection errors should lead to a refreshed eligibility view, not another paid guess. Keep hard-budget recovery independent of the selector.
3. **Complete operational telemetry and reporting.** Include the latest full submitted request's ID, revision, estimate, and reported usage alongside the saved-context preview. Record before/after revision on tool calls/results and link them to their originating inference. Fix audit normalization: it currently misses `output.revision` on some results and `metadata.payload.model` on request records. Show truncated entry counts/paging, split purpose budgets, and expose tool errors within completed runs.
4. **Make state relations and conflicts easier to use.** Support explicit named-state-key targets or clearly typed bundle-ID targets, normalize existing keys to the authoritative current ID, and return actionable errors. Keep stale-revision checks, source attribution, and unresolved proposal status.
5. **Measure preservation and economics before expanding features.** Replay the supplied exports with fixtures, verify that constraints/caveats/authorship/numerical limits remain active or retrievable, and measure paid management cost across short and long workloads. Keep web search, cross-conversation memory, embeddings, model workspaces, and E2B on the roadmap after this repair round.

Acceptance checks should include: repeated low-confidence reviews cannot freeze every older bundle; a protected batch returns complete reasons with no partial mutation; a valid offload shrinks the projection and can resolve its original; recent/user/pin/state protections survive; fresh resumes preserve scoped holds correctly; named-key relation updates work or fail descriptively; and a completed run with rejected optimization is visible as such.

## Verification performed for this review

- Replayed the three saved offload calls against revision 30 and their contemporaneous protected-ID checkpoints using current `Harness.offload`; all three reproduced the exact saved rejection. The replay used read-only exported data and a noncommitting store facade.
- Audited revision/manifest consistency across all 64 answer requests in the new export; no mismatches.
- Recomputed request-purpose budget peaks and parsed tool errors across all 11 older raw exports.
- Ran `test/request-context.test.js` and `test/control-telemetry.test.js`: **11 passed**, zero failures. These verify existing repairs; they do not yet test the proposed protection-scope fix.

The original master report, exported conversations, and application code remain unchanged by this review.
