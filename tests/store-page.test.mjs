// Run: node --test tests/store-page.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildStorePage } from '../functions/s/[id].js';
import { buildServicePage } from '../functions/service/[id].js';
import { buildCategoryPage } from '../functions/c/[cat].js';
import { onRequest as sitemap } from '../functions/api/sitemap-dynamic.js';

const shell = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const site = 'https://mall-services.pages.dev';
const store = { name: 'متجر <b>"س"</b>', description: 'وصف المتجر', tagline: 'شعار', logo: 'data:image/png;base64,AAAA', city: 'المنصورة', country: 'EG', _updateTime: '2026-11-01T10:00:00Z' };

test('store page: own head tags, no duplicates, absolute assets, escaped', () => {
    const html = buildStorePage(shell, { id: 'abc_2', store, items: [{ id: 'it1', title: 'منتج <script>x</script>' }], site });
    const head = html.slice(0, html.indexOf('</head>'));
    assert.equal((head.match(/<title>/g) || []).length, 1);
    assert.equal((head.match(/rel="canonical"/g) || []).length, 1);
    assert.equal((head.match(/property="og:title"/g) || []).length, 1);
    assert.equal((head.match(/name="description"/g) || []).length, 1);
    assert.ok(head.includes(`href="${site}/s/abc_2"`));
    assert.ok(head.includes(`${site}/api/ad-image?st=abc_2&v=`));
    assert.ok(html.includes('href="/service/it1"'), 'store page links to its services');
    assert.ok(!head.includes('<b>') && !html.includes('<script>x</script>'));
    assert.ok(head.includes('#store-abc_2'));
    assert.ok(!/(?:src|href)="(?:js|css|icons)\//.test(html), 'relative asset path left');
    assert.ok(html.includes('src="/js/constants.js'));
    assert.ok(html.includes('id="seoPage"'));
    // JSON-LD parses
    const ld = /<script type="application\/ld\+json">(\{"@context"[^<]*"@type":"OnlineStore"[^<]*)<\/script>/.exec(head);
    assert.ok(ld && JSON.parse(ld[1]).url === `${site}/s/abc_2`);
});

test('store page: https logo / no logo fallbacks', () => {
    const a = buildStorePage(shell, { id: 'u1', store: { name: 'x', logo: 'https://i.example/a.png' }, items: [], site });
    assert.ok(a.includes('content="https://i.example/a.png"'));
    const b = buildStorePage(shell, { id: 'u1', store: { name: 'x' }, items: [], site });
    assert.ok(b.includes(`${site}/icons/icon-512.png`));
});

test('service page: Product vs Service JSON-LD, breadcrumb, internal links, boot', () => {
    const svc = { title: 'تصميم لوجو <b>', description: 'وصف الخدمة', price: 250, category: 'design', listingType: 'service', storeId: 'st1', image: 'data:image/png;base64,AAAA', rating: 4.6, reviewCount: 12, _updateTime: '2026-11-01T10:00:00Z' };
    const html = buildServicePage(shell, { id: 'sv1', svc, store: { name: 'متجر س' }, related: [{ id: 'sv2', title: 'خدمة تانية' }, { id: 'sv1', title: 'نفسه' }], site });
    const head = html.slice(0, html.indexOf('</head>'));
    assert.ok(head.includes(`href="${site}/service/sv1"`) && head.includes(`${site}/api/ad-image?s=sv1&v=`));
    const lds = [...head.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const main = lds.find((x) => x['@type'] === 'Service'), bc = lds.find((x) => x['@type'] === 'BreadcrumbList');
    assert.equal(main.offers.price, '250'); assert.equal(main.offers.priceCurrency, 'EGP'); assert.equal(main.aggregateRating.reviewCount, 12);
    assert.equal(main.provider.url, `${site}/s/st1`); assert.equal(bc.itemListElement.length, 3);
    assert.ok(html.includes('href="/c/design"') && html.includes('href="/s/st1"') && html.includes('href="/service/sv2"'));
    assert.ok(!html.includes('href="/service/sv1"') || head.includes('rel="canonical"'), 'no self-link in related');
    assert.ok(head.includes("ServicesManager.openServiceDetail('sv1')"));
    assert.ok(!head.includes('<b>'));
    const prod = buildServicePage(shell, { id: 'p1', svc: { title: 'x', listingType: 'product', price: 0, category: 'weird' }, site });
    assert.ok(/"@type":"Product"/.test(prod) && !/"offers"/.test(prod) && !/"aggregateRating"/.test(prod));
});

test('category page: ItemList, noindex when empty, boot filter', () => {
    const full = buildCategoryPage(shell, { cat: 'design', items: [{ id: 'a1', title: 'أ' }, { id: 'b2', title: 'ب' }], site });
    const h = full.slice(0, full.indexOf('</head>'));
    assert.ok(h.includes(`href="${site}/c/design"`) && h.includes("filterByCategory('design')") && h.includes('"ItemList"'));
    assert.ok(!/name="robots" content="noindex/.test(h) && full.includes('href="/service/a1"'));
    const empty = buildCategoryPage(shell, { cat: 'design', items: [], site });
    assert.ok(/name="robots" content="noindex,follow"/.test(empty.slice(0, empty.indexOf('</head>'))));
});

test('sitemap: lists active stores, skips paused, survives store failure', async () => {
    const orig = globalThis.fetch;
    const doc = (id, f) => ({ document: { name: `projects/p/databases/(default)/documents/stores/${id}`, fields: f } });
    globalThis.fetch = async (u, o) => {
        const q = JSON.parse(o.body).structuredQuery.from[0].collectionId;
        if (q === 'blog_posts') return new Response('[]');
        if (q === 'services') return new Response(JSON.stringify([
            doc('v1', { title: { stringValue: 'خ' }, category: { stringValue: 'design' } }),
            doc('v2', { title: { stringValue: 'خ٢' }, category: { stringValue: 'bogus' } }),
            doc('v3', { title: { stringValue: ' ' }, category: { stringValue: 'video' } }),
        ]));
        return new Response(JSON.stringify([
            doc('s1', { name: { stringValue: 'A' }, updatedAt: { timestampValue: '2026-11-05T00:00:00Z' } }),
            doc('s2', { name: { stringValue: 'B' }, status: { stringValue: 'paused' } }),
            doc('s3', { name: { stringValue: ' ' } }),
        ]));
    };
    let xml = await (await sitemap({ env: {}, request: null })).text();
    assert.ok(xml.includes('/s/s1</loc><lastmod>2026-11-05</lastmod>'));
    assert.ok(!xml.includes('/s/s2') && !xml.includes('/s/s3'));
    assert.ok(xml.includes('/service/v1</loc>') && xml.includes('/service/v2</loc>') && !xml.includes('/service/v3'));
    assert.ok(xml.includes('/c/design</loc>') && !xml.includes('/c/bogus') && !xml.includes('/c/video'));
    globalThis.fetch = async (u, o) => ['stores', 'services'].includes(JSON.parse(o.body).structuredQuery.from[0].collectionId) ? new Response('x', { status: 500 }) : new Response('[]');
    const res = await sitemap({ env: {}, request: null });
    xml = await res.text();
    assert.ok(xml.includes('/blog/') && !xml.includes('/s/') && !xml.includes('/service/'));
    assert.equal(res.headers.get('Cache-Control'), 'public,max-age=300');
    globalThis.fetch = orig;
});
