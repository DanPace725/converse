const uid = (prefix) => prefix + "_" + crypto.randomUUID();
const now = () => new Date().toISOString();
let conversation = {
  schema_version: 1,
  conversation_id: uid("conv"),
  created_at: now(),
  participants: [
    { participant_id: "human", display_name: "You" },
    ...["GPT", "Claude", "Gemini"].map((name) => ({
      participant_id: name.toLowerCase(),
      display_name: name,
    })),
  ],
  attachments: [],
};
function messageRecord(data) {
  return {
    message_id: uid("msg"),
    timestamp: now(),
    participant_id:
      data.role === "user" ? "human" : data.provider.toLowerCase(),
    reply_to: null,
    mentions: [],
    attachment_ids: [],
    ...data,
  };
}
function attachmentText(a) {
  // A fence longer than any run in the document cannot be closed by its contents.
  const fence = "`".repeat(
    Math.max(3, ...[...a.content.matchAll(/`+/g)].map((m) => m[0].length + 1)),
  );
  return (
    "\n\n:::attachment " +
    JSON.stringify({
      attachment_id: a.attachment_id,
      name: a.name,
      mime_type: a.mime_type,
      sha256: a.sha256,
    }) +
    "\n" +
    fence +
    "text\n" +
    a.content +
    "\n" +
    fence +
    "\n:::end-attachment"
  );
}
function messageText(m) {
  return (
    m.content +
    (m.attachment_ids || [])
      .map((id) =>
        attachmentText(
          conversation.attachments.find((a) => a.attachment_id === id),
        ),
      )
      .join("")
  );
}
const names = ["GPT", "Claude", "Gemini"],
  messages = [],
  fields = {},
  $ = (s) => document.querySelector(s);
let targets = ["GPT"],
  busy = false,
  attachment = null,
  readingFile = false;
let preferences = {};
try {
  preferences =
    JSON.parse(localStorage.getItem("converse-models") || "{}") || {};
} catch {}
function rememberModels() {
  try {
    localStorage.setItem(
      "converse-models",
      JSON.stringify(
        Object.fromEntries(names.map((n) => [n, fields[n].value])),
      ),
    );
  } catch {}
}
function unlock() {
  if (!$("#unlock").open) $("#unlock").showModal();
}
function nearBottom() {
  const c = $("#chat");
  return c.scrollHeight - c.scrollTop - c.clientHeight < 100;
}
function followBottom() {
  const c = $("#chat");
  c.scrollTop = c.scrollHeight;
}

$("#model-panel").open = window.matchMedia("(min-width:1200px)").matches;
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("#model-panel").open) {
    $("#model-panel").open = false;
    $("#model-panel summary").focus();
  }
});
for (const name of names) {
  const label = document.createElement("label");
  label.textContent = "@" + name;
  const input = document.createElement("select");
  input.setAttribute("aria-label", name + " model");
  input.disabled = true;
  label.append(input);
  $(".models").append(label);
  fields[name] = input;
  input.onchange = rememberModels;
}
async function loadModels() {
  return fetch("/api/models")
    .then(async (r) => {
      if (r.status === 401) {
        unlock();
        throw Error("Unlock to load models.");
      }
      if (!r.ok) throw Error((await r.json()).error);
      return r.json();
    })
    .then((data) => {
      for (const name of names) {
        const d = data[name];
        const previous = fields[name].value || preferences[name];
        fields[name].parentNode.querySelector(".error")?.remove();
        fields[name].replaceChildren();
        for (const model of d.models) {
          const o = document.createElement("option");
          o.value = model;
          o.textContent =
            model === "gpt-4o-2024-11-20"
              ? "GPT-4o (2024-11-20)"
              : model === "gemini-3.1-pro-preview"
                ? "Gemini 3.1 Pro (preview)"
                : model;
          fields[name].append(o);
        }
        if (d.models.includes(previous)) fields[name].value = previous;
        fields[name].disabled = !d.models.length;
        if (d.error) {
          const p = document.createElement("span");
          p.className = "error";
          p.textContent = d.error;
          fields[name].parentNode.append(p);
        }
      }
      $("#status").textContent = "Ready";
      $("#send").disabled = false;
    })
    .catch((e) => {
      $("#status").textContent = "Could not load models: " + e.message;
    });
}
loadModels();
function renderReply(element, text) {
  element.rawMarkdown = text;
  if (!window.marked || !window.DOMPurify) {
    element.textContent = text;
    return;
  }
  const follow = nearBottom();
  element.className = "content markdown";
  element.innerHTML = DOMPurify.sanitize(marked.parse(text, { gfm: true }), {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "em",
      "del",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
      "hr",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "a",
      "input",
    ],
    ALLOWED_ATTR: [
      "href",
      "title",
      "start",
      "align",
      "type",
      "checked",
      "disabled",
    ],
    ALLOW_DATA_ATTR: false,
  });
  for (const link of element.querySelectorAll("a")) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  for (const input of element.querySelectorAll("input")) {
    input.type = "checkbox";
    input.disabled = true;
  }
  if (follow) followBottom();
}
function add(who, text, model = "", error = false) {
  $("#empty")?.remove();
  const a = document.createElement("article"),
    h = document.createElement("strong"),
    s = document.createElement("small"),
    p = document.createElement("div");
  h.textContent = who;
  s.textContent = model;
  p.className = error ? "error" : "content";
  p.textContent = text;
  p.rawMarkdown = text;
  a.append(h, s, p);
  if (model) {
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "copy-response";
    copy.textContent = "Copy";
    copy.setAttribute("aria-label", "Copy " + who + " response");
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(p.rawMarkdown ?? p.textContent);
        copy.textContent = "Copied";
      } catch {
        copy.textContent = "Copy failed";
      }
      setTimeout(() => (copy.textContent = "Copy"), 1800);
    };
    a.append(copy);
  }
  $("#chat").append(a);
  a.scrollIntoView({ behavior: "smooth", block: "nearest" });
  return p;
}
$("#upload").onclick = () => $("#markdown-file").click();
$("#remove-file").onclick = () => {
  attachment = null;
  $("#attachment").hidden = true;
  $("#markdown-file").value = "";
};
$("#markdown-file").onchange = async () => {
  const file = $("#markdown-file").files[0];
  if (!file) return;
  readingFile = true;
  $("#upload").disabled = true;
  try {
    if (!/\.(md|markdown)$/i.test(file.name))
      throw Error("Choose a .md or .markdown file.");
    if (file.size > 200000)
      throw Error("Please choose a Markdown file smaller than 200 KB.");
    const content = await file.text();
    if (!content.trim()) throw Error("That Markdown file is empty.");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      await file.arrayBuffer(),
    );
    attachment = {
      attachment_id: uid("att"),
      name: file.name,
      mime_type: "text/markdown",
      content,
      sha256: [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    };
    $("#filename").textContent = file.name;
    $("#attachment").hidden = false;
    $("#status").textContent =
      "File attached. Add a message or mentions, then Send.";
    $("textarea").focus();
  } catch (e) {
    $("#status").textContent = e.message;
  } finally {
    readingFile = false;
    $("#upload").disabled = busy;
    $("#markdown-file").value = "";
  }
};
$("#composer").onsubmit = async (e) => {
  e.preventDefault();
  if (busy || readingFile) return;
  const draft = $("textarea").value.trim();
  if (!draft && !attachment) return;
  const text = draft;
  const mentions = [...draft.matchAll(/@(GPT|Claude|Gemini)\b/gi)].map((m) =>
    names.find((n) => n.toLowerCase() === m[1].toLowerCase()),
  );
  const selected = mentions.length ? [...new Set(mentions)] : targets;
  if (selected.some((n) => !fields[n].value.trim())) {
    $("#status").textContent =
      "Choose a model for " +
      selected.filter((n) => !fields[n].value.trim()).join(", ");
    return;
  }
  targets = selected;
  busy = true;
  $("#new-chat").disabled = true;
  $("#upload").disabled = true;
  $("#remove-file").disabled = true;
  $("#send").disabled = true;
  Object.values(fields).forEach((f) => (f.disabled = true));
  const userMessage = messageRecord({
    role: "user",
    content: text,
    mentions: [...new Set(mentions)].map((n) => n.toLowerCase()),
    attachment_ids: attachment ? [attachment.attachment_id] : [],
  });
  if (attachment) conversation.attachments.push(attachment);
  messages.push(userMessage);
  saveChat();
  add("You", messageText(userMessage));
  $("textarea").value = "";
  attachment = null;
  $("#attachment").hidden = true;
  $("#export").disabled = true;
  $("#export-json").disabled = true;
  $("#status").textContent = "Waiting for " + targets.join(", ") + "…";
  const snapshot = messages
    .filter((m) => m.status !== "failed")
    .map((m) => ({ ...m, content: messageText(m), invocation: undefined }));
  const results = await Promise.all(
    targets.map(async (provider) => {
      const model = fields[provider].value.trim(),
        p = add(provider, "Thinking…", model);
      const record = messageRecord({
        role: "assistant",
        provider,
        model,
        content: "",
        reply_to: userMessage.message_id,
        status: "pending",
        invocation: {
          context_message_ids: snapshot.map((m) => m.message_id),
          attachment_ids: [
            ...new Set(snapshot.flatMap((m) => m.attachment_ids || [])),
          ],
          started_at: now(),
        },
        usage: null,
        pricing: null,
        estimated_cost_usd: null,
      });
      let answer = "";
      try {
        const r = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            model,
            messages: snapshot,
            stream: true,
          }),
        });
        if (!r.ok) {
          if (r.status === 401) unlock();
          throw Error((await r.json()).error);
        }
        const reader = r.body.getReader(),
          decoder = new TextDecoder();
        let buffer = "",
          done = false;
        function event(line) {
          if (!line.trim()) return;
          const d = JSON.parse(line);
          if (d.error) throw Error(d.error);
          if (d.delta) {
            answer += d.delta;
            renderReply(p, answer);
          }
          if (d.done) {
            done = true;
            Object.assign(record.invocation, d.provenance || {});
            record.usage = d.usage || null;
          }
        }
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true });
            let i;
            while ((i = buffer.indexOf("\n")) >= 0) {
              event(buffer.slice(0, i));
              buffer = buffer.slice(i + 1);
            }
          }
          buffer += decoder.decode();
          if (buffer.trim()) event(buffer);
          if (!done)
            throw Error("Connection ended before the response completed.");
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
        return {
          ...record,
          content: answer,
          status: "complete",
          completed_at: now(),
        };
      } catch (e) {
        p.className = "error";
        p.rawMarkdown = answer || e.message;
        p.textContent =
          (answer ? answer + "\n\n[Incomplete response]\n" : "") + e.message;
        return {
          ...record,
          content: answer,
          status: "failed",
          error: e.message,
          completed_at: now(),
        };
      }
    }),
  );
  messages.push(...results.filter(Boolean));
  saveChat();
  busy = false;
  $("#new-chat").disabled = false;
  $("#upload").disabled = false;
  $("#remove-file").disabled = false;
  $("#export").disabled = false;
  $("#export-json").disabled = false;
  $("#send").disabled = false;
  Object.values(fields).forEach((f) => (f.disabled = !f.options.length));
  $("#status").textContent = "Ready · " + targets.map((n) => "@" + n).join(" ");
  if (window.matchMedia("(pointer:fine)").matches) $("textarea").focus();
};
$("textarea").onkeydown = (e) => {
  if (
    e.key === "Enter" &&
    !e.shiftKey &&
    !e.isComposing &&
    window.matchMedia("(pointer:fine)").matches
  ) {
    e.preventDefault();
    $("#composer").requestSubmit();
  }
};
$("#export-json").onclick = () => {
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          { ...conversation, messages, exported_at: now() },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = conversation.conversation_id + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("#export").onclick = () => {
  const md =
    "# Model chat\n\nConversation: " +
    conversation.conversation_id +
    "\nExported: " +
    now() +
    "\n\n" +
    messages
      .map(
        (m) =>
          "## " +
          (m.role === "user" ? "You" : m.provider + " — " + m.model) +
          "\n\n" +
          messageText(m) +
          (m.status === "failed" ? "\n\n[Failed response] " + m.error : ""),
      )
      .join("\n\n---\n\n") +
    "\n";
  const url = URL.createObjectURL(
    new Blob([md], { type: "text/markdown;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "chat-" + new Date().toISOString().replace(/[:.]/g, "-") + ".md";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

function saveChat() {
  try {
    localStorage.setItem(
      "converse-chat",
      JSON.stringify({ ...conversation, messages }),
    );
  } catch {
    $("#status").textContent =
      "Device storage is full. Export to save your chat.";
  }
}
try {
  const saved = JSON.parse(localStorage.getItem("converse-chat") || "[]");
  const rows = Array.isArray(saved)
    ? saved
    : saved?.schema_version === 1
      ? saved.messages
      : [];
  if (!Array.isArray(saved) && saved?.schema_version === 1)
    conversation = saved;
  else if (rows.length) conversation.created_at = null;
  if (Array.isArray(rows)) {
    for (let m of rows) {
      if (
        !m ||
        !["user", "assistant"].includes(m.role) ||
        typeof m.content !== "string"
      )
        continue;
      m = messageRecord({ ...m, timestamp: m.timestamp || null });
      messages.push(m);
      const p = add(
        m.role === "user" ? "You" : m.provider,
        messageText(m),
        m.model || "",
      );
      if (m.status === "failed") {
        p.className = "error";
        p.textContent = m.content + "\n[Failed response] " + m.error;
      } else if (m.role === "assistant") renderReply(p, m.content);
    }
    $("#export").disabled = !messages.length;
    if (messages.length) saveChat();
  }
} catch {}
$("#unlock-form").onsubmit = async (e) => {
  e.preventDefault();
  const button = $("#unlock-form button");
  button.disabled = true;
  $("#unlock-error").textContent = "";
  try {
    const r = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: $("#password").value }),
    });
    if (r.ok) {
      $("#password").value = "";
      $("#unlock").close();
      await loadModels();
    } else $("#unlock-error").textContent = (await r.json()).error;
  } catch {
    $("#unlock-error").textContent =
      "Could not connect. Check your connection and try again.";
  } finally {
    button.disabled = false;
  }
};
$("#new-chat").onclick = () => {
  if (busy) return;
  if (
    messages.length &&
    !confirm(
      "Start a new chat? Export first if you want to keep this conversation.",
    )
  )
    return;
  messages.length = 0;
  conversation = {
    ...conversation,
    conversation_id: uid("conv"),
    created_at: now(),
    attachments: [],
  };
  saveChat();
  targets = ["GPT"];
  attachment = null;
  $("#attachment").hidden = true;
  $("textarea").value = "";
  $("#chat").replaceChildren();
  const empty = document.createElement("div");
  empty.id = "empty";
  empty.textContent = "One conversation. Your choice of models.";
  $("#chat").append(empty);
  $("#export").disabled = true;
  $("#status").textContent = "New chat · @GPT";
};
// Use the visible viewport so the composer stays above mobile software keyboards.
function resizeViewport() {
  document.documentElement.style.setProperty(
    "--app-height",
    (window.visualViewport?.height || window.innerHeight) + "px",
  );
}
window.visualViewport?.addEventListener("resize", resizeViewport);
window.addEventListener("resize", resizeViewport);
resizeViewport();

let installPrompt;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  $("#install").hidden = false;
});
$("#install").onclick = async () => {
  if (installPrompt) {
    await installPrompt.prompt();
    installPrompt = null;
    $("#install").hidden = true;
  }
};
if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
window.addEventListener(
  "offline",
  () =>
    ($("#status").textContent =
      "Offline — saved chat is available; sending needs internet."),
);
window.addEventListener("online", () => {
  if (!busy) loadModels();
});
