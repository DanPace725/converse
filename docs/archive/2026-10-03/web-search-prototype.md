# Web search and Conclave prototype

Implemented locally on 2026-10-03. No deployment or live search was performed. No Brave, Tavily or Exa search credential was configured at the start of the work.

## Behavior

GPT and Claude share a provider-neutral `web_search` function through WorkspaceHarness, used by both Context and Agent modes. Brave is the initial server-side adapter. `BRAVE_SEARCH_API_KEY` enables the capability; no key means the tool is omitted. Ordinary browser-local Chat has no search tool.

The adapter calls the fixed Brave web-search endpoint, normalizes public HTTP(S) result URLs and plain-text snippets, and records retrieval time. It does not fetch result URLs. Queries are limited to 400 characters/75 words; calls return at most five results. The response body is capped at 512 KB, each saved snippet at 4,000 characters, and the request at 12 seconds or an earlier hosted/agent deadline. Upstream bodies and credential-bearing errors are not saved.

At most eight attempts are allowed per user turn or agent run, including failed attempts. Attempts persist before the search. Successful identical queries/counts reuse results within that scope, unless their sources were removed. Agent checkpoint retries preserve the existing duplicate-step protection. No automatic network retries are added.

## Context management

Each search result becomes a canonical external `document` source with URL, query, provider, timestamp and `search-snippet` evidence scope. It is attributed to `web`, not the user or an answering model. Each result starts as an evidence section with a 320-character snippet; the immediate tool continuation returns up to 700 characters per result.

Existing Conclave selection/Jev reviews, summaries, named evidence and offloading operate on these source-linked sections. `retrieve_event`, `search_history` and `resolve_context` recover saved evidence. Existing tool ingress and continuation fitting can shorten temporary results while preserving canonical sources/receipts. Stable tool-loop projections continue to use tool receipts until a refresh or next turn.

Search instructions require URL citations, snippet limitations, timestamp preservation and treatment of external text as data. This reuses the existing management engine; it does not establish a measured gain in cost, accuracy or factual preservation. The sibling CLI engine is unchanged because this is a Converse tool/provider integration, documented in VENDORED.md.

## Validation

- Seven new fixture-based tests passed: fixed-endpoint transport/normalization, safe failures/body limits/abort/empty results, source retrieval and offloading, persistent quotas, GPT/Claude Context exchange, Agent continuation/idempotency, and absent-key/hosted-deadline behavior.
- A focused regression run passed 38 checks, including the seven new tests plus Context, Agent, request-context and context-management tests. After final deadline/error/cache refinements, the seven search checks passed again.
- JavaScript syntax checks and Git whitespace checks passed.
- Tests use no live model/search calls. No browser interaction changed; no database migration or new dependency is required.

## Enable and evaluate

Add `BRAVE_SEARCH_API_KEY` to the local server environment and restart, or configure it in the hosted deployment environment and deploy. In Context or Agent mode, ask for a current fact with source links, then follow up requesting a detail from a saved source. Inspect canonical JSON for documents, tool receipts and context transformations.

The next useful increment is bounded full-page reading, followed by a matched research trial that checks source recovery, citation accuracy, retained qualifications and total model plus search cost. Search charges are separate from the current token-based model cost reports.

API contract: [Brave Web Search](https://api-dashboard.search.brave.com/api-reference/web/search/get), [authentication](https://api-dashboard.search.brave.com/documentation/guides/authentication), checked 2026-10-03.
