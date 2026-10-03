# Context repairs and readable references

Implemented locally October 2, 2026. No commit, push, deployment or database migration was performed in this round.

## Result

Jev retention advice no longer becomes a run-long mutation lock. Older checkpoints are upgraded on their next agent step, retaining the current user objective while independently enforcing pins, exact-text requirements, named state and the recent window. Models can call `inspect_context` to see eligible targets and every actual protection reason/lifetime. A blocked batch remains atomic; error results carry the inspection instead of identifying only the first protected UUID.

Unchanged selector decisions are cached in the saved audit using task, candidate IDs/content/status, protection, policy and adapter settings. Fresh service instances can reuse them; changed candidates invalidate them and explicit compaction refreshes selection. Jev v2 uses action confidence to decide whether to escalate; uncertain priority falls back to deterministic ordering. Automatic semantic rewriting is limited to one paid compaction call per turn, after the existing content-size, potential-reduction and repeated-failure checks. Routine deterministic candidates can be offloaded losslessly first. Applied reviews are distinguished from no-change reviews.

Workspace and the context garden display stable conversation-local **S** segment and **E** source handles. Canonical IDs remain the storage identity; immutable snapshots and their hashes are not rewritten. Numbering follows first appearance, survives restarts/rehydration/restore, and is never reused for a new version. Context tools resolve S/E handles to canonical IDs. Source removal checks still apply through aliases. Workspace exposes canonical/source/parent IDs in a details panel and opens historical originals read-only. Offload pointers identify their original S handle.

State relationships accept an existing `state:key`, plain named key, S handle or canonical segment ID, then store canonical IDs. New entries in the same batch cannot be relationship targets. Stale updates are rejected without changing state; errors explain how to refresh the target. Source attribution and uncertainty/limitations remain required.

## Visibility and reporting

Context activity now has filters, Earlier/Latest paging and explicit omitted-entry counts. Tool calls/results record their originating request and before/after revision. Historical exchanges can recover request provenance from the recorded response call ID. Audit normalization includes result revisions and requested model names. Completed agents with rejected tools are labelled **completed with tool errors**.

The latest submitted request retains its own count, revision and reported usage. Workspace distinguishes that full request, including continuation, from a saved-context preview; previews during a running agent include its pending continuation. The local tokenizer, provider preflight count, reported usage and mixed-unit byte guard remain separately labelled. Polling does not make provider count calls.

`scripts/report-conversations.js` regenerates the [master report](../conversations/master_report.md) and individual reports from canonical JSON, deduplicating by latest export time. The revised collection includes the latest 10-turn export: 11 conversations, 103 user turns, 90 completion records, 8 turn-failure records, 341 inference requests and 7 separately logged title generations. It finds 22 top-level tool errors, with 9 completed turns containing tool errors. Known input/output totals are 5,024,187 / 188,098; two calls have missing/partial usage. These are known subtotals, not invented complete counters.

The latest conversation's peak answer guard is **42.0%**; its selector's peak is **97.4% of a separate 8,000-unit guard**. Neither percentage is model context-window occupancy. Title costs are recorded separately and cached input is not added twice. The earlier counterfactual savings claims are omitted pending controlled cost/fidelity comparisons.

## Verification

- **103 backend tests passed**, one live Neon integration test skipped; zero failures. New fixtures cover cached decisions, Jev confidence, atomic protection, checkpoint upgrades, S/E stability, aliases after removal, state relationships, stale rejection, audit provenance/paging and report calculations.
- **54 existing browser checks passed** across desktop/mobile. After the final changes, **8 focused browser checks passed**, including the new completed-with-errors case on both viewports: **56 distinct browser checks** in total. They exercise readable originals, canonical details, activity paging/filters, request scope, source authors and persistence. No page errors occurred in the checked flows.
- Syntax and Git whitespace checks passed.
- Paid-compaction fixtures verify one automatic rewrite per turn, an explicit refresh when appropriate, current-objective preservation and retention of a numerical limit and uncertainty caveat. Cached periodic review fixtures reduce two unchanged reviews to one selector call.
- An offline replay uses the latest supplied conversation at its **final exported revision 32**, preflights the 11 unique targets from its three rejected offload attempts, and offloads the eligible targets under the repaired rules. All 11 are eligible at that final revision. Projection bytes fall **41,813 → 19,896**. Local saved-request tokens fall **18,185 → 13,834**, measured using current code on both sides, o200k_base and no pending continuation. Every original remains retrievable and pins/state stay unchanged. **No paid calls** are made in that replay.

The replay is a saved-state comparison, not a rerun of the original provider sequence. It does not establish general semantic compaction fidelity or production cost savings. Broader short/long workload comparisons and a deployed provider rerun remain follow-ups in the [roadmap](../roadmap.md).

The replay regression skips in checkouts that do not include the user's latest local export; the independent protection/preservation fixtures always run.

The user's preexisting document deletions and newly added export were preserved. Canonical conversation JSON was read, not rewritten. Browser-generated changes to the existing tracked screenshot are excluded from the implementation.
