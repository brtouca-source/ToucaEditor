'use strict';
(()=>{
 const root=document.documentElement,$=id=>document.getElementById(id),q=s=>document.querySelector(s);root.dataset.next='true';
 const pref={get(k,f){try{return JSON.parse(localStorage.getItem('touca.next.'+k))??f;}catch{return f;}},set(k,v){localStorage.setItem('touca.next.'+k,JSON.stringify(v));}};
 const button=(text,title,fn)=>{const b=document.createElement('button');b.textContent=text;b.title=title;b.onclick=fn;return b;};
 const icon=(path)=>`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
 const paths={undoBtn:'M9 4 4 9l5 5M4 9h10a6 6 0 0 1 0 12',redoBtn:'m15 4 5 5-5 5m5-5H10a6 6 0 0 0 0 12',splitBtn:'m4 4 16 16M4 20 20 4M12 4v16',prevFrame:'M7 4v16m11-15-9 7 9 7z',nextFrame:'M17 4v16M6 5l9 7-9 7z',v21HomeBtn:'m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7'};
 for(const [id,path] of Object.entries(paths))if($(id))$(id).innerHTML=icon(path);
 $('dropZone').querySelector('span').textContent='+';
 $('prevFrame').onclick=()=>seek(t-1/30);$('nextFrame').onclick=()=>seek(t+1/30);
 $('prevFrame').title='Frame anterior · ←';$('nextFrame').title='Próximo frame · →';$('splitBtn').title='Dividir · Ctrl+B';
 $('exportBtn').textContent='Exportar';q('.brand').innerHTML='<b>T</b> TOUCA <span>NEXT</span>';
 const theme=document.createElement('select');theme.id='nextTheme';theme.ariaLabel='Tema';theme.innerHTML='<option value="dark">Escuro</option><option value="light">Claro</option><option value="system">Sistema</option>';theme.value=pref.get('theme','dark');
 function applyTheme(){root.dataset.nextTheme=theme.value==='system'?(matchMedia('(prefers-color-scheme:light)').matches?'light':'dark'):theme.value;delete root.dataset.theme;pref.set('theme',theme.value);}
 theme.onchange=applyTheme;matchMedia('(prefers-color-scheme:light)').addEventListener('change',applyTheme);applyTheme();
 const layout=pref.get('layout',{left:248,right:264,bottom:290});
 function applyLayout(){layout.left=clamp(layout.left,180,Math.max(180,innerWidth*.3));layout.right=clamp(layout.right,200,Math.max(200,innerWidth*.3));layout.bottom=clamp(layout.bottom,180,Math.max(180,innerHeight-270));for(const k of ['left','right','bottom'])root.style.setProperty('--'+k,layout[k]+'px');requestAnimationFrame(()=>fitCanvas());}
 function divider(id,key,parent){const el=document.createElement('div');el.id=id;el.className='next-divider';el.tabIndex=0;el.role='separator';el.ariaLabel='Redimensionar painel';el.ariaOrientation=key==='bottom'?'horizontal':'vertical';parent.append(el);el.ondblclick=()=>{layout[key]={left:248,right:264,bottom:290}[key];applyLayout();pref.set('layout',layout);};el.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();layout[key]+=e.key==='ArrowLeft'||e.key==='ArrowUp'?-10:10;applyLayout();pref.set('layout',layout);};el.onpointerdown=e=>{if(e.button)return;const start=layout[key],x=e.clientX,y=e.clientY;el.setPointerCapture(e.pointerId);el.onpointermove=ev=>{layout[key]=start+(key==='left'?ev.clientX-x:key==='right'?x-ev.clientX:y-ev.clientY);applyLayout();};el.onpointerup=el.onpointercancel=()=>{el.onpointermove=null;pref.set('layout',layout);};};}
 divider('nextLeftDivider','left',$('workspace'));divider('nextRightDivider','right',$('workspace'));divider('nextBottomDivider','bottom',document.body);applyLayout();addEventListener('resize',applyLayout);
 const actions=document.createElement('div');actions.className='next-actions';q('.library').insertBefore(actions,$('mediaPanel')); 
 const commands=[['Importar mídia',()=> $('directMedia').click()],['Importar áudio',()=> $('directAudio').click()],['Adicionar texto',()=>addText()],['Gerar legendas',()=> $('asrBtn').click()],['Narração IA',()=> $('directNarration').click()],['Efeitos',()=> $('dockEffects').click()],['Animação',()=>current()?$('aniDrag').click():toast('Selecione um clip.')],['Transição',()=>current()?$('tranTool').click():toast('Selecione o segundo clip do corte.')],['Editar palavras',()=>openWordList()],['Salvar projeto',()=> $('saveBtn').click()],['Abrir projeto',()=> $('openBtn').click()],['Exportar',()=>showExport()],['Redefinir layout',()=>{Object.assign(layout,{left:248,right:264,bottom:290});applyLayout();pref.set('layout',layout);}]];
 
 // Popovers reuse the existing actions and fields; no second editor state.
 function popover(id){const el=document.createElement('div');el.id=id;el.className='next-popover';el.setAttribute('popover','auto');document.body.append(el);return el;}
 function trigger(label,title,panel,parent){const b=button(label,title,()=>{const r=b.getBoundingClientRect();panel.style.left=Math.max(8,Math.min(r.left,innerWidth-282))+'px';panel.style.top=Math.min(r.bottom+8,innerHeight-420)+'px';panel.togglePopover();});b.setAttribute('aria-controls',panel.id);b.setAttribute('aria-expanded','false');panel.addEventListener('toggle',()=>b.setAttribute('aria-expanded',String(panel.matches(':popover-open'))));parent.append(b);return b;}
 function item(panel,label,fn){panel.append(button(label,label,()=>{panel.hidePopover();fn();}));}
 const addMenu=popover('nextAddMenu');trigger('+ Adicionar','Adicionar ao projeto',addMenu,actions).classList.add('primary');
 for(const [label,fn] of commands.slice(0,6))item(addMenu,label,fn);
 const mainMenu=popover('nextMainMenu');mainMenu.append(theme);
 for(const id of ['v21HomeBtn','helpBtn'])if($(id)){const b=$(id);b.textContent=id==='helpBtn'?'Ajuda':'Meus projetos';mainMenu.append(b);b.addEventListener('click',()=>mainMenu.hidePopover());}
 for(const [label,fn] of commands.slice(9,11))item(mainMenu,label,fn);
 item(mainMenu,'Redefinir layout',commands.at(-1)[1]);
 const menuButton=trigger('☰','Menu do editor',mainMenu,q('.topActions'));menuButton.id='nextMenuButton';q('.topActions').insertBefore(menuButton,$('exportBtn'));
 const duration=$('defaultDuration').closest('.row');duration.classList.add('next-import-duration');addMenu.append(duration);
 const stageMenu=popover('nextPreviewMenu');const safe=$('safeGuides').closest('label');stageMenu.append(safe);
 const quality=q('.v26PreviewQuality');if(quality)stageMenu.append(quality);
 const stageActions=document.createElement('div');stageActions.className='next-stage-actions';q('.stageToolbar').append(stageActions);
 const adjust=button('Ajustes','Mostrar ou recolher ajustes do clip',()=>setInspector(root.dataset.inspectorOpen!=='true'));adjust.id='nextAdjust';adjust.setAttribute('aria-controls','inspectorBody');stageActions.append(adjust);
 function setInspector(open){root.dataset.inspectorOpen=String(open);adjust.setAttribute('aria-expanded',String(open));requestAnimationFrame(()=>fitCanvas());}
 setInspector(false);const closeInspector=button('×','Fechar ajustes',()=>setInspector(false));closeInspector.id='nextCloseInspector';q('.inspector > .row').append(closeInspector);
 trigger('⋯','Opções da prévia',stageMenu,stageActions);
 const settings=popover('nextTimelineMenu');for(const id of ['snap','magnetic','allTracks'])if($(id))settings.append($(id).closest('label'));
 trigger('⋯','Opções da timeline',settings,q('.timelineTools'));
 // Optional text editing stays available without permanently occupying the screen.
 item(addMenu,'Editar palavras',()=>openWordList());
 
 const search=document.createElement('input');search.type='search';search.className='next-search';search.placeholder='Buscar mídia';search.ariaLabel='Buscar na biblioteca';$('assetList').before(search);search.oninput=()=>{const term=search.value.toLocaleLowerCase();for(const child of $('assetList').children)child.hidden=!!term&&!child.textContent.toLocaleLowerCase().includes(term);};
 const commandDialog=document.createElement('dialog');commandDialog.id='nextCommands';commandDialog.innerHTML='<h2>Comandos</h2><input type="search" placeholder="Pesquisar comando…" aria-label="Pesquisar comando"><div></div>';document.body.append(commandDialog);const list=commandDialog.querySelector('div'),filter=commandDialog.querySelector('input');function commandList(){list.replaceChildren();for(const [label,fn] of commands.filter(([label])=>label.toLocaleLowerCase().includes(filter.value.toLocaleLowerCase())))list.append(button(label,label,()=>{commandDialog.close();fn();}));}filter.oninput=commandList;function openCommands(){filter.value='';commandList();commandDialog.showModal();filter.focus();}item(mainMenu,'Buscar comando…',openCommands);commandDialog.prepend(button('×','Fechar comandos',()=>commandDialog.close()));
 const tools=q('.timelineTools');$('tranTool')&&tools.prepend($('tranTool'));$('aniDrag')&&$('tranTool').after($('aniDrag'));$('quickKeyAdd')&&tools.append($('quickKeyAdd'));$('quickKeyRemove')&&tools.append($('quickKeyRemove'));
 // One documented desktop gesture: wheel scrolls time; Ctrl+wheel zooms at cursor.
 $('timelineScroll').addEventListener('wheel',e=>{if(exporting)return;e.preventDefault();e.stopImmediatePropagation();const el=$('timelineScroll');if(e.ctrlKey){const x=e.clientX-el.getBoundingClientRect().left,at=(el.scrollLeft+x)/pps;pps=clamp(pps*Math.exp(-e.deltaY*.002),10,600);$('timelineZoom').value=pps;buildTimeline();el.scrollLeft=Math.max(0,at*pps-x);}else el.scrollLeft+=e.deltaX||e.deltaY;},{capture:true,passive:false});
 let clipboard=[];addEventListener('keydown',e=>{if(e.target.closest?.('input,textarea,[contenteditable=true]')||document.querySelector('dialog[open]'))return;const ctrl=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();let fn=null;if(ctrl&&e.shiftKey&&key==='p')fn=openCommands;else if(ctrl&&key==='b')fn=split;else if(ctrl&&key==='s')fn=()=> $('saveBtn').click();else if(ctrl&&key==='d')fn=()=> $('duplicate').click();else if(ctrl&&key==='c')fn=()=>{clipboard=clone(P.clips.filter(c=>selectedMany.has(c.id)||c.id===selected));};else if(ctrl&&key==='v')fn=()=>{if(!clipboard.length)return;act(()=>{const first=Math.min(...clipboard.map(c=>c.start));for(const c of clipboard){const n=clone(c);n.id=uid();n.start=t+c.start-first;P.clips.push(n);selected=n.id;}});};else if(!ctrl&&key==='s')fn=()=>{$('snap').checked=!$('snap').checked;};else if(!ctrl&&key==='k')fn=()=> $('addKey').click();else if(e.key==='Home')fn=()=>seek(0);else if(e.key==='End')fn=()=>seek(total());if(fn){e.preventDefault();e.stopImmediatePropagation();if(!exporting)fn();}},{capture:true});
 q('.statusbar').lastElementChild.textContent='Espaço · play   Ctrl+B · dividir   K · keyframe   Ctrl+Shift+P · comandos';
 document.title='Touca Editor Next';setTimeout(()=>{$('pwaStatus').textContent='Touca Editor Next · Windows';},1800);
})();
