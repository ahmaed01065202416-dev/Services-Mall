/**
 * ============================================================================
 * NOTIFICATIONS.JS — Real-time Notifications System v3.0
 * Push notifications · In-app alerts · Email hooks · Badge updates
 * ============================================================================
 */
(function () {
    'use strict';

    let _notifListener = null;

    const NotificationsManager = {

        // ── Start Listener ────────────────────────────────────────────────────
        startListener(userId) {
            if (_notifListener) _notifListener();

            let query = window.db.collection(COLLECTIONS.NOTIFICATIONS)
                .where('userId', '==', userId)
                .orderBy('createdAt', 'desc')
                .limit(30);

            _notifListener = query.onSnapshot(snap => {
                const unread = snap.docs.filter(d => !d.data().read).length;
                this._updateBadge(unread);
                this._renderDropdown(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            }, err => {
                if (err.code === 'failed-precondition') {
                    // Fallback without ordering
                    window.db.collection(COLLECTIONS.NOTIFICATIONS)
                        .where('userId', '==', userId).limit(20).get()
                        .then(snap => {
                            const unread = snap.docs.filter(d => !d.data().read).length;
                            this._updateBadge(unread);
                            this._renderDropdown(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                        }).catch(() => {});
                }
            });
        },

        stopListener() {
            if (_notifListener) { _notifListener(); _notifListener = null; }
        },

        _updateBadge(count) {
            document.querySelectorAll('[data-notif-count]').forEach(el => {
                el.textContent = count > 99 ? '99+' : count;
                el.classList.toggle('hidden', count === 0);
            });
        },

        _renderDropdown(notifications) {
            const list = document.getElementById('notifList');
            if (!list) return;

            const isAr = AppState.language !== 'en';

            if (!notifications || notifications.length === 0) {
                list.innerHTML = `
                <div class="text-center py-10">
                  <i class="fa-regular fa-bell text-gray-200 text-4xl mb-3"></i>
                  <p class="text-gray-400 text-sm">${isAr ? 'لا توجد إشعارات' : 'No notifications'}</p>
                </div>`;
                return;
            }

            list.innerHTML = notifications.map(n => {
                const iconMap = {
                    new_order:           { icon: 'fa-bag-shopping',       bg: 'bg-green-100',  color: 'text-green-600'  },
                    new_request:         { icon: 'fa-paper-plane',        bg: 'bg-brand-100',  color: 'text-brand-600'  },
                    buyer_instructions:  { icon: 'fa-paper-plane',       bg: 'bg-blue-100',   color: 'text-blue-600'   },
                    payment_received: { icon: 'fa-circle-dollar-to-slot', bg: 'bg-blue-100', color: 'text-blue-600'  },
                    delivery:         { icon: 'fa-box-open',            bg: 'bg-purple-100', color: 'text-purple-600' },
                    dispute:          { icon: 'fa-triangle-exclamation', bg: 'bg-red-100',   color: 'text-red-600'   },
                    review:           { icon: 'fa-star',                bg: 'bg-yellow-100', color: 'text-yellow-600' },
                    message:          { icon: 'fa-message',             bg: 'bg-brand-100',  color: 'text-brand-600' },
                    default:          { icon: 'fa-bell',                bg: 'bg-gray-100',   color: 'text-gray-600'  },
                };
                const style = iconMap[n.type] || iconMap.default;

                return `
                <div class="flex gap-3 px-4 py-3 hover:bg-gray-50 transition cursor-pointer ${n.read ? 'opacity-70' : ''}"
                  onclick="NotificationsManager.markRead('${n.id}','${n.orderId||''}')">
                  <div class="w-9 h-9 ${style.bg} rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                    <i class="fa-solid ${style.icon} ${style.color} text-sm"></i>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold text-gray-900 leading-snug">${n.title || ''}</p>
                    <p class="text-xs text-gray-500 mt-0.5 leading-relaxed">${n.message || ''}</p>
                    <p class="text-xs text-gray-400 mt-1">${formatTimeAgo(n.createdAt)}</p>
                  </div>
                  ${!n.read ? '<div class="w-2 h-2 bg-brand-500 rounded-full flex-shrink-0 mt-2"></div>' : ''}
                </div>`;
            }).join('');
        },

        async markRead(notifId, orderId) {
            try {
                await window.db.collection(COLLECTIONS.NOTIFICATIONS).doc(notifId).update({ read: true });
                // Close dropdown
                document.getElementById('notifDropdown')?.classList.add('hidden');
                // Navigate if there's an order
                if (orderId && orderId !== 'undefined') openWorkspace(orderId);
            } catch (_) {}
        },

        async markAllRead() {
            const user = AppState.currentUser;
            if (!user) return;
            try {
                const snap = await window.db.collection(COLLECTIONS.NOTIFICATIONS)
                    .where('userId', '==', user.uid).where('read', '==', false).get();
                const batch = window.db.batch();
                snap.docs.forEach(d => batch.update(d.ref, { read: true }));
                await batch.commit();
                showToast(AppState.language === 'en' ? 'All marked as read' : 'تم تحديد الكل كمقروء', 'success');
            } catch (_) {}
        },

        // ── Send Notification (helper for other modules) ─────────────────────
        async send(userId, type, title, message, extra = {}) {
            if (!userId) return;
            try {
                await window.db.collection(COLLECTIONS.NOTIFICATIONS).add({
                    userId, type, title, message,
                    read: false,
                    createdAt: serverTimestamp(),
                    ...extra,
                });
            } catch (err) {
                console.warn('[Notif] send error:', err.message);
            }
        },

        // ── Browser Push Notification ─────────────────────────────────────────
        async requestPushPermission() {
            if (!('Notification' in window)) return false;
            if (Notification.permission === 'granted') return true;
            const perm = await Notification.requestPermission();
            return perm === 'granted';
        },

        showBrowserNotif(title, body, icon = '/favicon.ico') {
            if (Notification.permission !== 'granted') return;
            if (document.visibilityState === 'visible') return; // Only when tab is hidden
            new Notification(title, { body, icon });
        },
    };

    // ── Override markAllNotifsRead global ────────────────────────────────────
    window.markAllNotifsRead = () => NotificationsManager.markAllRead();

    window.NotificationsManager = NotificationsManager;
    console.log('✅ NotificationsManager loaded');
})();
