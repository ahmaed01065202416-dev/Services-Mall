/**
 * functions/_shared/seo-shell.js — shared by /s/<store>, /service/<id> and /c/<category>.
 * Serves the SPA shell (index.html) with a page-specific <title>, description, canonical, Open Graph / Twitter tags,
 * JSON-LD and a crawlable text block, plus a tiny boot script that opens the right screen inside the app.
 */
export const BRAND = 'مول الخدمات';
export const SAFE_ID = /^[A-Za-z0-9_\-]{1,128}$/;
export const SAFE_HTTPS = /^https:\/\/[^\s"'<>\\]{1,1900}$/i;
export const DATA_IMG = /^data:image\/(?:jpeg|png|webp);base64,/i;

export const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export const oneLine = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
export const clip = (s, n) => { s = oneLine(s); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
export const siteUrl = (env) => String(env.SITE_URL || 'https://mall-services.pages.dev').trim().replace(/\/+$/, '');
export const ldJson = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

// Firestore structured-query helpers
export const eq = (field, value) => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value } });
export const and = (...f) => ({ compositeFilter: { op: 'AND', filters: f } });
export const str = (s) => ({ stringValue: s });
export const bool = (b) => ({ booleanValue: b });

/** Cover image of a listing/store: embedded base64 → the cacheable /api/ad-image endpoint; https → as is; else the site icon. */
export function imageUrl(site, raw, apiQuery, updateTime) {
    const v = Date.parse(updateTime || '');
    if (typeof raw === 'string' && DATA_IMG.test(raw)) return `${site}/api/ad-image?${apiQuery}${Number.isFinite(v) ? '&v=' + v : ''}`;
    if (typeof raw === 'string' && SAFE_HTTPS.test(raw)) return raw;
    return `${site}/icons/icon-512.png`;
}

export async function readAsset(env, origin, path) {
    let u = new URL(path, origin).toString();
    for (let i = 0; i < 3; i++) {
        const res = await env.ASSETS.fetch(new Request(u, { redirect: 'manual' }));
        if (res.status >= 300 && res.status < 400 && res.headers.get('Location')) { u = new URL(res.headers.get('Location'), u).toString(); continue; }
        return res;
    }
    return null;
}

export async function notFound(env, request, what = 'الصفحة') {
    let body = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="robots" content="noindex"><title>${esc(what)} غير موجودة — ${BRAND}</title></head><body style="font-family:sans-serif;text-align:center;padding:80px 20px"><h1>404</h1><p>${esc(what)} غير موجودة.</p><p><a href="/">العودة للرئيسية</a></p></body></html>`;
    try {
        const res = await readAsset(env, new URL(request.url).origin, '/404.html');
        if (res && res.ok) body = await res.text();
    } catch (_) { /* fallback page */ }
    return new Response(body, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=120', 'X-Robots-Tag': 'noindex' } });
}

export const unavailable = () => new Response('Service temporarily unavailable', { status: 503, headers: { 'Retry-After': '120', 'Cache-Control': 'no-store' } });
export const htmlResponse = (html) => new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=300' } });

/** Pure (unit-testable). o = { title, desc, url, image, ogType, ld:[objects], boot:'js', seoHtml:'<h2>…', noindex } */
export function buildShell(html, o) {
    const tags = [
        `<title>${esc(o.title)}</title>`,
        `<meta name="description" content="${esc(o.desc)}">`,
        `<link rel="canonical" href="${esc(o.url)}">`,
        `<meta property="og:title" content="${esc(o.title)}">`,
        `<meta property="og:description" content="${esc(o.desc)}">`,
        `<meta property="og:type" content="${o.ogType || 'website'}">`,
        `<meta property="og:url" content="${esc(o.url)}">`,
        `<meta property="og:image" content="${esc(o.image)}">`,
        `<meta property="og:locale" content="ar_EG">`,
        `<meta property="og:site_name" content="${BRAND}">`,
        `<meta name="twitter:card" content="summary">`,
        `<meta name="twitter:title" content="${esc(o.title)}">`,
        `<meta name="twitter:description" content="${esc(o.desc)}">`,
        `<meta name="twitter:image" content="${esc(o.image)}">`,
        ...(o.ld || []).map((x) => `<script type="application/ld+json">${ldJson(x)}</script>`),
        o.boot ? `<script>${o.boot}</script>` : '',
    ].filter(Boolean).join('\n  ');

    const cut = html.indexOf('</head>');
    if (cut < 0) return html;
    let head = html.slice(0, cut);
    const rest = html.slice(cut);
    head = head
        .replace(/<title>[\s\S]*?<\/title>/i, '')
        .replace(/<meta name="description"[^>]*>/gi, '')
        .replace(/<link rel="canonical"[^>]*>/gi, '')
        .replace(/<meta property="og:[^"]*"[^>]*>/gi, '')
        .replace(/<meta name="twitter:[^"]*"[^>]*>/gi, '');
    if (o.noindex) head = head.replace(/<meta name="robots"[^>]*>/i, '<meta name="robots" content="noindex,follow">');
    head += '\n  ' + tags + '\n';

    // The shell uses relative asset paths (js/…, css/…): under /s/<id>, /service/<id>, /c/<x> they must be absolute.
    const page = (head + rest).replace(/\b(src|href)="(?!https?:|\/|#|data:|mailto:|tel:|javascript:|\{|\$)/gi, '$1="/');
    const seo = `<div id="seoPage" role="region" aria-label="${esc(o.title)}" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap">${o.seoHtml || ''}</div>`;
    return page.replace(/<body[^>]*>/i, (m) => m + '\n' + seo);
}
