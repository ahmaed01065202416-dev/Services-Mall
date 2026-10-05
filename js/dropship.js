/**
 * js/dropship.js — Dropshipping UI (seller dashboard tab + admin tab).
 * ============================================================================
 * Model: SUPPLIER lists wholesale products → RESELLER (any seller) imports one and sets his own selling
 * price → BUYER pays online → SUPPLIER ships (carrier + tracking) → on delivery confirmation the supplier
 * gets the wholesale price, the reseller the margin minus the platform commission.
 * Every write goes through /api/dropship (server-side rules); this file only reads Firestore + draws UI.
 * ============================================================================
 */
(function () {
    'use strict';
    var CATS = [['clothing', 'ملابس', 'Clothing'], ['electronics', 'إلكترونيات', 'Electronics'], ['home', 'مستلزمات منزلية', 'Home'], ['beauty', 'مستحضرات تجميل', 'Beauty'], ['food', 'أطعمة ومشروبات', 'Food'], ['accessories', 'إكسسوارات', 'Accessories'], ['other', 'أخرى', 'Other']];
    var DEFAULTS = { DROPSHIP_ENABLED: true, DROPSHIP_AUTO_APPROVE_SUPPLIERS: true, DROPSHIP_MIN_MARGIN_PERCENT: 10, DROPSHIP_MIN_MARGIN_FIXED: 1, DROPSHIP_FEE_BASE: 'margin', DROPSHIP_SHIP_SLA_DAYS: 3 };
    var ST = { processing: ['بانتظار الشحن', 'To ship', 'bg-amber-100 text-amber-700'], shipped: ['تم الشحن', 'Shipped', 'bg-blue-100 text-blue-700'], delivered: ['تم التسليم', 'Delivered', 'bg-green-100 text-green-700'], completed: ['مكتمل', 'Completed', 'bg-green-100 text-green-700'] };
    var state = { view: 'catalog', photos: [], cat: '', q: '' };

    function ar() { return !window.AppState || window.AppState.language !== 'en'; }
    function esc(v) { return typeof window.escapeHtml === 'function' ? window.escapeHtml(v) : String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
    function money(n) { return typeof window.formatCurrency === 'function' ? window.formatCurrency(n) : (Number(n) || 0) + ' ج.م'; }
    function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t || 'info'); }
    function ms(v) { if (!v) return 0; if (typeof v.toMillis === 'function') return v.toMillis(); if (v.seconds) return v.seconds * 1000; return Date.parse(v) || 0; }
    function uid() { return window.AppState && window.AppState.currentUser ? window.AppState.currentUser.uid : null; }
    function catName(k) { var c = CATS.filter(function (x) { return x[0] === k; })[0]; return c ? (ar() ? c[1] : c[2]) : k; }
    function chip(status) { var s = ST[status] || [status, status, 'bg-gray-100 text-gray-600']; return '<span class="text-xs font-bold px-2.5 py-1 rounded-full ' + s[2] + '">' + esc(ar() ? s[0] : s[1]) + '</span>'; }

    async function api(action, payload) {
        var tok = window.auth && window.auth.currentUser ? await window.auth.currentUser.getIdToken() : '';
        var res = await fetch('/api/dropship', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok }, body: JSON.stringify(Object.assign({ action: action }, payload || {})) });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    }
    async function settings() {
        var out = Object.assign({}, DEFAULTS);
        try { var d = await window.db.collection('settings').doc('platform').get(); if (d.exists) { var c = d.data(); Object.keys(DEFAULTS).forEach(function (k) { if (c[k] !== undefined && c[k] !== null) out[k] = c[k]; }); } } catch (e) {}
        return out;
    }
    function floorPrice(w, ds) { w = Number(w) || 0; return Number((w + Math.max(Number(ds.DROPSHIP_MIN_MARGIN_FIXED) || 0, w * (Number(ds.DROPSHIP_MIN_MARGIN_PERCENT) || 0) / 100, 0.01)).toFixed(2)); }
    function modal(html, id) {
        var old = document.getElementById(id || 'dsModal'); if (old) old.remove();
        var w = document.createElement('div'); w.id = id || 'dsModal';
        w.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
        w.innerHTML = '<div style="background:#fff;border-radius:20px;max-width:560px;width:100%;max-height:92vh;overflow:auto;padding:22px">' + html + '</div>';
        w.addEventListener('click', function (e) { if (e.target === w) w.remove(); });
        document.body.appendChild(w); return w.firstChild;
    }
    function closeModal() { var m = document.getElementById('dsModal'); if (m) m.remove(); }
    function field(label, inner) { return '<label class="block text-xs font-bold text-gray-600">' + label + inner + '</label>'; }

    // ═════════════════════════ SELLER / SUPPLIER TAB ═══════════════════════════
    async function renderSellerTab(container) {
        var me = uid(); if (!me) return;
        var ds = await settings();
        if (!ds.DROPSHIP_ENABLED) { container.innerHTML = '<p class="text-center text-gray-400 py-12">' + (ar() ? 'الدروبشيبنج متوقف حالياً' : 'Dropshipping is currently disabled') + '</p>'; return; }
        var sup = null; try { var sd = await window.db.collection('suppliers').doc(me).get(); sup = sd.exists ? sd.data() : null; } catch (e) {}
        var active = sup && sup.status === 'active';
        var views = [['catalog', 'كتالوج الموردين', 'Supplier catalog']];
        if (active) { views.push(['mine', 'منتجاتي كمورد', 'My supplier products'], ['orders', 'طلبات الشحن', 'Orders to ship']); }
        if (!views.some(function (v) { return v[0] === state.view; })) state.view = 'catalog';
        container.innerHTML = '<div class="flex gap-2 overflow-x-auto pb-3 mb-4 border-b border-gray-100">' + views.map(function (v) {
            return '<button data-v="' + v[0] + '" class="px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap ' + (state.view === v[0] ? 'bg-navy-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200') + '">' + (ar() ? v[1] : v[2]) + '</button>';
        }).join('') + '</div>' + supplierBanner(sup) + '<div id="dsBody"><div class="text-center py-8"><i class="fa-solid fa-spinner fa-spin text-navy-500 text-2xl"></i></div></div>';
        container.querySelectorAll('[data-v]').forEach(function (b) { b.onclick = function () { state.view = b.getAttribute('data-v'); renderSellerTab(container); }; });
        var cta = document.getElementById('dsBecome');
        if (cta) cta.onclick = async function () {
            var name = (document.getElementById('dsBizName') || {}).value || ''; cta.disabled = true;
            try { var r = await api('becomeSupplier', { businessName: name }); toast(r.status === 'active' ? (ar() ? '✅ أصبحت مورداً' : '✅ You are a supplier') : (ar() ? 'طلبك قيد المراجعة' : 'Request under review'), 'success'); state.view = 'mine'; renderSellerTab(container); }
            catch (e) { cta.disabled = false; toast(e.message, 'error'); }
        };
        var body = document.getElementById('dsBody');
        try {
            if (state.view === 'catalog') await viewCatalog(body, ds);
            else if (state.view === 'mine') await viewMine(body, container);
            else await viewOrders(body, container);
        } catch (e) { body.innerHTML = '<p class="text-red-500 text-center py-6">' + esc(e.message) + '</p>'; }
    }
    function supplierBanner(sup) {
        if (sup && sup.status === 'active') return '';
        if (sup) return '<div class="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 text-sm font-bold mb-4">' + (sup.status === 'pending' ? (ar() ? 'حساب المورد قيد المراجعة' : 'Supplier account under review') : (ar() ? 'حساب المورد موقوف — تواصل مع الدعم' : 'Supplier account suspended')) + '</div>';
        return '<div class="bg-turquoise-50 border border-turquoise-100 rounded-2xl p-4 mb-4"><p class="font-black text-sm text-gray-900 mb-1"><i class="fa-solid fa-boxes-packing me-1"></i>' + (ar() ? 'عندك منتجات للبيع بالجملة؟ كن مورداً' : 'Have wholesale products? Become a supplier') + '</p>' +
            '<p class="text-xs text-gray-600 mb-3">' + (ar() ? 'ضيف منتجاتك بسعر الجملة والبائعين هيبيعوها بدالك. إنت بس بتشحن وبتاخد سعر الجملة بعد تأكيد الاستلام.' : 'List products at wholesale; sellers resell them. You only ship and get the wholesale price after delivery is confirmed.') + '</p>' +
            '<div class="flex gap-2 flex-wrap"><input id="dsBizName" class="input-field text-sm flex-1" placeholder="' + (ar() ? 'اسم نشاطك (اختياري)' : 'Business name (optional)') + '"><button id="dsBecome" class="btn-primary text-sm px-5 py-2">' + (ar() ? 'سجّل كمورد' : 'Register') + '</button></div></div>';
    }

    // ── catalogue (resellers) ──────────────────────────────────────────────────
    async function viewCatalog(body, ds) {
        var snap = await window.db.collection('supplier_products').where('active', '==', true).limit(120).get();
        var me = uid();
        var all = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).filter(function (p) { return !p.blocked && p.supplierId !== me && Number(p.stock) > 0; });
        var mine = {}; try { var ms_ = await window.db.collection('services').where('sellerId', '==', me).get(); ms_.docs.forEach(function (d) { var x = d.data(); if (x.supplierProductId) mine[x.supplierProductId] = true; }); } catch (e) {}
        function draw() {
            var q = state.q.trim().toLowerCase();
            var list = all.filter(function (p) { return (!state.cat || p.category === state.cat) && (!q || (p.title || '').toLowerCase().indexOf(q) > -1); });
            var grid = document.getElementById('dsGrid'); if (!grid) return;
            grid.innerHTML = list.length ? list.map(function (p) {
                var imp = mine[p.id];
                return '<div class="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm flex flex-col"><div class="h-40 bg-gray-100"><img src="' + esc(p.image) + '" class="w-full h-full object-cover" loading="lazy" alt=""></div>' +
                    '<div class="p-3 flex flex-col gap-1.5 flex-1"><p class="font-black text-sm text-gray-900 line-clamp-2">' + esc(p.title) + '</p><p class="text-xs text-gray-400">' + esc(p.supplierName || '') + ' • ' + esc(catName(p.category)) + '</p>' +
                    '<div class="flex justify-between text-xs mt-1"><span class="text-gray-500">' + (ar() ? 'سعر الجملة' : 'Wholesale') + '</span><b class="text-navy-700">' + money(p.wholesalePrice) + '</b></div>' +
                    (p.suggestedPrice ? '<div class="flex justify-between text-xs"><span class="text-gray-500">' + (ar() ? 'سعر مقترح' : 'Suggested') + '</span><b>' + money(p.suggestedPrice) + '</b></div>' : '') +
                    '<div class="flex justify-between text-xs text-gray-500"><span>' + (ar() ? 'مخزون ' : 'Stock ') + p.stock + '</span><span>' + (ar() ? 'توصيل ' : 'Ships in ') + p.shipDays + (ar() ? ' يوم' : 'd') + '</span></div>' +
                    '<button ' + (imp ? 'disabled' : 'data-imp="' + esc(p.id) + '"') + ' class="mt-auto pt-0 text-xs font-bold py-2 rounded-xl ' + (imp ? 'bg-gray-100 text-gray-400' : 'bg-turquoise-600 text-white hover:bg-turquoise-700') + '">' + (imp ? (ar() ? 'مستورد بالفعل' : 'Already imported') : (ar() ? 'استورد وبيع' : 'Import & sell')) + '</button></div></div>';
            }).join('') : '<p class="col-span-full text-center text-gray-400 py-10">' + (ar() ? 'مفيش منتجات مطابقة' : 'No matching products') + '</p>';
            grid.querySelectorAll('[data-imp]').forEach(function (b) { b.onclick = function () { openImport(all.filter(function (p) { return p.id === b.getAttribute('data-imp'); })[0], ds); }; });
        }
        body.innerHTML = '<div class="flex gap-2 flex-wrap mb-4"><input id="dsSearch" class="input-field text-sm flex-1 min-w-[160px]" placeholder="' + (ar() ? 'ابحث في الكتالوج' : 'Search catalog') + '" value="' + esc(state.q) + '">' +
            '<select id="dsCat" class="input-field text-sm"><option value="">' + (ar() ? 'كل التصنيفات' : 'All categories') + '</option>' + CATS.map(function (c) { return '<option value="' + c[0] + '"' + (state.cat === c[0] ? ' selected' : '') + '>' + (ar() ? c[1] : c[2]) + '</option>'; }).join('') + '</select></div>' +
            '<p class="text-xs text-gray-500 bg-blue-50 rounded-xl p-3 mb-4">' + (ar() ? 'اختار منتج، حدد سعر بيعك (أعلى من سعر الجملة + أقل ربح ' + ds.DROPSHIP_MIN_MARGIN_PERCENT + '%)، وهيتنشر باسمك. المورد هو اللي بيشحن للعميل.' : 'Pick a product, set your selling price (above wholesale + minimum ' + ds.DROPSHIP_MIN_MARGIN_PERCENT + '% margin); it is published under your name. The supplier ships to the customer.') + '</p>' +
            '<div id="dsGrid" class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"></div>';
        document.getElementById('dsSearch').oninput = function () { state.q = this.value; draw(); };
        document.getElementById('dsCat').onchange = function () { state.cat = this.value; draw(); };
        draw();
    }
    function openImport(p, ds) {
        if (!p) return;
        var floor = floorPrice(p.wholesalePrice, ds), start = Math.max(floor, Number(p.suggestedPrice) || floor);
        var box = modal('<div class="flex justify-between items-start mb-3"><h3 class="font-black text-lg text-gray-900">' + (ar() ? 'استيراد منتج' : 'Import product') + '</h3><button id="dsX" class="text-gray-400 text-xl">&times;</button></div>' +
            '<div class="flex gap-3 mb-4"><img src="' + esc(p.image) + '" class="w-20 h-20 rounded-xl object-cover" alt=""><div><p class="font-bold text-sm">' + esc(p.title) + '</p><p class="text-xs text-gray-500">' + (ar() ? 'سعر الجملة ' : 'Wholesale ') + money(p.wholesalePrice) + ' • ' + (ar() ? 'أقل سعر بيع ' : 'min price ') + money(floor) + '</p></div></div>' +
            '<div class="space-y-3">' + field(ar() ? 'عنوان المنتج عندك' : 'Your listing title', '<input id="dsImpTitle" class="input-field w-full mt-1" maxlength="120" value="' + esc(p.title) + '">') +
            field((ar() ? 'سعر البيع (ج.م) — الحد الأدنى ' : 'Selling price — min ') + floor, '<input id="dsImpPrice" type="number" min="' + floor + '" step="0.01" class="input-field w-full mt-1" value="' + start + '">') +
            '<div id="dsImpCalc" class="bg-gray-50 rounded-xl p-3 text-xs space-y-1"></div>' +
            '<button id="dsImpGo" class="btn-primary w-full py-2.5">' + (ar() ? 'انشر في متجري' : 'Publish to my store') + '</button></div>');
        function calc() {
            var price = parseFloat(document.getElementById('dsImpPrice').value) || 0, margin = Math.max(0, price - p.wholesalePrice);
            var base = ds.DROPSHIP_FEE_BASE === 'total' ? price : margin, fee = typeof window.calcSellerFee === 'function' ? Math.min(window.calcSellerFee(base), margin) : 0;
            var c = document.getElementById('dsImpCalc'); if (!c) return;
            c.innerHTML = '<div class="flex justify-between"><span>' + (ar() ? 'هامشك' : 'Your margin') + '</span><b>' + money(margin) + '</b></div><div class="flex justify-between text-gray-500"><span>' + (ar() ? 'عمولة المنصة (تقريبي)' : 'Platform commission (approx.)') + '</span><b>- ' + money(fee) + '</b></div><div class="flex justify-between text-green-700 text-sm"><span>' + (ar() ? 'صافي ربحك لكل قطعة' : 'Your net profit per unit') + '</span><b>' + money(margin - fee) + '</b></div>' +
                (price < floor ? '<p class="text-red-500 font-bold">' + (ar() ? 'السعر أقل من الحد الأدنى' : 'Below the minimum price') + '</p>' : '');
        }
        document.getElementById('dsX').onclick = closeModal; document.getElementById('dsImpPrice').oninput = calc; calc();
        document.getElementById('dsImpGo').onclick = async function () {
            var b = this, price = parseFloat(document.getElementById('dsImpPrice').value) || 0;
            if (price < floor) return toast((ar() ? 'أقل سعر مسموح ' : 'Minimum price ') + floor, 'warning');
            b.disabled = true;
            try { await api('importProduct', { supplierProductId: p.id, price: price, title: document.getElementById('dsImpTitle').value }); closeModal(); toast(ar() ? '✅ تم نشر المنتج في متجرك' : '✅ Published to your store', 'success'); var c = document.getElementById('dsBody'); if (c && c.parentNode) renderSellerTab(c.parentNode); }
            catch (e) { b.disabled = false; toast(e.message, 'error'); }
        };
    }

    // ── supplier: my products ──────────────────────────────────────────────────
    async function viewMine(body, container) {
        var snap = await window.db.collection('supplier_products').where('supplierId', '==', uid()).get();
        var list = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).sort(function (a, b) { return ms(b.createdAt) - ms(a.createdAt); });
        body.innerHTML = '<div class="flex justify-between items-center mb-4"><h3 class="font-black text-gray-900">' + (ar() ? 'منتجاتي (' : 'My products (') + list.length + ')</h3><button id="dsNew" class="btn-primary text-sm px-4 py-2"><i class="fa-solid fa-plus me-1"></i>' + (ar() ? 'منتج جديد' : 'New product') + '</button></div>' +
            (list.length ? '<div class="space-y-3">' + list.map(function (p) {
                return '<div class="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex gap-3"><img src="' + esc(p.image) + '" class="w-16 h-16 rounded-xl object-cover flex-shrink-0" alt=""><div class="flex-1 min-w-0"><p class="font-black text-sm truncate">' + esc(p.title) + '</p>' +
                    '<p class="text-xs text-gray-500 mt-1">' + (ar() ? 'جملة ' : 'Wholesale ') + money(p.wholesalePrice) + ' • ' + (ar() ? 'مخزون ' : 'stock ') + p.stock + ' • ' + (ar() ? 'مباع ' : 'sold ') + (p.soldCount || 0) + '</p>' +
                    (p.blocked ? '<p class="text-xs text-red-500 font-bold mt-1">' + (ar() ? 'موقوف من الإدارة' : 'Blocked by admin') + '</p>' : '') +
                    '<div class="flex gap-2 mt-2"><button data-edit="' + esc(p.id) + '" class="text-xs px-3 py-1.5 bg-navy-50 text-navy-700 rounded-lg font-bold">' + (ar() ? 'تعديل' : 'Edit') + '</button>' +
                    (p.blocked ? '' : '<button data-tgl="' + esc(p.id) + '" data-on="' + (p.active !== false ? '1' : '0') + '" class="text-xs px-3 py-1.5 rounded-lg font-bold ' + (p.active !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500') + '">' + (p.active !== false ? (ar() ? 'مفعّل' : 'Active') : (ar() ? 'متوقف' : 'Paused')) + '</button>') + '</div></div></div>';
            }).join('') + '</div>' : '<p class="text-center text-gray-400 py-10">' + (ar() ? 'لسه ما أضفتش منتجات' : 'No products yet') + '</p>');
        var byId = {}; list.forEach(function (p) { byId[p.id] = p; });
        document.getElementById('dsNew').onclick = function () { openProductForm(null, container); };
        body.querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function () { openProductForm(byId[b.getAttribute('data-edit')], container); }; });
        body.querySelectorAll('[data-tgl]').forEach(function (b) { b.onclick = async function () { try { await api('supplierToggleProduct', { id: b.getAttribute('data-tgl'), active: b.getAttribute('data-on') !== '1' }); renderSellerTab(container); } catch (e) { toast(e.message, 'error'); } }; });
    }
    function photoGrid() {
        var g = document.getElementById('dsPhotos'); if (!g) return;
        g.innerHTML = state.photos.map(function (p, i) {
            if (p.file && !p.preview) p.preview = URL.createObjectURL(p.file);
            return '<div class="relative"><img src="' + esc(p.file ? p.preview : p.url) + '" class="w-full h-16 object-cover rounded-lg border-2 ' + (i === 0 ? 'border-turquoise-500' : 'border-gray-200') + '" alt="">' + (i === 0 ? '<span class="absolute bottom-1 start-1 text-[10px] font-black bg-turquoise-600 text-white px-1 rounded">' + (ar() ? 'الغلاف' : 'Cover') + '</span>' : '') +
                '<button type="button" data-rm="' + i + '" class="absolute -top-1.5 -end-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs">×</button></div>';
        }).join('');
        g.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { state.photos.splice(parseInt(b.getAttribute('data-rm'), 10), 1); photoGrid(); }; });
        var c = document.getElementById('dsPhotoCount'); if (c) c.textContent = '(' + state.photos.length + '/5)';
    }
    function openProductForm(p, container) {
        p = p || {}; state.photos = [].concat(p.image ? [p.image] : [], (p.images || []).filter(function (u) { return u !== p.image; })).slice(0, 5).map(function (u) { return { url: u }; });
        modal('<div class="flex justify-between items-start mb-3"><h3 class="font-black text-lg">' + (p.id ? (ar() ? 'تعديل المنتج' : 'Edit product') : (ar() ? 'منتج جديد' : 'New product')) + '</h3><button id="dsX" class="text-gray-400 text-xl">&times;</button></div><div class="space-y-3">' +
            field(ar() ? 'العنوان' : 'Title', '<input id="spTitle" class="input-field w-full mt-1" maxlength="120" value="' + esc(p.title || '') + '">') +
            field(ar() ? 'الوصف' : 'Description', '<textarea id="spDesc" rows="3" class="input-field w-full mt-1" maxlength="2000">' + esc(p.description || '') + '</textarea>') +
            '<div class="grid grid-cols-2 gap-3">' + field(ar() ? 'التصنيف' : 'Category', '<select id="spCat" class="input-field w-full mt-1">' + CATS.map(function (c) { return '<option value="' + c[0] + '"' + (p.category === c[0] ? ' selected' : '') + '>' + (ar() ? c[1] : c[2]) + '</option>'; }).join('') + '</select>') +
            field(ar() ? 'مدة التوصيل (أيام)' : 'Delivery days', '<input id="spShip" type="number" min="1" max="60" class="input-field w-full mt-1" value="' + (p.shipDays || 3) + '">') +
            field(ar() ? 'سعر الجملة (ج.م)' : 'Wholesale price', '<input id="spWho" type="number" min="1" step="0.01" class="input-field w-full mt-1" value="' + (p.wholesalePrice || '') + '">') +
            field(ar() ? 'سعر بيع مقترح (اختياري)' : 'Suggested price (optional)', '<input id="spSug" type="number" min="0" step="0.01" class="input-field w-full mt-1" value="' + (p.suggestedPrice || '') + '">') +
            field(ar() ? 'المخزون' : 'Stock', '<input id="spStock" type="number" min="0" class="input-field w-full mt-1" value="' + (p.stock != null ? p.stock : '') + '">') + '</div>' +
            '<div><p class="text-xs font-bold text-gray-600 mb-1">' + (ar() ? 'الصور' : 'Photos') + ' <span id="dsPhotoCount" class="font-normal text-gray-400"></span></p><button type="button" id="spPick" class="w-full border-2 border-dashed border-gray-200 rounded-xl p-4 text-xs text-gray-400 hover:border-navy-400"><i class="fa-solid fa-images me-1"></i>' + (ar() ? 'اختار حتى 5 صور مرة واحدة (أول صورة = الغلاف)' : 'Choose up to 5 photos at once (first = cover)') + '</button>' +
            '<input type="file" id="spFiles" accept="image/*" multiple class="hidden"><div id="dsPhotos" class="grid grid-cols-5 gap-2 mt-2"></div></div>' +
            '<button id="spSave" class="btn-primary w-full py-2.5">' + (ar() ? 'حفظ' : 'Save') + '</button></div>');
        photoGrid();
        document.getElementById('dsX').onclick = closeModal;
        document.getElementById('spPick').onclick = function () { document.getElementById('spFiles').click(); };
        document.getElementById('spFiles').onchange = function () {
            var files = Array.prototype.filter.call(this.files || [], function (f) { return f.type && f.type.indexOf('image/') === 0; }); this.value = '';
            var room = 5 - state.photos.length;
            if (files.length > room) toast(ar() ? 'الحد الأقصى 5 صور — تمت إضافة ' + Math.max(room, 0) + ' فقط' : 'Max 5 photos', 'warning');
            files.slice(0, Math.max(room, 0)).forEach(function (f) { state.photos.push({ file: f }); }); photoGrid();
        };
        document.getElementById('spSave').onclick = async function () {
            var b = this, kept = state.photos.filter(function (x) { return x.url; }).reduce(function (n, x) { return n + x.url.length; }, 0), nNew = state.photos.filter(function (x) { return x.file; }).length;
            var per = nNew ? Math.floor((880000 - kept) / nNew) : 0;
            if (!state.photos.length) return toast(ar() ? 'ارفع صورة واحدة على الأقل' : 'Add at least one photo', 'warning');
            if (kept > 880000 || (nNew && per < 45000)) return toast(ar() ? 'حجم الصور كبير — قلل عددها' : 'Photos too large', 'warning');
            b.disabled = true; b.textContent = '...';
            try {
                var urls = [];
                for (var i = 0; i < state.photos.length; i++) { var x = state.photos[i]; urls.push(x.url ? x.url : await window.uploadFile(x.file, 'supplier', 'sp_' + Date.now() + '_' + i, { maxPx: 900, maxLen: Math.min(per, 330000) })); }
                await api('supplierSaveProduct', { id: p.id || '', title: val('spTitle'), description: val('spDesc'), category: val('spCat'), wholesalePrice: parseFloat(val('spWho')), suggestedPrice: parseFloat(val('spSug')) || 0, stock: parseInt(val('spStock'), 10), shipDays: parseInt(val('spShip'), 10), image: urls[0], images: urls });
                closeModal(); toast(ar() ? '✅ تم الحفظ' : '✅ Saved', 'success'); renderSellerTab(container);
            } catch (e) { b.disabled = false; b.textContent = ar() ? 'حفظ' : 'Save'; toast(e.message, 'error'); }
        };
        function val(id) { return (document.getElementById(id) || {}).value || ''; }
    }

    // ── supplier: orders to ship ───────────────────────────────────────────────
    async function viewOrders(body, container) {
        var snap = await window.db.collection('dropship_orders').where('supplierId', '==', uid()).get();
        var list = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).sort(function (a, b) { return ms(b.createdAt) - ms(a.createdAt); });
        body.innerHTML = list.length ? '<div class="space-y-3">' + list.map(function (o) {
            var s = o.shippingInfo || {};
            return '<div class="bg-white border ' + (o.late && o.status === 'processing' ? 'border-red-200' : 'border-gray-100') + ' rounded-2xl p-4 shadow-sm"><div class="flex justify-between gap-3 flex-wrap"><div class="min-w-0"><p class="font-black text-sm text-gray-900">' + esc(o.title || '') + '</p>' +
                '<p class="text-xs text-gray-500 mt-1">' + (ar() ? 'سعر الجملة: ' : 'Wholesale: ') + '<b>' + money(o.unitCost) + '</b> • ' + new Date(ms(o.createdAt)).toLocaleDateString(ar() ? 'ar-EG' : 'en-GB') + '</p></div>' + chip(o.status) + '</div>' +
                '<div class="bg-gray-50 rounded-xl p-3 mt-3 text-xs space-y-0.5"><p><b>' + (ar() ? 'الاسم: ' : 'Name: ') + '</b>' + esc(s.fullName || '') + '</p><p dir="ltr" class="text-start"><b>' + (ar() ? 'الهاتف: ' : 'Phone: ') + '</b>' + esc(s.phone || '') + '</p><p><b>' + (ar() ? 'العنوان: ' : 'Address: ') + '</b>' + esc(s.address || '') + '</p>' + (s.notes ? '<p><b>' + (ar() ? 'ملاحظات: ' : 'Notes: ') + '</b>' + esc(s.notes) + '</p>' : '') + '</div>' +
                (o.trackingNumber ? '<p class="text-xs text-gray-500 mt-2"><i class="fa-solid fa-truck me-1"></i>' + esc(o.carrier || '') + ' • ' + esc(o.trackingNumber) + '</p>' : '') +
                (o.late && o.status === 'processing' ? '<p class="text-xs text-red-500 font-bold mt-2">' + (ar() ? 'متأخر عن موعد الشحن' : 'Late to ship') + '</p>' : '') +
                (o.status === 'processing' ? '<button data-ship="' + esc(o.id) + '" class="mt-3 px-4 py-2 bg-navy-700 text-white rounded-xl text-xs font-bold"><i class="fa-solid fa-truck me-1"></i>' + (ar() ? 'تم الشحن' : 'Mark shipped') + '</button>' : '') +
                (o.status === 'shipped' ? '<button data-dlv="' + esc(o.id) + '" class="mt-3 px-4 py-2 bg-turquoise-600 text-white rounded-xl text-xs font-bold"><i class="fa-solid fa-house-circle-check me-1"></i>' + (ar() ? 'تم التسليم' : 'Mark delivered') + '</button>' : '') + '</div>';
        }).join('') + '</div>' : '<p class="text-center text-gray-400 py-10">' + (ar() ? 'مفيش طلبات شحن حالياً' : 'No orders to ship') + '</p>';
        body.querySelectorAll('[data-ship]').forEach(function (b) { b.onclick = function () { openShip(b.getAttribute('data-ship'), container); }; });
        body.querySelectorAll('[data-dlv]').forEach(function (b) { b.onclick = async function () { if (!confirm(ar() ? 'تأكيد إن الطلب اتسلّم للعميل؟' : 'Confirm the order was delivered?')) return; try { await api('supplierDelivered', { orderId: b.getAttribute('data-dlv') }); toast(ar() ? '✅ تم' : '✅ Done', 'success'); renderSellerTab(container); } catch (e) { toast(e.message, 'error'); } }; });
    }
    function openShip(orderId, container) {
        modal('<div class="flex justify-between mb-3"><h3 class="font-black text-lg">' + (ar() ? 'بيانات الشحن' : 'Shipping details') + '</h3><button id="dsX" class="text-gray-400 text-xl">&times;</button></div><div class="space-y-3">' +
            field(ar() ? 'شركة الشحن' : 'Carrier', '<input id="shCar" class="input-field w-full mt-1" maxlength="60">') + field(ar() ? 'رقم التتبع' : 'Tracking number', '<input id="shTrk" class="input-field w-full mt-1" dir="ltr" maxlength="80">') +
            '<button id="shGo" class="btn-primary w-full py-2.5">' + (ar() ? 'تأكيد الشحن' : 'Confirm shipment') + '</button></div>');
        document.getElementById('dsX').onclick = closeModal;
        document.getElementById('shGo').onclick = async function () {
            var b = this; b.disabled = true;
            try { await api('supplierShip', { orderId: orderId, carrier: document.getElementById('shCar').value, trackingNumber: document.getElementById('shTrk').value }); closeModal(); toast(ar() ? '✅ تم تسجيل الشحن وإخطار العميل' : '✅ Shipment recorded', 'success'); renderSellerTab(container); }
            catch (e) { b.disabled = false; toast(e.message, 'error'); }
        };
    }

    // ═════════════════════════════ ADMIN TAB ═══════════════════════════════════
    var adminView = 'suppliers';
    async function renderAdminTab(container) {
        var views = [['suppliers', 'الموردين', 'Suppliers'], ['products', 'المنتجات', 'Products'], ['orders', 'الطلبات', 'Orders'], ['settings', 'إعدادات', 'Settings']];
        container.innerHTML = '<div class="flex gap-2 overflow-x-auto pb-3 mb-4 border-b border-gray-100">' + views.map(function (v) { return '<button data-v="' + v[0] + '" class="px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap ' + (adminView === v[0] ? 'bg-navy-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200') + '">' + (ar() ? v[1] : v[2]) + '</button>'; }).join('') + '</div><div id="dsAdminBody"></div>';
        container.querySelectorAll('[data-v]').forEach(function (b) { b.onclick = function () { adminView = b.getAttribute('data-v'); renderAdminTab(container); }; });
        var body = document.getElementById('dsAdminBody'); body.innerHTML = '<div class="text-center py-8"><i class="fa-solid fa-spinner fa-spin text-navy-500 text-2xl"></i></div>';
        try {
            if (adminView === 'suppliers') {
                var s = await window.db.collection('suppliers').get(); var list = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
                body.innerHTML = list.length ? '<div class="space-y-3">' + list.map(function (u) {
                    var st = u.status; return '<div class="p-4 bg-gray-50 rounded-xl flex items-center justify-between gap-3 flex-wrap"><div><p class="font-black text-sm">' + esc(u.name || u.id) + '</p><p class="text-xs text-gray-400" dir="ltr">' + esc(u.id) + '</p></div><div class="flex gap-2 items-center"><span class="text-xs font-bold px-2.5 py-1 rounded-full ' + (st === 'active' ? 'bg-green-100 text-green-700' : st === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700') + '">' + esc(st) + '</span>' +
                        (st !== 'active' ? '<button data-set="active" data-id="' + esc(u.id) + '" class="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg font-bold">' + (ar() ? 'تفعيل' : 'Activate') + '</button>' : '') + (st !== 'suspended' ? '<button data-set="suspended" data-id="' + esc(u.id) + '" class="text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-lg font-bold">' + (ar() ? 'إيقاف' : 'Suspend') + '</button>' : '') + '</div></div>';
                }).join('') + '</div>' : '<p class="text-center text-gray-400 py-10">' + (ar() ? 'مفيش موردين' : 'No suppliers') + '</p>';
                body.querySelectorAll('[data-set]').forEach(function (b) { b.onclick = async function () { try { await api('adminSetSupplier', { uid: b.getAttribute('data-id'), status: b.getAttribute('data-set') }); toast('✅', 'success'); renderAdminTab(container); } catch (e) { toast(e.message, 'error'); } }; });
            } else if (adminView === 'products') {
                var p = await window.db.collection('supplier_products').limit(150).get(); var pl = p.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).sort(function (a, b) { return ms(b.createdAt) - ms(a.createdAt); });
                body.innerHTML = pl.length ? '<div class="space-y-3">' + pl.map(function (x) { return '<div class="p-4 bg-gray-50 rounded-xl flex items-center gap-3"><img src="' + esc(x.image) + '" class="w-12 h-12 rounded-lg object-cover" alt=""><div class="flex-1 min-w-0"><p class="font-black text-sm truncate">' + esc(x.title) + '</p><p class="text-xs text-gray-500">' + esc(x.supplierName || '') + ' • ' + money(x.wholesalePrice) + ' • ' + (ar() ? 'مخزون ' : 'stock ') + x.stock + '</p></div><button data-blk="' + esc(x.id) + '" data-b="' + (x.blocked ? '1' : '0') + '" class="text-xs px-3 py-1.5 rounded-lg font-bold ' + (x.blocked ? 'bg-green-600 text-white' : 'bg-red-50 text-red-600') + '">' + (x.blocked ? (ar() ? 'السماح' : 'Allow') : (ar() ? 'حظر' : 'Block')) + '</button></div>'; }).join('') + '</div>' : '<p class="text-center text-gray-400 py-10">—</p>';
                body.querySelectorAll('[data-blk]').forEach(function (b) { b.onclick = async function () { try { await api('adminSetProduct', { id: b.getAttribute('data-blk'), blocked: b.getAttribute('data-b') !== '1' }); renderAdminTab(container); } catch (e) { toast(e.message, 'error'); } }; });
            } else if (adminView === 'orders') {
                var o = await window.db.collection('dropship_orders').limit(150).get(); var ol = o.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).sort(function (a, b) { return ms(b.createdAt) - ms(a.createdAt); });
                body.innerHTML = ol.length ? '<div class="space-y-3">' + ol.map(function (x) { return '<div class="p-4 bg-gray-50 rounded-xl flex items-center justify-between gap-3 flex-wrap"><div><p class="font-black text-sm">' + esc(x.title || '') + '</p><p class="text-xs text-gray-500">' + (ar() ? 'جملة ' : 'cost ') + money(x.unitCost) + ' → ' + (ar() ? 'بيع ' : 'sold ') + money(x.sellingPrice) + (x.trackingNumber ? ' • ' + esc(x.carrier || '') + ' ' + esc(x.trackingNumber) : '') + '</p></div><div class="flex gap-2">' + (x.late && x.status === 'processing' ? '<span class="text-xs bg-red-100 text-red-700 font-bold px-2.5 py-1 rounded-full">' + (ar() ? 'متأخر' : 'Late') + '</span>' : '') + chip(x.status) + '</div></div>'; }).join('') + '</div>' : '<p class="text-center text-gray-400 py-10">—</p>';
            } else {
                var c = await settings();
                body.innerHTML = '<div class="max-w-lg space-y-4">' +
                    '<label class="flex items-center gap-3 p-4 bg-gray-50 rounded-xl"><input id="dsOn" type="checkbox" ' + (c.DROPSHIP_ENABLED !== false ? 'checked' : '') + '><div><p class="font-bold text-sm">' + (ar() ? 'تفعيل الدروبشيبنج' : 'Enable dropshipping') + '</p><p class="text-xs text-gray-500">' + (ar() ? 'لو اتقفل: ما ينفعش شراء أي منتج دروبشيبنج ولا استيراد جديد.' : 'When off: no dropship purchases or imports.') + '</p></div></label>' +
                    '<label class="flex items-center gap-3 p-4 bg-gray-50 rounded-xl"><input id="dsAuto" type="checkbox" ' + (c.DROPSHIP_AUTO_APPROVE_SUPPLIERS !== false ? 'checked' : '') + '><div><p class="font-bold text-sm">' + (ar() ? 'تفعيل الموردين تلقائياً' : 'Auto-approve suppliers') + '</p><p class="text-xs text-gray-500">' + (ar() ? 'لو اتقفل: كل مورد جديد بيستنى موافقتك.' : 'When off, new suppliers wait for your approval.') + '</p></div></label>' +
                    '<div class="grid grid-cols-2 gap-3">' + field(ar() ? 'أقل هامش ربح للبائع (%)' : 'Min reseller margin (%)', '<input id="dsMp" type="number" min="0" max="500" step="0.1" class="input-field w-full mt-1" value="' + c.DROPSHIP_MIN_MARGIN_PERCENT + '">') + field(ar() ? 'أقل هامش ثابت (ج.م)' : 'Min fixed margin (EGP)', '<input id="dsMf" type="number" min="0" step="0.01" class="input-field w-full mt-1" value="' + c.DROPSHIP_MIN_MARGIN_FIXED + '">') + '</div>' +
                    field(ar() ? 'عمولة المنصة تُحسب على' : 'Platform commission is calculated on', '<select id="dsBase" class="input-field w-full mt-1"><option value="margin"' + (c.DROPSHIP_FEE_BASE !== 'total' ? ' selected' : '') + '>' + (ar() ? 'هامش البائع فقط (الافتراضي)' : "Reseller's margin only (default)") + '</option><option value="total"' + (c.DROPSHIP_FEE_BASE === 'total' ? ' selected' : '') + '>' + (ar() ? 'سعر البيع كامل (بحد أقصى الهامش)' : 'Full selling price (capped at margin)') + '</option></select>') +
                    field(ar() ? 'مهلة شحن المورد (أيام) قبل التنبيه' : 'Supplier shipping deadline (days) before reminder', '<input id="dsSla" type="number" min="1" max="30" class="input-field w-full mt-1" value="' + c.DROPSHIP_SHIP_SLA_DAYS + '">') +
                    '<button id="dsSave" class="btn-primary px-6 py-2.5 text-sm">' + (ar() ? 'حفظ' : 'Save') + '</button></div>';
                document.getElementById('dsSave').onclick = async function () {
                    var data = { DROPSHIP_ENABLED: document.getElementById('dsOn').checked, DROPSHIP_AUTO_APPROVE_SUPPLIERS: document.getElementById('dsAuto').checked, DROPSHIP_MIN_MARGIN_PERCENT: Math.max(0, parseFloat(document.getElementById('dsMp').value) || 0), DROPSHIP_MIN_MARGIN_FIXED: Math.max(0, parseFloat(document.getElementById('dsMf').value) || 0), DROPSHIP_FEE_BASE: document.getElementById('dsBase').value === 'total' ? 'total' : 'margin', DROPSHIP_SHIP_SLA_DAYS: Math.min(30, Math.max(1, parseInt(document.getElementById('dsSla').value, 10) || 3)) };
                    try { await window.db.collection('settings').doc('platform').set(data, { merge: true }); toast(ar() ? '✅ تم الحفظ' : '✅ Saved', 'success'); } catch (e) { toast(e.message, 'error'); }
                };
            }
        } catch (e) { body.innerHTML = '<p class="text-red-500 text-center py-6">' + esc(e.message) + '</p>'; }
    }

    window.DropshipUI = { renderSellerTab: renderSellerTab, renderAdminTab: renderAdminTab };
})();
