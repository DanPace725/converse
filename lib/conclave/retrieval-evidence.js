// Center bounded judgments on matching evidence, rather than the beginning of
// a 1,600-character chunk. Metadata is attribution, never extra authority.
const stop = new Set('a an and are as at be by for from in is it of on or that the this to was with'.split(' '));
export const queryTerms = query => [...new Set((String(query).toLowerCase().match(/[\p{L}\p{N}_-]+/gu) || []).filter(t => !stop.has(t)))].slice(0, 24);
export function matchingWindow(content, query, length = 800) {
  const lower = content.toLowerCase(), terms = queryTerms(query);
  const starts = [0, ...terms.flatMap(t => [...lower.matchAll(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))].slice(0, 32).map(m => Math.max(0, m.index - 100)))];
  let start = 0, score = -1;
  for (const offset of starts) {
    const part = lower.slice(offset, offset + length), hits = terms.filter(t => part.includes(t)).length;
    if (hits > score) { score = hits; start = offset; }
  }
  return { offset: start, content: content.slice(start, start + length) };
}
export function retrievalCandidate(chunk, event, sourceRef, query) {
  const window = matchingWindow(chunk.content, query);
  return { id: chunk.event_id, kind: chunk.kind, excerpt: window.content,
    source: { sourceRef, title: String(event.metadata.title || event.metadata.filename || event.metadata.workspace_path || '').slice(0, 180),
      url: String(event.metadata.url || '').slice(0, 300), offset: chunk.offset + window.offset,
      end_offset: chunk.offset + window.offset + window.content.length, scope: 'partial source text; relevance is not truth' } };
}
export function similarQueries(a, b) {
  const x = queryTerms(a), y = queryTerms(b), union = new Set([...x, ...y]);
  return union.size > 0 && x.filter(t => y.includes(t)).length / union.size >= 0.6;
}
