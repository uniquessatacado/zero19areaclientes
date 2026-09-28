# Verificação da integração Venduss–ZERO19

## Fluxo verificado

Pedido Venduss com base ZERO19 → venda pelo custo na ZERO19 → arte vinculada na Personalizações → liberação pelo pagamento do cliente ou decisão administrativa. O repasse da Venduss é um recebimento separado, com caixa/forma e data agendada.

## Evidências

| Limite | Resultado |
| --- | --- |
| Checkout → estoque → pedido integrado | Teste com `create_order` real e ROLLBACK; estoque físico reservado uma única vez. |
| Sem pagamento → produção bloqueada | `awaiting_release`; tentativa de separação rejeitada. |
| Pagamento cliente → produção | `ready_production`; repasse ZERO19 permanece pendente. |
| Repasse → caixa | RPC real de recebimento e reversão testados, sem liberar produção indevidamente. |
| Agenda → alerta PDV | Data de hoje incluída em `due_count` do resumo autorizado. |
| Edição depois de separar | Revisão obrigatória; pagamento anterior não ultrapassa esse bloqueio. |
| Cancelamento | Histórico cancelado e estoque devolvido exatamente uma vez. |
| Reprocessamento | Sem pedidos/itens/personalizações duplicados; falhas ficam na fila com retentativa por minuto. |
| Arte vendida → histórico | Substituição/remoção no catálogo não apaga o arquivo privado/versionamento do pedido anterior. |
| Compilação | Tipos e build NovoVenduss passaram; build e testes Personalizações passaram. |
| GitHub | Código Personalizações `b984077`; NovoVenduss `af7d8769`, ambos enviados. |
| Vercel | 2.17.41, `dpl_GXLvrhLDBeDyFJGzyoag7qwGqsgx`, READY, SHA `b98407708afaafe2bf5313f2949cba4676e0169a`. Domínio oficial HTTP 200/meta/JS confirmados. |
| Interface autenticada | Não verificada visualmente: nenhum navegador conectado disponível. Não confundir testes SQL/build com validação visual. |

## Ativação autorizada

O dono autorizou a migração com ativação controlada e, separadamente, ativar novas vendas e sincronizar os pedidos abertos. Após simulação com rollback, a ativação real sincronizou dois pedidos (um chegou durante o trabalho):

- Venduss #49215 → ZERO19 #49394: R$94 pelo custo, pendente de liberação.
- Venduss #49390 → ZERO19 #49393: R$29 pelo custo; liberação manual real observada em 28/09 às 11:37 UTC; estampa em `ready_production`.

Total a receber inicialmente R$123; lucro ZERO19 zero. Comparação de todos os saldos físicos antes/depois da sincronização não encontrou alteração. Zero erros/retentativas pendentes na conferência posterior.

Os testes sintéticos foram revertidos; apenas pedidos reais autorizados persistiram. Os números de sequência podem ter lacunas decorrentes dos rollbacks.

## Limites e próximos passos

- Confirmar instalação do commit NovoVenduss no servidor administrado pelo dono; não houve deploy desse servidor nesta etapa.
- Validar no navegador desktop/mobile: liberação, recebimento, agenda, miniaturas, acervo e impressão do filme.
- Continuar os itens de `PENDENCIAS.md` em ambos os projetos. Não foram todos encerrados por esta entrega.
- Auditoria identificou problema legado em `public.orders` (RLS desabilitado). Não habilitar às cegas: migrar/validar consumidores públicos e autenticação antes, conforme pendência de segurança registrada.
- Retentativa: cron `venduss-fulfillment-retry`, a cada minuto. A chave privada `venduss_fulfillment_private.settings.enabled` controla o processamento automático; desligá-la não desfaz pedidos, pagamentos ou produção existentes.
