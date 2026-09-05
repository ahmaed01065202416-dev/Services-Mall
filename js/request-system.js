/**
 * ============================================================================
 * REQUEST-SYSTEM.JS — Service Request Flow (No Payment)
 * Opens a request modal → creates order in Firestore → opens chat workspace
 * ============================================================================
 */
(function () {
    'use strict';

    // Currently selected service for the pending request
    let _pendingService = null;

    /**
     * Open the request modal for a given service object
     * service = { id, title, price, image, sellerId, sellerName, deliveryDays }
     */
    function openRequestModal(service) {
        if (!AppState.currentUser) {
            showToast(AppState.language === 'en' ? 'Please login first' : 'يرجى تسجيل الدخول أولاً', 'warning');
            navigateTo('login');
            return;
        }
        if (!service || !service.id) { showToast('خطأ: بيانات الخدمة غير مكتملة', 'error'); return; }

        // Prevent seller from requesting their own service
        if (AppState.currentUser.uid === service.sellerId) {
            showToast(AppState.language === 'en' ? 'This is your own service' : 'لا يمكنك طلب خدمتك الخاصة', 'warning');
            return;
        }

        _pendingService = service;

        // Reset form fields
        const details  = document.getElementById('requestDetails');
        const deadline = document.getElementById('requestDeadline');
        const budget   = document.getElementById('requestBudget');
        if (details)  details.value  = '';
        if (deadline) deadline.value = '';
        if (budget)   budget.value   = '';

        // Set service name in modal header
        const nameEl = document.getElementById('requestServiceName');
        if (nameEl) nameEl.textContent = service.title || '';

        // Close service detail modal if open
        closeModal('serviceModal');
        // Open request modal
        openModal('requestServiceModal');
    }

    /**
     * Submit the request: create Firestore order → open workspace chat
     */
    async function submitRequest() {
        const service = _pendingService;
        if (!service) return;

        const user    = AppState.currentUser;
        if (!user) { showToast('يرجى تسجيل الدخول أولاً', 'warning'); return; }

        const details  = document.getElementById('requestDetails')?.value?.trim();
        const deadline = document.getElementById('requestDeadline')?.value?.trim();
        const budget   = document.getElementById('requestBudget')?.value?.trim();

        if (!details) {
            showToast('يرجى كتابة تفاصيل الطلب', 'warning');
            document.getElementById('requestDetails')?.focus();
            return;
        }

        const btn = document.getElementById('submitRequestBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الإرسال...'; }

        const isAr = AppState.language !== 'en';

        try {
            showLoading(isAr ? 'جاري إنشاء الطلب...' : 'Creating request...');

            // Build order document
            const orderId = generateId('ord_');
            const now     = serverTimestamp();

            const orderData = {
                id:            orderId,
                serviceId:     service.id,
                serviceTitle:  service.title  || '',
                serviceImage:  service.image  || '',
                sellerId:      service.sellerId  || '',
                sellerName:    service.sellerName || '',
                buyerId:       user.uid,
                buyerName:     user.displayName || user.email || 'عميل',
                buyerAvatar:   user.photoURL || '',
                price:         service.price || 0,
                deliveryDays:  service.deliveryDays || 3,
                status:        ORDER_STATUS.PENDING,
                // Request details (no payment)
                requestDetails: details,
                requestDeadline: deadline || '',
                requestBudget:   budget   || '',
                paymentStatus:  'no_payment',   // Payment disabled
                // Meta
                createdAt:     now,
                updatedAt:     now,
                lastMessageAt: now,
            };

            // Write order to Firestore
            await window.db.collection(COLLECTIONS.ORDERS).doc(orderId).set(orderData);

            // ⚠️ FIXED: the order above is already saved at this point. Below,
            // the RTDB chat message used to run un-guarded — any failure there
            // (Realtime Database not provisioned, a rules denial, a network
            // blip, an ad-blocker on firebaseio.com) threw out to the outer
            // catch, which showed "حدث خطأ حاول مرة أخرى" as if NOTHING had
            // happened. The buyer would then resubmit, creating a duplicate
            // order for a request that had actually already gone through.
            // Chat/notification failures are now non-fatal, same as the
            // notification block already correctly does below.
            try {
                // Send first system message in chat — the request details
                const systemText = [
                    isAr ? '📋 تفاصيل الطلب:' : '📋 Request Details:',
                    details,
                    deadline ? `\n⏰ ${isAr?'الميعاد:':'Deadline:'} ${deadline}` : '',
                    budget   ? `\n💰 ${isAr?'الميزانية:':'Budget:'} ${budget}`   : '',
                ].filter(Boolean).join('\n');

                // Link the buyer to this order's chat node (RTDB) before sending
                // the first message — required by database.rules.json.
                if (window.rtdb) {
                    await window.rtdb.ref(`chats/${orderId}/buyerId`).set(user.uid);
                    await window.rtdb.ref(`chats/${orderId}/messages`).push({
                        senderId:   user.uid,
                        senderName: user.displayName || user.email || 'عميل',
                        text:       systemText,
                        type:       'text',
                        readBy:     { [user.uid]: true },
                        createdAt:  firebase.database.ServerValue.TIMESTAMP,
                    });
                }
            } catch (chatErr) {
                console.error('[RequestSystem] Chat message failed (order was still created):', chatErr);
            }

            // Notify the seller
            try {
                await window.db.collection(COLLECTIONS.NOTIFICATIONS).add({
                    userId:    service.sellerId,
                    type:      'new_request',
                    title:     isAr ? 'طلب خدمة جديد 🎉' : 'New Service Request 🎉',
                    body:      isAr
                        ? `${escapeHtml(user.displayName || 'عميل')} طلب خدمة "${escapeHtml(service.title || '')}"`
                        : `${escapeHtml(user.displayName || 'Client')} requested "${escapeHtml(service.title || '')}"`,
                    orderId,
                    read:      false,
                    createdAt: now,
                });
            } catch(_) { /* notifications non-critical */ }

            hideLoading();
            closeModal('requestServiceModal');
            _pendingService = null;

            showToast(
                isAr ? 'تم إرسال طلبك! جاري فتح المحادثة...' : 'Request sent! Opening chat...',
                'success',
                3000
            );

            // Navigate to the chat workspace
            setTimeout(() => {
                if (typeof openWorkspace === 'function') {
                    openWorkspace(orderId);
                } else {
                    navigateTo('orders');
                }
            }, 600);

        } catch (err) {
            hideLoading();
            console.error('[RequestSystem]', err);
            showToast(isAr ? 'حدث خطأ، حاول مرة أخرى' : 'Error, please try again', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> إرسال الطلب وبدء المحادثة'; }
        }
    }

    // ── AI Brief Assistant ────────────────────────────────────────────────────
    function openBriefAssistant() {
        const box = document.getElementById('briefAssistantBox');
        if (box) box.classList.toggle('hidden');
    }

    async function generateBrief() {
        if (!AppState.currentUser) { showToast('يرجى تسجيل الدخول أولاً', 'warning'); return; }
        const goal    = document.getElementById('briefGoal')?.value?.trim();
        const outcome = document.getElementById('briefOutcome')?.value?.trim();
        const notes   = document.getElementById('briefNotes')?.value?.trim();
        const isAr    = AppState.language !== 'en';

        if (!goal && !outcome) {
            showToast(isAr ? 'جاوب على سؤال واحد على الأقل' : 'Answer at least one question', 'warning');
            return;
        }

        const btn = document.getElementById('briefGenBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الكتابة...'; }

        try {
            const idToken = window.auth?.currentUser ? await window.auth.currentUser.getIdToken() : '';
            const resp = await fetch('/api/ai-brief', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
                body: JSON.stringify({ goal, outcome, notes, serviceTitle: _pendingService?.title || '' }),
            });
            const data = await resp.json();
            if (!resp.ok || !data.brief) throw new Error(data.error || (isAr ? 'تعذر توليد النص' : 'Could not generate text'));

            const details = document.getElementById('requestDetails');
            if (details) details.value = data.brief;
            const box = document.getElementById('briefAssistantBox');
            if (box) box.classList.add('hidden');
            showToast(isAr ? '✅ اتكتب الطلب — تقدر تعدّل فيه براحتك' : '✅ Brief written — feel free to edit it', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-sparkles"></i> اكتب لي الطلب'; }
        }
    }

    // ── Instant product purchase — no request/approval step ───────────────────
    // ⚠️ ADDED: for listingType 'product' (ready-made digital items — templates,
    // e-books, scripts...), the buyer shouldn't have to submit a request and
    // wait for seller approval like a custom service. This creates the order
    // directly at status 'accepted' (firestore.rules only allows that for
    // listingType 'product' — see the comment there) and hands straight off to
    // the existing "pay for an accepted order" flow (PaymentSystem.payForOrder),
    // so it reuses the exact same payment/escrow/dispute protection as every
    // other order — only the request/approval step is skipped, not the
    // buyer/seller protections around the money itself.
    async function buyProductNow(service) {
        const isAr = AppState.language !== 'en';
        if (!AppState.currentUser) {
            showToast(isAr ? 'يرجى تسجيل الدخول أولاً' : 'Please login first', 'warning');
            navigateTo('login');
            return;
        }
        if (!service || !service.id) { showToast(isAr ? 'خطأ: بيانات المنتج غير مكتملة' : 'Error: incomplete product data', 'error'); return; }
        if (AppState.currentUser.uid === service.sellerId) {
            showToast(isAr ? 'لا يمكنك شراء منتجك الخاص' : "You can't buy your own product", 'warning');
            return;
        }

        const user = AppState.currentUser;
        showLoading(isAr ? 'جاري تجهيز طلبك...' : 'Preparing your order...');
        try {
            // ⚠️ ADDED: re-check stock/expiry against the LIVE service doc, not
            // the (possibly stale) card data passed in — stock can change
            // between the buyer loading the page and clicking buy.
            const svcSnap = await window.db.collection(COLLECTIONS.SERVICES).doc(service.id).get();
            const svcData = svcSnap.data();
            if (!svcData) throw new Error(isAr ? 'المنتج لم يعد متاحًا' : 'This product is no longer available');
            if (svcData.expiryDate && new Date(svcData.expiryDate) < new Date()) {
                hideLoading();
                showToast(isAr ? 'انتهى عرض هذا المنتج' : 'This product offer has expired', 'warning');
                return;
            }
            if (svcData.stockLimit != null && svcData.stockLimit <= 0) {
                hideLoading();
                showToast(isAr ? 'نفدت الكمية المتاحة من هذا المنتج' : 'This product is out of stock', 'warning');
                return;
            }

            const orderId = generateId('ord_');
            await window.db.collection(COLLECTIONS.ORDERS).doc(orderId).set({
                id: orderId,
                serviceId:     service.id,
                serviceTitle:  service.title,
                serviceImage:  service.image || '',
                image:         service.image || '',
                sellerId:      service.sellerId,
                sellerName:    service.sellerName || '',
                buyerId:       user.uid,
                buyerName:     user.displayName || user.email || '',
                buyerAvatar:   user.photoURL || '',
                price:         service.price || 0,
                deliveryDays:  service.deliveryDays || 0,
                listingType:   'product',
                status:        ORDER_STATUS.ACCEPTED,
                paymentStatus: 'no_payment',
                createdAt:     serverTimestamp(),
                updatedAt:     serverTimestamp(),
            });

            hideLoading();
            if (window.PaymentSystem) {
                await window.PaymentSystem.payForOrder(orderId);
            } else {
                navigateTo('orders');
            }
        } catch (err) {
            hideLoading();
            console.error('[RequestSystem] buyProductNow failed:', err);
            showToast(isAr ? 'حدث خطأ، حاول مرة أخرى' : 'Something went wrong, please try again', 'error');
        }
    }

    // ── Expose ────────────────────────────────────────────────────────────────
    window.RequestSystem = { openRequestModal, submitRequest, openBriefAssistant, generateBrief, buyProductNow };

    console.log('✅ RequestSystem loaded — No-payment request flow');
})();
