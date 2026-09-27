'use strict';
// Cheap structural/syntax gate; does not start Electron or download models.
const fs=require('fs'),path=require('path'),vm=require('vm');const root=path.resolve(__dirname,'..');let checked=0;
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const m of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"#]+)"/g)){if(/^(https?:|data:)/.test(m[1]))continue;const p=path.resolve(root,m[1]);if(!fs.existsSync(p))throw Error('Missing entry resource: '+m[1]);checked++;}
const scripts=[...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(m=>m[1]);
if(scripts.indexOf('./renderer/timeline/geometry.js')>scripts.indexOf('./renderer/core/editor.js'))throw Error('Geometry must load before core');
if(scripts.includes('./android/bridge.js')){
 if(scripts.indexOf('./android/bridge.js')>scripts.indexOf('./renderer/core/editor.js'))throw Error('Android bridge must precede core');
 if(scripts.at(-1)!=='./android/mobile.js'||scripts.at(-2)!=='./ui/desktop.js')throw Error('Android UI must follow desktop UI');
}else if(scripts.at(-1)!=='./ui/desktop.js')throw Error('Desktop UI must load last');
for(const file of walk(root)){
 if(file.endsWith('.js'))new vm.Script(fs.readFileSync(file,'utf8'),{filename:path.relative(root,file)});
 if(file.endsWith('.css'))for(const m of fs.readFileSync(file,'utf8').matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)){
  if(/^(data:|https?:|#)/.test(m[1]))continue;if(!fs.existsSync(path.resolve(path.dirname(file),m[1])))throw Error('Missing CSS asset: '+file+' -> '+m[1]);
 }
}
// The pre-existing offline model data is deliberately byte-preserved.
for(const name of ['transformers.mjs','ort-wasm-simd.wasm','encoder_model_quantized.onnx','decoder_model_merged_quantized.onnx'])if(!html.includes('data-whisper-asset="'+name+'"'))throw Error('Missing offline model: '+name);
console.log('PASS: JS syntax, '+checked+' entry resources, stylesheet paths, load order and offline model tags.');
