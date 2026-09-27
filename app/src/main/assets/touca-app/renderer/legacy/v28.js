'use strict';
(()=>{
  const VERSION='28.0.0',$=id=>document.getElementById(id),native=window.toucaNative||null;
  document.documentElement.dataset.toucaV28='true';
  try{P.editorVersion=VERSION;}catch{}
  if($('pwaStatus'))$('pwaStatus').textContent='Touca Editor Desktop · v28 · Turbo Export';

  // -------------------------------------------------------------------------
  // Sequential H.264 decoder worker. For normal MP4/MOV AVC media this removes
  // the old `video.currentTime -> seeked` operation from every exported frame.
  // The worker parses MP4 sample tables with small local Range reads, feeds
  // samples sequentially into WebCodecs VideoDecoder and transfers VideoFrame
  // objects back without converting them to PNG/base64/raw RGBA.
  // -------------------------------------------------------------------------
  class DecoderClient28{
    constructor(){this.worker=null;this.seq=1;this.pending=new Map();this.dead=false;}
    ensure(){if(this.worker||this.dead)return this.worker;try{this.worker=new Worker('./workers/v28-decoder-worker.js');this.worker.onmessage=e=>{const m=e.data||{},p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);clearTimeout(p.timer);m.ok?p.resolve(m):p.reject(new Error(m.error||'Decoder rápido falhou.'));};this.worker.onerror=e=>{this.dead=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error(e.message||'Worker de vídeo falhou.'));}this.pending.clear();};return this.worker;}catch(e){this.dead=true;return null;}}
    ask(type,data={},timeout=30000){const w=this.ensure();if(!w)return Promise.reject(new Error('Worker de vídeo indisponível.'));const id=this.seq++;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Decoder rápido excedeu o tempo limite.'));},timeout);this.pending.set(id,{resolve,reject,timer});w.postMessage({id,type,...data});});}
    async reset(){if(!this.worker)return;try{await this.ask('reset',{},5000);}catch{};}
    destroy(){if(this.worker)try{this.worker.terminate();}catch{};this.worker=null;this.dead=false;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('Decoder encerrado.'));}this.pending.clear();}
  }
  const dec28=new DecoderClient28(),sessions28=new Map(),unsupported28=new Set(),framesByClip28=new Map();
  let stats28={fast:0,fallback:0,opened:0};
  function closeFrame28(f){try{f?.close?.();}catch{}}
  async function resetDecode28(){for(const f of framesByClip28.values())closeFrame28(f);framesByClip28.clear();sessions28.clear();unsupported28.clear();stats28={fast:0,fallback:0,opened:0};await dec28.reset();}
  function activeVideoClips28(time){try{const list=visibleClips(time,false).filter(c=>c.type==='video'),tr=transitionAt(time);for(const c of [tr?.prev,tr?.clip])if(c?.type==='video'&&!list.some(x=>x.id===c.id))list.push(c);return list;}catch{return [];}}
  const oldPrepare28=window.prepareExportFrame;
  window.prepareExportFrame=async function(time,job){
    const active=activeVideoClips28(time),activeIds=new Set(active.map(c=>c.id));
    for(const [id,s] of [...sessions28]){if(!activeIds.has(id)&&time>(s.end||0)+.08){sessions28.delete(id);dec28.ask('close',{clipId:id},3000).catch(()=>{});}}
    for(const [clipId,f] of [...framesByClip28]){if(!activeIds.has(clipId)){closeFrame28(f);framesByClip28.delete(clipId);}}
    for(const c of active){
      const a=P.assets.find(x=>x.id===c.asset),entry=cache.get(c.asset);if(!a||!entry)throw Error('Mídia ausente: '+c.name);
      const local=Math.max(0,Math.min(c.duration,time-c.start)),targetUs=Math.max(0,Math.round(((c.offset||0)+local)*1e6));
      if(!unsupported28.has(c.asset)&&typeof VideoFrame!=='undefined'){
        try{
          if(!sessions28.has(c.id)){await dec28.ask('open',{clipId:c.id,url:a.data,initialUs:targetUs},45000);sessions28.set(c.id,{asset:c.asset,end:c.start+c.duration});stats28.opened++;}
          const m=await dec28.ask('frame',{clipId:c.id,targetUs},20000),frame=m.frame;if(!frame)throw Error('Frame rápido vazio.');const old=framesByClip28.get(c.id);if(old)closeFrame28(old);framesByClip28.set(c.id,frame);stats28.fast++;continue;
        }catch(e){console.warn('Touca v28 sequential decoder fallback:',a.name,e?.message||e);unsupported28.add(c.asset);try{await dec28.ask('close',{clipId:c.id},2000);}catch{};sessions28.delete(c.id);const old=framesByClip28.get(c.id);if(old){closeFrame28(old);framesByClip28.delete(c.id);}}
      }
      // Compatibility for WebM/HEVC/fragmented MP4 or machines without VideoDecoder.
      if(typeof seekExportVideo==='function'){await seekExportVideo(entry.el,targetUs/1e6,job);const previous=framesByClip28.get(c.id);closeFrame28(previous);framesByClip28.set(c.id,await createImageBitmap(entry.el));stats28.fallback++;}
      else if(oldPrepare28)return oldPrepare28(time,job);
    }
  };
  try{prepareExportFrame=window.prepareExportFrame;}catch{}

  // One decoded frame per CLIP, including both sides of a transition.
  // Same media may be used at different offsets on multiple layers.
  const paintBefore28=paintClip;
  paintClip=function(g,c,time,pw,ph){
    const frame=exporting&&framesByClip28.get(c.id),rec=frame&&cache.get(c.asset);
    if(!frame||!rec)return paintBefore28(g,c,time,pw,ph);
    const old=rec.el;rec.el=frame;
    // Disable the legacy still-frame substitution at transition edges.
    const visual={...c,animation:c.animation,__transitionEdge:null};
    try{return paintBefore28(g,visual,time,pw,ph);}finally{rec.el=old;}
  };
  const primeBefore28=primeTransitionMedia;
  primeTransitionMedia=async function(){if(!exporting)return primeBefore28();};

  // -------------------------------------------------------------------------
  // Disk-streaming MP4 exporter used when the FFmpeg CLI is not installed.
  // Unlike the legacy fallback, it does not keep the entire final MP4 in RAM.
  // -------------------------------------------------------------------------
  let directJob28=null,directEncoder28=null,directAudioEncoder28=null;
  const clamp28=(v,a,b)=>Math.max(a,Math.min(b,v));
  function safeName28(){const raw=($('exportFileName')?.value||P.name||'Meu vídeo').trim().replace(/\.mp4$/i,'');return (raw||'Meu vídeo').replace(/[\\/:*?"<>|]/g,'_').replace(/[. ]+$/g,'').slice(0,120)||'Meu vídeo';}
  async function config28(w,h,fps,bitrate){const levels=fps>=60?['avc1.42002A','avc1.4D002A','avc1.64002A']:['avc1.420028','avc1.4D0028','avc1.640028'];for(const codec of levels)for(const mode of ['variable','constant']){const c={codec,width:w,height:h,bitrate,bitrateMode:mode,framerate:fps,latencyMode:'quality',hardwareAcceleration:'prefer-hardware',avc:{format:'avc'}};try{const r=await VideoEncoder.isConfigSupported(c);if(r.supported)return r.config||c;}catch{}}return null;}
  function restore28(previousTime){try{frameExport=null;exporting=false;exportFrame=null;t=previousTime;$('app').classList.remove('busy');$('startExport').disabled=false;$('cancelExport').textContent='Fechar';syncMedia(true);renderUI();}catch{}}
  async function streamExport28(){
    if(exporting)return;if(asrBusy)return toast('Conclua a transcrição antes de exportar.');if(!native?.fileExportStart)return false;
    pause();const previousTime=t,duration=total(),job={cancelled:false,error:null};frameExport=job;exporting=true;$('app').classList.add('busy');$('exportProgress').value=0;$('startExport').disabled=true;$('cancelExport').textContent='Cancelar exportação';let enc=null,aenc=null,session=null,muxer=null,writeChain=Promise.resolve(),writeError=null,pendingWriteBytes=0;
    try{
      await resetDecode28();await document.fonts.ready;checkExport(job);const scale=Number($('exportQuality').value)/1080,[pw,ph]=dimensions(),W=Math.round(pw*scale/2)*2,H=Math.round(ph*scale/2)*2,canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(W,H):document.createElement('canvas');canvas.width=W;canvas.height=H;const g=canvas.getContext('2d',{alpha:false,desynchronized:true});
      const fps=Number($('exportFps')?.value||30)===60?60:30,bitrate=scale<1?5000000:12000000,count=Math.ceil(duration*fps),vcfg=await config28(W,H,fps,bitrate);if(!vcfg)throw Error(`H.264 ${W}×${H} a ${fps} fps não está disponível neste PC.`);
      $('exportStatus').textContent='Preparando decoder sequencial, fontes e áudio…';for(const clip of P.clips.filter(x=>x.type==='image')){const el=cache.get(clip.asset)?.el;if(!el)throw Error('Imagem ausente: '+clip.name);if(el.decode)await el.decode();}await primeTransitionMedia();checkExport(job);
      const mixed=await mixExportAudio(duration,job),acfg={codec:'mp4a.40.2',sampleRate:48000,numberOfChannels:2,bitrate:160000};if(mixed&&(typeof AudioEncoder==='undefined'||!(await AudioEncoder.isConfigSupported(acfg)).supported))throw Error('AAC por WebCodecs indisponível neste computador.');
      session=await native.fileExportStart({name:safeName28()});if(!session||session.cancelled){job.cancelled=true;return true;}directJob28=session.jobId;
      const audioExpected=mixed?Math.ceil(mixed.length/1024)+8:0,target=new Mp4Muxer.StreamTarget({chunked:true,chunkSize:4*1024*1024,onData:(data,position)=>{const copy=data.slice();pendingWriteBytes+=copy.byteLength;writeChain=writeChain.then(()=>native.fileExportWrite(session.jobId,position,copy)).catch(e=>{writeError=e;job.error=e;}).finally(()=>pendingWriteBytes-=copy.byteLength);}});
      muxer=new Mp4Muxer.Muxer({target,video:{codec:'avc',width:W,height:H},...(mixed?{audio:{codec:'aac',sampleRate:48000,numberOfChannels:2}}:{}),fastStart:{expectedVideoChunks:count+4,...(mixed?{expectedAudioChunks:audioExpected}:{})},firstTimestampBehavior:'offset'});
      let framesWritten=0;enc=new VideoEncoder({output:(chunk,meta)=>{try{muxer.addVideoChunk(chunk,meta);framesWritten++;}catch(e){job.error=e;}},error:e=>{job.error=e;}});enc.configure(vcfg);directEncoder28=enc;
      if(mixed){aenc=new AudioEncoder({output:(chunk,meta)=>{try{muxer.addAudioChunk(chunk,meta);}catch(e){job.error=e;}},error:e=>{job.error=e;}});aenc.configure(acfg);directAudioEncoder28=aenc;const channels=[mixed.getChannelData(0),mixed.getChannelData(Math.min(1,mixed.numberOfChannels-1))];for(let off=0;off<mixed.length;off+=1024){checkExport(job);const n=Math.min(1024,mixed.length-off),pcm=new Float32Array(n*2);pcm.set(channels[0].subarray(off,off+n));pcm.set(channels[1].subarray(off,off+n),n);const d=new AudioData({format:'f32-planar',sampleRate:48000,numberOfFrames:n,numberOfChannels:2,timestamp:Math.round(off/48000*1e6),data:pcm});try{aenc.encode(d);}finally{d.close();}if(aenc.encodeQueueSize>16){while(aenc.encodeQueueSize>10){checkExport(job);await new Promise(r=>setTimeout(r,0));}}}await aenc.flush();}
      const begin=performance.now(),updateEvery=Math.max(10,Math.round(fps/3));
      for(let i=0;i<count;i++){
        checkExport(job);if(pendingWriteBytes>8*1024*1024)await writeChain;if(writeError)throw writeError;if(job.error)throw job.error;const time=i/fps;await window.prepareExportFrame(time,job);drawTo(g,W,H,time);const st=Math.round(time*1e6),en=Math.round(Math.min(duration,(i+1)/fps)*1e6),vf=new VideoFrame(canvas,{timestamp:st,duration:Math.max(1,en-st)});try{enc.encode(vf,{keyFrame:i%(fps*2)===0});}finally{vf.close();}
        if(enc.encodeQueueSize>16){while(enc.encodeQueueSize>8){checkExport(job);await new Promise(r=>setTimeout(r,0));}}
        if(i%updateEvery===0){const elapsed=Math.max(.001,(performance.now()-begin)/1000),done=i+1,rfps=done/elapsed,remain=(count-done)/Math.max(.1,rfps);$('exportProgress').value=done/count*100;$('exportStatus').textContent=`Turbo Export · ${done}/${count} · ${rfps.toFixed(1)} fps · ${stats28.fast} frames sequenciais${stats28.fallback?` · ${stats28.fallback} seeks compatíveis`:''} · ${remain<60?Math.ceil(remain)+' s':Math.ceil(remain/60)+' min'} restantes`;await new Promise(r=>setTimeout(r,0));}
      }
      await enc.flush();checkExport(job);muxer.finalize();await writeChain;if(writeError)throw writeError;if(framesWritten!==count)throw Error(`Exportação incompleta: ${framesWritten}/${count} quadros.`);const done=await native.fileExportFinish(session.jobId);directJob28=null;$('exportProgress').value=100;$('exportStatus').textContent=`MP4 concluído · ${fps} fps · ${scale<1?'5':'12'} Mbps · decoder sequencial ${stats28.fast?'ativo':'compatível'} · ${((done?.size||0)/1048576).toFixed(1)} MB`;if(done?.filePath)toast('Vídeo exportado: '+done.filePath);return true;
    }catch(e){if(session?.jobId){try{await native.fileExportCancel(session.jobId);}catch{}}directJob28=null;$('exportStatus').textContent=job.cancelled?'Exportação cancelada; nenhum arquivo parcial foi salvo.':(e?.message||String(e));toast($('exportStatus').textContent);return true;}
    finally{try{if(enc&&enc.state!=='closed')enc.close();}catch{}try{if(aenc&&aenc.state!=='closed')aenc.close();}catch{}directEncoder28=null;directAudioEncoder28=null;await resetDecode28();restore28(previousTime);}
  }

  // Prefer the existing FFmpeg streaming-audio route when present; it now gains
  // the v28 sequential decoder automatically. Otherwise use direct streamed MP4.
  const startBefore28=startRecord;
  startRecord=async function(...args){
    if(window.ToucaScenes&&!window.ToucaScenes.canExport())return;
    await resetDecode28();
    try{let caps=null;try{caps=await native?.nativeExportCapabilities?.();}catch{}if(caps?.available)return await startBefore28(...args);return await streamExport28();}
    finally{if(!exporting)await resetDecode28();}
  };
  $('startExport').onclick=startRecord;
  const finishBefore28=finishRecord;
  finishRecord=function(...args){if(directJob28&&frameExport){frameExport.cancelled=true;native?.fileExportCancel?.(directJob28).catch(()=>{});directJob28=null;try{directEncoder28?.close();}catch{}try{directAudioEncoder28?.close();}catch{}return;}return finishBefore28?.(...args);};

  // Explain which path is actually available instead of presenting every PC as
  // if it had the same hardware stack.
  const showBefore28=showExport;
  showExport=async function(...args){const r=await showBefore28(...args);try{const caps=await native?.nativeExportCapabilities?.(),b=$('v24ExportEngine')?.querySelector('span');if(b)b.textContent=caps?.available?`Turbo Decode H.264 sequencial + ${caps.preferredHardware||'WebCodecs H.264'} + FFmpeg streaming`:'Turbo Decode H.264 sequencial + WebCodecs + MP4 streaming direto no disco';}catch{}return r;};
  $('exportBtn').onclick=showExport;

  // Release marker.
  setTimeout(()=>{try{P.editorVersion=VERSION;const s=$('statusText');if(s&&!/Turbo Export/.test(s.textContent))s.title='Touca v28 · decoder sequencial H.264 para exportação';}catch{}},700);
})();
