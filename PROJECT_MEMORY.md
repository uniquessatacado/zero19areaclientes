# 019 Personalizações — Memória canônica

## Leitura obrigatória
Antes de qualquer manutenção, ler INTEIROS este arquivo E `versions/PROJECT_MEMORY-pre-2.17.6.md`. O segundo preserva byte a byte toda a memória até a v2.17.5: requisitos, bugs, Supabase, clientes, projetos, fontes, filme, orçamentos e regras de não regressão. Nada do histórico foi descartado.

## Infraestrutura e produção
- GitHub: `uniquessatacado/zero19areaclientes`, branch `main`.
- Site oficial: `https://019-personalizacoes.vercel.app`.
- Vercel: projeto `prj_cpZoh49CdDlYP0h82gwXCbR4nyw3`, team `team_88LTzdT7GLfKgRlzjvr1eF8c`.
- Supabase: `kedggjyerexnzmipaick`, tabelas `z19p_`, buckets existentes preservados.
- Base desta revisão: `cb1ae47c2ec3d8c40f35036ac4c23e98727d580c`.
- Antes desta correção, domínio e Vercel foram conferidos em v2.17.5, deployment `dpl_3YA69gs5jRpd7ABt3hV9eRBpDg5p` READY.
- **Produção publicada: v2.17.6**, commit de implementação `d2eb6c540ce60d0f1136d960fe0c9b8eecf0b4d3`, deployment `dpl_ZPY2K9YPLMckbJTN1gQgfpDfJKvY` READY, aliases oficiais confirmados em 18/09/2026.
- O domínio canônico com consulta `?v=2.17.6` respondeu HTTP 200 com a versão nova; `production-v217.js`, `lettering-layout-v2176.js` e `film-saved-drafts.js` foram consultados diretamente no domínio e entregam a implementação v2.17.6. No início da propagação houve resposta 2.17.5 em cache no endereço sem consulta: revalidar sem cache se necessário.
- Testes de fonte/UI em navegador isolado e testes puros passaram; não foi executada a montagem autenticada específica do usuário nem a impressão física.

## Regras permanentes
Preservar layout aprovado, autenticação, RLS, banco, empresas, projetos, equipes, autoria, orçamento/pagamento, filas, comissões, artes, mockups e área pública. Não remover funções para adicionar outras. Não alterar nomes que o cliente digitou. Não aplicar correções de cor/remoção de fundo automaticamente. Mockup não recebe processamento de arte. Nome de pasta completo, mobile sem overflow. Toda mudança tem versão, teste, commit e publicação verificada no domínio; READY/HTML 200 sozinhos não validam a aplicação executável. Não voltar a loaders históricos, gzip/chunks, DecompressionStream ou eval no boot. Commits devem incluir `[skip bootstrap]`: o workflow histórico de reconstrução v2.12 não deve reescrever a versão atual.

## v2.17.6 — implementação
Pedido urgente: manter 5,5 cm no corpo das letras mesmo com acento/cedilha; melhorar intervalo óptico A/V em DAVID; salvar vários filmes como rascunhos e iniciar/retomar outro sem perder o atual.

### Letras e acentos
- Causa: a v2.17.5 calculava a escala usando a caixa total do nome, incluindo acentos/cedilha; isso encolhia o corpo.
- Receita nova `letteringMetricsVersion:2`: referência fixa de maiúscula da fonte oficial (H, com alternativas verificadas); mesma escala em nomes distintos. Acentos e cedilha ampliam a caixa real e não reduzem o corpo. Não remover sinais do texto final.
- SVGs mantêm seus detalhes e cores. A medição por alpha separa sinais quando há faixa vazia; sinais ligados exigem vetor base para referência. Se não for seguro medir, mostrar erro, nunca achatar/apagar sinais.
- Espaçamento óptico usa contornos renderizados com distância mínima inclusive diagonal; mantém o nome inteiro como uma única arte. Só ajusta o excesso nos cantos vazios e preserva espaços digitados.
- Fontes/vetores oficiais originais permanecem intactos. Nenhuma fonte de sistema substitui a fonte cadastrada.
- Jobs antigos mantêm a receita anterior até o usuário recalcular. Botão **Corrigir nomes e recalcular** atualiza a montagem em edição, sem redigitar nomes. Travas de peças com geometria alterada precisam ser recalculadas; as demais são mantidas.
- Conferência em **Conferir nomes** mostra o texto real dos itens, agrupando nome e algarismos pela identificação da personalização; não inventa/exclui nomes sugeridos a partir de uma foto.

### Vários rascunhos
- Botões **Salvar rascunho**, **Novo filme**, **Abrir rascunhos**.
- Cópias independentes no banco usando `z19p_print_jobs`, status `draft`, `settings_snapshot.kind='named_film_draft_v1'`.
- Rascunho pode ser salvo antes de calcular. Mantém itens, medidas, textos, vetores/fontes, configurações e layout quando presente.
- A lista filtra conta e criador e mantém as RLS atuais da equipe. Não expor publicamente.
- Novo filme só esvazia o editor depois de confirmar a cópia no banco. Abrir outro faz cópia de segurança da montagem atual não vazia.
- Autosave único/CAS em `z19p_film_drafts` continua separado e preservado. Falha de rede/conflito/troca de conta não autoriza descartar o editor.
- Nenhuma migration nem alteração de RLS nesta revisão.

### Fonte e build desta revisão
A saída continua sendo HTML/JS/CSS estáticos do mesmo domínio. `npm run build` executa `scripts/build-v2176.mjs`, aplica transformações locais com verificação de ocorrência única sobre a fonte v2.17.5, valida os módulos e escreve **dist/**. Os novos motores estão em `lettering-layout-v2176.js`, `film-saved-drafts.js` e o trecho do controlador em `scripts/film-v2176-functions.txt`. `app.js`, `index.html` e `production-v217.js` na raiz são fontes de entrada preservadas; os arquivos compilados e o badge em dist são v2.17.6. Para desenvolvimento local, executar o build e servir dist. Não servir a raiz esperando os recursos novos. Não publicar a raiz sem build. Não editar dist como fonte; qualquer mudança nas âncoras deve atualizar/testar o build. O build falha se a fonte mudou de forma incompatível. Não existe transformação de código no navegador.

O vercel.json declara build/outputDirectory e usa regras de header simples válidas, substituindo a expressão inválida historicamente contornada em deploys manuais. Scripts, SQL, metadados e memória não entram no output público. O deploy desta revisão baixou o commit exato no build da Vercel e executou o mesmo script versionado, não um patch de runtime fora do GitHub.

### Validações executadas
- Preview `dpl_84HdLYzecdpLUKHcknWkLACcnuNa`: build e testes concluídos; produção repetiu o build do mesmo commit.
- `validate-static.mjs`, `test-lettering.mjs`, `test-free-rotation.mjs`, `test-film-jobs.mjs`, `test-film-draft.mjs`, `test-film-cloud-draft.mjs` (14 cenários), `test-queues.mjs` e `test-v2176.mjs` passaram.
- Chromium isolado, sem conexão com a conta real: CESAR/CÉSAR, JOAO/JOÃO, CONCEICAO/CONCEIÇÃO, ABIDAO/ABIDÃO, OCTAVIO/OCTÁVIO mantiveram escala do corpo; texto e sinais preservados. DAVID em fonte de teste teve redução de excesso entre cantos no modo óptico. SVG sintético Á manteve corpo 5,5 cm e caixa total maior.
- Interface de rascunhos em viewport 390 px: salvar antes de novo filme, preservar montagem se gravação falhar, carregar outro após backup e listar duas cópias passaram com serviço simulado.
- PNG único continua exigido pelo build. O fluxo TIFF/Spot não foi implementado.
- Não confundir testes controlados com teste autenticado de políticas/dados ou impressão no RIP do usuário.

## PENDENTE — TIFF com Spot, NÃO implementar agora
Usuário adiou explicitamente essa função. Manter somente PNG nesta revisão.
- Futuro botão separado: Baixar PNG / Baixar com Spot (TIFF), preservando PNG atual.
- Fluxo confirmado pelo usuário: RGB → CMYK → curva no composto CMYK, entrada 54 / saída 34 na escala Pigmento/Tinta % → carregar transparência da camada → Cor Spot 1 branco → TIFF 300 DPI no tamanho físico correto.
- Pixels transparentes não recebem branco; antialias/transparências parciais precisam ser preservados. Solidez 100% no Photoshop é configuração de visualização, não assumir que define diretamente a quantidade física de tinta.
- Configuração fotografada: TIFF clássico, sem compressão de imagem, pixels intercalados, bytes PC IBM, camadas RLE; Salvar transparência aparentemente desmarcado. Investigar arquivo real, não inferir a estrutura por screenshot.
- RIP adaptado usa CMYW, sem tinta K física; não descartar K do arquivo CMYK sem analisar o processamento real do RIP.
- Referências recebidas: `filme-completo-recortado (3).png` e `filme-completo-recortado (3).tif`. Reanalisar diretamente ambos antes de afirmar número de canais, perfil ICC, convenção/inversão do Spot ou compatibilidade.
- Confirmar perfil ICC/conversão do Photoshop, curva completa e estrutura/tag do Spot no TIFF; validar arquivo teste no Production Manager antes de tratar como pronto para impressão.
