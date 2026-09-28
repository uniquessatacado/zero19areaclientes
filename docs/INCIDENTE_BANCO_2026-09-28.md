# Incidente operacional — 28/09/2026

## Correções aplicadas em produção

Projeto Supabase compartilhado: `kedggjyerexnzmipaick`. Nenhum pedido real foi apagado, cancelado, pago ou colocado em produção durante estes reparos.

1. **PDV: SQLSTATE 22P02, inteiro `28.4`.** O planejador retorna minutos fracionados, mas `personalization_sales.queue_minutes_per_item` era integer. Reproduzido com o mesmo JSON sob o papel authenticated. Tipo alterado para numeric e somente o cast desse campo no corpo de `refinalize_pdv_order` substituído por numeric. Nenhuma regra financeira/estoque da função foi substituída. Migração NovoVenduss `20260928150127_repair_personalization_fractional_queue_minutes.sql`; registro remoto `20260928150127`, nome `repair_personalization_fractional_queue_minutes`.
2. **Arte/filme/posicionamento: Storage 403/RLS.** Importação Venduss e mockup automático usam pasta do titular; INSERT antigo aceitava somente UID do operador. Funcionários ativos falhavam. Policies INSERT/SELECT/UPDATE/DELETE agora exigem membro ativo e pasta pertencente à mesma conta, seja titular ou colega. WITH CHECK também impede renomear arquivo para outra conta; comparação textual evita cast inválido em caminhos antigos. RLS continua ligada; nenhuma permissão pública adicionada. Migração `20260928150143_repair_personalization_team_storage_scope.sql`; registro remoto `20260928150143`, nome `repair_personalization_team_storage_scope`.

As duas correções são de banco e já afetam os aplicativos em execução; não dependem de atualização da página nem de novo frontend Vercel. A regra da fila foi preservada: adicionar ao filme não inicia produção.

## Provas executadas

Todos os scripts abaixo executaram no banco vinculado com `SET LOCAL ROLE authenticated` e claims de usuários ativos. Cenários sintéticos usam ROLLBACK; não foram criados pedidos, pagamentos nem movimentações de estoque de teste.

| Script | Verificações aprovadas | Escopo |
|---|---:|---|
| `scripts/incident-storage-permissions-rollback.sql` | 16 | Três usuários: INSERT/SELECT/UPDATE nas pastas titular/equipe; negar pasta e renomeação para outra conta; negar usuário sem perfil. |
| `scripts/incident-art-placement-rollback.sql` | 3 | Workspace, arte, mockup, perfil de impressão, posicionamento e atualização sob cada usuário ativo. |
| NovoVenduss `scripts/incident-decimal-minutes-rollback.sql` | 5 | JSON + INSERT/UPDATE reais da ficha sem pedido, gatilho de prazo, valores 28.4/30/0.5/265.75 e inspeção do cast da refinalização. |
| `scripts/incident-read-contracts-rollback.sql` | 14 | Fila do filme, prontidão, acervo (3 artes por usuário), snapshot ZERO19, acompanhamento Venduss e resumo fornecedor. |

Total: **38 verificações**. Conferência posterior: zero fichas, assets ou metadados Storage sintéticos persistidos. Consultas de integridade do dia em Venduss/ZERO19 não acharam pedidos não cancelados sem itens, itens com nome de personalização sem ficha, nem trabalho ZERO19 ativo ligado a pedido cancelado. Esta consulta não prova inexistência de todos os tipos de inconsistência histórica.

Build completo Personalizações (incluindo testes Node) passou; `tsc --noEmit` e build NovoVenduss passaram. Avisos existentes de Browserslist/chunks grandes/classe de duração permanecem.

## Limites explícitos / próxima execução

- Teste de RLS de Storage valida metadados e permissões, **não** uma transferência HTTP real dos bytes do PNG.
- Não foi concluída uma venda/refinalização completa pela UI. A revisão de segurança bloqueou o script que movimenta temporariamente estoque, caixa, pagamentos e filas; ROLLBACK pode não desfazer efeitos externos de gatilhos. Autorização específica foi solicitada ao dono; não repetir sem resposta.
- O navegador conectado retornou lista vazia. Nenhuma inspeção autenticada desktop/mobile foi declarada concluída nesta rodada.
- Próxima validação autorizada: venda com personalização decimal → refinalização → estoque/caixa → cancelamento idempotente, mais upload/posicionamento e importação de arte Venduss pela UI, sem mudar estágio antes da exportação/checklist.

## Inventário de contratos — não encerrar auditoria geral

`scripts/audit-rpc-contracts.mjs` encontrou 163 nomes RPC literais nos dois frontends. O catálogo `pg_proc` público contém 155; os oito ausentes foram rastreados:

| RPC ausente | Consumidor / efeito |
|---|---|
| `cancel_order_with_personalization_stock` | `src/lib/orderCancellation.ts` tenta e recorre a `order_stock_cancel` existente. Não é a causa do erro de finalização fotografado. |
| `restore_personalization_stock_for_order` | Cancelamento tolera ausência. No cleanup de PaymentFlow, `consumedPersonalizationStock` é const false; esse ramo não executa atualmente. Requer rastrear consumo legado antes de instalar restituição, para não criar estoque que não foi baixado. |
| `prepare_public_personalization_attachment` | Fila antiga por link da equipe: botão anexar mídia chama função inexistente. |
| `complete_public_personalization_attachment` | Conclusão do upload do mesmo fluxo antigo. |
| `update_public_personalization_details` | Edição operacional do card da fila antiga por link. |
| `get_public_personalization_history` | Histórico do mesmo card. |
| `get_admin_product_stats` | Outros tenants; ZERO19/Venduss usam ramo alternativo explícito na página de produtos. |
| `get_public_totem_wheel_winners_today` | Lista de ganhadores do totem/painel. |

As migrações locais históricas existem, algumas ignoradas pelo `.gitignore`, mas não foram aplicadas às cegas. A migração antiga de mídia também substitui acompanhamento/status públicos: aplicar inteira regrediria alterações atuais. Necessário extrair adições, revisar privacidade/autorização, provar contratos e só então publicar. O inventário não cobre nomes dinâmicos nem compatibilidade de todos os argumentos.

## Segurança ainda pendente, independente dos erros das fotos

- `orders` continua sem RLS; consumidores públicos legados precisam ser migrados antes de ativá-la com segurança.
- Policy de `personalization_sales` contém comparação de tenant tautológica (`ut.tenant_id = ut.tenant_id`); exige correção coordenada e testes entre tenants.
- `order_stock_cancel` é SECURITY DEFINER e o corpo inspecionado não valida auth/tenant; auditar grants/consumidores antes de corrigir autorização sem quebrar clientes legados.
- Advisors também apontam view `orders_with_item_count` SECURITY DEFINER e outros avisos. Não confundir esses achados com causa dos bloqueios corrigidos, nem declarar o banco integralmente seguro.

Retomar estas pendências nos dois `PENDENCIAS.md`. Não remover histórico nem desativar RLS para silenciar erros.
