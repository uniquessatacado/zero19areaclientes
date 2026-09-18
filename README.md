# Zero 19 — Área de Clientes / 019 Personalizações

Aplicação de atendimento, projetos, artes, orçamentos, filas de produção e montagem DTF.

**Leia `PROJECT_MEMORY.md` e o histórico integral indicado nele antes de alterar.**

## Produção v2.17.6

Publicada a partir do commit `d2eb6c540ce60d0f1136d960fe0c9b8eecf0b4d3`, deployment Vercel `dpl_ZPY2K9YPLMckbJTN1gQgfpDfJKvY` READY. Domínio oficial e módulos novos conferidos. Consulte a memória para resultados e limites dos testes.

## Build e desenvolvimento local

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

O restante do sistema permanece no mesmo Supabase/GitHub/Vercel. Nenhuma migration nesta revisão. Cópias de rascunho usam print jobs existentes, distintas do autosave da edição atual. Os testes com serviços simulados não substituem um fluxo autenticado completo nem impressão física.

Exportação continua em um único PNG transparente 300 DPI. TIFF com Cor Spot 1 está apenas especificado na memória, sem implementação nesta versão.

Commits devem conter `[skip bootstrap]` para impedir que o workflow histórico v2.12 tente reconstruir a fonte antiga.
