'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const geometry=require('../renderer/timeline/geometry');
function harness(){
 const c={id:'clip',type:'image',track:'main',start:10,duration:5,keys:[],offset:0};
 const style={setProperty(k,v){this[k]=v;}},classes=new Set(),node={dataset:{id:'clip'},style,classList:{add:x=>classes.add(x),remove(...a){a.forEach(x=>classes.delete(x));}},getBoundingClientRect:()=>({left:1004,top:0,width:492,height:36})};
 geometry.apply(node,c,100);const listeners=new Map(),scroll={scrollLeft:0,scrollTop:0};let builds=0,changes=0;
 const window={toucaTimelineGeometry31:geometry,addEventListener(n,f){listeners.set(n,f);},removeEventListener(n,f){if(listeners.get(n)===f)listeners.delete(n);}};
 const ctx={window,P:{clips:[c],assets:[]},exporting:false,pps:100,selected:null,keyIndex:0,t:10,document:{body:{dataset:{},classList:{add(){},remove(){}}}},pause(){},clonePlain26:x=>JSON.parse(JSON.stringify(x)),clamp26:(x,a,b)=>Math.max(a,Math.min(b,x)),snapFrame:x=>Math.round(x*30)/30,$:id=>id==='timelineScroll'?scroll:null,qa:()=>[],q:()=>null,renderUI(){},buildTimeline(){builds++;geometry.apply(node,c,100);},checkpoint(){},resizeClip(c,d){c.duration=d;},trimClip(c,cut,d){c.start+=cut;c.duration=d-cut;},changed(){changes++;geometry.apply(node,c,100);},isVisual26:()=>true,autoEndTime26:x=>x,toast(){}};
 const src=fs.readFileSync(path.join(__dirname,'../renderer/legacy/v26.js'),'utf8');const part=src.slice(src.indexOf('  function laneAt26'),src.indexOf('  // Definitive ANI / TRAN duration'));vm.createContext(ctx);vm.runInContext(part,ctx);
 return {c,node,ctx,classes,listeners,get builds(){return builds;},get changes(){return changes;},down(handle=null){ctx.startClipDrag({button:0,pointerId:1,clientX:1008,clientY:10,currentTarget:node,preventDefault(){},stopPropagation(){},target:{closest:sel=>sel==='.v21TrimZone'&&handle?{dataset:{handle}}:null}});},event(name,x=1008){listeners.get(name)?.({pointerId:1,clientX:x,clientY:10,preventDefault(){}});}};
}
test('visual spacing is 8px, while all clip timing stays contiguous',()=>{
 const a={start:0,duration:5},b={start:5,duration:5},before=JSON.stringify([a,b]);const x=geometry.box(a,100),y=geometry.box(b,100);
 assert.equal(y.left-x.left-x.width,8);assert.equal(JSON.stringify([a,b]),before);assert.equal(geometry.box({start:0,duration:1/30},10).inset,0);
});
test('click without dragging preserves width/left without replacing the double-click target',()=>{
 const h=harness();h.down();h.event('pointerup');assert.equal(h.node.style.width,'492px');assert.equal(h.node.style.left,'1004px');assert.equal(h.c.duration,5);assert.equal(h.builds,0);assert.equal(h.ctx.window.__toucaTimelineDrag31,null);
});
test('right handle previews then commits; cancellation restores exact geometry',()=>{
 const h=harness();h.down('right');h.event('pointermove',1108);assert.equal(h.node.style.width,'592px');assert.equal(h.c.duration,5);h.event('pointerup',1108);assert.equal(h.c.duration,6);assert.equal(h.changes,1);
 const k=harness();k.down('left');k.event('pointermove',1058);assert.notEqual(k.node.style.left,'1004px');k.event('pointercancel');assert.equal(k.c.duration,5);assert.equal(k.c.start,10);assert.equal(k.node.style.left,'1004px');assert.equal(k.node.style.width,'492px');assert.equal(k.changes,0);
});
test('losing window focus cancels an unfinished trim and removes resize state',()=>{
 const h=harness();h.down('right');h.event('pointermove',1208);h.event('blur');assert.equal(h.node.style.width,'492px');assert.equal(h.classes.size,0);assert.equal(h.ctx.window.__toucaTimelineDrag31,null);assert.equal(h.listeners.size,0);
});
test('asynchronous timeline rebuild is deferred during active drag',()=>{
 let builds=0;const win={toucaTimelineGeometry31:geometry,__toucaTimelineDrag31:{}};const ctx={window:win,P:{clips:[]},buildTimeline(){builds++;},changed(){},document:{getElementById:()=>null,querySelectorAll:()=>[]},setTimeout(){}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../renderer/timeline/stability.js'),'utf8'),ctx);assert.equal(builds,0);ctx.buildTimeline();assert.equal(builds,0);win.__toucaTimelineDrag31=null;ctx.buildTimeline();assert.equal(builds,1);
});

test('transition gutter only changes display coordinates, not timeline timing',()=>{
 const c={start:5,duration:5};const before=JSON.stringify(c);const b=geometry.box(c,100,{left:20,right:20});assert.equal(b.left,520);assert.equal(b.width,460);assert.equal(JSON.stringify(c),before);
});
