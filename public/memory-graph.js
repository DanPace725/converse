// A zoomable map of saved memories. Recorded relationships are its edges and
// topic beds explain why unlinked memories sit together; dotted lines for
// similar meaning are a separate reading aid and never shape the map.
(() => {
  const el = (id) => document.getElementById(id),
    ns = "http://www.w3.org/2000/svg";
  // One memory with its label, in map units, and the camera's zoom range.
  const cell = { w: 172, h: 122, left: -84, right: 84, top: -40, bottom: 86 },
    bedMargin = 24,
    squash = cell.h / cell.w,
    range = { min: 0.12, max: 2.5, readable: 0.72, captioned: 0.4 };
  const scene = el("memory-scene"),
    calm = matchMedia("(prefers-reduced-motion: reduce)");
  let data = null,
    onMemory,
    onState,
    signature = "",
    disabled = false,
    shown = [],
    lines = [],
    topicLabels = [],
    stage = null,
    selected = null,
    // The camera follows the whole map until the reader moves it.
    fitted = true,
    flight = 0,
    pointing = false,
    moved = false,
    armed = null,
    glyph = 0,
    similar = { links: [] },
    similarFor = "",
    similarRequest = 0;
  const placed = new Map(),
    drawn = new Map(),
    pointers = new Map(),
    view = { x: 0, y: 0, k: 1 },
    // Where the camera is heading; rapid steps build on it, not on mid-flight.
    goal = { x: 0, y: 0, k: 1 },
    size = { w: 0, h: 0 };
  const clean = (text) =>
    String(text || "")
      .replace(/\s+/g, " ")
      .trim();
  const short = (text, length) =>
    clean(text).length > length
      ? clean(text).slice(0, length - 1) + "…"
      : clean(text);
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  // Stable per-memory scatter, so the same record starts in the same place.
  function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++)
      h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return (h >>> 0) / 4294967296;
  }
  function svg(tag, attrs, parent, text) {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs || {}))
      node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    parent.append(node);
    return node;
  }
  function nodes() {
    return [
      ...(data?.memory?.records || []).map((r) => ({
        key: "memory:" + r.memory_id,
        id: r.memory_id,
        kind: r.kind,
        content: r.content,
        topic: r.scope?.topic_ambiguous
          ? "ambiguous"
          : r.scope?.topic_id || "conversation",
        topicName: r.scope?.topic_ambiguous
          ? "Unclear topic"
          : r.scope?.topic_name || "This conversation",
        status: r.lifecycle,
        tier: r.projection_tier || "archive",
        record: r,
      })),
      ...(data?.state?.entries || []).map((s) => ({
        key: "state:" + s.state_key,
        id: s.state_key,
        kind: "named",
        content: s.content,
        topic: "named",
        topicName: "Named details",
        status: s.effective_status || s.status,
        tier:
          ["active", "unresolved"].includes(s.effective_status || s.status) &&
          data?.context?.segments?.some((c) => c.id === s.id)
            ? "full"
            : "archive",
        record: s,
      })),
    ];
  }
  function edges(all) {
    const aliases = new Map();
    for (const node of all) {
      aliases.set(node.key, node);
      aliases.set(node.record.id || node.id, node);
      if (node.kind === "named") aliases.set("state:" + node.id, node);
    }
    const result = [],
      seen = new Set();
    for (const node of all) {
      const relations =
        node.kind === "named" ? node.record.relations || {} : node.record;
      for (const [type, label] of [
        ["depends_on", "Depends on"],
        ["supersedes", "Replaces"],
        ["conflicts_with", "Conflicts with"],
        ["supports", "Supports"],
      ])
        for (const ref of relations[type] || []) {
          const target = aliases.get(
            node.kind === "named" ? ref : "memory:" + ref,
          );
          if (!target || target.key === node.key) continue;
          const key =
            type === "conflicts_with"
              ? [node.key, target.key].sort().join("|") + type
              : node.key + "|" + target.key + type;
          if (seen.has(key)) continue;
          seen.add(key);
          result.push({ from: node, to: target, type, label });
        }
    }
    return result;
  }
  function related(key) {
    return edges(nodes())
      .filter((e) => e.from.key === key || e.to.key === key)
      .map((e) => ({
        label:
          e.from.key === key
            ? e.label
            : {
                Replaces: "Replaced by",
                "Depends on": "Required by",
                Supports: "Supported by",
                "Conflicts with": "Conflicts with",
              }[e.label],
        target: e.from.key === key ? e.to : e.from,
      }));
  }
  // Semantic neighbours from the engine's embedding index. A recorded
  // relationship between the same two memories takes its place.
  function likeness(all, recorded) {
    if (!el("memory-similar").checked) return [];
    const byId = new Map(all.map((n) => [n.record.id || n.id, n])),
      pair = (a, b) => [a.key, b.key].sort().join("|"),
      joined = new Set(recorded.map((e) => pair(e.from, e.to)));
    return (similar.links || []).flatMap((link) => {
      const from = byId.get(link.from),
        to = byId.get(link.to);
      return !from || !to || from === to || joined.has(pair(from, to))
        ? []
        : [{ from, to, type: "semantic", similarity: link.similarity }];
    });
  }
  // Similarity is read from vectors the engine already holds, so asking makes
  // no model call. A lookup that fails or is switched off draws no lines.
  async function loadSimilar(conversation) {
    const request = ++similarRequest;
    let next = { links: [] };
    try {
      const response = await fetch(
        "/api/conclave?action=memory_links&conversation=" +
          encodeURIComponent(conversation),
        { cache: "no-store" },
      );
      if (response.ok) next = await response.json();
    } catch {}
    if (request !== similarRequest || data?.conversation_id !== conversation)
      return;
    if (JSON.stringify(next) === JSON.stringify(similar)) return;
    similar = next;
    draw();
  }
  const tier = (node) =>
    node.tier === "full" ? "full" : node.tier === "stub" ? "pointer" : "saved";
  function open(node) {
    if (disabled) return;
    (node.kind === "named" ? onState : onMemory)?.(node.id);
  }

  // Layout. Linked memories pull together, each topic gathers into its own
  // bed, and nothing overlaps. Settled memories keep their place; only new
  // arrivals disturb the map.
  function settle(list, links) {
    const fresh = list.filter((n) => !placed.has(n.key)).length;
    if (!fresh) return;
    const topics = [...new Set(list.map((n) => n.topic))];
    topics.forEach((topic, t) => {
      const members = list.filter((n) => n.topic === topic),
        known = members
          .filter((n) => placed.has(n.key))
          .map((n) => placed.get(n.key)),
        reach = Math.sqrt(t) * 300,
        spread = Math.sqrt(members.length);
      const centre = known.length
        ? {
            x: known.reduce((sum, p) => sum + p.x, 0) / known.length,
            y: known.reduce((sum, p) => sum + p.y, 0) / known.length,
          }
        : { x: Math.cos(t * 2.4) * reach, y: Math.sin(t * 2.4) * reach };
      for (const n of members)
        if (!placed.has(n.key))
          placed.set(n.key, {
            x: centre.x + (hash(n.key) - 0.5) * cell.w * spread,
            y: centre.y + (hash(n.key + "/") - 0.5) * cell.h * spread,
          });
    });
    const points = list.map((n) => ({
        ...placed.get(n.key),
        t: topics.indexOf(n.topic),
        key: n.key,
      })),
      index = new Map(points.map((p) => [p.key, p])),
      springs = links
        .map((e) => [index.get(e.from.key), index.get(e.to.key)])
        .filter(([a, b]) => a && b),
      ticks = clamp(Math.round(3e7 / points.length ** 2), 60, 320),
      warmth = fresh === points.length ? 1 : 0.35,
      // Beds gather into the canvas's shape: a tall panel gets a tall map.
      lean = 1.6 * (size.w ? clamp(size.h / size.w, 0.7, 1.6) : 1.2);
    // Each bed's centre and the room it claims, its name included.
    const survey = () => {
      const beds = topics.map(() => ({
        x: 0,
        y: 0,
        n: 0,
        left: Infinity,
        right: -Infinity,
        top: Infinity,
        bottom: -Infinity,
      }));
      for (const p of points) {
        const bed = beds[p.t];
        bed.x += p.x;
        bed.y += p.y;
        bed.n++;
        bed.left = Math.min(bed.left, p.x + cell.left - bedMargin);
        bed.right = Math.max(bed.right, p.x + cell.right + bedMargin);
        bed.top = Math.min(bed.top, p.y + cell.top - bedMargin - 50);
        bed.bottom = Math.max(bed.bottom, p.y + cell.bottom + bedMargin);
      }
      for (const bed of beds) {
        bed.x /= bed.n;
        bed.y /= bed.n;
      }
      return beds;
    };
    // The last passes only separate, so the result is free of overlaps.
    for (let tick = 0; tick < ticks + 12; tick++) {
      const heat = warmth * Math.max(0, 1 - tick / ticks);
      let beds = survey();
      for (const p of points) {
        const bed = beds[p.t];
        p.x += ((bed.x - p.x) * 0.16 - bed.x * 0.06 * lean) * heat;
        p.y += ((bed.y - p.y) * 0.16 - (bed.y * 0.06) / lean) * heat;
      }
      for (const [a, b] of springs) {
        const dx = b.x - a.x,
          dy = b.y - a.y,
          d = Math.hypot(dx, dy) || 1,
          pull = ((d - 190) / d) * (a.t === b.t ? 0.1 : 0.03) * heat;
        a.x += dx * pull;
        a.y += dy * pull;
        b.x -= dx * pull;
        b.y -= dy * pull;
      }
      // Memories collide as ellipses, so they slide into a compact bed.
      for (let i = 0; i < points.length; i++)
        for (let j = i + 1; j < points.length; j++) {
          const a = points[i],
            b = points[j],
            dx = (b.x - a.x) * squash,
            dy = b.y - a.y,
            d = Math.hypot(dx, dy);
          if (d >= cell.h) continue;
          const push = (cell.h - d) / 2,
            ux = (d ? dx / d : Math.cos(i + j)) * push,
            uy = (d ? dy / d : Math.sin(i + j)) * push;
          a.x -= ux / squash;
          a.y -= uy;
          b.x += ux / squash;
          b.y += uy;
        }
      beds = survey();
      for (let i = 0; i < beds.length; i++)
        for (let j = i + 1; j < beds.length; j++) {
          const a = beds[i],
            b = beds[j],
            ox = Math.min(a.right, b.right) - Math.max(a.left, b.left),
            oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ox <= 0 || oy <= 0) continue;
          const across = ox < oy,
            shift =
              ((across ? ox : oy) / 2) *
              ((across ? b.x - a.x : b.y - a.y) < 0 ? -1 : 1);
          for (const p of points) {
            const side = p.t === i ? -shift : p.t === j ? shift : 0;
            if (across) p.x += side;
            else p.y += side;
          }
          for (const [bed, side] of [
            [a, -shift],
            [b, shift],
          ])
            for (const edge of across
              ? ["x", "left", "right"]
              : ["y", "top", "bottom"])
              bed[edge] += side;
        }
    }
    for (const p of points)
      placed.set(p.key, { x: Math.round(p.x), y: Math.round(p.y) });
  }
  // A rounded outline around a bed's memories.
  function outline(members, pad) {
    const points = members
      .flatMap((n) => {
        const p = placed.get(n.key);
        return [
          [p.x + cell.left, p.y + cell.top],
          [p.x + cell.right, p.y + cell.top],
          [p.x + cell.left, p.y + cell.bottom],
          [p.x + cell.right, p.y + cell.bottom],
        ];
      })
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const turn = (o, a, b) =>
      (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const half = (list) => {
      const side = [];
      for (const p of list) {
        while (side.length > 1 && turn(side.at(-2), side.at(-1), p) <= 0)
          side.pop();
        side.push(p);
      }
      side.pop();
      return side;
    };
    const ring = [...half(points), ...half([...points].reverse())];
    const sides = ring.map((p, i) => {
      const q = ring[(i + 1) % ring.length],
        length = Math.hypot(q[0] - p[0], q[1] - p[1]),
        nx = ((q[1] - p[1]) / length) * pad,
        ny = ((p[0] - q[0]) / length) * pad;
      return [p[0] + nx, p[1] + ny, q[0] + nx, q[1] + ny];
    });
    const corner = `A ${pad} ${pad} 0 0 1`;
    return (
      sides
        .map(
          ([x1, y1, x2, y2], i) =>
            `${i ? corner : "M"} ${x1} ${y1} L ${x2} ${y2}`,
        )
        .join(" ") + ` ${corner} ${sides[0][0]} ${sides[0][1]} Z`
    );
  }

  // Camera.
  function paint() {
    stage?.setAttribute(
      "transform",
      `translate(${view.x} ${view.y}) scale(${view.k})`,
    );
    scene.classList.toggle("memory-far", view.k < range.readable);
    scene.classList.toggle("memory-distant", view.k < range.captioned);
    scene.style.setProperty("--memory-inverse", 1 / view.k);
    // Topic names stay legible at any zoom, and so do the seeds: far out,
    // where labels are hidden, each seed grows into the room its label left.
    for (const label of topicLabels)
      label.style.fontSize = clamp(13 / view.k, 13, 37) + "px";
    const next = clamp(0.6 / view.k, 1, 2.4);
    if (next !== glyph) {
      glyph = next;
      scene.style.setProperty("--memory-glyph", glyph);
      for (const { path, a, b } of lines) {
        const dx = b.x - a.x,
          dy = b.y - a.y,
          length = Math.hypot(dx, dy),
          ux = dx / length,
          uy = dy / length,
          inset = Math.min(27 * glyph, length * 0.4),
          bend = Math.min(26, length * 0.12);
        path.setAttribute(
          "d",
          `M ${a.x + ux * inset} ${a.y + uy * inset} Q ${(a.x + b.x) / 2 + uy * bend} ${(a.y + b.y) / 2 - ux * bend} ${b.x - ux * inset} ${b.y - uy * inset}`,
        );
      }
    }
    el("memory-zoom-in").disabled = goal.k >= range.max;
    el("memory-zoom-out").disabled = goal.k <= range.min;
  }
  function move(next, animate) {
    cancelAnimationFrame(flight);
    Object.assign(goal, next);
    if (!animate || calm.matches) {
      Object.assign(view, next);
      return paint();
    }
    const from = { ...view },
      start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 220),
        ease = 1 - (1 - t) ** 3;
      for (const axis of ["x", "y", "k"])
        view[axis] = from[axis] + (goal[axis] - from[axis]) * ease;
      paint();
      if (t < 1) flight = requestAnimationFrame(step);
    };
    flight = requestAnimationFrame(step);
  }
  // The zoom controls cover the head of the canvas and the card its foot.
  function clearing() {
    const card = el("memory-focus").offsetHeight;
    return { top: 44, bottom: size.h - (card ? card + 16 : 0) };
  }
  function frame(list, animate) {
    if (!size.w || !list.length) return paint();
    const room = clearing(),
      at = list.map((n) => placed.get(n.key)),
      left = Math.min(...at.map((p) => p.x)) + cell.left - 40,
      right = Math.max(...at.map((p) => p.x)) + cell.right + 40,
      top = Math.min(...at.map((p) => p.y)) + cell.top - 64,
      bottom = Math.max(...at.map((p) => p.y)) + cell.bottom + 30,
      k = clamp(
        Math.min(
          size.w / (right - left),
          (room.bottom - room.top) / (bottom - top),
        ),
        range.min,
        1.15,
      );
    move(
      {
        k,
        x: size.w / 2 - (k * (left + right)) / 2,
        y: (room.top + room.bottom) / 2 - (k * (top + bottom)) / 2,
      },
      animate,
    );
  }
  function zoom(factor, x = size.w / 2, y = size.h / 2, animate = false) {
    const k = clamp(goal.k * factor, range.min, range.max),
      ratio = k / goal.k;
    fitted = false;
    move(
      { k, x: x - (x - goal.x) * ratio, y: y - (y - goal.y) * ratio },
      animate,
    );
  }
  // Bring a memory into view without changing the zoom.
  function reveal(node) {
    const p = placed.get(node.key);
    if (!p || !size.w) return;
    const x = goal.x + goal.k * p.x,
      y = goal.y + goal.k * (p.y + 27),
      room = clearing(),
      inset = 30;
    if (
      x > inset &&
      x < size.w - inset &&
      y > room.top + inset &&
      y < room.bottom - inset
    )
      return;
    fitted = false;
    move(
      {
        k: goal.k,
        x: size.w / 2 - goal.k * p.x,
        y: (room.top + room.bottom) / 2 - goal.k * (p.y + 27),
      },
      true,
    );
  }

  // Selection lights a memory's recorded connections and fills the card.
  function mark() {
    const near = new Set([selected]);
    for (const { edge, path } of lines) {
      const lit = edge.from.key === selected || edge.to.key === selected;
      path.classList.toggle("memory-edge-lit", lit);
      if (lit) near.add(edge.from.key).add(edge.to.key);
    }
    scene.classList.toggle("memory-focused", near.size > 1);
    const stop = drawn.has(selected) ? selected : shown[0]?.key;
    for (const [key, group] of drawn) {
      group.classList.toggle("memory-selected", key === selected);
      group.classList.toggle("memory-near", near.has(key));
      group.setAttribute("tabindex", key === stop ? 0 : -1);
    }
  }
  function card() {
    const node = shown.find((n) => n.key === selected);
    el("memory-focus").hidden = !node;
    if (!node) return;
    el("memory-focus-meta").textContent =
      `${node.kind === "named" ? node.id : node.kind} · ${node.status} · ${node.tier === "archive" ? "not" : tier(node)} in last projection`;
    el("memory-focus-text").textContent = clean(node.content);
    const all = nodes(),
      links = [
        ...related(node.key),
        ...likeness(all, edges(all))
          .filter((e) => e.from.key === node.key || e.to.key === node.key)
          .map((e) => ({
            label: `Similar (${Math.round(e.similarity * 100)}%)`,
            target: e.from.key === node.key ? e.to : e.from,
          })),
      ];
    el("memory-focus-links").hidden = !links.length;
    el("memory-focus-links").replaceChildren(
      ...links.map((link) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `${link.label}: ${short(link.target.content, 60)}`;
        button.title = link.target.id + " · " + link.target.status;
        // Walk to a neighbour on the map; one outside this view opens instead.
        button.onclick = () =>
          drawn.has(link.target.key)
            ? drawn.get(link.target.key).focus({ preventScroll: true })
            : open(link.target);
        return button;
      }),
    );
    el("memory-focus-open").disabled = disabled;
  }
  function select(node) {
    selected = node?.key ?? null;
    mark();
    card();
    if (node) reveal(node);
  }
  // The nearest memory in the direction of an arrow key.
  function toward(node, dx, dy) {
    const from = placed.get(node.key);
    let best = null,
      score = Infinity;
    for (const other of shown) {
      if (other === node) continue;
      const p = placed.get(other.key),
        along = (p.x - from.x) * dx + (p.y - from.y) * dy,
        across = Math.abs((p.x - from.x) * dy - (p.y - from.y) * dx);
      if (along <= 0 || along + across * 2 >= score) continue;
      best = other;
      score = along + across * 2;
    }
    return best;
  }

  function draw() {
    const all = nodes(),
      topicSelect = el("memory-topic"),
      oldTopic = topicSelect.value;
    const topics = new Map(all.map((n) => [n.topic, n.topicName]));
    topicSelect.replaceChildren(
      new Option("All topics", ""),
      ...[...topics].map(([key, label]) => new Option(label, key)),
    );
    topicSelect.value = topics.has(oldTopic) ? oldTopic : "";
    // Keep reading order stable across polling and corrections.
    shown = all
      .filter(
        (n) =>
          (!topicSelect.value || n.topic === topicSelect.value) &&
          (el("memory-history").checked || n.status !== "superseded"),
      )
      .sort(
        (a, b) => a.topic.localeCompare(b.topic) || a.key.localeCompare(b.key),
      );
    const keys = new Set(all.map((n) => n.key)),
      connections = edges(all);
    for (const key of placed.keys()) if (!keys.has(key)) placed.delete(key);
    // Memories hidden by a filter still hold their ground.
    settle(
      all.filter((n) => placed.has(n.key) || shown.includes(n)),
      connections,
    );
    // Similar pairs are drawn beneath recorded ones and never move a memory.
    const visible = [...likeness(all, connections), ...connections].filter(
        (e) => shown.includes(e.from) && shown.includes(e.to),
      ),
      alike = visible.filter((e) => e.type === "semantic").length;
    const held = [...drawn].find(
      ([, group]) => group === document.activeElement,
    )?.[0];
    scene.replaceChildren();
    drawn.clear();
    const defs = svg("defs", {}, scene),
      marker = svg(
        "marker",
        {
          id: "memory-arrow",
          viewBox: "0 0 10 10",
          refX: 9,
          refY: 5,
          markerWidth: 5,
          markerHeight: 5,
          orient: "auto-start-reverse",
        },
        defs,
      );
    svg("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "#8da9a0" }, marker);
    stage = svg("g", { id: "memory-stage" }, scene);
    topicLabels = [];
    for (const topic of new Set(shown.map((n) => n.topic))) {
      const members = shown.filter((n) => n.topic === topic),
        at = members.map((n) => placed.get(n.key)),
        left = Math.min(...at.map((p) => p.x)),
        right = Math.max(...at.map((p) => p.x));
      svg("path", { d: outline(members, 14), class: "memory-bed" }, stage);
      // A name is cut to its bed's width, so it never runs into a neighbour.
      const title = svg(
        "text",
        {
          x: (left + right) / 2,
          y: Math.min(...at.map((p) => p.y)) + cell.top - 24,
          "text-anchor": "middle",
          class: "memory-topic-label",
        },
        stage,
        short(
          members[0].topicName,
          clamp(Math.floor((right - left + cell.w) / 19), 12, 43),
        ),
      );
      svg("title", {}, title, members[0].topicName + "\nSelect to zoom here.");
      title.onclick = () => {
        if (moved) return;
        fitted = false;
        frame(members, true);
      };
      topicLabels.push(title);
    }
    // paint() routes each edge, since its ends follow the seed size.
    glyph = 0;
    lines = visible.map((edge) => {
      const path = svg(
        "path",
        {
          class: "memory-edge memory-edge-" + edge.type,
          "marker-end": ["conflicts_with", "semantic"].includes(edge.type)
            ? ""
            : "url(#memory-arrow)",
        },
        stage,
      );
      svg(
        "title",
        {},
        path,
        edge.type === "semantic"
          ? `${short(edge.from.content, 65)} ↔ similar meaning, ${Math.round(edge.similarity * 100)}% ↔ ${short(edge.to.content, 65)}`
          : `${short(edge.from.content, 65)} → ${edge.label.toLowerCase()} → ${short(edge.to.content, 65)}`,
      );
      return {
        edge,
        path,
        a: placed.get(edge.from.key),
        b: placed.get(edge.to.key),
      };
    });
    for (const node of shown) {
      const p = placed.get(node.key),
        inactive = ["suppressed", "superseded", "invalidated"].includes(
          node.status,
        );
      const group = svg(
        "g",
        {
          transform: `translate(${p.x} ${p.y})`,
          class: `memory-node memory-${node.kind}${inactive ? " memory-inactive" : ""}`,
          role: "button",
          "aria-disabled": String(disabled),
          "data-memory-id": node.id,
          "data-memory-kind": node.kind,
          "aria-label": `${node.kind === "named" ? node.id : node.kind}: ${clean(node.content)} · ${node.status} · ${node.tier} in last projection`,
        },
        stage,
      );
      svg(
        "title",
        {},
        group,
        `${node.id}\n${node.content}\n${node.status} · ${node.tier} in last projection\nSelect to follow connections; select again to open.`,
      );
      svg(
        "rect",
        {
          x: cell.left,
          y: -26,
          width: cell.right - cell.left,
          height: 110,
          rx: 14,
          class: "memory-hit",
        },
        group,
      );
      const seed = svg("g", { class: "memory-glyph" }, group);
      svg("circle", { r: 31, class: "memory-halo" }, seed);
      if (node.tier === "full")
        svg("circle", { r: 25, class: "memory-active-ring" }, seed);
      svg(
        node.kind === "named" ? "path" : "circle",
        node.kind === "named"
          ? { d: "M 0 -18 L 18 0 L 0 18 L -18 0 Z", class: "memory-seed" }
          : { r: 18, class: "memory-seed" },
        seed,
      );
      if (node.tier === "stub") group.classList.add("memory-pointer");
      svg(
        "path",
        {
          d: "M 0 9 L 0 -6 M 0 0 Q -13 0 -9 -8 Q 0 -9 0 0 M 0 -3 Q 12 -4 9 -12 Q 0 -12 0 -3",
          class: "memory-sprout",
        },
        seed,
      );
      const label = clean(node.content),
        first = label.slice(0, 23),
        split = first.lastIndexOf(" ");
      const cut =
        label.length > 23 && split > 10 ? split : Math.min(label.length, 23);
      svg(
        "text",
        { y: 40, "text-anchor": "middle", class: "memory-label" },
        group,
        label.slice(0, cut),
      );
      svg(
        "text",
        { y: 56, "text-anchor": "middle", class: "memory-label" },
        group,
        short(label.slice(cut), 23),
      );
      svg(
        "text",
        { "text-anchor": "middle", class: "memory-caption" },
        group,
        short(label, 13),
      );
      svg(
        "text",
        { y: 76, "text-anchor": "middle", class: "memory-status" },
        group,
        inactive
          ? node.status
          : node.kind === "named"
            ? short(node.id, 24)
            : `${node.kind} · ${tier(node)}`,
      );
      // Keyboard focus selects. A press selects on release, so the card
      // never appears under a held pointer; a second press opens the memory.
      group.onfocus = () => {
        if (!pointing && selected !== node.key) select(node);
      };
      group.onpointerdown = () => (armed = selected);
      group.onclick = () => {
        if (moved) return;
        if (armed === node.key) open(node);
        else select(node);
        armed = null;
      };
      group.onkeydown = (event) => {
        const step = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        }[event.key];
        if (["Enter", " "].includes(event.key)) open(node);
        else if (step)
          drawn.get(toward(node, ...step)?.key)?.focus({ preventScroll: true });
        else if (["+", "="].includes(event.key))
          zoom(1.4, undefined, undefined, true);
        else if (event.key === "-") zoom(1 / 1.4, undefined, undefined, true);
        else if (event.key === "0") {
          fitted = true;
          frame(shown, true);
        } else return;
        event.preventDefault();
      };
      drawn.set(node.key, group);
    }
    el("memory-canvas").hidden = !shown.length;
    if (!drawn.has(selected)) selected = null;
    mark();
    card();
    el("memory-graph-status").textContent = !all.length
      ? "No saved memories yet. Add a detail below, or continue the conversation."
      : !shown.length
        ? "No memories in this view. Try another topic or include earlier versions."
        : `${shown.length} ${shown.length === 1 ? "memory" : "memories"} · ${visible.length - alike} ${visible.length - alike === 1 ? "connection" : "connections"}${alike ? ` · ${alike} similar` : ""}. Drag to move, scroll or pinch to zoom, and select a memory to follow its connections.`;
    // The switch appears once the index holds something to compare.
    el("memory-similar").parentElement.hidden = !similar.indexed;
    el("memory-similar").parentElement.title =
      `Dotted lines join memories with similar meaning, from stored embeddings (${similar.indexed || 0} of ${similar.memories || 0} compared). They are not recorded relationships and are not given to assistants.`;
    for (const id of ["memory-topic", "memory-history", "memory-similar"])
      el(id).disabled = disabled;
    if (fitted) frame(shown);
    else paint();
    drawn.get(held)?.focus({ preventScroll: true });
  }
  el("memory-topic").onchange = el("memory-history").onchange = () => {
    fitted = true;
    draw();
  };
  el("memory-similar").onchange = draw;
  el("memory-zoom-in").onclick = () => zoom(1.4, undefined, undefined, true);
  el("memory-zoom-out").onclick = () =>
    zoom(1 / 1.4, undefined, undefined, true);
  el("memory-fit").onclick = () => {
    fitted = true;
    frame(shown, true);
  };
  el("memory-focus-open").onclick = () => {
    const node = shown.find((n) => n.key === selected);
    if (node) open(node);
  };

  // Drag pans, the wheel and a two-finger pinch zoom around the pointer.
  const spot = (event) => {
    const box = scene.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  scene.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const at = spot(event);
      zoom(
        Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)),
        at.x,
        at.y,
      );
    },
    { passive: false },
  );
  scene.addEventListener("pointerdown", (event) => {
    if (event.button) return;
    if (!pointers.size) moved = false;
    pointing = true;
    pointers.set(event.pointerId, spot(event));
  });
  scene.addEventListener("pointermove", (event) => {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    const now = spot(event);
    if (
      !moved &&
      pointers.size === 1 &&
      Math.hypot(now.x - last.x, now.y - last.y) < 5
    )
      return;
    if (!moved) scene.setPointerCapture(event.pointerId);
    moved = true;
    fitted = false;
    scene.classList.add("memory-panning");
    const other = [...pointers].find(([id]) => id !== event.pointerId)?.[1],
      drift = other ? 2 : 1;
    if (other)
      zoom(
        (Math.hypot(now.x - other.x, now.y - other.y) || 1) /
          (Math.hypot(last.x - other.x, last.y - other.y) || 1),
        (now.x + other.x) / 2,
        (now.y + other.y) / 2,
      );
    move({
      k: goal.k,
      x: goal.x + (now.x - last.x) / drift,
      y: goal.y + (now.y - last.y) / drift,
    });
    pointers.set(event.pointerId, now);
  });
  // A press can end anywhere, so its release is heard on the window.
  for (const type of ["pointerup", "pointercancel"])
    addEventListener(type, (event) => {
      pointers.delete(event.pointerId);
      if (pointers.size) return;
      pointing = false;
      scene.classList.remove("memory-panning");
    });
  scene.addEventListener("click", (event) => {
    if (!moved && !event.target.closest(".memory-node, .memory-topic-label"))
      select(null);
  });
  new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (!width || (width === size.w && height === size.h)) return;
    size.w = width;
    size.h = height;
    if (fitted) frame(shown);
  }).observe(scene);

  window.memoryGraph = {
    render(latest, memory, state) {
      onMemory = memory;
      onState = state;
      if (data?.conversation_id !== latest?.conversation_id) {
        el("memory-topic").value = "";
        el("memory-history").checked = false;
        placed.clear();
        selected = null;
        fitted = true;
        similar = { links: [] };
      }
      data = latest;
      const next = JSON.stringify([latest?.conversation_id, nodes()]);
      // Indexing happens during turns, so look again when the index moves.
      const index = next + (latest?.embedding_health?.event_id || "");
      if (latest?.conversation_id && index !== similarFor) {
        similarFor = index;
        loadSimilar(latest.conversation_id);
      }
      if (next === signature) return;
      signature = next;
      draw();
    },
    connections(kind, id) {
      return related((kind === "state" ? "state:" : "memory:") + id);
    },
    open,
    focus(kind, id) {
      (
        drawn.get((kind === "state" ? "state:" : "memory:") + id) ||
        el("memory-topic")
      ).focus();
    },
    setDisabled(value) {
      disabled = value;
      for (const group of drawn.values())
        group.setAttribute("aria-disabled", String(value));
      for (const id of ["memory-topic", "memory-history", "memory-similar"])
        el(id).disabled = value;
      el("memory-focus-open").disabled = value;
    },
  };
})();
