# Makerspace trial: agent and context audit

Reviewed October 1, 2026. Conversation `conv_af2bc22d-b525-4727-ae99-8137d8e0b6fa`; recorded activity from 9:35:19 to 9:45:56 AM Pacific. This is a review of one local trial, not a general benchmark.

**Assessment:** The basic agent harness worked: two autonomous runs executed tools, created and updated three workspace documents, and saved their history and continuation state. Conclave retained important new constraints and successfully compacted the working projection. However, the system did not reliably distinguish current file state from older conversational claims, and a document rewrite dropped useful earlier material. The trial demonstrates functioning mechanics; it does not yet establish dependable artifact revision, long-horizon autonomy, or net token savings.

The user asked for three makerspace configurations under an $18,500 startup budget, a $2,000 minimum reserve, and a $1,650 monthly cap. Later updates added an electrical concurrency limit, Saturday staffing within the existing paid hours, and two revocable donor-owned printers. This gave the system useful tests of arithmetic, changing constraints, document revision and historical recall.

**Evidence and scope.** This report uses a frozen [JSON audit](/E:/Coding/converse/converse/.agent-smoke/review/makerspace-audit.json), [per-turn metrics](/E:/Coding/converse/converse/.agent-smoke/review/turn-metrics.json), and [integrity checks and derived measurements](/E:/Coding/converse/converse/.agent-smoke/review/integrity-and-metrics.json). The JSON was exported at 9:51:52 AM Pacific and contains 183 events, 25 context snapshots, and all 28 model requests and responses. Event sequence numbers below identify records in that JSON. They start at 32 because the database sequence is shared with other conversations.

Audit SHA-256: `eba8effec241414b39f56636ecd33dee87c9774cc1027283266ff9c800ceaf78`.

The analysis inspected explicit model inputs, tool outputs, source documents, checkpoints and context transformations. It does not inspect hidden reasoning or infer subjective model intent. Reasoning-item preservation was checked structurally. No new model inference was used to produce the measurements, and no conversation content or application behavior was changed for this review.

**What actually ran.** This was a mixture of agent runs and context-chat turns, rather than a single continuous autonomous job. All model responses identify `gpt-6-luna`; recorded reasoning effort was `low`.

| User turn | Execution path | Model calls | Input tokens | Output tokens | Observed result |
|---|---|---:|---:|---:|---|
| Initial launch-plan objective | Agent | 9 | 36,139 | 4,004 | Four calculations; three file writes; list files; final response |
| Electrical limit and Saturday hours | Context chat | 3 | 13,826 | 668 | Search history; create two structured constraints; reply |
| Donor-owned printers | Context chat | 3 | 17,421 | 955 | Retrieve budget excerpt; create two structured entries; reply |
| Close budget gap and propose schedule | Context chat | 1 | 6,199 | 987 | Prose proposal; no tool call |
| Update documents | Context chat | 3 | 22,754 | 1,472 | Retrieve/search; provide replacement text; no file write |
| Create new documents | Context chat | 1 | 8,489 | 2,395 | Print full proposed documents in chat; no file write |
| Create new documents again | Agent | 6 | 84,468 | 2,794 | List files; overwrite all three; list files; final response |
| Summarize conversation | Context chat | 2 | 16,188 | 1,917 | One automatic compaction call, then summary |
| **Total** | **2 agent runs + 6 chat turns** | **28** | **205,484** | **15,192** | **220,676 total provider tokens** |

Both agent runs had a five-minute deadline, 40-step limit, 250,000 total-token limit, 256,000 context-budget units, and 16,384 output tokens per call. Their observed completion times were approximately 49.1 and 24.5 seconds. Both finished by returning a final answer; neither exhausted a limit. These results do not test sustained multi-minute autonomy, stop behavior, worker failure recovery or a genuine interrupted-run resume. The second run was a new run using the existing conversation and workspace.

Ordinary chat requests reverted to 64,000 context-budget units and 4,096 output tokens. The substantially larger agent budget therefore did not carry over to later Send requests. The largest recorded request was 71,821 estimated input units during the second run. No request overflow, output truncation or budget recovery was recorded. Context-budget units are serialized UTF-8 bytes, not provider token counts.

**Tool execution and durability.** The audit contains 19 tool calls and 19 matching tool results:

| Tool | Calls | What this trial demonstrated |
|---|---:|---|
| `calculate` | 4 | Annual wages, monthly wages, fixed costs plus wages, and the initial shortfall |
| `workspace_write` | 6 | Three initial documents and three replacement versions |
| `workspace_list` | 3 | Workspace inventory before/after relevant work |
| `search_history` | 2 | Retrieval of original and derived historical sources |
| `retrieve_event` | 2 | Bounded excerpts from original documents |
| `update_state` | 2 | Four named state entries across two batches |

There were no `workspace_read`, `edit_context`, `offload_context` or `resolve_context` tool calls. The one context rewrite was harness-initiated compaction, not a discretionary `edit_context` call. No Jev request was made. No shell, browser, external search or external filesystem operation occurred.

The file writes are supported by actual tool receipts and source-document events: original versions at sequences 64, 72 and 80; replacements at 171, 179 and 187. Their latest sizes are 3,409, 3,574 and 3,236 characters for `final_plan.md`, `budget.md` and `decision_log.md`. Both versions of every file remain in the audit. Workspace files reside in the local SQLite event store; writing a virtual path did not create a standalone Windows Markdown file.

The agent used listings as its final file check. A listing confirms names, source IDs and lengths, but does not check full contents. There is no recorded read-back or independent validation step after the writes. The successful `completed` status means the model ended its loop; it is not an acceptance test of the deliverables.

There are 32 run checkpoints. Across successive agent requests, all 19 output items checked from the immediately preceding model responses were carried forward exactly, including six reasoning items. Every tool-call record has one matching result. All 25 snapshot receipts, before/after hashes, segment-content hashes and source references passed the checks performed for this report. These checks establish internal consistency of this snapshot, not external tamper-proof storage or semantic accuracy.

**How context was managed.** The 25 revisions break down into eight user-message additions, eight assistant-message additions, six workspace-excerpt additions, two structured-state updates and one compaction. Most context growth was ordinary accumulation, rather than active deletion or offloading.

Each workspace write saved the complete file as a source document while admitting only its first 2,000 characters, plus a source pointer, into working context. Full file text also appeared in the write call arguments carried through that agent run's continuation. This creates useful recoverability, but some text is repeated between the working projection, pending tool exchanges and earlier full-document chat replies. New file versions added new excerpts; old versions were not immediately marked superseded or removed from working context.

The two `update_state` calls occurred in ordinary chat, not in either autonomous run. They created:

| Named entry | Type | Retained meaning |
|---|---|---|
| `makerspace_power_limit` | Constraint | One printer and one high-draw tool at a time |
| `makerspace_coordinator_schedule` | Constraint | Saturday is included in the existing ten paid hours |
| `makerspace_donor_printers` | Constraint | Donor ownership and recall on 60 days' notice |
| `makerspace_printer_budget_treatment` | Decision | Retain the provisional printing allowance pending itemization and loan terms |

All four entries survived compaction unchanged, with source attribution, limitations and unknown confidence preserved. No explicit pin or verbatim flag was set; protection came from the named-state mechanism and the recent-context window. There were no later state supersessions or declared conflict relationships. Core startup/monthly budgets were retained in source/prose context and later summarized, but did not receive their own named entries in this trial.

The fourth entry illustrates a remaining status ambiguity: its structured status is `active`, while its limitations explicitly call it a planning recommendation, not donor-approved terms. The prose preserves uncertainty, but consumers of the structured status alone could overinterpret it.

**The compaction event.** Immediately before the final summary, ordinary chat's budget planning measured 61,804 units including reserves against a 64,000-unit budget. This crossed its 48,000-unit automatic-compaction trigger, although it was not yet over the hard limit. The selector was deterministic; Luna performed the semantic rewrite. Evidence: attention decision 206, compaction request/response 207–208, transformation 209.

| Measurement | Before, revision 23 | After, revision 24 |
|---|---:|---:|
| Working segments | 25 | 14 |
| Serialized projection bytes | 47,723 | 28,314 |
| Segment text bytes | 37,777 | 20,433 |
| Named structured entries | 4 | 4, unchanged |

Sixteen segments were replaced by five derived bundles; nine remained unchanged. The serialized projection shrank by **40.7%**. All 16 unique source IDs covered by the removed batch were covered by its replacement bundles, without introducing foreign source IDs. This is a successful structural transformation, with originals still recoverable.

The compacted material preserved the main numerical constraints, contingency rule, unresolved recurring shortfall, power restriction, donor recall, proposed schedule and uncertainty over approval. However, source-ID coverage is a weaker guarantee than faithful interpretation of action status.

One unusually large old assistant reply remained intact: the 10,456-character response beginning “I can’t create or attach workspace files in this chat,” followed by proposed document contents. It was eligible for compaction, but adding it to the selected batch would have produced 34,585 bytes, above the 28,800-byte batch cap. The deterministic packing rule skipped it. Its serialized segment alone occupied 10,936 bytes, about 38.6% of the post-compaction projection. A size-fitting heuristic consequently retained a large obsolete capability statement.

The new summary bundle also referred to the earlier inability to edit and cautioned against asserting document creation from a truncated plan excerpt. More recent workspace excerpts and the successful update response were still in the next model input, but the final answer nevertheless said the assistant had only supplied proposed contents and could not create files. Evidence: old reply 155; successful write sequence 170–189; successful update reply 200; compaction 209; incorrect final summary 212.

This supports a diagnosis of conflicting/stale action evidence and poor latest-version resolution. Compaction likely contributed to the framing, but the audit does not establish that it alone caused the error: conflicting claims existed earlier, and recent positive evidence remained available. No post-compaction retrieval was attempted to resolve the contradiction.

**Efficiency and limits of the savings claim.** Input accounted for 93.1% of all provider tokens. Reported cached input was 77,009 tokens, or 37.5% of input; cached tokens are a subset of input, not an additional usage category. Dollar cost is not calculated because no pricing snapshot was captured.

The agent runs used 120,607 input and 6,798 output tokens combined. The second run used 87,262 total tokens, compared with 40,143 for the first, despite taking fewer model steps. Its first request already contained 39,467 bytes in the working-context message; its final request contained 46,696 bytes there plus 15,442 bytes of pending exchanges. Accumulated history and repeated document text are visible contributors to this larger input load. This is not evidence that the shorter task inherently required more reasoning.

The two ordinary-chat attempts to update/create files consumed 35,110 tokens while producing proposed text instead of writing files. That text was subsequently available to the agent, so it was not necessarily useless; it did represent extra work and context growth caused by the capability split.

The explicit compaction call consumed **7,216 input + 1,498 output = 8,714 tokens**, approximately **3.95% of total trial usage**, and took 13.4 seconds. Only one subsequent model call used the compacted projection in this audit. Reconstructing that request with the pre-compaction projection changes its serialized size from 35,852 to 55,708 bytes, a 19,856-byte difference. This is a controlled byte comparison, not a tokenizer measurement or a paid counterfactual call. It does not establish token or dollar break-even. The 8,714-token figure also excludes context-management work embedded in ordinary task calls, such as the two `update_state` exchanges.

The trial therefore shows real context reduction, but not demonstrated net economic savings. Neither autonomous run exercised automatic semantic compaction or Jev delegation. There is no append-only comparison, long reuse horizon or quality-controlled baseline.

**Deliverable quality.** Independent arithmetic checks reproduce all three startup totals: $11,500, $15,250 and $17,250. The $1,040 monthly wage calculation, $845 fixed costs, $2,065 balanced recurring total, $415 shortfall and $3,250 startup remainder are also consistent. The agent identified the recurring feasibility problem instead of silently claiming compliance. It preserved the donor's ownership/recall limitation, electrical restriction and Saturday-hour allocation in the latest files.

There are still three substantive quality gaps. First, obtaining $415/month in sponsorship provides funding but does not reduce $2,065 spending below a $1,650 spending cap. Whether the cap can be raised, represents only the user's contribution, or permits fewer than ten paid hours needs explicit resolution. The documents mostly label the plan provisional, but their preferred funding response should not be treated as satisfying the original cap without that clarification.

Second, the update was a full replacement rather than a checked revision. The original `final_plan.md` had a five-step launch sequence, teen safeguarding/volunteer-screening considerations, and specific equipment alternatives. The replacement added the new donor/power/schedule information but dropped the launch sequence and some of that detail. The original budget's dedicated large-purchase rationale section was also replaced by a much more general recommendation to obtain quotes and consider cheaper alternatives. Earlier versions remain preserved, but the latest deliverable lost useful coverage of the original request.

Third, the latest run checked the inventory without reading or validating the documents. A file write can succeed while the resulting plan becomes less complete. The recorded zero failures refers to runtime/tool execution, not these content or self-report errors.

**Recommended next increments, in order.**

1. Give ordinary context chat access to the same bounded workspace tools, and clearly expose its current capabilities. The repeated edit requests should lead to actual file operations without requiring the user to rediscover Run objective.
2. Supply a small authoritative workspace manifest on every relevant request: current path, version/source ID, write time and confirmed operation result. Treat earlier “cannot edit” statements as historical capability context, not the current state of the files.
3. Make updates preserve existing sections unless removal is deliberate. Read the current file, apply the change, inspect a diff and validate original plus newly introduced requirements before declaring completion.
4. Make context handling aware of current versus superseded artifact versions. Compact oversized candidates in smaller units rather than leaving an obsolete full-document reply simply because it does not fit the current batch. Retain operation receipts or equivalent structured facts through compaction.
5. Keep the configured budget visible and consistent across execution paths. Add per-run task, retrieval, management and cache metrics; measure cost savings with matched tasks and multiple calls after a context transformation.

The most valuable result of this trial is that the architecture is inspectable enough to separate successful execution from failed interpretation. The next small milestone should be reliable workspace updates and truthful reporting of their current state, followed by a controlled longer-run comparison of context policies.
