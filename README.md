# Converse

A small installable chat app for GPT, Claude and Gemini. Responsive on phones, tablets and desktop. No build dependencies.

## Local

Requires Node.js 22.13+ (Node 24 on Vercel). Run `npm install`. Set provider keys in your environment or copy `.env.example` to `.env` and fill it in, then run `npm run dev` (or `node --env-file-if-exists=.env scripts/dev.js`). Open http://127.0.0.1:3211.

## Context layer

New chats use the context layer when the server supports it. Open **Context layer** above the composer to change its settings. Use the selected GPT model with reasoning and native Jev selection enabled by default, reopen saved context chats, inspect working context, remember a named state entry, or watch the context garden. Replies appear after the layered answer completes. Provider keys stay on the server.

With `DATABASE_URL`, local and hosted requests use Neon. Context chats, originals, audit events and immutable snapshots survive reloads and new function instances. **Export JSON** downloads the canonical transcript plus the complete `context_layer` record, including source IDs, provider inputs/usage, tool exchanges, Jev decisions and failures. The browser keeps display data and the conversation ID; the audit stays on the server. Existing SQLite chats remain on this PC and are not automatically uploaded.

Without `DATABASE_URL`, local development falls back to SQLite in `CONCLAVE_DATA_DIR` or the sibling `.conclave` folder and reads Windows User/Machine provider keys. Vercel always uses Neon. Ordinary multi-provider chats retain their browser-local storage and streaming behavior.

## Agent proof of concept

Turn on **Agent Mode** beside the composer, enter an objective, and press **Run agent** (the normal Send button). Turn it off to return to context chat. The selected GPT model continues making tool calls until it returns a final answer or reaches a limit. Start with: “Calculate 17 × 23, write the result to proof.md, read it back, then report what you verified.” You can attach one Markdown source document.

Tools include arithmetic; listing, reading, writing and applying exact text patches in a saved **virtual text workspace**; and Conclave's existing history retrieval, context editing, offloading and structured state updates. Files live in the conversation's SQLite/Neon history, with previous versions preserved. They are not host filesystem paths. Both context chat and agent mode have these workspace tools. **Workspace files** beside the composer provides direct downloads; Export JSON contains full files, provider inputs, tool exchanges and run checkpoints. Workspace limits are 20 files, 100 KB per file and 500 KB total current text.

Defaults: 10 minutes, 40 model steps, 256,000 context-budget units, 16,384 output tokens per call, and 250,000 total provider input/output tokens. All are adjustable in the panel. Context units are the engine's conservative UTF-8 byte proxy, not actual tokens or a promise of the model's context capacity. The total-token check reserves estimated input plus maximum output before each call and uses reported usage afterward; it can stop below the selected total. Missing usage stops the run. Provider failures and output exhaustion remain explicit failures; no automatic model substitution or paid retries.

Each step is one task-model request plus its tool actions and, under context pressure, bounded context-management calls, saved before the next browser request. This uses the existing hosted endpoint, database lease and schema: no migration or queue is required. Keep the browser tab open to drive the loop. Reloading pauses further requests; reopen the saved chat and choose **Resume run** before the original deadline. **Stop** takes effect after the current step. An interrupted step that did not checkpoint stops explicitly, avoiding replay of possibly executed actions. History remains saved. Vercel's [function duration limits](https://vercel.com/docs/functions/configuring-functions/duration) therefore bound a step, not the entire run. Tool continuation preserves reasoning and call/output items following the [Responses tool-call contract](https://developers.openai.com/api/docs/guides/function-calling).

Both execution paths default to 256,000 context units and 16,384 output tokens and retain selected budgets across mode changes. Jev is enabled by default when its server credential is available; under context pressure it selects retention actions before compaction or lossless offloading. Turning Jev off uses deterministic selection. Task and management calls count toward the agent total and wall deadline. Live activity, elapsed time, Stop and Resume are visible without opening the context garden.

Every task request includes a current file manifest with source/version IDs and write times. Stale updates are rejected; existing files must be fully read before editing. Exact patches preserve unmatched content, full replacements must retain existing Markdown headings, and a final answer is deferred until all pages of each written version have been read back. Superseded unprotected file excerpts leave working context while original documents and snapshots remain intact. Oversized historical drafts can be offloaded to lossless retrieval pointers when they do not fit a compaction batch. Readback establishes that the model received the file, not that it correctly assessed every requirement. See [the review follow-up](docs/agent-mode-increment.md).

The runner does not run shell/code, browse the web, implement arbitrary context-file editing, or run unattended after the browser closes. The four-mode experiment in `Next steps.md` remains future work. A durable scheduler and isolated execution environment are sensible next increments.

Run `node --test test/agent.test.js test/workspace.test.js` for offline mechanics and `node scripts/agent-smoke.js --live` for an opt-in real-provider check (up to eight calls; saves its audit under ignored `.agent-smoke/`). `npm run test:agent:browser` uses real local HTTP/service/storage with a scripted provider. For a separate opt-in native Jev pressure check, run `node --env-file=.env scripts/agent-jev-smoke.js --live`. The Neon check is gated to the existing disposable test branch: `node --env-file=.env.neon-test --test test/neon.test.js`.

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

Use @GPT, @Claude or @Gemini; multiple mentions request parallel responses. Without mentions, previous recipients reply. Models see shared history with provider/model attribution. Five recent models appear per provider plus GPT-4o pinned to `gpt-4o-2024-11-20` and Gemini `gemini-3.1-pro-preview`. Gemini ordering uses versions, not release dates. Availability depends on provider access/quota.

Replies stream and render sanitized Markdown. Copy retains original Markdown. Upload one Markdown file up to 200 KB. Mentions inside attachments do not select recipients. Export is next to Send. Enter sends on desktop; on touch devices Enter inserts a new line. The current chat is saved in this browser's local storage, not synced to other devices. Do not use on shared devices for sensitive conversations. Failed partial replies are visible but excluded from history/export. Refreshing during a reply loses that unfinished reply.

## Development

`npm test` runs offline API contract checks. `npm run check` checks JavaScript syntax. Core API adapters live in `lib/providers.js`, Vercel handlers in `api/`, UI in `public/`. Local dev invokes the same handlers. Vendored Marked 18.0.12 and DOMPurify 3.4.15 retain their upstream license headers. No deployment is performed by these scripts.

Model selections persist on this device. New chat clears the conversation after confirmation. Streaming follows new text only while you are at the bottom. Expired sessions reopen the unlock dialog.

Install development tools with npm install. Run npm run test:browser for desktop and phone-sized Chromium checks using installed Microsoft Edge, including offline restore, Markdown safety, attachment routing, and session recovery. These emulate a phone viewport, not a physical iPhone. npm run format formats maintained source.

### Provenance and exports

Export JSON saves the versioned canonical record; Markdown is the readable transcript. Records include stable conversation/participant/message IDs, timestamps, routing mentions, reply links, and separate attachments with SHA-256 hashes of original file bytes. Markdown attachments use code fences longer than any backtick run in their contents to isolate nested transcripts.

Completed calls retain context message/attachment IDs, the application system prompt and version, history transformation version, explicit generation settings, requested model, provider-reported model/response IDs and raw provider usage when available. Parallel replies share the same context snapshot. Failed replies persist but are excluded from future context. Provider defaults and nondeterminism prevent guaranteed inference reproducibility.

Legacy chats migrate with unknown timestamps; pasted historical attachments are not inferred. Participant IDs remain stable across model changes; current names remain GPT/Claude/Gemini. Missing usage, pricing and cost are null. Pricing estimates, spending dashboards, participant renaming and JSON import are deferred. Ordinary chats remain device-local; context chats use server storage. Export important chats.
