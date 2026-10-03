import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { id } from './store.js';
import { removedSources } from './documents.js';

export const CLP_VERSION = 'clp-broker-v1';
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
function jsonValue(value, depth = 0) {
  if (depth > 32) throw Error('Content nesting exceeds 32 levels');
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) { for (const item of value) jsonValue(item, depth + 1); return; }
  if (object(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    for (const item of Object.values(value)) jsonValue(item, depth + 1);
    return;
  }
  throw Error('Content must contain only JSON values');
}
function fields(value, allowed, label) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) throw Error(`Invalid ${label} fields`);
}
function text(value, label, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error(`Invalid ${label}`);
  return value;
}
function strings(value, label, max = 32) {
  if (!Array.isArray(value) || value.length > max || value.some(item => typeof item !== 'string' || !item.trim())) throw Error(`Invalid ${label}`);
  return [...new Set(value)];
}
function floor(value = {}) {
  fields(value, ['min_support', 'confidence', 'min_separation'], 'resolution');
  const result = { min_support: 1, confidence: 0, min_separation: 0, ...value };
  if (!Number.isInteger(result.min_support) || result.min_support < 0 || result.min_support > 100) throw Error('Invalid min_support');
  for (const key of ['confidence', 'min_separation'])
    if (typeof result[key] !== 'number' || !Number.isFinite(result[key]) || result[key] < 0 || result[key] > 1) throw Error(`Invalid ${key}`);
  return result;
}
const envelope = (store, conversation, kind, value) => {
  store.requireConversation(conversation);
  const event = store.append(conversation, kind, JSON.stringify(value), { clp_version: CLP_VERSION, value }, 'human');
  return { ...value, event_id: event.id, recorded_at: event.timestamp };
};
const records = (store, conversation, kind) => {
  store.requireConversation(conversation);
  return store.events(conversation).filter(event => event.kind === kind).map(event => ({
    ...event.metadata.value, event_id: event.id, recorded_at: event.timestamp,
  }));
};
export const listFrames = (store, conversation) => records(store, conversation, 'clp_frame');

export function registerFrame(store, conversation, input) {
  fields(input, ['name', 'version', 'required_fields', 'validators', 'defaults'], 'frame');
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(text(input.name, 'frame name', 80))) throw Error('Invalid frame name');
  if (!/^\d+\.\d+(\.\d+)?$/.test(text(input.version, 'frame version', 30))) throw Error('Invalid frame version');
  const required = strings(input.required_fields || [], 'required_fields');
  if (required.some(field => !/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(field))) throw Error('Invalid required field');
  const validators = input.validators || [];
  if (!Array.isArray(validators) || validators.length > 32) throw Error('Invalid validators');
  for (const validator of validators) {
    fields(validator, ['field', 'rule', 'args'], 'validator');
    if (!required.includes(validator.field)) throw Error('Validator must name a required field');
    if (validator.rule === 'one_of') {
      if (!Array.isArray(validator.args) || !validator.args.length || validator.args.length > 32
        || validator.args.some(item => !['string', 'number', 'boolean'].includes(typeof item) || typeof item === 'number' && !Number.isFinite(item))) throw Error('Invalid one_of arguments');
    } else if (validator.rule === 'type') {
      if (!['string', 'number', 'boolean', 'object', 'array'].includes(validator.args)) throw Error('Invalid type argument');
    } else throw Error('Unsupported frame validator');
  }
  fields(input.defaults || {}, ['resolution'], 'frame defaults');
  const value = { name: input.name, version: input.version, required_fields: required, validators,
    defaults: { resolution: floor(input.defaults?.resolution) } };
  if (listFrames(store, conversation).some(frame => frame.name === value.name && frame.version === value.version)) throw Error('Frame version is immutable; register a new version');
  return envelope(store, conversation, 'clp_frame', value);
}

// A domain is a conservative grouping key, not proof of editorial independence.
// Grouping the final two labels also collapses multi-label public suffixes; this
// can undercount sources but does not grant independence to sibling subdomains.
function originDomain(uri) {
  let url;
  try { url = new URL(uri); } catch { throw Error('Origin must be an HTTP(S) URL'); }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || isIP(host) || !host.includes('.')) throw Error('Origin must name an HTTP(S) domain');
  return host.split('.').slice(-2).join('.');
}
export function attestSource(store, conversation, input) {
  fields(input, ['source_event_id', 'origin_uri', 'parents'], 'attestation');
  const source = store.source(conversation, input.source_event_id);
  if (!['document', 'user'].includes(source.kind) || source.kind === 'user' && source.actor !== 'human') throw Error('Only original documents or human reports can be attested');
  originDomain(text(input.origin_uri, 'origin_uri', 2048));
  const parents = strings(input.parents || [], 'parents').map(parent => store.source(conversation, parent));
  if (parents.some(parent => parent.seq >= source.seq)) throw Error('Lineage parents must precede the source');
  if (records(store, conversation, 'clp_attestation').some(record => record.source_event_id === source.id)) throw Error('Source attestation is immutable');
  if (source.metadata.source_url && source.metadata.source_url !== input.origin_uri) throw Error('Attestation cannot replace a retrieved origin');
  return envelope(store, conversation, 'clp_attestation', { source_event_id: source.id, origin_uri: input.origin_uri,
    parents: parents.map(parent => parent.id), verification: 'declared provenance; not independently verified' });
}

export function recordBundle(store, conversation, input) {
  fields(input, ['frame', 'frame_version', 'content', 'source_event_ids', 'resolution'], 'bundle');
  const frame = listFrames(store, conversation).find(frame => frame.name === input.frame && frame.version === input.frame_version);
  if (!frame) throw Error('Register the exact frame version before recording a bundle');
  jsonValue(input.content);
  if (!object(input.content) || Buffer.byteLength(JSON.stringify(input.content)) > 8000) throw Error('Bundle content must be a JSON object up to 8000 bytes');
  for (const field of frame.required_fields) if (!Object.hasOwn(input.content, field) || input.content[field] === null) throw Error(`Missing required field: ${field}`);
  for (const { field, rule, args } of frame.validators) {
    const value = input.content[field];
    const type = Array.isArray(value) ? 'array' : typeof value;
    if (rule === 'one_of' ? !args.includes(value) : type !== args) throw Error(`Frame validation failed: ${field}`);
  }
  const sources = strings(input.source_event_ids || [], 'source_event_ids').map(source => store.source(conversation, source).id);
  // A record can strengthen a frame's floors, never weaken them.
  floor(input.resolution);
  const resolution = Object.fromEntries(Object.entries(frame.defaults.resolution).map(([key, value]) => [key, Math.max(value, input.resolution?.[key] ?? 0)]));
  return envelope(store, conversation, 'clp_bundle', { id: id('clp'), frame: frame.name, frame_version: frame.version,
    frame_event_id: frame.event_id, content: input.content, source_event_ids: sources, resolution,
    content_hash: createHash('sha256').update(JSON.stringify(input.content)).digest('hex') });
}
export function readBundle(store, conversation, bundleId) {
  const bundle = records(store, conversation, 'clp_bundle').find(bundle => bundle.id === bundleId);
  if (!bundle) throw Error('Unknown CLP bundle');
  return bundle;
}
export function linkBundles(store, conversation, input) {
  fields(input, ['from', 'to', 'relation'], 'link');
  const from = readBundle(store, conversation, input.from), to = readBundle(store, conversation, input.to);
  if (from.id === to.id || !['supports', 'refutes', 'supersedes'].includes(input.relation)) throw Error('Invalid CLP relation');
  const links = records(store, conversation, 'clp_link');
  if (links.some(link => link.from === from.id && link.to === to.id && link.relation === input.relation)) throw Error('CLP link already exists');
  if (input.relation === 'supersedes') {
    const bundles = records(store, conversation, 'clp_bundle');
    if (bundles.findIndex(bundle => bundle.id === from.id) <= bundles.findIndex(bundle => bundle.id === to.id)) throw Error('Supersession must point to an earlier bundle');
  }
  return envelope(store, conversation, 'clp_link', { from: from.id, to: to.id, relation: input.relation });
}

function provenance(events, attestations) {
  const byId = new Map(events.map(event => [event.id, event]));
  const declared = new Map(attestations.map(record => [record.source_event_id, record]));
  const inactive = removedSources(events), latestPath = new Map();
  for (const event of events) {
    if (event.metadata.revises_event_id) inactive.add(event.metadata.revises_event_id);
    if (event.kind === 'document' && event.metadata.workspace_path) {
      const old = latestPath.get(event.metadata.workspace_path);
      if (old) inactive.add(old);
      latestPath.set(event.metadata.workspace_path, event.id);
    }
  }
  const cache = new Map();
  function source(eventId, visiting = new Set()) {
    if (cache.has(eventId)) return cache.get(eventId);
    if (visiting.has(eventId) || visiting.size >= 64) return { roots: [], unavailable: [eventId], trace: [eventId] };
    const event = byId.get(eventId), attestation = declared.get(eventId);
    if (!event || inactive.has(eventId)) return { roots: [], unavailable: [eventId], trace: [eventId] };
    const parents = [...new Set([...(attestation?.parents || []), ...(event.metadata.source_event_ids || []),
      event.metadata.copied_from_source_event_id].filter(Boolean))];
    let result;
    if (parents.length) {
      const ancestry = parents.map(parent => source(parent, new Set([...visiting, eventId])));
      result = { roots: ancestry.flatMap(item => item.roots), unavailable: ancestry.flatMap(item => item.unavailable), trace: ancestry.flatMap(item => item.trace) };
    } else {
      const uri = event.metadata.source_url || attestation?.origin_uri;
      const derived = ['assistant', 'reasoning'].includes(event.kind) || ['search-summary', 'search-snippet'].includes(event.metadata.evidence_scope)
        || event.metadata.workspace_operation && event.actor !== 'human';
      let domain = null;
      if (uri) { try { domain = originDomain(uri); } catch { /* Unknown origins grant no independence. */ } }
      result = { roots: !derived && domain ? [{ event_id: event.id, domain,
        content_hash: createHash('sha256').update(event.content.trim()).digest('hex') }] : [], unavailable: [], trace: [] };
    }
    result.trace = [...new Set([eventId, ...(attestation ? [attestation.event_id] : []), ...result.trace])];
    cache.set(eventId, result);
    return result;
  }
  return source;
}

// Connected components prevent a copied item bridging two domains from being
// counted twice. Shared original event, publisher domain OR exact text joins them.
function independentGroups(roots) {
  const groups = [];
  for (const root of roots) {
    const matches = groups.filter(group => group.some(other => other.event_id === root.event_id || other.domain === root.domain || other.content_hash === root.content_hash));
    const joined = [...matches.flat(), root];
    for (const match of matches) groups.splice(groups.indexOf(match), 1);
    groups.push(joined);
  }
  return groups.map(group => ({ domains: [...new Set(group.map(root => root.domain))].sort(),
    event_ids: [...new Set(group.map(root => root.event_id))].sort() })).sort((a, b) => a.event_ids[0].localeCompare(b.event_ids[0]));
}

export function queryBundles(store, conversation, input) {
  fields(input, ['intent', 'frame', 'filters', 'resolution', 'attention_budget', 'evidence', 'limit', 'offset'], 'CLP query');
  const frames = strings(input.frame, 'query frames', 16);
  if (!frames.length) throw Error('Specify at least one query frame');
  if (input.intent !== undefined) text(input.intent, 'intent', 500);
  if (!['low', 'medium', 'high'].includes(input.attention_budget || 'low')) throw Error('Invalid attention budget');
  if (input.evidence !== undefined && strings(input.evidence, 'evidence', 2).some(item => !['symbolic', 'lineage'].includes(item))) throw Error('Only symbolic and lineage evidence are available');
  fields(input.filters || {}, ['keyword', 'date_gte'], 'query filter');
  const keyword = input.filters?.keyword === undefined ? null : text(input.filters.keyword, 'keyword', 200).toLowerCase();
  const date = input.filters?.date_gte;
  if (date !== undefined && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}(T.*Z)?$/.test(date) || !Number.isFinite(Date.parse(date)))) throw Error('Invalid date_gte');
  floor(input.resolution);
  const limit = input.limit ?? 20, offset = input.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isSafeInteger(offset) || offset < 0) throw Error('Invalid CLP page');
  const allFrames = listFrames(store, conversation);
  if (frames.some(name => !allFrames.some(frame => frame.name === name))) throw Error('Unknown query frame');
  const events = store.events(conversation), source = provenance(events, records(store, conversation, 'clp_attestation'));
  const bundles = records(store, conversation, 'clp_bundle'), byId = new Map(bundles.map(bundle => [bundle.id, bundle]));
  const links = records(store, conversation, 'clp_link');
  const superseded = new Set(links.filter(link => link.relation === 'supersedes').map(link => link.to));
  const eligible = bundle => !superseded.has(bundle.id) && !bundle.source_event_ids.some(eventId => source(eventId).unavailable.length);
  const refutations = bundle => links.filter(link => link.to === bundle.id && link.relation === 'refutes' && eligible(byId.get(link.from))
    && byId.get(link.from).source_event_ids.some(eventId => source(eventId).roots.length));
  const admissibleSupport = bundle => eligible(bundle) && !refutations(bundle).length && bundle.resolution.confidence === 0
    && bundle.resolution.min_separation === 0 && independentGroups(bundle.source_event_ids.flatMap(eventId => source(eventId).roots)).length >= bundle.resolution.min_support;
  const candidates = bundles.filter(bundle => frames.includes(bundle.frame) && !superseded.has(bundle.id)
    && (!keyword || JSON.stringify(bundle.content).toLowerCase().includes(keyword)) && (!date || Date.parse(bundle.recorded_at) >= Date.parse(date)));
  const page = candidates.slice(offset, offset + limit), rows = [], explain = [], unresolved = [];
  for (const bundle of page) {
    const supports = links.filter(link => link.to === bundle.id && link.relation === 'supports' && admissibleSupport(byId.get(link.from)));
    const refutes = refutations(bundle);
    const sourceIds = [...new Set([...bundle.source_event_ids, ...supports.flatMap(link => byId.get(link.from).source_event_ids)])];
    const roots = sourceIds.flatMap(eventId => source(eventId).roots), groups = independentGroups(roots);
    const resolution = Object.fromEntries(Object.entries(bundle.resolution).map(([key, value]) => [key, Math.max(value, input.resolution?.[key] ?? 0)]));
    const reasons = [];
    if (!eligible(bundle)) reasons.push('source unavailable, superseded, or lineage limit reached');
    if (groups.length < resolution.min_support) reasons.push(`support<${resolution.min_support} (${groups.length})`);
    if (refutes.length) reasons.push(`refuted (${refutes.length})`);
    if (resolution.confidence > 0) reasons.push('confidence unmeasured');
    if (resolution.min_separation > 0) reasons.push('separation unmeasured');
    const evidence = { support_count: groups.length, diversity: groups.length, confidence: null, separation: null,
      source_event_ids: sourceIds, original_event_ids: [...new Set(roots.map(root => root.event_id))].sort(), independent_groups: groups,
      support_link_ids: supports.map(link => link.event_id), refute_link_ids: refutes.map(link => link.event_id),
      provenance_note: 'Declared/retrieved provenance and conservative domain/text grouping; not verification of truth or independence.' };
    const explanation = { row_id: bundle.id, frame_version: bundle.frame_version, frame_event_id: bundle.frame_event_id,
      event_ids: [...new Set([bundle.event_id, bundle.frame_event_id, ...sourceIds, ...evidence.original_event_ids,
        ...evidence.support_link_ids, ...evidence.refute_link_ids, ...refutes.flatMap(link => [byId.get(link.from).event_id, ...byId.get(link.from).source_event_ids]),
        ...supports.map(link => byId.get(link.from).event_id),
        ...[...sourceIds, ...refutes.flatMap(link => byId.get(link.from).source_event_ids)].flatMap(eventId => source(eventId).trace)])],
      why: ['filter.frame', ...(keyword ? ['filter.keyword'] : []), `supports.depth=1; ${reasons.length ? reasons.join('; ') : 'resolution.met'}`],
      evidence, resolution_status: reasons.length ? 'unresolved' : 'met' };
    // Low attention always has at most three explanation lines, including a date filter.
    if (date) explanation.why[0] += '; filter.date_gte';
    if (reasons.length) unresolved.push({ key: bundle.id, frame: bundle.frame, reason: reasons.join('; '), explain: explanation });
    else { rows.push(bundle); explain.push(explanation); }
  }
  return { version: CLP_VERSION, rows, explain, telemetry: { unresolved_clusters: unresolved, attention_budget: input.attention_budget || 'low',
    considered: page.length, matching: candidates.length, confidence: 'unmeasured', separation: 'unmeasured' },
    next_offset: offset + page.length < candidates.length ? offset + page.length : null };
}
