// Service worker: makes the site installable as a phone app and lets it open without signal.
// App files: network first (so every deploy shows up at once), cached copy when offline.
// Libraries from the CDN: cached after the first load. Supabase (data, photos, sign-in) is never cached.
const VERSION = "2026-10-05-3";
const CACHE = "hse-audit-" + VERSION;
const SHELL = [
  "./", "index.html", "manifest.json", "css/app.css",
  "js/config.js", "js/app.js", "js/data.js", "js/ui.js", "js/checklist.js", "js/settings.js", "js/pwa.js", "js/importer.js", "js/report.js", "js/pptx.js",
  "js/views/dashboard.js", "js/views/register.js", "js/views/finding.js", "js/views/audits.js", "js/views/audit.js", "js/views/form.js",
  "js/views/import.js", "js/views/projects.js", "js/views/admins.js", "js/views/settings.js", "js/views/help.js",
  "assets/orascom-logo.png", "assets/favicon.png", "assets/icons/icon-192.png", "assets/icons/icon-512.png", "assets/icons/apple-touch-icon.png",
];
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)\//;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("hse-audit-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("message", e => { if (e.data === "skip-waiting") self.skipWaiting(); });

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (/supabase\.(co|in)$/.test(url.hostname) || url.pathname.includes("/auth/v1/") || url.pathname.includes("/rest/v1/") || url.pathname.includes("/storage/v1/") || url.pathname.includes("/functions/v1/")) return;
  if (CDN.test(req.url)) {
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes("/downloads/")) return; // the Android app file is downloaded fresh, never cached
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      const res = await fetch(req, { cache: "no-cache" });
      if (res.ok) c.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === "navigate") { const shell = await c.match("index.html"); if (shell) return shell; }
      throw err;
    }
  })());
});
