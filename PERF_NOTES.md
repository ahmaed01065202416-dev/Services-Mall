# Performance — ما تم (16 نوفمبر 2026)

* **Chart.js (200 KB / 67 KB gzip)** لم يعد يُحمَّل ولا يُحلَّل في كل زيارة؛ يُحمَّل مع وحدات لوحة التحكم (`__ensureDashModules`) عند أول فتح لتبويب، ومسبقًا وقت الخمول لمن سجّل دخوله.
* **38 صورة** في قوالب JS صارت `loading="lazy" decoding="async"` (قوائم الخدمات/المتاجر/اللوحات). لم تُمَسّ صور الهيرو ولا صفحات الطباعة (KYC/الإيصالات).
* حذف `preconnect` إلى `www.gstatic.com` (مكتبات Firebase صارت محلية).
* **الـ shim**: لا يمسح DOM مرتين عند كل `innerHTML`، ولا يمسح أصلًا إلا HTML يحتوي على `style`.
* نسخة service worker جديدة لإفراغ الكاش القديم.

## ما لم يُفعل عمدًا (يحتاج قياسًا في متصفح قبل المخاطرة)
* تأجيل `dashboard.js` (175 KB) و`seller-dashboard.js` (78 KB) و`order-workspace.js` (123 KB) و`firebase-database/storage` (200 KB): كلها تُستدعى من أكثر من 20 موضعًا؛ تأجيلها بلا اختبار حقيقي قد يكسر الواجهة.
* قياس حقيقي: PageSpeed Insights على `https://mall-services.pages.dev/` (موبايل) ثم DevTools ← Performance. أرسل لي النتيجة وأعالج بالأرقام.
