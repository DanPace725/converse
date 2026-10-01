# Workspace viewer/editor — first iteration

Implemented and validated locally on October 1, 2026. This report records the checks completed before the initial Git deployment.

## What is available

Open a saved Context or Agent chat and click **Workspace** in the header. The panel sits beside the conversation on desktop and becomes a drawer on smaller screens.

- **Documents:** uploaded originals and current workspace files, Markdown preview, plain text editing, and downloads. Editing an original creates a named workspace copy.
- **Context:** collapsible working context sections with direct text edits. Pinned, verbatim and reference sections remain read only.
- **State:** collapsible remembered entries, with editable text/type/status and an option to add a named entry.
- **Garden:** selecting a working piece or saved source opens its actual text in Workspace. Historical sources and bundles can be inspected without replacing the current version.

Manual edits record new source/version IDs and context snapshots through the existing SQLite/Neon storage. Previous content and source links stay in the audit. They do not create model calls or extra chat turns. No packages or schema migrations were added.

## Draft and conflict behavior

Drafts are stored in session storage for the current browser tab, scoped to conversation and item. Closing the panel, switching saved chats, and reloading preserve them. Saving synchronizes the authoritative view. Input is locked during the save request so additional typing cannot be discarded by a completed save.

The open panel refreshes every 2.5 seconds and has a manual Refresh button. Older polling responses cannot replace a newer revision. If a file version or context revision changes, Save is blocked while the draft remains available for download. Load latest requires confirmation before replacing a draft. A failed save displays its error and preserves the draft.

Saves are blocked during an answer and while an agent run is active, including a run paused by closing the browser. Stop the run before saving. Drafting remains available while a model works.

## Verification

| Check | Result |
| --- | --- |
| Syntax: `node scripts/check.js` | Passed |
| Offline: `node --test test/*.test.js` | 38 passed; gated Neon test skipped |
| Agent/editor browser suite: `node node_modules/@playwright/test/cli.js test --config=playwright.agent.config.js` | 12 passed across desktop and mobile |
| Ordinary chat browser suite | 17 passed; desktop touch-only test skipped |
| Disposable Neon branch: `node --env-file=.env.neon-test --test test/neon.test.js` | Passed, including manual file/context/state saves across fresh request instances |
| Git whitespace check | Passed |

Browser verification uses real local HTTP/service/storage with scripted model providers. It covers editing an agent document, saving a source copy without changing the original, working context edits, new remembered state, sanitized Markdown, garden navigation, mobile panel bounds, close/reload draft restoration, stale-save blocking, exact draft download, and visible oversized-save errors. Manual edit tests make zero model calls.

The hosted check uses the existing disposable `converse-hosting-check` branch. It verifies fresh readers, immutable history, state supersession/attribution, file version conflicts and unchanged provider-call counts. Production deployment has not been tested with this increment.

The ordinary browser suite ran against a directly launched local test server, which was terminated afterward. This avoids the existing Windows Playwright web-server teardown hang. The temporary launcher and isolated test data are under ignored `.agent-smoke/`.

## Current limits

The first version edits text/Markdown and individual context/state sections. It does not offer PDF/DOCX editing, rich text, a combined context-file editor, automatic conflict merging, or draft synchronization across devices. Session-storage drafts should be saved or downloaded before closing the tab. Existing workspace limits remain 20 files, 100 KB per file, and 500 KB of current text; remembered entries are limited to 2,000 characters.

## Verified screenshots

Desktop panel:

![Workspace beside the conversation](assets/workspace-editor-desktop.png)

Mobile drawer:

![Workspace on a phone](assets/workspace-editor-mobile.png)

Preserved draft after a newer file version was saved:

![Version conflict preserves the local draft](assets/workspace-editor-conflict.png)
