/**
 * REVIEWS.JS — rating dialog + summary.
 * The buyer is asked for a rating right after confirming receipt, and any completed, un-reviewed order shows a
 * "قيّم" button in the orders list. Reviews are written by the browser (rules check buyer + completed + once per order);
 * the service's average is then recomputed on the server (/api/ratings sync) — the browser can't forge it.
 */
(function () {
    'use strict';
    const isAr = () => AppState.language !== 'en';
    const esc = (v) => (window.escapeHtml ? window.escapeHtml(v) : String(v == null ? '' : v));
    const LABELS_AR = ['', 'سيئ', 'مقبول', 'جيد', 'جيد جدًا', 'ممتاز'], LABELS_EN = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

    function starsHtml(n, cls) {
        return Array.from({ length: 5 }, (_, i) => `<i class="fa-solid fa-star ${cls || 'text-sm'} ${i < Math.round(n) ? 'text-yellow-400' : 'text-gray-200'}"></i>`).join('');
    }

    const ReviewsUI = {
        starsHtml,

        /** Dialog: 1–5 stars + optional text for a completed order. */
        async open(orderId) {
            const user = AppState.currentUser;
            if (!user) return;
            let order;
            try {
                const snap = await window.db.collection(COLLECTIONS.ORDERS).doc(orderId).get();
                if (!snap.exists) return;
                order = { id: snap.id, ...snap.data() };
            } catch (e) { showToast(e.message, 'error'); return; }
            if (order.buyerId !== user.uid) return;
            if (order.status !== ORDER_STATUS.COMPLETED) { showToast(isAr() ? 'التقييم متاح بعد تأكيد الاستلام' : 'You can review after confirming receipt', 'warning'); return; }
            if (order.reviewed) { showToast(isAr() ? 'قيّمت الطلب ده قبل كده' : 'Already reviewed', 'info'); return; }

            let rating = 0;
            const ov = document.createElement('div');
            ov.className = 'fixed inset-0 bg-black/70 z-[99999] flex items-center justify-center p-4';
            ov.innerHTML = `<div class="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 text-center">
              <h3 class="text-xl font-black text-gray-900 mb-1">${isAr() ? 'قيّم تجربتك' : 'Rate your experience'}</h3>
              <p class="text-sm text-gray-500 mb-4 truncate">${esc(order.serviceTitle || '')}</p>
              <div id="rvStars" class="flex justify-center gap-2 text-4xl mb-1" dir="ltr">
                ${[1, 2, 3, 4, 5].map(i => `<button type="button" data-s="${i}" class="text-gray-300 hover:scale-110 transition"><i class="fa-solid fa-star"></i></button>`).join('')}
              </div>
              <p id="rvLabel" class="text-sm font-bold text-amber-600 h-5 mb-3"></p>
              <textarea id="rvText" rows="3" maxlength="600" class="form-input w-full mb-4 text-sm" placeholder="${isAr() ? 'احكي تجربتك (اختياري)' : 'Tell us more (optional)'}"></textarea>
              <div class="flex gap-3"><button id="rvLater" class="btn-secondary flex-1 py-3">${isAr() ? 'لاحقًا' : 'Later'}</button>
              <button id="rvSend" class="btn-primary flex-1 py-3">${isAr() ? 'إرسال التقييم' : 'Submit'}</button></div></div>`;
            document.body.appendChild(ov);
            const paint = (n) => ov.querySelectorAll('#rvStars button').forEach((b, i) => b.className = (i < n ? 'text-yellow-400' : 'text-gray-300') + ' hover:scale-110 transition');
            ov.querySelectorAll('#rvStars button').forEach(b => {
                b.onmouseenter = () => paint(+b.dataset.s);
                b.onclick = () => { rating = +b.dataset.s; paint(rating); ov.querySelector('#rvLabel').textContent = (isAr() ? LABELS_AR : LABELS_EN)[rating]; };
            });
            ov.querySelector('#rvStars').onmouseleave = () => paint(rating);
            ov.querySelector('#rvLater').onclick = () => ov.remove();
            ov.querySelector('#rvSend').onclick = async () => {
                if (!rating) { showToast(isAr() ? 'اختار عدد النجوم' : 'Pick a star rating', 'warning'); return; }
                const text = sanitizeInput((ov.querySelector('#rvText').value || '').trim(), 600);
                const leak = window.scanFieldsForContactLeak && window.scanFieldsForContactLeak([text]);
                if (leak) { showToast(window.contactLeakWarning(isAr()), 'error'); return; }
                ov.remove(); showLoading();
                try {
                    const batch = window.db.batch();
                    batch.set(window.db.collection(COLLECTIONS.REVIEWS).doc(), {
                        orderId, rating, text, reviewerId: user.uid, reviewerName: user.displayName || user.email || '',
                        sellerId: order.sellerId, serviceId: order.serviceId, createdAt: serverTimestamp(),
                    });
                    batch.update(window.db.collection(COLLECTIONS.ORDERS).doc(orderId), { reviewed: true, updatedAt: serverTimestamp() });
                    await batch.commit();
                    try {
                        const tok = await window.auth.currentUser.getIdToken();
                        await fetch('/api/ratings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
                            body: JSON.stringify({ action: 'sync', serviceId: order.serviceId }) });
                    } catch (_) { /* the daily cron heals the average */ }
                    hideLoading(); showToast(isAr() ? '⭐ شكرًا على تقييمك!' : '⭐ Thanks for your review!', 'success');
                    if (AppState.currentPage === 'workspace' && typeof openWorkspace === 'function') openWorkspace(orderId);
                    else if (window.OrdersManager && OrdersManager.loadOrders) OrdersManager.loadOrders();
                } catch (e) {
                    hideLoading();
                    console.error('[Reviews]', e);
                    showToast((isAr() ? 'تعذّر إرسال التقييم: ' : 'Could not submit: ') + (e.message || ''), 'error');
                }
            };
        },

        /** Summary bar + latest reviews for one service (used in the detail modal). */
        async renderForService(serviceId, svc) {
            const host = document.getElementById('serviceReviewsHost'); if (!host) return;
            try {
                const snap = await window.db.collection(COLLECTIONS.REVIEWS).where('serviceId', '==', serviceId).orderBy('createdAt', 'desc').limit(30).get();
                const list = snap.docs.map(d => d.data());
                if (!list.length) { host.innerHTML = `<div class="px-6 pb-6"><h3 class="font-black text-gray-900 mb-2">${isAr() ? 'التقييمات' : 'Reviews'}</h3><p class="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 text-center">${isAr() ? 'لسه مفيش تقييمات — كن أول من يقيّم بعد الشراء' : 'No reviews yet'}</p></div>`; return; }
                const avg = list.reduce((a, r) => a + (Number(r.rating) || 0), 0) / list.length;
                const dist = [5, 4, 3, 2, 1].map(n => ({ n, c: list.filter(r => Math.round(r.rating) === n).length }));
                host.innerHTML = `
                <div class="px-6 pb-6">
                  <h3 class="font-black text-gray-900 mb-3">${isAr() ? 'التقييمات' : 'Reviews'}</h3>
                  <div class="flex items-center gap-5 bg-amber-50 rounded-2xl p-4 mb-4">
                    <div class="text-center"><p class="text-4xl font-black text-gray-900">${avg.toFixed(1)}</p><div class="flex gap-0.5 justify-center">${starsHtml(avg)}</div>
                      <p class="text-xs text-gray-500 mt-1">${list.length} ${isAr() ? 'تقييم' : 'reviews'}</p></div>
                    <div class="flex-1 space-y-1">${dist.map(d => `<div class="flex items-center gap-2 text-xs"><span class="w-3 text-gray-500">${d.n}</span><div class="flex-1 h-2 bg-white rounded-full overflow-hidden"><div class="h-full bg-yellow-400" style="width:${Math.round(d.c / list.length * 100)}%"></div></div><span class="w-5 text-gray-400">${d.c}</span></div>`).join('')}</div>
                  </div>
                  <div class="space-y-3">${list.slice(0, 10).map(r => `
                    <div class="bg-gray-50 rounded-xl p-4">
                      <div class="flex items-center gap-3 mb-1.5">
                        <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(r.reviewerName || 'U')}&background=0284c7&color=fff" class="w-8 h-8 rounded-full">
                        <div><p class="font-bold text-gray-900 text-sm">${esc(r.reviewerName || '—')}</p><div class="flex gap-0.5">${starsHtml(r.rating, 'text-xs')}</div></div>
                        <span class="ms-auto text-xs text-gray-400">${window.formatTimeAgo ? formatTimeAgo(r.createdAt) : ''}</span>
                      </div>
                      ${r.text ? `<p class="text-sm text-gray-600">${esc(r.text)}</p>` : ''}
                    </div>`).join('')}</div>
                </div>`;
            } catch (e) {
                console.warn('[Reviews] list failed (is the reviews index deployed? firebase deploy --only firestore:indexes):', e.message);
                host.innerHTML = '';
            }
        },
    };
    window.ReviewsUI = ReviewsUI;
    console.log('✅ Reviews loaded');
})();
