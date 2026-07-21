# 🚀 إعداد نظام المحتوى التلقائي

## الخطوة 1: أضف مفاتيح API على Netlify

على Netlify → Site Settings → Environment Variables:

| المتغير | الحصول عليه | الأهمية |
|---------|-------------|----------|
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/app/apikey) — مجاني | **ضروري** |
| `UNSPLASH_ACCESS_KEY` | [unsplash.com/developers](https://unsplash.com/developers) — مجاني | موصى به |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) | بديل Gemini |
| `FIREBASE_PROJECT_ID` | `services-mall` | للحفظ التلقائي |

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
4. المقال ينشر تلقائياً في المدونة!

## الجدول التلقائي

بعد إضافة `GEMINI_API_KEY`:
- كل يوم الساعة **9 صباحاً** (القاهرة) يُنشر مقالان تلقائياً
- المقالات تظهر في `/blog` و على الصفحة الرئيسية
- Sitemap يُحدَّث تلقائياً
- Google يُبلَّغ بالمحتوى الجديد

## الخطوة 4: ربط Google Analytics

في `index.html` ابحث عن `G-XXXXXXXXXX` واستبدله بـ ID الحقيقي من analytics.google.com

## الخطوة 5: AdSense

بعد تجميع 20-30 مقال:
1. قدّم على adsense.google.com
2. بعد الموافقة استبدل `.ad-slot` في `/blog/index.html` بكود AdSense
