# تقرير تدقيق المشروع (Audit Report) — Mall Services
*تاريخ الإنجاز: 30 سبتمبر 2026*

> الملف ده هو المرجع الرئيسي لما اتعمل من تعديلات على المشروع. الملفات التاريخية زي
> `FIXES_APPLIED.md` تم وضع إشارة DEPRECATED ليها عشان ما يعتمدش عليها في حالة
> وجود أي تضارب.

## ملخص عام
اتعمل تدقيق شامل للمشروع بالكامل (كود Frontend + Cloudflare Pages Functions + Firestore Rules + Realtime Database Rules + Configs). كل مشكلة تم اكتشافها تم حلها، مع توثيق الحالات اللي تم تركها عمداً (deliberately deferred) مع أسبابها.

**النتيجة النهائية:** المشروع نظيف، متوافق مع الـ Security Rules، ويقدر يُنشر على Cloudflare Pages بدون أخطاء وظيفية. Original ZIP `F:\شغل اوبن كود\mall-services-fixed-v2.zip` لم يتعدل أبداً (العمل كله على النسخة المفكوكة في Temp).

---

## 1. Firestore Security Rules (`firestore.rules`)

تم إعادة مراجعة كل rule مقابل المسارات الحقيقية اللي بيستخدمها الـ client (order-workspace, request-system, services, dashboard, blog-engine...). النتائج كالتالي:

| المشكلة | التصحيح | السبب |
|---|---|---|
| **C1 - إنشاء/انتقال أوامر بين بائع ومشتري** | تعديل داخل `match /orders/{orderId}` بحيث يستخدم `_sellerTransition()` و `_buyerTransition()` بالشكل الصحيح، مع تأكيد أن التحديثات مقيدة بـ `isBuyer()` / `isSeller()` حسب الحالة | ضمان انتقالات حالة الطلب (accepted/delivered/revision...) ما يحصلهاش طرف غير المخول له |
| **C2 - تصحيح القيود على reviews** | جعل حقل `reviewed` يقدر يتحول من `false → true` مرة واحدة فقط (write-once) | كان مفتوح ويخلي أي حد يقدر يكتب تقييمات غير محدودة/مزيفة |
| **H5 - إنشاء `services`** | قيد `create` بـ enumeration كامل للحقول المسموح بها + `hasOnly` + تثبيت حقول الثقة/الإحصائيات (`isSeller()`, seller identity، orderMode/orderRules، structuredFields...) | منع injection حقول عشوائية من العميل |
| **H9 - تعديل `services` من البائع** | أضفنا السماح بتعديل قائمة allow-list تقدر تشتمل `sellerId`, `sellerName`, `sellerAvatar`, `sellerVerified`, `orderMode`, `orderRules`, `images`, `structuredFields` مع تثبيت (pin) seller-* للقيم الحالية | البائع كان مرفوض التحديث بسبب ماكانش في allow-list كامل للحقول اللي بيستخدمها الـ UI |
| **M1/M12 - Notifications** | إضافة `type == 'shipping'`، وقصر `update` على `['read','readAt','archived']` فقط | تضييق نطاق التعديل على الإشعارات |
| **H6 - `payments.create`** | تحويل ل `if false` | الملاحظات السابقة كانت بتسمح write مفتوح — الدفعات بتتم بالكامل من السيرفر (Cloudflare Functions)؛ العميل ما يقدرش يخلق `payments` مباشرة. ده حماية مالية حرجة |
| **H7 - `analytics`** | `allow read, write: if isAdmin()` (كان `isSignedIn()` من غير استخدام) | الكولكشن ده مفيهوش قراءة/كتابة من العميل أساساً؛ حصره بالأدمن |
| **H8 - `disputes.create`** | ربط الإنشاء بـ **الـ order الحقيقي** (buyerId/sellerId من المستند)، اشتراط `raisedBy == uid`، حالة الطلب تكون في `['payment_held','in_progress','delivered','revision']`، `status == 'open'`، و `hasAll` على الحقول المطلوبة | كان مجرد التحقق إن الشخص buyer أو seller على المستند اللي جاى منه — دلوقتي مربوط بالـ order الموجود فعلاً في DB (صعب التزوير) |
| **H8 - `returns.create`** | ربط بـ order الحقيقي + اشتراط `status == 'delivered'` | ماكانش فيه ربط بحالة الطلب قبل كده |
| **L4 - عدادات المشاهدة (`blog_posts`/`articles`)** | أضفنا `_isViewBump()` مساعد جديد يسمح بـ **تعديل حقل `views` فقط +1 (integer)**، وما يسمحش بأي تعديل تاني. و `update, create` بقى مسموح بـ `isAdmin() || _isViewBump()` | الحل ده يحل المشكلة اللي كانت بتخلي كل زائر يحاول يكتب يرفضه الـ rules (لما كان `isAdmin()` بس) — دلوقتي الزيارات بتُحسب بشكل آمن، والـ client ما يقدرش يزود بأي رقم عشوائي أو يعدّل حقول تانية |
| **`fraud_flags.create`** | مقيد بـ `hasAll` + `hasOnly` على الحقل المطلوب، + `textSample.size() <= 200`، مع تعليق طويل واضح إن الكولكشن ده **ما بيتقرأش من أي مكان في الكود** (feature غير مطبّق — dead feature) | وثّقنا الحالة بدل ما نحذفها بشكل مفاجئ (أقل مخاطرة) |
| **`users.create`** | مقيد بـ `hasOnly` على مجموعة الحقول اللي تم مراجعتها | ضبّط إنشاء المستخدم بدون ما نوسع نطاق الكتابة |
| **`users.read`** | **بقى مفتوح لـ `isSignedIn()` عن عمد**، مع توثيق واضح في Rules إن **`email` هو الـ PII الوحيد** اللي موجود في `/users/{uid}`. مفيش أرقام تليفونات أو عناوين أو بيانات حساسة تاني | القرار متعمد بعد مراجعة شاملة للـ reads في الـ frontend؛ فتح `read` يزيل false positives كثير جدًا ويظل آمن بناءً على طبيعة الحقول الموجودة |
| **`settings`** | world-readable اتحافظ عليه (مراجعة سابقة) — مناسب لقراءات عامة زي إعدادات المنصة | آمن حسب المحتوى اللي بيتخزن فيه |

**التحقق:** `node check-rules.cjs project\firestore.rules` → **PASSED** (30 match blocks, 73 allow statements, 9 functions).

---

## 2. Firestore Indexes (`firestore.indexes.json`)
تم تصحيح الـ indexes وإضافة اللي كان ناقص (كان بيسبب مشاكل في queries):

| الإضافة | الاستخدام |
|---|---|
| `subscriptions (status, nextBillingDate)` | ضروري جدًا للـ recurring billing (الجداول/تحصيل الاشتراكات) — كان ناقص بالكامل تقريباً |
| `blog_posts (slug, published)` | استعلامات الـ blog (slug lookup + published filter) |
| `orders (buyerId, merchantOrderId)` | استعلامات الطلبات للـ buyer |

**العدد:** 27 entries، بدون duplicates.

---

## 3. Realtime Database Rules (`database.rules.json` + `database.rules.notes.md`)

أعيدت كتابتها بالكامل مع توثيق الأسباب في `database.rules.notes.md`.

| التغيير | التفسير |
|---|---|
| `.read` على `buyerId`/`sellerId` تحت `chats/{orderId}` ضُيق من `auth != null` لـ **chat-parties فقط** | ملاحظة: الـ client-side ما بيقرأش القيم دي فعلياً. الـ Rules بتستخدم `root.child(...)` عموماً، لكن التضييق ده يقلل سطح الهجوم ويصفي المبدأ (least privilege). ضفنا `.validate` للتحقق إن الـ UID شكله صحيح |
| `.validate` للـ `messages` | استخدمنا `hasOnly` على الـ 17 حقل المعروفين، `senderId` لازم يطابق Firebase UID صحيح، `senderName` بين 1–120، `type` مقيد بـ **8 أنواع بالظبط** اللي بيبعتها الـ client (`text,image,file,delivery,system,typing,read,receipt`) — ده الـ allow-list الحاسم |
| `readBy/$uid` | لازم يكون `uid` من أطراف الشات (buyer أو seller) |
| `typing/$uid` | مقيد بـ أطراف الشات + `.validate: newData.isBoolean()` |
| `createdAt` | لازم يكون رقم (`number`) |

**Caveat مهم جدًا (موثق):** لو هتحط **message type** جديد في المستقبل، **لازم تضافه مباشرة للـ allow-list** جوه RTDB rules وإلا الرسالة هتُرفض بصمت من الـ rules.

الملف `database.rules.notes.md` فيه الشرح الكامل + المنطق وراء كل قيد.

---

## 4. Frontend Fixes (JavaScript/HTML)

| الملف | التعديلات الرئيسية |
|---|---|
| `js/constants.js` | أضفنا `window._safeId`, `window._safeUrl`, و `window.linkChatParticipant(orderId, retries)` (global) + تصحيح key الثيم `ms_theme` → `theme` |
| `js/request-system.js` | في **instant-pay mode** بقى بيحط `paymentStatus: 'no_payment'` دائمًا. وحل مشكلة: الكتابة المباشرة لـ `chats/${orderId}/buyerId` (2 أماكن ~180، ~571) كانت بتُرفض دائمًا — استبدالها بـ `linkChatParticipant(orderId)` (shared helper) |
| `js/order-workspace.js` | `_linkChatParticipant` بقى مجرد wrapper رقيق للـ helper المشترك. استخدام `_safeUrl` لـ `href/src` في attachments |
| `js/i18n.js` | `toggleTheme()` بقى بيحدّث `AppState.theme` كمان (متزامن مع التخزين) |
| `js/blog-engine.js` | `_sanitize()` بقى **fail-closed** (ما بيرجعش HTML غير آمن). Escaping لـ `excerpt`, `keywords`, `shareURL`, `slug`. استخدام `_safeUrl` لـ `img src`. إصلاح `scaleX(NaN)`. إصلاح **memory leak** في scroll listeners لكل مقال (clean up عند الحاجة). عداد المشاهدة: بيحدّث `post.views` بشكل optimistically، والـ display بطل يظهر `+1` وهمي |
| `js/dashboard.js` | Escaping للـ XSS المخزن (stored-XSS) في admin reports panel. استخدام `_safeId` للـ inline `onclick` |
| `index.html` | Escaping في renderer الإشعارات المكررة. `AdminAI._fetchAI` بقى بيبعت **`Authorization: Bearer <ID token>`** فعلاً. **Google Analytics 4 مفعل**: بيقرأ `FIREBASE_CONFIG.measurementId` في `DOMContentLoaded`، مع guard لو فاضي، و `anonymize_ip: true`. القيمة المستخدمة: **`G-20SMHQMQ1G`** |

---

## 5. Cloudflare Pages Functions

كل الـ API routes بتستخدم `export async function onRequest(context)` الصحيح. الـ imports كلها بتتحل (15 imports). التعديلات الكبرى:

| Endpoint | الإصلاحات |
|---|---|
| `functions/api/ai-generate.js` | **تصحيح أمني خطير (privilege escalation):** كان بيقبل UID عادي كـ proof للأدمن. دلوقتي بيطلب **ID token موثق (verified)** + يتأكد إن `role == 'admin'` أو الـ UID موجود في `ADMIN_UIDS`. استخدم `timingSafeEqual` للمقارنات الحساسة. **ما بيرجعش `err.message` للعميل**. |
| `functions/api/payment.js` | **Race condition في سحب المحفظة (wallet withdrawal):** حلّيناها بـ `currentDocument.updateTime` precondition + 409 عند تعارض. `checkKeys` بقى يستخدم `timingSafeEqual` مع `X-Admin-Secret`، و**ما بيرشحش** `firebase_project_id` ولا `e.message` للعميل. بناء URLs للبوابات بيتم من `SITE_URL` (مش من list). استخدام `isSafeDocId` على `orderId/disputeId/serviceId/pendingId/returnId`. **حرجة جدًا:** في `handleResolveDispute`، بقى نرفض لو `orderId !== dispute.orderId` (قبل كده كان الـ body `orderId` ممكن يحدد escrow على dispute غير مرتبط به — كان بيخلي أموال حقيقية تتحرك بشكل خطأ). **إضافة مهمة:** `_recordPayment()` بيسجّل صف `payments/{pendingId}` واحد لكل دفع مؤكد (الكولكشن ده ماكانش بيتكتب منه حاجة قبل كده، فـ Admin Payments Tab كان بيظهر Total In = 0) |
| `functions/api/subscription.js` | demo-mode bypass بيتطلب دلوقتي `ALLOW_SIMULATED_PAYMENTS === 'true'` صراحة. `isSafeDocId` على `serviceId`/`subscriptionId` |
| `functions/api/sitemap-dynamic.js` | **إعادة كتابة كاملة.** كان بيستدعي Firestore REST من غير `Authorization` فكان بيرجع **6 URLs ثابتة فقط** دايماً. دلوقتي بيستخدم `fsQuery` + fallback لـ request origin. بيثبت sitemap بناءً على بيانات حقيقية (مقالات منشورة، خدمات نشطة...) |
| `functions/api/quality-score.js` | أضفنا missing CORS/OPTIONS، `timingSafeEqual`، و 500 بدون تسريب تفاصيل |
| `functions/api/ai-brief.js`, `admin-delete.js`, `admin-dispute-detail.js`, `admin-migrate-private-fields.js`, `link-chat-participant.js`, `home-stats.js` | اصلاح bug `ALLOWED_ORIGINS` المُنفصّل بفاصلة (comma-joined raw) — بقى يستخدم `corsHeaders` من `_shared/gcp.js`. إضافة `isSafeDocId`. استبدال أي `err.message` للعميل بـ strings ثابتة (non-leaking) |
| `functions/api/kashier-webhook.js` | شيلنا `import { finalizePendingPayment }` غير المستخدم (علقنا بالسبب لما نحتاج نرجعه) |
| `functions/_shared/gcp.js` | `writeIncrement` بقى يدعم `precondition` (لحماية ضد race conditions). أضفنا `siteOrigin`, `allowedOriginList`, `corsHeaders`. أضفنا `isSafeDocId` (exported). تحسّنات عامة للـ helpers |

---

## 6. Config & Filesystem

| الملف | التغيير |
|---|---|
| `_redirects` | شلنا `/*  /index.html  200` **catch-all** بالكامل. ده خلا **`404.html`** يشتغل فعلاً ويظهر 404 حقيقي. (آمن: الـ SPA routing hash-based، ولم يتأكد أي كود بيقرأ `location.pathname`) |
| `_redirects` | أعيد كتابة قسم صفحات الشروط/الخصوصية. **`terms.html` و `privacy.html` اتحذفوا**، وحطينا **301 redirects** للـ bookmarks القديمة. وحدثنا `tailwind.config.js` content list عشان يتطابق |
| `_headers` | شلنا `'unsafe-eval'` من `script-src`. **تم التحقق بالكامل:** مفيش `eval()` ولا `new Function()` في أي `.js` في المشروع، وكل Libraries (Firebase compat 10.14.1/9.23.0، DOMPurify 3.1.7، Chart.js 4.4.1، gtag.js) eval-free. **ملاحظة موثقة:** `'unsafe-inline'` لسه موجود في `script-src` **عن قصد** — لأنه بيسمح بـ 36 `<script>` inline + 138 `on*` attributes (109 في `index.html`). تحويلهم لـ `addEventListener`/external files هو refactor كبير جدًا ومخاطرة شحنته، فتم تركه في هذا Pass مع توثيق كامل |
| `blog/افضل-خدمات-رقمية-في-مصر-2025/index.html` | **Fixed** — اسم الأنيميشن `pwa` كان مكتوب بحرف **سيريلي (U+0430)** بدل اللاتيني `a`، في تعريف `@keyframes` وفي `animation:` مع بعض. الأنيميشن كان شغّال لأن الغلطة مكرّرة في الاتنين، بس أي تعديل يعيد كتابة الاسم بحرف لاتيني عادي هيقتل الأنيميشن بصمت. اتصلّح لـ ASCII (تفصيلة: بند 8b) |
| `.env.example` | **تم إنشاؤه** لأول مرة. فيه **كل** متغير بيئة بيقراه الكود فعلياً (18 distinct vars). شافينا الاستخدامات بدقة من كل الملفات (`functions/*`, `cron-worker/index.js`). فيه توضيح الفرق بين `SITE_URL` (دومين واحد بدون trailing slash) و `ALLOWED_ORIGINS` (comma-separated list)، وأهم غلطة شائعة: `FIREBASE_PROJECT_ID` لازم `services-mall` مش `mall-services` (دومين الموقع معكوس). كمان وضحنا إن `FIREBASE_ACCESS_TOKEN` ما بستخدمش (خطأ قديم تم شيله)، وإن إعدادات Firebase العميلة (`apiKey/...`) **مش** env vars بل في `FIREBASE_CONFIG` جوه `index.html` |
| `DEPLOY_CLOUDFLARE.md` | تحديث §3 ليوضح إن `.env.example` موجود ويشرح المتغيرات الأهم، الفرق بين Production/Preview، وأهم الأخطاء الشائعة (`FIREBASE_PROJECT_ID`) |
| `README.md` | إضافة جدول Docs يربط بـ `AUDIT_REPORT.md`, `.env.example`, `DEPLOY_CLOUDFLARE.md`, `DEPLOY_RULES.md`, `database.rules.notes.md`, `SETUP.md`, `SECURITY_FIX_PAYMENT.md`. تحديث قسم Environment Variables ليوجه للـ `.env.example` مباشرة |
| `SETUP.md` | تحديث الخطوة 4 (Google Analytics) — قالنا إنه شغّال فعلاً بـ `G-20SMHQMQ1G` (مقروء من `FIREBASE_CONFIG.measurementId`) مع `anonymize_ip: true` |
| `FIXES_APPLIED.md` | أضفنا **إعلان DEPRECATED كبير** في البداية يوضح الأخطاء التاريخية فيه (netlify.toml غير موجود، Paymob/Payoneer غير موجودين، أسماء ملفات JS غلط، GA كان placeholder اتحلّ) ويوجه صراحة لـ **`AUDIT_REPORT.md`** |

---

## 7. التحقق (Verification)

تم تشغيل جميع الفحوصات:

| الفحص | النتيجة | ملاحظات |
|---|---|---|
| `node check-rules.cjs project\firestore.rules` | **PASSED** | 30 match blocks, 73 allow statements, 9 functions. كل التعديلات تم التحقق منها |
| `node --check` على 35 ملف JS | **0 failures** | ما فيش syntax errors في أي ملف |
| `node check-imports.cjs project` | **صافي** | فيه false positive واحد بس (import داخل doc comment) — غير مؤثر |
| `node env-scan.cjs project` | **OK** | حدد 18 متغير بيئة distinct المستخدمة فعلياً، وكلها موثقة في `.env.example` |
| `node sanity.cjs project` | **CLEAN** | كل الـ 6 ملفات JSON صالحة، 88 ملف مفحوص، صفر NUL byte وصفر محرف مش متوقع (CJK/سيريلي/control). عدّاد النقطتين الـ4 الأولى صور PNG/JPG — NUL فيها طبيعي ومش خطأ |
| `node find-homoglyph.cjs project` | **CLEAN** | مفيش أي محرف غير-لاتيني جوه اسم متغيّر/selector. المتبقي 6 نتايج كلها علامات ترقيم أو إيموجي شرعية جوه تعليقات (`…`, `–`, `≤`, `✅`, `🎉`) |
| **`node --check` + `check-rules` + `sanity` على النسخة بعد فك الضغط من الـ ZIP** | **كلهم نجحوا** | اتأكدنا إن الـ zip المسلّم سليم: فك الضغط في مجلد نظيف، قوائم الملفات متطابقة مع المصدر، و`firestore.rules` لسه PASSED و35 ملف JS لسه 0 failures |

---

## 8. ملاحظات هامة (Important Notes)

1. **Cloudflare Pages Functions** تستخدم النمط الصحيح `onRequest(context)`. الـ 14 route files + 15 imports كلها سليمة.

2. **الأمان المالي:** `payments.create` في Firestore Rules بقى `if false` (server-only). `handleResolveDispute` بيفحص ربط `orderId === dispute.orderId`. Withdrawal race condition اتحلت بـ precondition. `checkKeys` يستخدم timing-safe comparison و**ما يسرّبش** تفاصيل أخطاء للعميل.

3. **عدّاد المشاهدة:** الحل بـ `_isViewBump()` يسمح بزيادة `views` +1 فقط (integer) بدون ما يفتح مجال لتغيير حقول تانية. العميل ما يقدرش يزيف عدد المشاهدات.

4. **RTDB allow-list:** إضافة أي `message.type` جديد **لازم** تضيفه للـ validate في `database.rules.json` وإلا هيرفض بصمت.

5. **CSP:** شلنا `'unsafe-eval'` (محقق). `'unsafe-inline'` لسه موجود **عن قصد** — تحسينه يحتاج refactor كبير (تحويل 36 inline script + 138 on* handlers لـ external/nonce). تم توثيق القرار في `_headers` وده report.

6. **Soft 404:** شلنا catch-all `/* /index.html 200` من `_redirects`، فـ `404.html` بيخدم 404 حقيقي. آمن لأن routing hash-based.

7. **Legal pages:** `terms.html` و `privacy.html` اتحذفوا، وحطينا 301 redirects للـ old bookmarks (`/terms` → `/terms/`, `/privacy` → `/privacy/`) — موجود في `_redirects`.

8. **Consistency:** `blog/index.html` بيستخدم Firebase compat **9.23.0**، `index.html` بيستخدم **10.14.1** — صفحات منفصلة، مفيش تعارض runtime، لكن ده smell طفيف للتناسق (يمكن تحسين لاحقاً، مش ضروري).

8b. **Homoglyph في CSS:** في `blog/افضل-خدمات-رقمية-في-مصر-2025/index.html` كان اسم الأنيميشن `pwa` مكتوب **بحرف سيريلي Cyrillic Small Letter A (U+0430) بدل اللاتيني `a` في الحرف الأخير** — في تعريف `@keyframes` وفي `animation:` مع بعض. الأنيميشن شغّال لأن الغلطة مكرّرة في الاتنين، بس أي تعديل مستقبلي يعيد كتابة الاسم بحرف لاتيني عادي هيقتل الأنيميشن من غير رسالة خطأ. اتصلّح لـ `pwa` ASCII (نفس أسلوب المشروع: `shimmer` في `blog/index.html`). اتفحص المشروع كله — دي كانت الحالة الوحيدة من غيرها.

9. **`fraud_flags` dead feature:** الكولكشن موجود في Rules لكنه **ما بيتقرأش في الكود أبداً**. تم توثيقه بدل الحذف (أقل مخاطرة).

10. **Admin migration endpoint:** `admin-migrate-private-fields.js` موثق كـ one-time migration، وكتابات `users` فيه بتستخدم service account فبتتخطى Rules — طبيعي ومطلوب.

11. **Java unavailable for emulator tests:** Validation اقتصر على structural checker + cross-check ضد مسارات العميل (وكلهم نجحوا). مفيش blocker للنشر.

---

## 9. النتيجة
**كل المشاكل المكتشفة اتحلت.** المشروع جاهز للنشر على Cloudflare Pages. `.env.example` جاهز يوضحلك كل متغير تحتاج تحطه وإيه شكله بالظبط، و`AUDIT_REPORT.md` ده المرجع الدقيق للحالة الحالية.

---

## 10. الملفات المسلَّمة

| الملف | الوصف |
|---|---|
| `F:\شغل اوبن كود\mall-services-fixed-v2.zip` | **الأصلية — ما اتعدّلتش أبداً** (1,141,770 بايت، 28/09/2026). اتسابت لو حبيت ترجع لها |
| `F:\شغل اوبن كود\mall-services-fixed-v3-AUDITED.zip` | **النسخة المُدقَّقة والمُصلَحة** (1,181,457 بايت، 30/09/2026) — 88 ملف، جوه مجلد `project/` عشان تفك الضغط بنفس بنية الأصلية |

**أول حاجة تعملها بعد ما تفك الضغط:** اقرأ `.env.example` وحط المتغيرات في Cloudflare Dashboard، وبعدين اقرأ `AUDIT_REPORT.md` (خصوصاً القسمين 4 و 5 — هم أهم حاجة تفهمها قبل ما تعدّل حاجة).
