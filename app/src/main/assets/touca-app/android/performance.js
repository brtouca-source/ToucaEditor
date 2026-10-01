'use strict';
(()=>{
 const Android=window.ToucaAndroid||(window.ToucaAndroid={});
 const $=id=>document.getElementById(id),browserPerf=window.performance;
 let installed=false,lastPaint=0,lastAdapt=0,samples=[],zoomRaf=0;
 // Android WebView may omit navigator.deviceMemory. Use the Redmi A5's low-memory profile.
 const memory=Number(navigator.deviceMemory||2);
 const previewLevels=memory<=3?[480,600,720]:memory<=6?[540,720,900]:[720,900,1080];
 let previewIndex=memory<=3?0:1;

 function releaseElement(record){
   try{record?.source?.disconnect?.()}catch{}
   const el=record?.el;if(!el)return;
   try{el.pause?.()}catch{}
   try{el.removeAttribute?.('src');el.load?.()}catch{}
 }
 function releaseUnusedMedia(keepIds=new Set(P.assets.map(a=>a.id))){
   for(const [id,record] of cache){if(keepIds.has(id))continue;releaseElement(record);cache.delete(id)}
 }
 function resizePreview(force=false){
   if(exporting)return;
   const canvas=$('preview'),[pw,ph]=dimensions(),long=previewLevels[previewIndex],scale=Math.min(1,long/Math.max(pw,ph));
   const w=Math.max(2,Math.round(pw*scale/2)*2),h=Math.max(2,Math.round(ph*scale/2)*2);
   if(force||canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;draw()}
   document.documentElement.dataset.previewQuality=String(long);
 }
 function measure(cost){
   samples.push(cost);if(samples.length>45)samples.shift();
   const now=browserPerf.now();if(now-lastAdapt<1800||samples.length<16)return;lastAdapt=now;
   const avg=samples.reduce((a,b)=>a+b,0)/samples.length;samples=[];
   if(avg>24&&previewIndex>0){previewIndex--;resizePreview(true)}
   else if(avg<11&&previewIndex<previewLevels.length-1&&!playing){previewIndex++;resizePreview(true)}
 }
 function onMemoryPressure(level){
   if(level>=10&&previewIndex>0){previewIndex=0;resizePreview(true)}
   releaseUnusedMedia();
 }

 function install(){
   if(installed)return;installed=true;
   const baseRender=renderUI,baseLoad=loadAsset,baseRestore=restoreProject;

   renderUI=function(full=true){const r=baseRender(full);resizePreview();return r};
   loadAsset=async function(asset){return baseLoad(asset)};
   restoreProject=async function(obj,...rest){
     const incoming=new Set((obj?.assets||[]).map(a=>a.id));releaseUnusedMedia(incoming);
     const r=await baseRestore(obj,...rest);releaseUnusedMedia();resizePreview(true);return r;
   };

   loop=function(){
     if(!playing)return;
     const now=browserPerf.now();t=Math.min(total(),(now-clock)/1000);
     const targetFps=exporting?(Android.exportEngine?.activeFps||30):30,interval=1000/targetFps;
     if(now-lastPaint>=interval-1){
       const started=browserPerf.now();syncMedia();draw();drawPlayhead();if(exporting&&exportFrame)exportFrame();lastPaint=now;
       if(!exporting)measure(browserPerf.now()-started);
     }
     if(t>=total()){pause();if(exporting)finishRecord();return}
     raf=requestAnimationFrame(loop);
   };

   startClipDrag=function(e){
     if(exporting||e.button!==0)return;e.stopPropagation();pause();
     const c=P.clips.find(x=>x.id===e.currentTarget.dataset.id);if(!c)return;
     selected=c.id;keyIndex=0;$('editScope').value='clip';
     const original=clone(c),startX=e.clientX,handle=e.target.dataset.handle,positions=P.clips.map(x=>[x.id,x.start]),order=mainClips().map(x=>x.id);
     let moved=false,paintRaf=0;
     const paint=()=>{paintRaf=0;for(const clip of P.clips){const el=document.querySelector(`.clip[data-id="${CSS.escape(clip.id)}"]`);if(el){el.style.left=clip.start*pps+'px';el.style.width=Math.max(6,clip.duration*pps)+'px'}}draw();drawPlayhead()};
     const schedule=()=>{if(!paintRaf)paintRaf=requestAnimationFrame(paint)};
     const move=ev=>{
       const dx=ev.clientX-startX;if(!moved&&Math.abs(dx)<5)return;if(!moved){checkpoint();moved=true}
       Object.assign(c,clone(original));for(const [id,pos]of positions){const x=P.clips.find(x=>x.id===id);if(x)x.start=pos}
       const delta=snapFrame(dx/pps),asset=P.assets.find(x=>x.id===c.asset);
       if(handle==='right'){let d=Math.max(1/30,original.duration+delta);if(asset&&asset.type!=='image')d=Math.min(d,Math.floor((asset.duration-(c.offset||0))*30)/30);resizeClip(c,d,$('resizeMode').value)}
       else if(handle==='left'){let cut=clamp(delta,-original.start,original.duration-1/30);if(asset&&asset.type!=='image')cut=Math.max(-(original.offset||0),cut);trimClip(c,cut,original.duration)}
       else c.start=Math.max(0,snapFrame(original.start+delta));
       if(c.track==='main'&&hasMagnet()){if(handle)compactMain(order.map(id=>P.clips.find(x=>x.id===id)).filter(Boolean));else placeMain(c,c.start)}
       else if(!handle&&$('snap').checked){for(const mark of [t,0,...P.clips.filter(x=>x.id!==c.id&&x.track===c.track).flatMap(x=>[x.start,x.start+x.duration])])if(Math.abs(c.start-mark)*pps<9){c.start=mark;break}}
       schedule();
     };
     const end=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointercancel',end);if(paintRaf){cancelAnimationFrame(paintRaf);paint()}if(moved)changed();else renderUI(false)};
     window.addEventListener('pointermove',move,{passive:true});window.addEventListener('pointerup',end,{once:true});window.addEventListener('pointercancel',end,{once:true});
   };

   const zoom=$('timelineZoom');if(zoom)zoom.oninput=e=>{pps=Number(e.target.value);if(!zoomRaf)zoomRaf=requestAnimationFrame(()=>{zoomRaf=0;buildTimeline()})};

   // Do not replace beginGesture/moveGesture/endGesture: 31.6 already owns pinch, rotate, scale and keyframe gestures.
   setTimeout(()=>{resizePreview(true);buildTimeline();draw()},0);
 }
 Android.performance={install,onMemoryPressure,releaseUnusedMedia,get quality(){return previewLevels[previewIndex]},get levels(){return [...previewLevels]}};
})();
