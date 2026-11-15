// Run: node --test tests/edge-cache.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { edgeCached, cacheKey } from '../functions/_shared/edge-cache.js';

function mockCaches() {
    const store = new Map();
    globalThis.caches = { default: { match: async (k) => store.get(k.url)?.clone(), put: async (k, r) => { store.set(k.url, r); } } };
    return store;
}
const ctx = (url, ip = '1.1.1.1', method = 'GET') => ({ request: new Request(url, { method, headers: { 'CF-Connecting-IP': ip } }), waitUntil: () => {} });
const json = (cc, status = 200) => async () => new Response('{"a":1}', { status, headers: { 'Cache-Control': cc, 'Access-Control-Allow-Origin': '*' } });

test('key: only allow-listed params, order-independent; junk params cannot bust the cache', () => {
    const k = (u) => cacheKey(new Request(u), ['section', 'v']).url;
    assert.equal(k('https://x.dev/api/f?section=a&junk=1'), 'https://x.dev/api/f?section=a');
    assert.equal(k('https://x.dev/api/f?v=2&section=a'), k('https://x.dev/api/f?section=a&v=2'));
    assert.equal(k('https://x.dev/api/f?junk=9'), 'https://x.dev/api/f');
});

test('hit: handler runs once, headers (CORS) survive, repeat with junk params is a hit', async () => {
    const store = mockCaches(); let n = 0;
    const render = async () => { n++; return json('public, max-age=60, s-maxage=60')(); };
    const o = { params: ['section'] };
    await edgeCached(ctx('https://x.dev/api/f?section=s'), o, render);
    const r2 = await edgeCached(ctx('https://x.dev/api/f?section=s&cb=123'), o, render);
    assert.equal(n, 1); assert.equal(r2.headers.get('Access-Control-Allow-Origin'), '*'); assert.equal(await r2.text(), '{"a":1}');
    assert.equal(store.size, 1);
});

test('never cached: no-store, 5xx, 429-ish, other methods; 404 only with explicit public max-age and ≤60s', async () => {
    const store = mockCaches();
    await edgeCached(ctx('https://x.dev/a'), {}, json('no-store'));
    await edgeCached(ctx('https://x.dev/b'), {}, json('public, max-age=60', 500));
    await edgeCached(ctx('https://x.dev/c'), {}, json('', 200));
    await edgeCached(ctx('https://x.dev/d', '1.1.1.1', 'POST'), {}, json('public, max-age=60'));
    assert.equal(store.size, 0);
    await edgeCached(ctx('https://x.dev/e'), {}, json('public, max-age=600', 404));
    assert.equal(store.size, 1);
    assert.equal([...store.values()][0].headers.get('Cache-Control'), 'public, max-age=60', '404 capped at 60s');
});

test('TTL is capped; per-IP throttle only counts uncached work', async () => {
    const store = mockCaches();
    await edgeCached(ctx('https://x.dev/t'), { cap: 30 }, json('public, max-age=86400'));
    const fu = +[...store.values()][0].headers.get('X-Edge-Fresh-Until');
    assert.ok(fu - Date.now() <= 30000 && fu - Date.now() > 25000, 'fresh for the capped 30s, not 86400');
    let last;
    for (let i = 0; i < 12; i++) last = await edgeCached(ctx('https://x.dev/u' + i, '7.7.7.7'), { limit: 10 }, json('public, max-age=60'));
    assert.equal(last.status, 429);
    const hit = await edgeCached(ctx('https://x.dev/t', '7.7.7.7'), { limit: 10 }, json('public, max-age=60'));
    assert.equal(hit.status, 200, 'cache hits are never throttled');
});

test('forced TTL lifts a short origin max-age, but never caches non-cacheable responses', async () => {
    const store = mockCaches();
    await edgeCached(ctx('https://x.dev/f1'), { cap: 300, ttl: 300 }, json('public, max-age=60'));
    const fu = +store.get('https://x.dev/f1').headers.get('X-Edge-Fresh-Until');
    assert.ok(fu - Date.now() > 290000 && fu - Date.now() <= 300000, 'forced 300s');
    await edgeCached(ctx('https://x.dev/f2'), { cap: 300, ttl: 300 }, json('no-store'));
    await edgeCached(ctx('https://x.dev/f3'), { cap: 300, ttl: 300 }, json('public, max-age=60', 500));
    assert.equal(store.size, 1);
});

test('browser sees the origin Cache-Control again; bookkeeping headers never leak', async () => {
    mockCaches();
    await edgeCached(ctx('https://x.dev/h'), { ttl: 300 }, json('public, max-age=60, s-maxage=60'));
    const hit = await edgeCached(ctx('https://x.dev/h'), {}, async () => { throw new Error('must be a hit'); });
    assert.equal(hit.headers.get('Cache-Control'), 'public, max-age=60, s-maxage=60');
    assert.equal(hit.headers.get('X-Edge-Fresh-Until'), null); assert.equal(hit.headers.get('X-Edge-Origin-CC'), null);
});

test('stale-while-revalidate: expired copy is served instantly, ONE background refresh renews it', async () => {
    mockCaches();
    const realNow = Date.now; let clock = realNow.call(Date);
    Date.now = () => clock;
    try {
        let version = 1, renders = 0; const pending = [];
        const c = (path) => ({ request: new Request('https://x.dev' + path, { headers: { 'CF-Connecting-IP': '5.5.5.5' } }), waitUntil: (p) => pending.push(p) });
        const render = async () => { renders++; await new Promise((r) => setTimeout(r, 25)); return new Response('v' + version, { status: 200, headers: { 'Cache-Control': 'public, max-age=60' } }); };   // takes real time, like Firestore
        const o = { ttl: 60, swr: 600 };
        assert.equal(await (await edgeCached(c('/s1'), o, render)).text(), 'v1');
        await Promise.all(pending.splice(0));
        version = 2; clock += 61000;                                    // expired, but inside the stale window
        assert.equal(await (await edgeCached(c('/s1'), o, render)).text(), 'v1', 'visitor does not wait: gets the old copy');
        assert.equal(await (await edgeCached(c('/s1'), o, render)).text(), 'v1', 'second visitor during refresh: still old, no 2nd refresh');
        await Promise.all(pending.splice(0));
        assert.equal(renders, 2, 'initial render + exactly one background refresh');
        assert.equal(await (await edgeCached(c('/s1'), o, render)).text(), 'v2', 'refreshed copy is served afterwards');
        assert.equal(renders, 2);
    } finally { Date.now = realNow; }
});

test('X-Edge-Cache header shows the layer; memory layer works even when the Cache API is a no-op', async () => {
    const orig = globalThis.caches;
    globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };   // like *.workers.dev: accepts put, never returns
    try {
        let n = 0;
        const render = async () => { n++; return new Response('{"x":1}', { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' } }); };
        const a = await edgeCached(ctx('https://x.dev/noop-1', '3.3.3.3'), { ttl: 120 }, render);
        const b = await edgeCached(ctx('https://x.dev/noop-1', '3.3.3.3'), { ttl: 120 }, render);
        assert.equal(a.headers.get('X-Edge-Cache'), 'MISS'); assert.equal(b.headers.get('X-Edge-Cache'), 'MEM-HIT');
        assert.equal(n, 1, 'second request served from memory'); assert.equal(await b.text(), '{"x":1}');
        // binary responses are never kept in memory
        let m = 0;
        const img = async () => { m++; return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=60' } }); };
        await edgeCached(ctx('https://x.dev/noop-img', '3.3.3.3'), {}, img); await edgeCached(ctx('https://x.dev/noop-img', '3.3.3.3'), {}, img);
        assert.equal(m, 2, 'images are not memory-cached');
    } finally { globalThis.caches = orig; }
});

test('X-Edge-Cache: HIT / STALE come from the Cache API layer when memory is cold', async () => {
    mockCaches();
    const o = { ttl: 60, swr: 600 };
    const r1 = await edgeCached(ctx('https://x.dev/tag-bin', '4.4.4.4'), o, async () => new Response(new Uint8Array([9]), { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=60' } }));
    assert.equal(r1.headers.get('X-Edge-Cache'), 'MISS');
    const r2 = await edgeCached(ctx('https://x.dev/tag-bin', '4.4.4.4'), o, async () => { throw new Error('must be a hit'); });
    assert.equal(r2.headers.get('X-Edge-Cache'), 'HIT');
});
