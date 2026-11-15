// Static guards that keep the quota-protection in place. Run: node --test tests/load-guards.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('public read endpoints are behind the edge cache', () => {
    for (const f of ['home-feed', 'ads-feed', 'home-stats', 'ad-image']) {
        const s = read(`functions/api/${f}.js`);
        assert.ok(/import \{ edgeCached \}/.test(s) && /export const onRequest = \(context\) => edgeCached\(/.test(s), f + ' not cached');
        assert.ok(!/export (async )?function onRequest\b/.test(s), f + ' still exports the raw handler');
    }
    const b = read('functions/blog/[slug].js');
    assert.ok(/edgeCached\(context/.test(b) && b.indexOf('context.next()') < b.indexOf('edgeCached(context'), 'blog: static slugs must bypass the cache');
    for (const f of ['s/[id]', 'service/[id]', 'c/[cat]']) assert.ok(/cachedPage\(context/.test(read(`functions/${f}.js`)), f);
});

test('admin dashboard never re-reads whole collections on every click', () => {
    const d = read('js/dashboard.js');
    assert.ok(!/COLLECTIONS\.(USERS|SERVICES|ORDERS|ESCROW)\)\.get\(\)/.test(d), 'raw full-collection read is back');
    assert.ok(/adminReadAll\('users'/.test(d) && /Date\.now\(\) - hit\.t < 300000/.test(d));
});

test('digital products page asks Firestore for digital listings, bounded', () => {
    const s = read('js/services.js');
    assert.ok(/where\('category', '==', 'digital'\)\.limit\(60\)/.test(s));
});
