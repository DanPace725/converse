# Agent tool batches — 2026-10-02

The mobile Claude failure came from a completed response containing ten `calculate_expression` calls. The runner's undocumented eight-call limit rejected the whole batch before executing any of those calculations, then terminated the run. The provider response and its usage were already saved.

Agent responses now allow sixteen calls. Instructions define a step as one model response, explain sequential execution, encourage batching independent reads/calculations, and require waiting for results before dependent actions. This allows the observed ten-calculation batch without another model request solely to split it.

If a response exceeds sixteen calls, no calls in that batch execute. Every requested call receives a matching `tool_batch_limit` error receipt saying it was not executed and asking the model to split the batch. Claude receives native `tool_result` errors paired with every `tool_use` ID. The checkpoint stays ready for the next browser-driven step. The audit records the requested count, limit, and skipped execution; rejected responses still consume reported tokens, steps, and time. Existing run limits bound repeated violations.

Validation: 125 backend tests passed; one live Neon test was skipped. Five focused tests cover both GPT and native Claude, sixteen successful calculations, oversized batches containing a write, recovery through fresh service instances, duplicate-step protection, usage accounting, and repeated rejection reaching the step limit. Syntax and whitespace checks passed. No paid conversation replay was performed. Original conversations and local analysis artifacts remain local.

For mobile testing, reload after deployment and submit a follow-up in the saved conversation. The earlier failed run stays in the audit; this change applies to subsequent steps/runs and does not replay its rejected actions automatically.
