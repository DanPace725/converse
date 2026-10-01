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

Revision-11 testing found a JSONB round-trip issue after structured state updates: object-key reordering caused serialization-hash attribution checks to reject the next user projection. Attribution now compares the exact source identity fields and still rejects changed/missing/extra identity data. Projection failures are now recorded as source-linked turn failures, so exports and the transcript surface those errors. The saved failing audit continued in an offline simulation with all three remembered entries preserved, and the Neon test now sends another message from a fresh instance after saving state. Existing audits and their hashes are not rewritten.

Ordinary multi-provider chats remain browser-local. Existing CLI/SQLite chats remain on this PC; bulk import and JSON restore are follow-ups. Context answers arrive when the turn finishes. There is no durable job queue or automatic resumption of an interrupted model call; reload the saved chat to inspect progress/failure, wait for an active lease to finish/expire, and send a new message if needed. Reads rebuild the full conversation index, and JSON exports are assembled in memory before streaming; optimizing very long audits is later work. Preview context testing requires a separate Neon branch and Preview credentials.

Garden savings compare original source text to current context text using `ceil(UTF-8 bytes / 4)`. They exclude instructions, metadata, tool exchanges and management calls, so they are an estimate of context-text reduction rather than billed or net cost savings.

## Agent runner increment

The browser now drives `agent_start`, `agent_step` and `agent_stop` on the same guarded endpoint. Each step rehydrates its checkpoint and pending Responses exchanges, performs one task-model call plus bounded management calls when context is under pressure, executes bounded tools, and commits a checkpoint through the existing lease/flush path. Workspace files are source documents; checkpoints are ordinary immutable audit events. No schema migration, sibling import or hosted disk write is required.

Default run limits are 600 seconds, 40 steps and 250,000 total provider tokens, with 256,000 conservative context units and 16,384 output tokens per request. Both task and Jev management providers honor the original run deadline. The task provider combines its 90-second timeout, the repository request deadline and the original run deadline. The browser must remain open; a queue/worker is still needed for unattended execution. Stop waits for the active request. Completed step retries return saved progress; an unfinished inflight checkpoint terminates as interrupted instead of replaying uncertain actions. Pending reasoning/tool exchanges remain exact and can eventually fill the context budget; this initial runner stops explicitly rather than discarding them.

Verification: a live Luna run completed calculate → write → read → final in four model calls (6,794 input / 159 output tokens). Desktop/mobile browser tests cover HTTP/service/storage, rendered files, JSON exports, reload/resume and stop. A disposable Neon-branch check persists a workspace and pending tool output across fresh repository instances, rejects duplicate paid steps and completes the run. These checks establish the small loop, not long-horizon quality, cost savings or production Vercel deployment of this increment.

Review follow-up: Agent Mode routes the composer through the runner; progress, Stop/Resume and workspace downloads are visible outside the garden. Context chat shares versioned workspace tools. Both paths default to Jev under pressure and the same increased context/output budgets. Management usage and deadlines count toward the run limits. File readback and version guards survive request rehydration as ordinary audit events; no migration is needed. The native Jev pressure check completed with one validated Jev call plus one Luna call, with all 6,126 reported tokens included in the run total. This increment is verified locally and on the disposable Neon branch; it has not been deployed to Vercel.
