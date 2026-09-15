# 019 Personalizações — Memória Canônica do Projeto

> **LEITURA OBRIGATÓRIA ANTES DE QUALQUER ALTERAÇÃO.** Este arquivo é a fonte de continuidade do projeto. Antes de mexer no código: ler tudo, identificar a versão atual, concluir qualquer etapa aberta, registrar a próxima versão e preservar todas as funções já implementadas. Depois: validar, commitar no GitHub e só então publicar.

## 1. Fonte de verdade e infraestrutura

- Repositório oficial: **`uniquessatacado/zero19areaclientes`**, branch **`main`**.
- Produção: **`https://019-personalizacoes.vercel.app`**.
- Projeto Vercel: `019-personalizacoes` / `prj_cpZoh49CdDlYP0h82gwXCbR4nyw3`.
- Supabase project id: `kedggjyerexnzmipaick`.
- Tabelas desta aplicação usam prefixo `z19p_`.
- Bucket: `z19p-assets`.
- Administrador principal atual: **Clovis**.
- E-mail administrativo atual: `ussloja@gmail.com`.
- Nome do sistema: **019 Personalizações**.
- Visual aprovado: tema escuro, laranja Zero 19, profissional, responsivo e sem compactação exagerada.
- O ZIP/layout aprovado na fase v2.5 é a referência visual; funcionalidades novas devem entrar sem redesenhar globalmente a aplicação.
- O placeholder digitado `019` **não é o logo oficial**. Quando o arquivo oficial for fornecido, substituir preservando o logo Zero 19 em que o zero é escrito/estilizado.

## 2. Regras absolutas de não regressão

1. **Nunca remover uma função existente para adicionar outra** sem registrar explicitamente a substituição e validar o impacto.
2. **Nunca redesenhar globalmente o layout** para encaixar uma função nova. Alterações devem ser localizadas.
3. Se o usuário mandar nova alteração enquanto outra está em andamento: **terminar a etapa atual primeiro e depois iniciar a próxima**.
4. Antes de cada alteração, ler este MD; depois registrar aqui causa, correção e prevenção de qualquer bug descoberto.
5. Toda versão publicada deve ter commit correspondente no GitHub. Produção deve ser rastreável e permitir rollback por commit/deployment.
6. Não reintroduzir remoção automática de fundo. Foi retirada a pedido do usuário.
7. A qualidade de imagem nunca deve reduzir uma original que já seja maior que o alvo.
8. Mockup não passa por recorte de prancheta nem ampliação automática.
9. Senha de funcionário nunca deve ser exibida ao administrador; usar convite/redefinição segura.
10. Toda ação administrativa relevante deve preservar autoria quando houver suporte no banco.
11. **Nunca reintroduzir `DecompressionStream` nativo no boot.** Ele causou `Failed to decode data` em navegador real.
12. **Nunca buscar um deployment Vercel antigo para montar a aplicação.** Isso já causou `Failed to fetch`.
13. Não publicar bundle incompleto. Se o boot usar bundle versionado, verificar todas as partes antes da publicação.
14. Não aplicar CSS global com muitos `!important` sobre a aplicação; isso já destruiu o layout aprovado.
15. A navegação SPA deve trocar a tela no clique; não pode depender de atualizar manualmente a página.
16. No mobile, nenhum filtro, card, toolbar, formulário ou botão pode estourar horizontalmente.
17. Nomes de pastas devem aparecer completos; não esconder com `...`. Reduzir fonte/quebrar linha quando necessário.

## 3. Empresas, clientes e atendimento

### Implementado
- Criar, editar e excluir empresa.
- Campos: empresa, cliente, telefone/WhatsApp, UF/estado, observações.
- Status configuráveis no menu Configurações.
- Status padrão: **Em atendimento**, **Aguardando chegar o produto para realizar a personalização**, **Cliente não responde**, **Desistiu**, **Remarcado**, **Finalizado**.
- Alterar status no card e dentro da empresa.
- Mostrar tempo no status em empresas não finalizadas: horas; depois dias + horas.
- Após 24h sem mudança de status, empresa sobe para o topo e recebe alerta visual discreto até o status mudar.
- Botão WhatsApp no card.
- `Desistiu` registra/destaca a data.
- `Remarcado` exige data/hora do retorno e destaca quando o retorno vence.
- Quem cadastrou a empresa e responsável atual aparecem separados.
- Botão **Puxar pra mim** transfere a responsabilidade para o usuário logado e abre WhatsApp com saudação de continuidade.
- Se alguém diferente assume o atendimento, manter quem cadastrou originalmente e atualizar somente o responsável atual.
- Alterar de Finalizado para um status ativo representa **novo projeto** da mesma empresa, preservando histórico anterior.
- Perfil interno da empresa mostra histórico de projetos e quanto o cliente já gastou em camisas, estampas e total.
- Área pública do cliente não precisa expor histórico financeiro acumulado interno.

### WhatsApp ao assumir atendimento
Mensagem deve ser amigável, usando cliente e vendedor, no sentido de: “Olá, [cliente], estou responsável pelo desenvolvimento do seu projeto agora. Vamos continuar por aqui. Sou [vendedor] da Zero 19.”

## 4. Artes, imagens e produção DTF

### Implementado
- Upload de uma ou várias imagens.
- Nome individual por arquivo.
- Editar nome, tipo e pasta.
- Excluir arte.
- Baixar PNG / salvar como imagem.
- Preview em fundo transparente/checker, branco ou preto.
- Remoção de prancheta transparente pelo limite real dos pixels visíveis, preservando bordas antialias/alpha para não cortar arte.
- PNG com metadata 300 DPI.
- Qualidade: **Original**, **4032 px**, **Ultra 6000 px**, **Máxima 8192 px**.
- Nunca reduzir arquivo original maior que o alvo escolhido.
- Remoção automática de fundo: **REMOVIDA DE PROPÓSITO**.
- Mockup é separado das artes de produção e mantém composição original.

## 5. Pastas, subpastas e bibliotecas

### Implementado
- Pastas por empresa.
- Subpastas ilimitadas pela estrutura atual.
- Criar, renomear, mover e excluir pastas.
- Configurações de **Pastas padrão** para definir o que nasce em cada nova empresa.
- Padrões atuais: **Artes enviadas pelo cliente**, **Artes prontas**, **Logo da empresa**, **Mockups**.
- Arquivo na pasta **Logo da empresa** passa a ser usado no card da empresa no lugar do placeholder.
- Nomes de pasta precisam ser legíveis por inteiro na lateral/mobile.
- Biblioteca interna **Artes** sem vínculo com cliente, com pastas/subpastas para organizar Nike, Adidas, política, times etc.
- Biblioteca interna **Mockups** sem vínculo com cliente.
- Bibliotecas servem como ponte celular ↔ computador: subir de um dispositivo e baixar no outro.

### Pendente
- **Google Drive**: importar uma pasta por link/autorização, preservar subpastas e arquivos originais recursivamente. Ex.: Política → Bolsonaro/Lula. Fazer via integração Google Drive/OAuth, não scraping frágil.

## 6. Orçamentos

### Implementado
- Orçamento por empresa e visualização organizada na área pública do cliente.
- Produto/camiseta, quantidade, prazo de entrega e observações.
- Preço por unidade.
- Dois modos: valor total por peça já personalizada OU peça + estampas separadas.
- Múltiplas estampas por item.
- Posições: frente, meio do peito, ponta do peito esquerda/direita, costas, manga esquerda/direita e combinações.
- Medida principal por **largura em cm**, altura proporcional.
- Editar/adicionar/excluir produtos no catálogo.
- Produtos padrão: **30.1**, **Oversize Suedine**, **Oversize 100% algodão**, **Pima Egípcia**, **Malha Peruana**, **Cotton**, **Dry Fit Premium**, **Dry Fit com Poliamida**.
- Faturamento final separado em camisas, estampas e total.
- Campos numéricos no mobile devem ser simples para apagar/digitar; evitar UI confusa de stepper/setinhas.

## 7. Área pública do cliente

### Implementado
- Link compartilhável por empresa.
- Cliente vê orçamento, artes e mockups.
- Cliente pode baixar arquivos quando habilitado.
- Cliente vê vendedor responsável.
- Botão WhatsApp do vendedor.
- Horário de atendimento: **9h às 18h**.
- Empresa finalizada continua com ambiente disponível para consulta/download.

### Pendente
- Permitir o cliente anexar/subir imagem diretamente pela área pública, se mantido como requisito final. Hoje o fluxo principal é visualização/download.

## 8. Equipe e administração

### Implementado
- Clovis como administrador.
- Área **Equipe** para funcionários.
- Cadastro/convite com nome completo, telefone e e-mail.
- Funcionário cria a própria senha no primeiro acesso.
- Redefinição de senha por fluxo seguro.
- Funcionários da mesma equipe enxergam a base compartilhada conforme regras do banco.
- Histórico de acesso e ações administrativas.
- Empresas, anexos, orçamento, mudanças de status e ações principais registram autoria quando suportado.
- Cards destacam quem cadastrou e quem é o responsável atual.
- Na área do cliente, mostrar “Seu vendedor responsável é [nome]” + WhatsApp.

### Não implementar
- Administrador visualizar a senha definida pelo funcionário. Senhas permanecem protegidas; usar redefinição.

## 9. Dashboard e produtividade

### Implementado
- Dashboard administrativo e botão de produtividade.
- Filtros: **Hoje**, **Ontem**, **Últimos 7 dias**, **Últimos 30 dias**, **Mês passado**, **mês específico**, **data personalizada**.
- Filtro por vendedor.
- Empresas/clientes cadastrados por usuário.
- Empresas por UF/estado.
- Projetos iniciados e finalizados.
- Atendimentos ativos em tempo real.
- Distribuição por status.
- Atendimentos vencidos +24h.
- Desistências.
- Faturamento por camisas, estampas e total.
- Resumo diário na página inicial.
- Histórico de atividades.
- Equipe, Dashboard, “Ver produtividade” e demais rotas devem abrir imediatamente no clique, sem exigir refresh.

## 10. Biblioteca de vídeos / Demonstrações de qualidade

### Implementado
- Biblioteca interna **Vídeos**.
- Upload MP4, MOV e WebM.
- Pastas/subpastas.
- Nome e **descrição da demonstração**.
- Visualizar, renomear, mover, excluir e baixar vídeo original.
- Limite atual do bucket: 50 MB por arquivo.
- Cada vídeo recebe `share_token` para compartilhamento público.
- RPC pública `z19p_get_public_video_demo(uuid)` retorna apenas dados necessários de demonstrações.
- Página pública `demo.html?t=<token>` com layout responsivo, vídeo original em alta qualidade e botão **Baixar vídeo**.
- Botão **Demonstrar** permite selecionar uma ou várias demonstrações e depois escolher um cliente cadastrado.
- WhatsApp gera texto organizado com emoji/negrito, cada demonstração em bloco separado, descrição e link individual.
- Modelo do texto: “Clique no link abaixo para assistir ao vídeo da demonstração de qualidade — [descrição]” seguido do link.
- Vídeos internos não aparecem automaticamente na área normal do cliente; são enviados pelo fluxo Demonstrar.

## 11. Arquitetura e bugs já descobertos

### Bug: layout destruído por compactação global
- **Causa:** CSS/patch global com muitos overrides e `!important`.
- **Correção:** restaurar layout canônico aprovado e aplicar só estilos localizados.
- **Prevenção:** nunca redesenhar globalmente por causa de uma feature.

### Bug: Equipe/Dashboard mudavam URL mas não tela
- **Causa:** handler antigo de navegação/hash continuava registrado.
- **Correção:** `hashchange` chama a implementação atual de `renderRoute`; `nav()` rerenderiza a rota atual.
- **Prevenção:** testar clique de todas as rotas sem refresh.

### Bug: `Failed to fetch`
- **Causa:** produção carregava parte do app buscando deployment Vercel antigo.
- **Correção:** remover dependência de deployment antigo.
- **Prevenção:** boot jamais deve apontar para URL de deployment histórico.

### Bug: `Failed to decode data`
- **Causa confirmada:** v2.9 usava `DecompressionStream` nativo para gzip no navegador; em alguns dispositivos o boot falhava. Durante a migração para o GitHub também foi encontrado bundle incompleto, faltando `runtime-bundle/bundle.06.txt`.
- **Correção v2.10.1:** bundle foi completado (`bundle.00` a `bundle.07`) e o boot de produção deixou de usar `DecompressionStream`. A compatibilidade atual usa `fflate@0.8.2` em JavaScript, Raw GitHub como origem principal e jsDelivr como fallback.
- **Prevenção:** nunca usar `DecompressionStream` no boot; nunca publicar sem conferir todas as partes; manter código/versionamento no GitHub.
- **Evolução preferida:** consolidar deploy Git→Vercel com `index.html + styles.css + app.js` diretos do mesmo deployment, eliminando também o bundle remoto quando a integração de deploy estiver estabilizada.

## 12. Checklist obrigatório antes de publicar

- [ ] Ler este `PROJECT_MEMORY.md` inteiro.
- [ ] Registrar a nova versão aqui antes/na mesma mudança.
- [ ] `node --check app.js` quando houver `app.js` direto.
- [ ] Não existe `DecompressionStream` no boot.
- [ ] Não existe URL de deployment Vercel antigo no boot.
- [ ] Se houver bundle remoto de compatibilidade, todas as partes existem e estão na versão correta.
- [ ] Commit correspondente existe no `zero19areaclientes`.
- [ ] Preview/deployment está `READY` antes de promoção.
- [ ] Domínio canônico responde 200 e entrega a versão nova.
- [ ] `demo.html` responde 200.
- [ ] Login abre.
- [ ] Dashboard sem overflow horizontal.
- [ ] Filtro de status não sai da tela no celular.
- [ ] Equipe/Dashboard/Produtividade navegam no clique.
- [ ] Cards mantêm status, responsável, WhatsApp, editar/excluir e abrir empresa.
- [ ] Tempo no status e alerta +24h aparecem corretamente.
- [ ] Pastas/subpastas funcionam e nomes aparecem completos.
- [ ] Artes continuam com recorte de prancheta e qualidade.
- [ ] Não existe remoção automática de fundo na interface.
- [ ] Mockup não recebe processamento de arte.
- [ ] Editar/excluir/baixar arte continua funcionando.
- [ ] Orçamento salva e aparece na área pública.
- [ ] Área pública mostra vendedor, orçamento, mockups e artes.
- [ ] Biblioteca de vídeos, descrição, seleção múltipla, WhatsApp e preview permanecem.
- [ ] Nenhuma função anterior foi removida para encaixar a nova.

## 13. Histórico resumido de versões

### v1.0–v1.4 — Base, produção e comercial
- Auth/Supabase, empresas, upload/PNG, área pública.
- Recorte transparente, 300 DPI, 4032/6000/8192, mockup separado e removedor de fundo retirado.
- Status, catálogo, orçamento, WhatsApp, pastas/subpastas e bibliotecas Artes/Mockups.
- Alerta +24h.

### v2.0–v2.4 — Equipe, auditoria e indicadores
- Administrador/funcionários, autoria, responsável, Puxar pra mim, histórico, projetos recorrentes, Desistiu/Remarcado, faturamento, dashboard e UF.
- Criado `PROJECT_MEMORY.md`.
- Corrigido Cotton no catálogo.
- Revertida compactação global que degradou o layout.

### v2.5–v2.7 — Layout canônico e navegação
- ZIP/layout aprovado virou referência visual.
- Corrigidas rotas Equipe/Dashboard/Produtividade.
- Corrigido `Failed to fetch` por dependência de deployment antigo.
- Tempo no status, alerta +24h e nomes completos de pastas.

### v2.8 — Vídeos de demonstração
- Biblioteca Vídeos, upload MP4/MOV/WebM, pastas, download e fluxo Demonstrar/WhatsApp.

### v2.9 — Preview público e múltiplas demonstrações
- `share_token`, RPC pública de vídeo, descrição por vídeo, seleção múltipla e `demo.html` com download.
- Boot v2.9 acabou expondo o problema de `DecompressionStream` em navegador real.

### v2.10 — GitHub como fonte de verdade
- Pedido do usuário: código + MD versionados no repositório para não perder contexto e permitir rollback.
- Preparada base para retirar o carregamento quebradiço.

### v2.10.1 — Recuperação de produção concluída em 15/09/2026
- Repositório canônico confirmado: `uniquessatacado/zero19areaclientes`.
- Completado `runtime-bundle` com `bundle.00.txt` até `bundle.07.txt`.
- Criados/atualizados no GitHub: `index.html`, `demo.html`, `vercel.json` e este `PROJECT_MEMORY.md`.
- Produção publicada no Vercel: deployment **`dpl_2VNKYZRi3ArC2Z9gyheKyap62CQC`**.
- Deployment ficou **READY** sem erro de alias.
- Aliases ativos: `019-personalizacoes.vercel.app` e `019-personalizacoes-uniquess.vercel.app`.
- Domínio canônico verificado via HTTP 200 entregando `z19-version=2.10.1`.
- `demo.html` verificado via HTTP 200.
- Cache da raiz e do preview de vídeo configurado como `no-store` durante estabilização.
- Boot não usa `DecompressionStream`; usa `fflate` em JS e possui fallback Raw GitHub/jsDelivr.
- Próxima alteração deve iniciar como **v2.11** e preservar tudo acima.

## 14. Pendências priorizadas

1. Importação recursiva do Google Drive com OAuth e preservação de subpastas.
2. Upload de arquivo pelo cliente na área pública, se confirmado.
3. Consolidar `app.js`/CSS removendo overrides antigos depois de congelar comportamento com smoke tests.
4. Evoluir o boot para arquivos diretos do mesmo deployment via integração Git→Vercel, retirando o bundle remoto de compatibilidade sem reintroduzir o bug.
5. Considerar bucket privado + URLs assinadas para maior privacidade.
6. Criar smoke tests automatizados para login, dashboard, empresa, pastas, upload, orçamento, equipe e vídeo.

## 15. Próxima versão

**A próxima versão é v2.11.** Antes de qualquer mudança, ler este arquivo novamente, registrar a intenção da v2.11 e preservar o layout canônico, todas as funções e todas as regras de prevenção acima.
