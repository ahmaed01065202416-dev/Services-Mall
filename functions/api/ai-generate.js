// functions/api/ai-generate.js — Cloudflare Pages Function
// AI Article Generator — Gemini 1.5 Flash / OpenAI GPT-4o-mini
// Saves articles to Firebase Firestore automatically
// Route: /api/ai-generate (frontend calls this path directly)
//
// ⚠️ FIXED (was silently broken): this used to build its own raw Firestore
// REST call and authorize it with `env.FIREBASE_ACCESS_TOKEN` — a variable
// that was never set anywhere (not in .env.example, not derived from the
// service account). Every save ran with NO Authorization header, so
// `firestore.rules` (blog_posts requires isAdmin()) silently rejected every
// single write — articles were generated (burning Gemini/OpenAI credits)
// and then thrown away. Now reuses the same service-account auth as every
// other function (`_shared/gcp.js`), same pattern as payment.js/quality-score.js.
import { getAccessToken } from '../_shared/gcp.js';

// ── Topic bank ─────────────────────────────────────────────────────────────
const TOPICS = [
  { topic:'أفضل طرق الربح من الإنترنت في مصر 2025',        cat:'ربح-من-الانترنت', kw:['ربح من الإنترنت','دخل اون لاين','عمل من المنزل'] },
  { topic:'التسويق الرقمي للمبتدئين: دليل شامل',             cat:'تسويق-رقمي',       kw:['تسويق رقمي','فيسبوك أدس','سوشيال ميديا'] },
  { topic:'كيف تستخدم ChatGPT لتنمية أعمالك',               cat:'ذكاء-اصطناعي',     kw:['ChatGPT','ذكاء اصطناعي','AI'] },
  { topic:'إنشاء متجر إلكتروني ناجح خطوة بخطوة',            cat:'تجارة-الكترونية',   kw:['متجر إلكتروني','بيع أونلاين','Shopify'] },
  { topic:'العمل الحر: كيف تكسب 1000 دولار شهرياً',         cat:'عمل-حر',           kw:['فريلانسر','عمل حر','Upwork'] },
  { topic:'فواتيرك و InstaPay: دليل الدفع الإلكتروني',       cat:'دفع-الكتروني',     kw:['فواتيرك','InstaPay','دفع إلكتروني'] },
  { topic:'تصميم موقع احترافي بدون خبرة برمجية',            cat:'تصميم-مواقع',      kw:['تصميم موقع','WordPress','Webflow'] },
  { topic:'SEO العربي: تصدر جوجل في 30 يوم',                cat:'تحسين-بحث',        kw:['SEO عربي','تحسين محركات البحث','جوجل'] },
  { topic:'الاستثمار في العملات الرقمية للمبتدئين',          cat:'استثمار',           kw:['عملات رقمية','Bitcoin','استثمار'] },
  { topic:'أفضل تطبيقات الذكاء الاصطناعي المجانية 2025',    cat:'ذكاء-اصطناعي',     kw:['تطبيقات AI','أدوات ذكاء اصطناعي','مجانية'] },
  { topic:'كيف تبني قناة يوتيوب ناجحة وتجني منها المال',    cat:'ربح-من-الانترنت', kw:['يوتيوب','قناة يوتيوب','ربح من يوتيوب'] },
  { topic:'التسويق بالعمولة Affiliate Marketing شرح كامل',  cat:'تسويق-رقمي',       kw:['affiliate marketing','تسويق بالعمولة'] },
];

function slug(title) {
  return title.replace(/\s+/g,'-').replace(/[^\u0600-\u06FFa-zA-Z0-9-]/g,'').slice(0,70)
    + '-' + Date.now().toString(36);
}

function excerpt(html) {
  return html.replace(/<[^>]*>/g,'').trim().slice(0,160) + '…';
}

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  try { return JSON.parse(text); } catch (_) { return { raw: text }; }
}

// ── Gemini API call ──────────────────────────────────────────────────────────
// ⚠️ FIXED: two separate problems found together —
// 1. The model name was "gemini-1.5-flash", which Google fully retired
//    (all Gemini 1.0/1.5 models now 404) — every single call was failing.
//    Updated to a currently-supported model. Google renames/retires models
//    fairly often; if this starts failing again, check
//    https://ai.google.dev/gemini-api/docs/models for the current name.
// 2. fetchJSON() never checked the HTTP status, so a 404/error response body
//    (which still parses as valid JSON) silently fell through to "Empty
//    Gemini response" — hiding the real reason. Now surfaces whatever error
//    message Google actually returned.
const GEMINI_MODEL = 'gemini-3.7-flash';

async function callGemini(topic, keywords, key) {
  if (!key) throw new Error('GEMINI_API_KEY missing');

  const prompt = `أنت كاتب محتوى SEO عربي محترف.
اكتب مقالاً شاملاً بالعربية عن: "${topic}"
الكلمات المفتاحية: ${keywords.join(', ')}

الطول: 1500-2000 كلمة
التنسيق: HTML جاهز للنشر فقط (بدون أي نص خارج الـ HTML)

الهيكل المطلوب:
- مقدمة جذابة <p>
- 4-5 أقسام رئيسية <h2>
- نقاط فرعية <h3> عند الحاجة
- قوائم <ul><li>
- جدول مقارنة <table> إذا ناسب
- قسم أسئلة شائعة <h2>الأسئلة الشائعة</h2> مع <h3> و<p>
- خاتمة مع call to action

ابدأ مباشرة بالـ HTML بدون أي مقدمة نصية.`;

  const json = await fetchJSON(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.75, maxOutputTokens: 4096 },
      }),
    }
  );

  if (json.error) throw new Error(`Gemini API error: ${json.error.message || JSON.stringify(json.error)}`);
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Empty Gemini response — raw: ' + JSON.stringify(json).slice(0, 300));
  return text;
}

// ── OpenAI fallback ──────────────────────────────────────────────────────────
async function callOpenAI(topic, keywords, key) {
  if (!key) throw new Error('OPENAI_API_KEY missing');

  const json = await fetchJSON('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini', max_tokens: 3500, temperature: 0.75,
      messages: [
        { role:'system', content:'أنت كاتب محتوى SEO عربي. تكتب HTML مباشرة بدون أي نص خارجه.' },
        { role:'user',   content:`اكتب مقالاً شاملاً 1500 كلمة بالعربية HTML عن: "${topic}". الكلمات المفتاحية: ${keywords.join(', ')}. ابدأ مباشرة بـ <p> أو <h2>.` },
      ],
    }),
  });

  const text = json.choices?.[0]?.message?.content || '';
  if (json.error) throw new Error(`OpenAI API error: ${json.error.message || JSON.stringify(json.error)}`);
  if (!text) throw new Error('Empty OpenAI response');
  return text;
}

// ── Unsplash image ───────────────────────────────────────────────────────────
async function fetchImage(query, key) {
  const fallback = 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80';
  if (!key) return fallback;
  try {
    const j = await fetchJSON(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${key}` } }
    );
    return j.results?.[0]?.urls?.regular || fallback;
  } catch (_) { return fallback; }
}

// ── Save to Firestore REST API (no SDK needed) ────────────────────────────────
// Authorizes with a real service-account OAuth token (see header note above) —
// required because blog_posts writes are gated by isAdmin() in firestore.rules.
async function saveToFirestore(env, postData) {
  const accessToken = await getAccessToken(env);
  const fields = Object.fromEntries(
    Object.entries(postData).map(([k, v]) => {
      if (typeof v === 'string')  return [k, { stringValue: v }];
      if (typeof v === 'boolean') return [k, { booleanValue: v }];
      if (typeof v === 'number')  return [k, { integerValue: String(v) }];
      if (Array.isArray(v))       return [k, { arrayValue: { values: v.map(s => ({ stringValue: s })) } }];
      return [k, { nullValue: null }];
    })
  );

  return await fetchJSON(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/blog_posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ fields }),
  });
}

// ── Core generate-one-article logic (reused by 'generate' and 'bulk') ───────
async function generateOne(bodyIn, env) {
  const topicObj = bodyIn.topic
    ? { topic: bodyIn.topic, cat: bodyIn.category || 'عام', kw: bodyIn.keywords || [bodyIn.topic] }
    : TOPICS[Math.floor(Math.random() * TOPICS.length)];

  console.log('[AI] Generating:', topicObj.topic);

  let content = '';
  try { content = await callGemini(topicObj.topic, topicObj.kw, env.GEMINI_API_KEY); }
  catch (e1) {
    console.warn('[AI] Gemini failed:', e1.message, '— trying OpenAI');
    try { content = await callOpenAI(topicObj.topic, topicObj.kw, env.OPENAI_API_KEY); }
    catch (e2) { throw new Error(`Both AI APIs failed: ${e1.message} / ${e2.message}`); }
  }

  if (!content || content.length < 100) throw new Error('AI returned empty content');
  content = content.replace(/^```html?\n?/, '').replace(/\n?```$/, '').trim();

  const image = await fetchImage(topicObj.kw[0] || topicObj.topic, env.UNSPLASH_ACCESS_KEY);
  const postSlug = slug(topicObj.topic);

  const post = {
    title: topicObj.topic, slug: postSlug, excerpt: excerpt(content), content, image,
    category: topicObj.cat, keywords: topicObj.kw,
    metaTitle: `${topicObj.topic} | مول الخدمات`,
    metaDescription: excerpt(content).slice(0, 155),
    // Draft by default — an admin must review and press "نشر" in the
    // dashboard (already wired via AdminAI.togglePublish) before this goes
    // live and gets indexed by Google. Prevents unreviewed AI content from
    // being auto-published (Google spam policy risk + EEAT).
    published: false, needsReview: true, views: 0, aiGenerated: true,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };

  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error('FIREBASE_PROJECT_ID / FIREBASE_SERVICE_ACCOUNT not configured — cannot save article');
  }

  let docId = null;
  try {
    const result = await saveToFirestore(env, post);
    docId = result.name?.split('/').pop() || null;
    if (!docId) throw new Error(result.error?.message || 'Firestore did not return a document name');
    console.log('[AI] ✅ Saved to Firestore:', docId);
  } catch (saveErr) {
    // Don't report success:true for an article that was generated but never
    // saved — that used to happen silently and looked like a working feature.
    console.error('[AI] Firestore save failed:', saveErr.message);
    throw new Error(`Article generated but save failed: ${saveErr.message}`);
  }

  return { success: true, id: docId, slug: postSlug, title: topicObj.topic, preview: excerpt(content) };
}

function json(statusCode, headers, obj) {
  return new Response(JSON.stringify(obj), { status: statusCode, headers });
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function onRequest(context) {
  const { request, env } = context;
  const CORS = {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
    'Content-Type': 'application/json',
  };

  if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
  if (request.method !== 'POST') return json(405, CORS, { error: 'Method not allowed' });

  // ⚠️ FIXED: this used to be "if ADMIN_SECRET is set, ONLY the secret is
  // accepted — ADMIN_UIDS is only checked when ADMIN_SECRET is unset". But
  // the dashboard button (index.html AdminAI._fetchAI) always sends the
  // logged-in admin's Firebase uid as X-Admin-Token, never the secret — so
  // setting ADMIN_SECRET (which the docs call "highly recommended", for the
  // cron job) silently 403'd the dashboard button. Now: EITHER a matching
  // secret OR a whitelisted admin uid is accepted, independently.
  const adminSecret = env.ADMIN_SECRET;
  const adminUids = (env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const sentToken = request.headers.get('x-admin-token') || '';

  const okBySecret = !!adminSecret && sentToken === adminSecret;
  const okByUid     = adminUids.length > 0 && adminUids.includes(sentToken);

  if (!okBySecret && !okByUid) {
    // If neither mechanism is configured at all, fail closed (deny) rather
    // than silently allowing anyone — this endpoint spends AI API credits.
    return json(403, CORS, { error: 'Forbidden: Admin access only' });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'generate';

    if (action === 'generate') {
      const result = await generateOne(body, env);
      return json(200, CORS, result);
    }

    if (action === 'bulk') {
      const count = Math.min(body.count || 2, 5);
      const results = [];
      for (let i = 0; i < count; i++) {
        try {
          results.push(await generateOne({ action: 'generate' }, env));
          if (i < count - 1) await new Promise(r => setTimeout(r, 3000));
        } catch (e) {
          results.push({ error: e.message });
        }
      }
      return json(200, CORS, { success: true, results, count: results.filter(r => r.success).length });
    }

    if (action === 'topics') {
      return json(200, CORS, { topics: TOPICS.map(t => t.topic) });
    }

    return json(400, CORS, { error: 'Unknown action' });

  } catch (err) {
    console.error('[AI] Error:', err.message);
    return json(500, CORS, { error: err.message });
  }
}
