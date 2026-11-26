# حماية الموقع من الضغط (Load protection)

## اللي اتعمل في الكود
- **edge-cache.js**: لو Firestore وقع أو الحصة اليومية خلصت، الـ endpoints العامة (home-feed, services-list, الصفحات...) بتخدم **آخر نسخة سليمة لحد 24 ساعة** بدل خطأ (`X-Edge-Cache: STALE-ERROR`). ممكن تضبطها بـ `sie` في خيارات `edgeCached`.
- **_middleware.js**: حد طلبات لكل IP على كل `/api/*` قبل ما الـ handler يتحقق من التوكن أو يقرا Firestore (429 + Retry-After)، ورفض أي POST أكبر من 8MB. الـ webhooks والـ feeds المكاشة والـ analytics مستثناة.
- **/api/health**: فحص خفيف لا يقرا Firestore. `?deep=1` يعمل قراءة واحدة بس.
- **auto-articles.yml**: `concurrency` عشان نفس المقال ميتكتبش مرتين.
- **scripts/load-test.js**: اختبار ضغط بـ k6.

## اللي لازم تعمله إنت (بدون كود)
1. **Firebase → ترقية لـ Blaze** مع **Budget alert** وسقف صرف (مثلًا 5$). تحت الحصة المجانية التكلفة صفر، وبكده الموقع مبيقفش لما الحصة تخلص.
2. **Cloudflare → Security → WAF → Rate limiting rules**: قاعدة واحدة (متاحة في الخطة المجانية) على `URI Path starts with /api/` بحد مثلًا 100 طلب / 10 ثواني لكل IP، والإجراء Block لمدة دقيقة. دي بتشتغل على كل الـ isolates (حد الكود per-isolate فقط).
3. **Cloudflare → Notifications**: فعّل تنبيه استهلاك Pages Functions، وراقب الـ requests اليومية.
4. **Uptime monitor** (UptimeRobot مجاني) على `https://mall-services.pages.dev/api/health` كل 5 دقايق.
5. **اختبار ضغط**: `k6 run -e SITE=https://mall-services.pages.dev -e VUS=20 scripts/load-test.js` ثم ارفع VUS تدريجيًا (50 ثم 100). راقب لوحة Firebase Usage أثناء الاختبار.

## ملاحظات
- مستخدمو الموبايل في مصر كتير منهم بيشاركوا نفس الـ IP، فالحدود متعمّدة سخيّة.
- لو ظهر 429 للمستخدمين العاديين، ارفع الأرقام في `API_TIERS` داخل `functions/_middleware.js`.
- لا تعدّل ملفات `dist/` يدويًا: هي ناتج `npm run build:dist` (minified) وبتتكتب من جديد.

## تغيير الدومين (خطوة بخطوة)
1. جرّب الأول بدون كتابة: `node scripts/set-domain.mjs --from mall-services.pages.dev --to دومينك-الجديد.com`
2. لو القايمة مظبوطة أضف `--apply` ليبدّل الدومين في كل الصفحات الثابتة (canonical وog وsitemap وllms.txt وCSP...).
3. في Cloudflare Pages ← Settings ← Environment variables: غيّر `SITE_URL`.
4. في GitHub ← Settings ← Secrets and variables ← Actions ← **Variables**: غيّر `SITE_URL`.
5. شغّل `npm run build:dist` ثم انشر. (ملفات `dist/` ناتج بناء minified، لا تعدّلها يدويًا.)
6. في Google Cloud Console حدّث الـ HTTP referrers لمفتاح Firebase، وأضف الدومين الجديد في Firebase Auth ← Authorized domains.
7. اعمل ملف جديد/Change of Address في Google Search Console، وأرسل الـ sitemap الجديد.
روابط المقالات الداخلية بتتصلح لوحدها (روابط نسبية). الاختبارات في `tests/` بتفترض الدومين الافتراضي، فاستثنيتها من السكريبت عن قصد.

## تنظيف مجلدات المدونة المشوّهة
`node scripts/remove-garbled-blog.mjs` يعرض مجلدات `blog/#U...` (أسماء عربية اتخربت عند الرفع وبتكرر مقالات سليمة). أضف `--apply` للحذف.

## تقييد مفتاح Firebase Web API (بعد نشر gcp.js الجديد)
1. Google Cloud Console ← مشروع `services-mall` ← APIs & Services ← Credentials ← افتح مفتاح الويب.
2. Application restrictions = **Websites (HTTP referrers)** وأضف:
   `https://mall-services.pages.dev/*` و `https://*.mall-services.pages.dev/*` و `https://services-mall.firebaseapp.com/*` و `https://services-mall.web.app/*`
   (لو غيّرت الدومين أضف الدومين الجديد هنا أيضًا، وغيّر `SITE_URL` في Cloudflare).
3. اترك API restrictions كما هي (Don't restrict) أولًا. قيّدها لاحقًا بعد التجربة، وبأسماء: Identity Toolkit API, Token Service API, Cloud Firestore API (+ Firebase Installations / Cloud Storage لو مستخدمة).
4. بعد 5 دقايق جرّب: تسجيل دخول عادي، تسجيل دخول Google، وعملية تحتاج تحقق من السيرفر (دفع/لوحة تحكم). لو حاجة وقفت: ارجع Application restrictions إلى None فورًا.
5. السيرفر (`functions/_shared/gcp.js`) بيبعت `Referer` = `SITE_URL` عشان المفتاح المقيّد يشتغل منه كمان.
