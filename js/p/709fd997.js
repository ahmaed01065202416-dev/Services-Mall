function nlSub(){
  const e=document.getElementById('nlEmail'),m=document.getElementById('nlMsg');
  if(!e.value||!e.value.includes('@')){m.style.display='block';m.style.color='#fca5a5';m.textContent='بريد غير صحيح';return}
  m.style.display='block';m.style.color='#a7f3d0';m.textContent='✅ تم الاشتراك!';e.value='';
}
