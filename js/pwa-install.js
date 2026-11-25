/**
 * js/pwa-install.js — clear "Install the app" prompt (مول الخدمات).
 *  • Android / Chrome / Edge / Samsung Internet : real install button (beforeinstallprompt).
 *  • iPhone / iPad                               : 3 short steps (iOS has no install API).
 *  • Already installed (standalone)              : nothing is shown.
 *  • "لاحقًا" / ✕ hides it for 7 days; installing hides it for good.
 * Any element with  data-pwa-install  (e.g. a footer link) opens it on demand; so does  window.MallPWA.show().
 * CSP-safe: no inline <style>, no style attributes, no inline handlers (the site runs with style-src 'self').
 */
(function () {
  'use strict';
  var DISMISS_KEY = 'mall_pwa_dismissed', DONE_KEY = 'mall_pwa_installed';
  var HIDE_DAYS = 7, SHOW_AFTER_MS = 6000;
  var ua = navigator.userAgent || '';

  function num(k) { try { return parseInt(window.localStorage.getItem(k) || '0', 10) || 0; } catch (e) { return 0; } }
  function put(k) { try { window.localStorage.setItem(k, String(Date.now())); } catch (e) { /* private mode */ } }

  var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  if (standalone) return;

  var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var inApp = /FBAN|FBAV|Instagram|Line\/|TikTok|Snapchat|MicroMessenger/i.test(ua);   // in-app browsers cannot install anything
  var isMobile = isIOS || /android|mobile/i.test(ua);
  var deferred = null, root = null, cssReady = false, timer = null;

  function allowed() {
    if (num(DONE_KEY)) return false;
    var d = num(DISMISS_KEY);
    return !d || Date.now() - d > HIDE_DAYS * 86400000;
  }
  function h(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
  var SHARE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';

  function loadCss(cb) {
    if (cssReady) return cb();
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = '/css/pwa-install.css?v=1';
    l.onload = function () { cssReady = true; cb(); };
    l.onerror = function () { /* no stylesheet → stay hidden rather than show an unstyled box */ };
    (document.head || document.documentElement).appendChild(l);
  }

  function hide(remember) {
    if (!root) return;
    if (remember) put(DISMISS_KEY);
    var r = root; root = null;
    r.classList.remove('is-open');
    setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); }, 400);
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') hide(true); }

  function install() {
    if (!deferred) return;
    var p = deferred; deferred = null;
    try {
      p.prompt();
      Promise.resolve(p.userChoice).then(function (c) {
        if (c && c.outcome === 'accepted') { put(DONE_KEY); hide(false); } else hide(true);
      }, function () { hide(true); });
    } catch (e) { hide(true); }
  }

  function build() {
    var wrap = h('div', 'mall-pwa');
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'تثبيت تطبيق مول الخدمات');
    var card = h('div', 'mall-pwa__card'); card.setAttribute('dir', 'rtl');

    var close = h('button', 'mall-pwa__close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'إغلاق');
    close.addEventListener('click', function () { hide(true); });

    var head = h('div', 'mall-pwa__head');
    var icon = h('img', 'mall-pwa__icon'); icon.src = '/icons/icon-192.png'; icon.alt = ''; icon.width = 52; icon.height = 52;
    var txt = h('div');
    txt.appendChild(h('p', 'mall-pwa__title', 'ثبّت تطبيق مول الخدمات'));
    txt.appendChild(h('p', 'mall-pwa__sub', 'افتحه من شاشة موبايلك بضغطة واحدة، أسرع وبدون ما تدوّر على الرابط.'));
    head.appendChild(icon); head.appendChild(txt);
    card.appendChild(close); card.appendChild(head);

    if (deferred) {
      var act = h('div', 'mall-pwa__actions');
      var go = h('button', 'mall-pwa__btn mall-pwa__btn--primary', 'تثبيت الآن'); go.type = 'button';
      go.addEventListener('click', install);
      var later = h('button', 'mall-pwa__btn mall-pwa__btn--ghost', 'لاحقًا'); later.type = 'button';
      later.addEventListener('click', function () { hide(true); });
      act.appendChild(go); act.appendChild(later); card.appendChild(act);
    } else {
      var steps = h('ol', 'mall-pwa__steps');
      var items = isIOS
        ? ['اضغط زر المشاركة {SHARE} في شريط المتصفح.', 'اختار «إضافة إلى الشاشة الرئيسية».', 'اضغط «إضافة» وهتلاقي الأيقونة على شاشتك.']
        : ['افتح قائمة المتصفح (⋮ أو ⋯).', 'اختار «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».', 'أكّد وهتلاقي الأيقونة على شاشتك.'];
      items.forEach(function (t) {
        var li = h('li'); var i = t.indexOf('{SHARE}');
        if (i < 0) li.textContent = t;
        else { var sp = h('span'); sp.appendChild(document.createTextNode(t.slice(0, i))); var s = h('span'); s.innerHTML = SHARE_SVG; sp.appendChild(s.firstChild); sp.appendChild(document.createTextNode(t.slice(i + 7))); li.appendChild(sp); }
        steps.appendChild(li);
      });
      card.appendChild(steps);
      var act2 = h('div', 'mall-pwa__actions');
      var ok = h('button', 'mall-pwa__btn mall-pwa__btn--primary', 'تمام، فهمت'); ok.type = 'button';
      ok.addEventListener('click', function () { hide(true); });
      act2.appendChild(ok); card.appendChild(act2);
    }
    wrap.appendChild(card);
    return wrap;
  }

  function show(manual) {
    if (root || inApp) return;
    if (!manual && !allowed()) return;
    loadCss(function () {
      if (root) return;
      root = build();
      document.body.appendChild(root);
      document.addEventListener('keydown', onKey);
      window.requestAnimationFrame(function () { window.requestAnimationFrame(function () { if (root) root.classList.add('is-open'); }); });
    });
  }
  function schedule() {
    if (timer || !isMobile || !allowed()) return;          // auto-prompt on phones only; desktop users get it through the [data-pwa-install] link
    timer = setTimeout(function () { timer = null; show(false); }, SHOW_AFTER_MS);
  }

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; schedule(); });
  window.addEventListener('appinstalled', function () { put(DONE_KEY); deferred = null; hide(false); });
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-pwa-install]') : null;
    if (t) { e.preventDefault(); show(true); }
  });
  if (isIOS) schedule();                                    // iOS never fires beforeinstallprompt → show the 3 steps instead
  window.MallPWA = { show: function () { show(true); }, canInstall: function () { return !!deferred; } };
})();
