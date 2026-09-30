// functions/api/sitemap-dynamic.js — Cloudflare Pages Function
// Route: /api/sitemap-dynamic  → also exposed at /sitemap-live.xml via
// functions/sitemap-live.xml.js
import { fsQuery } from '../_shared/gcp.js';

const STATIC = [
  { loc:'/', pri:'1.0', freq:'daily'   },
  { loc:'/blog', pri:'0.9', freq:'daily'   },
  { loc:'/about', pri:'0.6', freq:'monthly' },
  { loc:'/contact', pri:'0.6', freq:'monthly' },
  { loc:'/privacy', pri:'0.4', freq:'yearly'  },
  { loc:'/terms',   pri:'0.4', freq:'yearly'  },
];

// ⚠️ FIXED (was silently broken): this used to call the Firestore REST
// `documents/blog_posts` endpoint with NO Authorization header. That endpoint
// always answers 401/403 for an unauthenticated caller, and the `catch` +
// `|| []` swallowed the failure — so the function returned 200 with the 6 static
// URLs and ZERO blog posts, i.e. the exact opposite of its purpose. That file
// is the one robots.txt advertises as reflecting AI-generated articles.
// It now uses the same service-account query helper every other function uses.
// The `orderBy __name__` is explicit so the pageSize=500 cut is deterministic
// rather than an arbitrary subset once the collection grows past 500.
async function getFirestorePosts(env) {
  try {
    const rows = await fsQuery(env, {
      from: [{ collectionId: 'blog_posts' }],
      where: { fieldFilter: { field: { fieldPath: 'published' }, op: 'EQUAL', value: { booleanValue: true } } },
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
      limit: 500,
    });
    return rows
      .map(d => ({ slug: d.slug || '', updated: d.updatedAt || d.publishedAt || null }))
      .filter(d => d.slug);
  } catch (e) {
    console.error('[sitemap] blog_posts query failed:', e && e.message);
    return [];
  }
}

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export async function onRequest(context) {
  const { env, request } = context;

  // ⚠️ FIXED: this fell back to the literal placeholder 'https://your-site.pages.dev'
  // whenever SITE_URL was unset, which publishes a sitemap full of dead URLs to
  // search engines. SITE_URL is still preferred, but fall back to the origin the
  // request actually arrived on rather than to a placeholder.
  const site = (env.SITE_URL || '').replace(/\/+$/, '') || new URL(request.url).origin;

  const posts = await getFirestorePosts(env);
  const today = new Date().toISOString().split('T')[0];

  const urls = [
    ...STATIC.map(s => `\n  <url><loc>${_esc(site + s.loc)}</loc><lastmod>${today}</lastmod><changefreq>${s.freq}</changefreq><priority>${s.pri}</priority></url>`),
    ...posts.map(p => {
      const d = p.updated ? String(p.updated).split('T')[0] : today;
      // Slug is emitted raw, not encodeURIComponent'd, so it matches the real
      // on-disk directory name and the rel="canonical" in each article page
      // (percent-encoding here would diverge from both).
      return `\n  <url><loc>${_esc(`${site}/blog/${p.slug}`)}</loc><lastmod>${d}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`;
    }),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}\n</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'application/xml;charset=UTF-8', 'Cache-Control': 'public,max-age=3600' },
  });
}
