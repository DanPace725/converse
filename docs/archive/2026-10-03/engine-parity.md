# Conclave source migration — 2026-10-03

Converse's engine at 0a65a2f434dbed70c34b3bdeb2ddc7bf8dea8320 was promoted into Conclave, then migrated back from Conclave source commit 7885ae6826908bd5f00a569b0bbbcb9b809f2d0e. All 61 managed modules/resources/wrappers match the source byte for byte; lib/conclave/manifest.json records hashes, dependencies, source commit, and a clean source worktree.

The complete engine now starts in Conclave: providers, streaming, agents, workspaces, web tools, context controls, Jev/economics, and SQLite/PostgreSQL persistence. Converse keeps its application UI and deployment setup. Existing import paths use thin managed wrappers. Source and target Git attributes retain LF so migration hashes survive Windows/Linux checkouts.

The context token preview includes the same web-tool configuration as the counted/submitted request. Local count coverage from standalone is retained with the richer Converse telemetry. Existing database migrations have identical SQL; this work runs no production database migration and preserves saved conversations.

Verification: Conclave 138 passed / 1 optional saved-export replay skipped; Converse 155 passed / 1 live Neon check skipped; 56 desktop/mobile Agent browser checks passed. Both syntax checks and exact source/snapshot parity checks passed. Browser fixtures cover API/storage, streaming, workspace editing/upload, provider attribution, Stop/Resume, and reload/export. They use scripted providers and isolated stores. The first browser attempt could not initialize Edge's profile inside the Windows sandbox; the bounded rerun outside it passed.

Future changes: test and commit Conclave, run its sync-converse.js --apply, check --check, then run Converse's checks and commit/push the snapshot. Both AGENTS.md files and development methods state this order. CLP implementation remains the next phase.
