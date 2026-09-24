# Zero 19 — Área de Clientes / 019 Personalizações

Aplicação de atendimento, projetos, artes, orçamentos, filas de produção e montagem DTF.

**Leia `PROJECT_MEMORY.md` e o histórico integral indicado nele antes de alterar.**

## Produção e candidata

Produção confirmada antes desta correção: **v2.17.13**. Candidata atual: **v2.17.14**.

A v2.17.14 altera somente o preflight de memória da exportação TIFF com Spot: na classe de 4 GB, quando o navegador está gravando diretamente no disco, o orçamento passa de 700 MB para 950 MB. Fallback em memória, limites de canvas, PNG, nesting, 300 DPI, Spot e demais fluxos permanecem inalterados.

## Build e desenvolvimento local

Esta revisão preserva altura-base das letras com acentos/cedilha, encaixe óptico, conferência de nomes e vários rascunhos; a 2.17.7 acrescenta cor do nome/fonte com conta-gotas e altura-base do número independente de coroas/ornamentos; a 2.17.8 melhora o editor do filme.

```sh
npm run build
python -m http.server 8080 --directory dist
```

Sirva `dist/`, não a raiz. O build aplica transformações verificadas à fonte estável anterior, valida o JavaScript e produz arquivos estáticos no mesmo domínio. Não existe loader remoto nem alteração de código em runtime. Se uma âncora do código de entrada mudar, o build para para revisão em vez de aplicar uma modificação às cegas. As fontes de entrada da raiz ainda identificam v2.17.5; o build atual produz o artefato compilado v2.17.14.

## Fontes da revisão

- `lettering-layout-v2176.js`: métrica do corpo sem sinais e espaçamento óptico por contorno.
- `film-saved-drafts.js`: cópias independentes no banco e conferência do texto original.
- `scripts/film-v2176-functions.txt`: integração no controlador de filme.
- `scripts/build-v2176.mjs`: build e testes, saída `dist/`.
- `scripts/test-v2176.mjs`: regressões novas.
- `versions/PROJECT_MEMORY-pre-2.17.6.md`: histórico anterior integral e preservado.

O restante do sistema permanece no mesmo Supabase/GitHub/Vercel. Nenhuma migration nesta revisão. Cópias de rascunho usam print jobs existentes, distintas do autosave da edição atual. Os testes com serviços simulados não substituem um fluxo autenticado completo nem impressão física.

Exportação PNG continua em arquivo único transparente 300 DPI. O TIFF CMYK + `Cor Spot 1` já está implementado; a v2.17.14 apenas amplia, de forma localizada, a margem segura para gravação direta em disco em computadores classificados pelo navegador como 4 GB.

Commits devem conter `[skip bootstrap]` para impedir que o workflow histórico v2.12 tente reconstruir a fonte antiga.
