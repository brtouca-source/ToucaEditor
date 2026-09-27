'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('export keeps distinct frames for repeated media and decodes moving transition sides',async()=>{
 const code=fs.readFileSync(path.join(__dirname,'../renderer/legacy/v28.js'),'utf8');const part=code.slice(0,code.indexOf('  let directJob28='))+'})();';
 const frames=[],painted=[];const media={id:'asset',data:'media'};
 const a={id:'a',asset:'asset',type:'video',start:0,duration:3,offset:0};const b={id:'b',asset:'asset',type:'video',start:3,duration:3,offset:10};
 class Worker{postMessage(m){const result={id:m.id,ok:true};if(m.type==='frame'){result.frame={clip:m.clipId,timestamp:m.targetUs,close(){this.closed=true;}};frames.push(result.frame);}queueMicrotask(()=>this.onmessage({data:result}));}}
 const ctx={document:{getElementById:()=>null,documentElement:{dataset:{}}},window:{},P:{assets:[media]},cache:new Map([['asset',{el:{original:true}}]]),VideoFrame:function(){},Worker,setTimeout,clearTimeout,queueMicrotask,console,exporting:true,visibleClips:()=>[a],transitionAt:()=>({prev:a,clip:b}),primeTransitionMedia:()=>{throw Error('legacy transition should not run');},paintClip:(_g,c)=>painted.push({id:c.id,frame:ctx.cache.get(c.asset).el,edge:c.__transitionEdge})};
 vm.createContext(ctx);vm.runInContext(part,ctx);
 await ctx.window.prepareExportFrame(2.9,{});ctx.paintClip(null,{...a,__transitionEdge:'tail'},2.9,100,100);ctx.paintClip(null,{...b,__transitionEdge:'head'},3,100,100);
 assert.equal(painted[0].frame.timestamp,2900000);assert.equal(painted[1].frame.timestamp,10000000);assert.notEqual(painted[0].frame,painted[1].frame);assert.equal(painted[0].edge,null);assert.equal(ctx.cache.get('asset').el.original,true);
 await ctx.primeTransitionMedia();
});
