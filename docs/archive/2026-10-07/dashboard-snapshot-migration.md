# Conclave dashboard snapshot migration

Date: October 7, 2026. Branch: `codex/conclave-dashboard`.

Migrated the read-only dashboard adapter and its three static resources from Conclave source `7ff2bea3988702671a274699a5dee29255e15fa2` (initial implementation `b57f87b03fb60e4b306c88a2137432daa126d652`). All 106 managed files match their canonical source, with a clean-source manifest receipt. No source file was edited directly in Converse.

The standalone dashboard is mounted by Conclave's independent hosted package at `/dashboard`, using its own verified browser account and existing packet repository. This downstream snapshot preserves shared engine parity; Converse's chat UI does not mount a dashboard route or change sign-in behavior. No schema, dependency, database migration, model call, push, merge or deployment was introduced.

The [design and preview guide](../../../../CLA/conclave/docs/DASHBOARD.md) explains recent discovery, complete packet detail, reported provenance, immutable revision history and comparisons, explicit copying and revision export. Project grouping, agreed canonical state, divergence/merge handling, graph/timeline views and dispatch remain future work.

## Validation

- Source: 362 tests passed, one optional skip; focused dashboard/standalone HTTP cases 7/7; six desktop/narrow synthetic Edge browser cases passed and screenshots inspected. Browser checks include removal disclosure, export fidelity, older revision reload, delayed responses and queued history navigation with no JavaScript errors.
- Migration: `node scripts/sync-converse.js --check` matches 106 files from the source commit above.
- Converse: syntax/manifest checks passed; 203 tests passed, one optional skip, zero failures.
- The first app test run used the Windows sandbox's system temp directory and had seven failures (six atomic rename EPERM errors and one related local HTTP 503). Rerunning with process-only TEMP/TMP set to `E:\Coding\converse\.test-tmp` passed the full suite. No runtime workaround was added.

The local preview at `http://127.0.0.1:3226/dashboard` contains synthetic packets only and reads no environment credentials or live account data. Production dashboard use, real hosted dashboard sign-in, native mobile/Safari and broad database-read scalability remain unverified. Work is committed locally on development branches; production was not changed.
