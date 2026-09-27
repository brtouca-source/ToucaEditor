# Manutenção do Touca Editor

Leia primeiro `docs/COMECE-AQUI.md` e a solicitação atual. Preserve funções não solicitadas.
Não abra `index.html` inteiro: ele contém modelos base64 grandes; código em `renderer/`.
Prefira correções na implementação proprietária a novos wrappers. A ordem clássica dos scripts é contratual.
Geometria da interface nunca deve alterar tempos do projeto. Não descarte salvamento vazio de um projeto existente: excluir todo conteúdo é uma edição válida.
Antes de empacotar, execute `npm run check`, testes relevantes e gere o manifesto. Não declare QA Windows/câmera/GPU sem executar nesses ambientes.
Nunca coloque chaves ElevenLabs, certificados privados ou credenciais no código/ZIP. Não invente assinatura confiável nem desative proteções do Windows para simulá-la.
