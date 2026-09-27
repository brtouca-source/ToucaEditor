'use strict';
(()=>{
 const geometry=window.toucaTimelineGeometry31;
 const previous=buildTimeline;let deferred=false,flushTimer=null;
 window.toucaFlushTimeline31=()=>{if(!deferred)return;clearTimeout(flushTimer);flushTimer=setTimeout(()=>buildTimeline(),600);};
 buildTimeline=function(){
  window.ToucaSoundPresets?.sync();
  // Waveform/thumbnail callbacks may finish while a handle is held. Keep that DOM alive.
  if(window.__toucaTimelineDrag31){deferred=true;return;}
  deferred=false;
  const result=previous.apply(this,arguments);
  document.querySelectorAll('.next-key-popover').forEach(x=>x.remove());
  const gutters=new Map();
  if(typeof cuts==='function')for(const cut of cuts()){
   if(!cut.b.transition||cut.b.transition.type==='none')continue;
   const mark=[...document.querySelectorAll('.transitionMark')].find(x=>Math.abs(parseFloat(x.style.left)-cut.time*pps)<.5);if(!mark)continue;
   const roomy=Math.min(cut.a.duration,cut.b.duration)*pps>=48;mark.classList.toggle('compact',!roomy);
   if(roomy){const a=gutters.get(cut.a.id)||{left:4,right:4},b=gutters.get(cut.b.id)||{left:4,right:4};a.right=20;b.left=20;gutters.set(cut.a.id,a);gutters.set(cut.b.id,b);}
  }
  for(const clip of P.clips){
   const node=document.querySelector(`.clip[data-id="${CSS.escape(clip.id)}"]`);if(!node)continue;
   node.dataset.mediaType=clip.type;const b=geometry.apply(node,clip,pps,gutters.get(clip.id));
   if(['image','video'].includes(clip.type)){
    const asset=P.assets.find(a=>a.id===clip.asset),url=asset?.thumbData||(clip.type==='image'?asset?.data:null);
    if(url){node.classList.add('v18Thumb');node.style.setProperty('--v18-thumb','url('+JSON.stringify(url)+')');}
    const strip=document.createElement('div');strip.className='next-media-strip';strip.setAttribute('aria-hidden','true');node.prepend(strip);
   }
   node.querySelectorAll('.clipKey').forEach(dot=>{
    const key=clip.keys?.[Number(dot.dataset.keyIndex)];if(!key||key.static)return;
    dot.style.left=Math.max(10,Math.min(Math.max(10,b.width-12),key.t*pps-b.inset))+'px';
   });
   // Dense keys keep their exact time; a chooser avoids overlapping hit targets.
   const dots=[...node.querySelectorAll('.clipKey')].filter(d=>clip.keys?.[Number(d.dataset.keyIndex)]&&!clip.keys[Number(d.dataset.keyIndex)].static).sort((a,b)=>parseFloat(a.style.left)-parseFloat(b.style.left));
   const groups=[];for(const dot of dots){dot.tabIndex=0;dot.setAttribute('role','button');dot.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();dot.click();}};const last=groups.at(-1);if(last&&parseFloat(dot.style.left)-parseFloat(last.at(-1).style.left)<22)last.push(dot);else groups.push([dot]);}
   for(const group of groups.filter(g=>g.length>1)){
    group.forEach(d=>{d.style.display='none';});
    const pick=document.createElement('button');pick.className='next-key-cluster';pick.textContent='◆ '+group.length;pick.title=group.length+' keyframes próximos — escolher';pick.style.left=Math.max(6,Math.min(b.width-34,parseFloat(group[0].style.left)))+'px';pick.onpointerdown=e=>e.stopPropagation();
    pick.onclick=e=>{e.stopPropagation();const menu=document.createElement('div');menu.className='next-popover next-key-popover';menu.setAttribute('popover','auto');for(const dot of group){const key=clip.keys[Number(dot.dataset.keyIndex)],choice=document.createElement('button');choice.textContent=key.t.toFixed(2)+' s'+(Math.abs(key.t)<.001?' · Início':Math.abs(key.t-clip.duration)<.001?' · Fim':'');choice.onclick=()=>{menu.hidePopover();dot.click();menu.remove();};menu.append(choice);}document.body.append(menu);const r=pick.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(r.left,innerWidth-280))+'px';menu.style.top=Math.max(8,r.top-Math.min(group.length*42+20,320))+'px';menu.addEventListener('toggle',ev=>{if(ev.newState==='closed')menu.remove();});menu.showPopover();};node.append(pick);
   }
  }
  for(const clip of P.clips){const node=document.querySelector(`.clip[data-id="${CSS.escape(clip.id)}"]`);if(node)window.ToucaScenes?.decorate(node,clip);}
  window.ToucaScenes?.decorateRuler();
  return result;
 };
 buildTimeline();
 const setVersion=()=>{P.editorVersion='31.6.0';const status=document.getElementById('pwaStatus');if(status)status.textContent='Touca Editor Next · 31.6';};
 const previousChanged=changed;changed=function(){const result=previousChanged.apply(this,arguments);setVersion();return result;};
 setVersion();setTimeout(setVersion,1500);
})();
