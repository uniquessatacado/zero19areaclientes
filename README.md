# Zero 19 — Área de Clientes / 019 Personalizações

Sistema interno da Zero 19 para atendimento, empresas, projetos, artes, mockups, orçamentos, equipe, produtividade e biblioteca de demonstrações de qualidade.

## Produção

- Site: https://019-personalizacoes.vercel.app
- Supabase: projeto já configurado no front com chave publishable.
- Produção atualmente publicada antes desta correção: **v2.17.3**.
- Candidata desta correção: **v2.17.4** — exportação DTF em um único PNG contínuo.

## Regra de manutenção

Antes de qualquer alteração, leia **`PROJECT_MEMORY.md` inteiro**. Ele é o registro canônico de requisitos, decisões, bugs resolvidos e regras de não regressão.

Toda alteração deve seguir: **ler memória → registrar nova versão → alterar → validar preview → commit → produção**.

## Arquivos principais

- `index.html` — boot estático do sistema.
- `styles.css` — layout canônico/responsivo.
- `app.js` — aplicação principal.
- `demo.html` — redireciona deep-links antigos para o catálogo público.
- `qualidades.html` — catálogo público de demonstrações de qualidade.
- `portfolio.html` — portfólio público / provas sociais.
- `comercial-admin.html` — administração interna de qualidades, faixas, comentários e portfólio.
- `PROJECT_MEMORY.md` — memória obrigatória e histórico.
- `supabase-schema.sql` — referência do schema inicial.
- `vercel.json` — headers/cache do deploy.

## Falha que não deve voltar

Não usar loaders que baixam chunks compactados e fazem gzip/base64/`DecompressionStream` no navegador para iniciar a aplicação. Essa arquitetura causou `Failed to decode data` / `Failed to fetch` em produção. Desde v2.10 o app deve carregar arquivos estáticos normais do mesmo deployment.

## Revisão da produção DTF

Consulte `IMPLEMENTATION_CHECKLIST_v217.md` para o escopo completo, testes e pendências reais.

- Filme: seleção visual multiempresa, quantidade/medidas, organização automática, rotação livre opcional, travas, prévia com fundos de visualização e PNG transparente em 300 DPI inteiro ou recortado, sempre em **um único arquivo por filme**; não há divisão automática em segmentos.
- Estúdio: provador individual e botão **Montar camiseta completa**, com modelos normal/oversized, três cores, quatro vistas, várias estampas e exportação para apresentação. Essas imagens de mockup não são o arquivo físico DTF.
- Custos: compras e perfis de impressora, análise local das cores, estimativas e simulador sem cadastro. Preços ausentes não são tratados como zero; calibração inicial não substitui medições do equipamento.
- Orientador: verificações locais baseadas em evidências do projeto, sem API paga nem envio a IA. Não é um modelo generativo ou aprendizagem automática.

As migrations de integridade operacional, custos privados, financeiro, montagens, filme em edição e apresentações foram aplicadas ao Supabase em 18/09. Configurações e montagens usam o banco como fonte principal. Cadastros antigos locais são preservados para transferência explícita; não há novo salvamento de negócio exclusivamente no navegador. Custos/financeiro são exclusivos do titular Clovis, protegidos também por RLS.

### Verificação local

`node scripts/validate-static.mjs` valida os módulos e scripts. Os arquivos `scripts/test-*.mjs` executam regressões puras. Os scripts `*-browser-test.mjs` usam Edge isolado e fixtures locais: não substituem teste autenticado de RLS e gravação na conta real. `scripts/` não é publicado.

O visualizador `mockup-3d.html` usa uma malha real licenciada (CC BY 4.0), com cores e estampas; o corte normal é adaptação declarada do oversized. A galeria `mockup-viewer.html` lê apenas um manifesto JSON validado e mostra as vistas fotográficas empilhadas, sem abas ou execução de HTML armazenado. O PDF da apresentação contém uma vista por página. Publicações explícitas usam o bucket separado `z19p-presentations`, sem custos internos.

O seletor do estúdio consulta 24 artes por página, filtra empresa/cliente/nome/data e limita as prévias a duas requisições simultâneas. Prévia leve não altera o original utilizado na impressão.

`supabase/tests/v217_cloud_rls_rollback.sql` verificou as permissões reais de titular, funcionário e visitante, revisão otimista e exportação única; os dados fictícios foram revertidos na mesma transação. A revisão de segurança não encontrou novos alertas nos módulos criados; existem avisos históricos de outros sistemas no banco compartilhado, fora do escopo desta alteração.
