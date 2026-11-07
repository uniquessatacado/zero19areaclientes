// Cores: sRGB 0–255 ↔ CIE Lab (D65) e diferença ΔE76. O SVG interpola degradês em sRGB; o ΔE mede o que o olho vê.
const toLinear = new Float64Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; toLinear[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;

export function rgbToLab(r, g, b) {
  const R = toLinear[r & 255], G = toLinear[g & 255], B = toLinear[b & 255];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, y = 0.2126 * R + 0.7152 * G + 0.0722 * B, z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
// Lab de valores contínuos (média de cores): arredonda para usar a tabela.
export const labOf = (r, g, b) => rgbToLab(Math.max(0, Math.min(255, Math.round(r))), Math.max(0, Math.min(255, Math.round(g))), Math.max(0, Math.min(255, Math.round(b))));

/** Lab de cada pixel (Float32Array 3 por pixel). */
export function labImage(data) {
  const n = data.length / 4, out = new Float32Array(n * 3), cache = new Map();
  for (let i = 0; i < n; i++) {
    const key = (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2];
    let lab = cache.get(key);
    if (!lab) { lab = rgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]); if (cache.size < 200000) cache.set(key, lab); }
    out[i * 3] = lab[0]; out[i * 3 + 1] = lab[1]; out[i * 3 + 2] = lab[2];
  }
  return out;
}
export const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
