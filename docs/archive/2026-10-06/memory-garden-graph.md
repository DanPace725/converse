# Memory garden as a zoomable graph

Follows [the paged garden](memory-garden.md). The Memory tab's Graph view is now one continuous map of every saved memory, replacing the 12-node pages. It remains an application UI projection of saved records: extraction, retrieval, storage and the engine are unchanged, and rendering makes no inference calls.

## Behavior

- **Layout.** Memories sit in topic beds. Recorded dependency, replacement, conflict and support links pull their ends together; nothing else creates an edge, and a bed outline is the only reason unlinked memories sit together. Layout is computed in the browser from the records, with no library. A memory keeps its place across polling, edits and filters; only new arrivals disturb the map, and memories hidden by a filter still hold their ground. Beds gather toward the canvas's shape, so the tall Workspace panel gets a tall map.
- **Zoom and pan.** Drag to move; scroll, pinch, the − / + buttons or the `+` / `-` keys zoom; Fit (or `0`) shows the whole map. Selecting a topic name zooms to that bed. The map follows the panel's size until the reader moves the camera.
- **Three distances.** Close up, each memory shows its two-line label and status. Further out it shows a short caption at reading size; further still, seeds alone, enlarged into the room their labels left. Topic names stay legible throughout and are cut to their bed's width.
- **Select, then open.** Selecting a memory (press, or keyboard focus) lights its recorded connections, dims the rest, and shows its text, status and connections in a card over the foot of the map. A connection in the card walks to that neighbour; one outside the current filter opens in the inspector instead. Open, a second press, or Enter opens the existing inspector with sources, edit, suppression and history. Back returns to the same memory with the camera where it was.
- **Keyboard.** The map is one tab stop. Arrow keys move to the nearest memory in that direction, Enter or Space opens it.
- **Kept.** Topic filter, Earlier versions, List view, cleanup proposals, capture issues, Add memory entry and Copy memory snapshot. Cross-topic links are now drawn whenever both ends are in view.

## Validation

`npx playwright test --config=playwright.agent.config.js`: 80 runs passed (40 scenarios on desktop and mobile). The garden scenario covers the 17-memory map, zoom buttons, wheel zoom, drag pan, Fit, topic filtering, earlier versions, selection and its lit edge, walking a connection from the card, deselecting, second-press and keyboard opening, suppression and restoration, named entries, arrow-key movement, List, reload default, the empty conversation, horizontal fit, browser errors and unchanged fixture inference counts. `node scripts/check.js` passed. A scratch fixture with 9, 22 and 64 memories across six topics was inspected on desktop and mobile for overlap, clipping and legibility.

These runs were made while image integration was in progress in the same working tree, so they cover both sets of uncommitted changes together.

[Desktop preview](../../reports/assets/memory-graph-desktop.png) · [Mobile preview](../../reports/assets/memory-graph-mobile.png)

## Similarity lines

Added the same day. Dotted lines join memories with similar meaning. They are a reading aid drawn apart from recorded relationships: they carry no arrow, never move a memory on the map, never reach an assistant and do not affect capture, selection, correction or lifecycle.

- **Source.** A new display-only engine read, `GET /api/conclave?action=memory_links` (Conclave `432723a`), compares the memory vectors the engine already stores for retrieval. It embeds nothing, calls no model and records no event. Local SQLite compares in process; hosted Postgres uses pgvector.
- **Which pairs.** Cosine similarity of at least 0.5, kept only when each memory is among the other's three nearest. Suppressed, superseded and invalidated memories are left out, as they are from retrieval. Where two memories already have a recorded relationship, that edge is drawn and the dotted one is not.
- **In the graph.** The status line counts similar pairs separately. Selecting a memory lights its dotted lines and lists `Similar (NN%)` neighbours in the card after its recorded connections; they walk the map the same way. A Similarity switch beside Earlier versions hides the lines; it appears only when the index holds vectors for this conversation, and its tooltip gives how many memories were compared. The inspector's connection list still shows recorded relationships only.
- **Refresh.** The graph asks again when memories change or the index advances.

Validation: Conclave `npm test` 294 passed, 1 skipped, including new fixtures for mutual-neighbour selection, the similarity floor, lifecycle exclusion, zero provider calls, zero recorded events and the pgvector path. In Converse, the garden scenario seeds vectors directly and checks two dotted lines (a memory pair and a memory-to-named-detail pair), suppression of the dotted line where a dependency is recorded, the switch, the card's neighbours and walking one; it passed six consecutive runs on each device. The 80-run agent browser suite, 190 unit tests and `node scripts/check.js` passed.

Limits: the 0.5 floor and three-neighbour rule were set from one local conversation with eight indexed memories, where passages of the same document scored 0.5–0.7 and loosely related ones 0.38–0.46; they are untested on hosted conversations. Coverage follows the index, which fills lazily during Context and Agent turns, so new or never-retrieved memories have no lines until then. Similar wording is not agreement: a contradiction scores as high as a paraphrase.

[Similarity preview](../../reports/assets/memory-graph-similarity-desktop.png)

## Limits

In the default-width panel, labels are readable for roughly ten memories at once; larger maps open zoomed out and are read by zooming, selecting or widening the panel. Layout cost grows with the square of the memory count; it was immediate at the 64 memories inspected and has not been measured on larger stores. Scrolling over the map zooms it, so the panel scrolls from outside the canvas. Solid and dashed edges show only relationships already present in saved records; unresolved targets are omitted. Historical named-state versions stay in the inspector. The service-worker shell version was left alone because no asset was added. The graph is committed locally (`2e55642`); the similarity snapshot is uncommitted, and neither is deployed.
