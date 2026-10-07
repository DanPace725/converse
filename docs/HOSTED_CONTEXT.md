# Hosted Context and Agent setup

## Deploy

Vercel uses the Other preset, serves `public/`, and runs `api/*.js` as Node functions through `vercel.json`. No build command is required. The engine is bundled in `lib/conclave/`.

Set server environment variables:

- Access: either `SESSION_SECRET` and `ALLOWED_EMAILS` for [Google sign-in](#google-sign-in), or `APP_PASSWORD` for one shared password. Rotating either secret invalidates sessions.
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`: enable their providers. With [personal API keys](#personal-api-keys) on, these serve only the addresses on `SHARED_KEY_EMAILS`.
- Pooled `DATABASE_URL`: required for hosted Context/Agent persistence.
- Optional `JEV_API_KEY` or `TYPESAFE_API_KEY`: enables the selector.

Environment changes require redeployment. Preview uses its own Neon branch and credentials.

## Google sign-in

Instructions checked against the code and current Neon documentation on **2026-10-06**.

The changes let people use their Google account to enter Converse. You choose which email addresses are allowed. Each person gets their own saved Context/Agent conversations when the app uses Neon. Ordinary Chat remains stored in the browser, and the local SQLite fallback does not separate conversations by account.

The local implementation report records a Google `redirect_uri_mismatch` with Neon's shared development credentials and no completed real login. It also records the conversation-owner migration as unapplied to Neon. These are recorded results, not a fresh check of the live service. Follow the setup below, then complete the real login check. [Implementation and test evidence](archive/2026-10-06/google-sign-in.md)

### 1. Open the correct Neon branch and enable Auth

Open the [Neon Console](https://console.neon.tech), choose your Converse project, then select the database branch the app will use. Open **Auth** and enable it if needed. This repository declares `auth: true` in `neon.ts` already.

Keep the database connection and Auth URL on the same branch. Each branch has its own authentication environment. [Neon: Auth overview](https://neon.com/docs/auth/overview)

### 2. Create your Google sign-in credentials

In Neon, open **Settings → Auth → OAuth providers**. For Google, open its **⋮ → Configure** menu, or choose **Add OAuth provider** if Google is absent. Copy the **authorization callback URL** shown in that dialog; leave it open for now. https://ep-dry-dew-ar4a7tfu.neonauth.c-4.us-west-2.aws.neon.tech/neondb/auth/callback/google

Open [Google Cloud Console](https://console.cloud.google.com). Select or create a project for Converse. In **Google Auth Platform**, complete the initial setup if prompted: use **Converse** as the app name and enter your support/contact email. Then open **Clients → Create client** and choose **Web application**.

Under **Authorized redirect URIs**, paste the exact callback you copied from Neon. This address includes Neon's hostname and the full path ending in `/callback/google`. Create the client and copy its **Client ID** and **Client Secret** into the Google provider dialog in Neon. Save with **Add** or **Update**. The Google secret belongs in Neon; this Converse implementation does not read it from `.env` or Vercel.

Use your own credentials for production. Neon offers shared Google credentials for development, but they failed in this project's recorded attempt. [Neon: OAuth setup](https://neon.com/docs/auth/guides/setup-oauth#production-setup), [Google: Create authorization credentials](https://developers.google.com/identity/protocols/oauth2/web-server#creatingcred)

For initial testing, add your account under Google's **Audience → Test users** if applicable. Google documents an exception to the test-user restriction for apps requesting only basic identity scopes; publishing and verification requirements depend on the app's audience and requested scopes. Converse's own email allowlist in step 5 still applies. [Google: OAuth app states](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)

### 3. Tell Neon where Converse runs

In Neon, open **Auth → Configuration → Domains**. Add the full address where people open Converse, for example `https://your-app.vercel.app`. Include `https://`, with no path or trailing slash. Add your custom domain separately if people use that too.

For local testing, use `http://localhost:3211`. Neon normally allows localhost ports automatically; check **Allow Localhost** if it fails. Use `localhost` rather than `127.0.0.1` for this setup. [Neon: Trusted domains](https://neon.com/docs/auth/guides/configure-domains), [Neon: Allow Localhost setting](https://neon.com/docs/cli/neon-auth#domain-allow-localhost)

There are two different return addresses:

| Address | Where it goes | Purpose |
| --- | --- | --- |
| Exact callback copied from Neon, ending in `/callback/google` | Google client's **Authorized redirect URIs** | Google sends the user back to Neon. |
| Converse origin, such as `https://your-app.vercel.app` | Neon's **Domains** list | Neon is allowed to send the user back to Converse. |

Converse automatically asks Neon to return the user to `/api/session` on the app's origin. You do not enter that app path as Google's redirect URI. [Neon: Distinguishing the two URLs](https://neon.com/docs/auth/guides/setup-oauth#production-setup)

### 4. Apply the conversation-owner database migration

Do this before running the changed code against Neon, even if you are keeping password access for now. The new code expects the `owner_id` column added by `drizzle/0003_conversation_owner.sql`.

In PowerShell, from the application folder:

```powershell
Set-Location E:\Coding\converse\converse
```

Ensure `.env` has the **direct** database connection in `DATABASE_URL_UNPOOLED` for the intended branch. Then run:

```powershell
npm run db:migrate
```

The success message is `Context database migrations applied.` This applies pending checked-in migrations; you do not need to generate a new migration for this setup. First check on a test branch when possible.

If using the Neon CLI, you can refresh this branch's local settings with `neon env pull --branch BRANCH_NAME --file .env`, replacing `BRANCH_NAME` with the intended branch. Run it from this folder with the correct project linked. It writes Neon settings to the file; it does not configure Vercel. [Neon: Environment variable pull](https://neon.com/docs/cli/env#neon-env-pull)

### 5. Set Converse's environment variables

For local use, edit `.env` in the application folder. For the hosted app, open the Vercel project's **Settings → Environment Variables** and set these for the environment you will deploy:

| Variable | What to put in it |
| --- | --- |
| `NEON_AUTH_BASE_URL` | The Auth base URL for that Neon branch, copied from Neon or pulled by the CLI. Keep its full path, often ending in `/auth`; do not append `/callback/google`. |
| `SESSION_SECRET` | A long random secret, at least 32 characters. This switches Converse to Google sign-in. |
| `ALLOWED_EMAILS` | Full Google account emails allowed into Converse, separated by commas; for example `you@example.com,friend@example.com`. |
| `DATABASE_URL` | The **pooled** database connection for that same branch. This stores Context/Agent conversations. |

Keep your existing model API keys. `DATABASE_URL_UNPOOLED` is needed locally for migration and claiming old conversations. `NEON_AUTH_JWKS_URL` may be pulled by Neon, but the current sign-in relay does not use it.

To generate a session secret, run this locally and copy the result into the setting:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Once `SESSION_SECRET` is set, Converse ignores `APP_PASSWORD`; there is no password fallback while Google mode is enabled. An empty `ALLOWED_EMAILS` lets nobody in. Removing an email blocks that account on subsequent requests once the updated environment is active. Rotating the secret invalidates all app sessions. These are Converse-specific settings, defined in `lib/conclave/access.js`.

### 6. Restart or redeploy, then complete a real login

Locally, restart with `npm run dev` and open `http://localhost:3211`. On Vercel, redeploy the changed code after saving its environment variables.

Open Converse in a normal browser and click **Continue with Google**. Choose an email listed in `ALLOWED_EMAILS`. You should return to Converse, and the menu's **Sign out** item should show your email.

Create a Context conversation, reload, and confirm you can reopen it. Sign out and confirm protected access asks for login again. If another email is allowed, test it separately and confirm it cannot see the first account's new conversation. The four existing session tests passed during this documentation review, but they use a simulated Neon response and do not prove a real Google login works.

### 7. Restore access to old saved conversations

Existing Context/Agent conversations have no owner and disappear from the signed-in account's list until assigned. After your first successful login, run:

```powershell
node --env-file-if-exists=.env scripts/claim-conversations.js you@example.com
```

Replace the email with the account that should own the old conversations. This first command only reports how many would be assigned. If the result is what you want, run:

```powershell
node --env-file-if-exists=.env scripts/claim-conversations.js you@example.com --apply
```

These commands call Node directly because some PowerShell/npm launchers drop the `--apply` argument. The first command should report how many conversations would be assigned; the second should print `Assigned N conversations to you@example.com.`

This assigns **all currently unowned conversations in that database** to that one account. It does not move conversations already owned by someone else. Use the same branch's `DATABASE_URL_UNPOOLED`, then refresh Converse.

### If it does not work

| What you see | What to check |
| --- | --- |
| Password box instead of Google button | `SESSION_SECRET` is missing in the running environment, or the server/deployment needs restarting. |
| Google's `redirect_uri_mismatch` | The full callback copied from Neon's Google dialog must match Google's Authorized redirect URIs exactly. Check that Neon uses your own client credentials. [Neon OAuth setup](https://neon.com/docs/auth/guides/setup-oauth#production-setup) |
| App says the address is not trusted | Add the app's exact origin to Neon's Domains list on the branch being used. For local use, check Allow Localhost. [Neon domain setup](https://neon.com/docs/auth/guides/configure-domains) |
| App says access is denied | Check the chosen Google account's full email against `ALLOWED_EMAILS` in the active deployment. |
| Google button reports unavailable, or login returns failed | Check `NEON_AUTH_BASE_URL`, the branch's Auth/provider configuration, and server logs. Start again from Converse; the temporary return cookie expires after ten minutes. |
| Database error mentioning `owner_id` | Apply the checked-in migration to the database that the app actually uses. |
| Login works but old conversations are missing | Complete step 7 for the intended owner. |

For a Google-only app, you can also disable email/password authentication in Neon's Auth configuration. It is not required to fix the Google redirect. The previous bare `neon neon-auth config email-password update` command did not specify a change; use the Console's setting or explicit CLI options. [Neon: Email/password configuration](https://neon.com/docs/cli/neon-auth#config-email-password-update)

Converse uses its own seven-day app cookie after Neon confirms the account. Signing out clears that browser's cookie; it does not immediately revoke a copy held elsewhere. Removing an account from `ALLOWED_EMAILS` blocks it, and rotating `SESSION_SECRET` invalidates every app cookie. The app's relay in `lib/neon-auth.js` is custom code rather than Neon's standard SDK integration; the real return flow still needs the login check above.

## Personal API keys

Signed-in people can each use their own provider keys. This needs Google sign-in; it is off until `KEY_ENCRYPTION_SECRET` is set, and until then everyone uses the deployment's keys as before. [Implementation, evidence and limits](archive/2026-10-06/personal-api-keys.md)

Once on, a person's Chat, Context and Agent requests spend only the keys that person saved, including web search, Jev and embeddings. A provider they have no key for is unavailable to them. The deployment's environment keys are used only for addresses on `SHARED_KEY_EMAILS`; a saved key of their own still takes precedence.

### Turn it on

1. Apply the key table. With the direct connection in `DATABASE_URL_UNPOOLED` for the intended branch, run `npm run db:migrate`. This applies `drizzle/0004_provider_keys.sql`; do it before setting the secret.
2. Generate a secret and keep a copy somewhere safe:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

3. Set these in `.env` locally and in Vercel's environment variables, then restart or redeploy:

   | Variable | What to put in it |
   | --- | --- |
   | `KEY_ENCRYPTION_SECRET` | The secret from step 2, at least 32 characters. Saved keys are encrypted with it. |
   | `SHARED_KEY_EMAILS` | Addresses that may keep using the deployment's own keys, separated by commas. Put your own here unless you want to enter your keys in the app too. Empty means nobody. |

4. Sign in and open **API keys** in the menu. Paste a key and press Save: it is checked with the provider, then stored. The list shows whether each provider uses your key, the shared key or none.

### What to know

- A key is stored encrypted in `app.provider_keys` and is never sent back to the browser; only its last four characters are shown.
- Changing `KEY_ENCRYPTION_SECRET` makes every saved key unreadable. The dialog says so, and each person enters theirs again. A secret shorter than 32 characters stops key use with an error instead of falling back to the deployment's keys.
- Context and Agent use OpenAI and Anthropic keys; Chat also uses Gemini. Semantic history search needs an OpenAI key. Jev needs a Jev key or the shared allowance.
- `ALLOWED_EMAILS` still decides who can sign in. Password and local access have no account and keep using the environment keys.

## Database

Schema lives in `lib/db-schema.js` and `drizzle/`. Runtime uses the pooled connection; migrations use direct `DATABASE_URL_UNPOOLED`.

```powershell
npm run db:generate
# Check a schema change on a separate Neon branch.
npm run db:migrate
```

The local Neon project is `divine-bar-20917398` (`converse`), branch `production`. `neon config plan` previews service changes; `neon deploy --no-env-pull` applies service configuration; `neon env pull --file .env` refreshes local connection settings.

`app.conversations` holds identities/revisions/leases and `owner_id`, the Neon Auth user who created the conversation. A signed-in user lists, opens and changes only their own rows; anything else reads as not found. Password and open local access are unscoped and create unowned rows. Migration `0003_conversation_owner` adds the nullable column and must be applied before this code runs against a database; older code keeps working after it. Conversations saved before sign-in are unowned and hidden from signed-in users until assigned: sign in once, then `npm run db:claim -- you@example.com` reports the count and `--apply` assigns them. `app.provider_keys` holds one encrypted provider key per signed-in user and provider (migration `0004_provider_keys`). `conclave.events` and `conclave.snapshots` hold durable history. A disposable in-memory SQLite index rehydrates from Neon per request. Mutations claim a lease; fenced event/snapshot writes commit together. Transactions end before inference. Completed retries return saved results.

## Request and run behavior

Task responses allow 180 seconds. Hosted requests have a 200-second deadline inside the configured 240-second function limit. Context preparation shares the request deadline. Failures and completed actions are saved; incomplete tool calls do not execute.

Default Agent allowances: 40 steps, 600 seconds, 250,000 total provider tokens; 256,000 conservative context units and 16,384 output tokens per call. Automatic testing can grow allowances within server ceilings. Each step supports 16 tool calls. The browser drives steps; unattended work requires a durable worker.

Inspect request counts, reported usage, byte guards, and stop reasons separately in Workspace. Canonical JSON includes historical sources, snapshots, tool exchanges, provider usage, and failures. [App guide](../public/app-guide.md) describes resume and export behavior.
