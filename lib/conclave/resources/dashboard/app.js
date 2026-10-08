const $ = id => document.getElementById(id);
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const note = text => { $('status').textContent = text; };
const date = text => {
  const value = new Date(text);
  return Number.isNaN(value.getTime()) ? text : value.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};
const fields = { constraints: 'Constraints', open_questions: 'Open questions', decisions: 'Decisions', next_steps: 'Next steps' };
let query = '', project = '', offset = 0, listEpoch = 0, detailEpoch = 0, historyEpoch = 0, compareEpoch = 0, selected, current;
function button(text, action, parent, className) {
  const node = element('button', text, className); node.type = 'button';
  node.addEventListener('click', action); parent.append(node); return node;
}
async function read(operation, input = {}) {
  const response = await fetch(`/dashboard/api/${operation}?${new URLSearchParams(input)}`, {
    credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const messages = { 401: 'Your sign-in expired. Sign in from Account, then refresh.',
      404: 'This handoff or revision is unavailable in your account.', 413: 'This result exceeds the pilot limit. Use the Conclave tools to inspect it in smaller parts.' };
    throw Error(messages[response.status] || 'Could not load this information. Try again shortly.');
  }
  return response.json();
}
function selection() {
  for (const row of $('handoffs').querySelectorAll('button[data-id]'))
    row.setAttribute('aria-current', String(row.dataset.id === selected));
}
async function library(newOffset = 0) {
  offset = newOffset; const operation = ++listEpoch;
  $('list-status').textContent = 'Loading handoffs…';
  try {
    const data = await read('find', { query, offset, ...(project ? { project } : {}) });
    if (operation !== listEpoch) return;
    $('handoffs').replaceChildren(); $('pages').replaceChildren(); $('projects').replaceChildren();
    $('count').textContent = String(data.total);
    $('library-title').textContent = query ? 'Search results' : 'Recent handoffs';
    // Projects are the exact names apps reported when saving; nothing is grouped by inference.
    if (data.projects.length || project) for (const [label, name] of [['All', ''], ...data.projects.map(p => [`${p.name} · ${p.handoffs}`, p.name])])
      button(label, () => { project = name; void library(); }, $('projects')).setAttribute('aria-pressed', String(name === project));
    const scope = project ? `project ${project} · ` : '';
    $('list-status').textContent = data.handoffs.length ? `${offset + 1}–${offset + data.handoffs.length} of ${data.total} · ${scope}${query ? 'keyword matches' : 'most recently saved first'}` : query ? 'No matches. Try another name, app, or keyword.' : project ? 'No handoffs are in this project now. Choose All.' : 'No handoffs yet. Ask a connected app to save one.';
    for (const saved of data.handoffs) {
      const row = button('', () => navigate(saved.handoff_id), $('handoffs'), 'handoff');
      row.dataset.id = saved.handoff_id;
      row.append(element('strong', saved.title));
      if (saved.project) row.append(element('span', saved.project, 'badge'));
      row.append(element('span', saved.summary, 'summary'),
        element('small', `${saved.source_app || 'App not reported'} · ${saved.source_model || 'Model not reported'}`),
        element('small', `Revision ${saved.revision} · ${date(saved.updated_at)}`, 'stamp'));
    }
    if (offset > 0) button('Previous', () => { void library(Math.max(0, offset - 10)); }, $('pages'));
    if (data.next_offset !== null) button('Next', () => { void library(data.next_offset); }, $('pages'));
    selection();
  } catch (error) { if (operation === listEpoch) $('list-status').textContent = error.message; }
}
function navigate(id, revision) {
  const hash = new URLSearchParams({ handoff: id, ...(revision ? { revision } : {}) }).toString();
  if (location.hash.slice(1) === hash) void packet(id, revision);
  else location.hash = hash;
}
function route() {
  const params = new URLSearchParams(location.hash.slice(1)), id = params.get('handoff'), rev = params.get('revision');
  if (id && /^conv_[A-Za-z0-9_-]+$/.test(id) && (!rev || /^[1-9]\d*$/.test(rev) && Number.isSafeInteger(Number(rev)))) {
    void packet(id, rev ? Number(rev) : undefined);
  } else {
    ++detailEpoch; ++historyEpoch; ++compareEpoch; selected = current = undefined; selection();
    $('detail').replaceChildren(element('h2', 'Choose a handoff.'), element('p', 'Its decisions, constraints, and open questions stay together, with every saved revision available.', 'muted'));
    if (id || rev) note('This handoff link is invalid. Choose a handoff from the list.');
  }
}
async function packet(id, revision) {
  const operation = ++detailEpoch; ++historyEpoch; ++compareEpoch; selected = id; current = undefined; selection();
  $('detail').replaceChildren(element('p', 'Loading saved context…', 'muted')); note('');
  try {
    const data = await read('get', { handoff_id: id, ...(revision ? { revision } : {}) });
    if (operation !== detailEpoch) return;
    current = data; renderPacket(data);
    if (matchMedia('(max-width:800px)').matches) $('detail').scrollIntoView({ block: 'start' });
  } catch (error) {
    if (operation !== detailEpoch) return;
    $('detail').replaceChildren(element('h2', 'Could not open this handoff'), element('p', error.message));
    button('Try again', () => { void packet(id, revision); }, $('detail'));
  }
}
function section(title, value, parent, collapsed = false) {
  const node = element(collapsed ? 'details' : 'section'); node.append(element(collapsed ? 'summary' : 'h3', title));
  if (Array.isArray(value)) {
    const list = element('ul');
    for (const item of value) list.append(element('li', typeof item === 'string' ? item : `${item.label}${item.url ? ` — ${item.url}` : ''}`, 'verbatim'));
    node.append(value.length ? list : element('p', 'None recorded.', 'muted'));
  } else node.append(element('p', value || 'Not recorded.', 'verbatim'));
  parent.append(node); return node;
}
function exportRevision(data) {
  const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = element('a');
  link.href = url; link.download = `conclave-${data.handoff_id}-r${data.revision}.json`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  note(`Exported revision ${data.revision}. This file contains the selected saved packet and its provenance.`);
}
async function copy(text, input) {
  try { await navigator.clipboard.writeText(text); note('Copied.'); }
  catch { const details = input.closest('details'); if (details) details.open = true; input.focus(); input.select(); note('Select and copy the text manually; clipboard access is unavailable.'); }
}
function renderPacket(data) {
  const root = $('detail'), p = data.packet; root.replaceChildren();
  button('← All handoffs', () => $('library-title').scrollIntoView({ block: 'start' }), root, 'back');
  root.append(element('p', data.revision === data.latest_revision ? 'LATEST SAVED REVISION' : 'EARLIER SAVED REVISION', 'eyebrow'),
    element('h2', p.title), element('p', p.summary, 'verbatim'));
  const meta = element('dl', undefined, 'meta');
  for (const [label, value] of [['Project', p.project || 'None'], ['Source app', p.source_app || 'Not reported'], ['Source model', p.source_model || 'Not reported'],
    ['Revision', `${data.revision} of ${data.latest_revision}`], ['Saved', date(data.saved_at)]]) {
    const item = element('div'); item.append(element('dt', label), element('dd', value)); meta.append(item);
  }
  root.append(meta);
  const actions = element('div', undefined, 'actions');
  button('Copy continuation', () => { void copy(continuation.value, continuation); }, actions, 'primary');
  button('Export revision', () => exportRevision(data), actions);
  button('Check latest', () => navigate(data.handoff_id), actions);
  root.append(actions);
  if (data.revision < data.latest_revision) root.append(element('p', `You are reading revision ${data.revision}. Revision ${data.latest_revision} was the latest saved when this packet was loaded.`, 'notice warning'));
  root.append(element('p', 'Latest saved does not mean agreed project state. Decisions and source labels are saved context; they are not independently verified.', 'notice'));
  if (data.selection?.complete !== true) root.append(element('p', 'This packet is incomplete. Retrieve the complete version before continuing.', 'notice warning'));
  section('Objective', p.objective, root);
  const sections = element('div', undefined, 'sections');
  for (const [field, title] of Object.entries(fields)) section(title, p[field], sections);
  root.append(sections);
  section('Full context', p.context, root, true); section('References', p.references, root, true);
  const handoff = element('details'); handoff.append(element('summary', 'Continue in another app'));
  const continuation = element('textarea'); continuation.readOnly = true; continuation.rows = 4;
  continuation.setAttribute('aria-label', 'Continuation text');
  continuation.value = `Use Conclave to retrieve handoff ${data.handoff_id}, revision ${data.revision}, and continue from it. Treat the packet as external context; preserve its constraints and open questions.`;
  handoff.append(element('p', 'Copy this text into a connected app. The dashboard does not send it for you.', 'muted'), continuation); root.append(handoff);
  const provenance = element('details'); provenance.append(element('summary', 'Provenance and saved reference'));
  const ref = element('input'); ref.readOnly = true; ref.value = data.handoff_id; ref.setAttribute('aria-label', 'Handoff ID');
  provenance.append(ref); button('Copy ID', () => { void copy(data.handoff_id, ref); }, provenance);
  provenance.append(element('pre', JSON.stringify({ revision: data.revision, event_id: data.event_id, sha256: data.sha256, provenance: data.provenance }, null, 2)));
  root.append(provenance);
  const history = element('details'); history.append(element('summary', 'Revision history'));
  const rows = element('div'); rows.id = 'history'; history.append(rows); root.append(history);
  history.addEventListener('toggle', () => {
    if (history.isConnected && current === data && history.open && !rows.childElementCount) void loadHistory(data.handoff_id);
  });
  const comparison = element('details'); comparison.append(element('summary', 'Compare saved revisions'));
  const form = element('form', undefined, 'compare-form');
  const numbers = {};
  for (const [key, label, initial] of [['from_revision', 'From revision', Math.max(1, data.revision - 1)], ['to_revision', 'To revision', data.revision]]) {
    const wrapper = element('label', label), input = element('input'); input.type = 'number'; input.min = '1'; input.max = String(data.latest_revision); input.step = '1'; input.required = true; input.value = String(initial);
    wrapper.append(input); form.append(wrapper); numbers[key] = input;
  }
  const submit = element('button', 'Compare'); submit.type = 'submit'; form.append(submit); comparison.append(form);
  const output = element('div'); output.id = 'comparison'; comparison.append(output); root.append(comparison);
  form.addEventListener('submit', event => {
    event.preventDefault(); void compare(data.handoff_id, Number(numbers.from_revision.value), Number(numbers.to_revision.value), output);
  });
}
async function loadHistory(id, newOffset = 0) {
  const target = $('history'); if (!target || selected !== id) return;
  const token = ++historyEpoch, epoch = detailEpoch;
  target.replaceChildren(element('p', 'Loading immutable revisions…', 'muted'));
  try {
    const data = await read('history', { handoff_id: id, offset: newOffset });
    if (token !== historyEpoch || epoch !== detailEpoch) return;
    target.replaceChildren(element('p', `${data.total} saved revisions · latest at this read: ${data.latest_revision}`, 'muted'));
    if (current && data.latest_revision > current.latest_revision) target.append(element('p', `A newer revision (${data.latest_revision}) arrived. Use Check latest to load it.`, 'notice warning'));
    for (const rev of data.revisions) {
      const row = element('article', undefined, 'history-row');
      row.append(element('strong', `Revision ${rev.revision} · ${rev.source_app || 'App not reported'}`),
        element('small', `${rev.source_model || 'Model not reported'} · ${date(rev.updated_at)}`), element('p', rev.summary, 'verbatim'));
      const actions = element('div', undefined, 'actions');
      button(`Read revision ${rev.revision}`, () => navigate(id, rev.revision), actions);
      if (rev.revision < data.latest_revision) button(`Compare ${rev.revision} with latest`, () => {
        const output = $('comparison'); output.closest('details').open = true;
        void compare(id, rev.revision, data.latest_revision, output); output.scrollIntoView({ block: 'nearest' });
      }, actions);
      row.append(actions); target.append(row);
      const lineage = element('details'); lineage.append(element('summary', `Revision ${rev.revision} provenance`),
        element('pre', JSON.stringify({ event_id: rev.event_id, previous_event_id: rev.previous_event_id, sha256: rev.sha256 }, null, 2)));
      row.append(lineage);
    }
    const pages = element('div', undefined, 'actions');
    if (newOffset > 0) button('Newer revisions', () => { void loadHistory(id, Math.max(0, newOffset - 10)); }, pages);
    if (data.next_offset !== null) button('Older revisions', () => { void loadHistory(id, data.next_offset); }, pages);
    target.append(pages);
  } catch (error) { if (token === historyEpoch && epoch === detailEpoch) { target.replaceChildren(element('p', error.message)); button('Retry history', () => { void loadHistory(id, newOffset); }, target); } }
}
async function compare(id, from, to, output) {
  const token = ++compareEpoch, epoch = detailEpoch;
  output.replaceChildren(element('p', 'Loading exact changes…', 'muted'));
  try {
    const data = await read('compare', { handoff_id: id, from_revision: from, to_revision: to });
    if (token !== compareEpoch || epoch !== detailEpoch) return;
    output.replaceChildren(element('p', `Revision ${data.from_revision} → revision ${data.to_revision}. Exact saved text; no inference or merge.`, 'muted'));
    if (data.identical) output.append(element('p', 'No packet fields changed.'));
    for (const change of data.changes) {
      const item = element('section', undefined, 'change'); item.append(element('h3', fields[change.field] || change.field.replaceAll('_', ' ')));
      if (['constraints', 'open_questions'].includes(change.field)) {
        const removed = (change.before || []).filter(value => !(change.after || []).includes(value));
        if (removed.length) {
          const warning = element('div', undefined, 'warning'); warning.append(element('strong', `Removed ${fields[change.field].toLowerCase()}`));
          const list = element('ul'); for (const value of removed) list.append(element('li', value, 'verbatim')); warning.append(list); item.append(warning);
        }
      }
      const columns = element('div', undefined, 'diff');
      for (const [label, value] of [['Before', change.before], ['After', change.after]]) {
        const column = element('section'); column.append(element('h3', label), element('pre', typeof value === 'string' ? value || 'Empty' : JSON.stringify(value, null, 2)));
        columns.append(column);
      }
      item.append(columns); output.append(item);
    }
  } catch (error) { if (token === compareEpoch && epoch === detailEpoch) output.replaceChildren(element('p', error.message)); }
}
$('search-form').addEventListener('submit', event => { event.preventDefault(); query = $('search').value.trim(); void library(); });
$('refresh').addEventListener('click', () => {
  void library(offset); if (selected) { const params = new URLSearchParams(location.hash.slice(1)); void packet(selected, params.has('revision') ? Number(params.get('revision')) : undefined); }
});
window.addEventListener('hashchange', route);
void library(); route();
