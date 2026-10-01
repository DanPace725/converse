// Shell interactions: sidebar, mode switch, recipients, menus and composer sizing.
// app.js and conclave.js own the data; this file mirrors their state into the layout.
(() => {
  const body = document.body,
    box = $("textarea"),
    chat = $("#chat"),
    contextToggle = $("#context-mode"),
    agentToggle = $("#agent-mode"),
    saved = $("#context-chat"),
    wide = matchMedia("(min-width: 900px)");
  const radios = [
    ...document.querySelectorAll('#mode-switch input[name="mode"]'),
  ];
  const radio = (value) => radios.find((r) => r.value === value);
  const mentioned = (text) => [
    ...new Set(
      [...text.matchAll(/@(GPT|Claude|Gemini)\b/gi)].map((m) =>
        names.find((n) => n.toLowerCase() === m[1].toLowerCase()),
      ),
    ),
  ];

  const mode = () =>
    agentToggle.checked
      ? "agent"
      : (window.contextLayer?.enabled?.() ?? contextToggle.checked)
        ? "context"
        : "chat";
  window.converseMode = mode;

  // ----- Sidebar -----
  function setDrawer(open) {
    if (wide.matches) {
      body.classList.toggle("sidebar-collapsed", !open);
      try {
        localStorage.setItem("converse-sidebar", open ? "open" : "closed");
      } catch {}
    } else {
      body.classList.toggle("sidebar-open", open);
      $("#scrim").hidden = !open;
      if (open) $("#new-chat").focus();
    }
    $("#menu").setAttribute("aria-expanded", String(open));
  }
  const drawerOpen = () =>
    wide.matches
      ? !body.classList.contains("sidebar-collapsed")
      : body.classList.contains("sidebar-open");
  try {
    if (localStorage.getItem("converse-sidebar") === "closed")
      body.classList.add("sidebar-collapsed");
  } catch {}
  $("#menu").onclick = () => setDrawer(!drawerOpen());
  $("#sidebar-close").onclick = () => setDrawer(false);
  $("#scrim").onclick = () => setDrawer(false);
  wide.addEventListener("change", () => {
    body.classList.remove("sidebar-open");
    $("#scrim").hidden = true;
    $("#menu").setAttribute("aria-expanded", String(drawerOpen()));
  });
  const closeDrawerOnPhone = () => {
    if (!wide.matches) setDrawer(false);
  };
  $("#new-chat").addEventListener("click", closeDrawerOnPhone);
  $("#models-link").onclick = () => {
    $("#model-panel").open = true;
    if (!drawerOpen()) setDrawer(true);
    const provider =
      mode() === "chat"
        ? (mentioned(box.value)[0] ?? targets[0])
        : window.contextLayer?.providerName?.() || "GPT";
    setTimeout(() => fields[provider]?.focus(), wide.matches ? 0 : 230);
  };

  function when(value) {
    const date = new Date(value);
    if (!value || isNaN(date)) return "";
    const today = new Date();
    if (date.toDateString() === today.toDateString())
      return date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
    return date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      ...(date.getFullYear() !== today.getFullYear() && { year: "numeric" }),
    });
  }
  const titleOf = (record) => {
    if (record.title) return record.title;
    const first = (record.messages || []).find((m) => m.role === "user");
    const text = first?.content
      ?.replace(/@(GPT|Claude|Gemini)\b/gi, "")
      .trim()
      .replace(/\s+/g, " ");
    if (text) return text.slice(0, 80);
    const file = record.attachments?.[0]?.name;
    return file ? "File: " + file : "Untitled chat";
  };
  function item({ id, title, meta, current, open, remove }) {
    const li = document.createElement("li"),
      button = document.createElement("button"),
      name = document.createElement("span"),
      info = document.createElement("span");
    button.type = "button";
    button.className = "chat-item";
    button.dataset.id = id;
    if (current) button.setAttribute("aria-current", "true");
    name.className = "chat-name";
    name.textContent = title;
    info.className = "chat-meta";
    info.textContent = meta;
    button.append(name, info);
    button.onclick = () => {
      if (!current) open();
      closeDrawerOnPhone();
    };
    li.append(button);
    if (remove) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "chat-delete";
      del.setAttribute("aria-label", "Delete " + title);
      del.innerHTML = '<svg aria-hidden="true"><use href="#i-close" /></svg>';
      del.onclick = () => {
        if (confirm("Delete this chat from this device? This can't be undone."))
          remove();
      };
      li.append(del);
    }
    return li;
  }
  let listSignature = "";
  function renderLists() {
    const query = $("#chat-search").value.trim().toLowerCase();
    const currentId = window.contextLayer?.currentId?.();
    const local = [];
    if (messages.length && !conversation.context_layer)
      local.push({
        id: conversation.conversation_id,
        title: titleOf({ ...conversation, messages }),
        meta: "Current chat",
        current: true,
      });
    for (const record of window.localChats?.list() || [])
      local.push({
        id: record.conversation_id,
        title: titleOf(record),
        meta: when(record.archived_at || record.messages?.at(-1)?.timestamp),
        open: () => window.localChats.open(record.conversation_id),
        remove: () => window.localChats.remove(record.conversation_id),
      });
    const server = [...saved.options]
      .filter((o) => o.value)
      .map((o) => ({
        id: o.value,
        title: o.dataset.title || o.textContent,
        meta: when(o.dataset.time) || "Context chat",
        current: o.value === currentId,
        open: () => openServer(o.value),
      }));
    const match = (c) => !query || c.title.toLowerCase().includes(query);
    const signature = JSON.stringify([
      query,
      local.map((c) => [c.id, c.title, c.meta, c.current]),
      server.map((c) => [c.id, c.title, c.meta, c.current]),
    ]);
    if (signature === listSignature) return;
    listSignature = signature;
    const shownLocal = local.filter(match),
      shownServer = server.filter(match);
    $("#local-chats").replaceChildren(...shownLocal.map(item));
    $("#server-chats").replaceChildren(...shownServer.map(item));
    $("#local-section").hidden = !shownLocal.length;
    $("#server-section").hidden = !shownServer.length;
    $("#no-chats").hidden = shownLocal.length + shownServer.length > 0;
    $("#no-chats").textContent = query
      ? "No chats match your search."
      : "Your chats will appear here.";
  }
  function openServer(id) {
    if (busy) return;
    // Keep the device chat in history instead of asking to discard it.
    if (messages.length && !window.contextLayer?.currentId?.())
      $("#new-chat").onclick();
    if (messages.length && !window.contextLayer?.currentId?.()) return;
    saved.value = id;
    saved.dispatchEvent(new Event("change"));
  }
  $("#chat-search").addEventListener("input", renderLists);

  // ----- Mode switch -----
  for (const r of radios)
    r.addEventListener("change", () => {
      const want = r.value;
      if (want === "agent") {
        if (!agentToggle.checked) {
          agentToggle.checked = true;
          agentToggle.dispatchEvent(new Event("change"));
        }
      } else {
        if (agentToggle.checked) {
          agentToggle.checked = false;
          agentToggle.dispatchEvent(new Event("change"));
        }
        const context = want === "context";
        if (contextToggle.checked !== context) {
          contextToggle.checked = context;
          contextToggle.dispatchEvent(new Event("change"));
        }
      }
      sync();
    });

  // ----- Recipients -----
  function renderRecipients(current) {
    const typed = mentioned(box.value);
    const chosen = typed.length
      ? typed
      : current === "chat"
        ? targets
        : [window.contextLayer?.providerName?.() || "GPT"];
    const container = $("#recipients");
    const shown = current === "chat" ? names : ["GPT", "Claude"];
    const signature = JSON.stringify([
      current,
      chosen,
      typed.length > 0,
      busy,
      agentToggle.disabled,
      shown.map((n) => [fields[n].value, fields[n].options.length]),
    ]);
    if (container.dataset.signature === signature) return;
    container.dataset.signature = signature;
    container.replaceChildren();
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = typed.length ? "To (from @mentions)" : "To";
    container.append(label);
    for (const name of shown) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.name = name;
      chip.setAttribute("aria-pressed", String(chosen.includes(name)));
      const model = document.createElement("small");
      model.textContent = fields[name].value;
      chip.append(name, model);
      const fixed = typed.length > 0;
      chip.disabled = busy || !fields[name].options.length;
      if (current !== "chat" && !$("#agent-resume").hidden)
        chip.disabled = true;
      if (fixed) {
        chip.setAttribute("aria-disabled", "true");
        chip.title = "Recipients come from the @mentions in your message";
      } else chip.title = "Toggle " + name;
      chip.onclick = () => {
        if (fixed || busy) return;
        if (current !== "chat") {
          window.contextLayer?.selectProvider(name);
          sync();
          return;
        }
        const next = targets.includes(name)
          ? targets.filter((n) => n !== name)
          : names.filter((n) => n === name || targets.includes(n));
        if (!next.length) return;
        targets = next;
        sync();
      };
      container.append(chip);
    }
  }

  // ----- Sync layout with app state -----
  const badges = {
    chat: "Chat · on this device",
    context: "Context · saved on server",
    agent: "Agent · saved on server",
  };
  function sync() {
    for (const button of document.querySelectorAll('.edit-message'))
      button.disabled = busy || window.contextLayer?.editorView?.()?.agent?.status === 'running';
    const current = mode();
    const available = !$("#agent-mode-bar").hidden;
    body.dataset.mode = current;
    $("#mode-switch").hidden = !available;
    for (const r of radios) r.checked = r.value === current;
    const locked = messages.length > 0;
    const isContextChat = !!window.contextLayer?.currentId?.();
    // Device chats can't move to the server mid-conversation (and vice versa).
    const allowed = {
      chat: !locked || current === "chat",
      context: !locked || isContextChat || current === "context",
      agent:
        current === "agent" ||
        ((!agentToggle.disabled || busy) && (!locked || isContextChat)),
    };
    for (const r of radios) {
      r.disabled = busy || !allowed[r.value];
      r.parentElement.hidden = !allowed[r.value];
    }
    $("#mode-switch").classList.toggle(
      "single",
      radios.filter((r) => allowed[r.value]).length < 2,
    );
    $("#mode-switch").title = locked
      ? "Start a new chat to switch between device and server modes"
      : "";
    $("#mode-badge").textContent = badges[current];
    $("#mode-badge").dataset.mode = current;
    $("#context-panel").classList.toggle("unused", current === "chat");
    renderRecipients(current);
    const who =
      current === "chat"
        ? mentioned(box.value).length
          ? mentioned(box.value)
          : targets
        : mentioned(box.value).length
          ? mentioned(box.value)
          : [window.contextLayer?.providerName?.() || "GPT"];
    box.placeholder =
      current === "agent"
        ? "Describe an objective for the agent…"
        : "Message " +
          (who.length > 1
            ? who.slice(0, -1).join(", ") + " and " + who.at(-1)
            : who[0]) +
          "…";
    const option = [...saved.options].find(
      (o) => o.value && o.value === window.contextLayer?.currentId?.(),
    );
    $("#chat-title").textContent = option
      ? option.dataset.title || option.textContent
      : messages.length
        ? titleOf({ ...conversation, messages })
        : "New chat";
    const empty = $("#empty");
    if (empty && empty.dataset.mode !== current && !messages.length)
      showEmpty();
    const progress = $("#run-progress").textContent.trim();
    $("#agent-mode-bar").classList.toggle(
      "has-run",
      !!progress && progress !== "Ready" && current !== "chat",
    );
    if (!box.value) box.style.height = "";
    renderLists();
  }
  window.converseSync = sync;
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      sync();
    });
  };
  const observer = new MutationObserver(schedule);
  observer.observe($("#send"), {
    childList: true,
    attributes: true,
    characterData: true,
    subtree: true,
  });
  observer.observe($("#agent-mode-bar"), { attributes: true });
  observer.observe($("#run-progress"), {
    childList: true,
    characterData: true,
    subtree: true,
  });
  observer.observe(saved, { childList: true });
  observer.observe(chat, { childList: true });
  for (const name of names) fields[name].addEventListener("change", schedule);
  document.addEventListener("change", schedule);

  // ----- Composer -----
  function grow() {
    box.style.height = "auto";
    box.style.height = box.scrollHeight + "px";
  }
  box.addEventListener("input", () => {
    grow();
    schedule();
  });
  const composer = $("#composer");
  new ResizeObserver(() =>
    $("main").style.setProperty(
      "--composer-height",
      composer.offsetHeight + "px",
    ),
  ).observe(composer);

  // ----- Jump to latest -----
  const jump = $("#jump");
  chat.addEventListener(
    "scroll",
    () => {
      jump.hidden =
        chat.scrollHeight - chat.scrollTop - chat.clientHeight < 240;
    },
    { passive: true },
  );
  jump.onclick = () =>
    chat.scrollTo({
      top: chat.scrollHeight,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });

  // ----- Menus and popovers -----
  $("#sheet-close").onclick = () => {
    $("#context-panel").open = false;
    $("#context-panel > summary").focus();
  };
  const popovers = ["#more-menu", "#context-panel", "#workspace-panel"].map(
    (s) => $(s),
  );
  document.addEventListener("click", (event) => {
    for (const panel of popovers)
      if (panel.open && !panel.contains(event.target)) panel.open = false;
    if (event.target.closest(".menu-items button"))
      $("#more-menu").open = false;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    for (const panel of popovers)
      if (panel.open) {
        panel.open = false;
        panel.querySelector("summary").focus();
        return;
      }
    if (!wide.matches && drawerOpen()) {
      setDrawer(false);
      $("#menu").focus();
    }
  });

  sync();
})();
