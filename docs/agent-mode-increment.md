# Agent Mode and workspace follow-up — 2026-10-01

Implemented in Converse after the [Makerspace trial review](reports/makerspace-agent-review-2026-10-01.md). The original trial and frozen audit were not rewritten. These changes affect subsequent turns.

## User flow

- **Agent Mode** is beside the message box. With it on, ordinary Send/Enter starts the agent using the message as its objective. With it off, Send performs a context-chat turn. The choice survives reloads.
- New chats use saved context when the server supports it. The separate browser-local multi-provider path remains available through the context setting.
- A compact status line shows model work, Jev selection, context management and tool activity, with elapsed time and agent step count. Stop and Resume are outside the context panel and garden. There is no invented percentage complete.
- **Workspace files** offers a direct download for each current file. These files remain virtual conversation documents in SQLite/Neon; downloads produce usable local copies.
- Both modes default to 256,000 conservative context units and 16,384 output tokens per call. The same selected budgets carry across mode switches. Older agent trials forced Jev off and chat used smaller defaults; reopening those trials selects the new defaults for the next submission without altering historical settings in the audit.

## Workspace correctness

Context chat and the agent now use the same listing, read, write, exact-patch and arithmetic tools. Every task request includes an authoritative manifest with current paths, version/source IDs, write timestamps and operation names. Instructions identify these capabilities as current, superseding old statements that files could not be edited.

An existing file must be read completely before modification. An update supplies the current source ID; stale versions are rejected. A patch replaces one exact, unique passage and preserves all unmatched text. A whole-file replacement must retain existing Markdown headings; deliberate section removal can use a patch. Operation receipts retain the previous version and the number of matched, replaced and preserved characters for patches.

A file-writing turn cannot finish until every page of each current written version has been read back. Read receipts persist across agent steps and fresh hosted instances. If the model attempts to finish early, the harness records a completion correction and requests readback. The existing step/time/token limits still bound this continuation.

This checks delivery of the saved content to the model. It does **not** prove that the model considered every requirement or preserved every detail semantically. Exact patches give a strong mechanical preservation guarantee outside their matched passage; heading checks on replacements are weaker. A future acceptance check can compare the deliverable with all original and newly introduced constraints.

## Context and Jev

Jev is enabled by default when the server has its credential. It runs under context pressure to choose retention actions, rather than adding a decision call to every short message. Users can turn it off; unavailable credentials use deterministic selection. Uncertain/invalid decisions retain material or fall back through the existing guarded selector.

The agent now executes this management path instead of bypassing it. Its total accounting includes Jev selection, semantic compaction and task responses. Every call checks the remaining token allowance; both task and Jev providers receive the original run deadline. A missing usage report stops further paid calls. Each step permits at most one automatic compaction attempt to keep hosted requests bounded.

Superseded, unprotected single-source workspace excerpts leave active context when versions change; their documents and old snapshots remain in history. Larger older drafts that fail batch packing can become lossless retrieval pointers instead of being silently left as full text. Pins, verbatim requirements, structured state and current-request guards remain protected.

Exports now separate provider usage by purpose as well as provider, and count readback receipts and completion corrections. These metrics expose management overhead; they do not establish net cost savings.

## Verification

- Offline tests cover shared chat/agent edits, stale-version rejection, preservation of unmatched sections, replacement-heading guards, paged readback before completion, default Jev under pressure in both modes, accounting after management calls, missing usage and oversized-draft offloading.
- Desktop/mobile browser checks cover the normal Send route, progress with the garden closed, Stop, reload/Resume, direct file and JSON downloads, mode switching with shared files, default Jev/budgets, Markdown safety and the existing multi-provider/offline flows.
- The disposable Neon branch verifies workspace writes/readbacks and pending exchanges across fresh repository instances, saved step retries, leases and immutable audits. No schema migration is required for this increment.
- A live Luna proof completed calculate → write → read → final in four task calls: 7,516 input and 152 output tokens.
- A separate synthetic context-pressure run completed with a validated native Jev decision and a Luna answer. Jev reported 2,451 input / 392 output tokens; Luna reported 3,274 / 9. All 6,126 tokens were included in the run total. No semantic compaction was needed in that check.
- The Makerspace trial remains at revision 25 with its six document versions and three current download links.

Live audits are saved under ignored `.agent-smoke/latest.json` and `.agent-smoke/jev-review/latest.json`. Reproduce opt-in checks with `scripts/agent-smoke.js --live` and `scripts/agent-jev-smoke.js --live`; they use provider credentials and spend tokens.

The local preview is at http://127.0.0.1:3213. This increment is not deployed to Vercel. The browser still drives the loop; a durable queue/worker and stronger content acceptance checks remain useful next increments.
