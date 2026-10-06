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

## Limits

In the default-width panel, labels are readable for roughly ten memories at once; larger maps open zoomed out and are read by zooming, selecting or widening the panel. Layout cost grows with the square of the memory count; it was immediate at the 64 memories inspected and has not been measured on larger stores. Scrolling over the map zooms it, so the panel scrolls from outside the canvas. Only relationships already present in saved records are shown; unresolved targets are omitted. Historical named-state versions stay in the inspector. The service-worker shell version was left alone because no asset was added. Local, uncommitted and undeployed.
