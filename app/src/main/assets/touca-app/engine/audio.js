'use strict';
// Pure filter construction. All positions use the same 48 kHz sample clock.
const SR=48000;
const finite=(n,d=0)=>Number.isFinite(Number(n))?Number(n):d;
const samples=n=>Math.max(0,Math.round(finite(n)*SR));
function fxFilter(effect){return ({telephone:'highpass=f=300,lowpass=f=3400,acompressor=threshold=-18dB:ratio=3',radio:'highpass=f=220,lowpass=f=5000,acompressor=threshold=-20dB:ratio=4',echo:'aecho=0.8:0.45:80|145:0.22|0.12',cave:'aecho=0.75:0.5:120|240:0.24|0.14',muffled:'lowpass=f=1800',bass:'bass=g=7:f=120',bright:'treble=g=6:f=5000',robot:'tremolo=f=24:d=0.72'})[effect]||'';}
function contiguous(a,b){return a&&b&&a.assetId===b.assetId&&Math.abs(samples(a.start)+samples(a.duration)-samples(b.start))<=1&&Math.abs(samples(a.offset)+samples(a.duration)-samples(b.offset))<=1&&(a.volume??100)===(b.volume??100)&&a.audioEffect===b.audioEffect&&!a.muted&&!b.muted;}
function buildAudioGraph(plan,{firstInput=1,duration}={}){
 const active=plan.filter(p=>p&&!p.muted&&finite(p.volume,100)>0&&samples(p.duration)>0),filters=[],labels=[];
 active.forEach((p,i)=>{
  const n=samples(p.duration),label='a'+i;
  const pieces=[`[${firstInput+i}:a:0]asetpts=PTS-STARTPTS`,`aresample=${SR}:async=0:first_pts=0`,'aformat=sample_fmts=fltp:channel_layouts=stereo',`atrim=end_sample=${n}`];
  const fx=fxFilter(p.audioEffect);if(fx)pieces.push(fx);
  pieces.push(`volume=${Math.max(0,Math.min(2,finite(p.volume,100)/100)).toFixed(6)}`);
  // Tiny edge ramps remove hard-cut discontinuities; seamless source splits have none.
  const before=active.some(q=>q!==p&&contiguous(q,p)),after=active.some(q=>q!==p&&contiguous(p,q));
  const fi=Math.min(Math.floor(n/2),samples(p.fadeIn??(before?0:.003))),fo=Math.min(Math.floor(n/2),samples(p.fadeOut??(after?0:.003)));
  if(fi)pieces.push(`afade=t=in:ss=0:ns=${fi}`);
  if(fo)pieces.push(`afade=t=out:ss=${n-fo}:ns=${fo}`);
  pieces.push(`adelay=${samples(p.start)}S:all=1`);
  filters.push(pieces.join(',')+`[${label}]`);labels.push(`[${label}]`);
 });
 if(!labels.length)return null;
 const tail=[`${labels.join('')}amix=inputs=${labels.length}:duration=longest:dropout_transition=0:normalize=0`,'alimiter=limit=0.96:attack=5:release=50:level=false:latency=true'];
 if(duration!==undefined)tail.push(`apad=whole_len=${samples(duration)}`,`atrim=end_sample=${samples(duration)}`);
 tail.push(`asetpts=N/${SR}/TB`);filters.push(tail.join(',')+'[aout]');
 return {filterComplex:filters.join(';'),label:'[aout]',active};
}
module.exports={SR,samples,contiguous,buildAudioGraph};
