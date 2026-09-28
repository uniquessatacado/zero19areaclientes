# Pedido misto e produção parcial — 28/09/2026

## Causas confirmadas

1. Upload perdia o contexto do item e escolhia o primeiro pedido histórico do cliente. SPORTINGBET foi vinculada ao cancelado #49087, causando rejeição correta na revisão.
2. Card/filtros dependiam exclusivamente da etapa agregada, ocultando fonte pendente e arte pronta de um pedido misto.
3. RPC de exportação avançava TODOS os trabalhos do projeto, não apenas os exportados.
4. Sincronização tratava `asset_id` preenchido como revisão concluída. Teste de exportação parcial encontrou esse avanço indevido de um irmão; regra corrigida e teste repetido.

## Correção

- Upload identifica explicitamente projeto e personalização. Entrada genérica pede a escolha; não usa pedido cancelado nem item de fonte.
- Arte, fonte e produção possuem ações independentes. Pedido aparece em todas as suas etapas pendentes.
- RPC autenticada recebe vendas/posicionamentos selecionados, valida propriedade, vínculo, pausa, cancelamento e etapa. Reexportação não reinicia nem duplica trabalho.
- Concluir uma personalização atualiza somente ela e a venda de origem; resumo do pedido é recalculado. Finalização manual do pedido inteiro continua disponível com aviso explícito.
- Percentual conta personalizações concluídas (prontas para retirada/entregues), não quantidade de camisas nem arquivos adicionados ao filme. Prontas para produzir e em produção aparecem separadas.
- Fila e seletor contam todos os itens ativos do pedido, inclusive já entregues. Página pública apresenta progresso e situação de cada personalização.
- Migrações aplicadas: `20260928180349_partial_personalization_production`, `20260928181352_preserve_unreviewed_art_during_sync` e `20260928181941_preserve_manual_workspace_production_status` (preserva comportamento de projetos oficiais não ZERO19). Nenhuma mudança de financeiro/estoque.

## Recuperação real

SPORTINGBET `ea1610cf-4197-41f0-9255-f359a1c8a497` movida para o projeto #49323 e item Frente/meio, com auditoria em metadata. Arquivos originais/processados e medidas 28 × 4,54 cm preservados. Referência órfã de posicionamento removida; revisão continua necessária, sem aprovação automática. Nenhum filme/job consumia essa arte. JOÃO · 8 continua aguardando fonte; GABRIEL · 7 continua pronto para produzir. #49087 permanece cancelado.

## Evidências e limites

- `partial-production-live-rollback.sql`: 16 asserções no banco real, incluindo rejeição de pendente, identidade desconhecida, chamada legada sem item, replay, conclusão individual, status público, fonte e revisão independentes. ROLLBACK integral.
- `test-mixed-order-actions.mjs`: ações simultâneas, contexto correto e rejeição de pedido histórico/fonte/duplicata.
- `test-order-item-progress.mjs` e Venduss `test-order-tracking.cjs`: 0/33/67/100%, exportação não concluída, cancelados fora da contagem.
- Builds e tipos passaram. Avisos já existentes do build Venduss: chunks grandes, Browserslist antigo e duração Tailwind ambígua.
- Navegador Edge isolado: organizador frente/costas e medidas em 390px/desktop; seletor com três miniaturas 72px, progresso, itens já adicionados e sem overflow. Nenhuma conta real usada.
- Página pública: renderização do componente real com snapshot fictício de hooks; geometria/semântica em navegador. Captura de screenshot desse cenário travou no host; não representa teste autenticado ponta a ponta.
- Advisors: funções novas são SECURITY DEFINER intencionais para atualização atômica entre domínios, sem EXECUTE anon/PUBLIC, com proprietário e identidade verificados. Avisos antigos de RLS permanecem, inclusive `orders`; auditoria geral não concluída. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0007_policy_exists_rls_disabled
- Publicar Personalizações não implanta Venduss. A página pública nova depende da atualização do servidor Venduss pelo Git.

## Publicação

- Personalizações: código `84c9661`, versão **2.17.45**, deployment `dpl_AMUPkLYNKwNau2YagPEeWmec63ME`, produção **READY**, build remoto 22s.
- Domínio confirmado: https://019-personalizacoes.vercel.app — HTTP 200, SHA-256 igual ao build local em index.html, app.js, zero19-pdv-sync.js, order-item-progress.js, production-v217.js e official-order-workflow.js.
- Venduss: código `e44ae6ee` enviado ao GitHub. Servidor mantido pelo dono não foi implantado por esta operação.
- Monitoramento: sem teste autenticado no navegador e sem inspeção de impressão física. Verificações HTTP/artefato e SQL concluídas; não equivale a ausência de todos os erros da aplicação.
