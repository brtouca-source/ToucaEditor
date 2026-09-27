# Distribuição e assinatura

## Situação desta entrega

Este ZIP atualiza a instalação existente. Não contém um novo instalador Windows nem certificado de assinatura. O executável já instalado não é substituído pelo atualizador; seu aviso de editor desconhecido **não é resolvido por este ZIP**.

SHA-256 confere integridade da cópia; não prova identidade do fornecedor. Alterar `author`, nome, ícone ou versão também não cria uma assinatura Authenticode.

## Assinatura real

1. Obter uma identidade de assinatura de código validada por um emissor aceito pelo Windows ou serviço de assinatura compatível. Credenciais/certificado não foram fornecidos nesta sessão.
2. Instalar o provedor/token do certificado e o SignTool do Windows SDK no ambiente de release.
3. Produzir o aplicativo Windows com uma versão fixa de Electron e dependências registradas. Assinar os binários do aplicativo antes de montar o instalador.
4. Executar `tools/windows/Assinar.ps1 -Arquivos <arquivos> -CertificadoThumbprint <thumbprint>` para a identidade instalada em CurrentUser/My. Fluxos cloud podem exigir a integração específica do fornecedor.
5. Montar o instalador, assiná-lo também, e verificar a assinatura final. O script verifica `/pa /all` e o status Authenticode; não foi executado sem certificado/Windows.
6. Testar o pacote baixado num Windows limpo. Reputação SmartScreen e identidade assinada são verificações diferentes; não prometemos ausência de todos os alertas.

Nenhum certificado autoassinado foi criado, nenhuma autoridade foi adicionada à máquina e nenhuma proteção do Windows foi desativada nesta atualização.

Referências: [assinatura no Electron](https://www.electronjs.org/docs/latest/tutorial/code-signing), [SignTool da Microsoft](https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool).

## Passos técnicos antes de uma distribuição comercial

- Registrar uma versão reprodutível do runtime Electron, dependências e ferramentas de build; o pacote recebido é de atualização, não um pipeline de instalação completo.
- Manter histórico em Git, releases numeradas e backups. Não incluir projetos, mídias pessoais ou chaves na distribuição.
- Conferir os avisos/licenças dos componentes realmente empacotados; `licenses/` preserva os avisos recebidos. A configuração concreta de FFmpeg e os modelos extras precisam constar desse inventário.
- Validar importação, salvamento/reabertura, atualização/rollback e exportação com projetos reais de referência.
- Preparar instalador assinado e testar em máquina limpa.
- Documentar suporte, recuperação de projeto, requisitos e tratamento das chaves/arquivos locais. O ElevenLabs mantém o armazenamento local já existente; esta versão não altera essa decisão.
- Só então publicar o pacote de release e sua documentação. Venda, licenças de conteúdo e obrigações de privacidade exigem avaliação própria; este documento descreve o processo técnico, não certifica prontidão comercial.
