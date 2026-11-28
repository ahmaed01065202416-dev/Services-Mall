(function () {
  var btn = document.getElementById('retry');
  var st = document.getElementById('status');
  function say(t) { if (st) st.textContent = t; }
  if (btn) btn.addEventListener('click', function () {
    say('جاري المحاولة…');
    setTimeout(function () { location.reload(); }, 150);
  });
  // as soon as the connection is back, reload the page the visitor wanted
  window.addEventListener('online', function () {
    say('رجع الاتصال — جاري التحميل…');
    setTimeout(function () { location.reload(); }, 400);
  });
  if (navigator.onLine === false) say('أنت غير متصل حالياً');
})();
