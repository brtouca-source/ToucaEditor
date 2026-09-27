'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const files=['transformers.mjs','ort-wasm-simd.wasm','config.json','generation_config.json','preprocessor_config.json','tokenizer.json','tokenizer_config.json','encoder_model_quantized.onnx','decoder_model_merged_quantized.onnx'];
exports.register=(ipc,root)=>ipc.handle('touca:whisper-assets',async()=>{const out={};for(const name of files)out[name]=(await fs.readFile(path.join(root,'resources/models/whisper-tiny',name))).toString('base64');return out;});
