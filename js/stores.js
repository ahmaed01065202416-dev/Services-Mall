/**
 * ============================================================================
 * STORES.JS — seller storefronts + paid "featured at the top" packages
 * ----------------------------------------------------------------------------
 * • A seller has ONE store (stores/{sellerUid}); every listing he publishes appears in it automatically.
 * • The admin defines packages (store_plans). A seller buys one (/api/stores → Fawaterak);
 *   while stores/{uid}.featuredUntil is in the future the store is shown at the TOP of the home page
 *   and of the stores page, ordered by the package rank.
 * ============================================================================
 */
(function () {
    'use strict';

    const COUNTRIES = [
        ['EG', 'مصر', 'Egypt'], ['SA', 'السعودية', 'Saudi Arabia'], ['AE', 'الإمارات', 'UAE'], ['KW', 'الكويت', 'Kuwait'],
        ['QA', 'قطر', 'Qatar'], ['BH', 'البحرين', 'Bahrain'], ['OM', 'عُمان', 'Oman'], ['JO', 'الأردن', 'Jordan'], ['OTHER', 'دولة أخرى', 'Other'],
    ];
    const isAr = () => AppState.language !== 'en';
    const esc = (v) => (window.escapeHtml ? window.escapeHtml(v) : String(v == null ? '' : v));
    const countryName = (c) => { const x = COUNTRIES.find(k => k[0] === c); return x ? (isAr() ? x[1] : x[2]) : ''; };
    const toMs = (ts) => { if (!ts) return 0; if (ts.toDate) return ts.toDate().getTime(); if (ts.seconds) return ts.seconds * 1000; const t = new Date(ts).getTime(); return isNaN(t) ? 0 : t; };
    const isFeatured = (s) => toMs(s.featuredUntil) > Date.now();
    const sortStores = (a, b) => (isFeatured(b) - isFeatured(a)) || ((b.planRank || 0) - (a.planRank || 0)) || String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    const fallbackLogo = (n) => `https://ui-avatars.com/api/?name=${encodeURIComponent(n || 'S')}&background=0f172a&color=fff&size=128`;

    async function api(body) {
        const token = window.auth && window.auth.currentUser ? await window.auth.currentUser.getIdToken() : '';
        const resp = await fetch('/api/stores', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify(body) });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || (isAr() ? 'تعذّر تنفيذ الطلب' : 'Request failed'));
        return data;
    }

    function storeCard(s) {
        const f = isFeatured(s);
        return `
        <button onclick="StoresManager.openStore('${esc(s.id)}')" class="text-start bg-white rounded-2xl border ${f ? 'border-amber-300 shadow-md' : 'border-gray-100 shadow-sm'} p-4 hover:shadow-lg transition relative w-full">
          ${f ? `<span class="absolute top-3 end-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[11px] font-black px-2.5 py-1 rounded-full"><i class="fa-solid fa-star"></i> ${isAr() ? 'متجر مميز' : 'Featured'}</span>` : ''}
          <div class="flex items-center gap-3 mb-3">
            <img src="${esc(s.logo || fallbackLogo(s.name))}" class="w-14 h-14 rounded-2xl object-cover border border-gray-100 flex-shrink-0" loading="lazy" onerror="this.src='${fallbackLogo(s.name)}'">
            <div class="min-w-0"><p class="font-black text-gray-900 truncate">${esc(s.name || '—')}</p>
              <p class="text-xs text-gray-400 truncate"><i class="fa-solid fa-location-dot"></i> ${esc([countryName(s.country), s.city].filter(Boolean).join(' — ') || '—')}</p></div>
          </div>
          <p class="text-xs text-gray-500 line-clamp-2 min-h-[2rem]">${esc(s.description || '')}</p>
        </button>`;
    }

    const StoresManager = {
        COUNTRIES, countryName, isFeatured,
        _all: [],

        // ── Home: featured stores at the very top ───────────────────────────
        async loadHomeStrip() {
            const sec = document.getElementById('homeStoresSection'), grid = document.getElementById('homeStoresGrid');
            if (!sec || !grid || !window.db || PLATFORM.STORES_ENABLED === false) return;
            try {
                const snap = await window.db.collection(COLLECTIONS.STORES).where('featuredUntil', '>', new Date()).limit(24).get();
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.status !== 'paused').sort(sortStores).slice(0, 8);
                if (!list.length) { sec.classList.add('hidden'); return; }
                grid.innerHTML = list.map(storeCard).join('');
                sec.classList.remove('hidden');
            } catch (e) { console.warn('[Stores] home strip:', e.message); sec.classList.add('hidden'); }
        },

        // ── Stores directory ────────────────────────────────────────────────
        async initStoresPage() {
            const grid = document.getElementById('storesGrid');
            if (!grid) return;
            grid.innerHTML = '<div class="col-span-full text-center py-10"><i class="fa-solid fa-spinner fa-spin text-navy-500 text-2xl"></i></div>';
            const sel = document.getElementById('storesCountry');
            if (sel && !sel.dataset.ready) {
                sel.innerHTML = `<option value="">${isAr() ? 'كل الدول' : 'All countries'}</option>` + COUNTRIES.map(c => `<option value="${c[0]}">${isAr() ? c[1] : c[2]}</option>`).join('');
                sel.dataset.ready = '1';
            }
            try {
                const snap = await window.db.collection(COLLECTIONS.STORES).limit(200).get();
                this._all = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.status !== 'paused');
            } catch (e) { grid.innerHTML = `<p class="col-span-full text-center text-red-500 py-8">${esc(e.message)}</p>`; return; }
            this.filterStores();
        },
        filterStores() {
            const grid = document.getElementById('storesGrid'); if (!grid) return;
            const q = (document.getElementById('storesSearch')?.value || '').trim().toLowerCase();
            const c = document.getElementById('storesCountry')?.value || '';
            const list = this._all.filter(s => (!q || String(s.name || '').toLowerCase().includes(q)) && (!c || s.country === c)).sort(sortStores);
            grid.innerHTML = list.length ? list.map(storeCard).join('') : `<p class="col-span-full text-center text-gray-400 py-12">${isAr() ? 'مفيش متاجر مطابقة' : 'No stores found'}</p>`;
        },

        // ── One store page (public) — themed by the owner ───────────────────
        async openStore(storeId) {
            if (!storeId) return;
            navigateTo('store');
            try { history.replaceState({ page: 'store' }, '', '#store-' + storeId); } catch (_) {}
            const head = document.getElementById('storeHeader');
            if (head) head.innerHTML = '<div class="text-center py-10"><i class="fa-solid fa-spinner fa-spin text-navy-500 text-2xl"></i></div>';
            let store = null, items = [];
            try {
                const ss = await window.db.collection(COLLECTIONS.STORES).doc(storeId).get();
                store = ss.exists ? { id: ss.id, ...ss.data() } : null;
                const ownerId = store ? store.ownerId : storeId;
                const isFirst = !store || store.id === store.ownerId;      // the first store also owns listings that predate stores
                const q = isFirst
                    ? window.db.collection(COLLECTIONS.SERVICES).where('sellerId', '==', ownerId).where('active', '==', true).limit(200)
                    : window.db.collection(COLLECTIONS.SERVICES).where('storeId', '==', storeId).where('active', '==', true).limit(200);
                const ls = await q.get();
                items = ls.docs.map(d => ({ id: d.id, ...d.data() }));
                if (isFirst) items = items.filter(x => !x.storeId || x.storeId === storeId);
            } catch (e) { if (head) head.innerHTML = `<p class="text-center text-red-500 py-8">${esc(e.message)}</p>`; return; }
            if (!store && !items.length) { if (head) head.innerHTML = `<p class="text-center text-gray-400 py-12">${isAr() ? 'المتجر غير موجود' : 'Store not found'}</p>`; return; }

            const name = store ? store.name : (items[0].sellerName || '—');
            const color = (store && /^#[0-9a-fA-F]{6}$/.test(store.themeColor || '')) ? store.themeColor : '#0f172a';
            const f = store && isFeatured(store);
            const rev = items.reduce((n, x) => n + (Number(x.reviewCount) || 0), 0);
            const avg = rev ? items.reduce((n, x) => n + (Number(x.rating) || 0) * (Number(x.reviewCount) || 0), 0) / rev : 0;
            const banner = store && store.banner ? `url('${esc(store.banner)}') center/cover` : `linear-gradient(135deg, ${color}, ${color}cc)`;
            this._items = items;
            // "Hero product" for themes that spotlight one item: best reviewed, else first with a picture.
            const heroItem = items.slice().sort((a, b) => ((Number(b.reviewCount) || 0) * (Number(b.rating) || 0)) - ((Number(a.reviewCount) || 0) * (Number(a.rating) || 0)))[0];
            const hero = heroItem ? { id: heroItem.id, title: heroItem.title || '', price: heroItem.price || 0, image: (window.getServiceImage && getServiceImage(heroItem)) || '' } : null;
            const themeId = (store && store.theme) || 'classic';
            if (window.StoreThemes) StoreThemes.apply(document.getElementById('storeThemeWrap'), themeId, color);
            if (head) head.innerHTML = window.StoreThemes ? StoreThemes.header(themeId, {
                name, tagline: store && store.tagline, logo: store && store.logo, banner: store && store.banner, color, featured: !!f,
                count: items.length, rev, avg, loc: [store && countryName(store.country), store && store.city].filter(Boolean).join(' — '),
                desc: store && store.description, announcement: store && store.announcement,
                shippingPolicy: store && store.shippingPolicy, returnPolicy: store && store.returnPolicy, hero,
            }) : '';
            const grid = document.getElementById('storeProductsGrid');
            if (grid) {
                const layout = (store && store.layout) || 'grid3';
                grid.className = layout === 'list' ? 'grid grid-cols-1 gap-5 max-w-3xl mx-auto' : layout === 'grid4' ? 'grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5' : 'grid sm:grid-cols-2 lg:grid-cols-3 gap-5';
            }
            if (window.ServicesManager) ServicesManager._renderServiceCards(items, 'storeProductsGrid', 'storeProductsEmpty');
        },

        /** Marketplace theme search box: filters the store's listings in place. */
        filterItems(q) {
            if (!window.ServicesManager || !this._items) return;
            const needle = String(q || '').trim().toLowerCase();
            const list = needle ? this._items.filter(x => String(x.title || '').toLowerCase().includes(needle) || String(x.category || '').toLowerCase().includes(needle)) : this._items;
            ServicesManager._renderServiceCards(list, 'storeProductsGrid', 'storeProductsEmpty');
        },

        // ═════════════════════════════════════════════════════════════════
        //  SELLER DASHBOARD — «متجري»
        // ═════════════════════════════════════════════════════════════════
        PALETTE: ['#0f172a', '#1d4ed8', '#0891b2', '#059669', '#d97706', '#dc2626', '#be185d', '#7c3aed'],
        _D: { stores: [], plans: [], listings: [], orders: [], cur: null, tab: 'overview' },

        async initMyStorePage() {
            const box = document.getElementById('myStoreContent'); if (!box) return;
            const user = AppState.currentUser;
            if (!user) { box.innerHTML = `<div class="text-center py-16"><p class="text-gray-500 mb-4">${isAr() ? 'سجّل دخولك الأول' : 'Please log in'}</p><button onclick="navigateTo('login')" class="btn-primary px-8">${isAr() ? 'تسجيل الدخول' : 'Log in'}</button></div>`; return; }
            if (user.role !== 'seller' && user.role !== 'admin') {
                box.innerHTML = `<div class="text-center py-16"><i class="fa-solid fa-lock text-gray-300 text-5xl mb-4"></i><h3 class="text-xl font-black text-gray-500 mb-3">${isAr() ? 'يجب أن تكون بائعًا' : 'Seller account required'}</h3><button onclick="AuthManager.upgradeToSeller()" class="btn-primary px-8">${isAr() ? 'الترقية لبائع' : 'Upgrade to Seller'}</button></div>`; return;
            }
            const q = new URLSearchParams(location.search).get('store_payment');
            if (q === 'success') showToast(isAr() ? '✅ تم الدفع — الباقة هتتفعّل خلال لحظات' : '✅ Paid — package activates shortly', 'success');
            if (q === 'failed') showToast(isAr() ? 'فشل الدفع' : 'Payment failed', 'error');
            box.innerHTML = '<div class="text-center py-10"><i class="fa-solid fa-spinner fa-spin text-navy-500 text-2xl"></i></div>';
            await this._reloadDash();
            this._renderDash();
        },

        async _reloadDash() {
            const user = AppState.currentUser, D = this._D;
            const [ss, ps, ls, os] = await Promise.all([
                window.db.collection(COLLECTIONS.STORES).where('ownerId', '==', user.uid).get(),
                window.db.collection(COLLECTIONS.STORE_PLANS).get(),
                window.db.collection(COLLECTIONS.SERVICES).where('sellerId', '==', user.uid).get(),
                window.db.collection(COLLECTIONS.ORDERS).where('sellerId', '==', user.uid).get().catch(() => ({ docs: [] })),
            ]);
            D.stores = ss.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.id === user.uid ? -1 : 0) - (b.id === user.uid ? -1 : 0) || String(a.id).localeCompare(b.id));
            D.plans = ps.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.enabled !== false).sort((a, b) => (a.price || 0) - (b.price || 0));
            D.listings = ls.docs.map(d => ({ id: d.id, ...d.data() }));
            D.orders = os.docs.map(d => ({ id: d.id, ...d.data() }));
            if (!D.cur || !D.stores.find(x => x.id === D.cur)) D.cur = D.stores[0] ? D.stores[0].id : null;
        },
        _store() { return this._D.stores.find(x => x.id === this._D.cur) || null; },
        _storeListings() {
            const uid = AppState.currentUser.uid, id = this._D.cur;
            return this._D.listings.filter(x => (x.storeId || uid) === id);      // listings without a storeId belong to the first store
        },
        setStore(id) { this._D.cur = id; this._renderDash(); },
        setTab(t) { this._D.tab = t; this._renderDash(); },

        _modalInput(title, label, placeholder) {
            return new Promise(resolve => {
                const ov = document.createElement('div');
                ov.className = 'fixed inset-0 bg-black/70 z-[99999] flex items-center justify-center p-4';
                ov.innerHTML = `<div class="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6"><h3 class="text-lg font-black text-gray-900 mb-3">${esc(title)}</h3>
                  <label class="text-xs font-bold text-gray-600 block mb-1">${esc(label)}</label><input id="miv" maxlength="60" class="form-input w-full mb-4" placeholder="${esc(placeholder || '')}">
                  <div class="flex gap-3"><button id="mic" class="btn-secondary flex-1 py-2.5">${isAr() ? 'إلغاء' : 'Cancel'}</button><button id="mio" class="btn-primary flex-1 py-2.5">${isAr() ? 'إنشاء' : 'Create'}</button></div></div>`;
                document.body.appendChild(ov);
                const done = (v) => { ov.remove(); resolve(v); };
                ov.querySelector('#mic').onclick = () => done(null);
                ov.querySelector('#mio').onclick = () => done(ov.querySelector('#miv').value.trim());
                setTimeout(() => ov.querySelector('#miv').focus(), 50);
            });
        },

        async createStore() {
            const user = AppState.currentUser, D = this._D;
            const taken = new Set(D.stores.map(x => x.id));
            const id = [user.uid, ...[2, 3, 4, 5].map(n => user.uid + '_' + n)].find(x => !taken.has(x));
            if (!id) { showToast(isAr() ? 'وصلت للحد الأقصى: 5 متاجر' : 'Limit reached: 5 stores', 'warning'); return; }
            const name = await this._modalInput(isAr() ? 'متجر جديد' : 'New store', isAr() ? 'اسم المتجر' : 'Store name', isAr() ? 'مثال: متجر الإلكترونيات' : '');
            if (name === null) return;
            const clean = sanitizeInput(name, 60);
            if (clean.length < 2) { showToast(isAr() ? 'اكتب اسم المتجر' : 'Enter a store name', 'warning'); return; }
            const leak = window.scanFieldsForContactLeak && window.scanFieldsForContactLeak([clean]);
            if (leak) { showToast(window.contactLeakWarning(isAr()), 'error'); return; }
            showLoading();
            try {
                await window.db.collection(COLLECTIONS.STORES).doc(id).set({ ownerId: user.uid, name: clean, description: '', logo: '', country: 'EG', city: '', status: 'active', themeColor: '#0f172a', layout: 'grid3', theme: 'classic', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
                this._D.cur = id; this._D.tab = 'settings';
                await this._reloadDash(); hideLoading(); this._renderDash();
                showToast(isAr() ? '✅ تم إنشاء المتجر — كمّل بياناته وتصميمه' : '✅ Store created', 'success');
            } catch (e) { hideLoading(); showToast(e.message, 'error'); }
        },

        _renderDash() {
            const box = document.getElementById('myStoreContent'); if (!box) return;
            const D = this._D, user = AppState.currentUser, st = this._store();
            if (!st) {
                box.innerHTML = `<div class="bg-white rounded-3xl border border-gray-100 shadow-sm p-10 text-center max-w-lg mx-auto">
                  <i class="fa-solid fa-shop text-navy-300 text-6xl mb-4"></i>
                  <h2 class="text-xl font-black text-gray-900 mb-2">${isAr() ? 'ابدأ متجرك الأول' : 'Start your first store'}</h2>
                  <p class="text-sm text-gray-500 mb-5">${isAr() ? 'متجر باسمك وهويتك، يجمع كل منتجاتك، وتقدر تميّزه في أول الصفحة بباقة.' : 'A branded storefront for all your listings.'}</p>
                  <button onclick="StoresManager.createStore()" class="btn-primary px-8 py-3">${isAr() ? '＋ إنشاء متجر' : '＋ Create store'}</button></div>`;
                return;
            }
            const tabs = [['overview', 'fa-chart-pie', isAr() ? 'نظرة عامة' : 'Overview'], ['products', 'fa-box', isAr() ? 'المنتجات' : 'Products'],
                ['settings', 'fa-gear', isAr() ? 'الإعدادات' : 'Settings'], ['design', 'fa-palette', isAr() ? 'التصميم' : 'Design'], ['promo', 'fa-star', isAr() ? 'الظهور في الأول' : 'Promote']];
            box.innerHTML = `
            <div class="flex flex-wrap items-center gap-3 mb-5">
              <div class="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-3 py-2 shadow-sm">
                <img src="${esc(st.logo || fallbackLogo(st.name))}" class="w-10 h-10 rounded-xl object-cover" onerror="this.src='${fallbackLogo(st.name)}'">
                <select onchange="StoresManager.setStore(this.value)" class="font-black text-gray-900 bg-transparent outline-none max-w-[14rem]">
                  ${D.stores.map(x => `<option value="${esc(x.id)}" ${x.id === st.id ? 'selected' : ''}>${esc(x.name || x.id)}${x.status === 'paused' ? (isAr() ? ' (موقوف)' : ' (paused)') : ''}</option>`).join('')}
                </select>
              </div>
              <button onclick="StoresManager.createStore()" class="px-4 py-2.5 text-sm font-bold border-2 border-dashed border-navy-300 text-navy-700 rounded-2xl hover:bg-navy-50"><i class="fa-solid fa-plus me-1"></i>${isAr() ? 'إضافة متجر تاني' : 'Add another store'} <span class="text-xs text-gray-400">(${D.stores.length}/5)</span></button>
              <button onclick="StoresManager.openStore('${esc(st.id)}')" class="ms-auto px-4 py-2.5 text-sm font-bold bg-navy-800 text-white rounded-2xl hover:bg-navy-900"><i class="fa-solid fa-eye me-1"></i>${isAr() ? 'عرض متجري' : 'View store'}</button>
            </div>
            <div class="flex gap-2 overflow-x-auto mb-5 pb-1">${tabs.map(t => `
              <button onclick="StoresManager.setTab('${t[0]}')" class="whitespace-nowrap px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 ${D.tab === t[0] ? 'bg-navy-800 text-white' : 'bg-white border border-gray-100 text-gray-600 hover:bg-gray-50'}"><i class="fa-solid ${t[1]}"></i>${t[2]}</button>`).join('')}</div>
            <div id="storeTabBody"></div>`;
            const body = document.getElementById('storeTabBody');
            ({ overview: this._tabOverview, products: this._tabProducts, settings: this._tabSettings, design: this._tabDesign, promo: this._tabPromo }[D.tab] || this._tabOverview).call(this, body, st);
        },

        _tabOverview(body, st) {
            const list = this._storeListings(), ids = new Set(list.map(x => x.id));
            const orders = this._D.orders.filter(o => ids.has(o.serviceId));
            const done = orders.filter(o => o.status === 'completed');
            const sales = done.reduce((n, o) => n + (Number(o.price) || 0), 0);
            const open = orders.filter(o => ['payment_held', 'in_progress', 'revision', 'delivered', 'disputed'].includes(o.status)).length;
            const rev = list.reduce((n, x) => n + (Number(x.reviewCount) || 0), 0);
            const avg = rev ? list.reduce((n, x) => n + (Number(x.rating) || 0) * (Number(x.reviewCount) || 0), 0) / rev : 0;
            const f = isFeatured(st);
            const todo = [
                [!!st.logo, isAr() ? 'ارفع شعار المتجر' : 'Upload a logo', 'design'], [!!st.banner, isAr() ? 'أضف صورة غلاف' : 'Add a cover image', 'design'],
                [!!st.tagline, isAr() ? 'اكتب شعارًا مختصرًا' : 'Write a tagline', 'settings'], [(st.description || '').length >= 40, isAr() ? 'اكتب وصفًا للمتجر (40 حرف+)' : 'Write a description', 'settings'],
                [!!(st.shippingPolicy && st.returnPolicy), isAr() ? 'حدد سياسة الشحن والاسترجاع' : 'Add shipping & return policy', 'settings'], [list.length > 0, isAr() ? 'أضف أول منتج' : 'Add your first product', 'products'],
            ];
            const card = (ic, col, v, l) => `<div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"><div class="w-10 h-10 rounded-xl ${col} flex items-center justify-center mb-2"><i class="fa-solid ${ic}"></i></div><p class="text-2xl font-black text-gray-900">${v}</p><p class="text-xs text-gray-500">${l}</p></div>`;
            body.innerHTML = `
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              ${card('fa-box', 'bg-blue-50 text-blue-600', list.length, isAr() ? 'منتجات وخدمات' : 'Listings')}
              ${card('fa-bag-shopping', 'bg-amber-50 text-amber-600', open, isAr() ? 'طلبات جارية' : 'Open orders')}
              ${card('fa-sack-dollar', 'bg-green-50 text-green-600', formatCurrency(sales), isAr() ? 'مبيعات مكتملة' : 'Completed sales')}
              ${card('fa-star', 'bg-yellow-50 text-yellow-500', rev ? avg.toFixed(1) + ' <span class="text-sm text-gray-400">(' + rev + ')</span>' : '—', isAr() ? 'التقييم' : 'Rating')}
            </div>
            <div class="grid lg:grid-cols-2 gap-6">
              <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 class="font-black text-gray-900 mb-3">${isAr() ? 'خطوات لتحسين متجرك' : 'Improve your store'}</h3>
                <div class="space-y-2">${todo.map(t => `<button onclick="StoresManager.setTab('${t[2]}')" class="w-full flex items-center gap-3 text-start text-sm p-2.5 rounded-xl ${t[0] ? 'text-gray-400' : 'bg-amber-50 text-amber-900 font-bold hover:bg-amber-100'}"><i class="fa-solid ${t[0] ? 'fa-circle-check text-green-500' : 'fa-circle-exclamation text-amber-500'}"></i>${t[1]}</button>`).join('')}</div>
              </div>
              <div class="bg-white rounded-2xl border ${f ? 'border-amber-300' : 'border-gray-100'} shadow-sm p-5">
                <h3 class="font-black text-gray-900 mb-2 flex items-center gap-2"><i class="fa-solid fa-star text-amber-500"></i>${isAr() ? 'الظهور في أول الصفحة' : 'Top placement'}</h3>
                ${f ? `<p class="text-sm text-amber-900">${isAr() ? 'متجرك مميز حاليًا — باقة' : 'Featured — package'} <b>${esc(st.planName || '')}</b> ${isAr() ? 'لحد' : 'until'} <b>${new Date(toMs(st.featuredUntil)).toLocaleDateString(isAr() ? 'ar-EG' : 'en-GB')}</b></p>`
                    : `<p class="text-sm text-gray-500 mb-3">${isAr() ? 'متجرك مش ظاهر في الأول. اختار باقة علشان يظهر في أول الصفحة الرئيسية.' : 'Not featured yet.'}</p>`}
                <button onclick="StoresManager.setTab('promo')" class="mt-3 btn-primary px-5 py-2.5 text-sm">${isAr() ? 'عرض الباقات' : 'See packages'}</button>
              </div>
            </div>`;
        },

        _tabProducts(body, st) {
            const D = this._D, list = this._storeListings().sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
            body.innerHTML = `
            <div class="flex items-center justify-between mb-4"><h3 class="font-black text-gray-900">${isAr() ? `منتجات المتجر (${list.length})` : `Store listings (${list.length})`}</h3>
              <div class="flex gap-2"><button onclick="StoresManager.addProduct('product')" class="btn-primary px-4 py-2 text-sm"><i class="fa-solid fa-plus me-1"></i>${isAr() ? 'منتج' : 'Product'}</button>
              <button onclick="StoresManager.addProduct('service')" class="px-4 py-2 text-sm font-bold border-2 border-navy-200 text-navy-700 rounded-xl hover:bg-navy-50">${isAr() ? 'خدمة' : 'Service'}</button></div></div>
            ${list.length ? `<div class="space-y-3">${list.map(x => {
                const on = x.active !== false && x.status !== 'paused';
                return `<div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center gap-3 flex-wrap">
                  <img src="${esc((window.getServiceImage && getServiceImage(x)) || '')}" class="w-16 h-16 rounded-xl object-cover bg-gray-100" onerror="this.style.visibility='hidden'">
                  <div class="flex-1 min-w-[10rem]"><p class="font-bold text-gray-900 truncate">${esc(x.title || '—')}</p>
                    <p class="text-xs text-gray-500">${formatCurrency(x.price || 0)} ${x.listingType === 'product' ? `· ${Number(x.shippingFee) > 0 ? (isAr() ? 'شحن ' + x.shippingFee + (x.shippingMode === 'cod' ? ' عند الاستلام' : ' أونلاين') : '') : (isAr() ? 'شحن مجاني' : 'free ship')}` : ''} · <span class="${on ? 'text-green-600' : 'text-gray-400'} font-bold">${on ? (isAr() ? 'نشط' : 'active') : (isAr() ? 'موقوف' : 'paused')}</span></p></div>
                  ${D.stores.length > 1 ? `<select onchange="StoresManager.moveListing('${x.id}',this.value)" class="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white" title="${isAr() ? 'نقل لمتجر' : 'Move to store'}">${D.stores.map(m => `<option value="${esc(m.id)}" ${m.id === st.id ? 'selected' : ''}>${esc(m.name || m.id)}</option>`).join('')}</select>` : ''}
                  <button onclick="StoresManager.toggleListing('${x.id}',${on})" class="text-xs px-3 py-1.5 rounded-lg font-bold ${on ? 'bg-gray-100 text-gray-700' : 'bg-green-100 text-green-700'}">${on ? (isAr() ? 'إيقاف' : 'Pause') : (isAr() ? 'تفعيل' : 'Activate')}</button>
                  <button onclick="navigateTo('add-service',{id:'${x.id}'})" class="w-9 h-9 bg-navy-50 text-navy-700 rounded-lg hover:bg-navy-100"><i class="fa-solid fa-pen text-xs"></i></button>
                </div>`; }).join('')}</div>`
              : `<div class="text-center bg-white rounded-2xl border border-dashed border-gray-200 py-14 text-gray-400">${isAr() ? 'المتجر فاضي — أضف أول منتج' : 'Empty store — add your first listing'}</div>`}`;
        },
        addProduct(type) { AppState.pendingStoreId = this._D.cur; ServicesManager.openAddServiceForm(type); },
        async toggleListing(id, isOn) {
            try { await window.db.collection(COLLECTIONS.SERVICES).doc(id).update({ active: !isOn, status: isOn ? 'paused' : 'active', updatedAt: serverTimestamp() }); await this._reloadDash(); this._renderDash(); }
            catch (e) { showToast(e.message, 'error'); }
        },
        async moveListing(id, storeId) {
            try { await window.db.collection(COLLECTIONS.SERVICES).doc(id).update({ storeId, updatedAt: serverTimestamp() }); showToast(isAr() ? '✅ تم النقل' : '✅ Moved', 'success'); await this._reloadDash(); this._renderDash(); }
            catch (e) { showToast(e.message, 'error'); }
        },

        _tabSettings(body, st) {
            const inp = (id, label, val, max, ph) => `<div><label class="text-xs font-bold text-gray-600 block mb-1">${label}</label><input id="${id}" maxlength="${max}" class="form-input w-full" value="${esc(val || '')}" placeholder="${esc(ph || '')}"></div>`;
            body.innerHTML = `
            <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-2xl space-y-4">
              ${inp('stName', isAr() ? 'اسم المتجر' : 'Store name', st.name, 60)}
              ${inp('stTagline', isAr() ? 'شعار مختصر' : 'Tagline', st.tagline, 80, isAr() ? 'مثال: أفضل الإلكترونيات بأقل سعر' : '')}
              <div><label class="text-xs font-bold text-gray-600 block mb-1">${isAr() ? 'وصف المتجر' : 'Description'}</label><textarea id="stDesc" rows="3" maxlength="500" class="form-input w-full">${esc(st.description || '')}</textarea></div>
              <div class="grid grid-cols-2 gap-3">
                <div><label class="text-xs font-bold text-gray-600 block mb-1">${isAr() ? 'الدولة' : 'Country'}</label><select id="stCountry" class="form-input w-full">${COUNTRIES.map(c => `<option value="${c[0]}" ${(st.country || 'EG') === c[0] ? 'selected' : ''}>${isAr() ? c[1] : c[2]}</option>`).join('')}</select></div>
                ${inp('stCity', isAr() ? 'المدينة' : 'City', st.city, 40)}
              </div>
              <div><label class="text-xs font-bold text-gray-600 block mb-1">${isAr() ? 'سياسة الشحن' : 'Shipping policy'}</label><textarea id="stShipPol" rows="2" maxlength="400" class="form-input w-full" placeholder="${isAr() ? 'مثال: الشحن خلال 2-4 أيام عمل لكل المحافظات' : ''}">${esc(st.shippingPolicy || '')}</textarea></div>
              <div><label class="text-xs font-bold text-gray-600 block mb-1">${isAr() ? 'سياسة الاسترجاع' : 'Return policy'}</label><textarea id="stRetPol" rows="2" maxlength="400" class="form-input w-full" placeholder="${isAr() ? 'مثال: استرجاع خلال 14 يوم لو المنتج غير مطابق' : ''}">${esc(st.returnPolicy || '')}</textarea></div>
              <p class="text-xs text-gray-400"><i class="fa-solid fa-shield-halved me-1"></i>${isAr() ? 'ممنوع كتابة أرقام هاتف أو روابط تواصل — كل التواصل داخل المنصة.' : 'Contact details are not allowed — keep communication on the platform.'}</p>
              <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="stPaused" ${st.status === 'paused' ? 'checked' : ''}> ${isAr() ? 'إيقاف المتجر مؤقتًا (يختفي من الموقع)' : 'Pause store (hidden)'}</label>
              <div class="flex gap-3 pt-2"><button onclick="StoresManager.saveStore('settings')" class="btn-primary px-8 py-3">${isAr() ? 'حفظ الإعدادات' : 'Save'}</button>
                <button onclick="StoresManager.deleteStore()" class="px-5 py-3 text-sm font-bold text-rose-600 border-2 border-rose-200 rounded-xl hover:bg-rose-50">${isAr() ? 'حذف المتجر' : 'Delete store'}</button></div>
            </div>`;
        },

        _tabDesign(body, st) {
            this._draft = { themeColor: st.themeColor || '#0f172a', logo: st.logo || '', banner: st.banner || '', layout: st.layout || 'grid3', theme: st.theme || 'classic', colorTouched: !!st.themeColor && st.themeColor !== '#0f172a' };
            body.innerHTML = `
            <div class="grid lg:grid-cols-2 gap-6">
              <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
                <div><p class="text-sm font-black text-gray-800 mb-2">${isAr() ? 'ثيم المتجر (6 تصميمات)' : 'Store theme (6 designs)'}</p>
                  <div id="stThemePicker" class="grid grid-cols-2 sm:grid-cols-3 gap-3"></div></div>
                <div><p class="text-sm font-black text-gray-800 mb-2">${isAr() ? 'لون المتجر' : 'Brand color'}</p>
                  <div class="flex flex-wrap items-center gap-2">${this.PALETTE.map(c => `<button type="button" onclick="StoresManager.draft('themeColor','${c}')" class="w-9 h-9 rounded-full border-4 ${this._draft.themeColor === c ? 'border-gray-400' : 'border-white'} shadow" style="background:${c}"></button>`).join('')}
                    <input type="color" id="stColor" value="${this._draft.themeColor}" onchange="StoresManager.draft('themeColor',this.value)" class="w-9 h-9 rounded-full cursor-pointer border-0 p-0" title="${isAr() ? 'لون مخصص' : 'Custom'}"></div></div>
                <div><p class="text-sm font-black text-gray-800 mb-2">${isAr() ? 'الشعار' : 'Logo'}</p><input type="file" id="stLogo" accept="image/*" class="text-xs"></div>
                <div><p class="text-sm font-black text-gray-800 mb-2">${isAr() ? 'صورة الغلاف' : 'Cover image'}</p><input type="file" id="stBanner" accept="image/*" class="text-xs mb-1"><button type="button" onclick="StoresManager.draft('banner','')" class="text-xs text-rose-600 font-bold">${isAr() ? 'إزالة الغلاف' : 'Remove cover'}</button></div>
                <div><p class="text-sm font-black text-gray-800 mb-2">${isAr() ? 'شكل عرض المنتجات' : 'Product layout'}</p>
                  <div class="flex gap-2">${[['grid3', isAr() ? '3 أعمدة' : '3 columns'], ['grid4', isAr() ? '4 أعمدة' : '4 columns'], ['list', isAr() ? 'قائمة' : 'List']].map(l => `<label class="flex-1 text-center text-sm font-bold p-2.5 border-2 border-gray-100 rounded-xl cursor-pointer has-[:checked]:border-navy-600 has-[:checked]:bg-navy-50"><input type="radio" name="stLayout" value="${l[0]}" class="hidden" ${this._draft.layout === l[0] ? 'checked' : ''} onchange="StoresManager.draft('layout','${l[0]}')">${l[1]}</label>`).join('')}</div></div>
                <div><label class="text-sm font-black text-gray-800 mb-2 block">${isAr() ? 'شريط إعلان أعلى المتجر' : 'Announcement bar'}</label><input id="stAnn" oninput="StoresManager._paintPreview()" maxlength="120" class="form-input w-full" value="${esc(st.announcement || '')}" placeholder="${isAr() ? 'مثال: خصم 20% على كل المنتجات هذا الأسبوع' : ''}"></div>
                <button onclick="StoresManager.saveStore('design')" class="btn-primary px-8 py-3">${isAr() ? 'حفظ التصميم' : 'Save design'}</button>
              </div>
              <div><p class="text-sm font-black text-gray-800 mb-2">${isAr() ? 'معاينة مباشرة' : 'Live preview'}</p><div id="stPreview" class="rounded-3xl overflow-hidden border border-gray-100 shadow-sm bg-white"></div></div>
            </div>`;
            const up = (id, key, px, len) => { const el = document.getElementById(id); if (el) el.onchange = async () => { const f = el.files[0]; if (!f) return; try { this.draft(key, await uploadFile(f, 'stores', key + '_' + st.id, { maxPx: px, maxLen: len })); } catch (e) { showToast(e.message, 'error'); } }; };
            up('stLogo', 'logo', 300, 70000); up('stBanner', 'banner', 1200, 200000);
            this._paintPicker();
            this._paintPreview();
        },
        draft(key, val) {
            this._draft[key] = val;
            if (key === 'themeColor') this._draft.colorTouched = true;
            // picking a theme proposes its signature colour — unless the owner already chose his own
            if (key === 'theme' && window.StoreThemes) {
                const t = StoreThemes.get(val);
                if (t.accent && !this._draft.colorTouched) this._draft.themeColor = t.accent;
            }
            { const c = document.getElementById('stColor'); if (c) c.value = this._draft.themeColor; }
            if (key === 'theme' || key === 'themeColor') this._paintPicker();
            this._paintPreview();
        },
        _paintPicker() {
            const box = document.getElementById('stThemePicker'); if (!box || !window.StoreThemes) return;
            const c = this._draft.themeColor;
            const card = (t) => `
              <button type="button" onclick="StoresManager.draft('theme','${t.id}')" class="text-start p-2 rounded-2xl border-2 transition ${this._draft.theme === t.id ? 'border-navy-600 bg-navy-50' : 'border-gray-100 hover:border-gray-300'}">
                ${StoreThemes.thumb(t.id, c)}
                <p class="font-black text-sm text-gray-900 mt-2">${isAr() ? t.ar : t.en}${this._draft.theme === t.id ? ' ✓' : ''}</p>
                <p class="text-[11px] text-gray-500 leading-snug">${isAr() ? t.desc.ar : t.desc.en}</p>
              </button>`;
            const base = StoreThemes.LIST.filter(t => t.group !== 'pro'), pro = StoreThemes.LIST.filter(t => t.group === 'pro');
            box.className = '';
            box.innerHTML = `<p class="text-xs font-black text-gray-500 mb-2">${isAr() ? 'تصميمات أساسية' : 'Essentials'}</p>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">${base.map(card).join('')}</div>
              <p class="text-xs font-black text-gray-500 mb-2">${isAr() ? 'تصميمات حسب النشاط (الأنسب لـ…)' : 'By business type (best for…)'}</p>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">${pro.map(card).join('')}</div>`;
        },
        _paintPreview() {
            const el = document.getElementById('stPreview'); if (!el || !window.StoreThemes) return;
            const st = this._store(), d = this._draft;
            const cardsMock = [1, 2, 3, 4].map(() => `<div class="service-card card" style="height:92px"></div>`).join('');
            StoreThemes.apply(el, d.theme, d.themeColor);
            el.style.overflow = 'hidden';
            el.innerHTML = StoreThemes.header(d.theme, {
                name: (st && st.name) || '', tagline: st && st.tagline, logo: d.logo, banner: d.banner, color: d.themeColor, featured: false,
                count: this._storeListings().length, rev: 0, avg: 0, loc: st ? [countryName(st.country), st.city].filter(Boolean).join(' — ') : '',
                desc: st && st.description, announcement: document.getElementById('stAnn')?.value || (st && st.announcement) || '',
                shippingPolicy: st && st.shippingPolicy, returnPolicy: st && st.returnPolicy,
                hero: (() => { const x = this._storeListings()[0]; return x ? { id: x.id, title: x.title || '', price: x.price || 0, image: (window.getServiceImage && getServiceImage(x)) || '' } : null; })(),
            }) + `<div style="display:grid;grid-template-columns:repeat(${d.layout === 'list' ? 1 : d.layout === 'grid4' ? 4 : 3},1fr);gap:10px;margin-top:18px">${cardsMock}</div>`;
        },

        async saveStore(section) {
            const st = this._store(); if (!st) return;
            const v = (id) => document.getElementById(id)?.value?.trim() || '';
            let patch = {};
            if (section === 'settings') {
                patch = { name: sanitizeInput(v('stName'), 60), tagline: sanitizeInput(v('stTagline'), 80), description: sanitizeInput(v('stDesc'), 500),
                    country: v('stCountry') || 'EG', city: sanitizeInput(v('stCity'), 40), shippingPolicy: sanitizeInput(v('stShipPol'), 400), returnPolicy: sanitizeInput(v('stRetPol'), 400),
                    status: document.getElementById('stPaused')?.checked ? 'paused' : 'active' };
                if (patch.name.length < 2) { showToast(isAr() ? 'اكتب اسم المتجر' : 'Enter a store name', 'warning'); return; }
            } else {
                patch = { theme: this._draft.theme, themeColor: this._draft.themeColor, logo: this._draft.logo, banner: this._draft.banner, layout: this._draft.layout, announcement: sanitizeInput(v('stAnn'), 120) };
            }
            const leak = window.scanFieldsForContactLeak && window.scanFieldsForContactLeak(Object.values(patch).filter(x => typeof x === 'string' && !x.startsWith('data:') && x.length < 600));
            if (leak) { showToast(window.contactLeakWarning(isAr()), 'error'); return; }
            showLoading();
            try {
                await window.db.collection(COLLECTIONS.STORES).doc(st.id).update({ ...patch, updatedAt: serverTimestamp() });
                await this._reloadDash(); hideLoading(); this._renderDash();
                showToast(isAr() ? '✅ تم الحفظ' : '✅ Saved', 'success');
            } catch (e) { hideLoading(); showToast(e.message, 'error'); }
        },
        async deleteStore() {
            const st = this._store(); if (!st) return;
            if (!confirm(isAr() ? `حذف متجر «${st.name}»؟ المنتجات مش هتتحذف، هتتنقل للمتجر الأول.` : `Delete "${st.name}"? Listings are kept.`)) return;
            showLoading();
            try {
                const moved = this._storeListings();
                const first = this._D.stores.find(x => x.id !== st.id);
                for (const l of moved) await window.db.collection(COLLECTIONS.SERVICES).doc(l.id).update({ storeId: first ? first.id : AppState.currentUser.uid, updatedAt: serverTimestamp() }).catch(() => {});
                await window.db.collection(COLLECTIONS.STORES).doc(st.id).delete();
                this._D.cur = null; await this._reloadDash(); hideLoading(); this._renderDash();
            } catch (e) { hideLoading(); showToast(e.message, 'error'); }
        },

        _tabPromo(body, st) {
            const plans = this._D.plans, f = isFeatured(st);
            body.innerHTML = `<div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-2xl">
              <h3 class="font-black text-gray-900 mb-1 flex items-center gap-2"><i class="fa-solid fa-star text-amber-500"></i>${isAr() ? 'الظهور في أول الصفحة' : 'Show at the top'} — ${esc(st.name)}</h3>
              ${f ? `<p class="text-sm bg-amber-50 border border-amber-200 rounded-xl p-3 my-3 text-amber-900">${isAr() ? 'مميز حاليًا — باقة' : 'Featured now —'} <b>${esc(st.planName || '')}</b> ${isAr() ? 'لحد' : 'until'} <b>${new Date(toMs(st.featuredUntil)).toLocaleDateString(isAr() ? 'ar-EG' : 'en-GB')}</b>. ${isAr() ? 'شراء باقة جديدة بيمدّد المدة.' : 'Buying again extends it.'}</p>`
                  : `<p class="text-xs text-gray-400 my-3">${isAr() ? 'اختار باقة وادفع علشان المتجر ده يظهر في أول الصفحة الرئيسية وأول قايمة المتاجر.' : 'Pick a package to show this store at the top.'}</p>`}
              ${st.status === 'paused' ? `<p class="text-sm text-rose-600 font-bold mb-3">${isAr() ? 'المتجر موقوف — فعّله الأول من الإعدادات' : 'Store is paused'}</p>` : ''}
              ${plans.length ? `<div class="space-y-3">${plans.map(p => `<div class="border-2 border-gray-100 rounded-2xl p-4 flex items-center justify-between gap-3">
                  <div class="min-w-0"><p class="font-black text-gray-900">${esc(p.nameAr || p.name || '')}</p><p class="text-xs text-gray-500">${Number(p.days) || 0} ${isAr() ? 'يوم' : 'days'}${p.description ? ' — ' + esc(p.description) : ''}</p></div>
                  <button onclick="StoresManager.buyPlan('${esc(p.id)}')" class="btn-primary px-4 py-2 text-sm whitespace-nowrap">${Number(p.price) > 0 ? formatCurrency(p.price) : (isAr() ? 'مجانًا' : 'Free')}</button></div>`).join('')}</div>`
                : `<p class="text-sm text-gray-400 text-center py-6">${isAr() ? 'مفيش باقات متاحة حاليًا' : 'No packages available yet'}</p>`}</div>`;
        },

        async buyPlan(planId) {
            showLoading(isAr() ? 'جاري تجهيز الدفع...' : 'Preparing payment...');
            try {
                const out = await api({ action: 'buyPlan', planId, storeId: this._D.cur });
                hideLoading();
                if (out.redirectUrl) { window.location.href = out.redirectUrl; return; }
                showToast(isAr() ? '✅ تم تفعيل الباقة' : '✅ Package activated', 'success');
                await this._reloadDash(); this._renderDash();
            } catch (e) { hideLoading(); showToast(e.message, 'error'); }
        },
    };

    // ── Admin tab: packages + stores ────────────────────────────────────────
    const StoresAdmin = {
        async render(container) {
            const [ps, ss] = await Promise.all([
                window.db.collection(COLLECTIONS.STORE_PLANS).get(),
                window.db.collection(COLLECTIONS.STORES).limit(200).get(),
            ]);
            const plans = ps.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.price || 0) - (b.price || 0));
            const stores = ss.docs.map(d => ({ id: d.id, ...d.data() })).sort(sortStores);
            container.innerHTML = `
            <h3 class="font-black text-gray-900 mb-1 flex items-center gap-2"><i class="fa-solid fa-star text-amber-500"></i>${isAr() ? 'باقات ظهور المتاجر' : 'Featured-store packages'}</h3>
            <p class="text-xs text-gray-400 mb-4">${isAr() ? 'الترتيب (Rank) الأعلى بيظهر الأول. السعر 0 = باقة مجانية.' : 'Higher rank shows first. Price 0 = free package.'}</p>
            <div class="grid sm:grid-cols-5 gap-2 mb-4 p-4 bg-gray-50 rounded-2xl">
              <input id="spName" class="form-input sm:col-span-2" placeholder="${isAr() ? 'اسم الباقة (مثال: ذهبية)' : 'Package name'}">
              <input id="spPrice" type="number" min="0" class="form-input" placeholder="${isAr() ? 'السعر ج.م' : 'Price'}">
              <input id="spDays" type="number" min="1" class="form-input" placeholder="${isAr() ? 'المدة بالأيام' : 'Days'}">
              <input id="spRank" type="number" class="form-input" placeholder="Rank">
              <input id="spDesc" class="form-input sm:col-span-4" placeholder="${isAr() ? 'وصف قصير (اختياري)' : 'Short description'}">
              <button onclick="StoresAdmin.addPlan()" class="btn-primary py-2 text-sm">${isAr() ? 'إضافة باقة' : 'Add'}</button>
            </div>
            <div class="space-y-2 mb-8">${plans.length ? plans.map(p => `
              <div class="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl">
                <div class="flex-1 min-w-0"><p class="font-bold text-gray-900">${esc(p.nameAr || '')} <span class="text-xs text-gray-400">· rank ${p.rank || 0}</span></p>
                  <p class="text-xs text-gray-500">${formatCurrency(p.price || 0)} · ${p.days || 0} ${isAr() ? 'يوم' : 'days'} ${p.description ? '· ' + esc(p.description) : ''}</p></div>
                <label class="text-xs flex items-center gap-1"><input type="checkbox" ${p.enabled !== false ? 'checked' : ''} onchange="StoresAdmin.togglePlan('${p.id}',this.checked)"> ${isAr() ? 'مفعّلة' : 'enabled'}</label>
                <button onclick="StoresAdmin.delPlan('${p.id}')" class="w-8 h-8 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-600 hover:text-white"><i class="fa-solid fa-trash-can text-xs"></i></button>
              </div>`).join('') : `<p class="text-sm text-gray-400 text-center py-4">${isAr() ? 'لسه مفيش باقات' : 'No packages yet'}</p>`}</div>
            <h3 class="font-black text-gray-900 mb-3">${isAr() ? `المتاجر (${stores.length})` : `Stores (${stores.length})`}</h3>
            <div class="space-y-2">${stores.map(s => `
              <div class="flex flex-wrap items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <img src="${esc(s.logo || fallbackLogo(s.name))}" class="w-10 h-10 rounded-xl object-cover" onerror="this.src='${fallbackLogo(s.name)}'">
                <div class="flex-1 min-w-0"><p class="font-bold text-gray-900 truncate">${esc(s.name || '—')} ${s.status === 'paused' ? '<span class="text-xs text-gray-400">(موقوف)</span>' : ''}</p>
                  <p class="text-xs ${isFeatured(s) ? 'text-amber-700 font-bold' : 'text-gray-400'}">${isFeatured(s) ? `⭐ ${esc(s.planName || '')} → ${new Date(toMs(s.featuredUntil)).toLocaleDateString(isAr() ? 'ar-EG' : 'en-GB')}` : (isAr() ? 'غير مميز' : 'not featured')} · ${esc(countryName(s.country))}</p></div>
                <select id="sg_${s.id}" class="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"><option value="">${isAr() ? 'اختر باقة' : 'Package'}</option>${plans.map(p => `<option value="${p.id}">${esc(p.nameAr || '')} (${p.days}d)</option>`).join('')}</select>
                <button onclick="StoresAdmin.grant('${s.id}')" class="text-xs px-3 py-1.5 bg-amber-500 text-white rounded-lg font-bold">${isAr() ? 'منح' : 'Grant'}</button>
                ${isFeatured(s) ? `<button onclick="StoresAdmin.stop('${s.id}')" class="text-xs px-3 py-1.5 bg-rose-100 text-rose-700 rounded-lg font-bold">${isAr() ? 'إيقاف التمييز' : 'Stop'}</button>` : ''}
              </div>`).join('') || `<p class="text-sm text-gray-400 text-center py-4">${isAr() ? 'مفيش متاجر' : 'No stores'}</p>`}</div>`;
            this._container = container;
        },
        _reload() { if (this._container) this.render(this._container); },
        async addPlan() {
            const nameAr = (document.getElementById('spName')?.value || '').trim(), days = parseInt(document.getElementById('spDays')?.value, 10);
            const price = Math.max(0, parseFloat(document.getElementById('spPrice')?.value) || 0), rank = parseInt(document.getElementById('spRank')?.value, 10) || 0;
            if (!nameAr || !(days > 0)) { showToast(isAr() ? 'اكتب الاسم والمدة' : 'Name and days required', 'warning'); return; }
            try {
                await window.db.collection(COLLECTIONS.STORE_PLANS).add({ nameAr, price, days, rank, description: (document.getElementById('spDesc')?.value || '').trim(), enabled: true, createdAt: serverTimestamp() });
                showToast('✅', 'success'); this._reload();
            } catch (e) { showToast(e.message, 'error'); }
        },
        async togglePlan(id, v) { try { await window.db.collection(COLLECTIONS.STORE_PLANS).doc(id).update({ enabled: !!v }); } catch (e) { showToast(e.message, 'error'); } },
        async delPlan(id) { if (!confirm(isAr() ? 'حذف الباقة؟' : 'Delete package?')) return; try { await window.db.collection(COLLECTIONS.STORE_PLANS).doc(id).delete(); this._reload(); } catch (e) { showToast(e.message, 'error'); } },
        async grant(storeId) {
            const planId = document.getElementById('sg_' + storeId)?.value;
            if (!planId) { showToast(isAr() ? 'اختر باقة' : 'Pick a package', 'warning'); return; }
            showLoading(); try { await api({ action: 'adminGrant', storeId, planId }); hideLoading(); showToast('✅', 'success'); this._reload(); } catch (e) { hideLoading(); showToast(e.message, 'error'); }
        },
        async stop(storeId) {
            if (!confirm(isAr() ? 'إيقاف التمييز فورًا؟' : 'Stop featuring now?')) return;
            showLoading(); try { await api({ action: 'adminStop', storeId }); hideLoading(); showToast('✅', 'success'); this._reload(); } catch (e) { hideLoading(); showToast(e.message, 'error'); }
        },
    };

    window.StoresManager = StoresManager;
    window.StoresAdmin = StoresAdmin;
    window.initStoresPage = () => StoresManager.initStoresPage();
    window.initMyStorePage = () => StoresManager.initMyStorePage();
    console.log('✅ Stores loaded');
})();
