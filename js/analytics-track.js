/* ============================================================================
 * js/analytics-track.js — platform visit counter (replaces Google Analytics)
 * ----------------------------------------------------------------------------
 * Sends to /api/analytics at most: one "visit" per browser session, one "store" per merchant per session, and the
 * account link (the same call with the login token) once the person is signed in. Stored on the server: a random
 * browser id, the days it visited and — after login — the account uid. No IP, no user-agent (see privacy.html).
 * Nothing here can break the site: every failure is swallowed.
 * ========================================================================== */
(function () {
    'use strict';
    var ENDPOINT = '/api/analytics';

    function vid() {
        try {
            var v = localStorage.getItem('ms_vid');
            if (v && /^[A-Za-z0-9_-]{16,64}$/.test(v)) return v;
            v = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
            localStorage.setItem('ms_vid', v);
            return v;
        } catch (_) { return null; }
    }
    function seen(key) {
        try { if (sessionStorage.getItem(key)) return true; sessionStorage.setItem(key, '1'); return false; } catch (_) { return false; }
    }
    async function send(kind, sellerId) {
        var id = vid(); if (!id) return;
        var headers = { 'Content-Type': 'application/json' };
        try { if (window.auth && window.auth.currentUser) headers.Authorization = 'Bearer ' + await window.auth.currentUser.getIdToken(); } catch (_) {}
        try { await fetch(ENDPOINT, { method: 'POST', headers: headers, body: JSON.stringify({ action: 'track', vid: id, kind: kind, sellerId: sellerId || undefined }), keepalive: true }); } catch (_) {}
    }

    function visit() { if (!seen('ms_s_visit')) send('visit'); }
    function store(sellerId) {
        if (!sellerId || !/^[A-Za-z0-9_-]{1,128}$/.test(sellerId)) return;
        var me = window.auth && window.auth.currentUser; if (me && me.uid === sellerId) return;     // owners looking at their own store don't count
        if (!seen('ms_s_store_' + sellerId)) send('store', sellerId);
    }

    // link the browser to the account as soon as the person is signed in (once per session & account)
    function watchLogin() {
        if (!window.auth || !window.auth.onAuthStateChanged) return false;
        window.auth.onAuthStateChanged(function (u) { if (u && !seen('ms_s_id_' + u.uid)) setTimeout(function () { send('visit'); }, 800); });
        return true;
    }

    function wrap(obj, name, after) {
        if (!obj || typeof obj[name] !== 'function' || obj[name].__tracked) return;
        var orig = obj[name];
        var w = function () {
            var args = arguments, r = orig.apply(this, args);
            try { Promise.resolve(r).then(function () { after.apply(null, args); }).catch(function () {}); } catch (_) {}
            return r;
        };
        w.__tracked = true; obj[name] = w;
    }
    function hook() {
        // a merchant store page → the store's owner
        wrap(window.StoresManager, 'openStore', function (storeId) {
            if (!window.db || !storeId) return;
            window.db.collection('stores').doc(storeId).get().then(function (s) { store((s.exists && s.data().ownerId) || storeId); }).catch(function () {});
        });
        // a product / service page → its seller
        wrap(window.ServicesManager, 'openServiceDetail', function (serviceId) {
            var s = window.AppState && AppState.currentService;
            if (s && s.id === serviceId && s.sellerId) store(s.sellerId);
        });
    }

    function start() {
        visit();
        var tries = 0, t = setInterval(function () { tries++; if (watchLogin() || tries > 40) clearInterval(t); }, 500);
        var tries2 = 0, t2 = setInterval(function () { tries2++; hook(); if ((window.StoresManager && window.StoresManager.openStore.__tracked && window.ServicesManager && window.ServicesManager.openServiceDetail.__tracked) || tries2 > 40) clearInterval(t2); }, 500);
    }
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
    window.MallTrack = { visit: visit, store: store };
})();
