  // reveal «ابدأ كمسوّق» only while the program is enabled by the admin
  window.addEventListener('load', function () {
    try { DropshipUI.marketerEnabled().then(function (on) { var b = document.getElementById('heroMarketerBtn'); if (b && on) { b.classList.remove('hidden'); } }).catch(function () {}); } catch (e) {}
  });
