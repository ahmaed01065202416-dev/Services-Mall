/* js/seo-admin.js — dashboard additions for the automatic SEO article system.
   Extends window.AdminAI (defined in js/p/a69fd080.js). Loaded with `defer`, so AdminAI already exists.
   CSP-safe: no inline handlers / styles — listeners via addEventListener, styles via window.__cssInject. */
(function () {
  'use strict';
  // AdminAI is created inside a DOMContentLoaded callback of js/p/a69fd080.js — wait for it (max ~10s).
  var tries = 0;
  (function wait() {
    if (window.AdminAI) return start(window.AdminAI);
    if (++tries < 100) setTimeout(wait, 100);
  })();

  function start(A) {

  var CATS = [
    ['ربح-من-الانترنت', 'ربح من الإنترنت'], ['تسويق-رقمي', 'تسويق رقمي'], ['ذكاء-اصطناعي', 'ذكاء اصطناعي'],
    ['تجارة-الكترونية', 'تجارة إلكترونية'], ['عمل-حر', 'عمل حر'], ['دفع-الكتروني', 'دفع إلكتروني'],
    ['تصميم-مواقع', 'تصميم مواقع'], ['تحسين-بحث', 'تحسين محركات البحث'], ['استثمار', 'استثمار']
  ];
  var ALLOWED = {
    ALLOWED_TAGS: ['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'br', 'img', 'span', 'div', 'code', 'pre'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'id', 'target', 'rel']
  };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function $(id) { return document.getElementById(id); }
  function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t || 'info'); }
  function clean(html) {
    if (window.DOMPurify) return window.DOMPurify.sanitize(String(html || ''), ALLOWED);
    return esc(String(html || '').replace(/<[^>]*>/g, ''));            // fail closed
  }
  function makeSlug(words) {
    var s = String(words || '').replace(/[\u064B-\u065F\u0640]/g, '').replace(/[^\u0600-\u06FFa-zA-Z0-9\s-]/g, ' ').trim().replace(/\s+/g, '-').replace(/-+/g, '-').toLowerCase();
    var parts = s.split('-').filter(Boolean).slice(0, 8);
    var out = parts.join('-');
    return out.length > 70 ? out.slice(0, 70).replace(/-[^-]*$/, '') : out;
  }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  /* ───────────── styles (own classes, independent of the Tailwind purge) ───────────── */
  var CSS = [
    '.sa-card{background:#fff;border:1px solid #f1f5f9;border-radius:18px;padding:22px;box-shadow:0 2px 12px rgba(15,23,42,.05);margin-bottom:18px}',
    '.sa-h{font-weight:900;font-size:17px;color:#111827;margin:0 0 14px;display:flex;align-items:center;gap:8px}',
    '.sa-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}',
    '.sa-l{display:block;font-size:12px;font-weight:700;color:#4b5563;margin-bottom:6px}',
    '.sa-in,.sa-ta,.sa-se{width:100%;border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;font-size:14px;background:#fff;color:#111827;font-family:inherit}',
    '.sa-ta{min-height:96px;line-height:1.7;resize:vertical}',
    '.sa-in:focus,.sa-ta:focus,.sa-se:focus{outline:2px solid #1B2A4A33;border-color:#1B2A4A}',
    '.sa-btn{border:0;border-radius:12px;padding:10px 18px;font-weight:800;font-size:13px;cursor:pointer;background:#1B2A4A;color:#fff;font-family:inherit;display:inline-flex;align-items:center;gap:7px}',
    '.sa-btn:disabled{opacity:.55;cursor:wait}',
    '.sa-btn.sec{background:#f3f4f6;color:#1f2937}.sa-btn.ok{background:#059669}.sa-btn.warn{background:#d97706}.sa-btn.bad{background:#fee2e2;color:#b91c1c}',
    '.sa-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}',
    '.sa-pill{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;padding:5px 11px;border-radius:99px}',
    '.sa-pill.g{background:#dcfce7;color:#166534}.sa-pill.r{background:#fee2e2;color:#991b1b}.sa-pill.y{background:#fef3c7;color:#92400e}.sa-pill.b{background:#e0e7ff;color:#3730a3}',
    '.sa-note{font-size:12px;color:#6b7280;line-height:1.7;margin-top:6px}',
    '.sa-angle{display:flex;gap:10px;align-items:flex-start;border:1px solid #e5e7eb;border-radius:12px;padding:11px 13px;margin-bottom:8px}',
    '.sa-angle b{font-size:14px;color:#111827}.sa-angle span{display:block;font-size:12px;color:#6b7280;margin-top:3px}',
    '.sa-modal{position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:10000;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 12px}',
    '.sa-box{background:#fff;border-radius:20px;width:100%;max-width:980px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.3)}',
    '.sa-tools{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}',
    '.sa-tools button{border:1px solid #e5e7eb;background:#f9fafb;border-radius:8px;padding:5px 10px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit}',
    '.sa-prev{border:1px dashed #d1d5db;border-radius:14px;padding:18px;margin-top:10px;max-height:460px;overflow:auto;line-height:1.9;font-size:15px}',
    '.sa-prev h2{font-size:20px;font-weight:900;margin:20px 0 10px}.sa-prev h3{font-size:17px;font-weight:800;margin:16px 0 8px}',
    '.sa-prev img{max-width:100%;border-radius:12px}.sa-prev .mall-cap{display:block;font-size:11px;color:#9ca3af}',
    '.sa-imgs{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-top:10px}',
    '.sa-imgs img{width:100%;height:84px;object-fit:cover;border-radius:10px;cursor:pointer;border:2px solid transparent}',
    '.sa-imgs img:hover{border-color:#1B2A4A}',
    '.sa-tag{font-size:11px;font-weight:700;border-radius:99px;padding:2px 9px;display:inline-block;margin-inline-start:6px}',
    'html.dark .sa-card,html.dark .sa-box{background:#111827;border-color:#1f2937}',
    'html.dark .sa-h,html.dark .sa-angle b{color:#f9fafb}',
    'html.dark .sa-in,html.dark .sa-ta,html.dark .sa-se{background:#0b1220;color:#f9fafb;border-color:#1f2937}',
    'html.dark .sa-btn.sec{background:#1f2937;color:#f9fafb}html.dark .sa-prev{color:#e5e7eb}'
  ].join('\n');
  if (window.__cssInject) window.__cssInject('seoAdminCss', CSS);

  /* ───────────── posts table (replaces the original: adds status, edit, approve; one delegated listener) ───────────── */
  var posts = [];
  var tbodyBound = false;
  A.loadPosts = async function () {
    if (!window.db) return;
    var tbody = $('admin-posts-tbody'), label = $('posts-count-label');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-400"><i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...</td></tr>';
    try {
      var snap = await window.db.collection('blog_posts').orderBy('createdAt', 'desc').limit(80).get();
      posts = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      var set = function (id, v) { var e = $(id); if (e) e.textContent = v; };
      set('stat-posts', posts.length);
      set('stat-ai', posts.filter(function (p) { return p.aiGenerated; }).length);
      set('stat-views', posts.reduce(function (s, p) { return s + (p.views || 0); }, 0).toLocaleString('ar-EG'));
      set('stat-pub', posts.filter(function (p) { return p.published; }).length);
      var review = posts.filter(function (p) { return !p.published && p.needsReview; }).length;
      if (label) label.textContent = posts.length + ' مقال' + (review ? ' — ' + review + ' بانتظار مراجعتك' : '');
      if (!tbody) return;
      tbody.innerHTML = '';
      if (!posts.length) { tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12 text-gray-400">لا توجد مقالات — اضغط «مقال جديد» أو ولّد من تبويب التشغيل التلقائي</td></tr>'; return; }
      posts.forEach(function (p) {
        var st = p.published ? '<span class="sa-pill g">منشور</span>' : (p.needsReview ? '<span class="sa-pill y">مسودة للمراجعة</span>' : '<span class="sa-pill r">موقوف</span>');
        var tr = el('tr', 'hover:bg-gray-50 transition border-b border-gray-50');
        tr.innerHTML =
          '<td class="px-4 py-3 max-w-xs"><p class="font-bold text-gray-900 text-sm truncate">' + esc(p.title) + '</p><p class="text-xs text-gray-400 truncate">/blog/' + esc(p.slug) + (p.aiGenerated && !p.humanReviewed ? ' · AI' : '') + '</p></td>' +
          '<td class="px-4 py-3 hidden sm:table-cell"><span class="text-xs font-bold">' + esc(p.category || '') + '</span></td>' +
          '<td class="px-4 py-3">' + st + '</td>' +
          '<td class="px-4 py-3 hidden md:table-cell text-gray-500 font-mono text-sm">' + ((p.views || 0).toLocaleString()) + '</td>' +
          '<td class="px-4 py-3"><div class="sa-row">' +
          '<button class="sa-btn sec" data-act="edit" data-id="' + esc(p.id) + '">تعديل</button>' +
          (p.published
            ? '<button class="sa-btn sec" data-act="unpub" data-id="' + esc(p.id) + '">إيقاف</button><a class="sa-btn sec" href="/blog/' + encodeURIComponent(p.slug) + '" target="_blank" rel="noopener">عرض</a>'
            : '<button class="sa-btn ok" data-act="pub" data-id="' + esc(p.id) + '">اعتماد ونشر</button>') +
          '<button class="sa-btn bad" data-act="del" data-id="' + esc(p.id) + '">حذف</button></div></td>';
        tbody.appendChild(tr);
      });
      if (!tbodyBound) {
        tbodyBound = true;
        tbody.addEventListener('click', function (e) {
          var b = e.target.closest('button[data-act]'); if (!b) return;
          var id = b.getAttribute('data-id'), act = b.getAttribute('data-act');
          if (act === 'edit') A.openEditor(id);
          else if (act === 'pub') A.setPublished(id, true);
          else if (act === 'unpub') A.setPublished(id, false);
          else if (act === 'del') A.deletePost(id);
        });
      }
    } catch (err) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-red-400">خطأ: ' + esc(err.message) + '</td></tr>';
    }
  };

  A.setPublished = async function (id, val) {
    var p = posts.filter(function (x) { return x.id === id; })[0];
    try {
      var upd = { published: !!val, updatedAt: new Date().toISOString() };
      if (val) { upd.needsReview = false; upd.humanReviewed = true; upd.publishedAt = new Date().toISOString(); }
      await window.db.collection('blog_posts').doc(id).update(upd);
      toast((val ? 'تم نشر "' : 'تم إيقاف "') + (p ? String(p.title).slice(0, 30) : '') + '"', val ? 'success' : 'info');
      if (val && p) A._fetchAI({ action: 'ping', slugs: [p.slug] }).catch(function () {});
      A.loadPosts();
    } catch (e) { toast('خطأ: ' + e.message, 'error'); }
  };
  A.togglePublish = function (id, newVal) { return A.setPublished(id, !!newVal); };

  /* ───────────── article editor (edit AI draft / write your own) ───────────── */
  var modal = null;
  function closeEditor() { if (modal) { modal.remove(); modal = null; } }

  A.openEditor = function (id) {
    closeEditor();
    var p = id ? posts.filter(function (x) { return x.id === id; })[0] : null;
    var isNew = !p;
    p = p || { title: '', slug: '', excerpt: '', metaDescription: '', content: '', image: '', category: 'عمل-حر', keywords: [], video: '', published: false };
    modal = el('div', 'sa-modal');
    var catOpts = CATS.map(function (c) { return '<option value="' + c[0] + '"' + (p.category === c[0] ? ' selected' : '') + '>' + c[1] + '</option>'; }).join('');
    modal.innerHTML =
      '<div class="sa-box" dir="rtl">' +
      '<div class="sa-row" data-style="justify-content:space-between;margin-bottom:14px"><h3 class="sa-h" data-style="margin:0">' + (isNew ? 'مقال جديد' : 'تعديل المقال') + '</h3><button class="sa-btn sec" id="sa-x">إغلاق ✕</button></div>' +
      '<div class="sa-grid">' +
      '<div data-style="grid-column:1/-1"><label class="sa-l">العنوان (H1) — اجعل الكلمة الرئيسية فيه</label><input class="sa-in" id="sa-title" maxlength="110"></div>' +
      '<div><label class="sa-l">رابط المقال (كلمات البحث)</label><input class="sa-in" id="sa-slug" dir="ltr" data-style="text-align:right"><div class="sa-note" id="sa-slug-note"></div></div>' +
      '<div><label class="sa-l">التصنيف</label><select class="sa-se" id="sa-cat">' + catOpts + '</select></div>' +
      '<div data-style="grid-column:1/-1"><label class="sa-l">كلمات مفتاحية (مفصولة بفاصلة)</label><input class="sa-in" id="sa-kw"></div>' +
      '<div data-style="grid-column:1/-1"><label class="sa-l">وصف جوجل (Meta) <span id="sa-mc" class="sa-note"></span></label><textarea class="sa-ta" id="sa-meta" maxlength="170" data-style="min-height:64px"></textarea></div>' +
      '<div data-style="grid-column:1/-1"><label class="sa-l">صورة الغلاف (رابط صورة)</label><div class="sa-row"><input class="sa-in" id="sa-img" dir="ltr" data-style="flex:1;min-width:200px"><input class="sa-in" id="sa-iq" placeholder="بحث بالإنجليزي: online shop" dir="ltr" data-style="width:200px"><button class="sa-btn sec" id="sa-isearch">ابحث عن صورة</button></div><div class="sa-imgs" id="sa-imgs"></div></div>' +
      '<div data-style="grid-column:1/-1"><label class="sa-l">فيديو يوتيوب (اختياري — يظهر بعد المقدمة)</label><input class="sa-in" id="sa-vid" dir="ltr" placeholder="https://www.youtube.com/watch?v=..."></div>' +
      '</div>' +
      '<label class="sa-l" data-style="margin-top:14px">المحتوى</label>' +
      '<div class="sa-tools" id="sa-tools"><button data-t="h2">عنوان H2</button><button data-t="h3">عنوان H3</button><button data-t="strong">غامق</button><button data-t="ul">قائمة</button><button data-t="a">رابط</button><button data-t="img">صورة</button><button data-t="p">فقرة</button></div>' +
      '<textarea class="sa-ta" id="sa-content" data-style="min-height:340px;font-family:ui-monospace,monospace;font-size:13px" dir="rtl"></textarea>' +
      '<div class="sa-row" data-style="margin-top:12px"><button class="sa-btn sec" id="sa-prevbtn">معاينة</button><span class="sa-note" id="sa-wc"></span></div>' +
      '<div class="sa-prev" id="sa-prev" data-style="display:none"></div>' +
      '<div class="sa-row" data-style="margin-top:18px"><button class="sa-btn" id="sa-save">حفظ كمسودة</button><button class="sa-btn ok" id="sa-savepub">حفظ ونشر</button>' +
      (!isNew && p.published ? '<span class="sa-pill g">المقال منشور حاليًا — الحفظ يحدّثه مباشرة</span>' : '') + '</div>' +
      '<div class="sa-note">المحتوى يُنظَّف تلقائيًا قبل الحفظ (يُسمح بـ H2/H3/فقرات/قوائم/روابط/صور فقط). تغيير الرابط لمقال منشور سيكسر الرابط القديم في جوجل.</div>' +
      '</div>';
    document.body.appendChild(modal);
    var g = function (i) { return $(i); };
    g('sa-title').value = p.title || ''; g('sa-slug').value = p.slug || ''; g('sa-kw').value = (p.keywords || []).join('، ');
    g('sa-meta').value = p.metaDescription || p.excerpt || ''; g('sa-img').value = p.image || ''; g('sa-vid').value = p.video || '';
    g('sa-content').value = p.content || '';
    var origSlug = p.slug || '';
    var upd = function () {
      g('sa-mc').textContent = '(' + g('sa-meta').value.length + '/155)';
      var w = g('sa-content').value.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
      g('sa-wc').textContent = w + ' كلمة' + (w < 900 ? ' — الأفضل 1000+ كلمة' : '');
      var s = g('sa-slug').value; g('sa-slug-note').textContent = s ? 'الرابط: /blog/' + s : '';
    };
    ['sa-meta', 'sa-content', 'sa-slug'].forEach(function (i) { g(i).addEventListener('input', upd); }); upd();
    g('sa-title').addEventListener('blur', function () { if (!g('sa-slug').value) { g('sa-slug').value = makeSlug(g('sa-title').value); upd(); } });
    g('sa-x').addEventListener('click', closeEditor);
    modal.addEventListener('mousedown', function (e) { if (e.target === modal) { /* keep: avoid accidental loss */ } });

    g('sa-tools').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-t]'); if (!b) return;
      var ta = g('sa-content'), s = ta.selectionStart, en = ta.selectionEnd, sel = ta.value.slice(s, en) || 'النص هنا', t = b.getAttribute('data-t'), ins = '';
      if (t === 'h2' || t === 'h3' || t === 'p' || t === 'strong') ins = '<' + t + '>' + sel + '</' + t + '>';
      else if (t === 'ul') ins = '<ul><li>' + sel + '</li><li>نقطة ثانية</li></ul>';
      else if (t === 'a') { var u = prompt('الرابط (https://… أو /blog/…)'); if (!u) return; ins = '<a href="' + u.replace(/"/g, '') + '">' + sel + '</a>'; }
      else if (t === 'img') { var iu = prompt('رابط الصورة (https://images.unsplash.com/…)'); if (!iu) return; ins = '<div class="mall-fig"><img src="' + iu.replace(/"/g, '') + '" alt="' + sel.replace(/"/g, '') + '"></div>'; }
      ta.value = ta.value.slice(0, s) + ins + ta.value.slice(en); ta.focus(); upd();
    });
    g('sa-prevbtn').addEventListener('click', function () {
      var pv = g('sa-prev'); var show = pv.style.display === 'none';
      pv.style.display = show ? 'block' : 'none'; if (show) pv.innerHTML = clean(g('sa-content').value);
    });
    g('sa-isearch').addEventListener('click', async function () {
      var q = g('sa-iq').value.trim() || g('sa-title').value.trim(); if (!q) return toast('اكتب كلمة بحث بالإنجليزي', 'info');
      var box = g('sa-imgs'); box.innerHTML = '<span class="sa-note">جاري البحث…</span>';
      try {
        var r = await A._fetchAI({ action: 'image', query: q });
        var list = r.images || [];
        if (!list.length) { box.innerHTML = '<span class="sa-note">لا نتائج (تأكد من UNSPLASH_ACCESS_KEY)</span>'; return; }
        box.innerHTML = '';
        list.forEach(function (im) {
          var i = el('img'); i.src = im.thumb; i.alt = im.alt || ''; i.title = 'اضغط للاختيار — ' + (im.credit && im.credit.name || '');
          i.addEventListener('click', function () { g('sa-img').value = im.url; toast('تم اختيار الصورة', 'success'); });
          box.appendChild(i);
        });
      } catch (e) { box.innerHTML = '<span class="sa-note">خطأ: ' + esc(e.message) + '</span>'; }
    });

    async function save(publish) {
      var title = g('sa-title').value.trim(), content = clean(g('sa-content').value).trim();
      if (!title) return toast('اكتب العنوان', 'error');
      if (content.length < 200) return toast('المحتوى قصير جدًا', 'error');
      var slug = makeSlug(g('sa-slug').value || title);
      if (!slug) return toast('الرابط غير صالح', 'error');
      var btns = [g('sa-save'), g('sa-savepub')]; btns.forEach(function (b) { b.disabled = true; });
      try {
        var dup = await window.db.collection('blog_posts').where('slug', '==', slug).limit(3).get();
        if (dup.docs.some(function (d) { return d.id !== (p.id || ''); })) { toast('الرابط مستخدم في مقال آخر — غيّره', 'error'); return; }
        var yt = g('sa-vid').value.trim();
        if (yt && !/(youtu\.be\/|youtube\.com\/(watch\?|embed\/|shorts\/))/.test(yt)) { toast('رابط الفيديو لازم يكون يوتيوب', 'error'); return; }
        var img = g('sa-img').value.trim();
        if (img && !/^https:\/\//.test(img)) { toast('رابط الصورة لازم يبدأ بـ https://', 'error'); return; }
        var now = new Date().toISOString();
        var data = {
          title: title, slug: slug, content: content,
          excerpt: g('sa-meta').value.trim().slice(0, 170), metaDescription: g('sa-meta').value.trim().slice(0, 170),
          metaTitle: (title + ' | مول الخدمات').slice(0, 70),
          image: img || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
          category: g('sa-cat').value, video: yt,
          keywords: g('sa-kw').value.split(/[,،]/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 10),
          wordCount: content.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length,
          humanReviewed: true, needsReview: false, updatedAt: now
        };
        if (publish) { data.published = true; if (!p.published) data.publishedAt = now; }
        else if (isNew) data.published = false;
        if (isNew) { data.createdAt = now; data.views = 0; data.aiGenerated = false; await window.db.collection('blog_posts').add(data); }
        else await window.db.collection('blog_posts').doc(p.id).update(data);
        toast(publish ? 'تم الحفظ والنشر' : 'تم حفظ المسودة', 'success');
        if (publish) A._fetchAI({ action: 'ping', slugs: [slug] }).catch(function () {});
        closeEditor(); A.loadPosts();
      } catch (e) { toast('خطأ: ' + e.message, 'error'); }
      finally { btns.forEach(function (b) { if (b) b.disabled = false; }); }
    }
    g('sa-save').addEventListener('click', function () { save(false); });
    g('sa-savepub').addEventListener('click', function () { save(true); });
  };

  /* ───────────── automation tab ───────────── */
  var panel = null, tabBtn = null, status = null;

  function pill(ok, yes, no) { return '<span class="sa-pill ' + (ok ? 'g' : 'r') + '">' + (ok ? '✓ ' + yes : '✗ ' + no) + '</span>'; }

  async function loadStatus() {
    try { status = await A._fetchAI({ action: 'status' }); } catch (e) { status = null; }
    return status;
  }

  function buildPanel() {
    panel = el('div', 'hidden'); panel.id = 'admin-tab-auto';
    panel.innerHTML =
      '<div class="sa-card" dir="rtl"><h3 class="sa-h"><i class="fa-solid fa-gauge-high"></i> حالة النظام</h3><div class="sa-row" id="sa-status">جاري الفحص…</div><div class="sa-note" id="sa-last"></div></div>' +
      '<div class="sa-card" dir="rtl"><h3 class="sa-h"><i class="fa-solid fa-clock-rotate-left"></i> التشغيل التلقائي</h3>' +
      '<div class="sa-grid">' +
      '<div><label class="sa-l">تشغيل المقالات التلقائية</label><select class="sa-se" id="sa-en"><option value="false">متوقف</option><option value="true">يعمل</option></select></div>' +
      '<div><label class="sa-l">مقال جديد كل</label><select class="sa-se" id="sa-int"><option value="6">6 ساعات</option><option value="12">12 ساعة</option><option value="24">يوم</option><option value="48">يومين</option><option value="72">3 أيام</option><option value="168">أسبوع</option></select></div>' +
      '<div><label class="sa-l">طريقة النشر</label><select class="sa-se" id="sa-mode"><option value="review">مسودة أراجعها وأنشرها بنفسي (موصى به)</option><option value="auto">نشر تلقائي مباشر</option></select></div>' +
      '<div><label class="sa-l">أقصى نشر تلقائي في اليوم</label><select class="sa-se" id="sa-max"><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></div>' +
      '<div><label class="sa-l">محرك الكتابة</label><select class="sa-se" id="sa-prov"><option value="cloudflare,gemini">Cloudflare AI أولًا ثم Gemini</option><option value="gemini,cloudflare">Gemini أولًا ثم Cloudflare AI</option><option value="cloudflare">Cloudflare AI فقط</option><option value="gemini">Gemini فقط</option></select></div>' +
      '</div>' +
      '<label class="sa-l" data-style="margin-top:14px">قائمة المواضيع (موضوع في كل سطر، ويمكن إضافة التصنيف: <code>الموضوع | عمل-حر</code>) — لو فاضية النظام يقترح مواضيع جديدة بنفسه من بحث جوجل</label>' +
      '<textarea class="sa-ta" id="sa-topics" data-style="min-height:120px"></textarea>' +
      '<label class="sa-l" data-style="margin-top:14px">وصف الموقع (يُستخدم لربط المقالات بما تقدمه)</label><textarea class="sa-ta" id="sa-profile"></textarea>' +
      '<div class="sa-row" data-style="margin-top:14px"><button class="sa-btn" id="sa-savecfg">حفظ الإعدادات</button><button class="sa-btn warn" id="sa-run">شغّل الآن (مقال واحد)</button><span class="sa-note" id="sa-runmsg"></span></div>' +
      '<div class="sa-note">الجدولة تتم عبر GitHub Action كل 3 ساعات، وهي التي تقرأ هذه الإعدادات وتقرر هل حان الوقت. «شغّل الآن» ينشئ مقالًا فورًا بغض النظر عن الموعد.</div></div>' +
      '<div class="sa-card" dir="rtl"><h3 class="sa-h"><i class="fa-solid fa-layer-group"></i> أكثر من مقال لنفس الموضوع</h3>' +
      '<div class="sa-row"><input class="sa-in" id="sa-topic" data-style="flex:1;min-width:220px" placeholder="الموضوع: مثال: فتح متجر إلكتروني"><select class="sa-se" id="sa-cnt" data-style="width:110px"><option value="2">2 زوايا</option><option value="3" selected>3 زوايا</option><option value="4">4 زوايا</option><option value="5">5 زوايا</option></select><button class="sa-btn sec" id="sa-angles">اقترح زوايا مختلفة</button><button class="sa-btn" id="sa-one">ولّد مقالًا واحدًا</button></div>' +
      '<div id="sa-anglelist" data-style="margin-top:12px"></div><div class="sa-row" id="sa-angact" data-style="display:none;margin-top:8px"><button class="sa-btn ok" id="sa-genang">ولّد المقالات المحددة (مسودات)</button><span class="sa-note" id="sa-angmsg"></span></div>' +
      '<div class="sa-note">كل زاوية تتحول لمقال بعنوان وكلمات بحث وهيكل مختلف، ويُفحَص التشابه مع المقالات الموجودة لتجنّب التكرار. كل مقال يستغرق نحو دقيقة.</div></div>';
    var anchor = $('admin-tab-seo'); anchor.parentNode.insertBefore(panel, anchor.nextSibling);

    var g = function (i) { return $(i); };
    g('sa-savecfg').addEventListener('click', saveCfg);
    g('sa-run').addEventListener('click', runNow);
    g('sa-angles').addEventListener('click', getAngles);
    g('sa-one').addEventListener('click', function () { genOne(); });
    g('sa-genang').addEventListener('click', genSelected);
  }

  function fillCfg(s) {
    if (!s) return; var g = function (i) { return $(i); };
    g('sa-en').value = String(!!s.enabled); g('sa-int').value = String(s.intervalHours || 24); g('sa-mode').value = s.publishMode === 'auto' ? 'auto' : 'review';
    g('sa-max').value = String(s.autoMaxPerDay || 1); g('sa-prov').value = s.providerOrder || 'cloudflare,gemini';
    g('sa-topics').value = (s.topics || []).join('\n'); g('sa-profile').value = s.siteProfile || '';
  }

  async function refreshAuto() {
    var st = await loadStatus(); var box = $('sa-status');
    if (!st) { box.innerHTML = '<span class="sa-pill r">تعذّر قراءة الحالة (هل أنت مسجل كأدمن؟)</span>'; return; }
    box.innerHTML =
      pill(st.cloudflare, 'Cloudflare AI جاهز', 'Cloudflare AI غير مربوط') +
      '<span class="sa-pill ' + (st.gemini ? 'g' : 'b') + '">' + (st.gemini ? '✓ Gemini مفعّل (احتياطي)' : 'Gemini غير مضاف (اختياري)') + '</span>' +
      pill(st.unsplash, 'صور Unsplash', 'بدون صور (UNSPLASH_ACCESS_KEY)') +
      pill(st.firestore, 'حفظ المقالات', 'FIREBASE_SERVICE_ACCOUNT ناقص') +
      pill(st.adminSecret, 'مفتاح الجدولة ADMIN_SECRET', 'ADMIN_SECRET غير مضاف');
    var s = st.settings || {};
    $('sa-last').textContent = s.lastRunAt ? ('آخر تشغيل: ' + new Date(s.lastRunAt).toLocaleString('ar-EG') + ' — ' + (s.lastResult || '')) : 'لم يعمل التشغيل التلقائي بعد.';
    fillCfg(s);
  }

  async function saveCfg() {
    var g = function (i) { return $(i).value; };
    var data = {
      enabled: g('sa-en') === 'true', intervalHours: Number(g('sa-int')), publishMode: g('sa-mode'), autoMaxPerDay: Number(g('sa-max')),
      providerOrder: g('sa-prov'), topics: g('sa-topics').split('\n').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 200),
      siteProfile: g('sa-profile').trim().slice(0, 800), updatedAt: new Date().toISOString()
    };
    if (data.publishMode === 'auto' && !confirm('النشر التلقائي ينشر المقالات بدون مراجعتك. جوجل قد تعاقب المحتوى المولَّد بكميات كبيرة وبدون مراجعة. متأكد؟')) return;
    try { await window.db.collection('settings').doc('seoAuto').set(data, { merge: true }); toast('تم حفظ الإعدادات', 'success'); }
    catch (e) { toast('خطأ: ' + e.message, 'error'); }
  }

  async function runNow() {
    var b = $('sa-run'), m = $('sa-runmsg'); b.disabled = true; m.textContent = 'جاري كتابة المقال… (حتى دقيقة ونصف)';
    try {
      var r = await A._fetchAI({ action: 'tick', force: true });
      if (r.error) throw new Error(r.error);
      m.textContent = r.skipped ? ('تخطّى: ' + r.skipped) : ('تم: ' + r.title + (r.published ? ' (منشور)' : ' (مسودة للمراجعة)') + (r.warnings && r.warnings.length ? ' — ' + r.warnings.join('، ') : ''));
      A.loadPosts(); refreshAuto();
    } catch (e) { m.textContent = 'فشل: ' + e.message; }
    finally { b.disabled = false; }
  }

  async function genOne(angle) {
    var topic = $('sa-topic').value.trim(); if (!topic) return toast('اكتب الموضوع', 'info');
    var b = $('sa-one'); b.disabled = true; var m = $('sa-angmsg'); if (m) m.textContent = '';
    try {
      var r = await A._fetchAI({ action: 'generate', topic: topic, angle: angle || '' });
      if (r.error) throw new Error(r.error);
      toast('تم إنشاء مسودة: ' + String(r.title).slice(0, 40) + (r.warnings && r.warnings.length ? ' — ' + r.warnings.join('، ') : ''), 'success'); A.loadPosts(); return r;
    } catch (e) { toast('فشل: ' + e.message, 'error'); }
    finally { b.disabled = false; }
  }

  var angles = [];
  async function getAngles() {
    var topic = $('sa-topic').value.trim(); if (!topic) return toast('اكتب الموضوع', 'info');
    var b = $('sa-angles'), list = $('sa-anglelist'); b.disabled = true; list.innerHTML = '<span class="sa-note">جاري اقتراح الزوايا من بحث جوجل…</span>';
    try {
      var r = await A._fetchAI({ action: 'angles', topic: topic, count: Number($('sa-cnt').value) });
      if (r.error) throw new Error(r.error);
      angles = r.angles || []; list.innerHTML = '';
      angles.forEach(function (a, i) {
        var d = el('label', 'sa-angle', '<input type="checkbox" checked data-i="' + i + '"><div><b>' + esc(a.title) + '</b><span>' + esc(a.angle) + (a.keywords && a.keywords.length ? ' — ' + esc(a.keywords.join('، ')) : '') + '</span></div>');
        list.appendChild(d);
      });
      $('sa-angact').style.display = 'flex';
    } catch (e) { list.innerHTML = '<span class="sa-note">فشل: ' + esc(e.message) + '</span>'; }
    finally { b.disabled = false; }
  }

  async function genSelected() {
    var topic = $('sa-topic').value.trim(); var picked = [];
    $('sa-anglelist').querySelectorAll('input[type=checkbox]').forEach(function (c) { if (c.checked) picked.push(angles[Number(c.getAttribute('data-i'))]); });
    if (!picked.length) return toast('اختر زاوية واحدة على الأقل', 'info');
    var b = $('sa-genang'), m = $('sa-angmsg'); b.disabled = true; var ok = 0;
    for (var i = 0; i < picked.length; i++) {
      m.textContent = 'جاري كتابة المقال ' + (i + 1) + ' من ' + picked.length + '…';
      try {
        var r = await A._fetchAI({ action: 'generate', topic: topic, angle: picked[i].title + ' — ' + picked[i].angle, keywords: picked[i].keywords || [] });
        if (r.error) throw new Error(r.error); ok++;
      } catch (e) { toast('فشل المقال ' + (i + 1) + ': ' + e.message, 'error'); }
    }
    m.textContent = 'تم إنشاء ' + ok + ' من ' + picked.length + ' مسودة — راجعها من تبويب المقالات';
    b.disabled = false; A.loadPosts();
  }

  /* ───────────── wiring: tab button, "new article" button, tab switch, live checklist ───────────── */
  function init() {
    var seoBtn = $('tab-seo-btn'); if (!seoBtn || !$('admin-tab-seo')) return;
    tabBtn = el('button', seoBtn.className, '<i class="fa-solid fa-wand-magic-sparkles"></i> تشغيل تلقائي');
    tabBtn.id = 'tab-auto-btn';
    tabBtn.addEventListener('click', function () { A.tab('auto', tabBtn); });
    seoBtn.parentNode.appendChild(tabBtn);
    buildPanel();

    var newBtn = el('button', 'sa-btn ok', '<i class="fa-solid fa-plus"></i> مقال جديد'); newBtn.id = 'sa-new';
    newBtn.addEventListener('click', function () { A.openEditor(null); });
    var head = $('posts-count-label'); if (head && head.parentNode) head.parentNode.appendChild(newBtn);

    var origTab = A.tab;
    A.tab = function (name, btn) {
      origTab(name, btn);                         // handles posts / ai / seo and the active styling of their buttons
      var on = name === 'auto';
      panel.classList.toggle('hidden', !on);
      ['bg-navy-600', 'text-white', 'shadow-glow'].forEach(function (c) { tabBtn.classList.toggle(c, on); });
      ['bg-white', 'text-gray-600', 'border', 'border-gray-200'].forEach(function (c) { tabBtn.classList.toggle(c, !on); });
      if (on) { A._activeTab = 'auto'; refreshAuto(); }
    };

    A.renderSEOChecklist = async function () {
      var box = $('seo-checklist'); if (!box) return;
      var st = await loadStatus(); st = st || {}; var s = st.settings || {};
      var items = [
        [true, 'Google Site Verification مضاف'], [true, 'Sitemap.xml ثابت + ديناميكي'], [true, 'robots.txt محسّن'],
        [true, 'Meta tags + Open Graph + JSON-LD (Article + FAQ) لكل مقال'],
        [!!st.cloudflare, 'Cloudflare AI مربوط (Settings → Bindings → Workers AI باسم AI)'],
        [!!st.gemini, 'Gemini (اختياري — محرك احتياطي): GEMINI_API_KEY'],
        [!!st.unsplash, 'صور المقالات: UNSPLASH_ACCESS_KEY'],
        [!!st.adminSecret, 'ADMIN_SECRET (يستخدمه GitHub Action للتشغيل التلقائي)'],
        [!!s.enabled, 'التشغيل التلقائي مفعّل من تبويب «تشغيل تلقائي»'],
        [!!s.lastRunAt, 'عمل التشغيل التلقائي مرة على الأقل'],
        [false, 'ربط Google Analytics'], [false, 'تقديم طلب Google AdSense']
      ];
      box.innerHTML = items.map(function (c) {
        return '<div class="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0"><i class="fa-solid ' + (c[0] ? 'fa-circle-check text-green-500' : 'fa-circle-xmark text-red-400') + ' mt-0.5 flex-shrink-0"></i><span class="text-sm ' + (c[0] ? 'text-gray-700' : 'text-gray-400') + '">' + esc(c[1]) + '</span></div>';
      }).join('');
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  }
})();
