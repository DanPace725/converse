// textContent keeps provider summaries inert; answer Markdown/copy is independent.
window.reasoningUI = (() => {
  const opened = new Set();
  function show(article, value, key = "response") {
    const records = Array.isArray(value) ? value : [value];
    for (const [index, record] of records.entries()) {
      if (!record || (!record.text && !record.opaque_available)) continue;
      const id = record.request_id || key + ":" + index;
      let details = [...article.querySelectorAll(".reasoning-summary")].find(
        (el) => el.dataset.reasoningId === id,
      );
      if (!details) {
        details = document.createElement("details");
        details.className = "reasoning-summary";
        details.dataset.reasoningId = id;
        details.open = opened.has(id);
        details.append(
          document.createElement("summary"),
          document.createElement("div"),
        );
        details.addEventListener("toggle", () =>
          details.open ? opened.add(id) : opened.delete(id),
        );
        article.append(details);
      }
      const provider =
        { openai: "GPT", anthropic: "Claude", gemini: "Gemini" }[
          record.provider
        ] || record.provider;
      details.firstChild.textContent =
        "Reasoning summary" +
        (provider ? " · " + provider : "") +
        (record.model ? " · " + record.model : "") +
        (record.status === "partial" ? " · partial" : "");
      details.lastChild.textContent =
        (record.provider ? record.provider + " · " : "") +
        "Provider-reported rationale\n\n" +
        (record.text ||
          "Only opaque reasoning was returned. Its text is unavailable.") +
        (record.status === "incomplete"
          ? "\n\n[Incomplete provider response]"
          : record.status === "failed"
            ? "\n\n[Failed provider response]"
            : "");
    }
  }
  function delta(article, record, part) {
    record.blocks ||= {};
    record.blocks[part.block || "0"] =
      (record.blocks[part.block || "0"] || "") + part.delta;
    record.text = Object.values(record.blocks).join("\n\n");
    show(article, record);
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
  return { show, delta, markdown };
})();
