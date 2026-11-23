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
import { hardenResponse } from './_shared/security-headers.js';

const BLOCKED_EXACT = new Set([
  '/.firebaserc', '/firebase.json', '/firestore.rules', '/firestore.indexes.json',
  '/database.rules.json', '/package.json', '/package-lock.json', '/wrangler.toml',
  '/tailwind.config.js', '/seed.js', '/seed-blog.js',
  '/README.md', '/SETUP.md', '/DEPLOY_CLOUDFLARE.md', '/DEPLOY_RULES.md',
  '/FIXES_APPLIED.md', '/LOAD_PROTECTION.md', '/SECURITY_FIX_PAYMENT.md',
  '/CHANGES_V15.md', '/CHANGES_V16.md', '/CHANGES_V17.md', '/CHANGES_V19.md', '/CHANGES_V22.md', '/MARKETER_PROGRAM.md', '/THEME_CHANGES.md',
  '/.env.example',
]);
const BLOCKED_PREFIX = ['/functions/', '/cron-worker/', '/tests/', '/scripts/'];

// ── Load protection for /api/* ──────────────────────────────────────────────────────────────────────────────────────
// One cheap per-IP (per warm isolate, best effort) limiter in front of EVERY api route, so a flood is turned away with a
// 429 BEFORE the handler verifies tokens / parses bodies / touches Firestore (Spark quota ≈ 50k reads, 20k writes a day).
// For a real cap across all isolates also add ONE Cloudflare WAF rate-limiting rule on /api/* (see LOAD_PROTECTION.md).
const _rl = new Map();
function overLimit(key, limit, now = Date.now()) {
  const r = _rl.get(key);
  if (!r || now - r.t > 60000) { if (_rl.size > 5000) _rl.clear(); _rl.set(key, { t: now, n: 1 }); return false; }
  return ++r.n > limit;
}
// [pattern, requests per minute per IP; null = not limited here]
const API_TIERS = [
  [/^\/api\/(fawaterak|kashier)-webhook$/, null],                              // payment-provider callbacks (shared IPs, they verify signatures themselves)
  [/^\/api\/(home-feed|ads-feed|home-stats|ad-image|services-list)$/, null],   // already behind the edge cache + its own limiter
  [/^\/api\/analytics$/, null],                                                 // has its own flood guard
  [/^\/api\/(payment|ai-generate)$/, 60],
  [/^\/api\/(kyc|disputes|dropship|affiliate|subscription|stores|coupons|ads|quality-score|ai-brief|link-chat-participant|ratings)$/, 150],
];
const API_DEFAULT_LIMIT = 240;   // generous on purpose: many Egyptian mobile users share one carrier-NAT IP
const MAX_API_BODY = 8 * 1024 * 1024;   // no legitimate call is bigger (photos are tiny base64 thumbnails / https URLs)

export function apiGuard(request, pathname) {
  if (request.method === 'OPTIONS') return null;
  let limit = API_DEFAULT_LIMIT;
  for (const [re, l] of API_TIERS) if (re.test(pathname)) { limit = l; break; }
  if (limit === null) return null;
  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
    const len = parseInt(request.headers.get('Content-Length') || '0', 10);
    if (len > MAX_API_BODY) return new Response('Payload too large', { status: 413, headers: { 'Cache-Control': 'no-store' } });
  }
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (overLimit(ip + '|' + pathname, limit)) {
    return new Response(JSON.stringify({ success: false, error: 'طلبات كتير في وقت قصير — استنى دقيقة وحاول تاني' }), {
      status: 429, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '60', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
    });
  }
  return null;
}

export async function onRequest(context) {
  const { pathname } = new URL(context.request.url);
  if (BLOCKED_EXACT.has(pathname) || BLOCKED_PREFIX.some(p => pathname.startsWith(p))) {
    return hardenResponse(context.request, context.env, new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } }));
  }
  if (pathname.startsWith('/api/')) {
    const blocked = apiGuard(context.request, pathname);
    if (blocked) return hardenResponse(context.request, context.env, blocked);
  }
  return hardenResponse(context.request, context.env, await context.next());
}
