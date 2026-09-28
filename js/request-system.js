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

            // Send first system message in chat — the request details
            const systemText = [
                isAr ? '📋 تفاصيل الطلب:' : '📋 Request Details:',
                details,
                deadline ? `\n⏰ ${isAr?'الميعاد:':'Deadline:'} ${deadline}` : '',
                budget   ? `\n💰 ${isAr?'الميزانية:':'Budget:'} ${budget}`   : '',
            ].filter(Boolean).join('\n');

            await window.db.collection(COLLECTIONS.MESSAGES).add({
                orderId,
                senderId:   user.uid,
                senderName: user.displayName || user.email || 'عميل',
                text:       systemText,
                type:       'text',
                readBy:     [user.uid],
                createdAt:  now,
            });

            // Notify the seller
            try {
                await window.db.collection(COLLECTIONS.NOTIFICATIONS).add({
                    userId:    service.sellerId,
                    type:      'new_request',
                    title:     isAr ? 'طلب خدمة جديد 🎉' : 'New Service Request 🎉',
                    body:      isAr
                        ? `${user.displayName || 'عميل'} طلب خدمة "${service.title || ''}"`
                        : `${user.displayName || 'Client'} requested "${service.title || ''}"`,
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

    // ── Expose ────────────────────────────────────────────────────────────────
    window.RequestSystem = { openRequestModal, submitRequest };

    console.log('✅ RequestSystem loaded — No-payment request flow');
})();
