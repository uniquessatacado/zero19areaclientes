# 019 Personalizações — Memória Canônica do Projeto

> **LEITURA OBRIGATÓRIA ANTES DE QUALQUER ALTERAÇÃO.** Este arquivo é a fonte de continuidade do projeto. Antes de mexer: ler tudo, identificar a versão de produção, concluir qualquer etapa aberta, registrar a próxima versão e preservar todas as funções existentes. Depois: validar, commitar no GitHub e só então publicar. **Nunca chamar uma versão de publicada sem confirmar o domínio canônico e o boot executável.**

## 1. Fonte de verdade e infraestrutura
- Repositório oficial: **`uniquessatacado/zero19areaclientes`**, branch **`main`**.
- Produção: **`https://019-personalizacoes.vercel.app`**.
- Vercel: projeto `019-personalizacoes` / `prj_cpZoh49CdDlYP0h82gwXCbR4nyw3`, team `team_88LTzdT7GLfKgRlzjvr1eF8c`.
- Supabase: projeto `kedggjyerexnzmipaick`; tabelas desta aplicação usam prefixo `z19p_`; bucket `z19p-assets`.
- Administrador principal: Clovis.
- Visual canônico: tema escuro + laranja Zero 19, profissional, responsivo, sem compactação exagerada. O layout aprovado na fase v2.5 é a referência visual.
- Logo: usar **somente o logo oficial Zero 19**, com o zero estilizado/escrito. Não recriar como `019` textual. Em fundo escuro, usar cápsula branca/alto contraste quando necessário.
- No topo interno, deixar o logo oficial e badge da versão; não repetir `019 Personalizações` se ficar redundante.
- A versão aparece no ambiente interno/login/admin; **não aparece nas páginas públicas do cliente**.

## 2. Regras absolutas de não regressão
1. Nunca remover função existente para adicionar outra sem registrar explicitamente a substituição e validar impacto.
2. Nunca redesenhar globalmente para encaixar uma feature nova; mudanças visuais devem ser localizadas.
3. Se chegar novo pedido durante mudança em andamento, terminar a etapa atual primeiro.
4. Todo bug resolvido entra aqui com **causa, correção e prevenção**.
5. Toda versão publicada precisa de commit rastreável + deployment `READY` + aliases ativos + domínio canônico validado.
6. HTTP 200/READY do HTML não basta: validar também o payload executável/boot.
7. Nunca reintroduzir remoção automática de fundo.
8. Mockup não recebe recorte/upscale de arte.
9. Senhas de funcionários nunca ficam visíveis ao administrador; usar convite/reset seguro.
10. Preservar autoria de ações e criador original da empresa.
11. Não aplicar CSS global agressivo com muitos `!important`; isso já destruiu o layout aprovado.
12. Navegação SPA precisa trocar tela no clique, sem refresh manual.
13. Mobile não pode ter overflow horizontal.
14. Nome de pasta aparece completo; não esconder com `...`; reduzir fonte/quebrar linha.
15. Não iniciar produção buscando deployment Vercel histórico.
16. Não usar `DecompressionStream` nativo no boot; já causou incompatibilidade real.
17. Se houver pacote/chunks, validar **todas as partes, checksum/gzip, JSON e compilação do JS** antes de publicar.
18. Nunca usar parser tolerante (`Function(...)`) para mascarar pacote JSON corrompido.
19. GitHub é a fonte de rollback. Toda mudança de produção deve ter versão documentada.

## 3. Empresas, clientes e atendimento
- Criar, editar e excluir empresa.
- Campos: empresa, cliente, telefone/WhatsApp, UF/estado, observações e status configurável.
- Status padrão: Em atendimento; Aguardando chegar o produto para realizar a personalização; Cliente não responde; Desistiu; Remarcado; Finalizado.
- Empresa não finalizada mostra há quanto tempo está no status: horas e depois dias + horas.
- Após 24h sem **mudança de status**, sobe na prioridade e recebe alerta visual até o status mudar. Só mudança de status zera o contador.
- WhatsApp no card; `Desistiu` registra/destaca data; `Remarcado` tem data/hora de retorno.
- Mostrar criador e responsável atual separadamente.
- `Puxar pra mim` troca responsável e abre WhatsApp; criador original permanece.
- Reabrir Finalizado representa novo projeto da mesma empresa, preservando histórico.
- Perfil interno mostra histórico e gastos em camisas, estampas e total. Área pública não precisa mostrar financeiro acumulado.
- Exclusão de empresa não pode ser bloqueada por FK do audit log. Bug v2.11 corrigido e deve continuar testado.

## 4. Artes, mockups, pastas e bibliotecas
- Upload de uma ou várias imagens; nome individual; editar/mover/excluir; download PNG.
- Preview checker/transparente, branco ou preto.
- Recorte transparente no limite real dos pixels, preservando antialias/alpha.
- PNG 300 DPI; presets Original, 4032, 6000 e 8192; nunca reduzir original maior que o alvo.
- Remoção automática de fundo: **REMOVIDA DE PROPÓSITO**.
- Mockups separados de arte de produção.
- Pastas/subpastas por empresa; padrões configuráveis: Artes enviadas pelo cliente, Artes prontas, Logo da empresa, Mockups.
- Logo mais recente da pasta Logo da empresa pode substituir placeholder do card.
- Bibliotecas internas Artes, Mockups e Vídeos; ponte celular ↔ computador.
- Pendente futuro: integração Google Drive via OAuth/API, sem scraping frágil.

## 5. Orçamentos, produtos, estampas e criação de arte
- Orçamento por empresa; produto, quantidade, prazo e observações.
- Modos: valor total por peça personalizada OU peça + estampas separadas.
- Produtos padrão incluem 30.1, Oversize Suedine, Oversize 100% algodão, Pima Egípcia, Malha Peruana, Cotton, Dry Fit Premium e Dry Fit com Poliamida.
- Demonstração de qualidade deve usar o **mesmo produto de `z19p_products` usado no orçamento**.
- Faixas padrão: **1–4, 5–19, 20–49, 50+**, editáveis/adicionáveis/removíveis/reordenáveis.
- Preço da qualidade por faixa pode preencher o preço da peça no orçamento.
- Catálogo de estampas/regras: camisa normal ou camisa de time; posições Peito esquerdo, Peito direito, Peito central, Barriga, Manga direita, Manga esquerda, Nuca, Costas, Mega frente e Mega costas.
- Regra de estampa: largura/altura máximas; preço avulso e combinado; preço por faixa de quantidade; em camisa de time quando aplicável, cobrança por letra/número/especial; em algodão/normal, cobrança por dimensão/cm conforme regras cadastradas.
- UI de estampa deve usar mockup visual de camiseta e mostrar aproximadamente posição/tamanho conforme largura/altura informadas.
- Preparação/criação da arte: preço por arte distinta; PNG pronto pode ser grátis; permitir configurar a partir de qual faixa a criação vira brinde, mostrando desconto/brinde no orçamento.
- Campos numéricos no mobile devem permitir apagar/digitar facilmente, sem stepper confuso.

## 6. Área pública do cliente
- Link compartilhável por empresa; orçamento, artes, mockups e downloads quando habilitados.
- Mostrar vendedor responsável + WhatsApp e atendimento 9h–18h.
- Banner para **Demonstrações de Qualidade** e **Portfólio**.
- Empresa finalizada mantém área para consulta/download.
- Pendente opcional: permitir upload de imagem pelo próprio cliente.

## 7. Equipe, auditoria e produtividade
- Clovis é admin.
- Área Equipe; convite com nome, WhatsApp e e-mail; funcionário define própria senha; reset seguro.
- Mesma equipe compartilha a base conforme regras do banco.
- Audit log para acessos e ações relevantes; preservar criador original e responsável atual.
- Produtividade admin: Hoje, Ontem, 7 dias, 30 dias, mês passado, mês específico, intervalo customizado, filtro por vendedor; cadastros, UF, projetos, finalizados, ativos, status, +24h, desistências e faturamento camisas/estampas/total.

## 8. Demonstrações de qualidade
- Página pública única `/qualidades.html`; link geral começa no topo e link específico faz deep-link ao produto.
- Produto: qualidade do tecido, composição, descrição, medidas, preços por faixas, **até 1 vídeo + 3 fotos**.
- Limite desejado por vídeo: **100 MB**.
- Vídeo visível dá autoplay; sai da viewport = pausa; nunca tocar dois simultaneamente.
- Preferência do usuário: som por vídeo, com ícone individual. Tentar reproduzir com som quando permitido, mas respeitar bloqueio de autoplay do Safari/Chrome mobile e oferecer ativação individual imediata.
- Download do vídeo, compartilhar catálogo ou produto específico, ver medidas.
- Curtida deduplicada aproximadamente por hash de IP no backend; nunca guardar IP bruto.
- Comentário pede nome + WhatsApp + texto; admin pode mostrar/ocultar; botão para responder no WhatsApp; telefone nunca é público.
- Ordenação por menor preço e por mais curtidos.
- Templates WhatsApp configuráveis para página completa e produto específico; placeholders `{cliente}`, `{vendedor}`, `{produto}`, `{link}`.

## 9. Portfólio / Provas Sociais
- Página pública `/portfolio.html`.
- Case pode se vincular a empresa existente e usar logo/nome da empresa.
- **Até 1 vídeo + 3 fotos**, swipe lateral; vídeo autoplay quando visível e pausa fora.
- Ordem padrão automática incremental 0,1,2,3..., editável.
- Curtir e compartilhar.
- Upload precisa deixar claro os campos e limites, sem depender do nome do arquivo como título.

## 10. Comissões
- Sistema global liga/desliga; desligado = nada contabilizado/mostrado.
- Configuração por vendedor e por faixa de quantidade.
- Base possível: total da venda, somente produto/peça, somente estampa ou percentuais diferentes para peça + estampa.
- Prévia da comissão no orçamento para o vendedor.
- Comissão só nasce quando orçamento/venda é marcado **pago**; depois vai para aprovação do admin.
- Admin aprova, recusa e marca pagamento; configurar dia semanal de pagamento.
- Vendedor vê na página inicial apenas suas comissões/parcelas.
- **Divisão de comissão:** admin pode dividir entre vendedor original e usuários que ajudaram; percentuais somam 100%; opção de divisão igual; total da comissão não muda; cada usuário vê sua parcela; rateio acompanha status; bloquear alteração após pago/recusado.
- Estruturas principais: `z19p_commission_config`, `z19p_commission_rules`, `z19p_commissions`, `z19p_commission_shares`.
- RPCs principais: `z19p_mark_quote_paid`, `z19p_set_commission_split`, `z19p_get_my_commission_summary`.

## 11. Bugs históricos importantes
### Layout destruído
- Causa: CSS global/`!important` agressivo.
- Correção: restaurar layout v2.5.
- Prevenção: mudanças visuais localizadas.

### Equipe/Dashboard só abriam após refresh
- Causa: listener `hashchange` preso ao `renderRoute` antigo.
- Correção: listener chama implementação atual dinamicamente.
- Prevenção: testar rotas por clique sem refresh.

### `Failed to fetch`
- Causa: produção buscava deployment Vercel antigo para montar a aplicação.
- Correção: remover dependência de deployment histórico.
- Prevenção: boot nunca aponta para deployment antigo.

### `Failed to decode data`
- Causa histórica: `DecompressionStream` e, em uma etapa, bundle incompleto.
- Correção: abandonar `DecompressionStream`; usar compatibilidade JS somente com artefato validado.
- Prevenção: validar todas as partes antes de publicar.

### Exclusão de empresa bloqueada por audit log
- Causa: FK do audit referenciava workspace recém-excluído.
- Correção: preservar log sem referência inválida; exclusões transacionais testadas.
- Prevenção: testar exclusões com dependências antes de publicar.

### v2.13/v2.14/v2.15 — erro de boot `Invalid escape` / `prevace`
- **Relato real:** iPhone/Safari mostrou `JSON Parse error: Invalid escape character e` e depois `Pacote interno inválido: Unexpected identifier 'prevace'. Expected '}' to end an object literal.`
- **Diagnóstico anterior incompleto:** foi atribuído principalmente a sessão Supabase/localStorage. Isso não explicava o problema inteiro.
- **Causa confirmada em 16/09/2026:** o snapshot `runtime-v213` está fisicamente corrompido. Validação server-side confirmou `gunzipSync: incorrect data check`; recuperando somente o deflate interno, o texto ainda falha em `JSON.parse` com `Bad escaped character in JSON`, e o JavaScript aparece misturado/ilegível próximo de `prevace`.
- **Conclusão:** não é um simples bug do Safari nem algo reparável com parser tolerante. O artefato v2.13 não é confiável.
- **Correção emergencial v2.15.1:** retirar `runtime-v213` da produção e voltar o boot para o último `runtime-bundle` conhecido estável, commit `d1acbe87cc8c59a345c5d423d4dae9bf183ae7fa`.
- **Validação independente do runtime estável:** 8 partes presentes, gzip íntegro, `JSON.parse` aprovado e JavaScript compilado com `new Function` após o patch de sintaxe conhecido do `bindWorkspaceCards`.
- **Prevenção:** nenhum runtime compactado entra em produção sem validar checksum/gzip + parse JSON + compilação JS em ambiente independente. Não usar `Function(...)` como parser de objeto para mascarar corrupção.

## 12. Produção atual — v2.15.1 (RECUPERAÇÃO ESTÁVEL)
- GitHub commit do `index.html` de recuperação: `a66a378aae1f5d4701b8261b7e09826a6da8ea1b`.
- Documento da recuperação: `versions/v2.15.1.md`.
- Deployment Vercel de produção: **`dpl_Dmf81TQgx4eT3FPSZJbGuYqCLm6v`**.
- Estado: **READY**, target `production`.
- Aliases ativos: `019-personalizacoes.vercel.app` e `019-personalizacoes-uniquess.vercel.app`.
- Domínio canônico confirmado HTTP 200 servindo `z19-version="2.15.1"`.
- Esta v2.15.1 é uma recuperação de disponibilidade. O núcleo interno usa o último runtime estável para tirar o sistema do estado de boot quebrado.
- **Não afirmar que todas as features v2.13+ estão ativas no runtime interno desta recuperação.** Banco/especificações comerciais permanecem preservados, mas o snapshot v2.13 corrompido não deve voltar à produção.

## 13. Candidata local v2.16 — reconstrução limpa
A v2.16 foi reconstruída localmente a partir do último runtime estável íntegro, sem reutilizar o snapshot `runtime-v213` corrompido. Os módulos comerciais vieram da release estática v2.13 que passou em validação independente de sintaxe. A candidata ainda não foi publicada; produção permanece em v2.15.1 até teste autenticado e autorização de publicação. Prioridades obrigatórias preservadas:
1. manter o sistema inicializando e todo o fluxo v2.12 estável;
2. reintegrar logo oficial e versão interna sem regressão visual;
3. catálogo/demonstrações com produto compartilhado com orçamento, preços por faixa, 1 vídeo + 3 fotos, 100 MB, likes/comentários/templates WhatsApp;
4. portfólio com 1 vídeo + 3 fotos, ordem automática e likes;
5. comissões completas, inclusive divisão entre usuários;
6. catálogo visual de estampas e criação de arte;
7. validar todas as rotas, CRUDs, mobile e produção antes de promover.

## 14. Revisão funcional v2.16 — 16/09/2026 (LOCAL, NÃO PUBLICADA)
- **Relato:** botões internos não abriam suas páginas e o sistema precisava de uma revisão funcional.
- **Causa confirmada:** o domínio retornava HTTP 200, porém o `index.html` carregava o núcleo por oito chunks compactados hospedados em GitHub/jsDelivr. No navegador real, o carregador terminava em `O aplicativo não respondeu ao iniciar`; sem o boot, nenhuma navegação interna podia funcionar.
- **Correção:** `index.html` voltou a carregar `app.js` e `styles.css` estáticos do mesmo servidor; o runtime estável foi materializado em fonte local; foi adicionado timeout seguro na recuperação de sessão; erros de inicialização agora aparecem na própria tela.
- **Navegação:** o listener SPA continua chamando a implementação atual de `renderRoute`; elementos `data-nav` também funcionam por Enter/Espaço; o painel administrativo ganhou acessos diretos para `Gestão comercial` e `Comissões`.
- **Páginas comerciais:** `qualidades.html`, `portfolio.html`, `comercial-admin.html` e `demo.html` foram materializadas como páginas estáticas locais, sem loader de release remota. `demo.html` redireciona para o catálogo mantendo o token específico.
- **Logo/versão:** logo oficial preservado com contraste em fundo escuro; topo interno sem texto redundante; badge interno atualizado para v2.16; páginas públicas não exibem badge de versão.
- **Correção posterior do logo:** o antigo `zero19-logo.png` estava corrompido/cortado: canvas `900×183`, mas somente uma faixa de `850×7` pixels continha o desenho. Ele foi substituído byte a byte pelo PNG original enviado pelo usuário (`2172×724`, conteúdo útil `1960×395`, SHA-256 `CBE8486D91864C08E5820AE2B26D4F88F3C2B69B52EC9B086D0DAA439E1BA7E1`). As URLs receberam `?v=2.16-logo2` para invalidar cache. Login e definição de senha agora mostram somente o logo, sem texto de marca redundante.
- **Cache:** `vercel.json` passou a impedir cache obsoleto de `app.js` e `styles.css` durante estabilização.
- **Home focada em clientes:** a abertura interna foi simplificada para título, resumo compacto, busca e clientes. Artes, Mockups, Vídeos, configurações, equipe, produtividade e gestão comercial saíram do conteúdo principal e foram organizados em drawer lateral. No mobile há barra inferior fina com Menu, Artes, Clientes, Vídeos, Mockups e Links.
- **Prioridade de atendimento:** clientes vencidos, remarcados vencidos ou há mais de 24h sem mudança de status aparecem numa seção destacada antes dos demais clientes. Busca e filtro continuam recalculando as duas listas.
- **Central de links:** nova rota interna `#/links` concentra abertura, cópia e envio por WhatsApp do catálogo de qualidades, portfólio e área individual do cliente. Ao compartilhar a área individual, o link é ativado de forma segura se ainda estiver desligado.
- **Permissões de comissão:** somente o perfil `admin` (Clovis como administrador principal) recebe no drawer os acessos de gestão e comissão; `comercial-admin.html` também mantém a barreira de perfil administrativo. Funcionários nunca recebem o painel de gestão.
- **Visão privada do vendedor:** quando o comissionamento global está ativo, o funcionário vê na home somente os próprios valores aguardando, aprovados e recebidos, usando `z19p_get_my_commission_summary`. Quando está desligado, o bloco não existe. No orçamento, o vendedor responsável vê a estimativa correspondente às próprias regras/faixas, com a mesma divisão produto/estampa usada pelo RPC de pagamento; admin e vendedor não responsável não veem essa prévia.
- **Uploads comerciais separados:** Demonstrações e Portfólio agora possuem cartões independentes para vídeo e fotos. Cada seletor mostra arquivos escolhidos, permite remoção antes de salvar, mantém remoção de mídias já vinculadas e valida o limite combinado de 1 vídeo (100 MB) + 3 fotos.
- **Cache da revisão visual:** `index.html` usa `styles.css?v=2.16-ui3` e `app.js?v=2.16-ui3` para impedir que o navegador preserve a tela antiga.
- **Validação:** `node --check` em `app.js`, validação de todos os scripts inline e JSON da Vercel aprovados. Smoke test no Edge headless confirmou: home chega ao login, Qualidades carrega catálogo e controles, Portfólio carrega, Comercial sem sessão retorna ao login, e `/demo.html` redireciona para Qualidades. Nenhuma imagem quebrada foi detectada.
- **Limite da validação:** CRUDs e rotas exclusivas após login devem ser exercitados com uma sessão real antes de publicar; a revisão está disponível em `http://127.0.0.1:4173/` para esse teste.
- **Prevenção:** o boot não pode voltar a depender de snapshots externos/compactados; manter `scripts/validate-static.mjs` e `scripts/browser-smoke.mjs` como verificações antes de publicar.

## 15. Checklist obrigatório antes de qualquer próxima publicação
- [ ] Ler este MD inteiro.
- [ ] Registrar nova versão antes de alterar.
- [ ] Validar sintaxe de todo JS/scripts inline.
- [ ] Preservar layout canônico v2.5.
- [ ] Não existe `DecompressionStream` no boot.
- [ ] Não existe URL de deployment Vercel antigo no boot.
- [ ] Se houver snapshot/chunks: todas as partes existem; checksum/gzip válido; `JSON.parse` válido; JS compila.
- [ ] Verificar login e recuperação de sessão local.
- [ ] Dashboard mobile sem overflow.
- [ ] Equipe/Dashboard/Produtividade abrem no clique.
- [ ] Status timer/+24h, pastas, artes, mockups e orçamentos continuam funcionando.
- [ ] Nomes de pasta completos, sem `...`.
- [ ] Vídeos, qualidade, portfólio, comentários/likes e templates WhatsApp validados quando reintegrados.
- [ ] Comissão, divisão de comissão, estampas e criação de arte validadas quando reintegradas.
- [ ] Exclusões principais testadas com dependências.
- [ ] Commit GitHub existe antes do deploy.
- [ ] Preview validado quando possível.
- [ ] Produção `READY`.
- [ ] Domínio canônico entrega a versão nova.
- [ ] Logo e rotas públicas retornam 200.
- [ ] Só depois responder ao usuário que está publicado.

## 16. v2.17 — produção, projetos e montagem DTF (EM IMPLEMENTAÇÃO — 18/09/2026)

### Estado reconciliado antes da alteração
- `main` local e `origin/main`: commit `29c8331` (`attnova1`), árvore limpa no início do trabalho.
- O domínio canônico respondeu HTTP 200 e entregou `z19-version="2.16"`; `app.js` e `styles.css` também responderam 200 com os mesmos tamanhos dos arquivos locais.
- A documentação acima e o `README.md` ainda descreviam v2.16 como candidata e v2.15.1 como produção. Essa divergência foi confirmada; a produção real é v2.16 e a próxima versão escolhida é v2.17.
- O Vercel CLI não possui sessão autenticada neste ambiente. O ID/estado interno do deployment não foi confirmado e nenhuma publicação deve ser afirmada sem autenticar e revalidar domínio, aliases e boot.
- O Supabase CLI local não estava vinculado ao projeto. Alterações de banco serão preparadas em migration nova, aditiva e idempotente; aplicação remota exige auditoria/credencial e validação prévia.

### Objetivo
- Evoluir o fluxo empresa → projeto → orçamento → pagamento → entrega → filas operacionais sem substituir a arquitetura atual.
- Adicionar PDF persistente do orçamento, medida obrigatória para Artes prontas, times/personalizações oficiais e montagem de filme DTF 28/58 cm com exportação PNG 300 DPI.
- Tornar as novas telas e ações adequadas a celular e desktop, mantendo o tema e o layout canônico.

### Plano por checkpoints
1. Banco: status semântico, isolamento por projeto, data de entrega, trava de pagamento, documentos PDF, perfis de impressão, times/glyphs e print jobs.
2. Operação: filas ordenadas, posições, destaque do responsável, novo projeto explícito, badges de pagamento e seletor de data mobile-first.
3. Orçamento/arte: pagar com data obrigatória, PDF real, compartilhamento seguro, medida proporcional e halftone.
4. Times/filme: cadastro e preparação assistida, itens mistos, nesting normal/máximo, métricas e exportação segmentada em 300 DPI.
5. Validação: sintaxe, migrations, funções puras, smoke browser, viewport mobile e fluxos autenticados quando houver sessão.

### Riscos e mitigação
- Schema remoto não está introspectável sem vínculo/autenticação: migration deve usar `if exists`/`if not exists`, preservar dados e não será aplicada às cegas.
- O app atual atualiza workspace/projeto diretamente: a transição para fila precisa de RPC/trigger no banco para não depender só do frontend.
- Geração de bitmap grande pode estourar memória mobile: calcular memória antes e segmentar sem reduzir DPI nem cortar item.
- CDR não terá promessa de interpretação automática: original privado + SVG/PDF de trabalho e mapeamento assistido.
- PDF e bibliotecas críticas não dependerão de novo CDN; a geração será local no navegador e o arquivo será persistido no Storage quando autorizado.

### Pontos obrigatórios de não regressão
- Boot estático local, SPA/hashchange, autenticação, RLS, bucket `z19p-assets`, empresas, artes, mockups, pastas, equipe, produtividade, comissões, qualidades, portfólio e área pública.
- Sem remoção automática de fundo; mockup sem crop/upscale; criador original separado do responsável; nomes de pasta completos; mobile sem overflow.
- Nenhum commit, migration remota ou deployment será declarado concluído antes das validações correspondentes.

**Candidata atual: v2.17 em implementação local. Produção confirmada no domínio: v2.16.**

## 17. Revisão v2.17.3 — experiência de produção (LOCAL, em andamento)
- Pedido atual: seletor visual de múltiplas artes entre empresas/clientes; provador proporcional frente/costas preto/branco; edição manual de cor com conta-gotas, desfazer, duplicar ou atualizar; revisão de filas e integridade do filme.
- A remoção de cor é manual e explicitamente autorizada pelo usuário nesta revisão; não reintroduzir remoção automática de fundo no upload.
- Plano: módulos locais independentes de seletor e estúdio; dimensões reais calibradas pela largura/comprimento da camisa; preservar arquivo original e salvar revisões PNG em caminhos novos; compartilhar perfil de impressão entre card/provador/filme.
- Riscos: fotos são referência visual, tamanho real depende da medida informada da peça; navegação autenticada precisa de validação específica; edições não podem destruir imagens usadas em jobs anteriores.
- Não regressão: assets originais, alpha, 300 DPI, medidas exatas, pagamento/entrega, RLS, biblioteca, projetos e comissões.
- Falhas confirmadas em revisão: fila perdia badges ao redesenhar cards; orçamento pendente recente escondia pago; encaixe arredondava tamanho físico e não aplicava gap corretamente. Correções em andamento com regressão reproduzível.

### Expansão da revisão: estúdio, custos, navegação e orientador

- Checklist canônico detalhado: `IMPLEMENTATION_CHECKLIST_v217.md`. Não esquecer pedidos anteriores ao receber adições ao vivo.
- Filme: quantidade antes/depois de adicionar, medidas editáveis, posicionamento magnético com colisão/limites, fundo apenas visual, prévia centralizada e limitada em altura. 101 peças testadas no Edge desktop/mobile: roda propaga e toque rola por padrão; botão permite arrastar.
- PNG: tamanho físico em 300 DPI, exportação inteira ou recorte da união real dos pixels alpha. Ângulos livres preservam largura/altura originais; bbox rotacionado não é novo tamanho. Para exportação angular recortada, renderizar a mesma prancheta inteira antes do crop: transladar/re-renderizar num canvas menor altera quantização antialias. Regressão compara RGBA exato.
- Rotação: opção explícita, heurística em 30° (núcleo também aceita 15°), controle manual arbitrário; políticas sem rotação e travas respeitadas. Limite de trabalho retorna baseline seguro sem aumento de comprimento, sinalizando busca limitada; não prometer ótimo global.
- Estúdio completo: normal/oversized, preto/branco/off-white, frente/costas/mangas, múltiplas artes e medidas físicas calibráveis. Salvar medida de camada secundária exige consultar perfil/asset atuais e preservar ready/halftone/projeto/política/criador. Montagem salva em metadata sem modificar os arquivos originais.
- Assets fotográficos nativos 1254×1254 (vista individual 627 px); exportar em 2000 px não cria detalhe nativo. Prompts e limites em `assets/MOCKUP_PROMPTS.md`. Não chamar apresentação 2D de 3D. PNGs do estúdio são apresentações, não arquivos DTF em tamanho real.
- Custos: `production-cost-core`, análise/Worker, UI e `cost-store`. CMYW inicial conforme referência fornecida; consumos e tempo são estimativas/calibração. Canal K só se configurado. 30 cm proporcional exige opt-in explícito. Compras reais em m/ml/g, ausência de preço/calibração permanece desconhecida. Comissão integral de projeto é mostrada à parte e só somada com confirmação explícita de administrador, não inferir rateio por arte.
- Referência de equipamento: fornecedor Bulk Ink Jet Brasil, T3170 adaptada, 58 cm úteis/60 nominal e aproximadamente 52 minutos/metro. Especificações não permitem custo exato por pixel/ICC/RIP. Preços da imagem do usuário são exemplo, não compras reais.
- Custos privados: migration `20260918054035_v217_production_cost_settings.sql` aplicada em 18/09 após conector oficial restabelecido. RLS **somente titular Clovis** (auth.uid=owner e admin), não funcionários nem admins delegados. Nuvem canônica; cadastros antigos locais são apenas fonte de migração explícita sem perda. Integridade `20260918044500` também aplicada. Não contornar indisponibilidade futura do conector via cliente alternativo.
- Navegação: `route-viewport.js` distingue nova rota (topo) de reload (mesma rota/posição), espera conteúdo tardio sem apagar destino e cancela restauração quando usuário interage. Atualização de token não deve redesenhar a tela em edição. Rotas novas respeitam primeiro acesso/reset de senha e carregam contexto da equipe antes de consultar dados.
- Usuário recusou custos de API de IA. Orientador de projetos é local, determinístico, com evidências, priorização e ações manuais; sem envio a modelo externo, sem prometer geração/autoaprendizagem. Dados não carregados não podem virar alertas falsos de ausência.
- Toda funcionalidade nova relacionada ao fluxo deve atualizar as verificações do orientador e seus testes por `registerProjectAdvisorRule` ou regra revisada no núcleo. Isso é manutenção explícita, não aprendizagem autônoma em runtime.
- QA local: testes puros de filas, lettering/fontes Unicode, jobs, PDF/histórico, cores, dimensões, rotação, custos/permissões/conflitos, estúdio e viewport. Fixtures Edge reais em 1280 e 390 px, sem autenticação real nem writes de rede. Não confundir fixtures com validação de políticas na conta real.
- Sem commit/deploy nesta revisão. Produção não foi alterada; preservar alterações anteriores do usuário. Pendências reais: ativação remota das migrations, validação autenticada completa e eventual modelo 3D realista.

## 18. v2.17.4 — exportação DTF em PNG único (18/09/2026)

- **Relato:** um filme contínuo com aproximadamente 1,30–1,50 m estava sendo exportado automaticamente em vários PNGs por causa da segmentação de segurança/memória.
- **Regra nova e explícita:** a exportação para o RIP deve gerar **um único PNG contínuo**, mantendo o comprimento total calculado da prancheta e 300 DPI. O sistema não pode dividir automaticamente um mesmo filme em vários arquivos.
- **Correção:** a exportação automática passa a usar um único trecho cobrindo todo o `lengthMm`; o nome final é `filme-completo.png` (ou `filme-completo-recortado.png` quando o recorte externo for escolhido).
- **Limites:** se o PNG único ultrapassar o limite de dimensão/canvas ou uma estimativa segura de memória do navegador, mostrar erro claro e pedir que o usuário divida o job manualmente. **Nunca** voltar a criar vários PNGs silenciosamente.
- **Medida:** largura e comprimento continuam derivados diretamente do layout em centímetros a 300 DPI; nenhuma arte pode ser reduzida, cortada ou reposicionada durante a exportação.
- **Não regressão:** manter transparência, alpha/antialias, rotação, posições, espaçamento/gap, opção de recorte externo e largura inteira.
- Esta regra substitui a orientação anterior de segmentação automática para filmes longos.
- Status neste commit: candidata v2.17.4; publicar somente após preview/validação do domínio.
