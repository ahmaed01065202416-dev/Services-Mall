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
                <div><h1 class="text-2xl font-black text-gray-900">${isAr?`مرحباً، ${escapeHtml(user.displayName?.split(' ')[0]||'')}! 👋`:`Welcome, ${escapeHtml(user.displayName?.split(' ')[0]||'')}! 👋`}</h1>
                  <p class="text-gray-500 text-sm">${isAr?'لوحة المشتري':'Buyer Dashboard'}</p></div>
                <button onclick="navigateTo('services')" class="btn-primary px-5 py-2.5 text-sm"><i class="fa-solid fa-plus me-1"></i>${isAr?'طلب خدمة':'Order Service'}</button>
              </div>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center"><i class="fa-solid fa-bag-shopping text-blue-600 text-2xl mb-2"></i><p id="buyerTotalOrders" class="text-2xl font-black text-gray-900">—</p><p class="text-sm text-gray-500">${isAr?'الطلبات':'Orders'}</p></div>
                <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center"><i class="fa-solid fa-circle-check text-green-600 text-2xl mb-2"></i><p id="buyerCompletedOrders" class="text-2xl font-black text-gray-900">—</p><p class="text-sm text-gray-500">${isAr?'مكتملة':'Completed'}</p></div>
                <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center"><i class="fa-solid fa-wallet text-amber-600 text-2xl mb-2"></i><p class="text-2xl font-black text-gray-900">${formatCurrency(wallet.balance||0)}</p><p class="text-sm text-gray-500">${isAr?'المحفظة':'Wallet'}</p></div>
                <div class="bg-gradient-to-br from-navy-50 to-navy-100 rounded-2xl p-5 border border-navy-200 text-center cursor-pointer hover:border-navy-400 transition" onclick="DashboardManager.switchToSellerView()">
  <i class="fa-solid fa-rocket text-navy-600 text-2xl mb-2"></i>
  <p class="font-black text-navy-700 text-sm">${isAr?'انتقل للبيع':'Start Selling'}</p>
  <p class="text-navy-500 text-xs mt-1">${isAr?'لوحة البائع':'Seller View'}</p>
</div>
              </div>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <button onclick="navigateTo('orders')" class="bg-white rounded-2xl p-5 text-center border border-gray-100 hover:border-navy-300 transition"><i class="fa-solid fa-receipt text-navy-600 text-2xl mb-2"></i><p class="font-bold text-gray-800 text-sm">${t('orders.title')}</p></button>
                <button onclick="navigateTo('wallet')" class="bg-white rounded-2xl p-5 text-center border border-gray-100 hover:border-navy-300 transition"><i class="fa-solid fa-wallet text-green-600 text-2xl mb-2"></i><p class="font-bold text-gray-800 text-sm">${t('nav.wallet')}</p></button>
                <button onclick="navigateTo('profile')" class="bg-white rounded-2xl p-5 text-center border border-gray-100 hover:border-navy-300 transition"><i class="fa-solid fa-user text-purple-600 text-2xl mb-2"></i><p class="font-bold text-gray-800 text-sm">${t('nav.profile')}</p></button>
                <button onclick="navigateTo('services')" class="bg-white rounded-2xl p-5 text-center border border-gray-100 hover:border-navy-300 transition"><i class="fa-solid fa-store text-orange-500 text-2xl mb-2"></i><p class="font-bold text-gray-800 text-sm">${isAr?'تصفح الخدمات':'Browse'}</p></button>
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
                    <div class="flex-1 min-w-0"><p class="font-bold text-gray-900 text-sm truncate">${escapeHtml(o.serviceTitle||'—')}</p><p class="text-xs text-gray-400">${formatDateAr(o.createdAt)}</p></div>
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
              <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 mb-6 border-b border-gray-100">
                <div>
                  <div class="flex items-center gap-3 mb-1 flex-wrap">
                    <h1 class="text-2xl font-black text-gray-900">${isAr?'لوحة تحكم البائع':'Seller Dashboard'}</h1>
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-turquoise-50 text-turquoise-700 border border-turquoise-200">
                      <span class="w-2 h-2 rounded-full bg-turquoise-500 animate-pulse"></span>${isAr?'حساب معتمد':'Verified account'}
                    </span>
                  </div>
                  <p class="text-gray-500 text-sm">${isAr?`أهلاً بعودتك يا`:`Welcome back,`} <span class="font-bold text-gray-800">${escapeHtml(user.displayName?.split(' ')[0]||'')}</span></p>
                </div>
                <div class="flex flex-wrap items-center gap-3">
                  <button onclick="ServicesManager.openAddServiceForm('service')" class="flex items-center gap-2 px-4 py-2.5 bg-navy-700 hover:bg-navy-800 text-white rounded-xl font-bold text-sm transition">
                    <i class="fa-solid fa-plus text-xs"></i><span>${isAr?'إضافة خدمة':'Add Service'}</span>
                  </button>
                  <button onclick="ServicesManager.openAddServiceForm('product')" class="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-bold text-sm transition">
                    <i class="fa-solid fa-box-archive text-amber-400 text-xs"></i><span>${isAr?'إضافة منتج':'Add Product'}</span>
                  </button>
                  <button onclick="WalletManager.openWithdrawForm()" class="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl font-bold text-sm transition">
                    <i class="fa-solid fa-money-bill-transfer text-turquoise-600 text-xs"></i><span>${isAr?'سحب الأرباح':'Withdraw earnings'}</span>
                  </button>
                  <button onclick="DashboardManager.switchToBuyerView()" class="flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-xl transition">
                    <i class="fa-solid fa-store text-gray-500"></i><span>${isAr?'واجهة المشتري':'Buyer View'}</span>
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
                      <div class="flex-1 min-w-0"><p class="font-bold text-gray-900 truncate">${escapeHtml(s.title||'—')}</p><p class="text-sm text-gray-500">${formatCurrency(s.price||0)} · ${s.orderCount||0} ${isAr?'طلب':'orders'}</p></div>
                      <div class="flex gap-2">
                        <button onclick="ServicesManager._renderAddServiceForm(${editData});navigateTo('add-service')" class="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600 hover:bg-navy-100 hover:text-navy-600 transition"><i class="fa-solid fa-pen text-xs"></i></button>
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
                    if (el2) el2.textContent = avg.toFixed(1);
                }
                const recent = ordersSnap.docs.slice(0,5).map(d=>({id:d.id,...d.data()}));
                const c = document.getElementById('sellerRecentOrders');
                if (c) c.innerHTML = recent.length===0 ? `<p class="text-gray-400 text-center py-4">${t('orders.empty')}</p>` : recent.map(o=>`
                  <div class="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 rounded-xl px-2" onclick="openWorkspace('${o.id}')">
                    <div class="flex-1 min-w-0"><p class="font-bold text-gray-900 text-sm truncate">${escapeHtml(o.serviceTitle||'—')}</p><p class="text-xs text-gray-400">${escapeHtml(o.buyerName||'—')} · ${formatDateAr(o.createdAt)}</p></div>
                    <div class="flex items-center gap-2"><span class="font-black text-navy-700 text-sm">${formatCurrency(o.price||0)}</span><span class="status-badge ${getStatusClass(o.status)} text-xs">${getStatusText(o.status)}</span></div>
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

        // ⚠️ REWRITTEN as part of the "Super Admin" visual redesign — now pulls
        // escrow + disputes too (not just users/services/orders) so the KPI
        // row and the escrow compliance bar above the tabs show real numbers
        // instead of the static mock values from the design reference.
        async _loadAdminStats() {
            const isAr = AppState.language !== 'en';
            const row  = document.getElementById('adminStatsRow');
            const bar  = document.getElementById('adminEscrowBar');
            if (!row) return;
            try {
                const [usersSnap, servicesSnap, ordersSnap, escrowSnap, disputesOpenSnap] = await Promise.all([
                    window.db.collection(COLLECTIONS.USERS).get(),
                    window.db.collection(COLLECTIONS.SERVICES).get(),
                    window.db.collection(COLLECTIONS.ORDERS).get(),
                    window.db.collection(COLLECTIONS.ESCROW).get(),
                    window.db.collection(COLLECTIONS.DISPUTES).where('status','==','open').get(),
                ]);

                const orders       = ordersSnap.docs.map(d => d.data());
                const totalRevenue = orders.reduce((s,o) => s + (o.price || 0), 0);
                const activeCount    = orders.filter(o => [ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.PAYMENT_HELD, ORDER_STATUS.DELIVERED].includes(o.status)).length;
                const pendingCount   = orders.filter(o => o.status === ORDER_STATUS.PENDING).length;

                const users    = usersSnap.docs.map(d => d.data());
                const sellers  = users.filter(u => u.role === 'seller').length;
                const buyers   = users.filter(u => u.role === 'buyer' || !u.role).length;

                const services      = servicesSnap.docs.map(d => d.data());
                const productsCount = services.filter(s => s.listingType === 'product').length;
                const servicesCount = services.length - productsCount;

                const escrowHeld = escrowSnap.docs.reduce((s,d) => {
                    const e = d.data();
                    return (e.status === 'held' || e.status === 'frozen') ? s + (e.amount || 0) : s;
                }, 0);
                const openDisputes = disputesOpenSnap.size;

                row.innerHTML = `
                  <div class="stat-card-glow bg-white rounded-2xl p-5 border border-gray-100 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-purple-600 to-indigo-600"></div>
                    <p class="text-xs font-bold text-gray-500 mb-2">${isAr?'إيرادات المنصة المحققة':'Platform Revenue'}</p>
                    <p class="text-2xl font-black text-purple-700">${formatCurrency(calcPlatformFee(totalRevenue))}</p>
                    <p class="text-[11px] text-gray-400 mt-2">${isAr?'من إجمالي':'of'} ${formatCurrency(totalRevenue)}</p>
                  </div>
                  <div class="stat-card-glow bg-white rounded-2xl p-5 border border-gray-100 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 right-0 left-0 h-1 bg-amber-500"></div>
                    <p class="text-xs font-bold text-gray-500 mb-2">${isAr?'إجمالي الطلبات':'Total Orders'}</p>
                    <p class="text-2xl font-black text-gray-900">${ordersSnap.size}</p>
                    <p class="text-[11px] mt-2"><span class="text-emerald-600 font-bold">${activeCount} ${isAr?'قيد التنفيذ':'active'}</span> · <span class="text-amber-600 font-bold">${pendingCount} ${isAr?'بانتظار الدفع':'pending'}</span></p>
                  </div>
                  <div class="stat-card-glow bg-white rounded-2xl p-5 border border-gray-100 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 right-0 left-0 h-1 bg-teal-500"></div>
                    <p class="text-xs font-bold text-gray-500 mb-2">${isAr?'سوق الخدمات والمنتجات':'Marketplace'}</p>
                    <p class="text-2xl font-black text-teal-700">${servicesSnap.size}</p>
                    <p class="text-[11px] text-gray-400 mt-2">${servicesCount} ${isAr?'خدمة':'services'} · ${productsCount} ${isAr?'منتج فوري':'instant products'}</p>
                  </div>
                  <div class="stat-card-glow bg-white rounded-2xl p-5 border border-gray-100 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 right-0 left-0 h-1 bg-navy-900"></div>
                    <p class="text-xs font-bold text-gray-500 mb-2">${isAr?'قاعدة المستخدمين':'Users'}</p>
                    <p class="text-2xl font-black text-gray-900">${usersSnap.size}</p>
                    <p class="text-[11px] text-gray-400 mt-2">${isAr?'بائعين':'sellers'}: ${sellers} · ${isAr?'مشترين':'buyers'}: ${buyers}</p>
                  </div>
                  <div class="stat-card-glow bg-white rounded-2xl p-5 border border-gray-100 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 right-0 left-0 h-1 ${openDisputes>0?'bg-red-500':'bg-emerald-500'}"></div>
                    <p class="text-xs font-bold text-gray-500 mb-2">${isAr?'مؤشر النزاعات':'Disputes'}</p>
                    <p class="text-2xl font-black ${openDisputes>0?'text-red-600':'text-emerald-600'}">${openDisputes}</p>
                    <p class="text-[11px] text-gray-400 mt-2">${isAr?'نزاع مفتوح':'open dispute(s)'}</p>
                  </div>`;

                if (bar) {
                    bar.innerHTML = `
                      <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center text-xl shadow-md shrink-0">
                          <i class="fa-solid fa-shield-halved"></i>
                        </div>
                        <div>
                          <div class="flex items-center gap-2 flex-wrap">
                            <h3 class="font-bold text-gray-900 text-sm">${isAr?'نظام الضمان المالي (Escrow)':'Financial Escrow System'}</h3>
                            <span class="bg-emerald-100 text-emerald-800 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border border-emerald-200">${isAr?'نشط':'Active'}</span>
                          </div>
                          <p class="text-xs text-gray-600 mt-1">${isAr
                            ? `إجمالي أموال المعاملات قيد التنفيذ (<strong class="text-gray-900">${formatCurrency(escrowHeld)}</strong>) محجوزة في الحساب الوسيط، وتُحرر للبائعين فور استلام المشترين أو حل أي نزاع.`
                            : `Funds currently in escrow (<strong class="text-gray-900">${formatCurrency(escrowHeld)}</strong>) are held safely and released once the buyer confirms or a dispute is resolved.`}</p>
                        </div>
                      </div>
                      <div class="flex items-center gap-3 shrink-0">
                        <button onclick="adminTab('disputes')" class="px-4 py-2 bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5">
                          <i class="fa-solid fa-scale-balanced"></i><span>${isAr?'مراجعة النزاعات':'Review disputes'}</span>
                        </button>
                      </div>`;
                }
            } catch(e) { console.warn('[Admin Stats]',e.message); }
        },
    };

    // ══════════════════════════════════════════════════════════════════════════
    // ADMIN TAB RENDERER — كل تاب بتحكم كامل
    // ══════════════════════════════════════════════════════════════════════════
    // ⚠️ ADDED: admin-only hard delete for an order and/or its chat, callable
    // from anywhere (the admin orders list below, or the order workspace
    // itself) — not nested inside adminTab('orders') so it's available even
    // if that tab was never opened this session. Realtime Database's own
    // security rules have no "admin" concept at all (see database.rules.json
    // — every rule only checks "is this the buyer/seller of THIS chat"), so
    // this can't be done safely with a plain client-side RTDB call — it goes
    // through functions/api/admin-delete.js, which verifies a real Firebase
    // ID token server-side before using service-account credentials to
    // bypass both Firestore's and RTDB's rules at once.
    async function adminDeleteOrderOrChat(orderId, type) {
        const isAr = AppState.language !== 'en';
        const label = type === 'chat'
            ? (isAr ? 'حذف كل رسائل هذا الطلب نهائيًا؟ لا يمكن التراجع.' : 'Permanently delete all messages for this order? This cannot be undone.')
            : (isAr ? 'حذف الطلب بالكامل نهائيًا (والشات معه)؟ لا يمكن التراجع.' : 'Permanently delete this order (and its chat)? This cannot be undone.');
        if (!confirm(label)) return false;
        showLoading();
        try {
            const idToken = await firebase.auth().currentUser.getIdToken();
            const resp = await fetch('/api/admin-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({ orderId, type }),
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
            hideLoading();
            showToast(isAr ? '✅ تم الحذف' : '✅ Deleted', 'success');
            return true;
        } catch (e) {
            hideLoading();
            showToast(e.message || (isAr ? 'تعذّر الحذف' : 'Delete failed'), 'error');
            return false;
        }
    }
    window.AdminActions = { deleteOrderOrChat: adminDeleteOrderOrChat };

    async function adminTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`adminTab_${tab}`)?.classList.add('active');
        const container = document.getElementById('adminTabContent');
        if (!container) return;
        const isAr = AppState.language !== 'en';
        container.innerHTML = `<div class="text-center py-8"><i class="fa-solid fa-spinner fa-spin text-navy-500 text-2xl"></i></div>`;
        try {

            // ── ORDERS ────────────────────────────────────────────────────────
            if (tab === 'orders') {
                const ordersSnap = await window.db.collection(COLLECTIONS.ORDERS).orderBy('createdAt','desc').limit(100).get();
                const orders = ordersSnap.docs.map(d=>({id:d.id,...d.data()}));
                const _iconFor = o => o.listingType === 'product'
                    ? { icon: 'fa-box-open', bg: 'bg-teal-100', color: 'text-teal-700' }
                    : { icon: 'fa-layer-group', bg: 'bg-orange-100', color: 'text-orange-700' };
                container.innerHTML = `
                <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <h3 class="font-black text-gray-900 flex items-center gap-2">${isAr?'إدارة الطلبات والمعاملات':'Orders & transactions'}
                    <span class="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-0.5 rounded-full border border-amber-200">${isAr?`${orders.length} طلب`:`${orders.length} orders`}</span>
                  </h3>
                </div>
                ${orders.length===0 ? `<p class="text-gray-400 text-center py-8">${t('orders.empty')}</p>` : `
                <div class="divide-y divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden">${orders.map(o=>{
                  const ic = _iconFor(o);
                  const commission = calcPlatformFee(o.price||0);
                  return `
                  <div class="p-4 hover:bg-gray-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div class="flex items-start gap-3 flex-1 min-w-0 cursor-pointer" onclick="openWorkspace('${o.id}')">
                      <div class="w-11 h-11 rounded-xl ${ic.bg} ${ic.color} flex items-center justify-center shrink-0"><i class="fa-solid ${ic.icon} text-lg"></i></div>
                      <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="font-bold text-gray-900 text-sm truncate">${escapeHtml(o.serviceTitle||'—')}</span>
                          <span class="text-[11px] font-mono font-bold text-gray-400">#${(o.id||'').substr(-8).toUpperCase()}</span>
                          <span class="status-badge ${getStatusClass(o.status)} text-[11px]">${getStatusText(o.status)}</span>
                        </div>
                        <p class="text-xs text-gray-400 mt-0.5">${escapeHtml(o.buyerName||'—')} ← ${escapeHtml(o.sellerName||'—')} · ${formatDateAr(o.createdAt)}</p>
                      </div>
                    </div>
                    <div class="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                      <div class="text-right">
                        <p class="font-black text-gray-900 text-sm">${formatCurrency(o.price||0)}</p>
                        <p class="text-[11px] text-teal-700 font-semibold">${isAr?'عمولة':'fee'}: ${formatCurrency(commission)}</p>
                      </div>
                      <div class="flex gap-1.5">
                        <button title="${isAr?'إتمام قسري':'Force Complete'}" onclick="window._adminForceStatus('${o.id}','completed')" class="w-8 h-8 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs flex items-center justify-center hover:bg-emerald-600 hover:text-white transition"><i class="fa-solid fa-check"></i></button>
                        <button title="${isAr?'إلغاء قسري':'Force Cancel'}" onclick="window._adminForceStatus('${o.id}','cancelled')" class="w-8 h-8 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs flex items-center justify-center hover:bg-red-600 hover:text-white transition"><i class="fa-solid fa-xmark"></i></button>
                        <button title="${isAr?'حذف الشات فقط':'Delete chat only'}" onclick="window.AdminActions.deleteOrderOrChat('${o.id}','chat').then(ok=>ok&&adminTab('orders'))" class="w-8 h-8 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs flex items-center justify-center hover:bg-amber-600 hover:text-white transition"><i class="fa-solid fa-comment-slash"></i></button>
                        <button title="${isAr?'حذف الطلب نهائيًا':'Delete order permanently'}" onclick="window.AdminActions.deleteOrderOrChat('${o.id}','order').then(ok=>ok&&adminTab('orders'))" class="w-8 h-8 bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-xs flex items-center justify-center hover:bg-rose-600 hover:text-white transition"><i class="fa-solid fa-trash-can"></i></button>
                      </div>
                    </div>
                  </div>`;}).join('')}
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
                <h3 class="font-black text-gray-900 flex items-center gap-2 mb-4"><i class="fa-solid fa-shield-halved text-emerald-600"></i>${isAr?'النزاعات وضمان الأموال':'Disputes & escrow safety'}</h3>
                ${open.length===0
                  ? `<div class="text-center py-6 mb-6 bg-green-50 rounded-2xl border border-green-200"><p class="text-green-700 font-bold">✅ ${isAr?'لا توجد نزاعات مفتوحة':'No open disputes'}</p></div>`
                  : `<div class="space-y-4 mb-8">${open.map(d=>`
                    <div class="p-5 bg-red-50 rounded-2xl border border-red-200">
                      <div class="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p class="font-black text-gray-900">${isAr?'نزاع على الطلب':'Dispute on order'} #${(d.orderId||'').substr(-8).toUpperCase()}</p>
                          <p class="text-sm text-gray-600 mt-1">${escapeHtml(d.reason||'—')}</p>
                          <p class="text-xs text-gray-400 mt-1">${isAr?'رُفع بواسطة:':'Raised by:'} ${escapeHtml(d.raisedByName||d.raisedBy||'—')}${d.raisedByRole ? ` <span class="font-bold">(${d.raisedByRole==='seller' ? (isAr?'بائع':'seller') : d.raisedByRole==='system' ? (isAr?'⏱️ تلقائي — لا رد من العميل':'⏱️ automatic — no buyer response') : (isAr?'مشتري':'buyer')})</span>` : ''}</p>
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
                    <div class="flex-1 min-w-0"><p class="text-sm font-bold text-gray-800">#${(d.orderId||'').substr(-8).toUpperCase()}</p><p class="text-xs text-gray-400">${escapeHtml(d.reason||'—')}</p></div>
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
                    <div class="flex-1 min-w-0"><p class="font-bold text-gray-900 truncate">${escapeHtml(u.name||'—')}</p><p class="text-xs text-gray-400">${escapeHtml(u.email||'')}</p>
                      ${u.role==='seller' && u.payoutAccount ? `<p class="text-[11px] text-teal-700 font-bold mt-0.5"><i class="fa-solid fa-id-card me-1"></i>${u.payoutMethod==='vodafone'?(isAr?'فودافون كاش':'Vodafone Cash'):u.payoutMethod==='instapay'?'InstaPay':(isAr?'تحويل بنكي':'Bank')}: ${escapeHtml(u.payoutAccount)}</p>` : ''}
                    </div>
                    <select onchange="window._adminChangeRole('${u.id}',this.value,this)" class="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white font-bold ${u.role==='admin'?'text-purple-700':u.role==='seller'?'text-green-700':'text-blue-700'}">
                      <option value="buyer"  ${u.role==='buyer' ?'selected':''}>buyer</option>
                      <option value="seller" ${u.role==='seller'?'selected':''}>seller</option>
                      <option value="admin"  ${u.role==='admin' ?'selected':''}>admin</option>
                    </select>
                    <button title="${isAr?'عرض المحفظة':'View Wallet'}" onclick="window._adminViewWallet('${u.id}','${escapeHtml((u.name||'User').replace(/'/g,"\\'"))}')" class="w-8 h-8 bg-amber-100 text-amber-700 rounded-lg flex items-center justify-center hover:bg-amber-200 transition"><i class="fa-solid fa-wallet text-xs"></i></button>
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
                      <p class="font-bold text-gray-900 text-sm truncate">${escapeHtml(s.title||'—')}</p>
                      <p class="text-xs text-gray-400">${escapeHtml(s.sellerName||'')} · ${formatCurrency(s.price||0)}</p>
                    </div>
                    <div class="flex items-center gap-1 flex-wrap">
                      <button title="${s.featured?'إلغاء التمييز':'تمييز'}" onclick="window._adminToggleFeatured('${s.id}',${!s.featured})"
                        class="text-xs px-2 py-1.5 ${s.featured?'bg-yellow-200 text-yellow-800':'bg-gray-200 text-gray-600'} rounded-lg font-bold hover:opacity-80 transition">
                        ${s.featured?'<i class=\'fa-solid fa-star\'></i> مميزة':'<i class=\'fa-regular fa-star\'></i> تمييز'}
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
                        <p class="font-black text-gray-900">${escapeHtml(r.userName||'—')}</p>
                        <p class="text-sm text-gray-600">${escapeHtml(r.method||'—')} · ${escapeHtml(r.accountInfo||'—')}</p>
                        <p class="text-xs text-gray-400">${formatDateAr(r.createdAt)}</p>
                        ${r.feeAmount ? `<p class="text-xs text-gray-500 mt-1">${isAr?'إجمالي':'Gross'}: ${formatCurrency(r.amount||0)} − ${isAr?'عمولة تحويل':'transfer fee'} ${formatCurrency(r.feeAmount)} = <span class="font-bold text-gray-700">${isAr?'صافي يتحول له':'net to pay'}: ${formatCurrency(r.netAmount)}</span></p>` : ''}
                      </div>
                      <span class="font-black text-amber-700 text-xl">${formatCurrency(r.feeAmount ? r.netAmount : (r.amount||0))}</span>
                      <div class="flex gap-2">
                        <button onclick="WalletManager.approveWithdrawal('${r.id}')" title="${isAr?'اضغط بعد ما تحوّل الفلوس فعليًا للبائع':'Click after you have actually paid the seller'}" class="text-sm px-4 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition">${isAr?'✓ تم استلام الأرباح':'✓ Seller Paid'}</button>
                        <button onclick="WalletManager.rejectWithdrawal('${r.id}')" class="text-sm px-4 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition">${isAr?'✕ رفض':'✕ Reject'}</button>
                      </div>
                    </div>`).join('')}</div>`}
                <h4 class="font-black text-gray-700 mb-3 text-sm">${isAr?'سجل السحوبات':'Withdrawal History'}</h4>
                <div class="space-y-2">${all.map(r=>`
                  <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <div class="flex-1 min-w-0"><p class="text-sm font-bold text-gray-800">${escapeHtml(r.userName||'—')}</p><p class="text-xs text-gray-400">${escapeHtml(r.method||'—')} · ${escapeHtml(r.accountInfo||'—')}${r.status==='completed'&&r.paidAt?` · ${isAr?'اتحوّلت':'paid'} ${formatDateAr(r.paidAt)}`:''}</p></div>
                    <span class="font-black text-sm">${formatCurrency(r.feeAmount ? r.netAmount : (r.amount||0))}</span>
                    <span class="text-xs font-bold px-2 py-1 rounded-lg ${r.status==='completed'?'bg-green-100 text-green-700':r.status==='rejected'?'bg-red-100 text-red-700':'bg-amber-100 text-amber-700'}">${r.status==='completed'?(isAr?'✓ اتدفعت':'Paid'):r.status==='rejected'?(isAr?'مرفوض':'Rejected'):(isAr?'معلق':'Pending')}</span>
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
                    <div class="w-20 bg-navy-100 rounded-lg text-center py-2"><p class="font-black text-navy-700 text-sm tracking-widest">${c.code||'—'}</p></div>
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
                const [catsSnap, reqSnap] = await Promise.all([
                    window.db.collection(COLLECTIONS.CATEGORIES).orderBy('order','asc').get(),
                    window.db.collection(COLLECTIONS.CATEGORY_REQUESTS).where('status','==','pending').get(),
                ]);
                const cats = catsSnap.docs.map(d=>({id:d.id,...d.data()}));
                const catRequests = reqSnap.docs.map(d=>({id:d.id,...d.data()}));
                container.innerHTML = `
                <!-- ⚠️ ADDED: seller-suggested categories awaiting review — see
                     ServicesManager.saveService() in services.js, which writes
                     here whenever a seller picks "Other" and names what they
                     actually needed. Approving copies it into the real
                     categories list below (a further code change is still
                     needed to add it to the live add-listing dropdown itself
                     — this queue is the review/triage step, not auto-deploy). -->
                ${catRequests.length > 0 ? `
                <div class="mb-6">
                  <h3 class="font-black text-gray-900 mb-3 flex items-center gap-2"><i class="fa-solid fa-lightbulb text-amber-500"></i>${isAr?`تصنيفات مقترحة من البائعين (${catRequests.length})`:`Seller-suggested categories (${catRequests.length})`}</h3>
                  <div class="space-y-2">
                    ${catRequests.map(r => `
                    <div class="flex items-center gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
                      <div class="flex-1 min-w-0">
                        <p class="font-bold text-gray-900">${escapeHtml(r.name)} <span class="text-xs font-normal text-gray-500">(${r.listingType==='product'?(isAr?'منتج':'product'):(isAr?'خدمة':'service')})</span></p>
                        <p class="text-xs text-gray-400">${isAr?'اقترحها':'suggested by'} ${escapeHtml(r.requestedByName||'—')} · ${formatDateAr(r.createdAt)}</p>
                      </div>
                      <button onclick="window._adminApproveCategoryRequest('${r.id}','${escapeHtml(r.name).replace(/'/g,"\\'")}')" class="text-xs px-3 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition">${isAr?'✓ موافقة وإضافة':'✓ Approve & add'}</button>
                      <button onclick="window._adminRejectCategoryRequest('${r.id}')" class="text-xs px-3 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition">${isAr?'رفض':'Dismiss'}</button>
                    </div>`).join('')}
                  </div>
                </div>` : ''}
                <div class="flex items-center justify-between mb-6">
                  <h3 class="font-black text-gray-900">${isAr?`الفئات (${cats.length})`:`Categories (${cats.length})`}</h3>
                  <button onclick="window._adminAddCategory()" class="btn-primary text-sm px-4 py-2"><i class="fa-solid fa-plus me-1"></i>${isAr?'إضافة فئة':'Add Category'}</button>
                </div>
                <div class="space-y-2">
                ${cats.map((c,i)=>`
                  <div class="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
                    <span class="text-2xl">${c.icon||'📦'}</span>
                    <div class="flex-1 min-w-0"><p class="font-bold text-gray-900">${escapeHtml(c.name_ar||c.name||'—')}</p><p class="text-xs text-gray-400">${escapeHtml(c.name_en||'')}</p></div>
                    <span class="text-xs text-gray-400 w-6 text-center">${c.order||i}</span>
                    <button onclick="window._adminEditCategory('${c.id}','${(c.name_ar||'').replace(/'/g,"\\'")}','${(c.name_en||'').replace(/'/g,"\\'")}','${c.icon||''}',${c.order||0})" class="w-7 h-7 bg-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-navy-100 hover:text-navy-600 transition"><i class="fa-solid fa-pen text-xs"></i></button>
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
                window._adminApproveCategoryRequest = async (reqId, name) => {
                    try {
                        await window.db.collection(COLLECTIONS.CATEGORIES).add({
                            name_ar: name, name_en: name, icon: '📦', order: cats.length,
                            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
                        });
                        await window.db.collection(COLLECTIONS.CATEGORY_REQUESTS).doc(reqId).update({ status: 'approved', reviewedAt: serverTimestamp() });
                        showToast(isAr?'✅ اتضافت — محتاجة تتضاف كمان في نموذج نشر الإعلان (تحديث كود)':'✅ Added — still needs adding to the add-listing form (code update)', 'success');
                        adminTab('categories');
                    } catch(e) { showToast(e.message,'error'); }
                };
                window._adminRejectCategoryRequest = async (reqId) => {
                    try { await window.db.collection(COLLECTIONS.CATEGORY_REQUESTS).doc(reqId).update({ status: 'rejected', reviewedAt: serverTimestamp() }); showToast(isAr?'تم الرفض':'Dismissed','success'); adminTab('categories'); }
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
                    <div class="bg-gradient-to-br from-navy-500 to-navy-700 rounded-2xl p-4 text-white text-center"><p class="text-2xl font-black">${formatCurrency(totalRev)}</p><p class="text-navy-200 text-xs mt-1">${isAr?'إجمالي المبيعات':'Total Sales'}</p></div>
                    <div class="bg-gradient-to-br from-purple-500 to-purple-700 rounded-2xl p-4 text-white text-center"><p class="text-2xl font-black">${formatCurrency(platRev)}</p><p class="text-purple-200 text-xs mt-1">${isAr?'إيراداتك':'Your Revenue'}</p></div>
                    <div class="bg-gradient-to-br from-teal-500 to-teal-700 rounded-2xl p-4 text-white text-center"><p class="text-2xl font-black">${completed.length}</p><p class="text-teal-200 text-xs mt-1">${isAr?'طلب مكتمل':'Completed Orders'}</p></div>
                    <div class="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-4 text-white text-center"><p class="text-2xl font-black">${usersSnap.size}</p><p class="text-amber-200 text-xs mt-1">${isAr?'إجمالي المستخدمين':'Total Users'}</p></div>
                  </div>

                  <!-- Monthly Revenue Chart (Chart.js) -->
                  <div class="bg-white rounded-2xl border border-gray-100 p-5">
                    <h3 class="font-black text-gray-900 mb-4">${isAr?'الإيرادات الشهرية':'Monthly Revenue'}</h3>
                    ${sortedMonths.length===0
                      ? `<p class="text-gray-400 text-center py-6">${isAr?'لا توجد بيانات':'No data yet'}</p>`
                      : `<div style="height:220px"><canvas id="adminRevenueChart"></canvas></div>`}
                  </div>

                  <div class="grid md:grid-cols-2 gap-4">
                    <!-- Top Sellers -->
                    <div class="bg-white rounded-2xl border border-gray-100 p-5">
                      <h3 class="font-black text-gray-900 mb-4"><i class="fa-solid fa-trophy text-amber-500 me-1.5"></i>${isAr?'أكثر البائعين إيراداً':'Top Sellers'}</h3>
                      ${topSellers.length===0 ? `<p class="text-gray-400 text-center py-4">${isAr?'لا يوجد':'No data'}</p>` : topSellers.map((s,i)=>`
                      <div class="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                        <span class="w-6 h-6 rounded-full bg-navy-100 text-navy-700 text-xs font-black flex items-center justify-center flex-shrink-0">${i+1}</span>
                        <div class="flex-1 min-w-0"><p class="text-sm font-bold text-gray-900 truncate">${escapeHtml(s.name||'')}</p><p class="text-xs text-gray-400">${s.orders} ${isAr?'طلب':'orders'}</p></div>
                        <span class="font-black text-teal-700 text-sm">${formatCurrency(s.revenue)}</span>
                      </div>`).join('')}
                    </div>

                    <!-- Top Services -->
                    <div class="bg-white rounded-2xl border border-gray-100 p-5">
                      <h3 class="font-black text-gray-900 mb-4"><i class="fa-solid fa-fire text-orange-500 me-1.5"></i>${isAr?'أكثر الخدمات طلباً':'Top Services'}</h3>
                      ${topServices.length===0 ? `<p class="text-gray-400 text-center py-4">${isAr?'لا يوجد':'No data'}</p>` : topServices.map((s,i)=>`
                      <div class="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                        <span class="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-black flex items-center justify-center flex-shrink-0">${i+1}</span>
                        <div class="flex-1 min-w-0"><p class="text-sm font-bold text-gray-900 truncate">${escapeHtml(s.title||'')}</p><p class="text-xs text-gray-400">${formatCurrency(s.revenue)}</p></div>
                        <span class="font-black text-amber-700 text-sm">${s.count} ${isAr?'طلب':'orders'}</span>
                      </div>`).join('')}
                    </div>
                  </div>

                  <!-- Summary -->
                  <div class="bg-gray-50 rounded-2xl border border-gray-100 p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div><p class="text-lg font-black text-gray-900">${allOrders.length}</p><p class="text-xs text-gray-500">${isAr?'إجمالي الطلبات':'Total Orders'}</p></div>
                    <div><p class="text-lg font-black text-gray-900">${servicesSnap.size}</p><p class="text-xs text-gray-500">${isAr?'الخدمات':'Services'}</p></div>
                    <div><p class="text-lg font-black text-gray-900">${allOrders.length>0?Math.round(completed.length/allOrders.length*100):0}%</p><p class="text-xs text-gray-500">${isAr?'معدل الإتمام':'Completion Rate'}</p></div>
                    <div><p class="text-lg font-black text-gray-900">${completed.length>0?formatCurrency(totalRev/completed.length):formatCurrency(0)}</p><p class="text-xs text-gray-500">${isAr?'متوسط قيمة الطلب':'Avg Order Value'}</p></div>
                  </div>
                </div>`;

                // ⚠️ ADDED: real Chart.js chart (was a hand-drawn div bar chart) —
                // destroy any previous instance first since adminTab can be
                // called repeatedly without a full page reload.
                if (sortedMonths.length > 0 && window.Chart) {
                    const canvas = document.getElementById('adminRevenueChart');
                    if (canvas) {
                        if (window._adminRevenueChartInstance) window._adminRevenueChartInstance.destroy();
                        window._adminRevenueChartInstance = new Chart(canvas, {
                            type: 'bar',
                            data: {
                                labels: sortedMonths.map(([m]) => m),
                                datasets: [{
                                    label: isAr ? 'الإيرادات' : 'Revenue',
                                    data: sortedMonths.map(([, v]) => v.revenue),
                                    backgroundColor: '#0F172A',
                                    borderRadius: 6,
                                }],
                            },
                            options: {
                                responsive: true, maintainAspectRatio: false,
                                plugins: { legend: { display: false } },
                                scales: { y: { beginAtZero: true, ticks: { callback: v => formatCurrency(v) } } },
                            },
                        });
                    }
                }

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
                        <span class="text-yellow-500 text-sm">${'<i class=\'fa-solid fa-star\'></i>'.repeat(r.rating||0)}</span>
                        <span class="text-xs font-bold text-gray-700">${escapeHtml(r.reviewerName||'—')}</span>
                        <span class="text-xs text-gray-400">→ ${escapeHtml(r.sellerName||'—')}</span>
                      </div>
                      <p class="text-sm text-gray-700">${escapeHtml(r.comment||'—')}</p>
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
                      <p class="text-sm text-gray-600 mt-1">${escapeHtml(r.reason||'—')}</p>
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
                    <button onclick="window._adminSendBroadcast(${totalUsers})" id="bcBtn" class="w-full py-3.5 bg-gradient-to-r from-navy-500 to-navy-700 text-white font-black rounded-xl hover:from-navy-600 hover:to-navy-800 transition flex items-center justify-center gap-2">
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
                  <div class="bg-navy-50 border border-navy-200 rounded-xl p-4 text-center"><p class="text-xl font-black text-navy-700">${formatCurrency(totalIn-totalOut)}</p><p class="text-xs text-navy-600 mt-1">${isAr?'صافي المنصة':'Net'}</p></div>
                </div>
                <h4 class="font-black text-gray-900 mb-3">${isAr?'سجل المدفوعات':'Payment Records'}</h4>
                <div class="space-y-2">${payments.length===0 ? `<p class="text-gray-400 text-center py-6">${isAr?'لا توجد مدفوعات':'No payments'}</p>` : payments.map(p=>`
                  <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${p.status==='success'||p.status==='completed'?'bg-green-100':'bg-amber-100'}">
                      <i class="fa-solid fa-credit-card text-xs ${p.status==='success'||p.status==='completed'?'text-green-600':'text-amber-600'}"></i>
                    </div>
                    <div class="flex-1 min-w-0"><p class="text-sm font-bold text-gray-900 truncate">${escapeHtml(p.userName||p.userId?.substr(0,8)||'—')}</p><p class="text-xs text-gray-400">${escapeHtml(p.method||'—')} · ${formatDateAr(p.createdAt)}</p></div>
                    <span class="font-black text-sm text-gray-900">${formatCurrency(p.amount||0)}</span>
                    <span class="text-xs font-bold px-2 py-1 rounded-lg ${p.status==='success'||p.status==='completed'?'bg-green-100 text-green-700':'bg-amber-100 text-amber-700'}">${p.status||'—'}</span>
                  </div>`).join('')}
                </div>

                <!-- ── Payment Keys Section ── -->
                <div class="mt-5 bg-amber-50 border border-amber-200 rounded-2xl p-5">
                  <h4 class="font-black text-amber-800 mb-2 flex items-center gap-2">
                    <i class="fa-solid fa-key text-amber-600"></i>
                    ${isAr ? 'مفاتيح بوابة الدفع (فاتورتك)' : 'Payment Gateway Keys (Fawaterak)'}
                  </h4>
                  <p class="text-sm text-amber-700 mb-3">
                    ${isAr
                      ? 'المفاتيح السرية لا تُحفظ في قاعدة البيانات — تُضاف من Cloudflare Pages → Settings → Environment Variables فقط'
                      : 'Secret keys are never stored in the database — add them in Cloudflare Pages → Settings → Environment Variables only'}
                  </p>
                  <div class="space-y-2 mb-4" id="gatewayStatusList">
                    <div class="text-center text-xs text-amber-500 py-2"><i class="fa-solid fa-spinner fa-spin me-1"></i>${isAr?'جاري الفحص...':'Checking...'}</div>
                  </div>
                  <a href="https://dash.cloudflare.com/?to=/:account/pages" target="_blank"
                     class="flex items-center justify-center gap-2 py-2.5 px-4 bg-amber-600 text-white rounded-xl text-sm font-bold hover:bg-amber-700 transition">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i>
                    ${isAr ? 'افتح Cloudflare Pages (اختر مشروعك → Settings → Environment Variables)' : 'Open Cloudflare Pages (pick your project → Settings → Environment Variables)'}
                  </a>
                  <p class="text-xs text-amber-600 mt-2 text-center">
                    ${isAr ? '📄 راجع ملف .env.example في المشروع لشرح كل متغيّر' : '📄 See .env.example in the project for all variables explained'}
                  </p>
                </div>`;

            // Check gateway key statuses
            (async () => {
                const list = document.getElementById('gatewayStatusList');
                if (!list) return;
                const isAr2 = AppState.language !== 'en';
                const gateways = [
                    {id:'fawaterak', label:'فواتيرك (بطاقات + فوري + محافظ)', env:'FAWATERAK_API_KEY'},
                ];
                let statuses = {};
                try {
                    const r = await fetch('/api/payment', {
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
                    <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-2"><i class="fa-solid fa-percent text-navy-500"></i>${isAr?'العمولة':'Commission'}</h3>
                    <p class="text-xs text-gray-400 mb-4">${isAr?'تُخصم من كل دفعة يستلمها البائع':'Deducted from every seller payout'}</p>

                    <!-- Fee Type selector -->
                    <div class="mb-4">
                      <label class="block text-xs font-bold text-gray-600 mb-2">${isAr?'نوع العمولة':'Commission Type'}</label>
                      <div class="grid grid-cols-3 gap-2" id="feeTypeGroup">
                        ${['percent','fixed','both'].map(v=>`
                          <button type="button" onclick="window._selectFeeType('${v}')"
                            id="feeTypeBtn_${v}"
                            class="feeTypBtn py-2 rounded-xl text-sm font-bold border transition-all ${(cfg.FEE_TYPE||'percent')===v?'bg-navy-600 text-white border-navy-600':'bg-gray-50 text-gray-600 border-gray-200 hover:border-navy-400'}">
                            ${v==='percent'?(isAr?'نسبة %':'Percent %'):v==='fixed'?(isAr?'مبلغ ثابت':'Fixed'):( isAr?'نسبة + ثابت':'Both')}
                          </button>`).join('')}
                      </div>
                    </div>

                    <!-- Percent input -->
                    <div id="cfg_percent_row" class="${(cfg.FEE_TYPE||'percent')==='fixed'?'hidden':''} mb-3">
                      <label class="block text-xs font-bold text-gray-600 mb-1">${isAr?'النسبة المئوية':'Percentage'}</label>
                      <div class="flex items-center gap-3">
                        <input type="range" id="cfg_fee" min="0" max="30" step="0.5"
                          value="${cfg.FEE_PERCENT??5}" class="flex-1 accent-navy-500"
                          oninput="document.getElementById('cfg_fee_val').textContent=this.value+'%'">
                        <span id="cfg_fee_val" class="w-20 text-center font-black text-navy-700 text-xl bg-navy-50 rounded-xl py-2">${cfg.FEE_PERCENT??5}%</span>
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
                    <div class="bg-navy-50 rounded-xl p-3 text-sm mt-2">
                      <p class="text-xs font-bold text-navy-700 mb-1">${isAr?'مثال على طلب بـ 500 ج.م:':'Example on 500 EGP order:'}</p>
                      <div class="flex justify-between text-navy-800 font-bold" id="feePreview">
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
                        <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-navy-600"></div></div>
                        <span class="text-sm font-bold text-gray-700">${isAr?'شرائح العمولة (حسب قيمة الطلب)':'Commission Tiers (by order amount)'}</span>
                      </label>
                      <div id="tiersEditor" class="${cfg.TIERS_ENABLED?'':' hidden'}">
                        <p class="text-xs text-gray-400 mb-2">${isAr?'كل شريحة تُطبَّق على الطلبات ضمن نطاقها وتتجاوز النسبة الافتراضية':'Each tier overrides the default rate for orders in that range'}</p>
                        <div id="tiersRows">
                          ${_renderTierRows(cfg,isAr)}
                        </div>
                        <button type="button" onclick="window._addTierRow()" class="text-sm text-navy-600 font-bold hover:underline mt-1"><i class="fa-solid fa-plus me-1"></i>${isAr?'إضافة شريحة':'Add Tier'}</button>
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
                  <div class="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                    <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-2"><i class="fa-solid fa-user-plus text-purple-500"></i>${isAr?'برنامج التسويق بالعمولة':'Affiliate Program'}</h3>
                    <label class="flex items-center gap-3 cursor-pointer mb-4">
                      <div class="relative"><input type="checkbox" id="cfg_affiliate_enabled" ${cfg.AFFILIATE_ENABLED?'checked':''} class="sr-only peer">
                      <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div></div>
                      <span class="text-sm font-bold text-gray-700">${isAr?'تفعيل برنامج الأفلييت':'Enable affiliate program'}</span>
                    </label>
                    <p class="text-xs text-gray-400 mb-3">${isAr?'المُحيل بياخد نسبة من عمولة المنصة نفسها (مش زيادة على المشتري/البائع) — لأول 5 مبيعات لكل شخص جديد بيتم جلبه':'The referrer earns a % of the platform\'s own fee (not an extra charge on buyer/seller) — for the first 5 sales of each person they bring in'}</p>
                    <div>
                      <label class="block text-xs font-bold text-gray-600 mb-1">${isAr?'نسبة عمولة المُحيل (% من عمولة المنصة)':'Referrer share (% of platform fee)'}</label>
                      <div class="flex items-center gap-3">
                        <input type="range" id="cfg_affiliate_pct" min="0" max="50" step="1"
                          value="${cfg.AFFILIATE_COMMISSION_PERCENT??20}" class="flex-1 accent-purple-500"
                          oninput="document.getElementById('cfg_affiliate_pct_val').textContent=this.value+'%'">
                        <span id="cfg_affiliate_pct_val" class="w-16 text-center font-black text-purple-700 text-lg bg-purple-50 rounded-xl py-2">${cfg.AFFILIATE_COMMISSION_PERCENT??20}%</span>
                      </div>
                    </div>
                  </div>
                  <button onclick="window._savePlatformSettings()" id="saveSettingsBtn" class="w-full py-4 bg-gradient-to-r from-navy-500 to-navy-700 text-white font-black text-lg rounded-2xl hover:from-navy-600 hover:to-navy-800 transition-all flex items-center justify-center gap-2">
                    <i class="fa-solid fa-floppy-disk"></i>${isAr?'حفظ الإعدادات':'Save Settings'}
                  </button>
                </div>`;

                // ── Commission type toggle helpers ──────────────────────────
                window._selectFeeType = function(type) {
                    ['percent','fixed','both'].forEach(v => {
                        const btn = document.getElementById('feeTypeBtn_'+v);
                        if (!btn) return;
                        if (v === type) { btn.className = btn.className.replace(/bg-gray-50 text-gray-600 border-gray-200 hover:border-navy-400/g,'').trim() + ' bg-navy-600 text-white border-navy-600'; }
                        else           { btn.className = btn.className.replace(/bg-navy-600 text-white border-navy-600/g,'').trim() + ' bg-gray-50 text-gray-600 border-gray-200 hover:border-navy-400'; }
                    });
                    document.getElementById('cfg_percent_row')?.classList.toggle('hidden', type==='fixed');
                    document.getElementById('cfg_fixed_row')?.classList.toggle('hidden', type==='percent');
                    window._updateFeePreview();
                };
                window._updateFeePreview = function() {
                    const type    = document.getElementById('feeTypeBtn_percent')?.classList.contains('bg-navy-600')?'percent':document.getElementById('feeTypeBtn_fixed')?.classList.contains('bg-navy-600')?'fixed':'both';
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
                            FEE_TYPE:        document.getElementById('feeTypeBtn_percent')?.classList.contains('bg-navy-600')?'percent':document.getElementById('feeTypeBtn_fixed')?.classList.contains('bg-navy-600')?'fixed':'both',
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
                            AFFILIATE_ENABLED: document.getElementById('cfg_affiliate_enabled')?.checked || false,
                            AFFILIATE_COMMISSION_PERCENT: parseFloat(document.getElementById('cfg_affiliate_pct')?.value) || 0,
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
              <div class="bg-gradient-to-br from-navy-600 to-navy-900 rounded-3xl p-7 text-white mb-8 relative overflow-hidden">
                <div class="absolute top-0 end-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/4 translate-x-1/4"></div>
                <div class="relative">
                  <p class="text-navy-200 text-sm mb-1">${isAr?'الرصيد المتاح':'Available Balance'}</p>
                  <p class="text-4xl font-black mb-6">${formatCurrency(wallet.balance||0)}</p>
                  <div class="flex gap-3 flex-wrap">
                    <button onclick="WalletManager.openWithdrawForm()" class="bg-white text-navy-700 font-black px-6 py-3 rounded-xl hover:bg-navy-50 transition text-sm flex items-center gap-2"><i class="fa-solid fa-money-bill-transfer"></i>${t('dash.withdraw')}</button>
                  </div>
                </div>
              </div>
              <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-8">
                <h3 class="font-black text-gray-900 mb-4">${isAr?'حركة المحفظة (آخر 6 شهور)':'Wallet Activity (last 6 months)'}</h3>
                <div style="height:180px"><canvas id="walletChart"></canvas></div>
              </div>
              <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-8" id="mySubscriptions"></div>
              <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-8" id="affiliateCard"></div>
              <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 class="font-black text-gray-900 mb-5">${isAr?'سجل المعاملات':'Transaction History'}</h3>
                <div id="walletTransactions"><div class="text-center py-6"><i class="fa-solid fa-spinner fa-spin text-navy-500 text-2xl"></i></div></div>
              </div>
            </div>`;
            this._loadTransactions();
            this._loadAffiliateCard();
            if (window.SubscriptionSystem) SubscriptionSystem.listMine();
        },

        // ── Affiliate referral card (only rendered if admin enabled the program) ──
        async _loadAffiliateCard() {
            const card = document.getElementById('affiliateCard');
            const user = AppState.currentUser;
            if (!card || !user) return;
            const isAr = AppState.language !== 'en';
            try {
                const settingsSnap = await window.db.collection('settings').doc('platform').get();
                const cfg = settingsSnap.exists ? settingsSnap.data() : {};
                if (!cfg.AFFILIATE_ENABLED) { card.remove(); return; }

                const link = `${window.location.origin}${window.location.pathname}?ref=${user.uid}`;
                const referredSnap = await window.db.collection(COLLECTIONS.USERS).where('referredBy','==',user.uid).get().catch(()=>({size:0}));

                card.innerHTML = `
                  <h3 class="font-black text-gray-900 mb-2 flex items-center gap-2"><i class="fa-solid fa-user-plus text-purple-500"></i>${isAr?'ادعُ أصحابك واكسب':'Invite friends & earn'}</h3>
                  <p class="text-xs text-gray-400 mb-4">${isAr?`هتاخد نسبة من عمولة المنصة لأول 5 مبيعات لكل شخص بيسجل من رابطك (${cfg.AFFILIATE_COMMISSION_PERCENT||0}% من عمولة المنصة على كل عملية)`:`You earn a share of the platform fee for the first 5 sales of each person who signs up via your link (${cfg.AFFILIATE_COMMISSION_PERCENT||0}% of the platform fee per order)`}</p>
                  <div class="flex gap-2 mb-3">
                    <input type="text" readonly value="${link}" id="affiliateLinkInput" class="form-input flex-1 text-xs" dir="ltr">
                    <button onclick="WalletManager.copyAffiliateLink()" class="btn-secondary px-4 text-sm whitespace-nowrap"><i class="fa-solid fa-copy"></i></button>
                  </div>
                  <p class="text-xs text-gray-500">${isAr?'عدد اللي سجلوا من رابطك':'People who signed up via your link'}: <span class="font-bold text-gray-800">${referredSnap.size||0}</span></p>
                `;
            } catch (e) { card.remove(); }
        },

        copyAffiliateLink() {
            const input = document.getElementById('affiliateLinkInput');
            if (!input) return;
            input.select();
            navigator.clipboard?.writeText(input.value).then(() => {
                showToast(AppState.language==='en' ? 'Link copied!' : 'تم نسخ الرابط!', 'success');
            }).catch(() => document.execCommand('copy'));
        },

        async _loadTransactions() {
            const user = AppState.currentUser, container = document.getElementById('walletTransactions');
            if (!container||!user) return;
            const isAr = AppState.language !== 'en';
            try {
                const snap = await window.db.collection(COLLECTIONS.TRANSACTIONS).where('userId','==',user.uid).orderBy('createdAt','desc').limit(20).get();

                // ⚠️ ADDED: wallet activity chart — grouped from the same 20
                // recent transactions already being fetched (no extra read).
                this._renderWalletChart(snap.docs.map(d => d.data()), isAr);

                if (snap.empty) { container.innerHTML = `<p class="text-gray-400 text-center py-6">${isAr?'لا توجد معاملات':'No transactions yet'}</p>`; return; }
                container.innerHTML = snap.docs.map(doc => {
                    const tx = doc.data(), isEarning = tx.type==='earning';
                    return `<div class="flex items-center gap-4 py-4 border-b border-gray-50 last:border-0">
                      <div class="w-10 h-10 ${isEarning?'bg-green-100':'bg-red-100'} rounded-xl flex items-center justify-center flex-shrink-0"><i class="fa-solid ${isEarning?'fa-arrow-down text-green-600':'fa-arrow-up text-red-500'}"></i></div>
                      <div class="flex-1 min-w-0"><p class="font-bold text-gray-900 text-sm">${escapeHtml(tx.description||(isEarning?(isAr?'أرباح':'Earning'):(isAr?'سحب':'Withdrawal')))}</p><p class="text-xs text-gray-400">${formatDateAr(tx.createdAt)}</p></div>
                      <div class="text-end"><p class="font-black ${isEarning?'text-green-600':'text-red-500'}">${isEarning?'+':'-'}${formatCurrency(tx.amount||0)}</p><p class="text-xs text-gray-400">${tx.status||'—'}</p></div>
                    </div>`;
                }).join('');
            } catch(e) {
                if (e.code==='failed-precondition') container.innerHTML = `<p class="text-gray-400 text-center py-4 text-sm">${isAr?'جاري تهيئة السجل...':'Setting up...'}</p>`;
                else container.innerHTML = `<p class="text-red-400 text-center py-4">${t('general.error')}</p>`;
            }
        },

        _renderWalletChart(txs, isAr) {
            const canvas = document.getElementById('walletChart');
            if (!canvas || !window.Chart) return;

            const months = {};
            txs.forEach(tx => {
                if (!tx.createdAt) return;
                const d = tx.createdAt.toDate ? tx.createdAt.toDate() : new Date(tx.createdAt);
                const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
                if (!months[key]) months[key] = { in: 0, out: 0 };
                if (tx.type === 'earning' || tx.type === 'refund') months[key].in += (tx.amount || 0);
                else months[key].out += (tx.amount || 0);
            });
            const sorted = Object.entries(months).sort((a,b) => a[0] > b[0] ? 1 : -1).slice(-6);

            if (window._walletChartInstance) window._walletChartInstance.destroy();
            if (sorted.length === 0) return;

            window._walletChartInstance = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: sorted.map(([m]) => m),
                    datasets: [
                        { label: isAr ? 'داخل' : 'In',  data: sorted.map(([,v]) => v.in),  backgroundColor: '#0D9488', borderRadius: 6 },
                        { label: isAr ? 'خارج' : 'Out', data: sorted.map(([,v]) => v.out), backgroundColor: '#0F172A', borderRadius: 6 },
                    ],
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom' } },
                    scales: { y: { beginAtZero: true, ticks: { callback: v => formatCurrency(v) } } },
                },
            });
        },

        async openWithdrawForm() {
            const isAr = AppState.language !== 'en', wallet = AppState.wallet||{}, balance = wallet.balance||0;
            if (balance < PLATFORM.MIN_WITHDRAWAL) { showToast(`${isAr?'الحد الأدنى':'Min'}: ${formatCurrency(PLATFORM.MIN_WITHDRAWAL)}`,'warning'); return; }
            // ⚠️ ADDED: pre-fill from the seller's saved payout details
            // (SellerDash.savePayoutInfo) instead of always starting blank.
            let savedMethod = 'bank', savedAccount = '';
            try {
                const profSnap = await window.db.collection(COLLECTIONS.USERS).doc(AppState.currentUser.uid).get();
                const prof = profSnap.data() || {};
                if (prof.payoutAccount) { savedMethod = prof.payoutMethod || 'bank'; savedAccount = prof.payoutAccount; }
            } catch (_) { /* non-critical — falls back to a blank form */ }
            document.getElementById('withdrawModal')?.remove();
            const modal = document.createElement('div');
            modal.id = 'withdrawModal';
            modal.className = 'fixed inset-0 bg-black/70 z-[99999] flex items-center justify-center p-4';
            modal.innerHTML = `
              <div class="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
                <h3 class="text-xl font-black text-gray-900 mb-6">${isAr?'طلب سحب':'Withdrawal Request'}</h3>
                ${PLATFORM.WITHDRAWAL_NOTE?`<div class="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-700">${PLATFORM.WITHDRAWAL_NOTE}</div>`:''}
                ${PLATFORM.PAYOUT_SCHEDULE_NOTE?`<div class="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-sm text-blue-700 flex items-start gap-2"><i class="fa-solid fa-calendar-days mt-0.5"></i><span>${escapeHtml(PLATFORM.PAYOUT_SCHEDULE_NOTE)}</span></div>`:''}
                <div class="space-y-4">
                  <div><label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'المبلغ (ج.م)':'Amount (EGP)'}</label>
                    <input type="number" id="withdrawAmount" class="form-input" min="${PLATFORM.MIN_WITHDRAWAL}" max="${Math.min(balance,PLATFORM.MAX_WITHDRAWAL)}" value="${balance}" placeholder="${PLATFORM.MIN_WITHDRAWAL}" oninput="WalletManager.updateWithdrawPreview()">
                    <p class="text-xs text-gray-400 mt-1">${isAr?'الرصيد':'Balance'}: ${formatCurrency(balance)} · ${isAr?'الحد الأقصى':'Max'}: ${formatCurrency(PLATFORM.MAX_WITHDRAWAL)}</p></div>
                  <!-- ⚠️ ADDED: net-amount preview — the seller sees exactly what
                       will arrive after the payout provider's transfer fee, before
                       they submit, instead of finding out later. -->
                  <div id="withdrawPreview" class="bg-gray-50 rounded-xl p-3 text-sm ${PLATFORM.WITHDRAWAL_FEE_PERCENT ? '' : 'hidden'}"></div>
                  <div><label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'طريقة الاستلام (داخل مصر فقط حاليًا)':'Payout Method (Egypt only for now)'}</label>
                    <select id="withdrawMethod" class="form-input"><option value="bank" ${savedMethod==='bank'?'selected':''}>${isAr?'تحويل بنكي':'Bank Transfer'}</option><option value="vodafone" ${savedMethod==='vodafone'?'selected':''}>${isAr?'فودافون كاش':'Vodafone Cash'}</option><option value="instapay" ${savedMethod==='instapay'?'selected':''}>InstaPay</option></select></div>
                  <div><label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'تفاصيل الحساب':'Account Details'}</label>
                    <input type="text" id="withdrawAccount" class="form-input" value="${escapeHtml(savedAccount)}" placeholder="${isAr?'رقم الحساب أو المحفظة':'Account or wallet number'}" dir="ltr"></div>
                </div>
                <div class="flex gap-3 mt-6">
                  <button onclick="document.getElementById('withdrawModal').remove()" class="btn-secondary flex-1 py-3">${t('general.cancel')}</button>
                  <button onclick="WalletManager.submitWithdrawal()" class="btn-primary flex-1 py-3">${isAr?'إرسال الطلب':'Submit'}</button>
                </div>
              </div>`;
            document.body.appendChild(modal);
            WalletManager.updateWithdrawPreview();
        },

        updateWithdrawPreview() {
            const isAr = AppState.language !== 'en';
            const el = document.getElementById('withdrawPreview');
            if (!el) return;
            const amt = parseFloat(document.getElementById('withdrawAmount')?.value) || 0;
            const feePercent = Number(PLATFORM.WITHDRAWAL_FEE_PERCENT) || 0;
            if (!feePercent || amt <= 0) { el.classList.add('hidden'); return; }
            const fee = Number((amt * feePercent / 100).toFixed(2));
            const net = Number((amt - fee).toFixed(2));
            el.classList.remove('hidden');
            el.innerHTML = `
              <div class="flex justify-between text-gray-500"><span>${isAr?'مبلغ السحب':'Withdrawal amount'}</span><span>${formatCurrency(amt)}</span></div>
              <div class="flex justify-between text-gray-500 mt-1"><span>${isAr?'عمولة التحويل':'Transfer fee'} (${feePercent}%)</span><span>-${formatCurrency(fee)}</span></div>
              <div class="flex justify-between font-black text-gray-900 mt-2 pt-2 border-t border-gray-200"><span>${isAr?'هيوصلك صافي':'You will receive'}</span><span>${formatCurrency(net)}</span></div>
            `;
        },

        async submitWithdrawal() {
            const amount = parseFloat(document.getElementById('withdrawAmount')?.value);
            const method = document.getElementById('withdrawMethod')?.value;
            const account = document.getElementById('withdrawAccount')?.value?.trim();
            const isAr = AppState.language !== 'en';
            if (!amount||amount<PLATFORM.MIN_WITHDRAWAL) { showToast(isAr?'المبلغ غير صالح':'Invalid amount','warning'); return; }
            if (!account) { showToast(isAr?'أدخل تفاصيل الحساب':'Enter account details','warning'); return; }
            showLoading();
            try {
                // Balance check + deduction happen server-side (atomic) — the
                // browser can no longer write to /wallets directly.
                const idToken = window.auth && window.auth.currentUser ? await window.auth.currentUser.getIdToken() : '';
                const resp = await fetch('/api/payment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
                    body: JSON.stringify({ action: 'requestWithdrawal', amount, method, accountInfo: sanitizeInput(account) }),
                });
                const data = await resp.json();
                if (!resp.ok || !data.success) throw new Error(data.error || (isAr?'تعذر إرسال الطلب':'Could not submit request'));
                if (AppState.wallet) AppState.wallet.balance = data.newBalance;
                document.getElementById('withdrawModal')?.remove();
                hideLoading();
                const netMsg = data.feeAmount > 0
                    ? (isAr ? `تم إرسال الطلب! هيوصلك صافي ${formatCurrency(data.netAmount)} بعد خصم عمولة التحويل` : `Request submitted! You'll receive ${formatCurrency(data.netAmount)} net after the transfer fee`)
                    : (isAr ? 'تم إرسال طلب السحب!' : 'Request submitted!');
                showToast(netMsg,'success',6000);
            } catch(e) { hideLoading(); showToast(e.message || t('general.error'),'error'); }
        },

        // ⚠️ CHANGED: this used to just flip a status flag with no real meaning
        // (no notification, no distinction from "still pending"). Now it's the
        // admin's actual confirmation that they've sent the money externally
        // (bank transfer / Vodafone Cash / InstaPay) — it closes the request out
        // as 'completed' and notifies the seller with the exact date & time so
        // they have a clear, timestamped record of when they got paid.
        async approveWithdrawal(reqId) {
            const isAr = AppState.language !== 'en';
            showLoading();
            try {
                const snap = await window.db.collection(COLLECTIONS.WITHDRAWALS).doc(reqId).get();
                const req  = snap.data();
                if (!req) throw new Error(isAr?'الطلب غير موجود':'Request not found');

                const paidAt = new Date();
                const dateStr = paidAt.toLocaleDateString(isAr?'ar-EG':'en-GB', { year:'numeric', month:'long', day:'numeric' });
                const timeStr = paidAt.toLocaleTimeString(isAr?'ar-EG':'en-GB', { hour:'2-digit', minute:'2-digit' });
                const paidAmount = req.feeAmount ? req.netAmount : req.amount;

                const batch = window.db.batch();
                batch.update(window.db.collection(COLLECTIONS.WITHDRAWALS).doc(reqId), { status:'completed', paidAt: serverTimestamp() });
                batch.set(window.db.collection(COLLECTIONS.NOTIFICATIONS).doc(), {
                    userId: req.userId, type: 'withdrawal_paid',
                    title: isAr ? '💸 تم تحويل أرباحك' : '💸 Your payout was sent',
                    message: isAr
                        ? `تم تحويل ${formatCurrency(paidAmount)} لحسابك يوم ${dateStr} الساعة ${timeStr}`
                        : `${formatCurrency(paidAmount)} was transferred to you on ${dateStr} at ${timeStr}`,
                    read: false, createdAt: serverTimestamp(),
                });
                await batch.commit();

                hideLoading(); showToast(isAr?'تم تسجيل الدفع وإشعار البائع':'Payment recorded and seller notified','success');
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
        // ⚠️ REDESIGNED (Super Admin visual language): dark hero header +
        // KPI cards + escrow compliance bar + pill-style tab nav, adapted
        // from the approved admin mockup into this SPA's existing chrome.
        // adminTab_* ids and the adminTab(...) onclick calls are unchanged
        // on purpose — every tab's content function (orders/disputes/users/
        // ...) keeps working exactly as before, only the shell around it
        // is restyled.
        container.innerHTML = `
        <div>
          <div class="bg-gradient-to-br from-navy-900 via-slate-900 to-navy-900 rounded-3xl p-6 sm:p-7 text-white shadow-xl mb-6 relative overflow-hidden">
            <div class="absolute -top-16 -left-16 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div class="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div class="flex flex-wrap items-center gap-3 mb-1.5">
                  <h1 class="text-2xl font-black flex items-center gap-2">👑 ${isAr?'لوحة الإدارة والتحكم الشاملة':'Super Admin Dashboard'}</h1>
                  <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>${isAr?'نظام الضمان Escrow نشط':'Escrow system active'}
                  </span>
                </div>
                <p class="text-slate-400 text-sm">${isAr?'تحكم كامل في الطلبات، النزاعات، المستخدمين والمحتوى':'Full control over orders, disputes, users and content'}</p>
              </div>
              <button onclick="AdminAI.generateOne()" id="admin-gen-btn"
                class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-white/10 hover:bg-white/15 border border-white/10 transition shrink-0">
                <i class="fa-solid fa-wand-magic-sparkles text-teal-300"></i><span>${isAr?'توليد مقال AI الآن':'Generate AI article'}</span>
              </button>
            </div>
          </div>

          <div id="adminStatsRow" class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
            ${[1,2,3,4,5].map(()=>`<div class="bg-white rounded-2xl p-5 border border-gray-100 animate-pulse"><div class="h-4 bg-gray-100 rounded mb-3 w-2/3"></div><div class="h-7 bg-gray-100 rounded mb-2 w-1/2"></div><div class="h-3 bg-gray-50 rounded w-3/4"></div></div>`).join('')}
          </div>

          <div id="adminEscrowBar" class="bg-gradient-to-r from-emerald-500/5 via-white to-teal-500/5 border border-emerald-200 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
            <div class="h-5 bg-gray-100 rounded w-2/3 animate-pulse"></div>
          </div>

          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <nav class="flex overflow-x-auto p-2 gap-1.5 border-b border-gray-100">
              <button onclick="adminTab('orders')"     class="tab-btn admin-pill-tab active" id="adminTab_orders"><i class="fa-solid fa-bag-shopping"></i>${isAr?'الطلبات':'Orders'}</button>
              <button onclick="adminTab('disputes')"   class="tab-btn admin-pill-tab" id="adminTab_disputes"><i class="fa-solid fa-flag text-red-500"></i>${isAr?'النزاعات':'Disputes'}</button>
              <button onclick="adminTab('users')"      class="tab-btn admin-pill-tab" id="adminTab_users"><i class="fa-solid fa-users"></i>${isAr?'المستخدمون':'Users'}</button>
              <button onclick="adminTab('services')"   class="tab-btn admin-pill-tab" id="adminTab_services"><i class="fa-solid fa-layer-group"></i>${isAr?'الخدمات والمنتجات':'Services'}</button>
              <button onclick="adminTab('withdraw')"   class="tab-btn admin-pill-tab" id="adminTab_withdraw"><i class="fa-solid fa-money-bill-transfer text-amber-500"></i>${isAr?'السحوبات':'Withdrawals'}</button>
              <button onclick="adminTab('coupons')"    class="tab-btn admin-pill-tab" id="adminTab_coupons"><i class="fa-solid fa-ticket"></i>${isAr?'الكوبونات':'Coupons'}</button>
              <button onclick="adminTab('categories')" class="tab-btn admin-pill-tab" id="adminTab_categories"><i class="fa-solid fa-tags"></i>${isAr?'الفئات':'Categories'}</button>
              <button onclick="adminTab('analytics')"  class="tab-btn admin-pill-tab" id="adminTab_analytics"><i class="fa-solid fa-chart-line"></i>${isAr?'التحليلات':'Analytics'}</button>
              <button onclick="adminTab('reviews')"    class="tab-btn admin-pill-tab" id="adminTab_reviews"><i class="fa-solid fa-star text-amber-400"></i>${isAr?'التقييمات':'Reviews'}</button>
              <button onclick="adminTab('reports')"    class="tab-btn admin-pill-tab" id="adminTab_reports"><i class="fa-solid fa-triangle-exclamation"></i>${isAr?'البلاغات':'Reports'}</button>
              <button onclick="adminTab('broadcast')"  class="tab-btn admin-pill-tab" id="adminTab_broadcast"><i class="fa-solid fa-paper-plane"></i>${isAr?'الإشعارات':'Broadcast'}</button>
              <button onclick="adminTab('payments')"   class="tab-btn admin-pill-tab" id="adminTab_payments"><i class="fa-solid fa-credit-card"></i>${isAr?'المدفوعات':'Payments'}</button>
              <button onclick="adminTab('settings')"   class="tab-btn admin-pill-tab" id="adminTab_settings"><i class="fa-solid fa-sliders"></i>${isAr?'الإعدادات':'Settings'}</button>
            </nav>
            <div class="p-5" id="adminTabContent"></div>
          </div>
        </div>`;
        DashboardManager._loadAdminStats();
        adminTab('orders');
    };

    console.log('✅ Dashboard v4.0 — Full Admin Control');
})();
