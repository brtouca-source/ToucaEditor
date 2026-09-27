'use strict';
(()=>{
 const pending=new Map(),binaryTokens=new Map();let serial=0,binaryPending=null;
 window.__toucaReply=(id,r)=>{const p=pending.get(id);if(!p)return;pending.delete(id);r.error?p.reject(Error(r.error)):p.resolve(r.value)};
 const call=(method,...args)=>new Promise((resolve,reject)=>{const id=String(++serial);pending.set(id,{resolve,reject});try{toucaAndroid.request(id,method,JSON.stringify(args))}catch(e){pending.delete(id);reject(e)}});
 const bytes64=bytes=>{const b=new Uint8Array(bytes);let s='';for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,i+32768));return btoa(s)};
 const Android=window.ToucaAndroid||(window.ToucaAndroid={});
 const api={version:'31.6.2-mobile',projectSchemaVersion:3,platform:'android'};
 for(const m of ['listProjects','saveSnapshot','loadSnapshot','deleteSnapshot','renameProject','duplicateProject','saveProjectThumb','saveProjectAs','openProjectFile','getPaths','storeAsset','storeAssetThumb','getAssetUrl','assetExists','importNativeFiles','ensureProxy','setPresetSound','getPresetSound','clearPresetSound','hardwareInfo','nativeExportCapabilities','confirmClose','cancelClose','setKeepAwake','readCredential','writeCredential'])api[m]=(...args)=>call(m,...args);

 const binaryWrite=(token,position,bytes)=>new Promise((resolve,reject)=>{
   const port=window.toucaBinary;
   if(!port||typeof port.postMessage!=='function')return reject(Error('Ponte binária indisponível'));
   if(binaryPending)return reject(Error('Gravação binária concorrente'));
   const source=new Uint8Array(bytes),packet=new Uint8Array(source.byteLength+16),view=new DataView(packet.buffer);
   view.setUint32(0,0x544f5543,true);view.setUint32(4,token>>>0,true);
   view.setUint32(8,position>>>0,true);view.setUint32(12,Math.floor(position/4294967296)>>>0,true);
   packet.set(source,16);
   const timer=setTimeout(()=>{if(binaryPending){binaryPending=null;reject(Error('Android não confirmou a gravação do vídeo'))}},15000);
   binaryPending={resolve:value=>{clearTimeout(timer);binaryPending=null;value==='ok'?resolve(true):reject(Error(String(value||'Falha na gravação')))}};
   port.onmessage=e=>binaryPending?.resolve(e.data);
   try{port.postMessage(packet.buffer)}catch(e){clearTimeout(timer);binaryPending=null;reject(e)}
 });
 api.fileExportStart=async opts=>{const r=await call('fileExportStart',opts||{});if(r?.jobId&&r?.binary&&r?.binaryToken!=null)binaryTokens.set(r.jobId,Number(r.binaryToken));return r};
 api.fileExportWrite=async(id,position,bytes)=>{
   const token=binaryTokens.get(id);
   if(token!=null&&window.toucaBinary){await binaryWrite(token,position,bytes);return true}
   const b=new Uint8Array(bytes),step=512*1024;
   for(let i=0;i<b.length;i+=step)await call('fileExportWrite',id,position+i,bytes64(b.subarray(i,i+step)));
   return true
 };
 api.fileExportFinish=async id=>{try{return await call('fileExportFinish',id)}finally{binaryTokens.delete(id)}};
 api.fileExportCancel=async id=>{try{return await call('fileExportCancel',id)}finally{binaryTokens.delete(id)}};

 api.loadWhisperAssets=async()=>{const names=['transformers.mjs','ort-wasm-simd.wasm','config.json','generation_config.json','preprocessor_config.json','tokenizer.json','tokenizer_config.json','encoder_model_quantized.onnx','decoder_model_merged_quantized.onnx'];const out={};for(const n of names){const r=await fetch('./resources/models/whisper-tiny/'+n);if(!r.ok)throw Error('Modelo Whisper ausente: '+n);out[n]=bytes64(await r.arrayBuffer())}return out};
 api.onBeforeClose=fn=>{window.__toucaClose=fn;return()=>{window.__toucaClose=null}};
 Android.native=api;Android.platform='android';window.toucaNative=api;
 document.documentElement.dataset.android='true';
})();
