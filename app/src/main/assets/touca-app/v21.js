'use strict';
(()=>{
  const $=id=>document.getElementById(id), q=s=>document.querySelector(s), qa=s=>[...document.querySelectorAll(s)];
  const VERSION='23.0.0';
  document.documentElement.dataset.toucaV19='true';document.documentElement.dataset.toucaV20='true';document.documentElement.dataset.toucaV21='true';document.documentElement.dataset.toucaV23='true';
  if(typeof P!=='undefined'){P.editorVersion=VERSION;}
  if($('pwaStatus'))$('pwaStatus').textContent='Touca Editor Desktop · v23.0.0 · aplicativo local';
  const clamp19=(v,a,b)=>Math.max(a,Math.min(b,v));
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const isVisual=c=>!!c&&['image','video'].includes(c.type);
  const isTextual=c=>!!c&&['text','subtitle'].includes(c.type);
  const isKeyframable=c=>isVisual(c);
  const isEffect=c=>!!c&&c.type==='effect';
  const isAudio=c=>!!c&&c.type==='audio';

  // ---------- Track architecture ----------
  const MEDIA_TRACKS=['main','overlay','overlay2','overlay3','overlay4','overlay5','overlay6','overlay7'];
  const AUDIO_TRACKS=['voice','music','audio3','audio4','audio5'];
  const EFFECT_TRACKS=['effects','effects2','effects3','effects4','effects5','effectsLocal'];
  const TRACK_LABELS={main:'Camada 1 · Mídia principal',overlay:'Camada 2',overlay2:'Camada 3',overlay3:'Camada 4',overlay4:'Camada 5',overlay5:'Camada 6',overlay6:'Camada 7',overlay7:'Camada 8',subtitle:'Legendas',effects:'Efeito global 1',effects2:'Efeito global 2',effects3:'Efeito global 3',effects4:'Efeito global 4',effects5:'Efeito global 5',effectsLocal:'Efeito conectado',voice:'Áudio 1',music:'Áudio 2',audio3:'Áudio 3',audio4:'Áudio 4',audio5:'Áudio 5'};
  function rebuildTrackArray(){
    const desired=['main','overlay','overlay2','overlay3','overlay4','overlay5','overlay6','overlay7','subtitle','effectsLocal','effects','effects2','effects3','effects4','effects5','voice','music','audio3','audio4','audio5'];
    tracks.splice(0,tracks.length,...desired);
  }
  function ensureTrackDom(){
    rebuildTrackArray();
    const heads=q('.trackHeads'),content=$('timelineContent'); if(!heads||!content)return;
    const oldOrder=['main','overlay','subtitle','voice','music','effects'];
    const oldHeads=qa('.trackHead:not(.rulerHead)');
    oldHeads.forEach((h,i)=>{if(!h.dataset.trackHead&&oldOrder[i])h.dataset.trackHead=oldOrder[i];});
    for(const tr of tracks){
      if(!q(`.track[data-track="${tr}"]`)){const d=document.createElement('div');d.className='track';d.dataset.track=tr;content.append(d);}
      if(!q(`.trackHead[data-track-head="${tr}"]`)){
        const h=document.createElement('div');h.className='trackHead '+(tr.startsWith('effects')?'effects':tr.startsWith('overlay')?'overlay':tr);h.dataset.trackHead=tr;h.innerHTML='<span></span>'+TRACK_LABELS[tr];heads.append(h);
      }
    }
    // Reorder track heads / lanes without touching ruler.
    for(const tr of tracks){const h=q(`.trackHead[data-track-head="${tr}"]`);if(h)heads.append(h);const lane=q(`.track[data-track="${tr}"]`);if(lane)content.append(lane);}
  }
  ensureTrackDom();

  // ---------- Remove permanent clutter ----------
  $('v18ContextBar')?.remove();
  for(const id of ['selectMode','deleteMany'])$(id)?.remove();
  if($('selectionCount'))$('selectionCount').textContent='';
  ['v18AdjustPanel','v18TextPanel','v18AudioFxPanel'].forEach(id=>$(id)?.remove());
  $('transitionPicker')?.classList.remove('open');

  // ---------- One library + one inspector ----------
  document.body.insertAdjacentHTML('beforeend',`
    <section id="v19Library" class="v19Hidden" aria-label="Biblioteca Touca Editor">
      <div class="v19PanelHead"><div><small id="v19LibraryHint">BIBLIOTECA</small><h2 id="v19LibraryTitle">Recursos</h2></div><button id="v19LibraryClose" class="v19PanelClose">×</button></div>
      <div class="v19PanelBody"><div id="v19LibraryTabs" class="v19Tabs"></div><div id="v19LibraryGrid" class="v19Grid"></div></div>
    </section>
    <section id="v19Inspector" class="v19Hidden" aria-label="Propriedades">
      <div class="v19PanelHead"><div><small id="v19InspectorHint">PROPRIEDADES</small><h2 id="v19InspectorTitle">Editar</h2></div><button id="v19InspectorClose" class="v19PanelClose">×</button></div>
      <div id="v19InspectorBody" class="v19PanelBody"></div>
    </section>
  `);
  const library=$('v19Library'), inspectorPanel=$('v19Inspector');
  $('v19LibraryClose').onclick=()=>library.classList.add('v19Hidden');
  $('v19InspectorClose').onclick=()=>inspectorPanel.classList.add('v19Hidden');
  document.addEventListener('pointerdown',e=>{
    for(const p of [library,inspectorPanel])if(p&&!p.classList.contains('v19Hidden')&&!p.contains(e.target)&&!e.target.closest('#clipMenu,#tranTool,#aniDrag,#effectDrag,.transitionMark'))p.classList.add('v19Hidden');
  },true);

  // ---------- Content catalogues ----------
  const EFFECTS=[
    ['wide','Ângulo amplo','Lente','◉'],
    ['blur','Desfoque','Desfoque','≈'],
    ['vignette','Vinheta','Lente','◍']
  ];
  const TRANSITIONS=[
    ['organic_fusion','Fusão orgânica','Fusão','≈'],
    ['mix','Dissolver','Básicas','◫'],['fade','Fade','Básicas','◌'],['dipBlack','Dip preto','Básicas','●'],['dipWhite','Dip branco','Básicas','○'],['left','Push esquerda','Movimento','←'],['right','Push direita','Movimento','→'],['pushUp','Push cima','Movimento','↑'],['pushDown','Push baixo','Movimento','↓'],
    ['slideLeft','Slide esquerda','Movimento','⇠'],['slideRight','Slide direita','Movimento','⇢'],['slideUp','Slide cima','Movimento','⇡'],['slideDown','Slide baixo','Movimento','⇣'],['whipLeft','Whip esquerda','Movimento','↞'],['whipRight','Whip direita','Movimento','↠'],['smoothShift','Smooth Shift','Movimento','↔'],['shakeCut','Shake Cut','Movimento','↯'],
    ['in','Zoom in','Zoom','＋'],['out','Zoom out','Zoom','−'],['crossZoom','Cross Zoom','Zoom','◎'],['zoomBlur','Zoom Blur','Zoom','⊙'],['spin','Giro','Câmera','⟳'],['spinZoom','Giro + Zoom','Câmera','⟲'],['tilt','Tilt','Câmera','／'],['lensZoom','Lens Zoom','Câmera','◉'],
    ['wipeLeft','Wipe esquerda','Máscaras','▤'],['wipeRight','Wipe direita','Máscaras','▥'],['wipeUp','Wipe cima','Máscaras','▴'],['wipeDown','Wipe baixo','Máscaras','▾'],['circle','Círculo','Máscaras','●'],['diamond','Diamante','Máscaras','◆'],['splitH','Split horizontal','Máscaras','═'],['splitV','Split vertical','Máscaras','║'],
    ['blurMix','Blur Mix','Digital','≈'],['glitch','Glitch','Digital','⌁'],['rgb','RGB','Digital','RGB'],['pixel','Pixels','Digital','▦'],['flashWhite','Flash branco','Impacto','☼'],['flashBlack','Flash preto','Impacto','●'],['filmBurn','Film Burn','Impacto','🔥'],['lightLeak','Light Leak','Impacto','◒'],
    ['comicFlash','Comic Flash','HQ','✹'],['panelSwipe','Panel Swipe','HQ','▣'],['pageTurn','Virar página','HQ','◩'],['ink','Tinta','HQ','✦']
  ];
  const ANIMS=[
    ['fade','Fade','Básicas','◌'],['zoomSoft','Zoom suave','Zoom','◉'],['zoomImpact','Zoom impacto','Zoom','◎'],['zoomElastic','Zoom elástico','Zoom','⊙'],['slideUp','Deslizar cima','Movimento','↑'],['slideDown','Deslizar baixo','Movimento','↓'],['slideLeft','Deslizar esquerda','Movimento','←'],['slideRight','Deslizar direita','Movimento','→'],
    ['pop','Pop','Básicas','●'],['bounce','Bounce','Básicas','↕'],['spinShort','Giro curto','Giro','⟳'],['spinFull','Giro completo','Giro','⟲'],['spinZoom','Giro + zoom','Giro','◉'],['elastic','Elástico','Básicas','↔'],['spring','Mola','Básicas','⌁'],['pulse','Pulso','Básicas','◉'],
    ['revealH','Revelar horizontal','Revelar','═'],['revealV','Revelar vertical','Revelar','║'],['flipX','Flip horizontal','Giro','↔'],['flipY','Flip vertical','Giro','↕'],['swing','Swing','Giro','⌁'],['rollLeft','Rolar esquerda','Giro','↶'],['rollRight','Rolar direita','Giro','↷'],['drop','Cair','Movimento','↓'],
    ['stretchX','Esticar horizontal','Forma','↔'],['stretchY','Esticar vertical','Forma','↕'],['squeeze','Comprimir','Forma','><'],['scaleUp','Crescer','Forma','＋'],['scaleDown','Encolher','Forma','−'],['float','Flutuar','Movimento','≈'],['tilt','Inclinar','Giro','／'],['spiral','Espiral','Giro','◎'],
    ['blur','Blur','Digital','≈'],['focus','Foco','Digital','◎'],['glitch','Glitch','Digital','⌁'],['rgb','RGB','Digital','RGB'],['shake','Shake','Impacto','↯'],['flash','Flash','Impacto','☼'],['lens','Lens','Impacto','◉'],['comicPop','Comic Pop','HQ','✹'],['snap','Snap','Impacto','◆'],['combo','Combinação','Impacto','✦']
  ];
  const FONTS=['Bangers','Arial','Arial Black','Bahnschrift','Calibri','Cambria','Candara','Century Gothic','Comic Sans MS','Consolas','Constantia','Corbel','Courier New','Franklin Gothic Medium','Gabriola','Georgia','Impact','Lucida Console','Lucida Sans Unicode','Microsoft Sans Serif','Palatino Linotype','Segoe UI','Segoe UI Black','Segoe UI Emoji','Segoe UI Historic','Segoe UI Light','Segoe UI Semibold','Segoe UI Symbol','Segoe Print','Segoe Script','Tahoma','Times New Roman','Trebuchet MS','Verdana','Book Antiqua','Bookman Old Style','Garamond','Gill Sans MT','Rockwell','Tw Cen MT','Yu Gothic UI'];
  const CAPTION_PRESETS={
    clean:{font:'Arial',fontWeight:700,color:'#ffffff',stroke:0,strokeColor:'#000000',textBg:'transparent',shadowColor:'transparent',shadowBlur:0},
    social:{font:'Arial Black',fontWeight:900,color:'#ffffff',stroke:5,strokeColor:'#121212',textBg:'transparent',shadowColor:'#000000aa',shadowBlur:6},
    comic:{font:'Impact',fontWeight:900,color:'#ffffff',stroke:7,strokeColor:'#101010',textBg:'transparent',shadowColor:'#f38b3c',shadowBlur:4},
    card:{font:'Segoe UI Semibold',fontWeight:700,color:'#ffffff',stroke:0,strokeColor:'#000000',textBg:'#121b20',textBgOpacity:.8,shadowColor:'#00000088',shadowBlur:7},
    minimal:{font:'Segoe UI',fontWeight:600,color:'#ffffff',stroke:0,strokeColor:'#000000',textBg:'transparent',shadowColor:'#000000aa',shadowBlur:3},
    highlight:{font:'Arial Black',fontWeight:900,color:'#ffe868',stroke:5,strokeColor:'#101010',textBg:'transparent',shadowColor:'#000000aa',shadowBlur:5},
    subtitle:{font:'Segoe UI Semibold',fontWeight:700,color:'#ffffff',stroke:3,strokeColor:'#101010',textBg:'#000000',textBgOpacity:.45,shadowColor:'transparent',shadowBlur:0},
    neon:{font:'Arial Black',fontWeight:900,color:'#eaffff',stroke:2,strokeColor:'#3ad8ff',textBg:'transparent',shadowColor:'#8a5cff',shadowBlur:16},
    headline:{font:'Impact',fontWeight:900,color:'#ffffff',stroke:4,strokeColor:'#000000',textBg:'transparent',shadowColor:'#000000aa',shadowBlur:4},
    cleanOrange:{font:'Segoe UI Semibold',fontWeight:700,color:'#ffb066',stroke:2,strokeColor:'#1a1a1a',textBg:'transparent',shadowColor:'#00000088',shadowBlur:3}
  };
  for(const [id,label] of TRANSITIONS)TRAN_TYPES[id]??={label,sound:'none'};

  // ---------- Selection helpers ----------
  function selectedSet(){const ids=new Set(selectedMany||[]);if(selected)ids.add(selected);return ids;}
  function selectedClips19(){const ids=selectedSet();return P.clips.filter(c=>ids.has(c.id));}
  function captionTargets(c=current()){
    const multi=selectedClips19().filter(x=>x.type==='subtitle');
    if(c?.type==='subtitle'&&multi.length>1)return multi;
    return c?.type==='subtitle'?[c]:[];
  }
  function textTargets(c=current()){
    const caps=captionTargets(c);if(caps.length)return caps;
    return c&&c.type==='text'?[c]:[];
  }
  function markSelection(){for(const el of qa('.clip')){const on=selectedMany?.has(el.dataset.id);el.classList.toggle('v19CaptionSelected',on&&P.clips.find(c=>c.id===el.dataset.id)?.type==='subtitle');el.classList.toggle('multiSelected',!!on);}if($('selectionCount'))$('selectionCount').textContent=selectedMany?.size?`${selectedMany.size} selecionados`:'';}

  // ---------- Home always first ----------
  $('v18HomeClose')?.setAttribute('hidden','');
  // Returning from the file picker must never navigate away from the editor.

  // ---------- Inspector ----------
  function openInspector(title,hint,html){$('v19InspectorTitle').textContent=title;$('v19InspectorHint').textContent=hint;$('v19InspectorBody').innerHTML=html;inspectorPanel.classList.remove('v19Hidden');library.classList.add('v19Hidden');return $('v19InspectorBody');}
  function applyMany(list,fn){if(!list.length)return;act(()=>list.forEach(fn));}
  function openTextInspector(c=current()){
    const targets=textTargets(c);if(!targets.length)return toast('Selecione um texto ou legenda.');
    const first=targets[0],many=targets.length>1;
    const body=openInspector(many?`${targets.length} legendas`:(first.type==='subtitle'?'Legenda':'Texto'),'TEXTO · ESTILO',`
      ${many?'<div class="v19Notice">Alterações de estilo, fonte, cor e animação serão aplicadas a todas as legendas selecionadas.</div>':`<label class="v19Field full"><span>Texto</span><textarea id="v19TextValue" rows="3">${esc(first.text||'')}</textarea></label>`}
      <div class="v19Section"><h3>Fonte</h3><div class="v19Fonts" id="v19Fonts"></div></div>
      <div class="v19Section"><div class="v19Fields">
        <label class="v19Field"><span>Tamanho</span><input id="v19FontSize" type="number" min="16" max="320" value="${first.fontSize||96}"></label>
        <label class="v19Field"><span>Peso</span><select id="v19FontWeight"><option value="400">Normal</option><option value="600">Semibold</option><option value="700">Bold</option><option value="900">Black</option></select></label>
        <label class="v19Field"><span>Cor do texto</span><input id="v19TextColor" type="color" value="${first.color||'#ffffff'}"></label>
        <label class="v19Field"><span>Cor do contorno</span><input id="v19StrokeColor" type="color" value="${first.strokeColor||'#000000'}"></label>
        <label class="v19Field"><span>Cor do fundo</span><input id="v19BgColor" type="color" value="${first.textBg&&first.textBg!=='transparent'?first.textBg:'#111820'}"></label>
        <label class="v19Field"><span>Cor da sombra</span><input id="v19ShadowColor" type="color" value="${first.shadowColor&&first.shadowColor!=='transparent'?first.shadowColor:'#000000'}"></label>
      </div>
      <div class="v19Range"><span>Contorno</span><input id="v19StrokeWidth" type="range" min="0" max="20" value="${first.stroke||0}"><output>${first.stroke||0}</output></div>
      <div class="v19Range"><span>Sombra</span><input id="v19ShadowBlur" type="range" min="0" max="30" value="${first.shadowBlur||0}"><output>${first.shadowBlur||0}</output></div>
      <div class="v19Range"><span>Fundo</span><input id="v19BgOpacity" type="range" min="0" max="100" value="${Math.round((first.textBgOpacity??.78)*100)}"><output>${Math.round((first.textBgOpacity??.78)*100)}</output></div>
      <div class="v19Actions"><button data-align="left">≡←</button><button data-align="center">≡</button><button data-align="right">→≡</button><button id="v19Italic"><i>I</i></button><button id="v19ClearBg">Sem fundo</button></div>
      </div>
      <div class="v19Section"><div class="v19Actions"><button id="v19TextAnim">ANI · Animação</button>${first.type==='subtitle'?'<button id="v19SelectAllCaps">Selecionar todas</button>':''}</div></div>
    `);
    $('v19FontWeight').value=String(first.fontWeight||700);
    const fontBox=$('v19Fonts');fontBox.innerHTML=FONTS.map(f=>`<button data-font="${esc(f)}" class="${first.font===f?'active':''}" style="font-family:${f}">${esc(f)}</button>`).join('');
    const live=(prop,value)=>applyMany(targets,x=>{x[prop]=value;if(prop==='text'&&x.type==='subtitle')x.name=String(value).slice(0,40);});
    if($('v19TextValue'))$('v19TextValue').onchange=e=>live('text',e.target.value);
    fontBox.onclick=e=>{const b=e.target.closest('[data-font]');if(!b)return;live('font',b.dataset.font);openTextInspector(first);};
    $('v19FontSize').onchange=e=>live('fontSize',clamp19(Number(e.target.value)||96,16,320));
    $('v19FontWeight').onchange=e=>live('fontWeight',Number(e.target.value));
    $('v19TextColor').oninput=e=>live('color',e.target.value);
    $('v19StrokeColor').oninput=e=>live('strokeColor',e.target.value);
    $('v19BgColor').oninput=e=>applyMany(targets,x=>{x.textBg=e.target.value;x.textBgOpacity=x.textBgOpacity??.78;});
    $('v19ShadowColor').oninput=e=>applyMany(targets,x=>x.shadowColor=e.target.value);
    for(const [id,prop,scale] of [['v19StrokeWidth','stroke',1],['v19ShadowBlur','shadowBlur',1],['v19BgOpacity','textBgOpacity',.01]]){const el=$(id);el.oninput=e=>{el.nextElementSibling.textContent=e.target.value;};el.onchange=e=>live(prop,Number(e.target.value)*scale);}
    body.onclick=e=>{const a=e.target.closest('[data-align]');if(a)return live('align',a.dataset.align);if(e.target.closest('#v19Italic'))return applyMany(targets,x=>x.italic=!x.italic);if(e.target.closest('#v19ClearBg'))return applyMany(targets,x=>x.textBg='transparent');if(e.target.closest('#v19TextAnim'))return openLibrary('animation',first,{targets});if(e.target.closest('#v19SelectAllCaps')){selectedMany.clear();P.clips.filter(x=>x.type==='subtitle').forEach(x=>selectedMany.add(x.id));selected=targets[0]?.id||null;buildTimeline();openTextInspector(current());}};
  }
  const ADJUST=[['brightness','Brilho',-100,100],['exposure','Exposição',-100,100],['contrast','Contraste',-100,100],['saturation','Saturação',-100,200],['temperature','Temperatura',-100,100],['tint','Matiz',-180,180],['blur','Desfoque',0,40],['fade','Desbotar',0,100]];
  function openAdjustInspector(c=current()){
    const list=selectedClips19().filter(isVisual);const targets=list.length?list:(isVisual(c)?[c]:[]);if(!targets.length)return toast('Selecione uma imagem ou vídeo.');const first=targets[0],a=first.adjust||{};
    const body=openInspector(targets.length>1?`${targets.length} mídias`:'Ajustes','VÍDEO / IMAGEM',ADJUST.map(([k,l,min,max])=>`<div class="v19Range"><span>${l}</span><input data-adj="${k}" type="range" min="${min}" max="${max}" value="${a[k]||0}"><output>${a[k]||0}</output></div>`).join('')+'<div class="v19Actions"><button id="v19AdjustReset">↺ Redefinir</button><button id="v19AdjustFx">✦ Efeitos</button></div>');
    body.oninput=e=>{const r=e.target.closest('[data-adj]');if(r)r.nextElementSibling.textContent=r.value;};
    body.onchange=e=>{const r=e.target.closest('[data-adj]');if(r)applyMany(targets,x=>{x.adjust??={};x.adjust[r.dataset.adj]=Number(r.value);});};
    $('v19AdjustReset').onclick=()=>applyMany(targets,x=>x.adjust={brightness:0,exposure:0,contrast:0,saturation:0,temperature:0,tint:0,blur:0,fade:0});
    $('v19AdjustFx').onclick=()=>openLibrary('effect',first,{targets});
  }
  function openEffectInspector(c=current()){
    if(!isEffect(c))return toast('Selecione uma camada de efeito.');
    const body=openInspector(c.name||'Efeito','CAMADA DE EFEITO',`<div class="v19Notice">Efeitos são camadas. Arraste esta barra horizontalmente ou para outra faixa Efeito para reposicionar.</div><div class="v19Range"><span>Intensidade</span><input id="v19FxIntensity" type="range" min="0" max="100" value="${c.intensity??70}"><output>${c.intensity??70}</output></div><div class="v19Actions"><button id="v19FxChange">Trocar efeito</button><button id="v19FxDelete" class="danger">Excluir</button></div>`);
    $('v19FxIntensity').oninput=e=>{$('v19FxIntensity').nextElementSibling.textContent=e.target.value;draw();};$('v19FxIntensity').onchange=e=>act(()=>c.intensity=Number(e.target.value));
    $('v19FxChange').onclick=()=>openLibrary('effect',null,{replaceEffect:c});$('v19FxDelete').onclick=()=>{selected=c.id;deleteSelected();inspectorPanel.classList.add('v19Hidden');};
  }
  function openAudioInspector(c=current()){
    if(!c||!['audio','video'].includes(c.type))return toast('Selecione áudio ou vídeo com som.');
    const defs=[['none','Original'],['telephone','Telefone'],['radio','Rádio'],['echo','Eco'],['cave','Caverna'],['muffled','Abafado'],['bass','Grave'],['bright','Brilho'],['robot','Robô']];
    const body=openInspector(c.name,'ÁUDIO',`<div class="v19Range"><span>Volume</span><input id="v19AudioVolume" type="range" min="0" max="200" value="${c.volume??100}"><output>${c.volume??100}</output></div><div class="v19Section"><h3>Efeitos de voz</h3><div class="v19Grid">${defs.map(([id,l])=>`<button class="v19Card" data-audiofx="${id}"><div class="v19Preview animation">♪</div><b>${l}</b></button>`).join('')}</div></div>`);
    $('v19AudioVolume').oninput=e=>$('v19AudioVolume').nextElementSibling.textContent=e.target.value;$('v19AudioVolume').onchange=e=>act(()=>c.volume=Number(e.target.value));
    body.onclick=e=>{const b=e.target.closest('[data-audiofx]');if(!b)return;act(()=>c.audioEffect=b.dataset.audiofx==='none'?null:b.dataset.audiofx);try{initAudio();}catch{};};
  }

  // ---------- Library rendering ----------
  let libMode='effect',libSide='in',libCategory='Todos',libTarget=null,libExtra={};
  function cardHtml(kind,id,label,cat,icon){return `<button class="v19Card" data-kind="${kind}" data-resource="${esc(id)}"><div class="v19Preview ${kind}">${esc(icon||'✦')}</div><b>${esc(label)}</b><small>${esc(cat||'')}</small></button>`;}
  function libraryItems(){if(libMode==='effect')return EFFECTS;if(libMode==='transition')return TRANSITIONS;if(libMode==='animation')return ANIMS.map(([id,label,cat,icon])=>{const inNames={fade:'Fade In',zoomSoft:'Zoom In suave',zoomImpact:'Zoom In impacto',zoomElastic:'Zoom In elástico',slideUp:'Entrar por baixo',slideDown:'Entrar por cima',slideLeft:'Entrar pela direita',slideRight:'Entrar pela esquerda',pop:'Pop In',bounce:'Bounce In',spinShort:'Giro In',spinFull:'Giro completo In',spinZoom:'Giro + Zoom In',elastic:'Elástico In',spring:'Mola In',pulse:'Pulso In',revealH:'Revelar horizontal',revealV:'Revelar vertical',flipX:'Flip horizontal In',flipY:'Flip vertical In',swing:'Swing In',rollLeft:'Rolar In esquerda',rollRight:'Rolar In direita',drop:'Cair In',stretchX:'Esticar horizontal In',stretchY:'Esticar vertical In',squeeze:'Comprimir In',scaleUp:'Crescer In',scaleDown:'Encolher In',float:'Flutuar In',tilt:'Inclinar In',spiral:'Espiral In',blur:'Blur In',focus:'Foco In',glitch:'Glitch In',rgb:'RGB In',shake:'Shake In',flash:'Flash In',lens:'Lens In',comicPop:'Comic Pop In',snap:'Snap In',combo:'Combinação In'};const outNames={fade:'Fade Out',zoomSoft:'Zoom Out suave',zoomImpact:'Zoom Out impacto',zoomElastic:'Zoom Out elástico',slideUp:'Sair por cima',slideDown:'Sair por baixo',slideLeft:'Sair pela esquerda',slideRight:'Sair pela direita',pop:'Pop Out',bounce:'Bounce Out',spinShort:'Giro Out',spinFull:'Giro completo Out',spinZoom:'Giro + Zoom Out',elastic:'Elástico Out',spring:'Mola Out',pulse:'Pulso Out',revealH:'Ocultar horizontal',revealV:'Ocultar vertical',flipX:'Flip horizontal Out',flipY:'Flip vertical Out',swing:'Swing Out',rollLeft:'Rolar Out esquerda',rollRight:'Rolar Out direita',drop:'Cair Out',stretchX:'Esticar horizontal Out',stretchY:'Esticar vertical Out',squeeze:'Comprimir Out',scaleUp:'Crescer Out',scaleDown:'Encolher Out',float:'Flutuar Out',tilt:'Inclinar Out',spiral:'Espiral Out',blur:'Blur Out',focus:'Foco Out',glitch:'Glitch Out',rgb:'RGB Out',shake:'Shake Out',flash:'Flash Out',lens:'Lens Out',comicPop:'Comic Pop Out',snap:'Snap Out',combo:'Combinação Out'};return [id,(libSide==='out'?outNames[id]:inNames[id])||label,cat,icon];});return Object.keys(CAPTION_PRESETS).map((id,i)=>[id,['Limpo','Social','HQ','Cartão','Minimal','Destaque','Legenda','Neon','Título','Laranja'][i]||id,'Estilo','Aa']);}
  function renderLibrary(){
    const titles={effect:['Efeitos','ARRASTE PARA CRIAR UMA CAMADA'],transition:['Transições','ARRASTE ATÉ O CORTE'],animation:['Animações',libSide==='in'?'ENTRADA':'SAÍDA'],caption:['Modelos de legenda','ESTILO OPCIONAL']};
    $('v19LibraryTitle').textContent=titles[libMode][0];$('v19LibraryHint').textContent=titles[libMode][1];const tabs=$('v19LibraryTabs'),grid=$('v19LibraryGrid');tabs.replaceChildren();
    if(libMode==='animation'){for(const [id,l] of [['in','Entrada'],['out','Saída']]){const b=document.createElement('button');b.textContent=l;b.className=libSide===id?'active':'';b.onclick=()=>{libSide=id;libCategory='Todos';renderLibrary();};tabs.append(b);}}
    const cats=['Todos',...new Set(libraryItems().map(x=>x[2]))];for(const cat of cats){const b=document.createElement('button');b.textContent=cat;b.className=libCategory===cat?'active':'';b.onclick=()=>{libCategory=cat;renderLibrary();};tabs.append(b);}
    const items=libraryItems().filter(x=>libCategory==='Todos'||x[2]===libCategory);grid.innerHTML=items.map(x=>cardHtml(libMode,...x)).join('');
    grid.querySelectorAll('.v19Card').forEach(bindLibraryCard);
  }
  function openLibrary(mode,target=current(),extra={}){libMode=mode;libTarget=target;libExtra=extra;libCategory='Todos';if(mode==='animation'&&!['in','out'].includes(libSide))libSide='in';renderLibrary();library.classList.remove('v19Hidden');inspectorPanel.classList.add('v19Hidden');}
  function effectTrackFor(start,duration,prefer){const pool=EFFECT_TRACKS;if(prefer&&pool.includes(prefer))return prefer;for(const tr of pool){const hit=P.clips.some(c=>c.type==='effect'&&c.track===tr&&c.start<start+duration&&start<c.start+c.duration);if(!hit)return tr;}return pool.at(-1);}
  function addEffectLayer(id,target,at){
    const def=EFFECTS.find(x=>x[0]===id);if(libExtra.replaceEffect){return act(()=>{libExtra.replaceEffect.preset=id;libExtra.replaceEffect.name=def?.[1]||'Efeito';});}
    const c=target&&isVisual(target)?target:null;if(!c)return toast('Solte o efeito sobre um vídeo ou imagem.');const start=c.start,duration=c.duration,track=effectTrackFor(start,duration);act(()=>{const fx=newClip('effect',def?.[1]||'Efeito',null,track,start,duration);fx.preset=id;fx.intensity=70;fx.enabled=true;fx.keys=[{t:0,v:pose(),ease:'linear'},{t:duration,v:pose(),ease:'linear'}];P.clips.push(fx);selected=fx.id;t=start;});
  }
  function applyAnimation(id,target){const targets=libExtra.targets?.length?libExtra.targets:(target?[target]:selectedClips19());const valid=targets.filter(c=>c&&!['audio','effect'].includes(c.type));if(!valid.length)return toast('Animação funciona em mídia, texto ou legenda.');applyMany(valid,c=>{c.animation??={};c.animation[libSide]={name:id,duration:.42};});}
  function applyCaptionStyle(id){const targets=captionTargets(current());const valid=targets.length?targets:P.clips.filter(c=>c.type==='subtitle');if(!valid.length)return toast('Nenhuma legenda selecionada.');const p=CAPTION_PRESETS[id];applyMany(valid,c=>Object.assign(c,clone(p)));}
  function applyTransition(id,cut){if(!cut){const all=cuts();cut=all.sort((a,b)=>Math.abs(a.time-t)-Math.abs(b.time-t))[0];}if(!cut)return toast('Adicione dois clips consecutivos na faixa principal.');act(()=>cut.b.transition={type:id,duration:.42,sound:'none',volume:0,from:cut.a.id});}
  function applyLibraryResource(kind,id,target){if(kind==='effect')addEffectLayer(id,target);else if(kind==='animation')applyAnimation(id,target);else if(kind==='transition')applyTransition(id,target);else applyCaptionStyle(id);}
  function hitVisual(x,y){const el=document.elementFromPoint(x,y)?.closest('.clip');const c=el&&P.clips.find(v=>v.id===el.dataset.id);return isVisual(c)?c:null;}
  function hitAnimTarget(x,y){const el=document.elementFromPoint(x,y)?.closest('.clip');const c=el&&P.clips.find(v=>v.id===el.dataset.id);return c&&!['audio','effect'].includes(c.type)?c:null;}
  function nearestCut19(x,y){const lane=q('.track[data-track="main"]');if(!lane)return null;const r=lane.getBoundingClientRect();if(y<r.top-60||y>r.bottom+60)return null;let best=null,dist=60;for(const cut of cuts()){const px=r.left+cut.time*pps-$('timelineScroll').scrollLeft,d=Math.abs(x-px);if(d<dist){dist=d;best=cut;}}return best;}
  function bindLibraryCard(card){
    card.onclick=e=>{if(card.dataset.dragged)return void(card.dataset.dragged='');const kind=card.dataset.kind,id=card.dataset.resource;if(kind==='effect'){const target=isVisual(libTarget)?libTarget:(selectedClips19().find(isVisual)||current());applyLibraryResource(kind,id,target);}else if(kind==='animation')applyLibraryResource(kind,id,libTarget||current());else if(kind==='transition')applyLibraryResource(kind,id,libExtra.cut||null);else applyLibraryResource(kind,id,current());if(!['animation','transition'].includes(kind))library.classList.add('v19Hidden');setTimeout(()=>window.__toucaV23DecorateLibrary?.(),0);};
    card.onpointerdown=e=>{if(e.button>0)return;const kind=card.dataset.kind,id=card.dataset.resource,label=card.querySelector('b')?.textContent||id,startX=e.clientX,startY=e.clientY;let drag=false,ghost=null,target=null;
      const move=ev=>{if(!drag&&Math.hypot(ev.clientX-startX,ev.clientY-startY)<7)return;if(!drag){drag=true;card.dataset.dragged='1';library.classList.add('v19Hidden');ghost=document.createElement('div');ghost.className='v19DropGhost';ghost.textContent=label;document.body.append(ghost);}ghost.style.left=ev.clientX+'px';ghost.style.top=ev.clientY+'px';qa('.v19DropTarget,.v19TrackTarget').forEach(x=>x.classList.remove('v19DropTarget','v19TrackTarget'));target=kind==='transition'?nearestCut19(ev.clientX,ev.clientY):kind==='animation'?hitAnimTarget(ev.clientX,ev.clientY):kind==='effect'?hitVisual(ev.clientX,ev.clientY):null;if(target?.id)q(`.clip[data-id="${CSS.escape(target.id)}"]`)?.classList.add('v19DropTarget');};
      const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);ghost?.remove();qa('.v19DropTarget').forEach(x=>x.classList.remove('v19DropTarget'));if(drag&&target){applyLibraryResource(kind,id,target);}};window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up,{once:true});window.addEventListener('pointercancel',up,{once:true});
    };
  }

  // ---------- Replace TRAN / ANI / EFEITO buttons with clean listeners ----------
  function replaceTool(id,text,click,dragMode){const old=$(id);if(!old)return null;const b=old.cloneNode(true);old.replaceWith(b);b.textContent=text;b.title=text;b.onclick=click;if(dragMode)b.onpointerdown=e=>startToolDrag(e,b,dragMode);return b;}
  function startToolDrag(e,b,mode){
    if(e.button>0||exporting)return;e.preventDefault();
    const sx=e.clientX,sy=e.clientY;let moved=false,target=null;
    const clear=()=>{qa('.v19DropTarget').forEach(x=>x.classList.remove('v19DropTarget'));b.classList.remove('isDragging');};
    const move=ev=>{
      if(!moved&&Math.hypot(ev.clientX-sx,ev.clientY-sy)<7)return;
      if(!moved){moved=true;b.classList.add('isDragging');library.classList.add('v19Hidden');}
      ev.preventDefault();clear();b.classList.add('isDragging');
      target=mode==='transition'?nearestCut19(ev.clientX,ev.clientY):mode==='animation'?hitAnimTarget(ev.clientX,ev.clientY):hitVisual(ev.clientX,ev.clientY);
      if(target?.id)q(`.clip[data-id="${CSS.escape(target.id)}"]`)?.classList.add('v19DropTarget');
    };
    const finish=(cancel=false)=>{
      window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',abort);clear();
      if(moved){b.addEventListener('click',ev=>{ev.preventDefault();ev.stopImmediatePropagation();},{once:true,capture:true});}
      if(cancel||!moved||!target)return;
      if(mode==='transition')openLibrary('transition',null,{cut:target});
      else{selected=target.id;openLibrary(mode,target,{targets:[target]});}
    };
    const up=()=>finish(false),abort=()=>finish(true);
    window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up,{once:true});window.addEventListener('pointercancel',abort,{once:true});
  }
  replaceTool('tranTool','TRAN',()=>openLibrary('transition',current()),'transition');
  replaceTool('aniDrag','ANI',()=>openLibrary('animation',current(),{targets:selectedClips19().filter(c=>!['audio','effect'].includes(c.type))}),'animation');
  replaceTool('effectDrag','✦ EFEITO',()=>openLibrary('effect',selectedClips19().find(isVisual)||current()),'effect');
  if($('directEffects'))$('directEffects').onclick=()=>{closeQuick?.();openLibrary('effect',selectedClips19().find(isVisual)||current());};
  if($('styleCaps'))$('styleCaps').onclick=()=>openLibrary('caption',current());

  // ---------- Timeline gestures: trim, move horizontally, move vertically into layers ----------
  const oldStartClipDrag=startClipDrag;
  function validTrackFor(c,tr){if(isEffect(c))return EFFECT_TRACKS.includes(tr);if(isVisual(c))return MEDIA_TRACKS.includes(tr);if(isAudio(c))return ['voice','music'].includes(tr);if(c.type==='text')return MEDIA_TRACKS.slice(1).includes(tr);return c.type==='subtitle'&&tr==='subtitle';}
  startClipDrag=function(e){
    if(exporting||e.button!==0)return;e.stopPropagation();pause();const c=P.clips.find(x=>x.id===e.currentTarget.dataset.id);if(!c)return;selected=c.id;keyIndex=0;if($('editScope'))$('editScope').value='clip';
    const original=clone(c),sx=e.clientX,sy=e.clientY,handle=e.target.dataset.handle,positions=P.clips.map(x=>[x.id,x.start,x.track]),mainOrder=mainClips().map(x=>x.id);let moved=false,checkpointed=false,targetLane=null;const node=e.currentTarget;
    document.body.classList.add('v19DraggingLayer');node.classList.add('v19LayerDragging');
    const restore=()=>{for(const [id,pos,tr] of positions){const x=P.clips.find(v=>v.id===id);if(x){x.start=pos;x.track=tr;}}Object.assign(c,clone(original));};
    const move=ev=>{const dx=ev.clientX-sx,dy=ev.clientY-sy;if(!moved&&Math.hypot(dx,dy)<4)return;if(!checkpointed){checkpoint();checkpointed=true;}moved=true;restore();const delta=snapFrame(dx/pps),a=P.assets.find(x=>x.id===c.asset);
      if(handle==='right'){let d=Math.max(1/30,original.duration+delta);if(a&&a.type!=='image')d=Math.min(d,Math.max(1/30,Math.floor((a.duration-(original.offset||0))*30)/30));resizeClip(c,d,$('resizeMode')?.value||'trim');}
      else if(handle==='left'){let cut=clamp19(delta,-original.start,original.duration-1/30);if(a&&a.type!=='image')cut=Math.max(-(original.offset||0),cut);trimClip(c,cut,original.duration);}
      else{
        c.start=Math.max(0,snapFrame(original.start+delta));
        const lane=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('.track');const tr=lane?.dataset.track;if(Math.abs(dy)>10&&tr&&validTrackFor(c,tr)){c.track=tr;targetLane=lane;}
        if(c.track==='main'&&hasMagnet())placeMain(c,c.start);else if(original.track==='main'&&c.track!=='main'&&hasMagnet())compactMain(P.clips.filter(x=>x.track==='main').sort((a,b)=>a.start-b.start));
        if(!handle&&$('snap')?.checked&&c.track!=='main'){for(const mark of [t,0,...P.clips.filter(x=>x.id!==c.id&&x.track===c.track).flatMap(x=>[x.start,x.start+x.duration])])if(Math.abs(c.start-mark)*pps<7){c.start=mark;break;}}
      }
      buildTimeline();draw();inspector();qa('.v19TrackTarget').forEach(x=>x.classList.remove('v19TrackTarget'));if(targetLane)targetLane.classList.add('v19TrackTarget');
    };
    const done=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',done);window.removeEventListener('pointercancel',cancel);document.body.classList.remove('v19DraggingLayer');qa('.v19TrackTarget').forEach(x=>x.classList.remove('v19TrackTarget'));node.classList.remove('v19LayerDragging');if(moved)changed();else{t=clamp19(t,c.start,Math.max(c.start,c.start+c.duration-1/30));syncMedia(true);renderUI();}};
    const cancel=()=>{if(checkpointed){restore();history.pop();}done();};window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',done,{once:true});window.addEventListener('pointercancel',cancel,{once:true});
  };

  // ---------- Keyframes only for visual media ----------
  const prevInspector=inspector;
  inspector=function(){const r=prevInspector();const c=current();if($('keyControls'))$('keyControls').classList.toggle('hide',!isKeyframable(c));return r;};
  for(const id of ['addKey','quickKeyAdd','deleteKey','quickKeyRemove'])$(id)?.addEventListener('click',e=>{if(!isKeyframable(current())){e.preventDefault();e.stopImmediatePropagation();toast('Keyframes ficam disponíveis somente para vídeo e imagem.');}},true);

  // ---------- Build timeline final pass ----------
  const prevBuildTimeline=buildTimeline;
  buildTimeline=function(){ensureTrackDom();const r=prevBuildTimeline();
    for(const c of P.clips){const el=q(`.clip[data-id="${CSS.escape(c.id)}"]`);if(!el)continue;const noKeys=!isKeyframable(c);el.dataset.v19NoKeys=String(noKeys);if(noKeys)el.querySelectorAll('.clipKey,.edgeKey').forEach(x=>x.remove());
      if(isEffect(c)){const label=el.querySelector('.clipLabel');if(label)label.textContent='✦ '+(c.name||'Efeito');const badge=document.createElement('span');badge.className='v19EffectBadge';badge.textContent=Math.round(c.intensity??70)+'%';el.append(badge);}
      if(isKeyframable(c)){el.querySelectorAll('.clipKey').forEach((d,i)=>{d.classList.toggle('v19KeySelected',c.id===selected&&i===keyIndex);});}
      el.oncontextmenu=e=>{e.preventDefault();showClipMenu(c,e.clientX,e.clientY);};
    }
    markSelection();return r;
  };

  // ---------- Caption marquee selection ----------
  $('timelineScroll')?.addEventListener('pointerdown',e=>{
    if(e.button>0||e.target.closest('.clip,.transitionMark,.ruler'))return;const lane=e.target.closest('.track[data-track="subtitle"]');if(!lane)return;e.preventDefault();e.stopImmediatePropagation();pause();const start={x:e.clientX,y:e.clientY},box=document.createElement('div');box.className='v19CaptionBox';document.body.append(box);const additive=e.ctrlKey||e.metaKey||e.shiftKey,original=new Set(additive?selectedMany:[]);let dragged=false;
    const move=ev=>{const x=Math.min(start.x,ev.clientX),y=Math.min(start.y,ev.clientY),w=Math.abs(ev.clientX-start.x),h=Math.abs(ev.clientY-start.y);if(!dragged&&w+h<5)return;dragged=true;box.style.cssText=`left:${x}px;top:${y}px;width:${w}px;height:${h}px`;selectedMany.clear();original.forEach(id=>selectedMany.add(id));for(const el of qa('.clip.subtitle')){const r=el.getBoundingClientRect();if(r.right>=x&&r.left<=x+w&&r.bottom>=y&&r.top<=y+h)selectedMany.add(el.dataset.id);}selected=[...selectedMany][0]||null;markSelection();};
    const up=()=>{box.remove();window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);if(!dragged)selectedMany.clear();buildTimeline();};window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up,{once:true});window.addEventListener('pointercancel',up,{once:true});
  },{capture:true,passive:false});
  window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'&&!e.target.closest('input,textarea,[contenteditable]')&&current()?.type==='subtitle'){e.preventDefault();selectedMany.clear();P.clips.filter(c=>c.type==='subtitle').forEach(c=>selectedMany.add(c.id));selected=P.clips.find(c=>c.type==='subtitle')?.id||null;buildTimeline();}});

  // ---------- Context menu replaces permanent toolbar ----------
  showClipMenu=function(c,x,y){const menu=$('clipMenu');if(!menu)return;selected=c.id;if(c.type!=='subtitle'&&!selectedMany.has(c.id))selectedMany.clear();menu.replaceChildren();const title=document.createElement('div');title.style.cssText='padding:7px 9px 5px;font-weight:800;font-size:12px;color:#cfe0e4';title.textContent=c.type==='subtitle'&&captionTargets(c).length>1?`${captionTargets(c).length} legendas`:c.name;menu.append(title);
    const action=(label,fn,cls='')=>{const b=document.createElement('button');b.textContent=label;if(cls)b.className=cls;b.onclick=()=>{menu.hidden=true;fn();};menu.append(b);};
    if(isVisual(c)){action('✂ Dividir',()=>split());action('⧉ Duplicar',()=>$('duplicate')?.click());action('▱ Mover para camada',()=>openLayerPicker(c));action('▣ Transformar / escala',()=>window.toucaTransform23?.(c));action('◐ Ajustes',()=>openAdjustInspector(c));if(c.type==='video')action('♪ Volume / áudio',()=>openAudioInspector(c));action('ANI · Animação',()=>openLibrary('animation',c,{targets:[c]}));action('✦ Efeitos',()=>openLibrary('effect',c,{targets:[c]}));}
    else if(isEffect(c)){action('✦ Editar efeito',()=>openEffectInspector(c));action('⌁ Conectar efeito em uma camada',()=>window.toucaEffectTarget23?.(c));}
    else if(isAudio(c)){action('✂ Dividir',()=>split());action('⧉ Duplicar',()=>$('duplicate')?.click());action('♪ Volume / efeitos de voz',()=>openAudioInspector(c));action('♬ Limpar voz / reduzir ruído',()=>window.toucaCleanVoice23?.(c));}
    else if(isTextual(c)){action('T Texto e estilo',()=>openTextInspector(c));if(c.brand)action('⌖ Logo · posição / tamanho',()=>window.toucaLogoInspector23?.(c));action('ANI · Animação',()=>openLibrary('animation',c,{targets:textTargets(c)}));if(c.type==='subtitle')action('▤ Selecionar todas as legendas',()=>{selectedMany.clear();P.clips.filter(x=>x.type==='subtitle').forEach(x=>selectedMany.add(x.id));selected=c.id;buildTimeline();openTextInspector(c);});}
    action('⌫ Excluir',()=>{selected=c.id;deleteSelected();},'danger');
    menu.hidden=false;const mw=260,mh=Math.min(430,menu.scrollHeight||350);menu.style.left=Math.min(x,innerWidth-mw-10)+'px';menu.style.top=Math.min(y,innerHeight-mh-10)+'px';
  };
  function openLayerPicker(c){const options=isEffect(c)?EFFECT_TRACKS:isVisual(c)?MEDIA_TRACKS:c.type==='text'?MEDIA_TRACKS.slice(1):isAudio(c)?['voice','music']:[];const body=openInspector('Mover camada','TIMELINE',`<div class="v19Grid">${options.map(tr=>`<button class="v19Card" data-layer="${tr}"><div class="v19Preview animation">▱</div><b>${TRACK_LABELS[tr]}</b><small>${tr===c.track?'Atual':'Mover'}</small></button>`).join('')}</div>`);body.onclick=e=>{const b=e.target.closest('[data-layer]');if(!b)return;act(()=>{const old=c.track;c.track=b.dataset.layer;if(old==='main'&&c.track!=='main'&&hasMagnet())compactMain();if(c.track==='main'&&hasMagnet())placeMain(c,c.start);});inspectorPanel.classList.add('v19Hidden');};}

  // ---------- Animation compositor ----------
  const previousPaintClip=paintClip;
  function animPose19(c,time){const local=time-c.start,base=valueAt(c.keys,clamp19(local,0,c.duration)),a=c.animation||{};let spec=null,side='in',p=1;if(a.in){const d=Math.min(Math.max(.12,a.in.duration||.42),c.duration);if(local<d){spec=a.in;side='in';p=clamp19(local/d,0,1);}}if(a.out){const d=Math.min(Math.max(.12,a.out.duration||.42),c.duration);if(local>c.duration-d){spec=a.out;side='out';p=clamp19((c.duration-local)/d,0,1);}}if(!spec)return null;const n=spec.name||'fade',u=1-Math.pow(1-p,3),v={...base},dir=side==='out'?-1:1,w=dimensions()[0],h=dimensions()[1],osc=Math.sin(p*Math.PI*3)*Math.pow(Math.sin(p*Math.PI),2),shake=Math.sin(p*Math.PI*8)*Math.pow(Math.sin(p*Math.PI),2);
    const shift=(x,y)=>{v.x+=dir*(1-u)*x;v.y+=dir*(1-u)*y;};
    switch(n){
      case'fade':v.opacity=base.opacity*u;break;case'zoomSoft':v.scale=base.scale*(.78+.22*u);break;case'zoomImpact':v.scale=base.scale*(.48+.52*u+Math.sin(p*Math.PI)*.08);v.x+=shake*10;break;case'zoomElastic':v.scale=base.scale*(.55+.45*u+osc*.17);break;
      case'slideUp':shift(0,h*.42);break;case'slideDown':shift(0,-h*.42);break;case'slideLeft':shift(w*.42,0);break;case'slideRight':shift(-w*.42,0);break;case'pop':v.scale=base.scale*(.35+.65*u+Math.sin(p*Math.PI)*.12);break;case'bounce':v.scale=base.scale*(.62+.38*u+osc*.14);v.y-=Math.abs(Math.sin(p*Math.PI))*26*(1-p);break;
      case'spinShort':v.rotation=base.rotation+dir*(1-u)*22;v.scale=base.scale*(.84+.16*u);break;case'spinFull':v.rotation=base.rotation+dir*(1-u)*360;v.scale=base.scale*(.7+.3*u);break;case'spinZoom':v.rotation=base.rotation+dir*(1-u)*110;v.scale=base.scale*(.48+.52*u);break;case'elastic':v.scale=base.scale*(.7+.3*u+osc*.15);v.x+=osc*22;break;case'spring':v.y+=dir*osc*70;v.scale=base.scale*(.85+.15*u);break;case'pulse':v.scale=base.scale*(1+Math.sin(p*Math.PI)*.16);break;
      case'revealH':v.scaleX=u;v.scale=base.scale*(.6+.4*u);v.opacity=base.opacity*u;break;case'revealV':v.scale=base.scale*(.72+.28*u);v.opacity=base.opacity*u;v.y+=dir*(1-u)*110;break;case'flipX':v.rotation=base.rotation+dir*(1-u)*180;v.scale=base.scale*(.76+.24*u);break;case'flipY':v.rotation=base.rotation-dir*(1-u)*180;v.scale=base.scale*(.76+.24*u);break;
      case'swing':v.rotation=base.rotation+dir*osc*20;v.x+=osc*20;break;case'rollLeft':v.rotation=base.rotation+dir*(1-u)*-90;shift(w*.35,0);break;case'rollRight':v.rotation=base.rotation+dir*(1-u)*90;shift(-w*.35,0);break;case'drop':shift(0,-h*.48);v.rotation+=dir*(1-u)*8;break;
      case'stretchX':v.scale=base.scale*(.65+.35*u+Math.sin(p*Math.PI)*.12);break;case'stretchY':v.scale=base.scale*(.72+.28*u);v.y+=osc*35;break;case'squeeze':v.scale=base.scale*(.42+.58*u);break;case'scaleUp':v.scale=base.scale*u;break;case'scaleDown':v.scale=base.scale*(1.45-.45*u);v.opacity=base.opacity*u;break;case'float':v.y+=dir*(1-u)*110+osc*18;v.opacity=base.opacity*u;break;case'tilt':v.rotation=base.rotation+dir*(1-u)*18;shift(w*.1,0);break;case'spiral':v.rotation=base.rotation+dir*(1-u)*250;v.scale=base.scale*(.35+.65*u);shift(w*.18,h*.12);break;
      case'blur':v.opacity=base.opacity*u;v.scale=base.scale*(.92+.08*u);break;case'focus':v.opacity=base.opacity*u;v.scale=base.scale*(1.16-.16*u);break;case'glitch':v.x+=shake*30*(1-p);v.y+=Math.cos(p*40)*8*(1-p);v.opacity=base.opacity*(.65+.35*u);break;case'rgb':v.x+=shake*12;v.rotation+=shake*.35;break;case'shake':v.x+=shake*22*(1-p);v.y+=Math.cos(p*31)*12*(1-p);break;case'flash':v.opacity=base.opacity*(.35+.65*u);v.scale=base.scale*(.9+.1*u);break;case'lens':v.scale=base.scale*(.5+.5*u);v.rotation+=dir*(1-u)*6;break;case'comicPop':v.scale=base.scale*(.25+.75*u+Math.sin(p*Math.PI)*.18);v.rotation+=dir*(1-u)*-6;break;case'snap':v.scale=base.scale*(p<.45?.65:1);v.opacity=base.opacity*(p<.25?0:1);break;case'combo':v.opacity=base.opacity*u;v.scale=base.scale*(.5+.5*u+Math.sin(p*Math.PI)*.08);shift(w*.25,0);v.rotation+=dir*(1-u)*12;break;
    }return v;
  }
  paintClip=function(g,c,time,pw,ph){if(!c.animation||isAudio(c)||isEffect(c))return previousPaintClip(g,c,time,pw,ph);const v=animPose19(c,time);if(!v)return previousPaintClip(g,c,time,pw,ph);const copy={...c,animation:null,keys:[{t:0,v},{t:Math.max(.001,c.duration),v}]};return previousPaintClip(g,copy,time,pw,ph);};

  // ---------- Transition compositor: always cover the canvas ----------
  const previousBlend=blendFrames;
  blendFrames=function(g,A,B,tr,w,h){const id=tr.type,u=clamp19(tr.u??.5,0,1),s=u*u*(3-2*u),peak=Math.sin(Math.PI*u);if(!TRANSITIONS.some(x=>x[0]===id))return previousBlend(g,A,B,tr,w,h);const edgeScale=1+peak*.035,img=(im,x=0,y=0,scale=1,alpha=1,rot=0)=>{g.save();g.globalAlpha=alpha;g.translate(w/2+x,h/2+y);g.rotate(rot);g.scale(scale,scale);g.drawImage(im,-w/2,-h/2,w,h);g.restore();};g.save();g.setTransform(1,0,0,1,0,0);g.fillStyle='#101217';g.fillRect(0,0,w,h);img(B,0,0,1,1);
    const push=(dx,dy)=>{img(A,dx*s,dy*s,edgeScale,1);img(B,dx*(s-1),dy*(s-1),edgeScale,1);};
    if(id==='mix'||id==='fade'){img(A,0,0,edgeScale,1-s);img(B,0,0,edgeScale,s);}else if(id==='dipBlack'||id==='dipWhite'){const c=id==='dipBlack'?'#000':'#fff';if(u<.5){img(A,0,0,1.04,1-u*2);g.globalAlpha=u*2;g.fillStyle=c;g.fillRect(0,0,w,h);}else{g.fillStyle=c;g.fillRect(0,0,w,h);img(B,0,0,1.04,(u-.5)*2);}}
    else if(['left','slideLeft'].includes(id))push(-w,0);else if(['right','slideRight'].includes(id))push(w,0);else if(['pushUp','slideUp'].includes(id))push(0,-h);else if(['pushDown','slideDown'].includes(id))push(0,h);
    else if(id==='whipLeft'||id==='whipRight'){const d=id==='whipLeft'?-1:1;g.filter=`blur(${peak*10}px)`;push(d*w,0);g.filter='none';}else if(id==='smoothShift'){g.filter=`blur(${peak*3}px)`;push(-w,0);g.filter='none';}else if(id==='shakeCut'){img(A,Math.sin(u*70)*18*peak,Math.cos(u*61)*10*peak,1+peak*.05,1-s);img(B,-Math.sin(u*67)*14*peak,0,1+peak*.05,s);}
    else if(id==='in'){img(A,0,0,1+s*.22,1-s);img(B,0,0,1.25-s*.25,s);}else if(id==='out'){img(A,0,0,1.25-s*.25,1-s);img(B,0,0,.86+s*.14,s);}else if(id==='crossZoom'||id==='zoomBlur'){g.filter=`blur(${peak*(id==='zoomBlur'?9:5)}px)`;img(A,0,0,1+s*.28,1-s);img(B,0,0,1.28-s*.28,s);g.filter='none';}
    else if(id==='spin'){img(A,0,0,1+s*.12,1-s,s*.35);img(B,0,0,1.18-s*.18,s,-(1-s)*.28);}else if(id==='spinZoom'){img(A,0,0,1+s*.35,1-s,s*.7);img(B,0,0,1.32-s*.32,s,-(1-s)*.6);}else if(id==='tilt'){img(A,-s*w*.22,0,1+peak*.04,1-s,-s*.12);img(B,(1-s)*w*.2,0,1+peak*.04,s,(1-s)*.1);}else if(id==='lensZoom'){g.filter=`blur(${peak*4}px)`;img(A,0,0,1+s*.38,1-s);img(B,0,0,1.38-s*.38,s);g.filter='none';}
    else if(id.startsWith('wipe')){img(A,0,0,edgeScale,1);g.save();g.beginPath();if(id==='wipeLeft')g.rect(w*(1-s),0,w*s,h);if(id==='wipeRight')g.rect(0,0,w*s,h);if(id==='wipeUp')g.rect(0,h*(1-s),w,h*s);if(id==='wipeDown')g.rect(0,0,w,h*s);g.clip();img(B,0,0,edgeScale,1);g.restore();}
    else if(id==='circle'||id==='diamond'){img(A,0,0,edgeScale,1);g.save();g.beginPath();if(id==='circle')g.arc(w/2,h/2,Math.hypot(w,h)*.55*s,0,Math.PI*2);else{const r=Math.hypot(w,h)*.55*s;g.moveTo(w/2,h/2-r);g.lineTo(w/2+r,h/2);g.lineTo(w/2,h/2+r);g.lineTo(w/2-r,h/2);g.closePath();}g.clip();img(B,0,0,edgeScale,1);g.restore();}
    else if(id==='splitH'||id==='splitV'){img(A,0,0,edgeScale,1);g.save();g.beginPath();if(id==='splitH'){g.rect(0,h/2-h*s/2,w,h*s);}else{g.rect(w/2-w*s/2,0,w*s,h);}g.clip();img(B,0,0,edgeScale,1);g.restore();}
    else if(id==='blurMix'){g.filter=`blur(${peak*9}px)`;img(A,0,0,edgeScale,1-s);img(B,0,0,edgeScale,s);g.filter='none';}else if(id==='glitch'){img(A,Math.sin(u*80)*12*peak,0,1+peak*.05,1-s);img(B,-Math.sin(u*73)*10*peak,0,1+peak*.05,s);for(let y=0;y<h;y+=Math.max(12,h/24)){if(((y+u*100)|0)%3===0){g.globalAlpha=.15*peak;g.fillStyle='#fff';g.fillRect(0,y,w,2);}}}else if(id==='rgb'){img(A,-8*peak,0,1.04,1-s);g.globalCompositeOperation='screen';g.globalAlpha=.25*peak;g.filter='sepia(1) saturate(8) hue-rotate(-55deg)';img(A,9*peak,0,1.04,1-s);g.filter='none';g.globalCompositeOperation='source-over';img(B,0,0,edgeScale,s);}else if(id==='pixel'){const n=Math.max(4,Math.round(28*peak));g.imageSmoothingEnabled=false;img(A,0,0,edgeScale,1-s);g.globalAlpha=s;img(B,0,0,edgeScale,1);g.imageSmoothingEnabled=true;}
    else if(id==='flashWhite'||id==='flashBlack'||id==='filmBurn'||id==='lightLeak'||id==='comicFlash'){img(A,0,0,edgeScale,1-s);img(B,0,0,edgeScale,s);g.globalAlpha=peak*(id==='comicFlash'?.9:.65);if(id==='flashBlack')g.fillStyle='#000';else if(id==='filmBurn')g.fillStyle='#ff6b21';else if(id==='lightLeak')g.fillStyle='#ffb65a';else g.fillStyle='#fff';g.fillRect(0,0,w,h);}
    else if(id==='panelSwipe'){push(-w,0);g.globalAlpha=.22;g.fillStyle='#000';for(let x=0;x<w;x+=w/4)g.fillRect(x,0,3,h);}else if(id==='pageTurn'){img(B,0,0,edgeScale,1);img(A,-s*w*.9,0,1.04,1, -s*.08);g.globalAlpha=.25*(1-s);g.fillStyle='#000';g.fillRect(w*(1-s)-20,0,40,h);}else if(id==='ink'){img(A,0,0,edgeScale,1-s);img(B,0,0,edgeScale,s);g.globalAlpha=.25*peak;g.fillStyle='#101010';for(let i=0;i<18;i++){const x=(i*97+u*271)%w,y=(i*53+u*199)%h,r=(20+(i%5)*18)*peak;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();}}
    g.restore();
  };
  showTransition=function(id){const c=P.clips.find(x=>x.id===id),cut=cutFor(c);if(cut)openLibrary('transition',null,{cut});};

  // ---------- Layered post-effects ----------
  const prevDrawTo=drawTo,fxA=document.createElement('canvas'),fxB=document.createElement('canvas');
  function activeEffects(time){return P.clips.filter(c=>c.type==='effect'&&c.enabled!==false&&time>=c.start&&time<c.start+c.duration).sort((a,b)=>EFFECT_TRACKS.indexOf(a.track)-EFFECT_TRACKS.indexOf(b.track));}
  function filtered(ctx,src,w,h,filter){ctx.filter=filter;ctx.drawImage(src,0,0,w,h);ctx.filter='none';}
  function postFx19(ctx,src,fx,w,h,time){const id=fx.preset||'wide',k=clamp19((fx.intensity??70)/100,0,1);ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';
    const ov=(color,a)=>{ctx.save();ctx.globalAlpha=a;ctx.fillStyle=color;ctx.fillRect(0,0,w,h);ctx.restore();};
    if(id==='wide'){let layer=src;if(!lensFailed){try{lensRenderer??=createLens();if(lensRenderer)layer=lensRenderer.render(src,k*.32);else lensFailed=true;}catch{lensFailed=true;}}ctx.drawImage(layer,0,0,w,h);}else if(id==='cinematic')filtered(ctx,src,w,h,`contrast(${1+.22*k}) saturate(${1-.14*k}) brightness(${1-.04*k})`);else if(id==='warm')filtered(ctx,src,w,h,`sepia(${.2*k}) saturate(${1+.32*k}) hue-rotate(${-10*k}deg)`);else if(id==='cool')filtered(ctx,src,w,h,`saturate(${1-.06*k}) hue-rotate(${14*k}deg) brightness(${1+.02*k})`);else if(id==='mono')filtered(ctx,src,w,h,`grayscale(${k}) contrast(${1+.18*k})`);else if(id==='vintage')filtered(ctx,src,w,h,`sepia(${.55*k}) contrast(${1-.08*k}) saturate(${1-.25*k}) brightness(${1+.04*k})`);else if(id==='neon'||id==='cyber')filtered(ctx,src,w,h,`saturate(${1+(id==='cyber'?1.35:.9)*k}) contrast(${1+.3*k}) hue-rotate(${id==='cyber'?20*k:0}deg)`);
    else if(id==='dream'||id==='softGlow'){filtered(ctx,src,w,h,`blur(${1.2*k}px) brightness(${1+.08*k}) saturate(${1-.08*k})`);ctx.globalCompositeOperation='screen';ctx.globalAlpha=.18*k;ctx.filter=`blur(${10+10*k}px)`;ctx.drawImage(src,0,0,w,h);}else if(id==='blur')filtered(ctx,src,w,h,`blur(${1+9*k}px)`);else if(id==='glow'||id==='bloom'){ctx.drawImage(src,0,0,w,h);ctx.globalCompositeOperation='screen';ctx.globalAlpha=(id==='bloom'?.55:.4)*k;ctx.filter=`blur(${id==='bloom'?24:16}px) saturate(${1+.35*k})`;ctx.drawImage(src,0,0,w,h);}else if(id==='sharpen'||id==='contrast')filtered(ctx,src,w,h,`contrast(${1+(id==='sharpen'?.32:.5)*k}) saturate(${1+.12*k})`);else if(id==='desaturate')filtered(ctx,src,w,h,`saturate(${1-.8*k})`);else if(id==='tealOrange')filtered(ctx,src,w,h,`saturate(${1+.25*k}) contrast(${1+.13*k}) sepia(${.08*k}) hue-rotate(${6*k}deg)`);else if(id==='sepia')filtered(ctx,src,w,h,`sepia(${.85*k}) contrast(${1+.05*k})`);
    else if(id==='vhs'||id==='crt'||id==='tv'){filtered(ctx,src,w,h,`contrast(${1+.13*k}) saturate(${1+.18*k})`);ctx.globalAlpha=.16*k;ctx.fillStyle='#000';for(let y=0;y<h;y+=id==='crt'?4:6)ctx.fillRect(0,y,w,id==='crt'?1:2);if(id==='tv'){ctx.globalAlpha=.08*k;ctx.fillStyle='#fff';ctx.fillRect(0,(time*90%h)|0,w,2);}}else if(id==='grain'||id==='noise'||id==='oldFilm'){ctx.drawImage(src,0,0,w,h);let seed=((time*30)|0)+731;ctx.globalAlpha=(id==='noise'?.16:.1)*k;for(let i=0;i<Math.min(650,Math.round(w*h/5500));i++){seed=seed*16807%2147483647;const x=seed%w;seed=seed*16807%2147483647;const y=seed%h;ctx.fillStyle=seed&1?'#fff':'#000';ctx.fillRect(x,y,2,2);}if(id==='oldFilm')ov('#b98954',.08*k);}else if(id==='vignette'){ctx.drawImage(src,0,0,w,h);const gr=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.2,w/2,h/2,Math.max(w,h)*.68);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,`rgba(0,0,0,${.72*k})`);ctx.fillStyle=gr;ctx.fillRect(0,0,w,h);}else if(id==='chromatic'){ctx.drawImage(src,0,0,w,h);ctx.globalCompositeOperation='screen';ctx.globalAlpha=.16*k;ctx.filter='sepia(1) saturate(8) hue-rotate(-55deg)';ctx.drawImage(src,-7*k,0,w,h);ctx.filter='sepia(1) saturate(8) hue-rotate(145deg)';ctx.drawImage(src,7*k,0,w,h);}else if(id==='shake'){const dx=Math.sin(time*55)*9*k,dy=Math.cos(time*47)*7*k;ctx.translate(w/2+dx,h/2+dy);ctx.scale(1.025,1.025);ctx.drawImage(src,-w/2,-h/2,w,h);}else if(id==='pixel'||id==='poster'||id==='halftone'){const div=id==='pixel'?22:id==='poster'?12:9,sw=Math.max(24,Math.round(w/(5+div*k))),sh=Math.max(24,Math.round(h/(5+div*k))),tmp=document.createElement('canvas');tmp.width=sw;tmp.height=sh;const tg=tmp.getContext('2d');tg.imageSmoothingEnabled=false;tg.drawImage(src,0,0,sw,sh);ctx.imageSmoothingEnabled=false;ctx.drawImage(tmp,0,0,sw,sh,0,0,w,h);ctx.imageSmoothingEnabled=true;if(id==='halftone'){ctx.globalAlpha=.13*k;ctx.fillStyle='#000';for(let y=4;y<h;y+=9)for(let x=4;x<w;x+=9){ctx.beginPath();ctx.arc(x,y,1.5,0,Math.PI*2);ctx.fill();}}}
    else if(id==='comic')filtered(ctx,src,w,h,`contrast(${1+.45*k}) saturate(${1+.6*k}) brightness(${1+.03*k})`);else if(id==='scan'){ctx.drawImage(src,0,0,w,h);ctx.globalAlpha=.18*k;ctx.fillStyle='#57e7ff';ctx.fillRect(0,(time*130%h)|0,w,3);}else if(id==='flicker'){filtered(ctx,src,w,h,`brightness(${1+(Math.sin(time*55)*.12+.08)*k}) contrast(${1+.06*k})`);}else if(id==='flash'){filtered(ctx,src,w,h,`brightness(${1+.3*Math.abs(Math.sin(time*8))*k})`);}else if(id==='spotlight'){ctx.drawImage(src,0,0,w,h);const x=w*(.5+.25*Math.sin(time*.7)),y=h*.42,gr=ctx.createRadialGradient(x,y,0,x,y,Math.max(w,h)*.45);gr.addColorStop(0,`rgba(255,255,255,${.28*k})`);gr.addColorStop(1,'rgba(0,0,0,0)');ctx.globalCompositeOperation='screen';ctx.fillStyle=gr;ctx.fillRect(0,0,w,h);}else if(id==='focus'||id==='radialBlur'){filtered(ctx,src,w,h,`blur(${(id==='focus'?3:6)*k}px)`);ctx.save();ctx.beginPath();ctx.arc(w/2,h/2,Math.min(w,h)*(.28+.18*(1-k)),0,Math.PI*2);ctx.clip();ctx.filter='none';ctx.drawImage(src,0,0,w,h);ctx.restore();}
    else if(id==='motionBlur'){ctx.globalAlpha=.55;for(let i=0;i<5;i++)ctx.drawImage(src,i*3*k,0,w,h);}else if(id==='ghost'||id==='trail'){ctx.drawImage(src,0,0,w,h);ctx.globalAlpha=.18*k;for(let i=1;i<=3;i++)ctx.drawImage(src,-i*5*k,i*2*k,w,h);}else if(id==='pulse'){const s=1+.025*Math.sin(time*6)*k;ctx.translate(w/2,h/2);ctx.scale(s,s);ctx.drawImage(src,-w/2,-h/2,w,h);}else if(id==='fisheye'||id==='lens'){const s=1+(id==='fisheye'?.12:.06)*k;ctx.translate(w/2,h/2);ctx.scale(s,s);ctx.drawImage(src,-w/2,-h/2,w,h);}else if(id==='edge'||id==='sketch'){filtered(ctx,src,w,h,`grayscale(${.8*k}) contrast(${1+.7*k}) brightness(${1+.08*k})`);if(id==='sketch')ov('#fff',.08*k);}else if(id==='lightLeak'){ctx.drawImage(src,0,0,w,h);const gr=ctx.createLinearGradient(0,0,w,h);gr.addColorStop(0,'rgba(255,121,55,0)');gr.addColorStop(.55,`rgba(255,145,64,${.26*k})`);gr.addColorStop(1,'rgba(255,235,160,0)');ctx.globalCompositeOperation='screen';ctx.fillStyle=gr;ctx.fillRect(0,0,w,h);}else ctx.drawImage(src,0,0,w,h);
    ctx.restore();
  }
  drawTo=function(g,w,h,time){const list=activeEffects(time);if(!list.length)return prevDrawTo(g,w,h,time);const states=list.map(c=>c.enabled);list.forEach(c=>c.enabled=false);if(fxA.width!==w||fxA.height!==h){fxA.width=fxB.width=w;fxA.height=fxB.height=h;}const a=fxA.getContext('2d',{alpha:false}),b=fxB.getContext('2d',{alpha:false});try{prevDrawTo(a,w,h,time);}finally{list.forEach((c,i)=>c.enabled=states[i]);}let src=fxA,dst=fxB;for(const fx of list){const dg=dst.getContext('2d',{alpha:false});postFx19(dg,src,fx,w,h,time);const tmp=src;src=dst;dst=tmp;}g.save();g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,w,h);g.drawImage(src,0,0,w,h);g.restore();};

  // ---------- Final behavior + migration ----------
  const previousRender=renderUI;
  renderUI=function(full=true){const r=previousRender(full);if($('v18ContextBar'))$('v18ContextBar').classList.remove('show');markSelection();if($('saveState')&&window.toucaNative)$('saveState').textContent=$('saveState').textContent.replace('v18','v21').replace('v19','v21').replace('v20','v23').replace('v21','v23').replace('v22','v23');return r;};
  const previousChanged=changed;changed=function(){P.editorVersion=VERSION;const r=previousChanged();return r;};
  // migrate old effect track names and keep projects update-safe
  for(const c of P.clips){if(c.type==='effect'&&!EFFECT_TRACKS.includes(c.track))c.track='effects';if(isVisual(c)&&!MEDIA_TRACKS.includes(c.track))c.track='main';}
  // neutral captions/text: no forced legacy preset
  if($('asrStyle'))$('asrStyle').checked=false;
  // legacy green select button may be recreated by a deep render; keep it hidden.
  new MutationObserver(()=>{for(const id of ['selectMode','deleteMany'])$(id)?.setAttribute('hidden','');}).observe(document.body,{childList:true,subtree:true});
  // resource panels should close with Escape.
  window.addEventListener('keydown',e=>{if(e.key==='Escape'){library.classList.add('v19Hidden');inspectorPanel.classList.add('v19Hidden');$('clipMenu')&&( $('clipMenu').hidden=true );}});
  // Clicking outside contextual menu closes it.
  document.addEventListener('pointerdown',e=>{const m=$('clipMenu');if(m&&!m.hidden&&!m.contains(e.target)&&!e.target.closest('.clip'))m.hidden=true;},true);
  // Start final pass after the v18 launcher's own delayed call.
  setTimeout(()=>{ensureTrackDom();buildTimeline();},800);


  // ==========================================================
  // Touca Editor v21 — fluid timeline drag, clean trim zones and focused effects
  // ==========================================================
  document.documentElement.dataset.toucaV20='true';
  if(!FONTS.includes('Bangers'))FONTS.unshift('Bangers');
  if(CAPTION_PRESETS.comic)CAPTION_PRESETS.comic.font='Bangers';
  if(CAPTION_PRESETS.headline)CAPTION_PRESETS.headline.font='Bangers';
  P.editorVersion=VERSION;
  try{deferMenu=()=>{};}catch{}

  const native20=window.toucaNative||null;

  // Desktop navigation: a persistent way back to the project launcher.
  const topActions21=q('.topActions');
  if(topActions21&&!$('v21HomeBtn')){
    const b=document.createElement('button');b.id='v21HomeBtn';b.className='ghost v21HomeBtn';b.type='button';b.textContent='⌂ Início';b.title='Voltar para projetos';
    topActions21.insertBefore(b,topActions21.firstChild);
    b.onclick=async()=>{if(window.__toucaImportBusy29)return;pause();try{await window.toucaSaveNow29?.();}catch(e){return toast('Não foi possível salvar: '+e.message);}try{scheduleProjectThumb20(0);}catch{}const home=$('v18Home');if(home){home.classList.remove('v18Hidden');try{renderHome20();}catch{}}};
  }
  // Restore the old wide-angle default for v20-created clips that kept the temporary 70% preset.
  for(const fx of P.clips.filter(c=>c.type==='effect'&&c.preset==='wide'))if((fx.intensity??70)===70)fx.intensity=25;
  const UI_TRACK_ORDER=['main','effectsLocal','overlay','overlay2','overlay3','overlay4','overlay5','effects','effects2','effects3','effects4','effects5','subtitle','voice','music'];
  Object.assign(TRACK_LABELS,{effects:'Efeito global 1',effects2:'Efeito global 2',effects3:'Efeito global 3',effects4:'Efeito global 4',effects5:'Efeito global 5',effectsLocal:'Efeito principal'});
  const GLOBAL_EFFECT_TRACKS=['effects','effects2','effects3','effects4','effects5'];

  // UI order is independent from compositor order. This keeps overlays above the principal media visually
  // without changing the order used by the renderer.
  ensureTrackDom=function(){
    rebuildTrackArray();
    if(!tracks.includes('effectsLocal'))tracks.push('effectsLocal');
    const heads=q('.trackHeads'),content=$('timelineContent');if(!heads||!content)return;
    const oldHeads=qa('.trackHead:not(.rulerHead)');
    for(const h of oldHeads){if(!h.dataset.trackHead){const txt=h.textContent.trim().toLowerCase();if(txt.includes('mídia'))h.dataset.trackHead='main';else if(txt.includes('legenda'))h.dataset.trackHead='subtitle';else if(txt.includes('música'))h.dataset.trackHead='music';else if(txt.includes('áudio'))h.dataset.trackHead='voice';else if(txt.includes('efeito'))h.dataset.trackHead='effects';}}
    for(const tr of UI_TRACK_ORDER){
      let lane=q(`.track[data-track="${tr}"]`);if(!lane){lane=document.createElement('div');lane.className='track';lane.dataset.track=tr;content.append(lane);}
      let h=q(`.trackHead[data-track-head="${tr}"]`);if(!h){h=document.createElement('div');h.className='trackHead';h.dataset.trackHead=tr;heads.append(h);}
      h.className='trackHead '+(tr.startsWith('effects')?'effects':tr.startsWith('overlay')?'overlay':tr);
      h.innerHTML='<span></span>'+esc(TRACK_LABELS[tr]||tr);
    }
    for(const tr of UI_TRACK_ORDER){const h=q(`.trackHead[data-track-head="${tr}"]`),lane=q(`.track[data-track="${tr}"]`);if(h)heads.append(h);if(lane)content.append(lane);}
  };

  // ---------- Animation / transition duration ----------
  const v20Duration={transition:.42,in:.42,out:.42};
  const openLibrary19=openLibrary,renderLibrary19=renderLibrary;
  openLibrary=function(mode,target=current(),extra={}){
    if(mode==='animation'){
      const candidates=extra.targets?.length?extra.targets:(target?[target]:[]),spec=candidates.find(c=>c?.animation?.[libSide])?.animation?.[libSide];
      if(spec?.duration)v20Duration[libSide]=clamp19(Number(spec.duration)||.42,.1,3);
    }
    if(mode==='transition'){
      const cut=extra.cut||null,tr=cut?.b?.transition;if(tr?.duration)v20Duration.transition=clamp19(Number(tr.duration)||.42,.1,3);
    }
    return openLibrary19(mode,target,extra);
  };
  renderLibrary=function(){
    renderLibrary19();
    setTimeout(()=>window.__toucaV23DecorateLibrary?.({mode:libMode,side:libSide,target:libTarget,extra:libExtra}),0);
  };
  applyAnimation=function(id,target){
    const targets=libExtra.targets?.length?libExtra.targets:(target?[target]:selectedClips19()),valid=targets.filter(c=>c&&!['audio','effect'].includes(c.type));
    if(!valid.length)return toast('Animação funciona em mídia, texto ou legenda.');
    applyMany(valid,c=>{c.animation??={};const d=clamp19(Number(c.animation[libSide]?.duration)||v20Duration[libSide]||.42,.1,3);c.animation[libSide]={name:id,duration:Math.min(d,c.duration)};});
  };
  applyTransition=function(id,cut){
    if(!cut){const all=cuts();cut=all.sort((a,b)=>Math.abs(a.time-t)-Math.abs(b.time-t))[0];}
    if(!cut)return toast('Adicione dois clips consecutivos na faixa principal.');
    const d=Math.min(clamp19(Number(cut.b.transition?.duration)||v20Duration.transition||.42,.1,3),cut.a.duration,cut.b.duration);
    act(()=>cut.b.transition={type:id,duration:d,sound:cut.b.transition?.sound||'none',volume:cut.b.transition?.volume||0,from:cut.a.id});
  };

  // ---------- Logo/brand uses the same text styling concepts ----------
  const brandPanel=$('v18BrandPanel');
  const BRAND_KEY='touca.brandConfig.v20';
  const BRAND_FONTS=['Bangers','Arial','Arial Black','Impact','Segoe UI','Segoe UI Semibold','Georgia','Trebuchet MS','Verdana','Courier New'];
  function readBrand20(){try{return JSON.parse(localStorage.getItem(BRAND_KEY)||'null')||{};}catch{return {};}}
  function brandDefaults20(){return {text:localStorage.getItem('touca.brandText')||'',font:'Bangers',fontSize:72,fontWeight:700,color:'#ffffff',strokeColor:'#111111',stroke:3,shadowColor:'#000000',shadowBlur:5,textBg:'transparent',textBgOpacity:0,position:'center',yPercent:0,opacity:50};}
  function brandState20(){return Object.assign(brandDefaults20(),readBrand20());}
  function openBrand20(){
    if(!brandPanel)return;const b=brandState20(),body=brandPanel.querySelector('.v18PanelBody');
    body.innerHTML=`<div class="v19Fields"><label class="v19Field full"><span>Texto da logo</span><input id="v20BrandText" maxlength="80" placeholder="@seuusuario ou nome da marca" value="${esc(b.text)}"></label><label class="v19Field"><span>Fonte</span><select id="v20BrandFont">${BRAND_FONTS.map(f=>`<option ${f===b.font?'selected':''}>${esc(f)}</option>`).join('')}</select></label><label class="v19Field"><span>Tamanho</span><input id="v20BrandSize" type="number" min="20" max="260" value="${b.fontSize}"></label><label class="v19Field"><span>Cor</span><input id="v20BrandColor" type="color" value="${b.color}"></label><label class="v19Field"><span>Contorno</span><input id="v20BrandStrokeColor" type="color" value="${b.strokeColor}"></label><label class="v19Field"><span>Espessura</span><input id="v20BrandStroke" type="number" min="0" max="20" value="${b.stroke}"></label><label class="v19Field"><span>Sombra</span><input id="v20BrandShadowColor" type="color" value="${b.shadowColor}"></label><label class="v19Field"><span>Desfoque sombra</span><input id="v20BrandShadow" type="number" min="0" max="30" value="${b.shadowBlur}"></label><label class="v19Field full"><span>Posição vertical · centro horizontal</span><input id="v23BrandY" type="range" min="-45" max="45" step="1" value="${b.yPercent??0}"></label></div><div class="v19Actions"><button id="v20BrandSave" class="primary">Salvar padrão</button><button id="v20BrandClear">Limpar</button><button id="v20BrandAdd">Adicionar agora</button></div><div class="v19Notice">A logo é um texto especial: depois de adicionada, você ainda pode selecionar e editar fonte, cor, contorno, sombra e animação.</div>`;
    brandPanel.classList.remove('v18Hidden');
    const collect=()=>({text:$('v20BrandText').value.trim(),font:$('v20BrandFont').value,fontSize:clamp19(Number($('v20BrandSize').value)||72,20,260),fontWeight:700,color:$('v20BrandColor').value,strokeColor:$('v20BrandStrokeColor').value,stroke:clamp19(Number($('v20BrandStroke').value)||0,0,20),shadowColor:$('v20BrandShadowColor').value,shadowBlur:clamp19(Number($('v20BrandShadow').value)||0,0,30),textBg:'transparent',textBgOpacity:0,position:'center',yPercent:Number($('v23BrandY')?.value||0),opacity:50});
    $('v20BrandSave').onclick=()=>{const cfg=collect();localStorage.setItem(BRAND_KEY,JSON.stringify(cfg));if(cfg.text)localStorage.setItem('touca.brandText',cfg.text);else localStorage.removeItem('touca.brandText');toast('Logo salva como padrão.');};
    $('v20BrandClear').onclick=()=>{localStorage.removeItem(BRAND_KEY);localStorage.removeItem('touca.brandText');openBrand20();toast('Padrão de logo limpo.');};
    $('v20BrandAdd').onclick=()=>{const cfg=collect();if(!cfg.text)return toast('Digite o texto da logo.');localStorage.setItem(BRAND_KEY,JSON.stringify(cfg));localStorage.setItem('touca.brandText',cfg.text);addBrand20(cfg);brandPanel.classList.add('v18Hidden');};
  }
  function addBrand20(cfg){
    act(()=>{const [w,h]=dimensions(),d=Math.max(1,total()||5),c=newClip('text',cfg.text,null,'overlay',0,d);Object.assign(c,{text:cfg.text,font:cfg.font,fontSize:cfg.fontSize,fontWeight:cfg.fontWeight,color:cfg.color,strokeColor:cfg.strokeColor,stroke:cfg.stroke,shadowColor:cfg.shadowColor,shadowBlur:cfg.shadowBlur,shadowY:Math.round(cfg.shadowBlur*.35),align:'center',textBg:'transparent',brand:true});
      const pos=[0,h*clamp19(Number(cfg.yPercent)||0,-45,45)/100];for(const k of c.keys){k.v.x=0;k.v.y=pos[1];k.v.opacity=50;}c.logoYPercent=Number(cfg.yPercent)||0;c.logoOpacity=50;P.clips.push(c);selected=c.id;t=0;});
    openTextInspector(current());
  }
  if($('addBrand'))$('addBrand').onclick=openBrand20;if($('directLogo'))$('directLogo').onclick=()=>{try{closeQuick?.();}catch{}openBrand20();};

  // ---------- Stable context menus: no auto-dismiss timer ----------
  const clipMenu20=$('clipMenu');if(clipMenu20){clipMenu20.onpointerdown=null;clipMenu20.classList.remove('fading');}
  function placeMenu20(menu,x,y,w=260){menu.hidden=false;menu.classList.remove('fading');requestAnimationFrame(()=>{const h=Math.min(innerHeight-20,menu.scrollHeight||360);menu.style.left=Math.max(8,Math.min(x,innerWidth-w-10))+'px';menu.style.top=Math.max(8,Math.min(y,innerHeight-h-10))+'px';});}
  function keyMenu20(c,index,x,y){const menu=$('clipMenu');if(!menu)return;selected=c.id;keyIndex=index;menu.replaceChildren();const title=document.createElement('div');title.className='v20MenuTitle';title.textContent=`Keyframe ${index+1} · ${c.keys[index]?.t.toFixed(2)||'0.00'} s`;menu.append(title);const del=document.createElement('button');del.textContent='◇− Excluir keyframe';del.onclick=()=>{menu.hidden=true;if(window.toucaDeleteKey29)return window.toucaDeleteKey29(c,index);if(c.keys.length<=1)return;act(()=>{c.keys.splice(index,1);keyIndex=clamp19(index-1,0,c.keys.length-1);});};menu.append(del);placeMenu20(menu,x,y);}

  // ---------- Timeline drag / trim: stable DOM + fluid visual ghost ----------
  function effectDropTrack20(x,y){const lane=document.elementFromPoint(x,y)?.closest('.track');if(!lane)return null;const tr=lane.dataset.track;if(EFFECT_TRACKS.includes(tr))return tr;if(MEDIA_TRACKS.includes(tr)){if(tr==='main'){const r=lane.getBoundingClientRect();return y<r.top+r.height*.5?'effects':'effectsLocal';}return 'effects';}return null;}
  function compatibleTrack20(c,x,y){const lane=document.elementFromPoint(x,y)?.closest('.track');const tr=lane?.dataset.track;if(isEffect(c))return effectDropTrack20(x,y);if(isVisual(c))return MEDIA_TRACKS.includes(tr)?tr:null;if(isAudio(c))return AUDIO_TRACKS.includes(tr)?tr:null;if(c.type==='text'||c.type==='subtitle')return (MEDIA_TRACKS.slice(1).includes(tr)||tr==='subtitle')?tr:null;return null;}
  function audioTrackFree23(c,tr,start){return !P.clips.some(x=>x.id!==c.id&&isAudio(x)&&x.track===tr&&x.start<start+c.duration&&start<x.start+x.duration);}
  function resolveAudioTrack23(c,tr,start){if(!isAudio(c)||audioTrackFree23(c,tr,start))return tr;return AUDIO_TRACKS.find(x=>audioTrackFree23(c,x,start))||null;}
  function snapStart21(c,start,track){start=Math.max(0,snapFrame(start));if($('snap')?.checked&&track!=='main'){for(const mark of [t,0,...P.clips.filter(x=>x.id!==c.id&&x.track===track).flatMap(x=>[x.start,x.start+x.duration])])if(Math.abs(start-mark)*pps<7){start=mark;break;}}return start;}
  function clearDrop21(){qa('.v19TrackTarget,.v20InvalidDrop').forEach(x=>x.classList.remove('v19TrackTarget','v20InvalidDrop'));}
  function makeDragGhost21(node){const r=node.getBoundingClientRect(),g=node.cloneNode(true);g.removeAttribute('id');g.classList.add('v21DragGhost');g.classList.remove('selected','v19CaptionSelected','multiSelected','v19LayerDragging');g.querySelectorAll('.handle,.v21TrimZone,.edgeKey,.clipKey,.transitionMark').forEach(x=>x.remove());document.body.append(g);g.style.left=r.left+'px';g.style.top=r.top+'px';g.style.width=Math.max(1,r.width)+'px';g.style.setProperty('height',Math.max(1,r.height)+'px','important');g.style.setProperty('--touca-ghost-w',Math.max(1,r.width)+'px');g.style.setProperty('--touca-ghost-h',Math.max(1,r.height)+'px');return g;}
  function autoScroll21(scroll,e){const r=scroll.getBoundingClientRect(),edge=38,stepX=22,stepY=18;if(e.clientX<r.left+edge)scroll.scrollLeft=Math.max(0,scroll.scrollLeft-stepX);else if(e.clientX>r.right-edge)scroll.scrollLeft+=stepX;if(e.clientY<r.top+edge)scroll.scrollTop=Math.max(0,scroll.scrollTop-stepY);else if(e.clientY>r.bottom-edge)scroll.scrollTop+=stepY;}
  startClipDrag=function(e){
    if(exporting||e.button!==0)return;if(e.target.closest('.clipKey,.edgeKey'))return;e.preventDefault();e.stopPropagation();pause();
    const c=P.clips.find(x=>x.id===e.currentTarget.dataset.id);if(!c)return;selected=c.id;keyIndex=0;if($('editScope'))$('editScope').value='clip';
    const node=e.currentTarget,scroll=$('timelineScroll'),scrollRect=scroll.getBoundingClientRect(),nodeRect=node.getBoundingClientRect(),original=clone(c),sx=e.clientX,sy=e.clientY,handle=e.target.closest('.v21TrimZone')?.dataset.handle||null,mainOrder=mainClips().map(x=>x.id),grabTime=(scroll.scrollLeft+sx-scrollRect.left)/Math.max(1,pps)-original.start;
    let moved=false,ghost=null,previewTrack=original.track,previewStart=original.start,dropValid=true,targetLane=null,pendingResize=null;
    const beginMove=()=>{if(moved)return;moved=true;if(handle){document.body.classList.add('v20Resizing');node.classList.add('v21ResizePreview');}else{document.body.classList.add('v19DraggingLayer','v21Dragging');node.classList.add('v21SourceDragging');ghost=makeDragGhost21(node);}};
    const previewResize=(delta)=>{const a=P.assets.find(x=>x.id===c.asset);if(handle==='right'){let d=Math.max(1/30,original.duration+delta);if(a&&['video','audio'].includes(a.type))d=Math.min(d,Math.max(1/30,Math.floor((a.duration-(original.offset||0))*30)/30));pendingResize={side:'right',duration:d};node.style.left=(original.start*pps)+'px';node.style.width=Math.max(6,d*pps)+'px';}else{let cut=clamp19(delta,-original.start,original.duration-1/30);if(a&&['video','audio'].includes(a.type))cut=Math.max(-(original.offset||0),cut);pendingResize={side:'left',cut};node.style.left=((original.start+cut)*pps)+'px';node.style.width=Math.max(6,(original.duration-cut)*pps)+'px';}};
    const move=ev=>{const dx=ev.clientX-sx,dy=ev.clientY-sy;if(!moved&&Math.hypot(dx,dy)<3)return;beginMove();ev.preventDefault();
      if(handle){previewResize(snapFrame(dx/pps));return;}
      autoScroll21(scroll,ev);clearDrop21();previewTrack=compatibleTrack20(c,ev.clientX,ev.clientY);dropValid=!!previewTrack;targetLane=dropValid?q(`.track[data-track="${previewTrack}"]`):null;previewStart=snapStart21(c,(scroll.scrollLeft+ev.clientX-scrollRect.left)/Math.max(1,pps)-grabTime,previewTrack||original.track);
      if(targetLane)targetLane.classList.add('v19TrackTarget');else q('.timeline')?.classList.add('v20InvalidDrop');
      if(ghost){const laneRect=targetLane?.getBoundingClientRect(),x=scrollRect.left+previewStart*pps-scroll.scrollLeft,y=laneRect?laneRect.top+4:ev.clientY-nodeRect.height/2;ghost.style.left=x+'px';ghost.style.top=y+'px';ghost.style.width=Math.max(20,original.duration*pps)+'px';ghost.classList.toggle('v21InvalidGhost',!dropValid);}
    };
    const cleanVisual=()=>{document.body.classList.remove('v19DraggingLayer','v21Dragging','v20Resizing');clearDrop21();node.classList.remove('v21SourceDragging','v21ResizePreview');node.style.left='';node.style.width='';ghost?.remove();ghost=null;};
    const finish=(cancel=false)=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancelFn);cleanVisual();if(!moved){t=clamp19(t,c.start,Math.max(c.start,c.start+c.duration-1/30));syncMedia(true);renderUI();return;}if(cancel)return;
      if(handle){if(!pendingResize)return;checkpoint();if(pendingResize.side==='right')resizeClip(c,pendingResize.duration,$('resizeMode')?.value||'trim');else trimClip(c,pendingResize.cut,original.duration);if(c.track==='main'&&hasMagnet())compactMain(mainOrder.map(id=>P.clips.find(x=>x.id===id)).filter(Boolean));changed();return;}
      if(!dropValid||!previewTrack){toast('Solte em uma faixa compatível; nada foi alterado.');return;}if(isAudio(c)){const free=resolveAudioTrack23(c,previewTrack,previewStart);if(!free){toast('Essa faixa de áudio já está ocupada nesse trecho.');return;}previewTrack=free;}checkpoint();const oldTrack=c.track;c.start=previewStart;c.track=previewTrack;if(isEffect(c)&&!c.effectTargetTrack)c.effectScope=previewTrack==='effectsLocal'?'main':'all';if(oldTrack==='main'&&c.track!=='main'&&hasMagnet())compactMain(P.clips.filter(x=>x.track==='main').sort((a,b)=>a.start-b.start));if(c.track==='main'&&hasMagnet())placeMain(c,c.start);changed();
    };
    const up=()=>finish(false),cancelFn=()=>finish(true);window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up,{once:true});window.addEventListener('pointercancel',cancelFn,{once:true});
  };

  // Effects created on the main media default to a local effect lane; effects created on overlays default global.
  addEffectLayer=function(id,target,at){
    const def=EFFECTS.find(x=>x[0]===id);if(libExtra.replaceEffect)return act(()=>{libExtra.replaceEffect.preset=id;libExtra.replaceEffect.name=def?.[1]||'Efeito';});
    const c=target&&isVisual(target)?target:null;if(!c)return toast('Solte o efeito sobre um vídeo ou imagem.');const start=at??c.start,duration=c.duration,track=c.track==='main'?'effectsLocal':'effects';act(()=>{const fx=newClip('effect',def?.[1]||'Efeito',null,track,start,duration);fx.preset=id;fx.intensity=id==='wide'?25:70;fx.enabled=true;fx.effectTargetTrack=c.track;fx.effectScope='target';fx.keys=[{t:0,v:pose(),ease:'linear'},{t:duration,v:pose(),ease:'linear'}];P.clips.push(fx);selected=fx.id;t=start;});
  };

  // ---------- Layer-aware effect compositor ----------
  const drawTo19=drawTo,v20Main=document.createElement('canvas'),v20A=document.createElement('canvas'),v20B=document.createElement('canvas');
  function activeFx20(time){return P.clips.filter(c=>c.type==='effect'&&c.enabled!==false&&time>=c.start&&time<c.start+c.duration);}
  function chainFx20(source,list,w,h,time){if(!list.length)return source;if(v20A.width!==w||v20A.height!==h){v20A.width=v20B.width=w;v20A.height=v20B.height=h;}let src=source;for(const fx of list){const dst=src===v20A?v20B:v20A,dg=dst.getContext('2d',{alpha:false});postFx19(dg,src,fx,w,h,time);src=dst;}return src;}
  drawTo=function(g,w,h,time){
    if(total()>0&&time>=total())time=Math.max(0,total()-.00001);const fx=activeFx20(time),local=fx.filter(x=>x.track==='effectsLocal'||x.effectScope==='main'),global=fx.filter(x=>!local.includes(x)).sort((a,b)=>GLOBAL_EFFECT_TRACKS.indexOf(a.track)-GLOBAL_EFFECT_TRACKS.indexOf(b.track));
    if(v20Main.width!==w||v20Main.height!==h){v20Main.width=w;v20Main.height=h;}
    const hidden=[],states=fx.map(x=>x.enabled);for(const x of fx)x.enabled=false;for(const c of P.clips){if(c.type!=='audio'&&c.type!=='effect'&&c.track!=='main'){hidden.push([c,c.start]);c.start=1e9;}}
    try{drawTo19(v20Main.getContext('2d',{alpha:false}),w,h,time);}finally{for(const [c,start] of hidden)c.start=start;fx.forEach((x,i)=>x.enabled=states[i]);}
    let scene=chainFx20(v20Main,local,w,h,time);const composite=v20B===scene?v20A:v20B;if(composite.width!==w||composite.height!==h){composite.width=w;composite.height=h;}const cg=composite.getContext('2d',{alpha:false});cg.setTransform(1,0,0,1,0,0);cg.clearRect(0,0,w,h);cg.drawImage(scene,0,0,w,h);const [pw,ph]=dimensions(),layers=visibleClips(time,false).filter(c=>c.type!=='effect'&&c.track!=='main'&&!['text','subtitle'].includes(c.type)).sort((a,b)=>MEDIA_TRACKS.indexOf(a.track)-MEDIA_TRACKS.indexOf(b.track));cg.save();cg.scale(w/pw,h/ph);for(const c of layers)paintClip(cg,c,time,pw,ph);cg.restore();scene=chainFx20(composite,global,w,h,time);g.save();g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,w,h);g.drawImage(scene,0,0,w,h);g.restore();const texts=visibleClips(time,false).filter(c=>['text','subtitle'].includes(c.type));g.save();g.scale(w/pw,h/ph);for(const c of texts)paintClip(g,c,time,pw,ph);g.restore();
  };

  // ---------- Persistent video thumbnails in timeline ----------
  const thumbBusy20=new Set();
  function applyThumb20(c,url){const el=q(`.clip[data-id="${CSS.escape(c.id)}"]`);if(!el||!url)return;el.classList.add('v18Thumb');el.style.setProperty('--v18-thumb',`url("${url.replace(/"/g,'%22')}")`);}
  async function ensureAssetThumb20(asset){if(!asset||asset.type==='audio')return null;if(asset.thumbData)return asset.thumbData;if(asset.type==='image'){asset.thumbData=asset.data;return asset.thumbData;}if(thumbBusy20.has(asset.id))return null;const el=cache.get(asset.id)?.el;if(!el||el.readyState<2)return null;thumbBusy20.add(asset.id);try{const cv=document.createElement('canvas'),g=cv.getContext('2d');cv.width=160;cv.height=90;g.fillStyle='#101820';g.fillRect(0,0,160,90);const sw=el.videoWidth||asset.width||160,sh=el.videoHeight||asset.height||90,s=Math.max(160/sw,90/sh),dw=sw*s,dh=sh*s;g.drawImage(el,(160-dw)/2,(90-dh)/2,dw,dh);const url=cv.toDataURL('image/webp',.64);asset.thumbData=url;if(native20?.storeAssetThumb&&P.projectId)native20.storeAssetThumb(P.projectId,asset.id,url).catch(()=>{});return url;}catch{return null;}finally{thumbBusy20.delete(asset.id);}}
  function decorateThumbs20(){for(const c of P.clips.filter(isVisual)){const a=P.assets.find(x=>x.id===c.asset);if(!a)continue;if(a.thumbData||a.type==='image')applyThumb20(c,a.thumbData||a.data);else ensureAssetThumb20(a).then(u=>{if(u)for(const clip of P.clips.filter(x=>x.asset===a.id))applyThumb20(clip,u);});}}

  // ---------- Timeline build: invisible trim hit-zones, stable content during drag ----------
  const buildTimeline19=buildTimeline;
  buildTimeline=function(){ensureTrackDom();const r=buildTimeline19();ensureTrackDom();
    for(const c of P.clips){const el=q(`.clip[data-id="${CSS.escape(c.id)}"]`);if(!el)continue;el.querySelectorAll('.handle').forEach(h=>h.remove());el.querySelectorAll('.v21TrimZone').forEach(h=>h.remove());
      if(!c.brand){for(const side of ['left','right']){const h=document.createElement('i');h.className='v21TrimZone '+side;h.dataset.handle=side;h.title=side==='left'?'Arraste a borda para ajustar o início':'Arraste a borda para ajustar o fim';h.setAttribute('aria-label',h.title);el.append(h);}}
      el.onpointerdown=startClipDrag;el.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();showClipMenu(c,e.clientX,e.clientY);};
      if(isKeyframable(c))el.querySelectorAll('.clipKey').forEach((dot,i)=>{dot.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();keyMenu20(c,i,e.clientX,e.clientY);};dot.title='Keyframe '+(i+1)+' · arraste para mover · clique direito para excluir';});
      if(isEffect(c)){c.effectScope=c.track==='effectsLocal'?'main':(c.effectScope||'all');el.dataset.effectScope=c.effectScope;}
    }
    decorateThumbs20();if($('statusText'))$('statusText').textContent='Arraste o corpo para mover · arraste a borda para ajustar · clique direito para opções';return r;
  };

  // ---------- Mouse/touchpad pinch zoom, anchored under cursor ----------
  const timeline20=$('timelineScroll');if(timeline20)timeline20.addEventListener('wheel',e=>{if(!(e.ctrlKey||e.metaKey))return;e.preventDefault();e.stopImmediatePropagation();const r=timeline20.getBoundingClientRect(),localX=clamp19(e.clientX-r.left,0,r.width),anchor=(timeline20.scrollLeft+localX)/Math.max(1,pps),factor=Math.exp(-clamp19(e.deltaY,-160,160)*.0032),next=clamp19(pps*factor,10,600);if(Math.abs(next-pps)<.05)return;pps=next;const z=$('timelineZoom');if(z){z.max='600';z.value=String(pps);}buildTimeline();timeline20.scrollLeft=Math.max(0,anchor*pps-localX);},{capture:true,passive:false});

  // ---------- Durable home thumbnails + rename ----------
  let homeRendering20=false,projectThumbTimer20=null;
  function thumbCapture20(){if(!native20?.saveProjectThumb||!P.projectId||!P.clips.length)return;try{draw();const src=$('preview'),cv=document.createElement('canvas'),g=cv.getContext('2d');cv.width=480;cv.height=270;g.fillStyle='#10171c';g.fillRect(0,0,480,270);const scale=Math.min(440/src.width,230/src.height),dw=src.width*scale,dh=src.height*scale;g.drawImage(src,(480-dw)/2,(270-dh)/2,dw,dh);native20.saveProjectThumb(P.projectId,cv.toDataURL('image/webp',.72)).catch(()=>{});}catch{}}
  function scheduleProjectThumb20(delay=900){clearTimeout(projectThumbTimer20);projectThumbTimer20=setTimeout(thumbCapture20,delay);}
  const changed20Base=changed;changed=function(){P.editorVersion=VERSION;const r=changed20Base();scheduleProjectThumb20();return r;};
  async function openProject20(id){if(window.__toucaImportBusy29)return;try{await window.toucaSaveNow29?.();const raw=await native20.loadSnapshot(id);if(!raw)return;await restoreProject(JSON.parse(raw));P.projectId=id;P.editorVersion=VERSION;$('v18Home')?.classList.add('v18Hidden');setTimeout(()=>{buildTimeline();draw();scheduleProjectThumb20(350);},120);toast('Projeto aberto.');}catch(e){toast('Não foi possível abrir: '+e.message);}}
  async function renderHome20(){if(homeRendering20||!native20?.listProjects)return;homeRendering20=true;try{const home=$('v18Home'),grid=$('v18ProjectGrid');if(!home||!grid)return;const info=home.querySelector('.v18HomeTop p');if(info)info.textContent=`Projetos locais · desktop · ${native20.version||VERSION}`;const list=await native20.listProjects();grid.replaceChildren();if(!list.length){grid.innerHTML='<div class="v18HomeEmpty">Nenhum projeto salvo ainda.</div>';return;}for(const p of list){const card=document.createElement('article');card.className='v18ProjectCard v20ProjectCard';const when=new Date(p.updatedAt).toLocaleString('pt-BR');card.innerHTML=`<div class="v20ProjectThumb">${p.thumbnail?`<img src="${p.thumbnail}" alt="">`:'<span>◇</span>'}</div><div class="v20ProjectMeta"><strong>${esc(p.name||'Projeto')}</strong><small>${esc(when)}</small><small>${p.assetCount||0} mídias · ${p.clipCount||0} clips</small></div><div class="v18ProjectActions"><button data-open>▶ Abrir</button><button data-rename>✎ Renomear</button><button data-delete class="v18CtxDanger">⌫</button></div>`;card.querySelector('[data-open]').onclick=()=>openProject20(p.id);card.querySelector('[data-rename]').onclick=async()=>{const name=prompt('Novo nome do projeto:',p.name||'Projeto');if(!name?.trim())return;await native20.renameProject(p.id,name.trim());await renderHome20();};card.querySelector('[data-delete]').onclick=async()=>{if(confirm('Excluir este projeto local?')){await native20.deleteSnapshot(p.id);await renderHome20();}};grid.append(card);}}catch(e){console.warn(e);}finally{homeRendering20=false;}}
  const refresh20=$('v18RefreshProjects');if(refresh20)refresh20.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();renderHome20();},true);
  const home20=$('v18Home');if(home20)new MutationObserver(()=>{if(!home20.classList.contains('v18Hidden'))setTimeout(renderHome20,40);}).observe(home20,{attributes:true,attributeFilter:['class']});

  // Home must be first every time this app process starts.
  setTimeout(()=>{ensureTrackDom();buildTimeline();if(home20&&!home20.classList.contains('v18Hidden'))renderHome20();},950);

})();
