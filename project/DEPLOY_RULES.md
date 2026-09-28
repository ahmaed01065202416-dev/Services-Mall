# نشر Firestore + Realtime Database Rules — خطوات إلزامية

ملفات `firestore.rules` و `database.rules.json` الموجودة في المشروع **لازم
تتنشر يدوياً على Firebase**. Cloudflare Pages بتستضيف الـ HTML/JS ونداءات
الـ API بس — مش بتنشر قواعد أمان Firebase، ده لازم يحصل من جهتك بشكل منفصل.

⚠️ **مهم جداً**: لو عدّلت `firestore.rules` ومنشرتهاش، التعديلات دي (بما فيها
إصلاح ثغرة تصعيد الصلاحيات في مجموعة `users`) **مش شغالة فعلياً** على
الموقع الحي، حتى لو الكود نفسه اتحدّث.

---

## الطريقة الأولى: Firebase CLI (الأسرع)

```bash
# لو مش عندك firebase-tools، نزّله أول مرة
npm install -g firebase-tools

# تسجيل الدخول
firebase login

# روح على مجلد المشروع
cd mall-v8

# نشر قواعد Firestore + Realtime Database معاً
firebase deploy --only firestore:rules,database
```

---

## الطريقة الثانية: Firebase Console (بدون CLI)

**Firestore:**
1. افتح [console.firebase.google.com](https://console.firebase.google.com)
2. اختار مشروعك
3. من القائمة الجانبية: **Firestore Database → Rules**
4. انسخ محتوى ملف `firestore.rules` بالكامل والصقه
5. اضغط **Publish**

**Realtime Database (نظام الشات):**
1. من القائمة الجانبية: **Realtime Database → Rules**
2. انسخ محتوى ملف `database.rules.json` والصقه
3. اضغط **Publish**

---

## تأكيد النشر

بعد النشر، جرب:
- حذف خدمة من لوحة البائع ✓
- الدفع عبر فواتيرك (الطريقة الوحيدة المتاحة) ✓
- تأكيد استلام طلب (escrow release) ✓
- **حاول من حساب مشتري عادي (مش أدمن) تفتح Console وتنفّذ:**
  `db.collection('users').doc(myUid).update({role:'admin'})` — **لازم يترفض**
  برسالة `Missing or insufficient permissions`. لو نجحت، القواعد لسه القديمة.
