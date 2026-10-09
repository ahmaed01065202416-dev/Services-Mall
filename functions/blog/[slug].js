/**
 * functions/blog/[slug].js — Cloudflare Pages Function, route: /blog/:slug
 * ============================================================================
 * Why this exists
 *   /blog/:slug used to be a blanket rewrite to the static blog/index.html, so
 *   (a) EVERY slug answered 200 (soft 404 for Google) and
 *   (b) canonical / og / JSON-LD always pointed at /blog, never at the article.
 *
 * What it does
 *   • the 10 hand-written static articles and real files (…/x.css, index.html)
 *     are passed straight through to the static assets (context.next()).
 *   • any other slug is looked up in Firestore (blog_posts, published == true):
 *       found      → blog/index.html with title, description, canonical, og:*,
 *                    twitter and an Article JSON-LD injected server-side.
 *                    (The page still renders the article client-side as before.)
 *       not found  → a REAL 404 (site's 404.html, noindex).
 *       Firestore error → 503 + Retry-After (NOT a 404: a temporary outage must
 *                    never make Google drop good articles).
 *
 * blog_posts is publicly readable (firestore.rules: allow read: if true), so the
 * plain REST API is enough — no credentials involved.
 * ============================================================================
 */

const DEFAULT_SITE = 'https://mall-services.pages.dev';
const BRAND = 'مول الخدمات';

// Static, hand-written articles (folders blog/<slug>/index.html). Keep in sync if one is added.
const STATIC_SLUGS = new Set([
  'افضل-خدمات-رقمية-في-مصر-2025',
  'بوابات-الدفع-الالكتروني-مصر',
  'كيفية-الربح-من-الانترنت-مصر',
  'تحسين-محركات-البحث-للمواقع-العربية',
  'التجارة-الالكترونية-في-مصر',
  'freelancing-egypt-2025',
  'digital-marketing-arabic',
  'escrow-payment-protection',
  'web-design-trends-2025',
  'paymob-instapay-guide',
]);

const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const isHttps = (u) => { try { return new URL(String(u)).protocol === 'https:'; } catch (_) { return false; } };
const plain = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const toIso = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? new Date(t).toISOString() : ''; };

function decodeSlug(raw) {
  const s = Array.isArray(raw) ? raw.join('/') : String(raw || '');
  try { return decodeURIComponent(s); } catch (_) { return s; }
}

// Firestore REST → first published post with this slug.  Returns { post } | { notFound } | { error }.
export async function findPost(env, slug, fetchImpl = fetch) {
  const projectId = env.FIREBASE_PROJECT_ID || 'services-mall';
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'blog_posts' }],
      where: { compositeFilter: { op: 'AND', filters: [
        { fieldFilter: { field: { fieldPath: 'slug' },      op: 'EQUAL', value: { stringValue: slug } } },
        { fieldFilter: { field: { fieldPath: 'published' }, op: 'EQUAL', value: { booleanValue: true } } },
      ] } },
      limit: 1,
    },
  };
  let res;
  try {
    res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch (err) {
    console.error('[blog] Firestore request threw:', err && err.message ? err.message : err);
    return { error: true };
  }
  if (!res.ok) { console.error('[blog] Firestore runQuery failed:', res.status, res.statusText); return { error: true }; }
  let rows;
  try { rows = await res.json(); } catch (err) { console.error('[blog] bad Firestore JSON:', err.message); return { error: true }; }
  const doc = Array.isArray(rows) ? rows.map(r => r && r.document).find(Boolean) : null;
  if (!doc) return { notFound: true };
  const f = doc.fields || {};
  const str = (k) => (f[k] && (f[k].stringValue != null ? f[k].stringValue : (f[k].timestampValue || ''))) || '';
  return { post: {
    slug: str('slug'), title: str('title'), excerpt: str('excerpt'), metaDescription: str('metaDescription'),
    content: str('content'), image: str('image'), category: str('category'),
    createdAt: str('createdAt'), updatedAt: str('updatedAt'),
  } };
}

// Replace the SEO tags of blog/index.html with the article's. Pure string work → easy to test.
export function injectSeo(html, post, site) {
  const url = `${site}/blog/${encodeURIComponent(post.slug)}`;
  const title = `${post.title} | ${BRAND}`;
  const desc = (post.metaDescription || post.excerpt || plain(post.content).slice(0, 155) || post.title).slice(0, 160);
  const image = isHttps(post.image) ? post.image : `${site}/icons/icon-512.png`;
  const published = toIso(post.createdAt), modified = toIso(post.updatedAt) || published;

  const ld = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: post.title.slice(0, 110), description: desc, image: [image], inLanguage: 'ar',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    author: { '@type': 'Organization', name: BRAND, url: site },
    publisher: { '@type': 'Organization', name: BRAND, logo: { '@type': 'ImageObject', url: `${site}/icons/icon-512.png` } },
    ...(published ? { datePublished: published } : {}), ...(modified ? { dateModified: modified } : {}),
    ...(post.category ? { articleSection: post.category } : {}),
  };
  // "</" inside JSON-LD would close the script tag early.
  const ldJson = JSON.stringify(ld).replace(/<\//g, '<\\/');

  let out = html;
  out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`);
  out = out.replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${esc(desc)}">`);
  out = out.replace(/<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${esc(url)}">`);
  out = out.replace(/<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${esc(post.title)}">`);
  out = out.replace(/<meta\s+property="og:description"[^>]*>/i, `<meta property="og:description" content="${esc(desc)}">`);
  out = out.replace(/<meta\s+property="og:type"[^>]*>/i, `<meta property="og:type" content="article">`);
  out = out.replace(/<meta\s+property="og:image"[^>]*>/i, `<meta property="og:image" content="${esc(image)}">`);
  out = out.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/i, `<script type="application/ld+json">${ldJson}</script>`);
  // Tags the static page doesn't have: og:url, twitter card, article times.
  const extra = [
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(post.title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="twitter:image" content="${esc(image)}">`,
    published ? `<meta property="article:published_time" content="${esc(published)}">` : '',
    modified ? `<meta property="article:modified_time" content="${esc(modified)}">` : '',
  ].filter(Boolean).join('\n');
  out = out.replace(/<\/head>/i, `${extra}\n</head>`);
  return out;
}

// Static asset helper: follows the (Pages "pretty URL") redirects that ASSETS may answer with.
async function readAsset(env, origin, path) {
  let url = new URL(path, origin).toString();
  for (let i = 0; i < 3; i++) {
    const res = await env.ASSETS.fetch(new Request(url, { redirect: 'manual' }));
    if (res.status >= 300 && res.status < 400 && res.headers.get('Location')) { url = new URL(res.headers.get('Location'), url).toString(); continue; }
    return res;
  }
  return null;
}

const FALLBACK_404 = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="robots" content="noindex"><title>الصفحة غير موجودة — ${BRAND}</title></head><body style="font-family:sans-serif;text-align:center;padding:80px 20px"><h1>404</h1><p>المقال غير موجود.</p><p><a href="/blog">العودة للمدونة</a></p></body></html>`;

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const slug = decodeSlug(params.slug);

  // Static articles and real files (blog/x.css, blog/index.html …) → the static assets.
  if (STATIC_SLUGS.has(slug) || /\.[a-z0-9]{2,5}$/i.test(slug)) return context.next();
  if (!slug || slug.length > 200 || /[\/\\]/.test(slug)) return notFound(env, request);

  const found = await findPost(env, slug);

  if (found.error) {
    return new Response('<!DOCTYPE html><meta charset="utf-8"><title>خدمة مؤقتًا غير متاحة</title><p style="font-family:sans-serif;text-align:center;padding:60px">المدونة غير متاحة مؤقتًا، حاول بعد قليل.</p>', {
      status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '120', 'Cache-Control': 'no-store' },
    });
  }
  if (found.notFound) return notFound(env, request);

  const origin = new URL(request.url).origin;
  const tpl = await readAsset(env, origin, '/blog/');
  if (!tpl || !tpl.ok) { console.error('[blog] could not read blog/index.html template:', tpl && tpl.status); return context.next(); }
  const site = String(env.SITE_URL || DEFAULT_SITE).trim().replace(/\/+$/, '');
  const html = injectSeo(await tpl.text(), found.post, site);
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=600' },
  });
}

async function notFound(env, request) {
  let body = FALLBACK_404;
  try {
    const res = await readAsset(env, new URL(request.url).origin, '/404.html');
    if (res && res.ok) body = await res.text();
  } catch (_) { /* fallback page */ }
  return new Response(body, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Robots-Tag': 'noindex' },
  });
}

export const onRequestHead = onRequestGet;
