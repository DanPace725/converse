import { BoundedDecisionAdapter } from './decision.js';

export const SELECTOR_MODELS = { openai: 'gpt-6-luna', anthropic: 'claude-haiku-4-5' };

// Wrap the already credential-scoped provider. Only bounded selector calls may
// use the small model; ordinary answers still use the selected conversation model.
export function selectorProvider(provider) {
  const model = SELECTOR_MODELS[provider.name];
  if (!model) throw Error('No selector fallback for this provider');
  return { name: provider.name,
    ...(provider.requestPayload ? { requestPayload: payload => provider.requestPayload(payload) } : {}),
    respond(payload, options) {
    if (payload.model !== model || payload.tools?.length ||
        !Number.isSafeInteger(payload.max_output_tokens) || payload.max_output_tokens <= 0 || payload.max_output_tokens > 600 ||
        Buffer.byteLength(JSON.stringify(payload)) + payload.max_output_tokens > 12000)
      throw Error('Selector fallback accepts only bounded selector requests.');
    return provider.respond(payload, options);
  } };
}

export const selectorDecisionAdapter = provider => new BoundedDecisionAdapter(selectorProvider(provider), { model: SELECTOR_MODELS[provider.name] });
