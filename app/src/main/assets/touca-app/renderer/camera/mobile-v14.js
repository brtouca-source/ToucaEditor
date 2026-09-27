
(()=>{
  const byId14=id=>document.getElementById(id);
  const phone14=()=>matchMedia('(max-width:600px) and (orientation:portrait)').matches;

  // Keep the preview/render frame geometrically faithful to the project ratio on phones.
  // The renderer itself already uses dimensions(); this fixes only the CSS presentation that was
  // being stretched by the phone layout.
  function fitPhonePreview(){
    if(!phone14())return;
    const wrap=byId14('stageWrap'),box=byId14('canvasBox');
    if(!wrap||!box||typeof dimensions!=='function')return;
    const [pw,ph]=dimensions(),availW=Math.max(40,wrap.clientWidth-6),availH=Math.max(40,wrap.clientHeight-6);
    const scale=Math.max(.001,Math.min(availW/pw,availH/ph));
    const w=Math.max(1,Math.floor(pw*scale)),h=Math.max(1,Math.floor(ph*scale));
    box.style.setProperty('width',w+'px','important');
    box.style.setProperty('height',h+'px','important');
    box.style.setProperty('aspect-ratio',pw+' / '+ph,'important');
  }
  const wrap14=byId14('stageWrap');
  if(wrap14&&typeof ResizeObserver!=='undefined')new ResizeObserver(()=>fitPhonePreview()).observe(wrap14);
  byId14('ratio')?.addEventListener('change',()=>requestAnimationFrame(fitPhonePreview));
  addEventListener('orientationchange',()=>setTimeout(fitPhonePreview,80));
  addEventListener('resize',()=>requestAnimationFrame(fitPhonePreview),{passive:true});
  requestAnimationFrame(()=>requestAnimationFrame(fitPhonePreview));

  // On portrait phones, replace the frame-step arrows around Play with explicit keyframe controls.
  // Desktop/tablet keep the original arrows and behavior.
  const prev=byId14('prevFrame'),next=byId14('nextFrame');
  function configurePhoneTransport(){
    if(!prev||!next)return;
    if(phone14()){
      prev.textContent='◇+';prev.title='Adicionar keyframe no ponteiro';prev.setAttribute('aria-label','Adicionar keyframe');prev.classList.add('mobileKeyBtn');
      next.textContent='◇−';next.title='Excluir keyframe selecionado';next.setAttribute('aria-label','Excluir keyframe');next.classList.add('mobileKeyBtn');
      prev.onclick=()=>{const b=byId14('quickKeyAdd');if(b)b.click();else if(typeof toast==='function')toast('Selecione uma mídia visual para adicionar keyframe.');};
      next.onclick=()=>{const b=byId14('quickKeyRemove');if(b)b.click();else if(typeof toast==='function')toast('Selecione um keyframe para excluir.');};
    }else{
      prev.textContent='‹';prev.title='Voltar um frame (←)';prev.setAttribute('aria-label','Voltar um frame');prev.classList.remove('mobileKeyBtn');prev.onclick=()=>seek(t-1/30);
      next.textContent='›';next.title='Avançar um frame (→)';next.setAttribute('aria-label','Avançar um frame');next.classList.remove('mobileKeyBtn');next.onclick=()=>seek(t+1/30);
    }
  }
  configurePhoneTransport();
  addEventListener('resize',()=>configurePhoneTransport(),{passive:true});
  addEventListener('orientationchange',()=>setTimeout(configurePhoneTransport,80));

  // Two-finger pinch directly on the editing/timeline area.
  // One finger keeps the existing scroll/clip interactions. The existing +/- zoom controls remain.
  const scroll=byId14('timelineScroll');
  if(scroll){
    const touches=new Map();
    let pinch=false,startDistance=1,startPps=pps,anchorTime=0,latestLocalX=0,rafId=0;
    const pointDistance=()=>{const a=[...touches.values()];return a.length<2?1:Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y);};
    const midPoint=()=>{const a=[...touches.values()];return a.length<2?{x:0,y:0}:{x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2};};
    const applyPinch=()=>{
      rafId=0;if(!pinch||touches.size<2)return;
      const dist=pointDistance(),factor=dist/Math.max(1,startDistance),nextPps=clamp(startPps*factor,10,600),r=scroll.getBoundingClientRect(),mid=midPoint();
      latestLocalX=clamp(mid.x-r.left,0,r.width);
      if(Math.abs(nextPps-pps)<.15)return;
      pps=nextPps;
      const slider=byId14('timelineZoom');if(slider)slider.value=String(clamp(pps,Number(slider.min)||10,Number(slider.max)||180));
      buildTimeline();
      scroll.scrollLeft=Math.max(0,anchorTime*pps-latestLocalX);
    };
    const schedule=()=>{if(!rafId)rafId=requestAnimationFrame(applyPinch);};
    scroll.addEventListener('pointerdown',e=>{
      if(!phone14()||e.pointerType!=='touch')return;
      touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(touches.size===2){
        pinch=true;startDistance=pointDistance();startPps=pps;
        const r=scroll.getBoundingClientRect(),mid=midPoint();latestLocalX=clamp(mid.x-r.left,0,r.width);anchorTime=(scroll.scrollLeft+latestLocalX)/Math.max(1,pps);
        e.preventDefault();e.stopPropagation();
        // Clear a pending one-finger clip hold/drag before the pinch takes ownership.
        queueMicrotask(()=>{try{window.dispatchEvent(new PointerEvent('pointerup',{clientX:mid.x,clientY:mid.y,pointerType:'touch'}));}catch{}});
      }
    },{capture:true,passive:false});
    window.addEventListener('pointermove',e=>{
      if(!phone14()||e.pointerType!=='touch'||!touches.has(e.pointerId))return;
      touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pinch&&touches.size>=2){e.preventDefault();e.stopImmediatePropagation();schedule();}
    },{capture:true,passive:false});
    const endTouch=e=>{
      if(!e.isTrusted||e.pointerType!=='touch'||!touches.has(e.pointerId))return;
      const wasPinch=pinch;touches.delete(e.pointerId);
      if(touches.size<2){pinch=false;if(rafId){cancelAnimationFrame(rafId);rafId=0;}if(wasPinch){e.preventDefault();e.stopImmediatePropagation();}}
      if(!touches.size)touches.clear();
    };
    window.addEventListener('pointerup',endTouch,{capture:true,passive:false});
    window.addEventListener('pointercancel',endTouch,{capture:true,passive:false});
  }
})();
