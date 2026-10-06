# Neo conversation: memory, Jev and request-size review

Reviewed locally on 2026-10-05 PDT / 2026-10-06 UTC. This is an audit and proposed implementation sequence; runtime behavior has not been changed.

## Evidence and limits

Input: `Feedback on the Neo Concept_2026-10-06T06-10-43-902Z.json`, conversation `conv_9d096705-7a87-407b-86ce-52080cceab2e`, exported at `2026-10-06T06:10:43.902Z`. SHA-256: `e096a0e6f32d2128ac2075865c02490ca2e7851380ec33d6f133a24339cd5700`.

The export contains 46 chat messages, 609 events and 51 context snapshots. Code inspected: Conclave `e2c4ce4ba7e2c01ed03d25eec36bd294d5f88018`, Converse `9ed2110220816f4217345f819ed6af289c354839`. Historical receipts establish what happened in this chat; current code explains the matching behavior. No provider calls, database changes or deployment measurements were made for this review.

## The screenshot is reproducible, but the baseline label is misleading

The final request is event 603 (`evt_ccfc35f6-9986-48e1-ba6d-d711fc4ae774`), at 23:09:34 PDT, to `claude-opus-5-5`.

| Measurement | Tokens | Basis |
|---|---:|---|
| Actual request usage | 37,068 | Provider-reported input |
| Same actual request, local count | 24,986 | Serialized native input, local o200k_base |
| Current “full history” baseline | 35,327 | Local count of chat, original document and selected task-tool traffic, with the same instructions/tools |
| All visible chat/document/tool exchanges | 114,675 | Illustrative local reconstruction including every tool call/result; excludes reasoning, repeated inference records and snapshots |

The screenshot's 29% is exactly `round((24986 - 35327) / 35327 * 100)`. It is not a comparison of 37.1K provider tokens against 35.3K local tokens. The 12,082-token “not itemized” amount is the difference between reported input and the local breakdown. Its precise causes are not established by this export.

`request-comparison.js` deliberately excludes Conclave management/retrieval tools from its counterfactual. Here that excludes 21 `read_memory` results, five `update_state` results, four `suppress_memory` results and one `search_history` result. The memory reads alone contain 55,827 local plain-text tokens, much of it repeated paginated inspection. Included tools are workspace operations, web operations, calculations, the app guide and CLP queries.

For perspective, the human/assistant text before the final request totals 13,943 local plain-text tokens; the original document adds 4,977. The much larger full tool transcript reflects real repeated inspections, not an unusually huge amount of ordinary dialogue. The 13 MB export also includes repeated payloads and snapshots and is not a single model input.

The 114,675 benchmark uses the comparator's text representation of tool calls/results, including all tool names rather than its whitelist. It is not an exact native Claude full-history request or a billing claim. A plain append-only chat also would not necessarily perform the same memory-management calls. Keep these two useful questions separate: counterfactual chat size and actual accumulated tool transcript size.

Recommended display: “Chat + task-tool baseline: ~35.3K local tokens. Current request: ~25.0K on the same count (29% smaller).” Keep 37.1K provider input separately visible. A scope disclosure should list excluded tool categories; any complete tool-transcript measurement needs its own label. Anthropic offers a model-specific counting endpoint if a later comparison needs provider preflight estimates: [official token-counting documentation](https://platform.claude.com/docs/en/build-with-claude/token-counting).

## Why Jev stopped appearing

All seven actual Jev inference requests were **memory selection**, around 21:07:56–21:08:00 and 21:21:55–21:21:56 PDT. They selected eight memories from GPT's initial critique and eight from Sonnet's initial critique. No later Jev inference failure is recorded.

At **22:22:52**, event 237 is a capture receipt, not a Jev call: `selection_calls: 0`, `paid_extraction: false`, `admitted_count: 0`. It considered a 1,497-character human paragraph and offered zero passages. Local replay of `memoryPassages()` reproduces this: quoting the word **“know”** changes the masked human text, and the whole-paragraph eligibility test rejects the entire paragraph. The quote guard is protecting instruction provenance, but its paragraph-level application also blocks surrounding discussion as optional candidate data.

Later automatic capture receipts admit nothing. Completed assistant material is offered for capture on a following human turn only when that turn matches a memory-saving directive or the preceding answer used at least three qualifying research reads (`workspace_read`, `web_fetch`, `retrieve_event`). Ordinary conceptual discussion and `read_memory` inspections do not meet that research gate. Active Jev selection therefore does not mean every completed discussion is reviewed by Jev.

There were **22 context reviews**, all local and `not_needed`. Current `reviewContext()` explicitly reserves paid selection/rewrite for pressure or explicit compaction. The 10,000-token periodic interval records timing checks; it does not itself buy a Jev attention call. The configured budget was 256,000 serialized-byte guard units, with a 75% pressure threshold. This is distinct from the model's token context capacity. Initial answer payloads were at most 109,784 serialized bytes; the recorded reviews did not trigger compaction.

Opus's **23:05:43 retrieval test** also made **no Jev inference call**: event 578 says `outcome: skipped`, `reason: distinctive lexical match`, `request_id: null`, `selection_source: hybrid-embedding`. It used hybrid search, including a real embedding request. Its presence in Jev telemetry does not mean Jev selected its results. The returned passages demonstrate available hybrid retrieval; this single probe does not isolate the benefit of embeddings over keywords.

## Embeddings exist; memory admission is too permissive

This export records **23 successful embedding calls / 26,213 reported input tokens**. Contrary to the stronger interpretation of Opus's observation, `prepareSemanticMemory()` does call semantic retrieval for automatic memories before activation. Eleven activation receipts contain nonzero semantic scores. The backend already filters returned cosine similarities below 0.3; a recorded zero means no accepted semantic result, not necessarily literal zero cosine similarity.

The problem is downstream: `selectMemory()` counts query-word **substrings**, including common short words, adds the raw count to the cosine score, and admits any optional memory with either a keyword match or a semantic match while space remains. A keyword count of 10 easily dominates a cosine score of 0.4. Even one incidental keyword match can admit an otherwise semantically unmatched record.

At **23:05:26**, all seven remaining automatic memories were included: **6,917 bytes within a 16,000-byte allowance**, despite every recorded semantic score being zero for the vector-store discussion. Keyword counts ranged from 6 to 19. At 23:09:15, the short acknowledgment “Yeah that would be good, thanks” still admitted six records through keyword counts of 1–4, again with zero accepted semantic matches.

All 16 automatic records originated in the initial two critiques; nine ended suppressed and seven remained candidates. Later intent, wisdom-debt and tiering ideas were saved through five named-state entries instead. Named state is always protected/carried in the current projection, including unresolved proposals. Tiering only automatic memories would therefore leave a second growing source of prompt text.

## Implementation sequence

1. **Make admission and non-calls inspectable.** Correct the comparison label and show both local numbers. Distinguish capture considered, passages eligible, actual Jev call, local review and retrieval skip. Explain memory inclusion with meaningful lexical evidence, accepted semantic score, scope and required dependency. This chat becomes a saved-state fixture; checks require no model calls.

2. **Build a bounded memory projection.** Keep applicable constraints/decisions and required dependency/conflict closure protected. Give optional memories separate full-text and stub budgets; leave other records searchable outside the prompt. Use normalized meaningful lexical matches and semantic relevance rather than raw substring-count-plus-cosine admission. Carry a bounded recent topic/intent query through acknowledgments such as “thanks.” Calibrate against relevant and irrelevant cases instead of declaring one cosine threshold universal. Apply projection tiers to named proposals/evidence as well as automatic records, preserving canonical state and revision checks. Suppression remains a separate, reversible prohibition on automatic reuse.

3. **Repair capture without expanding authority.** Preserve the distinction between exact human commitments and unresolved candidate data. A human paragraph containing a harmless quotation should be eligible as attributed discussion data without granting the quotation instruction authority. Add a bounded route for useful completed conceptual discussions/user clarifications, with explicit eligibility and call limits, rather than limiting capture to research-tool episodes. Preserve complete conditions and sources; record retention rationale, selector/policy, uncertainty and reconsideration conditions. Saving a proposal is not approving it.

4. **Make approved cleanup concrete.** The batch “Suppress the 8 memories in proposed_memory_downgrades” was rejected at event 390 despite the user's reference to the saved proposal. `retirementRequested()` matches the target's ID/content words; it cannot resolve a named proposal to its target set. Use a structured, revision-checked proposal with stable target IDs and snippets, and let approval select that exact set. The UI and tools must present the same handles. Preserve atomicity, pinned/exact-text safeguards and the latest-human-source check.

5. **Add engagement only after retrieval behaves well.** Record deduplicated user return/elaboration/application events and explicit successful reuse. Strengthen source-linked relationships and retrieval priority; do not treat prompt inclusion, model echoes or model agreement as new evidence. Decay optional accessibility, not truth or authorization. Scope changes flag affected relationships for review instead of erasing facts automatically. Treat “myelination” as caching a useful recoverable route, not raising confidence through repetition.

Steps 1–3 are the most useful first increment. Neon/pgvector already supplies the needed storage/search foundation; this evidence points to capture and projection policy before a database replacement. A relational edge table can support source/dependency/reconsideration links before considering a separate graph database. Hosting latency still needs its separate saved-chat cold/warm measurements.

Engine work belongs in canonical Conclave first, then migration to Converse; display and selectable cleanup UI belong in Converse. Proposed acceptance cases: irrelevant early critiques leave the working set; returning to ecology retrieves the corresponding source; applicable constraints survive weak similarity; quoted human discussion can become an unresolved candidate; short acknowledgments preserve the active topic; named proposals respect a cap; approved batches resolve exact targets; every gate produces an accurate receipt.

## Local verification

Ten offline assertions reproduced the screenshot's provider/local/baseline values and percentage, the illustrative complete tool-transcript value, seven Jev calls with their cutoff, 22 local `not_needed` reviews, the skipped retrieval with null Jev request ID and the zero-call 22:22 capture. A direct extractor replay reproduced zero eligible passages for the paragraph containing “know.” Source inspection confirmed memory semantic retrieval, substring admission, capture gates, named-state protection and suppression authorization behavior. No live rerun was used to infer output quality or savings.
