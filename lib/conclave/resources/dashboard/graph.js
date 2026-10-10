// Shared by the dashboard and the bundled MCP App. No network or model calls.
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const label = relation => relation.replaceAll('_', ' ');
let sequence = 0;

function positions(nodes, edges, vertical) {
  const remaining = new Set(nodes.map(node => node.id)), points = new Map();
  let top = 0, width = 280;
  while (remaining.size) {
    // Lay out each connected component on its own rows, starting with a source.
    const root = [...remaining].find(id => !edges.some(edge => edge.target === id && remaining.has(edge.source))) || remaining.values().next().value;
    const queue = [[root, 0]], levels = new Map(); remaining.delete(root);
    for (let i = 0; i < queue.length; i++) {
      const [id, depth] = queue[i];
      if (!levels.has(depth)) levels.set(depth, []);
      levels.get(depth).push(id);
      const neighbors = edges.flatMap(edge => edge.source === id ? [edge.target] : edge.target === id ? [edge.source] : []);
      for (const next of neighbors) if (remaining.delete(next)) queue.push([next, depth + 1]);
    }
    const height = Math.max(...[...levels.values()].map(ids => ids.length)) * 112;
    for (const [depth, ids] of levels) ids.forEach((id, i) => points.set(id, {
      x: depth * 320 + 160, y: top + (height - ids.length * 112) / 2 + i * 112 + 56,
    }));
    width = Math.max(width, levels.size * 320); top += height + 24;
  }
  if (vertical) {
    for (const [id, { x, y }] of points) points.set(id, { x: y * 2.5, y: x / 2 });
    return { points, width: Math.max(280, (top - 24) * 2.5), height: width / 2 };
  }
  return { points, width, height: Math.max(112, top - 24) };
}

export function renderHandoffGraph(data, { onOpen, selected, compact = false, canOpen = true } = {}) {
  const container = element('div', undefined, 'handoff-graph');
  const byId = new Map(data.nodes.map(node => [node.id, node]));
  const linked = new Set(data.edges.flatMap(edge => [edge.source, edge.target]));
  const connected = data.nodes.filter(node => linked.has(node.id));
  const nodes = compact ? connected.slice(0, 8) : connected;
  const visible = new Set(nodes.map(node => node.id));
  const edges = data.edges.filter(edge => visible.has(edge.source) && visible.has(edge.target));
  const openButton = (node, revision, text) => {
    const button = element('button', text); button.type = 'button';
    button.dataset.requiresTools = 'true'; button.disabled = !canOpen;
    button.addEventListener('click', () => onOpen?.(node.readable_id || node.id, revision));
    return button;
  };
  if (nodes.length) {
    const vertical = window.matchMedia('(max-width: 600px)').matches;
    const { points, width, height } = positions(nodes, edges, vertical);
    const shape = (tag, attributes = {}, text) => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const svg = shape('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'group', 'aria-label': 'Saved handoff graph' });
    const markerId = `clyp-arrow-${++sequence}`, defs = shape('defs');
    const marker = shape('marker', { id: markerId, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' });
    marker.append(shape('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'graph-arrow' })); defs.append(marker); svg.append(defs);
    for (const edge of edges) {
      const a = points.get(edge.source), b = points.get(edge.target);
      const dx = b.x - a.x, dy = b.y - a.y;
      const inset = Math.min(dx ? 112 / Math.abs(dx) : Infinity, dy ? 34 / Math.abs(dy) : Infinity);
      const line = shape('line', { x1: a.x + dx * inset, y1: a.y + dy * inset, x2: b.x - dx * inset, y2: b.y - dy * inset,
        class: 'graph-edge', 'marker-end': `url(#${markerId})` });
      line.append(shape('title', {}, `${byId.get(edge.source).title} r${edge.source_revision} ${label(edge.relation)} ${byId.get(edge.target).title} r${edge.target_revision}`));
      svg.append(line, shape('text', { x: (a.x + b.x) / 2 + (vertical ? 12 : 0), y: (a.y + b.y) / 2 - (vertical ? 0 : 9),
        'text-anchor': vertical ? 'start' : 'middle', class: 'graph-relation' }, label(edge.relation)));
    }
    for (const node of nodes) {
      const { x, y } = points.get(node.id);
      const group = shape('g', { role: 'button', tabindex: canOpen ? 0 : -1, 'aria-disabled': String(!canOpen),
        'aria-label': `Open ${node.title}, revision ${node.revision}`, 'aria-current': String([node.id, node.readable_id].includes(selected)),
        'data-id': node.id, 'data-reference': node.readable_id || node.id, class: 'graph-node' });
      group.append(shape('title', {}, `${node.title}\n${node.readable_id || node.id}\nLatest revision ${node.revision} · ${node.project || 'No project'}`),
        shape('rect', { x: x - 110, y: y - 32, width: 220, height: 64, rx: 12 }),
        shape('text', { x, y: y - 3, 'text-anchor': 'middle' }, node.title.length > 27 ? node.title.slice(0, 26) + '…' : node.title),
        shape('text', { x, y: y + 18, 'text-anchor': 'middle', class: 'graph-project' }, `${(node.project || 'No project').slice(0, 23)} · r${node.revision}`));
      const open = () => { if (canOpen) onOpen?.(node.readable_id || node.id, node.revision); };
      group.addEventListener('click', open);
      group.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); open(); } });
      svg.append(group);
    }
    const canvas = element('div', undefined, 'graph-canvas'); canvas.append(svg); container.append(canvas);
    const list = element('ul', undefined, 'connection-list');
    for (const edge of edges) {
      const source = byId.get(edge.source), target = byId.get(edge.target), row = element('li');
      row.append(openButton(source, edge.source_revision, `${source.title} (r${edge.source_revision})`),
        element('span', label(edge.relation), 'graph-link-label'), openButton(target, edge.target_revision, `${target.title} (r${edge.target_revision})`));
      list.append(row);
    }
    const details = element('details'); details.append(element('summary', 'Linked revisions'), list); container.append(details);
  } else container.append(element('p', 'No explicit links saved yet. A Clyp can link to a retrieved handoff revision.', 'muted'));
  if (nodes.length < connected.length) container.append(element('p', `Preview: ${nodes.length} of ${connected.length} linked handoffs · ${edges.length} of ${data.edges.length} links. Open the graph for all connections.`, 'muted'));
  const isolated = data.nodes.filter(node => !linked.has(node.id));
  if (isolated.length) {
    const details = element('details'); details.append(element('summary', `${isolated.length} handoff${isolated.length === 1 ? '' : 's'} without links`));
    const list = element('div', undefined, 'graph-unlinked');
    for (const node of isolated) list.append(openButton(node, node.revision, `${node.title} · r${node.revision}`));
    details.append(list); container.append(details);
  }
  return container;
}
