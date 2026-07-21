#!/usr/bin/env node
/**
 * seed-blog.js — Populate Firestore with demo blog posts
 * Run: node seed-blog.js
 *
 * Uses Firebase REST API — no firebase-admin SDK needed.
 * Requires: FIREBASE_API_KEY env var OR hardcoded below.
 */

const https = require('https');

// ── Config ──────────────────────────────────────────────────────────────────
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'services-mall';
const API_KEY    = process.env.FIREBASE_API_KEY    || 'AIzaSyDfWKWN5CTlBA-krEMXsmYmaI8j7fyuw20';

const POSTS = [
  {
    title: 'أفضل 10 طرق للربح من الإنترنت في مصر 2025',
    slug:  'افضل-طرق-الربح-من-الانترنت-مصر-2025',
    category: 'ربح-من-الانترنت',
    keywords: ['ربح من الإنترنت','عمل من المنزل','فريلانسر'],
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
    views: 4821,
    excerpt: 'دليل شامل لأفضل طرق كسب المال من الإنترنت في مصر 2025 — من الفريلانسينج إلى التجارة الإلكترونية ومحتوى يوتيوب.',
    content: `<p>يبحث الملايين عن طرق لتحقيق دخل إضافي من الإنترنت. في هذا المقال نستعرض أفضل 10 طرق مجربة وفعّالة في 2025.</p>
<h2>١. الفريلانسينج والعمل الحر</h2>
<p>العمل الحر هو أسرع طريقة للبدء. منصات مثل <strong>Upwork وFreelancer وMostaql</strong> تتيح لك تقديم مهاراتك لعملاء حول العالم.</p>
<ul><li>تصميم الجرافيك والهوية البصرية</li><li>برمجة المواقع والتطبيقات</li><li>كتابة المحتوى والترجمة</li><li>التسويق الرقمي وإدارة الإعلانات</li></ul>
<h2>٢. التجارة الإلكترونية</h2>
<p>بيع المنتجات عبر Jumia وAmazon أو إنشاء متجرك الخاص باستخدام Shopify أو WooCommerce.</p>
<h2>٣. قنوات يوتيوب</h2>
<p>إنشاء قناة في مجال تخصصك يمكن أن يدر دخلاً شهرياً ثابتاً من الإعلانات والرعايات بعد تجاوز 1000 مشترك و4000 ساعة مشاهدة.</p>
<h2>٤. التسويق بالعمولة</h2>
<p>Affiliate Marketing يتيح لك كسب عمولات على كل عملية بيع تتم من خلال روابطك الخاصة على منصات مثل Amazon Associates وJumia Affiliate.</p>
<h2>٥. بيع الدورات التعليمية</h2>
<p>إذا كنت خبيراً في مجال ما، يمكنك تسجيل دورة تعليمية وبيعها على Udemy أو إنشاء منصتك الخاصة.</p>
<h2>٦. كتابة المحتوى والتدوين</h2>
<p>إنشاء مدونة متخصصة في موضوع محدد والربح منها عبر الإعلانات (AdSense) والتسويق بالعمولة.</p>
<h2>٧. التصميم والفن الرقمي</h2>
<p>بيع تصاميمك على مواقع مثل Shutterstock وFreepik وEtsy للمشترين حول العالم.</p>
<h2>٨. خدمات إدارة السوشيال ميديا</h2>
<p>الشركات الصغيرة تبحث باستمرار عمن يدير حسابات السوشيال ميديا الخاصة بها.</p>
<h2>٩. الاستثمار في العملات والأسهم</h2>
<p>مع المعرفة الكافية، يمكن الاستثمار في البورصة المصرية أو منصات الفوركس المرخصة.</p>
<h2>١٠. تقديم الخدمات على مول الخدمات</h2>
<p>منصة <strong>مول الخدمات</strong> تتيح لك عرض خدماتك لآلاف العملاء مع ضمان الدفع الآمن عبر نظام Escrow.</p>
<h2>الأسئلة الشائعة</h2>
<h3>كم يمكن ربحه شهرياً من الإنترنت في مصر؟</h3>
<p>يتراوح الدخل بين 2,000 و50,000 جنيه شهرياً حسب المجال والمهارة والوقت المستثمر.</p>
<h3>ما أسرع طريقة للبدء؟</h3>
<p>الفريلانسينج هو الأسرع — يمكنك البدء في أسبوع واحد إذا كانت لديك مهارة قابلة للبيع.</p>`,
  },
  {
    title: 'كيف تستخدم ChatGPT لتنمية أعمالك في 2025',
    slug:  'استخدام-chatgpt-تنمية-الاعمال-2025',
    category: 'ذكاء-اصطناعي',
    keywords: ['ChatGPT','ذكاء اصطناعي','AI للأعمال'],
    image: 'https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=1200&q=80',
    views: 5124,
    excerpt: 'دليل عملي لاستخدام ChatGPT وأدوات الذكاء الاصطناعي لأتمتة أعمالك وزيادة إنتاجيتك بشكل كبير.',
    content: `<p>أصبح الذكاء الاصطناعي أداة لا غنى عنها لأي عمل تجاري يريد التنافس في 2025. ChatGPT وحده غيّر طريقة عمل ملايين المحترفين حول العالم.</p>
<h2>١. كتابة المحتوى التسويقي</h2>
<p>استخدم ChatGPT لكتابة:</p>
<ul><li>منشورات السوشيال ميديا بكميات كبيرة</li><li>رسائل البريد الإلكتروني التسويقية</li><li>أوصاف المنتجات للمتاجر الإلكترونية</li><li>مقالات المدونة الأولية</li></ul>
<h2>٢. خدمة العملاء الآلية</h2>
<p>يمكن تدريب ChatGPT على منتجاتك وخدماتك ليجيب على أسئلة العملاء على مدار الساعة، مما يوفر وقت فريقك.</p>
<h2>٣. تحليل البيانات والتقارير</h2>
<p>أرسل بيانات مبيعاتك أو تقاريرك لـ ChatGPT واطلب منه تحليلها واستخراج الرؤى المهمة.</p>
<h2>٤. برمجة وتطوير المنتجات</h2>
<p>المطورون يستخدمون GitHub Copilot وChatGPT لكتابة الكود، مما يضاعف إنتاجيتهم.</p>
<h2>٥. البحث والتحليل التنافسي</h2>
<p>اطلب من ChatGPT تحليل منافسيك واقتراح استراتيجيات للتميز عنهم في السوق.</p>
<h2>أفضل أدوات AI للأعمال</h2>
<table><thead><tr><th>الأداة</th><th>الاستخدام</th><th>السعر</th></tr></thead><tbody>
<tr><td>ChatGPT</td><td>كتابة ومحادثة</td><td>مجاني / $20</td></tr>
<tr><td>Gemini</td><td>بحث وتحليل</td><td>مجاني</td></tr>
<tr><td>Midjourney</td><td>توليد صور</td><td>$10/شهر</td></tr>
<tr><td>Claude</td><td>تحليل نصوص طويلة</td><td>مجاني / $20</td></tr>
</tbody></table>
<h2>الأسئلة الشائعة</h2>
<h3>هل يمكن الاعتماد على ChatGPT بالكامل في الكتابة؟</h3>
<p>لا — استخدمه كمساعد وراجع دائماً ما يكتبه قبل النشر. المحتوى يحتاج لمسة إنسانية.</p>`,
  },
  {
    title: 'SEO للمواقع العربية: تصدر جوجل في 2025',
    slug:  'seo-مواقع-عربية-2025',
    category: 'تحسين-بحث',
    keywords: ['SEO عربي','تحسين محركات البحث','تصدر جوجل'],
    image: 'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=1200&q=80',
    views: 3890,
    excerpt: 'دليل شامل لتحسين محركات البحث للمواقع العربية وكيف تحقق المركز الأول في نتائج جوجل.',
    content: `<p>يحصل أكثر من 90٪ من الزيارات على أول 3 نتائج في جوجل. إذا لم يكن موقعك في الصفحة الأولى، فأنت غير موجود. هذا الدليل يشرح كيف تغير ذلك.</p>
<h2>أساسيات SEO العربي</h2>
<p>تحسين محركات البحث للمواقع العربية له خصوصية مهمة:</p>
<ul><li>الكلمات المفتاحية العربية أقل تنافسية من الإنجليزية</li><li>السوق العربي أقل اشباعاً = فرص أكبر</li><li>البحث الصوتي بالعربية ينمو بسرعة</li></ul>
<h2>البحث عن الكلمات المفتاحية</h2>
<p>أدوات مجانية وفعّالة:</p>
<ul><li><strong>Google Keyword Planner</strong> — مجاني مع حساب Google Ads</li><li><strong>Ubersuggest</strong> — نتائج جيدة للسوق العربي</li><li><strong>Answer The Public</strong> — لمعرفة الأسئلة الأكثر بحثاً</li></ul>
<h2>SEO الصفحة (On-Page SEO)</h2>
<p>كل صفحة يجب أن تحتوي على:</p>
<ul><li>عنوان H1 واحد يحتوي على الكلمة المفتاحية الرئيسية</li><li>Meta Description جذاب بين 150-160 حرف</li><li>صور محسّنة مع Alt Text بالعربية</li><li>روابط داخلية لصفحات ذات صلة</li></ul>
<h2>SEO التقني</h2>
<ul><li>سرعة التحميل أقل من 3 ثواني</li><li>تصميم متجاوب للموبايل</li><li>ملف sitemap.xml محدّث</li><li>شهادة SSL (HTTPS)</li></ul>
<h2>بناء الروابط الخارجية</h2>
<p>احصل على روابط من مواقع عربية موثوقة عبر:</p>
<ul><li>كتابة مقالات ضيف</li><li>الإعلانات في المنتديات</li><li>التواجد في الأدلة العربية</li></ul>
<h2>الأسئلة الشائعة</h2>
<h3>كم من الوقت يستغرق ظهور نتائج SEO؟</h3>
<p>عادةً 3-6 أشهر للكلمات التنافسية، وأقل من شهر للكلمات طويلة الذيل (long tail).</p>`,
  },
  {
    title: 'دليل بوابات الدفع الإلكتروني في مصر 2025',
    slug:  'بوابات-دفع-الكتروني-مصر-2025',
    category: 'دفع-الكتروني',
    keywords: ['Paymob','InstaPay','دفع إلكتروني مصر'],
    image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&q=80',
    views: 2567,
    excerpt: 'مقارنة شاملة بين Paymob وInstaPay وفوري وPayPal — اختر الأنسب لعملك في مصر.',
    content: `<p>اختيار بوابة الدفع المناسبة يؤثر مباشرة على معدلات تحويل متجرك الإلكتروني. هذا المقال يقارن أبرز الخيارات المتاحة في مصر.</p>
<h2>مقارنة بوابات الدفع</h2>
<table><thead><tr><th>البوابة</th><th>الرسوم</th><th>المدفوعات</th><th>الأنسب</th></tr></thead><tbody>
<tr><td>Paymob</td><td>1.5-2.5%</td><td>بطاقات + محافظ</td><td>المتاجر الكبيرة</td></tr>
<tr><td>InstaPay</td><td>مجاني</td><td>تحويل بنكي</td><td>الأفراد</td></tr>
<tr><td>فوري</td><td>ثابتة</td><td>كاش ونقاط</td><td>العملاء بدون بطاقات</td></tr>
<tr><td>PayPal</td><td>2.9%+</td><td>دولي</td><td>العملاء الأجانب</td></tr>
</tbody></table>
<h2>Paymob — الخيار الأول للتجار</h2>
<p>Paymob هي أكبر بوابة دفع في مصر وتدعم:</p>
<ul><li>البطاقات البنكية (Visa, Mastercard, Meeza)</li><li>Vodafone Cash, Orange Money, Etisalat Cash</li><li>فوري Pay</li><li>تقسيط بدون فوائد</li></ul>
<h2>InstaPay — التحويلات الفورية</h2>
<p>أطلقه البنك المركزي المصري 2022 ويتيح تحويلات فورية مجانية بين جميع البنوك المصرية على مدار الساعة.</p>
<h2>نظام Escrow في مول الخدمات</h2>
<p>منصة مول الخدمات تستخدم نظام Escrow المتكامل الذي يدعم جميع وسائل الدفع مع ضمان أموال المشتري والبائع.</p>
<h2>الأسئلة الشائعة</h2>
<h3>أي بوابة دفع أنسب للمتاجر الصغيرة؟</h3>
<p>Paymob للتكامل الكامل، أو InstaPay للمبدئين بدون رسوم.</p>`,
  },
  {
    title: 'العمل الحر في مصر: كيف تكسب 5000 جنيه أسبوعياً',
    slug:  'عمل-حر-مصر-5000-جنيه',
    category: 'عمل-حر',
    keywords: ['عمل حر','فريلانسر مصر','كسب المال'],
    image: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=1200&q=80',
    views: 3120,
    excerpt: 'دليل عملي للبدء في العمل الحر في مصر وكيف تصل لدخل 5000 جنيه أسبوعياً خلال 3 أشهر.',
    content: `<p>آلاف المصريين يحققون دخلاً يفوق راتبهم الشهري من خلال العمل الحر. هذا الدليل يشرح خارطة الطريق بالتفصيل.</p>
<h2>اختيار التخصص المناسب</h2>
<p>أكثر المجالات طلباً وربحاً في السوق المصري:</p>
<ul><li><strong>تصميم الجرافيك:</strong> 500-3000 جنيه للمشروع الواحد</li><li><strong>تطوير المواقع:</strong> 2000-15000 جنيه</li><li><strong>كتابة المحتوى:</strong> 50-200 جنيه لكل 1000 كلمة</li><li><strong>إدارة الإعلانات:</strong> 1000-5000 جنيه شهرياً</li></ul>
<h2>بناء محفظة أعمال قوية</h2>
<p>قبل البحث عن عملاء، بنِ محفظة أعمال تُظهر مهاراتك:</p>
<ul><li>نفّذ 3-5 مشاريع تجريبية (حتى مجانية)</li><li>اعرضها على Behance أو GitHub أو موقعك الخاص</li><li>احصل على شهادات توصية من أول عملاء</li></ul>
<h2>إيجاد العملاء</h2>
<ul><li><strong>مول الخدمات</strong> — الأفضل للسوق العربي</li><li>Mostaql — للمشاريع العربية</li><li>Upwork — للعملاء الأجانب (دولار)</li><li>LinkedIn — للتواصل مع الشركات</li></ul>
<h2>تسعير خدماتك</h2>
<p>معادلة بسيطة: <strong>تكلفة وقتك × 3</strong> = سعر الخدمة. لا تبيع بسعر رخيص جداً — هذا يضر بسمعتك.</p>
<h2>الأسئلة الشائعة</h2>
<h3>كم من الوقت يلزم للوصول لـ 5000 جنيه أسبوعياً؟</h3>
<p>بتخصص واضح وعمل جاد: 2-4 أشهر.</p>`,
  },
];

function toFirestoreField(val) {
  if (typeof val === 'string')  return { stringValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number')  return { integerValue: String(val) };
  if (Array.isArray(val))       return { arrayValue: { values: val.map(toFirestoreField) } };
  return { stringValue: String(val) };
}

function postDoc(post) {
  const now = new Date().toISOString();
  return {
    fields: Object.fromEntries(
      Object.entries({ ...post, published: true, aiGenerated: false, createdAt: now, updatedAt: now })
        .map(([k, v]) => [k, toFirestoreField(v)])
    ),
  };
}

function firebaseRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}?key=${API_KEY}`;
    const u   = new URL(url);
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch(e) { resolve({ raw: d }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function seed() {
  console.log('🌱 Seeding', POSTS.length, 'blog posts to Firebase...\n');
  let ok = 0;
  for (const post of POSTS) {
    try {
      const result = await firebaseRequest('blog_posts', 'POST', postDoc(post));
      if (result.name) {
        console.log('  ✅', post.title.slice(0, 50));
        ok++;
      } else {
        console.log('  ❌', post.title.slice(0, 40), '—', result.error?.message || 'unknown error');
      }
    } catch (e) {
      console.log('  ❌', post.title.slice(0, 40), '—', e.message);
    }
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n✅ Seeded ${ok}/${POSTS.length} posts`);
  console.log('\nNext steps:');
  console.log('  1. Add GEMINI_API_KEY to Netlify env vars');
  console.log('  2. Set your Firestore user role to "admin"');
  console.log('  3. Visit /blog to see the articles\n');
}

seed().catch(console.error);
