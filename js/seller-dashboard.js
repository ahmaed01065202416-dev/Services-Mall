/**
 * ============================================================================
 * SELLER-DASHBOARD.JS — v2.0  لوحة تحكم البائع الاحترافية
 * ============================================================================
 * Redesigned to match the "Corporate Modern" seller-dashboard mockup:
 * escrow protection banner, 6 key metric cards, dark wallet card, weekly
 * performance chart, a seller-level progress badge, and dedicated tabs for
 * Services / Digital Products / Order Management / Analytics / Escrow Ledger.
 * All numbers are computed live from Firestore — nothing here is fake/sample
 * data, unlike the static mockup it was built from.
 * ============================================================================
 */
(function () {
    'use strict';

    const SellerDash = {

        // ── Main entry: render the full seller dashboard ──────────────────────
        async render(container) {
            if (!container) return;
            const user = AppState.currentUser;
            if (!user) { navigateTo('login'); return; }
            const isAr = AppState.language !== 'en';

            const tabs = [
                ['overview', 'fa-gauge-high', isAr ? 'نظرة عامة' : 'Overview'],
                ['services', 'fa-layer-group', isAr ? 'خدماتي' : 'My Services'],
                ['products', 'fa-box-open', isAr ? 'المنتجات الرقمية' : 'Digital Products'],
                ['orders', 'fa-cart-shopping', isAr ? 'إدارة الطلبات' : 'Order Management'],
                ['analytics', 'fa-chart-line', isAr ? 'الإحصائيات والتحليلات' : 'Analytics'],
                ['escrow', 'fa-shield-halved', isAr ? 'سجل الضمان' : 'Escrow Log'],
            ];

            container.innerHTML = `
            <div class="space-y-6">
              <!-- Tabs -->
              <div class="flex gap-2 overflow-x-auto pb-1 border-b border-gray-100">
                ${tabs.map(([key, icon, label]) => `
                <button onclick="SellerDash.tab('${key}')" id="sdTab_${key}"
                  class="sd-tab-btn ${key==='overview'?'active':''} flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-bold whitespace-nowrap border-b-2 transition ${key==='overview'?'border-navy-600 text-navy-700 bg-navy-50':'border-transparent text-gray-500 hover:text-navy-600'}">
                  <i class="fa-solid ${icon}"></i>${label}
                </button>`).join('')}
              </div>
              <!-- Tab Content -->
              <div id="sdTabContent">
                <div class="text-center py-12"><i class="fa-solid fa-spinner fa-spin text-navy-500 text-2xl"></i></div>
              </div>
            </div>`;

            // Load first tab
            await this.tab('overview');
        },

        // ── Tab Switcher ──────────────────────────────────────────────────────
        async tab(name) {
            document.querySelectorAll('.sd-tab-btn').forEach(b => {
                const isActive = b.id === `sdTab_${name}`;
                b.classList.toggle('active', isActive);
                b.classList.toggle('border-navy-600', isActive);
                b.classList.toggle('text-navy-700', isActive);
                b.classList.toggle('bg-navy-50', isActive);
                b.classList.toggle('border-transparent', !isActive);
                b.classList.toggle('text-gray-500', !isActive);
            });

            const container = document.getElementById('sdTabContent');
            if (!container) return;
            container.innerHTML = `<div class="text-center py-12"><i class="fa-solid fa-spinner fa-spin text-navy-500 text-2xl"></i></div>`;

            if (name === 'overview')       await this.renderOverview(container);
            else if (name === 'services')  await this.renderServices(container);
            else if (name === 'products')  await this.renderProducts(container);
            else if (name === 'orders')    await this.renderOrdersTab(container);
            else if (name === 'analytics') await this.renderAnalytics(container);
            else if (name === 'escrow')    await this.renderEscrowLedger(container);
            // Back-compat: some older links may still call 'my-services'/'activity'
            else if (name === 'my-services') await this.renderServices(container);
            else if (name === 'activity')    await this.renderOrdersTab(container);
        },

        // ══════════════════════════════════════════════════════════════════════
        // TAB: Overview — ملخص الأداء + خزينة الضمان + المحفظة
        // ══════════════════════════════════════════════════════════════════════
        async renderOverview(container) {
            const user = AppState.currentUser;
            const isAr = AppState.language !== 'en';

            try {
                const [servicesSnap, ordersSnap, reviewsSnap, walletDoc] = await Promise.all([
                    window.db.collection(COLLECTIONS.SERVICES).where('sellerId','==',user.uid).get(),
                    window.db.collection(COLLECTIONS.ORDERS).where('sellerId','==',user.uid).get(),
                    window.db.collection(COLLECTIONS.REVIEWS).where('sellerId','==',user.uid).get(),
                    window.db.collection(COLLECTIONS.WALLET).doc(user.uid).get().catch(()=>null),
                ]);

                const services = servicesSnap.docs.map(d => ({id: d.id, ...d.data()}));
                const orders   = ordersSnap.docs.map(d => ({id: d.id, ...d.data()}));
                const reviews  = reviewsSnap.docs.map(d => d.data());
                const wallet   = (walletDoc && walletDoc.exists) ? walletDoc.data() : { balance: 0 };

                const completedOrders = orders.filter(o => o.status === ORDER_STATUS.COMPLETED);
                const inEscrowOrders  = orders.filter(o => o.escrowHeld && ![ORDER_STATUS.COMPLETED, ORDER_STATUS.REFUNDED, ORDER_STATUS.CANCELLED].includes(o.status));
                const inProgressCount = orders.filter(o => [ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.PAYMENT_HELD, ORDER_STATUS.DELIVERED, ORDER_STATUS.REVISION].includes(o.status)).length;
                const awaitingPaymentCount = orders.filter(o => o.status === ORDER_STATUS.ACCEPTED).length;

                const totalEarnings   = completedOrders.reduce((s, o) => s + (o.sellerEarning || o.price * 0.9 || 0), 0);
                const inEscrowTotal   = inEscrowOrders.reduce((s, o) => s + (o.price || 0), 0);
                const availableBalance = wallet.balance || 0;
                const totalViews      = services.reduce((s, sv) => s + (sv.views || 0), 0);
                const avgRating       = reviews.length ? (reviews.reduce((s,r) => s+(r.rating||0),0)/reviews.length) : 0;
                const buyerSet        = new Set(orders.map(o => o.buyerId));

                const servicesCount = services.filter(s => s.listingType !== 'product').length;
                const productsCount = services.filter(s => s.listingType === 'product').length;

                const recentOrders = [...orders].sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).slice(0,4);

                container.innerHTML = `
                <!-- Escrow Protection Banner -->
                <div class="bg-gradient-to-r from-turquoise-50 via-white to-navy-50 border border-turquoise-200 rounded-2xl p-4 mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
                  <div class="flex items-center gap-4">
                    <div class="w-12 h-12 rounded-xl bg-turquoise-500 text-white flex items-center justify-center text-xl shadow-md shrink-0">
                      <i class="fa-solid fa-shield-check"></i>
                    </div>
                    <div>
                      <div class="flex items-center gap-2 flex-wrap">
                        <h3 class="font-bold text-gray-900 text-base">${isAr?'نظام الضمان المالي — Escrow':'Escrow Financial Protection'}</h3>
                        <span class="bg-turquoise-100 text-turquoise-700 text-[11px] font-extrabold px-2 py-0.5 rounded-full">${isAr?'محمي 100%':'100% protected'}</span>
                      </div>
                      <p class="text-xs text-gray-600 mt-0.5">
                        ${isAr
                          ? `جميع أموال طلباتك قيد التنفيذ (<strong class="text-gray-900">${formatCurrency(inEscrowTotal)}</strong>) محجوزة بأمان في خزينة الضمان، وتُحرر لرصيدك فور موافقة العميل على الاستلام.`
                          : `All funds for orders in progress (<strong class="text-gray-900">${formatCurrency(inEscrowTotal)}</strong>) are held safely in escrow, released to your wallet once the buyer confirms receipt.`}
                      </p>
                    </div>
                  </div>
                  <button onclick="SellerDash.tab('escrow')" class="px-3.5 py-1.5 bg-white border border-turquoise-300 text-turquoise-700 hover:bg-turquoise-50 rounded-xl text-xs font-bold transition shrink-0">
                    ${isAr?'سجل الضمان بالتفصيل':'View escrow log'}
                  </button>
                </div>

                <!-- 6 Key Metrics -->
                <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
                  ${this._metricCard('fa-coins','amber', isAr?'إجمالي الأرباح':'Total Earnings', formatCurrency(totalEarnings))}
                  ${this._metricCard('fa-lock','turquoise', isAr?'أموال في الضمان':'In Escrow', formatCurrency(inEscrowTotal))}
                  ${this._metricCard('fa-wallet','navy', isAr?'رصيد متاح للسحب':'Available Balance', formatCurrency(availableBalance))}
                  ${this._metricCard('fa-bag-shopping','slate', isAr?'إجمالي الطلبات':'Total Orders', orders.length)}
                  ${this._metricCard('fa-boxes-stacked','teal', isAr?'خدماتي والمنتجات':'Listings', services.length)}
                  ${this._metricCard('fa-star','purple', isAr?'التقييم والعملاء':'Rating', avgRating ? avgRating.toFixed(1) : '—')}
                </div>

                <!-- 2-Column Layout -->
                <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">

                  <!-- Right: Orders + Services/Products preview (8 cols) -->
                  <div class="lg:col-span-8 flex flex-col gap-6">

                    <!-- Recent Orders -->
                    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div class="p-5 border-b border-gray-100 flex items-center justify-between">
                        <div>
                          <h3 class="font-black text-gray-900">${isAr?'آخر الطلبات الواردة':'Recent Incoming Orders'}</h3>
                          <p class="text-xs text-gray-400 mt-0.5">${isAr?`${inProgressCount} قيد التنفيذ · ${awaitingPaymentCount} بانتظار الدفع`:`${inProgressCount} in progress · ${awaitingPaymentCount} awaiting payment`}</p>
                        </div>
                        <button onclick="SellerDash.tab('orders')" class="text-xs font-bold text-navy-600 hover:underline">${isAr?'عرض كل الطلبات':'View all orders'}</button>
                      </div>
                      ${recentOrders.length === 0
                        ? `<p class="text-gray-400 text-center py-10">${isAr?'لا توجد طلبات بعد':'No orders yet'}</p>`
                        : `<div class="divide-y divide-gray-50">${recentOrders.map(o => this._orderRowCompact(o, isAr)).join('')}</div>`
                      }
                    </div>

                    <!-- Services & Products preview -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div class="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                        <div class="flex items-center justify-between mb-4">
                          <h3 class="text-sm font-bold text-gray-900">${isAr?`خدماتي النشطة (${servicesCount})`:`My Services (${servicesCount})`}</h3>
                          <a href="javascript:void(0)" onclick="SellerDash.tab('services')" class="text-xs font-bold text-navy-600 hover:underline">${isAr?'إدارة الكل':'Manage all'}</a>
                        </div>
                        ${services.filter(s=>s.listingType!=='product').slice(0,2).map(s => `
                        <div class="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between mb-2">
                          <div class="min-w-0"><h5 class="text-xs font-bold text-gray-900 truncate">${escapeHtml(s.title||'—')}</h5>
                          <span class="text-[11px] text-gray-500">${formatCurrency(s.price||0)} · ${s.ordersCount||s.orderCount||0} ${isAr?'طلب':'orders'}</span></div>
                          <span class="w-2.5 h-2.5 rounded-full ${s.active===false?'bg-amber-400':'bg-green-500'} ring-4 ${s.active===false?'ring-amber-100':'ring-green-100'} shrink-0"></span>
                        </div>`).join('') || `<p class="text-xs text-gray-400 text-center py-4">${isAr?'لا توجد خدمات بعد':'No services yet'}</p>`}
                        <button onclick="ServicesManager.openAddServiceForm('service')" class="w-full mt-2 py-2 border-2 border-dashed border-gray-200 hover:border-navy-400 text-gray-600 hover:text-navy-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition">
                          <i class="fa-solid fa-plus text-[10px]"></i> ${isAr?'إنشاء خدمة جديدة':'Create new service'}
                        </button>
                      </div>
                      <div class="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                        <div class="flex items-center justify-between mb-4">
                          <h3 class="text-sm font-bold text-gray-900">${isAr?`منتجات رقمية جاهزة (${productsCount})`:`Digital Products (${productsCount})`}</h3>
                          <a href="javascript:void(0)" onclick="SellerDash.tab('products')" class="text-xs font-bold text-navy-600 hover:underline">${isAr?'إدارة الكل':'Manage all'}</a>
                        </div>
                        ${services.filter(s=>s.listingType==='product').slice(0,2).map(s => `
                        <div class="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between mb-2">
                          <div class="min-w-0"><h5 class="text-xs font-bold text-gray-900 truncate">${escapeHtml(s.title||'—')}</h5>
                          <span class="text-[11px] text-gray-500">${formatCurrency(s.price||0)} · ${s.ordersCount||s.orderCount||0} ${isAr?'شراء':'purchases'}</span></div>
                          <span class="text-[11px] font-bold ${s.active===false?'text-amber-600 bg-amber-50':'text-green-600 bg-green-50'} px-2 py-0.5 rounded shrink-0">${s.active===false?(isAr?'موقوف':'Paused'):(isAr?'نشط':'Active')}</span>
                        </div>`).join('') || `<p class="text-xs text-gray-400 text-center py-4">${isAr?'لا توجد منتجات بعد':'No products yet'}</p>`}
                        <button onclick="ServicesManager.openAddServiceForm('product')" class="w-full mt-2 py-2 border-2 border-dashed border-gray-200 hover:border-turquoise-400 text-gray-600 hover:text-turquoise-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition">
                          <i class="fa-solid fa-upload text-[10px]"></i> ${isAr?'رفع منتج رقمي جديد':'Upload new digital product'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- Left: Wallet + Chart + Tip + Level (4 cols) -->
                  <div class="lg:col-span-4 flex flex-col gap-6">
                    ${this._walletCard(availableBalance, inEscrowTotal, isAr)}
                    ${this._weeklyChartCard(completedOrders, isAr)}
                    ${this._sellerTipCard(services, isAr)}
                    ${this._levelCard(completedOrders.length, avgRating, isAr)}
                  </div>
                </div>`;
            } catch(e) {
                container.innerHTML = `<p class="text-red-500 text-center py-8">${e.message}</p>`;
            }
        },

        _metricCard(icon, color, label, value) {
            const bar = { amber:'from-amber-500 to-orange-500', turquoise:'bg-turquoise-500', navy:'bg-navy-700', slate:'bg-gray-800', teal:'bg-teal-500', purple:'bg-purple-600' }[color] || 'bg-navy-700';
            const iconBg = { amber:'bg-amber-50 text-amber-600', turquoise:'bg-turquoise-50 text-turquoise-600', navy:'bg-navy-50 text-navy-700', slate:'bg-gray-100 text-gray-800', teal:'bg-teal-50 text-teal-600', purple:'bg-purple-50 text-purple-600' }[color] || 'bg-navy-50 text-navy-700';
            const valueColor = { turquoise:'text-turquoise-600', navy:'text-navy-700', purple:'text-purple-600' }[color] || 'text-gray-900';
            return `
            <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm relative overflow-hidden">
              <div class="absolute top-0 right-0 left-0 h-1 ${bar.startsWith('bg-') ? bar : 'bg-gradient-to-r '+bar}"></div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-bold text-gray-500">${label}</span>
                <div class="w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center text-sm"><i class="fa-solid ${icon}"></i></div>
              </div>
              <div class="text-xl font-black ${valueColor} tracking-tight">${value}</div>
            </div>`;
        },

        _orderRowCompact(o, isAr) {
            return `
            <div class="p-4 hover:bg-gray-50 transition flex items-center justify-between gap-3 cursor-pointer" onclick="openWorkspace('${o.id}')">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap mb-1">
                  <span class="status-badge ${getStatusClass(o.status)} text-[11px]">${getStatusText(o.status)}</span>
                  ${o.escrowHeld && ![ORDER_STATUS.COMPLETED,ORDER_STATUS.REFUNDED].includes(o.status) ? `<span class="bg-turquoise-50 text-turquoise-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-turquoise-200"><i class="fa-solid fa-lock text-[9px]"></i> ${isAr?'الضمان مؤمن':'Escrow secured'}</span>` : ''}
                </div>
                <h4 class="text-sm font-bold text-gray-900 truncate">${escapeHtml(o.serviceTitle||'—')}</h4>
                <p class="text-xs text-gray-400 mt-0.5">${escapeHtml(o.buyerName||'—')} · ${formatDateAr(o.createdAt)}</p>
              </div>
              <span class="font-black text-gray-900 text-sm shrink-0">${formatCurrency(o.price||0)}</span>
            </div>`;
        },

        _walletCard(available, inEscrow, isAr) {
            return `
            <div class="bg-gradient-to-br from-navy-900 via-navy-800 to-navy-900 text-white rounded-2xl p-6 border border-navy-700 shadow-lg relative overflow-hidden">
              <div class="absolute -left-10 -bottom-10 w-40 h-40 bg-turquoise-500/10 rounded-full blur-2xl"></div>
              <div class="relative z-10">
                <div class="flex items-center gap-2 mb-4">
                  <div class="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-xs text-turquoise-400"><i class="fa-solid fa-building-columns"></i></div>
                  <span class="text-xs font-bold text-gray-300">${isAr?'محفظة البائع':'Seller Wallet'}</span>
                </div>
                <span class="text-xs text-gray-400">${isAr?'الرصيد المتاح للسحب':'Available balance'}</span>
                <div class="text-3xl font-black tracking-tight text-white mt-1">${formatCurrency(available)}</div>
                <div class="text-xs text-gray-400 mt-1">${isAr?`+ ${formatCurrency(inEscrow)} قيد الضمان`:`+ ${formatCurrency(inEscrow)} in escrow`}</div>
                <button onclick="WalletManager.openWithdrawForm()" class="w-full mt-4 py-2.5 bg-turquoise-500 hover:bg-turquoise-400 text-navy-950 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2">
                  <i class="fa-solid fa-arrow-up-right-from-square text-xs"></i> ${isAr?'طلب سحب أرباح':'Request withdrawal'}
                </button>
              </div>
            </div>`;
        },

        _weeklyChartCard(completedOrders, isAr) {
            const days = [];
            const now = new Date();
            const dayNames = isAr ? ['أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'] : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
            for (let i = 6; i >= 0; i--) {
                const d = new Date(now); d.setDate(now.getDate() - i); d.setHours(0,0,0,0);
                days.push({ label: dayNames[d.getDay()], date: d, total: 0 });
            }
            completedOrders.forEach(o => {
                if (!o.createdAt) return;
                const d = o.createdAt.toDate ? o.createdAt.toDate() : new Date((o.createdAt.seconds||0) * 1000);
                const day = days.find(dd => dd.date.toDateString() === d.toDateString());
                if (day) day.total += (o.sellerEarning || o.price * 0.9 || 0);
            });
            const max = Math.max(...days.map(d => d.total), 1);
            const weekTotal = days.reduce((s,d)=>s+d.total,0);
            return `
            <div class="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-sm font-bold text-gray-900">${isAr?'أداء آخر 7 أيام':'Last 7 days performance'}</h3>
                <span class="text-xs font-bold text-turquoise-700 bg-turquoise-50 px-2 py-0.5 rounded-full">${formatCurrency(weekTotal)}</span>
              </div>
              <div class="h-32 flex items-end justify-between gap-2 pt-4 px-1 pb-2 border-b border-gray-100">
                ${days.map(d => {
                  const pct = Math.round((d.total/max)*100);
                  const isToday = d.date.toDateString() === now.toDateString();
                  return `
                  <div class="flex-1 flex flex-col items-center gap-2">
                    <div class="w-full ${isToday?'bg-navy-700':'bg-gray-100'} rounded-t-md relative group" style="height:80px;display:flex;align-items:flex-end;">
                      <div class="w-full ${isToday?'bg-navy-700':'bg-gray-300'} rounded-t-md transition-all" style="height:${Math.max(pct,3)}%"></div>
                    </div>
                    <span class="text-[10px] ${isToday?'font-bold text-navy-700':'text-gray-400'}">${d.label}</span>
                  </div>`;
                }).join('')}
              </div>
            </div>`;
        },

        _sellerTipCard(services, isAr) {
            const active = services.filter(s => s.active !== false);
            const top = [...active].sort((a,b) => (b.views||0)-(a.views||0))[0];
            const tip = top
                ? (isAr
                    ? `خدمتك "<strong>${escapeHtml(top.title||'')}</strong>" هي الأكثر مشاهدة حاليًا. جرّب تحسّن صورة الغلاف أو تضيف باقة VIP ليها لزيادة معدل التحويل.`
                    : `Your service "<strong>${escapeHtml(top.title||'')}</strong>" is getting the most views right now. Try improving its cover image or adding a VIP tier to boost conversion.`)
                : (isAr
                    ? 'أضف صور واضحة ووصف تفصيلي لخدماتك — الخدمات اللي عندها صور احترافية بتحصل على طلبات أكتر بشكل ملحوظ.'
                    : 'Add clear photos and a detailed description to your listings — services with professional images consistently get more orders.');
            return `
            <div class="bg-gradient-to-br from-indigo-50/80 to-purple-50/80 rounded-2xl p-5 border border-indigo-100">
              <div class="flex items-center gap-2.5 mb-2.5">
                <div class="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs"><i class="fa-solid fa-lightbulb"></i></div>
                <h4 class="text-xs font-bold text-indigo-950">${isAr?'نصيحة لزيادة مبيعاتك':'Tip to boost your sales'}</h4>
              </div>
              <p class="text-xs text-indigo-900/80 leading-relaxed">${tip}</p>
            </div>`;
        },

        _levelCard(completedCount, avgRating, isAr) {
            const tiers = [
                { min:0,   label: isAr?'بائع جديد':'New Seller' },
                { min:10,  label: isAr?'بائع نشط':'Active Seller' },
                { min:50,  label: isAr?'بائع محترف':'Pro Seller' },
                { min:100, label: isAr?'بائع موثوق Top Rated':'Top Rated Seller' },
            ];
            let idx = 0;
            for (let i = 0; i < tiers.length; i++) if (completedCount >= tiers[i].min) idx = i;
            const current = tiers[idx];
            const next = tiers[idx+1];
            const pct = next ? Math.min(100, Math.round((completedCount - current.min) / (next.min - current.min) * 100)) : 100;
            return `
            <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <i class="fa-solid fa-award text-amber-500 text-base"></i>
                  <span class="text-xs font-bold text-gray-800">${isAr?'مستوى البائع:':'Seller level:'} ${current.label}</span>
                </div>
                <span class="text-xs font-bold text-navy-600">${pct}%</span>
              </div>
              <div class="w-full bg-gray-100 h-2 rounded-full overflow-hidden mb-2">
                <div class="bg-gradient-to-r from-amber-400 to-amber-500 h-full rounded-full transition-all" style="width:${pct}%"></div>
              </div>
              <span class="text-[11px] text-gray-500 block">
                ${next
                  ? (isAr ? `متبقي ${next.min - completedCount} طلب مكتمل للترقية إلى <strong>${next.label}</strong>` : `${next.min - completedCount} more completed orders to reach <strong>${next.label}</strong>`)
                  : (isAr ? 'وصلت لأعلى مستوى — استمر في الحفاظ على تقييمك!' : "You've reached the top level — keep it up!")}
              </span>
            </div>`;
        },

        // ══════════════════════════════════════════════════════════════════════
        // TAB: Services / Products (split by listingType, shared row renderer)
        // ══════════════════════════════════════════════════════════════════════
        async renderServices(container) { return this._renderListings(container, 'service'); },
        async renderProducts(container) { return this._renderListings(container, 'product'); },

        async _renderListings(container, kind) {
            const user = AppState.currentUser;
            const isAr = AppState.language !== 'en';
            const isProduct = kind === 'product';

            try {
                const snap = await window.db.collection(COLLECTIONS.SERVICES)
                    .where('sellerId', '==', user.uid)
                    .orderBy('createdAt', 'desc')
                    .get();

                const all = snap.docs.map(d => ({id: d.id, ...d.data()}));
                const services = all.filter(s => isProduct ? s.listingType === 'product' : s.listingType !== 'product');

                const addLabel = isProduct ? (isAr?'إضافة منتج':'Add Product') : (isAr?'إضافة خدمة':'Add Service');
                const heading  = isProduct ? (isAr?`المنتجات الرقمية (${services.length})`:`Digital Products (${services.length})`) : (isAr?`خدماتي (${services.length})`:`My Services (${services.length})`);

                container.innerHTML = `
                <div class="flex items-center justify-between mb-6">
                  <h3 class="font-black text-gray-900 text-lg">${heading}</h3>
                  <button onclick="ServicesManager.openAddServiceForm('${kind}')" class="btn-primary text-sm px-4 py-2.5 flex items-center gap-2">
                    <i class="fa-solid fa-plus"></i>${addLabel}
                  </button>
                </div>
                ${services.length === 0
                  ? `<div class="text-center py-16 bg-white rounded-2xl border border-gray-100">
                      <i class="fa-solid ${isProduct?'fa-box-open':'fa-layer-group'} text-gray-200 text-5xl mb-4"></i>
                      <h3 class="font-black text-gray-500 mb-2">${isProduct ? (isAr?'لا توجد منتجات بعد':'No products yet') : (isAr?'لا توجد خدمات بعد':'No services yet')}</h3>
                      <button onclick="ServicesManager.openAddServiceForm('${kind}')" class="btn-primary px-8"><i class="fa-solid fa-plus me-2"></i>${addLabel}</button>
                    </div>`
                  : `<div class="space-y-4" id="myServicesList">${services.map(s => this._serviceRow(s, isAr)).join('')}</div>`
                }`;
            } catch(err) {
                if (err.code === 'failed-precondition') {
                    try {
                        const snap2 = await window.db.collection(COLLECTIONS.SERVICES).where('sellerId','==',user.uid).get();
                        const services = snap2.docs.map(d => ({id: d.id, ...d.data()})).filter(s => isProduct ? s.listingType === 'product' : s.listingType !== 'product');
                        container.innerHTML = `
                        <div class="flex items-center justify-between mb-6">
                          <h3 class="font-black text-gray-900 text-lg">${services.length}</h3>
                          <button onclick="ServicesManager.openAddServiceForm('${kind}')" class="btn-primary text-sm px-4 py-2.5">${isAr?'إضافة':'Add'}</button>
                        </div>
                        ${services.length === 0
                          ? `<p class="text-center py-16 text-gray-400">${isAr?'لا توجد عناصر':'No items'}</p>`
                          : `<div class="space-y-4">${services.map(s => this._serviceRow(s, isAr)).join('')}</div>`
                        }`;
                    } catch(e2) { container.innerHTML = `<p class="text-red-500 text-center py-8">${e2.message}</p>`; }
                } else {
                    container.innerHTML = `<p class="text-red-500 text-center py-8">${err.message}</p>`;
                }
            }
        },

        _serviceRow(s, isAr) {
            const statusConfig = {
                active:   { label: isAr?'نشطة':'Active',   cls: 'bg-green-100 text-green-700' },
                paused:   { label: isAr?'معلقة':'Paused',   cls: 'bg-amber-100 text-amber-700' },
                pending:  { label: isAr?'قيد المراجعة':'Pending', cls: 'bg-blue-100 text-blue-700' },
                rejected: { label: isAr?'مرفوضة':'Rejected', cls: 'bg-red-100 text-red-700' },
            };
            const isPaused = s.status === 'paused' || s.active === false;
            const statusKey = s.status || (s.active === false ? 'paused' : 'active');
            const { label: statusLabel, cls: statusCls } = statusConfig[statusKey] || statusConfig.active;
            const editData = JSON.stringify({
                id: s.id, title: s.title||'', description: s.description||'',
                category: s.category||'', price: s.price||0,
                deliveryDays: s.deliveryDays||3, revisions: s.revisions||2, image: s.image||'',
                listingType: s.listingType||'service', orderMode: s.orderMode||'request_first',
                digitalDelivery: s.digitalDelivery||null, stockLimit: s.stockLimit ?? null, expiryDate: s.expiryDate||null,
            }).replace(/"/g,'&quot;');
            const createdStr = s.createdAt ? (s.createdAt.toDate ? s.createdAt.toDate().toLocaleDateString('ar-EG') : new Date(s.createdAt.seconds*1000).toLocaleDateString('ar-EG')) : '—';

            return `
            <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition" data-service-id="${s.id}">
              <div class="flex gap-4">
                <img src="${s.image||'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=120'}"
                  class="w-20 h-20 rounded-xl object-cover flex-shrink-0"
                  onerror="this.src='https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=120'">
                <div class="flex-1 min-w-0">
                  <div class="flex items-start justify-between gap-2 mb-2">
                    <h4 class="font-black text-gray-900 leading-snug">${escapeHtml(s.title||'—')}</h4>
                    <span class="text-xs font-bold px-3 py-1 rounded-full flex-shrink-0 ${statusCls}">${statusLabel}</span>
                  </div>
                  <div class="flex flex-wrap gap-4 text-xs text-gray-500 mb-3">
                    <span><i class="fa-solid fa-tag text-navy-400 me-1"></i>${formatCurrency(s.price||0)}</span>
                    <span><i class="fa-solid fa-eye text-blue-400 me-1"></i>${s.views||0} ${isAr?'مشاهدة':'views'}</span>
                    <span><i class="fa-solid fa-cart-shopping text-green-400 me-1"></i>${s.ordersCount||s.orderCount||0} ${isAr?'طلب':'orders'}</span>
                    <span><i class="fa-solid fa-folder text-purple-400 me-1"></i>${s.category||'—'}</span>
                    <span><i class="fa-solid fa-calendar text-gray-400 me-1"></i>${createdStr}</span>
                    ${s.listingType !== 'product' ? `<span><i class="fa-solid ${s.orderMode==='instant'?'fa-lock':'fa-paper-plane'} text-teal-500 me-1"></i>${s.orderMode==='instant'?(isAr?'دفع مباشر':'Instant pay'):(isAr?'طلب ثم موافقة':'Request first')}</span>` : ''}
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button onclick="ServicesManager._renderAddServiceForm(${editData});navigateTo('add-service')"
                      class="flex items-center gap-1.5 text-xs px-3 py-2 bg-navy-50 text-navy-700 rounded-xl font-bold hover:bg-navy-100 transition">
                      <i class="fa-solid fa-pen"></i>${isAr?'تعديل':'Edit'}
                    </button>
                    <button onclick="SellerDash.toggleServiceStatus('${s.id}', ${isPaused})"
                      class="flex items-center gap-1.5 text-xs px-3 py-2 ${isPaused ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'} rounded-xl font-bold transition">
                      <i class="fa-solid ${isPaused ? 'fa-play' : 'fa-pause'}"></i>
                      ${isPaused ? (isAr?'إعادة تفعيل':'Activate') : (isAr?'إيقاف مؤقت':'Pause')}
                    </button>
                    <button onclick="SellerDash.confirmDeleteService('${s.id}', '${escapeHtml((s.title||'').replace(/'/g,"\\'"))}', '${s.sellerId||''}')"
                      class="flex items-center gap-1.5 text-xs px-3 py-2 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition">
                      <i class="fa-solid fa-trash"></i>${isAr?'حذف':'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            </div>`;
        },

        async toggleServiceStatus(serviceId, currentlyPaused) {
            const isAr = AppState.language !== 'en';
            const user = AppState.currentUser;
            if (!user) return;
            try {
                showLoading();
                const newActive = currentlyPaused;
                const newStatus = newActive ? 'active' : 'paused';
                await window.db.collection(COLLECTIONS.SERVICES).doc(serviceId).update({
                    active: newActive, status: newStatus, updatedAt: serverTimestamp()
                });
                hideLoading();
                showToast(newActive ? (isAr?'✅ تم تفعيل الخدمة':'✅ Service activated') : (isAr?'⏸ تم إيقاف الخدمة مؤقتاً':'⏸ Service paused'), 'success');
                const activeTab = document.querySelector('.sd-tab-btn.active');
                await this.tab(activeTab && activeTab.id === 'sdTab_products' ? 'products' : 'services');
            } catch(e) {
                hideLoading();
                showToast(e.message, 'error');
            }
        },

        async confirmDeleteService(serviceId, serviceTitle, sellerId) {
            const isAr = AppState.language !== 'en';
            const user = AppState.currentUser;
            if (!user) return;
            if (sellerId && sellerId !== user.uid && user.role !== 'admin') {
                showToast(isAr ? 'غير مصرح لك بحذف هذه الخدمة' : 'Not authorized', 'error');
                return;
            }
            if (!confirm(isAr ? `هل تريد حذف خدمة "${serviceTitle}" نهائياً؟ لا يمكن التراجع.` : `Delete "${serviceTitle}" permanently? This cannot be undone.`)) return;

            showLoading(isAr ? 'جاري الحذف...' : 'Deleting...');
            try {
                await window.db.collection(COLLECTIONS.SERVICES).doc(serviceId).delete();
                hideLoading();
                showToast(isAr ? '✅ تم حذف الخدمة' : '✅ Service deleted', 'success');
                const card = document.querySelector(`[data-service-id="${serviceId}"]`);
                if (card) {
                    card.style.transition = 'opacity .25s, transform .25s';
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.95)';
                    setTimeout(() => card.remove(), 250);
                }
            } catch(e) {
                hideLoading();
                showToast((isAr ? 'خطأ: ' : 'Error: ') + e.message, 'error');
            }
        },

        // ══════════════════════════════════════════════════════════════════════
        // TAB: Order Management — كل طلبات البائع مع فلاتر وإجراءات سريعة
        // ══════════════════════════════════════════════════════════════════════
        async renderOrdersTab(container, filter) {
            const user = AppState.currentUser;
            const isAr = AppState.language !== 'en';
            filter = filter || this._ordersFilter || 'all';
            this._ordersFilter = filter;

            try {
                const snap = await window.db.collection(COLLECTIONS.ORDERS).where('sellerId','==',user.uid).get();
                let orders = snap.docs.map(d => ({id: d.id, ...d.data()}));
                orders.sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));

                const groups = {
                    all: orders,
                    in_progress: orders.filter(o => [ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.PAYMENT_HELD, ORDER_STATUS.DELIVERED, ORDER_STATUS.REVISION].includes(o.status)),
                    awaiting_payment: orders.filter(o => o.status === ORDER_STATUS.ACCEPTED),
                    completed: orders.filter(o => o.status === ORDER_STATUS.COMPLETED),
                };
                const shown = groups[filter] || groups.all;

                const filters = [
                    ['all', isAr?'الكل':'All'],
                    ['in_progress', isAr?`قيد التنفيذ (${groups.in_progress.length})`:`In progress (${groups.in_progress.length})`],
                    ['awaiting_payment', isAr?`بانتظار الدفع (${groups.awaiting_payment.length})`:`Awaiting payment (${groups.awaiting_payment.length})`],
                    ['completed', isAr?`مكتملة (${groups.completed.length})`:`Completed (${groups.completed.length})`],
                ];

                container.innerHTML = `
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                  <h3 class="font-black text-gray-900 text-lg">${isAr?`إدارة الطلبات (${orders.length})`:`Order Management (${orders.length})`}</h3>
                  <div class="flex items-center gap-1.5 bg-gray-100/80 p-1 rounded-xl text-xs font-semibold overflow-x-auto">
                    ${filters.map(([key,label]) => `<button onclick="SellerDash.renderOrdersTab(document.getElementById('sdTabContent'),'${key}')" class="px-3 py-1.5 rounded-lg whitespace-nowrap transition ${filter===key?'bg-white text-gray-900 font-bold shadow-xs':'text-gray-600 hover:text-gray-900'}">${label}</button>`).join('')}
                  </div>
                </div>
                ${shown.length === 0
                  ? `<div class="text-center py-16 bg-white rounded-2xl border border-gray-100"><i class="fa-solid fa-inbox text-gray-200 text-5xl mb-4"></i><p class="text-gray-400">${isAr?'لا توجد طلبات في هذا التصنيف':'No orders in this category'}</p></div>`
                  : `<div class="space-y-4">${shown.map(o => this._orderCard(o, isAr)).join('')}</div>`
                }`;
            } catch(err) {
                container.innerHTML = `<p class="text-red-500 text-center py-8">${err.message}</p>`;
            }
        },

        _orderCard(o, isAr) {
            const price = o.price || 0;
            let actionsHtml = '';
            if (o.status === ORDER_STATUS.ACCEPTED) {
                actionsHtml = `<button onclick="SellerDash.sendPaymentReminder('${o.id}')" class="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition">${isAr?'إرسال تذكير بالدفع':'Send payment reminder'}</button>`;
            } else if ([ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.PAYMENT_HELD, ORDER_STATUS.REVISION].includes(o.status)) {
                actionsHtml = `
                  <a href="javascript:void(0)" onclick="openWorkspace('${o.id}')" class="px-3 py-1.5 bg-navy-50 text-navy-700 hover:bg-navy-100 rounded-lg text-xs font-bold flex items-center gap-1.5 transition"><i class="fa-regular fa-message text-xs"></i>${isAr?'المحادثة':'Chat'}</a>
                  <button onclick="openWorkspace('${o.id}')" class="px-3 py-1.5 bg-turquoise-600 hover:bg-turquoise-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition"><i class="fa-solid fa-cloud-arrow-up text-xs"></i>${isAr?'تسليم العمل':'Deliver work'}</button>`;
            } else if (o.status === ORDER_STATUS.DELIVERED) {
                actionsHtml = `<a href="javascript:void(0)" onclick="openWorkspace('${o.id}')" class="px-3 py-1.5 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition"><i class="fa-regular fa-message text-xs"></i>${isAr?'بانتظار رد العميل':'Awaiting buyer'}</a>`;
            } else {
                actionsHtml = `<button onclick="openWorkspace('${o.id}')" class="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition">${isAr?'عرض تفاصيل الطلب':'View order details'}</button>`;
            }
            return `
            <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div class="flex items-start gap-4 min-w-0">
                <div class="w-12 h-12 rounded-xl bg-navy-50 border border-navy-100 text-navy-600 flex items-center justify-center text-xl shrink-0"><i class="fa-solid fa-briefcase"></i></div>
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2 mb-1">
                    <span class="text-xs font-mono font-bold text-gray-400">#${o.id.replace('ord_','').slice(0,8)}</span>
                    <span class="status-badge ${getStatusClass(o.status)} text-[11px]">${getStatusText(o.status)}</span>
                    ${o.escrowHeld && ![ORDER_STATUS.COMPLETED,ORDER_STATUS.REFUNDED].includes(o.status) ? `<span class="bg-turquoise-50 text-turquoise-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-turquoise-200"><i class="fa-solid fa-lock text-[9px]"></i> ${isAr?'الضمان مؤمن':'Escrow secured'}</span>` : ''}
                  </div>
                  <h4 class="text-sm font-bold text-gray-900 truncate">${escapeHtml(o.serviceTitle||'—')}</h4>
                  <p class="text-xs text-gray-500 mt-1">${isAr?'العميل:':'Buyer:'} <strong class="text-gray-700">${escapeHtml(o.buyerName||'—')}</strong> · ${formatDateAr(o.createdAt)}</p>
                </div>
              </div>
              <div class="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                <div class="text-right"><div class="text-base font-black text-gray-900">${formatCurrency(price)}</div></div>
                <div class="flex items-center gap-2 flex-wrap justify-end">${actionsHtml}</div>
              </div>
            </div>`;
        },

        // Sends a real notification + chat nudge to the buyer for orders stuck
        // at ACCEPTED (seller approved, waiting on payment).
        async sendPaymentReminder(orderId) {
            const isAr = AppState.language !== 'en';
            const user = AppState.currentUser;
            if (!user) return;
            try {
                showLoading();
                const snap = await window.db.collection(COLLECTIONS.ORDERS).doc(orderId).get();
                const order = snap.exists ? snap.data() : null;
                if (!order || !order.buyerId) { hideLoading(); showToast(isAr?'تعذر العثور على الطلب':'Order not found','error'); return; }

                await window.db.collection(COLLECTIONS.NOTIFICATIONS).add({
                    userId: order.buyerId,
                    type: 'payment_reminder',
                    title: isAr ? '⏰ تذكير بالدفع' : '⏰ Payment reminder',
                    message: isAr ? `متبقي بس الدفع عشان تبدأ تنفيذ "${order.serviceTitle||''}"` : `Payment is all that's left to start "${order.serviceTitle||''}"`,
                    orderId, read: false, createdAt: serverTimestamp(),
                });
                try {
                    if (window.rtdb) {
                        await window.rtdb.ref(`chats/${orderId}/messages`).push({
                            senderId: user.uid, senderName: user.displayName || 'Seller', type: 'text',
                            text: isAr ? '⏰ تذكير ودّي: طلبك جاهز للبدء، محتاج بس تأكيد الدفع.' : '⏰ Friendly reminder: your order is ready to start, just needs payment confirmation.',
                            createdAt: firebase.database.ServerValue.TIMESTAMP,
                        });
                    }
                } catch(_) {}
                hideLoading();
                showToast(isAr ? '✅ تم إرسال التذكير للعميل' : '✅ Reminder sent to buyer', 'success');
            } catch(e) {
                hideLoading();
                showToast(e.message, 'error');
            }
        },

        // ══════════════════════════════════════════════════════════════════════
        // TAB: Escrow Ledger — سجل حركات الضمان لكل طلب
        // ══════════════════════════════════════════════════════════════════════
        async renderEscrowLedger(container) {
            const user = AppState.currentUser;
            const isAr = AppState.language !== 'en';
            try {
                const snap = await window.db.collection(COLLECTIONS.ESCROW).where('sellerId','==',user.uid).get();
                let rows = snap.docs.map(d => ({id: d.id, ...d.data()}));
                rows.sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));

                const statusCfg = {
                    held:     { label: isAr?'محجوزة':'Held',     cls: 'bg-turquoise-50 text-turquoise-700 border-turquoise-200' },
                    released: { label: isAr?'محرّرة':'Released', cls: 'bg-green-50 text-green-700 border-green-200' },
                    frozen:   { label: isAr?'مجمّدة (نزاع)':'Frozen (dispute)', cls: 'bg-red-50 text-red-700 border-red-200' },
                    refunded: { label: isAr?'مستردة للمشتري':'Refunded to buyer', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
                };

                const totalHeld = rows.filter(r=>r.status==='held').reduce((s,r)=>s+(r.amount||0),0);
                const totalReleased = rows.filter(r=>r.status==='released').reduce((s,r)=>s+(r.amount||0),0);

                container.innerHTML = `
                <div class="grid grid-cols-2 gap-4 mb-6">
                  <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm text-center">
                    <i class="fa-solid fa-lock text-turquoise-500 text-xl mb-2"></i>
                    <p class="text-xl font-black text-gray-900">${formatCurrency(totalHeld)}</p>
                    <p class="text-xs text-gray-400 mt-1">${isAr?'محجوز حاليًا':'Currently held'}</p>
                  </div>
                  <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm text-center">
                    <i class="fa-solid fa-circle-check text-green-500 text-xl mb-2"></i>
                    <p class="text-xl font-black text-gray-900">${formatCurrency(totalReleased)}</p>
                    <p class="text-xs text-gray-400 mt-1">${isAr?'تم تحريره لك':'Released to you'}</p>
                  </div>
                </div>
                <h3 class="font-black text-gray-900 text-lg mb-4">${isAr?'سجل حركات الضمان':'Escrow transaction log'}</h3>
                ${rows.length === 0
                  ? `<div class="text-center py-16 bg-white rounded-2xl border border-gray-100"><i class="fa-solid fa-shield-halved text-gray-200 text-5xl mb-4"></i><p class="text-gray-400">${isAr?'لا توجد حركات ضمان بعد':'No escrow activity yet'}</p></div>`
                  : `<div class="space-y-3">${rows.map(r => {
                      const cfg = statusCfg[r.status] || statusCfg.held;
                      return `
                      <div class="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center justify-between gap-3 cursor-pointer hover:shadow-md transition" onclick="openWorkspace('${r.orderId||r.id}')">
                        <div class="flex items-center gap-3 min-w-0">
                          <div class="w-10 h-10 rounded-xl ${cfg.cls} border flex items-center justify-center shrink-0"><i class="fa-solid fa-shield-halved text-sm"></i></div>
                          <div class="min-w-0">
                            <p class="text-xs font-mono font-bold text-gray-400">#${(r.orderId||r.id).replace('ord_','').slice(0,8)}</p>
                            <span class="text-[11px] font-bold px-2 py-0.5 rounded-full border ${cfg.cls}">${cfg.label}</span>
                          </div>
                        </div>
                        <div class="text-right shrink-0">
                          <div class="font-black text-gray-900 text-sm">${formatCurrency(r.amount||0)}</div>
                          <div class="text-[11px] text-gray-400">${formatDateAr(r.createdAt)}</div>
                        </div>
                      </div>`;
                    }).join('')}</div>`
                }`;
            } catch(err) {
                container.innerHTML = `<div class="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">
                  <i class="fa-solid fa-triangle-exclamation text-amber-500 text-2xl mb-2"></i>
                  <p class="text-amber-700 font-bold text-sm">${isAr?'تعذر تحميل سجل الضمان':'Could not load escrow log'}</p>
                  <p class="text-amber-600 text-xs mt-1">${err.message}</p>
                </div>`;
            }
        },

        // ══════════════════════════════════════════════════════════════════════
        // TAB: Analytics — الإحصائيات والرسوم البيانية (unchanged from v1.0)
        // ══════════════════════════════════════════════════════════════════════
        async renderAnalytics(container) {
            const user = AppState.currentUser;
            const isAr = AppState.language !== 'en';

            try {
                const [servicesSnap, ordersSnap, reviewsSnap] = await Promise.all([
                    window.db.collection(COLLECTIONS.SERVICES).where('sellerId','==',user.uid).get(),
                    window.db.collection(COLLECTIONS.ORDERS).where('sellerId','==',user.uid).get(),
                    window.db.collection(COLLECTIONS.REVIEWS).where('sellerId','==',user.uid).get(),
                ]);

                const services = servicesSnap.docs.map(d => ({id:d.id,...d.data()}));
                const orders   = ordersSnap.docs.map(d => ({id:d.id,...d.data()}));
                const reviews  = reviewsSnap.docs.map(d => d.data());

                const completed = orders.filter(o => o.status === 'completed');
                const totalEarnings = completed.reduce((s,o) => s + (o.sellerEarning || o.price * 0.9 || 0), 0);
                const avgRating = reviews.length ? (reviews.reduce((s,r) => s+(r.rating||0),0)/reviews.length) : 0;

                const monthlyData = this._buildMonthlyData(completed);
                const topServices = [...services].sort((a,b) => (b.ordersCount||b.orderCount||0)-(a.ordersCount||a.orderCount||0)).slice(0,5);

                container.innerHTML = `
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm text-center">
                    <i class="fa-solid fa-coins text-amber-500 text-2xl mb-2"></i>
                    <p class="text-xl font-black text-gray-900">${formatCurrency(totalEarnings)}</p>
                    <p class="text-xs text-gray-400 mt-1">${isAr?'إجمالي الأرباح':'Total Earnings'}</p>
                  </div>
                  <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm text-center">
                    <i class="fa-solid fa-check-circle text-green-500 text-2xl mb-2"></i>
                    <p class="text-xl font-black text-gray-900">${completed.length}</p>
                    <p class="text-xs text-gray-400 mt-1">${isAr?'طلبات مكتملة':'Completed Orders'}</p>
                  </div>
                  <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm text-center">
                    <i class="fa-solid fa-star text-yellow-400 text-2xl mb-2"></i>
                    <p class="text-xl font-black text-gray-900">${avgRating ? avgRating.toFixed(1) : '—'}</p>
                    <p class="text-xs text-gray-400 mt-1">${isAr?'متوسط التقييم':'Avg Rating'}</p>
                  </div>
                  <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm text-center">
                    <i class="fa-solid fa-layer-group text-navy-500 text-2xl mb-2"></i>
                    <p class="text-xl font-black text-gray-900">${services.length}</p>
                    <p class="text-xs text-gray-400 mt-1">${isAr?'خدمات نشطة':'Active Services'}</p>
                  </div>
                </div>

                <div class="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-6">
                  <h3 class="font-black text-gray-900 mb-5">${isAr?'الأرباح الشهرية (آخر 6 شهور)':'Monthly Earnings (Last 6 Months)'}</h3>
                  <div class="flex items-end gap-2 h-40">${this._renderBarChart(monthlyData, isAr)}</div>
                </div>

                <div class="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-6">
                  <h3 class="font-black text-gray-900 mb-5">${isAr?'أكثر الخدمات مبيعاً':'Top Selling Services'}</h3>
                  ${topServices.length === 0
                    ? `<p class="text-gray-400 text-center py-6">${isAr?'لا توجد بيانات':'No data yet'}</p>`
                    : `<div class="space-y-3">${topServices.map((s,i) => `
                    <div class="flex items-center gap-3">
                      <span class="w-6 h-6 bg-navy-100 text-navy-700 rounded-full text-xs font-black flex items-center justify-center flex-shrink-0">${i+1}</span>
                      <div class="flex-1 min-w-0">
                        <p class="font-bold text-gray-900 text-sm truncate">${escapeHtml(s.title||'—')}</p>
                        <div class="flex gap-2 text-xs text-gray-400 mt-0.5">
                          <span><i class="fa-solid fa-cart-shopping me-1 text-green-400"></i>${s.ordersCount||s.orderCount||0}</span>
                          <span><i class="fa-solid fa-eye me-1 text-blue-400"></i>${s.views||0}</span>
                        </div>
                      </div>
                      <span class="font-black text-navy-700 text-sm flex-shrink-0">${formatCurrency(s.price||0)}</span>
                    </div>`).join('')}</div>`
                  }
                </div>

                <div class="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                  <h3 class="font-black text-gray-900 mb-5">${isAr?'توزيع حالات الطلبات':'Orders by Status'}</h3>
                  ${this._renderStatusBars(orders, isAr)}
                </div>`;
            } catch(e) {
                container.innerHTML = `<p class="text-red-500 text-center py-8">${e.message}</p>`;
            }
        },

        _buildMonthlyData(completedOrders) {
            const months = [];
            const now = new Date();
            for (let i = 5; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                months.push({ label: d.toLocaleDateString('ar-EG', {month:'short'}), year: d.getFullYear(), month: d.getMonth(), total: 0 });
            }
            completedOrders.forEach(o => {
                if (!o.createdAt) return;
                const d = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt.seconds * 1000);
                const m = months.find(mo => mo.year === d.getFullYear() && mo.month === d.getMonth());
                if (m) m.total += (o.sellerEarning || o.price * 0.9 || 0);
            });
            return months;
        },

        _renderBarChart(data, isAr) {
            const max = Math.max(...data.map(d => d.total), 1);
            return data.map(d => {
                const pct = Math.round((d.total / max) * 100);
                return `
                <div class="flex-1 flex flex-col items-center gap-1">
                  <span class="text-xs font-bold text-gray-500" style="font-size:10px">${d.total > 0 ? Math.round(d.total/1000)+'k' : ''}</span>
                  <div class="w-full bg-navy-100 rounded-t-lg flex flex-col justify-end" style="height:120px">
                    <div class="bg-gradient-to-t from-navy-600 to-navy-400 rounded-t-lg transition-all duration-500"
                      style="height:${Math.max(pct,2)}%"></div>
                  </div>
                  <span class="text-xs text-gray-400">${d.label}</span>
                </div>`;
            }).join('');
        },

        _renderStatusBars(orders, isAr) {
            const statuses = {
                pending:    { label: isAr?'معلق':'Pending',     cls: 'bg-amber-400' },
                in_progress:{ label: isAr?'جاري':'In Progress', cls: 'bg-navy-500' },
                completed:  { label: isAr?'مكتمل':'Completed',  cls: 'bg-green-500' },
                cancelled:  { label: isAr?'ملغي':'Cancelled',   cls: 'bg-red-400' },
            };
            const total = orders.length || 1;
            return `<div class="space-y-3">${Object.entries(statuses).map(([key, cfg]) => {
                const count = orders.filter(o => o.status === key).length;
                const pct   = Math.round((count/total)*100);
                return `
                <div>
                  <div class="flex items-center justify-between text-xs mb-1">
                    <span class="font-bold text-gray-700">${cfg.label}</span>
                    <span class="text-gray-400">${count} (${pct}%)</span>
                  </div>
                  <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div class="${cfg.cls} h-full rounded-full transition-all duration-500" style="width:${pct}%"></div>
                  </div>
                </div>`;
            }).join('')}</div>`;
        },
    };

    // Expose globally
    window.SellerDash = SellerDash;
    console.log('✅ SellerDash v2.0 loaded');
})();
