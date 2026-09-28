# 🚀 إعداد نظام المحتوى التلقائي

## الخطوة 1: أضف مفاتيح API على Cloudflare Pages

Cloudflare dashboard → مشروع الـ Pages بتاعك → Settings → Environment Variables:

| المتغير | الحصول عليه | الأهمية |
|---------|-------------|----------|
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/app/apikey) — مجاني | **ضروري** |
| `UNSPLASH_ACCESS_KEY` | [unsplash.com/developers](https://unsplash.com/developers) — مجاني | موصى به |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) | بديل Gemini |
| `FIREBASE_PROJECT_ID` | من Firebase Console | للحفظ التلقائي |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Console → Service accounts | **ضروري** (راجع `.env.example`) |
| `ADMIN_SECRET` أو `ADMIN_UIDS` | تحدده انت | يحمي زرار توليد المقال من أي حد |

## الخطوة 2: اجعل حسابك Admin

1. سجّل دخول على الموقع بحساب Google
2. في Firebase Console → Firestore → مجموعة `users`
3. ابحث عن مستندك (بالـ UID)
4. أضف حقل: `role` = `"admin"`
5. ادخل الموقع ← ستجد زر "الإدارة" في القائمة

## الخطوة 3: توليد أول مقال

1. ادخل لوحة التحكم من القائمة
2. اضغط "توليد مقال AI الآن"
3. انتظر 20-40 ثانية
4. ⚠️ المقال بيتحفظ كـ **مسودة (Draft)** مش بينشر تلقائي — لازم تراجعه وتضغط
   "نشر" بجانبه في جدول المقالات بلوحة التحكم قبل ما يظهر للزوار أو يتفهرس
   في جوجل. ده متعمد (مراجعة بشرية قبل النشر لحماية الـ SEO).

## الجدول التلقائي (cron-worker)

بعد إضافة `GEMINI_API_KEY` ونشر الـ Worker المنفصل في `cron-worker/`:
- كل يوم الساعة **9 صباحاً** (القاهرة) يتولّد مقالان تلقائياً **كمسودة** —
  لسه محتاجين مراجعتك ونشرهم يدوياً من لوحة التحكم.
- نفس الجدول بيحدّث نقاط جودة البائعين (Quality Score) ويحصّل الاشتراكات
  الشهرية المستحقة تلقائياً (راجع `cron-worker/index.js`).
- Sitemap يتحدّث تلقائياً للمقالات المنشورة فقط.
- Google يُبلَّغ بالمحتوى الجديد بعد النشر.

## الخطوة 4: ربط Google Analytics

في `index.html` ابحث عن `G-XXXXXXXXXX` واستبدله بـ ID الحقيقي من analytics.google.com

## الخطوة 5: AdSense

بعد تجميع 20-30 مقال منشور فعلياً (مش مسودة):
1. قدّم على adsense.google.com
2. بعد الموافقة استبدل `.ad-slot` في `/blog/index.html` بكود AdSense
