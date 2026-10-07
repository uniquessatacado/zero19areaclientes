# Números Brasil — preparação, 07/10/2026

Atualização posterior do mesmo dia: seletor de 1/2 dígitos (R$20/R$30), checkout e aplicações de produção implementados/testados no NovoVenduss; arquivos privados e 110 combinações registrados por MCP autorizado e pré-preparo offline. O bloqueio CLI descrito abaixo é histórico: runtime usa a API Storage oficial para cadastrar o PNG preparado, não inserções em Storage objects. Evidências atuais: `C:/sistemas visualcode/venduss/novovendus/docs/BRASIL_NUMBERS_AND_PREVIEW_2026-10-07.md`. Frontend público ainda exige Git/rebuild pelo dono e filme2.17.53 autorização específica. Conteúdo abaixo preserva o diagnóstico da etapa inicial, não o status atual.

Pedido: oferecer número normal, sem imagem política, usando os dez arquivos enviados pelo dono. Não altera a publicação pendente do Personalizações 2.17.53.

## Arquivos

Origem autorizada: `C:/Users/usslo/Downloads/NUMEROS PALEMIRAS/NUMEROS BRASIL/numero 0.svg` até `numero 9.svg`. Cada SVG do Corel possui uma imagem PNG externa em sua pasta `_Images`; não contém contornos vetoriais editáveis. Todas as dez dependências exatas estão disponíveis.

Pacote gerado: `C:/Users/usslo/AppData/Local/Temp/zero19-brasil-numbers-w0i7V1`. Cada dígito guarda SVG original, PNG dependente no caminho original, PNG de produção sem alteração e SVG autocontido com a mesma imagem incorporada. Manifesto registra SHA256 e dimensões. Fonte original de 28 cm e aproximadamente 353 DPI verticais; nada foi ampliado, recolorido, traçado ou gravado sobre os arquivos do dono. Cores, contorno e escudo CBF preservados. `preview.html` é conferência local, não estúdio de compra.

## Testes

`node scripts/test-brasil-numbers-package.mjs` passou: integridade dos bytes PNG, medidas, dependência por dígito, recusa de links externos/conteúdo ativo/PNG inválido. Preparação dos dez arquivos passou, conferindo os hashes originais antes/depois.

Browser conectado não disponível; skill Browser lida integralmente, descoberta vazia confirmada. Alternativa: Edge headless em perfil novo isolado e servidor de loopback temporário. Desktop1360 e celular320 passaram: dez imagens não vazias, `object-fit: contain`, sem rolagem horizontal, zero requisições externas. Capturas em `C:/Users/usslo/AppData/Local/Temp/zero19-number-shots-ZQPDdr`. Conferência do pacote, não impressão física nem integração com o sistema.

## Bloqueios e continuidade

- CLI Supabase instalado 2.65.5 e projeto NovoVenduss vinculado a `kedggjyerexnzmipaick`. `storage ls` devolveu **Access token not provided**. MCP conectado permite SQL, mas não disponibiliza upload de arquivo. Não buscar credenciais em perfis/sessões, não pedir chave no chat e não inventar Storage objects no banco.
- Dono deve realizar `supabase login` no terminal do NovoVenduss para habilitar upload pelo acesso oficial. Depois confirmar projeto/bucket privado e usar caminhos novos, sem substituir arquivos antigos.
- Confirmações solicitadas: preço do número sozinho/com nome; intervalo 0–99; alturas masculino28/feminino25/infantil20cm. Sem respostas não inventar cobrança pública.
- Sanitizador do filme atual remove `href` não-fragmento, inclusive PNG incorporado. Registrar SVG assim hoje produziria desenho vazio. Antes de liberar: implementar tratamento estrito de PNG incorporado ou usar representação PNG compatível, testar render/alpha/cores/medidas e preservar caminhos históricos. Não trocar automaticamente os glifos da fonte Brasil existente.
- Editor, carrinho, acervo, checkout, preço por aplicação, pagamento, sincronização e filme da nova opção ainda precisam de implementação/QA. Nenhuma tabela, fonte, pedido, estoque, conta ou arquivo de produção foi alterado neste bloco.

Status correto: **PREPARED_NOT_UPLOADED**. Não afirmar cadastro ou publicação concluídos.
