import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const created = []; let aiCalls = 0, sub = 0; const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  sub++; url = String(url);
  const J = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json' } });
  if (url.includes('oauth2.googleapis.com/token')) return J({ access_token: 'tok', expires_in: 3600 });
  if (url.includes('suggestqueries')) return J(['q', ['ربح من الانترنت للمبتدئين', 'ربح من الانترنت بدون رأس مال', 'طرق الربح من الانترنت في مصر']]);
  if (url.includes(':runQuery')) return J([{ document: { name: 'projects/p/databases/(default)/documents/blog_posts/old1', fields: { title: { stringValue: 'كيف تفتح متجر أونلاين' }, slug: { stringValue: 'متجر-اونلاين' }, category: { stringValue: 'عمل-حر' }, published: { booleanValue: true } } } }]);
  if (url.includes('/documents/blog_posts') && opts.method === 'POST') { const b = JSON.parse(opts.body); created.push(b); return J({ name: 'projects/p/databases/(default)/documents/blog_posts/NEW123', fields: b.fields }); }
  if (url.includes('api.unsplash.com/search')) return J({ results: [{ id: 'ph' + Math.random(), alt_description: 'desk', urls: { regular: 'https://images.unsplash.com/photo-1?ixid=x', small: 'https://images.unsplash.com/photo-1?w=400' }, user: { name: 'Sam', links: { html: 'https://unsplash.com/@sam' } }, links: { download_location: 'https://api.unsplash.com/photos/x/download' } }] });
  if (url.includes('/download')) return J({ url: 'x' });
  throw new Error('unmocked fetch ' + url);
};
const section = (n) => Array.from({ length: 4 }, (_, i) => `فقرة رقم ${i + 1} في القسم ${n}: بتبيع على فيسبوك وعايز عملاء يثقوا فيك؟ ابدأ بصور حقيقية وسعر واضح ورد سريع على واتساب وجرّب تطلب الدفع عن طريق إنستاباي مع ضمان للطرفين ${'كلمة '.repeat(18)}`).join('\n\n');
const env = {
  FIREBASE_PROJECT_ID: 'p', FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'a@b.c', private_key: privateKey }), UNSPLASH_ACCESS_KEY: 'k', SITE_URL: 'https://mall-services.pages.dev',
  AI: { run: async (model, input) => {
    aiCalls++; const u = input.messages[1].content;
    if (u.includes('أخرج JSON فقط بهذا الشكل')) return { response: JSON.stringify({ title: 'الربح من الانترنت للمبتدئين: دليل عملي من الصفر', primaryKeyword: 'الربح من الانترنت', slugWords: 'الربح من الانترنت للمبتدئين', metaDescription: 'دليل عملي بيشرح الربح من الانترنت للمبتدئين خطوة بخطوة مع أخطاء شائعة وأمثلة من السوق المصري.', category: 'ربح-من-الانترنت', coverQuery: 'freelancer laptop', sections: ['أول خطوة', 'الأخطاء الشائعة', 'ازاي تختار مجالك؟', 'كام تكلفة البداية', 'متى تتوقع أول دخل'].map((h, i) => ({ h2: h, points: ['أ', 'ب'], keywords: ['ربح من الانترنت بدون رأس مال'], imageQuery: 'online work ' + i })), faq: ['هل الربح حقيقي؟', 'أبدأ بكام؟', 'محتاج خبرة؟', 'أقدر أسحب ازاي؟'] }) };
    if (u.includes('اكتب مقدمة')) return { response: 'مقدمة أولى عن الربح من الانترنت للمبتدئين.\n\nوهنا الفقرة الثانية ' + 'كلمة '.repeat(70) };
    if (u.includes('أجب عن هذه الأسئلة')) return { response: 'إجابة أولى ' + 'نص '.repeat(40) + '\n===\nإجابة ثانية ' + 'نص '.repeat(40) + '\n===\nإجابة ثالثة ' + 'نص '.repeat(40) + '\n===\nإجابة رابعة ' + 'نص '.repeat(40) };
    if (u.includes('اكتب خاتمة')) return { response: 'ابدأ النهارده بخطوة واحدة صغيرة ' + 'نص '.repeat(40) };
    return { choices: [{ message: { content: section(aiCalls) } }] };
  } },
};
const mod = await import('../functions/_shared/seo-writer.js');
const { generateArticle, makeSlug, similarity, mdToHtml } = mod;

test('helpers: slug, similarity, safe markdown', () => {
  assert.equal(makeSlug('أفضل طرق الربح من الإنترنت للمبتدئين في مصر'), 'أفضل-طرق-الربح-من-الإنترنت-للمبتدئين');
  assert.ok(similarity('كيف تفتح متجر إلكتروني في مصر', 'طريقة فتح متجر الكتروني في مصر') >= 0.4);
  assert.ok(similarity('الربح من الانترنت', 'تصميم شعار احترافي') < 0.2);
  assert.ok(!mdToHtml('<script>alert(1)</script>').includes('<script>'));
  assert.equal(mdToHtml('- أ\n- ب'), '<ul><li>أ</li><li>ب</li></ul>');
});

test('generateArticle: Workers AI draft, keyword slug, images, FAQ, within subrequest budget', async () => {
  const r = await generateArticle(env, { topic: 'الربح من الانترنت', settings: { providerOrder: 'cloudflare,gemini', siteProfile: 'منصة' }, publish: false });
  const f = created[0].fields;
  assert.equal(r.published, false);
  assert.equal(f.published.booleanValue, false);
  assert.equal(f.needsReview.booleanValue, true);
  assert.equal(f.slug.stringValue, 'الربح-من-الانترنت-للمبتدئين');
  const html = f.content.stringValue;
  assert.equal((html.match(/<img /g) || []).length, 3);
  assert.equal((html.match(/<h3>/g) || []).length, 4);
  assert.ok(!/<script/i.test(html));
  assert.ok(sub <= 30, 'subrequests: ' + sub);
  globalThis.fetch = realFetch;
});
