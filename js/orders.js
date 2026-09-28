/**
 * ============================================================================
 * ORDERS.JS — Orders Management System v3.0
 * Load, render, filter orders for Buyer/Seller/Admin
 * ============================================================================
 */
(function () {
    'use strict';

    let _ordersListener   = null;
    let _currentFilter    = 'all';
    let _orders           = [];

    const OrdersManager = {

        get orders() { return _orders; },

        // ── Load Orders ───────────────────────────────────────────────────────
        loadOrders() {
            const user = AppState.currentUser;
            if (!user) return;

            if (_ordersListener) _ordersListener();

            const isAr    = AppState.language !== 'en';
            const isSeller = user.role === 'seller' || user.role === 'admin';

            // Build query — Buyer sees orders they purchased, Seller sees orders for their services
            let query = window.db.collection(COLLECTIONS.ORDERS);
            if (user.role === 'admin') {
                query = query.orderBy('createdAt', 'desc').limit(100);
            } else {
                const field = isSeller ? 'sellerId' : 'buyerId';
                query = query.where(field, '==', user.uid).orderBy('createdAt', 'desc').limit(50);
            }

            _ordersListener = query.onSnapshot(
                snap => {
                    _orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    AppState.orders = _orders;
                    this.renderOrders(_orders);
                    this._updateOrderCount(_orders.length);
                },
                err => {
                    if (err.code === 'failed-precondition') {
                        console.warn('[Orders] Missing Firestore index. Create it at:', err.message?.match(/https?:\/\/[^\s]+/)?.[0] || 'Firestore Console');
                        // Fallback without ordering
                        this._fallbackLoad(user, isSeller);
                    } else {
                        console.warn('[Orders] Listener error:', err.message);
                    }
                }
            );
        },

        async _fallbackLoad(user, isSeller) {
            try {
                const field = isSeller ? 'sellerId' : 'buyerId';
                const snap  = await window.db.collection(COLLECTIONS.ORDERS)
                    .where(field, '==', user.uid).limit(50).get();
                _orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                AppState.orders = _orders;
                this.renderOrders(_orders);
            } catch (err) {
                console.warn('[Orders] Fallback error:', err.message);
            }
        },

        // ── Render Orders ─────────────────────────────────────────────────────
        renderOrders(orders) {
            const container = document.getElementById('ordersList');
            const empty     = document.getElementById('ordersEmpty');
            if (!container) return;

            const isAr     = AppState.language !== 'en';
            const filtered = _currentFilter === 'all'
                ? orders
                : orders.filter(o => o.status === _currentFilter);

            if (filtered.length === 0) {
                container.innerHTML = '';
                if (empty) empty.classList.remove('hidden');
                return;
            }
            if (empty) empty.classList.add('hidden');

            container.innerHTML = filtered.map(order => this._orderCard(order, isAr)).join('');
        },

        _orderCard(order, isAr) {
            const isBuyer  = order.buyerId === AppState.currentUser?.uid;
            const role     = AppState.currentUser?.role;
            const isAdmin  = role === 'admin';

            return `
            <div class="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-lg transition-all duration-300 order-card" data-order="${order.id}">
              <div class="flex flex-wrap items-start gap-4">
                <!-- Image -->
                <img src="${order.image || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=120'}"
                  class="w-16 h-16 rounded-xl object-cover flex-shrink-0"
                  onerror="this.src='https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=120'">

                <!-- Info -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h3 class="font-black text-gray-900 text-lg truncate">${order.serviceTitle || '—'}</h3>
                      <p class="text-sm text-gray-500">#${order.id.substr(-8).toUpperCase()}</p>
                    </div>
                    <span class="status-badge ${getStatusClass(order.status)} flex-shrink-0">${getStatusText(order.status)}</span>
                  </div>

                  <div class="flex flex-wrap gap-4 mt-3 text-sm text-gray-500">
                    <span class="flex items-center gap-1">
                      <i class="fa-solid fa-calendar text-xs text-gray-400"></i>${formatDateAr(order.createdAt)}
                    </span>
                    <span class="flex items-center gap-1">
                      <i class="fa-solid fa-user text-xs text-gray-400"></i>
                      ${isBuyer ? (order.sellerName || '—') : (order.buyerName || '—')}
                    </span>
                    <span class="flex items-center gap-1 font-black text-brand-700">
                      <i class="fa-solid fa-coins text-xs"></i>${formatCurrency(order.price || 0)}
                    </span>
                    <span class="flex items-center gap-1">
                      <i class="fa-solid fa-credit-card text-xs text-gray-400"></i>
                      ${_payMethodLabel(order.paymentMethod)}
                    </span>
                  </div>

                  <!-- Escrow indicator -->
                  ${order.escrowHeld && order.status !== ORDER_STATUS.COMPLETED && order.status !== ORDER_STATUS.REFUNDED ? `
                  <div class="mt-2 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg w-fit">
                    <i class="fa-solid fa-shield-halved"></i>
                    <span>${isAr ? 'الدفع محجوز في الضمان' : 'Payment held in escrow'}</span>
                  </div>
                  ` : ''}
                </div>

                <!-- Actions -->
                <div class="flex flex-col gap-2 flex-shrink-0">
                  <button onclick="openWorkspace('${order.id}')"
                    class="btn-primary text-sm px-5 py-2.5 flex items-center gap-2">
                    <i class="fa-solid fa-briefcase"></i>
                    <span>${t('orders.workspace')}</span>
                  </button>

                  ${isBuyer && order.status === ORDER_STATUS.DELIVERED ? `
                  <button onclick="EscrowManager.confirmDelivery('${order.id}')"
                    class="text-sm px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition flex items-center gap-2">
                    <i class="fa-solid fa-check"></i>${t('escrow.confirm')}
                  </button>` : ''}

                  ${isAdmin ? `
                  <button onclick="OrdersManager.adminViewOrder('${order.id}')"
                    class="btn-secondary text-sm px-4 py-2">
                    ${isAr ? 'إدارة' : 'Manage'}
                  </button>` : ''}
                </div>
              </div>
            </div>`;
        },

        // ── Filter Orders ─────────────────────────────────────────────────────
        filterOrders(status) {
            _currentFilter = status;

            // Update filter buttons
            document.querySelectorAll('.order-filter-btn').forEach(btn => {
                const active = btn.dataset.status === status;
                btn.classList.toggle('bg-brand-600', active);
                btn.classList.toggle('text-white', active);
                btn.classList.toggle('bg-white', !active);
                btn.classList.toggle('text-gray-600', !active);
            });

            this.renderOrders(_orders);
        },

        // ── Create Order (called by payment system) ───────────────────────────
        async createOrder(item, paymentMethod, paymentId) {
            const user = AppState.currentUser;
            if (!user || !item) return null;

            const data = {
                serviceId:      item.id || '',
                serviceTitle:   item.title || '',
                image:          item.image || '',
                price:          item.price || 0,
                buyerId:        user.uid,
                buyerName:      user.displayName || user.email,
                buyerEmail:     user.email,
                sellerId:       item.sellerId || '',
                sellerName:     item.sellerName || '',
                status:         ORDER_STATUS.PAYMENT_HELD,
                paymentMethod:  paymentMethod || 'unknown',
                paymentId:      paymentId || '',
                escrowHeld:     true,
                escrowAmount:   item.price || 0,
                createdAt:      serverTimestamp(),
                updatedAt:      serverTimestamp(),
            };

            const ref = await window.db.collection(COLLECTIONS.ORDERS).add(data);
            return ref.id;
        },

        // ── Admin: View/Manage Order ──────────────────────────────────────────
        async adminViewOrder(orderId) {
            const snap  = await window.db.collection(COLLECTIONS.ORDERS).doc(orderId).get();
            const order = { id: snap.id, ...snap.data() };
            AppState.currentOrder = order;
            openWorkspace(orderId);
        },

        _updateOrderCount(count) {
            document.querySelectorAll('[data-orders-count]').forEach(el => {
                el.textContent = count;
            });
        },

        stopListeners() {
            if (_ordersListener) { _ordersListener(); _ordersListener = null; }
        }
    };

    // ── Render Orders Page ────────────────────────────────────────────────────
    function initOrdersPage() {
        const page = document.getElementById('page-orders');
        if (!page) return;

        const isAr = AppState.language !== 'en';

        const statuses = [
            { key: 'all',           label: isAr ? 'الكل'        : 'All'         },
            { key: 'payment_held',  label: isAr ? 'في الانتظار' : 'Pending'     },
            { key: 'in_progress',   label: isAr ? 'جاري'        : 'In Progress' },
            { key: 'delivered',     label: isAr ? 'مسلّم'       : 'Delivered'   },
            { key: 'completed',     label: isAr ? 'مكتمل'       : 'Completed'   },
            { key: 'disputed',      label: isAr ? 'نزاع'        : 'Disputed'    },
        ];

        page.innerHTML = `
        <div class="min-h-screen bg-gray-50">
          <!-- Header -->
          <div class="bg-white border-b border-gray-200 px-4 py-5">
            <div class="max-w-5xl mx-auto">
              <h1 class="text-2xl font-black text-gray-900 mb-4">${t('orders.title')}</h1>
              <!-- Filters -->
              <div class="flex gap-2 overflow-x-auto pb-1">
                ${statuses.map(s => `
                  <button onclick="OrdersManager.filterOrders('${s.key}')"
                    data-status="${s.key}"
                    class="order-filter-btn flex-shrink-0 px-4 py-2 rounded-xl text-sm font-bold border border-gray-200 transition ${s.key === 'all' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600'}">
                    ${s.label}
                  </button>`).join('')}
              </div>
            </div>
          </div>

          <!-- Content -->
          <div class="max-w-5xl mx-auto p-4">
            <div id="ordersList" class="space-y-4"></div>
            <div id="ordersEmpty" class="hidden text-center py-20">
              <div class="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <i class="fa-solid fa-bag-shopping text-gray-400 text-4xl"></i>
              </div>
              <h3 class="text-xl font-black text-gray-500 mb-2">${t('orders.empty')}</h3>
              <button onclick="navigateTo('services')" class="btn-primary mt-4 px-8">
                ${isAr ? 'استعرض الخدمات' : 'Browse Services'}
              </button>
            </div>
          </div>
        </div>`;

        OrdersManager.loadOrders();
    }

    // ── renderOrders global fallback ──────────────────────────────────────────
    function renderOrders() {
        OrdersManager.renderOrders(_orders);
    }

    // ── Payment method label helper ───────────────────────────────────────────
    function _payMethodLabel(method) {
        const map = {
            paymob_card: 'Paymob', fawry: 'Fawry',
            vodafone_cash: 'VF Cash', etisalat_cash: 'Etisalat Cash',
            orange_cash: 'Orange Cash', we_pay: 'WE Pay',
            payoneer: 'Payoneer', stripe: 'Stripe',
            wallet_balance: AppState.language === 'en' ? 'Wallet' : 'المحفظة',
            bank_transfer: AppState.language === 'en' ? 'Bank' : 'بنك',
        };
        return map[method] || method || '—';
    }

    // ── Expose ────────────────────────────────────────────────────────────────
    window.OrdersManager    = OrdersManager;
    window.renderOrders     = renderOrders;
    window.initOrdersPage   = initOrdersPage;

    console.log('✅ OrdersManager v3.0 loaded');
})();
