# Context forecast reconciliation and live trials

2026-10-03. Source commit `76bb759943f83104c40b3fd7d2ba4725845fe56a`, migrated with 63 managed files. Engine implementation and the trial runner live in [Conclave](../../../../CLA/conclave/docs/archive/2026-10-03/context-cost-controller-v3.md).

Converse now records logical native-prefix matching and request age separately from provider-reported cache hits. Each answer request links to its shadow estimate; completed/partial responses reconcile input cost only when the native-input fingerprint matches. `read_telemetry` exposes the latest reconciliation. Forecasts reuse unchanged inputs/protections/configuration and check a 512,000-byte/200 ms cooperative allowance. Estimator or optional-log failures cannot stop an answer. Synchronous tokenizer operations can overrun the time allowance; Stop and mandatory storage remain authoritative.

The isolated source runner compares the exact committed pre-controller policy with current code, counts every dispatch including selectors and retrieval-triggered calls, and bounds call count, time and estimated spend. Its default command makes no provider calls:

```sh
cd ../CLA/conclave
node scripts/context-cost-trial.js
node scripts/context-cost-trial.js --live --max-calls 48 --max-usd 1
```

Source checks passed: 187, with one optional replay skipped. Converse checks passed: 186, one live Neon check skipped, no failures; syntax and all 63 managed-file hashes matched. Live checks used GPT-6 Luna, Claude Sonnet 5.5 and native Jev: 54 dispatches, $0.358127–$0.367209 public-rate valuation. Twelve non-recovery arms preserved the fixed code, cap, seats and conditional alternative. Three initial recovery arms reached the runner's call ceiling while paging; a recovery-only rerun requesting the evidence page completed both turns in all four arms with original-source retrieval and preserved fields. An initially overstrict wording check was corrected with an enumerated-equivalence grader. Original outcomes and separate review are retained in the source [initial record](../../../../CLA/conclave/docs/archive/2026-10-03/context-cost-live-initial.json), [rerun](../../../../CLA/conclave/docs/archive/2026-10-03/context-cost-live-recovery.json) and [review](../../../../CLA/conclave/docs/archive/2026-10-03/context-cost-live-review.json).

These are short synthetic workloads. Some current arms cost more; optimal future timing, broad fidelity and general savings remain unmeasured. Cost-triggered mutations remain in shadow mode. Longer matched tasks and calibrated cache/summary/recovery bounds are still needed.
