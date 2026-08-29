# إصلاح ثغرة بوابة الدفع + دورة الماركت بليس الكاملة

> ⚠️ **قديم:** الملف ده بيوثّق مرحلة كانت البوابة فيها Paymob (`paymob-webhook.js`).
> دلوقتي البوابة الوحيدة Fawaterak (`functions/api/payment.js` +
> `functions/api/fawaterak-webhook.js`) — والجزء الخاص بـ Fawry/Stripe/PayPal
> "لسه محتاج شغل" تحت بقى مش وارد أصلاً (اتشالوا بقرار منتج). دورة العمل
> (pending → accepted → payment_held → escrow → completed) لسه صحيحة وسارية.

## دورة العمل الجديدة (المطلوبة منك بالظبط)

1. المشتري يتصفح ويضغط "اطلب الخدمة" → بيتسجل طلب `pending` بدون أي دفع (`js/request-system.js`، موجود من الأول).
2. البائع يفتح مساحة العمل → يشوف زرار **"قبول الطلب"** / **"رفض"** (جديد، `js/order-workspace.js`).
3. لما البائع يقبل → حالة الطلب تبقى `accepted`، ويظهر للمشتري زرار **"ادفع الآن"**.
4. المشتري يدفع → السيرفر بيتأكد من السعر الحقيقي (بيقرأه من الخدمة نفسها، مش من أي رقم جاي من المتصفح) ويفتح بوابة Paymob.
5. بعد تأكيد Paymob (webhook)، نفس الطلب (مش طلب جديد) بيتحول لحالة `payment_held` والفلوس بتتحجز في `escrow` — دي "الفلوس محجوزة في الموقع".
6. البائع يسلّم، المشتري يضغط "تأكيد الاستلام" → `releaseEscrow` بتاخد عمولة المنصة وتحول الباقي لمحفظة البائع تلقائي.

كل ده مبني في نفس الملفات اللي اتكلمنا عليها؛ الجديد النهاردة: `ORDER_STATUS.ACCEPTED`، أزرار القبول/الرفض، `PaymentSystem.payForOrder()`، ودعم "دفع طلب موجود" في السيرفر (`resolveExistingOrder` / وضع `existing_order` في `finalizePendingPayment`).

---

## اللي اتغيّر

| الملف | التغيير |
|---|---|
| `functions/_shared/gcp.js` | **جديد.** مكتبة REST بديلة لـ Firebase Admin SDK تشتغل على Cloudflare Workers. |
| `functions/api/payment.js` | إعادة كتابة كاملة: السعر بيتحسب من قاعدة البيانات مش من العميل، الطلب بيتسجل من السيرفر بس. |
| `functions/api/paymob-webhook.js` | **جديد.** الرابط اللي Paymob هيبعتله تأكيد الدفع مباشرة من سيرفره. |
| `firestore.rules` | قفل إنشاء/تعديل الطلبات المدفوعة من المتصفح + تصحيح 3 أخطاء تسمية (`wallet`→`wallets`, `wallet_transactions`→`transactions`, إضافة قواعد `escrow` و`withdrawals` اللي كانت ناقصة تمامًا). |
| `js/payment-system.js` | بيبعت "عايز أشتري إيه" مش "بكام" — والطلب بيظهر بعد ما السيرفر يأكّد، مش فور استلام رسالة من الآيفريم. |
| `js/escrow.js` | `confirmDelivery` بقى بينده على السيرفر (`releaseEscrow`) بدل ما يكتب في المحفظة من المتصفح مباشرة (اللي كانت القاعدة بترفضها دايماً). |

## خطوات لازم تعملها قبل الرفع

### 1) إنشاء Service Account
Firebase Console → Project settings → Service accounts → **Generate new private key**.
هيتنزلك ملف JSON. افتحه وحط محتواه كامل (سطر واحد) في متغير بيئة في Cloudflare Pages اسمه:
```
FIREBASE_SERVICE_ACCOUNT
```
وضيف كمان:
```
FIREBASE_PROJECT_ID=اسم-مشروعك-في-فايربيز
```

### 2) نشر قواعد Firestore الجديدة
```
firebase deploy --only firestore:rules
```
لو مش عامل init لـ Firebase CLI في المشروع، أو محتاج تعمل ده بنفسك من الكونسول (Firestore → Rules → الصق المحتوى الجديد → Publish).

### 3) ربط الـ Webhook في Paymob
Paymob Dashboard → Integrations → اختار الـ Integration بتاعتك → **Transaction Processed Callback** (و **Response Callback**):
```
https://mall-services.pages.dev/api/paymob-webhook
```
ده أهم خطوة — من غيرها الطلبات هتتسجل "قيد الانتظار" وبعدين تفضل معلّقة أبداً لأن مفيش حد هيأكدها.

### 4) اختبار
- جرّب دفع تجريبي (من غير ما تحط مفاتيح Paymob) وشوف إن الطلب اتسجل تلقائي (وضع Demo).
- بعد ما تحط مفاتيح Paymob الحقيقية، جرّب دفع حقيقي واتأكد إن الطلب بيظهر خلال ثواني في صفحة "طلباتي".
- جرّب زرار "تأكيد الاستلام" وشوف إن رصيد البائع بيتحدث فعلاً (كان معطّل تماماً قبل كده).

## حاجات لسه محتاجة شغل (مش الأولوية القصوى بس لازم قبل ما تشتغل بفلوس حقيقية)

- **Fawry / Stripe / PayPal**: السعر بقى محمي (بيتحسب من السيرفر)، بس لسه مفيش webhook حقيقي بيأكد الدفع زي Paymob. حالياً برضه بيعتمد على نفس نمط `pending_payments` لكن لازم توصيل الـ webhook بتاع كل بوابة بنفس الطريقة اللي عملتها لـ Paymob (`finalizePendingPayment` جاهزة تستقبل من أي مكان).
- **الرسوم الديناميكية (Tiers)**: لو بتستخدم نظام شرائح عمولة (`TIERS_ENABLED`) في `settings/platform`، السيرفر دلوقتي بيحسب بس Percent/Fixed/Both — لسه مش بيدعم الـ Tiers، فلو مفعّلها لازم تتوسع فيها في `calcFee()`.
