'use strict';
(function(root){
 const family=track=>track==='voice'||track==='music'||/^audio\d+$/.test(track)?'audio':/^effects/.test(track)?'effect':'visual';
 const mediaFamily=clip=>clip.type==='audio'?'audio':clip.type==='effect'?'effect':'visual';
 const accepts=(clip,track)=>!!clip&&typeof track==='string'&&/^(main|overlay[2-7]?|subtitle|voice|music|audio[3-5]|effects(?:Local|[2-5])?)$/.test(track)&&family(track)===mediaFamily(clip);
 function move(clip,track,start){if(!accepts(clip,track)||!Number.isFinite(start)||start<0)return false;clip.track=track;clip.start=start;return true;}
 function validate(p){if(!p||!Array.isArray(p.assets)||!Array.isArray(p.clips))throw Error('Projeto inválido');const ids=new Set();for(const c of p.clips){if(!c.id||ids.has(c.id))throw Error('Identificador de clip duplicado');ids.add(c.id);if(!Number.isFinite(c.start)||!Number.isFinite(c.duration)||c.start<0||c.duration<=0)throw Error('Tempos inválidos');}return p;}
 function animationWindow(clip,side){const binding=clip.animation?.[side];if(!binding)return null;const duration=Math.min(clip.duration,Math.max(0,Number(binding.duration)||.4));return {start:side==='out'?clip.start+clip.duration-duration:clip.start,end:side==='out'?clip.start+clip.duration:clip.start+duration};}
 const api=Object.freeze({family,mediaFamily,accepts,move,validate,animationWindow});if(typeof module!=='undefined')module.exports=api;else root.ToucaTimeline=api;
})(typeof window!=='undefined'?window:globalThis);
