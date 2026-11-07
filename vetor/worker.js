// Processo separado do vetorizador (especificação, seção 10): a tela não trava e "Cancelar" encerra o trabalho de verdade.
import { prepare, vectorize, ENGINE_VERSION } from './engine/index.js?v=2.17.91';

self.onmessage = event => {
  const { id, type } = event.data;
  try {
    if (type === 'prepare') {
      const { image, removeBackground } = event.data, ready = prepare(image, { removeBackground, keepFull: true });
      if (ready.error) return self.postMessage({ id, type: 'error', message: ready.error, warnings: ready.warnings });
      return self.postMessage({ id, type: 'prepared', full: ready.full, mode: ready.mode, warnings: ready.warnings }, [ready.full.data.buffer]);
    }
    if (type === 'vectorize') {
      const { art, size, offset, title } = event.data;
      const result = vectorize(art, { size, offset, title, onStage: stage => self.postMessage({ id, type: 'stage', stage }) });
      return self.postMessage({ id, type: 'done', svg: result.svg, summary: result.summary, engine: ENGINE_VERSION });
    }
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error?.message || String(error) });
  }
};
