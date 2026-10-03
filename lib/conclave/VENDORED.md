# Conclave engine snapshot

The complete engine is developed in CLA/conclave, then migrated into this repository. The runtime snapshot is self-contained and has no sibling-checkout dependency. [manifest.json](manifest.json) records the exact source commit, required dependencies, and file hashes.

All engine changes start in Conclave: providers, streaming, agents, workspaces, web search/pages, context controls, Jev/economics, telemetry, storage, HTTP protocol, and schema/migrations. lib/conclave is a managed copy; the legacy import paths in lib/ and api/conclave.js are managed integration wrappers. Shared guide/effort/export assets and the rate snapshot are also managed.

After testing and committing Conclave, run node ../CLA/conclave/scripts/sync-converse.js --apply --target ., verify --check, and run Converse's checks. node scripts/check-engine.js verifies the migrated files locally; independent edits fail instead of silently diverging. Application UI, ordinary chat/title generation, deployment configuration, and deployment connection lifecycle remain in Converse.

The initial promotion absorbed Converse's accumulated adaptations into Conclave, including hosted leases/fenced writes, GPT/Claude identity and native continuations, frozen projections, periodic cached Jev reviews, checkpointed agents, workspace readback, native search, public-page retrieval, and cache-aware management. Future engine changes flow from Conclave to Converse.

[Conclave integration workflow](../../../CLA/conclave/docs/CONVERSE_INTEGRATION.md) · [Project state](../../PROJECT_CONTEXT.md) · [Development method](../../docs/DEVELOPMENT_METHOD.md)
