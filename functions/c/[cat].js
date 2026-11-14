/**
 * functions/c/[cat].js — Route: GET /c/<category>
 * Category landing page (e.g. /c/design, /c/electronics). Lists the category's active listings as real links and opens
 * the category filter inside the app. A category with no active listing is served noindex (thin content).
 *   unknown category → REAL 404 · Firestore error → 503
 */
import { fsQuery } from '../_shared/gcp.js';
import { CATEGORIES, isCategory } from '../_shared/catalog.js';
import { BRAND, SAFE_ID, esc, clip, siteUrl, imageUrl, readAsset, notFound, unavailable, htmlResponse, buildShell, eq, and, str, bool } from '../_shared/seo-shell.js';

export function buildCategoryPage(html, { cat, items, site }) {
    const label = CATEGORIES[cat];
    const url = `${site}/c/${cat}`;
    const list = (items || []).filter((x) => SAFE_ID.test(String(x.id || ''))).slice(0, 30);
    const title = `${label} — خدمات ومنتجات ${label} | ${BRAND}`;
    const desc = clip(`تصفّح ${list.length ? 'أحدث' : ''} خدمات ومنتجات ${label} على ${BRAND}، واطلب بأمان بنظام الضمان المالي.`.replace('  ', ' '), 155);
    const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${label} | ${BRAND}`, description: desc, url,
        mainEntity: { '@type': 'ItemList', itemListElement: list.map((x, i) => ({ '@type': 'ListItem', position: i + 1, url: `${site}/service/${encodeURIComponent(x.id)}`, name: clip(x.title || '', 90) })) } };
    const bc = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: BRAND, item: site + '/' }, { '@type': 'ListItem', position: 2, name: label, item: url }] };
    const seoHtml = `<h2>${esc(label)}</h2><p>${esc(desc)}</p>${list.length ? `<ul>${list.map((x) => `<li><a tabindex="-1" href="/service/${encodeURIComponent(x.id)}">${esc(clip(x.title || '', 90))}</a></li>`).join('')}</ul>` : ''}<p><a tabindex="-1" href="/">${BRAND}</a></p>`;
    return buildShell(html, {
        title, desc, url, image: imageUrl(site, list[0] && (list[0].image || (Array.isArray(list[0].images) ? list[0].images[0] : '')), list[0] ? `s=${encodeURIComponent(list[0].id)}` : '', list[0] && list[0]._updateTime),
        ld: [ld, bc], seoHtml, noindex: list.length === 0,
        boot: `window.addEventListener('load',function(){try{if(window.filterByCategory)filterByCategory('${cat}')}catch(e){}})`,
    });
}

export async function onRequestGet(context) {
    const { request, env, params } = context;
    const cat = String(Array.isArray(params.cat) ? params.cat[0] : params.cat || '');
    if (!isCategory(cat)) return notFound(env, request, 'الصفحة');
    let items = [];
    try {
        items = await fsQuery(env, { from: [{ collectionId: 'services' }], where: and(eq('category', str(cat)), eq('active', bool(true))), limit: 30 });
    } catch (e) {
        console.error('[category-page]', cat, e && e.message);
        return unavailable();
    }
    const tpl = await readAsset(env, new URL(request.url).origin, '/');
    if (!tpl || !tpl.ok) return unavailable();
    return htmlResponse(buildCategoryPage(await tpl.text(), { cat, items, site: siteUrl(env) }));
}
export const onRequestHead = onRequestGet;
