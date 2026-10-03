# Document Reading Request

`conv_1acde777-ef0d-471b-8e95-bdad014149db` · created 2026-10-02 00:25 · exported 2026-10-02 01:48 · mode **layered**

Settings (last turn): jev=True, model=claude-sonnet-5-5, budget=256000, output=16384, provider=anthropic, reasoning=none

## Full history vs. working context

The full conversation is everything append-only mode would resend every call: user messages, assistant replies, documents/workspace files and reasoning summaries. The working context is what Conclave actually keeps in front of the model at the end. Both are measured in characters of text; tokens are approximate (characters ÷ 4).

|  | Characters | ≈ Tokens |
|---|---:|---:|
| Full conversation history (append-only) | 130,728 | 32,682 |
| Working context at end | 21,086 | 5,272 |
| **Removed from working context** | **109,642** | **83.9%** smaller |
| Largest working context during the conversation | 42,183 | 10,546 |

What the full history is made of:

| Source | Characters | Share |
|---|---:|---:|
| Documents and workspace files | 92,600 | 71% |
| Assistant replies | 37,038 | 28% |
| User messages | 1,090 | 1% |

What the working context is made of:

| Content | Characters | Share |
|---|---:|---:|
| Summaries, edits and excerpts | 10,514 | 50% |
| Verbatim messages and files | 6,796 | 32% |
| Named state entries | 3,776 | 18% |

Where each history item ended up:

| Placement | Items | Characters of original text |
|---|---:|---:|
| Still in working context word for word | 6 | 6,796 |
| Represented by a summary, state entry or excerpt | 14 | 113,694 |
| Represented only by a retrieval pointer | 0 | 0 |
| Not in working context (kept in history, retrievable) | 15 | 10,238 |

### By turn

| # | User message | History chars | Working ctx chars | Smaller by | Largest request (billed tokens) | Calls | Outcome |
|---:|---|---:|---:|---:|---:|---:|---|
| 1 | Can you read this document? | 14,030 | 4,814 | 66% | 10,968 | 4 | ok |
| 2 | What are your thoughts about the ATP concept? | 17,659 | 8,443 | 52% | 8,250 | 3 | ok |
| 3 | Sol, what's your take? Does it survive counterexa… | 24,015 | 14,799 | 38% | 6,082 | 4 | ok |
| 4 | Claude what if you tested it with Sol's suggestio… | 39,866 | 19,813 | 50% | 24,175 | 4 | ok |
| 5 | what if you keep developing the idea in a way tha… | 42,058 | 22,005 | 48% | 8,206 | 1 | ok |
| 6 | Ok can you do that? | 45,372 | 25,319 | 44% | 9,589 | 12 | ok |
| 7 | Write a summary doc and save key details to memor… | 53,891 | 29,438 | 45% | 17,104 | 6 | ok |
| 8 | Where should we go from here? | 56,891 | 32,438 | 43% | 21,116 | 1 | ok |
| 9 | There should be a way for you to retrieve remembe… | 59,059 | 34,606 | 41% | 25,724 | 2 | ok |
| 10 | You can save the things you want to and then writ… | 71,701 | 41,291 | 42% | 41,767 | 5 | ok |
| 11 | Summarize the conversation and compact the contex… | 72,536 | 42,126 | 42% | 21,376 | 3 | ok |
| 12 | Summarize the conversation and compact the contex… | 72,844 | 6,715 | 91% | 22,488 | 4 | ok |
| 13 | You can keep the vfx thing, use money and time, a… | 89,858 | 12,436 | 86% | 37,165 | 8 | ok |
| 14 | Here's a report from a Sol instance with web acce… | 130,728 | 21,086 | 84% | 48,918 | 11 | ok |

A negative *Smaller by* means the working context held more than the history: named state and excerpts are added on top of verbatim messages until something is compacted or offloaded.

## Review notes

- Jev was enabled but never needed (peak request reached 59% of budget; selection only runs near 75%).
- 5 of 9 update_state calls were rejected (Unknown bundle x4, Stale revision; current revision is 24 x1).

## Cost and calls

Billed request size includes instructions, tool definitions and tool exchanges on top of the working context, so it is larger than the working-context figures above.

| Measure | Value |
|---|---:|
| Turns (ok / failed / total) | 14 / 0 / 14 |
| API calls | 68 |
| Tokens in / out | 1,290,472 / 57,037 |
| Cached input (already included above) | 239,527 (19%) |
| Context-management share of input | 0.0% |
| Largest answer request | 48,918 tokens (claude-sonnet-5-5) |
| Last answer request | 48,918 tokens |
| Est. answer-input savings vs. append mode (gross, uncached) | +38.4% |
| Est. savings after management cost (net, uncached) | +38.4% |
| Peak byte-budget use (request bytes + output reserve) | 59% of 256,000 |

### Tokens by purpose

Answer = the reply loop; everything else is context management.

| Purpose | Calls | Input | Output | Cached in | Reasoning out |
|---|---:|---:|---:|---:|---:|
| answer | 68 | 1,290,211 | 57,028 | 239,527 | 10,171 |
| title | 1 | 261 | 9 | 0 | 0 |

### Tokens by provider and model

| Provider | Model | Calls | Input | Output |
|---|---|---:|---:|---:|
| anthropic | claude-sonnet-5-5 | 38 | 935,774 | 43,925 |
| openai | gpt-6.1-sol | 23 | 219,091 | 5,789 |
| openai | gpt-6-luna | 7 | 135,346 | 7,314 |

## Context management

| Operation | Count |
|---|---:|
| Compaction calls committed | 0 |
| Compaction calls paid then discarded (<15% reduction) | 0 |
| Compaction calls paid then rejected | 0 |
| Compaction attempts skipped before paying | 0 |
| Offloads to retrieval pointers | 0 |
| Budget recoveries | 0 |
| Tool-output projections | 0 |
| Continuation restarts | 0 |
| Retrievals (model) | 27 |
| Workspace readbacks | 16 |

Applied context changes (excluding ordinary message adds):

- workspace file excerpt: 5
- update structured task state: 4
- document ingress excerpt: 2
- model context edit: 1

## Named state and pins

- update_state calls: 9 (5 rejected); manual /remember entries: 0
- Final entries: 7; declared conflicts: 0; pinned segments: 0; verbatim-required: 0

| Key | Type | Status | Content |
|---|---|---|---|
| atp.development | evidence | active | ATP development summary saved and verified in ATP_Development_Summary.md (evt_151f8d19-ae… |
| atp.math | evidence | active | Sol's static ATP model: controller cost F+(1-s)H; others' burden sH. Nonnegative comparab… |
| atp.direction | decision | active | User asked (evt_b7c347a3) for Claude to save what it wants to and write a proposal leanin… |
| atp.next_steps_proposal | decision | unresolved | Claude's proposed next phase, in ATP_Next_Phase_Proposal.md: operational definitions of F… |
| atp.browsing_brief | decision | unresolved | User (evt_1fbd20f0) said: keep the VFX practice, use money and time, and write the propos… |
| atp.vfx_verification | evidence | active | Report from a Sol instance with web access (evt_cae738b8-c192-4d86-8b52-adebc1181201), re… |
| atp.protocol_v2_question | question | unresolved | Whether to design a v2 protocol after the zero-qualifying-case result. Brief criteria (25… |

## Selector / Jev

- Jev enabled on 14 of 14 turns; selection calls: 0

## Failures

- None.

## Tools

- retrieve_event: 24
- workspace_read: 16
- calculate: 13
- update_state: 9
- edit_context: 5
- workspace_write: 4
- search_history: 2
- resolve_context: 1
- workspace_patch: 1

---

*Method:* the history vs. working-context comparison counts characters of text only: no metadata, instructions or tool definitions on either side. It measures how much Conclave keeps in front of the model, not what the provider billed. Billed token figures are the providers' reported usage (Anthropic cache reads/writes added to input). Estimated savings are an offline reconstruction, not a paid comparison, and do not account for prompt-cache discounts: each answer request's working-context message is replaced by the append-mode history (user, assistant, document and reasoning events, plus ~250 bytes of source header each), keeping instructions, tools and tool exchanges fixed, then converted to tokens using that request's own bytes-per-token ratio. Net subtracts all context-management input (selection, compaction). It says nothing about answer quality; fidelity still needs a human read.
