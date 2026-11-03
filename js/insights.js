/* ============================================================================
 * js/insights.js — العملاء والزوار (لوحة التاجر + لوحة الأدمن)
 * ----------------------------------------------------------------------------
 *  • MallInsights.renderSellerTab(el)  → the merchant's OWN customers & store visitors
 *  • MallInsights.renderAdminTab(el)   → whole platform + merchant comparison + "look a person up"
 * Numbers come from /api/analytics (visits tied to real accounts, purchases from real orders).
 * ========================================================================== */
(function () {
    'use strict';

    const isAr = () => (window.AppState ? AppState.language !== 'en' : true);
    const esc  = (v) => (window.escapeHtml ? window.escapeHtml(v) : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])));
    const money = (n) => (window.formatCurrency ? window.formatCurrency(n) : String(n));
    const num = (n) => Number(n || 0).toLocaleString('en-US');
    const dayFmt = (k) => { k = String(k || ''); return k.length === 8 ? `${k.slice(6, 8)}/${k.slice(4, 6)}/${k.slice(0, 4)}` : '—'; };
    const tsFmt = (ms) => { if (!ms) return '—'; try { return new Date(ms).toLocaleDateString(isAr() ? 'ar-EG' : 'en-GB'); } catch (_) { return '—'; } };

    async function api(body) {
        const token = window.auth && window.auth.currentUser ? await window.auth.currentUser.getIdToken() : '';
        const resp = await fetch('/api/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify(body) });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.success) throw new Error(data.error || (isAr() ? 'تعذّر تحميل التحليلات' : 'Could not load analytics'));
        return data;
    }

    const kpi = (label, value, sub) => `<div class="bg-white rounded-2xl p-4 border border-gray-100"><div class="text-xs text-gray-500 mb-1">${label}</div><div class="text-2xl font-black text-navy-800">${value}</div>${sub ? `<div class="text-xs text-gray-400 mt-0.5">${sub}</div>` : ''}</div>`;
    const card = (title, inner, hint) => `<div class="bg-white rounded-2xl p-5 border border-gray-100"><h4 class="font-black text-gray-900 mb-1">${title}</h4>${hint ? `<p class="text-xs text-gray-400 mb-3">${hint}</p>` : '<div class="mb-3"></div>'}${inner}</div>`;

    // stacked daily bars (new / returning) — pure SVG
    function dailyChart(series) {
        const ar = isAr();
        const W = 640, H = 170, P = { l: 30, r: 6, t: 8, b: 20 }, iw = W - P.l - P.r, ih = H - P.t - P.b;
        const max = Math.max(1, ...series.map(s => s.visitors));
        const bw = iw / series.length;
        let g = '';
        series.forEach((s, i) => {
            const x = P.l + i * bw + 1, hr = ih * s.returning / max, hn = ih * s.fresh / max;
            g += `<rect x="${x}" y="${P.t + ih - hr}" width="${Math.max(1, bw - 2)}" height="${hr}" fill="#14B8A6"><title>${dayFmt(s.day)} — ${ar ? 'عائد' : 'returning'} ${s.returning}</title></rect>`;
            g += `<rect x="${x}" y="${P.t + ih - hr - hn}" width="${Math.max(1, bw - 2)}" height="${hn}" fill="#E0B872"><title>${dayFmt(s.day)} — ${ar ? 'جديد' : 'new'} ${s.fresh}</title></rect>`;
            if (i % 5 === 0) g += `<text x="${x + bw / 2}" y="${H - 5}" font-size="9" text-anchor="middle" fill="currentColor" opacity=".55">${s.day.slice(6)}/${s.day.slice(4, 6)}</text>`;
        });
        g += `<text x="${P.l - 4}" y="${P.t + 8}" font-size="9" text-anchor="end" fill="currentColor" opacity=".55">${max}</text><text x="${P.l - 4}" y="${P.t + ih}" font-size="9" text-anchor="end" fill="currentColor" opacity=".55">0</text>`;
        return `<svg viewBox="0 0 ${W} ${H}" class="w-full text-gray-700" role="img">${g}</svg>
            <div class="flex gap-4 text-xs text-gray-500 mt-1"><span><i class="inline-block w-3 h-3 rounded-sm align-middle" style="background:#E0B872"></i> ${ar ? 'زوار جدد' : 'New'}</span><span><i class="inline-block w-3 h-3 rounded-sm align-middle" style="background:#14B8A6"></i> ${ar ? 'زوار عائدون' : 'Returning'}</span></div>`;
    }

    function retentionBars(ret) {
        const ar = isAr();
        const lbl = { 1: ar ? 'خلال يوم' : 'within 1 day', 7: ar ? 'خلال أسبوع' : 'within 1 week', 30: ar ? 'خلال شهر' : 'within 1 month' };
        return ret.map(r => `<div class="mb-3"><div class="flex justify-between text-sm"><span class="font-semibold">${ar ? 'رجعوا' : 'Came back'} ${lbl[r.days]}</span>
            <span class="text-gray-600">${r.rate === null ? (ar ? 'لسه بدري' : 'too early') : r.rate + '%'} <span class="text-xs text-gray-400">(${r.returned}/${r.eligible})</span></span></div>
            <div class="h-2.5 rounded-full bg-gray-100 overflow-hidden"><div class="h-full rounded-full" style="width:${r.rate || 0}%;background:#14B8A6"></div></div></div>`).join('')
            + `<p class="text-xs text-gray-400">${ar ? 'النسبة من الزوار اللي عدّى على أول زيارة ليهم المدة دي، ورجعوا في يوم تاني جوّا المدة.' : 'Share of visitors whose first visit is at least that old and who visited again on a later day inside the period.'}</p>`;
    }

    function funnelBlock(f, ar, storeLevel) {
        const pct = (a, b) => b ? Math.round(a * 100 / b) : 0;
        const row = (label, v, p, color) => `<div class="mb-2"><div class="flex justify-between text-sm"><span>${label}</span><b>${num(v)} <span class="text-xs text-gray-400 font-normal">${p}%</span></b></div><div class="h-2 rounded-full bg-gray-100 overflow-hidden"><div class="h-full rounded-full" style="width:${p}%;background:${color}"></div></div></div>`;
        return row(storeLevel ? (ar ? 'زاروا متجرك' : 'Visited your store') : (ar ? 'زوار' : 'Visitors'), f.visitors, 100, '#94a3b8')
            + row(ar ? 'عندهم حساب على المنصة' : 'Have an account', f.withAccount, pct(f.withAccount, f.visitors), '#E0B872')
            + row(storeLevel ? (ar ? 'اشتروا منك' : 'Bought from you') : (ar ? 'اشتروا فعلًا' : 'Actually bought'), f.bought, pct(f.bought, f.visitors), '#14B8A6')
            + `<div class="text-xs text-gray-400 mt-2">${ar ? `بدون حساب: ${num(f.anonymous)} • سجّلوا ومااشتروش: ${num(f.accountNoPurchase)}` : `No account: ${num(f.anonymous)} • account, no purchase: ${num(f.accountNoPurchase)}`}</div>`;
    }

    function topTable(top, ar) {
        if (!top.length) return `<p class="text-sm text-gray-400">${ar ? 'لسه مفيش عملاء اشتروا مرتين أو أكتر.' : 'No repeat customers yet.'}</p>`;
        return `<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-xs text-gray-500 border-b"><th class="p-2 text-start">${ar ? 'العميل' : 'Customer'}</th><th class="p-2 text-start">${ar ? 'الطلبات' : 'Orders'}</th><th class="p-2 text-start">${ar ? 'إجمالي الشراء' : 'Spent'}</th><th class="p-2 text-start">${ar ? 'آخر طلب' : 'Last order'}</th></tr></thead><tbody>
            ${top.map(t => `<tr class="border-b"><td class="p-2 font-semibold">${esc(t.name || '—')}</td><td class="p-2">${t.orders}</td><td class="p-2">${esc(money(t.spent))}</td><td class="p-2 text-xs">${esc(tsFmt(t.lastAt))}</td></tr>`).join('')}</tbody></table></div>`;
    }

    function customerKpis(c, ar, extra) {
        return `<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
            ${kpi(ar ? 'عملاء اشتروا' : 'Customers', num(c.buyers), `${num(c.orders)} ${ar ? 'طلب' : 'orders'} • ${esc(money(c.revenue))}`)}
            ${kpi(ar ? 'عملاء عائدون' : 'Repeat customers', `${c.repeatRate}%`, `${num(c.repeatBuyers)} ${ar ? 'اشتروا مرتين أو أكتر' : 'bought 2+ times'}`)}
            ${kpi(ar ? 'متوسط المدة بين الطلبات' : 'Avg time between orders', c.avgGapDays === null ? '—' : `${c.avgGapDays} ${ar ? 'يوم' : 'days'}`, ar ? 'للعملاء العائدين' : 'repeat customers only')}
            ${extra}</div>
            ${c.truncated ? `<p class="text-xs text-amber-600 mt-2">${ar ? 'الأرقام محسوبة على أحدث الطلبات فقط (حد النظام).' : 'Computed on the most recent orders only (system limit).'}</p>` : ''}`;
    }

    // ════════════════════════════════════════════════════════════════════════════
    async function renderSellerTab(container) {
        const ar = isAr();
        container.innerHTML = `<div class="text-center py-10"><i class="fa-solid fa-spinner fa-spin text-navy-500 text-2xl"></i></div>`;
        let r;
        try { r = await api({ action: 'sellerReport' }); }
        catch (e) { container.innerHTML = `<div class="p-4 rounded-xl bg-red-50 text-red-700 text-sm">${esc(e.message)}</div>`; return; }
        const c = r.customers, v = r.visitors;
        container.innerHTML = `<div class="space-y-5">
            ${customerKpis(c, ar, kpi(ar ? 'زوار متجرك (آخر 30 يوم)' : 'Store visitors (30 days)', num(v.split.total), `${num(v.split.new)} ${ar ? 'جديد' : 'new'} • ${num(v.split.returning)} ${ar ? 'عائد' : 'returning'}`))}
            <div class="grid lg:grid-cols-2 gap-5">
                ${card(ar ? 'زوار متجرك يوميًا' : 'Daily store visitors', dailyChart(v.series), ar ? 'آخر 30 يوم — جديد مقابل عائد' : 'Last 30 days — new vs returning')}
                ${card(ar ? 'هل الزوار بيرجعوا؟' : 'Do visitors come back?', retentionBars(v.retention))}
                ${card(ar ? 'من زائر لمشتري' : 'From visitor to buyer', funnelBlock(v.funnel, ar, true), ar ? 'الشراء محسوب من طلباتك الفعلية' : 'Purchases are counted from your real orders')}
                ${card(ar ? 'أفضل عملائك المتكررين' : 'Your best repeat customers', topTable(c.top, ar))}
            </div>
            <p class="text-xs text-gray-400">${ar ? 'الزيارات بتتسجّل من أول مرة الزائر يفتح متجرك أو منتج من منتجاتك، وبتتربط بحسابه لو كان مسجّل دخول.' : 'A visit is recorded the first time a person opens your store or one of your products, and linked to their account if they are signed in.'}</p></div>`;
    }

    // ════════════════════════════════════════════════════════════════════════════
    async function renderAdminTab(container) {
        const ar = isAr();
        container.innerHTML = `<div class="text-center py-10"><i class="fa-solid fa-spinner fa-spin text-navy-500 text-2xl"></i></div>`;
        let r;
        try { r = await api({ action: 'adminReport' }); }
        catch (e) { container.innerHTML = `<div class="p-4 rounded-xl bg-red-50 text-red-700 text-sm">${esc(e.message)}</div>`; return; }
        const c = r.customers, v = r.visitors;
        container.innerHTML = `<div class="space-y-5">
            <div class="bg-white rounded-2xl p-4 border border-gray-100">
                <h4 class="font-black text-gray-900 mb-2">🔎 ${ar ? 'ابحث عن شخص: استخدم المنصة ولا لا؟ واشترى من أنهي متاجر؟' : 'Look a person up: did they use the platform, which stores did they buy from?'}</h4>
                <div class="flex gap-2"><input id="insLookupQ" type="text" dir="ltr" placeholder="${ar ? 'الإيميل أو UID الحساب أو معرّف الزائر' : 'E-mail, account UID or visitor id'}" class="flex-1 px-3 py-2 border rounded-xl text-sm">
                    <button type="button" id="insLookupBtn" class="px-4 py-2 rounded-xl bg-navy-700 text-white text-sm font-bold">${ar ? 'بحث' : 'Search'}</button></div>
                <div id="insLookupOut" class="mt-3"></div></div>
            <div class="grid grid-cols-2 gap-3">
                ${kpi(ar ? 'إجمالي الزوار (متصفحات)' : 'Total visitors (browsers)', num(v.total), `${num(v.withAccount)} ${ar ? 'عندهم حساب' : 'with account'} • ${num(v.anonymous)} ${ar ? 'بدون' : 'without'}`)}
                ${kpi(ar ? 'نشطين آخر 30 يوم' : 'Active last 30 days', num(v.split.total), `${num(v.split.new)} ${ar ? 'جديد' : 'new'} • ${num(v.split.returning)} ${ar ? 'عائد' : 'returning'}`)}
            </div>
            ${customerKpis(c, ar, kpi(ar ? 'اشتروا من أكتر من متجر' : 'Bought from 2+ stores', num(c.multiStoreBuyers), ar ? 'عملاء مشتركين بين متاجر' : 'shared customers'))}
            <div class="grid lg:grid-cols-2 gap-5">
                ${card(ar ? 'زوار المنصة يوميًا' : 'Daily platform visitors', dailyChart(v.series), ar ? 'آخر 30 يوم — جديد مقابل عائد' : 'Last 30 days — new vs returning')}
                ${card(ar ? 'هل الزوار بيرجعوا؟' : 'Do visitors come back?', retentionBars(v.retention), v.sampled ? (ar ? `محسوب على آخر ${num(v.sampleSize)} زائر` : `Based on the latest ${num(v.sampleSize)} visitors`) : '')}
                ${card(ar ? 'من زائر لمشتري' : 'From visitor to buyer', funnelBlock(v.funnel, ar, false), v.sampled ? (ar ? `محسوب على آخر ${num(v.sampleSize)} زائر` : `Based on the latest ${num(v.sampleSize)} visitors`) : '')}
                ${card(ar ? 'أفضل العملاء المتكررين (كل المنصة)' : 'Best repeat customers (platform)', topTable(c.top, ar))}
            </div>
            ${card(ar ? 'مقارنة بين التجار' : 'Merchant comparison', r.stores.length ? `<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-xs text-gray-500 border-b">
                <th class="p-2 text-start">${ar ? 'التاجر' : 'Merchant'}</th><th class="p-2 text-start">${ar ? 'زوار (30 يوم)' : 'Visitors 30d'}</th><th class="p-2 text-start">${ar ? 'مشترين' : 'Buyers'}</th><th class="p-2 text-start">${ar ? 'عائدين' : 'Repeat'}</th><th class="p-2 text-start">${ar ? 'نسبة العودة' : 'Repeat rate'}</th><th class="p-2 text-start">${ar ? 'متوسط المدة' : 'Avg gap'}</th><th class="p-2 text-start">${ar ? 'الطلبات' : 'Orders'}</th><th class="p-2 text-start">${ar ? 'الإيراد' : 'Revenue'}</th></tr></thead><tbody>
                ${r.stores.map(s => `<tr class="border-b hover:bg-gray-50"><td class="p-2 font-semibold">${esc(s.name)}</td><td class="p-2">${num(s.visitors30)}</td><td class="p-2">${s.buyers}</td><td class="p-2">${s.repeatBuyers}</td><td class="p-2">${s.repeatRate}%</td><td class="p-2">${s.avgGapDays === null ? '—' : s.avgGapDays + (ar ? ' يوم' : ' d')}</td><td class="p-2">${s.orders}</td><td class="p-2">${esc(money(s.revenue))}</td></tr>`).join('')}</tbody></table></div>`
                : `<p class="text-sm text-gray-400">${ar ? 'مفيش طلبات مدفوعة لسه.' : 'No paid orders yet.'}</p>`)}
            <p class="text-xs text-gray-400">${ar ? 'الزوار بيتعرّفوا بمعرّف متصفح، وبيتربطوا بالحساب أول ما الشخص يسجّل دخول. الشراء محسوب من الطلبات الفعلية المدفوعة (من غير المسترجعة والملغية).' : 'Visitors are identified by a browser id and linked to the account once the person logs in. Purchases come from real paid orders (excluding refunded / cancelled).'}</p></div>`;

        const out = container.querySelector('#insLookupOut');
        const run = async () => {
            const qv = container.querySelector('#insLookupQ').value.trim(); if (!qv) return;
            out.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-navy-500"></i>`;
            try { out.innerHTML = lookupHtml(await api({ action: 'lookup', q: qv }), ar); }
            catch (e) { out.innerHTML = `<div class="p-3 rounded-xl bg-red-50 text-red-700 text-sm">${esc(e.message)}</div>`; }
        };
        container.querySelector('#insLookupBtn').addEventListener('click', run);
        container.querySelector('#insLookupQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    }

    function lookupHtml(d, ar) {
        if (!d.found) return `<div class="p-3 rounded-xl bg-gray-50 text-sm text-gray-600">${ar ? 'مفيش حساب أو زائر بالبيانات دي.' : 'No account or visitor matches.'}</div>`;
        const u = d.user, p = d.usedPlatform, vs = d.visits;
        const yes = (b, t) => `<span class="px-2 py-0.5 rounded-full text-xs ${b ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}">${t}</span>`;
        return `<div class="space-y-3 text-sm">
            <div class="flex flex-wrap gap-2 items-center">${u ? `<b>${esc(u.name || '—')}</b> <span dir="ltr" class="text-gray-500">${esc(u.email)}</span>` : `<b>${ar ? 'زائر من غير حساب' : 'Visitor without an account'}</b>`}
                ${yes(p.hasAccount, ar ? (p.hasAccount ? 'عنده حساب' : 'مفيش حساب') : (p.hasAccount ? 'has account' : 'no account'))}
                ${yes(p.bought, ar ? (p.bought ? `اشترى ${p.orders} طلب • ${esc(money(p.spent))}` : 'لسه ماشترّاش') : (p.bought ? `bought ${p.orders} orders` : 'never bought'))}</div>
            <div class="text-gray-600">${ar ? 'الزيارات:' : 'Visits:'} <b>${vs.daysVisited}</b> ${ar ? 'يوم' : 'days'} ${ar ? 'على' : 'on'} ${vs.browsers} ${ar ? 'متصفح' : 'browser(s)'} ${vs.firstDay ? `• ${ar ? 'من' : 'from'} ${esc(dayFmt(vs.firstDay))} ${ar ? 'لـ' : 'to'} ${esc(dayFmt(vs.lastDay))}` : ''}</div>
            <div><div class="font-bold mb-1">${ar ? 'اشترى من:' : 'Bought from:'}</div>${d.boughtFrom.length ? d.boughtFrom.map(b => `<div class="flex justify-between border-b py-1"><span>${esc(b.name)}</span><span class="text-gray-500">${b.orders} ${ar ? 'طلب' : 'orders'} • ${esc(money(b.spent))} • ${esc(tsFmt(b.lastAt))}</span></div>`).join('') : `<span class="text-gray-400">${ar ? 'مفيش مشتريات' : 'No purchases'}</span>`}</div>
            <div><div class="font-bold mb-1">${ar ? 'زار متاجر:' : 'Visited stores:'}</div>${d.visitedStores.length ? d.visitedStores.map(s => `<span class="inline-block px-2 py-1 m-0.5 rounded-lg bg-gray-100 text-xs">${esc(s.name)} <span class="text-gray-400">(${s.days} ${ar ? 'يوم' : 'd'})</span></span>`).join('') : `<span class="text-gray-400">—</span>`}</div></div>`;
    }

    window.MallInsights = { renderSellerTab, renderAdminTab };
})();
