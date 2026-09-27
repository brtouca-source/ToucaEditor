'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.ToucaMP4=api;
})(typeof self!=='undefined'?self:globalThis,function(){
  const td=new TextDecoder('latin1');
  const u32=(v,o)=>v.getUint32(o,false);
  const i32=(v,o)=>v.getInt32(o,false);
  const u16=(v,o)=>v.getUint16(o,false);
  const u64=(v,o)=>Number(v.getBigUint64(o,false));
  const str=(v,o,n)=>{let s='';for(let i=0;i<n;i++)s+=String.fromCharCode(v.getUint8(o+i));return s;};
  function boxAt(v,o,end=v.byteLength){
    if(o+8>end)return null;
    let size=u32(v,o),type=str(v,o+4,4),header=8;
    if(size===1){if(o+16>end)return null;size=u64(v,o+8);header=16;}
    else if(size===0)size=end-o;
    if(!Number.isFinite(size)||size<header||o+size>end)return null;
    return {type,start:o,size,header,dataStart:o+header,end:o+size};
  }
  function boxes(v,start,end){const out=[];for(let o=start;o+8<=end;){const b=boxAt(v,o,end);if(!b)break;out.push(b);o=b.end;}return out;}
  function children(v,b,skip=0){return boxes(v,b.dataStart+skip,b.end);}
  function child(v,b,type,skip=0){return children(v,b,skip).find(x=>x.type===type)||null;}
  function hex2(n){return n.toString(16).padStart(2,'0').toUpperCase();}
  function expandRun(entries,count,field){const out=new Array(count);let p=0;for(const e of entries){for(let i=0;i<e.count&&p<count;i++)out[p++]=e[field];}while(p<count)out[p++]=out[p-1]||0;return out;}
  function parseStts(v,b){let o=b.dataStart+4,n=u32(v,o);o+=4;const a=[];for(let i=0;i<n&&o+8<=b.end;i++,o+=8)a.push({count:u32(v,o),delta:u32(v,o+4)});return a;}
  function parseCtts(v,b){const ver=v.getUint8(b.dataStart);let o=b.dataStart+4,n=u32(v,o);o+=4;const a=[];for(let i=0;i<n&&o+8<=b.end;i++,o+=8)a.push({count:u32(v,o),offset:ver===1?i32(v,o+4):u32(v,o+4)});return a;}
  function parseStsz(v,b){let o=b.dataStart+4,def=u32(v,o),n=u32(v,o+4);o+=8;const out=new Array(n);if(def){out.fill(def);return out;}for(let i=0;i<n;i++,o+=4){if(o+4>b.end)throw new Error('stsz truncado');out[i]=u32(v,o);}return out;}
  function parseStsc(v,b){let o=b.dataStart+4,n=u32(v,o);o+=4;const out=[];for(let i=0;i<n&&o+12<=b.end;i++,o+=12)out.push({firstChunk:u32(v,o),samplesPerChunk:u32(v,o+4),desc:u32(v,o+8)});return out;}
  function parseOffsets(v,b){let o=b.dataStart+4,n=u32(v,o);o+=4;const out=[];if(b.type==='co64'){for(let i=0;i<n&&o+8<=b.end;i++,o+=8)out.push(u64(v,o));}else{for(let i=0;i<n&&o+4<=b.end;i++,o+=4)out.push(u32(v,o));}return out;}
  function parseStss(v,b,count){if(!b){const s=new Set();for(let i=1;i<=count;i++)s.add(i);return s;}let o=b.dataStart+4,n=u32(v,o);o+=4;const s=new Set();for(let i=0;i<n&&o+4<=b.end;i++,o+=4)s.add(u32(v,o));return s;}
  function parseMdhd(v,b){const ver=v.getUint8(b.dataStart);const o=b.dataStart+(ver===1?20:12);if(o+4>b.end)throw new Error('mdhd inválido');return u32(v,o);}
  function handlerType(v,b){const o=b.dataStart+8;return o+4<=b.end?str(v,o,4):'';}
  function parseVideoEntry(v,stsd){
    let o=stsd.dataStart+8;const ent=boxAt(v,o,stsd.end);if(!ent)return null;
    if(!['avc1','avc3'].includes(ent.type))return {codecType:ent.type,unsupported:true};
    const width=u16(v,ent.dataStart+24),height=u16(v,ent.dataStart+26);
    const sub=boxes(v,ent.dataStart+78,ent.end),avcc=sub.find(x=>x.type==='avcC');if(!avcc)throw new Error('avcC ausente');
    const config=new Uint8Array(v.buffer,v.byteOffset+avcc.dataStart,avcc.end-avcc.dataStart).slice();
    if(config.length<4)throw new Error('avcC inválido');
    const codec=`avc1.${hex2(config[1])}${hex2(config[2])}${hex2(config[3])}`;
    return {codecType:ent.type,codec,width,height,description:config.buffer};
  }
  function buildSampleOffsets(sizes,chunkOffsets,stsc){
    const out=new Array(sizes.length);let si=0,sc=0;
    for(let chunk=1;chunk<=chunkOffsets.length&&si<sizes.length;chunk++){
      while(sc+1<stsc.length&&stsc[sc+1].firstChunk<=chunk)sc++;
      const per=stsc[sc]?.samplesPerChunk||0;let pos=chunkOffsets[chunk-1];
      for(let j=0;j<per&&si<sizes.length;j++,si++){out[si]=pos;pos+=sizes[si];}
    }
    if(si!==sizes.length)throw new Error(`Tabela MP4 incompleta (${si}/${sizes.length} amostras)`);
    return out;
  }
  async function parse(reader){
    const size=await reader.size();let off=0,moovBytes=null;
    for(let guard=0;guard<10000&&off+8<=size;guard++){
      const h=await reader.read(off,Math.min(size,off+16));if(h.byteLength<8)break;const v=new DataView(h.buffer,h.byteOffset,h.byteLength);let boxSize=u32(v,0),type=str(v,4,4),header=8;if(boxSize===1){if(h.byteLength<16)throw new Error('Cabeçalho MP4 truncado');boxSize=u64(v,8);header=16;}else if(boxSize===0)boxSize=size-off;if(boxSize<header||off+boxSize>size)throw new Error('Estrutura MP4 inválida');
      if(type==='moov'){moovBytes=await reader.read(off,off+boxSize);break;}off+=boxSize;
    }
    if(!moovBytes)throw new Error('moov não encontrado');
    const v=new DataView(moovBytes.buffer,moovBytes.byteOffset,moovBytes.byteLength),root=boxAt(v,0,v.byteLength);if(!root||root.type!=='moov')throw new Error('moov inválido');
    let video=null;
    for(const trak of children(v,root)){
      if(trak.type!=='trak')continue;const mdia=child(v,trak,'mdia');if(!mdia)continue;const hdlr=child(v,mdia,'hdlr');if(!hdlr||handlerType(v,hdlr)!=='vide')continue;
      const mdhd=child(v,mdia,'mdhd'),minf=child(v,mdia,'minf'),stbl=minf&&child(v,minf,'stbl');if(!mdhd||!stbl)continue;
      const stsd=child(v,stbl,'stsd'),stts=child(v,stbl,'stts'),stsz=child(v,stbl,'stsz'),stscb=child(v,stbl,'stsc'),stco=child(v,stbl,'stco')||child(v,stbl,'co64');if(!stsd||!stts||!stsz||!stscb||!stco)continue;
      const entry=parseVideoEntry(v,stsd);if(!entry||entry.unsupported){video={unsupported:true,codecType:entry?.codecType||'unknown'};continue;}
      const timescale=parseMdhd(v,mdhd),sizes=parseStsz(v,stsz),runs=parseStts(v,stts),cttsb=child(v,stbl,'ctts'),cttsRuns=cttsb?parseCtts(v,cttsb):null,stsc=parseStsc(v,stscb),chunkOffsets=parseOffsets(v,stco),sync=parseStss(v,child(v,stbl,'stss'),sizes.length),sampleOffsets=buildSampleOffsets(sizes,chunkOffsets,stsc),durations=expandRun(runs,sizes.length,'delta'),cts=cttsRuns?expandRun(cttsRuns,sizes.length,'offset'):new Array(sizes.length).fill(0);
      let dts=0,firstPts=null;const samples=new Array(sizes.length);for(let i=0;i<sizes.length;i++){const pts=dts+cts[i];if(firstPts===null||pts<firstPts)firstPts=pts;samples[i]={offset:sampleOffsets[i],size:sizes[i],dts,pts,duration:durations[i]||1,key:sync.has(i+1)};dts+=durations[i]||1;}
      // Normalize timestamps to the first presentation time so HTML-media time ~= decoder time.
      const base=firstPts||0;for(const s of samples){s.dts-=base;s.pts-=base;}
      video={...entry,timescale,samples,duration:dts/timescale,fileSize:size};break;
    }
    if(!video)throw new Error('Faixa de vídeo não encontrada');return video;
  }
  class HttpReader{
    constructor(url,blockSize=2*1024*1024,maxBlocks=6){this.url=url;this.blockSize=blockSize;this.maxBlocks=maxBlocks;this._size=0;this.full=null;this.cache=new Map();this.clock=0;}
    async size(){if(this._size)return this._size;if(this.url.startsWith('data:')){const r=await fetch(this.url);this.full=new Uint8Array(await r.arrayBuffer());return this._size=this.full.length;}const r=await fetch(this.url,{headers:{Range:'bytes=0-15'}});const cr=r.headers.get('content-range');const ab=await r.arrayBuffer();if(cr){const m=cr.match(/\/(\d+)$/);if(m)this._size=Number(m[1]);}if(!this._size){const len=Number(r.headers.get('content-length'))||ab.byteLength;if(r.status===200){this.full=new Uint8Array(ab);this._size=this.full.length;}else this._size=len;}return this._size;}
    async _block(i){if(this.full)return this.full;const hit=this.cache.get(i);if(hit){hit.at=++this.clock;return hit.data;}const total=await this.size(),start=i*this.blockSize,end=Math.min(total,start+this.blockSize);const r=await fetch(this.url,{headers:{Range:`bytes=${start}-${end-1}`}});if(!r.ok&&r.status!==206)throw new Error('Falha ao ler mídia local');let data=new Uint8Array(await r.arrayBuffer());if(r.status===200&&data.length===total){this.full=data;this.cache.clear();return data;}const rec={data,at:++this.clock};this.cache.set(i,rec);if(this.cache.size>this.maxBlocks){let oldK=null,old=Infinity;for(const [k,x] of this.cache)if(x.at<old){old=x.at;oldK=k;}if(oldK!==null)this.cache.delete(oldK);}return data;}
    async read(start,end){const total=await this.size();start=Math.max(0,Math.min(total,Math.floor(start)));end=Math.max(start,Math.min(total,Math.floor(end)));if(this.full)return this.full.slice(start,end);if(end<=start)return new Uint8Array(0);const first=Math.floor(start/this.blockSize),last=Math.floor((end-1)/this.blockSize);if(first===last){const b=await this._block(first),o=start-first*this.blockSize;return b.slice(o,o+(end-start));}const out=new Uint8Array(end-start);let p=0;for(let i=first;i<=last;i++){const b=await this._block(i),bs=i*this.blockSize,lo=Math.max(start,bs),hi=Math.min(end,bs+b.length);if(hi>lo){out.set(b.subarray(lo-bs,hi-bs),p);p+=hi-lo;}}return p===out.length?out:out.slice(0,p);}
  }
  return {parse,HttpReader,boxes,boxAt};
});
