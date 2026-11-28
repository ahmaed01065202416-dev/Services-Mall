// Behavioural tests for sw.js: the real file runs in a vm with in-memory Cache / fetch fakes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);
const ORIGIN = 'https://site.test';
const src = fs.readFileSync(new URL('sw.js', ROOT), 'utf8');

const basic = (body, init = {}) => { const r = new Response(body, { status: 200, ...init }); Object.defineProperty(r, 'type', { value: 'basic' }); return r; };

function setup() {
  const store = new Map();
  const handlers = {};
  let netImpl = async () => { throw new Error('offline'); };
  const abs = (k) => (typeof k === 'string' ? new URL(k, ORIGIN).href : k.url);
  const cache = {
    async put(k, v) { store.set(abs(k), v); },
    async match(k, o = {}) {
      let hit = store.get(abs(k));
      if (!hit && o.ignoreSearch) { const b = abs(k).split('?')[0]; for (const [kk, v] of store) if (kk.split('?')[0] === b) hit = v; }
      if (!hit) return undefined;
      const c = hit.clone(); if (hit.redirected) Object.defineProperty(c, 'redirected', { value: true });
      return c;
    },
    async keys() { return [...store.keys()].map(url => ({ url })); },
    async delete(k) { return store.delete(k.url); },
  };
  class Req extends Request { constructor(u, i) { super(new URL(u, ORIGIN).href, i); } }
  const ctx = {
    self: { location: { origin: ORIGIN }, registration: { navigationPreload: { enable: async () => {} } }, clients: { claim: async () => {} }, skipWaiting() {}, addEventListener(t, f) { handlers[t] = f; } },
    console: { warn() {}, log() {} }, URL, Response, Headers, Promise, Request: Req,
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    fetch: async (r) => netImpl(typeof r === 'string' ? r : r.url),
    setTimeout: (f, ms) => setTimeout(f, ms / 100),            // run the SW timeouts 100x faster
    clearTimeout,
  };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  return { handlers, store, setNet: (f) => { netImpl = f; } };
}

async function fire(env, request) {
  const waits = []; let p;
  env.handlers.fetch({ request, respondWith: (x) => { p = x; }, waitUntil: (x) => waits.push(x), preloadResponse: Promise.resolve(undefined) });
  const res = p ? await p : null;
  await Promise.all(waits);
  return res;
}
const navReq = (path) => ({ method: 'GET', url: ORIGIN + path, mode: 'navigate', headers: new Headers() });
const assetReq = (path, extra = {}) => ({ method: 'GET', url: ORIGIN + path, mode: 'no-cors', headers: new Headers(), ...extra });

// 1) install: ONE failing file must not stop the others (old cache.addAll was all-or-nothing)
{
  const env = setup();
  env.setNet(async (u) => (u.endsWith('/offline.html') ? new Response('nf', { status: 404 }) : basic('ok:' + u)));
  let pending; env.handlers.install({ waitUntil: (p) => { pending = p; } }); await pending;
  assert.ok(env.store.has(ORIGIN + '/index.html'), 'index.html must be cached');
  assert.ok(env.store.has(ORIGIN + '/css/offline.css'));
  assert.ok(!env.store.has(ORIGIN + '/offline.html'), 'the 404 file is skipped, not fatal');
}
// 2) offline: app shell opens from cache, other pages get the friendly offline page, last resort is plain text
{
  const env = setup();
  env.store.set(ORIGIN + '/index.html', basic('SHELL')); env.store.set(ORIGIN + '/offline.html', basic('OFFLINE-PAGE'));
  assert.equal(await (await fire(env, navReq('/'))).text(), 'SHELL');
  assert.equal(await (await fire(env, navReq('/blog/some-post/'))).text(), 'OFFLINE-PAGE');
  env.store.delete(ORIGIN + '/offline.html');
  assert.equal((await fire(env, navReq('/blog/x/'))).status, 503);
}
// 3) a cached shell that came from a redirect is never served as-is (Safari rejects redirected responses)
{
  const env = setup(); const shell = basic('SHELL'); Object.defineProperty(shell, 'redirected', { value: true });
  env.store.set(ORIGIN + '/index.html', shell);
  const res = await fire(env, navReq('/')); assert.equal(res.redirected, false); assert.equal(await res.text(), 'SHELL');
}
// 4) slow network: cached copy wins quickly; with nothing cached we keep waiting for the network (no false failure)
{
  const env = setup(); env.store.set(ORIGIN + '/p/', basic('CACHED'));
  env.setNet(() => new Promise(() => {}));                      // hangs forever
  const t0 = Date.now(); assert.equal(await (await fire(env, navReq('/p/'))).text(), 'CACHED'); assert.ok(Date.now() - t0 < 1000);
  const env2 = setup(); env2.setNet(() => new Promise(r => setTimeout(() => r(basic('LATE')), 300)));   // slower than the SW timeout
  assert.equal(await (await fire(env2, navReq('/new/'))).text(), 'LATE');
}
// 5) online: response is returned and stored for later; a 5xx falls back to the cached copy
{
  const env = setup(); env.setNet(async () => basic('LIVE'));
  assert.equal(await (await fire(env, navReq('/c/design'))).text(), 'LIVE');
  assert.ok(env.store.has(ORIGIN + '/c/design'));
  env.setNet(async () => basic('BAD', { status: 503 }));
  assert.equal(await (await fire(env, navReq('/c/design'))).text(), 'LIVE');
}
// 6) never touched: POST, other origins, /api/, Range requests
{
  const env = setup();
  for (const r of [{ ...assetReq('/x'), method: 'POST' }, { ...assetReq('/x'), url: 'https://other.test/x' }, assetReq('/api/ai-generate'),
                   { ...assetReq('/v.mp4'), headers: new Headers({ range: 'bytes=0-1' }) }])
    assert.equal(await fire(env, r), null, 'must not intercept ' + r.url);
}
// 7) assets: offline fallback ignores ?v=…, unknown asset → 503, runtime cache stays capped
{
  const env = setup(); env.store.set(ORIGIN + '/js/app.js', basic('JS'));
  assert.equal(await (await fire(env, assetReq('/js/app.js?v=2'))).text(), 'JS');
  assert.equal((await fire(env, assetReq('/js/none.js'))).status, 503);
  env.setNet(async () => basic('img'));
  for (let i = 0; i < 170; i++) await fire(env, assetReq('/img/' + i + '.png'));
  assert.ok([...env.store.keys()].filter(k => k.includes('/img/')).length <= 150, 'runtime cache must be capped');
}
// 8) every precached file really exists, and the manifest only points to real files
{
  const list = [...src.slice(src.indexOf('const LOCAL_ASSETS'), src.indexOf('];', src.indexOf('const LOCAL_ASSETS'))).matchAll(/'(\/[^']+)'/g)].map(m => m[1].split('?')[0]);
  for (const f of list) assert.ok(fs.existsSync(new URL(f.slice(1), ROOT)), 'precache file missing on disk: ' + f);
  const m = JSON.parse(fs.readFileSync(new URL('manifest.json', ROOT), 'utf8'));
  for (const i of m.icons) assert.ok(fs.existsSync(new URL(i.src.slice(1), ROOT)), 'manifest icon missing: ' + i.src);
  assert.ok(m.icons.some(i => i.purpose === 'maskable') && m.icons.some(i => i.purpose === 'any'), 'separate any + maskable icons');
  assert.ok(!m.icons.some(i => /any maskable/.test(i.purpose)), 'icons must not combine any+maskable');
}
console.log('sw-offline: ok');
