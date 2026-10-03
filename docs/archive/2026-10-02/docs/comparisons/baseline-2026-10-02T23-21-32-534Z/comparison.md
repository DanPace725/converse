# Full-history baseline comparison

Status: **completed**. Spending cap: removed by user authorization; conservative ledger debit: $8.146604. Five original substantive prompts were scheduled with the same model order, effort, 16,384-token output allowance and two exact user uploads. Retry-only prompts were omitted. All artifacts remain local.

Matched completed turns: **5 of 5**. The table compares only those same completed workload turns.

| Metric | Matched historical successful turns | Matched fresh baseline turns |
|---|---:|---:|
| Submitted calls | 61 | 53 |
| Task-model calls | 55 | 53 |
| Management calls | 6 | 0 |
| Known input tokens | 1,229,656 | 4,973,741 |
| Known output tokens | 74,658 | 108,119 |
| Cache-read tokens | 965,969 | 2,511,570 |
| Cache-write tokens | 250,759 | 2,461,199 |
| Largest reported input | 53,975 | 261,167 |
| Largest serialized native input (bytes) | 169,625 | 812,578 |
| Output-limit responses | 0 | 1 |
| Calls with unknown usage | 0 | 0 |
| Known public-rate valuation | $1.522174–$1.691989 | $7.666878–$8.146604 |

The baseline's entire recorded run, including any partial turn, values at **$7.666878–$8.146604**. All five historical successful runs value at $1.522174–$1.691989.

The original whole conversation, including failures and its title call, values at $1.703777–$1.888719 plus unknown timeout usage. Historical successful runs are not a clean failure-free control: they could use preparatory state or workspace actions from failed attempts. Missing usage is excluded from known valuation, not charged as zero.

The fresh baseline recorded 1 response(s) that exhausted the unchanged output allowance. Their reported usage is included in cost; tools from incomplete responses did not execute. Continuations use saved responses and explicit skipped-tool receipts, rather than replaying completed requests.

| Turn | Model | Baseline outcome / steps | Historical successful USD | Baseline USD |
|---:|---|---|---:|---:|
| 1 | gpt-6.1-sol | completed / 10 | $0.088432–$0.148515 | $0.132963–$0.223470 |
| 2 | claude-sonnet-5-5 | completed / 6 | $0.203230–$0.203230 | $0.589099–$0.589099 |
| 3 | gpt-6.1-sol | completed / 15 | $0.144921–$0.254654 | $0.418633–$0.807851 |
| 4 | claude-sonnet-5-5 | completed / 13 | $0.364553–$0.364553 | $3.000822–$3.000822 |
| 5 | claude-sonnet-5-5 | completed / 9 | $0.721037–$0.721037 | $3.525361–$3.525361 |

## What this comparison measures

The baseline sends complete user/final assistant history and prior tool arguments/results, and retains all native tool exchanges within each turn. It does not select context, run Jev, compact, offload, maintain named state, or use a bounded handoff. It shares workspace and arithmetic execution so those capabilities stay available. Private reasoning is not forwarded between different models. The baseline's SQLite source/segment indexes are audit storage, not a Conclave working projection sent to the model; their text-size ratios must not be called savings.

This compares two freely generated trajectories. A lower cost could reflect less reasoning, shorter documents, fewer tools or calls, cache behavior, or different quality. A larger input alone does not establish more expensive billing. Exact original answers, state, and artifacts were not seeded into the baseline. The baseline paused at the initial spending cap; cache expiry during that pause can affect its recorded cost. See [PROTOCOL.md](PROTOCOL.md) and [recipe.json](recipe.json) for all changes.

## Saved workspace artifacts

| File | Characters | Writer | Recorded reads of latest version |
|---|---:|---|---:|
| [homelessness_policy_plan.md](artifacts/homelessness_policy_plan.md) | 31,180 | openai | 12 |
| [homelessness_plan_addendum_claude.md](artifacts/homelessness_plan_addendum_claude.md) | 19,546 | anthropic | 3 |
| [homelessness_operating_package_openai.md](artifacts/homelessness_operating_package_openai.md) | 22,573 | openai | 3 |
| [homelessness_decision_memo_claude.md](artifacts/homelessness_decision_memo_claude.md) | 16,359 | anthropic | 3 |
| [multnomah_county_homelessness_research_packet.md](artifacts/multnomah_county_homelessness_research_packet.md) | 19,556 | human | 3 |
| [homlesness.md](artifacts/homlesness.md) | 3,335 | human | 1 |
| [homelessness_architecture_part1_claude.md](artifacts/homelessness_architecture_part1_claude.md) | 14,882 | anthropic | 2 |
| [homelessness_architecture_part2_claude.md](artifacts/homelessness_architecture_part2_claude.md) | 13,909 | anthropic | 2 |
| [homelessness_architecture_part3_claude.md](artifacts/homelessness_architecture_part3_claude.md) | 11,381 | anthropic | 2 |
| [homelessness_architecture_part4_claude.md](artifacts/homelessness_architecture_part4_claude.md) | 14,323 | anthropic | 2 |

Readbacks establish complete inspection under the shared workspace checks, not independent factual validation. Further comparison should inspect numerical assumptions, uncertainty, attribution, preserved constraints, use of the source packet and the final localized plan.

[ledger.json](ledger.json) records reservations and latencies; [baseline-export.json](baseline-export.json) preserves complete requests, responses and tools. [costs.json](costs.json) contains per-call valuation. Public pricing references: [OpenAI](https://developers.openai.com/api/docs/pricing), [Claude](https://platform.claude.com/docs/en/about-claude/pricing), [Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev).
