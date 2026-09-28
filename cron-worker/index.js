// cron-worker/index.js — Cloudflare Worker with Cron Trigger
// Runs daily (see cron schedule in wrangler.toml): calls the Pages site's
// /api/ai-generate to bulk-generate blog drafts, /api/quality-score to
// recompute seller rankings, /api/subscription to bill due subscriptions,
// then pings Google's sitemap endpoint.
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
  console.log('[CRON] Daily job started:', new Date().toISOString());
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

    // Recompute every seller's Quality Score (rating + completion rate +
    // activity — see functions/api/quality-score.js for the formula).
    let qualityResult = null;
    try {
      const qRes = await fetch(`${baseUrl}/api/quality-score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(env.ADMIN_SECRET ? { 'X-Admin-Token': env.ADMIN_SECRET } : {}),
        },
        body: JSON.stringify({}),
      });
      qualityResult = await qRes.json();
      console.log('[CRON] Quality scores recomputed for:', qualityResult.sellersProcessed, 'sellers');
    } catch (qErr) {
      console.error('[CRON] Quality score job failed:', qErr.message);
    }

    // Charge any due recurring subscriptions (checks nextBillingDate itself,
    // so calling this daily is safe — nothing bills more than once/month).
    let subsResult = null;
    try {
      const sRes = await fetch(`${baseUrl}/api/subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(env.ADMIN_SECRET ? { 'X-Admin-Token': env.ADMIN_SECRET } : {}),
        },
        body: JSON.stringify({ action: 'chargeDue' }),
      });
      subsResult = await sRes.json();
      console.log('[CRON] Subscriptions charged:', subsResult.processed);
    } catch (sErr) {
      console.error('[CRON] Subscription billing job failed:', sErr.message);
    }

    // Flag orders stuck in DELIVERED past AUTO_DISPUTE_DAYS with no dispute
    // opened — opens a dispute for admin review (does NOT auto-pay the
    // seller; the delivery could still be legitimately in transit). See
    // functions/api/payment.js (autoFlagStaleDeliveries).
    let autoDisputeResult = null;
    try {
      const arRes = await fetch(`${baseUrl}/api/payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(env.ADMIN_SECRET ? { 'X-Admin-Token': env.ADMIN_SECRET } : {}),
        },
        body: JSON.stringify({ action: 'autoFlagStaleDeliveries' }),
      });
      autoDisputeResult = await arRes.json();
      console.log('[CRON] Auto-flagged stale deliveries:', autoDisputeResult.flagged);
    } catch (arErr) {
      console.error('[CRON] Auto-flag job failed:', arErr.message);
    }

    return { ok: true, generated: result.count, qualityScores: qualityResult && qualityResult.sellersProcessed, subscriptionsCharged: subsResult && subsResult.processed, autoFlagged: autoDisputeResult && autoDisputeResult.flagged };
  } catch (err) {
    console.error('[CRON] Failed:', err.message);
    return { error: err.message };
  }
}
