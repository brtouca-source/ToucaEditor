# Arquitetura Android do Touca Editor 31.6.2

A versão Android reutiliza o projeto e o comportamento funcional do Touca Editor 31.6, mas trata Android como plataforma própria em vez de apenas reduzir o layout do desktop.

## Camadas

- `android/bridge.js`: contrato JS ↔ Kotlin, armazenamento, MediaStore, credenciais e escrita binária.
- `android/mobile.js`: shell de toque, navegação e viewport. Não altera motor de edição.
- `android/performance.js`: qualidade adaptativa da prévia, liberação de mídia e atualização incremental da timeline.
- `android/export.js`: detecção de codec, autosave antes da exportação, streaming e cancelamento.
- `android/bootstrap.js`: registra os módulos. Não contém lógica de edição.

O estado do projeto continua sendo `P`. DOM/canvas são projeções visuais e não armazenamento do projeto.

## Regras mobile

1. Preservar os gestos 31.6 (pinch, escala, rotação e keyframes); otimizações não podem substituí-los.
2. Prévia pode reduzir resolução dinamicamente; exportação nunca usa a resolução reduzida da prévia.
3. Timeline não é reconstruída a cada pointermove; durante drag só posições/larguras existentes são atualizadas.
4. Ao trocar de projeto, elementos de mídia não usados são pausados, desconectados e liberados.
5. Exportação salva o projeto antes de iniciar, escreve direto no MediaStore, é cancelável e remove arquivo parcial.
6. A tela só fica acordada durante exportação.
7. Sem botão de recurso não implementado.

## Exportação

Ordem de preferência:
1. MediaRecorder MP4 em streaming.
2. WebCodecs H.264/AAC + MP4 muxer existente.
3. MediaRecorder WebM como fallback.

A ponte binária AndroidX WebKit é preferida. Base64 permanece apenas como fallback.

## Performance

A prévia usa níveis adaptativos por memória e custo de frame. Android pode sinalizar pressão de memória via `onTrimMemory`, reduzindo a qualidade e liberando mídias fora do projeto atual.

Nenhuma otimização pode alterar Project State, timing, keyframes, ANI, TRAN ou o resultado da exportação.
