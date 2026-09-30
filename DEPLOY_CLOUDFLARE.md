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

⚠️ **مهم:** حطّ نفس المتغيرات في تبويب **Production** و **Preview**، أو على الأقل
في الـ environment اللي بتنشر عليه. والمتغيرات متحطّيش في ملف `.env` جوه المشروع —
Cloudflare Pages بيقراها من الـ dashboard بس.

القائمة الكاملة بالشرح وشكل كل قيمة في **`.env.example`** (الملف ده موجود فعلاً
دلوقتي). أهم المتغيرات:

```
FIREBASE_PROJECT_ID         ← services-mall  (مش mall-services! دومين الموقع
                               اسمه mall-services.pages.dev والكلمتين معكوستين،
                               وده أشهر غلطة — بتخلي كل قراءة Firestore من
                               السيرفر ترجع "not found" بصمت)
FIREBASE_SERVICE_ACCOUNT    ← ★ الأهم: JSON كامل لمفتاح service account في سطر
                               واحد (Firebase Console → Service accounts →
                               Generate new private key). من غيره مفيش أي
                               function يقدر يقرأ أو يكتب في Firestore.
FIREBASE_WEB_API_KEY        ← اختياري، عنده قيمة افتراضية مدمجة في gcp.js
SITE_URL                    ← دومين واحد بس، بدون slash أخير
                               https://mall-services.pages.dev
ALLOWED_ORIGINS             ← قائمة origins مفصولة بفاصلة (مش دومين واحد)
                               https://mall-services.pages.dev
ADMIN_SECRET                ← سر عشوائي طويل (ولّده بالأمر:
                               node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
                               من غيره الـ cron كله بيرجع 401)
ADMIN_UIDS                  ← UIDs الأدمن مفصولة بفاصلة (اختياري لو role=='admin')
GEMINI_API_KEY              ← لتوليد المقالات + مساعد كتابة الطلب بالـ AI
OPENAI_API_KEY              ← بديل Gemini (اختياري)
UNSPLASH_ACCESS_KEY         ← اختياري، لصور المقالات
FAWATERAK_API_KEY           ← بوابة الدفع الوحيدة في الموقع
FAWATERAK_BASE_URL          ← اختياري، افتراضي https://app.fawaterk.com
ALLOW_SIMULATED_PAYMENTS    ← false في production. قيمة true معناها دفع وهمية
                               بتتسجّل كأنها نجحت من غير فلوس حقيقية — متحطّهاش
                               غير على بيانات تجريبية.
FIREBASE_DATABASE_URL       ← اختياري، له افتراضي مبني من project id
```

**مش متغيرات بيئة:** إعدادات Firebase العميلة (`apiKey`, `authDomain`,
`projectId`, `storageBucket`, `messagingSenderId`, `appId`, `databaseURL`).
دي مكتوبة جوه كود `index.html` في الكائن `FIREBASE_CONFIG` (سطر ~1579) لأن
المتصفح محتاج يقراها وقت التشغيل.

**مش مستخدم:** `FIREBASE_ACCESS_TOKEN` — كان الخطأ القديم في `ai-generate.js`
(متغير ماكانش متظبط أبداً، فكل مقال بيتولّد كان الـ rules بيرفض كتابته بصمت).
اتشال بالكامل. و`KASHIER_API_KEY` متاح بس الـ endpoint بيرمي استثناء لحد ما
تكمل `handleKashier()` من توثيق لوحة التاجر.

⚠️ لازم تعمل **redeploy** بعد إضافة/تعديل أي متغير عشان تتفعل.

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
