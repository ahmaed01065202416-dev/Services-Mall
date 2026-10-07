/**
 * js/ads-embed.js — shows ads on ANY page (SPA pages and the static blog pages).
 * ============================================================================
 * Zero dependencies (no Firebase, no Tailwind): it reads the public
 * /api/ads-feed and draws into slots, so the same file works everywhere.
 *
 * Two ways a placement gets onto a page — both fully controlled from the
 * admin "الإعلانات" tab, no code change needed:
 *   1) Static slot already in the HTML:   <div data-ad-slot="home_top"></div>
 *   2) Injected slot: the admin gives a placement a CSS selector + position
 *      (before | after | prepend | append); this script creates the slot there.
 *      That is how an ad can be put "anywhere in the site".
 *
 * An empty slot is hidden (no ugly empty boxes). An ad disappears at its exact
 * end time even while the feed response is still cached (endAtMs is checked here).
 * ============================================================================
 */
(function () {
    'use strict';
    var FEED_URL = '/api/ads-feed';
    var CACHE_KEY = 'ms_ads_feed_v1';
    var CACHE_MS = 60 * 1000;
    var state = { feed: null, loading: null, expressOnly: false, timer: null };

    function isAr() {
        try { if (window.AppState && window.AppState.language) return window.AppState.language !== 'en'; } catch (e) {}
        return (document.documentElement.lang || 'ar').slice(0, 2) !== 'en';
    }
    function money(n) {
        try { if (typeof window.formatCurrency === 'function') return window.formatCurrency(n); } catch (e) {}
        return Number(n || 0).toLocaleString('ar-EG') + ' ج.م';
    }
    function el(tag, css, text) {
        var e = document.createElement(tag);
        if (css) e.style.cssText = css;
        if (text != null) e.textContent = text;
        return e;
    }
    function safeUrl(u) {
        u = String(u || '');
        if (/^https:\/\//i.test(u) || u.charAt(0) === '/' || u.charAt(0) === '#') return u;
        return '';
    }

    function loadFeed() {
        if (state.feed && Date.now() - state.feed._at < CACHE_MS) return Promise.resolve(state.feed);
        try {
            var c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
            if (c && Date.now() - c._at < CACHE_MS) { state.feed = c; return Promise.resolve(c); }
        } catch (e) {}
        if (state.loading) return state.loading;
        state.loading = fetch(FEED_URL, { credentials: 'omit' })
            .then(function (r) { return r.ok ? r.json() : { enabled: false, placements: [], ads: [] }; })
            .catch(function () { return { enabled: false, placements: [], ads: [] }; })
            .then(function (f) {
                f._at = Date.now();
                state.feed = f; state.loading = null;
                try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(f)); } catch (e) {}
                return f;
            });
        return state.loading;
    }

    // ── Track (best-effort; the server de-dupes nothing, we de-dupe per session) ──
    function track(adId, type) {
        try {
            var k = 'ms_ad_' + type + '_' + adId;
            if (type === 'view') { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); }
            var body = JSON.stringify({ action: 'track', adId: adId, type: type });
            if (navigator.sendBeacon) navigator.sendBeacon('/api/ads', new Blob([body], { type: 'application/json' }));
            else fetch('/api/ads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
        } catch (e) {}
    }
    var io = (typeof window.IntersectionObserver === 'function') ? new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
            if (en.isIntersecting) { track(en.target.getAttribute('data-ad-id'), 'view'); io.unobserve(en.target); }
        });
    }, { threshold: 0.5 }) : null;

    // ── Cards ────────────────────────────────────────────────────────────────
    function badge(ar) {
        return el('span', 'position:absolute;top:10px;inset-inline-start:10px;background:rgba(17,24,39,.78);color:#fff;font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;z-index:2', ar ? 'إعلان' : 'Ad');
    }
    function openService(id) {
        if (window.ServicesManager && typeof window.ServicesManager.openServiceDetail === 'function') window.ServicesManager.openServiceDetail(id);
        else window.location.href = '/#services';
    }
    function serviceCard(ad, ar) {
        var s = ad.service, card = el('div', 'position:relative;background:#fff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.05);transition:box-shadow .2s;display:flex;flex-direction:column');
        card.setAttribute('data-ad-id', ad.id);
        card.onmouseenter = function () { card.style.boxShadow = '0 6px 18px rgba(0,0,0,.12)'; };
        card.onmouseleave = function () { card.style.boxShadow = '0 1px 4px rgba(0,0,0,.05)'; };
        var imgUrl = s.image || (s.images && s.images[0]) || '';
        var wrap = el('div', 'position:relative;height:150px;background:#f3f4f6');
        if (safeUrl(imgUrl)) {
            var img = el('img', 'width:100%;height:100%;object-fit:cover;display:block');
            img.loading = 'lazy'; img.alt = s.title || ''; img.src = safeUrl(imgUrl);
            img.onerror = function () { img.style.display = 'none'; };
            wrap.appendChild(img);
        }
        wrap.appendChild(badge(ar)); card.appendChild(wrap);
        var body = el('div', 'padding:12px 14px;display:flex;flex-direction:column;gap:6px;flex:1');
        body.appendChild(el('div', 'font-weight:800;font-size:14px;color:#111827;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden', s.title));
        if (s.sellerName) body.appendChild(el('div', 'font-size:12px;color:#6b7280', s.sellerName));
        var row = el('div', 'display:flex;justify-content:space-between;align-items:center;margin-top:auto');
        // Honest rating: only real reviews; otherwise show "New", never a fake 5.0.
        row.appendChild(el('span', 'font-size:12px;font-weight:700;color:' + (s.reviewCount > 0 ? '#d97706' : '#6b7280'),
            s.reviewCount > 0 ? '★ ' + Number(s.rating).toFixed(1) + ' (' + s.reviewCount + ')' : (ar ? 'جديد' : 'New')));
        row.appendChild(el('span', 'font-weight:900;font-size:15px;color:#1e3a8a', money(s.price)));
        body.appendChild(row); card.appendChild(body);
        card.onclick = function () { track(ad.id, 'click'); openService(s.id); };
        return card;
    }
    function bannerCard(ad, ar) {
        var link = safeUrl(ad.linkUrl), img = safeUrl(ad.imageUrl);
        var box = el('div', 'position:relative;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;background:#f3f4f6;' + (link ? 'cursor:pointer' : ''));
        box.setAttribute('data-ad-id', ad.id);
        var i = el('img', 'width:100%;display:block;max-height:240px;object-fit:cover');
        i.loading = 'lazy'; i.alt = ad.title || (ar ? 'إعلان' : 'Ad'); i.src = img;
        box.appendChild(i); box.appendChild(badge(ar));
        if (link) box.onclick = function () { track(ad.id, 'click'); goLink(link); };
        return box;
    }


    // ── Click routing shared by banner / media cards ────────────────────────
    function goLink(link) {
        var m;
        if ((m = /^#store-(.+)$/.exec(link)) && window.StoresManager) { window.StoresManager.openStore(m[1]); return; }
        if ((m = /^#listing-(.+)$/.exec(link))) { openService(m[1]); return; }
        if (link.charAt(0) === '#' && window.navigateTo) { try { window.navigateTo(link.slice(1)); return; } catch (e) {} }
        window.open(link, link.charAt(0) === '/' ? '_self' : '_blank', 'noopener');
    }
    // Image or video creative (video = direct file, YouTube or Vimeo embed).
    function mediaCard(ad, ar) {
        var link = safeUrl(ad.linkUrl), box = el('div', 'position:relative;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;background:#0b1220');
        box.setAttribute('data-ad-id', ad.id);
        var isVideo = ad.mediaType === 'video';
        if (isVideo && ad.embedUrl && /^https:\/\/(www\.youtube-nocookie\.com|player\.vimeo\.com)\//.test(ad.embedUrl)) {
            var wrap = el('div', 'position:relative;width:100%;padding-top:56.25%');
            var f = el('iframe', 'position:absolute;inset:0;width:100%;height:100%;border:0');
            f.src = ad.embedUrl; f.loading = 'lazy'; f.title = ad.title || (ar ? 'إعلان' : 'Ad');
            f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen'); f.allowFullscreen = true;
            wrap.appendChild(f); box.appendChild(wrap);
        } else if (isVideo && safeUrl(ad.videoUrl)) {
            var v = el('video', 'width:100%;display:block;max-height:420px;background:#000');
            v.src = safeUrl(ad.videoUrl); v.controls = true; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'metadata';
            if (safeUrl(ad.imageUrl)) v.poster = safeUrl(ad.imageUrl);
            if (io && 'IntersectionObserver' in window) {   // autoplay (muted) only while visible
                new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause(); }); }, { threshold: 0.5 }).observe(v);
            }
            box.appendChild(v);
        } else if (safeUrl(ad.imageUrl)) {
            var i = el('img', 'width:100%;display:block;max-height:300px;object-fit:cover;' + (link ? 'cursor:pointer' : ''));
            i.loading = 'lazy'; i.alt = ad.title || (ar ? 'إعلان' : 'Ad'); i.src = safeUrl(ad.imageUrl);
            if (link) i.onclick = function () { track(ad.id, 'click'); goLink(link); };
            box.appendChild(i);
        }
        box.appendChild(badge(ar));
        if (ad.title) box.appendChild(el('div', 'position:absolute;bottom:0;left:0;right:0;padding:18px 14px 10px;background:linear-gradient(transparent,rgba(0,0,0,.65));color:#fff;font-weight:800;font-size:14px;pointer-events:none', ad.title));
        if (link && isVideo) {
            var b = el('button', 'position:absolute;top:10px;inset-inline-end:10px;background:#fff;color:#111827;border:0;border-radius:999px;padding:6px 14px;font-weight:800;font-size:12px;cursor:pointer;z-index:3', ar ? 'اعرف المزيد' : 'Learn more');
            b.onclick = function (e) { e.stopPropagation(); track(ad.id, 'click'); goLink(link); };
            box.appendChild(b);
        }
        return box;
    }

    // ── Rendering ────────────────────────────────────────────────────────────
    function injectCustomSlots(feed) {
        (feed.placements || []).forEach(function (p) {
            if (!p.selector || !p.position) return;
            if (document.querySelector('[data-ad-slot="' + p.key + '"]')) return;
            if (p.page && p.page.charAt(0) === '/' && location.pathname.replace(/\/+$/, '') !== p.page.replace(/\/+$/, '')) return;
            var target = null;
            try { target = document.querySelector(p.selector); } catch (e) { return; }   // bad selector from admin → ignore
            if (!target) return;
            var slot = document.createElement('div');
            slot.setAttribute('data-ad-slot', p.key); slot.setAttribute('data-ad-injected', '1');
            slot.style.margin = '16px 0';
            try {
                if (p.position === 'before') target.parentNode.insertBefore(slot, target);
                else if (p.position === 'after') target.parentNode.insertBefore(slot, target.nextSibling);
                else if (p.position === 'prepend') target.insertBefore(slot, target.firstChild);
                else target.appendChild(slot);
            } catch (e) {}
        });
    }

    function render() {
        loadFeed().then(function (feed) {
            if (!feed || !feed.enabled) { hideAll(); return; }
            injectCustomSlots(feed);
            var ar = isAr(), now = Date.now(), nextEnd = Infinity;
            var byKey = {};
            (feed.placements || []).forEach(function (p) { byKey[p.key] = p; });

            document.querySelectorAll('[data-ad-slot]').forEach(function (slot) {
                if (slot.getAttribute('data-ad-preview')) return;       // a live preview is showing here — don't redraw
                var key = slot.getAttribute('data-ad-slot'), p = byKey[key];
                var need = slot.getAttribute('data-ad-when');
                var blocked = !p || (need === 'express' && !state.expressOnly);
                var ads = blocked ? [] : (feed.ads || []).filter(function (a) { return a.placementKey === key && a.endAtMs > now && (a.kind === 'service' || (a.kind === 'media' ? (a.mediaType === 'video' ? !!(a.embedUrl || safeUrl(a.videoUrl)) : !!safeUrl(a.imageUrl)) : !!safeUrl(a.imageUrl))); }).slice(0, p.slots);
                ads.forEach(function (a) { if (a.endAtMs < nextEnd) nextEnd = a.endAtMs; });

                var sig = ads.map(function (a) { return a.id; }).join(',') + '|' + (ar ? 'a' : 'e');
                if (slot.getAttribute('data-ad-sig') === sig) return;          // unchanged → don't redraw
                slot.setAttribute('data-ad-sig', sig);
                slot.textContent = '';
                if (!ads.length) { slot.style.display = 'none'; return; }
                slot.style.display = '';
                var cols = p.layout === 'stack' || ads[0].kind === 'banner' || ads[0].kind === 'media' ? '1fr' : 'repeat(auto-fill,minmax(220px,1fr))';
                var grid = el('div', 'display:grid;gap:14px;grid-template-columns:' + cols);
                ads.forEach(function (a) {
                    var c = a.kind === 'media' ? mediaCard(a, ar) : a.kind === 'banner' ? bannerCard(a, ar) : serviceCard(a, ar);
                    grid.appendChild(c); if (io) io.observe(c);
                });
                slot.appendChild(grid);
            });
            if (state.timer) clearTimeout(state.timer);
            if (nextEnd !== Infinity) state.timer = setTimeout(render, Math.min(Math.max(nextEnd - Date.now() + 500, 1000), 2147000000));
        });
    }
    function hideAll() { document.querySelectorAll('[data-ad-slot]').forEach(function (s) { s.style.display = 'none'; }); }

    // ── Live preview: draws a draft ad into the REAL slot of the real page ──────
    // opts: { key, ad, selector, position }. The slot is created from the selector when the placement is "anywhere".
    function previewIn(opts) {
        endPreview();
        var slot = document.querySelector('[data-ad-slot="' + opts.key + '"]');
        if (!slot && opts.selector && opts.position) {
            var target = null; try { target = document.querySelector(opts.selector); } catch (e) {}
            if (target) {
                slot = document.createElement('div'); slot.setAttribute('data-ad-slot', opts.key); slot.setAttribute('data-ad-injected', '1'); slot.style.margin = '16px 0';
                try {
                    if (opts.position === 'before') target.parentNode.insertBefore(slot, target);
                    else if (opts.position === 'after') target.parentNode.insertBefore(slot, target.nextSibling);
                    else if (opts.position === 'prepend') target.insertBefore(slot, target.firstChild);
                    else target.appendChild(slot);
                } catch (e) { slot = null; }
            }
        }
        if (!slot) return false;
        slot.setAttribute('data-ad-preview', '1'); slot.removeAttribute('data-ad-sig');
        slot.textContent = ''; slot.style.display = '';
        slot.style.outline = '3px dashed #f59e0b'; slot.style.outlineOffset = '6px'; slot.style.borderRadius = '18px';
        var a = Object.assign({ id: 'preview', kind: 'media' }, opts.ad);
        slot.appendChild(a.kind === 'service' ? serviceCard(a, isAr()) : mediaCard(a, isAr()));
        state.previewSlot = slot;
        try { slot.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
        return true;
    }
    function endPreview() {
        var s = state.previewSlot; if (!s) return;
        s.removeAttribute('data-ad-preview'); s.style.outline = ''; s.style.outlineOffset = ''; s.textContent = '';
        if (s.getAttribute('data-ad-injected')) s.remove(); else { s.removeAttribute('data-ad-sig'); s.style.display = 'none'; }
        state.previewSlot = null; render();
    }

    window.AdsEmbed = {
        previewIn: previewIn, endPreview: endPreview, mediaCard: mediaCard, serviceCard: serviceCard,
        render: render,
        refresh: function () { state.feed = null; try { sessionStorage.removeItem(CACHE_KEY); } catch (e) {} render(); },
        setExpress: function (on) { state.expressOnly = !!on; render(); },
    };

    function boot() {
        render();
        // SPA: pages are shown/hidden, so re-scan after every navigation.
        if (typeof window.navigateTo === 'function' && !window.navigateTo.__adsWrapped) {
            var orig = window.navigateTo;
            var wrapped = function () { var r = orig.apply(this, arguments); setTimeout(render, 350); return r; };
            wrapped.__adsWrapped = true;
            window.navigateTo = wrapped;
        }
    }
    if (document.readyState === 'complete') boot(); else window.addEventListener('load', boot);
})();
