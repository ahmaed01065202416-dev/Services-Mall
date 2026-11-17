/* Loads the Firebase Realtime Database + Storage compat SDKs AFTER first paint (they are only needed for chat/uploads).
   Triggers: browser idle (max 3s after window load) or the first user interaction, whichever is first. */
(function () {
  var started = false, cbs = [];
  function add(src) {
    return new Promise(function (res) {
      var s = document.createElement('script');
      s.src = src; s.async = false; s.onload = s.onerror = function () { res(); };
      document.head.appendChild(s);
    });
  }
  window.__loadFirebaseExtras = function () {
    if (started) return window.__fbExtras;
    started = true;
    window.__fbExtras = Promise.all([
      add('/vendor/js/firebase/firebase-database-compat.js'),
      add('/vendor/js/firebase/firebase-storage-compat.js')
    ]);
    return window.__fbExtras;
  };
  function go() { window.__loadFirebaseExtras(); }
  ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(function (e) { addEventListener(e, go, { once: true, passive: true }); });
  function idle() { (window.requestIdleCallback || function (f) { setTimeout(f, 1); })(go, { timeout: 3000 }); }
  if (document.readyState === 'complete') idle(); else addEventListener('load', idle);
})();
