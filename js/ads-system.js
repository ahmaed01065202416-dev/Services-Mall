/**
 * js/ads-system.js — Seller "Promote" dialog + "My ads" tab, and the admin "Ads" tab.
 * ============================================================================
 * All money/status changes go through /api/ads (server) — this file only
 * draws UI and calls it. See functions/api/ads.js for the flow & rules.
 * ============================================================================
 */
(function () {
    'use strict';
    var DEFAULT_PLACEMENTS = [
        { key: 'home_top',    nameAr: 'الرئيسية — أعلى الصفحة',          nameEn: 'Home — top',            slots: 3, layout: 'grid',  pricing: [{ days: 7, price: 150 }, { days: 14, price: 270 }, { days: 30, price: 500 }] },
        { key: 'home_mid',    nameAr: 'الرئيسية — منتصف الصفحة',         nameEn: 'Home — middle',         slots: 3, layout: 'grid',  pricing: [{ days: 7, price: 100 }, { days: 14, price: 180 }, { days: 30, price: 320 }] },
        { key: 'search_top',  nameAr: 'أول نتائج البحث والخدمات',         nameEn: 'Top of search results', slots: 4, layout: 'grid',  pricing: [{ days: 7, price: 120 }, { days: 14, price: 210 }, { days: 30, price: 380 }] },
        { key: 'express_top', nameAr: 'Express Hub — أعلى الخدمات السريعة', nameEn: 'Express Hub — top',     slots: 3, layout: 'grid',  pricing: [{ days: 7, price: 100 }, { days: 14, price: 180 }, { days: 30, price: 320 }] },
        { key: 'blog_article', nameAr: 'المدونة — داخل المقال',          nameEn: 'Blog — inside article', slots: 1, layout: 'grid',  pricing: [{ days: 7, price: 60 },  { days: 14, price: 100 }, { days: 30, price: 180 }] },
        { key: 'blog_bottom', nameAr: 'المدونة — أسفل القائمة',           nameEn: 'Blog — bottom',         slots: 2, layout: 'grid',  pricing: [{ days: 7, price: 60 },  { days: 14, price: 100 }, { days: 30, price: 180 }] },
        { key: 'blog_top',    nameAr: 'المدونة — أعلى الصفحة',            nameEn: 'Blog — top',            slots: 2, layout: 'grid',  pricing: [{ days: 7, price: 80 },  { days: 14, price: 140 }, { days: 30, price: 250 }] },
    ];
    var STATUS = {
        pending_payment: ['بانتظار الدفع', 'Awaiting payment', 'bg-amber-100 text-amber-700'],
        pending_review:  ['قيد المراجعة', 'Under review',    'bg-blue-100 text-blue-700'],
        active:          ['شغّال', 'Running',               'bg-green-100 text-green-700'],
        rejected:        ['مرفوض', 'Rejected',              'bg-red-100 text-red-700'],
        expired:         ['منتهي', 'Ended',                 'bg-gray-100 text-gray-600'],
        stopped:         ['موقوف', 'Stopped',               'bg-orange-100 text-orange-700'],
        cancelled:       ['ملغي', 'Cancelled',              'bg-gray-100 text-gray-500'],
    };

    function ar() { return !window.AppState || window.AppState.language !== 'en'; }
    function esc(v) { return typeof window.escapeHtml === 'function' ? window.escapeHtml(v) : String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
    function money(n) { return typeof window.formatCurrency === 'function' ? window.formatCurrency(n) : (Number(n) || 0) + ' ج.م'; }
    function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t || 'info'); }
    function ms(v) { if (!v) return 0; if (typeof v.toMillis === 'function') return v.toMillis(); if (v.seconds) return v.seconds * 1000; return Date.parse(v) || 0; }
    function dateStr(v) { var t = ms(v); return t ? new Date(t).toLocaleDateString(ar() ? 'ar-EG' : 'en-GB') : '—'; }
    function daysLeft(v) { var d = (ms(v) - Date.now()) / 86400000; return d <= 0 ? 0 : Math.ceil(d); }
    function chip(status) { var s = STATUS[status] || [status, status, 'bg-gray-100 text-gray-600']; return '<span class="text-xs font-bold px-2.5 py-1 rounded-full ' + s[2] + '">' + esc(ar() ? s[0] : s[1]) + '</span>'; }

    async function api(action, payload) {
        var tok = window.auth && window.auth.currentUser ? await window.auth.currentUser.getIdToken() : '';
        var res = await fetch('/api/ads', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok }, body: JSON.stringify(Object.assign({ action: action }, payload || {})) });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    }
    async function loadPlacements() {
        var res = await fetch('/api/ads-feed', { cache: 'no-store' });
        return res.json();
    }
    function refreshPublic() { if (window.AdsEmbed) window.AdsEmbed.refresh(); }

    // ══════════════════════════ SELLER ═══════════════════════════════════════
    function closeModal() { var m = document.getElementById('adsPromoteModal'); if (m) m.remove(); }

    async function openPromote(serviceId, title) {
        if (!window.AppState || !window.AppState.currentUser) { toast(ar() ? 'سجّل الدخول أولاً' : 'Please sign in', 'warning'); return; }
        closeModal();
        var wrap = document.createElement('div');
        wrap.id = 'adsPromoteModal';
        wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
        wrap.innerHTML = '<div style="background:#fff;border-radius:20px;max-width:520px;width:100%;max-height:90vh;overflow:auto;padding:22px"><div class="text-center py-8"><i class="fa-solid fa-spinner fa-spin text-navy-500 text-2xl"></i></div></div>';
        wrap.addEventListener('click', function (e) { if (e.target === wrap) closeModal(); });
        document.body.appendChild(wrap);
        var box = wrap.firstChild;
        try {
            if (!title) { try { var sd = await window.db.collection('services').doc(serviceId).get(); title = sd.exists ? sd.data().title : ''; } catch (e) {} }
            var feed = await loadPlacements();
            var list = (feed.placements || []).filter(function (p) { return (p.allowedKinds || ['service']).indexOf('service') > -1 && p.pricing && p.pricing.length; });
            if (!feed.enabled || !list.length) {
                box.innerHTML = '<p class="text-center text-gray-500 py-6">' + (ar() ? 'الإعلانات المدفوعة غير متاحة حالياً' : 'Paid ads are not available right now') + '</p><button class="btn-primary w-full" onclick="document.getElementById(\'adsPromoteModal\').remove()">' + (ar() ? 'إغلاق' : 'Close') + '</button>';
                return;
            }
            var rows = list.map(function (p, i) {
                var full = p.used >= p.slots;
                var opts = p.pricing.map(function (o) {
                    return '<option value="' + o.days + '">' + o.days + (ar() ? ' يوم — ' : ' days — ') + (o.price > 0 && p.requiresPayment ? money(o.price) : (ar() ? 'مجاناً' : 'Free')) + '</option>';
                }).join('');
                return '<label class="block border-2 rounded-2xl p-4 mb-3 ' + (full ? 'opacity-50' : 'cursor-pointer') + '" style="border-color:#e5e7eb">' +
                    '<div class="flex items-center gap-3"><input type="radio" name="adsPlacement" value="' + esc(p.key) + '" ' + (full ? 'disabled' : (i === 0 ? 'checked' : '')) + '>' +
                    '<div class="flex-1"><p class="font-black text-gray-900 text-sm">' + esc(ar() ? p.nameAr : p.nameEn) + '</p>' +
                    '<p class="text-xs text-gray-400">' + (full ? (ar() ? 'كل الخانات ممتلئة حالياً' : 'All slots are taken') : (ar() ? 'المتاح: ' : 'Available: ') + (p.slots - p.used) + '/' + p.slots) + '</p></div></div>' +
                    (full ? '' : '<select id="adsDays_' + esc(p.key) + '" class="input-field w-full mt-3 text-sm">' + opts + '</select>') + '</label>';
            }).join('');
            box.innerHTML = '<div class="flex items-start justify-between mb-4"><div><h3 class="font-black text-lg text-gray-900">' + (ar() ? 'روّج لخدمتك' : 'Promote your listing') + '</h3>' +
                '<p class="text-xs text-gray-500 mt-1">' + esc(title || '') + '</p></div><button onclick="document.getElementById(\'adsPromoteModal\').remove()" class="text-gray-400 hover:text-gray-700 text-xl">&times;</button></div>' + rows +
                '<p class="text-xs text-gray-400 mb-4">' + (ar() ? 'الإعلان بيظهر بعد موافقة الإدارة. لو اترفض، المبلغ بيرجع لمحفظتك بعد خصم رسوم البوابة فقط.' : 'Your ad goes live after admin approval. If rejected, the amount returns to your wallet minus only the gateway fee.') + '</p>' +
                '<button id="adsSubmitBtn" class="btn-primary w-full">' + (ar() ? 'إرسال الطلب' : 'Submit request') + '</button>';
            document.getElementById('adsSubmitBtn').onclick = async function () {
                var sel = box.querySelector('input[name="adsPlacement"]:checked');
                if (!sel) { toast(ar() ? 'اختار مكان الإعلان' : 'Choose a placement', 'warning'); return; }
                var key = sel.value, daysEl = document.getElementById('adsDays_' + key);
                var btn = this; btn.disabled = true; btn.textContent = '...';
                try {
                    var out = await api('create', { serviceId: serviceId, placementKey: key, days: parseInt(daysEl.value, 10) });
                    if (out.redirectUrl) { window.location.href = out.redirectUrl; return; }
                    closeModal();
                    toast(out.status === 'active' ? (ar() ? '✅ إعلانك شغّال' : '✅ Your ad is live') : (ar() ? '✅ تم إرسال الطلب للمراجعة' : '✅ Request sent for review'), 'success');
                    refreshPublic();
                    if (window.SellerDash && document.getElementById('sdTab_ads')) window.SellerDash.tab('ads');
                } catch (e) { btn.disabled = false; btn.textContent = ar() ? 'إرسال الطلب' : 'Submit request'; toast(e.message, 'error'); }
            };
        } catch (e) { box.innerHTML = '<p class="text-red-500 text-center py-6">' + esc(e.message) + '</p>'; }
    }

    async function renderSellerTab(container) {
        var user = window.AppState && window.AppState.currentUser;
        if (!user) return;
        var q = new URLSearchParams(location.search), pay = q.get('ad_payment');
        var snap = await window.db.collection('ads').where('sellerId', '==', user.uid).get();
        var ads = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).sort(function (a, b) { return ms(b.createdAt) - ms(a.createdAt); });
        var svcSnap = await window.db.collection('services').where('sellerId', '==', user.uid).get();
        var svcs = svcSnap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).filter(function (s) { return s.active !== false && s.status !== 'paused'; });

        var banner = pay === 'success' ? '<div class="bg-green-50 border border-green-200 text-green-700 rounded-2xl p-4 text-sm font-bold mb-4">' + (ar() ? '💳 تم الدفع — طلبك بيتراجع من الإدارة' : '💳 Payment received — your request is under review') + '</div>'
            : pay === 'failed' ? '<div class="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-sm font-bold mb-4">' + (ar() ? 'فشل الدفع — جرّب تاني' : 'Payment failed — try again') + '</div>' : '';

        container.innerHTML = banner +
            '<div class="flex items-center justify-between mb-4 flex-wrap gap-3"><h3 class="font-black text-gray-900">' + (ar() ? 'إعلاناتي' : 'My ads') + ' (' + ads.length + ')</h3>' +
            '<div class="flex gap-2 items-center"><select id="adsPickService" class="input-field text-sm">' + (svcs.length ? svcs.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.title || '—') + '</option>'; }).join('') : '<option value="">' + (ar() ? 'مفيش خدمات نشطة' : 'No active listings') + '</option>') + '</select>' +
            '<button class="btn-primary text-sm px-4 py-2" id="adsNewBtn"><i class="fa-solid fa-bullhorn me-1"></i>' + (ar() ? 'إعلان جديد' : 'New ad') + '</button></div></div>' +
            (ads.length ? '<div class="space-y-3">' + ads.map(function (a) {
                var canCancel = a.status === 'pending_payment' || a.status === 'pending_review';
                return '<div class="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm"><div class="flex items-start justify-between gap-3 flex-wrap">' +
                    '<div class="min-w-0"><p class="font-black text-sm text-gray-900 truncate">' + esc(a.serviceTitle || a.title || '—') + '</p>' +
                    '<p class="text-xs text-gray-500 mt-1">' + esc(a.placementName || a.placementKey) + ' • ' + (a.days || 0) + (ar() ? ' يوم' : ' days') + ' • ' + (a.paid ? money(a.paidAmount) : (ar() ? 'بدون دفع' : 'No payment')) + '</p></div>' + chip(a.status) + '</div>' +
                    '<div class="flex flex-wrap gap-4 text-xs text-gray-500 mt-3">' +
                    (a.status === 'active' ? '<span><i class="fa-solid fa-hourglass-half text-amber-500 me-1"></i>' + (ar() ? 'باقي ' + daysLeft(a.endAt) + ' يوم' : daysLeft(a.endAt) + ' days left') + ' (' + dateStr(a.endAt) + ')</span>' : '') +
                    (a.status === 'active' || a.status === 'expired' || a.status === 'stopped' ? '<span><i class="fa-solid fa-eye text-blue-400 me-1"></i>' + (a.views || 0) + '</span><span><i class="fa-solid fa-hand-pointer text-green-500 me-1"></i>' + (a.clicks || 0) + '</span>' : '') +
                    (a.reviewNote ? '<span class="text-red-500">' + esc(a.reviewNote) + '</span>' : '') +
                    (a.refunded ? '<span class="text-green-600 font-bold">' + (ar() ? 'تم رد ' : 'Refunded ') + money(a.refundAmount) + '</span>' : '') + '</div>' +
                    (canCancel ? '<button data-cancel="' + esc(a.id) + '" class="mt-3 text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-lg font-bold hover:bg-red-100">' + (ar() ? 'إلغاء الطلب' : 'Cancel request') + '</button>' : '') + '</div>';
            }).join('') + '</div>' : '<p class="text-gray-400 text-center py-10">' + (ar() ? 'لسه معندكش إعلانات' : 'No ads yet') + '</p>');

        var nb = document.getElementById('adsNewBtn');
        if (nb) nb.onclick = function () { var sel = document.getElementById('adsPickService'); if (!sel || !sel.value) { toast(ar() ? 'مفيش خدمة تعلن عنها' : 'Nothing to promote', 'warning'); return; } openPromote(sel.value, sel.options[sel.selectedIndex].text); };
        container.querySelectorAll('[data-cancel]').forEach(function (b) {
            b.onclick = async function () {
                if (!confirm(ar() ? 'إلغاء طلب الإعلان؟' : 'Cancel this ad request?')) return;
                try { var r = await api('cancel', { adId: b.getAttribute('data-cancel') }); toast(r.refund > 0 ? (ar() ? 'تم الإلغاء ورد ' + r.refund + ' ج.م لمحفظتك' : 'Cancelled — refunded to wallet') : (ar() ? 'تم الإلغاء' : 'Cancelled'), 'success'); renderSellerTab(container); }
                catch (e) { toast(e.message, 'error'); }
            };
        });
    }

    // ══════════════════════════ ADMIN ════════════════════════════════════════
    var adminView = 'requests';

    function parsePricing(txt) {
        var out = [];
        String(txt || '').split(/[,\n،]+/).forEach(function (part) {
            var m = part.trim().match(/^(\d+)\s*[:=\-]\s*(\d+(?:\.\d+)?)$/);
            if (m && parseInt(m[1], 10) > 0) out.push({ days: parseInt(m[1], 10), price: parseFloat(m[2]) });
        });
        return out;
    }
    function pricingText(list) { return (list || []).map(function (o) { return o.days + ':' + o.price; }).join(', '); }
    function slug(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60); }

    async function renderAdminTab(container) {
        var views = [['requests', 'الطلبات', 'Requests'], ['running', 'الشغّالة', 'Running'], ['history', 'السجل', 'History'], ['placements', 'الأماكن والأسعار', 'Placements'], ['banner', 'إعلان إداري', 'House ad'], ['settings', 'إعدادات', 'Settings']];
        container.innerHTML = '<div class="flex gap-2 overflow-x-auto pb-3 mb-4 border-b border-gray-100">' + views.map(function (v) {
            return '<button data-v="' + v[0] + '" class="px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap ' + (adminView === v[0] ? 'bg-navy-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200') + '">' + (ar() ? v[1] : v[2]) + '</button>';
        }).join('') + '</div><div id="adsAdminBody"><div class="text-center py-8"><i class="fa-solid fa-spinner fa-spin text-navy-500 text-2xl"></i></div></div>';
        container.querySelectorAll('[data-v]').forEach(function (b) { b.onclick = function () { adminView = b.getAttribute('data-v'); renderAdminTab(container); }; });
        var body = document.getElementById('adsAdminBody');
        try {
            if (adminView === 'requests') await viewRequests(body, container);
            else if (adminView === 'running') await viewRunning(body, container);
            else if (adminView === 'history') await viewHistory(body);
            else if (adminView === 'placements') await viewPlacements(body, container);
            else if (adminView === 'banner') await viewBanner(body, container);
            else await viewSettings(body);
        } catch (e) { body.innerHTML = '<p class="text-red-500 text-center py-6">' + esc(e.message) + '</p>'; }
    }

    function adRow(a, actions) {
        return '<div class="p-4 bg-gray-50 rounded-xl"><div class="flex items-start justify-between gap-3 flex-wrap"><div class="min-w-0">' +
            '<p class="font-black text-sm text-gray-900">' + esc(a.serviceTitle || a.title || (a.kind === 'banner' ? 'Banner' : '—')) + (a.kind === 'banner' ? ' <span class="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">banner</span>' : '') + '</p>' +
            '<p class="text-xs text-gray-500 mt-1">' + esc(a.sellerName || '—') + ' • ' + esc(a.placementName || a.placementKey) + ' • ' + (a.days || 0) + (ar() ? ' يوم' : 'd') + ' • ' + (a.paid ? '<b class="text-green-600">' + money(a.paidAmount) + (ar() ? ' مدفوع' : ' paid') + '</b>' : (ar() ? 'بدون دفع' : 'unpaid')) + '</p>' +
            (a.status === 'active' ? '<p class="text-xs text-gray-400 mt-1">' + dateStr(a.startAt) + ' → ' + dateStr(a.endAt) + ' • ' + (ar() ? 'باقي ' : '') + daysLeft(a.endAt) + (ar() ? ' يوم' : 'd left') + ' • 👁 ' + (a.views || 0) + ' • 👆 ' + (a.clicks || 0) + '</p>' : '') +
            (a.reviewNote ? '<p class="text-xs text-red-500 mt-1">' + esc(a.reviewNote) + '</p>' : '') + '</div>' + chip(a.status) + '</div>' + (actions || '') + '</div>';
    }

    async function viewRequests(body, container) {
        var snap = await window.db.collection('ads').where('status', '==', 'pending_review').get();
        var ads = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).sort(function (a, b) { return ms(a.createdAt) - ms(b.createdAt); });
        body.innerHTML = ads.length ? '<div class="space-y-3">' + ads.map(function (a) {
            return adRow(a, '<div class="flex gap-2 mt-3"><button data-ok="' + esc(a.id) + '" class="px-4 py-2 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700"><i class="fa-solid fa-check me-1"></i>' + (ar() ? 'موافقة' : 'Approve') + '</button>' +
                '<button data-no="' + esc(a.id) + '" class="px-4 py-2 bg-red-50 text-red-600 rounded-xl text-xs font-bold hover:bg-red-100"><i class="fa-solid fa-xmark me-1"></i>' + (ar() ? 'رفض' : 'Reject') + '</button></div>');
        }).join('') + '</div>' : '<p class="text-gray-400 text-center py-10">' + (ar() ? 'مفيش طلبات في الانتظار' : 'No pending requests') + '</p>';
        body.querySelectorAll('[data-ok]').forEach(function (b) { b.onclick = async function () { b.disabled = true; try { await api('review', { adId: b.getAttribute('data-ok'), decision: 'approve' }); toast(ar() ? '✅ تمت الموافقة' : '✅ Approved', 'success'); refreshPublic(); renderAdminTab(container); } catch (e) { b.disabled = false; toast(e.message, 'error'); } }; });
        body.querySelectorAll('[data-no]').forEach(function (b) { b.onclick = async function () { var note = prompt(ar() ? 'سبب الرفض (هيوصل للبائع):' : 'Rejection reason (sent to the seller):', ''); if (note === null) return; b.disabled = true; try { var r = await api('review', { adId: b.getAttribute('data-no'), decision: 'reject', note: note }); toast(ar() ? '✅ تم الرفض' + (r.refund > 0 ? ' ورد ' + r.refund + ' ج.م' : '') : '✅ Rejected', 'success'); renderAdminTab(container); } catch (e) { b.disabled = false; toast(e.message, 'error'); } }; });
    }

    async function viewRunning(body, container) {
        var snap = await window.db.collection('ads').where('status', '==', 'active').get();
        var ads = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).filter(function (a) { return ms(a.endAt) > Date.now(); }).sort(function (a, b) { return ms(a.endAt) - ms(b.endAt); });
        body.innerHTML = ads.length ? '<div class="space-y-3">' + ads.map(function (a) {
            return adRow(a, '<button data-stop="' + esc(a.id) + '" class="mt-3 px-4 py-2 bg-orange-50 text-orange-700 rounded-xl text-xs font-bold hover:bg-orange-100"><i class="fa-solid fa-stop me-1"></i>' + (ar() ? 'إيقاف الإعلان' : 'Stop ad') + '</button>');
        }).join('') + '</div>' : '<p class="text-gray-400 text-center py-10">' + (ar() ? 'مفيش إعلانات شغّالة' : 'No running ads') + '</p>';
        body.querySelectorAll('[data-stop]').forEach(function (b) { b.onclick = async function () { var note = prompt(ar() ? 'سبب الإيقاف (اختياري):' : 'Reason (optional):', ''); if (note === null) return; try { await api('stop', { adId: b.getAttribute('data-stop'), note: note }); toast(ar() ? '✅ تم الإيقاف' : '✅ Stopped', 'success'); refreshPublic(); renderAdminTab(container); } catch (e) { toast(e.message, 'error'); } }; });
    }

    async function viewHistory(body) {
        var snap = await window.db.collection('ads').orderBy('createdAt', 'desc').limit(100).get();
        var ads = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        body.innerHTML = ads.length ? '<div class="space-y-3">' + ads.map(function (a) { return adRow(a, ''); }).join('') + '</div>' : '<p class="text-gray-400 text-center py-10">—</p>';
    }

    async function viewPlacements(body, container) {
        var snap = await window.db.collection('ad_placements').get();
        var list = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        body.innerHTML = '<div class="flex items-center justify-between mb-4 flex-wrap gap-2"><h3 class="font-black text-gray-900">' + (ar() ? 'أماكن الإعلانات' : 'Ad placements') + ' (' + list.length + ')</h3><div class="flex gap-2">' +
            (list.length ? '' : '<button id="adsSeedBtn" class="px-4 py-2 bg-turquoise-50 text-turquoise-700 rounded-xl text-sm font-bold">' + (ar() ? 'إضافة الأماكن الافتراضية' : 'Add default placements') + '</button>') +
            '<button id="adsAddPl" class="btn-primary text-sm px-4 py-2"><i class="fa-solid fa-plus me-1"></i>' + (ar() ? 'مكان جديد' : 'New placement') + '</button></div></div>' +
            '<p class="text-xs text-gray-500 bg-blue-50 rounded-xl p-3 mb-4">' + (ar() ? 'لإظهار إعلان في أي مكان بالموقع: حط محدد CSS (مثال <code>#page-wallet h2</code>) وموضع الإدراج، وهيتحط تلقائياً من غير تعديل كود. الأسعار الافتراضية أرقام مبدئية عدّلها براحتك.' : 'To show ads anywhere on the site: give a placement a CSS selector and insert position — it is injected automatically, no code change. Default prices are placeholders; edit freely.') + '</p>' +
            '<div class="space-y-3" id="adsPlList">' + list.map(function (p) {
                return '<div class="p-4 bg-gray-50 rounded-xl"><div class="flex items-start justify-between gap-3 flex-wrap"><div class="min-w-0"><p class="font-black text-sm text-gray-900">' + esc(p.nameAr || p.id) + ' <code class="text-[11px] text-gray-400">' + esc(p.id) + '</code></p>' +
                    '<p class="text-xs text-gray-500 mt-1">' + (ar() ? 'خانات: ' : 'slots: ') + (p.slots || 1) + ' • ' + esc(pricingText(p.pricing) || '—') + ' • ' + (p.requiresPayment === false ? (ar() ? 'بدون دفع' : 'free') : (ar() ? 'مدفوع' : 'paid')) + (p.autoApprove ? ' • auto' : '') + '</p>' +
                    (p.selector ? '<p class="text-[11px] text-purple-600 mt-1" dir="ltr">' + esc(p.position) + ' ⟶ ' + esc(p.selector) + '</p>' : '<p class="text-[11px] text-gray-400 mt-1" dir="ltr">&lt;div data-ad-slot="' + esc(p.id) + '"&gt;&lt;/div&gt;</p>') + '</div>' +
                    '<div class="flex gap-2 items-center"><button data-tgl="' + esc(p.id) + '" class="text-xs px-3 py-1.5 rounded-lg font-bold ' + (p.enabled === false ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700') + '">' + (p.enabled === false ? (ar() ? 'موقوف' : 'Off') : (ar() ? 'مفعّل' : 'On')) + '</button>' +
                    '<button data-edit="' + esc(p.id) + '" class="text-xs px-3 py-1.5 bg-navy-50 text-navy-700 rounded-lg font-bold">' + (ar() ? 'تعديل' : 'Edit') + '</button>' +
                    '<button data-del="' + esc(p.id) + '" class="w-7 h-7 bg-red-100 text-red-700 rounded-lg"><i class="fa-solid fa-trash text-xs"></i></button></div></div></div>';
            }).join('') + '</div><div id="adsPlForm"></div>';
        var byId = {}; list.forEach(function (p) { byId[p.id] = p; });
        var seed = document.getElementById('adsSeedBtn');
        if (seed) seed.onclick = async function () {
            seed.disabled = true;
            try { for (var i = 0; i < DEFAULT_PLACEMENTS.length; i++) { var d = DEFAULT_PLACEMENTS[i]; await window.db.collection('ad_placements').doc(d.key).set({ nameAr: d.nameAr, nameEn: d.nameEn, slots: d.slots, layout: d.layout, pricing: d.pricing, requiresPayment: true, autoApprove: false, enabled: true, allowedKinds: ['service', 'banner'], selector: '', position: '', page: '', createdAt: firebase.firestore.FieldValue.serverTimestamp() }); }
                toast(ar() ? '✅ تمت الإضافة' : '✅ Added', 'success'); renderAdminTab(container); } catch (e) { seed.disabled = false; toast(e.message, 'error'); }
        };
        document.getElementById('adsAddPl').onclick = function () { plForm(null, container); };
        body.querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function () { plForm(byId[b.getAttribute('data-edit')], container); }; });
        body.querySelectorAll('[data-tgl]').forEach(function (b) { b.onclick = async function () { var p = byId[b.getAttribute('data-tgl')]; try { await window.db.collection('ad_placements').doc(p.id).update({ enabled: p.enabled === false }); refreshPublic(); renderAdminTab(container); } catch (e) { toast(e.message, 'error'); } }; });
        body.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = async function () { if (!confirm(ar() ? 'حذف المكان ده؟ الإعلانات الشغّالة فيه هتختفي.' : 'Delete this placement? Running ads in it will disappear.')) return; try { await window.db.collection('ad_placements').doc(b.getAttribute('data-del')).delete(); refreshPublic(); renderAdminTab(container); } catch (e) { toast(e.message, 'error'); } }; });
    }

    function plForm(p, container) {
        var isNew = !p; p = p || { slots: 3, layout: 'grid', pricing: [{ days: 7, price: 100 }], requiresPayment: true, enabled: true, allowedKinds: ['service', 'banner'] };
        var kinds = p.allowedKinds || ['service'];
        var f = document.getElementById('adsPlForm');
        f.innerHTML = '<div class="mt-5 p-5 border-2 border-navy-100 rounded-2xl space-y-3"><h4 class="font-black text-gray-900">' + (isNew ? (ar() ? 'مكان جديد' : 'New placement') : (ar() ? 'تعديل المكان' : 'Edit placement')) + '</h4>' +
            '<div class="grid sm:grid-cols-2 gap-3">' +
            '<label class="text-xs font-bold text-gray-600">' + (ar() ? 'المعرّف (إنجليزي، لا يتغيّر)' : 'Key (a-z, 0-9, _)') + '<input id="plKey" class="input-field w-full mt-1" dir="ltr" value="' + esc(p.id || '') + '" ' + (isNew ? '' : 'disabled') + '></label>' +
            '<label class="text-xs font-bold text-gray-600">' + (ar() ? 'عدد الخانات' : 'Slots') + '<input id="plSlots" type="number" min="1" max="50" class="input-field w-full mt-1" value="' + (p.slots || 1) + '"></label>' +
            '<label class="text-xs font-bold text-gray-600">' + (ar() ? 'الاسم بالعربي' : 'Arabic name') + '<input id="plNameAr" class="input-field w-full mt-1" value="' + esc(p.nameAr || '') + '"></label>' +
            '<label class="text-xs font-bold text-gray-600">' + (ar() ? 'الاسم بالإنجليزي' : 'English name') + '<input id="plNameEn" class="input-field w-full mt-1" dir="ltr" value="' + esc(p.nameEn || '') + '"></label></div>' +
            '<label class="text-xs font-bold text-gray-600 block">' + (ar() ? 'الأسعار: مدة بالأيام:سعر — مفصولة بفاصلة (مثال 7:100, 14:180, 30:300)' : 'Prices: days:price, comma separated (e.g. 7:100, 14:180)') + '<input id="plPricing" class="input-field w-full mt-1" dir="ltr" value="' + esc(pricingText(p.pricing)) + '"></label>' +
            '<div class="grid sm:grid-cols-3 gap-3 text-sm">' +
            '<label class="flex items-center gap-2"><input id="plPay" type="checkbox" ' + (p.requiresPayment !== false ? 'checked' : '') + '> ' + (ar() ? 'الدفع إلزامي' : 'Payment required') + '</label>' +
            '<label class="flex items-center gap-2"><input id="plAuto" type="checkbox" ' + (p.autoApprove ? 'checked' : '') + '> ' + (ar() ? 'موافقة تلقائية' : 'Auto-approve') + '</label>' +
            '<label class="flex items-center gap-2"><input id="plOn" type="checkbox" ' + (p.enabled !== false ? 'checked' : '') + '> ' + (ar() ? 'مفعّل' : 'Enabled') + '</label>' +
            '<label class="flex items-center gap-2"><input id="plKS" type="checkbox" ' + (kinds.indexOf('service') > -1 ? 'checked' : '') + '> ' + (ar() ? 'يقبل إعلانات خدمات' : 'Allows listing ads') + '</label>' +
            '<label class="flex items-center gap-2"><input id="plKB" type="checkbox" ' + (kinds.indexOf('banner') > -1 ? 'checked' : '') + '> ' + (ar() ? 'يقبل بانرات إدارية' : 'Allows banners') + '</label>' +
            '<label class="flex items-center gap-2">' + (ar() ? 'العرض' : 'Layout') + ' <select id="plLayout" class="input-field text-sm"><option value="grid"' + (p.layout !== 'stack' ? ' selected' : '') + '>grid</option><option value="stack"' + (p.layout === 'stack' ? ' selected' : '') + '>stack</option></select></label></div>' +
            '<div class="grid sm:grid-cols-3 gap-3"><label class="text-xs font-bold text-gray-600 sm:col-span-2">' + (ar() ? 'محدد CSS لإظهار الإعلان في أي مكان (اختياري)' : 'CSS selector to inject anywhere (optional)') + '<input id="plSel" class="input-field w-full mt-1" dir="ltr" placeholder="#page-wallet h2" value="' + esc(p.selector || '') + '"></label>' +
            '<label class="text-xs font-bold text-gray-600">' + (ar() ? 'موضع الإدراج' : 'Position') + '<select id="plPos" class="input-field w-full mt-1"><option value="">—</option>' + ['before', 'after', 'prepend', 'append'].map(function (o) { return '<option value="' + o + '"' + (p.position === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></label></div>' +
            '<label class="text-xs font-bold text-gray-600 block">' + (ar() ? 'الصفحة (ملاحظة، أو مسار مثل /blog لتقييد الظهور)' : 'Page (note, or a path like /blog to restrict)') + '<input id="plPage" class="input-field w-full mt-1" dir="ltr" value="' + esc(p.page || '') + '"></label>' +
            '<div class="flex gap-2 pt-2"><button id="plSave" class="btn-primary px-5 py-2 text-sm">' + (ar() ? 'حفظ' : 'Save') + '</button><button id="plCancel" class="px-5 py-2 text-sm bg-gray-100 rounded-xl font-bold">' + (ar() ? 'إلغاء' : 'Cancel') + '</button></div></div>';
        f.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementById('plCancel').onclick = function () { f.innerHTML = ''; };
        document.getElementById('plSave').onclick = async function () {
            var key = isNew ? slug(document.getElementById('plKey').value) : p.id;
            var pricing = parsePricing(document.getElementById('plPricing').value);
            var slots = parseInt(document.getElementById('plSlots').value, 10);
            var kindsOut = []; if (document.getElementById('plKS').checked) kindsOut.push('service'); if (document.getElementById('plKB').checked) kindsOut.push('banner');
            var selector = document.getElementById('plSel').value.trim(), position = document.getElementById('plPos').value;
            if (!key) return toast(ar() ? 'المعرّف مطلوب' : 'Key required', 'warning');
            if (!pricing.length) return toast(ar() ? 'اكتب سعر واحد على الأقل بالشكل 7:100' : 'Add at least one price like 7:100', 'warning');
            if (!(slots >= 1)) return toast(ar() ? 'عدد الخانات غير صالح' : 'Invalid slots', 'warning');
            if (!kindsOut.length) return toast(ar() ? 'اختار نوع إعلان واحد على الأقل' : 'Pick at least one ad type', 'warning');
            if (selector) { try { document.querySelector(selector); } catch (e) { return toast(ar() ? 'محدد CSS غير صالح' : 'Invalid CSS selector', 'error'); } if (!position) return toast(ar() ? 'اختار موضع الإدراج' : 'Choose a position', 'warning'); }
            var data = { nameAr: document.getElementById('plNameAr').value.trim() || key, nameEn: document.getElementById('plNameEn').value.trim(), slots: slots, pricing: pricing,
                requiresPayment: document.getElementById('plPay').checked, autoApprove: document.getElementById('plAuto').checked, enabled: document.getElementById('plOn').checked,
                allowedKinds: kindsOut, layout: document.getElementById('plLayout').value, selector: selector, position: selector ? position : '', page: document.getElementById('plPage').value.trim(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
            if (isNew) data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            try { await window.db.collection('ad_placements').doc(key).set(data, { merge: true }); toast(ar() ? '✅ تم الحفظ' : '✅ Saved', 'success'); refreshPublic(); renderAdminTab(container); }
            catch (e) { toast(e.message, 'error'); }
        };
    }

    async function viewBanner(body, container) {
        var snap = await window.db.collection('ad_placements').get();
        var list = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).filter(function (p) { return p.enabled !== false; });
        if (!list.length) { body.innerHTML = '<p class="text-gray-400 text-center py-10">' + (ar() ? 'أضف مكان إعلان الأول من تبويب "الأماكن"' : 'Add a placement first') + '</p>'; return; }
        var opts = list.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.nameAr || p.id) + '</option>'; }).join('');
        body.innerHTML = '<div class="max-w-xl space-y-3"><p class="text-xs text-gray-500 bg-blue-50 rounded-xl p-3">' + (ar() ? 'إعلان من الإدارة بدون دفع ويبدأ فوراً: بانر بصورة ورابط، أو ترويج خدمة بمعرّفها.' : 'A free house ad that starts immediately: a banner (image + link) or a listing promotion by its id.') + '</p>' +
            '<label class="text-xs font-bold text-gray-600 block">' + (ar() ? 'المكان' : 'Placement') + '<select id="baPl" class="input-field w-full mt-1">' + opts + '</select></label>' +
            '<label class="text-xs font-bold text-gray-600 block">' + (ar() ? 'المدة (أيام)' : 'Days') + '<input id="baDays" type="number" min="1" max="3650" value="7" class="input-field w-full mt-1"></label>' +
            '<label class="text-xs font-bold text-gray-600 block">' + (ar() ? 'النوع' : 'Type') + '<select id="baKind" class="input-field w-full mt-1"><option value="banner">' + (ar() ? 'بانر' : 'Banner') + '</option><option value="service">' + (ar() ? 'ترويج خدمة' : 'Promote listing') + '</option></select></label>' +
            '<div id="baBanner" class="space-y-3"><label class="text-xs font-bold text-gray-600 block">' + (ar() ? 'رابط الصورة (https)' : 'Image URL (https)') + '<input id="baImg" class="input-field w-full mt-1" dir="ltr"></label>' +
            '<label class="text-xs font-bold text-gray-600 block">' + (ar() ? 'رابط عند الضغط (اختياري: https أو /مسار أو #صفحة)' : 'Click link (optional: https, /path or #page)') + '<input id="baLink" class="input-field w-full mt-1" dir="ltr"></label>' +
            '<label class="text-xs font-bold text-gray-600 block">' + (ar() ? 'عنوان (اختياري)' : 'Title (optional)') + '<input id="baTitle" class="input-field w-full mt-1"></label></div>' +
            '<div id="baSvc" class="hidden"><label class="text-xs font-bold text-gray-600 block">' + (ar() ? 'معرّف الخدمة (ID)' : 'Listing ID') + '<input id="baSvcId" class="input-field w-full mt-1" dir="ltr"></label></div>' +
            '<button id="baGo" class="btn-primary px-6 py-2.5 text-sm">' + (ar() ? 'نشر الإعلان' : 'Publish ad') + '</button></div>';
        var kindEl = document.getElementById('baKind');
        kindEl.onchange = function () { document.getElementById('baBanner').classList.toggle('hidden', kindEl.value !== 'banner'); document.getElementById('baSvc').classList.toggle('hidden', kindEl.value !== 'service'); };
        document.getElementById('baGo').onclick = async function () {
            var b = this; b.disabled = true;
            try {
                var payload = { placementKey: document.getElementById('baPl').value, days: parseInt(document.getElementById('baDays').value, 10), kind: kindEl.value };
                if (kindEl.value === 'banner') Object.assign(payload, { imageUrl: document.getElementById('baImg').value.trim(), linkUrl: document.getElementById('baLink').value.trim(), title: document.getElementById('baTitle').value.trim() });
                else payload.serviceId = document.getElementById('baSvcId').value.trim();
                await api('adminCreate', payload); toast(ar() ? '✅ الإعلان شغّال' : '✅ Ad is live', 'success'); refreshPublic(); adminView = 'running'; renderAdminTab(container);
            } catch (e) { b.disabled = false; toast(e.message, 'error'); }
        };
    }

    async function viewSettings(body) {
        var snap = await window.db.collection('settings').doc('platform').get();
        var c = snap.exists ? snap.data() : {};
        body.innerHTML = '<div class="max-w-lg space-y-4">' +
            '<label class="flex items-center gap-3 p-4 bg-gray-50 rounded-xl"><input id="adsOn" type="checkbox" ' + (c.ADS_ENABLED === false ? '' : 'checked') + '><div><p class="font-bold text-sm text-gray-900">' + (ar() ? 'تفعيل نظام الإعلانات' : 'Enable ads system') + '</p><p class="text-xs text-gray-500">' + (ar() ? 'لو اتقفل: الإعلانات تختفي من الموقع ومحدش يقدر يطلب إعلان جديد.' : 'When off, ads disappear and no new requests are accepted.') + '</p></div></label>' +
            '<div class="grid grid-cols-2 gap-3"><label class="text-xs font-bold text-gray-600">' + (ar() ? 'رسوم البوابة المخصومة عند الرفض (%)' : 'Gateway fee kept on refund (%)') + '<input id="adsFeeP" type="number" min="0" max="100" step="0.01" class="input-field w-full mt-1" value="' + (Number(c.ADS_REFUND_FEE_PERCENT) || 0) + '"></label>' +
            '<label class="text-xs font-bold text-gray-600">' + (ar() ? 'رسوم ثابتة (ج.م)' : 'Fixed fee (EGP)') + '<input id="adsFeeF" type="number" min="0" step="0.01" class="input-field w-full mt-1" value="' + (Number(c.ADS_REFUND_FEE_FIXED) || 0) + '"></label></div>' +
            '<label class="text-xs font-bold text-gray-600 block">' + (ar() ? 'تنبيه البائع قبل الانتهاء بكام يوم' : 'Remind the seller N days before it ends') + '<input id="adsRem" type="number" min="1" max="30" class="input-field w-full mt-1" value="' + (Number(c.ADS_REMINDER_DAYS) > 0 ? Number(c.ADS_REMINDER_DAYS) : 3) + '"></label>' +
            '<p class="text-xs text-gray-400">' + (ar() ? 'الرد عند الرفض بيروح لمحفظة البائع بعد خصم رسوم البوابة فقط (القيم دي).' : 'Rejected paid ads are refunded to the seller wallet minus only these gateway fees.') + '</p>' +
            '<button id="adsSaveSet" class="btn-primary px-6 py-2.5 text-sm">' + (ar() ? 'حفظ' : 'Save') + '</button></div>';
        document.getElementById('adsSaveSet').onclick = async function () {
            var rem = parseInt(document.getElementById('adsRem').value, 10);
            var data = { ADS_ENABLED: document.getElementById('adsOn').checked, ADS_REFUND_FEE_PERCENT: Math.max(0, Math.min(100, parseFloat(document.getElementById('adsFeeP').value) || 0)),
                ADS_REFUND_FEE_FIXED: Math.max(0, parseFloat(document.getElementById('adsFeeF').value) || 0), ADS_REMINDER_DAYS: rem >= 1 && rem <= 30 ? rem : 3 };
            try { await window.db.collection('settings').doc('platform').set(data, { merge: true }); toast(ar() ? '✅ تم الحفظ' : '✅ Saved', 'success'); refreshPublic(); } catch (e) { toast(e.message, 'error'); }
        };
    }

    window.AdsSystem = { openPromote: openPromote, renderSellerTab: renderSellerTab, renderAdminTab: renderAdminTab };
})();
