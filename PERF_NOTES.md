# Performance — ما تم (16 نوفمبر 2026)

* **Chart.js (200 KB / 67 KB gzip)** لم يعد يُحمَّل ولا يُحلَّل في كل زيارة؛ يُحمَّل مع وحدات لوحة التحكم (`__ensureDashModules`) عند أول فتح لتبويب، ومسبقًا وقت الخمول لمن سجّل دخوله.
* **38 صورة** في قوالب JS صارت `loading="lazy" decoding="async"` (قوائم الخدمات/المتاجر/اللوحات). لم تُمَسّ صور الهيرو ولا صفحات الطباعة (KYC/الإيصالات).
* حذف `preconnect` إلى `www.gstatic.com` (مكتبات Firebase صارت محلية).
* **الـ shim**: لا يمسح DOM مرتين عند كل `innerHTML`، ولا يمسح أصلًا إلا HTML يحتوي على `style`.
* نسخة service worker جديدة لإفراغ الكاش القديم.

## ما لم يُفعل عمدًا (يحتاج قياسًا في متصفح قبل المخاطرة)
* تأجيل `dashboard.js` (175 KB) و`seller-dashboard.js` (78 KB) و`order-workspace.js` (123 KB) و`firebase-database/storage` (200 KB): كلها تُستدعى من أكثر من 20 موضعًا؛ تأجيلها بلا اختبار حقيقي قد يكسر الواجهة.
* قياس حقيقي: PageSpeed Insights على `https://mall-services.pages.dev/` (موبايل) ثم DevTools ← Performance. أرسل لي النتيجة وأعالج بالأرقام.

## V23 — PageSpeed round (17 نوفمبر 2026)
* **LCP**: `#page-home` يظهر من أول رسم (`class="page active"`) بدل انتظار الـ 45 سكريبت؛ شاشة التحميل تُتخطّى للزائر الجديد (تبقى للمسجّل سابقًا/وضع الصيانة) عبر `html.no-splash` من `theme.js`. روابط `#hash` تستخدم `html.deep-link` حتى لا تومض الرئيسية.
* **CLS**: خطوط Google بـ `display=optional` (لا تبديل خط = لا انزياح). لرجوع التبديل: غيّر `optional` إلى `swap` في سطري الخطوط بـ `index.html`.
* حذف Amiri/Fraunces/IBM Plex Mono من رابط الرئيسية (قالب «أنيق» صار يحمّل Fraunces بنفسه).
* `firebase-database/storage-compat` لا يُحمَّلان قبل أول رسم: `js/lazy-firebase.js` يحمّلهما وقت الخمول أو عند أول تفاعل؛ `window.rtdb` و`window.storage` صارا getters كسولة.
* لوجو 128px مع `srcset`، وإزالة preload اللوجو.
* SW cache → `mall-local-v3.32-perf4`.
* **Minify**: في Cloudflare Pages اضبط Build command = `npm run build:dist` وOutput directory = `dist`.

### V23b — CLS الديسكتوب (17 نوفمبر)
* السبب: `.hero{display:grid;align-items:center}` + خط Readex Pro كان يُطبَّق (من Google، CSS غير متزامن) بعد أول رسم → ارتفاع النص يتغيّر → العمود كله يعيد التوسّط (0.110).
* الحل: Readex Pro (variable، arabic+latin) وReem Kufi مستضافان في `vendor/fonts/` ومعرَّفان بـ `@font-face` في `css/csp.css` بـ `font-display:optional`، مع `<link rel=preload>` للـ arabic subset. رابط Google الآن للـ IBM Plex فقط.

## V24 — نظام مقالات SEO تلقائي (17 نوفمبر 2026)
* الكتابة: Cloudflare Workers AI أولًا (ربط `AI`، بدون مفتاح) ثم Gemini احتياطي — `functions/_shared/ai-write.js` (قائمة الموديلات قابلة للتغيير بمتغير `CF_AI_MODELS`).
* خط الإنتاج `functions/_shared/seo-writer.js`: اقتراحات بحث جوجل → خطة (JSON) → كتابة الأقسام بالتوازي → صور Unsplash → أسئلة شائعة → فحص تشابه → رابط بالكلمات المفتاحية → حفظ مسودة.
* `/api/ai-generate` actions جديدة: `status`, `angles`, `tick`, `image`, `ping` (+ `generate` صار يستخدم الخط الجديد).
* لوحة الأدمن: `js/seo-admin.js` (تبويب «تشغيل تلقائي»، محرر مقال، اعتماد ونشر، قائمة فحص حية).
* الجدولة: `.github/workflows/auto-articles.yml` (كل 3 ساعات) + سر GitHub `ADMIN_SECRET`.
* `blog/[slug].js`: FAQPage JSON-LD؛ `blog-engine.js`: فيديو يوتيوب اختياري، وإخفاء شارة AI بعد المراجعة.
* اختبارات: `tests/seo-writer.test.mjs` (محاكاة كاملة).
