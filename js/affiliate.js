/**
 * js/affiliate.js — Marketer program UI (external-link products).
 * ============================================================================
 * Marketer tab inside «متجري», public product cards on the store page, and the admin settings tab.
 * The customer is sent to the external platform and pays there; our order is a tracking record.
 * All writes go through /api/affiliate (server-side rules); the admin tab edits settings/platform and
 * marketer_plans directly (admin-only in firestore.rules).
 * ============================================================================
 */
(function () {
    'use strict';
    var CATS = [['clothing', 'ملابس', 'Clothing'], ['electronics', 'إلكترونيات', 'Electronics'], ['home', 'مستلزمات منزلية', 'Home'], ['beauty', 'مستحضرات تجميل', 'Beauty'], ['food', 'أطعمة ومشروبات', 'Food'], ['accessories', 'إكسسوارات', 'Accessories'], ['digital', 'منتجات رقمية', 'Digital'], ['other', 'أخرى', 'Other']];
    var DEF = { AFF_ENABLED: false, AFF_COUNT_MODE: 'confirmed', AFF_FEE_ENABLED: false, AFF_FEE_MODE: 'fixed', AFF_FEE_FIXED: 2, AFF_FEE_TIERS: '[{"upTo":50,"fee":0},{"upTo":null,"fee":2}]', AFF_TIER_PERIOD: 'month', AFF_SUB_ENABLED: false, AFF_SUB_REQUIRED: false, AFF_DEBT_LIMIT: 100 };
    var ST = { clicked: ['بانتظار تأكيدك', 'Awaiting confirmation', 'bg-amber-100 text-amber-700'], confirmed: ['مؤكد', 'Confirmed', 'bg-green-100 text-green-700'], cancelled: ['ملغي', 'Cancelled', 'bg-gray-100 text-gray-500'] };
    var photos = [];

    function ar() { return !window.AppState || window.AppState.language !== 'en'; }
    function esc(v) { return typeof window.escapeHtml === 'function' ? window.escapeHtml(v) : String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
    function money(n) { return typeof window.formatCurrency === 'function' ? window.formatCurrency(n) : (Number(n) || 0) + ' ج.م'; }
    function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t || 'info'); }
    function ms(v) { if (!v) return 0; if (typeof v.toMillis === 'function') return v.toMillis(); if (v.seconds) return v.seconds * 1000; return Date.parse(v) || 0; }
    function uid() { return window.AppState && window.AppState.currentUser ? window.AppState.currentUser.uid : null; }
    function val(id) { return (document.getElementById(id) || {}).value || ''; }
    function field(label, inner) { return '<label class="block text-xs font-bold text-gray-600">' + label + inner + '</label>'; }
    function chip(s) { var x = ST[s] || [s, s, 'bg-gray-100 text-gray-600']; return '<span class="text-xs font-bold px-2.5 py-1 rounded-full ' + x[2] + '">' + esc(ar() ? x[0] : x[1]) + '</span>'; }
    function loading() { return '<div class="text-center py-8"><i class="fa-solid fa-spinner fa-spin text-navy-500 text-2xl"></i></div>'; }

    async function api(action, payload) {
        var tok = window.auth && window.auth.currentUser ? await window.auth.currentUser.getIdToken() : '';
        var res = await fetch('/api/affiliate', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok }, body: JSON.stringify(Object.assign({ action: action }, payload || {})) });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    }
    async function settings() {
        var out = Object.assign({}, DEF);
        try { var d = await window.db.collection('settings').doc('platform').get(); if (d.exists) { var c = d.data(); Object.keys(DEF).forEach(function (k) { if (c[k] !== undefined && c[k] !== null) out[k] = c[k]; }); } } catch (e) {}
        return out;
    }
    function modal(html) {
        var old = document.getElementById('affModal'); if (old) old.remove();
        var w = document.createElement('div'); w.id = 'affModal';
        w.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
        w.innerHTML = '<div style="background:#fff;border-radius:20px;max-width:560px;width:100%;max-height:92vh;overflow:auto;padding:22px">' + html + '</div>';
        w.addEventListener('click', function (e) { if (e.target === w) w.remove(); });
        document.body.appendChild(w);
    }
    function closeModal() { var m = document.getElementById('affModal'); if (m) m.remove(); }

    // ═══════════════════ CUSTOMER SIDE: store page cards + «اطلب» ═══════════════════
    async function order(pid) {
        if (!uid()) { if (typeof window.navigateTo === 'function') window.navigateTo('login'); return toast(ar() ? 'سجّل دخولك الأول' : 'Please log in first', 'warning'); }
        var w = null; try { w = window.open('', '_blank'); } catch (e) {}   // opened synchronously so mobile popup blockers allow it
        try {
            var r = await api('trackOrder', { productId: pid });
            toast(ar() ? 'هتتحوّل للمنصة لإتمام الشراء — كود التتبع ' + r.trackingCode : 'Redirecting — tracking code ' + r.trackingCode, 'success');
            if (w) { try { w.opener = null; } catch (e) {} w.location.href = r.url; } else { window.location.href = r.url; }
        } catch (e) { if (w) w.close(); toast(e.message, 'error'); }
    }
    async function renderStoreProducts(storeId, container) {
        if (!container) return;
        container.innerHTML = '';
        try {
            var cfg = await settings(); if (!cfg.AFF_ENABLED) return;
            var snap = await window.db.collection('affiliate_products').where('storeId', '==', storeId).where('active', '==', true).limit(100).get();
            var list = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).filter(function (p) { return !p.blocked; });
            if (!list.length) return;
            container.innerHTML = '<h3 class="font-black text-gray-900 mb-3 mt-8"><i class="fa-solid fa-link me-1 text-turquoise-600"></i>' + (ar() ? 'منتجات مقترحة من منصات شريكة' : 'Recommended partner products') + '</h3>' +
                '<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">' + list.map(function (p) {
                    return '<div class="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm flex flex-col"><div class="h-40 bg-gray-100"><img src="' + esc(p.image) + '" class="w-full h-full object-cover" loading="lazy" alt=""></div>' +
                        '<div class="p-3 flex flex-col gap-1.5 flex-1"><p class="font-black text-sm text-gray-900 line-clamp-2">' + esc(p.title) + '</p>' +
                        '<p class="text-xs text-gray-400"><i class="fa-solid fa-arrow-up-right-from-square me-1"></i>' + esc(p.platformName) + '</p>' +
                        (Number(p.price) > 0 ? '<p class="font-black text-navy-800 text-sm">' + money(p.price) + '</p>' : '') +
                        '<button data-aff-order="' + esc(p.id) + '" class="mt-auto text-xs font-bold py-2 rounded-xl bg-turquoise-600 text-white hover:bg-turquoise-700">' + (ar() ? 'اطلب من ' : 'Order on ') + esc(p.platformName) + '</button></div></div>';
                }).join('') + '</div><p class="text-[11px] text-gray-400 mt-2">' + (ar() ? 'الدفع بيتم على المنصة الشريكة، ومال الخدمات بيتتبع طلبك فقط.' : 'Payment is made on the partner platform; we only track your order.') + '</p>';
            container.querySelectorAll('[data-aff-order]').forEach(function (b) { b.onclick = function () { order(b.getAttribute('data-aff-order')); }; });
        } catch (e) { container.innerHTML = ''; }
    }

    // ═══════════════════ MARKETER TAB (inside «متجري») ═══════════════════
    async function renderMarketerTab(container) {
        var me = uid(); if (!me) return;
        container.innerHTML = loading();
        var cfg = await settings();
        if (!cfg.AFF_ENABLED) { container.innerHTML = '<p class="text-center text-gray-400 py-12">' + (ar() ? 'منتجات التسويق غير متاحة حالياً' : 'Marketing products are currently disabled') + '</p>'; return; }
        var acct = {}, prods = [], ords = [], plans = [];
        try { var a = await window.db.collection('marketer_accounts').doc(me).get(); acct = a.exists ? a.data() : {}; } catch (e) {}
        try { var ps = await window.db.collection('affiliate_products').where('marketerId', '==', me).get(); prods = ps.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).sort(function (x, y) { return ms(y.createdAt) - ms(x.createdAt); }); } catch (e) {}
        try { var os = await window.db.collection('affiliate_orders').where('marketerId', '==', me).limit(100).get(); ords = os.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).sort(function (x, y) { return ms(y.createdAt) - ms(x.createdAt); }); } catch (e) {}
        if (cfg.AFF_SUB_ENABLED) { try { var pl = await window.db.collection('marketer_plans').get(); plans = pl.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).filter(function (p) { return p.enabled !== false; }).sort(function (x, y) { return (x.price || 0) - (y.price || 0); }); } catch (e) {} }
        var again = function () { renderMarketerTab(container); };

        var owed = Number(acct.owed) || 0, subUntil = ms(acct.subscriptionUntil), subOk = subUntil > Date.now();
        var blocked = (cfg.AFF_SUB_ENABLED && cfg.AFF_SUB_REQUIRED && !subOk) || (cfg.AFF_DEBT_LIMIT > 0 && owed >= cfg.AFF_DEBT_LIMIT);
        var head = '<div class="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mb-5">' +
            '<div class="grid grid-cols-2 gap-3 text-sm"><div><p class="text-xs text-gray-500">' + (ar() ? 'مستحقات للمنصة' : 'Owed to platform') + '</p><p class="text-xl font-black ' + (blocked ? 'text-red-600' : 'text-gray-900') + '">' + money(owed) + '</p>' +
            (cfg.AFF_DEBT_LIMIT > 0 ? '<p class="text-[11px] text-gray-400">' + (ar() ? 'الحد المسموح ' : 'Limit ') + money(cfg.AFF_DEBT_LIMIT) + '</p>' : '') + '</div>' +
            '<div><p class="text-xs text-gray-500">' + (ar() ? 'الاشتراك' : 'Subscription') + '</p><p class="text-sm font-black ' + (subOk ? 'text-green-700' : 'text-gray-500') + '">' + (subOk ? (ar() ? 'ساري لحد ' : 'Active until ') + new Date(subUntil).toLocaleDateString(ar() ? 'ar-EG' : 'en-GB') : (cfg.AFF_SUB_ENABLED ? (ar() ? 'غير مشترك' : 'Not subscribed') : (ar() ? 'غير مطلوب' : 'Not required'))) + '</p></div></div>' +
            (blocked ? '<p class="text-xs text-red-600 font-bold mt-3">' + (ar() ? 'حسابك متوقف مؤقتاً عن إضافة منتجات واستقبال طلبات جديدة — سدّد المستحقات أو جدّد الاشتراك.' : 'New products/orders are paused until you settle dues or renew.') + '</p>' : '') +
            (owed > 0 ? '<div class="flex gap-2 flex-wrap mt-3"><button id="affPayW" class="text-xs px-4 py-2 bg-navy-700 text-white rounded-xl font-bold"><i class="fa-solid fa-wallet me-1"></i>' + (ar() ? 'سدّد من المحفظة' : 'Pay from wallet') + '</button>' + (owed >= 1 ? '<button id="affPayI" class="text-xs px-4 py-2 bg-turquoise-600 text-white rounded-xl font-bold"><i class="fa-solid fa-credit-card me-1"></i>' + (ar() ? 'سدّد بفاتورة' : 'Pay by invoice') + '</button>' : '') + '</div>' : '') + '</div>';
        var planBox = (cfg.AFF_SUB_ENABLED && plans.length) ? '<div class="mb-5"><p class="font-black text-sm text-gray-900 mb-2">' + (ar() ? 'باقات الاشتراك' : 'Subscription plans') + (cfg.AFF_SUB_REQUIRED ? ' <span class="text-xs text-amber-600">(' + (ar() ? 'إجباري' : 'required') + ')</span>' : '') + '</p><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">' + plans.map(function (p) {
            return '<div class="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm"><p class="font-black text-sm">' + esc(p.nameAr || p.name || '') + '</p><p class="text-xs text-gray-500 mb-2">' + (p.days || 0) + (ar() ? ' يوم' : ' days') + '</p><p class="font-black text-navy-800 mb-3">' + (Number(p.price) > 0 ? money(p.price) : (ar() ? 'مجاناً' : 'Free')) + '</p><button data-plan="' + esc(p.id) + '" class="w-full text-xs font-bold py-2 rounded-xl bg-navy-700 text-white">' + (ar() ? 'اشترك' : 'Subscribe') + '</button></div>';
        }).join('') + '</div></div>' : '';
        var prodBox = '<div class="flex justify-between items-center mb-3"><h3 class="font-black text-gray-900">' + (ar() ? 'منتجاتي (' : 'My products (') + prods.length + ')</h3><button id="affNew" class="btn-primary text-sm px-4 py-2"><i class="fa-solid fa-plus me-1"></i>' + (ar() ? 'منتج برابط خارجي' : 'Add external product') + '</button></div>' +
            (prods.length ? '<div class="space-y-3 mb-6">' + prods.map(function (p) {
                return '<div class="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex gap-3"><img src="' + esc(p.image) + '" class="w-16 h-16 rounded-xl object-cover flex-shrink-0" alt=""><div class="flex-1 min-w-0"><p class="font-black text-sm truncate">' + esc(p.title) + '</p><p class="text-xs text-gray-500 mt-1">' + esc(p.platformName) + ' • ' + (ar() ? 'ضغطات ' : 'clicks ') + (p.clicks || 0) + ' • ' + (ar() ? 'مؤكد ' : 'confirmed ') + (p.confirmedCount || 0) + '</p>' +
                    (p.blocked ? '<p class="text-xs text-red-500 font-bold mt-1">' + (ar() ? 'موقوف من الإدارة' : 'Blocked by admin') + '</p>' : '<div class="flex gap-2 mt-2"><button data-edit="' + esc(p.id) + '" class="text-xs px-3 py-1.5 bg-navy-50 text-navy-700 rounded-lg font-bold">' + (ar() ? 'تعديل' : 'Edit') + '</button><button data-tgl="' + esc(p.id) + '" data-on="' + (p.active !== false ? '1' : '0') + '" class="text-xs px-3 py-1.5 rounded-lg font-bold ' + (p.active !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500') + '">' + (p.active !== false ? (ar() ? 'ظاهر' : 'Visible') : (ar() ? 'مخفي' : 'Hidden')) + '</button></div>') + '</div></div>';
            }).join('') + '</div>' : '<p class="text-center text-gray-400 py-8 mb-4">' + (ar() ? 'لسه ما أضفتش منتجات' : 'No products yet') + '</p>');
        var ordBox = '<h3 class="font-black text-gray-900 mb-3">' + (ar() ? 'الطلبات المتتبعة' : 'Tracked orders') + '</h3>' + (ords.length ? '<div class="space-y-3">' + ords.map(function (o) {
            return '<div class="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm"><div class="flex justify-between gap-3 flex-wrap"><div class="min-w-0"><p class="font-black text-sm truncate">' + esc(o.productTitle || '') + '</p><p class="text-xs text-gray-500 mt-1">' + esc(o.buyerName || '') + ' • ' + esc(o.platformName || '') + ' • <span dir="ltr">' + esc(o.trackingCode || '') + '</span> • ' + new Date(ms(o.createdAt)).toLocaleDateString(ar() ? 'ar-EG' : 'en-GB') + '</p>' +
                (o.counted ? '<p class="text-xs text-gray-400 mt-1">' + (ar() ? 'رسم المنصة: ' : 'Platform fee: ') + money(o.feeAmount) + '</p>' : '') + '</div>' + chip(o.status) + '</div>' +
                (o.status === 'clicked' ? '<div class="flex gap-2 mt-3"><button data-ok="' + esc(o.id) + '" class="text-xs px-4 py-2 bg-turquoise-600 text-white rounded-xl font-bold">' + (ar() ? 'تأكيد إن البيعة تمت' : 'Confirm sale') + '</button><button data-no="' + esc(o.id) + '" class="text-xs px-4 py-2 bg-gray-100 text-gray-600 rounded-xl font-bold">' + (ar() ? 'إلغاء' : 'Cancel') + '</button></div>' : '') + '</div>';
        }).join('') + '</div>' : '<p class="text-center text-gray-400 py-8">' + (ar() ? 'مفيش طلبات لسه' : 'No orders yet') + '</p>');
        container.innerHTML = head + planBox + prodBox + ordBox;

        var run = async function (fn, okMsg) { try { var r = await fn(); if (r && r.redirectUrl) { window.location.href = r.redirectUrl; return; } if (okMsg) toast(okMsg, 'success'); again(); } catch (e) { toast(e.message, 'error'); } };
        var pw = document.getElementById('affPayW'); if (pw) pw.onclick = function () { run(function () { return api('payDuesWallet', {}); }, ar() ? '✅ تم السداد من المحفظة' : '✅ Paid'); };
        var pi = document.getElementById('affPayI'); if (pi) pi.onclick = function () { run(function () { return api('payDuesInvoice', {}); }, ar() ? '✅ تم السداد' : '✅ Paid'); };
        container.querySelectorAll('[data-plan]').forEach(function (b) { b.onclick = function () { run(function () { return api('buyPlan', { planId: b.getAttribute('data-plan') }); }, ar() ? '✅ تم تفعيل الاشتراك' : '✅ Subscribed'); }; });
        container.querySelectorAll('[data-tgl]').forEach(function (b) { b.onclick = function () { run(function () { return api('toggleProduct', { id: b.getAttribute('data-tgl'), active: b.getAttribute('data-on') !== '1' }); }); }; });
        container.querySelectorAll('[data-ok]').forEach(function (b) { b.onclick = function () { if (confirm(ar() ? 'تأكيد إن البيعة اتمت على المنصة الخارجية؟' : 'Confirm the sale happened?')) run(function () { return api('confirmOrder', { orderId: b.getAttribute('data-ok') }); }, ar() ? '✅ تم التأكيد' : '✅ Confirmed'); }; });
        container.querySelectorAll('[data-no]').forEach(function (b) { b.onclick = function () { run(function () { return api('cancelOrder', { orderId: b.getAttribute('data-no') }); }); }; });
        var byId = {}; prods.forEach(function (p) { byId[p.id] = p; });
        document.getElementById('affNew').onclick = function () { openForm(null, again); };
        container.querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function () { openForm(byId[b.getAttribute('data-edit')], again); }; });
    }

    function photoGrid() {
        var g = document.getElementById('affPhotos'); if (!g) return;
        g.innerHTML = photos.map(function (p, i) {
            if (p.file && !p.preview) p.preview = URL.createObjectURL(p.file);
            return '<div class="relative"><img src="' + esc(p.file ? p.preview : p.url) + '" class="w-full h-16 object-cover rounded-lg border-2 ' + (i === 0 ? 'border-turquoise-500' : 'border-gray-200') + '" alt=""><button type="button" data-rm="' + i + '" class="absolute -top-1.5 -end-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs">×</button></div>';
        }).join('');
        g.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { photos.splice(parseInt(b.getAttribute('data-rm'), 10), 1); photoGrid(); }; });
    }
    function openForm(p, done) {
        p = p || {}; photos = [].concat(p.image ? [p.image] : [], (p.images || []).filter(function (u) { return u !== p.image; })).slice(0, 5).map(function (u) { return { url: u }; });
        modal('<div class="flex justify-between items-start mb-3"><h3 class="font-black text-lg">' + (p.id ? (ar() ? 'تعديل المنتج' : 'Edit product') : (ar() ? 'منتج برابط خارجي' : 'External product')) + '</h3><button id="affX" class="text-gray-400 text-xl">&times;</button></div><div class="space-y-3">' +
            field(ar() ? 'العنوان' : 'Title', '<input id="afT" class="input-field w-full mt-1" maxlength="120" value="' + esc(p.title || '') + '">') +
            field(ar() ? 'الوصف' : 'Description', '<textarea id="afD" rows="3" class="input-field w-full mt-1" maxlength="2000">' + esc(p.description || '') + '</textarea>') +
            field(ar() ? 'اسم المنصة اللي بتسوّق لها' : 'Platform name', '<input id="afP" class="input-field w-full mt-1" maxlength="40" value="' + esc(p.platformName || '') + '">') +
            field(ar() ? 'رابط المنتج على المنصة (https)' : 'Product link (https)', '<input id="afU" class="input-field w-full mt-1" dir="ltr" placeholder="https://..." value="">' + (p.id ? '<span class="text-[11px] text-gray-400">' + (ar() ? 'اكتب الرابط من جديد عند التعديل' : 'Re-enter the link when editing') + '</span>' : '')) +
            '<div class="grid grid-cols-2 gap-3">' + field(ar() ? 'السعر للعرض (اختياري)' : 'Display price (optional)', '<input id="afPr" type="number" min="0" step="0.01" class="input-field w-full mt-1" value="' + (p.price || '') + '">') +
            field(ar() ? 'التصنيف' : 'Category', '<select id="afC" class="input-field w-full mt-1">' + CATS.map(function (c) { return '<option value="' + c[0] + '"' + (p.category === c[0] ? ' selected' : '') + '>' + (ar() ? c[1] : c[2]) + '</option>'; }).join('') + '</select>') + '</div>' +
            field(ar() ? 'اسم باراميتر التتبع في رابط المنصة (اختياري، لو بتدعمه)' : 'Tracking parameter name (optional)', '<input id="afK" class="input-field w-full mt-1" dir="ltr" maxlength="20" placeholder="sub_id" value="' + esc(p.trackParam || '') + '">') +
            '<div><p class="text-xs font-bold text-gray-600 mb-1">' + (ar() ? 'الصور (حتى 5)' : 'Photos (max 5)') + '</p><button type="button" id="afPick" class="w-full border-2 border-dashed border-gray-200 rounded-xl p-4 text-xs text-gray-400 hover:border-navy-400"><i class="fa-solid fa-images me-1"></i>' + (ar() ? 'اختار الصور (أول صورة = الغلاف)' : 'Choose photos (first = cover)') + '</button><input type="file" id="afF" accept="image/*" multiple class="hidden"><div id="affPhotos" class="grid grid-cols-5 gap-2 mt-2"></div></div>' +
            '<button id="afSave" class="btn-primary w-full py-2.5">' + (ar() ? 'حفظ' : 'Save') + '</button></div>');
        photoGrid();
        document.getElementById('affX').onclick = closeModal;
        document.getElementById('afPick').onclick = function () { document.getElementById('afF').click(); };
        document.getElementById('afF').onchange = function () {
            var files = Array.prototype.filter.call(this.files || [], function (f) { return f.type && f.type.indexOf('image/') === 0; }); this.value = '';
            var room = 5 - photos.length; if (files.length > room) toast(ar() ? 'الحد الأقصى 5 صور' : 'Max 5 photos', 'warning');
            files.slice(0, Math.max(room, 0)).forEach(function (f) { photos.push({ file: f }); }); photoGrid();
        };
        document.getElementById('afSave').onclick = async function () {
            var b = this, kept = photos.filter(function (x) { return x.url; }).reduce(function (n, x) { return n + x.url.length; }, 0), nNew = photos.filter(function (x) { return x.file; }).length, per = nNew ? Math.floor((880000 - kept) / nNew) : 0;
            if (!photos.length) return toast(ar() ? 'ارفع صورة واحدة على الأقل' : 'Add at least one photo', 'warning');
            if (kept > 880000 || (nNew && per < 45000)) return toast(ar() ? 'حجم الصور كبير — قلل عددها' : 'Photos too large', 'warning');
            b.disabled = true; b.textContent = '...';
            try {
                var urls = [];
                for (var i = 0; i < photos.length; i++) { var x = photos[i]; urls.push(x.url ? x.url : await window.uploadFile(x.file, 'affiliate', 'af_' + Date.now() + '_' + i, { maxPx: 900, maxLen: Math.min(per, 330000) })); }
                var sm = window.StoresManager && window.StoresManager._D;
                await api('saveProduct', { id: p.id || '', storeId: p.storeId || (sm && sm.cur) || uid(), title: val('afT'), description: val('afD'), platformName: val('afP'), externalUrl: val('afU'), price: val('afPr'), category: val('afC'), trackParam: val('afK'), image: urls[0], images: urls });
                closeModal(); toast(ar() ? '✅ تم الحفظ' : '✅ Saved', 'success'); done();
            } catch (e) { b.disabled = false; b.textContent = ar() ? 'حفظ' : 'Save'; toast(e.message, 'error'); }
        };
    }

    // ═══════════════════ ADMIN: settings + subscription plans ═══════════════════
    function tiersToText(raw) { var a; try { a = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { a = null; } if (!Array.isArray(a)) a = JSON.parse(DEF.AFF_FEE_TIERS); return a.map(function (t) { return (t.upTo == null ? '*' : t.upTo) + '=' + t.fee; }).join('\n'); }
    function textToTiers(txt) {
        var rows = String(txt || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) { var m = l.split('='); return { upTo: m[0].trim() === '*' ? null : Math.max(1, parseInt(m[0], 10) || 1), fee: Math.max(0, parseFloat(m[1]) || 0) }; });
        if (!rows.length) rows = JSON.parse(DEF.AFF_FEE_TIERS);
        if (!rows.some(function (r) { return r.upTo == null; })) rows.push({ upTo: null, fee: rows[rows.length - 1].fee });
        return JSON.stringify(rows);
    }
    function sw(id, on, title, hint, tone) { return '<label class="flex items-center gap-3 p-4 ' + (tone || 'bg-gray-50') + ' rounded-xl"><input id="' + id + '" type="checkbox" ' + (on ? 'checked' : '') + '><div><p class="font-bold text-sm">' + title + '</p><p class="text-xs text-gray-500">' + hint + '</p></div></label>'; }
    async function adminSettings(container, root) {
        container.innerHTML = loading();
        var c = await settings(), plans = [];
        try { var pl = await window.db.collection('marketer_plans').get(); plans = pl.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).sort(function (a, b) { return (a.price || 0) - (b.price || 0); }); } catch (e) {}
        var sel = function (id, v, opts) { return '<select id="' + id + '" class="input-field w-full mt-1">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (v === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>'; };
        container.innerHTML = '<div class="grid lg:grid-cols-2 gap-6"><div class="space-y-4">' +
            '<h3 class="font-black">' + (ar() ? 'إعدادات برنامج التسويق بالرابط' : 'External-link program settings') + '</h3>' +
            sw('afE', c.AFF_ENABLED, ar() ? 'تفعيل منتجات التسويق بالرابط' : 'Enable external-link products', ar() ? 'مقفول افتراضياً. لو اتقفل: ما حدش يضيف منتجات ولا العملاء يطلبوا.' : 'Off by default.', 'bg-amber-50 border border-amber-200') +
            field(ar() ? 'إيه اللي يتحسب «طلب» ويتحاسب عليه المسوّق' : 'What counts as an order', sel('afM', c.AFF_COUNT_MODE, [['confirmed', ar() ? 'الطلب اللي المسوّق يأكّده' : 'Marketer-confirmed sale'], ['click', ar() ? 'أي ضغطة عميل على «اطلب»' : 'Every customer click']])) +
            sw('afFe', c.AFF_FEE_ENABLED, ar() ? 'تفعيل رسم على الطلبات' : 'Charge a per-order fee', ar() ? 'الرسم بيتجمع كمستحقات على المسوّق.' : 'Accumulates as dues.') +
            '<div class="grid grid-cols-2 gap-3">' + field(ar() ? 'شكل الرسم' : 'Fee type', sel('afFm', c.AFF_FEE_MODE, [['fixed', ar() ? 'مبلغ ثابت' : 'Fixed'], ['tiers', ar() ? 'شرائح' : 'Tiers']])) +
            field(ar() ? 'المبلغ الثابت لكل طلب (ج.م)' : 'Fixed fee per order (EGP)', '<input id="afFx" type="number" min="0" step="0.01" class="input-field w-full mt-1" value="' + c.AFF_FEE_FIXED + '">') + '</div>' +
            field(ar() ? 'الشرائح — سطر لكل شريحة: «آخر رقم طلب = الرسم»، و«*» لكل اللي بعده' : 'Tiers — one per line: "last order # = fee", "*" for the rest', '<textarea id="afTi" rows="4" class="input-field w-full mt-1" dir="ltr">' + esc(tiersToText(c.AFF_FEE_TIERS)) + '</textarea><span class="text-[11px] text-gray-400">' + (ar() ? 'مثال: 50=0 يعني أول 50 طلب مجاناً، و*=2 يعني بعدها 2 ج.م.' : 'e.g. 50=0 then *=2') + '</span>') +
            field(ar() ? 'العدّاد بيتحسب على' : 'Order counter period', sel('afPe', c.AFF_TIER_PERIOD, [['month', ar() ? 'الشهر (يبدأ من الأول كل شهر)' : 'Calendar month'], ['lifetime', ar() ? 'العمر كله' : 'Lifetime']])) +
            sw('afSe', c.AFF_SUB_ENABLED, ar() ? 'تفعيل الاشتراكات' : 'Enable subscriptions', ar() ? 'بيظهر للمسوّق الباقات اللي تعملها تحت.' : 'Marketers see the plans you create.') +
            sw('afSr', c.AFF_SUB_REQUIRED, ar() ? 'الاشتراك إجباري' : 'Subscription required', ar() ? 'مقفول افتراضياً. مفيد بس لو الاشتراكات مفعّلة. لو انتهى: ما يضيفش منتجات جديدة وطلبات منتجاته توقف.' : 'Only effective when subscriptions are enabled.') +
            field(ar() ? 'سقف المستحقات قبل الإيقاف المؤقت (ج.م، 0 = بدون سقف)' : 'Dues limit before pausing (EGP, 0 = none)', '<input id="afDl" type="number" min="0" step="1" class="input-field w-full mt-1" value="' + c.AFF_DEBT_LIMIT + '">') +
            '<button id="afSv" class="btn-primary px-6 py-2.5 text-sm">' + (ar() ? 'حفظ الإعدادات' : 'Save settings') + '</button></div>' +
            '<div><div class="flex justify-between items-center mb-3"><h3 class="font-black">' + (ar() ? 'باقات اشتراك المسوّقين' : 'Marketer plans') + '</h3><button id="afPlNew" class="text-xs px-3 py-1.5 bg-navy-700 text-white rounded-lg font-bold">+ ' + (ar() ? 'باقة' : 'Plan') + '</button></div><div id="afPlans" class="space-y-3"></div></div></div>';
        var pbox = document.getElementById('afPlans');
        pbox.innerHTML = plans.length ? plans.map(function (p) { return '<div class="p-4 bg-gray-50 rounded-xl flex items-center justify-between gap-3"><div><p class="font-black text-sm">' + esc(p.nameAr || '') + '</p><p class="text-xs text-gray-500">' + (p.days || 0) + (ar() ? ' يوم • ' : ' days • ') + money(p.price || 0) + (p.enabled === false ? ' • ' + (ar() ? 'متوقفة' : 'off') : '') + '</p></div><div class="flex gap-2"><button data-pe="' + esc(p.id) + '" class="text-xs px-3 py-1.5 bg-white border rounded-lg font-bold">' + (ar() ? 'تعديل' : 'Edit') + '</button><button data-pd="' + esc(p.id) + '" class="text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-lg font-bold">' + (ar() ? 'حذف' : 'Delete') + '</button></div></div>'; }).join('') : '<p class="text-center text-gray-400 py-6 text-sm">' + (ar() ? 'مفيش باقات' : 'No plans') + '</p>';
        var pById = {}; plans.forEach(function (p) { pById[p.id] = p; });
        document.getElementById('afPlNew').onclick = function () { planForm(null, root); };
        pbox.querySelectorAll('[data-pe]').forEach(function (b) { b.onclick = function () { planForm(pById[b.getAttribute('data-pe')], root); }; });
        pbox.querySelectorAll('[data-pd]').forEach(function (b) { b.onclick = async function () { if (!confirm(ar() ? 'حذف الباقة؟ (الاشتراكات الجارية مش هتتأثر)' : 'Delete plan?')) return; try { await window.db.collection('marketer_plans').doc(b.getAttribute('data-pd')).delete(); renderAdminTab(root); } catch (e) { toast(e.message, 'error'); } }; });
        document.getElementById('afSv').onclick = async function () {
            var data = { AFF_ENABLED: document.getElementById('afE').checked, AFF_COUNT_MODE: val('afM') === 'click' ? 'click' : 'confirmed', AFF_FEE_ENABLED: document.getElementById('afFe').checked, AFF_FEE_MODE: val('afFm') === 'tiers' ? 'tiers' : 'fixed',
                AFF_FEE_FIXED: Math.max(0, parseFloat(val('afFx')) || 0), AFF_FEE_TIERS: textToTiers(val('afTi')), AFF_TIER_PERIOD: val('afPe') === 'lifetime' ? 'lifetime' : 'month',
                AFF_SUB_ENABLED: document.getElementById('afSe').checked, AFF_SUB_REQUIRED: document.getElementById('afSr').checked, AFF_DEBT_LIMIT: Math.max(0, parseFloat(val('afDl')) || 0) };
            try { await window.db.collection('settings').doc('platform').set(data, { merge: true }); toast(ar() ? '✅ تم الحفظ' : '✅ Saved', 'success'); renderAdminTab(root); } catch (e) { toast(e.message, 'error'); }
        };
    }
    // ── admin: marketers & dues ──
    async function adminMarketers(body) {
        body.innerHTML = loading();
        var cfg = await settings(), field = cfg.AFF_TIER_PERIOD === 'lifetime' ? 'cnt_all' : 'cnt_' + new Date().getUTCFullYear() + '_' + String(new Date().getUTCMonth() + 1).padStart(2, '0');
        var accts = {}, counts = {}, ids = {};
        try { (await window.db.collection('marketer_accounts').limit(300).get()).docs.forEach(function (d) { accts[d.id] = d.data(); ids[d.id] = 1; }); } catch (e) {}
        try { (await window.db.collection('affiliate_products').limit(500).get()).docs.forEach(function (d) { var x = d.data(); counts[x.marketerId] = (counts[x.marketerId] || 0) + 1; ids[x.marketerId] = 1; }); } catch (e) {}
        var list = Object.keys(ids), names = {};
        await Promise.all(list.map(function (id) { return window.db.collection('users').doc(id).get().then(function (d) { names[id] = d.exists ? (d.data().name || d.data().displayName || d.data().email || id) : id; }).catch(function () { names[id] = id; }); }));
        var rows = list.map(function (id) { var a = accts[id] || {}; return { id: id, name: names[id], products: counts[id] || 0, owed: Number(a.owed) || 0, fees: Number(a.totalFees) || 0, paid: Number(a.totalPaid) || 0, sub: ms(a.subscriptionUntil), plan: a.planName || '', cnt: Number(a[field]) || 0 }; }).sort(function (x, y) { return y.owed - x.owed; });
        var T = rows.reduce(function (t, r) { t.owed += r.owed; t.fees += r.fees; t.paid += r.paid; return t; }, { owed: 0, fees: 0, paid: 0 });
        var box = function (l, v, c) { return '<div class="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm"><p class="text-xs text-gray-500">' + l + '</p><p class="text-xl font-black ' + (c || '') + '">' + v + '</p></div>'; };
        body.innerHTML = '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">' + box(ar() ? 'عدد المسوّقين' : 'Marketers', rows.length) + box(ar() ? 'رسوم اتحسبت' : 'Fees booked', money(T.fees)) + box(ar() ? 'اتحصّل' : 'Collected', money(T.paid), 'text-green-700') + box(ar() ? 'مستحق لسه' : 'Outstanding', money(T.owed), T.owed > 0 ? 'text-red-600' : '') + '</div>' +
            (rows.length ? '<div class="overflow-x-auto"><table class="w-full text-sm bg-white rounded-2xl shadow-sm"><thead class="text-xs text-gray-500 text-start"><tr>' + [ar() ? 'المسوّق' : 'Marketer', ar() ? 'منتجات' : 'Products', ar() ? 'طلبات الفترة' : 'Orders (period)', ar() ? 'مستحق' : 'Owed', ar() ? 'إجمالي الرسوم' : 'Total fees', ar() ? 'اتسدد' : 'Paid', ar() ? 'الاشتراك' : 'Subscription'].map(function (h) { return '<th class="p-3 text-start">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
                rows.map(function (r) { var over = cfg.AFF_DEBT_LIMIT > 0 && r.owed >= cfg.AFF_DEBT_LIMIT; return '<tr class="border-t border-gray-50"><td class="p-3 font-bold">' + esc(r.name) + '</td><td class="p-3">' + r.products + '</td><td class="p-3">' + r.cnt + '</td><td class="p-3 font-black ' + (over ? 'text-red-600' : '') + '">' + money(r.owed) + (over ? ' ⛔' : '') + '</td><td class="p-3">' + money(r.fees) + '</td><td class="p-3 text-green-700">' + money(r.paid) + '</td><td class="p-3 text-xs">' + (r.sub > Date.now() ? esc(r.plan) + ' — ' + new Date(r.sub).toLocaleDateString(ar() ? 'ar-EG' : 'en-GB') : '—') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="text-center text-gray-400 py-10">' + (ar() ? 'مفيش مسوّقين لسه' : 'No marketers yet') + '</p>');
    }
    // ── admin: products & links moderation ──
    async function adminProducts(body, root) {
        body.innerHTML = loading();
        var list = [];
        try { list = (await window.db.collection('affiliate_products').limit(300).get()).docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).sort(function (x, y) { return ms(y.createdAt) - ms(x.createdAt); }); } catch (e) { body.innerHTML = '<p class="text-red-500 text-center py-6">' + esc(e.message) + '</p>'; return; }
        body.innerHTML = '<input id="afQ" class="input-field w-full mb-4" placeholder="' + (ar() ? 'ابحث بعنوان المنتج أو المنصة أو اسم المسوّق...' : 'Search...') + '"><div id="afList" class="space-y-3"></div>';
        var draw = function () {
            var q = val('afQ').trim().toLowerCase(), rows = list.filter(function (p) { return !q || (p.title + ' ' + p.platformName + ' ' + (p.marketerName || '')).toLowerCase().indexOf(q) > -1; });
            var el = document.getElementById('afList');
            el.innerHTML = rows.length ? rows.map(function (p) {
                return '<div class="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex gap-3"><img src="' + esc(p.image) + '" class="w-14 h-14 rounded-xl object-cover flex-shrink-0" alt=""><div class="flex-1 min-w-0"><p class="font-black text-sm truncate">' + esc(p.title) + '</p><p class="text-xs text-gray-500 mt-0.5">' + esc(p.platformName) + ' • ' + esc(p.marketerName || '') + ' • ' + (ar() ? 'ضغطات ' : 'clicks ') + (p.clicks || 0) + ' • ' + (ar() ? 'مؤكد ' : 'confirmed ') + (p.confirmedCount || 0) + '</p>' +
                    (p.blocked ? '<p class="text-xs text-red-600 font-bold mt-1">⛔ ' + esc(p.blockReason || '') + '</p>' : '') +
                    '<div class="flex gap-2 mt-2 flex-wrap"><button data-open="' + esc(p.id) + '" class="text-xs px-3 py-1.5 bg-navy-50 text-navy-700 rounded-lg font-bold"><i class="fa-solid fa-arrow-up-right-from-square me-1"></i>' + (ar() ? 'فتح الرابط' : 'Open link') + '</button><button data-blk="' + esc(p.id) + '" data-b="' + (p.blocked ? '0' : '1') + '" class="text-xs px-3 py-1.5 rounded-lg font-bold ' + (p.blocked ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600') + '">' + (p.blocked ? (ar() ? 'رفع الحظر' : 'Unblock') : (ar() ? 'حظر' : 'Block')) + '</button></div></div></div>';
            }).join('') : '<p class="text-center text-gray-400 py-8">' + (ar() ? 'مفيش منتجات' : 'No products') + '</p>';
            el.querySelectorAll('[data-open]').forEach(function (b) { b.onclick = async function () { try { var d = await window.db.collection('affiliate_products').doc(b.getAttribute('data-open')).collection('private').doc('link').get(); if (d.exists && d.data().url) window.open(d.data().url, '_blank'); else toast(ar() ? 'مفيش رابط' : 'No link', 'warning'); } catch (e) { toast(e.message, 'error'); } }; });
            el.querySelectorAll('[data-blk]').forEach(function (b) { b.onclick = async function () {
                var on = b.getAttribute('data-b') === '1', reason = '';
                if (on) { reason = prompt(ar() ? 'سبب الحظر (هيوصل للمسوّق):' : 'Reason (sent to marketer):') || ''; if (reason.trim().length < 3) return; }
                try { await api('adminBlockProduct', { id: b.getAttribute('data-blk'), blocked: on, reason: reason }); toast('✅', 'success'); adminProducts(body, root); } catch (e) { toast(e.message, 'error'); }
            }; });
        };
        document.getElementById('afQ').oninput = draw; draw();
    }
    var adminView = 'settings';
    async function renderAdminTab(container) {
        var views = [['settings', 'الإعدادات والباقات', 'Settings & plans'], ['marketers', 'المسوّقين والمستحقات', 'Marketers & dues'], ['products', 'المنتجات والروابط', 'Products & links']];
        container.innerHTML = '<div class="flex gap-2 flex-wrap mb-5">' + views.map(function (v) { return '<button data-av="' + v[0] + '" class="text-xs px-4 py-2 rounded-full font-bold ' + (adminView === v[0] ? 'bg-navy-700 text-white' : 'bg-gray-100 text-gray-600') + '">' + (ar() ? v[1] : v[2]) + '</button>'; }).join('') + '</div><div id="afAdmBody"></div>';
        container.querySelectorAll('[data-av]').forEach(function (b) { b.onclick = function () { adminView = b.getAttribute('data-av'); renderAdminTab(container); }; });
        var body = document.getElementById('afAdmBody');
        if (adminView === 'marketers') await adminMarketers(body); else if (adminView === 'products') await adminProducts(body, container); else await adminSettings(body, container);
    }

    function planForm(p, container) {
        p = p || {};
        modal('<div class="flex justify-between mb-3"><h3 class="font-black text-lg">' + (p.id ? (ar() ? 'تعديل باقة' : 'Edit plan') : (ar() ? 'باقة جديدة' : 'New plan')) + '</h3><button id="plX" class="text-gray-400 text-xl">&times;</button></div><div class="space-y-3">' +
            field(ar() ? 'اسم الباقة' : 'Plan name', '<input id="plN" class="input-field w-full mt-1" maxlength="60" value="' + esc(p.nameAr || '') + '">') +
            '<div class="grid grid-cols-2 gap-3">' + field(ar() ? 'المدة (أيام)' : 'Days', '<input id="plD" type="number" min="1" class="input-field w-full mt-1" value="' + (p.days || 30) + '">') + field(ar() ? 'السعر (ج.م، 0 = مجاني)' : 'Price (EGP)', '<input id="plP" type="number" min="0" step="0.01" class="input-field w-full mt-1" value="' + (p.price != null ? p.price : 0) + '">') + '</div>' +
            '<label class="flex items-center gap-2 text-sm font-bold"><input id="plE" type="checkbox" ' + (p.enabled !== false ? 'checked' : '') + '>' + (ar() ? 'مفعّلة' : 'Enabled') + '</label><button id="plS" class="btn-primary w-full py-2.5">' + (ar() ? 'حفظ' : 'Save') + '</button></div>');
        document.getElementById('plX').onclick = closeModal;
        document.getElementById('plS').onclick = async function () {
            var data = { nameAr: val('plN').trim().slice(0, 60), days: Math.max(1, parseInt(val('plD'), 10) || 30), price: Math.max(0, parseFloat(val('plP')) || 0), enabled: document.getElementById('plE').checked, updatedAt: new Date() };
            if (data.nameAr.length < 2) return toast(ar() ? 'اكتب اسم الباقة' : 'Enter a name', 'warning');
            try { if (p.id) await window.db.collection('marketer_plans').doc(p.id).set(data, { merge: true }); else await window.db.collection('marketer_plans').add(Object.assign({ createdAt: new Date() }, data)); closeModal(); renderAdminTab(container); } catch (e) { toast(e.message, 'error'); }
        };
    }

    window.AffiliateUI = { renderMarketerTab: renderMarketerTab, renderStoreProducts: renderStoreProducts, renderAdminTab: renderAdminTab, order: order };
})();
