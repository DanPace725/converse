# Coding integrations and desktop setup

October 7, 2026, `codex/conclave-handoffs`. Conclave implemented/verified/committed packaging in `81adb28545ea81d438b17c1121a17aa8804b323d` and recorded Claude Desktop setup in `6293765bf2d93baab92c613eca7874fa7fb7c8b4` before synchronizing.

The 102-file shared runtime remains byte-identical to the preceding UI increment; migration changed no runtime file and updates the manifest's source commit. Connection generators and bundled skills stay in Conclave, with application docs linking to the active [coding guide](../../../../CLA/conclave/docs/CODING_INTEGRATIONS.md) and [simple setup checklist](../../../../CLA/conclave/docs/HANDOFF_SETUP.md).

Source: 353 tests passed / one optional saved-export replay skipped; syntax/UI bundle parity passed. Three new fixtures use generated/cache-copied entries with real independent stdio processes and isolated durable data, validate hosted transport mapping, and reject invalid/credential-bearing origins before writes. Generated TOML and both skill frontmatter validators passed. Installed Codex CLI accepted/installed/enabled the package in an isolated configuration, then the user's real configuration.

The local `conclave-handoffs@conclave-local` plugin is installed/enabled. Claude Desktop's existing configuration now has the generated Conclave stdio entry; readback and a fingerprint excluding that entry verified unrelated settings unchanged without printing contents. The standalone Claude Code CLI is unavailable on PATH, so its plugin package remains prepared for installation. Host skill discovery now includes the two installed Conclave skills; MCP tool invocation in a fresh desktop session remains unverified.

Converse `npm run check` passed, including manifest parity; `npm test` passed 203 tests / one optional live Neon skip. The final manifest source revision was parity-checked again after the source documentation update. No additional application runtime behavior changed, so repeated browser/model testing was not needed.

These are local configuration/installation and fixture checks, not actual Chat/Code conversation, custom widget rendering or hosted OAuth/account evidence. The checklist tells the user to restart the apps/start fresh conversations and test exact selected-version continuity. No push, deployment, cloud project, database migration or public plugin listing was performed.
