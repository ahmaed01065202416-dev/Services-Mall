// Run: node --test tests/api-guard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { apiGuard, onRequest } from '../functions/_middleware.js';
const req = (path, { ip = '5.5.5.5', method = 'POST', len } = {}) => new Request('https://x.dev' + path, { method, headers: { 'CF-Connecting-IP': ip, ...(len ? { 'Content-Length': String(len) } : {}) } });

test('payment: 60/min per IP then 429 with Retry-After; another IP is unaffected', () => {
    let last; for (let i = 0; i < 61; i++) last = apiGuard(req('/api/payment', { ip: '6.6.6.6' }), '/api/payment');
    assert.equal(last.status, 429); assert.equal(last.headers.get('Retry-After'), '60');
    assert.equal(apiGuard(req('/api/payment', { ip: '7.7.7.7' }), '/api/payment'), null);
});
test('webhooks, cached feeds and analytics are never limited here', () => {
    for (const p of ['/api/kashier-webhook', '/api/fawaterak-webhook', '/api/home-feed', '/api/analytics'])
        for (let i = 0; i < 500; i++) assert.equal(apiGuard(req(p, { ip: '8.8.8.8' }), p), null, p);
});
test('OPTIONS preflight is never counted; oversized body → 413', () => {
    for (let i = 0; i < 500; i++) assert.equal(apiGuard(req('/api/payment', { ip: '9.9.9.9', method: 'OPTIONS' }), '/api/payment'), null);
    assert.equal(apiGuard(req('/api/kyc', { ip: '4.4.4.4', len: 9 * 1024 * 1024 }), '/api/kyc').status, 413);
});
test('blocked dev files still 404 and normal api calls pass through to next()', async () => {
    const r = await onRequest({ request: req('/README.md', { method: 'GET' }), env: {}, next: async () => new Response('x') });
    assert.equal(r.status, 404);
    const ok = await onRequest({ request: req('/api/stores', { ip: '3.3.3.3' }), env: {}, next: async () => new Response('{"a":1}') });
    assert.equal(ok.status, 200);
});
