// PNG para DTF (especificação, seção 8): o canvas grava 96 DPI (ou nada); aqui a resolução vai no bloco pHYs do PNG
// (pixels por metro) e é lida de volta para conferir. Pixels = arredondar(cm ÷ 2,54 × DPI).
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(bytes) { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function chunks(png) {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength), out = [];
  for (let at = 8; at < png.length;) { const len = view.getUint32(at), type = String.fromCharCode(...png.subarray(at + 4, at + 8)); out.push({ at, len, type }); at += 12 + len; }
  return out;
}

/** Troca/insere o pHYs logo depois do IHDR. */
export function setPngDpi(png, dpi) {
  const bytes = png instanceof Uint8Array ? png : new Uint8Array(png);
  const list = chunks(bytes), ppm = Math.round(dpi / 0.0254);
  const body = new Uint8Array(17), view = new DataView(body.buffer);
  body.set([0x70, 0x48, 0x59, 0x73]); view.setUint32(4, ppm); view.setUint32(8, ppm); body[12] = 1;
  const chunk = new Uint8Array(21), cv = new DataView(chunk.buffer);
  cv.setUint32(0, 9); chunk.set(body.subarray(0, 13), 4); cv.setUint32(17, crc32(body.subarray(0, 13)));
  const ihdr = list.find(c => c.type === 'IHDR'), afterIhdr = ihdr.at + 12 + ihdr.len, parts = [bytes.subarray(0, afterIhdr), chunk];
  let at = afterIhdr;
  for (const c of list) if (c.at >= afterIhdr) { if (c.type === 'pHYs') { parts.push(bytes.subarray(at, c.at)); at = c.at + 12 + c.len; } }
  parts.push(bytes.subarray(at));
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Lê dimensões, tipo de cor (alfa?) e DPI gravado. */
export function readPngInfo(png) {
  const bytes = png instanceof Uint8Array ? png : new Uint8Array(png), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), list = chunks(bytes);
  const ihdr = list.find(c => c.type === 'IHDR'), phys = list.find(c => c.type === 'pHYs');
  const width = view.getUint32(ihdr.at + 8), height = view.getUint32(ihdr.at + 12), colorType = bytes[ihdr.at + 17];
  let dpi = null; if (phys && bytes[phys.at + 16] === 1) dpi = Math.round(view.getUint32(phys.at + 8) * 0.0254);
  return { width, height, hasAlpha: colorType === 6 || colorType === 4, dpi };
}
