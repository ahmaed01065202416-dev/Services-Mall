// functions/_shared/seo-writer.js
// Automatic SEO article system for the blog (Firestore collection `blog_posts`).
//
//   discoverKeywords()  real search phrases (Google autocomplete, Arabic/Egypt) — free, no key
//   suggestAngles()     N different angles / titles for ONE topic (so one topic can become several articles)
//   generateArticle()   plan → write sections in parallel → images → FAQ → dedupe → keyword slug → save
//   runTick()           what the scheduler (GitHub Action) calls: reads settings/seoAuto, decides if it is time,
//                       picks the next topic (or invents one), writes ONE article, optionally publishes it.
//
// Safety defaults: drafts for human review (published:false, needsReview:true). Auto-publish only when the admin
// switches publishMode to "auto" in the dashboard, capped by autoMaxPerDay.
//
// Subrequest budget per article (Workers Free plan allows 50): ~3 suggest + 1 dedupe + 1 plan + 8 writing + 4 image
// searches + 4 download pings + 1-3 Firestore ≈ 25.
import { fsQuery, fsGet, fsSet, fsCreate } from './gcp.js';
import { askWriter, parseJsonLoose } from './ai-write.js';

export const CATEGORIES = ['ربح-من-الانترنت', 'تسويق-رقمي', 'ذكاء-اصطناعي', 'تجارة-الكترونية', 'عمل-حر', 'دفع-الكتروني', 'تصميم-مواقع', 'تحسين-بحث', 'استثمار'];

export const DEFAULT_SETTINGS = {
  enabled: false,
  intervalHours: 24,
  publishMode: 'review',          // 'review' (draft, you approve) | 'auto' (published automatically)
  autoMaxPerDay: 1,
  providerOrder: 'cloudflare,gemini',
  topics: [],                      // lines: "topic" or "topic | category"
  usedTopics: [],
  siteProfile: 'مول الخدمات منصة مصرية لبيع وشراء الخدمات والمنتجات: فيها متاجر للبائعين، وخدمات مستقلين (تصميم وبرمجة وتسويق وكتابة)، ومنتجات رقمية، وحماية للمشتري بنظام ضمان الاستلام (Escrow)، ودفع إلكتروني بالطرق المحلية.',
  lastRunAt: '',
  lastResult: '',
};

const DEFAULT_INDEXNOW_KEY = 'ba79750a139a77256f06ac61d56b47f4';   // public by design (served at /<key>.txt)

// ───────────────────────────── helpers ─────────────────────────────
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nowIso = () => new Date().toISOString();
const siteOf = (env) => String(env.SITE_URL || 'https://mall-services.pages.dev').trim().replace(/\/+$/, '');
const CJK = /[\u3400-\u9fff\uac00-\ud7af\u3040-\u30ff]/;

export async function getSettings(env) {
  const d = await fsGet(env, 'settings/seoAuto').catch(() => null);
  const s = { ...DEFAULT_SETTINGS, ...(d || {}) };
  s.topics = Array.isArray(s.topics) ? s.topics : [];
  s.usedTopics = Array.isArray(s.usedTopics) ? s.usedTopics : [];
  s.intervalHours = Math.max(3, Math.min(168, Number(s.intervalHours) || 24));
  s.autoMaxPerDay = Math.max(1, Math.min(4, Number(s.autoMaxPerDay) || 1));
  return s;
}

function cleanText(s) {
  return String(s || '')
    .replace(/[\u3400-\u9fff\uac00-\ud7af\u3040-\u30ff]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\*{3,}/g, '')
    .replace(/(^|\n)\s*(في الختام|ختامًا|ختاما|خلاصة القول)\s*[،,:]\s*/g, '$1')
    .replace(/(ومن الجدير بالذكر|تجدر الإشارة إلى|لا شك أن|من الجدير بالذكر)\s*(أن)?\s*/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function inline(s) {
  return esc(s)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*(?!\s)([^*]+?)\*(?=[\s).,،؛:!؟]|$)/g, '$1<em>$2</em>');
}

/** Small, SAFE markdown → HTML (everything is escaped first; only p/ul/ol/li/h3/strong/em are produced). */
export function mdToHtml(md) {
  const lines = String(md || '').replace(/\r/g, '').split('\n');
  const out = []; let para = []; let list = null;
  const flushP = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
  const flushL = () => { if (list) { out.push('<' + list.t + '>' + list.items.map(i => '<li>' + inline(i) + '</li>').join('') + '</' + list.t + '>'); list = null; } };
  for (const raw of lines) {
    const l = raw.trim(); let m;
    if (!l) { flushP(); flushL(); continue; }
    if ((m = l.match(/^#{1,4}\s*(.+)$/))) { flushP(); flushL(); out.push('<h3>' + inline(m[1]) + '</h3>'); continue; }
    if ((m = l.match(/^[-*•]\s+(.+)$/))) { flushP(); if (!list || list.t !== 'ul') { flushL(); list = { t: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = l.match(/^\d+\s*[.)\-]\s+(.+)$/))) { flushP(); if (!list || list.t !== 'ol') { flushL(); list = { t: 'ol', items: [] }; } list.items.push(m[1]); continue; }
    flushL(); para.push(l.replace(/^>\s?/, ''));
  }
  flushP(); flushL();
  return out.join('\n');
}

export function makeSlug(words) {
  const s = String(words || '')
    .replace(/[\u064B-\u065F\u0640]/g, '')
    .replace(/[^\u0600-\u06FFa-zA-Z0-9\s-]/g, ' ')
    .trim().replace(/\s+/g, '-').replace(/-+/g, '-').toLowerCase();
  const STOP = new Set(['في', 'من', 'على', 'عن', 'الى', 'إلى', 'مع', 'و', 'او', 'أو']);
  const parts = s.split('-').filter(Boolean).slice(0, 7);
  while (parts.length > 2 && STOP.has(parts[parts.length - 1])) parts.pop();
  let out = parts.join('-');
  if (out.length > 64) out = out.slice(0, 64).replace(/-[^-]*$/, '');
  return out;
}

const norm = (t) => String(t || '').replace(/[\u064B-\u065F\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^\u0600-\u06FFa-z0-9\s]/gi, ' ')
  .split(/\s+/).map(w => w.replace(/^ال/, '')).filter(w => w.length > 2);
export function similarity(a, b) {
  const A = new Set(norm(a)), B = new Set(norm(b));
  if (!A.size || !B.size) return 0;
  let i = 0; A.forEach(w => { if (B.has(w)) i++; });
  return i / (A.size + B.size - i);
}

const wordsIn = (html) => String(html || '').replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;

// ───────────────────────────── keyword discovery ─────────────────────────────
async function googleSuggest(q) {
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch('https://suggestqueries.google.com/complete/search?client=firefox&hl=ar&gl=eg&q=' + encodeURIComponent(q), { signal: ctrl.signal });
    clearTimeout(t);
    const j = await r.json();
    return Array.isArray(j && j[1]) ? j[1].map(String) : [];
  } catch (_) { return []; }
}

/** Phrases people really type into Google (Arabic, Egypt). Not search VOLUME — Google does not publish that for free. */
export async function discoverKeywords(seed) {
  const lists = await Promise.all([googleSuggest(seed), googleSuggest('كيف ' + seed), googleSuggest(seed + ' في مصر')]);
  const seen = new Set(); const out = [];
  for (const p of lists.flat()) {
    const k = p.trim(); const key = k.replace(/\s+/g, ' ');
    if (key.length < 6 || key.length > 70 || seen.has(key)) continue;
    seen.add(key); out.push(key);
  }
  return out.slice(0, 14);
}

// ───────────────────────────── existing posts (dedupe + internal links) ─────────────────────────────
async function existingPosts(env) {
  try {
    const rows = await fsQuery(env, {
      from: [{ collectionId: 'blog_posts' }],
      select: { fields: [{ fieldPath: 'title' }, { fieldPath: 'slug' }, { fieldPath: 'category' }, { fieldPath: 'published' }, { fieldPath: 'createdAt' }] },
      limit: 400,
    });
    return rows.map(r => ({ id: r.id, title: r.title || '', slug: r.slug || '', category: r.category || '', published: !!r.published, createdAt: r.createdAt || '' }));
  } catch (_) { return []; }
}

// ───────────────────────────── writing prompts ─────────────────────────────
const STYLE = `أسلوب الكتابة (مهم جدًا):
- عربية فصحى مبسّطة بنَفَس مصري خفيف، كأنك صاحب خبرة بتشرح لصاحبه. نوّع طول الجمل، وبعضها قصير جدًا.
- خاطب القارئ مباشرة ("لو بتبيع...", "تخيّل إنك...") ومثّل بمواقف واقعية من السوق المصري (فيسبوك، واتساب، إنستاباي، شحن، عملاء).
- ممنوع العبارات المحفوظة: "في عالمنا اليوم"، "في ظل التطور"، "لا شك أن"، "من الجدير بالذكر"، "تجدر الإشارة"، "في الختام"، "يعد من أهم"، "في هذا المقال سنتناول"، "ثورة"، "عصر الرقمنة".
- لا تبدأ فقرتين متتاليتين بنفس الكلمة، ولا تكرر نفس الصياغة بين الأقسام.
- كن محددًا: أمثلة وخطوات وأخطاء شائعة ونصائح قابلة للتنفيذ. تجنّب الحشو والكلام العام.
- لا تخترع إحصائيات أو أرقامًا دقيقة أو أسماء دراسات أو شركات أو أشخاص. لو مش متأكد اكتب بصيغة عامة.
- لا إيموجي. لا مقدمات مثل "بالتأكيد" أو "إليك". اكتب بالعربية فقط (مسموح بمصطلحات إنجليزية قليلة مثل SEO).`;

const SYSTEM_PLAN = 'أنت محرر محتوى SEO عربي خبير. تُخرج JSON صالحًا فقط، بدون أي نص قبله أو بعده، وبدون علامات ```.';
const SYSTEM_WRITE = 'أنت كاتب مقالات عربي محترف وصاحب خبرة عملية. تكتب نصًا جاهزًا للنشر فقط، بدون أي شرح عن عملك.';

async function writer(env, order, opts) {
  try { return await askWriter(env, opts, order); }
  catch (e1) {
    // one more attempt (transient 429 / timeout), slightly cooler
    return await askWriter(env, { ...opts, temperature: Math.max(0.4, (opts.temperature || 0.8) - 0.2) }, order);
  }
}

/** N different angles (different search intent) for one topic — each can become its own article. */
export async function suggestAngles(env, { topic, count = 3, order }) {
  const kws = await discoverKeywords(topic);
  const r = await writer(env, order, {
    system: SYSTEM_PLAN, maxTokens: 900, temperature: 0.8,
    user: `الموضوع الأساسي: "${topic}"
عبارات يبحث عنها الناس فعلًا:
${kws.map(k => '- ' + k).join('\n')}

اقترح ${count} مقالات مختلفة تمامًا عن نفس الموضوع، كل واحد بنية بحث (search intent) مختلفة (مثلًا: دليل خطوة بخطوة، أخطاء شائعة، مقارنة/اختيار، أسئلة وأجوبة، تجربة عملية). العناوين لازم تكون مختلفة بوضوح وليست تغييرًا طفيفًا في الصياغة.
أخرج JSON فقط: {"angles":[{"title":"عنوان 45-65 حرفًا","angle":"وصف الزاوية في جملة","keywords":["عبارة بحث","عبارة بحث"]}]}`,
  });
  const j = parseJsonLoose(r.text);
  const angles = (Array.isArray(j.angles) ? j.angles : []).slice(0, count).map(a => ({
    title: String(a.title || '').slice(0, 110), angle: String(a.angle || '').slice(0, 220),
    keywords: (Array.isArray(a.keywords) ? a.keywords : []).map(String).slice(0, 6),
  })).filter(a => a.title);
  if (!angles.length) throw new Error('no angles returned');
  return { angles, searched: kws, provider: r.provider, model: r.model };
}

async function makePlan(env, { topic, angle, category, keywords, avoid, siteProfile, order }) {
  const prompt = `الموضوع: "${topic}"
${angle ? `زاوية هذا المقال بالتحديد: "${angle}"\n` : ''}${category ? `التصنيف المطلوب: ${category}\n` : ''}
عن الموقع الذي سيُنشر فيه المقال: ${siteProfile}

عبارات يبحث عنها الناس فعلًا (من اقتراحات جوجل) — اختر منها الأنسب ووزّعها بطبيعية على الأقسام:
${keywords.map(k => '- ' + k).join('\n') || '- (لا توجد)'}
${avoid.length ? `\nعناوين مقالات موجودة بالفعل في الموقع — لا تكرر نفس الفكرة:\n${avoid.slice(0, 25).map(t => '- ' + t).join('\n')}\n` : ''}
أخرج JSON فقط بهذا الشكل بالظبط:
{
 "title": "عنوان جذاب 45-65 حرفًا فيه الكلمة الرئيسية، بدون نقطتين زيادة وبدون علامات تعجب كثيرة",
 "primaryKeyword": "الكلمة الرئيسية (2-4 كلمات)",
 "slugWords": "3-6 كلمات عربية تعبّر عن الكلمة الرئيسية، بدون أرقام سنة",
 "metaDescription": "130-155 حرفًا تشجّع على الضغط وتحتوي الكلمة الرئيسية",
 "category": "واحد فقط من: ${CATEGORIES.join(' ، ')}",
 "coverQuery": "english stock photo search query, 2-4 words",
 "sections": [
   {"h2": "عنوان قسم مشوّق (كل عنوان بصيغة مختلفة: سؤال، وعد، تحذير، رقم...)", "points": ["نقطة يغطيها القسم", "نقطة"], "keywords": ["عبارة بحث من القائمة"], "imageQuery": "english photo query or empty"}
 ],
 "faq": ["سؤال شائع يبحث عنه الناس", "سؤال", "سؤال", "سؤال"]
}
عدد الأقسام 5 أو 6. عناوين الأقسام لا تتكرر ولا تبدأ بنفس الكلمة. الأسئلة الشائعة 4.`;
  let r = await writer(env, order, { system: SYSTEM_PLAN, user: prompt, maxTokens: 2200, temperature: 0.7 });
  let plan;
  try { plan = parseJsonLoose(r.text); }
  catch (_) {
    r = await writer(env, order, { system: SYSTEM_PLAN, user: prompt + '\n\nمهم: أرجع JSON صالحًا فقط.', maxTokens: 2200, temperature: 0.3 });
    plan = parseJsonLoose(r.text);
  }
  const sections = (Array.isArray(plan.sections) ? plan.sections : []).slice(0, 6).map(s => ({
    h2: cleanText(s.h2 || '').replace(/[:：]+$/, ''),
    points: (Array.isArray(s.points) ? s.points : []).map(String).slice(0, 5),
    keywords: (Array.isArray(s.keywords) ? s.keywords : []).map(String).slice(0, 3),
    imageQuery: String(s.imageQuery || '').slice(0, 60),
  })).filter(s => s.h2);
  if (!plan.title || sections.length < 4) throw new Error('plan is incomplete (title/sections)');
  return {
    title: cleanText(plan.title).slice(0, 110),
    primaryKeyword: cleanText(plan.primaryKeyword || topic).slice(0, 60),
    slugWords: String(plan.slugWords || plan.primaryKeyword || plan.title),
    metaDescription: cleanText(plan.metaDescription || '').slice(0, 160),
    category: CATEGORIES.includes(plan.category) ? plan.category : (CATEGORIES.includes(category) ? category : 'عمل-حر'),
    coverQuery: String(plan.coverQuery || 'online business').slice(0, 60),
    sections,
    faq: (Array.isArray(plan.faq) ? plan.faq : []).map(q => cleanText(typeof q === 'string' ? q : (q && q.q) || '')).filter(Boolean).slice(0, 4),
    meta: { provider: r.provider, model: r.model },
  };
}

async function writeSection(env, order, plan, sec, idx) {
  const prompt = `اكتب قسم "${sec.h2}" من مقال عنوانه "${plan.title}" (الكلمة الرئيسية: ${plan.primaryKeyword}).
النقاط التي يجب أن يغطيها: ${sec.points.join('، ') || 'ما يناسب العنوان'}.
${sec.keywords.length ? `لو ناسبت السياق أدخل هذه العبارات داخل الجمل بشكل طبيعي (من غير حشر ولا تكرار): ${sec.keywords.join('، ')}.` : ''}
الأقسام الأخرى في المقال (لا تكررها): ${plan.sections.filter((_, i) => i !== idx).map(s => s.h2).join(' | ')}

الطول: 230 إلى 320 كلمة.
الصيغة: فقرات قصيرة مفصولة بسطر فارغ. استخدم قائمة نقطية واحدة فقط لو مفيدة (كل نقطة تبدأ بـ "- "). ممنوع كتابة عنوان القسم أو أي عناوين داخل النص.

${STYLE}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await writer(env, order, { system: SYSTEM_WRITE, user: prompt, maxTokens: 1100, temperature: 0.85 });
    if (CJK.test(r.text) && attempt === 0) continue;       // some open models leak Chinese characters → retry once
    const text = cleanText(r.text);
    if (wordsIn(text) >= 80) return { text, meta: { provider: r.provider, model: r.model } };
  }
  throw new Error(`section "${sec.h2}" came back too short`);
}

async function writeIntro(env, order, plan) {
  const r = await writer(env, order, {
    system: SYSTEM_WRITE, maxTokens: 500, temperature: 0.9,
    user: `اكتب مقدمة مقال عنوانه "${plan.title}" (الكلمة الرئيسية: ${plan.primaryKeyword}).
الطول: 80 إلى 120 كلمة، فقرتان قصيرتان. ابدأ بموقف أو سؤال أو مشكلة حقيقية يعيشها القارئ (مش بتعريف). ضع الكلمة الرئيسية في أول جملتين بشكل طبيعي. وعد القارئ بما سيخرج به.
الأقسام القادمة: ${plan.sections.map(s => s.h2).join(' | ')}

${STYLE}`,
  });
  return cleanText(r.text);
}

async function writeFaq(env, order, plan) {
  if (!plan.faq.length) return [];
  const r = await writer(env, order, {
    system: SYSTEM_WRITE, maxTokens: 1000, temperature: 0.7,
    user: `أجب عن هذه الأسئلة الشائعة المتعلقة بمقال "${plan.title}". كل إجابة 35 إلى 60 كلمة، مباشرة وعملية.
الأسئلة:
${plan.faq.map((q, i) => `${i + 1}. ${q}`).join('\n')}

الصيغة: اكتب كل إجابة في فقرة منفصلة، وافصل بين الإجابات بسطر يحتوي ===  فقط. بدون ترقيم وبدون إعادة كتابة السؤال.
${STYLE}`,
  });
  const parts = cleanText(r.text).split(/\n\s*={3,}\s*\n?/).map(s => s.trim()).filter(Boolean);
  return plan.faq.map((q, i) => ({ q, a: (parts[i] || '').replace(/^\d+[.)\-]\s*/, '') })).filter(x => x.a);
}

async function writeOutro(env, order, plan) {
  const r = await writer(env, order, {
    system: SYSTEM_WRITE, maxTokens: 400, temperature: 0.9,
    user: `اكتب خاتمة قصيرة (50 إلى 80 كلمة) لمقال "${plan.title}": لخّص أهم فكرة عملية وشجّع القارئ على أول خطوة يعملها اليوم. بدون عبارة "في الختام" وبدون روابط.
${STYLE}`,
  });
  return cleanText(r.text);
}

// ───────────────────────────── images ─────────────────────────────
function unsplashHeaders(env) { return { Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}`, 'Accept-Version': 'v1' }; }

function shapePhoto(p) {
  try {
    const u = new URL(p.urls.regular);
    if (u.hostname !== 'images.unsplash.com') return null;      // the site CSP only allows this host
    u.searchParams.set('w', '1200'); u.searchParams.set('q', '75'); u.searchParams.set('fm', 'jpg');
    const t = new URL(p.urls.small); t.searchParams.set('w', '400');
    return {
      id: p.id, url: u.toString(), thumb: t.toString(), alt: p.alt_description || p.description || '',
      credit: { name: (p.user && p.user.name) || 'Unsplash', link: ((p.user && p.user.links && p.user.links.html) || 'https://unsplash.com') + '?utm_source=mall_services&utm_medium=referral' },
      download: p.links && p.links.download_location,
    };
  } catch (_) { return null; }
}

/** Candidate photos for a search phrase (used by the article editor and by the generator). */
export async function searchImages(env, query, n = 6) {
  if (!env.UNSPLASH_ACCESS_KEY || !query) return [];
  try {
    const r = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${Math.min(12, n + 4)}&orientation=landscape&content_filter=high`, { headers: unsplashHeaders(env) });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.results || []).map(shapePhoto).filter(Boolean).slice(0, n);
  } catch (_) { return []; }
}

async function pickPhoto(env, query, used) {
  const list = await searchImages(env, query, 6);
  const p = list.find(x => !used.has(x.id));
  if (!p) return null;
  used.add(p.id);
  // Unsplash API terms: report a "download" when a photo is actually used
  if (p.download) fetch(p.download, { headers: unsplashHeaders(env) }).catch(() => {});
  return p;
}

// ───────────────────────────── assemble + save ─────────────────────────────
function figureHtml(photo, alt) {
  if (!photo) return '';
  const c = photo.credit;
  return `<div class="mall-fig"><img src="${esc(photo.url)}" alt="${esc(alt)}"><span class="mall-cap">صورة: <a href="${esc(c.link)}" target="_blank" rel="noopener nofollow">${esc(c.name)}</a> على <a href="https://unsplash.com/?utm_source=mall_services&utm_medium=referral" target="_blank" rel="noopener nofollow">Unsplash</a></span></div>`;
}

const CTA_VARIANTS = [
  (u) => `لو عندك مهارة أو منتج وعايز تبيعه بأمان، تقدر تفتح متجرك أو تضيف خدمتك على <a href="${u}/">مول الخدمات</a> وتبدأ تستقبل الطلبات بحماية للطرفين.`,
  (u) => `ولو بتدوّر على حد يعملك الشغل ده بدل ما تتعب فيه، شوف الخدمات والمتاجر المتاحة على <a href="${u}/">مول الخدمات</a> وقارن بين العروض قبل ما تقرر.`,
  (u) => `ابدأ بخطوة صغيرة النهارده، وجرّب تعرض أول خدمة أو منتج ليك على <a href="${u}/">مول الخدمات</a> — والباقي بيتعلّم بالممارسة.`,
];

export async function generateArticle(env, input) {
  const settings = input.settings || await getSettings(env);
  const order = settings.providerOrder;
  const topic = String(input.topic || '').trim();
  if (!topic) throw new Error('topic is required');
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_SERVICE_ACCOUNT) throw new Error('FIREBASE_PROJECT_ID / FIREBASE_SERVICE_ACCOUNT not configured — cannot save article');

  const [kwFound, posts] = await Promise.all([discoverKeywords(input.angle ? `${topic} ${input.angle}`.slice(0, 60) : topic), existingPosts(env)]);
  const keywords = [...new Set([...(Array.isArray(input.keywords) ? input.keywords : []), ...kwFound])].slice(0, 16);
  const avoid = posts.map(p => p.title).filter(t => similarity(t, topic) > 0.2).slice(0, 25);

  const plan = await makePlan(env, { topic, angle: input.angle || '', category: input.category || '', keywords, avoid, siteProfile: settings.siteProfile || DEFAULT_SETTINGS.siteProfile, order });
  const dupOf = posts.find(p => similarity(p.title, plan.title) >= 0.6);
  if (dupOf && !input.force) throw new Error(`مقال مشابه موجود بالفعل: "${dupOf.title}" — غيّر الزاوية أو الموضوع`);

  // everything below runs in parallel (6 simultaneous connections at most on Workers)
  const used = new Set();
  const imageIdx = [0, 2, 4].filter(i => i < plan.sections.length);
  const [intro, secs, faq, outro, cover, ...inlinePhotos] = await Promise.all([
    writeIntro(env, order, plan),
    Promise.all(plan.sections.map((s, i) => writeSection(env, order, plan, s, i))),
    writeFaq(env, order, plan).catch(() => []),
    writeOutro(env, order, plan),
    pickPhoto(env, plan.coverQuery, used),
    ...imageIdx.map(i => pickPhoto(env, plan.sections[i].imageQuery || (plan.primaryKeyword + ' business'), used)),
  ]);

  const site = siteOf(env);
  const related = posts.filter(p => p.published && p.slug && p.category === plan.category).slice(0, 3);
  const html = [];
  html.push(mdToHtml(intro));
  plan.sections.forEach((s, i) => {
    html.push(`<h2>${esc(s.h2)}</h2>`);
    const k = imageIdx.indexOf(i);
    if (k >= 0 && inlinePhotos[k]) html.push(figureHtml(inlinePhotos[k], s.h2));
    html.push(mdToHtml(secs[i].text));
  });
  if (faq.length) { html.push('<h2>أسئلة شائعة</h2>'); faq.forEach(f => { html.push(`<h3>${esc(f.q)}</h3>`, mdToHtml(f.a)); }); }
  html.push('<h2>الخطوة الجاية</h2>', mdToHtml(outro));
  html.push(`<p>${CTA_VARIANTS[Math.floor(Math.random() * CTA_VARIANTS.length)](site)}</p>`);
  if (related.length) html.push('<h3>قد يهمك أيضًا</h3>', '<ul>' + related.map(p => `<li><a href="/blog/${esc(encodeURIComponent(p.slug))}">${esc(p.title)}</a></li>`).join('') + '</ul>');
  const content = html.filter(Boolean).join('\n');

  // keyword slug, unique
  const taken = new Set(posts.map(p => p.slug));
  const base = makeSlug(input.slug || plan.slugWords) || makeSlug(plan.primaryKeyword) || makeSlug(plan.title) || 'مقال';
  let slug = base, n = 2;
  while (taken.has(slug)) slug = `${base}-${n++}`;

  const words = wordsIn(content);
  const warnings = [];
  if (words < 900) warnings.push(`المقال قصير (${words} كلمة)`);
  if (!cover) warnings.push(env.UNSPLASH_ACCESS_KEY ? 'لم أجد صورة غلاف مناسبة — اختر صورة من المحرر' : 'UNSPLASH_ACCESS_KEY غير مضاف — بدون صور داخل المقال');
  if (!faq.length) warnings.push('لم تُولَّد الأسئلة الشائعة');

  const auto = input.publish === true;
  const ts = nowIso();
  const meta = secs[0].meta || plan.meta;
  const post = {
    title: plan.title, slug, content,
    excerpt: plan.metaDescription || cleanText(content.replace(/<[^>]*>/g, ' ')).slice(0, 155),
    metaTitle: `${plan.title} | مول الخدمات`.slice(0, 70),
    metaDescription: plan.metaDescription || cleanText(content.replace(/<[^>]*>/g, ' ')).slice(0, 155),
    image: cover ? cover.url : 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
    imageCredit: cover ? cover.credit : null,
    category: plan.category,
    keywords: [plan.primaryKeyword, ...keywords.filter(k => k !== plan.primaryKeyword)].slice(0, 8),
    faq, video: '', topic, angle: input.angle || '', wordCount: words,
    writer: { provider: meta.provider, model: meta.model },
    published: auto, needsReview: !auto, humanReviewed: false, aiGenerated: true, views: 0,
    createdAt: ts, updatedAt: ts, ...(auto ? { publishedAt: ts } : {}),
  };
  const saved = await fsCreate(env, 'blog_posts', post);
  if (auto) await pingIndexNow(env, [`${site}/blog/${encodeURIComponent(slug)}`]);
  return { success: true, id: saved.id, slug, title: plan.title, words, published: auto, provider: meta.provider, model: meta.model, warnings, keywordsUsed: post.keywords };
}

// ───────────────────────────── IndexNow ─────────────────────────────
export async function pingIndexNow(env, urls) {
  try {
    const site = siteOf(env); const key = env.INDEXNOW_KEY || DEFAULT_INDEXNOW_KEY;
    const r = await fetch('https://www.bing.com/indexnow', {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: new URL(site).host, key, keyLocation: `${site}/${key}.txt`, urlList: urls.slice(0, 50) }),
    });
    return r.status;
  } catch (_) { return 0; }
}

// ───────────────────────────── topic discovery (when the queue is empty) ─────────────────────────────
async function discoverTopic(env, settings, posts) {
  const seeds = ['ربح من الانترنت', 'بيع اونلاين في مصر', 'فتح متجر الكتروني', 'عمل حر فريلانس', 'تسويق منتجات على فيسبوك', 'الدفع الالكتروني في مصر'];
  const seed = seeds[Math.floor(Math.random() * seeds.length)];
  const kws = await discoverKeywords(seed);
  const r = await writer(env, settings.providerOrder, {
    system: SYSTEM_PLAN, maxTokens: 700, temperature: 0.9,
    user: `عن الموقع: ${settings.siteProfile}
عبارات بحث حقيقية قريبة من "${seed}":
${kws.map(k => '- ' + k).join('\n')}
مقالات موجودة بالفعل (لا تكررها):
${posts.slice(0, 40).map(p => '- ' + p.title).join('\n')}

اقترح 6 مواضيع مقالات جديدة يبحث عنها الناس فعلًا وتخدم زوار الموقع (بائعين ومشترين في مصر).
أخرج JSON فقط: {"topics":[{"topic":"الموضوع","category":"${CATEGORIES.join('|')}"}]}`,
  });
  const j = parseJsonLoose(r.text);
  const list = (Array.isArray(j.topics) ? j.topics : []).map(t => ({ topic: cleanText(t.topic || ''), cat: CATEGORIES.includes(t.category) ? t.category : '' })).filter(t => t.topic);
  const fresh = list.find(t => !posts.some(p => similarity(p.title, t.topic) >= 0.5) && !settings.usedTopics.some(u => similarity(u, t.topic) >= 0.6));
  if (!fresh) throw new Error('لم أجد موضوعًا جديدًا غير مكرر');
  return fresh;
}

function nextQueuedTopic(settings) {
  for (const line of settings.topics) {
    const [topic, cat] = String(line).split('|').map(s => s.trim());
    if (topic && !settings.usedTopics.includes(topic)) return { topic, cat: CATEGORIES.includes(cat) ? cat : '' };
  }
  return null;
}

/** Called by the scheduler. Returns a small status object; never throws for "not due" situations. */
export async function runTick(env, { force = false } = {}) {
  const settings = await getSettings(env);
  if (!settings.enabled && !force) return { skipped: 'disabled' };
  const last = Date.parse(settings.lastRunAt || '');
  if (!force && Number.isFinite(last) && Date.now() - last < settings.intervalHours * 3600 * 1000 * 0.9) return { skipped: 'not-due', nextAfter: new Date(last + settings.intervalHours * 3600000).toISOString() };

  const posts = await existingPosts(env);
  let publish = settings.publishMode === 'auto';
  if (publish) {
    const dayAgo = Date.now() - 24 * 3600 * 1000;
    const autoToday = posts.filter(p => p.published && Date.parse(p.createdAt || '') > dayAgo).length;
    if (autoToday >= settings.autoMaxPerDay) publish = false;    // over the daily cap → still writes, but as a draft
  }

  const t = nextQueuedTopic(settings) || await discoverTopic(env, settings, posts);
  let result;
  try {
    result = await generateArticle(env, { topic: t.topic, category: t.cat, publish, settings });
    await fsSet(env, 'settings/seoAuto', { lastRunAt: nowIso(), lastResult: `${result.published ? 'نُشر' : 'مسودة'}: ${result.title}`, usedTopics: [...settings.usedTopics, t.topic].slice(-300) }, true);
    return { ok: true, topic: t.topic, ...result };
  } catch (e) {
    await fsSet(env, 'settings/seoAuto', { lastRunAt: nowIso(), lastResult: 'فشل: ' + String(e && e.message || e).slice(0, 300) }, true).catch(() => {});
    throw e;
  }
}
