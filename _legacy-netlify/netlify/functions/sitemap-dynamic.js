// netlify/functions/sitemap-dynamic.js — called via /_sitemap redirect
const https = require('https');

const SITE = 'https://services-mall2.netlify.app';
const STATIC = [
  { loc:'/', pri:'1.0', freq:'daily'   },
  { loc:'/blog', pri:'0.9', freq:'daily'   },
  { loc:'/about', pri:'0.6', freq:'monthly' },
  { loc:'/contact', pri:'0.6', freq:'monthly' },
  { loc:'/privacy', pri:'0.4', freq:'yearly'  },
  { loc:'/terms',   pri:'0.4', freq:'yearly'  },
];

function getFirestorePosts(projectId) {
  return new Promise((resolve) => {
    const path = `/v1/projects/${projectId}/databases/(default)/documents/blog_posts?pageSize=500`;
    https.get({ hostname:'firestore.googleapis.com', path }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(d);
          const docs = (json.documents || []).map(doc => {
            const f = doc.fields || {};
            return {
              slug:    f.slug?.stringValue || '',
              updated: f.updatedAt?.stringValue || new Date().toISOString(),
              pub:     f.published?.booleanValue,
            };
          }).filter(d => d.slug && d.pub !== false);
          resolve(docs);
        } catch { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });
}

exports.handler = async () => {
  const projectId = process.env.FIREBASE_PROJECT_ID || 'services-mall';
  const posts     = await getFirestorePosts(projectId);
  const today     = new Date().toISOString().split('T')[0];

  const urls = [
    ...STATIC.map(s => `\n  <url><loc>${SITE}${s.loc}</loc><lastmod>${today}</lastmod><changefreq>${s.freq}</changefreq><priority>${s.pri}</priority></url>`),
    ...posts.map(p => `\n  <url><loc>${SITE}/blog/${p.slug}</loc><lastmod>${p.updated.split('T')[0]}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}\n</urlset>`;

  return {
    statusCode: 200,
    headers: { 'Content-Type':'application/xml;charset=UTF-8', 'Cache-Control':'public,max-age=3600' },
    body: xml,
  };
};
