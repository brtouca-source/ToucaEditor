# Validação da atualização 29

Ambiente: Linux x64, Node.js e FFmpeg 6.1.1. Não é o Ryzen/Windows do usuário.

Comando reproduzível, a partir da pasta app: `node --test tests/*.test.js`.
Os testes nativos requerem FFmpeg e ffprobe disponíveis no PATH; os demais
não requerem dependências npm.

| Verificação | Resultado |
|---|---|
| Relógio 48 kHz / atraso por amostras | Passou |
| Ganho estável quando outra faixa termina | Passou com FFmpeg real |
| Continuidade de áudio no ponto de corte | Passou com FFmpeg real |
| Decoder com exigência de keyframe após flush | Passou, 120 quadros simulados |
| MP4 de 14 s, 30 fps | Passou: 420 quadros completos |
| Codec de áudio / duração | AAC; diferença dentro de 30 ms |
| Silêncio inesperado no miolo do áudio exportado | Nenhuma lacuna de 1 ms ou mais no sinal de teste |
| MP4 faststart | moov antes de mdat |
| Arquivo de teste 14 s a 12 Mbps | Menor que 25 MiB |
| Cancelamento sobre arquivo já existente | Arquivo anterior preservado byte a byte |
| Exclusão dos dois keyframes padrão | Passou, pose estática preservada |
| Primeira ANI e substituição de entrada/saída | Passou |
| Animações após serialização JSON | Passou |
| Mesma mídia em clipes/offsets diferentes | Passou no teste do renderer isolado |
| Transição usando frames por clipe | Passou no teste do renderer isolado |
| Roteiro com nomes/pontuação | Passou |
| Roteiro de 3.000 palavras | Passou; memória da matriz em banda |
| Troca de projeto durante await de salvamento | ID e conteúdo corretos |
| Falha ao armazenar mídia | Snapshot inválido não gravado |

O teste de MP4 usa fonte sintética 360×640 para testar o caminho de saída,
clock, mux e cancelamento com rapidez. **Não mede a composição 1080p completa,
a GPU AMD ou o desempenho real de um projeto do usuário.**

Teste sintático abrange todos os módulos JS e scripts executáveis inline.
Os modelos/binários base64 embutidos não são tratados como código JS.

Não verificado neste ambiente: interface Electron em Windows, arraste real,
câmera física, AMF no 5700G, fontes renderizadas e áudio narrado original com
defeito. Os testes de estado/decoder usam mocks estritos, não são testes de
interface. Benchmarks completos de 1/10/30/60/120 minutos ainda não executados.

Não se afirma eliminação universal de estalos ou paridade de velocidade com
CapCut. Corrigiram-se causas concretas e foram validados os caminhos descritos.
