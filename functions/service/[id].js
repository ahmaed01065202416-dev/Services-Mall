/**
 * functions/service/[id].js — Route: GET /service/<serviceId>
 * A real, indexable URL per listing (service or product): own title/description/canonical/OG, Product|Service + Breadcrumb
 * JSON-LD, internal links (store, category, related listings). Opens the listing's detail modal in the app.
 *   missing / inactive → REAL 404 · Firestore error → 503
 */
import { fsGet, fsQuery } from '../_shared/gcp.js';
import { CATEGORIES, isCategory } from '../_shared/catalog.js';
import { BRAND, SAFE_ID, esc, clip, siteUrl, imageUrl, readAsset, notFound, unavailable, htmlResponse, buildShell, eq, and, str, bool } from '../_shared/seo-shell.js';

const firstImage = (d) => d.image || (Array.isArray(d.images) ? d.images[0] : '') || '';

/** Pure function (unit-testable). store / related are optional. */
export function buildServicePage(html, { id, svc, store, related, site }) {
    const title = clip(svc.title || id, 90);
    const isProduct = svc.listingType === 'product';
    const catLabel = isCategory(svc.category) ? CATEGORIES[svc.category] : '';
    const desc = clip(svc.description || `${title} على ${BRAND}${catLabel ? ' — ' + catLabel : ''}. اطلب بأمان بنظام الضمان المالي.`, 155);
    const url = `${site}/service/${encodeURIComponent(id)}`;
    const image = imageUrl(site, firstImage(svc), `s=${encodeURIComponent(id)}`, svc._updateTime);
    const storeId = svc.storeId || svc.sellerId;
    const storeUrl = store && SAFE_ID.test(String(storeId || '')) ? `${site}/s/${encodeURIComponent(storeId)}` : '';

    const ld = { '@context': 'https://schema.org', '@type': isProduct ? 'Product' : 'Service', name: title, description: desc, image, url };
    if (catLabel) ld.category = catLabel;
    if (storeUrl) ld[isProduct ? 'brand' : 'provider'] = { '@type': 'Organization', name: clip(store.name || '', 70), url: storeUrl };
    const price = Number(svc.price);
    if (Number.isFinite(price) && price > 0) ld.offers = { '@type': 'Offer', price: String(price), priceCurrency: 'EGP', url };
    const rc = Number(svc.reviewCount), rt = Number(svc.rating);
    if (rc > 0 && rt > 0) ld.aggregateRating = { '@type': 'AggregateRating', ratingValue: Number(rt.toFixed(1)), reviewCount: rc };
    const crumbs = [{ n: BRAND, u: site + '/' }];
    if (catLabel) crumbs.push({ n: catLabel, u: `${site}/c/${svc.category}` });
    crumbs.push({ n: title, u: url });
    const bc = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.n, item: c.u })) };

    const rel = (related || []).filter((x) => x.id !== id && SAFE_ID.test(String(x.id || ''))).slice(0, 6)
        .map((x) => `<li><a tabindex="-1" href="/service/${encodeURIComponent(x.id)}">${esc(clip(x.title || '', 90))}</a></li>`).join('');
    const seoHtml = `<h2>${esc(title)}</h2>${catLabel ? `<p><a tabindex="-1" href="/c/${esc(svc.category)}">${esc(catLabel)}</a></p>` : ''}<p>${esc(clip(svc.description || desc, 600))}</p>`
        + (storeUrl ? `<p><a tabindex="-1" href="/s/${encodeURIComponent(storeId)}">${esc(clip(store.name || '', 70))}</a></p>` : '')
        + (rel ? `<ul>${rel}</ul>` : '') + `<p><a tabindex="-1" href="/">${BRAND}</a></p>`;
    return buildShell(html, {
        title: `${title} | ${BRAND}`, desc, url, image, ogType: 'website', ld: [ld, bc], seoHtml,
        boot: `window.addEventListener('load',function(){try{if(window.ServicesManager)ServicesManager.openServiceDetail('${id}')}catch(e){}})`,
    });
}

export async function onRequestGet(context) {
    const { request, env, params } = context;
    const id = String(Array.isArray(params.id) ? params.id[0] : params.id || '');
    if (!SAFE_ID.test(id)) return notFound(env, request, 'الصفحة');
    let svc, store = null, related = [];
    try {
        svc = await fsGet(env, `services/${id}`);
        if (!svc || svc.active !== true) return notFound(env, request, 'الصفحة');
        const sid = svc.storeId || svc.sellerId;
        const [st, rel] = await Promise.all([
            SAFE_ID.test(String(sid || '')) ? fsGet(env, `stores/${sid}`).catch(() => null) : Promise.resolve(null),
            isCategory(svc.category) ? fsQuery(env, { from: [{ collectionId: 'services' }], where: and(eq('category', str(svc.category)), eq('active', bool(true))), limit: 8 }).catch(() => []) : Promise.resolve([]),
        ]);
        store = st && st.status !== 'paused' ? st : null;
        related = rel;
    } catch (e) {
        console.error('[service-page]', id, e && e.message);
        return unavailable();
    }
    const tpl = await readAsset(env, new URL(request.url).origin, '/');
    if (!tpl || !tpl.ok) return unavailable();
    return htmlResponse(buildServicePage(await tpl.text(), { id, svc, store, related, site: siteUrl(env) }));
}
export const onRequestHead = onRequestGet;
