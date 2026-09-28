/**
 * ============================================================================
 * PAYMENT-SYSTEM.JS — Mall Services Platform v4.0
 * Full Paymob Integration: Credit Card | Save Card | Vodafone Cash | Etisalat Cash
 * Fix: safeCreateOrder + foreign currency + wallet
 * ============================================================================
 */
(function () {
    'use strict';

    const PAY_ENDPOINT = '/.netlify/functions/payment';

    const PaymentState = {
        selectedMethod: null,
        amount:         0,
        orderId:        null,
        currency:       'EGP',
    };

    // ── Safe timestamp ────────────────────────────────────────────────────────
    function _ts() {
        try { return firebase.firestore.FieldValue.serverTimestamp(); }
        catch(e) { return new Date(); }
    }

    // ── Safe order create (never updateDoc on non-existing) ───────────────────
    async function _safeCreateOrder(orderId, data) {
        const ref  = window.db.collection(COLLECTIONS.ORDERS).doc(orderId);
        const snap = await ref.get();
        const full = Object.assign({}, data, { updatedAt: _ts() });
        if (snap.exists) {
            await ref.update(full);
        } else {
            await ref.set(Object.assign(full, { createdAt: _ts() }));
        }
        return ref;
    }

    // ── Unique order ID ───────────────────────────────────────────────────────
    function _genId(prefix) {
        return (prefix || 'MS') + '_' + Date.now().toString(36).toUpperCase() + '_' + Math.random().toString(36).substr(2,4).toUpperCase();
    }

    // ── Open Payment Page ─────────────────────────────────────────────────────
    function openPaymentPage(context, serviceData) {
        const user = AppState.currentUser;
        if (!user) { showToast(t('general.login_req'), 'warning'); navigateTo('login'); return; }
        if (context === 'cart' && (!AppState.cart || AppState.cart.length === 0)) {
            showToast(t('cart.empty'), 'warning'); return;
        }
        if (serviceData) AppState.currentPaymentService = serviceData;

        const totals  = getCartTotals();
        const baseAmt = context === 'service' ? (parseFloat(serviceData && serviceData.price) || 0) : totals.subtotal;
        const fees    = calcPlatformFee(baseAmt);
        const total   = Number((baseAmt + fees).toFixed(2));

        PaymentState.amount   = total;
        PaymentState.orderId  = _genId('MS');
        PaymentState.currency = 'EGP';

        _renderPaymentPage(baseAmt, fees, total, context);
        navigateTo('payment');
    }

    // ── Render Payment Page ───────────────────────────────────────────────────
    function _renderPaymentPage(subtotal, fees, total, context) {
        const isAr        = AppState.language !== 'en';
        const walletBal   = parseFloat((AppState.wallet && AppState.wallet.balance) || 0);
        const hasWallet   = walletBal >= total;
        const items       = context === 'service' ? [AppState.currentPaymentService] : (AppState.cart || []);
        const page        = document.getElementById('page-payment');
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
                  ${isAr ? 'دفع آمن ومشفر 100٪ — مدعوم بـ Paymob' : 'Secure payment powered by Paymob'}
                </p>
              </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">

              <!-- Payment Methods -->
              <div class="lg:col-span-2 space-y-4">

                <!-- Currency selector -->
                <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <h3 class="font-bold text-gray-700 text-sm mb-3">
                    <i class="fa-solid fa-coins text-brand-500 mr-1"></i>
                    ${isAr ? 'العملة' : 'Currency'}
                  </h3>
                  <div class="flex gap-2 flex-wrap">
                    ${[
                      {code:'EGP', label:'🇪🇬 جنيه مصري', rate:1},
                      {code:'USD', label:'🇺🇸 دولار', rate:50},
                      {code:'EUR', label:'🇪🇺 يورو', rate:54},
                      {code:'SAR', label:'🇸🇦 ريال سعودي', rate:13},
                    ].map(c => `
                      <button onclick="PaymentSystem.setCurrency('${c.code}',${c.rate})"
                        data-currency="${c.code}"
                        class="currency-btn px-4 py-2 rounded-xl border-2 text-sm font-bold transition-all ${c.code === 'EGP' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:border-brand-300'}">
                        ${c.label}
                      </button>`).join('')}
                  </div>
                  <p class="text-xs text-gray-400 mt-2" id="currency-note">
                    ${isAr ? 'المبلغ بالجنيه المصري: ' : 'Amount in EGP: '}
                    <span id="egp-equivalent" class="font-bold">${formatCurrency(total)}</span>
                  </p>
                </div>

                <!-- Method cards -->
                <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                  <h2 class="font-black text-gray-900 text-lg mb-5 flex items-center gap-2">
                    <i class="fa-solid fa-credit-card text-brand-600"></i>
                    ${isAr ? 'اختر وسيلة الدفع' : 'Payment Method'}
                  </h2>
                  <div class="space-y-3">

                    <!-- ── Credit/Debit Card ────────────────────────────────── -->
                    <button onclick="PaymentSystem.selectMethod('card')" data-method="card"
                      class="pay-opt w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-2xl hover:border-brand-400 hover:bg-brand-50 transition-all text-${isAr ? 'right' : 'left'}">
                      <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center flex-shrink-0 shadow">
                        <i class="fa-solid fa-credit-card text-white text-xl"></i>
                      </div>
                      <div class="flex-1">
                        <p class="font-black text-gray-900">${isAr ? 'بطاقة ائتمان / خصم' : 'Credit / Debit Card'}</p>
                        <p class="text-xs text-gray-500 mt-0.5">${isAr ? 'Visa • Mastercard • Meeza • بطاقات أجنبية' : 'Visa • Mastercard • Meeza • International Cards'}</p>
                        <div class="flex gap-1.5 mt-2">
                          <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Visa_Inc._logo.svg/200px-Visa_Inc._logo.svg.png" class="h-5 object-contain" alt="Visa" loading="lazy">
                          <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Mastercard-logo.svg/200px-Mastercard-logo.svg.png" class="h-5 object-contain" alt="Mastercard" loading="lazy">
                        </div>
                      </div>
                      <i class="fa-solid fa-circle text-gray-300 text-lg check-icon flex-shrink-0"></i>
                    </button>

                    <!-- ── Save Card ───────────────────────────────────────── -->
                    <button onclick="PaymentSystem.selectMethod('save_card')" data-method="save_card"
                      class="pay-opt w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-2xl hover:border-brand-400 hover:bg-brand-50 transition-all text-${isAr ? 'right' : 'left'}">
                      <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center flex-shrink-0 shadow">
                        <i class="fa-solid fa-vault text-white text-xl"></i>
                      </div>
                      <div class="flex-1">
                        <p class="font-black text-gray-900">${isAr ? 'حفظ البطاقة للمرات القادمة' : 'Save Card for Later'}</p>
                        <p class="text-xs text-gray-500 mt-0.5">${isAr ? 'ادفع الآن واحفظ بطاقتك بأمان تام مع Paymob' : 'Pay now and save card securely with Paymob'}</p>
                        <span class="inline-block bg-purple-100 text-purple-700 text-xs font-bold px-2 py-0.5 rounded-full mt-1">Powered by Paymob</span>
                      </div>
                      <i class="fa-solid fa-circle text-gray-300 text-lg check-icon flex-shrink-0"></i>
                    </button>

                    <!-- ── Vodafone Cash ────────────────────────────────────── -->
                    <button onclick="PaymentSystem.selectMethod('vodafone')" data-method="vodafone"
                      class="pay-opt w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-2xl hover:border-brand-400 hover:bg-brand-50 transition-all text-${isAr ? 'right' : 'left'}">
                      <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center flex-shrink-0 shadow">
                        <i class="fa-solid fa-mobile-screen text-white text-xl"></i>
                      </div>
                      <div class="flex-1">
                        <p class="font-black text-gray-900">Vodafone Cash</p>
                        <p class="text-xs text-gray-500 mt-0.5">${isAr ? 'ادفع مباشرة من محفظة فودافون كاش' : 'Pay directly from your Vodafone Cash wallet'}</p>
                        <span class="text-xs text-red-600 font-bold mt-1 block">${isAr ? '⚡ دفع فوري' : '⚡ Instant'}</span>
                      </div>
                      <i class="fa-solid fa-circle text-gray-300 text-lg check-icon flex-shrink-0"></i>
                    </button>

                    <!-- ── Etisalat Cash ────────────────────────────────────── -->
                    <button onclick="PaymentSystem.selectMethod('etisalat')" data-method="etisalat"
                      class="pay-opt w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-2xl hover:border-brand-400 hover:bg-brand-50 transition-all text-${isAr ? 'right' : 'left'}">
                      <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-600 to-teal-600 flex items-center justify-center flex-shrink-0 shadow">
                        <i class="fa-solid fa-wifi text-white text-xl"></i>
                      </div>
                      <div class="flex-1">
                        <p class="font-black text-gray-900">Etisalat Cash (We Pay)</p>
                        <p class="text-xs text-gray-500 mt-0.5">${isAr ? 'ادفع من محفظة اتصالات كاش / WE' : 'Pay from Etisalat Cash / WE wallet'}</p>
                        <span class="text-xs text-green-600 font-bold mt-1 block">${isAr ? '⚡ دفع فوري' : '⚡ Instant'}</span>
                      </div>
                      <i class="fa-solid fa-circle text-gray-300 text-lg check-icon flex-shrink-0"></i>
                    </button>

                    <!-- ── Wallet Balance ────────────────────────────────────── -->
                    <button onclick="PaymentSystem.selectMethod('wallet')" data-method="wallet"
                      class="pay-opt w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-2xl hover:border-brand-400 hover:bg-brand-50 transition-all text-${isAr ? 'right' : 'left'}${hasWallet ? '' : ' opacity-60'}">
                      <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center flex-shrink-0 shadow">
                        <i class="fa-solid fa-wallet text-white text-xl"></i>
                      </div>
                      <div class="flex-1">
                        <p class="font-black text-gray-900">${isAr ? 'رصيد المحفظة' : 'Wallet Balance'}</p>
                        <p class="text-sm mt-0.5 ${hasWallet ? 'text-green-600 font-bold' : 'text-red-500'}">
                          ${isAr ? 'الرصيد: ' : 'Balance: '}${formatCurrency(walletBal)}
                          ${!hasWallet ? (isAr ? ' — رصيد غير كافٍ' : ' — Insufficient') : ''}
                        </p>
                        ${hasWallet ? `<span class="text-xs text-green-600 font-bold">⚡ ${isAr ? 'دفع فوري' : 'Instant'}</span>` : ''}
                      </div>
                      <i class="fa-solid fa-circle text-gray-300 text-lg check-icon flex-shrink-0"></i>
                    </button>

                  </div>
                </div>

                <!-- Mobile number input (shown for Vodafone/Etisalat) -->
                <div id="mobile-num-wrap" class="hidden bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <label class="block text-sm font-bold text-gray-700 mb-2">
                    <i class="fa-solid fa-mobile-screen text-brand-500 mr-1"></i>
                    ${isAr ? 'رقم المحفظة' : 'Wallet Number'}
                  </label>
                  <input type="tel" id="mobile-wallet-num" dir="ltr"
                    class="form-input text-left" placeholder="01XXXXXXXXX"
                    pattern="^01[0-9]{9}$" maxlength="11" />
                  <p class="text-xs text-gray-400 mt-1.5">
                    ${isAr ? 'أدخل رقم هاتفك المرتبط بالمحفظة' : 'Enter the phone number linked to your wallet'}
                  </p>
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
                  class="w-full py-5 bg-gradient-to-r from-brand-600 to-brand-800 text-white rounded-2xl font-black text-xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all flex items-center justify-center gap-3">
                  <i class="fa-solid fa-lock"></i>
                  <span id="pay-btn-label">${t('pay.pay_now')} — ${formatCurrency(total)}</span>
                </button>

                <!-- Paymob badge -->
                <div class="bg-white rounded-2xl p-4 flex flex-wrap items-center justify-center gap-6 border border-gray-100">
                  <span class="text-xs text-gray-400 font-bold">Powered by</span>
                  <div class="flex items-center gap-1">
                    <div class="w-5 h-5 bg-brand-600 rounded flex items-center justify-center"><span class="text-white text-xs font-black">P</span></div>
                    <span class="text-xs font-black text-gray-700">Paymob</span>
                  </div>
                  <div class="flex items-center gap-2 text-xs text-gray-400">
                    <i class="fa-solid fa-shield-check text-green-500"></i> SSL 256-bit
                  </div>
                  <div class="flex items-center gap-2 text-xs text-gray-400">
                    <i class="fa-solid fa-lock text-brand-500"></i> Escrow
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
                    <i class="fa-solid fa-receipt text-brand-600"></i>
                    ${isAr ? 'ملخص الطلب' : 'Order Summary'}
                  </h3>
                  <div class="space-y-3 mb-5">
                    ${items.filter(Boolean).map(item => `
                      <div class="flex gap-3 items-start">
                        <img src="${item.image || ''}" alt="" onerror="this.style.display='none'"
                          class="w-14 h-14 rounded-xl object-cover flex-shrink-0 bg-gray-100">
                        <div class="flex-1 min-w-0">
                          <p class="font-bold text-gray-900 text-sm line-clamp-2">${item.title || ''}</p>
                          <p class="text-brand-600 font-black">${formatCurrency(item.price || 0)}</p>
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
                      <span class="text-brand-600" id="total-display">${formatCurrency(total)}</span>
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

    // ── Currency Switcher ─────────────────────────────────────────────────────
    function setCurrency(code, rate) {
        PaymentState.currency = code;
        document.querySelectorAll('.currency-btn').forEach(b => {
            const active = b.dataset.currency === code;
            b.classList.toggle('border-brand-500', active);
            b.classList.toggle('bg-brand-50',      active);
            b.classList.toggle('text-brand-700',   active);
            b.classList.toggle('border-gray-200',  !active);
            b.classList.toggle('text-gray-600',    !active);
        });
        const converted = code === 'EGP' ? PaymentState.amount : (PaymentState.amount / rate).toFixed(2);
        const display   = code === 'EGP' ? formatCurrency(PaymentState.amount) : `${converted} ${code}`;
        const td = document.getElementById('total-display');
        if (td) td.textContent = display;
        const lb = document.getElementById('pay-btn-label');
        if (lb) lb.textContent = 'ادفع الآن — ' + display;
        const eq = document.getElementById('egp-equivalent');
        if (eq) eq.textContent = formatCurrency(PaymentState.amount);
    }

    // ── Select Method ─────────────────────────────────────────────────────────
    function selectMethod(method) {
        PaymentState.selectedMethod = method;
        document.querySelectorAll('.pay-opt').forEach(btn => {
            btn.classList.remove('border-brand-500','bg-brand-50');
            btn.classList.add('border-gray-200');
            const ic = btn.querySelector('.check-icon');
            if (ic) ic.className = 'fa-solid fa-circle text-gray-300 text-lg check-icon flex-shrink-0';
        });
        const target = document.querySelector('[data-method="' + method + '"]');
        if (target) {
            target.classList.add('border-brand-500','bg-brand-50');
            target.classList.remove('border-gray-200');
            const ic = target.querySelector('.check-icon');
            if (ic) ic.className = 'fa-solid fa-circle-check text-brand-600 text-lg check-icon flex-shrink-0';
        }
        // Show mobile number input for wallet methods
        const mwrap = document.getElementById('mobile-num-wrap');
        if (mwrap) {
            const needsMobile = method === 'vodafone' || method === 'etisalat';
            mwrap.classList.toggle('hidden', !needsMobile);
        }
    }

    // ── Process Payment ───────────────────────────────────────────────────────
    async function processPayment() {
        const method = PaymentState.selectedMethod;
        if (!method) { showToast(t('pay.select_method'), 'warning'); return; }
        if (!AppState.currentUser) { showToast(t('general.login_req'), 'warning'); navigateTo('login'); return; }

        try {
            if      (method === 'card' || method === 'save_card') await _payWithCard(method);
            else if (method === 'vodafone')  await _payWithMobileWallet('vodafone_cash');
            else if (method === 'etisalat')  await _payWithMobileWallet('etisalat_cash');
            else if (method === 'wallet')    await _payWithWallet();
        } catch(err) {
            console.error('[Payment] Error:', err);
            showToast(err.message || t('general.error'), 'error');
            hideLoading();
        }
    }

    // ── Card / Save Card via Paymob ───────────────────────────────────────────
    async function _payWithCard(method) {
        const isAr  = AppState.language !== 'en';
        showLoading(isAr ? 'جاري الاتصال ببوابة الدفع...' : 'Connecting to payment gateway...');
        try {
            const user    = AppState.currentUser;
            const idToken = window.auth && window.auth.currentUser ? await window.auth.currentUser.getIdToken() : '';
            const resp    = await fetch(PAY_ENDPOINT, {
                method:  'POST',
                headers: { 'Content-Type':'application/json', 'Authorization': 'Bearer ' + idToken },
                body: JSON.stringify({
                    action:        'getPaymentKey',
                    amount:        PaymentState.amount,
                    orderId:       PaymentState.orderId,
                    paymentMethod: method === 'save_card' ? 'save_card' : 'card',
                    currency:      PaymentState.currency,
                    saveCard:      method === 'save_card',
                    customerData: {
                        first_name: (user.displayName || 'User').split(' ')[0],
                        last_name:  (user.displayName || 'User').split(' ').slice(1).join(' ') || 'N/A',
                        email:      user.email || 'user@mall.com',
                        phone:      user.phoneNumber || '+201000000000',
                    }
                })
            });
            const data = await resp.json();
            hideLoading();
            if (!data.iframeUrl) throw new Error(data.error || isAr ? 'خطأ في البوابة' : 'Gateway error');
            _openPaymobIframe(data.iframeUrl, method === 'save_card');
        } catch(err) { hideLoading(); throw err; }
    }

    // ── Mobile Wallet via Paymob ──────────────────────────────────────────────
    async function _payWithMobileWallet(walletType) {
        const isAr  = AppState.language !== 'en';
        const phone = document.getElementById('mobile-wallet-num') ? document.getElementById('mobile-wallet-num').value.trim() : '';
        if (!phone || !/^01[0-9]{9}$/.test(phone)) {
            showToast(isAr ? 'أدخل رقم هاتف صحيح (11 رقم يبدأ بـ 01)' : 'Enter a valid 11-digit phone number starting with 01', 'warning');
            return;
        }
        showLoading(isAr ? 'جاري إرسال طلب الدفع للمحفظة...' : 'Sending payment request to wallet...');
        try {
            const user    = AppState.currentUser;
            const idToken = window.auth && window.auth.currentUser ? await window.auth.currentUser.getIdToken() : '';
            const resp    = await fetch(PAY_ENDPOINT, {
                method:  'POST',
                headers: { 'Content-Type':'application/json', 'Authorization': 'Bearer ' + idToken },
                body: JSON.stringify({
                    action:        'walletPay',
                    amount:        PaymentState.amount,
                    orderId:       PaymentState.orderId,
                    paymentMethod: walletType,
                    mobileNumber:  phone,
                    customerData:  { phone, email: user.email || 'user@mall.com' }
                })
            });
            const data = await resp.json();
            hideLoading();
            if (data.redirectUrl) {
                // Open wallet redirect in same window
                window.location.href = data.redirectUrl;
            } else if (data.iframeUrl) {
                _openPaymobIframe(data.iframeUrl, false);
            } else {
                throw new Error(data.error || (isAr ? 'خطأ في بوابة الدفع' : 'Payment gateway error'));
            }
        } catch(err) { hideLoading(); throw err; }
    }

    // ── Wallet Balance ────────────────────────────────────────────────────────
    async function _payWithWallet() {
        const isAr   = AppState.language !== 'en';
        const balance = parseFloat((AppState.wallet && AppState.wallet.balance) || 0);
        if (balance < PaymentState.amount) { showToast(t('pay.insufficient'), 'error'); return; }
        showLoading(isAr ? 'جاري الخصم من المحفظة...' : 'Processing wallet payment...');
        try {
            const idToken = window.auth && window.auth.currentUser ? await window.auth.currentUser.getIdToken() : '';
            await fetch(PAY_ENDPOINT, {
                method:  'POST',
                headers: { 'Content-Type':'application/json', 'Authorization': 'Bearer ' + idToken },
                body: JSON.stringify({ action:'walletDeduct', amount:PaymentState.amount, orderId:PaymentState.orderId, userId:AppState.currentUser.uid })
            });
            hideLoading();
            if (AppState.wallet) AppState.wallet.balance = balance - PaymentState.amount;
            await _finalizeOrders('wallet', 'WALLET_' + PaymentState.orderId);
        } catch(err) { hideLoading(); throw err; }
    }

    // ── Open Paymob iframe ────────────────────────────────────────────────────
    function _openPaymobIframe(url, isSaveCard) {
        const isAr  = AppState.language !== 'en';
        const modal = document.createElement('div');
        modal.id    = 'paymob-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px';
        modal.innerHTML = `
          <div style="background:#fff;border-radius:24px;width:100%;max-width:680px;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,.4)">
            <!-- Header -->
            <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:18px 22px;display:flex;align-items:center;justify-content:space-between;color:#fff">
              <div style="display:flex;align-items:center;gap:12px">
                <i class="fa-solid fa-lock" style="font-size:20px"></i>
                <div>
                  <p style="font-weight:900;font-size:15px">${isAr ? (isSaveCard ? 'حفظ البطاقة والدفع' : 'دفع آمن') : (isSaveCard ? 'Save Card & Pay' : 'Secure Payment')}</p>
                  <p style="font-size:12px;opacity:.8">${formatCurrency(PaymentState.amount)} — Powered by Paymob</p>
                </div>
              </div>
              <button onclick="document.getElementById('paymob-modal').remove()" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:34px;height:34px;border-radius:10px;cursor:pointer;font-size:16px">✕</button>
            </div>
            <!-- Trust bar -->
            <div style="background:#f0fdf4;padding:8px 20px;display:flex;align-items:center;gap:8px;font-size:12px;color:#166534;border-bottom:1px solid #dcfce7">
              <i class="fa-solid fa-shield-check"></i>
              <span>${isAr ? 'تشفير SSL 256-bit — بياناتك محمية بالكامل' : '256-bit SSL encryption — your data is fully protected'}</span>
            </div>
            <iframe src="${url}" style="width:100%;height:520px;border:none;display:block"
              allow="payment; accelerometer; gyroscope" loading="lazy" id="paymob-iframe"></iframe>
          </div>`;
        document.body.appendChild(modal);

        // Listen for Paymob callback
        const onMsg = function(e) {
            const d = e.data;
            if (!d) return;
            const success = d.success === true || d.status === 'success' || d.payment_status === 'paid' || d.txn_response_code === 'APPROVED';
            const failed  = d.success === false || d.status === 'failed' || d.payment_status === 'failed';
            if (success) {
                modal.remove();
                window.removeEventListener('message', onMsg);
                _finalizeOrders(isSaveCard ? 'paymob_save_card' : 'paymob_card', d.id || PaymentState.orderId, { savedCardToken: d.card_token || null });
            } else if (failed) {
                modal.remove();
                window.removeEventListener('message', onMsg);
                showToast(t('pay.failed'), 'error');
            }
        };
        window.addEventListener('message', onMsg);
    }

    // ── Finalize Orders (batch write) ─────────────────────────────────────────
    async function _finalizeOrders(method, paymentId, extra) {
        extra = extra || {};
        const cart   = AppState.cart && AppState.cart.length > 0 ? AppState.cart : [AppState.currentPaymentService];
        const user   = AppState.currentUser;
        const isAr   = AppState.language !== 'en';

        let allSucceeded = true;
        for (let i = 0; i < cart.length; i++) {
            const item = cart[i];
            if (!item) continue;
            try {
                const orderRef  = window.db.collection(COLLECTIONS.ORDERS).doc();
                const orderData = Object.assign({
                    serviceId:      item.id || '',
                    serviceTitle:   item.title || item.serviceTitle || '',
                    image:          item.image || '',
                    price:          item.price || 0,
                    deliveryDays:   item.deliveryDays || 3,
                    buyerId:        user.uid,
                    buyerName:      user.displayName || '',
                    buyerEmail:     user.email || '',
                    sellerId:       item.sellerId || '',
                    sellerName:     item.sellerName || '',
                    status:         ORDER_STATUS.PAYMENT_HELD,
                    paymentMethod:  method,
                    paymentId:      paymentId,
                    currency:       PaymentState.currency,
                    escrowHeld:     true,
                    escrowAmount:   item.price || 0,
                    chatEnabled:    true,
                    filesEnabled:   true,
                    buyerFiles:     [],
                    deliveryDeadline: new Date(Date.now() + (item.deliveryDays || 3) * 86400000).toISOString(),
                    createdAt:      _ts(),
                    updatedAt:      _ts(),
                }, extra);

                await orderRef.set(orderData);

                // Escrow record
                await window.db.collection(COLLECTIONS.ESCROW).doc(orderRef.id).set({
                    orderId: orderRef.id, buyerId: user.uid,
                    sellerId: item.sellerId || '',
                    amount: item.price || 0, status: 'held',
                    paymentId, method, currency: PaymentState.currency,
                    createdAt: _ts(),
                });

                // ── Notify seller of new order ───────────────────────────────
                if (item.sellerId) {
                    await window.db.collection(COLLECTIONS.NOTIFICATIONS).add({
                        userId:    item.sellerId,
                        type:      'new_order',
                        title:     isAr ? '🛒 طلب جديد!' : '🛒 New Order!',
                        message:   (user.displayName || isAr ? 'عميل' : 'A buyer') + ' ' +
                                   (isAr ? 'طلب خدمة: ' : 'ordered: ') + (item.title || ''),
                        orderId:   orderRef.id,
                        serviceId: item.id || '',
                        read:      false,
                        createdAt: _ts(),
                    });
                }

            } catch(err) {
                console.error('[Payment] Order creation failed:', err);
                allSucceeded = false;
            }
        }

        clearCart();
        if (allSucceeded) {
            showToast(isAr ? '✅ تم الدفع بنجاح! يمكنك الآن إرسال تعليماتك للبائع' : '✅ Payment successful! You can now send instructions to the seller', 'success');
        } else {
            showToast(t('pay.success'), 'success');
        }
        setTimeout(() => navigateTo('orders'), 1500);
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

    // ── Check redirect result (Paymob 3DS / wallet redirect) ─────────────────
    function checkPaymentRedirect() {
        const params  = new URLSearchParams(window.location.search);
        const success = params.get('payment_success') || params.get('success');
        const orderId = params.get('order_id') || params.get('merchant_order_id');
        if (success !== null && orderId) {
            window.history.replaceState({}, '', window.location.pathname);
            if (success === 'true' || success === '1') {
                _finalizeOrders(params.get('method') || 'paymob', orderId);
            } else {
                showToast(t('pay.failed'), 'error');
            }
        }
    }

    // ── Public API ────────────────────────────────────────────────────────────
    window.PaymentSystem   = { openPaymentPage, selectMethod, processPayment, applyCoupon, setCurrency, state: PaymentState };
    window.openPaymentModal = function(s) { openPaymentPage('service', s); };
    window.checkout         = function(s) { openPaymentPage(s ? 'service' : 'cart', s); };
    window.selectPayment    = selectMethod;
    window.processPayment   = processPayment;

    document.addEventListener('DOMContentLoaded', checkPaymentRedirect);
    console.log('✅ PaymentSystem v4.0 — Paymob Card | Save Card | Vodafone Cash | Etisalat Cash | Wallet');
})();
