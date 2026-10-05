// Shell interactions: sidebar, mode switch, recipients, menus and composer sizing.
// app.js and conclave.js own the data; this file mirrors their state into the layout.
(() => {
  const body = document.body,
    box = $("textarea"),
    chat = $("#chat"),
    contextToggle = $("#context-mode"),
    agentToggle = $("#agent-mode"),
    saved = $("#context-chat"),
    resumeButton = $("#agent-resume"),
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
    // Rebuilding the chips must not drop keyboard focus.
    const focused = container.contains(document.activeElement)
      ? document.activeElement.dataset.name
      : null;
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
      chip.setAttribute("aria-haspopup", "menu");
      chip.setAttribute("aria-expanded", String(pickerFor === name));
      const model = document.createElement("small");
      model.textContent = fields[name].value;
      chip.append(name, model);
      const fixed = typed.length > 0;
      chip.disabled = busy || !fields[name].options.length;
      if (current !== "chat" && !resumeButton.hidden)
        chip.disabled = true;
      const hint = "Hold or right-click to choose its model";
      if (fixed) {
        chip.setAttribute("aria-disabled", "true");
        chip.title =
          "Recipients come from the @mentions in your message. " + hint;
      } else chip.title = "Toggle " + name + ". " + hint;
      chip.onclick = (event) => {
        // The release that ends a hold leaves the menu open; a later click
        // on a chip only dismisses it.
        const released = performance.now() < ignoreClickUntil;
        ignoreClickUntil = 0;
        if (released || pickerFor) {
          if (!released) closePicker();
          event.stopPropagation();
          return;
        }
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
    if (focused) chipFor(focused)?.focus();
    if (pickerFor && chipFor(pickerFor)?.disabled !== false) closePicker();
  }

  // ----- Model menu: hold, right-click or arrow from a recipient chip -----
  const recipients = $("#recipients"),
    picker = document.createElement("div"),
    HOLD_MS = 450;
  let pickerFor = null,
    press = null,
    ignoreClickUntil = 0;
  picker.id = "model-menu";
  picker.setAttribute("role", "menu");
  picker.hidden = true;
  $("#composer").append(picker);
  const chipFor = (name) =>
    recipients.querySelector(`.chip[data-name="${name}"]`);
  const itemAt = (event) =>
    document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest('#model-menu [role="menuitemradio"]');
  function openPicker(name, { focus = false } = {}) {
    const chip = chipFor(name),
      field = fields[name];
    closePicker();
    if (!chip || chip.disabled || field.disabled || !field.options.length)
      return false;
    for (const panel of popovers) panel.open = false;
    const title = document.createElement("div");
    title.className = "menu-title";
    title.setAttribute("role", "presentation");
    title.textContent = name + " model";
    picker.replaceChildren(
      title,
      ...[...field.options].map((option) => {
        const item = document.createElement("button");
        item.type = "button";
        item.tabIndex = -1;
        item.setAttribute("role", "menuitemradio");
        item.setAttribute("aria-checked", String(option.value === field.value));
        item.dataset.value = option.value;
        item.textContent = option.textContent;
        return item;
      }),
    );
    pickerFor = picker.dataset.name = name;
    picker.setAttribute("aria-label", name + " model");
    picker.hidden = false;
    chip.setAttribute("aria-expanded", "true");
    const frame = $("#composer").getBoundingClientRect(),
      anchor = chip.getBoundingClientRect();
    picker.style.bottom = frame.bottom - anchor.top + 6 + "px";
    picker.style.left =
      Math.max(
        8,
        Math.min(
          anchor.left - frame.left,
          frame.width - picker.offsetWidth - 8,
        ),
      ) + "px";
    const current = picker.querySelector('[aria-checked="true"]');
    current?.scrollIntoView({ block: "nearest" });
    if (focus) (current || picker.querySelector("button")).focus();
    return true;
  }
  function closePicker({ restore = false } = {}) {
    if (!pickerFor) return;
    const chip = chipFor(pickerFor);
    // Pointer users keep their place (and their on-screen keyboard).
    if (restore && picker.contains(document.activeElement)) chip?.focus();
    pickerFor = null;
    picker.hidden = true;
    chip?.setAttribute("aria-expanded", "false");
  }
  function chooseModel(value) {
    const name = pickerFor,
      field = fields[name];
    closePicker({ restore: true });
    if (busy || field.disabled) return;
    if (field.value !== value) {
      field.value = value;
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
    // Choosing someone's model also addresses the message to them.
    if (!mentioned(box.value).length) {
      if (mode() !== "chat") window.contextLayer?.selectProvider(name);
      else if (!targets.includes(name))
        targets = names.filter((n) => n === name || targets.includes(n));
    }
    sync();
  }
  const endPress = () => {
    clearTimeout(press?.timer);
    press = null;
  };
  recipients.addEventListener("pointerdown", (event) => {
    const chip = event.target.closest(".chip");
    endPress();
    ignoreClickUntil = 0;
    if (!chip || chip.disabled || event.button) return;
    const name = chip.dataset.name;
    press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      held: false,
      timer: setTimeout(() => {
        if (openPicker(name)) press.held = true;
        else endPress();
      }, HOLD_MS),
    };
  });
  document.addEventListener("pointermove", (event) => {
    if (event.pointerId !== press?.id) return;
    if (press.held) {
      // Keep holding and slide onto a model; releasing there chooses it.
      const over = itemAt(event);
      for (const item of picker.querySelectorAll("button"))
        item.classList.toggle("is-active", item === over);
    } else if (
      Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10
    )
      endPress();
  });
  document.addEventListener("pointerup", (event) => {
    if (event.pointerId !== press?.id) return;
    const item = press.held && itemAt(event);
    // Releasing on the chip itself would otherwise toggle it.
    if (press.held && !item) ignoreClickUntil = performance.now() + 400;
    endPress();
    if (item) chooseModel(item.dataset.value);
  });
  document.addEventListener("pointercancel", (event) => {
    if (event.pointerId === press?.id) endPress();
  });
  // Touch long-presses and the keyboard's menu key arrive as context menus.
  recipients.addEventListener("contextmenu", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    event.preventDefault();
    if (pickerFor !== chip.dataset.name)
      openPicker(chip.dataset.name, { focus: !press });
  });
  recipients.addEventListener("keydown", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip || !["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    openPicker(chip.dataset.name, { focus: true });
  });
  picker.addEventListener("click", (event) => {
    const item = event.target.closest('[role="menuitemradio"]');
    if (item) chooseModel(item.dataset.value);
  });
  picker.addEventListener("keydown", (event) => {
    const items = [...picker.querySelectorAll("button")],
      at = items.indexOf(document.activeElement);
    const to = {
      ArrowDown: at + 1,
      ArrowUp: at - 1,
      Home: 0,
      End: items.length - 1,
    }[event.key];
    if (to !== undefined) {
      event.preventDefault();
      items[(to + items.length) % items.length].focus();
    } else if (event.key === "Tab") closePicker({ restore: true });
  });

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
        ? "Describe the objective…"
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
    if (
      empty &&
      !messages.length &&
      (empty.dataset.mode !== current ||
        empty.dataset.who !== (current === "chat" ? "" : who[0]))
    )
      showEmpty(who[0]);
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
  // The status line only appears when it says something the reply doesn't.
  const status = $("#status");
  const idle =
    /^(Ready|New chat|Opened|Loading models|Waiting for|Agent running|Agent \S+ · progress saved|.+ is answering)/;
  const showStatus = () => {
    status.dataset.idle = String(!status.textContent.trim() || idle.test(status.textContent.trim()));
  };
  new MutationObserver(showStatus).observe(status, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  showStatus();
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
    if (!picker.contains(event.target)) closePicker();
    for (const panel of popovers)
      if (panel.open && !panel.contains(event.target)) panel.open = false;
    if (event.target.closest(".menu-items button"))
      $("#more-menu").open = false;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (pickerFor) return closePicker({ restore: true });
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
