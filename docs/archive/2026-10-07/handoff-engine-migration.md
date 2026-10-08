# Handoff engine migration

October 7, 2026. Local branch: `codex/conclave-handoffs`.

Migrated Conclave source `2210157bddfe9785dfbbc455e5fff95a147da736` using its normal source-first synchronization. The new `lib/conclave/handoffs.js` and updated library exports are managed by the 92-file manifest. The MCP SDK/launcher package remains in Conclave, so no new SDK dependency enters Converse's deployment.

`sync-converse.js --check`, the application syntax check, and the complete backend suite pass: **203 passed, one optional skip, zero failures**. The first backend run had seven failures under the Windows sandbox's system temporary folder, including explicit `EPERM` atomic-rename failures. Repeating the suite with TEMP/TMP pointed at `E:\Coding\converse\.test-tmp\handoff-app-temp` passed without changing runtime code.

This migrates a library foundation. It does not add a Converse handoff browser screen, hosted MCP endpoint, account linking, database migration, or production deployment. The independently tested local MCP adapter and packet storage live in [Conclave](../../../../CLA/conclave/docs/HANDOFF_MCP.md). The [plain-language setup checklist](../../../../CLA/conclave/docs/HANDOFF_SETUP.md) lists the user's current and later steps.
