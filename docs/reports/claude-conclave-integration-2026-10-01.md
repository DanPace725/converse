# Claude in Conclave and Agent mode — 2026-10-01

Claude now uses the same saved Conclave context, history retrieval, context editing/offloading, structured state, arithmetic and virtual workspace tools as GPT. Context and Agent modes accept one assistant per turn, selected through the GPT/Claude chips, Settings → Assistant, or a typed @mention. Models remains the place to choose the exact model. Assistants can alternate within a saved conversation; an active agent run retains its original provider/model across Resume.

The Anthropic key stays on the server. Both local SQLite and hosted Neon services route task calls by explicit provider; old saved settings/checkpoints default to OpenAI. Jev remains an independent selector and works under context pressure for either task provider. GPT's reasoning-effort control is disabled for Claude, which uses its model's default reasoning. Claude thinking and redacted-thinking blocks are retained unchanged during tool continuations.

The adapter uses the native Messages API and native structured JSON output for semantic compaction. It preserves tool IDs, groups parallel tool results correctly, signals tool errors, propagates deadlines, counts cache inputs toward the agent token limit, and rejects truncated responses. Workspace documents and tool calls record the actual provider actor. JSON exports include native Anthropic request bodies without credentials alongside the canonical engine inputs, reported model, usage, sources, revisions and checkpoints.

## Verification

- Syntax checks passed. The complete offline suite passed 35 tests, with the opt-in Neon test skipped in the ordinary run.
- Desktop/mobile agent integration checks passed all eight tests, covering Claude routing, saved context, reload, agent mode, provider switching and exports in addition to existing Stop/Resume and workspace checks. The complete browser suite passed 25 tests with one desktop-only touch test skipped. Windows dev-server teardown hung after every test case finished; stopping only that test server allowed Playwright to print its successful summary and exit with code 0. The isolated agent suite needs no dev-server subprocess and exited normally.
- The gated Neon check passed on the existing disposable `converse-hosting-check` branch. Scripted native Anthropic responses exercised write/readback/finalization across fresh repository instances, saved signed thinking/tool exchanges, native request-body exports, provider usage and continuation of an existing GPT conversation as Claude. This is real database persistence with scripted inference, not a production deployment.
- Live Anthropic model discovery succeeded. The final real `claude-sonnet-5-5` agent proof completed four calls: calculate 17 × 23, write `proof.md`, read it back, then report 391. Reported usage: 17,306 input and 465 output tokens. The audit is saved locally under ignored `.agent-smoke/latest.json`.
- Live semantic compaction succeeded in one call with `claude-sonnet-5-5`: revision 10 → 11, serialized projection 14,999 → 3,276 UTF-8 bytes. Reported usage: 5,781 input and 532 output tokens. The source-linked result retained 12 participants, a 100-dollar budget, two adults present, and an undecided venue. This synthetic example does not establish general semantic fidelity or cost savings. Its audit is under ignored `.agent-smoke/claude-context/latest.json`.
- The live compaction check exposed the newer models' rejection of forced tool selection. The final adapter uses `output_config.format` for schema JSON, consistent with [Anthropic structured-output documentation](https://platform.claude.com/docs/en/build-with-claude/structured-outputs). Tool continuation follows [Anthropic's Messages tool-call format](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls) and preserves thinking as specified in the [Sonnet 5.5 migration guide](https://platform.claude.com/docs/en/models/sonnet-5-5/migration-guide).

## Reproduction and limits

```powershell
node scripts/check.js
node --test test/*.test.js
node node_modules/@playwright/test/cli.js test --config=playwright.agent.config.js
node --env-file=.env.neon-test --test test/neon.test.js
node --env-file-if-exists=.env scripts/agent-smoke.js --live --provider=anthropic --model=claude-sonnet-5-5
node --env-file-if-exists=.env scripts/claude-context-smoke.js --live --model=claude-sonnet-5-5
```

The live commands spend API tokens and should use a model available to the caller's key. Live generation was verified with Sonnet 5.5; each other model was not individually exercised. Workspace files remain virtual conversation documents with downloadable copies. Claude uses existing agent step/time/token limits and completion checks. Gemini remains available in browser-local Chat mode. The sibling CLI was not changed. The work is local; production deployment is pending and requires `ANTHROPIC_API_KEY` on the deployed server.
