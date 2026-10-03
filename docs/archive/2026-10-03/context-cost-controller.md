# Context cost controller: first implementation

2026-10-03. Implements the first stage of the [algorithm proposal](compaction-cost-policy.md) in Conclave and migrates it into Converse.

## Runtime behavior

- Timing decisions use local arithmetic. Periodic checks no longer call Jev merely because the cumulative-input interval elapsed.
- Context pressure tries deterministic source pointers for routine material before paid selection, including oversized offload candidates. Task-relevant pressure and explicit reviews retain Jev selection; semantic rewriting remains available with existing reduction/capacity/protection guards.
- Each review records `action-next-request-shadow-v2` economics: keeping context, up to six individual routine pointer candidates, their combined batch, and one bounded summary batch. The complete serialized native-input estimate includes instructions, tools, lineage and source metadata.
- Summary pricing reuses the actual proposed request and configured output cap, so the first summary can be priced without historical compaction usage.
- Cost intervals preserve unknown cache validity, recovery assumptions and price tiers. A cold keep scenario pays its own rebuild; recovered input crossing a known tier reprices retained input too. Observed cache buckets are recorded but do not certify a new request's prefix reuse.
- This stage uses only the pending next request. It does not infer future reuse from historical sample count, and does not execute the shadow recommendation (`due: false`). Existing context telemetry exposes the estimates without adding user controls.

## Validation and migration

Conclave source commit: `3c8a1afd582231f5c6f2b80ad986d9e2f26f9311`.

All **62 managed files** match the committed source. Source validation: **171 passed, one optional saved-export replay skipped**, zero failures; syntax checks passed. Converse focused checks: **36 passed**. Full Converse validation: **176 passed, one optional live Neon check skipped**, zero failures; `npm run check` passed. The Windows sandbox rejected atomic renames in its default temporary directory on the first full run; rerunning `npm test` with process-scoped TEMP/TMP inside the workspace passed. No production storage code was changed to accommodate the test environment.

Eleven dedicated action-cost tests cover first-use pricing, warm/cold and surviving-prefix behavior, costly retrieval, unknown rates/recovery/counts, uncertain tiers, recovery crossing a known tier, no invented horizon, repeatable native previews without audit changes, local periodic checks without inference, and pressure offloads with exact protections/source recovery. Chat/Agent selector fixtures still cover token ceilings, missing usage and task-relevant pressure. Fixtures supply all provider responses; no paid API calls were used.

## Limits and next work

The reported values estimate context and management costs, not total task cost or billed savings. Summary projection size has an optimistic empty-summary estimate and an uncalibrated output-envelope estimate. Recovery spans zero to one full batch and excludes extra answer calls, repeat retrievals, retries and output differences. Runtime cache state remains unknown with zero assumed reusable context-prefix tokens. These estimates do not establish fidelity or justify acting automatically.

Next: measure exact surviving cache boundaries; calibrate summary/recovery/continuation intervals; reuse unchanged local forecasts; compare acting with waiting over future requests; run matched live cost/fidelity trials; then enable supported automatic choices. No background model reviews or cache-keepalive calls were added.
