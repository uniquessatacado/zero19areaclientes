# Zero 19 — Área de Clientes / 019 Personalizações

Sistema interno da Zero 19 para atendimento, empresas, projetos, artes, mockups, orçamentos, equipe, produtividade e biblioteca de demonstrações de qualidade.

## Produção

- Site: https://019-personalizacoes.vercel.app
- Supabase: projeto já configurado no front com chave publishable.
- Produção atual: **v2.15.1**.
- Candidata local para teste: **v2.16** (ainda não publicada).

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
