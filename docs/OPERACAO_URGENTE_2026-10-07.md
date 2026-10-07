# Operação urgente — pedidos do dono, 07/10

Não trocar de frente sem registrar teste, bloqueio ou próximo passo. Este registro não significa que a função já foi publicada.

## Prioridade imediata: checkout bloqueando vendas

- [~] Checkout: Edgev7 ACTIVE/JWT já corrige o processamento das quatro artes novas com cache privado pré-preparado (originais preservados, pixels conferidos offline). Pix/cartão em22/preso/Lula10/Lula13, entrega/retirada e replay idempotente PASS; seis arquivos remotos iguais ao local. Doze pedidos QA cancelados pela RPC existente depois de rollback/guardas, sem pagamento/reserva/produção. Não afirmar todas as artes resolvidas antes do restante abaixo.
- Evidência: political-checkout v5 desligado por Memory/HTTP546 em tentativas recentes. Arte Bolsonaro22 ainda sem importação preparada; processamento de PNG original de7,9MB durante a finalização. Não confundir com erro de CPF/WhatsApp nem esconder validações de estoque/frete.
- [!] Preparação preventiva de104 artes ainda sem ativo privado foi BLOQUEADA pela revisão automática: criação de ativos/defaults de produção em lote exige autorização específica. Nenhuma execução desse lote. Pedido de autorização ao dono pendente; não contornar por outro script/RPC. Template do endpoint de manutenção desativado, sem token/escopo, retorna403; configuração temporária local removida. O checkout normal permanece ativo. Não modificar pedidos/históricos/pagamentos/estoque no preparo.
- Restam101artes após o fluxo normal dos testes autorizados registrar as três novas ainda sem default; autorização específica do lote segue pendente. As demais ainda usam fallback antigo quando não existe ativo/cache. Este checkpoint não encerra a recuperação geral do checkout.

## Filme — bloco testado em publicação

- [x] Guarda SQL de exportação por aplicação ignora só posição derivada da fila; demais aplicações preservadas. Aplicado e testado com rollback.
- [x] Editar acentos mantém altura física original. Exportação bloqueia escala indevida abaixo da altura oficial/redução autorizada.
- [x] Release2.17.54/39e4528 na Vercel dpl_C4BxUyEB56qytCbTbSGegtzk9CAH READY/produção/alias oficial/SHA Git exato. Cinco arquivosHTTP200 iguais ao dist/build porSHA256 normalizado UTF8-LF. Não houve impressão física.
- [ ] Quantidades parciais: imprimir1de3 e deixar2; controle por aplicação e lote idempotente. NÃO concluído.
- [ ] Conclusão automática após todas as artes/quantidades exportadas com sucesso, conforme última resposta. Não concluir a partir do download com erro ou de uma aplicação irmã.

## Cupons e gestão — concluir após recuperar checkout

- [~] Bloco por camisa física (1camisa=1peça; escritas/artes são aplicações). Testes de contagem/unidades/edição/cores/público PASS no NovoVenduss local.
- [~] Tamanho, masculina/feminina/infantil e cor explícita em preto forte no térmico; escrita acima, arte central, escrita abaixo. Não juntar camisas iguais por variante.
- [~] QR da montagem completa por bloco e etiqueta da sacola junto nas duas origens: PDV e gestão. QA real1280/320 PASS, viewport320 confirmado, uma camisa/três aplicações, sem overflow e QRs carregados. Fundo branco explícito e medida da arte não herda altura da escrita. Código dos cupons ainda LOCAL, publicação depende dos controles abaixo.
- [~] QR interno para abrir pedido da equipe e botão confirmar pronto envio/retirada: QR adicionado localmente; botão/RPC ainda faltam. Leitura não altera estado; login obrigatório.
- [ ] Após confirmar pagamento: perguntar Imprimir personalização + etiqueta da sacola agora? Agora/Depois.
- [ ] Cards pagos: aviso imediato Produção não iniciada — conferir via; produção parcial com n/total e o que falta; pronto conforme modalidade.
- [ ] Urgência/posição de fila: priorizar prazo de postagem considerando transporte longo. Pergunta de desempate enviada e sem resposta; não inventar ranking nem ignorar retirada vencida.
- [ ] Arquivar cadastros duplicados de endereço com confirmação, sem excluir cliente/pedidos/histórico. Código/migration em andamento, NÃO aplicada nem publicada.

## Publicação autorizada

- Personalizações: Vercel após testes, confirmar commit/versão ativa.
- NovoVenduss/ZERO19: Git após testes; servidor precisa rebuild. Git não prova frontend publicado.
- Preservar alterações alheias, originais privados, rascunhos e históricos. Não marcar retrospectivamente pedidos como produzidos sem conferência.
