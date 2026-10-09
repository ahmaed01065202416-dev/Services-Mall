/**
 * ============================================================================
 * STORE-THEMES-PRO.JS — 12 activity-specific store themes
 * ----------------------------------------------------------------------------
 * Adapted from the "12 e-commerce themes" showcase so they work on the REAL store page:
 *   • every text/image comes from the store itself (name, tagline, description, cover, logo, policies,
 *     rating, listing count) — no demo products, no fake cart buttons, no fake countdowns;
 *   • RTL-native, with the site's Cairo as the base font; the display fonts of a theme are loaded on demand;
 *   • the owner's brand colour stays the accent (each theme proposes a sensible default colour);
 *   • the products grid is the site's own product card, restyled by scoped CSS (.st-t-<id>).
 * Registered into StoreThemes (js/store-themes.js) — it must load after it.
 * ============================================================================
 */
(function () {
    'use strict';
    const TH = window.StoreThemes;
    if (!TH) { console.warn('[StoreThemesPro] StoreThemes missing'); return; }
    const isAr = () => AppState.language !== 'en';
    const esc = (v) => (window.escapeHtml ? window.escapeHtml(v) : String(v == null ? '' : v));
    const fb = (n) => `https://ui-avatars.com/api/?name=${encodeURIComponent(n || 'S')}&background=0f172a&color=fff&size=128`;
    const FONT = (fam) => `https://fonts.googleapis.com/css2?family=${fam}&display=swap`;
    const toGrid = "var g=document.getElementById('storeProductsGrid');if(g)g.scrollIntoView({behavior:'smooth',block:'start'})";

    // ── shared bits ──────────────────────────────────────────────────────────
    const stars = (d) => d.rev ? `<span style="color:#fbbf24">${'★'.repeat(Math.round(d.avg))}</span><span style="opacity:.3">${'★'.repeat(5 - Math.round(d.avg))}</span> ${d.avg.toFixed(1)} (${d.rev})` : `<span style="opacity:.7">${isAr() ? 'جديد — بدون تقييمات' : 'New — no reviews'}</span>`;
    const featBadge = (d, s) => d.featured ? `<span style="${s || 'background:linear-gradient(90deg,#f59e0b,#f97316);color:#fff'};font-size:11px;font-weight:900;padding:3px 11px;border-radius:999px;white-space:nowrap">★ ${isAr() ? 'متجر مميز' : 'Featured'}</span>` : '';
    const logoImg = (d, size, st) => `<img src="${esc(d.logo || fb(d.name))}" onerror="this.src='${fb(d.name)}'" alt="" style="width:${size}px;height:${size}px;object-fit:cover;background:#fff;flex-shrink:0;${st || ''}">`;
    const metaRow = (d) => `<span>📍 ${esc(d.loc || '—')}</span><span>📦 ${d.count} ${isAr() ? 'منتج/خدمة' : 'listings'}</span><span>${stars(d)}</span>`;
    // Cover / hero picture: the store cover, else the top product image, else a decorative block.
    const heroSrc = (d) => d.banner || (d.hero && d.hero.image) || '';
    const heroPic = (d, st, fallbackBg) => heroSrc(d)
        ? `<img src="${esc(heroSrc(d))}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;${st || ''}">`
        : `<div style="width:100%;height:100%;min-height:150px;display:flex;align-items:center;justify-content:center;background:${fallbackBg || d.color + '33'}">${logoImg(d, 96, 'border-radius:24px')}</div>`;
    const cta = (label, st) => `<button type="button" onclick="${toGrid}" style="cursor:pointer;${st}">${label}</button>`;
    const shopLbl = () => isAr() ? 'تسوّق المنتجات' : 'Shop now';
    const pol = (d, box, ink, sub) => (d.shippingPolicy || d.returnPolicy) ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;margin-top:14px">
        ${d.shippingPolicy ? `<div style="${box}"><p style="font-size:11px;font-weight:900;color:${sub};margin-bottom:3px">🚚 ${isAr() ? 'سياسة الشحن' : 'Shipping policy'}</p><p style="font-size:13px;color:${ink}">${esc(d.shippingPolicy)}</p></div>` : ''}
        ${d.returnPolicy ? `<div style="${box}"><p style="font-size:11px;font-weight:900;color:${sub};margin-bottom:3px">↩ ${isAr() ? 'سياسة الاسترجاع' : 'Return policy'}</p><p style="font-size:13px;color:${ink}">${esc(d.returnPolicy)}</p></div>` : ''}</div>` : '';
    const priceFmt = (v) => (window.formatCurrency ? window.formatCurrency(v) : v);

    // Dark-theme card recipe: the site card turns dark and its text turns light; price keeps the accent.
    const darkCards = (cls, bg, border, ink, c, extra) => `
        .${cls} #storeThemeBack, .${cls} > button:first-child{color:${ink}!important}
        .${cls} .service-card{background:${bg};border:1px solid ${border};color:${ink};${extra || ''}}
        .${cls} .service-card .p-4, .${cls} .service-card .p-4 *{color:${ink}!important;border-color:${border}!important}
        .${cls} .service-card [data-price-egp]{color:${c}!important}
        .${cls} #storeProductsEmpty{color:${ink}}`;

    const defs = [
        // ── 1. Modern minimal (fashion) ──────────────────────────────────────
        { id: 'modern', ar: 'عصري هادئ', en: 'Modern Minimal', accent: '#1c1917', fonts: '',
          suit: { ar: 'الملابس، الإكسسوارات، النظارات والمنتجات الجلدية', en: 'Fashion, accessories, leather goods' },
          css: (c) => `.st-t-modern{background:#fff;border-radius:18px;padding:18px}
            .st-t-modern .service-card{border:0;border-radius:6px;box-shadow:none;background:transparent}
            .st-t-modern .service-card img{border-radius:6px;height:15rem!important}
            .st-t-modern .service-card .p-4{padding:12px 2px!important}
            .st-t-modern .service-card:hover{box-shadow:none}`,
          header: (d) => `<div style="background:#fff;border-bottom:1px solid #f5f5f4;padding:16px 8px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
              <span style="display:flex;align-items:center;gap:10px">${logoImg(d, 34, 'border-radius:50%')}<b style="font-size:22px;letter-spacing:.18em;text-transform:uppercase;color:#1c1917">${esc(d.name)}</b></span>
              <span style="font-size:12px;color:#78716c;display:flex;gap:16px;flex-wrap:wrap">${metaRow(d)}</span></div>
            ${d.announcement ? `<div style="background:#1c1917;color:#fff;text-align:center;font-size:12px;letter-spacing:.06em;padding:8px">${esc(d.announcement)}</div>` : ''}
            <div style="background:#fafaf9;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:28px;padding:34px 28px;margin:14px 0 6px">
              <div style="max-width:420px"><span style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#78716c">${esc(d.tagline || (isAr() ? 'مجموعتنا' : 'Our collection'))}</span>
                <h2 style="font-size:32px;font-weight:200;line-height:1.25;color:#1c1917;margin:10px 0 12px">${esc(d.name)}</h2>
                <p style="font-size:13px;color:#57534e;line-height:1.8;margin-bottom:18px">${esc(d.desc || '')}</p>
                ${cta(shopLbl(), `background:${d.color};color:#fff;border:0;padding:11px 26px;font-size:12px;letter-spacing:.12em;text-transform:uppercase`)}</div>
              <div style="flex:1;min-width:240px;max-width:520px;aspect-ratio:16/9;border-radius:8px;overflow:hidden;background:#e7e5e4">${heroPic(d)}</div></div>
            ${pol(d, 'border:1px solid #e7e5e4;padding:12px;border-radius:6px', '#57534e', '#78716c')}` },

        // ── 2. Neon gaming ───────────────────────────────────────────────────
        { id: 'neon', ar: 'نيون (جيمنج)', en: 'Neon Gaming', accent: '#00f0ff', fonts: FONT('Changa:wght@400;600;800'),
          suit: { ar: 'أدوات القيمنج، ملابس الشارع، المنتجات المبتكرة', en: 'Gaming gear, streetwear, gadgets' },
          css: (c) => `.st-t-neon{background:#0a0c10;border-radius:18px;padding:0 16px 18px;font-family:'Changa','Cairo',sans-serif;overflow:hidden}
            @keyframes stMarq{0%{transform:translateX(0)}100%{transform:translateX(50%)}}
            ${darkCards('st-t-neon', '#161b22', '#1f2937', '#e5e7eb', c, 'border-radius:4px;transition:border-color .2s,box-shadow .2s')}
            .st-t-neon .service-card:hover{border-color:${c};box-shadow:0 0 18px ${c}66}`,
          header: (d) => { const t = d.announcement || d.tagline || d.name; return `
            <div style="background:#ff0055;color:#000;font-weight:900;font-size:12px;padding:6px 0;overflow:hidden;white-space:nowrap;margin:0 -16px"><div style="display:inline-block;animation:stMarq 22s linear infinite;letter-spacing:.12em">${[1, 2, 3, 4, 5, 6].map(() => `⚡ ${esc(t)} ⚡ `).join('')}</div></div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:16px 0;border-bottom:1px solid #161b22">
              <span style="display:flex;align-items:center;gap:10px">${logoImg(d, 40, `border-radius:6px;border:1px solid ${d.color}`)}<b style="font-size:24px;font-weight:900;font-style:italic;letter-spacing:.06em;color:${d.color}">${esc(d.name)}</b> ${featBadge(d, 'background:#ffe600;color:#000')}</span>
              ${cta(`${shopLbl()} ⚡`, `background:#ff0055;color:#000;border:0;font-weight:900;padding:9px 18px;font-size:12px`)}</div>
            <div style="background:linear-gradient(90deg,#0a0c10,#161b22,#0a0c10);display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:24px;padding:30px 4px">
              <div style="max-width:430px"><span style="background:#ffe600;color:#000;font-size:10px;font-weight:900;padding:2px 8px;letter-spacing:.1em">${esc(d.loc || 'ONLINE')}</span>
                <h2 style="font-size:36px;font-weight:900;margin:10px 0 8px;line-height:1.2;background:linear-gradient(90deg,${d.color},#fff,#ff0055);-webkit-background-clip:text;background-clip:text;color:transparent">${esc(d.tagline || d.name)}</h2>
                <p style="color:#cbd5e1;font-size:13px;line-height:1.7;margin-bottom:12px">${esc(d.desc || '')}</p>
                <p style="color:#94a3b8;font-size:12px;display:flex;gap:14px;flex-wrap:wrap">${metaRow(d)}</p></div>
              <div style="flex:1;min-width:240px;max-width:480px;aspect-ratio:16/9;border:1px solid ${d.color};border-radius:4px;overflow:hidden;background:#000;box-shadow:0 0 22px ${d.color}55">${heroPic(d, '', '#000')}</div></div>
            ${pol(d, 'background:#161b22;border:1px solid #1f2937;padding:12px', '#cbd5e1', '#94a3b8')}`; } },

        // ── 3. Royal luxury ──────────────────────────────────────────────────
        { id: 'royal', ar: 'ملكي فاخر', en: 'Royal Luxury', accent: '#d4af37', fonts: FONT('Amiri:wght@400;700'),
          suit: { ar: 'الساعات، العطور النادرة، المجوهرات، السلع عالية القيمة', en: 'Watches, fragrances, jewellery' },
          css: (c) => `.st-t-royal{background:#08080a;border-radius:6px;padding:0 22px 22px;font-family:'Amiri','Cairo',serif}
            ${darkCards('st-t-royal', '#121216', c + '33', '#e7e5e4', c, 'border-radius:0;text-align:center')}
            .st-t-royal .service-card:hover{border-color:${c}99}`,
          header: (d) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:22px 0;border-bottom:1px solid ${d.color}33">
              <span style="font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#a8a29e;font-family:Cairo,sans-serif">${esc(d.loc || '')}</span>
              <h1 style="font-size:28px;font-weight:700;letter-spacing:.2em;color:${d.color};text-transform:uppercase;display:flex;align-items:center;gap:12px">${logoImg(d, 38, `border-radius:50%;border:1px solid ${d.color}`)}${esc(d.name)}</h1>
              ${cta(isAr() ? 'اطلب الخاصة' : 'Enquire', `border:1px solid ${d.color};color:${d.color};background:transparent;padding:6px 16px;font-size:12px;font-family:Cairo,sans-serif`)}</div>
            ${d.announcement ? `<p style="text-align:center;color:${d.color};font-size:14px;letter-spacing:.12em;padding:10px 0;border-bottom:1px solid ${d.color}22">✦ ${esc(d.announcement)} ✦</p>` : ''}
            <div style="background:linear-gradient(90deg,#08080a,#121216 60%,transparent);display:flex;flex-wrap:wrap;align-items:center;gap:28px;padding:42px 4px">
              <div style="max-width:430px;flex:1;min-width:240px"><span style="font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:${d.color};font-family:Cairo,sans-serif">${esc(d.tagline || (isAr() ? 'الإصدار الملكي' : 'The Collection'))}</span>
                <h2 style="font-size:36px;font-weight:400;color:#f5f5f4;line-height:1.3;margin:12px 0">${esc(d.desc ? d.desc.split(/[.!؟\n]/)[0] : d.name)}</h2>
                <p style="color:#a8a29e;font-size:13px;margin-bottom:14px;font-family:Cairo,sans-serif;display:flex;gap:14px;flex-wrap:wrap">${metaRow(d)}</p>
                ${featBadge(d, `background:${d.color};color:#000`)}</div>
              <div style="flex:1;min-width:240px;max-width:460px;aspect-ratio:4/3;border:1px solid ${d.color}55;padding:8px;background:#121216">${heroPic(d, '', '#121216')}</div></div>
            ${pol(d, `background:#121216;border:1px solid ${d.color}22;padding:12px`, '#d6d3d1', '#a8a29e')}` },

        // ── 4. Marketplace (big catalogue) ───────────────────────────────────
        { id: 'market', ar: 'سوق كبير', en: 'Marketplace', accent: '#2563eb', fonts: FONT('Tajawal:wght@400;700;900'),
          suit: { ar: 'السوبرماركت، الإلكترونيات، المتاجر العامة (كتالوج كبير)', en: 'Large catalogues, electronics, general stores' },
          css: (c) => `.st-t-market{background:#f1f5f9;border-radius:14px;padding:0 0 16px;font-family:'Tajawal','Cairo',sans-serif;overflow:hidden}
            .st-t-market > *:not(button){margin-inline:14px}
            .st-t-market > button:first-child{margin:12px 14px 0}
            .st-t-market .st-top{margin-inline:-14px}
            .st-t-market #storeProductsGrid{margin-inline:14px}
            .st-t-market .service-card{border:1px solid #e2e8f0;border-radius:6px;box-shadow:none;background:#fff}
            .st-t-market .service-card img{height:9.5rem!important}
            .st-t-market .service-card .p-4{padding:10px!important}
            .st-t-market .service-card:hover{border-color:${c}}`,
          header: (d) => `<div class="st-top" style="background:${d.color};color:#fff;padding:12px 18px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px">
              <span style="display:flex;align-items:center;gap:10px">${logoImg(d, 36, 'border-radius:6px')}<b style="font-size:20px;font-weight:900">${esc(d.name)}</b> ${featBadge(d)}</span>
              <div style="flex:1;min-width:220px;max-width:520px;display:flex;background:#fff;border-radius:6px;overflow:hidden;border:1px solid #ffffff55">
                <input id="stSearch" oninput="StoresManager.filterItems(this.value)" placeholder="${isAr() ? 'ابحث في منتجات المتجر...' : 'Search this store...'}" style="flex:1;padding:8px 12px;font-size:13px;color:#111;outline:none;border:0">
                <span style="background:#00000033;color:#fff;padding:8px 16px;font-weight:700;font-size:12px">${isAr() ? 'بحث' : 'Search'}</span></div>
              <span style="font-size:12px;font-weight:700">🚚 ${esc(d.shippingPolicy ? d.shippingPolicy.slice(0, 40) : (isAr() ? 'شحن لكل المحافظات' : 'Delivery available'))}</span></div>
            <div style="background:#dc2626;color:#fff;border-radius:8px;padding:11px 14px;margin-top:14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
              <span style="font-weight:800;font-size:14px">⚡ ${esc(d.announcement || d.tagline || (isAr() ? 'عروض وتخفيضات المتجر' : 'Store deals'))}</span>
              <span style="background:#00000040;padding:3px 12px;border-radius:6px;font-size:12px;font-weight:800">${d.count} ${isAr() ? 'منتج متاح' : 'items'}</span></div>
            ${d.desc ? `<p style="font-size:13px;color:#475569;margin-bottom:6px">${esc(d.desc)}</p>` : ''}
            <p style="font-size:12px;color:#64748b;display:flex;gap:14px;flex-wrap:wrap;margin-bottom:6px">${metaRow(d)}</p>
            ${pol(d, 'background:#fff;border:1px solid #e2e8f0;padding:10px;border-radius:6px', '#475569', '#64748b')}<div style="height:12px"></div>` },

        // ── 5. Single-product hero ───────────────────────────────────────────
        { id: 'hero', ar: 'منتج بطل', en: 'Hero Product', accent: '#10b981', fonts: '',
          suit: { ar: 'الأجهزة المبتكرة، المكملات، منتجات التجميل التخصصية', en: 'Gadgets, supplements, specialty beauty' },
          css: (c) => `.st-t-hero{background:#0f172a;border-radius:18px;padding:0 18px 18px}
            ${darkCards('st-t-hero', '#1e293b', '#334155', '#e2e8f0', c, 'border-radius:14px')}
            .st-t-hero .service-card:hover{border-color:${c}}`,
          header: (d) => { const h = d.hero; return `
            <div style="background:#020617;margin:0 -18px;padding:12px 22px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid #1e293b">
              <span style="display:flex;align-items:center;gap:10px;font-weight:800;color:${d.color};letter-spacing:.08em">${logoImg(d, 30, 'border-radius:8px')}${esc(d.name)}</span>
              ${h ? `<button type="button" onclick="ServicesManager.openServiceDetail('${esc(h.id)}')" style="background:${d.color};color:#020617;font-weight:900;border:0;border-radius:10px;padding:7px 16px;font-size:12px;cursor:pointer">${isAr() ? 'اطلب الآن — ' : 'Order — '}${priceFmt(h.price)}</button>` : cta(shopLbl(), `background:${d.color};color:#020617;font-weight:900;border:0;border-radius:10px;padding:7px 16px;font-size:12px`)}</div>
            <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:26px;padding:34px 4px">
              <div style="max-width:470px;flex:1;min-width:250px"><span style="background:${d.color}22;color:${d.color};border:1px solid ${d.color}66;font-size:11px;font-weight:800;padding:4px 12px;border-radius:999px;display:inline-block;margin-bottom:12px">⭐ ${esc(d.tagline || (isAr() ? 'منتجنا الأفضل' : 'Our best seller'))}</span>
                <h2 style="font-size:34px;font-weight:800;color:#fff;line-height:1.25;margin-bottom:12px">${esc(h ? h.title : d.name)}</h2>
                <p style="color:#94a3b8;font-size:13px;line-height:1.8;margin-bottom:16px">${esc(d.desc || '')}</p>
                ${h ? `<div style="background:#1e293b;border:1px solid #334155;border-radius:14px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:14px">
                  <div><p style="font-size:11px;color:#94a3b8">${isAr() ? 'السعر' : 'Price'}</p><p style="font-size:24px;font-weight:900;color:${d.color}">${priceFmt(h.price)}</p></div>
                  <button type="button" onclick="ServicesManager.openServiceDetail('${esc(h.id)}')" style="background:${d.color};color:#020617;font-weight:800;border:0;border-radius:10px;padding:10px 22px;font-size:13px;cursor:pointer">${isAr() ? 'شوف التفاصيل واطلب' : 'View & order'}</button></div>` : ''}
                <p style="color:#64748b;font-size:12px;display:flex;gap:14px;flex-wrap:wrap;margin-top:14px">${metaRow(d)}</p></div>
              <div style="flex:1;min-width:240px;max-width:400px;aspect-ratio:1;background:#1e293b;border:1px solid #334155;border-radius:20px;padding:12px">${heroPic(d, 'border-radius:12px', '#1e293b')}</div></div>
            ${pol(d, 'background:#1e293b;border:1px solid #334155;padding:12px;border-radius:12px', '#cbd5e1', '#94a3b8')}
            ${d.count > 1 ? `<h3 style="color:#e2e8f0;font-weight:800;font-size:15px;margin:22px 0 4px">${isAr() ? 'منتجات أخرى من المتجر' : 'More from this store'}</h3>` : ''}` ; } },

        // ── 6. Organic / eco ─────────────────────────────────────────────────
        { id: 'organic', ar: 'طبيعي عضوي', en: 'Organic & Eco', accent: '#5b7e5f', fonts: '',
          suit: { ar: 'مستحضرات التجميل العضوية، العناية بالبشرة، الأغذية الصحية', en: 'Organic beauty, skincare, healthy food' },
          css: (c) => `.st-t-organic{background:#f7f5f0;border-radius:24px;padding:0 0 18px;overflow:hidden}
            .st-t-organic > *:not(button){margin-inline:18px}
            .st-t-organic > button:first-child{margin:12px 18px 0}
            .st-t-organic .st-top{margin-inline:-18px}
            .st-t-organic #storeProductsGrid{margin-inline:18px}
            .st-t-organic .service-card{background:#fff;border:1px solid #e8e2d5;border-radius:22px;box-shadow:none}
            .st-t-organic .service-card img{border-radius:18px}
            .st-t-organic .service-card:hover{border-color:${c};box-shadow:0 8px 22px ${c}22}`,
          header: (d) => `<div class="st-top" style="background:#ffffff99;border-bottom:1px solid #e8e2d5;padding:14px 22px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
              <span style="display:flex;align-items:center;gap:10px;font-size:22px;font-weight:700;color:#233327">${logoImg(d, 38, 'border-radius:50%')}${esc(d.name)}</span>
              ${cta(isAr() ? 'تسوّق المنتجات العضوية' : 'Shop organic', `background:#233327;color:#f7f5f0;border:0;border-radius:999px;padding:8px 18px;font-size:12px;font-weight:700`)}</div>
            ${d.announcement ? `<p style="text-align:center;background:${d.color}22;color:#233327;border-radius:999px;padding:8px;font-size:13px;font-weight:700;margin-top:14px">🌿 ${esc(d.announcement)}</p>` : ''}
            <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:26px;padding:26px 4px">
              <div style="max-width:430px;flex:1;min-width:240px"><span style="font-size:13px;color:${d.color};font-weight:800">🌿 ${esc(d.tagline || (isAr() ? 'طبيعي ١٠٠٪' : '100% natural'))}</span>
                <h2 style="font-size:32px;font-weight:700;color:#233327;line-height:1.3;margin:6px 0 10px">${esc(d.name)}</h2>
                <p style="color:#57534e;font-size:13px;line-height:1.8;margin-bottom:14px">${esc(d.desc || '')}</p>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">${['🌱 ' + (isAr() ? 'طبيعي' : 'Natural'), '♻️ ' + (isAr() ? 'مستدام' : 'Sustainable'), '🤍 ' + (isAr() ? 'بحب' : 'Made with care')].map(t => `<span style="background:#fff;border:1px solid #e8e2d5;border-radius:999px;padding:4px 12px;font-size:11px;font-weight:700;color:#233327">${t}</span>`).join('')}</div>
                <p style="color:#78716c;font-size:12px;display:flex;gap:14px;flex-wrap:wrap">${metaRow(d)}</p></div>
              <div style="flex:1;min-width:230px;max-width:360px;aspect-ratio:1;border-radius:28px;overflow:hidden;border:5px solid #fff;box-shadow:0 8px 24px #0001">${heroPic(d, '', '#e8e2d5')}</div></div>
            ${pol(d, 'background:#fff;border:1px solid #e8e2d5;padding:12px;border-radius:18px', '#44403c', '#78716c')}<div style="height:14px"></div>` },

        // ── 7. Vintage ───────────────────────────────────────────────────────
        { id: 'vintage', ar: 'فينتج كلاسيكي', en: 'Vintage Classic', accent: '#8c3b2b', fonts: FONT('Amiri:wght@400;700'),
          suit: { ar: 'المنتجات اليدوية، أدوات الكتابة، المقتنيات الكلاسيكية', en: 'Handmade goods, stationery, collectibles' },
          css: (c) => `.st-t-vintage{background:#fbf8f1;border-radius:6px;padding:0 0 18px;font-family:'Amiri','Cairo',serif;overflow:hidden}
            .st-t-vintage > *:not(button){margin-inline:18px}
            .st-t-vintage > button:first-child{margin:12px 18px 0}
            .st-t-vintage .st-top{margin-inline:-18px}
            .st-t-vintage #storeProductsGrid{margin-inline:18px}
            .st-t-vintage .service-card{background:#f4eedb;border:1px solid ${c}44;border-radius:2px;box-shadow:none}
            .st-t-vintage .service-card:hover{border-color:${c}}`,
          header: (d) => `<div class="st-top" style="background:${d.color};color:#f4eedb;text-align:center;font-size:12px;padding:6px 14px;letter-spacing:.12em;font-family:Cairo,sans-serif">⚜️ ${esc(d.announcement || d.tagline || (isAr() ? 'صناعة أصيلة بشغف كلاسيكي' : 'Authentic craft'))}</div>
            <div class="st-top" style="background:#f4eedb80;border-bottom:1px solid ${d.color}33;padding:18px 24px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
              <span style="display:flex;align-items:center;gap:12px;font-size:26px;font-weight:700;letter-spacing:.14em;color:${d.color}">${logoImg(d, 42, `border-radius:2px;border:2px solid ${d.color}`)}${esc(d.name).toUpperCase()}</span>
              ${cta(isAr() ? 'تسوّق المقتنيات' : 'Shop the collection', `background:${d.color};color:#fff;border:0;padding:8px 18px;font-size:12px;font-family:Cairo,sans-serif`)}</div>
            <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:26px;padding:28px 4px">
              <div style="max-width:430px;flex:1;min-width:240px"><span style="font-size:12px;color:${d.color};letter-spacing:.2em;font-family:Cairo,sans-serif">${esc(d.loc || '')} ${featBadge(d, `background:${d.color};color:#fff`)}</span>
                <h2 style="font-size:34px;font-weight:700;color:#2b261f;line-height:1.3;margin:10px 0">${esc(d.tagline || d.name)}</h2>
                <p style="color:#44403c;font-size:14px;line-height:1.9;margin-bottom:14px;font-family:Cairo,sans-serif">${esc(d.desc || '')}</p>
                <p style="color:#78716c;font-size:12px;display:flex;gap:14px;flex-wrap:wrap;font-family:Cairo,sans-serif">${metaRow(d)}</p></div>
              <div style="flex:1;min-width:240px;max-width:460px;aspect-ratio:16/9;border:1px solid ${d.color}55;padding:6px;background:#f4eedb">${heroPic(d, '', '#e7ddc2')}</div></div>
            ${pol(d, `background:#f4eedb;border:1px solid ${d.color}33;padding:12px`, '#44403c', '#78716c')}<div style="height:14px"></div>` },

        // ── 8. Cyber HUD ─────────────────────────────────────────────────────
        { id: 'hud', ar: 'سايبر HUD', en: 'Cyber HUD', accent: '#22d3ee', fonts: FONT('Courier+Prime:wght@400;700'),
          suit: { ar: 'نظارات VR، أجهزة الذكاء الاصطناعي، المعدات التقنية', en: 'VR, AI devices, advanced tech' },
          css: (c) => `.st-t-hud{background:#020617;border-radius:6px;padding:0 16px 18px;font-family:'Courier Prime','Cairo',monospace;border:1px solid ${c}55}
            ${darkCards('st-t-hud', '#0b1324', c + '44', c, c, 'border-radius:0')}
            .st-t-hud .service-card .p-4 *{color:#a5f3fc!important}
            .st-t-hud .service-card:hover{box-shadow:0 0 16px ${c}66,inset 0 0 12px ${c}22}
            @keyframes stBlink{0%,100%{opacity:1}50%{opacity:.3}}`,
          header: (d) => `<div style="background:#083344cc;border-bottom:1px solid ${d.color}55;margin:0 -16px;padding:7px 18px;display:flex;justify-content:space-between;align-items:center;font-size:12px;color:${d.color}">
              <span>SYSTEM status: ONLINE // STORE_${String(d.count).padStart(3, '0')}</span><span style="font-weight:700;animation:stBlink 1.4s infinite">● ${d.rev ? 'RATING ' + d.avg.toFixed(1) + ' / 5' : 'NEW_NODE'}</span></div>
            <div style="padding:16px 0;border-bottom:1px solid ${d.color}33;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
              <span style="display:flex;align-items:center;gap:10px;font-size:22px;font-weight:700;letter-spacing:.14em;color:#fff">${logoImg(d, 36, `border:1px solid ${d.color}`)}[${esc(d.name).toUpperCase()}]</span>
              ${cta('VIEW_ITEMS()', `background:${d.color};color:#020617;border:0;font-weight:700;padding:8px 18px;font-size:12px;font-family:inherit`)}</div>
            <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:24px;padding:28px 2px">
              <div style="max-width:440px;flex:1;min-width:240px"><span style="font-size:12px;color:${d.color};display:block;margin-bottom:6px">&gt; ${esc(d.announcement || 'INITIALIZING STORE_INTERFACE')}</span>
                <h2 style="font-size:30px;font-weight:700;color:#fff;letter-spacing:.06em;line-height:1.3;margin-bottom:10px">${esc(d.tagline || d.name)}</h2>
                <p style="color:#94a3b8;font-size:13px;line-height:1.8;margin-bottom:12px;font-family:Cairo,sans-serif">${esc(d.desc || '')}</p>
                <p style="color:${d.color};font-size:12px;display:flex;gap:14px;flex-wrap:wrap">${metaRow(d)}</p></div>
              <div style="flex:1;min-width:240px;max-width:460px;aspect-ratio:16/9;border:1px solid ${d.color}77;padding:6px;background:#020617;box-shadow:0 0 18px ${d.color}33">${heroPic(d, '', '#020617')}</div></div>
            ${pol(d, `background:#0b1324;border:1px solid ${d.color}33;padding:12px`, '#a5f3fc', d.color)}` },

        // ── 9. Kids & toys ───────────────────────────────────────────────────
        { id: 'kids', ar: 'مرح للأطفال', en: 'Playful Kids', accent: '#ff70a6', fonts: FONT('Fredoka:wght@400;600;700'),
          suit: { ar: 'ألعاب الأطفال، مستلزمات المواليد، الملابس الملونة', en: 'Toys, baby gear, colourful clothes' },
          css: (c) => `.st-t-kids{background:#fff9fe;border-radius:30px;padding:0 0 18px;border:4px solid ${c};font-family:'Fredoka','Cairo',sans-serif;overflow:hidden}
            .st-t-kids > *:not(button){margin-inline:16px}
            .st-t-kids > button:first-child{margin:12px 16px 0}
            .st-t-kids .st-top{margin-inline:-16px}
            .st-t-kids #storeProductsGrid{margin-inline:16px}
            .st-t-kids .service-card{border:3px solid #70d6ff;border-radius:26px;box-shadow:0 6px 0 #ff9770;background:#fff;transition:transform .2s}
            .st-t-kids .service-card:hover{transform:translateY(-5px) rotate(-.8deg)}`,
          header: (d) => `<div class="st-top" style="background:#ffffffcc;border-bottom:3px solid #70d6ff;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
              <span style="display:flex;align-items:center;gap:10px;font-size:26px;font-weight:900;color:${d.color}">${logoImg(d, 42, 'border-radius:50%;border:3px solid #70d6ff')}${esc(d.name)} <span style="font-size:22px">🎈</span></span>
              ${cta((isAr() ? 'تسوّق الألعاب' : 'Shop toys') + ' 🧸', `background:${d.color};color:#fff;border:0;border-radius:999px;padding:9px 20px;font-size:13px;font-weight:700;box-shadow:0 4px 0 #0002`)}</div>
            <div style="background:linear-gradient(90deg,#fce7f3,#fffbeb,#dbeafe);border-radius:26px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:22px;padding:26px 24px;margin-top:14px;margin-bottom:6px">
              <div style="max-width:420px;flex:1;min-width:240px"><span style="background:#ff9770;color:#1e293b;font-size:12px;font-weight:700;padding:4px 14px;border-radius:999px;display:inline-block;margin-bottom:10px">${esc(d.tagline || (isAr() ? 'عالم من المرح' : 'A world of fun'))} 🎉</span>
                <h2 style="font-size:32px;font-weight:900;color:#1e293b;line-height:1.25;margin-bottom:10px">${esc(d.name)}</h2>
                <p style="color:#475569;font-size:13px;line-height:1.8;margin-bottom:12px;font-family:Cairo,sans-serif">${esc(d.desc || '')}</p>
                <p style="color:#64748b;font-size:12px;display:flex;gap:12px;flex-wrap:wrap;font-family:Cairo,sans-serif">${metaRow(d)}</p>
                <div style="margin-top:8px">${featBadge(d)}</div></div>
              <div style="flex:1;min-width:220px;max-width:340px;aspect-ratio:1;background:#fff;border:4px solid #ff9770;border-radius:28px;padding:10px;box-shadow:0 8px 0 #0001">${heroPic(d, 'border-radius:18px', '#fff')}</div></div>
            ${d.announcement ? `<p style="text-align:center;background:#70d6ff;color:#0c4a6e;border-radius:999px;padding:8px;font-size:13px;font-weight:700;margin-top:10px">🎁 ${esc(d.announcement)}</p>` : ''}
            ${pol(d, 'background:#fff;border:3px dashed #70d6ff;padding:12px;border-radius:20px', '#475569', '#0ea5e9')}<div style="height:10px"></div>` },

        // ── 10. Sport / fitness ──────────────────────────────────────────────
        { id: 'sport', ar: 'رياضة ولياقة', en: 'Sport & Fitness', accent: '#ff2a2a', fonts: '',
          suit: { ar: 'الأحذية الرياضية، المكملات الغذائية، المعدات الرياضية', en: 'Sneakers, supplements, gym gear' },
          css: (c) => `.st-t-sport{background:#0d0e12;border-radius:14px;padding:0 16px 18px;border:1px solid ${c}55}
            ${darkCards('st-t-sport', '#181a20', '#2a2e39', '#f1f5f9', c, 'border-radius:4px;clip-path:polygon(0 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%)')}
            .st-t-sport .service-card:hover{border-color:${c}}`,
          header: (d) => `<div style="background:#181a20;margin:0 -16px;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;border-bottom:1px solid #1e293b">
              <span style="display:flex;align-items:center;gap:10px;font-size:26px;font-weight:900;font-style:italic;letter-spacing:.06em;color:${d.color};text-transform:uppercase">${logoImg(d, 38, 'border-radius:4px')}${esc(d.name)}</span>
              ${cta('GET FIT NOW ⚡', `background:${d.color};color:#fff;border:0;font-weight:900;font-style:italic;padding:9px 20px;font-size:12px`)}</div>
            ${d.announcement ? `<div style="background:${d.color};color:#fff;font-weight:900;font-style:italic;text-align:center;font-size:13px;padding:6px;margin:0 -16px;transform:skewX(-6deg)">${esc(d.announcement)}</div>` : ''}
            <div style="background:linear-gradient(90deg,#0d0e12,#181a20,#0d0e12);display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:24px;padding:30px 2px">
              <div style="max-width:440px;flex:1;min-width:240px"><span style="color:${d.color};font-weight:900;font-size:12px;letter-spacing:.2em;text-transform:uppercase">${esc(d.loc || 'PRO GEAR')}</span>
                <h2 style="font-size:36px;font-weight:900;font-style:italic;color:#fff;text-transform:uppercase;line-height:1.15;margin:8px 0 10px">${esc(d.tagline || d.name)}</h2>
                <p style="color:#94a3b8;font-size:13px;line-height:1.8;margin-bottom:14px">${esc(d.desc || '')}</p>
                <p style="color:#cbd5e1;font-size:12px;display:flex;gap:14px;flex-wrap:wrap;font-weight:700">${metaRow(d)}</p></div>
              <div style="flex:1;min-width:240px;max-width:470px;aspect-ratio:16/9;background:#181a20;border:1px solid #1e293b;overflow:hidden;transform:skewX(-4deg)">${heroPic(d, 'transform:skewX(4deg) scale(1.1)', '#181a20')}</div></div>
            ${pol(d, `background:#181a20;border-inline-start:4px solid ${d.color};padding:12px`, '#cbd5e1', '#94a3b8')}` },

        // ── 11. OLED studio ──────────────────────────────────────────────────
        { id: 'oled', ar: 'أوليد استوديو', en: 'OLED Studio', accent: '#ffffff', fonts: '',
          suit: { ar: 'الصوتيات الاحترافية، الكاميرات، معدات الاستوديو', en: 'Pro audio, cameras, studio gear' },
          css: (c) => `.st-t-oled{background:#000;border-radius:18px;padding:0 20px 20px;border:1px solid #1f1f1f}
            ${darkCards('st-t-oled', '#000', '#262626', '#e5e5e5', c, 'border-radius:16px')}
            .st-t-oled .service-card:hover{border-color:${c === '#ffffff' ? '#ffffff' : c}}`,
          header: (d) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:22px 0;border-bottom:1px solid #171717">
              <span style="display:flex;align-items:center;gap:12px;font-size:20px;font-weight:300;letter-spacing:.22em;text-transform:uppercase;color:#fff">${logoImg(d, 32, 'border-radius:50%;border:1px solid #333')}${esc(d.name)}</span>
              ${cta(shopLbl(), `background:#fff;color:#000;border:0;border-radius:999px;padding:8px 18px;font-size:12px;font-weight:700`)}</div>
            <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:28px;padding:40px 2px">
              <div style="max-width:430px;flex:1;min-width:240px"><span style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#737373;font-family:monospace">${esc(d.tagline || d.loc || '')}</span>
                <h2 style="font-size:34px;font-weight:200;color:#fff;line-height:1.3;margin:10px 0 14px">${esc(d.desc ? d.desc.split(/[.!؟\n]/)[0] : d.name)}</h2>
                <p style="color:#a3a3a3;font-size:12px;display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px">${metaRow(d)}</p>
                ${d.announcement ? `<p style="border:1px solid #404040;color:#e5e5e5;border-radius:999px;display:inline-block;padding:6px 16px;font-size:12px">${esc(d.announcement)}</p>` : ''}
                <div style="margin-top:10px">${featBadge(d, 'background:#fff;color:#000')}</div></div>
              <div style="flex:1;min-width:240px;max-width:470px;aspect-ratio:16/9;background:#0a0a0a;border:1px solid #171717;border-radius:18px;overflow:hidden">${heroPic(d, '', '#0a0a0a')}</div></div>
            ${pol(d, 'background:#0a0a0a;border:1px solid #1f1f1f;padding:12px;border-radius:14px', '#d4d4d4', '#737373')}` },

        // ── 12. Editorial magazine ───────────────────────────────────────────
        { id: 'magazine', ar: 'مجلة ولوك بوك', en: 'Editorial Magazine', accent: '#1c1917', fonts: FONT('Playfair+Display:ital,wght@0,600;0,800;1,400'),
          suit: { ar: 'دور الأزياء، المجموعات الموسمية، عروض اللوك بوك', en: 'Fashion houses, seasonal lookbooks' },
          css: (c) => `.st-t-magazine{background:#f5f5f4;border-radius:6px;padding:0 20px 22px;font-family:'Playfair Display','Cairo',serif}
            .st-t-magazine .service-card{background:transparent;border:0;border-radius:0;box-shadow:none;border-top:2px solid #1c1917}
            .st-t-magazine .service-card img{height:17rem!important}
            .st-t-magazine #storeProductsGrid > :first-child{grid-column:span 2}
            .st-t-magazine #storeProductsGrid > :first-child img{height:21rem!important}
            .st-t-magazine .service-card:hover{box-shadow:none}`,
          header: (d) => { const issue = new Date().toLocaleDateString(isAr() ? 'ar-EG' : 'en-GB', { month: 'long', year: 'numeric' }); return `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:24px 0;border-bottom:3px double #1c1917">
              <span style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#78716c;font-family:Cairo,sans-serif">${isAr() ? 'عدد' : 'Issue'} · ${esc(issue)}</span>
              <h1 style="font-size:34px;font-weight:800;font-style:italic;letter-spacing:-.01em;color:#1c1917;display:flex;align-items:center;gap:12px">${logoImg(d, 40, 'border-radius:50%')}${esc(d.name)}</h1>
              ${cta(isAr() ? 'تصفّح المجموعة' : 'Shop lookbook', `background:#1c1917;color:#f5f5f4;border:0;padding:8px 18px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-family:Cairo,sans-serif`)}</div>
            ${d.announcement ? `<p style="text-align:center;font-style:italic;color:#44403c;font-size:15px;padding:10px 0;border-bottom:1px solid #d6d3d1">“${esc(d.announcement)}”</p>` : ''}
            <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:28px;padding:30px 2px 26px;font-family:Cairo,sans-serif">
              <div style="max-width:420px;flex:1;min-width:240px"><span style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#78716c;font-weight:700">${esc(d.loc || 'EDITORIAL')}</span>
                <h2 style="font-family:'Playfair Display',serif;font-size:38px;font-style:italic;color:#1c1917;line-height:1.2;margin:10px 0 12px">${esc(d.tagline || d.name)}</h2>
                <p style="color:#57534e;font-size:13px;line-height:1.9;margin-bottom:14px">${esc(d.desc || '')}</p>
                <p style="color:#78716c;font-size:12px;display:flex;gap:14px;flex-wrap:wrap">${metaRow(d)}</p>
                <div style="margin-top:8px">${featBadge(d, 'background:#1c1917;color:#fff')}</div></div>
              <div style="flex:1;min-width:250px;max-width:520px;aspect-ratio:4/3;background:#d6d3d1;overflow:hidden;box-shadow:0 8px 22px #0002">${heroPic(d, '', '#d6d3d1')}</div></div>
            ${pol(d, 'border-top:2px solid #1c1917;padding:12px 0', '#44403c', '#78716c')}`; } },
    ];

    // ── thumbnails for the picker ────────────────────────────────────────────
    const th = (bg, top, mid, cards) => `<div style="background:${bg};padding:6px;border-radius:8px;border:1px solid #0001"><div style="height:7px;background:${top};border-radius:2px"></div><div style="height:22px;background:${mid};border-radius:4px;margin-top:4px"></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-top:5px">${[1, 2, 3].map(() => `<div style="height:16px;${cards}"></div>`).join('')}</div></div>`;
    const thumbs = {
        modern: (c) => th('#fff', '#e7e5e4', '#fafaf9', 'background:#f5f5f4;border-radius:2px'),
        neon: (c) => th('#0a0c10', '#ff0055', 'linear-gradient(90deg,#161b22,' + c + '55)', 'background:#161b22;border:1px solid ' + c + '88'),
        royal: (c) => th('#08080a', c + '55', '#121216', 'background:#121216;border:1px solid ' + c + '55'),
        market: (c) => th('#f1f5f9', c, '#dc2626', 'background:#fff;border:1px solid #e2e8f0;border-radius:2px'),
        hero: (c) => th('#0f172a', '#020617', 'linear-gradient(90deg,#1e293b,' + c + '55)', 'background:#1e293b;border-radius:4px'),
        organic: (c) => th('#f7f5f0', '#fff', c + '55', 'background:#fff;border:1px solid #e8e2d5;border-radius:6px'),
        vintage: (c) => th('#fbf8f1', c, '#f4eedb', 'background:#f4eedb;border:1px solid ' + c + '55'),
        hud: (c) => th('#020617', '#083344', '#0b1324;border:1px solid ' + c + '99', 'background:#0b1324;border:1px solid ' + c + '55'),
        kids: (c) => th('#fff9fe', '#70d6ff', 'linear-gradient(90deg,#fce7f3,#dbeafe)', 'background:#fff;border:2px solid #70d6ff;border-radius:8px'),
        sport: (c) => th('#0d0e12', '#181a20', 'linear-gradient(90deg,#181a20,' + c + '77)', 'background:#181a20;border:1px solid #2a2e39'),
        oled: (c) => th('#000', '#171717', '#0a0a0a;border:1px solid #1f1f1f', 'background:#000;border:1px solid #262626;border-radius:5px'),
        magazine: (c) => th('#f5f5f4', '#1c1917', '#d6d3d1', 'background:transparent;border-top:2px solid #1c1917'),
    };

    defs.forEach(d => TH.register({ id: d.id, ar: d.ar, en: d.en, group: 'pro', accent: d.accent, fonts: d.fonts,
        desc: { ar: d.suit.ar, en: d.suit.en }, css: d.css, header: d.header, thumb: thumbs[d.id] }));
    console.log('✅ StoreThemesPro loaded (+' + defs.length + ' themes)');
})();
