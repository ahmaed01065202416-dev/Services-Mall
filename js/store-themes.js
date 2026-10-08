/**
 * ============================================================================
 * STORE-THEMES.JS — six complete looks for a storefront
 * ----------------------------------------------------------------------------
 * A theme changes the whole store page: header layout, page background, typography and the
 * product-card style (via CSS scoped to  .st-t-<id>  on #page-store). The owner's brand colour
 * (stores/{id}.themeColor) is used as the accent in every theme.
 *
 *   classic   كلاسيك   — cover on top, logo overlapping, white cards
 *   midnight  داكن     — dark page, glowing accent
 *   minimal   بسيط     — no cover, centred, thin lines
 *   bold      جريء     — big colour block, thick outlines, offset shadows
 *   elegant   أنيق     — cream paper, serif type, fine borders
 *   playful   مرح      — soft pastel, blobs, rounded stickers
 * ============================================================================
 */
(function () {
    'use strict';
    const isAr = () => AppState.language !== 'en';
    const esc = (v) => (window.escapeHtml ? window.escapeHtml(v) : String(v == null ? '' : v));
    const fallback = (n) => `https://ui-avatars.com/api/?name=${encodeURIComponent(n || 'S')}&background=0f172a&color=fff&size=128`;

    // d = { name, tagline, logo, banner, color, featured, count, rev, avg, loc, desc, announcement, shippingPolicy, returnPolicy }
    const stars = (d, onDark) => d.rev
        ? `<span style="color:#fbbf24">${'★'.repeat(Math.round(d.avg))}</span><span style="opacity:.3">${'★'.repeat(5 - Math.round(d.avg))}</span> ${d.avg.toFixed(1)} (${d.rev})`
        : `<span style="opacity:.7">${isAr() ? 'جديد — بدون تقييمات' : 'New — no reviews yet'}</span>`;
    const feat = (d) => d.featured ? `<span style="background:linear-gradient(90deg,#f59e0b,#f97316);color:#fff;font-size:11px;font-weight:900;padding:4px 12px;border-radius:999px;white-space:nowrap">★ ${isAr() ? 'متجر مميز' : 'Featured'}</span>` : '';
    const logo = (d, size, extra) => `<img src="${esc(d.logo || fallback(d.name))}" onerror="this.src='${fallback(d.name)}'" style="width:${size}px;height:${size}px;object-fit:cover;background:#fff;${extra || ''}">`;
    const ann = (d, style) => d.announcement ? `<div style="${style}">📣 ${esc(d.announcement)}</div>` : '';
    const policies = (d, box, ink, sub) => (d.shippingPolicy || d.returnPolicy) ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-top:16px">
        ${d.shippingPolicy ? `<div style="${box}"><p style="font-size:12px;font-weight:900;color:${sub};margin-bottom:4px">🚚 ${isAr() ? 'سياسة الشحن' : 'Shipping policy'}</p><p style="font-size:14px;color:${ink}">${esc(d.shippingPolicy)}</p></div>` : ''}
        ${d.returnPolicy ? `<div style="${box}"><p style="font-size:12px;font-weight:900;color:${sub};margin-bottom:4px">↩ ${isAr() ? 'سياسة الاسترجاع' : 'Return policy'}</p><p style="font-size:14px;color:${ink}">${esc(d.returnPolicy)}</p></div>` : ''}</div>` : '';
    const meta = (d, color) => `<span>📍 ${esc(d.loc || '—')}</span><span>${d.count} ${isAr() ? 'منتج/خدمة' : 'listings'}</span><span>${stars(d)}</span>`;

    const THEMES = [
        // ── 1. Classic ───────────────────────────────────────────────────────
        { id: 'classic', ar: 'كلاسيك', en: 'Classic', desc: { ar: 'غلاف كبير وشعار فوقه، بطاقات بيضاء', en: 'Cover, overlapping logo, white cards' },
          css: (c) => `.st-t-classic{background:transparent}`,
          header: (d) => `${ann(d, `background:${d.color};color:#fff;text-align:center;font-weight:800;font-size:14px;padding:10px 16px;border-radius:16px;margin-bottom:12px`)}
            <div style="border-radius:24px;overflow:hidden;border:1px solid ${d.featured ? '#fcd34d' : '#f3f4f6'};background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.08)">
              <div style="height:190px;background:${d.banner ? `url('${esc(d.banner)}') center/cover` : `linear-gradient(135deg,${d.color},${d.color}cc)`}"></div>
              <div style="padding:0 24px 22px;margin-top:-46px;display:flex;flex-wrap:wrap;align-items:flex-end;gap:16px">
                ${logo(d, 96, 'border-radius:24px;border:4px solid #fff;box-shadow:0 8px 20px rgba(0,0,0,.15)')}
                <div style="flex:1;min-width:200px;padding-top:8px"><h1 style="font-size:26px;font-weight:900;color:#111827;display:flex;gap:8px;align-items:center;flex-wrap:wrap">${esc(d.name)} ${feat(d)}</h1>
                  ${d.tagline ? `<p style="font-weight:700;font-size:14px;color:${d.color}">${esc(d.tagline)}</p>` : ''}
                  <p style="font-size:13px;color:#6b7280;display:flex;gap:14px;flex-wrap:wrap;margin-top:4px">${meta(d)}</p></div></div>
              ${d.desc ? `<p style="padding:0 24px 18px;font-size:14px;color:#374151;line-height:1.7">${esc(d.desc)}</p>` : ''}
              ${(d.shippingPolicy || d.returnPolicy) ? `<div style="padding:0 24px 22px">${policies(d, 'background:#f9fafb;border-radius:16px;padding:14px', '#374151', '#6b7280')}</div>` : ''}
            </div>` },

        // ── 2. Midnight (dark) ───────────────────────────────────────────────
        { id: 'midnight', ar: 'داكن', en: 'Midnight', desc: { ar: 'خلفية داكنة وتوهّج بلون متجرك', en: 'Dark page with a glowing accent' },
          css: (c) => `.st-t-midnight{background:radial-gradient(1200px 500px at 50% -10%,${c}33,transparent),#0b1220;border-radius:28px;padding:20px}
            .st-t-midnight .service-card{border:1px solid #1f2a44;box-shadow:0 0 0 1px ${c}22,0 12px 30px rgba(0,0,0,.45);border-radius:18px}
            .st-t-midnight .service-card:hover{box-shadow:0 0 0 1px ${c}88,0 0 28px ${c}55}
            .st-t-midnight #storeProductsEmpty{color:#94a3b8}`,
          header: (d) => `${ann(d, `background:${d.color};color:#fff;text-align:center;font-weight:800;font-size:14px;padding:10px 16px;border-radius:14px;margin-bottom:14px;box-shadow:0 0 24px ${d.color}77`)}
            <div style="position:relative;border-radius:24px;overflow:hidden;border:1px solid #1f2a44;background:#111a2e">
              <div style="height:200px;background:${d.banner ? `linear-gradient(#0b122000,#0b1220cc),url('${esc(d.banner)}') center/cover` : `linear-gradient(135deg,${d.color}88,#0b1220)`}"></div>
              <div style="padding:0 26px 24px;margin-top:-52px;display:flex;flex-wrap:wrap;align-items:flex-end;gap:18px">
                ${logo(d, 100, `border-radius:50%;border:3px solid ${d.color};box-shadow:0 0 28px ${d.color}aa`)}
                <div style="flex:1;min-width:200px"><h1 style="font-size:28px;font-weight:900;color:#f8fafc;display:flex;gap:8px;align-items:center;flex-wrap:wrap">${esc(d.name)} ${feat(d)}</h1>
                  ${d.tagline ? `<p style="font-weight:700;font-size:14px;color:${d.color};filter:brightness(1.4)">${esc(d.tagline)}</p>` : ''}
                  <p style="font-size:13px;color:#94a3b8;display:flex;gap:14px;flex-wrap:wrap;margin-top:4px">${meta(d)}</p></div></div>
              ${d.desc ? `<p style="padding:0 26px 18px;font-size:14px;color:#cbd5e1;line-height:1.7">${esc(d.desc)}</p>` : ''}
              ${(d.shippingPolicy || d.returnPolicy) ? `<div style="padding:0 26px 24px">${policies(d, 'background:#0b1220;border:1px solid #1f2a44;border-radius:14px;padding:14px', '#cbd5e1', '#94a3b8')}</div>` : ''}
            </div>` },

        // ── 3. Minimal ───────────────────────────────────────────────────────
        { id: 'minimal', ar: 'بسيط', en: 'Minimal', desc: { ar: 'بدون غلاف، تنسيق نظيف في المنتصف', en: 'No cover, clean and centred' },
          css: (c) => `.st-t-minimal{background:#fff;border-radius:6px;padding:12px}
            .st-t-minimal .service-card{box-shadow:none;border:1px solid #e5e7eb;border-radius:4px}
            .st-t-minimal .service-card:hover{border-color:${c};box-shadow:none}`,
          header: (d) => `${ann(d, `border-top:1px solid ${d.color};border-bottom:1px solid ${d.color};color:${d.color};text-align:center;font-weight:700;font-size:13px;letter-spacing:.04em;padding:8px;margin-bottom:22px`)}
            <div style="text-align:center;padding:26px 8px 28px;border-bottom:1px solid #e5e7eb;margin-bottom:26px">
              ${logo(d, 84, 'border-radius:50%;border:1px solid #e5e7eb;margin:0 auto')}
              <h1 style="margin-top:14px;font-size:22px;font-weight:300;letter-spacing:.22em;text-transform:uppercase;color:#111827">${esc(d.name)}</h1>
              <div style="margin-top:6px">${feat(d)}</div>
              ${d.tagline ? `<p style="font-size:13px;color:${d.color};margin-top:6px;letter-spacing:.06em">${esc(d.tagline)}</p>` : ''}
              <p style="font-size:12px;color:#9ca3af;display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin-top:10px">${meta(d)}</p>
              ${d.desc ? `<p style="max-width:560px;margin:14px auto 0;font-size:14px;color:#4b5563;line-height:1.8">${esc(d.desc)}</p>` : ''}
              ${policies(d, 'border:1px solid #e5e7eb;border-radius:4px;padding:12px;text-align:start;max-width:480px', '#4b5563', '#9ca3af')}
            </div>` },

        // ── 4. Bold ──────────────────────────────────────────────────────────
        { id: 'bold', ar: 'جريء', en: 'Bold', desc: { ar: 'كتلة لون ضخمة وحدود سميكة وظلال', en: 'Big colour block, thick outlines' },
          css: (c) => `.st-t-bold .service-card{border:3px solid #111827;border-radius:14px;box-shadow:6px 6px 0 ${c};transition:transform .15s,box-shadow .15s}
            .st-t-bold .service-card:hover{transform:translate(-3px,-3px);box-shadow:9px 9px 0 ${c}}`,
          header: (d) => `${ann(d, `background:#111827;color:#fff;text-align:center;font-weight:900;font-size:14px;padding:11px 16px;border:3px solid #111827;border-radius:12px;margin-bottom:14px;box-shadow:5px 5px 0 ${d.color}`)}
            <div style="border:3px solid #111827;border-radius:20px;overflow:hidden;box-shadow:8px 8px 0 #111827;background:#fff">
              <div style="background:${d.color};${d.banner ? `background-image:linear-gradient(${d.color}cc,${d.color}cc),url('${esc(d.banner)}');background-size:cover;background-position:center;` : ''}padding:30px 28px;display:flex;flex-wrap:wrap;align-items:center;gap:22px;border-bottom:3px solid #111827">
                ${logo(d, 110, 'border-radius:18px;border:3px solid #111827;box-shadow:5px 5px 0 #111827')}
                <div style="flex:1;min-width:220px"><h1 style="font-size:clamp(30px,6vw,52px);line-height:1;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:-.02em;-webkit-text-stroke:1.5px #111827;paint-order:stroke fill">${esc(d.name)}</h1>
                  ${d.tagline ? `<p style="display:inline-block;margin-top:10px;background:#111827;color:#fff;font-weight:900;font-size:14px;padding:5px 12px;border-radius:8px">${esc(d.tagline)}</p>` : ''}
                  <div style="margin-top:10px">${feat(d)}</div></div></div>
              <div style="padding:16px 28px;display:flex;gap:18px;flex-wrap:wrap;font-weight:800;font-size:13px;color:#111827">${meta(d)}</div>
              ${d.desc ? `<p style="padding:0 28px 18px;font-size:14px;color:#1f2937;line-height:1.7;font-weight:500">${esc(d.desc)}</p>` : ''}
              ${(d.shippingPolicy || d.returnPolicy) ? `<div style="padding:0 28px 24px">${policies(d, `border:2px solid #111827;border-radius:12px;padding:12px;background:${d.color}22`, '#111827', '#111827')}</div>` : ''}
            </div>` },

        // ── 5. Elegant ───────────────────────────────────────────────────────
        { id: 'elegant', ar: 'أنيق', en: 'Elegant', desc: { ar: 'ورق كريمي وخط كلاسيكي وحدود رفيعة', en: 'Cream paper, serif type, fine borders' },
          css: (c) => `.st-t-elegant{background:#faf6ef;border-radius:6px;padding:22px;font-family:'Fraunces','Amiri',Georgia,serif}
            .st-t-elegant .service-card{background:#fffdf8;border:1px solid #d9cdb4;border-radius:2px;box-shadow:none}
            .st-t-elegant .service-card:hover{border-color:${c};box-shadow:0 6px 18px rgba(120,90,40,.12)}
            .st-t-elegant .service-card h3{font-family:'Fraunces','Amiri',Georgia,serif}`,
          header: (d) => `${ann(d, `font-family:inherit;font-style:italic;color:${d.color};text-align:center;font-size:15px;padding:6px 10px 16px;border-bottom:1px solid #d9cdb4;margin-bottom:20px`)}
            <div style="text-align:center;font-family:'Fraunces','Amiri',Georgia,serif">
              ${d.banner ? `<div style="height:150px;background:url('${esc(d.banner)}') center/cover;filter:sepia(.25);border:1px solid #d9cdb4;margin-bottom:-44px"></div>` : `<div style="height:2px;background:linear-gradient(90deg,transparent,${d.color},transparent);margin-bottom:18px"></div>`}
              <div style="position:relative">${logo(d, 88, `border-radius:50%;border:1px solid ${d.color};padding:4px;margin:0 auto;display:block`)}</div>
              <h1 style="font-size:34px;font-weight:600;color:#3b2f1e;margin-top:12px">${esc(d.name)}</h1>
              <div style="color:${d.color};letter-spacing:.5em;font-size:12px;margin:4px 0">✦ ✦ ✦</div>
              ${d.tagline ? `<p style="font-style:italic;font-size:16px;color:#6b5b43">${esc(d.tagline)}</p>` : ''}
              <div style="margin-top:8px">${feat(d)}</div>
              <p style="font-size:13px;color:#8b7a5e;display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin-top:10px">${meta(d)}</p>
              ${d.desc ? `<p style="max-width:620px;margin:16px auto 0;font-size:15px;color:#4a3d2a;line-height:1.9">${esc(d.desc)}</p>` : ''}
              <div style="text-align:start">${policies(d, 'border:1px solid #d9cdb4;background:#fffdf8;padding:14px;border-radius:2px', '#4a3d2a', '#8b7a5e')}</div>
              <div style="height:1px;background:linear-gradient(90deg,transparent,#d9cdb4,transparent);margin:24px 0 8px"></div>
            </div>` },

        // ── 6. Playful ───────────────────────────────────────────────────────
        { id: 'playful', ar: 'مرح', en: 'Playful', desc: { ar: 'ألوان باستيل وفقاعات وحواف دائرية', en: 'Soft pastels, blobs, round shapes' },
          css: (c) => `.st-t-playful{background:radial-gradient(500px 280px at 0% 0%,${c}22,transparent),radial-gradient(500px 280px at 100% 30%,${c}1a,transparent),#fffaf5;border-radius:36px;padding:20px}
            .st-t-playful .service-card{border:2px solid ${c}33;border-radius:28px;box-shadow:0 10px 0 ${c}22;transition:transform .2s}
            .st-t-playful .service-card:hover{transform:translateY(-6px) rotate(-.6deg)}`,
          header: (d) => `${ann(d, `background:${d.color};color:#fff;text-align:center;font-weight:900;font-size:14px;padding:11px 18px;border-radius:999px;margin:0 auto 16px;max-width:560px;box-shadow:0 6px 0 ${d.color}55`)}
            <div style="position:relative;border-radius:40px;overflow:hidden;background:#fff;border:2px solid ${d.color}44;box-shadow:0 12px 0 ${d.color}22">
              <div style="position:relative;height:200px;background:${d.banner ? `url('${esc(d.banner)}') center/cover` : `linear-gradient(135deg,${d.color},${d.color}88)`}">
                <span style="position:absolute;width:120px;height:120px;border-radius:50%;background:#ffffff40;top:-30px;inset-inline-end:40px"></span>
                <span style="position:absolute;width:70px;height:70px;border-radius:50%;background:#ffffff33;bottom:20px;inset-inline-start:60px"></span>
                <span style="position:absolute;width:40px;height:40px;border-radius:50%;background:#ffffff55;top:40px;inset-inline-start:30%"></span></div>
              <div style="padding:0 26px 24px;margin-top:-50px;display:flex;flex-wrap:wrap;align-items:flex-end;gap:16px">
                ${logo(d, 100, `border-radius:32px;border:5px solid #fff;transform:rotate(-5deg);box-shadow:0 8px 0 ${d.color}55`)}
                <div style="flex:1;min-width:200px;padding-top:8px"><h1 style="font-size:28px;font-weight:900;color:#1f2937;display:flex;gap:8px;align-items:center;flex-wrap:wrap">${esc(d.name)} ${feat(d)}</h1>
                  ${d.tagline ? `<span style="display:inline-block;margin-top:4px;background:${d.color}22;color:${d.color};font-weight:800;font-size:13px;padding:4px 14px;border-radius:999px;filter:brightness(.75)">${esc(d.tagline)}</span>` : ''}
                  <p style="font-size:13px;color:#6b7280;display:flex;gap:14px;flex-wrap:wrap;margin-top:8px">${meta(d)}</p></div></div>
              ${d.desc ? `<p style="padding:0 26px 18px;font-size:14px;color:#4b5563;line-height:1.8">${esc(d.desc)}</p>` : ''}
              ${(d.shippingPolicy || d.returnPolicy) ? `<div style="padding:0 26px 24px">${policies(d, `background:${d.color}14;border-radius:22px;padding:14px`, '#374151', '#6b7280')}</div>` : ''}
            </div>` },
    ];

    // Tiny schematic of each theme for the picker (uses the owner's colour).
    function thumb(id, c) {
        const bar = (w, h, bg, r) => `<div style="width:${w};height:${h};background:${bg};border-radius:${r || 3}px"></div>`;
        const cards = (bg, border, r, sh) => `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:6px">${[1, 2, 3].map(() => `<div style="height:20px;background:${bg};border:${border};border-radius:${r}px;box-shadow:${sh || 'none'}"></div>`).join('')}</div>`;
        const t = {
            classic:  `<div style="background:#f9fafb;padding:6px;border-radius:8px">${bar('100%', '26px', `linear-gradient(135deg,${c},${c}cc)`, 6)}<div style="display:flex;gap:5px;margin:-8px 0 0 6px">${bar('18px', '18px', '#fff', 7)}</div>${cards('#fff', '1px solid #e5e7eb', 4)}</div>`,
            midnight: `<div style="background:#0b1220;padding:6px;border-radius:8px">${bar('100%', '26px', `linear-gradient(135deg,${c}88,#0b1220)`, 6)}<div style="margin:-8px 0 0 6px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 0 8px ${c}"></div>${cards('#fff', '1px solid #1f2a44', 5, `0 0 6px ${c}77`)}</div>`,
            minimal:  `<div style="background:#fff;padding:6px;border-radius:8px;border:1px solid #e5e7eb"><div style="width:18px;height:18px;border-radius:50%;border:1px solid #d1d5db;margin:0 auto"></div><div style="height:3px;width:40%;background:#9ca3af;margin:5px auto"></div><div style="height:1px;background:#e5e7eb;margin:5px 0"></div>${cards('#fff', '1px solid #e5e7eb', 1)}</div>`,
            bold:     `<div style="background:#fff;padding:6px;border-radius:8px">${bar('100%', '26px', c, 4).replace('border-radius:4px', 'border-radius:4px;border:2px solid #111')}${cards('#fff', '2px solid #111', 4, `2px 2px 0 ${c}`)}</div>`,
            elegant:  `<div style="background:#faf6ef;padding:6px;border-radius:8px;border:1px solid #e7dcc4"><div style="height:2px;background:linear-gradient(90deg,transparent,${c},transparent);margin:3px 0"></div><div style="width:18px;height:18px;border-radius:50%;border:1px solid ${c};margin:2px auto"></div><div style="font:600 7px Georgia,serif;text-align:center;color:#3b2f1e">✦ ✦ ✦</div>${cards('#fffdf8', '1px solid #d9cdb4', 1)}</div>`,
            playful:  `<div style="background:#fffaf5;padding:6px;border-radius:14px">${bar('100%', '26px', `linear-gradient(135deg,${c},${c}88)`, 12)}<div style="margin:-8px 0 0 8px;width:18px;height:18px;border-radius:9px;background:#fff;transform:rotate(-8deg);border:2px solid #fff"></div>${cards('#fff', `2px solid ${c}44`, 8, `0 3px 0 ${c}33`)}</div>`,
        };
        return t[id] || t.classic;
    }

    window.StoreThemes = {
        LIST: THEMES,
        ids: THEMES.map(t => t.id),
        get(id) { return THEMES.find(t => t.id === id) || THEMES[0]; },
        header(id, d) { return this.get(id).header(d); },
        thumb,
        /** Put the theme class + scoped CSS on a container (the public store page or the live preview). */
        apply(el, id, color) {
            if (!el) return;
            THEMES.forEach(t => el.classList.remove('st-t-' + t.id));
            el.classList.add('st-t-' + this.get(id).id);
            let st = document.getElementById('stThemeCss');
            if (!st) { st = document.createElement('style'); st.id = 'stThemeCss'; document.head.appendChild(st); }
            const c = /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#0f172a';
            st.textContent = THEMES.map(t => t.css(c)).join('\n');
        },
    };
    console.log('✅ StoreThemes loaded (6 themes)');
})();
