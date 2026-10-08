# Hosted Conclave handoff migration

Conclave source `ad40284a846a2d4c9be7500fb975ce3f11b080d3` was verified and committed first, then migrated with `node scripts/sync-converse.js --apply`. The snapshot has 99 managed files and carries the owner-scoped packet repository, OAuth provider, SDK/Express hosted adapter, shared tool definitions, new schema/migration and thin `api/mcp.js` entrypoint.

Application-owned additions: Vercel rewrites with explicit whitelisted routing markers; matching local-dev paths; an example fixed-origin setting; `docs/HANDOFFS.md` links to the ongoing simple-language setup document and explains the runtime deployment settings. MCP stays disabled without `CONCLAVE_MCP_ORIGIN`. Existing browser chat/sign-in code and provider-key handling remain in place.

Verification:

- Source full suite: 340 passes / one optional skip; five hosted cases plus existing six packet cases included. Four independently spawned transport tests separately pass.
- Source-to-app parity: 99 files matched. Application syntax and `git diff --check` pass.
- Converse full suite: 203 passes / one optional skip / zero failures, with `TEMP` and `TMP` set to the workspace-local handoff test directory for Windows atomic rename compatibility.
- Runtime dependency audit: zero reported vulnerabilities. Full app dependency audit reports four moderate development-tool findings rooted in the existing Drizzle Kit/esbuild chain. Relevant locked versions match the prior snapshot; no forced breaking upgrade was made.

No live Neon migration, deployment, push, real ChatGPT/Claude/Gemini installation, public endpoint invocation or directory submission. Vercel's connector returned 403 for the linked owning team, and the existing CLI login also lacked that team's access. The setup checklist records the user steps to restore access and rotate the database password/session secret accidentally included in earlier configuration tool output. Replacement secrets must not be pasted into chat. Local fixture and SDK evidence does not establish production interoperability or genuine multi-connection Neon contention.
