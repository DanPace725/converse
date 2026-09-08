# Converse

A small installable chat app for GPT, Claude and Gemini. Responsive on phones, tablets and desktop. No build dependencies.

## Local

Requires Node.js 22+. Set provider keys in your environment or copy `.env.example` to `.env` and fill it in, then run `npm run dev` (or `node --env-file-if-exists=.env scripts/dev.js`). Open http://127.0.0.1:3211.

## Vercel

Import this repository using the **Other** framework preset. The included `vercel.json` serves `public/` and runs `api/*.js` as Node functions. No build command is required. Add `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` and a long random `APP_PASSWORD` in Vercel environment settings, then deploy. Local PC environment variables are not transferred to Vercel. Hosted API access fails closed unless APP_PASSWORD is set. The app password grants access to your provider budget; use a strong random value. Rotate it to invalidate sessions. For broader sharing use a full identity/rate-limiting service or Vercel deployment protection.

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

Legacy chats migrate with unknown timestamps; pasted historical attachments are not inferred. Participant IDs remain stable across model changes; current names remain GPT/Claude/Gemini. Missing usage, pricing and cost are null. Pricing estimates, spending dashboards, participant renaming and JSON import are deferred. Storage remains device-local; export important chats.
