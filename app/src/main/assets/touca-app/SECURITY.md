# Segurança do Touca Editor

## Distribuição

O código-fonte proprietário não deve ser publicado em repositório público. Os pacotes oficiais são distribuídos por canal controlado e devem ser conferidos pelo hash SHA-256 publicado junto do arquivo.

## Limitações

O Touca Editor é um aplicativo local. Nenhum programa executado no computador do usuário consegue impedir completamente engenharia reversa, cópia ou modificação. Ofuscação e empacotamento apenas aumentam o custo do abuso.

## Segredos

Chaves de API, tokens de produção e credenciais não podem ser incluídos no executável, no código-fonte ou em `localStorage`. Recursos que exigem segredo devem passar por um serviço de backend controlado pelo ToucaBR.

## Electron

A janela principal usa isolamento de contexto, Node desativado, sandbox, web security, navegação restrita e permissões mínimas. Conteúdo remoto não deve ser carregado dentro do editor.

## Relato de vulnerabilidade

Não publique detalhes de uma vulnerabilidade antes de avisar o proprietário. Envie uma descrição reproduzível, impacto e versão afetada por um canal privado do ToucaBR.
