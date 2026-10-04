# Converse hosting efficiency plan

Keep Neon and Vercel for the next increment. Reduce saved-conversation read work and measure production latency before choosing another backend or database. Embeddings use a persistent PostgreSQL vector index and do not add model calls to saved-chat selection.

## Findings verified in the checkout

Saved Context/Agent selection in `public/conclave.js` performs a GET to `/api/conclave?conversation=...`. That invokes the complete engine view rather than a transcript-specific query:

1. `ContextRepository.run` queries the conversation plus audit events, all historical snapshots and missing context segments. A repeatable-read transaction preserves a consistent view.
2. A process-local row cache fetches only appended rows on warm instances. Cold instances load the history again. The cache is bounded at 256 MiB and is an optimization, not an authoritative store.
3. Each request reconstructs a disposable SQLite store, replays events/snapshots and rebuilds source/bundle indexes, even when row transfer is almost zero.
4. `ConclaveService.view` creates messages, current context/state/memory, protections, audit summaries, workspace metadata and the next model request/token calculations. Repeated per-message scans are also present. This request previously calculated `modelInput` twice; this increment reuses one calculation.
5. Opening a chat renders its transcript and adopts the complete workspace view in the browser. Browser render time has not been profiled yet.

Existing connection handling already uses a module-level `pg.Pool` with `max: 5`, five-second idle timeout, 10-second connection timeout, 15-second statement timeout, and `attachDatabasePool` on Vercel. Local runtime configuration points to a pooled Neon endpoint with a `us-west-2` region hint. This does not establish the live production configuration. `vercel.json` has no explicit region; the current Vercel project region and Fluid Compute setting could not be read because the connected Vercel account lacks access to the linked project scope. The saved disposable Neon test-branch credential was rejected during migration. No hosting settings or production schema were changed.

## Offline evidence

The reproducible [loading probe](../../CLA/conclave/scripts/profile-hosting.js) builds a 12-turn fixture, including request/response audit records, then compares three cold and three warm reads. [Recorded samples](../../CLA/conclave/docs/archive/2026-10-04/hosting-profile.json).

| Measurement | Cold samples | Warm samples |
|---|---:|---:|
| Newly loaded audit/snapshot/segment JSON | 975,517 bytes | 10 bytes of empty row arrays |
| SQLite hydration/index rebuild | 20–22 ms | 18–20 ms |
| Engine view work | 141–148 ms | 142–144 ms |
| Complete local read | 183–188 ms | 163–165 ms |
| Browser response payload | 139,900 bytes | 139,900 bytes |

The byte measurement excludes conversation-row/protocol traffic. This is in-process PGlite on this machine, with synthetic data and no Neon/Vercel network. It does not establish production latency or savings. It does show that a warm database-row cache alone leaves most view/hydration work intact.

## Implementation sequence

### 1. Measure the deployed path

Enable `CONCLAVE_LOAD_DIAGNOSTICS=on` temporarily after deployment. The engine emits safe aggregate `context_load` logs: database/hydration/service durations, cache hit, transferred-row byte estimate, row counts, total history size and mutation flag. It does not log chat text, keys or database URLs. Leave diagnostic byte serialization off during ordinary operation.

Add browser marks for click, response arrival, JSON parse, transcript render and workspace adoption. Associate these with backend request IDs. Measure p50/p95 on small, medium and large saved conversations, both after inactivity and repeated opens. Record server cold state, Neon activation/pool wait, region, query count, payload bytes and actual active CPU time. Suggested acceptance target: warm transcript visible within 500 ms at p95 and cold within 1.5 seconds, subject to baseline and budget review; these are targets, not achieved results.

Refresh the disposable Neon branch credential and the Vercel project connection to complete live pgvector/restart checks. Inspect the live function region, Fluid Compute setting, pooled/direct endpoint configuration and Neon suspend/minimum-compute settings. [Vercel recommends instance connection pooling with Fluid Compute](https://vercel.com/kb/guide/connection-pooling-with-functions); [Neon describes the latency/cost tradeoff of an always-active compute](https://neon.com/docs/manage/endpoints/). Do not increase compute or disable suspension before establishing how much latency comes from resume versus application work.

### 2. Add a dedicated saved-chat read model

Keep events/snapshots as canonical audit history. Add a rebuildable, revision-keyed PostgreSQL read model for transcript/messages and current workspace/context/memory summaries, updated in the same fenced transaction as canonical writes. Backfill by conversation and validate against complete current views. Read the latest authoritative conversation sequence/revision when serving a projection; return or rebuild only a matching projection. A stale cached view must not hide edits, suppression, Stop/Resume or access changes.

Serve a small paginated transcript endpoint on saved-chat selection. Hydrate the Workspace tabs and token/request diagnostics on demand; keep complete audit/export fetching explicit. Include enough provider/model, reply/revision, attachment and Agent/busy metadata for correct initial display. Preserve existing canonical downloads and detailed inspection. Set pagination expectations for exports, search, revised messages and switching chats while a request is in flight.

Acceptance: opening a transcript fetches neither full request payloads nor historical snapshots, performs no SQLite replay or model-input tokenization, and returns a bounded first page. Large-chat p95 and transfer must improve on matched workloads. Verify existing snapshots and a fresh mutation produce matching read projections.

### 3. Keep vectors and indexing off the read path

The current bounded lazy index supports conversation-local source retrieval and memory activation. Move complete backfill/new-content indexing to durable jobs if measured inference delay or coverage gaps justify it: idempotent version/hash jobs, retries, failures, coverage counters and query-time keyword fallback. No paid work on chat opening or manual edits. Queue source IDs/version hashes, not complete audit payloads.

Use SQL-scoped vector queries; retain canonical removal/suppression/version checks. Replace whole-key-set scans with indexed pending-job cursors as coverage grows. Benchmark exact scoped search before adding HNSW; then compare recall under conversation, version and memory filters. Evaluate known-paraphrase, exact identifier, corrected budget, removed source and near-neighbor distractor cases. Similarity remains advisory relevance.

### 4. Tune hosting after the read-path change

Prefer one Node function region colocated with the live Neon compute. Confirm the region mapping before pinning it; a local `us-west-2` hint is insufficient to change the live project. Keep the pooled runtime endpoint and direct migration endpoint. Review pool wait/connection churn before changing `max` or idle settings; retain `attachDatabasePool`. Verify Fluid Compute rather than assuming it is active. Avoid globally distributed database-writing functions without matching data locality. [Vercel function regions](https://vercel.com/docs/functions/configuring-functions/region).

If hydration/CPU remains a material cost for inference after read-model work, evaluate a small persistent Node service for the Conclave backend, colocated with Neon, while retaining Vercel static hosting. A persistent process can retain derived stores and run indexing jobs but adds baseline compute, patching, health checks and recovery responsibilities. Leases, fences, canonical persistence and ownership checks remain necessary.

Compare the existing setup, tuned Vercel and a persistent backend on the same conversations and completed workloads: cold/warm p95, active CPU, database transfer, storage/compute, indexing latency/coverage, restart recovery and total monthly cost. Reconsider a dedicated vector database only if measured vector workloads, filtering or cost become the bottleneck.

## Current delivery status

Implemented locally: embedding-assisted history/memory selection, persistent pgvector schema/search, bounded lazy indexing, authority/version/suppression guards, usage/fallback diagnostics, saved-load instrumentation, and reuse of the duplicated next-request calculation. [Embedding usage/rollout](../../CLA/conclave/docs/EMBEDDINGS.md).

Planned: transcript read model/pagination, lazy Workspace diagnostics, production browser/server baseline, region/compute tuning, durable indexing jobs and any persistent-backend migration. Production deployment and database migration require valid target credentials and remain unapplied.
