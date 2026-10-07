# Handoff history and portability migration

October 7, 2026. Canonical Conclave source commit `6fbebeab37d76a34ee935a82ae28e2d8889bf347`, branch `codex/conclave-handoffs`.

The committed source was migrated with `node scripts/sync-converse.js --apply`, then checked with `--check`. Four shared files changed, including the new portable-backup utility; the receipt now covers 100 managed files. No dependencies, schema or deployment routes changed. The standalone backup command belongs to the Conclave checkout and is not a hosted import endpoint.

The existing `api/mcp.js` factory now discovers `list_handoff_versions` and `compare_handoff_versions` alongside save/find/get. Owner scoping and read-only connection enforcement use the existing hosted repository/OAuth path. The application documentation points to the maintained plain-language checklist and records the still-open hosting choice.

Verification: Converse syntax/engine checks passed; full app suite 203 passes, one optional skip, no failures. Tests used a workspace-local temporary directory. Canonical source suite: 347 passes, one optional skip; four independent SDK transport tests passed. Source fixtures cover the new read-only HTTP calls and cross-owner isolation; backup tests exercise actual CLI processes, validation, rollback, no-overwrite output, full version fidelity and restart/retry deduplication.

This is local code and integration evidence. No push, Vercel project creation/deployment, live database migration, credentials or app settings change, or real ChatGPT/Claude/Gemini account test occurred. A standalone Conclave deployment remains under consideration. The setup document retains credential rotation, usage checks, chosen sign-in identity, hosting and real account checks as pending.
