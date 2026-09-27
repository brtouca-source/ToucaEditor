'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('real wheel handler scales both ways around cursor and no longer snaps back to fill',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../renderer/core/editor.js'),'utf8');const line=html.split('\n').find(l=>l.startsWith("$('preview').addEventListener('wheel',e=>{const c=current()"));assert(line);
 let handler;const c={start:0,keys:[{t:0,v:{x:0,y:0,scale:100,rotation:0}}]};const context={c,wheelTimer:null,t:0,keyIndex:0,exporting:false,$:id=>id==='preview'?{addEventListener:(n,f)=>handler=f}:{checked:false,value:'clip'},current:()=>c,pause(){},checkpoint(){},clearTimeout(){},setTimeout:()=>1,poseForEdit:()=>({...c.keys[0].v}),canvasPoint:()=>({x:250,y:600}),dimensions:()=>[1080,1920],clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),transformClipFrom:(_c,_keys,_base,next)=>c.keys[0].v=next,draw(){},inspector(){},changed(){}};vm.createContext(context);vm.runInContext(line,context);
 const event=y=>({deltaY:y,preventDefault(){}});handler(event(-100));assert(c.keys[0].v.scale>100);handler(event(100));assert(Math.abs(c.keys[0].v.scale-100)<.0001);handler(event(120));assert(c.keys[0].v.scale<100);
 const settle=html.split('\n').find(l=>l.startsWith('function settleFrame('));vm.runInContext(settle,context);const before=c.keys[0].v.scale;vm.runInContext('settleFrame(c,null)',context);assert.equal(c.keys[0].v.scale,before);
});
