/**
 * SERVICE WORKER — Mall Services PWA v3.4
 * آمن 100% — لا يعترض أي مورد خارجي
 */
const LOCAL_CACHE = 'mall-local-v3.4';

const LOCAL_ASSETS = [
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
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

  // 3. تجاهل جميع الموارد الخارجية — لا نعترضها أبداً
  const EXTERNAL_KEYWORDS = [
    'googleapis.com', 'gstatic.com', 'firebaseio.com',
    'apis.google.com', 'accounts.google.com',
    'googleusercontent.com', 'google.com',
    'cdnjs.cloudflare.com', 'tailwindcss.com',
    'fonts.gstatic.com', 'fonts.googleapis.com',
    'unsplash.com', 'ui-avatars.com',
    'paymob.com', 'paypal.com', 'stripe.com',
    'atfawry.com', 'google-analytics.com',
    'googletagmanager.com', 'netlify.com',
    'netlify.app', '/.netlify/', '/api/', 'pages.dev', 'firebaseapp.com'
  ];
  if (EXTERNAL_KEYWORDS.some(kw => req.url.includes(kw))) return;

  // 4. للملفات المحلية فقط: Cache first → Network → Fallback
  event.respondWith(
    caches.match(req)
      .then(cached => {
        if (cached) return cached;

        return fetch(req)
          .then(response => {
            // خزّن فقط الاستجابات الصحيحة من نفس الأصل
            if (response && response.status === 200 && response.type === 'basic') {
              const clone = response.clone();
              caches.open(LOCAL_CACHE).then(c => c.put(req, clone));
            }
            return response;
          })
          .catch(() => {
            // SPA navigate fallback
            if (req.mode === 'navigate') {
              return caches.match('/index.html')
                .then(page => page || new Response('Offline', {
                  status: 503,
                  headers: { 'Content-Type': 'text/plain' }
                }));
            }
            // لأي مورد آخر يفشل: أرجع 503 بدلاً من undefined
            return new Response('Resource unavailable offline', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'text/plain' }
            });
          });
      })
      .catch(() => {
        // fallback أخير لو caches.match نفسها فشلت
        return new Response('Service Worker Error', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' }
        });
      })
  );
});
