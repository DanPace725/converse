// Canonical Conclave inference usage includes Anthropic cache reads/writes in
// input_tokens. Native ordinary-chat/title usage requires an explicit boundary.
const token = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
export function normalizeUsage(usage, provider, native = false) {
  if (!usage) return null;
  if (native && provider === 'gemini') {
    const input = token(usage.promptTokenCount), candidates = token(usage.candidatesTokenCount), total = token(usage.totalTokenCount), thoughts = token(usage.thoughtsTokenCount);
    const output = total != null && input != null && total >= input ? total - input : candidates != null && thoughts != null ? candidates + thoughts : null;
    return { input, output, read: token(usage.cachedContentTokenCount), write: 0, write_5m: null, write_1h: null };
  }
  const read = token(provider === 'anthropic' ? usage.cache_read_input_tokens : usage.input_tokens_details?.cached_tokens);
  const write = token(provider === 'anthropic' ? usage.cache_creation_input_tokens : usage.input_tokens_details?.cache_write_tokens);
  let input = token(usage.input_tokens), output = token(usage.output_tokens);
  if (native && provider === 'anthropic' && input != null) input += (read || 0) + (write || 0);
  return { input, output, read, write,
    write_5m: token(usage.cache_creation?.ephemeral_5m_input_tokens),
    write_1h: token(usage.cache_creation?.ephemeral_1h_input_tokens) };
}

export function priceUsage(usage, provider, model, snapshot, { native = false, tier = 'unspecified' } = {}) {
  const counts = normalizeUsage(usage, provider, native);
  const row = [...snapshot.models, ...(snapshot.management_models || [])].find(r => r.provider === provider && r.model === model);
  const reasons = [];
  if (!row?.rates || row.rates.input == null || row.rates.output == null) reasons.push('No verified rate for exact provider/model');
  if (!counts || counts.input == null || counts.output == null) reasons.push('Missing reported input/output usage');
  if (reasons.length) return { counts, model, provider, usd_min: null, usd_max: null, reasons };
  if ((counts.read || 0) + (counts.write || 0) > counts.input)
    return { counts, model, provider, usd_min: null, usd_max: null, reasons: ['Cache buckets exceed normalized input'] };
  const tiers = tier === 'long' ? [row.long_context_rates] : tier === 'short' ? [row.rates]
    : row.long_context_input_threshold != null ? [counts.input > row.long_context_input_threshold ? row.long_context_rates : row.rates]
      : [row.rates, ...(row.long_context_rates ? [row.long_context_rates] : [])];
  if (tiers.some(r => !r)) return { counts, model, provider, usd_min: null, usd_max: null, reasons: ['Requested rate tier unavailable'] };
  if (tiers.length > 1) reasons.push('Short/long tier boundary unverified; range covers both');
  if (row.long_context_pricing_status && tier !== 'short') reasons.push('Unverified long-context rates; available standard rate only');
  if (row.cache_storage_usd_per_1m_tokens_hour != null) reasons.push('Cache storage duration not exported; token valuation excludes storage');
  if (usage.toolUsePromptTokenCount > 0) reasons.push('Gemini tool-use prompt accounting requires a separate billing reconciliation');
  const read = counts.read || 0, write = counts.write || 0, rest = counts.input - read - write;
  const values = [];
  for (const rates of tiers) {
    if (read && rates.cached_input == null) return { counts, model, provider, usd_min: null, usd_max: null, reasons: ['Missing cache-read rate'] };
    const knownWrite = counts.write_5m != null && counts.write_1h != null && counts.write_5m + counts.write_1h === write;
    const writeMinRate = rates.cache_write ?? rates.input;
    const writeMaxRate = Math.max(writeMinRate, row.cache_write_1h ?? row.cache_write_1h_rate ?? writeMinRate);
    const writeMin = knownWrite ? counts.write_5m * writeMinRate + counts.write_1h * (row.cache_write_1h ?? row.cache_write_1h_rate ?? writeMinRate) : write * writeMinRate;
    const writeMax = knownWrite ? writeMin : write * writeMaxRate;
    const fixed = read * (rates.cached_input ?? rates.input) + counts.output * rates.output;
    const possible = [rates.input];
    if (counts.read == null && rates.cached_input != null) { possible.push(rates.cached_input); reasons.push('Cache-read bucket missing'); }
    if (counts.write == null && rates.cache_write != null) { possible.push(rates.cache_write); reasons.push('Cache-write bucket missing'); }
    values.push((fixed + writeMin + rest * Math.min(...possible)) / 1e6,
      (fixed + writeMax + rest * Math.max(...possible)) / 1e6);
    if (write && !knownWrite && writeMin !== writeMax) reasons.push('Cache-write TTL split missing');
  }
  return { counts, provider, model, usd_min: Math.min(...values), usd_max: Math.max(...values), reasons: [...new Set(reasons)] };
}

export function conversationCosts(record, snapshot, options = {}) {
  record = costRecord(record);
  const events = (record.context_layer || record).events || [];
  const responses = new Map(events.filter(e => e.kind === 'inference_response').map(e => [e.metadata.request_id, e]));
  const calls = events.filter(e => e.kind === 'inference_request').map(request => {
    const response = responses.get(request.id), m = request.metadata;
    const provider = m.provider || request.actor;
    const requested = m.payload?.model || m.model || null, reported = response?.metadata.model || null;
    // Returned version IDs are recorded, but never silently mapped to a rate.
    const cost = priceUsage(response?.metadata.usage, provider, requested, snapshot, { ...options, native: m.usage_native || options.native });
    if (response?.metadata.status === 'partial') cost.reasons.push('Partial response: reported usage may be incomplete');
    return { request_id: request.id, seq: request.seq, purpose: request.content, requested_model: requested,
      reported_model: reported, status: response?.metadata.status || 'missing_response',
      ...cost };
  });
  for (const event of events.filter(e => e.kind === 'conversation_title' && e.metadata.generated && !e.metadata.request_id)) {
    const m = event.metadata;
    const requested = m.provenance?.requested_model || m.requested_model || m.model;
    const matching = snapshot.models.filter(r => r.model === requested);
    const provider = m.provider || m.provenance?.provider || (matching.length === 1 ? matching[0].provider : event.actor);
    calls.push({ request_id: event.id, seq: event.seq, purpose: 'title (separately logged)', requested_model: requested,
      provider_basis: m.provider || m.provenance?.provider ? 'recorded provider' : 'inferred from exact requested model in dated catalog; title event actor is application',
      reported_model: m.provenance?.reported_model || m.model, status: 'completed', ...priceUsage(m.usage, provider, requested, snapshot, { ...options, native: true }) });
  }
  const totals = rows => ({ calls: rows.length, priced_calls: rows.filter(r => r.usd_min != null).length,
    unpriced_calls: rows.filter(r => r.usd_min == null).length,
    known_usd_min: rows.reduce((n, r) => n + (r.usd_min || 0), 0), known_usd_max: rows.reduce((n, r) => n + (r.usd_max || 0), 0) });
  const sources = events.filter(e => ['user', 'assistant', 'document', 'reasoning'].includes(e.kind));
  const segments = (record.context_layer || record).context?.segments || [];
  const history = sources.reduce((n, e) => n + e.content.length, 0), working = segments.reduce((n, s) => n + s.content.length, 0);
  return { id: record.conversation_id || record.context_layer?.conversation_id, exported_at: record.exported_at,
    price_date: snapshot.checked_date, basis: snapshot.pricing_basis, ...totals(calls), calls,
    record_format: record.cost_record_format || 'canonical context events; normalized inference usage',
    purpose: Object.fromEntries([...new Set(calls.map(c => c.purpose))].map(p => [p, totals(calls.filter(c => c.purpose === p))])),
    context: { history_characters: history, working_characters: working, reduction_fraction: history ? 1 - working / history : null,
      ...(record.cost_record_format ? { measurement_note: 'Ordinary saved transcript and attachments; no editable Conclave projection or transmitted-context reduction inferred' } : {}) },
    complete: calls.every(c => c.usd_min != null && c.usd_min === c.usd_max && !c.reasons.length) };
}

// Adapt ordinary canonical exports for analysis only. Never rewrite saved
// records or manufacture request provenance that wasn't exported.
export function costRecord(record) {
  if ((record.context_layer || record).events || !Array.isArray(record.messages)) return record;
  const events = [], segments = [];
  const providerName = value => ({ GPT: 'openai', Claude: 'anthropic', Gemini: 'gemini', gpt: 'openai', claude: 'anthropic' }[value] || value);
  const add = event => events.push({ seq: events.length + 1, ...event });
  for (const m of record.messages) {
    const id = m.message_id, provider = providerName(m.provider || m.participant_id);
    if (m.role === 'assistant') {
      const requestId = id + '-synthetic-request', model = m.invocation?.requested_model || m.model || null;
      add({ id: requestId, kind: 'inference_request', content: 'answer', actor: 'application', metadata: { provider, payload: { model }, usage_native: true, synthetic_from_message_id: id } });
      add({ id: id + '-synthetic-response', kind: 'inference_response', content: 'answer', actor: provider, metadata: { request_id: requestId, usage: m.usage, model: m.invocation?.reported_model || null, status: m.status || 'unknown' } });
    }
    add({ id, kind: m.role, actor: m.role === 'user' ? 'human' : provider, content: m.content || '', metadata: {} });
    segments.push({ content: m.content || '' });
  }
  for (const a of record.attachments || []) {
    add({ id: a.attachment_id, kind: 'document', actor: 'human', content: a.content || '', metadata: {} });
    segments.push({ content: a.content || '' });
  }
  if (record.title_generation) add({ id: record.conversation_id + '-title', kind: 'conversation_title', actor: 'application', metadata: { ...record.title_generation, generated: true } });
  return { ...record, cost_record_format: 'ordinary export: analysis-only synthetic call links; native usage', context_layer: { events, context: { segments }, conversation_id: record.conversation_id } };
}
