/**
 * functions/api/ads-feed.js — Route: GET /api/ads-feed
 * ============================================================================
 * The ONE public source every page uses to show ads (SPA pages AND the static
 * blog pages — they don't all load Firebase). Returns the enabled placements
 * and the ads running RIGHT NOW (status active AND endAt in the future), with
 * the service data needed to draw a card, so the browser never needs read
 * access to `ads`.
 *
 * Edge-cached 60s. Each ad carries endAtMs and the browser re-checks it, so an
 * ad disappears at its exact end time even while this response is cached.
 * ============================================================================
 */
import { fsQuery, fsGet } from '../_shared/gcp.js';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60, s-maxage=60',
};

export async function onRequest(context) {
    const { request, env } = context;
    if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
    const fail = (e) => new Response(JSON.stringify({ enabled: false, placements: [], ads: [], error: e }), { status: 200, headers: { ...CORS, 'Cache-Control': 'no-store' } });

    try {
        const settings = await fsGet(env, 'settings/platform').catch(() => null);
        if (settings && settings.ADS_ENABLED === false) return new Response(JSON.stringify({ enabled: false, placements: [], ads: [] }), { status: 200, headers: CORS });

        const [placementDocs, adDocs] = await Promise.all([
            fsQuery(env, { from: [{ collectionId: 'ad_placements' }], limit: 200 }),
            fsQuery(env, { from: [{ collectionId: 'ads' }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'active' } } }, limit: 500 }),
        ]);

        const placements = placementDocs.filter(p => p.enabled !== false).map(p => ({
            key: p.id, slots: Math.max(1, Number(p.slots) || 1), layout: p.layout || 'grid',
            selector: p.selector || '', position: p.position || '', page: p.page || '',
            nameAr: p.nameAr || p.id, nameEn: p.nameEn || p.nameAr || p.id,
            // Public marketing info the seller "Promote" dialog needs (prices are not secret).
            pricing: Array.isArray(p.pricing) ? p.pricing.map(o => ({ days: Number(o.days) || 0, price: Number(o.price) || 0 })).filter(o => o.days > 0) : [],
            requiresPayment: p.requiresPayment !== false, autoApprove: p.autoApprove === true,
            allowedKinds: Array.isArray(p.allowedKinds) && p.allowedKinds.length ? p.allowedKinds : ['service'],
        }));
        const live = new Set(placements.map(p => p.key));
        const now = Date.now();

        const running = adDocs.filter(a => live.has(a.placementKey) && Date.parse(a.endAt || 0) > now);
        const svcIds = [...new Set(running.filter(a => a.kind !== 'banner' && a.serviceId).map(a => a.serviceId))];
        const svcMap = {};
        await Promise.all(svcIds.map(async id => { svcMap[id] = await fsGet(env, `services/${id}`).catch(() => null); }));

        // How many ads are live per placement → lets the UI show "full" instead of letting a seller pay for nothing.
        const used = {};
        for (const a of running) used[a.placementKey] = (used[a.placementKey] || 0) + 1;
        placements.forEach(p => { p.used = used[p.key] || 0; });

        const ads = [];
        for (const a of running) {
            const base = { id: a.id, placementKey: a.placementKey, kind: a.kind || 'service', endAtMs: Date.parse(a.endAt), startMs: Date.parse(a.startAt || 0) };
            if (a.kind === 'banner') {
                if (!a.imageUrl) continue;
                ads.push({ ...base, title: a.title || '', imageUrl: a.imageUrl, linkUrl: a.linkUrl || '' });
            } else {
                const s = svcMap[a.serviceId];
                // A paused/deleted/inactive listing must never be advertised.
                if (!s || s.active === false || s.status === 'paused') continue;
                ads.push({ ...base, service: {
                    id: s.id, title: s.title || '', price: s.price || 0, image: (s.image || (Array.isArray(s.images) && s.images[0]) || '') ? `/api/ad-image?s=${encodeURIComponent(s.id)}` : '', images: [],
                    rating: s.rating || 0, reviewCount: s.reviewCount || 0, sellerName: s.sellerName || '', listingType: s.listingType || 'service', category: s.category || '',
                } });
            }
        }
        // Oldest-started first so the slot order is stable between refreshes.
        ads.sort((x, y) => x.startMs - y.startMs);
        return new Response(JSON.stringify({ enabled: true, placements, ads }), { status: 200, headers: CORS });
    } catch (err) {
        console.error('[ads-feed]', err.message);
        return fail(err.message);
    }
}
