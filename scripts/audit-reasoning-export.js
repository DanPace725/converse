import { readFileSync } from 'node:fs';
import { anthropicPayload } from '../lib/conclave/provider.js';

// Read-only investigation: do not print opaque reasoning, signatures or inputs.
const data = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const requests = new Map(), groups = new Map(), providers = {}, prefixChecks = [];
let user = null;
for (const event of data.context_layer.events) {
  if (event.kind === 'user' && !event.metadata.purpose?.startsWith('manual-')) user = event.id;
  if (event.kind === 'inference_request' && event.content === 'answer') {
    requests.set(event.id, { event, user });
    const provider = event.metadata.provider;
    providers[provider] ||= { calls: 0, responses: 0, reasoning_items: 0, readable_characters: 0, opaque_items: 0 };
    providers[provider].calls++;
  }
  if (event.kind !== 'inference_response' || event.content !== 'answer') continue;
  const request = requests.get(event.metadata.request_id);
  if (!request) continue;
  const provider = request.event.metadata.provider, counts = providers[provider];
  counts.responses++;
  const reasoning = (event.metadata.output || []).filter(item => item.type === 'reasoning');
  for (const item of reasoning) {
    counts.reasoning_items++;
    counts.readable_characters += (item.summary || []).reduce((n, part) => n + (part.text?.length || 0), 0)
      + (item.anthropic_content?.thinking?.length || 0);
    if (item.encrypted_content || item.anthropic_content?.signature || item.anthropic_content?.data) counts.opaque_items++;
  }
  if (provider !== 'anthropic') continue;
  const native = request.event.metadata.provider_payload || anthropicPayload(request.event.metadata.payload);
  const key = request.user + ':' + native.model, previous = groups.get(key);
  if (previous) prefixChecks.push({
    previous_request_seq: previous.seq, next_request_seq: request.event.seq,
    first_message_changed: JSON.stringify(previous.native.messages[0]) !== JSON.stringify(native.messages[0]),
    prior_thinking_items: previous.thinking,
  });
  groups.set(key, { seq: request.event.seq, native, thinking: reasoning.length });
}
console.log(JSON.stringify({ conversation_id: data.conversation_id, providers,
  claude_continuation_prefix_checks: prefixChecks,
  interpretation: 'A changed first message identifies a rewritten prefix; this is not proof that a live signature check rejected it.' }, null, 2));
