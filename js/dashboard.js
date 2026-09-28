/**
 * ============================================================================
 * DASHBOARD.JS v4.0 — Full Admin Control · Seller · Buyer · Wallet
 * ============================================================================
 */
(function () {
    'use strict';

    // ══════════════════════════════════════════════════════════════════════════
    // DASHBOARD MANAGER
    // ══════════════════════════════════════════════════════════════════════════
    // ── Standalone helper (defined outside object to avoid template-literal escaping) ──
    function _renderTierRows(cfg, isAr) {
        var tiers = (cfg.TIERS && cfg.TIERS.length)
            ? cfg.TIERS
            : [{minAmount:0, maxAmount:500, feePercent:7, feeFixed:0}];
        return tiers.map(function(tier) {
            var fromLabel = isAr ? 'من' : 'From';
            var toLabel   = isAr ? 'إلى' : 'To';
            return '<div class="grid grid-cols-4 gap-2 items-end tier-row">' +
                '<div><label class="text-xs text-gray-500">' + fromLabel +
                '</label><input type="number" class="form-input w-full tier-min" value="' +
                tier.minAmount + '" min="0"></div>' +
                '<div><label class="text-xs text-gray-500">' + toLabel +
                '</label><input type="number" class="form-input w-full tier-max" value="' +
                tier.maxAmount + '" min="0"></div>' +
                '<div><label class="text-xs text-gray-500">%</label>' +
                '<input type="number" class="form-input w-full tier-pct" value="' +
                tier.feePercent + '" min="0" max="100" step="0.5"></div>' +
                '<button type="button" onclick="window._removeTierRow(this)"' +
                ' class="h-10 w-10 bg-red-100 text-red-600 rounded-xl' +
                ' flex items-center justify-center hover:bg-red-200">' +
                '<i class="fa-solid fa-trash text-xs"></i></button>' +
                '</div>';
        }).join('');
    }
    window._removeTierRow = function(btn) { btn.closest('.tier-row').remove(); };

        const DashboardManager = {

        async initDashboardPage() {
            const container = document.getElementById('dashboardContent');
            if (!container) return;
            const user = AppState.currentUser;
            if (!user) {
                container.innerHTML = `<div class="text-center py-20"><button onclick="navigateTo('login')" class="btn-primary px-8">${t('auth.login')}</button></div>`;
                return;
            }
            const role = user.role;
            if (role === 'admin')  { this.renderAdminDashboard(container);  return; }
            if (role === 'seller') { this.renderSellerDashboard(container); return; }
            this.renderBuyerDashboard(container);
        },

        // ── Buyer ─────────────────────────────────────────────────────────────
        renderBuyerDashboard(container) {
            const user = AppState.currentUser, isAr = AppState.language !== 'en', wallet = AppState.wallet || {};
            container.innerHTML = `
            <div>
              <div class="flex items-center justify-between mb-8">
                <div><h1 class="text-2xl font-black text-gray-900">${isAr?`مرحباً، ${user.displayName?.split(' ')[0]}! 👋`:`Welcome, ${user.displayName?.split(' ')[0]}! 👋`}</h1>
                  <p class="text-gray-500 text-sm">${isAr?'لوحة المشتري':'Buyer Dashboard'}</p></div>
                <button onclick="navigateTo('services')" class="btn-primary px-5 py-2.5 text-sm"><i class="fa-solid fa-plus me-1"></i>${isAr?'طلب خدمة':'Order Service'}</button>
              </div>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center"><i class="fa-solid fa-bag-shopping text-blue-600 text-2xl mb-2"></i><p id="buyerTotalOrders" class="text-2xl font-black text-gray-900">—</p><p class="text-sm text-gray-500">${isAr?'الطلبات':'Orders'}</p></div>
                <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center"><i class="fa-solid fa-circle-check text-green-600 text-2xl mb-2"></i><p id="buyerCompletedOrders" class="text-2xl font-black text-gray-900">—</p><p class="text-sm text-gray-500">${isAr?'مكتملة':'Completed'}</p></div>
                <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center"><i class="fa-solid fa-wallet text-amber-600 text-2xl mb-2"></i><p class="text-2xl font-black text-gray-900">${formatCurrency(wallet.balance||0)}</p><p class="text-sm text-gray-500">${isAr?'المحفظة':'Wallet'}</p></div>
                <div class="bg-gradient-to-br from-brand-50 to-brand-100 rounded-2xl p-5 border border-brand-200 text-center cursor-pointer hover:border-brand-400 transition" onclick="DashboardManager.switchToSellerView()">
  <i class="fa-solid fa-rocket text-brand-600 text-2xl mb-2"></i>
  <p class="font-black text-brand-700 text-sm">${isAr?'انتقل للبيع':'Start Selling'}</p>
  <p class="text-brand-500 text-xs mt-1">${isAr?'لوحة البائع':'Seller View'}</p>
</div>
              </div>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <button onclick="navigateTo('orders')" class="bg-white rounded-2xl p-5 text-center border border-gray-100 hover:border-brand-300 transition"><i class="fa-solid fa-receipt text-brand-600 text-2xl mb-2"></i><p class="font-bold text-gray-800 text-sm">${t('orders.title')}</p></button>
                <button onclick="navigateTo('wallet')" class="bg-white rounded-2xl p-5 text-center border border-gray-100 hover:border-brand-300 transition"><i class="fa-solid fa-wallet text-green-600 text-2xl mb-2"></i><p class="font-bold text-gray-800 text-sm">${t('nav.wallet')}</p></button>
                <button onclick="navigateTo('profile')" class="bg-white rounded-2xl p-5 text-center border border-gray-100 hover:border-brand-300 transition"><i class="fa-solid fa-user text-purple-600 text-2xl mb-2"></i><p class="font-bold text-gray-800 text-sm">${t('nav.profile')}</p></button>
                <button onclick="navigateTo('services')" class="bg-white rounded-2xl p-5 text-center border border-gray-100 hover:border-brand-300 transition"><i class="fa-solid fa-store text-orange-500 text-2xl mb-2"></i><p class="font-bold text-gray-800 text-sm">${isAr?'تصفح الخدمات':'Browse'}</p></button>
              </div>
              <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"><h3 class="font-black text-gray-900 mb-4">${isAr?'آخر الطلبات':'Recent Orders'}</h3><div id="buyerRecentOrders"></div></div>
            </div>`;
            this._loadBuyerStats();
        },

        async _loadBuyerStats() {
            const user = AppState.currentUser;
            try {
                const snap = await window.db.collection(COLLECTIONS.ORDERS).where('buyerId','==',user.uid).get();
                const orders = snap.docs.map(d=>d.data()), completed = orders.filter(o=>o.status===ORDER_STATUS.COMPLETED).length;
                document.getElementById('buyerTotalOrders').textContent = orders.length;
                document.getElementById('buyerCompletedOrders').textContent = completed;
                const recent = snap.docs.slice(0,5).map(d=>({id:d.id,...d.data()}));
                const c = document.getElementById('buyerRecentOrders');
                if (c) c.innerHTML = recent.length===0 ? `<p class="text-gray-400 text-center py-4">${t('orders.empty')}</p>` : recent.map(o=>`
                  <div class="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 rounded-xl px-2" onclick="openWorkspace('${o.id}')">
                    <div class="flex-1 min-w-0"><p class="font-bold text-gray-900 text-sm truncate">${o.serviceTitle||'—'}</p><p class="text-xs text-gray-400">${formatDateAr(o.createdAt)}</p></div>
                    <span class="status-badge ${getStatusClass(o.status)} text-xs">${getStatusText(o.status)}</span>
                  </div>`).join('');
            } catch(e) { console.warn('[Buyer]',e.message); }
        },

        // ── Seller ────────────────────────────────────────────────────────────
        async renderSellerDashboard(container) {
            const user = AppState.currentUser, isAr = AppState.language !== 'en', wallet = AppState.wallet||{};
            // Wrapper with wallet strip + seller dashboard tabs
            container.innerHTML = `
            <div>
              <!-- Header -->
              <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                  <h1 class="text-2xl font-black text-gray-900">${isAr?'لوحة البائع':'Seller Panel'}</h1>
                  <p class="text-gray-500 text-sm">${user.displayName||''}</p>
                </div>
                <div class="flex gap-3 flex-wrap">
                  <button onclick="DashboardManager.switchToBuyerView()" class="btn-secondary text-sm px-4 py-2.5 flex items-center gap-2">
                    <i class="fa-solid fa-bag-shopping"></i>${isAr?'واجهة المشتري':'Buyer View'}
                  </button>
                  <button onclick="navigateTo('wallet')" class="bg-white border-2 border-gray-200 text-gray-700 rounded-xl text-sm px-4 py-2.5 flex items-center gap-2 hover:border-brand-400 transition">
                    <i class="fa-solid fa-wallet text-amber-500"></i>
                    <span class="font-black">${formatCurrency(wallet.balance||0)}</span>
                  </button>
                </div>
              </div>
              <!-- Full Seller Dashboard -->
              <div id="sellerDashWrapper"></div>
            </div>`;
            // Render the full SellerDash module
            const wrapper = document.getElementById('sellerDashWrapper');
            if (wrapper && window.SellerDash) {
                await window.SellerDash.render(wrapper);
            }
        },

        async loadSellerServices() {
            const user = AppState.currentUser, container = document.getElementById('sellerServicesList');
            if (!container || !user) return;
            const isAr = AppState.language !== 'en';
            try {
                const snap = await window.db.collection(COLLECTIONS.SERVICES).where('sellerId','==',user.uid).get();
                const cnt = document.getElementById('sellerServicesCount');
                if (cnt) cnt.textContent = snap.size;
                if (snap.empty) { container.innerHTML = `<div class="text-center py-8"><i class="fa-solid fa-layer-group text-gray-200 text-4xl mb-3"></i><p class="text-gray-400">${isAr?'لا توجد خدمات بعد':'No services yet'}</p></div>`; return; }
                container.innerHTML = snap.docs.map(doc => {
                    const s = {id:doc.id,...doc.data()};
                    const editData = JSON.stringify({id:s.id,title:s.title||'',description:s.description||'',category:s.category||'',price:s.price||0,deliveryDays:s.deliveryDays||3,revisions:s.revisions||2,image:s.image||''}).replace(/"/g,'&quot;');
                    return `
                    <div class="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0" data-service-id="${s.id}">
                      <img src="${s.image||'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=80'}" class="w-12 h-12 rounded-xl object-cover flex-shrink-0">
                      <div class="flex-1 min-w-0"><p class="font-bold text-gray-900 truncate">${s.title||'—'}</p><p class="text-sm text-gray-500">${formatCurrency(s.price||0)} · ${s.orderCount||0} ${isAr?'طلب':'orders'}</p></div>
                      <div class="flex gap-2">
                        <button onclick="ServicesManager._renderAddServiceForm(${editData});navigateTo('add-service')" class="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600 hover:bg-brand-100 hover:text-brand-600 transition"><i class="fa-solid fa-pen text-xs"></i></button>
                        <button onclick="ServicesManager.deleteService('${s.id}')" class="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600 hover:bg-red-100 hover:text-red-600 transition"><i class="fa-solid fa-trash text-xs"></i></button>
                      </div>
                    </div>`;
                }).join('');
            } catch(e) { console.warn('[Seller] Services:',e.message); }
        },

        async _loadSellerStats() {
            const user = AppState.currentUser;
            try {
                const ordersSnap = await window.db.collection(COLLECTIONS.ORDERS).where('sellerId','==',user.uid).get();
                const orders = ordersSnap.docs.map(d=>d.data());
                const el = document.getElementById('sellerOrders');
                if (el) el.textContent = orders.length;
                const reviewsSnap = await window.db.collection(COLLECTIONS.REVIEWS).where('sellerId','==',user.uid).get();
                if (!reviewsSnap.empty) {
                    const avg = reviewsSnap.docs.reduce((s,d)=>s+(d.data().rating||0),0)/reviewsSnap.size;
                    const el2 = document.getElementById('sellerRating');
                    if (el2) el2.textContent = avg.toFixed(1)+' ⭐';
                }
                const recent = ordersSnap.docs.slice(0,5).map(d=>({id:d.id,...d.data()}));
                const c = document.getElementById('sellerRecentOrders');
                if (c) c.innerHTML = recent.length===0 ? `<p class="text-gray-400 text-center py-4">${t('orders.empty')}</p>` : recent.map(o=>`
                  <div class="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 rounded-xl px-2" onclick="openWorkspace('${o.id}')">
                    <div class="flex-1 min-w-0"><p class="font-bold text-gray-900 text-sm truncate">${o.serviceTitle||'—'}</p><p class="text-xs text-gray-400">${o.buyerName||'—'} · ${formatDateAr(o.createdAt)}</p></div>
                    <div class="flex items-center gap-2"><span class="font-black text-brand-700 text-sm">${formatCurrency(o.price||0)}</span><span class="status-badge ${getStatusClass(o.status)} text-xs">${getStatusText(o.status)}</span></div>
                  </div>`).join('');
            } catch(e) { console.warn('[Seller] Stats:',e.message); }
        },

        // ── Admin Dashboard (entry point from /dashboard for admin role) ──────

        async renderAdminDashboard(container) {
            // Redirect to the dedicated admin page which has full control
            navigateTo('admin');
        },

        // ── Role Switching: Buyer ↔ Seller ──────────────────────────────────
        switchToBuyerView() {
            // Temporarily render buyer view without changing Firestore role
            AppState._viewMode = 'buyer';
            const container = document.getElementById('dashboardContent');
            if (container) this.renderBuyerDashboard(container);
            const isAr = AppState.language !== 'en';
            showToast(isAr ? 'تم الانتقال لواجهة المشتري' : 'Switched to Buyer view', 'success');
        },

        switchToSellerView() {
            const user = AppState.currentUser;
            if (!user) return navigateTo('login');
            const isAr = AppState.language !== 'en';
            if (user.role !== 'seller' && user.role !== 'admin') {
                // Upgrade to seller
                AuthManager.upgradeToSeller();
            } else {
                AppState._viewMode = 'seller';
                const container = document.getElementById('dashboardContent');
                if (container) this.renderSellerDashboard(container);
                showToast(isAr ? 'تم الانتقال لواجهة البائع' : 'Switched to Seller view', 'success');
            }
        },

        async _loadAdminStats() {
            try {
                const [usersSnap, servicesSnap, ordersSnap] = await Promise.all([
                    window.db.collection(COLLECTIONS.USERS).get(),
                    window.db.collection(COLLECTIONS.SERVICES).get(),
                    window.db.collection(COLLECTIONS.ORDERS).get(),
                ]);
                const totalRevenue = ordersSnap.docs.reduce((s,d)=>s+(d.data().price||0),0);
                const isAr = AppState.language !== 'en';
                const row = document.getElementById('adminStatsRow');
                if (!row) return;
                row.innerHTML = `
                  <div class="bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl p-5 text-white text-center"><p class="text-3xl font-black">${usersSnap.size}</p><p class="text-brand-200 text-sm mt-1">${isAr?'مستخدم':'Users'}</p></div>
                  <div class="bg-gradient-to-br from-teal-500 to-teal-700 rounded-2xl p-5 text-white text-center"><p class="text-3xl font-black">${servicesSnap.size}</p><p class="text-teal-200 text-sm mt-1">${isAr?'خدمة':'Services'}</p></div>
                  <div class="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-5 text-white text-center"><p class="text-3xl font-black">${ordersSnap.size}</p><p class="text-amber-200 text-sm mt-1">${isAr?'طلب':'Orders'}</p></div>
                  <div class="bg-gradient-to-br from-purple-500 to-purple-700 rounded-2xl p-5 text-white text-center"><p class="text-3xl font-black">${formatCurrency(calcPlatformFee(totalRevenue))}</p><p class="text-purple-200 text-sm mt-1">${isAr?'إيرادات المنصة':'Platform Revenue'}</p></div>`;
            } catch(e) { console.warn('[Admin Stats]',e.message); }
        },
    };

    // ══════════════════════════════════════════════════════════════════════════
    // ADMIN TAB RENDERER — كل تاب بتحكم كامل
    // ══════════════════════════════════════════════════════════════════════════
    async function adminTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`adminTab_${tab}`)?.classList.add('active');
        const container = document.getElementById('adminTabContent');
        if (!container) return;
        const isAr = AppState.language !== 'en';
        container.innerHTML = `<div class="text-center py-8"><i class="fa-solid fa-spinner fa-spin text-brand-500 text-2xl"></i></div>`;
        try {

            // ── ORDERS ────────────────────────────────────────────────────────
            if (tab === 'orders') {
                const ordersSnap = await window.db.collection(COLLECTIONS.ORDERS).orderBy('createdAt','desc').limit(100).get();
                const orders = ordersSnap.docs.map(d=>({id:d.id,...d.data()}));
                container.innerHTML = `
                <div class="flex items-center justify-between mb-4">
                  <h3 class="font-black text-gray-900">${isAr?`الطلبات (${orders.length})`:`Orders (${orders.length})`}</h3>
                </div>
                ${orders.length===0 ? `<p class="text-gray-400 text-center py-8">${t('orders.empty')}</p>` : `
                <div class="space-y-2">${orders.map(o=>`
                  <div class="flex flex-wrap items-center gap-3 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition">
                    <div class="flex-1 min-w-0 cursor-pointer" onclick="openWorkspace('${o.id}')">
                      <p class="font-bold text-gray-900 text-sm truncate">${o.serviceTitle||'—'}</p>
                      <p class="text-xs text-gray-400">${o.buyerName||'—'} → ${o.sellerName||'—'} · ${formatDateAr(o.createdAt)}</p>
                    </div>
                    <span class="font-black text-brand-700 text-sm">${formatCurrency(o.price||0)}</span>
                    <span class="status-badge ${getStatusClass(o.status)} text-xs">${getStatusText(o.status)}</span>
                    <div class="flex gap-1">
                      <button title="${isAr?'إتمام قسري':'Force Complete'}" onclick="window._adminForceStatus('${o.id}','completed')" class="w-7 h-7 bg-green-100 text-green-700 rounded-lg text-xs flex items-center justify-center hover:bg-green-200 transition"><i class="fa-solid fa-check"></i></button>
                      <button title="${isAr?'إلغاء قسري':'Force Cancel'}" onclick="window._adminForceStatus('${o.id}','cancelled')" class="w-7 h-7 bg-red-100 text-red-700 rounded-lg text-xs flex items-center justify-center hover:bg-red-200 transition"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                  </div>`).join('')}
                </div>`}`;

                window._adminForceStatus = async (orderId, status) => {
                    if (!confirm(isAr?`تغيير الحالة لـ "${status}"؟`:`Force status to "${status}"?`)) return;
                    showLoading();
                    try {
                        await window.db.collection(COLLECTIONS.ORDERS).doc(orderId).update({ status, updatedAt: serverTimestamp() });
                        hideLoading(); showToast(isAr?'✅ تم التحديث':'✅ Updated','success');
                        adminTab('orders');
                    } catch(e) { hideLoading(); showToast(e.message,'error'); }
                };

            // ── DISPUTES ──────────────────────────────────────────────────────
            } else if (tab === 'disputes') {
                const [openSnap, allSnap] = await Promise.all([
                    window.db.collection(COLLECTIONS.DISPUTES).where('status','==','open').get(),
                    window.db.collection(COLLECTIONS.DISPUTES).orderBy('createdAt','desc').limit(30).get(),
                ]);
                const open = openSnap.docs.map(d=>({id:d.id,...d.data()}));
                const all  = allSnap.docs.map(d=>({id:d.id,...d.data()}));
                container.innerHTML = `
                ${open.length===0
                  ? `<div class="text-center py-6 mb-6 bg-green-50 rounded-2xl border border-green-200"><p class="text-green-700 font-bold">✅ ${isAr?'لا توجد نزاعات مفتوحة':'No open disputes'}</p></div>`
                  : `<div class="space-y-4 mb-8">${open.map(d=>`
                    <div class="p-5 bg-red-50 rounded-2xl border border-red-200">
                      <div class="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p class="font-black text-gray-900">${isAr?'نزاع على الطلب':'Dispute on order'} #${(d.orderId||'').substr(-8).toUpperCase()}</p>
                          <p class="text-sm text-gray-600 mt-1">${d.reason||'—'}</p>
                          <p class="text-xs text-gray-400 mt-1">${isAr?'رُفع بواسطة:':'Raised by:'} ${d.raisedByName||d.raisedBy||'—'}</p>
                        </div>
                        <span class="text-xs bg-red-100 text-red-700 font-bold px-3 py-1 rounded-full flex-shrink-0">${isAr?'مفتوح':'Open'}</span>
                      </div>
                      <div class="flex gap-2 flex-wrap">
                        <button onclick="EscrowManager.resolveDispute('${d.id}','refund_buyer','${d.orderId}')" class="text-sm px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition">${isAr?'↩ استرداد للمشتري':'↩ Refund Buyer'}</button>
                        <button onclick="EscrowManager.resolveDispute('${d.id}','pay_seller','${d.orderId}')" class="text-sm px-4 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition">${isAr?'✓ دفع للبائع':'✓ Pay Seller'}</button>
                      </div>
                    </div>`).join('')}</div>`}
                <h4 class="font-black text-gray-700 mb-3 text-sm">${isAr?'سجل النزاعات':'Dispute History'}</h4>
                <div class="space-y-2">${all.map(d=>`
                  <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <div class="flex-1 min-w-0"><p class="text-sm font-bold text-gray-800">#${(d.orderId||'').substr(-8).toUpperCase()}</p><p class="text-xs text-gray-400">${d.reason||'—'}</p></div>
                    <span class="text-xs font-bold px-2 py-1 rounded-lg ${d.status==='open'?'bg-red-100 text-red-700':'bg-green-100 text-green-700'}">${d.status==='open'?(isAr?'مفتوح':'Open'):(isAr?'محلول':'Resolved')}</span>
                  </div>`).join('')}
                </div>`;

            // ── USERS ─────────────────────────────────────────────────────────
            } else if (tab === 'users') {
                const usersSnap = await window.db.collection(COLLECTIONS.USERS).orderBy('createdAt','desc').limit(100).get();
                const users = usersSnap.docs.map(d=>({id:d.id,...d.data()}));
                container.innerHTML = `
                <div class="flex items-center justify-between mb-4">
                  <h3 class="font-black text-gray-900">${isAr?`المستخدمون (${users.length})`:`Users (${users.length})`}</h3>
                </div>
                <div class="space-y-2">${users.map(u=>`
                  <div class="flex items-center gap-3 p-4 bg-gray-50 rounded-xl" id="urow_${u.id}">
                    <img src="${u.avatar||`https://ui-avatars.com/api/?name=${encodeURIComponent(u.name||'U')}&background=0284c7&color=fff`}" class="w-10 h-10 rounded-xl object-cover flex-shrink-0">
                    <div class="flex-1 min-w-0"><p class="font-bold text-gray-900 truncate">${u.name||'—'}</p><p class="text-xs text-gray-400">${u.email||''}</p></div>
                    <select onchange="window._adminChangeRole('${u.id}',this.value,this)" class="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white font-bold ${u.role==='admin'?'text-purple-700':u.role==='seller'?'text-green-700':'text-blue-700'}">
                      <option value="buyer"  ${u.role==='buyer' ?'selected':''}>buyer</option>
                      <option value="seller" ${u.role==='seller'?'selected':''}>seller</option>
                      <option value="admin"  ${u.role==='admin' ?'selected':''}>admin</option>
                    </select>
                    <button title="${isAr?'عرض المحفظة':'View Wallet'}" onclick="window._adminViewWallet('${u.id}','${u.name||'User'}')" class="w-8 h-8 bg-amber-100 text-amber-700 rounded-lg flex items-center justify-center hover:bg-amber-200 transition"><i class="fa-solid fa-wallet text-xs"></i></button>
                    <span class="text-xs text-gray-400 hidden md:block">${formatDateAr(u.createdAt)}</span>
                  </div>`).join('')}
                </div>`;

                window._adminChangeRole = async (uid, role, sel) => {
                    if (!confirm(isAr?`تغيير الدور لـ "${role}"؟`:`Change role to "${role}"?`)) { sel.value = sel.getAttribute('data-old')||'buyer'; return; }
                    sel.setAttribute('data-old', role);
                    try {
                        await window.db.collection(COLLECTIONS.USERS).doc(uid).update({ role, updatedAt: serverTimestamp() });
                        showToast(isAr?`✅ تم تغيير الدور لـ ${role}`:`✅ Role changed to ${role}`,'success');
                    } catch(e) { showToast(e.message,'error'); }
                };

                window._adminViewWallet = async (uid, name) => {
                    try {
                        const snap = await window.db.collection(COLLECTIONS.WALLET).doc(uid).get();
                        const bal = snap.exists ? (snap.data().balance||0) : 0;
                        const newBal = prompt(isAr?`رصيد "${name}" الحالي: ${formatCurrency(bal)}\nأدخل الرصيد الجديد:`:`Current balance of "${name}": ${formatCurrency(bal)}\nEnter new balance:`, bal);
                        if (newBal === null) return;
                        const numBal = parseFloat(newBal);
                        if (isNaN(numBal) || numBal < 0) { showToast(isAr?'رقم غير صالح':'Invalid number','error'); return; }
                        await window.db.collection(COLLECTIONS.WALLET).doc(uid).set({ balance: numBal, currency:'EGP', updatedAt: serverTimestamp() }, {merge:true});
                        showToast(isAr?`✅ تم تحديث رصيد ${name} لـ ${formatCurrency(numBal)}`:`✅ Updated ${name}'s balance to ${formatCurrency(numBal)}`,'success');
                    } catch(e) { showToast(e.message,'error'); }
                };

            // ── SERVICES ──────────────────────────────────────────────────────
            } else if (tab === 'services') {
                const servicesSnap = await window.db.collection(COLLECTIONS.SERVICES).orderBy('createdAt','desc').limit(100).get();
                const services = servicesSnap.docs.map(d=>({id:d.id,...d.data()}));
                container.innerHTML = `
                <div class="flex items-center justify-between mb-4">
                  <h3 class="font-black text-gray-900">${isAr?`الخدمات (${services.length})`:`Services (${services.length})`}</h3>
                </div>
                <div class="space-y-2">${services.map(s=>`
                  <div class="flex items-center gap-3 p-4 bg-gray-50 rounded-xl" data-service-id="${s.id}">
                    <img src="${s.image||'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=80'}" class="w-12 h-12 rounded-xl object-cover flex-shrink-0">
                    <div class="flex-1 min-w-0">
                      <p class="font-bold text-gray-900 text-sm truncate">${s.title||'—'}</p>
                      <p class="text-xs text-gray-400">${s.sellerName||''} · ${formatCurrency(s.price||0)}</p>
                    </div>
                    <div class="flex items-center gap-1 flex-wrap">
                      <button title="${s.featured?'إلغاء التمييز':'تمييز'}" onclick="window._adminToggleFeatured('${s.id}',${!s.featured})"
                        class="text-xs px-2 py-1.5 ${s.featured?'bg-yellow-200 text-yellow-800':'bg-gray-200 text-gray-600'} rounded-lg font-bold hover:opacity-80 transition">
                        ${s.featured?'⭐ مميزة':'☆ تمييز'}
                      </button>
                      <button title="${s.active===false?'تفعيل':'إيقاف'}" onclick="window._adminToggleActive('${s.id}',${s.active!==false})"
                        class="text-xs px-2 py-1.5 ${s.active===false?'bg-red-100 text-red-700':'bg-green-100 text-green-700'} rounded-lg font-bold hover:opacity-80 transition">
                        ${s.active===false?(isAr?'موقوفة':'Inactive'):(isAr?'نشطة':'Active')}
                      </button>
                      <button onclick="ServicesManager.deleteService('${s.id}')" class="text-xs px-2 py-1.5 bg-red-100 text-red-700 rounded-lg font-bold hover:bg-red-200 transition">${t('general.delete')}</button>
                    </div>
                  </div>`).join('')}
                </div>`;

                window._adminToggleFeatured = async (id, val) => {
                    try {
                        await window.db.collection(COLLECTIONS.SERVICES).doc(id).update({ featured: val, updatedAt: serverTimestamp() });
                        showToast(val?(isAr?'✅ تم التمييز':'✅ Featured'):(isAr?'تم إلغاء التمييز':'Unfeatured'),'success');
                        adminTab('services');
                    } catch(e) { showToast(e.message,'error'); }
                };
                window._adminToggleActive = async (id, currentlyActive) => {
                    const newVal = !currentlyActive;
                    try {
                        await window.db.collection(COLLECTIONS.SERVICES).doc(id).update({ active: newVal, updatedAt: serverTimestamp() });
                        showToast(newVal?(isAr?'✅ تم التفعيل':'✅ Activated'):(isAr?'⏸ تم الإيقاف':'⏸ Deactivated'),'success');
                        adminTab('services');
                    } catch(e) { showToast(e.message,'error'); }
                };

            // ── WITHDRAWALS ───────────────────────────────────────────────────
            } else if (tab === 'withdraw') {
                const [pendingSnap, allSnap] = await Promise.all([
                    window.db.collection(COLLECTIONS.WITHDRAWALS).where('status','==','pending').orderBy('createdAt','desc').get(),
                    window.db.collection(COLLECTIONS.WITHDRAWALS).orderBy('createdAt','desc').limit(50).get(),
                ]);
                const pending = pendingSnap.docs.map(d=>({id:d.id,...d.data()}));
                const all    = allSnap.docs.map(d=>({id:d.id,...d.data()}));
                container.innerHTML = `
                <h3 class="font-black text-gray-900 mb-4">${isAr?`طلبات معلقة (${pending.length})`:`Pending (${pending.length})`}</h3>
                ${pending.length===0
                  ? `<div class="text-center py-6 mb-6 bg-green-50 rounded-2xl border border-green-200"><p class="text-green-700 font-bold">✅ ${isAr?'لا توجد طلبات معلقة':'No pending requests'}</p></div>`
                  : `<div class="space-y-3 mb-8">${pending.map(r=>`
                    <div class="flex flex-wrap items-center gap-3 p-5 bg-amber-50 rounded-2xl border border-amber-200">
                      <div class="flex-1 min-w-0">
                        <p class="font-black text-gray-900">${r.userName||'—'}</p>
                        <p class="text-sm text-gray-600">${r.method||'—'} · ${r.accountInfo||'—'}</p>
                        <p class="text-xs text-gray-400">${formatDateAr(r.createdAt)}</p>
                      </div>
                      <span class="font-black text-amber-700 text-xl">${formatCurrency(r.amount||0)}</span>
                      <div class="flex gap-2">
                        <button onclick="WalletManager.approveWithdrawal('${r.id}')" class="text-sm px-4 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition">${isAr?'✓ موافقة':'✓ Approve'}</button>
                        <button onclick="WalletManager.rejectWithdrawal('${r.id}')" class="text-sm px-4 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition">${isAr?'✕ رفض':'✕ Reject'}</button>
                      </div>
                    </div>`).join('')}</div>`}
                <h4 class="font-black text-gray-700 mb-3 text-sm">${isAr?'سجل السحوبات':'Withdrawal History'}</h4>
                <div class="space-y-2">${all.map(r=>`
                  <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <div class="flex-1 min-w-0"><p class="text-sm font-bold text-gray-800">${r.userName||'—'}</p><p class="text-xs text-gray-400">${r.method||'—'} · ${r.accountInfo||'—'}</p></div>
                    <span class="font-black text-sm">${formatCurrency(r.amount||0)}</span>
                    <span class="text-xs font-bold px-2 py-1 rounded-lg ${r.status==='approved'?'bg-green-100 text-green-700':r.status==='rejected'?'bg-red-100 text-red-700':'bg-amber-100 text-amber-700'}">${r.status==='approved'?(isAr?'مقبول':'Approved'):r.status==='rejected'?(isAr?'مرفوض':'Rejected'):(isAr?'معلق':'Pending')}</span>
                  </div>`).join('')}
                </div>`;

            // ── COUPONS ───────────────────────────────────────────────────────
            } else if (tab === 'coupons') {
                const couponsSnap = await window.db.collection(COLLECTIONS.COUPONS).get();
                const coupons = couponsSnap.docs.map(d=>({id:d.id,...d.data()}));
                container.innerHTML = `
                <div class="flex items-center justify-between mb-6">
                  <h3 class="font-black text-gray-900">${isAr?`الكوبونات (${coupons.length})`:`Coupons (${coupons.length})`}</h3>
                  <button onclick="window._adminAddCoupon()" class="btn-primary text-sm px-4 py-2"><i class="fa-solid fa-plus me-1"></i>${isAr?'إضافة كوبون':'Add Coupon'}</button>
                </div>
                <div class="space-y-2" id="couponsList">
                ${coupons.length===0 ? `<p class="text-gray-400 text-center py-6">${isAr?'لا توجد كوبونات':'No coupons yet'}</p>` : coupons.map(c=>`
                  <div class="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
                    <div class="w-20 bg-brand-100 rounded-lg text-center py-2"><p class="font-black text-brand-700 text-sm tracking-widest">${c.code||'—'}</p></div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-bold text-gray-800">${c.type==='percent'?`${c.value}% خصم`:c.type==='fixed'?`خصم ${formatCurrency(c.value)}`:'—'}</p>
                      ${c.minOrder?`<p class="text-xs text-gray-400">${isAr?'حد أدنى':'Min'}: ${formatCurrency(c.minOrder)}</p>`:''}
                      ${c.usageLimit?`<p class="text-xs text-gray-400">${isAr?'الحد':'Limit'}: ${c.usageCount||0}/${c.usageLimit}</p>`:''}
                    </div>
                    <button onclick="window._adminToggleCoupon('${c.id}',${!c.active})" class="text-xs px-3 py-1.5 ${c.active?'bg-green-100 text-green-700':'bg-red-100 text-red-700'} rounded-lg font-bold hover:opacity-80 transition">${c.active?(isAr?'نشط':'Active'):(isAr?'موقوف':'Inactive')}</button>
                    <button onclick="window._adminDeleteCoupon('${c.id}')" class="w-7 h-7 bg-red-100 text-red-700 rounded-lg flex items-center justify-center hover:bg-red-200 transition"><i class="fa-solid fa-trash text-xs"></i></button>
                  </div>`).join('')}
                </div>`;

                window._adminAddCoupon = () => {
                    const existing = document.getElementById('couponFormModal');
                    if (existing) existing.remove();
                    const modal = document.createElement('div');
                    modal.id = 'couponFormModal';
                    modal.className = 'fixed inset-0 bg-black/70 z-[99999] flex items-center justify-center p-4';
                    modal.innerHTML = `
                    <div class="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
                      <h3 class="text-xl font-black text-gray-900 mb-6">${isAr?'إضافة كوبون جديد':'Add New Coupon'}</h3>
                      <div class="space-y-4">
                        <div><label class="block text-sm font-bold text-gray-700 mb-1">${isAr?'كود الكوبون':'Coupon Code'}</label>
                          <input type="text" id="cpn_code" class="form-input w-full uppercase" placeholder="SAVE20" style="text-transform:uppercase" oninput="this.value=this.value.toUpperCase()"></div>
                        <div class="grid grid-cols-2 gap-3">
                          <div><label class="block text-sm font-bold text-gray-700 mb-1">${isAr?'النوع':'Type'}</label>
                            <select id="cpn_type" class="form-input w-full"><option value="percent">${isAr?'نسبة مئوية':'Percent %'}</option><option value="fixed">${isAr?'مبلغ ثابت':'Fixed Amount'}</option></select></div>
                          <div><label class="block text-sm font-bold text-gray-700 mb-1">${isAr?'القيمة':'Value'}</label>
                            <input type="number" id="cpn_value" class="form-input w-full" min="1" placeholder="20"></div>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                          <div><label class="block text-sm font-bold text-gray-700 mb-1">${isAr?'حد أدنى للطلب':'Min Order'}</label>
                            <input type="number" id="cpn_min" class="form-input w-full" min="0" placeholder="0"></div>
                          <div><label class="block text-sm font-bold text-gray-700 mb-1">${isAr?'حد الاستخدام':'Usage Limit'}</label>
                            <input type="number" id="cpn_limit" class="form-input w-full" min="0" placeholder="${isAr?'غير محدود':'Unlimited'}"></div>
                        </div>
                      </div>
                      <div class="flex gap-3 mt-6">
                        <button onclick="document.getElementById('couponFormModal').remove()" class="btn-secondary flex-1 py-3">${t('general.cancel')}</button>
                        <button onclick="window._adminSaveCoupon()" class="btn-primary flex-1 py-3">${isAr?'إضافة':'Add'}</button>
                      </div>
                    </div>`;
                    document.body.appendChild(modal);
                };

                window._adminSaveCoupon = async () => {
                    const code  = document.getElementById('cpn_code')?.value?.trim().toUpperCase();
                    const type  = document.getElementById('cpn_type')?.value;
                    const value = parseFloat(document.getElementById('cpn_value')?.value);
                    const min   = parseFloat(document.getElementById('cpn_min')?.value)||0;
                    const limit = parseInt(document.getElementById('cpn_limit')?.value)||null;
                    if (!code||!type||isNaN(value)||value<=0) { showToast(isAr?'أدخل بيانات صحيحة':'Fill all fields','warning'); return; }
                    try {
                        await window.db.collection(COLLECTIONS.COUPONS).doc(code).set({ code, type, value, minOrder:min, usageLimit:limit, usageCount:0, active:true, createdAt:serverTimestamp() });
                        document.getElementById('couponFormModal')?.remove();
                        showToast(isAr?`✅ تم إضافة كوبون ${code}`:`✅ Coupon ${code} added`,'success');
                        adminTab('coupons');
                    } catch(e) { showToast(e.message,'error'); }
                };

                window._adminToggleCoupon = async (id, val) => {
                    try { await window.db.collection(COLLECTIONS.COUPONS).doc(id).update({ active: val }); showToast(isAr?'✅ تم التحديث':'✅ Updated','success'); adminTab('coupons'); }
                    catch(e) { showToast(e.message,'error'); }
                };
                window._adminDeleteCoupon = async (id) => {
                    if (!confirm(isAr?'حذف الكوبون نهائياً؟':'Delete coupon permanently?')) return;
                    try { await window.db.collection(COLLECTIONS.COUPONS).doc(id).delete(); showToast(isAr?'✅ تم الحذف':'✅ Deleted','success'); adminTab('coupons'); }
                    catch(e) { showToast(e.message,'error'); }
                };

            // ── CATEGORIES ────────────────────────────────────────────────────
            } else if (tab === 'categories') {
                const catsSnap = await window.db.collection(COLLECTIONS.CATEGORIES).orderBy('order','asc').get();
                const cats = catsSnap.docs.map(d=>({id:d.id,...d.data()}));
                container.innerHTML = `
                <div class="flex items-center justify-between mb-6">
                  <h3 class="font-black text-gray-900">${isAr?`الفئات (${cats.length})`:`Categories (${cats.length})`}</h3>
                  <button onclick="window._adminAddCategory()" class="btn-primary text-sm px-4 py-2"><i class="fa-solid fa-plus me-1"></i>${isAr?'إضافة فئة':'Add Category'}</button>
                </div>
                <div class="space-y-2">
                ${cats.map((c,i)=>`
                  <div class="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
                    <span class="text-2xl">${c.icon||'📦'}</span>
                    <div class="flex-1 min-w-0"><p class="font-bold text-gray-900">${c.name_ar||c.name||'—'}</p><p class="text-xs text-gray-400">${c.name_en||''}</p></div>
                    <span class="text-xs text-gray-400 w-6 text-center">${c.order||i}</span>
                    <button onclick="window._adminEditCategory('${c.id}','${(c.name_ar||'').replace(/'/g,"\\'")}','${(c.name_en||'').replace(/'/g,"\\'")}','${c.icon||''}',${c.order||0})" class="w-7 h-7 bg-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-brand-100 hover:text-brand-600 transition"><i class="fa-solid fa-pen text-xs"></i></button>
                    <button onclick="window._adminDeleteCategory('${c.id}')" class="w-7 h-7 bg-red-100 text-red-700 rounded-lg flex items-center justify-center hover:bg-red-200 transition"><i class="fa-solid fa-trash text-xs"></i></button>
                  </div>`).join('')}
                </div>`;

                const _showCatModal = (id='', nameAr='', nameEn='', icon='', order=0) => {
                    document.getElementById('catFormModal')?.remove();
                    const modal = document.createElement('div');
                    modal.id = 'catFormModal';
                    modal.className = 'fixed inset-0 bg-black/70 z-[99999] flex items-center justify-center p-4';
                    modal.innerHTML = `
                    <div class="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8">
                      <h3 class="text-lg font-black text-gray-900 mb-5">${id?(isAr?'تعديل فئة':'Edit Category'):(isAr?'إضافة فئة':'Add Category')}</h3>
                      <div class="space-y-3">
                        <div><label class="block text-xs font-bold text-gray-600 mb-1">${isAr?'الاسم عربي':'Name (AR)'}</label><input type="text" id="cat_name_ar" class="form-input w-full" value="${nameAr}"></div>
                        <div><label class="block text-xs font-bold text-gray-600 mb-1">${isAr?'الاسم إنجليزي':'Name (EN)'}</label><input type="text" id="cat_name_en" class="form-input w-full" value="${nameEn}"></div>
                        <div><label class="block text-xs font-bold text-gray-600 mb-1">${isAr?'أيقونة (emoji)':'Icon (emoji)'}</label><input type="text" id="cat_icon" class="form-input w-full" value="${icon}" placeholder="💻"></div>
                        <div><label class="block text-xs font-bold text-gray-600 mb-1">${isAr?'الترتيب':'Order'}</label><input type="number" id="cat_order" class="form-input w-full" value="${order}" min="0"></div>
                      </div>
                      <div class="flex gap-3 mt-5">
                        <button onclick="document.getElementById('catFormModal').remove()" class="btn-secondary flex-1 py-2.5">${t('general.cancel')}</button>
                        <button onclick="window._adminSaveCategory('${id}')" class="btn-primary flex-1 py-2.5">${isAr?'حفظ':'Save'}</button>
                      </div>
                    </div>`;
                    document.body.appendChild(modal);
                };

                window._adminAddCategory    = () => _showCatModal();
                window._adminEditCategory   = (id,ar,en,icon,order) => _showCatModal(id,ar,en,icon,order);
                window._adminSaveCategory   = async (id) => {
                    const data = { name_ar: document.getElementById('cat_name_ar').value.trim(), name_en: document.getElementById('cat_name_en').value.trim(), icon: document.getElementById('cat_icon').value.trim(), order: parseInt(document.getElementById('cat_order').value)||0, updatedAt: serverTimestamp() };
                    if (!data.name_ar) { showToast(isAr?'أدخل الاسم':'Enter name','warning'); return; }
                    try {
                        if (id) await window.db.collection(COLLECTIONS.CATEGORIES).doc(id).update(data);
                        else { data.createdAt = serverTimestamp(); await window.db.collection(COLLECTIONS.CATEGORIES).add(data); }
                        document.getElementById('catFormModal')?.remove();
                        showToast(isAr?'✅ تم الحفظ':'✅ Saved','success'); adminTab('categories');
                    } catch(e) { showToast(e.message,'error'); }
                };
                window._adminDeleteCategory = async (id) => {
                    if (!confirm(isAr?'حذف الفئة؟':'Delete category?')) return;
                    try { await window.db.collection(COLLECTIONS.CATEGORIES).doc(id).delete(); showToast(isAr?'✅ تم الحذف':'✅ Deleted','success'); adminTab('categories'); }
                    catch(e) { showToast(e.message,'error'); }
                };

            // ── SETTINGS ──────────────────────────────────────────────────────
            // ── ANALYTICS ─────────────────────────────────────────────────────
            } else if (tab === 'analytics') {
                const [ordersSnap, usersSnap, servicesSnap, txSnap] = await Promise.all([
                    window.db.collection(COLLECTIONS.ORDERS).get(),
                    window.db.collection(COLLECTIONS.USERS).get(),
                    window.db.collection(COLLECTIONS.SERVICES).get(),
                    window.db.collection(COLLECTIONS.TRANSACTIONS).where('type','==','earning').get(),
                ]);
                const allOrders = ordersSnap.docs.map(d=>({id:d.id,...d.data()}));
                const completed = allOrders.filter(o=>o.status==='completed');
                const totalRev  = completed.reduce((s,o)=>s+(o.price||0),0);
                const platRev   = calcPlatformFee(totalRev);
                const sellerRev = totalRev - platRev;

                // Top sellers
                const sellerMap = {};
                completed.forEach(o=>{ if(!sellerMap[o.sellerId]) sellerMap[o.sellerId]={name:o.sellerName||'—',revenue:0,orders:0}; sellerMap[o.sellerId].revenue+=(o.price||0); sellerMap[o.sellerId].orders++; });
                const topSellers = Object.values(sellerMap).sort((a,b)=>b.revenue-a.revenue).slice(0,5);

                // Top services
                const svcMap = {};
                allOrders.forEach(o=>{ if(!svcMap[o.serviceId]) svcMap[o.serviceId]={title:o.serviceTitle||'—',count:0,revenue:0}; svcMap[o.serviceId].count++; svcMap[o.serviceId].revenue+=(o.price||0); });
                const topServices = Object.values(svcMap).sort((a,b)=>b.count-a.count).slice(0,5);

                // Monthly breakdown (last 6 months)
                const months = {};
                completed.forEach(o=>{
                    if (!o.createdAt) return;
                    const d = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
                    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
                    if (!months[key]) months[key]={orders:0,revenue:0};
                    months[key].orders++; months[key].revenue+=(o.price||0);
                });
                const sortedMonths = Object.entries(months).sort((a,b)=>a[0]>b[0]?1:-1).slice(-6);
                const maxRev = Math.max(...sortedMonths.map(([,v])=>v.revenue),1);

                container.innerHTML = `
                <div class="space-y-6">
                  <!-- KPIs -->
                  <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div class="bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl p-4 text-white text-center"><p class="text-2xl font-black">${formatCurrency(totalRev)}</p><p class="text-brand-200 text-xs mt-1">${isAr?'إجمالي المبيعات':'Total Sales'}</p></div>
                    <div class="bg-gradient-to-br from-purple-500 to-purple-700 rounded-2xl p-4 text-white text-center"><p class="text-2xl font-black">${formatCurrency(platRev)}</p><p class="text-purple-200 text-xs mt-1">${isAr?'إيراداتك':'Your Revenue'}</p></div>
                    <div class="bg-gradient-to-br from-teal-500 to-teal-700 rounded-2xl p-4 text-white text-center"><p class="text-2xl font-black">${completed.length}</p><p class="text-teal-200 text-xs mt-1">${isAr?'طلب مكتمل':'Completed Orders'}</p></div>
                    <div class="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-4 text-white text-center"><p class="text-2xl font-black">${usersSnap.size}</p><p class="text-amber-200 text-xs mt-1">${isAr?'إجمالي المستخدمين':'Total Users'}</p></div>
                  </div>

                  <!-- Monthly Bar Chart -->
                  <div class="bg-white rounded-2xl border border-gray-100 p-5">
                    <h3 class="font-black text-gray-900 mb-4">${isAr?'الإيرادات الشهرية':'Monthly Revenue'}</h3>
                    ${sortedMonths.length===0
                      ? `<p class="text-gray-400 text-center py-6">${isAr?'لا توجد بيانات':'No data yet'}</p>`
                      : `<div class="flex items-end gap-3 h-36 px-2">
                        ${sortedMonths.map(([month,v])=>`
                        <div class="flex-1 flex flex-col items-center gap-1">
                          <span class="text-xs font-black text-brand-700">${formatCurrency(v.revenue)}</span>
                          <div class="w-full bg-brand-500 rounded-t-lg transition-all" style="height:${Math.max(8,Math.round(v.revenue/maxRev*100))}px"></div>
                          <span class="text-xs text-gray-400">${month.slice(5)}</span>
                        </div>`).join('')}
                      </div>`}
                  </div>

                  <div class="grid md:grid-cols-2 gap-4">
                    <!-- Top Sellers -->
                    <div class="bg-white rounded-2xl border border-gray-100 p-5">
                      <h3 class="font-black text-gray-900 mb-4">🏆 ${isAr?'أكثر البائعين إيراداً':'Top Sellers'}</h3>
                      ${topSellers.length===0 ? `<p class="text-gray-400 text-center py-4">${isAr?'لا يوجد':'No data'}</p>` : topSellers.map((s,i)=>`
                      <div class="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                        <span class="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-black flex items-center justify-center flex-shrink-0">${i+1}</span>
                        <div class="flex-1 min-w-0"><p class="text-sm font-bold text-gray-900 truncate">${s.name}</p><p class="text-xs text-gray-400">${s.orders} ${isAr?'طلب':'orders'}</p></div>
                        <span class="font-black text-teal-700 text-sm">${formatCurrency(s.revenue)}</span>
                      </div>`).join('')}
                    </div>

                    <!-- Top Services -->
                    <div class="bg-white rounded-2xl border border-gray-100 p-5">
                      <h3 class="font-black text-gray-900 mb-4">🔥 ${isAr?'أكثر الخدمات طلباً':'Top Services'}</h3>
                      ${topServices.length===0 ? `<p class="text-gray-400 text-center py-4">${isAr?'لا يوجد':'No data'}</p>` : topServices.map((s,i)=>`
                      <div class="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                        <span class="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-black flex items-center justify-center flex-shrink-0">${i+1}</span>
                        <div class="flex-1 min-w-0"><p class="text-sm font-bold text-gray-900 truncate">${s.title}</p><p class="text-xs text-gray-400">${formatCurrency(s.revenue)}</p></div>
                        <span class="font-black text-amber-700 text-sm">${s.count} ${isAr?'طلب':'orders'}</span>
                      </div>`).join('')}
                    </div>
                  </div>

                  <!-- Summary -->
                  <div class="bg-gray-50 rounded-2xl border border-gray-100 p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div><p class="text-lg font-black text-gray-900">${allOrders.length}</p><p class="text-xs text-gray-500">${isAr?'إجمالي الطلبات':'Total Orders'}</p></div>
                    <div><p class="text-lg font-black text-gray-900">${servicesSnap.size}</p><p class="text-xs text-gray-500">${isAr?'الخدمات':'Services'}</p></div>
                    <div><p class="text-lg font-black text-gray-900">${allOrders.length>0?Math.round(completed.length/orders.length*100):0}%</p><p class="text-xs text-gray-500">${isAr?'معدل الإتمام':'Completion Rate'}</p></div>
                    <div><p class="text-lg font-black text-gray-900">${completed.length>0?formatCurrency(totalRev/completed.length):formatCurrency(0)}</p><p class="text-xs text-gray-500">${isAr?'متوسط قيمة الطلب':'Avg Order Value'}</p></div>
                  </div>
                </div>`;

            // ── REVIEWS ───────────────────────────────────────────────────────
            } else if (tab === 'reviews') {
                const reviewsSnap = await window.db.collection(COLLECTIONS.REVIEWS).orderBy('createdAt','desc').limit(50).get();
                const reviews = reviewsSnap.docs.map(d=>({id:d.id,...d.data()}));
                container.innerHTML = `
                <div class="flex items-center justify-between mb-4">
                  <h3 class="font-black text-gray-900">${isAr?`التقييمات (${reviews.length})`:`Reviews (${reviews.length})`}</h3>
                </div>
                ${reviews.length===0 ? `<p class="text-gray-400 text-center py-8">${isAr?'لا توجد تقييمات':'No reviews'}</p>` : `
                <div class="space-y-3">${reviews.map(r=>`
                  <div class="flex items-start gap-3 p-4 bg-gray-50 rounded-xl" id="rev_${r.id}">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 mb-1">
                        <span class="text-yellow-500 text-sm">${'⭐'.repeat(r.rating||0)}</span>
                        <span class="text-xs font-bold text-gray-700">${r.reviewerName||'—'}</span>
                        <span class="text-xs text-gray-400">→ ${r.sellerName||'—'}</span>
                      </div>
                      <p class="text-sm text-gray-700">${r.comment||'—'}</p>
                      <p class="text-xs text-gray-400 mt-1">${formatDateAr(r.createdAt)}</p>
                    </div>
                    <button onclick="window._adminDeleteReview('${r.id}')" class="w-8 h-8 bg-red-100 text-red-700 rounded-lg flex items-center justify-center hover:bg-red-200 transition flex-shrink-0" title="${isAr?'حذف':'Delete'}"><i class="fa-solid fa-trash text-xs"></i></button>
                  </div>`).join('')}
                </div>`}`;

                window._adminDeleteReview = async (id) => {
                    if (!confirm(isAr?'حذف هذا التقييم نهائياً؟':'Delete this review permanently?')) return;
                    try {
                        await window.db.collection(COLLECTIONS.REVIEWS).doc(id).delete();
                        document.getElementById(`rev_${id}`)?.remove();
                        showToast(isAr?'✅ تم حذف التقييم':'✅ Review deleted','success');
                    } catch(e) { showToast(e.message,'error'); }
                };

            // ── REPORTS ───────────────────────────────────────────────────────
            } else if (tab === 'reports') {
                const reportsSnap = await window.db.collection(COLLECTIONS.REPORTS).orderBy('createdAt','desc').limit(50).get();
                const reports = reportsSnap.docs.map(d=>({id:d.id,...d.data()}));
                container.innerHTML = `
                <div class="flex items-center justify-between mb-4">
                  <h3 class="font-black text-gray-900">${isAr?`البلاغات (${reports.length})`:`Reports (${reports.length})`}</h3>
                </div>
                ${reports.length===0 ? `<div class="text-center py-8 bg-green-50 rounded-2xl border border-green-200"><p class="text-green-700 font-bold">✅ ${isAr?'لا توجد بلاغات':'No reports'}</p></div>` : `
                <div class="space-y-3">${reports.map(r=>`
                  <div class="flex items-start gap-3 p-4 ${r.status==='resolved'?'bg-gray-50 opacity-60':'bg-red-50 border border-red-100'} rounded-xl" id="rpt_${r.id}">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 mb-1">
                        <span class="text-xs font-bold ${r.status==='resolved'?'text-green-700 bg-green-100':'text-red-700 bg-red-100'} px-2 py-0.5 rounded-lg">${r.status==='resolved'?(isAr?'محلول':'Resolved'):(isAr?'جديد':'New')}</span>
                        <span class="text-xs text-gray-500">${r.type||'—'}</span>
                      </div>
                      <p class="text-sm font-bold text-gray-900">${isAr?'البلاغ على:':'Reported:'} ${r.targetName||r.targetId||'—'}</p>
                      <p class="text-sm text-gray-600 mt-1">${r.reason||'—'}</p>
                      <p class="text-xs text-gray-400 mt-1">${isAr?'بواسطة:':'By:'} ${r.reporterName||'—'} · ${formatDateAr(r.createdAt)}</p>
                    </div>
                    <div class="flex flex-col gap-1 flex-shrink-0">
                      ${r.status!=='resolved'?`<button onclick="window._adminResolveReport('${r.id}')" class="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition">${isAr?'حل':'Resolve'}</button>`:''}
                      <button onclick="window._adminDeleteReport('${r.id}')" class="w-8 h-8 bg-red-100 text-red-700 rounded-lg flex items-center justify-center hover:bg-red-200 transition"><i class="fa-solid fa-trash text-xs"></i></button>
                    </div>
                  </div>`).join('')}
                </div>`}`;

                window._adminResolveReport = async (id) => {
                    try {
                        await window.db.collection(COLLECTIONS.REPORTS).doc(id).update({ status:'resolved', resolvedAt:serverTimestamp(), resolvedBy:AppState.currentUser?.uid });
                        showToast(isAr?'✅ تم وضع علامة محلول':'✅ Marked as resolved','success');
                        adminTab('reports');
                    } catch(e) { showToast(e.message,'error'); }
                };
                window._adminDeleteReport = async (id) => {
                    if (!confirm(isAr?'حذف البلاغ؟':'Delete report?')) return;
                    try { await window.db.collection(COLLECTIONS.REPORTS).doc(id).delete(); document.getElementById(`rpt_${id}`)?.remove(); showToast(isAr?'✅ تم الحذف':'✅ Deleted','success'); }
                    catch(e) { showToast(e.message,'error'); }
                };

            // ── BROADCAST ─────────────────────────────────────────────────────
            } else if (tab === 'broadcast') {
                const broadcastUsersSnap = await window.db.collection(COLLECTIONS.USERS).get();
                const totalUsers = broadcastUsersSnap.size;
                container.innerHTML = `
                <div class="max-w-xl mx-auto space-y-5">
                  <div class="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-700">
                    <i class="fa-solid fa-circle-info me-2"></i>
                    ${isAr?`الإشعار سيُرسل لـ <strong>${totalUsers} مستخدم</strong> مسجّل في المنصة`:`Notification will be sent to <strong>${totalUsers} users</strong>`}
                  </div>
                  <div class="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
                    <div>
                      <label class="block text-sm font-bold text-gray-700 mb-1">${isAr?'الفئة المستهدفة':'Target Audience'}</label>
                      <select id="bc_target" class="form-input w-full">
                        <option value="all">${isAr?`الجميع (${totalUsers})`:`Everyone (${totalUsers})`}</option>
                        <option value="buyer">${isAr?'المشترون فقط':'Buyers only'}</option>
                        <option value="seller">${isAr?'البائعون فقط':'Sellers only'}</option>
                      </select>
                    </div>
                    <div>
                      <label class="block text-sm font-bold text-gray-700 mb-1">${isAr?'نوع الإشعار':'Type'}</label>
                      <select id="bc_type" class="form-input w-full">
                        <option value="announcement">${isAr?'إعلان':'Announcement'}</option>
                        <option value="promotion">${isAr?'عرض/خصم':'Promotion'}</option>
                        <option value="system">${isAr?'تنبيه نظام':'System Alert'}</option>
                      </select>
                    </div>
                    <div>
                      <label class="block text-sm font-bold text-gray-700 mb-1">${isAr?'عنوان الإشعار':'Title'}</label>
                      <input type="text" id="bc_title" class="form-input w-full" placeholder="${isAr?'مثال: عرض خاص اليوم!':'e.g. Special offer today!'}">
                    </div>
                    <div>
                      <label class="block text-sm font-bold text-gray-700 mb-1">${isAr?'نص الإشعار':'Message'}</label>
                      <textarea id="bc_msg" class="form-input w-full h-28 resize-none" placeholder="${isAr?'اكتب الرسالة هنا...':'Write your message here...'}"></textarea>
                    </div>
                    <button onclick="window._adminSendBroadcast(${totalUsers})" id="bcBtn" class="w-full py-3.5 bg-gradient-to-r from-brand-500 to-brand-700 text-white font-black rounded-xl hover:from-brand-600 hover:to-brand-800 transition flex items-center justify-center gap-2">
                      <i class="fa-solid fa-paper-plane"></i>${isAr?'إرسال الإشعار':'Send Notification'}
                    </button>
                  </div>
                  <div id="bcHistory" class="space-y-2"></div>
                </div>`;

                window._adminSendBroadcast = async (count) => {
                    const title  = document.getElementById('bc_title').value.trim();
                    const msg    = document.getElementById('bc_msg').value.trim();
                    const type   = document.getElementById('bc_type').value;
                    const target = document.getElementById('bc_target').value;
                    if (!title) { showToast(isAr?'أدخل العنوان':'Enter title','warning'); return; }
                    if (!msg)   { showToast(isAr?'أدخل الرسالة':'Enter message','warning'); return; }
                    if (!confirm(isAr?`إرسال إشعار لـ ${count} مستخدم؟`:`Send to ${count} users?`)) return;

                    const btn = document.getElementById('bcBtn');
                    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>' + (isAr?'جاري الإرسال...':'Sending...');

                    try {
                        // Get target users
                        let usersQ = window.db.collection(COLLECTIONS.USERS);
                        if (target !== 'all') usersQ = usersQ.where('role','==',target);
                        const bcUsersSnap = await usersQ.get();

                        // Batch write notifications (Firestore batch max 500)
                        const batches = [];
                        let batch = window.db.batch();
                        let i = 0;
                        bcUsersSnap.docs.forEach(doc => {
                            const ref = window.db.collection(COLLECTIONS.NOTIFICATIONS).doc();
                            batch.set(ref, { userId:doc.id, type, title, message:msg, read:false, createdAt:serverTimestamp(), fromAdmin:true });
                            i++;
                            if (i % 499 === 0) { batches.push(batch); batch = window.db.batch(); }
                        });
                        batches.push(batch);
                        await Promise.all(batches.map(b=>b.commit()));

                        showToast(isAr?`✅ تم الإرسال لـ ${bcUsersSnap.size} مستخدم`:`✅ Sent to ${bcUsersSnap.size} users`,'success',5000);
                        btn.innerHTML = `<i class="fa-solid fa-check me-2"></i>${isAr?'تم الإرسال':'Sent!'}`;
                        document.getElementById('bc_title').value = '';
                        document.getElementById('bc_msg').value = '';
                        setTimeout(()=>{ btn.disabled=false; btn.innerHTML=`<i class="fa-solid fa-paper-plane me-2"></i>${isAr?'إرسال':'Send'}`; }, 4000);
                    } catch(e) {
                        btn.disabled=false; btn.innerHTML=`<i class="fa-solid fa-paper-plane me-2"></i>${isAr?'إرسال':'Send'}`;
                        showToast(e.message,'error');
                    }
                };

            // ── PAYMENTS ──────────────────────────────────────────────────────
            } else if (tab === 'payments') {
                const [paySnap, txSnap] = await Promise.all([
                    window.db.collection(COLLECTIONS.PAYMENTS).orderBy('createdAt','desc').limit(50).get(),
                    window.db.collection(COLLECTIONS.TRANSACTIONS).orderBy('createdAt','desc').limit(50).get(),
                ]);
                const payments = paySnap.docs.map(d=>({id:d.id,...d.data()}));
                const txs      = txSnap.docs.map(d=>({id:d.id,...d.data()}));
                const totalIn  = payments.reduce((s,p)=>s+(p.amount||0),0);
                const totalOut = txs.filter(t=>t.type==='withdrawal').reduce((s,t)=>s+(t.amount||0),0);

                container.innerHTML = `
                <div class="grid grid-cols-3 gap-3 mb-6">
                  <div class="bg-green-50 border border-green-200 rounded-xl p-4 text-center"><p class="text-xl font-black text-green-700">${formatCurrency(totalIn)}</p><p class="text-xs text-green-600 mt-1">${isAr?'إجمالي الدخل':'Total In'}</p></div>
                  <div class="bg-red-50 border border-red-200 rounded-xl p-4 text-center"><p class="text-xl font-black text-red-700">${formatCurrency(totalOut)}</p><p class="text-xs text-red-600 mt-1">${isAr?'إجمالي المدفوع':'Total Out'}</p></div>
                  <div class="bg-brand-50 border border-brand-200 rounded-xl p-4 text-center"><p class="text-xl font-black text-brand-700">${formatCurrency(totalIn-totalOut)}</p><p class="text-xs text-brand-600 mt-1">${isAr?'صافي المنصة':'Net'}</p></div>
                </div>
                <h4 class="font-black text-gray-900 mb-3">${isAr?'سجل المدفوعات':'Payment Records'}</h4>
                <div class="space-y-2">${payments.length===0 ? `<p class="text-gray-400 text-center py-6">${isAr?'لا توجد مدفوعات':'No payments'}</p>` : payments.map(p=>`
                  <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${p.status==='success'||p.status==='completed'?'bg-green-100':'bg-amber-100'}">
                      <i class="fa-solid fa-credit-card text-xs ${p.status==='success'||p.status==='completed'?'text-green-600':'text-amber-600'}"></i>
                    </div>
                    <div class="flex-1 min-w-0"><p class="text-sm font-bold text-gray-900 truncate">${p.userName||p.userId?.substr(0,8)||'—'}</p><p class="text-xs text-gray-400">${p.method||'—'} · ${formatDateAr(p.createdAt)}</p></div>
                    <span class="font-black text-sm text-gray-900">${formatCurrency(p.amount||0)}</span>
                    <span class="text-xs font-bold px-2 py-1 rounded-lg ${p.status==='success'||p.status==='completed'?'bg-green-100 text-green-700':'bg-amber-100 text-amber-700'}">${p.status||'—'}</span>
                  </div>`).join('')}
                </div>

                <!-- ── Payment Keys Section ── -->
                <div class="mt-5 bg-amber-50 border border-amber-200 rounded-2xl p-5">
                  <h4 class="font-black text-amber-800 mb-2 flex items-center gap-2">
                    <i class="fa-solid fa-key text-amber-600"></i>
                    ${isAr ? 'مفاتيح بوابات الدفع' : 'Payment Gateway Keys'}
                  </h4>
                  <p class="text-sm text-amber-700 mb-3">
                    ${isAr
                      ? 'المفاتيح السرية لا تُحفظ في قاعدة البيانات — تُضاف في Netlify Environment Variables فقط'
                      : 'Secret keys are never stored in the database — add them in Netlify Environment Variables only'}
                  </p>
                  <div class="space-y-2 mb-4" id="gatewayStatusList">
                    <div class="text-center text-xs text-amber-500 py-2"><i class="fa-solid fa-spinner fa-spin me-1"></i>${isAr?'جاري الفحص...':'Checking...'}</div>
                  </div>
                  <a href="https://app.netlify.com/" target="_blank"
                     class="flex items-center justify-center gap-2 py-2.5 px-4 bg-amber-600 text-white rounded-xl text-sm font-bold hover:bg-amber-700 transition">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i>
                    ${isAr ? 'افتح Netlify → Environment Variables' : 'Open Netlify → Environment Variables'}
                  </a>
                  <p class="text-xs text-amber-600 mt-2 text-center">
                    ${isAr ? '📄 راجع ملف payment-keys.env في المشروع لشرح كل مفتاح' : '📄 See payment-keys.env in the project for all keys explained'}
                  </p>
                </div>`;

            // Check gateway key statuses
            (async () => {
                const list = document.getElementById('gatewayStatusList');
                if (!list) return;
                const isAr2 = AppState.language !== 'en';
                const gateways = [
                    {id:'paymob',  label:'Paymob (بطاقات + فوري)',  env:'PAYMOB_API_KEY'},
                    {id:'fawry',   label:'Fawry',                    env:'FAWRY_MERCHANT_CODE'},
                    {id:'stripe',  label:'Stripe',                   env:'STRIPE_SECRET_KEY'},
                    {id:'paypal',  label:'PayPal',                   env:'PAYPAL_CLIENT_ID'},
                ];
                let statuses = {};
                try {
                    const r = await fetch('/.netlify/functions/payment', {
                        method:'POST', headers:{'Content-Type':'application/json'},
                        body: JSON.stringify({action:'checkKeys'})
                    });
                    if (r.ok) statuses = await r.json();
                } catch(_) {}
                list.innerHTML = gateways.map(g => {
                    const ok = statuses[g.id + '_configured'];
                    return '<div class="flex items-center justify-between py-2 border-b border-amber-100 last:border-0">'
                        + '<span class="text-sm font-bold text-gray-800">' + g.label + '</span>'
                        + '<span class="text-xs font-bold px-2 py-1 rounded-full ' + (ok ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500') + '">'
                        + (ok ? (isAr2?'✅ مفعّل':'✅ Active') : (isAr2?'⚙️ يحتاج مفتاح':'⚙️ Needs key'))
                        + '</span></div>';
                }).join('');
            })();

            } else if (tab === 'settings') {
                const settingsSnap = await window.db.collection('settings').doc('platform').get();
                const cfg  = settingsSnap.exists ? settingsSnap.data() : PLATFORM;
                container.innerHTML = `
                <div class="max-w-2xl mx-auto space-y-5">
                  <!-- ── Commission ──────────────────────────────────── -->
                  <div class="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                    <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-2"><i class="fa-solid fa-percent text-brand-500"></i>${isAr?'العمولة':'Commission'}</h3>
                    <p class="text-xs text-gray-400 mb-4">${isAr?'تُخصم من كل دفعة يستلمها البائع':'Deducted from every seller payout'}</p>

                    <!-- Fee Type selector -->
                    <div class="mb-4">
                      <label class="block text-xs font-bold text-gray-600 mb-2">${isAr?'نوع العمولة':'Commission Type'}</label>
                      <div class="grid grid-cols-3 gap-2" id="feeTypeGroup">
                        ${['percent','fixed','both'].map(v=>`
                          <button type="button" onclick="window._selectFeeType('${v}')"
                            id="feeTypeBtn_${v}"
                            class="feeTypBtn py-2 rounded-xl text-sm font-bold border transition-all ${(cfg.FEE_TYPE||'percent')===v?'bg-brand-600 text-white border-brand-600':'bg-gray-50 text-gray-600 border-gray-200 hover:border-brand-400'}">
                            ${v==='percent'?(isAr?'نسبة %':'Percent %'):v==='fixed'?(isAr?'مبلغ ثابت':'Fixed'):( isAr?'نسبة + ثابت':'Both')}
                          </button>`).join('')}
                      </div>
                    </div>

                    <!-- Percent input -->
                    <div id="cfg_percent_row" class="${(cfg.FEE_TYPE||'percent')==='fixed'?'hidden':''} mb-3">
                      <label class="block text-xs font-bold text-gray-600 mb-1">${isAr?'النسبة المئوية':'Percentage'}</label>
                      <div class="flex items-center gap-3">
                        <input type="range" id="cfg_fee" min="0" max="30" step="0.5"
                          value="${cfg.FEE_PERCENT??5}" class="flex-1 accent-brand-500"
                          oninput="document.getElementById('cfg_fee_val').textContent=this.value+'%'">
                        <span id="cfg_fee_val" class="w-20 text-center font-black text-brand-700 text-xl bg-brand-50 rounded-xl py-2">${cfg.FEE_PERCENT??5}%</span>
                      </div>
                      <div class="flex justify-between text-xs text-gray-300 mt-1"><span>0%</span><span>15%</span><span>30%</span></div>
                    </div>

                    <!-- Fixed amount input -->
                    <div id="cfg_fixed_row" class="${(cfg.FEE_TYPE||'percent')==='percent'?'hidden':''} mb-3">
                      <label class="block text-xs font-bold text-gray-600 mb-1">${isAr?'المبلغ الثابت (ج.م)':'Fixed Amount (EGP)'}</label>
                      <input type="number" id="cfg_fee_fixed" min="0" step="0.5"
                        value="${cfg.FEE_FIXED??0}" class="form-input w-full">
                    </div>

                    <!-- Live preview -->
                    <div class="bg-brand-50 rounded-xl p-3 text-sm mt-2">
                      <p class="text-xs font-bold text-brand-700 mb-1">${isAr?'مثال على طلب بـ 500 ج.م:':'Example on 500 EGP order:'}</p>
                      <div class="flex justify-between text-brand-800 font-bold" id="feePreview">
                        <span>${isAr?'عمولة المنصة':'Platform fee'}</span>
                        <span id="feePreviewVal">—</span>
                      </div>
                    </div>

                    <!-- Min/Max commission limits -->
                    <div class="grid grid-cols-2 gap-3 mt-3">
                      <div><label class="block text-xs font-bold text-gray-600 mb-1">${isAr?'حد أدنى للعمولة (ج.م)':'Min Commission (EGP)'}</label><input type="number" id="cfg_fee_min" min="0" step="0.5" value="${cfg.FEE_MIN??0}" class="form-input w-full" placeholder="0"></div>
                      <div><label class="block text-xs font-bold text-gray-600 mb-1">${isAr?'حد أقصى للعمولة (0=بلا حد)':'Max Commission (0=unlimited)'}</label><input type="number" id="cfg_fee_max" min="0" step="0.5" value="${cfg.FEE_MAX??0}" class="form-input w-full" placeholder="0"></div>
                    </div>

                    <!-- Tiers toggle -->
                    <div class="mt-4 border-t border-gray-100 pt-4">
                      <label class="flex items-center gap-3 cursor-pointer mb-3">
                        <div class="relative"><input type="checkbox" id="cfg_tiers_enabled" ${cfg.TIERS_ENABLED?'checked':''} class="sr-only peer" onchange="document.getElementById('tiersEditor').classList.toggle('hidden',!this.checked)">
                        <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div></div>
                        <span class="text-sm font-bold text-gray-700">${isAr?'شرائح العمولة (حسب قيمة الطلب)':'Commission Tiers (by order amount)'}</span>
                      </label>
                      <div id="tiersEditor" class="${cfg.TIERS_ENABLED?'':' hidden'}">
                        <p class="text-xs text-gray-400 mb-2">${isAr?'كل شريحة تُطبَّق على الطلبات ضمن نطاقها وتتجاوز النسبة الافتراضية':'Each tier overrides the default rate for orders in that range'}</p>
                        <div id="tiersRows">
                          ${_renderTierRows(cfg,isAr)}
                        </div>
                        <button type="button" onclick="window._addTierRow()" class="text-sm text-brand-600 font-bold hover:underline mt-1"><i class="fa-solid fa-plus me-1"></i>${isAr?'إضافة شريحة':'Add Tier'}</button>
                      </div>
                    </div>
                  </div>
                  <div class="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                    <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-2"><i class="fa-solid fa-money-bill-transfer text-green-500"></i>${isAr?'إعدادات السحب':'Withdrawal'}</h3>
                    <div class="grid grid-cols-2 gap-4 mb-3">
                      <div><label class="block text-xs font-bold text-gray-600 mb-1">${isAr?'حد أدنى (ج.م)':'Min (EGP)'}</label><input type="number" id="cfg_min_wd" class="form-input w-full" value="${cfg.MIN_WITHDRAWAL??100}"></div>
                      <div><label class="block text-xs font-bold text-gray-600 mb-1">${isAr?'حد أقصى (ج.م)':'Max (EGP)'}</label><input type="number" id="cfg_max_wd" class="form-input w-full" value="${cfg.MAX_WITHDRAWAL??50000}"></div>
                    </div>
                    <div><label class="block text-xs font-bold text-gray-600 mb-1">${isAr?'ملاحظة للبائعين':'Note for sellers'}</label><input type="text" id="cfg_wd_note" class="form-input w-full" value="${cfg.WITHDRAWAL_NOTE??''}"></div>
                  </div>
                  <div class="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                    <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-2"><i class="fa-solid fa-store text-amber-500"></i>${isAr?'معلومات المنصة':'Platform Info'}</h3>
                    <div class="grid grid-cols-2 gap-3 mb-3">
                      <div><label class="block text-xs font-bold text-gray-600 mb-1">${isAr?'الاسم عربي':'Name AR'}</label><input type="text" id="cfg_name_ar" class="form-input w-full" value="${cfg.NAME??'مول الخدمات'}"></div>
                      <div><label class="block text-xs font-bold text-gray-600 mb-1">${isAr?'الاسم إنجليزي':'Name EN'}</label><input type="text" id="cfg_name_en" class="form-input w-full" value="${cfg.NAME_EN??'Mall Services'}"></div>
                    </div>
                    <div><label class="block text-xs font-bold text-gray-600 mb-1">${isAr?'إيميل الدعم':'Support Email'}</label><input type="email" id="cfg_email" class="form-input w-full" value="${cfg.SUPPORT_EMAIL??''}"></div>
                  </div>
                  <div class="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                    <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-2"><i class="fa-solid fa-triangle-exclamation text-red-500"></i>${isAr?'وضع الصيانة':'Maintenance'}</h3>
                    <label class="flex items-center gap-3 cursor-pointer mb-3">
                      <div class="relative"><input type="checkbox" id="cfg_maintenance" ${cfg.MAINTENANCE?'checked':''} class="sr-only peer">
                      <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div></div>
                      <span class="text-sm font-bold text-gray-700">${isAr?'تفعيل وضع الصيانة':'Enable maintenance'}</span>
                    </label>
                    <input type="text" id="cfg_maint_msg" class="form-input w-full" value="${cfg.MAINTENANCE_MSG??''}" placeholder="${isAr?'رسالة الصيانة':'Maintenance message'}">
                  </div>
                  <button onclick="window._savePlatformSettings()" id="saveSettingsBtn" class="w-full py-4 bg-gradient-to-r from-brand-500 to-brand-700 text-white font-black text-lg rounded-2xl hover:from-brand-600 hover:to-brand-800 transition-all flex items-center justify-center gap-2">
                    <i class="fa-solid fa-floppy-disk"></i>${isAr?'حفظ الإعدادات':'Save Settings'}
                  </button>
                </div>`;

                // ── Commission type toggle helpers ──────────────────────────
                window._selectFeeType = function(type) {
                    ['percent','fixed','both'].forEach(v => {
                        const btn = document.getElementById('feeTypeBtn_'+v);
                        if (!btn) return;
                        if (v === type) { btn.className = btn.className.replace(/bg-gray-50 text-gray-600 border-gray-200 hover:border-brand-400/g,'').trim() + ' bg-brand-600 text-white border-brand-600'; }
                        else           { btn.className = btn.className.replace(/bg-brand-600 text-white border-brand-600/g,'').trim() + ' bg-gray-50 text-gray-600 border-gray-200 hover:border-brand-400'; }
                    });
                    document.getElementById('cfg_percent_row')?.classList.toggle('hidden', type==='fixed');
                    document.getElementById('cfg_fixed_row')?.classList.toggle('hidden', type==='percent');
                    window._updateFeePreview();
                };
                window._updateFeePreview = function() {
                    const type    = document.getElementById('feeTypeBtn_percent')?.classList.contains('bg-brand-600')?'percent':document.getElementById('feeTypeBtn_fixed')?.classList.contains('bg-brand-600')?'fixed':'both';
                    const pct     = parseFloat(document.getElementById('cfg_fee')?.value)||0;
                    const fixed   = parseFloat(document.getElementById('cfg_fee_fixed')?.value)||0;
                    const feeMin  = parseFloat(document.getElementById('cfg_fee_min')?.value)||0;
                    const feeMax  = parseFloat(document.getElementById('cfg_fee_max')?.value)||0;
                    const sample  = 500;
                    let fee = 0;
                    if (type==='percent') fee = sample * pct / 100;
                    else if (type==='fixed') fee = fixed;
                    else fee = (sample * pct / 100) + fixed;
                    if (feeMin > 0 && fee < feeMin) fee = feeMin;
                    if (feeMax > 0 && fee > feeMax) fee = feeMax;
                    const el = document.getElementById('feePreviewVal');
                    if (el) el.textContent = formatCurrency(Number(fee.toFixed(2)));
                };
                window._addTierRow = function() {
                    const container = document.getElementById('tiersRows');
                    if (!container) return;
                    const isAr = AppState.language !== 'en';
                    const div = document.createElement('div');
                    div.className = 'grid grid-cols-4 gap-2 items-end tier-row';
                    div.innerHTML = '<div><label class="text-xs text-gray-500">'+(isAr?'من':'From')+'</label><input type="number" class="form-input w-full tier-min" value="0" min="0"></div><div><label class="text-xs text-gray-500">'+(isAr?'إلى':'To')+'</label><input type="number" class="form-input w-full tier-max" value="1000" min="0"></div><div><label class="text-xs text-gray-500">%</label><input type="number" class="form-input w-full tier-pct" value="5" min="0" max="100" step="0.5"></div><button type="button" onclick="window._removeTierRow(this)" class="h-10 w-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center hover:bg-red-200"><i class="fa-solid fa-trash text-xs"></i></button>';
                    container.appendChild(div);
                };
                // Live preview on input change
                setTimeout(()=>{
                    document.getElementById('cfg_fee')?.addEventListener('input', window._updateFeePreview);
                    document.getElementById('cfg_fee_fixed')?.addEventListener('input', window._updateFeePreview);
                    document.getElementById('cfg_fee_min')?.addEventListener('input', window._updateFeePreview);
                    document.getElementById('cfg_fee_max')?.addEventListener('input', window._updateFeePreview);
                    window._updateFeePreview();
                }, 50);

                window._savePlatformSettings = async () => {
                    const btn = document.getElementById('saveSettingsBtn');
                    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                    try {
                        const newCfg = {
                            FEE_TYPE:        document.getElementById('feeTypeBtn_percent')?.classList.contains('bg-brand-600')?'percent':document.getElementById('feeTypeBtn_fixed')?.classList.contains('bg-brand-600')?'fixed':'both',
                            FEE_PERCENT:     parseFloat(document.getElementById('cfg_fee')?.value)||5,
                            FEE_FIXED:       parseFloat(document.getElementById('cfg_fee_fixed')?.value)||0,
                            FEE_MIN:         parseFloat(document.getElementById('cfg_fee_min')?.value)||0,
                            FEE_MAX:         parseFloat(document.getElementById('cfg_fee_max')?.value)||0,
                            TIERS_ENABLED:   document.getElementById('cfg_tiers_enabled')?.checked||false,
                            TIERS:           Array.from(document.querySelectorAll('.tier-row')).map(row=>({
                                                minAmount:  parseFloat(row.querySelector('.tier-min')?.value)||0,
                                                maxAmount:  parseFloat(row.querySelector('.tier-max')?.value)||0,
                                                feePercent: parseFloat(row.querySelector('.tier-pct')?.value)||0,
                                                feeFixed:   0,
                                             })),
                            MIN_WITHDRAWAL:  parseFloat(document.getElementById('cfg_min_wd').value)||100,
                            MAX_WITHDRAWAL:  parseFloat(document.getElementById('cfg_max_wd').value)||50000,
                            WITHDRAWAL_NOTE: document.getElementById('cfg_wd_note').value.trim(),
                            NAME:            document.getElementById('cfg_name_ar').value.trim()||'مول الخدمات',
                            NAME_EN:         document.getElementById('cfg_name_en').value.trim()||'Mall Services',
                            SUPPORT_EMAIL:   document.getElementById('cfg_email').value.trim(),
                            MAINTENANCE:     document.getElementById('cfg_maintenance').checked,
                            MAINTENANCE_MSG: document.getElementById('cfg_maint_msg').value.trim(),
                            updatedAt:       serverTimestamp(),
                            updatedBy:       AppState.currentUser?.uid,
                        };
                        await window.db.collection('settings').doc('platform').set(newCfg, {merge:true});
                        Object.assign(PLATFORM, newCfg);
                        showToast(isAr?'✅ تم حفظ الإعدادات':'✅ Settings saved','success');
                        btn.innerHTML = `<i class="fa-solid fa-check"></i> ${isAr?'تم الحفظ':'Saved'}`;
                        setTimeout(()=>{ btn.disabled=false; btn.innerHTML=`<i class="fa-solid fa-floppy-disk"></i> ${isAr?'حفظ الإعدادات':'Save Settings'}`; }, 3000);
                    } catch(e) { btn.disabled=false; btn.innerHTML=`<i class="fa-solid fa-floppy-disk"></i> ${isAr?'حفظ':'Save'}`; showToast(e.message,'error'); }
                };
            }
        } catch(err) {
            container.innerHTML = `<p class="text-red-500 text-center py-4">${t('general.error')}: ${err.message}</p>`;
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // WALLET MANAGER
    // ══════════════════════════════════════════════════════════════════════════
    const WalletManager = {
        initWalletPage() {
            const container = document.getElementById('walletContent');
            if (!container) return;
            const user = AppState.currentUser, isAr = AppState.language !== 'en', wallet = AppState.wallet||{};
            if (!user) { container.innerHTML = `<div class="text-center py-16"><button onclick="navigateTo('login')" class="btn-primary">${t('auth.login')}</button></div>`; return; }
            container.innerHTML = `
            <div>
              <h1 class="text-2xl font-black text-gray-900 mb-8">${t('nav.wallet')}</h1>
              <div class="bg-gradient-to-br from-brand-600 to-brand-900 rounded-3xl p-7 text-white mb-8 relative overflow-hidden">
                <div class="absolute top-0 end-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/4 translate-x-1/4"></div>
                <div class="relative">
                  <p class="text-brand-200 text-sm mb-1">${isAr?'الرصيد المتاح':'Available Balance'}</p>
                  <p class="text-4xl font-black mb-6">${formatCurrency(wallet.balance||0)}</p>
                  <div class="flex gap-3 flex-wrap">
                    <button onclick="WalletManager.openWithdrawForm()" class="bg-white text-brand-700 font-black px-6 py-3 rounded-xl hover:bg-brand-50 transition text-sm flex items-center gap-2"><i class="fa-solid fa-money-bill-transfer"></i>${t('dash.withdraw')}</button>
                  </div>
                </div>
              </div>
              <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 class="font-black text-gray-900 mb-5">${isAr?'سجل المعاملات':'Transaction History'}</h3>
                <div id="walletTransactions"><div class="text-center py-6"><i class="fa-solid fa-spinner fa-spin text-brand-500 text-2xl"></i></div></div>
              </div>
            </div>`;
            this._loadTransactions();
        },

        async _loadTransactions() {
            const user = AppState.currentUser, container = document.getElementById('walletTransactions');
            if (!container||!user) return;
            const isAr = AppState.language !== 'en';
            try {
                const snap = await window.db.collection(COLLECTIONS.TRANSACTIONS).where('userId','==',user.uid).orderBy('createdAt','desc').limit(20).get();
                if (snap.empty) { container.innerHTML = `<p class="text-gray-400 text-center py-6">${isAr?'لا توجد معاملات':'No transactions yet'}</p>`; return; }
                container.innerHTML = snap.docs.map(doc => {
                    const tx = doc.data(), isEarning = tx.type==='earning';
                    return `<div class="flex items-center gap-4 py-4 border-b border-gray-50 last:border-0">
                      <div class="w-10 h-10 ${isEarning?'bg-green-100':'bg-red-100'} rounded-xl flex items-center justify-center flex-shrink-0"><i class="fa-solid ${isEarning?'fa-arrow-down text-green-600':'fa-arrow-up text-red-500'}"></i></div>
                      <div class="flex-1 min-w-0"><p class="font-bold text-gray-900 text-sm">${tx.description||(isEarning?(isAr?'أرباح':'Earning'):(isAr?'سحب':'Withdrawal'))}</p><p class="text-xs text-gray-400">${formatDateAr(tx.createdAt)}</p></div>
                      <div class="text-end"><p class="font-black ${isEarning?'text-green-600':'text-red-500'}">${isEarning?'+':'-'}${formatCurrency(tx.amount||0)}</p><p class="text-xs text-gray-400">${tx.status||'—'}</p></div>
                    </div>`;
                }).join('');
            } catch(e) {
                if (e.code==='failed-precondition') container.innerHTML = `<p class="text-gray-400 text-center py-4 text-sm">${isAr?'جاري تهيئة السجل...':'Setting up...'}</p>`;
                else container.innerHTML = `<p class="text-red-400 text-center py-4">${t('general.error')}</p>`;
            }
        },

        openWithdrawForm() {
            const isAr = AppState.language !== 'en', wallet = AppState.wallet||{}, balance = wallet.balance||0;
            if (balance < PLATFORM.MIN_WITHDRAWAL) { showToast(`${isAr?'الحد الأدنى':'Min'}: ${formatCurrency(PLATFORM.MIN_WITHDRAWAL)}`,'warning'); return; }
            document.getElementById('withdrawModal')?.remove();
            const modal = document.createElement('div');
            modal.id = 'withdrawModal';
            modal.className = 'fixed inset-0 bg-black/70 z-[99999] flex items-center justify-center p-4';
            modal.innerHTML = `
              <div class="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
                <h3 class="text-xl font-black text-gray-900 mb-6">${isAr?'طلب سحب':'Withdrawal Request'}</h3>
                ${PLATFORM.WITHDRAWAL_NOTE?`<div class="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-700">${PLATFORM.WITHDRAWAL_NOTE}</div>`:''}
                <div class="space-y-4">
                  <div><label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'المبلغ (ج.م)':'Amount (EGP)'}</label>
                    <input type="number" id="withdrawAmount" class="form-input" min="${PLATFORM.MIN_WITHDRAWAL}" max="${Math.min(balance,PLATFORM.MAX_WITHDRAWAL)}" value="${balance}" placeholder="${PLATFORM.MIN_WITHDRAWAL}">
                    <p class="text-xs text-gray-400 mt-1">${isAr?'الرصيد':'Balance'}: ${formatCurrency(balance)} · ${isAr?'الحد الأقصى':'Max'}: ${formatCurrency(PLATFORM.MAX_WITHDRAWAL)}</p></div>
                  <div><label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'طريقة الاستلام':'Payout Method'}</label>
                    <select id="withdrawMethod" class="form-input"><option value="bank">${isAr?'تحويل بنكي':'Bank Transfer'}</option><option value="vodafone">${isAr?'فودافون كاش':'Vodafone Cash'}</option><option value="instapay">InstaPay</option></select></div>
                  <div><label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'تفاصيل الحساب':'Account Details'}</label>
                    <input type="text" id="withdrawAccount" class="form-input" placeholder="${isAr?'رقم الحساب أو المحفظة':'Account or wallet number'}" dir="ltr"></div>
                </div>
                <div class="flex gap-3 mt-6">
                  <button onclick="document.getElementById('withdrawModal').remove()" class="btn-secondary flex-1 py-3">${t('general.cancel')}</button>
                  <button onclick="WalletManager.submitWithdrawal()" class="btn-primary flex-1 py-3">${isAr?'إرسال الطلب':'Submit'}</button>
                </div>
              </div>`;
            document.body.appendChild(modal);
        },

        async submitWithdrawal() {
            const amount = parseFloat(document.getElementById('withdrawAmount')?.value);
            const method = document.getElementById('withdrawMethod')?.value;
            const account = document.getElementById('withdrawAccount')?.value?.trim();
            const user = AppState.currentUser, isAr = AppState.language !== 'en';
            if (!amount||amount<PLATFORM.MIN_WITHDRAWAL) { showToast(isAr?'المبلغ غير صالح':'Invalid amount','warning'); return; }
            if (!account) { showToast(isAr?'أدخل تفاصيل الحساب':'Enter account details','warning'); return; }
            showLoading();
            try {
                await window.db.collection(COLLECTIONS.WITHDRAWALS).add({ userId:user.uid, userName:user.displayName, userEmail:user.email, amount, method, accountInfo:sanitizeInput(account), status:'pending', createdAt:serverTimestamp() });
                await window.db.collection(COLLECTIONS.WALLET).doc(user.uid).update({ balance:increment(-amount), updatedAt:serverTimestamp() });
                document.getElementById('withdrawModal')?.remove();
                hideLoading();
                showToast(isAr?'تم إرسال طلب السحب! سيُعالج خلال 24-48 ساعة':'Request submitted! Processing in 24-48h','success',6000);
            } catch(e) { hideLoading(); showToast(t('general.error'),'error'); }
        },

        async approveWithdrawal(reqId) {
            showLoading();
            try {
                await window.db.collection(COLLECTIONS.WITHDRAWALS).doc(reqId).update({ status:'approved', processedAt:serverTimestamp() });
                hideLoading(); showToast(AppState.language==='en'?'Approved':'تمت الموافقة','success');
                adminTab('withdraw');
            } catch(e) { hideLoading(); showToast(e.message,'error'); }
        },

        async rejectWithdrawal(reqId) {
            showLoading();
            try {
                const snap = await window.db.collection(COLLECTIONS.WITHDRAWALS).doc(reqId).get();
                const req  = snap.data();
                await window.db.collection(COLLECTIONS.WALLET).doc(req.userId).update({ balance:increment(req.amount), updatedAt:serverTimestamp() });
                await window.db.collection(COLLECTIONS.WITHDRAWALS).doc(reqId).update({ status:'rejected', processedAt:serverTimestamp() });
                hideLoading(); showToast(AppState.language==='en'?'Rejected':'تم الرفض','info');
                adminTab('withdraw');
            } catch(e) { hideLoading(); showToast(e.message,'error'); }
        },
    };

    // ── Expose ────────────────────────────────────────────────────────────────
    window.DashboardManager = DashboardManager;
    window.DashboardManager.switchToBuyerView  = () => DashboardManager.switchToBuyerView();
    window.DashboardManager.switchToSellerView = () => DashboardManager.switchToSellerView();
    window.WalletManager    = WalletManager;
    window.adminTab         = adminTab;
    window.initDashboardPage  = () => DashboardManager.initDashboardPage();
    window.initWalletPage     = () => WalletManager.initWalletPage();
    window.DashboardManager.loadSellerServices = () => DashboardManager.loadSellerServices();

    // ── initAdminPage — called by navigateTo('admin') ─────────────────────────
    window.initAdminPage = function () {
        const user = AppState.currentUser, isAr = AppState.language !== 'en';
        const container = document.getElementById('adminContent');
        if (!container) return;
        if (!user || user.role !== 'admin') {
            container.innerHTML = `<div class="text-center py-20"><i class="fa-solid fa-lock text-gray-300 text-5xl mb-4"></i><h3 class="text-xl font-black text-gray-500">${isAr?'غير مصرح لك':'Access Denied'}</h3></div>`;
            return;
        }
        container.innerHTML = `
        <div>
          <div class="mb-8"><h1 class="text-3xl font-black text-gray-900">👑 ${isAr?'لوحة الإدارة':'Admin Panel'}</h1><p class="text-gray-500 mt-1">${isAr?'تحكم كامل في المنصة':'Full platform control'}</p></div>
          <div id="adminStatsRow" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            ${[1,2,3,4].map(()=>`<div class="bg-white rounded-2xl p-5 border border-gray-100 animate-pulse"><div class="h-8 bg-gray-100 rounded mb-2"></div><div class="h-4 bg-gray-50 rounded"></div></div>`).join('')}
          </div>
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div class="flex overflow-x-auto border-b border-gray-100 p-2 gap-1">
              <button onclick="adminTab('orders')"     class="tab-btn active" id="adminTab_orders"><i class="fa-solid fa-bag-shopping me-1"></i>${isAr?'الطلبات':'Orders'}</button>
              <button onclick="adminTab('disputes')"   class="tab-btn" id="adminTab_disputes"><i class="fa-solid fa-flag me-1"></i>${isAr?'النزاعات':'Disputes'}</button>
              <button onclick="adminTab('users')"      class="tab-btn" id="adminTab_users"><i class="fa-solid fa-users me-1"></i>${isAr?'المستخدمون':'Users'}</button>
              <button onclick="adminTab('services')"   class="tab-btn" id="adminTab_services"><i class="fa-solid fa-layer-group me-1"></i>${isAr?'الخدمات':'Services'}</button>
              <button onclick="adminTab('withdraw')"   class="tab-btn" id="adminTab_withdraw"><i class="fa-solid fa-money-bill-transfer me-1"></i>${isAr?'السحوبات':'Withdrawals'}</button>
              <button onclick="adminTab('coupons')"    class="tab-btn" id="adminTab_coupons"><i class="fa-solid fa-ticket me-1"></i>${isAr?'الكوبونات':'Coupons'}</button>
              <button onclick="adminTab('categories')" class="tab-btn" id="adminTab_categories"><i class="fa-solid fa-tags me-1"></i>${isAr?'الفئات':'Categories'}</button>
              <button onclick="adminTab('analytics')"  class="tab-btn" id="adminTab_analytics"><i class="fa-solid fa-chart-line me-1"></i>${isAr?'التحليلات':'Analytics'}</button>
              <button onclick="adminTab('reviews')"    class="tab-btn" id="adminTab_reviews"><i class="fa-solid fa-star me-1"></i>${isAr?'التقييمات':'Reviews'}</button>
              <button onclick="adminTab('reports')"    class="tab-btn" id="adminTab_reports"><i class="fa-solid fa-triangle-exclamation me-1"></i>${isAr?'البلاغات':'Reports'}</button>
              <button onclick="adminTab('broadcast')"  class="tab-btn" id="adminTab_broadcast"><i class="fa-solid fa-paper-plane me-1"></i>${isAr?'الإشعارات':'Broadcast'}</button>
              <button onclick="adminTab('payments')"   class="tab-btn" id="adminTab_payments"><i class="fa-solid fa-credit-card me-1"></i>${isAr?'المدفوعات':'Payments'}</button>
              <button onclick="adminTab('settings')"   class="tab-btn" id="adminTab_settings"><i class="fa-solid fa-sliders me-1"></i>${isAr?'الإعدادات':'Settings'}</button>
            </div>
            <div class="p-5" id="adminTabContent"></div>
          </div>
        </div>`;
        DashboardManager._loadAdminStats();
        adminTab('orders');
    };

    console.log('✅ Dashboard v4.0 — Full Admin Control');
})();
