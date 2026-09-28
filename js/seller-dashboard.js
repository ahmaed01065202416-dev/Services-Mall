/**
 * ============================================================================
 * SELLER-DASHBOARD.JS — v1.0  لوحة تحكم البائع الاحترافية
 * ============================================================================
 * - My Services page with status, views, orders, pause/activate
 * - Full seller analytics dashboard with charts
 * - Activity feed
 * - Services persist in Firestore — never lost on logout/reload
 * ============================================================================
 */
(function () {
    'use strict';

    // ══════════════════════════════════════════════════════════════════════════
    // SellerDash — لوحة تحكم البائع الشاملة
    // ══════════════════════════════════════════════════════════════════════════
    const SellerDash = {

        // ── Main entry: render the full seller dashboard ──────────────────────
        async render(container) {
            if (!container) return;
            const user = AppState.currentUser;
            if (!user) { navigateTo('login'); return; }
            const isAr = AppState.language !== 'en';

            container.innerHTML = `
            <div class="space-y-6">
              <!-- Tabs -->
              <div class="flex gap-2 overflow-x-auto pb-1 border-b border-gray-100">
                <button onclick="SellerDash.tab('overview')" id="sdTab_overview"
                  class="sd-tab-btn active flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-bold whitespace-nowrap border-b-2 border-brand-600 text-brand-700 bg-brand-50 transition">
                  <i class="fa-solid fa-gauge"></i>${isAr ? 'نظرة عامة' : 'Overview'}
                </button>
                <button onclick="SellerDash.tab('my-services')" id="sdTab_my-services"
                  class="sd-tab-btn flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-bold whitespace-nowrap border-b-2 border-transparent text-gray-500 hover:text-brand-600 transition">
                  <i class="fa-solid fa-layer-group"></i>${isAr ? 'خدماتي' : 'My Services'}
                </button>
                <button onclick="SellerDash.tab('analytics')" id="sdTab_analytics"
                  class="sd-tab-btn flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-bold whitespace-nowrap border-b-2 border-transparent text-gray-500 hover:text-brand-600 transition">
                  <i class="fa-solid fa-chart-line"></i>${isAr ? 'الإحصائيات' : 'Analytics'}
                </button>
                <button onclick="SellerDash.tab('activity')" id="sdTab_activity"
                  class="sd-tab-btn flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-bold whitespace-nowrap border-b-2 border-transparent text-gray-500 hover:text-brand-600 transition">
                  <i class="fa-solid fa-bell"></i>${isAr ? 'النشاطات' : 'Activity'}
                </button>
              </div>
              <!-- Tab Content -->
              <div id="sdTabContent">
                <div class="text-center py-12"><i class="fa-solid fa-spinner fa-spin text-brand-500 text-2xl"></i></div>
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
                b.classList.toggle('border-brand-600', isActive);
                b.classList.toggle('text-brand-700', isActive);
                b.classList.toggle('bg-brand-50', isActive);
                b.classList.toggle('border-transparent', !isActive);
                b.classList.toggle('text-gray-500', !isActive);
                b.classList.remove('hover:text-brand-600');
            });

            const container = document.getElementById('sdTabContent');
            if (!container) return;
            container.innerHTML = `<div class="text-center py-12"><i class="fa-solid fa-spinner fa-spin text-brand-500 text-2xl"></i></div>`;

            if (name === 'overview')     await this.renderOverview(container);
            else if (name === 'my-services') await this.renderMyServices(container);
            else if (name === 'analytics')   await this.renderAnalytics(container);
            else if (name === 'activity')    await this.renderActivity(container);
        },

        // ══════════════════════════════════════════════════════════════════════
        // TAB: Overview — ملخص الأداء
        // ══════════════════════════════════════════════════════════════════════
        async renderOverview(container) {
            const user = AppState.currentUser;
            const isAr = AppState.language !== 'en';

            try {
                const [servicesSnap, ordersSnap, reviewsSnap] = await Promise.all([
                    window.db.collection(COLLECTIONS.SERVICES).where('sellerId','==',user.uid).get(),
                    window.db.collection(COLLECTIONS.ORDERS).where('sellerId','==',user.uid).get(),
                    window.db.collection(COLLECTIONS.REVIEWS).where('sellerId','==',user.uid).get(),
                ]);

                const services = servicesSnap.docs.map(d => ({id: d.id, ...d.data()}));
                const orders   = ordersSnap.docs.map(d => ({id: d.id, ...d.data()}));
                const reviews  = reviewsSnap.docs.map(d => d.data());

                const completedOrders = orders.filter(o => o.status === 'completed');
                const totalEarnings   = completedOrders.reduce((s, o) => s + (o.sellerEarning || o.price * 0.9 || 0), 0);
                const totalViews      = services.reduce((s, sv) => s + (sv.views || 0), 0);
                const avgRating       = reviews.length ? (reviews.reduce((s,r) => s+(r.rating||0),0)/reviews.length).toFixed(1) : '—';
                const buyerSet        = new Set(orders.map(o => o.buyerId));
                const convRate        = totalViews > 0 ? ((completedOrders.length / totalViews) * 100).toFixed(1) : '0.0';

                const recentOrders = [...orders].sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).slice(0,5);

                container.innerHTML = `
                <!-- Stats Grid -->
                <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                  ${this._statCard('fa-coins','from-amber-400 to-orange-500', isAr?'إجمالي الأرباح':'Total Earnings', formatCurrency(totalEarnings))}
                  ${this._statCard('fa-cart-shopping','from-brand-500 to-brand-700', isAr?'إجمالي الطلبات':'Total Orders', orders.length)}
                  ${this._statCard('fa-layer-group','from-teal-500 to-teal-700', isAr?'خدماتي':'My Services', services.length)}
                  ${this._statCard('fa-users','from-purple-500 to-purple-700', isAr?'العملاء':'Customers', buyerSet.size)}
                  ${this._statCard('fa-eye','from-pink-500 to-rose-600', isAr?'المشاهدات':'Views', totalViews)}
                  ${this._statCard('fa-percent','from-green-500 to-emerald-600', isAr?'معدل التحويل':'Conversion', convRate + '%')}
                </div>

                <!-- Quick Actions -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                  <button onclick="ServicesManager.openAddServiceForm()"
                    class="bg-brand-50 border-2 border-dashed border-brand-300 rounded-2xl p-4 text-center hover:border-brand-500 hover:bg-brand-100 transition">
                    <i class="fa-solid fa-plus-circle text-brand-600 text-2xl mb-2 block"></i>
                    <p class="text-sm font-bold text-brand-700">${isAr?'إضافة خدمة':'Add Service'}</p>
                  </button>
                  <button onclick="SellerDash.tab('my-services')"
                    class="bg-teal-50 border-2 border-dashed border-teal-300 rounded-2xl p-4 text-center hover:border-teal-500 hover:bg-teal-100 transition">
                    <i class="fa-solid fa-layer-group text-teal-600 text-2xl mb-2 block"></i>
                    <p class="text-sm font-bold text-teal-700">${isAr?'خدماتي':'My Services'}</p>
                  </button>
                  <button onclick="SellerDash.tab('analytics')"
                    class="bg-purple-50 border-2 border-dashed border-purple-300 rounded-2xl p-4 text-center hover:border-purple-500 hover:bg-purple-100 transition">
                    <i class="fa-solid fa-chart-line text-purple-600 text-2xl mb-2 block"></i>
                    <p class="text-sm font-bold text-purple-700">${isAr?'الإحصائيات':'Analytics'}</p>
                  </button>
                  <button onclick="navigateTo('orders')"
                    class="bg-amber-50 border-2 border-dashed border-amber-300 rounded-2xl p-4 text-center hover:border-amber-500 hover:bg-amber-100 transition">
                    <i class="fa-solid fa-inbox text-amber-600 text-2xl mb-2 block"></i>
                    <p class="text-sm font-bold text-amber-700">${isAr?'الطلبات الواردة':'Incoming Orders'}</p>
                  </button>
                </div>

                <!-- Recent Orders -->
                <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <div class="flex items-center justify-between mb-4">
                    <h3 class="font-black text-gray-900">${isAr?'آخر الطلبات':'Recent Orders'}</h3>
                    <button onclick="navigateTo('orders')" class="text-sm text-brand-600 font-bold hover:underline">${isAr?'عرض الكل':'View All'}</button>
                  </div>
                  ${recentOrders.length === 0
                    ? `<p class="text-gray-400 text-center py-6">${isAr?'لا توجد طلبات بعد':'No orders yet'}</p>`
                    : `<div class="space-y-2">${recentOrders.map(o => `
                    <div class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition" onclick="openWorkspace('${o.id}')">
                      <div class="flex-1 min-w-0">
                        <p class="font-bold text-gray-900 text-sm truncate">${o.serviceTitle||'—'}</p>
                        <p class="text-xs text-gray-400">${o.buyerName||'—'} · ${formatDateAr(o.createdAt)}</p>
                      </div>
                      <span class="font-black text-brand-700 text-sm">${formatCurrency(o.price||0)}</span>
                      <span class="status-badge ${getStatusClass(o.status)} text-xs">${getStatusText(o.status)}</span>
                    </div>`).join('')}</div>`
                  }
                </div>`;
            } catch(e) {
                container.innerHTML = `<p class="text-red-500 text-center py-8">${e.message}</p>`;
            }
        },

        _statCard(icon, gradient, label, value) {
            return `
            <div class="bg-gradient-to-br ${gradient} rounded-2xl p-5 text-white shadow-sm">
              <div class="flex items-center justify-between mb-3">
                <i class="fa-solid ${icon} text-white/80 text-xl"></i>
              </div>
              <p class="text-2xl font-black">${value}</p>
              <p class="text-white/80 text-xs mt-1">${label}</p>
            </div>`;
        },

        // ══════════════════════════════════════════════════════════════════════
        // TAB: My Services — خدماتي بالتفصيل
        // ══════════════════════════════════════════════════════════════════════
        async renderMyServices(container) {
            const user = AppState.currentUser;
            const isAr = AppState.language !== 'en';

            try {
                const snap = await window.db.collection(COLLECTIONS.SERVICES)
                    .where('sellerId', '==', user.uid)
                    .orderBy('createdAt', 'desc')
                    .get();

                const services = snap.docs.map(d => ({id: d.id, ...d.data()}));

                container.innerHTML = `
                <div class="flex items-center justify-between mb-6">
                  <h3 class="font-black text-gray-900 text-lg">${isAr ? `خدماتي (${services.length})` : `My Services (${services.length})`}</h3>
                  <button onclick="ServicesManager.openAddServiceForm()" class="btn-primary text-sm px-4 py-2.5 flex items-center gap-2">
                    <i class="fa-solid fa-plus"></i>${isAr ? 'إضافة خدمة' : 'Add Service'}
                  </button>
                </div>

                ${services.length === 0
                  ? `<div class="text-center py-16 bg-white rounded-2xl border border-gray-100">
                      <i class="fa-solid fa-layer-group text-gray-200 text-5xl mb-4"></i>
                      <h3 class="font-black text-gray-500 mb-2">${isAr ? 'لا توجد خدمات بعد' : 'No services yet'}</h3>
                      <p class="text-gray-400 text-sm mb-5">${isAr ? 'أضف خدمتك الأولى الآن' : 'Add your first service now'}</p>
                      <button onclick="ServicesManager.openAddServiceForm()" class="btn-primary px-8">
                        <i class="fa-solid fa-plus me-2"></i>${isAr ? 'إضافة خدمة' : 'Add Service'}
                      </button>
                    </div>`
                  : `<div class="space-y-4" id="myServicesList">${services.map(s => this._serviceRow(s, isAr)).join('')}</div>`
                }`;
            } catch(err) {
                if (err.code === 'failed-precondition') {
                    // Fallback without orderBy
                    try {
                        const snap2 = await window.db.collection(COLLECTIONS.SERVICES).where('sellerId','==',user.uid).get();
                        const services = snap2.docs.map(d => ({id: d.id, ...d.data()}));
                        container.innerHTML = `
                        <div class="flex items-center justify-between mb-6">
                          <h3 class="font-black text-gray-900 text-lg">${isAr ? `خدماتي (${services.length})` : `My Services (${services.length})`}</h3>
                          <button onclick="ServicesManager.openAddServiceForm()" class="btn-primary text-sm px-4 py-2.5 flex items-center gap-2">
                            <i class="fa-solid fa-plus"></i>${isAr ? 'إضافة خدمة' : 'Add Service'}
                          </button>
                        </div>
                        ${services.length === 0
                          ? `<div class="text-center py-16"><p class="text-gray-400">${isAr?'لا توجد خدمات':'No services'}</p></div>`
                          : `<div class="space-y-4" id="myServicesList">${services.map(s => this._serviceRow(s, isAr)).join('')}</div>`
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
                deliveryDays: s.deliveryDays||3, revisions: s.revisions||2, image: s.image||''
            }).replace(/"/g,'&quot;');
            const createdStr = s.createdAt ? (s.createdAt.toDate ? s.createdAt.toDate().toLocaleDateString('ar-EG') : new Date(s.createdAt.seconds*1000).toLocaleDateString('ar-EG')) : '—';

            return `
            <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition" data-service-id="${s.id}">
              <div class="flex gap-4">
                <!-- Image -->
                <img src="${s.image||'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=120'}"
                  class="w-20 h-20 rounded-xl object-cover flex-shrink-0"
                  onerror="this.src='https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=120'">
                <!-- Info -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-start justify-between gap-2 mb-2">
                    <h4 class="font-black text-gray-900 leading-snug">${s.title||'—'}</h4>
                    <span class="text-xs font-bold px-3 py-1 rounded-full flex-shrink-0 ${statusCls}">${statusLabel}</span>
                  </div>
                  <!-- Stats Row -->
                  <div class="flex flex-wrap gap-4 text-xs text-gray-500 mb-3">
                    <span><i class="fa-solid fa-tag text-brand-400 me-1"></i>${formatCurrency(s.price||0)}</span>
                    <span><i class="fa-solid fa-eye text-blue-400 me-1"></i>${s.views||0} ${isAr?'مشاهدة':'views'}</span>
                    <span><i class="fa-solid fa-cart-shopping text-green-400 me-1"></i>${s.ordersCount||s.orderCount||0} ${isAr?'طلب':'orders'}</span>
                    <span><i class="fa-solid fa-folder text-purple-400 me-1"></i>${s.category||'—'}</span>
                    <span><i class="fa-solid fa-calendar text-gray-400 me-1"></i>${createdStr}</span>
                  </div>
                  <!-- Action Buttons -->
                  <div class="flex flex-wrap gap-2">
                    <button onclick="ServicesManager._renderAddServiceForm(${editData});navigateTo('add-service')"
                      class="flex items-center gap-1.5 text-xs px-3 py-2 bg-brand-50 text-brand-700 rounded-xl font-bold hover:bg-brand-100 transition">
                      <i class="fa-solid fa-pen"></i>${isAr?'تعديل':'Edit'}
                    </button>
                    <button onclick="SellerDash.toggleServiceStatus('${s.id}', ${isPaused})"
                      class="flex items-center gap-1.5 text-xs px-3 py-2 ${isPaused ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'} rounded-xl font-bold transition">
                      <i class="fa-solid ${isPaused ? 'fa-play' : 'fa-pause'}"></i>
                      ${isPaused ? (isAr?'إعادة تفعيل':'Activate') : (isAr?'إيقاف مؤقت':'Pause')}
                    </button>
                    <button onclick="SellerDash.confirmDeleteService('${s.id}', '${(s.title||'').replace(/'/g,"\\'")}', '${s.sellerId||''}')"
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
                const newActive = currentlyPaused; // if paused → activate → active=true
                const newStatus = newActive ? 'active' : 'paused';
                await window.db.collection(COLLECTIONS.SERVICES).doc(serviceId).update({
                    active: newActive,
                    status: newStatus,
                    updatedAt: serverTimestamp()
                });
                hideLoading();
                showToast(newActive
                    ? (isAr ? '✅ تم تفعيل الخدمة' : '✅ Service activated')
                    : (isAr ? '⏸ تم إيقاف الخدمة مؤقتاً' : '⏸ Service paused'),
                    'success');
                await this.tab('my-services');
            } catch(e) {
                hideLoading();
                showToast(e.message, 'error');
            }
        },

        async confirmDeleteService(serviceId, serviceTitle, sellerId) {
            const isAr = AppState.language !== 'en';
            const user = AppState.currentUser;
            if (!user) return;

            // Security check
            if (sellerId && sellerId !== user.uid && user.role !== 'admin') {
                showToast(isAr ? 'غير مصرح لك بحذف هذه الخدمة' : 'Not authorized', 'error');
                return;
            }

            if (!confirm(isAr
                ? `هل تريد حذف خدمة "${serviceTitle}" نهائياً؟ لا يمكن التراجع.`
                : `Delete "${serviceTitle}" permanently? This cannot be undone.`)) return;

            showLoading(isAr ? 'جاري الحذف...' : 'Deleting...');
            try {
                await window.db.collection(COLLECTIONS.SERVICES).doc(serviceId).delete();
                hideLoading();
                showToast(isAr ? '✅ تم حذف الخدمة' : '✅ Service deleted', 'success');
                // Remove card from DOM immediately
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
        // TAB: Analytics — الإحصائيات والرسوم البيانية
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

                // Monthly earnings data (last 6 months)
                const monthlyData = this._buildMonthlyData(completed);
                // Top services by orders
                const topServices = [...services].sort((a,b) => (b.ordersCount||b.orderCount||0)-(a.ordersCount||a.orderCount||0)).slice(0,5);

                container.innerHTML = `
                <!-- Summary Cards -->
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
                    <i class="fa-solid fa-layer-group text-brand-500 text-2xl mb-2"></i>
                    <p class="text-xl font-black text-gray-900">${services.length}</p>
                    <p class="text-xs text-gray-400 mt-1">${isAr?'خدمات نشطة':'Active Services'}</p>
                  </div>
                </div>

                <!-- Monthly Chart -->
                <div class="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-6">
                  <h3 class="font-black text-gray-900 mb-5">${isAr?'الأرباح الشهرية (آخر 6 شهور)':'Monthly Earnings (Last 6 Months)'}</h3>
                  <div class="flex items-end gap-2 h-40">
                    ${this._renderBarChart(monthlyData, isAr)}
                  </div>
                </div>

                <!-- Top Services -->
                <div class="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-6">
                  <h3 class="font-black text-gray-900 mb-5">${isAr?'أكثر الخدمات مبيعاً':'Top Selling Services'}</h3>
                  ${topServices.length === 0
                    ? `<p class="text-gray-400 text-center py-6">${isAr?'لا توجد بيانات':'No data yet'}</p>`
                    : `<div class="space-y-3">${topServices.map((s,i) => `
                    <div class="flex items-center gap-3">
                      <span class="w-6 h-6 bg-brand-100 text-brand-700 rounded-full text-xs font-black flex items-center justify-center flex-shrink-0">${i+1}</span>
                      <div class="flex-1 min-w-0">
                        <p class="font-bold text-gray-900 text-sm truncate">${s.title||'—'}</p>
                        <div class="flex gap-2 text-xs text-gray-400 mt-0.5">
                          <span><i class="fa-solid fa-cart-shopping me-1 text-green-400"></i>${s.ordersCount||s.orderCount||0}</span>
                          <span><i class="fa-solid fa-eye me-1 text-blue-400"></i>${s.views||0}</span>
                        </div>
                      </div>
                      <span class="font-black text-brand-700 text-sm flex-shrink-0">${formatCurrency(s.price||0)}</span>
                    </div>`).join('')}</div>`
                  }
                </div>

                <!-- Order Status Distribution -->
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
                  <div class="w-full bg-brand-100 rounded-t-lg flex flex-col justify-end" style="height:120px">
                    <div class="bg-gradient-to-t from-brand-600 to-brand-400 rounded-t-lg transition-all duration-500"
                      style="height:${Math.max(pct,2)}%"></div>
                  </div>
                  <span class="text-xs text-gray-400">${d.label}</span>
                </div>`;
            }).join('');
        },

        _renderStatusBars(orders, isAr) {
            const statuses = {
                pending:    { label: isAr?'معلق':'Pending',     cls: 'bg-amber-400' },
                in_progress:{ label: isAr?'جاري':'In Progress', cls: 'bg-brand-500' },
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

        // ══════════════════════════════════════════════════════════════════════
        // TAB: Activity — سجل النشاطات
        // ══════════════════════════════════════════════════════════════════════
        async renderActivity(container) {
            const user = AppState.currentUser;
            const isAr = AppState.language !== 'en';

            try {
                const [ordersSnap, reviewsSnap, servicesSnap] = await Promise.all([
                    window.db.collection(COLLECTIONS.ORDERS)
                        .where('sellerId','==',user.uid)
                        .orderBy('createdAt','desc').limit(20).get(),
                    window.db.collection(COLLECTIONS.REVIEWS)
                        .where('sellerId','==',user.uid)
                        .orderBy('createdAt','desc').limit(10).get(),
                    window.db.collection(COLLECTIONS.SERVICES)
                        .where('sellerId','==',user.uid)
                        .orderBy('createdAt','desc').limit(10).get(),
                ]);

                const activities = [];

                ordersSnap.docs.forEach(d => {
                    const o = d.data();
                    activities.push({
                        type: 'order',
                        icon: 'fa-cart-shopping',
                        color: 'bg-brand-100 text-brand-600',
                        title: isAr ? `طلب جديد: ${o.serviceTitle||'—'}` : `New Order: ${o.serviceTitle||'—'}`,
                        sub: `${o.buyerName||'—'} · ${formatCurrency(o.price||0)}`,
                        time: o.createdAt,
                    });
                    if (o.status === 'completed') {
                        activities.push({
                            type: 'sale',
                            icon: 'fa-circle-check',
                            color: 'bg-green-100 text-green-600',
                            title: isAr ? `عملية بيع مكتملة: ${o.serviceTitle||'—'}` : `Sale Completed: ${o.serviceTitle||'—'}`,
                            sub: `+${formatCurrency(o.sellerEarning||o.price*0.9||0)}`,
                            time: o.updatedAt || o.createdAt,
                        });
                    }
                });

                reviewsSnap.docs.forEach(d => {
                    const r = d.data();
                    activities.push({
                        type: 'review',
                        icon: 'fa-star',
                        color: 'bg-yellow-100 text-yellow-600',
                        title: isAr ? `تقييم جديد — ${r.rating||0} ⭐` : `New Review — ${r.rating||0} ⭐`,
                        sub: r.text || '',
                        time: r.createdAt,
                    });
                });

                servicesSnap.docs.forEach(d => {
                    const s = d.data();
                    activities.push({
                        type: 'service',
                        icon: 'fa-layer-group',
                        color: 'bg-purple-100 text-purple-600',
                        title: isAr ? `خدمة جديدة: ${s.title||'—'}` : `New Service: ${s.title||'—'}`,
                        sub: formatCurrency(s.price||0),
                        time: s.createdAt,
                    });
                });

                // Sort by time desc
                activities.sort((a,b) => {
                    const ta = a.time?.seconds || 0;
                    const tb = b.time?.seconds || 0;
                    return tb - ta;
                });

                container.innerHTML = `
                <h3 class="font-black text-gray-900 text-lg mb-5">${isAr ? 'سجل النشاطات' : 'Activity Feed'}</h3>
                ${activities.length === 0
                  ? `<div class="text-center py-16 bg-white rounded-2xl border border-gray-100">
                      <i class="fa-solid fa-bell-slash text-gray-200 text-5xl mb-4"></i>
                      <p class="text-gray-400">${isAr?'لا توجد نشاطات بعد':'No activity yet'}</p>
                    </div>`
                  : `<div class="space-y-3">${activities.slice(0,25).map(a => `
                    <div class="flex items-start gap-3 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                      <div class="w-9 h-9 ${a.color} rounded-xl flex items-center justify-center flex-shrink-0">
                        <i class="fa-solid ${a.icon} text-sm"></i>
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="font-bold text-gray-900 text-sm">${a.title}</p>
                        ${a.sub ? `<p class="text-xs text-gray-500 truncate mt-0.5">${a.sub}</p>` : ''}
                      </div>
                      <span class="text-xs text-gray-400 flex-shrink-0">${formatTimeAgo(a.time)}</span>
                    </div>`).join('')}</div>`
                }`;
            } catch(err) {
                // Fallback without orderBy if index missing
                container.innerHTML = `
                <div class="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">
                  <i class="fa-solid fa-triangle-exclamation text-amber-500 text-2xl mb-2"></i>
                  <p class="text-amber-700 font-bold text-sm">${isAr?'يتطلب إنشاء فهرس Firestore':'Firestore index required'}</p>
                  <p class="text-amber-600 text-xs mt-1">${err.message}</p>
                </div>`;
            }
        },
    };

    // Expose globally
    window.SellerDash = SellerDash;
    console.log('✅ SellerDash v1.0 loaded');
})();
