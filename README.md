# Zero 19 — Área de Clientes / 019 Personalizações

Sistema interno da Zero 19 para atendimento de empresas/clientes, projetos, artes, mockups, orçamentos, equipe, produtividade e biblioteca de demonstrações de qualidade.

## Regra principal de manutenção

Antes de qualquer alteração, leia **`PROJECT_MEMORY.md` inteiro**. Ele é a memória canônica do projeto e registra requisitos, bugs corrigidos, decisões técnicas e regras de não regressão.

Fluxo obrigatório: **ler memória → registrar nova versão → alterar → validar → commit no GitHub → publicar produção**.

## Produção

- `https://019-personalizacoes.vercel.app`
- Banco/Auth/Storage: Supabase já conectado.
- Versão de recuperação atual: **v2.10.1**.

## Fonte de verdade

Repositório: **`uniquessatacado/zero19areaclientes`**, branch `main`.

Arquivos/áreas principais:
- `index.html` — boot da versão em produção.
- `runtime-bundle/` — bundle completo versionado da aplicação (`bundle.00.txt` a `bundle.07.txt`).
- `demo.html` — preview público de vídeos de demonstração.
- `PROJECT_MEMORY.md` — memória obrigatória, requisitos e histórico.
- `vercel.json` — cache/aliases durante estabilização.
- `scripts/` e `source-v210*` — material de reconstrução/migração da base atual.

## Falhas que não podem voltar

1. Não usar `DecompressionStream` nativo no navegador. Ele causou **Failed to decode data** em dispositivos reais.
2. Não carregar código buscando um deployment Vercel antigo. Isso causou **Failed to fetch**.
3. Não publicar bundle incompleto. Conferir sempre as partes esperadas.
4. Não fazer redesign global nem CSS de compactação por cima do layout aprovado.

## Boot v2.10.1

Para recuperar a produção sem o erro de decode, o `index.html` atual usa `fflate` em JavaScript e carrega o bundle versionado deste próprio repositório, com fallback Raw GitHub/jsDelivr. O bundle está completo de `bundle.00.txt` a `bundle.07.txt`.

A evolução preferida, depois de consolidar deploy Git→Vercel, é servir `index.html + app.js + styles.css` diretamente do mesmo deployment e eliminar o bundle remoto sem reintroduzir os bugs já corrigidos.
