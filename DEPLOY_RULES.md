# نشر Firestore Rules — خطوات إلزامية

ملف `firestore.rules` الموجود في المشروع **لازم تنشره يدوياً على Firebase**.
Netlify بتستضيف الـ HTML/JS بس، مش بتنشر قواعد Firestore.

---

## الطريقة الأولى: Firebase CLI (الأسرع)

```bash
# لو مش عندك firebase-tools، نزّله أول مرة
npm install -g firebase-tools

# تسجيل الدخول
firebase login

# روح على مجلد المشروع
cd mall-v8

# نشر القواعد فقط (بدون ما تغير أي حاجة تانية)
firebase deploy --only firestore:rules
```

---

## الطريقة الثانية: Firebase Console (بدون CLI)

1. افتح [console.firebase.google.com](https://console.firebase.google.com)
2. اختار مشروعك `services-mall`
3. من القائمة الجانبية: **Firestore Database → Rules**
4. انسخ محتوى ملف `firestore.rules` بالكامل والصقه
5. اضغط **Publish**

---

## تأكيد النشر

بعد النشر، جرب:
- حذف خدمة من لوحة البائع ✓
- الدفع بالمحفظة ✓
- تأكيد استلام طلب (escrow release) ✓
