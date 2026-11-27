(function() {
    'use strict';

    // ── Cart Renderer ─────────────────────────────────────────────────────────
    function renderCart() {
        const container = document.getElementById('cartItems');
        const empty     = document.getElementById('cartEmpty');
        const summary   = document.getElementById('cartSummary');
        const checkBtn  = document.getElementById('cartCheckoutBtn');
        if (!container) return;

        const cart = AppState.cart || [];

        if (cart.length === 0) {
            container.innerHTML = '';
            if (empty)   empty.classList.remove('hidden');
            if (checkBtn) checkBtn.disabled = true;
            if (summary) summary.innerHTML = '';
            return;
        }
        if (empty) empty.classList.add('hidden');
        if (checkBtn) checkBtn.disabled = false;

        const isAr = AppState.language !== 'en';
        container.innerHTML = cart.map((item, idx) => `
          <div class="bg-white rounded-2xl border border-gray-200 p-5 flex gap-4 hover:border-navy-300 transition cart-item" data-id="${escapeHtml(item.id)}">
            <img src="${escapeHtml(item.image || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=120')}"
              class="w-20 h-20 rounded-xl object-cover flex-shrink-0"
              data-on-error="this.src='https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=120'">
            <div class="flex-1 min-w-0">
              <h3 class="font-black text-gray-900 truncate">${escapeHtml(item.title || '—')}</h3>
              <p class="text-sm text-gray-500 mt-0.5">${escapeHtml(item.sellerName || '')}</p>
              <p class="text-navy-700 font-black text-lg mt-2">${formatCurrency(item.price || 0)}</p>
            </div>
            <button data-on-click="removeFromCart(${escapeHtml(JSON.stringify(String(item.id)))})"
              class="w-9 h-9 bg-red-50 hover:bg-red-100 rounded-xl flex items-center justify-center text-red-500 transition flex-shrink-0 self-start">
              <i class="fa-solid fa-trash text-sm"></i>
            </button>
          </div>
        `).join('');

        // Update summary
        const { subtotal, fees, total } = getCartTotals();
        if (summary) {
            summary.innerHTML = `
              <div class="flex justify-between text-sm text-gray-600">
                <span data-i18n="cart.subtotal">${t('cart.subtotal')}</span>
                <span class="font-bold">${formatCurrency(subtotal)}</span>
              </div>
              ${fees > 0 ? `<div class="flex justify-between text-sm text-gray-600">
                <span>${t('cart.fees')} (${window._feeLabel()})</span>
                <span class="font-bold">${formatCurrency(fees)}</span>
              </div>` : ''}
              <hr class="border-gray-100">
              <div class="flex justify-between text-lg font-black text-navy-700">
                <span data-i18n="cart.total">${t('cart.total')}</span>
                <span>${formatCurrency(total)}</span>
              </div>`;
        }
        updateCartCount();
    }

    // ── UI Event Handlers ─────────────────────────────────────────────────────
    window.toggleUserMenu = function() {
        document.getElementById('userDropdown')?.classList.toggle('active');
    };
    window.toggleMobileMenu = function() {
        document.getElementById('mobileMenu')?.classList.toggle('hidden');
    };
    window.toggleNotifDropdown = function() {
        document.getElementById('notifDropdown')?.classList.toggle('hidden');
    };
    window.markAllNotifsRead = async function() {
        const user = AppState.currentUser;
        if (!user) return;
        try {
            const snap = await db.collection(COLLECTIONS.NOTIFICATIONS)
                .where('userId','==',user.uid).where('read','==',false).get();
            const batch = db.batch();
            snap.docs.forEach(d => batch.update(d.ref, { read: true }));
            await batch.commit();
        } catch (_) {}
    };

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#userMenuWrap'))     document.getElementById('userDropdown')?.classList.remove('active');
        if (!e.target.closest('#currencyToggle') && !e.target.closest('#currencyMenu')) document.getElementById('currencyMenu')?.classList.remove('active');
        if (!e.target.closest('#notifBtn') && !e.target.closest('#notifDropdown')) document.getElementById('notifDropdown')?.classList.add('hidden');
        if (!e.target.closest('nav') && !e.target.closest('#mobileMenu')) document.getElementById('mobileMenu')?.classList.add('hidden');
    });

    // ── Hash-based routing ────────────────────────────────────────────────────
    // ⚠️ FIXED: a hard refresh while on the order workspace (#workspace) used
    // to leave the user on a completely blank page. Why: navigateTo('workspace')
    // just marks that page div active — the actual content only ever gets
    // rendered by openWorkspace(orderId), which is called with an order id
    // from a button click, never from routing. The bare "#workspace" hash
    // carries no order id, so there was nothing to render.
    // Now: openWorkspace() rewrites the URL to "#workspace-<orderId>" once a
    // workspace is actually open, so refreshing (or sharing the link) can
    // deep-link straight back into that same order once the user's auth
    // state is known. A bare "#workspace" (no id — e.g. an old bookmark)
    // goes home instead of showing a blank shell.
    function handleHash() {
        const raw = window.location.hash.replace('#','') || 'home';
        const wsMatch = raw.match(/^workspace-(.+)$/);
        if (wsMatch) {
            const orderId = window.safeId(wsMatch[1]);
            (window._authReadyPromise || Promise.resolve()).then(() => {
                if (AppState.currentUser && typeof openWorkspace === 'function') {
                    openWorkspace(orderId);
                } else {
                    navigateTo('home');
                }
            });
            return;
        }
        const stMatch = raw.match(/^store-(.+)$/);
        if (stMatch) { navigateTo('store'); if (window.StoresManager) StoresManager.openStore(window.safeId(stMatch[1])); return; }   // hash comes from the URL — plain id tokens only
        if (raw === 'workspace') { navigateTo('home'); return; }
        const validPages = ['home','services','orders','workspace','dashboard','login','register','profile','wallet','admin','seller','add-service','stores','my-store'];
        const page = validPages.includes(raw) ? raw : 'home';

        // ⚠️ FIXED: refreshing (F5) on a signed-in page such as #dashboard showed "تسجيل الدخول" even though the user
        // was signed in. Cause: this ran before Firebase had restored the session, so AppState.currentUser was still
        // empty when the page's init function ran — and nothing re-ran it afterwards. Now, for pages that depend on the
        // signed-in user, we wait until the session AND the user profile are known, then open the SAME page the user
        // was on. A visitor who is genuinely signed out still gets the page's own login prompt, as before.
        const AUTH_PAGES = ['orders','dashboard','profile','wallet','admin','seller','add-service','my-store'];
        if (AUTH_PAGES.includes(page) && !AppState.currentUser) {
            const startedOn = window.location.hash;
            // Keep the branded splash screen (#appLoadingScreen) up until the page is really open — no second loader on top of it.
            window.__holdAppLoading = true;
            const open = () => {
                // the user clicked somewhere else while we were waiting → do not override their navigation
                if (window.location.hash === startedOn) { try { navigateTo(page); } catch (e) { console.error(e); } }
                window.__holdAppLoading = false;
                if (window.__hideAppLoading) window.__hideAppLoading();
            };
            (window._authReadyPromise || Promise.resolve()).then(() => {
                // _authReadyPromise resolves as soon as Firebase knows whether someone is signed in; the profile
                // (AppState.currentUser, incl. role) loads a moment later — wait for it (max 8s).
                const fbUser = window.auth && window.auth.currentUser;
                if (!fbUser) { open(); return; }                      // signed out → show the page's login prompt
                const t0 = Date.now();
                (function waitProfile() {
                    if (AppState.currentUser || Date.now() - t0 > 8000) { open(); return; }
                    setTimeout(waitProfile, 50);
                })();
            });
            return;
        }
        navigateTo(page);
    }
    window.addEventListener('popstate', handleHash);

    // ── Featured Services Loader ──────────────────────────────────────────────
    // Homepage data comes from /api/home-feed via the global fetchHomeFeed() (js/constants.js): same public listings without the
    // multi-MB base64 photos; it returns null on failure so each loader falls back to its previous direct-Firestore path.

    async function loadFeaturedServices() {
        try {
            const container = document.getElementById('featuredServices');
            if (!container) return;

            let docs;
            const feed = await fetchHomeFeed('services');
            if (feed && Array.isArray(feed.items)) {
                docs = feed.items.map(it => ({ id: it.id, data: () => it }));
            } else {
            const snap = await db.collection(COLLECTIONS.SERVICES)
                .where('active','==',true)
                .where('featured','==',true)
                .limit(12).get();

            // Filter out product listings client-side (no extra composite
            // index needed) — this section is "custom services" only, real
            // digital products get their own dedicated grid (loadHomeProducts).
            docs = snap.docs.filter(d => (d.data().listingType||'service') !== 'product');

            if (docs.length === 0) {
                const allSnap = await db.collection(COLLECTIONS.SERVICES).where('active','==',true).limit(20).get();
                docs = allSnap.docs.filter(d => (d.data().listingType||'service') !== 'product');
            }
            }

            if (docs.length === 0) { container.innerHTML = `<p class="text-gray-400 col-span-3 text-center py-8">لا توجد خدمات بعد</p>`; return; }
            _renderFeaturedCards(docs.slice(0,6), container);
        } catch (err) {
            console.warn('[Featured] Error:', err.message);
        }
    }

    function _renderFeaturedCards(docs, container) {
        const isAr = AppState.language !== 'en';
        container.innerHTML = docs.map(doc => {
            const s = { id: doc.id, ...doc.data() };
            const stars = Math.round(s.rating || 0);
            const isInstant = s.orderMode === 'instant';
            const requestData = JSON.stringify({id:s.id,title:s.title||'',price:s.price||0,image:getServiceImage(s),sellerId:s.sellerId||'',sellerName:s.sellerName||'',deliveryDays:s.deliveryDays||3}).replace(/"/g,'&quot;');
            return `
            <div class="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col cursor-pointer" data-on-click="ServicesManager.openServiceDetail('${s.id}')">
              <div class="relative aspect-video bg-gray-100">
                <img src="${getServiceImage(s) || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500'}"
                  class="w-full h-full object-cover" loading="lazy"
                  data-on-error="this.src='https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500'">
                <span class="absolute top-3 start-3 bg-turquoise-50 text-turquoise-700 text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                  <i class="fa-solid fa-shield text-[10px]"></i> ضمان مالي Escrow
                </span>
              </div>
              <div class="p-4 flex flex-col gap-3 flex-1">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <img src="${window.safeUrl(s.sellerAvatar) || 'https://ui-avatars.com/api/?name=' + window.encName(s.sellerName||'U')}" class="w-8 h-8 rounded-full object-cover">
                    <span class="text-xs font-bold text-gray-700">${escapeHtml(s.sellerName || '—')}</span>
                  </div>
                  <div class="flex items-center gap-1 text-amber-500 text-xs font-bold">
                    ${(s.reviewCount||0) > 0 ? `<i class="fa-solid fa-star"></i><span class="text-gray-900">${Number(s.rating||0).toFixed(1)}</span><span class="text-gray-400 font-normal">(${s.reviewCount})</span>` : `<span class="text-gray-400 font-bold">${AppState.language !== 'en' ? 'جديد' : 'New'}</span>`}
                  </div>
                </div>
                <h3 class="font-black text-gray-900 text-sm leading-snug line-clamp-2">${escapeHtml(s.title || '—')}</h3>
                <div class="flex flex-wrap gap-2 text-[11px] text-gray-500">
                  <span class="bg-gray-50 px-2 py-1 rounded-md flex items-center gap-1"><i class="fa-regular fa-clock text-gray-400"></i>تسليم ${s.deliveryDays||3} أيام</span>
                  <span class="bg-gray-50 px-2 py-1 rounded-md flex items-center gap-1"><i class="fa-solid ${isInstant?'fa-lock':'fa-paper-plane'} text-gray-400"></i>${isInstant?'دفع مباشر':'طلب ثم موافقة'}</span>
                </div>
              </div>
              <div class="p-4 bg-gray-50/70 flex items-center justify-between border-t border-gray-100">
                <div>
                  <p class="text-[11px] text-gray-400 leading-none mb-1">يبدأ من</p>
                  <p class="font-black text-navy-900" data-price-egp="${s.price||0}">${formatCurrency(s.price||0)}</p>
                </div>
                <button data-on-click="event.stopPropagation();${isInstant?'RequestSystem.openInstantModal':'RequestSystem.openRequestModal'}(${requestData})"
                  class="bg-secondary text-white text-xs font-bold px-4 py-2.5 rounded-lg hover:bg-secondary-600 transition flex items-center gap-1.5">
                  <i class="fa-solid ${isInstant?'fa-lock':'fa-paper-plane'}"></i>${isInstant?(isAr?'اطلب وادفع':'Pay & Request'):(isAr?'اطلب الآن':'Request now')}
                </button>
              </div>
            </div>`;
        }).join('');
    }

    // ⚠️ ADDED: real "digital products" grid for the homepage spotlight
    // section — same data-loading pattern as loadFeaturedServices() but
    // filtered to listingType === 'product', with a buy-now style card.
    async function loadHomeProducts() {
        try {
            const container = document.getElementById('homeProductsGrid');
            if (!container) return;
            let pdocs;
            const pfeed = await fetchHomeFeed('products');
            if (pfeed && Array.isArray(pfeed.items)) {
                pdocs = pfeed.items.map(it => ({ id: it.id, data: () => it }));
            } else {
                const snap = await db.collection(COLLECTIONS.SERVICES)
                    .where('active', '==', true)
                    .where('listingType', '==', 'product')
                    .limit(8).get();
                pdocs = snap.docs;
            }
            if (!pdocs.length) { container.innerHTML = `<p class="text-gray-400 col-span-4 text-center py-8">لا توجد منتجات بعد</p>`; return; }
            const isAr = AppState.language !== 'en';
            container.innerHTML = pdocs.map(doc => {
                const s = { id: doc.id, ...doc.data() };
                const cartData = JSON.stringify({id:s.id,title:s.title||'',price:s.price||0,image:getServiceImage(s),sellerId:s.sellerId||'',sellerName:s.sellerName||'',deliveryDays:s.deliveryDays||0,orderRules:s.orderRules||'',structuredFields:s.structuredFields||[]}).replace(/"/g,'&quot;');
                return `
                <div class="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col cursor-pointer" data-on-click="ServicesManager.openServiceDetail('${s.id}')">
                  <div class="relative aspect-video bg-gray-100">
                    <img src="${getServiceImage(s) || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500'}"
                      class="w-full h-full object-cover" loading="lazy"
                      data-on-error="this.src='https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500'">
                    <span class="absolute top-3 start-3 bg-turquoise-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                      <i class="fa-solid fa-bolt text-[10px]"></i> تسليم فوري
                    </span>
                  </div>
                  <div class="p-4 flex flex-col gap-2 flex-1">
                    <div class="flex items-center justify-between">
                      <span class="text-xs text-gray-400 font-bold">${escapeHtml(s.sellerName||'—')}</span>
                      <div class="flex items-center gap-1 text-amber-500 text-xs font-bold">${(s.reviewCount||0) > 0 ? `<i class="fa-solid fa-star"></i><span class="text-gray-900">${Number(s.rating||0).toFixed(1)}</span><span class="text-gray-400 font-normal">(${s.reviewCount})</span>` : `<span class="text-gray-400 font-bold">${AppState.language !== 'en' ? 'جديد' : 'New'}</span>`}</div>
                    </div>
                    <h3 class="font-black text-gray-900 text-sm leading-snug line-clamp-2">${escapeHtml(s.title||'—')}</h3>
                  </div>
                  <div class="p-4 bg-gray-50/70 flex items-center justify-between border-t border-gray-100">
                    <span class="font-black text-navy-900" data-price-egp="${s.price||0}">${formatCurrency(s.price||0)}</span>
                    <button data-on-click="event.stopPropagation();RequestSystem.openProductOrderModal(${cartData})"
                      class="bg-turquoise-600 text-white text-xs font-bold px-4 py-2.5 rounded-lg hover:bg-turquoise-700 transition flex items-center gap-1.5">
                      <i class="fa-solid fa-cart-shopping"></i>${isAr?'شراء فوري':'Buy now'}
                    </button>
                  </div>
                </div>`;
            }).join('');
        } catch (err) {
            console.warn('[loadHomeProducts] Error:', err.message);
        }
    }

    window.filterByCategory = function(cat) {
        // ⚠️ FIXED: no more setTimeout re-apply here — initServicesPage()
        // (run by navigateTo) reads AppState.filterCategory/filterType/
        // searchQuery synchronously, in the right order, before the list
        // loads. The old delayed calls raced the load and (in the hero
        // search) applied category-then-type, which wiped the category.
        AppState.filterCategory = cat;
        navigateTo('services');
    };

    // ⚠️ FIXED: "الخدمات" and "المنتجات" both navigate to the SAME page
    // ('services') — navigateTo()'s [data-nav] highlighter only ever matches
    // data-nav="services" (the actual page id), so it always underlined
    // "الخدمات" in the top nav even while the "منتجات" pill below was the
    // one actually selected. Now the nav underline is corrected right after
    // navigation to match whichever type was really requested.
    window.filterByType = function(type) {
        AppState.filterType = type;
        navigateTo('services');
        _syncTypeNavHighlight(type);
    };

    window._syncTypeNavHighlight = function(type) {
        // '' (الكل) → neither "الخدمات" nor "المنتجات" is specifically active
        const navKey = type === 'product' ? 'products' : type === 'service' ? 'services' : null;
        document.querySelectorAll('[data-nav="services"], [data-nav="products"]').forEach(el => {
            el.classList.toggle('active', navKey !== null && el.dataset.nav === navKey);
        });
        document.querySelectorAll('[data-mobile-nav="services"], [data-mobile-nav="products"]').forEach(el => {
            el.classList.toggle('text-secondary', navKey !== null && el.dataset.mobileNav === navKey);
            el.classList.toggle('text-textsecondary', navKey === null || el.dataset.mobileNav !== navKey);
        });
    };

    // ⚠️ ADDED: combined type+category filter, used by the homepage's dual
    // category browse section (e.g. "قوالب SaaS و UI" = product + programming).
    window.filterByTypeAndCategory = function(type, cat) {
        AppState.filterType = type;
        AppState.filterCategory = cat;
        navigateTo('services');
        _syncTypeNavHighlight(type);
    };

    // ⚠️ ADDED: toggle the hero's services/products segmented control —
    // purely cosmetic (which tab looks active + placeholder text); the
    // actual search still runs through doHeroSearch() below, now aware of
    // which segment is selected.
    window._heroSearchMode = 'services';
    window.switchHeroSearch = function(mode) {
        window._heroSearchMode = mode;
        const tabServices = document.getElementById('heroTabServices');
        const tabProducts = document.getElementById('heroTabProducts');
        const input = document.getElementById('heroSearchInput');
        const activeCls   = 'flex items-center gap-1.5 px-4 py-2 rounded-lg bg-navy-900 text-white text-sm font-bold transition';
        const inactiveCls = 'flex items-center gap-1.5 px-4 py-2 rounded-lg text-gray-500 hover:text-navy-900 text-sm font-bold transition';
        if (!tabServices || !tabProducts) return;
        if (mode === 'products') {
            tabProducts.className = activeCls; tabServices.className = inactiveCls;
            if (input) input.placeholder = 'ابحث عن قوالب Figma، سكريبتات Laravel، حزم تصميم جاهزة...';
        } else {
            tabServices.className = activeCls; tabProducts.className = inactiveCls;
            if (input) input.placeholder = 'ابحث عن برمجة متجر، تصميم هوية، قوالب Figma...';
        }
    };

    // Hero search bar (home page) — navigates to services and applies the
    // typed query + selected category + selected services/products segment.
    window.doHeroSearch = function() {
        const query = document.getElementById('heroSearchInput')?.value.trim() || '';
        const cat   = document.getElementById('heroSearchCategory')?.value || '';
        const type  = window._heroSearchMode === 'products' ? 'product' : (window._heroSearchMode === 'services' ? 'service' : '');
        AppState.filterCategory = cat;
        AppState.filterType = type;
        AppState.searchQuery = query;
        navigateTo('services');
    };

    // ── Home page stats — real counts from Firestore, not hardcoded marketing
    //    numbers. Fetched from /api/home-stats (server-side, service account)
    //    rather than queried directly from the client: `orders` and `users`
    //    reads are locked down by firestore.rules to "your own data only", so
    //    a guest browsing the homepage couldn't run these counts directly —
    //    see functions/api/home-stats.js for why. Runs once per session via
    //    the initHomePage convention (fires on first load + every home visit,
    //    but only actually fetches once). ─────────────────────────────────────
    function _formatStatNumber(n) {
        if (n == null) return '—';
        return Number(n).toLocaleString('en-US');          // exact real number, no fake "+"
    }
    window.initHomePage = function() { loadHomeStats(); loadFeaturedServices(); loadHomeProducts(); if (window.StoresManager) StoresManager.loadHomeStrip(); const bs=document.getElementById('buildStamp'); if (bs && window.BUILD_ID) bs.textContent='build '+window.BUILD_ID; };
    window.loadHomeStats = async function() {
        try {
            const resp = await fetch('/api/home-stats');
            const data = await resp.json();
            if (!data.success) throw new Error(data.error || 'failed');

            const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
            set('statServices', _formatStatNumber(data.services));
            set('statUsers',    _formatStatNumber(data.users));
            set('statOrders',   _formatStatNumber(data.completedOrders));
            // Rating comes ONLY from real reviews — no reviews yet means "—", never a made-up 5.0
            const hasRating = data.reviews > 0 && data.avgRating != null;
            set('statRating',  hasRating ? data.avgRating.toFixed(1) : '—');
            set('statReviews', hasRating ? '(' + _formatStatNumber(data.reviews) + ')' : '');
            const fw = document.getElementById('footerRatingWrap');
            if (fw) {
                fw.style.display = hasRating ? 'flex' : 'none';
                set('footerRating', hasRating ? data.avgRating.toFixed(1) + '/5' : '');
            }
        } catch (err) {
            console.error('[loadHomeStats]', err);
        }
    };
    // Keep the counters live: re-fetch every 60s, but only while the home page is on screen.
    if (!window._homeStatsTimer) {
        window._homeStatsTimer = setInterval(function () {
            const home = document.getElementById('page-home');
            if (home && home.classList.contains('active') && !document.hidden) window.loadHomeStats();
        }, 60000);
    }

    // ⚠️ ADDED: "Trending Offers" horizontal carousel — most recent active
    // listings (services + products mixed), compact card style.
    window.loadTrendingOffers = async function() {
        if (!window.db || window._trendingLoaded) return;
        window._trendingLoaded = true;
        const row = document.getElementById('trendingOffersRow');
        if (!row) return;
        try {
            const snap = await window.db.collection(COLLECTIONS.SERVICES)
                .where('active', '==', true)
                .orderBy('createdAt', 'desc')
                .limit(10)
                .get();
            if (snap.empty) { row.innerHTML = ''; return; }

            row.innerHTML = snap.docs.map(d => {
                const s = { id: d.id, ...d.data() };
                const isProduct = s.listingType === 'product';
                const actionBtn = s.dropship
                    ? `<button data-on-click="ServicesManager.openServiceDetail('${s.id}')" class="w-full bg-turquoise-600 text-white text-xs font-bold py-2 rounded-xl hover:bg-turquoise-700 transition">${AppState.language !== 'en' ? 'اشترِ الآن' : 'Buy now'}</button>`
                    : isProduct
                    ? `<button data-on-click="addToCart(${JSON.stringify({id:s.id,title:s.title||'',price:s.price||0,image:getServiceImage(s),sellerId:s.sellerId||'',sellerName:s.sellerName||'',deliveryDays:s.deliveryDays||0}).replace(/"/g,'&quot;')})" class="w-full bg-turquoise-600 text-white text-xs font-bold py-2 rounded-xl hover:bg-turquoise-700 transition">أضف للسلة</button>`
                    : `<button data-on-click="RequestSystem.openRequestModal(${JSON.stringify({id:s.id,title:s.title||'',price:s.price||0,image:getServiceImage(s),sellerId:s.sellerId||'',sellerName:s.sellerName||'',deliveryDays:s.deliveryDays||3}).replace(/"/g,'&quot;')})" class="w-full bg-secondary text-white text-xs font-bold py-2 rounded-xl hover:bg-secondary-600 transition">اطلب الآن</button>`;
                return `
                <div class="flex-shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-lg transition-shadow" data-style="width:220px">
                  <div class="relative h-32 bg-gray-100">
                    <img src="${getServiceImage(s) || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400'}" class="w-full h-full object-cover" loading="lazy" data-on-error="this.src='https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400'">
                    <span class="absolute top-2 start-2 text-[10px] font-black px-2 py-1 rounded-lg ${isProduct ? 'bg-turquoise-500 text-white' : 'bg-navy-800 text-white'}">${isProduct ? '<i class=\'fa-solid fa-box\'></i> منتج' : '<i class=\'fa-solid fa-toolbox\'></i> خدمة'}</span>
                  </div>
                  <div class="p-3">
                    <p class="font-bold text-gray-900 text-sm truncate mb-1">${escapeHtml(s.title||'')}</p>
                    <p class="font-black text-navy-900 text-sm mb-2">${formatCurrency(s.price||0)}</p>
                    ${actionBtn}
                  </div>
                </div>`;
            }).join('');
        } catch (err) {
            console.error('[loadTrendingOffers]', err);
            row.innerHTML = '';
            window._trendingLoaded = false;
        }
    };
    // Track if this is the first auth state change (page load)
    let _authFirstRun = true;

    auth.onAuthStateChanged(async (user) => {
        try { localStorage.setItem('mall_authed', user ? '1' : '0'); } catch (_) {}
        const isFirstRun = _authFirstRun;
        _authFirstRun = false;
        if (isFirstRun && typeof _resolveAuthReady === 'function') _resolveAuthReady();
        if (user) {
            try {
                // Ensure user doc exists
                if (typeof window._ensureUserDoc === 'function') {
                    await window._ensureUserDoc(user);
                }

                const snap    = await db.collection(COLLECTIONS.USERS).doc(user.uid).get();
                const profile = snap.data() || {};

                // ⚠️ ADDED (privacy audit): phone/payout now live in a
                // private subcollection instead of the (any-signed-in-user
                // readable) main doc — see firestore.rules and js/auth.js.
                // Reading it here, once, for the CURRENTLY LOGGED-IN user
                // only (never for anyone else) and merging it into
                // AppState.currentUser keeps every existing place that reads
                // AppState.currentUser.phone/.payoutMethod/.payoutAccount
                // working unchanged. Falls back to the legacy fields on the
                // main doc for accounts created before this change and not
                // yet migrated (see functions/api/admin-migrate-private-
                // fields.js) — non-critical, so a missing subdoc (brand-new
                // account, doc not created yet) never blocks login.
                let priv = {};
                try {
                    const privSnap = await db.collection(COLLECTIONS.USERS).doc(user.uid).collection('private').doc('contact').get();
                    priv = privSnap.data() || {};
                } catch (e) { /* non-critical */ }

                AppState.currentUser = {
                    uid:           user.uid,
                    email:         user.email,
                    displayName:   profile.name   || user.displayName || (user.email||'').split('@')[0],
                    photoURL:      profile.avatar  || user.photoURL   || '',
                    phone:         priv.phone         || profile.phone         || user.phoneNumber || '',
                    payoutMethod:  priv.payoutMethod  || profile.payoutMethod  || '',
                    payoutAccount: priv.payoutAccount || profile.payoutAccount || '',
                    role:          profile.role    || 'buyer',
                    acceptedTerms: profile.acceptedTerms || false,
                };

                // Wallet listener — delayed to avoid permission-denied race condition
                setTimeout(() => {
                    db.collection(COLLECTIONS.WALLET).doc(user.uid).onSnapshot(
                        snap => { if (snap.exists) AppState.wallet = snap.data(); },
                        err  => {
                            if (err.code !== 'permission-denied') {
                                console.warn('[Wallet] listener:', err.code);
                            }
                        }
                    );
                }, 1500);

                _updateNavForUser(AppState.currentUser);
                _startNotifListener(user.uid);
                updateCartCount();

                // Navigate home on first load if no hash in URL
                if (isFirstRun && !window.location.hash) {
                    navigateTo('home');
                }

                // Show Terms modal if not accepted
                if (!AppState.currentUser.acceptedTerms) {
                    setTimeout(_showTermsModal, 500);
                }

            } catch (err) {
                console.warn('[Auth] Profile load error:', err.code || err.message);
                AppState.currentUser = {
                    uid: user.uid, email: user.email,
                    displayName: user.displayName || 'User',
                    photoURL: user.photoURL || '',
                    role: 'buyer', acceptedTerms: false,
                };
                _updateNavForUser(AppState.currentUser);
                if (!window.location.hash) navigateTo('home');
            }
        } else {
            AppState.currentUser = null;
            _updateNavForGuest();
        }

        // ⚠️ ADDED (found in audit): the admin "Maintenance mode" toggle
        // (js/dashboard.js cfg_maintenance) saved PLATFORM.MAINTENANCE to
        // Firestore but nothing ever read it back — a real admin control with
        // zero actual effect on the site. Now enforced here, once we know
        // both the platform config and the visitor's role.
        // Platform settings (needed only for the maintenance gate) load in the background: the loading screen no longer waits
        // for that slow Function → Firestore round-trip (it was the main reason the page stayed hidden for ~2 s).
        // Exception: a returning visitor who last saw maintenance mode ON still waits, so the site never flashes before the gate.
        const _settingsReady = (async () => {
            try { await loadPlatformSettings(); } catch (e) {}
            _enforceMaintenanceGate();
        })();
        let _wasMaint = false;
        try { _wasMaint = localStorage.getItem('mall_maint') === '1'; } catch (_) {}
        if (_wasMaint) { try { await _settingsReady; } catch (_) {} }

        // ── Hide loading screen ── (shared helper; a 4s safety timeout also calls it — see the script after #appLoadingScreen)
        if (window.__hideAppLoading) window.__hideAppLoading();
    });

    // Full-site maintenance gate — admins always pass through so they can
    // still fix things; everyone else sees a blocking notice instead of the app.
    function _enforceMaintenanceGate() {
        const isAr   = AppState.language !== 'en';
        const isAdmin = AppState.currentUser && AppState.currentUser.role === 'admin';
        let gate = document.getElementById('maintenanceGate');
        if (!PLATFORM.MAINTENANCE || isAdmin) {
            if (gate) gate.remove();
            return;
        }
        if (gate) return; // already showing
        gate = document.createElement('div');
        gate.id = 'maintenanceGate';
        gate.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0f2a4a;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:2rem;';
        gate.innerHTML = `
          <i class="fa-solid fa-screwdriver-wrench" data-style="font-size:2.5rem;color:#2dd4bf;margin-bottom:1rem"></i>
          <h2 data-style="font-size:1.5rem;font-weight:900;margin-bottom:.5rem">${isAr ? 'الموقع تحت الصيانة حالياً' : 'Site under maintenance'}</h2>
          <p data-style="color:#c8d5e6;max-width:420px">${(PLATFORM.MAINTENANCE_MSG && PLATFORM.MAINTENANCE_MSG.trim()) || (isAr ? 'هنرجع قريب، شكراً لصبرك.' : "We'll be back shortly — thanks for your patience.")}</p>`;
        document.body.appendChild(gate);
    }

    function _updateNavForUser(user) {
        document.getElementById('guestButtons')?.classList.add('hidden');
        document.getElementById('userMenuWrap')?.classList.remove('hidden');
        document.getElementById('notifBtn')?.classList.remove('hidden');

        const navName = document.getElementById('navName');
        if (navName) navName.textContent = user.displayName?.split(' ')[0] || '';

        const navAvatar = document.getElementById('navAvatar');
        if (navAvatar) { navAvatar.src = user.photoURL || ''; navAvatar.onerror = () => navAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName||'U')}&background=0284c7&color=fff`; }

        const adminBtn = document.getElementById('adminNavBtn');
        if (adminBtn) adminBtn.classList.toggle('hidden', user.role !== 'admin');
    }

    function _updateNavForGuest() {
        document.getElementById('guestButtons')?.classList.remove('hidden');
        document.getElementById('userMenuWrap')?.classList.add('hidden');
        document.getElementById('notifBtn')?.classList.add('hidden');
    }

    // ── Terms Modal ───────────────────────────────────────────────────────────
    function _showTermsModal() {
        if (document.getElementById('termsModal')) return;
        const isAr = AppState.language !== 'en';
        const modal = document.createElement('div');
        modal.id = 'termsModal';
        modal.innerHTML = `
          <div class="terms-box">
            <div class="sticky top-0 bg-white border-b border-gray-100 p-6 rounded-t-3xl">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 bg-navy-100 rounded-2xl flex items-center justify-center">
                  <i class="fa-solid fa-shield-check text-navy-600 text-xl"></i>
                </div>
                <div>
                  <h2 class="font-black text-gray-900 text-lg">${isAr ? 'الشروط والأحكام' : 'Terms & Conditions'}</h2>
                  <p class="text-gray-500 text-sm">${isAr ? 'يرجى قراءة الشروط قبل الاستخدام' : 'Please read before using the platform'}</p>
                </div>
              </div>
            </div>
            <div class="p-6 space-y-5 text-sm text-gray-700 leading-relaxed">
              <div class="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                <h3 class="font-black text-blue-800 mb-2 flex items-center gap-2">
                  <i class="fa-solid fa-store"></i> ${isAr ? 'دور المنصة' : 'Platform Role'}
                </h3>
                <p>${isAr
                  ? 'مول الخدمات وسيط بين البائعين والمشترين فقط. المنصة ليست طرفاً في أي اتفاقية خدمة بين المستخدمين.'
                  : 'Mall Services acts as an intermediary between buyers and sellers only. The platform is not a party to any service agreement between users.'
                }</p>
              </div>
              <div class="bg-orange-50 border border-orange-200 rounded-2xl p-4">
                <h3 class="font-black text-orange-800 mb-2 flex items-center gap-2">
                  <i class="fa-solid fa-credit-card"></i> ${isAr ? 'سياسة الدفع والاسترداد' : 'Payment & Refund Policy'}
                </h3>
                <ul class="space-y-2 list-none">
                  <li class="flex items-start gap-2"><i class="fa-solid fa-circle-check text-green-500 mt-0.5 flex-shrink-0"></i><span>${isAr ? 'يتم تحويل المبلغ لحساب الضمان (Escrow) فور الدفع.' : 'Payment is transferred to escrow immediately upon checkout.'}</span></li>
                  <li class="flex items-start gap-2"><i class="fa-solid fa-circle-check text-green-500 mt-0.5 flex-shrink-0"></i><span>${isAr ? 'يمكن طلب الاسترداد قبل بدء تنفيذ الخدمة.' : 'Refunds can be requested before service delivery begins.'}</span></li>
                  <li class="flex items-start gap-2"><i class="fa-solid fa-circle-xmark text-red-500 mt-0.5 flex-shrink-0"></i><span>${isAr ? 'لا يمكن الاسترداد بعد تسليم الخدمة واعتماد المشتري للتسليم.' : 'No refunds after service delivery is confirmed by the buyer.'}</span></li>
                  <li class="flex items-start gap-2"><i class="fa-solid fa-circle-check text-green-500 mt-0.5 flex-shrink-0"></i><span>${isAr ? 'يحق للمشتري رفع نزاع خلال 7 أيام من التسليم.' : 'Buyers may raise a dispute within 7 days of delivery.'}</span></li>
                </ul>
              </div>
              <div class="bg-purple-50 border border-purple-200 rounded-2xl p-4">
                <h3 class="font-black text-purple-800 mb-2 flex items-center gap-2">
                  <i class="fa-solid fa-user-shield"></i> ${isAr ? 'مسؤولية المستخدم' : 'User Responsibility'}
                </h3>
                <p>${isAr
                  ? 'المستخدم مسؤول عن دقة المعلومات المقدمة واحترام شروط الخدمة. يُحظر نشر محتوى غير قانوني أو مضلل.'
                  : 'Users are responsible for the accuracy of information provided and compliance with service terms. Illegal or misleading content is prohibited.'
                }</p>
              </div>
              <div class="bg-green-50 border border-green-200 rounded-2xl p-4">
                <h3 class="font-black text-green-800 mb-2 flex items-center gap-2">
                  <i class="fa-solid fa-lock"></i> ${isAr ? 'الخصوصية والأمان' : 'Privacy & Security'}
                </h3>
                <p>${isAr
                  ? 'نحن نحمي بياناتك وفقاً لأعلى معايير الأمان. لن يتم مشاركة بياناتك مع أطراف ثالثة بدون موافقتك.'
                  : 'We protect your data according to the highest security standards. Your data will not be shared with third parties without your consent.'
                }</p>
              </div>
            </div>
            <div class="sticky bottom-0 bg-white border-t border-gray-100 p-6 rounded-b-3xl space-y-3">
              <button data-on-click="if(window.AuthManager&&AuthManager.acceptTerms){AuthManager.acceptTerms()}else{document.getElementById('termsModal').remove()}"
                class="w-full py-4 bg-gradient-to-r from-navy-600 to-navy-800 text-white rounded-2xl font-black text-base shadow-lg hover:shadow-xl transition flex items-center justify-center gap-2">
                <i class="fa-solid fa-check-circle"></i>
                ${isAr ? 'أوافق على الشروط والأحكام' : 'I Accept the Terms & Conditions'}
              </button>
              <button data-on-click="AuthManager.logout()"
                class="w-full py-3 text-gray-500 font-bold border-2 border-gray-200 rounded-2xl hover:bg-gray-50 transition text-sm">
                ${isAr ? 'تسجيل الخروج' : 'Sign Out'}
              </button>
            </div>
          </div>`;
        document.body.appendChild(modal);
    }

    function _startNotifListener(uid) {
        if (typeof NotificationsManager !== 'undefined') {
            NotificationsManager.startListener(uid);
            return;
        }
        // Fallback if notifications.js not loaded yet
        db.collection(COLLECTIONS.NOTIFICATIONS)
            .where('userId','==',uid).where('read','==',false)
            .orderBy('createdAt','desc').limit(20)
            .onSnapshot(snap => {
                const count = snap.size;
                document.querySelectorAll('[data-notif-count]').forEach(el => {
                    el.textContent = count;
                    el.classList.toggle('hidden', count === 0);
                });

                const list = document.getElementById('notifList');
                if (!list) return;
                if (snap.empty) { list.innerHTML = '<p class="text-center text-gray-400 text-sm py-8">لا توجد إشعارات</p>'; return; }

                list.innerHTML = snap.docs.map(doc => {
                    const n = doc.data();
                    return `
                    <div class="px-4 py-3 hover:bg-gray-50 transition cursor-pointer" data-on-click="${n.orderId ? 'openWorkspace(' + escapeHtml(JSON.stringify(String(n.orderId))) + ');' : ''}toggleNotifDropdown()">
                      <p class="text-sm font-bold text-gray-900">${escapeHtml(n.title || '')}</p>
                      <p class="text-xs text-gray-500 mt-0.5">${escapeHtml(n.message || '')}</p>
                      <p class="text-xs text-gray-400 mt-1">${formatTimeAgo(n.createdAt)}</p>
                    </div>`;
                }).join('');
            }, err => { if (err.code !== 'failed-precondition') console.warn('[Notif]', err.code); });
    }

    // ── App Start ─────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        // Expose renderCart globally
        window.renderCart = renderCart;
        window.initCartPage = renderCart; // called automatically by navigateTo('cart')

        // Handle Google sign-in redirect result (fires after returning from Google)
        if (window.AuthManager && typeof AuthManager.handleGoogleRedirectResult === 'function') {
            AuthManager.handleGoogleRedirectResult();
        }

        // Start on home
        handleHash();
        if (!window.location.hash) navigateTo('home');

        // Load featured services, products, and stats after short delay
        // (initHomePage was defined but never invoked — homeProductsGrid and
        // the header stats stayed stuck on skeletons/"—" forever)
        setTimeout(() => window.initHomePage(), 500);

        // Initial cart render
        renderCart();
        updateCartCount();

        console.log('✅ Mall Services v3.0 ready — Chat | Firebase | Fawaterak | Google Auth');

        // ── Newsletter subscription ──────────────────────────────────────────
        window.homeSubscribe = function() {
          const email = document.getElementById('homeNewsletterEmail')?.value?.trim();
          const msg   = document.getElementById('homeNewsletterMsg');
          if (!email || !email.includes('@')) {
            if(msg){msg.style.color='#fca5a5';msg.textContent='يرجى إدخال بريد صحيح';msg.style.display='block';}
            return;
          }
          if(msg){msg.style.color='#86efac';msg.textContent='✅ تم الاشتراك بنجاح! شكراً';msg.style.display='block';}
          document.getElementById('homeNewsletterEmail').value='';
          // Save subscriber to Firestore
          if(window.db){
            window.db.collection('newsletter_subscribers').add({
              email, createdAt: firebase.firestore.FieldValue.serverTimestamp(), source:'homepage'
            }).catch(()=>{});
          }
          if(window.trackEvent) trackEvent('newsletter_subscribe','engagement','homepage');
        };

        // ── Load blog posts on homepage ──────────────────────────────────────
        // Called when page-home becomes visible
        const _origNavigateHome = window.navigateTo;
        // Load homepage blog on first render
        document.addEventListener('DOMContentLoaded', () => {
          setTimeout(() => {
            if (window.BlogEngine && window.db && document.getElementById('home-blog-grid')) {
              BlogEngine.renderBlogList('home-blog-grid', { limit: 3 });
            }
          }, 800);
        });

        // ⚠️ FIXED: this wrapper only forwarded `page` — the 2nd argument (the listing being edited,
        // see navigateTo('add-service', editData) in the dashboards) was silently dropped, so the edit
        // form always opened blank as "add new". `data` is now passed through.
        window.navigateTo = function(page, data) {
          // ── Guard: admin page is admin-only ──────────────────────────────
          if (page === 'admin') {
            if (!AppState.currentUser || AppState.currentUser.role !== 'admin') {
              var isAr = AppState.language !== 'en';
              showToast(isAr ? '🚫 هذه الصفحة للمسؤولين فقط' : '🚫 Admin access only', 'error');
              return; // block navigation entirely
            }
          }
          _origNavigateHome(page, data);
          if (page === 'home' && window.BlogEngine && window.db) {
            setTimeout(() => BlogEngine.renderBlogList('home-blog-grid', { limit: 3 }), 300);
          }
          if (page === 'admin' && AppState.currentUser && AppState.currentUser.role === 'admin') {
            setTimeout(() => { if(window.AdminAI) AdminAI.loadPosts(); }, 200);
          }
        };

        // ── Admin AI Module ──────────────────────────────────────────────────
        window.AdminAI = (function() {
          var self = {
            _activeTab: 'posts',

            // ── Admin token fetch helper ────────────────────────────────────
            _fetchAI: async function(body) {
              // The ADMIN_SECRET header is optional — Function skips the check if ADMIN_SECRET env is not set
              var headers = { 'Content-Type': 'application/json' };
              // Send the real Firebase ID token — the server verifies it and checks
              // the account is an admin (a bare uid is public and is NOT accepted).
              try {
                if (window.auth && window.auth.currentUser) {
                  headers['Authorization'] = 'Bearer ' + (await window.auth.currentUser.getIdToken());
                }
              } catch (e) { console.warn('[AdminAI] could not get ID token', e); }
              var res = await fetch('/api/ai-generate', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body),
              });
              return res.json();
            },

            tab: function(name, btn) {
              ['posts','ai','seo'].forEach(function(t) {
                var panel = document.getElementById('admin-tab-'+t);
                var b     = document.getElementById('tab-'+t+'-btn');
                if (panel) panel.classList.toggle('hidden', t !== name);
                if (b) {
                  b.classList.toggle('bg-navy-600',   t === name);
                  b.classList.toggle('text-white',     t === name);
                  b.classList.toggle('shadow-glow',    t === name);
                  b.classList.toggle('bg-white',       t !== name);
                  b.classList.toggle('text-gray-600',  t !== name);
                  b.classList.toggle('border',         t !== name);
                  b.classList.toggle('border-gray-200',t !== name);
                }
              });
              self._activeTab = name;
              if (name === 'posts') self.loadPosts();
              if (name === 'ai')    self.loadTopics();
              if (name === 'seo')   self.renderSEOChecklist();
            },

            loadPosts: async function() {
              if (!window.db) return;
              var tbody = document.getElementById('admin-posts-tbody');
              var label = document.getElementById('posts-count-label');
              if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-400"><i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...</td></tr>';
              try {
                var snap = await window.db.collection('blog_posts').orderBy('createdAt','desc').limit(60).get();
                var all  = snap.docs.map(function(d){ return Object.assign({id:d.id}, d.data()); });
                var statPosts = document.getElementById('stat-posts');
                var statAi    = document.getElementById('stat-ai');
                var statViews = document.getElementById('stat-views');
                var statPub   = document.getElementById('stat-pub');
                if (statPosts) statPosts.textContent = all.length;
                if (statAi)    statAi.textContent    = all.filter(function(p){ return p.aiGenerated; }).length;
                if (statViews) statViews.textContent = all.reduce(function(s,p){ return s+(p.views||0); },0).toLocaleString('ar-EG');
                if (statPub)   statPub.textContent   = all.filter(function(p){ return p.published; }).length;
                if (label) label.textContent = all.length + ' مقال';
                if (!tbody) return;
                if (all.length === 0) {
                  tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12 text-gray-400">لا توجد مقالات — ولّد أول مقال من تبويب AI</td></tr>';
                  return;
                }
                // rows built via DOM
                all.forEach(function(p) {
                  var pubClass = p.published
                    ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-600'
                    : 'bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-700';
                  var pubLabel = p.published ? '✅ منشور' : '⏸ موقوف';
                  var safeTitle = (p.title||'').slice(0,20).replace(/'/g,'');
                  // Use data attributes to avoid quote nesting issues
                  var tr = document.createElement('tr');
                  tr.className = 'hover:bg-gray-50 transition border-b border-gray-50';
                  tr.innerHTML = '<td class="px-4 py-3 max-w-xs"><p class="font-bold text-gray-900 text-sm truncate">' + (p.title||'') + '</p><p class="text-xs text-gray-400 font-mono">' + (p.slug||'').slice(0,28) + '</p></td>'
                    + '<td class="px-4 py-3 hidden sm:table-cell"><span class="bg-navy-100 text-navy-700 text-xs font-bold px-2 py-0.5 rounded-full">' + (p.category||'').replace(/-/g,' ') + '</span></td>'
                    + '<td class="px-4 py-3"><button data-id="' + p.id + '" data-pub="' + (!p.published) + '" data-title="' + safeTitle + '" class="admin-toggle-pub text-xs font-bold px-3 py-1 rounded-full transition ' + pubClass + '">' + pubLabel + '</button></td>'
                    + '<td class="px-4 py-3 hidden md:table-cell text-gray-500 font-mono text-sm">' + ((p.views||0).toLocaleString()) + '</td>'
                    + '<td class="px-4 py-3"><div class="flex gap-2"><a href="/blog/' + p.slug + '" target="_blank" class="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center hover:bg-blue-100 transition" title="عرض"><i class="fa-solid fa-eye text-xs"></i></a>'
                    + '<button data-del-id="' + p.id + '" class="admin-del-post w-8 h-8 bg-red-50 text-red-500 rounded-lg flex items-center justify-center hover:bg-red-100 transition" title="حذف"><i class="fa-solid fa-trash text-xs"></i></button></div></td>';
                  tbody.appendChild(tr);
                });
                // Event delegation for toggle/delete buttons
                tbody.addEventListener('click', function(e) {
                  var toggleBtn = e.target.closest('.admin-toggle-pub');
                  var deleteBtn = e.target.closest('.admin-del-post');
                  if (toggleBtn) {
                    window.AdminAI.togglePublish(toggleBtn.dataset.id, toggleBtn.dataset.pub === 'true', toggleBtn.dataset.title);
                  }
                  if (deleteBtn) {
                    window.AdminAI.deletePost(deleteBtn.dataset.delId);
                  }
                });
              } catch(err) {
                if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-red-400">خطأ: '+err.message+'</td></tr>';
              }
            },

            togglePublish: async function(id, newVal, title) {
              try {
                await window.db.collection('blog_posts').doc(id).update({
                  published: newVal,
                  updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                showToast((newVal ? '✅ تم نشر ' : '⏸ تم إيقاف ') + '"' + title + '"', newVal ? 'success' : 'info');
                self.loadPosts();
              } catch(e) { showToast('خطأ: ' + e.message, 'error'); }
            },

            deletePost: async function(id) {
              if (!confirm('حذف هذا المقال نهائياً؟')) return;
              try {
                await window.db.collection('blog_posts').doc(id).delete();
                showToast('🗑️ تم حذف المقال', 'success');
                self.loadPosts();
              } catch(e) { showToast('خطأ: ' + e.message, 'error'); }
            },

            loadTopics: async function() {
              var container = document.getElementById('topics-bank');
              if (!container) return;
              try {
                var data   = await self._fetchAI({action:'topics'});
                var topics = data.topics || [];
                var frag = document.createDocumentFragment();
                topics.forEach(function(t) {
                  var btn = document.createElement('button');
                  btn.className = 'text-xs bg-gray-100 hover:bg-navy-100 hover:text-navy-700 text-gray-600 px-3 py-1.5 rounded-full font-medium transition cursor-pointer border border-transparent hover:border-navy-300';
                  btn.textContent = t;
                  btn.addEventListener('click', function() {
                    var inp = document.getElementById('ai-topic-input');
                    if (inp) inp.value = t;
                  });
                  frag.appendChild(btn);
                });
                container.innerHTML = '';
                container.appendChild(frag);
              } catch(e) {
                container.innerHTML = '<p class="text-xs text-gray-400">أضف GEMINI_API_KEY في Cloudflare Pages Environment Variables</p>';
              }
            },

            generate: async function() {
              // ── Admin-only guard ──────────────────────────────────────────
              if (!AppState.currentUser || AppState.currentUser.role !== 'admin') {
                showToast('🚫 ' + (AppState.language !== 'en' ? 'توليد المقالات للمسؤولين فقط' : 'Article generation is admin-only'), 'error');
                return;
              }
              var btn     = document.getElementById('ai-gen-btn');
              var btnText = document.getElementById('ai-gen-btn-text');
              var result  = document.getElementById('ai-result');
              var topicEl = document.getElementById('ai-topic-input');
              var countEl = document.getElementById('ai-count-select');
              var topic   = topicEl ? topicEl.value.trim() : '';
              var count   = countEl ? parseInt(countEl.value) || 1 : 1;
              if (btn) btn.disabled = true;
              if (btnText) btnText.textContent = 'جاري التوليد...';
              if (result) {
                result.classList.remove('hidden');
                result.className = 'rounded-xl p-4 text-sm font-medium bg-yellow-50 border border-yellow-200 text-yellow-800';
                result.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>يتم توليد المقال... قد يستغرق 20-40 ثانية';
              }
              try {
                var body = topic ? {action:'generate', topic:topic} : {action:'bulk', count:count};
                var data = await self._fetchAI(body);
                if (data.success) {
                  var n = (data.results && data.results.length) || 1;
                  if (result) {
                    result.className = 'rounded-xl p-4 text-sm font-medium bg-green-50 border border-green-200 text-green-800';
                    result.innerHTML = '✅ تم توليد ' + n + ' مقال بنجاح! سيظهر في قائمة المقالات.';
                  }
                  self.loadPosts();
                  if (window.trackEvent) trackEvent('ai_generate', 'admin', 'count_' + n);
                } else {
                  if (result) {
                    result.className = 'rounded-xl p-4 text-sm font-medium bg-red-50 border border-red-200 text-red-700';
                    result.innerHTML = '❌ خطأ: ' + (data.error || 'مجهول') + '<br><small>تأكد من إضافة GEMINI_API_KEY في Cloudflare Pages Environment Variables</small>';
                  }
                }
              } catch(e) {
                if (result) {
                  result.className = 'rounded-xl p-4 text-sm font-medium bg-red-50 border border-red-200 text-red-700';
                  result.innerHTML = '❌ ' + e.message;
                }
              } finally {
                if (btn) btn.disabled = false;
                if (btnText) btnText.textContent = 'ابدأ التوليد';
              }
            },

            generateOne: async function() {
              // ── Admin-only guard ──────────────────────────────────────────
              if (!AppState.currentUser || AppState.currentUser.role !== 'admin') {
                showToast('🚫 ' + (AppState.language !== 'en' ? 'توليد المقالات للمسؤولين فقط' : 'Article generation is admin-only'), 'error');
                return;
              }
              var btn = document.getElementById('admin-gen-btn');
              if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التوليد...'; }
              try {
                var data = await self._fetchAI({action:'generate'});
                if (data.success) {
                  showToast('✅ تم توليد: ' + (data.title||'').slice(0,40) + '…', 'success');
                  self.loadPosts();
                } else {
                  showToast('❌ ' + (data.error||'خطأ'), 'error');
                }
              } catch(e) {
                showToast('❌ ' + e.message, 'error');
              } finally {
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> توليد مقال AI الآن'; }
              }
            },

            renderSEOChecklist: function() {
              var el = document.getElementById('seo-checklist');
              if (!el) return;
              var checks = [
                {done:true,  label:'Google Site Verification مضاف'},
                {done:true,  label:'Sitemap.xml ثابت موجود'},
                {done:true,  label:'Sitemap ديناميكي من Firestore'},
                {done:true,  label:'robots.txt محسن'},
                {done:true,  label:'Meta tags ديناميكية لكل مقال'},
                {done:true,  label:'Open Graph + Twitter Cards'},
                {done:true,  label:'JSON-LD Structured Data'},
                {done:true,  label:'توليد محتوى تلقائي يومي'},
                {done:true,  label:'نظام مدونة ديناميكي من Firestore'},
                {done:false, label:'أضف GEMINI_API_KEY في Cloudflare Env Vars'},
                {done:false, label:'أضف UNSPLASH_ACCESS_KEY للصور'},
                {done:false, label:'ربط Google Analytics'},
                {done:false, label:'تقديم طلب Google AdSense'}
              ];
              var html = '';
              checks.forEach(function(c) {
                var iconClass = c.done ? 'fa-circle-check text-green-500' : 'fa-circle-xmark text-red-400';
                var textClass = c.done ? 'text-gray-700' : 'text-gray-400';
                html += '<div class="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">'
                  + '<i class="fa-solid '+iconClass+' mt-0.5 flex-shrink-0"></i>'
                  + '<span class="text-sm '+textClass+'">'+c.label+'</span></div>';
              });
              el.innerHTML = html;
            }
          };
          return self;
        })();
        // Init admin when navigating to admin page (handled above)
        

        // ── Network status ────────────────────────────────────────────────────
        const offlineBanner = document.getElementById('offlineBanner');
        function _handleOnline()  { offlineBanner && offlineBanner.classList.remove('show'); }
        function _handleOffline() { offlineBanner && offlineBanner.classList.add('show'); }
        window.addEventListener('online',  _handleOnline);
        window.addEventListener('offline', _handleOffline);
        if (!navigator.onLine) _handleOffline();

        // Register Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('[SW] Registered:', reg.scope))
                .catch(err => console.warn('[SW] Registration failed:', err));
        }
    });

})();
