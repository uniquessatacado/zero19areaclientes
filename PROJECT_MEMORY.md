# 019 Personalizações — PROJECT_MEMORY

> **LEITURA OBRIGATÓRIA ANTES DE QUALQUER ALTERAÇÃO.** Este arquivo é a fonte canônica de continuidade. Antes de mexer no sistema: ler tudo, identificar a versão atual, preservar o layout e as funções existentes, concluir qualquer etapa aberta e registrar a próxima versão. Depois: validar, commitar no GitHub e somente então publicar no Vercel. Nunca chamar uma versão de “publicada” antes de o domínio principal realmente servi-la.

## 1. Infraestrutura e fonte de verdade

- Repositório oficial: `uniquessatacado/zero19areaclientes`, branch `main`.
- Produção: `https://019-personalizacoes.vercel.app`.
- Vercel: projeto `019-personalizacoes`, id `prj_cpZoh49CdDlYP0h82gwXCbR4nyw3`, team `team_88LTzdT7GLfKgRlzjvr1eF8c`.
- Supabase: `kedggjyerexnzmipaick`.
- Tabelas desta aplicação usam prefixo `z19p_`.
- Bucket: `z19p-assets`.
- Visual canônico: tema escuro + laranja Zero 19, responsivo, sem compactação global. A referência visual aprovada vem da fase v2.5.
- Logo oficial: `zero19-logo.png`. O zero é estilizado/escrito; nunca substituir por texto `019` simulando a marca.
- Versão atual em produção: **v2.13**.
- Deployment Vercel v2.13: `dpl_3hixXFzPha6F6XgyqZgg9sLAULQo` — READY / production.
- Snapshot de runtime v2.13: `runtime-v213/` (10 partes + manifest SHA-256).
- Snapshot de páginas comerciais v2.13: `release-v213/` (4 partes + manifest SHA-256).
- Os chunks são lossless e servem para rollback/reconstrução. Não alterar um snapshot de versão depois de publicado.

## 2. Regras absolutas de não regressão

1. Nunca remover função existente para encaixar função nova sem registrar explicitamente a substituição.
2. Nunca redesenhar globalmente a interface para uma feature. Mudanças devem ser localizadas.
3. Se chegar uma nova alteração enquanto outra está em andamento, terminar a etapa atual antes de começar a próxima.
4. Ler este MD antes de toda alteração e atualizar este MD após toda correção relevante.
5. Toda versão de produção precisa de commit rastreável no GitHub e deployment READY no Vercel.
6. Não reintroduzir remoção automática de fundo.
7. Não reduzir arte original quando ela já for maior que o alvo escolhido.
8. Mockup não passa por recorte de prancheta nem upscale automático.
9. Senha de funcionário não pode ser exibida ao administrador; usar convite/redefinição segura.
10. Preservar autoria, responsável atual e histórico/auditoria.
11. Nunca usar `DecompressionStream` nativo no boot. Já causou `Failed to decode data` no iPhone.
12. Nunca montar o app buscando um deployment Vercel antigo. Já causou `Failed to fetch`.
13. Se usar snapshot em chunks, validar todas as partes e o manifest antes de publicar.
14. Não usar CSS global agressivo/`!important` que destrua o layout aprovado.
15. Rotas Equipe/Dashboard/Produtividade devem trocar a tela no clique, sem refresh manual.
16. Mobile não pode ter overflow horizontal.
17. Nomes de pasta devem aparecer completos, sem `...`; reduzir fonte/quebrar linha.
18. Exclusão de empresa não pode manter FK inválida no audit log; histórico deve preservar dados sem bloquear delete.
19. Uma resposta só pode dizer “publicado” depois de confirmar produção READY + aliases + HTTP 200 do domínio canônico + número da versão correta.

## 3. Empresas, clientes e atendimento

Implementado: criar/editar/excluir empresa; empresa/cliente/WhatsApp/UF/observações; status configuráveis; Em atendimento, Aguardando produto, Cliente não responde, Desistiu, Remarcado e Finalizado; tempo no status para não-finalizados; alerta e ordenação após 24h sem mudança de status; WhatsApp no card; Remarcado com retorno; Desistiu com data; criador e responsável atual separados; `Puxar pra mim`; reabrir Finalizado cria novo projeto; histórico de projetos e faturamento interno.

## 4. Artes, mockups, pastas e bibliotecas

Implementado: upload múltiplo; renomear/mover/excluir; PNG 300 DPI; recorte de prancheta transparente preservando alpha; Original/4032/6000/8192 sem reduzir original maior; fundos de preview; bibliotecas Artes e Mockups; pastas/subpastas; modelos de pasta; Logo da empresa; nomes completos na lateral. Remoção automática de fundo foi removida de propósito.

Pendente independente: integração Google Drive recursiva via OAuth/API. Não fazer scraping frágil.

## 5. Orçamentos e produtos

Implementado: orçamento por empresa; produto, quantidade, prazo e observações; peça personalizada total ou peça + estampas; múltiplas estampas; medidas; catálogo configurável; faturamento peça/estampa/total; área pública do cliente. Catálogo inclui 30.1, Oversize Suedine, Oversize 100% algodão, Pima Egípcia, Malha Peruana, Cotton, Dry Fit Premium e Dry Fit com Poliamida.

A partir da v2.13, a Demonstração de Qualidade aponta para o mesmo `z19p_products` usado no orçamento, e o preço da faixa de quantidade pode preencher automaticamente o preço da peça.

## 6. Área pública, equipe e produtividade

Área do cliente: link compartilhável, orçamento, artes, mockups, downloads habilitados, vendedor responsável, WhatsApp e horário 9h–18h. v2.12+ adiciona acesso a Demonstrações de Qualidade e Portfólio.

Equipe: administrador + funcionários, convite por nome/telefone/e-mail, senha definida pelo funcionário, redefinição segura, base compartilhada conforme RLS, auditoria, autoria, responsável atual. Administrador nunca vê senha.

Produtividade: hoje/ontem/7/30 dias/mês passado/mês/data personalizada, vendedor, empresas, UF, projetos iniciados/finalizados, ativos, status, +24h, desistências, faturamento e atividade.

## 7. v2.13 — Demonstrações de Qualidade

- Landing page pública única `/qualidades.html`, com link geral e deep-link por produto.
- Produto, qualidade do tecido, composição, descrição, medidas e preços.
- Faixas padrão: 1–4, 5–19, 20–49, 50+; editáveis/adicionáveis.
- Cada qualidade: máximo 1 vídeo + 3 fotos.
- Vídeo até 100 MB.
- Vídeo entra em autoplay quando visível, pausa ao sair e nunca toca junto com outro.
- O código tenta autoplay com som. Safari/iOS pode bloquear áudio automático; nesse caso cai para mudo e o visitante ativa no controle do próprio vídeo.
- Curtida por produto com deduplicação aproximada por hash de IP; IP puro não é armazenado.
- Comentário pede nome + WhatsApp + texto; administrador pode mostrar/ocultar e responder no WhatsApp.
- Filtro por mais baratos e mais curtidos.
- Compartilhar catálogo inteiro ou produto específico, baixar vídeo e ver medidas.
- Templates WhatsApp configuráveis para catálogo completo e produto específico, com placeholders `{cliente}`, `{vendedor}`, `{produto}`, `{link}`.

## 8. v2.13 — Portfólio / Provas Sociais

- Página pública `/portfolio.html`.
- Case pode ser associado a empresa existente.
- Máximo 1 vídeo + 3 fotos por case.
- Ordem automática incremental 0,1,2... e editável.
- Vídeo segue autoplay/pause por viewport e controle individual de som.
- Curtidas públicas por trabalho.
- Compartilhar página/trabalho.
- Logo da empresa pode ser reutilizado quando disponível.

## 9. v2.13 — Estampas e criação de arte

- Regras por tipo de peça: camisa normal ou camisa de time.
- Modos: por tamanho, por caractere/número e personalização especial.
- Posições: peito esquerdo, peito direito, peito central, barriga, manga direita, manga esquerda, nuca, costas, mega frente e mega costas.
- Cada regra guarda largura/altura máximas e preços por faixa de quantidade.
- Preço avulso e preço combinado; para camisa de time, preço por caractere/número/especial quando aplicável.
- Mockup visual simples de camiseta no cadastro e no orçamento mostrando posição/tamanho aproximados.
- Taxa de criação/preparação de arte por arte distinta.
- Arte pronta PNG sem fundo pode ficar sem cobrança.
- Configuração de faixa a partir da qual a criação pode virar brinde.

## 10. v2.13 — Comissões

- Sistema global liga/desliga.
- Dia da semana de pagamento configurável.
- Regra por vendedor + faixa de quantidade.
- Base de cálculo: total, produto, estampa ou split (percentuais diferentes para produto e estampa).
- Prévia de comissão aparece durante orçamento.
- Comissão só nasce quando orçamento é marcado como pago.
- Fluxo: pendente → administrador aprova ou recusa → pode marcar como paga.
- Vendedor vê resumo da própria comissão na página inicial quando o sistema está ativo.
- Admin pode dividir comissão entre vendedor original e outros usuários que ajudaram.
- Rateio por percentual deve somar 100%; opção dividir igualmente.
- O valor total da comissão não muda; apenas a distribuição.
- Resumo individual considera somente a parcela daquele usuário.
- Não alterar divisão depois de paga ou recusada.

Tabelas principais: `z19p_commission_config`, `z19p_commission_rules`, `z19p_commissions`, `z19p_commission_shares`, `z19p_print_rules`, `z19p_print_rule_prices`, `z19p_artwork_fee_settings`, `z19p_portfolio_likes`.
RPCs: `z19p_mark_quote_paid`, `z19p_set_commission_split`, `z19p_get_my_commission_summary`.

## 11. Bugs importantes já resolvidos

- Layout minúsculo/destruído: causado por CSS global agressivo. Não repetir.
- Equipe/Dashboard mudavam hash mas só abriam após refresh: listener antigo de `renderRoute`. Corrigido com resolução dinâmica.
- `Failed to fetch`: dependência de deployment histórico. Não repetir.
- `Failed to decode data`: `DecompressionStream` no boot + bundle incompleto. Não repetir.
- Tela preta no boot: erro de sintaxe + tratamento apagando loading antes de render. Boot deve manter erro visível.
- Excluir empresa falhava por FK no audit log. Corrigido no banco.
- v2.13 pré-publicação: `portfolio.html` usava `EDGE` sem declaração. Corrigido antes da release.

## 12. Validações v2.13

- `node --check app.js`: aprovado.
- Scripts inline de `index.html`, `demo.html`, `qualidades.html`, `portfolio.html` e `comercial-admin.html`: aprovados.
- `DecompressionStream`: ausente.
- Bucket `z19p-assets`: 100 MB, PNG/JPEG/WEBP/MP4/MOV/WEBM.
- Edge Function `z19p-quality-public`: ACTIVE v3; like, comment e portfolio_like.
- RPCs públicos do catálogo e portfólio retornam dados corretamente.
- Catálogo smoke: 4 faixas e produto 30.1 vinculado ao produto do orçamento.
- Deployment de produção: `dpl_3hixXFzPha6F6XgyqZgg9sLAULQo`, READY.
- Domínio canônico respondeu 200 com `z19-version=2.13`.
- `/qualidades.html`, `/portfolio.html`, `/comercial-admin.html` e `/demo.html`: HTTP 200.

## 13. Histórico de versões relevante

- v2.5: layout canônico aprovado.
- v2.6: navegação SPA corrigida.
- v2.7: tempo no status e nomes completos de pastas.
- v2.8–2.9: biblioteca de vídeos e preview público.
- v2.10–2.10.2: GitHub fonte de verdade, recuperação de boot e correções de carregamento.
- v2.11: exclusão segura de empresa/audit log.
- v2.12: catálogo de qualidades, portfólio e identidade oficial.
- **v2.13: catálogo unificado com orçamento, 100 MB, mídias 1+3, likes, WhatsApp configurável, estampas, arte, comissões e divisão de comissão. Publicada em produção em 16/09/2026.**

## 14. Regra para a próxima alteração

A próxima versão é **v2.14**. Antes de mexer: ler este arquivo inteiro. Depois de mexer: validar, registrar a causa/correção/prevenção de qualquer bug, atualizar este MD, commitar e só então publicar. Produção só é considerada atualizada após Vercel READY e verificação do domínio principal.
