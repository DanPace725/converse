# Converse roadmap

Revised October 2, 2026. This separates the current implementation round from later design work. Original model suggestions remain in `docs/model suggestions/` as proposals, not approved specifications.

## Completed foundation: control, documentation, and visibility

**Implemented locally; awaiting deployment.** All four items below and the token-counting increment are complete. Verification: 92 backend tests passed (one live Neon test skipped), 54 Agent browser checks passed across desktop/mobile, and focused rechecks passed after final UI changes. Real OpenAI and Anthropic count-only requests succeeded. No database migration is required. See [implementation and validation notes](reports/control-telemetry-2026-10-02.md).

1. **User document removal.** Allow users to remove uploaded and model-created workspace documents, with restore. Remove affected document versions from ordinary model retrieval and the active context. Preserve historical audit records and clearly explain that removal is not permanent erasure of prior replies, snapshots, or exports. Models cannot remove documents. Require the current version and reject changes during a running task.
2. **Claude effort.** Enable model-supported Anthropic effort levels, translate them to `output_config.effort`, and preserve thinking/tool continuation. Unsupported levels must be rejected or normalized visibly. Keep provider settings separate and preserve the effort when resuming an agent.
3. **Shared help.** Maintain one app guide served to users through About/help and to models through a read-only tool. Include modes, tools, storage, document removal, memory scope, context management, and limitations. Keep the automatic model introduction compact.
4. **Jev and telemetry.** Add a compact Context-tab view showing the current request budget and recent context-management activity: trigger, proposal, actual application, protected material, revisions, source pointers, and fallback/failure. Build this from saved records, without another explanatory model call. Give models a small status header and a bounded read-only audit tool.

### Token counting in this round

Replace byte-derived display estimates with a real local tokenizer and provider token-count APIs. Use OpenAI Responses input-token counting and Anthropic Messages token counting for complete supported request inputs. Counts must identify provider, model, request fingerprint, revision, measurement time, and scope. Provider preflight counts are distinct from actual billed usage; Anthropic describes its preflight result as an estimate. Local tokenization precisely counts the selected encoding on supplied text, but request framing and other providers remain estimates. Do not claim a generic encoding exactly matches Claude or unknown models.

Use local tokenization for responsive previews. Request provider counts explicitly rather than adding remote calls to Workspace polling; reuse a result only for an identical request fingerprint. Persist counts used by task requests. Expose failures with an honestly labelled local fallback. Keep the existing conservative byte guard visibly separate during this increment; changing scheduling and enforcement requires separate validation. A count is not a model's context capacity, and cached input still occupies context.

### Verification

- Removed files stay absent after reload, cannot be retrieved by old source/bundle IDs through model tools, and can be restored. Historical canonical exports remain complete and are labelled as such.
- Claude effort reaches the native request, including structured compaction output, and provider switches do not carry incompatible settings.
- The help shown to users and returned to models comes from the same source.
- Telemetry separates proposals from actual transformations, reports unknown usage as unknown, and excludes opaque reasoning and raw provider payloads.
- Local counts handle Unicode and code. Provider count fixtures validate native request shape, failures, and fingerprint invalidation.
- Run focused backend checks and browser verification for removal, help, effort controls, and the Context view.

## Current repair round: context control and readable evidence

**Implemented locally; awaiting deployment.** This follows the [export and master-report review](reports/recent-conversation-master-review-2026-10-02.md). See [repair implementation and verification](reports/context-repairs-2026-10-02.md).

1. **Protection scope and eligibility.** Stop accumulating Jev retain/escalate advice in run-long protection lists. Preserve pins, verbatim text, named state, the current request and the recent window. Add `inspect_context` with every blocked target's reason/lifetime. Reject a mixed batch atomically and return structured eligibility. Upgrade older agent checkpoints on resume.
2. **Selection and compaction cost.** Persist and reuse unchanged selection decisions across service instances. Invalidate on changed task/candidate/protection/settings; explicit `/compact` refreshes selection. Distinguish no change, uncertainty, no candidates and application. Use action confidence for the action; uncertain priority falls back to deterministic ordering. Prefer deterministic lossless offload for routine material; retain existing size/reduction preflight and failed-batch suppression. Bound automatic paid rewriting to one call per turn.
3. **Operational visibility and reports.** Show full submitted request counts/revisions separately from the saved-context preview. Link tool exchanges to their originating request and before/after revision. Add activity filters and Earlier/Latest paging, omitted-entry counts, protection details and completed-with-tool-errors status. Regenerate reports from latest deduplicated exports with separate purpose budgets, top-level errors and explicit unknown usage. Include separately logged title costs; do not repeat unsupported savings claims.
4. **State relations.** Accept existing `state:key` targets, plain named keys or segment handles, then store canonical IDs. Preserve attribution, proposal status, limitations and optimistic version checks. Reject forward references in a batch with actionable guidance.
5. **Readable references.** Use stable conversation-local `S1`, `S2`, … segment handles and `E1`, `E2`, … retrievable-source handles in Workspace and the context garden. Derive numbering from immutable first appearance, so legacy conversations work without a database migration. New versions receive new S handles; originals keep theirs. Tools accept handles as well as canonical IDs. Details expose the canonical IDs and source links. For example:

   ```js
   { id: "cb_a9ed7d32-1b4f-4602-ad7d-20e0d843ecbe", segmentRef: "S17" }
   ```

   `S17` is a human handle within one conversation, not a globally unique replacement for the canonical ID. Page offsets remain character offsets; `E12` plus `offset` identifies a source piece without inventing a separate storage identity.

6. **Preservation checks.** Replay the latest failed optimization offline, verify shrinking offload with exact original retrieval, and check guards/attribution/state remain intact. Add fixtures for repeated reviews, persisted caches, checkpoint upgrades, aliases, atomic protection and stale relationships. Broader short/long workload economics and deployed provider reruns remain a follow-up before changing token enforcement or claiming general cost savings.

## Next increments

5. **Retrieval quality.** Exact phrases, source-type and author filters, explicit missing/excluded ranges, improved excerpts, and search within documents. Later add optional imported-transcript sections with unverified speaker labels linked to the original.
6. **Read-only web search.** A provider-neutral server tool with bounded results, source URLs, timestamps, and saved exchanges. Separate snippets from fetched page evidence. No sandbox dependency for an ordinary search API.
7. **Explicit cross-conversation memory.** User-approved entries, source links, corrections, deletion, and per-chat exclusion. Distinguish confirmed facts, preferences, and model proposals. The current app-password scope is an instance, not a user account; establish ownership before multi-user sharing.
8. **Semantic retrieval.** Use embeddings alongside keyword search for documents and memories, preferably within existing Neon/Postgres storage. Tie vectors to source/version IDs, enforce retrieval scope, and invalidate them on removal or revision. Similarity is a discovery signal, not verification. Assess retrieval benefit and cost on a bounded collection before expansion.

## Design conversations before implementation

- **Model workspaces:** private scratch space plus explicit shared artifacts; decide whether ownership follows a provider, model, conversation, or task. Define publication, handoffs, conflicts, quotas, and user visibility. Keep objectives and constraints shared.
- **E2B:** introduce isolated execution for a concrete code/browser/file-processing workflow. Define permissions, network access, secrets, lifetime, artifact return, and costs. A sandbox does not supply durable scheduling.
- **Unattended runs:** durable worker/queue and cancellation/resume semantics; separate from the browser-driven runner and sandbox execution.
- **Permanent erasure:** explicitly address immutable source events, tool-result copies, context snapshots, summaries, backups, and existing exports before offering privacy deletion.
- **Model file lifecycle:** consider model archiving of its own scratch files after user removal and audit are proven. Keep irreversible deletion under user control.

## Sources

- [OpenAI token counting](https://developers.openai.com/api/docs/guides/token-counting)
- [Anthropic token counting](https://platform.claude.com/docs/en/build-with-claude/token-counting)
- [Anthropic effort](https://platform.claude.com/docs/en/build-with-claude/effort)
- `docs/model suggestions/suggested_improvements.md`
- `docs/model suggestions/context-telemetry-proposal.md`
- `docs/model suggestions/context-telemetry-proposal-revised.md`
