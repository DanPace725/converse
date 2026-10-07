const CACHE = "converse-shell-v44";
const SHELL = [
  '/reasoning.js',
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/pull-refresh.js",
  "/image-upload.js",
  "/export-name.js",
  "/conclave.js",
  "/effort.js",
  "/docs.js",
  "/keys.js",
  "/app-guide.md",
  "/workspace-editor.js",
  "/memory-graph.js",
  "/ui.js",
  "/panel-resize.js",
  "/context-garden.js",
  "/vendor/marked.js",
  "/vendor/purify.js",
  "/math.js",
  "/vendor/katex/katex.min.js",
  "/vendor/katex/katex.min.css",
  ...['AMS-Regular', 'Caligraphic-Bold', 'Caligraphic-Regular', 'Fraktur-Bold', 'Fraktur-Regular',
    'Main-Bold', 'Main-BoldItalic', 'Main-Italic', 'Main-Regular', 'Math-BoldItalic', 'Math-Italic',
    'SansSerif-Bold', 'SansSerif-Italic', 'SansSerif-Regular', 'Script-Regular', 'Size1-Regular',
    'Size2-Regular', 'Size3-Regular', 'Size4-Regular', 'Typewriter-Regular']
    .map(font => '/vendor/katex/fonts/KaTeX_' + font + '.woff2'),
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];
self.addEventListener("install", (e) =>
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))),
);
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      ),
  ),
);
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (
    e.request.method !== "GET" ||
    u.origin !== self.location.origin ||
    u.pathname.startsWith("/api/")
  )
    return;
  if (!SHELL.includes(u.pathname)) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() => caches.match(e.request)),
  );
});
