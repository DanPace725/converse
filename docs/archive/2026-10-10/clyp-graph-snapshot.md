# Clyp graph snapshot

October 10, 2026, local branch `codex/clyp-graph`.

Migrated committed Conclave source `60df12110b551cd1d0e1e149ff141e9b835019bf` through the managed sync script. All 110 files match their manifest hashes (nine changed runtime files, including new shared graph JS/CSS). The dashboard and MCP Apps resource use the same renderer; the MCP server adds a read-only graph data tool and graph presentation in the existing display tool. Complete Clyps, readable references, owner boundaries and exact pinned reads are retained. Converse's application routes/deployment settings are unchanged.

`node scripts/check.js` passed. `node --test test/*.test.js`, with checkout-local TEMP/TMP, passed 203 tests with one optional skip. Source validation passed 27 focused checks and 22 desktop/narrow browser cases; the four affected graph cases passed again after responsive adjustment. [Source implementation and preview](../../../../CLA/conclave/docs/archive/2026-10-10/clyp-graph.md) · [ChatGPT UI contract](../../../../CLA/conclave/docs/PLUGIN_UI.md#graph-in-chatgpt)

Local implementation/migration only: no push, production deployment, real ChatGPT graph acceptance or live model pilot in this increment. The independent Conclave release of earlier CLAMP work is recorded separately in the source release receipt.
