'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('sequential decoding never flushes between dependent H.264 frames and releases source cache',async()=>{
 let flushes=0,closed=0;
 class Frame{constructor(ts){this.timestamp=ts;}close(){closed++;}clone(){return new Frame(this.timestamp);}}
 class Decoder extends EventTarget{
  static async isConfigSupported(c){return {supported:true,config:c};}
  constructor(cb){super();this.cb=cb;this.needsKey=true;this.decodeQueueSize=0;}
  configure(){}
  decode(c){if(this.needsKey&&c.type!=='key')throw Error('A key frame is required after flush');this.needsKey=false;this.cb.output(new Frame(c.timestamp));}
  async flush(){flushes++;this.needsKey=true;}
  close(){}
 }
 const samples=Array.from({length:120},(_,i)=>({offset:i,size:1,pts:i,duration:1,key:i%60===0}));
 const outputs=[];const self={postMessage:m=>outputs.push(m),addEventListener:()=>{}};
 const ctx=vm.createContext({self,console,setTimeout,clearTimeout,importScripts:()=>{},VideoDecoder:Decoder,EncodedVideoChunk:class{constructor(c){Object.assign(this,c);}},ToucaMP4:{HttpReader:class{async read(){return new Uint8Array(1);}},parse:async()=>({codec:'avc1.42001F',width:320,height:180,description:new ArrayBuffer(0),timescale:30,samples})}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../workers/v28-decoder-worker.js'),'utf8'),ctx);
 async function ask(type,data={}){await self.onmessage({data:{id:outputs.length+1,type,...data}});const r=outputs.at(-1);assert.equal(r.ok,true,r.error);return r;}
 await ask('open',{clipId:'one',url:'asset',initialUs:0});
 for(let i=0;i<120;i++){const r=await ask('frame',{clipId:'one',targetUs:Math.round(i/30*1e6)});assert.equal(r.frame.timestamp,Math.round(i/30*1e6));r.frame.close();}
 assert.equal(flushes,1);await ask('reset');assert.equal(vm.runInContext('sources.size',ctx),0);assert.ok(closed>=240);
});
