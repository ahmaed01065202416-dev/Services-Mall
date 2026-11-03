// Coupons & discounts — validation + money model (functions/_shared/coupons.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { priceWithCoupons, validateCouponInput, couponBlockReason, normCode, distribute } from '../functions/_shared/coupons.js';

// platform fee: 5% on the buyer side and 5% on the seller side (the project defaults)
const fees = { buyerFee: (a) => Math.round(a * 5) / 100, sellerFee: (a) => Math.round(a * 5) / 100 };
const L = (key, sellerId, price, shipOnline = 0, extra = {}) => ({ key, sellerId, price, shipOnline, ...extra });

test('no coupons: total = price + buyer fee (same as before the feature)', () => {
  const r = priceWithCoupons({ lines: [L(0, 's1', 200)], fees });
  assert.equal(r.priceSum, 200); assert.equal(r.buyerFee, 10); assert.equal(r.total, 210);
  assert.equal(r.storeDiscount, 0); assert.equal(r.platformDiscount, 0); assert.equal(r.applied.length, 0);
});

test('store coupon lowers the price the MERCHANT receives (escrow) and the buyer fee is on the discounted price', () => {
  const c = { id: 'c1', scope: 'store', sellerId: 's1', code: 'S10', type: 'percent', value: 10 };
  const r = priceWithCoupons({ lines: [L(0, 's1', 200)], storeCoupons: [c], fees });
  assert.equal(r.lines[0].price, 180); assert.equal(r.lines[0].storeDiscount, 20);
  assert.equal(r.buyerFee, 9); assert.equal(r.total, 189);
});

test('store coupon only touches that merchant\'s lines in a mixed cart', () => {
  const c = { id: 'c1', scope: 'store', sellerId: 's1', code: 'S10', type: 'fixed', value: 30 };
  const r = priceWithCoupons({ lines: [L(0, 's1', 100), L(1, 's1', 200), L(2, 's2', 500)], storeCoupons: [c], fees });
  assert.equal(r.lines[2].price, 500);
  assert.equal(r.lines[0].storeDiscount + r.lines[1].storeDiscount, 30);
  assert.equal(r.lines[0].storeDiscount, 10); assert.equal(r.lines[1].storeDiscount, 20);
});

test('best single discount per merchant (automatic vs code are not stacked)', () => {
  const auto = { id: 'a', scope: 'store', sellerId: 's1', auto: true, type: 'percent', value: 5, title: 'خصم' };
  const code = { id: 'b', scope: 'store', sellerId: 's1', code: 'BIG', type: 'percent', value: 20 };
  const r = priceWithCoupons({ lines: [L(0, 's1', 100)], storeCoupons: [auto, code], fees });
  assert.equal(r.storeDiscount, 20); assert.equal(r.applied.length, 1); assert.equal(r.applied[0].code, 'BIG');
});

test('minOrder is checked per merchant; a coupon can never make an item free', () => {
  const c = { id: 'c', scope: 'store', sellerId: 's1', code: 'X', type: 'fixed', value: 500, minOrder: 150 };
  assert.equal(priceWithCoupons({ lines: [L(0, 's1', 100)], storeCoupons: [c], fees }).storeDiscount, 0);
  const r = priceWithCoupons({ lines: [L(0, 's1', 200)], storeCoupons: [c], fees });
  assert.equal(r.storeDiscount, 180);               // capped at 90 % of the price
  assert.ok(r.lines[0].price > 0 && r.total > 0);
});

test('platform coupon is paid from the buyer-side percentage the platform takes: merchant escrow unchanged, discount capped at the buyer fee', () => {
  const p = { id: 'p', scope: 'platform', code: 'MALL20', type: 'percent', value: 20 };
  const r = priceWithCoupons({ lines: [L(0, 's1', 200)], platformCoupon: p, fees });
  // buyer fee = 5% of 200 = 10 → the 20% (=40) coupon is capped at 10
  assert.equal(r.platformDiscount, 10); assert.equal(r.applied[0].cappedByCommission, true);
  assert.equal(r.lines[0].price, 200);                              // merchant still gets the full price (minus his own fee later)
  assert.equal(r.total, 200);                                       // 200 + 10 − 10: the buyer never pays less than the escrow
  assert.ok(r.total >= r.priceSum + r.shipSum);
  assert.equal('couponGap' in r, false);
});

test('platform coupon smaller than the buyer fee is applied in full', () => {
  const p = { id: 'p', scope: 'platform', code: 'SMALL', type: 'fixed', value: 4 };
  const r = priceWithCoupons({ lines: [L(0, 's1', 200)], platformCoupon: p, fees });
  assert.equal(r.platformDiscount, 4); assert.equal(r.total, 206); assert.equal(r.applied[0].cappedByCommission, false);
});

test('buyer fee switched off → a platform coupon gives nothing (there is no percentage to pay it from)', () => {
  const p = { id: 'p', scope: 'platform', code: 'P', type: 'fixed', value: 15 };
  const r = priceWithCoupons({ lines: [L(0, 's1', 200)], platformCoupon: p, fees: { buyerFee: () => 0 } });
  assert.equal(r.platformDiscount, 0); assert.equal(r.total, 200); assert.ok(r.notes.includes('no_commission'));
});

test('store + platform can both apply; platform discount is computed on the discounted price', () => {
  const s = { id: 's', scope: 'store', sellerId: 's1', auto: true, type: 'percent', value: 50, title: 'نص السعر' };
  const p = { id: 'p', scope: 'platform', code: 'P', type: 'percent', value: 4 };
  const r = priceWithCoupons({ lines: [L(0, 's1', 200)], storeCoupons: [s], platformCoupon: p, fees });
  assert.equal(r.priceSum, 100); assert.equal(r.platformDiscount, 4); assert.equal(r.total, 100 + 5 - 4);
});

test('platform discount is spread over lines and sums back exactly', () => {
  const p = { id: 'p', scope: 'platform', code: 'P', type: 'fixed', value: 100 };
  const r = priceWithCoupons({ lines: [L(0, 'a', 100), L(1, 'b', 50), L(2, 'c', 50)], platformCoupon: p, fees });
  assert.equal(Math.round(r.lines.reduce((a, l) => a + l.platformDiscount, 0) * 100) / 100, r.platformDiscount);
  assert.equal(r.platformDiscount, 10);                             // buyer fee on 200
});

test('distribute keeps the exact total', () => {
  const d = distribute(10, [1, 1, 1]);
  assert.equal(Math.round(d.reduce((a, b) => a + b, 0) * 100) / 100, 10);
});

test('block reasons: cancelled / admin-paused / paused / expired / exhausted / not started', () => {
  const now = Date.now();
  assert.equal(couponBlockReason({ active: true }), null);
  assert.equal(couponBlockReason({ cancelled: true }), 'cancelled');
  assert.equal(couponBlockReason({ active: true, disabledByAdmin: true }), 'disabled_by_admin');
  assert.equal(couponBlockReason({ active: false }), 'inactive');
  assert.equal(couponBlockReason({ expiresAt: new Date(now - 1000) }, now), 'expired');
  assert.equal(couponBlockReason({ startsAt: new Date(now + 100000) }, now), 'not_started');
  assert.equal(couponBlockReason({ usageLimit: 5, usageCount: 5 }), 'exhausted');
  assert.equal(couponBlockReason({ usageLimit: 0, usageCount: 99 }), null);           // 0 = unlimited (legacy coupons too)
});

test('input validation', () => {
  assert.ok(validateCouponInput({ code: ' sale10 ', type: 'percent', value: 10 }, { scope: 'store' }).ok);
  assert.equal(validateCouponInput({ code: 'sale10', type: 'percent', value: 10 }, { scope: 'store' }).ok.code, 'SALE10');
  assert.ok(validateCouponInput({ code: 'ab', type: 'percent', value: 10 }, { scope: 'store' }).error);
  assert.ok(validateCouponInput({ code: 'ABC', type: 'percent', value: 95 }, { scope: 'store' }).error);
  assert.ok(validateCouponInput({ code: 'ABC', type: 'fixed', value: -5 }, { scope: 'store' }).error);
  assert.ok(validateCouponInput({ type: 'percent', value: 10, auto: true }, { scope: 'store' }).error);         // auto needs a title
  assert.ok(validateCouponInput({ type: 'percent', value: 10, auto: true, title: 'خصم الموسم' }, { scope: 'store' }).ok.auto);
  assert.equal(validateCouponInput({ type: 'percent', value: 10, auto: true, title: 'x' }, { scope: 'platform' }).error !== undefined, true); // platform needs a code
  assert.ok(validateCouponInput({ code: 'ABC', type: 'fixed', value: 5, startsAt: '2026-01-10', expiresAt: '2026-01-01' }, { scope: 'store' }).error);
  assert.equal(normCode('  a-b_c d!'), 'A-B_CD');
});
