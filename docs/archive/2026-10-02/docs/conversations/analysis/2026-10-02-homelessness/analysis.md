# Cost and Context Garden audit: homelessness policy conversation

Analyzed October 2, 2026. This is the latest snapshot of an existing conversation, rather than an independent conversation to add to earlier cumulative totals. The [canonical export](../../Comprehensive%20Policy%20Plan%20to%20Address%20Homelessness_2026-10-02T22-44-59-328Z.json) was exported at 3:44:59 PM Pacific; the [screenshot](../../Screenshot%202026-10-02%20154448.png) was taken about eleven seconds earlier. Their final revision and displayed counts match.

The screenshot's arithmetic reproduces exactly. Its “tokens saved” and “replies” labels do not accurately describe measured savings or completed user replies. The latest run completed successfully and provides live evidence that the larger tool batches work.

## Recorded costs

| Provider / model | Submitted calls | Calls with usable usage | Known public-rate valuation |
|---|---:|---:|---:|
| GPT / gpt-6.1-sol, including title generation | 29 | 28 | $0.253262–$0.438204 |
| Claude / claude-sonnet-5-5 | 34 | 34 | $1.449877 |
| Jev / jev-latest | 7 | 7 | $0.000638 |
| Total | 70 | 69 | **$1.703777–$1.888719** |

The total excludes unknown usage from the original timed-out GPT response. It is a valuation of recorded usage at public standard API rates, not a complete invoice or a hard upper bound on actual charges. OpenAI's published short/long-context rates differ, but the numeric tier boundary remains unverified in the consulted sources, so the existing pricing snapshot retains a range. No missing usage is assigned zero cost.

Rates were rechecked against [OpenAI pricing](https://developers.openai.com/api/docs/pricing), the [GPT model page](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing), and [TypeSafe's Jev announcement](https://typesafe.ai/blog/introducing-system-one-models-and-jev). Claude's rates are $2 input, $0.20 cache read, $2.50 five-minute cache write, $4 one-hour cache write, and $10 output per million tokens. Jev is $0.042 per million input tokens with free output. The exported Claude TTL buckets allow the cache-write cost to be resolved directly.

The recorded known usage totals 1,295,351 input tokens and 83,121 output tokens across all calls, including title generation and Jev. These are cumulative tokens across many requests; they are not the size of one context window.

| Run, ordered by start | Task model | Completed steps | Outcome | Known valuation, including management within that run |
|---|---|---:|---|---:|
| 1 | GPT | 4 | Failed: original response timeout | $0.019415–$0.034045, plus unknown timeout usage |
| 2 | GPT | 9 | Completed | $0.088433–$0.148515 |
| 3 | Claude | 9 | Completed | $0.203230 |
| 4 | GPT | 14 | Completed | $0.144921–$0.254654 |
| 5 | Claude | 2 | Failed: original eight-call restriction | $0.161626 |
| 6 | Claude | 8 | Completed | $0.364553 |
| 7 | Claude | 15 | Completed | **$0.721037** |

The separately generated title accounts for $0.000562–$0.001059 outside these run intervals. Run 7 lasted about 8 minutes 44 seconds. Its checkpoint records 466,634 input and 37,840 output tokens, including management. It performed 21 workspace reads, 35 calculations, one document write, and one state update. Batches of sixteen and twelve calculations were admitted; the earlier failed run's ten-calculation batch predates the fix.

## Screenshot verification

| Displayed value | Reproduced value | Assessment |
|---|---:|---|
| Revision 26 | 26 | Exact |
| 26 working pieces | 26 | Exact |
| 10 protected | 10 | Exact under the Garden's pinned / verbatim / named-state rule |
| 45 saved sources | 45 | Exact: 7 user messages, 5 final assistant messages, 7 document versions, 26 reasoning records |
| Conclave next request ~14K | 13,965 | Exact local o200k serialized-input estimate; provider preflight count is absent |
| Whole chat ~58.8K | 58,815.35 | Exact reproduction of the current proportional byte-ratio proxy; no full-history native request was counted |
| Next request −76% | −76% after rounding | Correct for that proxy, not a verified billed-cost reduction |
| 1.4M avoided | 1,356,888 | Correct rounding of the current cumulative proxy |
| 17.6K upkeep | 17,583 | Recorded Jev input plus output; output tokens are free under the published Jev rate |
| ~1.3M tokens saved | 1,339,305 | Correct subtraction; unsupported as a measured savings claim |
| 62 replies | 62 answer-model requests | Misleading label: 61 completed responses, one partial response, and only 5 completed user turns |

The next-request calculation uses 59,213 serialized bytes and 13,965 local tokens, a ratio of about 0.236 tokens per byte. It assigns 26,260 working-text bytes about 6,193 tokens and treats the remaining 7,772 tokens as a fixed component. Replacing those working bytes with 216,430 source-history bytes produces 58,815 proxy tokens. The fixed component includes projection metadata, attribution, workspace manifest and other framing; calling all of it “instructions & tools” is also imprecise.

The ~14K value previews a fresh request after completion. The last actual Claude request included continuation history: its local estimate was 25,432 tokens and its provider-reported input was **35,983**. These values describe different requests and different counters. In this conversation Claude's median reported-input/local-estimate ratio was 1.461, with a maximum of 1.694; GPT's median was 0.799. A generic o200k estimate needs an explicit fallback label for Claude and should not be treated as its native token count.

## Why the cumulative savings claim needs correction

The code subtracts each request's saved working-text size from all historical source text, converts the byte difference using that request's input-token/byte ratio, and sums the results. It then subtracts management input plus output tokens.

This is useful as a text-projection indicator, but it does not establish what ordinary Chat would have sent or charged. The baseline includes superseded document versions and provider reasoning records. These are valuable audit sources, but resending all of them on every tool step is not the same as replaying the user-visible transcript. It also omits native request construction, continuation/tool receipts, provider-specific framing, counterfactual caching and model-dependent prices. Subtracting cheap/free Jev tokens from frontier-model input tokens cannot establish dollar savings.

There is a specific accounting mismatch: **21 of 62 answer requests** used a frozen projection from an earlier revision, while the savings code looked up the current revision recorded in request metadata. Frozen projections are expected behavior; this is a measurement error, not evidence of lost context. Using the content actually serialized in those requests changes the avoided-text proxy from 1,356,888 to 1,363,973 tokens, a 7,085 difference. The adjusted figure still does not establish actual savings.

The partial GPT response uses the algorithm's fallback ratio because reported usage is missing. It contributes zero avoided proxy tokens here, so it does not explain the large number, but it still appears in the misleading “62 replies” count.

## Context management and cost implications

The final working text is 26,209 characters versus 216,098 historical source characters: **87.87% less saved text**. This is not a transmitted-token or dollar-savings measure. The audit contains two offloads: revision 13 shrank saved working text from 11,164 to 7,902 characters, and revision 23 from 21,616 to 19,192. A separate edit removed superseded workspace excerpts. All final segment source IDs resolve to saved events.

Six workspace files remain, with recorded reads of each latest version. Source linkage and readback records verify persistence and inspection, not the factual correctness of the policy research. Named state preserves authorship, localization questions, and the important mean-versus-median qualification across GPT/Claude switches. A review target remains: early protected state still describes an unspecified jurisdiction and an illustrative generic scenario, while the newest state adopts Multnomah County as an assistant-selected working jurisdiction and retires that budget scenario. Those earlier anchors should be marked historical or updated so future models do not mistake them for current instructions.

Caching is the clearest recorded billing signal: GPT has 262,655 cache-read tokens out of 298,857 known input tokens (87.9%); Claude has 727,838 out of 981,298 (74.2%). Claude's 253,378 cache-write tokens are already included in normalized input, not added again. At public rates, Claude's input buckets value at $0.779177 and its output at $0.670700. Jev costs less than 0.04% of the known whole-conversation valuation; disabling it is unlikely to be the useful first cost lever.

Output is a material lever. The latest run reports 19,311 thinking tokens within its 37,840 output tokens, about 51%. At Claude's published rate those thinking tokens value at $0.193110. Lower effort is a candidate experiment, not a guaranteed reduction with equivalent quality.

## Next iteration

1. Correct the Garden's wording first: show an “estimated context comparison,” label the cumulative figure as a projection proxy or remove it, use “model requests” instead of “replies,” and show missing usage. Keep the fresh-next estimate separate from the last provider-reported request.
2. Measure the actual saved native requests and frozen projections. Compare equally specified full-history and managed-context requests with the same tools, instructions, evidence/version policy and output allowance. Price cache buckets separately. Record measured usage and counterfactual estimates as separate fields.
3. Use provider preflight counting when explicitly requested or at useful guard boundaries; cache only identical request fingerprints. Preserve the byte guard. Calibrate estimates from matched requests without turning historical ratios into exact future counts.
4. Preserve stable cache prefixes and bounded continuations. Optimize redundant reads and verification rounds while retaining complete document readback; keep independent calculation batches within sixteen calls. Jev's extremely small recorded cost makes output effort and extra frontier requests the more promising experiments.
5. Update or mark superseded named state, then compare current effort against a lower effort setting on the same prompts and documents under a new explicit spend cap. Evaluate attribution, budget assumptions, numerical qualifications, document preservation and task completion alongside USD and call count. This analysis performed no new paid replay.

The source export and screenshot remain unchanged and local. [audit.json](audit.json) contains source hashes, exact reconstructed values, per-request projection revisions, per-run costs and estimator ratios. [request-costs.md](request-costs.md) lists every call; [conversation-diagnostics.md](conversation-diagnostics.md) records failures and guards. Reproduce from the repository root with `node .agent-smoke/analyze-homelessness.mjs`. Application code and the deployed app were not modified during this analysis.
