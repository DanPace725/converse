# Feedback conversation: memory and compaction friction

Analyzed 2026-10-03. This is an investigation and proposed repair sequence; production behavior has not been changed.

Sources: [conversation export](../../../conversations/Feedback%20on%20an%20Uploaded%20Document_2026-10-03T23-50-55-904Z.json), [Sonnet's document](../../../conversations/observed-friction.md), [offline audit](audit.json), [reproduction script](audit.mjs). The supplied document matches the final exported workspace version after line-ending normalization. Code was inspected and reproduced against local Conclave commit `41dfe2d05708ca8d1cf5662fd490652cc24dfce7`. The export does not identify its deployed engine commit.

## Main finding

The first memory increment preserves attribution, but ordinary correction and lifecycle actions expose gaps between its components. Several apparently ambiguous conversational failures have deterministic implementation causes. Fix those before adding consolidation or learned policies.

The record contains 24 user turns, 619 events, 68 snapshots, five automatic records, 63 answer-purpose model requests (including tool continuations), and nine memory-extraction requests. There were no semantic compaction calls and no offloads. This conversation therefore demonstrates memory/control friction, not fidelity after compaction.

Event `seq` below is the export's canonical sequence number. E/S references in the conversation are separate local source/bundle handles.

## Verified failures and causes

| Finding | Evidence and cause | Proposed repair |
|---|---|---|
| Natural correction becomes an unresolved conflict | Seq 230 captures `Keep the budget under $400`; seq 243 captures `I actually want to make it a range, between 400 and 500` as a claim, contests the original, and supersedes nothing. The explicit grammar misses `I actually want`; the fallback searches for `actually` anywhere and conflicts with all retained binding records in scope. | Recognize ordinary revision wording, identify a unique subject/slot with compatible scope/units/conditions, and retain exact passages. Replace only the matched head. Show the replacement and support undo. |
| The later explicit commitment was never captured | `New commitment: budget should be between $400 and $500` fails the deterministic grammar. Its three model attempts (requests 312/332/347; capture failures 314/334/349) each receive an OpenAI 400 for unsupported `reasoning.effort: none` on the selected `gpt-6.1-sol`. There is no ledger record citing its source. | Fix provider-compatible extraction settings and classify deterministic configuration errors as non-retryable. Add supported explicit phrasing. A successful candidate-only call would still not make it binding or resolve the old head: grammar/targeting also need repair. |
| Requested retirement was silently changed into uncertainty | At seq 386 Sonnet requests `status: superseded` for the named budget state. Receipt 387 reports an updated key. Final S44 remains `unresolved`, and its limitations say `Marked superseded`. `gateStateAuthority` rewrites any unrecognized constraint/decision update to `unresolved`, including retirement. The same gate had downgraded its initial active save. | Separate lifecycle changes from granting authority. Allow source-authorized reversible retirement without reasserting a commitment. Return requested/effective status and any adjustment reason in the receipt; make the assistant verify the effective result. |
| Pasting the Memory display creates a conflicting memory | Seq 496 stores the entire paste as a claim and links it against the budget commitment. It occurs **before** the model extraction request at seq 497; that model returns `records: []` at seq 498. The deterministic ambiguous-correction fallback sees `actually` inside the fenced display, bypassing the explicit extractor's quote exclusion. | Parse/exclude quoted and fenced spans consistently before all capture, correction, and authority logic. Treat shared memory snapshots as inspection data, not a new user assertion or correction. |
| Unrelated changes can contest every constraint | Offline reproduction: capture a budget and wheelchair-accessible route, then say `Actually, I meant the document title`. Both constraints become contested. This follows the same all-binding-record fallback. | Remove the global contest operation. Only a demonstrated same-subject conflict should block use; uncertain association should remain a candidate and should not disable unrelated instructions. |
| Capture failures become hard to see | Six failed captures are logged, but the view/UI expose only the latest capture result. A completed capture on an unrelated subsequent message replaces the visible failure. Model telemetry lacks a dedicated complete, bounded memory inspection operation. | Preserve per-source pending/failed capture status, effective revision, and retry disposition. Expose a bounded memory read/status operation. Show a small persistent issue indicator until the affected capture is resolved or dismissed. |

Code pointers: [explicit grammar and extraction request](../../../../../CLA/conclave/src/memory-extractor.js), [correction fallback](../../../../../CLA/conclave/src/memory-controller.js), [state authority gate](../../../../../CLA/conclave/src/memory.js), [state tool receipt](../../../../../CLA/conclave/src/harness.js), [Memory UI](../../../../public/workspace-editor.js). `audit.mjs` reproduces natural correction, missing explicit capture, quoted-display capture, unrelated conflicts, and retirement coercion with an in-memory store and **no provider calls**.

The budget range's endpoints were never specified. That is a separate question from whether the new range replaces the old limit. The app can preserve that uncertainty without requiring another confirmation of the already clear replacement. Ask about an endpoint only when the next action depends on it. Do not generalize this to “every later statement wins”: quotations, hypothetical alternatives, separate subjects, changed conditions, and cumulative constraints require different handling.

## Memory usability

Sonnet's six observations are useful, with two updates from the primary evidence: the commitment really is absent because capture failed, and the paste really was stored by deterministic fallback. Its status explanation was also inaccurate: the requested retirement did not take effect.

Converse already puts named state and automatic records in one Memory tab. The remaining friction is **unequal inspection/control and inconsistent meaning of saved status**, rather than simply needing another combined list:

- The models see selected automatic memories, not the complete ledger, and cannot inspect/edit/suppress it through a dedicated tool. Their repeated “I cannot see the ledger” caveats refer to this incomplete view, even while selected entries are in the prompt.
- “Try to get rid of the budget stuff” produced two saved questions rather than a lifecycle action. The models could attempt only a named-state update, which then failed semantically while returning success-shaped metadata.
- Add one bounded memory inspection tool and a source-authorized reversible suppression/retirement operation covering explicitly targeted automatic records and linked named state. Resolve targets with source lineage and scope; do not let a model independently erase arbitrary topic matches or promote inferred commitments.
- After a save/correction/removal, show a compact receipt such as `Budget changed: under $400 → $400–$500; endpoints unspecified` or `Budget records no longer used`. Keep source/history available and offer undo. Suppression must remain distinct from permanent erasure.
- Add **Copy/share memory snapshot** with types, effective lifecycle/status, sources, revisions, and read-only inspection metadata. The copied row list currently omits the fields the models need to diagnose it. Exclude shared snapshots from fresh capture. Image sharing is a useful separate app enhancement; it is not necessary to fix this diagnostic path first.

## Why automatic compaction did not run

The current engine starts pressure work at **75% of the 256,000-unit guard: 192,000**. Its guard combines serialized input bytes with a numeric output-token reserve; it is a conservative application guard, not a provider context-window count. The largest recorded guard input was **129,086**, plus output reserve **16,384**, or **145,470 (~56.8% of the guard)**. At turn start the pressure check can also reserve tool space, capped at 10% of the guard (25,600); even adding that cap to the recorded peak gives 171,070, below 192,000. Actual review sizing uses the working projection and its applicable continuation/tool reserve, rather than simply reusing submitted-request bytes. All 23 recorded periodic reviews returned `not_needed`, and there is no pressure/offload/compaction action in the export. Native request byte measurements have a different serialization scope; their maximum was 127,804.

The `10,000` review interval is based on cumulative reported answer-input usage and schedules local checks. It does not mean “summarize once the current prompt contains 10,000 tokens.” The action-cost policy remains shadow-only. Review calls `compact()` independently, and `compact()` checks request size directly even if economics is unavailable. Consequently, the shadow timeouts **do not establish that automatic pressure compaction is broken or caused its absence here**.

The shadow evaluator nevertheless needs repair:

- **22 of 24** evaluations were unavailable due to the 200 ms cooperative processing budget. The other two completed with no candidates. Peak elapsed time was about **698 ms**; total recorded evaluator time was about **9.36 seconds**.
- Unavailable evaluations expose `shadow_choice: keep`, while periodic review records translate the missing token estimate to `0`. These conflate “not evaluated” with a decision and “unknown” with a zero measurement.
- Return `evaluated_choice: null`, a separately labeled fallback/applied-action field, `evaluation_status: unavailable`, and a reason. Retain unknown estimates as null. Keep mandatory size/safety checks independent.
- Profile serialization, source lookup, attention planning, native-input conversion, and tokenization separately before choosing the optimization. The code uses cooperative checkpoints and synchronous tokenization, but this export has no stage timings establishing which step consumed the budget. Reuse safe cached measurements, bound hypothetical candidates, and retain partial results explicitly if worthwhile; simply raising the timeout hides the scaling issue.
- Expose a small trigger/status readout: current guard usage, pressure threshold, protected/eligible content, last action, and why no action occurred. A local replay or isolated fixture with a lower guard can test automatic behavior without the user manufacturing filler conversation.

See [review and pressure checks](../../../../../CLA/conclave/src/harness.js) and [input sizing](../../../../../CLA/conclave/src/input-size.js). Preserve distinctions among bytes, local o200k-base estimates, provider-reported tokens, cache usage, and cost. This run establishes neither cost savings nor post-compaction quality.

## Additional workspace friction

Updating Sonnet's short note required seven patch attempts, five saved patch versions, and two patch errors: an unread current version and a non-unique exact match. Several patches only removed literal backslashes accidentally written around quotes. This increased tool continuations and repeated readbacks; the final reported input grew to 44,059 provider tokens. No causal token-savings estimate follows from those observations.

Keep current-file authority, source-version checks, exact matching, and validated readback. Improve the action surface instead: support a bounded atomic batch of non-overlapping patches against one read version, validate/read back the final version once, and return specific match/version diagnostics. For a roughly 5.4 KB document, one deliberate full read and corrected replacement is another existing route, subject to heading/content preservation. Do not weaken source authority merely to reduce tool calls.

## Proposed implementation sequence

1. **Correctness repair:** consistent quote exclusion; targeted conflict handling; compatible extraction reasoning and non-retryable configuration failures; recognition of explicit commitment wording; independent state retirement; receipts reporting effective status. Turn these reproductions into regression expectations. Add unrelated-subject, conditional, tentative, quoted, and multi-head cases.
2. **Conversation controls:** bounded full memory inspection, authorized reversible suppression/retirement, persistent capture issue status, memory snapshot sharing, and compact user-visible action receipts. Test the user's actual budget sequence and removal request across GPT/Sonnet switches and reloads.
3. **Compaction observability/performance:** explicit unavailable/fallback status, null unknown sizes, stage profiling and bounded evaluation, visible trigger explanations, then an isolated automatic-pressure replay with source retrieval and correction preservation checks.
4. **Optional later app/tool improvements:** image sharing and atomic workspace patch batches. Consolidation, learned memory utility, and cross-chat ownership remain separate later work.

Verification for this analysis: original export and note retained; document/export equivalence checked; ledger/tool facts audited; deterministic bugs reproduced offline; no model or deployment calls; no production code changes. The diagnostic script intentionally reports current defective behavior and is not a passing regression suite for the proposed repairs.
