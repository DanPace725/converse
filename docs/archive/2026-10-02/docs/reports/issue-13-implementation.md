# Issue 13 implementation and verification

October 1, 2026. Implemented locally; not deployed. [API research and design](../issue-13-reasoning-integration.md).

The user story is: send a Chat, Context or Agent request, receive a separate provider reasoning summary before/during the answer, expand it, retain it on reload/export, and retrieve its attributed original through Conclave. Native provider continuity data is retained separately.

| Boundary | Result | Evidence |
| --- | --- | --- |
| Provider request and extraction | Passed deterministic fixtures | Supported-model configuration; GPT summary/encryption, Claude adaptive/manual thinking and signed blocks, Gemini thoughts/signatures on answer parts. Unknown/non-reasoning models do not receive new reasoning parameters. |
| Provider stream to API | Passed | Distinct summary callbacks/events preserve block indexes and answer deltas. Interrupted native output and available usage remain saved; completed summaries reconcile with final output. |
| API to storage | Passed | Full inference output/native blocks are audited. Readable reasoning sources retain inference, objective/run, provider/model and status links. Agent checkpoints keep frozen Claude prefixes across fresh service instances. |
| Storage to retrieval | Passed | Full source text remains searchable and pageable with attribution. Range retrieval and activity recognize reasoning sources. Layered inputs include only bounded pointers/excerpts. |
| Response to browser | Passed desktop/mobile | Collapsed summaries stream before answer text, preserve disclosure state while streaming, retain earlier tool-step summaries, and render provider text inertly. Interrupted runs retain partial summaries after reload without creating a final answer. |
| Reload and export | Passed desktop/mobile | Ordinary summaries survive reload and Markdown/JSON export. JSON retains opaque native output. Response Copy remains answer-only. Legacy audit projection does not rewrite history. |
| Budget and usage | Passed | Oversized signed Claude continuations stop before inference without changing earlier requests/results. Serialized continuation data contributes to input reservation. Reported reasoning usage is not counted twice. |

The browser tests exposed summary `delta` events entering the answer accumulator. Both clients now route them separately; explicit answer-text and Copy assertions cover the fix. Claude continuation also retains complete native tool/text blocks, including tool caller metadata.

## Checks

- `node scripts/check.js`: passed.
- `node --test test/*.test.js`: 69 passed, one optional Neon test skipped. Ten new reasoning tests cover all three ordinary adapters, both Conclave adapters, native continuation, legacy records, partial streams and retrieval. Truncated Claude usage is explicitly marked partial and includes reported cache input.
- Context/Agent browser regression run: 40 passed. After the answer-routing fix and additional interruption coverage, the focused reasoning run passed all eight desktop/mobile tests.
- Ordinary browser regressions: 21 existing tests passed and one desktop-only touch test was skipped. Both new desktop/mobile reasoning tests passed after correcting the answer-routing bug and opening the export menu in the fixture.
- The supplied conversation export remains at SHA-256 `68869E10128D14BEFC141C99F6CE1CD27F4325662578D3702BEE10812242941B`. Generated Playwright output stays under `.agent-smoke/playwright-results`.

Test implementations: `test/reasoning.test.js`, `test/browser/agent.spec.js`, `test/browser/app.spec.js`. Provider calls in these checks use deterministic fixtures. They do not establish live account/model availability, strict Claude binding enforcement on this account, paid-provider behavior, or production deployment.

![Desktop context summaries](assets/issue-13-desktop.png)

![Mobile agent summaries](assets/issue-13-mobile.png)

## Scope limits

The UI displays provider-returned readable summaries, not raw internal reasoning. Opaque-only responses show an availability note; no decryption is attempted. Reasoning summaries are reported rationale, not independently verified evidence or human-approved decisions.

Native replay is preserved within an active tool turn. Later user turns use the current working projection and attributed readable retrieval; cross-turn native provider sessions and replay across model changes/edited history remain deferred. Gemini remains in ordinary Chat and has no new Context/Agent tool adapter. Summary requests may consume output allowance that would otherwise be available for the answer.

Existing issue 12 work remains in the working tree. No GitHub issue comments, commits, pull requests, database migrations or deployments were made for this implementation.
