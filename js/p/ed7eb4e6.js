/* Show the hero as soon as its HTML is parsed instead of after ~35 synchronous scripts (DOMContentLoaded is several seconds away on
   a phone). Only for the plain home URL and visitors who were not signed in last time; everyone else keeps the normal flow
   (navigateTo('home') on DOMContentLoaded stays and is idempotent). */
(function () {
  try {
    if (location.hash && location.hash !== '#') return;
    var h = null; try { h = localStorage.getItem('mall_authed'); } catch (e) {}
    if (h === '1') return;
    var p = document.getElementById('page-home'); if (p) p.classList.add('active');
    if (window.__hideAppLoading) window.__hideAppLoading();
  } catch (e) {}
})();
