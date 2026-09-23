/**
 * ============================================================================
 * ORDER-WORKSPACE.JS — Mall Services Platform v3.4
 * Real-time Chat · File Transfer · Delivery · Timeline · Reviews
 * FIX: serverTimestamp safe usage · improved chat UI · file type icons
 * ============================================================================
 */
(function () {
    'use strict';

    let _currentOrderId = null;
    let _lastLoadedMessages = [];
    let _messagesChangeSubscribers = [];
    function _notifyMessagesChanged() { _messagesChangeSubscribers.forEach(fn => { try { fn(); } catch (_) {} }); }
    function _onMessagesChange(fn) {
        _messagesChangeSubscribers.push(fn);
        return () => { _messagesChangeSubscribers = _messagesChangeSubscribers.filter(f => f !== fn); };
    }
    let _chatListener   = null;
    let _selectedRating = 0;
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB — images only (get compressed down)
    const NON_IMAGE_FILE_LIMIT = 6 * 1024 * 1024; // 6 MB — matches uploadFile()'s real cap (RTDB's 10MB string limit after base64 inflation)

    // ── Safe timestamp helper ─────────────────────────────────────────────────
    function _ts() {
        try { return firebase.firestore.FieldValue.serverTimestamp(); }
        catch(e) { return new Date(); }
    }

    // ── Open Workspace ────────────────────────────────────────────────────────
    async function openWorkspace(orderId) {
        if (!AppState.currentUser) {
            showToast(t('general.login_req'), 'warning');
            navigateTo('login');
            return;
        }
        _currentOrderId = orderId;
        // ⚠️ FIXED (found in audit): this reset used to live inside
        // _startChatListener(), which runs AFTER _renderWorkspace() (which
        // calls _loadFiles(), which subscribes to message-list updates via
        // _onMessagesChange() so the Files tab can refresh live). That order
        // meant _startChatListener() was wiping out the Files tab's
        // subscription the moment it ran — so a file sent in chat WOULD
        // stream in via child_added, but the Files tab had already lost its
        // listener and never found out. Resetting here, before anything else
        // in this function runs, guarantees a clean slate for this order
        // without erasing a subscription registered later in the same
        // workspace-open sequence.
        _lastLoadedMessages = [];
        _messagesChangeSubscribers = [];
        showLoading(AppState.language === 'en' ? 'Loading workspace...' : 'جاري تحميل مساحة العمل...');
        try {
            const snap = await window.db.collection(COLLECTIONS.ORDERS).doc(orderId).get();
            if (!snap.exists) {
                hideLoading();
                showToast(AppState.language === 'en' ? 'Order not found' : 'الطلب غير موجود', 'error');
                return;
            }
            const order = { id: snap.id, ...snap.data() };
            AppState.currentOrder = order;
            await _linkChatParticipant(orderId, order, AppState.currentUser.uid);
            _renderWorkspace(order);
            navigateTo('workspace');
            // ⚠️ ADDED: encode the order id in the URL so a refresh (or a
            // shared/bookmarked link) can deep-link straight back into this
            // workspace instead of landing on a blank page — see handleHash().
            try { history.replaceState({ page: 'workspace', orderId }, '', `#workspace-${orderId}`); } catch (_) {}
            hideLoading();
            _startChatListener(orderId);
        } catch (err) {
            hideLoading();
            console.error('[Workspace] open error:', err);
            showToast(t('general.error'), 'error');
        }
    }

    // ── Render Workspace ──────────────────────────────────────────────────────
    function _renderWorkspace(order) {
        const page = document.getElementById('page-workspace');
        if (!page) return;

        const isAr    = AppState.language !== 'en';
        const userId  = AppState.currentUser?.uid;
        const isBuyer  = order.buyerId  === userId;
        const isSeller = order.sellerId === userId;
        const isAdmin  = AppState.currentUser?.role === 'admin';
        const orderId  = order.id;

        page.innerHTML = `
        <div class="min-h-screen bg-gray-50">

          <!-- ── Top Bar ─────────────────────────────────────────────────── -->
          <div class="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-40 shadow-sm">
            <div class="max-w-6xl mx-auto flex items-center gap-4">
              <button onclick="navigateTo('orders')"
                class="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-gray-600 hover:bg-gray-200 transition">
                <i class="fa-solid fa-arrow-${isAr ? 'right' : 'left'}"></i>
              </button>
              <div class="flex-1 min-w-0">
                <h1 class="font-black text-gray-900 truncate">${escapeHtml(order.serviceTitle || t('orders.workspace'))}</h1>
                <p class="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                  <span class="font-mono">#${orderId.substr(-8).toUpperCase()}</span>
                  <span>·</span>
                  <span>${isBuyer
                    ? (isAr ? 'البائع: ' : 'Seller: ') + (order.sellerName || '—')
                    : (isAr ? 'المشتري: ' : 'Buyer: ')  + (order.buyerName  || '—')
                  }</span>
                </p>
              </div>
              <span class="status-badge ${getStatusClass(order.status)} flex-shrink-0">
                ${getStatusText(order.status)}
              </span>
              ${isAdmin ? `
              <div class="flex gap-1.5 flex-shrink-0 border-s border-gray-200 ps-3">
                <button onclick="window.AdminActions.deleteOrderOrChat('${orderId}','chat').then(ok=>ok&&navigateTo('orders'))"
                  title="${isAr?'حذف الشات فقط (أدمن)':'Delete chat only (admin)'}"
                  class="w-9 h-9 bg-amber-50 text-amber-700 rounded-xl flex items-center justify-center hover:bg-amber-100 transition">
                  <i class="fa-solid fa-comment-slash"></i>
                </button>
                <button onclick="window.AdminActions.deleteOrderOrChat('${orderId}','order').then(ok=>ok&&navigateTo('orders'))"
                  title="${isAr?'حذف الطلب نهائيًا (أدمن)':'Delete order permanently (admin)'}"
                  class="w-9 h-9 bg-red-50 text-red-700 rounded-xl flex items-center justify-center hover:bg-red-100 transition">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </div>` : ''}
            </div>
          </div>

          <!-- ── Main Grid ──────────────────────────────────────────────── -->
          <div class="max-w-6xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-6">

            <!-- ── Chat Panel ─────────────────────────────────────────── -->
            <div class="lg:col-span-2 flex flex-col">

              <!-- Escrow banner -->
              <div id="escrowBannerWS" class="mb-4"></div>

              <!-- Tabs -->
              <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col" style="height:72vh">

                <!-- Tab buttons -->
                <div class="flex border-b border-gray-200 bg-gray-50 flex-shrink-0">
                  ${_tab('chat',     'orders.chat',     'fa-message')}
                  ${_tab('files',    'orders.files',    'fa-folder-open')}
                  ${_tab('timeline', 'orders.timeline', 'fa-timeline')}
                </div>

                <!-- ── CHAT TAB ────────────────────────────────────────── -->
                <div id="ws-tab-chat" class="flex flex-col flex-1 overflow-hidden">

                  <!-- Messages container -->
                  <div id="chatMessages" class="flex-1 overflow-y-auto p-4 space-y-3 scroll-smooth">
                    <div class="text-center text-gray-400 py-10">
                      <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 opacity-40"></i>
                      <p class="text-sm">${isAr ? 'جاري تحميل المحادثة...' : 'Loading conversation...'}</p>
                    </div>
                  </div>

                  <!-- Typing indicator -->
                  <div id="typingIndicator" class="hidden px-4 pb-2">
                    <div class="flex items-center gap-2 text-xs text-gray-400">
                      <div class="flex gap-1">
                        <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                        <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:.15s"></span>
                        <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:.3s"></span>
                      </div>
                      <span>${isAr ? 'يكتب...' : 'typing...'}</span>
                    </div>
                  </div>

                  <!-- Input area -->
                  <div class="border-t border-gray-200 p-4 bg-white flex-shrink-0">
                    <div class="flex gap-2 items-end">
                      <div class="flex-1">
                        <textarea id="chatInput" rows="2"
                          class="form-input resize-none text-base w-full rounded-2xl border-gray-300 focus:border-navy-500 focus:ring-2 focus:ring-navy-100 px-4 py-3 leading-relaxed"
                          style="min-height:52px;max-height:160px"
                          placeholder="${t('orders.send_msg')}"
                          onkeydown="OrderWorkspace.handleChatKeydown(event)"
                          oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,160)+'px'"></textarea>
                      </div>
                      <div class="flex gap-2 flex-shrink-0">
                        <!-- Attach file -->
                        <label class="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-gray-600 hover:bg-navy-100 hover:text-navy-600 transition cursor-pointer"
                          title="${isAr ? 'إرفاق ملف' : 'Attach file'}">
                          <i class="fa-solid fa-paperclip"></i>
                          <input type="file" class="hidden" onchange="OrderWorkspace.sendFile(this)" multiple accept="*/*">
                        </label>
                        <!-- Image attach -->
                        <label class="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-gray-600 hover:bg-blue-100 hover:text-blue-600 transition cursor-pointer"
                          title="${isAr ? 'إرفاق صورة' : 'Attach image'}">
                          <i class="fa-solid fa-image"></i>
                          <input type="file" class="hidden" onchange="OrderWorkspace.sendFile(this)" multiple accept="image/*">
                        </label>
                        <!-- Send -->
                        <button onclick="OrderWorkspace.sendMessage()"
                          class="w-10 h-10 bg-secondary text-white rounded-xl flex items-center justify-center hover:bg-secondary-600 transition active:scale-95">
                          <i class="fa-solid fa-paper-plane"></i>
                        </button>
                      </div>
                    </div>
                    <p class="text-xs text-gray-400 mt-1">${isAr ? 'Enter للإرسال · Shift+Enter للسطر الجديد · حد الملف 50MB' : 'Enter to send · Shift+Enter for new line · Max file 50MB'}</p>
                  </div>
                </div>

                <!-- ── FILES TAB ──────────────────────────────────────── -->
                <div id="ws-tab-files" class="hidden flex-1 overflow-y-auto p-4">
                  <div class="flex items-center justify-between mb-4">
                    <h3 class="font-black text-gray-900">${isAr ? 'الملفات المشتركة' : 'Shared Files'}</h3>
                    <span class="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full" id="filesCount">—</span>
                  </div>
                  <div id="filesList" class="space-y-3">
                    <div class="text-center text-gray-400 py-10">
                      <i class="fa-solid fa-folder-open text-5xl mb-3 opacity-30"></i>
                      <p class="font-bold">${isAr ? 'لا توجد ملفات بعد' : 'No files yet'}</p>
                      <p class="text-sm mt-1">${isAr ? 'الملفات المرسلة في المحادثة ستظهر هنا' : 'Files shared in chat will appear here'}</p>
                    </div>
                  </div>
                </div>

                <!-- ── TIMELINE TAB ───────────────────────────────────── -->
                <div id="ws-tab-timeline" class="hidden flex-1 overflow-y-auto p-4">
                  <div id="orderTimeline"></div>
                </div>

              </div>
            </div>

            <!-- ── Sidebar ────────────────────────────────────────────── -->
            <div class="space-y-4">

              <!-- Order Details -->
              <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 class="font-black text-gray-900 mb-4 flex items-center gap-2">
                  <i class="fa-solid fa-receipt text-navy-600"></i>
                  ${isAr ? 'تفاصيل الطلب' : 'Order Details'}
                </h3>
                <div class="space-y-3 text-sm">
                  <div class="flex justify-between">
                    <span class="text-gray-500">${t('orders.id')}</span>
                    <span class="font-mono font-bold text-xs">#${orderId.substr(-8).toUpperCase()}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">${t('orders.date')}</span>
                    <span class="font-bold">${formatDateAr(order.createdAt)}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">${isAr ? 'المبلغ' : 'Amount'}</span>
                    <span class="font-black text-navy-700">${formatCurrency(order.price || 0)}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">${isAr ? 'نوع الطلب' : 'Order Type'}</span>
                    <span class="font-bold text-green-600">${isAr ? 'طلب مباشر' : 'Direct Request'}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">${isBuyer ? (isAr ? 'البائع' : 'Seller') : (isAr ? 'المشتري' : 'Buyer')}</span>
                    <span class="font-bold">${escapeHtml(isBuyer ? (order.sellerName || '—') : (order.buyerName || '—'))}</span>
                  </div>
                </div>
              </div>

              <!-- ⚠️ ADDED: the buyer's brief (custom service requests) and the
                   buyer's shipping details (product orders) used to live ONLY
                   as a one-off card inside the scrollable chat — if that chat
                   got long, was cleared, or just scrolled past, the seller had
                   no other way to see what was ordered. This mirrors that same
                   info permanently in the sidebar so it never "disappears". -->
              ${order.listingType === 'product' && order.shippingInfo ? `
              <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 class="font-black text-gray-900 mb-3 flex items-center gap-2">
                  <i class="fa-solid fa-box text-turquoise-600"></i>
                  ${isAr ? 'بيانات الشحن والطلب' : 'Shipping & order details'}
                </h3>
                <div class="space-y-2 text-sm">
                  <div class="flex items-start gap-2"><i class="fa-solid fa-user w-4 text-gray-400 mt-0.5"></i><span class="font-bold text-gray-800">${escapeHtml(order.shippingInfo.fullName || '—')}</span></div>
                  <div class="flex items-start gap-2" dir="ltr"><i class="fa-solid fa-phone w-4 text-gray-400 mt-0.5"></i><span class="font-bold text-gray-800">${escapeHtml(order.shippingInfo.phone || '—')}</span></div>
                  <div class="flex items-start gap-2"><i class="fa-solid fa-location-dot w-4 text-gray-400 mt-0.5"></i><span class="text-gray-700 whitespace-pre-wrap">${escapeHtml(order.shippingInfo.address || '—')}</span></div>
                  ${order.selectedFields && Object.keys(order.selectedFields).length ? `
                  <div class="border-t border-gray-100 pt-2 mt-2 flex flex-wrap gap-1.5">
                    ${Object.values(order.selectedFields).map(f => `<span class="bg-gray-100 text-gray-700 text-xs font-bold px-2.5 py-1 rounded-full">${escapeHtml(f.label)}: ${escapeHtml(f.value)}</span>`).join('')}
                  </div>` : ''}
                  ${order.shippingInfo.notes ? `<div class="border-t border-gray-100 pt-2 mt-2 flex items-start gap-2"><i class="fa-solid fa-note-sticky w-4 text-gray-400 mt-0.5"></i><span class="text-gray-600 whitespace-pre-wrap">${escapeHtml(order.shippingInfo.notes)}</span></div>` : ''}
                </div>
              </div>
              ` : ''}
              ${order.listingType !== 'product' && order.requestDetails ? `
              <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 class="font-black text-gray-900 mb-3 flex items-center gap-2">
                  <i class="fa-solid fa-file-lines text-navy-600"></i>
                  ${isAr ? 'تفاصيل الطلب المرسلة' : 'Submitted request details'}
                </h3>
                <p class="text-sm text-gray-700 whitespace-pre-wrap break-words mb-2">${_linkify(escapeHtml(order.requestDetails))}</p>
                <div class="flex flex-col gap-1 text-xs text-gray-500 border-t border-gray-100 pt-2">
                  ${order.requestDeadline ? `<span><i class="fa-regular fa-clock w-4"></i> ${isAr?'الميعاد:':'Deadline:'} ${escapeHtml(order.requestDeadline)}</span>` : ''}
                  ${order.requestBudget ? `<span><i class="fa-solid fa-sack-dollar w-4"></i> ${isAr?'الميزانية:':'Budget:'} ${escapeHtml(order.requestBudget)}</span>` : ''}
                </div>
              </div>
              ` : ''}

              <!-- ⚠️ ADDED: seller-defined stage tracker — separate from the
                   automatic status timeline below. Lets the seller describe
                   exactly what step of THEIR work the order is at, in their
                   own words (e.g. "مراجعة أولى", "تعديلات") — the automatic
                   timeline only tracks the big lifecycle states (accepted →
                   delivered → completed), not granular in-progress work.
                   Only relevant for services (products are instant). -->
              ${order.listingType !== 'product' && [ORDER_STATUS.ACCEPTED, ORDER_STATUS.PAYMENT_HELD, ORDER_STATUS.IN_PROGRESS].includes(order.status) ? _renderStageTracker(order, isSeller, isAr) : ''}
              ${order.listingType === 'product' && order.shippingInfo && ![ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED].includes(order.status) ? _renderShippingTracker(order, isSeller, isAr) : ''}

              <!-- ── SELLER: Accept/Reject a custom request (before any payment) ── -->
              ${isSeller && order.status === ORDER_STATUS.PENDING && order.paymentStatus === 'no_payment' ? `
              <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 class="font-black text-gray-900 mb-3 flex items-center gap-2">
                  <i class="fa-solid fa-circle-question text-amber-500"></i>
                  ${isAr ? 'طلب جديد بانتظار موافقتك' : 'New request awaiting your response'}
                </h3>
                <p class="text-sm text-gray-500 mb-4">
                  ${isAr ? 'راجع تفاصيل الطلب في المحادثة، وبعد موافقتك هتظهر بوابة الدفع للعميل — والفلوس هتتحجز في الموقع لحد ما تسلّم وتتأكد الاستلام.' : 'Review the request details in the chat. Once you accept, the payment gateway appears for the buyer — funds are held here until you deliver and the buyer confirms.'}
                </p>
                <div class="flex gap-3">
                  <button onclick="OrderWorkspace.respondToRequest('${orderId}','accept')"
                    class="btn-primary flex-1 py-3 text-sm flex items-center justify-center gap-2">
                    <i class="fa-solid fa-check"></i>${isAr ? 'قبول الطلب' : 'Accept Request'}
                  </button>
                  <button onclick="OrderWorkspace.respondToRequest('${orderId}','reject')"
                    class="btn-secondary flex-1 py-3 text-sm border-red-300 text-red-600 hover:bg-red-600 hover:text-white flex items-center justify-center gap-2">
                    <i class="fa-solid fa-xmark"></i>${isAr ? 'رفض' : 'Decline'}
                  </button>
                </div>
              </div>
              ` : ''}

              <!-- ── BUYER: waiting for seller to accept ─────────────────── -->
              ${isBuyer && order.status === ORDER_STATUS.PENDING && order.paymentStatus === 'no_payment' ? `
              <div class="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center gap-3">
                <i class="fa-solid fa-hourglass-half text-amber-500 text-xl"></i>
                <p class="text-sm text-amber-700 font-bold">
                  ${isAr ? 'بانتظار موافقة البائع على طلبك — هتقدر تدفع أول ما يوافق' : 'Waiting for the seller to accept your request — you can pay once they do'}
                </p>
              </div>
              ` : ''}

              <!-- ── BUYER: seller accepted — pay now (funds held in escrow) ── -->
              ${isBuyer && order.status === ORDER_STATUS.ACCEPTED ? `
              <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 class="font-black text-gray-900 mb-3 flex items-center gap-2">
                  <i class="fa-solid fa-shield-check text-green-600"></i>
                  ${isAr ? 'البائع وافق على طلبك!' : 'The seller accepted your request!'}
                </h3>
                <p class="text-sm text-gray-500 mb-4">
                  ${isAr ? 'ادفع دلوقتي — فلوسك هتتحجز في الموقع ومش هتتحول للبائع إلا بعد ما تتأكد إنك استلمت الخدمة.' : 'Pay now — your money is held on the platform and only released to the seller once you confirm you received the service.'}
                </p>
                <button onclick="PaymentSystem.payForOrder('${orderId}')"
                  class="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2">
                  <i class="fa-solid fa-lock"></i>${isAr ? 'ادفع الآن' : 'Pay Now'}
                </button>
              </div>
              ` : ''}

              <!-- ── SELLER: accepted, waiting on buyer to pay ───────────── -->
              ${isSeller && order.status === ORDER_STATUS.ACCEPTED ? `
              <div class="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center gap-3">
                <i class="fa-solid fa-hourglass-half text-amber-500 text-xl"></i>
                <p class="text-sm text-amber-700 font-bold">
                  ${isAr ? 'وافقت على الطلب — بانتظار دفع العميل. هتقدر تسلّم بعد ما تتحول حالة الطلب لمدفوع.' : 'You accepted — waiting for the buyer to pay. You can deliver once the order is marked paid.'}
                </p>
              </div>
              ` : ''}

              <!-- ── SELLER: Delivery Panel ───────────────────────────── -->
              <!-- ⚠️ FIXED (per Ahmed's feedback): this used to render for the
                   seller regardless of order.status, so a seller could deliver
                   (and the buyer could be marked "delivered") on a request that
                   was never paid — PENDING or ACCEPTED, before PAYMENT_HELD.
                   Now only shown once the buyer has actually paid. -->
              ${isSeller && (order.status === ORDER_STATUS.PAYMENT_HELD || order.status === ORDER_STATUS.IN_PROGRESS || order.status === ORDER_STATUS.REVISION) ? `
              <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 class="font-black text-gray-900 mb-4 flex items-center gap-2">
                  <i class="fa-solid fa-box-open text-purple-600"></i>
                  ${t('orders.deliver')}
                </h3>
                <p class="text-sm text-gray-500 mb-4">
                  ${isAr ? 'ارفع ملفاتك النهائية وأرسل رسالة التسليم للعميل' : 'Upload your final files and send a delivery message to the client'}
                </p>

                <!-- Drop zone -->
                <div id="deliveryDropZone"
                  class="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-navy-400 hover:bg-navy-50 transition cursor-pointer mb-3"
                  onclick="document.getElementById('deliveryFiles').click()"
                  ondragover="event.preventDefault();this.classList.add('border-navy-500','bg-navy-50')"
                  ondragleave="this.classList.remove('border-navy-500','bg-navy-50')"
                  ondrop="event.preventDefault();this.classList.remove('border-navy-500','bg-navy-50');OrderWorkspace.handleDeliveryDrop(event)">
                  <i class="fa-solid fa-cloud-arrow-up text-3xl text-gray-400 mb-2"></i>
                  <p class="text-sm text-gray-500 font-bold">${isAr ? 'اسحب الملفات هنا أو انقر للاختيار' : 'Drag files here or click to browse'}</p>
                  <p class="text-xs text-gray-400 mt-1">${isAr ? 'الحد الأقصى 50MB لكل ملف' : 'Max 50MB per file'}</p>
                  <input type="file" id="deliveryFiles" multiple class="hidden" accept="*/*"
                    onchange="OrderWorkspace.previewDeliveryFiles(this)">
                </div>

                <div id="deliveryFilesList" class="space-y-2 mb-3"></div>

                <textarea id="deliveryNote" rows="3" class="form-input text-sm mb-3 w-full"
                  placeholder="${isAr ? 'رسالة التسليم للعميل (اختياري إذا رفعت ملفات)...' : 'Delivery note to client (optional if files are uploaded)...'}"></textarea>

                <button onclick="OrderWorkspace.deliverService()"
                  class="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2">
                  <i class="fa-solid fa-box-open"></i>
                  ${t('orders.deliver')}
                </button>
              </div>
              ` : ''}

              <!-- ── BUYER: Send Instructions & Files (right after payment) ── -->
              ${isBuyer && (order.status === ORDER_STATUS.PAYMENT_HELD || order.status === ORDER_STATUS.IN_PROGRESS) ? `
              <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 class="font-black text-gray-900 mb-3 flex items-center gap-2">
                  <i class="fa-solid fa-paper-plane text-navy-600"></i>
                  ${isAr ? 'أرسل تعليماتك للبائع' : 'Send Instructions to Seller'}
                </h3>
                <p class="text-xs text-gray-500 mb-3">
                  ${isAr ? 'اشرح للبائع بالتفصيل ما تريده، ويمكنك إرفاق ملفات أو صور' : 'Explain what you need in detail and attach any files or images'}
                </p>

                <!-- Delivery deadline info -->
                ${order.deliveryDeadline ? `<div class="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 flex items-center gap-2 text-xs">
                  <i class="fa-solid fa-clock text-amber-600"></i>
                  <span class="text-amber-700 font-bold">${isAr ? 'موعد التسليم: ' : 'Delivery by: '}${new Date(order.deliveryDeadline).toLocaleDateString('ar-EG',{month:'short',day:'numeric',year:'numeric'})}</span>
                </div>` : ''}

                <textarea id="buyerInstructions" rows="4" class="form-input text-sm mb-3 w-full resize-none"
                  placeholder="${isAr ? 'اكتب تعليماتك هنا... مثال: أريد تصميم شعار باللون الأزرق مع اسم...' : 'Write your instructions... e.g. I want a blue logo with the name...'}">${order.buyerInstructions || ''}</textarea>

                <!-- File upload -->
                <div class="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center mb-3 hover:border-navy-400 hover:bg-navy-50 transition cursor-pointer"
                  onclick="document.getElementById('buyer-files-input').click()">
                  <i class="fa-solid fa-cloud-arrow-up text-2xl text-gray-400 mb-1 block"></i>
                  <p class="text-xs text-gray-500 font-bold">${isAr ? 'ارفع ملفات (صور، PDF، ZIP، فيديو) — حد 50MB' : 'Upload files (images, PDF, ZIP, video) — max 50MB'}</p>
                  <input type="file" id="buyer-files-input" multiple class="hidden" accept="*/*"
                    onchange="OrderWorkspace.previewBuyerFiles(this)">
                </div>
                <div id="buyer-files-preview" class="space-y-2 mb-3"></div>

                <button onclick="OrderWorkspace.sendBuyerInstructions('${orderId}')"
                  class="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2">
                  <i class="fa-solid fa-paper-plane"></i>
                  ${isAr ? 'إرسال التعليمات والملفات' : 'Send Instructions & Files'}
                </button>
              </div>
              ` : ''}

              <!-- ── Instant digital delivery content (auto-delivered products) ──
                   ⚠️ ADDED: order.digitalDelivery (the link/file the seller attached
                   to the listing) was being saved on the order by
                   functions/api/payment.js at auto-delivery time, but nothing in
                   this workspace ever rendered it — the buyer had no way to see
                   the link/file they paid for. Buyer sees the actual content;
                   seller sees a read-only confirmation of what was sent. -->
              ${order.digitalDelivery ? `
              <div class="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-5">
                <div class="flex items-center gap-3 mb-3">
                  <div class="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i class="fa-solid fa-box-open text-green-600"></i>
                  </div>
                  <div>
                    <p class="font-black text-green-800 text-sm">${isAr ? 'محتوى التسليم الفوري' : 'Instant delivery content'}</p>
                    <p class="text-xs text-green-600">${isAr ? 'اتبعت تلقائيًا فور الدفع' : 'Sent automatically upon payment'}</p>
                  </div>
                </div>
                ${isBuyer ? `
                  ${order.digitalDelivery.type === 'link' ? `
                    <a href="${_escapeHtml(order.digitalDelivery.value || '')}" target="_blank" rel="noopener"
                      class="flex items-center gap-3 p-3 bg-white border border-green-200 rounded-xl hover:border-green-400 hover:shadow-md transition break-all">
                      <i class="fa-solid fa-link text-green-600 flex-shrink-0"></i>
                      <span class="text-sm font-bold text-navy-700 flex-1">${_escapeHtml(order.digitalDelivery.value || '')}</span>
                      <i class="fa-solid fa-arrow-up-right-from-square text-gray-300 flex-shrink-0"></i>
                    </a>
                  ` : `
                    <a href="${_escapeHtml(order.digitalDelivery.value || '')}" target="_blank" rel="noopener" download
                      class="flex items-center gap-3 p-3 bg-white border border-green-200 rounded-xl hover:border-green-400 hover:shadow-md transition">
                      <i class="fa-solid fa-file-arrow-down text-green-600 text-xl flex-shrink-0"></i>
                      <span class="text-sm font-bold text-gray-900 flex-1">${isAr ? 'تحميل الملف' : 'Download file'}</span>
                      <i class="fa-solid fa-download text-gray-300 flex-shrink-0"></i>
                    </a>
                  `}
                  ${order.digitalDelivery.notes ? `<p class="text-gray-700 text-sm mt-3 bg-white rounded-xl p-3 border border-green-100 whitespace-pre-wrap">${_escapeHtml(order.digitalDelivery.notes)}</p>` : ''}
                ` : `
                  <p class="text-sm text-green-700">${isAr ? 'تم إرسال رابط/ملف التسليم للعميل تلقائيًا.' : "The delivery link/file was sent to the buyer automatically."}</p>
                `}
              </div>
              ` : ''}

              <!-- ── BUYER: Accept/Revise/Dispute ─────────────────────── -->
              ${isBuyer && order.status === ORDER_STATUS.DELIVERED ? `
              <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 class="font-black text-gray-900 mb-4 flex items-center gap-2">
                  <i class="fa-solid fa-check-circle text-green-600"></i>
                  ${isAr ? 'استلام الخدمة' : 'Service Delivery'}
                </h3>
                <div class="space-y-3">
                  <button onclick="EscrowManager.confirmDelivery('${orderId}')"
                    class="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2">
                    <i class="fa-solid fa-check"></i>${t('escrow.confirm')}
                  </button>
                  <button onclick="OrderWorkspace.requestRevision('${orderId}')"
                    class="btn-secondary w-full py-3 text-sm flex items-center justify-center gap-2">
                    <i class="fa-solid fa-rotate-left"></i>${t('orders.revision')}
                  </button>
                  <button onclick="EscrowManager.openDispute('${orderId}')"
                    class="w-full py-3 text-sm border-2 border-red-400 text-red-600 rounded-2xl hover:bg-red-600 hover:text-white transition flex items-center justify-center gap-2">
                    <i class="fa-solid fa-flag"></i>${t('escrow.dispute')}
                  </button>
                </div>
              </div>
              ` : ''}

              <!-- ── Auto-dispute notice — visible to both parties while DELIVERED ──
                   ⚠️ CHANGED (per Ahmed's feedback): originally this window ended in
                   an automatic payout to the seller — wrong for anything that can
                   still be legitimately in transit (e.g. a physical product), since
                   it could pay for something the buyer never actually received. Now
                   it ends in an automatic DISPUTE for admin review instead — the
                   seller still gets a guaranteed outcome (never stuck forever), a
                   human just decides refund vs. pay instead of the clock deciding
                   "pay" by default. See functions/api/payment.js
                   (autoFlagStaleDeliveries, run by cron-worker). -->
              ${order.status === ORDER_STATUS.DELIVERED ? `
              <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                <i class="fa-solid fa-clock text-amber-600 mt-0.5"></i>
                <p class="text-sm text-amber-800 leading-relaxed">
                  ${isBuyer
                    ? (isAr ? `لو معملتش حاجة خلال ${AUTO_DISPUTE_DAYS} أيام من تاريخ التسليم، هيتفتح نزاع تلقائي وهتراجعه إدارة الموقع — الفلوس مش هتتحول تلقائي للبائع. لو استلمت فعلاً، أكّد الاستلام دلوقتي أسرع للبائع.` : `If you take no action within ${AUTO_DISPUTE_DAYS} days of delivery, a dispute opens automatically for admin review — the amount does NOT auto-release to the seller. If you already received it, confirm now to pay the seller faster.`)
                    : (isAr ? `لو العميل معملش حاجة خلال ${AUTO_DISPUTE_DAYS} أيام من التسليم، هيتفتح نزاع تلقائي وتراجعه الإدارة (مش تحويل مباشر للفلوس). لو العميل مش بيرد أو رافض بدون سبب، تقدر تفتح نزاع بنفسك دلوقتي بدل ما تستنى.` : `If the buyer takes no action within ${AUTO_DISPUTE_DAYS} days, a dispute opens automatically for admin review (not a direct payout). If they're unresponsive or refusing without reason, you can open a dispute yourself now instead of waiting.`)}
                </p>
              </div>
              ` : ''}

              <!-- ── Persistent dispute access while order is active but NOT
                   yet at "delivered" ─────────────────────────────────────
                   ⚠️ ADDED: the only "Open Dispute" button used to appear
                   after the seller marked the order DELIVERED — so if a
                   buyer paid and the seller went silent / never shipped /
                   sent something wrong WHILE the order was still
                   PAYMENT_HELD, IN_PROGRESS or REVISION, there was no way
                   to raise it at all until that point. Now both sides can
                   open a dispute any time money is actually held in escrow,
                   not just after delivery. -->
              ${[ORDER_STATUS.PAYMENT_HELD, ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.REVISION].includes(order.status) ? `
              <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between gap-3">
                <p class="text-xs text-gray-500">${isAr ? 'في مشكلة في الطلب؟ متستناش لحد التسليم.' : "Having a problem with this order? You don't have to wait until delivery."}</p>
                <button onclick="EscrowManager.openDispute('${orderId}')"
                  class="shrink-0 px-3.5 py-2 text-xs font-bold border-2 border-red-300 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition flex items-center gap-1.5">
                  <i class="fa-solid fa-flag"></i>${isAr ? 'فتح نزاع' : 'Open Dispute'}
                </button>
              </div>
              ` : ''}

              <!-- ── SELLER: delivered, waiting on buyer — dispute option ─ -->
              ${isSeller && order.status === ORDER_STATUS.DELIVERED ? `
              <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 class="font-black text-gray-900 mb-2 flex items-center gap-2">
                  <i class="fa-solid fa-hourglass-half text-amber-500"></i>
                  ${isAr ? 'في انتظار تأكيد العميل' : 'Waiting for buyer confirmation'}
                </h3>
                <p class="text-gray-500 text-sm mb-4">${isAr ? 'العميل مستلم التسليم وقدامه مهلة يراجع فيها. لو مش بيرد أو في مشكلة، افتح نزاع وإدارة الموقع هتراجع الطلب.' : "The buyer has your delivery and a review window. If they're unresponsive or there's an issue, open a dispute for admin review."}</p>
                <button onclick="EscrowManager.openDispute('${orderId}')"
                  class="w-full py-3 text-sm border-2 border-red-400 text-red-600 rounded-2xl hover:bg-red-600 hover:text-white transition flex items-center justify-center gap-2">
                  <i class="fa-solid fa-flag"></i>${isAr ? 'فتح نزاع' : 'Open Dispute'}
                </button>
              </div>
              ` : ''}
              ${isBuyer && order.status === ORDER_STATUS.COMPLETED && !order.reviewed ? `
              <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 class="font-black text-gray-900 mb-4 flex items-center gap-2">
                  <i class="fa-solid fa-star text-yellow-500"></i>
                  ${isAr ? 'قيّم الخدمة' : 'Rate Service'}
                </h3>
                <div id="starRating" class="flex gap-2 mb-4 text-2xl cursor-pointer justify-center">
                  ${[1,2,3,4,5].map(i =>
                    `<i class="fa-regular fa-star text-gray-300 hover:text-yellow-400 transition"
                      data-star="${i}" onclick="OrderWorkspace.setRating(${i})"></i>`
                  ).join('')}
                </div>
                <textarea id="reviewText" rows="3" class="form-input text-sm mb-3 w-full"
                  placeholder="${isAr ? 'اكتب تقييمك هنا...' : 'Write your review here...'}"></textarea>
                <button onclick="OrderWorkspace.submitReview('${orderId}')"
                  class="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2">
                  <i class="fa-solid fa-paper-plane"></i>
                  ${isAr ? 'إرسال التقييم' : 'Submit Review'}
                </button>
              </div>
              ` : ''}

            </div>
          </div>
        </div>`;

        // NOTE: no live escrow-status banner rendered here yet — order status
        // badge above already shows payment_held/completed. If you want a
        // dedicated escrow banner, EscrowManager exists in js/escrow.js.
        _loadTimeline(order);
        _loadFiles(orderId);
        wsActivateTab('chat');
    }

    // ── Tab Builder ───────────────────────────────────────────────────────────
    function _tab(id, i18nKey, icon) {
        return `<button onclick="wsActivateTab('${id}')" id="ws-tab-btn-${id}"
          class="ws-tab-btn flex-1 py-3 text-sm font-bold text-gray-500 hover:text-navy-600 hover:bg-navy-50 transition flex items-center justify-center gap-2 border-b-2 border-transparent">
          <i class="fa-solid ${icon}"></i>
          <span>${t(i18nKey)}</span>
        </button>`;
    }

    // ── Tab Switcher ──────────────────────────────────────────────────────────
    function wsActivateTab(tab) {
        ['chat', 'files', 'timeline'].forEach(id => {
            const panel = document.getElementById(`ws-tab-${id}`);
            const btn   = document.getElementById(`ws-tab-btn-${id}`);
            if (panel) panel.classList.toggle('hidden', id !== tab);
            if (btn) {
                btn.classList.toggle('text-navy-600',     id === tab);
                btn.classList.toggle('border-navy-500',   id === tab);
                btn.classList.toggle('bg-white',           id === tab);
                btn.classList.toggle('text-gray-500',      id !== tab);
                btn.classList.toggle('border-transparent', id !== tab);
            }
        });
    }

    // ── Link this user as buyer/seller on the RTDB chat node (once, idempotent) ─
    // Required by database.rules.json before any message read/write is allowed.
    // Retries with growing backoff to ride out the brief window right after
    // login where the Realtime Database socket hasn't finished re-authing yet.
    async function _linkChatParticipant(orderId, order, userId) {
        if (!window.rtdb) return;
        const ref = window.rtdb.ref(`chats/${orderId}`);
        const jobs = [];
        if (order.buyerId === userId)  jobs.push(ref.child('buyerId'));
        if (order.sellerId === userId) jobs.push(ref.child('sellerId'));
        const delays = [0, 400, 1000, 2000, 3500];
        for (const node of jobs) {
            let ok = false, lastErr = null;
            for (let i = 0; i < delays.length && !ok; i++) {
                if (delays[i]) await new Promise(r => setTimeout(r, delays[i]));
                try { await node.set(userId); ok = true; }
                catch (err) { lastErr = err; }
            }
            if (!ok) console.warn('[Chat] link participant failed after retries:', lastErr && (lastErr.code || lastErr.message));
        }
    }

    // ── Real-time Chat Listener (Realtime Database) ───────────────────────────
    function _startChatListener(orderId) {
        if (_chatListener) { _chatListener(); _chatListener = null; }
        if (!window.rtdb) return;

        const container = document.getElementById('chatMessages');
        const isAr = AppState.language !== 'en';
        // (message list + subscribers are reset once in openWorkspace(),
        // before _loadFiles() has a chance to subscribe — see the note there)
        let _gotAnyMessage = false;
        let _emptyCheckTimer = null;

        const renderSafely = (m) => {
            try { return _renderMessage(m, m.id); }
            catch (renderErr) {
                console.error('[Chat] Failed to render message', m.id, renderErr, m);
                return `<div class="mx-2 my-2 text-xs text-red-400 bg-red-50 rounded-lg p-2">
                    ${isAr ? 'تعذّر عرض رسالة واحدة' : 'One message failed to display'} (${_escapeHtml(m.id)})
                </div>`;
            }
        };

        // ⚠️ FIXED (found in audit, round N — the real one): .on('value') was
        // the actual cause of "only 1 of 17 messages shows up, and stays that
        // way for good". 'value' only fires once Firebase has a FULLY
        // consistent snapshot of the ENTIRE query range — with 17 messages,
        // several of them embedding full images as base64 (there's no object
        // storage bucket here; see uploadFile()'s comments), that means the
        // browser must finish downloading every embedded image before a
        // single message is allowed to render. Combined with the repeated
        // WebSocket reconnects we saw in the Network tab, that full-snapshot
        // download kept getting interrupted before completing, so the 'value'
        // callback for the real 17-message state may never fire at all —
        // leaving the UI stuck on whatever the very first, smaller, quicker
        // sync (the request_brief message alone) had already rendered.
        // 'child_added' fires per-message as soon as THAT message is synced,
        // independent of the others, so messages now appear progressively as
        // they arrive instead of all-or-nothing, and one slow/heavy message
        // (a large image) can no longer block the rest of the conversation
        // from showing up.
        const ref = window.rtdb.ref(`chats/${orderId}/messages`).orderByChild('createdAt').limitToLast(100);
        const onAdded = snap => {
            if (!container) return;
            if (_emptyCheckTimer) { clearTimeout(_emptyCheckTimer); _emptyCheckTimer = null; }
            if (!_gotAnyMessage) { _gotAnyMessage = true; container.innerHTML = ''; }
            const msg = { id: snap.key, ...snap.val() };
            _lastLoadedMessages.push(msg);
            _notifyMessagesChanged();
            const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
            const wrap = document.createElement('div');
            wrap.setAttribute('data-msg-id', msg.id);
            wrap.innerHTML = renderSafely(msg);
            container.appendChild(wrap);
            if (wasAtBottom) container.scrollTop = container.scrollHeight;
        };
        const onErr = err => {
            console.error('[Chat] RTDB listener error:', err.code || err.message, err);
            if (container) {
                container.innerHTML = `
                  <div class="text-center text-red-400 py-10 px-4">
                    <i class="fa-solid fa-triangle-exclamation text-4xl mb-3 opacity-60"></i>
                    <p class="font-bold">${isAr ? 'تعذّر تحميل المحادثة' : 'Could not load the conversation'}</p>
                    <p class="text-xs mt-1 text-gray-400">${_escapeHtml(err.code || err.message || '')}</p>
                  </div>`;
            }
        };
        ref.on('child_added', onAdded, onErr);
        // Only 'child_added' fires when data streams in; if the chat is
        // genuinely empty (a brand-new order with zero messages), nothing
        // ever fires at all, so show the placeholder after a short grace
        // window instead of leaving the panel blank forever.
        _emptyCheckTimer = setTimeout(() => {
            if (!_gotAnyMessage && container) {
                container.innerHTML = `
                  <div class="text-center text-gray-400 py-10">
                    <i class="fa-solid fa-comments text-5xl mb-3 opacity-30"></i>
                    <p class="font-bold">${isAr ? 'لا توجد رسائل بعد' : 'No messages yet'}</p>
                    <p class="text-sm mt-1">${isAr ? 'ابدأ المحادثة مع الطرف الآخر' : 'Start the conversation'}</p>
                  </div>`;
            }
        }, 4000);

        _chatListener = () => window.rtdb.ref(`chats/${orderId}/messages`).off('child_added', onAdded);
    }

    // ── Render a single message ───────────────────────────────────────────────
    function _renderMessage(msg, msgId) {
        const userId     = AppState.currentUser?.uid;
        const isMine     = msg.senderId === userId;
        const isFile     = msg.type === 'file';
        const isImage    = msg.type === 'image';
        const isDelivery = msg.type === 'delivery';
        const isBrief    = msg.type === 'request_brief';
        const isProductBrief = msg.type === 'product_order_brief';
        const isShippingUpdate = msg.type === 'shipping_update';
        const isAr       = AppState.language !== 'en';

        // ── Shipping status update card ─────────────────────────────────────────
        if (isShippingUpdate) {
            const label = msg.shippingStatus === 'delivered'
                ? (isAr ? 'تم تسليم الطلب' : 'Order delivered')
                : (isAr ? 'تم شحن الطلب' : 'Order shipped');
            const icon = msg.shippingStatus === 'delivered' ? 'fa-house-circle-check' : 'fa-truck';
            return `
            <div class="flex justify-center my-3">
              <div class="bg-turquoise-50 border border-turquoise-200 rounded-full px-4 py-2 flex items-center gap-2 text-xs font-bold text-turquoise-700">
                <i class="fa-solid ${icon}"></i>${label} · ${formatTimeAgo(msg.createdAt)}
              </div>
            </div>`;
        }

        // ── Product order brief card (shipping/contact details) ────────────────
        if (isProductBrief) {
            return `
            <div class="mx-2 my-3">
              <div class="bg-turquoise-800 text-white rounded-2xl p-4 max-w-sm">
                <div class="flex items-center gap-2 mb-2">
                  <i class="fa-solid fa-box text-turquoise-300"></i>
                  <p class="font-black text-sm">${isAr ? 'بيانات طلب المنتج' : 'Product Order Details'}</p>
                </div>
                <div class="flex flex-col gap-1.5 text-xs text-turquoise-50">
                  <div class="flex items-center gap-2"><i class="fa-solid fa-user w-4 text-turquoise-300"></i><span>${_escapeHtml(msg.fullName || '—')}</span></div>
                  <div class="flex items-center gap-2" dir="ltr"><i class="fa-solid fa-phone w-4 text-turquoise-300"></i><span>${_escapeHtml(msg.phone || '—')}</span></div>
                  <div class="flex items-start gap-2"><i class="fa-solid fa-location-dot w-4 text-turquoise-300 mt-0.5"></i><span class="whitespace-pre-wrap">${_escapeHtml(msg.address || '—')}</span></div>
                  ${msg.selectedFields ? `<div class="flex items-start gap-2 border-t border-white/10 pt-1.5 mt-1"><i class="fa-solid fa-tag w-4 text-turquoise-300 mt-0.5"></i><span>${_escapeHtml(msg.selectedFields)}</span></div>` : ''}
                  ${msg.notes ? `<div class="flex items-start gap-2 border-t border-white/10 pt-1.5 mt-1"><i class="fa-solid fa-note-sticky w-4 text-turquoise-300 mt-0.5"></i><span class="whitespace-pre-wrap">${_escapeHtml(msg.notes)}</span></div>` : ''}
                </div>
                <p class="text-xs text-turquoise-200 mt-2">${formatTimeAgo(msg.createdAt)}</p>
              </div>
            </div>`;
        }

        // ── Request brief card ────────────────────────────────────────────────
        if (isBrief) {
            return `
            <div class="mx-2 my-3">
              <div class="bg-navy-800 text-white rounded-2xl p-4 max-w-sm">
                <div class="flex items-center gap-2 mb-2">
                  <i class="fa-solid fa-file-lines text-turquoise-400"></i>
                  <p class="font-black text-sm">${isAr ? 'تفاصيل الطلب' : 'Request Details'}</p>
                </div>
                <p class="text-sm leading-relaxed text-navy-100 whitespace-pre-wrap break-words mb-3">${_linkify(_escapeHtml(msg.details || ''))}</p>
                <div class="flex flex-col gap-1.5 border-t border-white/10 pt-2">
                  ${msg.deadline ? `
                  <div class="flex items-center gap-2 text-xs text-navy-200">
                    <i class="fa-regular fa-clock w-4 text-turquoise-400"></i>
                    <span>${isAr?'الميعاد:':'Deadline:'} ${_escapeHtml(msg.deadline)}</span>
                  </div>` : ''}
                  ${msg.budget ? `
                  <div class="flex items-center gap-2 text-xs text-navy-200">
                    <i class="fa-solid fa-sack-dollar w-4 text-turquoise-400"></i>
                    <span>${isAr?'الميزانية:':'Budget:'} ${_escapeHtml(msg.budget)}</span>
                  </div>` : ''}
                </div>
                <p class="text-xs text-navy-300 mt-2">${formatTimeAgo(msg.createdAt)}</p>
              </div>
            </div>`;
        }

        // ── Delivery message ─────────────────────────────────────────────────
        if (isDelivery) {
            return `
            <div class="mx-2 my-3">
              <div class="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-4">
                <div class="flex items-center gap-3 mb-3">
                  <div class="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i class="fa-solid fa-box-open text-green-600"></i>
                  </div>
                  <div>
                    <p class="font-black text-green-800 text-sm">${isAr ? 'تم تسليم الخدمة' : 'Service Delivered'}</p>
                    <p class="text-xs text-green-500">${formatTimeAgo(msg.createdAt)}</p>
                  </div>
                </div>
                ${msg.note ? `<p class="text-gray-700 text-sm mb-3 bg-white rounded-xl p-3 border border-green-100">${_escapeHtml(msg.note)}</p>` : ''}
                ${msg.files?.length ? `
                  <div class="space-y-2 mt-2">
                    <p class="text-xs font-bold text-green-700 mb-2">${isAr ? `${msg.files.length} ملف مرفق:` : `${msg.files.length} file(s) attached:`}</p>
                    ${msg.files.map(f => _fileDownloadCard(f)).join('')}
                  </div>
                ` : ''}
              </div>
            </div>`;
        }

        // ── File message ─────────────────────────────────────────────────────
        if (isFile) {
            return `
            <div class="flex ${isMine ? 'justify-end' : 'justify-start'} mb-1 group">
              <div>
                ${!isMine ? `<p class="text-xs text-gray-400 mb-1 mx-1">${_escapeHtml(msg.senderName || '—')}</p>` : ''}
                <div class="flex items-center gap-1 ${isMine ? 'flex-row-reverse' : ''}">
                  <div class="max-w-xs">${_fileDownloadCard(msg.file)}</div>
                  ${isMine ? `
                  <button onclick="OrderWorkspace.deleteMessage('${msgId}')"
                    class="opacity-0 group-hover:opacity-100 transition text-gray-300 hover:text-red-500 w-6 h-6 flex items-center justify-center flex-shrink-0"
                    title="${isAr ? 'حذف' : 'Delete'}"><i class="fa-solid fa-trash-can text-xs"></i></button>` : ''}
                </div>
                <p class="text-xs text-gray-400 mt-1 mx-1 ${isMine ? 'text-right' : 'text-left'}">${formatTimeAgo(msg.createdAt)}</p>
              </div>
            </div>`;
        }

        // ── Image message ─────────────────────────────────────────────────────
        if (isImage) {
            return `
            <div class="flex ${isMine ? 'justify-end' : 'justify-start'} mb-1 group">
              <div>
                ${!isMine ? `<p class="text-xs text-gray-400 mb-1 mx-1">${_escapeHtml(msg.senderName || '—')}</p>` : ''}
                <div class="flex items-center gap-1 ${isMine ? 'flex-row-reverse' : ''}">
                  <a href="${msg.file?.url}" target="_blank" rel="noopener">
                    <img src="${msg.file?.url}" alt="${_escapeHtml(msg.file?.name || 'image')}"
                      class="max-w-xs rounded-2xl border border-gray-200 hover:opacity-90 transition cursor-pointer"
                      loading="lazy" style="max-height:200px;object-fit:cover">
                  </a>
                  ${isMine ? `
                  <button onclick="OrderWorkspace.deleteMessage('${msgId}')"
                    class="opacity-0 group-hover:opacity-100 transition text-gray-300 hover:text-red-500 w-6 h-6 flex items-center justify-center flex-shrink-0"
                    title="${isAr ? 'حذف' : 'Delete'}"><i class="fa-solid fa-trash-can text-xs"></i></button>` : ''}
                </div>
                <p class="text-xs text-gray-400 mt-1 mx-1 ${isMine ? 'text-right' : 'text-left'}">${formatTimeAgo(msg.createdAt)}</p>
              </div>
            </div>`;
        }

        // ── Text message ──────────────────────────────────────────────────────
        return `
        <div class="flex ${isMine ? 'justify-end' : 'justify-start'} mb-1 group">
          <div class="max-w-xs lg:max-w-sm">
            ${!isMine ? `<p class="text-xs text-gray-400 mb-1 mx-2">${_escapeHtml(msg.senderName || '—')}</p>` : ''}
            <div class="flex items-center gap-1 ${isMine ? 'flex-row-reverse' : ''}">
              <div class="chat-bubble ${isMine ? 'sent' : 'received'}">
                <p class="text-sm leading-relaxed whitespace-pre-wrap break-words">${_linkify(_escapeHtml(msg.text || ''))}</p>
              </div>
              ${isMine ? `
              <button onclick="OrderWorkspace.deleteMessage('${msgId}')"
                class="opacity-0 group-hover:opacity-100 transition text-gray-300 hover:text-red-500 w-6 h-6 flex items-center justify-center flex-shrink-0"
                title="${isAr ? 'حذف الرسالة' : 'Delete message'}">
                <i class="fa-solid fa-trash-can text-xs"></i>
              </button>` : ''}
            </div>
            <p class="text-xs text-gray-400 mt-0.5 mx-2 ${isMine ? 'text-right' : 'text-left'}">
              ${formatTimeAgo(msg.createdAt)}
              ${isMine ? '<i class="fa-solid fa-check-double ml-1 opacity-60"></i>' : ''}
            </p>
          </div>
        </div>`;
    }

    // ── Delete a message (sender only — enforced server-side too) ────────────
    function deleteMessage(msgId) {
        if (!_currentOrderId || !window.rtdb) return;
        const isAr = AppState.language !== 'en';
        if (!confirm(isAr ? 'حذف هذه الرسالة نهائيًا؟' : 'Delete this message permanently?')) return;
        window.rtdb.ref(`chats/${_currentOrderId}/messages/${msgId}`).remove()
            .then(() => {
                const el = document.querySelector(`[data-msg-id="${msgId}"]`);
                if (el) el.remove();
                _lastLoadedMessages = _lastLoadedMessages.filter(m => m.id !== msgId);
                _notifyMessagesChanged();
            })
            .catch(err => {
                console.error('[Chat] deleteMessage error:', err);
                showToast(isAr ? 'تعذّر حذف الرسالة' : 'Could not delete the message', 'error');
            });
    }

    // ── File download card ────────────────────────────────────────────────────
    function _fileDownloadCard(file) {
        if (!file) return '';
        const ext     = (file.name || '').split('.').pop().toLowerCase();
        const isImg   = ['jpg','jpeg','png','gif','webp','svg'].includes(ext);
        const iconMap = {
            pdf: 'fa-file-pdf text-red-500',
            zip: 'fa-file-zipper text-yellow-500', rar: 'fa-file-zipper text-yellow-500',
            doc: 'fa-file-word text-blue-700', docx: 'fa-file-word text-blue-700',
            xls: 'fa-file-excel text-green-600', xlsx: 'fa-file-excel text-green-600',
            ppt: 'fa-file-powerpoint text-orange-500', pptx: 'fa-file-powerpoint text-orange-500',
            mp4: 'fa-file-video text-purple-500', mov: 'fa-file-video text-purple-500',
            mp3: 'fa-file-audio text-pink-500', wav: 'fa-file-audio text-pink-500',
            js:  'fa-file-code text-yellow-600', ts: 'fa-file-code text-blue-500',
            html: 'fa-file-code text-orange-500', css: 'fa-file-code text-blue-400',
        };
        const icon = isImg ? 'fa-file-image text-blue-500' : (iconMap[ext] || 'fa-file text-gray-500');

        return `
        <a href="${file.url}" target="_blank" rel="noopener" download="${_escapeHtml(file.name || 'file')}"
          class="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:border-navy-400 hover:shadow-md transition group w-full">
          <i class="fa-solid ${icon} text-2xl flex-shrink-0"></i>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-bold text-gray-900 truncate">${_escapeHtml(file.name || 'File')}</p>
            <p class="text-xs text-gray-400">${_formatFileSize(file.size)}</p>
          </div>
          <i class="fa-solid fa-download text-gray-300 group-hover:text-navy-600 transition flex-shrink-0"></i>
        </a>`;
    }

    // ── Send text message ─────────────────────────────────────────────────────
    // ── Anti-fraud chat filter ────────────────────────────────────────────────
    // ⚠️ CHANGED: now uses the SHARED scanner (js/constants.js) instead of its
    // own local copy, so the chat, listings, and requests all enforce the
    // exact same off-platform contact/payment rules — see constants.js for
    // the full rationale.
    async function _flagSuspiciousMessage(orderId, text, kind) {
        window.flagSuspiciousContent({ orderId, userId: AppState.currentUser.uid, source: 'chat' }, text, kind);
    }

    async function sendMessage() {
        const input = document.getElementById('chatInput');
        const text  = input?.value?.trim();
        if (!text || !_currentOrderId || !AppState.currentUser) return;

        const isAr = AppState.language !== 'en';
        const leakKind = window.scanForContactLeak(text);
        if (leakKind) {
            _flagSuspiciousMessage(_currentOrderId, text, leakKind);
            showToast(window.contactLeakWarning(isAr), 'error');
            return;
        }

        input.value = '';
        input.style.height = 'auto';

        try {
            await window.rtdb.ref(`chats/${_currentOrderId}/messages`).push({
                senderId:   AppState.currentUser.uid,
                senderName: AppState.currentUser.displayName || AppState.currentUser.email || 'User',
                text:       sanitizeInput(text),
                type:       'text',
                createdAt:  firebase.database.ServerValue.TIMESTAMP,
            });
            // Update order's lastMessageAt for sorting (non-critical, Firestore)
            window.db.collection(COLLECTIONS.ORDERS).doc(_currentOrderId)
                .update({ lastMessageAt: _ts(), updatedAt: _ts() })
                .catch(() => {});
        } catch (err) {
            console.error('[Chat] sendMessage error:', err);
            showToast(t('general.error'), 'error');
        }
    }

    function handleChatKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    // ── Send file from chat input ─────────────────────────────────────────────
    async function sendFile(inputEl) {
        const files = Array.from(inputEl.files || []);
        if (!files.length || !_currentOrderId || !AppState.currentUser) return;

        const isAr   = AppState.language !== 'en';
        const userId = AppState.currentUser.uid;

        for (const file of files) {
            const isImgFile = file.type && file.type.startsWith('image/');
            const limit = isImgFile ? MAX_FILE_SIZE : NON_IMAGE_FILE_LIMIT;
            if (file.size > limit) {
                const limitLabel = isImgFile ? '50MB' : '6MB';
                showToast(isAr ? `الملف ${file.name} تجاوز الحد (${limitLabel})` : `${file.name} exceeds limit (${limitLabel})`, 'warning');
                continue;
            }
            showLoading(isAr ? `جاري رفع ${file.name}...` : `Uploading ${file.name}...`);
            try {
                const url   = await uploadFile(file, 'chat_files', `${_currentOrderId}_${userId}_${Date.now()}`);
                const isImg = file.type.startsWith('image/');
                hideLoading();
                await window.rtdb.ref(`chats/${_currentOrderId}/messages`).push({
                    senderId:   userId,
                    senderName: AppState.currentUser.displayName || AppState.currentUser.email || 'User',
                    type:       isImg ? 'image' : 'file',
                    file:       { name: file.name, url, size: file.size, type: file.type },
                    createdAt:  firebase.database.ServerValue.TIMESTAMP,
                });
            } catch (err) {
                hideLoading();
                console.error('[Chat] sendFile error:', err);
                showToast(err && err.message ? err.message : ((isAr ? 'فشل رفع ' : 'Failed to upload ') + file.name), 'error');
            }
        }
        inputEl.value = '';
    }

    // ── Handle delivery drop zone ─────────────────────────────────────────────
    function handleDeliveryDrop(e) {
        const input = document.getElementById('deliveryFiles');
        if (!input || !e.dataTransfer?.files?.length) return;
        // Transfer files to the hidden input via DataTransfer
        try {
            const dt = new DataTransfer();
            Array.from(e.dataTransfer.files).forEach(f => dt.items.add(f));
            input.files = dt.files;
            previewDeliveryFiles(input);
        } catch(ex) {
            showToast(AppState.language !== 'en' ? 'استخدم زر الاختيار بدلاً من السحب' : 'Use the browse button instead', 'warning');
        }
    }

    // ── Deliver Service (Seller) ──────────────────────────────────────────────
    async function deliverService() {
        const isAr    = AppState.language !== 'en';
        const filesEl = document.getElementById('deliveryFiles');
        const noteEl  = document.getElementById('deliveryNote');
        const note    = noteEl?.value?.trim() || '';
        const files   = Array.from(filesEl?.files || []);

        if (!note && files.length === 0) {
            showToast(isAr ? 'أرفق ملفات أو اكتب رسالة التسليم' : 'Add files or a delivery message', 'warning');
            return;
        }

        showLoading(isAr ? 'جاري إرسال التسليم...' : 'Submitting delivery...');
        try {
            const uploadedFiles = [];
            for (const file of files) {
                const isImgFile = file.type && file.type.startsWith('image/');
                const limit = isImgFile ? MAX_FILE_SIZE : NON_IMAGE_FILE_LIMIT;
                if (file.size > limit) {
                    showToast(`${file.name} > ${isImgFile ? '50MB' : '6MB'}`, 'warning');
                    continue;
                }
                let url;
                try {
                    url = await uploadFile(file, 'deliveries', `${_currentOrderId}_${Date.now()}`);
                } catch (fileErr) {
                    showToast(fileErr && fileErr.message ? fileErr.message : `${isAr ? 'فشل رفع' : 'Failed to upload'} ${file.name}`, 'error');
                    continue;
                }
                uploadedFiles.push({ name: file.name, url, size: file.size, type: file.type });
            }

            const batch = window.db.batch();

            batch.update(window.db.collection(COLLECTIONS.ORDERS).doc(_currentOrderId), {
                status:      ORDER_STATUS.DELIVERED,
                deliveredAt: _ts(),
                updatedAt:   _ts(),
            });

            const order = AppState.currentOrder;
            if (order?.buyerId) {
                const notifRef = window.db.collection(COLLECTIONS.NOTIFICATIONS).doc();
                batch.set(notifRef, {
                    userId:    order.buyerId,
                    type:      'delivery',
                    title:     isAr ? 'تم تسليم الخدمة!' : 'Service Delivered!',
                    message:   `"${order.serviceTitle || ''}" ${isAr ? 'تم تسليمها' : 'has been delivered'}`,
                    orderId:   _currentOrderId,
                    read:      false,
                    createdAt: _ts(),
                });
            }

            await batch.commit();

            // Delivery message goes to Realtime Database, same as the rest of chat.
            await window.rtdb.ref(`chats/${_currentOrderId}/messages`).push({
                senderId:   AppState.currentUser.uid,
                senderName: AppState.currentUser.displayName || AppState.currentUser.email || 'Seller',
                type:       'delivery',
                note:       sanitizeInput(note),
                files:      uploadedFiles,
                createdAt:  firebase.database.ServerValue.TIMESTAMP,
            });

            hideLoading();
            showToast(isAr ? '✅ تم إرسال التسليم بنجاح!' : '✅ Delivery submitted!', 'success');

            // Refresh
            const snap = await window.db.collection(COLLECTIONS.ORDERS).doc(_currentOrderId).get();
            AppState.currentOrder = { id: snap.id, ...snap.data() };
            _renderWorkspace(AppState.currentOrder);
            _startChatListener(_currentOrderId);
        } catch (err) {
            hideLoading();
            console.error('[Workspace] deliverService error:', err);
            showToast(t('general.error') + ': ' + err.message, 'error');
        }
    }

    // ── Request Revision (Buyer) ──────────────────────────────────────────────
    async function requestRevision(orderId) {
        const isAr = AppState.language !== 'en';
        const note = prompt(isAr ? 'اشرح ما تحتاج تعديله:' : 'Describe what needs to be revised:');
        if (!note?.trim()) return;

        showLoading();
        try {
            await window.db.collection(COLLECTIONS.ORDERS).doc(orderId).update({
                status:    ORDER_STATUS.REVISION,
                updatedAt: _ts(),
            });
            await window.rtdb.ref(`chats/${orderId}/messages`).push({
                senderId:   AppState.currentUser.uid,
                senderName: AppState.currentUser.displayName || AppState.currentUser.email || 'Buyer',
                text:       `${isAr ? 'طلب مراجعة' : 'Revision Request'}: ${sanitizeInput(note)}`,
                type:       'text',
                createdAt:  firebase.database.ServerValue.TIMESTAMP,
            });
            hideLoading();
            showToast(isAr ? 'تم إرسال طلب المراجعة' : 'Revision request sent', 'success');
        } catch (err) {
            hideLoading();
            showToast(t('general.error'), 'error');
        }
    }

    // ── Star Rating ───────────────────────────────────────────────────────────
    function setRating(stars) {
        _selectedRating = stars;
        document.querySelectorAll('#starRating i').forEach((el, i) => {
            el.className = i < stars
                ? 'fa-solid fa-star text-yellow-400 transition cursor-pointer text-2xl'
                : 'fa-regular fa-star text-gray-300 hover:text-yellow-400 transition cursor-pointer text-2xl';
        });
    }

    // ── Submit Review ─────────────────────────────────────────────────────────
    async function submitReview(orderId) {
        const isAr  = AppState.language !== 'en';
        const rating = _selectedRating;
        const text  = document.getElementById('reviewText')?.value?.trim() || '';

        if (!rating) { showToast(isAr ? 'يرجى اختيار تقييم' : 'Please select a rating', 'warning'); return; }

        showLoading();
        try {
            const order = AppState.currentOrder;
            const batch = window.db.batch();

            batch.set(window.db.collection(COLLECTIONS.REVIEWS).doc(), {
                orderId, rating, text: sanitizeInput(text),
                reviewerId:   AppState.currentUser.uid,
                reviewerName: AppState.currentUser.displayName || AppState.currentUser.email,
                sellerId:     order?.sellerId,
                serviceId:    order?.serviceId,
                createdAt:    _ts(),
            });

            batch.update(window.db.collection(COLLECTIONS.ORDERS).doc(orderId), {
                reviewed:  true,
                updatedAt: _ts(),
            });

            await batch.commit();
            hideLoading();
            showToast(isAr ? 'شكراً على تقييمك!' : 'Thank you for your review!', 'success');
            openWorkspace(orderId);
        } catch (err) {
            hideLoading();
            showToast(t('general.error'), 'error');
        }
    }

    // ── Preview delivery files ────────────────────────────────────────────────
    function previewDeliveryFiles(input) {
        const list = document.getElementById('deliveryFilesList');
        if (!list) return;
        const files = Array.from(input.files || []);
        if (files.length === 0) { list.innerHTML = ''; return; }
        list.innerHTML = files.map(f => `
          <div class="flex items-center gap-2 bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-sm">
            <i class="fa-solid fa-file text-navy-500 flex-shrink-0"></i>
            <span class="flex-1 truncate font-medium">${_escapeHtml(f.name)}</span>
            <span class="text-gray-400 text-xs flex-shrink-0">${_formatFileSize(f.size)}</span>
            ${f.size > (f.type && f.type.startsWith('image/') ? MAX_FILE_SIZE : NON_IMAGE_FILE_LIMIT) ? '<span class="text-red-500 text-xs font-bold">!</span>' : '<i class="fa-solid fa-check text-green-500 text-xs"></i>'}
          </div>`).join('');
    }

    // ── Order Timeline ────────────────────────────────────────────────────────
    function _loadTimeline(order) {
        const container = document.getElementById('orderTimeline');
        if (!container) return;
        const isAr  = AppState.language !== 'en';
        const steps = [
            { icon: 'fa-paper-plane',    color: 'bg-blue-500',   label: isAr ? 'تم تقديم الطلب'        : 'Request Placed',      date: order.createdAt,   done: true },
            { icon: 'fa-comments',       color: 'bg-navy-500',  label: isAr ? 'التواصل مع مقدم الخدمة': 'Discussing with Seller', date: null,             done: [ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.DELIVERED, ORDER_STATUS.COMPLETED, ORDER_STATUS.PENDING].includes(order.status) },
            { icon: 'fa-hourglass-half', color: 'bg-amber-500',  label: isAr ? 'جاري تنفيذ الخدمة'     : 'In Progress',         date: null,              done: [ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.DELIVERED, ORDER_STATUS.COMPLETED].includes(order.status) },
            { icon: 'fa-box-open',       color: 'bg-purple-500', label: isAr ? 'تم تسليم الخدمة'       : 'Service Delivered',   date: order.deliveredAt, done: [ORDER_STATUS.DELIVERED, ORDER_STATUS.COMPLETED].includes(order.status) },
            { icon: 'fa-circle-check',   color: 'bg-green-500',  label: isAr ? 'مكتمل'                  : 'Completed',           date: order.completedAt, done: order.status === ORDER_STATUS.COMPLETED },
        ];
        container.innerHTML = `
          <div class="relative">
            <div class="absolute ${isAr ? 'right-5' : 'left-5'} top-0 bottom-0 w-0.5 bg-gray-200"></div>
            <div class="space-y-6">
              ${steps.map(s => `
                <div class="flex items-start gap-4 ${isAr ? 'flex-row-reverse text-right' : ''}">
                  <div class="w-10 h-10 ${s.done ? s.color : 'bg-gray-200'} rounded-full flex items-center justify-center flex-shrink-0 relative z-10 shadow-sm">
                    <i class="fa-solid ${s.icon} text-white text-sm"></i>
                  </div>
                  <div class="pt-1">
                    <p class="font-bold ${s.done ? 'text-gray-900' : 'text-gray-400'} text-sm">${s.label}</p>
                    ${s.date ? `<p class="text-xs text-gray-400 mt-0.5">${formatDateAr(s.date)}</p>` : ''}
                  </div>
                </div>`).join('')}
            </div>
          </div>`;
    }

    // ── Load files tab (reads from the RTDB message list, filtered client-side —
    //    RTDB has no "where type in [...]" query like Firestore) ────────────────
    let _filesListenerCleanup = null;

    function _renderFilesList(files, isAr) {
        const container = document.getElementById('filesList');
        const countEl   = document.getElementById('filesCount');
        if (!container) return;
        if (countEl) countEl.textContent = files.length + (isAr ? ' ملف' : ' files');
        if (files.length === 0) {
            container.innerHTML = `<p class="text-sm text-gray-400 text-center py-8">${isAr ? 'لا توجد ملفات بعد' : 'No files yet'}</p>`;
            return;
        }
        container.innerHTML = [...files].reverse().map(f => `
          <div class="group">
            <div class="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:border-navy-400 hover:shadow-sm transition">
              ${_fileDownloadCard(f)}
            </div>
            <p class="text-xs text-gray-400 mt-1 px-1">${f.sentBy || '—'} · ${formatTimeAgo(f.sentAt)} ${f.isDelivery ? '<i class="fa-solid fa-box"></i>' : ''}</p>
          </div>`).join('');
    }

    function _loadFiles(orderId) {
        // ⚠️ FIXED (found in audit): this used to do its own separate
        // .once('value') read over the ENTIRE messages list, independent of
        // the chat's own listener. That has the exact same problem the chat
        // panel had — Firebase only resolves .once('value') once it has one
        // FULLY consistent snapshot of everything (including every embedded
        // base64 image), so on a flaky connection this could take just as
        // long, or never resolve, leaving the Files tab permanently blank
        // even though the chat panel itself had already loaded fine. Now the
        // Files tab is driven from the exact same incremental message list
        // the chat listener is already building (`_lastLoadedMessages`),
        // updated live every time a new message streams in — no second,
        // duplicate, all-or-nothing read at all.
        if (_filesListenerCleanup) { _filesListenerCleanup(); _filesListenerCleanup = null; }
        const isAr = AppState.language !== 'en';
        const filesFromMsgs = (msgs) => {
            const files = [];
            msgs.forEach(d => {
                if ((d.type === 'file' || d.type === 'image') && d.file) {
                    files.push({ ...d.file, sentBy: d.senderName, sentAt: d.createdAt });
                }
                if (d.type === 'delivery' && d.files) {
                    d.files.forEach(f => files.push({ ...f, sentBy: d.senderName, sentAt: d.createdAt, isDelivery: true }));
                }
            });
            return files;
        };
        _renderFilesList(filesFromMsgs(_lastLoadedMessages), isAr);
        _filesListenerCleanup = _onMessagesChange(() => _renderFilesList(filesFromMsgs(_lastLoadedMessages), isAr));
    }

    // ── Utilities ─────────────────────────────────────────────────────────────
    function _escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function _linkify(str) {
        return str.replace(/(https?:\/\/[^\s<>"]+)/g,
            '<a href="$1" target="_blank" rel="noopener noreferrer" class="underline text-navy-600 hover:text-navy-800">$1</a>');
    }

    function _formatFileSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
        return `${(bytes/1048576).toFixed(1)} MB`;
    }

    function _formatPaymentMethod(method) {
        const map = {
            paymob: 'Paymob', paymob_card: 'Paymob Card',
            fawry: 'Fawry', vodafone_cash: 'Vodafone Cash',
            etisalat_cash: 'Etisalat Cash', orange_cash: 'Orange Cash',
            we_pay: 'WE Pay', payoneer: 'Payoneer',
            wallet: 'Wallet', wallet_balance: 'Wallet',
            bank_transfer: 'Bank Transfer', paypal: 'PayPal', stripe: 'Stripe',
        };
        return map[method] || method || '—';
    }

    // ── Buyer: Send Instructions + Files ─────────────────────────────────────
    async function sendBuyerInstructions(orderId) {
        const isAr    = AppState.language !== 'en';
        const instrEl = document.getElementById('buyerInstructions');
        const filesEl = document.getElementById('buyer-files-input');
        const text    = instrEl ? instrEl.value.trim() : '';
        const files   = Array.from(filesEl ? filesEl.files || [] : []);

        if (!text && files.length === 0) {
            showToast(isAr ? 'اكتب تعليماتك أو أرفق ملفاً على الأقل' : 'Write instructions or attach at least one file', 'warning');
            return;
        }

        showLoading(isAr ? 'جاري الإرسال...' : 'Sending...');
        try {
            // Upload files
            const uploadedFiles = [];
            for (const file of files) {
                const isImgFile = file.type && file.type.startsWith('image/');
                const limit = isImgFile ? 50 * 1024 * 1024 : NON_IMAGE_FILE_LIMIT;
                if (file.size > limit) {
                    showToast((isAr ? 'الملف كبير جداً: ' : 'File too large: ') + file.name, 'warning');
                    continue;
                }
                try {
                    const url = await uploadFile(file, 'order_buyer_files', orderId + '_' + Date.now());
                    uploadedFiles.push({ name: file.name, url, size: file.size, type: file.type });
                } catch (fileErr) {
                    showToast(fileErr && fileErr.message ? fileErr.message : ((isAr ? 'فشل رفع ' : 'Failed to upload ') + file.name), 'error');
                }
            }

            const batch = window.db.batch();

            // Update order with buyer instructions
            const orderRef = window.db.collection(COLLECTIONS.ORDERS).doc(orderId);
            batch.update(orderRef, {
                buyerInstructions: sanitizeInput(text),
                buyerFiles:        uploadedFiles,
                status:            ORDER_STATUS.IN_PROGRESS,
                updatedAt:         _ts(),
            });

            // Notify seller
            const order = AppState.currentOrder;
            if (order && order.sellerId) {
                const notifRef = window.db.collection(COLLECTIONS.NOTIFICATIONS).doc();
                batch.set(notifRef, {
                    userId:    order.sellerId,
                    type:      'buyer_instructions',
                    title:     isAr ? 'المشتري أرسل تعليماته!' : 'Buyer sent instructions!',
                    message:   (AppState.currentUser.displayName || 'Buyer') + (isAr ? ' أرسل تعليمات لـ ' : ' sent instructions for ') + (order.serviceTitle || ''),
                    orderId,
                    read:      false,
                    createdAt: _ts(),
                });
            }

            await batch.commit();

            // Send as chat message (Realtime Database)
            await window.rtdb.ref(`chats/${orderId}/messages`).push({
                senderId:   AppState.currentUser.uid,
                senderName: AppState.currentUser.displayName || AppState.currentUser.email || 'Buyer',
                type:       'buyer_instructions',
                text:       sanitizeInput(text),
                files:      uploadedFiles,
                createdAt:  firebase.database.ServerValue.TIMESTAMP,
            });

            hideLoading();
            showToast(isAr ? '✅ تم إرسال التعليمات للبائع!' : '✅ Instructions sent to seller!', 'success');

            // Refresh workspace
            const snap = await window.db.collection(COLLECTIONS.ORDERS).doc(orderId).get();
            if (snap.exists) {
                AppState.currentOrder = { id: snap.id, ...snap.data() };
                _renderWorkspace(AppState.currentOrder);
                _startChatListener(orderId);
            }
        } catch(err) {
            hideLoading();
            console.error('[Workspace] sendBuyerInstructions error:', err);
            showToast(t('general.error'), 'error');
        }
    }

    function previewBuyerFiles(inputEl) {
        const preview = document.getElementById('buyer-files-preview');
        if (!preview) return;
        const files = Array.from(inputEl.files || []);
        if (!files.length) { preview.innerHTML = ''; return; }
        preview.innerHTML = files.map(f => `
            <div class="flex items-center gap-2 bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-sm">
              <i class="fa-solid fa-file text-navy-500 flex-shrink-0"></i>
              <span class="flex-1 truncate font-medium">${escapeHtml(f.name)}</span>
              <span class="text-gray-400 text-xs flex-shrink-0">${f.size > 1048576 ? (f.size/1048576).toFixed(1)+'MB' : (f.size/1024).toFixed(0)+'KB'}</span>
              ${f.size > (f.type && f.type.startsWith('image/') ? 50*1024*1024 : NON_IMAGE_FILE_LIMIT) ? '<i class="fa-solid fa-exclamation-triangle text-red-500 text-xs"></i>' : '<i class="fa-solid fa-check text-green-500 text-xs"></i>'}
            </div>`).join('');
    }

    // ── Seller-defined stage tracker (separate from the automatic status
    //    timeline) — the seller describes their own work steps in plain
    //    words and marks progress; the buyer sees it as a read-only stepper.
    // ⚠️ FIXED (found in audit): this was a single hardcoded Arabic array
    // used regardless of AppState.language — an English-mode buyer would see
    // Arabic stage names ("استلام الطلب" etc.) in an otherwise English page.
    // Only affects the DEFAULT (seller hasn't customized their stages yet);
    // a seller's own custom stage names are stored as typed and intentionally
    // left as-is (they can type in either language).
    const DEFAULT_STAGES = {
        ar: ['استلام الطلب', 'قيد التنفيذ', 'مراجعة العميل', 'التسليم النهائي'],
        en: ['Order received', 'In progress', 'Customer review', 'Final delivery'],
    };

    // ── Shipping tracker (products only) ─────────────────────────────────────
    // A simple 3-step tracker: processing → shipped → delivered. Unlike the
    // multi-stage work tracker above (which is for custom services with an
    // open-ended number of work stages), a physical/digital product order
    // only ever has these three states, so the seller doesn't customize
    // stage names — they just move it forward with one click at each step.
    function _renderShippingTracker(order, isSeller, isAr) {
        const status = order.shippingStatus || 'processing';
        const steps = [
            { key: 'placed',    label: isAr ? 'تم الطلب' : 'Order placed',   icon: 'fa-cart-shopping' },
            { key: 'processing',label: isAr ? 'قيد التجهيز' : 'Processing',  icon: 'fa-box-open' },
            { key: 'shipped',   label: isAr ? 'تم الشحن' : 'Shipped',        icon: 'fa-truck' },
            { key: 'delivered', label: isAr ? 'تم التسليم' : 'Delivered',    icon: 'fa-house-circle-check' },
        ];
        const order_ = { placed: 0, processing: 1, shipped: 2, delivered: 3 };
        const current = order_[status] ?? 1;

        return `
          <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h3 class="font-black text-gray-900 mb-4 flex items-center gap-2">
              <i class="fa-solid fa-truck-fast text-turquoise-600"></i>
              ${isAr ? 'متابعة الشحن' : 'Shipping Tracker'}
            </h3>
            <div class="space-y-3 mb-4">
              ${steps.map((s, i) => `
                <div class="flex items-center gap-3">
                  <div class="w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-black ${i <= current ? 'bg-turquoise-500 text-white' : 'bg-gray-100 text-gray-400'}">
                    ${i < current ? '<i class="fa-solid fa-check"></i>' : `<i class="fa-solid ${s.icon}"></i>`}
                  </div>
                  <span class="text-sm ${i === current ? 'font-black text-turquoise-700' : i < current ? 'text-gray-400' : 'text-gray-400'}">${s.label}</span>
                  ${i === current ? `<span class="text-xs text-turquoise-600 font-bold mr-auto">${isAr?'الحالة الآن':'Current'}</span>` : ''}
                </div>`).join('')}
            </div>
            ${isSeller && status !== 'delivered' ? `
            <div class="flex gap-2 border-t border-gray-100 pt-3">
              ${status === 'processing' ? `
              <button onclick="OrderWorkspace.markProductShipped('${order.id}')"
                class="flex-1 text-sm font-bold bg-navy-700 text-white py-2.5 rounded-xl hover:bg-navy-800 transition flex items-center justify-center gap-2">
                <i class="fa-solid fa-truck"></i>${isAr ? 'تحديد كـ: تم الشحن' : 'Mark as shipped'}
              </button>` : ''}
              <button onclick="OrderWorkspace.markProductDelivered('${order.id}')"
                class="flex-1 text-sm font-bold bg-turquoise-600 text-white py-2.5 rounded-xl hover:bg-turquoise-700 transition flex items-center justify-center gap-2">
                <i class="fa-solid fa-house-circle-check"></i>${isAr ? 'تحديد كـ: تم التسليم' : 'Mark as delivered'}
              </button>
            </div>` : ''}
          </div>`;
    }

    async function markProductShipped(orderId, orderDataOverride) {
        const isAr = AppState.language !== 'en';
        showLoading();
        try {
            const order = orderDataOverride || AppState.currentOrder;
            await window.db.collection(COLLECTIONS.ORDERS).doc(orderId).update({
                shippingStatus: 'shipped',
                updatedAt: _ts(),
            });
            if (order?.buyerId) {
                await window.db.collection(COLLECTIONS.NOTIFICATIONS).add({
                    userId: order.buyerId, type: 'shipping',
                    title: isAr ? 'تم شحن طلبك!' : 'Your order has shipped!',
                    message: `"${order.serviceTitle || ''}" ${isAr ? 'في الطريق إليك' : 'is on its way'}`,
                    orderId, read: false, createdAt: _ts(),
                });
            }
            if (window.rtdb) {
                await window.rtdb.ref(`chats/${orderId}/messages`).push({
                    senderId: AppState.currentUser.uid,
                    senderName: AppState.currentUser.displayName || AppState.currentUser.email || 'Seller',
                    type: 'shipping_update', shippingStatus: 'shipped',
                    createdAt: firebase.database.ServerValue.TIMESTAMP,
                });
            }
            hideLoading();
            showToast(isAr ? '✅ تم تحديث حالة الشحن' : '✅ Shipping status updated', 'success');
            // Only jump into the workspace view if this was called FROM the
            // workspace itself (no override passed); the "Mark shipped"
            // quick-action button on the orders list should just refresh
            // that list in place, not yank the seller into a different page.
            if (!orderDataOverride) openWorkspace(orderId);
            return true;
        } catch (err) {
            hideLoading();
            console.error('[Shipping] markProductShipped failed:', err);
            showToast(isAr ? 'تعذّر تحديث حالة الشحن' : 'Could not update shipping status', 'error');
            return false;
        }
    }

    async function markProductDelivered(orderId, orderDataOverride) {
        const isAr = AppState.language !== 'en';
        showLoading();
        try {
            const order = orderDataOverride || AppState.currentOrder;
            // Sets order.status to DELIVERED too — this reuses the existing
            // buyer "تأكيد الاستلام" / EscrowManager.confirmDelivery button
            // already built for services, instead of inventing a second,
            // separate release-of-funds path just for products.
            await window.db.collection(COLLECTIONS.ORDERS).doc(orderId).update({
                shippingStatus: 'delivered',
                status: ORDER_STATUS.DELIVERED,
                deliveredAt: _ts(),
                updatedAt: _ts(),
            });
            if (order?.buyerId) {
                await window.db.collection(COLLECTIONS.NOTIFICATIONS).add({
                    userId: order.buyerId, type: 'shipping',
                    title: isAr ? 'تم تسليم طلبك!' : 'Your order was delivered!',
                    message: `"${order.serviceTitle || ''}" ${isAr ? 'تم تسليمه — راجع الطلب وأكّد الاستلام' : 'has been delivered — please confirm receipt'}`,
                    orderId, read: false, createdAt: _ts(),
                });
            }
            if (window.rtdb) {
                await window.rtdb.ref(`chats/${orderId}/messages`).push({
                    senderId: AppState.currentUser.uid,
                    senderName: AppState.currentUser.displayName || AppState.currentUser.email || 'Seller',
                    type: 'shipping_update', shippingStatus: 'delivered',
                    createdAt: firebase.database.ServerValue.TIMESTAMP,
                });
            }
            hideLoading();
            showToast(isAr ? '✅ تم تحديث حالة الشحن' : '✅ Shipping status updated', 'success');
            if (!orderDataOverride) openWorkspace(orderId);
            return true;
        } catch (err) {
            hideLoading();
            console.error('[Shipping] markProductDelivered failed:', err);
            showToast(isAr ? 'تعذّر تحديث حالة الشحن' : 'Could not update shipping status', 'error');
            return false;
        }
    }

    function _renderStageTracker(order, isSeller, isAr) {
        const stages = (order.customStages && order.customStages.length) ? order.customStages : DEFAULT_STAGES[isAr ? 'ar' : 'en'];
        const current = Math.min(order.currentStageIndex || 0, stages.length - 1);

        if (isSeller) {
            return `
              <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 class="font-black text-gray-900 mb-1 flex items-center gap-2">
                  <i class="fa-solid fa-list-check text-navy-700"></i>
                  ${isAr ? 'مراحل تنفيذ الطلب' : 'Work Stages'}
                </h3>
                <p class="text-xs text-gray-400 mb-4">${isAr ? 'عدّل أسماء المراحل براحتك، واضغط على أي مرحلة لتحديدها كالمرحلة الحالية للعميل.' : "Edit the stage names as you like, and click any stage to mark it as the buyer's current stage."}</p>
                <div id="stageEditorList" class="space-y-2 mb-3">
                  ${stages.map((name, i) => `
                    <div class="flex items-center gap-2">
                      <button onclick="OrderWorkspace.setOrderStage('${order.id}',${i})"
                        class="w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-black transition ${i < current ? 'bg-turquoise-500 text-white' : i === current ? 'bg-navy-800 text-white' : 'bg-gray-100 text-gray-400'}">
                        ${i < current ? '<i class="fa-solid fa-check"></i>' : i + 1}
                      </button>
                      <input type="text" class="form-input flex-1 text-sm py-2 stage-name-input" value="${escapeHtml(name)}" maxlength="60">
                    </div>`).join('')}
                </div>
                <div class="flex gap-2">
                  <button onclick="OrderWorkspace.addStageField('${order.id}')" class="text-xs font-bold text-navy-700 hover:underline">+ ${isAr?'إضافة مرحلة':'Add stage'}</button>
                  <button onclick="OrderWorkspace.saveCustomStages('${order.id}')" class="mr-auto text-xs font-bold bg-secondary text-white px-4 py-2 rounded-xl hover:bg-secondary-600 transition">${isAr?'حفظ المراحل':'Save stages'}</button>
                </div>
              </div>`;
        }

        // Buyer / admin: read-only stepper
        return `
          <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h3 class="font-black text-gray-900 mb-4 flex items-center gap-2">
              <i class="fa-solid fa-list-check text-navy-700"></i>
              ${isAr ? 'مرحلة تنفيذ الطلب' : 'Work Stage'}
            </h3>
            <div class="space-y-3">
              ${stages.map((name, i) => `
                <div class="flex items-center gap-3">
                  <div class="w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-black ${i < current ? 'bg-turquoise-500 text-white' : i === current ? 'bg-navy-800 text-white' : 'bg-gray-100 text-gray-400'}">
                    ${i < current ? '<i class="fa-solid fa-check"></i>' : i + 1}
                  </div>
                  <span class="text-sm ${i === current ? 'font-black text-navy-900' : i < current ? 'text-gray-400 line-through' : 'text-gray-400'}">${escapeHtml(name)}</span>
                  ${i === current ? `<span class="text-xs text-turquoise-600 font-bold mr-auto">${isAr?'جارٍ الآن':'In progress'}</span>` : ''}
                </div>`).join('')}
            </div>
          </div>`;
    }

    function addStageField(orderId) {
        const list = document.getElementById('stageEditorList');
        if (!list) return;
        const div = document.createElement('div');
        div.className = 'flex items-center gap-2';
        div.innerHTML = `
          <span class="w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-black bg-gray-100 text-gray-400">${list.children.length + 1}</span>
          <input type="text" class="form-input flex-1 text-sm py-2 stage-name-input" placeholder="${AppState.language==='en'?'New stage name':'اسم المرحلة الجديدة'}" maxlength="60">`;
        list.appendChild(div);
    }

    async function saveCustomStages(orderId) {
        const isAr = AppState.language !== 'en';
        const names = Array.from(document.querySelectorAll('.stage-name-input')).map(i => i.value.trim()).filter(Boolean);
        if (names.length < 1) { showToast(isAr ? 'لازم مرحلة واحدة على الأقل' : 'At least one stage is required', 'warning'); return; }
        showLoading();
        try {
            await window.db.collection(COLLECTIONS.ORDERS).doc(orderId).update({
                customStages: names,
                updatedAt: _ts(),
            });
            hideLoading();
            showToast(isAr ? '✅ اتحفظت المراحل' : '✅ Stages saved', 'success');
            openWorkspace(orderId);
        } catch (err) {
            hideLoading();
            showToast(t('general.error') + ': ' + err.message, 'error');
        }
    }

    async function setOrderStage(orderId, index) {
        const isAr = AppState.language !== 'en';
        showLoading();
        try {
            const snap = await window.db.collection(COLLECTIONS.ORDERS).doc(orderId).get();
            const order = snap.data() || {};
            const stages = (order.customStages && order.customStages.length) ? order.customStages : DEFAULT_STAGES[isAr ? 'ar' : 'en'];

            const batch = window.db.batch();
            batch.update(window.db.collection(COLLECTIONS.ORDERS).doc(orderId), {
                currentStageIndex: index,
                customStages: order.customStages || stages, // persist the defaults the first time a stage is set
                updatedAt: _ts(),
            });
            if (order.buyerId) {
                batch.set(window.db.collection(COLLECTIONS.NOTIFICATIONS).doc(), {
                    userId: order.buyerId, type: 'stage_update',
                    title: isAr ? '📍 تحديث في مرحلة طلبك' : '📍 Your order stage was updated',
                    message: isAr ? `المرحلة الحالية: ${stages[index]}` : `Current stage: ${stages[index]}`,
                    orderId, read: false, createdAt: _ts(),
                });
            }
            await batch.commit();
            hideLoading();
            openWorkspace(orderId);
        } catch (err) {
            hideLoading();
            showToast(t('general.error') + ': ' + err.message, 'error');
        }
    }

    // ── Seller responds to a pending custom request (accept/reject) ──────────
    // Plain status update — allowed by Firestore rules since it never touches
    // price/escrow/payment fields and never sets status to "completed".
    async function respondToRequest(orderId, decision) {
        const isAr = AppState.language !== 'en';
        if (decision === 'reject') {
            const ok = await new Promise(res => {
                const overlay = document.createElement('div');
                overlay.className = 'fixed inset-0 bg-black/70 z-[99999] flex items-center justify-center p-4';
                overlay.innerHTML = `<div class="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center">
                  <p class="text-gray-700 font-bold mb-6">${isAr ? 'متأكد إنك عايز ترفض الطلب ده؟' : 'Reject this request?'}</p>
                  <div class="flex gap-3">
                    <button id="rjCancel" class="btn-secondary flex-1 py-3">${t('general.cancel')}</button>
                    <button id="rjOk" class="btn-primary flex-1 py-3 bg-red-600">${isAr ? 'رفض' : 'Reject'}</button>
                  </div></div>`;
                document.body.appendChild(overlay);
                overlay.querySelector('#rjOk').onclick = () => { overlay.remove(); res(true); };
                overlay.querySelector('#rjCancel').onclick = () => { overlay.remove(); res(false); };
            });
            if (!ok) return;
        }
        showLoading();
        try {
            const order = AppState.currentOrder || {};
            await window.db.collection(COLLECTIONS.ORDERS).doc(orderId).update({
                status: decision === 'accept' ? ORDER_STATUS.ACCEPTED : ORDER_STATUS.CANCELLED,
                updatedAt: _ts(),
            });

            // ⚠️ ADDED: tell the buyer explicitly it's time to pay — a
            // notification doc + a chat message — instead of relying on them
            // to notice the status changed next time they open the app.
            if (decision === 'accept' && order.buyerId) {
                try {
                    await window.db.collection(COLLECTIONS.NOTIFICATIONS).add({
                        userId:    order.buyerId,
                        type:      'request_accepted',
                        title:     isAr ? '✅ البائع وافق على طلبك!' : '✅ Seller accepted your request!',
                        message:   isAr ? `ادفع الآن عشان البائع يبدأ تنفيذ "${order.serviceTitle||''}"` : `Pay now so the seller can start "${order.serviceTitle||''}"`,
                        orderId,
                        read:      false,
                        createdAt: _ts(),
                    });
                } catch (_) { /* non-critical */ }
                try {
                    if (window.rtdb) {
                        await window.rtdb.ref(`chats/${orderId}/messages`).push({
                            senderId:   AppState.currentUser.uid,
                            senderName: AppState.currentUser.displayName || AppState.currentUser.email || 'Seller',
                            type:       'text',
                            text:       isAr ? '✅ وافقت على طلبك — تقدر تدفع دلوقتي عشان أبدأ الشغل.' : "✅ I accepted your request — you can pay now so I can start.",
                            createdAt:  firebase.database.ServerValue.TIMESTAMP,
                        });
                    }
                } catch (_) { /* non-critical */ }
            }

            hideLoading();
            showToast(decision === 'accept'
                ? (isAr ? 'تم قبول الطلب — العميل هيقدر يدفع دلوقتي' : 'Request accepted — the buyer can now pay')
                : (isAr ? 'تم رفض الطلب' : 'Request declined'), 'success');
            openWorkspace(orderId);
        } catch (err) {
            hideLoading();
            showToast(t('general.error') + ': ' + err.message, 'error');
        }
    }

    // ── Expose API ────────────────────────────────────────────────────────────
    window.OrderWorkspace = {
        openWorkspace, sendMessage, handleChatKeydown, sendFile, deleteMessage,
        deliverService, requestRevision,
        setRating, submitReview, previewDeliveryFiles,
        handleDeliveryDrop, wsActivateTab,
        sendBuyerInstructions, previewBuyerFiles,
        respondToRequest,
        addStageField, saveCustomStages, setOrderStage,
        markProductShipped, markProductDelivered,
    };
    window.openWorkspace = openWorkspace;
    window.wsActivateTab = wsActivateTab;

    console.log('✅ OrderWorkspace v3.4 — Chat | Files | Delivery | Timeline');
})();
