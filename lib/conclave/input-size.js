import { createHash } from 'node:crypto';
import { countTokens } from 'gpt-tokenizer/encoding/o200k_base';
const counts = new Map();
export function tokenize(text) {
  // Treat literal special-token spellings in user documents as ordinary text.
  return countTokens(text, { disallowedSpecial: new Set() });
}
// Exact encoding count on serialized text; native provider framing remains an
// estimate. Claude and unknown GPT models use this as a generic fallback.
export function inputSize(payload, provider, events = []) {
  const native = provider.requestPayload ? provider.requestPayload(payload) : payload;
  const { max_tokens, max_output_tokens, stream, store, include, ...input } = native;
  const serialized = JSON.stringify(input);
  const fingerprint = createHash('sha256').update(provider.name + ':' + serialized).digest('hex');
  if (!counts.has(fingerprint)) {
    if (counts.size >= 128) counts.delete(counts.keys().next().value);
    counts.set(fingerprint, tokenize(serialized));
  }
  const local = counts.get(fingerprint);
  const measured = events.findLast(e => e.kind === 'token_count' && e.metadata.fingerprint === fingerprint && e.metadata.provider_count != null);
  return { bytes: Buffer.byteLength(serialized), estimated_tokens: measured?.metadata.provider_count ?? local,
    tokenizer_tokens: local, encoding: 'o200k_base',
    method: measured?.metadata.method || 'local-o200k_base-serialized-input',
    scope: measured?.metadata.scope || 'complete serialized native input; local framing estimate', fingerprint,
    provider_count: measured?.metadata.provider_count ?? null,
    measured_at: measured?.metadata.measured_at || null,
    provider: provider.name, model: payload.model, calibration_request_id: null };
}

export async function countInput(payload, provider) {
  const local = inputSize(payload, provider);
  if (!provider.countTokens) return { ...local, error: 'Provider token counting is unavailable; local tokenizer estimate.' };
  try {
    const result = await provider.countTokens(payload);
    if (!Number.isSafeInteger(result.input_tokens) || result.input_tokens < 0) throw Error('Invalid provider token count');
    return { ...local, provider_count: result.input_tokens, estimated_tokens: result.input_tokens,
      method: provider.name === 'anthropic' ? 'anthropic-preflight-estimate' : 'openai-input-token-count',
      scope: 'provider preflight native input; not billed usage', measured_at: new Date().toISOString() };
  } catch {
    return { ...local, error: 'Provider token count failed; local tokenizer estimate.' };
  }
}
