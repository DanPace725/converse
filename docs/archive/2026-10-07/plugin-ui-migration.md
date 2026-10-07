# Conclave plugin UI migration

October 7, 2026, local `codex/conclave-handoffs` branch. Source commit `980b5cc436ed22038744669c78c55aa0fa7861ab` was verified/committed before migration.

`node scripts/sync-converse.js --apply` migrated 102 files and changed three runtime files: the shared MCP server, UI resource registration module and committed self-contained HTML. `--check` and Converse's engine check matched all 102 files with the recorded source commit. UI SDK, build tooling and browser fixtures remain development-only in Conclave; no app dependency changes were needed.

The sixth read-only tool, `open_handoff_library`, adds an optional MCP Apps card/browser. Existing data tools remain headless; the browser uses the same owner-scoped read permissions for search, full packets, history and exact comparisons. It cannot save a packet. Continuation sends a user-selected ID/revision request only when the host supports text messages. The static resource contains no packets/secrets and declares no external domains.

Verification:

- Conclave full suite: 350 passed / one optional saved-export replay skipped; source syntax and generated bundle check passed.
- Focused source UI/hosted/transport checks: twelve passed, including four separate transport cases.
- Source browser fixture: ten passed across desktop and narrow Edge viewports using the real App/AppBridge/SDK flow and synthetic in-memory packets. Compact expansion, keyboard search inside a form-blocked sandbox, exact version reads/comparisons, theme changes, clipboard denial, absent capabilities, inert text and error recovery covered. No native mobile/Safari or actual-account evidence.
- Converse `npm run check`: passed, including 102-file manifest parity.
- Converse `npm test`: 203 passed / one optional live Neon case skipped. Windows test temporaries were confined to a workspace directory.

Simple preview and account installation steps are in [Conclave's ongoing checklist](../../../../CLA/conclave/docs/HANDOFF_SETUP.md); [the UI guide](../../../../CLA/conclave/docs/PLUGIN_UI.md) records official platform support, design rules and planned increments. Real ChatGPT/Claude UI/OAuth, public UI origin/metadata, hosting choice, database migration and publication remain pending. No push, deployment, public registration or cloud configuration was performed.
