# Read pages before managing context

Implemented locally on 2026-10-03. The user requested direct page access because model-written search summaries can omit useful detail or weaken trust. Native search remains available using the existing provider key; its findings are discovery leads. Models can now call `web_fetch` on result URLs or a user-provided URL.

## Behavior

- GET the public HTTP(S) page directly; no provider/model key or cookies are sent, and no summarizing inference is made.
- Save the decoded HTTP body as `web_page_response` and complete readable text as a `document` with `page-text` attribution, URL, timestamp, hash and limitations. HTML extraction removes scripts/styles/templates/noscript, preserves the other text and appends resolved HTTP links. It is extraction, not semantic summarization or JavaScript rendering.
- Return complete extracted text to the answering model. Initial page results and 16,000-character source retrieval pages bypass the ordinary 1,600-character bulk ingress excerpt. Request fitting may shorten oversized responses into exact excerpts with offsets; complete canonical sources remain saved.
- A page receipt becomes a source pointer only after its content appears in an answer request and a later tool result exists. Unobserved results in a batch and the latest result remain intact. Claude's signed exchange rules still apply: redundant history can start a fresh chain rather than mutating a signed prefix.
- Context keeps a short source pointer; the model may keep selected evidence, summarize or offload after reading. `retrieve_event` returns exact source pages, with external-data attribution. Removing a document excludes it from retrieval and fetch reuse.
- Eight persistent network attempts per user turn or Agent run, including failures; successful identical URLs reuse the current scope's saved text. A new user turn refetches. Limits are independent of native search lookups.

## Boundaries

Only public HTTP(S) on standard ports without URL credentials is allowed. DNS answers are checked on each hop, and the verified address is pinned to the socket to prevent rebinding. Mixed public/private DNS, loopback/private/reserved IPv4, non-global and special IPv6, and unsafe redirects are rejected. There are at most three redirects and a 15-second total deadline, shortened to the Agent's remaining time. Complete response size is bounded at 2 MiB; oversize, partial HTTP responses, unsupported formats/compression and failures produce errors, not silently truncated sources. No JavaScript rendering, PDF extraction, login or paywall bypass is provided.

## Evidence

`node --test test/web-page.test.js test/web-search.test.js test/context-management.test.js test/request-context.test.js test/agent.test.js test/anthropic.test.js` passed 48 checks. Tests cover full original endings in all four provider/mode combinations, batch exposure before receipt compaction, source recovery after offload, removal, fallback paging, persistent failure quotas, HTML/entity/link extraction, public addresses, redirects, formats, partial/oversize responses and DNS timeout. Provider exchanges are fixtures; no live model faithfulness or savings claim is made.

`node scripts/web-page-smoke.js` fetched the actual Node.js About page with the default HTTP transport and parser. [Live evidence](web-page-live.json) records response/text hashes, sizes, beginning and footer, with no model call or API key. Hosted deployment and browser verification remain outstanding. This is a Converse-only web integration; no schema migration is needed. Dependency: `htmlparser2`.
