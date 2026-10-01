
'use strict';
const $=id=>document.getElementById(id),clone=o=>JSON.parse(JSON.stringify(o)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),snapFrame=t=>Math.round(t*30)/30,uid=()=>crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2),pose=()=>({x:0,y:0,scale:100,rotation:0,opacity:100}),tracks=['main','overlay','subtitle','voice','music'];
const ctx=$('preview').getContext('2d'),cache=new Map();let P={version:1,name:'Meu novo vídeo',ratio:'9:16',assets:[],clips:[]},selected=null,keyIndex=0,t=0,playing=false,exporting=false,pps=45,history=[],future=[],db=null,saveTimer,raf,clock=0,audioCtx,mixDest,recorder,asrWorker,asrToken=0,asrBusy=false;
const ease=(n,u)=>n==='in'?u*u:n==='out'?1-(1-u)*(1-u):n==='inout'?u*u*(3-2*u):u;
function valueAt(keys,time){if(time<=keys[0].t)return clone(keys[0].v);if(time>=keys.at(-1).t)return clone(keys.at(-1).v);let i=keys.findIndex((k,j)=>j<keys.length-1&&time>=k.t&&time<keys[j+1].t),a=keys[i],b=keys[i+1],s=(time-a.t)/(b.t-a.t),lo=a.u0??0,hi=a.u1??1,den=ease(a.ease,hi)-ease(a.ease,lo),f=Math.abs(den)<1e-10?s:(ease(a.ease,lo+(hi-lo)*s)-ease(a.ease,lo))/den;return Object.fromEntries(Object.keys(a.v).map(k=>[k,a.v[k]+(b.v[k]-a.v[k])*f]));}
function segmentAt(keys,time){if(time<keys[0].t||time>=keys.at(-1).t)return null;return keys.findIndex((k,i)=>i<keys.length-1&&time>=k.t&&time<keys[i+1].t);}
function sliceKeys(keys,a,b){const times=[a,...keys.map(k=>k.t).filter(x=>x>a+1e-8&&x<b-1e-8),b];return times.map((x,i)=>{let k={t:x-a,v:valueAt(keys,x),ease:'linear',u0:0,u1:1};if(i<times.length-1){let j=segmentAt(keys,(x+times[i+1])/2);if(j!==null){let old=keys[j],next=keys[j+1],lo=old.u0??0,hi=old.u1??1;k.ease=old.ease;k.u0=lo+(hi-lo)*(x-old.t)/(next.t-old.t);k.u1=lo+(hi-lo)*(times[i+1]-old.t)/(next.t-old.t);}}return k;});}
function insertKey(c,local){local=clamp(snapFrame(local),0,c.duration);let idx=c.keys.findIndex(k=>Math.abs(k.t-local)<.001);if(idx>=0)return idx;let a=sliceKeys(c.keys,0,local),b=sliceKeys(c.keys,local,c.duration);c.keys=[...a.slice(0,-1),...b.map(k=>({...k,t:k.t+local}))];return c.keys.findIndex(k=>Math.abs(k.t-local)<.001);}
function resizeClip(c,d,mode='trim'){d=Math.max(1/30,snapFrame(d));if(mode==='stretch'){let ratio=d/c.duration;c.keys.forEach(k=>k.t*=ratio);}else c.keys=sliceKeys(c.keys,0,d);c.duration=d;}
function trimClip(c,a,b){const old=c.duration;if(a>=b-1/60)throw Error('O clip precisa ter pelo menos um frame.');c.keys=sliceKeys(c.keys,a,b);c.start+=a;c.offset=(c.offset||0)+a;c.duration=b-a;return old;}
function total(){return Math.max(0,...P.clips.filter(c=>!c.brand).map(c=>c.start+c.duration));}
function current(){return P.clips.find(c=>c.id===selected);}
function fmt(x){x=Math.max(0,x);return `${String(Math.floor(x/60)).padStart(2,'0')}:${(x%60).toFixed(2).padStart(5,'0')}`;}
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),4200);}
function checkpoint(){history.push(clone(P));if(history.length>60)history.shift();future=[];}
function changed(){window.ToucaSoundPresets?.sync();P.name=$('projectName').value||'Sem título';for(const c of P.clips.filter(c=>c.brand)){let d=Math.max(1,total());resizeClip(c,d);}t=clamp(t,0,total());renderUI();autosave();}
function act(fn){if(exporting)return;checkpoint();try{fn();changed();}catch(e){P=history.pop();toast(e.message);renderUI();}}
function undo(redo=false){if(playing)pause();let src=redo?future:history,dst=redo?history:future;if(!src.length)return;dst.push(clone(P));P=src.pop();selected=P.clips.some(c=>c.id===selected)?selected:null;renderUI();autosave();}
function dimensions(){return P.ratio==='16:9'?[1920,1080]:P.ratio==='1:1'?[1080,1080]:[1080,1920];}
function select(id,seek=false){selected=id;keyIndex=0;$('editScope').value='clip';if(seek){const c=current();t=c.start;syncMedia(true);}renderUI();}
function newClip(type,name,asset,track,start,duration){duration=Math.max(1/30,duration);return {id:uid(),type,name,asset,track,start,duration,offset:0,fit:'contain',volume:100,muted:false,keys:[{t:0,v:pose(),ease:'linear'},{t:duration,v:pose(),ease:'linear'}]};}
function addAsset(id,track,at){const a=P.assets.find(a=>a.id===id);if(!a)return;act(()=>{const audioTracks=['voice','music','audio3','audio4','audio5'];track=track||(a.type==='audio'?'voice':'main');if(a.type==='audio'&&!audioTracks.includes(track))track='voice';if(a.type!=='audio'&&audioTracks.includes(track))track='main';let start=at??(audioTracks.includes(track)?t:Math.max(0,...P.clips.filter(c=>c.track===track).map(c=>c.start+c.duration)));let d=a.type==='image'?clamp(Number($('defaultDuration').value)||5,1/30,600):a.duration;if(a.type==='audio'){const overlaps=tr=>P.clips.some(x=>x.type==='audio'&&x.track===tr&&x.start<start+d&&start<x.start+x.duration);track=audioTracks.find(tr=>!overlaps(tr))||track;if(overlaps(track))start=Math.max(0,...P.clips.filter(x=>x.type==='audio'&&x.track===track).map(x=>x.start+x.duration));}const c=newClip(a.type,a.name,id,track,snapFrame(start),snapFrame(d));P.clips.push(c);selected=c.id;t=c.start;});}
async function readData(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(Error('Não foi possível ler o arquivo.'));r.readAsDataURL(file);});}
async function loadAsset(a){if(cache.has(a.id))return;const el=document.createElement(a.type==='image'?'img':a.type==='video'?'video':'audio');if(a.type!=='image'){el.preload=window.ToucaAndroid?'metadata':'auto';el.playsInline=true;}await new Promise((res,rej)=>{el[a.type==='image'?'onload':'onloadedmetadata']=res;el.onerror=()=>rej(Error('Formato não suportado: '+a.name));el.src=a.data;});a.width=el.naturalWidth||el.videoWidth||0;a.height=el.naturalHeight||el.videoHeight||0;a.duration=a.type==='image'?5:el.duration;if(!Number.isFinite(a.duration))throw Error('Duração inválida: '+a.name);cache.set(a.id,{el});if(a.type==='video'){el.addEventListener('seeked',draw);el.addEventListener('loadeddata',draw);}}
async function importFiles(files){if(exporting)return;const list=[...files];if(!list.length)return;checkpoint();let added=0;for(const file of list){if(/\.(srt|vtt)$/i.test(file.name)){await parseSubtitles(await file.text(),false);continue;}if(file.size>350*1024*1024){toast(file.name+': limite local de 350 MB por arquivo.');continue;}let type=file.type.startsWith('image/')?'image':file.type.startsWith('video/')?'video':file.type.startsWith('audio/')?'audio':null;if(!type){toast('Arquivo não suportado: '+file.name);continue;}try{$('statusText').textContent='Importando '+file.name;const a={id:uid(),name:file.name,type,data:await readData(file)};await loadAsset(a);P.assets.push(a);added++;}catch(e){toast(e.message);}}changed();toast(added+' mídia(s) importada(s). Use ＋ para adicionar à timeline.');}
function renderAssets(){const root=$('assetList');root.replaceChildren();$('assetCount').textContent=P.assets.length+' arquivos';if(!P.assets.length){root.innerHTML='<div class="assetsEmpty">As mídias ficam aqui. Use <b>＋</b> ou arraste um arquivo para a timeline.</div>';return;}for(const a of P.assets){const card=document.createElement('div');card.className='asset';card.draggable=true;card.ondragstart=e=>e.dataTransfer.setData('text/touca-asset',a.id);const thumb=document.createElement('div');thumb.className='assetThumb';if(a.type==='image'){const img=document.createElement('img');img.src=a.data;img.alt='';thumb.append(img);}else thumb.textContent=a.type==='video'?'▷':'♫';const name=document.createElement('p');name.textContent=a.name;name.title=a.name;const meta=document.createElement('small');meta.textContent=a.type==='image'?'Imagem':fmt(a.duration);const add=document.createElement('button');add.className='assetAdd';add.textContent='＋';add.title='Adicionar '+a.name;add.onclick=()=>addAsset(a.id);card.ondblclick=()=>addAsset(a.id);card.append(thumb,name,meta,add);root.append(card);}}
function buildTimeline(){const end=Math.max(30,total()+5),width=Math.max($('timelineScroll').clientWidth,end*pps);$('timelineContent').style.width=width+'px';const r=$('ruler');r.replaceChildren();const step=pps<25?5:pps<70?2:1;for(let i=0;i<=width/pps;i+=step){const s=document.createElement('span');s.className='tick';s.style.left=i*pps+'px';s.textContent=fmt(i).slice(0,5);r.append(s);}document.querySelectorAll('.track').forEach(el=>el.replaceChildren());for(const c of P.clips){const el=document.createElement('div');el.className='clip '+(['voice','music'].includes(c.track)?'audio':c.track)+(selected===c.id?' selected':'');el.dataset.id=c.id;el.style.left=c.start*pps+'px';el.style.width=Math.max(6,c.duration*pps)+'px';const label=document.createElement('span');label.className='clipLabel';label.textContent=c.name;el.title=c.name+' · '+c.duration.toFixed(2)+' s';el.append(label);for(const side of ['left','right']){const h=document.createElement('div');h.className='handle '+side;h.dataset.handle=side;el.append(h);}if(c.type!=='audio')for(const k of c.keys){const d=document.createElement('i');d.className='clipKey';d.style.left=clamp(k.t*pps,3,Math.max(3,c.duration*pps-8))+'px';el.append(d);}el.onpointerdown=startClipDrag;el.ondblclick=()=>select(c.id,true);document.querySelector(`.track[data-track="${c.track}"]`).append(el);}drawPlayhead();}
function setInput(id,v){if(document.activeElement!==$(id))$(id).value=v;}
function inspector(){const c=current();$('inspectorEmpty').classList.toggle('hide',!!c);$('inspectorBody').classList.toggle('hide',!c);$('clipType').textContent=c?({image:'Imagem',video:'Vídeo',audio:'Áudio',text:'Texto',subtitle:'Legenda',arrow:'Seta'}[c.type]):'—';if(!c)return;keyIndex=clamp(keyIndex,0,c.keys.length-1);setInput('clipName',c.name);setInput('clipStart',c.start.toFixed(3));setInput('clipDuration',c.duration.toFixed(3));setInput('clipTrack',c.track);$('visualControls').classList.toggle('hide',c.type==='audio');$('keyControls').classList.toggle('hide',c.type==='audio');$('textControls').classList.toggle('hide',!['text','subtitle','arrow'].includes(c.type));$('audioControls').classList.toggle('hide',!['audio','video'].includes(c.type));const local=clamp(t-c.start,0,c.duration),v=$('editScope').value==='key'?c.keys[keyIndex].v:valueAt(c.keys,local);document.querySelectorAll('[data-prop]').forEach(el=>{if(document.activeElement!==el)el.value=Number(v[el.dataset.prop].toFixed(2));});setInput('fitMode',c.fit);setInput('textValue',c.text||'');setInput('fontSize',c.fontSize||110);setInput('textColor',c.color||'#ffffff');setInput('fontFamily',c.font||'Bangers');setInput('strokeWidth',c.stroke??5);setInput('volume',c.volume);$('muteClip').checked=c.muted;setInput('easing',c.keys[keyIndex].ease||'linear');setInput('keyTime',c.keys[keyIndex].t.toFixed(3));$('keyTime').disabled=keyIndex===0||keyIndex===c.keys.length-1;$('deleteKey').disabled=$('keyTime').disabled;const keys=$('keyList');keys.replaceChildren();c.keys.forEach((k,i)=>{const b=document.createElement('button');b.textContent=i===0?'◆ Início':i===c.keys.length-1?'◆ Fim':'◇ '+k.t.toFixed(2);b.className=$('editScope').value==='key'&&keyIndex===i?'active':'';b.onclick=()=>{pause();keyIndex=i;t=c.start+k.t;$('editScope').value='key';syncMedia(true);renderUI(false);};keys.append(b);});}
function captionList(){const root=$('captionList');root.replaceChildren();for(const c of P.clips.filter(c=>c.type==='subtitle').sort((a,b)=>a.start-b.start)){const el=document.createElement('div');el.className='captionItem';el.textContent=fmt(c.start)+' · '+c.text;el.onclick=()=>select(c.id,true);root.append(el);}}
function renderUI(full=true){setInput('projectName',P.name);setInput('ratio',P.ratio);const [w,h]=dimensions();if($('preview').width!==w||$('preview').height!==h){$('preview').width=w;$('preview').height=h;}fitCanvas();if(full){renderAssets();buildTimeline();captionList();}inspector();draw();drawPlayhead();$('timeEnd').textContent=fmt(total());$('emptyStage').classList.toggle('hide',P.clips.some(c=>!['audio'].includes(c.type)));$('undoBtn').disabled=!history.length;$('redoBtn').disabled=!future.length;$('statusText').textContent=P.clips.length+' clips · '+P.clips.filter(c=>c.type!=='audio').reduce((n,c)=>n+c.keys.length,0)+' keyframes · Sem movimento automático';}
function fitCanvas(){const [w,h]=dimensions(),box=$('stageWrap'),maxW=Math.max(50,box.clientWidth-32),maxH=Math.max(50,box.clientHeight-32),s=Math.min(maxW/w,maxH/h);$('canvasBox').style.width=w*s+'px';$('canvasBox').style.height=h*s+'px';$('canvasBox').style.aspectRatio=w+'/'+h;}
function drawPlayhead(){$('playhead').style.left=t*pps+'px';$('timeNow').textContent=fmt(t);}
function drawTo(g,w,h,time){g.clearRect(0,0,w,h);g.fillStyle='#101217';g.fillRect(0,0,w,h);const [pw,ph]=dimensions();g.save();g.scale(w/pw,h/ph);const clips=P.clips.filter(c=>c.type!=='audio'&&time>=c.start&&(time<c.start+c.duration||(c.id===selected&&Math.abs(time-c.start-c.duration)<.0001&&!playing))).sort((a,b)=>tracks.indexOf(a.track)-tracks.indexOf(b.track));for(const c of clips){const v=valueAt(c.keys,clamp(time-c.start,0,c.duration));g.save();g.globalAlpha=clamp(v.opacity/100,0,1);g.translate(pw/2+v.x,ph/2+v.y);g.rotate(v.rotation*Math.PI/180);g.scale(v.scale/100,v.scale/100);if(['image','video'].includes(c.type)){const a=P.assets.find(a=>a.id===c.asset),r=cache.get(c.asset);if(a&&r){const s=(c.fit==='cover'?Math.max:Math.min)(pw/a.width,ph/a.height);try{g.drawImage(r.el,-a.width*s/2,-a.height*s/2,a.width*s,a.height*s);}catch(e){}}}else if(c.type==='arrow'){g.strokeStyle=c.color||'#ffcb45';g.lineWidth=14;g.lineCap='round';g.beginPath();g.moveTo(-180,80);g.lineTo(170,-70);g.lineTo(90,-72);g.moveTo(170,-70);g.lineTo(133,1);g.stroke();}else{g.font=`${c.fontSize||110}px ${c.font||'Bangers'}`;g.textAlign='center';g.textBaseline='middle';g.lineJoin='round';g.lineWidth=(c.stroke??5)*2;g.strokeStyle='#08090b';g.fillStyle=c.color||'#ffffff';const lines=(c.text||'Texto').split('\n');lines.forEach((line,i)=>{const y=(i-(lines.length-1)/2)*(c.fontSize||110)*1.15;if(c.stroke)g.strokeText(line,0,y,pw*.90);g.fillText(line,0,y,pw*.90);});}g.restore();}g.restore();}
function draw(){drawTo(ctx,$('preview').width,$('preview').height,t);}
function seek(time){if(exporting)return;t=clamp(snapFrame(time),0,total());if(playing)clock=performance.now()-t*1000;syncMedia(true);draw();drawPlayhead();inspector();}
async function initAudio(){if(!audioCtx){audioCtx=new AudioContext();mixDest=audioCtx.createMediaStreamDestination();}if(audioCtx.state==='suspended')await audioCtx.resume();for(const a of P.assets.filter(a=>a.type!=='image')){const r=cache.get(a.id);if(!r||r.source)continue;try{r.source=audioCtx.createMediaElementSource(r.el);r.source.connect(audioCtx.destination);r.source.connect(mixDest);}catch(e){toast('Não foi possível conectar o áudio: '+a.name);}}}
function syncMedia(force=false){for(const a of P.assets.filter(a=>a.type!=='image')){const r=cache.get(a.id);if(!r)continue;const c=P.clips.find(c=>c.asset===a.id&&t>=c.start&&t<c.start+c.duration)||(!playing&&!exporting&&$('editScope').value==='key'&&current()?.asset===a.id&&Math.abs(t-current().start-current().duration)<1e-6?current():null);if(c){const desired=(c.offset||0)+(t-c.start);if(force||Math.abs(r.el.currentTime-desired)>.20){try{r.el.currentTime=Math.min(desired,a.duration-.001);}catch(e){}}r.el.volume=c.muted?0:clamp(c.volume/100,0,1);if(playing&&r.el.paused)r.el.play().catch(()=>{});if(!playing&&!r.el.paused)r.el.pause();}else r.el.pause();}}
async function play(){if(!P.clips.length)return toast('Adicione um clip à timeline.');await initAudio();if(t>=total()-.001)t=0;playing=true;clock=performance.now()-t*1000;$('playBtn').textContent='Ⅱ';syncMedia(true);loop();}
function loop(){if(!playing)return;t=Math.min(total(),(performance.now()-clock)/1000);syncMedia();draw();drawPlayhead();if(exporting&&exportFrame)exportFrame();if(t>=total()){pause();if(exporting)finishRecord();return;}raf=requestAnimationFrame(loop);}
function pause(){playing=false;cancelAnimationFrame(raf);$('playBtn').textContent='▶';for(const r of cache.values())if(r.el.pause)r.el.pause();}
function editPose(prop,newValue,record=true){const c=current();if(!c||!Number.isFinite(newValue))return;if(record)checkpoint();let mode=$('editScope').value;if($('autoKey').checked){keyIndex=insertKey(c,t-c.start);mode='key';$('editScope').value='key';}if(mode==='key'){c.keys[keyIndex].v[prop]=newValue;}else{let old=valueAt(c.keys,clamp(t-c.start,0,c.duration))[prop];for(const k of c.keys)k.v[prop]=prop==='scale'?k.v[prop]*newValue/Math.max(.01,old):k.v[prop]+newValue-old;}for(const k of c.keys){k.v.scale=clamp(k.v.scale,1,2000);k.v.opacity=clamp(k.v.opacity,0,100);}draw();inspector();if(record){buildTimeline();autosave();}}
function split(){const c=current();if(!c)return toast('Selecione um clip.');const at=snapFrame(t-c.start);if(at<=.001||at>=c.duration-.001)return toast('Posicione o playhead dentro do clip.');act(()=>{const right=clone(c);right.id=uid();right.keys=sliceKeys(c.keys,at,c.duration);right.start=c.start+at;right.duration=c.duration-at;right.offset=(c.offset||0)+at;c.keys=sliceKeys(c.keys,0,at);c.duration=at;P.clips.push(right);selected=right.id;});}
function deleteSelected(){if(!current())return;act(()=>{P.clips=P.clips.filter(c=>c.id!==selected);selected=null;});}
function adjustDuration(v){const c=current();if(!c)return;act(()=>{const a=P.assets.find(a=>a.id===c.asset);if(a&&a.type!=='image'&&v>(a.duration-(c.offset||0))+.04)throw Error('A duração excede o arquivo original.');resizeClip(c,v,$('resizeMode').value);keyIndex=Math.min(keyIndex,c.keys.length-1);});}
function startClipDrag(e){if(exporting||e.button!==0)return;e.stopPropagation();pause();const id=e.currentTarget.dataset.id,c=P.clips.find(c=>c.id===id),handle=e.target.dataset.handle;selected=id;keyIndex=0;const old=clone(c),startX=e.clientX;let moved=false;inspector();const move=ev=>{let delta=snapFrame((ev.clientX-startX)/pps);if(!moved&&Math.abs(ev.clientX-startX)<3)return;if(!moved){checkpoint();moved=true;}Object.assign(c,clone(old));if(handle==='right'){let d=Math.max(1/30,old.duration+delta);const a=P.assets.find(a=>a.id===c.asset);if(a&&a.type!=='image')d=Math.min(d,a.duration-(c.offset||0));resizeClip(c,d,$('resizeMode').value);}else if(handle==='left'){let a=clamp(delta,-old.start,old.duration-1/30);if(c.type==='video'||c.type==='audio')a=Math.max(-(old.offset||0),a);trimClip(c,a,old.duration);}else{let pos=Math.max(0,old.start+delta);if($('snap').checked){const marks=[t,0,...P.clips.filter(x=>x.id!==id).flatMap(x=>[x.start,x.start+x.duration])];for(const mark of marks){if(Math.abs(pos-mark)*pps<8){pos=mark;break;}if(Math.abs(pos+old.duration-mark)*pps<8){pos=mark-old.duration;break;}}}c.start=Math.max(0,snapFrame(pos));}buildTimeline();draw();inspector();};const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);if(moved)changed();else{renderUI(false);buildTimeline();}};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});}
$('preview').onpointerdown=e=>{const c=current();if(!c||c.type==='audio'||exporting)return;pause();const rect=$('preview').getBoundingClientRect(),v=valueAt(c.keys,clamp(t-c.start,0,c.duration)),x=e.clientX,y=e.clientY;checkpoint();const move=ev=>{editPose('x',v.x+(ev.clientX-x)*dimensions()[0]/rect.width,false);editPose('y',v.y+(ev.clientY-y)*dimensions()[1]/rect.height,false);};const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);changed();};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});};
function addText(type='text',brand=false){act(()=>{const [w,h]=dimensions();const c=newClip(type,brand?'@TOUCABR':type==='arrow'?'Seta':'Novo texto',null,'overlay',brand?0:t,brand?Math.max(1,total()):5);Object.assign(c,{text:brand?'':'SEU TEXTO',font:'Arial',fontSize:brand?72:96,color:type==='arrow'?'#ffce45':'#ffffff',stroke:0,strokeColor:'#000000',fontWeight:700,italic:false,align:'center',textBg:'transparent',shadowColor:'transparent',shadowBlur:0,brand});if(brand)c.keys.forEach(k=>{k.v.y=h*.20;k.v.opacity=50;});P.clips.push(c);selected=c.id;});}
function popPreset(c){const d=c.duration,base=clone(c.keys[0].v),peak=clone(base);base.scale=86;peak.scale=106;const rest={...base,scale:100};c.keys=[{t:0,v:base,ease:'out'},{t:Math.min(.10,d*.3),v:peak,ease:'out'},{t:Math.min(.17,d*.5),v:rest,ease:'linear'},{t:d,v:clone(rest),ease:'linear'}];c.font='Arial';c.fontSize=96;c.color='#ffffff';c.stroke=0;c.strokeColor='#000000';c.fontWeight=700;c.italic=false;c.align='center';c.textBg='transparent';c.shadowColor='transparent';c.shadowBlur=0;}
function makeCaption(text,start,end,pop=false){const c=newClip('subtitle',text.slice(0,40),null,'subtitle',Math.max(0,start),Math.max(1/30,end-start));c.text=text;c.font='Arial';c.fontSize=96;c.color='#ffffff';c.stroke=0;c.strokeColor='#000000';c.fontWeight=700;c.italic=false;c.align='center';c.textBg='transparent';c.shadowColor='transparent';c.shadowBlur=0;c.keys.forEach(k=>k.v.y=dimensions()[1]*.14);if(pop)popPreset(c);return c;}
function parseTime(s){const p=s.replace(',','.').split(':').map(Number);return p.length===3?p[0]*3600+p[1]*60+p[2]:p[0]*60+p[1];}
async function parseSubtitles(text,record=true){const lines=text.replace(/\r/g,'').split('\n');const found=[];for(let i=0;i<lines.length;i++){const m=lines[i].match(/(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{2,3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{2,3})/);if(!m)continue;let words=[];i++;while(i<lines.length&&lines[i].trim())words.push(lines[i++].replace(/<[^>]*>/g,''));let a=parseTime(m[1]),b=parseTime(m[2]);if(Number.isFinite(a)&&b>a)found.push(makeCaption(words.join('\n'),a,b));}if(!found.length)return toast('Nenhuma legenda válida encontrada.');if(record)checkpoint();P.clips.push(...found);changed();toast(found.length+' legendas importadas.');}
function srtTime(t){let ms=Math.round(t*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function saveProject(){P.name=$('projectName').value||'Projeto';download(new Blob([JSON.stringify(P)],{type:'application/json'}),(P.name.replace(/[^\p{L}\p{N}_-]/gu,'_')||'projeto')+'.touca');toast('Projeto baixado com as mídias incluídas.');}
async function restoreProject(obj){if(!obj||obj.version!==1||!Array.isArray(obj.assets)||!Array.isArray(obj.clips))throw Error('Projeto Touca inválido.');if(!['9:16','16:9','1:1'].includes(obj.ratio))throw Error('Formato de projeto inválido.');const ids=new Set();for(const a of obj.assets){if(!['image','video','audio'].includes(a.type)||typeof a.data!=='string'||!/^data:(image|audio|video)\//.test(a.data))throw Error('Mídia inválida.');ids.add(a.id);}for(const c of obj.clips){if(!tracks.includes(c.track)||!Number.isFinite(c.duration)||c.duration<(c.type==='subtitle'?.001:1/30-.001)||!Number.isFinite(c.start)||c.start<0||!Array.isArray(c.keys)||c.keys.length<2)throw Error('Clip inválido.');if(c.asset&&!ids.has(c.asset))throw Error('Mídia ausente.');for(const k of c.keys)if(!Number.isFinite(k.t)||!Object.values(k.v).every(Number.isFinite))throw Error('Keyframe inválido.');c.keys.sort((a,b)=>a.t-b.t);c.keys=sliceKeys(c.keys,0,c.duration);}pause();for(const a of obj.assets)await loadAsset(a);P=obj;selected=null;t=0;history=[];future=[];renderUI();autosave();}
function autosave(){clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{if(!db)return;try{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(clone(P),'last');tx.oncomplete=()=>{$('saveState').textContent='Salvo neste navegador';};tx.onerror=()=>{$('saveState').textContent='Salve uma cópia';toast('Autosave sem espaço. Baixe o projeto para não perder alterações.');};}catch(e){$('saveState').textContent='Salve uma cópia';}},900);}
async function initDB(){try{db=await new Promise((res,rej)=>{const req=indexedDB.open('touca-editor-local-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('projects');req.onsuccess=()=>res(req.result);req.onerror=rej;});const req=db.transaction('projects').objectStore('projects').get('last');req.onsuccess=async()=>{if(req.result&&req.result.clips.length){if(confirm('Restaurar o último projeto salvo neste navegador?'))try{await restoreProject(req.result);toast('Projeto restaurado.');}catch(e){toast('Falha ao restaurar: '+e.message);}}};}catch(e){$('storageNote').textContent='Autosave indisponível. Use Salvar projeto.';}}
function showASR(){const media=P.clips.filter(c=>['audio','video'].includes(c.type));$('asrSource').replaceChildren(...media.map(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.name;return o;}));if(!media.length)return toast('Adicione a narração à timeline primeiro.');$('asrDialog').showModal();}
async function transcribe(){}
let exportFrame=null,exportChunks=[],exportMime='',recordStream=null;
function supportedMime(){if(!window.MediaRecorder)return '';return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(m=>MediaRecorder.isTypeSupported(m))||'';}
function showExport(){if(!P.clips.length||!total())return toast('Sua timeline está vazia.');exportMime=supportedMime();$('exportInfo').textContent=exportMime?`${fmt(total())} · 30 fps · ${exportMime.includes('mp4')?'MP4 disponível neste navegador':'Este navegador exportará WebM (não MP4)'}.`:'Este navegador não oferece gravação compatível.';$('startExport').disabled=!exportMime;$('exportDialog').showModal();}
async function startRecord(){if(exporting)return;pause();try{const duplicates=P.clips.filter(c=>['video','audio'].includes(c.type));for(let i=0;i<duplicates.length;i++)for(let j=i+1;j<duplicates.length;j++){const a=duplicates[i],b=duplicates[j];if(a.asset===b.asset&&a.start<b.start+b.duration&&b.start<a.start+a.duration)throw Error('A mesma mídia audiovisual aparece sobreposta. Importe uma segunda cópia para reproduções simultâneas.');}await initAudio();await document.fonts.ready;const scale=Number($('exportQuality').value)/1080,[pw,ph]=dimensions(),canvas=document.createElement('canvas');canvas.width=Math.round(pw*scale/2)*2;canvas.height=Math.round(ph*scale/2)*2;const g=canvas.getContext('2d');t=0;syncMedia(true);await Promise.all([...cache.values()].filter(r=>r.el.tagName==='VIDEO').map(r=>new Promise(res=>{if(!r.el.seeking)return res();r.el.addEventListener('seeked',res,{once:true});setTimeout(res,1200);})));drawTo(g,canvas.width,canvas.height,0);recordStream=canvas.captureStream(30);if(P.clips.some(c=>(['video','audio'].includes(c.type)&&!c.muted)||(c.transition?.type!=='none'&&c.transition?.sound&&c.transition.sound!=='none')))mixDest.stream.getAudioTracks().forEach(tr=>recordStream.addTrack(tr));recorder=new MediaRecorder(recordStream,{mimeType:exportMime,videoBitsPerSecond:scale<1?4000000:8000000,audioBitsPerSecond:192000});exportChunks=[];recorder.ondataavailable=e=>{if(e.data.size)exportChunks.push(e.data);};recorder.onerror=e=>{toast('Falha ao gravar: '+(e.error?.message||'erro do navegador'));finishRecord(true);};recorder.onstop=()=>{if(!recorder.cancelled){download(new Blob(exportChunks,{type:recorder.mimeType}),P.name.replace(/[^\p{L}\p{N}_-]/gu,'_')+(recorder.mimeType.includes('mp4')?'.mp4':'.webm'));$('exportStatus').textContent='Exportação concluída. Arquivo baixado.';}recordStream.getVideoTracks().forEach(tr=>tr.stop());exportFrame=null;exporting=false;$('app').classList.remove('busy');$('startExport').disabled=false;$('cancelExport').textContent='Fechar';renderUI();};exporting=true;$('app').classList.add('busy');$('startExport').disabled=true;$('cancelExport').textContent='Cancelar exportação';exportFrame=()=>{drawTo(g,canvas.width,canvas.height,t);$('exportProgress').value=t/total()*100;$('exportStatus').textContent='Exportando '+fmt(t)+' / '+fmt(total());};recorder.start(1000);await play();}catch(e){exporting=false;$('app').classList.remove('busy');toast(e.message);$('exportStatus').textContent=e.message;}}
function finishRecord(cancel=false){if(!recorder||recorder.state==='inactive')return;recorder.cancelled=cancel;pause();recorder.stop();if(cancel)$('exportStatus').textContent='Exportação cancelada; nenhum arquivo incompleto será entregue.';}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&exporting){finishRecord(true);toast('Exportação cancelada porque a aba ficou oculta. Mantenha-a visível.');}});
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));for(const id of ['media','text','captions'])$(id+'Panel').classList.toggle('hide',id!==b.dataset.tab);});
$('dropZone').onclick=()=>$('fileInput').click();$('dropZone').onkeydown=e=>{if(e.key==='Enter')$('fileInput').click();};$('fileInput').onchange=e=>{importFiles(e.target.files);e.target.value='';};for(const type of ['dragenter','dragover'])$('dropZone').addEventListener(type,e=>{e.preventDefault();$('dropZone').classList.add('dragover');});$('dropZone').ondragleave=()=>$('dropZone').classList.remove('dragover');$('dropZone').ondrop=e=>{e.preventDefault();$('dropZone').classList.remove('dragover');importFiles(e.dataTransfer.files);};
document.querySelectorAll('.track').forEach(el=>{el.ondragover=e=>e.preventDefault();el.ondrop=e=>{e.preventDefault();const id=e.dataTransfer.getData('text/touca-asset');if(id)addAsset(id,el.dataset.track,Math.max(0,(e.clientX-el.getBoundingClientRect().left)/pps));else importFiles(e.dataTransfer.files);};el.onpointerdown=e=>{if(e.target!==el)return;pause();seek((e.clientX-el.getBoundingClientRect().left)/pps);};});$('ruler').onpointerdown=e=>{pause();const rect=$('ruler').getBoundingClientRect();seek((e.clientX-rect.left)/pps);const move=ev=>seek((ev.clientX-rect.left)/pps);window.addEventListener('pointermove',move);window.addEventListener('pointerup',()=>window.removeEventListener('pointermove',move),{once:true});};
$('timelineZoom').oninput=e=>{pps=Number(e.target.value);buildTimeline();};$('fitTimeline').onclick=()=>{pps=clamp(($('timelineScroll').clientWidth-30)/Math.max(10,total()),10,180);$('timelineZoom').value=pps;buildTimeline();};$('playBtn').onclick=()=>{if(exporting)return;playing?pause():play();};$('prevFrame').onclick=()=>seek(t-1/30);$('nextFrame').onclick=()=>seek(t+1/30);$('ratio').onchange=e=>act(()=>P.ratio=e.target.value);$('safeGuides').onchange=e=>$('guides').classList.toggle('hide',!e.target.checked);$('undoBtn').onclick=()=>undo();$('redoBtn').onclick=()=>undo(true);$('splitBtn').onclick=split;$('deleteClip').onclick=deleteSelected;$('trimLeft').onclick=()=>{const c=current();if(c&&t>c.start&&t<c.start+c.duration)act(()=>trimClip(c,t-c.start,c.duration));};$('trimRight').onclick=()=>{const c=current();if(c&&t>c.start&&t<c.start+c.duration)act(()=>trimClip(c,0,t-c.start));};
$('duplicate').onclick=()=>{const c=current();if(c)act(()=>{const n=clone(c);n.id=uid();n.start+=n.duration;P.clips.push(n);selected=n.id;});};$('clipName').onchange=e=>act(()=>current().name=e.target.value);$('clipStart').onchange=e=>{const v=Number(e.target.value);if(Number.isFinite(v))act(()=>current().start=Math.max(0,snapFrame(v)));};$('clipDuration').onchange=e=>{const v=Number(e.target.value);if(Number.isFinite(v))adjustDuration(v);};$('clipTrack').onchange=e=>act(()=>{const c=current();if(!window.ToucaTimeline.accepts(c,e.target.value))throw Error('Escolha uma faixa compatível com este clip.');c.track=e.target.value;});document.querySelectorAll('[data-prop]').forEach(el=>el.onchange=()=>editPose(el.dataset.prop,Number(el.value)));$('fitMode').onchange=e=>act(()=>current().fit=e.target.value);$('resetPose').onclick=()=>act(()=>{const c=current();if($('editScope').value==='key')c.keys[keyIndex].v=pose();else c.keys.forEach(k=>k.v=pose());});
for(const [id,prop] of [['textValue','text'],['fontSize','fontSize'],['textColor','color'],['fontFamily','font'],['strokeWidth','stroke'],['volume','volume']])$(id).onchange=e=>act(()=>{const c=current();c[prop]=['fontSize','stroke','volume'].includes(prop)?clamp(Number(e.target.value)||0,0,prop==='fontSize'?500:prop==='volume'?100:30):e.target.value;if(prop==='text'&&c.type==='subtitle')c.name=c.text.slice(0,40);});$('muteClip').onchange=e=>act(()=>current().muted=e.target.checked);$('editScope').onchange=()=>inspector();$('addKey').onclick=()=>{const c=current();if(c)act(()=>{keyIndex=insertKey(c,t-c.start);$('editScope').value='key';});};$('deleteKey').onclick=()=>{const c=current();if(c&&keyIndex>0&&keyIndex<c.keys.length-1)act(()=>{c.keys.splice(keyIndex,1);keyIndex--;});};$('easing').onchange=e=>act(()=>{const k=current().keys[keyIndex];k.ease=e.target.value;k.u0=0;k.u1=1;});$('keyTime').onchange=e=>{const c=current();if(c&&keyIndex>0&&keyIndex<c.keys.length-1)act(()=>c.keys[keyIndex].t=clamp(snapFrame(Number(e.target.value)),c.keys[keyIndex-1].t+1/30,c.keys[keyIndex+1].t-1/30));};
$('addText').onclick=()=>addText();$('addArrow').onclick=()=>addText('arrow');$('addBrand').onclick=()=>addText('text',true);$('asrBtn').onclick=showASR;$('startAsr').onclick=transcribe;$('cancelAsr').onclick=()=>{if(asrBusy){asrToken++;asrWorker?.terminate();asrWorker=null;asrBusy=false;$('startAsr').disabled=false;$('cancelAsr').textContent='Fechar';$('asrStatus').textContent='Transcrição cancelada.';}else $('asrDialog').close();};$('asrDialog').oncancel=e=>{if(asrBusy){e.preventDefault();$('cancelAsr').click();}};$('importSrt').onclick=()=>$('srtInput').click();$('srtInput').onchange=async e=>{if(e.target.files[0])parseSubtitles(await e.target.files[0].text());e.target.value='';};$('exportSrt').onclick=()=>{const c=P.clips.filter(c=>c.type==='subtitle').sort((a,b)=>a.start-b.start);if(!c.length)return toast('Nenhuma legenda na timeline.');download(new Blob([c.map((c,i)=>`${i+1}\n${srtTime(c.start)} --> ${srtTime(c.start+c.duration)}\n${c.text}`).join('\n\n')],{type:'text/plain;charset=utf-8'}),'legendas.srt');};$('styleCaps').onclick=()=>act(()=>P.clips.filter(c=>c.type==='subtitle').forEach(popPreset));$('exportBtn').onclick=showExport;$('startExport').onclick=startRecord;$('cancelExport').onclick=()=>exporting?finishRecord(true):$('exportDialog').close();$('exportDialog').oncancel=e=>{if(exporting){e.preventDefault();finishRecord(true);}};$('helpBtn').onclick=()=>$('helpDialog').showModal();$('saveBtn').onclick=saveProject;$('openBtn').onclick=()=>$('projectInput').click();$('projectInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(P.clips.length&&!confirm('Substituir o projeto aberto? Salve uma cópia se necessário.'))return;await restoreProject(JSON.parse(await f.text()));toast('Projeto aberto.');}catch(err){toast(err.message);}e.target.value='';};$('projectName').onchange=()=>{P.name=$('projectName').value;autosave();};$('mediaToggle').onclick=()=>$('workspace').classList.toggle('showMedia');$('inspectorToggle').onclick=()=>$('workspace').classList.toggle('showInspector');
window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)||document.querySelector('dialog[open]')||exporting)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);}else if(e.code==='Space'){e.preventDefault();playing?pause():play();}else if(e.key.toLowerCase()==='s')split();else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteSelected();}else if(e.key==='ArrowRight'){e.preventDefault();seek(t+(e.shiftKey?1:1/30));}else if(e.key==='ArrowLeft'){e.preventDefault();seek(t-(e.shiftKey?1:1/30));}});
new ResizeObserver(fitCanvas).observe($('stageWrap'));window.addEventListener('beforeunload',e=>{if(exporting){e.preventDefault();e.returnValue='';}});document.fonts.ready.then(draw);
if(document.modelContext?.registerTool){const lifecycle=new AbortController();try{Promise.resolve(document.modelContext.registerTool({name:'read_touca_timeline',title:'Ler timeline Touca',description:'Retorna somente os clips e keyframes do projeto aberto. Não altera o vídeo.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({name:P.name,duration:total(),clips:P.clips.map(c=>({name:c.name,start:c.start,duration:c.duration,keyframes:c.keys.length}))})},{signal:lifecycle.signal})).catch(()=>{});}catch(e){}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}
// Mobile editing layer. Media intervals are half-open; captions retain audio timing.
const v2 = {baseRender:renderUI,baseInspector:inspector,baseBuild:buildTimeline,baseChanged:changed,baseDraw:draw,basePause:pause,basePlay:play,baseRestore:restoreProject};
const mainClips=()=>P.clips.filter(c=>c.track==='main').sort((a,b)=>a.start-b.start);
function compactMain(order=mainClips()){let cursor=0;for(const c of order){c.start=cursor;cursor+=c.duration;}}
function placeMain(c,position){const order=mainClips().filter(x=>x.id!==c.id);let i=order.findIndex(x=>position<x.start+x.duration/2);if(i<0)i=order.length;order.splice(i,0,c);compactMain(order);}
function activeClip(c,time){return time>=c.start&&time<c.start+c.duration;}
function hasMagnet(){return P.magnetic!==false;}
changed=function(){if(hasMagnet())compactMain();v2.baseChanged();};
function closeSheets(){ $('workspace').classList.remove('showMedia','showInspector');$('effectsPanel').classList.remove('open');$('drawerMask').classList.remove('open');document.querySelectorAll('.dock button').forEach(b=>b.classList.remove('active'));}
function openSheet(kind,tab){closeSheets();if(kind==='effects')$('effectsPanel').classList.add('open');else $('workspace').classList.add(kind==='media'?'showMedia':'showInspector');$('drawerMask').classList.add('open');if(tab)document.querySelector(`[data-tab="${tab}"]`).click();const b=$('dock'+(tab==='captions'?'Captions':tab==='text'?'Text':kind==='effects'?'Effects':kind==='media'?'Media':'Edit'));b?.classList.add('active');inspector();}
$('drawerMask').onclick=closeSheets;document.querySelectorAll('[data-close-sheet]').forEach(b=>b.onclick=closeSheets);
$('dockMedia').onclick=()=>openSheet('media','media');$('dockText').onclick=()=>openSheet('media','text');$('dockCaptions').onclick=()=>openSheet('media','captions');$('dockEdit').onclick=()=>openSheet('edit');$('dockEffects').onclick=()=>openSheet('effects');
$('magnetic').onchange=e=>act(()=>{P.magnetic=e.target.checked;if(P.magnetic)compactMain();});
$('allTracks').onchange=()=>buildTimeline();
const oldAddAsset=addAsset;
addAsset=function(id,track,at){const a=P.assets.find(x=>x.id===id);if(!a)return;act(()=>{let target=track||(a.type==='audio'?'voice':'main');if(a.type==='audio'&&!['voice','music'].includes(target))target='voice';if(a.type!=='audio'&&['voice','music'].includes(target))target='main';const duration=a.type==='image'?clamp(Number($('defaultDuration').value)||5,1/30,600):Math.max(1/30,Math.floor(a.duration*30)/30);const end=Math.max(0,...P.clips.filter(c=>c.track===target).map(c=>c.start+c.duration));const pos=at??(target==='main'?end:t);const c=newClip(a.type,a.name,id,target,snapFrame(pos),duration);P.clips.push(c);if(target==='main'&&hasMagnet())placeMain(c,pos);selected=c.id;t=c.start;$('editScope').value='clip';});};
$('duplicate').onclick=()=>{const c=current();if(c)act(()=>{const n=clone(c);n.id=uid();n.start=c.start+c.duration;delete n.transition;P.clips.push(n);if(n.track==='main'&&hasMagnet()){const order=mainClips().filter(x=>x.id!==n.id);order.splice(order.indexOf(c)+1,0,n);compactMain(order);}selected=n.id;});};
$('clipStart').onchange=e=>{const pos=Math.max(0,snapFrame(Number(e.target.value)));if(Number.isFinite(pos))act(()=>{const c=current();if(c.track==='main'&&hasMagnet())placeMain(c,pos);else c.start=pos;});};
const oldSplit=split;
split=function(){const c=current(),before=c?.id;oldSplit();if(c&&selected!==before){const right=current();if(right){delete right.transition;buildTimeline();autosave();}}};$('splitBtn').onclick=split;
startClipDrag=function(e){if(exporting||e.button!==0)return;e.stopPropagation();pause();const c=P.clips.find(x=>x.id===e.currentTarget.dataset.id);if(!c)return;selected=c.id;keyIndex=0;$('editScope').value='clip';const original=clone(c),startX=e.clientX,handle=e.target.dataset.handle,positions=P.clips.map(x=>[x.id,x.start]),order=mainClips().map(x=>x.id);let moved=false;inspector();
 const move=ev=>{const dx=ev.clientX-startX;if(!moved&&Math.abs(dx)<4)return;if(!moved){checkpoint();moved=true;}Object.assign(c,clone(original));for(const [id,pos]of positions){const x=P.clips.find(x=>x.id===id);if(x)x.start=pos;}const delta=snapFrame(dx/pps),a=P.assets.find(x=>x.id===c.asset);
 if(handle==='right'){let d=Math.max(1/30,original.duration+delta);if(a&&a.type!=='image')d=Math.min(d,Math.floor((a.duration-(c.offset||0))*30)/30);resizeClip(c,d,$('resizeMode').value);}
 else if(handle==='left'){let cut=clamp(delta,-original.start,original.duration-1/30);if(a&&a.type!=='image')cut=Math.max(-(original.offset||0),cut);trimClip(c,cut,original.duration);}
 else c.start=Math.max(0,snapFrame(original.start+delta));
 if(c.track==='main'&&hasMagnet()){if(handle)compactMain(order.map(id=>P.clips.find(x=>x.id===id)));else placeMain(c,c.start);}
 else if(!handle&&$('snap').checked){for(const mark of [t,0,...P.clips.filter(x=>x.id!==c.id&&x.track===c.track).flatMap(x=>[x.start,x.start+x.duration])])if(Math.abs(c.start-mark)*pps<7){c.start=mark;break;}}
 buildTimeline();draw();inspector();};
 const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);if(moved)changed();else{t=clamp(t,c.start,Math.max(c.start,c.start+c.duration-1/30));syncMedia(true);renderUI();}};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});window.addEventListener('pointercancel',up,{once:true});};
buildTimeline=function(){v2.baseBuild();let shown=0;document.querySelectorAll('.track').forEach((el,i)=>{const hidden=!$('allTracks').checked&&el.dataset.track!=='main'&&!P.clips.some(c=>c.track===el.dataset.track);el.classList.toggle('hiddenTrack',hidden);if(!hidden)shown++;(document.querySelector(`.trackHead[data-track-head="${el.dataset.track}"]`)||document.querySelectorAll('.trackHead:not(.rulerHead)')[i])?.classList.toggle('hiddenTrack',hidden);});$('app').style.setProperty('--timeline-height',Math.max(135,Math.min(250,88+shown*38))+'px');for(const c of P.clips.filter(c=>c.transition?.type&&c.transition.type!=='none')){const el=document.querySelector(`.clip[data-id="${c.id}"]`);if(el){const badge=document.createElement('span');badge.className='transBadge';badge.textContent='⋈';el.append(badge);}}};
$('timelineScroll').addEventListener('scroll',()=>{document.querySelector('.trackHeads').scrollTop=$('timelineScroll').scrollTop;},{passive:true});
inspector=function(){v2.baseInspector();const c=current();$('magnetic').checked=hasMagnet();$('lensEnabled').checked=!!P.lens?.enabled;$('lensPower').value=P.lens?.power??25;$('lensLabel').textContent=($('lensPower').value)+'%';const tr=c?.transition||{};$('transitionType').value=tr.type||'none';$('transitionDuration').value=tr.duration||.24;$('transitionSound').value=tr.sound||'none';$('transitionVolume').value=tr.volume??14;$('transitionClip').textContent=c?.track==='main'?'Entrada de: '+c.name:'Selecione uma imagem ou vídeo na faixa principal.';for(const id of ['transitionType','transitionDuration','transitionSound','transitionVolume','applyTransition'])$(id).disabled=!c||c.track!=='main';drawSelection();};
renderUI=function(full=true){v2.baseRender(full);$('statusText').textContent=hasMagnet()?'Faixa principal magnética · áudio e legendas sincronizados':'Posição livre · ímã de aproximação disponível';};
$('lensEnabled').onchange=e=>act(()=>P.lens={enabled:e.target.checked,power:Number($('lensPower').value)});
let lensCheckpoint=false;$('lensPower').oninput=e=>{if(exporting)return;if(!lensCheckpoint){checkpoint();lensCheckpoint=true;}P.lens={enabled:$('lensEnabled').checked,power:Number(e.target.value)};$('lensLabel').textContent=e.target.value+'%';draw();};$('lensPower').onchange=()=>{lensCheckpoint=false;autosave();};
$('applyTransition').onclick=()=>act(()=>{const c=current();if(!c||c.track!=='main')return;c.transition={type:$('transitionType').value,duration:clamp(Number($('transitionDuration').value)||.24,.08,.6),sound:$('transitionSound').value,volume:clamp(Number($('transitionVolume').value)||0,0,50)};toast('Transição aplicada na entrada deste clip.');});
function transitionAt(time){const list=mainClips();for(let i=1;i<list.length;i++){const c=list[i],prev=list[i-1],tr=c.transition;if(!tr||tr.type==='none'||Math.abs(prev.start+prev.duration-c.start)>1e-5)continue;const d=Math.min(tr.duration||.24,prev.duration,c.duration),distance=Math.abs(time-c.start);if(distance<d/2)return {clip:c,prev,type:tr.type,amount:1-distance/(d/2),duration:d};}return null;}
// Compositor: artwork → transitions → lens → text/captions. No accidental double frames.
const sceneCanvas=document.createElement('canvas'),sceneCtx=sceneCanvas.getContext('2d');let lensRenderer=null,lensFailed=false;
function createLens(){const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true});if(!gl)return null;
 const compile=(type,src)=>{const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error('Shader indisponível');return sh;};
 const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,'attribute vec2 p;varying vec2 uv;void main(){uv=(p+1.)*.5;gl_Position=vec4(p,0.,1.);}'));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,'precision mediump float;varying vec2 uv;uniform sampler2D img;uniform float power;void main(){vec2 p=uv*2.-1.;vec2 q=p/(1.+power*dot(p,p));gl_FragColor=texture2D(img,vec2((q.x+1.)*.5,1.-(q.y+1.)*.5));}'));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))return null;gl.useProgram(program);const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);const power=gl.getUniformLocation(program,'power');canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lensFailed=true;toast('A GPU foi interrompida. Reabra o editor para usar o ângulo amplo.');});return {canvas,gl,render(source,k){if(canvas.width!==source.width||canvas.height!==source.height){canvas.width=source.width;canvas.height=source.height;}gl.viewport(0,0,canvas.width,canvas.height);gl.uniform1f(power,k);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return canvas;}};}
function paintClip(g,c,time,pw,ph){const v=valueAt(c.keys,clamp(time-c.start,0,c.duration));g.save();g.globalAlpha=clamp(v.opacity/100,0,1);g.translate(pw/2+v.x,ph/2+v.y);g.rotate(v.rotation*Math.PI/180);g.scale(v.scale/100,v.scale/100);if(['image','video'].includes(c.type)){const a=P.assets.find(x=>x.id===c.asset),r=cache.get(c.asset);if(a&&r&&a.width&&a.height){const s=(c.fit==='cover'?Math.max:Math.min)(pw/a.width,ph/a.height);try{g.drawImage(r.el,-a.width*s/2,-a.height*s/2,a.width*s,a.height*s);}catch{}}}else if(c.type==='arrow'){g.strokeStyle=c.color||'#ffcb45';g.lineWidth=14;g.lineCap='round';g.beginPath();g.moveTo(-180,80);g.lineTo(170,-70);g.lineTo(90,-72);g.moveTo(170,-70);g.lineTo(133,1);g.stroke();}else{const fs=c.fontSize||110,fw=c.fontWeight||700,style=c.italic?'italic ':'';g.font=`${style}${fw} ${fs}px ${c.font||'Arial'}`;g.textAlign=c.align||'center';g.textBaseline='middle';g.lineJoin='round';g.lineWidth=(c.stroke??0)*2;g.strokeStyle=c.strokeColor||'#000000';g.fillStyle=c.color||'#ffffff';g.shadowColor=c.shadowColor||'transparent';g.shadowBlur=Number(c.shadowBlur)||0;g.shadowOffsetX=Number(c.shadowX)||0;g.shadowOffsetY=Number(c.shadowY)||0;const lines=(c.text||'').split('\n'),lh=fs*(c.lineHeight||1.1),anchor=g.textAlign==='left'?-pw*.42:g.textAlign==='right'?pw*.42:0;let maxWidth=0;for(const line of lines)maxWidth=Math.max(maxWidth,g.measureText(line||' ').width);if(c.textBg&&c.textBg!=='transparent'){const pad=Number(c.textBgPad)||22,boxW=Math.min(pw*.92,maxWidth+pad*2),boxH=lines.length*lh+pad*1.25,boxX=g.textAlign==='left'?anchor-pad:g.textAlign==='right'?anchor-boxW+pad:-boxW/2,boxY=-boxH/2;g.save();g.shadowColor='transparent';g.fillStyle=c.textBg;g.globalAlpha*=clamp(c.textBgOpacity??.78,0,1);g.beginPath();if(g.roundRect)g.roundRect(boxX,boxY,boxW,boxH,Math.min(28,boxH*.28));else g.rect(boxX,boxY,boxW,boxH);g.fill();g.restore();g.fillStyle=c.color||'#ffffff';}lines.forEach((line,i)=>{const y=(i-(lines.length-1)/2)*lh;if(c.stroke)g.strokeText(line,anchor,y,pw*.9);g.fillText(line,anchor,y,pw*.9);});}g.restore();}
function visibleClips(time,editor=false){let list=P.clips.filter(c=>c.type!=='audio'&&activeClip(c,time));const main=list.filter(c=>c.track==='main').sort((a,b)=>b.start-a.start)[0];list=list.filter(c=>c.track!=='main'||c===main);const c=current();if(editor&&!playing&&$('editScope').value==='key'&&c&&c.type!=='audio'&&Math.abs(time-c.start-c.duration)<1e-6){list=list.filter(x=>x.track!==c.track);list.push(c);}return list.sort((a,b)=>tracks.indexOf(a.track)-tracks.indexOf(b.track));}
drawTo=function(g,w,h,time){if(total()>0&&time>=total())time=Math.max(0,total()-.00001);if(sceneCanvas.width!==w||sceneCanvas.height!==h){sceneCanvas.width=w;sceneCanvas.height=h;}const [pw,ph]=dimensions(),editor=g===ctx,list=visibleClips(time,editor),tr=transitionAt(time);sceneCtx.setTransform(1,0,0,1,0,0);sceneCtx.fillStyle='#101217';sceneCtx.fillRect(0,0,w,h);sceneCtx.save();sceneCtx.scale(w/pw,h/ph);if(tr?.type==='zoom'){sceneCtx.translate(pw/2,ph/2);sceneCtx.scale(1+tr.amount*.12,1+tr.amount*.12);sceneCtx.translate(-pw/2,-ph/2);sceneCtx.filter=`blur(${tr.amount*5}px)`;}for(const c of list.filter(c=>!['text','subtitle'].includes(c.type)))paintClip(sceneCtx,c,time,pw,ph);sceneCtx.restore();if(tr&&['dip','flash'].includes(tr.type)){sceneCtx.globalAlpha=tr.amount;sceneCtx.fillStyle=tr.type==='dip'?'#000':'#fff';sceneCtx.fillRect(0,0,w,h);sceneCtx.globalAlpha=1;}
 g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,w,h);let layer=sceneCanvas;if(P.lens?.enabled&&P.lens.power>0&&!lensFailed){try{lensRenderer??=createLens();if(lensRenderer)layer=lensRenderer.render(sceneCanvas,P.lens.power/100*.32);else{lensFailed=true;toast('Ângulo amplo indisponível: este navegador não oferece WebGL.');}}catch{lensFailed=true;toast('Não foi possível ativar o ângulo amplo neste dispositivo.');}}g.drawImage(layer,0,0);g.save();g.scale(w/pw,h/ph);for(const c of list.filter(c=>['text','subtitle'].includes(c.type)))paintClip(g,c,time,pw,ph);g.restore();};
draw=function(){v2.baseDraw();drawSelection();};
// Outline handles are editor-only. They never enter the recording canvas.
const SVG_NS='http://www.w3.org/2000/svg';
function poseForEdit(c){return clone($('editScope').value==='key'?c.keys[keyIndex].v:valueAt(c.keys,clamp(t-c.start,0,c.duration)));}
function rectForClip(c){const [w,h]=dimensions(),a=P.assets.find(x=>x.id===c.asset);if(a?.width){const s=(c.fit==='cover'?Math.max:Math.min)(w/a.width,h/a.height);return [a.width*s,a.height*s];}if(c.type==='arrow')return [390,220];return [Math.min(w*.9,Math.max(180,(c.text||'').length*(c.fontSize||110)*.5)),(c.fontSize||110)*1.3*(c.text||'').split('\n').length];}
function drawSelection(){const root=$('selectionOverlay');if(!root)return;root.replaceChildren();const c=current();if(!c||c.type==='audio'||playing||exporting||!visibleClips(t,true).some(x=>x.id===c.id))return;const [pw,ph]=dimensions(),[w,h]=rectForClip(c),v=poseForEdit(c),rect=$('preview').getBoundingClientRect();root.setAttribute('viewBox',`0 0 ${pw} ${ph}`);const cs=Math.cos(v.rotation*Math.PI/180),sn=Math.sin(v.rotation*Math.PI/180),r=8*pw/Math.max(1,rect.width),points=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([x,y])=>({x:pw/2+v.x+(x*cs-y*sn)*v.scale/100,y:ph/2+v.y+(x*sn+y*cs)*v.scale/100}));const poly=document.createElementNS(SVG_NS,'polygon');poly.setAttribute('points',points.map(p=>`${p.x},${p.y}`).join(' '));poly.setAttribute('fill','none');poly.setAttribute('stroke','#ffb178');poly.setAttribute('stroke-width','1');root.append(poly);for(const [i,p]of points.entries()){const circle=document.createElementNS(SVG_NS,'circle');circle.setAttribute('cx',clamp(p.x,r,pw-r));circle.setAttribute('cy',clamp(p.y,r,ph-r));circle.setAttribute('r',r);circle.setAttribute('fill','#ffb178');circle.setAttribute('stroke','#1d1c1a');circle.setAttribute('stroke-width',r*.2);circle.dataset.gesture='rotate';circle.dataset.corner=i;circle.setAttribute('aria-label','Girar imagem; Shift no PC ajusta tamanho');root.append(circle);} }
let gesture=null,gesturePointers=new Map(),wheelTimer=null;
function canvasPoint(e){const r=$('preview').getBoundingClientRect(),[w,h]=dimensions();return {x:(e.clientX-r.left)*w/r.width,y:(e.clientY-r.top)*h/r.height};}
function transformClipFrom(c,keys,base,next,idx){c.keys=clone(keys);if(idx!==null){c.keys[idx].v=clone(next);}else{for(const k of c.keys){k.v.x+=next.x-base.x;k.v.y+=next.y-base.y;k.v.rotation+=next.rotation-base.rotation;k.v.scale=clamp(k.v.scale*next.scale/Math.max(.01,base.scale),1,2000);}}}
function beginGesture(e){if(exporting||e.button>0)return;let c=current();if(!c||c.type==='audio'){const top=visibleClips(t).filter(c=>c.track==='main').at(-1);if(!top)return;select(top.id);c=top;}if(!visibleClips(t,true).some(x=>x.id===c.id))return;e.preventDefault();pause();gesturePointers.set(e.pointerId,canvasPoint(e));if(!gesture){checkpoint();if($('autoKey').checked){keyIndex=insertKey(c,t-c.start);$('editScope').value='key';}gesture={c,base:poseForEdit(c),keys:clone(c.keys),idx:$('editScope').value==='key'?keyIndex:null,mode:e.target.dataset.gesture==='rotate'?(e.shiftKey?'scale':'rotate'):'pan'};}resetGestureBase();}
function resetGestureBase(){if(!gesture)return;gesture.base=poseForEdit(gesture.c);gesture.keys=clone(gesture.c.keys);gesture.points=[...gesturePointers.values()].map(p=>({...p}));}
function angleDelta(a,b){let d=a-b;while(d>Math.PI)d-=2*Math.PI;while(d< -Math.PI)d+=2*Math.PI;return d;}
function moveGesture(e){if(!gesture||!gesturePointers.has(e.pointerId))return;e.preventDefault();gesturePointers.set(e.pointerId,canvasPoint(e));const points=[...gesturePointers.values()],g=gesture,b=g.base,next=clone(b),[w,h]=dimensions(),center={x:w/2+b.x,y:h/2+b.y};if(points.length>=2&&g.points.length>=2){const a=g.points,z=points,oldMid={x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2},mid={x:(z[0].x+z[1].x)/2,y:(z[0].y+z[1].y)/2},ratio=Math.hypot(z[1].x-z[0].x,z[1].y-z[0].y)/Math.max(1,Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y)),angle=angleDelta(Math.atan2(z[1].y-z[0].y,z[1].x-z[0].x),Math.atan2(a[1].y-a[0].y,a[1].x-a[0].x));next.scale=clamp(b.scale*ratio,1,2000);next.rotation=b.rotation+angle*180/Math.PI;const dx=center.x-oldMid.x,dy=center.y-oldMid.y;next.x=mid.x+(dx*Math.cos(angle)-dy*Math.sin(angle))*ratio-w/2;next.y=mid.y+(dx*Math.sin(angle)+dy*Math.cos(angle))*ratio-h/2;}
 else if(g.mode==='rotate'){const a=g.points[0],z=points[0],d=angleDelta(Math.atan2(z.y-center.y,z.x-center.x),Math.atan2(a.y-center.y,a.x-center.x));next.rotation=b.rotation+d*180/Math.PI;if(e.shiftKey)next.rotation=Math.round(next.rotation/15)*15;}
 else if(g.mode==='scale'){next.scale=clamp(b.scale*Math.hypot(points[0].x-center.x,points[0].y-center.y)/Math.max(1,Math.hypot(g.points[0].x-center.x,g.points[0].y-center.y)),1,2000);}
 else{next.x=b.x+points[0].x-g.points[0].x;next.y=b.y+points[0].y-g.points[0].y;}
 transformClipFrom(g.c,g.keys,b,next,g.idx);draw();};
function endGesture(e){if(!gesturePointers.has(e.pointerId))return;gesturePointers.delete(e.pointerId);if(gesturePointers.size){resetGestureBase();return;}gesture=null;changed();}
$('preview').onpointerdown=beginGesture;$('selectionOverlay').onpointerdown=beginGesture;window.addEventListener('pointermove',moveGesture,{passive:false});window.addEventListener('pointerup',endGesture);window.addEventListener('pointercancel',endGesture);
$('preview').addEventListener('wheel',e=>{const c=current();if(!c||c.type==='audio'||exporting)return;e.preventDefault();pause();if(!wheelTimer)checkpoint();clearTimeout(wheelTimer);if($('autoKey').checked){keyIndex=insertKey(c,t-c.start);$('editScope').value='key';}const b=poseForEdit(c),p=canvasPoint(e),[w,h]=dimensions(),factor=Math.exp(-clamp(e.deltaY,-120,120)*(e.altKey?.0006:.002)),next={...b,scale:clamp(b.scale*factor,5,2000)};const actual=next.scale/b.scale;next.x=p.x+(w/2+b.x-p.x)*actual-w/2;next.y=p.y+(h/2+b.y-p.y)*actual-h/2;transformClipFrom(c,c.keys,b,next,$('editScope').value==='key'?keyIndex:null);draw();inspector();wheelTimer=setTimeout(()=>{wheelTimer=null;changed();},180);},{passive:false});
// Original procedural sounds: no copyrighted recordings, no external audio downloads.
const fxNodes=new Set();
function transitionSound(kind,when,volume){if(!audioCtx||kind==='none'||volume<=0)return;const duration=kind==='tick'?.075:.22,buffer=audioCtx.createBuffer(1,Math.ceil(audioCtx.sampleRate*duration),audioCtx.sampleRate),data=buffer.getChannelData(0);let seed=94721;for(let i=0;i<data.length;i++){seed=(seed*16807)%2147483647;const u=i/data.length,noise=(seed/2147483647)*2-1;data[i]=kind==='tick'?Math.sin(2*Math.PI*(950-500*u)*(i/audioCtx.sampleRate))*Math.exp(-u*8):noise*Math.sin(Math.PI*u)**2;}const source=audioCtx.createBufferSource(),filter=audioCtx.createBiquadFilter(),gain=audioCtx.createGain();source.buffer=buffer;filter.type='bandpass';filter.Q.value=.7;filter.frequency.setValueAtTime(kind==='tick'?1300:600,when);filter.frequency.exponentialRampToValueAtTime(kind==='tick'?800:4000,when+duration);gain.gain.value=volume/100*.55;source.connect(filter);filter.connect(gain);gain.connect(audioCtx.destination);gain.connect(mixDest);fxNodes.add(source);source.onended=()=>{fxNodes.delete(source);source.disconnect();filter.disconnect();gain.disconnect();};source.start(when);}
function scheduleSounds(){for(const source of fxNodes){try{source.stop();}catch{}}fxNodes.clear();if(!playing||!audioCtx)return;const list=mainClips();for(let i=1;i<list.length;i++){const c=list[i],prev=list[i-1],tr=c.transition;if(!tr||tr.type==='none'||tr.sound==='none'||Math.abs(prev.start+prev.duration-c.start)>1e-5||c.start<t)continue;transitionSound(tr.sound||'none',audioCtx.currentTime+c.start-t,tr.volume??14);}}
pause=function(){v2.basePause();for(const s of fxNodes){try{s.stop();}catch{}}fxNodes.clear();drawSelection();};
play=async function(){await v2.basePlay();scheduleSounds();};
const originalSeek=seek;seek=function(time){originalSeek(time);if(playing)scheduleSounds();};
const oldStartRecord=startRecord;startRecord=async function(){if(asrBusy)return toast('Conclua ou cancele a transcrição antes de exportar.');if(P.lens?.enabled&&lensFailed)return toast('Desative o ângulo amplo: a GPU não está disponível.');await oldStartRecord();};$('startExport').onclick=startRecord;
// Transition-only movies also need an audio track in MediaRecorder (patched in base export).
restoreProject=async function(obj){if(asrBusy)throw Error('Cancele a transcrição antes de abrir outro projeto.');await v2.baseRestore(obj);if(hasMagnet())compactMain();renderUI();};
$('helpDialog').querySelector('.stack').insertAdjacentHTML('afterbegin','<p><b>Gestos:</b> arraste para mover; roda do mouse ou pinça para zoom; arraste os cantos para girar. Dois dedos também giram. Shift + canto ajusta o tamanho no PC.</p><p class="muted">A faixa principal fecha espaços sem fundir clips. Áudio e legendas mantêm seus tempos. Ângulo amplo é uma aproximação de lente, sem distorcer textos; transições e sons só entram quando aplicados.</p>');

// Offline Whisper Tiny. All model weights, WASM and JS are embedded in this HTML.
let asrRequest=null,asrReady=false,asrWatchdog=null,asrStartedAt=0;
function offlineWhisperWorker(){
 let model=null,assets={},modelPromise=null;
 function decode(value){const binary=atob(value),bytes=new Uint8Array(binary.length);for(let i=0;i<bytes.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}
 const notify=(stage,detail,progress)=>self.postMessage({kind:'progress',stage,detail,progress});
 async function prepare(payload){
  assets=payload.assets||payload;const choice=payload.modelChoice||'base';notify('Preparando legendas',choice==='small'?'Whisper Small · precisão máxima…':choice==='tiny'?'Whisper Tiny · rápido e offline…':'Whisper Base · equilíbrio entre precisão e peso…',5);
  const nativeFetch=self.fetch.bind(self);
  self.fetch=async (input,options)=>{const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;const name=url.split('/').at(-1).split('?')[0];if(url.includes('/onnx-community/whisper-base/')||url.includes('/onnx-community/whisper-small/')||url.includes('huggingface.co/onnx-community/whisper-base')||url.includes('huggingface.co/onnx-community/whisper-small'))return nativeFetch(input,options);if(assets[name]){const bytes=decode(assets[name]);return new Response(bytes,{headers:{'Content-Type':name.endsWith('.wasm')?'application/wasm':name.endsWith('.json')?'application/json':'application/octet-stream','Content-Length':String(bytes.byteLength)}});}if(url.startsWith('blob:')||url.startsWith('data:')||url.startsWith('https:'))return nativeFetch(input,options);throw Error('Componente offline ausente: '+name);};
  const moduleURL=URL.createObjectURL(new Blob([decode(assets['transformers.mjs'])],{type:'text/javascript'}));
  try{const {pipeline,env}=await import(moduleURL);env.allowLocalModels=false;env.allowRemoteModels=true;env.useBrowserCache=true;env.useFSCache=false;env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;env.backends.onnx.wasm.wasmPaths='https://touca.local/embedded/';let loaded=0;
   const loadTiny=async()=>pipeline('automatic-speech-recognition','Xenova/whisper-tiny',{quantized:true,progress_callback:p=>{if(p.status==='done'){loaded++;notify('Whisper Tiny',p.file,Math.min(28,8+loaded*2));}}});const loadBase=async()=>pipeline('automatic-speech-recognition','onnx-community/whisper-base',{quantized:true,progress_callback:p=>{if(p.status==='done'){loaded++;notify('Whisper Base',p.file,Math.min(28,5+loaded*3));}}});const loadSmall=async()=>pipeline('automatic-speech-recognition','onnx-community/whisper-small',{quantized:true,progress_callback:p=>{if(p.status==='done'){loaded++;notify('Whisper Small',p.file,Math.min(28,5+loaded*2));}}});try{if(choice==='tiny'){model=await loadTiny();notify('Modelo rápido pronto','Whisper Tiny offline.',30);}else if(choice==='small'){model=await loadSmall();notify('Modelo de alta precisão pronto','Whisper Small · cache local após o primeiro uso.',30);}else{model=await loadBase();notify('Modelo equilibrado pronto','Whisper Base · cache local após o primeiro uso.',30);}}catch(primaryError){loaded=0;if(choice==='small'){try{notify('Fallback','Small indisponível; tentando Whisper Base.',12);model=await loadBase();notify('Modelo equilibrado pronto','Whisper Base · cache local.',30);}catch{notify('Modo offline','Sem download; usando Whisper Tiny incluído.',15);model=await loadTiny();notify('Modelo offline pronto','Whisper Tiny · revise nomes próprios.',30);}}else if(choice==='base'){notify('Modo offline','Sem download do Base; usando Whisper Tiny incluído.',12);model=await loadTiny();notify('Modelo offline pronto','Whisper Tiny · revise nomes próprios.',30);}else throw primaryError;}assets={};self.postMessage({kind:'ready'});return model;
  }finally{URL.revokeObjectURL(moduleURL);}
 }
 async function detectLanguage(audio){
  // Detect the language token itself, before transcription; vote across speech samples.
  const ids=model.model.generation_config.lang_to_id,allowed=new Set(Object.values(ids)),blocked=[];
  for(let i=0;i<model.model.config.vocab_size;i++)if(!allowed.has(i))blocked.push(i);
  const votes=new Map(),length=audio.length,span=Math.min(length,160000);
  for(const fraction of [0,.5,1]){const start=Math.floor(Math.max(0,length-Math.min(span,length/2))*fraction),sample=audio.subarray(start,Math.min(length,start+span));let energy=0;for(let i=0;i<sample.length;i+=32)energy+=sample[i]*sample[i];if(energy<1e-6)continue;
   const {input_features}=await model.processor(sample),out=await model.model.generate(input_features,{max_new_tokens:1,forced_decoder_ids:null,begin_suppress_tokens:blocked,return_timestamps:false,return_token_timestamps:false});
   const token=Number(out[0].at(-1)),lang=Object.entries(ids).find(([,id])=>id===token)?.[0]?.slice(2,-2);if(lang)votes.set(lang,(votes.get(lang)||0)+1);
  }
  if(!votes.size)throw Error('Não foi possível detectar o idioma. Selecione Português ou o idioma da fala.');
  return [...votes].sort((a,b)=>b[1]-a[1])[0][0];
 }
 self.onmessage=async e=>{try{if(e.data.kind==='load'){modelPromise=prepare(e.data.assets);await modelPromise;return;}if(e.data.kind!=='transcribe')return;await modelPromise;if(!model)throw Error('O modelo não foi preparado.');const audio=e.data.audio,seconds=audio.length/16000;let language=e.data.language;if(language==='auto'){notify('Detectando idioma','Comparando trechos da voz…',31);language=await detectLanguage(audio);}notify('Transcrevendo','Idioma: '+language+' · mantendo a fala original',32);let chunk=0;
   const result=await model(audio,{language,task:'transcribe',return_timestamps:'word',chunk_length_s:30,stride_length_s:5,chunk_callback:()=>{chunk++;notify('Transcrevendo',`Trecho ${chunk} analisado`,Math.min(93,32+chunk*20/Math.max(20,seconds)*60));}});result.language=language;
   self.postMessage({kind:'result',result});
  }catch(error){modelPromise=null;self.postMessage({kind:'error',message:error.message||String(error)});}
 };
}
function setAsrStatus(title,detail='',progress){$('asrStatus').textContent=title;$('asrDetail').textContent=detail;if(Number.isFinite(progress))$('asrProgress').value=progress;else $('asrProgress').removeAttribute('value');}
function cancelTranscription(){window.ToucaScenes?.cancelPending();asrToken++;asrWorker?.terminate();asrWorker=null;asrReady=false;asrBusy=false;asrRequest=null;clearInterval(asrWatchdog);asrWatchdog=null;$('startAsr').disabled=false;$('cancelAsr').textContent='Fechar';setAsrStatus('Transcrição cancelada.','O áudio original não foi alterado.',0);}
function failTranscription(message){window.ToucaScenes?.cancelPending();asrWorker?.terminate();asrWorker=null;asrReady=false;asrBusy=false;asrRequest=null;clearInterval(asrWatchdog);asrWatchdog=null;$('startAsr').disabled=false;$('cancelAsr').textContent='Fechar';setAsrStatus('Não foi possível transcrever.',message,0);toast(message);}
function groupedWords(chunks,maxDuration){const words=chunks.filter(w=>w.timestamp&&Number.isFinite(w.timestamp[0])&&String(w.text||'').trim()).map(w=>({text:w.text.trim(),start:clamp(w.timestamp[0],0,maxDuration),end:Number.isFinite(w.timestamp[1])?clamp(w.timestamp[1],0,maxDuration):null})).sort((a,b)=>a.start-b.start);const groups=[];let group=[];
 for(let i=0;i<words.length;i++){const w=words[i];w.end=Math.min(maxDuration,Math.max(w.start+1/30,w.end??words[i+1]?.start??w.start+.4));if(w.start>=maxDuration)continue;if(group.length&&w.start-group.at(-1).end>.35){groups.push(group);group=[];}group.push(w);if(group.length>=3||group.map(x=>x.text).join(' ').length>=24||/[.!?]$/.test(w.text)){groups.push(group);group=[];}}
 if(group.length)groups.push(group);return groups.map((g,i)=>({text:g.map(w=>w.text).join(' ').toUpperCase(),start:g[0].start,end:Math.max(g[0].start+1/30,Math.min(g.at(-1).end,groups[i+1]?.[0].start??maxDuration))}));
}
function receiveTranscript(result){if(!asrRequest)return;const {snapshot,pop,replace}=asrRequest;const groups=groupedWords(result.chunks||[],snapshot.duration);if(!groups.length){failTranscription('Nenhuma fala com tempos foi reconhecida. Verifique se o clip contém voz audível.');return;}checkpoint();if(replace)P.clips=P.clips.filter(c=>c.type!=='subtitle'||c.start+c.duration<=snapshot.start||c.start>=snapshot.start+snapshot.duration);for(const g of groups){const cap=makeCaption(g.text,snapshot.start+g.start,snapshot.start+g.end,pop);cap.sourceClip=snapshot.id;P.clips.push(cap);}clearInterval(asrWatchdog);asrWatchdog=null;asrBusy=false;asrRequest=null;$('startAsr').disabled=false;$('cancelAsr').textContent='Fechar';changed();setAsrStatus(groups.length+' legendas criadas.','Revise nomes próprios e o tempo de cada frase antes de exportar.',100);}
async function startOfflineWorker(){if(asrWorker)return;const token=asrToken;let assets;try{assets=await window.toucaNative.loadWhisperAssets();}catch(e){failTranscription(e.message);return;}if(token!==asrToken)return;const url=URL.createObjectURL(new Blob(['('+offlineWhisperWorker.toString()+')();'],{type:'text/javascript'}));try{asrWorker=new Worker(url); }finally{URL.revokeObjectURL(url);}asrWorker.onerror=e=>{e.preventDefault();failTranscription('Falha ao iniciar o processamento local: '+(e.message||'memória ou navegador incompatível. Tente Chrome/Edge atualizado.'));};asrWorker.onmessage=e=>{const msg=e.data;if(msg.kind==='progress')setAsrStatus(msg.stage,msg.detail,msg.progress);else if(msg.kind==='error')failTranscription(msg.message);else if(msg.kind==='ready'){asrReady=true;if(asrRequest)sendAudioToWhisper();}else if(msg.kind==='result')receiveTranscript(msg.result);};if(!assets['encoder_model_quantized.onnx']||!assets['decoder_model_merged_quantized.onnx'])throw Error('O arquivo HTML está incompleto: faltam os pesos do Whisper Tiny.');asrWorker.postMessage({kind:'load',assets,modelChoice:$('v18AsrModel')?.value||'base'});}
function sendAudioToWhisper(){if(!asrRequest?.audio)return;const audio=asrRequest.audio;asrRequest.audio=null;asrWorker.postMessage({kind:'transcribe',audio,language:asrRequest.language},[audio.buffer]);}
transcribe=async function(){if(asrBusy)return;const c=P.clips.find(c=>c.id===$('asrSource').value);if(!c)return;pause();if(c.duration>600)return setAsrStatus('Transcreva clips de até 10 minutos.','Divida a narração para reduzir o uso de memória.',0);const token=++asrToken;asrBusy=true;asrStartedAt=Date.now();$('startAsr').disabled=true;$('cancelAsr').textContent='Cancelar';setAsrStatus('Preparando seu áudio…','Sem upload e sem chave de API.',1);let ac;
 try{const snapshot=clone(c),asset=P.assets.find(a=>a.id===c.asset);ac=new AudioContext();const bytes=await (await fetch(asset.data)).arrayBuffer(),decoded=await ac.decodeAudioData(bytes);await ac.close();ac=null;if(token!==asrToken)return;const length=Math.ceil(snapshot.duration*16000),offline=new OfflineAudioContext(1,length,16000),source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start(0,Math.max(0,snapshot.offset||0),snapshot.duration);const rendered=await offline.startRendering();if(token!==asrToken)return;const audio=rendered.getChannelData(0).slice();let power=0;for(let i=0;i<audio.length;i+=16)power+=audio[i]*audio[i];if(power/Math.max(1,audio.length/16)<1e-9)throw Error('Este clip está silencioso. Escolha a narração com voz.');asrRequest={snapshot,audio,pop:$('asrStyle').checked,replace:$('replaceCaptions').checked,language:$('asrLang').value,scenePlan:window.ToucaScenes?.pendingFor(snapshot.id)};if(asrRequest.scenePlan)asrRequest.scriptText=asrRequest.scenePlan.plan.spokenText;asrWatchdog=setInterval(()=>{if(!asrBusy)return;const elapsed=Math.floor((Date.now()-asrStartedAt)/1000);$('asrElapsed').textContent=elapsed+' s · mantenha o editor aberto';},1000);if(asrReady&&asrWorker)sendAudioToWhisper();else startOfflineWorker();
 }catch(e){if(ac)ac.close().catch(()=>{});if(token===asrToken)failTranscription(e.message);}
};
$('startAsr').onclick=transcribe;$('cancelAsr').onclick=()=>asrBusy?cancelTranscription():$('asrDialog').close();$('asrDialog').oncancel=e=>{if(asrBusy){e.preventDefault();cancelTranscription();}};
const originalShowASR=showASR;showASR=function(){originalShowASR();if(current()&&['audio','video'].includes(current().type))$('asrSource').value=current().id;};$('asrBtn').onclick=showASR;

// Touca 3: generous edge keyframes, non-modal controls, single-word captions and cut-bound transitions.
const V3={build:buildTimeline,inspector:inspector,editPose,beginGesture,select,seek,drawTo,play,startRecord,changed};
const selectedMany=new Set();let pickedCut=null,edgeFocus=null;
const TRAN_TYPES={in:{label:'Aproximar',sound:'whoosh'},out:{label:'Afastar',sound:'reverse'},left:{label:'Esquerda',sound:'whoosh'},right:{label:'Direita',sound:'whoosh'},magic:{label:'Pó Mágico',sound:'glitter'},mix:{label:'Combinado',sound:'none'},white:{label:'Espanto Branco',sound:'none'},black:{label:'Espanto Escuro',sound:'none'}};
// Remove the blocking surface altogether, while retaining an inert compatibility node.
$('drawerMask').hidden=true;$('drawerMask').disabled=true;$('drawerMask').style.display='none';
const oldOpenSheet=openSheet;openSheet=function(kind,tab){const already=kind==='effects'?$('effectsPanel').classList.contains('open'):$('workspace').classList.contains(kind==='media'?'showMedia':'showInspector');if(already&&!tab){closeSheets();return;}oldOpenSheet(kind,tab);$('drawerMask').classList.remove('open');};
$('effectsPanel').querySelector('hr').insertAdjacentHTML('beforebegin','<p class="transitionHelp muted">Sem som. Aplica à arte e aos PNGs, abaixo de todas as legendas e textos.</p>');
for(let el=$('effectsPanel').querySelector('hr');el;){const next=el.nextElementSibling;el.hidden=true;el=next;}
$('effectsPanel').insertAdjacentHTML('beforeend','<p class="transitionHelp">Para transições, arraste o círculo <b>TRAN</b> até a divisão entre dois clips.</p>');
$('timelineZoom').closest('.timelineTools').insertAdjacentHTML('afterbegin','<button id="tranTool" class="tranTool" title="Arraste até um corte">TRAN</button><button id="selectMode" class="selectMode ghost" title="Selecionar vários clips">▧</button><button id="deleteMany" class="ghost" title="Excluir seleção">Excluir</button><span id="selectionCount" class="selectionCount"></span>');
document.body.insertAdjacentHTML('beforeend','<section id="transitionPicker" class="transitionPicker" aria-label="Escolher transição"><div class="panelTitle"><h2>Transição</h2><button id="closeTransition" class="sheetClose" aria-label="Fechar transições">×</button></div><p id="cutLabel" class="transitionInfo"></p><div id="transitionChoices" class="transitionChoices"></div><p class="transitionInfo">0,4 s · sons a 60% · narração preservada</p><button id="removeTransition" class="ghost danger">Remover transição</button></section>');
const langOption=document.createElement('option');langOption.value='auto';langOption.textContent='Detectar idioma automaticamente';$('asrLang').prepend(langOption);$('asrLang').value='auto';
$('asrDialog').querySelector('small').insertAdjacentHTML('afterend','<small>Uma palavra por vez. Detectar idioma não garante reconhecer mudanças de língua ou nomes próprios corretamente.</small>');
groupedWords=function(chunks,maxDuration){const words=[];for(const c of chunks){if(!c.timestamp||!Number.isFinite(c.timestamp[0]))continue;const tokens=String(c.text||'').trim().split(/\s+/).filter(Boolean),start=clamp(c.timestamp[0],0,maxDuration),end=clamp(c.timestamp[1]??start+.3,start,maxDuration);tokens.forEach((text,i)=>words.push({text:text.toUpperCase(),start:start+(end-start)*i/tokens.length,end:start+(end-start)*(i+1)/tokens.length}));}words.sort((a,b)=>a.start-b.start);const out=[];for(let i=0;i<words.length;i++){const w=words[i],start=Math.max(w.start,out.at(-1)?.end??0),limit=Math.min(maxDuration,words[i+1]?.start??maxDuration),end=Math.min(limit,Math.max(w.end,start+.065));if(end>start+.001)out.push({...w,start,end});}return out;};
// Captions shorter than one frame must not overlap the following word.
const originalMakeCaption=makeCaption;makeCaption=function(text,start,end,pop=false){const c=originalMakeCaption(text,start,end,pop);c.duration=Math.max(.001,end-start);if(pop)popPreset(c);else c.keys=[{t:0,v:clone(c.keys[0].v),ease:'linear'},{t:c.duration,v:clone(c.keys[0].v),ease:'linear'}];return c;};
function edgeIndex(c,time=t){if(!c||c.type==='audio')return null;const margin=Math.min(c.duration/3,Math.max(.15,16/pps)),d0=Math.abs(time-c.start),d1=Math.abs(time-c.start-c.duration);if(Math.min(d0,d1)>margin)return null;return d0<=d1?0:c.keys.length-1;}
function focusEdge(c,index){if(!c||c.type==='audio')return;pause();selected=c.id;selectedMany.clear();edgeFocus=c.id;keyIndex=index===0?0:c.keys.length-1;t=c.start+c.keys[keyIndex].t;$('editScope').value='key';syncMedia(true);renderUI();}
function armEdge(){const c=current(),i=edgeIndex(c);if(i===null)return false;keyIndex=i;edgeFocus=c.id;t=c.start+c.keys[i].t;$('editScope').value='key';return true;}
select=function(id,jump=false){selectedMany.clear();edgeFocus=null;V3.select(id,jump);const c=current(),i=edgeIndex(c);if(i!==null){keyIndex=i;edgeFocus=c.id;$('editScope').value='key';}inspector();};
seek=function(time){edgeFocus=null;V3.seek(time);const c=current(),i=edgeIndex(c);if(i!==null&&!playing&&!exporting){keyIndex=i;edgeFocus=c.id;t=c.start+c.keys[i].t;$('editScope').value='key';syncMedia(true);draw();drawPlayhead();inspector();}else if(c){$('editScope').value='clip';inspector();}};
editPose=function(prop,value,record=true){armEdge();V3.editPose(prop,value,record);};
beginGesture=function(e){armEdge();V3.beginGesture(e);};$('preview').onpointerdown=beginGesture;$('selectionOverlay').onpointerdown=beginGesture;
$('preview').addEventListener('wheel',()=>armEdge(),{capture:true,passive:true});
function showSelection(){for(const el of document.querySelectorAll('.clip'))el.classList.toggle('multiSelected',selectedMany.has(el.dataset.id));$('selectionCount').textContent=selectedMany.size?selectedMany.size+' selecionados':'';}
deleteSelected=function(){const ids=selectedMany.size?new Set(selectedMany):new Set(selected?[selected]:[]);if(!ids.size)return;act(()=>{P.clips=P.clips.filter(c=>!ids.has(c.id));selectedMany.clear();selected=null;edgeFocus=null;});};$('deleteClip').onclick=deleteSelected;$('deleteMany').onclick=deleteSelected;
$('selectMode').onclick=()=>$('selectMode').classList.toggle('active');
function boxSelect(e){if(exporting||e.button>0||e.target.closest('.clip,.transitionMark,.ruler'))return;if(!e.target.closest('.timelineScroll'))return;e.preventDefault();pause();const additive=e.ctrlKey||e.metaKey||e.shiftKey,original=new Set(additive?selectedMany:[]),start={x:e.clientX,y:e.clientY},box=document.createElement('div');box.className='boxSelection';document.body.append(box);let dragged=false;
 const move=ev=>{const x=Math.min(start.x,ev.clientX),y=Math.min(start.y,ev.clientY),w=Math.abs(ev.clientX-start.x),h=Math.abs(ev.clientY-start.y);if(!dragged&&w+h<5)return;dragged=true;box.style.cssText=`left:${x}px;top:${y}px;width:${w}px;height:${h}px`;selectedMany.clear();original.forEach(id=>selectedMany.add(id));for(const el of document.querySelectorAll('.clip')){const r=el.getBoundingClientRect();if(r.right>=x&&r.left<=x+w&&r.bottom>=y&&r.top<=y+h)selectedMany.add(el.dataset.id);}showSelection();};
 const up=()=>{box.remove();window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);if(!dragged){selectedMany.clear();const r=$('ruler').getBoundingClientRect();seek(Math.max(0,(e.clientX-r.left)/pps));}showSelection();};window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up,{once:true});window.addEventListener('pointercancel',up,{once:true});}
$('timelineScroll').addEventListener('pointerdown',boxSelect);document.querySelectorAll('.track').forEach(el=>el.onpointerdown=null);
function cuts(){const a=mainClips();return a.slice(1).map((c,i)=>({a:a[i],b:c,time:c.start})).filter(x=>Math.abs(x.a.start+x.a.duration-x.time)<1e-5);}
function cutFor(c){return cuts().find(x=>x.b.id===c?.id);}
function validTransition(c){const cut=cutFor(c);return !!cut&&c.transition&&c.transition.type!=='none'&&(!c.transition.from||c.transition.from===cut.a.id)&&c.transition.enabled!==false&&cut.a.duration>0&&cut.b.duration>0;}
function showTransition(id){const c=P.clips.find(x=>x.id===id),cut=cutFor(c);if(!cut)return;closeSheets();pickedCut=id;$('cutLabel').textContent=cut.a.name+' → '+cut.b.name;$('transitionPicker').classList.add('open');for(const b of $('transitionChoices').children)b.classList.toggle('active',c.transition?.type===b.dataset.type);}
for(const [type,def]of Object.entries(TRAN_TYPES)){const b=document.createElement('button');b.dataset.type=type;b.textContent=def.label;const note=document.createElement('small');note.textContent=def.sound==='none'?'Sem som':'Som · 60%';b.append(note);b.onclick=()=>{const c=P.clips.find(x=>x.id===pickedCut),cut=cutFor(c);if(!cut)return;if(cut.a.duration<.4||cut.b.duration<.4)return toast('Cada clip precisa ter pelo menos 0,4 s para esta transição.');act(()=>{c.transition={type,duration:.3,sound:def.sound,volume:60,from:cut.a.id};});primeTransitionMedia().catch(e=>toast(e.message));showTransition(c.id);};$('transitionChoices').append(b);}
$('closeTransition').onclick=()=>$('transitionPicker').classList.remove('open');$('removeTransition').onclick=()=>{const c=P.clips.find(x=>x.id===pickedCut);if(c)act(()=>delete c.transition);$('transitionPicker').classList.remove('open');};
$('tranTool').onpointerdown=e=>{if(exporting||e.button>0)return;e.preventDefault();const ghost=document.createElement('div');ghost.className='tranTool tranGhost';ghost.textContent='TRAN';document.body.append(ghost);let nearest=null,moved=false;const move=ev=>{moved=true;ghost.style.transform=`translate(${ev.clientX-22}px,${ev.clientY-22}px)`;document.querySelectorAll('.cutTarget').forEach(x=>x.remove());const track=document.querySelector('.track[data-track="main"]'),r=track.getBoundingClientRect();nearest=null;if(ev.clientY<r.top-40||ev.clientY>r.bottom+40)return;let distance=44;for(const cut of cuts()){const d=Math.abs(ev.clientX-(r.left+cut.time*pps));if(d<distance){distance=d;nearest=cut;}}if(nearest){const target=document.createElement('div');target.className='cutTarget';target.style.left=nearest.time*pps+'px';track.append(target);}};
 const up=()=>{ghost.remove();document.querySelectorAll('.cutTarget').forEach(x=>x.remove());window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);if(nearest){act(()=>{nearest.b.transition??={type:'none',duration:.3,sound:'none',volume:60,from:nearest.a.id};});showTransition(nearest.b.id);}else if(!moved){const c=cuts().sort((a,b)=>Math.abs(a.time-t)-Math.abs(b.time-t))[0];if(c)showTransition(c.b.id);else toast('Adicione dois clips à faixa principal.');}else toast('Solte o TRAN próximo da divisão entre dois clips.');};const cancel=()=>{nearest=null;moved=true;up();};move(e);moved=false;window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up,{once:true});window.addEventListener('pointercancel',cancel,{once:true});};
buildTimeline=function(){V3.build();document.querySelectorAll('.transBadge').forEach(x=>x.remove());let visible=0;document.querySelectorAll('.track').forEach(x=>{if(!x.classList.contains('hiddenTrack'))visible++;});$('app').style.setProperty('--timeline-height',Math.min(305,Math.max(160,90+visible*50))+'px');for(const c of P.clips){const el=document.querySelector(`.clip[data-id="${c.id}"]`);if(!el)continue;const originalDown=el.onpointerdown;el.onpointerdown=e=>{if(e.target.closest('.edgeKey'))return;if(e.ctrlKey||e.metaKey||$('selectMode').classList.contains('active')){e.stopPropagation();selectedMany.has(c.id)?selectedMany.delete(c.id):selectedMany.add(c.id);showSelection();return;}selectedMany.clear();edgeFocus=null;originalDown(e);};if(c.type!=='audio')for(const [side,idx]of [['start',0],['end',c.keys.length-1]]){const b=document.createElement('button');b.className='edgeKey '+side+(selected===c.id&&keyIndex===idx&&$('editScope').value==='key'?' active':'');b.setAttribute('aria-label',side==='start'?'Keyframe inicial':'Keyframe final');b.onpointerdown=e=>{e.preventDefault();e.stopPropagation();focusEdge(c,idx);};b.onclick=e=>{e.stopPropagation();focusEdge(c,idx);};el.append(b);}}
 const track=document.querySelector('.track[data-track="main"]');for(const cut of cuts()){if(!cut.b.transition||cut.b.transition.from&&cut.b.transition.from!==cut.a.id)continue;const b=document.createElement('button');b.className='transitionMark'+(cut.b.transition.type==='none'?' pending':'');b.style.left=cut.time*pps+'px';b.textContent='⋈';b.title=TRAN_TYPES[cut.b.transition.type]?.label||'Escolher transição';b.onpointerdown=e=>{e.preventDefault();e.stopPropagation();showTransition(cut.b.id);};b.onclick=()=>showTransition(cut.b.id);track.append(b);}showSelection();};
// Use the near-edge key even without Auto enabled; clip-wide edits remain available in the middle.
inspector=function(){V3.inspector();const c=current(),i=edgeIndex(c);if(c&&i!==null&&edgeFocus===c.id){$('editScope').value='key';keyIndex=i;}showSelection();};
window.addEventListener('keydown',e=>{if(e.key==='Escape'){closeSheets();$('transitionPicker').classList.remove('open');selectedMany.clear();showSelection();}});
// Snapshot video edge handles for true two-image blends without moving clips or narration.
const transitionVideos=new Map();
async function primeTransitionMedia(){const jobs=[];for(const c of P.clips.filter(validTransition)){const cut=cutFor(c);for(const [clip,tail]of [[cut.a,true],[cut.b,false]]){if(clip.type!=='video')continue;const time=(clip.offset||0)+(tail?Math.max(0,clip.duration-.002):0),id=clip.id+':'+time.toFixed(5);if(transitionVideos.has(id)){jobs.push(transitionVideos.get(id).promise);continue;}const asset=P.assets.find(x=>x.id===clip.asset);if(!asset)continue;const el=document.createElement('video');el.muted=true;el.playsInline=true;el.preload='auto';const entry={el,ready:false,promise:null};transitionVideos.set(id,entry);entry.promise=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Não foi possível preparar o vídeo da transição.')),15000);el.onerror=()=>{clearTimeout(timeout);reject(Error('Formato de vídeo indisponível na transição.'));};el.onloadedmetadata=()=>{el.currentTime=Math.min(time,el.duration-.002);};el.onseeked=()=>{entry.ready=true;clearTimeout(timeout);draw();resolve();};el.onloadeddata=()=>{if(time===0){entry.ready=true;clearTimeout(timeout);draw();resolve();}};el.src=asset.data;});entry.promise=entry.promise.catch(e=>{transitionVideos.delete(id);throw e;});jobs.push(entry.promise);}}await Promise.all(jobs);}
const clipPainter=paintClip;paintClip=function(g,c,time,pw,ph){if(c.type!=='video'||!c.__transitionEdge)return clipPainter(g,c,time,pw,ph);const point=(c.offset||0)+(c.__transitionEdge==='tail'?Math.max(0,c.duration-.002):0),entry=transitionVideos.get(c.id+':'+point.toFixed(5));if(!entry?.ready)return clipPainter(g,c,time,pw,ph);const old=cache.get(c.asset);cache.set(c.asset,{...old,el:entry.el});try{clipPainter(g,c,time,pw,ph);}finally{cache.set(c.asset,old);}};
transitionAt=function(time){for(const cut of cuts()){if(!validTransition(cut.b))continue;const duration=Math.max(.001,Math.min(Number(cut.b.transition.duration)||.3,cut.a.duration,cut.b.duration)),start=cut.time-duration/2,u=(time-start)/duration;if(u>=0&&u<1)return {clip:cut.b,prev:cut.a,type:cut.b.transition.type,u,duration,amount:1-Math.abs(2*u-1)};}return null;};
const frameA=document.createElement('canvas'),frameB=document.createElement('canvas');
function transitionFrame(canvas,clip,tail,time,w,h){if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}const g=canvas.getContext('2d'),[pw,ph]=dimensions();g.setTransform(1,0,0,1,0,0);g.fillStyle='#101217';g.fillRect(0,0,w,h);g.save();g.scale(w/pw,h/ph);paintClip(g,{...clip,__transitionEdge:tail?'tail':'head'},clamp(time,clip.start,clip.start+clip.duration),pw,ph);g.restore();}
function blendFrames(g,A,B,tr,w,h){const u=tr.u,s=u*u*(3-2*u),peak=Math.sin(Math.PI*u);g.fillStyle='#101217';g.fillRect(0,0,w,h);const image=(im,x=0,scale=1,alpha=1)=>{g.save();g.globalAlpha=alpha;g.translate(w/2+x,h/2);g.scale(scale,scale);g.drawImage(im,-w/2,-h/2,w,h);g.restore();};
 if(tr.type==='left'||tr.type==='right'){const dir=tr.type==='left'?-1:1;image(A,dir*s*w);image(B,dir*(s-1)*w);}
 else if(tr.type==='in'||tr.type==='out'){const dir=tr.type==='in'?1:-1;g.filter=`blur(${peak*2.5}px)`;image(A,0,1+dir*s*.22);image(B,0,1-dir*(1-s)*.18,s);g.filter='none';}
 else if(tr.type==='magic'){image(B);const cell=Math.max(8,Math.round(w/40));for(let y=0;y<h;y+=cell)for(let x=0;x<w;x+=cell){const hash=((Math.imul((x/cell|0)+1,73856093)^Math.imul((y/cell|0)+1,19349663))>>>0)/4294967295;if(hash>s){const drift=peak*Math.sin(y*.08+hash*20)*w*.026;g.globalAlpha=Math.min(1,(hash-s)*9);g.drawImage(A,x,y,cell,cell,x+drift,y-peak*hash*cell,cell,cell);}else if(s-hash<.055){g.globalAlpha=(1-(s-hash)/.055)*.6;g.fillStyle='#fff3ce';g.fillRect(x+cell*.3,y+cell*.3,2,2);}}g.globalAlpha=1;}
 else if(tr.type==='white'||tr.type==='black'){image(u<.5?A:B);g.globalAlpha=peak;g.fillStyle=tr.type==='white'?'#fff':'#000';g.fillRect(0,0,w,h);g.globalAlpha=1;}
 else{image(A);image(B,0,1,s);}}
drawTo=function(g,w,h,time){const tr=transitionAt(time);if(!tr||(g===ctx&&!playing&&edgeFocus===selected&&$('editScope').value==='key')){const old=transitionAt;transitionAt=()=>null;try{V3.drawTo(g,w,h,time);}finally{transitionAt=old;}return;}transitionFrame(frameA,tr.prev,true,time,w,h);transitionFrame(frameB,tr.clip,false,time,w,h);if(sceneCanvas.width!==w||sceneCanvas.height!==h){sceneCanvas.width=w;sceneCanvas.height=h;}sceneCtx.setTransform(1,0,0,1,0,0);blendFrames(sceneCtx,frameA,frameB,tr,w,h);const [pw,ph]=dimensions(),layers=visibleClips(time,false).filter(c=>c.track!=='main');sceneCtx.save();sceneCtx.scale(w/pw,h/ph);for(const c of layers.filter(c=>!['text','subtitle'].includes(c.type)))paintClip(sceneCtx,c,time,pw,ph);sceneCtx.restore();let img=sceneCanvas;if(P.lens?.enabled&&P.lens.power>0&&!lensFailed){try{lensRenderer??=createLens();if(lensRenderer)img=lensRenderer.render(sceneCanvas,P.lens.power/100*.32);}catch{lensFailed=true;}}g.setTransform(1,0,0,1,0,0);g.drawImage(img,0,0,w,h);g.save();g.scale(w/pw,h/ph);for(const c of layers.filter(c=>['text','subtitle'].includes(c.type)))paintClip(g,c,time,pw,ph);g.restore();};
transitionSound=function(kind,when,volume){if(!audioCtx||kind==='none')return;const duration=kind==='glitter'?.58:.32,buffer=audioCtx.createBuffer(1,Math.ceil(audioCtx.sampleRate*duration),audioCtx.sampleRate),out=buffer.getChannelData(0);let seed=19409;for(let i=0;i<out.length;i++){const u=i/out.length,seconds=i/audioCtx.sampleRate;seed=seed*16807%2147483647;const noise=seed/2147483647*2-1,envelope=Math.sin(Math.PI*u)**2;if(kind==='glitter'){out[i]=0;for(let k=0;k<5;k++){const tt=seconds-k*.06;if(tt>=0)out[i]+=Math.sin(2*Math.PI*(1600+k*530)*tt)*Math.exp(-tt*15)*.14;}out[i]+=noise*envelope*.025;}else out[i]=noise*envelope*.25;}if(kind==='reverse')out.reverse();const source=audioCtx.createBufferSource(),gain=audioCtx.createGain();source.buffer=buffer;gain.gain.value=volume/100;source.connect(gain);gain.connect(audioCtx.destination);gain.connect(mixDest);fxNodes.add(source);source.onended=()=>{fxNodes.delete(source);source.disconnect();gain.disconnect();};source.start(when);};
scheduleSounds=function(){for(const s of fxNodes)try{s.stop();}catch{}fxNodes.clear();if(!playing||!audioCtx)return;for(const cut of cuts()){if(!validTransition(cut.b))continue;const tr=cut.b.transition,start=cut.time-.16;if(start>=t&&tr.sound!=='none')transitionSound(tr.sound,audioCtx.currentTime+start-t,60);}};
play=async function(){try{await primeTransitionMedia();edgeFocus=null;await V3.play();}catch(e){toast(e.message);}};
startRecord=async function(){try{await primeTransitionMedia();edgeFocus=null;await V3.startRecord();}catch(e){toast(e.message);}};$('startExport').onclick=startRecord;
$('helpDialog').querySelector('.stack').insertAdjacentHTML('afterbegin','<p><b>Keyframes:</b> toque nos losangos grandes. Perto das bordas, mover ou ampliar a imagem altera só o keyframe daquela borda, mesmo com Auto desligado. A faixa fina no topo das extremidades continua servindo para recortar.</p><p><b>Seleção:</b> arraste no espaço vazio da timeline para marcar clips. No celular, use ▧ para marcar com toques. Excluir apaga a seleção; desfazer recupera.</p><p><b>TRAN:</b> arraste o círculo branco para um corte e toque no marcador. Cada transição dura 0,4 s e precisa de clips com pelo menos 0,4 s. Vídeos usam quadros de borda durante a mistura; a narração não muda.</p>');

// Direct manipulation and touch-first controls. Existing projects retain their keyframes.
const V4={build:buildTimeline,render:renderUI,begin:beginGesture,move:moveGesture,end:endGesture,selection:drawSelection};
transitionSound=()=>{};scheduleSounds=()=>{};
for(const def of Object.values(TRAN_TYPES))def.sound='none';
for(const note of $('transitionChoices').querySelectorAll('small'))note.textContent='Sem som';
$('transitionPicker').querySelectorAll('.transitionInfo').forEach(el=>{if(el.textContent.includes('60%'))el.textContent='0,4 s · sem som';});
$('helpDialog').querySelectorAll('p').forEach(el=>{el.textContent=el.textContent.replace('transições e sons só entram quando aplicados','transições só entram quando aplicadas');});
document.body.insertAdjacentHTML('beforeend',`<nav id="quickAdd" class="quickAdd" aria-label="Adicionar"><button id="quickToggle" aria-expanded="false" aria-label="Abrir opções">+</button><div id="quickOptions" hidden><button id="directMedia">▧ <span>Mídia</span></button><button id="directAudio">♫ <span>Áudio</span></button><button id="directCaptions">▤ <span>Legendas</span></button><button id="directText">T <span>Texto</span></button><button id="directLogo">◎ <span>Logo</span></button><button id="directEffects">✧ <span>Efeito</span></button></div></nav><input id="directMediaInput" type="file" accept="image/*,video/*" multiple hidden><input id="directAudioInput" type="file" accept="audio/*" multiple hidden><section id="clipMenu" class="clipMenu" hidden aria-label="Ações do clip"></section><dialog id="wordDialog"><form method="dialog"><div class="row between"><b>Editar texto</b><button value="cancel" aria-label="Cancelar">×</button></div><textarea id="wordInput" rows="3" aria-label="Texto da legenda"></textarea><button id="saveWord" class="primary" value="save">Salvar texto</button></form></dialog>`);
$('quickToggle').onclick=()=>{const open=$('quickOptions').hidden;$('quickOptions').hidden=!open;$('quickAdd').classList.toggle('expanded',open);$('quickToggle').setAttribute('aria-expanded',String(open));};
function closeQuick(){$('quickOptions').hidden=true;$('quickAdd').classList.remove('expanded');$('quickToggle').setAttribute('aria-expanded','false');}
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#quickAdd'))closeQuick();if(!e.target.closest('#clipMenu,.clip'))hideClipMenu();});
$('directMedia').onclick=()=>{$('directMediaInput').click();closeQuick();};$('directAudio').onclick=()=>{$('directAudioInput').click();closeQuick();};
$('fileInput').accept='image/*,video/*';$('dropZone').onclick=$('directMedia').onclick;
$('dockMedia').onclick=$('directMedia').onclick;$('directText').onclick=()=>{addText();closeQuick();editWord(current());};
$('directLogo').onclick=()=>{addText('text',true);closeQuick();};$('directEffects').onclick=()=>{closeQuick();openSheet('effects');};
$('directCaptions').onclick=()=>{closeQuick();openSheet('media','captions');};
let importingDirect=false;
importFiles=async function(files,kind){if(exporting||importingDirect)return;const list=[...files];if(!list.length)return;importingDirect=true;pause();checkpoint();let added=0;const audioAt=t;let audioCursor=audioAt;try{for(const file of list){const type=file.type.startsWith('image/')?'image':file.type.startsWith('video/')?'video':file.type.startsWith('audio/')?'audio':null;if(!type||(kind==='audio'&&type!=='audio')||(kind==='media'&&type==='audio')){toast('Tipo não aceito nesta opção: '+file.name);continue;}if(file.size>350*1024*1024){toast('Arquivo acima de 350 MB: '+file.name);continue;}try{const a={id:uid(),name:file.name,type,data:await readData(file)};await loadAsset(a);P.assets.push(a);const duration=type==='image'?5:Math.max(1/30,Math.floor(a.duration*30)/30),start=type==='audio'?audioCursor:mainClips().reduce((n,c)=>Math.max(n,c.start+c.duration),0),c=newClip(type,a.name,a.id,type==='audio'?'voice':'main',start,duration);P.clips.push(c);if(type==='audio')audioCursor+=duration;selected=c.id;t=start;added++;}catch(e){toast(e.message);}}changed();closeSheets();toast(added+' arquivo(s) na timeline.');}finally{importingDirect=false;}};
for(const [id,kind]of [['directMediaInput','media'],['directAudioInput','audio']])$(id).onchange=async e=>{await importFiles(e.target.files,kind);e.target.value='';};
// Hide all paths to the numeric inspector; retain its state for compatible saved projects.
$('dockEdit').hidden=true;$('inspectorToggle').hidden=true;
const openV4Sheet=openSheet;openSheet=function(kind,tab){if(kind==='edit')return;if(kind==='media'&&tab==='media'){ $('directMedia').click();return;}openV4Sheet(kind,tab);};
document.querySelectorAll('[data-tab="media"],[data-tab="text"]').forEach(el=>el.hidden=true);
let wordId=null;
function editWord(c){if(!c||!['text','subtitle'].includes(c.type)||exporting)return;pause();hideClipMenu();wordId=c.id;$('wordInput').value=c.text||'';$('wordDialog').showModal();$('wordInput').focus();}
$('saveWord').onclick=e=>{e.preventDefault();const c=P.clips.find(x=>x.id===wordId),text=$('wordInput').value.trim();if(!c)return $('wordDialog').close();if(!text)return toast('Digite o texto ou exclua a legenda.');act(()=>{c.text=text;c.name=text;});$('wordDialog').close();};
captionList=function(){const root=$('captionList');root.replaceChildren();for(const c of P.clips.filter(c=>c.type==='subtitle').sort((a,b)=>a.start-b.start)){const el=document.createElement('button');el.className='captionItem';el.textContent=fmt(c.start)+' · '+c.text;el.onclick=()=>{select(c.id,true);editWord(c);};root.append(el);}};
function textAt(e){const p=canvasPoint(e),[pw,ph]=dimensions();return visibleClips(t,true).filter(c=>['text','subtitle'].includes(c.type)).reverse().find(c=>{const v=valueAt(c.keys,clamp(t-c.start,0,c.duration)),a=-v.rotation*Math.PI/180,dx=p.x-pw/2-v.x,dy=p.y-ph/2-v.y,[w,h]=rectForClip(c);return Math.abs(dx*Math.cos(a)-dy*Math.sin(a))<=w*v.scale/200+20&&Math.abs(dx*Math.sin(a)+dy*Math.cos(a))<=h*v.scale/200+20;});}
// A stationary tap edits a word; dragging it moves it. No keyboard during a gesture.
let textTap=null;
beginGesture=function(e){hideClipMenu();cancelSnap();const hit=e.target.dataset.gesture?null:textAt(e);if(hit&&!gesturePointers.size){select(hit.id);textTap={id:hit.id,x:e.clientX,y:e.clientY,pointer:e.pointerId};}else if(gesturePointers.size)textTap=null;else if(!hit&&!e.target.dataset.gesture&&['text','subtitle'].includes(current()?.type)){const art=visibleClips(t).find(c=>c.track==='main');if(art)select(art.id);}V4.begin(e);};
$('preview').onpointerdown=beginGesture;$('selectionOverlay').onpointerdown=beginGesture;
window.addEventListener('pointermove',e=>{if(textTap&&Math.hypot(e.clientX-textTap.x,e.clientY-textTap.y)>7)textTap=null;});
window.addEventListener('pointerup',e=>{if(textTap&&textTap.pointer===e.pointerId){const c=P.clips.find(c=>c.id===textTap.id);textTap=null;editWord(c);}});
// Magnetic guides engage near centre/angles, with a wider release threshold.
let snapRAF=0,snapGeneration=0;
function cancelSnap(){snapGeneration++;cancelAnimationFrame(snapRAF);snapRAF=0;}
function fittedPose(c,v){const [pw,ph]=dimensions(),[w,h]=rectForClip(c),a=v.rotation*Math.PI/180,co=Math.abs(Math.cos(a)),si=Math.abs(Math.sin(a));return {...v,x:0,y:0,scale:Math.max(v.scale,100*Math.max((pw*co+ph*si)/w,(pw*si+ph*co)/h))};}
function settleFrame(c,idx){/* v30: preserve the user's manual transform. */}
window.removeEventListener('pointermove',moveGesture);window.removeEventListener('pointerup',endGesture);window.removeEventListener('pointercancel',endGesture);
moveGesture=function(e){if(!gesture)return;V4.move(e);const g=gesture,v=poseForEdit(g.c),r=$('preview').getBoundingClientRect(),threshold=8*dimensions()[0]/Math.max(r.width,1);if(g.mode==='pan'&&gesturePointers.size===1){const next={...v};if(Math.abs(v.x)<threshold)next.x=0;if(Math.abs(v.y)<threshold)next.y=0;transformClipFrom(g.c,g.c.keys,v,next,g.idx);}else{const nearest=Math.round(v.rotation/90)*90;if(Math.abs(v.rotation-nearest)<2.5){const next={...v,rotation:nearest};transformClipFrom(g.c,g.c.keys,v,next,g.idx);}}draw();};
endGesture=function(e){const g=gesture;if(g&&(g.mode!=='pan'||gesturePointers.size>1))g.fitAtEnd=true;V4.end(e);if(g?.fitAtEnd&&!gesture)settleFrame(g.c,g.idx);};
window.addEventListener('pointermove',moveGesture,{passive:false});window.addEventListener('pointerup',endGesture);window.addEventListener('pointercancel',e=>{cancelSnap();V4.end(e);});
let fitWheelTimer=null;$('preview').addEventListener('wheel',()=>{cancelSnap();clearTimeout(fitWheelTimer);const c=current(),idx=$('editScope').value==='key'?keyIndex:null;fitWheelTimer=setTimeout(()=>settleFrame(c,idx),230);},{passive:true});
const basePauseV4=pause;pause=function(){cancelSnap();basePauseV4();};
// Genuine 0–200% per-clip gain, shared by preview and recording.
const audioGainNodes=new Map();
initAudio=async function(){if(!audioCtx){audioCtx=new AudioContext();mixDest=audioCtx.createMediaStreamDestination();}if(audioCtx.state==='suspended')await audioCtx.resume();for(const a of P.assets.filter(a=>a.type!=='image')){const r=cache.get(a.id);if(!r)continue;if(!r.source)r.source=audioCtx.createMediaElementSource(r.el);if(audioGainNodes.has(a.id))continue;r.source.disconnect();const gain=audioCtx.createGain();r.source.connect(gain);gain.connect(audioCtx.destination);gain.connect(mixDest);audioGainNodes.set(a.id,gain);}syncMedia(true);};
const syncV4=syncMedia;syncMedia=function(force=false){syncV4(force);for(const a of P.assets.filter(a=>a.type!=='image')){const gain=audioGainNodes.get(a.id),r=cache.get(a.id);if(!gain||!r)continue;const c=P.clips.find(c=>c.asset===a.id&&activeClip(c,t)),value=c&&!c.muted?clamp((c.volume??100)/100,0,2):0;r.el.volume=1;gain.gain.setTargetAtTime(value,audioCtx.currentTime,.012);}};
let menuTimer=null,menuHold=false;
function hideClipMenu(){clearTimeout(menuTimer);$('clipMenu').hidden=true;}
function deferMenu(){clearTimeout(menuTimer);if(!menuHold)menuTimer=setTimeout(()=>{$('clipMenu').classList.add('fading');menuTimer=setTimeout(hideClipMenu,220);},3000);}
$('clipMenu').onpointerdown=()=>{menuHold=true;clearTimeout(menuTimer);$('clipMenu').classList.remove('fading');};window.addEventListener('pointerup',()=>{if(menuHold){menuHold=false;deferMenu();}});
function showClipMenu(c,x,y){pause();selected=c.id;const m=$('clipMenu');m.replaceChildren();m.hidden=false;m.classList.remove('fading');const action=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.onclick=()=>{fn();hideClipMenu();};m.append(b);};
 if(['audio','video'].includes(c.type)){const label=document.createElement('label');label.textContent='Volume ';const out=document.createElement('output');out.textContent=(c.volume??100)+'%';const slider=document.createElement('input');slider.type='range';slider.min=0;slider.max=200;slider.step=1;slider.value=c.volume??100;slider.setAttribute('aria-label','Volume de zero a duzentos por cento');let saved=false;slider.oninput=()=>{if(!saved){checkpoint();saved=true;}c.volume=Number(slider.value);c.muted=false;out.textContent=c.volume+'%';syncMedia();deferMenu();};slider.onchange=()=>{saved=false;changed();deferMenu();};label.append(out,slider);m.append(label);}
 if(['text','subtitle'].includes(c.type))action('Editar texto',()=>editWord(c));
 action('Duplicar',()=>$('duplicate').click());action('Excluir',()=>{selectedMany.clear();selected=c.id;deleteSelected();});
 if(t>c.start+1/30&&t<c.start+c.duration-1/30){action('Apagar antes do ponteiro',()=>trimAtPointer('before'));action('Apagar depois do ponteiro',()=>trimAtPointer('after'));}
 m.style.left=Math.max(8,Math.min(x-110,window.innerWidth-248))+'px';m.style.top=Math.max(8,Math.min(y-180,window.innerHeight-250))+'px';deferMenu();}
function trimAtPointer(side){const c=current();if(!c||t<=c.start||t>=c.start+c.duration)return toast('Coloque o ponteiro dentro do clip.');act(()=>{const at=snapFrame(t-c.start);if(side==='before')trimClip(c,at,c.duration);else trimClip(c,0,at);keyIndex=0;edgeFocus=null;});}
$('trimLeft').onclick=()=>trimAtPointer('before');$('trimRight').onclick=()=>trimAtPointer('after');$('trimLeft').textContent='⌫ Antes';$('trimRight').textContent='Depois ⌦';
// Generous cut handles; long-press menus must not compete with clip movement.
buildTimeline=function(){V4.build();for(const c of P.clips){const el=document.querySelector('.clip[data-id="'+c.id+'"]');if(!el)continue;for(const h of el.querySelectorAll('.handle')){h.textContent=h.dataset.handle==='left'?'[':']';h.setAttribute('aria-label',h.dataset.handle==='left'?'Ajustar início':'Ajustar fim');}const down=el.onpointerdown;el.onpointerdown=e=>{if(e.target.closest('.edgeKey,.handle')||e.ctrlKey||e.metaKey||$('selectMode').classList.contains('active'))return down(e);e.stopPropagation();if(exporting)return;const start={x:e.clientX,y:e.clientY},currentTarget=el;let dragging=false,held=false;const timer=setTimeout(()=>{held=true;showClipMenu(c,e.clientX,e.clientY);},450);const move=ev=>{if(Math.hypot(ev.clientX-start.x,ev.clientY-start.y)>7&&!held&&!dragging){dragging=true;clearTimeout(timer);down({button:0,clientX:start.x,clientY:start.y,currentTarget,target:el,stopPropagation(){}});}};const up=()=>{clearTimeout(timer);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);if(!dragging&&!held){select(c.id);draw();}};const cancel=()=>{held=true;up();};window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up,{once:true});window.addEventListener('pointercancel',cancel,{once:true});};el.ondblclick=()=>['text','subtitle'].includes(c.type)?editWord(c):showClipMenu(c,el.getBoundingClientRect().left,el.getBoundingClientRect().top);el.oncontextmenu=e=>{e.preventDefault();showClipMenu(c,e.clientX,e.clientY);};} };
// Drag the actual playhead. Timeline coordinates are refreshed as it scrolls.
function scrub(e){if(exporting||e.button>0)return;e.preventDefault();e.stopPropagation();pause();const move=ev=>{const s=$('timelineScroll'),r=s.getBoundingClientRect();if(ev.clientX>r.right-24)s.scrollLeft+=12;else if(ev.clientX<r.left+24)s.scrollLeft=Math.max(0,s.scrollLeft-12);const rr=$('ruler').getBoundingClientRect();edgeFocus=null;V3.seek(Math.max(0,(ev.clientX-rr.left)/pps));};move(e);const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);};window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up,{once:true});window.addEventListener('pointercancel',up,{once:true});}
$('playhead').onpointerdown=scrub;$('ruler').onpointerdown=scrub;
renderUI=function(full=true){V4.render(full);$('trimLeft').disabled=$('trimRight').disabled=!current()||t<=current().start||t>=current().start+current().duration;$('statusText').textContent='Arraste para editar · segure para opções';};
$('helpDialog').querySelector('.stack').insertAdjacentHTML('afterbegin','<p><b>Toque direto:</b> + abre mídia, áudio, legenda, texto, logo e efeito. Arquivos entram direto na timeline. Segure uma barra para duplicar/excluir ou ajustar o volume; toque numa legenda para corrigir. Arraste os colchetes para recortar e o ponteiro para navegar. Rotação e zoom ajustam o preenchimento ao terminar; arrastar depois libera a posição.</p>');
renderUI();

// touca-manual-v6: timeline-first editing. No director service or generated montage.
const M6={build:buildTimeline,render:renderUI,draw:drawTo,visible:visibleClips,inspector,transform:transformClipFrom,resetGesture:resetGestureBase,caption:makeCaption,pop:popPreset,menu:showClipMenu};
tracks.push('effects');
document.querySelector('.trackHeads').insertAdjacentHTML('beforeend','<div class="trackHead effects"><span></span> Efeito</div>');
$('timelineContent').insertAdjacentHTML('beforeend','<div class="track" data-track="effects"></div>');
document.querySelector('.timelineTools').insertAdjacentHTML('afterend',`<div class="manualStrip"><button id="effectDrag" title="Toque para adicionar; arraste até a timeline">✧ Efeito</button><button id="captionFocus" hidden title="Editar a legenda selecionada"></button><label id="captionSizeRow" hidden>Aa <input id="captionSizeAll" aria-label="Tamanho de todas as legendas" type="range" min="30" max="240" value="110"></label><span class="grow"></span><button id="zoomLess" aria-label="Diminuir zoom da timeline">−</button><button id="zoomMore" aria-label="Aumentar zoom da timeline">＋</button></div>`);
document.body.insertAdjacentHTML('beforeend',`<div id="effectGhost" hidden>✧ Ângulo amplo</div><dialog id="appSettings"><div class="row between"><h2>Seu Touca</h2><button id="closeAppSettings" aria-label="Fechar">×</button></div><p>Manual rápido · v6</p><div class="stack"><small id="pwaStatus">Touca Editor Desktop · v18.0.0 · aplicativo local</small></div></dialog>`);
const appSettingsButton=document.createElement('button');appSettingsButton.id='appSettingsButton';appSettingsButton.textContent='◉ App';document.querySelector('.topActions').prepend(appSettingsButton);appSettingsButton.onclick=()=>$('appSettings').showModal();$('closeAppSettings').onclick=()=>$('appSettings').close();
$('emptyStage').querySelector('h2').textContent='Seu corte. Seu ritmo.';
$('emptyStage').querySelector('p').textContent='Toque no + para começar. Arraste, enquadre e dê play.';
pps=100;$('timelineZoom').max=600;$('timelineZoom').value=pps;
function zoomManual(factor){const scroll=$('timelineScroll'),anchor=(scroll.scrollLeft+scroll.clientWidth/2)/pps;pps=clamp(pps*factor,10,600);$('timelineZoom').value=pps;buildTimeline();scroll.scrollLeft=Math.max(0,anchor*pps-scroll.clientWidth/2);}
$('zoomLess').onclick=()=>zoomManual(1/1.4);$('zoomMore').onclick=()=>zoomManual(1.4);

// Real PCM peaks, cached only in memory. Trimming reads the source offset, not a stretched drawing.
const waveCache=new Map();let waveRunning=false;
function pcmPeaks(buffer,rate=100){const count=Math.ceil(buffer.duration*rate),peaks=new Float32Array(count),channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));for(let b=0;b<count;b++){const first=Math.floor(b*buffer.sampleRate/rate),last=Math.min(buffer.length,Math.ceil((b+1)*buffer.sampleRate/rate));let peak=0;for(const data of channels)for(let i=first;i<last;i++)peak=Math.max(peak,Math.abs(data[i]));peaks[b]=peak;}return {rate,peaks,duration:buffer.duration};}
function waveAt(wave,from,to){let peak=0;for(let i=Math.max(0,Math.floor(from*wave.rate));i<Math.min(wave.peaks.length,Math.max(Math.floor(from*wave.rate)+1,Math.ceil(to*wave.rate)));i++)peak=Math.max(peak,wave.peaks[i]);return peak;}
async function queueWaveforms(){if(waveRunning||typeof AudioContext==='undefined')return;const a=P.assets.find(x=>['audio','video'].includes(x.type)&&x.data&&!waveCache.has(x.id));if(!a)return;waveRunning=true;waveCache.set(a.id,{loading:true});let ac;try{ac=new AudioContext();const data=await(await fetch(a.data)).arrayBuffer(),buffer=await ac.decodeAudioData(data);const wave=pcmPeaks(buffer);waveCache.set(a.id,wave);}catch{waveCache.set(a.id,{failed:true});}finally{if(ac)await ac.close().catch(()=>{});waveRunning=false;buildTimeline();}}
function paintWave(el,c,wave){const canvas=document.createElement('canvas');canvas.className='audioWave';canvas.width=Math.max(1,Math.min(2048,Math.round(c.duration*pps)));canvas.height=44;const g=canvas.getContext('2d');g.fillStyle='#c4f2cc';for(let x=0;x<canvas.width;x+=2){const from=(c.offset||0)+x/canvas.width*c.duration,to=(c.offset||0)+(x+2)/canvas.width*c.duration,amplitude=waveAt(wave,from,to)*19;g.fillRect(x,22-amplitude,1.5,Math.max(1,amplitude*2));}el.prepend(canvas);}

// Effects are ordinary editable timeline clips, excluded from the media compositor and runtime length.
total=function(){return Math.max(0,...P.clips.filter(c=>!c.brand&&c.type!=='effect').map(c=>c.start+c.duration));};
function migrateEffects(){if(P.effectTrackVersion)return;P.effectTrackVersion=1;if(P.lens?.enabled&&total()>0){const c=newClip('effect','Ângulo amplo',null,'effects',0,total());c.power=clamp(Number(P.lens.power)||0,0,100);c.enabled=true;P.clips.push(c);}P.lens={enabled:false,power:25};}
function effectAt(time){return P.clips.filter(c=>c.type==='effect'&&c.enabled!==false&&time>=c.start&&time<c.start+c.duration).sort((a,b)=>b.start-a.start)[0];}
visibleClips=function(time,editor=false){return M6.visible(time,editor).filter(c=>c.type!=='effect');};
drawTo=function(g,w,h,time){const old=P.lens,c=effectAt(Math.min(time,Math.max(0,total()-.00001)));P.lens={enabled:!!c,power:clamp(Number(c?.power)||0,0,100)};try{M6.draw(g,w,h,time);}finally{P.lens=old;}};
function addManualEffect(at=t){if(exporting)return;if(!total())return toast('Adicione uma imagem ou vídeo primeiro.');act(()=>{const start=clamp(snapFrame(at),0,Math.max(0,total()-1/30)),c=newClip('effect','Ângulo amplo',null,'effects',start,Math.min(5,total()-start));c.power=25;c.enabled=true;P.clips.push(c);selected=c.id;t=start;});openSheet('effects');}
function openManualEffect(){closeQuick();const c=current();if(c?.type!=='effect'){const active=effectAt(t);if(active)select(active.id);else return addManualEffect();}openSheet('effects');inspector();}
$('directEffects').onclick=openManualEffect;
$('effectDrag').onclick=()=>addManualEffect();
let effectDragged=false;
$('effectDrag').onpointerdown=e=>{if(e.button>0||exporting)return;e.preventDefault();const start={x:e.clientX,y:e.clientY},ghost=$('effectGhost');effectDragged=false;const move=ev=>{if(Math.hypot(ev.clientX-start.x,ev.clientY-start.y)<7&&!effectDragged)return;effectDragged=true;ghost.hidden=false;ghost.style.transform=`translate(${ev.clientX+12}px,${ev.clientY-24}px)`;document.querySelector('.timeline').classList.add('effectDropTarget');};const finish=ev=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',cancel);ghost.hidden=true;document.querySelector('.timeline').classList.remove('effectDropTarget');if(effectDragged){const r=$('timelineScroll').getBoundingClientRect();if(ev.clientX>=r.left&&ev.clientX<=r.right&&ev.clientY>=r.top-50&&ev.clientY<=r.bottom)addManualEffect(($('timelineScroll').scrollLeft+ev.clientX-r.left)/pps);}else if(ev.type!=='pointercancel')addManualEffect();};const cancel=ev=>{effectDragged=true;finish({...ev,clientX:-1,clientY:-1});};window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',cancel);};
$('effectDrag').onclick=e=>{if(e.detail===0)addManualEffect();};
inspector=function(){M6.inspector();const c=current(),isEffect=c?.type==='effect';$('lensEnabled').disabled=!isEffect;$('lensPower').disabled=!isEffect;$('lensEnabled').checked=isEffect&&c.enabled!==false;$('lensPower').value=isEffect?c.power??25:25;$('lensLabel').textContent=$('lensPower').value+'%';};
$('lensEnabled').onchange=e=>{if(current()?.type==='effect')act(()=>current().enabled=e.target.checked);};
let effectPowerEditing=false;
$('lensPower').oninput=e=>{const c=current();if(c?.type!=='effect'||exporting)return;if(!effectPowerEditing){checkpoint();effectPowerEditing=true;}c.power=clamp(Number(e.target.value)||0,0,100);$('lensLabel').textContent=c.power+'%';draw();};
$('lensPower').onchange=()=>{effectPowerEditing=false;changed();};
showClipMenu=function(c,x,y){M6.menu(c,x,y);if(c.type==='effect'){const b=document.createElement('button');b.textContent='✧ Potência do efeito';b.onclick=()=>{hideClipMenu();select(c.id);openSheet('effects');};$('clipMenu').prepend(b);}};

// One font-size style for all subtitles; retain each word's animated scale curve.
function setCaptionSize(size){size=clamp(Number(size)||110,12,500);P.captionStyle={...P.captionStyle,fontSize:size};for(const c of P.clips)if(c.type==='subtitle')c.fontSize=size;$('captionSizeAll').value=size;}
makeCaption=function(...args){const c=M6.caption(...args);c.fontSize=P.captionStyle?.fontSize||110;return c;};
popPreset=function(c){M6.pop(c);if(c.type==='subtitle')c.fontSize=P.captionStyle?.fontSize||110;};
resetGestureBase=function(){M6.resetGesture();if(gesture)gesture.captionBaseSize=gesture.c.fontSize||110;};
transformClipFrom=function(c,keys,base,next,idx){if(c.type==='effect')return;if(c.type==='subtitle'&&Math.abs(next.scale-base.scale)>.00001){const size=gesture?.c===c?(gesture.captionBaseSize||c.fontSize||110):(c.fontSize||110);setCaptionSize(size*next.scale/Math.max(.01,base.scale));next={...next,scale:base.scale};}M6.transform(c,keys,base,next,idx);};
const oldFontChange=$('fontSize').onchange;$('fontSize').onchange=e=>{if(current()?.type==='subtitle')act(()=>setCaptionSize(e.target.value));else oldFontChange(e);};
let captionSizing=false;
$('captionSizeAll').oninput=e=>{if(exporting)return;if(!captionSizing){checkpoint();captionSizing=true;}setCaptionSize(e.target.value);draw();};$('captionSizeAll').onchange=()=>{captionSizing=false;changed();};
$('captionFocus').onclick=()=>{if(current()?.type==='subtitle')editWord(current());};
function updateCaptionStrip(){const c=current(),cap=c?.type==='subtitle';$('captionFocus').hidden=!cap;$('captionSizeRow').hidden=!cap;if(cap){$('captionFocus').textContent=c.text||'Editar palavra';$('captionSizeAll').value=c.fontSize||110;}}
buildTimeline=function(){migrateEffects();M6.build();for(const c of P.clips){const el=document.querySelector(`.clip[data-id="${c.id}"]`);if(!el)continue;const label=el.querySelector('.clipLabel');if(c.type==='subtitle'){label.textContent=c.text;el.setAttribute('aria-label','Legenda: '+c.text);el.querySelectorAll('.edgeKey').forEach(k=>k.remove());}
 if(c.type==='effect'){el.querySelectorAll('.edgeKey,.clipKey').forEach(k=>k.remove());label.textContent='✧ Ângulo amplo · '+Math.round(c.power??25)+'%';el.ondblclick=()=>{select(c.id);openSheet('effects');};}
 if(['audio','video'].includes(c.type)){const wave=waveCache.get(c.asset);if(wave?.peaks)paintWave(el,c,wave);else if(c.type==='audio')label.textContent=c.name+(wave?.failed?' · onda indisponível':' · lendo onda…');}
 }updateCaptionStrip();const shown=[...document.querySelectorAll('.track')].filter(el=>!el.classList.contains('hiddenTrack')).length;$('app').style.setProperty('--timeline-height',Math.min(360,130+shown*58)+'px');queueWaveforms();};
renderUI=function(...args){migrateEffects();M6.render(...args);updateCaptionStrip();};

// Touca Desktop: no PWA/service worker/browser install layer.
if($('pwaStatus')) $('pwaStatus').textContent='Touca Editor Desktop · v18.0.0 · aplicativo local';

"use strict";
var Mp4Muxer = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __accessCheck = (obj, member, msg) => {
    if (!member.has(obj))
      throw TypeError("Cannot " + msg);
  };
  var __privateGet = (obj, member, getter) => {
    __accessCheck(obj, member, "read from private field");
    return getter ? getter.call(obj) : member.get(obj);
  };
  var __privateAdd = (obj, member, value) => {
    if (member.has(obj))
      throw TypeError("Cannot add the same private member more than once");
    member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
  };
  var __privateSet = (obj, member, value, setter) => {
    __accessCheck(obj, member, "write to private field");
    setter ? setter.call(obj, value) : member.set(obj, value);
    return value;
  };
  var __privateWrapper = (obj, member, setter, getter) => ({
    set _(value) {
      __privateSet(obj, member, value, setter);
    },
    get _() {
      return __privateGet(obj, member, getter);
    }
  });
  var __privateMethod = (obj, member, method) => {
    __accessCheck(obj, member, "access private method");
    return method;
  };

  // src/index.ts
  var src_exports = {};
  __export(src_exports, {
    ArrayBufferTarget: () => ArrayBufferTarget,
    FileSystemWritableFileStreamTarget: () => FileSystemWritableFileStreamTarget,
    Muxer: () => Muxer,
    StreamTarget: () => StreamTarget
  });

  // src/misc.ts
  var bytes = new Uint8Array(8);
  var view = new DataView(bytes.buffer);
  var u8 = (value) => {
    return [(value % 256 + 256) % 256];
  };
  var u16 = (value) => {
    view.setUint16(0, value, false);
    return [bytes[0], bytes[1]];
  };
  var i16 = (value) => {
    view.setInt16(0, value, false);
    return [bytes[0], bytes[1]];
  };
  var u24 = (value) => {
    view.setUint32(0, value, false);
    return [bytes[1], bytes[2], bytes[3]];
  };
  var u32 = (value) => {
    view.setUint32(0, value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3]];
  };
  var i32 = (value) => {
    view.setInt32(0, value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3]];
  };
  var u64 = (value) => {
    view.setUint32(0, Math.floor(value / 2 ** 32), false);
    view.setUint32(4, value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7]];
  };
  var fixed_8_8 = (value) => {
    view.setInt16(0, 2 ** 8 * value, false);
    return [bytes[0], bytes[1]];
  };
  var fixed_16_16 = (value) => {
    view.setInt32(0, 2 ** 16 * value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3]];
  };
  var fixed_2_30 = (value) => {
    view.setInt32(0, 2 ** 30 * value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3]];
  };
  var ascii = (text, nullTerminated = false) => {
    let bytes2 = Array(text.length).fill(null).map((_, i) => text.charCodeAt(i));
    if (nullTerminated)
      bytes2.push(0);
    return bytes2;
  };
  var last = (arr) => {
    return arr && arr[arr.length - 1];
  };
  var lastPresentedSample = (samples) => {
    let result = void 0;
    for (let sample of samples) {
      if (!result || sample.presentationTimestamp > result.presentationTimestamp) {
        result = sample;
      }
    }
    return result;
  };
  var intoTimescale = (timeInSeconds, timescale, round = true) => {
    let value = timeInSeconds * timescale;
    return round ? Math.round(value) : value;
  };
  var rotationMatrix = (rotationInDegrees) => {
    let theta = rotationInDegrees * (Math.PI / 180);
    let cosTheta = Math.cos(theta);
    let sinTheta = Math.sin(theta);
    return [
      cosTheta,
      sinTheta,
      0,
      -sinTheta,
      cosTheta,
      0,
      0,
      0,
      1
    ];
  };
  var IDENTITY_MATRIX = rotationMatrix(0);
  var matrixToBytes = (matrix) => {
    return [
      fixed_16_16(matrix[0]),
      fixed_16_16(matrix[1]),
      fixed_2_30(matrix[2]),
      fixed_16_16(matrix[3]),
      fixed_16_16(matrix[4]),
      fixed_2_30(matrix[5]),
      fixed_16_16(matrix[6]),
      fixed_16_16(matrix[7]),
      fixed_2_30(matrix[8])
    ];
  };
  var deepClone = (x) => {
    if (!x)
      return x;
    if (typeof x !== "object")
      return x;
    if (Array.isArray(x))
      return x.map(deepClone);
    return Object.fromEntries(Object.entries(x).map(([key, value]) => [key, deepClone(value)]));
  };
  var isU32 = (value) => {
    return value >= 0 && value < 2 ** 32;
  };

  // src/box.ts
  var box = (type, contents, children) => ({
    type,
    contents: contents && new Uint8Array(contents.flat(10)),
    children
  });
  var fullBox = (type, version, flags, contents, children) => box(
    type,
    [u8(version), u24(flags), contents ?? []],
    children
  );
  var ftyp = (details) => {
    let minorVersion = 512;
    if (details.fragmented)
      return box("ftyp", [
        ascii("iso5"),
        // Major brand
        u32(minorVersion),
        // Minor version
        // Compatible brands
        ascii("iso5"),
        ascii("iso6"),
        ascii("mp41")
      ]);
    return box("ftyp", [
      ascii("isom"),
      // Major brand
      u32(minorVersion),
      // Minor version
      // Compatible brands
      ascii("isom"),
      details.holdsAvc ? ascii("avc1") : [],
      ascii("mp41")
    ]);
  };
  var mdat = (reserveLargeSize) => ({ type: "mdat", largeSize: reserveLargeSize });
  var free = (size) => ({ type: "free", size });
  var moov = (tracks, creationTime, fragmented = false) => box("moov", null, [
    mvhd(creationTime, tracks),
    ...tracks.map((x) => trak(x, creationTime)),
    fragmented ? mvex(tracks) : null
  ]);
  var mvhd = (creationTime, tracks) => {
    let duration = intoTimescale(Math.max(
      0,
      ...tracks.filter((x) => x.samples.length > 0).map((x) => {
        const lastSample = lastPresentedSample(x.samples);
        return lastSample.presentationTimestamp + lastSample.duration;
      })
    ), GLOBAL_TIMESCALE);
    let nextTrackId = Math.max(...tracks.map((x) => x.id)) + 1;
    let needsU64 = !isU32(creationTime) || !isU32(duration);
    let u32OrU64 = needsU64 ? u64 : u32;
    return fullBox("mvhd", +needsU64, 0, [
      u32OrU64(creationTime),
      // Creation time
      u32OrU64(creationTime),
      // Modification time
      u32(GLOBAL_TIMESCALE),
      // Timescale
      u32OrU64(duration),
      // Duration
      fixed_16_16(1),
      // Preferred rate
      fixed_8_8(1),
      // Preferred volume
      Array(10).fill(0),
      // Reserved
      matrixToBytes(IDENTITY_MATRIX),
      // Matrix
      Array(24).fill(0),
      // Pre-defined
      u32(nextTrackId)
      // Next track ID
    ]);
  };
  var trak = (track, creationTime) => box("trak", null, [
    tkhd(track, creationTime),
    mdia(track, creationTime)
  ]);
  var tkhd = (track, creationTime) => {
    let lastSample = lastPresentedSample(track.samples);
    let durationInGlobalTimescale = intoTimescale(
      lastSample ? lastSample.presentationTimestamp + lastSample.duration : 0,
      GLOBAL_TIMESCALE
    );
    let needsU64 = !isU32(creationTime) || !isU32(durationInGlobalTimescale);
    let u32OrU64 = needsU64 ? u64 : u32;
    let matrix;
    if (track.info.type === "video") {
      matrix = typeof track.info.rotation === "number" ? rotationMatrix(track.info.rotation) : track.info.rotation;
    } else {
      matrix = IDENTITY_MATRIX;
    }
    return fullBox("tkhd", +needsU64, 3, [
      u32OrU64(creationTime),
      // Creation time
      u32OrU64(creationTime),
      // Modification time
      u32(track.id),
      // Track ID
      u32(0),
      // Reserved
      u32OrU64(durationInGlobalTimescale),
      // Duration
      Array(8).fill(0),
      // Reserved
      u16(0),
      // Layer
      u16(0),
      // Alternate group
      fixed_8_8(track.info.type === "audio" ? 1 : 0),
      // Volume
      u16(0),
      // Reserved
      matrixToBytes(matrix),
      // Matrix
      fixed_16_16(track.info.type === "video" ? track.info.width : 0),
      // Track width
      fixed_16_16(track.info.type === "video" ? track.info.height : 0)
      // Track height
    ]);
  };
  var mdia = (track, creationTime) => box("mdia", null, [
    mdhd(track, creationTime),
    hdlr(track.info.type === "video" ? "vide" : "soun"),
    minf(track)
  ]);
  var mdhd = (track, creationTime) => {
    let lastSample = lastPresentedSample(track.samples);
    let localDuration = intoTimescale(
      lastSample ? lastSample.presentationTimestamp + lastSample.duration : 0,
      track.timescale
    );
    let needsU64 = !isU32(creationTime) || !isU32(localDuration);
    let u32OrU64 = needsU64 ? u64 : u32;
    return fullBox("mdhd", +needsU64, 0, [
      u32OrU64(creationTime),
      // Creation time
      u32OrU64(creationTime),
      // Modification time
      u32(track.timescale),
      // Timescale
      u32OrU64(localDuration),
      // Duration
      u16(21956),
      // Language ("und", undetermined)
      u16(0)
      // Quality
    ]);
  };
  var hdlr = (componentSubtype) => fullBox("hdlr", 0, 0, [
    ascii("mhlr"),
    // Component type
    ascii(componentSubtype),
    // Component subtype
    u32(0),
    // Component manufacturer
    u32(0),
    // Component flags
    u32(0),
    // Component flags mask
    ascii("mp4-muxer-hdlr", true)
    // Component name
  ]);
  var minf = (track) => box("minf", null, [
    track.info.type === "video" ? vmhd() : smhd(),
    dinf(),
    stbl(track)
  ]);
  var vmhd = () => fullBox("vmhd", 0, 1, [
    u16(0),
    // Graphics mode
    u16(0),
    // Opcolor R
    u16(0),
    // Opcolor G
    u16(0)
    // Opcolor B
  ]);
  var smhd = () => fullBox("smhd", 0, 0, [
    u16(0),
    // Balance
    u16(0)
    // Reserved
  ]);
  var dinf = () => box("dinf", null, [
    dref()
  ]);
  var dref = () => fullBox("dref", 0, 0, [
    u32(1)
    // Entry count
  ], [
    url()
  ]);
  var url = () => fullBox("url ", 0, 1);
  var stbl = (track) => {
    const needsCtts = track.compositionTimeOffsetTable.length > 1 || track.compositionTimeOffsetTable.some((x) => x.sampleCompositionTimeOffset !== 0);
    return box("stbl", null, [
      stsd(track),
      stts(track),
      stss(track),
      stsc(track),
      stsz(track),
      stco(track),
      needsCtts ? ctts(track) : null
    ]);
  };
  var stsd = (track) => fullBox("stsd", 0, 0, [
    u32(1)
    // Entry count
  ], [
    track.info.type === "video" ? videoSampleDescription(
      VIDEO_CODEC_TO_BOX_NAME[track.info.codec],
      track
    ) : soundSampleDescription(
      AUDIO_CODEC_TO_BOX_NAME[track.info.codec],
      track
    )
  ]);
  var videoSampleDescription = (compressionType, track) => box(compressionType, [
    Array(6).fill(0),
    // Reserved
    u16(1),
    // Data reference index
    u16(0),
    // Pre-defined
    u16(0),
    // Reserved
    Array(12).fill(0),
    // Pre-defined
    u16(track.info.width),
    // Width
    u16(track.info.height),
    // Height
    u32(4718592),
    // Horizontal resolution
    u32(4718592),
    // Vertical resolution
    u32(0),
    // Reserved
    u16(1),
    // Frame count
    Array(32).fill(0),
    // Compressor name
    u16(24),
    // Depth
    i16(65535)
    // Pre-defined
  ], [
    VIDEO_CODEC_TO_CONFIGURATION_BOX[track.info.codec](track),
    track.info.decoderConfig.colorSpace ? colr(track) : null
  ]);
  var COLOR_PRIMARIES_MAP = {
    "bt709": 1,
    // ITU-R BT.709
    "bt470bg": 5,
    // ITU-R BT.470BG
    "smpte170m": 6
    // ITU-R BT.601 525 - SMPTE 170M
  };
  var TRANSFER_CHARACTERISTICS_MAP = {
    "bt709": 1,
    // ITU-R BT.709
    "smpte170m": 6,
    // SMPTE 170M
    "iec61966-2-1": 13
    // IEC 61966-2-1
  };
  var MATRIX_COEFFICIENTS_MAP = {
    "rgb": 0,
    // Identity
    "bt709": 1,
    // ITU-R BT.709
    "bt470bg": 5,
    // ITU-R BT.470BG
    "smpte170m": 6
    // SMPTE 170M
  };
  var colr = (track) => box("colr", [
    ascii("nclx"),
    // Colour type
    u16(COLOR_PRIMARIES_MAP[track.info.decoderConfig.colorSpace.primaries]),
    // Colour primaries
    u16(TRANSFER_CHARACTERISTICS_MAP[track.info.decoderConfig.colorSpace.transfer]),
    // Transfer characteristics
    u16(MATRIX_COEFFICIENTS_MAP[track.info.decoderConfig.colorSpace.matrix]),
    // Matrix coefficients
    u8((track.info.decoderConfig.colorSpace.fullRange ? 1 : 0) << 7)
    // Full range flag
  ]);
  var avcC = (track) => track.info.decoderConfig && box("avcC", [
    // For AVC, description is an AVCDecoderConfigurationRecord, so nothing else to do here
    ...new Uint8Array(track.info.decoderConfig.description)
  ]);
  var hvcC = (track) => track.info.decoderConfig && box("hvcC", [
    // For HEVC, description is a HEVCDecoderConfigurationRecord, so nothing else to do here
    ...new Uint8Array(track.info.decoderConfig.description)
  ]);
  var vpcC = (track) => {
    if (!track.info.decoderConfig) {
      return null;
    }
    let decoderConfig = track.info.decoderConfig;
    if (!decoderConfig.colorSpace) {
      throw new Error(`'colorSpace' is required in the decoder config for VP9.`);
    }
    let parts = decoderConfig.codec.split(".");
    let profile = Number(parts[1]);
    let level = Number(parts[2]);
    let bitDepth = Number(parts[3]);
    let chromaSubsampling = 0;
    let thirdByte = (bitDepth << 4) + (chromaSubsampling << 1) + Number(decoderConfig.colorSpace.fullRange);
    let colourPrimaries = 2;
    let transferCharacteristics = 2;
    let matrixCoefficients = 2;
    return fullBox("vpcC", 1, 0, [
      u8(profile),
      // Profile
      u8(level),
      // Level
      u8(thirdByte),
      // Bit depth, chroma subsampling, full range
      u8(colourPrimaries),
      // Colour primaries
      u8(transferCharacteristics),
      // Transfer characteristics
      u8(matrixCoefficients),
      // Matrix coefficients
      u16(0)
      // Codec initialization data size
    ]);
  };
  var av1C = () => {
    let marker = 1;
    let version = 1;
    let firstByte = (marker << 7) + version;
    return box("av1C", [
      firstByte,
      0,
      0,
      0
    ]);
  };
  var soundSampleDescription = (compressionType, track) => box(compressionType, [
    Array(6).fill(0),
    // Reserved
    u16(1),
    // Data reference index
    u16(0),
    // Version
    u16(0),
    // Revision level
    u32(0),
    // Vendor
    u16(track.info.numberOfChannels),
    // Number of channels
    u16(16),
    // Sample size (bits)
    u16(0),
    // Compression ID
    u16(0),
    // Packet size
    fixed_16_16(track.info.sampleRate)
    // Sample rate
  ], [
    AUDIO_CODEC_TO_CONFIGURATION_BOX[track.info.codec](track)
  ]);
  var esds = (track) => {
    let description = new Uint8Array(track.info.decoderConfig.description);
    return fullBox("esds", 0, 0, [
      // https://stackoverflow.com/a/54803118
      u32(58753152),
      // TAG(3) = Object Descriptor ([2])
      u8(32 + description.byteLength),
      // length of this OD (which includes the next 2 tags)
      u16(1),
      // ES_ID = 1
      u8(0),
      // flags etc = 0
      u32(75530368),
      // TAG(4) = ES Descriptor ([2]) embedded in above OD
      u8(18 + description.byteLength),
      // length of this ESD
      u8(64),
      // MPEG-4 Audio
      u8(21),
      // stream type(6bits)=5 audio, flags(2bits)=1
      u24(0),
      // 24bit buffer size
      u32(130071),
      // max bitrate
      u32(130071),
      // avg bitrate
      u32(92307584),
      // TAG(5) = ASC ([2],[3]) embedded in above OD
      u8(description.byteLength),
      // length
      ...description,
      u32(109084800),
      // TAG(6)
      u8(1),
      // length
      u8(2)
      // data
    ]);
  };
  var dOps = (track) => {
    let preskip = 3840;
    let gain = 0;
    const description = track.info.decoderConfig?.description;
    if (description) {
      if (description.byteLength < 18) {
        throw new TypeError("Invalid decoder description provided for Opus; must be at least 18 bytes long.");
      }
      const view2 = ArrayBuffer.isView(description) ? new DataView(description.buffer, description.byteOffset, description.byteLength) : new DataView(description);
      preskip = view2.getUint16(10, true);
      gain = view2.getInt16(14, true);
    }
    return box("dOps", [
      u8(0),
      // Version
      u8(track.info.numberOfChannels),
      // OutputChannelCount
      u16(preskip),
      u32(track.info.sampleRate),
      // InputSampleRate
      fixed_8_8(gain),
      // OutputGain
      u8(0)
      // ChannelMappingFamily
    ]);
  };
  var stts = (track) => {
    return fullBox("stts", 0, 0, [
      u32(track.timeToSampleTable.length),
      // Number of entries
      track.timeToSampleTable.map((x) => [
        // Time-to-sample table
        u32(x.sampleCount),
        // Sample count
        u32(x.sampleDelta)
        // Sample duration
      ])
    ]);
  };
  var stss = (track) => {
    if (track.samples.every((x) => x.type === "key"))
      return null;
    let keySamples = [...track.samples.entries()].filter(([, sample]) => sample.type === "key");
    return fullBox("stss", 0, 0, [
      u32(keySamples.length),
      // Number of entries
      keySamples.map(([index]) => u32(index + 1))
      // Sync sample table
    ]);
  };
  var stsc = (track) => {
    return fullBox("stsc", 0, 0, [
      u32(track.compactlyCodedChunkTable.length),
      // Number of entries
      track.compactlyCodedChunkTable.map((x) => [
        // Sample-to-chunk table
        u32(x.firstChunk),
        // First chunk
        u32(x.samplesPerChunk),
        // Samples per chunk
        u32(1)
        // Sample description index
      ])
    ]);
  };
  var stsz = (track) => fullBox("stsz", 0, 0, [
    u32(0),
    // Sample size (0 means non-constant size)
    u32(track.samples.length),
    // Number of entries
    track.samples.map((x) => u32(x.size))
    // Sample size table
  ]);
  var stco = (track) => {
    if (track.finalizedChunks.length > 0 && last(track.finalizedChunks).offset >= 2 ** 32) {
      return fullBox("co64", 0, 0, [
        u32(track.finalizedChunks.length),
        // Number of entries
        track.finalizedChunks.map((x) => u64(x.offset))
        // Chunk offset table
      ]);
    }
    return fullBox("stco", 0, 0, [
      u32(track.finalizedChunks.length),
      // Number of entries
      track.finalizedChunks.map((x) => u32(x.offset))
      // Chunk offset table
    ]);
  };
  var ctts = (track) => {
    return fullBox("ctts", 0, 0, [
      u32(track.compositionTimeOffsetTable.length),
      // Number of entries
      track.compositionTimeOffsetTable.map((x) => [
        // Time-to-sample table
        u32(x.sampleCount),
        // Sample count
        u32(x.sampleCompositionTimeOffset)
        // Sample offset
      ])
    ]);
  };
  var mvex = (tracks) => {
    return box("mvex", null, tracks.map(trex));
  };
  var trex = (track) => {
    return fullBox("trex", 0, 0, [
      u32(track.id),
      // Track ID
      u32(1),
      // Default sample description index
      u32(0),
      // Default sample duration
      u32(0),
      // Default sample size
      u32(0)
      // Default sample flags
    ]);
  };
  var moof = (sequenceNumber, tracks) => {
    return box("moof", null, [
      mfhd(sequenceNumber),
      ...tracks.map(traf)
    ]);
  };
  var mfhd = (sequenceNumber) => {
    return fullBox("mfhd", 0, 0, [
      u32(sequenceNumber)
      // Sequence number
    ]);
  };
  var fragmentSampleFlags = (sample) => {
    let byte1 = 0;
    let byte2 = 0;
    let byte3 = 0;
    let byte4 = 0;
    let sampleIsDifferenceSample = sample.type === "delta";
    byte2 |= +sampleIsDifferenceSample;
    if (sampleIsDifferenceSample) {
      byte1 |= 1;
    } else {
      byte1 |= 2;
    }
    return byte1 << 24 | byte2 << 16 | byte3 << 8 | byte4;
  };
  var traf = (track) => {
    return box("traf", null, [
      tfhd(track),
      tfdt(track),
      trun(track)
    ]);
  };
  var tfhd = (track) => {
    let tfFlags = 0;
    tfFlags |= 8;
    tfFlags |= 16;
    tfFlags |= 32;
    tfFlags |= 131072;
    let referenceSample = track.currentChunk.samples[1] ?? track.currentChunk.samples[0];
    let referenceSampleInfo = {
      duration: referenceSample.timescaleUnitsToNextSample,
      size: referenceSample.size,
      flags: fragmentSampleFlags(referenceSample)
    };
    return fullBox("tfhd", 0, tfFlags, [
      u32(track.id),
      // Track ID
      u32(referenceSampleInfo.duration),
      // Default sample duration
      u32(referenceSampleInfo.size),
      // Default sample size
      u32(referenceSampleInfo.flags)
      // Default sample flags
    ]);
  };
  var tfdt = (track) => {
    return fullBox("tfdt", 1, 0, [
      u64(intoTimescale(track.currentChunk.startTimestamp, track.timescale))
      // Base Media Decode Time
    ]);
  };
  var trun = (track) => {
    let allSampleDurations = track.currentChunk.samples.map((x) => x.timescaleUnitsToNextSample);
    let allSampleSizes = track.currentChunk.samples.map((x) => x.size);
    let allSampleFlags = track.currentChunk.samples.map(fragmentSampleFlags);
    let allSampleCompositionTimeOffsets = track.currentChunk.samples.map((x) => intoTimescale(x.presentationTimestamp - x.decodeTimestamp, track.timescale));
    let uniqueSampleDurations = new Set(allSampleDurations);
    let uniqueSampleSizes = new Set(allSampleSizes);
    let uniqueSampleFlags = new Set(allSampleFlags);
    let uniqueSampleCompositionTimeOffsets = new Set(allSampleCompositionTimeOffsets);
    let firstSampleFlagsPresent = uniqueSampleFlags.size === 2 && allSampleFlags[0] !== allSampleFlags[1];
    let sampleDurationPresent = uniqueSampleDurations.size > 1;
    let sampleSizePresent = uniqueSampleSizes.size > 1;
    let sampleFlagsPresent = !firstSampleFlagsPresent && uniqueSampleFlags.size > 1;
    let sampleCompositionTimeOffsetsPresent = uniqueSampleCompositionTimeOffsets.size > 1 || [...uniqueSampleCompositionTimeOffsets].some((x) => x !== 0);
    let flags = 0;
    flags |= 1;
    flags |= 4 * +firstSampleFlagsPresent;
    flags |= 256 * +sampleDurationPresent;
    flags |= 512 * +sampleSizePresent;
    flags |= 1024 * +sampleFlagsPresent;
    flags |= 2048 * +sampleCompositionTimeOffsetsPresent;
    return fullBox("trun", 1, flags, [
      u32(track.currentChunk.samples.length),
      // Sample count
      u32(track.currentChunk.offset - track.currentChunk.moofOffset || 0),
      // Data offset
      firstSampleFlagsPresent ? u32(allSampleFlags[0]) : [],
      track.currentChunk.samples.map((_, i) => [
        sampleDurationPresent ? u32(allSampleDurations[i]) : [],
        // Sample duration
        sampleSizePresent ? u32(allSampleSizes[i]) : [],
        // Sample size
        sampleFlagsPresent ? u32(allSampleFlags[i]) : [],
        // Sample flags
        // Sample composition time offsets
        sampleCompositionTimeOffsetsPresent ? i32(allSampleCompositionTimeOffsets[i]) : []
      ])
    ]);
  };
  var mfra = (tracks) => {
    return box("mfra", null, [
      ...tracks.map(tfra),
      mfro()
    ]);
  };
  var tfra = (track, trackIndex) => {
    let version = 1;
    return fullBox("tfra", version, 0, [
      u32(track.id),
      // Track ID
      u32(63),
      // This specifies that traf number, trun number and sample number are 32-bit ints
      u32(track.finalizedChunks.length),
      // Number of entries
      track.finalizedChunks.map((chunk) => [
        u64(intoTimescale(chunk.startTimestamp, track.timescale)),
        // Time
        u64(chunk.moofOffset),
        // moof offset
        u32(trackIndex + 1),
        // traf number
        u32(1),
        // trun number
        u32(1)
        // Sample number
      ])
    ]);
  };
  var mfro = () => {
    return fullBox("mfro", 0, 0, [
      // This value needs to be overwritten manually from the outside, where the actual size of the enclosing mfra box
      // is known
      u32(0)
      // Size
    ]);
  };
  var VIDEO_CODEC_TO_BOX_NAME = {
    "avc": "avc1",
    "hevc": "hvc1",
    "vp9": "vp09",
    "av1": "av01"
  };
  var VIDEO_CODEC_TO_CONFIGURATION_BOX = {
    "avc": avcC,
    "hevc": hvcC,
    "vp9": vpcC,
    "av1": av1C
  };
  var AUDIO_CODEC_TO_BOX_NAME = {
    "aac": "mp4a",
    "opus": "Opus"
  };
  var AUDIO_CODEC_TO_CONFIGURATION_BOX = {
    "aac": esds,
    "opus": dOps
  };

  // src/target.ts
  var isTarget = Symbol("isTarget");
  var Target = class {
  };
  isTarget;
  var ArrayBufferTarget = class extends Target {
    constructor() {
      super(...arguments);
      this.buffer = null;
    }
  };
  var StreamTarget = class extends Target {
    constructor(options) {
      super();
      this.options = options;
      if (typeof options !== "object") {
        throw new TypeError("StreamTarget requires an options object to be passed to its constructor.");
      }
      if (options.onData) {
        if (typeof options.onData !== "function") {
          throw new TypeError("options.onData, when provided, must be a function.");
        }
        if (options.onData.length < 2) {
          throw new TypeError(
            "options.onData, when provided, must be a function that takes in at least two arguments (data and position). Ignoring the position argument, which specifies the byte offset at which the data is to be written, can lead to broken outputs."
          );
        }
      }
      if (options.chunked !== void 0 && typeof options.chunked !== "boolean") {
        throw new TypeError("options.chunked, when provided, must be a boolean.");
      }
      if (options.chunkSize !== void 0 && (!Number.isInteger(options.chunkSize) || options.chunkSize < 1024)) {
        throw new TypeError("options.chunkSize, when provided, must be an integer and not smaller than 1024.");
      }
    }
  };
  var FileSystemWritableFileStreamTarget = class extends Target {
    constructor(stream, options) {
      super();
      this.stream = stream;
      this.options = options;
      if (!(stream instanceof FileSystemWritableFileStream)) {
        throw new TypeError("FileSystemWritableFileStreamTarget requires a FileSystemWritableFileStream instance.");
      }
      if (options !== void 0 && typeof options !== "object") {
        throw new TypeError("FileSystemWritableFileStreamTarget's options, when provided, must be an object.");
      }
      if (options) {
        if (options.chunkSize !== void 0 && (!Number.isInteger(options.chunkSize) || options.chunkSize <= 0)) {
          throw new TypeError("options.chunkSize, when provided, must be a positive integer");
        }
      }
    }
  };

  // src/writer.ts
  var _helper, _helperView;
  var Writer = class {
    constructor() {
      this.pos = 0;
      __privateAdd(this, _helper, new Uint8Array(8));
      __privateAdd(this, _helperView, new DataView(__privateGet(this, _helper).buffer));
      /**
       * Stores the position from the start of the file to where boxes elements have been written. This is used to
       * rewrite/edit elements that were already added before, and to measure sizes of things.
       */
      this.offsets = /* @__PURE__ */ new WeakMap();
    }
    /** Sets the current position for future writes to a new one. */
    seek(newPos) {
      this.pos = newPos;
    }
    writeU32(value) {
      __privateGet(this, _helperView).setUint32(0, value, false);
      this.write(__privateGet(this, _helper).subarray(0, 4));
    }
    writeU64(value) {
      __privateGet(this, _helperView).setUint32(0, Math.floor(value / 2 ** 32), false);
      __privateGet(this, _helperView).setUint32(4, value, false);
      this.write(__privateGet(this, _helper).subarray(0, 8));
    }
    writeAscii(text) {
      for (let i = 0; i < text.length; i++) {
        __privateGet(this, _helperView).setUint8(i % 8, text.charCodeAt(i));
        if (i % 8 === 7)
          this.write(__privateGet(this, _helper));
      }
      if (text.length % 8 !== 0) {
        this.write(__privateGet(this, _helper).subarray(0, text.length % 8));
      }
    }
    writeBox(box2) {
      this.offsets.set(box2, this.pos);
      if (box2.contents && !box2.children) {
        this.writeBoxHeader(box2, box2.size ?? box2.contents.byteLength + 8);
        this.write(box2.contents);
      } else {
        let startPos = this.pos;
        this.writeBoxHeader(box2, 0);
        if (box2.contents)
          this.write(box2.contents);
        if (box2.children) {
          for (let child of box2.children)
            if (child)
              this.writeBox(child);
        }
        let endPos = this.pos;
        let size = box2.size ?? endPos - startPos;
        this.seek(startPos);
        this.writeBoxHeader(box2, size);
        this.seek(endPos);
      }
    }
    writeBoxHeader(box2, size) {
      this.writeU32(box2.largeSize ? 1 : size);
      this.writeAscii(box2.type);
      if (box2.largeSize)
        this.writeU64(size);
    }
    measureBoxHeader(box2) {
      return 8 + (box2.largeSize ? 8 : 0);
    }
    patchBox(box2) {
      let endPos = this.pos;
      this.seek(this.offsets.get(box2));
      this.writeBox(box2);
      this.seek(endPos);
    }
    measureBox(box2) {
      if (box2.contents && !box2.children) {
        let headerSize = this.measureBoxHeader(box2);
        return headerSize + box2.contents.byteLength;
      } else {
        let result = this.measureBoxHeader(box2);
        if (box2.contents)
          result += box2.contents.byteLength;
        if (box2.children) {
          for (let child of box2.children)
            if (child)
              result += this.measureBox(child);
        }
        return result;
      }
    }
  };
  _helper = new WeakMap();
  _helperView = new WeakMap();
  var _target, _buffer, _bytes, _maxPos, _ensureSize, ensureSize_fn;
  var ArrayBufferTargetWriter = class extends Writer {
    constructor(target) {
      super();
      __privateAdd(this, _ensureSize);
      __privateAdd(this, _target, void 0);
      __privateAdd(this, _buffer, new ArrayBuffer(2 ** 16));
      __privateAdd(this, _bytes, new Uint8Array(__privateGet(this, _buffer)));
      __privateAdd(this, _maxPos, 0);
      __privateSet(this, _target, target);
    }
    write(data) {
      __privateMethod(this, _ensureSize, ensureSize_fn).call(this, this.pos + data.byteLength);
      __privateGet(this, _bytes).set(data, this.pos);
      this.pos += data.byteLength;
      __privateSet(this, _maxPos, Math.max(__privateGet(this, _maxPos), this.pos));
    }
    finalize() {
      __privateMethod(this, _ensureSize, ensureSize_fn).call(this, this.pos);
      __privateGet(this, _target).buffer = __privateGet(this, _buffer).slice(0, Math.max(__privateGet(this, _maxPos), this.pos));
    }
  };
  _target = new WeakMap();
  _buffer = new WeakMap();
  _bytes = new WeakMap();
  _maxPos = new WeakMap();
  _ensureSize = new WeakSet();
  ensureSize_fn = function(size) {
    let newLength = __privateGet(this, _buffer).byteLength;
    while (newLength < size)
      newLength *= 2;
    if (newLength === __privateGet(this, _buffer).byteLength)
      return;
    let newBuffer = new ArrayBuffer(newLength);
    let newBytes = new Uint8Array(newBuffer);
    newBytes.set(__privateGet(this, _bytes), 0);
    __privateSet(this, _buffer, newBuffer);
    __privateSet(this, _bytes, newBytes);
  };
  var DEFAULT_CHUNK_SIZE = 2 ** 24;
  var MAX_CHUNKS_AT_ONCE = 2;
  var _target2, _sections, _chunked, _chunkSize, _chunks, _writeDataIntoChunks, writeDataIntoChunks_fn, _insertSectionIntoChunk, insertSectionIntoChunk_fn, _createChunk, createChunk_fn, _flushChunks, flushChunks_fn;
  var StreamTargetWriter = class extends Writer {
    constructor(target) {
      super();
      __privateAdd(this, _writeDataIntoChunks);
      __privateAdd(this, _insertSectionIntoChunk);
      __privateAdd(this, _createChunk);
      __privateAdd(this, _flushChunks);
      __privateAdd(this, _target2, void 0);
      __privateAdd(this, _sections, []);
      __privateAdd(this, _chunked, void 0);
      __privateAdd(this, _chunkSize, void 0);
      /**
       * The data is divided up into fixed-size chunks, whose contents are first filled in RAM and then flushed out.
       * A chunk is flushed if all of its contents have been written.
       */
      __privateAdd(this, _chunks, []);
      __privateSet(this, _target2, target);
      __privateSet(this, _chunked, target.options?.chunked ?? false);
      __privateSet(this, _chunkSize, target.options?.chunkSize ?? DEFAULT_CHUNK_SIZE);
    }
    write(data) {
      __privateGet(this, _sections).push({
        data: data.slice(),
        start: this.pos
      });
      this.pos += data.byteLength;
    }
    flush() {
      if (__privateGet(this, _sections).length === 0)
        return;
      let chunks = [];
      let sorted = [...__privateGet(this, _sections)].sort((a, b) => a.start - b.start);
      chunks.push({
        start: sorted[0].start,
        size: sorted[0].data.byteLength
      });
      for (let i = 1; i < sorted.length; i++) {
        let lastChunk = chunks[chunks.length - 1];
        let section = sorted[i];
        if (section.start <= lastChunk.start + lastChunk.size) {
          lastChunk.size = Math.max(lastChunk.size, section.start + section.data.byteLength - lastChunk.start);
        } else {
          chunks.push({
            start: section.start,
            size: section.data.byteLength
          });
        }
      }
      for (let chunk of chunks) {
        chunk.data = new Uint8Array(chunk.size);
        for (let section of __privateGet(this, _sections)) {
          if (chunk.start <= section.start && section.start < chunk.start + chunk.size) {
            chunk.data.set(section.data, section.start - chunk.start);
          }
        }
        if (__privateGet(this, _chunked)) {
          __privateMethod(this, _writeDataIntoChunks, writeDataIntoChunks_fn).call(this, chunk.data, chunk.start);
          __privateMethod(this, _flushChunks, flushChunks_fn).call(this);
        } else {
          __privateGet(this, _target2).options.onData?.(chunk.data, chunk.start);
        }
      }
      __privateGet(this, _sections).length = 0;
    }
    finalize() {
      if (__privateGet(this, _chunked)) {
        __privateMethod(this, _flushChunks, flushChunks_fn).call(this, true);
      }
    }
  };
  _target2 = new WeakMap();
  _sections = new WeakMap();
  _chunked = new WeakMap();
  _chunkSize = new WeakMap();
  _chunks = new WeakMap();
  _writeDataIntoChunks = new WeakSet();
  writeDataIntoChunks_fn = function(data, position) {
    let chunkIndex = __privateGet(this, _chunks).findIndex((x) => x.start <= position && position < x.start + __privateGet(this, _chunkSize));
    if (chunkIndex === -1)
      chunkIndex = __privateMethod(this, _createChunk, createChunk_fn).call(this, position);
    let chunk = __privateGet(this, _chunks)[chunkIndex];
    let relativePosition = position - chunk.start;
    let toWrite = data.subarray(0, Math.min(__privateGet(this, _chunkSize) - relativePosition, data.byteLength));
    chunk.data.set(toWrite, relativePosition);
    let section = {
      start: relativePosition,
      end: relativePosition + toWrite.byteLength
    };
    __privateMethod(this, _insertSectionIntoChunk, insertSectionIntoChunk_fn).call(this, chunk, section);
    if (chunk.written[0].start === 0 && chunk.written[0].end === __privateGet(this, _chunkSize)) {
      chunk.shouldFlush = true;
    }
    if (__privateGet(this, _chunks).length > MAX_CHUNKS_AT_ONCE) {
      for (let i = 0; i < __privateGet(this, _chunks).length - 1; i++) {
        __privateGet(this, _chunks)[i].shouldFlush = true;
      }
      __privateMethod(this, _flushChunks, flushChunks_fn).call(this);
    }
    if (toWrite.byteLength < data.byteLength) {
      __privateMethod(this, _writeDataIntoChunks, writeDataIntoChunks_fn).call(this, data.subarray(toWrite.byteLength), position + toWrite.byteLength);
    }
  };
  _insertSectionIntoChunk = new WeakSet();
  insertSectionIntoChunk_fn = function(chunk, section) {
    let low = 0;
    let high = chunk.written.length - 1;
    let index = -1;
    while (low <= high) {
      let mid = Math.floor(low + (high - low + 1) / 2);
      if (chunk.written[mid].start <= section.start) {
        low = mid + 1;
        index = mid;
      } else {
        high = mid - 1;
      }
    }
    chunk.written.splice(index + 1, 0, section);
    if (index === -1 || chunk.written[index].end < section.start)
      index++;
    while (index < chunk.written.length - 1 && chunk.written[index].end >= chunk.written[index + 1].start) {
      chunk.written[index].end = Math.max(chunk.written[index].end, chunk.written[index + 1].end);
      chunk.written.splice(index + 1, 1);
    }
  };
  _createChunk = new WeakSet();
  createChunk_fn = function(includesPosition) {
    let start = Math.floor(includesPosition / __privateGet(this, _chunkSize)) * __privateGet(this, _chunkSize);
    let chunk = {
      start,
      data: new Uint8Array(__privateGet(this, _chunkSize)),
      written: [],
      shouldFlush: false
    };
    __privateGet(this, _chunks).push(chunk);
    __privateGet(this, _chunks).sort((a, b) => a.start - b.start);
    return __privateGet(this, _chunks).indexOf(chunk);
  };
  _flushChunks = new WeakSet();
  flushChunks_fn = function(force = false) {
    for (let i = 0; i < __privateGet(this, _chunks).length; i++) {
      let chunk = __privateGet(this, _chunks)[i];
      if (!chunk.shouldFlush && !force)
        continue;
      for (let section of chunk.written) {
        __privateGet(this, _target2).options.onData?.(
          chunk.data.subarray(section.start, section.end),
          chunk.start + section.start
        );
      }
      __privateGet(this, _chunks).splice(i--, 1);
    }
  };
  var FileSystemWritableFileStreamTargetWriter = class extends StreamTargetWriter {
    constructor(target) {
      super(new StreamTarget({
        onData: (data, position) => target.stream.write({
          type: "write",
          data,
          position
        }),
        chunked: true,
        chunkSize: target.options?.chunkSize
      }));
    }
  };

  // src/muxer.ts
  var GLOBAL_TIMESCALE = 1e3;
  var SUPPORTED_VIDEO_CODECS = ["avc", "hevc", "vp9", "av1"];
  var SUPPORTED_AUDIO_CODECS = ["aac", "opus"];
  var TIMESTAMP_OFFSET = 2082844800;
  var FIRST_TIMESTAMP_BEHAVIORS = ["strict", "offset", "cross-track-offset"];
  var _options, _writer, _ftypSize, _mdat, _videoTrack, _audioTrack, _creationTime, _finalizedChunks, _nextFragmentNumber, _videoSampleQueue, _audioSampleQueue, _finalized, _validateOptions, validateOptions_fn, _writeHeader, writeHeader_fn, _computeMoovSizeUpperBound, computeMoovSizeUpperBound_fn, _prepareTracks, prepareTracks_fn, _generateMpeg4AudioSpecificConfig, generateMpeg4AudioSpecificConfig_fn, _createSampleForTrack, createSampleForTrack_fn, _addSampleToTrack, addSampleToTrack_fn, _validateTimestamp, validateTimestamp_fn, _finalizeCurrentChunk, finalizeCurrentChunk_fn, _finalizeFragment, finalizeFragment_fn, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn, _ensureNotFinalized, ensureNotFinalized_fn;
  var Muxer = class {
    constructor(options) {
      __privateAdd(this, _validateOptions);
      __privateAdd(this, _writeHeader);
      __privateAdd(this, _computeMoovSizeUpperBound);
      __privateAdd(this, _prepareTracks);
      // https://wiki.multimedia.cx/index.php/MPEG-4_Audio
      __privateAdd(this, _generateMpeg4AudioSpecificConfig);
      __privateAdd(this, _createSampleForTrack);
      __privateAdd(this, _addSampleToTrack);
      __privateAdd(this, _validateTimestamp);
      __privateAdd(this, _finalizeCurrentChunk);
      __privateAdd(this, _finalizeFragment);
      __privateAdd(this, _maybeFlushStreamingTargetWriter);
      __privateAdd(this, _ensureNotFinalized);
      __privateAdd(this, _options, void 0);
      __privateAdd(this, _writer, void 0);
      __privateAdd(this, _ftypSize, void 0);
      __privateAdd(this, _mdat, void 0);
      __privateAdd(this, _videoTrack, null);
      __privateAdd(this, _audioTrack, null);
      __privateAdd(this, _creationTime, Math.floor(Date.now() / 1e3) + TIMESTAMP_OFFSET);
      __privateAdd(this, _finalizedChunks, []);
      // Fields for fragmented MP4:
      __privateAdd(this, _nextFragmentNumber, 1);
      __privateAdd(this, _videoSampleQueue, []);
      __privateAdd(this, _audioSampleQueue, []);
      __privateAdd(this, _finalized, false);
      __privateMethod(this, _validateOptions, validateOptions_fn).call(this, options);
      options.video = deepClone(options.video);
      options.audio = deepClone(options.audio);
      options.fastStart = deepClone(options.fastStart);
      this.target = options.target;
      __privateSet(this, _options, {
        firstTimestampBehavior: "strict",
        ...options
      });
      if (options.target instanceof ArrayBufferTarget) {
        __privateSet(this, _writer, new ArrayBufferTargetWriter(options.target));
      } else if (options.target instanceof StreamTarget) {
        __privateSet(this, _writer, new StreamTargetWriter(options.target));
      } else if (options.target instanceof FileSystemWritableFileStreamTarget) {
        __privateSet(this, _writer, new FileSystemWritableFileStreamTargetWriter(options.target));
      } else {
        throw new Error(`Invalid target: ${options.target}`);
      }
      __privateMethod(this, _prepareTracks, prepareTracks_fn).call(this);
      __privateMethod(this, _writeHeader, writeHeader_fn).call(this);
    }
    addVideoChunk(sample, meta, timestamp, compositionTimeOffset) {
      if (!(sample instanceof EncodedVideoChunk)) {
        throw new TypeError("addVideoChunk's first argument (sample) must be of type EncodedVideoChunk.");
      }
      if (meta && typeof meta !== "object") {
        throw new TypeError("addVideoChunk's second argument (meta), when provided, must be an object.");
      }
      if (timestamp !== void 0 && (!Number.isFinite(timestamp) || timestamp < 0)) {
        throw new TypeError(
          "addVideoChunk's third argument (timestamp), when provided, must be a non-negative real number."
        );
      }
      if (compositionTimeOffset !== void 0 && !Number.isFinite(compositionTimeOffset)) {
        throw new TypeError(
          "addVideoChunk's fourth argument (compositionTimeOffset), when provided, must be a real number."
        );
      }
      let data = new Uint8Array(sample.byteLength);
      sample.copyTo(data);
      this.addVideoChunkRaw(
        data,
        sample.type,
        timestamp ?? sample.timestamp,
        sample.duration,
        meta,
        compositionTimeOffset
      );
    }
    addVideoChunkRaw(data, type, timestamp, duration, meta, compositionTimeOffset) {
      if (!(data instanceof Uint8Array)) {
        throw new TypeError("addVideoChunkRaw's first argument (data) must be an instance of Uint8Array.");
      }
      if (type !== "key" && type !== "delta") {
        throw new TypeError("addVideoChunkRaw's second argument (type) must be either 'key' or 'delta'.");
      }
      if (!Number.isFinite(timestamp) || timestamp < 0) {
        throw new TypeError("addVideoChunkRaw's third argument (timestamp) must be a non-negative real number.");
      }
      if (!Number.isFinite(duration) || duration < 0) {
        throw new TypeError("addVideoChunkRaw's fourth argument (duration) must be a non-negative real number.");
      }
      if (meta && typeof meta !== "object") {
        throw new TypeError("addVideoChunkRaw's fifth argument (meta), when provided, must be an object.");
      }
      if (compositionTimeOffset !== void 0 && !Number.isFinite(compositionTimeOffset)) {
        throw new TypeError(
          "addVideoChunkRaw's sixth argument (compositionTimeOffset), when provided, must be a real number."
        );
      }
      __privateMethod(this, _ensureNotFinalized, ensureNotFinalized_fn).call(this);
      if (!__privateGet(this, _options).video)
        throw new Error("No video track declared.");
      if (typeof __privateGet(this, _options).fastStart === "object" && __privateGet(this, _videoTrack).samples.length === __privateGet(this, _options).fastStart.expectedVideoChunks) {
        throw new Error(`Cannot add more video chunks than specified in 'fastStart' (${__privateGet(this, _options).fastStart.expectedVideoChunks}).`);
      }
      let videoSample = __privateMethod(this, _createSampleForTrack, createSampleForTrack_fn).call(this, __privateGet(this, _videoTrack), data, type, timestamp, duration, meta, compositionTimeOffset);
      if (__privateGet(this, _options).fastStart === "fragmented" && __privateGet(this, _audioTrack)) {
        while (__privateGet(this, _audioSampleQueue).length > 0 && __privateGet(this, _audioSampleQueue)[0].decodeTimestamp <= videoSample.decodeTimestamp) {
          let audioSample = __privateGet(this, _audioSampleQueue).shift();
          __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), audioSample);
        }
        if (videoSample.decodeTimestamp <= __privateGet(this, _audioTrack).lastDecodeTimestamp) {
          __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), videoSample);
        } else {
          __privateGet(this, _videoSampleQueue).push(videoSample);
        }
      } else {
        __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), videoSample);
      }
    }
    addAudioChunk(sample, meta, timestamp) {
      if (!(sample instanceof EncodedAudioChunk)) {
        throw new TypeError("addAudioChunk's first argument (sample) must be of type EncodedAudioChunk.");
      }
      if (meta && typeof meta !== "object") {
        throw new TypeError("addAudioChunk's second argument (meta), when provided, must be an object.");
      }
      if (timestamp !== void 0 && (!Number.isFinite(timestamp) || timestamp < 0)) {
        throw new TypeError(
          "addAudioChunk's third argument (timestamp), when provided, must be a non-negative real number."
        );
      }
      let data = new Uint8Array(sample.byteLength);
      sample.copyTo(data);
      this.addAudioChunkRaw(data, sample.type, timestamp ?? sample.timestamp, sample.duration, meta);
    }
    addAudioChunkRaw(data, type, timestamp, duration, meta) {
      if (!(data instanceof Uint8Array)) {
        throw new TypeError("addAudioChunkRaw's first argument (data) must be an instance of Uint8Array.");
      }
      if (type !== "key" && type !== "delta") {
        throw new TypeError("addAudioChunkRaw's second argument (type) must be either 'key' or 'delta'.");
      }
      if (!Number.isFinite(timestamp) || timestamp < 0) {
        throw new TypeError("addAudioChunkRaw's third argument (timestamp) must be a non-negative real number.");
      }
      if (!Number.isFinite(duration) || duration < 0) {
        throw new TypeError("addAudioChunkRaw's fourth argument (duration) must be a non-negative real number.");
      }
      if (meta && typeof meta !== "object") {
        throw new TypeError("addAudioChunkRaw's fifth argument (meta), when provided, must be an object.");
      }
      __privateMethod(this, _ensureNotFinalized, ensureNotFinalized_fn).call(this);
      if (!__privateGet(this, _options).audio)
        throw new Error("No audio track declared.");
      if (typeof __privateGet(this, _options).fastStart === "object" && __privateGet(this, _audioTrack).samples.length === __privateGet(this, _options).fastStart.expectedAudioChunks) {
        throw new Error(`Cannot add more audio chunks than specified in 'fastStart' (${__privateGet(this, _options).fastStart.expectedAudioChunks}).`);
      }
      let audioSample = __privateMethod(this, _createSampleForTrack, createSampleForTrack_fn).call(this, __privateGet(this, _audioTrack), data, type, timestamp, duration, meta);
      if (__privateGet(this, _options).fastStart === "fragmented" && __privateGet(this, _videoTrack)) {
        while (__privateGet(this, _videoSampleQueue).length > 0 && __privateGet(this, _videoSampleQueue)[0].decodeTimestamp <= audioSample.decodeTimestamp) {
          let videoSample = __privateGet(this, _videoSampleQueue).shift();
          __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), videoSample);
        }
        if (audioSample.decodeTimestamp <= __privateGet(this, _videoTrack).lastDecodeTimestamp) {
          __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), audioSample);
        } else {
          __privateGet(this, _audioSampleQueue).push(audioSample);
        }
      } else {
        __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), audioSample);
      }
    }
    /** Finalizes the file, making it ready for use. Must be called after all video and audio chunks have been added. */
    finalize() {
      if (__privateGet(this, _finalized)) {
        throw new Error("Cannot finalize a muxer more than once.");
      }
      if (__privateGet(this, _options).fastStart === "fragmented") {
        for (let videoSample of __privateGet(this, _videoSampleQueue))
          __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), videoSample);
        for (let audioSample of __privateGet(this, _audioSampleQueue))
          __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), audioSample);
        __privateMethod(this, _finalizeFragment, finalizeFragment_fn).call(this, false);
      } else {
        if (__privateGet(this, _videoTrack))
          __privateMethod(this, _finalizeCurrentChunk, finalizeCurrentChunk_fn).call(this, __privateGet(this, _videoTrack));
        if (__privateGet(this, _audioTrack))
          __privateMethod(this, _finalizeCurrentChunk, finalizeCurrentChunk_fn).call(this, __privateGet(this, _audioTrack));
      }
      let tracks = [__privateGet(this, _videoTrack), __privateGet(this, _audioTrack)].filter(Boolean);
      if (__privateGet(this, _options).fastStart === "in-memory") {
        let mdatSize;
        for (let i = 0; i < 2; i++) {
          let movieBox2 = moov(tracks, __privateGet(this, _creationTime));
          let movieBoxSize = __privateGet(this, _writer).measureBox(movieBox2);
          mdatSize = __privateGet(this, _writer).measureBox(__privateGet(this, _mdat));
          let currentChunkPos = __privateGet(this, _writer).pos + movieBoxSize + mdatSize;
          for (let chunk of __privateGet(this, _finalizedChunks)) {
            chunk.offset = currentChunkPos;
            for (let { data } of chunk.samples) {
              currentChunkPos += data.byteLength;
              mdatSize += data.byteLength;
            }
          }
          if (currentChunkPos < 2 ** 32)
            break;
          if (mdatSize >= 2 ** 32)
            __privateGet(this, _mdat).largeSize = true;
        }
        let movieBox = moov(tracks, __privateGet(this, _creationTime));
        __privateGet(this, _writer).writeBox(movieBox);
        __privateGet(this, _mdat).size = mdatSize;
        __privateGet(this, _writer).writeBox(__privateGet(this, _mdat));
        for (let chunk of __privateGet(this, _finalizedChunks)) {
          for (let sample of chunk.samples) {
            __privateGet(this, _writer).write(sample.data);
            sample.data = null;
          }
        }
      } else if (__privateGet(this, _options).fastStart === "fragmented") {
        let startPos = __privateGet(this, _writer).pos;
        let mfraBox = mfra(tracks);
        __privateGet(this, _writer).writeBox(mfraBox);
        let mfraBoxSize = __privateGet(this, _writer).pos - startPos;
        __privateGet(this, _writer).seek(__privateGet(this, _writer).pos - 4);
        __privateGet(this, _writer).writeU32(mfraBoxSize);
      } else {
        let mdatPos = __privateGet(this, _writer).offsets.get(__privateGet(this, _mdat));
        let mdatSize = __privateGet(this, _writer).pos - mdatPos;
        __privateGet(this, _mdat).size = mdatSize;
        __privateGet(this, _mdat).largeSize = mdatSize >= 2 ** 32;
        __privateGet(this, _writer).patchBox(__privateGet(this, _mdat));
        let movieBox = moov(tracks, __privateGet(this, _creationTime));
        if (typeof __privateGet(this, _options).fastStart === "object") {
          __privateGet(this, _writer).seek(__privateGet(this, _ftypSize));
          __privateGet(this, _writer).writeBox(movieBox);
          let remainingBytes = mdatPos - __privateGet(this, _writer).pos;
          __privateGet(this, _writer).writeBox(free(remainingBytes));
        } else {
          __privateGet(this, _writer).writeBox(movieBox);
        }
      }
      __privateMethod(this, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn).call(this);
      __privateGet(this, _writer).finalize();
      __privateSet(this, _finalized, true);
    }
  };
  _options = new WeakMap();
  _writer = new WeakMap();
  _ftypSize = new WeakMap();
  _mdat = new WeakMap();
  _videoTrack = new WeakMap();
  _audioTrack = new WeakMap();
  _creationTime = new WeakMap();
  _finalizedChunks = new WeakMap();
  _nextFragmentNumber = new WeakMap();
  _videoSampleQueue = new WeakMap();
  _audioSampleQueue = new WeakMap();
  _finalized = new WeakMap();
  _validateOptions = new WeakSet();
  validateOptions_fn = function(options) {
    if (typeof options !== "object") {
      throw new TypeError("The muxer requires an options object to be passed to its constructor.");
    }
    if (!(options.target instanceof Target)) {
      throw new TypeError("The target must be provided and an instance of Target.");
    }
    if (options.video) {
      if (!SUPPORTED_VIDEO_CODECS.includes(options.video.codec)) {
        throw new TypeError(`Unsupported video codec: ${options.video.codec}`);
      }
      if (!Number.isInteger(options.video.width) || options.video.width <= 0) {
        throw new TypeError(`Invalid video width: ${options.video.width}. Must be a positive integer.`);
      }
      if (!Number.isInteger(options.video.height) || options.video.height <= 0) {
        throw new TypeError(`Invalid video height: ${options.video.height}. Must be a positive integer.`);
      }
      const videoRotation = options.video.rotation;
      if (typeof videoRotation === "number" && ![0, 90, 180, 270].includes(videoRotation)) {
        throw new TypeError(`Invalid video rotation: ${videoRotation}. Has to be 0, 90, 180 or 270.`);
      } else if (Array.isArray(videoRotation) && (videoRotation.length !== 9 || videoRotation.some((value) => typeof value !== "number"))) {
        throw new TypeError(`Invalid video transformation matrix: ${videoRotation.join()}`);
      }
      if (options.video.frameRate !== void 0 && (!Number.isInteger(options.video.frameRate) || options.video.frameRate <= 0)) {
        throw new TypeError(
          `Invalid video frame rate: ${options.video.frameRate}. Must be a positive integer.`
        );
      }
    }
    if (options.audio) {
      if (!SUPPORTED_AUDIO_CODECS.includes(options.audio.codec)) {
        throw new TypeError(`Unsupported audio codec: ${options.audio.codec}`);
      }
      if (!Number.isInteger(options.audio.numberOfChannels) || options.audio.numberOfChannels <= 0) {
        throw new TypeError(
          `Invalid number of audio channels: ${options.audio.numberOfChannels}. Must be a positive integer.`
        );
      }
      if (!Number.isInteger(options.audio.sampleRate) || options.audio.sampleRate <= 0) {
        throw new TypeError(
          `Invalid audio sample rate: ${options.audio.sampleRate}. Must be a positive integer.`
        );
      }
    }
    if (options.firstTimestampBehavior && !FIRST_TIMESTAMP_BEHAVIORS.includes(options.firstTimestampBehavior)) {
      throw new TypeError(`Invalid first timestamp behavior: ${options.firstTimestampBehavior}`);
    }
    if (typeof options.fastStart === "object") {
      if (options.video) {
        if (options.fastStart.expectedVideoChunks === void 0) {
          throw new TypeError(`'fastStart' is an object but is missing property 'expectedVideoChunks'.`);
        } else if (!Number.isInteger(options.fastStart.expectedVideoChunks) || options.fastStart.expectedVideoChunks < 0) {
          throw new TypeError(`'expectedVideoChunks' must be a non-negative integer.`);
        }
      }
      if (options.audio) {
        if (options.fastStart.expectedAudioChunks === void 0) {
          throw new TypeError(`'fastStart' is an object but is missing property 'expectedAudioChunks'.`);
        } else if (!Number.isInteger(options.fastStart.expectedAudioChunks) || options.fastStart.expectedAudioChunks < 0) {
          throw new TypeError(`'expectedAudioChunks' must be a non-negative integer.`);
        }
      }
    } else if (![false, "in-memory", "fragmented"].includes(options.fastStart)) {
      throw new TypeError(`'fastStart' option must be false, 'in-memory', 'fragmented' or an object.`);
    }
    if (options.minFragmentDuration !== void 0 && (!Number.isFinite(options.minFragmentDuration) || options.minFragmentDuration < 0)) {
      throw new TypeError(`'minFragmentDuration' must be a non-negative number.`);
    }
  };
  _writeHeader = new WeakSet();
  writeHeader_fn = function() {
    __privateGet(this, _writer).writeBox(ftyp({
      holdsAvc: __privateGet(this, _options).video?.codec === "avc",
      fragmented: __privateGet(this, _options).fastStart === "fragmented"
    }));
    __privateSet(this, _ftypSize, __privateGet(this, _writer).pos);
    if (__privateGet(this, _options).fastStart === "in-memory") {
      __privateSet(this, _mdat, mdat(false));
    } else if (__privateGet(this, _options).fastStart === "fragmented") {
    } else {
      if (typeof __privateGet(this, _options).fastStart === "object") {
        let moovSizeUpperBound = __privateMethod(this, _computeMoovSizeUpperBound, computeMoovSizeUpperBound_fn).call(this);
        __privateGet(this, _writer).seek(__privateGet(this, _writer).pos + moovSizeUpperBound);
      }
      __privateSet(this, _mdat, mdat(true));
      __privateGet(this, _writer).writeBox(__privateGet(this, _mdat));
    }
    __privateMethod(this, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn).call(this);
  };
  _computeMoovSizeUpperBound = new WeakSet();
  computeMoovSizeUpperBound_fn = function() {
    if (typeof __privateGet(this, _options).fastStart !== "object")
      return;
    let upperBound = 0;
    let sampleCounts = [
      __privateGet(this, _options).fastStart.expectedVideoChunks,
      __privateGet(this, _options).fastStart.expectedAudioChunks
    ];
    for (let n of sampleCounts) {
      if (!n)
        continue;
      upperBound += (4 + 4) * Math.ceil(2 / 3 * n);
      upperBound += 4 * n;
      upperBound += (4 + 4 + 4) * Math.ceil(2 / 3 * n);
      upperBound += 4 * n;
      upperBound += 8 * n;
    }
    upperBound += 4096;
    return upperBound;
  };
  _prepareTracks = new WeakSet();
  prepareTracks_fn = function() {
    if (__privateGet(this, _options).video) {
      __privateSet(this, _videoTrack, {
        id: 1,
        info: {
          type: "video",
          codec: __privateGet(this, _options).video.codec,
          width: __privateGet(this, _options).video.width,
          height: __privateGet(this, _options).video.height,
          rotation: __privateGet(this, _options).video.rotation ?? 0,
          decoderConfig: null
        },
        // The fallback contains many common frame rates as factors
        timescale: __privateGet(this, _options).video.frameRate ?? 57600,
        samples: [],
        finalizedChunks: [],
        currentChunk: null,
        firstDecodeTimestamp: void 0,
        lastDecodeTimestamp: -1,
        timeToSampleTable: [],
        compositionTimeOffsetTable: [],
        lastTimescaleUnits: null,
        lastSample: null,
        compactlyCodedChunkTable: []
      });
    }
    if (__privateGet(this, _options).audio) {
      __privateSet(this, _audioTrack, {
        id: __privateGet(this, _options).video ? 2 : 1,
        info: {
          type: "audio",
          codec: __privateGet(this, _options).audio.codec,
          numberOfChannels: __privateGet(this, _options).audio.numberOfChannels,
          sampleRate: __privateGet(this, _options).audio.sampleRate,
          decoderConfig: null
        },
        timescale: __privateGet(this, _options).audio.sampleRate,
        samples: [],
        finalizedChunks: [],
        currentChunk: null,
        firstDecodeTimestamp: void 0,
        lastDecodeTimestamp: -1,
        timeToSampleTable: [],
        compositionTimeOffsetTable: [],
        lastTimescaleUnits: null,
        lastSample: null,
        compactlyCodedChunkTable: []
      });
      if (__privateGet(this, _options).audio.codec === "aac") {
        let guessedCodecPrivate = __privateMethod(this, _generateMpeg4AudioSpecificConfig, generateMpeg4AudioSpecificConfig_fn).call(
          this,
          2,
          // Object type for AAC-LC, since it's the most common
          __privateGet(this, _options).audio.sampleRate,
          __privateGet(this, _options).audio.numberOfChannels
        );
        __privateGet(this, _audioTrack).info.decoderConfig = {
          codec: __privateGet(this, _options).audio.codec,
          description: guessedCodecPrivate,
          numberOfChannels: __privateGet(this, _options).audio.numberOfChannels,
          sampleRate: __privateGet(this, _options).audio.sampleRate
        };
      }
    }
  };
  _generateMpeg4AudioSpecificConfig = new WeakSet();
  generateMpeg4AudioSpecificConfig_fn = function(objectType, sampleRate, numberOfChannels) {
    let frequencyIndices = [96e3, 88200, 64e3, 48e3, 44100, 32e3, 24e3, 22050, 16e3, 12e3, 11025, 8e3, 7350];
    let frequencyIndex = frequencyIndices.indexOf(sampleRate);
    let channelConfig = numberOfChannels;
    let configBits = "";
    configBits += objectType.toString(2).padStart(5, "0");
    configBits += frequencyIndex.toString(2).padStart(4, "0");
    if (frequencyIndex === 15)
      configBits += sampleRate.toString(2).padStart(24, "0");
    configBits += channelConfig.toString(2).padStart(4, "0");
    let paddingLength = Math.ceil(configBits.length / 8) * 8;
    configBits = configBits.padEnd(paddingLength, "0");
    let configBytes = new Uint8Array(configBits.length / 8);
    for (let i = 0; i < configBits.length; i += 8) {
      configBytes[i / 8] = parseInt(configBits.slice(i, i + 8), 2);
    }
    return configBytes;
  };
  _createSampleForTrack = new WeakSet();
  createSampleForTrack_fn = function(track, data, type, timestamp, duration, meta, compositionTimeOffset) {
    let presentationTimestampInSeconds = timestamp / 1e6;
    let decodeTimestampInSeconds = (timestamp - (compositionTimeOffset ?? 0)) / 1e6;
    let durationInSeconds = duration / 1e6;
    let adjusted = __privateMethod(this, _validateTimestamp, validateTimestamp_fn).call(this, presentationTimestampInSeconds, decodeTimestampInSeconds, track);
    presentationTimestampInSeconds = adjusted.presentationTimestamp;
    decodeTimestampInSeconds = adjusted.decodeTimestamp;
    if (meta?.decoderConfig) {
      if (track.info.decoderConfig === null) {
        track.info.decoderConfig = meta.decoderConfig;
      } else {
        Object.assign(track.info.decoderConfig, meta.decoderConfig);
      }
    }
    let sample = {
      presentationTimestamp: presentationTimestampInSeconds,
      decodeTimestamp: decodeTimestampInSeconds,
      duration: durationInSeconds,
      data,
      size: data.byteLength,
      type,
      // Will be refined once the next sample comes in
      timescaleUnitsToNextSample: intoTimescale(durationInSeconds, track.timescale)
    };
    return sample;
  };
  _addSampleToTrack = new WeakSet();
  addSampleToTrack_fn = function(track, sample) {
    if (__privateGet(this, _options).fastStart !== "fragmented") {
      track.samples.push(sample);
    }
    const sampleCompositionTimeOffset = intoTimescale(sample.presentationTimestamp - sample.decodeTimestamp, track.timescale);
    if (track.lastTimescaleUnits !== null) {
      let timescaleUnits = intoTimescale(sample.decodeTimestamp, track.timescale, false);
      let delta = Math.round(timescaleUnits - track.lastTimescaleUnits);
      track.lastTimescaleUnits += delta;
      track.lastSample.timescaleUnitsToNextSample = delta;
      if (__privateGet(this, _options).fastStart !== "fragmented") {
        let lastTableEntry = last(track.timeToSampleTable);
        if (lastTableEntry.sampleCount === 1) {
          lastTableEntry.sampleDelta = delta;
          lastTableEntry.sampleCount++;
        } else if (lastTableEntry.sampleDelta === delta) {
          lastTableEntry.sampleCount++;
        } else {
          lastTableEntry.sampleCount--;
          track.timeToSampleTable.push({
            sampleCount: 2,
            sampleDelta: delta
          });
        }
        const lastCompositionTimeOffsetTableEntry = last(track.compositionTimeOffsetTable);
        if (lastCompositionTimeOffsetTableEntry.sampleCompositionTimeOffset === sampleCompositionTimeOffset) {
          lastCompositionTimeOffsetTableEntry.sampleCount++;
        } else {
          track.compositionTimeOffsetTable.push({
            sampleCount: 1,
            sampleCompositionTimeOffset
          });
        }
      }
    } else {
      track.lastTimescaleUnits = 0;
      if (__privateGet(this, _options).fastStart !== "fragmented") {
        track.timeToSampleTable.push({
          sampleCount: 1,
          sampleDelta: intoTimescale(sample.duration, track.timescale)
        });
        track.compositionTimeOffsetTable.push({
          sampleCount: 1,
          sampleCompositionTimeOffset
        });
      }
    }
    track.lastSample = sample;
    let beginNewChunk = false;
    if (!track.currentChunk) {
      beginNewChunk = true;
    } else {
      let currentChunkDuration = sample.presentationTimestamp - track.currentChunk.startTimestamp;
      if (__privateGet(this, _options).fastStart === "fragmented") {
        let mostImportantTrack = __privateGet(this, _videoTrack) ?? __privateGet(this, _audioTrack);
        const chunkDuration = __privateGet(this, _options).minFragmentDuration ?? 1;
        if (track === mostImportantTrack && sample.type === "key" && currentChunkDuration >= chunkDuration) {
          beginNewChunk = true;
          __privateMethod(this, _finalizeFragment, finalizeFragment_fn).call(this);
        }
      } else {
        beginNewChunk = currentChunkDuration >= 0.5;
      }
    }
    if (beginNewChunk) {
      if (track.currentChunk) {
        __privateMethod(this, _finalizeCurrentChunk, finalizeCurrentChunk_fn).call(this, track);
      }
      track.currentChunk = {
        startTimestamp: sample.presentationTimestamp,
        samples: []
      };
    }
    track.currentChunk.samples.push(sample);
  };
  _validateTimestamp = new WeakSet();
  validateTimestamp_fn = function(presentationTimestamp, decodeTimestamp, track) {
    const strictTimestampBehavior = __privateGet(this, _options).firstTimestampBehavior === "strict";
    const noLastDecodeTimestamp = track.lastDecodeTimestamp === -1;
    const timestampNonZero = decodeTimestamp !== 0;
    if (strictTimestampBehavior && noLastDecodeTimestamp && timestampNonZero) {
      throw new Error(
        `The first chunk for your media track must have a timestamp of 0 (received DTS=${decodeTimestamp}).Non-zero first timestamps are often caused by directly piping frames or audio data from a MediaStreamTrack into the encoder. Their timestamps are typically relative to the age of thedocument, which is probably what you want.

If you want to offset all timestamps of a track such that the first one is zero, set firstTimestampBehavior: 'offset' in the options.
`
      );
    } else if (__privateGet(this, _options).firstTimestampBehavior === "offset" || __privateGet(this, _options).firstTimestampBehavior === "cross-track-offset") {
      if (track.firstDecodeTimestamp === void 0) {
        track.firstDecodeTimestamp = decodeTimestamp;
      }
      let baseDecodeTimestamp;
      if (__privateGet(this, _options).firstTimestampBehavior === "offset") {
        baseDecodeTimestamp = track.firstDecodeTimestamp;
      } else {
        baseDecodeTimestamp = Math.min(
          __privateGet(this, _videoTrack)?.firstDecodeTimestamp ?? Infinity,
          __privateGet(this, _audioTrack)?.firstDecodeTimestamp ?? Infinity
        );
      }
      decodeTimestamp -= baseDecodeTimestamp;
      presentationTimestamp -= baseDecodeTimestamp;
    }
    if (decodeTimestamp < track.lastDecodeTimestamp) {
      throw new Error(
        `Timestamps must be monotonically increasing (DTS went from ${track.lastDecodeTimestamp * 1e6} to ${decodeTimestamp * 1e6}).`
      );
    }
    track.lastDecodeTimestamp = decodeTimestamp;
    return { presentationTimestamp, decodeTimestamp };
  };
  _finalizeCurrentChunk = new WeakSet();
  finalizeCurrentChunk_fn = function(track) {
    if (__privateGet(this, _options).fastStart === "fragmented") {
      throw new Error("Can't finalize individual chunks if 'fastStart' is set to 'fragmented'.");
    }
    if (!track.currentChunk)
      return;
    track.finalizedChunks.push(track.currentChunk);
    __privateGet(this, _finalizedChunks).push(track.currentChunk);
    if (track.compactlyCodedChunkTable.length === 0 || last(track.compactlyCodedChunkTable).samplesPerChunk !== track.currentChunk.samples.length) {
      track.compactlyCodedChunkTable.push({
        firstChunk: track.finalizedChunks.length,
        // 1-indexed
        samplesPerChunk: track.currentChunk.samples.length
      });
    }
    if (__privateGet(this, _options).fastStart === "in-memory") {
      track.currentChunk.offset = 0;
      return;
    }
    track.currentChunk.offset = __privateGet(this, _writer).pos;
    for (let sample of track.currentChunk.samples) {
      __privateGet(this, _writer).write(sample.data);
      sample.data = null;
    }
    __privateMethod(this, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn).call(this);
  };
  _finalizeFragment = new WeakSet();
  finalizeFragment_fn = function(flushStreamingWriter = true) {
    if (__privateGet(this, _options).fastStart !== "fragmented") {
      throw new Error("Can't finalize a fragment unless 'fastStart' is set to 'fragmented'.");
    }
    let tracks = [__privateGet(this, _videoTrack), __privateGet(this, _audioTrack)].filter((track) => track && track.currentChunk);
    if (tracks.length === 0)
      return;
    let fragmentNumber = __privateWrapper(this, _nextFragmentNumber)._++;
    if (fragmentNumber === 1) {
      let movieBox = moov(tracks, __privateGet(this, _creationTime), true);
      __privateGet(this, _writer).writeBox(movieBox);
    }
    let moofOffset = __privateGet(this, _writer).pos;
    let moofBox = moof(fragmentNumber, tracks);
    __privateGet(this, _writer).writeBox(moofBox);
    {
      let mdatBox = mdat(false);
      let totalTrackSampleSize = 0;
      for (let track of tracks) {
        for (let sample of track.currentChunk.samples) {
          totalTrackSampleSize += sample.size;
        }
      }
      let mdatSize = __privateGet(this, _writer).measureBox(mdatBox) + totalTrackSampleSize;
      if (mdatSize >= 2 ** 32) {
        mdatBox.largeSize = true;
        mdatSize = __privateGet(this, _writer).measureBox(mdatBox) + totalTrackSampleSize;
      }
      mdatBox.size = mdatSize;
      __privateGet(this, _writer).writeBox(mdatBox);
    }
    for (let track of tracks) {
      track.currentChunk.offset = __privateGet(this, _writer).pos;
      track.currentChunk.moofOffset = moofOffset;
      for (let sample of track.currentChunk.samples) {
        __privateGet(this, _writer).write(sample.data);
        sample.data = null;
      }
    }
    let endPos = __privateGet(this, _writer).pos;
    __privateGet(this, _writer).seek(__privateGet(this, _writer).offsets.get(moofBox));
    let newMoofBox = moof(fragmentNumber, tracks);
    __privateGet(this, _writer).writeBox(newMoofBox);
    __privateGet(this, _writer).seek(endPos);
    for (let track of tracks) {
      track.finalizedChunks.push(track.currentChunk);
      __privateGet(this, _finalizedChunks).push(track.currentChunk);
      track.currentChunk = null;
    }
    if (flushStreamingWriter) {
      __privateMethod(this, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn).call(this);
    }
  };
  _maybeFlushStreamingTargetWriter = new WeakSet();
  maybeFlushStreamingTargetWriter_fn = function() {
    if (__privateGet(this, _writer) instanceof StreamTargetWriter) {
      __privateGet(this, _writer).flush();
    }
  };
  _ensureNotFinalized = new WeakSet();
  ensureNotFinalized_fn = function() {
    if (__privateGet(this, _finalized)) {
      throw new Error("Cannot add new video or audio chunks after the file has been finalized.");
    }
  };
  return __toCommonJS(src_exports);
})();
if (typeof module === "object" && typeof module.exports === "object") Object.assign(module.exports, Mp4Muxer)

// touca-export-v7: deterministic 30 fps, independent of preview / wall clock.
let frameExport=null;
$('appSettings').querySelector('p').textContent='Manual rápido · v17';
$('exportDialog').querySelector('small').textContent='Cada quadro é renderizado antes de avançar. Pode levar mais tempo que o vídeo. Mantenha esta aba visível e o aparelho acordado até concluir.';
$('exportQuality').querySelectorAll('option').forEach(option=>{option.textContent=option.value==='1080'?'1080p · Alta · 12 Mbps':'720p · Leve · 5 Mbps';});
const yieldExport=()=>new Promise(resolve=>setTimeout(resolve,0));
function checkExport(job){if(job.cancelled)throw Error('Exportação cancelada.');if(job.error)throw job.error;}
async function seekExportVideo(el,time,job){checkExport(job);el.pause();const target=clamp(time,0,Math.max(0,el.duration-.001));if(!el.seeking&&el.readyState>=2&&Math.abs(el.currentTime-target)<.00001)return;
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>done(Error('O vídeo não respondeu ao posicionamento. Nenhum arquivo parcial foi salvo.')),15000);function done(error){clearTimeout(timer);el.removeEventListener('seeked',ok);el.removeEventListener('error',bad);error?reject(error):resolve();}function ok(){if(el.readyState>=2)done();else done(Error('Frame de vídeo indisponível.'));}function bad(){done(Error('Não foi possível decodificar o vídeo.'));}el.addEventListener('seeked',ok);el.addEventListener('error',bad);el.currentTime=target;});checkExport(job);
}
async function prepareExportFrame(time,job){const clips=visibleClips(time,false).filter(c=>c.type==='video');const assets=new Set();for(const c of clips){if(assets.has(c.asset))throw Error('Vídeos simultâneos usam a mesma mídia. Importe outra cópia para essa sobreposição.');assets.add(c.asset);const entry=cache.get(c.asset);if(!entry)throw Error('Mídia ausente: '+c.name);await seekExportVideo(entry.el,(c.offset||0)+clamp(time-c.start,0,c.duration),job);}}
function mp4AudioTrack(bytes){const view=new DataView(bytes),type=at=>String.fromCharCode(...new Uint8Array(bytes,at,4));if(bytes.byteLength<12||type(4)!=='ftyp')return null;let audio=false;function walk(from,end){for(let at=from;at+8<=end;){let size=view.getUint32(at),header=8;const name=type(at+4);if(size===1){if(at+16>end)break;size=Number(view.getBigUint64(at+8));header=16;}if(size===0)size=end-at;if(size<header||at+size>end)break;if(name==='hdlr'&&size>=header+12&&type(at+header+8)==='soun')audio=true;if(['moov','trak','mdia'].includes(name))walk(at+header,at+size);at+=size;}}walk(0,bytes.byteLength);return audio;}
async function mixExportAudio(duration,job){const clips=P.clips.filter(c=>['audio','video'].includes(c.type)&&!c.muted&&(c.volume??100)>0&&c.start<duration);if(!clips.length)return null;const rate=48000,offline=new OfflineAudioContext(2,Math.ceil(duration*rate),rate),buffers=new Map(),master=offline.createGain(),compressor=offline.createDynamicsCompressor();master.gain.value=.86;compressor.threshold.value=-6;compressor.knee.value=8;compressor.ratio.value=3;compressor.attack.value=.004;compressor.release.value=.12;master.connect(compressor);compressor.connect(offline.destination);let sources=0;for(const c of clips){checkExport(job);let buffer=buffers.get(c.asset);if(!buffer){const asset=P.assets.find(a=>a.id===c.asset);try{const bytes=await(await fetch(asset.data)).arrayBuffer();if(c.type==='video'&&mp4AudioTrack(bytes)===false)continue;buffer=await offline.decodeAudioData(bytes);}catch{throw Error('Áudio não pôde ser decodificado: '+c.name+'. Remova ou silencie essa faixa antes de exportar.');}buffers.set(c.asset,buffer);}const sourceOffset=Math.max(0,c.offset||0),length=Math.min(c.duration,duration-c.start,buffer.duration-sourceOffset);if(length<=0)continue;const source=offline.createBufferSource(),gain=offline.createGain(),level=clamp((c.volume??100)/100,0,2),fade=Math.min(.018,length/3);source.buffer=buffer;gain.gain.setValueAtTime(0,c.start);gain.gain.linearRampToValueAtTime(level,c.start+fade);gain.gain.setValueAtTime(level,Math.max(c.start+fade,c.start+length-fade));gain.gain.linearRampToValueAtTime(0,c.start+length);source.connect(gain);gain.connect(master);source.start(c.start,sourceOffset,length);sources++;}if(!sources)return null;const mixed=await offline.startRendering();checkExport(job);return mixed;}
showExport=function(){if(!total())return toast('Sua timeline está vazia.');const ready=typeof VideoEncoder!=='undefined'&&typeof Mp4Muxer!=='undefined',is1080=Number($('exportQuality').value)>=1080;$('exportInfo').textContent=ready?`${fmt(total())} · MP4 · ${is1080?'60 fps · 12 Mbps':'30 fps · 5 Mbps'} · H.264 otimizado. Mantenha esta aba aberta.`:'Exportação precisa de WebCodecs. Abra o site HTTPS no Chrome ou Edge atualizado.';const fileName=$('exportFileName');if(fileName&&!fileName.matches(':focus'))fileName.value=(P.name||'Meu vídeo').replace(/\.mp4$/i,'');$('startExport').disabled=!ready;$('exportDialog').showModal();};
startRecord=async function(){if(exporting)return;if(asrBusy)return toast('Conclua a transcrição antes de exportar.');pause();const previousTime=t,duration=total(),job={cancelled:false,error:null};frameExport=job;exporting=true;$('app').classList.add('busy');$('exportProgress').value=0;$('startExport').disabled=true;$('cancelExport').textContent='Cancelar exportação';let encoder,audioEncoder;
 try{if(typeof VideoEncoder==='undefined'||typeof Mp4Muxer==='undefined')throw Error('WebCodecs indisponível. Use Chrome/Edge atualizado no site HTTPS.');await document.fonts.ready;checkExport(job);const scale=Number($('exportQuality').value)/1080,[pw,ph]=dimensions(),canvas=document.createElement('canvas');canvas.width=Math.round(pw*scale/2)*2;canvas.height=Math.round(ph*scale/2)*2;const g=canvas.getContext('2d',{alpha:false}),exportFps=Number($('exportFps')?.value||30)===60?60:30,count=Math.ceil(duration*exportFps),targetBitrate=scale<1?5000000:12000000;let videoConfig=null,bitrateLabel='';const codecs=exportFps===60?['avc1.42002A','avc1.4D002A','avc1.64002A']:['avc1.420028','avc1.4D0028','avc1.640028'];for(const codec of codecs){const candidate={codec,width:canvas.width,height:canvas.height,bitrate:targetBitrate,bitrateMode:scale<1?'variable':'constant',framerate:exportFps,latencyMode:'quality',hardwareAcceleration:'prefer-hardware',avc:{format:'avc'}};if((await VideoEncoder.isConfigSupported(candidate)).supported){videoConfig=candidate;bitrateLabel=scale<1?'5 Mbps VBR':'12 Mbps CBR';break;}}if(!videoConfig&&scale>=1){for(const codec of codecs){const candidate={codec,width:canvas.width,height:canvas.height,bitrate:14000000,bitrateMode:'variable',framerate:exportFps,latencyMode:'quality',hardwareAcceleration:'prefer-hardware',avc:{format:'avc'}};if((await VideoEncoder.isConfigSupported(candidate)).supported){videoConfig=candidate;bitrateLabel='VBR otimizado (~12 Mbps reais)';break;}}}if(!videoConfig){for(const codec of codecs){const candidate={codec,width:canvas.width,height:canvas.height,bitrate:targetBitrate,framerate:exportFps,latencyMode:'quality',avc:{format:'avc'}};if((await VideoEncoder.isConfigSupported(candidate)).supported){videoConfig=candidate;bitrateLabel=scale<1?'5 Mbps':'12 Mbps';break;}}}if(!videoConfig)throw Error(exportFps===60?'Este aparelho não oferece H.264 1080p a 60 fps. Use um Chrome/Edge atualizado ou exporte em 720p.':'Este aparelho não oferece H.264 nesta resolução. Tente outro navegador.');
 $('exportStatus').textContent='Preparando mídia e áudio…';for(const c of P.clips.filter(c=>c.type==='image')){const el=cache.get(c.asset)?.el;if(!el)throw Error('Imagem ausente: '+c.name);if(el.decode)await el.decode();}await primeTransitionMedia();checkExport(job);const mixed=await mixExportAudio(duration,job),audioConfig={codec:'mp4a.40.2',sampleRate:48000,numberOfChannels:2,bitrate:128000};if(mixed&&(typeof AudioEncoder==='undefined'||!(await AudioEncoder.isConfigSupported(audioConfig)).supported))throw Error('Codificação AAC indisponível neste navegador. Use Chrome/Edge com suporte AAC; a voz não será descartada.');
 const muxer=new Mp4Muxer.Muxer({target:new Mp4Muxer.ArrayBufferTarget(),video:{codec:'avc',width:canvas.width,height:canvas.height},...(mixed?{audio:{codec:'aac',sampleRate:48000,numberOfChannels:2}}:{}),fastStart:'in-memory',firstTimestampBehavior:'offset'});let framesWritten=0;
 encoder=new VideoEncoder({output:(chunk,meta)=>{try{muxer.addVideoChunk(chunk,meta);framesWritten++;}catch(error){job.error=error;}},error:error=>{job.error=error;}});encoder.configure(videoConfig);
 if(mixed){audioEncoder=new AudioEncoder({output:(chunk,meta)=>{try{muxer.addAudioChunk(chunk,meta);}catch(error){job.error=error;}},error:error=>{job.error=error;}});audioEncoder.configure(audioConfig);const channels=[mixed.getChannelData(0),mixed.getChannelData(1)];for(let offset=0;offset<mixed.length;offset+=1024){checkExport(job);const n=Math.min(1024,mixed.length-offset),pcm=new Float32Array(n*2);pcm.set(channels[0].subarray(offset,offset+n));pcm.set(channels[1].subarray(offset,offset+n),n);const data=new AudioData({format:'f32-planar',sampleRate:48000,numberOfFrames:n,numberOfChannels:2,timestamp:Math.round(offset/48000*1e6),data:pcm});try{audioEncoder.encode(data);}finally{data.close();}if(audioEncoder.encodeQueueSize>=24){let waits=0;while(audioEncoder.encodeQueueSize>12){checkExport(job);await yieldExport();if(++waits>250){await audioEncoder.flush();break;}}}}await audioEncoder.flush();}
 for(let index=0;index<count;index++){checkExport(job);const time=index/exportFps;await prepareExportFrame(time,job);drawTo(g,canvas.width,canvas.height,time);const start=Math.round(time*1e6),end=Math.round(Math.min(duration,(index+1)/exportFps)*1e6),frame=new VideoFrame(canvas,{timestamp:start,duration:Math.max(1,end-start)});try{encoder.encode(frame,{keyFrame:index%(exportFps*2)===0});}finally{frame.close();}if(encoder.encodeQueueSize>=18){let waits=0;while(encoder.encodeQueueSize>8){checkExport(job);await yieldExport();if(++waits>240){await encoder.flush();break;}}}if(index%Math.max(8,Math.round(exportFps/4))===0){$('exportProgress').value=(index+1)/count*100;$('exportStatus').textContent=`Renderizando quadro ${index+1} de ${count} · ${exportFps} fps · ${bitrateLabel}`;await yieldExport();}}
 await encoder.flush();checkExport(job);if(framesWritten!==count)throw Error(`Exportação incompleta: ${framesWritten} de ${count} quadros. Nenhum arquivo foi entregue.`);muxer.finalize();checkExport(job);const rawName=($('exportFileName')?.value||P.name||'Meu vídeo').trim().replace(/\.mp4$/i,'');const safeName=(rawName||'Meu vídeo').replace(/[\\/:*?"<>|]/g,'_').replace(/[. ]+$/g,'').slice(0,120)||'Meu vídeo';const exportBlob=new Blob([muxer.target.buffer],{type:'video/mp4'});download(exportBlob,safeName+'.mp4');$('exportProgress').value=100;const sizeMB=(exportBlob.size/1048576).toFixed(1),realMbps=duration>0?(exportBlob.size*8/duration/1000000).toFixed(1):'0.0';$('exportStatus').textContent=`MP4 concluído · ${framesWritten} quadros · ${exportFps} fps · ${realMbps} Mbps reais · ${sizeMB} MB.`;
 }catch(error){$('exportStatus').textContent=job.cancelled?'Exportação cancelada; nenhum arquivo parcial salvo.':error.message;toast($('exportStatus').textContent);}finally{if(encoder&&encoder.state!=='closed')encoder.close();if(audioEncoder&&audioEncoder.state!=='closed')audioEncoder.close();frameExport=null;exporting=false;exportFrame=null;t=previousTime;$('app').classList.remove('busy');$('startExport').disabled=false;$('cancelExport').textContent='Fechar';syncMedia(true);renderUI();}
};
finishRecord=function(){if(frameExport)frameExport.cancelled=true;};
$('startExport').onclick=startRecord;$('exportBtn').onclick=showExport;

// Word list editing, available from long-press on the preview or timeline captions.
document.body.insertAdjacentHTML('beforeend','<dialog id="wordListDialog"><div class="row between"><h2>Editar palavras</h2><button id="closeWordList" aria-label="Fechar">×</button></div><p>Cada palavra mantém o tempo original.</p><div id="wordListRows"></div><footer><button id="saveWordList" class="primary">Salvar alterações</button></footer></dialog>');
function openWordList(){hideClipMenu();pause();const root=$('wordListRows');root.replaceChildren();for(const c of P.clips.filter(c=>c.type==='subtitle').sort((a,b)=>a.start-b.start)){const row=document.createElement('label'),time=document.createElement('span'),input=document.createElement('input');time.textContent=fmt(c.start);input.value=c.text;input.dataset.clip=c.id;input.setAttribute('aria-label','Palavra em '+fmt(c.start));row.append(time,input);root.append(row);}$('wordListDialog').showModal();}
$('closeWordList').onclick=()=>$('wordListDialog').close();$('saveWordList').onclick=()=>{act(()=>{for(const input of $('wordListRows').querySelectorAll('input')){const c=P.clips.find(c=>c.id===input.dataset.clip);if(c){c.text=input.value.trim();c.name=c.text.slice(0,40);}}});$('wordListDialog').close();};
const menuBeforeList=showClipMenu;showClipMenu=function(c,x,y){menuBeforeList(c,x,y);if(c.type==='subtitle'){const button=document.createElement('button');button.textContent='Editar textos · lista de palavras';button.onclick=openWordList;$('clipMenu').prepend(button);const eraseAll=document.createElement('button');eraseAll.textContent='Apagar todas';eraseAll.className='danger';eraseAll.onclick=()=>{hideClipMenu();act(()=>{P.clips=P.clips.filter(x=>x.type!=='subtitle');selectedMany.clear();selected=null;});};$('clipMenu').append(eraseAll);}};
let wordHold=null;
$('preview').addEventListener('pointerdown',e=>{const c=textAt(e);if(c?.type!=='subtitle'||exporting)return;const start={x:e.clientX,y:e.clientY,id:e.pointerId};clearTimeout(wordHold?.timer);const hold={...start,fired:false,timer:setTimeout(()=>{hold.fired=true;textTap=null;showClipMenu(c,start.x,start.y);},500)};wordHold=hold;});
window.addEventListener('pointermove',e=>{if(wordHold&&Math.hypot(e.clientX-wordHold.x,e.clientY-wordHold.y)>8){clearTimeout(wordHold.timer);wordHold=null;}});
window.addEventListener('pointerup',()=>{if(wordHold){clearTimeout(wordHold.timer);wordHold=null;}});window.addEventListener('pointercancel',()=>{if(wordHold)clearTimeout(wordHold.timer);wordHold=null;});

// touca-narration-v8. Credentials stay in this browser, outside projects and source code.
(()=>{
const KEY='touca.elevenlabs.apiKey',VOICE='touca.elevenlabs.voice',API='https://api.elevenlabs.io';
let voices=[],nextPage=null,loading=false,generating=false,using=false,result=null,request=null;
const button=document.createElement('button');button.id='directNarration';button.innerHTML='◉ <span>Narração</span>';$('directAudio').after(button);
document.body.insertAdjacentHTML('beforeend',`<dialog id="narrationDialog" aria-labelledby="narrationTitle"><header class="narrationHeader"><div><small>TOUCA / VOZ</small><h2 id="narrationTitle">Dê voz à sua história.</h2></div><button id="closeNarration" aria-label="Fechar narração">×</button></header><div class="narrationBody"><div class="narrationTop"><span class="voiceBadge">Voz natural · PT-BR</span><button id="narrationApi" aria-expanded="false">Adicionar API</button></div><section id="narrationKeyPanel" class="narrationKeyPanel" hidden><label for="narrationKey">Sua chave de API</label><input id="narrationKey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Cole sua chave aqui"><div class="row"><button id="saveNarrationKey" class="primary">Salvar chave</button><button id="removeNarrationKey">Remover</button></div><small>Criptografada pelo sistema operacional para esta conta do Windows. Não acompanha o projeto exportado.</small></section><div class="narrationVoices"><label for="narrationVoice">Sua voz</label><div class="row"><select id="narrationVoice"><option value="">Escolha sua voz</option></select><button id="reloadNarrationVoices" aria-label="Atualizar vozes">↻</button><button id="moreNarrationVoices" hidden>Mais vozes</button></div><small>Escolha sua voz brasileira para manter o sotaque.</small></div><details class="narrationAdvanced"><summary>Usar ID da voz</summary><input id="narrationVoiceId" aria-label="ID da voz manual" placeholder="Opcional: cole o voice ID" autocomplete="off" spellcheck="false"></details><p class="narrationAdvice">Recomendamos usar sua própria voz ou gravação para dar personalidade ao conteúdo. Se usar IA, revise o roteiro e a narração: priorize histórias, opinião e entretenimento original, evitando conteúdo genérico produzido em massa.</p><label class="narrationTextLabel" for="narrationText">Narração</label><textarea id="narrationText" rows="7" placeholder="Cole sua narração em português…\n\nMantenha as pausas e os marcadores de emoção que você já usa." spellcheck="true" lang="pt-BR"></textarea><div class="narrationTextMeta"><span id="narrationCount">0 / 5.000 caracteres</span><span>1 áudio por geração</span></div><button id="generateNarration" class="primary narrationGenerate">Gerar narração</button><p id="narrationStatus" role="status" aria-live="polite">Adicione sua chave e escolha uma voz. Gerar consome créditos da sua conta.</p><section id="narrationResult" class="narrationResult" hidden><div class="row between"><b>Seu áudio</b><span class="voiceBadge">MP3</span></div><small id="narrationResultInfo"></small><audio id="narrationPreview" controls preload="metadata"></audio><div class="narrationResultActions"><button id="useNarration" class="primary">Usar áudio</button><button id="downloadNarration">Baixar áudio</button></div><small>Usar adiciona na faixa Voz, a partir do ponteiro. Ouvir, usar e baixar não geram novamente.</small></section></div></dialog>`);
$('appSettings').querySelector('p').textContent='Manual rápido · v8';
let secureKey='';const getKey=()=>secureKey;
(async()=>{try{secureKey=await window.toucaNative.readCredential();const old=localStorage.getItem(KEY);if(!secureKey&&old){await window.toucaNative.writeCredential(old);secureKey=old;}if(secureKey)localStorage.removeItem(KEY);update();}catch(e){status('Armazenamento seguro indisponível: '+e.message);}})();
const getVoice=()=>{try{return localStorage.getItem(VOICE)||'';}catch{return '';}};
const status=text=>{$('narrationStatus').textContent=text;};
function update(){const text=window.ToucaScenes?.parse($('narrationText').value).ttsText??$('narrationText').value.trim(),voice=$('narrationVoiceId').value.trim()||$('narrationVoice').value;if(result)$('narrationResultInfo').textContent=result.voiceName+' · '+result.text.length+' caracteres'+(text!==result.text?' · Roteiro editado: este áudio mantém a geração anterior.':' · última geração');$('narrationCount').textContent=text.length.toLocaleString('pt-BR')+' / 5.000 caracteres';$('narrationCount').classList.toggle('overLimit',text.length>5000);$('generateNarration').disabled=generating||using||loading||!getKey()||!voice||!text||text.length>5000;$('generateNarration').textContent=generating?'Gerando sua voz…':result?'Gerar nova narração':'Gerar narração';$('generateNarration').classList.toggle('isGenerating',generating);$('narrationApi').textContent=getKey()?'Configurar API':'Adicionar API';for(const id of ['saveNarrationKey','removeNarrationKey','narrationVoice','narrationVoiceId','reloadNarrationVoices'])$(id).disabled=generating||using||loading;$('moreNarrationVoices').hidden=!nextPage;$('moreNarrationVoices').disabled=loading||generating;$('useNarration').disabled=!result||using||generating||result?.project===P&&P.clips.some(c=>c.id===result?.clipId);$('downloadNarration').disabled=!result;$('useNarration').textContent=result?.project===P&&P.clips.some(c=>c.id===result?.clipId)?'Áudio na timeline':using?'Adicionando…':'Usar áudio';}
function toggleKey(open){$('narrationKeyPanel').hidden=!open;$('narrationApi').setAttribute('aria-expanded',String(open));if(open)$('narrationKey').focus();}
async function apiFailure(res){let code='';try{const body=await res.json();code=String(body.detail?.status||body.detail?.code||'');}catch{}if(code==='quota_exceeded'||res.status===402)return 'Créditos insuficientes no serviço de voz. Nenhuma nova tentativa foi feita.';if(res.status===401)return 'A chave não foi aceita. Confira sua API key.';if(res.status===403)return 'Acesso negado. A chave precisa de Text to Speech; para listar, Vozes: Ler.';if(res.status===429)return 'Limite de solicitações atingido. Não repetimos a geração automaticamente.';if(res.status===422)return 'O serviço de voz recusou texto, voz ou configuração. Confira a voz e o limite de 5.000 caracteres.';return 'O serviço de voz retornou erro '+res.status+'. Nenhuma tentativa automática foi feita.';}
async function loadVoices(more=false){if(loading||generating)return;const key=getKey();if(!key)return status('Adicione sua API key primeiro.');loading=true;update();status('Buscando suas vozes…');const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);try{const query=new URLSearchParams({page_size:'100'});if(more&&nextPage)query.set('next_page_token',nextPage);const res=await fetch(API+'/v2/voices?'+query,{headers:{'xi-api-key':key},credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});if(!res.ok)throw Error(await apiFailure(res));const data=await res.json();if(!Array.isArray(data.voices))throw Error('Resposta de vozes inválida.');voices=more?voices:[];for(const voice of data.voices)if(voice.voice_id&&!voices.some(v=>v.voice_id===voice.voice_id))voices.push(voice);nextPage=data.has_more?data.next_page_token||null:null;const preferred=$('narrationVoice').value||getVoice(),select=$('narrationVoice');select.replaceChildren();const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Escolha sua voz';select.append(placeholder);for(const voice of voices){const option=document.createElement('option');option.value=voice.voice_id;option.textContent=voice.name||'Voz sem nome';select.append(option);}if(voices.some(v=>v.voice_id===preferred))select.value=preferred;status(voices.length+' vozes disponíveis. Selecione a sua; nenhuma narração foi gerada.');}catch(error){status(error.name==='AbortError'?'Tempo esgotado ao buscar vozes. Tente atualizar.':error instanceof TypeError?'Falha de conexão. Confira a internet e abra o site no navegador.':error.message);}finally{clearTimeout(timeout);loading=false;update();}}
function open(){if(exporting)return toast('Conclua a exportação primeiro.');closeQuick();pause();$('narrationDialog').showModal();toggleKey(!getKey());update();if(getKey()&&!voices.length&&!generating)loadVoices();}
button.onclick=open;$('closeNarration').onclick=()=>{$('narrationPreview').pause();$('narrationDialog').close();};$('narrationDialog').addEventListener('cancel',()=>$('narrationPreview').pause());
$('narrationApi').onclick=()=>toggleKey($('narrationKeyPanel').hidden);
$('saveNarrationKey').onclick=async()=>{if(generating||loading)return;const key=$('narrationKey').value.trim();if(key.length<10||/\s/.test(key))return status('Cole uma chave válida, sem espaços.');try{await window.toucaNative.writeCredential(key);secureKey=key;}catch{return status('O navegador bloqueou o armazenamento. Não foi possível salvar a chave.');}$('narrationKey').value='';voices=[];nextPage=null;$('narrationVoice').value='';toggleKey(false);await loadVoices();};
$('removeNarrationKey').onclick=async()=>{if(generating||loading)return;try{await window.toucaNative.writeCredential('');secureKey='';localStorage.removeItem(KEY);localStorage.removeItem(VOICE);}catch{return status('Não foi possível remover a chave neste navegador.');}$('narrationKey').value='';$('narrationVoice').replaceChildren();$('narrationVoiceId').value='';voices=[];nextPage=null;status('Chave removida deste navegador.');update();};
$('reloadNarrationVoices').onclick=()=>loadVoices();$('moreNarrationVoices').onclick=()=>loadVoices(true);
$('narrationText').oninput=update;$('narrationVoiceId').oninput=update;$('narrationVoice').onchange=()=>{try{localStorage.setItem(VOICE,$('narrationVoice').value);}catch{}update();};
$('generateNarration').onclick=async()=>{if(generating||using||loading||exporting)return;const scenePlan=window.ToucaScenes?.parse($('narrationText').value),key=getKey(),text=scenePlan?.ttsText??$('narrationText').value.trim(),voiceId=$('narrationVoiceId').value.trim()||$('narrationVoice').value;if(!key||!voiceId||!text)return status('Adicione a chave, escolha a voz e escreva a narração.');if(text.length>5000)return status('O Eleven v3 aceita até 5.000 caracteres por geração. Reduza o texto; ele não será dividido automaticamente.');generating=true;update();status('Gerando uma única narração no Eleven v3. Você pode fechar esta janela e continuar editando.');request=new AbortController();const timer=setTimeout(()=>request?.abort(),180000);try{
 // Exactly one chargeable POST. No retry, no alternate model, no splitting into requests.
 const res=await fetch(API+'/v1/text-to-speech/'+encodeURIComponent(voiceId)+'?output_format=mp3_44100_128',{method:'POST',headers:{'xi-api-key':key,'Content-Type':'application/json','Accept':'audio/mpeg'},credentials:'omit',referrerPolicy:'no-referrer',signal:request.signal,body:JSON.stringify({text,model_id:'eleven_v3',language_code:'pt',voice_settings:{stability:0.5}})});if(!res.ok)throw Error(await apiFailure(res));const blob=await res.blob();if(!blob.size||blob.type.includes('json')||blob.type.includes('text/'))throw Error('A resposta não contém um áudio válido. Não geramos novamente.');const audioBlob=new Blob([blob],{type:'audio/mpeg'});$('narrationPreview').pause();if(result?.url)URL.revokeObjectURL(result.url);result={blob:audioBlob,url:URL.createObjectURL(audioBlob),scenePlan,text,voiceId,voiceName:voices.find(v=>v.voice_id===voiceId)?.name||'Voz selecionada',name:'narracao-touca-'+Date.now()+'.mp3',clipId:null,project:null};$('narrationPreview').src=result.url;$('narrationResult').hidden=false;$('narrationResultInfo').textContent=result.voiceName+' · '+text.length+' caracteres · última geração';status('Narração pronta. Ouça antes de usar. Usar e baixar reutilizam este mesmo áudio.');
 }catch(error){status(error.name==='AbortError'?'A resposta demorou demais. Confira o histórico do serviço de voz antes de gerar outra vez: a solicitação pode ter sido cobrada.':error instanceof TypeError?'Falha de conexão. Confira o histórico do serviço de voz antes de repetir; não fizemos nova tentativa.':error.message);}finally{clearTimeout(timer);request=null;generating=false;update();}};
$('downloadNarration').onclick=()=>{if(result)download(result.blob,result.name);};
$('useNarration').onclick=async()=>{if(!result||using||generating||exporting)return;if(result.project===P&&P.clips.some(c=>c.id===result.clipId))return;const audio=result,project=P,start=Math.max(0,t);using=true;update();status('Adicionando o áudio ao projeto…');let asset;try{asset={id:uid(),name:audio.name,type:'audio',data:await readData(audio.blob)};await loadAsset(asset);if(P!==project||exporting)throw Error('O projeto mudou. Clique em Usar áudio novamente no projeto desejado.');const c=newClip('audio','Narração · '+audio.voiceName,asset.id,'voice',start,asset.duration);c.scenePlan=audio.scenePlan;checkpoint();P.assets.push(asset);P.clips.push(c);selected=c.id;audio.clipId=c.id;audio.project=P;changed();$('narrationPreview').pause();status('Narração adicionada à faixa Voz.');$('narrationDialog').close();toast('Narração na timeline.');if(c.scenePlan?.scenes?.length>1)await window.ToucaScenes?.alignClip(c);}catch(error){if(asset&&!P.assets.some(a=>a.id===asset.id))cache.delete(asset.id);status(error.message);}finally{using=false;update();}};
$('narrationPreview').onerror=()=>{if(result)status('O navegador não conseguiu tocar a prévia. Você ainda pode baixar o MP3, sem gerar novamente.');};
update();
})();

// Touca v9: smoother export defaults, mobile timeline follow, themes and ANI controls.
(()=>{
  const q=s=>document.querySelector(s), el=id=>document.getElementById(id);
  // Optimized social-video presets: 12 Mbps VBR at 1080p, 5 Mbps VBR at 720p.
  const quality=el('exportQuality'); if(quality) quality.querySelectorAll('option').forEach(o=>{o.textContent=o.value==='1080'?'1080p · Alta · 12 Mbps':'720p · Leve · 5 Mbps';});
  // Follow playhead without stealing manual scroll unless playback is active or scrubbing.
  const oldDrawPlayhead=window.drawPlayhead;
  if(oldDrawPlayhead) window.drawPlayhead=function(){oldDrawPlayhead();const s=el('timelineScroll'),p=el('playhead');if(!s||!p)return;const x=t*pps, left=s.scrollLeft,right=left+s.clientWidth;if(playing||x<left+36||x>right-36)s.scrollTo({left:Math.max(0,x-s.clientWidth*.42),behavior:playing?'auto':'smooth'});};
  // Preview-only saturation; exporter uses drawTo directly and is not affected.
  const stage=q('.canvasBox'); if(stage) stage.classList.add('touca-preview-color');
  // Hold-to-record camera control beside preview. Release pauses; click while paused finalizes.
  const transport=q('.transport'); if(transport&&!el('cameraRecord')){const b=document.createElement('button');b.id='cameraRecord';b.className='cameraRecord';b.textContent='●';b.title='Segure para gravar pela câmera';transport.append(b);let rec=null,chunks=[],started=0,paused=true,stream=null,timer=null,elapsed=0;
    const cameraSelect=document.createElement('select');cameraSelect.id='cameraFacing';cameraSelect.className='cameraFacing';cameraSelect.title='Câmera';cameraSelect.innerHTML='<option value="user">Frontal</option><option value="environment">Traseira</option>';transport.append(cameraSelect);
    const clock=()=>{const s=Math.floor(elapsed/1000),m=Math.floor(s/60),ss=String(s%60).padStart(2,'0');b.textContent=`${String(m).padStart(2,'0')}:${ss}`;};
    const finish=()=>{if(!rec)return;rec.stop();stream?.getTracks().forEach(x=>x.stop());clearInterval(timer);timer=null;rec=null;paused=true;b.classList.remove('recording','paused');b.textContent='●';};
    b.onpointerdown=async e=>{e.preventDefault();if(rec&&paused){rec.resume();paused=false;started=performance.now()-elapsed;b.classList.add('recording');b.classList.remove('paused');timer=setInterval(()=>{elapsed=performance.now()-started;clock();},250);return;}if(rec)return;if(!navigator.mediaDevices?.getUserMedia)return toast('Câmera indisponível neste navegador.');try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:cameraSelect.value},audio:true});const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(x=>MediaRecorder.isTypeSupported(x))||'';rec=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);chunks=[];elapsed=0;started=performance.now();rec.ondataavailable=x=>x.data.size&&chunks.push(x.data);rec.onstop=()=>{if(!chunks.length)return;const blob=new Blob(chunks,{type:rec?.mimeType||'video/webm'});download(blob,'touca-camera.webm');toast('Gravação da câmera salva.');};rec.start(250);paused=false;b.classList.add('recording');timer=setInterval(()=>{elapsed=performance.now()-started;clock();},250);clock();}catch(err){toast('Permissão de câmera negada ou indisponível.');}};
    b.onpointerup=e=>{if(rec&&!paused){rec.pause();paused=true;clearInterval(timer);timer=null;elapsed=performance.now()-started;b.classList.remove('recording');b.classList.add('paused');clock();}};b.onpointercancel=b.onpointerup;b.onclick=e=>{if(rec&&paused)finish();};
  }
  // Search voices as the user types; filtering is local and makes no extra API calls.
  const voiceBox=q('.narrationVoices');if(voiceBox&&!el('narrationVoiceSearch')){const search=document.createElement('input');search.id='narrationVoiceSearch';search.type='search';search.placeholder='Pesquisar voz…';search.setAttribute('aria-label','Pesquisar voz');voiceBox.insertBefore(search,voiceBox.querySelector('.row'));search.oninput=()=>{const term=search.value.trim().toLocaleLowerCase('pt-BR'),select=el('narrationVoice');for(const option of select.options)option.hidden=!!term&&!option.textContent.toLocaleLowerCase('pt-BR').includes(term);if(select.selectedOptions[0]?.hidden)select.value='';};}
  // Remove the legacy utility buttons from the header; actions remain in the +/export flows.
  ['appSettingsButton','openBtn','saveBtn'].forEach(id=>el(id)?.classList.add('legacyHeaderButton'));
  // Compact theme swatches in the top bar.
  const storage=(()=>{try{return localStorage}catch{return {getItem:()=>null,setItem:()=>{}}}})();
  const top=q('.topActions'); if(top&&!el('themeSwatches')){const wrap=document.createElement('div');wrap.id='themeSwatches';wrap.className='themeSwatches';[['aqua','●'],['blue','●'],['purple','●'],['black','●'],['white','●']].forEach(([name,label])=>{const b=document.createElement('button');b.className='themeSwatch '+name;b.title='Tema '+name;b.textContent=label;b.onclick=()=>{document.documentElement.dataset.theme=name;storage.setItem('touca.theme',name);};wrap.append(b);});top.prepend(wrap);const saved=storage.getItem('touca.theme');if(saved)document.documentElement.dataset.theme=saved;}
  // ANI is a draggable marker; dropping on a clip opens the animation chooser.
  el('effectDrag')?.classList.add('legacyEffectButton');
  if(!el('aniDrag')){const b=document.createElement('button');b.id='aniDrag';b.className='aniDrag';b.textContent='ANI';b.title='Arraste até uma barra para adicionar animação';q('.manualStrip')?.prepend(b);}
  const anims=['Zoom suave','Zoom impacto','Fade in','Fade out','Deslizar cima','Deslizar baixo','Deslizar esquerda','Deslizar direita','Pop','Bounce','Giro curto','Escala elástica','Revelar','Pulso','Combinação'];
  function chooseAni(clip){if(window.openAnimationPicker)return window.openAnimationPicker(clip);let d=el('aniDialog');if(!d){d=document.createElement('dialog');d.id='aniDialog';d.innerHTML='<h2>Animação · 0,4 s</h2><p>Escolha entrada ou saída. A aplicação permanece editável.</p><div class="aniChoices"></div><footer><button class="primary" data-close>Fechar</button></footer>';document.body.append(d);d.querySelector('[data-close]').onclick=()=>d.close();}const box=d.querySelector('.aniChoices');box.replaceChildren();for(const n of anims){const x=document.createElement('button');x.textContent=n;x.onclick=()=>{act(()=>{clip.animation={name:n,duration:.3,side:clip.animation?.side||'in'};});d.close();};box.append(x);}d.showModal();}
  const ani=el('aniDrag'); if(ani){let drag=false;ani.onpointerdown=e=>{e.preventDefault();drag=true;ani.setPointerCapture?.(e.pointerId);};ani.onpointermove=e=>{if(drag){ani.style.transform=`translate(${e.clientX-30}px,${e.clientY-25}px)`;}};ani.onpointerup=e=>{if(!drag)return;drag=false;ani.style.transform='';const r=el('timelineScroll')?.getBoundingClientRect();if(r&&e.clientX>=r.left&&e.clientX<=r.right){const at=(el('timelineScroll').scrollLeft+e.clientX-r.left)/pps;const c=P.clips.find(x=>x.type!=='audio'&&at>=x.start&&at<x.start+x.duration);if(c){select(c.id);chooseAni(c);}}};}
  // Keyframe toggles: retain structural endpoints but allow disabling/removing user keys.
  const keyPanel=el('keyControls');if(keyPanel&&!el('keyToggleHint')){const p=document.createElement('small');p.id='keyToggleHint';p.textContent='Toque no losango para ativar/desativar; use − para remover o selecionado.';keyPanel.append(p);}
})();

// Touca v10: animation compositor, real keyframe toggles and local sound attachments.
(()=>{
  const $=id=>document.getElementById(id), q=s=>document.querySelector(s);
  const names=['Zoom suave','Zoom impacto','Fade in','Fade out','Deslizar cima','Deslizar baixo','Deslizar esquerda','Deslizar direita','Pop','Bounce','Giro curto','Escala elástica','Revelar','Pulso','Combinação'];
  const smooth=u=>u*u*(3-2*u), clamp01=u=>Math.max(0,Math.min(1,u));
  async function attachEventSound(file,owner,start,label,key){
    if(!file||!owner||!key)return;
    try{const a={id:uid(),name:'Som · '+file.name,type:'audio',data:await readData(file)};await loadAsset(a);act(()=>{P.assets.push(a);P.clips=P.clips.filter(x=>x.eventSoundFor!==key);const c=newClip('audio',label,a.id,'music',Math.max(0,snapFrame(start)),.4);c.volume=60;c.eventSoundFor=key;P.clips.push(c);owner.soundAsset=a.id;owner.soundVolume=60;});toast('Som associado a este evento · 60%.');}
    catch(err){toast(err.message);}
  }
  function animPose(c,time){
    const local=time-c.start, base=valueAt(c.keys,clamp(local,0,c.duration)), a=c.animation||{};
    let spec=null,p=1,side='';
    if(a.in&&local<Math.min(.4,c.duration)){spec=a.in;p=clamp01(local/Math.min(.4,c.duration));side='in';}
    if(a.out&&local>Math.max(0,c.duration-.4)){spec=a.out;p=clamp01((c.duration-local)/Math.min(.4,c.duration));side='out';}
    if(!spec&&a.name){spec=a;p=clamp01((local<.2?local:Math.min(.4,c.duration-local))/.4);side=a.side||'in';}
    if(!spec)return base;
    const u=smooth(p),v={...base};
    const sign=side==='out'?-1:1;
    switch(spec.name){
      case 'Fade in':case 'Fade out':v.opacity=base.opacity*u;break;
      case 'Zoom suave':v.scale=base.scale*(.84+.16*u);break;
      case 'Zoom impacto':v.scale=base.scale*(.68+.32*u);break;
      case 'Deslizar cima':v.y=base.y+sign*(1-u)*460;break;
      case 'Deslizar baixo':v.y=base.y-sign*(1-u)*460;break;
      case 'Deslizar esquerda':v.x=base.x+sign*(1-u)*460;break;
      case 'Deslizar direita':v.x=base.x-sign*(1-u)*460;break;
      case 'Pop':v.scale=base.scale*(.55+.45*u);break;
      case 'Bounce':v.scale=base.scale*(.8+.2*u+Math.sin(u*Math.PI)*.10);break;
      case 'Giro curto':v.rotation=base.rotation+sign*(1-u)*8;v.scale=base.scale*(.92+.08*u);break;
      case 'Escala elástica':v.scale=base.scale*(.72+.28*u+Math.sin(u*Math.PI*2)*.06);break;
      case 'Revelar':v.opacity=base.opacity*u;v.scale=base.scale*(.94+.06*u);break;
      case 'Pulso':v.scale=base.scale*(1+Math.sin(u*Math.PI)*.08);break;
      case 'Combinação':v.opacity=base.opacity*u;v.scale=base.scale*(.82+.18*u);v.x=base.x+sign*(1-u)*180;break;
    }
    return v;
  }
  // Replace the current frame's pose only for painting; project keyframes stay untouched.
  if(typeof paintClip==='function'){
    const basePaint=paintClip;
    paintClip=function(g,c,time,pw,ph){
      if(!c.animation||c.type==='audio')return basePaint(g,c,time,pw,ph);
      const poseNow=animPose(c,time),copy={...c,keys:[{t:0,v:poseNow},{t:Math.max(.001,c.duration),v:poseNow}]};
      return basePaint(g,copy,time,pw,ph);
    };
  }
  // Expose both entry and exit choices in the ANI picker created by v9.
  function openAnimationPicker(c){
    let d=$('aniDialog');if(!d){d=document.createElement('dialog');d.id='aniDialog';document.body.append(d);}
    d.innerHTML='<div class="aniHeader"><h2>Animação · 0,4 s</h2><button type="button" class="aniClose">×</button></div><div class="aniSides"><button type="button" data-side="in" class="active">Entrada</button><button type="button" data-side="out">Saída</button></div><div class="aniChoices"></div><div class="aniSoundRow"><button type="button" id="aniSoundAdd">Adicionar som</button><button type="button" id="aniSoundRemove">Remover som</button><input id="aniSoundInput" type="file" accept="audio/*" hidden></div>';
    const choices=d.querySelector('.aniChoices'),sideButtons=[...d.querySelectorAll('[data-side]')];let side='in';
    const render=()=>{choices.replaceChildren();for(const name of names){const b=document.createElement('button');b.type='button';b.textContent=name;b.onclick=()=>{act(()=>{c.animation??={};c.animation[side]={name,duration:.3,volume:60,soundAsset:c.animation[side]?.soundAsset||null};});d.close();};choices.append(b);}};
    sideButtons.forEach(b=>b.onclick=()=>{side=b.dataset.side;sideButtons.forEach(x=>x.classList.toggle('active',x===b));render();});
    d.querySelector('.aniClose').onclick=()=>d.close();d.querySelector('#aniSoundAdd').onclick=()=>d.querySelector('#aniSoundInput').click();d.querySelector('#aniSoundRemove').onclick=()=>{act(()=>{P.clips=P.clips.filter(x=>x.eventSoundFor!==c.id+':'+side);if(c.animation?.[side])delete c.animation[side].soundAsset;});};
    d.querySelector('#aniSoundInput').onchange=async e=>{const file=e.target.files?.[0];const owner=c.animation?.[side]||{name:'Combinação',duration:.3};c.animation??={};c.animation[side]=owner;await attachEventSound(file,owner,side==='out'?c.start+c.duration-.4:c.start,'Som da animação · '+file.name,c.id+':'+side);e.target.value='';};render();d.showModal();
  }
  if(!$('aniDialog')){const placeholder=document.createElement('dialog');placeholder.id='aniDialog';document.body.append(placeholder);}
  window.openAnimationPicker=openAnimationPicker;
  // Transition sound attachment uses an ordinary music clip, so it is included in preview and export.
  const picker=$('transitionPicker');if(picker&&!$('transitionSoundInputV10')){const row=document.createElement('div');row.className='aniSoundRow';row.innerHTML='<button type="button" id="transitionSoundAddV10">Adicionar som</button><button type="button" id="transitionSoundRemoveV10">Remover som</button><input id="transitionSoundInputV10" type="file" accept="audio/*" hidden>';picker.append(row);$('transitionSoundAddV10').onclick=()=>$('transitionSoundInputV10').click();$('transitionSoundRemoveV10').onclick=()=>{const c=P.clips.find(x=>x.id===pickedCut);if(!c)return;act(()=>{P.clips=P.clips.filter(x=>x.eventSoundFor!==c.id+':transition');if(c.transition)delete c.transition.soundAsset;});};$('transitionSoundInputV10').onchange=async e=>{const file=e.target.files?.[0],c=P.clips.find(x=>x.id===pickedCut),cut=c&&cutFor(c);if(file&&c&&cut){c.transition??={type:'none',duration:.3};await attachEventSound(file,c.transition,cut.time-.2,'Som da transição · '+file.name,c.id+':transition');}e.target.value='';};}
  if($('aniDrag')){ // fixed-position ghost stays under the finger instead of leaving the viewport
    const ani=$('aniDrag');let dragging=false,ghost=null,moved=false;
    ani.onpointerdown=e=>{if(e.button>0)return;e.preventDefault();dragging=true;moved=false;ani.setPointerCapture?.(e.pointerId);ghost=ani.cloneNode(true);ghost.id='aniGhost';ghost.classList.add('aniGhost');document.body.append(ghost);ghost.style.left=(e.clientX-22)+'px';ghost.style.top=(e.clientY-22)+'px';};
    ani.onpointermove=e=>{if(!dragging||!ghost)return;e.preventDefault();moved=true;ghost.style.left=(e.clientX-22)+'px';ghost.style.top=(e.clientY-22)+'px';};
    ani.onpointerup=e=>{if(!dragging)return;dragging=false;ghost?.remove();ghost=null;const r=$('timelineScroll')?.getBoundingClientRect();if(r&&e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom){const at=($('timelineScroll').scrollLeft+e.clientX-r.left)/pps,c=P.clips.find(x=>x.type!=='audio'&&at>=x.start&&at<x.start+x.duration);if(c){select(c.id);openAnimationPicker(c);return;}}if(!moved){const c=current();if(c)openAnimationPicker(c);}else toast('Solte o ANI sobre a barra desejada.');};ani.onpointercancel=ani.onpointerup;
  }
  // Add visible enable/disable affordance to each keyframe without changing endpoint timing.
  const baseBuild=buildTimeline;
  buildTimeline=function(){baseBuild();for(const c of P.clips){if(c.type==='audio'||c.type==='effect')continue;const node=document.querySelector('.clip[data-id="'+c.id+'"]');if(!node)continue;let dots=[...node.querySelectorAll('.clipKey')];for(let i=dots.length;i<c.keys.length;i++){const dot=document.createElement('i');dot.className='clipKey';dot.style.left=clamp(c.keys[i].t*pps,3,Math.max(3,c.duration*pps-8))+'px';node.append(dot);dots.push(dot);}dots.forEach((dot,i)=>{const k=c.keys[i];if(!k)return;dot.dataset.keyIndex=i;dot.classList.toggle('disabledKey',k.enabled===false);dot.title=(i===0?'Início':i===c.keys.length-1?'Fim':'Intermediário')+' · toque para selecionar';dot.onpointerdown=e=>e.stopPropagation();dot.onclick=e=>{e.stopPropagation();pause();selected=c.id;keyIndex=i;$('editScope').value='key';t=c.start+k.t;renderUI(false);};});}}
  const baseValueAt=valueAt;
  valueAt=function(keys,time){const active=keys.filter(k=>k.enabled!==false);return baseValueAt(active.length?active:keys,time);};
  // Unlike the original inspector, endpoints may also be removed. A clip keeps one pose minimum.
  const baseInspector=inspector;
  inspector=function(){baseInspector();const c=current(),b=$('deleteKey');if(b){b.disabled=!c||c.type==='audio'||c.keys.length<=1;b.title='Excluir keyframe selecionado (inclui início e fim)';}};
  $('deleteKey').onclick=()=>{const c=current();if(!c||c.type==='audio')return;if(c.keys.length<=1)return toast('O clip precisa manter pelo menos um keyframe.');act(()=>{c.keys.splice(clamp(keyIndex,0,c.keys.length-1),1);keyIndex=clamp(keyIndex,0,c.keys.length-1);});};
  const tools=q('.timelineTools');if(tools&&!$('quickKeyAdd')){const add=document.createElement('button');add.id='quickKeyAdd';add.className='quickKey';add.textContent='◇+';add.title='Adicionar keyframe no ponteiro';const rem=document.createElement('button');rem.id='quickKeyRemove';rem.className='quickKey';rem.textContent='◇−';rem.title='Remover keyframe no ponteiro';tools.insertBefore(add,tools.querySelector('.grow'));tools.insertBefore(rem,tools.querySelector('.grow'));add.onclick=()=>{const c=current();if(!c||c.type==='audio')return toast('Selecione uma imagem, vídeo ou texto.');act(()=>{keyIndex=insertKey(c,t-c.start);$('editScope').value='key';});};rem.onclick=()=>{const c=current();if(!c||c.type==='audio')return;let idx=c.keys.findIndex(k=>Math.abs(k.t-(t-c.start))<.001);if(idx<0)idx=clamp(keyIndex,0,c.keys.length-1);if(c.keys.length<=1)return toast('O clip precisa manter pelo menos um keyframe.');act(()=>{c.keys.splice(idx,1);keyIndex=clamp(idx-1,0,c.keys.length-1);});};}
  // Search field stays synchronized after the serviço de voz voice list is refreshed.
  const voiceSearch=$('narrationVoiceSearch');if(voiceSearch){const select=$('narrationVoice');voiceSearch.addEventListener('input',()=>{const s=voiceSearch.value.trim().toLocaleLowerCase('pt-BR');for(const o of select.options)o.hidden=!!s&&!o.textContent.toLocaleLowerCase('pt-BR').includes(s);});}
})();


// Touca v12: fullscreen centered camera, robust recorded-video import, caption bulk delete,
// visible ANI drag ghost; v11 audio/keyframe/animation/theme fixes preserved.
(()=>{
  const $=id=>document.getElementById(id), q=s=>document.querySelector(s), clamp01=x=>Math.max(0,Math.min(1,x));

  // Recorded WebM/MP4 fallback: some mobile browsers reject a data URL even though the same blob plays normally.
  const loadAssetBeforeCamera=loadAsset;
  loadAsset=async function(a){
    try{return await loadAssetBeforeCamera(a);}
    catch(firstError){
      if(a?.type!=='video'||typeof a.data!=='string'||!a.data.startsWith('data:video/'))throw firstError;
      let url=null;
      try{
        const blob=await (await fetch(a.data)).blob();url=URL.createObjectURL(blob);
        const el=document.createElement('video');el.preload='metadata';el.playsInline=true;
        await new Promise((res,rej)=>{el.onloadedmetadata=res;el.onerror=()=>rej(firstError);el.src=url;});
        a.width=el.videoWidth||0;a.height=el.videoHeight||0;a.duration=el.duration;
        if(!Number.isFinite(a.duration)||a.duration<=0)throw firstError;
        cache.set(a.id,{el,objectUrl:url});el.addEventListener('seeked',draw);el.addEventListener('loadeddata',draw);url=null;return;
      }catch{throw firstError;}finally{if(url)URL.revokeObjectURL(url);}
    }
  };

  // Export audio: avoid audible micro-gaps on adjacent cuts and guard the PCM before AAC encoding.
  mixExportAudio=async function(duration,job){
    const clips=P.clips.filter(c=>['audio','video'].includes(c.type)&&!c.muted&&(c.volume??100)>0&&c.start<duration);
    if(!clips.length)return null;
    const rate=48000,offline=new OfflineAudioContext(2,Math.ceil(duration*rate),rate),buffers=new Map(),master=offline.createGain();
    master.gain.value=.96;master.connect(offline.destination);
    const touching=(a,b)=>!!a&&!!b&&a.asset===b.asset&&a.track===b.track&&Math.abs((a.start+a.duration)-b.start)<=1/120&&Math.abs(((a.offset||0)+a.duration)-(b.offset||0))<=1/120;
    const ordered=[...clips].sort((a,b)=>a.start-b.start||a.track.localeCompare(b.track));
    let sources=0;
    for(let ci=0;ci<ordered.length;ci++){
      checkExport(job);const c=ordered[ci];let buffer=buffers.get(c.asset);
      if(!buffer){const asset=P.assets.find(a=>a.id===c.asset);try{const bytes=await(await fetch(asset.data)).arrayBuffer();if(c.type==='video'&&mp4AudioTrack(bytes)===false)continue;buffer=await offline.decodeAudioData(bytes);}catch{throw Error('Áudio não pôde ser decodificado: '+c.name+'. Remova ou silencie essa faixa antes de exportar.');}buffers.set(c.asset,buffer);}
      const sourceOffset=Math.max(0,c.offset||0),length=Math.min(c.duration,duration-c.start,buffer.duration-sourceOffset);if(length<=0)continue;
      const source=offline.createBufferSource(),gain=offline.createGain(),level=clamp((c.volume??100)/100,0,2);
      const prev=ordered.slice(0,ci).reverse().find(x=>x.track===c.track&&x.start+x.duration<=c.start+1/120),next=ordered.slice(ci+1).find(x=>x.track===c.track&&x.start>=c.start+c.duration-1/120);
      const fadeIn=touching(prev,c)?0:Math.min(.004,length/4),fadeOut=touching(c,next)?0:Math.min(.004,length/4),end=c.start+length;
      if(fadeIn>0){gain.gain.setValueAtTime(0,c.start);gain.gain.linearRampToValueAtTime(level,c.start+fadeIn);}else gain.gain.setValueAtTime(level,c.start);
      if(fadeOut>0){gain.gain.setValueAtTime(level,Math.max(c.start+fadeIn,end-fadeOut));gain.gain.linearRampToValueAtTime(0,end);}else gain.gain.setValueAtTime(level,end);
      source.buffer=buffer;source.connect(gain);gain.connect(master);source.start(c.start,sourceOffset,length);sources++;
    }
    if(!sources)return null;
    const mixed=await offline.startRendering();checkExport(job);
    let peak=0;for(let ch=0;ch<mixed.numberOfChannels;ch++){const data=mixed.getChannelData(ch);for(let i=0;i<data.length;i++){if(!Number.isFinite(data[i]))data[i]=0;const a=Math.abs(data[i]);if(a>peak)peak=a;}}
    if(peak>.985){const scale=.985/peak;for(let ch=0;ch<mixed.numberOfChannels;ch++){const data=mixed.getChannelData(ch);for(let i=0;i<data.length;i++)data[i]*=scale;}}
    return mixed;
  };

  // A dedicated 9:16 camera surface. Finished recordings are imported directly to the main media track.
  const oldFacing=$('cameraFacing');if(oldFacing)oldFacing.remove();
  const cameraButton=$('cameraRecord');
  if(cameraButton){
    cameraButton.onpointerdown=null;cameraButton.onpointerup=null;cameraButton.onpointercancel=null;cameraButton.onclick=null;cameraButton.textContent='◉';cameraButton.title='Abrir câmera';cameraButton.classList.remove('recording','paused');
    let d=$('cameraCaptureDialog');
    if(!d){
      d=document.createElement('dialog');d.id='cameraCaptureDialog';
      d.innerHTML='<div class="cameraCaptureShell"><video class="cameraCaptureVideo" autoplay muted playsinline></video><div class="cameraCaptureTop"><button type="button" class="cameraClose" aria-label="Fechar">×</button><span class="cameraCaptureTime">00:00</span><button type="button" class="cameraFlip" aria-label="Trocar câmera">↻</button></div><div class="cameraCaptureHint">Preparando câmera…</div><div class="cameraCaptureBottom"><button type="button" class="cameraPause" disabled>Pausar</button><button type="button" class="cameraShutter" aria-label="Gravar"></button><button type="button" class="cameraFinish" disabled>Finalizar</button></div></div>';
      document.body.append(d);
    }
    const video=d.querySelector('.cameraCaptureVideo'),closeBtn=d.querySelector('.cameraClose'),flipBtn=d.querySelector('.cameraFlip'),pauseBtn=d.querySelector('.cameraPause'),shutter=d.querySelector('.cameraShutter'),finishBtn=d.querySelector('.cameraFinish'),clock=d.querySelector('.cameraCaptureTime'),hint=d.querySelector('.cameraCaptureHint');
    let stream=null,rec=null,chunks=[],facing='user',startedAt=0,elapsedBefore=0,timer=null,finishing=false;
    const setClock=()=>{const ms=elapsedBefore+(rec&&rec.state==='recording'?performance.now()-startedAt:0),sec=Math.floor(ms/1000);clock.textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');};
    const stopTimer=()=>{clearInterval(timer);timer=null;};
    const stopStream=()=>{stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;};
    const resetRecorder=()=>{stopTimer();rec=null;chunks=[];elapsedBefore=0;startedAt=0;finishing=false;shutter.classList.remove('isRecording');pauseBtn.textContent='Pausar';pauseBtn.disabled=true;finishBtn.disabled=true;flipBtn.disabled=false;shutter.disabled=false;clock.textContent='00:00';};
    async function acquire(){stopStream();hint.hidden=false;hint.textContent='Preparando câmera…';try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:1080},height:{ideal:1920}},audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});video.srcObject=stream;await video.play().catch(()=>{});hint.hidden=true;}catch(err){hint.hidden=false;hint.textContent='Não foi possível abrir a câmera. Verifique a permissão do navegador.';throw err;}}
    async function addRecording(blob){
      if(!blob.size)throw Error('A gravação ficou vazia.');
      const mp4=/video\/mp4/i.test(blob.type),cleanType=mp4?'video/mp4':'video/webm',cleanBlob=blob.type===cleanType?blob:new Blob([blob],{type:cleanType});
      const stamp=new Date().toISOString().replace(/[:.]/g,'-'),ext=mp4?'.mp4':'.webm',a={id:uid(),name:'Câmera '+stamp+ext,type:'video',data:await readData(cleanBlob)};
      await loadAsset(a);const dur=Math.max(1/30,Math.floor(a.duration*30)/30),start=mainClips().reduce((n,c)=>Math.max(n,c.start+c.duration),0),c=newClip('video',a.name,a.id,'main',start,dur);
      checkpoint();P.assets.push(a);P.clips.push(c);selected=c.id;t=start;changed();toast('Gravação adicionada à faixa Mídia.');
    }
    async function openCamera(){if(exporting)return;if(!navigator.mediaDevices?.getUserMedia)return toast('Câmera indisponível neste navegador.');pause();resetRecorder();d.showModal();try{await acquire();}catch{}}
    async function beginRecord(){if(!stream){try{await acquire();}catch{return;}}if(rec)return;const candidates=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm'],mime=candidates.find(x=>MediaRecorder.isTypeSupported(x))||'';chunks=[];rec=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:8000000,audioBitsPerSecond:128000}:undefined);rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);rec.onerror=()=>{hint.hidden=false;hint.textContent='Falha durante a gravação.';};rec.onstop=async()=>{const reported=(rec?.mimeType||mime||chunks[0]?.type||'video/webm').toLowerCase(),type=reported.includes('mp4')?'video/mp4':'video/webm',blob=new Blob(chunks,{type});try{if(finishing)await addRecording(blob);}catch(err){toast(err.message);}finally{stopStream();resetRecorder();if(d.open)d.close();}};rec.start(500);startedAt=performance.now();elapsedBefore=0;timer=setInterval(setClock,200);shutter.classList.add('isRecording');pauseBtn.disabled=false;finishBtn.disabled=false;flipBtn.disabled=true;setClock();}
    function togglePause(){if(!rec)return;if(rec.state==='recording'){elapsedBefore+=performance.now()-startedAt;rec.pause();stopTimer();pauseBtn.textContent='Continuar';shutter.classList.remove('isRecording');setClock();}else if(rec.state==='paused'){rec.resume();startedAt=performance.now();timer=setInterval(setClock,200);pauseBtn.textContent='Pausar';shutter.classList.add('isRecording');}}
    function finalize(){if(!rec||finishing)return;finishing=true;if(rec.state==='recording')elapsedBefore+=performance.now()-startedAt;stopTimer();finishBtn.disabled=true;pauseBtn.disabled=true;shutter.disabled=true;rec.stop();}
    function cancelCamera(){if(finishing)return;if(rec&&rec.state!=='inactive'){finishing=false;rec.stop();}else{stopStream();resetRecorder();if(d.open)d.close();}}
    cameraButton.onclick=openCamera;shutter.onclick=()=>rec?togglePause():beginRecord();pauseBtn.onclick=togglePause;finishBtn.onclick=finalize;closeBtn.onclick=cancelCamera;flipBtn.onclick=async()=>{if(rec)return;facing=facing==='user'?'environment':'user';try{await acquire();}catch{}};
    d.addEventListener('cancel',e=>{e.preventDefault();cancelCamera();});
    d.addEventListener('close',()=>{if(!finishing&&(!rec||rec.state==='inactive')){stopStream();resetRecorder();}});
  }

  // One visual diamond per real keyframe. No structural "ghost" endpoint remains after deletion.
  const previousBuild=buildTimeline;
  buildTimeline=function(){
    previousBuild();
    for(const c of P.clips){
      if(c.type==='audio'||c.type==='effect')continue;const node=document.querySelector('.clip[data-id="'+c.id+'"]');if(!node)continue;
      node.querySelectorAll('.edgeKey,.clipKey').forEach(x=>x.remove());
      c.keys.forEach((k,i)=>{const dot=document.createElement('i');dot.className='clipKey';dot.style.left=clamp(k.t*pps,3,Math.max(3,c.duration*pps-8))+'px';dot.dataset.keyIndex=i;dot.classList.toggle('disabledKey',k.enabled===false);dot.title=(Math.abs(k.t)<1e-5?'Início':Math.abs(k.t-c.duration)<1e-5?'Fim':'Intermediário')+' · toque para selecionar';dot.onclick=e=>{e.stopPropagation();pause();selected=c.id;keyIndex=i;$('editScope').value='key';t=c.start+k.t;renderUI(false);};node.append(dot);});
    }
  };
  const hintKey=q('#keyControls .kfHint');if(hintKey)hintKey.textContent='◆ Cada losango é um keyframe real. Se você excluir um, ele some da barra; o clip mantém pelo menos um keyframe.';

  // Faster / stronger animation compositor with a short velocity shake.
  const stablePaint=paintClip;
  function fastAnimPose(c,time){
    const local=time-c.start,base=valueAt(c.keys,clamp(local,0,c.duration)),a=c.animation||{};let spec=null,p=1,side='';
    if(a.in){const d=Math.min(Math.max(.12,a.in.duration||.26),c.duration);if(local<d){spec=a.in;p=clamp01(local/d);side='in';}}
    if(a.out){const d=Math.min(Math.max(.12,a.out.duration||.26),c.duration);if(local>c.duration-d){spec=a.out;p=clamp01((c.duration-local)/d);side='out';}}
    if(!spec&&a.name){const d=Math.min(Math.max(.12,a.duration||.26),c.duration),edge=side==='out'?c.duration-local:local;spec=a;p=clamp01(edge/d);side=a.side||'in';}
    if(!spec)return base;
    const u=1-Math.pow(1-p,3),v={...base},sign=side==='out'?-1:1,shake=Math.sin(p*Math.PI*7)*Math.sin(p*Math.PI)*9;
    switch(spec.name){
      case 'Fade in':case 'Fade out':v.opacity=base.opacity*u;break;
      case 'Zoom suave':v.scale=base.scale*(.76+.24*u+Math.sin(p*Math.PI)*.025);break;
      case 'Zoom impacto':v.scale=base.scale*(.50+.50*u+Math.sin(p*Math.PI)*.075);v.x+=shake*.65;v.y+=shake*.28;v.rotation+=shake*.10;break;
      case 'Deslizar cima':v.y=base.y+sign*(1-u)*680;v.x+=shake*.55;v.rotation+=shake*.055;break;
      case 'Deslizar baixo':v.y=base.y-sign*(1-u)*680;v.x+=shake*.55;v.rotation-=shake*.055;break;
      case 'Deslizar esquerda':v.x=base.x+sign*(1-u)*680;v.y+=shake*.38;v.rotation+=shake*.05;break;
      case 'Deslizar direita':v.x=base.x-sign*(1-u)*680;v.y+=shake*.38;v.rotation-=shake*.05;break;
      case 'Pop':v.scale=base.scale*(.38+.62*u+Math.sin(p*Math.PI)*.12);v.x+=shake*.45;v.rotation+=shake*.09;break;
      case 'Bounce':v.scale=base.scale*(.58+.42*u+Math.sin(p*Math.PI*2.7)*(1-p)*.14);v.y-=Math.abs(Math.sin(p*Math.PI))*20*(1-p);break;
      case 'Giro curto':v.rotation=base.rotation+sign*(1-u)*18+shake*.17;v.scale=base.scale*(.82+.18*u);break;
      case 'Escala elástica':v.scale=base.scale*(.55+.45*u+Math.sin(p*Math.PI*3.2)*(1-p)*.12);v.rotation+=shake*.055;break;
      case 'Revelar':v.opacity=base.opacity*u;v.scale=base.scale*(.86+.14*u);v.y+=shake*.22;break;
      case 'Pulso':v.scale=base.scale*(1+Math.sin(p*Math.PI)*.16);v.x+=shake*.32;v.rotation+=shake*.045;break;
      case 'Combinação':v.opacity=base.opacity*u;v.scale=base.scale*(.54+.46*u+Math.sin(p*Math.PI)*.07);v.x=base.x+sign*(1-u)*300+shake*.6;v.y+=shake*.25;v.rotation+=shake*.11;break;
    }return v;
  }
  paintClip=function(g,c,time,pw,ph){if(!c.animation||c.type==='audio')return stablePaint(g,c,time,pw,ph);const poseNow=fastAnimPose(c,time),copy={...c,animation:null,keys:[{t:0,v:poseNow},{t:Math.max(.001,c.duration),v:poseNow}]};return stablePaint(g,copy,time,pw,ph);};

  async function attachAniSound(file,c,side){if(!file)return;const spec=c.animation?.[side];if(!spec)return;try{const a={id:uid(),name:'Som · '+file.name,type:'audio',data:await readData(file)};await loadAsset(a);act(()=>{P.assets.push(a);const key=c.id+':'+side;P.clips=P.clips.filter(x=>x.eventSoundFor!==key);const dur=Math.min(spec.duration||.26,c.duration),start=side==='out'?c.start+c.duration-dur:c.start,s=newClip('audio','Som da animação · '+file.name,a.id,'music',Math.max(0,snapFrame(start)),dur);s.volume=60;s.eventSoundFor=key;P.clips.push(s);spec.soundAsset=a.id;spec.soundVolume=60;});toast('Som associado à animação.');}catch(err){toast(err.message);}}
  window.openAnimationPicker=function(c){
    let d=$('aniDialog');if(!d){d=document.createElement('dialog');d.id='aniDialog';document.body.append(d);}const names=['Zoom suave','Zoom impacto','Fade in','Fade out','Deslizar cima','Deslizar baixo','Deslizar esquerda','Deslizar direita','Pop','Bounce','Giro curto','Escala elástica','Revelar','Pulso','Combinação'];
    d.innerHTML='<div class="aniHeader"><h2>Animação · 0,26 s</h2><button type="button" class="aniClose">×</button></div><div class="aniSides"><button type="button" data-side="in" class="active">Entrada</button><button type="button" data-side="out">Saída</button></div><div class="aniChoices"></div><div class="aniSoundRow"><button type="button" id="aniSoundAdd">Adicionar som</button><button type="button" id="aniSoundRemove">Remover som</button><input id="aniSoundInput" type="file" accept="audio/*" hidden></div>';
    const box=d.querySelector('.aniChoices'),sides=[...d.querySelectorAll('[data-side]')];let side='in';
    const render=()=>{box.replaceChildren();for(const name of names){const b=document.createElement('button');b.type='button';b.textContent=name;b.onclick=()=>{act(()=>{c.animation??={};c.animation[side]={name,duration:.3,volume:60,soundAsset:c.animation[side]?.soundAsset||null};});d.close();};box.append(b);}};
    sides.forEach(b=>b.onclick=()=>{side=b.dataset.side;sides.forEach(x=>x.classList.toggle('active',x===b));render();});d.querySelector('.aniClose').onclick=()=>d.close();d.querySelector('#aniSoundAdd').onclick=()=>d.querySelector('#aniSoundInput').click();d.querySelector('#aniSoundRemove').onclick=()=>{act(()=>{P.clips=P.clips.filter(x=>x.eventSoundFor!==c.id+':'+side);if(c.animation?.[side])delete c.animation[side].soundAsset;});};d.querySelector('#aniSoundInput').onchange=async e=>{await attachAniSound(e.target.files?.[0],c,side);e.target.value='';};render();d.showModal();
  };

  // Drag ANI like TRAN: a visible ANI button follows the finger while the hovered media keeps the blue target layer.
  const ani=$('aniDrag');if(ani){
    ani.style.transform='';let dragging=false,moved=false,target=null,startX=0,startY=0,ghost=null;
    const placeGhost=e=>{if(!ghost)return;ghost.style.left=(e.clientX-24)+'px';ghost.style.top=(e.clientY-24)+'px';};
    const clear=()=>{document.querySelectorAll('.aniDropHover').forEach(x=>x.classList.remove('aniDropHover'));target=null;ani.classList.remove('isDragging');ghost?.remove();ghost=null;};
    const pick=(x,y)=>{let node=document.elementFromPoint(x,y)?.closest?.('.clip');if(!node||!node.closest('#timelineScroll'))node=null;const c=node&&P.clips.find(v=>v.id===node.dataset.id);if(!c||['audio','effect'].includes(c.type))node=null;if(node!==target){target?.classList.remove('aniDropHover');target=node;target?.classList.add('aniDropHover');}return c&&node?c:null;};
    ani.onpointerdown=e=>{if(e.button>0||exporting)return;e.preventDefault();dragging=true;moved=false;startX=e.clientX;startY=e.clientY;ani.classList.add('isDragging');ghost=document.createElement('div');ghost.className='aniDrag aniGhost isDragging';ghost.textContent='ANI';document.body.append(ghost);placeGhost(e);ani.setPointerCapture?.(e.pointerId);};
    ani.onpointermove=e=>{if(!dragging)return;e.preventDefault();placeGhost(e);if(Math.hypot(e.clientX-startX,e.clientY-startY)>6)moved=true;if(moved)pick(e.clientX,e.clientY);};
    ani.onpointerup=e=>{if(!dragging)return;dragging=false;const c=moved?pick(e.clientX,e.clientY):current();clear();try{ani.releasePointerCapture?.(e.pointerId);}catch{}if(c){select(c.id);window.openAnimationPicker(c);}else if(moved)toast('Solte o ANI sobre uma mídia visual.');};
    ani.onpointercancel=e=>{dragging=false;clear();try{ani.releasePointerCapture?.(e.pointerId);}catch{}};
  }

  // Make the neutral themes win over the earlier aqua skin after switching.
  const swatches=$('themeSwatches');if(swatches)swatches.querySelectorAll('.themeSwatch').forEach(b=>b.setAttribute('aria-label',b.title));
})();

renderUI();/* v19: native launcher owns project restore */
