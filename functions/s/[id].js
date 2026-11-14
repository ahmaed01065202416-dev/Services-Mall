/**
 * functions/s/[id].js — Route: GET /s/<storeId>
 * The public, SHAREABLE link of a store (Facebook / WhatsApp / Google): the SPA shell with this store's own tags,
 * JSON-LD and crawlable summary (see _shared/seo-shell.js), opening the store in the app (#store-<id>).
 *   store missing / paused → REAL 404 (noindex) · Firestore error → 503 + Retry-After
 */
import { fsGet, fsQuery } from '../_shared/gcp.js';
import { BRAND, SAFE_ID, esc, clip, siteUrl, imageUrl, readAsset, notFound, unavailable, htmlResponse, buildShell, eq, and, str, bool } from '../_shared/seo-shell.js';

/** Pure function (unit-testable): turns the SPA shell + store data into this store's page. */
export function buildStorePage(html, { id, store, items, site }) {
    const name = clip(store.name || id, 70);
    const desc = clip(store.description || store.tagline || `متجر ${name} على ${BRAND} — تصفّح المنتجات والخدمات واطلب بأمان.`, 155);
    const url = `${site}/s/${encodeURIComponent(id)}`;
    const image = imageUrl(site, store.logo, `st=${encodeURIComponent(id)}`, store._updateTime);
    const place = [store.city, store.country === 'EG' ? 'مصر' : store.country].filter(Boolean).join('، ');
    const ld = { '@context': 'https://schema.org', '@type': 'OnlineStore', name, description: desc, url, image };
    if (place) ld.areaServed = place;
    const links = (items || []).slice(0, 20).filter((x) => SAFE_ID.test(String(x.id || '')))
        .map((x) => `<li><a tabindex="-1" href="/service/${encodeURIComponent(x.id)}">${esc(clip(x.title || x.name || '', 90))}</a></li>`).join('');
    const seoHtml = `<h2>${esc(name)}</h2>${store.tagline ? `<p>${esc(clip(store.tagline, 120))}</p>` : ''}<p>${esc(clip(store.description || desc, 400))}</p>${links ? `<ul>${links}</ul>` : ''}<p><a tabindex="-1" href="/">${BRAND}</a></p>`;
    return buildShell(html, {
        title: `${name} | ${BRAND}`, desc, url, image, ld: [ld], seoHtml,
        // open the store in the app (the SPA routes on #store-<id>)
        boot: `try{if(!location.hash||location.hash==='#')history.replaceState(null,'',location.pathname+'#store-${id}')}catch(e){}`,
    });
}

export async function onRequestGet(context) {
    const { request, env, params } = context;
    const id = String(Array.isArray(params.id) ? params.id[0] : params.id || '');
    if (!SAFE_ID.test(id)) return notFound(env, request, 'المتجر');
    let store, items = [];
    try {
        store = await fsGet(env, `stores/${id}`);
        if (!store || store.status === 'paused') return notFound(env, request, 'المتجر');
        const q = (field) => fsQuery(env, { from: [{ collectionId: 'services' }], where: and(eq(field, str(id)), eq('active', bool(true))), limit: 20 }).catch(() => []);
        const isFirst = store.ownerId === id;
        const [byStore, bySeller] = await Promise.all([q('storeId'), isFirst ? q('sellerId') : Promise.resolve([])]);
        const seen = new Set();
        items = [...byStore, ...bySeller].filter((d) => !seen.has(d.id) && seen.add(d.id) && (!isFirst || !d.storeId || d.storeId === id));
    } catch (e) {
        console.error('[store-page]', id, e && e.message);
        return unavailable();
    }
    const tpl = await readAsset(env, new URL(request.url).origin, '/');
    if (!tpl || !tpl.ok) return unavailable();
    return htmlResponse(buildStorePage(await tpl.text(), { id, store, items, site: siteUrl(env) }));
}
export const onRequestHead = onRequestGet;
