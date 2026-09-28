/**
 * ============================================================================
 * RETURNS.JS — Product Return Requests
 * Buyer requests a return on a PRODUCT order → Seller approves/rejects
 * (seller-dashboard "Returns" tab) → an approved return on an order whose
 * escrow is still held is escalated through the EXISTING dispute/admin-refund
 * flow (functions/api/payment.js resolveDispute) instead of moving money
 * itself — this file never touches wallets/escrow balances directly, it only
 * ever opens a dispute the same way js/escrow.js EscrowManager.openDispute()
 * already does, so it stays inside the app's one guarded money path.
 * ============================================================================
 */
(function () {
    'use strict';

    // ── Return reasons (shown to the buyer, stored as a code + localized label) ─
    const REASONS = [
        { code: 'not_as_described', ar: 'المنتج غير مطابق للوصف',        en: 'Not as described' },
        { code: 'defective',        ar: 'المنتج معيب أو وصل تالف',       en: 'Defective / arrived damaged' },
        { code: 'wrong_item',       ar: 'استلمت منتج مختلف عن المطلوب',   en: 'Received the wrong item' },
        { code: 'changed_mind',     ar: 'غيّرت رأيي / المنتج ملهوش لازمة', en: "Changed my mind / didn't like it" },
        { code: 'other',            ar: 'سبب آخر',                       en: 'Other' },
    ];

    function _reasonLabel(code, isAr) {
        const r = REASONS.find(x => x.code === code);
        return r ? (isAr ? r.ar : r.en) : code;
    }

    // ── Safe date coercion (mirrors the pattern used across dashboard.js etc.) ──
    function _toDate(ts) {
        if (!ts) return null;
        if (ts.toDate) return ts.toDate();
        if (ts.seconds) return new Date(ts.seconds * 1000);
        const d = new Date(ts);
        return isNaN(d.getTime()) ? null : d;
    }

    function _daysSince(ts) {
        const d = _toDate(ts);
        if (!d) return Infinity; // no timestamp on record → don't block on window
        return (Date.now() - d.getTime()) / 86400000;
    }

    const ReturnsManager = {

        REASONS,
        reasonLabel: _reasonLabel,

        // ── Can this buyer request a return on this order right now? ───────────
        // Returns { ok:true } or { ok:false, reasonAr, reasonEn }.
        eligibility(order, activeReturn) {
            if (!PLATFORM.RETURNS_ENABLED) {
                return { ok: false, reasonAr: 'ميزة الاسترجاع متوقفة حاليًا من إدارة المنصة', reasonEn: 'Returns are currently disabled by the platform admin' };
            }
            // Physical products only (order.shippingInfo is only set for
            // non-digital products — see js/request-system.js buyProductNow).
            // A digitally-delivered product (a link/file) can't be "returned".
            if (!order || order.listingType !== 'product' || !order.shippingInfo) {
                return { ok: false, reasonAr: 'الاسترجاع متاح للمنتجات المشحونة فعليًا فقط', reasonEn: 'Returns are only available for physically-shipped products' };
            }
            if (![ORDER_STATUS.DELIVERED, ORDER_STATUS.COMPLETED].includes(order.status)) {
                return { ok: false, reasonAr: 'الاسترجاع متاح بعد استلام المنتج فقط', reasonEn: 'Returns are only available after the product is delivered' };
            }
            if (activeReturn && [RETURN_STATUS.PENDING, RETURN_STATUS.APPROVED].includes(activeReturn.status)) {
                return { ok: false, reasonAr: 'يوجد طلب استرجاع مفتوح بالفعل على هذا الطلب', reasonEn: 'A return request is already open for this order' };
            }
            // 0 (or unset) means the admin has left the window uncapped.
            const windowDays = Number(PLATFORM.RETURN_WINDOW_DAYS) || 0;
            if (windowDays > 0) {
                const anchor = order.deliveredAt || order.updatedAt || order.createdAt;
                if (_daysSince(anchor) > windowDays) {
                    return {
                        ok: false,
                        reasonAr: `مدة الاسترجاع (${windowDays} يوم من التسليم) انتهت`,
                        reasonEn: `The ${windowDays}-day return window has passed`,
                    };
                }
            }
            return { ok: true };
        },

        // ── Fetch the most recent return request for an order (or null) ────────
        async getReturnForOrder(orderId) {
            try {
                const snap = await window.db.collection(COLLECTIONS.RETURNS)
                    .where('orderId', '==', orderId).get();
                if (snap.empty) return null;
                const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                return rows[0];
            } catch (err) {
                console.warn('[Returns] getReturnForOrder failed:', err.message);
                return null;
            }
        },

        // ── BUYER: open the request dialog and submit ───────────────────────────
        async requestReturn(orderId) {
            const isAr = AppState.language !== 'en';
            const user = AppState.currentUser;
            if (!user) { showToast(t('general.login_req'), 'warning'); return; }

            showLoading(isAr ? 'جاري التحقق من الطلب...' : 'Checking order...');
            let order;
            try {
                const snap = await window.db.collection(COLLECTIONS.ORDERS).doc(orderId).get();
                if (!snap.exists) { hideLoading(); showToast(isAr ? 'الطلب غير موجود' : 'Order not found', 'error'); return; }
                order = { id: snap.id, ...snap.data() };
            } catch (err) {
                hideLoading();
                showToast(isAr ? 'تعذّر تحميل الطلب' : 'Could not load the order', 'error');
                return;
            }
            if (order.buyerId !== user.uid) { hideLoading(); return; }

            const activeReturn = await this.getReturnForOrder(orderId);
            const check = this.eligibility(order, activeReturn);
            hideLoading();
            if (!check.ok) { showToast(isAr ? check.reasonAr : check.reasonEn, 'warning'); return; }

            const input = await _showReturnDialog(order, isAr);
            if (!input) return;

            showLoading(isAr ? 'جاري إرسال طلب الاسترجاع...' : 'Submitting return request...');
            try {
                let photo = '';
                if (input.photoFile) {
                    try { photo = await uploadFile(input.photoFile, 'returns', `${orderId}_${Date.now()}`); }
                    catch (e) { /* non-fatal — submit the return without the photo */ }
                }

                const returnRef = window.db.collection(COLLECTIONS.RETURNS).doc();
                await returnRef.set({
                    orderId,
                    serviceId:    order.serviceId  || '',
                    serviceTitle: order.serviceTitle || '',
                    image:        order.image || '',
                    price:        order.price || 0,
                    buyerId:      order.buyerId,
                    buyerName:    order.buyerName || user.displayName || user.email || '',
                    sellerId:     order.sellerId || '',
                    sellerName:   order.sellerName || '',
                    reasonCode:   input.reasonCode,
                    reasonLabel:  _reasonLabel(input.reasonCode, true), // stored in Arabic (platform's primary language) alongside the code for locale-independent lookups
                    description:  input.description,
                    photo,
                    orderStatusAtRequest: order.status,
                    status:       RETURN_STATUS.PENDING,
                    sellerNote:   '',
                    createdAt:    serverTimestamp(),
                    updatedAt:    serverTimestamp(),
                });

                if (order.sellerId) {
                    await window.db.collection(COLLECTIONS.NOTIFICATIONS).add({
                        userId: order.sellerId, type: 'return_requested',
                        title: isAr ? '📦 طلب استرجاع منتج جديد' : '📦 New product return request',
                        message: `${escapeHtml(order.buyerName || '')} ${isAr ? 'طلب استرجاع' : 'requested a return for'} "${order.serviceTitle || ''}"`,
                        orderId, read: false, createdAt: serverTimestamp(),
                    });
                }

                hideLoading();
                showToast(isAr ? '✅ تم إرسال طلب الاسترجاع للبائع' : '✅ Return request sent to the seller', 'success');
                if (typeof window.openWorkspace === 'function') window.openWorkspace(orderId);
            } catch (err) {
                hideLoading();
                console.error('[Returns] requestReturn failed:', err);
                showToast((isAr ? 'تعذّر إرسال الطلب: ' : 'Could not submit: ') + err.message, 'error');
            }
        },

        // ── SELLER: approve a return ─────────────────────────────────────────────
        // If the order's escrow is still held (status === 'delivered' — the buyer
        // hasn't confirmed receipt / funds haven't been released yet), this opens
        // a normal dispute exactly like EscrowManager.openDispute() so an admin
        // finalizes the refund through the existing, guarded server endpoint.
        // If the escrow was already released (order already 'completed'), there
        // is no safe client-side way to reverse a seller's wallet balance, so the
        // return is marked approved and an admin is notified to process the
        // refund manually — this app never lets the browser move money on its
        // own (see functions/api/payment.js comments throughout).
        async approveReturn(returnId) {
            const isAr = AppState.language !== 'en';
            const user = AppState.currentUser;
            if (!user) return;

            const confirmed = await _showConfirmDialog(
                isAr ? 'الموافقة على الاسترجاع' : 'Approve return',
                isAr ? 'هيتم تحويل هذا الطلب لمراجعة الإدارة لإتمام استرداد المبلغ للعميل. متأكد؟'
                     : "This will be sent for admin review to refund the buyer. Are you sure?",
                isAr ? 'نعم، موافقة' : 'Yes, approve'
            );
            if (!confirmed) return;

            showLoading(isAr ? 'جاري تنفيذ الموافقة...' : 'Processing approval...');
            try {
                const retSnap = await window.db.collection(COLLECTIONS.RETURNS).doc(returnId).get();
                if (!retSnap.exists) { hideLoading(); showToast(isAr ? 'طلب الاسترجاع غير موجود' : 'Return request not found', 'error'); return; }
                const ret = { id: retSnap.id, ...retSnap.data() };
                if (ret.sellerId !== user.uid) { hideLoading(); return; }
                if (ret.status !== RETURN_STATUS.PENDING) { hideLoading(); showToast(isAr ? 'تم اتخاذ قرار في هذا الطلب بالفعل' : 'This request was already decided', 'warning'); return; }

                const orderSnap = await window.db.collection(COLLECTIONS.ORDERS).doc(ret.orderId).get();
                const order = orderSnap.exists ? { id: orderSnap.id, ...orderSnap.data() } : null;

                const canAutoDispute = order && order.status === ORDER_STATUS.DELIVERED;

                if (canAutoDispute) {
                    const batch = window.db.batch();
                    batch.update(window.db.collection(COLLECTIONS.ORDERS).doc(ret.orderId), {
                        status: ORDER_STATUS.DISPUTED, updatedAt: serverTimestamp(),
                    });
                    batch.update(window.db.collection(COLLECTIONS.ESCROW).doc(ret.orderId), {
                        status: 'frozen', frozenAt: serverTimestamp(),
                    });
                    const disputeRef = window.db.collection(COLLECTIONS.DISPUTES).doc();
                    batch.set(disputeRef, {
                        orderId: ret.orderId,
                        buyerId: ret.buyerId, sellerId: ret.sellerId,
                        raisedBy: user.uid, raisedByName: order.sellerName || user.displayName || user.email || '', raisedByRole: 'seller',
                        reason: `${isAr ? 'موافقة البائع على استرجاع منتج' : "Seller approved a product return"} — ${_reasonLabel(ret.reasonCode, true)}: ${ret.description || ''}`.slice(0, 800),
                        source: 'return', returnId: ret.id,
                        status: 'open', adminNotes: '', resolution: null,
                        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
                    });
                    batch.set(window.db.collection(COLLECTIONS.NOTIFICATIONS).doc(), {
                        userId: 'ADMIN', type: 'dispute',
                        title: isAr ? '📦 استرجاع منتج بحاجة لاعتماد الاسترداد' : '📦 Product return needs refund approval',
                        message: `${isAr ? 'نزاع على الطلب' : 'Dispute on order'} #${ret.orderId.substr(-8)}`,
                        orderId: ret.orderId, read: false, createdAt: serverTimestamp(),
                    });
                    batch.update(window.db.collection(COLLECTIONS.RETURNS).doc(returnId), {
                        status: RETURN_STATUS.APPROVED, sellerNote: '',
                        disputeId: disputeRef.id, updatedAt: serverTimestamp(), resolvedAt: serverTimestamp(),
                    });
                    await batch.commit();

                    await window.db.collection(COLLECTIONS.NOTIFICATIONS).add({
                        userId: ret.buyerId, type: 'return_approved',
                        title: isAr ? '✅ تمت الموافقة على طلب الاسترجاع' : '✅ Your return request was approved',
                        message: isAr ? 'تم تحويل طلبك لمراجعة الإدارة لإتمام استرداد المبلغ' : 'Your order was sent for admin review to complete the refund',
                        orderId: ret.orderId, read: false, createdAt: serverTimestamp(),
                    });
                } else {
                    // Escrow already released to the seller's wallet — needs a
                    // manual admin adjustment, there is no automated path for it.
                    await window.db.collection(COLLECTIONS.RETURNS).doc(returnId).update({
                        status: RETURN_STATUS.APPROVED, sellerNote: '',
                        needsManualRefund: true, updatedAt: serverTimestamp(), resolvedAt: serverTimestamp(),
                    });
                    await window.db.collection(COLLECTIONS.NOTIFICATIONS).add({
                        userId: 'ADMIN', type: 'return_manual_refund',
                        title: isAr ? '⚠️ استرجاع منتج يحتاج استرداد يدوي' : '⚠️ Product return needs a manual refund',
                        message: `${isAr ? 'الطلب' : 'Order'} #${ret.orderId.substr(-8)} — ${isAr ? 'الأموال كانت اتحولت للبائع بالفعل، محتاجة تعديل يدوي في محفظة العميل' : "Funds were already released to the seller — needs a manual buyer-wallet adjustment"}`,
                        orderId: ret.orderId, read: false, createdAt: serverTimestamp(),
                    });
                    await window.db.collection(COLLECTIONS.NOTIFICATIONS).add({
                        userId: ret.buyerId, type: 'return_approved',
                        title: isAr ? '✅ تمت الموافقة على طلب الاسترجاع' : '✅ Your return request was approved',
                        message: isAr ? 'هيتم التواصل معك لإتمام الاسترداد من فريق الإدارة' : 'Our admin team will contact you to complete the refund',
                        orderId: ret.orderId, read: false, createdAt: serverTimestamp(),
                    });
                }

                hideLoading();
                showToast(isAr ? '✅ تمت الموافقة على الاسترجاع' : '✅ Return approved', 'success');
                if (typeof window.SellerDash?.tab === 'function') window.SellerDash.tab('returns');
            } catch (err) {
                hideLoading();
                console.error('[Returns] approveReturn failed:', err);
                showToast((isAr ? 'تعذّر تنفيذ الموافقة: ' : 'Could not approve: ') + err.message, 'error');
            }
        },

        // ── SELLER: reject a return ──────────────────────────────────────────────
        async rejectReturn(returnId) {
            const isAr = AppState.language !== 'en';
            const user = AppState.currentUser;
            if (!user) return;

            const note = await _showRejectDialog(isAr);
            if (note === null) return;

            showLoading(isAr ? 'جاري الرفض...' : 'Rejecting...');
            try {
                const retSnap = await window.db.collection(COLLECTIONS.RETURNS).doc(returnId).get();
                if (!retSnap.exists) { hideLoading(); return; }
                const ret = { id: retSnap.id, ...retSnap.data() };
                if (ret.sellerId !== user.uid) { hideLoading(); return; }
                if (ret.status !== RETURN_STATUS.PENDING) { hideLoading(); showToast(isAr ? 'تم اتخاذ قرار في هذا الطلب بالفعل' : 'This request was already decided', 'warning'); return; }

                await window.db.collection(COLLECTIONS.RETURNS).doc(returnId).update({
                    status: RETURN_STATUS.REJECTED, sellerNote: note,
                    updatedAt: serverTimestamp(), resolvedAt: serverTimestamp(),
                });
                await window.db.collection(COLLECTIONS.NOTIFICATIONS).add({
                    userId: ret.buyerId, type: 'return_rejected',
                    title: isAr ? '❌ تم رفض طلب الاسترجاع' : '❌ Your return request was declined',
                    message: note || (isAr ? 'راجع طلبك لمعرفة رد البائع' : "Check your order for the seller's response"),
                    orderId: ret.orderId, read: false, createdAt: serverTimestamp(),
                });

                hideLoading();
                showToast(isAr ? 'تم رفض طلب الاسترجاع' : 'Return request rejected', 'success');
                if (typeof window.SellerDash?.tab === 'function') window.SellerDash.tab('returns');
            } catch (err) {
                hideLoading();
                console.error('[Returns] rejectReturn failed:', err);
                showToast((isAr ? 'تعذّر الرفض: ' : 'Could not reject: ') + err.message, 'error');
            }
        },

        // ── SELLER DASHBOARD: list this seller's return requests ────────────────
        async loadSellerReturns(sellerId) {
            const snap = await window.db.collection(COLLECTIONS.RETURNS).where('sellerId', '==', sellerId).get();
            const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            return rows;
        },

        // ── Small status badge used both in the workspace sidebar and the
        //    seller-dashboard Returns tab ───────────────────────────────────────
        statusBadge(status, isAr) {
            const map = {
                pending:  { label: isAr ? 'قيد المراجعة' : 'Pending review',  cls: 'bg-amber-100 text-amber-800' },
                approved: { label: isAr ? 'تمت الموافقة' : 'Approved',        cls: 'bg-green-100 text-green-700' },
                rejected: { label: isAr ? 'مرفوض'         : 'Rejected',       cls: 'bg-red-100 text-red-700' },
            };
            const cfg = map[status] || map.pending;
            return `<span class="text-xs font-black px-2.5 py-1 rounded-full ${cfg.cls}">${cfg.label}</span>`;
        },

        // ── Sidebar card rendered inside the order workspace ─────────────────────
        // Called from js/order-workspace.js with the order + the (possibly null)
        // most-recent return record for it.
        renderWorkspaceCard(order, activeReturn, isBuyer, isSeller, isAr) {
            if (order.listingType !== 'product' || !order.shippingInfo) return '';

            const hasOpenReturn = activeReturn && [RETURN_STATUS.PENDING, RETURN_STATUS.APPROVED].includes(activeReturn.status);
            const check = this.eligibility(order, activeReturn);

            let html = '';

            // Existing return record (any status) — show its details
            if (activeReturn) {
                html += `
                <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <div class="flex items-center justify-between gap-2 mb-3">
                    <h3 class="font-black text-gray-900 flex items-center gap-2">
                      <i class="fa-solid fa-rotate-left text-amber-500"></i>${isAr ? 'طلب استرجاع المنتج' : 'Product return request'}
                    </h3>
                    ${this.statusBadge(activeReturn.status, isAr)}
                  </div>
                  <p class="text-sm text-gray-700 mb-1"><strong>${isAr ? 'السبب:' : 'Reason:'}</strong> ${escapeHtml(_reasonLabel(activeReturn.reasonCode, isAr))}</p>
                  ${activeReturn.description ? `<p class="text-sm text-gray-600 whitespace-pre-wrap mb-2">${escapeHtml(activeReturn.description)}</p>` : ''}
                  ${activeReturn.photo ? `<img src="${activeReturn.photo}" class="rounded-xl border border-gray-100 max-h-40 object-cover mb-2">` : ''}

                  ${activeReturn.status === RETURN_STATUS.PENDING ? `
                    <p class="text-xs text-gray-400 mb-3">${isAr ? 'بانتظار رد البائع على الطلب' : "Awaiting the seller's response"}</p>
                    ${isSeller ? `
                    <div class="flex gap-2">
                      <button onclick="ReturnsManager.approveReturn('${activeReturn.id}')" class="flex-1 text-sm font-bold bg-green-600 text-white py-2.5 rounded-xl hover:bg-green-700 transition">
                        <i class="fa-solid fa-check"></i> ${isAr ? 'موافقة' : 'Approve'}
                      </button>
                      <button onclick="ReturnsManager.rejectReturn('${activeReturn.id}')" class="flex-1 text-sm font-bold border-2 border-red-400 text-red-600 py-2.5 rounded-xl hover:bg-red-600 hover:text-white transition">
                        <i class="fa-solid fa-xmark"></i> ${isAr ? 'رفض' : 'Reject'}
                      </button>
                    </div>` : ''}
                  ` : activeReturn.status === RETURN_STATUS.APPROVED ? `
                    <p class="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
                      ${activeReturn.needsManualRefund
                        ? (isAr ? 'تمت الموافقة — سيتواصل فريق الإدارة لإتمام الاسترداد.' : 'Approved — the admin team will follow up to complete the refund.')
                        : (isAr ? 'تمت الموافقة — تم تحويل الطلب لمراجعة الإدارة لإتمام الاسترداد.' : 'Approved — the order was sent for admin review to complete the refund.')}
                    </p>
                  ` : `
                    ${activeReturn.sellerNote ? `<p class="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-1"><strong>${isAr ? 'رد البائع:' : "Seller's note:"}</strong> ${escapeHtml(activeReturn.sellerNote)}</p>` : ''}
                  `}
                </div>`;
            }

            // Buyer entry point to open a (new) request — hidden while one is open
            if (isBuyer && !hasOpenReturn) {
                if (check.ok) {
                    html += `
                    <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                      <h3 class="font-black text-gray-900 mb-2 flex items-center gap-2">
                        <i class="fa-solid fa-box-open text-amber-500"></i>${isAr ? 'مش عاجبك المنتج؟' : "Don't like the product?"}
                      </h3>
                      <p class="text-sm text-gray-500 mb-3">${isAr ? 'تقدر تطلب استرجاعه وهيتم مراجعة الطلب من البائع.' : 'You can request a return — the seller will review your request.'}</p>
                      <button onclick="ReturnsManager.requestReturn('${order.id}')" class="w-full py-3 text-sm font-bold border-2 border-amber-400 text-amber-700 rounded-2xl hover:bg-amber-500 hover:text-white transition flex items-center justify-center gap-2">
                        <i class="fa-solid fa-rotate-left"></i>${isAr ? 'طلب استرجاع المنتج' : 'Request a return'}
                      </button>
                    </div>`;
                } else if (activeReturn && activeReturn.status === RETURN_STATUS.REJECTED) {
                    // already shown the rejection card above — nothing else to add
                }
            }

            return html;
        },
    };

    // ── Return-request dialog (reason + description + optional photo) ──────────
    function _showReturnDialog(order, isAr) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 bg-black/70 z-[99999] flex items-center justify-center p-4';
            overlay.innerHTML = `
              <div class="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 max-h-[90vh] overflow-y-auto">
                <h3 class="text-xl font-black text-gray-900 mb-1">${isAr ? 'طلب استرجاع المنتج' : 'Request a product return'}</h3>
                <p class="text-gray-500 text-sm mb-4">${isAr ? `هيتم إرسال طلبك للبائع للمراجعة${PLATFORM.RETURN_WINDOW_DAYS > 0 ? ` — عندك ${PLATFORM.RETURN_WINDOW_DAYS} يوم من تاريخ التسليم لطلب الاسترجاع` : ''}.` : `Your request goes to the seller for review${PLATFORM.RETURN_WINDOW_DAYS > 0 ? ` — you have ${PLATFORM.RETURN_WINDOW_DAYS} days from delivery to request a return` : ''}.`}</p>

                <label class="text-sm font-bold text-gray-700 mb-1 block">${isAr ? 'سبب الاسترجاع' : 'Reason for return'}</label>
                <select id="retReasonCode" class="form-input mb-3 w-full">
                  ${REASONS.map(r => `<option value="${r.code}">${isAr ? r.ar : r.en}</option>`).join('')}
                </select>

                <label class="text-sm font-bold text-gray-700 mb-1 block">${isAr ? 'تفاصيل إضافية' : 'More details'}</label>
                <textarea id="retDescription" rows="4" class="form-input mb-3 w-full"
                  placeholder="${isAr ? 'اشرح المشكلة بالتفصيل...' : 'Explain the issue in detail...'}"></textarea>

                <label class="text-sm font-bold text-gray-700 mb-1 block">${isAr ? 'صورة للمنتج (اختياري)' : 'Photo of the product (optional)'}</label>
                <input type="file" id="retPhoto" accept="image/*" class="form-input mb-4 w-full text-sm">

                <div class="flex gap-3">
                  <button id="dlg_cancel" class="btn-secondary flex-1 py-3">${t('general.cancel')}</button>
                  <button id="dlg_submit" class="btn-primary flex-1 py-3">${isAr ? 'إرسال الطلب' : 'Submit request'}</button>
                </div>
              </div>`;
            document.body.appendChild(overlay);

            overlay.querySelector('#dlg_submit').onclick = () => {
                const reasonCode  = overlay.querySelector('#retReasonCode').value;
                const description = overlay.querySelector('#retDescription').value.trim();
                const photoInput  = overlay.querySelector('#retPhoto');
                const photoFile   = photoInput.files && photoInput.files[0] ? photoInput.files[0] : null;
                if (!description) {
                    overlay.querySelector('#retDescription').classList.add('border-red-400');
                    showToast(isAr ? 'من فضلك اكتب تفاصيل الطلب' : 'Please describe the issue', 'warning');
                    return;
                }
                overlay.remove();
                resolve({ reasonCode, description, photoFile });
            };
            overlay.querySelector('#dlg_cancel').onclick = () => { overlay.remove(); resolve(null); };
        });
    }

    // ── Reject-reason dialog (seller note) ──────────────────────────────────────
    function _showRejectDialog(isAr) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 bg-black/70 z-[99999] flex items-center justify-center p-4';
            overlay.innerHTML = `
              <div class="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
                <h3 class="text-xl font-black text-gray-900 mb-2">${isAr ? 'رفض طلب الاسترجاع' : 'Reject return request'}</h3>
                <p class="text-gray-500 text-sm mb-4">${isAr ? 'اشرح للعميل سبب الرفض' : 'Explain to the buyer why you are rejecting this'}</p>
                <textarea id="rejNote" rows="4" class="form-input mb-4 w-full" placeholder="${isAr ? 'سبب الرفض...' : 'Reason for rejection...'}"></textarea>
                <div class="flex gap-3">
                  <button id="dlg_cancel" class="btn-secondary flex-1 py-3">${t('general.cancel')}</button>
                  <button id="dlg_submit" class="btn-primary flex-1 py-3 bg-red-600">${isAr ? 'تأكيد الرفض' : 'Confirm rejection'}</button>
                </div>
              </div>`;
            document.body.appendChild(overlay);
            overlay.querySelector('#dlg_submit').onclick = () => {
                const note = overlay.querySelector('#rejNote').value.trim();
                overlay.remove();
                resolve(note || '—');
            };
            overlay.querySelector('#dlg_cancel').onclick = () => { overlay.remove(); resolve(null); };
        });
    }

    // Small local confirm dialog (kept identical in look to js/escrow.js's
    // internal one, which isn't exposed globally).
    function _showConfirmDialog(title, message, confirmText) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 bg-black/70 z-[99999] flex items-center justify-center p-4';
            overlay.innerHTML = `
              <div class="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
                <div class="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i class="fa-solid fa-rotate-left text-amber-600 text-2xl"></i>
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

    // ── Expose ────────────────────────────────────────────────────────────────
    window.ReturnsManager = ReturnsManager;
    console.log('✅ ReturnsManager loaded');
})();
