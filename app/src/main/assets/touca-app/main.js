const {app,BrowserWindow,ipcMain,dialog,session,shell,protocol}=require('electron');
const path=require('path');
const fs=require('fs');
const fsp=fs.promises;
const zlib=require('zlib');
const {promisify}=require('util');
const {spawn}=require('child_process');
const {Readable}=require('stream');
const {randomUUID}=require('crypto');
const {pathToFileURL}=require('url');
const gzip=promisify(zlib.gzip),gunzip=promisify(zlib.gunzip);

const APP_VERSION='31.6.0';
const {shouldPersistProject}=require('./shared/project-policy');
const {buildAudioGraph}=require('./engine/audio');
const {runCapture,probeEncoders}=require('./engine/process');
const PROJECT_SCHEMA_VERSION=3;
require('./native/resources').register(ipcMain,__dirname);
require('./native/credentials').register(ipcMain,app,require('electron').safeStorage);


// Local media is served through a privileged custom scheme so large files are streamed from disk
// instead of being expanded into base64 strings inside the renderer process.
protocol.registerSchemesAsPrivileged([{scheme:'touca-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);

app.setName('Touca Editor');
const gotLock=app.requestSingleInstanceLock();
if(!gotLock)app.quit();
let win=null,closingApproved=false,closingRequested=false;
ipcMain.handle('touca:confirm-close',()=>{closingApproved=true;win?.close();});
ipcMain.handle('touca:cancel-close',()=>{closingRequested=false;});
const clean=s=>String(s||'Projeto').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,100)||'Projeto';
const safeToken=s=>String(s||'x').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,140)||'x';
const legacyProjectRoot=()=>path.join(app.getPath('userData'),'projects-v18');
const projectRoot=()=>path.join(app.getPath('documents'),'Touca Editor','Projects');
const ensureDir=async p=>{await fsp.mkdir(p,{recursive:true});return p;};
async function migrateLegacyProjectRoot(){
  const oldRoot=legacyProjectRoot(),newRoot=projectRoot();
  await ensureDir(newRoot);
  if(path.resolve(oldRoot)===path.resolve(newRoot)||!fs.existsSync(oldRoot))return;
  let entries=[];try{entries=await fsp.readdir(oldRoot,{withFileTypes:true});}catch{return;}
  for(const ent of entries){
    if(!ent.isDirectory())continue;
    const src=path.join(oldRoot,ent.name),dst=path.join(newRoot,ent.name);
    if(fs.existsSync(dst))continue;
    try{await fsp.cp(src,dst,{recursive:true,preserveTimestamps:true,errorOnExist:false});}catch(e){console.warn('Migração de projeto legado falhou:',ent.name,e?.message||e);}
  }
  try{await fsp.writeFile(path.join(newRoot,'.migrated-from-userdata-v27'),new Date().toISOString());}catch{}
}
const projectDir=id=>path.join(projectRoot(),safeToken(id));
const snapshotPath=id=>path.join(projectDir(id),'project.json.gz');
const metaPath=id=>path.join(projectDir(id),'meta.json');
const assetsDir=id=>path.join(projectDir(id),'assets');
const backupDir=id=>path.join(projectDir(id),'autosave');
const projectThumbPath=id=>path.join(projectDir(id),'project-thumb.webp');
const assetBase=(id,assetId)=>path.join(assetsDir(id),safeToken(assetId));
const assetBinPath=(id,assetId)=>assetBase(id,assetId)+'.bin';
const assetMetaPath=(id,assetId)=>assetBase(id,assetId)+'.json';
const assetProxyPath=(id,assetId)=>assetBase(id,assetId)+'.proxy.mp4';
const assetThumbPath=(id,assetId)=>assetBase(id,assetId)+'.thumb.webp';
const presetSoundRoot=()=>path.join(app.getPath('userData'),'preset-sounds-v23');
const presetBase=(kind,id)=>path.join(presetSoundRoot(),safeToken(kind)+'-'+safeToken(id));
const mediaURL=(projectId,assetId,kind='asset')=>`touca-media://${kind}/${encodeURIComponent(safeToken(projectId))}/${encodeURIComponent(safeToken(assetId))}`;

async function atomicWrite(file,data){await ensureDir(path.dirname(file));const tmp=file+'.tmp-'+process.pid+'-'+Date.now();await fsp.writeFile(tmp,data);await fsp.rename(tmp,file);}
async function saveMeta(id,name,project){const meta={id,name:clean(name),updatedAt:Date.now(),assetCount:Array.isArray(project.assets)?project.assets.length:0,clipCount:Array.isArray(project.clips)?project.clips.length:0,ratio:project.ratio||'9:16',editorVersion:APP_VERSION,projectSchemaVersion:PROJECT_SCHEMA_VERSION};await atomicWrite(metaPath(id),JSON.stringify(meta));return meta;}
async function readAssetMeta(id,assetId){try{return JSON.parse(await fsp.readFile(assetMetaPath(id,assetId),'utf8'));}catch{return null;}}
async function backupSnapshot(id){
  const src=snapshotPath(id);if(!fs.existsSync(src))return;
  const dir=await ensureDir(backupDir(id));
  const now=Date.now(),marker=path.join(dir,'last-backup.txt');let last=0;try{last=Number(await fsp.readFile(marker,'utf8'))||0;}catch{}
  if(now-last<60_000)return;
  const target=path.join(dir,`project-${new Date(now).toISOString().replace(/[:.]/g,'-')}.json.gz`);
  try{await fsp.copyFile(src,target);await atomicWrite(marker,String(now));const files=(await fsp.readdir(dir)).filter(x=>x.endsWith('.json.gz')).sort();while(files.length>5){await fsp.rm(path.join(dir,files.shift()),{force:true});}}catch{}
}
async function rehydrateProject(id,obj){
  if(!obj||!Array.isArray(obj.assets))return obj;
  obj.projectSchemaVersion=Number(obj.projectSchemaVersion)||1;
  for(const a of obj.assets){
    const bin=assetBinPath(id,a.id);
    if(fs.existsSync(bin)){a.data=mediaURL(id,a.id,'asset');a.nativeStored=true;a.nativeStoredV18=true;}
    else if(!a.data)throw new Error(`Mídia local ausente: ${a.name||a.id}`);
    const proxy=assetProxyPath(id,a.id);if(a.type==='video'&&fs.existsSync(proxy))a.proxyData=mediaURL(id,a.id,'proxy');
    try{const tb=await fsp.readFile(assetThumbPath(id,a.id));a.thumbData=`data:image/webp;base64,${tb.toString('base64')}`;}catch{}
  }
  obj.projectId=id;obj.editorVersion=APP_VERSION;obj.projectSchemaVersion=PROJECT_SCHEMA_VERSION;return obj;
}

function mimeFromName(file,typeHint){
  const ext=path.extname(file).toLowerCase();
  const map={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.bmp':'image/bmp','.mp4':'video/mp4','.m4v':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.mkv':'video/x-matroska','.avi':'video/x-msvideo','.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.aac':'audio/aac','.ogg':'audio/ogg','.opus':'audio/ogg','.flac':'audio/flac'};
  return map[ext]||(typeHint==='image'?'image/*':typeHint==='video'?'video/*':typeHint==='audio'?'audio/*':'application/octet-stream');
}
function typeFromPath(file){const e=path.extname(file).toLowerCase();if(['.png','.jpg','.jpeg','.webp','.gif','.bmp'].includes(e))return'image';if(['.mp4','.m4v','.mov','.webm','.mkv','.avi'].includes(e))return'video';if(['.mp3','.wav','.m4a','.aac','.ogg','.opus','.flac'].includes(e))return'audio';return null;}

async function serveToucaMedia(request){
  try{
    const u=new URL(request.url),kind=u.hostname,parts=u.pathname.split('/').filter(Boolean).map(decodeURIComponent);if(parts.length<2)return new Response('Not found',{status:404});
    const projectId=safeToken(parts[0]),assetId=safeToken(parts[1]);let file,mime='application/octet-stream';
    if(kind==='asset'){file=assetBinPath(projectId,assetId);mime=(await readAssetMeta(projectId,assetId))?.mime||'application/octet-stream';}
    else if(kind==='proxy'){file=assetProxyPath(projectId,assetId);mime='video/mp4';}
    else if(kind==='thumb'){file=assetThumbPath(projectId,assetId);mime='image/webp';}
    else return new Response('Not found',{status:404});
    const st=await fsp.stat(file);const range=request.headers.get('range');const headers=new Headers({'Content-Type':mime,'Accept-Ranges':'bytes','Cache-Control':'private, max-age=3600'});
    if(range){const m=range.match(/bytes=(\d*)-(\d*)/);if(m){let start=m[1]?Number(m[1]):0,end=m[2]?Number(m[2]):st.size-1;if(!m[1]&&m[2]){const suffix=Number(m[2]);start=Math.max(0,st.size-suffix);end=st.size-1;}start=Math.max(0,Math.min(start,st.size-1));end=Math.max(start,Math.min(end,st.size-1));headers.set('Content-Range',`bytes ${start}-${end}/${st.size}`);headers.set('Content-Length',String(end-start+1));return new Response(Readable.toWeb(fs.createReadStream(file,{start,end})),{status:206,headers});}}
    headers.set('Content-Length',String(st.size));return new Response(Readable.toWeb(fs.createReadStream(file)),{status:200,headers});
  }catch(e){return new Response('Not found',{status:404});}
}

ipcMain.handle('touca:get-paths',async()=>({userData:app.getPath('userData'),documents:app.getPath('documents'),projects:projectRoot(),legacyProjects:legacyProjectRoot()}));
ipcMain.handle('touca:get-asset-url',async(_,{projectId,assetId,kind='asset'})=>mediaURL(projectId,assetId,kind));
ipcMain.handle('touca:asset-exists',async(_,{projectId,assetId})=>fs.existsSync(assetBinPath(projectId,assetId)));
ipcMain.handle('touca:list-projects',async()=>{await ensureDir(projectRoot());const dirs=await fsp.readdir(projectRoot(),{withFileTypes:true});const out=[];for(const d of dirs){if(!d.isDirectory()||!fs.existsSync(snapshotPath(d.name)))continue;try{const meta=JSON.parse(await fsp.readFile(metaPath(d.name),'utf8'));try{const tb=await fsp.readFile(projectThumbPath(d.name));meta.thumbnail=`data:image/webp;base64,${tb.toString('base64')}`;}catch{}out.push(meta);}catch{}}return out.sort((a,b)=>b.updatedAt-a.updatedAt);});
ipcMain.handle('touca:store-asset',async(_,{projectId,assetId,name,type,dataUrl})=>{if(!projectId||!assetId||typeof dataUrl!=='string')throw new Error('Mídia inválida.');const m=dataUrl.match(/^data:([^;]+);base64,(.*)$/s);if(!m)throw new Error('Formato de mídia não suportado.');const dir=await ensureDir(assetsDir(projectId)),base=path.join(dir,safeToken(assetId));const bin=Buffer.from(m[2],'base64');if(bin.length>2*1024*1024*1024)throw new Error('Arquivo grande demais para importação em memória. Use Importar nativo.');if(!fs.existsSync(base+'.bin'))await atomicWrite(base+'.bin',bin);await atomicWrite(base+'.json',JSON.stringify({name,type,mime:m[1],bytes:bin.length}));return {bytes:bin.length,url:mediaURL(projectId,assetId,'asset')};});
ipcMain.handle('touca:store-asset-thumb',async(_,{projectId,assetId,dataUrl})=>{if(!projectId||!assetId||typeof dataUrl!=='string')return false;const m=dataUrl.match(/^data:image\/webp;base64,(.*)$/s);if(!m)return false;await atomicWrite(assetThumbPath(projectId,assetId),Buffer.from(m[1],'base64'));return true;});
ipcMain.handle('touca:save-project-thumb',async(_,{id,dataUrl})=>{if(!id||typeof dataUrl!=='string')return false;const m=dataUrl.match(/^data:image\/webp;base64,(.*)$/s);if(!m)return false;await atomicWrite(projectThumbPath(id),Buffer.from(m[1],'base64'));return true;});
require('./native/project-store').register({ipcMain,clean,APP_VERSION,PROJECT_SCHEMA_VERSION,metaPath,atomicWrite,fs,fsp,snapshotPath,gunzip,gzip,randomUUID,projectDir,saveMeta,shouldPersistProject,backupSnapshot,rehydrateProject,dialog,app,path,getWindow:()=>win});

ipcMain.handle('touca:import-native-files',async(_,{projectId,kind='all'})=>{
  if(!projectId)throw new Error('Projeto inválido.');
  const filters=kind==='audio'?[{name:'Áudio',extensions:['mp3','wav','m4a','aac','ogg','opus','flac']}]:kind==='media'?[{name:'Mídia',extensions:['png','jpg','jpeg','webp','gif','bmp','mp4','m4v','mov','webm','mkv','avi']}]:[{name:'Mídia',extensions:['png','jpg','jpeg','webp','gif','bmp','mp4','m4v','mov','webm','mkv','avi','mp3','wav','m4a','aac','ogg','opus','flac']}];
  const {canceled,filePaths}=await dialog.showOpenDialog(win,{title:'Importar para Touca Editor',properties:['openFile','multiSelections'],filters});if(canceled)return [];
  const out=[];await ensureDir(assetsDir(projectId));
  for(const source of filePaths){const type=typeFromPath(source);if(!type||(kind==='audio'&&type!=='audio')||(kind==='media'&&type==='audio'))continue;const id=randomUUID(),dst=assetBinPath(projectId,id),name=path.basename(source),mime=mimeFromName(source,type);await fsp.copyFile(source,dst);const st=await fsp.stat(dst);await atomicWrite(assetMetaPath(projectId,id),JSON.stringify({name,type,mime,bytes:st.size,sourceName:name}));out.push({id,name,type,data:mediaURL(projectId,id,'asset'),nativeStored:true,nativeStoredV18:true,bytes:st.size});}
  return out;
});

ipcMain.handle('touca:set-preset-sound',async(_,{kind,id,name,dataUrl})=>{if(!kind||!id||typeof dataUrl!=='string')throw new Error('Som inválido.');const m=dataUrl.match(/^data:([^;]+);base64,(.*)$/s);if(!m)throw new Error('Formato de áudio inválido.');const buf=Buffer.from(m[2],'base64');if(buf.length>20*1024*1024)throw new Error('Use um som menor que 20 MB.');const base=presetBase(kind,id);await ensureDir(path.dirname(base));await atomicWrite(base+'.bin',buf);await atomicWrite(base+'.json',JSON.stringify({name:clean(name||'Som'),mime:m[1],bytes:buf.length}));return true;});
ipcMain.handle('touca:get-preset-sound',async(_,{kind,id})=>{try{const base=presetBase(kind,id),meta=JSON.parse(await fsp.readFile(base+'.json','utf8')),buf=await fsp.readFile(base+'.bin');return {...meta,dataUrl:`data:${meta.mime};base64,${buf.toString('base64')}`};}catch{return null;}});
ipcMain.handle('touca:clear-preset-sound',async(_,{kind,id})=>{const base=presetBase(kind,id);await Promise.allSettled([fsp.rm(base+'.bin',{force:true}),fsp.rm(base+'.json',{force:true})]);return true;});

// ---------------- Native media engine helpers ----------------
const nativeToolsDir=()=>path.join(process.resourcesPath,'native-tools');
function ffmpegCandidates(){
  const bin=process.platform==='win32'?'ffmpeg.exe':'ffmpeg';
  const out=[path.join(nativeToolsDir(),bin),path.join(__dirname,'native-tools',bin)];
  if(process.env.TOUCA_FFMPEG_PATH)out.push(process.env.TOUCA_FFMPEG_PATH);
  for(const d of String(process.env.PATH||'').split(path.delimiter))if(d)out.push(path.join(d,bin));
  return [...new Set(out.filter(Boolean))];
}
function nativeFfmpegPath(){for(const f of ffmpegCandidates())try{if(fs.statSync(f).isFile())return f;}catch{}return path.join(nativeToolsDir(),'ffmpeg.exe');}
function ffmpegAvailable(){try{return fs.statSync(nativeFfmpegPath()).isFile();}catch{return false;}}
let encoderCache=null,encoderCacheAt=0;
let encoderProbe=null;
async function detectEncoders(){
 if(!ffmpegAvailable())return {available:false,encoders:[],preferred:null,software:null};
 if(encoderCache&&Date.now()-encoderCacheAt<300000)return encoderCache;
 if(!encoderProbe)encoderProbe=probeEncoders(nativeFfmpegPath()).then(r=>{encoderCache=r;encoderCacheAt=Date.now();return r;}).finally(()=>encoderProbe=null);
 return encoderProbe;
}

const audioProbeCache=new Map();
async function hasAudioStream(file){try{const st=await fsp.stat(file),key=file+':'+st.mtimeMs+':'+st.size;if(audioProbeCache.has(key))return audioProbeCache.get(key);const r=await runCapture(nativeFfmpegPath(),['-hide_banner','-i',file,'-map','0:a:0?','-t','0.001','-f','null','-'],8000).catch(e=>({err:String(e)}));const ok=/Audio:\s/i.test(r.err||'');if(audioProbeCache.size>=128)audioProbeCache.delete(audioProbeCache.keys().next().value);audioProbeCache.set(key,ok);return ok;}catch{return false;}}
function encoderArgs(name,quality=26){if(name==='libx264')return ['-c:v','libx264','-preset','veryfast','-crf',String(quality)];if(name==='h264_nvenc')return ['-c:v','h264_nvenc','-preset','p4','-rc','vbr','-cq',String(quality),'-b:v','0'];if(name==='h264_qsv')return ['-c:v','h264_qsv','-preset','medium','-global_quality',String(quality)];if(name==='h264_amf')return ['-c:v','h264_amf','-quality','speed','-rc','cqp','-qp_i',String(quality),'-qp_p',String(quality)];if(name==='h264_mf')return ['-c:v','h264_mf','-rate_control','quality','-quality',String(Math.max(50,100-quality))];return null;}
ipcMain.handle('touca:hardware-info',async()=>{const os=require('os');return {...await detectEncoders(),ffmpegPath:ffmpegAvailable()?nativeFfmpegPath():null,cpu:os.cpus()[0]?.model,logicalCores:os.cpus().length,totalMemory:os.totalmem(),freeMemory:os.freemem(),memory:process.memoryUsage()};});
ipcMain.handle('touca:ensure-proxy',async(_,{projectId,assetId})=>{if(!ffmpegAvailable())return null;const src=assetBinPath(projectId,assetId),dst=assetProxyPath(projectId,assetId);if(!fs.existsSync(src))return null;if(fs.existsSync(dst))return {url:mediaURL(projectId,assetId,'proxy'),cached:true};const caps=await detectEncoders(),enc=caps.preferred||caps.software||'mpeg4';const tmp=dst+'.tmp.mp4',scale="scale=if(gt(iw\,ih)\,min(960\,iw)\,-2):if(gt(iw\,ih)\,-2\,min(960\,ih))";const encArgs=encoderArgs(enc,29)||['-c:v','mpeg4','-q:v','6'];const args=['-hide_banner','-loglevel','error','-y','-i',src,'-an','-vf',scale+',fps=30',...encArgs,'-pix_fmt','yuv420p','-movflags','+faststart',tmp];const r=await runCapture(nativeFfmpegPath(),args,30*60*1000);if(r.code!==0){await fsp.rm(tmp,{force:true});return null;}await fsp.rename(tmp,dst);return {url:mediaURL(projectId,assetId,'proxy'),engine:enc,cached:false};});

ipcMain.handle('touca:clean-voice-native',async(_,{projectId,assetId,intensity=55})=>{if(!ffmpegAvailable())throw new Error('Motor de áudio nativo indisponível.');const src=assetBinPath(projectId,assetId);if(!fs.existsSync(src))throw new Error('Áudio original não está salvo no projeto.');const sourceMeta=await readAssetMeta(projectId,assetId);const id=randomUUID(),dst=assetBinPath(projectId,id),tmp=dst+'.tmp.wav';intensity=Math.max(0,Math.min(100,Number(intensity)||55));const nf=(-18-intensity*.15).toFixed(1),strength=(0.0006+intensity/100*0.0022).toFixed(5);const filters=[`highpass=f=70,lowpass=f=15000,anlmdn=s=${strength}:p=0.002:r=0.006:m=11,dynaudnorm=f=150:g=7:p=0.9`,`highpass=f=70,lowpass=f=15000,afftdn=nf=${nf},agate=threshold=0.012:ratio=1.5:attack=8:release=180,dynaudnorm=f=150:g=7:p=0.9`];let used='anlmdn',r=null;for(let i=0;i<filters.length;i++){r=await runCapture(nativeFfmpegPath(),['-hide_banner','-loglevel','error','-y','-i',src,'-vn','-af',filters[i],'-ar','48000','-ac','2','-c:a','pcm_s16le',tmp],60*60*1000);if(r.code===0){used=i===0?'anlmdn':'afftdn';break;}await fsp.rm(tmp,{force:true});}if(!r||r.code!==0)throw new Error('A limpeza nativa não pôde processar este áudio.');await fsp.rename(tmp,dst);const st=await fsp.stat(dst),name='Voz limpa · '+(sourceMeta?.name||'Áudio.wav');await atomicWrite(assetMetaPath(projectId,id),JSON.stringify({name,type:'audio',mime:'audio/wav',bytes:st.size,derivedFrom:assetId,filter:used}));return {id,name,type:'audio',data:mediaURL(projectId,id,'asset'),nativeStored:true,nativeStoredV18:true,bytes:st.size,derivedFrom:assetId,denoiseEngine:used};});

// ---------------- Desktop export ----------------
const nativeExportJobs=new Map();
const exportSafeName=s=>clean(String(s||'Meu vídeo').replace(/\.mp4$/i,''))||'Meu vídeo';
function exportJobId(){return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;}
async function cleanupNativeJob(job,removeOutput=false){if(!job)return;try{if(job.audioPath)await fsp.rm(job.audioPath,{force:true});}catch{}try{if(job.tempDir)await fsp.rm(job.tempDir,{recursive:true,force:true});}catch{}if(removeOutput){try{if(job.tempOutput)await fsp.rm(job.tempOutput,{force:true});}catch{}}}
function audioFxFilter(effect){switch(effect){case'telephone':return'highpass=f=300,lowpass=f=3400,acompressor=threshold=-18dB:ratio=3';case'radio':return'highpass=f=220,lowpass=f=5000,acompressor=threshold=-20dB:ratio=4,volume=1.08';case'echo':return'aecho=0.8:0.45:80|145:0.22|0.12';case'cave':return'aecho=0.75:0.5:120|240:0.24|0.14';case'muffled':return'lowpass=f=1800';case'bass':return'bass=g=7:f=120';case'bright':return'treble=g=6:f=5000';case'robot':return'tremolo=f=24:d=0.72';default:return'';}}
async function buildAudioInputs(projectId,plan,args,duration){
 const active=[];
 for(const item of plan||[]){
  if(!item||item.muted||(item.volume??100)<=0||!(item.duration>0))continue;
  const file=assetBinPath(projectId,item.assetId);
  if(!fs.existsSync(file))throw Error('Mídia de áudio ausente: '+item.assetId);
  if(!(await hasAudioStream(file))){if(item.type==='audio')throw Error('Não foi possível decodificar o áudio: '+item.assetId);continue;}
  args.push('-ss',Math.max(0,Number(item.offset)||0).toFixed(9),'-t',Math.max(.001,Number(item.duration)).toFixed(9),'-i',file);active.push(item);
 }
 return buildAudioGraph(active,{firstInput:1,duration});
}
ipcMain.handle('touca:native-export-capabilities',async()=>{const hw=await detectEncoders();return {available:ffmpegAvailable(),engine:ffmpegAvailable()?'ffmpeg-desktop':'webcodecs-fallback',ffmpegPath:ffmpegAvailable()?nativeFfmpegPath():null,hardwareEncoders:hw.encoders,preferredHardware:hw.preferred};});
ipcMain.handle('touca:native-export-start',async(_event,opts={})=>{
  if(!ffmpegAvailable())throw new Error('Motor FFmpeg nativo não está instalado.');
  const width=Math.max(2,Number(opts.width)||1080),height=Math.max(2,Number(opts.height)||1920),fps=Number(opts.fps)===60?60:30,bitrate=Math.max(1000000,Number(opts.bitrate)||12000000),duration=Math.max(0,Number(opts.duration)||0),name=exportSafeName(opts.name);
  const {canceled,filePath}=await dialog.showSaveDialog(win,{title:'Exportar vídeo',defaultPath:path.join(app.getPath('videos'),name+'.mp4'),filters:[{name:'Vídeo MP4',extensions:['mp4']}],properties:['createDirectory','showOverwriteConfirmation']});if(canceled||!filePath)return {cancelled:true};
  const jobId=exportJobId(),tempDir=await fsp.mkdtemp(path.join(app.getPath('temp'),'touca-v28-export-')),audioPath=path.join(tempDir,'mix.wav'),tempOutput=filePath+'.touca-part-'+jobId+'.mp4';let hasAudioWav=false;
  if(opts.audioWav&&typeof opts.audioWav==='object'){const b=Buffer.from(opts.audioWav);if(b.length>44){await fsp.writeFile(audioPath,b);hasAudioWav=true;}}
  const args=['-hide_banner','-loglevel','error','-y','-fflags','+genpts','-r',String(fps),'-f','h264','-i','pipe:0'];let nativeAudio=null;
  if(Array.isArray(opts.audioPlan)&&opts.projectId){nativeAudio=await buildAudioInputs(opts.projectId,opts.audioPlan,args,duration);}
  if(!nativeAudio&&hasAudioWav)args.push('-i',audioPath);
  if(nativeAudio)args.push('-filter_complex',nativeAudio.filterComplex);
  args.push('-map','0:v:0');if(nativeAudio)args.push('-map',nativeAudio.label);else if(hasAudioWav)args.push('-map','1:a:0');args.push('-c:v','copy');if(nativeAudio||hasAudioWav)args.push('-c:a','aac','-b:a','160k','-ar','48000','-ac','2');if(duration>0)args.push('-t',duration.toFixed(6));args.push('-movflags','+faststart','-fps_mode','cfr',tempOutput);
  const proc=spawn(nativeFfmpegPath(),args,{windowsHide:true,stdio:['pipe','ignore','pipe']});let stderr='';proc.stderr.on('data',d=>{stderr=(stderr+d.toString()).slice(-24000);});proc.stdin.on('error',()=>{});const closePromise=new Promise(resolve=>{proc.once('error',e=>resolve({code:-1,error:e.message}));proc.once('close',(code,signal)=>resolve({code,signal}));});const job={id:jobId,proc,closePromise,tempDir,audioPath:hasAudioWav?audioPath:null,tempOutput,filePath,width,height,fps,bitrate,duration,cancelled:false,getStderr:()=>stderr,audioEngine:nativeAudio?'FFmpeg streaming mix':hasAudioWav?'WAV mix':'sem áudio'};nativeExportJobs.set(jobId,job);return {jobId,filePath,width,height,fps,bitrate,audioEngine:job.audioEngine};
});
ipcMain.handle('touca:native-export-chunk',async(_event,jobId,bytes)=>{const job=nativeExportJobs.get(jobId);if(!job||job.cancelled)throw new Error('Exportação nativa não está ativa.');if(!job.proc||job.proc.killed||job.proc.stdin.destroyed)throw new Error('O encoder nativo foi encerrado.');const buf=Buffer.from(bytes);await new Promise((resolve,reject)=>{const onError=e=>{job.proc.stdin.off('error',onError);reject(e);};job.proc.stdin.once('error',onError);job.proc.stdin.write(buf,e=>{job.proc.stdin.off('error',onError);e?reject(e):resolve();});});return true;});
ipcMain.handle('touca:native-export-finish',async(_event,jobId)=>{const job=nativeExportJobs.get(jobId);if(!job)throw new Error('Exportação nativa não encontrada.');try{if(!job.proc.stdin.destroyed)job.proc.stdin.end();const result=await job.closePromise;if(job.cancelled)throw new Error('Exportação cancelada.');if(result.code!==0)throw new Error('FFmpeg não concluiu o MP4. '+(job.getStderr()||`Código ${result.code}`));await ensureDir(path.dirname(job.filePath));await fsp.rename(job.tempOutput,job.filePath);const st=await fsp.stat(job.filePath);return {filePath:job.filePath,size:st.size,engine:'WebCodecs H.264 HW + FFmpeg desktop',audioEngine:job.audioEngine};}finally{nativeExportJobs.delete(jobId);await cleanupNativeJob(job,true);}});
ipcMain.handle('touca:native-export-cancel',async(_event,jobId)=>{const job=nativeExportJobs.get(jobId);if(!job)return true;job.cancelled=true;try{job.proc.stdin.destroy();}catch{}try{job.proc.kill();}catch{}try{await Promise.race([job.closePromise,new Promise(r=>setTimeout(r,1200))]);}catch{}nativeExportJobs.delete(jobId);await cleanupNativeJob(job,true);return true;});


// ---------------- v28 direct MP4 file writer ----------------
// mp4-muxer can emit chunks at explicit byte positions. Keeping those writes in
// the Electron main process avoids building the complete movie in renderer RAM.
const directFileJobs=new Map();
ipcMain.handle('touca:file-export-start',async(_event,opts={})=>{
  const name=exportSafeName(opts.name),{canceled,filePath}=await dialog.showSaveDialog(win,{title:'Exportar vídeo',defaultPath:path.join(app.getPath('videos'),name+'.mp4'),filters:[{name:'Vídeo MP4',extensions:['mp4']}],properties:['createDirectory','showOverwriteConfirmation']});
  if(canceled||!filePath)return {cancelled:true};
  const id=exportJobId(),tmp=filePath+'.touca-part-'+id,fh=await fsp.open(tmp,'w');
  directFileJobs.set(id,{id,filePath,tmp,fh,closed:false,maxEnd:0});return {jobId:id,filePath};
});
ipcMain.handle('touca:file-export-write',async(_event,jobId,position,bytes)=>{
  const j=directFileJobs.get(jobId);if(!j||j.closed)throw new Error('Arquivo de exportação não está aberto.');
  const b=Buffer.from(bytes),pos=Math.max(0,Number(position)||0);let off=0;
  while(off<b.length){const r=await j.fh.write(b,off,b.length-off,pos+off);if(!r.bytesWritten)throw new Error('Falha ao gravar vídeo no disco.');off+=r.bytesWritten;}
  j.maxEnd=Math.max(j.maxEnd,pos+b.length);return true;
});
ipcMain.handle('touca:file-export-finish',async(_event,jobId)=>{
  const j=directFileJobs.get(jobId);if(!j)throw new Error('Exportação não encontrada.');
  try{
    if(!j.closed){await j.fh.truncate(j.maxEnd);await j.fh.sync();await j.fh.close();j.closed=true;}
    if(j.maxEnd<32)throw Error('O arquivo exportado está incompleto.');
    await fsp.rename(j.tmp,j.filePath);const st=await fsp.stat(j.filePath);
    return {filePath:j.filePath,size:st.size,engine:'WebCodecs + MP4 streaming direto'};
  }catch(e){try{if(!j.closed)await j.fh.close();await fsp.rm(j.tmp,{force:true});}catch{}throw e;}
  finally{directFileJobs.delete(jobId);}
});
ipcMain.handle('touca:file-export-cancel',async(_event,jobId)=>{
  const j=directFileJobs.get(jobId);if(!j)return true;try{if(!j.closed){await j.fh.close();j.closed=true;}}catch{}try{await fsp.rm(j.tmp,{force:true});}catch{}directFileJobs.delete(jobId);return true;
});

function createWindow(){
  win=new BrowserWindow({width:1440,height:900,minWidth:1024,minHeight:650,show:false,backgroundColor:'#14181d',icon:path.join(__dirname,'icon.png'),autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,backgroundThrottling:false}});
  win.on('close',e=>{if(closingApproved)return;e.preventDefault();if(closingRequested)return;closingRequested=true;win.webContents.send('touca:before-close');});
  win.loadFile(path.join(__dirname,'index.html'));win.once('ready-to-show',()=>{win.show();win.focus();});win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:/i.test(url))shell.openExternal(url);return {action:'deny'};});win.webContents.on('will-attach-webview',(event,webPreferences)=>{event.preventDefault();});win.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith('file:')&&!url.startsWith('touca-media:'))e.preventDefault();});
}

app.whenReady().then(async()=>{
  await migrateLegacyProjectRoot();
  await ensureDir(projectRoot());
  try{protocol.handle('touca-media',serveToucaMedia);}catch(e){console.error('touca-media protocol',e);}
  session.defaultSession.setPermissionRequestHandler((_wc,permission,callback)=>{callback(permission==='media');});
  session.defaultSession.setPermissionCheckHandler((_wc,permission)=>permission==='media');
  createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
app.on('before-quit',()=>{for(const job of nativeExportJobs.values()){job.cancelled=true;try{job.proc.kill();}catch{}}for(const j of directFileJobs.values()){try{if(!j.closed)j.fh.close();}catch{}}});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});


