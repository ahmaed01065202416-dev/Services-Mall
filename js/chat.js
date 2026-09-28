/**
 * ============================================================================
 * CHAT.JS — Mall Services Platform v1.0
 * Dedicated Real-Time Chat Module
 * Features: text · file · image · emoji · typing indicator · read receipts
 * Used by: OrderWorkspace (injected into workspace panel)
 * ============================================================================
 */
(function () {
    'use strict';

    // ── Safe timestamp ────────────────────────────────────────────────────────
    function _ts() {
        try { return firebase.firestore.FieldValue.serverTimestamp(); }
        catch(e) { return new Date(); }
    }

    const MAX_FILE_MB  = 50;
    const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

    // Active listeners per orderId
    const _listeners = {};
    let   _typingTimer = null;
    let   _isTyping    = false;

    // ── Init chat in a container element ─────────────────────────────────────
    function initChat(orderId, containerEl, opts) {
        opts = opts || {};
        if (!orderId || !containerEl || !window.db) return;

        const isAr     = AppState.language !== 'en';
        const userId   = AppState.currentUser?.uid;
        const userName = AppState.currentUser?.displayName || AppState.currentUser?.email || 'User';

        // Render chat shell
        containerEl.innerHTML = _chatShell(isAr);

        // Start listener
        _subscribeMessages(orderId, containerEl, userId, isAr);

        // Wire input events
        const input = containerEl.querySelector('.chat-text-input');
        const sendBtn = containerEl.querySelector('.chat-send-btn');
        const fileBtn = containerEl.querySelector('.chat-file-input');

        if (input) {
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    _sendText(orderId, input, userId, userName);
                }
                // Typing indicator
                _handleTyping(orderId, userId, userName, isAr);
            });
            input.addEventListener('input', () => {
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, 120) + 'px';
            });
        }
        if (sendBtn) sendBtn.addEventListener('click', () => _sendText(orderId, input, userId, userName));
        if (fileBtn) fileBtn.addEventListener('change', e => _sendFiles(orderId, e.target, userId, userName, isAr));

        // Emoji buttons
        containerEl.querySelectorAll('.emoji-quick').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!input) return;
                const pos = input.selectionStart || input.value.length;
                input.value = input.value.slice(0, pos) + btn.dataset.emoji + input.value.slice(pos);
                input.focus();
                input.selectionStart = input.selectionEnd = pos + btn.dataset.emoji.length;
            });
        });
    }

    // ── Chat shell HTML ───────────────────────────────────────────────────────
    function _chatShell(isAr) {
        const emojis = ['👍','✅','🔄','📎','⏰','💡','🎉','❓','👏','🙏'];
        return `
        <div class="flex flex-col h-full bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm">

          <!-- Messages area -->
          <div class="chat-messages-area flex-1 overflow-y-auto p-4 space-y-2 scroll-smooth bg-gray-50"
            style="scroll-behavior:smooth">
            <div class="chat-messages-inner space-y-2"></div>
            <div class="chat-empty-state text-center py-10 text-gray-400">
              <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <i class="fa-solid fa-comments text-2xl opacity-40"></i>
              </div>
              <p class="font-bold text-sm">${isAr ? 'لا توجد رسائل بعد' : 'No messages yet'}</p>
              <p class="text-xs mt-1 opacity-70">${isAr ? 'ابدأ المحادثة الآن' : 'Start the conversation'}</p>
            </div>
          </div>

          <!-- Typing indicator -->
          <div class="chat-typing-indicator hidden px-4 py-2 bg-white border-t border-gray-100">
            <div class="flex items-center gap-2 text-xs text-gray-400">
              <div class="flex gap-0.5">
                <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:.12s"></span>
                <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:.24s"></span>
              </div>
              <span class="chat-typing-text">${isAr ? 'يكتب...' : 'typing...'}</span>
            </div>
          </div>

          <!-- Input area -->
          <div class="chat-input-area border-t border-gray-200 bg-white p-3">
            <!-- Quick emojis -->
            <div class="flex gap-1 mb-2 overflow-x-auto" style="scrollbar-width:none;-ms-overflow-style:none">
              ${emojis.map(e =>
                `<button class="emoji-quick flex-shrink-0 w-7 h-7 text-base hover:bg-gray-100 rounded-lg transition hover:scale-110" data-emoji="${e}">${e}</button>`
              ).join('')}
            </div>

            <!-- Input row -->
            <div class="flex gap-2 items-end">
              <div class="flex-1 relative">
                <textarea class="chat-text-input form-input w-full resize-none text-sm py-2.5 px-3 pr-10"
                  rows="1" placeholder="${isAr ? 'اكتب رسالة...' : 'Type a message...'}"
                  style="max-height:120px"></textarea>
              </div>

              <!-- Attach file -->
              <label class="flex-shrink-0 w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500 hover:bg-brand-100 hover:text-brand-600 transition cursor-pointer"
                title="${isAr ? 'إرفاق ملف' : 'Attach file'}">
                <i class="fa-solid fa-paperclip text-sm"></i>
                <input type="file" class="chat-file-input hidden" multiple accept="*/*">
              </label>

              <!-- Attach image -->
              <label class="flex-shrink-0 w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500 hover:bg-blue-100 hover:text-blue-600 transition cursor-pointer"
                title="${isAr ? 'إرفاق صورة' : 'Attach image'}">
                <i class="fa-solid fa-image text-sm"></i>
                <input type="file" class="chat-file-input hidden" multiple accept="image/*">
              </label>

              <!-- Send -->
              <button class="chat-send-btn flex-shrink-0 w-9 h-9 bg-brand-600 text-white rounded-xl flex items-center justify-center hover:bg-brand-700 transition active:scale-95">
                <i class="fa-solid fa-paper-plane text-sm"></i>
              </button>
            </div>

            <p class="text-xs text-gray-400 mt-1.5">
              ${isAr ? 'Enter للإرسال · Shift+Enter سطر جديد · حد الملف 50MB' : 'Enter to send · Shift+Enter new line · Max 50MB per file'}
            </p>
          </div>
        </div>`;
    }

    // ── Subscribe to Firestore messages ───────────────────────────────────────
    function _subscribeMessages(orderId, containerEl, userId, isAr) {
        // Unsubscribe existing listener for this order
        if (_listeners[orderId]) { _listeners[orderId](); delete _listeners[orderId]; }

        let query;
        try {
            query = window.db
                .collection(COLLECTIONS.MESSAGES)
                .where('orderId', '==', orderId)
                .orderBy('createdAt', 'asc')
                .limitToLast(150);
        } catch(e) {
            console.warn('[Chat] Query build error:', e);
            return;
        }

        _listeners[orderId] = query.onSnapshot(snap => {
            const inner   = containerEl.querySelector('.chat-messages-inner');
            const empty   = containerEl.querySelector('.chat-empty-state');
            const area    = containerEl.querySelector('.chat-messages-area');
            if (!inner) return;

            if (snap.empty) {
                inner.innerHTML = '';
                if (empty) empty.classList.remove('hidden');
                return;
            }
            if (empty) empty.classList.add('hidden');

            const wasAtBottom = area
                ? (area.scrollHeight - area.scrollTop - area.clientHeight) < 80
                : true;

            inner.innerHTML = snap.docs.map(doc => _renderMsg(doc.data(), doc.id, userId, isAr)).join('');

            if (wasAtBottom && area) {
                area.scrollTop = area.scrollHeight;
            }

            // Mark messages as read
            _markRead(orderId, userId, snap.docs);

        }, err => {
            if (err.code === 'failed-precondition') {
                console.warn('[Chat] Composite index needed. Build it:', err.message?.match(/https?:\/\/[^\s]+/)?.[0] || 'Firebase Console');
            } else if (err.code !== 'permission-denied') {
                console.warn('[Chat] Snapshot error:', err.code);
            }
        });
    }

    // ── Render one message ────────────────────────────────────────────────────
    function _renderMsg(msg, msgId, userId, isAr) {
        const isMine     = msg.senderId === userId;
        const isDelivery = msg.type === 'delivery';
        const isFile     = msg.type === 'file';
        const isImage    = msg.type === 'image';
        const isSystem   = msg.type === 'system';

        if (isSystem) {
            return `<div class="flex justify-center my-2">
              <span class="bg-gray-200 text-gray-500 text-xs px-4 py-1.5 rounded-full font-medium">
                ${_esc(msg.text || '')}
              </span>
            </div>`;
        }

        if (isDelivery) {
            return `
            <div class="my-3 mx-1">
              <div class="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-4 shadow-sm">
                <div class="flex items-center gap-3 mb-3">
                  <div class="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i class="fa-solid fa-box-open text-green-600"></i>
                  </div>
                  <div>
                    <p class="font-black text-green-800 text-sm">${isAr ? '📦 تم تسليم الخدمة' : '📦 Service Delivered'}</p>
                    <p class="text-xs text-green-500">${_ago(msg.createdAt)}</p>
                  </div>
                </div>
                ${msg.note ? `
                  <div class="bg-white rounded-xl p-3 border border-green-100 mb-3">
                    <p class="text-gray-700 text-sm leading-relaxed">${_esc(msg.note)}</p>
                  </div>` : ''}
                ${msg.files?.length ? `
                  <div class="space-y-2">
                    <p class="text-xs font-bold text-green-700">
                      ${isAr ? `${msg.files.length} ملف مرفق:` : `${msg.files.length} file(s):`}
                    </p>
                    ${msg.files.map(f => _fileCard(f)).join('')}
                  </div>` : ''}
              </div>
            </div>`;
        }

        if (isImage) {
            return `
            <div class="flex ${isMine ? 'justify-end' : 'justify-start'} mb-1">
              <div class="max-w-xs">
                ${!isMine ? `<p class="text-xs text-gray-400 mb-1 px-1">${_esc(msg.senderName||'')}</p>` : ''}
                <a href="${msg.file?.url || '#'}" target="_blank" rel="noopener">
                  <img src="${msg.file?.url || ''}" alt="${_esc(msg.file?.name||'image')}"
                    class="rounded-2xl border border-gray-200 shadow-sm hover:opacity-90 transition cursor-zoom-in object-cover"
                    loading="lazy" style="max-width:220px;max-height:180px">
                </a>
                <p class="text-xs text-gray-400 mt-0.5 px-1 ${isMine?'text-right':'text-left'}">${_ago(msg.createdAt)}</p>
              </div>
            </div>`;
        }

        if (isFile) {
            return `
            <div class="flex ${isMine ? 'justify-end' : 'justify-start'} mb-1">
              <div class="max-w-xs">
                ${!isMine ? `<p class="text-xs text-gray-400 mb-1 px-1">${_esc(msg.senderName||'')}</p>` : ''}
                ${_fileCard(msg.file)}
                <p class="text-xs text-gray-400 mt-0.5 px-1 ${isMine?'text-right':'text-left'}">${_ago(msg.createdAt)}</p>
              </div>
            </div>`;
        }

        // Text message
        return `
        <div class="flex ${isMine ? 'justify-end' : 'justify-start'} mb-0.5">
          <div class="max-w-xs lg:max-w-sm xl:max-w-md">
            ${!isMine ? `<p class="text-xs text-gray-400 mb-1 px-2 font-medium">${_esc(msg.senderName||'')}</p>` : ''}
            <div class="chat-bubble ${isMine ? 'sent' : 'received'}">
              <p class="text-sm leading-relaxed whitespace-pre-wrap break-words">${_linkify(_esc(msg.text||''))}</p>
            </div>
            <div class="flex items-center gap-1 mt-0.5 px-2 ${isMine?'justify-end':'justify-start'}">
              <p class="text-xs text-gray-400">${_ago(msg.createdAt)}</p>
              ${isMine ? `<i class="fa-solid fa-check-double text-xs ${msg.readBy?.length > 1 ? 'text-brand-500' : 'text-gray-300'}"></i>` : ''}
            </div>
          </div>
        </div>`;
    }

    // ── File card ─────────────────────────────────────────────────────────────
    function _fileCard(file) {
        if (!file?.url) return '';
        const ext  = (file.name || '').split('.').pop().toLowerCase();
        const iconMap = {
            pdf:  'fa-file-pdf text-red-500',
            zip:  'fa-file-zipper text-yellow-500',
            rar:  'fa-file-zipper text-yellow-500',
            doc:  'fa-file-word text-blue-700',  docx: 'fa-file-word text-blue-700',
            xls:  'fa-file-excel text-green-600', xlsx: 'fa-file-excel text-green-600',
            ppt:  'fa-file-powerpoint text-orange-500', pptx: 'fa-file-powerpoint text-orange-500',
            mp4:  'fa-file-video text-purple-500', mov: 'fa-file-video text-purple-500', avi: 'fa-file-video text-purple-500',
            mp3:  'fa-file-audio text-pink-500',  wav: 'fa-file-audio text-pink-500',
            js:   'fa-file-code text-yellow-600',  ts: 'fa-file-code text-blue-500',
            html: 'fa-file-code text-orange-500', css: 'fa-file-code text-blue-400',
            txt:  'fa-file-lines text-gray-500',
            jpg:  'fa-file-image text-blue-500', jpeg: 'fa-file-image text-blue-500',
            png:  'fa-file-image text-blue-500',  gif: 'fa-file-image text-purple-500',
            svg:  'fa-file-image text-green-500', webp: 'fa-file-image text-blue-500',
        };
        const icon = iconMap[ext] || 'fa-file text-gray-500';
        return `
        <a href="${_esc(file.url)}" target="_blank" rel="noopener" download="${_esc(file.name||'file')}"
          class="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:border-brand-400 hover:shadow-md transition group w-full">
          <i class="fa-solid ${icon} text-2xl flex-shrink-0"></i>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-bold text-gray-900 truncate">${_esc(file.name||'File')}</p>
            <p class="text-xs text-gray-400">${_fmtSize(file.size)}</p>
          </div>
          <i class="fa-solid fa-download text-gray-300 group-hover:text-brand-600 transition flex-shrink-0 text-sm"></i>
        </a>`;
    }

    // ── Send text ─────────────────────────────────────────────────────────────
    async function _sendText(orderId, inputEl, userId, userName) {
        const text = inputEl?.value?.trim();
        if (!text || !orderId || !userId) return;

        inputEl.value = '';
        inputEl.style.height = 'auto';
        _clearTyping(orderId, userId);

        try {
            await window.db.collection(COLLECTIONS.MESSAGES).add({
                orderId,
                senderId:   userId,
                senderName: userName,
                text:       sanitizeInput(text),
                type:       'text',
                readBy:     [userId],
                createdAt:  _ts(),
            });
            // Non-critical: update order lastMessageAt
            window.db.collection(COLLECTIONS.ORDERS).doc(orderId)
                .update({ lastMessageAt: _ts(), updatedAt: _ts() })
                .catch(() => {});
        } catch (err) {
            console.error('[Chat] sendText error:', err);
            showToast(t('general.error'), 'error');
        }
    }

    // ── Send files ────────────────────────────────────────────────────────────
    async function _sendFiles(orderId, inputEl, userId, userName, isAr) {
        const files = Array.from(inputEl.files || []);
        if (!files.length) return;

        for (const file of files) {
            if (file.size > MAX_FILE_BYTES) {
                showToast(
                    isAr ? `${file.name}: يتجاوز الحد (${MAX_FILE_MB}MB)` : `${file.name}: exceeds limit (${MAX_FILE_MB}MB)`,
                    'warning'
                );
                continue;
            }
            showLoading(isAr ? `رفع ${file.name}...` : `Uploading ${file.name}...`);
            try {
                const url    = await uploadFile(file, 'chat_files', `${orderId}_${userId}_${Date.now()}`);
                const isImg  = file.type.startsWith('image/');
                hideLoading();
                await window.db.collection(COLLECTIONS.MESSAGES).add({
                    orderId,
                    senderId:   userId,
                    senderName: userName,
                    type:       isImg ? 'image' : 'file',
                    file:       { name: file.name, url, size: file.size, type: file.type },
                    readBy:     [userId],
                    createdAt:  _ts(),
                });
            } catch (err) {
                hideLoading();
                console.error('[Chat] sendFile error:', err);
                showToast((isAr ? 'فشل رفع ' : 'Upload failed: ') + file.name, 'error');
            }
        }
        inputEl.value = '';
    }

    // ── Typing indicator ──────────────────────────────────────────────────────
    function _handleTyping(orderId, userId, userName, isAr) {
        if (_typingTimer) clearTimeout(_typingTimer);
        if (!_isTyping) {
            _isTyping = true;
            window.db.collection(COLLECTIONS.ORDERS).doc(orderId)
                .update({ [`typing_${userId}`]: true, [`typingName_${userId}`]: userName })
                .catch(() => {});
        }
        _typingTimer = setTimeout(() => _clearTyping(orderId, userId), 3000);
    }

    function _clearTyping(orderId, userId) {
        _isTyping = false;
        if (_typingTimer) { clearTimeout(_typingTimer); _typingTimer = null; }
        window.db.collection(COLLECTIONS.ORDERS).doc(orderId)
            .update({ [`typing_${userId}`]: false })
            .catch(() => {});
    }

    // ── Mark messages as read ─────────────────────────────────────────────────
    async function _markRead(orderId, userId, docs) {
        if (!userId) return;
        const unread = docs.filter(d => {
            const data = d.data();
            return data.senderId !== userId && !(data.readBy || []).includes(userId);
        });
        if (!unread.length) return;
        const batch = window.db.batch();
        unread.forEach(d => {
            batch.update(d.ref, {
                readBy: firebase.firestore.FieldValue.arrayUnion(userId)
            });
        });
        try { await batch.commit(); } catch(e) {}
    }

    // ── Unsubscribe listeners ─────────────────────────────────────────────────
    function destroy(orderId) {
        if (orderId && _listeners[orderId]) {
            _listeners[orderId]();
            delete _listeners[orderId];
        }
    }

    function destroyAll() {
        Object.keys(_listeners).forEach(id => {
            _listeners[id]();
            delete _listeners[id];
        });
    }

    // ── Utilities ─────────────────────────────────────────────────────────────
    function _esc(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function _linkify(str) {
        return str.replace(/(https?:\/\/[^\s<>"']+)/g,
            '<a href="$1" target="_blank" rel="noopener noreferrer" ' +
            'class="underline text-brand-500 hover:text-brand-700 break-all">$1</a>');
    }

    function _fmtSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
        return `${(bytes/1048576).toFixed(1)} MB`;
    }

    function _ago(ts) {
        if (!ts) return '';
        try {
            const d = ts.toDate ? ts.toDate() : new Date(ts);
            return typeof formatTimeAgo === 'function' ? formatTimeAgo(ts) : d.toLocaleTimeString('ar-EG', { hour:'2-digit', minute:'2-digit' });
        } catch(e) { return ''; }
    }

    // ── Public API ────────────────────────────────────────────────────────────
    window.ChatModule = { initChat, destroy, destroyAll };

    console.log('✅ ChatModule v1.0 — Real-time · Files · Images · Emojis · Read Receipts');
})();
