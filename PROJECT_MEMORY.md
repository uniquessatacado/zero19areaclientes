# 019 Personalizações — Memória Canônica do Projeto

> **LEITURA OBRIGATÓRIA ANTES DE QUALQUER ALTERAÇÃO.** Este arquivo é a fonte de continuidade do projeto. Antes de mexer: ler tudo, identificar a versão atual, concluir qualquer etapa aberta, registrar a próxima versão e preservar as funções existentes. Depois: validar, commitar no GitHub e só então publicar. Nunca chamar uma versão de publicada sem confirmar o domínio canônico.

## 1. Fonte de verdade e infraestrutura
- Repositório oficial: **`uniquessatacado/zero19areaclientes`**, branch **`main`**.
- Produção: **`https://019-personalizacoes.vercel.app`**.
- Vercel: projeto `019-personalizacoes` / `prj_cpZoh49CdDlYP0h82gwXCbR4nyw3`, team `team_88LTzdT7GLfKgRlzjvr1eF8c`.
- Supabase: `kedggjyerexnzmipaick`; tabelas prefixo `z19p_`; bucket `z19p-assets`.
- Administrador principal: Clovis.
- Visual canônico: tema escuro + laranja Zero 19, responsivo, sem compactação exagerada. O layout aprovado da fase v2.5 continua referência.
- Logo: usar **somente o logo oficial Zero 19**. O zero é estilizado/escrito; não recriar como número `0`. Em fundo escuro, usar cápsula branca/alto contraste quando necessário. No topo interno, apenas logo oficial + badge da versão; não repetir `019 Personalizações` ao lado.
- Versão deve aparecer no ambiente interno/login/admin. **Não exibir versão nas páginas públicas do cliente.**

## 2. Regras absolutas de não regressão
1. Nunca remover função existente para adicionar outra sem registrar e validar impacto.
2. Nunca redesenhar globalmente para encaixar feature nova; usar mudanças localizadas.
3. Se chegar novo pedido durante mudança em andamento, terminar a mudança atual primeiro.
4. Todo bug resolvido entra aqui com **causa, correção e prevenção**.
5. Toda versão publicada precisa de commit rastreável + deployment READY + domínio canônico validado.
6. Nunca reintroduzir remoção automática de fundo.
7. Mockup não recebe recorte/upscale de arte.
8. Senhas de funcionários nunca ficam visíveis ao administrador; convite/reset seguro.
9. Preservar autoria de ações e criador original da empresa.
10. Não usar CSS global agressivo com muitos `!important`; isso já destruiu o layout.
11. Navegação SPA precisa trocar tela no clique, sem refresh manual.
12. Mobile não pode ter overflow horizontal.
13. Nome de pasta aparece completo; não esconder com `...`.
14. Não iniciar produção buscando deployment Vercel histórico.
15. Não usar `DecompressionStream` nativo no boot; já causou `Failed to decode data`.
16. Se houver pacote/chunks de compatibilidade, validar todas as partes e o payload antes de publicar.
17. HTTP 200/READY sozinho não basta: o boot precisa ser validado e erro de sessão local não pode derrubar o app.

## 3. Empresas, clientes e atendimento
- Criar/editar/excluir empresa; cliente, WhatsApp, UF, observações e status configurável.
- Status padrão: Em atendimento; Aguardando chegar o produto; Cliente não responde; Desistiu; Remarcado; Finalizado.
- Empresa não finalizada mostra há quanto tempo está no status. Após 24h sem **mudança de status**, sobe na prioridade e recebe alerta até o status mudar. Só mudança de status zera o tempo.
- WhatsApp no card; `Desistiu` registra data; `Remarcado` tem retorno/data.
- Mostrar criador e responsável atual separadamente. `Puxar pra mim` troca responsável e abre WhatsApp; criador original permanece.
- Reabrir Finalizado cria novo projeto da mesma empresa, preservando histórico.
- Perfil interno mostra histórico e gastos (camisas, estampas, total). Área pública não precisa mostrar financeiro acumulado.
- Exclusão segura: histórico/audit não pode bloquear exclusão por FK. Bug v2.11 corrigido e testado.

## 4. Artes, mockups, pastas e bibliotecas
- Upload múltiplo; nome por arquivo; editar/mover/excluir; download PNG; preview checker/branco/preto.
- Recorte transparente no limite real sem cortar antialias; PNG 300 DPI; presets Original/4032/6000/8192; nunca reduzir original maior.
- Remoção automática de fundo: removida de propósito.
- Mockups separados de artes de produção.
- Pastas/subpastas por empresa; padrões: Artes enviadas pelo cliente, Artes prontas, Logo da empresa, Mockups. Configuráveis.
- Logo da empresa pode substituir placeholder no card.
- Bibliotecas internas Artes, Mockups e Vídeos; ponte celular ↔ computador.
- Pendente futuro: integração Google Drive via OAuth/API, não scraping.

## 5. Orçamentos / produtos / estampas / arte
- Orçamento por empresa; produto, quantidade, prazo, observações; peça + estampas separadas ou valor total por peça personalizada.
- Produtos padrão incluem 30.1, Oversize Suedine, Oversize 100% algodão, Pima Egípcia, Malha Peruana, Cotton, Dry Fit Premium e Dry Fit com Poliamida.
- Demonstração de qualidade deve usar o mesmo produto cadastrado em `z19p_products` usado no orçamento.
- Faixas padrão: **1–4, 5–19, 20–49, 50+**, editáveis/adicionáveis/removíveis/reordenáveis.
- Preço da qualidade por faixa pode preencher preço da peça no orçamento.
- Catálogo de estampas/regras: camisa normal ou camisa de time; posições Peito esquerdo, Peito direito, Peito central, Barriga, Manga direita, Manga esquerda, Nuca, Costas, Mega frente e Mega costas; largura/altura máximas; valor avulso/combinado; faixa de quantidade; preço por tamanho e, em camisa de time quando aplicável, por letra/número/especial.
- UI de estampa usa mockup visual de camiseta com indicação aproximada da posição e tamanho.
- Criação/preparação da arte: valor por arte distinta; PNG pronto pode ser grátis; permitir faixa mínima a partir da qual criação vira brinde, deixando desconto/brinde visível no orçamento.

## 6. Área pública do cliente
- Link compartilhável por empresa; orçamento, artes, mockups, downloads permitidos, vendedor responsável + WhatsApp e horário 9h–18h.
- Banner para **Demonstrações de Qualidade** e **Portfólio**.
- Empresa finalizada mantém área para consulta/download.
- Pendente opcional: upload de imagem pelo próprio cliente na área pública.

## 7. Equipe, auditoria e produtividade
- Clovis admin; área Equipe; convite com nome, WhatsApp e e-mail; funcionário define própria senha; reset seguro.
- Mesma equipe compartilha base conforme regras do banco.
- Audit log para acessos e ações relevantes; criador e responsável atual preservados.
- Produtividade admin: Hoje, Ontem, 7 dias, 30 dias, mês passado, mês específico, intervalo customizado, filtro por vendedor; cadastros, UF, projetos, finalizados, ativos, status, +24h, desistências e faturamento camisas/estampas/total.

## 8. Demonstrações de qualidade
- Página pública única `/qualidades.html`; link geral começa no topo e link específico faz deep-link até o produto.
- Produto: qualidade do tecido, composição, descrição, medidas, preços por faixas, **até 1 vídeo + 3 fotos**.
- Vídeo limite **100 MB**.
- Vídeo visível dá autoplay; sai da viewport = pausa; nunca tocar dois simultaneamente. Áudio é controlado por vídeo; tentar som, mas respeitar bloqueio de autoplay do navegador e permitir ativar/desativar individualmente.
- Download do vídeo, compartilhar catálogo ou produto específico, ver medidas.
- Curtida deduplicada aproximadamente por hash de IP no backend; não guardar IP puro.
- Comentário pede nome + WhatsApp + texto; moderação mostrar/ocultar; botão interno para responder no WhatsApp; telefone nunca é público.
- Ordenação por menor preço e por mais curtidos.
- Templates WhatsApp configuráveis para página completa e produto específico; placeholders `{cliente}`, `{vendedor}`, `{produto}`, `{link}`.

## 9. Portfólio / provas sociais
- Página pública `/portfolio.html`.
- Caso pode se vincular a empresa existente e usar logo/nome dela.
- **Até 1 vídeo + 3 fotos**, swipe lateral, vídeo autoplay quando visível e pausa fora.
- Ordem padrão automática incremental 0,1,2,3..., editável.
- Curtir e compartilhar.

## 10. Comissões
- Sistema global liga/desliga; se desligado, nada de comissão é exibido/contabilizado.
- Configuração por vendedor e faixa de quantidade.
- Base: total da venda, somente produto/peça, somente estampa ou percentuais diferentes para peça + estampa.
- Prévia no orçamento para o vendedor.
- Comissão só nasce quando orçamento/venda é marcado **pago**; depois vai para aprovação do admin. Admin aprova, recusa e marca pagamento.
- Configurar dia semanal de pagamento.
- Vendedor vê na página inicial apenas suas comissões/parcelas.
- **Divisão de comissão:** admin pode dividir comissão entre vendedor original e usuários que ajudaram; percentuais somam 100%; opção divisão igual; total da comissão não muda; cada usuário vê só sua parcela; rateio acompanha status da comissão; bloqueado após pago/recusado.
- Estruturas principais: `z19p_commission_config`, `z19p_commission_rules`, `z19p_commissions`, `z19p_commission_shares`; RPCs `z19p_mark_quote_paid`, `z19p_set_commission_split`, `z19p_get_my_commission_summary`.

## 11. Bugs históricos importantes
### Layout destruído
- Causa: CSS global/`!important` agressivo.
- Correção: restaurar v2.5.
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
- Causa: uso de `DecompressionStream` e, numa etapa, bundle incompleto.
- Correção: abandonar `DecompressionStream`, completar partes e usar `fflate` onde compatibilidade ainda exige snapshot.
- Prevenção: validar pacote inteiro antes de publicar.

### Exclusão de empresa bloqueada por audit log
- Causa: FK do audit referenciava workspace recém-excluído.
- Correção: preservar log sem referência inválida; exclusões transacionais testadas.
- Prevenção: testar exclusões com dependências antes de publicar.

## 12. Versão atual — v2.14
### Relato
No iPhone/Safari, a v2.13 exibiu `Não foi possível iniciar o sistema` + `JSON Parse error: Invalid escape character e` antes do login. O logo também apareceu como cápsula branca vazia.

### Diagnóstico
- O snapshot `runtime-v213` foi reconstruído e o JSON compactado foi validado fora do navegador; pacote/manifest estão íntegros.
- O ponto mais compatível com o erro observado é uma sessão Supabase persistida inválida/corrompida no `localStorage`, que pode provocar `JSON.parse` interno antes da renderização.
- A v2.13 não tinha auto-recuperação de sessão local.

### Correção v2.14
- Antes do app executar, validar apenas `sb-kedggjyerexnzmipaick-auth-token`.
- Se o token existir e não for JSON válido, remover **somente esse token local**. Nenhuma empresa, arte, orçamento, vídeo ou dado de banco é apagado; o aparelho pode apenas pedir novo login.
- Se um erro de JSON escapar na primeira execução, limpar o mesmo token e recarregar uma única vez com guarda em `sessionStorage`, sem loop.
- Logo oficial agora é servido pelo **mesmo deployment** em `/zero19-logo.svg`, autocontido (imagem embutida), eliminando a dependência visual do Raw GitHub.
- Runtime preserva integralmente as features v2.13 e exibe internamente `v2.14`.
- GitHub atualizado com `versions/v2.14.md`, loaders v2.14, logo autocontido e esta memória.

### Produção v2.14
- Deployment Vercel: **`dpl_8RaTFdAs1yjkF3e4Gi3P4ZENCfv7`**.
- Estado: **READY**, target `production`.
- Aliases confirmados: `019-personalizacoes.vercel.app` e `019-personalizacoes-uniquess.vercel.app`.
- Domínio canônico confirmado HTTP 200 servindo `z19-version="2.14"`.
- Logo `/zero19-logo.svg` confirmado HTTP 200 e autocontido.
- `/qualidades.html`, `/portfolio.html`, `/comercial-admin.html` e `/demo.html` confirmados HTTP 200.

## 13. Checklist obrigatório antes de qualquer próxima publicação
- [ ] Ler este MD inteiro.
- [ ] Registrar nova versão antes de alterar.
- [ ] Validar sintaxe do JS/scripts inline.
- [ ] Preservar layout canônico.
- [ ] Não existe `DecompressionStream`.
- [ ] Não existe URL de deployment Vercel histórico no boot.
- [ ] Se houver snapshot/chunks compatíveis, validar todas as partes + parse do payload.
- [ ] Verificar login/recuperação de sessão local.
- [ ] Dashboard mobile sem overflow.
- [ ] Equipe/Dashboard/Produtividade no clique.
- [ ] Status timer/+24h, pastas, artes, mockups e orçamentos continuam funcionando.
- [ ] Vídeos, qualidade, portfólio, comentários/likes, templates WA continuam.
- [ ] Comissão, divisão de comissão, estampas e criação de arte continuam.
- [ ] Commit GitHub existe antes do deploy.
- [ ] Preview validado quando possível.
- [ ] Produção READY.
- [ ] Domínio canônico entrega a versão nova.
- [ ] Logo e rotas públicas retornam 200.
- [ ] Só depois responder ao usuário que está publicado.

**Próxima versão: v2.15.**
