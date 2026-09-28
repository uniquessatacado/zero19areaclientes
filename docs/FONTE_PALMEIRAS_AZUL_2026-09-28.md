# Correção da altura de referência — 2.17.46

Pedido do dono: O de JOÃO deve medir 5,5 cm; J e letras altas crescem na mesma escala. Não deformar letras nem alterar Corinthians/GABRIEL e números.

## Causa e escopo

A referência genérica H/E/I/A/O selecionava H. No TTF original da camisa azul Palmeiras, O é mais baixo. A medição reproduziu O=3,95679 cm para altura informada de 5,5 cm. A correção usa O explicitamente somente para o conjunto `3dd7b508-a3d0-4752-84dd-82ac24622c48` / fonte `488c3140-fc74-4124-832a-fdb62e127c26`.

A receita registra `nameReferenceChar`. Novas composições recebem a referência; rascunhos antigos são atualizados apenas no botão Atualizar filme, que invalida prévia, máscara e encaixe anteriores. Exportar receita antiga dessa fonte exige esse recálculo. Arquivos já baixados não mudam. Não houve escrita no banco, alteração de pedidos, status ou estoque.

## Evidências

- TTFs locais originais Palmeiras e Corinthians, fontes carregadas no Edge isolado; nenhum original publicado.
- `scripts/palmeiras-font-browser-qa.mjs`: desenho real em 300 DPI, referência O=5,5 cm, J=9,66147 cm e Ã completo=6,83853 cm. Mesma escala para todas as letras. Pixels com alfa >127: O=5,46947 cm, tolerância de rasterização de 0,5 mm; J=9,66047 cm. Não é teste físico de impressora/RIP.
- Caminhos óptico e retangular mantêm alturas iguais. Letras GABRIEL e números idênticos antes/depois.
- `scripts/test-lettering-reference.mjs`: escopo por identidade (não nome), atualização de rascunho, invalidação de prévia/máscara, idempotência, preservação de número e outra fonte.
- `npm run build`: passou com todos os testes determinísticos. `git diff --check`: passou.

## Uso

Atualizar a página para 2.17.46, abrir o filme existente e clicar em Atualizar filme. Conferir o encaixe maior de JOÃO e exportar novamente. Não reutilizar o PNG/TIFF antigo. A altura informada continua sendo respeitada: se a equipe escolheu 5 cm, a referência será 5 cm; não sobrescrever silenciosamente por 5,5.

Publicação: aguardando confirmação do domínio de produção.
