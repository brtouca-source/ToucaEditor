'use strict';
(function(root){
 const clean=s=>String(s).replace(/\[[^\]]*\]/g,' ').replace(/\s+/g,' ').trim();
 function parse(raw){raw=String(raw||'');const parts=raw.split('◆'),scenes=[];let word=0;for(const part of parts){const text=clean(part);if(!text)continue;scenes.push({text,wordIndex:word});word+=text.split(/\s+/).length;}return {version:1,raw,ttsText:raw.replace(/◆/g,' ').replace(/\s+/g,' ').trim(),spokenText:scenes.map(x=>x.text).join(' '),scenes};}
 function natural(files){const cmp=new Intl.Collator('pt-BR',{numeric:true,sensitivity:'base'});return files.map((file,i)=>({file,i})).sort((a,b)=>cmp.compare(a.file.name,b.file.name)||a.i-b.i).map(x=>x.file);}
 function boundaries(plan,alignment,duration){return plan.scenes.map((scene,i)=>{const w=alignment.words[scene.wordIndex];const reliable=!!w?.anchor&&w.score>=.86;return {...scene,time:i===0?0:reliable?Math.min(duration,w.start):null,review:i>0&&!reliable};});}
 function intervals(points,duration,fps=30){const min=1/fps;if(!Number.isFinite(duration)||duration<=0)throw Error('Duração de áudio inválida.');if(!points.length||points[0]!==0)throw Error('A primeira cena começa em zero.');return points.map((start,i)=>{const end=points[i+1]??duration;if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>duration+1e-6||end-start<min-1e-6)throw Error('Revise os tempos: cenas devem estar em ordem e durar pelo menos um frame.');return {start,duration:end-start};});}
 const api={parse,natural,boundaries,intervals};if(typeof module!=='undefined')module.exports=api;else root.ToucaSceneModel=api;
})(typeof window==='undefined'?globalThis:window);
