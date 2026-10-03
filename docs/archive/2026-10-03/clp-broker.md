# CLP evidence broker integration — 2026-10-03

The first CLP increment was implemented/tested in Conclave, committed as `2020ecda8176a07bedde58d229f96afe8f8f1474`, and migrated with `scripts/sync-converse.js --apply`. The manifest verifies all 62 managed engine/integration files against that source. No database migration or browser controls were added. [API usage and limits](../../CLP_BROKER.md), [canonical implementation report](../../../../CLA/conclave/docs/archive/2026-10-03/clp-broker.md).

Implemented behavior: immutable versioned frames and validators; typed source-linked records; origin/copy-lineage declarations; support/refute/supersede relations; conservative independent-support floors; scoped/paged queries with deterministic event/frame explanations and separate unresolved clusters. Positive confidence/separation floors withhold results as unmeasured. Registries and records survive SQLite/PostgreSQL hydration and export. Registered frames enable a read-only model query tool; large receipts retain admitted/unresolved status with complete content recoverable from the canonical receipt.

Verification:

- Conclave: 152 passed, one optional historical-export replay skipped, zero failed (153 tests), plus syntax checks. All six CLP acceptance cases, CLI restart, full model-tool turn, authenticated local API and fresh hosted PostgreSQL repository instances passed.
- Converse: 157 passed, one live Neon check skipped, zero failed (158 tests), plus syntax checks. The new integration checks exercise a complete CLP model-tool turn through the migrated engine and preserve unresolved status in oversized receipt projections.
- Migration: `--check` and `scripts/check-engine.js` verify 62 matching files; patch whitespace checks passed.
- Six-bundle offline example: one admitted claim, two withheld claims (thin/refuted), and three evidence records excluded from claim rows.

These are offline fixtures and local PostgreSQL-compatible checks. No paid model call, production database migration, or browser test was run for this increment. They establish the implemented broker behavior; general claim accuracy, editorial independence, statistical confidence and retrieval quality remain unmeasured. The previous engine-parity browser run remains historical evidence only.

Remaining protocol work: portable envelopes/sidecars, signatures and trust/resolver registries, frame-specific policy/redaction/review, vector/graph brokerage, exploration, measured confidence/separation and coherence/attention telemetry. Current registration and declarations are manual API/library/CLI operations. [Conclave broker contract](../../../../CLA/conclave/docs/CLP_BROKER.md).
