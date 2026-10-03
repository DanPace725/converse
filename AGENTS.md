Start with [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) and [the development method](docs/DEVELOPMENT_METHOD.md).

Maintain project state in PROJECT_CONTEXT.md; keep detailed planning and results in docs/archive/. Technical usage docs stay active.

Conclave engine changes must start in `../CLA/conclave`, including provider, streaming, agent, workspace, web-tool, context-management, and hosted-persistence changes. Do not implement them directly in `lib/conclave` or the managed integration wrappers. Test and commit Conclave, migrate with `node ../CLA/conclave/scripts/sync-converse.js --apply --target .`, then run `npm run check` and `npm test` here and commit the snapshot. `lib/conclave/manifest.json` records source commit and file hashes; `node scripts/check-engine.js` rejects drift. Application UI and deployment configuration remain in this repository.
