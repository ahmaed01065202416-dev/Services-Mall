/**
 * ============================================================================
 * SERVICES.JS — Services Manager v3.0
 * Load · Search · Filter · Add · Edit · Delete Services
 * ============================================================================
 */
(function () {
    'use strict';

    let _allServices   = [];
    let _filtered      = [];
    let _lastDoc       = null;
    let _loading       = false;
    let _expressOnly   = false;
    let _activeCat     = '';
    let _activeType    = ''; // '', 'service', or 'product'
    let _searchQuery   = ''; // ⚠️ ADDED: search text is now part of the one shared filter pipeline (_applyFilters)
    let _hasMore       = false; // ⚠️ ADDED: last page came back full → more listings exist server-side
    let _sortBy        = 'newest'; // ⚠️ ADDED: remembered so a filter change doesn't silently undo the chosen sort
    // All of a listing's photos in display order — the FIRST one is the cover. Items are either
    // { kind:'existing', url } (already saved) or { kind:'new', file } (chosen, uploaded on save).
    let _photos = [];
    let _digitalProducts = []; // ⚠️ ADDED: cache for the dedicated Digital Products page
    const PAGE_SIZE    = 12;

    // ── Category taxonomies ─────────────────────────────────────────────────────
    // ⚠️ ADDED: two separate lists — services (design/programming/marketing...)
    // vs products (clothing/electronics/home...). Used by both the add-listing
    // category dropdown (initAddServicePage/toggleListingType below) and the
    // browse-page category pills (_renderCategoryPills), so both places stay
    // in sync from one source instead of duplicating the list.
    function _getServiceCategories() {
        const isAr = AppState.language !== 'en';
        return [
            { value: 'design',      label: isAr ? 'تصميم'  : 'Design',      icon: 'fa-palette' },
            { value: 'programming', label: isAr ? 'برمجة'   : 'Programming', icon: 'fa-laptop-code' },
            { value: 'marketing',   label: isAr ? 'تسويق'   : 'Marketing',   icon: 'fa-chart-line' },
            { value: 'writing',     label: isAr ? 'كتابة'   : 'Writing',     icon: 'fa-pen-nib' },
            { value: 'video',       label: isAr ? 'فيديو'   : 'Video',       icon: 'fa-video' },
            { value: 'seo',         label: isAr ? 'SEO'     : 'SEO',         icon: 'fa-magnifying-glass-chart' },
            { value: 'audio',       label: isAr ? 'صوتيات'  : 'Audio',       icon: 'fa-headphones' },
            { value: 'data',        label: isAr ? 'بيانات'  : 'Data',        icon: 'fa-chart-simple' },
            { value: 'other',       label: isAr ? 'أخرى'    : 'Other',       icon: 'fa-ellipsis' },
        ];
    }
    function _getProductCategories() {
        const isAr = AppState.language !== 'en';
        return [
            { value: 'clothing',    label: isAr ? 'ملابس'          : 'Clothing',    icon: 'fa-shirt' },
            { value: 'electronics', label: isAr ? 'إلكترونيات'      : 'Electronics', icon: 'fa-mobile-screen' },
            { value: 'home',        label: isAr ? 'مستلزمات منزلية' : 'Home',        icon: 'fa-house' },
            { value: 'beauty',      label: isAr ? 'مستحضرات تجميل'  : 'Beauty',      icon: 'fa-spa' },
            { value: 'food',        label: isAr ? 'أطعمة ومشروبات'  : 'Food',        icon: 'fa-utensils' },
            { value: 'accessories', label: isAr ? 'إكسسوارات'       : 'Accessories', icon: 'fa-bag-shopping' },
            { value: 'digital',     label: isAr ? 'منتجات رقمية'    : 'Digital',     icon: 'fa-download' },
            { value: 'other',       label: isAr ? 'أخرى'            : 'Other',       icon: 'fa-ellipsis' },
        ];
    }

    // ── Suggested structured-field templates per product category ───────────────
    // ⚠️ ADDED: the seller picks a category, sees a ready-made set of fields
    // real buyers of that category actually need, and can turn each one on/off
    // and edit its option list — instead of only a free-text "notes" box.
    // These become real dropdowns/choices on the buyer's order form (see
    // request-system.js submitProductOrder / openProductOrderModal), not just
    // text the buyer has to type correctly on their own.
    function _getFieldTemplates() {
        const isAr = AppState.language !== 'en';
        return {
            clothing: [
                { key: 'size',   label: isAr?'المقاس':'Size',   type: 'select', options: isAr?'S,M,L,XL,XXL':'S,M,L,XL,XXL', on: true },
                { key: 'color',  label: isAr?'اللون':'Color',   type: 'select', options: isAr?'أسود,أبيض,أحمر,أزرق':'Black,White,Red,Blue', on: true },
                { key: 'fabric', label: isAr?'خامة القماش':'Fabric', type: 'text', options: '', on: false },
            ],
            electronics: [
                { key: 'warranty', label: isAr?'الضمان':'Warranty', type: 'select', options: isAr?'بدون ضمان,3 شهور,سنة':'No warranty,3 months,1 year', on: true },
                { key: 'color',    label: isAr?'اللون/الموديل':'Color/Model', type: 'text', options: '', on: true },
            ],
            home: [
                { key: 'size',   label: isAr?'المقاس/الأبعاد':'Size/Dimensions', type: 'text', options: '', on: true },
                { key: 'color',  label: isAr?'اللون':'Color', type: 'text', options: '', on: false },
            ],
            beauty: [
                { key: 'shade',  label: isAr?'الدرجة/اللون':'Shade', type: 'text', options: '', on: false },
                { key: 'expiry', label: isAr?'تاريخ الصلاحية':'Expiry note', type: 'text', options: '', on: true },
            ],
            food: [
                { key: 'weight', label: isAr?'الوزن/الكمية':'Weight/Quantity', type: 'select', options: isAr?'صغير,وسط,كبير':'Small,Medium,Large', on: true },
                { key: 'expiry', label: isAr?'تاريخ الصلاحية':'Expiry date', type: 'text', options: '', on: true },
            ],
            accessories: [
                { key: 'color', label: isAr?'اللون':'Color', type: 'text', options: '', on: true },
                { key: 'size',  label: isAr?'المقاس':'Size', type: 'text', options: '', on: false },
            ],
            digital: [],
            other: [],
        };
    }

    const ServicesManager = {

        // ⚠️ ADDED: dedicated "Digital Products" page — isolated from the
        // regular services/products browse page entirely. category==='digital'
        // listings no longer appear there at all (see _applyFilters below);
        // this is now their only home. Runs its own lightweight query rather
        // than reusing loadServices()'s cache, since the digital page can be
        // opened directly without ever visiting the regular page first.
        async initDigitalProductsPage() {
            const grid  = document.getElementById('digitalProductsGrid');
            const empty = document.getElementById('digitalProductsEmpty');
            if (!grid) return;
            grid.innerHTML = `<div class="col-span-full text-center py-8"><i class="fa-solid fa-spinner fa-spin text-navy-500 text-2xl"></i></div>`;
            try {
                const snap = await window.db.collection(COLLECTIONS.SERVICES)
                    .where('active', '==', true).limit(200).get();
                const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                    .filter(s => s.listingType === 'product' && (s.category||'').trim() === 'digital');
                _digitalProducts = items;
                this._renderServiceCards(items, 'digitalProductsGrid', 'digitalProductsEmpty');
            } catch (err) {
                console.warn('[Services] Digital products load error:', err.message);
                grid.innerHTML = '';
                if (empty) empty.classList.remove('hidden');
            }
        },
        searchDigitalProducts(query) {
            const q = (query || '').trim().toLowerCase();
            const list = !q ? _digitalProducts : _digitalProducts.filter(s =>
                (s.title||'').toLowerCase().includes(q) || (s.description||'').toLowerCase().includes(q));
            this._renderServiceCards(list, 'digitalProductsGrid', 'digitalProductsEmpty');
        },

        // ── Load All Services ─────────────────────────────────────────────────
        async loadServices(reset = true) {
            if (_loading) return;
            _loading = true;

            if (reset) { _allServices = []; _filtered = []; _lastDoc = null; _hasMore = false; }

            try {
                let query = window.db.collection(COLLECTIONS.SERVICES)
                    .where('active', '==', true)
                    .orderBy('createdAt', 'desc')
                    .limit(PAGE_SIZE);

                if (_lastDoc && !reset) query = query.startAfter(_lastDoc);

                const snap = await query.get();
                _lastDoc   = snap.docs[snap.docs.length - 1] || null;
                _hasMore   = snap.docs.length >= PAGE_SIZE;

                const newServices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                _allServices = reset ? newServices : [..._allServices, ...newServices];

                // ⚠️ FIXED: this used to render `_allServices` as-is, ignoring the
                // active type/category/express/search filters and the digital
                // exclusion. initServicesPage() applies the "منتجات"/"خدمات" tab
                // 200ms after starting this (un-awaited) fetch — when the fetch
                // took longer than that, the tab was applied to an empty list and
                // then this unfiltered render landed on top of it, so services
                // showed up under "منتجات" (and products under "خدمات") while the
                // tab/title claimed otherwise. "تحميل المزيد" had the same hole.
                // Every render now goes through the one filter pipeline.
                this._applyFilters();

                // Load more button
                const loadMoreBtn = document.getElementById('loadMoreBtn');
                if (loadMoreBtn) loadMoreBtn.classList.toggle('hidden', !_hasMore);

            } catch (err) {
                if (err.code === 'failed-precondition') {
                    console.warn('[Services] Missing index, loading without order:', err.message?.match(/https?:\/\/[^\s]+/)?.[0] || '');
                    await this._loadFallback();
                } else {
                    console.warn('[Services] Load error:', err.message);
                }
            } finally {
                _loading = false;
            }

            // ⚠️ ADDED: filtering happens in the browser on a page of 12 mixed
            // listings, so a tab like "منتجات" could show 2 items (or none)
            // while plenty more products sat on later pages behind "تحميل
            // المزيد". While a filter is active and the visible result is
            // still under one page, keep pulling the next page automatically.
            if (_hasMore && (_activeType || _activeCat || _searchQuery) && _filtered.length < PAGE_SIZE) {
                return this.loadServices(false);
            }
        },

        async _loadFallback() {
            try {
                const snap = await window.db.collection(COLLECTIONS.SERVICES)
                    .where('active', '==', true).limit(PAGE_SIZE).get();
                _allServices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                this._applyFilters();
            } catch (err) {
                console.warn('[Services] Fallback error:', err.message);
            }
        },

        // ── Search ────────────────────────────────────────────────────────────
        search(query) {
            // ⚠️ FIXED: used to filter `_allServices` directly, so searching threw
            // away the active type/category tab (and un-hid digital products,
            // which live on their own page). Now it only records the text —
            // _applyFilters() combines it with everything else.
            _searchQuery = (query || '').trim().toLowerCase();
            this._applyFilters();
        },

        // ── Filter by Category ────────────────────────────────────────────────
        filterCategory(cat) {
            this._setActiveCat(cat);
            this._applyFilters();
        },
        // State + pill highlight only (no render) — initServicesPage() uses this
        // to apply a starting category BEFORE the first load finishes.
        _setActiveCat(cat) {
            _activeCat = cat;
            document.querySelectorAll('.cat-btn').forEach(btn => {
                const isActive = btn.dataset.cat === cat;
                btn.classList.toggle('bg-navy-600', isActive);
                btn.classList.toggle('text-white', isActive);
                btn.classList.toggle('bg-white', !isActive);
                btn.classList.toggle('text-gray-600', !isActive);
                btn.classList.toggle('border-gray-200', !isActive);
            });
        },

        // ⚠️ ADDED: rebuild the browse-page category pills to match whichever
        // type tab is active — service categories for 'service', product
        // categories for 'product'. For the combined "الكل" view there's no
        // single sensible category list (the two taxonomies don't overlap),
        // so it just shows the "الكل" pill with no per-category filter.
        _renderCategoryPills(type) {
            const container = document.getElementById('categoryPillsContainer');
            if (!container) return;
            const isAr = AppState.language !== 'en';
            const allBtn = `<button onclick="ServicesManager.filterCategory('')" data-cat="" class="cat-btn flex-shrink-0 px-4 py-2 bg-navy-600 text-white rounded-xl text-sm font-bold transition">${isAr ? 'الكل' : 'All'}</button>`;
            if (!type) { container.innerHTML = allBtn; return; }
            const list = type === 'product'
                ? _getProductCategories().filter(c => c.value !== 'digital') // ⚠️ isolated to its own page — see initDigitalProductsPage
                : _getServiceCategories();
            container.innerHTML = allBtn + list.map(c => `
                <button onclick="ServicesManager.filterCategory('${c.value}')" data-cat="${c.value}"
                  class="cat-btn flex-shrink-0 px-4 py-2 bg-white text-gray-600 border border-gray-200 rounded-xl text-sm font-bold hover:border-navy-400 transition">
                  <i class="fa-solid ${c.icon} me-1.5"></i>${c.label}
                </button>`).join('');
        },

        // ⚠️ ADDED: خدمات (custom request flow) vs منتجات (instant buy) — '' = both
        filterType(type) {
            this._setActiveType(type);
            this._applyFilters();
        },
        // State + tab/title/pills/nav highlight only (no render) — see _setActiveCat.
        _setActiveType(type) {
            _activeType = type;
            _activeCat  = '';
            document.querySelectorAll('.type-tab-btn').forEach(btn => {
                const isActive = btn.dataset.type === type;
                btn.classList.toggle('bg-navy-800', isActive);
                btn.classList.toggle('text-white', isActive);
                btn.classList.toggle('bg-gray-100', !isActive);
                btn.classList.toggle('text-gray-600', !isActive);
            });
            // ⚠️ FIXED: the top nav's "الخدمات"/"المنتجات" underline only
            // ever reflected which link was clicked to REACH this page, not
            // which type is actually selected here — clicking the "منتجات"
            // pill directly on the page (already on it, no navigation
            // happening) left the top nav stuck showing "الخدمات". Now this
            // one function call (the single place every type change goes
            // through) always keeps them in sync too.
            if (typeof window._syncTypeNavHighlight === 'function') window._syncTypeNavHighlight(type);
            this._renderCategoryPills(type);
            const expressBox = document.getElementById('expressToggleBtn')?.closest('div');
            if (expressBox) expressBox.classList.toggle('hidden', type === 'product');
            const titleEl = document.getElementById('servicesPageTitle');
            if (titleEl) {
                const isAr = AppState.language !== 'en';
                titleEl.textContent = type === 'product' ? (isAr ? 'المنتجات' : 'Products')
                    : type === 'service' ? (isAr ? 'الخدمات' : 'Services')
                    : (isAr ? 'الخدمات والمنتجات' : 'Services & Products');
            }
        },

        // ── Toggle Express Delivery Hub (services deliverable in ≤1 day) ──────
        toggleExpress() {
            _expressOnly = !_expressOnly;
            if (window.AdsEmbed) window.AdsEmbed.setExpress(_expressOnly && _activeType !== 'product');
            const btn = document.getElementById('expressToggleBtn');
            if (btn) {
                btn.classList.toggle('bg-orange-500', _expressOnly);
                btn.classList.toggle('text-white', _expressOnly);
                btn.classList.toggle('border-orange-500', _expressOnly);
                btn.classList.toggle('bg-orange-50', !_expressOnly);
                btn.classList.toggle('text-orange-700', !_expressOnly);
            }
            this._applyFilters();
        },

        _applyFilters() {
            // ⚠️ FIXED: trim() guards against a category value that has stray
            // whitespace (e.g. saved as "clothing " from an older/manual entry)
            // — that alone was enough to make a listing invisible under its
            // own category pill even though it displays fine under "الكل".
            // ⚠️ ADDED: category==='digital' listings are now isolated to their
            // own dedicated page (initDigitalProductsPage) and never show up
            // here, on the regular services/products browse page, at all.
            let list = _allServices.filter(s => (s.category||'').trim() !== 'digital');
            if (_activeCat) list = list.filter(s => (s.category||'').trim() === _activeCat);
            if (_activeType) list = list.filter(s => ((s.listingType||'service').trim()) === _activeType);
            // ⚠️ FIXED: the express toggle is hidden on the products tab but its
            // filter used to stay switched on underneath — quietly hiding every
            // product with a delivery time over a day. Express only applies to
            // services.
            if (_expressOnly && _activeType !== 'product') list = list.filter(s => (Number(s.deliveryDays) || 3) <= 1);
            if (_searchQuery) {
                const q = _searchQuery;
                list = list.filter(s =>
                    (s.title || '').toLowerCase().includes(q) ||
                    (s.description || '').toLowerCase().includes(q) ||
                    (s.sellerName || '').toLowerCase().includes(q) ||
                    (s.category || '').toLowerCase().includes(q) ||
                    (s.tags || []).some(t => String(t).toLowerCase().includes(q))
                );
            }
            switch (_sortBy) {
                case 'price_asc':  list.sort((a,b) => (a.price||0)  - (b.price||0));   break;
                case 'price_desc': list.sort((a,b) => (b.price||0)  - (a.price||0));   break;
                case 'rating':     list.sort((a,b) => (b.rating||0) - (a.rating||0));  break;
                case 'quality':    list.sort((a,b) => (b.qualityScore||0) - (a.qualityScore||0)); break;
                default:           list.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
            }
            _filtered = list;
            this._renderServiceCards(_filtered);
            // Same "keep filling the tab" rule as the end of loadServices(),
            // for filters changed by the user AFTER the initial load. (Skipped
            // while a load is running — that call continues on its own.)
            if (!_loading && _hasMore && (_activeType || _activeCat || _searchQuery) && _filtered.length < PAGE_SIZE) {
                this.loadServices(false);
            }
        },

        // ── Sort ──────────────────────────────────────────────────────────────
        sort(by) {
            _sortBy = by || 'newest';
            this._applyFilters();
        },

        // ── Render Cards ──────────────────────────────────────────────────────
        // ⚠️ FIXED: this used to build every card in one big .map() with no
        // error isolation — if a single listing had a malformed field (bad
        // JSON in a legacy record, etc.) and its card template threw, the
        // WHOLE grid silently failed to re-render on the next tab/category
        // click, so the page looked "stuck" showing the previous tab's items
        // even though the click was registered (title + active pill DID
        // update — only the grid didn't). Each card is now built in its own
        // try/catch so one bad listing can't block the rest.
        _renderServiceCards(services, gridId = 'servicesGrid', emptyId = 'servicesEmpty') {
            const grid  = document.getElementById(gridId);
            const empty = document.getElementById(emptyId);
            if (!grid) return;

            if (!services || services.length === 0) {
                grid.innerHTML = '';
                if (empty) empty.classList.remove('hidden');
                return;
            }
            if (empty) empty.classList.add('hidden');

            const isAr = AppState.language !== 'en';
            const cards = [];
            services.forEach(s => {
                try { cards.push(this._serviceCard(s, isAr)); }
                catch (e) { console.warn('[Services] Skipped a broken listing card:', s.id, e.message); }
            });
            grid.innerHTML = cards.join('');
        },

        _serviceCard(s, isAr) {
            const stars = Math.round(s.rating || 0);
            const price = formatCurrency(s.price || 0);
            return `
            <div class="service-card card group cursor-pointer" onclick="ServicesManager.openServiceDetail('${s.id}')">
              <!-- Thumbnail -->
              <div class="relative overflow-hidden">
                <img src="${getServiceImage(s) || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400'}"
                  class="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                  onerror="this.src='https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400'">
                ${s.featured ? '<span class="absolute top-3 start-3 bg-gradient-to-r from-navy-700 to-turquoise-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow"><i class="fa-solid fa-star"></i> مميز</span>' : ''}
                ${(Number(s.deliveryDays) || 3) <= 1 ? '<span class="absolute top-3 end-3 bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow flex items-center gap-1"><i class="fa-solid fa-bolt"></i> سريع</span>' : ''}
                ${s.recurring ? '<span class="absolute top-3 end-3 bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow flex items-center gap-1" style="' + ((Number(s.deliveryDays)||3)<=1 ? 'top:2.6rem' : '') + '"><i class="fa-solid fa-rotate"></i> اشتراك شهري</span>' : ''}
                <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all duration-300 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100">
                  <button onclick="event.stopPropagation();ServicesManager.openServiceDetail('${s.id}')"
                    class="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition">
                    <i class="fa-solid fa-eye text-navy-700"></i>
                  </button>
                  ${s.dropship ? '' : s.listingType === 'product' ? `
                  <button onclick="event.stopPropagation();addToCart(${JSON.stringify({id:s.id,title:s.title||'',price:s.price||0,image:getServiceImage(s),sellerId:s.sellerId||'',sellerName:s.sellerName||'',deliveryDays:s.deliveryDays||0}).replace(/"/g,'&quot;')})"
                    class="w-10 h-10 bg-turquoise-600 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition">
                    <i class="fa-solid fa-cart-plus text-white"></i>
                  </button>` : `
                  <button onclick="event.stopPropagation();${s.orderMode==='instant'?'RequestSystem.openInstantModal':'RequestSystem.openRequestModal'}(${JSON.stringify({id:s.id,title:s.title||'',price:s.price||0,image:getServiceImage(s),sellerId:s.sellerId||'',sellerName:s.sellerName||'',deliveryDays:s.deliveryDays||3}).replace(/"/g,'&quot;')})"
                    class="w-10 h-10 ${s.orderMode==='instant'?'bg-secondary':'bg-navy-800'} rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition">
                    <i class="fa-solid ${s.orderMode==='instant'?'fa-lock':'fa-paper-plane'} text-white"></i>
                  </button>`}
                </div>
              </div>

              <!-- Body -->
              <div class="p-4">
                <!-- Seller -->
                <div class="flex items-center gap-2 mb-3" onclick="event.stopPropagation();StoresManager.openStore('${s.storeId||s.sellerId||''}')" title="${isAr?'زيارة المتجر':'Visit store'}">
                  <img src="${s.sellerAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.sellerName||'U')}&background=0284c7&color=fff`}"
                    class="w-7 h-7 rounded-full object-cover flex-shrink-0" loading="lazy"
                    onerror="this.src='https://ui-avatars.com/api/?name=U&background=0284c7&color=fff'">
                  <span class="text-xs text-gray-600 font-semibold truncate">${escapeHtml(s.sellerName || '—')}</span>
                  ${s.sellerVerified ? '<i class="fa-solid fa-circle-check text-turquoise-600 text-xs flex-shrink-0"></i>' : ''}
                </div>

                <!-- Title -->
                <h3 class="font-black text-gray-900 text-sm leading-snug mb-3 line-clamp-2" style="min-height:2.5rem">${escapeHtml(s.title || '—')}</h3>

                <!-- Rating -->
                <div class="flex items-center gap-1 mb-3">
                  ${Array.from({length:5},(_,i) => `<i class="fa-solid fa-star text-xs ${i < stars ? 'text-yellow-400' : 'text-gray-200'}"></i>`).join('')}
                  <span class="text-xs text-gray-400 font-medium">(${s.reviewCount || 0})</span>
                </div>

                <!-- Price & delivery -->
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-xs text-gray-400">${isAr ? 'يبدأ من' : 'Starting at'}</p>
                    <p class="font-black text-navy-900 text-base" data-price-egp="${s.price||0}">${price}</p>
                  </div>
                  <div class="text-end">
                    <p class="text-xs text-gray-400">${t('services.delivery')}</p>
                    <p class="text-xs font-bold text-gray-600">${s.deliveryDays || 3} ${t('services.days')}</p>
                  </div>
                </div>

                <!-- Buyer Protection badge — real, backed by our escrow system:
                     money is held until the buyer confirms delivery. -->
                <div class="flex items-center gap-1.5 mt-2.5 text-[11px] text-green-700 font-bold">
                  <i class="fa-solid fa-shield-halved text-green-500"></i>
                  <span>${isAr ? 'ضمان استرجاع الأموال 100٪' : '100% Money-Back Guarantee'}</span>
                </div>

                <!-- Action Buttons -->
                <div class="flex gap-2 mt-4">
                  ${ (function() {
                    var uid = AppState.currentUser && AppState.currentUser.uid;
                    var isOwnService = uid && uid === s.sellerId;
                    var isAdm = AppState.currentUser && AppState.currentUser.role === 'admin';
                    var editDataStr = JSON.stringify({id:s.id,title:s.title||'',description:s.description||'',category:s.category||'',price:s.price||0,deliveryDays:s.deliveryDays||3,revisions:s.revisions||2,image:s.image||'',listingType:s.listingType||'service',orderMode:s.orderMode||'request_first',digitalDelivery:s.digitalDelivery||null,stockLimit:s.stockLimit ?? null,expiryDate:s.expiryDate||null,orderRules:s.orderRules||''}).replace(/"/g,'&quot;');
                    var serviceDataStr = JSON.stringify({id:s.id,title:s.title||'',price:s.price||0,image:getServiceImage(s),sellerId:s.sellerId||'',sellerName:s.sellerName||'',deliveryDays:s.deliveryDays||3}).replace(/"/g,'&quot;');
                    var cartDataStr = JSON.stringify({id:s.id,title:s.title||'',price:s.price||0,image:getServiceImage(s),sellerId:s.sellerId||'',sellerName:s.sellerName||''}).replace(/"/g,'&quot;');
                    var lang = AppState.language;
                    if (isOwnService || isAdm) {
                      return '<button onclick="event.stopPropagation();ServicesManager.deleteService(\'' + s.id + '\')" class="flex-1 bg-red-50 border-2 border-red-200 text-red-600 rounded-xl py-2.5 text-sm font-bold hover:bg-red-600 hover:text-white transition flex items-center justify-center gap-1"><i class=\"fa-solid fa-trash text-xs\"></i>' + (lang !== 'en' ? 'حذف الإعلان' : 'Delete') + '</button>'
                           + '<button onclick="event.stopPropagation();navigateTo(\'add-service\', ' + editDataStr + ')" class="w-10 h-10 flex-shrink-0 border-2 border-gray-200 text-gray-600 rounded-xl flex items-center justify-center hover:bg-gray-100 transition"><i class=\"fa-solid fa-pen text-xs\"></i></button>';
                    }
                    if (s.dropship) {
                      return '<button onclick="event.stopPropagation();ServicesManager.openServiceDetail(\'' + s.id + '\')" class="flex-1 bg-turquoise-600 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-turquoise-700 transition flex items-center justify-center gap-1"><i class="fa-solid fa-bolt text-xs"></i>' + (lang !== 'en' ? 'اشترِ الآن' : 'Buy now') + '</button>';
                    }
                    if (s.listingType === 'product') {
                      return '<button onclick="event.stopPropagation();addToCart(' + serviceDataStr + ')" class="flex-1 bg-turquoise-600 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-turquoise-700 transition flex items-center justify-center gap-1"><i class=\"fa-solid fa-cart-plus text-xs\"></i>' + (lang !== 'en' ? 'أضف للسلة' : 'Add to Cart') + '</button>';
                    }
                    if (s.recurring) {
                      return '<button onclick="event.stopPropagation();SubscriptionSystem.subscribe(\'' + s.id + '\',' + serviceDataStr + ')" class="flex-1 bg-purple-600 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-purple-700 transition flex items-center justify-center gap-1"><i class=\"fa-solid fa-rotate text-xs\"></i>' + (lang !== 'en' ? 'اشترك شهرياً' : 'Subscribe monthly') + '</button>';
                    }
                    return '<button onclick="event.stopPropagation();' + (s.orderMode==='instant'?'RequestSystem.openInstantModal':'RequestSystem.openRequestModal') + '(' + serviceDataStr + ')" class="flex-1 btn-primary py-2.5 text-sm"><i class=\"fa-solid ' + (s.orderMode==='instant'?'fa-lock':'fa-paper-plane') + ' me-1\"></i>' + (s.orderMode==='instant' ? (lang !== 'en' ? 'اطلب وادفع' : 'Pay & Request') : (lang !== 'en' ? 'طلب الخدمة' : 'Request Service')) + '</button>';
                  })()}
                </div>
              </div>
            </div>`;
        },

        // ── Service Detail ────────────────────────────────────────────────────
        // ── Product image gallery (detail view) ───────────────────────────────
        // Whole image is shown (object-contain on a blurred copy of itself — no cropping), arrows + thumbnails,
        // and a tap/click opens a full-screen lightbox with keyboard / swipe navigation.
        _galList(s) {
            const out = [];
            const add = (u) => { if (u && typeof u === 'string' && !out.includes(u)) out.push(u); };
            add(getServiceImage(s)); add(s.image); (Array.isArray(s.images) ? s.images : []).forEach(add);
            return out.length ? out : ['https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800'];
        },
        _galleryHtml(s) {
            const list = this._galList(s);
            this._gal = { list, i: 0 };
            const many = list.length > 1;
            return `
            <div class="relative bg-gray-900 select-none" id="svcGallery">
              <div class="absolute inset-0 overflow-hidden"><img id="svcGalBg" src="${list[0]}" class="w-full h-full object-cover blur-2xl opacity-40 scale-110" alt=""></div>
              <div class="relative h-80 sm:h-96 flex items-center justify-center cursor-zoom-in" onclick="ServicesManager.openLightbox()">
                <img id="serviceDetailMainImg" src="${list[0]}" class="max-h-full max-w-full object-contain" alt=""
                  onerror="this.src='https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800'">
              </div>
              <button onclick="closeModal('serviceModal')" class="absolute top-4 end-4 w-10 h-10 bg-black/50 backdrop-blur-sm text-white rounded-xl flex items-center justify-center hover:bg-black/70 transition z-10"><i class="fa-solid fa-xmark text-lg"></i></button>
              <button onclick="ServicesManager.openLightbox()" class="absolute top-4 start-4 h-10 px-3 bg-black/50 backdrop-blur-sm text-white rounded-xl flex items-center gap-2 text-xs font-bold hover:bg-black/70 transition z-10"><i class="fa-solid fa-expand"></i>${AppState.language==='en'?'Zoom':'تكبير'}</button>
              ${many ? `
              <button onclick="ServicesManager.galleryStep(-1)" class="absolute start-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 text-gray-800 rounded-full shadow flex items-center justify-center hover:bg-white z-10"><i class="fa-solid fa-chevron-left"></i></button>
              <button onclick="ServicesManager.galleryStep(1)" class="absolute end-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 text-gray-800 rounded-full shadow flex items-center justify-center hover:bg-white z-10"><i class="fa-solid fa-chevron-right"></i></button>
              <span id="svcGalCount" class="absolute bottom-3 end-3 bg-black/60 text-white text-xs font-bold px-2.5 py-1 rounded-full z-10">1 / ${list.length}</span>` : ''}
            </div>
            ${many ? `<div class="flex gap-2 p-3 bg-gray-50 overflow-x-auto" id="svcGalThumbs">
              ${list.map((u, i) => `<img src="${u}" onclick="ServicesManager.galleryGo(${i})" data-gi="${i}" class="w-16 h-16 object-cover rounded-lg border-2 ${i === 0 ? 'border-navy-500' : 'border-transparent'} cursor-pointer flex-shrink-0 hover:border-navy-400">`).join('')}
            </div>` : ''}`;
        },
        galleryGo(i) {
            const g = this._gal; if (!g) return;
            g.i = (i + g.list.length) % g.list.length;
            const u = g.list[g.i];
            const m = document.getElementById('serviceDetailMainImg'); if (m) m.src = u;
            const bg = document.getElementById('svcGalBg'); if (bg) bg.src = u;
            const c = document.getElementById('svcGalCount'); if (c) c.textContent = (g.i + 1) + ' / ' + g.list.length;
            document.querySelectorAll('#svcGalThumbs img').forEach(el => {
                const on = Number(el.dataset.gi) === g.i;
                el.classList.toggle('border-navy-500', on); el.classList.toggle('border-transparent', !on);
            });
            const lb = document.getElementById('svcLightboxImg'); if (lb) lb.src = u;
        },
        galleryStep(d) { if (this._gal) this.galleryGo(this._gal.i + d); },
        openLightbox() {
            const g = this._gal; if (!g) return;
            document.getElementById('svcLightbox')?.remove();
            const ov = document.createElement('div');
            ov.id = 'svcLightbox';
            ov.className = 'fixed inset-0 bg-black/95 z-[100000] flex items-center justify-center';
            ov.innerHTML = `
              <img id="svcLightboxImg" src="${g.list[g.i]}" class="max-w-[96vw] max-h-[92vh] object-contain">
              <button class="absolute top-4 end-4 w-11 h-11 bg-white/15 text-white rounded-full text-xl hover:bg-white/30" id="svcLbClose"><i class="fa-solid fa-xmark"></i></button>
              ${g.list.length > 1 ? `<button class="absolute start-3 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/15 text-white rounded-full hover:bg-white/30" id="svcLbPrev"><i class="fa-solid fa-chevron-left"></i></button>
              <button class="absolute end-3 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/15 text-white rounded-full hover:bg-white/30" id="svcLbNext"><i class="fa-solid fa-chevron-right"></i></button>` : ''}`;
            document.body.appendChild(ov);
            const close = () => { ov.remove(); document.removeEventListener('keydown', key); };
            const key = (e) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') this.galleryStep(-1); else if (e.key === 'ArrowRight') this.galleryStep(1); };
            document.addEventListener('keydown', key);
            ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
            ov.querySelector('#svcLbClose').onclick = close;
            ov.querySelector('#svcLbPrev')?.addEventListener('click', () => this.galleryStep(-1));
            ov.querySelector('#svcLbNext')?.addEventListener('click', () => this.galleryStep(1));
            let x0 = null;
            ov.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
            ov.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) this.galleryStep(dx < 0 ? 1 : -1); x0 = null; }, { passive: true });
        },

        async openServiceDetail(serviceId) {
            showLoading();
            try {
                const snap = await window.db.collection(COLLECTIONS.SERVICES).doc(serviceId).get();
                if (!snap.exists) { hideLoading(); showToast('Service not found', 'error'); return; }
                const s = { id: snap.id, ...snap.data() };
                AppState.currentService = s;

                const isAr  = AppState.language !== 'en';
                const stars = Math.round(s.rating || 0);
                const modal = document.getElementById('serviceModalContent');

                if (modal) {
                    modal.innerHTML = `
                    <div>
                      ${this._galleryHtml(s)}

                      <div class="p-6 space-y-5">
                        <!-- Title & Category -->
                        <div>
                          <span class="text-xs bg-navy-50 text-navy-600 font-bold px-3 py-1 rounded-full">${s.category || ''}</span>
                          ${s.dropship ? `<span class="text-xs bg-turquoise-50 text-turquoise-700 font-bold px-3 py-1 rounded-full ms-1"><i class="fa-solid fa-truck-fast me-1"></i>${isAr ? 'يُشحن من المورد' : 'Ships from supplier'}${s.deliveryDays ? (isAr ? ` • خلال ${s.deliveryDays} أيام` : ` • within ${s.deliveryDays} days`) : ''}</span>` : ''}
                          <h2 class="text-2xl font-black text-gray-900 mt-2">${escapeHtml(s.title || '—')}</h2>
                          <div class="flex items-center gap-2 mt-2">
                            ${Array.from({length:5},(_,i)=>`<i class="fa-solid fa-star text-sm ${i<stars?'text-yellow-400':'text-gray-200'}"></i>`).join('')}
                            <span class="text-sm text-gray-500">(${s.reviewCount || 0} ${t('services.reviews')})</span>
                          </div>
                        </div>

                        <!-- Seller -->
                        <div class="flex items-center gap-3 bg-gray-50 rounded-2xl p-4">
                          <img src="${s.sellerAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.sellerName||'U')}&background=0284c7&color=fff`}"
                            class="w-12 h-12 rounded-xl object-cover">
                          <div>
                            <p class="font-black text-gray-900">${escapeHtml(s.sellerName || '—')}</p>
                            <p class="text-sm text-gray-500">${s.sellerTitle || ''}</p>
                          </div>
                          ${s.sellerVerified ? '<span class="ms-auto bg-navy-100 text-navy-700 text-xs font-bold px-3 py-1 rounded-full"><i class="fa-solid fa-check me-1"></i>موثّق</span>' : ''}
                        </div>

                        <!-- Description -->
                        <div>
                          <h3 class="font-black text-gray-900 mb-2">${isAr ? 'وصف الخدمة' : 'Service Description'}</h3>
                          <p class="text-gray-600 leading-relaxed text-sm">${escapeHtml(s.description || '—')}</p>
                        </div>

                        <!-- Meta -->
                        <div class="grid grid-cols-3 gap-3">
                          <div class="bg-navy-50 rounded-xl p-3 text-center">
                            <i class="fa-solid fa-clock text-navy-600 text-xl mb-1"></i>
                            <p class="text-xs text-gray-500">${t('services.delivery')}</p>
                            <p class="font-black text-gray-900 text-sm">${s.deliveryDays || 3} ${t('services.days')}</p>
                          </div>
                          <div class="bg-green-50 rounded-xl p-3 text-center">
                            <i class="fa-solid fa-rotate-left text-green-600 text-xl mb-1"></i>
                            <p class="text-xs text-gray-500">${isAr ? 'مراجعات' : 'Revisions'}</p>
                            <p class="font-black text-gray-900 text-sm">${s.revisions || 2}</p>
                          </div>
                          <div class="bg-amber-50 rounded-xl p-3 text-center">
                            <i class="fa-solid fa-star text-amber-500 text-xl mb-1"></i>
                            <p class="text-xs text-gray-500">${isAr ? 'التقييم' : 'Rating'}</p>
                            <p class="font-black text-gray-900 text-sm">${(s.reviewCount || 0) > 0 ? Number(s.rating || 0).toFixed(1) : (isAr ? 'جديد' : 'New')}</p>
                          </div>
                        </div>

                        <!-- Price & Actions -->
                        <div class="bg-gradient-to-r from-navy-600 to-navy-800 rounded-2xl p-5 text-white">
                          <div class="flex items-center justify-between mb-4">
                            <div>
                              <p class="text-navy-200 text-sm">${isAr ? 'السعر الإجمالي' : 'Total Price'}</p>
                              <p class="text-3xl font-black" data-price-egp="${s.price||0}">${formatCurrency(s.price || 0)}</p>
                              ${s.listingType === 'product' && s.category !== 'digital' && !s.dropship ? `<p class="text-navy-100 text-xs mt-1"><i class="fa-solid fa-truck-fast me-1"></i>${Number(s.shippingFee) > 0 ? (isAr ? `الشحن ${formatCurrency(s.shippingFee)} — ${s.shippingMode === 'cod' ? 'عند الاستلام' : 'يتدفع مع المنتج'}` : `Shipping ${formatCurrency(s.shippingFee)} — ${s.shippingMode === 'cod' ? 'on delivery' : 'paid with the product'}`) : (isAr ? 'شحن مجاني' : 'Free shipping')}</p>` : ''}
                            </div>
                            <div class="bg-white/15 rounded-xl px-3 py-2 text-sm font-bold">
                              ${isAr ? 'مدفوع بأمان عبر Escrow' : 'Secured by Escrow'}
                            </div>
                          </div>
                          <div class="flex gap-3">
                            ${s.listingType === 'product' ? `
                            ${s.dropship ? '' : `<button onclick="addToCart(${JSON.stringify({id:s.id,title:s.title||'',price:s.price||0,image:getServiceImage(s),sellerId:s.sellerId||'',sellerName:s.sellerName||'',deliveryDays:s.deliveryDays||0}).replace(/"/g,'&quot;')})"
                              class="flex-1 bg-white text-navy-700 font-black py-3.5 rounded-xl hover:bg-navy-50 transition flex items-center justify-center gap-2">
                              <i class="fa-solid fa-cart-plus"></i>${AppState.language === 'en' ? 'Add to Cart' : 'أضف للسلة'}
                            </button>`}
                            <button onclick="closeModal('serviceModal');RequestSystem.openProductOrderModal(${JSON.stringify({id:s.id,title:s.title||'',price:s.price||0,image:getServiceImage(s),sellerId:s.sellerId||'',sellerName:s.sellerName||'',deliveryDays:s.deliveryDays||0,orderRules:s.orderRules||'',structuredFields:s.structuredFields||[],category:s.category||'other',shippingFee:s.shippingFee||0,shippingMode:s.shippingMode||'online'}).replace(/"/g,'&quot;')})"
                              class="flex-1 bg-turquoise-600 text-white font-black py-3.5 rounded-xl hover:bg-turquoise-700 transition flex items-center justify-center gap-2">
                              <i class="fa-solid fa-bolt"></i>${AppState.language === 'en' ? 'Buy Now' : 'اشترِ فورًا'}
                            </button>` : s.orderMode === 'instant' ? `
                            <button onclick="closeModal('serviceModal');RequestSystem.openInstantModal(${JSON.stringify({id:s.id,title:s.title||'',price:s.price||0,image:getServiceImage(s),sellerId:s.sellerId||'',sellerName:s.sellerName||'',deliveryDays:s.deliveryDays||3}).replace(/"/g,'&quot;')})"
                              class="flex-1 bg-white text-navy-700 font-black py-3.5 rounded-xl hover:bg-navy-50 transition flex items-center justify-center gap-2">
                              <i class="fa-solid fa-lock"></i>${AppState.language === 'en' ? 'Pay & Request' : 'اطلب وادفع الآن'}
                            </button>` : `
                            <button onclick="closeModal('serviceModal');RequestSystem.openRequestModal(${JSON.stringify({id:s.id,title:s.title||'',price:s.price||0,image:getServiceImage(s),sellerId:s.sellerId||'',sellerName:s.sellerName||'',deliveryDays:s.deliveryDays||3}).replace(/"/g,'&quot;')})"
                              class="flex-1 bg-white text-navy-700 font-black py-3.5 rounded-xl hover:bg-navy-50 transition flex items-center justify-center gap-2">
                              <i class="fa-solid fa-paper-plane"></i>${AppState.language === 'en' ? 'Request Service' : 'طلب الخدمة'}
                            </button>`}
                          </div>
                        </div>
                      </div>
                    </div>`;
                    modal.insertAdjacentHTML('beforeend', '<div id="serviceReviewsHost"></div>');
                    openModal('serviceModal');
                }
                hideLoading();

                // Load reviews (summary + list)
                if (window.ReviewsUI) ReviewsUI.renderForService(serviceId, s); else this._loadServiceReviews(serviceId);
            } catch (err) {
                hideLoading();
                showToast(t('general.error'), 'error');
            }
        },

        async _loadServiceReviews(serviceId) {
            try {
                const snap = await window.db.collection(COLLECTIONS.REVIEWS)
                    .where('serviceId', '==', serviceId)
                    .orderBy('createdAt', 'desc').limit(5).get();

                const modal = document.getElementById('serviceModalContent');
                if (!snap.empty && modal) {
                    const isAr = AppState.language !== 'en';
                    const reviewsHtml = `
                    <div class="px-6 pb-6">
                      <h3 class="font-black text-gray-900 mb-4">${isAr ? 'التقييمات' : 'Reviews'}</h3>
                      <div class="space-y-4">
                        ${snap.docs.map(d => {
                            const r = d.data();
                            const stars = Math.round(r.rating || 5);
                            return `
                            <div class="bg-gray-50 rounded-xl p-4">
                              <div class="flex items-center gap-3 mb-2">
                                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(r.reviewerName||'U')}&background=0284c7&color=fff"
                                  class="w-8 h-8 rounded-full">
                                <div>
                                  <p class="font-bold text-gray-900 text-sm">${escapeHtml(r.reviewerName || '—')}</p>
                                  <div class="flex gap-0.5">${Array.from({length:5},(_,i)=>`<i class="fa-solid fa-star text-xs ${i<stars?'text-yellow-400':'text-gray-300'}"></i>`).join('')}</div>
                                </div>
                                <span class="ms-auto text-xs text-gray-400">${formatTimeAgo(r.createdAt)}</span>
                              </div>
                              <p class="text-sm text-gray-600">${escapeHtml(r.text || '')}</p>
                            </div>`;
                        }).join('')}
                      </div>
                    </div>`;
                    modal.innerHTML += reviewsHtml;
                }
            } catch (_) {}
        },

        // ── Add Service Form ──────────────────────────────────────────────────
        // defaultType: 'service' | 'product' — preselects the listing-type
        // radio when opening a blank form (e.g. from the "Add Product" quick
        // action). Ignored when editing an existing listing.
        openAddServiceForm(defaultType) {
            const user = AppState.currentUser;
            if (!user) { showToast(t('general.login_req'), 'warning'); navigateTo('login'); return; }
            if (user.role !== 'seller' && user.role !== 'admin') {
                showToast(AppState.language === 'en' ? 'Only sellers can add services' : 'يجب أن تكون بائعاً لإضافة خدمات', 'warning');
                return;
            }
            navigateTo('add-service');
            this._renderAddServiceForm(null, defaultType);
        },

        // Wrapper: renders the form, then fills the "which store?" selector from the seller's own stores.
        _renderAddServiceForm(service = null, defaultType) {
            this._renderAddServiceFormBase(service, defaultType);
            this._populateStoreSelect(service);
        },
        async _populateStoreSelect(service) {
            const box = document.getElementById('svcStoreBox'); const user = AppState.currentUser;
            if (!box || !user) return;
            try {
                const snap = await window.db.collection(COLLECTIONS.STORES).where('ownerId', '==', user.uid).get();
                const stores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                if (!stores.length) { box.classList.add('hidden'); return; }
                const wanted = (service && service.storeId) || AppState.pendingStoreId || user.uid;
                const sel = document.getElementById('svcStoreId');
                sel.innerHTML = stores.map(x => `<option value="${x.id}" ${x.id === wanted ? 'selected' : ''}>${escapeHtml(x.name || x.id)}</option>`).join('');
                box.classList.remove('hidden');
            } catch (_) { box.classList.add('hidden'); }
            AppState.pendingStoreId = null;
        },

        _renderAddServiceFormBase(service = null, defaultType) {
            const container = document.getElementById('addServiceContent');
            if (!container) return;
            const isAr  = AppState.language !== 'en';
            const isEdit = !!service;
            const wantsProduct = service ? service.listingType === 'product' : defaultType === 'product';

            // Reset per-form-open state (gallery photos, structured fields),
            // then pre-load from the existing listing when editing.
            // Cover first, then the extra photos — de-duplicated (older docs/imports could repeat the cover).
            _photos = isEdit ? [...new Set([service.image, ...(Array.isArray(service.images) ? service.images : [])].filter(Boolean))].slice(0, 5).map(url => ({ kind: 'existing', url })) : [];
            this._editingStructuredFields = isEdit ? (service.structuredFields || []) : [];

            const categories = _getServiceCategories();
            const productCategories = _getProductCategories();

            container.innerHTML = `
            <div class="max-w-2xl mx-auto">
              <div class="flex items-center gap-4 mb-8">
                <button onclick="navigateTo('dashboard')" class="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center hover:bg-gray-200 transition">
                  <i class="fa-solid fa-arrow-${isAr?'right':'left'}"></i>
                </button>
                <h1 class="text-2xl font-black text-gray-900">${isEdit ? (isAr?'تعديل الإعلان':'Edit Listing') : (wantsProduct ? (isAr?'إضافة منتج جديد':'Add New Product') : (isAr?'إضافة خدمة جديدة':'Add New Service'))}</h1>
              </div>

              <form onsubmit="event.preventDefault();ServicesManager.saveService('${service?.id||''}')" class="space-y-6">
                <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-5">

                  <!-- ⚠️ ADDED: listingType — "service" (custom work, needs a
                       request + your approval, like before) vs "product" (a
                       ready-made digital item — buyer pays and gets it
                       instantly, no approval step). Toggles which fields show
                       below. -->
                  <div>
                    <label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'نوع الإعلان':'Listing Type'} *</label>
                    <div class="grid grid-cols-2 gap-3">
                      <label class="flex items-center gap-2 border-2 rounded-2xl p-4 cursor-pointer transition has-[:checked]:border-navy-700 has-[:checked]:bg-navy-50 border-gray-200">
                        <input type="radio" name="svcListingType" value="service" id="svcTypeService" onchange="ServicesManager.toggleListingType()" ${!wantsProduct ? 'checked' : ''} class="w-4 h-4 accent-navy-700">
                        <div><p class="font-bold text-gray-900 text-sm flex items-center gap-1.5"><i class="fa-solid fa-toolbox"></i>${isAr?'خدمة':'Service'}</p><p class="text-xs text-gray-400">${isAr?'شغل مخصص، محتاج موافقتك':'Custom work, needs your approval'}</p></div>
                      </label>
                      <label class="flex items-center gap-2 border-2 rounded-2xl p-4 cursor-pointer transition has-[:checked]:border-turquoise-500 has-[:checked]:bg-turquoise-50 border-gray-200">
                        <input type="radio" name="svcListingType" value="product" id="svcTypeProduct" onchange="ServicesManager.toggleListingType()" ${wantsProduct ? 'checked' : ''} class="w-4 h-4 accent-turquoise-600">
                        <div><p class="font-bold text-gray-900 text-sm flex items-center gap-1.5"><i class="fa-solid fa-box"></i>${isAr?'منتج جاهز':'Ready Product'}</p><p class="text-xs text-gray-400">${isAr?'تسليم فوري تلقائي':'Instant automatic delivery'}</p></div>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'العنوان':'Title'} *</label>
                    <input type="text" id="svcTitle" class="form-input" maxlength="120"
                      value="${escapeHtml(service?.title||'')}"
                      placeholder="${isAr?'مثال: تصميم شعار احترافي بأسلوب حديث':'e.g. Professional logo design in modern style'}">
                  </div>

                  <div>
                    <label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'الوصف':'Description'} *</label>
                    <textarea id="svcDesc" rows="5" class="form-input" maxlength="2000"
                      placeholder="${isAr?'اشرح تفاصيل الإعلان، ما الذي تقدمه، ومزاياك...':'Describe your listing in detail...'}">${escapeHtml(service?.description||'')}</textarea>
                  </div>

                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'التصنيف':'Category'} *</label>
                      <select id="svcCategory" class="form-input" onchange="ServicesManager.onCategoryChange()">
                        ${(wantsProduct ? productCategories : categories).map(c => `<option value="${c.value}" ${service?.category===c.value?'selected':''}>${c.label}</option>`).join('')}
                      </select>
                    </div>
                    <div>
                      <label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'السعر (ج.م)':'Price (EGP)'} *</label>
                      <input type="number" id="svcPrice" class="form-input" min="5" max="100000" step="0.5"
                        value="${service?.price||''}" placeholder="150">
                    </div>
                  </div>

                  <!-- ⚠️ ADDED: when the seller picks "أخرى" because nothing
                       else fits, let them name what they actually needed —
                       goes to admin as a category request instead of just
                       silently landing in "Other" forever. -->
                  <div id="svcCategorySuggestBox" class="hidden bg-blue-50 border border-blue-200 rounded-2xl p-4">
                    <label class="block text-sm font-bold text-blue-800 mb-2"><i class="fa-solid fa-lightbulb me-1.5"></i>${isAr?'مفيش تصنيف مناسب؟ اقترح واحد جديد (اختياري)':"No category fits? Suggest a new one (optional)"}</label>
                    <input type="text" id="svcCategorySuggestion" class="form-input" maxlength="60"
                      placeholder="${isAr?'مثال: أثاث منزلي، ألعاب أطفال...':'e.g. Home furniture, Kids toys...'}">
                    <p class="text-xs text-blue-600 mt-1.5">${isAr?'هنراجعها ولو مناسبة هنضيفها كتصنيف رسمي.':"We'll review it and add it as an official category if it fits."}</p>
                  </div>

                  <!-- Service-only fields -->
                  <div id="svcServiceFields" class="space-y-5">
                    <!-- ⚠️ ADDED: orderMode — lets the seller choose, per service,
                         between the two order flows: "request_first" (buyer sends
                         a brief, seller must approve before payment opens) or
                         "instant" (buyer pays and sends their brief together in
                         one step — seller starts work as soon as payment lands,
                         no approval gate). Only meaningful for listingType
                         "service" — products are always instant by nature. -->
                    <div>
                      <label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'طريقة استقبال الطلبات':'How orders come in'}</label>
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label class="flex items-start gap-2 border-2 rounded-2xl p-4 cursor-pointer transition has-[:checked]:border-navy-700 has-[:checked]:bg-navy-50 border-gray-200">
                          <input type="radio" name="svcOrderMode" value="request_first" id="svcOrderModeRequest"
                            ${service?.orderMode === 'instant' ? '' : 'checked'} class="w-4 h-4 mt-1 accent-navy-700">
                          <div><p class="font-bold text-gray-900 text-sm">${isAr?'طلب ثم موافقتك':'Request, then your approval'}</p>
                            <p class="text-xs text-gray-400">${isAr?'العميل يبعت التفاصيل، وبعد موافقتك تظهر له بوابة الدفع':'Buyer sends the brief; payment only opens after you accept'}</p></div>
                        </label>
                        <label class="flex items-start gap-2 border-2 rounded-2xl p-4 cursor-pointer transition has-[:checked]:border-turquoise-500 has-[:checked]:bg-turquoise-50 border-gray-200">
                          <input type="radio" name="svcOrderMode" value="instant" id="svcOrderModeInstant"
                            ${service?.orderMode === 'instant' ? 'checked' : ''} class="w-4 h-4 mt-1 accent-turquoise-600">
                          <div><p class="font-bold text-gray-900 text-sm">${isAr?'دفع مباشر مع الطلب':'Pay + brief together'}</p>
                            <p class="text-xs text-gray-400">${isAr?'العميل يدفع ويبعت التفاصيل مرة واحدة، وتبدأ التنفيذ فورًا':'Buyer pays and sends the brief in one step; you start right away'}</p></div>
                        </label>
                      </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                      <div>
                        <label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'مدة التسليم (أيام)':'Delivery (days)'}</label>
                        <input type="number" id="svcDelivery" class="form-input" min="1" max="60"
                          value="${service?.deliveryDays||3}" placeholder="3">
                      </div>
                      <div>
                        <label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'عدد المراجعات':'Revisions'}</label>
                        <input type="number" id="svcRevisions" class="form-input" min="0" max="20"
                          value="${service?.revisions||2}" placeholder="2">
                      </div>
                    </div>

                    <div class="flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-2xl p-4">
                      <input type="checkbox" id="svcRecurring" ${service?.recurring ? 'checked' : ''} class="w-5 h-5 accent-purple-600 flex-shrink-0">
                      <div>
                        <label for="svcRecurring" class="font-bold text-purple-800 text-sm cursor-pointer">${isAr?'خدمة اشتراك شهري متكرر':'Recurring monthly service'}</label>
                        <p class="text-xs text-purple-500">${isAr?'المشتري هيتحصّل عليه الشهر بشهر تلقائياً بنفس السعر (مثال: إدارة سوشيال ميديا شهرية)':'Buyer is billed automatically every month at this price (e.g. monthly social media management)'}</p>
                      </div>
                    </div>
                  </div>

                  <!-- Product-only field: what the buyer gets instantly on payment -->
                  <div id="svcProductFields" class="hidden space-y-3">
                    <!-- ⚠️ ADDED: category-based suggested field templates —
                         picking "ملابس" suggests "المقاس/اللون" dropdowns the
                         buyer actually has to choose from on checkout, instead
                         of hoping they type the right thing in a notes box. -->
                    <div id="svcFieldTemplatesContainer"></div>

                    <!-- ⚠️ ADDED: generic custom fields — works for ANY product
                         category, not just the ones with built-in templates
                         (clothing/electronics/home/beauty/food). The seller
                         can add as many arbitrary attributes as they need. -->
                    <div class="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                      <div class="flex items-center justify-between mb-2.5">
                        <p class="text-sm font-black text-gray-700"><i class="fa-solid fa-sliders me-1.5"></i>${isAr?'خصائص مخصصة إضافية (اختياري)':'Extra custom attributes (optional)'}</p>
                        <button type="button" onclick="ServicesManager.addCustomField()" class="text-xs font-bold text-navy-700 hover:underline flex items-center gap-1"><i class="fa-solid fa-plus"></i>${isAr?'أضف خاصية':'Add attribute'}</button>
                      </div>
                      <p class="text-xs text-gray-400 mb-2">${isAr?'مثال: الوزن، الحجم، النكهة، الطراز — أي حاجة تخص منتجك مهما كان نوعه.':'e.g. weight, size, flavor, model — anything specific to your product, whatever its category.'}</p>
                      <div id="svcCustomFieldsContainer" class="space-y-2"></div>
                    </div>

                    <div>
                      <label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'شروطك وملاحظاتك على الطلب (اختياري)':"Your order rules/notes (optional)"}</label>
                      <textarea id="svcOrderRules" rows="3" class="form-input" maxlength="1000"
                        placeholder="${isAr?'مثال: لازم تحدد المقاس واللون في الملاحظات، مفيش استرجاع بعد فتح المنتج...':'e.g. must specify size/color, no returns after opening...'}">${escapeHtml(service?.orderRules||'')}</textarea>
                    </div>

                    <!-- ⚠️ CHANGED: this used to be shown+required for EVERY
                         product regardless of category — a t-shirt seller had
                         to supply an "instant delivery link" that made no
                         sense, while buyers of it were later STILL asked for
                         a shipping address at checkout (both flows fired at
                         once). Now it only applies to category === 'digital';
                         other categories are physical goods shipped to the
                         buyer's address (collected at checkout instead), and
                         see the notice box below rather than this section. -->
                    <div id="svcDeliverySection" class="bg-turquoise-50 border border-turquoise-200 rounded-2xl p-4 hidden">
                      <label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'رابط أو ملف التسليم الفوري':'Instant delivery link or file'} *</label>
                      <p class="text-xs text-gray-500 mb-3">${isAr?'ده اللي المشتري هيستلمه أوتوماتيك فور الدفع — رابط تحميل، أو ارفع الملف مباشرة. مفيش شحن أو عنوان في المنتجات الرقمية.':"This is what the buyer receives automatically the moment they pay — a download link, or upload the file directly. No shipping/address for digital products."}</p>
                      <input type="text" id="svcDeliveryLink" class="form-input mb-3" dir="ltr"
                        value="${service?.digitalDelivery?.type==='link' ? escapeHtml(service.digitalDelivery.value||'') : ''}"
                        placeholder="https://...">
                      <div class="border-2 border-dashed border-gray-200 rounded-2xl p-4 text-center hover:border-turquoise-400 transition cursor-pointer" onclick="document.getElementById('svcDeliveryFile').click()">
                        <i class="fa-solid fa-file-arrow-up text-2xl text-gray-300 mb-1"></i>
                        <p class="text-xs text-gray-400" id="svcDeliveryFileLabel">${service?.digitalDelivery?.type==='file' ? (isAr?'ملف مرفوع بالفعل — اختر ملف جديد لاستبداله':'File already uploaded — choose a new one to replace it') : (isAr?'أو ارفع ملف هنا':'or upload a file here')}</p>
                        <input type="file" id="svcDeliveryFile" class="hidden">
                      </div>
                      <input type="hidden" id="svcDeliveryExisting" value="${service?.digitalDelivery?.type==='file' ? escapeHtml(service.digitalDelivery.value||'') : ''}">
                      <div>
                        <label class="block text-sm font-bold text-gray-700 mb-2 mt-3">${isAr?'ملاحظات تسليم إضافية (اختياري)':'Extra delivery notes (optional)'}</label>
                        <textarea id="svcDeliveryNotes" rows="2" class="form-input" maxlength="500"
                          placeholder="${isAr?'مثال: كود التفعيل، تعليمات التركيب...':'e.g. activation code, install instructions...'}">${escapeHtml(service?.digitalDelivery?.notes||'')}</textarea>
                      </div>
                    </div>
                    <div id="svcShippingNotice" class="bg-amber-50 border border-amber-200 rounded-2xl p-4 hidden">
                      <p class="text-sm font-bold text-amber-800 flex items-center gap-2"><i class="fa-solid fa-truck"></i>${isAr?'ده منتج فعلي هيتشحن':'This is a physical, shipped product'}</p>
                      <p class="text-xs text-amber-700 mt-1">${isAr?'العميل هيدخل عنوانه ورقم تليفونه وقت الطلب علشان توصله المنتج — مش محتاج تحط رابط تسليم هنا.':"The buyer will enter their delivery address and phone at checkout so you can ship it to them — no delivery link needed here."}</p>
                    </div>

                    <!-- Shipping price + how it is paid — set by the seller per product (physical products only) -->
                    <div id="svcShippingBox" class="bg-white border-2 border-amber-200 rounded-2xl p-4 hidden">
                      <label class="block text-sm font-black text-gray-800 mb-1"><i class="fa-solid fa-truck-fast text-amber-600 me-1"></i>${isAr?'سعر الشحن':'Shipping price'}</label>
                      <p class="text-xs text-gray-500 mb-3">${isAr?'اكتب تكلفة الشحن لهذا المنتج (0 = شحن مجاني) واختار طريقة دفعها.':'Enter the shipping cost for this product (0 = free) and choose how it is paid.'}</p>
                      <input type="number" id="svcShippingFee" class="form-input mb-2" min="0" max="2000" step="1" value="${service?.shippingFee ?? 0}" placeholder="0">
                      <div class="flex flex-wrap gap-2 mb-4">
                        ${[0,30,50,70,100].map(v => `<button type="button" onclick="document.getElementById('svcShippingFee').value=${v}" class="px-3 py-1 text-xs font-bold rounded-full bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100">${v===0?(isAr?'مجاني':'Free'):v+' '+(isAr?'ج.م':'EGP')}</button>`).join('')}
                      </div>
                      <div class="space-y-2" id="svcShippingModeBox">
                        <label class="flex items-start gap-2 p-3 border-2 border-gray-100 rounded-xl cursor-pointer has-[:checked]:border-navy-600 has-[:checked]:bg-navy-50">
                          <input type="radio" name="svcShippingMode" value="online" class="mt-1" ${service?.shippingMode==='cod'?'':'checked'}>
                          <span class="text-sm"><b>${isAr?'يتدفع أونلاين مع المنتج (موصى به)':'Paid online with the product (recommended)'}</b><br><span class="text-xs text-gray-500">${isAr?'بيدخل الضمان مع السعر وفلوسك مضمونة، وبيدعم النزاعات والاسترجاع بالكامل.':'Held in escrow with the price — fully covered by disputes and refunds.'}</span></span>
                        </label>
                        <label class="flex items-start gap-2 p-3 border-2 border-gray-100 rounded-xl cursor-pointer has-[:checked]:border-navy-600 has-[:checked]:bg-navy-50">
                          <input type="radio" name="svcShippingMode" value="cod" class="mt-1" ${service?.shippingMode==='cod'?'checked':''}>
                          <span class="text-sm"><b>${isAr?'عند الاستلام (كاش للمندوب)':'Cash on delivery'}</b><br><span class="text-xs text-gray-500">${isAr?'العميل يدفع الشحن للمندوب. ده برا الضمان — المنصة مش بتحصّله ولا بتحميه.':'Buyer pays the courier. Outside escrow — the platform neither collects nor protects it.'}</span></span>
                        </label>
                      </div>
                    </div>


                    <!-- Which of my stores shows this listing -->
                    <div id="svcStoreBox" class="hidden bg-white border-2 border-navy-100 rounded-2xl p-4">
                      <label class="block text-sm font-black text-gray-800 mb-1"><i class="fa-solid fa-store text-navy-600 me-1"></i>${isAr?'المتجر':'Store'}</label>
                      <select id="svcStoreId" class="form-input w-full"></select>
                    </div>

                    <!-- ⚠️ ADDED: optional availability limits — a stock count, an
                         expiry date, or both. Either one left empty/zero means
                         "unlimited" / "no expiry" for that dimension. -->
                    <div class="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                      <label class="block text-sm font-bold text-gray-700 mb-1">${isAr?'حدود العرض (اختياري)':'Availability limits (optional)'}</label>
                      <p class="text-xs text-gray-500 mb-3">${isAr?'حدّد كمية معينة، أو تاريخ انتهاء للعرض، أو الاتنين مع بعض — اسيب أي حقل فاضي يعني بلا حدود.':'Set a quantity, an expiry date, or both — leave either blank for unlimited.'}</p>
                      <div class="grid grid-cols-2 gap-4">
                        <div>
                          <label class="block text-xs font-bold text-gray-600 mb-1">${isAr?'الكمية المتاحة':'Stock quantity'}</label>
                          <input type="number" id="svcStockLimit" class="form-input" min="0" step="1"
                            value="${service?.stockLimit ?? ''}" placeholder="${isAr?'بلا حدود':'Unlimited'}">
                        </div>
                        <div>
                          <label class="block text-xs font-bold text-gray-600 mb-1">${isAr?'تاريخ انتهاء العرض':'Offer expiry date'}</label>
                          <input type="date" id="svcExpiryDate" class="form-input"
                            value="${service?.expiryDate ? String(service.expiryDate).slice(0,10) : ''}">
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'صور الإعلان':'Listing photos'} <span id="svcPhotoCount" class="text-xs font-normal text-gray-400"></span></label>
                    <div class="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center hover:border-navy-400 transition cursor-pointer" onclick="document.getElementById('svcPhotoFiles').click()">
                      <i class="fa-solid fa-images text-3xl text-gray-300 mb-2"></i>
                      <p id="svcPhotoHint" class="text-sm text-gray-400"></p>
                    </div>
                    <input type="file" id="svcPhotoFiles" accept="image/*" multiple class="hidden" onchange="ServicesManager.onPhotosChosen(this)">
                    <div id="svcPhotoPreview" class="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3"></div>
                  </div>

                </div>

                <button type="submit" class="btn-primary w-full py-5 text-lg">
                  <i class="fa-solid fa-plus me-2"></i>${isEdit ? (isAr?'حفظ التعديلات':'Save Changes') : (isAr?'نشر الإعلان':'Publish Listing')}
                </button>
              </form>
            </div>`;

            this.toggleListingType();
            this._renderPhotos();
            this._restoreCustomFields();
        },

        // ⚠️ ADDED: when editing a listing, any saved structuredField whose
        // key isn't one of the current category's built-in template keys is
        // a custom attribute the seller added — restore it as an editable row
        // instead of silently dropping it on save.
        _restoreCustomFields() {
            const container = document.getElementById('svcCustomFieldsContainer');
            if (!container) return;
            container.innerHTML = '';
            const existing = this._editingStructuredFields || [];
            const cat = document.getElementById('svcCategory')?.value;
            const templateKeys = new Set((_getFieldTemplates()[cat] || []).map(f => f.key));
            existing.filter(f => !templateKeys.has(f.key))
                .forEach(f => this.addCustomField(f.label, (f.options||[]).join(', ')));
        },

        // Shows/hides the service-only vs product-only field groups based on
        // the selected radio — called on load and on every change.
        toggleListingType() {
            const isProduct = document.getElementById('svcTypeProduct')?.checked;
            setTimeout(() => this._renderPhotos(), 0);   // photo limit differs: product 5, service 1
            document.getElementById('svcServiceFields')?.classList.toggle('hidden', !!isProduct);
            document.getElementById('svcProductFields')?.classList.toggle('hidden', !isProduct);
            // ⚠️ ADDED: swap the category dropdown's options to match — a
            // service listing shouldn't be stuck offering "ملابس/إلكترونيات"
            // and a product listing shouldn't be stuck offering "برمجة/تصميم".
            // Keeps the current selection if that same category value exists
            // in the new list, otherwise falls back to the first option.
            const catSelect = document.getElementById('svcCategory');
            const list = isProduct ? _getProductCategories() : _getServiceCategories();
            if (catSelect && list) {
                const current = catSelect.value;
                catSelect.innerHTML = list.map(c => `<option value="${c.value}">${c.label}</option>`).join('');
                if (list.some(c => c.value === current)) catSelect.value = current;
            }
            if (isProduct) this.refreshFieldTemplates();
            this._toggleDeliverySection();
            document.getElementById('svcCategorySuggestBox')?.classList.toggle('hidden', document.getElementById('svcCategory')?.value !== 'other');
        },

        // ⚠️ ADDED: category change handler — swaps the suggested-fields panel
        // AND flips between "instant delivery link" (digital) vs "physical
        // shipping notice" (every other product category).
        onCategoryChange() {
            this.refreshFieldTemplates();
            this._toggleDeliverySection();
            const box = document.getElementById('svcCategorySuggestBox');
            if (box) box.classList.toggle('hidden', document.getElementById('svcCategory')?.value !== 'other');
        },
        _toggleDeliverySection() {
            const isProduct = document.getElementById('svcTypeProduct')?.checked;
            const isDigital = document.getElementById('svcCategory')?.value === 'digital';
            document.getElementById('svcDeliverySection')?.classList.toggle('hidden', !(isProduct && isDigital));
            document.getElementById('svcShippingNotice')?.classList.toggle('hidden', !(isProduct && !isDigital));
            document.getElementById('svcShippingBox')?.classList.toggle('hidden', !(isProduct && !isDigital));
        },

        // ⚠️ ADDED: rebuilds the "suggested fields for this category" panel —
        // called on load (product listings) and whenever the category select
        // changes. Preserves the seller's on/off + edited options when
        // editing an existing listing that already has structuredFields, so
        // reopening the edit form doesn't reset their previous choices.
        // ⚠️ ADDED: generic custom attribute rows — usable for any category,
        // unlike the fixed per-category templates above. Each row is a
        // label + optional comma-separated options (blank = buyer types
        // free text at checkout, same as the template fields' "text" type).
        _customFieldSeq: 0,
        addCustomField(label = '', options = '') {
            const container = document.getElementById('svcCustomFieldsContainer');
            if (!container) return;
            const isAr = AppState.language !== 'en';
            const id = `custom_${Date.now()}_${this._customFieldSeq++}`;
            const row = document.createElement('div');
            row.className = 'custom-field-row bg-white rounded-xl p-3 border border-gray-200 flex gap-2 items-start';
            row.dataset.key = id;
            row.innerHTML = `
              <div class="flex-1 space-y-1.5">
                <input type="text" class="form-input text-xs custom-field-label" value="${escapeHtml(label)}" placeholder="${isAr?'اسم الخاصية، مثال: الوزن':'Attribute name, e.g. Weight'}">
                <input type="text" class="form-input text-xs custom-field-options" value="${escapeHtml(options)}" placeholder="${isAr?'خيارات مفصولة بفاصلة (اختياري) — سيبها فاضية لو المشتري هيكتب بنفسه':'Comma-separated options (optional) — leave blank for free text'}">
              </div>
              <button type="button" onclick="this.closest('.custom-field-row').remove()" class="w-8 h-8 shrink-0 bg-red-50 text-red-600 rounded-lg flex items-center justify-center hover:bg-red-100 transition mt-0.5"><i class="fa-solid fa-trash text-xs"></i></button>`;
            container.appendChild(row);
        },

        refreshFieldTemplates() {
            const container = document.getElementById('svcFieldTemplatesContainer');
            if (!container) return;
            const cat = document.getElementById('svcCategory')?.value;
            const templates = (_getFieldTemplates()[cat]) || [];
            const isAr = AppState.language !== 'en';
            if (templates.length === 0) { container.innerHTML = ''; return; }
            const existing = this._editingStructuredFields || [];
            container.innerHTML = `
              <div class="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                <p class="text-sm font-black text-blue-800 mb-3"><i class="fa-solid fa-wand-magic-sparkles me-1.5"></i>${isAr?'حقول مقترحة لهذا التصنيف — فعّل اللي يناسبك وعدّل الخيارات لو حبيت':'Suggested fields for this category — turn on what fits and tweak the options if you like'}</p>
                <div class="space-y-2.5">
                  ${templates.map(f => {
                      const ex = existing.find(e => e.key === f.key);
                      const isOn = ex ? true : !!f.on;
                      const opts = ex ? (ex.options||[]).join(', ') : f.options;
                      return `
                      <div class="bg-white rounded-xl p-3 border border-blue-100">
                        <label class="flex items-center gap-2 cursor-pointer mb-1.5">
                          <input type="checkbox" class="field-tpl-toggle w-4 h-4 accent-navy-700"
                            data-key="${f.key}" data-label="${escapeHtml(f.label)}" data-type="${f.type}"
                            ${isOn?'checked':''} onchange="this.closest('.bg-white').querySelector('.field-tpl-options-wrap')?.classList.toggle('hidden', !this.checked)">
                          <span class="font-bold text-sm text-gray-800">${escapeHtml(f.label)}</span>
                        </label>
                        <div class="field-tpl-options-wrap ${isOn?'':'hidden'} ps-6">
                          ${f.type === 'select'
                            ? `<input type="text" class="form-input text-xs field-tpl-options" data-key="${f.key}" value="${escapeHtml(opts)}" placeholder="${isAr?'اكتب الخيارات مفصولة بفاصلة، مثلاً: S, M, L, XL':'Comma-separated options, e.g. S, M, L, XL'}">`
                            : `<p class="text-xs text-gray-400">${isAr?'المشتري هيكتب القيمة دي بنفسه وقت الطلب':'The buyer will type this value themselves at checkout'}</p>`}
                        </div>
                      </div>`;
                  }).join('')}
                </div>
              </div>`;
        },

        // ⚠️ ADDED: gallery photo picker — up to 5 extra photos shown on the
        // product's own detail view (separate from the single cover image
        // used everywhere else — cards, cart, checkout — for backward
        // compatibility with every other part of the app that expects one
        // image per listing).
        // Product: up to 5 photos (first = cover). Service: 1 photo. Several files can be picked at once.
        _maxPhotos() { return document.getElementById('svcTypeProduct')?.checked ? 5 : 1; },

        onPhotosChosen(input) {
            const isAr = AppState.language !== 'en';
            const max = this._maxPhotos();
            const all = Array.from(input.files || []);
            input.value = '';                                   // allow picking the same file again later
            const files = all.filter(f => f.type && f.type.startsWith('image/'));
            if (files.length < all.length) showToast(isAr ? 'تم تجاهل ملفات مش صور' : 'Non-image files were ignored', 'warning');
            if (!files.length) return;
            if (max === 1) {
                _photos = [{ kind: 'new', file: files[0] }];
            } else {
                const room = max - _photos.length;
                if (room <= 0) { showToast(isAr ? `الحد الأقصى ${max} صور — احذف صورة الأول` : `Maximum ${max} photos — remove one first`, 'warning'); return; }
                if (files.length > room) showToast(isAr ? `الحد الأقصى ${max} صور — تمت إضافة ${room} فقط` : `Maximum ${max} photos — only ${room} added`, 'warning');
                files.slice(0, room).forEach(f => _photos.push({ kind: 'new', file: f }));
            }
            this._renderPhotos();
        },

        removePhoto(index) { _photos.splice(index, 1); this._renderPhotos(); },

        makeCoverPhoto(index) { const [p] = _photos.splice(index, 1); if (p) _photos.unshift(p); this._renderPhotos(); },

        _renderPhotos() {
            const container = document.getElementById('svcPhotoPreview');
            if (!container) return;
            const isAr = AppState.language !== 'en';
            const max = this._maxPhotos();
            container.innerHTML = _photos.map((p, i) => {
                if (p.kind === 'new' && !p.preview) p.preview = URL.createObjectURL(p.file);
                const src = p.kind === 'new' ? p.preview : p.url;
                const unused = i >= max;                         // a service only uses its first photo
                return `
                <div class="relative ${unused ? 'opacity-40' : ''}">
                  <img src="${escapeHtml(src)}" class="w-full h-20 object-cover rounded-lg border-2 ${i === 0 ? 'border-turquoise-500' : 'border-gray-200'}">
                  ${i === 0 ? `<span class="absolute bottom-1 start-1 text-[10px] font-black bg-turquoise-600 text-white px-1.5 py-0.5 rounded">${isAr ? 'الغلاف' : 'Cover'}</span>`
                            : `<button type="button" onclick="ServicesManager.makeCoverPhoto(${i})" title="${isAr ? 'اجعلها الغلاف' : 'Make cover'}" class="absolute bottom-1 start-1 text-[10px] font-bold bg-black/60 text-white px-1.5 py-0.5 rounded">★</button>`}
                  <button type="button" onclick="ServicesManager.removePhoto(${i})" class="absolute -top-1.5 -end-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">×</button>
                </div>`;
            }).join('');
            const hint = document.getElementById('svcPhotoHint');
            if (hint) hint.textContent = max === 1
                ? (isAr ? 'انقر لاختيار صورة الخدمة' : 'Click to choose the listing photo')
                : (isAr ? 'انقر لاختيار حتى 5 صور مرة واحدة — أول صورة هي الغلاف' : 'Click to choose up to 5 photos at once — the first is the cover');
            const cnt = document.getElementById('svcPhotoCount');
            if (cnt) cnt.textContent = `(${Math.min(_photos.length, max)}/${max})`;
        },

        async saveService(editId = '') {
            const user = AppState.currentUser;
            if (!user) return;

            const title       = sanitizeInput(document.getElementById('svcTitle')?.value?.trim() || '');
            const description = sanitizeInput(document.getElementById('svcDesc')?.value?.trim() || '', 2000);
            const category    = document.getElementById('svcCategory')?.value || 'other';
            const price       = parseFloat(document.getElementById('svcPrice')?.value) || 0;
            const listingType = document.getElementById('svcTypeProduct')?.checked ? 'product' : 'service';
            const orderMode   = document.getElementById('svcOrderModeInstant')?.checked ? 'instant' : 'request_first';
            const deliveryDays= parseInt(document.getElementById('svcDelivery')?.value) || 3;
            const revisions   = parseInt(document.getElementById('svcRevisions')?.value) || 2;
            const recurring   = document.getElementById('svcRecurring')?.checked || false;
            // ⚠️ ADDED: optional stock/expiry limits for products — empty means unlimited/no-expiry
            const stockLimitRaw = document.getElementById('svcStockLimit')?.value;
            const stockLimit    = stockLimitRaw === '' || stockLimitRaw == null ? null : Math.max(0, parseInt(stockLimitRaw) || 0);
            const expiryDateRaw = document.getElementById('svcExpiryDate')?.value;
            const expiryDate    = expiryDateRaw ? expiryDateRaw : null; // 'YYYY-MM-DD' or null

            if (!title)     { showToast(AppState.language==='en'?'Enter a title':'أدخل عنوان الإعلان', 'warning'); return; }
            if (!description){ showToast(AppState.language==='en'?'Enter a description':'أدخل الوصف', 'warning'); return; }
            if (price < 5)  { showToast(AppState.language==='en'?'Min price is 5 EGP':'الحد الأدنى للسعر 5 ج.م', 'warning'); return; }
            // Dropship listings: the supplier's wholesale price + minimum margin is a hard floor (also enforced by firestore.rules).
            const _editing = editId ? (AppState._editingListing || null) : null;
            if (_editing && _editing.dropship && price < (Number(_editing.dropshipFloorPrice) || 0)) {
                showToast(AppState.language==='en' ? `Minimum selling price for this supplier product is ${_editing.dropshipFloorPrice}` : `أقل سعر بيع لمنتج المورد ده ${_editing.dropshipFloorPrice} ج.م`, 'warning'); return;
            }

            // ⚠️ CHANGED: only digital-category products require an instant
            // delivery link/file now. Other product categories are physical
            // goods shipped to the buyer's address collected at checkout
            // (see request-system.js submitProductOrder) — they don't need
            // this at all, and were never using it correctly before.
            let digitalDelivery = null;
            if (listingType === 'product' && category === 'digital') {
                const link       = document.getElementById('svcDeliveryLink')?.value?.trim();
                const deliveryFile = document.getElementById('svcDeliveryFile')?.files[0];
                const existingFile = document.getElementById('svcDeliveryExisting')?.value?.trim();
                const notes      = sanitizeInput(document.getElementById('svcDeliveryNotes')?.value?.trim() || '', 500);
                if (!link && !deliveryFile && !existingFile) {
                    showToast(AppState.language==='en' ? 'Add a delivery link or upload a file' : 'ضيف رابط تسليم أو ارفع ملف', 'warning');
                    return;
                }
                digitalDelivery = link
                    ? { type: 'link', value: link, notes }
                    : { type: 'file', value: existingFile || '', notes }; // value filled in after upload below if a new file was chosen
            }

            // ⚠️ ADDED: block publishing a listing that leaks a phone number,
            // email, or off-platform contact/payment mention — this used to
            // only be checked inside the order chat, so a seller could just
            // put their WhatsApp number straight in the listing description
            // and never touch the chat filter at all. See constants.js.
            {
                const orderRulesText = document.getElementById('svcOrderRules')?.value?.trim() || '';
                const deliveryNotesText = document.getElementById('svcDeliveryNotes')?.value?.trim() || '';
                const leakKind = window.scanFieldsForContactLeak([title, description, orderRulesText, deliveryNotesText]);
                if (leakKind) {
                    window.flagSuspiciousContent({ userId: user.uid, source: 'listing', listingId: editId || null }, `${title} | ${description}`, leakKind);
                    showToast(window.contactLeakWarning(AppState.language !== 'en'), 'error');
                    return;
                }
            }

            // Photos are stored inside the listing document itself (Firestore hard limit: 1 MiB), so all of them
            // must fit one shared budget. Already-saved photos keep their size; new ones are compressed to fit.
            const chosenPhotos = _photos.slice(0, listingType === 'product' ? 5 : 1);
            const PHOTO_BUDGET = 880000;
            const keptChars = chosenPhotos.filter(p => p.kind === 'existing').reduce((n, p) => n + String(p.url || '').length, 0);
            const newPhotos = chosenPhotos.filter(p => p.kind === 'new').length;
            const perNewPhoto = newPhotos ? Math.floor((PHOTO_BUDGET - keptChars) / newPhotos) : 0;
            if (keptChars > PHOTO_BUDGET || (newPhotos && perNewPhoto < 45000)) {
                showToast(AppState.language==='en' ? 'Photos are too large together — remove one or use smaller photos' : 'حجم الصور كبير — احذف صورة أو استخدم صور أصغر', 'warning');
                return;
            }

            showLoading(AppState.language==='en'?'Publishing...':'جاري النشر...');
            try {
                // Upload new photos IN ORDER and keep saved ones as they are → the first one is the cover.
                const photoUrls = [];
                for (let i = 0; i < chosenPhotos.length; i++) {
                    const p = chosenPhotos[i];
                    photoUrls.push(p.kind === 'existing' ? p.url
                        : await uploadFile(p.file, 'services', `svc_${user.uid}_${Date.now()}_${i}`, { maxPx: 900, maxLen: Math.min(perNewPhoto, 330000) }));
                }
                const imageUrl = photoUrls[0] || '';

                if (listingType === 'product' && digitalDelivery?.type === 'file') {
                    const deliveryFile = document.getElementById('svcDeliveryFile')?.files[0];
                    if (deliveryFile) {
                        digitalDelivery.value = await uploadFile(deliveryFile, 'product-deliveries', `del_${user.uid}_${Date.now()}`);
                    }
                }

                // Content fields — safe to overwrite on every save (create or edit)
                const data = {
                    title, description, category, listingType,
                    price, deliveryDays, revisions, recurring,
                    image:         imageUrl,
                    sellerName:    user.displayName || '',
                    sellerAvatar:  user.photoURL || '',
                    updatedAt:     serverTimestamp(),
                };
                // 🔒 FIX (this is why "تعديل الإعلان" failed with a permission error): sellerId / sellerVerified
                // used to be sent on EVERY save. firestore.rules only lets a seller change a fixed list of keys —
                // sellerVerified is not in it, so as soon as the account was verified (or the stored value differed)
                // the whole update was rejected. And on create the rules require sellerVerified == false, so a
                // verified seller couldn't even publish. Trust fields are now never sent from the browser.
                if (!editId) data.sellerId = user.uid;
                if (listingType === 'product') {
                    data.digitalDelivery = digitalDelivery;
                    if (!(_editing && _editing.dropship)) data.stockLimit = stockLimit;   // null = unlimited — dropship stock belongs to the supplier (kept in sync by the server)
                    data.expiryDate = expiryDate;   // null = no expiry
                    { const ss = document.getElementById('svcStoreId'); if (ss && ss.value) data.storeId = ss.value; }
                    if (category !== 'digital') {
                        const fee = Math.max(0, Math.min(2000, parseFloat(document.getElementById('svcShippingFee')?.value) || 0));
                        data.shippingFee  = Math.round(fee * 100) / 100;
                        data.shippingMode = document.querySelector('input[name=svcShippingMode]:checked')?.value === 'cod' ? 'cod' : 'online';
                    } else { data.shippingFee = 0; data.shippingMode = 'online'; }
                    data.orderRules = sanitizeInput(document.getElementById('svcOrderRules')?.value?.trim() || '', 1000);
                    data.images = photoUrls.slice(1, 5);   // extras only — the cover lives in `image` (the detail view shows image + images)
                    // ⚠️ ADDED: read the enabled suggested-field toggles into a
                    // structured list the buyer's order form can render as real
                    // dropdowns/inputs (see request-system.js openProductOrderModal).
                    data.structuredFields = Array.from(document.querySelectorAll('.field-tpl-toggle'))
                        .filter(cb => cb.checked)
                        .map(cb => {
                            const key = cb.dataset.key, type = cb.dataset.type, label = cb.dataset.label;
                            if (type === 'select') {
                                const raw = document.querySelector(`.field-tpl-options[data-key="${key}"]`)?.value || '';
                                const options = raw.split(',').map(s => s.trim()).filter(Boolean);
                                return { key, label, type, options };
                            }
                            return { key, label, type, options: [] };
                        });
                    // ⚠️ ADDED: generic custom attribute rows — same shape as
                    // the template-based fields above, so the checkout form
                    // (request-system.js) renders them identically either way.
                    Array.from(document.querySelectorAll('.custom-field-row')).forEach(row => {
                        const label = row.querySelector('.custom-field-label')?.value?.trim();
                        if (!label) return;
                        const rawOpts = row.querySelector('.custom-field-options')?.value?.trim() || '';
                        const options = rawOpts.split(',').map(s => s.trim()).filter(Boolean);
                        data.structuredFields.push({
                            key: row.dataset.key,
                            label: sanitizeInput(label, 60),
                            type: options.length ? 'select' : 'text',
                            options,
                        });
                    });
                } else {
                    data.orderMode = orderMode;      // 'request_first' | 'instant'
                }

                if (editId) {
                    // 🔒 FIX: editing used to also send rating:0, reviewCount:0,
                    // orderCount:0, ordersCount:0, views:0, featured:false —
                    // which WIPED a seller's real accumulated stats back to zero
                    // on every single edit (even a typo fix). Those fields are
                    // server/trust data now — never touched here.
                    await window.db.collection(COLLECTIONS.SERVICES).doc(editId).update(data);
                } else {
                    data.sellerVerified = false;     // rules require the neutral default on create; admin/server sets it later
                    data.active        = true;
                    data.status        = 'active';   // ← required by SellerDash
                    data.featured      = false;
                    data.rating        = 0;
                    data.reviewCount   = 0;
                    data.orderCount    = 0;
                    data.ordersCount   = 0;           // ← SellerDash reads this field
                    data.views         = 0;           // ← SellerDash reads this field
                    data.createdAt     = serverTimestamp();
                    await window.db.collection(COLLECTIONS.SERVICES).add(data);
                }

                // ⚠️ ADDED: category-suggestion → admin review queue. Doesn't
                // block or delay publishing the listing itself (it still goes
                // live under "Other" immediately) — this just flags that the
                // seller thinks a dedicated category is missing.
                const categorySuggestion = category === 'other' ? document.getElementById('svcCategorySuggestion')?.value?.trim() : '';
                if (categorySuggestion) {
                    try {
                        await window.db.collection(COLLECTIONS.CATEGORY_REQUESTS).add({
                            name: sanitizeInput(categorySuggestion, 60),
                            listingType,
                            requestedBy: user.uid,
                            requestedByName: user.displayName || user.email || '',
                            status: 'pending',
                            createdAt: serverTimestamp(),
                        });
                    } catch (_) { /* non-critical — never blocks publishing */ }
                }

                hideLoading();
                showToast(editId ? (AppState.language==='en'?'Changes saved!':'تم حفظ التعديلات!') : (AppState.language==='en'?'Service published!':'تم نشر الخدمة!'), 'success');
                navigateTo('dashboard');
            } catch (err) {
                hideLoading();
                showToast(t('general.error') + ': ' + err.message, 'error');
            }
        },

        // ── Delete Service ────────────────────────────────────────────────────
        async deleteService(serviceId) {
            const isAr  = AppState.language !== 'en';
            const user  = AppState.currentUser;

            if (!user) {
                showToast(isAr ? 'يجب تسجيل الدخول أولاً' : 'Please log in first', 'error');
                return;
            }

            if (!confirm(isAr
                ? 'هل أنت متأكد من حذف هذه الخدمة نهائياً؟ لا يمكن التراجع.'
                : 'Permanently delete this service? This cannot be undone.')) return;

            showLoading(isAr ? 'جاري الحذف...' : 'Deleting...');
            try {
                const ref  = window.db.collection(COLLECTIONS.SERVICES).doc(serviceId);
                const snap = await ref.get();

                // Verify the service exists
                if (!snap.exists) {
                    hideLoading();
                    showToast(isAr ? 'الخدمة غير موجودة' : 'Service not found', 'error');
                    return;
                }

                // Verify ownership (extra safety before Firestore rule fires)
                const data = snap.data();
                if (data.sellerId !== user.uid && AppState.currentUser && AppState.currentUser.role !== 'admin') {
                    hideLoading();
                    showToast(isAr ? 'غير مصرح لك بحذف هذه الخدمة' : 'Not authorized to delete this service', 'error');
                    return;
                }

                await ref.delete();
                hideLoading();
                showToast(isAr ? '✅ تم حذف الخدمة بنجاح' : '✅ Service deleted successfully', 'success');

                // Remove card from DOM immediately without waiting for re-fetch
                const card = document.querySelector(`[data-service-id="${serviceId}"]`);
                if (card) {
                    card.style.transition = 'opacity .25s';
                    card.style.opacity    = '0';
                    setTimeout(() => card.remove(), 250);
                }

                // Refresh the correct panel — FIX: use window.DashboardManager (different IIFE scope)
                const isAdminCtx = !!document.getElementById('adminTabContent');
                if (isAdminCtx && typeof window.adminTab === 'function') {
                    window.adminTab('services');
                } else if (window.SellerDash) {
                    setTimeout(() => window.SellerDash.tab('my-services'), 300);
                } else if (typeof window.DashboardManager?.loadSellerServices === 'function') {
                    setTimeout(() => window.DashboardManager.loadSellerServices(), 300);
                }
            } catch (err) {
                hideLoading();
                console.error('[Delete Service]', err.code, err.message);
                const msg = err.code === 'permission-denied'
                    ? (isAr ? 'خطأ في الصلاحيات — تأكد من نشر قواعد Firestore' : 'Permission denied — make sure Firestore rules are published')
                    : err.message;
                showToast((isAr ? 'خطأ في الحذف: ' : 'Delete error: ') + msg, 'error');
            }
        },

        // ── Init services page ────────────────────────────────────────────────
        // ⚠️ FIXED: _activeType/_activeCat are module-level state that used to
        // survive across page navigations — leaving the services page while on
        // "منتجات" and coming back later would silently keep filtering by
        // product even though the tab bar visually shows "الكل". Reset both
        // on every fresh visit unless the caller explicitly passed a filter
        // via AppState.filterType/filterCategory (handled right below).
        initServicesPage() {
            // ⚠️ FIXED (race): the starting type/category (from the top-nav
            // "الخدمات"/"المنتجات" links, the hero search, or a home category
            // card) used to be applied by two setTimeout()s 200ms after an
            // un-awaited loadServices() fired. If the fetch was slower than
            // that, the tab was applied to an empty list and the fetch result
            // then rendered unfiltered over it. Everything is now set up
            // synchronously first — and the type BEFORE the category, because
            // switching type resets the category — so the load's own render
            // (which goes through _applyFilters) already honours it.
            const startType  = AppState.filterType     || '';
            const startCat   = AppState.filterCategory || '';
            const startQuery = (AppState.searchQuery   || '').trim();
            AppState.filterType = ''; AppState.filterCategory = ''; AppState.searchQuery = '';

            _activeType = ''; _activeCat = ''; _searchQuery = startQuery.toLowerCase(); _sortBy = 'newest';
            const searchEl = document.getElementById('servicesSearch');
            if (searchEl) searchEl.value = startQuery;
            const sortEl = document.getElementById('servicesSort');
            if (sortEl) sortEl.value = 'newest';

            this._setActiveType(startType);
            if (startCat) this._setActiveCat(startCat);

            this.loadServices();
        },

        // ── Init add-service page ─────────────────────────────────────────────
        initAddServicePage() {
            const user = AppState.currentUser;
            const isAr = AppState.language !== 'en';
            if (!user) { navigateTo('login'); return; }
            if (!['seller','admin'].includes(user.role)) {
                const c = document.getElementById('addServiceContent');
                if (c) c.innerHTML = `
                <div class="text-center py-16">
                  <i class="fa-solid fa-lock text-gray-300 text-5xl mb-4"></i>
                  <h3 class="text-xl font-black text-gray-500 mb-3">${isAr?'يجب أن تكون بائعاً':'Seller Account Required'}</h3>
                  <button onclick="AuthManager.upgradeToSeller()" class="btn-primary px-8">
                    <i class="fa-solid fa-rocket me-2"></i>${isAr?'الترقية لبائع':'Upgrade to Seller'}
                  </button>
                </div>`;
                return;
            }
            // ⚠️ FIXED: navigateTo() calls this on EVERY navigation to
            // 'add-service' (it's the generic "page init" hook — see
            // constants.js navigateTo, which runs init<Page>Page()
            // automatically). This used to unconditionally call
            // _renderAddServiceForm() with no arguments, which reset the
            // form to a blank "Add New" state — including right after an
            // Edit button had just rendered it WITH the listing's data, since
            // every edit button called `_renderAddServiceForm(editData);
            // navigateTo('add-service')` and that second call silently wiped
            // out the first. Edit buttons now go through
            // navigateTo('add-service', service) instead (see
            // js/seller-dashboard.js, js/dashboard.js, js/services.js), which
            // stores the listing in AppState.pageData for exactly this
            // moment — read it once here, then clear it so a later plain
            // "Add Product/Service" click doesn't accidentally reopen it
            // pre-filled with someone's old edit.
            const editingService = AppState.pageData;
            AppState.pageData = null;
            AppState._editingListing = null;
            if (!editingService) { this._renderAddServiceForm(null); return; }

            // ⚠️ FIXED: the edit buttons pass only a handful of fields (no photos, stock, expiry, order rules,
            // custom attributes…), so the form used to open half-empty and saving it wiped those values. Load
            // the real, complete document by id; fall back to what was passed only if the read fails.
            const c = document.getElementById('addServiceContent');
            if (c) c.innerHTML = `<div class="text-center py-16"><i class="fa-solid fa-spinner fa-spin text-navy-500 text-3xl"></i></div>`;
            (async () => {
                let full = editingService;
                try {
                    if (editingService.id) {
                        const snap = await window.db.collection(COLLECTIONS.SERVICES).doc(editingService.id).get();
                        if (snap.exists) full = { id: snap.id, ...snap.data() };
                    }
                } catch (e) { console.warn('[Edit] could not load full listing, using partial data:', e.message); }
                if (full.sellerId && full.sellerId !== user.uid && user.role !== 'admin') {
                    showToast(isAr ? 'مش مسموح لك تعدل الإعلان ده' : 'You cannot edit this listing', 'error');
                    navigateTo('dashboard'); return;
                }
                AppState._editingListing = full;
                this._renderAddServiceForm(full);
                if (full.dropship) {
                    const stockEl = document.getElementById('svcStockLimit');
                    if (stockEl) { stockEl.value = full.stockLimit ?? ''; stockEl.disabled = true; stockEl.title = isAr ? 'المخزون يتحدد من المورد' : 'Stock is managed by the supplier'; }
                    const priceEl = document.getElementById('svcPrice');
                    if (priceEl && full.dropshipFloorPrice) priceEl.min = full.dropshipFloorPrice;
                }
            })();
        }
    };

    // ── Load more ─────────────────────────────────────────────────────────────
    function loadMoreServices() {
        ServicesManager.loadServices(false);
    }

    // ── Expose ────────────────────────────────────────────────────────────────
    window.ServicesManager  = ServicesManager;
    window.loadMoreServices = loadMoreServices;

    // Add load-more button to services page
    document.addEventListener('DOMContentLoaded', () => {
        const grid = document.getElementById('servicesGrid');
        if (grid) {
            const btn = document.createElement('div');
            btn.className = 'col-span-full text-center mt-8';
            btn.innerHTML = `<button id="loadMoreBtn" onclick="loadMoreServices()" class="btn-secondary px-10 py-3 hidden">
              ${AppState.language==='en'?'Load More':'تحميل المزيد'}
            </button>`;
            grid.parentNode?.appendChild(btn);
        }
    });

    // Override initServicesPage
    window.initServicesPage    = () => ServicesManager.initServicesPage();
    window.initAddServicePage  = () => ServicesManager.initAddServicePage();
    window.initDigitalProductsPage = () => ServicesManager.initDigitalProductsPage(); // ⚠️ ADDED
    window.searchDigitalProducts   = (q) => ServicesManager.searchDigitalProducts(q); // ⚠️ ADDED

    console.log('✅ ServicesManager v3.0 loaded');
})();
