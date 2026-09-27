'use strict';
(function(root){
 function events(project){
  const result=[],visual=project.clips.filter(c=>['image','video','text','subtitle','arrow'].includes(c.type));
  const main=visual.filter(c=>c.track==='main').sort((a,b)=>a.start-b.start),trans=new Map();
  for(let i=1;i<main.length;i++){const a=main[i-1],b=main[i],s=b.transition;if(s&&s.type!=='none'&&s.enabled!==false&&Math.abs(a.start+a.duration-b.start)<1e-5&&(!s.from||s.from===a.id))trans.set(b.id,{a,b,s});}
  function push(c,side,s,start,duration){if(!s?.soundAsset||s.enabled===false)return;const asset=project.assets.find(a=>a.id===s.soundAsset);if(!asset)return;const raw=start,offset=Math.max(0,-raw);start=Math.max(0,raw);duration=Math.min(duration-offset,asset.duration-offset,c.start+c.duration-start);if(duration<=0)return;result.push({key:c.id+':'+side,clipId:c.id,side,asset:s.soundAsset,start,offset,duration,volume:s.soundVolume??60});}
  for(const c of visual){const tr=trans.get(c.id);if(tr){const d=Math.min(tr.s.duration||.3,c.duration,tr.a.duration);push(c,'transition',tr.s,c.start-d/2,d);}
   const a=c.animation||{in:c.animationIn,out:c.animationOut};
   for(const side of ['in','out']){const s=a?.[side];if(!s||s.enabled===false)continue;const boundary=side==='in'?trans.has(c.id):[...trans.values()].some(tr=>tr.a.id===c.id);if(boundary)continue;const d=Math.min(s.duration||.3,c.duration);push(c,side,s,side==='in'?c.start:c.start+c.duration-d,d);}
  }return result;
 }
 const api={events};if(typeof module!=='undefined')module.exports=api;else root.ToucaEventSounds=api;
})(typeof window==='undefined'?globalThis:window);
