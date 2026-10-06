// A read-only map of saved relationships. Layout proximity never creates an edge.
(() => {
  const el = (id) => document.getElementById(id),
    ns = "http://www.w3.org/2000/svg";
  const pageSize = 12;
  let data = null,
    onMemory,
    onState,
    page = 0,
    signature = "",
    disabled = false;
  const clean = (text) =>
    String(text || "")
      .replace(/\s+/g, " ")
      .trim();
  const short = (text, length) =>
    clean(text).length > length
      ? clean(text).slice(0, length - 1) + "…"
      : clean(text);
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
  function open(node) {
    if (disabled) return;
    (node.kind === "named" ? onState : onMemory)?.(node.id);
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
    const filtered = all.filter(
      (n) =>
        (!topicSelect.value || n.topic === topicSelect.value) &&
        (el("memory-history").checked || n.status !== "superseded"),
    );
    // Keep topic groups stable across polling, corrections and page changes.
    filtered.sort(
      (a, b) => a.topic.localeCompare(b.topic) || a.key.localeCompare(b.key),
    );
    page = Math.max(
      0,
      Math.min(page, Math.ceil(filtered.length / pageSize) - 1),
    );
    const shown = filtered.slice(page * pageSize, (page + 1) * pageSize),
      positions = new Map(),
      groups = [];
    let y = 14;
    for (const topic of new Set(shown.map((n) => n.topic))) {
      const group = shown.filter((n) => n.topic === topic),
        start = y;
      y += 36;
      group.forEach((node, index) =>
        positions.set(node.key, {
          x: index % 2 ? 292 : 108,
          y: y + Math.floor(index / 2) * 118 + 27,
        }),
      );
      y += Math.ceil(group.length / 2) * 118;
      groups.push({ start, height: y - start, name: group[0].topicName });
      y += 12;
    }
    const scene = el("memory-scene");
    scene.replaceChildren();
    scene.hidden = !shown.length;
    scene.setAttribute("viewBox", `0 0 400 ${Math.max(160, y)}`);
    for (const group of groups) {
      svg(
        "rect",
        {
          x: 6,
          y: group.start,
          width: 388,
          height: group.height,
          rx: 28,
          class: "memory-bed",
        },
        scene,
      );
      const title = svg(
        "text",
        { x: 22, y: group.start + 25, class: "memory-topic-label" },
        scene,
        short(group.name, 43),
      );
      svg("title", {}, title, group.name);
    }
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
    const connections = edges(all),
      visible = connections.filter(
        (e) => positions.has(e.from.key) && positions.has(e.to.key),
      );
    for (const edge of visible) {
      const a = positions.get(edge.from.key),
        b = positions.get(edge.to.key);
      const dx = b.x - a.x,
        dy = b.y - a.y,
        length = Math.hypot(dx, dy),
        inset = 25;
      const path = svg(
        "path",
        {
          d: `M ${a.x + (dx / length) * inset} ${a.y + (dy / length) * inset} Q 200 ${(a.y + b.y) / 2 - 28} ${b.x - (dx / length) * inset} ${b.y - (dy / length) * inset}`,
          class: "memory-edge memory-edge-" + edge.type,
          "marker-end":
            edge.type === "conflicts_with" ? "" : "url(#memory-arrow)",
        },
        scene,
      );
      svg(
        "title",
        {},
        path,
        `${short(edge.from.content, 65)} → ${edge.label.toLowerCase()} → ${short(edge.to.content, 65)}`,
      );
    }
    for (const node of shown) {
      const p = positions.get(node.key),
        inactive = ["suppressed", "superseded", "invalidated"].includes(
          node.status,
        );
      const group = svg(
        "g",
        {
          transform: `translate(${p.x} ${p.y})`,
          class: `memory-node memory-${node.kind}${inactive ? " memory-inactive" : ""}`,
          tabindex: disabled ? -1 : 0,
          role: "button",
          "aria-disabled": String(disabled),
          "data-memory-id": node.id,
          "data-memory-kind": node.kind,
          "aria-label": `${node.kind === "named" ? node.id : node.kind}: ${clean(node.content)} · ${node.status} · ${node.tier} in last projection`,
        },
        scene,
      );
      svg(
        "title",
        {},
        group,
        `${node.id}\n${node.content}\n${node.status} · ${node.tier} in last projection\nOpen to inspect sources and connections.`,
      );
      svg(
        "rect",
        {
          x: -86,
          y: -24,
          width: 172,
          height: 111,
          rx: 14,
          class: "memory-hit",
        },
        group,
      );
      if (node.tier === "full")
        svg("circle", { r: 25, class: "memory-active-ring" }, group);
      svg(
        node.kind === "named" ? "path" : "circle",
        node.kind === "named"
          ? { d: "M 0 -18 L 18 0 L 0 18 L -18 0 Z", class: "memory-seed" }
          : { r: 18, class: "memory-seed" },
        group,
      );
      if (node.tier === "stub") group.classList.add("memory-pointer");
      svg(
        "path",
        {
          d: "M 0 9 L 0 -6 M 0 0 Q -13 0 -9 -8 Q 0 -9 0 0 M 0 -3 Q 12 -4 9 -12 Q 0 -12 0 -3",
          class: "memory-sprout",
        },
        group,
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
        { y: 76, "text-anchor": "middle", class: "memory-status" },
        group,
        inactive
          ? node.status
          : node.kind === "named"
            ? short(node.id, 24)
            : `${node.kind} · ${node.tier === "full" ? "full" : node.tier === "stub" ? "pointer" : "saved"}`,
      );
      group.onclick = () => open(node);
      group.onkeydown = (event) => {
        if (["Enter", " "].includes(event.key)) {
          event.preventDefault();
          open(node);
        }
      };
    }
    el("memory-graph-status").textContent = !all.length
      ? "No saved memories yet. Add a detail below, or continue the conversation."
      : !shown.length
        ? "No memories in this view. Try another topic or include earlier versions."
        : `${filtered.length} memories · ${visible.length} ${visible.length === 1 ? "connection" : "connections"} shown. Select a memory for sources and all connections.`;
    el("memory-page").textContent = filtered.length
      ? `${page * pageSize + 1}–${Math.min(filtered.length, (page + 1) * pageSize)} of ${filtered.length}`
      : "0 memories";
    el("memory-previous").disabled = disabled || page === 0;
    el("memory-next").disabled =
      disabled || (page + 1) * pageSize >= filtered.length;
    el("memory-topic").disabled = disabled;
    el("memory-history").disabled = disabled;
  }
  el("memory-topic").onchange = el("memory-history").onchange = () => {
    page = 0;
    draw();
  };
  function turnPage(change, focus) {
    page += change;
    draw();
    el(focus).focus({ preventScroll: true });
    el("memory-graph").scrollIntoView({ block: "start" });
  }
  el("memory-previous").onclick = () => turnPage(-1, "memory-next");
  el("memory-next").onclick = () => turnPage(1, "memory-previous");
  window.memoryGraph = {
    render(view, memory, state) {
      onMemory = memory;
      onState = state;
      if (data?.conversation_id !== view?.conversation_id) {
        page = 0;
        el("memory-topic").value = "";
        el("memory-history").checked = false;
      }
      data = view;
      const next = JSON.stringify([view?.conversation_id, nodes()]);
      if (next === signature) return;
      signature = next;
      draw();
    },
    connections(kind, id) {
      const key = (kind === "state" ? "state:" : "memory:") + id;
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
    },
    open,
    focus(kind, id) {
      const node = [
        ...el("memory-scene").querySelectorAll("[data-memory-id]"),
      ].find(
        (n) =>
          n.dataset.memoryId === id &&
          (kind === "state"
            ? n.dataset.memoryKind === "named"
            : n.dataset.memoryKind !== "named"),
      );
      (node || el("memory-topic")).focus();
    },
    setDisabled(value) {
      disabled = value;
      for (const node of el("memory-scene").querySelectorAll(
        '[role="button"]',
      )) {
        node.setAttribute("aria-disabled", String(value));
        node.setAttribute("tabindex", value ? "-1" : "0");
      }
      el("memory-topic").disabled = value;
      el("memory-history").disabled = value;
      const count = nodes().filter(
        (n) =>
          (!el("memory-topic").value || n.topic === el("memory-topic").value) &&
          (el("memory-history").checked || n.status !== "superseded"),
      ).length;
      el("memory-previous").disabled = value || page === 0;
      el("memory-next").disabled = value || (page + 1) * pageSize >= count;
    },
  };
})();
