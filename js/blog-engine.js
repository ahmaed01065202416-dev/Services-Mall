/**
 * js/blog-engine.js — Dynamic Blog System v2.0
 * Reads from Firestore blog_posts collection
 * Renders blog list + single post pages — no React needed
 */
(function () {
  'use strict';

  const BLOG_COL = 'blog_posts';
  const PAGE_SIZE = 9;

  // ⚠️ FIXED (found in audit): blog/index.html is a lightweight standalone
  // page with its own minimal Firebase setup — it does NOT load js/constants.js
  // (where the global escapeHtml() normally lives), so every call to
  // escapeHtml() below threw "escapeHtml is not defined" and renderPost()
  // failed with "حدث خطأ في تحميل المقال" for every single article. Defining
  // it locally here — inside this file's own IIFE — is safe even when this
  // same file also runs on the main app's index.html (which DOES have the
  // global one from constants.js): a local function declaration always wins
  // over an outer/global one of the same name within its own scope, so this
  // can't shadow or break the version used elsewhere in the app.
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _fmtDate(ts) {
    try {
      const d = ts?.toDate ? ts.toDate() : new Date(ts?.seconds ? ts.seconds * 1000 : ts || Date.now());
      return d.toLocaleDateString('ar-EG', { year:'numeric', month:'short', day:'numeric' });
    } catch { return ''; }
  }

  function _readTime(html) {
    const words = (html || '').replace(/<[^>]*>/g,'').split(/\s+/).length;
    return Math.max(1, Math.round(words / 200)) + ' دقائق قراءة';
  }

  function _excerpt(html, n) {
    return (html || '').replace(/<[^>]*>/g,'').trim().slice(0, n || 155) + '…';
  }

  // Domains the site used before. Links to them (and to the current host) inside stored articles are turned into
  // relative links, so a domain change never leaves dead/old-domain links in articles. Add old domains to
  // window.MALL_LEGACY_HOSTS (e.g. ['old-name.pages.dev']) if the domain changes again.
  function _fixArticleLinks(html) {
    const hosts = ['mall-services.pages.dev'].concat(window.MALL_LEGACY_HOSTS || []).concat(location.host).map(h => String(h).toLowerCase());
    return String(html || '').replace(/href="https?:\/\/([^\/"?#]+)([^"]*)"/gi, (m, host, rest) =>
      hosts.indexOf(host.toLowerCase()) >= 0 ? 'href="' + (rest || '/') + '"' : m);
  }
  // Links in article text must LOOK clickable. A real stylesheet (the CSP only allows 'self' styles, never an injected <style>).
  (function _linkStyle() {
    if (document.getElementById('mall-article-link-css')) return;
    const l = document.createElement('link'); l.id = 'mall-article-link-css'; l.rel = 'stylesheet'; l.href = '/css/article-links.css?v=1';
    (document.head || document.documentElement).appendChild(l);
  })();

  function _sanitize(html) {
    return _fixArticleLinks(_sanitizeRaw(html));
  }
  function _sanitizeRaw(html) {
    if (typeof DOMPurify !== 'undefined') {
      return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['p','h2','h3','h4','ul','ol','li','strong','em','a','table',
          'thead','tbody','tr','th','td','blockquote','br','img','span','div','code','pre'],
        ALLOWED_ATTR: ['href','src','alt','class','id','target','rel'],
      });
    }
    // ⚠️ FIXED: used to `return html` (fail OPEN) when DOMPurify wasn't loaded —
    // and it was only ever loaded on /blog, never on the main index.html that
    // also renders posts. Post bodies are AI-generated, so raw HTML here is a
    // stored-XSS path. Fail CLOSED: show plain text instead.
    return escapeHtml(String(html || '').replace(/<[^>]*>/g, ''));
  }

  const CAT_COLORS = {
    'ربح-من-الانترنت': '#10b981', 'تسويق-رقمي':'#3b82f6',
    'ذكاء-اصطناعي':    '#8b5cf6', 'تجارة-الكترونية':'#f97316',
    'عمل-حر':          '#f59e0b', 'دفع-الكتروني':'#14b8a6',
    'تصميم-مواقع':     '#ec4899', 'تحسين-بحث':'#6366f1',
    'استثمار':         '#eab308', 'سياحة-وحجوزات':'#0ea5e9',
  };

  function _catBadge(cat) {
    const c = CAT_COLORS[cat] || '#6b7280';
    return `<span data-style="background:${c}22;color:${c};font-size:11px;font-weight:700;padding:3px 10px;border-radius:50px;white-space:nowrap">${escapeHtml((cat||'').replace(/-/g,' '))}</span>`;
  }

  // ── Card HTML ──────────────────────────────────────────────────────────────
  function _card(post) {
    return `
    <article class="blog-card-item" data-on-click="BlogEngine.openPost(${escapeHtml(JSON.stringify(String(post.slug || '')))})"
      data-style="cursor:pointer;background:#fff;border-radius:18px;border:1px solid #e5e7eb;overflow:hidden;
             transition:transform .25s,box-shadow .25s;display:flex;flex-direction:column">
      <div data-style="height:180px;overflow:hidden;position:relative">
        <img src="${escapeHtml(post.image || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&q=70')}"
          alt="${escapeHtml(post.title||'')}" loading="lazy"
          data-style="width:100%;height:100%;object-fit:cover;transition:transform .4s"
          data-on-error="this.src='https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&q=70'" />
        <div data-style="position:absolute;top:10px;right:10px">${_catBadge(post.category)}</div>
        ${post.aiGenerated ? '<div data-style="position:absolute;top:10px;left:10px;background:#8b5cf6;color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:50px">🤖 AI</div>' : ''}
      </div>
      <div data-style="padding:16px;flex:1;display:flex;flex-direction:column">
        <h3 data-style="font-size:15px;font-weight:900;color:#111827;line-height:1.4;margin-bottom:8px;
                   display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">
          ${escapeHtml(post.title||'')}
        </h3>
        <p data-style="font-size:13px;color:#6b7280;line-height:1.6;flex:1;margin-bottom:12px;
                  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">
          ${escapeHtml(post.excerpt || _excerpt(post.content))}
        </p>
        <div data-style="display:flex;align-items:center;justify-content:space-between;font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:10px">
          <span><i class="fa-regular fa-calendar" data-style="margin-left:4px"></i>${_fmtDate(post.createdAt)}</span>
          <span><i class="fa-regular fa-clock" data-style="margin-left:4px"></i>${_readTime(post.content)}</span>
        </div>
      </div>
    </article>`;
  }

  function _cardSkeleton() {
    return `
    <div data-style="background:#fff;border-radius:18px;border:1px solid #e5e7eb;overflow:hidden;animation:shimmer 1.4s infinite;
                background:linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%);background-size:200% 100%">
      <div data-style="height:180px;background:#e5e7eb"></div>
      <div data-style="padding:16px">
        <div data-style="height:16px;background:#e5e7eb;border-radius:8px;margin-bottom:8px;width:80%"></div>
        <div data-style="height:12px;background:#e5e7eb;border-radius:8px;margin-bottom:6px"></div>
        <div data-style="height:12px;background:#e5e7eb;border-radius:8px;width:60%"></div>
      </div>
    </div>`;
  }

  // ── Blog List Page ─────────────────────────────────────────────────────────
  async function renderBlogList(containerId, opts) {
    opts = opts || {};
    const container = document.getElementById(containerId);
    if (!container) return;

    // Show skeletons
    container.innerHTML = Array.from({length:6}).map(_cardSkeleton).join('');

    try {
      let q = window.db.collection(BLOG_COL)
        .where('published','==',true)
        .orderBy('createdAt','desc')
        .limit(opts.limit || PAGE_SIZE);

      if (opts.category) q = q.where('category','==',opts.category);

      const snap  = await q.get();
      const posts = snap.docs.map(d => ({ id:d.id, ...d.data() }));

      if (posts.length === 0) {
        container.innerHTML = `
          <div data-style="grid-column:1/-1;text-align:center;padding:60px 20px;color:#9ca3af">
            <i class="fa-solid fa-newspaper" data-style="font-size:48px;margin-bottom:16px;opacity:.3;display:block"></i>
            <p data-style="font-weight:700;font-size:16px">لا توجد مقالات بعد</p>
            <p data-style="font-size:13px;margin-top:6px">سيتم نشر مقالات تلقائياً قريباً 🤖</p>
          </div>`;
        return;
      }

      container.innerHTML = posts.map(_card).join('');

      // Hover effects
      container.querySelectorAll('.blog-card-item').forEach(card => {
        card.addEventListener('mouseenter', () => {
          card.style.transform = 'translateY(-4px)';
          card.style.boxShadow = '0 12px 40px rgba(0,0,0,.12)';
        });
        card.addEventListener('mouseleave', () => {
          card.style.transform = '';
          card.style.boxShadow = '';
        });
      });

      // Track load event
      if (window.trackEvent) window.trackEvent('blog_list_loaded','blog','count_' + posts.length);

    } catch (err) {
      console.warn('[Blog] renderBlogList error:', err.code, err.message);
      container.innerHTML = `<div data-style="grid-column:1/-1;text-align:center;padding:40px;color:#ef4444">
        <i class="fa-solid fa-exclamation-triangle" data-style="margin-left:8px"></i>حدث خطأ في تحميل المقالات</div>`;
    }
  }

  // ── Single Post Page ───────────────────────────────────────────────────────

  // ── Internal links: services + categories under every article (real hrefs → crawlable, and useful to readers) ──
  const _CAT_LABELS = { design:'تصميم', programming:'برمجة', marketing:'تسويق', writing:'كتابة', video:'فيديو', seo:'SEO', audio:'صوتيات', data:'بيانات', clothing:'ملابس', electronics:'إلكترونيات', home:'مستلزمات منزلية', beauty:'مستحضرات تجميل', food:'أطعمة ومشروبات', accessories:'إكسسوارات' };
  async function _appendRelated(container) {
    try {
      const res = await fetch('/api/home-feed?section=services');
      const data = res.ok ? await res.json() : null;
      const items = ((data && data.items) || []).filter(x => x && /^[A-Za-z0-9_\-]{1,128}$/.test(String(x.id || '')) && x.title).slice(0, 6);
      if (!items.length) return;
      const cats = [...new Set(items.map(x => x.category).filter(c => _CAT_LABELS[c]))];
      const chip = 'display:inline-block;padding:6px 14px;margin:4px;border-radius:999px;background:#f3f4f6;color:#374151;font-size:13px;font-weight:700;text-decoration:none';
      const html = `<section data-style="max-width:1100px;margin:0 auto;padding:0 20px 28px">
        <h2 data-style="font-size:18px;font-weight:900;margin:0 0 12px;color:#0F172A">خدمات قد تهمك</h2>
        <div>${items.map(x => `<a href="/service/${encodeURIComponent(x.id)}" data-style="${chip}">${escapeHtml(String(x.title).slice(0, 70))}</a>`).join('')}</div>
        ${cats.length ? `<div data-style="margin-top:8px">${cats.map(c => `<a href="/c/${c}" data-style="${chip};background:#fff7e6">${_CAT_LABELS[c]}</a>`).join('')}</div>` : ''}
      </section>`;
      const anchor = container.querySelector('button[data-on-click="BlogEngine.showBlogList()"]');
      const host = anchor && anchor.parentElement;
      if (host) host.insertAdjacentHTML('beforebegin', html); else container.insertAdjacentHTML('beforeend', html);
    } catch (_) { /* optional block: never break the article */ }
  }

  async function renderPost(slug, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !slug) return;
    // a slug taken from location.pathname arrives percent-encoded; the stored slug is the raw text
    if (/%[0-9A-Fa-f]{2}/.test(slug)) { try { slug = decodeURIComponent(slug); } catch (_) { /* keep as is */ } }
    slug = String(slug).replace(/\/+$/, '');

    // Loading state
    container.innerHTML = `
      <div data-style="max-width:860px;margin:0 auto;padding:40px 24px">
        <div data-style="height:400px;background:linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;border-radius:20px;margin-bottom:32px"></div>
        <div data-style="height:24px;background:#e5e7eb;border-radius:8px;margin-bottom:14px;width:70%"></div>
        <div data-style="height:16px;background:#e5e7eb;border-radius:8px;margin-bottom:10px"></div>
        <div data-style="height:16px;background:#e5e7eb;border-radius:8px;width:85%"></div>
      </div>`;

    try {
      const snap = await window.db.collection(BLOG_COL)
        .where('slug','==',slug).where('published','==',true).limit(1).get();

      if (snap.empty) {
        container.innerHTML = `<div data-style="text-align:center;padding:80px;color:#6b7280">
          <i class="fa-solid fa-search" data-style="font-size:48px;margin-bottom:16px;opacity:.3;display:block"></i>
          <p data-style="font-weight:700;font-size:18px">المقال غير موجود</p>
          <button data-on-click="BlogEngine.showBlogList()" data-style="margin-top:20px;background:#0F172A;color:#fff;border:none;padding:10px 24px;border-radius:12px;cursor:pointer;font-family:inherit;font-weight:700">
            العودة للمدونة</button></div>`;
        return;
      }

      const doc  = snap.docs[0];
      const post = { id: doc.id, ...doc.data() };

      // Increment views
      doc.ref.update({ views: (window.firebase?.firestore?.FieldValue?.increment(1) || (post.views||0)+1) }).catch(()=>{});

      const shareURL = `${window.location.origin}/blog/${post.slug}`;
      let cleanContent = _sanitize(post.content || '');
      // Optional video (YouTube only, privacy-enhanced embed). The id is regex-validated, so nothing else can reach the iframe src.
      const _ytm = String(post.video || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
      if (_ytm) {
        const _vid = `<div class="mall-video"><iframe src="https://www.youtube-nocookie.com/embed/${_ytm[1]}" title="${escapeHtml(post.title || '')}" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
        const _h2 = cleanContent.indexOf('<h2');
        cleanContent = _h2 > 0 ? cleanContent.slice(0, _h2) + _vid + cleanContent.slice(_h2) : _vid + cleanContent;
      }

      // ── Render reading progress bar ──────────────────────────
      let progressBar = document.getElementById('reading-progress');
      if (!progressBar) {
        progressBar = document.createElement('div');
        progressBar.id = 'reading-progress';
        progressBar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#0F172A,#ec4899);transform-origin:left;z-index:9999;transform:scaleX(0);transition:transform .1s';
        document.body.appendChild(progressBar);
      }
      const onScroll = () => {
        const el  = document.getElementById('post-article-body');
        if (!el) return;
        const { top, height } = el.getBoundingClientRect();
        const start = window.scrollY + top;
        const pct   = Math.max(0, Math.min(1, (window.scrollY - start + window.innerHeight) / height));
        progressBar.style.transform = `scaleX(${pct})`;
      };
      window.addEventListener('scroll', onScroll, { passive:true });

      // ── Render post ────────────────────────────────────────────
      container.innerHTML = `
      <div>
        <!-- Hero image -->
        <div data-style="position:relative;height:420px;overflow:hidden">
          <img loading="lazy" decoding="async" src="${escapeHtml(post.image || '')}" alt="${escapeHtml(post.title||'')}"
            data-style="width:100%;height:100%;object-fit:cover"
            data-on-error="this.src='https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80'" />
          <div data-style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.75) 0%,rgba(0,0,0,.2) 60%,transparent 100%)"></div>
          <div data-style="position:absolute;bottom:0;width:100%;padding:28px 24px">
            <div data-style="max-width:860px;margin:0 auto">
              <div data-style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
                ${_catBadge(post.category)}
                ${post.aiGenerated && !post.humanReviewed ? '<span data-style="background:#8b5cf6;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:50px">🤖 مُنشأ بالذكاء الاصطناعي</span>' : ''}
              </div>
              <h1 data-style="font-size:clamp(20px,4vw,36px);font-weight:900;color:#fff;line-height:1.3;margin:0">
                ${escapeHtml(post.title||'')}
              </h1>
              <div data-style="display:flex;gap:16px;margin-top:12px;font-size:13px;color:rgba(255,255,255,.75);flex-wrap:wrap">
                <span><i class="fa-regular fa-calendar" data-style="margin-left:5px"></i>${_fmtDate(post.createdAt)}</span>
                <span><i class="fa-regular fa-clock" data-style="margin-left:5px"></i>${_readTime(post.content)}</span>
                <span><i class="fa-regular fa-eye" data-style="margin-left:5px"></i>${((post.views||0)+1).toLocaleString('ar-EG')} مشاهدة</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Main layout -->
        <div data-style="max-width:1100px;margin:0 auto;padding:40px 20px;display:grid;grid-template-columns:1fr 300px;gap:40px;align-items:start">

          <!-- Article body -->
          <div>
            <!-- In-article Ad -->
            <div data-style="background:#f9fafb;border:1px dashed #e5e7eb;border-radius:14px;padding:20px;text-align:center;color:#9ca3af;font-size:13px;margin-bottom:28px">
              <i class="fa-solid fa-rectangle-ad" data-style="font-size:28px;margin-bottom:6px;opacity:.3;display:block"></i>
              إعلان — Google AdSense
            </div>

            <!-- Content -->
            <article id="post-article-body" class="article-body" data-style="background:#fff;border-radius:18px;padding:36px;border:1px solid #e5e7eb;box-shadow:0 2px 12px rgba(0,0,0,.05)">
              ${cleanContent}
            </article>

            <!-- Keywords -->
            ${post.keywords?.length ? `
            <div data-style="margin-top:20px;display:flex;gap:8px;flex-wrap:wrap">
              ${post.keywords.map(k => `<span data-style="background:#EEF2F8;color:#0F172A;font-size:12px;font-weight:600;padding:5px 12px;border-radius:50px">#${escapeHtml(k)}</span>`).join('')}
            </div>` : ''}

            <!-- Share -->
            <div data-style="margin-top:28px;background:#f8fafc;border-radius:16px;padding:20px;border:1px solid #e5e7eb">
              <p data-style="font-weight:900;font-size:14px;color:#111827;margin-bottom:14px">
                <i class="fa-solid fa-share-nodes" data-style="color:#0F172A;margin-left:8px"></i>شارك هذا المقال
              </p>
              <div data-style="display:flex;gap:10px;flex-wrap:wrap">
                <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareURL)}" target="_blank" rel="noopener"
                  data-style="display:flex;align-items:center;gap:6px;background:#1877f2;color:#fff;padding:9px 16px;border-radius:10px;text-decoration:none;font-size:13px;font-weight:700">
                  <i class="fa-brands fa-facebook-f"></i>فيسبوك</a>
                <a href="https://wa.me/?text=${encodeURIComponent(post.title+' '+shareURL)}" target="_blank" rel="noopener"
                  data-style="display:flex;align-items:center;gap:6px;background:#25d366;color:#fff;padding:9px 16px;border-radius:10px;text-decoration:none;font-size:13px;font-weight:700">
                  <i class="fa-brands fa-whatsapp"></i>واتساب</a>
                <a href="https://twitter.com/intent/tweet?url=${encodeURIComponent(shareURL)}&text=${encodeURIComponent(post.title)}" target="_blank" rel="noopener"
                  data-style="display:flex;align-items:center;gap:6px;background:#000;color:#fff;padding:9px 16px;border-radius:10px;text-decoration:none;font-size:13px;font-weight:700">
                  <i class="fa-brands fa-x-twitter"></i>تويتر</a>
                <button data-on-click="navigator.clipboard.writeText('${shareURL}').then(()=>this.textContent='✅ تم النسخ')"
                  data-style="display:flex;align-items:center;gap:6px;background:#e5e7eb;color:#374151;padding:9px 16px;border-radius:10px;border:none;cursor:pointer;font-size:13px;font-weight:700;font-family:inherit">
                  <i class="fa-solid fa-link"></i>نسخ الرابط</button>
              </div>
            </div>
          </div>

          <!-- Sidebar -->
          <aside data-style="position:sticky;top:90px;display:flex;flex-direction:column;gap:20px">

            <!-- Ad sidebar -->
            <div data-style="background:#f9fafb;border:1px dashed #e5e7eb;border-radius:14px;min-height:250px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#9ca3af;font-size:13px">
              <i class="fa-solid fa-rectangle-ad" data-style="font-size:32px;margin-bottom:8px;opacity:.3"></i>
              مساحة إعلانية
            </div>

            <!-- Newsletter -->
            <div data-style="background:linear-gradient(135deg,#1e3a8a,#7c3aed);border-radius:18px;padding:22px;color:#fff">
              <i class="fa-solid fa-envelope-open-text" data-style="font-size:28px;margin-bottom:10px;opacity:.8;display:block"></i>
              <p data-style="font-weight:900;font-size:14px;margin-bottom:6px">النشرة البريدية</p>
              <p data-style="font-size:12px;opacity:.85;margin-bottom:14px">مقال جديد كل يوم — مجاناً</p>
              <input type="email" id="sidebar-email" placeholder="بريدك الإلكتروني"
                data-style="width:100%;padding:10px 12px;border-radius:10px;border:none;font-family:inherit;font-size:13px;margin-bottom:10px;outline:none" />
              <button data-on-click="BlogEngine.subscribe()" data-style="width:100%;padding:10px;background:rgba(255,255,255,.2);border:2px solid rgba(255,255,255,.3);border-radius:10px;color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">
                اشتراك مجاني
              </button>
              <p id="sidebar-subscribe-msg" data-style="font-size:12px;margin-top:8px;display:none;color:#a7f3d0;font-weight:700"></p>
            </div>

            <!-- CTA -->
            <div data-style="background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:20px;text-align:center">
              <i class="fa-solid fa-store" data-style="font-size:32px;color:#0F172A;margin-bottom:10px;display:block"></i>
              <p data-style="font-weight:900;font-size:14px;color:#111827;margin-bottom:6px">ابدأ على المنصة</p>
              <p data-style="font-size:12px;color:#6b7280;margin-bottom:14px">سجّل الآن وابدأ في دقائق</p>
              <a href="/#services"
                data-style="display:block;width:100%;padding:10px;background:#0F172A;color:#fff;border:none;border-radius:10px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;text-align:center;text-decoration:none;box-sizing:border-box">
                استعرض الخدمات
              </a>
            </div>

          </aside>
        </div>

        <!-- Back button -->
        <div data-style="max-width:1100px;margin:0 auto;padding:0 20px 40px">
          <button data-on-click="BlogEngine.showBlogList()"
            data-style="display:inline-flex;align-items:center;gap:8px;background:#f3f4f6;color:#374151;border:none;padding:10px 20px;border-radius:12px;cursor:pointer;font-family:inherit;font-size:14px;font-weight:700">
            <i class="fa-solid fa-arrow-right"></i> العودة للمدونة
          </button>
        </div>
      </div>`;

      // Responsive sidebar — hide on mobile
      // CSP: injected as a constructable stylesheet (csp-shim.js), not a <style> element
      window.__cssInject('blogSidebarCss-' + containerId, `
        @media(max-width:768px){
          #${containerId} aside { display:none!important; }
          #${containerId} > div > div[style*="grid-template-columns"] {
            display:block!important;
          }
        }`);
      _appendRelated(container);

      // Update page title + meta
      document.title = `${post.title} | مول الخدمات`;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute('content', post.excerpt || _excerpt(post.content));

      // Track
      if (window.trackEvent) window.trackEvent('blog_post_view','blog', post.slug);

    } catch(err) {
      console.warn('[Blog] renderPost error:', err.message);
      container.innerHTML = `<div data-style="text-align:center;padding:60px;color:#ef4444">
        حدث خطأ في تحميل المقال</div>`;
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  function openPost(slug) {
    window.history.pushState({ blogSlug: slug }, '', `/blog/${slug}`);
    document.getElementById('blog-list-view') && (document.getElementById('blog-list-view').style.display = 'none');
    document.getElementById('blog-post-view') && (document.getElementById('blog-post-view').style.display = 'block');
    renderPost(slug, 'blog-post-container');
    window.scrollTo({ top: 0, behavior:'smooth' });
  }

  function showBlogList() {
    window.history.pushState({}, '', '/blog/');
    document.getElementById('blog-post-view')  && (document.getElementById('blog-post-view').style.display = 'none');
    document.getElementById('blog-list-view')  && (document.getElementById('blog-list-view').style.display = 'block');
    document.title = 'المدونة | مول الخدمات';
    // Remove progress bar
    const pb = document.getElementById('reading-progress');
    if (pb) pb.style.transform = 'scaleX(0)';
    window.scrollTo({ top: 0, behavior:'smooth' });
  }

  // ── Newsletter ─────────────────────────────────────────────────────────────
  function subscribe() {
    const email = document.getElementById('sidebar-email')?.value?.trim();
    const msg   = document.getElementById('sidebar-subscribe-msg');
    if (!email || !email.includes('@')) {
      if (msg) { msg.style.color='#fca5a5'; msg.textContent='بريد غير صحيح'; msg.style.display='block'; }
      return;
    }
    if (msg) { msg.style.color='#a7f3d0'; msg.textContent='✅ تم الاشتراك بنجاح!'; msg.style.display='block'; }
    // Save to Firestore (optional)
    if (window.db) {
      window.db.collection('newsletter_subscribers').add({ email, createdAt: new Date(), source:'blog_sidebar' }).catch(()=>{});
    }
    if (window.trackEvent) window.trackEvent('newsletter_subscribe','blog','sidebar');
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  window.BlogEngine = { renderBlogList, renderPost, openPost, showBlogList, subscribe };

  console.log('✅ BlogEngine v2.0 ready — Firestore connected');
})();
