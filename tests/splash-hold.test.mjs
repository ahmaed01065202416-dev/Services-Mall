// The splash screen is held while a protected page waits for the signed-in user, released afterwards,
// and the 4 s safety timeout always removes it (so visitors can never get stuck).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../js/p/f99f16e2.js', import.meta.url), 'utf8');
const timers = [];
const el = { classList: { _s: new Set(), contains(c) { return this._s.has(c); }, add(c) { this._s.add(c); } }, parentNode: { removeChild() {} } };
const win = {};
const ctx = {
  window: win, localStorage: { getItem: () => '1' },           // returning signed-in visitor → splash waits for auth
  document: { readyState: 'complete', getElementById: () => el, addEventListener() {} },
  setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; },
};
vm.createContext(ctx); vm.runInContext(src, ctx);

win.__holdAppLoading = true;
win.__hideAppLoading();                                          // normal hide while held → ignored
assert.equal(el.classList.contains('fade-out'), false, 'splash must stay while held');
win.__holdAppLoading = false;
win.__hideAppLoading();
assert.equal(el.classList.contains('fade-out'), true, 'splash hides once released');

// safety timeout wins even if something forgot to release the hold
el.classList._s.clear(); win.__holdAppLoading = true;
const safety = timers.find(t => t.ms === 4000); assert.ok(safety, '4 s safety timeout missing'); safety.f();
assert.equal(el.classList.contains('fade-out'), true, 'safety timeout must always hide the splash');

// the handleHash side: no second loader any more
const a = fs.readFileSync(new URL('../js/p/a69fd080.js', import.meta.url), 'utf8');
const h = a.slice(a.indexOf('function handleHash()'), a.indexOf("window.addEventListener('popstate', handleHash);"));
assert.ok(!/showLoading\(|hideLoading\(/.test(h), 'handleHash must not use the white global loader');
assert.ok(/__holdAppLoading = true/.test(h) && /__holdAppLoading = false/.test(h));
console.log('splash-hold: ok');
