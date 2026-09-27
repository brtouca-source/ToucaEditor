'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 // Deterministic UV displacement; same renderer for preview and export.
 let fusion=null;
 function makeFusion(){
  const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true});if(!gl)return null;
  const shader=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,'attribute vec2 pos;varying vec2 uv;void main(){uv=(pos+1.0)*0.5;gl_Position=vec4(pos,0.,1.);}'));
  gl.attachShader(p,shader(gl.FRAGMENT_SHADER,`precision mediump float;
   varying vec2 uv;uniform sampler2D a;uniform sampler2D b;uniform float progress;uniform float strength;uniform float soft;uniform vec2 direction;
   void main(){vec2 q=vec2(uv.x,1.0-uv.y);float peak=sin(progress*3.14159265);float axis=dot(q-.5,direction)+.5;
    float wave=sin(q.y*15.+q.x*9.+progress*7.)*.55+sin(q.y*31.-q.x*13.)*.25;
    float edge=1.-progress+wave*peak*strength*.12;
    float band=exp(-abs(axis-edge)*12.);vec2 warp=vec2(wave,sin(q.x*19.+progress*5.)*.4)*peak*strength*.09*band;
    vec4 ca=texture2D(a,clamp(q+warp,0.001,.999));vec4 cb=texture2D(b,clamp(q-warp,0.001,.999));
    float mixValue=smoothstep(edge-soft,edge+soft,axis);
    mixValue=mix(mixValue,progress,smoothstep(.90,1.,abs(progress-.5)*2.));
    gl_FragColor=mix(ca,cb,mixValue);
   }`));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error('Shader de fusão indisponível');gl.useProgram(p);
  const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(p,'pos');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
  const textures=[0,1].map(i=>{const tex=gl.createTexture();gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.uniform1i(gl.getUniformLocation(p,i?'b':'a'),i);return tex;});
  return (A,B,u,w,h,spec)=>{if(gl.isContextLost())throw Error('Contexto WebGL perdido');if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);gl.useProgram(p);[A,B].forEach((image,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,textures[i]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);});
   gl.uniform1f(gl.getUniformLocation(p,'progress'),u);gl.uniform1f(gl.getUniformLocation(p,'strength'),spec.intensity??.45);gl.uniform1f(gl.getUniformLocation(p,'soft'),spec.softness??.18);const dir={left:[1,0],right:[-1,0],up:[0,1],down:[0,-1]}[spec.direction]||[1,0];gl.uniform2f(gl.getUniformLocation(p,'direction'),...dir);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return canvas;};
 }
 const transitionBefore=transitionAt;
 transitionAt=function(time){for(const cut of cuts()){const spec=cut.b.transition;if(spec?.type!=='organic_fusion')continue;const duration=Math.min(spec.duration||.3,cut.a.duration,cut.b.duration),u=(time-cut.time+duration/2)/duration;if(u>=0&&u<1)return {clip:cut.b,prev:cut.a,type:'organic_fusion',u,duration,amount:Math.sin(Math.PI*u)};}const tr=transitionBefore(time);return tr?.type==='organic_fusion'?null:tr;};
 const exportBefore=showExport;showExport=async function(...args){const result=await exportBefore(...args);if(P.sourceFormat&&$('exportFps'))$('exportFps').value=String(P.fps||30);return result;};$('exportBtn').onclick=showExport;
 const blendBefore=blendFrames;
 const strengthCanvas=document.createElement('canvas');
 blendFrames=function(g,A,B,tr,w,h){
  const strength=clamp(Number((tr.clip?.transition||tr).intensity??100)/100,0,1);
  if(strength<1){
   if(strengthCanvas.width!==w||strengthCanvas.height!==h){strengthCanvas.width=w;strengthCanvas.height=h;}
   const ctx=strengthCanvas.getContext('2d');ctx.clearRect(0,0,w,h);
   const full={...tr,intensity:100,clip:tr.clip?{...tr.clip,transition:{...tr.clip.transition,intensity:100}}:undefined};
   blendFrames(ctx,A,B,full,w,h);
   const u=clamp(tr.u??0,0,1),s=u*u*(3-2*u);g.save();g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.drawImage(A,0,0,w,h);g.globalAlpha=s;g.drawImage(B,0,0,w,h);g.globalAlpha=strength;g.drawImage(strengthCanvas,0,0,w,h);g.restore();return;
  }
if(window.ToucaMotionBlend?.(g,A,B,tr,w,h))return;
if(tr.type!=='organic_fusion')return blendBefore(g,A,B,tr,w,h);const u=clamp(tr.u??0,0,1),spec=tr.clip?.transition||tr;g.save();g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;
  try{fusion??=makeFusion();if(!fusion)throw Error('WebGL indisponível');g.drawImage(u===0?A:u===1?B:fusion(A,B,u,w,h,spec),0,0,w,h);}
  catch(e){if(exporting)throw e;g.drawImage(A,0,0,w,h);g.globalAlpha=u;g.drawImage(B,0,0,w,h);}
  finally{g.restore();}
 };
 // Selected fusion exposes small direct controls instead of another blocking dialog.
 const inspectBefore=inspector;
 inspector=function(){const r=inspectBefore(),c=current();$('v30FusionControls')?.remove();if(c?.transition?.type!=='organic_fusion')return r;
  const box=document.createElement('div');box.id='v30FusionControls';box.style.cssText='position:fixed;right:14px;bottom:12px;z-index:80;background:#163441;color:white;padding:12px;border-radius:16px;max-width:270px;box-shadow:0 6px 24px #0006';
  for(const [key,label,min,max] of [['intensity','Fusão',0,1],['softness','Borda',.01,.5],['duration','Duração',.05,Math.min(3,c.duration)]]){const row=document.createElement('label');row.textContent=label+' ';const input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.step=.01;input.value=c.transition[key]??(key==='duration'?.1:key==='softness'?.18:.45);input.onpointerdown=()=>checkpoint();input.oninput=()=>{c.transition[key]=+input.value;draw();};input.onchange=()=>changed();row.append(input);box.append(row,document.createElement('br'));}
  const direction=document.createElement('select');for(const [value,label] of [['left','Esquerda'],['right','Direita'],['up','Cima'],['down','Baixo']])direction.add(new Option(label,value));direction.value=c.transition.direction||'left';direction.onchange=()=>{checkpoint();c.transition.direction=direction.value;changed();};direction.style.minHeight='38px';box.append(direction);const close=document.createElement('button');close.textContent='Fechar';close.onclick=()=>box.remove();box.append(close);
  document.body.append(box);return r;};
 setTimeout(()=>{if($('pwaStatus'))$('pwaStatus').textContent='Touca Editor · 30 · Projetos pré-editados';},1400);
})();
