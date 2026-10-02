# Converse

A small installable chat app for GPT, Claude and Gemini. Responsive on phones, tablets and desktop. No build dependencies.

## Local

Requires Node.js 22.13+ (Node 24 on Vercel). Run `npm install`. Set provider keys in your environment or copy `.env.example` to `.env` and fill it in, then run `npm run dev` (or `node --env-file-if-exists=.env scripts/dev.js`). Open http://127.0.0.1:3211.

## Context layer

New chats use the context layer when the server supports it. Pick **Chat**, **Context** or **Agent** in the mode switch above the composer; the badge next to the chat title shows the current mode and where it is saved. Choose **GPT** or **Claude** in the recipient chips and select its model in **Models**, or type **@GPT** or **@Claude** to override the recipient for one message. Context and Agent modes use one assistant per turn; you can switch assistants within the same saved conversation. The ⚙ settings button opens the assistant selector, reasoning, Jev and limits. GPT exposes reasoning effort; Claude uses its default reasoning and the GPT effort control is disabled. Reopen saved context chats from the sidebar, open **Workspace** for documents/context/state, or watch the context garden. GPT and Claude replies stream as text arrives in Context and Agent modes. Each model call replaces its provisional preview; only the completed, saved answer enters the transcript and exports. Provider keys stay on the server; Claude requires `ANTHROPIC_API_KEY` on the local or hosted server.

Conclave describes the context-management method; each assistant retains its selected provider/model identity. In both Context and Agent modes, model inputs label the authors of source messages, including through summaries, state, offloading and retrieval. Earlier GPT replies remain attributed to GPT when Claude takes over, and vice versa. Older completed turns recover model labels from saved inference records; missing model information stays unknown. Original message text and saved snapshots are preserved. Offline switch/attribution checks: `node --test test/model-identity.test.js`.

With `DATABASE_URL`, local and hosted requests use Neon. Context chats, originals, audit events and immutable snapshots survive reloads and new function instances. **Export JSON** downloads the canonical transcript plus the complete `context_layer` record, including source IDs, provider inputs/usage, tool exchanges, Jev decisions and failures. The browser keeps display data and the conversation ID; the audit stays on the server. Existing SQLite chats remain on this PC and are not automatically uploaded.

Without `DATABASE_URL`, local development falls back to SQLite in `CONCLAVE_DATA_DIR` or the sibling `.conclave` folder and reads Windows User/Machine provider keys. Vercel always uses Neon. Ordinary multi-provider chats retain their browser-local storage and streaming behavior.

New chats receive a short automatic title after the first completed reply, using one bounded request to the selected model with the first user message. Titles are saved on the device for Chat mode and on the server for Context/Agent modes. If naming is unavailable, the first-message title remains. Naming usage/provenance is retained separately from task-model usage.

User messages have **Copy** and **Edit** controls. Edit restores the original text and attachment to the composer; Cancel restores your unsent draft. Sending the revision creates a new turn linked to the original, preserving previous messages, responses and source history in every mode.

Responses render inline and display LaTeX using bundled [KaTeX](https://katex.org/docs/autorender.html): `$…$`, `$$…$$`, `\(…\)`, `\[…\]`, and equation/align/gather environments. Math is recognized before Markdown parsing, while code and currency text stay literal. Copy and exports retain the original Markdown/LaTeX. Fonts and rendering assets are included in the offline shell; unsupported/malformed equations remain readable.

## Workspace panel

In a Context or Agent chat, **Workspace** in the header opens a collapsible panel on the right, or a drawer on smaller screens. **Documents** shows uploaded originals and current agent workspace files, with Markdown preview, plain text editing and downloads. **Context** shows collapsible working context sections. **State** shows remembered entries with their key, type and status; you can edit or add entries. Selecting a garden node opens its actual text here, including read-only historical bundles.

Documents identify the last editor and writing model when the audit establishes it. Partial workspace excerpts state their limits; Documents retains the full saved text. Offloaded references carry a short source excerpt and **Open original context** opens the preserved bundle. State entries with corrections offer **Previous revisions**, which opens saved versions read-only.

On desktop, drag the edge of Chats, Workspace, Settings or Context garden to change its width. Drag the top of Settings to change its height. Focus an edge and use arrow keys for 10-pixel adjustments (Shift for 50); Home resets the size. Sizes are remembered on this device and constrained to the available screen. Context and State lists use the panel's full scroll area, and expanded sections show their full text. Phones retain their existing drawer layout.

Manual saves make no model requests. Workspace files receive new source/version IDs; working context and state edits create source-linked revisions. Uploaded originals remain unchanged: editing one saves a named workspace copy. References and pinned/verbatim text stay protected. Saves require the current file version or context revision and are blocked during an answer or a running agent. Conflicts preserve the draft and offer **Download** and **Load latest**; resolving them is manual in this first version.

Drafts survive closing the panel, switching saved chats and reloading in the same browser tab through session storage. They are not synced to other devices and should be saved or downloaded before closing the tab. The open panel refreshes saved text every 2.5 seconds. Workspace file limits still apply; remembered text is limited to 2,000 characters. This first version edits plain text/Markdown, with no PDF, DOCX or rich text editor. No additional packages or database migration are required. See [Workspace validation](docs/reports/workspace-editor-2026-10-01.md).

## Agent proof of concept

Choose **Agent** in the mode switch, choose GPT or Claude, enter an objective, and press **Run agent** (the normal Send button). Switch back to **Context** to continue as a context chat. The selected model continues making tool calls until it returns a final answer or reaches a limit. Start with: “Calculate 17 × 23, write the result to proof.md, read it back, then report what you verified.” You can attach one Markdown source document. Each run checkpoints its provider and model, so Resume uses the original assistant.

Tools include arithmetic; listing, reading, writing and applying exact text patches in a saved **virtual text workspace**; and Conclave's existing history retrieval, context editing, offloading and structured state updates. Files live in the conversation's SQLite/Neon history, with previous versions preserved. They are not host filesystem paths. Both context chat and agent mode have these workspace tools. **Workspace files** in the run strip above the composer provides direct downloads; Export JSON contains full files, provider inputs, tool exchanges and run checkpoints. Workspace limits are 20 files, 100 KB per file and 500 KB total current text.

Defaults: 10 minutes, 40 model steps, 256,000 context-budget units, 16,384 output tokens per call, and 250,000 total provider input/output tokens. All are adjustable in the panel. Context units are the engine's conservative UTF-8 byte proxy, not actual tokens or a promise of the model's context capacity. The total-token check reserves estimated input plus maximum output before each call and uses reported usage afterward; it can stop below the selected total. Missing usage stops the run. Provider failures and output exhaustion remain explicit failures; no automatic model substitution or paid retries.

Each step is one task-model request plus its tool actions and, under context pressure, bounded context-management calls, saved before the next browser request. This uses the existing hosted endpoint, database lease and schema: no migration or queue is required. Keep the browser tab open to drive the loop. Reloading pauses further requests; reopen the saved chat and choose **Resume run** before the original deadline. **Stop** takes effect after the current step. An interrupted step that did not checkpoint stops explicitly, avoiding replay of possibly executed actions. History remains saved. Vercel's [function duration limits](https://vercel.com/docs/functions/configuring-functions/duration) therefore bound a step, not the entire run. Tool continuation preserves reasoning and call/output items following the [Responses tool-call contract](https://developers.openai.com/api/docs/guides/function-calling).

Both execution paths default to 256,000 context units and 16,384 output tokens and retain selected budgets across mode changes. Jev is enabled by default when its server credential is available; under context pressure it selects retention actions before compaction or lossless offloading. Turning Jev off uses deterministic selection. Task and management calls count toward the agent total and wall deadline. Live activity, elapsed time, Stop and Resume are visible without opening the context garden.

Every task request includes a current file manifest with source/version IDs and write times. Stale updates are rejected; existing files must be fully read before editing. Exact patches preserve unmatched content, full replacements must retain existing Markdown headings, and a final answer is deferred until all pages of each written version have been read back. Superseded unprotected file excerpts leave working context while original documents and snapshots remain intact. Oversized historical drafts can be offloaded to lossless retrieval pointers when they do not fit a compaction batch. Readback establishes that the model received the file, not that it correctly assessed every requirement. See [the review follow-up](docs/agent-mode-increment.md).

The runner does not run shell/code, browse the web, implement arbitrary context-file editing, or run unattended after the browser closes. The four-mode experiment in `Next steps.md` remains future work. A durable scheduler and isolated execution environment are sensible next increments.

Run `node --test test/agent.test.js test/workspace.test.js` for offline mechanics and `node scripts/agent-smoke.js --live` for an opt-in real-provider check (up to eight calls; saves its audit under ignored `.agent-smoke/`). `npm run test:agent:browser` uses real local HTTP/service/storage with a scripted provider. For a separate opt-in native Jev pressure check, run `node --env-file=.env scripts/agent-jev-smoke.js --live`. The Neon check is gated to the existing disposable test branch: `node --env-file=.env.neon-test --test test/neon.test.js`.

Claude adapter tests: `node --test test/anthropic.test.js`. For a live Claude workspace proof, use `node --env-file-if-exists=.env scripts/agent-smoke.js --live --provider=anthropic --model=YOUR_CLAUDE_MODEL_ID`, choosing a model available to your API key. For a one-call semantic compaction proof, use `node --env-file-if-exists=.env scripts/claude-context-smoke.js --live --model=YOUR_CLAUDE_MODEL_ID`. These spend API tokens. The Anthropic adapter translates engine tool exchanges to native Messages API blocks, preserves signed thinking blocks during tool continuation, and uses native structured JSON output for semantic compaction. Exports retain both engine inputs and native Anthropic request bodies, provider/model attribution and reported usage (including cache input tokens). See [Claude integration validation](docs/reports/claude-conclave-integration-2026-10-01.md).

## Neon setup

The app workspace is linked locally to Neon project `divine-bar-20917398` (`converse`), branch `production`. `neon.ts` declares Neon Auth; Postgres and Auth are already provisioned. The CLI's `neon deploy` applies this service configuration, not the Converse web app.

Run Neon commands from this repository directory. Use `neon config plan` to preview service changes, `neon deploy --no-env-pull` to apply them, and `neon env pull --file .env` to refresh local connection settings. `.neon` and `.env` are git-ignored; `.env` matches the local dev command's environment file. The installed Neon plugin supplies skills and MCP access; no duplicate installation is required.

The database schema is versioned in `lib/db-schema.js` and `drizzle/`. Generate later schema changes with `npm run db:generate`; test migrations on a separate Neon branch, then run `npm run db:migrate` using the direct `DATABASE_URL_UNPOOLED`. Runtime connections use pooled `DATABASE_URL`. Migrations are explicit and are not run during function requests or Git deployments. App access still uses the existing app password; Neon Auth is provisioned but is not wired into the UI.

## Vercel deployment

The bundled Conclave engine and `api/conclave.js` deploy with this repository. See [hosted context notes](VERCEL_CONTEXT_PLAN.md) for storage, coordination, export and MVP limits.

Import this repository using the **Other** framework preset. The included `vercel.json` serves `public/` and runs `api/*.js` as Node functions. No build command is required. Add `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` and a long random `APP_PASSWORD` in Vercel environment settings, then deploy. Local PC environment variables are not transferred to Vercel. Hosted API access fails closed unless APP_PASSWORD is set. The app password grants access to your provider budget; use a strong random value. Rotate it to invalidate sessions. For broader sharing use a full identity/rate-limiting service or Vercel deployment protection.

For context mode, add the pooled `DATABASE_URL` as a server-side Production secret, and `JEV_API_KEY` (or `TYPESAFE_API_KEY`) to enable Jev. Existing provider keys and `APP_PASSWORD` are reused. Preview deployments need their own database branch and environment settings to offer context mode. Pushes to `main` trigger the existing Git deployment. Environment changes require a new deployment; secrets never belong in Git or `public/`.

Unlock with the app password; sessions use a secure HttpOnly cookie for seven days. API keys are never sent to the frontend. This implementation is intended for personal use.

## Install

On Android/desktop Chromium, use Install app when offered or the browser install menu. On iPhone/iPad, open in Safari and use Share → Add to Home Screen. HTTPS is required except localhost. The app shell and saved chat can open offline after the first visit; model replies need internet. An update activates after existing app windows close.

## Chat

Toggle the GPT, Claude and Gemini chips above the composer, or type @GPT, @Claude or @Gemini; multiple recipients reply in parallel. Mentions in a message override the chips for that message, and the chips show who will reply. Models see shared history with provider/model attribution. Five recent models appear per provider plus GPT-4o pinned to `gpt-4o-2024-11-20` and Gemini `gemini-3.1-pro-preview`. Gemini ordering uses versions, not release dates. Availability depends on provider access/quota.

Replies stream and render sanitized Markdown. Copy retains original Markdown. Upload one Markdown file up to 200 KB. Mentions inside attachments do not select recipients. Export Markdown and Export JSON are in the ⋯ menu at the top right. Enter sends on desktop; on touch devices Enter inserts a new line. The current chat is saved in this browser's local storage, not synced to other devices. Do not use on shared devices for sensitive conversations. Failed partial replies are visible but excluded from history/export. Refreshing during a reply loses that unfinished reply.

## Development

Supported models can stream a collapsed **Reasoning summary**, labelled by provider/model. These are provider-reported summaries, not full internal reasoning. They survive completed-call reloads and export; Copy response copies only the answer. JSON also preserves encrypted reasoning and native signatures without displaying them. Context/Agent makes readable summaries searchable and pageable, and retains earlier tool-step summaries even when a run fails. Claude preserves signed input prefixes within active tool turns and stops with saved progress if their context budget is exceeded. Native replay across later user turns is not guaranteed. See [issue 13 integration](docs/issue-13-reasoning-integration.md).

`npm test` runs offline API contract checks. `npm run check` checks JavaScript syntax. Core API adapters live in `lib/providers.js`, Vercel handlers in `api/`, UI in `public/`. Local dev invokes the same handlers. Vendored Marked 18.0.12 and DOMPurify 3.4.15 retain their upstream license headers. No deployment is performed by these scripts.

Model selections persist on this device. New chat moves the current device chat to **On this device** in the sidebar (the 20 most recent are kept) instead of deleting it; reopen or delete chats there. Saved context chats are listed under **Saved on server**. Streaming follows new text only while you are at the bottom. Expired sessions reopen the unlock dialog.

Install development tools with npm install. Run npm run test:browser for desktop and phone-sized Chromium checks using installed Microsoft Edge, including offline restore, Markdown safety, attachment routing, and session recovery. These emulate a phone viewport, not a physical iPhone. npm run format formats maintained source.

### Provenance and exports

Export JSON saves the versioned canonical record; Markdown is the readable transcript. Records include stable conversation/participant/message IDs, timestamps, routing mentions, reply links, and separate attachments with SHA-256 hashes of original file bytes. Markdown attachments use code fences longer than any backtick run in their contents to isolate nested transcripts.

Completed calls retain context message/attachment IDs, the application system prompt and version, history transformation version, explicit generation settings, requested model, provider-reported model/response IDs and raw provider usage when available. Parallel replies share the same context snapshot. Failed replies persist but are excluded from future context. Provider defaults and nondeterminism prevent guaranteed inference reproducibility.

Legacy chats migrate with unknown timestamps; pasted historical attachments are not inferred. Participant IDs remain stable across model changes; current names remain GPT/Claude/Gemini. Missing usage, pricing and cost are null. Pricing estimates, spending dashboards, participant renaming and JSON import are deferred. Ordinary chats remain device-local; context chats use server storage. Export important chats.
