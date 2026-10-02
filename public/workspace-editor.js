// Text UI over authoritative conversation storage. Drafts belong to this tab.
(() => {
  const el = (id) => document.getElementById(id),
    panel = el("workspace-editor");
  let view = null,
    tab = "documents",
    selected = null,
    editing = false,
    preview = false,
    saving = false,
    timer,
    loading = false;
  let drafts = {},
    listSignature = "",
    inspection = 0,
    saveError = "";
  try {
    const saved = JSON.parse(
      sessionStorage.getItem("converse-editor-drafts") || "{}",
    );
    if (saved && typeof saved === "object" && !Array.isArray(saved))
      drafts = saved;
  } catch {}
  const keyOf = (item) =>
    view.conversation_id + ":" + item.kind + ":" + item.id;
  const draft = () => selected && drafts[keyOf(selected)];
  const persist = () => {
    try {
      sessionStorage.setItem("converse-editor-drafts", JSON.stringify(drafts));
    } catch {
      el("editor-feedback").textContent =
        "Draft remains in this page; browser storage is full. Download it before reloading.";
    }
  };
  function documents() {
    return [
      ...(view?.workspace || []).map((f) => ({
        kind: "document",
        id: f.path,
        title: f.path,
        content: f.content,
        token: f.source_event_id,
        path: f.path,
        author: f.source_attribution,
      })),
      ...(view?.attachments || []).map((f) => ({
        kind: "source",
        id: f.source_event_id,
        title: f.name + " (original)",
        content: f.content,
        token: f.source_event_id,
        name: f.name,
      })),
    ];
  }
  function items() {
    if (!view) return [];
    if (tab === "documents") return documents();
    const segments =
      tab === "state"
        ? view.state.entries
        : view.context.segments.filter((s) => !s.state_key);
    return segments.map((s) => ({
      kind: tab,
      id: tab === "state" ? s.state_key : s.id,
      title: s.state_key || s.type + " · " + s.id.slice(-8),
      content: s.content,
      token: s.id,
      section: s,
      protected: !!(
        s.pinned ||
        s.verbatim_required ||
        (tab === "context" && s.type === "reference")
      ),
    }));
  }
  function latest(item = selected) {
    if (!item || !view) return null;
    if (item.kind === "document" || item.kind === "source")
      return (
        documents().find((i) => i.kind === item.kind && i.id === item.id) ||
        (item.kind === "source" ? item : null)
      );
    const s = (
      item.kind === "state" ? view.state.entries : view.context.segments
    ).find((s) =>
      item.kind === "state" ? s.state_key === item.id : s.id === item.id,
    );
    return s
      ? {
          ...item,
          content: s.content,
          token: s.id,
          section: s,
          protected: !!(
            s.pinned ||
            s.verbatim_required ||
            (item.kind === "context" && s.type === "reference")
          ),
        }
      : null;
  }
  function stale() {
    const d = draft();
    if (!d) return false;
    if (selected.newEntry) return view.context.revision !== d.revision;
    const current = latest();
    return (
      !current ||
      current.token !== d.token ||
      (["context", "state"].includes(selected.kind) &&
        view.context.revision !== d.revision)
    );
  }
  function syncControls() {
    const blocked =
      busy || saving || !view || view.busy || view.agent?.status === "running";
    for (const field of panel.querySelectorAll(
      "textarea, input, select, #editor-items button, #editor-tabs button, #editor-history button, #editor-reference, #editor-edit, #editor-discard, #editor-latest, #editor-new-state",
    ))
      field.disabled = saving;
    el("editor-state-key").disabled = saving || !selected?.newEntry;
    el("editor-save").disabled = blocked || stale();
    el("editor-upload").disabled = busy || saving || view?.busy || view?.agent?.status === "running";
    el("editor-use").disabled = blocked;
    el("editor-feedback").classList.toggle("error", stale() || !!saveError);
    if (editing && !saving)
      el("editor-feedback").textContent =
        saveError ||
        (stale()
          ? "The saved version changed. Your draft is preserved. Download it or copy your changes, then load the latest version."
          : blocked
            ? "You can edit a draft while the model works. Stop the agent or wait for the reply before saving."
            : "Unsaved draft · Save records a new version without a model call.");
    el("editor-latest").hidden = !stale();
  }
  function renderPreview(text) {
    const target = el("editor-preview");
    if (selected?.kind === "context" || selected?.kind === "state") {
      target.className = "plain-text";
      target.textContent = text;
      return;
    }
    renderReply(target, text);
  }
  function renderList() {
    const container = el("editor-items");
    const rows = items();
    for (const d of Object.values(drafts).filter(
      (d) =>
        d.conversation === view?.conversation_id &&
        (tab === "documents"
          ? ["document", "source"].includes(d.item.kind)
          : d.item.kind === tab),
    )) {
      if (!rows.some((i) => i.kind === d.item.kind && i.id === d.item.id))
        rows.push({ ...d.item, detached: true });
    }
    const signature = JSON.stringify([
      view?.conversation_id,
      tab,
      view?.context.revision,
      selected?.kind,
      selected?.id,
      rows.map((i) => [i.kind, i.id, i.token, !!drafts[keyOf(i)]]),
    ]);
    if (signature === listSignature) return;
    listSignature = signature;
    const expanded = new Set(
      [...container.querySelectorAll("details[open]")].map(
        (d) => d.dataset.item,
      ),
    );
    container.replaceChildren();
    for (const item of rows) {
      const button = document.createElement("button");
      button.type = "button";
      const hasDraft = !!drafts[keyOf(item)];
      button.textContent = item.title + (hasDraft ? " · draft" : "");
      button.dataset.item = item.id;
      if (selected?.id === item.id && selected.kind === item.kind)
        button.setAttribute("aria-current", "true");
      button.onclick = () => select(item);
      if (tab === "documents" || item.detached) container.append(button);
      else {
        const detail = document.createElement("details"),
          summary = document.createElement("summary"),
          text = document.createElement("p");
        detail.dataset.item = item.id;
        detail.open = expanded.has(item.id);
        summary.textContent = item.title + (hasDraft ? " · draft" : "");
        text.textContent = item.content;
        button.textContent = "Open " + (tab === "state" ? "entry" : "section");
        detail.append(summary, text, button);
        container.append(detail);
      }
    }
    el("editor-note").textContent = !view
      ? "Upload a Markdown or plain text document to start a saved workspace. Up to 100 KB per file."
      : tab === "documents"
        ? rows.length
          ? "Original uploads and current workspace files. Edited originals save as workspace copies."
          : "Upload Markdown or plain text here without sending a message. Up to 100 KB per file."
        : tab === "context"
          ? "Working context · revision " +
            view.context.revision +
            ". References and pinned text are protected."
          : "Remembered state · revision " +
            view.state.revision +
            ". Edit an entry or add a named detail.";
    el("editor-new-state").hidden = tab !== "state" || !view;
    el("editor-upload-controls").hidden = tab !== "documents";
    el("editor-upload-status").hidden = tab !== "documents";
  }
  function show() {
    if (!selected) {
      el("editor-document").hidden = true;
      return;
    }
    const d = draft();
    el("editor-document").hidden = false;
    el("editor-use").hidden = selected.kind !== "document";
    el("editor-title").textContent = selected.title;
    el("editor-meta").textContent = selected.historical
      ? "Saved historical text · read only"
      : selected.kind === "document"
        ? "Workspace file · version " + selected.token.slice(-8)
        : selected.kind === "source"
          ? "Original source · preserved in history. Edit creates a workspace copy."
          : "Source-linked " +
            (selected.kind === "state" ? "state entry" : "context section") +
            (selected.protected ? " · protected" : "");
    if (selected.kind === 'document' && selected.author) {
      const author = selected.author;
      const who = author.actor === 'human' ? 'You' :
        (author.provider === 'anthropic' ? 'Claude' : author.provider === 'openai' ? 'GPT' : author.actor) +
          ' · ' + (author.model || 'model unknown');
      el('editor-meta').textContent += ' · Last edit by ' + who;
    }
    if (selected.section?.type === 'evidence' && selected.section.source_event_ids.length === 1) {
      const file = view.workspace?.find(f => f.source_event_id === selected.section.source_event_ids[0]);
      if (file && selected.content === `Workspace ${file.path}; source ${file.source_event_id}.\n${file.content.slice(0, 2000)}` && file.content.length > 2000)
        el('editor-meta').textContent += ` · Partial excerpt: first 2000 characters; ${file.content.length - 2000} more characters. Open the file in Documents for full text.`;
    }
    const history = el('editor-history'), revisions = selected.section?.relations?.supersedes || [];
    history.hidden = selected.kind !== 'state' || !revisions.length;
    el('editor-history-items').replaceChildren(...revisions.map(id => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Open previous revision · ' + id.slice(-8);
      button.onclick = () => inspect({ id, state_key: selected.section.state_key }, false);
      return button;
    }));
    el('editor-reference').hidden = !selected.section?.ref_bundle_id;
    el('editor-reference').onclick = () => inspect({ id: selected.section.ref_bundle_id }, false);
    el("editor-edit").hidden =
      editing || !!selected.protected || !!selected.historical;
    el("editor-preview-toggle").hidden = !editing;
    el("editor-preview-toggle").textContent = preview ? "Text" : "Preview";
    el("editor-discard").hidden = !d;
    el("editor-save").hidden = !editing;
    el("editor-save").textContent =
      selected.kind === "source" ? "Save workspace copy" : "Save";
    el("editor-path-row").hidden = !editing || selected.kind !== "source";
    el("editor-state-fields").hidden = !editing || selected.kind !== "state";
    el("editor-text").hidden = !editing || preview;
    el("editor-preview").hidden = editing && !preview;
    if (d) {
      el("editor-text").value = d.text;
      el("editor-path").value = d.path || "";
      el("editor-state-key").value = d.stateKey || "";
      el("editor-state-key").disabled = !selected.newEntry;
      el("editor-state-type").value = d.type || "constraint";
      el("editor-state-status").value = d.status || "active";
    }
    renderPreview(d?.text ?? selected.content);
    el("editor-feedback").textContent = selected.protected
      ? "This text is protected from direct editing."
      : "";
    syncControls();
  }
  function select(item) {
    inspection++;
    saveError = "";
    selected = item;
    editing = !!draft();
    preview = false;
    renderList();
    show();
  }
  function setTab(value) {
    inspection++;
    saveError = "";
    tab = value;
    panel.dataset.tab = tab;
    selected = null;
    editing = false;
    for (const button of el("editor-tabs").querySelectorAll("button")) {
      const active = button.dataset.tab === tab;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    }
    el("editor-pane").setAttribute("aria-labelledby", "tab-" + tab);
    renderList();
    const pending = Object.values(drafts).find(
      (d) =>
        d.conversation === view?.conversation_id &&
        (tab === "documents"
          ? ["document", "source"].includes(d.item.kind)
          : d.item.kind === tab),
    );
    select(pending?.item || items()[0] || null);
  }
  function adopt(data) {
    const changed = view?.conversation_id !== data?.conversation_id;
    if (
      !changed &&
      data &&
      view &&
      data.context.revision < view.context.revision
    )
      return;
    if (changed) inspection++;
    if (changed && !saving) el("editor-upload-status").textContent = "";
    view = data;
    if (changed) {
      setTab(tab);
      return;
    }
    if (selected && !draft()) selected = latest() || selected;
    renderList();
    show();
  }
  async function refresh() {
    if (loading || !window.contextLayer?.currentId()) return;
    const id = window.contextLayer.currentId();
    loading = true;
    try {
      const data = await window.contextLayer.refreshView();
      if (id === window.contextLayer.currentId()) adopt(data);
    } catch (error) {
      el("editor-feedback").textContent =
        error.message + " Your draft is preserved.";
    } finally {
      loading = false;
    }
  }
  function schedule() {
    clearTimeout(timer);
    if (!panel.hidden && !document.hidden)
      timer = setTimeout(async () => {
        await refresh();
        schedule();
      }, 2500);
  }
  function open() {
    window.contextGarden?.close();
    panel.hidden = false;
    document.body.classList.add("workspace-visible");
    el("workspace-open").setAttribute("aria-expanded", "true");
    if (window.contextLayer?.editorView())
      adopt(window.contextLayer.editorView());
    refresh();
    schedule();
    el("editor-close").focus();
  }
  function close() {
    inspection++;
    panel.hidden = true;
    document.body.classList.remove("workspace-visible");
    clearTimeout(timer);
    el("workspace-open").setAttribute("aria-expanded", "false");
  }
  function beginEdit() {
    if (!selected || selected.protected || selected.historical) return;
    const path =
      (selected.name || "document.md")
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/^[^a-zA-Z0-9_-]+/, "") || "document.md";
    drafts[keyOf(selected)] = {
      conversation: view.conversation_id,
      item: selected,
      text: selected.content,
      token: selected.token,
      revision: view.context.revision,
      path: selected.kind === "document" ? selected.path : path,
      stateKey: selected.section?.state_key || "",
      type: selected.section?.type || "constraint",
      status: selected.section?.status || "active",
    };
    editing = true;
    preview = false;
    persist();
    renderList();
    show();
    el("editor-text").focus();
  }
  function capture() {
    const d = draft();
    if (!d) return;
    saveError = "";
    Object.assign(d, {
      text: el("editor-text").value,
      path: el("editor-path").value,
      stateKey: el("editor-state-key").value,
      type: el("editor-state-type").value,
      status: el("editor-state-status").value,
    });
    persist();
    syncControls();
  }
  async function save() {
    const d = draft();
    if (!d || saving || busy || stale()) return;
    capture();
    saving = true;
    syncControls();
    const original = selected,
      originalKey = keyOf(selected);
    try {
      const input =
        selected.kind === "document" || selected.kind === "source"
          ? {
              path: selected.kind === "document" ? selected.path : d.path,
              content: d.text,
              expected_source_event_id:
                selected.kind === "document" ? d.token : null,
              ...(selected.kind === "source"
                ? { copied_from_source_event_id: selected.token }
                : {}),
            }
          : selected.kind === "context"
            ? {
                bundle_id: selected.id,
                content: d.text,
                expected_revision: d.revision,
              }
            : {
                key: d.stateKey,
                type: d.type,
                status: d.status,
                content: d.text,
                expected_revision: d.revision,
                expected_bundle_id: d.token,
              };
      const action = ["document", "source"].includes(selected.kind)
        ? "document_save"
        : selected.kind === "context"
          ? "context_save"
          : "state_save";
      const data = await window.contextLayer.saveEdit(action, input);
      delete drafts[originalKey];
      persist();
      view = data;
      if (original.kind === "source") {
        tab = "documents";
        selected = documents().find(
          (i) => i.kind === "document" && i.path === input.path,
        );
      } else if (original.kind === "context") {
        const section = data.context.segments.find((s) =>
          s.parent_bundle_ids.includes(original.id),
        );
        selected = section
          ? {
              kind: "context",
              id: section.id,
              token: section.id,
              title: section.type + " · " + section.id.slice(-8),
              content: section.content,
              section,
            }
          : null;
      } else if (original.newEntry)
        selected = { kind: "state", id: d.stateKey, title: d.stateKey };
      if (selected) selected = latest(selected) || selected;
      editing = false;
      preview = false;
      renderList();
      show();
      el("editor-feedback").textContent =
        "Saved · new version recorded · no model call.";
    } catch (error) {
      await refresh();
      saveError = error.message + " Your draft is preserved.";
    } finally {
      saving = false;
      syncControls();
    }
  }
  async function inspect(item, source) {
    const id = window.contextLayer?.currentId();
    if (!id) return;
    open();
    setTab(source ? "documents" : item.state_key ? "state" : "context");
    const generation = ++inspection;
    const current = items().find((i) =>
      source ? i.token === item.id : i.token === item.id,
    );
    if (current) {
      select(current);
      return;
    }
    try {
      const data = await window.contextLayer.readItem(
        source ? "source" : "context",
        item.id,
      );
      if (id !== window.contextLayer.currentId() || generation !== inspection)
        return;
      select(
        source
          ? {
              kind: "source",
              id: data.id,
              token: data.id,
              title: data.metadata?.filename || "Saved " + data.kind,
              content: data.content,
              historical: true,
            }
          : {
              kind: item.state_key ? "state" : "context",
              id: data.id,
              token: data.id,
              title: data.state_key || data.type,
              content: data.content,
              historical: true,
              section: data,
            },
      );
    } catch (error) {
      if (generation === inspection)
        el("editor-feedback").textContent = error.message;
    }
  }
  el("workspace-open").onclick = () => (panel.hidden ? open() : close());
  el("editor-close").onclick = () => {
    close();
    el("workspace-open").focus();
  };
  el("editor-refresh").onclick = refresh;
  el("editor-upload").onclick = () => el("editor-upload-file").click();
  el("editor-upload-file").onchange = async () => {
    const input = el("editor-upload-file"), file = input.files[0];
    input.value = "";
    if (!file || saving || busy) return;
    const id = window.contextLayer.currentId(), generation = sessionGeneration;
    const status = el("editor-upload-status");
    saving = true;
    status.classList.remove("error");
    status.textContent = "Uploading " + file.name + "…";
    syncControls();
    try {
      if (!/\.(md|markdown|txt)$/i.test(file.name) || file.size > 100000)
        throw Error("Choose a Markdown or plain text document (.md, .markdown, .txt) up to 100 KB.");
      const bytes = await file.arrayBuffer();
      let content;
      try { content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
      catch { throw Error("The document must be UTF-8 text. Export it as Markdown or plain text and try again."); }
      if (id !== window.contextLayer.currentId() || generation !== sessionGeneration)
        throw Error("The active chat changed. Upload again in the intended workspace.");
      const previous = new Set((view?.workspace || []).map(f => f.source_event_id));
      const data = await window.contextLayer.uploadDocument({ name: file.name, content });
      view = data;
      setTab("documents");
      const fileItem = documents().find(item => item.kind === "document" && !previous.has(item.token));
      if (fileItem) select(fileItem);
      status.textContent = "Uploaded " + (fileItem?.path || file.name) + " · reference it in chat when ready.";
    } catch (error) {
      status.classList.add("error");
      status.textContent = error.message;
    } finally {
      saving = false;
      syncControls();
    }
  };
  el("editor-use").onclick = () => {
    if (selected?.kind !== "document" || busy || saving) return;
    const composer = document.querySelector("#composer textarea");
    const reference = 'Workspace document: "' + selected.path + '"';
    composer.value = composer.value.trimEnd() + (composer.value.trim() ? "\n" : "") + reference;
    composer.dispatchEvent(new Event("input", { bubbles: true }));
    close();
    composer.focus();
  };
  el("editor-edit").onclick = beginEdit;
  el("editor-save").onclick = save;
  for (const id of [
    "editor-text",
    "editor-path",
    "editor-state-key",
    "editor-state-type",
    "editor-state-status",
  ])
    el(id).addEventListener("input", capture);
  el("editor-preview-toggle").onclick = () => {
    capture();
    preview = !preview;
    show();
  };
  el("editor-discard").onclick = () => {
    if (!confirm("Discard this unsaved draft?")) return;
    delete drafts[keyOf(selected)];
    persist();
    editing = false;
    selected = selected.newEntry ? null : latest();
    renderList();
    show();
  };
  el("editor-latest").onclick = async () => {
    if (
      !confirm(
        "Replace this draft with the latest saved text? Download or copy your changes first.",
      )
    )
      return;
    const item = selected;
    delete drafts[keyOf(item)];
    persist();
    editing = false;
    await refresh();
    select(latest(item));
  };
  el("editor-download").onclick = () => {
    const text = draft()?.text ?? selected.content;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" }),
      url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download =
      draft()?.path ||
      selected.path ||
      selected.name ||
      selected.title.replace(/[^a-zA-Z0-9._-]/g, "_") + ".md";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  el("editor-new-state").onclick = () => {
    const item = {
      kind: "state",
      id: "new_" + crypto.randomUUID(),
      title: "New remembered entry",
      content: "",
      token: null,
      newEntry: true,
    };
    select(item);
    beginEdit();
    el("editor-state-key").focus();
  };
  el("editor-tabs").onclick = (event) => {
    const button = event.target.closest("[data-tab]");
    if (button) setTab(button.dataset.tab);
  };
  el("editor-tabs").onkeydown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tabs = ["documents", "context", "state"],
      index = tabs.indexOf(tab);
    setTab(
      tabs[
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? 2
            : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3
      ],
    );
    el("tab-" + tab).focus();
  };
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      close();
      el("workspace-open").focus();
    }
  });
  document.addEventListener("visibilitychange", schedule);
  window.workspaceEditor = { adopt, syncControls, inspect, close, open };
  if (window.contextLayer?.editorView())
    adopt(window.contextLayer.editorView());
})();
