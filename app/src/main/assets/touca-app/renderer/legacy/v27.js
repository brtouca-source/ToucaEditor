'use strict';
(()=>{
  const VERSION='27.0.0',SCHEMA=3,$=id=>document.getElementById(id),native=window.toucaNative||null;
  document.documentElement.dataset.toucaV27='true';
  try{P.editorVersion=VERSION;P.projectSchemaVersion=SCHEMA;}catch{}

  // v27 is intentionally a consolidation layer: keep approved v26 behavior, only
  // stamp the new schema/version after mutations/restores so legacy migration stays compatible.
  const changedBefore27=window.changed;
  if(typeof changedBefore27==='function')window.changed=function(){const r=changedBefore27.apply(this,arguments);try{P.editorVersion=VERSION;P.projectSchemaVersion=SCHEMA;}catch{}return r;};
  const restoreBefore27=window.restoreProject;
  if(typeof restoreBefore27==='function')window.restoreProject=async function(obj){const r=await restoreBefore27.apply(this,arguments);try{P.editorVersion=VERSION;P.projectSchemaVersion=SCHEMA;}catch{}return r;};

  function stamp(){
    const status=$('pwaStatus');
    if(status)status.textContent='Touca Editor Desktop · v27 Definitive RC · aplicativo local';
    const settings=$('appSettings');
    const p=settings?.querySelector('p');
    if(p&&/v\d+/i.test(p.textContent||''))p.textContent='Manual rápido · v27';
  }
  stamp();

  // Native-engine health badge. This does not add another permanent toolbar button;
  // it reuses the export dialog and stays out of the editing workspace.
  async function updateEngineBadge(){
    const dlg=$('exportDialog');if(!dlg)return;
    let b=$('v27EngineBadge');
    if(!b){b=document.createElement('div');b.id='v27EngineBadge';b.className='v27EngineBadge';($('exportInfo')||dlg.querySelector('small'))?.after(b);}
    b.textContent='Motor desktop · verificando…';
    try{
      const h=await native?.hardwareInfo?.();
      if(h?.ffmpegPath){const enc=h.preferred||'H.264 do sistema';b.textContent=`Motor desktop ativo · ${enc} · proxy/áudio/mux local`;b.dataset.ok='1';}
      else{b.textContent='Motor compatível ativo · aceleração H.264 do sistema';b.dataset.ok='0';}
    }catch{b.textContent='Motor compatível ativo';b.dataset.ok='0';}
  }
  const showExportBefore27=window.showExport;
  if(typeof showExportBefore27==='function')window.showExport=async function(){stamp();await updateEngineBadge();return showExportBefore27.apply(this,arguments);};
  if($('exportBtn'))$('exportBtn').onclick=window.showExport;

  // Persist preview quality and keep long projects responsive without changing export quality.
  try{
    const select=$('v26PreviewQuality')?.querySelector('select');
    if(select)select.title='Afeta somente o preview. A exportação sempre usa a resolução escolhida.';
  }catch{}

  // Surface the definitive project location only inside the home information panel when available.
  native?.getPaths?.().then(paths=>{
    const info=document.querySelector('#v18Home .v18SafeCard, #v18Home [data-safe], #v18Home .v18InfoCard');
    if(!info||!paths?.projects||info.querySelector('.v27ProjectPath'))return;
    const line=document.createElement('small');line.className='v27ProjectPath';line.textContent='Projetos: '+paths.projects;line.title=paths.projects;info.append(line);
  }).catch(()=>{});


  // Complete offline voice-cleaning fallback: use desktop FFmpeg when present;
  // otherwise process locally with Web Audio DSP so a fresh full install keeps the feature working.
  function wav27(channels,sampleRate){const n=channels[0].length,ch=channels.length,bytes=44+n*ch*2,ab=new ArrayBuffer(bytes),v=new DataView(ab);const str=(o,t)=>{for(let i=0;i<t.length;i++)v.setUint8(o+i,t.charCodeAt(i));};str(0,'RIFF');v.setUint32(4,bytes-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,ch,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*ch*2,true);v.setUint16(32,ch*2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,n*ch*2,true);let o=44;for(let i=0;i<n;i++)for(let c=0;c<ch;c++){const x=Math.max(-1,Math.min(1,channels[c][i]));v.setInt16(o,x<0?x*32768:x*32767,true);o+=2;}let bin='',u=new Uint8Array(ab),step=0x8000;for(let i=0;i<u.length;i+=step)bin+=String.fromCharCode(...u.subarray(i,i+step));return 'data:audio/wav;base64,'+btoa(bin);}
  async function dspClean27(c,intensity){const a=P.assets.find(x=>x.id===c.asset);if(!a?.data)throw Error('Áudio local não encontrado.');const ac=new AudioContext(),buf=await ac.decodeAudioData(await(await fetch(a.data)).arrayBuffer());await ac.close();const sr=buf.sampleRate,frame=Math.max(128,Math.round(sr*.02)),outs=[],amount=Math.max(0,Math.min(100,Number(intensity)||55))/100;for(let ch=0;ch<buf.numberOfChannels;ch++){const input=buf.getChannelData(ch),rms=[];for(let i=0;i<input.length;i+=frame){let ss=0,n=Math.min(frame,input.length-i);for(let j=0;j<n;j++)ss+=input[i+j]*input[i+j];rms.push(Math.sqrt(ss/Math.max(1,n)));}const sorted=[...rms].sort((x,y)=>x-y),floor=sorted[Math.floor(sorted.length*.22)]||.003,threshold=Math.max(.0035,floor*(1.55+amount*1.5)),out=new Float32Array(input.length);let gain=1,px=0,py=0,peak=0;const minGain=.38*(1-amount)+.08*amount;for(let i=0;i<input.length;i++){const r=rms[Math.floor(i/frame)]||0,target=r<threshold?Math.max(minGain,minGain+(r/threshold)*(1-minGain)):1;gain+=(target>gain?.20:.010+amount*.010)*(target-gain);const hp=input[i]-px+.994*py;px=input[i];py=hp;let y=hp*gain;out[i]=y;peak=Math.max(peak,Math.abs(y));}const norm=peak>.03?Math.min(1.45,.93/peak):1;for(let i=0;i<out.length;i++)out[i]=Math.tanh(out[i]*norm*1.06);outs.push(out);}const na={id:uid(),name:'Voz limpa · '+a.name,type:'audio',data:wav27(outs,sr)};await loadAsset(na);checkpoint?.();P.assets.push(na);c.originalAsset26||=c.asset;c.asset=na.id;c.name=na.name;changed?.();return na;}
  let clean27=null;
  function cleanDialog27(c){if(!clean27){clean27=document.createElement('dialog');clean27.className='v26CleanDialog';clean27.innerHTML='<h2>Limpar voz</h2><p class="muted">Redução de ruído local e não destrutiva. O original permanece no projeto.</p><div class="v26Strength"><span>Força</span><input type="range" min="0" max="100" value="55"><output>55%</output></div><div class="v26NativeBadge" data-status>Pronto.</div><footer><button data-close>Cancelar</button><button data-apply class="primary">Aplicar</button></footer>';document.body.append(clean27);const r=clean27.querySelector('input'),out=clean27.querySelector('output');r.oninput=()=>out.textContent=r.value+'%';clean27.querySelector('[data-close]').onclick=()=>clean27.close();}clean27._clip=c;const status=clean27.querySelector('[data-status]'),apply=clean27.querySelector('[data-apply]');status.textContent='Pronto para processar localmente.';apply.disabled=false;apply.onclick=async()=>{const clip=clean27._clip,a=P.assets.find(x=>x.id===clip?.asset);if(!clip||!a)return;apply.disabled=true;status.textContent='Limpando voz…';try{let done=false;if(native?.cleanVoiceNative&&P.projectId){try{let ex=await native.assetExists?.(P.projectId,a.id);if(!ex&&a.data?.startsWith('data:')){await native.storeAsset(P.projectId,a.id,a.name,a.type,a.data);ex=true;}if(ex){const na=await native.cleanVoiceNative(P.projectId,a.id,Number(clean27.querySelector('input').value));await loadAsset(na);checkpoint?.();P.assets.push(na);clip.originalAsset26||=clip.asset;clip.asset=na.id;clip.name=na.name;changed?.();done=true;status.textContent='Concluído pelo motor desktop.';}}catch{}}
      if(!done){await dspClean27(clip,Number(clean27.querySelector('input').value));status.textContent='Concluído pelo motor local compatível.';}setTimeout(()=>clean27.close(),420);}catch(err){status.textContent=err.message||String(err);apply.disabled=false;}};clean27.showModal();}
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-v26-clean]');if(!b)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();const c=P.clips.find(x=>x.id===selected);if(c?.type==='audio')cleanDialog27(c);},true);

  setTimeout(stamp,700);
})();
