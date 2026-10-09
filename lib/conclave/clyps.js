import { createHash } from 'node:crypto';
import { countTokens } from 'gpt-tokenizer/encoding/o200k_base';

export const CLAMP_VERSION = '1.0';
export const CLYP_TOKEN_LIMIT = 1500;
export const CLYP_RELATIONS = ['continues', 'depends_on', 'supports', 'conflicts_with', 'supersedes'];
const fail = (message, code = 'invalid_input') => { throw Object.assign(Error(message), { code }); };
const object = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key)))
    fail('Invalid CLAMP fields');
};

// This is Conclave's initial CLAMP profile, not a claim of external standardization.
export function validateClyp(packet, input) {
  object(input, ['version', 'kind', 'links']);
  if (input.version !== CLAMP_VERSION || input.kind !== 'clyp') fail('Use CLAMP version 1.0 and kind clyp');
  if (!packet.objective.trim() || !packet.next_steps.length) fail('A Clyp needs an objective and at least one next action');
  for (const key of ['decisions', 'constraints', 'open_questions', 'next_steps', 'references'])
    if (packet[key].length > 8) fail(`A Clyp allows at most 8 ${key}; narrow its scope without dropping essential constraints`);
  const links = input.links ?? [];
  if (!Array.isArray(links) || links.length > 6) fail('A Clyp allows at most 6 explicit links');
  const seen = new Set();
  const normalized = links.map(link => {
    object(link, ['relation', 'handoff_id', 'revision']);
    if (!CLYP_RELATIONS.includes(link.relation) || typeof link.handoff_id !== 'string'
      || !/^conv_[a-zA-Z0-9_-]+$/.test(link.handoff_id) || !Number.isSafeInteger(link.revision) || link.revision < 1)
      fail('Clyp links need an approved relation, handoff ID and positive pinned revision');
    const value = { relation: link.relation, handoff_id: link.handoff_id, revision: link.revision };
    const key = JSON.stringify(value);
    if (seen.has(key)) fail('Duplicate Clyp link');
    seen.add(key); return value;
  });
  return { version: CLAMP_VERSION, kind: 'clyp', links: normalized };
}

// JSON flow values are valid YAML. No free-form YAML from a model is executed.
// The original packet text survives in the Markdown body; the database packet is
// its structured index, generated in the same transaction as the ORMD revision.
export function renderClyp(packet, { handoff_id, revision, previous_event_id = null }) {
  const frontmatter = {
    title: packet.title, frame: 'conclave.clamp.clyp',
    lineage: { origin: { uri: `urn:conclave:${handoff_id}`, revision }, previous_event_id },
    policy: { read: [{ roles: ['account_owner'] }] },
    semantics: { links: packet.clamp.links.map((link, i) => ({ id: `link-${i + 1}`, rel: link.relation,
      to: `urn:conclave:${link.handoff_id}:revision:${link.revision}` })) },
    resolution: { status: 'reported', confidence: null },
    clamp: { version: CLAMP_VERSION, kind: 'clyp', max_tokens: CLYP_TOKEN_LIMIT, encoding: 'o200k_base' },
    source: { app: packet.source_app || null, model: packet.source_model || null },
    ...(packet.project ? { project: packet.project } : {}),
  };
  const sections = [['Current state', packet.summary], ['Objective', packet.objective], ['Decisions', packet.decisions],
    ['Constraints', packet.constraints], ['Open questions', packet.open_questions], ['Next actions', packet.next_steps],
    ['Context', packet.context], ['References', packet.references.map(r => r.url ? `${r.label} — ${r.url}` : r.label)]];
  const body = sections.filter(([, value]) => Array.isArray(value) ? value.length : value)
    .map(([name, value]) => `## ${name}\n\n${Array.isArray(value) ? value.map(item => `- ${item}`).join('\n') : value}`);
  return `<!-- ormd:1.0 -->\n---\n${Object.entries(frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n\n# ${packet.title.replace(/\r?\n/g, ' ')}\n\n${body.join('\n\n')}\n`;
}

export function clypBudget(ormd) {
  const tokens = countTokens(ormd, { disallowedSpecial: new Set() });
  return { tokens, max_tokens: CLYP_TOKEN_LIMIT, encoding: 'o200k_base', bytes: Buffer.byteLength(ormd),
    scope: 'complete ORMD document; provider framing and linked documents excluded' };
}
export function assertClypBudget(ormd) {
  const budget = clypBudget(ormd);
  if (budget.tokens > CLYP_TOKEN_LIMIT) fail(`Clyp is ${budget.tokens} tokens; maximum ${CLYP_TOKEN_LIMIT}. Narrow the scope or link supporting material; no text was shortened.`, 'capacity');
  return budget;
}
export const documentHash = ormd => createHash('sha256').update(ormd).digest('hex');
