
(()=>{
  document.documentElement.dataset.toucaDesktop='true';
  document.title='Touca Editor';
  const editable=t=>!!t?.closest?.('input,textarea,[contenteditable="true"],[contenteditable=""]');
  document.addEventListener('contextmenu',e=>{if(!editable(e.target))e.preventDefault();},{capture:true});
  document.addEventListener('dragstart',e=>{if(e.target?.closest?.('img,video,canvas,svg'))e.preventDefault();},{capture:true});
  document.addEventListener('drop',e=>{const dt=e.dataTransfer;if(dt?.files?.length)return; e.preventDefault();},{capture:true});
  window.addEventListener('beforeinstallprompt',e=>e.preventDefault());
})();
