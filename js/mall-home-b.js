/* Design B — "Mint & Gold" home. Vanilla JS, no GSAP, no pinning.
   Boots lazily the first time #mallDesignB is actually visible (it is display:none unless
   <html data-design="mint">). Scroll effects use one rAF-throttled passive listener and only
   write CSS custom properties (--sp, --p), so the browser animates transform/opacity on the compositor. */
(function () {
  'use strict';
  var R = null, E = null, booted = false, tick = false, ps = [], wv = null, vh = innerHeight, io = null;
  var AR = '٠١٢٣٤٥٦٧٨٩';
  function ar(n) { return String(n).replace(/\d/g, function (d) { return AR[d]; }); }
  function clamp(v) { return Math.max(0, Math.min(1, v)); }

  function visible() { return R && R.offsetParent !== null; }

  function upd() {
    tick = false;
    if (!visible()) return;
    var r = R.getBoundingClientRect();
    R.classList.toggle('mb-off', r.bottom < 0);
    R.style.setProperty('--sp', clamp(-r.top / Math.max(1, r.height - vh)).toFixed(4));
    for (var i = 0; i < ps.length; i++) {
      var el = ps[i], b = el.getBoundingClientRect();
      if (b.bottom < -80 || b.top > vh + 80) continue;
      el.style.setProperty('--p', clamp((vh - b.top) / (vh + b.height)).toFixed(3));
    }
    if (wv) {
      var w = wv.getBoundingClientRect();
      wv.style.setProperty('--d', clamp((vh * 0.9 - w.top) / (w.height + vh * 0.2)).toFixed(3));
    }
  }
  function req() { if (!tick) { tick = true; requestAnimationFrame(upd); } }

  function boot() {
    if (booted) return;
    booted = true;
    // headline words: each word slides up when its heading is revealed
    R.querySelectorAll('.mb-sec h2, .mb-bk h2').forEach(function (h) {
      var k = 0;
      h.innerHTML = h.textContent.trim().split(/\s+/).map(function (w) {
        return '<span class="mb-wd"><i style="--i:' + (k++) + '">' + w + '</i></span>';
      }).join(' ');
    });
    // reveal on enter (+ count-up for any [data-n])
    io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var t = e.target; t.classList.add('mb-on'); io.unobserve(t);
        var n = t.querySelector('[data-n]');
        if (n) {
          var to = +n.getAttribute('data-n'), s = n.getAttribute('data-s') || '+', t0 = performance.now();
          (function f(now) {
            var k = Math.min(1, (now - t0) / 1500), v = Math.round(to * (1 - Math.pow(1 - k, 3)));
            n.textContent = ar(v) + (k === 1 ? s : '');
            if (k < 1) requestAnimationFrame(f);
          })(t0);
        }
      });
    }, { threshold: 0.2 });
    R.querySelectorAll('.mb-rv, .mb-pk').forEach(function (el, i) {
      el.classList.add('mb-rv');
      el.style.transitionDelay = (i % 4) * 0.08 + 's';
      io.observe(el);
    });
    ps = [].slice.call(R.querySelectorAll('[data-p]')).concat(E ? [].slice.call(E.querySelectorAll('[data-p]')) : []);
    wv = R.querySelector('[data-d]');
    // brand palette: click to copy
    var ts = R.querySelector('#mb-ts'), tm;
    R.querySelectorAll('[data-c]').forEach(function (b) {
      b.addEventListener('click', function () {
        var c = b.getAttribute('data-c');
        try { navigator.clipboard && navigator.clipboard.writeText(c).catch(function () {}); } catch (e) {}
        if (!ts) return;
        ts.textContent = 'تم نسخ ' + c; ts.classList.add('mb-on'); clearTimeout(tm);
        tm = setTimeout(function () { ts.classList.remove('mb-on'); }, 1600);
      });
    });
    // actions: data-go → SPA navigation; #mb-* anchors → smooth scroll (don't touch the SPA router)
    var onClick = function (e) {
      var g = e.target.closest('[data-go]');
      if (g) {
        e.preventDefault();
        var v = g.getAttribute('data-go');
        if (v === 'products' && window.filterByType) filterByType('product'); else if (window.navigateTo) navigateTo(v);
        return;
      }
      var a = e.target.closest('a[href^="#mb-"]');
      if (a) {
        e.preventDefault();
        var t = R.querySelector(a.getAttribute('href'));
        if (t) t.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      }
    };
    R.addEventListener('click', onClick);
    if (E) E.addEventListener('click', onClick);
    addEventListener('scroll', req, { passive: true });
    addEventListener('resize', function () { vh = innerHeight; req(); });
    upd();
  }

  function watch() {
    R = document.getElementById('mallDesignB');
    E = document.getElementById('mallDesignBEnd');
    if (!R) return;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { if (es[0].isIntersecting) { boot(); req(); } }, { rootMargin: '200px' }).observe(R);
    } else if (visible()) boot();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();
