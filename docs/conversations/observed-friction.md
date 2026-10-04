# Observed Friction

## Status and provenance

Saved at the user's request ("Go for it", E91) after Claude Sonnet (anthropic claude-sonnet-5-5) proposed the list in E90. Every item below is an **observation from this conversation, not a decision or an approved design change**. The suggested design principles are assistant ideas, not user-approved. The automatic memory ledger was never inspected directly; claims about it rest on what the assistants were shown and on the user's reports.

## Observations

### 1. Obvious revision treated as a conflict
- User said "Keep the budget under $400" (E49), then "I actually want to make it a range, between 400 and 500" (E51).
- As reported by assistants (E53), the ledger recorded the first as a binding user commitment and the second as a non-binding user-reported claim, and marked the two contested.
- The user's view (E54): the ordering should have made the revision clear; users won't follow a strict process.
- Limits: one observed case. Endpoint inclusivity of the range was never specified.

### 2. Two memory systems with different powers
- Structured conversation state: assistants can write and edit it.
- Automatic memory ledger: assistants cannot write, edit or suppress it (E44, E64).
- "Saved to memory" can therefore mean either mechanism. GPT (gpt-6.1-sol) noted that this is confusing from a user-experience standpoint (E64).
- Limits: based on assistant self-reports and the guide, not on inspecting the ledger.

### 3. A reported action that didn't match visible state
- Sonnet said it had marked the structured entry `budget-new-commitment` as superseded (E78).
- GPT observed in E80 that the entry was shown as unresolved, with a note saying it was superseded, so the status field and the explanation disagreed.
- That entry (S44) is still shown with status unresolved and a limitation note that says "Marked superseded". The mismatch persists as of this save.
- Lesson recorded by Sonnet (E90): check the status field rather than trusting a summary of the action.
- Limits: why the status didn't change is unknown.

### 4. A timing-out estimator whose fallback looks like a decision
- The shadow-economics evaluator (policy `action-next-request-shadow-v3`) missed its 200 ms budget twice: about 210 ms (E42) and about 513 ms (E87).
- Each time: no candidates, keep-cost unavailable, shadow choice reported as "keep".
- "Keep" is a fallback, not the result of an economic comparison. Counterfactual savings are unmeasured.
- GPT (E87) suggested the overrun may come from cooperative checkpoints and a synchronous tokenizer step; this is an unverified explanation.

### 5. A clearly phrased commitment has no visible automatic entry
- User said "New commitment: budget should be between $400 and $500" (E65), the most explicit phrasing in the budget test.
- The user's pasted copy of the Memory panel (E97) lists no automatic entry for it. The only copy of that wording is the structured-state entry S44. The automatic snapshot supplied to the assistant also showed no such entry (noted by Sonnet in E74 and E99).
- If accurate, even explicit phrasing did not produce a ledger entry that could supersede "Keep the budget under $400", which makes the ordering concern in observation 1 more serious.
- Limits: the paste can show only that the entry is not listed, not that it was never captured. The paste has no authority, resolution or conflict fields. The assistants' snapshot may be stale. Nobody has inspected the ledger directly.

### 6. Quoting the ledger into the chat created a new memory
- The user pasted the Memory panel text into the conversation (E97) because screenshots are not supported (E60).
- Afterwards the automatic snapshot supplied to the assistant included an additional entry: a user-reported, non-binding claim containing the whole pasted block, marked as conflicting with "Keep the budget under $400" (observed by Sonnet in E99).
- So sharing a memory display in chat can add noise and new conflicts to the ledger it describes.
- Also seen in the paste: the single message E75 ("I wonder, can you remove memories? Like try to get rid of the budget stuff?") appears as two separate question entries, and neither is recorded as a removal request. The paste does not show whether the budget entries were suppressed.
- Limits: this rests on the assistant's reading of the snapshot and the user's paste. The user has not confirmed that the paste-capture entry appears in the Memory tab. Whether a file upload would be captured differently is unknown.

## Design ideas prompted by these observations (assistant proposals, not decisions)
- One place to see everything remembered, whichever mechanism saved it.
- Visible, reversible handling of changes, e.g. "Budget is now $400–$500 (replaced 'under $400') [undo]".
- Fallbacks labeled as fallbacks.
- Default to supersession on the same slot when it is visible and reversible; ask for clarification only when the readings lead to different next actions (Sonnet, E59).
- Risk to measure: wrongly treating two statements as the same slot could overwrite a valid constraint (GPT, E6).

## Open items
- Whether the budget is still a live constraint: the user asked to try to remove it (E75). The automatic ledger entries remain contested and cannot be changed by assistants.
- Related user requests noted elsewhere: screenshot/image sharing in the app (E60).
