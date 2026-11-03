import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, dayDiff, dayMinus, recordDay, retention, visitorSplit, customerStats, compareStores, funnel } from '../functions/_shared/analytics.js';

const D = (k) => new Date(Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8), 12)).getTime();

test('days: Cairo day key, diff and minus', () => {
  assert.equal(dayKey(Date.UTC(2026, 10, 3, 12)), '20261103');
  assert.equal(dayKey(Date.UTC(2026, 10, 3, 23, 30)), '20261104');          // 01:30 in Cairo already next day
  assert.equal(dayDiff('20261030', '20261103'), 4);
  assert.equal(dayMinus('20261103', 5), '20261029');
  assert.equal(dayDiff('20261231', '20270101'), 1);
});

test('recordDay: first visit, same day, new day', () => {
  assert.deepEqual(recordDay([], '20261103'), { days: ['20261103'], isNewVisitor: true, isNewDay: true });
  assert.deepEqual(recordDay(['20261103'], '20261103'), { days: ['20261103'], isNewVisitor: false, isNewDay: false });
  const r = recordDay(['20261101'], '20261103'); assert.equal(r.isNewDay, true); assert.equal(r.isNewVisitor, false); assert.deepEqual(r.days, ['20261101', '20261103']);
});

test('retention: within 1 / 7 / 30 days, only visitors old enough count', () => {
  const today = '20261130';
  const rows = [
    { days: ['20261101', '20261102'] },            // back after 1 day  → in 1, 7, 30
    { days: ['20261101', '20261106'] },            // back after 5 days → in 7, 30
    { days: ['20261101'] },                        // never back
    { days: ['20261120', '20261121'] },            // first 10 days ago: eligible for 1 and 7, not 30
    { days: ['20261129'] },                        // first yesterday: eligible for 1 only
  ];
  const r = retention(rows, today);
  // 1 day: all 5 are old enough, 2 came back within a day · 7 days: first four, 3 came back · 30 days: nobody is 30 days old yet
  assert.deepEqual(r.map((x) => [x.eligible, x.returned]), [[5, 2], [4, 3], [0, 0]]);
  assert.equal(r[0].rate, 40); assert.equal(r[2].rate, null);
});

test('visitorSplit: new vs returning inside the period', () => {
  const today = '20261130';
  const s = visitorSplit([{ days: ['20261128'] }, { days: ['20261110', '20261129'] }, { days: ['20260901', '20261129'] }, { days: ['20260101'] }], today, 30);
  assert.deepEqual(s, { total: 3, new: 1, returning: 2 });
});

const order = (buyerId, sellerId, day, price = 100, extra = {}) => ({ buyerId, sellerId, price, paymentStatus: 'paid', status: 'completed', createdAt: D(day), ...extra });

test('customerStats: repeat buyers, average gap, ignores unpaid/refunded/cancelled', () => {
  const orders = [order('u1', 's', '20261001'), order('u1', 's', '20261011'), order('u1', 's', '20261031'), order('u2', 's', '20261005'),
    order('u3', 's', '20261006', 100, { status: 'refunded' }), order('u4', 's', '20261006', 100, { paymentStatus: 'pending' })];
  const c = customerStats(orders);
  assert.equal(c.buyers, 2); assert.equal(c.repeatBuyers, 1); assert.equal(c.repeatRate, 50);
  assert.equal(c.avgGapDays, 15);                          // (10 + 20) / 2
  assert.equal(c.top[0].buyerId, 'u1'); assert.equal(c.top[0].orders, 3);
  assert.ok(c.buyerIds.has('u2') && !c.buyerIds.has('u3'));
});

test('compareStores: one row per merchant', () => {
  const rows = compareStores([order('a', 's1', '20261001'), order('a', 's1', '20261002'), order('b', 's2', '20261001')]);
  assert.equal(rows.length, 2); assert.equal(rows[0].sellerId, 's1'); assert.equal(rows[0].repeatRate, 100); assert.equal(rows[1].repeatRate, 0);
});

test('funnel: anonymous / account / bought', () => {
  const f = funnel([{ uid: 'u1' }, { uid: 'u2' }, {}, {}], new Set(['u1']));
  assert.deepEqual(f, { visitors: 4, withAccount: 2, bought: 1, anonymous: 2, accountNoPurchase: 1 });
});
