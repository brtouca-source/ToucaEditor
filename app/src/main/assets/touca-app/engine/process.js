'use strict';
const {spawn}=require('node:child_process');
function runCapture(exe,args,timeoutMs=15000){return new Promise((resolve,reject)=>{
 const p=spawn(exe,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='',settled=false;
 const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
 const timer=setTimeout(()=>{p.kill();finish(Error('O processo de mídia excedeu o tempo limite.'));},timeoutMs);
 p.stdout.on('data',d=>out=(out+d).slice(-200000));p.stderr.on('data',d=>err=(err+d).slice(-200000));
 p.once('error',e=>finish(e));p.once('close',code=>finish(null,{code,out,err}));
});}
async function probeEncoders(ffmpeg){
 const listing=await runCapture(ffmpeg,['-hide_banner','-encoders']);
 const availableText=listing.out+'\n'+listing.err,tested=[];
 // A listed encoder is not proof that its driver/device can start.
 for(const name of ['h264_amf','h264_nvenc','h264_qsv','h264_mf','libx264']){
  if(!new RegExp('\\b'+name+'\\b').test(availableText))continue;
  try{const result=await runCapture(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=128x128:r=30','-frames:v','3','-an','-c:v',name,'-pix_fmt','yuv420p','-f','null','-'],10000);tested.push({name,ok:result.code===0,reason:result.code===0?'':result.err.slice(-800)});}catch(e){tested.push({name,ok:false,reason:e.message});}
 }
 const encoders=tested.filter(x=>x.ok&&x.name!=='libx264').map(x=>x.name);
 return {available:listing.code===0,encoders,preferred:encoders[0]||null,software:tested.some(x=>x.name==='libx264'&&x.ok)?'libx264':null,tested};
}
module.exports={runCapture,probeEncoders};
