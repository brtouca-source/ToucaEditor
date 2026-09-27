'use strict';
(()=>{
  const VERSION='25.0.0',$=id=>document.getElementById(id),qa=s=>[...document.querySelectorAll(s)];
  document.documentElement.dataset.toucaV25='true';
  try{P.editorVersion=VERSION;}catch{}
  if($('pwaStatus'))$('pwaStatus').textContent='Touca Editor Desktop · v25.0.0 · aplicativo local';
  const clamp25=(v,a,b)=>Math.max(a,Math.min(b,v));

  // v25: v23 gives every .clip top:2px!important. Drag ghosts are also .clip,
  // so their normal inline top was being ignored and the ghost jumped to the app header.
  // Mirror the real inline drag coordinates into CSS vars that win with !important.
  const syncGhost25=g=>{
    if(!g?.classList?.contains('v21DragGhost'))return;
    const r=g.getBoundingClientRect();
    const rawTop=g.style.getPropertyValue('top');
    const rawLeft=g.style.getPropertyValue('left');
    const top=(rawTop&&rawTop!=='auto')?rawTop:(Number.isFinite(r.top)?r.top+'px':'0px');
    const left=(rawLeft&&rawLeft!=='auto')?rawLeft:(Number.isFinite(r.left)?r.left+'px':'0px');
    const h=parseFloat(g.style.getPropertyValue('--touca-ghost-h'))||parseFloat(g.style.height)||r.height||38;
    const w=parseFloat(g.style.getPropertyValue('--touca-ghost-w'))||parseFloat(g.style.width)||r.width||80;
    if(g.style.getPropertyValue('--touca-v25-ghost-top')!==top)g.style.setProperty('--touca-v25-ghost-top',top);
    if(g.style.getPropertyValue('--touca-v25-ghost-left')!==left)g.style.setProperty('--touca-v25-ghost-left',left);
    g.style.setProperty('--touca-ghost-h',Math.max(1,h)+'px');
    g.style.setProperty('--touca-ghost-w',Math.max(1,w)+'px');
  };
  const scanGhosts25=()=>qa('.v21DragGhost').forEach(syncGhost25);
  const ghostObserver25=new MutationObserver(records=>{
    let needed=false;
    for(const r of records){
      if(r.type==='attributes'&&r.target?.classList?.contains('v21DragGhost')){needed=true;break;}
      if(r.type==='childList'&&[...r.addedNodes].some(n=>n.nodeType===1&&(n.classList?.contains('v21DragGhost')||n.querySelector?.('.v21DragGhost')))){needed=true;break;}
    }
    if(needed)queueMicrotask(scanGhosts25);
  });
  ghostObserver25.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['style']});

  // v25: one authoritative duration control. It edits the stored animation/transition
  // object directly and blocks the card click/drag handlers from re-applying defaults.
  let lastCtx25=null;
  const decorateBefore25=window.__toucaV23DecorateLibrary;
  function nearestCut25(){try{return cuts().sort((a,b)=>Math.abs(a.time-t)-Math.abs(b.time-t))[0]||null;}catch{return null;}}
  function animationTargets25(ctx){
    if(ctx?.extra?.targets?.length)return ctx.extra.targets.filter(Boolean);
    if(ctx?.target)return [ctx.target];
    try{const c=current?.();return c?[c]:[];}catch{return [];}
  }
  function selection25(ctx){
    if(ctx?.mode==='animation'){
      const side=ctx.side==='out'?'out':'in',items=[];
      for(const clip of animationTargets25(ctx)){
        const spec=clip?.animation?.[side];
        if(spec)items.push({clip,spec});
      }
      const first=items[0];
      return {mode:'animation',side,items,id:first?.spec?.name||'',duration:Number(first?.spec?.duration)||.3};
    }
    if(ctx?.mode==='transition'){
      const cut=ctx.extra?.cut||nearestCut25(),spec=cut?.b?.transition;
      return {mode:'transition',cut,spec,id:spec?.type||'',duration:Number(spec?.duration)||.3};
    }
    return {mode:ctx?.mode||'',id:'',duration:.3};
  }
  function applyDuration25(ctx,value){
    let d=clamp25(Number(value)||.1,.1,3),actual=d;
    const sel=selection25(ctx);
    if(sel.mode==='animation'&&sel.items.length){
      for(const {clip,spec} of sel.items){
        const max=Math.max(.1,Number(clip.duration)||d);
        spec.duration=Math.min(d,max);
        actual=Math.min(actual,spec.duration);
      }
      try{draw?.();}catch{}
      return actual;
    }
    if(sel.mode==='transition'&&sel.spec&&sel.cut){
      const max=Math.max(.1,Math.min(Number(sel.cut.a?.duration)||d,Number(sel.cut.b?.duration)||d));
      sel.spec.duration=Math.min(d,max);actual=sel.spec.duration;
      try{draw?.();}catch{}
      return actual;
    }
    return d;
  }
  function mountDuration25(ctx){
    const grid=$('v19LibraryGrid');if(!grid||!ctx)return;
    const sel=selection25(ctx);if(!sel.id)return;
    const card=[...grid.querySelectorAll('.v19Card')].find(x=>x.dataset.resource===sel.id);if(!card)return;
    card.querySelector('.v23CardDuration')?.remove();
    card.querySelector('.v25DurationControl')?.remove();
    const box=document.createElement('div');box.className='v25DurationControl';
    let max=3;
    if(sel.mode==='animation'&&sel.items.length)max=Math.min(3,...sel.items.map(x=>Math.max(.1,Number(x.clip.duration)||3)));
    if(sel.mode==='transition'&&sel.cut)max=Math.min(3,Math.max(.1,Number(sel.cut.a?.duration)||3),Math.max(.1,Number(sel.cut.b?.duration)||3));
    max=Math.max(.1,max);
    const start=clamp25(sel.duration,.1,max);
    box.innerHTML=`<span>Duração</span><input type="range" min="0.10" max="${max.toFixed(2)}" step="0.05" value="${start.toFixed(2)}"><output>${start.toFixed(2)}s</output>`;
    const range=box.querySelector('input'),out=box.querySelector('output');
    const stop=e=>{e.stopPropagation();e.stopImmediatePropagation?.();};
    const commit=()=>{try{changed?.();}catch{};setTimeout(()=>mountDuration25(lastCtx25),0);};
    for(const ev of ['pointerdown','pointermove','pointerup','pointercancel','mousedown','mouseup','click'])box.addEventListener(ev,stop);
    range.addEventListener('pointerdown',e=>{stop(e);card.dataset.dragged='1';try{range.setPointerCapture(e.pointerId);}catch{}},{capture:true});
    range.addEventListener('input',e=>{stop(e);const actual=applyDuration25(lastCtx25,range.value);range.value=Number(actual).toFixed(2);out.textContent=Number(actual).toFixed(2)+'s';},{capture:true});
    range.addEventListener('change',e=>{stop(e);commit();},{capture:true});
    range.addEventListener('pointerup',e=>{stop(e);applyDuration25(lastCtx25,range.value);setTimeout(()=>{card.dataset.dragged='';},60);commit();},{capture:true});
    range.addEventListener('keydown',e=>{e.stopPropagation();});
    card.append(box);
  }
  window.__toucaV23DecorateLibrary=function(ctx){
    lastCtx25=ctx||lastCtx25;
    decorateBefore25?.(lastCtx25);
    queueMicrotask(()=>mountDuration25(lastCtx25));
  };
  setTimeout(()=>{try{window.__toucaV23DecorateLibrary?.(lastCtx25);}catch{}},250);
})();
