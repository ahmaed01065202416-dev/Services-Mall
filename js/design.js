/* Mall Services — site design switch (admin-controlled).
   Two designs: 'navy' (كحلي وذهبي, default) and 'mint' (نعناع وذهب).
   • The admin picks one in the "تصميم الموقع" tab → saved to settings/platform.SITE_DESIGN.
   • Every visitor gets <html data-design="…"> before first paint from localStorage; constants.js
     calls MallDesign.sync() after it loads settings/platform, so a new choice reaches everyone on
     their next load (and is cached again).
   Loaded in <head> (sync) on index.html and the static pages. */
(function () {
  'use strict';
  var d = document.documentElement, K = 'mallDesign', OK = { navy: 1, mint: 1 };
  var TC = { navy: ['#FBF8F2', '#0E1A33'], mint: ['#E6F0EA', '#08191A'] };
  function cur() { try { var v = localStorage.getItem(K); if (OK[v]) return v; } catch (e) {} return 'navy'; }
  function meta() {
    var v = d.getAttribute('data-design') || 'navy', m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = TC[v][d.classList.contains('dark') ? 1 : 0];
  }
  // the hero search box exists once in the DOM; park it inside whichever home design is active
  var ms = null, orig = null;
  function place() {
    ms = ms || document.querySelector('#mallDesign .msearch, #mallDesignB .msearch');
    if (!ms) return;
    if (!orig) orig = { p: ms.parentNode, n: ms.nextSibling };
    var slot = document.getElementById('mb-msearch');
    if (d.getAttribute('data-design') === 'mint' && slot) { if (ms.parentNode !== slot) slot.appendChild(ms); }
    else if (ms.parentNode !== orig.p) orig.p.insertBefore(ms, orig.n && orig.n.parentNode === orig.p ? orig.n : null);
  }
  function apply(v) {
    if (!OK[v]) v = 'navy';
    d.setAttribute('data-design', v);
    meta(); place();
  }
  apply(cur());
  document.addEventListener('DOMContentLoaded', function () { place(); meta(); });
  // theme.js rewrites <meta theme-color> whenever html.dark flips; re-assert ours right after it
  new MutationObserver(meta).observe(d, { attributes: true, attributeFilter: ['class'] });

  function save(v) { try { localStorage.setItem(K, v); } catch (e) {} }
  window.MallDesign = {
    get: cur,
    // called by constants.js once settings/platform has loaded
    sync: function (v) { if (!OK[v]) return; save(v); if (v !== (d.getAttribute('data-design') || 'navy')) apply(v); },
    preview: function (v) { apply(v); },
    renderAdminTab: function (box, isAr) {
      var active = cur();
      var defs = [
        { id: 'navy', t: isAr ? 'كحلي وذهبي' : 'Navy & gold', d: isAr ? 'التصميم الأساسي: خلفية كريمي، كحلي عميق، ولمسات ذهبية.' : 'Base design: cream, deep navy, gold accents.', c: ['#FBF8F2', '#0E1A33', '#E0B872', '#0F766E'] },
        { id: 'mint', t: isAr ? 'نعناع وذهب (هوية البراند)' : 'Mint & gold (brand identity)', d: isAr ? 'مستوحى من الشعار: قوس، زمردي، ذهبي، وخلفية نعناعية متحركة.' : 'From the logo: arch, emerald, gold, animated mint background.', c: ['#E6F0EA', '#0C1830', '#B8935A', '#0F7A6C'] }
      ];
      var sel = active;
      function draw() {
        box.innerHTML =
          '<div class="mb-4"><h3 class="font-black text-gray-900 flex items-center gap-2"><i class="fa-solid fa-palette text-amber-500"></i>' + (isAr ? 'تصميم الموقع' : 'Site design') + '</h3>' +
          '<p class="text-sm text-gray-500 mt-1">' + (isAr ? 'اختار التصميم وهيتطبق على الموقع كله لكل الزوّار (الرئيسية والهيدر والفوتر والصفحات والألوان والخطوط).' : 'Pick a design — it applies site-wide for every visitor.') + '</p></div>' +
          '<div class="grid sm:grid-cols-2 gap-4" id="designCards">' + defs.map(function (x) {
            var on = sel === x.id;
            return '<button type="button" data-d="' + x.id + '" class="text-start rounded-2xl border-2 p-4 transition ' + (on ? 'border-amber-500 bg-amber-50' : 'border-gray-200 bg-white hover:border-gray-300') + '">' +
              '<div class="flex gap-1.5 mb-3">' + x.c.map(function (c) { return '<span style="background:' + c + ';width:34px;height:34px;border-radius:50%;border:1px solid rgba(0,0,0,.12);display:inline-block"></span>'; }).join('') + '</div>' +
              '<div class="font-black text-gray-900 flex items-center gap-2">' + x.t + (on ? '<span class="text-xs font-bold bg-amber-500 text-white rounded-full px-2 py-0.5">' + (isAr ? 'المختار' : 'Selected') + '</span>' : '') + '</div>' +
              '<p class="text-sm text-gray-500 mt-1">' + x.d + '</p></button>';
          }).join('') + '</div>' +
          '<div class="flex flex-wrap items-center gap-3 mt-5">' +
          '<button type="button" id="designSave" class="bg-navy-900 text-white font-bold px-6 py-2.5 rounded-xl hover:opacity-90 transition"><i class="fa-solid fa-check"></i> ' + (isAr ? 'حفظ وتفعيل للجميع' : 'Save & activate for everyone') + '</button>' +
          '<button type="button" id="designPrev" class="border border-gray-300 text-gray-700 font-bold px-5 py-2.5 rounded-xl hover:bg-gray-50 transition"><i class="fa-solid fa-eye"></i> ' + (isAr ? 'معاينة عندي فقط' : 'Preview (only me)') + '</button>' +
          '<span class="text-xs text-gray-400">' + (isAr ? 'المعاينة مش بتتحفظ، وبتتلغي بعد إعادة التحميل.' : 'Preview is not saved.') + '</span></div>';
        box.querySelectorAll('[data-d]').forEach(function (b) { b.onclick = function () { sel = b.getAttribute('data-d'); draw(); }; });
        box.querySelector('#designPrev').onclick = function () { apply(sel); };
        box.querySelector('#designSave').onclick = async function () {
          var btn = this; btn.disabled = true;
          try {
            var payload = { SITE_DESIGN: sel, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
            try { if (window.AppState && AppState.currentUser) payload.updatedBy = AppState.currentUser.uid; } catch (e) {}
            await window.db.collection('settings').doc('platform').set(payload, { merge: true });
            try { if (typeof PLATFORM === 'object') PLATFORM.SITE_DESIGN = sel; } catch (e) {}
            save(sel); apply(sel);
            if (window.showToast) showToast(isAr ? '✅ تم تفعيل التصميم للموقع كله' : '✅ Design activated site-wide', 'success');
          } catch (err) {
            console.error('[MallDesign]', err);
            if (window.showToast) showToast(isAr ? 'تعذّر الحفظ: ' + (err && err.message || '') : 'Save failed', 'error');
          }
          btn.disabled = false; draw();
        };
      }
      draw();
    }
  };
})();
