# Active Jev memory selection

2026-10-05. The user chose direct conversation testing instead of requiring a task-model baseline to control memory first.

## Behavior

Normal Context and Agent services default to memorySelector: jev. Explicit human commitments/corrections still use deterministic capture first. For optional candidate extraction, confident Jev selections become exact unresolved memory with Jev selector/model provenance. Uncertain and oversized passages are left for review and identified in saved telemetry. Sources remain in canonical history/context; no task-model fallback runs in this mode. Jev provider failures are capture failures; missing/disabled Jev records a configuration issue instead of spending task-model tokens. Existing bounded transient retry, Stop, scope, source authority and manual correction/suppression rules remain enforced.

Optional CONCLAVE_MEMORY_COMPARISON=task-model (service memoryComparison: true) runs the main model on the same source after Jev candidates are committed. Calls have purpose memory-comparison; memory_comparison events record overlap/disagreement and applied: false. This comparison cannot change memory. Comparison failure preserves completed Jev capture. Comparison is off by default so ordinary testing avoids these extra task-model calls. This setting is server-side, not a new conversational tool or UI toggle.

CONCLAVE_MEMORY_SELECTOR=jev-hybrid preserves the opt-in fallback mode. CONCLAVE_MEMORY_SELECTOR=task-model preserves the previous active-model/Jev-shadow mode. Library harnesses can choose these modes explicitly; enabling memoryModel without a selector retains their previous task-model behavior. Dependency-injected services still require memoryModel: true to enable optional candidate selection.

The existing Jev switch and credentials must be available for optional Jev capture. The normal answering model, semantic compaction, embeddings and other context controls retain their existing behavior. User-requested remember/update operations can maintain named state, read_memory inspects both stores, and suppress_memory stops reusing authorized targets; the Memory editor also supports corrections and restoration. These operations retain their authority/source checks.

Workspace's Jev view separates direct captures, hybrid fallback and optional comparisons, including passages left for review. The offline label preparer now reads direct selections and reverse comparisons as well as historical shadow events; an absent model comparison remains absent, rather than being treated as a negative selection.

## Evidence

- Source suite: 272 passes, one optional replay skipped; 30 focused checks pass. Six new cases cover direct source-exact unresolved capture with zero task-model calls, disagreement-only comparison, failure isolation/no fallback, deterministic correction without Jev, cancellation and Context/Agent defaults.
- Native smoke: three synthetic completed-assistant paragraphs, one actual Jev call, zero task-model/answer-generation calls. jev-1.13.0 kept the qualified finding and explicitly undecided UV-card proposal, skipped narration, and committed both with model_proposed/unresolved authority. Reported usage: 830 input / 144 output tokens; provider-call elapsed time 242 ms. No uncertainty in this sample.
- The smoke demonstrates the direct capture path, not complete conversation quality or whole-task savings. The task model still answers and can manage named state. A fresh app conversation is needed to evaluate whether Jev misses something useful in practice. Older records and exports are not rewritten.

Converse validation: 190 passes, one optional replay skipped; syntax and 81-file parity passed. Eight targeted desktop/mobile browser checks passed, including active memory/comparison presentation, exact Jev evidence/paging, manual correction/suppression/restoration and legacy capture diagnostics. Native source smoke was the only external call. No push or deployment performed.
