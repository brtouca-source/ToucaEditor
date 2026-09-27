'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function harness(){
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'clip',addEventListener(){},replaceChildren(){},classList:{},remove(){}});return nodes.get(id);};
 const p={clips:[],assets:[]};const context={window:{},P:p,document:{getElementById:node,querySelector:()=>null,addEventListener(){}},setTimeout:()=>{},CSS:{escape:x=>x},selected:'clip',keyIndex:0,t:0,clone:x=>JSON.parse(JSON.stringify(x)),clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),snapFrame:x=>Math.round(x*30)/30,checkpoint(){},current:()=>p.clips[0],valueAt:(keys)=>({...keys[0].v}),insertKey(){},sliceKeys:(k)=>k,buildTimeline(){},inspector(){},changed(){},restoreProject:async()=>{},showExport:async()=>{}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../renderer/legacy/v29.js'),'utf8'),context);return context;
}
test('both default diamonds can be removed without losing the static transform',()=>{
 const c=harness(),clip={type:'image',id:'clip',start:0,duration:5,keys:[{t:0,v:{scale:75}},{t:4,v:{scale:100}}]};c.P.clips.push(clip);
 c.window.toucaDeleteKey29(clip,1);c.window.toucaDeleteKey29(clip,0);
 assert.equal(clip.keys.filter(x=>!x.static).length,0);assert.equal(clip.keys[0].v.scale,75);
 c.insertKey(clip,2);assert.equal(clip.keys.length,1);assert.equal(clip.keys[0].t,2);assert.equal(clip.keys[0].static,undefined);
 c.insertKey(clip,3);assert.equal(JSON.stringify(clip.keys.map(x=>x.t)),'[2,3]');
});
test('animation in/out survive project JSON and replace independently',()=>{
 const c=harness(),clip={type:'image',id:'clip',keys:[],animation:{in:{name:'pop',duration:.4},out:{name:'fade',duration:.3}}};c.P.clips.push(clip);c.changed();
 clip.animation.in={name:'zoom',duration:.5};const saved=JSON.parse(JSON.stringify(clip));assert.equal(saved.animationIn.name,'zoom');assert.equal(saved.animationOut.name,'fade');assert.equal(saved.animation,undefined);
 c.P.clips[0]=saved;c.buildTimeline();assert.equal(saved.animation.in.name,'zoom');
});

test('first animation can be assigned through the existing UI adapter',()=>{
 const c=harness(),clip={type:'image',id:'clip',keys:[]};c.P.clips.push(clip);c.changed();clip.animation??={};clip.animation.in={name:'pop',duration:.4};assert.equal(clip.animationIn.name,'pop');
});
