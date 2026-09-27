'use strict';
(()=>{
 const root=document.documentElement;const $=id=>document.getElementById(id);
 const bar=document.createElement('nav');bar.id='androidTools';bar.setAttribute('aria-label','Ferramentas do editor');
 const commands=[['Mídias',()=>toggle('library')],['Áudio',()=>$('directAudio').click()],['Texto',()=>addText()],['Legendas',()=>$('asrBtn').click()],['Ajustes',()=>$('nextAdjust').click()],['Gravar',()=>{const b=$('cameraRecord')||document.querySelector('[data-action="camera"]');if(b)b.click();else toast('Use a câmera no menu de mídia.')}]];
 for(const [name,fn] of commands){const b=document.createElement('button');b.textContent=name;b.onclick=fn;bar.append(b)}
 $('app').append(bar);
 function toggle(panel){root.dataset.mobilePanel=root.dataset.mobilePanel===panel?'':panel;requestAnimationFrame(()=>fitCanvas())}
 const close=document.createElement('button');close.textContent='Fechar biblioteca';close.id='androidCloseLibrary';close.onclick=()=>toggle('library');document.querySelector('.library').prepend(close);
 window.__toucaBack=()=>{const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);if(dialog){dialog.close();return true}if(root.dataset.mobilePanel){root.dataset.mobilePanel='';return true}if(root.dataset.inspectorOpen==='true'){$('nextCloseInspector').click();return true}if(window.__toucaClose){window.__toucaClose();return true}return false};
 addEventListener('pagehide',()=>{if(typeof changed==='function')changed()});
 document.querySelector('.brand span').textContent='ANDROID';
})();
