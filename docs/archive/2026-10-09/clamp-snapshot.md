# CLAMP Clyp snapshot migration

2026-10-09. Local branch `codex/clamp-clyps`, from Conclave source commit
`316fb3089c3919b5c4bfc2bb8b5cf77537415df9`.

The managed snapshot includes the initial [CLAMP Clyp profile](../../../../CLA/conclave/docs/CLAMP.md),
bounded immutable ORMD revisions, account-scoped explicit links and dashboard
connections. All changes were implemented and tested in Conclave first.
Existing app UI and deployment configuration were not edited.

Validation:

- `node scripts/sync-converse.js --apply --target ../../converse` and `--check`:
  all 107 files match; nine existing managed files changed and one module added.
- Converse `node scripts/check-engine.js` and `node scripts/check.js` pass.
- App suite: 203 passes, one optional skip, zero failures. The initial run using
  Windows sandbox OS temp storage hit seven rename/HTTP failures; rerunning the
  unchanged suite with TEMP/TMP pointed to `.test-tmp/clamp` resolved all of them.
- Source validation: 371 passes / one optional skip, ten subsequent focused
  Clyp/MCP transport checks, and ten synthetic desktop/mobile dashboard cases.

No push or deployment. Live model acceptance, independent idea/project IDs,
arbitrary ORMD imports and durable-memory promotion remain future work.
