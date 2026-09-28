# Pendências do Personalizações ZERO19

Atualizado em 28/09/2026. Ler este arquivo e `AGENTS.md` antes de trabalhar. Atualizar o estado sempre que concluir ou descobrir uma dependência. Código compilando, banco migrado, Git atualizado e produção publicada são verificações diferentes.

Estados: `[ ]` pendente · `[~]` em andamento/parcial · `[x]` concluído com prova indicada.

## P0 — Integração real com Venduss

- [x] Tabelas e funções do portal “Empresas parceiras” aplicadas no Supabase; migração corrigida e 12/12 testes PostgreSQL isolados passaram. No banco real, tabelas e RPCs existem.
- [x] Venduss cadastrada e ativa como primeira parceira no banco; existe mapeamento tenant → workspace/portal. Nenhum outro tenant foi ativado.
- [~] Interface “Empresas parceiras” deixa de oferecer criação genérica de empresa; commit local `a22bee9` criado. Falta confirmar no navegador, enviar ao GitHub (conexão `github.com:443` falhou) e deploy Vercel.
- [ ] Para outras lojas, só ativar parceria mediante botão autorizado no cadastro do tenant NovoVenduss. O banco já restringe portal ativo a tenant mapeado; falta o fluxo de ativação/gestão.
- [~] Acervo Venduss criado na Personalizações: rota no menu, agrupamento por marca, miniaturas, PNG privado, foto principal da camisa e botão para importar ao filme. Migração de leitura privada aplicada; RPC mostrou 2 artes para o titular e zero sem sessão. Edição/substituição ocorre no Venduss; validar página/filme no navegador com usuário autenticado antes de concluir.
- [ ] Venda Venduss de peça estampada gera projeto/ordem de produção uma única vez, com idempotência, dados de peça/tamanho/cor/quantidade, arte e prazo; não interromper checkout por falha de integração. Mostrar na fila aguardando produção e no filme.
- [~] Separação de camisa lisa no ZERO19: dono informou que já está funcionando. Auditar venda controlada, folha/checklist, cancelamento e consumo de estoque antes de alterar ou duplicar o fluxo.
- [ ] Na fila “Aguardando produção”, incluir miniaturas das artes sem perder informações/ações atuais.

## P0 — Produção diária e prazos

- [ ] Revisar página inicial para mostrar apenas personalizações realmente abertas, em ordem vencidos → prazo próximo → antigos, com etapas claras e sem clientes fora do fluxo.
- [ ] Cards: manter tamanho aprovado; status destacado sem sobreposição do número de itens; contagem regressiva real em dias/horas/minutos; marcar pronto/entregue atualiza o card sem refresh e preserva filtro/posição. Confirmar com modal próprio, não `window.confirm`.
- [ ] Pausar pedido com motivo, tempo parado e destaque no card; gerenciar motivos (criar/editar/excluir), padrão “aguardando chegar camisa”. Reabrir pedido pronto/entregue escolhendo a etapa; ajustar prazo manualmente por projeto.
- [ ] Impressora em manutenção pausa pedidos afetados e relógio; feriados nacionais no calendário e opção de feriado manual. Trabalho útil só segunda–sábado 10h–18h, excluindo pausa/feriado.
- [ ] Recalcular próximo prazo com backlog real ainda não produzido, inclusive pedidos aguardando arte/produção. Legado entra no backlog (30 min por camisa ou por estampa sem camisa), mas não contamina média histórica. Nunca prometer conclusão no início do expediente. Respeitar prazo dos pedidos existentes e encaixes urgentes/“cliente na loja” sem sobrescrever fila silenciosamente.
- [ ] Tempos configuráveis e estimativa por etapa: arte ~30 min, impressão ~50 min/metro de filme, corte/poliamida ~5 min/estampa, forno ~2 min por lote A3 com possível segunda rodada, prensa ~5 min por lado. Agrupar apenas trabalhos realmente compatíveis e no mesmo estágio, não assumir todo backlog num filme.
- [ ] Mostrar média atual por camisa e próximo prazo disponível em tempo real, iguais ao PDV; dia da semana e data/hora legíveis.

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
- [~] Commits da Personalizações enviados ao GitHub até `0ed2893`; a rotina de build e o workflow tinham versões antigas fixas (`2.17.39`/`2.17.35`) e foram alinhados para `2.17.40`, com `npm run build` e testes integrados passando. Ainda registrar/enviar a correção do build e publicar na Vercel. O CLI local está deslogado e a ação de deploy da integração retornou `Tool deploy_to_vercel not found`; a Vercel ainda lista produção na revisão antiga `6a4b2c31`. Não afirmar deploy enquanto a revisão ativa não mudar.

Dependência cruzada: acompanhar também `C:\sistemas visualcode\venduss\novovendus\PENDENCIAS.md`.
