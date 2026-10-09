// The event sequence is unique within an account. The first packet's title and
// sequence make a stable, readable reference without changing its canonical ID.
export const HANDOFF_REFERENCE = /^(?:conv_[a-zA-Z0-9_-]+|[a-z0-9]+(?:-[a-z0-9]+)*--[1-9][0-9]*)$/;
export function readableHandoffId(first) {
  if (first.metadata.readable_id) return first.metadata.readable_id;
  const slug = first.metadata.packet.title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 64).replace(/^-+|-+$/g, '') || 'conversation';
  return `${slug}--${first.seq}`;
}
export function referenceSequence(reference) {
  if (typeof reference !== 'string' || !HANDOFF_REFERENCE.test(reference) || reference.startsWith('conv_')) return null;
  const sequence = Number(reference.slice(reference.lastIndexOf('--') + 2));
  return Number.isSafeInteger(sequence) ? sequence : null;
}
