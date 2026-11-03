/* ============================================================================
 * js/coupons.js — الكوبونات والخصومات
 * ----------------------------------------------------------------------------
 *  • MallCoupons.renderAdminTab(el, isAr)   → admin: global on/off switch, platform coupons (paid from the commission),
 *                                              and every merchant's coupons (pause / resume / cancel any of them)
 *  • MallCoupons.renderSellerTab(el)        → merchant: coupons with a code + automatic discounts for HIS products
 * Everything goes through /api/coupons (browsers cannot read or write the `coupons` collection any more).
 * The discount itself is applied by the server at checkout (api/payment.js) — nothing here decides a price.
 * ========================================================================== */
(function () {
    'use strict';

    const isAr = () => (window.AppState ? AppState.language !== 'en' : true);
    const esc  = (v) => (window.escapeHtml ? window.escapeHtml(v) : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])));
    const toast = (m, t) => { if (window.showToast) window.showToast(m, t || 'info'); else alert(m); };
    const busy  = (on) => { try { on ? window.showLoading && window.showLoading() : window.hideLoading && window.hideLoading(); } catch (_) {} };
    const money = (n) => (window.formatCurrency ? window.formatCurrency(n) : String(n));
    const dateFmt = (ms) => { if (!ms) return '—'; try { return new Date(ms).toLocaleDateString(isAr() ? 'ar-EG' : 'en-GB'); } catch (_) { return '—'; } };

    async function api(body) {
        const token = window.auth && window.auth.currentUser ? await window.auth.currentUser.getIdToken() : '';
        const resp = await fetch('/api/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify(body) });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.success) throw new Error(data.error || (isAr() ? 'تعذّر تنفيذ الطلب' : 'Request failed'));
        return data;
    }

    const STATE = {
        live:              { ar: 'ساري',                 en: 'Live',             cls: 'bg-green-100 text-green-700' },
        inactive:          { ar: 'موقوف',                en: 'Paused',           cls: 'bg-gray-100 text-gray-600' },
        disabled_by_admin: { ar: 'موقوف من الإدارة',     en: 'Paused by admin',  cls: 'bg-red-100 text-red-700' },
        cancelled:         { ar: 'ملغي',                 en: 'Cancelled',        cls: 'bg-gray-200 text-gray-500' },
        expired:           { ar: 'منتهي',                en: 'Expired',          cls: 'bg-amber-100 text-amber-700' },
        not_started:       { ar: 'لم يبدأ',              en: 'Not started',      cls: 'bg-blue-100 text-blue-700' },
        exhausted:         { ar: 'خلص الاستخدام',        en: 'Used up',          cls: 'bg-amber-100 text-amber-700' },
    };
    const badge = (st) => { const s = STATE[st] || STATE.live; return `<span class="px-2 py-0.5 rounded-full text-xs ${s.cls}">${isAr() ? s.ar : s.en}</span>`; };
    const valueText = (c) => c.type === 'percent' ? `${c.value}%` : money(c.value);

    // ── modal ──────────────────────────────────────────────────────────────────
    function modal(html) {
        closeModal();
        const el = document.createElement('div');
        el.id = 'couponModal';
        el.className = 'fixed inset-0 z-[9999] flex items-start sm:items-center justify-center p-3 bg-black/60 overflow-y-auto';
        el.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4 relative" dir="${isAr() ? 'rtl' : 'ltr'}">
            <button type="button" id="couponClose" class="absolute top-3 ${isAr() ? 'left-3' : 'right-3'} w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600" aria-label="close">✕</button>
            <div class="p-5 sm:p-6">${html}</div></div>`;
        document.body.appendChild(el);
        el.addEventListener('click', (e) => { if (e.target === el) closeModal(); });
        el.querySelector('#couponClose').addEventListener('click', closeModal);
        return el;
    }
    function closeModal() { document.getElementById('couponModal')?.remove(); }

    const toLocalInput = (ms) => { if (!ms) return ''; const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };

    /** create / edit form. opts: { scope:'store'|'platform', auto:boolean, coupon?:existing } → resolves after saving */
    function openForm(opts, done) {
        const ar = isAr();
        const c = opts.coupon || null;
        const auto = c ? c.auto : !!opts.auto;
        const title = c ? (ar ? 'تعديل' : 'Edit') : auto ? (ar ? 'خصم تلقائي جديد' : 'New automatic discount') : (opts.scope === 'platform' ? (ar ? 'كوبون منصة جديد' : 'New platform coupon') : (ar ? 'كوبون جديد' : 'New coupon'));
        const lab = (t) => `<span class="text-sm font-semibold text-gray-700">${t}</span>`;
        const inp = 'w-full mt-1 px-3 py-2 border rounded-xl';
        const el = modal(`
            <h3 class="text-lg font-bold text-navy-800 mb-1">${title}</h3>
            <p class="text-xs text-gray-500 mb-4">${opts.scope === 'platform'
                ? (ar ? 'خصم كوبون المنصة بيتحسب من النسبة اللي المنصة بتاخدها من المشتري: التاجر بياخد سعره كامل، والخصم مش بيعدّي النسبة دي.' : 'Platform coupons are paid from the percentage the platform takes from the buyer: the merchant keeps the full price and the discount never exceeds it.')
                : auto ? (ar ? 'خصم بيتطبّق لوحده على كل مشتريات العميل من منتجاتك من غير ما يكتب كود.' : 'Applies by itself to every purchase from your products — no code needed.')
                : (ar ? 'العميل بيكتب الكود في صفحة الدفع، والخصم بيتخصم من سعر منتجاتك.' : 'The customer types the code at checkout; the discount comes out of your price.')}</p>
            <div class="space-y-3">
                ${auto ? '' : `<label class="block">${lab(ar ? 'كود الكوبون (إنجليزي/أرقام)' : 'Code (letters/numbers)')}<input id="cpCode" dir="ltr" maxlength="24" class="${inp}" ${c ? 'disabled' : ''} value="${esc(c ? c.code : '')}"></label>`}
                <label class="block">${lab(auto ? (ar ? 'اسم الخصم (يظهر للعميل)' : 'Discount name (shown to customer)') : (ar ? 'وصف (اختياري)' : 'Label (optional)'))}<input id="cpTitle" maxlength="60" class="${inp}" value="${esc(c ? c.title : '')}"></label>
                <div class="grid grid-cols-2 gap-2">
                    <label class="block">${lab(ar ? 'نوع الخصم' : 'Type')}<select id="cpType" class="${inp}"><option value="percent" ${c && c.type === 'percent' || !c ? 'selected' : ''}>${ar ? 'نسبة %' : 'Percent %'}</option><option value="fixed" ${c && c.type === 'fixed' ? 'selected' : ''}>${ar ? 'مبلغ ثابت' : 'Fixed amount'}</option></select></label>
                    <label class="block">${lab(ar ? 'قيمة الخصم' : 'Value')}<input id="cpValue" type="number" min="1" step="any" dir="ltr" class="${inp}" value="${c ? c.value : ''}"></label>
                    <label class="block">${lab(ar ? 'أقل قيمة للطلب' : 'Minimum order')}<input id="cpMin" type="number" min="0" step="any" dir="ltr" class="${inp}" value="${c ? c.minOrder : 0}"></label>
                    <label class="block">${lab(ar ? 'عدد مرات الاستخدام (0 = بلا حد)' : 'Total uses (0 = unlimited)')}<input id="cpLimit" type="number" min="0" dir="ltr" class="${inp}" value="${c ? c.usageLimit : 0}"></label>
                    <label class="block">${lab(ar ? 'لكل عميل (0 = بلا حد)' : 'Per customer (0 = unlimited)')}<input id="cpPer" type="number" min="0" dir="ltr" class="${inp}" value="${c ? c.perUserLimit : (auto ? 0 : 1)}"></label>
                    <span></span>
                    <label class="block">${lab(ar ? 'يبدأ (اختياري)' : 'Starts (optional)')}<input id="cpStart" type="datetime-local" dir="ltr" class="${inp}" value="${toLocalInput(c && c.startsAt)}"></label>
                    <label class="block">${lab(ar ? 'ينتهي (اختياري)' : 'Ends (optional)')}<input id="cpEnd" type="datetime-local" dir="ltr" class="${inp}" value="${toLocalInput(c && c.expiresAt)}"></label>
                </div>
                <button type="button" id="cpSave" class="btn-primary w-full py-3 rounded-xl font-bold">${c ? (ar ? 'حفظ' : 'Save') : (ar ? 'إنشاء' : 'Create')}</button>
            </div>`);
        el.querySelector('#cpSave').addEventListener('click', async () => {
            const v = (id) => (el.querySelector(id) ? el.querySelector(id).value : '');
            const iso = (id) => { const x = v(id); return x ? new Date(x).toISOString() : ''; };
            const payload = {
                title: v('#cpTitle'), type: v('#cpType'), value: v('#cpValue'), minOrder: v('#cpMin'),
                usageLimit: v('#cpLimit'), perUserLimit: v('#cpPer'), startsAt: iso('#cpStart'), expiresAt: iso('#cpEnd'),
            };
            try {
                busy(true);
                if (c) await api({ action: 'update', id: c.id, ...payload });
                else await api({ action: 'create', scope: opts.scope, auto, code: v('#cpCode'), ...payload });
                busy(false); closeModal();
                toast(isAr() ? '✅ تم الحفظ' : '✅ Saved', 'success');
                done && done();
            } catch (e) { busy(false); toast(e.message, 'error'); }
        });
    }

    async function act(body, done, okMsg) {
        try { busy(true); await api(body); busy(false); if (okMsg) toast(okMsg, 'success'); done && done(); }
        catch (e) { busy(false); toast(e.message, 'error'); }
    }

    // ════════════════════════════════════════════════════════════════════════════
    //  ADMIN
    // ════════════════════════════════════════════════════════════════════════════
    async function renderAdminTab(container, ar) {
        container.innerHTML = `<div class="text-center py-8"><i class="fa-solid fa-spinner fa-spin text-navy-500 text-2xl"></i></div>`;
        let data;
        try { data = await api({ action: 'list' }); }
        catch (e) { container.innerHTML = `<div class="p-4 rounded-xl bg-red-50 text-red-700 text-sm">${esc(e.message)}</div>`; return; }
        const items = data.items || [];
        const reload = () => renderAdminTab(container, ar);
        window._mcCoupons = items;

        container.innerHTML = `
            <div class="flex flex-wrap items-center justify-between gap-3 p-4 mb-4 rounded-2xl border ${data.enabled ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}">
                <div><div class="font-black text-gray-900">${ar ? 'مفتاح الكوبونات والخصومات (عام)' : 'Coupons & discounts master switch'}</div>
                    <div class="text-xs text-gray-600 mt-0.5">${data.enabled
                        ? (ar ? 'شغّال: كوبونات المنصة وكوبونات وخصومات التجار بتتطبّق في الدفع.' : 'ON: platform and merchant coupons are applied at checkout.')
                        : (ar ? 'متوقف: مفيش أي خصم بيتطبّق على أي طلب (حتى لو الكوبونات موجودة).' : 'OFF: no discount of any kind is applied.')}</div></div>
                <button type="button" id="mcMaster" class="px-4 py-2 rounded-xl font-bold text-white ${data.enabled ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}">${data.enabled ? (ar ? 'إيقاف الكل' : 'Turn off') : (ar ? 'تشغيل' : 'Turn on')}</button>
            </div>
            <div class="flex items-center justify-between mb-3">
                <h3 class="font-black text-gray-900">${ar ? `الكوبونات (${items.length})` : `Coupons (${items.length})`}</h3>
                <button type="button" id="mcNew" class="btn-primary text-sm px-4 py-2"><i class="fa-solid fa-plus me-1"></i>${ar ? 'كوبون منصة' : 'Platform coupon'}</button>
            </div>
            ${items.length ? `<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-gray-500 text-xs border-b">
                <th class="p-2 text-start">${ar ? 'الكوبون' : 'Coupon'}</th><th class="p-2 text-start">${ar ? 'النوع' : 'Kind'}</th><th class="p-2 text-start">${ar ? 'الخصم' : 'Discount'}</th>
                <th class="p-2 text-start">${ar ? 'الاستخدام' : 'Used'}</th><th class="p-2 text-start">${ar ? 'الصلاحية' : 'Valid'}</th><th class="p-2 text-start">${ar ? 'الحالة' : 'State'}</th><th class="p-2"></th></tr></thead><tbody>
                ${items.map((c, i) => `<tr class="border-b hover:bg-gray-50">
                    <td class="p-2 font-semibold" dir="ltr">${c.auto ? esc(c.title || 'AUTO') : esc(c.code)}${c.auto ? '' : (c.title ? `<div class="text-xs text-gray-400">${esc(c.title)}</div>` : '')}</td>
                    <td class="p-2 text-xs">${c.scope === 'platform' ? `<span class="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">${ar ? 'منصة (من العمولة)' : 'Platform'}</span>` : `<span class="px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">${ar ? 'تاجر' : 'Merchant'}: ${esc(c.sellerName)}${c.auto ? (ar ? ' • تلقائي' : ' • auto') : ''}</span>`}</td>
                    <td class="p-2">${esc(valueText(c))}${c.minOrder ? `<div class="text-xs text-gray-400">${ar ? 'من' : 'min'} ${esc(money(c.minOrder))}</div>` : ''}</td>
                    <td class="p-2 text-xs">${c.usageCount}${c.usageLimit ? ' / ' + c.usageLimit : ''}${c.discountTotal ? `<div class="text-gray-400">${esc(money(c.discountTotal))}</div>` : ''}</td>
                    <td class="p-2 text-xs">${esc(dateFmt(c.startsAt))} → ${esc(dateFmt(c.expiresAt))}</td>
                    <td class="p-2">${badge(c.state)}${c.disabledReason ? `<div class="text-xs text-red-500 mt-0.5">${esc(c.disabledReason)}</div>` : ''}</td>
                    <td class="p-2 whitespace-nowrap">${c.cancelled ? '' : `
                        ${c.scope === 'platform' ? `<button type="button" data-mc="edit" data-i="${i}" class="px-2 py-1 rounded-lg bg-gray-100 text-xs">${ar ? 'تعديل' : 'Edit'}</button>` : ''}
                        ${c.disabledByAdmin ? `<button type="button" data-mc="enable" data-i="${i}" class="px-2 py-1 rounded-lg bg-green-100 text-green-700 text-xs">${ar ? 'رفع الإيقاف' : 'Resume'}</button>`
                            : `<button type="button" data-mc="disable" data-i="${i}" class="px-2 py-1 rounded-lg bg-amber-100 text-amber-700 text-xs">${ar ? 'إيقاف' : 'Pause'}</button>`}
                        <button type="button" data-mc="cancel" data-i="${i}" class="px-2 py-1 rounded-lg bg-red-100 text-red-700 text-xs">${ar ? 'إلغاء' : 'Cancel'}</button>`}</td></tr>`).join('')}
                </tbody></table></div>` : `<p class="text-gray-400 text-center py-8">${ar ? 'مفيش كوبونات' : 'No coupons yet'}</p>`}`;

        container.querySelector('#mcMaster').addEventListener('click', () => {
            const to = !data.enabled;
            if (!confirm(to ? (ar ? 'تشغيل الكوبونات والخصومات؟' : 'Turn coupons on?') : (ar ? 'إيقاف كل الكوبونات والخصومات على المنصة؟' : 'Turn ALL coupons and discounts off?'))) return;
            act({ action: 'adminSetEnabled', enabled: to }, reload, to ? (ar ? '✅ تم التشغيل' : '✅ Enabled') : (ar ? 'تم الإيقاف' : 'Disabled'));
        });
        container.querySelector('#mcNew').addEventListener('click', () => openForm({ scope: 'platform' }, reload));
        container.querySelectorAll('[data-mc]').forEach((b) => b.addEventListener('click', () => {
            const c = items[Number(b.getAttribute('data-i'))]; const what = b.getAttribute('data-mc');
            if (what === 'edit') return openForm({ scope: 'platform', coupon: c }, reload);
            if (what === 'enable') return act({ action: 'adminEnable', id: c.id }, reload, ar ? '✅ تم رفع الإيقاف' : '✅ Resumed');
            if (what === 'disable') {
                const reason = prompt(ar ? 'سبب الإيقاف (هيوصل للتاجر):' : 'Reason (sent to the merchant):', '');
                if (reason === null) return;
                return act({ action: 'adminDisable', id: c.id, reason }, reload, ar ? 'تم الإيقاف' : 'Paused');
            }
            if (what === 'cancel' && confirm(ar ? 'إلغاء الكوبون نهائيًا؟ مينفعش يتعاد تفعيله.' : 'Cancel permanently? It cannot be re-enabled.')) return act({ action: 'cancel', id: c.id }, reload, ar ? 'تم الإلغاء' : 'Cancelled');
        }));
    }

    // ════════════════════════════════════════════════════════════════════════════
    //  MERCHANT
    // ════════════════════════════════════════════════════════════════════════════
    async function renderSellerTab(container) {
        const ar = isAr();
        container.innerHTML = `<div class="text-center py-8"><i class="fa-solid fa-spinner fa-spin text-navy-500 text-2xl"></i></div>`;
        let data;
        try { data = await api({ action: 'list' }); }
        catch (e) { container.innerHTML = `<div class="p-4 rounded-xl bg-red-50 text-red-700 text-sm">${esc(e.message)}</div>`; return; }
        const items = data.items || [];
        const reload = () => renderSellerTab(container);

        container.innerHTML = `
            <div class="flex flex-wrap items-center justify-between gap-3 p-4 mb-4 rounded-2xl border ${data.storeEnabled ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}">
                <div><div class="font-black text-gray-900">${ar ? 'كوبونات وخصومات متجري' : 'My store coupons & discounts'}: ${data.storeEnabled ? (ar ? 'مفعّلة' : 'ON') : (ar ? 'متوقفة' : 'OFF')}</div>
                    <div class="text-xs text-gray-600 mt-0.5">${data.storeEnabled
                        ? (ar ? 'كوبوناتك وخصوماتك التلقائية بتتطبّق على مشتريات عملائك دلوقتي.' : 'Your coupons and automatic discounts are applied to your customers now.')
                        : (ar ? 'متوقفة افتراضيًا: تقدر تجهّز كوبوناتك، لكن مفيش خصم هيتطبّق على عملائك لحد ما تفعّلها.' : 'Off by default: you can prepare coupons, but nothing is applied to your customers until you turn this on.')}</div></div>
                <button type="button" id="cpMaster" class="px-4 py-2 rounded-xl font-bold text-white ${data.storeEnabled ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}">${data.storeEnabled ? (ar ? 'إيقاف' : 'Turn off') : (ar ? 'تفعيل' : 'Turn on')}</button>
            </div>
            ${data.enabled ? '' : `<div class="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">⛔ ${ar ? 'الإدارة أوقفت الكوبونات والخصومات مؤقتًا — مفيش خصم هيتطبّق لحد ما يتشغّل تاني.' : 'Coupons and discounts are temporarily switched off by the admin.'}</div>`}
            <div class="p-3 mb-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs">💡 ${ar
                ? 'الخصم بيتخصم من سعر منتجاتك (إنت اللي بتتحمّله). الكوبون بيشتغل على منتجاتك إنت بس. الإدارة ممكن توقف أو تلغي أي كوبون عند اللزوم.'
                : 'The discount comes out of your price and only applies to your own products. The admin may pause or cancel any coupon if needed.'}</div>
            <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 class="font-black text-gray-900">${ar ? `كوبوناتي وخصوماتي (${items.length})` : `My coupons & discounts (${items.length})`}</h3>
                <div class="flex gap-2">
                    <button type="button" id="cpNewCode" class="btn-primary text-sm px-4 py-2"><i class="fa-solid fa-ticket me-1"></i>${ar ? 'كوبون بكود' : 'Coupon code'}</button>
                    <button type="button" id="cpNewAuto" class="btn-secondary text-sm px-4 py-2"><i class="fa-solid fa-wand-magic-sparkles me-1"></i>${ar ? 'خصم تلقائي' : 'Auto discount'}</button>
                </div>
            </div>
            ${items.length ? `<div class="space-y-2">${items.map((c, i) => `
                <div class="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-gray-100 bg-white">
                    <div class="min-w-0">
                        <div class="font-bold text-gray-900" dir="ltr" style="text-align:start">${c.auto ? esc(c.title) + ` <span class="text-xs text-sky-600">(${ar ? 'تلقائي' : 'auto'})</span>` : esc(c.code)} ${badge(c.state)}</div>
                        <div class="text-xs text-gray-500 mt-0.5">${esc(valueText(c))}${c.minOrder ? ` • ${ar ? 'من' : 'min'} ${esc(money(c.minOrder))}` : ''} • ${ar ? 'استُخدم' : 'used'} ${c.usageCount}${c.usageLimit ? '/' + c.usageLimit : ''}${c.discountTotal ? ` • ${ar ? 'إجمالي الخصم' : 'total'} ${esc(money(c.discountTotal))}` : ''} • ${esc(dateFmt(c.startsAt))} → ${esc(dateFmt(c.expiresAt))}</div>
                        ${c.disabledByAdmin ? `<div class="text-xs text-red-600 mt-1">⛔ ${ar ? 'موقوف من الإدارة' : 'Paused by admin'}${c.disabledReason ? ': ' + esc(c.disabledReason) : ''}</div>` : ''}
                    </div>
                    ${c.cancelled ? '' : `<div class="flex gap-1.5 whitespace-nowrap">
                        <button type="button" data-cp="edit" data-i="${i}" class="px-3 py-1.5 rounded-lg bg-gray-100 text-xs">${ar ? 'تعديل' : 'Edit'}</button>
                        ${c.disabledByAdmin ? '' : `<button type="button" data-cp="toggle" data-i="${i}" class="px-3 py-1.5 rounded-lg ${c.active ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'} text-xs">${c.active ? (ar ? 'إيقاف' : 'Pause') : (ar ? 'تشغيل' : 'Resume')}</button>`}
                        <button type="button" data-cp="cancel" data-i="${i}" class="px-3 py-1.5 rounded-lg bg-red-100 text-red-700 text-xs">${ar ? 'إلغاء' : 'Cancel'}</button></div>`}
                </div>`).join('')}</div>` : `<p class="text-gray-400 text-center py-8">${ar ? 'لسه ماعملتش كوبونات. ابدأ بكوبون بكود أو خصم تلقائي.' : 'No coupons yet.'}</p>`}`;

        container.querySelector('#cpMaster').addEventListener('click', () => {
            const to = !data.storeEnabled;
            if (!confirm(to ? (ar ? 'تفعيل كوبونات وخصومات متجرك؟ هتتطبّق على عملائك فورًا.' : 'Turn your coupons on? They apply to customers immediately.') : (ar ? 'إيقاف كل كوبونات وخصومات متجرك؟' : 'Turn all your coupons off?'))) return;
            act({ action: 'setStoreEnabled', enabled: to }, reload, to ? (ar ? '✅ اتفعّلت' : '✅ Enabled') : (ar ? 'اتوقفت' : 'Disabled'));
        });
        container.querySelector('#cpNewCode').addEventListener('click', () => openForm({ scope: 'store', auto: false }, reload));
        container.querySelector('#cpNewAuto').addEventListener('click', () => openForm({ scope: 'store', auto: true }, reload));
        container.querySelectorAll('[data-cp]').forEach((b) => b.addEventListener('click', () => {
            const c = items[Number(b.getAttribute('data-i'))]; const what = b.getAttribute('data-cp');
            if (what === 'edit') return openForm({ scope: 'store', coupon: c }, reload);
            if (what === 'toggle') return act({ action: 'toggle', id: c.id, active: !c.active }, reload, ar ? '✅ تم' : '✅ Done');
            if (what === 'cancel' && confirm(ar ? 'إلغاء نهائي؟ مينفعش يتعاد تفعيله.' : 'Cancel permanently?')) return act({ action: 'cancel', id: c.id }, reload, ar ? 'تم الإلغاء' : 'Cancelled');
        }));
    }

    window.MallCoupons = { renderAdminTab, renderSellerTab };
})();
