-- 20/10 — Etiquetas de roupa: folha de 100 mm no rolo da loja (dono: "pula uma faixa de duas… a etiqueta
-- da direita está cortando o começo"). Mesmo efeito de mudar na tela: Espaço entre 4, Margem lados 1, Mover 1.
-- Muda SÓ o modelo "Etiqueta ZERO19" (id padrao) e só se ele ainda estiver como estava (largura 48, espaço 0,
-- margem lados 2, mover 2). Fica: largura 48 + espaço 4 = folha de 100 mm, margem lados 1 e mover 1, que dá a
-- mesma posição da etiqueta de produto (esquerda 2–48 mm, direita 54–100 mm).
-- Não mexe em produto, estoque, preço nem pedido.
update public.system_config c
set value = jsonb_set(c.value::jsonb, '{templates}', (
      select jsonb_agg(case when x.t->>'id' = 'padrao' then x.t || '{"gapMm":4,"marginXmm":1,"offsetXmm":1}'::jsonb else x.t end order by x.ord)
      from jsonb_array_elements(c.value::jsonb->'templates') with ordinality as x(t, ord)))::text,
    updated_at = now()
where c.tenant_id = '0e885daf-b461-4384-b2c2-8ed2cf33478b' and c.key = 'zero19_garment_tags'
  and (c.value::jsonb->'templates') @> '[{"id":"padrao","widthMm":48,"heightMm":30,"columns":2,"gapMm":0,"marginXmm":2,"offsetXmm":2}]'::jsonb;

-- Conferência: a coluna folha_mm tem de mostrar 100.
select t->>'name' as etiqueta, t->>'widthMm' as largura, t->>'gapMm' as espaco,
  (t->>'columns')::int * (t->>'widthMm')::numeric + ((t->>'columns')::int - 1) * (t->>'gapMm')::numeric as folha_mm,
  t->>'marginXmm' as margem_lados, t->>'offsetXmm' as mover
from public.system_config c, jsonb_array_elements(c.value::jsonb->'templates') t
where c.tenant_id = '0e885daf-b461-4384-b2c2-8ed2cf33478b' and c.key = 'zero19_garment_tags';
