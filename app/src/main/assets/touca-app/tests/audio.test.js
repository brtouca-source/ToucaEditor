'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {buildAudioGraph,samples}=require('../engine/audio');
const ff=process.env.TOUCA_FFMPEG_PATH||'ffmpeg';
const hasFF=spawnSync(ff,['-version']).status===0;
function run(args){const r=spawnSync(ff,['-hide_banner','-loglevel','error',...args],{maxBuffer:20*1024*1024});assert.equal(r.status,0,r.stderr?.toString());return r.stdout;}
function pcm(buf){return new Float32Array(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));}
function rms(data,a,b){let ss=0,n=0;for(let i=Math.round(a*48000)*2;i<Math.round(b*48000)*2;i++){ss+=data[i]*data[i];n++;}return Math.sqrt(ss/n);}
test('audio positions are sample accurate; gain is never normalized by track count',()=>{
 const g=buildAudioGraph([{assetId:'a',start:1/30,offset:0,duration:2,volume:200}],{duration:4});
 assert.match(g.filterComplex,/adelay=1600S:all=1/);assert.match(g.filterComplex,/normalize=0/);assert.match(g.filterComplex,/level=false:latency=true/);assert.match(g.filterComplex,/whole_len=192000/);assert.equal(samples(NaN),0);
});
test('silent and muted tracks omitted; contiguous cuts keep continuity',()=>{
 const g=buildAudioGraph([{assetId:'a',start:0,offset:0,duration:1},{assetId:'a',start:1,offset:1,duration:1},{assetId:'b',start:0,duration:2,muted:true}],{duration:2});
 assert.equal(g.active.length,2);assert.equal((g.filterComplex.match(/afade=/g)||[]).length,2);
});
test('FFmpeg: continuous cut has no sample gap and a finishing track does not pump volume',{skip:!hasFF},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'touca-audio-test-'));try{
  const src=path.join(dir,'source.wav');run(['-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=3','-c:a','pcm_f32le',src]);
  const plans=[{assetId:'a',start:0,offset:0,duration:1,fadeIn:0},{assetId:'a',start:1,offset:1,duration:2,fadeOut:0}];
  const g=buildAudioGraph(plans,{firstInput:0,duration:3});
  const args=[];for(const p of plans)args.push('-ss',String(p.offset),'-t',String(p.duration),'-i',src);
  const out=pcm(run([...args,'-filter_complex',g.filterComplex,'-map','[aout]','-f','f32le','pipe:1']));
  assert.equal(out.length,3*48000*2);assert.ok(Math.abs(rms(out,.5,.9)-rms(out,1.1,1.5))<.0001);
  let jump=0;for(let i=48000*2-100;i<48000*2+100;i+=2)jump=Math.max(jump,Math.abs(out[i+2]-out[i]));assert.ok(jump<.02,`seam ${jump}`);
  // A zero-gain source that ends early used to trigger automatic amix gain changes.
  const q=buildAudioGraph([{assetId:'a',start:0,duration:3,fadeIn:0,fadeOut:0},{assetId:'b',start:0,duration:1,volume:.000001}],{firstInput:0,duration:3});
  const mixed=pcm(run(['-i',src,'-t','1','-i',src,'-filter_complex',q.filterComplex,'-map','[aout]','-f','f32le','pipe:1']));assert.ok(Math.abs(rms(mixed,.5,.9)-rms(mixed,1.2,1.6))<.0001);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
