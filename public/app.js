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
  if (!a) return '';
  if (window.imageUploads.isImage(a)) return `\n\n[Image attached: ${a.name}; ${a.width} × ${a.height}; SHA-256 ${a.sha256}]`;
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
function messageText(m, includeImages = true) {
  return (
    m.content +
    (m.attachment_ids || [])
      .map(id => conversation.attachments.find(a => a.attachment_id === id))
      .filter(a => a && (includeImages || !window.imageUploads.isImage(a)))
      .map(attachmentText).join("")
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
let editingMessage = null, editReturnDraft = null;
function refreshAttachment() {
  $('#attachment').hidden = !attachment;
  if (attachment) $('#filename').textContent = attachment.name + (window.imageUploads.isImage(attachment) ? ` · ${attachment.width} × ${attachment.height}` : '');
  const preview = $('#attachment-preview');
  const src = window.imageUploads.url(attachment, window.contextLayer?.currentId());
  preview.hidden = !src; if (src) preview.src = src; else preview.removeAttribute('src');
  $('#attachment .file-icon').hidden = !!src;
}
function finishMessageEdit(restore = false) {
  if (restore && editReturnDraft) {
    $('textarea').value = editReturnDraft.content;
    attachment = editReturnDraft.attachment;
    refreshAttachment();
    $('textarea').dispatchEvent(new Event('input'));
  }
  editingMessage = null;
  editReturnDraft = null;
  $('#message-edit').hidden = true;
}
function editMessage(message) {
  if (busy || window.contextLayer?.editorView?.()?.agent?.status === 'running') return;
  if (!editingMessage) editReturnDraft = { content: $('textarea').value, attachment };
  editingMessage = message;
  $('textarea').value = message.content;
  const original = conversation.attachments.find(a => a.attachment_id === message.attachment_ids?.[0]);
  attachment = original ? { ...original, attachment_id: uid('att'), copied_from_attachment_id: original.attachment_id } : null;
  refreshAttachment();
  $('#message-edit').hidden = false;
  $('textarea').dispatchEvent(new Event('input'));
  $('textarea').focus();
}
$('#cancel-message-edit').onclick = () => finishMessageEdit(true);
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
let sessionGeneration = 0;
const session = () =>
  fetch("/api/session", { cache: "no-store" }).then((r) => r.json());
// Which sign-in the server expects, asked when the splash first has to open.
let signInMode;
// The splash page: shown over the app until this browser is let in.
function unlock() {
  signInMode ||= session()
    .then((d) => (d.sign_in === "google" ? "google" : "password"))
    .catch(() => {
      signInMode = undefined;
      return "password";
    });
  signInMode.then((mode) => {
    $("#unlock-form").hidden = mode === "google";
    $("#unlock-google").hidden = mode !== "google";
    if (!$("#unlock").open) $("#unlock").showModal();
    if (mode !== "google" && !$("#docs-dialog").open) $("#password").focus();
  });
}
// Escape does not dismiss it: the app behind cannot be used yet.
$("#unlock").addEventListener("cancel", (e) => e.preventDefault());
// Set once this browser has got into the app. Without it a visitor meets the
// splash straight away, not the app followed by the splash once the first
// request is refused.
const ENTERED = "converse-entered";
// Whether a request has succeeded since the page loaded.
let admitted = false;
// Marks the single automatic retry of a sign-in in this tab.
const SIGN_IN_RETRY = "converse-signin-retry";
function remember(entered) {
  admitted = entered;
  try {
    if (entered) {
      localStorage.setItem(ENTERED, "1");
      sessionStorage.removeItem(SIGN_IN_RETRY);
    } else localStorage.removeItem(ENTERED);
  } catch {}
}
// Device chats belong to the account that made them: each signed-in address
// has its own open chat and earlier chats in this browser. Password and local
// access have no account and use the plain keys. Starts as the last account
// seen here, so the app still opens offline.
const ACCOUNT = "converse-account";
const CHAT = "converse-chat";
const ARCHIVE = "converse-archive";
let account = "";
try {
  account = localStorage.getItem(ACCOUNT) || "";
} catch {}
const scoped = (key) => (account ? key + ":" + account : key);
// Chats saved before accounts had their own space go to the first account
// that signs in on this browser.
function claimUnowned() {
  if (!account) return;
  try {
    for (const key of [CHAT, ARCHIVE]) {
      const unowned = localStorage.getItem(key);
      if (unowned === null || localStorage.getItem(scoped(key)) !== null)
        continue;
      localStorage.setItem(scoped(key), unowned);
      localStorage.removeItem(key);
    }
  } catch {}
}
// A different account from the one this page opened with: put away what is on
// screen and show that account's own chats.
function useAccount(email) {
  email = String(email || "").trim().toLowerCase();
  if (email === account) return;
  // The chat on screen stays saved under the account it belongs to.
  messages.length = 0;
  delete conversation.context_layer;
  account = email;
  try {
    if (email) localStorage.setItem(ACCOUNT, email);
    else localStorage.removeItem(ACCOUNT);
  } catch {}
  claimUnowned();
  shelve();
  $("#new-chat").onclick();
}
function adoptAccount(d) {
  if (d.sign_in === "google") {
    if (d.user?.email) useAccount(d.user.email);
  } else if (d.sign_in === "password") useAccount("");
}
// Asked on every load: whose chats to show, and for a browser that has never
// got in, whether to keep the splash up.
function arrive() {
  let fresh = false;
  try {
    fresh = !localStorage.getItem(ENTERED) && navigator.onLine;
  } catch {}
  if (fresh) $("#unlock").showModal();
  session()
    .then((d) => {
      adoptAccount(d);
      if (!fresh) return;
      // A request that already got through outranks a late or partial answer.
      if (d.access || admitted) return $("#unlock").close();
      signInMode = Promise.resolve(
        d.sign_in === "google" ? "google" : "password",
      );
      unlock();
    })
    .catch(() => {
      if (fresh) $("#unlock").close();
    });
}
async function refreshAccount() {
  try {
    const d = await session();
    adoptAccount(d);
    $("#sign-out").hidden = !d.user;
    if (d.user) $("#sign-out").textContent = `Sign out (${d.user.email})`;
  } catch {}
}
function nearBottom() {
  const c = $("#chat");
  return c.scrollHeight - c.scrollTop - c.clientHeight < 100;
}
function followBottom() {
  const c = $("#chat");
  c.scrollTop = c.scrollHeight;
}
// Replies never pull the view along. Sending scrolls your message to the top;
// a trailing spacer keeps that possible while the reply is still short.
let anchorId = null;
function chatTail() {
  const c = $("#chat");
  let tail = $("#chat-tail");
  if (!tail) {
    tail = document.createElement("div");
    tail.id = "chat-tail";
    tail.setAttribute("aria-hidden", "true");
  }
  if (tail.parentNode !== c || tail.nextSibling) c.append(tail);
  return tail;
}
function appendToChat(node) {
  const tail = $("#chat-tail");
  if (tail?.parentNode === $("#chat")) tail.before(node);
  else $("#chat").append(node);
}
function anchored() {
  return anchorId
    ? $("#chat").querySelector(`article[data-message-id="${CSS.escape(anchorId)}"]`)
    : null;
}
function updateTail() {
  const c = $("#chat"),
    tail = chatTail(),
    anchor = anchored();
  const space = anchor
    ? Math.max(0, c.clientHeight - (tail.offsetTop - anchor.offsetTop) - 24)
    : 0;
  tail.style.height = space + "px";
}
function anchorMessage(id) {
  anchorId = id;
  updateTail();
  const anchor = anchored();
  if (anchor)
    $("#chat").scrollTo({
      top: Math.max(0, anchor.offsetTop - 12),
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
}
function clearAnchor() {
  anchorId = null;
  updateTail();
}
window.addEventListener("resize", () => updateTail());
// Paces bursty network chunks into an even reveal and renders at most once
// per frame budget, so long Markdown stays responsive on phones.
function createStream(element, { onRender } = {}) {
  let target = "",
    shown = 0,
    frame = null,
    last = 0,
    cost = 0,
    finishing = false,
    settle = null;
  const article = element.closest("article");
  article?.classList.add("is-streaming");
  function tick(time) {
    frame = null;
    const backlog = target.length - shown;
    if (backlog <= 0) {
      settle?.();
      return;
    }
    if (time - last >= Math.max(32, cost * 3)) {
      const step = finishing
        ? Math.max(40, Math.ceil(backlog / 3))
        : Math.max(2, Math.ceil(backlog / 14));
      shown = Math.min(target.length, shown + step);
      // Avoid splitting a surrogate pair (emoji) mid-reveal.
      const code = target.charCodeAt(shown - 1);
      if (code >= 0xd800 && code <= 0xdbff) shown++;
      const started = performance.now();
      renderReply(element, target.slice(0, shown), { streaming: true });
      cost = performance.now() - started;
      last = time;
      onRender?.();
    }
    frame = requestAnimationFrame(tick);
  }
  return {
    get text() {
      return target;
    },
    push(delta) {
      target += delta;
      if (!frame) frame = requestAnimationFrame(tick);
    },
    finish() {
      finishing = true;
      if (shown >= target.length) return Promise.resolve();
      return new Promise((resolve) => {
        settle = resolve;
        if (!frame) frame = requestAnimationFrame(tick);
        // Hidden tabs pause animation frames; never hold the reply hostage.
        setTimeout(resolve, 1200);
      });
    },
    stop() {
      cancelAnimationFrame(frame);
      frame = null;
      article?.classList.remove("is-streaming");
    },
  };
}

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
  const generation = sessionGeneration;
  return fetch("/api/models")
    .then(async (r) => {
      if (generation !== sessionGeneration) return null;
      if (r.status === 401) {
        remember(false);
        unlock();
        throw Error("Unlock to load models.");
      }
      if (!r.ok) throw Error((await r.json()).error);
      return r.json();
    })
    .then((data) => {
      if (!data || generation !== sessionGeneration) return;
      remember(true);
      if ($("#unlock").open) $("#unlock").close();
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
      const context = window.contextLayer?.refresh();
      refreshAccount();
      // Resolves once the chat list and open conversation have reloaded too.
      return context;
    })
    .catch((e) => {
      if (generation !== sessionGeneration) return;
      $("#status").textContent = "Could not load models: " + e.message;
    });
}
arrive();
loadModels();
function renderReply(element, text, { streaming = false } = {}) {
  element.rawMarkdown = text;
  if (!window.marked || !window.DOMPurify) {
    element.textContent = text;
    return;
  }
  element.className = "content markdown";
  const math = window.converseMath?.parse(text);
  element.innerHTML = DOMPurify.sanitize(math?.html || marked.parse(text, { gfm: true }), {
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
      "span",
    ],
    ALLOWED_ATTR: [
      "href",
      "title",
      "start",
      "align",
      "type",
      "checked",
      "disabled",
      "data-converse-math",
    ],
    ALLOW_DATA_ATTR: false,
  });
  if (math) window.converseMath.render(element, math.formulas);
  for (const link of element.querySelectorAll("a")) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  for (const input of element.querySelectorAll("input")) {
    input.type = "checkbox";
    input.disabled = true;
  }
  if (!streaming) {
    element.closest("article")?.classList.remove("is-streaming");
    for (const pre of element.querySelectorAll("pre")) {
      const code = pre.querySelector("code") || pre;
      pre.append(copyButton("copy-code", "Copy code", () => code.textContent));
    }
  }
}
function copyButton(className, label, text) {
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = className;
  copy.textContent = "Copy";
  copy.setAttribute("aria-label", label);
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(text());
      copy.textContent = "Copied";
    } catch {
      copy.textContent = "Copy failed";
    }
    setTimeout(() => (copy.textContent = "Copy"), 1800);
  };
  return copy;
}
// Display-only: attachments become collapsible cards; records keep the full text.
const attachmentPattern =
  /\n\n:::attachment (\{.*\})\n(`{3,})text\n([\s\S]*?)\n\2\n:::end-attachment/g;
function showText(element, text) {
  const cards = [];
  const body = text.replace(attachmentPattern, (_, meta, fence, content) => {
    let name = "Attachment";
    try {
      name = JSON.parse(meta).name || name;
    } catch {}
    const card = document.createElement("details");
    card.className = "attachment-card";
    const summary = document.createElement("summary"),
      icon = document.createElement("span"),
      pre = document.createElement("pre");
    icon.className = "file-icon";
    icon.textContent = "MD";
    summary.append(icon, name);
    pre.textContent = content;
    card.append(summary, pre);
    cards.push(card);
    return "";
  });
  element.textContent = body;
  element.append(...cards);
}
function add(who, text, model = "", error = false, message = null) {
  $("#empty")?.remove();
  const user = who === "You";
  const a = document.createElement("article"),
    head = document.createElement("div"),
    avatar = document.createElement("span"),
    h = document.createElement("strong"),
    s = document.createElement("small"),
    p = document.createElement("div");
  a.className = user ? "msg msg-user" : "msg";
  if (!user) a.dataset.provider = who.toLowerCase();
  if (message?.message_id) a.dataset.messageId = message.message_id;
  head.className = "msg-head";
  avatar.className = "avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = who.slice(0, 1);
  h.textContent = who;
  s.textContent = model;
  head.append(avatar, h, s);
  p.className = error ? "error" : "content";
  p.rawMarkdown = text;
  if (text === "Thinking…") {
    p.innerHTML =
      '<span class="typing" role="img" aria-label="Thinking"><i></i><i></i><i></i></span>';
  } else showText(p, user && message ? messageText(message, false) : text);
  if (user && message) for (const id of message.attachment_ids || []) {
    const image = window.imageUploads.card(conversation.attachments.find(a => a.attachment_id === id), window.contextLayer?.currentId());
    if (image) p.append(image);
  }
  if (user) {
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.append(p);
    a.append(head, bubble);
  } else a.append(head, p);
  if (model || (user && message)) {
    const actions = document.createElement("div");
    actions.className = "msg-actions";
    actions.append(
      copyButton(
        user ? "copy-message" : "copy-response",
        user ? "Copy your message" : "Copy " + who + " response",
        () => user ? message.content : p.rawMarkdown ?? p.textContent,
      ),
    );
    if (user) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'edit-message';
      edit.textContent = 'Edit';
      edit.setAttribute('aria-label', 'Edit your message');
      edit.onclick = () => editMessage(message);
      actions.append(edit);
    }
    a.append(actions);
  }
  appendToChat(a);
  // Server turns keep reasoning on the user message; show it inside the reply.
  if (user && message?.reasoning) {
    const trail = window.reasoningUI.detached(message.reasoning, message.message_id);
    if (trail) a.after(trail);
  } else if (message?.reasoning)
    window.reasoningUI.show(a, message.reasoning, message.message_id);
  const before = a.previousElementSibling;
  if (!user && before?.classList.contains("thoughts")) head.after(before);
  return p;
}
const starters = {
  chat: [
    ["Compare perspectives", "@GPT @Claude @Gemini What's the strongest argument for and against a four-day work week?"],
    ["Get a second opinion", "@Claude Review this plan and point out what I'm missing: "],
    ["Brainstorm together", "@GPT @Gemini Give me five unusual ideas for a weekend project."],
    ["Explain simply", "@GPT Explain how vaccines train the immune system, like I'm 12."],
  ],
  context: [
    ["Start a long project", "I'm planning a project. I'll share goals and constraints as we go; keep track of them."],
    ["Work through a document", "Summarize the attached document and list open questions."],
    ["Make decisions stick", "Help me decide between three options. Record each decision we make."],
  ],
  agent: [
    ["Verify a calculation", "Calculate 17 × 23, write the result to proof.md, read it back, then report what you verified."],
    ["Draft a file", "Write a one-page project brief to brief.md with goals, risks and next steps, then read it back."],
  ],
};
const modeIntro = {
  chat: () => [
    "Ask one model or several",
    "Pick who replies below, or type @GPT, @Claude or @Gemini. Hold a name to change its model. Each model sees the whole conversation. Saved on this device.",
  ],
  context: (who) => [
    "A conversation that remembers",
    who +
      " replies from a curated working context while the full history is saved on the server. Good for long threads. Hold a name below to change its model.",
  ],
  agent: (who) => [
    "Give the agent an objective",
    who +
      " works step by step with tools: calculating, writing and reading workspace files. Keep this tab open while it runs.",
  ],
};
function emptyState(
  mode = window.converseMode?.() || "chat",
  who = window.contextLayer?.providerName?.() || "GPT",
) {
  const empty = document.createElement("div"),
    title = document.createElement("h2"),
    text = document.createElement("p"),
    list = document.createElement("div");
  empty.id = "empty";
  empty.dataset.mode = mode;
  // Lets the shell redraw the intro when the answering assistant changes.
  empty.dataset.who = mode === "chat" ? "" : who;
  [title.textContent, text.textContent] = modeIntro[mode](who);
  list.className = "starters";
  for (const [label, prompt] of starters[mode]) {
    const button = document.createElement("button"),
      strong = document.createElement("strong"),
      span = document.createElement("span");
    button.type = "button";
    strong.textContent = label;
    span.textContent = prompt;
    button.append(strong, span);
    button.onclick = () => {
      const box = $("textarea");
      box.value = prompt;
      box.dispatchEvent(new Event("input"));
      box.focus();
      box.setSelectionRange(prompt.length, prompt.length);
    };
    list.append(button);
  }
  empty.append(title, text, list);
  return empty;
}
function showEmpty(who) {
  $("#empty")?.remove();
  appendToChat(emptyState(undefined, who));
}
$("#upload").onclick = () => { window.imageUploads.mode(!!window.contextLayer?.enabled()); $("#markdown-file").click(); };
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
    if (/\.(png|jpe?g)$/i.test(file.name) || file.type.startsWith('image/')) {
      if (!window.contextLayer?.enabled()) throw Error('Switch to Context or Agent to attach an image.');
      attachment = await window.imageUploads.prepare(file);
      refreshAttachment();
      $('#status').textContent = `Image ready for the model · ${attachment.width} × ${attachment.height}. Add a message, then Send.`;
      $('textarea').focus();
      return;
    }
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
    refreshAttachment();
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
  if (window.imageUploads.isImage(attachment) && !window.contextLayer?.enabled()) { $('#status').textContent = 'Switch to Context or Agent to send this image.'; return; }
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
    ...(editingMessage ? { revises_message_id: editingMessage.message_id } : {}),
  });
  if (attachment) conversation.attachments.push(attachment);
  messages.push(userMessage);
  saveChat();
  add("You", messageText(userMessage), '', false, userMessage);
  anchorMessage(userMessage.message_id);
  finishMessageEdit();
  $("textarea").value = "";
  attachment = null;
  $("#attachment").hidden = true;
  $("#export").disabled = true;
  $("#export-json").disabled = true;
  $("#status").textContent = "Waiting for " + targets.join(", ") + "…";
  const snapshot = messages
    .filter((m) => m.status !== "failed")
    .map((m) => ({ ...m, content: (m.revises_message_id ? `[Application metadata: revision of message ${m.revises_message_id}]\n` : '') + messageText(m), invocation: undefined }));
  const results = await Promise.all(
    targets.map(async (provider) => {
      const model = fields[provider].value.trim(),
        p = add(provider, "Thinking…", model),
        stream = createStream(p, { onRender: updateTail });
      updateTail();
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
          if (d.error) {
            Object.assign(record.invocation, d.provenance || {});
            record.usage = d.usage || null;
            if (d.reasoning?.text || d.reasoning?.opaque_available) record.reasoning = { ...d.reasoning, model: d.provenance?.reported_model || model, requested_model: model, request_id: record.message_id };
            window.reasoningUI.show(p.closest('article'), record.reasoning);
            throw Error(d.error);
          }
          if (d.type === 'reasoning') {
            record.reasoning ||= { provider, model, status: 'partial', request_id: record.message_id };
            window.reasoningUI.live(p.closest('article'), true);
            window.reasoningUI.delta(p.closest('article'), record.reasoning, d);
          }
          if (d.type !== 'reasoning' && d.delta) {
            // Reasoning is finished once the answer begins.
            if (!answer && record.reasoning) window.reasoningUI.live(p.closest('article'), false);
            answer += d.delta;
            stream.push(d.delta);
          }
          if (d.done) {
            done = true;
            Object.assign(record.invocation, d.provenance || {});
            record.usage = d.usage || null;
            record.reasoning = { ...d.reasoning, model: d.provenance?.reported_model || model, requested_model: model, request_id: record.message_id };
            window.reasoningUI.show(p.closest('article'), record.reasoning);
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
          await stream.finish();
          stream.stop();
          renderReply(p, answer);
          if (p.closest("article").querySelector(":scope > .thoughts"))
            window.reasoningUI.live(p.closest("article"), false);
        } finally {
          stream.stop();
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
        stream.stop();
        if (p.closest("article").querySelector(":scope > .thoughts"))
          window.reasoningUI.live(p.closest("article"), false);
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
  $("#status").textContent = "Ready";
  void autoNameConversation();
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
$("#export-json").onclick = async () => {
  if (window.contextLayer?.downloadExport()) return;
  const { exportFilename } = await import('./export-name.js');
  const exportedAt = now();
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          {
            ...conversation,
            messages,
            exported_at: exportedAt,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = exportFilename(conversation.title, exportedAt);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("#export").onclick = async () => {
  const { exportFilename } = await import('./export-name.js');
  const exportedAt = now();
  const md =
    "# Model chat\n\nConversation: " +
    conversation.conversation_id +
    "\nExported: " +
    exportedAt +
    "\n\n" +
    messages
      .map(
        (m) =>
          "## " +
          (m.role === "user" ? "You" : m.provider + " — " + m.model) +
          "\n\n" +
          messageText(m) +
          window.reasoningUI.markdown(m.reasoning) +
          (m.status === "failed" ? "\n\n[Failed response] " + m.error : ""),
      )
      .join("\n\n---\n\n") +
    "\n";
  const url = URL.createObjectURL(
    new Blob([md], { type: "text/markdown;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = exportFilename(conversation.title, exportedAt, 'md');
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

function saveChat() {
  try {
    localStorage.setItem(
      scoped(CHAT),
      JSON.stringify({ ...conversation, messages }),
    );
  } catch {
    $("#status").textContent =
      "Device storage is full. Export to save your chat.";
  }
}

const titleRequests = new Map();
async function autoNameConversation() {
  if (busy || conversation.title_generated || window.contextLayer?.editorView?.()?.agent?.status === 'running') return;
  const first = messages.find(m => m.role === 'user');
  const assistant = messages.find(m => m.role === 'assistant' && m.status !== 'failed');
  if (!first || !assistant) return;
  const id = conversation.conversation_id, server = !!conversation.context_layer;
  if (!titleRequests.has(id)) {
    titleRequests.set(id, (async () => {
      try {
        const response = await fetch('/api/title', { method: 'POST', signal: AbortSignal.timeout(35000), headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: assistant.provider, model: assistant.invocation?.requested_model || assistant.model,
            content: (first.content || 'Discuss the attached document: ' + (conversation.attachments[0]?.name || 'document')).slice(0, 4000) }) });
        if (!response.ok) return null;
        return await response.json();
      } catch { return null; }
    })());
  }
  const result = await titleRequests.get(id);
  if (!result?.title) return;
  try {
    if (server) {
      // A later turn may have started while naming; save the cached result when idle.
      if (busy) return;
      await window.contextLayer.name(id, result);
    } else {
      const update = record => ({ ...record, title: result.title, title_generated: true, title_generation: result });
      if (conversation.conversation_id === id) { conversation = update(conversation); saveChat(); }
      else writeArchive(readArchive().map(record => record.conversation_id === id ? update(record) : record));
    }
    window.converseSync?.();
  } catch { /* Keep the first-message fallback when naming/storage is unavailable. */ }
}
function loadRecord(saved) {
  finishMessageEdit();
  const rows = Array.isArray(saved)
    ? saved
    : saved?.schema_version === 1
      ? saved.messages
      : [];
  if (!Array.isArray(saved) && saved?.schema_version === 1) {
    conversation = { ...saved };
    delete conversation.messages;
    delete conversation.archived_at;
  } else if (rows.length) conversation.created_at = null;
  messages.length = 0;
  anchorId = null;
  $("#chat").replaceChildren();
  $("#chat").dataset.conversation = conversation.conversation_id;
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
        false,
        m,
      );
      if (m.status === "failed") {
        p.className = "error";
        p.textContent = m.content + "\n[Failed response] " + m.error;
      } else if (m.role === "assistant") renderReply(p, m.content);
    }
  }
  if (!messages.length) showEmpty();
  updateTail();
  $("#export").disabled = !messages.length;
}

// Earlier device-local chats; context chats live on the server instead.
function readArchive() {
  try {
    const list = JSON.parse(localStorage.getItem(scoped(ARCHIVE)) || "[]");
    return Array.isArray(list) ? list.filter((c) => c?.conversation_id) : [];
  } catch {
    return [];
  }
}
function writeArchive(list) {
  list = list.slice(0, 20);
  for (;;) {
    try {
      localStorage.setItem(scoped(ARCHIVE), JSON.stringify(list));
      return true;
    } catch {
      // Drop the oldest chats until the archive fits in device storage.
      if (list.length <= 1) return false;
      list.pop();
    }
  }
}
function archiveCurrent() {
  if (!messages.length || conversation.context_layer) return true;
  const list = readArchive().filter(
    (c) => c.conversation_id !== conversation.conversation_id,
  );
  list.unshift({ ...conversation, messages: [...messages], archived_at: now() });
  return writeArchive(list);
}
// Puts the saved open chat among the earlier chats, so the app opens on a new
// one. A context chat is already on the server and needs no local copy. False
// when it could not be put away and should stay open instead.
function shelve() {
  try {
    const saved = JSON.parse(localStorage.getItem(scoped(CHAT)) || "null");
    if (saved === null) return true;
    if (!saved.context_layer && saved.messages?.length) {
      if (saved.schema_version !== 1 || !saved.conversation_id) return false;
      const list = readArchive().filter(
        (c) => c.conversation_id !== saved.conversation_id,
      );
      list.unshift({ ...saved, archived_at: now() });
      if (!writeArchive(list)) return false;
    }
    localStorage.removeItem(scoped(CHAT));
    return true;
  } catch {
    return false;
  }
}
// Opening the app starts a new chat; reloading the tab keeps the open one.
const TAB = "converse-tab";
try {
  const reloaded = sessionStorage.getItem(TAB) === "1";
  sessionStorage.setItem(TAB, "1");
  if (!reloaded) shelve();
} catch {}
try {
  const saved = JSON.parse(localStorage.getItem(scoped(CHAT)) || "[]");
  loadRecord(saved);
  targets = recipientsOf({ messages });
  if (messages.length) saveChat();
} catch {
  if (!messages.length) showEmpty();
}
// Restore the providers that answered the latest message.
function recipientsOf(record) {
  const rows = record.messages || [];
  const last = rows.findLast((m) => m.role === "user");
  const picked = names.filter((n) =>
    rows.some(
      (m) =>
        m.role === "assistant" &&
        m.provider === n &&
        last &&
        m.reply_to === last.message_id,
    ),
  );
  return picked.length ? picked : ["GPT"];
}
window.localChats = {
  list: readArchive,
  archiveCurrent,
  open(id) {
    if (busy) return;
    const record = readArchive().find((c) => c.conversation_id === id);
    if (!record) return;
    $("#new-chat").onclick();
    if (messages.length) return;
    writeArchive(readArchive().filter((c) => c.conversation_id !== id));
    loadRecord(record);
    saveChat();
    targets = recipientsOf(record);
    // A device-local chat never uses the context layer.
    $("#context-mode").checked = false;
    if ($("#agent-mode").checked) {
      $("#agent-mode").checked = false;
      $("#agent-mode").dispatchEvent(new Event("change"));
    }
    $("#status").textContent = "Opened chat from this device";
    followBottom();
    window.converseSync?.();
  },
  remove(id) {
    writeArchive(readArchive().filter((c) => c.conversation_id !== id));
    window.converseSync?.();
  },
};
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
      sessionGeneration++;
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
// `resuming` is the one automatic second pass after a return that did not
// complete; Google already knows the account, so it goes straight through.
async function googleSignIn({ resuming = false } = {}) {
  const button = $("#google-sign-in"),
    note = $("#unlock-error");
  button.disabled = true;
  note.classList.toggle("pending", resuming);
  note.textContent = resuming ? "Finishing sign-in…" : "";
  try {
    const r = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "google" }),
    });
    const data = await r.json();
    // The button stays disabled while the browser leaves for Google.
    if (r.ok && data.url) return location.assign(data.url);
    note.textContent = data.error || "Could not start Google sign-in.";
  } catch {
    note.textContent =
      "Could not connect. Check your connection and try again.";
  }
  note.classList.remove("pending");
  button.disabled = false;
}
$("#google-sign-in").onclick = () => googleSignIn();
// Coming back to this page with Back leaves the splash ready to use again.
window.addEventListener("pageshow", (e) => {
  if (!e.persisted) return;
  $("#google-sign-in").disabled = false;
  if ($("#unlock-error").classList.contains("pending")) {
    $("#unlock-error").classList.remove("pending");
    $("#unlock-error").textContent = "";
  }
});
$("#reload-app").onclick = () => {
  if (busy && !confirm("A reply is still in progress. Reload anyway?")) return;
  location.reload();
};
$("#sign-out").onclick = async () => {
  await fetch("/api/session", { method: "DELETE" }).catch(() => {});
  remember(false);
  // Nothing of this account stays on the page behind the splash.
  try {
    localStorage.removeItem(ACCOUNT);
    sessionStorage.removeItem(TAB);
  } catch {}
  location.reload();
};
const signInOutcome = new URLSearchParams(location.search).get("signin");
if (signInOutcome) {
  history.replaceState(null, "", location.pathname);
  // A first return can fail where an immediate second pass succeeds, as seen
  // with accounts new to the app. Try that once before asking the person to.
  let retry = false;
  try {
    retry =
      signInOutcome === "failed" && !sessionStorage.getItem(SIGN_IN_RETRY);
    if (retry) sessionStorage.setItem(SIGN_IN_RETRY, "1");
    else sessionStorage.removeItem(SIGN_IN_RETRY);
  } catch {}
  $("#unlock-error").textContent =
    signInOutcome === "denied"
      ? "This Google account does not have access to Converse."
      : retry
        ? ""
        : "Google sign-in did not complete. Try again.";
  unlock();
  if (retry) googleSignIn({ resuming: true });
}
$("#new-chat").onclick = () => {
  if (busy) return;
  if (
    messages.length &&
    !archiveCurrent() &&
    !confirm(
      "This device is out of space for saved chats. Start a new chat anyway? Export first to keep this conversation.",
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
  delete conversation.context_layer;
  delete conversation.title;
  delete conversation.title_generated;
  delete conversation.title_generation;
  finishMessageEdit();
  saveChat();
  targets = ["GPT"];
  attachment = null;
  $("#attachment").hidden = true;
  $("textarea").value = "";
  anchorId = null;
  $("#chat").replaceChildren();
  $("#chat").dataset.conversation = conversation.conversation_id;
  showEmpty();
  updateTail();
  $("#export").disabled = true;
  $("#status").textContent = "New chat";
  window.converseSync?.();
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
