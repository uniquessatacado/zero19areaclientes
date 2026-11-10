// Processo separado do vetorizador (especificação, seção 10): a tela não trava e "Cancelar" encerra o trabalho de verdade.
// Guarda o último resultado (partes e contornos) para trocar a cor de uma parte depois sem vetorizar de novo.
import { prepare, vectorize, recolor, ENGINE_VERSION } from './engine/index.js?v=2.17.91';

let last = null;

self.onmessage = event => {
  const { id, type } = event.data;
  try {
    if (type === 'prepare') {
      const { image, removeBackground } = event.data, ready = prepare(image, { removeBackground, keepFull: true });
      if (ready.error) return self.postMessage({ id, type: 'error', message: ready.error, warnings: ready.warnings });
      return self.postMessage({ id, type: 'prepared', full: ready.full, mode: ready.mode, warnings: ready.warnings }, [ready.full.data.buffer]);
    }
    if (type === 'vectorize') {
      last = null;
      const { art, size, offset, title } = event.data;
      const result = vectorize(art, { size, offset, title, keepLabels: true, onStage: stage => self.postMessage({ id, type: 'stage', stage }) });
      last = { regions: result.regions, svgArgs: result.svgArgs };
      // Mapa de qual parte fica em cada pixel (para tocar numa parte e trocar a cor) e a opacidade de cada parte.
      const labels = result.labels, opaque = Uint8Array.from(result.regions, r => r.opaque ? 1 : 0);
      return self.postMessage({ id, type: 'done', svg: result.svg, summary: result.summary, engine: ENGINE_VERSION, labels, opaque }, [labels.buffer, opaque.buffer]);
    }
    if (type === 'recolor') {
      if (!last) return self.postMessage({ id, type: 'error', message: 'O resultado anterior não está mais na memória. Clique em Vetorizar de novo e refaça a troca de cor.' });
      return self.postMessage({ id, type: 'recolored', svg: recolor(last, event.data.edits || []) });
    }
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error?.message || String(error) });
  }
};
