// 2.17.96 (13/11, dono: "permita subir PDF também, tem cliente que manda PDF e outros PNG").
// Cada página do PDF vira um PNG transparente de 300 DPI no tamanho real da página (o PDF guarda o tamanho físico),
// desenhado em faixas (sem o limite de tamanho do canvas) e gravado linha por linha (png-split.js). O PDF original fica
// guardado como o original da arte. Leitor: pdf.js 4.10.38 (vendor/pdfjs, Apache-2.0).
import { createPngWriter } from './png-split.js?v=2.17.95';

let lib = null;
async function pdfjs() {
  if (!lib) {
    lib = await import('./vendor/pdfjs/pdf.min.js');
    lib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.js', import.meta.url).href;
  }
  return lib;
}
export const isPdf = file => !!file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''));
const MAX_SIDE = 32000;

export async function pdfToPngs(file, { dpi = 300, onProgress, maxPages = 30 } = {}) {
  const { getDocument } = await pdfjs();
  let doc;
  try { doc = await getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise; }
  catch (error) { throw new Error(/password/i.test(String(error?.name || error?.message)) ? 'O PDF tem senha: peça ao cliente o arquivo sem senha.' : 'Não foi possível abrir o PDF (' + (error?.message || error) + ').'); }
  const base = String(file.name || 'PDF').replace(/\.pdf$/i, '').trim() || 'PDF', results = [];
  try {
    const pages = doc.numPages;
    if (pages > maxPages) throw new Error('O PDF tem ' + pages + ' páginas: o limite é ' + maxPages + ' por vez.');
    for (let n = 1; n <= pages; n++) {
      const page = await doc.getPage(n);
      try {
        const unit = Number(page.userUnit) > 0 ? Number(page.userUnit) : 1, viewport = page.getViewport({ scale: dpi / 72 * unit });
        const W = Math.ceil(viewport.width), H = Math.ceil(viewport.height);
        if (W > MAX_SIDE || H > 400000) throw new Error('A página ' + n + ' é grande demais para converter (' + Math.round(viewport.width / dpi * 2.54) + ' × ' + Math.round(viewport.height / dpi * 2.54) + ' cm).');
        const writer = createPngWriter({ width: W, height: H, ppm: Math.round(dpi / 0.0254) });
        const band = Math.max(64, Math.min(4096, Math.floor(16e6 / W))), canvas = document.createElement('canvas');
        canvas.width = W;
        for (let top = 0; top < H; top += band) {
          const h = Math.min(band, H - top);
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) throw new Error('O navegador não liberou memória para converter o PDF.');
          ctx.clearRect(0, 0, W, h);
          await page.render({ canvasContext: ctx, viewport, transform: [1, 0, 0, 1, 0, -top], background: 'rgba(0,0,0,0)' }).promise;
          const data = ctx.getImageData(0, 0, W, h).data;
          for (let r = 0; r < h; r++) await writer.addRow(data.subarray(r * W * 4, (r + 1) * W * 4));
          onProgress?.({ page: n, pages, done: Math.min(1, (top + h) / H) });
        }
        canvas.width = canvas.height = 1;
        const blob = await writer.finish(), name = pages > 1 ? base + ' · pág. ' + n : base;
        results.push({ file: new File([blob], name.replace(/[\\/:*?"<>|]+/g, '-') + '.png', { type: 'image/png' }), name, page: n, pages, widthPx: W, heightPx: H, dpi,
          widthCm: viewport.width / dpi * 2.54, heightCm: viewport.height / dpi * 2.54 });
      } finally { page.cleanup(); }
    }
    return results;
  } finally { await doc.destroy(); }
}
