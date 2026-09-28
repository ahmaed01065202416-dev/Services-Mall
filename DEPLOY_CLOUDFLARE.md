# نشر المشروع على Cloudflare Pages

المشروع ده بالكامل على **Cloudflare Pages** — الاستضافة، الـ API functions
(`functions/api/*.js`)، والـ headers/redirects. مفيش أي جزء منه على Netlify.

الجدولة اليومية (توليد مقالات، تحديث Quality Score، تحصيل الاشتراكات)
بتحصل عبر **Cloudflare Worker منفصل** في `cron-worker/` — لأن Cloudflare
Pages Functions مالهاش دعم Scheduled Functions، فاتعمل Worker صغير بيتنشر
لوحده وله Cron Trigger، وبينادي `/api/ai-generate` و`/api/quality-score`
و`/api/subscription` على نفس الموقع.

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
cd mall-v8
npx wrangler pages deploy . --project-name=mall-services
```

## 3. متغيرات البيئة (Environment Variables)
Cloudflare Dashboard → مشروعك → **Settings** → **Environment Variables**.
القايمة الكاملة مع الشرح في `.env.example` — أهمهم:

```
FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID, ...
FIREBASE_SERVICE_ACCOUNT   ← الـ service account JSON كامل على سطر واحد
GEMINI_API_KEY              ← لتوليد المقالات + مساعد كتابة الطلب بالـ AI
UNSPLASH_ACCESS_KEY         ← اختياري، لصور المقالات
FAWATERAK_API_KEY           ← بوابة الدفع الوحيدة في الموقع
SITE_URL / ALLOWED_ORIGINS  ← دومين موقعك على Cloudflare (مثال: https://mall-services.pages.dev)
ADMIN_SECRET                ← سر عشوائي قوي لحماية /api/ai-generate و /api/quality-score و /api/subscription
```
لازم تعمل **redeploy** بعد إضافة/تعديل المتغيرات عشان تتفعل.

## 4. نشر الـ Cron Worker (الجدولة اليومية)
```bash
cd cron-worker
npx wrangler login          # لو أول مرة
npx wrangler secret put ADMIN_SECRET     # نفس القيمة اللي حطيتها فوق
npx wrangler deploy
```
عدّل `SITE_URL` جوه `wrangler.toml` ليبقى دومين موقعك الفعلي على Cloudflare
قبل الـ deploy.

## 5. لو ربطت دومين مخصص (custom domain) لاحقاً
روابط الـ SEO (canonical, og:url, structured data) في `index.html` وصفحات
`blog/*`, `about`, `contact`, `privacy`, `terms` وملفات الـ sitemap متظبطة
حالياً على `mall-services.pages.dev`. لو غيّرت لدومين خاص، لازم تستبدلها
بيه في نفس الأماكن دي عشان الـ SEO يبقى صح. قولّي الدومين الجديد وأنا أعمل
find & replace شامل.

## 6. اختبار سريع بعد النشر
- `https://your-site.pages.dev/` — الصفحة الرئيسية
- `https://your-site.pages.dev/api/payment` (POST `{"action":"checkKeys"}`) — لازم يرجع JSON فيه `fawaterak_configured`
- `https://your-site.pages.dev/sitemap-live.xml` — لازم يرجع XML

## 7. Firebase Auth
لو بتستخدم Google Sign-in، ضيف دومين Cloudflare (أو الدومين المخصص) في:
Firebase Console → Authentication → Settings → Authorized domains.

## 8. لا تنسَ نشر قواعد الأمان
Cloudflare Pages بيستضيف الموقع بس — مش بينشر `firestore.rules` أو
`database.rules.json`. ده لازم يحصل يدوياً، منفصل تماماً. راجع `DEPLOY_RULES.md`.
