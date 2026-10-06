/**
 * ============================================================================
 * NON-RECEIPT.JS — «عدم استلام» + the strict dispute rules (client side)
 * ----------------------------------------------------------------------------
 * Buyer  : a physical product was delivered (or the shipment is clearly late)
 *          and the buyer says "I didn't receive it / I don't want it" →
 *          structured report + photo proof → dispute opens, money stays frozen.
 * Seller : answers once (text + photos) and MUST give carrier + tracking number
 *          when shipping (the delivered state is refused without them).
 * Admin  : rules between them (refund / refund minus shipping / pay seller).
 * All writes go through /api/disputes — see functions/api/disputes.js.
 * ============================================================================
 */
(function () {
    'use strict';

    const REASONS = [
        { code: 'not_arrived',      ar: 'المنتج لم يصلني',                    en: "I didn't receive the product",         fault: 'seller',  photo: false },
        { code: 'damaged',          ar: 'المنتج وصل تالف أو مكسور',            en: 'Arrived damaged / broken',             fault: 'seller',  photo: true  },
        { code: 'wrong_item',       ar: 'استلمت منتج مختلف عن المطلوب',        en: 'Received a different item',            fault: 'seller',  photo: true  },
        { code: 'not_as_described', ar: 'المنتج غير مطابق للوصف',              en: 'Not as described',                     fault: 'seller',  photo: true  },
        { code: 'changed_mind',     ar: 'وصلني ومعجبنيش (المنتج مطابق للوصف)', en: "It arrived but I don't want it",       fault: 'buyer',   photo: true  },
        { code: 'other',            ar: 'سبب آخر',                             en: 'Other',                                fault: 'unclear', photo: true  },
    ];
    const isAr = () => AppState.language !== 'en';
    const esc = (v) => (window.escapeHtml ? window.escapeHtml(v) : String(v == null ? '' : v));
    const reasonLabel = (code) => { const r = REASONS.find(x => x.code === code); return r ? (isAr() ? r.ar : r.en) : (code || '—'); };
    const toMs = (ts) => { if (!ts) return 0; if (ts.toDate) return ts.toDate().getTime(); if (ts.seconds) return ts.seconds * 1000; const t = new Date(ts).getTime(); return isNaN(t) ? 0 : t; };

    async function api(body) {
        const token = window.auth && window.auth.currentUser ? await window.auth.currentUser.getIdToken() : '';
        const resp = await fetch('/api/disputes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify(body),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.success) throw new Error(data.error || (isAr() ? 'تعذّر تنفيذ الطلب' : 'Request failed'));
        return data;
    }

    function isPhysical(o) { return !!(o && o.listingType === 'product' && o.shippingInfo); }

    // Same eligibility the server enforces (the server is the real gate — this only decides whether to show the button).
    function eligibility(order) {
        if (PLATFORM.NONRECEIPT_ENABLED === false) return { ok: false, msg: isAr() ? 'الميزة متوقفة حاليًا' : 'Disabled' };
        if (!isPhysical(order)) return { ok: false, msg: isAr() ? 'للمنتجات المشحونة فعليًا فقط' : 'Physical products only' };
        if (order.status === ORDER_STATUS.DELIVERED) {
            const win = Number(PLATFORM.RETURN_WINDOW_DAYS) || 0;
            const anchor = toMs(order.deliveredAt) || toMs(order.updatedAt) || toMs(order.createdAt);
            if (win > 0 && anchor && (Date.now() - anchor) > win * 86400000) return { ok: false, msg: isAr() ? `انتهت مدة البلاغ (${win} يوم)` : `Report window (${win} days) has passed` };
            return { ok: true };
        }
        const lateDays = Number(PLATFORM.SHIPPED_LATE_DAYS) || 7;
        if (order.shippingStatus === 'shipped' && toMs(order.shippedAt) && (Date.now() - toMs(order.shippedAt)) > lateDays * 86400000) return { ok: true, late: true };
        return { ok: false, msg: isAr() ? `متاح بعد تسجيل التسليم، أو لو الشحنة اتأخرت أكتر من ${lateDays} أيام` : `Available after delivery, or if shipment is over ${lateDays} days late` };
    }

    // ── Generic modal ───────────────────────────────────────────────────────
    function modal(inner) {
        const ov = document.createElement('div');
        ov.className = 'fixed inset-0 bg-black/70 z-[99999] flex items-center justify-center p-4';
        ov.innerHTML = `<div class="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 max-h-[92vh] overflow-y-auto">${inner}</div>`;
        document.body.appendChild(ov);
        return ov;
    }

    // Photo picker → compressed data URLs kept in `bag.files`
    function wirePhotos(ov, bag, max, maxLen) {
        const input = ov.querySelector('#nrPhotos'), prev = ov.querySelector('#nrPrev');
        const redraw = () => {
            prev.innerHTML = bag.files.map((f, i) => `<div class="relative"><img src="${f}" class="w-20 h-20 object-cover rounded-xl border border-gray-200">
              <button type="button" data-i="${i}" class="absolute -top-1.5 -end-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs">×</button></div>`).join('');
            prev.querySelectorAll('button').forEach(b => b.onclick = () => { bag.files.splice(+b.dataset.i, 1); redraw(); });
        };
        input.onchange = async () => {
            const list = Array.from(input.files || []);
            input.value = '';
            for (const f of list) {
                if (bag.files.length >= max) { showToast(isAr() ? `الحد الأقصى ${max} صور` : `Max ${max} photos`, 'warning'); break; }
                try { bag.files.push(await uploadFile(f, 'disputes', 'ev_' + Date.now(), { maxPx: 800, maxLen })); }
                catch (e) { showToast(e.message, 'error'); }
            }
            redraw();
        };
    }

    const NonReceipt = {
        REASONS, reasonLabel, isPhysical, eligibility,

        /** The «عدم استلام» button (buyer, physical product only). */
        buttonHtml(order, cls) {
            if (!order || order.buyerId !== AppState.currentUser?.uid || !isPhysical(order)) return '';
            const el = eligibility(order);
            if (!el.ok) return '';
            return `<button onclick="NonReceipt.open('${order.id}')" class="${cls || 'w-full py-3 text-sm font-bold border-2 border-red-400 text-red-600 rounded-2xl hover:bg-red-600 hover:text-white transition flex items-center justify-center gap-2'}">
              <i class="fa-solid fa-box-circle-xmark"></i>${isAr() ? 'عدم استلام' : 'Not received / reject'}</button>`;
        },

        // ── BUYER ───────────────────────────────────────────────────────────
        async open(orderId) {
            const user = AppState.currentUser;
            if (!user) { showToast(t('general.login_req'), 'warning'); return; }
            let order;
            try {
                const snap = await window.db.collection(COLLECTIONS.ORDERS).doc(orderId).get();
                if (!snap.exists) { showToast(isAr() ? 'الطلب غير موجود' : 'Order not found', 'error'); return; }
                order = { id: snap.id, ...snap.data() };
            } catch (_) { showToast(isAr() ? 'تعذّر تحميل الطلب' : 'Could not load the order', 'error'); return; }
            if (order.buyerId !== user.uid) return;
            const el = eligibility(order);
            if (!el.ok) { showToast(el.msg, 'warning'); return; }

            const fee = Number(PLATFORM.RETURN_SHIPPING_FEE) || 0;
            const hours = Number(PLATFORM.SELLER_RESPONSE_HOURS) || 48;
            const bag = { files: [] };
            const list = REASONS.filter(r => el.late ? r.code === 'not_arrived' || r.code === 'other' : true);
            const ov = modal(`
              <h3 class="text-xl font-black text-gray-900 mb-1 flex items-center gap-2"><i class="fa-solid fa-box-circle-xmark text-red-500"></i>${isAr() ? 'عدم استلام المنتج' : 'Report: product not accepted'}</h3>
              <p class="text-xs text-gray-500 mb-4 leading-relaxed">${isAr()
                ? `هيتفتح نزاع وفلوسك هتفضل متجمّدة في الضمان. البائع عنده ${hours} ساعة يرد ويثبت الشحن، وبعدها الإدارة تحكم بينكم.`
                : `A dispute opens and your money stays frozen. The seller has ${hours}h to reply and prove shipping, then the admin rules.`}</p>
              <p class="text-sm font-bold text-gray-700 mb-2">${isAr() ? 'ليه مش مستلم؟' : 'Why?'}</p>
              <div class="space-y-2 mb-4" id="nrReasons">${list.map((r, i) => `
                <label class="flex items-start gap-2 p-3 border-2 border-gray-100 rounded-xl cursor-pointer hover:border-navy-300 has-[:checked]:border-navy-600 has-[:checked]:bg-navy-50">
                  <input type="radio" name="nrReason" value="${r.code}" ${i === 0 ? 'checked' : ''} class="mt-1">
                  <span class="text-sm text-gray-800">${isAr() ? r.ar : r.en}</span></label>`).join('')}</div>
              <label class="text-sm font-bold text-gray-700 mb-1 block">${isAr() ? 'اشرح اللي حصل بالتفصيل' : 'Describe what happened'} <span id="nrCount" class="text-xs text-gray-400 font-normal"></span></label>
              <textarea id="nrDesc" rows="4" class="form-input w-full mb-3" placeholder="${isAr() ? '٣٠ حرف على الأقل — متى وصل؟ إيه المشكلة بالظبط؟' : 'At least 30 characters'}"></textarea>
              <div id="nrPhotoBox" class="mb-3">
                <label class="text-sm font-bold text-gray-700 mb-1 block">${isAr() ? 'صور إثبات' : 'Photo proof'} <span id="nrPhotoReq" class="text-red-500 text-xs"></span></label>
                <input type="file" id="nrPhotos" accept="image/*" multiple class="text-xs mb-2">
                <div id="nrPrev" class="flex gap-2 flex-wrap"></div>
              </div>
              <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-xs text-amber-900 leading-relaxed space-y-1">
                <p class="font-black">${isAr() ? 'قواعد البلاغ (لازم توافق عليها):' : 'Report rules (you must accept):'}</p>
                <p>• ${isAr() ? 'بلاغ واحد فقط لكل طلب، ومينفعش يتفتح تاني.' : 'One report per order — it cannot be reopened.'}</p>
                <p>• ${isAr() ? 'لو الخطأ عليك (غيّرت رأيك أو المنتج سليم ومطابق) هيتخصم مصاريف الشحن' : 'If you are at fault (changed mind / product is fine) shipping is deducted'}${fee > 0 ? ` (${formatCurrency(fee)})` : ''} ${isAr() ? 'من المبلغ المسترد.' : 'from the refund.'}</p>
                <p>• ${isAr() ? 'تكرار بلاغات الخطأ فيها عليك بيوقف خاصية البلاغات على حسابك.' : 'Repeated at-fault reports disable reporting on your account.'}</p>
              </div>
              <label class="flex items-start gap-2 mb-4 text-sm"><input type="checkbox" id="nrAccept" class="mt-1"><span>${isAr() ? 'قرأت القواعد وبوافق عليها' : 'I read and accept the rules'}</span></label>
              <div class="flex gap-3">
                <button id="nrCancel" class="btn-secondary flex-1 py-3">${t('general.cancel')}</button>
                <button id="nrSend" class="btn-primary flex-1 py-3 bg-red-600">${isAr() ? 'إرسال البلاغ' : 'Submit report'}</button>
              </div>`);
            wirePhotos(ov, bag, 3, 150000);
            const sel = () => ov.querySelector('input[name=nrReason]:checked')?.value;
            const syncReq = () => { const r = REASONS.find(x => x.code === sel()); ov.querySelector('#nrPhotoReq').textContent = r && r.photo ? (isAr() ? '(إجباري)' : '(required)') : (isAr() ? '(اختياري)' : '(optional)'); };
            ov.querySelectorAll('input[name=nrReason]').forEach(r => r.onchange = syncReq); syncReq();
            const desc = ov.querySelector('#nrDesc');
            desc.oninput = () => { ov.querySelector('#nrCount').textContent = `(${desc.value.trim().length})`; };
            ov.querySelector('#nrCancel').onclick = () => ov.remove();
            ov.querySelector('#nrSend').onclick = async () => {
                const code = sel(), r = REASONS.find(x => x.code === code);
                const text = desc.value.trim();
                if (text.length < (code === 'other' ? 50 : 30)) { showToast(isAr() ? `اشرح المشكلة بالتفصيل (${code === 'other' ? 50 : 30} حرف على الأقل)` : 'Please describe the problem in more detail', 'warning'); return; }
                if (r.photo && !bag.files.length) { showToast(isAr() ? 'لازم ترفع صورة إثبات واحدة على الأقل' : 'Upload at least one proof photo', 'warning'); return; }
                if (!ov.querySelector('#nrAccept').checked) { showToast(isAr() ? 'لازم توافق على القواعد' : 'You must accept the rules', 'warning'); return; }
                const leak = window.scanFieldsForContactLeak && window.scanFieldsForContactLeak([text]);
                if (leak) { showToast(window.contactLeakWarning(isAr()), 'error'); return; }
                ov.remove();
                showLoading(isAr() ? 'جاري إرسال البلاغ...' : 'Submitting...');
                try {
                    const out = await api({ action: 'reportNonReceipt', orderId, reasonCode: code, description: text, evidence: bag.files, acceptRules: true });
                    hideLoading();
                    showToast(isAr() ? '✅ تم فتح النزاع — الأموال مجمّدة والإدارة هتراجع' : '✅ Dispute opened — funds frozen', 'success');
                    setTimeout(() => {
                        if (typeof openWorkspace === 'function' && AppState.currentPage === 'workspace') openWorkspace(orderId);
                        else if (window.OrdersManager && OrdersManager.loadOrders) OrdersManager.loadOrders();
                    }, 400);
                    return out;
                } catch (e) { hideLoading(); showToast(e.message, 'error'); }
            };
        },

        // ── SELLER: reply once ───────────────────────────────────────────────
        async respond(orderId) {
            let dispute;
            try {
                const snap = await window.db.collection(COLLECTIONS.DISPUTES).where('orderId', '==', orderId).get();
                const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                dispute = rows.find(d => d.status === 'open') || null;
            } catch (e) { showToast(e.message, 'error'); return; }
            if (!dispute) { showToast(isAr() ? 'مفيش نزاع مفتوح على الطلب ده' : 'No open dispute', 'warning'); return; }
            if (dispute.sellerResponse) { showToast(isAr() ? 'رديت قبل كده' : 'You already replied', 'info'); return; }
            const bag = { files: [] };
            const ov = modal(`
              <h3 class="text-xl font-black text-gray-900 mb-1">${isAr() ? 'رد البائع على النزاع' : 'Seller reply'}</h3>
              <p class="text-xs text-gray-500 mb-3">${isAr() ? 'الرد بيتسجل مرة واحدة فقط. اذكر رقم التتبع وإثبات التسليم وأي صور مفيدة.' : 'One reply only. Include tracking and proof of delivery.'}</p>
              <div class="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-sm text-gray-800"><b>${reasonLabel(dispute.reasonCode)}</b><br>${esc(dispute.description || dispute.reason || '')}</div>
              <textarea id="nrReply" rows="4" class="form-input w-full mb-3" placeholder="${isAr() ? '٢٠ حرف على الأقل' : 'At least 20 characters'}"></textarea>
              <input type="file" id="nrPhotos" accept="image/*" multiple class="text-xs mb-2"><div id="nrPrev" class="flex gap-2 flex-wrap mb-4"></div>
              <div class="flex gap-3"><button id="nrCancel" class="btn-secondary flex-1 py-3">${t('general.cancel')}</button>
              <button id="nrSend" class="btn-primary flex-1 py-3">${isAr() ? 'إرسال الرد' : 'Send reply'}</button></div>`);
            wirePhotos(ov, bag, 2, 120000);
            ov.querySelector('#nrCancel').onclick = () => ov.remove();
            ov.querySelector('#nrSend').onclick = async () => {
                const text = ov.querySelector('#nrReply').value.trim();
                if (text.length < 20) { showToast(isAr() ? 'اكتب رد واضح (٢٠ حرف على الأقل)' : 'Write a clearer reply', 'warning'); return; }
                ov.remove(); showLoading();
                try {
                    await api({ action: 'respondDispute', disputeId: dispute.id, text, evidence: bag.files });
                    hideLoading(); showToast(isAr() ? '✅ تم تسجيل ردك' : '✅ Reply recorded', 'success');
                    if (typeof openWorkspace === 'function') openWorkspace(orderId);
                } catch (e) { hideLoading(); showToast(e.message, 'error'); }
            };
        },

        // ── SELLER: ship with mandatory carrier + tracking ───────────────────
        ship(orderId, orderOverride) {
            return new Promise((resolve) => {
                const ov = modal(`
                  <h3 class="text-xl font-black text-gray-900 mb-1"><i class="fa-solid fa-truck text-navy-700 me-2"></i>${isAr() ? 'تسجيل الشحن' : 'Record shipment'}</h3>
                  <p class="text-xs text-gray-500 mb-4">${isAr() ? 'شركة الشحن ورقم التتبع إجباريين — من غيرهم مينفعش تسجّل التسليم، وده بيحميك في أي نزاع.' : 'Carrier and tracking number are mandatory — you cannot mark delivered without them.'}</p>
                  <label class="text-sm font-bold text-gray-700 block mb-1">${isAr() ? 'شركة الشحن' : 'Carrier'}</label>
                  <input id="shCarrier" class="form-input w-full mb-3" maxlength="60">
                  <label class="text-sm font-bold text-gray-700 block mb-1">${isAr() ? 'رقم التتبع' : 'Tracking number'}</label>
                  <input id="shTrack" class="form-input w-full mb-5" dir="ltr" maxlength="80">
                  <div class="flex gap-3"><button id="shCancel" class="btn-secondary flex-1 py-3">${t('general.cancel')}</button>
                  <button id="shGo" class="btn-primary flex-1 py-3">${isAr() ? 'تأكيد الشحن' : 'Confirm'}</button></div>`);
                ov.querySelector('#shCancel').onclick = () => { ov.remove(); resolve(false); };
                ov.querySelector('#shGo').onclick = async () => {
                    const carrier = ov.querySelector('#shCarrier').value.trim(), trackingNumber = ov.querySelector('#shTrack').value.trim();
                    if (carrier.length < 2 || trackingNumber.length < 4) { showToast(isAr() ? 'اكتب شركة الشحن ورقم التتبع' : 'Carrier and tracking required', 'warning'); return; }
                    ov.remove(); showLoading();
                    try {
                        await api({ action: 'markShipped', orderId, carrier, trackingNumber });
                        hideLoading(); showToast(isAr() ? '✅ تم تسجيل الشحن وإخطار العميل' : '✅ Shipment recorded', 'success');
                        if (!orderOverride && typeof openWorkspace === 'function') openWorkspace(orderId);
                        if (orderOverride) { orderOverride.shippingStatus = 'shipped'; orderOverride.carrier = carrier; orderOverride.trackingNumber = trackingNumber; }
                        resolve(true);
                    } catch (e) { hideLoading(); showToast(e.message, 'error'); resolve(false); }
                };
            });
        },

        // ── Card shown in the workspace while an order is disputed ───────────
        async renderDisputeCard(order) {
            const slot = document.getElementById('disputeInfoSlot');
            if (!slot || !order || order.status !== ORDER_STATUS.DISPUTED) return;
            const uid = AppState.currentUser?.uid;
            const isSeller = order.sellerId === uid, isBuyer = order.buyerId === uid;
            if (!isSeller && !isBuyer) return;
            try {
                const snap = await window.db.collection(COLLECTIONS.DISPUTES).where('orderId', '==', order.id).get();
                const d = snap.docs.map(x => ({ id: x.id, ...x.data() })).find(x => x.status === 'open');
                if (!d) { slot.innerHTML = ''; return; }
                const deadline = toMs(d.sellerDeadline), late = deadline && Date.now() > deadline;
                const imgs = (list) => (list || []).map(u => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" class="w-16 h-16 object-cover rounded-lg border"></a>`).join('');
                slot.innerHTML = `
                <div class="bg-red-50 border border-red-200 rounded-2xl p-5">
                  <h3 class="font-black text-gray-900 mb-2 flex items-center gap-2"><i class="fa-solid fa-gavel text-red-600"></i>${isAr() ? 'نزاع قيد المراجعة' : 'Dispute under review'}</h3>
                  <p class="text-sm text-gray-800"><b>${reasonLabel(d.reasonCode)}</b></p>
                  <p class="text-sm text-gray-600 mt-1">${esc(d.description || d.reason || '')}</p>
                  ${d.evidence && d.evidence.length ? `<div class="flex gap-2 flex-wrap mt-2">${imgs(d.evidence)}</div>` : ''}
                  ${d.sellerResponse
                    ? `<div class="mt-3 p-3 bg-white rounded-xl border border-gray-200"><p class="text-xs font-bold text-gray-500 mb-1">${isAr() ? 'رد البائع' : 'Seller reply'}${d.sellerResponse.late ? (isAr() ? ' (متأخر)' : ' (late)') : ''}</p><p class="text-sm text-gray-800">${esc(d.sellerResponse.text)}</p>${d.sellerResponse.evidence && d.sellerResponse.evidence.length ? `<div class="flex gap-2 flex-wrap mt-2">${imgs(d.sellerResponse.evidence)}</div>` : ''}</div>`
                    : `<p class="text-xs mt-3 ${late ? 'text-red-700 font-bold' : 'text-amber-800'}">${isSeller ? (late ? (isAr() ? '⏰ انتهت مهلة ردك — الإدارة هتحكم بالمتاح' : 'Your reply window ended') : (isAr() ? '⏳ لازم ترد قبل: ' : 'Reply before: ') + new Date(deadline).toLocaleString(isAr() ? 'ar-EG' : 'en-GB')) : (isAr() ? 'في انتظار رد البائع' : 'Waiting for the seller')}</p>`}
                  ${isSeller && !d.sellerResponse ? `<button onclick="NonReceipt.respond('${order.id}')" class="mt-3 w-full py-2.5 text-sm font-bold bg-navy-800 text-white rounded-xl hover:bg-navy-900">${isAr() ? 'رد على النزاع وإرفاق إثبات' : 'Reply with proof'}</button>` : ''}
                </div>`;
            } catch (e) { console.warn('[NonReceipt] dispute card failed:', e.message); }
        },
    };

    window.NonReceipt = NonReceipt;
    console.log('✅ NonReceipt loaded');
})();
