// Regression: refresh on a signed-in page (#dashboard) must stay on that page — not show the login prompt.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../js/p/a69fd080.js', import.meta.url), 'utf8');
const a = src.indexOf('function handleHash()');
const b = src.indexOf("window.addEventListener('popstate', handleHash);");
assert.ok(a > 0 && b > a, 'handleHash not found');
const fn = src.slice(a, b);

function run({ hash, fbUser, profileAfterMs }) {
  const calls = [];
  const win = { location: { hash }, safeId: (s) => s, auth: { currentUser: fbUser ? { uid: 'u1' } : null } };
  let resolveReady; win._authReadyPromise = new Promise(r => { resolveReady = r; });
  const ctx = { window: win, AppState: { currentUser: null }, navigateTo: (p) => calls.push(p), showLoading() {}, hideLoading() {}, setTimeout, Date, Promise };
  vm.createContext(ctx);
  vm.runInContext(fn + '\nthis.handleHash = handleHash;', ctx);
  ctx.handleHash();
  return { calls, ctx, resolveReady, profileAfterMs };
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 1) signed-in user refreshes #dashboard: nothing opens before the profile is loaded, then the SAME page opens
{
  const t = run({ hash: '#dashboard', fbUser: true });
  assert.deepEqual(t.calls, [], 'must NOT open the page before auth/profile are known');
  t.resolveReady(); await sleep(120);
  assert.deepEqual(t.calls, [], 'auth known but profile not loaded yet: still waiting');
  t.ctx.AppState.currentUser = { uid: 'u1', role: 'buyer' }; await sleep(120);
  assert.deepEqual(t.calls, ['dashboard'], 'must stay on #dashboard');
}
// 2) genuinely signed out: page opens (its own login prompt), no redirect
{
  const t = run({ hash: '#wallet', fbUser: false });
  t.resolveReady(); await sleep(60);
  assert.deepEqual(t.calls, ['wallet']);
}
// 3) user navigated elsewhere while waiting: do not override
{
  const t = run({ hash: '#orders', fbUser: true });
  t.ctx.window.location.hash = '#services';
  t.resolveReady(); t.ctx.AppState.currentUser = { uid: 'u1' }; await sleep(120);
  assert.deepEqual(t.calls, []);
}
// 4) public pages and already-loaded user are untouched (synchronous)
{
  const t = run({ hash: '#services', fbUser: false });
  assert.deepEqual(t.calls, ['services']);
  const u = run({ hash: '#dashboard', fbUser: true });
  u.ctx.AppState.currentUser = { uid: 'u1' }; u.ctx.handleHash();
  assert.equal(u.calls.at(-1), 'dashboard');
}
console.log('refresh-stay: ok');
