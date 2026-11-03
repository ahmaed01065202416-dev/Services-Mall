/* ============================================================================
 * js/seller-kyc.js — Seller identity verification (توثيق البائعين)
 * ----------------------------------------------------------------------------
 *  • SellerKYC.open()                    → applicant form / status (called by "كن بائع")
 *  • SellerKYC.renderAdminTab(el, isAr)  → admin tab: ON/OFF switch, search, review queue + approve / reject,
 *                                          full ID data + export file for a legal authority
 *
 * All data goes through /api/kyc (functions/api/kyc.js). Nothing is written to Firestore from here:
 * the national-ID number is hashed server-side, the 3 photos are readable only by admins through the API
 * (every view is logged), and the records are kept — never deleted — on purpose.
 * ========================================================================== */
(function () {
    'use strict';

    const isAr = () => (window.AppState ? AppState.language !== 'en' : true);
    const esc  = (v) => (window.escapeHtml ? window.escapeHtml(v) : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])));
    const toast = (m, t) => { if (window.showToast) window.showToast(m, t || 'info'); else alert(m); };
    const busy  = (on, msg) => { try { on ? window.showLoading && window.showLoading(msg) : window.hideLoading && window.hideLoading(); } catch (_) {} };

    async function api(body) {
        const token = window.auth && window.auth.currentUser ? await window.auth.currentUser.getIdToken() : '';
        const resp = await fetch('/api/kyc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify(body),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.success) throw new Error(data.error || (isAr() ? 'تعذّر تنفيذ الطلب' : 'Request failed'));
        return data;
    }

    // ── modal helper ───────────────────────────────────────────────────────────
    function modal(html, wide) {
        closeModal();
        const el = document.createElement('div');
        el.id = 'kycModal';
        el.className = 'fixed inset-0 z-[9999] flex items-start sm:items-center justify-center p-3 bg-black/60 overflow-y-auto';
        el.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} my-4 relative" dir="${isAr() ? 'rtl' : 'ltr'}">
            <button type="button" id="kycClose" class="absolute top-3 ${isAr() ? 'left-3' : 'right-3'} w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600" aria-label="close">✕</button>
            <div class="p-5 sm:p-6">${html}</div></div>`;
        document.body.appendChild(el);
        el.addEventListener('click', (e) => { if (e.target === el) closeModal(); });
        el.querySelector('#kycClose').addEventListener('click', closeModal);
        return el;
    }
    function closeModal() { document.getElementById('kycModal')?.remove(); }

    // ════════════════════════════════════════════════════════════════════════════
    //  APPLICANT SIDE
    // ════════════════════════════════════════════════════════════════════════════
    const PHOTOS = [
        { k: 'front',  ar: 'صورة البطاقة (الوش)',   en: 'ID card — front' },
        { k: 'back',   ar: 'صورة البطاقة (الضهر)',  en: 'ID card — back' },
        { k: 'selfie', ar: 'سيلفي وأنت ماسك البطاقة', en: 'Selfie holding your ID' },
    ];
    let photos = {};

    async function open() {
        if (!window.auth || !window.auth.currentUser) { if (window.navigateTo) navigateTo('login'); else toast(isAr() ? 'سجّل دخولك الأول' : 'Log in first', 'warning'); return; }
        busy(true, isAr() ? 'جاري التحميل...' : 'Loading...');
        let st;
        try { st = await api({ action: 'status' }); }
        catch (e) { busy(false); toast(e.message, 'error'); return; }
        busy(false);

        if (st.role === 'seller' || st.role === 'admin' || st.status === 'approved') {
            toast(isAr() ? 'حسابك بائع بالفعل ✅ — لو لسه مش ظاهر لك، اعمل تحديث للصفحة' : 'You are already a seller — refresh the page if it does not show yet', 'success');
            return;
        }
        if (st.status === 'pending') {
            modal(`<div class="text-center py-6">
                <div class="text-5xl mb-3">⏳</div>
                <h3 class="text-xl font-bold text-navy-800 mb-2">${isAr() ? 'طلبك تحت المراجعة' : 'Your application is under review'}</h3>
                <p class="text-gray-600 text-sm">${isAr() ? 'فريقنا بيراجع بياناتك. هيجيلك إشعار أول ما نخلّص.' : 'Our team is reviewing your details. You will be notified as soon as we are done.'}</p></div>`);
            return;
        }
        if (st.required === false) { renderDirect(); return; }       // admin switched verification OFF
        photos = {};
        renderForm(st);
    }

    function renderDirect() {
        const el = modal(`<div class="text-center py-4">
            <div class="text-5xl mb-3">🏪</div>
            <h3 class="text-xl font-bold text-navy-800 mb-2">${isAr() ? 'فعّل حسابك كبائع' : 'Become a seller'}</h3>
            <p class="text-gray-600 text-sm mb-4">${isAr() ? 'تقدر تبدأ تضيف منتجاتك وخدماتك وتفتح متجرك دلوقتي.' : 'You can start adding your products and services and open your store now.'}</p>
            <button type="button" id="kycDirect" class="btn-primary w-full py-3 rounded-xl font-bold">${isAr() ? 'تفعيل حساب البائع' : 'Activate seller account'}</button></div>`);
        el.querySelector('#kycDirect').addEventListener('click', async () => {
            try {
                busy(true, isAr() ? 'جاري التفعيل...' : 'Activating...');
                await api({ action: 'becomeSeller' });
                busy(false); closeModal();
                toast(isAr() ? '✅ تم تفعيل حسابك كبائع — هنحدّث الصفحة' : '✅ You are a seller now — reloading', 'success');
                setTimeout(() => location.reload(), 1200);
            } catch (e) { busy(false); toast(e.message, 'error'); }
        });
    }

    function renderForm(st) {
        const rejected = st && st.status === 'rejected';
        const el = modal(`
            <h3 class="text-xl font-bold text-navy-800 mb-1">${isAr() ? 'توثيق حساب البائع' : 'Seller verification'}</h3>
            <p class="text-gray-500 text-sm mb-4">${isAr() ? 'عشان نحمي العملاء والتجار، بنراجع هوية كل بائع قبل تفعيل متجره.' : 'To protect customers and merchants we verify every seller before their store goes live.'}</p>
            ${rejected ? `<div class="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">❌ ${isAr() ? 'تم رفض طلبك السابق. السبب:' : 'Your previous application was rejected. Reason:'} <b>${esc(st.reviewNote || '—')}</b></div>` : ''}
            <div class="space-y-3">
                <label class="block"><span class="text-sm font-semibold text-gray-700">${isAr() ? 'الاسم الثلاثي (زي البطاقة)' : 'Full name (as on ID)'}</span>
                    <input id="kycName" type="text" maxlength="80" class="input-field w-full mt-1 px-3 py-2 border rounded-xl" autocomplete="name"></label>
                <label class="block"><span class="text-sm font-semibold text-gray-700">${isAr() ? 'رقم البطاقة (14 رقم)' : 'National ID number (14 digits)'}</span>
                    <input id="kycId" type="text" inputmode="numeric" maxlength="14" dir="ltr" class="input-field w-full mt-1 px-3 py-2 border rounded-xl" autocomplete="off"></label>
                <label class="block"><span class="text-sm font-semibold text-gray-700">${isAr() ? 'رقم الموبايل' : 'Mobile number'}</span>
                    <input id="kycPhone" type="tel" maxlength="15" dir="ltr" class="input-field w-full mt-1 px-3 py-2 border rounded-xl" autocomplete="tel"></label>
                <label class="block"><span class="text-sm font-semibold text-gray-700">${isAr() ? 'العنوان بالتفصيل' : 'Full address'}</span>
                    <input id="kycAddress" type="text" maxlength="200" class="input-field w-full mt-1 px-3 py-2 border rounded-xl" autocomplete="street-address"></label>
                <label class="block"><span class="text-sm font-semibold text-gray-700">${isAr() ? 'اسم المتجر (اختياري)' : 'Store name (optional)'}</span>
                    <input id="kycStore" type="text" maxlength="60" class="input-field w-full mt-1 px-3 py-2 border rounded-xl"></label>
                <div class="grid grid-cols-3 gap-2">
                    ${PHOTOS.map(p => `<div class="text-center">
                        <label class="block cursor-pointer border-2 border-dashed border-gray-300 hover:border-navy-400 rounded-xl p-2 h-28 flex items-center justify-center overflow-hidden" id="kycBox_${p.k}">
                            <span class="text-xs text-gray-500" id="kycHint_${p.k}">📷 ${isAr() ? p.ar : p.en}</span>
                            <img id="kycPrev_${p.k}" class="hidden max-h-24 rounded-lg object-contain" alt="">
                            <input type="file" accept="image/*" class="hidden" data-kyc-file="${p.k}"></label></div>`).join('')}
                </div>
                <label class="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                    <input id="kycConsent" type="checkbox" class="mt-1 accent-navy-600">
                    <span>${isAr()
                        ? 'أوافق على حفظ بياناتي وصورة بطاقتي لدى المنصة لأغراض التحقق والأمان، وعلى تقديمها للجهات القانونية المختصة إذا لزم الأمر.'
                        : 'I agree that the platform keeps my data and ID photo for verification and security, and may provide them to the competent legal authorities if required.'}</span></label>
                <p class="text-xs text-gray-400">🔒 ${isAr() ? 'الصور بتتخزن بشكل خاص ومحدش يقدر يفتحها غير فريق الإدارة، وكل فتح ليها بيتسجّل.' : 'Photos are stored privately; only the admin team can open them and every access is logged.'}</p>
                <button type="button" id="kycSubmit" class="btn-primary w-full py-3 rounded-xl font-bold">${isAr() ? 'إرسال طلب التوثيق' : 'Submit application'}</button>
            </div>`);

        el.querySelectorAll('[data-kyc-file]').forEach(inp => inp.addEventListener('change', async () => {
            const k = inp.getAttribute('data-kyc-file'); const f = inp.files && inp.files[0]; if (!f) return;
            if (!/^image\//.test(f.type)) { toast(isAr() ? 'اختار صورة' : 'Choose an image', 'warning'); return; }
            try {
                busy(true, isAr() ? 'جاري تجهيز الصورة...' : 'Preparing image...');
                // clear but small: ≤ ~850K characters so three photos stay far below any request/document limit
                photos[k] = await uploadFile(f, 'kyc', k, { maxPx: 1400, quality: 0.8, maxLen: 850000 });
                busy(false);
                const box = el.querySelector('#kycBox_' + k);
                const prev = el.querySelector('#kycPrev_' + k);
                prev.src = window.safeUrl(photos[k]);            // our own canvas output (data:image/jpeg) — safe by construction
                prev.classList.remove('hidden');
                el.querySelector('#kycHint_' + k).classList.add('hidden');
                box.classList.remove('border-dashed'); box.classList.add('border-green-400');
            } catch (e) { busy(false); toast(e.message || 'Error', 'error'); }
        }));

        el.querySelector('#kycSubmit').addEventListener('click', async () => {
            const val = (id) => (el.querySelector(id).value || '').trim();
            const body = {
                action: 'submit',
                fullName: val('#kycName'), nationalId: val('#kycId').replace(/\s+/g, ''), phone: val('#kycPhone'),
                address: val('#kycAddress'), storeName: val('#kycStore'),
                consent: el.querySelector('#kycConsent').checked,
                front: photos.front, back: photos.back, selfie: photos.selfie,
            };
            if (!photos.front || !photos.back || !photos.selfie) { toast(isAr() ? 'ارفع الصور الثلاثة' : 'Upload all three photos', 'warning'); return; }
            if (!body.consent) { toast(isAr() ? 'لازم توافق على حفظ البيانات' : 'You must agree to the data retention', 'warning'); return; }
            try {
                busy(true, isAr() ? 'جاري الإرسال...' : 'Submitting...');
                await api(body);
                busy(false);
                photos = {};
                modal(`<div class="text-center py-6"><div class="text-5xl mb-3">✅</div>
                    <h3 class="text-xl font-bold text-navy-800 mb-2">${isAr() ? 'تم استلام طلبك' : 'Application received'}</h3>
                    <p class="text-gray-600 text-sm">${isAr() ? 'هنراجع بياناتك ونبعتلك إشعار بالنتيجة. بعد القبول متجرك يتفعّل.' : 'We will review it and notify you. Your store is activated after approval.'}</p></div>`);
            } catch (e) { busy(false); toast(e.message, 'error'); }
        });
    }

    // ════════════════════════════════════════════════════════════════════════════
    //  ADMIN SIDE
    // ════════════════════════════════════════════════════════════════════════════
    const STATUS_LABEL = {
        pending:  { ar: 'تحت المراجعة', en: 'Pending',  cls: 'bg-amber-100 text-amber-700' },
        approved: { ar: 'مقبول',        en: 'Approved', cls: 'bg-green-100 text-green-700' },
        rejected: { ar: 'مرفوض',        en: 'Rejected', cls: 'bg-red-100 text-red-700' },
    };
    const fmt = (ms) => { if (!ms) return '—'; try { return new Date(ms).toLocaleString(isAr() ? 'ar-EG' : 'en-GB'); } catch (_) { return '—'; } };

    async function renderAdminTab(container, ar, status, foundItems) {
        status = status || 'pending';
        container.innerHTML = `<div class="text-center py-8"><i class="fa-solid fa-spinner fa-spin text-navy-500 text-2xl"></i></div>`;
        let items = [], required = true;
        try {
            const [cfg, list] = await Promise.all([api({ action: 'config' }), foundItems ? Promise.resolve({ items: foundItems }) : api({ action: 'adminList', status: status === 'all' ? '' : status })]);
            required = cfg.required !== false; items = list.items || [];
        } catch (e) { container.innerHTML = `<div class="p-4 rounded-xl bg-red-50 text-red-700 text-sm">${esc(e.message)}</div>`; return; }

        const tabs = ['pending', 'approved', 'rejected', 'all'].map(s => `<button type="button" data-kyc-filter="${s}" class="px-3 py-1.5 rounded-full text-sm border ${s === status ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-gray-600 border-gray-200'}">${
            s === 'all' ? (ar ? 'الكل' : 'All') : (ar ? STATUS_LABEL[s].ar : STATUS_LABEL[s].en)}</button>`).join('');
        container.innerHTML = `
            <div class="flex flex-wrap items-center justify-between gap-3 p-4 mb-4 rounded-2xl border ${required ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}">
                <div><div class="font-black text-gray-900">${ar ? 'نظام توثيق البائعين' : 'Seller verification system'}: ${required ? (ar ? 'مفعّل' : 'ON') : (ar ? 'متوقف' : 'OFF')}</div>
                    <div class="text-xs text-gray-600 mt-0.5">${required
                        ? (ar ? 'محدش يبقى بائع غير بعد موافقتك على بطاقته وسيلفيه.' : 'Nobody becomes a seller before you approve their ID and selfie.')
                        : (ar ? 'أي مستخدم بريده مفعّل يقدر يبقى بائع مباشرة من غير توثيق. الطلبات اللي اتبعتت قبل كده لسه ممكن تتراجع.' : 'Any user with a verified e-mail can become a seller directly. Applications already sent can still be reviewed.')}</div></div>
                <button type="button" id="kycSwitch" class="px-4 py-2 rounded-xl font-bold text-white ${required ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}">${required ? (ar ? 'إيقاف التوثيق' : 'Turn off') : (ar ? 'تفعيل التوثيق' : 'Turn on')}</button>
            </div>
            <div class="grid sm:grid-cols-2 gap-2 mb-4">
                <input id="kycSearch" type="search" placeholder="${ar ? 'بحث بالاسم / الموبايل / المتجر / آخر 4 أرقام' : 'Search name / phone / store / last 4'}" class="px-3 py-2 border rounded-xl text-sm">
                <div class="flex gap-2"><input id="kycFindId" type="text" inputmode="numeric" maxlength="14" dir="ltr" placeholder="${ar ? 'بحث برقم البطاقة كامل (14 رقم)' : 'Find by full ID number'}" class="flex-1 px-3 py-2 border rounded-xl text-sm">
                    <button type="button" id="kycFindBtn" class="px-3 py-2 rounded-xl bg-navy-700 text-white text-sm">${ar ? 'بحث' : 'Find'}</button></div>
            </div>
            <div class="flex flex-wrap items-center gap-2 mb-4">${tabs}</div>
            <div class="p-3 mb-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs">🔒 ${ar
                ? 'بيانات البطاقات خاصة: فتحها أو تصديرها بيتسجّل باسمك وبالوقت. ممنوع مشاركتها — استخدمها للمراجعة وتسليمها للجهات القانونية بس.'
                : 'ID photos are private: each opening is logged with your name and time. Do not copy or share them — use only for review and legal authorities.'}</div>
            ${items.length ? `<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-gray-500 text-xs border-b">
                <th class="p-2 text-start">${ar ? 'الاسم' : 'Name'}</th><th class="p-2 text-start">${ar ? 'البطاقة' : 'ID'}</th>
                <th class="p-2 text-start">${ar ? 'الموبايل' : 'Phone'}</th><th class="p-2 text-start">${ar ? 'تاريخ التقديم' : 'Submitted'}</th>
                <th class="p-2 text-start">${ar ? 'الحالة' : 'Status'}</th><th class="p-2"></th></tr></thead><tbody>
                ${items.map(a => { const st = STATUS_LABEL[a.status] || STATUS_LABEL.pending; return `<tr class="border-b hover:bg-gray-50">
                    <td class="p-2 font-semibold">${esc(a.fullName)}<div class="text-xs text-gray-400">${esc(a.storeName)}</div></td>
                    <td class="p-2" dir="ltr">••••••••••${esc(a.idLast4)}</td><td class="p-2" dir="ltr">${esc(a.phone)}</td>
                    <td class="p-2 text-xs">${esc(fmt(a.submittedAt))}${a.attempts > 1 ? ` <span class="text-amber-600">(${ar ? 'محاولة' : 'try'} ${esc(a.attempts)})</span>` : ''}</td>
                    <td class="p-2"><span class="px-2 py-0.5 rounded-full text-xs ${st.cls}">${ar ? st.ar : st.en}</span></td>
                    <td class="p-2"><button type="button" data-kyc-open="${esc(a.uid)}" class="px-3 py-1.5 rounded-lg bg-navy-700 text-white text-xs">${ar ? 'مراجعة' : 'Review'}</button></td></tr>`; }).join('')}
                </tbody></table></div>` : `<div class="text-center text-gray-400 py-10">${ar ? 'مفيش طلبات' : 'No applications'}</div>`}`;

        container.querySelector('#kycSwitch').addEventListener('click', async () => {
            const to = !required;
            if (!confirm(to ? (ar ? 'تفعيل التوثيق؟ البائعين الجدد هيحتاجوا موافقتك.' : 'Turn verification ON?') : (ar ? 'إيقاف التوثيق؟ أي مستخدم هيقدر يبقى بائع مباشرة.' : 'Turn verification OFF? Anyone can become a seller directly.'))) return;
            try { busy(true); await api({ action: 'adminSetRequired', required: to }); busy(false); toast(to ? (ar ? '✅ التوثيق مفعّل' : '✅ ON') : (ar ? 'التوثيق متوقف' : 'OFF'), 'success'); renderAdminTab(container, ar, status); }
            catch (e) { busy(false); toast(e.message, 'error'); }
        });
        container.querySelector('#kycSearch').addEventListener('input', (e) => {
            const q = e.target.value.trim().toLowerCase();
            container.querySelectorAll('tbody tr').forEach(tr => { tr.style.display = !q || tr.textContent.toLowerCase().includes(q) ? '' : 'none'; });
        });
        container.querySelector('#kycFindBtn').addEventListener('click', async () => {
            const nid = container.querySelector('#kycFindId').value.replace(/\s+/g, '');
            if (!/^\d{14}$/.test(nid)) { toast(ar ? 'اكتب رقم البطاقة 14 رقم' : 'Enter the 14-digit number', 'warning'); return; }
            try { busy(true); const r = await api({ action: 'adminFindByNationalId', nationalId: nid }); busy(false);
                if (!r.items.length) { toast(ar ? 'مفيش حد مسجّل بالرقم ده' : 'No applicant with this number', 'info'); return; }
                renderAdminTab(container, ar, 'all', r.items); }
            catch (e) { busy(false); toast(e.message, 'error'); }
        });
        container.querySelectorAll('[data-kyc-filter]').forEach(b => b.addEventListener('click', () => renderAdminTab(container, ar, b.getAttribute('data-kyc-filter'))));
        container.querySelectorAll('[data-kyc-open]').forEach(b => b.addEventListener('click', () => openReview(b.getAttribute('data-kyc-open'), container, ar, status)));
    }

    async function openReview(uid, container, ar, status) {
        busy(true, ar ? 'جاري فتح الملف...' : 'Opening...');
        let res;
        try { res = await api({ action: 'adminGet', uid }); }
        catch (e) { busy(false); toast(e.message, 'error'); return; }
        busy(false);
        const a = res.app, im = res.images || {}, hist = res.history || [];
        const ACTION_AR = { view: 'فتح الملف', export: 'تصدير الملف', approve: 'قبول', reject: 'رفض', search_id: 'بحث برقم البطاقة' };
        const photoBox = (k, label) => `<div class="text-center"><div class="text-xs text-gray-500 mb-1">${label}</div>
            <a href="${window.safeUrl(im[k]) || '#'}" target="_blank" rel="noopener"><img src="${window.safeUrl(im[k])}" class="w-full max-h-64 object-contain rounded-xl border bg-gray-50" alt=""></a></div>`;
        const el = modal(`
            <h3 class="text-lg font-bold text-navy-800 mb-3">${ar ? 'مراجعة طلب توثيق' : 'Review application'}</h3>
            <div class="grid sm:grid-cols-2 gap-2 text-sm mb-4">
                <div><span class="text-gray-500">${ar ? 'الاسم:' : 'Name:'}</span> <b>${esc(a.fullName)}</b></div>
                <div class="sm:col-span-2"><span class="text-gray-500">${ar ? 'رقم البطاقة:' : 'National ID:'}</span> ${res.nationalIdAvailable
                    ? `<b dir="ltr" class="select-all">${esc(res.nationalId)}</b>`
                    : `<span class="text-amber-600 text-xs">${ar ? 'الرقم مش محفوظ كنص لهذا الطلب (اتقدّم قبل التشفير) — شوفه من صورة البطاقة. آخر 4:' : 'Not stored as text for this older application — read it from the photo. Last 4:'} <b dir="ltr">${esc(a.idLast4)}</b></span>`}</div>
                <div><span class="text-gray-500">${ar ? 'البريد:' : 'E-mail:'}</span> <b dir="ltr">${esc((res.account && res.account.email) || a.email || '—')}</b></div>
                <div><span class="text-gray-500">${ar ? 'الموبايل:' : 'Phone:'}</span> <b dir="ltr">${esc(a.phone)}</b></div>
                <div><span class="text-gray-500">${ar ? 'المتجر:' : 'Store:'}</span> <b>${esc(a.storeName || '—')}</b></div>
                <div class="sm:col-span-2"><span class="text-gray-500">${ar ? 'العنوان:' : 'Address:'}</span> <b>${esc(a.address)}</b></div></div>
            <div class="grid grid-cols-3 gap-2 mb-4">${photoBox('front', ar ? 'الوش' : 'Front')}${photoBox('back', ar ? 'الضهر' : 'Back')}${photoBox('selfie', ar ? 'السيلفي' : 'Selfie')}</div>
            <div class="text-xs text-gray-500 mb-3">${ar ? 'اتأكد إن: الاسم والرقم في الصورة نفس المكتوب • السيلفي لنفس الشخص • البطاقة سارية وواضحة.' : 'Check: name/number match the form • selfie is the same person • ID is valid and legible.'}</div>
            <div class="mb-3"><button type="button" id="kycExport" class="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-900 text-white text-sm font-bold">🖨️ ${ar ? 'تصدير ملف للجهة الأمنية (طباعة / PDF)' : 'Export file for a legal authority (print / PDF)'}</button></div>
            ${hist.length ? `<details class="mb-3 text-xs text-gray-600"><summary class="cursor-pointer font-bold">${ar ? `سجل الاطلاع على الملف (${hist.length})` : `Access log (${hist.length})`}</summary><ul class="mt-1 space-y-0.5">${hist.slice(0, 15).map(h => `<li>${esc(fmt(h.at))} — ${esc(ar ? (ACTION_AR[h.action] || h.action) : h.action)} <span dir="ltr" class="text-gray-400">(${esc((h.adminUid || '').slice(0, 8))})</span></li>`).join('')}</ul></details>` : ''}
            ${a.status === 'pending' ? `
                <textarea id="kycNote" rows="2" maxlength="300" class="w-full border rounded-xl p-2 text-sm mb-3" placeholder="${ar ? 'ملاحظة (مطلوبة عند الرفض)' : 'Note (required when rejecting)'}"></textarea>
                <div class="flex gap-2">
                    <button type="button" id="kycApprove" class="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold">${ar ? '✅ قبول' : '✅ Approve'}</button>
                    <button type="button" id="kycReject" class="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold">${ar ? '❌ رفض' : '❌ Reject'}</button></div>`
                : `<div class="p-3 rounded-xl bg-gray-50 text-sm">${ar ? 'الحالة:' : 'Status:'} <b>${esc((STATUS_LABEL[a.status] || {})[ar ? 'ar' : 'en'] || a.status)}</b> — ${esc(fmt(a.reviewedAt))} ${a.reviewNote ? `<div class="mt-1 text-gray-600">${esc(a.reviewNote)}</div>` : ''}</div>`}`, true);

        const decide = async (decision) => {
            const note = (el.querySelector('#kycNote')?.value || '').trim();
            if (decision === 'reject' && note.length < 3) { toast(ar ? 'اكتب سبب الرفض' : 'Write the rejection reason', 'warning'); return; }
            if (!confirm(decision === 'approve' ? (ar ? 'تأكيد قبول البائع؟' : 'Approve this seller?') : (ar ? 'تأكيد الرفض؟' : 'Reject this application?'))) return;
            try {
                busy(true);
                await api({ action: 'adminReview', uid, decision, note });
                busy(false); closeModal();
                toast(decision === 'approve' ? (ar ? '✅ تم قبول البائع' : '✅ Seller approved') : (ar ? 'تم الرفض' : 'Rejected'), 'success');
                renderAdminTab(container, ar, status);
            } catch (e) { busy(false); toast(e.message, 'error'); }
        };
        el.querySelector('#kycExport')?.addEventListener('click', async () => {
            try { busy(true, ar ? 'جاري تجهيز الملف...' : 'Preparing...'); const full = await api({ action: 'adminExport', uid }); busy(false); printFile(full, ar); }
            catch (e) { busy(false); toast(e.message, 'error'); }
        });
        el.querySelector('#kycApprove')?.addEventListener('click', () => decide('approve'));
        el.querySelector('#kycReject')?.addEventListener('click', () => decide('reject'));
    }

    // Printable file for a legal authority: every data field, the full ID number, the 3 photos and the access log.
    function printFile(full, ar) {
        const a = full.app, im = full.images || {}, acc = full.account || {};
        const w = window.open('', '_blank');
        if (!w) { toast(ar ? 'اسمح بالنوافذ المنبثقة عشان يفتح الملف' : 'Allow pop-ups to open the file', 'warning'); return; }
        const row = (k, v) => `<tr><th>${esc(k)}</th><td dir="auto">${esc(v == null || v === '' ? '—' : v)}</td></tr>`;
        const img = (k, label) => im[k] ? `<figure><img src="${window.safeUrl(im[k])}" alt=""><figcaption>${esc(label)}</figcaption></figure>` : '';
        w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>ملف بيانات بائع — ${esc(a.fullName)}</title>
            <style>body{font-family:Tahoma,Arial,sans-serif;margin:24px;color:#111}h1{font-size:20px}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #bbb;padding:6px 10px;text-align:start;font-size:14px}th{background:#f3f3f3;width:32%}
            .imgs{display:flex;gap:12px;flex-wrap:wrap}figure{margin:0;flex:1;min-width:220px}img{width:100%;max-height:340px;object-fit:contain;border:1px solid #bbb}figcaption{font-size:12px;text-align:center;color:#555}.note{font-size:12px;color:#555;margin-top:16px}@media print{button{display:none}}</style></head><body>
            <button onclick="print()">طباعة / حفظ PDF</button>
            <h1>ملف بيانات بائع — منصة مول الخدمات</h1>
            <table>${row('الاسم بالكامل', a.fullName)}${row('رقم البطاقة القومي', full.nationalIdAvailable ? full.nationalId : ('غير محفوظ كنص — آخر 4 أرقام: ' + a.idLast4))}${row('الموبايل', a.phone)}${row('العنوان', a.address)}${row('البريد الإلكتروني', acc.email || a.email)}${row('اسم المتجر', a.storeName)}${row('معرّف الحساب (UID)', a.uid)}${row('حالة الطلب', a.status)}${row('تاريخ التقديم', fmt(a.submittedAt))}${row('تاريخ المراجعة', fmt(a.reviewedAt))}${row('ملاحظة المراجعة', a.reviewNote)}${row('تاريخ فتح الحساب', fmt(acc.createdAt))}</table>
            <div class="imgs">${img('front', 'البطاقة — الوش')}${img('back', 'البطاقة — الضهر')}${img('selfie', 'السيلفي')}</div>
            <h2 style="font-size:16px">سجل الاطلاع على الملف</h2>
            <table>${(full.history || []).slice(0, 30).map(h => row(fmt(h.at), h.action + ' — ' + (h.adminUid || '').slice(0, 8))).join('') || row('—', '—')}</table>
            <p class="note">تاريخ استخراج الملف: ${esc(new Date().toLocaleString('ar-EG'))}. المستند سري ويُسلَّم للجهة القانونية المختصة فقط، وعملية الاستخراج مسجّلة باسم المسؤول.</p></body></html>`);
        w.document.close();
    }

    window.SellerKYC = { open, renderAdminTab: (c, ar) => renderAdminTab(c, ar) };
})();
