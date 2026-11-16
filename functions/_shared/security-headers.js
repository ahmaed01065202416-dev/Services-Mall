/**
 * functions/_shared/security-headers.js
 * Single source of truth for the security headers sent by Functions responses.
 * KEEP IN SYNC with the `/*` block of /_headers (Pages applies _headers to STATIC files only,
 * Functions + their 404s never get it — that is what the ZAP scan flagged).
 */
export const CSP = "default-src 'self'; script-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://ssl.google-analytics.com https://www.gstatic.com https://apis.google.com https://accounts.google.com; style-src 'self' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://images.unsplash.com https://ui-avatars.com https://lh3.googleusercontent.com https://firebasestorage.googleapis.com https://services-mall.firebasestorage.app https://storage.googleapis.com https://www.google-analytics.com https://www.googletagmanager.com https://stats.g.doubleclick.net https://www.gstatic.com; media-src 'self' blob:; connect-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com https://stats.g.doubleclick.net https://www.gstatic.com https://apis.google.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebaseinstallations.googleapis.com https://www.googleapis.com https://oauth2.googleapis.com https://storage.googleapis.com https://firebasestorage.googleapis.com https://services-mall.firebasestorage.app https://services-mall-default-rtdb.firebaseio.com wss://services-mall-default-rtdb.firebaseio.com https://accounts.google.com https://app.fawaterk.com https://fawaterk.com; frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com https://accounts.google.com https://apis.google.com https://services-mall.firebaseapp.com https://services-mall-default-rtdb.firebaseio.com https://app.fawaterk.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self' https://app.fawaterk.com; frame-ancestors 'self'; upgrade-insecure-requests";

export const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Permissions-Policy': 'accelerometer=(), gyroscope=(), camera=(), microphone=(), geolocation=(), payment=(self "https://app.fawaterk.com")',
};

/** Origins allowed to call /api/* from a browser: this site + env.ALLOWED_ORIGINS (comma list) + env.SITE_URL. */
export function allowedOrigins(request, env) {
  const set = new Set([new URL(request.url).origin, 'https://mall-services.pages.dev']);
  for (const v of String((env && env.ALLOWED_ORIGINS) || '').split(',')) { const s = v.trim().replace(/\/+$/, ''); if (s && s !== '*') set.add(s); }
  const site = String((env && env.SITE_URL) || '').trim().replace(/\/+$/, '');
  if (site) set.add(site);
  return set;
}

/** Returns a new Response with the security headers added (existing values from the handler are kept), CORS tightened, and no-store on /api when unspecified. */
export function hardenResponse(request, env, res) {
  if (res.status === 101) return res;               // WebSocket upgrade: leave untouched
  const out = new Response(res.body, res);          // makes headers mutable
  const h = out.headers;
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!h.has(k)) h.set(k, v);

  const path = new URL(request.url).pathname;
  // CORS: never answer "*" — echo the caller only if it is an allowed origin, otherwise our own origin (browser blocks it).
  if (h.has('Access-Control-Allow-Origin')) {
    const allowed = allowedOrigins(request, env);
    const origin = request.headers.get('Origin') || '';
    h.set('Access-Control-Allow-Origin', allowed.has(origin) ? origin : new URL(request.url).origin);
    h.append('Vary', 'Origin');
  }
  if (path.startsWith('/api/') && !h.has('Cache-Control')) h.set('Cache-Control', 'no-store');
  return out;
}
