'use strict';
(()=>{
 const Android=window.ToucaAndroid||(window.ToucaAndroid={}),native=window.toucaNative,$=id=>document.getElementById(id);
 const memory=Number(navigator.deviceMemory||4);
 let installed=false,recorderState=null;
 const engine={activeFps:30};
 const hasAudio=()=>P.clips.some(c=>['audio','video'].includes(c.type)&&!c.muted&&(c.volume??100)>0);
 const safeName=()=>((P.name||'Touca').replace(/[^\p{L}\p{N}_-]/gu,'_')||'Touca');
 function mediaMime(kind){
   if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream)return '';
   const list=kind==='mp4'?['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4']:['video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm'];
   return list.find(x=>{try{return MediaRecorder.isTypeSupported(x)}catch{return false}})||'';
 }
 async function webCodecProbe(){
   const audioNeeded=hasAudio(),quality=Number($('exportQuality')?.value||1080),[pw,ph]=dimensions(),scale=quality/1080,W=Math.round(pw*scale/2)*2,H=Math.round(ph*scale/2)*2;
   const fps=Number($('exportFps')?.value||30)===60?60:30;let video=false,audio=!audioNeeded;
   if(typeof VideoEncoder!=='undefined')for(const codec of ['avc1.420028','avc1.4D0028','avc1.640028']){try{if((await VideoEncoder.isConfigSupported({codec,width:W,height:H,bitrate:quality>=1080?12000000:5000000,framerate:fps,hardwareAcceleration:'prefer-hardware'})).supported){video=true;break}}catch{}}
   if(audioNeeded&&typeof AudioEncoder!=='undefined')try{audio=(await AudioEncoder.isConfigSupported({codec:'mp4a.40.2',sampleRate:48000,numberOfChannels:2,bitrate:160000})).supported}catch{}
   return {video,audio,audioNeeded};
 }
 async function probe(){
   const web=await webCodecProbe(),mp4=mediaMime('mp4'),webm=mediaMime('webm');
   let nativeCaps={};try{nativeCaps=await native?.nativeExportCapabilities?.()||{}}catch{}
   return {...web,mp4,webm,binaryBridge:!!nativeCaps.binaryBridge,can:!!mp4||(web.video&&web.audio)||!!webm};
 }
 async function saveBeforeExport(){
   if(window.__toucaImportBusy29)throw Error('Aguarde a importação terminar antes de exportar.');
   if(window.toucaSaveNow29)await window.toucaSaveNow29();
 }
 async function compatibleExport(mime){
   pause();await saveBeforeExport();await native?.setKeepAwake?.(true);
   const previousTime=t,audioNeeded=hasAudio(),requested=Number($('exportQuality')?.value||1080);
   const quality=memory<=3?Math.min(requested,720):requested;
   const selectedFps=Number($('exportFps')?.value||30)===60?60:30,fps=selectedFps===60&&memory<6?30:selectedFps;
   engine.activeFps=fps;
   const [pw,ph]=dimensions(),scale=quality/1080,W=Math.round(pw*scale/2)*2,H=Math.round(ph*scale/2)*2;
   const videoBitrate=quality>=1080?12000000:5000000;
   let session=null,stream=null,rec=null,writeChain=Promise.resolve(),writeError=null,writePos=0,pendingBytes=0,cancelled=false;
   try{
     await initAudio();await document.fonts.ready;
     const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;const g=canvas.getContext('2d',{alpha:false,desynchronized:true});
     t=0;syncMedia(true);drawTo(g,W,H,0);stream=canvas.captureStream(fps);
     if(audioNeeded)mixDest.stream.getAudioTracks().forEach(track=>stream.addTrack(track));
     session=await native.fileExportStart({name:safeName(),mime});
     if(!session?.jobId)throw Error('Android não conseguiu criar o arquivo de exportação.');
     rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:videoBitrate,audioBitsPerSecond:160000});
     recorderState={rec,session,get cancelled(){return cancelled},set cancelled(v){cancelled=v}};
     recorder=rec;recordStream=stream;exporting=true;$('app').classList.add('busy');$('startExport').disabled=true;$('cancelExport').textContent='Cancelar exportação';
     exportFrame=()=>{drawTo(g,W,H,t);$('exportProgress').value=total()?t/total()*100:0;$('exportStatus').textContent=`Exportando · ${fmt(t)} / ${fmt(total())} · ${quality}p · ${fps} fps · fila ${(pendingBytes/1048576).toFixed(1)} MB`};
     rec.ondataavailable=e=>{if(!e.data.size)return;pendingBytes+=e.data.size;writeChain=writeChain.then(async()=>{const ab=await e.data.arrayBuffer();await native.fileExportWrite(session.jobId,writePos,ab);writePos+=ab.byteLength}).catch(err=>{writeError=err}).finally(()=>{pendingBytes=Math.max(0,pendingBytes-e.data.size)})};
     rec.onerror=e=>{writeError=e.error||Error('Falha no encoder do Android');finishRecord(true)};
     rec.onstop=async()=>{try{await writeChain;if(writeError)throw writeError;if(cancelled)await native.fileExportCancel(session.jobId);else{const done=await native.fileExportFinish(session.jobId);$('exportProgress').value=100;$('exportStatus').textContent=`Concluído · ${quality}p · ${fps} fps · ${((done?.size||writePos)/1048576).toFixed(1)} MB`;toast('Vídeo salvo em Filmes/ToucaEditor.')}}catch(err){try{await native.fileExportCancel(session.jobId)}catch{};$('exportStatus').textContent=err.message||String(err);toast('Falha ao exportar: '+$('exportStatus').textContent)}finally{stream?.getTracks().forEach(x=>x.stop());recorderState=null;recorder=null;recordStream=null;exportFrame=null;exporting=false;t=previousTime;$('app').classList.remove('busy');$('startExport').disabled=false;$('cancelExport').textContent='Fechar';await native?.setKeepAwake?.(false);syncMedia(true);renderUI()}};
     rec.start(750);await play();
   }catch(err){try{if(session?.jobId)await native.fileExportCancel(session.jobId)}catch{}stream?.getTracks().forEach(x=>x.stop());recorderState=null;recorder=null;recordStream=null;exportFrame=null;exporting=false;t=previousTime;$('app').classList.remove('busy');$('startExport').disabled=false;await native?.setKeepAwake?.(false);syncMedia(true);throw err}
 }
 function install(){
   if(installed)return;installed=true;
   const fastStart=startRecord,fastFinish=finishRecord;
   startRecord=async function(...args){
     if(exporting)return;
     const p=await probe();if(!p.can){const msg='Seu Android System WebView não oferece um encoder compatível. Atualize o WebView/Chrome e tente novamente.';$('exportStatus').textContent=msg;toast(msg);return}
     const runFast=async()=>{await saveBeforeExport();await native?.setKeepAwake?.(true);try{return await fastStart(...args)}finally{await native?.setKeepAwake?.(false)}};
     try{
       if(p.mp4){try{return await compatibleExport(p.mp4)}catch(err){if(p.video&&p.audio){toast('Modo compatível falhou; tentando o exportador WebCodecs.');return await runFast()}throw err}}
       if(p.video&&p.audio)return await runFast();
       if(p.webm)return await compatibleExport(p.webm);
     }catch(err){await native?.setKeepAwake?.(false);$('exportStatus').textContent=err.message||String(err);toast('Falha ao exportar: '+$('exportStatus').textContent)}
   };
   finishRecord=function(cancel=false){if(recorderState){recorderState.cancelled=!!cancel;pause();try{if(recorderState.rec.state!=='inactive')recorderState.rec.stop()}catch{}if(cancel)$('exportStatus').textContent='Cancelando e removendo o arquivo parcial…';return}const r=fastFinish(cancel);if(cancel)native?.setKeepAwake?.(false).catch(()=>{});return r};
   showExport=async function(){if(!P.clips.length||!total())return toast('Sua timeline está vazia.');$('exportDialog').showModal();$('startExport').disabled=true;$('exportInfo').textContent='Verificando codecs e armazenamento deste aparelho…';const p=await probe(),mode=p.mp4?'MP4 em streaming':p.video&&p.audio?'MP4 por WebCodecs':p.webm?'WebM em streaming':'sem encoder compatível';$('exportInfo').textContent=`${fmt(total())} · ${mode} · gravação direta em Filmes/ToucaEditor${p.binaryBridge?' · ponte binária ativa':''}.`;$('startExport').disabled=!p.can};
   $('exportBtn').onclick=showExport;$('startExport').onclick=startRecord;$('cancelExport').onclick=()=>exporting?finishRecord(true):$('exportDialog').close();window.__toucaAndroidExportProbe=probe;
 }
 Object.assign(engine,{install,probe});Android.exportEngine=engine;
})();
