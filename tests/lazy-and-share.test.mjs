// Static guards for the lazy-loaded dashboard modules and the new share/empty-state code.
// Run: node --test tests/lazy-and-share.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('ads/coupons/insights are NOT loaded eagerly, and both dashboards await the loader before any tab', () => {
    const html = read('index.html');
    for (const f of ['ads-system', 'coupons', 'insights']) {
        assert.ok(!new RegExp(`<script[^>]*src="js/${f}\\.js`).test(html), f + ' still loaded eagerly');
        assert.ok(html.includes(`'js/${f}.js?v=`), f + ' missing from the lazy list');
    }
    assert.ok(html.indexOf('window.__ensureDashModules') < html.indexOf('js/dashboard.js'), 'loader must be defined before dashboard.js');
    const sd = read('js/seller-dashboard.js'), db = read('js/dashboard.js');
    assert.ok(sd.indexOf('__ensureDashModules') < sd.indexOf("if (name === 'overview')"));
    assert.ok(db.indexOf('__ensureDashModules') < db.indexOf("tab === 'design'"));
});

test('no code outside the dashboards uses the lazy modules (only via window.X guards inside tab renderers)', () => {
    for (const f of fs.readdirSync(new URL('../js/', import.meta.url))) {
        if (!f.endsWith('.js') || ['ads-system.js', 'coupons.js', 'insights.js', 'dashboard.js', 'seller-dashboard.js'].includes(f)) continue;
        assert.ok(!/\b(AdsSystem|MallCoupons|MallInsights)\b/.test(read('js/' + f)), f + ' uses a lazy module');
    }
    assert.ok(!/\b(AdsSystem|MallCoupons|MallInsights)\b/.test(read('index.html').replace(/'js\/(ads-system|coupons|insights)\.js[^']*'/g, '')));
});

test('share row + empty hint wiring', () => {
    const s = read('js/services.js');
    assert.ok(/shareRowHtml\(s\.id, s\.title\)/.test(s) && /_fillEmptyHint\(empty\)/.test(s));
    assert.ok(read('js/seller-dashboard.js').includes("ServicesManager.copyServiceLink('${s.id}')"));
});

test('signed-in users get the dashboard modules prefetched while idle (first tab opens instantly)', () => {
    const html = read('index.html');
    assert.ok(/AppState\.currentUser[\s\S]{0,200}requestIdleCallback\(function \(\) \{ window\.__ensureDashModules\(\)/.test(html));
});
