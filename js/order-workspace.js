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
    let _chatListener   = null;
    let _selectedRating = 0;
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

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
            _renderWorkspace(order);
            navigateTo('workspace');
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
                <h1 class="font-black text-gray-900 truncate">${order.serviceTitle || t('orders.workspace')}</h1>
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
                      <i class="fa-solid fa-comments text-5xl mb-3 opacity-30"></i>
                      <p class="font-bold">${isAr ? 'لا توجد رسائل بعد' : 'No messages yet'}</p>
                      <p class="text-sm mt-1">${isAr ? 'ابدأ المحادثة مع الطرف الآخر' : 'Start the conversation'}</p>
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
                  <div class="border-t border-gray-200 p-3 bg-white flex-shrink-0">
                    <!-- Quick emoji buttons -->
                    <div class="flex gap-2 mb-2 overflow-x-auto pb-1" style="scrollbar-width:none">
                      ${['👍','✅','🔄','📎','⏰','💡','🎉','❓'].map(e =>
                        `<button onclick="OrderWorkspace.insertEmoji('${e}')"
                          class="text-lg hover:scale-125 transition-transform flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">${e}</button>`
                      ).join('')}
                    </div>
                    <div class="flex gap-2 items-end">
                      <div class="flex-1">
                        <textarea id="chatInput" rows="1"
                          class="form-input resize-none text-sm w-full"
                          placeholder="${t('orders.send_msg')}"
                          onkeydown="OrderWorkspace.handleChatKeydown(event)"
                          oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,120)+'px'"></textarea>
                      </div>
                      <div class="flex gap-2 flex-shrink-0">
                        <!-- Attach file -->
                        <label class="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-gray-600 hover:bg-brand-100 hover:text-brand-600 transition cursor-pointer"
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
                          class="w-10 h-10 bg-brand-600 text-white rounded-xl flex items-center justify-center hover:bg-brand-700 transition active:scale-95">
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
                  <i class="fa-solid fa-receipt text-brand-600"></i>
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
                    <span class="font-black text-brand-700">${formatCurrency(order.price || 0)}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">${isAr ? 'نوع الطلب' : 'Order Type'}</span>
                    <span class="font-bold text-green-600">${isAr ? 'طلب مباشر' : 'Direct Request'}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">${isBuyer ? (isAr ? 'البائع' : 'Seller') : (isAr ? 'المشتري' : 'Buyer')}</span>
                    <span class="font-bold">${isBuyer ? (order.sellerName || '—') : (order.buyerName || '—')}</span>
                  </div>
                </div>
              </div>

              <!-- ── SELLER: Delivery Panel ───────────────────────────── -->
              ${isSeller ? `
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
                  class="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-brand-400 hover:bg-brand-50 transition cursor-pointer mb-3"
                  onclick="document.getElementById('deliveryFiles').click()"
                  ondragover="event.preventDefault();this.classList.add('border-brand-500','bg-brand-50')"
                  ondragleave="this.classList.remove('border-brand-500','bg-brand-50')"
                  ondrop="event.preventDefault();this.classList.remove('border-brand-500','bg-brand-50');OrderWorkspace.handleDeliveryDrop(event)">
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
                  <i class="fa-solid fa-paper-plane text-brand-600"></i>
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
                <div class="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center mb-3 hover:border-brand-400 hover:bg-brand-50 transition cursor-pointer"
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

              <!-- ── BUYER: Review Form ────────────────────────────────── -->
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

        // EscrowManager.renderEscrowBanner disabled — no payment system
        _loadTimeline(order);
        _loadFiles(orderId);
        wsActivateTab('chat');
    }

    // ── Tab Builder ───────────────────────────────────────────────────────────
    function _tab(id, i18nKey, icon) {
        return `<button onclick="wsActivateTab('${id}')" id="ws-tab-btn-${id}"
          class="ws-tab-btn flex-1 py-3 text-sm font-bold text-gray-500 hover:text-brand-600 hover:bg-brand-50 transition flex items-center justify-center gap-2 border-b-2 border-transparent">
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
                btn.classList.toggle('text-brand-600',     id === tab);
                btn.classList.toggle('border-brand-500',   id === tab);
                btn.classList.toggle('bg-white',           id === tab);
                btn.classList.toggle('text-gray-500',      id !== tab);
                btn.classList.toggle('border-transparent', id !== tab);
            }
        });
    }

    // ── Real-time Chat Listener ───────────────────────────────────────────────
    function _startChatListener(orderId) {
        if (_chatListener) { _chatListener(); _chatListener = null; }

        let query;
        try {
            query = window.db
                .collection(COLLECTIONS.MESSAGES)
                .where('orderId', '==', orderId)
                .orderBy('createdAt', 'asc')
                .limitToLast(100);
        } catch(e) {
            console.warn('[Chat] Query error:', e);
            return;
        }

        _chatListener = query.onSnapshot(snap => {
            const container = document.getElementById('chatMessages');
            if (!container) return;

            if (snap.empty) {
                const isAr = AppState.language !== 'en';
                container.innerHTML = `
                  <div class="text-center text-gray-400 py-10">
                    <i class="fa-solid fa-comments text-5xl mb-3 opacity-30"></i>
                    <p class="font-bold">${isAr ? 'لا توجد رسائل بعد' : 'No messages yet'}</p>
                    <p class="text-sm mt-1">${isAr ? 'ابدأ المحادثة مع الطرف الآخر' : 'Start the conversation'}</p>
                  </div>`;
                return;
            }

            const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60;
            container.innerHTML = snap.docs.map(doc => _renderMessage(doc.data(), doc.id)).join('');
            if (wasAtBottom) container.scrollTop = container.scrollHeight;

        }, err => {
            if (err.code === 'failed-precondition') {
                console.warn('[Chat] Index missing — create at:', err.message?.match(/https?:\/\/[^\s]+/)?.[0] || 'Firebase Console');
            } else {
                console.warn('[Chat] listener error:', err.code, err.message);
            }
        });
    }

    // ── Render a single message ───────────────────────────────────────────────
    function _renderMessage(msg, msgId) {
        const userId     = AppState.currentUser?.uid;
        const isMine     = msg.senderId === userId;
        const isFile     = msg.type === 'file';
        const isImage    = msg.type === 'image';
        const isDelivery = msg.type === 'delivery';
        const isAr       = AppState.language !== 'en';

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
                    <p class="font-black text-green-800 text-sm">${isAr ? '📦 تم تسليم الخدمة' : '📦 Service Delivered'}</p>
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
            <div class="flex ${isMine ? 'justify-end' : 'justify-start'} mb-1">
              <div>
                ${!isMine ? `<p class="text-xs text-gray-400 mb-1 mx-1">${_escapeHtml(msg.senderName || '—')}</p>` : ''}
                <div class="max-w-xs">${_fileDownloadCard(msg.file)}</div>
                <p class="text-xs text-gray-400 mt-1 mx-1 ${isMine ? 'text-right' : 'text-left'}">${formatTimeAgo(msg.createdAt)}</p>
              </div>
            </div>`;
        }

        // ── Image message ─────────────────────────────────────────────────────
        if (isImage) {
            return `
            <div class="flex ${isMine ? 'justify-end' : 'justify-start'} mb-1">
              <div>
                ${!isMine ? `<p class="text-xs text-gray-400 mb-1 mx-1">${_escapeHtml(msg.senderName || '—')}</p>` : ''}
                <a href="${msg.file?.url}" target="_blank" rel="noopener">
                  <img src="${msg.file?.url}" alt="${_escapeHtml(msg.file?.name || 'image')}"
                    class="max-w-xs rounded-2xl border border-gray-200 hover:opacity-90 transition cursor-pointer"
                    loading="lazy" style="max-height:200px;object-fit:cover">
                </a>
                <p class="text-xs text-gray-400 mt-1 mx-1 ${isMine ? 'text-right' : 'text-left'}">${formatTimeAgo(msg.createdAt)}</p>
              </div>
            </div>`;
        }

        // ── Text message ──────────────────────────────────────────────────────
        return `
        <div class="flex ${isMine ? 'justify-end' : 'justify-start'} mb-1">
          <div class="max-w-xs lg:max-w-sm">
            ${!isMine ? `<p class="text-xs text-gray-400 mb-1 mx-2">${_escapeHtml(msg.senderName || '—')}</p>` : ''}
            <div class="chat-bubble ${isMine ? 'sent' : 'received'}">
              <p class="text-sm leading-relaxed whitespace-pre-wrap break-words">${_linkify(_escapeHtml(msg.text || ''))}</p>
            </div>
            <p class="text-xs text-gray-400 mt-0.5 mx-2 ${isMine ? 'text-right' : 'text-left'}">
              ${formatTimeAgo(msg.createdAt)}
              ${isMine ? '<i class="fa-solid fa-check-double ml-1 opacity-60"></i>' : ''}
            </p>
          </div>
        </div>`;
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
          class="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:border-brand-400 hover:shadow-md transition group w-full">
          <i class="fa-solid ${icon} text-2xl flex-shrink-0"></i>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-bold text-gray-900 truncate">${_escapeHtml(file.name || 'File')}</p>
            <p class="text-xs text-gray-400">${_formatFileSize(file.size)}</p>
          </div>
          <i class="fa-solid fa-download text-gray-300 group-hover:text-brand-600 transition flex-shrink-0"></i>
        </a>`;
    }

    // ── Send text message ─────────────────────────────────────────────────────
    async function sendMessage() {
        const input = document.getElementById('chatInput');
        const text  = input?.value?.trim();
        if (!text || !_currentOrderId || !AppState.currentUser) return;

        input.value = '';
        input.style.height = 'auto';

        try {
            await window.db.collection(COLLECTIONS.MESSAGES).add({
                orderId:    _currentOrderId,
                senderId:   AppState.currentUser.uid,
                senderName: AppState.currentUser.displayName || AppState.currentUser.email || 'User',
                text:       sanitizeInput(text),
                type:       'text',
                createdAt:  _ts(),
            });
            // Update order's lastMessageAt for sorting
            await window.db.collection(COLLECTIONS.ORDERS).doc(_currentOrderId)
                .update({ lastMessageAt: _ts(), updatedAt: _ts() })
                .catch(() => {}); // Non-critical
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

    function insertEmoji(emoji) {
        const input = document.getElementById('chatInput');
        if (!input) return;
        const pos   = input.selectionStart || 0;
        const val   = input.value;
        input.value = val.slice(0, pos) + emoji + val.slice(pos);
        input.focus();
        input.selectionStart = input.selectionEnd = pos + emoji.length;
        input.dispatchEvent(new Event('input'));
    }

    // ── Send file from chat input ─────────────────────────────────────────────
    async function sendFile(inputEl) {
        const files = Array.from(inputEl.files || []);
        if (!files.length || !_currentOrderId || !AppState.currentUser) return;

        const isAr   = AppState.language !== 'en';
        const userId = AppState.currentUser.uid;

        for (const file of files) {
            if (file.size > MAX_FILE_SIZE) {
                showToast(isAr ? `الملف ${file.name} تجاوز الحد (50MB)` : `${file.name} exceeds limit (50MB)`, 'warning');
                continue;
            }
            showLoading(isAr ? `جاري رفع ${file.name}...` : `Uploading ${file.name}...`);
            try {
                const url   = await uploadFile(file, 'chat_files', `${_currentOrderId}_${userId}_${Date.now()}`);
                const isImg = file.type.startsWith('image/');
                hideLoading();
                await window.db.collection(COLLECTIONS.MESSAGES).add({
                    orderId:    _currentOrderId,
                    senderId:   userId,
                    senderName: AppState.currentUser.displayName || AppState.currentUser.email || 'User',
                    type:       isImg ? 'image' : 'file',
                    file:       { name: file.name, url, size: file.size, type: file.type },
                    createdAt:  _ts(),
                });
            } catch (err) {
                hideLoading();
                console.error('[Chat] sendFile error:', err);
                showToast((isAr ? 'فشل رفع ' : 'Failed to upload ') + file.name, 'error');
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
                if (file.size > MAX_FILE_SIZE) {
                    showToast(`${file.name} > 50MB`, 'warning');
                    continue;
                }
                const url = await uploadFile(file, 'deliveries', `${_currentOrderId}_${Date.now()}`);
                uploadedFiles.push({ name: file.name, url, size: file.size, type: file.type });
            }

            const batch = window.db.batch();

            batch.update(window.db.collection(COLLECTIONS.ORDERS).doc(_currentOrderId), {
                status:      ORDER_STATUS.DELIVERED,
                deliveredAt: _ts(),
                updatedAt:   _ts(),
            });

            const msgRef = window.db.collection(COLLECTIONS.MESSAGES).doc();
            batch.set(msgRef, {
                orderId:    _currentOrderId,
                senderId:   AppState.currentUser.uid,
                senderName: AppState.currentUser.displayName || AppState.currentUser.email || 'Seller',
                type:       'delivery',
                note:       sanitizeInput(note),
                files:      uploadedFiles,
                createdAt:  _ts(),
            });

            const order = AppState.currentOrder;
            if (order?.buyerId) {
                const notifRef = window.db.collection(COLLECTIONS.NOTIFICATIONS).doc();
                batch.set(notifRef, {
                    userId:    order.buyerId,
                    type:      'delivery',
                    title:     isAr ? '📦 تم تسليم الخدمة!' : '📦 Service Delivered!',
                    message:   `"${order.serviceTitle || ''}" ${isAr ? 'تم تسليمها' : 'has been delivered'}`,
                    orderId:   _currentOrderId,
                    read:      false,
                    createdAt: _ts(),
                });
            }

            await batch.commit();
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
            await window.db.collection(COLLECTIONS.MESSAGES).add({
                orderId,
                senderId:   AppState.currentUser.uid,
                senderName: AppState.currentUser.displayName || AppState.currentUser.email || 'Buyer',
                text:       `🔄 ${isAr ? 'طلب مراجعة' : 'Revision Request'}: ${sanitizeInput(note)}`,
                type:       'text',
                createdAt:  _ts(),
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
            showToast(isAr ? '⭐ شكراً على تقييمك!' : '⭐ Thank you for your review!', 'success');
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
            <i class="fa-solid fa-file text-brand-500 flex-shrink-0"></i>
            <span class="flex-1 truncate font-medium">${_escapeHtml(f.name)}</span>
            <span class="text-gray-400 text-xs flex-shrink-0">${_formatFileSize(f.size)}</span>
            ${f.size > MAX_FILE_SIZE ? '<span class="text-red-500 text-xs font-bold">!</span>' : '<i class="fa-solid fa-check text-green-500 text-xs"></i>'}
          </div>`).join('');
    }

    // ── Order Timeline ────────────────────────────────────────────────────────
    function _loadTimeline(order) {
        const container = document.getElementById('orderTimeline');
        if (!container) return;
        const isAr  = AppState.language !== 'en';
        const steps = [
            { icon: 'fa-paper-plane',    color: 'bg-blue-500',   label: isAr ? 'تم تقديم الطلب'        : 'Request Placed',      date: order.createdAt,   done: true },
            { icon: 'fa-comments',       color: 'bg-brand-500',  label: isAr ? 'التواصل مع مقدم الخدمة': 'Discussing with Seller', date: null,             done: [ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.DELIVERED, ORDER_STATUS.COMPLETED, ORDER_STATUS.PENDING].includes(order.status) },
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

    // ── Load files tab ────────────────────────────────────────────────────────
    function _loadFiles(orderId) {
        let query;
        try {
            query = window.db.collection(COLLECTIONS.MESSAGES)
                .where('orderId', '==', orderId)
                .where('type', 'in', ['file', 'image', 'delivery'])
                .orderBy('createdAt', 'desc');
        } catch(e) {
            query = window.db.collection(COLLECTIONS.MESSAGES)
                .where('orderId', '==', orderId)
                .where('type', 'in', ['file', 'image', 'delivery']);
        }

        query.get().then(snap => {
            const container  = document.getElementById('filesList');
            const countEl    = document.getElementById('filesCount');
            if (!container) return;

            const files = [];
            snap.docs.forEach(doc => {
                const d = doc.data();
                if ((d.type === 'file' || d.type === 'image') && d.file) {
                    files.push({ ...d.file, sentBy: d.senderName, sentAt: d.createdAt });
                }
                if (d.type === 'delivery' && d.files) {
                    d.files.forEach(f => files.push({ ...f, sentBy: d.senderName, sentAt: d.createdAt, isDelivery: true }));
                }
            });

            if (countEl) countEl.textContent = files.length + (AppState.language !== 'en' ? ' ملف' : ' files');

            if (files.length === 0) return;
            container.innerHTML = files.map(f => `
              <div class="group">
                <div class="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:border-brand-400 hover:shadow-sm transition">
                  ${_fileDownloadCard(f)}
                </div>
                <p class="text-xs text-gray-400 mt-1 px-1">${f.sentBy || '—'} · ${formatTimeAgo(f.sentAt)} ${f.isDelivery ? '📦' : ''}</p>
              </div>`).join('');
        }).catch(err => {
            if (err.code !== 'failed-precondition') console.warn('[Files]', err.code);
        });
    }

    // ── Utilities ─────────────────────────────────────────────────────────────
    function _escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function _linkify(str) {
        return str.replace(/(https?:\/\/[^\s<>"]+)/g,
            '<a href="$1" target="_blank" rel="noopener noreferrer" class="underline text-brand-600 hover:text-brand-800">$1</a>');
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
                if (file.size > 50 * 1024 * 1024) {
                    showToast((isAr ? 'الملف كبير جداً: ' : 'File too large: ') + file.name, 'warning');
                    continue;
                }
                const url = await uploadFile(file, 'order_buyer_files', orderId + '_' + Date.now());
                uploadedFiles.push({ name: file.name, url, size: file.size, type: file.type });
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

            // Send as chat message
            const msgRef = window.db.collection(COLLECTIONS.MESSAGES).doc();
            batch.set(msgRef, {
                orderId,
                senderId:   AppState.currentUser.uid,
                senderName: AppState.currentUser.displayName || AppState.currentUser.email || 'Buyer',
                type:       'buyer_instructions',
                text:       sanitizeInput(text),
                files:      uploadedFiles,
                createdAt:  _ts(),
            });

            // Notify seller
            const order = AppState.currentOrder;
            if (order && order.sellerId) {
                const notifRef = window.db.collection(COLLECTIONS.NOTIFICATIONS).doc();
                batch.set(notifRef, {
                    userId:    order.sellerId,
                    type:      'buyer_instructions',
                    title:     isAr ? '📋 المشتري أرسل تعليماته!' : '📋 Buyer sent instructions!',
                    message:   (AppState.currentUser.displayName || 'Buyer') + (isAr ? ' أرسل تعليمات لـ ' : ' sent instructions for ') + (order.serviceTitle || ''),
                    orderId,
                    read:      false,
                    createdAt: _ts(),
                });
            }

            await batch.commit();
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
              <i class="fa-solid fa-file text-brand-500 flex-shrink-0"></i>
              <span class="flex-1 truncate font-medium">${f.name}</span>
              <span class="text-gray-400 text-xs flex-shrink-0">${f.size > 1048576 ? (f.size/1048576).toFixed(1)+'MB' : (f.size/1024).toFixed(0)+'KB'}</span>
              ${f.size > 50*1024*1024 ? '<i class="fa-solid fa-exclamation-triangle text-red-500 text-xs"></i>' : '<i class="fa-solid fa-check text-green-500 text-xs"></i>'}
            </div>`).join('');
    }

    // ── Expose API ────────────────────────────────────────────────────────────
    window.OrderWorkspace = {
        openWorkspace, sendMessage, handleChatKeydown, sendFile,
        insertEmoji, deliverService, requestRevision,
        setRating, submitReview, previewDeliveryFiles,
        handleDeliveryDrop, wsActivateTab,
        sendBuyerInstructions, previewBuyerFiles,
    };
    window.openWorkspace = openWorkspace;
    window.wsActivateTab = wsActivateTab;

    console.log('✅ OrderWorkspace v3.4 — Chat | Files | Delivery | Timeline');
})();
