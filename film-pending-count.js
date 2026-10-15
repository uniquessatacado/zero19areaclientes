// 2.17.79 (15/10, dono: "Aguardando produção não mostra quantas artes tem para adicionar no filme; precisa
// mostrar quantas tem para adicionar e quantas estão adicionadas em tempo real; às vezes chega nova enquanto
// estou adicionando outras"). Mesma regra da janela Aguardando produção: cada arte da fila conta uma vez.
// Só leitura: não muda fila, pedido, filme nem arquivo.
export function filmPendingSummary({orderRows = [], fontRows = [], officialRows = [], vendussRows = [], vdrRows = [], filmItems = [], pendingQuantity, rowKey} = {}) {
  const keys = new Set(), waiting = new Set();let toAdd = 0, inFilm = 0;
  const count = (key, done) => { if (keys.has(key)) return; keys.add(key); if (done) inFilm++; else { toAdd++; waiting.add(key); } };
  const byWorkItem = id => filmItems.some(item => item.zero19WorkItemId === id);
  for (const row of vdrRows || []) count('vdr:' + row.id, byWorkItem(row.id));
  for (const row of vendussRows || []) count('venduss:' + row.id, byWorkItem(row.id));
  for (const row of fontRows || []) count('font:' + row.id, byWorkItem(row.id));
  const vendussAssets = new Set((vendussRows || []).map(row => row.asset_id).filter(Boolean));
  for (const row of officialRows || []) {
    const id = row?.placement?.id;if (!id || vendussAssets.has(row.asset?.id)) continue;
    count('placed:' + id, filmItems.some(item => item.officialPlacementId === id || (item.productionPlacementIds || []).includes(id)));
  }
  const genericInFilm = row => filmItems.some(item => row.kind === 'company_order' ? item.orderLink?.companyOrderItemId === row.company_order_item_id : item.orderLink?.quoteItemId === row.quote_item_id);
  for (const row of orderRows || []) {
    if (row.kind === 'legacy_review') continue;
    if (pendingQuantity(row, filmItems) > 0) count('generic:' + rowKey(row), false);
    else if (genericInFilm(row)) count('generic:' + rowKey(row), true);
  }
  return {toAdd, inFilm, keys, waiting};
}
const pill = 'display:inline-block;margin-left:6px;border-radius:999px;padding:2px 8px;font-weight:900;white-space:nowrap';
export function filmPendingBadge(summary, failed = false) {
  if (!summary) return '◷ Aguardando produção <b style="' + pill + ';background:#e2e8f0;color:#334155">' + (failed ? 'toque para ver' : 'contando…') + '</b>';
  return '◷ Aguardando produção <b data-pending-to-add style="' + pill + ';background:#ff6428;color:#111">' + (summary.toAdd ? summary.toAdd + ' para adicionar' : 'nada para adicionar') + '</b><b data-pending-in-film style="' + pill + ';background:#22c55e;color:#04140b">' + summary.inFilm + ' no filme</b>';
}
// Artes que chegaram depois da última leitura (para avisar sem precisar fechar a janela).
export function filmPendingArrivals(previousKeys, summary) {
  if (!previousKeys || !summary) return [];
  return [...summary.waiting].filter(key => !previousKeys.has(key));
}
