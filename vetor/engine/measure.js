// Medida física (especificação, seção 5): só os pixels da arte contam. Caixa = união de tudo com alfa > 0 (inclusive sombras e
// semitransparentes, sem limiar arbitrário). A última medida digitada manda; a outra sai da proporção da caixa.

/** Caixa dos pixels com alfa > 0 (coordenadas inclusivas) ou null se a imagem ficou vazia. */
export function alphaBox(img) {
  const { width, height, data } = img;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) if (data[row + x * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  return { x0, y0, x1, y1, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

export function crop(img, box) {
  const out = new Uint8ClampedArray(box.width * box.height * 4);
  for (let y = 0; y < box.height; y++) {
    const from = ((box.y0 + y) * img.width + box.x0) * 4;
    out.set(img.data.subarray(from, from + box.width * 4), y * box.width * 4);
  }
  return { width: box.width, height: box.height, data: out };
}

/** Aceita "28", "28,5", "28.5"; recusa zero, negativo e texto. */
export function parseCm(value) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return number > 0 && Number.isFinite(number) ? number : null;
}

/** ref = 'largura' | 'altura' (a última digitada). Precisão total; arredondar só ao mostrar. */
export function physicalSize(box, { reference, value }) {
  const cm = typeof value === 'number' ? value : parseCm(value);
  if (!box || !cm) return null;
  return reference === 'altura'
    ? { reference, widthCm: cm * box.width / box.height, heightCm: cm }
    : { reference: 'largura', widthCm: cm, heightCm: cm * box.height / box.width };
}

export const pixelsFor = (cm, dpi = 300) => Math.round(cm / 2.54 * dpi);
export const formatCm = cm => (Math.round(cm * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
