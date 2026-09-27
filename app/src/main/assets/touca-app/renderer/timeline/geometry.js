(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.toucaTimelineGeometry31=api;})(typeof window==='undefined'?globalThis:window,()=>{
 'use strict';
 // Eight CSS pixels between normal clips. This never writes to project time or duration.
 function box(clip,pps,gutters){
  const span=Math.max(0,Number(clip.duration)||0)*Math.max(1,Number(pps)||1);
  const inset=Math.min(4,Math.max(0,(span-8)/2));
  const left=gutters?.left??inset,right=gutters?.right??inset;return {left:Math.max(0,Number(clip.start)||0)*Math.max(1,Number(pps)||1)+left,width:Math.max(1,span-left-right),inset:left,span};
 }
 function apply(node,clip,pps,gutters){const b=box(clip,pps,gutters);node.style.left=b.left+'px';node.style.width=b.width+'px';node.style.setProperty('--clip-visual-inset',b.inset+'px');return b;}
 return {box,apply};
});
