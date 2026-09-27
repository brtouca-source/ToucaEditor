'use strict';
(()=>{
 const $=id=>document.getElementById(id),native=window.toucaNative;
 const memory=Number(navigator.deviceMemory||4);
 let previewMaxLong=memory<=4?720:960;

 // Mobile preview should not rasterize a 1080x1920 canvas every animation frame.
 const renderBeforeAndroid=renderUI;
 function optimizePreview(){
   if(exporting)return;
   const canvas=$('preview'),[pw,ph]=dimensions(),scale=Math.min(1,previewMaxLong/Math.max(pw,ph));
   const w=Math.max(2,Math.round(pw*scale/2)*2),h=Math.max(2,Math.round(ph*scale/2)*2);
   if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;draw();}
 }
 renderUI=function(full=true){const r=renderBeforeAndroid(full);optimizePreview();return r;};

 // 30 fps preview is enough on a phone and avoids burning CPU/GPU at 60/120 Hz.
 let lastPreviewFrame=0;
 loop=function(){
   if(!playing)return;
   const now=performance.now();t=Math.min(total(),(now-clock)/1000);
   if(now-lastPreviewFrame>=31||exporting){syncMedia();draw();drawPlayhead();if(exporting&&exportFrame)exportFrame();lastPreviewFrame=now;}
   if(t>=total()){pause();if(exporting)finishRecord();return;}
   raf=requestAnimationFrame(loop);
 };

 // Timeline drag: update existing nodes while moving; rebuild the DOM only on release.
 startClipDrag=function(e){
   if(exporting||e.button!==0)return;e.stopPropagation();pause();
   const c=P.clips.find(x=>x.id===e.currentTarget.dataset.id);if(!c)return;
   selected=c.id;keyIndex=0;$('editScope').value='clip';
   const original=clone(c),startX=e.clientX,handle=e.target.dataset.handle,positions=P.clips.map(x=>[x.id,x.start]),order=mainClips().map(x=>x.id);
   let moved=false,paintRaf=0;
   const paint=()=>{paintRaf=0;for(const clip of P.clips){const el=document.querySelector(`.clip[data-id="${CSS.escape(clip.id)}"]`);if(el){el.style.left=clip.start*pps+'px';el.style.width=Math.max(6,clip.duration*pps)+'px';}}draw();drawPlayhead();};
   const schedulePaint=()=>{if(!paintRaf)paintRaf=requestAnimationFrame(paint)};
   const move=ev=>{
     const dx=ev.clientX-startX;if(!moved&&Math.abs(dx)<5)return;if(!moved){checkpoint();moved=true;}
     Object.assign(c,clone(original));for(const [id,pos]of positions){const x=P.clips.find(x=>x.id===id);if(x)x.start=pos;}
     const delta=snapFrame(dx/pps),a=P.assets.find(x=>x.id===c.asset);
     if(handle==='right'){let d=Math.max(1/30,original.duration+delta);if(a&&a.type!=='image')d=Math.min(d,Math.floor((a.duration-(c.offset||0))*30)/30);resizeClip(c,d,$('resizeMode').value);}
     else if(handle==='left'){let cut=clamp(delta,-original.start,original.duration-1/30);if(a&&a.type!=='image')cut=Math.max(-(original.offset||0),cut);trimClip(c,cut,original.duration);}
     else c.start=Math.max(0,snapFrame(original.start+delta));
     if(c.track==='main'&&hasMagnet()){if(handle)compactMain(order.map(id=>P.clips.find(x=>x.id===id)).filter(Boolean));else placeMain(c,c.start);}
     else if(!handle&&$('snap').checked){for(const mark of [t,0,...P.clips.filter(x=>x.id!==c.id&&x.track===c.track).flatMap(x=>[x.start,x.start+x.duration])])if(Math.abs(c.start-mark)*pps<9){c.start=mark;break;}}
     schedulePaint();
   };
   const up=()=>{window.removeEventListener('pointermove',move);if(paintRaf){cancelAnimationFrame(paintRaf);paint();}if(moved)changed();else renderUI(false);};
   window.addEventListener('pointermove',move,{passive:true});window.addEventListener('pointerup',up,{once:true});
 };
 let zoomRaf=0;
 $('timelineZoom').oninput=e=>{pps=Number(e.target.value);if(!zoomRaf)zoomRaf=requestAnimationFrame(()=>{zoomRaf=0;buildTimeline();})};

 // Keep transform dragging responsive by limiting expensive inspector redraws to the screen refresh.
 $('preview').onpointerdown=e=>{
   const c=current();if(!c||c.type==='audio'||exporting)return;pause();
   const rect=$('preview').getBoundingClientRect(),v=valueAt(c.keys,clamp(t-c.start,0,c.duration)),x=e.clientX,y=e.clientY;checkpoint();
   let next=null,moveRaf=0;
   const apply=()=>{moveRaf=0;if(!next)return;const ev=next;next=null;editPose('x',v.x+(ev.clientX-x)*dimensions()[0]/rect.width,false);editPose('y',v.y+(ev.clientY-y)*dimensions()[1]/rect.height,false);};
   const move=ev=>{next=ev;if(!moveRaf)moveRaf=requestAnimationFrame(apply)};
   const up=()=>{window.removeEventListener('pointermove',move);if(moveRaf){cancelAnimationFrame(moveRaf);apply();}changed();};
   window.addEventListener('pointermove',move,{passive:true});window.addEventListener('pointerup',up,{once:true});
 };

 const fastStart=startRecord,fastFinish=finishRecord;
 let recorderState=null;
 const projectHasAudio=()=>P.clips.some(c=>['audio','video'].includes(c.type)&&!c.muted&&(c.volume??100)>0);
 const safeName=()=>((P.name||'Touca').replace(/[^\p{L}\p{N}_-]/gu,'_')||'Touca');
 function mediaMime(kind='mp4'){
   if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream)return '';
   const list=kind==='mp4'?['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4']:['video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm'];
   return list.find(x=>{try{return MediaRecorder.isTypeSupported(x)}catch{return false}})||'';
 }
 async function webCodecProbe(){
   const hasAudio=projectHasAudio(),quality=Number($('exportQuality')?.value||720),[pw,ph]=dimensions(),scale=quality/1080,W=Math.round(pw*scale/2)*2,H=Math.round(ph*scale/2)*2;
   let video=false,audio=!hasAudio;
   if(typeof VideoEncoder!=='undefined'){
     for(const codec of ['avc1.420028','avc1.4D0028','avc1.640028']){try{const r=await VideoEncoder.isConfigSupported({codec,width:W,height:H,bitrate:quality>=1080?12000000:5000000,framerate:Number($('exportFps')?.value||30),hardwareAcceleration:'prefer-hardware'});if(r.supported){video=true;break}}catch{}}
   }
   if(hasAudio&&typeof AudioEncoder!=='undefined'){try{audio=(await AudioEncoder.isConfigSupported({codec:'mp4a.40.2',sampleRate:48000,numberOfChannels:2,bitrate:128000})).supported}catch{}}
   return {video,audio,hasAudio};
 }
 async function probeAndroidExport(){
   const web=await webCodecProbe(),mp4=mediaMime('mp4'),webm=mediaMime('webm');
   return {...web,mp4,webm,can:!!mp4||(web.video&&web.audio)||!!webm};
 }
 window.__toucaAndroidExportProbe=probeAndroidExport;

 async function startRecorderExport(mime){
   if(exporting)return;pause();
   const previousTime=t,hasAudio=projectHasAudio(),requested=Number($('exportQuality')?.value||720),quality=memory<=4?Math.min(requested,720):requested;
   const [pw,ph]=dimensions(),scale=quality/1080,W=Math.round(pw*scale/2)*2,H=Math.round(ph*scale/2)*2,fps=30;
   let session=null,stream=null,rec=null,writeChain=Promise.resolve(),writeError=null,writePos=0,cancelled=false;
   try{
     await initAudio();await document.fonts.ready;
     const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;const g=canvas.getContext('2d',{alpha:false,desynchronized:true});
     t=0;syncMedia(true);drawTo(g,W,H,0);
     stream=canvas.captureStream(fps);
     if(hasAudio)mixDest.stream.getAudioTracks().forEach(track=>stream.addTrack(track));
     session=await native.fileExportStart({name:safeName(),mime});
     if(!session?.jobId)throw Error('Android não abriu o arquivo de exportação.');
     rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:quality>=1080?9000000:5000000,audioBitsPerSecond:128000});
     recorderState={rec,session,get cancelled(){return cancelled},set cancelled(v){cancelled=v}};
     recorder=rec;recordStream=stream;exporting=true;$('app').classList.add('busy');$('startExport').disabled=true;$('cancelExport').textContent='Cancelar exportação';
     exportFrame=()=>{drawTo(g,W,H,t);$('exportProgress').value=total()?t/total()*100:0;$('exportStatus').textContent=`Exportação Android compatível · ${fmt(t)} / ${fmt(total())} · ${quality}p · 30 fps`;};
     rec.ondataavailable=e=>{if(!e.data.size)return;writeChain=writeChain.then(async()=>{const ab=await e.data.arrayBuffer();await native.fileExportWrite(session.jobId,writePos,ab);writePos+=ab.byteLength;}).catch(err=>{writeError=err;});};
     rec.onerror=e=>{writeError=e.error||Error('Falha no MediaRecorder');finishRecord(true);};
     rec.onstop=async()=>{
       try{
         await writeChain;if(writeError)throw writeError;
         if(cancelled)await native.fileExportCancel(session.jobId);
         else{const done=await native.fileExportFinish(session.jobId);$('exportProgress').value=100;$('exportStatus').textContent=`Exportação concluída · ${quality}p · 30 fps · ${((done?.size||writePos)/1048576).toFixed(1)} MB`;toast('Vídeo salvo em Filmes/ToucaEditor.');}
       }catch(err){try{await native.fileExportCancel(session.jobId)}catch{};$('exportStatus').textContent=err.message||String(err);toast('Falha ao exportar: '+$('exportStatus').textContent);}
       finally{stream?.getTracks().forEach(x=>x.stop());recorderState=null;recorder=null;recordStream=null;exportFrame=null;exporting=false;t=previousTime;$('app').classList.remove('busy');$('startExport').disabled=false;$('cancelExport').textContent='Fechar';syncMedia(true);renderUI();}
     };
     rec.start(1000);await play();
   }catch(err){
     try{if(session?.jobId)await native.fileExportCancel(session.jobId)}catch{}
     stream?.getTracks().forEach(x=>x.stop());recorderState=null;recorder=null;recordStream=null;exportFrame=null;exporting=false;t=previousTime;$('app').classList.remove('busy');$('startExport').disabled=false;syncMedia(true);
     throw err;
   }
 }
 startRecord=async function(...args){
   const p=await probeAndroidExport();
   if(!p.can){const msg='Este WebView não oferece H.264/AAC nem MediaRecorder compatível. Atualize o Android System WebView/Chrome.';$('exportStatus').textContent=msg;toast(msg);return;}
   if(p.mp4){try{return await startRecorderExport(p.mp4)}catch(err){if(p.video&&p.audio){toast('Modo compatível falhou; tentando exportador rápido.');return fastStart(...args)}throw err}}
   if(p.video&&p.audio)return fastStart(...args);
   if(p.webm)return startRecorderExport(p.webm);
 };
 finishRecord=function(cancel=false){
   if(recorderState){recorderState.cancelled=!!cancel;pause();try{if(recorderState.rec.state!=='inactive')recorderState.rec.stop()}catch{}if(cancel)$('exportStatus').textContent='Exportação cancelada; o arquivo parcial será removido.';return;}
   return fastFinish(cancel);
 };
 showExport=async function(){
   if(!P.clips.length||!total())return toast('Sua timeline está vazia.');
   if(P.sourceFormat&&$('exportFps'))$('exportFps').value=String(P.fps||30);
   $('exportDialog').showModal();$('startExport').disabled=true;$('exportInfo').textContent='Verificando os codecs deste aparelho…';
   const p=await probeAndroidExport();
   let mode=p.mp4?'MP4 compatível em streaming':p.video&&p.audio?'MP4 rápido por WebCodecs':p.webm?'WebM compatível em streaming':'sem encoder compatível';
   $('exportInfo').textContent=`${fmt(total())} · ${mode}. O Android grava direto em Filmes/ToucaEditor, sem manter o vídeo inteiro na RAM.`;
   $('startExport').disabled=!p.can;
 };
 $('exportBtn').onclick=showExport;$('startExport').onclick=startRecord;$('cancelExport').onclick=()=>exporting?finishRecord(true):$('exportDialog').close();

 setTimeout(()=>{optimizePreview();buildTimeline();draw();},0);
})();
