// run: node --test tests/dropship-split.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSplit, minAllowedPrice, DEFAULT_DROPSHIP } from '../functions/_shared/dropship.js';

const fee10 = (base) => Number((base * 0.1).toFixed(2));
const ds = { ...DEFAULT_DROPSHIP };

test('marketer program is OFF by default', () => assert.equal(DEFAULT_DROPSHIP.MARKETER_PROGRAM_ENABLED, false));
test('dropship split: supplier wholesale, platform fee on margin, reseller the rest', () => {
    assert.deepEqual(computeSplit({ amount: 1000, supplierId: 's1', supplierAmount: 700 }, {}, ds, fee10), { supplierAmount: 700, platformFee: 30, sellerAmount: 270 });
});
test('split always sums back to the buyer payment', () => {
    const r = computeSplit({ amount: 1234.5, supplierId: 's1', supplierAmount: 800 }, {}, ds, fee10);
    assert.equal(Number((r.supplierAmount + r.platformFee + r.sellerAmount).toFixed(2)), 1234.5);
});
test('reseller never ends up negative', () => {
    const r = computeSplit({ amount: 700.5, supplierId: 's1', supplierAmount: 700 }, {}, { ...ds, DROPSHIP_FEE_BASE: 'total' }, fee10);
    assert.ok(r.sellerAmount >= 0);
});
test('selling price floor is above wholesale', () => assert.ok(minAllowedPrice(700, ds) > 700));
