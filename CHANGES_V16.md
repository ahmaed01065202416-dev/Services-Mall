# v16 — تصميمين للموقع + تبديل من الأدمن

## الفكرة
- التصميم 1 `navy` (كحلي وذهبي): هو الأساسي (v15) — شكله زي ما هو.
- التصميم 2 `mint` (نعناع وذهب — هوية البراند): صفحة رئيسية جديدة + باليت/خطوط على الموقع كله.
- الأدمن: لوحة الأدمن ← تاب «تصميم الموقع» ← اختيار ← «حفظ وتفعيل للجميع». الاختيار بيتخزن في
  `settings/platform.SITE_DESIGN` (القراءة public والكتابة admin — من غير أي تعديل في firestore.rules).
- التطبيق: `<html data-design="navy|mint">`. بيتحدد قبل أول رسم من localStorage (js/design.js)،
  وبعد تحميل الإعدادات `constants.js` بيستدعي `MallDesign.sync()` فيتحدّث للجميع في الزيارة اللي بعدها.

## ملفات جديدة
- `js/design.js` — التبديل + رندر تاب الأدمن + نقل صندوق البحث بين التصميمين.
- `css/mall-design-mint.css` — متغيرات `--m-*` (نهاري/ليلي) + خط Reem Kufi للعناوين + إظهار/إخفاء الرئيسية.
- `css/mall-home-b.css`, `js/mall-home-b.js` — الرئيسية الجديدة (كل الـ CSS تحت `#mallDesignB` وكل الكلاسات بـ `mb-`).

## ملفات معدّلة
- `index.html` — خطوط/CSS/JS الجديدة، ماركاب `#mallDesignB` بعد `#mallDesign`، رفع أرقام `?v=`.
- `js/constants.js` — `PLATFORM.SITE_DESIGN` + استدعاء `MallDesign.sync`.
- `js/dashboard.js` — زر وتاب «تصميم الموقع».
- `404.html`, `privacy.html`, `terms.html` — بيحملوا design.js + CSS التصميم.
- `sw.js` — `LOCAL_CACHE` → v3.24-design + الملفات الجديدة.

## إصلاح التهنيج / المساحة الزرقا (التصميم الكحلي)
- السبب: `css/mall-extra.css` كان بيعمل `html,body{overflow-x:hidden}` فيخلي الـ body scroll container،
  وده بيكسر الـ pin بتاع GSAP (`end:'+=500%'`).
- الحل: `overflow-x:clip` + قسم «قصة البيع» بقى `position:sticky` (ارتفاع 400vh) بدل `pin`.
  أنيميشن السكرول متشالش: نفس الـ timeline والخطوات، بس من غير pin spacer.
