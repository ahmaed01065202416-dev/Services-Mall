/**
 * ============================================================================
 * PAYMENT-SYSTEM.JS — Mall Services Platform v5.0
 * Single gateway: Fawaterak (Card, Fawry, mobile wallets, Meeza — one checkout
 * page hosted by Fawaterak). All other gateways were removed on purpose.
 * ============================================================================
 */
(function () {
    'use strict';

    // ⚠️ Call the real Cloudflare Pages Function path directly — a previous
    // version of this file called a legacy redirect shim for POST requests
    // which Cloudflare doesn't reliably proxy. Never point this at anything
    // other than /api/payment.
    const PAY_ENDPOINT = '/api/payment';

    const PaymentState = {
        amount:          0,
        orderId:         null,
        existingOrderId: null,
        context:         null,
    };

    // ── Build {serviceId, quantity} list sent to the server ───────────────────
    // The server looks up the REAL price for each serviceId itself — nothing
    // here is trusted for billing, it's only used to render the page.
    function _buildItemsPayload(context) {
        const cart = context === 'service' ? [AppState.currentPaymentService] : (AppState.cart || []);
        return cart.filter(Boolean).map(item => ({ serviceId: item.id, quantity: item.quantity || 1 }));
    }

    // Either {items:[...]} for a normal cart/service checkout, or
    // {existingOrderId} when paying a request the seller already accepted.
    function _buildPaymentPayload(context) {
        if (context === 'order' && PaymentState.existingOrderId) {
            return { existingOrderId: PaymentState.existingOrderId };
        }
        return { items: _buildItemsPayload(context) };
    }

    // ── Open Payment Page ─────────────────────────────────────────────────────
    function openPaymentPage(context, serviceData, existingOrderId) {
        const user = AppState.currentUser;
        if (!user) { showToast(t('general.login_req'), 'warning'); navigateTo('login'); return; }
        if (context === 'cart' && (!AppState.cart || AppState.cart.length === 0)) {
            showToast(t('cart.empty'), 'warning'); return;
        }
        if (serviceData) AppState.currentPaymentService = serviceData;

        // NOTE: this total is an ESTIMATE for display only. The actual amount
        // charged is always recomputed by the server from the real service
        // prices in Firestore, so this number can never be tampered with to
        // pay less than the real price.
        const totals  = getCartTotals();
        const baseAmt = (context === 'service' || context === 'order') ? (parseFloat(serviceData && serviceData.price) || 0) : totals.subtotal;
        const fees    = calcPlatformFee(baseAmt);
        const total   = Number((baseAmt + fees).toFixed(2));

        PaymentState.amount          = total;
        PaymentState.context         = context;
        PaymentState.orderId         = null; // assigned by the server once payment starts
        PaymentState.existingOrderId = context === 'order' ? existingOrderId : null;

        _renderPaymentPage(baseAmt, fees, total, context);
        navigateTo('payment');
    }

    // ── Pay for a request the seller already accepted ─────────────────────────
    async function payForOrder(orderId) {
        const isAr = AppState.language !== 'en';
        const user = AppState.currentUser;
        if (!user) { showToast(t('general.login_req'), 'warning'); navigateTo('login'); return; }
        showLoading();
        try {
            const snap = await window.db.collection(COLLECTIONS.ORDERS).doc(orderId).get();
            hideLoading();
            if (!snap.exists) { showToast(t('general.error'), 'error'); return; }
            const order = snap.data();
            if (order.buyerId !== user.uid) { showToast(t('general.error'), 'error'); return; }
            if (order.status !== ORDER_STATUS.ACCEPTED) {
                showToast(isAr ? 'البائع لسه ما وافقش على الطلب ده' : 'The seller hasn\'t accepted this request yet', 'warning');
                return;
            }
            openPaymentPage('order', {
                id: order.serviceId, title: order.serviceTitle, image: order.image,
                price: order.price, sellerId: order.sellerId, sellerName: order.sellerName,
                deliveryDays: order.deliveryDays,
            }, orderId);
        } catch (err) { hideLoading(); showToast(t('general.error'), 'error'); }
    }

    // ── Render Payment Page ───────────────────────────────────────────────────
    function _renderPaymentPage(subtotal, fees, total, context) {
        const isAr  = AppState.language !== 'en';
        const items = context === 'service' ? [AppState.currentPaymentService] : (AppState.cart || []);
        const page  = document.getElementById('page-payment');
        if (!page) return;

        page.innerHTML = `
        <div class="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-8 px-4">
          <div class="max-w-5xl mx-auto">

            <!-- Header -->
            <div class="flex items-center gap-4 mb-8">
              <button onclick="navigateTo('${context === 'service' ? 'services' : 'cart'}')"
                class="w-10 h-10 bg-white rounded-xl shadow flex items-center justify-center text-gray-600 hover:bg-gray-50 transition">
                <i class="fa-solid fa-arrow-${isAr ? 'right' : 'left'}"></i>
              </button>
              <div>
                <h1 class="text-2xl font-black text-gray-900">${t('pay.title')}</h1>
                <p class="text-gray-500 text-sm flex items-center gap-2 mt-0.5">
                  <i class="fa-solid fa-lock text-green-500"></i>
                  ${isAr ? 'دفع آمن ومشفر 100٪ — مدعوم بفواتيرك' : 'Secure payment powered by Fawaterak'}
                </p>
              </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">

              <!-- Payment method -->
              <div class="lg:col-span-2 space-y-4">

                <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                  <h2 class="font-black text-gray-900 text-lg mb-5 flex items-center gap-2">
                    <i class="fa-solid fa-credit-card text-navy-600"></i>
                    ${isAr ? 'وسيلة الدفع' : 'Payment Method'}
                  </h2>

                  <!-- Fawaterak — the only checkout method (card, Fawry, mobile
                       wallets, Meeza — all on one hosted page) -->
                  <div class="w-full flex items-center gap-4 p-4 border-2 border-navy-500 bg-navy-50 rounded-2xl">
                    <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow">
                      <i class="fa-solid fa-file-invoice text-white text-xl"></i>
                    </div>
                    <div class="flex-1">
                      <p class="font-black text-gray-900">${isAr ? 'فواتيرك' : 'Fawaterak'}</p>
                      <p class="text-xs text-gray-500 mt-0.5">${isAr ? 'بطاقة، فوري، فودافون كاش، ميزة — من صفحة واحدة' : 'Card, Fawry, mobile wallets, Meeza — one checkout page'}</p>
                    </div>
                    <i class="fa-solid fa-circle-check text-navy-600 text-lg flex-shrink-0"></i>
                  </div>
                </div>

                <!-- Coupon -->
                <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <h3 class="font-bold text-gray-700 mb-3 flex items-center gap-2 text-sm">
                    <i class="fa-solid fa-tag text-orange-500"></i>
                    ${isAr ? 'كوبون خصم' : 'Discount Coupon'}
                  </h3>
                  <div class="flex gap-2">
                    <input type="text" id="couponInput" placeholder="${isAr ? 'أدخل كود الخصم' : 'Enter coupon code'}"
                      class="form-input flex-1" dir="ltr">
                    <button onclick="PaymentSystem.applyCoupon()" class="btn-secondary px-5 py-2 text-sm font-bold whitespace-nowrap">
                      ${isAr ? 'تطبيق' : 'Apply'}
                    </button>
                  </div>
                </div>

                <!-- Pay Button -->
                <button onclick="PaymentSystem.processPayment()" id="payNowBtn"
                  class="w-full py-5 bg-gradient-to-r from-navy-600 to-navy-800 text-white rounded-2xl font-black text-xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all flex items-center justify-center gap-3">
                  <i class="fa-solid fa-lock"></i>
                  <span id="pay-btn-label">${t('pay.pay_now')} — ${formatCurrency(total)}</span>
                </button>

                <!-- Trust badges -->
                <div class="bg-white rounded-2xl p-4 flex flex-wrap items-center justify-center gap-6 border border-gray-100">
                  <span class="text-xs text-gray-400 font-bold">Powered by</span>
                  <div class="flex items-center gap-1">
                    <div class="w-5 h-5 bg-navy-600 rounded flex items-center justify-center"><span class="text-white text-xs font-black">F</span></div>
                    <span class="text-xs font-black text-gray-700">Fawaterak</span>
                  </div>
                  <div class="flex items-center gap-2 text-xs text-gray-400">
                    <i class="fa-solid fa-shield-check text-green-500"></i> SSL 256-bit
                  </div>
                  <div class="flex items-center gap-2 text-xs text-gray-400">
                    <i class="fa-solid fa-lock text-navy-500"></i> Escrow
                  </div>
                  <div class="flex items-center gap-2 text-xs text-gray-400">
                    <i class="fa-solid fa-rotate-left text-orange-500"></i> ${isAr ? 'ضمان استرداد' : 'Money-Back'}
                  </div>
                </div>
              </div>

              <!-- Order Summary -->
              <div class="lg:col-span-1">
                <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 sticky top-6">
                  <h3 class="font-black text-gray-900 text-lg mb-5 flex items-center gap-2">
                    <i class="fa-solid fa-receipt text-navy-600"></i>
                    ${isAr ? 'ملخص الطلب' : 'Order Summary'}
                  </h3>
                  <div class="space-y-3 mb-5">
                    ${items.filter(Boolean).map(item => `
                      <div class="flex gap-3 items-start">
                        <img src="${item.image || ''}" alt="" onerror="this.style.display='none'"
                          class="w-14 h-14 rounded-xl object-cover flex-shrink-0 bg-gray-100">
                        <div class="flex-1 min-w-0">
                          <p class="font-bold text-gray-900 text-sm line-clamp-2">${escapeHtml(item.title || '')}</p>
                          <p class="text-navy-600 font-black">${formatCurrency(item.price || 0)}</p>
                        </div>
                      </div>`).join('')}
                  </div>
                  <div class="border-t border-gray-100 pt-4 space-y-2">
                    <div class="flex justify-between text-sm text-gray-600">
                      <span>${isAr ? 'المجموع الفرعي' : 'Subtotal'}</span>
                      <span>${formatCurrency(subtotal)}</span>
                    </div>
                    <div class="flex justify-between text-sm text-gray-600">
                      <span>${isAr ? 'رسوم المنصة' : 'Platform Fee'} (${PLATFORM.FEE_PERCENT}%)</span>
                      <span>${formatCurrency(fees)}</span>
                    </div>
                    <div class="flex justify-between font-black text-gray-900 text-xl border-t border-gray-100 pt-2 mt-2">
                      <span>${isAr ? 'الإجمالي' : 'Total'}</span>
                      <span class="text-navy-600" id="total-display">${formatCurrency(total)}</span>
                    </div>
                  </div>

                  <!-- Delivery time after payment -->
                  <div class="mt-5 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                    <p class="text-xs text-blue-700 font-bold flex items-center gap-2">
                      <i class="fa-solid fa-clock"></i>
                      ${isAr ? 'بعد الدفع' : 'After Payment'}
                    </p>
                    <p class="text-xs text-blue-600 mt-1">
                      ${isAr ? 'يمكنك إرسال تعليماتك وملفاتك للبائع مباشرة من مساحة العمل' : 'You can send your instructions & files to the seller from the workspace'}
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>`;
    }

    // ── Process Payment (Fawaterak is the only gateway) ──────────────────────
    async function processPayment() {
        if (!AppState.currentUser) { showToast(t('general.login_req'), 'warning'); navigateTo('login'); return; }
        try {
            await _payWithFawaterak();
        } catch(err) {
            console.error('[Payment] Error:', err);
            showToast(err.message || t('general.error'), 'error');
            hideLoading();
        }
    }

    // ── Fawaterak (hosted checkout link — supports card/Fawry/wallets) ────────
    async function _payWithFawaterak() {
        const isAr = AppState.language !== 'en';
        showLoading(isAr ? 'جاري إنشاء فاتورة الدفع...' : 'Creating your payment invoice...');
        try {
            const user    = AppState.currentUser;
            const idToken = window.auth && window.auth.currentUser ? await window.auth.currentUser.getIdToken() : '';
            const resp = await fetch(PAY_ENDPOINT, {
                method:  'POST',
                headers: { 'Content-Type':'application/json', 'Authorization': 'Bearer ' + idToken },
                body: JSON.stringify({
                    action: 'fawaterakPay',
                    ..._buildPaymentPayload(PaymentState.context),
                    customerData: { name: user.displayName || 'Buyer', email: user.email || '', phone: user.phoneNumber || '' },
                })
            });
            const data = await resp.json();
            hideLoading();
            if (!resp.ok || !data.redirectUrl) throw new Error(data.error || (isAr ? 'تعذر إنشاء الفاتورة' : 'Could not create invoice'));
            PaymentState.orderId = data.orderId;
            if (data.simulated) {
                clearCart();
                showToast(isAr ? '✅ تم الدفع بنجاح (وضع تجريبي)' : '✅ Payment successful (demo mode)', 'success');
                setTimeout(() => navigateTo('orders'), 1200);
                return;
            }
            // Fawaterak is a hosted checkout page (not an iframe) — redirect the
            // whole tab there; the buyer comes back via redirectionUrls after paying.
            window.location.href = data.redirectUrl;
        } catch(err) { hideLoading(); throw err; }
    }

    // ── Wait for server-side payment confirmation ─────────────────────────────
    // The order is created by our server ONLY after Fawaterak's webhook confirms
    // the transaction (functions/api/fawaterak-webhook.js). We just watch for it
    // to appear — the browser never creates it itself.
    function _waitForOrderConfirmation(merchantOrderId) {
        const isAr = AppState.language !== 'en';
        const user = AppState.currentUser;
        if (!merchantOrderId || !user) { navigateTo('orders'); return; }

        showLoading(isAr ? 'جاري تأكيد الدفع...' : 'Confirming your payment...');
        let done = false;
        const unsub = window.db.collection(COLLECTIONS.ORDERS)
            .where('buyerId', '==', user.uid)
            .where('merchantOrderId', '==', merchantOrderId)
            .onSnapshot(snap => {
                if (done || snap.empty) return;
                done = true;
                unsub();
                hideLoading();
                clearCart();
                showToast(isAr ? '✅ تم الدفع بنجاح! يمكنك الآن إرسال تعليماتك للبائع' : '✅ Payment successful! You can now send instructions to the seller', 'success');
                navigateTo('orders');
            }, () => {});

        setTimeout(() => {
            if (done) return;
            done = true;
            unsub();
            hideLoading();
            showToast(isAr
                ? 'تم الدفع وجاري تأكيده — لو الطلب مظهرش خلال دقيقة حدّث الصفحة أو تواصل معنا'
                : 'Payment received and confirming — refresh in a minute if the order doesn\'t appear, or contact us', 'info');
            navigateTo('orders');
        }, 25000);
    }

    // ── Apply Coupon ──────────────────────────────────────────────────────────
    async function applyCoupon() {
        const code = document.getElementById('couponInput') ? document.getElementById('couponInput').value.trim().toUpperCase() : '';
        if (!code) return;
        showLoading();
        try {
            const snap = await window.db.collection(COLLECTIONS.COUPONS)
                .where('code','==',code).where('active','==',true).get();
            hideLoading();
            if (snap.empty) { showToast(AppState.language === 'en' ? 'Invalid coupon' : 'كوبون غير صحيح', 'error'); return; }
            const coupon   = snap.docs[0].data();
            const discount = coupon.type === 'percent' ? PaymentState.amount * coupon.value / 100 : coupon.value;
            PaymentState.amount = Math.max(0, PaymentState.amount - discount);
            showToast((AppState.language === 'en' ? 'Saved ' : 'وفّرت ') + formatCurrency(discount), 'success');
            const td = document.getElementById('total-display');
            if (td) td.textContent = formatCurrency(PaymentState.amount);
            const lb = document.getElementById('pay-btn-label');
            if (lb) lb.textContent = t('pay.pay_now') + ' — ' + formatCurrency(PaymentState.amount);
        } catch(err) { hideLoading(); showToast(t('general.error'), 'error'); }
    }

    // ── Check redirect result (Fawaterak redirect back to the site) ──────────
    // ⚠️ This URL is fully attacker-controlled (?payment_success=true&order_id=X
    // can be typed by hand) — it is only ever used as a hint to start polling
    // for the server's real confirmation, never to create the order itself.
    function checkPaymentRedirect() {
        const params  = new URLSearchParams(window.location.search);
        const success = params.get('payment_success') || params.get('success');
        const orderId = params.get('order_id') || params.get('merchant_order_id');
        if (success !== null && orderId) {
            window.history.replaceState({}, '', window.location.pathname);
            if (success === 'true' || success === '1') {
                _waitForOrderConfirmation(orderId);
            } else {
                showToast(t('pay.failed'), 'error');
            }
        }
    }

    // ── Public API ────────────────────────────────────────────────────────────
    window.PaymentSystem   = { openPaymentPage, processPayment, applyCoupon, payForOrder, state: PaymentState };
    window.openPaymentModal = function(s) { openPaymentPage('service', s); };
    window.checkout         = function(s) { openPaymentPage(s ? 'service' : 'cart', s); };
    window.processPayment   = processPayment;

    document.addEventListener('DOMContentLoaded', checkPaymentRedirect);
    console.log('✅ PaymentSystem v5.0 — Fawaterak only');
})();
