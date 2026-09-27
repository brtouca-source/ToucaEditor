'use strict';
// Single reusable GPU pass: eased displacement, reflected borders, five motion samples.
// No frame readback, per-frame canvas allocation or Canvas2D blur filters.
(()=>{
 const ids=new Set(['left','right','slideLeft','slideRight','slideUp','slideDown','pushUp','pushDown','whipLeft','whipRight','smoothShift','in','out','crossZoom','zoomBlur','lensZoom','spin','spinZoom','tilt','shakeCut']);
 let render=null,failed=false;
 function create(){
  const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true});if(!gl)throw Error('No WebGL');
  const shader=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,'attribute vec2 pos;varying vec2 uv;void main(){uv=(pos+1.)*.5;gl_Position=vec4(pos,0.,1.);}'));
  gl.attachShader(p,shader(gl.FRAGMENT_SHADER,`precision mediump float;
   varying vec2 uv;uniform sampler2D a,b;uniform float progress,mode;uniform vec2 dir;
   vec2 mirrorUV(vec2 q){return clamp(1.-abs(mod(q,2.)-1.),.001,.999);}
   vec2 turn(vec2 q,float r){float c=cos(r),s=sin(r);return mat2(c,-s,s,c)*q;}
   vec2 warped(vec2 q,float phase,float peak,float sampleOffset){vec2 v=q-.5;
    if(mode<.5){v+=dir*phase*.28;v+=dir*sin(dot(v,vec2(-dir.y,dir.x))*5.)*peak*.035;v+=dir*sampleOffset*peak*.06;v/=1.+peak*.13;}
    else if(mode<1.5){v/=max(.65,1.+phase*dir.x*.34+peak*.07+sampleOffset*peak*.09);v*=1.+dot(v,v)*peak*.14;}
    else if(mode<2.5){v=turn(v,phase*.32+sampleOffset*peak*.045);v/=1.+peak*.32;}
    else {v+=vec2(sin(progress*22.),cos(progress*17.))*peak*.012;v.x+=sin(v.y*12.+progress*6.)*peak*.025;v+=dir*sampleOffset*peak*.025;v/=1.+peak*.1;}
    return mirrorUV(v+.5);
   }
   void main(){vec2 q=vec2(uv.x,1.-uv.y);float u=progress*progress*(3.-2.*progress),peak=sin(progress*3.14159265);vec4 ca=vec4(0.),cb=vec4(0.);
    for(int i=0;i<5;i++){float k=float(i)-2.;ca+=texture2D(a,warped(q,u,peak,k));cb+=texture2D(b,warped(q,u-1.,peak,k));}
    gl_FragColor=mix(ca*.2,cb*.2,u);
   }`));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error('Motion link');gl.useProgram(p);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(p,'pos');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
  const textures=[0,1].map(i=>{const x=gl.createTexture();gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,x);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.uniform1i(gl.getUniformLocation(p,i?'b':'a'),i);return x;});
  const loc=Object.fromEntries(['progress','mode','dir'].map(k=>[k,gl.getUniformLocation(p,k)]));
  return(A,B,u,w,h,id)=>{if(gl.isContextLost())throw Error('Context lost');if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);gl.useProgram(p);[A,B].forEach((image,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,textures[i]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);});
   let mode=0,dx=/right/i.test(id)?1:-1,dy=0;if(/up|down/i.test(id)){dx=0;dy=/down/i.test(id)?1:-1;}if(['in','out','crossZoom','zoomBlur','lensZoom'].includes(id)){mode=1;dx=id==='out'?-1:1;}if(/spin|tilt/i.test(id))mode=2;if(id==='shakeCut')mode=3;gl.uniform1f(loc.progress,u);gl.uniform1f(loc.mode,mode);gl.uniform2f(loc.dir,dx,dy);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return canvas;};
 }
 window.ToucaMotionBlend=function(g,A,B,tr,w,h){if(!ids.has(tr.type))return false;const u=Math.max(0,Math.min(1,tr.u??0));g.save();g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;
  try{if(u<=0||u>=1)g.drawImage(u<=0?A:B,0,0,w,h);else{if(failed)throw Error('Fallback');render??=create();g.drawImage(render(A,B,u,w,h,tr.type),0,0,w,h);window.ToucaMotionBlend.backend='webgl';}}catch{failed=true;window.ToucaMotionBlend.backend='canvas-fallback';g.drawImage(A,0,0,w,h);g.globalAlpha=u*u*(3-2*u);g.drawImage(B,0,0,w,h);}finally{g.restore();}return true;
 };
 (window.requestIdleCallback||((fn)=>setTimeout(fn,300)))(()=>{try{render??=create();}catch{failed=true;}});
})();
