Touca Editor Desktop v28.0.0 — Turbo Export RC

Base: v27 Definitive RC. Nenhuma versão antiga é restaurada pela aplicação.

Mudança principal:
- Exportação de H.264 MP4/MOV deixa de depender de HTMLVideoElement.currentTime/seeked a cada frame.
- Parser MP4 local indexa as amostras H.264 e um Worker usa WebCodecs VideoDecoder sequencialmente.
- VideoFrame é transferido ao compositor sem PNG/base64.
- H.264 enviado ao processo principal é agrupado antes do IPC.
- Quando FFmpeg desktop não existe, MP4 é escrito em streaming diretamente no disco, sem manter o arquivo final inteiro em RAM.
- Quando FFmpeg desktop existe, a rota FFmpeg da v27 é preservada, agora alimentada pelo decoder sequencial.
- H.265/HEVC, WebM, MP4 fragmentado ou mídia incompatível usam fallback de compatibilidade.

Exportação padrão:
- 1080p
- 30 fps
- 12 Mbps H.264
- opção 60 fps
- AAC 160 kbps quando disponível

A composição visual existente foi preservada para evitar regressões de ANI, TRAN, camadas, efeitos, textos, legendas, logo e keyframes.

Keyframe padrão final:
- permanece um pouco afastado do fim do clip, de forma proporcional (regra herdada da v26/v27), não exatamente 1 segundo antes.

Esta build não deve ser descrita como compositor 100% nativo: a composição final ainda é feita pelo compositor existente. A v28 remove o principal gargalo de seek por frame em H.264 e torna o caminho de saída mais streaming/long-form.
