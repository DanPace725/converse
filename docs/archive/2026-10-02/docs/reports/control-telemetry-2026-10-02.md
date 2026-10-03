# Control and telemetry implementation

October 2, 2026. Implemented in the local checkout; not committed, pushed, or deployed.

## Delivered

- **Documents:** users can Remove/Restore uploads, model files, and original attachments. All saved versions of a workspace filename are excluded from ordinary model retrieval while removed. Linked active context/state sections are removed, including pins. Old source, bundle, search, and saved file-read pointers cannot bypass the removal through model tools. Models cannot remove or restore files. Restore makes the file retrievable again without reinserting old context. Running tasks and stale document versions block changes. Removed filenames cannot be overwritten until restored.
- **Claude effort:** shared model capability rules drive the UI and server validation. Supported choices reach native Anthropic `output_config.effort`, including structured compaction requests. Legacy Claude `none` maps to Default. Provider selections retain their own effort, and manual Workspace actions preserve pending model settings. Existing reasoning/tool continuation remains intact.
- **Shared help:** About/help renders `public/app-guide.md`; Context/Agent models read that same guide with a paged `read_app_guide` tool. Chat models receive the guide with explicit mode limitations. Title generation excludes it. Vercel configuration explicitly includes the guide in function bundles.
- **Jev/context activity:** the Context tab renders bounded saved audit records, showing triggers, recommendations, protection rules, actual applied changes, revisions, failures, source pointers, and text-only token reductions. The model has a bounded, filtered `read_telemetry` tool and compact current-status header. No extra explanatory model call is needed, and opaque reasoning continuation data is excluded.
- **Tokens:** `gpt-tokenizer` counts the real `o200k_base` encoding on complete serialized native input. An explicit Count saved request action uses OpenAI or Anthropic native counting endpoints, records method/model/time/revision/fingerprint, and reuses a count only when that request is identical. Remote failure uses a labelled local fallback. Routine polling makes no provider count calls. Input counts used in inference are recorded with request telemetry.

## Precision and retention limits

Local tokenization accurately counts the selected encoding's supplied text. It remains an estimate of native provider input because provider framing and model encodings differ. Anthropic describes its preflight count as an estimate. Provider-reported completed-call usage, preflight counts, and the conservative byte guard are shown separately. Count saved request excludes an unsent draft and uses the saved conversation model. The guard and agent input reservation remain byte-based for this round; they are not advertised as exact context-window limits.

Remove is reversible exclusion, not permanent erasure. Source history, prior quotations/summaries, context snapshots, saved tool copies, backups, and canonical JSON exports retain historical content. User audit views can inspect that history. Permanent erasure requires a separate retention design. No schema migration is required for these changes.

## Verification

- Complete backend suite: **92 passed, 0 failed, 1 skipped**; the live Neon roundtrip remains explicitly gated. Existing database/storage tests passed.
- Complete Agent browser suite: **54 passed**, across desktop and mobile. Covered existing workflows as well as document removal/reload/restore, help, Jev proposal versus application, provider counts, and effort selection reaching task requests.
- Focused desktop/mobile checks rerun after final tokenizer and Workspace settings fixes.
- Syntax checks and `git diff --check` passed.
- Live count-only requests succeeded for OpenAI `gpt-6-luna` and Anthropic `claude-sonnet-5-5`, including a medium effort setting in the native Claude request. No answer generation was performed by those checks.
- The tokenizer was checked against Unicode, code, and literal special-token text. A slower initial tokenizer was replaced after full-suite performance exposed problems with repetitive input; the final backend suite completed in about ten seconds.

Production deployment, production removal/restore, and live Neon execution of this round have not been verified.

## Reference material

- [Revised roadmap](../roadmap.md)
- [Shared app guide](../../public/app-guide.md)
- [OpenAI token counting](https://developers.openai.com/api/docs/guides/token-counting)
- [Anthropic token counting](https://platform.claude.com/docs/en/build-with-claude/token-counting)
- [Anthropic effort](https://platform.claude.com/docs/en/build-with-claude/effort)
- [Vercel function file inclusion](https://vercel.com/docs/project-configuration/vercel-json#functions)
