'use strict';
(()=>{
  const VERSION='24.0.0', $=id=>document.getElementById(id), q=s=>document.querySelector(s), qa=s=>[...document.querySelectorAll(s)];
  document.documentElement.dataset.toucaV24='true';
  try{P.editorVersion=VERSION;}catch{}
  if($('pwaStatus'))$('pwaStatus').textContent='Touca Editor Desktop · v24.0.0 · aplicativo local';
  const native=window.toucaNative;
  const clamp24=(v,a,b)=>Math.max(a,Math.min(b,v));

  // v24: the drag ghost must keep exactly the original timeline clip height.
  // v21's .clip height is !important, so normal inline height was losing after the clone moved to <body>.
  const fixGhostGeometry=()=>{
    for(const g of qa('.v21DragGhost')){
      if(g.dataset.v24Geometry==='1')continue;
      g.dataset.v24Geometry='1';
      const h=parseFloat(g.style.height)||g.getBoundingClientRect().height||38;
      const w=parseFloat(g.style.width)||g.getBoundingClientRect().width||80;
      g.style.setProperty('--touca-ghost-h',Math.max(1,h)+'px');
      g.style.setProperty('--touca-ghost-w',Math.max(1,w)+'px');
      g.style.setProperty('height',Math.max(1,h)+'px','important');
      g.style.width=Math.max(1,w)+'px';
    }
  };
  const ghostObserver=new MutationObserver(fixGhostGeometry);
  ghostObserver.observe(document.body,{subtree:true,childList:true});

  // Stable ANI/TRAN duration. The slider owns the interaction; the card must not re-apply its default on release.
  let lastCtx24=null;
  const decorate23=window.__toucaV23DecorateLibrary;
  function nearestCut24(){try{return cuts().sort((a,b)=>Math.abs(a.time-t)-Math.abs(b.time-t))[0]||null;}catch{return null;}}
  function animationTargets24(ctx){
    if(ctx?.extra?.targets?.length)return ctx.extra.targets.filter(Boolean);
    if(ctx?.target)return [ctx.target];
    try{const c=current?.();return c?[c]:[];}catch{return [];}
  }
  function stableSelection24(ctx){
    if(ctx?.mode==='animation'){
      const side=ctx.side||'in',targets=animationTargets24(ctx),items=[];
      for(const clip of targets){const spec=clip?.animation?.[side];if(spec)items.push({clip,spec});}
      return {mode:'animation',side,items,id:items[0]?.spec?.name||'',duration:Number(items[0]?.spec?.duration)||.42};
    }
    if(ctx?.mode==='transition'){
      const cut=ctx.extra?.cut||nearestCut24(),spec=cut?.b?.transition;
      return {mode:'transition',cut,spec,id:spec?.type||'',duration:Number(spec?.duration)||.42};
    }
    return {mode:ctx?.mode||'',id:'',duration:.42};
  }
  function bindStableDuration24(ctx){
    const grid=$('v19LibraryGrid');if(!grid||!ctx)return;
    const sel=stableSelection24(ctx);if(!sel.id)return;
    const card=[...grid.querySelectorAll('.v19Card')].find(x=>x.dataset.resource===sel.id);if(!card)return;
    const box=card.querySelector('.v23CardDuration');if(!box)return;
    box.classList.add('v24Stable');
    const r=box.querySelector('input[type="range"]'),out=box.querySelector('output');if(!r)return;
    r.dataset.v24Duration='true';r.value=clamp24(sel.duration,.1,3).toFixed(2);if(out)out.textContent=Number(r.value).toFixed(2)+'s';
    const stop=e=>{e.stopPropagation();e.stopImmediatePropagation?.();};
    r.onpointerdown=e=>{stop(e);card.dataset.dragged='1';r.setPointerCapture?.(e.pointerId);};
    r.onclick=stop;
    r.oninput=e=>{
      stop(e);let d=clamp24(Number(r.value)||.42,.1,3);
      if(sel.mode==='animation'){
        for(const {clip,spec} of sel.items){spec.duration=Math.min(d,Math.max(.1,Number(clip.duration)||d));}
      }else if(sel.mode==='transition'&&sel.spec&&sel.cut){
        sel.spec.duration=Math.min(d,Math.max(.1,Number(sel.cut.a?.duration)||d),Math.max(.1,Number(sel.cut.b?.duration)||d));
        d=sel.spec.duration;
      }
      r.value=Number(d).toFixed(2);if(out)out.textContent=Number(d).toFixed(2)+'s';
      try{draw?.();}catch{}
    };
    const commit=e=>{stop(e);setTimeout(()=>{card.dataset.dragged='';},0);try{changed?.();}catch{}};
    r.onchange=commit;r.onpointerup=commit;r.onpointercancel=commit;
    box.onpointerdown=stop;box.onclick=stop;
  }
  window.__toucaV23DecorateLibrary=function(ctx){
    lastCtx24=ctx||lastCtx24;
    decorate23?.(lastCtx24);
    queueMicrotask(()=>bindStableDuration24(lastCtx24));
  };

  // Desktop export controls: 1080p defaults to 12 Mbps / 30 fps, with explicit 60 fps option.
  function ensureExportControls24(){
    const quality=$('exportQuality');if(!quality)return;
    for(const o of quality.options){if(o.value==='1080')o.textContent='1080p · Alta · 12 Mbps';else if(o.value==='720')o.textContent='720p · Leve · 5 Mbps';}
    let fps=$('exportFps');
    if(!fps){
      const label=document.createElement('label');label.className='field';label.innerHTML='<span>Taxa de quadros</span><select id="exportFps"><option value="30">30 fps · padrão</option><option value="60">60 fps · mais fluido</option></select>';
      quality.closest('label')?.after(label);fps=$('exportFps');
    }
    let saved='30';try{saved=localStorage.getItem('touca.exportFps')||'30';}catch{}
    fps.value=saved==='60'?'60':'30';fps.onchange=()=>{try{localStorage.setItem('touca.exportFps',fps.value);}catch{}};
    let badge=$('v24ExportEngine');if(!badge){badge=document.createElement('div');badge.id='v24ExportEngine';badge.className='v24ExportEngine';badge.innerHTML='<strong>Desktop</strong><span>Verificando motor de exportação…</span>';const info=$('exportInfo');info?.after(badge);}
  }
  ensureExportControls24();

  function wavFromAudioBuffer24(buf){
    if(!buf)return null;const rate=buf.sampleRate||48000,ch=Math.min(2,buf.numberOfChannels||1),n=buf.length,bytes=44+n*ch*2,ab=new ArrayBuffer(bytes),v=new DataView(ab);const str=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
    str(0,'RIFF');v.setUint32(4,bytes-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,ch,true);v.setUint32(24,rate,true);v.setUint32(28,rate*ch*2,true);v.setUint16(32,ch*2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,n*ch*2,true);
    const data=[];for(let c=0;c<ch;c++)data.push(buf.getChannelData(Math.min(c,buf.numberOfChannels-1)));let o=44;for(let i=0;i<n;i++)for(let c=0;c<ch;c++){let x=Math.max(-1,Math.min(1,data[c][i]||0));v.setInt16(o,x<0?x*32768:x*32767,true);o+=2;}return new Uint8Array(ab);
  }
  function safeExportName24(){const raw=($('exportFileName')?.value||P.name||'Meu vídeo').trim().replace(/\.mp4$/i,'');return (raw||'Meu vídeo').replace(/[\\/:*?"<>|]/g,'_').replace(/[. ]+$/g,'').slice(0,120)||'Meu vídeo';}
  let caps24=null,capsPromise24=null,nativeJob24=null,nativeEncoder24=null,nativeWrite24=Promise.resolve();
  async function capabilities24(){
    if(caps24)return caps24;if(capsPromise24)return capsPromise24;
    capsPromise24=(async()=>{try{return await native?.nativeExportCapabilities?.();}catch(e){return {available:false,error:e.message};}})();caps24=await capsPromise24;capsPromise24=null;return caps24;
  }
  function setExportEngineBadge24(c){const b=$('v24ExportEngine');if(!b)return;const s=b.querySelector('span');if(!s)return;s.textContent=c?.available?'H.264 por hardware + FFmpeg nativo para áudio, mux e gravação direta no disco.':'Modo compatível WebCodecs disponível; motor FFmpeg nativo não encontrado.';}

  const showExportFallback24=showExport;
  showExport=async function(){
    ensureExportControls24();if(!total())return toast('Sua timeline está vazia.');
    const c=await capabilities24();setExportEngineBadge24(c);
    const fps=Number($('exportFps')?.value||30),is1080=Number($('exportQuality')?.value)>=1080;
    $('exportInfo').textContent=`${fmt(total())} · MP4 · ${fps} fps · ${is1080?'12 Mbps':'5 Mbps'} · H.264${c?.available?' · saída desktop nativa':' · modo compatível'}.`;
    const fileName=$('exportFileName');if(fileName&&!fileName.matches(':focus'))fileName.value=(P.name||'Meu vídeo').replace(/\.mp4$/i,'');
    $('startExport').disabled=typeof VideoEncoder==='undefined';$('exportDialog').showModal();
  };
  $('exportBtn').onclick=showExport;

  async function findVideoConfig24(w,h,fps,bitrate){
    const levels=fps>=60?['avc1.42002A','avc1.4D002A','avc1.64002A']:['avc1.420028','avc1.4D0028','avc1.640028'];
    for(const codec of levels){
      for(const mode of ['variable','constant']){
        const cfg={codec,width:w,height:h,bitrate,bitrateMode:mode,framerate:fps,latencyMode:'quality',hardwareAcceleration:'prefer-hardware',avc:{format:'annexb'}};
        try{const ok=await VideoEncoder.isConfigSupported(cfg);if(ok.supported)return cfg;}catch{}
      }
    }
    return null;
  }
  function restoreAfterNative24(previousTime){
    try{frameExport=null;exporting=false;exportFrame=null;t=previousTime;$('app').classList.remove('busy');$('startExport').disabled=false;$('cancelExport').textContent='Fechar';syncMedia(true);renderUI();}catch{}
  }
  async function startNativeExport24(){
    if(exporting)return;if(asrBusy)return toast('Conclua a transcrição antes de exportar.');
    const c=await capabilities24();if(!c?.available)return false;
    pause();const previousTime=t,duration=total(),job={cancelled:false,error:null};frameExport=job;exporting=true;$('app').classList.add('busy');$('exportProgress').value=0;$('startExport').disabled=true;$('cancelExport').textContent='Cancelar exportação';
    let enc=null,session=null;
    try{
      await document.fonts.ready;checkExport(job);const scale=Number($('exportQuality').value)/1080,[pw,ph]=dimensions(),canvas=document.createElement('canvas');canvas.width=Math.round(pw*scale/2)*2;canvas.height=Math.round(ph*scale/2)*2;const g=canvas.getContext('2d',{alpha:false});
      const fps=Number($('exportFps')?.value||30)===60?60:30,bitrate=scale<1?5000000:12000000,count=Math.ceil(duration*fps),cfg=await findVideoConfig24(canvas.width,canvas.height,fps,bitrate);if(!cfg)throw Error(`H.264 ${canvas.width}×${canvas.height} a ${fps} fps não está disponível neste PC.`);
      $('exportStatus').textContent='Preparando mídia e áudio…';for(const clip of P.clips.filter(x=>x.type==='image')){const el=cache.get(clip.asset)?.el;if(!el)throw Error('Imagem ausente: '+clip.name);if(el.decode)await el.decode();}await primeTransitionMedia();checkExport(job);
      let mixed=null,wav=null,audioPlan=null;
      if(typeof window.__toucaNativeAudioPlan26==='function'){try{audioPlan=await window.__toucaNativeAudioPlan26(duration);}catch(e){console.warn('native audio plan',e);audioPlan=null;}}
      if(!audioPlan){mixed=await mixExportAudio(duration,job);wav=mixed?wavFromAudioBuffer24(mixed):null;}
      session=await native.nativeExportStart({name:safeExportName24(),width:canvas.width,height:canvas.height,fps,bitrate,audioWav:wav,audioPlan,projectId:P.projectId,duration});
      if(!session||session.cancelled){job.cancelled=true;return true;}nativeJob24=session.jobId;
      $('exportStatus').textContent=`Motor desktop ativo · ${fps} fps · ${scale<1?'5':'12'} Mbps · renderizando…`;
      nativeWrite24=Promise.resolve();let framesWritten=0,writeError=null;
      enc=new VideoEncoder({output:(chunk)=>{try{const u=new Uint8Array(chunk.byteLength);chunk.copyTo(u);framesWritten++;nativeWrite24=nativeWrite24.then(()=>native.nativeExportChunk(session.jobId,u)).catch(e=>{writeError=e;job.error=e;});}catch(e){writeError=e;job.error=e;}},error:e=>{job.error=e;}});nativeEncoder24=enc;enc.configure(cfg);
      const updateEvery=Math.max(15,Math.round(fps/2)),exportStarted24=performance.now();
      for(let index=0;index<count;index++){
        checkExport(job);if(writeError)throw writeError;const time=index/fps;await prepareExportFrame(time,job);drawTo(g,canvas.width,canvas.height,time);const start=Math.round(time*1e6),end=Math.round(Math.min(duration,(index+1)/fps)*1e6),frame=new VideoFrame(canvas,{timestamp:start,duration:Math.max(1,end-start)});try{enc.encode(frame,{keyFrame:index%(fps*2)===0});}finally{frame.close();}
        if(enc.encodeQueueSize>=24){let waits=0;while(enc.encodeQueueSize>10){checkExport(job);await new Promise(r=>setTimeout(r,0));if(++waits>15000)throw Error('O encoder parou de responder. A exportação foi interrompida sem salvar um arquivo incompleto.');}}
        if(index%updateEvery===0){await nativeWrite24;const elapsed=Math.max(.001,(performance.now()-exportStarted24)/1000),doneFrames=index+1,renderFps=doneFrames/elapsed,remain=Math.max(0,(count-doneFrames)/Math.max(.1,renderFps));$('exportProgress').value=doneFrames/count*100;$('exportStatus').textContent=`Renderizando ${doneFrames}/${count} · ${renderFps.toFixed(1)} fps reais · ${remain<60?Math.ceil(remain)+' s':Math.ceil(remain/60)+' min'} restantes · ${session.audioEngine||'desktop'}`;await new Promise(r=>setTimeout(r,0));}
      }
      await enc.flush();await nativeWrite24;checkExport(job);if(framesWritten!==count)throw Error(`Exportação incompleta: ${framesWritten} de ${count} quadros.`);
      const done=await native.nativeExportFinish(session.jobId);nativeJob24=null;$('exportProgress').value=100;$('exportStatus').textContent=`MP4 concluído · ${fps} fps · ${scale<1?'5':'12'} Mbps · ${(done?.size||0)/1048576<1?'<1':((done?.size||0)/1048576).toFixed(1)} MB · salvo no PC.`;if(done?.filePath)toast('Vídeo exportado: '+done.filePath);
      return true;
    }catch(error){
      if(session?.jobId){try{await native.nativeExportCancel(session.jobId);}catch{}}nativeJob24=null;$('exportStatus').textContent=job.cancelled?'Exportação cancelada; nenhum arquivo parcial foi salvo.':(error?.message||String(error));toast($('exportStatus').textContent);return true;
    }finally{
      if(enc&&enc.state!=='closed')try{enc.close();}catch{}nativeEncoder24=null;restoreAfterNative24(previousTime);
    }
  }

  const startRecordFallback24=startRecord;
  startRecord=async function(){
    const c=await capabilities24();if(c?.available&&typeof VideoEncoder!=='undefined'){await startNativeExport24();return;}
    return startRecordFallback24();
  };
  $('startExport').onclick=startRecord;
  const finishFallback24=finishRecord;
  finishRecord=function(...args){
    if(nativeJob24&&frameExport){frameExport.cancelled=true;native?.nativeExportCancel?.(nativeJob24).catch(()=>{});nativeJob24=null;try{nativeEncoder24?.close();}catch{}return;}
    return finishFallback24?.(...args);
  };
  $('cancelExport').onclick=()=>exporting?finishRecord(true):$('exportDialog').close();

  // Re-apply after delayed UI patches from older compatibility scripts.
  setTimeout(()=>{ensureExportControls24();capabilities24().then(setExportEngineBadge24).catch(()=>{});},700);
})();
