import { createHash } from 'node:crypto';
import { tokenize } from './input-size.js';

const digest = text => createHash('sha256').update(text).digest('hex');
export function nativeInput(payload, provider) {
  const native = provider.requestPayload ? provider.requestPayload(payload) : payload;
  const { max_tokens, max_output_tokens, stream, store, include, ...input } = native;
  return input;
}
export function requestFingerprint(payload, provider) {
  return digest(provider.name + ':' + JSON.stringify(nativeInput(payload, provider)));
}

// Logical native units, not provider tokens or proof of cache residency. Match
// only complete units; hidden framing and eligible-boundary minima stay unknown.
function units(payload, provider) {
  const native = nativeInput(payload, provider);
  const { messages, input, system, instructions, ...settings } = native;
  const out = [{ text: JSON.stringify(settings), eligible: false }];
  if (provider.name === 'anthropic') {
    for (const block of typeof system === 'string' ? [{ type: 'text', text: system }] : system || [])
      out.push({ text: JSON.stringify(block), eligible: !!block.cache_control });
    for (const message of messages || []) {
      out.push({ text: JSON.stringify({ role: message.role }), eligible: false });
      for (const block of typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content || [])
        out.push({ text: JSON.stringify(block), eligible: !!block.cache_control });
    }
    // Automatic native caching writes at the last eligible message block.
    if (native.cache_control && out.length > 1) out.at(-1).eligible = true;
  } else {
    out.push({ text: JSON.stringify({ instructions }), eligible: true });
    for (const item of input || []) out.push({ text: JSON.stringify(item),
      eligible: ['user', 'assistant', 'developer'].includes(item.role) || !!item.prompt_cache_breakpoint });
  }
  return out;
}

export function traceCache(events, payload, provider, { now = Date.now(), count = true } = {}) {
  const previous = events.findLast(e => e.kind === 'inference_request' && e.content === 'answer'
    && e.metadata.provider === provider.name && e.metadata.payload?.model === payload.model);
  const ttl = provider.name === 'anthropic' ? 300000 : /^gpt-6[.-]/.test(payload.model) ? 1800000 : null;
  const age = previous ? now - Date.parse(previous.timestamp) : null;
  const validAge = Number.isFinite(age) && age >= 0 ? age : null;
  const current = units(payload, provider), old = previous ? units(previous.metadata.payload, provider) : [];
  let identical = 0, boundary = 0;
  while (identical < Math.min(current.length, old.length) && current[identical].text === old[identical].text) {
    if (current[identical].eligible && old[identical].eligible) boundary = identical + 1;
    identical++;
  }
  const prefix = current.slice(0, boundary).map(u => u.text).join('\n');
  const response = previous && events.findLast(e => e.kind === 'inference_response' && e.metadata.request_id === previous.id);
  return { previous_request_id: previous?.id || null, previous_status: response?.metadata.status || null,
    age_ms: validAge, declared_default_ttl_ms: ttl,
    ttl_phase: validAge == null || ttl == null ? 'unknown' : validAge >= ttl ? 'past-default-ttl' : 'within-default-ttl',
    identical_units: identical, eligible_prefix_units: boundary, prefix_hash: boundary ? digest(prefix) : null,
    prefix_local_tokens: boundary && count ? tokenize(prefix) : null,
    method: 'complete logical native-unit comparison; o200k-base local prefix estimate',
    residency: 'unknown; matching content and TTL do not guarantee a cache hit',
    boundary_coverage: provider.name === 'anthropic' ? 'explicit/automatic markers; lookback/minimum not certified'
      : 'message-end candidates; lookup mode/minimum/hidden framing not certified' };
}
