# Zero 19 — Área de Clientes / 019 Personalizações

Sistema interno da Zero 19 para atendimento de empresas/clientes, projetos, artes, mockups, orçamentos, equipe, produtividade e biblioteca de demonstrações de qualidade.

## Regra principal de manutenção

Antes de qualquer alteração, leia **`PROJECT_MEMORY.md` inteiro**. Esse arquivo é a memória canônica do projeto e registra requisitos, bugs corrigidos, decisões técnicas e regras de não regressão.

Fluxo obrigatório: **ler memória → registrar a nova versão → alterar → validar preview → commit → publicar produção**.

## Produção

- https://019-personalizacoes.vercel.app
- Banco/Auth/Storage: Supabase já conectado.

## Arquivos principais

- `index.html` — boot simples e estático.
- `styles.css` — layout responsivo aprovado.
- `app.js` — aplicação principal.
- `demo.html` — preview público de vídeos de demonstração.
- `PROJECT_MEMORY.md` — histórico e memória obrigatória.
- `vercel.json` — política de cache durante estabilização.

## Falha que não deve voltar

Não usar loader com chunks gzip/base64 + `DecompressionStream` no navegador para iniciar o sistema. Essa arquitetura causou **Failed to decode data / Failed to fetch** em produção. A partir da v2.10, o app deve iniciar com arquivos estáticos normais.
