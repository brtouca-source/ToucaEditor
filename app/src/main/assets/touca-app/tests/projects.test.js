'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../renderer/legacy/v18.js'),'utf8');
const section=src.slice(src.indexOf('  function strippedProject('),src.indexOf('  async function refreshProjects()'));
test('save waits for media storage and keeps the captured project identity',async()=>{
 let release;const gate=new Promise(r=>release=r),saved=[],assets=new Set();
 const native={assetExists:async(id,a)=>assets.has(id+':'+a),storeAsset:async(id,a)=>{await gate;assets.add(id+':'+a);},saveSnapshot:async(id,name,json)=>saved.push({id,name,json:JSON.parse(json)})};
 const A={projectId:'A',name:'A',assets:[{id:'image',name:'image',data:'data:image/png;base64,AA=='}],clips:[{id:'clip',asset:'image'}]},B={projectId:'B',name:'B',assets:[],clips:[]};
 const ctx={P:A,native,window:{},console,clone:x=>JSON.parse(JSON.stringify(x)),uid:()=> 'new',byId:()=>({}),importFiles:async()=>{},exporting:false,playing:false,changed(){},autosave(){},ensureProjectId(){},V18_VERSION:'29',setTimeout:()=>0,clearTimeout(){},toast(){}};
 vm.createContext(ctx);vm.runInContext(section,ctx);
 const pending=ctx.window.toucaSaveNow29();ctx.P=B;release();await pending;
 assert.equal(saved.length,1);assert.equal(saved[0].id,'A');assert.equal(saved[0].json.clips.length,1);assert.equal(saved[0].json.assets[0].data,null);assert.ok(assets.has('A:image'));
 await ctx.window.toucaSaveNow29();assert.equal(saved[1].id,'B');
});
test('failed media write must not save a project with stripped/missing media',async()=>{
 const saved=[],ctx={P:{projectId:'A',assets:[{id:'a',name:'a',data:'data:image/png;base64,AA=='}],clips:[{id:'clip'}]},native:{storeAsset:async()=>{throw Error('disk full');},saveSnapshot:async(...x)=>saved.push(x)},window:{},console,clone:x=>JSON.parse(JSON.stringify(x)),uid:()=> 'new',byId:()=>({}),importFiles:async()=>{},exporting:false,playing:false,changed(){},autosave(){},ensureProjectId(){},V18_VERSION:'29',setTimeout:()=>0,clearTimeout(){},toast(){}};
 vm.createContext(ctx);vm.runInContext(section,ctx);await assert.rejects(ctx.window.toucaSaveNow29(),/disk full/);assert.equal(saved.length,0);
});
