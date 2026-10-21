# برنامج التسويق بالرابط (v11)
- كل المفاتيح مقفولة افتراضيًا. الأدمن: لوحة الأدمن ← «التسويق بالرابط» (الإعدادات + الباقات)، و«دروبشيبنج» ← مفتاح «تفعيل برنامج المسوّقين» (زرار ابدأ كمسوّق).
- المسوّق: «متجري» ← «منتجات التسويق».
- لازم تنشر firestore.rules الجديد (collections: affiliate_*, marketer_*) قبل الاستخدام.
- تغيير بوابة الدفع: functions/_shared/gateway.js + webhook المقابل.
- اختبارات: node --test tests/affiliate.test.mjs tests/dropship-split.test.mjs
