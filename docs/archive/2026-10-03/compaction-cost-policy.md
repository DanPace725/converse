# Adaptive context-management cost policy

2026-10-03. Original proposal and offline sensitivity calculation. The [first implementation increment](context-cost-controller.md) now records action costs in shadow mode, removes paid periodic timing reviews and tries routine pointers before paid pressure selection. The future-timing optimizer and cost-triggered mutations described below remain unapplied.

## Conclusion

Converse can choose when and how to reduce context using local arithmetic, without asking a model whether compaction is due. The objective should be minimum expected remaining task cost among methods that preserve required information. Smaller context is an intermediate measurement, not the objective. Timing and cache layout must be considered together.

This would extend the existing economics policy rather than introduce a second context manager. It can remove periodic paid reviews as a timing mechanism and leave users with automatic operation plus the existing explicit override. It cannot guarantee a global optimum: future requests, cache hits, source reuse, summary size, and quality are uncertain.

## Current implementation

- `../../../lib/conclave/economics.js`: prices observed calls; compares removable-token carry with selection, past rewrite cost, retrieval, and cache rebuild. The horizon is `min(4, max(1, known.length))`. The trigger needs observed compaction costs, making economic-only first-use decisions unavailable. It applies an additional 25% margin.
- `../../../lib/conclave/harness.js`: `reviewContext()` also triggers periodic reviews after 10,000 cumulative input tokens by default. `compact()` starts at 75% of the serialized-byte budget, or on a review. Jev selection can precede lossless offload. Semantic compaction uses the selected answer model and retains the existing one automatic paid rewrite per turn limit.
- `../../../lib/conclave/attention.js`: deterministic candidate protection/ranking and recoverable pointers already exist. These are useful building blocks.

The current economic estimate has several limits: it prices all unprotected text as removable rather than a specific resulting projection; uses historical average rewrite cost instead of the proposed batch; averages whole-request input rates rather than locating affected tokens in a prefix; and estimates cache rebuild from removable tokens rather than the retained suffix invalidated by the edit. These can produce different decisions from an action-specific calculation.

## Pricing and cache verification

The October 2 snapshot's standard rates for GPT-6.1 Sol, GPT-6 Luna and Claude Sonnet 5.5 match the official pricing pages fetched October 3. This was a targeted verification, not a refresh of all models or account-specific rates.

| Model | Input | Cache read | Cache write | Output |
|---|---:|---:|---:|---:|
| GPT-6.1 Sol | $2 | $0.10 | $2.50 | $10 |
| GPT-6 Luna | $0.10 | $0.01 | $0.125 | $0.50 |
| Claude Sonnet 5.5 | $2 | $0.20 | $2.50 for 5m; $4 for 1h | $10 |

USD per million tokens. Sources: [OpenAI pricing](https://developers.openai.com/api/docs/pricing), [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing). OpenAI publishes separate long-context rates; the snapshot still lacks a verified numeric boundary for these models, so calculations must carry tier uncertainty rather than guess it. The demo below uses standard rates explicitly.

OpenAI reuses eligible matching prefixes; cache-write prices replace the input rate for those tokens, rather than adding to it. Claude also caches prefixes; editing an early block can invalidate subsequent cached material, and an unchanged boundary is useful only if an eligible cache entry was actually written there. Claude's default 5-minute TTL is measured from request start. These rules make edit position and request gaps material to cost. Sources: [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching), [Claude prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).

## Proposed algorithm

At the start of an actual answer request, and at an existing safe agent refresh boundary:

1. **Find eligible actions locally.** Include keep, removal of redundant projections, source-linked pointer offload, and bounded semantic summaries. Build candidate batches from existing protections and deterministic ranking. Keep pins, exact-text requirements, current-file authority, named state, unresolved constraints, the current request and the recent window intact. Consider edits after a reusable settled-prefix boundary as distinct candidates. Canonical source history remains recoverable.
2. **Construct each candidate request.** Count the full serialized provider payload, including tools, attribution, pointers and summary metadata. For paid summaries, use bounded output-size estimates until a real output exists. Determine which cache entries survive and which retained tokens must be written or processed again. A cold keep baseline must also pay its own write/uncached price; do not add rebuild twice.
3. **Estimate future use from existing telemetry.** Use request counts within completed agent runs, request gaps, retrieval frequency by source type, observed compression ratios, model switches and cache-read/write buckets. Estimate the probability of reaching each future request, separately for chat and agent mode. Do not equate the eight observed pricing samples with eight future requests. Idle chats are censored observations, not completed tasks. With insufficient history, price the already-requested next answer and show future benefit as unknown; do not invent a continuation horizon.
4. **Price each action and waiting.** Include management input/output, selector calls only where proposed, initial cache changes, future input, recovery excerpts, additional calls caused by retrieval, retries/rejections and any known storage/tool fees. Model latency and fidelity as constraints; do not attach invented dollar values to unmeasured quality. Compare acting now with keeping for the next request and reconsidering later as the cache ages or the context grows.
5. **Execute only a supported winner.** Choose the lowest expected cost feasible action. For automatic paid work, require the saving to remain positive under conservative bounds for hit probability, summary size, recovery and price tiers. If uncertainty overlaps keep, wait. If required rates are unknown, disable cost-only paid triggering; deterministic pressure management remains available. Hard capacity guards can override the economic choice and should log that reason.
6. **Learn and explain.** Log candidates, chosen batch/method, price revision, token-count basis, continuation/recovery assumptions, cache invalidation, expected cost interval and decision reason. Reconcile estimates with provider-reported usage after execution. Reuse unchanged decisions; invalidate them on relevant task, source, protection, model, rate, size or cache-state changes. Time passage can matter because of TTL.

For action `a` in state `s`, a useful cost decomposition is:

```text
expected_cost(a) = management(a)
                 + cost_of_next_request(a)
                 + sum over k>=2 [P(request k occurs) * expected_request_cost(a, k)]
                 + expected_incremental_recovery_and_retries(a)

gain(a) = expected_cost(keep) - expected_cost(a)
```

The next request is already authorized and pending, so its occurrence weight is 1. Later weights are learned probabilities, not a fixed four-call allowance. Each request cost uses disjoint uncached/read/write buckets and its applicable tier. Recovery includes the effect on later payloads, not just the local tool execution. Common answer-output cost cancels only when assumed unchanged; actual whole-task validation must check that assumption.

For explicit timing optimization, use a bounded local state forecast and a Bellman-style choice:

```text
V(s) = min over feasible actions a {
  management(a) + request_cost(s, a)
  + P(continuation | s, a) * E[V(next_state) | s, a, continuation]
}
```

`keep` is an action, so this compares acting now with waiting. A stopped task has zero remaining cost. A finite computational forecast needs an explicit tail-cost estimate and uncertainty bound, not zero cost beyond the cutoff. Recompute before the next real request; never send background keepalive or review calls merely to improve the forecast. This is an approximate policy under a fitted model, not proof of optimal timing.

The simple payback diagnostic is `upfront incremental cost / per-request net saving` when the latter is positive. It explains a decision but is insufficient when TTL, tier changes or reuse probabilities vary over time.

## Paid selectors and summary models

Checking the rule requires no model call. Jev should run only when judgment could change which feasible action wins, and a conservative estimate of that improvement exceeds the selector's complete cost. A tie or uncertain relevance is not itself an economic justification to call Jev. Deterministic selection remains available.

Price the proposed compaction prompt and bounded output before the first summary call; prior summaries help calibrate rather than unlock the trigger. Initially retain the current summary model and protections. A cheaper summary model can be another candidate only after matched source-recovery and decision-preservation checks establish its eligibility. Cheap output does not eliminate cache rebuild costs or establish fidelity. After a summary returns, validate lineage, current revision, required information and actual reduction; include failed attempts in cost, and preserve the original projection on rejection.

## Offline sensitivity result

Run `node docs/archive/2026-10-03/compaction-cost-demo.mjs`. [Demo](compaction-cost-demo.mjs) and [saved output](compaction-cost-demo.json).

The synthetic example retains 20k tokens and considers reducing another 20k to a 200-token pointer or 2k-token summary. Four certain requests, 5% probability per request of a full source recovery priced at fresh base input, standard Sonnet rates, and a Sonnet summary call are assumed. These are supplied sensitivity inputs, not fitted predictions. The same recovery probability for pointer and summary is a simplification.

| Cache scenario | Keep | Pointer | Summary | Lowest priced option |
|---|---:|---:|---:|---|
| Warm; early edit invalidates retained suffix | $0.03200 | $0.07062 | $0.13620 | Keep |
| Expired before the next request | $0.12400 | $0.07062 | $0.13620 | Pointer |
| Warm; retained 20k has a reusable independent boundary | $0.03200 | $0.02462 | $0.09020 | Pointer |

Six scenario assertions passed, including high source reuse, uncertain continuation and a cheaper compressor. A cheap summary still loses in the warm-prefix example. The demo compares actions now under supplied assumptions; it does not implement the future-state timing solver, estimate quality or demonstrate billed savings. Answer output and additional recovery calls are omitted, so these are modeled context/management costs rather than whole-task totals.

## Implementation and validation sequence

Engine changes belong in `E:/Coding/converse/CLA/conclave` first, per AGENTS.md; migrate the tested committed engine into Converse afterward.

1. Add action-specific candidate pricing and telemetry in shadow mode. Observe choices on real traffic without changing context or making new paid calls. Initially use next-request economics where forecasts lack evidence.
2. Calibrate continuation, cache validity, recovery and summary-size intervals using existing logs; avoid fitting and evaluating on the same task records. Add the waiting comparison once state-transition forecasts have support.
3. Enable conservative automatic pointer/redundancy choices; replace periodic paid reviews with local evaluation. Then enable paid summary choices that pass the same comparison. Retain explicit compact and hard capacity handling, with reasons exposed in existing context activity rather than extra user settings.
4. Run fresh matched tasks against the current policy, including warm/cold caches, model switches, repeated source retrieval, protected exact content, unknown tiers and short tasks that stop immediately. Measure completion, source recovery, numerical/decision preservation, latency, all management/answer/recovery calls and provider cache buckets. Offline replay demonstrates pricing/layout consequences; only live matched tasks can support savings and quality claims.

Acceptance: no paid call just to discover whether compaction is due; the first-use decision works without past rewrite calls; identical context can choose differently for warm/cold caches; highly reused material can remain; unchanged rejected candidates are not repeatedly retried; users do not set economic thresholds; uncertainty and capacity overrides remain inspectable.
