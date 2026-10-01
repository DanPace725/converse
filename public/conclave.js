// Optional context UI, enabled by the server's capabilities.
(() => {
  const panel = $("#context-panel"),
    toggle = $("#context-mode"),
    saved = $("#context-chat"),
    jev = $("#context-jev");
  const reasoning = $("#context-reasoning"),
    provider = $("#context-provider"),
    agentMode = $("#agent-mode");
  provider.value =
    localStorage.getItem("converse-context-provider") || "openai";
  if (!provider.value) provider.value = "openai";
  const providerName = () =>
    provider.value === "anthropic" ? "Claude" : "GPT";
  function selectRecipient(content) {
    const mentions = [
      ...new Set(
        [...content.matchAll(/@(GPT|Claude|Gemini)\b/gi)].map((m) =>
          m[1].toLowerCase(),
        ),
      ),
    ];
    if (mentions.includes("gemini") || mentions.length > 1)
      throw Error(
        "Choose one assistant, @GPT or @Claude, for Context and Agent modes.",
      );
    if (mentions.length)
      provider.value = mentions[0] === "claude" ? "anthropic" : "openai";
    controls();
    const name = providerName();
    if (!fields[name].value || !capabilities?.credentials?.[provider.value])
      throw Error(
        "Choose an available " +
          name +
          " model in Models; its server API key is required.",
      );
    return { name, provider: provider.value, model: fields[name].value };
  }
  provider.onchange = () => {
    localStorage.setItem("converse-context-provider", provider.value);
    controls();
    window.converseSync?.();
  };
  agentMode.checked = localStorage.getItem("converse-agent-mode") === "true";
  let progressTimer = null,
    progressGeneration = 0,
    progressStarted = 0;
  function progressText(text) {
    $("#run-progress").textContent = text;
  }
  function watchProgress(value) {
    clearTimeout(progressTimer);
    const generation = ++progressGeneration;
    if (!value) {
      $("#agent-mode-bar").classList.remove("is-working");
      progressText(
        agent && (agentMode.checked || agent.status === "running")
          ? agent.status +
              " · " +
              agent.steps +
              " steps" +
              (agent.status === "running"
                ? " · paused; resume to continue"
                : "")
          : "Ready",
      );
      return;
    }
    progressStarted = Date.now();
    $("#agent-mode-bar").classList.add("is-working");
    progressText(agentMode.checked ? "Starting agent…" : "Working…");
    const poll = async () => {
      if (generation !== progressGeneration || !busy) return;
      if (currentId()) {
        try {
          const response = await fetch(
            "/api/conclave?action=activity&conversation=" +
              encodeURIComponent(currentId()),
            { cache: "no-store" },
          );
          if (!response.ok) throw Error("Progress unavailable");
          const activity = await response.json();
          if (generation !== progressGeneration) return;
          const event = activity.latest;
          const label =
            event?.kind === "inference_request"
              ? event.label === "attention-selection"
                ? "Jev selecting context"
                : event.label === "compaction"
                  ? "Managing context"
                  : "Model working"
              : event?.kind === "tool_call"
                ? "Using " + event.label
                : event?.kind === "tool_result"
                  ? "Finished " + event.tool
                  : event?.kind === "document"
                    ? "Saving workspace file"
                    : "Working";
          progressText(
            (driving ? "Agent · step " + (agent.steps + 1) + " · " : "") +
              label +
              " · " +
              Math.floor((Date.now() - progressStarted) / 1000) +
              "s",
          );
        } catch {
          if (generation === progressGeneration)
            progressText("Working · progress connection unavailable");
        }
      }
      if (generation === progressGeneration && busy)
        progressTimer = setTimeout(poll, 1200);
    };
    progressTimer = setTimeout(poll, 300);
  }
  let available = false,
    capabilities = null,
    refreshing = false;
  let agent = null,
    latestView = null,
    driving = false,
    stopRequested = false;
  const enabled = () => toggle.checked || !!conversation.context_layer;
  const currentId = () => conversation.context_layer?.conversation_id;

  async function request(action, input) {
    const generation = sessionGeneration;
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
    if (response.status === 401 && generation === sessionGeneration) unlock();
    const data = await response.json().catch(() => ({
      error: "Context service unavailable. Try again shortly.",
    }));
    if (!response.ok) throw Error(data.error || "Context request failed");
    return data;
  }

  function controls() {
    for (const input of panel.querySelectorAll("input, select, button"))
      input.disabled = busy;
    jev.disabled = busy || !capabilities?.credentials?.jev;
    reasoning.disabled = busy || provider.value === "anthropic";
    reasoning.title =
      provider.value === "anthropic"
        ? "Claude uses its default reasoning; this control applies to GPT."
        : "";
    $("#workspace-open").hidden = !available || !enabled();
    window.workspaceEditor?.syncControls();
    $("#context-watch").hidden = !available || !enabled();
    window.contextGarden?.adopt(enabled() ? currentId() : null);
    const running = agent?.status === "running";
    provider.disabled = busy || running;
    agentMode.disabled = busy || running || !available;
    $("#send").textContent = agentMode.checked ? "Run agent" : "Send";
    $("#agent-resume").hidden = !running;
    $("#agent-resume").disabled = busy || !available;
    $("#agent-stop").hidden = !running;
    $("#agent-stop").disabled = stopRequested || (busy && !driving);
    if (running) $("#send").disabled = true;
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
    if (!messages.length) showEmpty();
    $("#export").disabled = !messages.length;
    $("#export-json").disabled = busy;
    followBottom();
  }

  function apply(view) {
    latestView = view;
    window.workspaceEditor?.adopt(view);
    agent = view.agent || null;
    const legacyAgent = agent && !agent.harness_version;
    $("#agent-budget").value = legacyAgent
      ? capabilities?.defaults?.budget
      : view.settings.budget;
    $("#agent-output").value = legacyAgent
      ? capabilities?.defaults?.output
      : view.settings.output;
    if (agent) {
      $("#agent-minutes").value = agent.limits.duration_seconds / 60;
      $("#agent-steps").value = agent.limits.max_steps;
      $("#agent-tokens").value = agent.limits.max_total_tokens;
    }
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
    provider.value = view.settings.provider || "openai";
    reasoning.value = view.settings.reasoning;
    // Version 1 forced Jev off in all agent runs; enable the new default when reopening those trials.
    jev.checked =
      (legacyAgent ? true : !!view.settings.jev) &&
      !!capabilities?.credentials?.jev;
    if (
      [...fields[providerName()].options].some(
        (option) => option.value === view.settings.model,
      )
    )
      fields[providerName()].value = view.settings.model;
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
    $("#context-note").textContent =
      view.backup_warning ||
      "GPT and Claude replies use saved context. JSON export includes original sources, revisions, Jev decisions and usage.";
    $("#agent-status").textContent = agent
      ? `${agent.status} · ${agent.steps}/${agent.limits.max_steps} steps · ${agent.input_tokens} input / ${agent.output_tokens} output tokens` +
        (agent.usage_complete === false ? " (partial usage)" : "") +
        (agent.tools.length
          ? " · " + agent.tools.map((t) => t.name).join(" → ")
          : "") +
        (agent.error ? " · " + agent.error : "")
      : "No agent run yet.";
    $("#agent-files").hidden = !agent?.files.length;
    $("#agent-files").textContent =
      agent?.files
        .map(
          (file) =>
            `${file.path}\n${file.content.slice(0, 4000)}${file.content.length > 4000 ? "\n[Preview shortened; full text is in Export JSON.]" : ""}`,
        )
        .join("\n\n") || "";
    const files = view.workspace || agent?.files || [];
    $("#workspace-panel").hidden = !files.length;
    $("#workspace-label").textContent = "Workspace files · " + files.length;
    $("#workspace-downloads").replaceChildren();
    for (const file of files) {
      const link = document.createElement("a");
      link.textContent = "Download " + file.path;
      link.href =
        "/api/conclave?action=workspace_file&conversation=" +
        encodeURIComponent(view.conversation_id) +
        "&path=" +
        encodeURIComponent(file.path);
      link.download = file.path.split("/").at(-1);
      $("#workspace-downloads").append(link);
    }
    if (!busy) watchProgress(false);
    saved.value = view.conversation_id;
    saveChat();
    renderMessages();
    controls();
  }

  async function refreshList() {
    const data = await request("list");
    saved.replaceChildren(new Option("Choose a saved chat…", ""));
    for (const chat of data.conversations) {
      const option = new Option(
        chat.title + " · " + chat.conversation_id.slice(-8),
        chat.conversation_id,
      );
      option.dataset.title = chat.title;
      option.dataset.time = chat.timestamp || "";
      saved.add(option);
    }
    saved.value = currentId() || "";
  }

  async function refresh() {
    if (refreshing || busy) return;
    const generation = sessionGeneration;
    refreshing = true;
    try {
      capabilities = await request("status");
      if (!capabilities.available)
        throw Error("Saved context chats are not configured on this server.");
      available = true;
      panel.hidden = false;
      $("#agent-mode-bar").hidden = false;
      if (!messages.length && !currentId()) toggle.checked = true;
      if (!currentId()) jev.checked = capabilities.credentials?.jev;
      await refreshList();
      if (currentId()) apply(await request("view"));
      controls();
    } catch (error) {
      available = false;
      if (!currentId()) agentMode.checked = false;
      $("#agent-mode-bar").hidden = !currentId();
      controls();
      panel.hidden = !currentId();
      if (currentId())
        $("#context-note").textContent =
          error.message + " Cached transcript remains available.";
    } finally {
      refreshing = false;
      // Login can complete while an earlier capability request is still pending.
      if (generation !== sessionGeneration) refresh();
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
    watchProgress(value);
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

  async function driveAgent() {
    driving = true;
    stopRequested = false;
    setBusy(true);
    try {
      while (agent?.status === "running") {
        $("#status").textContent = stopRequested
          ? "Stopping after the current step…"
          : `Agent running · step ${agent.steps + 1}`;
        apply(
          await request(stopRequested ? "agent_stop" : "agent_step", {
            conversation_id: currentId(),
            run_id: agent.run_id,
            expected_step: agent.steps,
          }),
        );
      }
      $("#status").textContent = "Agent " + agent.status + " · progress saved";
    } catch (error) {
      try {
        apply(await request("view"));
      } catch {}
      $("#status").textContent =
        error.message + " Reload or resume to inspect saved progress.";
    } finally {
      driving = false;
      stopRequested = false;
      setBusy(false);
    }
  }

  const startAgent = async () => {
    if (busy || agent?.status === "running" || !enabled()) return;
    const content = $("textarea").value.trim();
    if (!content && !attachment) {
      $("#status").textContent =
        "Enter an objective or attach a Markdown document.";
      return;
    }
    setBusy(true);
    try {
      const recipient = selectRecipient(content);
      const settings = {
        provider: recipient.provider,
        model: recipient.model,
        reasoning:
          recipient.provider === "anthropic" ? "none" : reasoning.value,
        jev: jev.checked,
        budget: Number($("#agent-budget").value),
        output: Number($("#agent-output").value),
      };
      await ensure();
      const user = messageRecord({ role: "user", content });
      apply(
        await request("agent_start", {
          conversation_id: currentId(),
          message_id: user.message_id,
          content:
            content || "Use the attached document as the agent objective.",
          attachments: attachment ? [attachment] : [],
          settings,
          limits: {
            duration_seconds: Number($("#agent-minutes").value) * 60,
            max_steps: Number($("#agent-steps").value),
            max_total_tokens: Number($("#agent-tokens").value),
          },
        }),
      );
      $("textarea").value = "";
      attachment = null;
      $("#attachment").hidden = true;
    } catch (error) {
      if (currentId()) {
        try {
          apply(await request("view"));
        } catch {}
      }
      $("#status").textContent = error.message;
      setBusy(false);
      return;
    }
    await driveAgent();
  };
  $("#agent-resume").onclick = async () => {
    if (busy) return;
    try {
      apply(await request("view"));
      await driveAgent();
    } catch (error) {
      $("#status").textContent = error.message;
    }
  };
  $("#agent-stop").onclick = async () => {
    if (driving) {
      stopRequested = true;
      controls();
      $("#status").textContent = "Stopping after the current step…";
      return;
    }
    if (busy || !agent) return;
    setBusy(true);
    try {
      apply(
        await request("agent_stop", {
          conversation_id: currentId(),
          run_id: agent.run_id,
        }),
      );
    } catch (error) {
      $("#status").textContent = error.message;
    } finally {
      setBusy(false);
    }
  };

  const normalSubmit = $("#composer").onsubmit;
  $("#composer").onsubmit = async (event) => {
    if (agentMode.checked) {
      event.preventDefault();
      if (busy || readingFile) return;
      if (!enabled()) toggle.checked = true;
      return startAgent();
    }
    if (!enabled()) return normalSubmit(event);
    event.preventDefault();
    if (busy || readingFile) return;
    const content = $("textarea").value.trim();
    if (!content && !attachment) return;
    let recipient;
    try {
      recipient = selectRecipient(content);
    } catch (error) {
      $("#status").textContent = error.message;
      return;
    }
    const model = recipient.model;
    const settings = {
      provider: recipient.provider,
      model,
      reasoning: recipient.provider === "anthropic" ? "none" : reasoning.value,
      jev: jev.checked,
      budget: Number($("#agent-budget").value),
      output: Number($("#agent-output").value),
    };
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
      add(recipient.name, "Thinking…", model);
      $("textarea").value = "";
      attachment = null;
      $("#attachment").hidden = true;
      $("#status").textContent =
        recipient.name + " is answering with the context layer…";
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

  agentMode.onchange = () => {
    if (agentMode.checked && messages.length && !currentId()) {
      agentMode.checked = false;
      $("#status").textContent = "Start a new context chat to use Agent Mode.";
    }
    if (agentMode.checked) toggle.checked = true;
    localStorage.setItem("converse-agent-mode", String(agentMode.checked));
    controls();
    if (!busy) watchProgress(false);
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
    if (!toggle.checked && agentMode.checked) {
      agentMode.checked = false;
      localStorage.setItem("converse-agent-mode", "false");
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

  const newChat = $("#new-chat").onclick;
  $("#new-chat").onclick = () => {
    const prior = conversation.conversation_id;
    newChat();
    if (prior === conversation.conversation_id) return;
    agent = null;
    latestView = null;
    window.workspaceEditor?.adopt(null);
    toggle.checked = available;
    jev.checked = !!capabilities?.credentials?.jev;
    $("#agent-budget").value = capabilities?.defaults?.budget || 256000;
    $("#agent-output").value = capabilities?.defaults?.output || 16384;
    $("#workspace-panel").hidden = true;
    watchProgress(false);
    $("#agent-status").textContent = "No agent run yet.";
    $("#agent-files").hidden = true;
    saved.value = "";
    $("#context-stats").textContent = "";
    $("#context-note").textContent =
      "GPT and Claude replies use saved context. JSON export includes the full audit record.";
    controls();
  };

  window.contextLayer = {
    editorView: () => latestView,
    refreshView: () => request('view'),
    saveEdit: async (action, input) => {
      if (busy) throw Error('Wait for the current request before saving.');
      if (!available || !currentId()) throw Error('Reconnect to a saved context chat before saving.');
      setBusy(true);
      try {
        const view = await request(action, { ...input, conversation_id: currentId() });
        apply(view);
        return view;
      } finally { setBusy(false); }
    },
    readItem: async (kind, id) => {
      const action = kind === 'source' ? 'source_event' : 'context_bundle';
      const param = kind === 'source' ? 'event' : 'bundle';
      const response = await fetch('/api/conclave?action=' + action + '&conversation=' + encodeURIComponent(currentId()) + '&' + param + '=' + encodeURIComponent(id), { cache: 'no-store' });
      if (response.status === 401) unlock();
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Could not load the text.');
      return data;
    },
    providerName,
    selectProvider: (name) => {
      if (busy || agent?.status === "running") return;
      provider.value = name === "Claude" ? "anthropic" : "openai";
      provider.onchange();
    },
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
