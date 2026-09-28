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
                isAr ? 'بعد التأكيد، سيتم تحويل الأموال للبائع ولا يمكن الاسترداد بعدها. هل تأكدت من استلام الخدمة كاملاً؟'
                     : 'After confirmation, funds will be released to the seller and cannot be refunded. Have you fully received the service?',
                isAr ? 'نعم، تأكيد الاستلام' : 'Yes, Confirm Delivery'
            );
            if (!confirmed) return;

            showLoading(isAr ? 'جاري تحويل الأموال للبائع...' : 'Releasing funds to seller...');
            try {
                const batch = window.db.batch();

                // Update order
                const orderRef = window.db.collection(COLLECTIONS.ORDERS).doc(orderId);
                batch.update(orderRef, {
                    status:           ORDER_STATUS.COMPLETED,
                    completedAt:      serverTimestamp(),
                    escrowReleased:   true,
                    updatedAt:        serverTimestamp(),
                });

                // Update escrow
                const escrowRef = window.db.collection(COLLECTIONS.ESCROW).doc(orderId);
                const escrowSnap = await escrowRef.get();

                if (escrowSnap.exists) {
                    const escrow = escrowSnap.data();
                    batch.update(escrowRef, {
                        status:      'released',
                        releasedAt:  serverTimestamp(),
                    });

                    // Credit seller wallet
                    const platformFee = calcPlatformFee(escrow.amount);
                    const sellerAmount = Number((escrow.amount - platformFee).toFixed(2));

                    const sellerWalletRef = window.db.collection(COLLECTIONS.WALLET).doc(escrow.sellerId);
                    batch.set(sellerWalletRef, {
                        balance:    increment(sellerAmount),
                        updatedAt:  serverTimestamp(),
                    }, { merge: true });

                    // Transaction record
                    const txRef = window.db.collection(COLLECTIONS.TRANSACTIONS).doc();
                    batch.set(txRef, {
                        userId:     escrow.sellerId,
                        type:       'earning',
                        amount:     sellerAmount,
                        platformFee,
                        orderId,
                        description: isAr ? 'أرباح من طلب مكتمل' : 'Earnings from completed order',
                        status:     'completed',
                        createdAt:  serverTimestamp(),
                    });

                    // Notify seller
                    const notifRef = window.db.collection(COLLECTIONS.NOTIFICATIONS).doc();
                    batch.set(notifRef, {
                        userId:    escrow.sellerId,
                        type:      'payment_received',
                        title:     isAr ? 'تم استلام الأموال!' : 'Payment Received!',
                        message:   `${isAr ? 'تم تحويل' : 'Received'} ${formatCurrency(sellerAmount)} ${isAr ? 'لمحفظتك' : 'to your wallet'}`,
                        orderId,
                        read:      false,
                        createdAt: serverTimestamp(),
                    });
                }

                await batch.commit();
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
            const reason = await _showDisputeDialog(orderId);
            if (!reason) return;

            showLoading(isAr ? 'جاري إرسال النزاع...' : 'Submitting dispute...');
            try {
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
                    raisedBy:   AppState.currentUser?.uid,
                    reason,
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
        async resolveDispute(disputeId, resolution, orderId) {
            // resolution: 'refund_buyer' | 'pay_seller' | 'split'
            const isAr = AppState.language !== 'en';
            showLoading(isAr ? 'جاري حل النزاع...' : 'Resolving dispute...');
            try {
                const escrowSnap = await window.db.collection(COLLECTIONS.ESCROW).doc(orderId).get();
                const escrow     = escrowSnap.data() || {};
                const batch      = window.db.batch();

                if (resolution === 'refund_buyer') {
                    // Refund buyer
                    const buyerWallet = window.db.collection(COLLECTIONS.WALLET).doc(escrow.buyerId);
                    batch.set(buyerWallet, { balance: increment(escrow.amount), updatedAt: serverTimestamp() }, { merge: true });
                    batch.update(window.db.collection(COLLECTIONS.ORDERS).doc(orderId), { status: ORDER_STATUS.REFUNDED, updatedAt: serverTimestamp() });
                    batch.update(window.db.collection(COLLECTIONS.ESCROW).doc(orderId), { status: 'refunded', resolvedAt: serverTimestamp() });

                } else if (resolution === 'pay_seller') {
                    // Release to seller
                    const platformFee  = calcPlatformFee(escrow.amount);
                    const sellerAmount = Number((escrow.amount - platformFee).toFixed(2));
                    const sellerWallet = window.db.collection(COLLECTIONS.WALLET).doc(escrow.sellerId);
                    batch.set(sellerWallet, { balance: increment(sellerAmount), updatedAt: serverTimestamp() }, { merge: true });
                    batch.update(window.db.collection(COLLECTIONS.ORDERS).doc(orderId), { status: ORDER_STATUS.COMPLETED, updatedAt: serverTimestamp() });
                    batch.update(window.db.collection(COLLECTIONS.ESCROW).doc(orderId), { status: 'released', resolvedAt: serverTimestamp() });
                }

                batch.update(window.db.collection(COLLECTIONS.DISPUTES).doc(disputeId), {
                    status:     'resolved',
                    resolution,
                    resolvedAt: serverTimestamp(),
                    resolvedBy: AppState.currentUser?.uid,
                });

                await batch.commit();
                hideLoading();
                showToast(isAr ? 'تم حل النزاع بنجاح' : 'Dispute resolved', 'success');
            } catch (err) {
                hideLoading();
                showToast(t('general.error'), 'error');
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
                        <i class="fa-solid fa-flag ml-1"></i>${t('escrow.dispute')}
                      </button>
                    </div>
                  ` : ''}
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
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 bg-black/70 z-[99999] flex items-center justify-center p-4';
            overlay.innerHTML = `
              <div class="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
                <h3 class="text-xl font-black text-gray-900 mb-2">${isAr ? 'فتح نزاع' : 'Open Dispute'}</h3>
                <p class="text-gray-500 text-sm mb-4">${isAr ? 'سيتم تجميد الأموال وإعلام الأدمن' : 'Funds will be frozen and admin will be notified'}</p>
                <textarea id="disputeReason" rows="4" class="form-input mb-4"
                  placeholder="${isAr ? 'اشرح سبب النزاع بالتفصيل...' : 'Explain the dispute reason in detail...'}"></textarea>
                <div class="flex gap-3">
                  <button id="dlg_cancel" class="btn-secondary flex-1 py-3">${t('general.cancel')}</button>
                  <button id="dlg_submit" class="btn-primary flex-1 py-3 bg-red-600">${isAr ? 'إرسال النزاع' : 'Submit Dispute'}</button>
                </div>
              </div>`;
            document.body.appendChild(overlay);
            overlay.querySelector('#dlg_submit').onclick = () => {
                const reason = overlay.querySelector('#disputeReason').value.trim();
                overlay.remove();
                resolve(reason || '—');
            };
            overlay.querySelector('#dlg_cancel').onclick = () => { overlay.remove(); resolve(null); };
        });
    }

    // ── Expose ────────────────────────────────────────────────────────────────
    window.EscrowManager = EscrowManager;
    console.log('✅ EscrowManager loaded');
})();
