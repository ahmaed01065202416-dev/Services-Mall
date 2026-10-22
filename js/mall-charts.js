/* Mall Services — dashboard charts (pure SVG, no libraries).
   MallCharts.seller(container, orders, isAr)  → revenue/orders line chart + order-status donut
   MallCharts.admin(afterEl, orders, users)     → platform revenue/orders chart + users donut + status bars */
(function () {
  'use strict';
  var C = { teal: '#14B8A6', tealD: '#0F766E', gold: '#E0B872', navy: '#16254A', rose: '#e11d48', slate: '#94a3b8' };
  var uid = 0;
  function ms(t) { if (!t) return 0; if (t.toMillis) return t.toMillis(); if (t.seconds) return t.seconds * 1000; var d = new Date(t).getTime(); return isNaN(d) ? 0 : d; }
  function fmt(n) { return Math.round(n || 0).toLocaleString('en-US'); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ST() { return window.ORDER_STATUS || {}; }

  /** Daily buckets for the last n days → {labels, rev[], cnt[]} */
  function buckets(orders, n, revOf, filter) {
    var day = 864e5, end = new Date(); end.setHours(23, 59, 59, 999);
    var start = end.getTime() - n * day + 1, labels = [], rev = [], cnt = [], i;
    for (i = 0; i < n; i++) { var d = new Date(start + i * day); labels.push(d.getDate() + '/' + (d.getMonth() + 1)); rev.push(0); cnt.push(0); }
    orders.forEach(function (o) {
      if (filter && !filter(o)) return;
      var t = ms(o.createdAt); if (t < start || t > end.getTime()) return;
      var k = Math.floor((t - start) / day); if (k < 0 || k >= n) return;
      rev[k] += revOf(o); cnt[k] += 1;
    });
    return { labels: labels, rev: rev, cnt: cnt };
  }

  /** Area/line chart. series: [{name,color,vals,unit}] — returns {html, bind(el)} */
  function line(labels, series, isAr) {
    var id = 'mc' + (++uid), W = 640, H = 220, P = { l: 44, r: 12, t: 14, b: 26 }, iw = W - P.l - P.r, ih = H - P.t - P.b;
    var max = 1; series.forEach(function (s) { s.vals.forEach(function (v) { if (v > max) max = v; }); });
    var step = Math.pow(10, Math.floor(Math.log10(max))); max = Math.ceil(max / step) * step || 1;
    var n = labels.length, x = function (i) { return P.l + (n === 1 ? iw / 2 : iw * i / (n - 1)); }, y = function (v) { return P.t + ih - ih * v / max; };
    var g = '', i;
    for (i = 0; i <= 4; i++) { var gy = P.t + ih * i / 4; g += '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + gy + '" y2="' + gy + '" stroke="currentColor" opacity=".1"/><text x="' + (P.l - 6) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="10" fill="currentColor" opacity=".55">' + fmt(max * (4 - i) / 4) + '</text>'; }
    var every = Math.ceil(n / 7);
    labels.forEach(function (l, k) { if (k % every === 0 || k === n - 1) g += '<text x="' + x(k) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10" fill="currentColor" opacity=".55">' + esc(l) + '</text>'; });
    var defs = '', paths = '';
    series.forEach(function (s, si) {
      var pts = s.vals.map(function (v, k) { return x(k) + ',' + y(v); }), d = 'M' + pts.join(' L');
      defs += '<linearGradient id="' + id + 'g' + si + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + s.color + '" stop-opacity=".35"/><stop offset="1" stop-color="' + s.color + '" stop-opacity="0"/></linearGradient>';
      paths += '<path d="' + d + ' L' + x(n - 1) + ',' + (P.t + ih) + ' L' + x(0) + ',' + (P.t + ih) + ' Z" fill="url(#' + id + 'g' + si + ')"/><path class="mc-line" d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" pathLength="1"/>';
    });
    var html = '<div class="mc-wrap" id="' + id + '"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + (isAr ? 'رسم بياني' : 'Chart') + '"><defs>' + defs + '</defs>' + g + paths +
      '<line class="mc-cur" y1="' + P.t + '" y2="' + (P.t + ih) + '" stroke="currentColor" opacity="0" stroke-dasharray="3 3"/>' +
      series.map(function (s, si) { return '<circle class="mc-dot" data-s="' + si + '" r="4.5" fill="' + s.color + '" stroke="#fff" stroke-width="2" opacity="0"/>'; }).join('') +
      '</svg><div class="mc-tip" hidden></div></div>';
    function bind(root) {
      var el = (root || document).querySelector('#' + id); if (!el) return;
      var svg = el.querySelector('svg'), tip = el.querySelector('.mc-tip'), cur = el.querySelector('.mc-cur'), dots = el.querySelectorAll('.mc-dot');
      function move(ev) {
        var r = svg.getBoundingClientRect(), cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left, vx = cx / r.width * W;
        var k = Math.max(0, Math.min(n - 1, Math.round((vx - P.l) / iw * (n - 1))));
        cur.setAttribute('x1', x(k)); cur.setAttribute('x2', x(k)); cur.setAttribute('opacity', '.35');
        dots.forEach(function (d, si) { d.setAttribute('cx', x(k)); d.setAttribute('cy', y(series[si].vals[k])); d.setAttribute('opacity', '1'); });
        tip.hidden = false;
        tip.innerHTML = '<b>' + esc(labels[k]) + '</b>' + series.map(function (s) { return '<span><i style="background:' + s.color + '"></i>' + esc(s.name) + ': <b>' + fmt(s.vals[k]) + (s.unit ? ' ' + s.unit : '') + '</b></span>'; }).join('');
        var left = x(k) / W * r.width; tip.style.left = Math.max(70, Math.min(r.width - 70, left)) + 'px';
      }
      function leave() { tip.hidden = true; cur.setAttribute('opacity', '0'); dots.forEach(function (d) { d.setAttribute('opacity', '0'); }); }
      svg.addEventListener('pointermove', move); svg.addEventListener('pointerleave', leave); svg.addEventListener('touchmove', move, { passive: true }); svg.addEventListener('touchend', leave);
      if (window.gsap && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        gsap.fromTo(el.querySelectorAll('.mc-line'), { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.2, ease: 'power2.out', stagger: .15 });
      }
    }
    return { html: html, bind: bind };
  }

  /** Donut. items: [{label,value,color}] */
  function donut(items, centerLabel, isAr) {
    var tot = items.reduce(function (s, i) { return s + i.value; }, 0), R = 54, Cc = 2 * Math.PI * R, off = 0;
    var segs = tot ? items.filter(function (i) { return i.value > 0; }).map(function (i) {
      var len = Cc * i.value / tot, s = '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="' + i.color + '" stroke-width="18" stroke-dasharray="' + len + ' ' + (Cc - len) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 70 70)"/>'; off += len; return s;
    }).join('') : '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="currentColor" opacity=".1" stroke-width="18"/>';
    return '<div class="mc-donut"><svg viewBox="0 0 140 140" role="img" aria-label="' + esc(centerLabel) + '">' + segs + '<text x="70" y="68" text-anchor="middle" font-size="22" font-weight="800" fill="currentColor">' + fmt(tot) + '</text><text x="70" y="86" text-anchor="middle" font-size="10" fill="currentColor" opacity=".6">' + esc(centerLabel) + '</text></svg>' +
      '<ul>' + items.map(function (i) { return '<li><i style="background:' + i.color + '"></i><span>' + esc(i.label) + '</span><b>' + fmt(i.value) + '</b></li>'; }).join('') + '</ul></div>';
  }

  /** Horizontal bars. items: [{label,value,color}] */
  function bars(items) {
    var max = Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1]));
    return '<div class="mc-bars">' + items.map(function (i) { return '<div><span>' + esc(i.label) + '</span><em><i style="width:' + (i.value / max * 100) + '%;background:' + i.color + '"></i></em><b>' + fmt(i.value) + '</b></div>'; }).join('') + '</div>';
  }

  function panel(id, title, tabsHtml, inner) {
    return '<section id="' + id + '" class="mc-panel"><div class="mc-head"><h3>' + title + '</h3>' + tabsHtml + '</div>' + inner + '</section>';
  }
  function tabs(isAr) { return '<div class="mc-tabs" role="tablist">' + [7, 30, 90].map(function (n, i) { return '<button type="button" role="tab" data-n="' + n + '" aria-selected="' + (i === 1) + '">' + n + (isAr ? ' يوم' : 'd') + '</button>'; }).join('') + '</div>'; }

  function mount(host, html, where) {
    var old = document.getElementById(host.id); if (old) old.remove();
    var tmp = document.createElement('div'); tmp.innerHTML = html; return tmp.firstElementChild;
  }

  /* ── Seller ───────────────────────────────────────────────────────── */
  function seller(container, orders, isAr) {
    if (!container) return;
    var S = ST(), done = function (o) { return o.status === S.COMPLETED; };
    var revOf = function (o) { return o.sellerEarning || (o.price || 0) * 0.9; };
    var old = document.getElementById('mallSellerCharts'); if (old) old.remove();
    var lost = [S.REFUNDED, S.CANCELLED], wait = [S.ACCEPTED, S.PENDING];
    var cDone = orders.filter(done).length, cLost = orders.filter(function (o) { return lost.indexOf(o.status) > -1; }).length,
      cWait = orders.filter(function (o) { return wait.indexOf(o.status) > -1; }).length, cProg = orders.length - cDone - cLost - cWait;
    var sec = document.createElement('div');
    function draw(n) {
      var b = buckets(orders, n, revOf, done), b2 = buckets(orders, n, function () { return 1; });
      var lc = line(b.labels, [{ name: isAr ? 'الأرباح' : 'Earnings', color: C.teal, vals: b.rev, unit: isAr ? 'ج.م' : 'EGP' }, { name: isAr ? 'الطلبات' : 'Orders', color: C.gold, vals: b2.cnt }], isAr);
      var total = b.rev.reduce(function (a, v) { return a + v; }, 0);
      sec.querySelector('.mc-main').innerHTML = '<p class="mc-sum">' + (isAr ? 'أرباح آخر ' : 'Earnings, last ') + n + (isAr ? ' يوم: ' : ' days: ') + '<b>' + fmt(total) + ' ' + (isAr ? 'ج.م' : 'EGP') + '</b></p>' + lc.html;
      lc.bind(sec);
    }
    sec.innerHTML = panel('mallSellerCharts', isAr ? 'نظرة على أدائك' : 'Your performance', tabs(isAr),
      '<div class="mc-grid"><div class="mc-main"></div><div>' + donut([
        { label: isAr ? 'مكتملة' : 'Completed', value: cDone, color: C.teal }, { label: isAr ? 'جارية' : 'In progress', value: cProg, color: C.gold },
        { label: isAr ? 'بانتظار الدفع' : 'Awaiting payment', value: cWait, color: C.navy }, { label: isAr ? 'ملغاة/مرتجعة' : 'Cancelled/refunded', value: cLost, color: C.rose }], isAr ? 'طلب' : 'orders', isAr) + '</div></div>');
    var el = sec.firstElementChild; container.insertBefore(el, container.firstChild); sec = el;
    el.querySelector('.mc-tabs').addEventListener('click', function (e) { var bt = e.target.closest('button'); if (!bt) return; el.querySelectorAll('.mc-tabs button').forEach(function (x) { x.setAttribute('aria-selected', x === bt); }); draw(+bt.dataset.n); });
    draw(30);
  }

  /* ── Admin ────────────────────────────────────────────────────────── */
  function admin(afterEl, orders, users) {
    if (!afterEl) return;
    var isAr = (window.AppState || {}).language !== 'en', S = ST();
    var old = document.getElementById('mallAdminCharts'); if (old) old.remove();
    var holder = document.createElement('div');
    holder.innerHTML = panel('mallAdminCharts', isAr ? 'نمو المنصة' : 'Platform growth', tabs(isAr), '<div class="mc-grid"><div class="mc-main"></div><div class="mc-side"></div></div>');
    var el = holder.firstElementChild; afterEl.insertAdjacentElement('afterend', el);
    var sellers = users.filter(function (u) { return u.role === 'seller'; }).length, admins = users.filter(function (u) { return u.role === 'admin'; }).length, buyers = users.length - sellers - admins;
    var groups = [[isAr ? 'مكتملة' : 'Completed', [S.COMPLETED], C.teal], [isAr ? 'جارية' : 'In progress', [S.IN_PROGRESS, S.PAYMENT_HELD, S.DELIVERED, S.REVISION], C.gold], [isAr ? 'معلّقة' : 'Pending', [S.PENDING, S.ACCEPTED], C.navy], [isAr ? 'ملغاة/مرتجعة' : 'Cancelled/refunded', [S.CANCELLED, S.REFUNDED], C.rose]];
    el.querySelector('.mc-side').innerHTML = donut([{ label: isAr ? 'مشترون' : 'Buyers', value: buyers, color: C.teal }, { label: isAr ? 'بائعون' : 'Sellers', value: sellers, color: C.gold }, { label: isAr ? 'مسؤولون' : 'Admins', value: admins, color: C.navy }], isAr ? 'مستخدم' : 'users', isAr) +
      '<h4>' + (isAr ? 'الطلبات حسب الحالة' : 'Orders by status') + '</h4>' + bars(groups.map(function (g) { return { label: g[0], color: g[2], value: orders.filter(function (o) { return g[1].indexOf(o.status) > -1; }).length }; }));
    function draw(n) {
      var b = buckets(orders, n, function (o) { return o.price || 0; }), lc = line(b.labels, [{ name: isAr ? 'قيمة الطلبات' : 'Order value', color: C.teal, vals: b.rev, unit: isAr ? 'ج.م' : 'EGP' }, { name: isAr ? 'عدد الطلبات' : 'Orders', color: C.gold, vals: b.cnt }], isAr);
      var total = b.rev.reduce(function (a, v) { return a + v; }, 0), cnt = b.cnt.reduce(function (a, v) { return a + v; }, 0);
      el.querySelector('.mc-main').innerHTML = '<p class="mc-sum">' + n + (isAr ? ' يوم: ' : ' days: ') + '<b>' + fmt(cnt) + '</b> ' + (isAr ? 'طلب بقيمة ' : 'orders worth ') + '<b>' + fmt(total) + ' ' + (isAr ? 'ج.م' : 'EGP') + '</b></p>' + lc.html;
      lc.bind(el);
    }
    el.querySelector('.mc-tabs').addEventListener('click', function (e) { var bt = e.target.closest('button'); if (!bt) return; el.querySelectorAll('.mc-tabs button').forEach(function (x) { x.setAttribute('aria-selected', x === bt); }); draw(+bt.dataset.n); });
    draw(30);
  }

  window.MallCharts = { seller: seller, admin: admin, line: line, donut: donut, bars: bars };
})();
