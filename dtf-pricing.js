// Preço do filme do cliente DTF por metro (13/11, dono): "sempre será cobrado o metro 58x100 (e 28x100), mas com
// possibilidade de cobrar por arte, por tamanho da arte: caso o cliente queira menos de 1 metro, cadastramos de tantos cm a
// tantos cm de largura e altura, tanto". Mesma conta na tela do cliente e no banco (que confere ao enviar).
//  - "meter": comprimento do filme arredondado PARA CIMA no metro inteiro × preço do metro da largura (58 ou 28 cm).
//  - "art": cada arte cai na 1ª faixa da tabela em que cabe (largura × altura, pode girar) × quantidade.
//  - "auto": filme com menos de 1 m é cobrado por arte (tabela), nunca mais que 1 metro; a partir de 1 m, pelo metro.
export const FILM_WIDTHS = Object.freeze([58, 28]);
const money = value => Math.round(Number(value) * 100) / 100;

export function normalizeArtTable(table) {
  return (Array.isArray(table) ? table : [])
    .map(row => ({ maxWidthCm: Number(row.maxWidthCm ?? row.max_width_cm), maxHeightCm: Number(row.maxHeightCm ?? row.max_height_cm), price: Number(row.price) }))
    .filter(row => row.maxWidthCm > 0 && row.maxHeightCm > 0 && row.price >= 0)
    .sort((a, b) => a.maxWidthCm * a.maxHeightCm - b.maxWidthCm * b.maxHeightCm || a.price - b.price);
}
export function artTablePrice(table, widthCm, heightCm) {
  const w = Number(widthCm), h = Number(heightCm);
  for (const row of normalizeArtTable(table)) if ((w <= row.maxWidthCm + 1e-6 && h <= row.maxHeightCm + 1e-6) || (h <= row.maxWidthCm + 1e-6 && w <= row.maxHeightCm + 1e-6)) return row.price;
  return null;
}
export function meterPrice(pricing, filmWidthCm, lengthCm) {
  const perMeter = Number(filmWidthCm) === 28 ? Number(pricing.price28) : Number(pricing.price58);
  if (!(perMeter > 0) || !(lengthCm > 0)) return null;
  const meters = Math.max(1, Math.ceil(Number(lengthCm) / 100 - 1e-9));
  return { meters, perMeter, total: money(meters * perMeter) };
}
// items: [{ widthCm, heightCm, quantity }]. Igual a public.z19p_dtf_price no banco (o servidor confere ao enviar):
// "art" cobra por arte; "auto" com menos de 1 m cobra por arte mas nunca mais que 1 metro; faltou faixa para uma arte = metro.
export function filmPrice(pricing, { filmWidthCm, lengthCm, items }) {
  const mode = pricing?.mode || 'meter', result = { mode, meter: meterPrice(pricing || {}, filmWidthCm, lengthCm), art: null, total: null, charged: null, missing: [] };
  const useArt = mode === 'art' || (mode === 'auto' && Number(lengthCm) < 100);
  if (useArt) {
    let total = 0, complete = true;
    const lines = (items || []).map(item => {
      const unit = artTablePrice(pricing.artTable, item.widthCm, item.heightCm), quantity = Math.max(0, Math.round(Number(item.quantity) || 0));
      if (unit === null) { complete = false; result.missing.push(item); return { ...item, quantity, unit: null, subtotal: null }; }
      total += unit * quantity;
      return { ...item, quantity, unit, subtotal: money(unit * quantity) };
    });
    result.art = { lines, total: complete ? money(total) : null, complete };
  }
  const art = result.art?.complete ? result.art.total : null, meter = result.meter?.total ?? null;
  if (art !== null && (mode === 'art' || meter === null || art <= meter)) { result.total = art; result.charged = 'art'; }
  else if (meter !== null) { result.total = meter; result.charged = 'meter'; }
  return result;
}
export const formatMoney = value => value === null || value === undefined ? '—' : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
