// netlify/functions/ai-generate.js
// AI Article Generator — Gemini 1.5 Flash / OpenAI GPT-4o-mini
// Saves articles to Firebase Firestore automatically

const https = require('https');

// ── Topic bank ─────────────────────────────────────────────────────────────
const TOPICS = [
  { topic:'أفضل طرق الربح من الإنترنت في مصر 2025',        cat:'ربح-من-الانترنت', kw:['ربح من الإنترنت','دخل اون لاين','عمل من المنزل'] },
  { topic:'التسويق الرقمي للمبتدئين: دليل شامل',             cat:'تسويق-رقمي',       kw:['تسويق رقمي','فيسبوك أدس','سوشيال ميديا'] },
  { topic:'كيف تستخدم ChatGPT لتنمية أعمالك',               cat:'ذكاء-اصطناعي',     kw:['ChatGPT','ذكاء اصطناعي','AI'] },
  { topic:'إنشاء متجر إلكتروني ناجح خطوة بخطوة',            cat:'تجارة-الكترونية',   kw:['متجر إلكتروني','بيع أونلاين','Shopify'] },
  { topic:'العمل الحر: كيف تكسب 1000 دولار شهرياً',         cat:'عمل-حر',           kw:['فريلانسر','عمل حر','Upwork'] },
  { topic:'Paymob و InstaPay: دليل الدفع الإلكتروني',       cat:'دفع-الكتروني',     kw:['Paymob','InstaPay','دفع إلكتروني'] },
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

// ── Gemini API call ──────────────────────────────────────────────────────────
function callGemini(topic, keywords) {
  return new Promise((resolve, reject) => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return reject(new Error('GEMINI_API_KEY missing'));

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

    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.75, maxOutputTokens: 4096 },
    });

    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (!text) return reject(new Error('Empty Gemini response'));
          resolve(text);
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── OpenAI fallback ──────────────────────────────────────────────────────────
function callOpenAI(topic, keywords) {
  return new Promise((resolve, reject) => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return reject(new Error('OPENAI_API_KEY missing'));

    const body = JSON.stringify({
      model: 'gpt-4o-mini', max_tokens: 3500, temperature: 0.75,
      messages: [
        { role:'system', content:'أنت كاتب محتوى SEO عربي. تكتب HTML مباشرة بدون أي نص خارجه.' },
        { role:'user',   content:`اكتب مقالاً شاملاً 1500 كلمة بالعربية HTML عن: "${topic}". الكلمات المفتاحية: ${keywords.join(', ')}. ابدأ مباشرة بـ <p> أو <h2>.` },
      ],
    });

    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: { 'Content-Type':'application/json','Authorization':`Bearer ${key}`,'Content-Length':Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const text = json.choices?.[0]?.message?.content || '';
          if (!text) return reject(new Error('Empty OpenAI response'));
          resolve(text);
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Unsplash image ───────────────────────────────────────────────────────────
function fetchImage(query) {
  return new Promise((resolve) => {
    const key = process.env.UNSPLASH_ACCESS_KEY;
    if (!key) return resolve('https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80');
    const path = `/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
    const req = https.request(
      { hostname:'api.unsplash.com', path, headers:{ Authorization:`Client-ID ${key}` } },
      (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try {
            const j = JSON.parse(d);
            resolve(j.results?.[0]?.urls?.regular || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80');
          } catch { resolve('https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80'); }
        });
      }
    );
    req.on('error', () => resolve('https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80'));
    req.end();
  });
}

// ── Save to Firestore REST API (no SDK needed) ────────────────────────────────
function saveToFirestore(projectId, postData, accessToken) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      fields: Object.fromEntries(
        Object.entries(postData).map(([k,v]) => {
          if (typeof v === 'string')  return [k, { stringValue: v }];
          if (typeof v === 'boolean') return [k, { booleanValue: v }];
          if (typeof v === 'number')  return [k, { integerValue: String(v) }];
          if (Array.isArray(v))       return [k, { arrayValue: { values: v.map(s=>({ stringValue:s })) } }];
          return [k, { nullValue: null }];
        })
      ),
    });

    const req = https.request({
      hostname: 'firestore.googleapis.com',
      path:     `/v1/projects/${projectId}/databases/(default)/documents/blog_posts`,
      method:   'POST',
      headers: {
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Firebase Admin Token (service account) ───────────────────────────────────
function getFirebaseToken() {
  // If FIREBASE_SERVICE_ACCOUNT_KEY env var is set (JSON string), use it
  // Otherwise returns null and saves will fail gracefully
  return Promise.resolve(process.env.FIREBASE_ACCESS_TOKEN || null);
}

// ── Main handler ──────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin':  process.env.URL || 'https://services-mall2.netlify.app',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
    'Content-Type':                 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode:204, headers:CORS, body:'' };
  if (event.httpMethod !== 'POST')    return { statusCode:405, headers:CORS, body:JSON.stringify({error:'Method not allowed'}) };

  // ── Server-side admin check ────────────────────────────────────────────────
  // Set either ADMIN_SECRET or ADMIN_UIDS (comma-separated) in Netlify env vars
  // If neither is set, the function is open (backward compatible for existing deploys)
  const adminSecret = process.env.ADMIN_SECRET;
  const adminUids   = (process.env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const sentToken   = (event.headers['x-admin-token'] || '');

  if (adminSecret && sentToken !== adminSecret) {
    return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Forbidden: Admin access only' }) };
  }
  if (!adminSecret && adminUids.length > 0 && !adminUids.includes(sentToken)) {
    return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Forbidden: Admin UIDs check failed' }) };
  }

  try {
    const body   = JSON.parse(event.body || '{}');
    const action = body.action || 'generate';

    // ── Generate one article ──────────────────────────────────
    if (action === 'generate') {
      const topicObj = body.topic
        ? { topic:body.topic, cat:body.category||'عام', kw:body.keywords||[body.topic] }
        : TOPICS[Math.floor(Math.random() * TOPICS.length)];

      console.log('[AI] Generating:', topicObj.topic);

      // Generate content
      let content = '';
      try        { content = await callGemini(topicObj.topic, topicObj.kw); }
      catch (e1) {
        console.warn('[AI] Gemini failed:', e1.message, '— trying OpenAI');
        try        { content = await callOpenAI(topicObj.topic, topicObj.kw); }
        catch (e2) { throw new Error(`Both AI APIs failed: ${e1.message} / ${e2.message}`); }
      }

      if (!content || content.length < 100) throw new Error('AI returned empty content');

      // Clean any markdown fences
      content = content.replace(/^```html?\n?/,'').replace(/\n?```$/,'').trim();

      const image   = await fetchImage(topicObj.kw[0] || topicObj.topic);
      const postSlug = slug(topicObj.topic);

      const post = {
        title:           topicObj.topic,
        slug:            postSlug,
        excerpt:         excerpt(content),
        content,
        image,
        category:        topicObj.cat,
        keywords:        topicObj.kw,
        metaTitle:       `${topicObj.topic} | مول الخدمات`,
        metaDescription: excerpt(content).slice(0,155),
        published:       true,
        views:           0,
        aiGenerated:     true,
        createdAt:       new Date().toISOString(),
        updatedAt:       new Date().toISOString(),
      };

      // Save to Firestore
      const projectId = process.env.FIREBASE_PROJECT_ID || 'services-mall';
      const token     = await getFirebaseToken();
      let   docId     = null;

      try {
        const result = await saveToFirestore(projectId, post, token);
        docId = result.name?.split('/').pop() || null;
        console.log('[AI] ✅ Saved to Firestore:', docId);
      } catch(saveErr) {
        console.warn('[AI] Firestore save failed (article generated but not saved):', saveErr.message);
      }

      return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({ success:true, id:docId, slug:postSlug, title:topicObj.topic, preview:excerpt(content) }),
      };
    }

    // ── Bulk generate ─────────────────────────────────────────
    if (action === 'bulk') {
      const count   = Math.min(body.count || 2, 5);
      const results = [];
      for (let i = 0; i < count; i++) {
        try {
          const fakeEvent = { ...event, body: JSON.stringify({ action:'generate' }) };
          const res  = await exports.handler(fakeEvent);
          const data = JSON.parse(res.body);
          results.push(data);
          if (i < count-1) await new Promise(r => setTimeout(r, 3000));
        } catch(e) {
          results.push({ error: e.message });
        }
      }
      return { statusCode:200, headers:CORS, body:JSON.stringify({ success:true, results, count:results.filter(r=>r.success).length }) };
    }

    // ── Get topics list ───────────────────────────────────────
    if (action === 'topics') {
      return { statusCode:200, headers:CORS, body:JSON.stringify({ topics: TOPICS.map(t=>t.topic) }) };
    }

    return { statusCode:400, headers:CORS, body:JSON.stringify({ error:'Unknown action' }) };

  } catch(err) {
    console.error('[AI] Error:', err.message);
    return { statusCode:500, headers:CORS, body:JSON.stringify({ error:err.message }) };
  }
};
