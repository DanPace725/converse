(() => {
  const el = (id) => document.getElementById(id);
  const panel = el("context-garden"),
    watch = el("context-watch");
  const svgNS = "http://www.w3.org/2000/svg";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const nodes = new Map(),
    historyNodes = new Map();
  let conversationId = null,
    cursor = 0,
    generation = 0,
    timer,
    animationTimer;
  let loading = false,
    replaying = false,
    queue = [],
    live = null,
    scene = null,
    locallyBusy = false;
  const protectedItem = (item) =>
    item.pinned || item.verbatim_required || !!item.state_key;
  const hash = (id) =>
    [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  const point = (id, outside = false, anchor = false) => {
    const h = hash(id),
      angle = ((h % 360) * Math.PI) / 180;
    const radius = outside ? 1 : (anchor ? 0.5 : 0.72) + ((h >>> 9) % 20) / 100;
    return {
      x: 200 + Math.cos(angle) * (outside ? 172 : 110) * radius,
      y: 146 + Math.sin(angle) * (outside ? 109 : 78) * radius,
    };
  };
  function svg(tag, attrs = {}, parent) {
    const node = document.createElementNS(svgNS, tag);
    for (const [key, value] of Object.entries(attrs))
      node.setAttribute(key, value);
    if (parent) parent.append(node);
    return node;
  }
  function move(node, position) {
    node.style.transform = `translate(${position.x}px, ${position.y}px)`;
  }
  function peek(item, source = false) {
    el("garden-detail").textContent =
      (source ? `Saved ${item.kind}` : item.state_key || item.type) +
      " · " +
      item.id.slice(-8) +
      "\n" +
      (item.preview || "(empty source)");
    window.workspaceEditor?.inspect(item, source);
  }
  function interactive(node, item, source = false) {
    node.setAttribute("tabindex", "0");
    node.setAttribute("role", "button");
    node.setAttribute(
      "aria-label",
      (source ? "Saved " + item.kind : item.state_key || item.type) +
        ": " +
        item.preview,
    );
    node.onclick = () => peek(item, source);
    node.onkeydown = (event) => {
      if (["Enter", " "].includes(event.key)) {
        event.preventDefault();
        peek(item, source);
      }
    };
    let title = node.querySelector("title");
    if (!title) title = svg("title", {}, node);
    title.textContent =
      (item.state_key || item.type || item.kind) + ": " + item.preview;
  }
  function draw(context, history, animate = true) {
    const previous = scene?.segments || [];
    scene = context;
    const shown = context.segments.slice(-64),
      ids = new Set(shown.map((item) => item.id));
    const sourceIds = new Set(history.items.map((item) => item.id));
    for (const [id, node] of historyNodes)
      if (!sourceIds.has(id)) {
        node.remove();
        historyNodes.delete(id);
      }
    for (const item of history.items) {
      let node = historyNodes.get(item.id);
      if (!node) {
        const p = point(item.id, true);
        node = svg(
          "circle",
          { cx: p.x, cy: p.y, r: 2.8, class: "garden-source" },
          el("garden-history"),
        );
        historyNodes.set(item.id, node);
      }
      interactive(node, item, true);
    }
    el("garden-links").replaceChildren();
    for (const [id, node] of nodes)
      if (!ids.has(id)) {
        nodes.delete(id);
        const successor = shown.find((item) =>
          item.parent_bundle_ids.includes(id),
        );
        move(
          node,
          successor && successor.type !== "reference"
            ? point(successor.id, false, protectedItem(successor))
            : point(
                previous.find((item) => item.id === id)?.source_event_ids[0] ||
                  id,
                true,
              ),
        );
        node.classList.add("garden-departing");
        setTimeout(() => node.remove(), animate && !reduced.matches ? 950 : 0);
      }
    for (const item of shown) {
      let node = nodes.get(item.id);
      const anchor = protectedItem(item),
        p = point(item.id, false, anchor);
      const color = anchor
        ? "garden-anchor"
        : item.type === "reference"
          ? "garden-reference"
          : item.type === "summary"
            ? "garden-summary"
            : "garden-raw";
      const radius =
        item.type === "reference"
          ? 4
          : Math.min(13, 4 + Math.log2(1 + item.chars) * 0.55);
      if (!node) {
        node = svg("g", { class: "garden-piece " + color }, el("garden-nodes"));
        svg("circle", { r: radius + 4, class: "garden-aura" }, node);
        svg("circle", { r: radius, class: "garden-seed" }, node);
        if (anchor)
          svg(
            "path",
            {
              d: `M 0 -${radius + 5} L ${radius + 5} 0 L 0 ${radius + 5} L -${radius + 5} 0 Z`,
              class: "garden-diamond",
            },
            node,
          );
        nodes.set(item.id, node);
        const parents = previous.filter((parent) =>
          item.parent_bundle_ids.includes(parent.id),
        );
        const start =
          item.type === "reference"
            ? point(item.source_event_ids[0] || item.id, true)
            : parents.length
              ? point(parents[0].id, false, protectedItem(parents[0]))
              : { x: 200, y: 255 };
        move(node, animate && !reduced.matches ? start : p);
        // Force the initial position to paint before the CSS transition.
        node.getBoundingClientRect();
        for (const parent of parents) {
          const from = point(parent.id, false, protectedItem(parent));
          svg(
            "path",
            {
              d: `M ${from.x} ${from.y} Q 200 146 ${p.x} ${p.y}`,
              class: "garden-lineage",
            },
            el("garden-links"),
          );
        }
      }
      move(node, p);
      interactive(node, item);
      svg(
        "line",
        { x1: 200, y1: 146, x2: p.x, y2: p.y, class: "garden-thread" },
        el("garden-links"),
      );
    }
    el("garden-working").textContent = context.segments.length;
    el("garden-anchors").textContent =
      context.segments.filter(protectedItem).length;
    el("garden-saved").textContent = history.count;
    // A text-size comparison, not the byte budget or reported provider usage.
    const fullTokens = Math.ceil(history.text_bytes / 4),
      workingTokens = Math.ceil(context.text_bytes / 4),
      savedTokens = fullTokens - workingTokens;
    const number = (value) => value.toLocaleString();
    el("garden-tokens-saved").textContent =
      fullTokens === 0
        ? "—"
        : savedTokens >= 0
          ? `~${number(savedTokens)} · ${Math.round((savedTokens / fullTokens) * 100)}%`
          : `~${number(-savedTokens)} more`;
    el("garden-token-comparison").textContent =
      `Full ~${number(fullTokens)} → working ~${number(workingTokens)} · text only`;
    el("garden-revision").textContent =
      `REVISION ${context.revision}` +
      (context.segments.length > 64 || history.count > 96
        ? " · newest points shown"
        : " · ORIGINAL SOURCES STAY SAVED");
  }
  function describe(event) {
    if (!event)
      return ["Ready to grow", "The next saved message will appear here."];
    const kind = event.kind,
      label = event.label;
    if (kind === "inference_request")
      return [
        label.includes("selection") || label.includes("decision")
          ? "Choosing what matters"
          : label.includes("compaction")
            ? "Gathering older context"
            : "Preparing the reply",
        "A model request was recorded.",
      ];
    if (kind === "context_transform")
      return [
        label.includes("offload")
          ? "Making room"
          : label.includes("edit")
            ? "Gathering pieces together"
            : label.includes("state")
              ? "Anchoring a detail"
              : "Growing the working context",
        label.includes("offload")
          ? "Older pieces became references. Their original sources remain saved."
          : label.includes("edit")
            ? "Derived pieces carry links to the original sources."
            : label.includes("state")
              ? "Remembered state is protected in the working context."
              : "A saved revision changed the working context.",
      ];
    if (kind === "decision_proposal" || kind === "attention_decision")
      return [
        "Weighing the context",
        "Outlined pieces were selected for compaction; bright rings mark proposed retention.",
      ];
    if (kind === "tool_call" || kind === "tool_result")
      return [
        "Looking through saved context",
        "A recorded tool exchange is being shown.",
      ];
    if (kind.includes("failure") || kind.includes("rejection"))
      return [
        "A request hit a problem",
        "The recorded failure remains available in JSON export.",
      ];
    if (kind === "context_skip")
      return [
        "Keeping the current pieces",
        "The proposed compaction was skipped.",
      ];
    if (kind === "turn_complete")
      return [
        "Ready for the next thought",
        "The reply and context changes are saved.",
      ];
    if (kind === "inference_response")
      return ["Model response received", "The model response was recorded."];
    if (kind === 'reasoning') return ['Reasoning summary saved', 'Provider-reported rationale is retained as a searchable source.'];
    return [
      kind === "user"
        ? "A new thought arrives"
        : kind === "assistant"
          ? "A reply joins the garden"
          : "A document joins the history",
      "The original source is saved.",
    ];
  }
  function signal(event) {
    const [phase, caption] = describe(event);
    el("garden-phase").textContent = phase;
    el("garden-caption").textContent = caption;
    panel.classList.toggle(
      "garden-thinking",
      event?.kind === "inference_request",
    );
    for (const [id, node] of nodes) {
      node.classList.toggle(
        "garden-selected",
        !!event?.selected_ids.includes(id),
      );
      node.classList.toggle(
        "garden-retained",
        !!event?.retained_ids.includes(id),
      );
    }
    for (const [id, node] of historyNodes)
      node.classList.toggle(
        "garden-retrieved",
        !!event?.source_ids.includes(id),
      );
  }
  function clearAnimation() {
    clearTimeout(animationTimer);
    animationTimer = null;
    queue = [];
    for (const node of panel.querySelectorAll(".garden-departing"))
      node.remove();
  }
  function drain() {
    if (panel.hidden || document.hidden) return;
    const item = queue.shift();
    if (!item) {
      if (replaying) {
        replaying = false;
        el("garden-replay").textContent = "Replay recent changes";
      }
      if (live) {
        draw(live.context, live.history);
        signal(live.latest);
        panel.classList.toggle("garden-thinking", live.busy);
      }
      el("garden-mode").textContent = "LIVE";
      animationTimer = null;
      schedule();
      return;
    }
    if (item.context) draw(item.context, item.history);
    signal(item);
    if (replaying) el("garden-mode").textContent = "REPLAY";
    animationTimer = setTimeout(
      drain,
      reduced.matches
        ? 350
        : item.context || item.kind === "inference_request"
          ? 1000
          : 280,
    );
  }
  function schedule(delay = locallyBusy || live?.busy ? 1200 : 15000) {
    clearTimeout(timer);
    if (!panel.hidden && !document.hidden && !replaying && conversationId)
      timer = setTimeout(poll, delay);
  }
  async function fetchActivity(replay = false, initial = false) {
    const response = await fetch(
      `/api/conclave?action=activity&conversation=${encodeURIComponent(conversationId)}&after=${initial ? 0 : cursor}${replay ? "&replay=1" : ""}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw Error("The context feed is unavailable.");
    return response.json();
  }
  async function poll(initial = false) {
    if (
      loading ||
      replaying ||
      panel.hidden ||
      document.hidden ||
      !conversationId
    )
      return;
    const token = generation;
    let nextDelay;
    loading = true;
    try {
      const data = await fetchActivity(false, initial);
      if (token !== generation || panel.hidden || replaying) return;
      const first = !live;
      live = data;
      cursor = data.cursor;
      el("garden-replay").disabled = data.context.revision === 0;
      if (first || initial) {
        draw(data.context, data.history, false);
        signal(data.latest);
        el("garden-mode").textContent = "LIVE";
      } else {
        queue.push(...data.events);
        if (!animationTimer) drain();
      }
      if (!data.busy && !queue.length)
        panel.classList.remove("garden-thinking");
      if (data.has_more) nextDelay = 150;
    } catch (error) {
      if (token === generation) {
        el("garden-mode").textContent = "OFFLINE";
        el("garden-phase").textContent = "Waiting for the server";
        el("garden-caption").textContent = error.message;
        panel.classList.remove("garden-thinking");
        nextDelay = 30000;
      }
    } finally {
      loading = false;
      schedule(nextDelay);
    }
  }
  function reset() {
    generation++;
    cursor = 0;
    live = null;
    scene = null;
    replaying = false;
    clearTimeout(timer);
    clearAnimation();
    nodes.clear();
    historyNodes.clear();
    for (const id of ["garden-nodes", "garden-history", "garden-links"])
      el(id).replaceChildren();
    for (const id of ["garden-working", "garden-anchors", "garden-saved"])
      el(id).textContent = "0";
    el("garden-mode").textContent = "LIVE";
    el("garden-phase").textContent = "Waiting for a conversation";
    el("garden-caption").textContent =
      "Start or open a context chat to watch it grow.";
    el("garden-detail").textContent =
      "Select a point to peek inside. Size reflects text length.";
    el("garden-revision").textContent = "Waiting for saved context";
    el("garden-tokens-saved").textContent = "—";
    el("garden-token-comparison").textContent =
      "Full conversation → working context";
    el("garden-replay").textContent = "Replay recent changes";
    el("garden-replay").disabled = true;
    panel.classList.remove("garden-thinking");
  }
  function close() {
    panel.hidden = true;
    watch.setAttribute("aria-expanded", "false");
    generation++;
    clearTimeout(timer);
    clearAnimation();
    replaying = false;
    el("garden-replay").textContent = "Replay recent changes";
  }
  watch.onclick = () => {
    if (!panel.hidden) return close();
    window.workspaceEditor?.close();
    panel.hidden = false;
    watch.setAttribute("aria-expanded", "true");
    el("garden-close").focus();
    poll(true);
  };
  el("garden-close").onclick = () => {
    close();
    watch.focus();
  };
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      close();
      watch.focus();
    }
  });
  el("garden-replay").onclick = async () => {
    if (replaying) {
      generation++;
      clearAnimation();
      replaying = false;
      el("garden-replay").textContent = "Replay recent changes";
      poll(true);
      return;
    }
    const token = ++generation;
    clearTimeout(timer);
    clearAnimation();
    replaying = true;
    el("garden-replay").textContent = "Return to live";
    el("garden-mode").textContent = "REPLAY";
    try {
      const data = await fetchActivity(true);
      if (token !== generation || panel.hidden) return;
      live = data;
      cursor = data.cursor;
      draw(data.initial_context, data.initial_history, false);
      queue = data.events;
      drain();
    } catch {
      if (token !== generation) return;
      replaying = false;
      el("garden-replay").textContent = "Replay recent changes";
      poll(true);
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearTimeout(timer);
      clearTimeout(animationTimer);
      animationTimer = null;
    } else if (!panel.hidden) {
      if (queue.length || replaying) drain();
      else poll(true);
    }
  });
  window.contextGarden = {
    close,
    setActive: (value) => {
      locallyBusy = value;
      schedule(0);
    },
    adopt: (id) => {
      if ((id || null) === conversationId) return;
      reset();
      conversationId = id || null;
      if (!panel.hidden && conversationId) poll(true);
    },
  };
})();
