/* Mall Services — home scroll-story. GSAP + ScrollTrigger (no Lenis: native scroll keeps the SPA's modals/pages intact).
   Boots lazily the first time the home container is on screen, refreshes triggers whenever it is shown again. */
(function(){
  var MallHome=window.MallHome={_done:false,_boot:null};

MallHome._boot=function(){
  var LOGO='icons/logo-mark.png';
  document.querySelectorAll('#mallDesign [data-logo]').forEach(function(i){i.src=LOGO;});
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  gsap.registerPlugin(ScrollTrigger);

  var AR='٠١٢٣٤٥٦٧٨٩';function ar(n){return String(n).replace(/\d/g,function(d){return AR[d];});}
  var IC={design:'<path d="M12 52l3-11L41 15l8 8L23 49z M36 20l8 8"/>',code:'<path d="M24 22L12 32l12 10M40 22l12 10-12 10M35 18l-6 28"/>',market:'<path d="M12 28l26-12v32L12 36z M12 28v8 M18 36l3 14h6l-2-12 M45 25c4 4 4 10 0 14 M51 19c7 7 7 19 0 26"/>',write:'<path d="M18 10h22l8 8v36H18z M40 10v8h8 M24 30h18M24 38h18M24 46h11"/>',video:'<path d="M8 16h36v32H8z M44 29l12-7v20l-12-7z"/>',product:'<path d="M32 8l22 11v26L32 56 10 45V19z M10 19l22 11 22-11 M32 30v26"/>',
   cart:'<path d="M6 10h8l6 30h28l6-22H18 M26 50h.1M44 50h.1"/>',shield:'<path d="M32 6l20 8v16c0 14-9 22-20 28C21 52 12 44 12 30V14z M23 30l7 7 12-14"/>',check:'<path d="M14 34l12 12 24-28"/>'};
  function svg(k){return '<svg viewBox="0 0 64 64">'+IC[k]+'</svg>';}
  
  /* منتجات توضيحية */
  var P=[['قالب موقع متجر','قوالب','code','#0F766E','#115E59',390],['كتاب التسويق الرقمي','كتب إلكترونية','write','#B8935A','#7A5C2E',120],['باقة هوية بصرية','تصميم','design','#2B4170','#0F766E',850],['كورس مونتاج فيديو','دورات','video','#8A6A3A','#2B4170',450],['إدارة حملة إعلانية','تسويق','market','#115E59','#B8935A',1200],['تطبيق موبايل جاهز','برمجة','code','#1B2A4A','#14B8A6',2500],['سماعات لاسلكية','إلكترونيات','product','#2B4170','#B8935A',680],['ترجمة ٥٠٠٠ كلمة','ترجمة','write','#B8935A','#0F766E',300]];
  function th(p,k){return '<div class="th" style="--a:'+p[3]+';--b:'+p[4]+'">'+svg(k||p[2])+'</div>';}
  function store(n){var c='';for(var i=0;i<n;i++){var p=P[i];c+='<div class="pd">'+th(p)+'<div class="pi"><b>'+p[0]+'</b><span>'+ar(p[5])+' ج.م</span></div></div>';}
    return '<div class="wb"><i></i><i></i><i></i><span>متجرك.com</span></div><div class="sh"><div class="sh-h"><b class="sn"><img class="lgm" src="'+LOGO+'" alt="">متجرك</b><em><span class="ct">'+'السلة</span></em></div><div class="ban"><b>منتجات رقمية جاهزة</b><span>جديد</span><i class="bdc"></i></div><div class="gd">'+c+'</div></div>';}
  function phone(sheet){return '<div class="pt"><img class="lgm" src="'+LOGO+'" alt="">إتمام الطلب</div><div class="prow">'+th(P[0])+'<div><b>'+P[0][0]+'</b><small>'+ar(P[0][5])+' ج.م</small></div></div><div class="escb">'+svg('shield')+'دفع محمي بنظام Escrow</div><button class="pay">ادفع '+ar(P[0][5])+' ج.م</button>'+(sheet?'<div class="sheet" id="md-sSheet"><div class="ok">'+svg('check')+'</div><b>تم حجز المبلغ بأمان</b><small>يتحرر بعد موافقتك</small></div>':'');}
  function toast(){return '<i>'+svg('check')+'</i><div>طلب جديد<small>'+P[0][0]+' · +'+ar(P[0][5])+' ج.م</small></div>';}
  document.getElementById('md-hWin').innerHTML=store(6);document.getElementById('md-hPhone').innerHTML=phone(false);document.getElementById('md-hToast').innerHTML=toast();
  document.getElementById('md-sWin').innerHTML=store(6);document.getElementById('md-sPhone').innerHTML=phone(true);document.getElementById('md-sToast').innerHTML=toast();
  /* خطوات القصة */
  var S=[['١','افتح متجرك','سجّل واختار اسم متجرك وهويته.'],['٢','ارفع منتجاتك','قوالب وكتب ودورات وخدمات، كل حاجة بسعرها ووصفها.'],['٣','العميل بيطلب','بيضيف للسلة ويطلب من موبايله أو من اللاب توب.'],['٤','دفع محمي','المبلغ بيتحجز بنظام Escrow لحد التسليم.'],['٥','استلم فلوسك','بعد موافقة العميل، المبلغ بيتحوّل لك.']];
  document.getElementById('md-steps').innerHTML=S.map(function(s){return '<div class="stp"><b>'+s[0]+'</b><h2>'+s[1]+'</h2><p>'+s[2]+'</p></div>';}).join('');
  document.getElementById('md-sbar').innerHTML=S.map(function(){return '<i></i>';}).join('');
  /* سوق المنتجات */
  document.getElementById('md-pg').innerHTML=P.map(function(p,i){return '<div class="pc">'+th(p)+'<div class="bd"><small>'+p[1]+'</small><h3>'+p[0]+'</h3><div class="rw"><span class="pr">'+ar(p[5])+' ج.م</span><span class="st">★ '+ar('4.'+(5+i%5)).replace('#mallDesign .','٫')+'</span></div><button class="add" data-i="'+i+'">أضف للسلة</button></div></div>';}).join('');
  var cnt=0,cc=document.getElementById('md-cc');
  document.querySelectorAll('#mallDesign .add').forEach(function(b){b.addEventListener('click',function(){var on=b.classList.toggle('done');cnt+=on?1:-1;b.textContent=on?'تمت الإضافة ✓':'أضف للسلة';cc.textContent=ar(cnt);if(!reduce)gsap.fromTo(cc,{scale:1.6},{scale:1,duration:.4,ease:'back.out(3)'});});});
  /* تيلت 3D خفيف */
  document.querySelectorAll('#mallDesign .pc').forEach(function(c){c.addEventListener('pointermove',function(e){var r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;c.style.transform='rotateY('+x*8+'deg) rotateX('+(-y*8)+'deg)';});c.addEventListener('pointerleave',function(){c.style.transform='';});});
  document.getElementById('md-lst').innerHTML=['لوحة بكل الطلبات والمبيعات','رفع المنتجات الرقمية وتسليمها للعميل بعد الدفع','فلوسك محمية بنظام Escrow لحد التسليم','متجر بهويتك وروابط تشاركها مع عملائك'].map(function(t){return '<li><i>'+svg('check')+'</i>'+t+'</li>';}).join('');
  var H=[30,48,40,66,55,82,95];document.getElementById('md-bars').innerHTML=H.map(function(h){return '<i style="height:'+h+'%"></i>';}).join('');
  var tk=['قوالب مواقع','كتب إلكترونية','دورات','هويات بصرية','تطبيقات','متاجر إلكترونية','إلكترونيات','خدمات تسويق','ترجمة','مونتاج'],t='';
  for(var r=0;r<6;r++)tk.forEach(function(x){t+='<span>'+x+'</span><b>◆</b>';});document.getElementById('md-tk').innerHTML=t;

  function split(el){var ws=el.textContent.trim().split(/\s+/);el.innerHTML=ws.map(function(w){return '<span class="w"><i>'+w+'</i></span> ';}).join('');return el.querySelectorAll('#mallDesign .w>i');}
  var hw=split(document.getElementById('md-h1')),ew=split(document.getElementById('md-eh'));

  if(reduce){gsap.set('#mallDesign .stp',{opacity:0});gsap.set('#mallDesign .stp:last-child',{opacity:1});gsap.set('#md-sSheet',{yPercent:0});document.getElementById('md-eb').textContent=ar(390)+' ج.م';return;}

  /* هيرو */
  gsap.set(hw,{yPercent:115});
  gsap.timeline({defaults:{ease:'power3.out'}}).from('#md-kk',{y:16,opacity:0,duration:.6},'-=.3').to(hw,{yPercent:0,duration:1,stagger:.07},'-=.3').from('#md-lead,#md-acts',{y:20,opacity:0,duration:.7,stagger:.1},'-=.6')
    .from('#md-hWin',{y:60,opacity:0,duration:1},'-=1').from('#md-hPhone',{x:-60,opacity:0,duration:.9},'-=.7').from('#md-hToast',{y:-30,opacity:0,duration:.7},'-=.5').from('#md-hWin .pd',{y:16,opacity:0,stagger:.06,duration:.5},'-=.7')
    .from('#md-hLogoIn',{scale:0,rotation:-160,duration:1.2,ease:'back.out(1.7)'},'-=.9');
  /* أقواس الخلفية */
  gsap.set('#md-deco path',{strokeDasharray:1,strokeDashoffset:1});
  gsap.to('#md-deco path',{strokeDashoffset:0,duration:1.8,ease:'power2.inOut',stagger:.25,delay:.4});
  gsap.to('#md-deco',{opacity:.55,duration:3,ease:'sine.inOut',yoyo:true,repeat:-1,delay:3});
  gsap.to('#md-hLogo',{yPercent:-12,ease:'none',scrollTrigger:{trigger:'#mallDesign .hero',start:'top top',end:'bottom top',scrub:true}});
  /* حركة مستمرة للوجو */
  gsap.to('#md-hRing',{rotation:360,duration:22,ease:'none',repeat:-1});
  gsap.fromTo('#md-hPulse',{scale:1,opacity:.7},{scale:1.65,opacity:0,duration:2.4,ease:'power1.out',repeat:-1,delay:2});
  gsap.to('#md-hLogoIn',{y:-9,duration:3,ease:'sine.inOut',yoyo:true,repeat:-1,delay:3});
  gsap.to('#md-hWin',{y:-8,duration:4.2,ease:'sine.inOut',yoyo:true,repeat:-1,delay:3.2});
  gsap.to('#md-hPhone',{y:-12,duration:4.8,ease:'sine.inOut',yoyo:true,repeat:-1,delay:3.4});
  /* طلبات جديدة بتتكرر + الكارت المقابل بيلمع */
  var oi=0;
  function cyc(){oi=(oi+1)%6;var p=P[oi],t=document.getElementById('md-hToast'),cards=document.querySelectorAll('#md-hWin .pd');
    gsap.timeline().to(t,{scale:.88,opacity:0,duration:.3,ease:'power2.in'})
      .add(function(){t.innerHTML='<i>'+svg('check')+'</i><div>طلب جديد<small>'+p[0]+' · +'+ar(p[5])+' ج.م</small></div>';})
      .to(t,{scale:1,opacity:1,duration:.55,ease:'back.out(2.2)'})
      .fromTo(cards[oi],{boxShadow:'0 0 0 0 rgba(20,184,166,0)'},{boxShadow:'0 0 0 3px #14B8A6',duration:.35,yoyo:true,repeat:1},'-=.45');}
  gsap.delayedCall(5,function loop(){cyc();gsap.delayedCall(4.5,loop);});
  /* برالاكس بالماوس */
  if(matchMedia('(hover:hover)').matches){
    var q=function(sel,p,d){return gsap.quickTo(sel,p,{duration:d||.9,ease:'power3'});};
    var wx=q('#md-hWin','x'),wry=q('#md-hWin','rotationY'),wrx=q('#md-hWin','rotationX'),px=q('#md-hPhone','x'),tx=q('#md-hToast','x'),lx=q('#md-hLogo','x'),dx=q('#md-deco','x');
    gsap.set('#md-hWin',{transformPerspective:1000});
    document.querySelector('#mallDesign .hero').addEventListener('pointermove',function(e){var k=(e.clientX/innerWidth-.5)*2,ky=(e.clientY/innerHeight-.5)*2;
      wx(k*-8);wry(k*7);wrx(ky*-5);px(k*-20);tx(k*-26);lx(k*-34);dx(k*12);});
  }
  gsap.to('#md-hWin',{yPercent:-6,ease:'none',scrollTrigger:{trigger:'#mallDesign .hero',start:'top top',end:'bottom top',scrub:true}});
  gsap.to('#md-hPhone',{yPercent:-18,ease:'none',scrollTrigger:{trigger:'#mallDesign .hero',start:'top top',end:'bottom top',scrub:true}});
  gsap.to('#md-hToast',{yPercent:30,ease:'none',scrollTrigger:{trigger:'#mallDesign .hero',start:'top top',end:'bottom top',scrub:true}});
  /* شريط */
  var l=gsap.fromTo('#md-tk',{xPercent:-16.666},{xPercent:0,duration:40,ease:'none',repeat:-1});
  ScrollTrigger.create({trigger:'#mallDesign .tick',start:'top bottom',end:'bottom top',onUpdate:function(s){l.timeScale(1+Math.abs(s.getVelocity())/260);gsap.to(l,{timeScale:1,duration:.9,overwrite:true,delay:.05});}});

  /* قصة البيع: شاشة المتجر بتتبني مع السكرول */
  var W='#md-sWin ',cart={v:0},earn={v:0};
  gsap.set([W+'.sh-h',W+'.ban'],{opacity:0,y:20});gsap.set(W+'.pd',{opacity:0,y:24,scale:.94});
  gsap.set('#md-sPhone',{x:-80,opacity:0});gsap.set('#md-sSheet',{yPercent:110});gsap.set('#md-sToast',{y:-40,opacity:0});gsap.set('#md-sEarn',{opacity:0,y:20});
  var tl=gsap.timeline({scrollTrigger:{trigger:'#md-sell',start:'top top',end:'bottom bottom',scrub:.6,onUpdate:function(s){var i=Math.min(4,Math.floor(s.progress*5));setStep(i);}}});
  tl.to([W+'.sh-h',W+'.ban'],{opacity:1,y:0,stagger:.25,duration:.7},0)
    .to(W+'.pd',{opacity:1,y:0,scale:1,stagger:.12,duration:.5},1)
    .to('#md-sPhone',{x:0,opacity:1,duration:.8},2)
    .to(W+'.pd:nth-child(1)',{boxShadow:'0 0 0 3px #14B8A6',duration:.3},2.2)
    .to(cart,{v:1,duration:.2,onUpdate:function(){W&&(document.querySelector('#md-sWin .ct').textContent='السلة '+ar(Math.round(cart.v)));}},2.4)
    .to('#md-sSheet',{yPercent:0,duration:.8,ease:'power3.out'},3)
    .to('#md-sToast',{y:0,opacity:1,duration:.6},4).to('#md-sEarn',{opacity:1,y:0,duration:.5},4.1)
    .to(earn,{v:390,duration:.8,onUpdate:function(){document.getElementById('md-eb').textContent=ar(Math.round(earn.v))+' ج.م';}},4.2).to({},{duration:.3},4.9);
  var curS=-1,SPs=document.querySelectorAll('#mallDesign .stp'),bars=document.querySelectorAll('#md-sbar i');
  function setStep(i){if(i===curS)return;gsap.to(SPs,{opacity:function(k){return k===i?1:0;},y:function(k){return k===i?0:(k<i?-24:24);},duration:.45,overwrite:true});bars.forEach(function(b,k){b.classList.toggle('on',k<=i);});curS=i;}
  setStep(0);

  /* سوق + بائعين */
  gsap.from('#mallDesign .pc',{y:60,opacity:0,duration:.8,stagger:.07,ease:'power3.out',scrollTrigger:{trigger:'#md-pg',start:'top 85%'}});
  gsap.from('#mallDesign .mk h2',{y:30,opacity:0,duration:.8,scrollTrigger:{trigger:'#mallDesign .mk',start:'top 75%'}});
  gsap.from('#md-bars i',{scaleY:0,stagger:.1,duration:.9,ease:'power3.out',scrollTrigger:{trigger:'#md-bars',start:'top 85%'}});
  gsap.from('#mallDesign .seller li',{x:30,opacity:0,stagger:.12,duration:.7,scrollTrigger:{trigger:'#md-lst',start:'top 85%'}});
  gsap.from('#md-dash',{y:50,opacity:0,duration:.9,scrollTrigger:{trigger:'#md-dash',start:'top 88%'}});
  gsap.set(ew,{yPercent:115});gsap.to(ew,{yPercent:0,stagger:.1,duration:1,ease:'power4.out',scrollTrigger:{trigger:'#mallDesign .end',start:'top 70%'}});
  gsap.from('#mallDesign .end img,#mallDesign .end .acts',{y:30,opacity:0,stagger:.15,duration:.8,scrollTrigger:{trigger:'#mallDesign .end',start:'top 70%'}});
};
  function go(){var el=document.getElementById('mallDesign');if(!el||!window.gsap||!window.ScrollTrigger)return;
    if(!MallHome._done){MallHome._done=true;try{MallHome._boot();}catch(e){console.warn('[MallHome]',e);}
      el.addEventListener('click',function(e){var a=e.target.closest('[data-go]');if(!a)return;e.preventDefault();if(window.navigateTo)navigateTo(a.getAttribute('data-go'));});}
    setTimeout(function(){ScrollTrigger.refresh();},60);}
  function watch(){var el=document.getElementById('mallDesign');if(!el)return;
    if('IntersectionObserver' in window){new IntersectionObserver(function(es){if(es[0].isIntersecting)go();},{rootMargin:'200px'}).observe(el);}else go();
    window.addEventListener('resize',function(){if(MallHome._done)ScrollTrigger.refresh();});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch);else watch();
})();
