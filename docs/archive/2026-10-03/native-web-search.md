# Native search through existing provider keys

Implemented and checked locally on 2026-10-03. The user preferred using existing OpenAI/Anthropic credentials. This supersedes the separate-key Brave prototype, whose historical report remains archived. Publication was requested after implementation; no database migration is required. Hosted deployment verification remains outstanding.

## Design and behavior

Context and Agent expose a provider-neutral `web_search(query, count)` tool. It makes a separate, bounded inference call through the current provider and selected model, with only that provider's native search tool. OpenAI uses Responses `web_search`, low search context, required tool use, source inclusion and at most two built-in tool calls. Claude uses Messages `web_search_20250305` with `max_uses: 2`. No additional key, dependency or database migration is required.

The main task model receives readable search-derived findings and actual returned URLs. This is a deliberate Conclave boundary: source storage and context management operate on visible findings, while provider-internal search content is not presented as verified plaintext. Each lookup saves one canonical document with the summary, all returned citation URLs, provider/model, query, timestamp and limitations. The working section starts with 320 summary characters and up to the requested count of URLs. The immediate tool response contains up to 1,600 summary characters and five URLs; retrieval recovers the full saved document.

OpenAI citation annotations are converted to clickable Markdown where index spans are returned. Claude encrypted result blocks and all other original native output stay intact in the inference audit. The search call is self-contained; no opaque results are modified or injected into the outer task conversation. A native response that pauses or is incomplete is saved and returned as a tool failure rather than silently treated as complete. This initial version does not continue paused native searches automatically.

Existing Jev selection, semantic summaries, evidence state, references and offloading manage these document-linked sections. Unknowns and qualifications remain explicitly required. Searches produce model-derived claims, not user-approved constraints or independently verified page contents. Separate full-page text retrieval remains future work.

## Limits, persistence and usage

Queries are bounded to 400 characters/75 words. At most eight lookup attempts are allowed per turn or Agent run, including failures. Each lookup allows up to two provider-native tool uses, so the lookup quota is distinct from provider search billing. Successful identical query/count/provider/model requests reuse saved results within the same turn/run, unless the saved source was removed.

Search calls go through the normal harness inference path with purpose `web-search`. Requests, returned usage, native output and failures are persisted through the existing flush/deadline handling. Agent token reserves, reported usage and run deadlines apply before/after search calls. Original task request IDs are restored before outer tool receipts are saved. Guard stops save an error receipt for the unresolved tool call before checkpointing. The UI identifies Web search usage separately.

An additional model invocation accompanies each uncached lookup. Native tool charges are separate from token usage and are not included in existing token-only price valuations. No general cost, accuracy or context-saving improvement is established by these checks.

## Validation

- Seven search fixture tests passed, covering native request schemas, citation extraction/formatting, encrypted-block preservation, retrieval/offloading, cache/removal behavior, persistent failure quotas, GPT/Claude Context and Agent exchanges, task provenance, duplicate Agent steps, usage accounting and pre-call Agent token guards.
- 42 focused checks passed across search, Anthropic, Agent, request-context, context-management and Context HTTP suites. JavaScript syntax checks passed. Final citation/guard assertions were checked with the seven search tests again.
- Two live native lookup calls passed using existing credentials, querying official Node.js sources. GPT-6 Luna completed one search with 8,550 reported input and 69 output tokens; Claude Sonnet 5.5 completed one search with 12,510 reported input and 217 output tokens. These are completed-call provider measurements, including provider cache accounting, not estimates or savings claims. The saved readable documents were 1,806 and 1,208 characters respectively.
- [Live evidence](native-search-live.json) stores returned citations, usage, models and outcomes without credentials or opaque native blocks. Re-run manually with `node --env-file-if-exists=.env scripts/native-search-smoke.js`; this makes paid provider calls.

The live checks validate native adapter execution and evidence storage; the full task-model exchanges use fixtures. Hosted/browser end-to-end search remains unverified because this change has not been deployed.

## Usage

In Context or Agent mode, ask for current information with source links, then request a detail from a saved search source. The existing provider key suffices. Unsupported models or disabled account search produce explicit tool/provider failures. Inspect Context activity, source retrieval, Agent purpose usage and canonical JSON for provenance.

Contracts checked against [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search), [Responses tool-call limits](https://developers.openai.com/api/reference/cli/resources/responses/methods/create), and [Claude web search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool). This is a Converse integration in WorkspaceHarness and the provider boundary; the sibling CLI engine remains unchanged, as documented in VENDORED.md.
