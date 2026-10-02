# Issue 12: function test and suggestions review

Reviewed [issue #12](https://github.com/DanPace725/converse/issues/12), its two Markdown attachments, and conversation `conv_b53ebbe1-a7b3-403a-8dc3-f2b40cd67582`. The linked attachments matched the latest corresponding document events in the export. Self-test claims were checked against the actual event chronology and current implementation.

| Reported finding | Evaluation and resulting behavior |
| --- | --- |
| Context revision/workspace synchronization mismatch | Not supported by the export. All 49 answer requests match the latest preceding context revision and workspace file versions: zero mismatches. The report compares an older tool observation with a later view. Tool results now identify their observed revision, the manifest labels its current revision, and model instructions explain that earlier results are historical observations. |
| Workspace excerpts appear complete although limited to 2,000 characters | Confirmed. Generated excerpts now state total length, omitted length, and how to read the full file. Exact legacy excerpts receive this annotation in model inputs without changing stored snapshots. The editor labels legacy partial excerpts and directs readers to Documents. |
| Offload pointers are hard to distinguish; retrieval may be incomplete | Pointers now include a bounded 160-character source excerpt explicitly labelled as an excerpt, and instructions for paging. `resolve_context` supports offset/next_offset, total length, and partial-result metadata. The UI opens the full original bundle read-only. Original source text and IDs remain preserved. |
| Documents lack the writing model | Confirmed. New model writes and patches record provider, requested/reported model, exact inference IDs, and tool call ID. Legacy attribution is recovered only when the recorded tool call exactly matches an audited inference response. Unknown models stay unknown. Documents displays the last editor/model. |
| Named state index | Already available in the Workspace State tab; no additional index needed. |
| Correction history | Previous state revisions are now directly accessible from the editor, read-only, using the existing historical-bundle API. |
| Offload size threshold | Depends on serialized metadata, source IDs and reference overhead; a fixed character threshold would be misleading. The existing guard reports current/proposed sizes and refuses operations that do not shrink context. The larger pointer preview participates in this check. |
| Stale revision errors | Already report the current revision. Existing version/readback protections remain in force. |
| Duplicated user message | Excluded at the user's direction because it came from previously fixed failures. |

The final document authors recovered from immutable inference/tool history are:

| File | Last writing model |
| --- | --- |
| distributed-memory-notes.md | OpenAI gpt-6.1-sol |
| conclave-function-test.md | OpenAI gpt-6.1-sol |
| conclave-suggestions.md | Anthropic claude-sonnet-5-5 |

Reproduce the chronology audit with:

```powershell
node scripts/audit-context-export.js test-results/conv_b53ebbe1-a7b3-403a-8dc3-f2b40cd67582.json
```

Validation: 59 offline tests passed, with one optional live Neon test skipped. All 36 Context/Agent desktop and mobile browser tests passed, including legacy excerpt labelling, document author display, full original retrieval, and read-only correction history. Ordinary-chat browser checks passed 21 tests, with one desktop touch test skipped. Syntax and Git whitespace checks passed. These tests use deterministic provider fixtures; no new live model inference was performed.

Saved evidence: [chronology audit](assets/issue-12-export-audit.json), [desktop correction history](assets/issue-12-desktop.png), and [mobile correction history](assets/issue-12-mobile.png).

During verification, the default Playwright output cleanup removed the supplied JSON from `test-results`. The conversation was recovered through a read-only database export: all 378 events and 26 messages are present, and rerunning the chronology audit again reports zero mismatches. The export timestamps were regenerated. A second recovered copy is kept under `.agent-smoke`. Playwright now writes to `.agent-smoke/playwright-results` to keep test cleanup away from supplied exports.

Changes are local and have not been pushed or deployed.
