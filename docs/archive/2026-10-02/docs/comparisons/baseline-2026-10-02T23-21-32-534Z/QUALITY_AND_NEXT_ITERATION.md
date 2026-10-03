# Interpretation and next cost iteration

The local full-history sandbox finished all five original substantive prompts. A production “disable Conclave” switch was unnecessary for this pass. The sandbox used the same workspace/calculation implementation, model order, effort, 16,384-token response allowance, and exact uploaded documents, while bypassing managed context. [comparison.md](comparison.md) contains the measured comparison, [PROTOCOL.md](PROTOCOL.md) explains the differences, and [verification.json](verification.json) records the audit checks.

## What the measurements support

The baseline's 53 submitted model requests have reported input/output usage and known public-rate valuations, including one output-limit response. One earlier spending preflight block was never submitted and is excluded. The ledger upper valuation reconciles to the per-call report within floating-point precision. The original source hash is unchanged, and both uploads match the original content hashes. Five final assistant reports and complete latest-file readbacks are recorded.

For the five matched workload turns, the historical successful runs used 61 calls (55 task, six management), versus 53 task calls in the baseline. Input rose from 1,229,656 to 4,973,741 tokens; peak input rose from 53,975 to 261,167. Known valuation rose from $1.522174–$1.691989 to $7.666878–$8.146604. Provider response latency sums are 872.1 versus 1,151.7 seconds; these sums exclude pauses and are not total wall-clock duration.

The recorded cache-read fraction is about 78.6% in the historical successful requests and 50.5% in the baseline. The baseline wrote 2,461,199 cache tokens versus 250,759 historically. These are billing-relevant observations, rather than treating all input tokens at the same price. They do not isolate a causal effect: the baseline accumulated complete tool receipts, generated different documents, paused at its initial cap, and continued after a reported output-limit stop. Cache expiry during the pause can affect costs.

## Limited quality review

The two trajectories produced different plans. The fresh run's eight latest model-written files total 144,153 characters; the historical run's four total 95,889. More text is not automatically better. The fresh final architecture alone spans four files and 54,495 characters, versus the historical localized architecture's 31,885. Output tokens were 108,119 versus 74,658.

The fresh architecture covers the uploaded prompts' major areas: governance, intake, allocation under scarcity, provider contracts, landlord pipeline, workforce, data accountability, failure modes, surge, siting, rural adaptations, decisions, unresolved evidence, and prioritized next work. It attributes its work to Claude, distinguishes packet data/calculations/placeholders/unverified background, and expressly retires generic headcount and dollar assumptions as local sizing. Its final ledger and three next tasks are present. Latest-file readback records support inspection and persistence, not policy correctness.

Some useful qualifications survived without managed context: the stock/exit ratio is expressly not an actual duration estimate, the housing-search calculation uses average duration while the service target uses median duration, and unknown inflow/total exits remain unresolved. These checks establish examples of preserved uncertainty, not complete factual equivalence with the historical run.

A review issue remains in fresh Part 1, section 2.5: “the hypothetical plan excluded capital” is too broad. The base plan explicitly includes a $324.875m capital/gap envelope within its $560.875m five-year total; the referenced $55m annual operating figure excludes capital. This wording needs correction before reusing the policy document. The generated file is preserved unchanged so the benchmark retains the model's actual output.

Both trajectories have older generic documents alongside a localized final plan. Future evaluations should test whether a subsequent model actually respects the latest reconciliation, rather than treating a written retirement statement as proof that obsolete assumptions cannot recur. The historical successful runs also inherited some work from failed attempts; they are not a clean freshly generated control.

## Next iteration

1. **Make the Garden's accounting honest and reproducible.** Show provider-reported last-request usage and cumulative usage separately from next-request estimates. Label context-selection ratios as estimates; use the actual frozen request content rather than looking up a newer projection revision. Distinguish serialized bytes, tokenizer estimates, cache buckets, missing usage, and known public-rate USD. Validate against this canonical export and the original screenshot audit.

2. **Target repeated frontier input and cache writes first.** Keep stable system/tool prefixes and native in-turn cache boundaries. Measure how much complete workspace read/write receipts, superseded versions, and audit metadata add to each request. Preserve authoritative current file versions, attribution, corrections, and full readback coverage while reducing repeated transmission. A compact receipt must point to saved content that the model can retrieve; it must not silently discard required evidence. Compare the actual provider-serialized payload before/after on identical saved states, then price the recorded cache buckets separately.

3. **Control output exhaustion and evaluate quality at a fixed workload.** The exhausted final-turn response spent 13,189 of its 16,384 output tokens on thinking, leaving an unfinished write. Encourage smaller complete writes and preserve explicit skipped-action receipts. Test lower effort separately from context changes, with the same tools, prompts, artifact requirements, and source packet. Score arithmetic qualifications, assumptions, attribution, required-topic coverage, preserved edits, current-version precedence, task completion, and USD together. A smaller or faster response that misses those requirements is not a successful optimization.

The next paid comparison should use fresh managed-context and full-history runs with matching tool schemas and task instructions, plus a deterministic request-construction comparison from identical saved states. This completed sandbox supplies workload fixtures and measured observations; it does not justify a fixed percentage savings claim or removal of Jev based on its token count.
