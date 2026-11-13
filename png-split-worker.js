// 2.17.96: leitura, opções de corte e gravação das partes do PNG fora da tela (não trava a janela de envio).
import { scanPng, planOptions, splitPng, writeParts } from './png-split.js?v=2.17.95';

self.onmessage = async event => {
  const { id, op, blob, analysis, parts, options } = event.data || {};
  const onProgress = value => self.postMessage({ id, progress: value });
  try {
    let result;
    if (op === 'scan') result = await scanPng(blob, { onProgress });
    else if (op === 'options') result = planOptions(analysis, options || {});
    else if (op === 'split') result = await splitPng(blob, analysis, { ...(options || {}), onProgress });
    else if (op === 'write') result = await writeParts(blob, analysis, parts, { ...(options || {}), onProgress });
    else throw new Error('Operação desconhecida.');
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: String(error?.message || error || 'Não foi possível ler o PNG.') });
  }
};
