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

        // ── One store page ───────────────────────────────────────────────────
        async openStore(storeId) {
            if (!storeId) return;
            navigateTo('store');
            try { history.replaceState({ page: 'store' }, '', '#store-' + storeId); } catch (_) {}
            const head = document.getElementById('storeHeader');
            if (head) head.innerHTML = '<div class="text-center py-10"><i class="fa-solid fa-spinner fa-spin text-navy-500 text-2xl"></i></div>';
            let store = null, items = [];
            try {
                const [ss, ls] = await Promise.all([
                    window.db.collection(COLLECTIONS.STORES).doc(storeId).get(),
                    window.db.collection(COLLECTIONS.SERVICES).where('sellerId', '==', storeId).where('active', '==', true).limit(100).get(),
                ]);
                store = ss.exists ? { id: ss.id, ...ss.data() } : null;
                items = ls.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch (e) { if (head) head.innerHTML = `<p class="text-center text-red-500 py-8">${esc(e.message)}</p>`; return; }
            if (!store && !items.length) { if (head) head.innerHTML = `<p class="text-center text-gray-400 py-12">${isAr() ? 'المتجر غير موجود' : 'Store not found'}</p>`; return; }
            const name = store ? store.name : (items[0].sellerName || '—');
            const f = store && isFeatured(store);
            if (head) head.innerHTML = `
              <div class="bg-white rounded-3xl border ${f ? 'border-amber-300' : 'border-gray-100'} shadow-sm p-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
                <img src="${esc((store && store.logo) || fallbackLogo(name))}" class="w-24 h-24 rounded-3xl object-cover border border-gray-100" onerror="this.src='${fallbackLogo(name)}'">
                <div class="text-center sm:text-start flex-1 min-w-0">
                  <h1 class="text-2xl font-black text-gray-900 flex items-center justify-center sm:justify-start gap-2 flex-wrap">${esc(name)}
                    ${f ? `<span class="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-black px-3 py-1 rounded-full"><i class="fa-solid fa-star"></i> ${isAr() ? 'متجر مميز' : 'Featured'}</span>` : ''}</h1>
                  <p class="text-sm text-gray-500 mt-1"><i class="fa-solid fa-location-dot"></i> ${esc([store && countryName(store.country), store && store.city].filter(Boolean).join(' — ') || '—')} · ${items.length} ${isAr() ? 'منتج/خدمة' : 'listings'}</p>
                  <p class="text-sm text-gray-700 mt-3 leading-relaxed">${esc((store && store.description) || '')}</p>
                </div>
              </div>`;
            if (window.ServicesManager) ServicesManager._renderServiceCards(items, 'storeProductsGrid', 'storeProductsEmpty');
        },

        // ── Seller: my store + packages ──────────────────────────────────────
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
            let store = null, plans = [], count = 0;
            try {
                const [ss, ps, ls] = await Promise.all([
                    window.db.collection(COLLECTIONS.STORES).doc(user.uid).get(),
                    window.db.collection(COLLECTIONS.STORE_PLANS).get(),
                    window.db.collection(COLLECTIONS.SERVICES).where('sellerId', '==', user.uid).get(),
                ]);
                store = ss.exists ? { id: ss.id, ...ss.data() } : null;
                plans = ps.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.enabled !== false).sort((a, b) => (a.price || 0) - (b.price || 0));
                count = ls.size;
            } catch (e) { box.innerHTML = `<p class="text-center text-red-500 py-8">${esc(e.message)}</p>`; return; }

            const f = store && isFeatured(store);
            box.innerHTML = `
            <div class="grid lg:grid-cols-2 gap-6">
              <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h2 class="font-black text-gray-900 mb-1">${store ? (isAr() ? 'بيانات المتجر' : 'Store details') : (isAr() ? 'أنشئ متجرك' : 'Create your store')}</h2>
                <p class="text-xs text-gray-400 mb-4">${isAr() ? `كل منتجاتك وخدماتك (${count}) بتظهر في متجرك تلقائيًا.` : `All your ${count} listings appear in your store automatically.`}</p>
                <div class="space-y-3">
                  <div class="flex items-center gap-3"><img id="stLogoPrev" src="${esc((store && store.logo) || fallbackLogo(store && store.name))}" class="w-16 h-16 rounded-2xl object-cover border"><input type="file" id="stLogo" accept="image/*" class="text-xs"></div>
                  <div><label class="text-xs font-bold text-gray-600 block mb-1">${isAr() ? 'اسم المتجر' : 'Store name'}</label><input id="stName" maxlength="60" class="form-input w-full" value="${esc((store && store.name) || '')}"></div>
                  <div><label class="text-xs font-bold text-gray-600 block mb-1">${isAr() ? 'وصف المتجر' : 'Description'}</label><textarea id="stDesc" rows="3" maxlength="500" class="form-input w-full">${esc((store && store.description) || '')}</textarea></div>
                  <div class="grid grid-cols-2 gap-3">
                    <div><label class="text-xs font-bold text-gray-600 block mb-1">${isAr() ? 'الدولة' : 'Country'}</label><select id="stCountry" class="form-input w-full">${COUNTRIES.map(c => `<option value="${c[0]}" ${((store && store.country) || 'EG') === c[0] ? 'selected' : ''}>${isAr() ? c[1] : c[2]}</option>`).join('')}</select></div>
                    <div><label class="text-xs font-bold text-gray-600 block mb-1">${isAr() ? 'المدينة' : 'City'}</label><input id="stCity" maxlength="40" class="form-input w-full" value="${esc((store && store.city) || '')}"></div>
                  </div>
                  ${store ? `<label class="flex items-center gap-2 text-sm"><input type="checkbox" id="stPaused" ${store.status === 'paused' ? 'checked' : ''}> ${isAr() ? 'إيقاف المتجر مؤقتًا (يختفي من الصفحة)' : 'Pause store (hidden)'}</label>` : ''}
                  <button onclick="StoresManager.saveStore()" class="btn-primary w-full py-3">${store ? (isAr() ? 'حفظ' : 'Save') : (isAr() ? 'إنشاء المتجر' : 'Create store')}</button>
                  ${store ? `<button onclick="StoresManager.openStore('${esc(user.uid)}')" class="w-full py-2.5 text-sm font-bold border-2 border-navy-200 text-navy-700 rounded-xl hover:bg-navy-50">${isAr() ? 'معاينة متجري' : 'Preview my store'}</button>` : ''}
                </div>
              </div>
              <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h2 class="font-black text-gray-900 mb-1 flex items-center gap-2"><i class="fa-solid fa-star text-amber-500"></i>${isAr() ? 'الظهور في أول الصفحة' : 'Show at the top'}</h2>
                ${f ? `<p class="text-sm bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-amber-900">${isAr() ? 'متجرك مميز حاليًا — باقة' : 'Featured now — package'} <b>${esc(store.planName || '')}</b> ${isAr() ? 'لحد' : 'until'} <b>${new Date(toMs(store.featuredUntil)).toLocaleDateString(isAr() ? 'ar-EG' : 'en-GB')}</b>. ${isAr() ? 'شراء باقة جديدة بيمدّد المدة.' : 'Buying again extends it.'}</p>`
                       : `<p class="text-xs text-gray-400 mb-3">${isAr() ? 'اختار باقة وادفع علشان متجرك يظهر في أول الصفحة الرئيسية وأول قايمة المتاجر.' : 'Pick a package to show your store at the top of the home page.'}</p>`}
                ${!store ? `<p class="text-sm text-gray-500 bg-gray-50 rounded-xl p-4 text-center">${isAr() ? 'أنشئ متجرك الأول لتفعيل الباقات' : 'Create your store first'}</p>`
                  : (plans.length ? `<div class="space-y-3">${plans.map(p => `
                    <div class="border-2 border-gray-100 rounded-2xl p-4 flex items-center justify-between gap-3">
                      <div class="min-w-0"><p class="font-black text-gray-900">${esc(p.nameAr || p.name || '')}</p>
                        <p class="text-xs text-gray-500">${Number(p.days) || 0} ${isAr() ? 'يوم' : 'days'}${p.description ? ' — ' + esc(p.description) : ''}</p></div>
                      <button onclick="StoresManager.buyPlan('${esc(p.id)}')" class="btn-primary px-4 py-2 text-sm whitespace-nowrap">${Number(p.price) > 0 ? formatCurrency(p.price) : (isAr() ? 'مجانًا' : 'Free')}</button>
                    </div>`).join('')}</div>` : `<p class="text-sm text-gray-400 text-center py-6">${isAr() ? 'مفيش باقات متاحة حاليًا' : 'No packages available yet'}</p>`)}
              </div>
            </div>`;
            const lf = document.getElementById('stLogo');
            if (lf) lf.onchange = async () => {
                const file = lf.files[0]; if (!file) return;
                try { StoresManager._logo = await uploadFile(file, 'stores', 'logo_' + user.uid, { maxPx: 300, maxLen: 70000 }); document.getElementById('stLogoPrev').src = StoresManager._logo; }
                catch (e) { showToast(e.message, 'error'); }
            };
            this._logo = null;
        },

        async saveStore() {
            const user = AppState.currentUser; if (!user) return;
            const name = sanitizeInput(document.getElementById('stName')?.value?.trim() || '', 60);
            const description = sanitizeInput(document.getElementById('stDesc')?.value?.trim() || '', 500);
            const city = sanitizeInput(document.getElementById('stCity')?.value?.trim() || '', 40);
            const country = document.getElementById('stCountry')?.value || 'EG';
            if (name.length < 2) { showToast(isAr() ? 'اكتب اسم المتجر' : 'Enter a store name', 'warning'); return; }
            const leak = window.scanFieldsForContactLeak && window.scanFieldsForContactLeak([name, description, city]);
            if (leak) { showToast(window.contactLeakWarning(isAr()), 'error'); return; }
            showLoading();
            try {
                const ref = window.db.collection(COLLECTIONS.STORES).doc(user.uid);
                const snap = await ref.get();
                const base = { name, description, country, city, updatedAt: serverTimestamp() };
                if (this._logo) base.logo = this._logo;
                if (snap.exists) {
                    base.status = document.getElementById('stPaused')?.checked ? 'paused' : 'active';
                    await ref.update(base);
                } else {
                    await ref.set({ ownerId: user.uid, logo: this._logo || '', status: 'active', ...base, createdAt: serverTimestamp() });
                }
                hideLoading(); showToast(isAr() ? '✅ تم حفظ المتجر' : '✅ Store saved', 'success');
                this.initMyStorePage();
            } catch (e) { hideLoading(); showToast(e.message, 'error'); }
        },

        async buyPlan(planId) {
            showLoading(isAr() ? 'جاري تجهيز الدفع...' : 'Preparing payment...');
            try {
                const out = await api({ action: 'buyPlan', planId });
                hideLoading();
                if (out.redirectUrl) { window.location.href = out.redirectUrl; return; }
                showToast(isAr() ? '✅ تم تفعيل الباقة' : '✅ Package activated', 'success');
                this.initMyStorePage();
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
