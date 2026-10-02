# Issue 13: preserving and streaming provider reasoning

Status: implemented locally, October 1, 2026. Existing issue 12 changes are preserved. The research below describes the API constraints and accepted design; see the implementation details and verification report for the implemented scope.

## Implementation

- Shared capability and extraction helpers in `lib/reasoning.js` enable summaries for supported GPT, Claude and Gemini models. Non-reasoning/unknown models keep their request behavior. Title generation does not request summaries.
- Ordinary Chat retains native output in the invocation record and readable summaries on each reply. The shared collapsed display streams summaries separately from answer text. JSON retains both; Markdown includes attributed readable summaries; response Copy remains answer-only.
- Context/Agent retains summaries from every answer call, including tool steps and incomplete runs, grouped under their user objective. Old audit records are projected without rewriting source history. Native output remains in inference records; ciphertext/signatures never enter the display or cross-provider context.
- New readable `reasoning` events carry inference, provider/model, objective/run and status links. They participate in source search, attribution, paged retrieval, context editing and activity. Layered inputs include bounded pointers to the latest three summaries; full originals remain retrievable. Summaries are explicitly provider-reported rationale, not verified evidence.
- Claude freezes the submitted request prefix for an active tool turn. Later calls append new response blocks, actual tool results and current context/manifest updates. Agent checkpoints retain the prefix across fresh instances. Already submitted results cannot be fitted or compacted retroactively; an oversized signed continuation stops with saved progress and a budget explanation.
- Native replay across later user turns or edited history is deferred. Gemini remains available in ordinary Chat. No schema migration is required. These local changes have not been deployed.

Verification: [implementation report](reports/issue-13-implementation.md). Live provider/account enforcement is not established by deterministic fixtures.

[Issue #13](https://github.com/DanPace725/converse/issues/13) asks for retained reasoning, a collapsible streaming display, and support in Conclave for the additional context.

## What the APIs support

Preserve two different things: the readable summary exposed by a provider, and the opaque data used by that provider for continuity. Showing a summary does not expose or reconstruct the model's full internal reasoning.

| Provider | Readable output | State to preserve | Request and stream integration |
| --- | --- | --- | --- |
| OpenAI | Reasoning summaries for supported models | Original `reasoning` output items, including `encrypted_content` | Request `reasoning.summary: "auto"`; handle `response.reasoning_summary_text.delta` separately from answer deltas. Keep `store: false` and the existing compatible `include` value. |
| Anthropic | Summarized thinking | Complete `thinking` and `redacted_thinking` blocks, including signature/data fields and original order | Explicitly request `display: "summarized"`. Use adaptive thinking on supported models; older thinking models require enabled thinking with a token budget. Handle `thinking_delta` separately from answer text. |
| Gemini | Thought text when available through the existing GenerateContent API | Original response parts, including any `thoughtSignature` attached to a thought or answer part | Set `generationConfig.thinkingConfig.includeThoughts: true` for supported models. Route `part.thought` text to the reasoning display. Preserve part boundaries and signatures. |

OpenAI does not expose raw reasoning tokens. Stateless Responses include encrypted reasoning by default under current documentation; the existing `include: ["reasoning.encrypted_content"]` remains accepted. Reusing earlier reasoning is model-family dependent. [OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/reasoning), [stream event reference](https://developers.openai.com/api/reference/resources/responses/streaming-events).

Claude's readable thinking is a summary. Newer models can omit that text by default while returning a signature. Thinking consumes the output allowance, including when its readable text is omitted. The selected model determines whether adaptive or manual thinking is valid. [Thinking guide](https://platform.claude.com/docs/en/build-with-claude/thinking), [configuration compatibility](https://platform.claude.com/docs/en/build-with-claude/thinking-troubleshooting).

Google's current thinking guide emphasizes Interactions, but Converse uses GenerateContent. Its API reference still documents `includeThoughts`, `thought`, and opaque `thoughtSignature` fields. We can add preservation to this existing endpoint without an Interactions migration. [GenerateContent reference](https://ai.google.dev/api/generate-content), [thinking guide](https://ai.google.dev/gemini-api/docs/thinking).

Some calls legitimately return no readable summary. Unknown or non-thinking models must keep working without unsupported generation parameters. Do not retry a paid generation merely because its summary is empty.

## What Converse already does

- `lib/conclave/harness.js` requests encrypted OpenAI reasoning and audits complete normalized provider output in `inference_response` events. During tool loops it appends the output, including reasoning, to pending continuation items.
- `lib/conclave/provider.js` preserves Claude thinking/redacted-thinking blocks and streamed signatures. Its Anthropic adapter replays those blocks during tool continuation and excludes OpenAI's encrypted items from Claude requests.
- `lib/conclave/agent.js` checkpoints pending tool exchanges, including reasoning, so a fresh hosted instance can resume them.
- `lib/conclave/tool-context.js` can shorten retrieval excerpts under pressure, but leaves reasoning unchanged. Full serialized pending items already participate in Conclave's conservative input-budget check.
- `lib/conclave/service.js` exposes completed answer text in message records; readable reasoning is not projected into the transcript or searchable source history.
- `public/conclave.js` renders answer deltas and replaces the previous call's provisional bubble. A reasoning implementation must retain every call's summary, rather than accidentally retaining only the final call.
- Ordinary Chat's `lib/providers.js` extracts answer text and discards reasoning/thought content. Unlike Context/Agent, it needs both capture and persistence added.
- Gemini currently works in ordinary Chat. Adding Gemini to Context/Agent would require a separate tool adapter and is outside this feature.

## Evidence from the supplied conversation

The [saved audit](reports/assets/issue-13-reasoning-audit.json) examined the 49 answer requests in `conv_b53ebbe1-a7b3-403a-8dc3-f2b40cd67582`:

| Provider | Requests / recorded responses | Reasoning items with opaque state | Readable reasoning characters |
| --- | --- | --- | --- |
| OpenAI | 41 / 40 | 9 | 0 |
| Anthropic | 8 / 8 | 5 | 0 |

The missing OpenAI response is an observed request/response-count difference; the audit does not infer its contents. The retained opaque items demonstrate that preservation has already started. They do not supply readable reasoning retrospectively. Old text cannot be recovered by decrypting these fields locally.

The first Claude continuation from request sequence 334 to 354 changes the initial message while carrying earlier thinking. Subsequent checks at 354→367 and 367→373 keep that first message unchanged. This establishes a rewritten prefix, not a live API rejection. Reproduce the read-only inspection with:

```powershell
node scripts/audit-reasoning-export.js test-results/conv_b53ebbe1-a7b3-403a-8dc3-f2b40cd67582.json
```

## The important Conclave compatibility change

Newer Claude models can bind thinking to the preceding system prompt, tools, and messages. Changing that prefix can invalidate preserved thinking. The API documents explicit drop-or-error controls and account-dependent enforcement. [Preserved thinking](https://platform.claude.com/docs/en/build-with-claude/preserved-thinking).

Converse-specific inference: `Harness.answerPayload()` currently reconstructs working context and the workspace manifest before its pending tool history. File writes, state edits, compaction, and retrieval-output fitting can therefore alter content that preceded a signed block. Keeping the signature itself intact is insufficient.

**Recommendation: keep the native request prefix stable within a tool-use turn.** At the first call, save the exact native system/tools/message prefix. Subsequent calls append the actual returned blocks and tool results. When working context or files change, append a clearly labelled current revision/manifest update after the tool results; do not replace the initial message. Save this continuation state in the agent checkpoint.

This allows the model to receive current file/state changes while the earlier prefix remains intact. Once a tool result has been sent, it too is immutable for subsequent calls that preserve later signed blocks. Retrieval fitting must happen before first submission, not retroactively edit an earlier result.

Budget management must respect this distinction. Conclave can compact its reusable working projection for the next fresh turn, but cannot treat an in-progress signed native transcript as freely editable. At an oversized continuation, use a documented provider-side context operation, or stop with saved progress and start a fresh continuation from the compact working state. Do not silently trim signed blocks or repeatedly retry the same invalid request. Explicit provider-side dropping is a compatibility option, but must be audited as a loss of native reasoning continuity.

Preserving native state across every later user turn would require a longer-lived append-only provider session and a policy for model switches and edits. Implement preservation within active tool turns first; archive all returned state and retain readable summaries across turns. Do not claim that archiving alone guarantees the provider will reuse it later.

## Data and display design

Keep raw provider state immutable and separate from the display projection. For Context/Agent, `inference_response` remains the authority. For ordinary Chat, add native response output/parts to the invocation record so reload and canonical JSON export retain them. Neither path should overwrite `message.content` with reasoning.

Create a readable projection per inference call:

```json
{
  "request_event_id": "evt_request",
  "response_event_id": "evt_response",
  "user_event_id": "evt_objective",
  "run_id": null,
  "provider": "openai",
  "requested_model": "gpt-6.1-sol",
  "reported_model": "gpt-6.1-sol",
  "status": "complete",
  "summaries": [{"item_id": "rs_original", "index": 0, "text": "Provider-returned summary"}],
  "opaque_state_preserved": true
}
```

Opaque state stays in the canonical audit/ordinary-chat invocation record, not inside this display projection. Preserve provider item indexes and text exactly; do not replace provider summaries with a new model's interpretation.

Extend NDJSON with additive reasoning events carrying request ID, item/block index, and delta. Continue using the existing answer-delta messages. Reconcile live text with the final response rather than appending final text twice. Reasoning-only streaming must work before the first answer token.

Use one collapsed **Reasoning summary** disclosure per response/agent step, labelled by provider/model. Stream text into that disclosure using plain text or the existing sanitizer. Preserve the open state while answer text streams. Keep earlier tool-step disclosures visible after later steps and page reload; unfinished runs must also show their completed call summaries. If only opaque state was returned, show a short availability note rather than an empty disclosure.

Copy response continues to copy the answer. Canonical JSON includes native state and readable summaries; Markdown export can include readable summaries in labelled disclosure blocks. Mark interrupted/failed summaries accurately and never replay incomplete output as a completed assistant response. Existing chats without new fields remain readable.

## Conclave's additional context

Readable summaries need their own source records, linked to the originating inference, provider, model, user objective, and run. A dedicated `reasoning` source kind avoids mixing them with user messages, files, or verified evidence. Extend source indexing, attribution, retrieval, and activity projections to recognize that kind; existing event tables can store it without a relational schema migration. Existing raw reasoning can be projected read-only, without rewriting historical events.

Working context should contain only a bounded, explicitly labelled summary excerpt or retrieval pointer by default. Full readable summaries remain searchable and paged from immutable history. Conclave may retain a relevant explanation or compact older summaries, but must keep the original source link and describe it as the model's reported rationale. It is not a user-approved decision or independent evidence.

Opaque state must never be summarized, displayed as plaintext, or passed to another provider. Readable summaries may cross provider boundaries as attributed historical context. Native replay should use a conservative provider/model compatibility policy; retain incompatible state in the audit while leaving it out of requests.

Account for three separate quantities: rendered working context, native continuation input, and provider-reported output usage. Input must include summary text, metadata and serialized native state. Reasoning consumes the existing output cap; do not add reported reasoning tokens a second time when already included in provider output totals. Gemini reports thoughts separately and requires provider-specific normalization. Keep the current budgets and run guards; increase allowances only through the existing controls.

## Implementation sequence and acceptance checks

1. Add shared capability/configuration and extraction helpers. Request summaries only for supported selected models; preserve unknown-model behavior. Cover OpenAI summaries/encryption, Claude adaptive/manual compatibility, redacted/omitted thinking, and Gemini signed parts.
2. Fix native continuation preservation before enabling thinking in tool runs. Test stable prefixes through file writes, state changes and context updates, exact signed-block order, unchanged previously submitted tool outputs, budget pressure, and fresh-instance agent resume. A fake that rejects changed prefixes is necessary; today's fixtures only prove block transport.
3. Add canonical persistence and readable projections for all calls. Test model/provider switches, incomplete streams, failed runs, old exports, final-text reconciliation, and export/reload fidelity. Store provider transformation diagnostics when native blocks are dropped.
4. Add the shared collapsible display to ordinary Chat, Context and Agent. Test reasoning before answer text, multiple tool steps, missing summaries, disclosure state, sanitized rendering, Copy/export separation, desktop/mobile layout, and reload.
5. Add retrieval/indexing and bounded reasoning pointers to Conclave. Test full-page retrieval, correct attribution, compaction/offload, independent source preservation, and total-budget enforcement with large signatures/summaries.
6. Run a small opt-in live check for each configured provider after deterministic tests pass. Include at least one Claude tool-writing loop under strict binding behavior. Verify request shape, streamed summary, signature replay, recorded usage and export. Docs cannot establish this account's model availability or enforcement behavior.

The narrow first release should deliver streamed summaries, retained native output, a collapsible UI, and budgeted retrieval. Provider-wide replay across edited conversation history is a separate extension, not an implied guarantee of this release.
