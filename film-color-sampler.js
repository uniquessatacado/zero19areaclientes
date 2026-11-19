// The film preview centers and rotates each image inside its placement. Sample
// the image itself so selection borders and the transparency grid never print.
async function pixelAt(image, x, y) {
  if (!image?.complete || !image.naturalWidth) return null;
  const style = getComputedStyle(image);
  const rect = image.getBoundingClientRect();
  const width = parseFloat(style.width), height = parseFloat(style.height);
  const matrix = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
  const dx = x - (rect.left + rect.width / 2), dy = y - (rect.top + rect.height / 2);
  const inverse = new DOMMatrix([matrix.a, matrix.b, matrix.c, matrix.d, 0, 0]).inverse();
  const point = new DOMPoint(dx, dy).matrixTransform(inverse);
  const u = point.x / width + 0.5, v = point.y / height + 0.5;
  if (!(u >= 0 && u < 1 && v >= 0 && v < 1)) return null;
  let source = image;
  const url = image.currentSrc || image.src;
  if (new URL(url, document.baseURI).protocol.startsWith('http') &&
      new URL(url, document.baseURI).origin !== location.origin && !image.crossOrigin) {
    source = new Image();
    source.crossOrigin = 'anonymous';
    source.src = url;
    await source.decode();
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', {willReadFrequently:true});
  ctx.drawImage(source, Math.floor(u * source.naturalWidth), Math.floor(v * source.naturalHeight), 1, 1, 0, 0, 1, 1);
  const [r, g, b, alpha] = ctx.getImageData(0, 0, 1, 1).data;
  return alpha ? '#' + [r, g, b].map(value => value.toString(16).padStart(2, '0')).join('') : null;
}

export function pickFilmColor(preview, modal, onPick) {
  const controller = new AbortController();
  const {signal} = controller;
  const bar = document.createElement('div');
  bar.className = 'film-sampler-bar';
  bar.innerHTML = '<span role="status">Toque na cor de uma estampa do filme.</span><button type="button" class="btn small">Cancelar</button>';
  const status = bar.querySelector('span'), cancel = bar.querySelector('button');
  let reading = false;
  function finish(color) {
    if (signal.aborted) return;
    controller.abort();
    bar.remove();
    preview.classList.remove('film-sampling');
    modal.style.removeProperty('display');
    if (modal.isConnected) {
      if (color) onPick(color);
      modal.querySelector('[data-font-eyedrop]')?.focus({preventScroll:true});
    }
  }
  modal.style.display = 'none';
  preview.classList.add('film-sampling');
  (document.fullscreenElement || document.body).append(bar);
  (preview.querySelector('.film-sheet') || preview).scrollIntoView({block:'start', inline:'nearest', behavior:'instant'});
  cancel.focus({preventScroll:true});
  cancel.onclick = () => finish();
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); finish(); }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); event.stopImmediatePropagation(); }
  }, {capture:true, signal});
  window.addEventListener('hashchange', () => finish(), {once:true, signal});
  const capture = {capture:true, signal};
  // Keep scrolling available. A sampling gesture must never drag or select artwork.
  for (const type of ['pointerdown','pointerup','pointermove','mousedown','mouseup','dblclick','contextmenu']) {
    document.addEventListener(type, event => {
      if (!bar.contains(event.target)) event.stopImmediatePropagation();
    }, capture);
  }
  document.addEventListener('click', async event => {
    if (bar.contains(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (reading) return;
    const {clientX:x, clientY:y} = event;
    reading = true;
    try {
      const placements = [...new Set(document.elementsFromPoint(x,y)
        .map(el => el.closest('[data-placement]')).filter(el => el && preview.contains(el)))];
      for (const placement of placements) {
        const color = await pixelAt(placement.querySelector('img'), x, y);
        if (signal.aborted) return;
        if (color) { finish(color); return; }
      }
      status.textContent = 'Esse ponto está vazio. Toque na parte colorida da estampa.';
    } catch {
      status.textContent = 'A prévia não pôde ser lida. Tente outra estampa ou use o seletor de cor.';
    } finally { reading = false; }
  }, capture);
  return () => finish();
}
