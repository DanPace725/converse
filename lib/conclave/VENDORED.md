# Conclave engine snapshot

Copied from the sibling `CLA/conclave/src` at commit `5fdeba2d9c1a547d21dbf7ed628ecb855789abc3`, excluding the CLI. This makes Git-based Converse deployments self-contained; local data and credentials are never copied.

Hosted adaptations: `Store` can use an in-memory database without file views; `ConclaveService` skips disk backups in that mode; inference awaits an optional store flush before calls and after responses/failures; OpenAI accepts an injected fetch function for the total turn deadline. Durable events and snapshots are in Neon. The in-memory database only rebuilds the engine's existing indexes per request.

Keep these adaptations when refreshing the snapshot. The separate CLI checkout remains unchanged.
