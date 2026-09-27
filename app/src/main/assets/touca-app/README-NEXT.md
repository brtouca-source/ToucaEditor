# Touca Editor Next 31.6 — Windows x64

Build completa baseada no 30.1. Não depende de instalação anterior. Electron e FFmpeg originais preservados. Execute Touca Editor.exe, ou use o instalador completo. Projetos continuam em Documentos/Touca Editor/Projects. O instalador usa pasta própria e não substitui a instalação 30.1.

## Alterações desta build
- Interface desktop cinza/laranja; dark/light/system persistentes; cores por tipo de clip; painéis redimensionáveis com duplo clique para restaurar.
- Biblioteca e inspector visíveis; busca local de mídia; paleta de comandos; Ctrl+B/C/V/D/S, K e S; Ctrl+roda amplia timeline no cursor.
- Whisper e fontes em recursos externos: o HTML não carrega pesos na abertura. Transcrição local mantém os modelos recebidos.
- Credencial ElevenLabs migrada ao safeStorage/DPAPI do Windows, fora do projeto. Não aceita fallback sem criptografia.
- Transações de projeto isoladas em native/project-store.js; regras de compatibilidade de tracks em project/timeline-model.js.
- Exportação nativa, áudio e composição originais mantidos para reduzir regressões.

## Escopo e limites reais
Esta é uma build completa do aplicativo com migração incremental; NÃO conclui todo o plano de 115 seções. A cadeia de compatibilidade renderer/legacy e o compositor Canvas ainda existem. Migração total React/Rust/GPU, composições aninhadas, máscaras avançadas e novas bibliotecas premium não foram implementadas. Nenhum botão simula essas funções.

## Validação
33 testes automatizados passaram: importação, persistência, reabertura, projeto antigo, áudio contínuo, cancelamento, keyframes, legendas, compatibilidade de tracks, recursos Whisper e credenciais. Backend FFmpeg testado em Linux com H.264/AAC 1080×1920 em 30 e 60fps (2s), além de vídeo 14s e cancelamento. Isso não substitui QA do encoder/GPU no Windows.
Interface testada em Chromium: startup, importar imagem, split/undo, troca de tema, redimensionamento, comandos e arraste real de imagem para outra camada sem mudar seu tipo. Corrigida a ordenação de faixas adicionais que apareciam antes da faixa principal. Dispositivos Windows/câmera, GPU AMD, transcrição real e API paga ElevenLabs não foram executados neste ambiente. Instalador compilado, mas não executado em Windows. Não há certificado de assinatura fornecido: Windows pode exibir editor desconhecido.

## Desenvolvimento
Em resources/app: npm run check; npm test. Para executar em desenvolvimento, use Electron compatível com a distribuição original. Os recursos binários locais são necessários. Não trocar o carregamento clássico por type=module sem migrar as dependências.

## Mapa curto
ui/: interface desktop e tokens. native/: recursos, credencial e transações de projetos. project/: regras do modelo de timeline. engine/: áudio, processos FFmpeg e importador .touca. renderer/: motor visual e compatibilidade 30.1. resources/: modelos e fontes. tests/: regressões. tools/next-installer.nsi: instalação por usuário.

O schema 3 é preservado: não há conversão destrutiva. Snapshot recebe backup antes de ser substituído. IDs e estrutura dos projetos antigos permanecem compatíveis.

## 31.1 — interface compacta
- Ferramentas agrupadas em Adicionar; tema/projeto/ajuda no menu superior.
- Ajustes recolhíveis, miniaturas restauradas e área central ampliada.
- Cabeçalhos identificados por faixa, visibilidade e alturas sincronizadas.
- Keyframes próximos reunidos num seletor sem mudar tempos ou curvas.
- Botão separado de microfone oculto; câmera mantida.
- Pipeline de exportação, áudio, arquivos de projeto e modelos preservados.

Validação: Chromium com importação de imagem, temas, popovers, painel, cabeçalhos e seleção de keyframes; testes Node/FFmpeg. Instalador compilado, não executado em Windows neste ambiente.

## 31.2 — timeline e presets
- 12 transições e 12 animações no catálogo. Presets antigos continuam renderizando em projetos existentes.
- Duração em segundos e intensidade em porcentagem em controles separados, fora dos cartões.
- Intensidade de animação interpola com a pose original; intensidade de transição interpola com dissolução.
- Botões de transição em espaços exclusivamente visuais, sem alterar a duração dos clips. Em zoom distante/clips curtos usam área acima da mídia.
- Faixas compatíveis vazias aparecem durante o arraste, com rolagem automática. Tipos de mídia preservados.
- Faixa explícita de miniaturas no interior dos clips, independente da cor de seleção.
- Validado em Chromium: ida e volta main/overlay, 8px livres ao redor da transição, mouse/teclado nos controles, catálogo e miniaturas.

## 31.3 — Decupagem por roteiro
1. Narração: cole o roteiro e use ◆ Marcar cena antes de cada nova cena.
2. Gere uma voz e clique Usar áudio. Com múltiplas cenas, o Whisper local inicia o alinhamento. Não há segunda geração de voz.
3. Revise os tempos localizados. Pontos incertos ficam sem tempo: ouça o trecho e informe o início antes de aplicar.
4. Escolha a faixa livre e crie as cenas. Nenhum conteúdo existente é sobrescrito sem a opção explícita de substituição.
5. + Mídia em cada cena preenche individualmente. Preencher usa a seleção; + Adicionar > Preencher todas as cenas abre o lote completo.
6. Confira a ordem natural dos arquivos e ajuste com setas antes de aplicar. PNG/JPEG/WebP/GIF/BMP/AVIF/SVG e demais imagens dependem da decodificação disponível no Chromium; formatos incompatíveis são recusados.
7. Arraste os marcadores roxos na régua para ajustar as divisões. A voz não é cortada.

Áudio existente: ◆ Cenas abre a escolha da narração e do roteiro marcado.
Os metadados estão em scenePlan (narração), sceneSource/sceneIndex/sceneText/placeholder (cenas) e sceneDraft (rascunho). Recursos não dependem de servidor novo.
Arquivo project/scenes.js: parsing/ordenação/validação pura. renderer/scenes/editor.js: interface, revisão, lote e marcadores. Integrações mínimas no core, v22, v28 e stability.
Validação: testes unitários, fluxo Chromium com voz e timestamps simulados (sem cobrança real ElevenLabs), revisão, preenchimento, preservação de keyframes, desfazer/refazer, serialização/reabertura e deslocamento das divisórias. Não foram realizados teste de qualidade de reconhecimento com narração humana, chamada ElevenLabs paga ou execução Windows nesta sessão.


## 31.4 — Cenas em lote e sons locais

- Clique em **Preencher** ou **+ Mídia** em uma cena e escolha várias imagens/vídeos. A partir de uma cena, o lote usa as próximas divisões da mesma narração. A janela mostra as cenas selecionadas, ordem numérica natural, arquivos excedentes e setas para reordenar.
- Vídeo menor que a cena é recusado antes de modificar o projeto. Formatos dependem dos codecs do Chromium; imagens/filmes incompatíveis mostram erro, sem aplicar parcialmente o lote.
- Em **Revisar divisões > Animação, transição e som**, escolha o estilo antes de criar as barras. **Padrão das cenas** salva escolhas para novas divisões ou aplica aos selecionados/todas as cenas. O padrão salvo não modifica cenas existentes automaticamente.
- Entrada/saída e transições usam 0,4 s (reduzido em cenas curtas); a duração total e a narração não mudam. Transições atuam entre cenas contíguas na faixa principal; animações funcionam também nas camadas.
- Segure ou clique com botão direito no preset ANI/TRAN para ouvir, escolher um arquivo local, salvar padrão de som/volume ou remover. O botão **♪ Som** também abre esse painel para o preset aplicado. Sons personalizados usam o armazenamento local desktop existente, sem API e sem depender do arquivo original.
- Desativar animações preserva configurações e retira seu som vinculado; reativar restaura. Remover transições retira o som da passagem. Operações na timeline podem ser desfeitas. Padrões pessoais salvos são preferências e não entram no histórico de desfazer do projeto.
- Cada evento sonoro acompanha seu dono ao mover/recortar; ao excluir o dono o evento é removido. A transição tem prioridade sobre os sons de entrada/saída da mesma passagem, inclusive quando escolhida sem som.
- Pacote de oito sons mono WAV 48 kHz: click/pop de Kenney CC0; flash/whoosh/swish/shine/glitch/impact sintetizados originalmente. Fontes e permissões em resources/sounds/README.txt e licenses/Kenney-interface-sounds.txt. Não são réplicas de áudios virais identificados.
- Pipeline de exportação preservado: sons entram como clips locais na mixagem de áudio existente, com rampas curtas nas bordas.

Validação: check de sintaxe/recursos; 42 testes automatizados; Chromium com geração ElevenLabs e timestamps de reconhecimento simulados, preenchimento em lote, seleção múltipla real no picker, ordenação, undo/redo, persistência, arraste de marcador, sons vinculados, padrão de arquivo personalizado e vídeo curto recusado. Não houve cobrança de API nem execução do aplicativo no Windows nesta sessão.


## 31.6 — Correções de duração, controles e passagem visual
- Sons prontos removidos do aplicativo. Mantido somente adicionar/ouvir/salvar seu arquivo personalizado. Preferências antigas de sons embutidos não são aplicadas a novos eventos; sons já gravados em projetos existentes são preservados.
- Padrão de novas animações/transições: 0,10 s, alterável no slider Duração. Tempos já escolhidos em projetos existentes não são sobrescritos. Corrigido o compositor que ainda calculava certas passagens com 0,4 s fixos apesar do slider.
- Desativar/reativar resolve o ID do clip no projeto atual (inclusive após desfazer/restaurar) e informa o estado. O render desativado foi comparado pixel a pixel com a mídia sem animação.
- Redefinir ajustes zera tanto o modelo quanto os sliders/valores visíveis. O menu do clip fecha os painéis concorrentes para não ficar encoberto.
- Movimentos horizontais/verticais, zoom e giro possuem deformação UV e amostragem direcional num contexto WebGL reutilizado; pontas exatas, mistura suave e bordas refletidas. Sem WebGL há dissolvência simples. Animações de movimento recebem deformação 2D leve e zoom de entrada menos abrupto.
- 0,10 s equivale a 3 frames em 30 fps ou 6 em 60 fps; o usuário pode alongar para uma passagem mais perceptível.
- Motor de exportação e áudio não foram substituídos. Não há garantia universal de ausência de travamentos: desempenho depende da GPU/driver, resolução e arquivos. Windows e GPU física do usuário não executados nesta sessão.

## 31.6 — fluxo inicial, keyframes e voz local
- A tela inicial aparece antes do editor e projetos vazios não são criados automaticamente.
- Keyframe final automático acompanha o último frame real do clipe, respeitando FPS e preservando ajustes manuais.
- Animações e transições usam **Nenhum** para remover o movimento sem apagar outras configurações; duração padrão de 0,30 s.
- Incluída gravação de voz pelo microfone do computador, com pausa, retomada, medidor e uso direto na timeline.
- O texto de voz usa nomenclatura neutra e recomenda voz própria e revisão humana.
