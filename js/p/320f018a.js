  // ── State ──────────────────────────────────────────────────────────────────
  let _activeCat   = 'all';
  let _searchQuery = '';
  let _allPosts    = [];
  let _lastDoc     = null;
  const PAGE_SIZE  = 9;

  // ── Filter by category ─────────────────────────────────────────────────────
  BlogEngine.filterCat = function(cat, btn) {
    _activeCat = cat;
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadPosts(true);
  };

  // ── Filter by search ───────────────────────────────────────────────────────
  let _searchTimer;
  BlogEngine.filterSearch = function(q) {
    _searchQuery = q.trim();
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      if (_searchQuery.length === 0 || _searchQuery.length > 1) loadPosts(true);
    }, 350);
  };

  // ── Load posts from Firestore ──────────────────────────────────────────────
  async function loadPosts(reset) {
    const grid = document.getElementById('blog-grid');
    if (!grid) return;

    if (reset) {
      _allPosts = []; _lastDoc = null;
      grid.innerHTML = Array.from({length:6}).map(() => `
        <div data-style="background:linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;border-radius:18px;overflow:hidden;min-height:280px"></div>`).join('');
    }

    try {
      let q = window.db.collection('blog_posts')
        .where('published','==',true)
        .orderBy('createdAt','desc')
        .limit(PAGE_SIZE + 1);

      if (_activeCat !== 'all') q = q.where('category','==',_activeCat);
      if (_lastDoc)             q = q.startAfter(_lastDoc);

      const snap  = await q.get();
      const docs  = snap.docs.slice(0, PAGE_SIZE);
      const posts = docs.map(d => ({ id:d.id,...d.data() }));

      _lastDoc = docs.length === PAGE_SIZE ? docs[docs.length-1] : null;
      document.getElementById('load-more-wrap').style.display = (snap.docs.length > PAGE_SIZE) ? 'block' : 'none';

      // Client-side search
      const filtered = _searchQuery
        ? posts.filter(p => (p.title||'').includes(_searchQuery) || (p.excerpt||'').includes(_searchQuery) || (p.keywords||[]).some(k=>k.includes(_searchQuery)))
        : posts;

      if (reset) { _allPosts = filtered; grid.innerHTML = ''; }
      else        { _allPosts = [..._allPosts, ...filtered]; }

      if (_allPosts.length === 0) {
        grid.innerHTML = `<div data-style="grid-column:1/-1;text-align:center;padding:60px;color:#9ca3af">
          <i class="fa-solid fa-newspaper" data-style="font-size:48px;margin-bottom:16px;opacity:.3;display:block"></i>
          <p data-style="font-weight:700;font-size:16px">لا توجد مقالات</p>
          <p data-style="font-size:13px;margin-top:6px">جرّب تصنيفاً آخر أو انتظر النشر التلقائي</p></div>`;
        return;
      }

      if (reset) {
        grid.innerHTML = _allPosts.map(p => buildCard(p)).join('');
      } else {
        filtered.forEach(p => { grid.insertAdjacentHTML('beforeend', buildCard(p)); });
      }
      addHoverEffects();
    } catch(err) {
      console.warn('[Blog] load error:', err);
      grid.innerHTML = `<div data-style="grid-column:1/-1;text-align:center;padding:40px;color:#ef4444">خطأ في التحميل</div>`;
    }
  }

  BlogEngine.loadMore = function() { loadPosts(false); };

  function buildCard(post) {
    // SECURITY: post fields are rendered via innerHTML — escape everything that is text, allow only https images.
    const E = v => String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
    const IMG = u => /^https:\/\/[^\s"'<>\\]+$/i.test(String(u||'')) ? String(u) : 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&q=70';
    const catColors = {'ربح-من-الانترنت':'#10b981','تسويق-رقمي':'#3b82f6','ذكاء-اصطناعي':'#8b5cf6','تجارة-الكترونية':'#f97316','عمل-حر':'#f59e0b','دفع-الكتروني':'#14b8a6','تصميم-مواقع':'#ec4899','تحسين-بحث':'#6366f1','استثمار':'#eab308'};
    const c = catColors[post.category] || '#6b7280';
    const excerpt = (post.excerpt || (post.content||'').replace(/<[^>]*>/g,'')).slice(0,120) + '…';
    const date = (() => { try { const d = post.createdAt?.toDate ? post.createdAt.toDate() : new Date(post.createdAt?.seconds?post.createdAt.seconds*1000:Date.now()); return d.toLocaleDateString('ar-EG',{month:'short',day:'numeric'}); } catch{return '';} })();
    const words = (post.content||'').replace(/<[^>]*>/g,'').split(/\s+/).length;
    const readMin = Math.max(1,Math.round(words/200));
    return `
    <article data-on-click="openPost(${JSON.stringify(String(post.slug||'')).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')})" data-style="cursor:pointer;background:#fff;border-radius:18px;border:1px solid #e5e7eb;overflow:hidden;transition:transform .25s,box-shadow .25s;display:flex;flex-direction:column" class="blog-card-item">
      <div data-style="height:185px;overflow:hidden;position:relative;background:#f3f4f6">
        <img src="${IMG(post.image)}" alt="${E(post.title)}" loading="lazy"
          data-style="width:100%;height:100%;object-fit:cover;transition:transform .4s"
          data-on-error="this.src='https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&q=70'">
        <div data-style="position:absolute;top:10px;right:10px;background:${c}22;color:${c};font-size:11px;font-weight:700;padding:3px 10px;border-radius:50px;white-space:nowrap">${E((post.category||'').replace(/-/g,' '))}</div>
        ${post.aiGenerated?'<div data-style="position:absolute;top:10px;left:10px;background:#8b5cf6;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:50px">🤖 AI</div>':''}
      </div>
      <div data-style="padding:16px;flex:1;display:flex;flex-direction:column">
        <h3 data-style="font-size:15px;font-weight:900;color:#111827;line-height:1.4;margin-bottom:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${E(post.title)}</h3>
        <p data-style="font-size:13px;color:#6b7280;line-height:1.6;flex:1;margin-bottom:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${E(excerpt)}</p>
        <div data-style="display:flex;align-items:center;justify-content:space-between;font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:10px">
          <span><i class="fa-regular fa-calendar" data-style="margin-left:4px"></i>${date}</span>
          <span><i class="fa-regular fa-clock" data-style="margin-left:4px"></i>${readMin} دقائق</span>
        </div>
      </div>
    </article>`;
  }

  function addHoverEffects() {
    document.querySelectorAll('.blog-card-item').forEach(card => {
      card.addEventListener('mouseenter', () => { card.style.transform='translateY(-4px)'; card.style.boxShadow='0 12px 36px rgba(0,0,0,.1)'; });
      card.addEventListener('mouseleave', () => { card.style.transform=''; card.style.boxShadow=''; });
    });
  }

  // ── Open post ──────────────────────────────────────────────────────────────
  function openPost(slug) {
    document.getElementById('blog-list-view').style.display = 'none';
    document.getElementById('blog-post-view').style.display = 'block';
    window.history.pushState({ blogSlug:slug }, '', '/blog/' + slug);
    BlogEngine.renderPost(slug, 'blog-post-container');
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  BlogEngine.showBlogList = function() {
    document.getElementById('blog-post-view').style.display = 'none';
    document.getElementById('blog-list-view').style.display = 'block';
    window.history.pushState({}, '', '/blog');
    document.title = 'مدونة مول الخدمات';
    window.scrollTo({ top:0, behavior:'smooth' });
  };

  // window.location.pathname is PERCENT-ENCODED for Arabic slugs (%D9%83…). Firestore stores the raw slug, so the
  // lookup used to fail for every directly opened /blog/<arabic-slug> link ("المقال غير موجود") while the same
  // article opened fine from the list (which passes the raw slug). Always decode before querying.
  function slugFromPath() {
    const m = window.location.pathname.match(/^\/blog\/(.+?)\/?$/);
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch (_) { return m[1]; }
  }

  // ── Handle direct /blog/:slug URLs ─────────────────────────────────────────
  (function init() {
    const slugFromUrl = slugFromPath();
    if (slugFromUrl) {
      document.getElementById('blog-list-view').style.display = 'none';
      document.getElementById('blog-post-view').style.display = 'block';
      BlogEngine.renderPost(slugFromUrl, 'blog-post-container');
    } else {
      loadPosts(true);
    }
  })();

  // ── Handle browser back/forward ────────────────────────────────────────────
  window.addEventListener('popstate', (e) => {
    const slug = e.state?.blogSlug || slugFromPath();
    if (slug) {
      document.getElementById('blog-list-view').style.display = 'none';
      document.getElementById('blog-post-view').style.display = 'block';
      BlogEngine.renderPost(slug, 'blog-post-container');
    } else {
      BlogEngine.showBlogList();
    }
  });
