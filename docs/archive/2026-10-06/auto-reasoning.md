# Experimental Auto reasoning

Both repositories are checked out on `dev/decisions-reasoning`. This feature is locally committed, not pushed or deployed.

Open Context or Agent settings and choose **Reasoning → Auto**. OpenAI Decisions chooses a supported effort before each answer or Agent step; the answer still uses the selected GPT or Claude model. The current choice appears in the settings status and live response header. Manual levels remain available and make no selector call. Per-provider selection is remembered and restored from a saved chat or Agent checkpoint.

Auto uses the account's OpenAI key, including when classifying a Claude task. Missing OpenAI keys, uncertain/failed/invalid selection, unknown models and requests containing images use the answer model default. The experimental selector evaluates bounded text context only. Its probabilities are not calibrated quality guarantees. Agent Stop and run limits include the extra inference. Exports record the selected effort, decision probabilities and separate selector usage; reload, inspection and export make no paid call.

Verified: 329 Conclave and 203 Converse tests passed (one optional skip each), 91-file migration parity, syntax checks, and six focused desktop/mobile browser cases including Auto Context/Agent and reload plus manual Claude controls. Windows sandbox browser-launch failures were resolved with normal local fixture execution; temporary file failures were resolved by keeping test files within the checkout. The mobile test closes the settings dialog before sending.

Live probes selected None for copying, Low for explanation, High for concurrency diagnosis and XHigh for a difficult protocol design; the last had insufficient confidence and would fall back to default. Two real Context answers completed with None/High applied. Six selector calls in the successful trial cost a base estimate of $0.0002885; answer costs and the initial failed trial are separate. The initial 1,024-token output cap exhausted the complex answer; 8,192 completed it. No optimal-effort, general quality or savings conclusion.

[Engine implementation and retained trial evidence](../../../../CLA/conclave/docs/archive/2026-10-06/auto-reasoning.md) · [Browser fixture](../../../test/browser/agent.spec.js)

Next evaluation: compare Auto against fixed Low/Medium/High on the same labeled tasks, including selector overhead, output exhaustion, retries and answer quality. Ordinary Chat is unchanged; this increment covers Context and Agent.
