// Gera qr-theme.css: o tema claro do 019 no estilo da página do QR da produção (12/10, dono).
// Lê todos os CSS carregados pelo index.html e cria regras por cima (mesmo seletor, carregado por último):
// fundo escuro -> claro (escuro colorido vira pastel da mesma cor), texto claro -> escuro, borda escura -> clara.
// Áreas que PRECISAM continuar escuras (prévia do filme, miniaturas, editor de arte) ficam como estão,
// porque estampa branca some em fundo branco. Não muda HTML nem função. Uso: node scripts/gen-qr-theme.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const index = await fs.readFile(path.join(root, 'index.html'), 'utf8');
// Ordem do index.html primeiro; depois os CSS que as telas carregam sozinhas (orçamento, estúdio, camisa...).
const linked = [...index.matchAll(/<link rel="stylesheet" href="\/([^"?]+)/g)].map(match => match[1]);
const extra = (await fs.readdir(root)).filter(file => file.endsWith('.css') && !linked.includes(file)).sort();
const files = [...linked, ...extra].filter(file => file !== 'qr-theme.css' && file !== 'qr-screens.css');
// Seletores que mostram arte/filme/foto: o fundo escuro é de propósito (estampa branca precisa aparecer).
const KEEP_DARK = /preview|film-sheet|film-ruler|data-background|backdrop|overlay|scrim|\.black|film-preview|preview-shell|film-canvas|filmPreview|canvas|thumb|garment-stage|garment-scene|garment-view|three|color-canvas|shirt-stage|studio-stage|asset-preview|halftone|checker|zoom|lightbox|viewer|crop|z19-zero19-card|qr-header/i;

const clamp = value => Math.max(0, Math.min(1, value));
function parseColor(text) {
  let match = /^#([0-9a-f]{3,8})$/i.exec(text);
  if (match) {
    let hex = match[1]; if (hex.length <= 4) hex = [...hex].map(char => char + char).join('');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    return { r, g, b, a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1 };
  }
  match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(text);
  if (match) return { r: +match[1] / 255, g: +match[2] / 255, b: +match[3] / 255, a: match[4] === undefined ? 1 : match[4].endsWith('%') ? parseFloat(match[4]) / 100 : +match[4] };
  if (/^(white)$/i.test(text)) return { r: 1, g: 1, b: 1, a: 1 };
  if (/^(black)$/i.test(text)) return { r: 0, g: 0, b: 0, a: 1 };
  return null;
}
function toHsl({ r, g, b }) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}
const hsl = (h, s, l, a = 1) => a < 1 ? `hsla(${h.toFixed(0)},${(s * 100).toFixed(0)}%,${(l * 100).toFixed(1)}%,${+a.toFixed(3)})` : `hsl(${h.toFixed(0)},${(s * 100).toFixed(0)}%,${(l * 100).toFixed(1)}%)`;
const luminance = ({ r, g, b }) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
// Fundo: escuro neutro -> branco/cinza muito claro; escuro colorido -> pastel da mesma cor.
function mapBackground(color) {
  if (luminance(color) > 0.3) return null;
  const { h, s, l } = toHsl(color);
  if (color.a < 0.35 && luminance(color) > 0.6) return null;
  if (s < 0.18) return hsl(215, 0.25, l < 0.07 ? 1 : l < 0.11 ? 0.985 : 0.965, color.a < 1 ? Math.max(color.a, 0.92) : 1);
  return hsl(h, clamp(Math.max(s, 0.55)), 0.93, color.a < 1 ? Math.max(color.a, 0.92) : 1);
}
// Texto: claro -> escuro (mantém a cor quando é colorido).
function mapText(color) {
  if (luminance(color) < 0.45) return null;
  const { h, s } = toHsl(color);
  return s < 0.18 ? (luminance(color) > 0.8 ? '#0f172a' : '#475569') : hsl(h, clamp(Math.max(s, 0.6)), 0.24);
}
function mapBorder(color) {
  if (luminance(color) > 0.35) return null;
  const { h, s } = toHsl(color);
  return s < 0.18 ? hsl(214, 0.32, 0.86, color.a) : hsl(h, clamp(Math.max(s, 0.5)), 0.76, color.a);
}
const COLOR = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b/gi;
function mapValue(value, mapper) {
  let changed = false;
  const next = value.replace(COLOR, text => { const color = parseColor(text); const mapped = color && mapper(color); if (mapped) { changed = true; return mapped; } return text; });
  return changed ? next : null;
}

// Parser simples de CSS (regras e @media/@supports aninhados).
function parse(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = []; let i = 0;
  const block = () => {
    const items = [];
    while (i < css.length) {
      while (/\s/.test(css[i])) i++;
      if (css[i] === '}' ) { i++; return items; }
      if (i >= css.length) return items;
      let start = i, depthParen = 0;
      while (i < css.length && !(css[i] === '{' && depthParen === 0) && !(css[i] === ';' && depthParen === 0) && css[i] !== '}') { if (css[i] === '(') depthParen++; if (css[i] === ')') depthParen--; i++; }
      const head = css.slice(start, i).trim();
      if (css[i] === ';') { i++; continue; }
      if (css[i] === '}') { i++; return items; }
      i++;
      if (/^@(media|supports|layer|container)/i.test(head)) items.push({ at: head, children: block() });
      else if (/^@/.test(head)) { let depth = 1; while (i < css.length && depth) { if (css[i] === '{') depth++; if (css[i] === '}') depth--; i++; } }
      else { let s2 = i, depth = 0; while (i < css.length && !(css[i] === '}' && depth === 0)) { if (css[i] === '(') depth++; if (css[i] === ')') depth--; i++; } items.push({ selector: head, body: css.slice(s2, i) }); i++; }
    }
    return items;
  };
  out.push(...block());
  return out;
}
const declarations = body => { const list = []; let depth = 0, start = 0; for (let i = 0; i <= body.length; i++) { const c = body[i]; if (c === '(') depth++; if (c === ')') depth--; if ((c === ';' && depth === 0) || i === body.length) { const part = body.slice(start, i).trim(); start = i + 1; const colon = part.indexOf(':'); if (colon > 0) list.push([part.slice(0, colon).trim().toLowerCase(), part.slice(colon + 1).trim()]); } } return list; };

function themeRule(selector, body) {
  const keep = selector.split(',').every(part => KEEP_DARK.test(part));
  if (/^(:root|html|body|html,\s*body|\*)$/i.test(selector.trim())) return '';
  const rules = [];
  for (const [prop, raw] of declarations(body)) {
    if (/url\(|conic-gradient/i.test(raw)) continue; // ícones em data URL e quadriculado de transparência: não mexer
    const important = /!important\s*$/i.test(raw), value = raw.replace(/!important\s*$/i, '').trim(), bang = important ? ' !important' : '';
    if (/^background(-color|-image)?$/.test(prop)) { if (keep || /url\(/i.test(value)) continue; const mapped = mapValue(value, mapBackground); if (mapped) rules.push(`${prop}:${mapped}${bang}`); }
    else if (prop === 'color') { if (keep && !/backdrop|overlay|scrim/i.test(selector)) continue; const mapped = mapValue(value, mapText); if (mapped) rules.push(`color:${mapped}${bang}`); }
    else if (/^(border(-top|-right|-bottom|-left)?(-color)?|outline(-color)?)$/.test(prop)) { if (keep) continue; const mapped = mapValue(value, mapBorder); if (mapped) rules.push(`${prop}:${mapped}${bang}`); }
    else if (prop.startsWith('--') && !keep) {
      // Variáveis de cor próprias de cada tela (ex.: --fp-text): converte pelo nome.
      const name = prop.toLowerCase();
      const mapper = /text|fg|ink|muted|title|label|copy|font/.test(name) ? mapText : /line|border|stroke|divider|outline/.test(name) ? mapBorder
        : /bg|panel|surface|card|back|fill|base|soft|chip|field|input|row/.test(name) ? mapBackground : color => mapBackground(color) || mapText(color);
      const mapped = mapValue(value, mapper); if (mapped) rules.push(`${prop}:${mapped}${bang}`);
    }
    else if (prop === 'box-shadow' && /inset/.test(value) && !keep) { const mapped = mapValue(value, color => luminance(color) > 0.6 && color.a < 0.3 ? 'rgba(15,23,42,.06)' : mapBorder(color)); if (mapped) rules.push(`box-shadow:${mapped}${bang}`); }
  }
  // "html " na frente: vale mesmo quando a tela carrega o próprio CSS depois do tema.
  const strong = selector.split(',').map(part => part.trim()).map(part => /^(html|:root)/i.test(part) ? part : `html ${part}`).join(',');
  return rules.length ? `${strong}{${rules.join(';')}}` : '';
}
function emit(items) {
  return items.map(item => item.at ? (() => { const inner = emit(item.children); return inner ? `${item.at}{${inner}}` : ''; })() : themeRule(item.selector, item.body)).filter(Boolean).join('\n');
}

let output = `/* Tema claro no estilo da página do QR da produção (12/10, dono). GERADO por scripts/gen-qr-theme.mjs — não editar à mão; ajustes finos em qr-screens.css. */
:root{--bg:#eef2f6;--panel:#ffffff;--panel2:#f8fafc;--panel3:#f1f5f9;--text:#0f172a;--muted:#475569;--line:#dbe3ec;--accent:#2563eb;--accent2:#1d4ed8;--ok:#047857;--danger:#be123c;--warn:#b45309;--shadow:0 10px 30px rgba(15,23,42,.08);color-scheme:light}
html,body{background:#eef2f6!important;color:#0f172a}
`;
for (const file of files) {
  const css = await fs.readFile(path.join(root, file), 'utf8').catch(() => '');
  const generated = emit(parse(css));
  if (generated) output += `\n/* ${file} */\n${generated}\n`;
}
// Telas que montam o próprio CSS dentro do JS (style.textContent='...' ou <style> no HTML da tela).
const scripts = (await fs.readdir(root)).filter(file => file.endsWith('.js')).sort();
for (const file of scripts) {
  const text = await fs.readFile(path.join(root, file), 'utf8');
  const embedded = [...text.matchAll(/style\.textContent\+?='((?:[^'\\]|\\.)*)'/g), ...text.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match => match[1]);
  const generated = emit(parse(embedded.join('\n')));
  if (generated) output += `\n/* ${file} (estilo dentro do JS) */\n${generated}\n`;
}
await fs.writeFile(path.join(root, 'qr-theme.css'), output);
console.log('qr-theme.css', output.length, 'bytes de', files.length, 'arquivos');
