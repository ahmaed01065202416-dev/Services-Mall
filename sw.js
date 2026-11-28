/**
 * SERVICE WORKER — Mall Services PWA v3.36
 * آمن: لا يعترض أي مورد خارجي ولا مسارات /api/.
 *
 * History (kept so nobody re-introduces these bugs):
 *  - v3.6: compare against self.location.origin (a 'pages.dev' substring match disabled caching on our own domain);
 *          navigations + static files are NETWORK-first so a redeploy reaches returning visitors at once.
 *
 * v3.36 — "no connection problems" hardening:
 *  1. Install no longer depends on cache.addAll (all-or-nothing: ONE missing file left the cache empty and offline
 *     support silently dead). Each file is cached on its own; failures are logged and skipped.
 *  2. Network timeout (lie-fi): a slow/hanging connection no longer freezes the page forever — after a few seconds we
 *     serve the cached copy (if any). With nothing cached we keep waiting for the network instead of failing.
 *  3. Friendly /offline.html for pages that are not cached (instead of a bare "Offline" text); the app shell
 *     (/ or /index.html) still opens offline from cache.
 *  4. Redirected responses are never served for navigations (Safari rejects them: "response has redirections"); the
 *     precached /index.html is stored "cleaned".
 *  5. Navigation Preload: the network request starts in parallel with SW start-up (faster first paint).
 *  6. Runtime cache is capped (it used to grow without limit); Range requests (audio/video) are not touched.
 *  7. A 5xx from the origin falls back to the cached copy when we have one (stale-if-error).
 */
const LOCAL_CACHE = 'mall-local-v3.36-offline'; // bump on every release: old caches are deleted on activate

const LOCAL_ASSETS = [
  '/index.html',
  '/offline.html',
  '/css/offline.css',
  '/js/offline.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/logo-mark-128.webp',
  '/icons/icon.svg',
  '/css/bundle-base.css?v=07065f75',
  '/css/bundle-mall.css?v=a3386840',
  '/css/tailwind.css',
  '/css/mall-theme.css',
  '/css/mall-home.css',
  '/css/mall-extra.css',
  '/css/mall-home-b.css',
  '/css/mall-home-sections.css',
  '/css/mall-design-mint.css',
  '/js/mall-home.js',
  '/js/mall-home-b.js',
  '/js/design.js',
  '/js/mall-charts.js',
  '/js/store-extras.js',
  '/js/theme.js',
  '/js/csp-shim.js',
  '/css/csp.css',
];

const NAV_TIMEOUT_MS = 5000;     // page request: after this we prefer a cached copy
const ASSET_TIMEOUT_MS = 6000;   // JS/CSS/images
const RUNTIME_MAX = 150;         // files cached at runtime on top of LOCAL_ASSETS

/** A response that was produced by following a redirect cannot be used to answer a navigation (Safari). */
async function clean(res) {
  if (!res || !res.redirected) return res;
  const body = await res.blob();
  return new Response(body, { status: 200, statusText: 'OK', headers: res.headers });
}

async function precache(cache, url) {
  try {
    const res = await fetch(new Request(url, { cache: 'reload' }));
    if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
    await cache.put(url, await clean(res));
  } catch (err) {
    console.warn('[SW] precache skipped:', url, err && err.message);
  }
}

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(LOCAL_CACHE).then(cache => Promise.all(LOCAL_ASSETS.map(u => precache(cache, u))))
  );
  self.skipWaiting();
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== LOCAL_CACHE).map(k => caches.delete(k)));
    try { if (self.registration && self.registration.navigationPreload) await self.registration.navigationPreload.enable(); } catch (_) {}
    await self.clients.claim();
  })());
});

/** Network first, but never wait forever: after `ms` prefer the cache; with no cache keep waiting for the network. */
async function networkFirst(netPromise, ms, getCached) {
  netPromise.catch(() => {});                                   // we handle the failure below
  const timeout = new Promise(resolve => setTimeout(() => resolve(null), ms));
  let res;
  try { res = await Promise.race([netPromise, timeout]); }
  catch (_) { return { res: null, cached: await getCached(), failed: true }; }
  if (res === null) {                                           // slow network
    const cached = await getCached();
    if (cached) return { res: null, cached, failed: false };
    try { return { res: await netPromise, cached: null, failed: false }; }
    catch (_) { return { res: null, cached: null, failed: true }; }
  }
  if (res.status >= 500) {                                      // stale-if-error
    const cached = await getCached();
    if (cached) return { res: null, cached, failed: false };
  }
  return { res, cached: null, failed: false };
}

async function trimRuntime(cache) {
  const keys = await cache.keys();
  const pre = new Set(LOCAL_ASSETS.map(u => new URL(u, self.location.origin).href));
  const runtime = keys.filter(k => !pre.has(k.url));
  for (const k of runtime.slice(0, Math.max(0, runtime.length - RUNTIME_MAX))) await cache.delete(k);
}

async function handleNavigation(event) {
  const req = event.request;
  const url = new URL(req.url);
  const cache = await caches.open(LOCAL_CACHE);
  const net = (async () => {
    const pre = event.preloadResponse ? await event.preloadResponse : undefined;
    return pre || fetch(req);
  })();
  const getCached = async () => (await clean(await cache.match(req))) || null;

  const r = await networkFirst(net, NAV_TIMEOUT_MS, getCached);
  if (r.res) {
    if (r.res.status === 200 && !r.res.redirected && r.res.type === 'basic') {
      const copy = r.res.clone();
      event.waitUntil(cache.put(req, copy).then(() => trimRuntime(cache)).catch(() => {}));
    }
    return r.res;
  }
  if (r.cached) return r.cached;
  // offline and this exact page was never cached
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const shell = await clean(await cache.match('/index.html'));
    if (shell) return shell;                                    // the app shell opens offline
  }
  const off = await clean(await cache.match('/offline.html'));
  return off || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

async function handleAsset(event) {
  const req = event.request;
  const cache = await caches.open(LOCAL_CACHE);
  const getCached = async () => (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true })) || null;
  const r = await networkFirst(fetch(req), ASSET_TIMEOUT_MS, getCached);
  if (r.res) {
    if (r.res.status === 200 && r.res.type === 'basic') {
      event.waitUntil(cache.put(req, r.res.clone()).then(() => trimRuntime(cache)).catch(() => {}));
    }
    return r.res;
  }
  return r.cached || new Response('Resource unavailable offline', {
    status: 503, statusText: 'Service Unavailable', headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

// ── Fetch ──────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;                              // never touch POST/PUT/…
  if (!req.url.startsWith('http')) return;
  if (req.headers && req.headers.has && req.headers.has('range')) return;   // audio/video partial content

  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;               // Firebase, Google, Cloudinary… untouched
  if (url.pathname.startsWith('/api/')) return;                  // server functions are never cached

  if (req.mode === 'navigate') { event.respondWith(handleNavigation(event)); return; }
  event.respondWith(handleAsset(event));
});
