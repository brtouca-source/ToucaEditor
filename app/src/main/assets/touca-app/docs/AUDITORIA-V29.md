# Touca Editor 29 — auditoria e intervenção de estabilidade

Data: 19/09/2026. Base: **ToucaEditor-v28-Turbo-Source(1).zip**. A v17 foi
inventariada para comparação; nenhum trecho dela substituiu o editor atual.
Esta entrega é uma atualização de estabilidade, não a implementação integral
da arquitetura definitiva descrita no prompt mestre.

## 1. Arquitetura encontrada

Electron: main.js (processo principal), preload.js (IPC isolado), index.html
(interface + modelos Whisper embarcados + motor legado). v18–v28 complementam
e substituem funções globais. A composição ainda é Canvas; parte do efeito de
lente usa WebGL. H.264 usa WebCodecs. FFmpeg, quando instalado, faz áudio/mux;
sem ele, mp4-muxer escreve no disco através de IPC. O EXE recebido é um binário
Windows e não foi executado neste ambiente Linux.

## 2. Inventário e responsabilidade

| Arquivo | Sistema |
|---|---|
| index.html | Timeline original, preview, gestos, câmera, temas, ElevenLabs, Whisper, muxer |
| v18.js / css | Projetos, visual desktop, ajustes e texto |
| v21.js / css | Camadas, drag/trim, catálogo ANI/TRAN/efeitos, texto, seleção |
| v22.js | Legendas com roteiro e alinhamento |
| v23.js / css | Sons de presets, efeito conectado, composição por camada |
| v24.js / css | Exportação H.264 para FFmpeg e persistência de duração |
| v25.js / css | Refinamentos de interface |
| v26.js / css | Importação nativa, proxy, snapshots, áudio e keyframes |
| v27.js / css | Consolidação e limpeza DSP de áudio |
| v28.js | Decoder sequencial e saída MP4 em streaming |
| v28-mp4.js | Leitura MP4 em blocos e tabelas AVC |
| v28-decoder-worker.js | Worker de decodificação |
| main.js / preload.js | Arquivos, projetos, processos FFmpeg e IPC |
| engine/audio.js / process.js, v29.js / css | Correções isoladas desta entrega |

## 3. Falhas confirmadas e corrigidas

- `VideoDecoder.flush()` ocorria a cada lote de 18 amostras. Após flush, um
  novo quadro-chave é exigido; a continuidade com delta podia falhar. Agora
  só há flush no fim do fluxo, com espera pela fila entre lotes.
- Os quadros eram indexados por asset e havia proibição de vídeos simultâneos
  usando a mesma mídia. Agora são indexados por clipe; transições incluem
  ambos os lados e não dependem apenas dos stills de borda.
- O cache de fontes permanecia vivo após reset. Reset/close liberam fontes
  sem sessão ativa e fecham os frames.
- FFmpeg era considerado acelerado só pela presença do nome em `-encoders`.
  Agora cada candidato codifica três frames de teste; erros são registrados.
- `amix` normalizava o volume por padrão e `alimiter` aplicava ganho de saída
  automático. Agora o volume do editor é respeitado, com proteção de pico
  sem essa normalização e compensação de latência.
- Atrasos eram arredondados em milissegundos. Agora os clipes compartilham
  relógio de 48 kHz, com posições em amostras e duração final explícita.
- Cortes contíguos da mesma fonte não recebem rampas automáticas repetidas.
- O código recusava apagar o último keyframe. Agora guarda uma pose estática
  interna, sem losango e sem restaurar endpoints ao adicionar outro keyframe.
- ANI arrastado não destacava a mídia e criava um elemento flutuante. Agora
  mantém o botão na origem, destaca o destino e cancela sem aplicar nada.
- ANI tinha estado apenas no objeto legado `animation`. Agora os campos
  `animationIn` e `animationOut` são serializados, com adaptador para a UI.
- O alinhamento dito “em banda” alocava a matriz completa N×M. Agora aloca
  só a banda para traceback e duas linhas de pontuação.
- Escrita direta ganhou limite de fila e remoção de temporários incompletos;
  substituição do arquivo final não apaga a versão anterior antecipadamente.

## 4. Dívida técnica remanescente

As substituições globais acumuladas ainda existem. Removê-las sem testes
visuais completos seria arriscado. `index.html` inclui cerca de 73 MB de
código/modelos codificados. O alinhamento agora usa menos memória, mas ainda
roda na thread da interface. Os históricos usam snapshots menores, não um
sistema completo de comandos/deltas. Modelos e licenças originais preservados.

## 5. Gargalos e limites

A composição usa várias superfícies Canvas e cópias entre camadas. Vídeos
incompatíveis com o parser AVC usam a rota de seek. MP4 com edit lists
complexas, rotação de track e codecs distintos ainda exige validação dedicada.
Sem FFmpeg, o fallback de áudio pode montar buffers completos em RAM; não
é apropriado prometer 120 minutos nesse caminho. No FFmpeg, muitos inputs
simultâneos também precisam de controle de recursos em uma futura etapa.

## 6. Recursos preservados

Identidade azul/cinza/laranja, temas, câmera, waveform, textos/Bangers,
legendas e modo roteiro, logo especial, faixas numeradas, presets/sons,
wide-angle/blur/vignette, importação nativa, projetos, backups, proxy e
ElevenLabs. Não foi feita geração de áudio paga nem inserção de chave.
Preservado significa mantido no código: não equivale a todos terem sido
homologados visualmente no Windows nesta sessão.

## 7. Plano de migração nativa

Migrar em etapas: esquema de projeto independente → comandos de composição
→ decodificação nativa com cache LRU → composição GPU → encode/mux em processo
isolado. Usar o compositor atual como referência visual em testes golden.
Só mudar a rota padrão após equivalência de ANI/TRAN/texto/lente/cores.
Esta migração completa **não foi implementada** nesta entrega.

## 8. Exportação nesta versão

Mantém 1080p, 30 fps, H.264 a 12 Mbps e AAC a 160 kbps; 720p/60 fps existentes
preservados. Filas têm pressão de retorno; os dados finais vão para disco.
FFmpeg continua um processo separado, mas o compositor não foi movido para
um backend nativo. Cancelamento preserva arquivo anterior e remove parcial.

## 9. Projetos longos

Melhorias: cache liberado, fila de escrita limitada, matriz de roteiro
reduzida, áudio nativo sem buffer completo no renderer quando disponível.
Pendências: compositor separado, cache global de orçamento fixo, streaming de
áudio no fallback e validação dos quatro benchmarks completos do prompt.

## 10. Hardware

Referência informada: Ryzen 7 5700G, 16 GB RAM, Radeon integrada, Windows 11.
A parcela de 496 MB dedicada não limita sozinha a memória gráfica compartilhada.
Não se assume AMF funcional por causa do nome da GPU: o programa testa o encoder
real. O diagnóstico inclui CPU, memória total/livre e opções de codec testadas.
O diagnóstico do ambiente Linux identificou libx264 funcional e rejeitou NVENC
/QSV sem os respectivos dispositivos. Isso não é resultado do PC do usuário.

## 11. Áudio

Correções de clock, mixagem e continuidade foram executadas com FFmpeg real.
Isso resolve causas reproduzidas; um áudio já corrompido ou outro problema de
decoder não pode ser declarado resolvido sem testar o arquivo original.
A limpeza existente permanece DSP (`anlmdn`/`afftdn` ou fallback). RNNoise/
DeepFilterNet e seu modelo/licença não foram incluídos nem simulados.

## 12. UX

Mudanças pontuais: feedback do ANI, keyframes removíveis e estado persistente
de entrada/saída. Nenhum redesign geral. A câmera 9:16 existente foi preservada;
acesso a hardware e importação da gravação requerem validação no dispositivo.

## 13. Persistência e recuperação

Atualizador com manifesto SHA-256, staging, backup da aplicação e rollback
em falha de instalação. Não apaga backups nem projetos. Os arquivos de projeto
continuam locais, com o esquema anterior compatível e os campos adicionais.
Abrir projetos antigos continua suportado; voltar a uma versão antiga pode
não reconhecer os novos campos de animação. Preserve o backup.

## 14. Distribuição

ZIP de atualização para uma instalação existente; não um novo instalador
Electron autossuficiente. Não foi possível obter/compilar um pacote Windows
FFmpeg verificado neste ambiente. Nenhum binário FFmpeg é redistribuído.
Não há assinatura digital ou certificado inventado. O source completo está
incluído; ASAR/minificação não substituem assinatura nem protegem segredos.

## 15. QA

Ver VALIDACAO.md e testes executáveis em tests/. Foram testados áudio real,
MP4/AAC/faststart, cancelamento, decoder simulado rigoroso e estado JS.
Sem Electron/Chromium instalado no ambiente, não houve teste de interface
real ou câmera. Não foram executados benchmarks completos 10/30/60/120 min.

## 16. Critérios antes de chamar “definitiva”

Executar no Windows os quatro projetos do prompt, comparar preview/export
quadro a quadro, medir RSS/VRAM e tempo total, testar AMF no 5700G, conferir
áudio narrado, fontes, câmera, restauração e disco cheio. Concluir compositor
nativo e denoise IA real. Esta atualização não afirma satisfazer esses gates.

## Referências técnicas consultadas

- [WebCodecs — especificação](https://w3c.github.io/webcodecs/#dom-videodecoder-flush):
  flush e requisito de keyframe; filas e recursos de frames.
- [FFmpeg — filtros](https://ffmpeg.org/ffmpeg-filters.html#amix): normalize,
  timestamps e mixagem; [alimiter](https://ffmpeg.org/ffmpeg-filters.html#alimiter).
- [Electron — desempenho](https://www.electronjs.org/docs/latest/tutorial/performance):
  evitar bloquear a interface e o processo principal.
- [FFmpeg — distribuição](https://ffmpeg.org/legal.html): condições de licença
  do binário variam com sua configuração de build.

## Correção adicional: importação que retornava ao Início

O listener de `focus` da v21 abria a home enquanto a timeline ainda estava
vazia. A janela nativa de seleção de arquivos devolve foco antes de os clipes
serem inseridos. Foram removidos esse listener e os atrasos que forçavam a
home depois de o usuário já começar a editar.

A importação agora aguarda a gravação; a navegação para outro projeto também
aguarda. O autosave captura o objeto e ID do projeto antes dos awaits, verifica
a existência das mídias e não remove os dados do snapshot após uma falha de
armazenamento. O fechamento do Electron espera um reconhecimento após salvar;
se houver erro de disco/importação em andamento, o editor permanece aberto.

Testes adicionais simulam troca de projeto durante um salvamento e falha de
escrita de mídia. Não houve salvamento de referências vazias nesses cenários.
