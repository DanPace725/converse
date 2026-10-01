# Conclave engine snapshot

Copied from the sibling `CLA/conclave/src` at commit `5fdeba2d9c1a547d21dbf7ed628ecb855789abc3`, excluding the CLI. This makes Git-based Converse deployments self-contained; local data and credentials are never copied.

Hosted adaptations: `Store` can use an in-memory database without file views; `ConclaveService` skips disk backups in that mode; inference awaits an optional store flush before calls and after responses/failures; OpenAI accepts an injected fetch function for the total turn deadline. Durable events and snapshots are in Neon. The in-memory database only rebuilds the engine's existing indexes per request.

Keep these adaptations when refreshing the snapshot. The separate CLI checkout remains unchanged.

Shared correctness fixes are also applied to the CLI source: attribution compares event identity fields independently of JSON object-key order, and user-projection errors create source-linked turn failures before inference.

Converse-only agent extension (2026-10-01): `agent.js` adds a checkpointed, browser-driven runner and virtual text workspace. The service adds agent actions and configurable context/output budgets; the provider accepts an optional per-run abort signal. Workspace source attribution uses the task provider (`openai` or `anthropic`), not the human actor. Keep these extensions on refresh. The sibling CLI does not yet expose this runner.

Claude integration: task settings and checkpoints carry an explicit provider, defaulting old records to OpenAI. `AnthropicProvider` adapts tool schemas/exchanges and native structured JSON compaction to the Messages API, preserving signed thinking blocks during continuation. Hosted deadline fetches support both task providers. Exports and workspace/tool events retain provider attribution, normalized usage and native Anthropic request bodies without credentials. Jev remains an independent context selector. Keep these Converse-only changes when refreshing the snapshot.

Workspace editor: the service adds scoped source/bundle reads and manual document/context/state saves through existing mutation guards. Human file writes explicitly bypass agent readback/heading rules while retaining file version and size checks. Original uploads remain immutable; copies record their origin. Context/state edits preserve source links and revision history, reject protected sections, and require current revision/head IDs. Manual edit sources are omitted from chat messages. Retain these Converse-only adaptations on refresh.

Review follow-up: `workspace.js` supplies the shared chat/agent tools, current-version manifest, exact patches and persistent readback receipts. `Harness` has a completion-check hook, purpose usage totals and a configurable compaction-attempt bound. Retention selection can offload older material that exceeds a compaction batch. The web service defaults to the increased budgets and Jev under pressure. Agent accounting includes all provider purposes and Jev accepts the run deadline signal. These are Converse-only adaptations; retain them when refreshing the CLI snapshot.
