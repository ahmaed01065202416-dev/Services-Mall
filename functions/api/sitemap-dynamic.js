// functions/api/sitemap-dynamic.js — Cloudflare Pages Function
// Route: /api/sitemap-dynamic  → also exposed at /sitemap-live.xml via _redirects

const STATIC = [
  { loc:'/', pri:'1.0', freq:'daily'   },
  { loc:'/blog', pri:'0.9', freq:'daily'   },
  { loc:'/about', pri:'0.6', freq:'monthly' },
  { loc:'/contact', pri:'0.6', freq:'monthly' },
  { loc:'/privacy', pri:'0.4', freq:'yearly'  },
  { loc:'/terms',   pri:'0.4', freq:'yearly'  },
];

async function getFirestorePosts(projectId) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/blog_posts?pageSize=500`;
    const res = await fetch(url);
    const json = await res.json();
    return (json.documents || []).map(doc => {
      const f = doc.fields || {};
      return {
        slug: f.slug?.stringValue || '',
        updated: f.updatedAt?.stringValue || new Date().toISOString(),
        pub: f.published?.booleanValue,
      };
    }).filter(d => d.slug && d.pub !== false);
  } catch (_) { return []; }
}

export async function onRequest(context) {
  const { env } = context;
  const site = env.SITE_URL || 'https://your-site.pages.dev';
  const projectId = env.FIREBASE_PROJECT_ID || 'services-mall';
  const posts = await getFirestorePosts(projectId);
  const today = new Date().toISOString().split('T')[0];

  const urls = [
    ...STATIC.map(s => `\n  <url><loc>${site}${s.loc}</loc><lastmod>${today}</lastmod><changefreq>${s.freq}</changefreq><priority>${s.pri}</priority></url>`),
    ...posts.map(p => `\n  <url><loc>${site}/blog/${p.slug}</loc><lastmod>${p.updated.split('T')[0]}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}\n</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'application/xml;charset=UTF-8', 'Cache-Control': 'public,max-age=3600' },
  });
}
