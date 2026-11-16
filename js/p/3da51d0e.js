// Dashboard-only modules (Chart.js 200 KB / ads / coupons / insights ≈ 38 KB): loaded the first time a dashboard tab opens, not for every
// visitor. Both dashboards await __ensureDashModules() before rendering any tab. A failed load is retried next time.
window.__ensureDashModules = (function () {
  var files = ['vendor/js/chart.umd.js', 'js/ads-system.js?v=2026-10-31-sec1', 'js/coupons.js?v=2026-11-02-cp1', 'js/insights.js?v=2026-11-03-an1'];
  var pending = null;
  function one(src) {
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = '/' + src; s.async = true;
      s.onload = function () { resolve(true); };
      s.onerror = function () { console.warn('[lazy] failed to load', src); resolve(false); };
      document.head.appendChild(s);
    });
  }
  return function () {
    if (!pending) pending = Promise.all(files.map(one)).then(function (r) { if (r.indexOf(false) !== -1) pending = null; });
    return pending;
  };
})();
// Signed-in people almost always open their dashboard next: fetch those modules while the browser is idle, so the first
// tab opens instantly instead of waiting for the download. Visitors who never sign in never download them.
window.addEventListener('load', function () {
  var tries = 0;
  var t = setInterval(function () {
    tries++;
    if (window.AppState && window.AppState.currentUser) {
      clearInterval(t);
      if (window.requestIdleCallback) window.requestIdleCallback(function () { window.__ensureDashModules(); }, { timeout: 8000 });
      else setTimeout(function () { window.__ensureDashModules(); }, 3000);
    } else if (tries > 90) clearInterval(t);
  }, 1000);
});
