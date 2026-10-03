// Desktop panel sizes are local display preferences, independent of chats.
(() => {
  const root = document.documentElement;
  const panels = [];
  const visible = (selector) => {
    const element = document.querySelector(selector);
    return element && getComputedStyle(element).display !== "none"
      ? element.getBoundingClientRect().width
      : 0;
  };
  function resizer({
    selector,
    name,
    property,
    initial,
    min,
    max,
    sign = -1,
    axis = "x",
    corner = false,
  }) {
    const panel = document.querySelector(selector),
      handle = document.createElement("div");
    const media = matchMedia("(min-width: 900px)");
    let preferred = initial,
      drag = null;
    try {
      const saved = Number(localStorage.getItem("converse-size-" + name));
      if (Number.isFinite(saved) && saved >= min) preferred = saved;
    } catch {}
    handle.id = name + "-resize";
    handle.className =
      "panel-resize " +
      (axis === "y"
        ? "panel-resize-top"
        : sign > 0
          ? "panel-resize-right"
          : "panel-resize-left");
    if (corner) handle.classList.add("panel-resize-floating");
    handle.tabIndex = 0;
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-label", "Resize " + name.replaceAll("-", " "));
    handle.setAttribute(
      "aria-orientation",
      axis === "x" ? "vertical" : "horizontal",
    );
    handle.title = "Drag to resize. Use arrow keys; Home resets.";
    panel.append(handle);
    function apply(value = preferred, save = false) {
      const ceiling = Math.max(min, max());
      const size = Math.round(Math.min(ceiling, Math.max(min, value)));
      if (media.matches) root.style.setProperty(property, size + "px");
      else root.style.removeProperty(property);
      handle.setAttribute("aria-valuemin", min);
      handle.setAttribute("aria-valuemax", Math.round(ceiling));
      handle.setAttribute("aria-valuenow", size);
      if (save) {
        preferred = size;
        try {
          localStorage.setItem("converse-size-" + name, size);
        } catch {}
      }
    }
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !media.matches) return;
      event.preventDefault();
      handle.focus();
      const rect = panel.getBoundingClientRect();
      drag = {
        id: event.pointerId,
        start: axis === "x" ? event.clientX : event.clientY,
        size: axis === "x" ? rect.width : rect.height,
      };
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add("resizing-panel");
    });
    handle.addEventListener("pointermove", (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      apply(
        drag.size +
          sign * ((axis === "x" ? event.clientX : event.clientY) - drag.start),
        true,
      );
    });
    const end = () => {
      drag = null;
      document.body.classList.remove("resizing-panel");
    };
    handle.addEventListener("lostpointercapture", end);
    handle.addEventListener("pointercancel", end);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("keydown", (event) => {
      const keys =
        axis === "x" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
      if (!keys.includes(event.key) && event.key !== "Home") return;
      event.preventDefault();
      if (event.key === "Home" && initial === null) {
        preferred = null;
        root.style.removeProperty(property);
        try {
          localStorage.removeItem("converse-size-" + name);
        } catch {}
        return;
      }
      const rect = panel.getBoundingClientRect();
      apply(
        event.key === "Home"
          ? initial
          : (axis === "x" ? rect.width : rect.height) +
              sign *
                (event.key === keys[1] ? 1 : -1) *
                (event.shiftKey ? 50 : 10),
        true,
      );
    });
    // Settings height stays natural until explicitly resized.
    if (initial !== null) apply();
    panels.push(() => {
      if (initial !== null || preferred !== null) apply();
    });
  }
  const docked = matchMedia("(min-width: 1200px)");
  resizer({
    selector: "#sidebar",
    name: "chats",
    property: "--sidebar",
    initial: 280,
    min: 220,
    sign: 1,
    max: () =>
      Math.min(
        480,
        innerWidth - (docked.matches ? visible("#workspace-editor") : 0) - 480,
      ),
  });
  resizer({
    selector: "#workspace-editor",
    name: "workspace",
    property: "--workspace-width",
    initial: 420,
    min: 320,
    max: () =>
      Math.min(
        720,
        innerWidth - (docked.matches ? visible("#sidebar") + 480 : 32),
      ),
  });
  resizer({
    selector: "#context-panel > .sheet",
    name: "settings",
    property: "--settings-width",
    initial: 820,
    min: 280,
    max: () => document.querySelector("main").clientWidth - 32,
    corner: true,
  });
  resizer({
    selector: "#context-panel > .sheet",
    name: "settings-height",
    property: "--settings-height",
    initial: null,
    min: 180,
    axis: "y",
    max: () =>
      innerHeight - document.querySelector("#composer").offsetHeight - 24,
    corner: true,
  });
  let frame;
  const refresh = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => panels.forEach((apply) => apply()));
  };
  window.addEventListener("resize", refresh);
  new MutationObserver(refresh).observe(
    document.querySelector("#workspace-editor"),
    { attributes: true, attributeFilter: ["hidden"] },
  );
  new MutationObserver(refresh).observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });
  new ResizeObserver(refresh).observe(document.querySelector("#composer"));
})();
