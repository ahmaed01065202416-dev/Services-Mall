/**
 * functions/api/ad-image.js — Route: GET /api/ad-image?s=<serviceId>
 * Serves a listing's cover photo as a real, browser-cacheable image. Photos in this app are stored as
 * base64 data URLs inside the service document, so inlining them in /api/ads-feed would make that
 * response several MB. Only ACTIVE listings are served (the listing itself is public anyway).
 */
import { fsGet } from '../_shared/gcp.js';

export async function onRequest(context) {
    const { request, env } = context;
    const id = new URL(request.url).searchParams.get('s') || '';
    if (!/^[A-Za-z0-9_\-]{1,128}$/.test(id)) return new Response('bad id', { status: 400 });
    try {
        const svc = await fsGet(env, `services/${id}`);
        const img = svc && svc.active !== false && svc.status !== 'paused' ? (svc.image || (Array.isArray(svc.images) ? svc.images[0] : '')) : '';
        if (!img) return new Response('not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } });
        const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(img);
        if (m) {
            const bin = atob(m[2]), bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return new Response(bytes, { status: 200, headers: { 'Content-Type': m[1], 'Cache-Control': 'public, max-age=3600, s-maxage=3600', 'X-Content-Type-Options': 'nosniff' } });
        }
        if (/^https:\/\//i.test(img)) return Response.redirect(img, 302);
        return new Response('unsupported', { status: 415 });
    } catch (e) {
        return new Response('error', { status: 500, headers: { 'Cache-Control': 'no-store' } });
    }
}
