function toggleFaq(el) {
  const ans = el.nextElementSibling;
  const icon = el.querySelector('.faq-icon');
  const isOpen = el.classList.contains('open');
  document.querySelectorAll('.faq-q.open').forEach(q => {
    q.classList.remove('open');
    q.nextElementSibling.classList.remove('open');
    q.querySelector('.faq-icon').classList.remove('open');
  });
  if (!isOpen) { el.classList.add('open'); ans.classList.add('open'); icon.classList.add('open'); }
}

function submitForm() {
  const name = document.getElementById('fname').value.trim();
  const email = document.getElementById('femail').value.trim();
  const msg = document.getElementById('fmsg').value.trim();
  if (!name || !email || !msg) { alert('يرجى ملء الحقول المطلوبة'); return; }
  document.getElementById('formSuccess').style.display = 'block';
  document.getElementById('fname').value = '';
  document.getElementById('femail').value = '';
  document.getElementById('fmsg').value = '';
}
