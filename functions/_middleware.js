// functions/_middleware.js
// ─────────────────────────────────────────────────────────────────────────────
// wrangler.toml / the Pages dashboard publish the whole repo root ("."), so dev
// files — security-fix write-ups, the Firestore/RTDB rules, seed scripts,
// package manifests, the cron worker source — were downloadable by anyone at
// /SECURITY_FIX_PAYMENT.md, /firestore.rules, /seed.js ... Nothing in them is a
// credential, but they hand an attacker a map of past weaknesses and config.
//
// `_routes.json` (next to index.html) only sends THESE paths through Functions,
// so normal static traffic is unaffected and costs no Function invocations.
// Anything listed there that reaches this middleware gets a plain 404.
// (Cleaner long-term fix: set the Pages "build output directory" to a dedicated
// public/ folder, then this file and _routes.json's block list can go away.)
// ─────────────────────────────────────────────────────────────────────────────
const BLOCKED_EXACT = new Set([
  '/.firebaserc', '/firebase.json', '/firestore.rules', '/firestore.indexes.json',
  '/database.rules.json', '/package.json', '/package-lock.json', '/wrangler.toml',
  '/tailwind.config.js', '/seed.js', '/seed-blog.js',
  '/README.md', '/SETUP.md', '/DEPLOY_CLOUDFLARE.md', '/DEPLOY_RULES.md',
  '/FIXES_APPLIED.md', '/SECURITY_FIX_PAYMENT.md',
]);
const BLOCKED_PREFIX = ['/functions/', '/cron-worker/'];

export async function onRequest(context) {
  const { pathname } = new URL(context.request.url);
  if (BLOCKED_EXACT.has(pathname) || BLOCKED_PREFIX.some(p => pathname.startsWith(p))) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  return context.next();
}
