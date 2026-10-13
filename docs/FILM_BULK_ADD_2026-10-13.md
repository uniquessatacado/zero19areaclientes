# 019 2.17.72 — inclusão em lote e sessão

Pedido: selecionar centenas de aplicações e adicionar ao filme sem aguardar a fila inteira ser consultada por estampa; mostrar progresso, tratar JWT vencido e evitar duplicações.

Base: código publicado 5ea28f76f99fb399bc25a034504be4638f45b90d (2.17.71). A correção do QR continua preservada.

## Causa comprovada no código
O seletor percorria todos os selecionados em série. Cada `prepareVdrFilmItem` executava `pendingVdrFilmRows`, que chama `load(true)`, consultando e reconstruindo a fila inteira. Venduss fazia o mesmo. Não havia progresso por item. A renovação/repetição limitada de leitura após JWT vencido não existia nesse fluxo.

## Mudanças
- Consulta somente IDs selecionados, em blocos de 100 e até três consultas simultâneas. Arquivos compartilhados são consultados uma vez, sem misturar os vínculos dos pedidos.
- Uma segunda conferência impede incluir pela seleção antiga as aplicações concluídas pelo QR ou alteradas durante a preparação.
- Sessão conferida antes das leituras, renovação antecipada e uma retentativa somente para leitura que falhou por JWT vencido. Nenhuma extensão artificial de validade, segredo novo, desativação de RLS ou repetição cega de gravações.
- Progresso por fase/item, limites de espera e botão Interromper. Falhas individuais ficam selecionadas; as aplicações válidas podem entrar sem duplicar na próxima tentativa.
- A inclusão grava o rascunho local, exibe os itens e hidrata miniaturas depois. O encaixe pesado desse lote começa ao tocar **Atualizar filme**. Não gera/exporta filme, não conclui produção e não consome estoque.
- Prévia das escritas do lote limitada a 420 pixels; receita, medidas físicas, fontes, cor, PNG vendido e exportação final permanecem inalterados. Importação de parceiro ainda não importado usa o mecanismo existente, sem recarregar a fila por item; gravações não são repetidas automaticamente.

## Verificação
26 testes automatizados locais passaram, incluindo lote de 386 (9 consultas simuladas), 1234 itens, JWT, autorização, alteração por outro aparelho, preservação de PNG/medidas, parcial, clique duplo e cancelamento. O tempo do teste é simulado e não representa o tempo do aparelho/internet da loja.
O build executa também todos os testes anteriores e verifica as âncoras e o construtor original da arte para o filme. Publicação somente após Vercel READY e conferência do domínio. Nenhum pedido real usado como teste de escrita.

## Fontes técnicas consultadas
- Supabase JavaScript: auth.refreshSession / auth.startAutoRefresh, documentação oficial consultada em 13/10/2026.
- Não há migration; não altera o servidor do NovoVenduss.
