# Organizar artes e previsão — 28/09/2026

## Escopo e causas comprovadas

- O organizador selecionava sempre o primeiro item do pedido. Em #49322, a arte `Costas · meio` ficou vinculada também ao item `Peito esquerdo`.
- O observador de fechamento começava antes da consulta assíncrona das posições: após 180 ms sem modal, considerava a etapa encerrada. Isso permitia conclusão antecipada/sobreposição.
- A abertura lia apenas medidas originais do PDV e ignorava medidas do upload e perfil já salvo.
- Funcionários Personalizações não tinham vínculo `user_tenants` Venduss e não podiam ler os originais do bucket `personalization-artwork`. Confirmado por SELECT sob os perfis reais, antes da correção.
- Um `pausedCount` maior que zero anulava todos os horários previstos. A carga de trabalho já era reservada, mas a interface ocultava a previsão.
- O grid distribuía altura sobrando nas linhas dos cards; o flex do prazo esticava os balões.

## Correções

- Lista das artes/posições do pedido, com miniaturas limitadas, status e ação por arte. A importação exibe espera e erros; revisão preserva os outros itens.
- Arte originária do PDV fica presa ao seu `personalization_sale_id`; proteção adicional na RPC e no INSERT/UPDATE do posicionamento.
- Medida inicial: perfil salvo → posicionamento salvo → metadados salvos → upload → PDV → padrão apenas se não existir medida. Reabrir/revisar atualiza o posicionamento pendente, sem duplicá-lo.
- Encerramento explícito de cada modal; aguardar abertura e salvamento antes da próxima arte. Fechar não marca arte como pronta.
- Permissão SELECT adicional somente para equipe ativa ZERO19 ler arquivos vinculados aos seus trabalhos. Não libera bucket público nem INSERT/UPDATE/DELETE dos originais do PDV.
- Pausa individual mantém carga reservada e aviso, mas não bloqueia a previsão geral. Prazo prometido/contagem regressiva seguem correndo; manutenção global continua diferenciada.
- Cards alinhados pelo topo e balões com altura de conteúdo, sem alterar a regra de vencimento.
- Salvar pela página inicial não abre inadvertidamente um ambiente visitado anteriormente.

## Banco aplicado

- `20260928160350_guard_zero19_artwork_order_item_identity.sql`.
- `20260928161003_allow_personalization_team_read_linked_pdv_artwork.sql`.
- Reparo pontual #49322 em `scripts/repair-order-49322-artwork-identity.sql`, com locks, pré-condições e histórico em metadata: peito esquerdo → arte recebida; costas → aguardando produção; posicionamento das costas associado ao item certo. Originais, estoque, pagamentos e promessas não foram alterados. Não havia filme/rascunho/exportação contendo a arte.
- A largura salva de **35 cm foi preservada**. O PDV original registra 28 cm; pergunta enviada ao dono, sem resposta no momento do reparo. Não reduzir automaticamente.
- Consulta pós-reparo: zero vínculos ativos com `asset.metadata.personalization_sale_id` diferente do item.

## Evidências

- `scripts/test-order-artwork-identity.mjs`: medidas, upload, proporção, perfil anterior, identidade frente/costas e referência ausente.
- `scripts/test-production-scheduler.mjs`: pausa mantém previsão e carga, novo pedido depois do backlog, manutenção global continua bloqueando, etapas/coortes preservadas. Mesmo planejador nos dois repositórios.
- `scripts/artwork-organizer-browser-qa.mjs`: navegador Edge isolado, desktop 1280×800 e mobile 390×844. Código real com banco e renderização da fotografia simulados. Atraso de 420 ms não encerra a tela; duas artes geram duas chamadas com referências diferentes; reabrir não duplica; sem overflow horizontal; balão 25,75 px mesmo com vizinho alto.
- `scripts/artwork-identity-live-rollback.sql`: 11 verificações SQL reais para admin e dois funcionários; vínculos errados bloqueados, corretos aceitos. ROLLBACK.
- `scripts/pdv-source-read-live-rollback.sql`: 6 verificações SQL reais; ambos os originais legíveis pela equipe, arquivos desvinculados/outro tenant bloqueados para funcionários e usuário desconhecido sem acesso. ROLLBACK.
- Build Personalizações (inclui toda a suíte determinística), tipos e build Venduss passaram. Avisos preexistentes do Venduss: Browserslist antigo, classe de duração ambígua e chunks grandes.

## Limites e acompanhamento

- Não foi executada uma venda real nem impressão/exportação real para testar esta correção. Navegador autenticado da equipe não está conectado; visual validado em página isolada + permissões e vínculos no banco real.
- Auditoria Supabase ainda indica riscos preexistentes fora deste patch, incluindo RLS desativado em `orders` e tabelas TAIVEND. Não ativar RLS indiscriminadamente durante operação: mapear consumidores/policies antes. [Orientação do auditor](https://supabase.com/docs/guides/database/database-linter?lint=0007_policy_exists_rls_disabled).
- Publicação desta versão: registrar confirmação de Git/Vercel após o deploy. Não confundir estes cinco problemas com conclusão de todo o backlog.
