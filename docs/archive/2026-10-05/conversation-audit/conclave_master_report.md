# Conclave Master Report

Generated 2026-10-05 10:42 · 2 conversations · 19 turns (2 failed) · 151 API calls

## Full history vs. working context

*History* = the full append-only conversation text (user, assistant, documents/workspace files, reasoning). *Working context* = what Conclave keeps in front of the model at the end. Characters of text; ≈ tokens is characters ÷ 4. *Where history items ended up* counts each original message or file as verbatim / condensed (summary, state entry or excerpt) / pointer only / not in context.

| Conversation | Turns | History chars | Working ctx chars | ≈ Tokens removed | Smaller by | Verbatim / condensed / pointer / not in context |
|---|---:|---:|---:|---:|---:|---:|
| [Pain, Gender, and Cultural Endurance Norms](conclave-reports/conv_1a4df655-e9a5-4267-8549-531dd081a7d4.md) | 10 | 364,169 | 20,431 | 85,934 | 94.4% | 8 / 20 / 6 / 64 |
| [Timeline for Mapping the Human Brain](conclave-reports/conv_3f9bab5b-e1c2-45ba-baec-486138868f86.md) | 9 | 685,468 | 47,787 | 159,420 | 93.0% | 18 / 13 / 1 / 19 |
| **All conversations** | 19 | **1,049,637** | **68,218** | **245,355** | **93.5%** | 26 / 33 / 7 / 83 |

## Cost and calls

| Measure | Value |
|---|---:|
| Tokens in / out | 3,811,274 / 99,940 |
| Cached input | 2,331,079 |
| Context-management input | 28,907 (0.8% of input) |
| Answer input: actual vs. full-history est. | 3,493,639 vs. 14,976,204 |
| Est. savings vs. append mode (gross, uncached) | +76.7% |
| Est. savings after management cost (net, uncached) | +76.5% |
| Conversations with incomplete usage | 1 |

*Net* = estimated billed input saved vs. append mode after management cost (before cache discounts).

| Conversation | Created | Turns ok | Calls | Input tok | Cached | Peak req tok | Net | Mgmt | Jev calls | Flags |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| [Pain, Gender, and Cultural Endurance Norms](conclave-reports/conv_1a4df655-e9a5-4267-8549-531dd081a7d4.md) | 2026-10-05 | 7/10 | 109 | 2,844,468 | 61% | 56,882 | +73.2% | 1.0% | 0 | 8 |
| [Timeline for Mapping the Human Brain](conclave-reports/conv_3f9bab5b-e1c2-45ba-baec-486138868f86.md) | 2026-10-04 | 9/9 | 42 | 966,806 | 60% | 67,663 | +83.3% | 0.0% | 0 | 4 |

## Recurring failures

- **turn_failure** x1 in 1 conversation(s): Stopped at 16 answer calls; history and context were saved
- **inference_failure (answer)** x1 in 1 conversation(s): Agent stopped; the active request was cancelled.
- **inference_failure (retrieval-reranking)** x1 in 1 conversation(s): Connection terminated due to connection timeout
- **turn_failure** x1 in 1 conversation(s): Connection terminated due to connection timeout

## Feature coverage

Conversations (of 2) that exercised each capability:

| Capability | Conversations |
|---|---:|
| Named state (model update_state) | 2 |
| Named state (manual /remember) | 0 |
| update_state rejections | 2 |
| Pins | 0 |
| Documents / workspace files | 2 |
| Retrieval | 2 |
| Offload to pointers | 2 |
| Compaction committed | 0 |
| Paid compaction discarded/rejected | 0 |
| Budget recovery | 1 |
| Jev enabled | 2 |
| Jev actually called | 0 |

## Flags by conversation

**[Pain, Gender, and Cultural Endurance Norms](conclave-reports/conv_1a4df655-e9a5-4267-8549-531dd081a7d4.md)**
- 2 of 10 turns failed (see Failures).
- Usage is incomplete in this export; token totals are lower bounds.
- 1 of 4 update_state calls were rejected (Unknown state relationship target x1).
- 26 embedding failures; semantic retrieval is not demonstrated.
- Paid reranking produced no logged change from the deterministic shortlist; quality benefit is unmeasured.
- Some shadow evaluations exceeded allowances or were unavailable; fail-open answers do not demonstrate working cost optimization.
- Identical retrieval arguments occurred at least three times. Inspect per-turn requests to distinguish necessary revisits from loops.
- 35 newly retrieved large outputs lack their direct tool output in the next answer request. Handoff excerpts are not equivalent to complete source delivery.

**[Timeline for Mapping the Human Brain](conclave-reports/conv_3f9bab5b-e1c2-45ba-baec-486138868f86.md)**
- Jev was enabled with no recorded calls (peak answer request reached 79% of the byte guard). Transient tool-output pressure is separate from selection eligibility; benefit remains unmeasured.
- 1 of 3 update_state calls were rejected (Supply 1–8 state updates x1).
- Capture completed without automatic entries; named state is a separate store. Empty capture is not proof of failed extraction.
- Some shadow evaluations exceeded allowances or were unavailable; fail-open answers do not demonstrate working cost optimization.

---

*Method:* the history vs. working-context comparison counts characters of text only: no metadata, instructions or tool definitions on either side. It measures how much Conclave keeps in front of the model, not what the provider billed. Billed token figures are the providers' reported usage (Anthropic cache reads/writes added to input). Estimated savings are an offline reconstruction, not a paid comparison, and do not account for prompt-cache discounts: each answer request's working-context message is replaced by the append-mode history (user, assistant, document and reasoning events, plus ~250 bytes of source header each), keeping instructions, tools and tool exchanges fixed, then converted to tokens using that request's own bytes-per-token ratio. This ratio is a rough proxy, not a tokenizer replay or matched baseline. Net subtracts context-management input (selection, compaction, reranking, classification, memory extraction), not web search. It says nothing about answer quality; fidelity still needs a human read.
