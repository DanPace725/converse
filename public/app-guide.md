# About Converse

Converse is a small chat app for GPT, Claude, and Gemini. Conclave is its method for managing context, not an assistant identity. Each reply retains its selected provider and model.

## Modes

- **Chat:** multiple selected providers can reply to shared history. Chats are saved in this browser.
- **Context:** GPT or Claude answers with persistent source history, a retrievable working context, and structured State. Switch models within one conversation.
- **Agent:** GPT or Claude continues tool actions until it finishes or reaches a limit. Keep the browser tab open. Reload pauses further steps; Resume continues the saved run with its original provider, model, effort, and deadline.

## Workspace and tools

Documents holds Markdown/plain-text uploads and model-created text files. Upload saves a file without sending a message or making a model call. Reference in chat adds its filename to your draft. Limits are 20 active files, 100 KB per file, and 500 KB total active text. Editing an original composer attachment creates a workspace copy. Manual saves do not call a model.

Users can **Remove** a document and **Restore** it later. Removal excludes its source versions from ordinary model retrieval and removes context sections linked to them. Previous messages can still contain quotes or summaries. Original content, snapshots, and tool-result copies remain in historical audit records and canonical JSON exports. Removal is not permanent erasure. Downloaded exports cannot be recalled. Models cannot remove or restore documents. Stop a running task before changing documents.

Context shows the active working sections and a readable context activity report. State holds source-linked objectives, constraints, decisions, questions, and evidence for this conversation; it is not account-wide memory. Model suggestions remain unresolved until the user accepts them.

Context/Agent tools retrieve history, list/read/write/patch saved text, calculate arithmetic (including complete formulas in one call), manage context/state, read this guide, and inspect telemetry. Files are virtual conversation documents, not paths on your computer. Existing files require current version IDs and full reads before model edits; completion requires reading back written versions. Readback proves receipt, not correctness. The app currently offers no web search, shell execution, sandbox, private model workspace, or unattended worker.

## Context management and Jev

New Context turns and Agent runs keep one stable working projection during their tool loop. Saved edits and file versions are visible through tool receipts and inspection immediately. The model can use refresh_context to bring saved changes into its prompt; the next user turn refreshes automatically. Large continuations can trigger a logged refresh to stay within the request guard.

Working context can change while original source history remains preserved. Offloading leaves retrieval pointers; compaction creates shorter derived text. Protected pins, exact text, structured state, recent messages, and current task constraints are preserved by the engine's rules.

Segments have stable conversation-local handles such as **S17**; retrievable source events have **E12** handles. Canonical IDs remain authoritative in storage and exports. New derived versions get new S handles; historical handles stay resolvable. Workspace's References and protection details show both. Tools accept S handles for segment targets and E handles for sources. State relations also accept **state:key** (or an existing plain key), resolved to its current canonical segment; entries created in the same batch cannot be relationship targets.

Use **inspect_context** before a context mutation to see every blocked target and its protection reason/lifetime. Batches are atomic. Recent-window guards move as context advances; the current request guard lasts for the turn. Named state changes through update_state. Jev retain/escalate recommendations are advisory and do not become run-long locks. Unchanged reviews reuse saved decisions; explicit /compact refreshes selection. Automatic paid rewriting is bounded to one call per turn, after reduction preflight; lossless pointers preserve originals. Refresh eligibility after a rejection rather than repeating the same blocked batch.

When enabled and available, Jev recommends retention actions and priorities for bounded candidates during periodic reviews or context pressure. The engine validates proposals, applies protection rules, and performs changes. The task model performs semantic compaction. A proposal is not an applied change; confidence in selection is not proof of factual truth or perfect preservation. Failures can fall back to deterministic selection. Context activity links proposals to actual revisions and source records.

Context activity has filters and Earlier/Latest paging. Omitted entry counts are labelled; canonical JSON retains the full audit. Saved-context counts exclude pending continuation after a run; the next running request includes it. The latest submitted request records its own revision, full-input estimate and reported usage. A completed agent can contain tool errors; completion does not establish successful optimization.

## Tokens, reasoning, and limits

Local previews use the **o200k_base tokenizer** on the serialized native input, including instructions and tool definitions. This accurately counts that encoding's text but estimates provider request framing and other models' encodings. **Count saved request** asks the selected provider's token-count endpoint for the saved context request; it excludes an unsent composer draft and is reused only for an identical request fingerprint. Anthropic calls its preflight count an estimate. Provider counts can fail; the app labels the local fallback. No remote count calls occur during routine panel polling.

**Reported usage** comes from completed provider calls. Input includes cached input; cache billing does not remove those tokens from the context window. Unknown counters stay unknown. Preflight counts are not billed usage or a promise of model context capacity.

The **byte guard** is a separate conservative application limit: serialized request bytes plus an output-token reserve. It remains distinct from token counts and the model's context window. Agent total-token guards also reserve conservative input units before calls, so a run may stop below its displayed reported-token allowance. Stop reasons expose the operands. Automatic testing expands bounded allowances as needed; it does not require exhausting them.

Claude effort is sent through Anthropic's native effort setting where supported. Levels vary by model. Default uses the provider default. Effort is guidance, not a hard thinking-token budget. Provider reasoning summaries and progress updates are reported rationale, not verified evidence or full private reasoning. Opaque signatures and encrypted continuation data are not displayed or shared through telemetry.

Models should inspect telemetry when a retrieval is unexpectedly partial, a revision conflicts, a task approaches a guard, or an earlier action needs checking. Avoid repetitive audits or context edits solely to reduce token counts. Preserve constraints, caveats, unresolved choices, and source attribution. Retrieve original evidence when a summary does not settle the question.

## Storage and exports

Context/Agent conversations persist on the server in Neon when configured, with SQLite as the local fallback. App access currently uses an app password; separate user accounts and account-wide memory are not implemented. Keys remain server-side. Chat mode is browser-local.

Export Markdown preserves readable conversation text. Canonical JSON contains the full historical audit, including original content, versions, requests, tool exchanges, context snapshots, Jev records, and usage. Historical exports may include documents removed from the active workspace.
