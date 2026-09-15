# 019 Personalizações — Memória do Projeto

> Arquivo canônico de continuidade. Antes de qualquer alteração futura, ler este arquivo inteiro, conferir a versão atual e atualizar a seção **Histórico de versões** antes de publicar.

## 1. Objetivo do sistema

Sistema interno da Zero 19 para centralizar atendimento de empresas/clientes, artes, mockups, orçamentos, produção DTF, equipe, histórico e produtividade. Precisa funcionar bem no celular e no computador e servir também como ponte de arquivos entre os dois.

## 2. Regras de não regressão

1. Nunca remover uma função existente para incluir outra sem registrar e validar a substituição.
2. Alterações visuais devem ser feitas sem quebrar fluxo, banco, upload, orçamento, área pública ou permissões.
3. Antes de publicar: validar sintaxe JavaScript, estrutura do bundle, rotas principais e requisitos marcados como **IMPLEMENTADO** abaixo.
4. Não reintroduzir remoção automática de fundo. Ela foi retirada a pedido do usuário.
5. Não reduzir imagem original quando a opção de qualidade estiver ativa. Ampliação pode ser feita, redução não.
6. Mockup não deve passar por recorte de prancheta nem por ampliação automática.
7. Senha de funcionário nunca deve ser exibida ao administrador. Usar redefinição de senha.
8. Toda ação administrativa relevante deve preservar autoria quando houver suporte no banco.
9. Não publicar alteração nova por cima de uma etapa incompleta. Finalizar/testar a etapa atual primeiro.
10. Toda publicação deve gerar uma entrada nova no **Histórico de versões** deste arquivo.

## 3. Identidade e acesso

- Nome: **019 Personalizações**.
- Tema: escuro, laranja 019, visual limpo e profissional.
- Administrador principal: **Clovis**.
- E-mail administrativo atual: `ussloja@gmail.com`.
- Hospedagem principal: `https://019-personalizacoes.vercel.app`.
- Banco/Storage/Auth: Supabase do projeto já conectado.

## 4. Requisitos funcionais consolidados

### Empresas e atendimento

- **IMPLEMENTADO** criar, editar e excluir empresa.
- **IMPLEMENTADO** nome da empresa, cliente, telefone/WhatsApp, estado/UF, observações.
- **IMPLEMENTADO** status configuráveis.
- **IMPLEMENTADO** status iniciais: Em atendimento; Aguardando chegar o produto para realizar a personalização; Cliente não responde; Desistiu; Remarcado; Finalizado.
- **IMPLEMENTADO** alterar status no card e dentro da empresa.
- **IMPLEMENTADO** alerta após 24h sem mudança de status, exceto Finalizado.
- **IMPLEMENTADO** empresa atrasada sobe na lista e recebe destaque discreto.
- **IMPLEMENTADO** exibir tempo parado em horas/dias.
- **IMPLEMENTADO** botão WhatsApp no card.
- **IMPLEMENTADO** status Desistiu registra data e fica destacado.
- **IMPLEMENTADO** Remarcado pede data/hora e destaca quando chegar o retorno.
- **IMPLEMENTADO** ao sair de status terminal para status ativo, criar novo projeto da mesma empresa.
- **IMPLEMENTADO** responsável atual e usuário que cadastrou a empresa.
- **IMPLEMENTADO** botão “Puxar pra mim”, transferindo responsabilidade e abrindo WhatsApp com saudação.
- **IMPLEMENTADO** área da empresa mostra histórico de projetos e faturamento acumulado.

### Artes, qualidade e produção

- **IMPLEMENTADO** upload de uma ou várias imagens.
- **IMPLEMENTADO** nome individual por arquivo.
- **IMPLEMENTADO** editar nome, tipo e pasta.
- **IMPLEMENTADO** excluir arquivo.
- **IMPLEMENTADO** baixar PNG.
- **IMPLEMENTADO** salvar como imagem.
- **IMPLEMENTADO** visualização em fundo transparente, branco e preto.
- **IMPLEMENTADO** remoção de prancheta transparente pelo limite de pixels visíveis.
- **IMPLEMENTADO** preservação de bordas antialias/alpha para evitar cortar a arte.
- **IMPLEMENTADO** saída PNG com metadata 300 DPI.
- **IMPLEMENTADO** qualidade: Original, 4032px, 6000px e 8192px.
- **IMPLEMENTADO** nunca reduzir original maior que o alvo.
- **REMOVIDO DE PROPÓSITO** remoção automática de fundo.
- **IMPLEMENTADO** mockup separado das artes de produção e sem tratamento automático.

### Pastas e bibliotecas

- **IMPLEMENTADO** pastas por empresa.
- **IMPLEMENTADO** subpastas.
- **IMPLEMENTADO** criar, renomear e excluir pastas.
- **IMPLEMENTADO** modelos de pasta configuráveis.
- **IMPLEMENTADO** pastas padrão: Artes enviadas pelo cliente; Artes prontas; Logo da empresa; Mockups.
- **IMPLEMENTADO** imagem na pasta Logo da empresa aparece como logo do card da empresa.
- **IMPLEMENTADO** biblioteca interna de Artes, sem vínculo com cliente.
- **IMPLEMENTADO** biblioteca interna de Mockups, sem vínculo com cliente.
- **IMPLEMENTADO** bibliotecas aceitam pastas e subpastas e servem para transferência celular ↔ computador.
- **PENDENTE** importação recursiva de pasta do Google Drive por link, preservando subpastas e arquivos originais. Deve ser feito via integração autorizada/OAuth, não por scraping frágil.

### Orçamentos

- **IMPLEMENTADO** orçamento por empresa.
- **IMPLEMENTADO** área pública do cliente mostra orçamento.
- **IMPLEMENTADO** produto, quantidade, prazo de entrega e observações.
- **IMPLEMENTADO** preço total por peça personalizada OU peça + estampas separadas.
- **IMPLEMENTADO** múltiplas estampas por item.
- **IMPLEMENTADO** posições como frente, peito, costas, mangas etc.
- **IMPLEMENTADO** largura em centímetros; altura proporcional.
- **IMPLEMENTADO** catálogo configurável: editar, adicionar e excluir modelos.
- **IMPLEMENTADO** catálogo inicial: 30.1; Oversize Suedine; Oversize 100% algodão; Pima Egípcia; Malha Peruana; Cotton; Dry Fit Premium; Dry Fit com Poliamida.
- **IMPLEMENTADO** faturamento de finalização separado entre camisas, estampas e total.

### Área do cliente

- **IMPLEMENTADO** link compartilhável por empresa.
- **IMPLEMENTADO** cliente vê artes, mockups e orçamento.
- **IMPLEMENTADO** cliente pode baixar arquivos quando habilitado.
- **IMPLEMENTADO** cliente vê vendedor responsável.
- **IMPLEMENTADO** botão de WhatsApp do vendedor.
- **IMPLEMENTADO** horário de atendimento exibido como 9h às 18h.
- **PENDENTE** permitir que o cliente envie/anexe imagem diretamente na área pública, caso isso continue sendo desejado. Hoje a área pública é de visualização/download.

### Equipe e administração

- **IMPLEMENTADO** perfil de administrador e perfis de funcionários.
- **IMPLEMENTADO** administrador convida funcionário com nome, telefone e e-mail.
- **IMPLEMENTADO** funcionário define a própria senha no primeiro acesso.
- **IMPLEMENTADO** redefinição de senha pelo administrador via fluxo seguro.
- **IMPLEMENTADO** funcionários da mesma conta enxergam os mesmos clientes/empresas conforme RLS da equipe.
- **IMPLEMENTADO** usuário que cadastrou e responsável atual aparecem nos cards/empresa.
- **IMPLEMENTADO** histórico/auditoria de ações principais.
- **IMPLEMENTADO** anexos registram quem enviou.
- **IMPLEMENTADO** orçamento registra autoria.
- **IMPLEMENTADO** histórico de login disponível no banco e área administrativa.
- **NÃO IMPLEMENTAR** administrador visualizar senha do funcionário.

### Dashboard e produtividade

- **IMPLEMENTADO** filtros: hoje, ontem, últimos 7 dias, últimos 30 dias, mês passado, mês, data personalizada.
- **IMPLEMENTADO** filtro por vendedor.
- **IMPLEMENTADO** empresas/clientes cadastrados.
- **IMPLEMENTADO** empresas por estado/UF.
- **IMPLEMENTADO** projetos iniciados e finalizados.
- **IMPLEMENTADO** atendimentos ativos em tempo real.
- **IMPLEMENTADO** atendimentos vencidos/atenção +24h.
- **IMPLEMENTADO** desistências.
- **IMPLEMENTADO** faturamento camisas, estampas e total.
- **IMPLEMENTADO** resumo diário na página inicial.
- **IMPLEMENTADO** histórico de atividades no administrativo.

## 5. Pontos arquiteturais importantes

- **Repositório canônico a partir da v2.10:** `uniquessatacado/zero19areaclientes` (branch `main`). Este repositório é a fonte de verdade do código e do `PROJECT_MEMORY.md`.
- **Regra obrigatória antes de alterar:** ler `PROJECT_MEMORY.md` no repositório, identificar a versão atual, concluir a etapa em andamento, criar a nova entrada de versão e só então alterar/publicar.
- **Regra obrigatória após alterar:** commit no GitHub com a versão correspondente antes/ao mesmo tempo da publicação; a produção deve ser rastreável a um commit.
- **Rollback:** se uma versão quebrar produção, voltar para um commit/tag conhecido e só depois reaplicar a correção de forma isolada.
- **Falha resolvida a não repetir:** loaders que baixam chunks compactados e usam `DecompressionStream`/gzip/base64 em tempo de execução causaram `Failed to decode data`/`Failed to fetch` em navegadores reais. A partir da v2.10, o boot deve usar arquivos estáticos normais (`index.html` + `styles.css` + `app.js`) no mesmo deployment. Não reintroduzir decodificação/compressão no navegador para iniciar o app.
- Tabelas do sistema usam prefixo `z19p_` para não misturar com outras aplicações no mesmo Supabase.
- Arquivos ficam no bucket `z19p-assets`.
- O sistema possui RLS para equipe da mesma conta e autoria dos registros.
- Existe RPC pública `z19p_get_public_workspace` para a área do cliente.
- Existe Edge Function `z19p-team-admin` para convites, ativação/desativação e redefinição de senha da equipe.
- O front atual é carregado como bundle estático. Evitar patches temporários duplicando lógica já presente no bundle principal.
- O patch `team-patch.js` criado durante a fase de correção ficou redundante porque as mesmas funções passaram a existir no bundle principal. Na v2.3 ele deve ser neutralizado/removido para reduzir risco de duplicação.

## 6. Checklist obrigatório antes de publicar

- [ ] `node --check app.js`
- [ ] `index.html` não usa `DecompressionStream`, gzip/base64/chunks remotos para iniciar o app
- [ ] `styles.css`, `app.js` e `demo.html` respondem 200 no preview antes de produção
- [ ] confirmar commit correspondente no repositório `zero19areaclientes`
- [ ] busca por opção de remoção automática de fundo deve retornar zero na interface
- [ ] login abre normalmente
- [ ] dashboard carrega sem overflow horizontal
- [ ] filtro de status não sai da tela no mobile
- [ ] card de empresa mostra status, responsável, WhatsApp e ações
- [ ] editar/excluir empresa continua disponível
- [ ] abrir empresa funciona
- [ ] pastas/subpastas continuam funcionando
- [ ] upload de arte mantém recorte/prancheta + opções de qualidade
- [ ] mockup não é processado como arte
- [ ] editar/excluir/baixar arte continua funcionando
- [ ] orçamento abre, salva e aparece na área pública
- [ ] equipe/dashboard continuam acessíveis ao administrador
- [ ] área pública do cliente carrega vendedor, orçamento, mockups e artes
- [ ] nenhuma alteração visual remove função já existente

## 7. Pendências priorizadas

1. **Google Drive**: importar pasta recursivamente, preservar subpastas e arquivos originais.
2. **Upload pelo cliente** na área pública, se confirmado como requisito final.
3. **Consolidar código**: retirar overrides/monkey-patches antigos do `app.js` e gerar uma base única, depois de congelar comportamento atual com testes.
4. **Privacidade de arquivos**: bucket atual usa URLs públicas para facilitar compartilhamento. Evolução futura recomendada: bucket privado + URLs assinadas.
5. **Testes automatizados de smoke** para rotas e principais fluxos.

## 8. Histórico de versões

### v1.0–v1.4 — Base, produção, comercial e organização
- Login/Supabase; empresas; upload/PNG; área do cliente.
- Recorte transparente, 300 DPI, 4032/6000/8192; mockup separado; remoção automática de fundo retirada.
- Status, catálogo, orçamento, WhatsApp; pastas/subpastas, Logo da empresa, Artes prontas/cliente e bibliotecas Artes/Mockups.
- Alerta +24h e prioridade visual das pendências.

### v2.0–v2.4 — Equipe, indicadores e estabilização
- Admin/funcionários, autoria, responsável, Puxar pra mim, histórico, projetos recorrentes, Desistiu/Remarcado, faturamento e dashboard.
- UF, empresas por estado, totais por cliente e vendedor na área pública.
- Ajustes de RLS/Storage/auditoria/primeiro acesso.
- Criado `PROJECT_MEMORY.md`; `Cotton` corrigido no catálogo.
- Revertida compactação global que havia degradado o layout; visual anterior restaurado sem remover funções.

### v2.5–v2.7 — Layout canônico, navegação e estabilidade
- O ZIP de layout aprovado virou a referência visual canônica; `styles.css` de referência SHA-256 `1d7789662daaf1336d83e66615b2a97a3db808c4a5d878463f58c9f0e1956400`. Funções novas devem entrar sem redesign global.
- Corrigida navegação de Equipe/Dashboard/Produtividade: `hashchange` chama a implementação atual de `renderRoute`; `nav()` rerenderiza a rota atual.
- Placeholder `019` não é o logo oficial; substituir quando o arquivo oficial da Zero 19 for fornecido.
- Corrigida arquitetura que buscava deployment Vercel antigo e gerava `Failed to fetch`; não voltar a depender de deployment antigo.
- Empresas não finalizadas mostram tempo no status e alerta +24h; nomes de pastas quebram linha e não usam reticências.
- Layout, orçamento, status, equipe, dashboard, artes, mockups e demais funções preservados.

### v2.8 — Biblioteca de vídeos de demonstração e WhatsApp
- Criado ambiente interno para vídeos de demonstração de qualidade, com pastas/subpastas, upload MP4/MOV/WEBM, nome, visualização, download e exclusão.
- Dashboard recebeu card **Vídeos** ao lado de Artes e Mockups, preservando o layout canônico.
- Bucket `z19p-assets` passou a aceitar `video/mp4`, `video/quicktime` e `video/webm`, limite atual de 50 MB.
- Botão **Demonstrar** abre empresas/clientes cadastrados e permite iniciar WhatsApp do cliente.

### v2.9 — Preview público de demonstrações e envio múltiplo no WhatsApp
- `z19p_assets` recebeu `share_token` e foi criada RPC pública `z19p_get_public_video_demo(uuid)` para links públicos de demonstração.
- Cada vídeo possui nome + descrição para o cliente.
- `Demonstrar` permite selecionar uma ou várias demonstrações e depois o cliente.
- WhatsApp gera mensagem formatada com emoji, negrito, nome/descrição de cada demonstração e link individual.
- `demo.html?t=<share_token>` mostra preview responsivo, reproduz o arquivo original em alta qualidade e oferece **Baixar vídeo**.
- **Problema encontrado:** o boot v2.9 usou chunks/base64 + gzip + `DecompressionStream`, causando `Failed to decode data` em navegador real. Essa arquitetura está proibida daqui em diante.

### v2.10 — GitHub como fonte de verdade + boot estático sem decode
- Pedido: parar de perder contexto/código, versionar tudo no repositório `uniquessatacado/zero19areaclientes`, manter o `PROJECT_MEMORY.md` junto do código e permitir rollback seguro.
- Causa do erro em produção: a v2.9 inicializava o sistema baixando chunks/base64 compactados e decodificando gzip com `DecompressionStream` no navegador. Em alguns navegadores/dispositivos isso resultou em `Failed to decode data` e impediu o sistema de abrir.
- Correção arquitetural: o boot novo não pode usar gzip/base64/DecompressionStream. Durante a migração, os arquivos-fonte podem ser particionados no repositório, mas devem ser carregados como texto simples e concatenados sem compressão; o objetivo final é `index.html` + `styles.css` + `app.js` estáticos no mesmo deployment.
- Cache deve ficar no-cache/no-store durante estabilização.
- Continuidade: funcionalidades v2.9 permanecem, incluindo tempo no status, nomes completos de pastas, biblioteca de vídeos, descrição, seleção múltipla de demonstrações, WhatsApp e preview público.
- WhatsApp: texto deve listar cada demonstração separadamente, com nome, descrição e link individual.
- Preview de vídeo: usar arquivo original em alta qualidade, carregamento rápido e botão de download.
- Processo permanente: nenhuma alteração futura deve ser publicada sem atualizar este arquivo e o GitHub; problemas resolvidos entram aqui com causa + prevenção.
- **Observação de infraestrutura:** a tentativa de usar GitHub Actions para reconstruir automaticamente o snapshot falhou antes de executar qualquer step (`runner_id=0`, `steps=[]`). Não depender desse workflow para publicar ou preservar o código; manter os arquivos versionados diretamente no repositório.

## 9. Próxima versão

Ao receber a próxima solicitação, criar **v2.11** neste arquivo antes de publicar e preservar o layout canônico e todas as regras de não regressão da v2.10.
