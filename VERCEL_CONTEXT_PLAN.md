# Hosted context MVP

Implemented 2026-10-01 for the existing Converse Git deployment on Vercel.

## Working scope

- GPT context chats, reasoning selection, optional native Jev selection, remembered state, saved-chat reopening, context inspection, garden/replay and token-saving estimates.
- Same-origin `api/conclave.js` uses the existing app password and origin guards. Capabilities enable the UI on local or hosted domains when configured.
- A self-contained engine snapshot lives in `lib/conclave`; no sibling checkout or local conversation data is needed during deployment.
- One Neon database: `app.conversations` holds conversation identity/revision/leases; `conclave.events` holds original messages, documents and complete audit records; `conclave.snapshots` holds immutable revisions. The web transcript derives from those source events rather than an independently saved copy.
- A fresh in-memory SQLite index rebuilds the existing retrieval/bundle indexes from Neon per request. It is disposable; PostgreSQL is the authoritative storage. No hosted filesystem writes or disk backups are needed.
- Mutations atomically claim a database lease. Each flush fences the lease token and expected sequence/revision; event and snapshot inserts commit together. Transactions end before model calls. Active turns publish progress before each inference and after its response/failure for the garden to read across instances.
- Completed message IDs/fingerprints prevent paid inference on a completed retry. Conflicting or unfinished IDs are rejected. A total model-call deadline of 200 seconds leaves room beneath the 240-second function limit to save failures and release the lease. A crashed worker's lease expires after 270 seconds from its last flush.
- JSON downloads stream the canonical transcript and full context audit. Original text, IDs, snapshots, tool exchanges, Jev decisions and raw provider usage remain exportable.

## Deployment

The production schema was applied through the checked-in Drizzle migration after a focused check on an expiring `converse-hosting-check` Neon branch. Runtime uses pooled `DATABASE_URL`; explicit migrations use `DATABASE_URL_UNPOOLED`. Vercel only needs the pooled URL, existing `OPENAI_API_KEY`/`APP_PASSWORD`, and optional `JEV_API_KEY`. Set variables before the deployment used for testing; environment updates require redeployment. The app retains its password sign-in; managed Neon Auth is not integrated in this MVP.

The focused check covers fresh-instance persistence, in-flight garden visibility, overlapping requests, completed/conflicting retries, remembered state, exports and database-enforced audit immutability with a fake model provider. Existing HTTP/guard contracts and syntax checks also pass. No long-form or load tests were added.

Production was checked at `https://converse-cyan.vercel.app`: Luna answered one short context turn (1,156 input / 7 output tokens), the same chat restored after reload, and the live garden showed its saved sources and revision. The downloaded JSON passed checks for two transcript messages, two snapshots, all eight audit events, source links and provider usage. This check made one model call and no Jev call; long-form Jev behavior remains for conversational testing.

## Deliberate MVP limits

Ordinary multi-provider chats remain browser-local. Existing CLI/SQLite chats remain on this PC; bulk import and JSON restore are follow-ups. Context answers arrive when the turn finishes. There is no durable job queue or automatic resumption of an interrupted model call; reload the saved chat to inspect progress/failure, wait for an active lease to finish/expire, and send a new message if needed. Reads rebuild the full conversation index, and JSON exports are assembled in memory before streaming; optimizing very long audits is later work. Preview context testing requires a separate Neon branch and Preview credentials.

Garden savings compare original source text to current context text using `ceil(UTF-8 bytes / 4)`. They exclude instructions, metadata, tool exchanges and management calls, so they are an estimate of context-text reduction rather than billed or net cost savings.
