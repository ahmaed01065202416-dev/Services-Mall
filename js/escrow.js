/**
 * ============================================================================
 * ESCROW.JS — Mall Services Escrow & Dispute System
 * Payment Hold · Release · Dispute · Refund · Admin Flow
 * ============================================================================
 */
(function () {
    'use strict';

    const EscrowManager = {

        // ── Confirm Delivery (Buyer) ──────────────────────────────────────────
        async confirmDelivery(orderId) {
            const isAr = AppState.language !== 'en';
            const confirmed = await _showConfirmDialog(
                isAr ? 'تأكيد استلام الخدمة' : 'Confirm Service Delivery',
                isAr ? 'بعد التأكيد، سيتم تحويل الأموال للبائع نهائياً ولا يمكن الاسترداد أو إرجاع المنتج بعدها. هل استلمت الطلب كاملاً وتأكدت منه؟'
                     : 'After confirmation the funds go to the seller for good — no refund or product return is possible afterwards. Have you received and checked everything?',
                isAr ? 'نعم، تأكيد الاستلام' : 'Yes, Confirm Delivery'
            );
            if (!confirmed) return;

            showLoading(isAr ? 'جاري تحويل الأموال للبائع...' : 'Releasing funds to seller...');
            try {
                // Fund release is now handled entirely server-side: it verifies
                // the caller really is the buyer on this order, checks the
                // escrow hasn't already been released (no double-payout), and
                // atomically credits the seller's wallet. The browser can no
                // longer write to /wallets directly — Firestore rules block it.
                const idToken = window.auth && window.auth.currentUser ? await window.auth.currentUser.getIdToken() : '';
                const resp = await fetch('/api/payment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
                    body: JSON.stringify({ action: 'releaseEscrow', orderId }),
                });
                const data = await resp.json();
                if (!resp.ok || !data.success) throw new Error(data.error || (isAr ? 'تعذر تحويل الأموال' : 'Could not release funds'));

                hideLoading();
                showToast(isAr ? 'تم تأكيد الاستلام وتحويل الأموال بنجاح!' : 'Delivery confirmed and funds released!', 'success');

                // Refresh orders
                setTimeout(() => {
                    if (typeof OrdersManager?.loadOrders === 'function') OrdersManager.loadOrders();
                    if (typeof renderOrders === 'function') renderOrders();
                }, 500);

            } catch (err) {
                hideLoading();
                console.error('[Escrow] confirmDelivery error:', err);
                showToast(t('general.error') + ': ' + err.message, 'error');
            }
        },

        // ── Open Dispute (Buyer or Seller) ────────────────────────────────────
        async openDispute(orderId) {
            const isAr = AppState.language !== 'en';
            // Physical products use the strict «عدم استلام» flow (server-side, evidence required, one report per order).
            try {
                const ps = await window.db.collection(COLLECTIONS.ORDERS).doc(orderId).get();
                const po = ps.exists ? ps.data() : null;
                if (po && window.NonReceipt && NonReceipt.isPhysical(po) && po.buyerId === AppState.currentUser?.uid) return NonReceipt.open(orderId);
            } catch (_) { /* fall through to the generic dialog */ }
            const input = await _showDisputeDialog(orderId);
            if (!input) return;

            showLoading(isAr ? 'جاري إرسال النزاع...' : 'Submitting dispute...');
            try {
                // ⚠️ ADDED: raisedByName/raisedByRole so the admin disputes tab
                // (js/dashboard.js) shows a real name + "buyer"/"seller" instead
                // of a bare uid. Also — ⚠️ FIXED: the dispute doc used to be
                // written with no buyerId/sellerId fields at all, but
                // firestore.rules' disputes read/create rules check exactly
                // those fields — dot-accessing a field that isn't on the
                // document throws in Rules, so opening AND reading back a
                // dispute was denied with "Missing or insufficient
                // permissions" every time. Fetching the order here for the
                // role/name lookup anyway, so storing buyerId/sellerId costs
                // nothing extra and fixes both rules at once.
                const uid = AppState.currentUser?.uid;
                let raisedByName = AppState.currentUser?.displayName || AppState.currentUser?.email || uid;
                let raisedByRole = '';
                let orderData = {};
                try {
                    const orderSnap = await window.db.collection(COLLECTIONS.ORDERS).doc(orderId).get();
                    orderData = orderSnap.data() || {};
                    if (orderData.buyerId === uid)  { raisedByRole = 'buyer';  raisedByName = orderData.buyerName  || raisedByName; }
                    if (orderData.sellerId === uid) { raisedByRole = 'seller'; raisedByName = orderData.sellerName || raisedByName; }
                } catch (_) { /* non-critical — falls back to uid/displayName above */ }

                const batch = window.db.batch();

                // Update order status
                const orderRef = window.db.collection(COLLECTIONS.ORDERS).doc(orderId);
                batch.update(orderRef, {
                    status:     ORDER_STATUS.DISPUTED,
                    updatedAt:  serverTimestamp(),
                });

                // Update escrow to frozen
                const escrowRef = window.db.collection(COLLECTIONS.ESCROW).doc(orderId);
                batch.update(escrowRef, {
                    status:     'frozen',
                    frozenAt:   serverTimestamp(),
                });

                // Create dispute record
                const disputeRef = window.db.collection(COLLECTIONS.DISPUTES).doc();
                batch.set(disputeRef, {
                    orderId,
                    buyerId:      orderData.buyerId  || null,
                    sellerId:     orderData.sellerId || null,
                    raisedBy:     uid,
                    raisedByName,
                    raisedByRole,
                    reason:       input.combined,
                    reasonCode:   input.reasonCode,
                    description:  input.description,
                    status:     'open',
                    adminNotes: '',
                    resolution: null,
                    createdAt:  serverTimestamp(),
                    updatedAt:  serverTimestamp(),
                });

                // Notify admin
                const adminNotif = window.db.collection(COLLECTIONS.NOTIFICATIONS).doc();
                batch.set(adminNotif, {
                    userId:    'ADMIN',
                    type:      'dispute',
                    title:     isAr ? 'نزاع جديد!' : 'New Dispute!',
                    message:   `${isAr ? 'نزاع على الطلب' : 'Dispute on order'} #${orderId.substr(-8)}`,
                    orderId,
                    read:      false,
                    createdAt: serverTimestamp(),
                });

                await batch.commit();
                hideLoading();
                showToast(t('escrow.dispute_sent'), 'success');
            } catch (err) {
                hideLoading();
                showToast(t('general.error'), 'error');
            }
        },

        // ── Admin: Resolve Dispute ────────────────────────────────────────────
        // ⚠️ FIXED: this used to move money with a client-side Firestore batch
        // — no check that the dispute/escrow wasn't already resolved (a second
        // click, or clicking "Refund" then "Pay Seller", could double-pay out
        // of the same escrow), no transaction record, no affiliate commission,
        // and a fee computed from client-cached settings that can drift from
        // the server's. Now calls functions/api/payment.js (resolveDispute),
        // which has the same status/idempotency guard as a normal escrow
        // release. See dashboard.js adminTab('disputes') for the re-render
        // that removes this dispute's buttons once it's resolved.
        async resolveDispute(disputeId, resolution, orderId) {
            // resolution: 'refund_buyer' | 'pay_seller'
            const isAr = AppState.language !== 'en';
            showLoading(isAr ? 'جاري حل النزاع...' : 'Resolving dispute...');
            try {
                const idToken = window.auth && window.auth.currentUser ? await window.auth.currentUser.getIdToken() : '';
                const resp = await fetch('/api/payment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
                    body: JSON.stringify({ action: 'resolveDispute', disputeId, orderId, resolution }),
                });
                const data = await resp.json();
                if (!resp.ok || !data.success) throw new Error(data.error || (isAr ? 'تعذر حل النزاع' : 'Could not resolve dispute'));

                hideLoading();
                showToast(isAr ? 'تم حل النزاع بنجاح' : 'Dispute resolved', 'success');

                // Refresh the disputes tab so the resolved dispute's buttons
                // disappear immediately instead of staying clickable.
                if (typeof window.adminTab === 'function') window.adminTab('disputes');
            } catch (err) {
                hideLoading();
                showToast((isAr ? 'خطأ: ' : 'Error: ') + err.message, 'error');
            }
        },

        // ── Request Refund ────────────────────────────────────────────────────
        async requestRefund(orderId) {
            await this.openDispute(orderId);
        },

        // ── Get Escrow Status ─────────────────────────────────────────────────
        async getEscrowStatus(orderId) {
            try {
                const snap = await window.db.collection(COLLECTIONS.ESCROW).doc(orderId).get();
                return snap.exists ? snap.data() : null;
            } catch (_) { return null; }
        },

        // ── Render Escrow Banner ──────────────────────────────────────────────
        renderEscrowBanner(order, containerId) {
            const container = document.getElementById(containerId);
            if (!container) return;
            const isAr   = AppState.language !== 'en';
            const isBuyer = order.buyerId === AppState.currentUser?.uid;

            const bannerMap = {
                [ORDER_STATUS.PAYMENT_HELD]: {
                    bg:   'bg-amber-50 border-amber-200',
                    icon: 'fa-shield-halved text-amber-500',
                    text: isAr ? 'الدفع محجوز في الضمان — في انتظار تنفيذ الخدمة' : 'Payment held in escrow — waiting for service delivery',
                    showConfirm: isBuyer && false,
                },
                [ORDER_STATUS.DELIVERED]: {
                    bg:   'bg-blue-50 border-blue-200',
                    icon: 'fa-box-check text-blue-500',
                    text: isAr ? 'تم تسليم الخدمة — يرجى التحقق والتأكيد' : 'Service delivered — please review and confirm',
                    showConfirm: isBuyer,
                },
                [ORDER_STATUS.DISPUTED]: {
                    bg:   'bg-red-50 border-red-200',
                    icon: 'fa-triangle-exclamation text-red-500',
                    text: isAr ? 'النزاع قيد المراجعة — الأموال مجمدة' : 'Dispute under review — funds frozen',
                    showConfirm: false,
                    sellerReply: !isBuyer,
                },
            };

            const info = bannerMap[order.status];
            if (!info) { container.innerHTML = ''; return; }

            container.innerHTML = `
              <div class="flex items-start gap-3 p-4 ${info.bg} rounded-2xl border">
                <i class="fa-solid ${info.icon} text-xl mt-0.5 flex-shrink-0"></i>
                <div class="flex-1">
                  <p class="font-bold text-gray-800">${t('escrow.held')}</p>
                  <p class="text-sm text-gray-600 mt-0.5">${info.text}</p>
                  ${info.showConfirm ? `
                    <div class="flex gap-3 mt-3 flex-wrap">
                      <button onclick="EscrowManager.confirmDelivery('${order.id}')"
                        class="btn-primary text-sm px-4 py-2">
                        <i class="fa-solid fa-check ml-1"></i>${t('escrow.confirm')}
                      </button>
                      <button onclick="EscrowManager.openDispute('${order.id}')"
                        class="btn-secondary text-sm px-4 py-2 border-red-400 text-red-600 hover:bg-red-600 hover:text-white">
                        <i class="fa-solid fa-flag ml-1"></i>${(window.NonReceipt && NonReceipt.isPhysical(order)) ? (isAr ? 'عدم استلام' : 'Not received') : t('escrow.dispute')}
                      </button>
                    </div>
                  ` : ''}
                  ${info.sellerReply && window.NonReceipt ? `<button onclick="NonReceipt.respond('${order.id}')" class="mt-3 text-sm px-4 py-2 bg-navy-800 text-white rounded-xl font-bold">${isAr ? 'رد على النزاع وإرفاق إثبات' : 'Reply with proof'}</button>` : ''}
                </div>
              </div>`;
        }
    };

    // ── Dialog Helpers ────────────────────────────────────────────────────────
    function _showConfirmDialog(title, message, confirmText) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 bg-black/70 z-[99999] flex items-center justify-center p-4';
            overlay.innerHTML = `
              <div class="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
                <div class="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i class="fa-solid fa-shield-check text-amber-600 text-2xl"></i>
                </div>
                <h3 class="text-xl font-black text-gray-900 text-center mb-3">${title}</h3>
                <p class="text-gray-600 text-center mb-6 leading-relaxed">${message}</p>
                <div class="flex gap-3">
                  <button id="dlg_cancel" class="btn-secondary flex-1 py-3">${t('general.cancel')}</button>
                  <button id="dlg_confirm" class="btn-primary flex-1 py-3">${confirmText}</button>
                </div>
              </div>`;
            document.body.appendChild(overlay);
            overlay.querySelector('#dlg_confirm').onclick = () => { overlay.remove(); resolve(true); };
            overlay.querySelector('#dlg_cancel').onclick  = () => { overlay.remove(); resolve(false); };
        });
    }

    function _showDisputeDialog(orderId) {
        const isAr = AppState.language !== 'en';
        // ⚠️ CHANGED: this used to be a single free-text box. Per Ahmed's
        // request: a real form — a structured reason (so both the other
        // party and admin instantly know the category of problem) plus a
        // free-text description of what actually happened between them.
        const REASONS = [
            { code: 'not_delivered',  ar: 'لم يتم تسليم العمل في الموعد',        en: "Work wasn't delivered on time" },
            { code: 'quality_issue',  ar: 'جودة العمل ضعيفة أو غير مطابقة',      en: 'Poor quality / not as advertised' },
            { code: 'not_as_agreed',  ar: 'العمل غير مطابق لما تم الاتفاق عليه', en: "Doesn't match what was agreed" },
            { code: 'no_response',    ar: 'الطرف الآخر لا يرد',                  en: 'The other party stopped responding' },
            { code: 'payment_issue',  ar: 'مشكلة متعلقة بالدفع أو المبلغ',       en: 'A payment/amount issue' },
            { code: 'other',          ar: 'سبب آخر',                            en: 'Other' },
        ];
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 bg-black/70 z-[99999] flex items-center justify-center p-4';
            overlay.innerHTML = `
              <div class="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 max-h-[90vh] overflow-y-auto">
                <h3 class="text-xl font-black text-gray-900 mb-2">${isAr ? 'فتح نزاع' : 'Open Dispute'}</h3>
                <p class="text-gray-500 text-sm mb-4">${isAr ? 'هيتم تجميد الأموال وإرسال كل بيانات الطلب والمحادثة للإدارة للفصل فيه' : "Funds will be frozen and the order's full details and conversation sent to the admin to review"}</p>

                <label class="text-sm font-bold text-gray-700 mb-1 block">${isAr ? 'سبب النزاع' : 'Reason for the dispute'}</label>
                <select id="disputeReasonCode" class="form-input mb-3 w-full">
                  ${REASONS.map(r => `<option value="${r.code}">${isAr ? r.ar : r.en}</option>`).join('')}
                </select>

                <label class="text-sm font-bold text-gray-700 mb-1 block">${isAr ? 'وضّح المشكلة بينك وبين الطرف الآخر' : 'Describe the problem between you and the other party'}</label>
                <textarea id="disputeReason" rows="4" class="form-input mb-4 w-full"
                  placeholder="${isAr ? 'اشرح سبب النزاع بالتفصيل...' : 'Explain the dispute reason in detail...'}"></textarea>

                <div class="flex gap-3">
                  <button id="dlg_cancel" class="btn-secondary flex-1 py-3">${t('general.cancel')}</button>
                  <button id="dlg_submit" class="btn-primary flex-1 py-3 bg-red-600">${isAr ? 'إرسال النزاع' : 'Submit Dispute'}</button>
                </div>
              </div>`;
            document.body.appendChild(overlay);
            overlay.querySelector('#dlg_submit').onclick = () => {
                const reasonCode = overlay.querySelector('#disputeReasonCode').value;
                const reasonObj  = REASONS.find(r => r.code === reasonCode) || REASONS[REASONS.length - 1];
                const description = overlay.querySelector('#disputeReason').value.trim();
                if (!description) {
                    overlay.querySelector('#disputeReason').classList.add('border-red-400');
                    showToast(isAr ? 'من فضلك اشرح المشكلة' : 'Please describe the problem', 'warning');
                    return;
                }
                overlay.remove();
                resolve({
                    reasonCode,
                    reasonLabel: isAr ? reasonObj.ar : reasonObj.en,
                    description,
                    // Combined single-line summary — kept so every existing
                    // place that just prints `dispute.reason` as plain text
                    // (dashboard.js's history list, notifications...) still
                    // reads sensibly without needing to know about the new
                    // separate reasonCode/description fields.
                    combined: `${reasonObj.ar} — ${description}`,
                });
            };
            overlay.querySelector('#dlg_cancel').onclick = () => { overlay.remove(); resolve(null); };
        });
    }

    // ── Expose ────────────────────────────────────────────────────────────────
    window.EscrowManager = EscrowManager;
    console.log('✅ EscrowManager loaded');
})();
