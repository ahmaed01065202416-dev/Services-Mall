/**
 * SERVICE WORKER — Mall Services PWA v3.6
 * آمن 100% — لا يعترض أي مورد خارجي
 *
 * ⚠️ FIXED (v3.6): two real bugs found during a full project review:
 *
 * 1. EXTERNAL_KEYWORDS used to include the literal string 'pages.dev' to
 *    skip caching third-party pages.dev-hosted resources — but this site
 *    itself is hosted at mall-services.pages.dev, so EVERY request to the
 *    site's own origin also contains "pages.dev" and matched the same
 *    exclusion. Net effect: the service worker never actually cached or
 *    intercepted anything on this domain — offline support and the local
 *    cache were silently 100% non-functional. Now compares against
 *    `self.location.origin` instead of a fragile substring list, so only
 *    genuinely external requests are skipped.
 *
 * 2. The old strategy was cache-first for EVERYTHING, including index.html
 *    — meaning once caching actually worked (see #1), a returning visitor
 *    could keep seeing an old cached version of the whole site after every
 *    future deploy unless the cache-version string below was manually
 *    bumped each time. Given how often this project gets redeployed, that's
 *    a real footgun. Navigation requests (the page itself) are now
 *    network-first — always tries the live site first, and only falls back
 *    to the cached copy if the network request fails (offline). Static
 *    assets (JS/CSS/images) stay cache-first for speed, since a stale JS
 *    file for a few minutes matters much less than a stale whole page.
 */
const LOCAL_CACHE = 'mall-local-v3.6';

const LOCAL_ASSETS = [
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon.svg',
  '/css/tailwind.css',
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(LOCAL_CACHE)
      .then(cache => cache.addAll(LOCAL_ASSETS))
      .catch(err => console.warn('[SW] Install cache error:', err))
  );
  self.skipWaiting();
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== LOCAL_CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ──────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 1. تجاهل كل طلبات غير GET تماماً
  if (req.method !== 'GET') return;

  // 2. تجاهل أي بروتوكول غير http/https
  if (!req.url.startsWith('http')) return;

  // 3. تجاهل أي طلب مش لنفس الأصل (نفس الدومين) — أي API خارجي، Firebase،
  //    Google، إلخ. مقارنة بأصل الموقع نفسه مش بقايمة كلمات هشة.
  let sameOrigin = false;
  try { sameOrigin = new URL(req.url).origin === self.location.origin; } catch (_) {}
  if (!sameOrigin) return;

  // 4. لا نعترض أبداً مسارات الـ API الخاصة بالسيرفر (functions/api/*)
  if (new URL(req.url).pathname.startsWith('/api/')) return;

  // 5. طلبات التنقل (فتح الصفحة نفسها) → Network-first، مع رجوع للنسخة
  //    المخزنة لو مفيش إنترنت — عشان أي تحديث جديد يوصل فورًا للزوار
  //    العائدين، من غير ما نحتاج نرفع رقم إصدار الكاش يدويًا كل ديبلوي.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(LOCAL_CACHE).then(c => c.put(req, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(req).then(cached => cached || caches.match('/index.html'))
            .then(page => page || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }))
        )
    );
    return;
  }

  // 6. باقي الملفات المحلية (JS/CSS/صور): Cache-first → Network → Fallback
  event.respondWith(
    caches.match(req)
      .then(cached => {
        if (cached) return cached;

        return fetch(req)
          .then(response => {
            if (response && response.status === 200 && response.type === 'basic') {
              const clone = response.clone();
              caches.open(LOCAL_CACHE).then(c => c.put(req, clone));
            }
            return response;
          })
          .catch(() => new Response('Resource unavailable offline', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' },
          }));
      })
      .catch(() => new Response('Service Worker Error', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain' },
      }))
  );
});
