// cron-worker/index.js — Cloudflare Worker with Cron Trigger
// Replaces Netlify's scheduled function (netlify/functions/ai-daily-cron.js)
// Runs daily (see cron schedule in wrangler.toml), calls the Pages site's
// /api/ai-generate endpoint to bulk-generate articles, then pings Google.
//
// Deploy separately from the Pages project:
//   cd cron-worker && npx wrangler deploy
// Set SITE_URL as a variable (below) or via `wrangler secret put SITE_URL`

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailyJob(env));
  },
  // Optional: allow manual trigger via HTTP for testing
  async fetch(request, env) {
    const result = await runDailyJob(env);
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  },
};

async function runDailyJob(env) {
  console.log('[CRON] Daily AI job started:', new Date().toISOString());
  const baseUrl = env.SITE_URL || 'https://your-site.pages.dev';

  try {
    const res = await fetch(`${baseUrl}/api/ai-generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.ADMIN_SECRET ? { 'X-Admin-Token': env.ADMIN_SECRET } : {}),
      },
      body: JSON.stringify({ action: 'bulk', count: 2 }),
    });
    const result = await res.json();
    console.log('[CRON] Generated:', result.count, 'articles');

    // Ping Google sitemap
    const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(baseUrl + '/sitemap.xml')}`;
    fetch(pingUrl).catch(() => {});

    return { ok: true, generated: result.count };
  } catch (err) {
    console.error('[CRON] Failed:', err.message);
    return { error: err.message };
  }
}
