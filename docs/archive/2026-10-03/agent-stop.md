# Immediate Agent Stop

The chat Stop button previously waited for the current Agent step. It now aborts the active streaming fetch immediately, removes provisional text, prevents another step, and reconciles the saved stopped run once checkpoint flushing releases the repository lease. Cancellation does not generate a title. Completed workspace actions and the audit remain saved.

Conclave signals cancellation through task/management calls, native-search calls, and direct page retrieval. It checks before spending a call, after a response, and around each tool. Partial or late output cannot become a completed reply; stopped checkpoints clear pending exchanges and signed continuations. Local service Stop can cancel an in-flight call without being rejected by its mutation lock.

Vercel cancellation is enabled specifically for `api/conclave.js`. The handler accepts both request cancellation events and local response disconnects; the hosted adapter uses `waitUntil` to finish checkpoint persistence and lease release after cancellation. This follows [Vercel's cancellation requirements](https://vercel.com/docs/functions/functions-api-reference#cancel-requests) and [Node runtime cancellation events](https://vercel.com/docs/functions/runtimes/node-js#cancelled-requests).

## Validation

- Conclave: 162 tests passed, one optional replay skipped. Eight dedicated cancellation cases include OpenAI/Anthropic active calls, cancellation before inference, late responses and usage retention, page-fetch cancellation between completed and skipped workspace writes, Vercel request error/signal events, and real local/hosted PostgreSQL HTTP stream cancellation with cleanup lifetime.
- Converse: 165 backend tests passed, one optional live Neon check skipped; syntax and 62-file engine parity checks passed.
- All 58 desktop/mobile Agent browser checks passed. The four focused GPT/Claude Stop cases passed again after the final runtime hooks. They verify active-provider abort, zero later tool calls, zero completed replies from partial text, no title request, an enabled composer after Stop, and a persisted stopped state after reload.
- No live model request or production cancellation trial was made. These checks do not measure vendor billing for interrupted work.

The engine manifest points to Conclave `c14a1d9`, which also contains the independently committed request-accounting change `335fbb9`. Concurrent application UI edits were left out of this Stop commit.
