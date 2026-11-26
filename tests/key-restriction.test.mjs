// Run: node --test tests/key-restriction.test.mjs
// The Firebase web API key must be restrictable to "HTTP referrers" without breaking server-side login checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as gcp from '../functions/_shared/gcp.js';

test('verifyIdToken sends a Referer header (default site, or SITE_URL after a domain change)', async () => {
    assert.equal(typeof gcp.verifyIdToken, 'function', 'verifyIdToken must be exported for this test');
    const seen = [];
    globalThis.fetch = async (url, init) => { seen.push({ url: String(url), referer: init.headers.Referer }); return new Response(JSON.stringify({ users: [{ localId: 'u1', email: 'a@b.c', emailVerified: true }] })); };
    const u = await gcp.verifyIdToken('tok', {});
    assert.equal(u.uid, 'u1');
    assert.equal(seen[0].referer, 'https://mall-services.pages.dev/');
    await gcp.verifyIdToken('tok', { SITE_URL: 'https://new-shop.com/' });
    assert.equal(seen[1].referer, 'https://new-shop.com/');
});
