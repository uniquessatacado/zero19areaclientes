// Encaixe do filme do cliente DTF por metro: o MESMO motor do Montar filme do 019 (nesting-core), com a largura útil do
// filme (58 ou 28 cm) e 3 mm entre as artes, como a mídia cadastrada no 019. Roda fora da tela (Worker) para não travar.
import { nestItems } from './nesting-core.js?v=2.17.3';

export const GAP_MM = 3;
let worker = null, broken = false, queue = [];
function getWorker() {
  if (worker || broken || typeof Worker === 'undefined') return worker;
  try {
    worker = new Worker(new URL('./nesting-worker.js?v=2.17.3', import.meta.url), { type: 'module' });
    worker.onmessage = event => { const data = event.data || {}; if (!('ok' in data)) return; /* progresso e pontos de controle do 019 */ const job = queue.shift(); if (!job) return; const { ok, result, error } = data; ok ? job.resolve(result) : job.reject(new Error(error || 'Não foi possível encaixar as artes.')); };
    worker.onerror = () => { broken = true; for (const job of queue) job.reject(new Error('worker')); queue = []; worker = null; };
  } catch { broken = true; worker = null; }
  return worker;
}
// items: [{ key, widthCm, heightCm, quantity }]
export async function nestFilm(items, { filmWidthCm, allowRotate = true } = {}) {
  const list = (items || []).filter(item => item.widthCm > 0 && item.heightCm > 0 && item.quantity > 0).map((item, index) => ({
    id: String(item.key ?? index), label: item.name || '', widthMm: Math.round(item.widthCm * 100) / 10, heightMm: Math.round(item.heightCm * 100) / 10,
    quantity: Math.max(1, Math.round(item.quantity)), rotationPolicy: allowRotate ? '90' : 'none',
  }));
  if (!list.length) return { placements: [], lengthMm: 0 };
  const options = { filmWidthMm: filmWidthCm * 10, mode: 'normal', gapMm: GAP_MM, cellMm: 2 };
  const w = getWorker();
  if (w) {
    try { return await new Promise((resolve, reject) => { queue.push({ resolve, reject }); w.postMessage({ items: list, options }); }); }
    catch (error) { if (error?.message !== 'worker') throw error; }
  }
  return nestItems(list, options);
}

// Desenha o filme: fundo xadrez (transparente), as artes pelas miniaturas e uma linha vermelha tracejada a cada metro.
export function drawFilm(canvas, { filmWidthCm, layout, images, cssWidth, highlightKey = null }) {
  const filmMm = filmWidthCm * 10, lengthMm = Math.max(layout?.lengthMm || 0, 50), scale = cssWidth / filmMm;
  const cssHeight = Math.max(80, Math.round(lengthMm * scale));
  let dpr = Math.min(2, window.devicePixelRatio || 1);
  while (cssWidth * dpr * cssHeight * dpr > 12e6 && dpr > 0.3) dpr *= 0.8;
  canvas.width = Math.round(cssWidth * dpr); canvas.height = Math.round(cssHeight * dpr);
  canvas.style.width = cssWidth + 'px'; canvas.style.height = cssHeight + 'px';
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cell = 8; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cssWidth, cssHeight); ctx.fillStyle = '#eef0f4';
  for (let y = 0; y < cssHeight; y += cell) for (let x = (Math.floor(y / cell) % 2) * cell; x < cssWidth; x += cell * 2) ctx.fillRect(x, y, cell, cell);
  ctx.imageSmoothingQuality = 'high';
  for (const p of layout?.placements || []) {
    const x = p.xMm * scale, y = p.yMm * scale, w = p.widthMm * scale, h = p.heightMm * scale, image = images.get(p.id);
    if (image && image.complete && image.naturalWidth) {
      ctx.save();
      if (p.rotation) { ctx.translate(x + w / 2, y + h / 2); ctx.rotate(p.rotation * Math.PI / 180); ctx.drawImage(image, -h / 2, -w / 2, h, w); }
      else ctx.drawImage(image, x, y, w, h);
      ctx.restore();
    } else { ctx.fillStyle = 'rgba(255,100,40,.16)'; ctx.fillRect(x, y, w, h); }
    if (highlightKey !== null && p.id === String(highlightKey)) { ctx.strokeStyle = '#ff6428'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2); }
  }
  ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5; ctx.strokeStyle = '#e11d48'; ctx.fillStyle = '#e11d48'; ctx.font = '700 11px system-ui, sans-serif';
  for (let m = 1000; m < lengthMm; m += 1000) { const y = m * scale; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cssWidth, y); ctx.stroke(); ctx.fillText((m / 1000) + ' m', 6, y - 5); }
  ctx.setLineDash([]); ctx.strokeStyle = '#111827'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, cssWidth - 1, cssHeight - 1);
  return { cssHeight, scale };
}
