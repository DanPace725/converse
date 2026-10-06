# Google sign-in and conversation ownership

2026-10-06. Setup steps live in [hosted setup](../../HOSTED_CONTEXT.md#google-sign-in).

## What changed

- **Identity sessions** (Conclave `6f4cd02`, `src/access.js`): `SESSION_SECRET` switches the session cookie from `expires.signature` to `expires.user.signature`, where `user` is the signed-in ID and email. `guard` then requires a user whose email is on `ALLOWED_EMAILS` on every request and rejects password cookies. `identity(req)` returns that user. Without `SESSION_SECRET`, password and open local access behave as before.
- **Neon Auth relay** (Converse `lib/neon-auth.js`, `api/session.js`): `POST {provider: "google"}` asks Neon Auth for the sign-in address and stores its challenge in a ten-minute `converse_signin` cookie. Google returns the browser to `GET /api/session?neon_auth_session_verifier=…`; the server exchanges verifier plus challenge at Neon Auth's `get-session`, requires a verified address on the allowlist, sets the session cookie and redirects to `/`. Refusals return to `/?signin=denied` or `/?signin=failed`. `GET` reports the sign-in mode and current user; `DELETE` signs out. The protocol follows Neon's own server SDK (`neondatabase/neon-js`, `packages/auth/src/server`).
- **UI**: the unlock dialog asks the server which sign-in applies and shows either the password form or Continue with Google. The overflow menu shows Sign out with the account's address.
- **Ownership** (Conclave `03d8fec`): `app.conversations.owner_id` (migration `0003_conversation_owner`, nullable, indexed with `created_at`). The hosted handler builds its repository for the signed-in user; list, transcript, image, every read and every write filter on the owner, and a mismatch is reported as not found. Events, snapshots, segments and embeddings are reached only through an owned conversation. `scripts/claim-conversations.js` assigns unowned rows to one account.

## Evidence

- Conclave: 298 passes, one optional skip. `test/access.test.js` covers forged, truncated, expired, delisted and rotated-secret cookies; `test/conversation-ownership.test.js` runs two users against PGlite with all four migrations and checks eight read paths and four write paths against both a foreign and an unowned conversation. Disabling the owner filter makes it fail.
- Converse: 194 passes, one optional skip; 85-file parity. `test/session.test.js` covers the relay with a fixture Neon Auth. 109 desktop/mobile browser runs passed, one optional skip, including a Google-mode dialog, refused return and sign-out.
- Live against the project's Neon Auth: status reported Google mode, and the sign-in request returned a challenge and an address that redirected to Google.

## Not verified

- Google refused Neon's shared development credentials (`redirect_uri_mismatch` for `https://neonauth.c-4.us-west-2.aws.neon.tech/auth/oauth/callback/google`), so no real account has completed sign-in. The return leg is tested only against a fixture.
- Migration `0003` has run on PGlite only. The Neon test branch credentials in `.env.neon-test` are rejected; the production branch is unchanged.
- The 23 existing conversations are unowned. No Neon Auth user exists yet to claim them.

## Limits

- Chat mode stays in browser storage and does not follow the account.
- Local SQLite storage is not scoped by user.
- A session cookie stays valid for up to seven days after sign-out if copied elsewhere; rotating `SESSION_SECRET` ends all sessions.
- Neon Auth has email/password sign-up enabled without verification. The app accepts only Google-verified addresses on the allowlist, but disabling that sign-up removes the exposure.
