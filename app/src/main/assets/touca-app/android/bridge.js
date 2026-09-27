'use strict';
(()=>{
 const pending=new Map();let serial=0;
 window.__toucaReply=(id,r)=>{const p=pending.get(id);if(!p)return;pending.delete(id);r.error?p.reject(Error(r.error)):p.resolve(r.value)};
 const call=(method,...args)=>new Promise((resolve,reject)=>{const id=String(++serial);pending.set(id,{resolve,reject});try{toucaAndroid.request(id,method,JSON.stringify(args))}catch(e){pending.delete(id);reject(e)}});
 const bytes64=bytes=>{const b=new Uint8Array(bytes);let s='';for(let i=0;i<b.length;i+=16384)s+=String.fromCharCode(...b.subarray(i,i+16384));return btoa(s)};
 const api={version:'31.6.0-mobile',projectSchemaVersion:3};
 for(const m of ['listProjects','saveSnapshot','loadSnapshot','deleteSnapshot','renameProject','duplicateProject','saveProjectThumb','saveProjectAs','openProjectFile','getPaths','storeAsset','storeAssetThumb','getAssetUrl','assetExists','importNativeFiles','ensureProxy','setPresetSound','getPresetSound','clearPresetSound','hardwareInfo','nativeExportCapabilities','fileExportStart','fileExportFinish','fileExportCancel','confirmClose','cancelClose','readCredential','writeCredential'])api[m]=(...args)=>call(m,...args);
 api.fileExportWrite=async(id,position,bytes)=>{const b=new Uint8Array(bytes);for(let i=0;i<b.length;i+=196608)await call('fileExportWrite',id,position+i,bytes64(b.subarray(i,i+196608)));return true};
 api.loadWhisperAssets=async()=>{const names=['transformers.mjs','ort-wasm-simd.wasm','config.json','generation_config.json','preprocessor_config.json','tokenizer.json','tokenizer_config.json','encoder_model_quantized.onnx','decoder_model_merged_quantized.onnx'];const out={};for(const n of names){const r=await fetch('./resources/models/whisper-tiny/'+n);if(!r.ok)throw Error('Modelo Whisper ausente: '+n);out[n]=bytes64(await r.arrayBuffer())}return out};
 api.onBeforeClose=fn=>{window.__toucaClose=fn;return()=>{window.__toucaClose=null}};
 window.toucaNative=api;
 document.documentElement.dataset.android='true';
})();
