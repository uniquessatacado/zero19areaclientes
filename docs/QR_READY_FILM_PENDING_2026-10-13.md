# QR pronto e fila do filme — 13/10/2026

## Pedido do dono
Quando o QR confirma uma peça pronta (inclusive usando estampa que já existia), suas aplicações não devem continuar sendo oferecidas em Aguardando produção. Não gerar filme, alocação, consumo ou impressão fictícios para fazer a baixa.

## Evidência consultada
Base Git anterior: 6ebe1b672e2d580b9980e5ab0e10a1a4a0f07510 (019 v2.17.70). Banco compartilhado novoVENDUSS, somente loja ZERO19.

Na consulta de 13/10 havia 42 confirmações de produção pelo QR. Nenhuma delas tinha trabalho principal em etapa aberta. Também não havia trabalho ready_production cujo estado canônico do QR fosse READY, SHIPPED, DELIVERED ou CANCELLED. Não havia posicionamentos em production_state=pending na conta consultada. Portanto não se executou baixa em massa nem se declarou removido um pedido inexistente na consulta.

Havia 21 posicionamentos históricos em production vinculados a aplicações delivered; não estavam na lista pending e não foram alterados nesta correção.

A RPC zero19_confirm_order_produced já conclui os work items e os posicionamentos relacionados na mesma transação. Essa regra e as permissões existentes foram preservadas. A lista unificada do filme consulta o banco ao abrir, mas sua seleção aberta não acompanhava mudanças posteriores do QR/outro dispositivo. Não foi reproduzida uma divergência persistente de pedido concreto nesta sessão; a correção cobre essa janela de informação desatualizada.

## Correção candidata 2.17.71
- Consulta autenticada, limitada à conta e aos IDs reais das aplicações, a cada 10 segundos enquanto o seletor está visível e ao voltar à aba.
- Fonte, estúdio e Venduss só continuam disponíveis se o work item ainda estiver em ready_production. Posicionamentos só continuam se pending.
- Retira da lista e da seleção os itens que saíram da etapa; mantém os demais pedidos e as montagens já salvas intactos.
- Revalida antes de Adicionar selecionados. Sem conseguir consultar o estado atual, bloqueia a inclusão baseada na lista velha e permite tentar novamente.
- Não grava pedidos, pagamentos, estoque, etiquetas, arquivos, exportações ou consumo. Reabrir explicitamente um trabalho volta a oferecê-lo numa nova consulta.
- Limpa intervalos e listeners ao fechar a lista ou trocar de página/conta.

## Compilação
A fonte-base grande continua preservada pelo pipeline existente. scripts/build-pending-status.mjs conecta o novo verificador no dist com uma âncora única verificada, valida o JavaScript e atualiza o grafo compilado para 2.17.71. Falha se a versão-base ou a âncora mudarem. Não há modificação de código em runtime.

14 testes Node novos passaram localmente, com consultas e eventos simulados: pronto, entregue, cancelado, parcial, mesma arte em pedidos distintos, reabertura, 251 itens paginados, falha de rede, troca de conta e clique revalidado sem duplicação. Os testes são executados também no build. Não equivalem a um teste manual autenticado no navegador da loja.

Deploy só deve ser tratado como publicado após conferir o build e o destino da Vercel. Não há migration nem alteração necessária no servidor do NovoVenduss neste pacote.
