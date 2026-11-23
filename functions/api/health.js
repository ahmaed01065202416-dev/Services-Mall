/**
 * functions/api/health.js — Route: GET /api/health
 * Cheap liveness probe for uptime monitors (UptimeRobot, Cloudflare Health Checks…). Reads NOTHING from Firestore, so
 * monitoring never spends quota. `?deep=1` adds ONE tiny Firestore read (settings/platform) to prove the database answers —
 * use it at most every few minutes.
 */
import { fsGet } from '../_shared/gcp.js';

const H = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export async function onRequest(context) {
    const { request, env } = context;
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: H });
    const out = { ok: true, time: new Date().toISOString(), ai: !!(env.AI && env.AI.run), firebase: !!env.FIREBASE_SERVICE_ACCOUNT };
    if (new URL(request.url).searchParams.get('deep') === '1') {
        const t0 = Date.now();
        try { await fsGet(env, 'settings/platform'); out.db = 'ok'; out.dbMs = Date.now() - t0; }
        catch (e) { out.db = 'error'; out.ok = false; }
    }
    return new Response(request.method === 'HEAD' ? null : JSON.stringify(out), { status: out.ok ? 200 : 503, headers: H });
}
