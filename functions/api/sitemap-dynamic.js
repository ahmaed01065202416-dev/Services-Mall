// functions/api/sitemap-dynamic.js — Cloudflare Pages Function
// Route: /api/sitemap-dynamic  → served at /sitemap-live.xml (functions/sitemap-live.xml.js re-exports this).
//
// Sitemap layout (no URL appears in more than one file):
//   sitemap.xml       index → sitemap-main.xml + sitemap-live.xml
//   sitemap-main.xml  core pages (static file, real fixed dates)
//   sitemap-live.xml  THIS file → the blog area: /blog, the 10 hand-written articles (fixed real dates)
//                     and the AI articles published in Firestore (their real updatedAt/createdAt),
//                     plus one /s/<storeId> URL per active (not paused) store, one /service/<id> URL per active
//                     listing, and /c/<category> for every category that has at least one active listing.
// lastmod is never "today": a made-up lastmod teaches Google to ignore the field.

const BLOG_INDEX_FALLBACK_DATE = '2025-05-21';   // used only when there is no dated article to derive it from

// Hand-written articles (blog/<slug>/index.html) with their real publication dates.
// Keep in sync with functions/blog/[slug].js (STATIC_SLUGS) if one is added.
const STATIC_ARTICLES = [
  ['افضل-خدمات-رقمية-في-مصر-2025', '2025-05-21'],
  ['كيفية-الربح-من-الانترنت-مصر', '2025-05-15'],
  ['بوابات-الدفع-الالكتروني-مصر', '2025-05-10'],
  ['تحسين-محركات-البحث-للمواقع-العربية', '2025-05-05'],
  ['التجارة-الالكترونية-في-مصر', '2025-04-28'],
  ['freelancing-egypt-2025', '2025-04-21'],
  ['digital-marketing-arabic', '2025-04-14'],
  ['escrow-payment-protection', '2025-04-07'],
  ['web-design-trends-2025', '2025-03-31'],
  ['paymob-instapay-guide', '2025-03-24'],
];

const toDate = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? new Date(t).toISOString().split('T')[0] : ''; };

// Returns { ok, posts }. ok=false means Firestore did not answer properly (timeout / error): the sitemap is still served
// (static articles stay listed) but is NOT edge-cached for an hour, so a short Firestore hiccup can't hide the AI articles
// from Google for the next 60 minutes.
const FIRESTORE_TIMEOUT_MS = 4000;   // Google gives up on a slow sitemap → "Couldn't fetch"; never wait longer than this
async function getFirestorePosts(projectId) {
  // Uses runQuery with a field projection instead of listing the whole collection: the old
  // ".../documents/blog_posts?pageSize=500" downloaded every article WITH its full HTML body (megabytes) on every
  // refresh, which is slow and can time out the Function -> Google then reports "Couldn't fetch". Now only
  // slug + dates of PUBLISHED posts are fetched (also keeps working if the rules are ever restricted to published posts).
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
    const body = { structuredQuery: {
      from: [{ collectionId: 'blog_posts' }],
      where: { fieldFilter: { field: { fieldPath: 'published' }, op: 'EQUAL', value: { booleanValue: true } } },
      select: { fields: [{ fieldPath: 'slug' }, { fieldPath: 'updatedAt' }, { fieldPath: 'createdAt' }] },
      limit: 5000,   // a sitemap file may hold 50,000 URLs; 5000 articles is far beyond what this site will publish
    } };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FIRESTORE_TIMEOUT_MS);
    let res;
    try { res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal }); }
    finally { clearTimeout(timer); }
    if (!res.ok) {
      // Don't silently publish a sitemap without articles: leave a trace in the Cloudflare logs.
      console.error('[sitemap] Firestore blog_posts request failed:', res.status, res.statusText);
      return { ok: false, posts: [] };
    }
    const rows = await res.json();
    const staticSlugs = new Set(STATIC_ARTICLES.map(a => a[0]));
    const seen = new Set();
    const posts = (Array.isArray(rows) ? rows : []).map(r => r && r.document).filter(Boolean).map(doc => {
      const f = doc.fields || {};
      const dateOf = (k) => toDate(f[k] && (f[k].timestampValue || f[k].stringValue));
      return {
        slug: f.slug?.stringValue || '',
        updated: dateOf('updatedAt') || dateOf('createdAt'),   // '' → lastmod omitted (never invented)
      };
    }).filter(d => d.slug && !staticSlugs.has(d.slug) && !seen.has(d.slug) && seen.add(d.slug));   // no duplicates, no hand-written slugs
    return { ok: true, posts };
  } catch (err) {
    console.error('[sitemap] could not load blog posts:', err && err.name === 'AbortError' ? 'timeout' : (err && err.message ? err.message : err));
    return { ok: false, posts: [] };   // the static articles are still listed, so the sitemap stays valid
  }
}

// Active stores → /s/<storeId> (functions/s/[id].js). Own timeout + own try/catch: a store-list failure must never
// take the blog URLs down with it. Only name/status/updatedAt are projected (logos are base64 and huge).
async function getStores(projectId) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
    const body = { structuredQuery: {
      from: [{ collectionId: 'stores' }],
      select: { fields: [{ fieldPath: 'name' }, { fieldPath: 'status' }, { fieldPath: 'updatedAt' }] },
      limit: 5000,
    } };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FIRESTORE_TIMEOUT_MS);
    let res;
    try { res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal }); }
    finally { clearTimeout(timer); }
    if (!res.ok) { console.error('[sitemap] Firestore stores request failed:', res.status, res.statusText); return { ok: false, stores: [] }; }
    const rows = await res.json();
    const stores = (Array.isArray(rows) ? rows : []).map(r => r && r.document).filter(Boolean).map(doc => {
      const f = doc.fields || {};
      const id = String(doc.name || '').split('/').pop();
      const t = f.updatedAt && (f.updatedAt.timestampValue || f.updatedAt.stringValue);
      return { id, name: f.name?.stringValue || '', status: f.status?.stringValue || '', updated: toDate(t) };
    }).filter(s => /^[A-Za-z0-9_\-]{1,128}$/.test(s.id) && s.name.trim() && s.status !== 'paused');
    return { ok: true, stores };
  } catch (err) {
    console.error('[sitemap] could not load stores:', err && err.name === 'AbortError' ? 'timeout' : (err && err.message ? err.message : err));
    return { ok: false, stores: [] };
  }
}

// Active listings → /service/<id> (functions/service/[id].js) and their categories → /c/<category>. Own timeout and own
// try/catch, like getStores. Only title/category/updatedAt are projected (images are base64 and huge).
const SITEMAP_CATEGORIES = new Set(['design','programming','marketing','writing','video','seo','audio','data','clothing','electronics','home','beauty','food','accessories']);
async function getServices(projectId) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
    const body = { structuredQuery: {
      from: [{ collectionId: 'services' }],
      where: { fieldFilter: { field: { fieldPath: 'active' }, op: 'EQUAL', value: { booleanValue: true } } },
      select: { fields: [{ fieldPath: 'title' }, { fieldPath: 'category' }, { fieldPath: 'updatedAt' }] },
      limit: 5000,
    } };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FIRESTORE_TIMEOUT_MS);
    let res;
    try { res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal }); }
    finally { clearTimeout(timer); }
    if (!res.ok) { console.error('[sitemap] Firestore services request failed:', res.status, res.statusText); return { ok: false, services: [], categories: [] }; }
    const rows = await res.json();
    const services = (Array.isArray(rows) ? rows : []).map(r => r && r.document).filter(Boolean).map(doc => {
      const f = doc.fields || {};
      const t = f.updatedAt && (f.updatedAt.timestampValue || f.updatedAt.stringValue);
      return { id: String(doc.name || '').split('/').pop(), title: f.title?.stringValue || '', category: f.category?.stringValue || '', updated: toDate(t) };
    }).filter(s => /^[A-Za-z0-9_\-]{1,128}$/.test(s.id) && s.title.trim());
    const categories = [...new Set(services.map(s => s.category).filter(c => SITEMAP_CATEGORIES.has(c)))];
    return { ok: true, services, categories };
  } catch (err) {
    console.error('[sitemap] could not load services:', err && err.name === 'AbortError' ? 'timeout' : (err && err.message ? err.message : err));
    return { ok: false, services: [], categories: [] };
  }
}

export async function onRequest(context) {
  const { env, request } = context;
  // Public endpoint that costs a Firestore query per hit: serve from the edge cache for an hour when the runtime
  // supports it (no-op / skipped otherwise, e.g. on *.pages.dev or in tests).
  let cache = null, cacheKey = null;
  try {
    cache = (typeof caches !== 'undefined' && caches.default) ? caches.default : null;
    cacheKey = cache && request ? new Request(new URL(request.url).origin + '/sitemap-live.xml') : null;
    const hit = cache && cacheKey ? await cache.match(cacheKey) : null;
    if (hit) return hit;
  } catch (_) { cache = null; }
  // Real production domain as the fallback; trailing slashes removed so we never emit "//blog".
  const site = String(env.SITE_URL || 'https://mall-services.pages.dev').trim().replace(/\/+$/, '');
  const projectId = env.FIREBASE_PROJECT_ID || 'services-mall';
  const [{ ok: postsOk0, posts }, { ok: storesOk, stores }, { ok: svcOk, services, categories }] = await Promise.all([getFirestorePosts(projectId), getStores(projectId), getServices(projectId)]);
  const postsOk = postsOk0 && storesOk && svcOk;   // a partial sitemap is never kept in the edge cache

  const entry = (path, lastmod, freq, pri) => `\n  <url><loc>${site}${path}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>${freq}</changefreq><priority>${pri}</priority></url>`;
  // /blog changes whenever an article is published → newest article date (or the fixed fallback).
  const newest = [...STATIC_ARTICLES.map(a => a[1]), ...posts.map(p => p.updated)].filter(Boolean).sort().pop() || BLOG_INDEX_FALLBACK_DATE;

  const urls = [
    entry('/blog/', newest, 'weekly', '0.9'),   // trailing slash = the URL Pages serves for the blog index (matches its canonical)
    // hand-written articles are folders → Pages serves them at /blog/<slug>/ (matches their canonical)
    ...STATIC_ARTICLES.map(([slug, date]) => entry(`/blog/${encodeURIComponent(slug)}/`, date, 'monthly', '0.7')),
    ...posts.map(p => entry(`/blog/${encodeURIComponent(p.slug)}`, p.updated, 'monthly', '0.8')),
    ...stores.map(s => entry(`/s/${encodeURIComponent(s.id)}`, s.updated, 'weekly', '0.6')),
    ...categories.map(c => entry(`/c/${c}`, null, 'weekly', '0.7')),
    ...services.map(s => entry(`/service/${encodeURIComponent(s.id)}`, s.updated, 'weekly', '0.7')),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}\n</urlset>`;

  const response = new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'application/xml;charset=UTF-8', 'Cache-Control': postsOk ? 'public,max-age=3600' : 'public,max-age=300' },
  });
  // only a COMPLETE sitemap is kept in the edge cache
  try { if (postsOk && cache && cacheKey && context.waitUntil) context.waitUntil(cache.put(cacheKey, response.clone())); } catch (_) { /* caching is best-effort */ }
  return response;
}
