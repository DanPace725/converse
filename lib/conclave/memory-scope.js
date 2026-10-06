// Explicitly named projects only. Labels are data, never instructions or authority.
import { captureText } from './memory-extractor.js';
const normalized = text => text.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
export function memoryTopic(events, source) {
  let current; const known = [];
  for (const event of events) {
    if (event.seq > source.seq) break;
    if (event.kind !== 'user' || event.actor !== 'human' || event.metadata.purpose?.startsWith('manual-')) continue;
    const eligible = captureText(event.content);
    const declaration = event.content.match(/^(?:new topic[.!]\s*)?(?:we (?:are|are now)|i am) planning[^\n]*?\bcalled\s+["“]([^"”\n]+)["”]/im);
    const declarationPrefixEnd = declaration && declaration.index + declaration[0].indexOf(declaration[1]) - 1;
    if (declaration && eligible.slice(declaration.index, declarationPrefixEnd) === event.content.slice(declaration.index, declarationPrefixEnd)) {
      const name = declaration[1], key = normalized(name);
      current = known.find(t => t.key === key) || { topic_id: event.id, topic_name: name, key, alias: normalized(name.split(':')[0]) };
      if (!known.includes(current)) known.push(current);
      continue;
    }
    const returning = event.content.match(/^\s*return to\s+["“]([^"”\n]+)["”]/i);
    const scopedCorrection = event.content.match(/^\s*correction for ([^\n:]+?)(?: only)?\s*:/i);
    const returningPrefixEnd = returning && returning.index + returning[0].indexOf(returning[1]) - 1;
    const label = returning && eligible.slice(returning.index, returningPrefixEnd) === event.content.slice(returning.index, returningPrefixEnd) ? returning[1]
      : scopedCorrection && eligible.slice(scopedCorrection.index, scopedCorrection.index + scopedCorrection[0].length) === scopedCorrection[0] ? scopedCorrection[1] : null;
    if (label) {
      const key = normalized(label), matches = known.filter(t => t.key === key || t.alias === key);
      if (matches.length === 1) current = matches[0];
    }
  }
  return current ? { topic_id: current.topic_id, topic_name: current.topic_name } : {};
}

export function sameMemoryScope(record, scope) {
  return !record.scope.topic_ambiguous && record.scope.objective_id === scope.objective_id && record.scope.topic_id === scope.topic_id;
}
