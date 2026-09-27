'use strict';
// Portable semantic edit decisions -> existing, editable Touca timeline.
const {randomUUID}=require('crypto');
const finite=(v,name,min=-1e9,max=1e9)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('Valor inválido: '+name);return v;};
const pose=()=>({x:0,y:0,scale:100,rotation:0,opacity:100});
const trackSet=new Set(['main','overlay','overlay2','overlay3','overlay4','overlay5','overlay6','overlay7','subtitle','voice','music','audio3','audio4','audio5']);
function safePath(p){if(typeof p!=='string'||!p||p.includes('\\')||p.includes(':')||p.includes('\0')||p.startsWith('/')||p.split('/').some(x=>x==='..'||x==='.'||!x))throw Error('Caminho de mídia inválido');return p;}
function textStyle(s={}){const allowed=['font','fontSize','color','stroke','strokeColor','shadowColor','shadowBlur','textBg','textBgOpacity','fontWeight','align'];return Object.fromEntries(Object.entries(s||{}).filter(([k])=>allowed.includes(k)));}
function compile(doc){
 if(doc?.format!=='touca-project'||doc.version!==1)throw Error('Esperado touca-project versão 1');
 const ratio=doc.settings?.ratio||'9:16',sizes={'9:16':[1080,1920],'16:9':[1920,1080],'1:1':[1080,1080]};if(!sizes[ratio])throw Error('Proporção não suportada');
 const [w,h]=sizes[ratio],fps=doc.settings?.fps||30;if(![30,60].includes(fps))throw Error('FPS deve ser 30 ou 60');
 if(doc.settings?.width&&doc.settings.width!==w||doc.settings?.height&&doc.settings.height!==h)throw Error('Resolução incompatível com a proporção');
 if(!Array.isArray(doc.assets)||doc.assets.length>5000)throw Error('Lista de assets inválida');
 const ids=new Set(),assets=doc.assets.map(a=>{if(!a.id||ids.has(a.id)||!/^[a-zA-Z0-9_-]{1,100}$/.test(a.id))throw Error('ID de mídia inválido/duplicado');ids.add(a.id);if(!['image','video','audio'].includes(a.type))throw Error('Tipo de mídia inválido');safePath(a.path);if(a.type!=='audio'){finite(a.width,'largura',1,100000);finite(a.height,'altura',1,100000);}return {id:a.id,name:a.name||a.path.split('/').pop(),type:a.type,path:a.path,width:a.width,height:a.height,duration:a.duration,regions:a.regions||{}};});
 const byId=new Map(assets.map(a=>[a.id,a]));let clips=[];const used=new Set();
 function clip(s,index){const a=byId.get(s.asset);const type=s.type||a?.type;if(!['image','video','audio','text','subtitle'].includes(type)||(['image','video','audio'].includes(type)&&(!a||a.type!==type)))throw Error('Asset/tipo ausente na cena '+index);
  const start=finite(s.start,'início',0,7200),end=finite(s.end,'fim',start+1/fps-1e-6,7200),duration=end-start;
  const track=s.track||(type==='audio'?'voice':type==='subtitle'?'subtitle':type==='text'?'overlay':'main');if(!trackSet.has(track))throw Error('Trilha desconhecida');
  if(track==='main'&&!['image','video'].includes(type))throw Error('Trilha principal exige mídia');
  const id=s.id||'clip-'+index;if(used.has(id))throw Error('ID de clip duplicado');used.add(id);
  let base={...pose(),...s.transform};for(const k of Object.keys(pose()))finite(base[k],k);finite(base.scale,'escala',5,2000);finite(base.opacity,'opacidade',0,100);
  const region=typeof s.region==='string'?a?.regions?.[s.region]:s.region;
  if(s.region&&!region)throw Error('Região não encontrada: '+s.region);
  if(region){const {x,y,width,height}=region;[x,y].forEach(v=>finite(v,'região',0,1));[width,height].forEach(v=>finite(v,'região',.001,1));if(x+width>1.00001||y+height>1.00001)throw Error('Região fora da página');const fit=Math.min(w/a.width,h/a.height),zoom=Math.max(w/(a.width*width),h/(a.height*height));base.scale=zoom/fit*100;base.x=-(x+width/2-.5)*a.width*zoom;base.y=-(y+height/2-.5)*a.height*zoom;finite(base.scale,'escala de região',5,2000);}
  let keys=[{t:0,v:{...base},ease:'linear',static:true}];
  if(s.motion&&s.motion!=='hold'){const endPose={...base};switch(s.motion){case'slow_push':case'push':endPose.scale*=1.10;endPose.x*=1.10;endPose.y*=1.10;break;case'pull':endPose.scale/=1.1;endPose.x/=1.1;endPose.y/=1.1;break;case'left':endPose.x-=w*.065;break;case'right':endPose.x+=w*.065;break;case'up':endPose.y-=h*.045;break;case'down':endPose.y+=h*.045;break;default:throw Error('Movimento desconhecido: '+s.motion);}keys=[{t:0,v:base,ease:'inout'},{t:duration,v:endPose,ease:'inout'}];}
  if(s.keyframes){if(!Array.isArray(s.keyframes)||!s.keyframes.length)throw Error('Keyframes vazios');keys=s.keyframes.map(k=>({t:finite(k.time,'tempo keyframe',0,duration),v:{...base,...k.transform},ease:k.easing==='smooth'?'inout':k.easing||'inout'})).sort((a,b)=>a.t-b.t);if(keys.some((k,i)=>i&&Math.abs(k.t-keys[i-1].t)<1e-5))throw Error('Keyframes duplicados');}
  for(const k of keys){for(const name of Object.keys(pose()))finite(k.v[name],name);finite(k.v.scale,'escala',5,2000);finite(k.v.opacity,'opacidade',0,100);if(!['linear','inout','in','out'].includes(k.ease))throw Error('Easing não suportado');}
  const c={editorial:{focus:s.focus||null,reason:s.reason||null,region:s.region||null},id,type,name:s.text||s.name||a?.name||type,asset:a?.id||null,track,start,duration,offset:s.offset??0,fit:'contain',volume:s.volume??100,muted:!!s.muted,keys,v26AutoEndKey:false,externalTiming:true};finite(c.offset,'offset',0,7200);finite(c.volume,'volume',0,200);if(a?.duration&&type!=='image'&&c.offset+duration>a.duration+1/fps)throw Error('Clip ultrapassa a mídia');
  if(type==='text'||type==='subtitle'){Object.assign(c,{text:String(s.text||''),font:'Bangers',fontSize:100,color:'#ffffff',stroke:3,strokeColor:'#000000',...textStyle(doc.captionStyle),...textStyle(s.style)});if(!s.transform&&!region){c.keys.forEach(k=>k.v.y=h*.10);}if(s.logo){c.brand=true;c.logoOpacity=50;c.keys.forEach(k=>{k.v.opacity=50;k.v.y=h*.17;});}}
  // Unsupported geometry fails explicitly rather than silently changing the art.
  if(s.mask||s.crop)throw Error('Use region (retângulo normalizado) nesta versão; máscara/crop arbitrário ainda não suportado');
  if(s.transition_in)c.transition={type:s.transition_in.type||s.transition_in,duration:s.transition_in.duration||.4,intensity:s.transition_in.intensity??.45,softness:s.transition_in.softness??.18,direction:s.transition_in.direction||'left',sound:'none',volume:0};
  if(c.transition){finite(c.transition.duration,'transição',.05,3);finite(c.transition.intensity,'intensidade',0,1);finite(c.transition.softness,'suavidade',.01,.5);}
  return c;
 }
 let scenes=doc.scenes||doc.clips;if(Array.isArray(scenes)&&doc.logo?.text){scenes=[...scenes,{type:'text',text:doc.logo.text,logo:true,start:0,end:Math.max(...scenes.map(s=>s.end)),style:{fontSize:doc.logo.fontSize||58}}];}if(!Array.isArray(scenes)||scenes.length>50000)throw Error('Cenas inválidas');clips=scenes.map(clip);
 const main=clips.filter(c=>c.track==='main').sort((a,b)=>a.start-b.start);for(let i=1;i<main.length;i++){if(main[i].start<main[i-1].start+main[i-1].duration-1e-5)throw Error('Clips principais sobrepostos');const spec=scenes[clips.indexOf(main[i-1])]?.transition_out;if(spec&&!main[i].transition)main[i].transition={type:typeof spec==='string'?spec:spec.type,duration:.4,intensity:.45,sound:'none',volume:0};}
 return {version:1,projectSchemaVersion:3,editorVersion:'30.0.0',projectId:randomUUID(),name:doc.name||'Projeto pré-editado',ratio,fps,assets,clips,metadata:doc.metadata||{},sourceFormat:{format:doc.format,version:doc.version},captionStyle:doc.captionStyle||{}};
}
module.exports={compile,safePath};
