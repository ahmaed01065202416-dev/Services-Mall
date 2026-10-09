// functions/api/sitemap-dynamic.js — Cloudflare Pages Function
// Route: /api/sitemap-dynamic  → served at /sitemap-live.xml (functions/sitemap-live.xml.js re-exports this).
//
// Sitemap layout (no URL appears in more than one file):
//   sitemap.xml       index → sitemap-main.xml + sitemap-live.xml
//   sitemap-main.xml  core pages (static file, real fixed dates)
//   sitemap-live.xml  THIS file → the blog area: /blog, the 10 hand-written articles (fixed real dates)
//                     and the AI articles published in Firestore (their real updatedAt/createdAt).
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

async function getFirestorePosts(projectId) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/blog_posts?pageSize=500`;
    const res = await fetch(url);
    if (!res.ok) {
      // Don't silently publish a sitemap without articles: leave a trace in the Cloudflare logs.
      console.error('[sitemap] Firestore blog_posts request failed:', res.status, res.statusText);
      return [];
    }
    const json = await res.json();
    const staticSlugs = new Set(STATIC_ARTICLES.map(a => a[0]));
    return (json.documents || []).map(doc => {
      const f = doc.fields || {};
      const dateOf = (k) => toDate(f[k] && (f[k].timestampValue || f[k].stringValue));
      return {
        slug: f.slug?.stringValue || '',
        updated: dateOf('updatedAt') || dateOf('createdAt'),   // '' → lastmod omitted (never invented)
        pub: f.published?.booleanValue,
      };
    }).filter(d => d.slug && d.pub === true && !staticSlugs.has(d.slug));   // drafts/unreviewed AI posts stay out
  } catch (err) {
    console.error('[sitemap] could not load blog posts:', err && err.message ? err.message : err);
    return [];   // the static articles are still listed, so the sitemap stays valid
  }
}

export async function onRequest(context) {
  const { env } = context;
  // Real production domain as the fallback; trailing slashes removed so we never emit "//blog".
  const site = String(env.SITE_URL || 'https://mall-services.pages.dev').trim().replace(/\/+$/, '');
  const projectId = env.FIREBASE_PROJECT_ID || 'services-mall';
  const posts = await getFirestorePosts(projectId);

  const entry = (path, lastmod, freq, pri) => `\n  <url><loc>${site}${path}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>${freq}</changefreq><priority>${pri}</priority></url>`;
  // /blog changes whenever an article is published → newest article date (or the fixed fallback).
  const newest = [...STATIC_ARTICLES.map(a => a[1]), ...posts.map(p => p.updated)].filter(Boolean).sort().pop() || BLOG_INDEX_FALLBACK_DATE;

  const urls = [
    entry('/blog', newest, 'weekly', '0.9'),
    ...STATIC_ARTICLES.map(([slug, date]) => entry(`/blog/${encodeURIComponent(slug)}`, date, 'monthly', '0.7')),
    ...posts.map(p => entry(`/blog/${encodeURIComponent(p.slug)}`, p.updated, 'monthly', '0.8')),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}\n</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'application/xml;charset=UTF-8', 'Cache-Control': 'public,max-age=3600' },
  });
}
