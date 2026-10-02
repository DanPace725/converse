# Suggested features and changes

Written by Claude (claude-sonnet-5-5) at the user's request ("features or changes that would improve things from your perspective"). These are my suggestions, not requirements the user has approved. Nothing here was implemented. No context was compacted.

## How to read this
- **Observed** means I saw it directly in this conversation's tool results or context.
- **Inferred** means I'm guessing from tool descriptions or from how the app seems to work. I haven't tested it.
- Priority is my own judgement: High, Medium or Low.

## 1. Retrieval and search

### 1.1 Split uploaded transcripts into per-turn events (High)
- **Observed:** The uploaded multi-model chat is stored as one document event. Search finds text inside it, but a hit can't say which speaker wrote it. I could only say "the export labels this as X".
- **Suggestion:** Optionally parse known export formats (speaker headers) into sub-events. Each should carry a speaker label marked "as stated in the file, unverified".
- **Why it helps:** Attribution questions could be answered from the index instead of by re-reading 8,000-character pages.

### 1.2 Exact-phrase and filter options for search (Medium)
- **Observed:** Matching is loose. Some hits matched only 2 of 3 query words. Excerpts are about 400 characters and sometimes start or end mid-word.
- **Suggestion:** Add a quoted-phrase mode. Add filters for author (human or model), kind (message, document, reasoning, workspace file) and sequence range. Snap excerpts to word or sentence boundaries.
- **Why it helps:** It would cut noise, such as my own earlier summaries outranking the original passage.

### 1.3 Clearer behaviour for empty or missing ranges (Medium)
- **Observed:** `retrieve_range` for seq 1–3 returned only seq 2. I couldn't tell whether seq 1 and 3 were hidden system events, incomplete events or non-existent.
- **Suggestion:** Return an explicit note such as "seq 1: not visible (system)" or "seq 3: does not exist". Say what the result excludes.
- **Why it helps:** I can then tell "nothing there" apart from "can't see it".

### 1.4 Show which sources are in the working context (Low)
- **Inferred:** Search hits don't say whether the matching material is already in my working context. A flag "already in context / not in context" would avoid pointless retrievals.

## 2. Working context and compaction

### 2.1 Show me a size budget (High)
- **Observed:** I saw a revision number but no indication of how full the context is or how close automatic compaction might be.
- **Suggestion:** Include a short line such as "working context: N of M units; compaction threshold at X".
- **Why it helps:** I could decide to retrieve more or less, and I could report on context pressure accurately instead of guessing.

### 2.2 Preview what automatic compaction will do (High)
- **Observed:** The user said compaction should be automatic. The uploaded transcript also shows a messy compaction attempt, and its ending is cut off.
- **Suggestion:** Before or after an automatic pass, give me a short report of what was removed, what was summarised and which constraints or pinned items were kept.
- **Why it helps:** I could check that constraints, numeric limits and unresolved alternatives survived, and flag any loss to the user.

### 2.3 Ways to pin and unpin items (Medium)
- **Observed:** Every bundle in my context showed `pinned: false`. I have no tool for pinning or unpinning.
- **Suggestion:** Let me request a pin for an item and give a reason. Let the user approve or reject it.
- **Why it helps:** Exact user wording (such as "don't compact anything") could be protected without my choosing what is protected alone.

### 2.4 Stronger separation of source text from derived summaries (Medium)
- **Observed:** My own reply summaries and reasoning summaries appear in search results beside the original sources, and they can outrank them.
- **Suggestion:** Show a "derived" label on every summary bundle and rank original sources above derived ones by default.
- **Why it helps:** It reduces the risk of treating a summary as evidence.

## 3. Structured state

### 3.1 A way to retire or archive entries (Medium)
- **Observed:** State entries can be superseded by reusing a key, and status can be set to superseded. I'm not aware of a clean way to mark one "done" or archive it.
- **Suggestion:** Add a "resolved" or "archived" status. Keep it searchable but out of the active view.

### 3.2 Staleness hints (Low)
- **Suggestion:** Show when a state entry was last confirmed by the user, and flag entries that are only an assistant recommendation. This matches the rule that my recommendations stay unresolved until approved.

### 3.3 Revision-conflict messages that say what changed (Low)
- **Inferred:** State and context edits need `expected_revision`. If I get a conflict, a short diff of what changed since my revision would save a round trip.

## 4. Workspace files

### 4.1 Partial reads and targeted reads (Medium)
- **Observed:** Reading the 80,452-character upload took 11 pages. The manifest and context only show a partial excerpt of files.
- **Suggestion:** Add reading by heading or by search-within-file. Add a "table of contents" view that lists headings with offsets.
- **Why it helps:** I could go to the right section without paging through everything.

### 4.2 More file operations (Low)
- **Inferred:** The tool list has create, read, patch and list. I don't see delete, rename or copy.
- **Suggestion:** Add rename and delete. Keep version history, so nothing is lost.

### 4.3 Diff view between versions (Low)
- **Suggestion:** When I patch a file, show the diff. That would make the read-back check faster than re-reading the whole file.

## 5. Multi-model and attribution

### 5.1 Clear labels for who authored imported content (High)
- **Observed:** The upload contains turns labelled as several different models, including Claude claude-sonnet-5-5. I treated all of them as unverified labels and did not claim any as mine.
- **Suggestion:** Show a standard banner on imported documents: "Authorship inside this file is unverified". Offer the user a way to mark a file as "verified transcript of my own earlier session" if that is true.
- **Why it helps:** It makes the safe default (don't claim imported turns as mine) visible to everyone.

### 5.2 Per-model notes on handoff (Medium)
- **Suggestion:** When the model changes mid-conversation, add a short handoff note: current objective, active constraints and open questions. Label the note as written by the previous model.

## 6. Autonomous runs

### 6.1 Progress notes that don't end the run (Medium)
- **Observed:** A text reply without tool calls ends the run.
- **Suggestion:** Allow a short "status" message during a long task, so the user can see progress without the run finishing.

### 6.2 A checklist for completion (Low)
- **Suggestion:** Show the active constraints at the end of a run so I can tick them off explicitly. This helps in long or complex plans.

## 7. Suggested order
1. Context size budget (2.1) and compaction report (2.2). These need the least new design and give the most visibility.
2. Per-turn splitting of uploads (1.1) and import banner (5.1).
3. Search filters and exact phrase (1.2) and clearer range results (1.3).
4. The rest, as time allows.

## Limits of this document
- I haven't seen the app's source or settings. Anything marked Inferred may already exist or may be impossible for reasons I can't see.
- I haven't tested these ideas. Priorities reflect what slowed me down in this conversation, which was a short test session.
