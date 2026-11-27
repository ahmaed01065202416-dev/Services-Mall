/* Safety net: never leave visitors (or Googlebot's renderer) staring at the loading screen if Firebase /
   platform settings are slow or blocked. The normal path (auth state + platform settings) still removes it
   as soon as it is ready; this only kicks in after 4 seconds. */
(function () {
  function hide(force) {
    var el = document.getElementById('appLoadingScreen');
    if (!el || el.classList.contains('fade-out')) return;
    // a page that is still waiting for the signed-in user (see handleHash) holds the splash; the safety timeout (force) never does
    if (window.__holdAppLoading && force !== true) return;
    el.classList.add('fade-out');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 600);
  }
  window.__hideAppLoading = hide;
  setTimeout(function () { hide(true); }, 4000);
  // A visitor who was NOT signed in last time (or is new) has nothing to wait for: the guest UI is the default, so the screen
  // goes as soon as the page is built instead of waiting for Firebase Auth's iframe (≈2 s on mobile). Returning signed-in users
  // (hint saved by the auth-state handler) still wait for the auth state so they never see the guest buttons flash.
  var hint = null; try { hint = localStorage.getItem('mall_authed'); } catch (e) {}
  if (hint !== '1') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(hide, 0); });
    else setTimeout(hide, 0);
  }
})();
