'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module'),{spawnSync}=require('node:child_process');
const hasFF=spawnSync(process.env.TOUCA_FFMPEG_PATH||'ffmpeg',['-version']).status===0;
function ff(args){const r=spawnSync(process.env.TOUCA_FFMPEG_PATH||'ffmpeg',['-hide_banner','-loglevel','error',...args],{maxBuffer:30*1024*1024});assert.equal(r.status,0,r.stderr?.toString());return r.stdout;}
function loadMain(root){
 const handlers=new Map(),events=new Map();
 const electron={app:{getPath:()=>root,setName(){},requestSingleInstanceLock:()=>true,whenReady:()=>({then(){}}),on:(n,fn)=>events.set(n,fn)},ipcMain:{handle:(n,fn)=>handlers.set(n,fn)},protocol:{registerSchemesAsPrivileged(){}},dialog:{showSaveDialog:async()=>({filePath:path.join(root,'export.mp4')})},BrowserWindow:function(){}};
 const filename=path.resolve(__dirname,'../main.js'),m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));const req=m.require.bind(m);m.require=n=>n==='electron'?electron:req(n);
 process.resourcesPath=root;m._compile(fs.readFileSync(filename,'utf8'),filename);
 return {call:(n,...args)=>handlers.get('touca:'+n)({},...args),stop:()=>events.get('before-quit')?.()};
}
test('native MP4 export: 14 seconds, 420 complete frames, AAC, faststart, safe cancellation',{skip:!hasFF,timeout:30000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'touca-export-test-'));const main=loadMain(dir);
 try{
  const mediaDir=path.join(dir,'Touca Editor','Projects','test','assets');fs.mkdirSync(mediaDir,{recursive:true});
  const audio=path.join(mediaDir,'voice.bin');ff(['-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=14','-f','wav',audio]);
  const h264=ff(['-f','lavfi','-i','testsrc2=size=360x640:rate=30:duration=14','-an','-c:v','libx264','-preset','ultrafast','-tune','zerolatency','-b:v','12000000','-f','h264','pipe:1']);
  const session=await main.call('native-export-start',{projectId:'test',duration:14,width:360,height:640,fps:30,bitrate:12000000,audioPlan:[{assetId:'voice',type:'audio',start:0,offset:0,duration:7,fadeIn:0},{assetId:'voice',type:'audio',start:7,offset:7,duration:7,fadeOut:0}]});
  for(let offset=0;offset<h264.length;offset+=64*1024)await main.call('native-export-chunk',session.jobId,h264.subarray(offset,offset+64*1024));
  const done=await main.call('native-export-finish',session.jobId);assert.ok(done.size>1000&&done.size<25*1024*1024);
  const probe=spawnSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',done.filePath]);assert.equal(probe.status,0);const info=JSON.parse(probe.stdout);const v=info.streams.find(x=>x.codec_type==='video'),a=info.streams.find(x=>x.codec_type==='audio');assert.equal(v.nb_frames,'420');assert.equal(v.avg_frame_rate,'30/1');assert.equal(a.codec_name,'aac');assert.ok(Math.abs(Number(v.duration)-14)<1/30);assert.ok(Math.abs(Number(a.duration)-14)<.03);
  const bytes=fs.readFileSync(done.filePath);assert.ok(bytes.indexOf(Buffer.from('moov'))<bytes.indexOf(Buffer.from('mdat')));
  const decoded=ff(['-i',done.filePath,'-map','0:a:0','-f','f32le','pipe:1']);const pcm=new Float32Array(decoded.buffer.slice(decoded.byteOffset,decoded.byteOffset+decoded.byteLength));let longest=0,gap=0;for(let i=48000;i<pcm.length-48000;i+=2){if(Math.abs(pcm[i])<.00001)gap++;else gap=0;longest=Math.max(longest,gap);}assert.ok(longest<48,`audio gap ${longest} samples`);
  const preserved=fs.readFileSync(done.filePath);const cancel=await main.call('native-export-start',{duration:14});await main.call('native-export-cancel',cancel.jobId);assert.deepEqual(fs.readFileSync(done.filePath),preserved);assert.equal(fs.readdirSync(dir).some(x=>x.includes('touca-part-')),false);
 }finally{main.stop();fs.rmSync(dir,{recursive:true,force:true});}
});

for(const fps of [30,60])test(`native vertical 1080x1920 ${fps}fps with audio`,{skip:!hasFF,timeout:60000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'touca-next-hd-')),main=loadMain(dir);try{
 const h264=ff(['-f','lavfi','-i',`testsrc2=size=1080x1920:rate=${fps}:duration=2`,'-an','-c:v','libx264','-preset','ultrafast','-tune','zerolatency','-b:v','12000000','-f','h264','pipe:1']);
 const mediaDir=path.join(dir,'Touca Editor','Projects','hd','assets');fs.mkdirSync(mediaDir,{recursive:true});ff(['-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2','-f','wav',path.join(mediaDir,'voice.bin')]);
 const session=await main.call('native-export-start',{projectId:'hd',duration:2,width:1080,height:1920,fps,bitrate:12000000,audioPlan:[{assetId:'voice',type:'audio',start:0,offset:0,duration:2}]});
 for(let i=0;i<h264.length;i+=65536)await main.call('native-export-chunk',session.jobId,h264.subarray(i,i+65536));const done=await main.call('native-export-finish',session.jobId);
 const probe=spawnSync('ffprobe',['-v','error','-show_streams','-of','json',done.filePath]);assert.equal(probe.status,0);const streams=JSON.parse(probe.stdout).streams,v=streams.find(x=>x.codec_type==='video');assert.equal(v.width,1080);assert.equal(v.height,1920);assert.equal(+v.nb_frames,fps*2);assert.equal(v.avg_frame_rate,`${fps}/1`);assert.equal(streams.find(x=>x.codec_type==='audio').sample_rate,'48000');assert(done.size<8*1024*1024);
 }finally{main.stop();fs.rmSync(dir,{recursive:true,force:true});}
});
