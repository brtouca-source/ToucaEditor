# Touca Editor 31.6 — Android

Port em desenvolvimento a partir do código PC 31.6 fornecido por ToucaBR. Nenhum APK antigo foi incorporado. Não é uma release final homologada.

## Implementado nesta adaptação

- Mesmo compositor, timeline, ANI/TRAN e formato de projeto da versão PC 31.6.
- Interface touch, biblioteca e ajustes em painéis, alças ampliadas, modo claro/escuro existente.
- WebView com origem HTTPS local, leitura de mídia por streaming e suporte a Range.
- Importação via Storage Access Framework, cópia privada da mídia, snapshots atômicos e backup anterior.
- Renomeação, duplicação, exclusão e miniaturas dos projetos.
- Câmera/microfone com solicitação de permissões ao usar, seletores de arquivo, diálogos JavaScript.
- Chave ElevenLabs criptografada com Android Keystore.
- Escrita incremental de MP4 com publicação no MediaStore somente ao concluir.
- Modelos Whisper 31.6 incluídos e lidos localmente.

## Limitações que impedem declarar paridade total

Exportação utiliza o compositor original e WebCodecs; depende de H.264/AAC disponíveis no WebView/aparelho. Não implementa FFmpeg Windows, geração de proxies nem limpeza nativa de ruído. A mistura de áudio original mantém PCM em RAM, portanto vídeos longos precisam de medição e melhoria antes de distribuição. Mantenha o app em primeiro plano durante renderização. Não há serviço de exportação em segundo plano. Câmera, microfone, codecs, gestos e sincronização exigem QA Android real.

## Build

JDK 17, Android SDK 35 e Gradle 8.9. Execute `python3 tools/restore-models.py` e depois `gradle :app:assembleDebug` ou rode o workflow Android. O artefato é um APK de teste, assinado com chave debug, não uma release comercial. Chaves privadas não pertencem ao repositório. Builds de CI não garantem mesma chave debug entre execuções. Uma chave release estável deve ser configurada para atualizações públicas.

## Origem e testes

Base: ToucaEditor-Next-31.6-Windows-x64-Seguro.zip. Os testes desktop são mantidos em `app/src/main/assets/touca-app/tests`; não equivalem a testes Android. O check estrutural também verifica que a ponte carrega antes do núcleo e a interface mobile após a interface Next.
