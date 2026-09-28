# نشر المشروع على Cloudflare Pages

تم تحويل المشروع بالكامل من Netlify إلى Cloudflare Pages. ملخص اللي اتغير:

| القديم (Netlify)                          | الجديد (Cloudflare)                          |
|--------------------------------------------|-----------------------------------------------|
| `netlify/functions/payment.js`             | `functions/api/payment.js`                    |
| `netlify/functions/ai-generate.js`         | `functions/api/ai-generate.js`                |
| `netlify/functions/sitemap-dynamic.js`     | `functions/api/sitemap-dynamic.js`             |
| `netlify/functions/ai-daily-cron.js`       | `cron-worker/` (Worker منفصل بـ Cron Trigger)  |
| `netlify.toml` (headers + redirects)       | `_headers` + `_redirects`                      |
| `netlify.toml` (env vars)                  | Cloudflare Dashboard → Settings → Env Vars     |

الفرونت إند (`js/payment-system.js`, `js/dashboard.js`, `index.html`) لسه بينادي
`/.netlify/functions/...` — سيبتها زي ما هي عمدًا، وعملت `_redirects` تحوّلها
تلقائيًا لـ `/api/...`. الموقع هيشتغل من غير ما تلمس أي سطر فرونت إند.

⚠️ **ملاحظة عن الـ Cron**: Cloudflare Pages Functions مالهاش دعم Scheduled
Functions زي Netlify. عشان كده اتعمل `cron-worker/` منفصل — Worker صغير بيتنشر
لوحده وله Cron Trigger، وبينادي `/api/ai-generate` على نفس الموقع.

---

## 1. تجهيز حساب Cloudflare
لو معاك حساب بالفعل تخطى الخطوة دي. لو لأ: [dash.cloudflare.com](https://dash.cloudflare.com) → إنشاء حساب مجاني.

## 2. نشر الموقع (Pages) — اختار طريقة واحدة

### الطريقة أ: من خلال GitHub (الأسهل للتحديثات المستقبلية)
1. ارفع المشروع ده على مستودع GitHub.
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. اختار المستودع. الإعدادات:
   - **Build command**: سيبها فاضية
   - **Build output directory**: `/`
4. Deploy.

### الطريقة ب: مباشرة من جهازك (Wrangler CLI)
```bash
npm install -g wrangler
wrangler login
cd mall-v6-final
npx wrangler pages deploy . --project-name=mall-services
```

## 3. متغيرات البيئة (Environment Variables)
Cloudflare Dashboard → مشروعك → **Settings** → **Environment Variables**، وضيف
نفس المتغيرات اللي كانت في Netlify (شوف `.env.example`):

```
FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID, ...
GEMINI_API_KEY
PAYMOB_API_KEY, PAYMOB_INTEGRATION_ID, PAYMOB_IFRAME_ID, PAYMOB_HMAC_SECRET
FAWRY_MERCHANT_CODE, FAWRY_SECURITY_KEY
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MODE
ALLOWED_ORIGINS   ← حط دومين الموقع بتاعك على Cloudflare (مثال: https://mall-services.pages.dev)
ADMIN_SECRET      ← سر عشوائي قوي لحماية /api/ai-generate
```
لازم تعمل **redeploy** بعد إضافة/تعديل المتغيرات عشان تتفعل.

## 4. نشر الـ Cron Worker (لتوليد المقالات اليومي)
```bash
cd cron-worker
npx wrangler login          # لو أول مرة
npx wrangler secret put ADMIN_SECRET     # نفس القيمة اللي حطيتها فوق
npx wrangler deploy
```
عدّل `SITE_URL` جوه `wrangler.toml` ليبقى دومين موقعك الفعلي على Cloudflare
قبل الـ deploy.

## 5. حاجات لازم تحدّثها يدويًا بعد ما ياخد دومين نهائي
فيه روابط `services-mall2.netlify.app` مكتوبة داخل:
- `index.html` (canonical, og:url, structured data)
- `sitemap.xml`, `sitemap-main.xml`, `blog-sitemap.xml`
- صفحات `blog/*`, `about`, `contact`, `privacy`, `terms`

دي روابط SEO/meta بس، مش هتكسر وظيفة الموقع، بس لازم تستبدلها بدومينك
الجديد (custom domain لو ربطته، أو `xxx.pages.dev`) عشان الـ SEO يبقى صح.
لو حابب أعمل find & replace شامل لما تديني الدومين النهائي، قولي وأنا أعملها.

## 6. اختبار سريع بعد النشر
- `https://your-site.pages.dev/` — الصفحة الرئيسية
- `https://your-site.pages.dev/api/payment` (POST `{"action":"checkKeys"}`) — لازم يرجع JSON
- `https://your-site.pages.dev/sitemap-live.xml` — لازم يرجع XML

## 7. Firebase Auth
لو بتستخدم Google Sign-in، ضيف دومين Cloudflare الجديد في:
Firebase Console → Authentication → Settings → Authorized domains.

---
النسخة الأصلية بتاعة Netlify (`netlify.toml`, `netlify/functions/`) موجودة
محفوظة في `_legacy-netlify/` للرجوع ليها لو احتجت.
