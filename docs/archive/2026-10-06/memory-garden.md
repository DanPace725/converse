# Memory garden

The existing Memory tab now defaults to Graph. List remains available within the same tab. This is an application UI projection of saved records; memory extraction, retrieval and storage behavior are unchanged.

## Behavior

- Topic beds use existing explicit scope metadata. Unscoped entries group under This conversation; ambiguous scope is labeled Unclear topic. Named state has its own group. Nearby nodes do not imply a relationship.
- Pages show at most 12 nodes, with topic filtering and an Earlier versions checkbox. Suppressed/invalidated entries remain inspectable with muted styling; superseded entries are initially hidden. Each node shows a short excerpt and has the full text, lifecycle and ID in its accessible label/tooltip.
- Solid circles distinguish memory kinds; diamonds identify named details. Rings show full inclusion in the last projection, hollow circles show pointers. Inclusion is not a confidence or truth score.
- Recorded dependency, replacement, conflict and support edges are drawn only when both endpoints are on the page. The inspector offers all resolvable incoming/outgoing connections, including targets outside the current page/filter. Source inspection, edits, correction history, suppression/restoration and adding named state reuse existing controls.
- Graph and List both expose saved cleanup proposals and capture issues. Copy memory snapshot remains available. Keyboard Enter/Space opens nodes and Back restores focus. Paging resets the graph's scroll position; filters reset when the conversation changes.
- Rendering/filtering/paging makes no inference calls. No database migration or Conclave change is required. Service-worker shell v39 includes the new graph asset.

## Validation

Fourteen distinct desktop/mobile browser scenarios passed across the focused runs: graph navigation, cleanup approval, automatic-memory editing/suppression/restoration, unified memory suppression and patches, named-state history/source inspection, Workspace edits, and capture issues/snapshot inspection. The graph scenario verifies source and relationship navigation, earlier versions, named entries, topic filtering, 12-node paging, empty conversations, reload default, horizontal fit, browser errors and unchanged fixture inference counts.

`node scripts/check.js` passed syntax checks and 82-file engine parity. The three existing Garden ledger tests passed. `git diff --check` passed. Visual screenshots were inspected on desktop/mobile; this caught and resolved a checkbox sizing issue. Edge fixtures required execution outside the Windows sandbox because temporary profile file replacement failed inside it. Fixtures use isolated local servers/stores and no native provider calls.

[Desktop preview](../../reports/assets/memory-garden-desktop.png) · [Mobile preview](../../reports/assets/memory-garden-mobile.png)

## Limits

Only relationships already present in saved records are shown; unresolved targets are omitted. Historical named-state versions remain available through the existing inspector, rather than being reconstructed as graph nodes. Large graphs are paged, so the diagram is not a view of every connection at once. Retrieval benefit, learned semantic links and graph-driven memory activation are not implemented or claimed. These changes are local and have not been committed, pushed or deployed.
