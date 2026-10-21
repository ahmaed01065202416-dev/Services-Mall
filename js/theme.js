/* Mall Services — theme (نهاري / ليلي). Shared by every page.
   Same storage key ('theme') and class (html.dark) the app already used, so the
   choice carries between index.html and the static pages. */
(function () {
  var d = document.documentElement, KEY = 'theme';
  function pref() {
    var t = null;
    try { t = localStorage.getItem(KEY); } catch (e) {}
    if (t === 'dark' || t === 'light') return t;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function apply(t) {
    d.classList.toggle('dark', t === 'dark');
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
    m.content = t === 'dark' ? '#0E1A33' : '#FBF8F2';
  }
  apply(pref());
  // keep <meta theme-color> in sync when the app's own toggleTheme() flips the class
  new MutationObserver(function () { apply(d.classList.contains('dark') ? 'dark' : 'light'); })
    .observe(d, { attributes: true, attributeFilter: ['class'] });
  window.mallToggleTheme = function () {
    var t = d.classList.contains('dark') ? 'light' : 'dark';
    try { localStorage.setItem(KEY, t); } catch (e) {}
    apply(t);
  };
  // Static pages only: inject a toggle button (index.html already has #themeToggle)
  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('themeToggle') || document.querySelector('.m-tg')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'm-tg'; b.setAttribute('aria-label', 'تبديل الوضع الليلي / النهاري');
    b.innerHTML = '<svg class="m" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>' +
      '<svg class="s" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
    b.onclick = window.mallToggleTheme;
    var host = document.querySelector('.nav-inner');
    if (host) {
      var cta = host.querySelector('.nav-cta');
      if (cta) { var w = document.createElement('div'); w.className = 'm-tgwrap'; cta.parentNode.insertBefore(w, cta); w.appendChild(b); w.appendChild(cta); }
      else host.appendChild(b);
    } else {
      b.style.cssText = 'position:fixed;top:12px;inset-inline-start:12px;z-index:200;background:var(--m-surface)';
      document.body.appendChild(b);
    }
  });
})();
