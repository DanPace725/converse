// Reasoning appears as a compact thought trail: one line with the latest
// snippet; expanding lists each model step, and each step reveals its text.
// textContent keeps provider summaries inert; answer Markdown/copy is independent.
window.reasoningUI = (() => {
  const expanded = new Set(),
    openedSteps = new Set(),
    providers = { openai: "GPT", anthropic: "Claude", gemini: "Gemini" };
  const usable = (r) => r && (r.text || r.opaque_available);
  // OpenAI summaries lead with **Headings**; Claude thinking is prose.
  function snippet(record) {
    const text = record?.text || "";
    if (!text) return record?.opaque_available ? "Reasoning hidden by the provider" : "";
    const headings = [...text.matchAll(/\*\*([^*\n]{3,140})\*\*/g)];
    let line = headings.at(-1)?.[1];
    if (!line) {
      const clean = text.replace(/\s+/g, " ").trim();
      line = clean.match(/[^.!?]+[.!?]+/g)?.at(-1) || clean;
    }
    line = line.trim();
    return line.length > 96 ? line.slice(0, 95).trimEnd() + "…" : line;
  }
  function trail(key) {
    const el = document.createElement("div"),
      toggle = document.createElement("button"),
      list = document.createElement("ol");
    el.className = "thoughts";
    el.dataset.key = key;
    toggle.type = "button";
    toggle.className = "thoughts-toggle";
    for (const part of ["icon", "label", "snippet", "meta", "chevron"]) {
      const span = document.createElement("span");
      span.className = "thoughts-" + part;
      if (part === "icon" || part === "chevron")
        span.setAttribute("aria-hidden", "true");
      toggle.append(span);
    }
    list.className = "thoughts-steps";
    list.hidden = !expanded.has(key);
    toggle.setAttribute("aria-expanded", String(!list.hidden));
    toggle.onclick = () => {
      list.hidden = !list.hidden;
      toggle.setAttribute("aria-expanded", String(!list.hidden));
      if (list.hidden) expanded.delete(key);
      else {
        expanded.add(key);
        // A single step has nothing to choose between; show its text.
        if (list.children.length === 1) list.querySelector("details").open = true;
      }
    };
    el.append(toggle, list);
    el.records = new Map();
    return el;
  }
  function find(target, key) {
    if (target?.classList?.contains("thoughts")) return target;
    let el = target?.querySelector(":scope > .thoughts");
    if (!el) {
      el = trail(key);
      const head = target?.querySelector(":scope > .msg-head");
      if (head) head.after(el);
      else target?.append(el);
    }
    return el;
  }
  function step(list, id) {
    let details = [...list.querySelectorAll("details")].find(
      (d) => d.dataset.reasoningId === id,
    );
    if (details) return details;
    const item = document.createElement("li");
    details = document.createElement("details");
    details.dataset.reasoningId = id;
    details.open = openedSteps.has(id);
    details.append(document.createElement("summary"), document.createElement("div"));
    details.lastChild.className = "thought-text";
    details.addEventListener("toggle", () =>
      details.open ? openedSteps.add(id) : openedSteps.delete(id),
    );
    item.append(details);
    list.append(item);
    return details;
  }
  function paint(el) {
    const records = [...el.records.values()];
    const live = el.dataset.state === "live";
    const latest = records.at(-1);
    const partial = records.some((r) => r.status && !["completed", "partial"].includes(r.status)) ||
      (!live && records.some((r) => r.status === "partial"));
    const [label, snip, meta, toggle] = ["label", "snippet", "meta"]
      .map((p) => el.querySelector(".thoughts-" + p))
      .concat(el.querySelector(".thoughts-toggle"));
    label.textContent = live
      ? records.length > 1 ? `Thinking · step ${records.length}` : "Thinking"
      : (records.length > 1 ? `Thought · ${records.length} steps` : "Thought") +
        (partial ? " · partial" : "");
    snip.textContent = snippet(latest) || el.dataset.activity || "";
    meta.textContent = live ? el.dataset.meta || "" : "";
    toggle.disabled = !records.length;
    const list = el.querySelector(".thoughts-steps");
    records.forEach((record, index) => {
      const details = step(list, record.request_id || "step:" + index);
      const provider = providers[record.provider] || record.provider || "";
      details.firstChild.textContent =
        (records.length > 1 ? index + 1 + ". " : "") +
        (snippet(record) || "Reasoning") +
        (record.status && record.status !== "completed" ? ` (${record.status})` : "");
      details.lastChild.textContent =
        (record.text?.replace(/\*\*([^*\n]+)\*\*/g, "$1") ||
          "Only opaque reasoning was returned. Its text is unavailable.") +
        (provider || record.model ? `\n\n${[provider, record.model].filter(Boolean).join(" · ")} · provider-reported rationale` : "") +
        (record.status === "incomplete" ? "\n[Incomplete provider response]" : record.status === "failed" ? "\n[Failed provider response]" : "");
    });
    el.hidden = !records.length && !live;
  }
  // Adds or replaces records (keyed by request) in an article or trail.
  function show(target, value, key = "response") {
    const records = (Array.isArray(value) ? value : [value]).filter(usable);
    if (!records.length && !target?.querySelector?.(":scope > .thoughts") && !target?.classList?.contains("thoughts")) return null;
    const el = find(target, key);
    records.forEach((record, index) =>
      el.records.set(record.request_id || key + ":" + index, record),
    );
    paint(el);
    return el;
  }
  // A detached trail for messages that show reasoning outside an article.
  function detached(value, key) {
    const records = (Array.isArray(value) ? value : [value]).filter(usable);
    if (!records.length) return null;
    const el = trail(key);
    return show(el, records, key);
  }
  function delta(target, record, part) {
    record.blocks ||= {};
    record.blocks[part.block || "0"] = (record.blocks[part.block || "0"] || "") + part.delta;
    record.text = Object.values(record.blocks).join("\n\n");
    return show(target, record);
  }
  // Live trails show a moving status line until the reply settles.
  function live(target, on, { activity, meta, key = "live" } = {}) {
    const el = find(target, key);
    el.dataset.state = on ? "live" : "done";
    if (activity !== undefined) el.dataset.activity = activity;
    if (meta !== undefined) el.dataset.meta = meta;
    paint(el);
    return el;
  }
  function markdown(value) {
    return (Array.isArray(value) ? value : [value])
      .filter((r) => r?.text)
      .map(
        (r) =>
          "\n\n### Reasoning summary · " +
          (r.provider || "") +
          " " +
          (r.model || "") +
          "\n\nProvider-reported rationale" +
          (r.status && r.status !== "completed" ? " (" + r.status + ")" : "") +
          "\n\n" +
          r.text,
      )
      .join("");
  }
  return { show, detached, delta, live, snippet, markdown };
})();
