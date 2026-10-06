// Retrieval priority is independent of authority. These heuristics are local,
// inspectable and deliberately do not count assistant echoes as engagement.
const common = new Set(('a an and are as at be been being but by can could did do does doing for from had has have how i if in into is it its just like may me more most my not of on or our really should so some something stuff than that the their them then there these they thing things this those through to too us very was we were what when where which who why will with would you your yeah yes thanks thank please good think about also all any get got much now own only over idea ideas interesting able see guys supposed maybe idk continue inspect plan explain explore discuss discussion further').split(' '));
export const meaningfulTerms = text => new Set((String(text).toLowerCase().replaceAll('_', ' ').match(/[\p{L}\p{N}-]+/gu) || []).filter(t => t.length >= 3 && !common.has(t)));
export function relevance(content, query, semantic = 0) {
  const terms = meaningfulTerms(query), words = meaningfulTerms(content);
  const matched_terms = [...terms].filter(t => words.has(t));
  const lexical = matched_terms.length ? .5 + .5 * Math.min(1, matched_terms.length / Math.min(5, terms.size)) : 0;
  return { match: matched_terms.length, matched_terms, semantic: Math.max(0, semantic), relevance: Math.max(lexical, semantic),
    tier: matched_terms.length >= Math.min(2, Math.max(1, terms.size)) || semantic >= .45 ? 'full' : semantic >= .3 ? 'stub' : 'archive' };
}
export function substantiveDiscussion(content, kind = 'user') {
  const text = String(content).trim();
  return text.length >= (kind === 'assistant' ? 320 : 160) && meaningfulTerms(text).size >= (kind === 'assistant' ? 24 : 16);
}
export function memoryQuery(events, query) {
  if (meaningfulTerms(query).size) return String(query).slice(0, 1024);
  // Carry a substantive human topic through acknowledgments. Stop at explicit
  // topic/objective boundaries; do not learn a topic from a model's repetition.
  const users = events.filter(e => e.kind === 'user' && !e.metadata.purpose?.startsWith('manual-'));
  const latest = users.at(-1);
  for (const e of users.slice(-4).reverse()) {
    if (e.id !== latest?.id && (latest?.metadata.purpose === 'agent-objective' || e.metadata.purpose === 'agent-objective')) break;
    if (meaningfulTerms(e.content).size) return e.content.slice(0, 1024);
  }
  return String(query).slice(0, 1024);
}
export function engagementPriority(events, id, now) {
  const days = 86400000, halfLife = 30;
  return Math.min(.1, events.filter(e => e.kind === 'memory_engagement' && e.metadata.target_ids?.includes(id))
    .reduce((sum, e) => sum + .025 * 2 ** (-Math.max(0, now - Date.parse(e.timestamp)) / days / halfLife), 0));
}

// Canonical named state remains protected/editable through update_state. This
// only changes its model-facing representation. Operative state is never lost.
export function projectNamedMemory(segments, query, semanticScores = new Map(), budget = 4000) {
  const named = segments.filter(s => s.state_key), byId = new Map(named.map(s => [s.id, s]));
  const full = new Set(named.filter(s => s.pinned || s.verbatim_required || ['constraint', 'objective', 'decision'].includes(s.type)).map(s => s.id));
  const close = ids => {
    const closure = new Set(ids);
    for (const id of closure) for (const ref of Object.values(byId.get(id)?.relations || {}).flat()) if (byId.has(ref)) closure.add(ref);
    return closure;
  };
  for (const id of close(full)) full.add(id);
  let used = 0;
  const ranked = named.filter(s => !full.has(s.id)).map(s => ({ s, ...relevance(s.state_key + ' ' + s.content, query, semanticScores.get(s.id) || 0) }))
    .sort((a, b) => b.relevance - a.relevance);
  const stubs = [];
  for (const { s, tier } of ranked) {
    const cluster = [...close([s.id])].filter(id => !full.has(id));
    const bytes = cluster.reduce((n, id) => n + Buffer.byteLength(JSON.stringify(byId.get(id))), 0);
    if (tier === 'full' && used + bytes <= budget) { cluster.forEach(id => full.add(id)); used += bytes; }
    else if (tier !== 'archive' && stubs.length < 4) stubs.push({ id: s.id, state_key: s.state_key, tier: 'stub', status: s.status,
      excerpt: s.content.slice(0, 96), source_event_ids: s.source_event_ids.slice(-1), retrieval: 'retrieve_memory' });
  }
  const pointers = []; for (const s of stubs.filter(s => !full.has(s.id))) if (Buffer.byteLength(JSON.stringify([...pointers, s])) <= Math.min(1200, budget)) pointers.push(s);
  return { segments: segments.filter(s => !s.state_key || full.has(s.id)), stubs: pointers,
    archived: named.filter(s => !full.has(s.id) && !stubs.some(p => p.id === s.id)).length };
}
