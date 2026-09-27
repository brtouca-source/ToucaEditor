'use strict';
(()=>{
  const VERSION='26.0.0',SCHEMA=2,$=id=>document.getElementById(id),q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)],native=window.toucaNative||null;
  const clamp26=(v,a,b)=>Math.max(a,Math.min(b,v));
  const MEDIA26=['main','overlay','overlay2','overlay3','overlay4','overlay5','overlay6','overlay7'];
  const AUDIO26=['voice','music','audio3','audio4','audio5'];
  const EFFECT26=['effectsLocal','effects','effects2','effects3','effects4','effects5'];
  const LABEL26={main:'Camada 1 · Mídia principal',overlay:'Camada 2',overlay2:'Camada 3',overlay3:'Camada 4',overlay4:'Camada 5',overlay5:'Camada 6',overlay6:'Camada 7',overlay7:'Camada 8',subtitle:'Legendas',effectsLocal:'Efeito conectado',effects:'Efeito global 1',effects2:'Efeito global 2',effects3:'Efeito global 3',effects4:'Efeito global 4',effects5:'Efeito global 5',voice:'Áudio 1',music:'Áudio 2',audio3:'Áudio 3',audio4:'Áudio 4',audio5:'Áudio 5'};
  const isVisual26=c=>!!c&&['image','video'].includes(c.type),isText26=c=>!!c&&['text','subtitle'].includes(c.type),isAudio26=c=>!!c&&c.type==='audio',isEffect26=c=>!!c&&c.type==='effect';
  document.documentElement.dataset.toucaV26='true';
  try{P.editorVersion=VERSION;P.projectSchemaVersion=SCHEMA;}catch{}
  if($('pwaStatus'))$('pwaStatus').textContent='Touca Editor Desktop · v26 RC · aplicativo local';

  // ---------------------------------------------------------------------------
  // Project state schema + low-memory history
  // ---------------------------------------------------------------------------
  const assetData26=new Map();
  function rememberAssets26(){for(const a of P.assets||[])if(a?.id&&a.data)assetData26.set(a.id,{data:a.data,proxyData:a.proxyData||null,thumbData:a.thumbData||null});}
  function clonePlain26(v){try{return structuredClone(v);}catch{return JSON.parse(JSON.stringify(v));}}
  function stateSnapshot26(){rememberAssets26();return {...P,assets:(P.assets||[]).map(a=>{const o={...a};delete o.data;delete o.proxyData;return o;}),clips:clonePlain26(P.clips||[])};}
  function hydrateState26(s){const o={...s,assets:(s.assets||[]).map(a=>{const mem=assetData26.get(a.id)||{};return {...a,data:a.data||mem.data||null,proxyData:a.proxyData||mem.proxyData||null,thumbData:a.thumbData||mem.thumbData||null};}),clips:clonePlain26(s.clips||[])};return o;}
  checkpoint=function(){history.push(stateSnapshot26());if(history.length>80)history.shift();future=[];};
  undo=function(redo=false){if(playing)pause();const src=redo?future:history,dst=redo?history:future;if(!src.length)return;dst.push(stateSnapshot26());P=hydrateState26(src.pop());migrate26();selected=P.clips.some(c=>c.id===selected)?selected:null;rememberAssets26();renderUI();autosave();};

  // ---------------------------------------------------------------------------
  // Keyframes: default ending point is only "a little before" the boundary.
  // Dynamic gap avoids the exact last decoded frame without stealing a whole sec.
  // ---------------------------------------------------------------------------
  function endGap26(d){d=Math.max(1/30,Number(d)||1);return d>1.1?1:Math.min(1/30,d/2);}
  function autoEndTime26(d){return Math.max(1/30,d-endGap26(d));}
  function looksLikeOldAutoEnd26(c,last){if(!last)return false;const d=Number(c.duration)||0;return Math.abs(last.t-d)<.025||Math.abs(last.t-(d-1))<.035||Math.abs(last.t-(d-1/30))<.025;}
  const newClipBefore26=newClip;
  newClip=function(...args){const c=newClipBefore26(...args);if(isVisual26(c)&&c.keys?.length>1){const last=c.keys[c.keys.length-1];last.t=autoEndTime26(c.duration);c.v26AutoEndKey=true;}return c;};
  const resizeBefore26=resizeClip;
  resizeClip=function(c,d,mode='trim'){const wasAuto=!!c?.v26AutoEndKey;const r=resizeBefore26(c,d,mode);if(wasAuto&&isVisual26(c)&&c.keys?.length>1)c.keys[c.keys.length-1].t=autoEndTime26(c.duration);return r;};
  document.addEventListener('pointerdown',e=>{const dot=e.target.closest?.('.clipKey');if(!dot)return;const el=dot.closest('.clip'),c=P.clips.find(x=>x.id===el?.dataset.id);if(!c)return;const idx=Number(dot.dataset.keyIndex);if(Number.isInteger(idx)&&idx===c.keys.length-1)c.v26AutoEndKey=false;},{capture:true});

  function migrate26(){
    P.projectSchemaVersion=SCHEMA;P.editorVersion=VERSION;P.version=1;
    for(const a of P.assets||[])if(a?.id&&a.data)assetData26.set(a.id,{data:a.data,proxyData:a.proxyData||null,thumbData:a.thumbData||null});
    for(const c of P.clips||[]){
      if(!tracks.includes(c.track))c.track=isAudio26(c)?'voice':isEffect26(c)?'effects':isText26(c)?'subtitle':'main';
      c.start=Math.max(0,Number(c.start)||0);c.duration=Math.max(1/30,Number(c.duration)||1/30);c.offset=Math.max(0,Number(c.offset)||0);c.volume=clamp26(Number(c.volume??100),0,200);c.muted=!!c.muted;
      if(!Array.isArray(c.keys))c.keys=[{t:0,v:pose(),ease:'linear'},{t:autoEndTime26(c.duration),v:pose(),ease:'linear'}];
      if(!c.keys.length)c.keys=[{t:0,v:c.staticPose||pose(),ease:'linear',static:true}];
      c.keys.sort((a,b)=>a.t-b.t);
      if(isVisual26(c)&&c.keys.length>1){const last=c.keys[c.keys.length-1];if(!c.externalTiming&&looksLikeOldAutoEnd26(c,last)){last.t=autoEndTime26(c.duration);c.v26AutoEndKey=true;}last.t=clamp26(Number(last.t)||0,0,c.duration);}
      if(isEffect26(c)){if(c.track==='effectsLocal'&&!c.effectTargetTrack){c.effectTargetTrack='main';c.effectScope='target';}}
      if(c.brand){c.logoOpacity=Number.isFinite(c.logoOpacity)?c.logoOpacity:50;for(const k of c.keys||[]){k.v.x=0;k.v.opacity=50;}}
      if(c.animation){for(const side of ['in','out'])if(c.animation[side])c.animation[side].duration=clamp26(Number(c.animation[side].duration)||.42,.1,Math.max(.1,c.duration));}
    }
    rememberAssets26();
  }
  migrate26();

  // ---------------------------------------------------------------------------
  // Streaming project restore. Accepts local touca-media:// URLs (no base64 reload).
  // ---------------------------------------------------------------------------
  const restoreFallback26=restoreProject;
  restoreProject=async function(obj){
    if(!obj||!Array.isArray(obj.assets)||!Array.isArray(obj.clips))throw Error('Projeto Touca inválido.');
    if(!['9:16','16:9','1:1'].includes(obj.ratio))obj.ratio='9:16';
    const ids=new Set();
    for(const a of obj.assets){
      if(!['image','video','audio'].includes(a.type))throw Error('Tipo de mídia inválido.');
      if(typeof a.data!=='string'||(!a.data.startsWith('data:')&&!a.data.startsWith('touca-media://')))throw Error('Mídia local ausente: '+(a.name||a.id));
      ids.add(a.id);
    }
    for(const c of obj.clips){if(c.asset&&!ids.has(c.asset))throw Error('Mídia ausente: '+(c.name||c.id));}
    pause();for(const r of cache.values()){try{r.el?.pause();r.proxyEl?.pause();}catch{}}cache.clear();assetData26.clear();
    obj.version=1;obj.projectSchemaVersion=Number(obj.projectSchemaVersion)||1;P=obj;migrate26();
    const pending=[...P.assets];let cursor=0,failed=null;
    const worker=async()=>{while(cursor<pending.length&&!failed){const a=pending[cursor++];try{await loadAsset(a);}catch(e){failed=e;}}};
    await Promise.all(Array.from({length:Math.min(3,pending.length||1)},worker));if(failed)throw failed;
    selected=null;keyIndex=0;t=0;history=[];future=[];migrate26();renderUI();autosave();scheduleProxyPass26(1800);return true;
  };

  // ---------------------------------------------------------------------------
  // Native import: files are copied straight to the project store by Electron.
  // Fallback file inputs remain available if the native layer is unavailable.
  // ---------------------------------------------------------------------------
  let offloadTimer26=null,offloadBusy26=false;
  async function offloadLegacyAssets26(){
    if(offloadBusy26||!native?.storeAsset||!native?.getAssetUrl)return;
    const legacy=(P.assets||[]).filter(a=>a?.id&&typeof a.data==='string'&&a.data.startsWith('data:'));
    if(!legacy.length)return;
    P.projectId ||= uid();offloadBusy26=true;
    try{
      for(const a of legacy){
        try{
          let exists=await native.assetExists?.(P.projectId,a.id);
          if(!exists)await native.storeAsset(P.projectId,a.id,a.name,a.type,a.data);
          const local=await native.getAssetUrl(P.projectId,a.id,'asset');
          if(local){a.data=local;a.nativeStored=true;a.nativeStoredV18=true;assetData26.set(a.id,{data:local,proxyData:a.proxyData||null,thumbData:a.thumbData||null});}
        }catch(e){console.warn('offload local',a?.name,e);}
        await new Promise(r=>setTimeout(r,0));
      }
    }finally{offloadBusy26=false;}
  }
  function scheduleOffload26(delay=1400){clearTimeout(offloadTimer26);offloadTimer26=setTimeout(()=>offloadLegacyAssets26().then(()=>autosave()).catch(()=>{}),delay);}

  async function importNative26(kind='all'){
    if(!native?.importNativeFiles)return false;if(window.__toucaImportBusy29)return true;P.projectId ||= uid();window.__toucaImportBusy29=true;const importingProject=P;
    try{
      const list=await native.importNativeFiles(P.projectId,kind);if(!list?.length)return true;if(P!==importingProject)throw Error('O projeto mudou durante a importação.');
      checkpoint();let added=0;const audioAt=t;let audioCursor=audioAt;
      for(const a of list){
        try{
          await loadAsset(a);P.assets.push(a);assetData26.set(a.id,{data:a.data});
          const duration=a.type==='image'?Math.max(.1,Number($('defaultDuration')?.value)||5):Math.max(1/30,Math.floor((Number(a.duration)||1)*30)/30);
          const start=a.type==='audio'?audioCursor:mainClips().reduce((n,c)=>Math.max(n,c.start+c.duration),0);
          const c=newClip(a.type,a.name,a.id,a.type==='audio'?'voice':'main',start,duration);P.clips.push(c);
          if(a.type==='audio')audioCursor+=duration;selected=c.id;t=start;added++;
        }catch(e){console.warn(e);toast('Falha ao importar '+(a.name||'arquivo')+': '+e.message);}
      }
      migrate26();changed();await window.toucaSaveNow29?.();$('v18Home')?.classList.add('v18Hidden');closeSheets?.();toast(`${added} arquivo(s) adicionados diretamente à timeline.`);scheduleProxyPass26(1200);return true;
    }catch(e){toast('Importação não concluída: '+e.message);return true;}finally{window.__toucaImportBusy29=false;}
  }
  function closeQuick26(){try{$('quickOptions').hidden=true;$('quickToggle')?.setAttribute('aria-expanded','false');}catch{}}
  if($('directMedia'))$('directMedia').onclick=async()=>{closeQuick26();if(!(await importNative26('media')))$('directMediaInput')?.click();};
  if($('directAudio'))$('directAudio').onclick=async()=>{closeQuick26();if(!(await importNative26('audio')))$('directAudioInput')?.click();};
  if($('dockMedia'))$('dockMedia').onclick=$('directMedia')?.onclick;
  if($('dropZone')){$('dropZone').onclick=async()=>{if(!(await importNative26('media')))$('directMediaInput')?.click();};$('dropZone').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('dropZone').click();}};}

  // ---------------------------------------------------------------------------
  // Long-form preview: proxy video + adaptive render resolution.
  // Export always renders originals at full requested resolution.
  // ---------------------------------------------------------------------------
  let proxyPassTimer26=null,hardwareInfo26=null;
  async function attachProxy26(a,url){if(!a||a.type!=='video'||!url)return;const r=cache.get(a.id);if(!r||r.proxyEl)return;const v=document.createElement('video');v.preload='auto';v.playsInline=true;v.muted=true;v.src=url;await new Promise((res,rej)=>{v.onloadedmetadata=res;v.onerror=rej;setTimeout(res,4500);});r.proxyEl=v;a.proxyData=url;}
  async function maybeProxy26(a){if(!native?.ensureProxy||!P.projectId||a?.type!=='video')return;const heavy=(Number(a.duration)||0)>=120||(Number(a.width)||0)*(Number(a.height)||0)>2500000||(Number(a.bytes)||0)>350*1024*1024;if(!heavy&&!a.proxyData)return;try{if(a.proxyData)return await attachProxy26(a,a.proxyData);hardwareInfo26 ||= await native.hardwareInfo?.();if(!hardwareInfo26?.available)return;const r=await native.ensureProxy(P.projectId,a.id);if(r?.url)await attachProxy26(a,r.url);}catch(e){console.warn('proxy',a.name,e);}}
  function scheduleProxyPass26(delay=1800){clearTimeout(proxyPassTimer26);proxyPassTimer26=setTimeout(()=>{for(const a of P.assets||[])maybeProxy26(a);},delay);}
  const loadAssetBefore26=loadAsset;
  loadAsset=async function(a){const r=await loadAssetBefore26(a);rememberAssets26();if(a?.proxyData)attachProxy26(a,a.proxyData).catch(()=>{});else if(a?.type==='video')scheduleProxyPass26(1800);return r;};
  const syncBefore26=syncMedia;
  syncMedia=function(force=false){const r=syncBefore26(force);for(const a of P.assets||[]){const rec=cache.get(a.id);if(!rec?.proxyEl||a.type!=='video')continue;const c=P.clips.find(c=>c.asset===a.id&&t>=c.start&&t<c.start+c.duration);if(c){const desired=(c.offset||0)+(t-c.start),p=rec.proxyEl;if(force||Math.abs((p.currentTime||0)-desired)>.16)try{p.currentTime=Math.min(desired,Math.max(.001,(p.duration||a.duration||desired+.1)-.001));}catch{}if(playing&&p.paused)p.play().catch(()=>{});if(!playing&&!p.paused)p.pause();}else rec.proxyEl.pause();}return r;};
  const paintBefore26=paintClip;
  paintClip=function(g,c,time,pw,ph){const rec=c?.asset&&cache.get(c.asset);if(!exporting&&rec?.proxyEl&&rec.proxyEl.readyState>=2&&!rec.proxyEl.seeking){const orig=rec.el;rec.el=rec.proxyEl;try{return paintBefore26(g,c,time,pw,ph);}finally{rec.el=orig;}}return paintBefore26(g,c,time,pw,ph);};

  const stageToolbar26=q('.stageToolbar');
  let previewQuality26=localStorage.getItem('touca-preview-quality')||'auto',previewCanvas26=document.createElement('canvas'),previewCtx26=previewCanvas26.getContext('2d',{alpha:false});
  if(stageToolbar26&&!$('v26PreviewQuality')){const box=document.createElement('label');box.id='v26PreviewQuality';box.className='v26PreviewQuality';box.innerHTML='<span>Preview</span><select aria-label="Qualidade do preview"><option value="auto">Auto</option><option value="1">Completo</option><option value="0.5">1/2</option><option value="0.25">1/4</option></select>';box.querySelector('select').value=previewQuality26;box.querySelector('select').onchange=e=>{previewQuality26=e.target.value;localStorage.setItem('touca-preview-quality',previewQuality26);draw();};stageToolbar26.append(box);}
  function previewFactor26(){if(previewQuality26!=='auto')return clamp26(Number(previewQuality26)||1,.25,1);const videos=(P.assets||[]).filter(a=>a.type==='video'),heavy=total()>120||videos.some(a=>(a.width||0)*(a.height||0)>2500000)||P.clips.length>90;return heavy?.5:1;}
  const drawBefore26=draw;
  draw=function(){const f=exporting?1:previewFactor26();if(f>=.999)return drawBefore26();const [pw,ph]=dimensions(),w=Math.max(2,Math.round(pw*f/2)*2),h=Math.max(2,Math.round(ph*f/2)*2);if(previewCanvas26.width!==w||previewCanvas26.height!==h){previewCanvas26.width=w;previewCanvas26.height=h;}drawTo(previewCtx26,w,h,t);ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,$('preview').width,$('preview').height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(previewCanvas26,0,0,$('preview').width,$('preview').height);};

  // ---------------------------------------------------------------------------
  // Unified timeline drag/trim — no timeline rebuild while pointer is moving.
  // ---------------------------------------------------------------------------
  function laneAt26(x,y){return document.elementFromPoint(x,y)?.closest?.('.track')||null;}
  function compatibleTrack26(c,tr){if(!tr)return false;if(isEffect26(c))return EFFECT26.includes(tr);if(isAudio26(c))return AUDIO26.includes(tr);if(isText26(c))return tr==='subtitle'||MEDIA26.slice(1).includes(tr);if(isVisual26(c))return MEDIA26.includes(tr);return false;}
  function audioFree26(c,tr,start){return !P.clips.some(x=>x.id!==c.id&&isAudio26(x)&&x.track===tr&&x.start<start+c.duration&&start<x.start+x.duration);}
  function resolveAudio26(c,tr,start){if(!isAudio26(c))return tr;if(audioFree26(c,tr,start))return tr;return AUDIO26.find(x=>audioFree26(c,x,start))||null;}
  function snapStart26(c,start,tr){start=Math.max(0,snapFrame(start));if($('snap')?.checked){const marks=[0,t,...P.clips.filter(x=>x.id!==c.id&&x.track===tr).flatMap(x=>[x.start,x.start+x.duration])];for(const m of marks){if(Math.abs(start-m)*pps<7){start=m;break;}if(Math.abs(start+c.duration-m)*pps<7){start=m-c.duration;break;}}}return Math.max(0,snapFrame(start));}
  function clearTargets26(){qa('.track.v26DropTarget').forEach(x=>x.classList.remove('v26DropTarget'));q('.timeline')?.classList.remove('v26InvalidDrop');}
  function ghost26(node){const r=node.getBoundingClientRect(),g=document.createElement('div');g.className='v26DragGhost';g.style.width=Math.max(18,r.width)+'px';g.style.height=Math.max(20,r.height)+'px';g.style.setProperty('--v26-x',r.left+'px');g.style.setProperty('--v26-y',r.top+'px');const label=node.querySelector('.clipLabel')?.textContent||'Conteúdo';g.innerHTML=`<span class="clipLabel">${String(label).replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]))}</span>`;const bg=getComputedStyle(node).backgroundImage;if(bg&&bg!=='none')g.style.backgroundImage=bg;document.body.append(g);return {g,w:r.width,h:r.height,grabX:0,grabY:0};}
  function autoScroll26(scroll,e){const r=scroll.getBoundingClientRect(),edge=42;if(e.clientX<r.left+edge)scroll.scrollLeft=Math.max(0,scroll.scrollLeft-24);else if(e.clientX>r.right-edge)scroll.scrollLeft+=24;if(e.clientY<r.top+edge)scroll.scrollTop=Math.max(0,scroll.scrollTop-20);else if(e.clientY>r.bottom-edge)scroll.scrollTop+=20;}
  startClipDrag=function(e){
    if(exporting||window.__toucaTimelineDrag31||e.button!==0||e.target.closest('.clipKey,.edgeKey'))return;e.preventDefault();e.stopPropagation();pause();
    const node=e.currentTarget,c=P.clips.find(x=>x.id===node.dataset.id);if(!c)return;selected=c.id;keyIndex=0;const original=clonePlain26(c),scroll=$('timelineScroll'),sx=e.clientX,sy=e.clientY,handle=e.target.closest('.v21TrimZone')?.dataset.handle||null,nodeRect=node.getBoundingClientRect();let moved=false,gh=null,previewTrack=c.track,previewStart=c.start,valid=true,pending=null;window.__toucaTimelineDrag31={pointerId:e.pointerId};const scrollStart=scroll.scrollLeft;
    const begin=()=>{if(moved)return;moved=true;if(handle){node.classList.add('v26ResizePreview');document.body.classList.add('v20Resizing');}else{node.classList.add('v26SourceDragging');const info=ghost26(node);gh=info.g;info.grabX=sx-nodeRect.left;info.grabY=sy-nodeRect.top;gh._info=info;}};
    const resizePreview=dx=>{const a=P.assets.find(x=>x.id===c.asset),delta=snapFrame(dx/pps);if(handle==='right'){let d=Math.max(1/30,original.duration+delta);if(a&&['video','audio'].includes(a.type))d=Math.min(d,Math.max(1/30,(a.duration||d)-(original.offset||0)));pending={side:'right',duration:d};window.toucaTimelineGeometry31.apply(node,{...original,duration:d},pps);}else{let cut=clamp26(delta,-original.start,original.duration-1/30);if(a&&['video','audio'].includes(a.type))cut=Math.max(-(original.offset||0),cut);pending={side:'left',cut};window.toucaTimelineGeometry31.apply(node,{...original,start:original.start+cut,duration:original.duration-cut},pps);}};
    const move=ev=>{if(ev.pointerId!==undefined&&ev.pointerId!==e.pointerId)return;const dx=ev.clientX-sx+scroll.scrollLeft-scrollStart,dy=ev.clientY-sy;if(!moved&&Math.hypot(dx,dy)<4)return;begin();ev.preventDefault();if(handle){resizePreview(dx);return;}autoScroll26(scroll,ev);clearTargets26();const lane=laneAt26(ev.clientX,ev.clientY),tr=lane?.dataset.track;valid=compatibleTrack26(c,tr);previewTrack=valid?tr:null;const sr=scroll.getBoundingClientRect(),grabTime=(sx-nodeRect.left+(window.toucaTimelineGeometry31.box(original,pps).inset))/Math.max(1,pps),cursorTime=(scroll.scrollLeft+ev.clientX-sr.left)/Math.max(1,pps);previewStart=snapStart26(c,cursorTime-grabTime,previewTrack||original.track);if(isAudio26(c)&&valid){const free=resolveAudio26(c,previewTrack,previewStart);if(free){previewTrack=free;}else valid=false;}
      const target=previewTrack&&q(`.track[data-track="${previewTrack}"]`);if(valid&&target)target.classList.add('v26DropTarget');else q('.timeline')?.classList.add('v26InvalidDrop');if(gh){const info=gh._info,laneRect=target?.getBoundingClientRect();const x=sr.left+previewStart*pps-scroll.scrollLeft,y=laneRect?laneRect.top+(laneRect.height-info.h)/2:ev.clientY-info.grabY;gh.style.setProperty('--v26-x',x+'px');gh.style.setProperty('--v26-y',y+'px');gh.style.width=Math.max(18,original.duration*pps)+'px';gh.style.height=Math.max(20,info.h)+'px';gh.classList.toggle('v21InvalidGhost',!valid);}}
    ;
    const cleanup=()=>{node.classList.remove('v26SourceDragging','v26ResizePreview');document.body.classList.remove('v20Resizing');window.__toucaTimelineDrag31=null;window.toucaTimelineGeometry31.apply(node,c,pps);gh?.remove();gh=null;clearTargets26();};
    const finish=cancel=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancelFn);window.removeEventListener('blur',cancelFn);cleanup();if(!moved){buildTimeline();renderUI(false);return;}if(cancel)return buildTimeline();if(handle){if(!pending)return buildTimeline();checkpoint();if(pending.side==='right')resizeClip(c,pending.duration,$('resizeMode')?.value||'trim');else trimClip(c,pending.cut,original.duration);if(c.v26AutoEndKey&&isVisual26(c)&&c.keys?.length)c.keys[c.keys.length-1].t=autoEndTime26(c.duration);changed();return;}if(!valid||!previewTrack){toast('Destino incompatível. Nada foi alterado.');buildTimeline();return;}checkpoint();c.start=previewStart;c.track=previewTrack;if(isEffect26(c)&&previewTrack==='effectsLocal'){c.effectTargetTrack='main';c.effectScope='target';}changed();};
    const up=ev=>{if(ev.pointerId!==undefined&&ev.pointerId!==e.pointerId)return;finish(false);},cancelFn=()=>finish(true);window.addEventListener('blur',cancelFn,{once:true});window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancelFn,{once:true});
  };

  // ---------------------------------------------------------------------------
  // Definitive ANI / TRAN duration — exactly one live controller on selected card.
  // ---------------------------------------------------------------------------
  let libraryCtx26=null,durationDrag26=false;const decorateBefore26=window.__toucaV23DecorateLibrary;
  function nearestCut26(){try{return cuts().sort((a,b)=>Math.abs(a.time-t)-Math.abs(b.time-t))[0]||null;}catch{return null;}}
  function selection26(ctx){if(!ctx)return null;if(ctx.mode==='animation'){const side=ctx.side==='out'?'out':'in',targets=ctx.extra?.targets?.length?ctx.extra.targets:(ctx.target?[ctx.target]:[current?.()].filter(Boolean)),items=targets.map(clip=>({clip,spec:clip?.animation?.[side]})).filter(x=>x.spec);return {mode:'animation',side,items,id:items[0]?.spec?.name||'',duration:Number(items[0]?.spec?.duration)||.42};}if(ctx.mode==='transition'){const cut=ctx.extra?.cut||nearestCut26(),spec=cut?.b?.transition;return {mode:'transition',cut,spec,id:spec?.type||'',duration:Number(spec?.duration)||.42};}return null;}
  function setDuration26(ctx,value){const sel=selection26(ctx);if(!sel)return .42;let d=clamp26(Number(value)||.42,.1,3);if(sel.mode==='animation'){for(const {clip,spec} of sel.items)spec.duration=Math.min(d,Math.max(.1,clip.duration));return Math.min(d,...sel.items.map(x=>x.spec.duration));}if(sel.spec&&sel.cut){sel.spec.duration=Math.min(d,Math.max(.1,sel.cut.a.duration),Math.max(.1,sel.cut.b.duration));return sel.spec.duration;}return d;}
  function mountDuration26(){const grid=$('v19LibraryGrid'),sel=selection26(libraryCtx26);if(!grid)return;grid.querySelectorAll('.v23CardDuration,.v25DurationControl,.v26DurationControl').forEach(x=>x.remove());grid.querySelectorAll('.v19Card').forEach(x=>x.classList.toggle('v26SelectedResource',!!sel?.id&&x.dataset.resource===sel.id));if(!sel?.id)return;const card=[...grid.querySelectorAll('.v19Card')].find(x=>x.dataset.resource===sel.id);if(!card)return;let max=3;if(sel.mode==='animation'&&sel.items.length)max=Math.max(.1,Math.min(3,...sel.items.map(x=>x.clip.duration)));if(sel.mode==='transition'&&sel.cut)max=Math.max(.1,Math.min(3,sel.cut.a.duration,sel.cut.b.duration));const val=clamp26(sel.duration,.1,max),box=document.createElement('div');box.className='v26DurationControl';box.innerHTML=`<span>Duração</span><input type="range" min="0.10" max="${max.toFixed(2)}" step="0.01" value="${val.toFixed(2)}"><output>${val.toFixed(2)}s</output>`;const r=box.querySelector('input'),out=box.querySelector('output'),stop=e=>{e.preventDefault?.();e.stopPropagation();e.stopImmediatePropagation?.();};for(const ev of ['click','mousedown','mouseup','pointerdown','pointerup','pointermove','pointercancel','dblclick'])box.addEventListener(ev,e=>{e.stopPropagation();e.stopImmediatePropagation?.();},true);r.addEventListener('pointerdown',e=>{e.stopPropagation();durationDrag26=true;card.dataset.dragged='1';try{r.setPointerCapture(e.pointerId);}catch{}},true);r.addEventListener('input',e=>{e.stopPropagation();const actual=setDuration26(libraryCtx26,r.value);r.value=actual.toFixed(2);out.textContent=actual.toFixed(2)+'s';draw();},true);const commit=e=>{e?.stopPropagation();setDuration26(libraryCtx26,r.value);durationDrag26=false;setTimeout(()=>card.dataset.dragged='',80);autosave();draw();};r.addEventListener('change',commit,true);r.addEventListener('pointerup',commit,true);r.addEventListener('keydown',e=>e.stopPropagation(),true);card.append(box);}
  window.__toucaV23DecorateLibrary=function(ctx){libraryCtx26=ctx||libraryCtx26;decorateBefore26?.(libraryCtx26);queueMicrotask(mountDuration26);requestAnimationFrame(mountDuration26);};
  $('v19LibraryGrid')?.addEventListener('click',e=>{if(e.target.closest('.v26DurationControl'))return;const card=e.target.closest('.v19Card');const sel=selection26(libraryCtx26);if(card&&sel?.id&&card.dataset.resource===sel.id&&['animation','transition'].includes(libraryCtx26?.mode||'')){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();mountDuration26();}},{capture:true});

  // Only animate previews that are actually on screen.
  const io26='IntersectionObserver'in window?new IntersectionObserver(entries=>{for(const en of entries){const cv=en.target;if(en.isIntersecting){cv.classList.add('v23LoopPreview');cv.classList.remove('v26PreviewPaused');}else{cv.classList.remove('v23LoopPreview');cv.classList.add('v26PreviewPaused');}}},{root:$('v19Library'),rootMargin:'100px'}):null;
  const observePreviews26=()=>{if(!io26)return;qa('#v19LibraryGrid canvas').forEach(cv=>{if(!cv.dataset.v26Observed){cv.dataset.v26Observed='1';io26.observe(cv);}});};
  new MutationObserver(()=>requestAnimationFrame(observePreviews26)).observe($('v19LibraryGrid')||document.body,{childList:true,subtree:true});

  // ---------------------------------------------------------------------------
  // Native audio plan for long exports; avoids full-duration OfflineAudioContext.
  // ---------------------------------------------------------------------------
  window.__toucaNativeAudioPlan26=async function(duration){if(!native?.assetExists||!P.projectId)return null;const clips=P.clips.filter(c=>['audio','video'].includes(c.type)&&!c.muted&&(c.volume??100)>0&&c.start<duration),ids=[...new Set(clips.map(c=>c.asset).filter(Boolean))];for(const id of ids)if(!(await native.assetExists(P.projectId,id).catch(()=>false)))return null;return clips.map(c=>({type:c.type,assetId:c.asset,start:c.start,duration:Math.min(c.duration,duration-c.start),offset:c.offset||0,volume:c.volume??100,muted:!!c.muted,fadeIn:c.fadeIn,fadeOut:c.fadeOut,audioEffect:c.audioEffect||null}));};

  // ---------------------------------------------------------------------------
  // Audio inspector: volume/mute/fades/effects + local non-destructive native denoise.
  // ---------------------------------------------------------------------------
  const audioFx26=[['none','Original'],['telephone','Telefone'],['radio','Rádio'],['echo','Eco'],['cave','Caverna'],['muffled','Abafado'],['bass','Grave'],['bright','Brilho'],['robot','Robô']];
  function openAudio26(c){if(!c||!['audio','video'].includes(c.type))return;const p=$('v19Inspector'),body=$('v19InspectorBody');if(!p||!body)return;$('v19InspectorTitle').textContent=c.name||'Áudio';$('v19InspectorHint').textContent='ÁUDIO · DESKTOP';body.innerHTML=`<div class="v26AudioGrid"><div class="v26AudioRow"><span>Volume</span><input data-v26-volume type="range" min="0" max="200" step="1" value="${c.volume??100}"><output>${c.volume??100}%</output></div><label class="v26Toggle"><input data-v26-mute type="checkbox" ${c.muted?'checked':''}> Silenciar este clip</label><div class="v26AudioRow"><span>Fade in</span><input data-v26-fadein type="range" min="0" max="3" step="0.05" value="${c.fadeIn??.02}"><output>${Number(c.fadeIn??.02).toFixed(2)}s</output></div><div class="v26AudioRow"><span>Fade out</span><input data-v26-fadeout type="range" min="0" max="3" step="0.05" value="${c.fadeOut??.02}"><output>${Number(c.fadeOut??.02).toFixed(2)}s</output></div><div class="v26NativeBadge">Processamento de exportação em streaming quando a mídia está salva no projeto. O original não é alterado.</div><div><b>Efeito de voz</b><div class="v26AudioFx">${audioFx26.map(([id,l])=>`<button data-v26-fx="${id}" class="${(c.audioEffect||'none')===id?'active':''}">${l}</button>`).join('')}</div></div>${c.type==='audio'?'<div class="v19Actions"><button data-v26-clean>✦ Limpar voz / reduzir ruído</button>'+(c.originalAsset26?'<button data-v26-restore>↺ Restaurar original</button>':'')+'</div>':''}</div>`;p.classList.remove('v19Hidden');$('v19Library')?.classList.add('v19Hidden');const vol=body.querySelector('[data-v26-volume]'),mute=body.querySelector('[data-v26-mute]'),fi=body.querySelector('[data-v26-fadein]'),fo=body.querySelector('[data-v26-fadeout]');vol.oninput=()=>{vol.nextElementSibling.textContent=vol.value+'%';c.volume=Number(vol.value);draw();};vol.onchange=()=>autosave();mute.onchange=()=>{c.muted=mute.checked;autosave();};for(const [el,key] of [[fi,'fadeIn'],[fo,'fadeOut']]){el.oninput=()=>{el.nextElementSibling.textContent=Number(el.value).toFixed(2)+'s';c[key]=Number(el.value);};el.onchange=()=>autosave();}body.onclick=e=>{const fx=e.target.closest('[data-v26-fx]');if(fx){c.audioEffect=fx.dataset.v26Fx==='none'?null:fx.dataset.v26Fx;body.querySelectorAll('[data-v26-fx]').forEach(x=>x.classList.toggle('active',x===fx));autosave();try{initAudio();}catch{}return;}if(e.target.closest('[data-v26-clean]'))openClean26(c);if(e.target.closest('[data-v26-restore]')&&c.originalAsset26){checkpoint();c.asset=c.originalAsset26;c.originalAsset26=null;c.name=P.assets.find(a=>a.id===c.asset)?.name||c.name;changed();openAudio26(c);}};}
  const showClipMenuBefore26=showClipMenu;
  showClipMenu=function(c,x,y){showClipMenuBefore26(c,x,y);const menu=$('clipMenu');if(!menu)return;for(const b of menu.querySelectorAll('button'))if(/Volume|áudio|efeitos de voz/i.test(b.textContent||''))b.onclick=()=>{menu.hidden=true;openAudio26(c);};};
  let cleanDialog26=null;
  function ensureCleanDialog26(){if(cleanDialog26)return cleanDialog26;cleanDialog26=document.createElement('dialog');cleanDialog26.className='v26CleanDialog';cleanDialog26.innerHTML=`<h2>Limpar voz</h2><p class="muted">Redução de ruído local e não destrutiva pelo motor FFmpeg. O arquivo original permanece no projeto.</p><div class="v26Strength"><span>Força</span><input type="range" min="0" max="100" value="55"><output>55%</output></div><div class="v26NativeBadge" data-status>Pronto para processar.</div><footer><button data-close>Cancelar</button><button data-apply class="primary">Aplicar</button></footer>`;document.body.append(cleanDialog26);const r=cleanDialog26.querySelector('input'),out=cleanDialog26.querySelector('output');r.oninput=()=>out.textContent=r.value+'%';cleanDialog26.querySelector('[data-close]').onclick=()=>cleanDialog26.close();return cleanDialog26;}
  async function openClean26(c){const d=ensureCleanDialog26(),status=d.querySelector('[data-status]'),apply=d.querySelector('[data-apply]');d._clip=c;status.textContent='Pronto para processar localmente.';apply.disabled=false;apply.onclick=async()=>{const clip=d._clip,a=P.assets.find(x=>x.id===clip.asset);if(!clip||!a)return;apply.disabled=true;status.textContent='Processando áudio no motor desktop…';try{P.projectId ||= uid();let exists=await native?.assetExists?.(P.projectId,a.id);if(!exists&&a.data?.startsWith('data:')){await native.storeAsset(P.projectId,a.id,a.name,a.type,a.data);a.nativeStoredV18=true;exists=true;}if(!exists||!native?.cleanVoiceNative)throw Error('Motor nativo indisponível para este arquivo.');const na=await native.cleanVoiceNative(P.projectId,a.id,Number(d.querySelector('input').value));await loadAsset(na);checkpoint();P.assets.push(na);assetData26.set(na.id,{data:na.data});clip.originalAsset26 ||= clip.asset;clip.asset=na.id;clip.name=na.name;changed();status.textContent='Concluído. O original foi preservado.';setTimeout(()=>{d.close();openAudio26(clip);},450);}catch(e){status.textContent=e.message;apply.disabled=false;}};d.showModal();}
  window.toucaCleanVoice23=c=>openClean26(c);

  // ---------------------------------------------------------------------------
  // Home screen: add duplicate without replacing current project cards.
  // ---------------------------------------------------------------------------
  let homePatchBusy26=false;
  async function patchHome26(){if(homePatchBusy26||!native?.listProjects)return;const grid=$('v18ProjectGrid');if(!grid||$('v18Home')?.classList.contains('v18Hidden'))return;homePatchBusy26=true;try{const list=await native.listProjects(),cards=[...grid.querySelectorAll('.v18ProjectCard')];cards.forEach((card,i)=>{const p=list[i];if(!p||card.querySelector('.v26DuplicateProject'))return;const actions=card.querySelector('.v18ProjectActions');if(!actions)return;const b=document.createElement('button');b.className='v26DuplicateProject';b.textContent='⧉';b.title='Duplicar projeto';b.onclick=async e=>{e.stopPropagation();b.disabled=true;try{await native.duplicateProject(p.id,(p.name||'Projeto')+' - cópia');$('v18RefreshProjects')?.click();}catch(err){toast(err.message);}finally{b.disabled=false;}};actions.insertBefore(b,actions.lastElementChild);});}finally{homePatchBusy26=false;}}
  if($('v18ProjectGrid'))new MutationObserver(()=>setTimeout(patchHome26,30)).observe($('v18ProjectGrid'),{childList:true,subtree:true});

  // ---------------------------------------------------------------------------
  // Keep migration/schema current on every real project mutation.
  // ---------------------------------------------------------------------------
  const changedBefore26=changed;
  changed=function(){migrate26();const r=changedBefore26();P.editorVersion=VERSION;P.projectSchemaVersion=SCHEMA;scheduleProxyPass26(1800);scheduleOffload26(1800);return r;};

  // Export UI: desktop wording + hardware badge (no browser language).
  function addPerfBadge26(){const dlg=$('exportDialog');if(!dlg||$('v26PerfBadge'))return;const b=document.createElement('div');b.id='v26PerfBadge';b.textContent='Motor desktop · verificando hardware…';$('exportInfo')?.after(b);native?.hardwareInfo?.().then(h=>{b.textContent=h?.preferred?`Motor desktop · ${h.preferred} disponível · áudio/mux nativos`:'Motor desktop · WebCodecs HW + FFmpeg quando disponível';}).catch(()=>{});}
  const showExportBefore26=showExport;
  showExport=async function(){addPerfBadge26();return showExportBefore26();};
  if($('exportBtn'))$('exportBtn').onclick=showExport;

  // First load / delayed compatibility patches.
  setTimeout(()=>{migrate26();rememberAssets26();observePreviews26();patchHome26();scheduleProxyPass26(2500);scheduleOffload26(3200);try{window.__toucaV23DecorateLibrary?.(libraryCtx26);}catch{};if($('pwaStatus'))$('pwaStatus').textContent='Touca Editor Desktop · v26 RC · aplicativo local';},900);
})();
