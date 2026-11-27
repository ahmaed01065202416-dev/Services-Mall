// Home page SEO: keywords reflect real features, FAQ JSON-LD matches the visible FAQ, payment wording is NOT added (deferred).
import assert from 'node:assert/strict';
import fs from 'node:fs';
const h = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const kw = (/<meta name="keywords" content="([^"]*)"/.exec(h) || [])[1] || '';
for (const k of ['مصمم جرافيك', 'مبرمج مواقع', 'قوالب سوشيال ميديا', 'سكريبتات برمجية', 'افتح متجرك الإلكتروني', 'لوحة تحكم المتجر', 'إدارة الطلبات', 'freelance marketplace Egypt', 'digital products Egypt'])
  assert.ok(kw.includes(k), 'missing keyword: ' + k);
// payment-related terms are intentionally NOT part of this change
for (const k of ['ضمان الدفع', 'الدفع الآمن', 'محفظة إلكترونية', 'الدفع بالجنيه']) assert.ok(!kw.includes(k), 'payment keyword must wait: ' + k);
// features the site does not have must not be claimed
for (const k of ['كورسات', 'كتب إلكترونية']) assert.ok(!kw.includes(k), 'unverified feature claimed: ' + k);
// FAQPage JSON-LD <-> visible text
const lds = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
const faq = lds.find(j => j['@type'] === 'FAQPage'); assert.ok(faq, 'FAQPage missing');
const text = h.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
assert.equal(faq.mainEntity.length, 6);
for (const q of faq.mainEntity) { assert.ok(text.includes(q.name), 'question not visible: ' + q.name); assert.ok(text.includes(q.acceptedAnswer.text), 'answer not visible: ' + q.name); }
assert.equal((h.match(/class="faq-item"/g) || []).length, 6);
const org = lds.find(j => j['@type'] === 'Organization');
assert.ok(org.knowsAbout.length >= 5 && org.hasOfferCatalog.itemListElement.length === 2);
assert.equal((h.match(/<h1\b/g) || []).length >= 1, true);
console.log('home-seo: ok');
