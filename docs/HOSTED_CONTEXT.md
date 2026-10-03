# Hosted Context and Agent setup

## Deploy

Vercel uses the Other preset, serves `public/`, and runs `api/*.js` as Node functions through `vercel.json`. No build command is required. The engine is bundled in `lib/conclave/`.

Set server environment variables:

- `APP_PASSWORD`: required for hosted access; rotate it to invalidate sessions.
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`: enable their providers.
- Pooled `DATABASE_URL`: required for hosted Context/Agent persistence.
- Optional `JEV_API_KEY` or `TYPESAFE_API_KEY`: enables the selector.

Environment changes require redeployment. Preview uses its own Neon branch and credentials.

## Database

Schema lives in `lib/db-schema.js` and `drizzle/`. Runtime uses the pooled connection; migrations use direct `DATABASE_URL_UNPOOLED`.

```powershell
npm run db:generate
# Check a schema change on a separate Neon branch.
npm run db:migrate
```

The local Neon project is `divine-bar-20917398` (`converse`), branch `production`. `neon config plan` previews service changes; `neon deploy --no-env-pull` applies service configuration; `neon env pull --file .env` refreshes local connection settings. Neon Auth is provisioned; the app currently uses password sessions.

`app.conversations` holds identities/revisions/leases. `conclave.events` and `conclave.snapshots` hold durable history. A disposable in-memory SQLite index rehydrates from Neon per request. Mutations claim a lease; fenced event/snapshot writes commit together. Transactions end before inference. Completed retries return saved results.

## Request and run behavior

Task responses allow 180 seconds. Hosted requests have a 200-second deadline inside the configured 240-second function limit. Context preparation shares the request deadline. Failures and completed actions are saved; incomplete tool calls do not execute.

Default Agent allowances: 40 steps, 600 seconds, 250,000 total provider tokens; 256,000 conservative context units and 16,384 output tokens per call. Automatic testing can grow allowances within server ceilings. Each step supports 16 tool calls. The browser drives steps; unattended work requires a durable worker.

Inspect request counts, reported usage, byte guards, and stop reasons separately in Workspace. Canonical JSON includes historical sources, snapshots, tool exchanges, provider usage, and failures. [App guide](../public/app-guide.md) describes resume and export behavior.
