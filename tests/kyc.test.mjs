// Seller identity verification — validation + hashing helpers (functions/api/kyc.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { validNationalId, validPhone, hmacHex, validateSubmission } from '../functions/api/kyc.js';

const img = 'data:image/jpeg;base64,' + 'A'.repeat(200);
const good = { fullName: 'احمد محمد علي', nationalId: '29901011234567', phone: '01012345678', address: 'القاهرة مدينة نصر شارع 10', consent: true, front: img, back: img, selfie: img };

test('national id: 14 digits, century 2/3, valid month/day', () => {
  assert.equal(validNationalId('29901011234567'), '29901011234567');
  assert.equal(validNationalId('19901011234567'), null);
  assert.equal(validNationalId('29913011234567'), null);
  assert.equal(validNationalId('2990101123456'), null);
});
test('phone: Egyptian mobile numbers, +20 accepted', () => {
  assert.equal(validPhone('+201012345678'), '01012345678');
  assert.equal(validPhone('0131234567'), null);
});
test('id hash is keyed and deterministic (never the clear number)', async () => {
  const a = await hmacHex('k1', '29901011234567');
  assert.equal(a, await hmacHex('k1', '29901011234567'));
  assert.notEqual(a, await hmacHex('k2', '29901011234567'));
  assert.match(a, /^[0-9a-f]{64}$/);
});
test('submission: needs consent, 3 real image data URLs, sane size, sanitised name', () => {
  assert.ok(validateSubmission(good).ok);
  assert.ok(validateSubmission({ ...good, consent: false }).error);
  assert.ok(validateSubmission({ ...good, front: 'https://x.com/a.jpg' }).error);
  assert.ok(validateSubmission({ ...good, back: 'data:image/svg+xml;base64,AAAA' }).error);
  assert.ok(validateSubmission({ ...good, selfie: 'data:image/jpeg;base64,' + 'A'.repeat(950000) }).error);
  const r = validateSubmission({ ...good, fullName: '<b>احمد</b> محمد علي' });
  assert.ok(r.ok && !r.ok.fullName.includes('<'));
});
