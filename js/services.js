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
    let _pendingGalleryFiles = []; // new gallery photos chosen but not yet uploaded
    let _keptExistingGallery = [];  // existing gallery URLs kept when editing (minus any removed)
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

        // ── Load All Services ─────────────────────────────────────────────────
        async loadServices(reset = true) {
            if (_loading) return;
            _loading = true;

            if (reset) { _allServices = []; _filtered = []; _lastDoc = null; }

            try {
                let query = window.db.collection(COLLECTIONS.SERVICES)
                    .where('active', '==', true)
                    .orderBy('createdAt', 'desc')
                    .limit(PAGE_SIZE);

                if (_lastDoc && !reset) query = query.startAfter(_lastDoc);

                const snap = await query.get();
                _lastDoc   = snap.docs[snap.docs.length - 1] || null;

                const newServices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                _allServices = reset ? newServices : [..._allServices, ...newServices];
                _filtered    = [..._allServices];

                this._renderServiceCards(_filtered);

                // Load more button
                const loadMoreBtn = document.getElementById('loadMoreBtn');
                if (loadMoreBtn) loadMoreBtn.classList.toggle('hidden', snap.docs.length < PAGE_SIZE);

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
        },

        async _loadFallback() {
            try {
                const snap = await window.db.collection(COLLECTIONS.SERVICES)
                    .where('active', '==', true).limit(PAGE_SIZE).get();
                _allServices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                _filtered    = [..._allServices];
                this._renderServiceCards(_filtered);
            } catch (err) {
                console.warn('[Services] Fallback error:', err.message);
            }
        },

        // ── Search ────────────────────────────────────────────────────────────
        search(query) {
            const q = (query || '').trim().toLowerCase();
            if (!q) {
                _filtered = [..._allServices];
            } else {
                _filtered = _allServices.filter(s =>
                    (s.title || '').toLowerCase().includes(q) ||
                    (s.description || '').toLowerCase().includes(q) ||
                    (s.sellerName || '').toLowerCase().includes(q) ||
                    (s.category || '').toLowerCase().includes(q) ||
                    (s.tags || []).some(t => t.toLowerCase().includes(q))
                );
            }
            this._renderServiceCards(_filtered);
        },

        // ── Filter by Category ────────────────────────────────────────────────
        filterCategory(cat) {
            _activeCat = cat;
            // Update UI
            document.querySelectorAll('.cat-btn').forEach(btn => {
                const isActive = btn.dataset.cat === cat;
                btn.classList.toggle('bg-navy-600', isActive);
                btn.classList.toggle('text-white', isActive);
                btn.classList.toggle('bg-white', !isActive);
                btn.classList.toggle('text-gray-600', !isActive);
                btn.classList.toggle('border-gray-200', !isActive);
            });
            this._applyFilters();
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
            const list = type === 'product' ? _getProductCategories() : _getServiceCategories();
            container.innerHTML = allBtn + list.map(c => `
                <button onclick="ServicesManager.filterCategory('${c.value}')" data-cat="${c.value}"
                  class="cat-btn flex-shrink-0 px-4 py-2 bg-white text-gray-600 border border-gray-200 rounded-xl text-sm font-bold hover:border-navy-400 transition">
                  <i class="fa-solid ${c.icon} me-1.5"></i>${c.label}
                </button>`).join('');
        },

        // ⚠️ ADDED: خدمات (custom request flow) vs منتجات (instant buy) — '' = both
        filterType(type) {
            _activeType = type;
            _activeCat  = '';
            document.querySelectorAll('.type-tab-btn').forEach(btn => {
                const isActive = btn.dataset.type === type;
                btn.classList.toggle('bg-navy-800', isActive);
                btn.classList.toggle('text-white', isActive);
                btn.classList.toggle('bg-gray-100', !isActive);
                btn.classList.toggle('text-gray-600', !isActive);
            });
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
            this._applyFilters();
        },

        // ── Toggle Express Delivery Hub (services deliverable in ≤1 day) ──────
        toggleExpress() {
            _expressOnly = !_expressOnly;
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
            let list = !_activeCat ? [..._allServices] : _allServices.filter(s => s.category === _activeCat);
            if (_activeType) list = list.filter(s => (s.listingType || 'service') === _activeType);
            if (_expressOnly) list = list.filter(s => (Number(s.deliveryDays) || 3) <= 1);
            _filtered = list;
            this._renderServiceCards(_filtered);
        },

        // ── Sort ──────────────────────────────────────────────────────────────
        sort(by) {
            switch (by) {
                case 'price_asc':  _filtered.sort((a,b) => (a.price||0)  - (b.price||0));   break;
                case 'price_desc': _filtered.sort((a,b) => (b.price||0)  - (a.price||0));   break;
                case 'rating':     _filtered.sort((a,b) => (b.rating||0) - (a.rating||0));  break;
                case 'quality':    _filtered.sort((a,b) => (b.qualityScore||0) - (a.qualityScore||0)); break;
                default:           _filtered.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
            }
            this._renderServiceCards(_filtered);
        },

        // ── Render Cards ──────────────────────────────────────────────────────
        _renderServiceCards(services) {
            const grid  = document.getElementById('servicesGrid');
            const empty = document.getElementById('servicesEmpty');
            if (!grid) return;

            if (!services || services.length === 0) {
                grid.innerHTML = '';
                if (empty) empty.classList.remove('hidden');
                return;
            }
            if (empty) empty.classList.add('hidden');

            const isAr = AppState.language !== 'en';
            grid.innerHTML = services.map(s => this._serviceCard(s, isAr)).join('');
        },

        _serviceCard(s, isAr) {
            const stars = Math.round(s.rating || 0);
            const price = formatCurrency(s.price || 0);
            return `
            <div class="service-card card group cursor-pointer" onclick="ServicesManager.openServiceDetail('${s.id}')">
              <!-- Thumbnail -->
              <div class="relative overflow-hidden">
                <img src="${s.image || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400'}"
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
                  ${s.listingType === 'product' ? `
                  <button onclick="event.stopPropagation();addToCart(${JSON.stringify({id:s.id,title:s.title||'',price:s.price||0,image:s.image||'',sellerId:s.sellerId||'',sellerName:s.sellerName||'',deliveryDays:s.deliveryDays||0}).replace(/"/g,'&quot;')})"
                    class="w-10 h-10 bg-turquoise-600 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition">
                    <i class="fa-solid fa-cart-plus text-white"></i>
                  </button>` : `
                  <button onclick="event.stopPropagation();${s.orderMode==='instant'?'RequestSystem.openInstantModal':'RequestSystem.openRequestModal'}(${JSON.stringify({id:s.id,title:s.title||'',price:s.price||0,image:s.image||'',sellerId:s.sellerId||'',sellerName:s.sellerName||'',deliveryDays:s.deliveryDays||3}).replace(/"/g,'&quot;')})"
                    class="w-10 h-10 ${s.orderMode==='instant'?'bg-secondary':'bg-navy-800'} rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition">
                    <i class="fa-solid ${s.orderMode==='instant'?'fa-lock':'fa-paper-plane'} text-white"></i>
                  </button>`}
                </div>
              </div>

              <!-- Body -->
              <div class="p-4">
                <!-- Seller -->
                <div class="flex items-center gap-2 mb-3">
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
                    var serviceDataStr = JSON.stringify({id:s.id,title:s.title||'',price:s.price||0,image:s.image||'',sellerId:s.sellerId||'',sellerName:s.sellerName||'',deliveryDays:s.deliveryDays||3}).replace(/"/g,'&quot;');
                    var cartDataStr = JSON.stringify({id:s.id,title:s.title||'',price:s.price||0,image:s.image||'',sellerId:s.sellerId||'',sellerName:s.sellerName||''}).replace(/"/g,'&quot;');
                    var lang = AppState.language;
                    if (isOwnService || isAdm) {
                      return '<button onclick="event.stopPropagation();ServicesManager.deleteService(\'' + s.id + '\')" class="flex-1 bg-red-50 border-2 border-red-200 text-red-600 rounded-xl py-2.5 text-sm font-bold hover:bg-red-600 hover:text-white transition flex items-center justify-center gap-1"><i class=\"fa-solid fa-trash text-xs\"></i>' + (lang !== 'en' ? 'حذف الإعلان' : 'Delete') + '</button>'
                           + '<button onclick="event.stopPropagation();ServicesManager._renderAddServiceForm(' + editDataStr + ');navigateTo(\'add-service\')" class="w-10 h-10 flex-shrink-0 border-2 border-gray-200 text-gray-600 rounded-xl flex items-center justify-center hover:bg-gray-100 transition"><i class=\"fa-solid fa-pen text-xs\"></i></button>';
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
                      <!-- Cover image -->
                      <div class="relative">
                        <img id="serviceDetailMainImg" src="${s.image || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800'}"
                          class="w-full h-72 object-cover"
                          onerror="this.src='https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800'">
                        <button onclick="closeModal('serviceModal')"
                          class="absolute top-4 end-4 w-10 h-10 bg-black/50 backdrop-blur-sm text-white rounded-xl flex items-center justify-center hover:bg-black/70 transition">
                          <i class="fa-solid fa-xmark text-lg"></i>
                        </button>
                      </div>
                      <!-- ⚠️ ADDED: gallery thumbnails — clicking one swaps the
                           cover image above so buyers can browse extra angles
                           before ordering (products only; see svcGalleryFiles
                           in the add-listing form). -->
                      ${Array.isArray(s.images) && s.images.length ? `
                      <div class="flex gap-2 p-3 bg-gray-50 overflow-x-auto">
                        <img src="${s.image || ''}" onclick="document.getElementById('serviceDetailMainImg').src=this.src"
                          class="w-16 h-16 object-cover rounded-lg border-2 border-navy-500 cursor-pointer flex-shrink-0">
                        ${s.images.map(url => `
                          <img src="${url}" onclick="document.getElementById('serviceDetailMainImg').src=this.src"
                            class="w-16 h-16 object-cover rounded-lg border-2 border-transparent hover:border-navy-400 cursor-pointer flex-shrink-0">
                        `).join('')}
                      </div>` : ''}

                      <div class="p-6 space-y-5">
                        <!-- Title & Category -->
                        <div>
                          <span class="text-xs bg-navy-50 text-navy-600 font-bold px-3 py-1 rounded-full">${s.category || ''}</span>
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
                            <p class="font-black text-gray-900 text-sm">${(s.rating || 5).toFixed(1)}</p>
                          </div>
                        </div>

                        <!-- Price & Actions -->
                        <div class="bg-gradient-to-r from-navy-600 to-navy-800 rounded-2xl p-5 text-white">
                          <div class="flex items-center justify-between mb-4">
                            <div>
                              <p class="text-navy-200 text-sm">${isAr ? 'السعر الإجمالي' : 'Total Price'}</p>
                              <p class="text-3xl font-black" data-price-egp="${s.price||0}">${formatCurrency(s.price || 0)}</p>
                            </div>
                            <div class="bg-white/15 rounded-xl px-3 py-2 text-sm font-bold">
                              ${isAr ? 'مدفوع بأمان عبر Escrow' : 'Secured by Escrow'}
                            </div>
                          </div>
                          <div class="flex gap-3">
                            ${s.listingType === 'product' ? `
                            <button onclick="addToCart(${JSON.stringify({id:s.id,title:s.title||'',price:s.price||0,image:s.image||'',sellerId:s.sellerId||'',sellerName:s.sellerName||'',deliveryDays:s.deliveryDays||0}).replace(/"/g,'&quot;')})"
                              class="flex-1 bg-white text-navy-700 font-black py-3.5 rounded-xl hover:bg-navy-50 transition flex items-center justify-center gap-2">
                              <i class="fa-solid fa-cart-plus"></i>${AppState.language === 'en' ? 'Add to Cart' : 'أضف للسلة'}
                            </button>
                            <button onclick="closeModal('serviceModal');RequestSystem.openProductOrderModal(${JSON.stringify({id:s.id,title:s.title||'',price:s.price||0,image:s.image||'',sellerId:s.sellerId||'',sellerName:s.sellerName||'',deliveryDays:s.deliveryDays||0,orderRules:s.orderRules||'',structuredFields:s.structuredFields||[]}).replace(/"/g,'&quot;')})"
                              class="flex-1 bg-turquoise-600 text-white font-black py-3.5 rounded-xl hover:bg-turquoise-700 transition flex items-center justify-center gap-2">
                              <i class="fa-solid fa-bolt"></i>${AppState.language === 'en' ? 'Buy Now' : 'اشترِ فورًا'}
                            </button>` : s.orderMode === 'instant' ? `
                            <button onclick="closeModal('serviceModal');RequestSystem.openInstantModal(${JSON.stringify({id:s.id,title:s.title||'',price:s.price||0,image:s.image||'',sellerId:s.sellerId||'',sellerName:s.sellerName||'',deliveryDays:s.deliveryDays||3}).replace(/"/g,'&quot;')})"
                              class="flex-1 bg-white text-navy-700 font-black py-3.5 rounded-xl hover:bg-navy-50 transition flex items-center justify-center gap-2">
                              <i class="fa-solid fa-lock"></i>${AppState.language === 'en' ? 'Pay & Request' : 'اطلب وادفع الآن'}
                            </button>` : `
                            <button onclick="closeModal('serviceModal');RequestSystem.openRequestModal(${JSON.stringify({id:s.id,title:s.title||'',price:s.price||0,image:s.image||'',sellerId:s.sellerId||'',sellerName:s.sellerName||'',deliveryDays:s.deliveryDays||3}).replace(/"/g,'&quot;')})"
                              class="flex-1 bg-white text-navy-700 font-black py-3.5 rounded-xl hover:bg-navy-50 transition flex items-center justify-center gap-2">
                              <i class="fa-solid fa-paper-plane"></i>${AppState.language === 'en' ? 'Request Service' : 'طلب الخدمة'}
                            </button>`}
                          </div>
                        </div>
                      </div>
                    </div>`;
                    openModal('serviceModal');
                }
                hideLoading();

                // Load reviews
                this._loadServiceReviews(serviceId);
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

        _renderAddServiceForm(service = null, defaultType) {
            const container = document.getElementById('addServiceContent');
            if (!container) return;
            const isAr  = AppState.language !== 'en';
            const isEdit = !!service;
            const wantsProduct = service ? service.listingType === 'product' : defaultType === 'product';

            // Reset per-form-open state (gallery photos, structured fields),
            // then pre-load from the existing listing when editing.
            _pendingGalleryFiles = [];
            _keptExistingGallery = isEdit ? [...(service.images || [])] : [];
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
                      <select id="svcCategory" class="form-input" onchange="ServicesManager.refreshFieldTemplates()">
                        ${(wantsProduct ? productCategories : categories).map(c => `<option value="${c.value}" ${service?.category===c.value?'selected':''}>${c.label}</option>`).join('')}
                      </select>
                    </div>
                    <div>
                      <label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'السعر (ج.م)':'Price (EGP)'} *</label>
                      <input type="number" id="svcPrice" class="form-input" min="5" max="100000" step="0.5"
                        value="${service?.price||''}" placeholder="150">
                    </div>
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

                    <div>
                      <label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'شروطك وملاحظاتك على الطلب (اختياري)':"Your order rules/notes (optional)"}</label>
                      <textarea id="svcOrderRules" rows="3" class="form-input" maxlength="1000"
                        placeholder="${isAr?'مثال: لازم تحدد المقاس واللون في الملاحظات، مفيش استرجاع بعد فتح المنتج...':'e.g. must specify size/color, no returns after opening...'}">${escapeHtml(service?.orderRules||'')}</textarea>
                    </div>

                    <!-- ⚠️ ADDED: extra gallery photos — the cover image above
                         stays the single thumbnail used everywhere in the app
                         (cards, cart, etc.); these are additional angles shown
                         only inside the product's own detail view so buyers
                         can actually browse photos before ordering. -->
                    <div>
                      <label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'صور إضافية للمنتج (اختياري، حتى 5 صور)':'Additional product photos (optional, up to 5)'}</label>
                      <div class="border-2 border-dashed border-gray-200 rounded-2xl p-4 text-center hover:border-navy-400 transition cursor-pointer" onclick="document.getElementById('svcGalleryFiles').click()">
                        <i class="fa-solid fa-images text-2xl text-gray-300 mb-1"></i>
                        <p class="text-xs text-gray-400">${isAr?'انقر لاختيار صور إضافية':'Click to add more photos'}</p>
                        <input type="file" id="svcGalleryFiles" accept="image/*" multiple class="hidden" onchange="ServicesManager.onGalleryFilesChosen(this)">
                      </div>
                      <div id="svcGalleryPreview" class="grid grid-cols-5 gap-2 mt-3"></div>
                      <input type="hidden" id="svcExistingGallery" value="${escapeHtml(JSON.stringify(service?.images||[]))}">
                    </div>

                    <div class="bg-turquoise-50 border border-turquoise-200 rounded-2xl p-4">
                      <label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'رابط أو ملف التسليم الفوري':'Instant delivery link or file'} *</label>
                      <p class="text-xs text-gray-500 mb-3">${isAr?'ده اللي المشتري هيستلمه أوتوماتيك فور الدفع — رابط تحميل، أو ارفع الملف مباشرة.':"This is what the buyer receives automatically the moment they pay — a download link, or upload the file directly."}</p>
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
                    <label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'صورة الإعلان':'Listing Image'}</label>
                    <div class="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center hover:border-navy-400 transition cursor-pointer" onclick="document.getElementById('svcImageFile').click()">
                      <i id="uploadZoneText" class="fa-solid fa-cloud-arrow-up text-3xl text-gray-300 mb-2"></i>
                      <p class="text-sm text-gray-400">${isAr?'انقر لاختيار صورة أو اسحب وأفلت':'Click to upload or drag & drop'}</p>
                      <input type="file" id="svcImageFile" accept="image/*" class="hidden"
                        onchange="previewImage(this,'serviceImagePreview')">
                    </div>
                    <!-- hidden: stores existing image URL so saveService() can keep it when no new file chosen -->
                    <input type="hidden" id="svcExistingImage" value="${service?.image || ''}">
                    ${service?.image ? `<img src="${service.image}" class="image-upload-preview show mt-3" id="serviceImagePreview">` : '<img id="serviceImagePreview" class="image-upload-preview">'}
                  </div>

                </div>

                <button type="submit" class="btn-primary w-full py-5 text-lg">
                  <i class="fa-solid fa-plus me-2"></i>${isEdit ? (isAr?'حفظ التعديلات':'Save Changes') : (isAr?'نشر الإعلان':'Publish Listing')}
                </button>
              </form>
            </div>`;

            this.toggleListingType();
            this._renderGalleryPreview();
        },

        // Shows/hides the service-only vs product-only field groups based on
        // the selected radio — called on load and on every change.
        toggleListingType() {
            const isProduct = document.getElementById('svcTypeProduct')?.checked;
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
        },

        // ⚠️ ADDED: rebuilds the "suggested fields for this category" panel —
        // called on load (product listings) and whenever the category select
        // changes. Preserves the seller's on/off + edited options when
        // editing an existing listing that already has structuredFields, so
        // reopening the edit form doesn't reset their previous choices.
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
        onGalleryFilesChosen(input) {
            const isAr = AppState.language !== 'en';
            const files = Array.from(input.files || []);
            const totalAfter = _keptExistingGallery.length + _pendingGalleryFiles.length + files.length;
            if (totalAfter > 5) {
                showToast(isAr ? 'الحد الأقصى 5 صور في المعرض' : 'Maximum 5 gallery photos', 'warning');
                input.value = '';
                return;
            }
            _pendingGalleryFiles.push(...files);
            input.value = ''; // allow re-selecting the same file again later
            this._renderGalleryPreview();
        },

        removeGalleryImage(kind, index) {
            if (kind === 'existing') _keptExistingGallery.splice(index, 1);
            else _pendingGalleryFiles.splice(index, 1);
            this._renderGalleryPreview();
        },

        _renderGalleryPreview() {
            const container = document.getElementById('svcGalleryPreview');
            if (!container) return;
            const existingThumbs = _keptExistingGallery.map((url, i) => `
              <div class="relative">
                <img src="${url}" class="w-full h-16 object-cover rounded-lg border border-gray-200">
                <button type="button" onclick="ServicesManager.removeGalleryImage('existing',${i})"
                  class="absolute -top-1.5 -end-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">×</button>
              </div>`);
            const newThumbs = _pendingGalleryFiles.map((file, i) => `
              <div class="relative">
                <img src="${URL.createObjectURL(file)}" class="w-full h-16 object-cover rounded-lg border border-turquoise-300">
                <button type="button" onclick="ServicesManager.removeGalleryImage('new',${i})"
                  class="absolute -top-1.5 -end-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">×</button>
              </div>`);
            container.innerHTML = existingThumbs.concat(newThumbs).join('');
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
            const imageFile   = document.getElementById('svcImageFile')?.files[0];
            // ⚠️ ADDED: optional stock/expiry limits for products — empty means unlimited/no-expiry
            const stockLimitRaw = document.getElementById('svcStockLimit')?.value;
            const stockLimit    = stockLimitRaw === '' || stockLimitRaw == null ? null : Math.max(0, parseInt(stockLimitRaw) || 0);
            const expiryDateRaw = document.getElementById('svcExpiryDate')?.value;
            const expiryDate    = expiryDateRaw ? expiryDateRaw : null; // 'YYYY-MM-DD' or null

            if (!title)     { showToast(AppState.language==='en'?'Enter a title':'أدخل عنوان الإعلان', 'warning'); return; }
            if (!description){ showToast(AppState.language==='en'?'Enter a description':'أدخل الوصف', 'warning'); return; }
            if (price < 5)  { showToast(AppState.language==='en'?'Min price is 5 EGP':'الحد الأدنى للسعر 5 ج.م', 'warning'); return; }

            // ⚠️ ADDED: products must have SOMETHING to instantly deliver — a
            // link or an uploaded file — or a buyer would pay and get nothing.
            let digitalDelivery = null;
            if (listingType === 'product') {
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

            showLoading(AppState.language==='en'?'Publishing...':'جاري النشر...');
            try {
                let imageUrl = editId
                    ? (document.getElementById('svcExistingImage')?.value || AppState.currentService?.image || '')
                    : '';
                if (imageFile) {
                    imageUrl = await uploadFile(imageFile, 'services', `svc_${user.uid}_${Date.now()}`);
                }

                if (listingType === 'product' && digitalDelivery?.type === 'file') {
                    const deliveryFile = document.getElementById('svcDeliveryFile')?.files[0];
                    if (deliveryFile) {
                        digitalDelivery.value = await uploadFile(deliveryFile, 'product-deliveries', `del_${user.uid}_${Date.now()}`);
                    }
                }

                // ⚠️ ADDED: upload any newly-chosen gallery photos, then combine
                // with whatever existing gallery URLs the seller kept (removed
                // ones were already spliced out by removeGalleryImage()).
                let galleryUrls = [..._keptExistingGallery];
                if (listingType === 'product' && _pendingGalleryFiles.length) {
                    for (let i = 0; i < _pendingGalleryFiles.length; i++) {
                        const url = await uploadFile(_pendingGalleryFiles[i], 'services', `svc_${user.uid}_gallery_${Date.now()}_${i}`);
                        galleryUrls.push(url);
                    }
                }

                // Content fields — safe to overwrite on every save (create or edit)
                const data = {
                    title, description, category, listingType,
                    price, deliveryDays, revisions, recurring,
                    image:         imageUrl,
                    sellerId:      user.uid,
                    sellerName:    user.displayName || '',
                    sellerAvatar:  user.photoURL || '',
                    sellerVerified: user.verified || false,
                    updatedAt:     serverTimestamp(),
                };
                if (listingType === 'product') {
                    data.digitalDelivery = digitalDelivery;
                    data.stockLimit = stockLimit;   // null = unlimited
                    data.expiryDate = expiryDate;   // null = no expiry
                    data.orderRules = sanitizeInput(document.getElementById('svcOrderRules')?.value?.trim() || '', 1000);
                    data.images = galleryUrls.slice(0, 5);
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

                hideLoading();
                showToast(AppState.language==='en'?'Service published!':'تم نشر الخدمة!', 'success');
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
        initServicesPage() {
            this.loadServices();
            this._renderCategoryPills(_activeType);
            if (AppState.filterCategory) {
                setTimeout(() => {
                    this.filterCategory(AppState.filterCategory);
                    AppState.filterCategory = '';
                }, 200);
            }
            if (AppState.filterType) {
                setTimeout(() => {
                    this.filterType(AppState.filterType);
                    AppState.filterType = '';
                }, 200);
            }
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
            this._renderAddServiceForm();
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

    console.log('✅ ServicesManager v3.0 loaded');
})();
