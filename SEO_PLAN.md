# إصلاحات فهرسة جوجل — ملخص + خطط

## 1) الملفات اللي اتغيّرت (كلها كاملة جوه الـ zip)

| النقطة | الملف | التغيير |
|---|---|---|
| 1 | `functions/api/sitemap-dynamic.js` | fallback للدومين الصح، تسجيل أخطاء Firestore بدل `[]` الصامت |
| 2 | `index.html` | safety timeout 4 ث لشاشة التحميل + `preconnect` لـ gstatic |
| 3 | `functions/blog/[slug].js` (جديد) | 404 حقيقي للـ slug الغلط + canonical/og/twitter/JSON-LD Article من السيرفر |
| 3 | `_routes.json` | إضافة `/blog/*` |
| 3, 4, 5, 7 | `_redirects` | شيل قاعدة `/blog/:slug` وقاعدة `/* → /index.html`، إضافة 301 لـ `blog-sitemap.xml` و`refund-policy.html` |
| 5 | `functions/api/sitemap-dynamic.js` | sitemap-live = منطقة المدونة بس (مقالات ثابتة بتواريخها + مقالات AI بتاريخها الحقيقي) |
| 5 | `robots.txt`, `sitemap.xml`, `sitemap-main.xml` | تنضيف، شيل Crawl-delay وhreflang، تواريخ حقيقية |
| 5 | `blog-sitemap.xml` | اتحذف (301 على sitemap-live.xml) |
| 6 | `index.html` | شيل `SearchAction` |
| 7 | `refund-policy/index.html` (جديد), `refund-policy.html` (اتحذف) | canonical ذاتي + description + روابط داخلية محدّثة |
| 7 | `privacy.html`, `terms.html` | `noindex` + canonical (اتسابوا عشان فيهم نص بتاريخ أحدث، شوف التنبيه تحت) |
| 7 | `tailwind.config.js` | سطر `content` بس (`refund-policy/**`). **`css/tailwind.css` ما اتلمسش** |
| 8 | `index.html` | `h1` واحد (الرئيسية) والباقي `h2` + `<noscript>` فيه وصف وروابط |

**ما اتلمسش:** `wrangler.toml`، `css/tailwind.css`، الدفع/escrow، `firestore.rules`، المقالات الثابتة العشرة، `cron-worker/*`.

## 2) تنبيهات تحتاج قرارك
1. **نص الخصوصية والشروط:** الصفحتين اللي بتتخدموا فعليًا (`/privacy`, `/terms`) مكتوب فيهم «آخر تحديث: 21 مايو 2025» وهم الأكمل (10 و13 بند). النسخ القديمة (`privacy.html`, `terms.html`) مكتوب فيها «أغسطس 2026» وأقصر. اتسابوا بـ noindex بدل الحذف عشان ما نضيّعش نص قانوني. راجعهم وقرر النص الصح وحدّث تاريخه.
2. **`SITE_URL`:** ما عدّلتش `wrangler.toml`. لو عايزه صريح ضيفه من Cloudflare Dashboard ← Environment variables (الكود شغال من غيره).
3. **`cron-worker/index.js` سطر 24:** لسه فيه `your-site.pages.dev` (خارج النقط). بيتحل لو `SITE_URL` متضبط في `cron-worker/wrangler.toml` (متضبط فعلًا). لو عايز أشيل الـ placeholder قولي.
4. **`defer` لسكريبتات Firebase والـ js/*:** رأيي **ما يتطبقش**. فيه 3 سكريبتات inline بين السكريبتات الخارجية (أولهم تهيئة Firebase) وبتستخدم متغيرات عامة من `js/*` فورًا؛ `defer` هيخلي الـ inline يشتغل قبلهم ويكسر التطبيق. البديل الآمن اللي اتطبق: `preconnect` + safety timeout. وفرصة تحسين لاحقة: SDK الـ Storage متحمّل ومش مستخدم في الكود (هنوفّر طلب render-blocking لو اتشال، محتاج اختبار).
5. **شاشة التحميل في وضع الصيانة:** لو Firebase اتأخر أكتر من 4 ثواني، الشاشة هتتشال قبل ما بوابة الصيانة تتفعّل، فممكن الزائر يشوف الموقع لحظات قبل رسالة الصيانة.
6. **صفحة الاسترجاع:** حطيتها في الـ sitemap من غير `lastmod` لأن الصفحة مكتوب فيها «أغسطس 2026» بس من غير يوم؛ مفيش تاريخ حقيقي أدّعيه.
7. **sitemap-live من غير `lastmod` في الـ index:** لأنه بيتولّد وقت الطلب؛ مفيش تاريخ ثابت صادق. التواريخ جوه الملف نفسه حقيقية.

## 3) خطوات بعد النشر (اتأكد بنفسك)
```bash
# 1) المقال الغلط = 404 حقيقي، والثابت = 200
curl -s -o /dev/null -w "%{http_code}\n" https://mall-services.pages.dev/blog/slug-mesh-mawgood      # 404
curl -s -o /dev/null -w "%{http_code}\n" https://mall-services.pages.dev/blog/escrow-payment-protection # 200
# 2) أي رابط عشوائي = 404 (مش 200)
curl -s -o /dev/null -w "%{http_code}\n" https://mall-services.pages.dev/anything-random              # 404
# 3) الـ sitemaps
curl -s https://mall-services.pages.dev/sitemap-live.xml | head -20     # روابط mall-services.pages.dev + lastmod حقيقي
curl -sI https://mall-services.pages.dev/blog-sitemap.xml | head -3      # 301
# 4) 301 للصفحات القديمة
curl -sI https://mall-services.pages.dev/refund-policy.html | head -3    # 301 → /refund-policy
```
- Search Console: أعد إرسال `sitemap.xml` و`sitemap-live.xml`، وامسح `blog-sitemap.xml` من القايمة، واعمل «Validate fix» لتقارير Soft 404 / Duplicate.
- مقال AI جديد: افتحه، View Source ← لازم تلاقي `<link rel="canonical">` على رابط المقال نفسه و`"@type":"Article"`.
- لو ظهر 503 على `/blog/<slug>` يبقى Firestore REST فشل: شوف Cloudflare logs (`[blog] Firestore runQuery failed`).

---

## 4) خطة (من غير تنفيذ): URLs حقيقية بدل الـ hash

**المشكلة:** `/#store-xyz` و`/#services` مش بتتفهرس كصفحات مستقلة؛ جوجل بيشوف صفحة واحدة بس (`/`).

**التصميم المقترح (مراحل، كل مرحلة مستقلة):**

| المرحلة | الـ URL | المحتوى للـ crawler | الحجم |
|---|---|---|---|
| A | `/store/<storeId>` | Pages Function تقرأ المتجر من Firestore (REST عام، زي المدونة) وتحقن title/description/canonical/og + JSON-LD (`Store`/`Organization`) + نص (اسم، وصف، قايمة منتجات) داخل `<noscript>`/HTML أولي، وبعدين تحمّل التطبيق | M (يوم–2) |
| B | `/p/<productId>` (منتج) و`/service/<id>` (خدمة) | نفس الفكرة + JSON-LD `Product` (سعر، توفر، تقييم) أو `Service`. الصور حاليًا data-URL داخل Firestore → لازم مسار صور `/api/...` بأبعاد ثابتة وكاش طويل | L |
| C | `/category/<slug>` | صفحات تصنيفات بقايمة روابط + نص مفيد | M |
| D | sitemaps مقسّمة: `sitemap-stores.xml`, `sitemap-products.xml` (حد 50 ألف رابط/ملف، `lastmod` من `updatedAt` الحقيقي) | — | S |

**التوافق مع القديم:** الـ SPA يقرأ المسار + الـ hash معًا، و`#store-<id>` القديم يعمل `history.replaceState` لـ `/store/<id>` (الروابط المشاركة قبل كده تفضل شغالة).

**القواعد اللي لازم تتحترم:**
- كل prefix جديد لازم يتضاف صراحة في `_routes.json` (مفيش catch-all دلوقتي، وده مقصود).
- الكيان المحذوف/الموقوف/غير النشط → 404 حقيقي؛ الأخطاء المؤقتة → 503 (زي `/blog`).
- canonical واحد لكل كيان؛ صفحات التصفية/البحث `noindex`.
- لا تظهر في HTML أي بيانات تواصل (نفس سياسة منع التسريب الحالية).
- الكاش: `s-maxage` 5–10 دقايق عشان ما نزودش قراءات Firestore.

**المخاطر:** (1) تكلفة قراءات Firestore مع زحف كثيف → كاش + حد معدل. (2) تكرار محتوى بين `/#...` والمسار الجديد → canonical + redirect. (3) الصور data-URL ثقيلة → مسارات صور مخصصة. (4) المتاجر/المنتجات الخفيفة (من غير وصف) → `noindex` لحد ما تكتمل.

**الترتيب المقترح:** A (المتاجر) ← D ← B (المنتجات) ← C. لو الأولوية للبيع: ابدأ بـ B.

---

## 5) خطة: لو اشتريت دومين خاص — كل الأماكن اللي تتغيّر

**الكود (استبدال `https://mall-services.pages.dev`):**
- `index.html`: سطور 20 (canonical)، 26 (`og:url`)، 27 (`og:image`)، 37 (`twitter:image`)، 48/49/55/64 (JSON-LD: url/logo/sameAs/WebSite) + تعليق Firebase (سطر ~1635).
- `about/index.html` (6)، `contact/index.html` (5)، `privacy/index.html`، `terms/index.html`، `refund-policy/index.html`، `privacy.html`، `terms.html`: canonical/og.
- المقالات الثابتة العشرة `blog/*/index.html` (5–10 مرة في كل واحد: canonical, og, JSON-LD, روابط) + `blog/index.html` (3).
- `sitemap.xml`, `sitemap-main.xml`, `robots.txt`.
- `functions/api/sitemap-dynamic.js`, `functions/blog/[slug].js`, `functions/api/payment.js`, `functions/api/ads.js`, `functions/api/stores.js`: قيمة fallback للدومين (يفضل الاعتماد على `SITE_URL` وما نعتمدش على الـ fallback).
- `cron-worker/wrangler.toml` (`SITE_URL`) و`cron-worker/index.js` (placeholder).
- `sw.js` و`functions/_shared/gcp.js`: تعليقات بس.
- توصية: استبدال جماعي: `grep -rl "mall-services.pages.dev" . | xargs sed -i 's#mall-services.pages.dev#NEWDOMAIN.com#g'` (بعد استبعاد `css/tailwind.css` وملفات الـ md إن حبيت)، وبعدين راجع الـ diff.

**الإعدادات (برا الكود):**
1. Cloudflare Pages ← Custom domains + متغيرات البيئة `SITE_URL` و`ALLOWED_ORIGINS` (ضيف الدومين الجديد، وسيب القديم أثناء الانتقال) — في مشروع Pages وفي الـ cron worker.
2. Firebase Console ← Authentication ← Authorized domains: ضيف الدومين الجديد (`authDomain` يفضل `services-mall.firebaseapp.com`).
3. Google Cloud Console ← OAuth client: Authorized JavaScript origins + redirect URI `https://NEWDOMAIN/__/auth/handler`.
4. Fawaterak (فواتيرك): دومين الـ webhook وروابط الرجوع (`/api/fawaterak-webhook`، `?store_payment=` …) لو بيعمل whitelist.
5. 301 دائم من `mall-services.pages.dev/*` للدومين الجديد (Bulk Redirects أو `_redirects` بقاعدة absolute) + الحفاظ على المسارات.
6. Google Search Console: property جديدة للدومين (ملف التحقق `google5463541af54b53ef.html` مرتبط بالـ property القديمة؛ اعمل واحد جديد أو DNS)، أعد إرسال الـ sitemaps، واستخدم Change of Address لو متاح.
7. Google Analytics (`G-20SMHQMQ1G`): ضيف الدومين الجديد في Data stream لو فيه قيود.
8. بعد النقل: امسح كاش الـ Service Worker (ارفع رقم الإصدار في `sw.js`)، واختبر تسجيل الدخول بجوجل والدفع والـ webhook.
