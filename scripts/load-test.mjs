#!/usr/bin/env node
/**
 * scripts/load-test.mjs — tiny dependency-free load test for the PUBLIC endpoints.
 *
 *   node scripts/load-test.mjs https://<branch>.mall-services.pages.dev [concurrency=20] [seconds=20]
 *
 * RUN IT ONLY AGAINST A PREVIEW DEPLOYMENT (Cloudflare Pages → Deployments → a non-production branch), never against the
 * live site: it deliberately sends hundreds of requests, and every Function call and Firestore read it causes is counted
 * against your free daily quota. It refuses to run against the production host unless you pass --production.
 *
 * What to look at in the result:
 *   • 5xx / 429 > 1%      → quota or throttle reached (429 = per-IP throttle; expected if you hammer from one machine)
 *   • p95 latency         → should stay < ~1500 ms; the first request of each URL is uncached, the rest come from the edge
 *   • after the run, Firebase Console → Usage: reads should have grown by a few hundred, NOT by thousands.
 */
const [, , base, c = '20', s = '20', flag] = process.argv;
if (!base || !/^https:\/\//.test(base)) { console.error('usage: node scripts/load-test.mjs https://<preview-host> [concurrency] [seconds]'); process.exit(1); }
const host = new URL(base).host;
if (host === 'mall-services.pages.dev' && flag !== '--production') { console.error('Refusing to load-test the production host. Use a preview deployment (or pass --production if you really mean it).'); process.exit(1); }

const paths = ['/', '/api/home-feed?section=services', '/api/home-feed?section=stores', '/api/home-feed?section=platform', '/api/ads-feed', '/api/home-stats', '/blog/', '/sitemap.xml', '/sitemap-live.xml', '/c/design', '/s/does_not_exist', '/service/does_not_exist'];
const conc = Math.max(1, Math.min(100, +c || 20)), until = Date.now() + Math.max(5, Math.min(120, +s || 20)) * 1000;
const lat = [], codes = {}; let n = 0;
async function worker() {
    while (Date.now() < until) {
        const p = paths[Math.floor(Math.random() * paths.length)];
        const t = performance.now();
        try { const r = await fetch(base + p, { redirect: 'manual' }); await r.arrayBuffer(); codes[r.status] = (codes[r.status] || 0) + 1; }
        catch { codes.ERR = (codes.ERR || 0) + 1; }
        lat.push(performance.now() - t); n++;
    }
}
await Promise.all(Array.from({ length: conc }, worker));
lat.sort((a, b) => a - b);
const q = (p) => Math.round(lat[Math.min(lat.length - 1, Math.floor(lat.length * p))] || 0);
console.log(`requests: ${n}  concurrency: ${conc}  status:`, codes);
console.log(`latency ms → p50 ${q(0.5)}  p95 ${q(0.95)}  p99 ${q(0.99)}  max ${Math.round(lat[lat.length - 1] || 0)}`);
const bad = (codes.ERR || 0) + Object.entries(codes).filter(([k]) => +k >= 500).reduce((a, [, v]) => a + v, 0);
console.log(bad / Math.max(1, n) > 0.01 ? '⚠️  more than 1% server errors — check quotas / logs before launch' : '✅ error rate OK');
