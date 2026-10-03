# Proposal: Token and Context Telemetry for Conclave

## Purpose

Expose compact, trustworthy telemetry so an assistant can make better-informed retrieval, summarization, and offloading decisions while preserving evidence and user constraints. Conclave is Converse's shared-context management method, not a model identity.

This is a design proposal based on the conversation, not a description of features already implemented or a user-approved engineering specification.

## Current visibility and limitations

In this conversation, the assistant can inspect supplied working-context bundles and revisions, search persistent source history, retrieve sources, manage editable context, and read or edit saved text files. No exact token-usage counters or complete context-operation audit log are exposed through the available tools.

A revision number identifies a context snapshot; it does not explain which operations produced it. Document character counts and event sequence numbers are not token counts. A bounded excerpt does not by itself prove truncation, offloading, or a failed write.

Historical usage and currently loaded context are different quantities. Conversation-wide totals help with cost accounting, but the size of the next request is more directly useful for context management.

## Recommended telemetry

| Field or record | Purpose |
|---|---|
| Current input-token count and applicable context limit | Show how much of the request budget is occupied. |
| Reserved output budget and tool-continuation allowance | Help leave room for the answer and further tool results. |
| Token size of each context bundle | Identify large material that may be summarized or offloaded. |
| Context-operation log | Explain additions, edits, summaries, offloads, supersessions, and automatic projection changes. |
| Before/after revision and token counts | Measure the effect of a context change on the next request. |
| Per-call input, output, and cached-token usage | Support cost tracking and reduce unnecessary repeated retrieval. |
| Truncation indicators and omitted-source pointers | Distinguish unavailable context from events that never occurred. |

Expose provider-reported reasoning-token counts only when available and applicable. Counts do not imply access to private reasoning content. Costs should use a identified pricing source and version; unknown metrics should remain unknown rather than be reported as zero.

## Compact automatic status header

Provide a small status header on each request, with details available on demand. Suggested fields:

- Context revision and request identifier.
- Measurement time and scope: assembled current request or estimated next request.
- Model identity and applicable limits.
- Input-token count, reserved output budget, and remaining capacity when computable.
- Token-count method: provider-measured, tokenizer-measured, or estimated.
- Whether context was omitted or truncated, with a pointer to details.

The application should define how tool schemas, system instructions, attachments, cached input, and output reservations are accounted for. If not all components are measurable, label the result partial. Do not imply that cached input is absent from the context window merely because its billing differs.

## On-demand audit interface

Offer a read-only telemetry tool with filters for request, revision range, operation type, actor, and bundle. Its results should be bounded and paginated.

Each context-operation record should include:

- Operation identifier, timestamp, and operation type.
- Actor: application, user, or identified assistant model.
- Expected, observed, and resulting revisions where applicable.
- Affected bundle identifiers and original source-event identifiers.
- Outcome, including conflicts or failures.
- Before/after token counts, their scope, and measurement method.
- Retrieval pointers for superseded or offloaded material.

Keep context operations separate from workspace file operations and history reads. A file write is not evidence of a context edit, even if the application later adds a file excerpt to the working context.

## Suggested management workflow

1. Inspect the current request budget before large retrievals.
2. Retrieve only the source material needed for the task.
3. Preserve exact pinned text, active constraints, numerical limits, unresolved alternatives, provenance, and important caveats.
4. If needed, summarize lower-priority material or offload it with source pointers. Do not treat token size alone as a reason to discard information.
5. Use the current revision for edits and handle conflicts explicitly.
6. Check the resulting revision and projected next-request token count.
7. Retrieve original sources when an omitted detail becomes relevant.

Context edits affect the next working projection; they do not erase persistent source history. Telemetry informs assistant decisions but does not give the assistant control over application assembly, provider limits, caching, or all truncation behavior.

## Illustrative lesson from this conversation

A provider-reported rationale summary attributed to gpt-6-luna expressed uncertainty about repeated document character counts and a null expected source identifier. The later review found the saved documents consistent with successful new-file creation; the complete original tool sequence was not available for audit.

A revision-aware operation log could have helped distinguish a successful file write, a repeated excerpt, and an application-generated context update. This is an example of the potential benefit, not proof that missing telemetry caused the uncertainty or that a tool malfunction occurred.

Relevant conversation sources: `evt_18a01993-70b4-4572-ae56-9e0df682a75e` (review), `evt_3da92821-2d18-44cd-a202-fa0a899e5319` (visibility limits), and `evt_40c8fcaf-1a02-4526-a20c-4ec95163f4d0` (telemetry recommendations).

## Safeguards and acceptance criteria

- Counters specify scope, revision, and measurement method; stale values are visibly marked.
- Unknown values are explicit, and estimates are not presented as provider-confirmed usage.
- Automatic changes are distinguishable from model-requested changes.
- Offloaded and superseded context remains retrievable with source attribution intact.
- Audit access respects the same permissions as the underlying sources and does not expose private instructions or reasoning content.
- The status header stays compact; detailed audit results are retrieved only when useful.
- A controlled context edit can be traced from its expected revision to its outcome and measured next-request effect.
- Token reduction is evaluated alongside preservation of constraints and answer quality, not as the sole success metric.

## Open implementation choices

The application still needs to decide tokenizer and measurement sources, budget-warning thresholds, audit retention, permissions, pricing integration, and whether projected next-request counts are exact or estimates. These are proposed design decisions, not established facts about the current environment.

## Recommendation

Start with a compact per-request status header and a read-only usage/context audit tool. Add bundle-level counts and before/after measurements next. Prioritize trustworthy scope and provenance over a large volume of metrics: the goal is efficient preservation of relevant evidence and constraints, not simply fewer tokens.
