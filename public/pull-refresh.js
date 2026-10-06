// Pull down at the top of the conversation to refresh models, the chat list and
// the open conversation in place. The page is not reloaded, so an unsent draft
// survives; "Reload app" in the menu does the full reload.
(() => {
  const scroller = $("#chat"),
    indicator = $("#pull-refresh");
  // Finger travel is halved; the chip must reach THRESHOLD to refresh.
  const THRESHOLD = 56,
    LIMIT = 72,
    SLOP = 8;
  let startX = 0,
    startY = 0,
    distance = 0,
    tracking = false,
    refreshing = false;
  function show(state) {
    indicator.dataset.state = state;
    indicator.style.setProperty("--pull", distance + "px");
    indicator.style.setProperty("--show", Math.min(1, distance / 32));
    indicator.style.setProperty("--turn", distance * 4 + "deg");
  }
  // A scrolled block inside the conversation keeps its own downward drag.
  function atTop(target) {
    for (let node = target; node && node !== scroller; node = node.parentElement)
      if (node.scrollTop > 0) return false;
    return scroller.scrollTop <= 0;
  }
  scroller.addEventListener(
    "touchstart",
    (e) => {
      tracking =
        e.touches.length === 1 && !refreshing && !busy && atTop(e.target);
      distance = 0;
      if (tracking) ({ clientX: startX, clientY: startY } = e.touches[0]);
    },
    { passive: true },
  );
  scroller.addEventListener(
    "touchmove",
    (e) => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - startX,
        dy = e.touches[0].clientY - startY;
      if (
        e.touches.length !== 1 ||
        scroller.scrollTop > 0 ||
        (!distance && (dy < -SLOP || Math.abs(dx) > Math.max(SLOP, dy)))
      ) {
        // Upward, sideways and multi-finger gestures belong to the page.
        tracking = false;
        distance = 0;
        return show("");
      }
      // Hold the page still from the first downward movement so iOS does not
      // rubber-band under the chip; nothing above the top could scroll anyway.
      if (e.cancelable && dy > 0 && dy >= Math.abs(dx)) e.preventDefault();
      if (!distance && dy < SLOP) return;
      distance = Math.max(0, Math.min(LIMIT, dy / 2));
      show(distance >= THRESHOLD ? "ready" : distance ? "pull" : "");
    },
    { passive: false },
  );
  async function refresh() {
    refreshing = true;
    distance = 40;
    show("refreshing");
    $("#status").textContent = "Refreshing…";
    const started = Date.now();
    try {
      await loadModels();
    } finally {
      // Fast responses still show the chip long enough to register.
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, 400 - (Date.now() - started))),
      );
      refreshing = false;
      distance = 0;
      show("");
    }
  }
  function release(e) {
    if (!tracking) return;
    tracking = false;
    if (e.type === "touchend" && distance >= THRESHOLD && !busy) return refresh();
    distance = 0;
    show("");
  }
  scroller.addEventListener("touchend", release);
  scroller.addEventListener("touchcancel", release);
})();
