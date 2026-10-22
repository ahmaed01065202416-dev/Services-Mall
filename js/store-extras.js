/* Mall Services — store extras: 10 product-reveal animations + merchant custom theme.
   Stored on the store doc as  productAnim  (string)  and  customTheme  ({bg,text,card,accent,radius,font}). */
(function () {
  'use strict';
  var ANIMS = [
    ['none', 'بدون حركة', 'None'], ['fade', 'ظهور تدريجي', 'Fade up'], ['zoom', 'تكبير ناعم', 'Zoom in'], ['flip', 'قلب ثلاثي الأبعاد', '3D flip'],
    ['slide', 'انزلاق من الجانب', 'Slide in'], ['wave', 'موجة متتابعة', 'Wave'], ['blur', 'من ضبابي لواضح', 'Blur focus'],
    ['spin', 'دوران وظهور', 'Spin pop'], ['bounce', 'ارتداد', 'Bounce'], ['tilt', 'إمالة عند التمرير', 'Hover tilt'], ['shine', 'لمعان', 'Shine sweep']
  ];
  var FONTS = { 'Readex Pro': "'Readex Pro',system-ui,sans-serif", 'System': 'system-ui,-apple-system,Segoe UI,sans-serif', 'Serif': "Georgia,'Times New Roman',serif", 'Mono': "ui-monospace,Menlo,Consolas,monospace" };
  var HEX = /^#[0-9a-fA-F]{6}$/;
  function isAr() { return (window.AppState || {}).language !== 'en'; }
  function safeCT(ct) {
    if (!ct || typeof ct !== 'object' || !ct.on) return null;
    var o = { on: true };
    ['bg', 'text', 'card', 'accent'].forEach(function (k) { o[k] = HEX.test(ct[k] || '') ? ct[k] : ''; });
    o.radius = Math.max(0, Math.min(32, parseInt(ct.radius, 10) || 16));
    o.font = FONTS[ct.font] ? ct.font : 'Readex Pro';
    return o;
  }
  function validAnim(a) { return ANIMS.some(function (x) { return x[0] === a; }) ? a : 'fade'; }

  var io = null, mo = null;
  function reveal(grid) {
    var kids = Array.prototype.slice.call(grid.children);
    kids.forEach(function (c, i) { c.style.setProperty('--i', i % 12); c.classList.remove('sx-in'); });
    if (grid.getAttribute('data-sx') === 'none' || matchMedia('(prefers-reduced-motion: reduce)').matches) { kids.forEach(function (c) { c.classList.add('sx-in'); }); return; }
    if (!('IntersectionObserver' in window)) { kids.forEach(function (c) { c.classList.add('sx-in'); }); return; }
    if (io) io.disconnect();
    io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('sx-in'); io.unobserve(e.target); } }); }, { threshold: .12, rootMargin: '0px 0px -30px 0px' });
    kids.forEach(function (c) { io.observe(c); });
  }

  function applyTheme(wrap, ct) {
    if (!wrap) return;
    var t = safeCT(ct);
    wrap.classList.toggle('sx-custom', !!t);
    ['--sx-bg', '--sx-text', '--sx-card', '--sx-accent', '--sx-r', '--sx-font'].forEach(function (k) { wrap.style.removeProperty(k); });
    if (!t) return;
    if (t.bg) wrap.style.setProperty('--sx-bg', t.bg);
    if (t.text) wrap.style.setProperty('--sx-text', t.text);
    if (t.card) wrap.style.setProperty('--sx-card', t.card);
    if (t.accent) wrap.style.setProperty('--sx-accent', t.accent);
    wrap.style.setProperty('--sx-r', t.radius + 'px'); wrap.style.setProperty('--sx-font', FONTS[t.font]);
  }

  /** Called by StoresManager.openStore after the product cards are rendered. */
  function setup(gridId, anim, ct) {
    var grid = document.getElementById(gridId); if (!grid) return;
    grid.setAttribute('data-sx', validAnim(anim));
    applyTheme(document.getElementById('storeThemeWrap'), ct);
    reveal(grid);
    if (mo) mo.disconnect();
    mo = new MutationObserver(function () { mo.disconnect(); reveal(grid); mo.observe(grid, { childList: true }); });   // filter/search re-renders
    mo.observe(grid, { childList: true });
  }

  /* ── Editor inside the store dashboard → "Design" tab ─────────────── */
  function paintEditor(SM) {
    var box = document.getElementById('stExtras'); if (!box) return;
    var d = SM._draft, ct = d.customTheme || { on: false, bg: '#FBF8F2', text: '#0E1A33', card: '#FFFFFF', accent: '#0F766E', radius: 16, font: 'Readex Pro' };
    var cur = validAnim(d.productAnim);
    function col(key, label) { return '<label class="flex items-center gap-2 text-xs font-bold text-gray-600"><input type="color" data-ct="' + key + '" value="' + (HEX.test(ct[key] || '') ? ct[key] : '#ffffff') + '" class="w-9 h-9 rounded-lg border-0 p-0 cursor-pointer">' + label + '</label>'; }
    box.innerHTML =
      '<div class="space-y-5">' +
      '<div><p class="text-sm font-black text-gray-800 mb-2">' + (isAr() ? 'حركة ظهور المنتجات' : 'Product reveal animation') + '</p>' +
      '<div class="grid grid-cols-2 sm:grid-cols-3 gap-2" id="sxAnimPick">' + ANIMS.map(function (a) { return '<button type="button" data-a="' + a[0] + '" class="sx-pick ' + (cur === a[0] ? 'on' : '') + '">' + (isAr() ? a[1] : a[2]) + '</button>'; }).join('') + '</div>' +
      '<div id="sxDemo" class="grid grid-cols-4 gap-2 mt-3" data-sx="' + cur + '">' + [1, 2, 3, 4].map(function () { return '<div class="sx-demo-card"></div>'; }).join('') + '</div></div>' +
      '<div><label class="flex items-center gap-2 text-sm font-black text-gray-800 mb-2"><input type="checkbox" id="sxCtOn" ' + (ct.on ? 'checked' : '') + '> ' + (isAr() ? 'ثيم مخصص لمتجري (ألواني وخطي)' : 'Custom theme for my store') + '</label>' +
      '<div id="sxCtBox" class="grid grid-cols-2 gap-3 ' + (ct.on ? '' : 'opacity-50 pointer-events-none') + '">' +
      col('bg', isAr() ? 'الخلفية' : 'Background') + col('text', isAr() ? 'النص' : 'Text') + col('card', isAr() ? 'الكروت' : 'Cards') + col('accent', isAr() ? 'لون التمييز' : 'Accent') +
      '<label class="text-xs font-bold text-gray-600 col-span-2">' + (isAr() ? 'استدارة الزوايا' : 'Corner radius') + ' <input type="range" min="0" max="32" value="' + ct.radius + '" id="sxRad" class="w-full"></label>' +
      '<label class="text-xs font-bold text-gray-600 col-span-2">' + (isAr() ? 'الخط' : 'Font') + ' <select id="sxFont" class="form-input mt-1">' + Object.keys(FONTS).map(function (f) { return '<option ' + (ct.font === f ? 'selected' : '') + '>' + f + '</option>'; }).join('') + '</select></label></div></div></div>';
    function playDemo(a) { var g = document.getElementById('sxDemo'); g.setAttribute('data-sx', a); reveal(g); }
    playDemo(cur);
    function push() {
      var o = { on: document.getElementById('sxCtOn').checked, radius: +document.getElementById('sxRad').value, font: document.getElementById('sxFont').value };
      box.querySelectorAll('[data-ct]').forEach(function (i) { o[i.getAttribute('data-ct')] = i.value; });
      document.getElementById('sxCtBox').classList.toggle('opacity-50', !o.on); document.getElementById('sxCtBox').classList.toggle('pointer-events-none', !o.on);
      d.customTheme = o; applyTheme(document.getElementById('stPreview'), o);
    }
    box.querySelector('#sxAnimPick').onclick = function (e) {
      var b = e.target.closest('[data-a]'); if (!b) return; d.productAnim = b.getAttribute('data-a');
      box.querySelectorAll('.sx-pick').forEach(function (x) { x.classList.toggle('on', x === b); }); playDemo(d.productAnim);
    };
    box.querySelector('#sxCtBox').addEventListener('input', push); box.querySelector('#sxCtOn').addEventListener('change', push);
    if (ct.on) applyTheme(document.getElementById('stPreview'), ct);
  }

  window.StoreExtras = { ANIMS: ANIMS, setup: setup, paintEditor: paintEditor, applyTheme: applyTheme, safeCT: safeCT, validAnim: validAnim };
})();
