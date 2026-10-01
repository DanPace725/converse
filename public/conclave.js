// Optional context UI, enabled by the server's capabilities.
(() => {
  const panel = $("#context-panel"),
    toggle = $("#context-mode"),
    saved = $("#context-chat"),
    jev = $("#context-jev");
  const reasoning = $("#context-reasoning");
  let available = false,
    capabilities = null,
    refreshing = false;
  const enabled = () => toggle.checked || !!conversation.context_layer;
  const currentId = () => conversation.context_layer?.conversation_id;

  async function request(action, input) {
    const query = input
      ? ""
      : "?action=" +
        action +
        (currentId() && ["view", "export"].includes(action)
          ? "&conversation=" + encodeURIComponent(currentId())
          : "");
    const response = await fetch(
      "/api/conclave" + query,
      input
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, ...input }),
          }
        : { cache: "no-store" },
    );
    if (response.status === 401) unlock();
    const data = await response.json().catch(() => ({
      error: "Context service unavailable. Try again shortly.",
    }));
    if (!response.ok) throw Error(data.error || "Context request failed");
    return data;
  }

  function controls() {
    for (const input of panel.querySelectorAll("input, select, button"))
      input.disabled = busy;
    jev.disabled = busy || !capabilities?.credentials.jev;
    $("#remember-state").disabled = busy || !currentId();
    $("#context-inspect").hidden = !enabled();
    $("#context-watch").hidden = !available || !enabled();
    window.contextGarden?.adopt(enabled() ? currentId() : null);
  }

  function renderMessages() {
    $("#chat").replaceChildren();
    for (const message of messages) {
      const element = add(
        message.role === "user" ? "You" : message.provider,
        messageText(message),
        message.model || "",
      );
      if (message.role === "assistant") renderReply(element, message.content);
      if (message.answer_failed) {
        const notice = document.createElement("p");
        notice.className = "error";
        notice.textContent =
          "The answer failed. This message and failure details remain saved.";
        element.parentNode.append(notice);
      }
    }
    if (!messages.length) {
      const empty = document.createElement("div");
      empty.id = "empty";
      empty.textContent = "One conversation. Your choice of models.";
      $("#chat").append(empty);
    }
    $("#export").disabled = !messages.length;
    $("#export-json").disabled = busy;
    followBottom();
  }

  function apply(view) {
    // The server retains audits; localStorage only needs display records.
    conversation = {
      ...conversation,
      schema_version: 1,
      conversation_id: view.conversation_id,
      created_at: view.created_at,
      attachments: view.attachments,
      context_layer: {
        schema_version: 1,
        engine: "conclave",
        conversation_id: view.conversation_id,
        settings: view.settings,
      },
    };
    messages.splice(0, messages.length, ...view.messages);
    toggle.checked = true;
    reasoning.value = view.settings.reasoning;
    jev.checked = !!view.settings.jev && !!capabilities?.credentials.jev;
    if (
      [...fields.GPT.options].some(
        (option) => option.value === view.settings.model,
      )
    )
      fields.GPT.value = view.settings.model;
    const metrics = view.metrics;
    $("#context-stats").textContent =
      "Revision " +
      view.context.revision +
      " · " +
      metrics.decision_calls +
      " Jev/selector calls · " +
      (metrics.input_tokens ?? "unknown") +
      " input / " +
      (metrics.output_tokens ?? "unknown") +
      " output tokens (all calls)";
    $("#context-preview").textContent =
      view.context.segments
        .map(
          (item) =>
            (item.state_key ? "Remembered " + item.state_key : item.type) +
            " · " +
            item.status +
            "\n" +
            item.content,
        )
        .join("\n\n") || "No working context yet.";
    $("#context-note").textContent =
      view.backup_warning ||
      "GPT replies use saved context. JSON export includes original sources, revisions, Jev decisions and usage.";
    saved.value = view.conversation_id;
    saveChat();
    renderMessages();
    controls();
  }

  async function refreshList() {
    const data = await request("list");
    saved.replaceChildren(new Option("Choose a saved chat…", ""));
    for (const chat of data.conversations)
      saved.add(
        new Option(
          chat.title + " · " + chat.conversation_id.slice(-8),
          chat.conversation_id,
        ),
      );
    saved.value = currentId() || "";
  }

  async function refresh() {
    if (refreshing || busy) return;
    refreshing = true;
    try {
      capabilities = await request("status");
      if (!capabilities.available)
        throw Error("Saved context chats are not configured on this server.");
      available = true;
      panel.hidden = false;
      if (!currentId()) jev.checked = capabilities.credentials.jev;
      await refreshList();
      if (currentId()) apply(await request("view"));
      controls();
    } catch (error) {
      available = false;
      panel.hidden = !currentId();
      if (currentId())
        $("#context-note").textContent =
          error.message + " Cached transcript remains available.";
    } finally {
      refreshing = false;
    }
  }

  async function ensure() {
    if (!available)
      throw Error("The context service is unavailable. Reload to reconnect.");
    if (!currentId()) {
      apply(
        await request("create", {
          title:
            $("textarea").value.trim().slice(0, 100) || "Converse context chat",
        }),
      );
      await refreshList();
    }
  }

  function setBusy(value) {
    busy = value;
    window.contextGarden?.setActive(value);
    for (const id of [
      "new-chat",
      "upload",
      "remove-file",
      "send",
      "export",
      "export-json",
    ])
      $("#" + id).disabled = value;
    Object.values(fields).forEach((field) => {
      field.disabled = value || !field.options.length;
    });
    controls();
  }

  const normalSubmit = $("#composer").onsubmit;
  $("#composer").onsubmit = async (event) => {
    if (!enabled()) return normalSubmit(event);
    event.preventDefault();
    if (busy || readingFile) return;
    const content = $("textarea").value.trim();
    if (!content && !attachment) return;
    if (/@(Claude|Gemini)\b/i.test(content)) {
      $("#status").textContent =
        "Context mode currently replies with GPT. Choose its model in Models.";
      return;
    }
    if (!fields.GPT.value || !capabilities?.credentials.openai) {
      $("#status").textContent =
        "Choose an available GPT model; the server needs OPENAI_API_KEY.";
      return;
    }
    const model = fields.GPT.value;
    const settings = { model, reasoning: reasoning.value, jev: jev.checked };
    let submitted = null;
    setBusy(true);
    try {
      await ensure();
      const user = messageRecord({
        role: "user",
        content,
        attachment_ids: attachment ? [attachment.attachment_id] : [],
      });
      const documents = attachment ? [attachment] : [];
      submitted = {
        message_id: user.message_id,
        content,
        document: attachment,
      };
      if (attachment) conversation.attachments.push(attachment);
      messages.push(user);
      saveChat();
      add("You", messageText(user));
      add("GPT", "Thinking…", model);
      $("textarea").value = "";
      attachment = null;
      $("#attachment").hidden = true;
      $("#status").textContent = "GPT is answering with the context layer…";
      const view = await request("ask", {
        conversation_id: currentId(),
        message_id: user.message_id,
        content,
        attachments: documents,
        settings,
      });
      apply(view);
      $("#status").textContent = "Ready · context saved";
    } catch (error) {
      if (currentId()) {
        try {
          apply(await request("view"));
        } catch {}
      }
      if (
        submitted &&
        !messages.some(
          (message) =>
            message.message_id === submitted.message_id &&
            message.source_event_id,
        )
      ) {
        $("textarea").value = submitted.content;
        attachment = submitted.document;
        $("#attachment").hidden = !attachment;
        if (attachment) $("#filename").textContent = attachment.name;
      }
      $("#status").textContent = error.message;
    } finally {
      setBusy(false);
      if (window.matchMedia("(pointer:fine)").matches) $("textarea").focus();
    }
  };

  toggle.onchange = () => {
    if (messages.length) {
      toggle.checked = !!currentId();
      $("#status").textContent =
        "Start a new chat or open a saved context chat to change modes.";
    } else if (
      toggle.checked &&
      [...fields.GPT.options].some((option) => option.value === "gpt-6-luna")
    ) {
      fields.GPT.value = "gpt-6-luna";
      rememberModels();
    }
    controls();
  };

  saved.onchange = async () => {
    if (!saved.value || busy) {
      saved.value = currentId() || "";
      return;
    }
    if (
      messages.length &&
      !currentId() &&
      !confirm(
        "Open a saved context chat? Export your current chat first to keep it.",
      )
    ) {
      saved.value = "";
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(
        "/api/conclave?conversation=" + encodeURIComponent(saved.value),
        { cache: "no-store" },
      );
      const view = await response.json();
      if (!response.ok) throw Error(view.error);
      apply(view);
      $("#status").textContent = "Opened saved context chat";
    } catch (error) {
      $("#status").textContent = error.message;
    } finally {
      setBusy(false);
    }
  };

  $("#remember-state").onclick = async () => {
    if (busy || !currentId()) return;
    setBusy(true);
    try {
      apply(
        await request("remember", {
          conversation_id: currentId(),
          key: $("#remember-key").value.trim(),
          type: $("#remember-type").value,
          content: $("#remember-text").value.trim(),
        }),
      );
      $("#remember-text").value = "";
      $("#status").textContent = "State saved · no model call";
    } catch (error) {
      $("#status").textContent = error.message;
    } finally {
      setBusy(false);
    }
  };

  const newChat = $("#new-chat").onclick;
  $("#new-chat").onclick = () => {
    const prior = conversation.conversation_id;
    newChat();
    if (prior === conversation.conversation_id) return;
    saved.value = "";
    $("#context-stats").textContent = "";
    $("#context-preview").textContent = "Start or open a context chat.";
    $("#context-note").textContent =
      "GPT replies use saved context. JSON export includes the full audit record.";
    controls();
  };

  window.contextLayer = {
    enabled,
    currentId,
    refresh,
    downloadExport: () => {
      if (!currentId()) return false;
      if (!available) {
        $("#status").textContent =
          "Reconnect to the server to export the complete context record.";
        return true;
      }
      // An ordinary HTTP download avoids async Blob/user-activation issues and
      // fetches the complete canonical record from authoritative server storage.
      const link = document.createElement("a");
      link.href =
        "/api/conclave?action=download&conversation=" +
        encodeURIComponent(currentId());
      link.download = currentId() + ".json";
      link.click();
      return true;
    },
  };
  toggle.checked = !!currentId();
  refresh();
})();
