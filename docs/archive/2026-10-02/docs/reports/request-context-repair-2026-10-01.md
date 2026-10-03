# Complete request context and periodic Jev

Implemented locally in Converse. No provider inference calls or deployments were made during this repair.

## Behavior

Context now means the complete model input: instructions, tool definitions, working memory and its source attribution, the latest user message, workspace metadata, and active tool exchanges. The Garden and settings show an estimated next input count and the latest provider-reported input tokens. Cumulative usage is labeled separately; the former text-only savings percentage has been removed.

Estimates use the provider-native request and, when available, the latest reported usage for the same provider/model. Before calibration they use full input bytes divided by three. These are estimates, not tokenizer counts or measurements of net savings. Provider-reported counts remain authoritative after inference. The existing conservative byte guard remains labeled as a request byte guard plus output reserve; cumulative run reservations now use estimated input tokens instead of raw bytes.

Claude no longer appends another working snapshot after every tool step. An unchanged projection preserves the signed native prefix and appends only new tool exchanges. A changed projection or history exceeding 80% of the available request guard starts a fresh inference chain with one current snapshot and a bounded action handoff. The handoff lists recent completed tool observations, retrieval IDs, and completion checks, asks the model to avoid repeating successful writes, and preserves archived originals. Handoff detail may be truncated; `retrieve_event` can page the corresponding tool-result events and workspace files remain available through normal reads. This cannot guarantee a model will never repeat an action.

Restarting the inference chain allows a revised projection without rewriting an existing signed prefix. Anthropic documents the requirement to preserve thinking blocks and their preceding system/tools/messages when continuing the same exchange: [Thinking](https://platform.claude.com/docs/en/build-with-claude/thinking).

With Jev enabled and available, eligible context is reviewed before the first estimated 10,000-token input or after 10,000 accumulated reported answer-input tokens, then after each further 10,000. This counts complete task-request inputs, including resubmitted input, rather than only newly added source text. Reviews run between chat/agent tool steps and persist their counter in the event log. Jev's retain/escalate choices do not force generic compaction. Existing pins, structured state, current-user and recent protections remain enforced. A review with no eligible candidates can skip inference; unavailable Jev uses the existing deterministic fallback.

## Replay of the supplied failing export

Source: `test-results/conv_550f6b41-7b14-4322-aeaa-1624ccf60db1.json`, last ready checkpoint at event 328, projection revision 60. The export was read without changing it. Request construction was replayed without calling a model.

| Measurement | Original construction | Repaired construction |
|---|---:|---:|
| Serialized request input bytes | 241,904 | 81,930 |
| Output reserve | 16,384 | 16,384 |
| Guard total | 258,288 | 98,314 |
| Guard limit | 256,000 | 256,000 |
| Working-context snapshots | 3 | 1 |

The repaired request is 66% smaller by serialized bytes and fits the unchanged guard. Its calibrated complete input estimate is 33,185 tokens. Actual future Claude token usage and task completion were not measured. The byte reduction should not be reported as a measured token/cost reduction.

## Verification

- Full Node suite: 85 passed, one opt-in Neon test skipped, zero failures.
- Six added regression tests cover single-snapshot signed continuation, compaction reducing subsequent input, oversized history recovery, periodic Jev in chat and resumed agents, retrievable tool receipts, and complete read-only input previews.
- Existing signed-provider tests now verify fresh chains after context changes and unchanged signatures within an active chain.
- Desktop and mobile Playwright checks passed for the complete-input Garden and cumulative usage labels, with no page errors. The mobile screenshot was visually inspected.
- JavaScript syntax checks and Git whitespace checks passed.

Replay metrics: `test-results/request-context-export-replay.json`.
