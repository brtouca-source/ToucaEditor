TOUCA EDITOR DESKTOP v24.0.0
============================

Base: Touca Editor Desktop v23, mantendo os recursos existentes.

ALTERAÇÕES DESTA VERSÃO
- Corrige o ghost de arraste que ficava esticado verticalmente: a cópia visual preserva a largura/altura exatas do item original.
- Corrige a duração de ANI/TRAN: o slider grava diretamente no preset aplicado ao conteúdo/corte selecionado e não reaplica o valor padrão ao soltar.
- Exportação padrão: 1080p, H.264, 30 fps, alvo de 12 Mbps.
- Opção explícita de 60 fps no diálogo de exportação. 720p usa alvo de 5 Mbps.
- Novo caminho de exportação Desktop: H.264 por WebCodecs com preferência por hardware + FFmpeg nativo para AAC, mux MP4, faststart e gravação direta em disco.
- Se o FFmpeg nativo não estiver disponível, o exportador compatível anterior permanece como fallback.

MOTOR NATIVO
O atualizador v24 instala, uma única vez, um build Windows x64 LGPL do FFmpeg 8.1 (BtbN FFmpeg-Builds), verificando o SHA-256 do pacote antes de extrair ffmpeg.exe.
Pacote verificado:
ffmpeg-n8.1.2-54-gc573a95381-win64-lgpl-8.1.zip
SHA-256: 0faff8c6e2cbe2dc84cdc76bf2e00e9e6dcd90cbaf5f57ec38c5d86a14c9831b

OBSERVAÇÃO DE ARQUITETURA
O Touca Editor continua sendo um aplicativo Desktop Electron, não um navegador/site. A composição visual continua usando o motor local do editor/Chromium e WebCodecs; a v24 move áudio, mux MP4 e gravação final para o processo nativo FFmpeg. Isso reduz trabalho no renderer e evita montar o MP4 final inteiro no JavaScript.

PROJETOS
Projetos e mídias locais continuam fora dos arquivos da aplicação e não são apagados pelo atualizador.
