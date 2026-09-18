# Zero 19 — Área de Clientes / 019 Personalizações

Aplicação de atendimento, projetos, artes, orçamentos, filas de produção e montagem DTF.

**Leia `PROJECT_MEMORY.md` e o histórico integral indicado nele antes de alterar.**

## Build v2.17.6

Esta revisão contém altura-base das letras com acentos/cedilha, encaixe óptico entre letras, conferência de nomes e vários rascunhos de filme no banco.

```sh
npm run build
python -m http.server 8080 --directory dist
```

Sirva `dist/`, não a raiz. O build aplica transformações verificadas à fonte estável anterior, valida o JavaScript e produz arquivos estáticos no mesmo domínio. Não existe loader remoto nem alteração de código em runtime. Se uma âncora do código de entrada mudar, o build para para revisão em vez de aplicar uma modificação às cegas. As fontes de entrada da raiz ainda identificam v2.17.5; a versão do artefato compilado é v2.17.6.

## Fontes da revisão

- `lettering-layout-v2176.js`: métrica do corpo sem sinais e espaçamento óptico por contorno.
- `film-saved-drafts.js`: cópias independentes no banco e conferência do texto original.
- `scripts/film-v2176-functions.txt`: integração no controlador de filme.
- `scripts/build-v2176.mjs`: build e testes, saída `dist/`.
- `scripts/test-v2176.mjs`: regressões novas.
- `versions/PROJECT_MEMORY-pre-2.17.6.md`: histórico anterior integral e preservado.

O restante do sistema permanece no mesmo Supabase/GitHub/Vercel, com autenticação, RLS, clientes, projetos, comissões, catálogos e layout preservados. Nenhuma migration nesta revisão. Cópias de rascunho usam print jobs existentes, distintas do autosave da edição atual.

Exportação continua em um único PNG transparente 300 DPI. TIFF com Cor Spot 1 está apenas especificado na memória, sem implementação nesta versão.

## Publicação

Candidata v2.17.6: só chamar de publicada após build/testes, commit rastreável, deployment READY e conferência do domínio canônico `https://019-personalizacoes.vercel.app`, incluindo scripts executáveis.
