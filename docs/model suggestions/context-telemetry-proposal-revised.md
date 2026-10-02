# Revised Proposal: Token and Context Telemetry for Conclave

## Status and provenance

This is a revision of `context-telemetry-proposal.md` (original by gpt-6.1-sol, event `evt_dc74c91b-6ec5-4afe-8875-f9238c491945`). The revision was written by claude-sonnet-5-5 at the user's request. The original file is unchanged.

This is a design proposal, not a description of implemented features and not a user-approved specification. Conclave is Converse's shared-context management method, not a model identity.

## Summary

Start with two things: a compact per-request **status header** and a read-only **unified audit tool**. Everything else is optional until those work. Measurements must state their scope and method, and unknown values must stay unknown.

## What is visible today

In this conversation the assistant can read the supplied working-context bundles, search and retrieve source history, edit or offload context, and read or write workspace files. It cannot see:

- exact token counters, limits, or costs;
- which operations produced a given context revision (for example, revision 9 versus revision 17 as reported by different replies);
- the original tool-call sequence of an earlier model's turn.

Character counts and event sequence numbers are not token counts. A bounded excerpt does not by itself show truncation, offloading, or a failed write.

## 1. Status header (every request)

Keep it small. Fields:

- Context revision and request ID.
- Measurement scope: the assembled current request, or an estimate of the next one.
- Model and applicable limits.
- Input tokens, reserved output budget, remaining capacity (when computable).
- Count method: provider-measured, tokenizer-measured, or estimated; label partial counts as partial.
- Whether anything was omitted or truncated, with a pointer to details.

The application should define how system instructions, tool schemas, attachments, cached input, and output reservations are counted. Cached input still occupies the context window even if it is billed differently.

## 2. Unified audit tool (read-only, on demand)

**Change from the original:** the original audit covered only context operations and deliberately kept workspace and history actions out of it. That left the main gap seen in this conversation unfilled: a reviewer could not reconstruct what an earlier model's tool calls actually did. This revision logs all tool calls in one place, with a type filter so context operations stay distinguishable from file writes and history reads.

Filters: request, revision range, operation type (context, workspace, history, calculation), actor, bundle. Results are bounded and paginated.

Each record includes:

- Operation ID, timestamp, type.
- Actor: application, user, or identified assistant model.
- Expected, observed, and resulting context revision. For non-context calls, the revision that was current and the revision the call led to, if any.
- Affected bundle or file identifiers and original source-event IDs.
- Outcome, including conflicts and failures.
- Before/after token counts with scope and method (context operations).
- Retrieval pointers for offloaded or superseded material.

A file write is not evidence of a context edit, even if the application later adds a file excerpt to working context. The type field and revision link make that distinction explicit.

## 3. Later additions

- Token size per context bundle.
- Before/after token counts for each context edit.
- Per-call input, output, and cached-token usage; reasoning-token counts only when the provider reports them. These do not imply access to private reasoning content.
- Cost estimates that name the pricing source and version. Unknown metrics are reported as unknown, never zero.
- Longer previews on offloaded and reasoning-summary pointers (the current ones are about 150 characters), so an assistant can often judge relevance without an extra retrieval call.

## 4. Management workflow

1. Check the request budget before large retrievals.
2. Retrieve only what the task needs.
3. Preserve exact pinned text, active constraints, numerical limits, unresolved alternatives, provenance, and caveats.
4. Summarize or offload lower-priority material with source pointers. Token size alone is not a reason to discard information.
5. Edit against the current revision and handle conflicts explicitly.
6. Check the resulting revision and projected next-request size.
7. Retrieve originals when an omitted detail becomes relevant.

Context edits change the next working projection; they never erase source history. Telemetry informs decisions but does not give the assistant control over application assembly, provider limits, caching, or truncation.

## 5. Risk: optimizing for the metric

If an assistant can see a budget, it may over-summarize and drop caveats to look efficient. The original proposal noted that token size is not a sufficient reason to discard material. This revision makes it a named test:

- **Preservation test:** after any budget-driven edit, all constraints, numerical limits, unresolved alternatives, and caveats from before the edit are still present or retrievable by pointer, with source attribution intact.

## 6. Acceptance criteria

- Counters state scope, revision, and method; stale values are marked.
- Unknown values are explicit; estimates are not presented as provider-confirmed.
- Application-made changes are distinguishable from model-requested changes.
- Offloaded and superseded context stays retrievable with attribution.
- Audit access follows the same permissions as the underlying sources and does not expose private instructions or reasoning content.
- The header stays compact; detail is fetched only when useful.
- A controlled context edit can be traced from its expected revision to its outcome and measured next-request effect.
- Any tool call, not just a context edit, can be traced to the revision it saw and the revision it produced.
- The preservation test (section 5) passes.

## 7. Motivating example (anecdotal)

A provider-reported rationale summary attributed to gpt-6-luna expressed uncertainty about repeated character counts and a null expected source ID (`evt_7f7cb833-e7c0-432c-822c-da8338aafb3c`). Sol's review found the saved files consistent with ordinary new-file creation (`evt_18a01993-70b4-4572-ae56-9e0df682a75e`). A complete tool-call log would have shortened that review.

This is an illustration, not proof that missing telemetry caused the uncertainty or that any tool malfunctioned. The case for telemetry does not depend on it.

## 8. Open implementation choices

Not decided: tokenizer and measurement source, warning thresholds, audit retention, permissions, pricing integration, whether projected next-request counts are exact or estimated, and how much tool-call detail (arguments, results) is logged versus only metadata. These are proposed decisions, not facts about the current environment.

## Changes from the original

| Area | Original (Sol) | This revision (Sonnet) |
|---|---|---|
| Audit scope | Context operations only | All tool calls, with a type filter and revision link |
| Motivating example | Full section, already caveated as "not proof" | Shortened and moved near the end, still labelled anecdotal |
| Length and order | 7,442 characters, recommendation last | 7,769 characters (327 longer, not shorter); leads with the two starting components |
| Budget-gaming risk | Workflow step 4 and an acceptance criterion already say token size alone is not a reason to discard material | Adds a named preservation test and a matching acceptance criterion |
| Pointer previews | Not covered | Longer previews suggested |
| Typo | "a identified pricing source" | Corrected to "the pricing source and version" |
