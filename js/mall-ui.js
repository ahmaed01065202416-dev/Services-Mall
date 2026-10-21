/* Mall Services — home-page motion (no libraries). Adds a soft scroll-reveal to the
   static home sections only; dynamic app views are untouched. Respects reduced motion. */
(function () {
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  function init() {
    var els = document.querySelectorAll('#page-home > section:not(.m-hero):not(#homeStoresSection)');
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('m-in'); io.unobserve(e.target); } });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    els.forEach(function (el) { el.classList.add('m-rv'); io.observe(el); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
