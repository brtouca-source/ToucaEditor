# Touca Editor 30 — projetos pré-editados

## Uso
1. Atualize o aplicativo existente com Atualizar.cmd, mantendo o editor fechado.
2. No Início ou no botão +, clique em **Projeto pré-editado**.
3. Selecione **Demonstracao.touca**, incluído em app/examples, para conferir a montagem. O áudio é um tom suave de teste, não uma narração.
4. Para seu material, importe um ZIP/.touca com project.json e mídia, ou selecione project.json dentro da pasta que contém as mídias.
5. Revise os clips na timeline. Transformação, palavras, áudio, keyframes e transições continuam editáveis. O salvamento local é automático.

O pacote deve conter um único project.json. A IA externa precisa entregar as decisões narrativas e as coordenadas dos painéis. O editor não identifica sozinho personagens, balões ou acontecimentos nesta versão. Não envia material nem realiza chamadas de IA/API.

## Contrato versão 1
O exemplo completo está em examples/hq-demo/project.json. Um .touca pré-editado é um ZIP, identificado pela assinatura do arquivo; o botão normal de abrir projetos antigos continua separado.

Campos raiz:
- format: "touca-project"; version: 1.
- name: nome do projeto.
- settings: ratio (9:16, 16:9 ou 1:1), fps (30 ou 60). Resoluções respectivamente 1080×1920, 1920×1080 e 1080×1080.
- assets: id único alfanumérico, type (image/video/audio), path relativo; imagens/vídeos exigem width e height reais. duration em segundos para áudio/vídeo permite validar limites de corte.
- scenes (ou clips): decisões abaixo, em segundos, sem reordenar timing narrativo.
- captionStyle: estilo global inicial das legendas.
- logo: {"text":"@TOUCABR","fontSize":58}; gera texto editável em 50% de opacidade.
- metadata: notas externas, não executáveis.

Cena:
```
{"asset":"page014","start":3.2,"end":5.6,
 "region":"panel_top_right","focus":"character_face",
 "motion":"slow_push","transition_out":"organic_fusion",
 "reason":"Reação à revelação da narração"}
```

Regiões são definidas em assets[].regions, ou diretamente na cena:
`{"x":0.1,"y":0.2,"width":0.35,"height":0.55}`. Coordenadas normalizadas de 0 a 1 a partir do canto superior esquerdo da imagem. O compilador calcula escala/posição para preencher o canvas com esse retângulo sem deformar a arte. A região é um enquadramento inicial, não uma máscara: abrir o plano posteriormente pode revelar áreas vizinhas da página.

Movimentos suportados: hold, slow_push/push, pull, left, right, up, down. Geram interpolação suave (inout) e tempos exatos. Não há escolha aleatória nem intervalo obrigatório de corte.

Transform manual opcional: x/y em pixels relativos ao centro, scale em porcentagem (100 = imagem contida), rotation em graus, opacity de 0 a 100. A região, quando presente, define x/y/scale iniciais.

Keyframes explícitos: `[{"time":0,"transform":{"scale":120},"easing":"inout"}, ...]`; tempo local ao clip, sem duplicatas. Easing: linear/in/out/inout; smooth é alias de inout. Apenas um keyframe é permitido, sem inventar um segundo.

Áudio: asset, start/end, offset em segundos, volume 0–200, muted.
Legendas: type:"subtitle", text, start/end; uma cena por palavra se os timestamps estiverem disponíveis. Não inventamos sincronização palavra a palavra a partir de apenas texto.
Texto: type:"text", text, style, transform.
Style: font, fontSize, color, stroke, strokeColor, shadowColor, shadowBlur, textBg, textBgOpacity, fontWeight, align.
Trilhas: main, overlay/overlay2…overlay7, subtitle, voice, music/audio3…audio5. Main não aceita sobreposição. Clips mantêm start/end explícitos, inclusive lacunas intencionais.

Transição: transition_in na cena de chegada ou transition_out na anterior. Fusão:
`{"type":"organic_fusion","duration":0.4,"intensity":0.45,"softness":0.18,"direction":"left"}`.
Use transition_in para controlar todos os parâmetros. transition_out usa inicialmente duração de 0,4 s. Direção: left/right/up/down; intensidade 0–1, suavidade 0,01–0,5. Controles de fusão aparecem ao selecionar o clip de chegada. Duração limitada pelos clips adjacentes. Não altera a duração da narrativa nem adiciona som.

## Empacotar
Com Python instalado:
`python tools/pack-project.py caminho/project.json video.touca`
Ou use um compactador ZIP normal, incluindo project.json e suas pastas de mídia. O projeto deve referenciar somente arquivos dentro da pasta/pacote. Não inclua API keys.

## Integridade e persistência
Importação usa um novo ID, mantém o projeto anterior, processa cada mídia separadamente e publica o snapshot após copiar todos os arquivos. ZIP tem checagem de CRC, caminhos, nomes duplicados e tamanho. ZIP64, pacotes criptografados e multipart não são suportados. Limites atuais: 2 GB por arquivo, 8 GB descompactados, 5.000 assets, 50.000 cenas e 2 horas de timeline; esses são limites de validação, não promessa de performance.
Após importação, originais ficam no armazenamento local do projeto; o ZIP de origem pode ser movido. Salvar projeto pelo botão antigo não produz um ZIP portátil com mídia — preserve o pacote externo para transferência entre PCs. A edição/salvamento/reabertura local usa o formato existente.

## Escopo entregue e limites
- Importação pré-editada e compilador determinístico, preservando edição manual.
- Scroll aumenta/reduz ao redor do cursor; removido auto-fill involuntário também ao finalizar gesto.
- Preservados os tempos finais de keyframes importados e o comportamento v29 de exclusão/inserção.
- Fusão por displacement/refração em WebGL, mesmo código no preview/exportação; não é Gaussian blur.
- Projeto demonstrativo, empacotador e testes incluídos.

Ainda não implementados: análise visual/narrativa interna, interface de lote, máscaras arbitrárias, importação de efeitos complexos, exportação portátil de todos os projetos legados, motor de composição nativo completo e novo instalador independente. Crop/mask arbitrários são rejeitados explicitamente; utilize region. O renderizador e o fluxo de áudio existentes foram preservados.
Sem WebGL o preview usa dissolução de contingência; exportar fusão informa falha, não troca silenciosamente o efeito. Não houve teste visual da fusão/câmera nem execução no Windows real nesta sessão. Testes de importação usam o backend real com diálogos Electron simulados; isso não substitui QA completo de interface.
