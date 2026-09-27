(()=>{
'use strict';
// Touca Editor v22 — caption script alignment only. All other editor behavior stays on v21.
const VERSION22='22.0.0';
const by=id=>document.getElementById(id);

function esc22(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function norm22(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'');}
function lev22(a,b){if(a===b)return 0;if(!a)return b.length;if(!b)return a.length;let prev=new Uint16Array(b.length+1),cur=new Uint16Array(b.length+1);for(let j=0;j<=b.length;j++)prev[j]=j;for(let i=1;i<=a.length;i++){cur[0]=i;for(let j=1;j<=b.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));[prev,cur]=[cur,prev];}return prev[b.length];}
function sim22(a,b){a=norm22(a);b=norm22(b);if(!a||!b)return 0;if(a===b)return 1;if(a.length>=4&&b.length>=4&&(a.includes(b)||b.includes(a)))return .82;if(a[0]!==b[0]&&a.at(-1)!==b.at(-1))return 0;const d=lev22(a,b),m=Math.max(a.length,b.length);return Math.max(0,1-d/m);}
function splitAsr22(chunks,maxDuration){const out=[];for(const c of chunks||[]){if(!c?.timestamp||!Number.isFinite(c.timestamp[0]))continue;const raw=String(c.text||'').trim();if(!raw)continue;const toks=raw.split(/\s+/).filter(Boolean);const start=Math.max(0,Math.min(maxDuration,c.timestamp[0]));const end=Math.max(start,Math.min(maxDuration,Number.isFinite(c.timestamp[1])?c.timestamp[1]:start+.35));const weights=toks.map(x=>Math.max(1,norm22(x).length)),sum=weights.reduce((a,b)=>a+b,0)||toks.length;let acc=0;for(let i=0;i<toks.length;i++){const a=start+(end-start)*(acc/sum);acc+=weights[i];const b=start+(end-start)*(acc/sum);out.push({raw:toks[i],norm:norm22(toks[i]),start:a,end:Math.max(a+.02,b)});}}return out.sort((a,b)=>a.start-b.start);}
function splitScript22(text){return String(text||'').trim().split(/\s+/).filter(Boolean).map((raw,i)=>({raw,norm:norm22(raw),i,weight:Math.max(1,norm22(raw).length)}));}

// Banded global alignment. It is tolerant of a few ASR mistakes, then interpolates words that Whisper missed.
function alignScript22(scriptText,chunks,maxDuration){const s=splitScript22(scriptText),a=splitAsr22(chunks,maxDuration);if(!s.length)throw Error('Cole a narração completa antes de sincronizar.');if(!a.length)throw Error('Não encontrei palavras com tempo no áudio.');
 const n=s.length,m=a.length,INF=1e9,band=Math.max(90,Math.min(512,Math.abs(m-n)+55)),width=band*2+1;
 // Store only the searched band. Previous implementation allocated n*m cells
 // despite visiting a narrow band, exhausting RAM on long narrations.
 const dir=new Uint8Array((n+1)*width),starts=new Int32Array(n+1);
 let previous=new Float32Array(width),current=new Float32Array(width),previousStart=0,previousEnd=Math.min(m,band);
 previous.fill(INF);for(let j=0;j<=previousEnd;j++){previous[j]=j*.72;if(j)dir[j]=2;}
 for(let i=1;i<=n;i++){
  const center=Math.round(i*m/Math.max(1,n)),j0=Math.max(0,center-band),j1=Math.min(m,center+band);starts[i]=j0;current.fill(INF);
  const prev=j=>j>=previousStart&&j<=previousEnd?previous[j-previousStart]:INF;
  if(j0===0){current[0]=i*.88;dir[i*width]=1;}
  for(let j=Math.max(1,j0);j<=j1;j++){
   const score=sim22(s[i-1].norm,a[j-1].norm),penalty=score>=.86?(1-score)*.45:score>=.58?.38+(1-score)*.65:score>=.42?.78+(1-score)*.55:1.28;
   let best=prev(j-1)+penalty,d=3;const del=prev(j)+.88;if(del<best){best=del;d=1;}
   const ins=j>j0?current[j-j0-1]+.72:INF;if(ins<best){best=ins;d=2;}current[j-j0]=best;dir[i*width+j-j0]=d;
  }
  [previous,current]=[current,previous];previousStart=j0;previousEnd=j1;
 }
 const idx=(i,j)=>j>=starts[i]&&j<starts[i]+width?i*width+j-starts[i]:-1;
 let i=n,j=m;const anchors=[];while(i>0||j>0){const d=dir[idx(i,j)];if(d===3&&i>0&&j>0){const sc=sim22(s[i-1].norm,a[j-1].norm);if(sc>=.42)anchors.push({si:i-1,aj:j-1,score:sc,start:a[j-1].start,end:a[j-1].end});i--;j--;}else if(d===1&&i>0)i--;else if(d===2&&j>0)j--;else{if(i>0)i--;else if(j>0)j--;}}
 anchors.reverse();
 // Add merged-word anchors for common ASR splits such as "Fairy Land" vs "Fairyland".
 const usedS=new Set(anchors.map(x=>x.si)),usedA=new Set(anchors.map(x=>x.aj));for(let si=0;si<n;si++){if(usedS.has(si)||!s[si].norm)continue;for(let aj=0;aj<m-1;aj++){if(usedA.has(aj)||usedA.has(aj+1))continue;const merged=a[aj].norm+a[aj+1].norm;if(merged&&sim22(s[si].norm,merged)>=.86){anchors.push({si,aj,score:.9,start:a[aj].start,end:a[aj+1].end});usedS.add(si);usedA.add(aj);usedA.add(aj+1);break;}}}
 anchors.sort((x,y)=>x.si-y.si||x.start-y.start);
 // Keep only monotonic anchors.
 const clean=[];let lastTime=-1,lastSi=-1;for(const x of anchors){if(x.si<=lastSi||x.start+1e-4<lastTime)continue;clean.push(x);lastSi=x.si;lastTime=x.end;}
 const times=new Array(n),anchorByS=new Map(clean.map(x=>[x.si,x]));for(const x of clean)times[x.si]={start:x.start,end:x.end,score:x.score,anchor:true};
 let cursor=0;while(cursor<n){if(times[cursor]){cursor++;continue;}let left=cursor-1;while(left>=0&&!times[left])left--;let right=cursor;while(right<n&&!times[right])right++;const segStart=cursor,segEnd=right-1,from=left>=0?times[left].end:0,to=right<n?times[right].start:maxDuration;const span=Math.max(.03,to-from),weights=[];let sum=0;for(let k=segStart;k<=segEnd;k++){const w=Math.max(1,s[k].weight);weights.push(w);sum+=w;}let acc=0;for(let k=segStart;k<=segEnd;k++){const w=weights[k-segStart],st=from+span*(acc/sum);acc+=w;const en=from+span*(acc/sum);times[k]={start:st,end:Math.max(st+.02,en),score:0,anchor:false};}cursor=right;}
 // Enforce monotonic non-overlapping word windows and remain inside the source clip.
 let prev=0;for(let k=0;k<n;k++){let st=Math.max(prev,Math.min(maxDuration,times[k].start)),en=Math.max(st+.035,Math.min(maxDuration,times[k].end));if(k<n-1)en=Math.min(en,Math.max(st+.035,times[k+1].start));times[k].start=st;times[k].end=Math.min(maxDuration,en);prev=times[k].end;}
 const coverage=clean.length/n,avg=clean.length?clean.reduce((x,y)=>x+y.score,0)/clean.length:0,confidence=Math.round(Math.max(0,Math.min(100,(coverage*.68+avg*.32)*100)));
 return {words:s.map((w,k)=>({text:w.raw,start:times[k].start,end:times[k].end,anchor:times[k].anchor,score:times[k].score})),confidence,matched:clean.length,total:n,asrWords:m};
}

function installScriptCaptionUI22(){const dlg=by('asrDialog');if(!dlg||by('v22CaptionMode'))return;const stack=dlg.querySelector('.stack');const source=by('asrSource')?.closest('label');if(!stack||!source)return;const block=document.createElement('section');block.id='v22CaptionMode';block.className='v22CaptionMode';block.innerHTML=`
  <div class="v22ModeTabs" role="tablist" aria-label="Modo de legenda">
    <button type="button" data-v22-mode="audio" class="active">Do áudio</button>
    <button type="button" data-v22-mode="script">Com roteiro</button>
  </div>
  <div id="v22ScriptPane" class="v22ScriptPane" hidden>
    <label class="field"><span>Narração completa</span><textarea id="v22ScriptText" rows="8" spellcheck="true" placeholder="Cole aqui exatamente o texto que foi narrado..."></textarea></label>
    <div class="v22ScriptInfo"><span id="v22ScriptCount">0 palavras</span><span>O roteiro fornece as palavras; o Whisper serve apenas para sincronizar o tempo.</span></div>
  </div>`;
 source.insertAdjacentElement('afterend',block);
 const pane=by('v22ScriptPane'),text=by('v22ScriptText'),start=by('startAsr');let mode='audio';
 const setMode=m=>{mode=m;block.dataset.mode=m;for(const b of block.querySelectorAll('[data-v22-mode]'))b.classList.toggle('active',b.dataset.v22Mode===m);pane.hidden=m!=='script';if(start)start.textContent=m==='script'?'Sincronizar roteiro':'Transcrever';if(m==='script'&&P?.captionScript&&!text.value)text.value=P.captionScript;update();};
 const update=()=>{const n=splitScript22(text.value).length;by('v22ScriptCount').textContent=`${n} palavra${n===1?'':'s'}`;};
 block.addEventListener('click',e=>{const b=e.target.closest('[data-v22-mode]');if(b)setMode(b.dataset.v22Mode);});text.addEventListener('input',update);dlg.addEventListener('close',()=>{if(mode==='script'&&text.value.trim())P.captionScript=text.value.trim();});
 window.__toucaCaptionScript22={get mode(){return mode;},setMode,text};setMode('audio');
}

const receive21=receiveTranscript;
receiveTranscript=function(result){const req=asrRequest;if(!req?.scriptText)return receive21(result);let aligned;try{setAsrStatus('Sincronizando roteiro…','As palavras virão exatamente do texto colado.',96);aligned=alignScript22(req.scriptText,result.chunks||[],req.snapshot.duration);}catch(e){failTranscription(e.message);return;}
 if(req.scenePlan){
  // Scene boundaries only trust individual word timestamps, never interpolated phrase timings.
  const timedWords=new Set((result.chunks||[]).filter(c=>String(c.text||'').trim().split(/\s+/).length===1&&c.timestamp).map(c=>norm22(c.text)+'@'+Number(c.timestamp[0]).toFixed(3)));
  for(const w of aligned.words)if(!timedWords.has(norm22(w.text)+'@'+Number(w.start).toFixed(3)))w.anchor=false;
  clearInterval(asrWatchdog);asrWatchdog=null;asrBusy=false;asrRequest=null;by('startAsr').disabled=false;by('cancelAsr').textContent='Fechar';
  try{window.ToucaScenes.onAligned(req,aligned);}catch(e){failTranscription(e.message);}return;
 }
 const {snapshot,pop,replace}=req;if(!aligned.words.length){failTranscription('O roteiro não contém palavras para gerar legendas.');return;}checkpoint();if(replace)P.clips=P.clips.filter(c=>c.type!=='subtitle'||c.start+c.duration<=snapshot.start||c.start>=snapshot.start+snapshot.duration);
 for(const w of aligned.words){if(w.end<=w.start)continue;const cap=makeCaption(w.text,snapshot.start+w.start,snapshot.start+w.end,pop);cap.sourceClip=snapshot.id;cap.scriptAligned=true;cap.scriptConfidence=w.anchor?w.score:0;P.clips.push(cap);}P.captionScript=req.scriptText;clearInterval(asrWatchdog);asrWatchdog=null;asrBusy=false;asrRequest=null;by('startAsr').disabled=false;by('cancelAsr').textContent='Fechar';changed();const detail=aligned.confidence>=80?`Roteiro sincronizado com ${aligned.confidence}% de confiança. As palavras vieram exatamente do texto colado.`:`Palavras exatas do roteiro aplicadas. Confiança de timing: ${aligned.confidence}%. Revise apenas os trechos em que a fala divergir do roteiro.`;setAsrStatus(aligned.words.length+' legendas criadas.',detail,100);};

const transcribe21=transcribe;
transcribe=async function(){installScriptCaptionUI22();const cfg=window.__toucaCaptionScript22,scriptMode=cfg?.mode==='script',script=cfg?.text?.value?.trim()||'';if(scriptMode&&!script){setAsrStatus('Cole a narração completa.','No modo Com roteiro, esse texto será a fonte oficial de todas as palavras.',0);cfg?.text?.focus();return;}const pending=scriptMode?script:'';await transcribe21();if(pending&&asrRequest){asrRequest.scriptText=pending;P.captionScript=pending;}};
by('startAsr')&&(by('startAsr').onclick=transcribe);

const showASR21=showASR;
showASR=function(){showASR21();installScriptCaptionUI22();const cfg=window.__toucaCaptionScript22;if(cfg?.text&&P?.captionScript&&!cfg.text.value)cfg.text.value=P.captionScript;};
by('asrBtn')&&(by('asrBtn').onclick=showASR);

installScriptCaptionUI22();
console.info('Touca Editor v22 caption script alignment ready');
})();
