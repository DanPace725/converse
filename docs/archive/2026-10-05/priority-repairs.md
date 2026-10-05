# Priority repairs and Workspace Jev telemetry

Completed 2026-10-05. Shared engine source commit: `91ec005a2dbf9d1a0d9493864987ca82c6a68bbb`; migrated and verified against all 77 managed files. Engine contracts, bounds and native probe are recorded in [Conclave's repair report](../../../../CLA/conclave/docs/archive/2026-10-05/priority-repairs/README.md).

Workspace now has a fourth tab, Jev. It distinguishes native calls from selection decisions, proposals from applied attention revisions, reported usage from missing usage, and changed selections from confirmed baselines/fallbacks/skips. Expand a decision to see its query, source identity, exact supplied ranges, candidate passages, confidence and baseline versus selected source handles. Open source preserves a route back to Jev; Earlier loads bounded historical pages without inference. Historical telemetry remains inspectable with Jev disabled or unavailable. Selection confidence does not certify truth, answer quality or savings.

The engine repairs retrieval judgments/coverage/cooldowns, fresh Claude evidence handoffs, source-specific lookup, completed research candidate memory, controller history loading and persistent embedding-configuration failures. The configured Converse Neon database initially lacked `conclave.embeddings`; running the existing migration succeeded, and SQL verified the table and vector extension afterward. This is a schema verification, not a hosted semantic-retrieval quality claim.

The final native Jev probe returned confident useful judgments for both sampled historical queries where the old selector fell back. Their selected top four stayed unchanged. A synthetic answer source moved from sixth to first. Broader optimization remains unmeasured; the panel exposes future outcomes instead of inferring success from calls alone.

Offline export replay preserved all canonical events/snapshots, completing the Brain export in 0.361 seconds and the larger Pain export in 1.439 seconds. Controller projection reduced Pain's inspected history from 58.75 MB to 4.70 MB; that recorded shadow evaluation completed in 185 ms under the existing 200 ms guard. These are local measurements, not browser/network/production timings.

`scripts/conclave_report.py` now recognizes structured fresh handoffs as text delivery and distinguishes exact byte-guard pages from missing evidence. It also counts `search_source` repeats and explicit selector skip reasons. Original supplied exports remain unchanged and untracked.

## Validation

- Source: 239 passing checks, one optional saved-export replay skipped; 18 relevant final checks passed after cache-invalidation/Stop refinements; source syntax checks passed.
- Converse: 188 application checks passed, one optional live Neon test skipped; engine parity and syntax checks passed.
- Automated report: three Python checks passed, including full structured observations and partial exact pages.
- Browser: all 70 isolated desktop/mobile Agent and Workspace cases passed. Jev checks cover unknown usage, failure counts, candidate ranges/confidence, safe text rendering, source/back navigation, pagination/reload and zero model calls. Desktop/mobile screenshots were inspected. Windows sandbox browser launch failed before any test; the same suite ran successfully with the authorized headless browser outside that sandbox.

Remaining measurements: matched long-form useful completion, source recovery/entailment after compaction, empirical utility of paid attention reviews, episodic consolidation, production latency and total task economics. Cost-only compaction remains in shadow mode.
