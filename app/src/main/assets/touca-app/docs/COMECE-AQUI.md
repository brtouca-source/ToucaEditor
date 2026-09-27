# Touca Editor 30.1 — mapa de manutenção

O editor mantém os recursos da v30. Esta atualização atua no ciclo de salvamento e na geometria visual da timeline. Não muda áudio, codec, exportação, legendas, ElevenLabs, câmera ou modelos de IA.

| Precisa alterar | Comece por | Relação com outros arquivos |
|---|---|---|
| Projeto vazio, disco e autosave | `shared/project-policy.js`, `main.js`, `renderer/legacy/v18.js` | `touca:save-snapshot`; `nativeAutosave` |
| Barra desaparece, clique, drag/trim | `renderer/legacy/v26.js` | `startClipDrag`, `cleanup`, `finish` |
| Espaço visual, tamanho da barra | `renderer/timeline/geometry.js` | Puro: não escreve `start` ou `duration` |
| Rebuild da timeline durante gesto | `renderer/timeline/stability.js` | Último wrapper; mantém o DOM durante drag |
| Aparência das alças | `styles/timeline-stability.css` | Afeta somente `.track .clip` |
| Estado original/preview | `renderer/core/editor.js` | Globais `P`, `t`, `pps`, `drawTo`, `buildTimeline` |
| Câmera mobile | `renderer/camera/` | Integrações v13/v14; controlador adicional no core |
| Desktop e IPC | `main.js`, `preload.js`, `renderer/desktop/` | Não mudar nomes/canais sem atualizar as duas pontas |
| Legendas e roteiro | `renderer/legacy/v22.js` | `alignScript22`; reconhecimento no core |
| Importar projeto editado | `engine/project-compiler.js`, `engine/project-package.js` | UI em `renderer/legacy/v30.js` |
| Áudio/exportação | `engine/audio.js`, `engine/process.js`, `renderer/legacy/v24.js` e `v28.js` | Evitar alterações para corrigir defeitos apenas visuais |
| Decodificação MP4 | `workers/` | `v28.js` inicia o worker; parser fica ao lado dele |
| Temas/fontes | `styles/core/`, `styles/legacy/` | A ordem dos links em `index.html` é relevante |
| Licenças recebidas | `licenses/` | Cópias dos avisos existentes, não uma auditoria jurídica |
| Histórico anterior | `docs/archive/`, `docs/AUDITORIA-V29.md` | Referência histórica; não são instruções da versão atual |

## Ordem de execução

`geometry.js` → `core/editor.js` → câmera v13/v14 → comportamento desktop → extensões v18, v21…v30 → `timeline/stability.js`.

São scripts clássicos e compartilham funções globais. A ordem foi preservada. Não trocar por `type=module`, não adicionar `async` e não mover funções globais para IIFEs sem migrar seus consumidores. Os módulos legados foram classificados em pastas, mas não reescritos integralmente: isso preserva o comportamento existente.

`index.html` carrega scripts clássicos; modelos Whisper estão em `resources/models/whisper-tiny`, carregados sob demanda pelo IPC `native/resources.js`. Interface Next: `ui/desktop.js` (menus/painéis/atalhos) e `ui/tokens.css` (tema/layout). Seletor de keyframes próximos: `renderer/timeline/stability.js`.

## Rotina curta

1. Identifique a área na tabela.
2. Reproduza com um projeto mínimo. Não use a biblioteca pessoal como teste.
3. Corrija a função proprietária; evite adicionar outro override genérico.
4. Em `app/`: `npm run check` e `npm test` (testes de exportação exigem FFmpeg/ffprobe; pacote exige Python).
5. Valide no Windows os gestos ou dispositivos envolvidos.
6. Refaça `manifest-sha256.json` com `python app/tools/package-update.py` na pasta superior.
7. Distribua somente o ZIP final. O atualizador preserva o app anterior e os projetos.

## Formato dos dados

`P.assets`: mídias. `P.clips`: edição com `start`, `duration`, `offset`, `track`, `keys`. Tempos estão em segundos. `pps` é somente pixels por segundo na interface. Projetos ficam em Documentos/Touca Editor/Projects; cada um possui snapshot comprimido e mídias locais. Ver `PROJETOS-PRE-EDITADOS.md` para importação portátil.


## Cenas / presets (31.4)
- `project/scenes.js`: parser de ◆, ordenação natural e validação de divisões.
- `renderer/scenes/editor.js`: sincronização, revisão, seleção múltipla de imagens/vídeos e aplicação atômica do lote.
- `project/event-sounds.js`: deriva eventos de áudio a partir das animações/transições; prioridade do som da transição.
- `renderer/sounds/presets.js`: padrões locais, som por preset, painel de lote e reconciliação de clips `eventBinding`.
- `resources/sounds/`: WAVs locais; proveniência e licença no README. `tools/build-scene-sounds.py` reproduz a síntese e conversão (para Kenney exige o pack CC0 extraído em /tmp/touca-kenney).
- `c.animation.in/out.enabled` controla animação sem apagar. `c.motionDisabled` mantém os keyframes mas congela a pose inicial na pintura. `soundAsset/soundVolume` referencia o áudio; `eventBinding` do clip sonoro identifica o dono. Campos persistem nos snapshots existentes.
- Pontos de integração: `changed` no core e rebuild estável reconciliam eventos; o compositor v21 respeita enabled/motionDisabled; aplicação de presets v21 e menu v23 chamam o módulo único. Não adicionar outro scheduler de som em tempo real para esses eventos.


## 31.6
Sons embutidos e gerador removidos. `renderer/sounds/presets.js` agora oferece só arquivo personalizado/sem som. `renderer/transitions/motion.js` é o render de movimento WebGL, chamado pelo compositor v30 após controle de intensidade, com fallback Canvas. `transitionAt` no core lê a duração real do projeto. Reset visual no inspector v21; seleção dinâmica de animações no módulo presets.

## 31.6
A versão 31.6 inicia na tela de projetos, mantém os keyframes finais precisos, oferece a opção Nenhum para animações/transições e grava voz local pelo microfone. Use `npm run check` e `npm test` antes de distribuir.
