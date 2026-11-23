// Run: node --test tests/stale-if-error.test.mjs
// When Firestore is down / the daily quota is exhausted, public endpoints must keep answering with the last good copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { edgeCached } from '../functions/_shared/edge-cache.js';

function mockCaches() {
    const store = new Map();
    globalThis.caches = { default: { match: async (k) => store.get(k.url)?.clone(), put: async (k, r) => { store.set(k.url, r); } } };
    return store;
}
let ip = 0;
const ctx = (url) => ({ request: new Request(url, { headers: { 'CF-Connecting-IP': '9.9.9.' + (++ip % 250) } }), waitUntil: () => {} });
const good = () => new Response('{"ok":1}', { status: 200, headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60', 'Access-Control-Allow-Origin': '*' } });
const realNow = Date.now;
const at = (ms) => { Date.now = () => realNow() + ms; };
test.afterEach(() => { Date.now = realNow; });

const O = { swr: 600, sie: 86400 };

test('render throws after the stale window → last good copy is served', async () => {
    mockCaches(); const u = 'https://x.dev/api/a1';
    await edgeCached(ctx(u), O, async () => good());
    at(3600 * 1000);                                            // 1h later: past ttl(60s)+swr(600s), inside sie(24h)
    const r = await edgeCached(ctx(u), O, async () => { throw new Error('Firestore quota exceeded'); });
    assert.equal(r.status, 200); assert.equal(await r.text(), '{"ok":1}');
    assert.match(r.headers.get('X-Edge-Cache'), /STALE-ERROR/);
});

test('render returns 500 → last good copy is served, and the 500 is not cached', async () => {
    const store = mockCaches(); const u = 'https://x.dev/api/a2';
    await edgeCached(ctx(u), O, async () => good());
    at(3600 * 1000);
    const r = await edgeCached(ctx(u), O, async () => new Response('{"success":false}', { status: 503, headers: { 'Cache-Control': 'no-store' } }));
    assert.equal(r.status, 200); assert.equal(await r.text(), '{"ok":1}');
    assert.equal(store.size, 1);
});

test('no previous copy → the error is NOT hidden', async () => {
    mockCaches();
    const r = await edgeCached(ctx('https://x.dev/api/a3'), O, async () => new Response('x', { status: 500, headers: { 'Cache-Control': 'no-store' } }));
    assert.equal(r.status, 500);
    await assert.rejects(() => edgeCached(ctx('https://x.dev/api/a4'), O, async () => { throw new Error('boom'); }));
});

test('beyond the stale-if-error window the old copy is dropped', async () => {
    mockCaches(); const u = 'https://x.dev/api/a5';
    await edgeCached(ctx(u), O, async () => good());
    at((60 + 600 + 86400 + 10) * 1000);
    const r = await edgeCached(ctx(u), O, async () => new Response('x', { status: 500, headers: { 'Cache-Control': 'no-store' } }));
    assert.equal(r.status, 500);
});

test('very old copy + healthy origin → fresh render is used (not the old copy)', async () => {
    mockCaches(); const u = 'https://x.dev/api/a6';
    await edgeCached(ctx(u), O, async () => good());
    at(3600 * 1000);
    const r = await edgeCached(ctx(u), O, async () => new Response('{"ok":2}', { status: 200, headers: { 'Cache-Control': 'public, max-age=60' } }));
    assert.equal(await r.text(), '{"ok":2}'); assert.equal(r.headers.get('X-Edge-Cache'), 'MISS');
});
