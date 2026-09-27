'use strict';
(()=>{
  const VERSION='23.0.0', $=id=>document.getElementById(id), q=s=>document.querySelector(s), qa=s=>[...document.querySelectorAll(s)];
  document.documentElement.dataset.toucaV23='true';
  try{P.editorVersion=VERSION;}catch{}
  if($('pwaStatus'))$('pwaStatus').textContent='Touca Editor Desktop · v23.0.0 · aplicativo local';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const MEDIA=['main','overlay','overlay2','overlay3','overlay4','overlay5','overlay6','overlay7'];
  const AUDIO=['voice','music','audio3','audio4','audio5'];
  const LABEL={main:'Camada 1 · Mídia principal',overlay:'Camada 2',overlay2:'Camada 3',overlay3:'Camada 4',overlay4:'Camada 5',overlay5:'Camada 6',overlay6:'Camada 7',overlay7:'Camada 8',subtitle:'Legendas',voice:'Áudio 1',music:'Áudio 2',audio3:'Áudio 3',audio4:'Áudio 4',audio5:'Áudio 5'};
  const native=window.toucaNative;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  // ---- common inspector shell ----
  function inspector(title,hint,html){const p=$('v19Inspector'),body=$('v19InspectorBody');if(!p||!body)return null;$('v19InspectorTitle').textContent=title;$('v19InspectorHint').textContent=hint;body.innerHTML=html;p.classList.remove('v19Hidden');$('v19Library')?.classList.add('v19Hidden');return body;}
  function assetThumbForTrack(track){const c=P.clips.find(x=>x.track===track&&['image','video'].includes(x.type))||P.clips.find(x=>x.track===track);if(!c)return '';const a=P.assets.find(x=>x.id===c.asset);return a?.thumbData||((a?.type==='image')?a.data:'')||'';}

  // ---- selected animation/transition card + duration in the card ----
  let lastLibraryCtx=null,previewRAF=0,lastPreviewFrame=0;
  function nearestCut(){try{const all=cuts();return all.sort((a,b)=>Math.abs(a.time-t)-Math.abs(b.time-t))[0]||null;}catch{return null;}}
  function librarySelection(ctx){
    if(ctx.mode==='animation'){
      const targets=ctx.extra?.targets?.length?ctx.extra.targets:(ctx.target?[ctx.target]:[current?.()].filter(Boolean));
      const c=targets.find(Boolean),spec=c?.animation?.[ctx.side];return {id:spec?.name||'',duration:spec?.duration||.42,owner:spec,clip:c};
    }
    if(ctx.mode==='transition'){
      const cut=ctx.extra?.cut||nearestCut(),spec=cut?.b?.transition;return {id:spec?.type||'',duration:spec?.duration||.42,owner:spec,cut};
    }
    return {id:'',duration:.42};
  }
  function paintAnimPreview(canvas,id,side,time){const dpr=Math.min(2,devicePixelRatio||1),w=canvas.clientWidth||116,h=canvas.clientHeight||62;if(canvas.width!==w*dpr||canvas.height!==h*dpr){canvas.width=w*dpr;canvas.height=h*dpr;}const g=canvas.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);g.fillStyle='#102129';g.fillRect(0,0,w,h);g.strokeStyle='#ffffff24';g.strokeRect(.5,.5,w-1,h-1);let p=(time%1300)/1300,p2=p<.84?p/.84:1;const u=side==='out'?1-p2:p2;let x=w/2,y=h/2,s=.78,rot=0,alpha=1;const ease=1-Math.pow(1-u,3),wave=Math.sin(u*Math.PI),shake=Math.sin(u*Math.PI*8)*wave*wave;
    if(id.includes('zoom')||['scaleUp','scaleDown','pop','comicPop','lens'].includes(id))s=.28+.5*ease;
    if(id==='zoomImpact'||id==='comicPop')s+=wave*.13;
    if(id==='slideLeft')x=w*.9-w*.4*ease;if(id==='slideRight')x=w*.1+w*.4*ease;if(id==='slideUp')y=h*.9-h*.4*ease;if(id==='slideDown')y=h*.1+h*.4*ease;
    if(id.includes('spin')||id==='spiral'||id==='rollLeft'||id==='rollRight')rot=(1-ease)*2.4;
    if(id==='fade'||id==='blur'||id==='focus')alpha=.15+.85*ease;
    if(id==='shake'||id==='glitch'||id==='rgb'){x+=shake*8;y+=Math.cos(u*26)*wave*3;}
    if(id==='bounce'||id==='spring')y-=Math.abs(Math.sin(u*Math.PI*2))*wave*9;
    g.save();g.globalAlpha=alpha;g.translate(x,y);g.rotate(rot);g.scale(s,s);g.fillStyle='#f8a057';g.strokeStyle='#d8fbff';g.lineWidth=2;g.beginPath();g.roundRect(-25,-18,50,36,7);g.fill();g.stroke();g.fillStyle='#17262c';g.fillRect(-13,-8,26,4);g.fillRect(-9,2,18,4);g.restore();
  }
  function paintTranPreview(canvas,id,time){const dpr=Math.min(2,devicePixelRatio||1),w=canvas.clientWidth||116,h=canvas.clientHeight||62;if(canvas.width!==w*dpr||canvas.height!==h*dpr){canvas.width=w*dpr;canvas.height=h*dpr;}const g=canvas.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);const p=(time%1500)/1500,u=p<.84?p/.84:1,s=u*u*(3-2*u),peak=Math.sin(Math.PI*u);g.clearRect(0,0,w,h);g.fillStyle='#142830';g.fillRect(0,0,w,h);const A=()=>{g.fillStyle='#f18f4a';g.fillRect(0,0,w,h)},B=()=>{g.fillStyle='#63d8e1';g.fillRect(0,0,w,h)};
    if(/left|right|slide|push|whip|panel/.test(id)){B();g.save();let dir=/right/.test(id)?1:-1;g.translate(dir*s*w,0);A();g.restore();}
    else if(/up|down/.test(id)){B();g.save();let dir=/down/.test(id)?1:-1;g.translate(0,dir*s*h);A();g.restore();}
    else if(/zoom|\bin\b|\bout\b|lens/.test(id)){B();g.save();g.globalAlpha=1-s;g.translate(w/2,h/2);const z=1+s*.45;g.scale(z,z);g.translate(-w/2,-h/2);A();g.restore();}
    else if(/wipe|split|circle|diamond/.test(id)){A();g.save();g.beginPath();if(id==='circle')g.arc(w/2,h/2,Math.hypot(w,h)*.55*s,0,Math.PI*2);else g.rect(0,0,w*s,h);g.clip();B();g.restore();}
    else if(/glitch|rgb|shake/.test(id)){A();g.save();g.globalAlpha=s;g.translate(Math.sin(u*70)*7*peak,0);B();g.restore();}
    else {A();g.globalAlpha=s;B();g.globalAlpha=1;}
    g.strokeStyle='#ffffff35';g.strokeRect(.5,.5,w-1,h-1);
  }
  function animateLibraryPreviews(ts){if(ts-lastPreviewFrame>66){lastPreviewFrame=ts;const ctx=lastLibraryCtx;if(ctx&&!$('v19Library')?.classList.contains('v19Hidden')){qa('#v19LibraryGrid .v23LoopPreview').forEach(cv=>{const card=cv.closest('.v19Card'),id=card?.dataset.resource||'';if(ctx.mode==='animation')paintAnimPreview(cv,id,ctx.side,ts);else if(ctx.mode==='transition')paintTranPreview(cv,id,ts);});}}previewRAF=requestAnimationFrame(animateLibraryPreviews);}
  if(!previewRAF)previewRAF=requestAnimationFrame(animateLibraryPreviews);

  window.__toucaV23DecorateLibrary=function(ctx){lastLibraryCtx=ctx||lastLibraryCtx;if(!lastLibraryCtx)return;const grid=$('v19LibraryGrid');if(!grid)return;const sel=librarySelection(lastLibraryCtx);grid.querySelectorAll('.v20DurationBar').forEach(x=>x.remove());grid.querySelectorAll('.v19Card').forEach(card=>{
      card.classList.toggle('v23ResourceSelected',!!sel.id&&card.dataset.resource===sel.id);
      const pv=card.querySelector('.v19Preview');if(pv&&['animation','transition'].includes(lastLibraryCtx.mode)){pv.textContent='';let cv=pv.querySelector('canvas');if(!cv){cv=document.createElement('canvas');cv.className='v23LoopPreview';pv.append(cv);}}
      card.querySelector('.v23CardDuration')?.remove();
      if(card.dataset.resource===sel.id&&['animation','transition'].includes(lastLibraryCtx.mode)){
        const box=document.createElement('div');box.className='v23CardDuration';box.innerHTML=`<span>Duração</span><input type="range" min="0.10" max="3.00" step="0.05" value="${clamp(Number(sel.duration)||.42,.1,3).toFixed(2)}"><output>${clamp(Number(sel.duration)||.42,.1,3).toFixed(2)}s</output>`;const r=box.querySelector('input'),out=box.querySelector('output');r.onpointerdown=e=>e.stopPropagation();r.onclick=e=>e.stopPropagation();r.oninput=e=>{e.stopPropagation();const d=Number(r.value);out.textContent=d.toFixed(2)+'s';if(lastLibraryCtx.mode==='animation'){const S=librarySelection(lastLibraryCtx);if(S.owner){S.owner.duration=Math.min(d,S.clip?.duration||d);draw?.();}}else{const S=librarySelection(lastLibraryCtx);if(S.owner&&S.cut)S.owner.duration=Math.min(d,S.cut.a.duration,S.cut.b.duration);}};r.onchange=e=>{e.stopPropagation();changed?.();};box.onclick=e=>e.stopPropagation();card.append(box);
      }
      installPresetSoundGesture(card,lastLibraryCtx);
    });
  };

  // ---- persistent preset sound: hold or right click ----
  let soundMenu=null,soundCtx=null;
  function closeSoundMenu(){soundMenu?.remove();soundMenu=null;}
  function presetKey(kind,id){return `${kind}:${id}`;}
  async function dataUrlFile(data,name){const b=await (await fetch(data)).blob();return new File([b],name||'preset-sound.wav',{type:b.type||'audio/wav'});}
  async function attachSavedPreset(kind,id,ctx=lastLibraryCtx){if(!native?.getPresetSound||typeof attachEventSound!=='function')return;const saved=await native.getPresetSound(kind,id).catch(()=>null);if(!saved?.dataUrl)return;
    const file=await dataUrlFile(saved.dataUrl,saved.name);
    if(kind==='animation'){
      const side=ctx?.side||'in',targets=ctx?.extra?.targets?.length?ctx.extra.targets:(ctx?.target?[ctx.target]:[current?.()].filter(Boolean));
      for(const c of targets){const spec=c?.animation?.[side];if(!spec||spec.name!==id)continue;spec._presetSoundChecked=id;const at=side==='out'?Math.max(c.start,c.start+c.duration-(spec.duration||.42)):c.start;await attachEventSound(file,spec,at,`Som · ${id}`,`ani:${c.id}:${side}`);}
    }else if(kind==='transition'){
      const cut=ctx?.extra?.cut||nearestCut(),spec=cut?.b?.transition;if(spec?.type===id){spec._presetSoundChecked=id;await attachEventSound(file,spec,Math.max(0,cut.time-(spec.duration||.42)/2),`Som · ${id}`,`tran:${cut.b.id}`);}
    }
  }
  function showSoundMenu(card,ctx,x,y){closeSoundMenu();card.dataset.dragged='1';const kind=card.dataset.kind,id=card.dataset.resource;soundCtx={kind,id,ctx,card};soundMenu=document.createElement('div');soundMenu.className='v23SoundMenu';soundMenu.innerHTML=`<b>Som do preset</b><small>${esc(card.querySelector('b')?.textContent||id)}</small><button data-merge>♪ Fundir som</button><button data-clear>⌫ Limpar som salvo</button>`;document.body.append(soundMenu);soundMenu.style.left=Math.min(x,innerWidth-245)+'px';soundMenu.style.top=Math.min(y,innerHeight-160)+'px';soundMenu.querySelector('[data-merge]').onclick=()=>{const input=document.createElement('input');input.type='file';input.accept='audio/*';input.onchange=async()=>{const f=input.files?.[0];if(!f)return;const fr=new FileReader();fr.onload=async()=>{await native?.setPresetSound?.(kind,id,f.name,fr.result);toast?.('Som salvo para este preset.');closeSoundMenu();await attachSavedPreset(kind,id,ctx);};fr.readAsDataURL(f);};input.click();};soundMenu.querySelector('[data-clear]').onclick=async()=>{await native?.clearPresetSound?.(kind,id);if(kind==='animation'){const side=ctx?.side||'in',c=ctx?.target||current?.();if(c)P.clips=P.clips.filter(x=>x.eventSoundFor!==`ani:${c.id}:${side}`);}else{const cut=ctx?.extra?.cut||nearestCut();if(cut)P.clips=P.clips.filter(x=>x.eventSoundFor!==`tran:${cut.b.id}`);}changed?.();toast?.('Som do preset removido.');closeSoundMenu();};setTimeout(()=>document.addEventListener('pointerdown',function once(e){if(soundMenu&&!soundMenu.contains(e.target))closeSoundMenu();document.removeEventListener('pointerdown',once,true);},true),0);}
  const soundInstalled=new WeakSet();
  function installPresetSoundGesture(card,ctx){if(soundInstalled.has(card)||!['animation','transition'].includes(card.dataset.kind))return;soundInstalled.add(card);let timer=null,sx=0,sy=0;card.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();showSoundMenu(card,ctx,e.clientX,e.clientY);});card.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('.v23CardDuration'))return;sx=e.clientX;sy=e.clientY;timer=setTimeout(()=>showSoundMenu(card,ctx,sx,sy),360);},{capture:true});card.addEventListener('pointermove',e=>{if(Math.hypot(e.clientX-sx,e.clientY-sy)>5){clearTimeout(timer);timer=null;}},{capture:true});card.addEventListener('pointerup',()=>{clearTimeout(timer);timer=null;},{capture:true});}
  $('v19LibraryGrid')?.addEventListener('click',e=>{const card=e.target.closest('.v19Card[data-kind="animation"],.v19Card[data-kind="transition"]');if(!card)return;const kind=card.dataset.kind,id=card.dataset.resource;setTimeout(()=>attachSavedPreset(kind,id,lastLibraryCtx).catch(console.warn),80);});

  // ---- Transform/scale that does not auto-refit after manual scaling ----
  window.toucaTransform23=function(c){if(!c||!['image','video'].includes(c.type))return;const scale=Number(c.keys?.[0]?.v?.scale)||100;const body=inspector('Transformar','MÍDIA',`<div class="v23Hint">A escala manual é mantida. O editor não volta a preencher a tela automaticamente.</div><div class="v19Range"><span>Escala</span><input id="v23Scale" type="range" min="5" max="400" step="1" value="${scale}"><output>${Math.round(scale)}%</output></div><div class="v19Actions"><button data-fit="contain">Ajustar</button><button data-fit="cover">Preencher</button></div>`);if(!body)return;const r=$('v23Scale'),o=r.nextElementSibling;r.oninput=()=>{o.textContent=r.value+'%';for(const k of c.keys||[])k.v.scale=Number(r.value);draw?.();};r.onchange=()=>changed?.();body.onclick=e=>{const b=e.target.closest('[data-fit]');if(!b)return;c.fit=b.dataset.fit;changed?.();};};

  // ---- Logo always centered horizontally, 50% opacity, topmost ----
  window.toucaLogoInspector23=function(c){if(!c?.brand)return;const [w,h]=dimensions();const y=c.keys?.[0]?.v?.y||0,yp=Math.round(y/h*100);const body=inspector('Logo','SOBRE TODAS AS CAMADAS',`<div class="v23Hint">A logo fica sempre centralizada na horizontal e com 50% de opacidade. Não usa keyframes.</div><div class="v19Range"><span>Vertical</span><input id="v23LogoY" type="range" min="-45" max="45" step="1" value="${yp}"><output>${yp}%</output></div><div class="v19Range"><span>Tamanho</span><input id="v23LogoSize" type="range" min="20" max="260" step="1" value="${c.fontSize||72}"><output>${c.fontSize||72}</output></div>`);if(!body)return;const yR=$('v23LogoY'),sR=$('v23LogoSize');const apply=()=>{const yy=h*Number(yR.value)/100;for(const k of c.keys||[]){k.v.x=0;k.v.y=yy;k.v.opacity=50;}c.logoYPercent=Number(yR.value);c.logoOpacity=50;c.fontSize=Number(sR.value);yR.nextElementSibling.textContent=yR.value+'%';sR.nextElementSibling.textContent=sR.value;draw?.();};yR.oninput=sR.oninput=apply;yR.onchange=sR.onchange=()=>{apply();changed?.();};};
  function normalizeBrands(){for(const c of P.clips||[]){if(!c.brand)continue;for(const k of c.keys||[]){k.v.x=0;k.v.opacity=50;}c.logoOpacity=50;}}

  // ---- Effect target picker: Global or exactly one visual layer ----
  window.toucaEffectTarget23=function(fx){if(!fx||fx.type!=='effect')return;const cards=[`<button class="v19Card" data-target="global"><div class="v23LayerThumb v23Global">✦</div><b>Global</b><small>Sobrepõe a composição</small></button>`];for(const tr of MEDIA){const th=assetThumbForTrack(tr);cards.push(`<button class="v19Card" data-target="${tr}"><div class="v23LayerThumb">${th?`<img src="${th}" alt="">`:'▱'}</div><b>${esc(LABEL[tr])}</b><small>${fx.effectTargetTrack===tr?'Conectado':'Aplicar só aqui'}</small></button>`);}const body=inspector('Conectar efeito','ESCOPO DO EFEITO',`<div class="v23Hint">Conectado: o efeito processa apenas aquela camada. Global: processa a composição completa.</div><div class="v19Grid">${cards.join('')}</div>`);body.onclick=e=>{const b=e.target.closest('[data-target]');if(!b)return;fx.effectTargetTrack=b.dataset.target==='global'?null:b.dataset.target;fx.effectScope=fx.effectTargetTrack?'target':'all';changed?.();$('v19Inspector')?.classList.add('v19Hidden');};};

  // ---- Real local voice cleaning (DSP, non-destructive source retained) ----
  function wavDataUrl(channels,sampleRate){const n=channels[0].length,ch=channels.length,bytes=44+n*ch*2,ab=new ArrayBuffer(bytes),v=new DataView(ab);const str=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};str(0,'RIFF');v.setUint32(4,bytes-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,ch,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*ch*2,true);v.setUint16(32,ch*2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,n*ch*2,true);let o=44;for(let i=0;i<n;i++)for(let c=0;c<ch;c++){let x=Math.max(-1,Math.min(1,channels[c][i]));v.setInt16(o,x<0?x*32768:x*32767,true);o+=2;}let bin='',u=new Uint8Array(ab),step=0x8000;for(let i=0;i<u.length;i+=step)bin+=String.fromCharCode(...u.subarray(i,i+step));return 'data:audio/wav;base64,'+btoa(bin);}
  window.toucaCleanVoice23=async function(c){if(!c||c.type!=='audio')return toast?.('Selecione uma faixa de áudio.');const a=P.assets.find(x=>x.id===c.asset);if(!a?.data)return toast?.('Áudio local não encontrado.');try{toast?.('Limpando voz localmente…');const ac=new AudioContext(),buf=await ac.decodeAudioData(await (await fetch(a.data)).arrayBuffer());await ac.close();const sr=buf.sampleRate,frame=Math.max(128,Math.round(sr*.02)),outs=[];for(let ch=0;ch<buf.numberOfChannels;ch++){const input=buf.getChannelData(ch),rms=[];for(let i=0;i<input.length;i+=frame){let ss=0,n=Math.min(frame,input.length-i);for(let j=0;j<n;j++)ss+=input[i+j]*input[i+j];rms.push(Math.sqrt(ss/Math.max(1,n)));}const sorted=[...rms].sort((x,y)=>x-y),floor=sorted[Math.floor(sorted.length*.22)]||.003,threshold=Math.max(.0045,floor*2.15),out=new Float32Array(input.length);let gain=1,px=0,py=0,peak=0;for(let i=0;i<input.length;i++){const r=rms[Math.floor(i/frame)]||0,target=r<threshold?clamp(.12+(r/threshold)*.45,.12,.57):1;gain+= (target>gain?.18:.014)*(target-gain);const hp=input[i]-px+.994*py;px=input[i];py=hp;let y=hp*gain;out[i]=y;peak=Math.max(peak,Math.abs(y));}const norm=peak>.03?Math.min(1.45,.93/peak):1;for(let i=0;i<out.length;i++)out[i]=Math.tanh(out[i]*norm*1.08);outs.push(out);}const data=wavDataUrl(outs,sr),na={id:uid(),name:'Voz limpa · '+a.name,type:'audio',data};await loadAsset(na);checkpoint?.();P.assets.push(na);c.originalAsset23??=c.asset;c.asset=na.id;c.name='Voz limpa · '+(c.name||a.name);changed?.();toast?.('Ruído reduzido. O arquivo original foi preservado nos arquivos do projeto.');}catch(e){console.error(e);toast?.('Não foi possível limpar esta faixa: '+e.message);}};

  // ---- Default final keyframe = one second before the clip end; click follows it ----
  const oldNewClip=window.newClip;
  if(typeof oldNewClip==='function')window.newClip=function(...args){const c=oldNewClip(...args);if(['image','video'].includes(c.type)&&c.keys?.length>1){c.keys[c.keys.length-1].t=c.duration>1.1?Math.max(1/30,c.duration-1):Math.max(1/30,c.duration-1/30);}return c;};
  function migrateEndKeys(){for(const c of P.clips||[]){if(!['image','video'].includes(c.type)||!c.keys?.length)continue;const last=c.keys[c.keys.length-1];if(c.v26AutoEndKey&&Math.abs(last.t-c.duration)<.02)last.t=c.duration>1.1?Math.max(1/30,c.duration-1):Math.max(1/30,c.duration-1/30);}}
  $('timelineScroll')?.addEventListener('click',e=>{const dot=e.target.closest('.clipKey');if(!dot)return;const el=dot.closest('.clip'),c=P.clips.find(x=>x.id===el?.dataset.id);if(!c)return;const dots=[...el.querySelectorAll('.clipKey')],i=Math.max(0,dots.indexOf(dot));selected=c.id;keyIndex=i;t=clamp(c.start+(c.keys[i]?.t||0),0,total());try{syncMedia(true);draw();renderUI(false);}catch{};},{capture:true});

  // ---- Per-layer compositor: Camada 1 is base; larger number renders above. Effects can be targeted. Logo last. ----
  const baseDraw23=drawTo,mainCanvas=document.createElement('canvas'),compositeCanvas=document.createElement('canvas'),layerCanvases=new Map(),fxA=document.createElement('canvas'),fxB=document.createElement('canvas');
  let lens23=null;
  function canvasFor(key,w,h,alpha=true){let c=layerCanvases.get(key);if(!c){c=document.createElement('canvas');layerCanvases.set(key,c);}if(c.width!==w||c.height!==h){c.width=w;c.height=h;}const g=c.getContext('2d',{alpha});g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,w,h);return [c,g];}
  function fxOne(src,fx,w,h,time,dst){if(dst.width!==w||dst.height!==h){dst.width=w;dst.height=h;}const g=dst.getContext('2d',{alpha:true});g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,w,h);g.globalAlpha=1;g.globalCompositeOperation='source-over';g.filter='none';const k=clamp((fx.intensity??70)/100,0,1),id=fx.preset||'wide';if(id==='blur'){g.filter=`blur(${1+9*k}px)`;g.drawImage(src,0,0,w,h);g.filter='none';}else if(id==='vignette'){g.drawImage(src,0,0,w,h);const gr=g.createRadialGradient(w/2,h/2,Math.min(w,h)*.2,w/2,h/2,Math.max(w,h)*.68);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,`rgba(0,0,0,${.72*k})`);g.globalCompositeOperation='source-atop';g.fillStyle=gr;g.fillRect(0,0,w,h);g.globalCompositeOperation='source-over';}else if(id==='wide'){try{lens23??=typeof createLens==='function'?createLens():null;const out=lens23?.render?lens23.render(src,k*.32):src;g.drawImage(out,0,0,w,h);}catch{g.drawImage(src,0,0,w,h);}}else g.drawImage(src,0,0,w,h);return dst;}
  function fxChain(src,list,w,h,time){let cur=src,flip=false;for(const fx of list){const dst=flip?fxA:fxB;cur=fxOne(cur,fx,w,h,time,dst);flip=!flip;}return cur;}
  drawTo=function(g,w,h,time){if(!P?.clips)return baseDraw23(g,w,h,time);if(total()>0&&time>=total())time=Math.max(0,total()-.00001);normalizeBrands();const activeFx=P.clips.filter(c=>c.type==='effect'&&c.enabled!==false&&time>=c.start&&time<c.start+c.duration),brands=P.clips.filter(c=>c.brand&&time>=c.start&&time<c.start+c.duration);const targetFx=new Map(),globalFx=[];for(const fx of activeFx){let tr=fx.effectTargetTrack||(fx.effectScope==='main'?'main':null);if(tr){if(!targetFx.has(tr))targetFx.set(tr,[]);targetFx.get(tr).push(fx);}else globalFx.push(fx);}
    if(mainCanvas.width!==w||mainCanvas.height!==h){mainCanvas.width=w;mainCanvas.height=h;}const hidden=[],effectStates=activeFx.map(x=>x.enabled);for(const x of activeFx)x.enabled=false;for(const c of P.clips){if(c.type!=='audio'&&c.type!=='effect'&&c.track!=='main'){hidden.push([c,c.start]);c.start=1e12;}if(c.brand&&!hidden.some(([x])=>x===c)){hidden.push([c,c.start]);c.start=1e12;}}
    try{baseDraw23(mainCanvas.getContext('2d',{alpha:false}),w,h,time);}finally{for(const [c,st] of hidden)c.start=st;activeFx.forEach((x,i)=>x.enabled=effectStates[i]);}
    let scene=targetFx.has('main')?fxChain(mainCanvas,targetFx.get('main'),w,h,time):mainCanvas;if(compositeCanvas.width!==w||compositeCanvas.height!==h){compositeCanvas.width=w;compositeCanvas.height=h;}const cg=compositeCanvas.getContext('2d',{alpha:false});cg.setTransform(1,0,0,1,0,0);cg.clearRect(0,0,w,h);cg.drawImage(scene,0,0,w,h);const [pw,ph]=dimensions();for(const tr of MEDIA.slice(1)){
      const list=visibleClips(time,false).filter(c=>c.track===tr&&c.type!=='effect'&&!c.brand);if(!list.length)continue;const [lc,lg]=canvasFor('track:'+tr,w,h,true);lg.save();lg.scale(w/pw,h/ph);for(const c of list)paintClip(lg,c,time,pw,ph);lg.restore();const processed=targetFx.has(tr)?fxChain(lc,targetFx.get(tr),w,h,time):lc;cg.drawImage(processed,0,0,w,h);
    }
    const subtitles=visibleClips(time,false).filter(c=>c.track==='subtitle'&&c.type!=='effect'&&!c.brand);if(subtitles.length){const [lc,lg]=canvasFor('track:subtitle',w,h,true);lg.save();lg.scale(w/pw,h/ph);for(const c of subtitles)paintClip(lg,c,time,pw,ph);lg.restore();const processed=targetFx.has('subtitle')?fxChain(lc,targetFx.get('subtitle'),w,h,time):lc;cg.drawImage(processed,0,0,w,h);}
    scene=globalFx.length?fxChain(compositeCanvas,globalFx,w,h,time):compositeCanvas;g.save();g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,w,h);g.drawImage(scene,0,0,w,h);g.restore();if(brands.length){g.save();g.scale(w/pw,h/ph);for(const c of brands)paintClip(g,c,time,pw,ph);g.restore();}
  };

  // ---- keep old projects compatible + clean track metadata ----
  function migrate23(){try{migrateEndKeys();for(const c of P.clips||[]){if(c.type==='effect'&&c.track==='effectsLocal'&&!c.effectTargetTrack){c.effectTargetTrack='main';c.effectScope='target';}if(c.brand){for(const k of c.keys||[]){k.v.x=0;k.v.opacity=50;}c.logoOpacity=50;}}P.editorVersion=VERSION;}catch(e){console.warn(e);}}
  migrate23();
  const changedBase23=changed;changed=function(){migrate23();const r=changedBase23();setTimeout(()=>{try{window.__toucaV23DecorateLibrary?.(lastLibraryCtx);}catch{}},0);return r;};
  const restoreProject23=window.restoreProject;if(typeof restoreProject23==='function')window.restoreProject=async function(...args){const r=await restoreProject23(...args);migrate23();buildTimeline?.();draw?.();return r;};

  // Refresh track labels after earlier project restores.
  setTimeout(()=>{for(const [tr,label] of Object.entries(LABEL)){const h=q(`.trackHead[data-track-head="${tr}"]`);if(h)h.innerHTML='<span></span>'+label;}migrate23();buildTimeline?.();draw?.();},700);
})();
