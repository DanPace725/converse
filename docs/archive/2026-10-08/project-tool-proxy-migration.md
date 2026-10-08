# Project tool and proxy snapshot

October 8, 2026. Migrated Conclave source `2e0022aa381f14f18663dcdba9de3f6c36ad9046` into the managed Converse engine. Two runtime files changed; all 106 managed files match.

The engine now exposes `create_project` to read/write MCP connections, saves the initial named project handoff through existing guards, and documents the project field on save. The hosted adapter accepts a bounded proxy hop count while defaulting to false. Railway-specific startup configuration stays in Conclave's standalone package.

Converse syntax/parity checks passed; tests: 203 passes, one optional live Neon skip. No schema changes, main merge, push or Converse production deployment. Conclave production publication is pending because pushing its dashboard branch automatically releases to Railway. User-reported mobile connection/reinstallation and prior real-task handoffs are accepted; the new tool still needs live discovery/mobile acceptance after publication.

Source diagnosis and tests: `CLA/conclave/docs/archive/2026-10-08/project-tool-proxy.md`. Existing unrelated source rename/research changes remain outside this commit batch.
