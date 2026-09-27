'use strict';
(()=>{
 const Android=window.ToucaAndroid||(window.ToucaAndroid={});
 const root=document.documentElement,$=id=>document.getElementById(id);
 let fitRaf=0;
 const requestFit=()=>{if(fitRaf)return;fitRaf=requestAnimationFrame(()=>{fitRaf=0;try{fitCanvas()}catch{}})};
 const closePanels=()=>{
   root.dataset.mobilePanel='';
   if(root.dataset.inspectorOpen==='true')$('nextCloseInspector')?.click();
   requestFit();
 };
 const toggle=panel=>{root.dataset.mobilePanel=root.dataset.mobilePanel===panel?'':panel;requestFit();};

 const bar=document.createElement('nav');bar.id='androidTools';bar.setAttribute('aria-label','Ferramentas principais');
 const commands=[
   ['Mídia',()=>toggle('library')],
   ['Áudio',()=>$('directAudio')?.click()],
   ['Texto',()=>addText()],
   ['Legendas',()=>$('asrBtn')?.click()],
   ['Editar',()=>{if(!current?.())return toast('Selecione um clip para editar.');$('nextAdjust')?.click();}],
   ['Gravar',()=>{const b=$('cameraRecord')||document.querySelector('[data-action="camera"]');b?b.click():toast('A câmera está disponível pelo menu de mídia.');}]
 ];
 for(const [name,fn] of commands){const b=document.createElement('button');b.type='button';b.textContent=name;b.onclick=fn;bar.append(b)}
 $('app').append(bar);

 const close=document.createElement('button');close.type='button';close.textContent='Fechar biblioteca';close.id='androidCloseLibrary';close.onclick=()=>toggle('library');document.querySelector('.library')?.prepend(close);

 window.__toucaBack=()=>{
   const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);if(dialog){dialog.close();return true}
   if(root.dataset.mobilePanel){root.dataset.mobilePanel='';requestFit();return true}
   if(root.dataset.inspectorOpen==='true'){$('nextCloseInspector')?.click();return true}
   if(window.__toucaClose){window.__toucaClose();return true}
   return false;
 };
 const vv=window.visualViewport;
 vv?.addEventListener('resize',requestFit,{passive:true});
 addEventListener('orientationchange',()=>setTimeout(requestFit,80),{passive:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&!exporting)window.toucaSaveNow29?.().catch(()=>{})});
 Android.shell={toggle,closePanels,requestFit};
 root.dataset.mobileShell='true';
})();
