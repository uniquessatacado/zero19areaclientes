# 019 Personalizações — Memória canônica

## v2.17.9 — correções do filme, desempenho e TIFF CMYK + Spot (20/09/2026)

- O usuário aprovou o diagnóstico e pediu implementar `Baixar com Spot`; isso substitui o adiamento histórico abaixo. Manter integralmente o PNG e as funções existentes.
- Antes da alteração: `main` local/remota `53f1d20a28f259f995a68bb9b560145c433245ea`; build candidato 2.17.8, domínio oficial consultado sem cache ainda 2.17.7, deployments Vercel conferidos (produção READY `dpl_CTdLsi6kwjdimT6kbAFPyLg58cMa`). Próxima candidata: **2.17.9**. Não está publicada.
- Diagnóstico: ICC sRGB → ICC real `SWOP (Brilhante), 20%, GCR, Média`, relativo + BPC, LittleCMS NOOPTIMIZE; curva composta fixa ACV 117→168 (equivalente visual 54→34% tinta), validada exatamente com TIFF antes/depois da curva. Resíduos finais da conversão de até 2/255 nas três amostras; não prometer equivalência universal ao Adobe ACE.
- TIFF de referência: Classic II, 8 bits, CMYK+Spot5 intercalados, composto sem compressão, 300 DPI, sem ICC final (IRB1041=1); Spot `Cor Spot 1`, branco, Solidity100, metadados Photoshop de nome/tipo/identificador. Byte Spot=`255-alpha`, composição CMYK=`round(ink*alpha/255)`, confirmados nos arquivos reais. Preservar K apesar de impressora física CMYW.
- Plano: processamento em faixas/Worker, ICC local em WASM, TIFF contínuo com escrita incremental quando disponível, fallback limitado por memória, progresso/cancelamento; sem remeter artes a serviços externos. Preservar o renderer e geometria PNG, inclusive rotação livre/recorte.
- Implementados encoder TIFF, Worker com LittleCMS local, botão `Baixar com Spot`, gravação incremental no Chrome/Edge e fallback limitado por memória. PNG preservado como opção separada. Canal branco validado contra alpha; confirmação financeira compartilhada para não duplicar PNG+TIFF no mesmo modal. Progresso, cancelamento antes da finalização, limpeza de recursos e guardas de conta.
- Comparação privada dos 15.122.338 pixels das três amostras: Spot exato; CMYK com diferença máxima de 2/255. `writeSpotCanvas` real processou 6850×17717 em 277 faixas (606.807.686 bytes, 66,43 s) para um sink de teste, não uma prova de memória do canvas inteiro nem impressão física.
- Publicação ainda não concluída: em 20/09 `vercel whoami` executado no contexto normal do usuário retornou token inválido. A conexão de leitura Vercel não fornece uma ação de publicação operacional (bloqueio histórico abaixo). Não declarar o domínio atualizado por causa do build local.
- Pendente obrigatório: conferir o primeiro TIFF no Production Manager/RIP do usuário. Não declarar compatibilidade de produção DTF nem cores de impressão idênticas sem esse teste.
- Evidências locais privadas em `tmp/spot-diagnostic/DIAGNOSTICO-ETAPAS-CMYK-CURVA.md` e relatórios anexos; não publicar as artes de referência nem dados pessoais dos TIFFs.

### Correções urgentes pedidas durante esta implementação
- **Excluir não reorganiza.** O X da lista remove todas as cópias daquele item; Delete/Backspace/Excluir selecionado remove só a cópia. `film-edit-core.js` preserva coordenadas, ângulos, travas, medidas e comprimento. O espaço fica vazio até `Reorganizar livres`/`Calcular filme`. Autosave permanece em segundo plano; não executa SELECT nem Worker de encaixe por causa da exclusão.
- Causa de `Cannot read properties of null (reading 'filmWidthMm')`: exclusão invalidava o layout enquanto callbacks antigos da prévia ainda o acessavam. Gerações de cálculo/prévia/conta, identidade do layout e DOM guardam callbacks antes/depois dos awaits. Filmes vazios desabilitam exportação/salvamento; custos e percentuais obsoletos são invalidados, não apresentados como atuais.
- Encaixe: comparar 90° no modo normal e múltiplas ordens/estratégias retangulares junto com a busca por alpha. Uma montagem anterior válida é candidata e nunca é trocada por outra mais comprida. Mantidos gap, limites, dimensões, travas, permissões de rotação e proteção de halftone. Busca limitada e determinística; não alegar ótimo global.
- Testes de aproveitamento: arte 180×300 mm passou de 300 para 180 mm; lote de oito artes, de 604 para 510 mm; 101 artes, normal 5592→3868 mm e máximo 3951→3868 mm. Valores de fixtures, não medição do filme real do usuário.
- Desempenho: miniaturas já existentes nas galerias, reuso de elementos de imagem no seletor/filtros, decoding assíncrono e leituras iniciais em paralelo. Exportação sempre usa o original/processado, nunca thumbnail. Sem thumbnail disponível, o primeiro download ainda depende do arquivo original/rede.
- `network-read.js`: no máximo uma retentativa de GET/HEAD da Data API para falhas transitórias, prazo de 15 s cobrindo corpo da resposta, cancelamento e limite explícito de resposta. Não repete autenticação/RPC/escritas/401/403, não armazena cache nem registra filtros/tokens. Causa específica do `Failed to fetch` do usuário não comprovada; não confundir resiliência com correção da rede externa.
- Troca de conta fecha o seletor de artes e exportador, descarta callbacks antigos e bloqueia registros financeiros de exportação da conta anterior. Leituras de configuração com erro não podem parecer contagem zero e inserir padrões indevidamente.
- Build passou com as 40 suítes Node, incluindo financeiro, custos, rascunhos, autenticação, fontes, filas, montagem e TIFF. Fixtures Edge desktop/celular conferiram X, cópia, vazio, posições preservadas, respostas atrasadas, worker real, Spot versus todos os pixels alpha, DPI e confirmação financeira única. Não houve acesso à sessão real do usuário nem alteração de RLS/banco.
- O build agora aplica a versão 2.17.9 ao grafo local de módulos/Workers para evitar mistura com imports antigos em cache. Continua estático, sem transformação de código no navegador, CDN novo ou envio das artes a terceiros.
- Correção comprovada no recorte PNG: renderizar antecipadamente numa prancheta menor/deslocada alterava RGB em 1/255 em 18 pixels da fixture girada 90° (alpha intacto). Experimento com matriz exata não resolveu; usar a origem original do filme e só depois recortar o alpha zerou as diferenças. PNG e TIFF agora usam essa mesma origem; memória/preflight considera a prancheta inteira. Dimensões, desenho, DPI e posições mantidos. Teste estrito full→trim, inclusive 37,25°, passou sem tolerância extra.

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
- Não confundir testes controlados com validação de políticas na conta real nem com impressão no RIP do usuário.

## PENDENTE — TIFF com Spot, NÃO implementar agora
Usuário adiou explicitamente essa função. Manter somente PNG nesta revisão.
- Futuro botão separado: Baixar PNG / Baixar com Spot (TIFF), preservando PNG atual.
- Fluxo confirmado pelo usuário: RGB → CMYK → curva no composto CMYK, entrada 54 / saída 34 na escala Pigmento/Tinta % → carregar transparência da camada → Cor Spot 1 branco → TIFF 300 DPI no tamanho físico correto.
- Pixels transparentes não recebem branco; antialias/transparências parciais precisam ser preservados. Solidez 100% no Photoshop é configuração de visualização, não assumir que define diretamente a quantidade física de tinta.
- Configuração fotografada: TIFF clássico, sem compressão de imagem, pixels intercalados, bytes PC IBM, camadas RLE; Salvar transparência aparentemente desmarcado. Investigar arquivo real, não inferir a estrutura por screenshot.
- RIP adaptado usa CMYW, sem tinta K física; não descartar K do arquivo CMYK sem analisar o processamento real do RIP.
- Referências recebidas: `filme-completo-recortado (3).png` e `filme-completo-recortado (3).tif`. Reanalisar diretamente ambos antes de afirmar número de canais, perfil ICC, convenção/inversão do Spot ou compatibilidade.
- Confirmar perfil ICC/conversão do Photoshop, curva completa e estrutura/tag do Spot no TIFF; validar arquivo teste no Production Manager antes de tratar como pronto para impressão.

## v2.17.7 — cor da fonte e altura-base dos números (EM VALIDAÇÃO)

Pedido atual:
- permitir definir a cor do nome/fonte de uma camisa, inclusive com conta-gotas sobre a cor exibida do número;
- preservar essa cor como configuração da personalização daquela camisa;
- fazer a altura padrão do número (ex.: 28 cm) valer para o **corpo do algarismo**, sem contar coroa/ornamentos destacados acima ou abaixo.

### Cor do nome
- O preparador de Fontes e números passa a carregar `z19p_customization_palettes`.
- Campo **Cor do nome / fonte** com seletor manual, HEX e botão **💧 Pegar cor do número** usando `EyeDropper` quando o navegador oferece a API.
- O usuário pode ativar a gotinha e clicar diretamente numa cor visível do número/SVG na tela.
- Se `EyeDropper` não existir, o seletor manual continua disponível.
- A cor é persistida em `z19p_customization_palettes` com `role='name'`; o vetor do número não é recolorido nem alterado.
- Alterar a cor coloca a personalização novamente em preparação/teste, como outras alterações da fonte.
- Nenhuma migration nova: a tabela/papel `name` já existem.

### Altura do número com coroa/ornamento
- Nova receita `letteringMetricsVersion:3`.
- Para SVG de número, o sistema mede o alpha real e detecta faixas verticais desconectadas.
- Quando existe uma faixa dominante clara (ex.: corpo grande do 0 + coroa pequena separada), somente a faixa dominante define os 28 cm; a coroa permanece acima e aumenta a caixa total.
- Se o SVG tiver partes ambíguas sem corpo dominante, usar a caixa completa de forma conservadora em vez de adivinhar/cortar.
- Em números múltiplos/unificados, os corpos ficam alinhados na mesma linha; ornamentos podem ultrapassar acima/abaixo sem reduzir os algarismos.
- Rascunhos/jobs antigos só mudam ao recalcular, preservando compatibilidade.

### Não regressão
- Não alterar PNG único 300 DPI, nesting, rascunhos, pagamentos, projetos ou TIFF/Spot pendente.
- Cores internas dos SVGs oficiais continuam preservadas.
- A função TIFF com Spot permanece **pendente e não implementada** nesta revisão.

Estado: candidata v2.17.7 em branch de validação; não declarar publicada antes de preview READY, testes e confirmação do domínio canônico.

## v2.17.8 — editor de filme rápido e preview nítido (EM VALIDAÇÃO)

Pedido urgente:
- botão para limpar todos os itens do filme de uma vez, sem remover um por um;
- ao selecionar arte/nome/número no filme, permitir excluir com botão e teclas Delete/Backspace;
- zoom deve mostrar a melhor qualidade disponível, principalmente números vetoriais.

### Limpeza e exclusão
- `Limpar filme` esvazia a montagem aberta de uma vez após confirmação; não apaga artes, fontes, jobs nem rascunhos nomeados.
- A limpeza atualiza o editor imediatamente e sincroniza o autosave em segundo plano, sem recarregar todas as tabelas do módulo.
- No preview, item selecionado ganha botão `Excluir selecionado`.
- Clique/toque seleciona e dá foco ao item; Delete ou Backspace remove a cópia selecionada.
- Se a origem tem quantidade > 1, excluir uma cópia decrementa a quantidade em 1; se era a última, o item sai da lista.
- Depois da exclusão, somente o nesting é recalculado; não é necessário refazer toda a consulta da tela.

### Qualidade do preview
- Zoom máximo do preview passa de 200% para 400%.
- Dígito isolado com SVG oficial usa o próprio SVG como fonte visual do preview, mantendo nitidez vetorial no zoom.
- Nomes e composições que precisam de rasterização passam a gerar prévia de até ~1600 px, em vez do raster pequeno anterior.
- Rascunhos antigos com prévia de baixa resolução são regenerados automaticamente ao serem recuperados.
- Artes de empresa continuam usando o arquivo original pela URL pública; exportação final não usa a prévia de tela.

### Não regressão
- Preservar v2.17.7: cor da fonte/nome e altura-base dos números sem contar coroa/ornamentos.
- Preservar PNG único 300 DPI, transparência, nesting, rascunhos, jobs, custos e Supabase.
- TIFF/Spot permanece pendente e não entra nesta revisão.

Estado: candidata v2.17.8; publicar somente depois de build/preview e confirmação do domínio oficial.

## 18/09/2026 — diagnóstico do bloqueio de publicação da v2.17.8
- Reconsulta do domínio oficial retornou HTTP 200 com `z19-version="2.17.7"`. Isso atualiza a informação histórica de produção acima; a v2.17.8 ainda NÃO foi publicada nem validada ponta a ponta.
- A ação oficial `Vercel.deploy_to_vercel({})` retornou JSON-RPC `-32602`, mensagem `Tool deploy_to_vercel not found`. Essa tentativa não iniciou um deployment; não tratar como build lento ou aguardando propagação. O motivo interno da indisponibilidade da ação não foi determinado.
- O job de diagnóstico GitHub Actions `105788042245`, run `35403418521`, terminou em `failure`, sem passos/logs disponibilizados. Não concluir que faltam créditos, token ou permissões sem evidência adicional.
- Encontrada inconsistência independente no código de build: `production-v217.js` passou a chamar `drawFilm(media)`, mas `scripts/build-v2176.mjs` ainda procurava a linha `drawFilm()` e a emitia sem `media`. A guarda `replaceOnce` não encontra essa âncora antiga e interromperia o build.
- Correção mínima no commit `2d0d5606ba79c53dc947e48fdc20013ad8e7c8d2`: atualizar a âncora e a linha emitida para `drawFilm(media)`. Mantida a versão candidata 2.17.8; nenhum módulo funcional, banco, RLS ou domínio alterado nesta correção.
- Validação executada: cópia original conferida pelo Git blob SHA `bccc21e7f92405db8508bc0d5acbb5c7e35aa632`; `node --check` no script corrigido passou; teste focal reproduziu ausência da âncora antiga e ocorrência única da nova na linha-fonte consultada.
- Limite: build completo, testes autenticados e deployment da candidata ainda pendentes. A tentativa de obter o checkout completo neste ambiente falhou na resolução DNS do host do arquivo GitHub. Não apresentar o teste focal como execução de `npm run build`.
- Prevenção: executar o script de build versionado real; não usar uma transformação manual diferente do repositório como prova de que o build está pronto. Não repetir chamadas de deployment inexistente como se fossem trabalhos em progresso.
