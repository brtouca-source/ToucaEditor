'use strict';
(()=>{
 const $=id=>document.getElementById(id),isMedia=c=>c&&['image','video'].includes(c.type);
 const actualKeys=c=>(c.keys||[]).filter(k=>!k.static);
 // A static transform remains editable but is not a keyframe and has no diamond.
 window.toucaDeleteKey29=function(c,index){
  if(!isMedia(c)||!c.keys[index]||c.keys[index].static)return;
  checkpoint();const base=valueAt(c.keys,Math.max(0,t-c.start));
  c.keys.splice(index,1);c.v26AutoEndKey=false;
  if(!c.keys.length){c.staticPose=clone(base);c.keys=[{t:0,v:clone(base),ease:'linear',static:true}];$('editScope').value='clip';}
  keyIndex=Math.max(0,Math.min(index,c.keys.length-1));changed();
 };
 const insertBefore=insertKey;
 insertKey=function(c,local){
  if(c.keys.every(k=>k.static)){
   const v=valueAt(c.keys,local);c.keys=[{t:clamp(snapFrame(local),0,c.duration),v:clone(v),ease:'linear'}];delete c.staticPose;c.v26AutoEndKey=false;return 0;
  }
  // Do not synthesize boundary keyframes while inserting an intermediate one.
  local=clamp(snapFrame(local),0,c.duration);let idx=c.keys.findIndex(k=>Math.abs(k.t-local)<.001);if(idx>=0)return idx;
  const v=valueAt(c.keys,local);c.keys.push({t:local,v,ease:'linear'});c.keys.sort((a,b)=>a.t-b.t);return c.keys.findIndex(k=>k.t===local);
 };
 const sliceBefore=sliceKeys;
 sliceKeys=function(keys,a,b){if(keys.length===1)return [{...keys[0],t:keys[0].static?0:clamp(keys[0].t-a,0,Math.max(0,b-a)),v:clone(keys[0].v)}];return sliceBefore(keys,a,b);};
 const buildBefore=buildTimeline;
 buildTimeline=function(){
  normalizeAnimations();const r=buildBefore();
  for(const c of P.clips){
   const el=document.querySelector(`.clip[data-id="${CSS.escape(c.id)}"]`);if(!el)continue;
   el.querySelectorAll('.edgeKey').forEach(x=>x.remove());
   el.querySelectorAll('.clipKey').forEach((dot,i)=>{
    if(!isMedia(c)||!c.keys[i]||c.keys[i].static){dot.remove();return;}
    dot.dataset.keyIndex=i;dot.setAttribute('aria-label',`Keyframe ${i+1}`);
   });
  }
  return r;
 };
 const inspectBefore=inspector;
 inspector=function(){const r=inspectBefore();const c=current(),has=isMedia(c)&&actualKeys(c).length>0;
  for(const id of ['deleteKey','quickKeyRemove'])if($(id))$(id).disabled=!has;
  if(isMedia(c)&&!has){$('keyList')?.replaceChildren();$('editScope').value='clip';}
  return r;
 };
 for(const id of ['deleteKey','quickKeyRemove']){
  const b=$(id);if(!b)continue;
  b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();const c=current();if(c)window.toucaDeleteKey29(c,keyIndex);},true);
 }
 let keySelected=false;
 document.addEventListener('pointerdown',e=>{keySelected=!!e.target.closest?.('.clipKey');},true);
 document.addEventListener('keydown',e=>{
  if(!keySelected||!['Delete','Backspace'].includes(e.key)||e.target.closest?.('input,textarea,[contenteditable]'))return;
  const c=current();if(!isMedia(c))return;e.preventDefault();e.stopImmediatePropagation();window.toucaDeleteKey29(c,keyIndex);
 },true);
 // Canonical animation fields; the compatibility view keeps old UI code working.
 function normalizeAnimations(){
  for(const c of P.clips){
   if(Object.getOwnPropertyDescriptor(c,'animation')?.get)continue;
   let exposed=!!c.animation;const old=c.animation||{};c.animationIn=c.animationIn??old.in??null;c.animationOut=c.animationOut??old.out??null;
   const view={};Object.defineProperties(view,{in:{enumerable:true,get:()=>c.animationIn,set:v=>c.animationIn=v},out:{enumerable:true,get:()=>c.animationOut,set:v=>c.animationOut=v}});
   Object.defineProperty(c,'animation',{configurable:true,enumerable:false,get:()=>exposed||c.animationIn||c.animationOut?view:null,set:v=>{exposed=v!=null;c.animationIn=v?.in||null;c.animationOut=v?.out||null;}});
  }
 }
 const changedBefore=changed;
 changed=function(){normalizeAnimations();const r=changedBefore();P.editorVersion='29.0.0';return r;};
 const restoreBefore=restoreProject;
 restoreProject=async function(...args){const r=await restoreBefore(...args);normalizeAnimations();buildTimeline();return r;};
 // Honest single export status: do not call an untested WebCodecs route "native GPU".
 const showBefore=showExport;
 showExport=async function(...args){const r=await showBefore(...args);
  for(const id of ['v26PerfBadge','v27EngineBadge'])$(id)?.remove();
  const label=$('v24ExportEngine')?.querySelector('span');
  if(label)label.textContent='Composição Touca + H.264 · verificando saída…';
  window.toucaNative?.nativeExportCapabilities?.().then(c=>{if(label)label.textContent=c?.available?'Composição Touca + H.264; áudio e MP4 processados pelo FFmpeg local.':'Composição e codificação WebCodecs; MP4 gravado diretamente no disco.';}).catch(()=>{});
  return r;
 };
 $('exportBtn').onclick=showExport;
 normalizeAnimations();buildTimeline();
 setTimeout(()=>{$('pwaStatus').textContent='Touca Editor · 29 · Estabilidade';P.editorVersion='29.0.0';},1200);
})();
