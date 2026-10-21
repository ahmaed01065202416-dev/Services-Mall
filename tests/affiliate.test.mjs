// run: node --test tests/affiliate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAff, computeOrderFee, accessStatus, counterField, parseTiers, DEFAULT_AFF } from '../functions/_shared/affiliate.js';

test('everything is OFF by default', () => {
    const c = normalizeAff(null);
    assert.equal(c.AFF_ENABLED, false); assert.equal(c.AFF_FEE_ENABLED, false);
    assert.equal(c.AFF_SUB_ENABLED, false); assert.equal(c.AFF_SUB_REQUIRED, false);
});
test('fee disabled → always 0', () => assert.equal(computeOrderFee(normalizeAff({ AFF_FEE_FIXED: 5 }), 0), 0));
test('fixed fee', () => assert.equal(computeOrderFee(normalizeAff({ AFF_FEE_ENABLED: true, AFF_FEE_FIXED: 2.5 }), 99), 2.5));
test('tiers: first 50 free, then 2', () => {
    const c = normalizeAff({ AFF_FEE_ENABLED: true, AFF_FEE_MODE: 'tiers', AFF_FEE_TIERS: '[{"upTo":50,"fee":0},{"upTo":null,"fee":2}]' });
    assert.equal(computeOrderFee(c, 0), 0);    // order #1
    assert.equal(computeOrderFee(c, 49), 0);   // order #50
    assert.equal(computeOrderFee(c, 50), 2);   // order #51
    assert.equal(computeOrderFee(c, 500), 2);
});
test('tiers: three levels, unsorted input is sorted', () => {
    const c = normalizeAff({ AFF_FEE_ENABLED: true, AFF_FEE_MODE: 'tiers', AFF_FEE_TIERS: [{ upTo: null, fee: 1 }, { upTo: 100, fee: 3 }, { upTo: 10, fee: 5 }] });
    assert.equal(computeOrderFee(c, 0), 5); assert.equal(computeOrderFee(c, 10), 3); assert.equal(computeOrderFee(c, 100), 1);
});
test('broken tiers JSON falls back to defaults', () => assert.deepEqual(parseTiers('not json'), parseTiers(DEFAULT_AFF.AFF_FEE_TIERS)));
test('counter field follows the period', () => {
    const d = new Date(Date.UTC(2026, 9, 19));
    assert.equal(counterField(normalizeAff({}), d), 'cnt_2026_10');
    assert.equal(counterField(normalizeAff({ AFF_TIER_PERIOD: 'lifetime' }), d), 'cnt_all');
});
test('subscription NOT required by default — expired sub does not block', () => {
    assert.equal(accessStatus(normalizeAff({ AFF_SUB_ENABLED: true }), {}).ok, true);
});
test('subscription required only when admin enables both switches', () => {
    const req = normalizeAff({ AFF_SUB_ENABLED: true, AFF_SUB_REQUIRED: true });
    assert.equal(accessStatus(req, {}).reason, 'subscription');
    assert.equal(accessStatus(req, { subscriptionUntil: new Date(Date.now() + 86400000) }).ok, true);
    assert.equal(accessStatus(normalizeAff({ AFF_SUB_ENABLED: false, AFF_SUB_REQUIRED: true }), {}).ok, true);   // required without enabled = ignored
});
test('debt limit blocks at the limit; 0 means no limit', () => {
    const c = normalizeAff({ AFF_DEBT_LIMIT: 100 });
    assert.equal(accessStatus(c, { owed: 99.99 }).ok, true);
    assert.equal(accessStatus(c, { owed: 100 }).reason, 'debt');
    assert.equal(accessStatus(normalizeAff({ AFF_DEBT_LIMIT: 0 }), { owed: 99999 }).ok, true);
});
