Touca Editor Desktop v27.0.0 — Definitive RC

Baseada diretamente na v26 RC / v25 atual, sem regressão deliberada para interfaces antigas.

Consolidação principal:
- projetos persistentes em Documentos/Touca Editor/Projects, com migração segura do armazenamento anterior;
- schema de projeto v3 e compatibilidade/migração de projetos anteriores;
- importação nativa e mídia persistente em disco;
- proxies de preview quando FFmpeg desktop estiver disponível, com fallback de encoder;
- preview adaptativo para projetos longos;
- áudio em streaming/mixagem nativa quando FFmpeg estiver disponível;
- redução de ruído local não destrutiva com anlmdn/FFT fallback;
- timeline/camadas/drag/resize/ANI/TRAN/keyframes preservados da base aprovada;
- keyframe padrão final fica dinamicamente um pouco afastado do limite final;
- exportação padrão 1080p H.264, 30 fps, 12 Mbps; opção 60 fps;
- tela inicial, thumbnails, renomear/duplicar, autosave e backups preservados.

O instalador completo inclui o runtime Desktop. Não é necessário instalar v17/v25/v26 antes.
Se um FFmpeg desktop compatível estiver presente em resources/native-tools ou PATH, o editor usa proxy, áudio/mux e limpeza nativos automaticamente; sem ele, mantém o modo de compatibilidade WebCodecs.

Esta build é candidata definitiva para validação real de release no Windows.
