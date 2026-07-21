// Service worker: precache the app shell + bundled content for full offline use.
// Bump VERSION when you change app files or refresh the essay data.
const VERSION = "v3";
const CACHE = "deutsch-kompass-" + VERSION;
const AUDIO_CACHE = "deutsch-kompass-audio";

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/app.js",
  "./js/core.js",
  "./js/dict.js",
  "./js/tts.js",
  "./js/reader.js",
  "./js/vocab.js",
  "./js/practice.js",
  "./js/lernen.js",
  "./data/essays.json",
  "./data/b1_wordlist.json",
  "./data/drills.json",
  "./data/lesen_sets.json",
  "./data/schreiben.json",
  "./data/plan.json",
  "./data/lessons.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k !== AUDIO_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // DW mp3 audio: cache-first, cached on first play (works offline afterwards)
  if (/\.mp3($|\?)/.test(url.pathname)) {
    e.respondWith(
      caches.open(AUDIO_CACHE).then(async (c) => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok || res.type === "opaque") c.put(e.request, res.clone());
        return res;
      })
    );
    return;
  }

  // dictionary APIs: network only (dict.js caches results itself)
  if (url.origin !== location.origin) return;

  // same-origin: stale-while-revalidate
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const hit = await c.match(e.request);
      const refresh = fetch(e.request)
        .then((res) => {
          if (res.ok) c.put(e.request, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || refresh;
    })
  );
});
