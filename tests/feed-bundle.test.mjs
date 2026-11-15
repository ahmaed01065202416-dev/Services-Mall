// Run: node --test tests/feed-bundle.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assembleBundle, BUNDLE_SECTIONS } from '../functions/api/home-feed.js';
import { pageBody, PAGE_SIZE } from '../functions/api/services-list.js';
const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('bundle: one invocation for stores+services+products (platform stays separate); failing sections are left out', () => {
    assert.deepEqual(BUNDLE_SECTIONS, ['stores', 'services', 'products']);
    const b = assembleBundle([['stores', { body: { items: [1] } }], ['services', null], ['products', { body: { items: [] } }]]);
    assert.deepEqual(Object.keys(b), ['stores', 'products']);
    assert.equal(assembleBundle([['stores', null], ['services', null]]), null, 'all failed → null (→ 500, client falls back)');
});

test('services-list page: no embedded photos, cover URL, createdAt.seconds, cursor + hasMore', () => {
    const mk = (i) => ({ id: 's' + i, title: 't' + i, createdAt: `2026-11-0${i}T10:00:00.000Z`, image: 'data:image/png;base64,AAAA', images: ['data:image/png;base64,AAAA', 'data:image/png;base64,BBBB'], _updateTime: '2026-11-05T00:00:00Z' });
    const docs = [mk(3), mk(2), mk(1)];
    const p = pageBody(docs);
    assert.equal(p.items.length, 3); assert.equal(p.hasMore, false); assert.equal(p.next, docs[2].createdAt);
    assert.ok(p.items[0].image.startsWith('/api/ad-image?s=s3'), 'cover served as a cacheable image, not inline base64');
    assert.ok(!('images' in p.items[0]) && !JSON.stringify(p).includes('base64'));
    assert.equal(p.items[0].createdAt.seconds, Math.floor(Date.parse(docs[0].createdAt) / 1000));
    assert.equal(pageBody(Array.from({ length: PAGE_SIZE }, (_, i) => mk(1))).hasMore, true);
    assert.equal(pageBody([]).next, '');
});

test('client: bundle with per-section fallback; listing from the API with Firestore fallback and no restart at page 1', () => {
    const c = read('js/constants.js');
    assert.ok(/section=bundle/.test(c) && /if \(b && b\[section\]\) return \{ success: true, \.\.\.b\[section\] \}/.test(c));
    assert.ok(/'stores' \|\| section === 'services' \|\| section === 'products'/.test(c) && !/'platform'[^\n]*bundle/.test(c));
    const s = read('js/services.js');
    assert.ok(/fetch\('\/api\/services-list'/.test(s) && /_apiMode = false/.test(s) && /collection\(COLLECTIONS\.SERVICES\)\s*\.where\('active', '==', true\)\s*\.orderBy\('createdAt', 'desc'\)/.test(s));
    assert.ok(/_apiUsed && !reset\) \{ newServices = \[\]; _hasMore = false; \}/.test(s));
    assert.ok(/object-cover group-hover:scale-105 transition-transform duration-500"\s*loading="lazy"/.test(s), 'card covers stay lazy');
});
