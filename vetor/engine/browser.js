// Partes que dependem do navegador: abrir o arquivo (com a orientação da câmera), desenhar o SVG e exportar o PNG com DPI.
import { setPngDpi, readPngInfo } from './png.js';
import { alphaBox, pixelsFor } from './measure.js';

export async function decodeImage(blob) {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image', premultiplyAlpha: 'none', colorSpaceConversion: 'default' });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
  ctx.drawImage(bitmap, 0, 0); bitmap.close?.();
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height, { colorSpace: 'srgb' });
  return { width: canvas.width, height: canvas.height, data };
}

export const imageToCanvas = img => { const c = new OffscreenCanvas(img.width, img.height); c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0); return c; };

/** Desenha o SVG em width×height pixels (transparente). */
export async function renderSvg(svg, width, height) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image(); image.decoding = 'sync'; image.src = url; await image.decode();
    const canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, width, height);
    return { width, height, data: ctx.getImageData(0, 0, width, height).data };
  } finally { URL.revokeObjectURL(url); }
}

/** PNG do tamanho físico (área útil) a partir do vetor, com DPI gravado e conferido. */
export async function exportPng(svg, { widthCm, heightCm, dpi = 300 }) {
  const width = pixelsFor(widthCm, dpi), height = pixelsFor(heightCm, dpi);
  const rendered = await renderSvg(svg, width, height), canvas = imageToCanvas(rendered);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const bytes = setPngDpi(new Uint8Array(await blob.arrayBuffer()), dpi), info = readPngInfo(bytes), box = alphaBox(rendered);
  return { bytes, info, expected: { width, height, dpi }, visibleBox: box };
}
