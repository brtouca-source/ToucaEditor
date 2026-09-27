'use strict';
(()=>{
 const Android=window.ToucaAndroid||(window.ToucaAndroid={}),errors=[];
 for(const name of ['performance','exportEngine']){try{const mod=Android[name];if(!mod?.install)throw Error('módulo ausente');mod.install()}catch(e){errors.push(name+': '+(e?.message||e));console.error('[Touca Android]',name,e)}}
 Android.version='31.6.2-mobile';Android.ready=errors.length===0;Android.errors=errors;
 document.documentElement.dataset.androidReady=Android.ready?'true':'partial';
 if(errors.length&&typeof toast==='function')toast('Android iniciou em modo de compatibilidade: '+errors.join(' | '));
})();
