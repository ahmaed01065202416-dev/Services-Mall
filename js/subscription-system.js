/**
 * ============================================================================
 * SUBSCRIPTION-SYSTEM.JS — Recurring monthly services (via functions/api/subscription.js)
 * ============================================================================
 */
(function () {
    'use strict';

    async function subscribe(serviceId, service) {
        const isAr = AppState.language !== 'en';
        if (!AppState.currentUser) { showToast(t('general.login_req'), 'warning'); navigateTo('login'); return; }

        const price = service?.price || 0;
        if (!confirm(isAr
            ? `هيتم خصم ${formatCurrency(price)} شهرياً من بطاقتك تلقائياً لحد ما تلغي الاشتراك. عايز تكمل؟`
            : `${formatCurrency(price)} will be charged monthly to your card until you cancel. Continue?`)) return;

        showLoading(isAr ? 'جاري تجهيز الاشتراك...' : 'Setting up your subscription...');
        try {
            const idToken = window.auth?.currentUser ? await window.auth.currentUser.getIdToken() : '';
            const resp = await fetch('/api/subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
                body: JSON.stringify({ action: 'subscribe', serviceId }),
            });
            const data = await resp.json();
            hideLoading();
            if (!resp.ok) throw new Error(data.error || (isAr ? 'تعذر إنشاء الاشتراك' : 'Could not create subscription'));

            if (data.simulated) {
                showToast(isAr ? '✅ تم تفعيل الاشتراك (وضع تجريبي)' : '✅ Subscription activated (demo mode)', 'success');
                navigateTo('wallet');
                return;
            }
            // First payment happens on a Fawaterak-hosted page, same as a
            // normal purchase — this also captures the card for future
            // automatic monthly charges.
            window.location.href = data.redirectUrl;
        } catch (err) {
            hideLoading();
            showToast(err.message, 'error');
        }
    }

    async function cancel(subscriptionId) {
        const isAr = AppState.language !== 'en';
        if (!confirm(isAr ? 'هل تريد إلغاء الاشتراك؟ لن يتم خصم أي مبلغ في الشهر القادم.' : 'Cancel this subscription? No further charges will be made.')) return;
        showLoading();
        try {
            const idToken = window.auth?.currentUser ? await window.auth.currentUser.getIdToken() : '';
            const resp = await fetch('/api/subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
                body: JSON.stringify({ action: 'cancel', subscriptionId }),
            });
            const data = await resp.json();
            hideLoading();
            if (!resp.ok) throw new Error(data.error || t('general.error'));
            showToast(isAr ? '✅ تم إلغاء الاشتراك' : '✅ Subscription cancelled', 'success');
            listMine();
        } catch (err) { hideLoading(); showToast(err.message, 'error'); }
    }

    // ── My subscriptions (rendered into wallet page under transactions) ──────
    async function listMine() {
        const user = AppState.currentUser;
        const container = document.getElementById('mySubscriptions');
        if (!user || !container) return;
        const isAr = AppState.language !== 'en';
        try {
            const snap = await window.db.collection('subscriptions').where('buyerId', '==', user.uid).get();
            if (snap.empty) { container.innerHTML = ''; return; }
            const statusLabel = { active: isAr?'نشط':'Active', pending_first_payment: isAr?'قيد التفعيل':'Pending', cancelled: isAr?'ملغي':'Cancelled', payment_failed: isAr?'فشل الدفع':'Payment failed' };
            container.innerHTML = `
              <h3 class="font-black text-gray-900 mb-4">${isAr?'اشتراكاتي الشهرية':'My Subscriptions'}</h3>
              ${snap.docs.map(d => {
                const s = d.data();
                return `<div class="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
                  <div><p class="font-bold text-gray-900 text-sm">${escapeHtml(s.title||'')}</p>
                    <p class="text-xs text-gray-400">${formatCurrency(s.amount||0)}/${isAr?'شهر':'mo'} · ${statusLabel[s.status]||s.status}</p></div>
                  ${s.status === 'active' ? `<button onclick="SubscriptionSystem.cancel('${d.id}')" class="text-xs text-red-500 font-bold hover:underline">${isAr?'إلغاء':'Cancel'}</button>` : ''}
                </div>`;
              }).join('')}`;
        } catch (_) { container.innerHTML = ''; }
    }

    window.SubscriptionSystem = { subscribe, cancel, listMine };
})();
