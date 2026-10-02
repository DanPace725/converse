// Context means the complete model input, including instructions and tools.
// Estimates are calibrated to observed usage for the same provider/model; they
// are explicitly distinct from provider-reported counts and transport bytes.
export function inputSize(payload, provider, events = []) {
  const native = provider.requestPayload ? provider.requestPayload(payload) : payload;
  const { max_tokens, max_output_tokens, stream, store, include, ...input } = native;
  const bytes = Buffer.byteLength(JSON.stringify(input), 'utf8');
  const requests = new Map(events.filter(e => e.kind === 'inference_request').map(e => [e.id, e]));
  const prior = events.findLast(e => {
    const r = requests.get(e.metadata.request_id);
    return e.kind === 'inference_response' && e.content === 'answer'
      && r?.metadata.provider === provider.name && r.metadata.payload?.model === payload.model
      && Number.isSafeInteger(e.metadata.usage?.input_tokens);
  });
  const request = prior && requests.get(prior.metadata.request_id);
  const priorBytes = request?.metadata.input_size?.bytes;
  const legacy = request && (request.metadata.provider_payload || request.metadata.payload);
  const measured = priorBytes || (legacy && (() => {
    const { max_tokens, max_output_tokens, stream, store, include, ...rest } = legacy;
    return Buffer.byteLength(JSON.stringify(rest), 'utf8');
  })());
  const ratio = measured ? prior.metadata.usage.input_tokens / measured : 1 / 3;
  return { bytes, estimated_tokens: Math.ceil(bytes * ratio),
    method: measured ? 'calibrated-full-input' : 'full-input-bytes-divided-by-3',
    calibration_request_id: request?.id || null };
}
