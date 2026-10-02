# Conclave Master Report

Generated 2026-10-02 10:13 · 11 conversations · 101 turns (8 failed) · 324 API calls

## Overall

| Measure | Value |
|---|---:|
| Tokens in / out | 4,838,280 / 183,753 |
| Cached input | 974,881 |
| Context-management input | 67,333 (1.4% of input) |
| Answer input: actual vs. full-history est. | 4,769,409 vs. 6,198,466 |
| Est. savings vs. append mode (gross) | +23.1% |
| Est. savings after management cost (net) | +22.0% |
| Conversations with incomplete usage | 2 |

## Conversations

*Ctx/hist* = final working context as a share of full history (chars). *Net* = estimated input saved vs. append mode after management cost.

| Conversation | Created | Turns ok | Calls | Input tok | Peak req tok | Ctx/hist | Net | Mgmt | Jev calls | Flags |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| [Testing Assistant Capabilities and Functions](Report/conv_b65bc693-2839-4ff5-a3ce-31d9ba602b42.md) | 2026-10-02 | 8/8 | 65 | 618,695 | 26,108 | 39% | +12.9% | 3.6% | 11 | 3 |
| [Testing the App and Capabilities](Report/conv_29711123-738b-4701-b7f2-716a1d2baea4.md) | 2026-10-02 | 5/5 | 27 | 502,289 | 58,294 | 16% | +52.0% | 0.8% | 3 | 2 |
| [Brain's Efficient Information Storage Capacity](Report/conv_550f6b41-7b14-4322-aeaa-1624ccf60db1.md) | 2026-10-02 | 19/24 | 39 | 1,336,281 | 85,066 | 35% | -1.5% | 0.0% | 0 | 5 |
| [Document Reading Request](Report/conv_1acde777-ef0d-471b-8e95-bdad014149db.md) | 2026-10-02 | 14/14 | 68 | 1,290,472 | 48,918 | 16% | +38.4% | 0.0% | 0 | 2 |
| [How the Brain Stores Memories](Report/conv_b53ebbe1-a7b3-403a-8dc3-f2b40cd67582.md) | 2026-10-01 | 12/14 | 49 | 714,542 | 27,351 | 69% | -5.6% | 0.0% | 0 | 6 |
| [Designing Associative Memory for AI Agents](Report/conv_3cb9a9e8-7d42-4f37-8d30-632c321fefe4.md) | 2026-10-01 | 2/4 | 5 | 21,878 | 8,022 | 47% | +1.4% | 0.0% | 0 | 4 |
| [You are responsible for designing a realistic l…](Report/conv_af2bc22d-b525-4727-ae99-8137d8e0b6fa.md) | 2026-10-01 | 8/8 | 28 | 205,484 | 16,569 | 46% | +4.4% | 3.5% | 0 | 0 |
| [Algorithms for Chess’s Combinatorial Complexity](Report/conv_e0427e3c-bfc8-4bba-9d75-0b8000dd4a56.md) | 2026-10-01 | 7/11 | 17 | 72,493 | 7,793 | 36% | -18.3% | 11.3% | 3 | 7 |
| [This is a short deployment check. Reply with ex…](Report/conv_8aa1a561-63d8-4dba-b345-8c16723b0b7c.md) | 2026-10-01 | 1/1 | 1 | 1,156 | 1,156 | 100% | -2.2% | 0.0% | 0 | 2 |
| [What's the tldr on Btc from where it started to…](Report/conv_944a48ee-220c-4917-a94a-b8b834c74f1d.md) | 2026-10-01 | 11/11 | 24 | 73,816 | 6,469 | 43% | -36.1% | 35.3% | 6 | 4 |
| [Local integration smoke test: our sample projec…](Report/conv_5a7a1139-8413-4ebb-8846-13c1afb07ef7.md) | 2026-10-01 | 1/1 | 1 | 1,174 | 1,174 | 100% | -2.2% | 0.0% | 0 | 2 |

## Recurring failures

- **turn_failure** x5 in 1 conversation(s): Signed Claude continuation exceeds the context budget. Saved progress is retained. Increase the input budget or start a new turn; earlier s…
- **inference_failure (answer)** x2 in 2 conversation(s): OpenAI 400: Unsupported value: 'none' is not supported with the 'gpt-6.1-sol' model. Supported values are: 'low', 'medium', 'high', 'xhigh'…
- **turn_failure** x2 in 2 conversation(s): OpenAI 400: Unsupported value: 'none' is not supported with the 'gpt-6.1-sol' model. Supported values are: 'low', 'medium', 'high', 'xhigh'…
- **turn_failure** x1 in 1 conversation(s): Context budget exceeded: 28798 estimated input units + 4096 output reserve > 32000. Compact/evict unprotected context, increase the input b…

## Feature coverage

Conversations (of 11) that exercised each capability:

| Capability | Conversations |
|---|---:|
| Named state (model update_state) | 7 |
| Named state (manual /remember) | 1 |
| update_state rejections | 4 |
| Pins | 0 |
| Documents / workspace files | 7 |
| Retrieval | 7 |
| Offload to pointers | 5 |
| Compaction committed | 2 |
| Paid compaction discarded/rejected | 2 |
| Budget recovery | 2 |
| Jev enabled | 10 |
| Jev actually called | 4 |

## Flags by conversation

**[Testing Assistant Capabilities and Functions](Report/conv_b65bc693-2839-4ff5-a3ce-31d9ba602b42.md)**
- Peak request used 97% of the byte budget.
- No named state or pins in a multi-turn conversation; everything relies on unprotected context.
- 50 of 147 Jev assessments were escalated by the confidence gate.

**[Testing the App and Capabilities](Report/conv_29711123-738b-4701-b7f2-716a1d2baea4.md)**
- Peak request used 95% of the byte budget.
- 8 of 43 Jev assessments were escalated by the confidence gate.

**[Brain's Efficient Information Storage Capacity](Report/conv_550f6b41-7b14-4322-aeaa-1624ccf60db1.md)**
- Layered requests were larger than append mode would have sent (est. -1.5%); working-context overhead outweighed what it removed.
- 5 of 24 turns failed (see Failures).
- Jev was enabled but never called, even though requests reached 97% of budget (context management normally starts at 75%).
- 2 of 9 update_state calls were rejected (Unknown bundle x2).
- Peak request used 97% of the byte budget.

**[Document Reading Request](Report/conv_1acde777-ef0d-471b-8e95-bdad014149db.md)**
- Jev was enabled but never needed (peak request reached 59% of budget; selection only runs near 75%).
- 5 of 9 update_state calls were rejected (Unknown bundle x4, Stale revision; current revision is 24 x1).

**[How the Brain Stores Memories](Report/conv_b53ebbe1-a7b3-403a-8dc3-f2b40cd67582.md)**
- Layered requests were larger than append mode would have sent (est. -5.6%); working-context overhead outweighed what it removed.
- 1 of 14 turns failed (see Failures).
- 1 user message(s) have no recorded answer or failure (interrupted or resubmitted?).
- Usage is incomplete in this export; token totals are lower bounds.
- Jev was enabled but never needed (peak request reached 48% of budget; selection only runs near 75%).
- 1 of 3 update_state calls were rejected (Stale revision; current revision is 35 x1).

**[Designing Associative Memory for AI Agents](Report/conv_3cb9a9e8-7d42-4f37-8d30-632c321fefe4.md)**
- 1 of 4 turns failed (see Failures).
- 1 user message(s) have no recorded answer or failure (interrupted or resubmitted?).
- Usage is incomplete in this export; token totals are lower bounds.
- Jev was enabled but never needed (peak request reached 22% of budget; selection only runs near 75%).

**[Algorithms for Chess’s Combinatorial Complexity](Report/conv_e0427e3c-bfc8-4bba-9d75-0b8000dd4a56.md)**
- Layered requests were larger than append mode would have sent (est. -4.9%); working-context overhead outweighed what it removed.
- 1 of 11 turns failed (see Failures).
- 3 user message(s) have no recorded answer or failure (interrupted or resubmitted?).
- 2 of 4 update_state calls were rejected (Unknown bundle x2).
- 1 paid compaction call(s) were discarded or rejected.
- Peak request used 98% of the byte budget.
- 17 of 39 Jev assessments were escalated by the confidence gate.

**[This is a short deployment check. Reply with exactly: Conte…](Report/conv_8aa1a561-63d8-4dba-b345-8c16723b0b7c.md)**
- Layered requests were larger than append mode would have sent (est. -2.2%); working-context overhead outweighed what it removed.
- Jev was enabled but never needed (peak request reached 35% of budget; selection only runs near 75%).

**[What's the tldr on Btc from where it started to now?](Report/conv_944a48ee-220c-4917-a94a-b8b834c74f1d.md)**
- Context management cost more than it saved: est. gross +11.9%, net -36.1% vs. append mode.
- 4 paid compaction call(s) were discarded or rejected.
- Peak request used 100% of the byte budget.
- 36 of 92 Jev assessments were escalated by the confidence gate.

**[Local integration smoke test: our sample project is a garde…](Report/conv_5a7a1139-8413-4ebb-8846-13c1afb07ef7.md)**
- Layered requests were larger than append mode would have sent (est. -2.2%); working-context overhead outweighed what it removed.
- Jev was enabled but never needed (peak request reached 35% of budget; selection only runs near 75%).

---

*Method:* token figures are the providers' reported usage (Anthropic cache reads/writes added to input). Savings are an offline reconstruction, not a paid comparison: each answer request's working-context message is replaced by the append-mode history (user, assistant, document and reasoning events, plus ~250 bytes of source header each), keeping instructions, tools and tool exchanges fixed, then converted to tokens using that request's own bytes-per-token ratio. Net subtracts all context-management input (selection, compaction). It says nothing about answer quality; fidelity still needs a human read.
