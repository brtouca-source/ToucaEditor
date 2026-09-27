
(()=>{
  const byId=id=>document.getElementById(id);
  const isPhone=()=>matchMedia('(max-width:600px) and (orientation:portrait)').matches;
  const directCaptureAvailable=()=>!!(navigator.mediaDevices?.getUserMedia&&window.isSecureContext&&window.MediaRecorder);
  const safeStop=s=>{try{s?.getTracks?.().forEach(t=>t.stop());}catch{}};
  const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-');
  const pickMime=(kind)=>{
    if(!window.MediaRecorder?.isTypeSupported)return '';
    const list=kind==='video'
      ?['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm']
      :['audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'];
    return list.find(x=>MediaRecorder.isTypeSupported(x))||'';
  };
  const extFrom=(type,kind)=>type.includes('mp4')?(kind==='video'?'.mp4':'.m4a'):type.includes('ogg')?'.ogg':'.webm';
  function showFallback(container,message,input){
    if(!container)return;
    container.hidden=false;container.replaceChildren();
    const text=document.createElement('div');text.textContent=message;container.append(text);
    const btn=document.createElement('button');btn.type='button';btn.className='captureFallbackButton';btn.textContent=input.accept.startsWith('video/')?'Abrir câmera do celular':'Abrir gravador do celular';btn.onclick=()=>input.click();container.append(btn);
  }

  const nativeVideo=document.createElement('input');nativeVideo.type='file';nativeVideo.accept='video/*';nativeVideo.setAttribute('capture','environment');nativeVideo.hidden=true;nativeVideo.id='nativeCameraCapture';document.body.append(nativeVideo);
  const nativeAudio=document.createElement('input');nativeAudio.type='file';nativeAudio.accept='audio/*';nativeAudio.setAttribute('capture','microphone');nativeAudio.hidden=true;nativeAudio.id='nativeAudioCapture';document.body.append(nativeAudio);

  async function addVideoFileLike(fileOrBlob,name){
    const blob=fileOrBlob;if(!blob?.size)throw Error('A gravação ficou vazia.');
    const raw=(blob.type||'video/webm').toLowerCase(),type=raw.includes('mp4')?'video/mp4':raw.includes('webm')?'video/webm':raw||'video/mp4';
    const fileName=name||('Câmera '+stamp()+extFrom(type,'video'));
    const a={id:uid(),name:fileName,type:'video',data:await readData(blob)};await loadAsset(a);
    const dur=Math.max(1/30,Math.floor(a.duration*30)/30),start=mainClips().reduce((n,c)=>Math.max(n,c.start+c.duration),0),c=newClip('video',a.name,a.id,'main',start,dur);
    checkpoint();P.assets.push(a);P.clips.push(c);selected=c.id;t=start;changed();toast('Gravação adicionada à faixa Mídia.');
  }
  async function addAudioFileLike(fileOrBlob,name){
    const blob=fileOrBlob;if(!blob?.size)throw Error('A gravação de áudio ficou vazia.');
    const raw=(blob.type||'audio/webm').toLowerCase(),type=raw.includes('mp4')?'audio/mp4':raw.includes('ogg')?'audio/ogg':'audio/webm';
    const fileName=name||('Áudio '+stamp()+extFrom(type,'audio'));
    const a={id:uid(),name:fileName,type:'audio',data:await readData(blob)};await loadAsset(a);checkpoint();P.assets.push(a);changed();toast('Áudio gravado adicionado aos seus arquivos.');
  }
  nativeVideo.onchange=async()=>{const f=nativeVideo.files?.[0];nativeVideo.value='';if(!f)return;try{await addVideoFileLike(f,f.name||undefined);}catch(e){toast(e.message);}};
  nativeAudio.onchange=async()=>{const f=nativeAudio.files?.[0];nativeAudio.value='';if(!f)return;try{await addAudioFileLike(f,f.name||undefined);}catch(e){toast(e.message);}};

  // Camera: request VIDEO first so a blocked microphone never prevents the camera permission prompt.
  const camBtn=byId('cameraRecord'),camDialog=byId('cameraCaptureDialog');
  if(camBtn&&camDialog){
    const video=camDialog.querySelector('.cameraCaptureVideo'),close=camDialog.querySelector('.cameraClose'),flip=camDialog.querySelector('.cameraFlip'),pauseBtn=camDialog.querySelector('.cameraPause'),shutter=camDialog.querySelector('.cameraShutter'),finish=camDialog.querySelector('.cameraFinish'),clock=camDialog.querySelector('.cameraCaptureTime'),hint=camDialog.querySelector('.cameraCaptureHint');
    let videoStream=null,micStream=null,recordStream=null,rec=null,chunks=[],facing='user',started=0,elapsed=0,timer=null,finishing=false;
    const updateClock=()=>{const ms=elapsed+(rec?.state==='recording'?performance.now()-started:0),sec=Math.floor(ms/1000);clock.textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');};
    const stopTimer=()=>{clearInterval(timer);timer=null;};
    const stopAll=()=>{safeStop(recordStream);safeStop(micStream);safeStop(videoStream);recordStream=micStream=videoStream=null;if(video)video.srcObject=null;};
    const reset=()=>{stopTimer();rec=null;chunks=[];elapsed=0;started=0;finishing=false;shutter.disabled=false;shutter.classList.remove('isRecording');pauseBtn.disabled=true;pauseBtn.textContent='Pausar';finish.disabled=true;flip.disabled=false;clock.textContent='00:00';};
    async function getVideo(){
      safeStop(videoStream);videoStream=null;hint.hidden=false;hint.textContent='Solicitando acesso à câmera…';
      try{
        videoStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:1080},height:{ideal:1920}},audio:false});
        video.srcObject=videoStream;await video.play().catch(()=>{});hint.hidden=true;return true;
      }catch(err){
        const blocked=err?.name==='NotAllowedError'||err?.name==='SecurityError';
        showFallback(hint,blocked?'A câmera foi bloqueada pelo navegador. Libere a permissão do site ou use a câmera do celular.':'Não foi possível iniciar a câmera neste navegador.',nativeVideo);return false;
      }
    }
    async function openCamera(){
      if(typeof exporting!=='undefined'&&exporting)return;pause();reset();
      if(!directCaptureAvailable()){nativeVideo.click();return;}
      if(!camDialog.open)camDialog.showModal();await getVideo();
    }
    async function begin(){
      if(!videoStream&&!await getVideo())return;if(rec)return;
      hint.hidden=true;micStream=null;
      try{micStream=await navigator.mediaDevices.getUserMedia({video:false,audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});}catch(err){hint.hidden=false;hint.textContent='Microfone bloqueado — o vídeo será gravado sem áudio.';setTimeout(()=>{if(rec&&hint.textContent.startsWith('Microfone'))hint.hidden=true;},2200);}
      const tracks=[...videoStream.getVideoTracks(),...(micStream?.getAudioTracks()||[])];recordStream=new MediaStream(tracks);const mime=pickMime('video');chunks=[];
      try{rec=new MediaRecorder(recordStream,mime?{mimeType:mime,videoBitsPerSecond:8000000,audioBitsPerSecond:128000}:undefined);}catch{showFallback(hint,'Este navegador não consegue gravar vídeo internamente. Use a câmera do celular.',nativeVideo);return;}
      rec.ondataavailable=e=>e.data?.size&&chunks.push(e.data);rec.onerror=()=>{hint.hidden=false;hint.textContent='Falha durante a gravação.';};
      rec.onstop=async()=>{const type=(rec?.mimeType||mime||chunks[0]?.type||'video/webm').toLowerCase(),blob=new Blob(chunks,{type});try{if(finishing)await addVideoFileLike(blob,'Câmera '+stamp()+extFrom(type,'video'));}catch(e){toast(e.message);}finally{stopAll();reset();if(camDialog.open)camDialog.close();}};
      rec.start(400);started=performance.now();elapsed=0;timer=setInterval(updateClock,200);shutter.classList.add('isRecording');pauseBtn.disabled=false;finish.disabled=false;flip.disabled=true;updateClock();
    }
    function togglePause(){if(!rec)return;if(rec.state==='recording'){elapsed+=performance.now()-started;rec.pause();stopTimer();pauseBtn.textContent='Continuar';shutter.classList.remove('isRecording');updateClock();}else if(rec.state==='paused'){rec.resume();started=performance.now();timer=setInterval(updateClock,200);pauseBtn.textContent='Pausar';shutter.classList.add('isRecording');}}
    function finalize(){if(!rec||finishing)return;finishing=true;if(rec.state==='recording')elapsed+=performance.now()-started;stopTimer();pauseBtn.disabled=true;finish.disabled=true;shutter.disabled=true;rec.stop();}
    function cancel(){if(finishing)return;if(rec&&rec.state!=='inactive'){finishing=false;rec.stop();}else{stopAll();reset();if(camDialog.open)camDialog.close();}}
    camBtn.onclick=openCamera;camBtn.title='Gravar vídeo';shutter.onclick=()=>rec?togglePause():begin();pauseBtn.onclick=togglePause;finish.onclick=finalize;close.onclick=cancel;flip.onclick=async()=>{if(rec)return;facing=facing==='user'?'environment':'user';await getVideo();};
  }

  // Audio record control beside the camera. Final recording goes to the asset/content library.
  const transport=document.querySelector('.transport');let audioBtn=byId('audioRecord');
  if(transport&&!audioBtn){audioBtn=document.createElement('button');audioBtn.id='audioRecord';audioBtn.className='audioRecord';audioBtn.type='button';audioBtn.textContent='🎙';audioBtn.title='Gravar áudio';const camera=byId('cameraRecord');camera?.insertAdjacentElement('afterend',audioBtn);if(!camera)transport.append(audioBtn);}
  let ad=byId('audioCaptureDialog');if(!ad){ad=document.createElement('dialog');ad.id='audioCaptureDialog';ad.innerHTML='<div class="audioCaptureShell"><div class="audioCaptureTop"><button type="button" class="audioClose" aria-label="Fechar">×</button><span class="audioCaptureTime">00:00</span><span style="width:44px"></span></div><div class="audioCaptureCenter"><div class="audioMicPulse">🎙</div><div class="audioCaptureHint">Preparando microfone…</div></div><div class="audioCaptureBottom"><button type="button" class="audioPause" disabled>Pausar</button><button type="button" class="audioShutter" aria-label="Gravar áudio"></button><button type="button" class="audioFinish" disabled>Finalizar</button></div></div>';document.body.append(ad);}
  if(audioBtn&&ad){
    const close=ad.querySelector('.audioClose'),pauseBtn=ad.querySelector('.audioPause'),shutter=ad.querySelector('.audioShutter'),finish=ad.querySelector('.audioFinish'),clock=ad.querySelector('.audioCaptureTime'),hint=ad.querySelector('.audioCaptureHint');let stream=null,rec=null,chunks=[],started=0,elapsed=0,timer=null,finishing=false;
    const setClock=()=>{const ms=elapsed+(rec?.state==='recording'?performance.now()-started:0),sec=Math.floor(ms/1000);clock.textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');};const stopTimer=()=>{clearInterval(timer);timer=null;};const reset=()=>{stopTimer();rec=null;chunks=[];elapsed=0;started=0;finishing=false;shutter.disabled=false;shutter.classList.remove('isRecording');pauseBtn.disabled=true;pauseBtn.textContent='Pausar';finish.disabled=true;clock.textContent='00:00';};
    async function acquire(){safeStop(stream);stream=null;hint.hidden=false;hint.textContent='Solicitando acesso ao microfone…';try{stream=await navigator.mediaDevices.getUserMedia({video:false,audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});hint.textContent='Microfone pronto. Toque no botão vermelho para gravar.';return true;}catch(err){showFallback(hint,'O microfone foi bloqueado pelo navegador. Libere a permissão do site ou use o gravador do celular.',nativeAudio);return false;}}
    async function open(){if(typeof exporting!=='undefined'&&exporting)return;pause();reset();if(!directCaptureAvailable()){nativeAudio.click();return;}if(!ad.open)ad.showModal();await acquire();}
    async function begin(){if(!stream&&!await acquire())return;if(rec)return;const mime=pickMime('audio');chunks=[];try{rec=new MediaRecorder(stream,mime?{mimeType:mime,audioBitsPerSecond:128000}:undefined);}catch{showFallback(hint,'Este navegador não consegue gravar áudio internamente. Use o gravador do celular.',nativeAudio);return;}rec.ondataavailable=e=>e.data?.size&&chunks.push(e.data);rec.onstop=async()=>{const type=(rec?.mimeType||mime||chunks[0]?.type||'audio/webm').toLowerCase(),blob=new Blob(chunks,{type});try{if(finishing)await addAudioFileLike(blob,'Áudio '+stamp()+extFrom(type,'audio'));}catch(e){toast(e.message);}finally{safeStop(stream);stream=null;reset();if(ad.open)ad.close();}};rec.start(300);started=performance.now();elapsed=0;timer=setInterval(setClock,200);hint.textContent='Gravando…';shutter.classList.add('isRecording');pauseBtn.disabled=false;finish.disabled=false;setClock();}
    function togglePause(){if(!rec)return;if(rec.state==='recording'){elapsed+=performance.now()-started;rec.pause();stopTimer();pauseBtn.textContent='Continuar';shutter.classList.remove('isRecording');hint.textContent='Pausado';setClock();}else if(rec.state==='paused'){rec.resume();started=performance.now();timer=setInterval(setClock,200);pauseBtn.textContent='Pausar';shutter.classList.add('isRecording');hint.textContent='Gravando…';}}
    function finalize(){if(!rec||finishing)return;finishing=true;if(rec.state==='recording')elapsed+=performance.now()-started;stopTimer();pauseBtn.disabled=true;finish.disabled=true;shutter.disabled=true;rec.stop();}
    function cancel(){if(finishing)return;if(rec&&rec.state!=='inactive'){finishing=false;rec.stop();}else{safeStop(stream);stream=null;reset();if(ad.open)ad.close();}}
    audioBtn.onclick=open;shutter.onclick=()=>rec?togglePause():begin();pauseBtn.onclick=togglePause;finish.onclick=finalize;close.onclick=cancel;
  }

  // Bigger mobile keyframes: 16px diamond with ~48px effective touch area. A tap selects exactly that keyframe.
  const priorBuild=buildTimeline;
  buildTimeline=function(){priorBuild();document.querySelectorAll('.clipKey').forEach(dot=>{const node=dot.closest('.clip'),c=node&&P.clips.find(x=>x.id===node.dataset.id),idx=Number(dot.dataset.keyIndex);if(!c||!Number.isInteger(idx))return;dot.classList.toggle('selectedKey',c.id===selected&&idx===keyIndex);dot.title='Keyframe '+(idx+1)+' · toque para selecionar; use ◇− para excluir';dot.onclick=e=>{e.stopPropagation();pause();selected=c.id;keyIndex=idx;byId('editScope').value='key';t=c.start+c.keys[idx].t;renderUI(false);};});};
  if(isPhone())requestAnimationFrame(()=>{try{buildTimeline();}catch{}});
})();

