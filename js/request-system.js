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
    // When true, submitRequest() skips the seller-approval step: the order
    // is created already ACCEPTED and payment starts immediately (System 2:
    // "pay + brief together"). When false (default), it's the classic
    // request → seller approves → buyer pays flow (System 1).
    let _instantMode = false;

    /**
     * Open the request modal for a given service object
     * service = { id, title, price, image, sellerId, sellerName, deliveryDays }
     */
    function openRequestModal(service) {
        _instantMode = false;
        if (!_openModalCommon(service)) return;
        const title = document.getElementById('requestModalTitle');
        const info  = document.getElementById('requestModalInfo');
        const btn   = document.getElementById('submitRequestBtn');
        if (title) title.textContent = 'طلب الخدمة';
        if (info)  info.textContent  = 'اكتب تفاصيل ما تحتاجه وسيصل طلبك مباشرةً لمقدم الخدمة، ثم تنطلق المحادثة بينكما فوراً. الدفع بيبقى متاح بس بعد ما يوافق على طلبك.';
        if (btn)   btn.innerHTML     = '<i class="fa-solid fa-paper-plane"></i> إرسال الطلب وبدء المحادثة';
        openModal('requestServiceModal');
    }

    /**
     * Open the SAME modal but in "instant" mode — no approval wait: submitting
     * creates the order already accepted and takes the buyer straight to
     * payment, with their brief attached for the seller to see once paid.
     */
    function openInstantModal(service) {
        _instantMode = true;
        if (!_openModalCommon(service)) return;
        const title = document.getElementById('requestModalTitle');
        const info  = document.getElementById('requestModalInfo');
        const btn   = document.getElementById('submitRequestBtn');
        if (title) title.textContent = 'اطلب وادفع الآن';
        if (info)  info.textContent  = 'اكتب تفاصيل طلبك، وهتنتقل على طول لصفحة الدفع — البائع هيبدأ الشغل فور ما يوصله الطلب والدفع مع بعض. فلوسك هتفضل محجوزة في الضمان لحد ما تستلم وتأكد.';
        if (btn)   btn.innerHTML     = '<i class="fa-solid fa-lock"></i> إرسال الطلب والدفع الآن';
        openModal('requestServiceModal');
    }

    // Shared setup for both modal modes — validates login, resets the form,
    // fills in the service name, and stores the pending service.
    function _openModalCommon(service) {
        if (!AppState.currentUser) {
            showToast(AppState.language === 'en' ? 'Please login first' : 'يرجى تسجيل الدخول أولاً', 'warning');
            navigateTo('login');
            return false;
        }
        if (!service || !service.id) { showToast(AppState.language === 'en' ? 'Error: incomplete service data' : 'خطأ: بيانات الخدمة غير مكتملة', 'error'); return false; }

        if (AppState.currentUser.uid === service.sellerId) {
            showToast(AppState.language === 'en' ? 'This is your own service' : 'لا يمكنك طلب خدمتك الخاصة', 'warning');
            return false;
        }

        _pendingService = service;

        const details  = document.getElementById('requestDetails');
        const deadline = document.getElementById('requestDeadline');
        const budget   = document.getElementById('requestBudget');
        if (details)  details.value  = '';
        if (deadline) deadline.value = '';
        if (budget)   budget.value   = '';

        const nameEl = document.getElementById('requestServiceName');
        if (nameEl) nameEl.textContent = service.title || '';

        closeModal('serviceModal');
        return true;
    }

    /**
     * Submit the request: create Firestore order → open workspace chat
     */
    async function submitRequest() {
        const service = _pendingService;
        if (!service) return;

        const user    = AppState.currentUser;
        const isAr    = AppState.language !== 'en';
        if (!user) { showToast(isAr ? 'يرجى تسجيل الدخول أولاً' : 'Please login first', 'warning'); return; }

        const details  = document.getElementById('requestDetails')?.value?.trim();
        const deadline = document.getElementById('requestDeadline')?.value?.trim();
        const budget   = document.getElementById('requestBudget')?.value?.trim();

        if (!details) {
            showToast(isAr ? 'يرجى كتابة تفاصيل الطلب' : 'Please write the request details', 'warning');
            document.getElementById('requestDetails')?.focus();
            return;
        }

        const btn = document.getElementById('submitRequestBtn');
        const instant = _instantMode;
        if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${isAr ? (instant ? 'جاري التجهيز...' : 'جاري الإرسال...') : 'Sending...'}`; }

        try {
            showLoading(isAr ? (instant ? 'جاري إنشاء الطلب...' : 'جاري إنشاء الطلب...') : 'Creating request...');

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
                buyerName:     user.displayName || user.email || (isAr ? 'عميل' : 'Customer'),
                buyerAvatar:   user.photoURL || '',
                price:         service.price || 0,
                deliveryDays:  service.deliveryDays || 3,
                // Instant mode (System 2 — "pay + brief together"): skip the
                // approval wait, order goes straight to ACCEPTED so
                // PaymentSystem.payForOrder() can take the buyer to payment
                // immediately. Request-first mode (System 1) stays PENDING
                // until the seller explicitly accepts.
                status:        instant ? ORDER_STATUS.ACCEPTED : ORDER_STATUS.PENDING,
                // Request details (brief) — kept either way so the seller has
                // the buyer's brief once they open the order.
                requestDetails: details,
                requestDeadline: deadline || '',
                requestBudget:   budget   || '',
                orderMode:      instant ? 'instant' : 'request_first',
                createdAt:     now,
                updatedAt:     now,
                lastMessageAt: now,
            };
            if (!instant) orderData.paymentStatus = 'no_payment';

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
                // Send first message in chat — a structured request-brief card
                // (not a plain-text emoji blob) so it renders professionally,
                // consistent with the delivery-message card style.
                if (window.rtdb) {
                    await window.rtdb.ref(`chats/${orderId}/buyerId`).set(user.uid);
                    await window.rtdb.ref(`chats/${orderId}/messages`).push({
                        senderId:   user.uid,
                        senderName: user.displayName || user.email || 'عميل',
                        type:       'request_brief',
                        details,
                        deadline:   deadline || '',
                        budget:     budget || '',
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
                    type:      instant ? 'new_order' : 'new_request',
                    title:     instant ? (isAr ? '💰 طلب جديد مدفوع!' : '💰 New paid order!') : (isAr ? 'طلب خدمة جديد' : 'New Service Request'),
                    body:      instant
                        ? (isAr ? `${escapeHtml(user.displayName || 'عميل')} دفع وطلب خدمة "${escapeHtml(service.title || '')}" — تقدر تبدأ التنفيذ`
                                : `${escapeHtml(user.displayName || 'Client')} paid for "${escapeHtml(service.title || '')}" — you can start work`)
                        : (isAr ? `${escapeHtml(user.displayName || 'عميل')} طلب خدمة "${escapeHtml(service.title || '')}"`
                                : `${escapeHtml(user.displayName || 'Client')} requested "${escapeHtml(service.title || '')}"`),
                    orderId,
                    read:      false,
                    createdAt: now,
                });
            } catch(_) { /* notifications non-critical */ }

            hideLoading();
            closeModal('requestServiceModal');
            _pendingService = null;
            _instantMode = false;

            if (instant) {
                showToast(isAr ? 'تم إنشاء الطلب — انتقل للدفع الآن' : 'Order created — proceeding to payment', 'success', 2500);
                setTimeout(() => {
                    if (window.PaymentSystem) window.PaymentSystem.payForOrder(orderId);
                    else navigateTo('orders');
                }, 400);
                return;
            }

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
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = instant
                    ? '<i class="fa-solid fa-lock"></i> إرسال الطلب والدفع الآن'
                    : `<i class="fa-solid fa-paper-plane"></i> ${isAr ? 'إرسال الطلب وبدء المحادثة' : 'Send request & start chat'}`;
            }
        }
    }

    // ── AI Brief Assistant ────────────────────────────────────────────────────
    function openBriefAssistant() {
        const box = document.getElementById('briefAssistantBox');
        if (box) box.classList.toggle('hidden');
    }

    async function generateBrief() {
        const isAr    = AppState.language !== 'en';
        if (!AppState.currentUser) { showToast(isAr ? 'يرجى تسجيل الدخول أولاً' : 'Please login first', 'warning'); return; }
        const goal    = document.getElementById('briefGoal')?.value?.trim();
        const outcome = document.getElementById('briefOutcome')?.value?.trim();
        const notes   = document.getElementById('briefNotes')?.value?.trim();

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
            if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fa-solid fa-sparkles"></i> ${isAr ? 'اكتب لي الطلب' : 'Write it for me'}`; }
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

    // ── Product order form (buyer details + seller rules + platform terms) ──
    // Replaces the old buyProductNow() direct-to-payment flow: now the buyer
    // fills in shipping/contact details and must agree to the platform's
    // terms + the seller's own rules (if the seller wrote any) before the
    // order is created and payment opens. The actual order creation and
    // payment handoff below reuse buyProductNow()'s logic (stock/expiry
    // re-check against the live doc, ORDER_STATUS.ACCEPTED, straight to
    // PaymentSystem.payForOrder) — only the extra buyer-info collection step
    // in front of it is new.
    let _pendingProduct = null;

    function openProductOrderModal(service) {
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

        _pendingProduct = service;

        const nameEl = document.getElementById('productOrderName');
        if (nameEl) nameEl.textContent = service.title || '';

        const rulesBox  = document.getElementById('productSellerRulesBox');
        const rulesText = document.getElementById('productSellerRulesText');
        if (service.orderRules && service.orderRules.trim()) {
            if (rulesText) rulesText.textContent = service.orderRules;
            if (rulesBox)  rulesBox.classList.remove('hidden');
        } else if (rulesBox) {
            rulesBox.classList.add('hidden');
        }

        // ⚠️ ADDED: render the seller's enabled structured fields (size,
        // color, warranty...) as real dropdowns/text inputs instead of
        // leaving everything to the free-text notes box below.
        const fieldsContainer = document.getElementById('productStructuredFields');
        const fields = Array.isArray(service.structuredFields) ? service.structuredFields : [];
        if (fieldsContainer) {
            fieldsContainer.innerHTML = fields.map(f => `
              <div>
                <label class="block text-sm font-black text-gray-700 mb-2">${escapeHtml(f.label)} <span class="text-red-500">*</span></label>
                ${f.type === 'select' && f.options?.length ? `
                  <select class="form-input w-full text-sm" data-field-key="${escapeHtml(f.key)}" data-field-label="${escapeHtml(f.label)}">
                    <option value="">${isAr ? '-- اختر --' : '-- Select --'}</option>
                    ${f.options.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('')}
                  </select>`
                : `<input type="text" class="form-input w-full text-sm" data-field-key="${escapeHtml(f.key)}" data-field-label="${escapeHtml(f.label)}" placeholder="${escapeHtml(f.label)}">`}
              </div>`).join('');
        }

        // Pre-fill name/phone from the user's profile if available, but
        // always let them edit — the shipping name isn't always the account
        // name (gifts, family orders, etc.).
        const nameField  = document.getElementById('productBuyerName');
        const phoneField = document.getElementById('productBuyerPhone');
        const addrField  = document.getElementById('productBuyerAddress');
        const notesField = document.getElementById('productBuyerNotes');
        const agreeBox   = document.getElementById('productAgreeRules');
        if (nameField)  nameField.value  = AppState.currentUser.displayName || '';
        if (phoneField) phoneField.value = AppState.currentUser.phone || '';
        if (addrField)  addrField.value  = '';
        if (notesField) notesField.value = '';
        if (agreeBox)   agreeBox.checked = false;

        openModal('productOrderModal');
    }

    async function submitProductOrder() {
        const service = _pendingProduct;
        if (!service) return;
        const isAr = AppState.language !== 'en';
        const user = AppState.currentUser;
        if (!user) { showToast(isAr ? 'يرجى تسجيل الدخول أولاً' : 'Please login first', 'warning'); return; }

        const fullName = document.getElementById('productBuyerName')?.value?.trim();
        const phone    = document.getElementById('productBuyerPhone')?.value?.trim();
        const address  = document.getElementById('productBuyerAddress')?.value?.trim();
        const notes    = sanitizeInput(document.getElementById('productBuyerNotes')?.value?.trim() || '', 500);
        const agreed   = document.getElementById('productAgreeRules')?.checked;

        // ⚠️ ADDED: every structured field (size/color/etc.) the seller
        // enabled for this product is required — an order with a picked
        // color but no size (for example) is exactly the ambiguity this
        // feature exists to prevent.
        const fieldInputs = Array.from(document.querySelectorAll('#productStructuredFields [data-field-key]'));
        const selectedFields = {};
        for (const el of fieldInputs) {
            const val = el.value?.trim();
            if (!val) {
                showToast(isAr ? `اختر "${el.dataset.fieldLabel}"` : `Choose "${el.dataset.fieldLabel}"`, 'warning');
                el.focus();
                return;
            }
            selectedFields[el.dataset.fieldKey] = { label: el.dataset.fieldLabel, value: sanitizeInput(val, 100) };
        }

        if (!fullName)  { showToast(isAr ? 'اكتب الاسم بالكامل' : 'Enter your full name', 'warning'); document.getElementById('productBuyerName')?.focus(); return; }
        if (!phone)     { showToast(isAr ? 'اكتب رقم الهاتف' : 'Enter your phone number', 'warning'); document.getElementById('productBuyerPhone')?.focus(); return; }
        if (!address)   { showToast(isAr ? 'اكتب عنوان التوصيل بالكامل' : 'Enter your full delivery address', 'warning'); document.getElementById('productBuyerAddress')?.focus(); return; }
        if (!agreed)    { showToast(isAr ? 'يجب الموافقة على شروط المنصة والبائع أولاً' : 'You must agree to the platform and seller terms first', 'warning'); return; }

        const btn = document.getElementById('submitProductOrderBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${isAr ? 'جاري تجهيز طلبك...' : 'Preparing your order...'}`; }

        showLoading(isAr ? 'جاري إنشاء الطلب...' : 'Creating your order...');
        try {
            // Re-check stock/expiry against the LIVE doc, not the (possibly
            // stale) card data — same protection buyProductNow() had.
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
            const shippingInfo = { fullName: sanitizeInput(fullName, 120), phone: sanitizeInput(phone, 30), address: sanitizeInput(address, 500), notes };
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
                shippingStatus: 'processing',
                paymentStatus: 'no_payment',
                shippingInfo,
                selectedFields: selectedFields,
                sellerOrderRules: svcData.orderRules || '',
                createdAt:     serverTimestamp(),
                updatedAt:     serverTimestamp(),
            });

            // Post the buyer's shipping details as the first chat message —
            // same "structured brief card" pattern as service requests, so
            // the seller sees it immediately in the order workspace chat.
            try {
                if (window.rtdb) {
                    await window.rtdb.ref(`chats/${orderId}/buyerId`).set(user.uid);
                    await window.rtdb.ref(`chats/${orderId}/messages`).push({
                        senderId:   user.uid,
                        senderName: user.displayName || user.email || (isAr ? 'عميل' : 'Customer'),
                        type:       'product_order_brief',
                        fullName: shippingInfo.fullName, phone: shippingInfo.phone,
                        address: shippingInfo.address, notes: shippingInfo.notes,
                        selectedFields: Object.values(selectedFields).map(f => `${f.label}: ${f.value}`).join(' · '),
                        readBy:     { [user.uid]: true },
                        createdAt:  firebase.database.ServerValue.TIMESTAMP,
                    });
                }
            } catch (chatErr) {
                console.error('[RequestSystem] Product order chat message failed (order was still created):', chatErr);
            }

            hideLoading();
            closeModal('productOrderModal');
            if (window.PaymentSystem) {
                await window.PaymentSystem.payForOrder(orderId);
            } else {
                navigateTo('orders');
            }
        } catch (err) {
            hideLoading();
            if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fa-solid fa-lock"></i> ${isAr ? 'تأكيد الطلب والدفع' : 'Confirm order & pay'}`; }
            console.error('[RequestSystem] submitProductOrder failed:', err);
            showToast(err.message || (isAr ? 'حدث خطأ، حاول مرة أخرى' : 'Something went wrong, please try again'), 'error');
        }
    }

    // ── Expose ────────────────────────────────────────────────────────────────
    window.RequestSystem = { openRequestModal, openInstantModal, submitRequest, openBriefAssistant, generateBrief, buyProductNow, openProductOrderModal, submitProductOrder };

    console.log('✅ RequestSystem loaded — No-payment request flow');
})();
