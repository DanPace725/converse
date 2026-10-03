# Conclave engine snapshot

Base copied from sibling `CLA/conclave/src` at `5fdeba2d9c1a547d21dbf7ed628ecb855789abc3`, excluding the CLI. Converse's Git deployment is self-contained. The engines have diverged; retain these adaptations when refreshing shared modules.

| Area | Converse adaptations |
|---|---|
| Hosting | In-memory Store without file views/backups; awaited flushes before/after inference; Neon events/snapshots, leases, fenced writes, progress across instances. |
| Providers | Explicit provider/model identity and source authorship; Anthropic native tool exchanges/structured compaction, effort, caching, signed thinking; total deadlines and partial-failure diagnostics. |
| Streaming/reasoning | SSE reconstruction and truncation rejection; transient answer/reasoning events; completed-call summaries indexed and pageable; opaque native state stays in the audit. |
| Request construction | Compact S/E projections; complete-input token counts/fingerprints; separate reported usage and byte guards; stable tool-loop projections, persisted once per refresh; explicit refresh/guard receipts. |
| Attention/state | Periodic Jev reviews, persisted selection cache, scoped protections/inspection, bounded rewriting, state-key/handle relations, atomic batches and stale-version rejection. |
| Agents | Browser-driven checkpoints, saved provider/settings/pending exchanges, idempotent steps, stop/resume, bounded automatic testing, purpose usage, detailed stop operands, 16-call batches and recoverable rejection receipts. |
| Workspace | Shared chat/agent files, exact patches, quotas/version checks, complete readback receipts, uploads and source-linked manual edits, removal/restoration with scoped retrieval exclusions. |
| Web search/pages | Converse-only native search through existing OpenAI/Anthropic keys and selected model; direct public HTTP page reading saves response/text and returns complete extracted text before context management. Older observed page receipts become exact-source pointers; oversized requests can page text. Persistent quotas, public DNS/socket checks, size/deadline bounds and Agent limits apply. Claude native/opaque blocks stay in the audit. The CLI has no web integration. |
| Inspection | Shared guide and bounded telemetry; activity filtering/paging; Garden request/full-history comparisons using actual frozen input; native payloads and opaque reasoning excluded. |
| Conversation metadata | Append-only automatic titles and user-message revisions; source links, provider attribution and timestamped exports. |

Shared fixes also present in the CLI include semantic source-identity comparison after JSONB round trips, source-linked pre-inference failures, local token counting, and snapshot-backed receipts without duplicated committed segments. Older receipts with embedded segments remain readable.

Page ingress/receipt exceptions and retrieval paging are Converse web-tool adaptations; the shared CLI engine has no page tool and was inspected but requires no matching change. HTTP retrieval uses Node's native client with a verified DNS address pinned to each socket, and `htmlparser2` for entity-aware text extraction. Full responses/text remain canonical; context projections never overwrite them.

[Project state](../../PROJECT_CONTEXT.md) · [Development method](../../docs/DEVELOPMENT_METHOD.md)
