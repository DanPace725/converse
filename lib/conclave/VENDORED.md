# Conclave engine snapshot

Copied from the sibling `CLA/conclave/src` at commit `5fdeba2d9c1a547d21dbf7ed628ecb855789abc3`, excluding the CLI. This makes Git-based Converse deployments self-contained; local data and credentials are never copied.

Hosted adaptations: `Store` can use an in-memory database without file views; `ConclaveService` skips disk backups in that mode; inference awaits an optional store flush before calls and after responses/failures; OpenAI accepts an injected fetch function for the total turn deadline. Durable events and snapshots are in Neon. The in-memory database only rebuilds the engine's existing indexes per request.

Keep these adaptations when refreshing the snapshot. The separate CLI checkout remains unchanged.

Shared correctness fixes are also applied to the CLI source: attribution compares event identity fields independently of JSON object-key order, and user-projection errors create source-linked turn failures before inference.

Converse-only agent extension (2026-10-01): `agent.js` adds a checkpointed, browser-driven runner and virtual text workspace. The service adds agent actions and configurable context/output budgets; the provider accepts an optional per-run abort signal. Workspace source attribution uses `openai`, not the human actor. Keep these extensions on refresh. The sibling CLI does not yet expose this runner.

Review follow-up: `workspace.js` supplies the shared chat/agent tools, current-version manifest, exact patches and persistent readback receipts. `Harness` has a completion-check hook, purpose usage totals and a configurable compaction-attempt bound. Retention selection can offload older material that exceeds a compaction batch. The web service defaults to the increased budgets and Jev under pressure. Agent accounting includes all provider purposes and Jev accepts the run deadline signal. These are Converse-only adaptations; retain them when refreshing the CLI snapshot.
