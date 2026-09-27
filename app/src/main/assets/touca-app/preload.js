'use strict';
const {contextBridge,ipcRenderer}=require('electron');

const h264Batches=new Map();
async function flushH264(jobId){const b=h264Batches.get(jobId);if(!b||!b.parts.length)return true;h264Batches.delete(jobId);const out=new Uint8Array(b.bytes);let o=0;for(const p of b.parts){out.set(p,o);o+=p.byteLength;}return ipcRenderer.invoke('touca:native-export-chunk',jobId,out);}
function batchH264(jobId,bytes){const u=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);let b=h264Batches.get(jobId);if(!b){b={parts:[],bytes:0};h264Batches.set(jobId,b);}b.parts.push(u.slice());b.bytes+=u.byteLength;if(b.bytes>=4*1024*1024||b.parts.length>=24)return flushH264(jobId);return Promise.resolve(true);}


contextBridge.exposeInMainWorld('toucaNative',{
  version:'31.6.0',
  onBeforeClose:callback=>{const listener=()=>callback();ipcRenderer.on('touca:before-close',listener);return ()=>ipcRenderer.removeListener('touca:before-close',listener);},
  confirmClose:()=>ipcRenderer.invoke('touca:confirm-close'),
  cancelClose:()=>ipcRenderer.invoke('touca:cancel-close'),
  projectSchemaVersion:3,

  loadWhisperAssets:()=>ipcRenderer.invoke('touca:whisper-assets'),
  readCredential:()=>ipcRenderer.invoke('touca:credential-read'),
  writeCredential:value=>ipcRenderer.invoke('touca:credential-write',value),
  // Projects / persistence
  listProjects:()=>ipcRenderer.invoke('touca:list-projects'),
  saveSnapshot:(id,name,json)=>ipcRenderer.invoke('touca:save-snapshot',{id,name,json}),
  loadSnapshot:id=>ipcRenderer.invoke('touca:load-snapshot',id),
  deleteSnapshot:id=>ipcRenderer.invoke('touca:delete-snapshot',id),
  renameProject:(id,name)=>ipcRenderer.invoke('touca:rename-project',{id,name}),
  duplicateProject:(id,name)=>ipcRenderer.invoke('touca:duplicate-project',{id,name}),
  saveProjectThumb:(id,dataUrl)=>ipcRenderer.invoke('touca:save-project-thumb',{id,dataUrl}),
  saveProjectAs:(name,json)=>ipcRenderer.invoke('touca:save-project-as',{name,json}),
  openProjectFile:()=>ipcRenderer.invoke('touca:open-project-file'),
  getPaths:()=>ipcRenderer.invoke('touca:get-paths'),

  // Media persistence / native import
  storeAsset:(projectId,assetId,name,type,dataUrl)=>ipcRenderer.invoke('touca:store-asset',{projectId,assetId,name,type,dataUrl}),
  storeAssetThumb:(projectId,assetId,dataUrl)=>ipcRenderer.invoke('touca:store-asset-thumb',{projectId,assetId,dataUrl}),
  getAssetUrl:(projectId,assetId,kind='asset')=>ipcRenderer.invoke('touca:get-asset-url',{projectId,assetId,kind}),
  assetExists:(projectId,assetId)=>ipcRenderer.invoke('touca:asset-exists',{projectId,assetId}),
  importNativeFiles:(projectId,kind='all')=>ipcRenderer.invoke('touca:import-native-files',{projectId,kind}),
  ensureProxy:(projectId,assetId)=>ipcRenderer.invoke('touca:ensure-proxy',{projectId,assetId}),

  // Audio / preset sounds
  setPresetSound:(kind,id,name,dataUrl)=>ipcRenderer.invoke('touca:set-preset-sound',{kind,id,name,dataUrl}),
  getPresetSound:(kind,id)=>ipcRenderer.invoke('touca:get-preset-sound',{kind,id}),
  clearPresetSound:(kind,id)=>ipcRenderer.invoke('touca:clear-preset-sound',{kind,id}),
  cleanVoiceNative:(projectId,assetId,intensity=55)=>ipcRenderer.invoke('touca:clean-voice-native',{projectId,assetId,intensity}),

  // Desktop media engine / export
  hardwareInfo:()=>ipcRenderer.invoke('touca:hardware-info'),
  nativeExportCapabilities:()=>ipcRenderer.invoke('touca:native-export-capabilities'),
  nativeExportStart:opts=>ipcRenderer.invoke('touca:native-export-start',opts),
  nativeExportChunk:(jobId,bytes)=>batchH264(jobId,bytes),
  nativeExportFinish:async jobId=>{await flushH264(jobId);return ipcRenderer.invoke('touca:native-export-finish',jobId);},
  nativeExportCancel:async jobId=>{h264Batches.delete(jobId);return ipcRenderer.invoke('touca:native-export-cancel',jobId);},

  // Direct MP4 writer used when FFmpeg CLI is unavailable. mp4-muxer stays streamed.
  fileExportStart:opts=>ipcRenderer.invoke('touca:file-export-start',opts),
  fileExportWrite:(jobId,position,bytes)=>ipcRenderer.invoke('touca:file-export-write',jobId,position,bytes),
  fileExportFinish:jobId=>ipcRenderer.invoke('touca:file-export-finish',jobId),
  fileExportCancel:jobId=>ipcRenderer.invoke('touca:file-export-cancel',jobId)
});
