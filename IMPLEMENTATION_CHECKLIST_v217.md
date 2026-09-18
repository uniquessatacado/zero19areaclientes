# Revisão local v2.17.3 — checklist vivo

Não confundir código local/testes simulados com validação autenticada ou publicação. Usuário autorizou atualizar GitHub e depois Vercel, após a regressão integrada. Publicação ainda em andamento.

## Fila corrente — fonte de verdade (18/09, revisão na nuvem)

- [x] Conector oficial Supabase restabelecido; migrations de custos, financeiro, montagens, filme em edição, apresentações públicas e integridade aplicadas.
- [x] Teste real de RLS com rollback: titular autorizado; funcionário/anon sem custos/financeiro; equipe lê montagens; filme em edição isolado por usuário; conflito de revisão e exportação duplicada bloqueados. Nenhum dado fictício permanente.
- [x] Custos agora têm nuvem canônica; 8 compras antigas em fixture preservadas, transferência explícita e conflitos sem sobrescrita. Nenhum novo salvamento local.
- [x] Estúdio independente salva montagens na conta; rascunhos antigos apenas para transferência segura.
- [x] Filme em edição com salvamento na nuvem por conta/usuário e aviso de sincronização; migração de rascunho antigo sem apagar antes de confirmar.
- [x] Seletor do Studio paginado (24), filtros empresa/cliente/nome/data, seleção entre páginas; no máximo duas prévias simultâneas e resolução original de impressão preservada.
- [x] Corrigido falso bloqueio de link 3D em artes antigas enviadas por funcionário: validar propriedade no cadastro, não prefixo do arquivo.
- [ ] Revisão visual 3D: ombros/caimento/enquadramento de normal e oversized; modal com CSS real do aplicativo no PC/mobile.
- [ ] Apresentação do cliente: link com vistas empilhadas e PDF sem abas. Código pronto; validação visual/integrada em andamento.
- [ ] Testes finais de galeria pública, 3D público, montagem cloud, filme cloud e financeiro integrado.
- [ ] GitHub atualizado com fontes, testes, migrations e licenças (sem caches/segredos); Vercel publicado a partir da mesma revisão e links externos conferidos.

Os itens históricos abaixo registram entregas anteriores. Quando mencionam rascunho local ou bloqueio do conector, foram substituídos pela fila corrente acima.

## Pedidos anteriores preservados

- [x] Manter identidade visual escura/laranja e refinar mobile/nav inferior.
- [x] Time aparece mesmo sem camisa; camisa contém fontes/números, All Sponsor e arte especial.
- [x] Campo de medida, proporção, halftone e liberação para impressão em artes antigas.
- [x] Upload fora de Artes prontas tem opção desligada; dentro tem pronta automática, pendência visível sem medida.
- [x] Seletor visual de artes com empresas/clientes, busca, seleção múltipla entre empresas.
- [x] Conta-gotas global manual com tolerância, desfazer/refazer, salvar cópia/atualizar, preservar original.
- [x] Provador individual preto/branco, frente/costas/mangas com medidas calibráveis.
- [x] Filas: projeto ativo, qualquer orçamento pago do projeto, badges e aviso de configuração de etapas.
- [x] PDF paginado, texto selecionável, logo oficial, última versão compartilhada.
- [x] Consulta de projetos antigos isolada, sem trocar o projeto ativo.
- [x] Preparador visual multi-SVG e fonte oficial, cobertura Unicode, espaçamento e dimensões na exportação.
- [x] Nesting com medidas exatas, margem/gap conservador, alpha, halftone e travas por cópia.
- [x] Jobs preservam snapshot e arquivo da época; salvamento incompleto não aparece como concluído.

## Refinamentos do filme solicitados ao vivo

- [x] Mostrar imagem real e transparência; calcular automaticamente após adicionar.
- [x] Quantidade visível no card da seleção e editável depois de adicionar.
- [x] Editar medida e quantidade sem remover/reinserir; recalcular encaixe.
- [x] Centralizar prévia e trocar fundo apenas para visualização.
- [x] Arraste procura ponto válido mais próximo dentro do filme sem sobrepor pixels.
- [x] Limitar viewport do filme e liberar propagação da rolagem; toque móvel rola por padrão.
- [x] Regressão de 101 peças, mouse/rodinha propagando entre painéis e gestos touch reais no Edge.
- [x] Exportar filme completo OU bounding box dos pixels em PNG transparente 300 DPI, sem redimensionar arte. RGBA comparado pixel a pixel.
- [x] Otimizar com rotação livre opt-in; heurística em passos 15/30 graus, ângulo manual, colisão/render/export físicos consistentes. Testados 30° e 37,25°.
- [x] Rascunho do filme por aba/conta recupera itens e posições no F5, sem confundir com job salvo na nuvem; fonte privada regenerada e falha explícita sem substituição.

## Pedidos adicionais: navegação e orientador

- [x] Ao mudar de rota, abrir no topo; ao recarregar, conservar rota e restaurar rolagem, inclusive imagens carregadas depois de 4,9 s.
- [x] Evitar redesenho e redirecionamento indevido a cada atualização de token; contexto e caches não podem atravessar identidades.
- [x] Orientador por projeto: pendências concretas, próximo passo, alertas em cards e ambiente, atualização pelos dados atuais. Evidências e leitura parcial explícitas.
- [x] Usuário recusou API paga: usar orientador local, sem envio externo, e atualizar regras junto a cada funcionalidade. Não é consultor generativo nem autoaprendizagem.

## Novos pedidos de custos / estúdio completo

- [x] Cadastro de compras: filme30/60cm×comprimento, tintas por cor/volume, pó preto/branco/massa/preço. Rascunho explícito disponível; nuvem pendente.
- [x] Múltiplas configurações de impressora, ativa, troca/edição e calibração de consumo/tempo.
- [x] Custo detalhado no filme: filme, tintas por canal, pó, adicionais, comissão com escopo explícito.
- [x] Simulador rápido no início: upload local, quantidade/medidas, nesting, custo e contribuição estimada.
- [x] Estúdio com várias artes por frente/costas/mangas, travar, posições/snap e custo por quantidade. Cálculo em Worker e cancelamento ao editar/fechar.
- [x] Novos assets fotográficos: normal off-white, oversized preto/branco/off-white.
- [x] Integrar modelos/cores ao estúdio completo e persistir montagem.
- [x] Download modelo liso, vista com artes, ficha de múltiplas vistas e medidas.
- [x] Apresentação interativa 2D para cliente, sem custos; download HTML e viewer sandbox validado. Link externo depende de publicar, não funciona apontando localhost.
- [x] 3D real com GLB licenciado CC BY 4.0. Normal é adaptação explicitamente identificada do oversized; revisão de caimento ainda na fila corrente.

## Dados do RIP enviados depois

- [x] Núcleo registra CMYW, 1200×1200 dpi, saídas C70/M80/Y90/W100 e modo normal com duas camadas CMY + duas brancas.
- [x] Branco reforçado acrescenta uma camada W: estimativa relativa W3/W2 = 1,5, sem duplicar coeficientes do RIP de referência nem multiplicar filme/pó.
- [x] Tempo reforçado permanece desconhecido até medir ou selecionar explicitamente hipótese 5/4. Resolução não é usada para inventar ml de tinta.
- [x] UI dos presets RIP, edição de limites e modo reforçado, preservando preços/compras existentes; testes desktop/mobile.
- [x] Salvar na conta desabilitado quando nuvem não confirmada, com explicação por erro de schema/rede e caminho explícito de rascunho local.

## Limites que devem permanecer visíveis

- Imagens da T3170 informam médias, não consumo medido por pixel. Estimativa RGB não substitui perfil ICC/RIP, testes reais ou relatório da impressora.
- Confirmado no fornecedor:58cm úteis/60cm nominal e ~52min por metro. Tempo30cm proporcional é hipótese editável, não medição comprovada.
- Comissões são por orçamento/projeto; não existe vínculo confiável automático de cada arte à parcela daquela comissão. Não somar comissão integral como se fosse custo exato do lote parcial.
- Novas configurações precisam de nova tabela/RLS; sem aplicar migration não prometer sincronização entre aparelhos. Rascunho local deve ser explícito.
- Migration de integridade20260918044500 e quaisquer migrations posteriores ainda pendentes remotamente. Conector Supabase atingiu limite de uso; não contornar por outro cliente remoto.
- Modelo fotográfico é referência calibrável. Atlas nativos1254px (vista627px); exportação maior não cria tecido/detalhe fotográfico real adicional.
- CDR é arquivo privado; SVG único com vários caracteres ainda precisa ser separado externamente.
- Testes autenticados de gravação/RLS e revisão pelo usuário ainda pendentes. Não prometer ausência absoluta de bugs.
# Fila adicional — pedidos durante os testes ao vivo (18/09)

- [x] Acesso visível Montar camiseta nos cards e no seletor; corrigido binder antigo que sobrescrevia ações.
- [x] Estúdio independente `/studio`, começa pela camiseta lisa, biblioteca com multiseleção, mobile.
- [x] Visualizador 3D real com GLB licenciado, frente/costas/mangas, cores, órbita e exportação de imagem; normal é adaptação identificada do oversized.
- [x] Preset RIP 4 camadas e branco reforçado 5, sem duplicar coeficientes de referência.
- [x] Simulador com imagens reais; custo por arte em tintas e pó; preto usa CMY no modo CMYW.
- [x] Custos indisponíveis para funcionários e administradores delegados; titular da conta apenas.
- [ ] Financeiro privado após preparar PNG: concluir testes integrados, filtros e proteção de duplicação.
- [ ] Substituir novos rascunhos locais por armazenamento de negócio na nuvem, preservando cadastros existentes para migração segura.
- [x] Habilitar migrations remotas de custos/financeiro/montagens e testar RLS autenticada. Conector oficial restabelecido, sem bypass.
- [ ] Publicar visualizadores para habilitar links de cliente fora do localhost. Não afirmar que um link local funciona externamente.
- [ ] Regressão final após integração; revisar todos os itens anteriores, não apenas os últimos pedidos.
