# Pendências do Personalizações ZERO19

Atualizado em 28/09/2026. Ler este arquivo e `AGENTS.md` antes de trabalhar. Atualizar o estado sempre que concluir ou descobrir uma dependência. Código compilando, banco migrado, Git atualizado e produção publicada são verificações diferentes.

Estados: `[ ]` pendente · `[~]` em andamento/parcial · `[x]` concluído com prova indicada.

## P0 — Integração real com Venduss

- [~] Incidente de operação 28/09 ~11h45: causas dos erros das fotos CORRIGIDAS NO BANCO às 15:01 UTC. `queue_minutes_per_item` e cast de refinalização agora numeric; Storage permite pasta do titular/equipe somente a membro ativo da mesma conta. 38 verificações SQL passaram: 16 Storage, 3 arte/posicionamento, 5 minutos decimais, 14 consultas de fila/acervo/acompanhamento. Nenhum registro sintético persistiu. Builds dos dois projetos e tipos Venduss passaram. Ainda falta teste de venda/refinalização inteira: revisão de segurança bloqueou movimentar temporariamente estoque/pagamentos em produção sem autorização específica (pergunta enviada). Navegador conectado indisponível. Evidências/limites em `docs/INCIDENTE_BANCO_2026-09-28.md`; não confundir com auditoria geral encerrada.
- [~] Inventário de 163 RPCs literais dos dois frontends encontrou 8 ausentes: dois nomes legados de cancelamento/estorno (cancelamento possui alternativa; cleanup atual não chama estorno porque flag é sempre false), quatro funções de mídia/edição/histórico da fila antiga por link da equipe, estatísticas de produtos de outros tenants e ganhadores da roleta. Detalhes no relatório. Não reaplicar migrações antigas inteiras: podem sobrescrever acompanhamento/cancelamento mais recentes ou devolver estoque indevidamente.

- [x] Correção local do seletor (28/09): miniaturas 72×72 e lista responsiva; dois pedidos ZERO19 já adicionados ao filme permanecem visíveis junto com Venduss, identificados como já adicionados e sem duplicação. Contador mantém os três enquanto estão aguardando. Teste visual isolado desktop/celular em quatro cenários passou; teste de confirmação exportada verifica que só os pedidos marcados mudam. Publicação desta revisão ainda pendente.

- [~] Pedido atual 28/09: incluir os trabalhos Venduss `ready_production` no seletor unificado do filme, com miniatura/posição/identificação Venduss, sem duplicar artes já adicionadas. Conferir liberação → fila → filme; a consulta do modal omitia artes sem posicionamento/importação local.
- [~] Nova página Venduss no topo do sidebar para acompanhar separação ZERO19 e produção Personalizações em atualização automática; mostrar etapas independentes e vínculo com pedido original. Trabalho coordenado com NovoVenduss.

- [~] Integração automática Venduss → ZERO19 → Personalizações ATIVADA em 28/09 após autorização explícita para novas vendas e pedidos abertos. Migração principal e complementos de revisão, recebimento/reversão e retentativa APLICADOS. Testes isolados e `scripts/venduss-bridge-live-rollback.sql` passaram no banco real (checkout, estoque uma vez, liberação, custo/lucro zero, repasse/caixa/reversão, agendamento/alerta, edição após separação, cancelamento), todos desfeitos com ROLLBACK. Sincronizados dois pedidos reais abertos (entrou outro durante o trabalho): Venduss #49215 → ZERO19 #49394, R$94; #49390 → #49393, R$29. Lucro zero, R$123 a receber, nenhuma movimentação física adicional e zero erros de sincronização. #49390 recebeu liberação manual real às 11:37 UTC e sua estampa ficou `ready_production`. Retentativa automática a cada minuto. Falta inspeção visual autenticada, uso real do filme e acompanhamento das próximas operações.
- [x] Corrigido acervo → filme no código: antes só navegava. Agora importa/reutiliza o PNG e adiciona o item real sem criar vínculo com pedido inexistente. Testes de arte nova/reutilizada/substituída, falha/limpeza e formato do item passaram, assim como o build. Falta publicação/checagem visual autenticada (não confundir com validação de produção).

- [x] Tabelas e funções do portal “Empresas parceiras” aplicadas no Supabase; migração corrigida e 12/12 testes PostgreSQL isolados passaram. No banco real, tabelas e RPCs existem.
- [x] Venduss cadastrada e ativa como primeira parceira no banco; existe mapeamento tenant → workspace/portal. Nenhum outro tenant foi ativado.
- [~] Interface “Empresas parceiras” deixa de oferecer criação genérica de empresa; commit local `a22bee9` criado. Falta confirmar no navegador, enviar ao GitHub (conexão `github.com:443` falhou) e deploy Vercel.
- [ ] Para outras lojas, só ativar parceria mediante botão autorizado no cadastro do tenant NovoVenduss. O banco já restringe portal ativo a tenant mapeado; falta o fluxo de ativação/gestão.
- [~] Acervo Venduss criado na Personalizações: rota no menu, agrupamento por marca, miniaturas, PNG privado, foto principal da camisa e botão para importar ao filme. Migração de leitura privada aplicada; RPC mostrou 2 artes para o titular e zero sem sessão. Edição/substituição ocorre no Venduss; validar página/filme no navegador com usuário autenticado antes de concluir.
- [~] Venda estampada gera projeto pelo pedido ZERO19 de custo, com arte/posição/quantidade e vínculo único; separação/produção só após pagamento do cliente ou liberação manual. Falhas ficam registradas para retentativa e não desfazem checkout. Teste real com rollback passou e integração ATIVA; aguarda teste visual do filme. Alteração após separação/produção exige revisão explícita, mesmo se o cliente já pagou.
- [~] Separação de camisa lisa no ZERO19: dono informou que já está funcionando. Auditar venda controlada, folha/checklist, cancelamento e consumo de estoque antes de alterar ou duplicar o fluxo.
- [~] Fila mostra miniatura da estampa Venduss e posição oficial; botão importa PNG privado e vincula o item real ao filme/pedido. Código publicado na revisão `7b6c15c`; falta validação visual autenticada.

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

- [x] Publicação 2.17.42 concluída em 28/09: código `8637a37` no GitHub; NovoVenduss `423754cd` também enviado. Deploy `dpl_58LA2nuZGFFn3qVsUTboZqiBpkeN` READY em produção. Domínio `019-personalizacoes.vercel.app` respondeu HTTP 200 com versão 2.17.42 e JS contendo miniaturas 72px/permanência dos pedidos já no filme. Build completo/regressões passaram localmente e na Vercel; teste visual isolado desktop/mobile passou. Migração de acompanhamento já consta no banco. Inspeção autenticada ponta a ponta e demais pendências deste documento NÃO foram encerradas por esta publicação.

- [ ] Conferir todas as migrações usadas pela interface no banco real e falhas de RPC/Storage. O portal parceiro faltava e foi aplicado; outras áreas exigem inventário de schema e verificação de permissões.
- [ ] Auditoria técnica completa do anexo enviado pelo dono: rastrear código, banco, segurança/RLS, performance, dependências, código legado e fluxos de ponta a ponta sem reescrever às cegas.
- [ ] Layout moderno com contraste, responsividade desktop/mobile, sem rolagem horizontal; reduzir consultas, carregamento e demora de clique. Fazer teste visual e funcional, não só sintaxe/build.
- [ ] Validar cadastro/portal da Venduss no navegador e transição de produção com dados de teste seguros; conferir separação, filme, cancelamento e rollback antes de chamar integração concluída.
- [x] Publicação desta etapa: código `b984077` enviado ao GitHub, Personalizações **2.17.41** publicada na Vercel, deployment `dpl_GXLvrhLDBeDyFJGzyoag7qwGqsgx` READY com SHA correspondente e alias de produção confirmado. HTTP 200 no domínio oficial, meta 2.17.41 e JS com `awaiting_release`/importação da arte confirmados. Build/testes passaram. Isto NÃO encerra as pendências acima: navegador conectado indisponível (`agent.browsers.list()` vazio), sem inspeção visual autenticada desktop/mobile.

Dependência cruzada: acompanhar também `C:\sistemas visualcode\venduss\novovendus\PENDENCIAS.md`.
