// netlify/functions/ai-daily-cron.js
// Runs daily at 07:00 UTC (09:00 Cairo) — generates 2 SEO articles automatically

exports.handler = async () => {
  console.log('[CRON] Daily AI job started:', new Date().toISOString());
  try {
    const baseUrl = process.env.URL || 'https://services-mall2.netlify.app';
    const https   = require('https');

    // Call ai-generate with bulk action
    const result = await new Promise((resolve, reject) => {
      const body = JSON.stringify({ action:'bulk', count:2 });
      const url  = new URL('/.netlify/functions/ai-generate', baseUrl);
      const req  = https.request({
        hostname: url.hostname,
        path:     url.pathname,
        method:   'POST',
        headers:  { 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(body) },
      }, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    console.log('[CRON] Generated:', result.count, 'articles');

    // Ping Google sitemap
    const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(baseUrl+'/sitemap.xml')}`;
    https.get(pingUrl, () => {}).on('error', () => {});

    return { statusCode:200, body: JSON.stringify({ ok:true, generated: result.count }) };
  } catch(err) {
    console.error('[CRON] Failed:', err.message);
    return { statusCode:500, body: JSON.stringify({ error: err.message }) };
  }
};
