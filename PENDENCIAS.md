# Pendências do Personalizações ZERO19

Atualizado em 28/09/2026. Ler este arquivo e `AGENTS.md` antes de trabalhar. Atualizar o estado sempre que concluir ou descobrir uma dependência. Código compilando, banco migrado, Git atualizado e produção publicada são verificações diferentes.

Estados: `[ ]` pendente · `[~]` em andamento/parcial · `[x]` concluído com prova indicada.

## P0 — Integração real com Venduss

- [~] Regra confirmada pelo dono em 28/09: acervo automático via produto, sem usar o portal manual antigo; pedido de custo ZERO19 a receber da Venduss; liberar separação/produção após pagamento ou botão administrativo com motivo; recebimento com forma/caixa e agendamento/alerta. Migração `20260928104733_venduss_order_release_bridge.sql` em desenvolvimento e testada em PostgreSQL isolado, ainda NÃO aplicada/ativada. Validar edição após produção iniciada, estoque/cancelamento, guardas e banco real antes de ativar. Telas de liberação/repasse/alerta no NovoVenduss e estágio pendente/miniaturas/entrada da estampa no filme em desenvolvimento.
- [x] Corrigido acervo → filme no código: antes só navegava. Agora importa/reutiliza o PNG e adiciona o item real sem criar vínculo com pedido inexistente. Testes de arte nova/reutilizada/substituída, falha/limpeza e formato do item passaram, assim como o build. Falta publicação/checagem visual autenticada (não confundir com validação de produção).

- [x] Tabelas e funções do portal “Empresas parceiras” aplicadas no Supabase; migração corrigida e 12/12 testes PostgreSQL isolados passaram. No banco real, tabelas e RPCs existem.
- [x] Venduss cadastrada e ativa como primeira parceira no banco; existe mapeamento tenant → workspace/portal. Nenhum outro tenant foi ativado.
- [~] Interface “Empresas parceiras” deixa de oferecer criação genérica de empresa; commit local `a22bee9` criado. Falta confirmar no navegador, enviar ao GitHub (conexão `github.com:443` falhou) e deploy Vercel.
- [ ] Para outras lojas, só ativar parceria mediante botão autorizado no cadastro do tenant NovoVenduss. O banco já restringe portal ativo a tenant mapeado; falta o fluxo de ativação/gestão.
- [~] Acervo Venduss criado na Personalizações: rota no menu, agrupamento por marca, miniaturas, PNG privado, foto principal da camisa e botão para importar ao filme. Migração de leitura privada aplicada; RPC mostrou 2 artes para o titular e zero sem sessão. Edição/substituição ocorre no Venduss; validar página/filme no navegador com usuário autenticado antes de concluir.
- [ ] Venda Venduss de peça estampada gera projeto/ordem de produção uma única vez, com idempotência, dados de peça/tamanho/cor/quantidade, arte e prazo; não interromper checkout por falha de integração. Mostrar na fila aguardando produção e no filme.
- [~] Separação de camisa lisa no ZERO19: dono informou que já está funcionando. Auditar venda controlada, folha/checklist, cancelamento e consumo de estoque antes de alterar ou duplicar o fluxo.
- [ ] Na fila “Aguardando produção”, incluir miniaturas das artes sem perder informações/ações atuais.

## P0 — Produção diária e prazos

- [~] Página inicial tem código de filtro e ordenação de trabalho aberto; confirmar com dados reais se vencidos/prazo/antigos estão na ordem correta e se nenhum cliente sem trabalho entra.
- [~] Cards têm status/quantidade separados no HTML/CSS e contagem regressiva atualizada a cada segundo; ações usam atualização localizada e há modais de confirmação. Build passou; falta inspeção visual desktop/mobile e operação real sem perder filtro/posição.
- [~] Pausa por pedido, motivo/tempo no card, gerenciamento criar/editar/excluir, reabrir escolhendo etapa e “Novo prazo” existem no código; tabelas e RPCs correspondentes existem no banco. Falta testar operações reais, permissões e motivo inicial em conta nova.
- [~] Código tem manutenção da impressora, feriados manuais e calendário útil segunda–sábado 10h–18h; tabelas/RPCs existem. Banco confirmado com 13 datas por ano de 2026 a 2030 e cinco motivos de pausa ativos. Falta testar pausa/retomada com pedido controlado e revisar as datas locais/futuras conforme calendário da loja.
- [~] Planejador `production-scheduler.js` separa prioridade e estágios, reserva backlog desconhecido e não soma espera histórica à média; testes automatizados passaram no build. Falta conferir snapshots reais dos pedidos devidos na segunda, encaixes e risco de atraso antes de considerar promessa confiável.
- [~] Tempos editáveis por etapa, lotes de filme/forno apenas com estágios compatíveis e prensa por lado estão no planejador e no banco; testar dimensões/quantidades reais e convergência PDV–Personalizações.
- [~] Tela de produção mostra tempo estimado por camisa, média medida, fila, próximo prazo com dia da semana/data/hora e explicação do cálculo; o planejador é compartilhado com o NovoVenduss. Falta comparação funcional simultânea com o PDV em dados reais e atualização automática durante mudanças concorrentes.

## P1 — Artes, custos e cliente

- [ ] Curva CMYK em modal grande, imagem antes/depois ampla e comparável, cor e detalhes visuais claros; verificar estimativa/lançamento de custo de impressão que hoje pode dizer “Não informado” indevidamente.
- [ ] Arte/fonte oficial anexada ao pedido precisa aparecer na área de arquivos do cliente (várias artes organizadas), sem expor arte inexistente como pronta.
- [ ] Melhorar mockup da camisa branca realista, letras/números proporcionais e posicionamento, prévia em tempo real no PDV/cliente, `Shift+Enter` inserindo linha onde permitido. Validar medidas oficiais antes de prometer precisão.
- [ ] Cliente acompanha o pedido inteiro em um link/QR, não cada personalização. Status resumido e ativo (“arte em desenvolvimento” em vez de impressão de inércia), prazo, contato e arquivos; nunca botão interno “Subir arte”. WhatsApp do card com saudação por horário/primeiro nome, QR para abrir no celular e link de acompanhamento.
- [ ] Cupom da personalização contém código da personalização e do pedido; apenas um QR de acompanhamento por pedido no cupom de venda, sem mensagem “prévia aprovada pelo cliente” indevida.
- [~] Cancelamento de pedido do PDV ZERO19: gatilho `z19p_zero19_order_cancellation` e guardas de venda/trabalho/projeto/pausa já estão aplicados; em 28/09, consulta do banco achou zero trabalhos ativos ligados a pedidos ZERO19 cancelados. Histórico é preservado. Ainda testar uma operação controlada de ponta a ponta e conferir reabertura/status/entrega e cancelamento originado no Venduss.

## Qualidade, dados e publicação

- [ ] Conferir todas as migrações usadas pela interface no banco real e falhas de RPC/Storage. O portal parceiro faltava e foi aplicado; outras áreas exigem inventário de schema e verificação de permissões.
- [ ] Auditoria técnica completa do anexo enviado pelo dono: rastrear código, banco, segurança/RLS, performance, dependências, código legado e fluxos de ponta a ponta sem reescrever às cegas.
- [ ] Layout moderno com contraste, responsividade desktop/mobile, sem rolagem horizontal; reduzir consultas, carregamento e demora de clique. Fazer teste visual e funcional, não só sintaxe/build.
- [ ] Validar cadastro/portal da Venduss no navegador e transição de produção com dados de teste seguros; conferir separação, filme, cancelamento e rollback antes de chamar integração concluída.
- [~] Commits da Personalizações enviados ao GitHub até `6f3e561`; a rotina de build e o workflow tinham versões antigas fixas (`2.17.39`/`2.17.35`) e foram alinhados para `2.17.40`, com `npm run build` e testes integrados passando. Falta publicar na Vercel: o CLI local está deslogado, a ação de deploy da integração retornou `Tool deploy_to_vercel not found` e a Vercel ainda lista produção na revisão antiga `6a4b2c31`. Não afirmar deploy enquanto a revisão ativa não mudar.

Dependência cruzada: acompanhar também `C:\sistemas visualcode\venduss\novovendus\PENDENCIAS.md`.
