# Conclave iteration: exports, cost and context

October 2, 2026. Local implementation and bounded user-prompt comparisons. Detailed trajectories, ledgers and generated per-conversation reports remain local; their relative links below resolve in the research checkout. The public release includes this aggregate summary, app changes and pricing references.

## Delivered

- Ordinary Markdown/JSON exports and Context/Agent JSON exports now use conversation ID plus UTC export timestamp. The record and filename use the same export time. The Python archive preserves name collisions and recognizes timestamped downloads. Latest snapshots drive totals; all snapshots remain available for trends.
- Shared [USD analyzer](../../scripts/lib/costs.js) prices every saved inference request and separately logged title. It supports ordinary and Context exports, distinguishes normalized Conclave usage from native Claude answer/title usage, includes partial reported usage, handles cache writes by TTL, and retains missing usage/rates. Title provider is inferred explicitly from the recorded requested model in the dated catalog when the event actor is the application.
- Ordinary Gemini exports normalize prompt/cache fields and price generated plus thinking tokens from total usage; storage duration remains unknown. [Official usage schema](https://ai.google.dev/api/generate-content).
- The Python entry point retains your context-placement report and delegates USD calculations to that shared analyzer. [Cost report](../conversations/cost-reports/index.md), [snapshot trends and call data](../conversations/cost-reports/costs.json), and [price reference](../MODEL_COSTS_2026-10-02.md). Converse carries its own identical [rate snapshot](../model-costs-2026-10-02.json), so reporting works from its checkout alone.
- Answer instructions no longer carry changing counts/revisions. The projection uses S/E handles and omits hashes/false flags while preserving source attribution, revisions, uncertainty, state resolution/limitations, pins and retrieval pointers. Changing revision/protection telemetry follows source text. Canonical exports and inspection/retrieval remain intact.
- Claude uses a fixed system cache breakpoint and automatic caching for the growing continuation, in append and layered modes. Frozen projection is enabled for new Context turns and Agent runs. It stages edits during one tool loop, exposes receipts/current inspection, supports explicit refresh and a logged byte-guard exception, and preserves signed continuation until refresh. Agent checkpoints reference one persisted projection per refresh. Existing runs without the setting keep their previous behavior. Settled-state reordering remains follow-up work. Complete numeric formulas can now use calculate_expression in one tool call.

## Historical context and cost

The latest 11 exports contain 561,088 history characters and 182,864 working-context characters: **67.4% less saved text**. This is the same capacity measure as your updated reorientation, not a bill reduction.

The shared report values 346 of 348 logged calls at **$9.950778–$12.853158** using the October 2 public rate snapshot. 2 calls remain unpriced (missing usage); these are excluded, not zero. This is current-rate valuation, not historical billing evidence.

[Offline reconstruction](projection-analysis-2026-10-02.json) covers 303 saved layered answer requests: 4,673,632 → 4,030,630 local serialized-input tokens, **13.8% fewer**. Common-prefix totals increase from 2,387,811 to 2,507,265, but decline in some conversations. These are local encoding estimates, not measured provider framing/cache eligibility or changed historical usage.

A same-answer-trajectory append scenario retains source headers, tool schemas, actual continuation tails, call count and output tokens. Its optimistic five-minute matching-prefix versus cold-write range is $5.342588–$18.264602 across 301/303 estimated answer calls. Selector/compaction calls disappear in that scenario; actual management/title calls stay in the historical report. This is an assumption-sensitive counterfactual, not an actual append result or a calibrated savings percentage. The JSON retains per-call eligibility, unknowns and tier assumptions.

## Live comparison protocol

Derived templates reuse your memory-design questions and the saved space-travel/fuel drafts, then introduce a 12-tonne input correction and a report-writing request. Both [initial templates](../comparisons/2026-10-02T19-52-30-387Z/templates.json) and new source-linked canonical exports preserve provenance; original conversations are unchanged. Newly generated replies/tools differ from the historical trajectory.

Models: GPT-6 Luna and Claude Sonnet 5.5. Jev disabled for these trials only; application default unchanged. Three ordinary/document turns per case. Plain chat is a separate tool-free baseline; harness append and layered share retrieval/workspace/calculation tools, with layered's context-management tools added. Thus plain's file action is satisfied by Markdown output, not a saved virtual workspace. Runs are sequential, not randomized, and reuse warm prefixes across cases; this is one calibration, not a statistical benchmark.

### First calibration: 2,048 output tokens and eight answer calls per turn

| Case | Mode | Status | Completed turns | Logged requests | Input / read / output tokens | Current-rate USD |
|---|---|---|---:|---:|---|---|
| openai / ordinary-memory | plain | completed | 3 / 3 | 3 | 576 / 0 / 446 | $0.000281–$0.000450 |
| openai / ordinary-memory | append | completed | 3 / 3 | 3 | 6863 / 3642 / 639 | $0.000758–$0.001357 |
| openai / ordinary-memory | layered | completed | 3 / 3 | 3 | 8224 / 4446 / 520 | $0.000776–$0.001423 |
| openai / document-fuel | plain | completed | 3 / 3 | 3 | 5842 / 3595 / 943 | $0.000788–$0.001340 |
| openai / document-fuel | append | failed | 0 / 3 | 8 | 43530 / 39355 / 231 | $0.001030–$0.002003 |
| openai / document-fuel | layered | failed | 0 / 3 | 8 | 34147 / 31539 / 238 | $0.000760–$0.001460 |
| anthropic / ordinary-memory | plain | completed | 3 / 3 | 3 | 1872 / 542 / 2457 | $0.027952–$0.027952 |
| anthropic / ordinary-memory | append | failed | 2 / 3 | 3 | 15758 / 7728 / 3919 | $0.060805–$0.060805 |
| anthropic / ordinary-memory | layered | failed | 2 / 3 | 3 | 20210 / 10042 / 4385 | $0.071272–$0.071272 |
| anthropic / document-fuel | plain | failed | 0 / 3 | 1 | 2522 / 0 / 2048 | $0.026783–$0.026783 |
| anthropic / document-fuel | append | failed | 2 / 3 | 8 | 79563 / 58959 / 5836 | $0.121651–$0.121651 |
| anthropic / document-fuel | layered | failed | 0 / 3 | 1 | 0 / 0 / 0 | $0.000000–$0.000000 |

Luna's document failures were useful arithmetic interrupted by the call limit, not repeated rejected operations. Claude hit the output limit. One final layered case stopped at the conservative reservation guard **before provider submission**; its persisted request has no usage and is not included in the submitted-call spend subtotal. Failed/partial trajectories remain in the exports.

### Diagnostic: 4,096 output tokens and sixteen answer calls per turn

| Case | Mode | Status | Completed turns | Logged requests | Input / read / output tokens | Current-rate USD |
|---|---|---|---:|---:|---|---|
| openai / document-fuel | append | completed | 3 / 3 | 23 | 123392 / 107702 / 1721 | $0.003897–$0.007364 |
| openai / document-fuel | layered | completed | 3 / 3 | 25 | 103377 / 93948 / 1781 | $0.003007–$0.005568 |
| openai / document-fuel | frozen | completed | 3 / 3 | 21 | 86879 / 77265 / 1681 | $0.002813–$0.005206 |
| anthropic / document-fuel | plain | completed | 3 / 3 | 3 | 10709 / 8789 / 5142 | $0.057972–$0.057972 |
| anthropic / document-fuel | append | completed | 3 / 3 | 13 | 148553 / 113613 / 7028 | $0.180336–$0.180336 |
| anthropic / document-fuel | layered | completed | 3 / 3 | 12 | 110602 / 82233 / 6009 | $0.147443–$0.147443 |

All six diagnostic cases completed. They retain the three prompts, originals and matched per-pair limits. The additional frozen case tests the optional behavior separately. No global output/call defaults were changed.

Across both batches: **143 provider submissions**, public-rate valuation **$0.708324–$0.720385**. The same $1 guard covers both batches. A request reserves double its local input estimate plus 2,048 framing tokens and full output at the highest available rate; completed reported usage releases unused reservation, while unknown failures retain it. This is a conservative local estimate, not an account-enforced invoice limit. [Initial ledger](../comparisons/2026-10-02T19-52-30-387Z/comparison.json), [diagnostic ledger](../comparisons/2026-10-02T19-58-20-256Z/comparison.json).

## Quality and interpretation

I inspected the diagnostic correction answers, generated reports and full-file readback records. All retained the 12-tonne final mass, 3.2 km/s, 450 s and g0=9.80665 inputs, the rounded 12.78 t propellant / 24.78 t initial-mass results, and single-burn/no-staging/no-reserves caveats. All five tool-enabled diagnostic cases wrote fuel-review.md and read its full current version. Plain Claude supplied Markdown and explicitly reported that it had no file tools.

Intermediate precision is imperfect: Luna's frozen report prints a mass ratio of 2.0648 where recomputation gives about 2.065003; another Luna report prints 2.06505. Claude's layered report uses a rounded exponent, slightly changing its last ratio digits. Rounded mass results remain correct. These are quality limitations to keep visible, not clean passes on every numerical detail. Qualitative propulsion/biology claims were not independently fact-checked in this pass. Source retrieval, revision guards, uncertainty retention and signed chains also have offline checks.

For this diagnostic document case, layered valuation was lower than harness append with both models; the frozen Luna run was lower again. Ordinary Luna layered chat was slightly more expensive than append, and plain chat was cheaper where workspace actions were unnecessary. Different output length, tool counts, warm-cache order and natural model variance contribute. There is **no general savings claim**, and management/ingress economics require a longer pressure-driven trial.

## Validation

113 backend tests passed; live Neon test skipped. Snapshot trend selection and archive-name collisions were checked without changing source exports. Syntax checks passed. Desktop/mobile browser checks passed for ordinary timestamped JSON/Markdown exports, real HTTP/storage Context export timestamp consistency, and mixed-provider streaming/export behavior. The Python context report ran successfully. The archived saved-export regression now runs from Processed instead of being skipped after your file move. The original comparison was local. The cost-focused release and mobile verification are recorded in [the cost plan](conclave-cost-plan-2026-10-02.md).

## Next iteration

1. **Make quality checks sharper.** Recompute displayed numerical intermediates from calculator results; replay a longer constraint/correction task using the saved makerspace planning conversation. Score source recovery, changed decisions and file verification alongside final context and complete cost. Keep realistic call/output allowances and preserve bounded failures.
2. **Measure prefix behavior under real edits.** Compare normal and frozen loops with matched trajectories, verify the persisted frozen projection under longer runs and explicit refresh/guard receipts. Trial separate stable context blocks and settled state before the recent tail; measure actual reads/writes and cache expiry instead of assuming prefix improvements always cache.
3. **Price the management decision.** Jev now has a verified public input rate of $0.042/MTok with free output; price its full downstream effects before an on/off net-cost claim. Use the complete report to test whether ingress excerpts/lossless offload save future carry cost after selection, retrieval, transformation and re-caching. Keep context reduction and task fidelity coequal with cost; defer an economic trigger until that evidence exists.
