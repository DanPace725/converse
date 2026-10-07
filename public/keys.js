// Personal provider API keys. The server checks, encrypts and stores a key;
// this page only ever receives its last four characters.
(() => {
  const dialog = document.getElementById("keys-dialog");
  const list = document.getElementById("keys-list");
  const status = document.getElementById("keys-status");
  const open = document.getElementById("keys-open");
  const say = (text, failed = false) => {
    status.textContent = text;
    status.classList.toggle("error", failed);
  };
  function describe(provider) {
    if (provider.source === "own") return `Your key ending in ${provider.hint}`;
    if (provider.unreadable)
      return `The saved key ending in ${provider.hint} can no longer be read. Enter it again.`;
    if (provider.source === "shared") return "Using this app's shared key";
    return "No key saved";
  }
  function render(providers) {
    list.replaceChildren(
      ...providers.map((provider) => {
        const form = document.createElement("form");
        form.className = "key-row";
        form.dataset.provider = provider.id;
        const name = document.createElement("strong");
        name.textContent = provider.label;
        const state = document.createElement("span");
        state.className = "note";
        state.textContent = describe(provider);
        const input = document.createElement("input");
        input.type = "password";
        input.autocomplete = "off";
        input.spellcheck = false;
        input.placeholder = provider.hint ? "Replace key" : "Paste API key";
        input.setAttribute("aria-label", `${provider.label} API key`);
        const save = document.createElement("button");
        save.textContent = "Save";
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "key-remove";
        remove.textContent = "Remove";
        remove.hidden = !provider.hint;
        form.append(name, state, input, save, remove);
        form.onsubmit = (event) => {
          event.preventDefault();
          const key = input.value.trim();
          if (!key) return input.focus();
          change(form, { action: "save", provider: provider.id, key }, `Checking the key with ${provider.label}…`, `${provider.label} key saved.`);
        };
        remove.onclick = () =>
          change(form, { action: "remove", provider: provider.id }, "Removing…", `${provider.label} key removed.`);
        return form;
      }),
    );
  }
  async function change(form, input, working, done) {
    const controls = [...list.querySelectorAll("input, button")];
    for (const control of controls) control.disabled = true;
    say(working);
    try {
      const response = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Could not update the key.");
      render(data.providers);
      say(done);
      // Model lists and Context/Agent availability follow the saved keys.
      window.loadModels?.();
    } catch (error) {
      for (const control of controls) control.disabled = false;
      say(
        error instanceof TypeError
          ? "Could not connect. Check your connection and try again."
          : error.message,
        true,
      );
      form.querySelector("input").select();
    }
  }
  async function load() {
    const response = await fetch("/api/keys", { cache: "no-store" });
    return response.ok ? response.json() : null;
  }
  open.onclick = async () => {
    document.getElementById("more-menu").open = false;
    say("");
    dialog.showModal();
    try {
      const data = await load();
      if (!data?.enabled) throw Error();
      render(data.providers);
    } catch {
      list.replaceChildren();
      say("Could not load your keys. Reconnect and try again.", true);
    }
  };
  document.getElementById("keys-close").onclick = () => dialog.close();
  // Offered only where the deployment has personal keys on. Someone signed in
  // with no usable key yet is taken straight to adding one.
  load()
    .then((data) => {
      if (!data?.enabled) return;
      open.hidden = false;
      if (data.providers.some((provider) => provider.source)) return;
      if (document.querySelector("dialog[open]")) return;
      render(data.providers);
      say("Add a key for at least one provider to start chatting.");
      dialog.showModal();
    })
    .catch(() => {});
})();
