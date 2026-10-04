# Unified memory controls, atomic patches and shadow profiling

2026-10-03. Conclave source `db242bf91c74acb99405043ee42761748c18f85e`; 67 managed files match the committed engine.

## Implemented

- **read_memory** returns both automatic and named stores in exact 8,000-character JSON pages. Later pages require both revisions; changes require a restart. Entries carry sources, authority, lifecycle, scope and relationships. Suppressed/obsolete/unavailable text is omitted from model inspection; human inspection/export retains originals.
- **suppress_memory** atomically suppresses automatic heads and retires named state, with 1–8 explicit targets, both revisions, and the latest human removal request. Quoted, historical, reported and document-edit requests do not authorize it. Pinned/verbatim named state requires human editing. Effective results are reported and frozen/signed/pending Context/Agent exchanges refresh immediately. Earlier inspection/history/file-read receipts are excluded from model receipt replay; eligible canonical sources/current files can be reread. History is retained; suppression is reversible, not erasure. Automatic restoration remains in Memory; a human named-state edit can reintroduce named state. Snapshot restoration alone cannot undo named suppression.
- **workspace_patch_batch** applies 1–16 unique, non-overlapping replacements against one fully read original file version. All match/version/size guards pass before saving one new document version. A failed commit rolls back sources, indexes and context snapshots together. Unmatched text remains exact; the new version requires complete readback. This covers one file, not a multi-file transaction.
- **Shadow profiles** measure history, payload construction, selection, tokenization, cache tracing and pricing, and identify the last/failing stage. Telemetry summarizes the last 30 evaluations. Evaluation-scoped history caching removes repeated SQLite reads/JSON decoding and clears on writes, rollback and exit. Choices remain shadow-only; synchronous stages can still exceed the cooperative 200 ms allowance.
- **Converse details** now show the effective status/resolution of named memory alongside existing metadata. The offline shell cache is refreshed for the updated guide/UI.

## Verification and observed performance

Conclave: **218 passed, one optional replay skipped**. Converse: **186 backend passes, one live Neon skip**, syntax and 67-file parity passed. Full desktop/mobile browser suite: **64 passed**. New browser flows send a real chat request, inspect/suppress both stores, patch/read back a file, reload, inspect effective statuses and verify preserved file content. Source fixtures also cover authority/stale revisions, rollback, paged reads, receipt/source exclusion, snapshot restoration and hosted OpenAI Context/Claude Agent service-instance restarts.

Profiling sampled three prefixes from the reported conversation without provider calls. Repeated history/context reconstruction dominated the late evaluations. In exploratory before/after runs, scoped caching shortened the initial sampled 200 ms evaluations from 24.2/297.6/797.3 ms to 15.6/154.4/207.5 ms. Both late expanded evaluations finished after caching; the last cold evaluation still exceeded 200 ms. Warm-up, workload, evaluation order and cache hits affect these timings; this is not a controlled general latency or savings benchmark.

The bounded profiling runner and full stage records live in the [Conclave implementation report](https://github.com/DanPace725/conclave/blob/db242bf91c74acb99405043ee42761748c18f85e/docs/archive/2026-10-03/memory-tools/README.md). No live provider quality/cost benefit or deployment verification is claimed. Historical conversation records and the deployment database were not automatically repaired. Suppression follows declared source lineage; arbitrary older prose summaries without lineage cannot be guaranteed to disappear.

Embedding-assisted semantic matching is the next increment. Image sharing and cross-chat features are deferred; consolidation and long-task controller calibration remain open.
