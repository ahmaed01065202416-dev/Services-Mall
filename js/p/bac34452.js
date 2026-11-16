/* Live counters: real numbers from /api/home-stats (server-side Firestore COUNT/AVG aggregations).
   - count-up animation from the previous value, so a change is visible
   - refreshes every 30s while the tab is visible (the endpoint itself caches ~30s)
   - never invents numbers: no data → "—" */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var shown = {};                       // last value rendered per element id
  var fmt = function (n) { return Number(n).toLocaleString('en-US'); };

  function countTo(id, target) {
    var el = $(id); if (!el) return;
    var from = shown[id] == null ? 0 : shown[id];
    shown[id] = target;
    if (from === target) { el.textContent = fmt(target); return; }
    var start = null, dur = 900;
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / dur);
      el.textContent = fmt(Math.round(from + (target - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(step);
    }
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(target); return; }
    requestAnimationFrame(step);
  }
  function setLive(ok) {
    var b = $('liveBadge'), t = $('liveBadgeText'); if (!b || !t) return;
    b.classList.toggle('off', !ok);
    t.textContent = ok ? 'أرقام حقيقية تتحدّث مباشرة' : 'تعذّر تحديث الأرقام الآن — سنحاول تلقائيًا';
  }
  async function load() {
    try {
      var ctl = ('AbortController' in window) ? new AbortController() : null;
      var to = ctl ? setTimeout(function () { ctl.abort(); }, 8000) : null;
      var res = await fetch('/api/home-stats', { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
      if (to) clearTimeout(to);
      var d = await res.json();
      if (!d || !d.success) throw new Error('bad response');
      countTo('stSellers', d.sellers || 0);
      countTo('stServices', d.services || 0);
      countTo('stOrders', d.completedOrders || 0);
      var has = d.reviews > 0 && d.avgRating != null;
      $('stRating').textContent = has ? Number(d.avgRating).toFixed(1) + ' / 5' : '—';
      $('stReviews').textContent = has ? 'من ' + fmt(d.reviews) + ' تقييم حقيقي' : 'لا توجد تقييمات بعد';
      setLive(true);
    } catch (e) { setLive(false); }
  }
  load();
  setInterval(function () { if (!document.hidden) load(); }, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
})();
