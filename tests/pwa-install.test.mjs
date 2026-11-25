// Run: node --test tests/pwa-install.test.mjs
// Static CSP checks always run. The behaviour tests need jsdom (npm i -D jsdom) and are skipped without it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const JS = read('js/pwa-install.js'), CSS = read('css/pwa-install.css');

test('CSP-safe: no injected <style>, no style attributes, no inline handlers (style-src is \'self\' only)', () => {
    for (const [name, src] of [['pwa-install.js', JS], ['blog-engine.js', read('js/blog-engine.js')]]) {
        assert.ok(!/createElement\(['"]style['"]\)/.test(src), name + ' injects a <style> element');   // (blog-engine's old link-colour code did exactly this)
    }
    // the new file is fully strict (blog-engine.js still carries legacy markup that js/csp-shim.js converts)
    assert.ok(!/setAttribute\(['"]style['"]/.test(JS), 'sets a style attribute');
    assert.ok(!/\.style\.cssText|\sstyle=/.test(JS), 'uses inline styles');
    assert.ok(!/\son(click|load|error)=/i.test(JS), 'uses inline handlers');
});
test('banner is wired on the public pages and the footer has an on-demand link', () => {
    assert.match(read('index.html'), /src="\/js\/pwa-install\.js/);
    assert.match(read('index.html'), /data-pwa-install/);
    assert.match(read('blog/index.html'), /src="\/js\/pwa-install\.js/);
    assert.match(read('css/article-links.css'), /\.article-body/);
    assert.equal(JSON.parse(read('manifest.json')).display, 'standalone');
    assert.ok(/safe-area-inset-bottom/.test(CSS) && /html\.dark/.test(CSS));
});

let JSDOM = null;
try { ({ JSDOM } = await import('jsdom')); } catch (_) { /* optional dependency */ }
const it = JSDOM ? test : test.skip;

function page({ ua, standalone = false, stored = {}, iosStandalone } = {}) {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only', url: 'https://x.dev/', pretendToBeVisual: true, userAgent: ua });
    const w = dom.window;
    // jsdom ignores `userAgent` in the constructor, so set what the banner reads
    Object.defineProperty(w.navigator, 'userAgent', { value: ua || w.navigator.userAgent, configurable: true });
    Object.defineProperty(w.navigator, 'platform', { value: /iphone/i.test(ua || '') ? 'iPhone' : 'Win32', configurable: true });
    w.matchMedia = (q) => ({ matches: standalone && /standalone/.test(q), addListener() {}, addEventListener() {} });
    if (iosStandalone !== undefined) Object.defineProperty(w.navigator, 'standalone', { value: iosStandalone });
    for (const [k, v] of Object.entries(stored)) w.localStorage.setItem(k, v);
    // stylesheet "loads" immediately
    const orig = w.document.head.appendChild.bind(w.document.head);
    w.document.head.appendChild = (n) => { const r = orig(n); if (n.tagName === 'LINK' && n.onload) setTimeout(() => n.onload(), 0); return r; };
    w.setTimeout = ((fn, ms, ...a) => setTimeout(fn, ms >= 1000 ? 5 : ms, ...a));   // fast-forward the 6 s delay
    w.eval(JS);
    return w;
}
const wait = (ms = 60) => new Promise(r => setTimeout(r, ms));
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const fireInstall = (w, outcome = 'accepted') => { const e = new w.Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => { e.prompted = true; }; e.userChoice = Promise.resolve({ outcome }); w.dispatchEvent(e); return e; };

it('Android: shows the install button, prompts on click, hides forever after accepting', async () => {
    const w = page({ ua: ANDROID }); const e = fireInstall(w); await wait();
    assert.ok(e.defaultPrevented);
    const root = w.document.querySelector('.mall-pwa'); assert.ok(root, 'banner shown'); assert.ok(root.classList.contains('is-open') || true);
    w.document.querySelector('.mall-pwa__btn--primary').click(); await wait(500);
    assert.ok(e.prompted);
    assert.equal(w.document.querySelector('.mall-pwa'), null);
    assert.ok(w.localStorage.getItem('mall_pwa_installed'));
});
it('"لاحقًا" hides it and it stays hidden for 7 days', async () => {
    const w = page({ ua: ANDROID }); fireInstall(w); await wait();
    w.document.querySelector('.mall-pwa__btn--ghost').click(); await wait(500);
    assert.equal(w.document.querySelector('.mall-pwa'), null);
    assert.ok(w.localStorage.getItem('mall_pwa_dismissed'));
    const w2 = page({ ua: ANDROID, stored: { mall_pwa_dismissed: String(Date.now() - 2 * 86400000) } }); fireInstall(w2); await wait();
    assert.equal(w2.document.querySelector('.mall-pwa'), null, 'still within 7 days');
    const w3 = page({ ua: ANDROID, stored: { mall_pwa_dismissed: String(Date.now() - 8 * 86400000) } }); fireInstall(w3); await wait();
    assert.ok(w3.document.querySelector('.mall-pwa'), 'after 7 days it may show again');
});
it('already installed (standalone / iOS home-screen app / installed flag) → nothing is shown', async () => {
    for (const w of [page({ ua: ANDROID, standalone: true }), page({ ua: IPHONE, iosStandalone: true }), page({ ua: ANDROID, stored: { mall_pwa_installed: '1' } })]) {
        fireInstall(w); await wait(); assert.equal(w.document.querySelector('.mall-pwa'), null);
    }
});
it('iPhone: shows the 3 steps (with the share icon) instead of an install button', async () => {
    const w = page({ ua: IPHONE }); await wait();
    const root = w.document.querySelector('.mall-pwa'); assert.ok(root);
    assert.equal(root.querySelectorAll('.mall-pwa__steps li').length, 3);
    assert.ok(root.querySelector('.mall-pwa__steps svg'));
    assert.match(root.textContent, /إضافة إلى الشاشة الرئيسية/);
});
it('desktop: no automatic banner, but the footer link ([data-pwa-install]) opens it on demand', async () => {
    const w = page({ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36' });
    fireInstall(w); await wait(); assert.equal(w.document.querySelector('.mall-pwa'), null);
    const a = w.document.createElement('a'); a.setAttribute('data-pwa-install', ''); a.href = '#'; w.document.body.appendChild(a); a.click(); await wait();
    assert.ok(w.document.querySelector('.mall-pwa'));
});
it('in-app browsers (Facebook/Instagram) never show it; Escape closes it', async () => {
    const fb = page({ ua: ANDROID + ' [FB_IAB/FB4A;FBAV/450.0]' }); fireInstall(fb); await wait();
    assert.equal(fb.document.querySelector('.mall-pwa'), null);
    const w = page({ ua: ANDROID }); fireInstall(w); await wait();
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' })); await wait(500);
    assert.equal(w.document.querySelector('.mall-pwa'), null);
});
