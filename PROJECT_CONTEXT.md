# Converse project context

Updated 2026-10-03. Mutable project state. [Usage](public/app-guide.md) · [Development method](docs/DEVELOPMENT_METHOD.md) · [Archive](docs/archive/README.md)

## Current capabilities

- Conclave engine authority is the Conclave repository. Providers, agents, workspaces, web tools, context controls, persistence, and shared resources migrate here with a source-commit/hash manifest; parity checks reject downstream drift. Application UI/deployment remain here. [Engine boundary](lib/conclave/VENDORED.md)

- Installable browser app with responsive UI, offline shell, sanitized Markdown and LaTeX, raw Markdown copy, saved chats, automatic titles, and linked user-message revisions.
- Chat: GPT, Claude, and Gemini share attributed history and can reply in parallel. Storage is on the device.
- Context: GPT or Claude uses Conclave's persistent source history, editable working projection, named state, retrieval, offloading, compaction, and source lineage. Provider/model identity follows each reply and source.
- Web search/pages: GPT/Claude Context and Agent modes use native search with existing keys and the selected model. `web_fetch` reads public HTTP pages directly, saves complete responses/extracted text, and returns text before Conclave manages older observed receipts. Exact source text remains retrievable; oversized requests can page it. Search/fetch quotas and Agent limits apply. Live native GPT/Claude searches and a direct Node.js page fetch passed locally. JavaScript rendering, PDF extraction and hosted verification remain unapplied.
- Agent: browser-driven, checkpointed tool work with Stop/Resume, bounded automatic testing allowances, readable failures, and duplicate-step protection. Each response can execute 16 sequential tool calls; larger batches return saved errors for a later split.
- Workspace: versioned text documents, uploads, downloads, exact patches, manual context/state edits, reversible user removal/restoration, and current-version readback checks. Uploads and manual saves make no model calls. Tools calculate arithmetic and complete formulas.
- Context controls: stable S/E references, protection inspection, state-key relationships, cached selector decisions, periodic Jev reviews, bounded semantic rewriting, and deterministic fallback. New tool loops hold a stable projection until the next turn, explicit refresh, or logged guard refresh. Claude caching and signed continuation are supported.
- Request management: settled state precedes the recent tail; workspace views use short current-version excerpts, completed write arguments and repeated/superseded pages become retrievable pointers. Claude restarts redundant signed histories rather than rewriting them. Observed cache reads/writes select the settled-prefix breakpoint or growing tail.
- Economic reviews compare projected carry with selection, rewrite, retrieval and cache rebuild using the dated rate snapshot and observed usage. Unknown coverage prevents an economic-only trigger. Pressure, periodic reviews and user protections remain available. Telemetry exposes the operands and coverage.
- Bounded ingress/delegation: focused document excerpts, bulk tool-receipt pointers, exact current-file pages, cached Jev shortlist reranking and chat-document classification, with deterministic fallback. Classification never promotes a partial document into named state; agent attachment ingress remains deterministic. Jev delegates rank/classify only and cannot execute tools or write artifacts.
- Inspection: Context Garden and replay, activity paging/filters, shared user/model guide, readable provider reasoning summaries, full-request comparisons, local tokenization, explicit provider counts, and separate reported usage and byte guards.
- Persistence: local SQLite fallback or hosted Neon events/snapshots with leases and fenced writes. Vercel deployment is self-contained. App access uses a password.
- Timestamped Markdown/canonical JSON exports retain provenance and audit history. Shared cost reporting separates purposes, cache buckets, partial usage, and unpriced calls.

## Demonstrated results

| Result | Evidence |
|---|---|
| Engine parity: 61 managed files match Conclave; 138 standalone and 155 Converse backend checks passed, each with one optional check skipped. All 56 desktop/mobile Agent browser checks passed. | [Migration and validation](docs/archive/2026-10-03/engine-parity.md) |
| Native search: live GPT-6 Luna and Claude Sonnet 5.5 lookups passed using existing keys; findings and citations saved with usage. Fixture checks cover Context/Agent, source recovery, quotas, native-block preservation and Agent token guards. | [Native integration](docs/archive/2026-10-03/native-web-search.md), [live evidence](docs/archive/2026-10-03/native-search-live.json) |
| Direct page retrieval: 48 focused checks passed, including complete text delivered to GPT/Claude Context/Agent fixtures, post-observation receipt projection, exact recovery/removal, quotas, public-address/redirect checks and deadlines. Live Node.js page response/extraction retained the footer. | [Page retrieval](docs/archive/2026-10-03/web-page-retrieval.md), [live evidence](docs/archive/2026-10-03/web-page-live.json) |
| 11 saved conversations: 561,088 history characters → 182,864 working characters, **67.4% reduction**. | [Iteration report](docs/archive/2026-10-02/docs/reports/conclave-iteration-2026-10-02.md) |
| 346 of 348 logged calls valued at **$9.95–$12.85** using the October 2 rate snapshot; two calls lack priceable usage. | [Cost report](docs/archive/2026-10-02/docs/reports/conclave-cost-plan-2026-10-02.md) |
| Small document trial: Luna layered $0.003007–$0.005568 vs append $0.003897–$0.007364; Sonnet layered $0.147443 vs append $0.180336. Ordinary Luna layered chat cost slightly more than append. | [Trial and quality review](docs/archive/2026-10-02/docs/reports/conclave-iteration-2026-10-02.md) |
| Five-turn full-history sandbox completed: 53 calls, 4.97M input tokens, $7.67–$8.15 valuation. Historical successful managed runs: 61 calls, 1.23M input, $1.52–$1.69. Different trajectories and outputs; quality review found a capital-budget wording error in the baseline. | [Baseline review](docs/archive/2026-10-02/docs/comparisons/baseline-2026-10-02T23-21-32-534Z/QUALITY_AND_NEXT_ITERATION.md) |
| Offline offload replay: 41,813 → 19,896 projection bytes; 18,185 → 13,834 local request tokens. Originals retrieved; pins/state preserved. | [Repair report](docs/archive/2026-10-02/docs/reports/context-repairs-2026-10-02.md) |
| Hosted Agent/write/read/patch/reload/export flow demonstrated with Neon; latest batch-handling report records 125 backend passes and one skipped live Neon test. | [Hosted run](docs/archive/2026-10-02/docs/reports/hosted-agent-integration-2026-10-01.md), [batch checks](docs/archive/2026-10-02/docs/reports/agent-tool-batches-2026-10-02.md) |
| Context-management checks: 141 backend passes, one live Neon test skipped. Saved real Jev responses classified both synthetic ingress cases as expected; final-rule replay recovered both retrieval targets versus neither in lexical top four. Four recorded calls valued at $0.000147924; an earlier four-call exporter failure lacks saved usage. | [Implementation and evaluation](docs/archive/2026-10-02/context-management.md), [live record](docs/archive/2026-10-02/jev-delegation-live.json), [final-rule replay](docs/archive/2026-10-02/jev-delegation-replay.json) |

USD figures are public-rate valuations. Trials demonstrate these workloads; broader cost and quality performance remains unmeasured. Test counts above are recorded runs.

## Work not yet applied

- Calibrate economic horizons, observed cache boundaries and delegation gates on matched long tasks. Current estimates and two synthetic retrieval/two ingress cases do not establish general savings or quality gains. Expand document classification beyond the first excerpt and add it to agent attachment ingress within run limits if useful.
- Run fresh matched long-task trials; score source recovery, corrected decisions, numerical intermediates, current-version precedence, completion, output exhaustion, and total cost.
- Retrieval: exact phrases, author/source/sequence filters, explicit missing ranges, source-first ranking, active-context indicators, heading/TOC lookup, and search within files.
- Import: split transcript uploads into attributed sections; add JSON import and portable database restore.
- State: resolved/archive lifecycle, last-confirmed/proposal status, revision-conflict diffs, and model/user pin controls.
- Workspace: rename, version diffs, model scratch-file lifecycle, and private model workspaces with explicit artifact handoffs.
- Evaluate longer search/page tasks and live model source fidelity after compaction; hosted verification, JavaScript rendering and PDF extraction remain open. Explicit cross-conversation memory with ownership and corrections; embeddings tied to source versions.
- Agent status messages that continue a run, completion checklists, isolated execution, and durable unattended workers.
- Permanent erasure across sources, snapshots, copies, backups, and exports; multi-user identity. Neon Auth is provisioned but not connected to the app.
- Light theme and composer model pickers. These and the larger design ideas remain proposals.
