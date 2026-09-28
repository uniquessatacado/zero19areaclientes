# Regras do dono — Personalizações ZERO19

Leia antes de alterar o sistema e registre aqui novas regras permanentes que o dono estabelecer.

- Antes de começar, ler `PENDENCIAS.md` deste repositório e o do NovoVenduss. Atualizar ambos quando um pedido mudar de estado; não trocar de frente deixando itens iniciados sem teste, registro de bloqueio ou próximo passo.

- O objetivo é agilizar a linha de produção e organizar pedidos abertos. A página inicial mostra apenas trabalho em aberto, priorizado por prazo e etapa, sem clientes sem personalização ativa.
- Layout moderno, limpo, legível, responsivo em PC e celular; sem rolagem horizontal, contraste fraco, botões quebrados ou controles sobrepostos. Animações e imagens não podem tornar o sistema lento.
- A página pública é só para o cliente: um pedido, um link/QR, status geral, previsão, artes vinculadas e contato. Nunca expor controles internos como “Subir arte”.
- Produção, custos e prazos são integrados ao PDV ZERO19. Cancelar ou alterar pedido deve refletir no fluxo e no filme; confirmar a ação no banco, não só na interface.
- Artes de peças estampadas Venduss que usam camisa lisa compartilhada ZERO19 devem ficar organizadas por marca, com miniatura, visualização na camisa e PNG pronto para impressão. A venda gera separação e entra na produção uma única vez, com vínculo ao pedido Venduss e ao estoque de origem.
- Em Empresas parceiras, ativar apenas a Venduss inicialmente. Novas lojas devem ser habilitadas explicitamente no cadastro do tenant Venduss, nunca criadas livremente nesta tela.
- Camisa lisa compartilhada não exige arte; peça estampada exige. A equipe deve confirmar a classificação, sem inferir apenas pelo nome ou pela foto.
- Para estimar prazo, considerar backlog real, etapas, expediente de segunda a sábado das 10h às 18h, feriados e pausas. Tempos e regras de prioridade configuráveis; não contar tempo parado na média.
- Ações devem atualizar cards sem recarregar toda a tela e sem perder posição. Usar mensagens claras, confirmação no próprio sistema e recuperação de erro.
- Antes de entregar uma alteração, verificar código, banco, testes, build e desktop/mobile. Publicação só está concluída depois de confirmar que o commit está ativo no ambiente correto.
- Antes de remover código ou migrar banco, rastrear referências entre Personalizações, NovoVenduss, ZERO19 e Venduss, inclusive rotas, webhooks, jobs, SQL e imports dinâmicos. Preservar dados e funções de uso incerto; só remover legado comprovadamente sem consumidores após testes de regressão.
