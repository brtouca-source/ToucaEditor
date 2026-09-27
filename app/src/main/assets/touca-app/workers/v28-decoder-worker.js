'use strict';
importScripts('./v28-mp4.js');
const sources=new Map(),sessions=new Map();
const waiters=new Map();let seq=0;
function post(id,payload,transfer=[]){self.postMessage({id,...payload},transfer);}
function errText(e){return e?.message||String(e);}
async function sourceFor(url){let p=sources.get(url);if(p)return p;p=(async()=>{const reader=new ToucaMP4.HttpReader(url);const info=await ToucaMP4.parse(reader);if(info.unsupported)throw new Error('Codec MP4 ainda não suportado pelo decoder rápido: '+info.codecType);if(!/^avc1\./i.test(info.codec))throw new Error('Decoder rápido requer H.264/AVC.');return {url,reader,info};})();sources.set(url,p);try{return await p;}catch(e){sources.delete(url);throw e;}}
function previousKey(samples,index){for(let i=Math.max(0,index);i>=0;i--)if(samples[i].key)return i;return 0;}
function sampleAtOrBefore(info,timeUs){const units=timeUs*info.timescale/1e6;const order=info.presentationOrder||(info.presentationOrder=info.samples.map((s,index)=>({pts:s.pts,index})).sort((a,b)=>a.pts-b.pts||a.index-b.index));let lo=0,hi=order.length-1,ans=order[0]?.index||0;while(lo<=hi){const mid=(lo+hi)>>1;if(order[mid].pts<=units){ans=order[mid].index;lo=mid+1;}else hi=mid-1;}return ans;}
class ClipSession{
  constructor(id,source,initialUs=0){this.id=id;this.source=source;this.initialUs=Math.max(0,initialUs||0);this.decoder=null;this.sampleCursor=0;this.queue=[];this.last=null;this.closed=false;this.eos=false;this.outputWaiters=[];this.ready=this.init();}
  async init(){const {info}=this.source;if(typeof VideoDecoder==='undefined')throw new Error('WebCodecs VideoDecoder indisponível.');const probe={codec:info.codec,codedWidth:info.width,codedHeight:info.height,description:info.description,hardwareAcceleration:'prefer-hardware',optimizeForLatency:true};let supported=probe;try{const r=await VideoDecoder.isConfigSupported(probe);if(!r.supported)throw new Error('H.264 sem suporte no VideoDecoder.');supported=r.config||probe;}catch(e){throw new Error('Decoder H.264 rápido indisponível: '+errText(e));}
    const target=sampleAtOrBefore(info,this.initialUs),sync=previousKey(info.samples,target);this.sampleCursor=sync;
    this.decoder=new VideoDecoder({output:f=>{if(this.closed){f.close();return;}this.queue.push(f);this.queue.sort((a,b)=>(a.timestamp||0)-(b.timestamp||0));const ws=this.outputWaiters.splice(0);for(const w of ws)w();},error:e=>{this.error=e;const ws=this.outputWaiters.splice(0);for(const w of ws)w();}});this.decoder.configure(supported);
  }
  async readSample(i){const s=this.source.info.samples[i],u=await this.source.reader.read(s.offset,s.offset+s.size);if(u.byteLength!==s.size)throw new Error('Amostra de vídeo truncada.');return {s,u};}
  async feed(n=12){
    await this.ready;if(this.error)throw this.error;
    const info=this.source.info;let fed=0;
    while(this.sampleCursor<info.samples.length&&fed<n){
      const {s,u}=await this.readSample(this.sampleCursor++);
      this.decoder.decode(new EncodedVideoChunk({type:s.key?'key':'delta',timestamp:Math.round(s.pts/info.timescale*1e6),duration:Math.max(1,Math.round(s.duration/info.timescale*1e6)),data:u}));
      fed++;if(this.decoder.decodeQueueSize>=20)break;
    }
    // flush resets the decoder's key-frame requirement. It is legal only at EOS,
    // never between batches of delta frames.
    if(this.sampleCursor>=info.samples.length&&!this.eos){this.eos=true;await this.decoder.flush();}
    else if(this.decoder.decodeQueueSize>0){
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{cleanup();reject(Error('Decoder sem resposta.'));},20000);
        const cleanup=()=>{clearTimeout(timer);this.decoder.removeEventListener('dequeue',wake);};
        const wake=()=>{cleanup();resolve();};this.decoder.addEventListener('dequeue',wake,{once:true});
        if(!this.decoder.decodeQueueSize)wake();
      });
    }
    return fed;
  }
  advanceTo(targetUs){while(this.queue.length&&this.queue[0].timestamp<=targetUs){const f=this.queue.shift();if(this.last)this.last.close();this.last=f;}}
  async frameAt(targetUs){await this.ready;targetUs=Math.max(0,Math.round(targetUs));let guard=0;while(!this.closed&&guard++<200){if(this.error)throw this.error;this.advanceTo(targetUs);if(this.queue.length&&this.queue[0].timestamp>targetUs&&this.last)return this.last.clone();if(this.sampleCursor>=this.source.info.samples.length){if(this.queue.length){while(this.queue.length){const f=this.queue.shift();if(f.timestamp<=targetUs||!this.last){if(this.last)this.last.close();this.last=f;}else{this.queue.unshift(f);break;}}}if(this.last)return this.last.clone();throw new Error('Nenhum frame decodificado.');}
      const fed=await this.feed(18);if(!fed)break;
    }
    this.advanceTo(targetUs);if(this.last)return this.last.clone();if(this.queue.length)return this.queue[0].clone();throw new Error('Frame não encontrado.');
  }
  close(){if(this.closed)return;this.closed=true;try{this.decoder?.close();}catch{};for(const f of this.queue)try{f.close();}catch{};this.queue=[];try{this.last?.close();}catch{};this.last=null;}
}
self.onmessage=async e=>{const m=e.data||{},id=m.id;try{
  if(m.type==='probe'){const s=await sourceFor(m.url);post(id,{ok:true,info:{codec:s.info.codec,width:s.info.width,height:s.info.height,duration:s.info.duration,samples:s.info.samples.length}});return;}
  if(m.type==='open'){const src=await sourceFor(m.url);sessions.get(m.clipId)?.close();const ses=new ClipSession(m.clipId,src,m.initialUs||0);sessions.set(m.clipId,ses);await ses.ready;post(id,{ok:true,info:{codec:src.info.codec,width:src.info.width,height:src.info.height}});return;}
  if(m.type==='frame'){const ses=sessions.get(m.clipId);if(!ses)throw new Error('Sessão de vídeo não aberta.');const frame=await ses.frameAt(m.targetUs||0);post(id,{ok:true,frame,timestamp:frame.timestamp},[frame]);return;}
  if(m.type==='close'){const ses=sessions.get(m.clipId);if(ses){const url=ses.source.url;ses.close();sessions.delete(m.clipId);if(![...sessions.values()].some(s=>s.source.url===url))sources.delete(url);}post(id,{ok:true});return;}
  if(m.type==='reset'){for(const s of sessions.values())s.close();sessions.clear();sources.clear();post(id,{ok:true});return;}
  throw new Error('Comando desconhecido.');
}catch(error){post(id,{ok:false,error:errText(error)});}};
self.addEventListener('close',()=>{for(const s of sessions.values())s.close();});
