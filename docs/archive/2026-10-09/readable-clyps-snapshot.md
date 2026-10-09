# Readable Clyp snapshot

October 9, 2026, `codex/clamp-clyps`. Migrated committed Conclave source
`3111e39c424a198c4d3cec482ffd5613b2b9a3d2` using its sync script.

Readable handoff names work across the shared dashboard and MCP tools, including
revision-pinned links, copies/exports, history and updates. Names survive title
changes; legacy canonical IDs and bookmarks continue to work. PostgreSQL named
reads load only the account-scoped packet. No schema or dependency change.

- Parity: all 108 managed files match; seven changed/new runtime files plus manifest.
- Converse syntax/engine check passes.
- Application suite: 203 passes, one optional live Neon skip, no failures. Test
  TEMP/TMP point to checkout-local `.test-tmp/clamp` to avoid Windows sandbox
  atomic-rename failures. No test logic or machine environment was changed.
- Source validation: 34 focused handoff checks, ten desktop/mobile Edge dashboard
  cases, syntax/resource checks and a three-revision independent-client rehearsal.

[Pilot prompts and checks](../../../CLA/conclave/docs/CLAMP_PILOT.md) are prepared
for live ChatGPT ↔ Claude acceptance. The rehearsal is synthetic, not a real
model or hosted-account result. No push, deployment or production change.
