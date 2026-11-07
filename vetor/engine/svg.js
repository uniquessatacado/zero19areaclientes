// SVG vetorial (especificação, seção 8): só geometria e preenchimentos (sólido, degradê linear/radial com paradas e opacidade),
// sem imagem embutida, sem script, sem referência externa. viewBox = a arte recortada (pixels úteis); largura/altura em cm.
import { hex } from './color.js';

const num = v => { const s = (Math.round(v * 100) / 100).toString(); return s === '-0' ? '0' : s; };
const off = v => (Math.round(Math.max(0, Math.min(1, v)) * 10000) / 10000).toString();
const opacity = a => Math.round(Math.max(0, Math.min(255, a)) / 255 * 1000) / 1000;

export function buildSvg({ width, height, regions, paths, widthCm, heightCm, title = 'Arte vetorizada ZERO19', seamStroke = 0.6 }) {
  const defs = [], body = [];
  // Semitransparentes (sombra, brilho) por baixo; depois as opacas, maiores primeiro. Numa imagem achatada, o que é
  // semitransparente só aparece onde nada opaco cobre, então desenhar por baixo não muda o que se vê e esconde sobras.
  const order = regions.map((region, i) => ({ region, d: paths[i].d })).filter(item => item.d).sort((a, b) => Number(a.region.opaque) - Number(b.region.opaque) || b.region.area - a.region.area);
  for (const { region, d } of order) {
    let paint, paintOpacity = '';
    if (region.model === 'solid') {
      const [r, g, b, a] = region.color; paint = hex(r, g, b);
      if (a < 254.5) paintOpacity = ` fill-opacity="${opacity(a)}"`;
    } else {
      const id = 'g' + region.id, stops = region.stops.map(s => `<stop offset="${off(s.offset)}" stop-color="${hex(s.color[0], s.color[1], s.color[2])}"${s.color[3] < 254.5 ? ` stop-opacity="${opacity(s.color[3])}"` : ''}/>`).join('');
      defs.push(region.model === 'linear'
        ? `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${num(region.x1)}" y1="${num(region.y1)}" x2="${num(region.x2)}" y2="${num(region.y2)}">${stops}</linearGradient>`
        : `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${num(region.cx)}" cy="${num(region.cy)}" r="${num(region.r)}">${stops}</radialGradient>`);
      paint = `url(#${id})`;
    }
    // Contorno fino da mesma tinta só nas regiões opacas: cobre a fresta de antisserrilhado entre regiões vizinhas.
    const stroke = region.opaque && seamStroke > 0 ? ` stroke="${paint}" stroke-width="${seamStroke}" stroke-linejoin="round"` : '';
    // Região com zonas: o degradê de base só aparece na borda (cobre o antisserrilhado do recorte); por cima, as zonas desfocadas.
    if (!region.zones || region.opaque) body.push(`<path d="${d}" fill="${paint}"${paintOpacity}${stroke}/>`);
    if (region.zones) {
      const z = region.zones, cid = 'c' + region.id;
      const zonePath = ({ d: zd, color: [r, g, b, a] }) => { const c = hex(r, g, b), op = a < 254.5 ? ` fill-opacity="${opacity(a)}"` : ''; return `<path d="${zd}" fill="${c}"${op}${a >= 254.5 ? ` stroke="${c}" stroke-width="0.6" stroke-linejoin="round"` : ''}/>`; };
      defs.push(`<clipPath id="${cid}"><path d="${d}"/></clipPath>`);
      // Camadas da mais larga (desfoque grande) para a mais estreita (desfoque pequeno), todas dentro do recorte da região.
      const layers = z.layers.map((layer, k) => {
        const fid = `f${region.id}_${k}`;
        defs.push(`<filter id="${fid}" filterUnits="userSpaceOnUse" x="${z.x0}" y="${z.y0}" width="${z.w}" height="${z.h}" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${num(layer.sigma)}"/></filter>`);
        return `<g filter="url(#${fid})"><g transform="translate(${z.x0} ${z.y0})">${layer.paths.map(zonePath).join('')}</g></g>`;
      }).join('');
      body.push(`<g clip-path="url(#${cid})">${layers}</g>`);
    }
    // Camadas de sombreado: degradê radial elíptico de uma cor, opacidade caindo até 0, recortado pela própria região.
    (region.overlays || []).forEach((layer, k) => {
      const id = `o${region.id}_${k}`, color = hex(layer.color[0], layer.color[1], layer.color[2]);
      defs.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="matrix(${layer.matrix.map(num3).join(' ')})">${layer.stops.map(s => `<stop offset="${off(s.offset)}" stop-color="${color}" stop-opacity="${Math.round(Math.max(0, Math.min(1, s.alpha)) * 1000) / 1000}"/>`).join('')}</radialGradient>`);
      body.push(`<path d="${d}" fill="url(#${id})"/>`);
    });
  }
  const size = widthCm && heightCm ? ` width="${num4(widthCm)}cm" height="${num4(heightCm)}cm"` : ` width="${width}" height="${height}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"${size} fill-rule="nonzero"><title>${escapeXml(title)}</title>${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${body.join('')}</svg>`;
}
const num3 = v => { const s = (Math.round(v * 1000) / 1000).toString(); return s === '-0' ? '0' : s; };
const num4 = v => (Math.round(v * 10000) / 10000).toString();
const escapeXml = s => String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

/** Conferência do SVG "vetorial de verdade": nada de bitmap, script ou referência externa. */
export function inspectSvg(svg) {
  return {
    hasImage: /<image\b/i.test(svg), hasScript: /<script\b|on\w+=/i.test(svg), hasExternal: /href="(?!#)/i.test(svg) || /url\((?!#)/i.test(svg),
    paths: (svg.match(/<path\b/g) || []).length, overlays: (svg.match(/fill="url\(#o/g) || []).length, filters: (svg.match(/<filter\b/g) || []).length, linear: (svg.match(/<linearGradient\b/g) || []).length, radial: (svg.match(/<radialGradient\b/g) || []).length,
    bytes: new TextEncoder().encode(svg).length,
  };
}
