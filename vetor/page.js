// Tela "Vetorizar arte" do 019 (especificação "ZERO19 — Sistema de vetorização para DTF", Etapa 2; 06/11, dono: "pode fazer a
// tela dentro do 019; pode fazer um botão no menu lateral e também na tela de filme um botão para vetorizar uma arte").
// Fluxo: enviar (arquivo, arrastar ou colar print) → fundo (Remover fundo começa marcado; Apagar/Restaurar) → medida (largura OU
// altura em cm; a outra acompanha a proporção da arte recortada) → Vetorizar (processo separado, com etapas reais e Cancelar) →
// comparar (lado a lado/sobrepor, zoom junto) → baixar SVG/PNG 300 DPI ou salvar na biblioteca (Artes prontas) e jogar no filme.
// O motor (vetor/engine) nunca redesenha nada: só mede e reconstrói a partir dos pixels.
import { alphaBox, crop, physicalSize, pixelsFor } from './engine/measure.js?v=2.17.91';
import { decodeImage, renderSvg, exportPng, imageToCanvas } from './engine/browser.js?v=2.17.91';
import { setPngDpi } from './engine/png.js?v=2.17.91';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cm = value => Number.isFinite(value) ? (Math.round(value * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '';
const parse = text => { const t = String(text || '').trim().replace(',', '.'); if (!/^\d+(\.\d+)?$/.test(t)) return null; const v = Number(t); return v > 0 && v < 1000 ? v : null; };
const slug = name => String(name || 'arte').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'arte';
const STAGES = [['fundo', 'Preparando fundo'], ['regioes', 'Separando regiões'], ['cores', 'Reconstruindo cores e degradês'], ['refino', 'Refinando regiões difíceis'], ['contornos', 'Ajustando contornos'], ['svg', 'Gerando o SVG'], ['png', 'Gerando PNG de conferência'], ['pronto', 'Pronto']];
const MAX_PIXELS = 60_000_000;

export function createVectorizerPage(ctx) {
  const { app, shell, bindCommon, nav, toast, supabase, accountOwnerId, sessionUserId, libraryWorkspace, uploadFile, queueToFilm } = ctx;
  let state = blank(), worker = null, job = 0, pasteOff = null;
  function blank() {
    return { file: null, name: '', original: null, removeBackground: true, full: null, mode: '', warnings: [], box: null, tool: '', brush: 40, undo: [],
      reference: 'largura', widthCm: null, heightCm: null, widthText: '', heightText: '', dpi: 300, printRes: true,
      busy: '', stage: '', error: '', result: null, view: 'lado', bg: 'xadrez', zoom: 0, panX: 0, panY: 0, split: 0.5, saved: null, from: '' };
  }
  const css = () => { if (!document.getElementById('vzStyles')) { const link = document.createElement('link'); link.id = 'vzStyles'; link.rel = 'stylesheet'; link.href = new URL('./vetor.css?v=2.17.91', import.meta.url).href; document.head.appendChild(link); } };
  const getWorker = () => worker ??= new Worker(new URL('./worker.js?v=2.17.91', import.meta.url), { type: 'module' });
  function run(message, transfer = [], onStage) {
    return new Promise((resolve, reject) => {
      const id = ++job, w = getWorker();
      const done = () => { w.removeEventListener('message', onMessage); w.removeEventListener('error', onError); };
      const onMessage = event => { if (event.data.id !== id) return; if (event.data.type === 'stage') return onStage?.(event.data.stage); done(); event.data.type === 'error' ? reject(Object.assign(new Error(event.data.message), { warnings: event.data.warnings })) : resolve(event.data); };
      const onError = event => { done(); try { w.terminate(); } catch {} worker = null; reject(new Error(event.message || 'O processamento parou (memória do navegador?). Tente de novo, use a resolução de impressão ou uma imagem menor.')); };
      w.addEventListener('message', onMessage); w.addEventListener('error', onError); w.postMessage({ ...message, id }, transfer);
    });
  }
  function cancel() { worker?.terminate(); worker = null; job++; state.busy = ''; state.stage = ''; draw(); toast('Cancelado. A arte, o recorte e as medidas continuam aqui.', 'ok'); }

  // ------------------------------------------------------------------ dados derivados
  const art = () => state.full && state.box ? crop(state.full, state.box) : null;
  const sizes = () => {
    if (!state.box) return null;
    const value = state.reference === 'altura' ? state.heightCm : state.widthCm;
    return value ? physicalSize({ width: state.box.width, height: state.box.height }, { reference: state.reference, value }) : null;
  };
  const printPx = s => s ? { width: pixelsFor(s.widthCm, state.dpi), height: pixelsFor(s.heightCm, state.dpi) } : null;
  const workScale = () => { const s = sizes(), p = printPx(s); return state.printRes && p && state.box && p.width < state.box.width * 0.95 ? p.width / state.box.width : 1; };

  // ------------------------------------------------------------------ envio e fundo
  async function load(file) {
    if (!file) return;
    if (!/^image\//.test(file.type) && !/\.(png|jpe?g|webp|heic|heif)$/i.test(file.name || '')) return toast('Envie uma imagem PNG, JPG ou WEBP.', 'err');
    state = { ...blank(), from: state.from, file, name: (file.name || 'print-colado').replace(/\.[^.]+$/, '') };
    state.busy = 'Abrindo a imagem…'; draw();
    try {
      const image = await decodeImage(file);
      if (image.width * image.height > MAX_PIXELS) throw new Error(`Imagem muito grande (${image.width} × ${image.height} px). O limite desta versão é ${MAX_PIXELS / 1e6} milhões de pixels.`);
      state.original = image;
    } catch (error) {
      state.busy = ''; state.file = null;
      draw(); return toast(/heic|heif/i.test(file.type + file.name) ? 'Foto HEIC do iPhone ainda não abre neste navegador: exporte como JPG ou PNG.' : (error.message || 'Não foi possível abrir a imagem.'), 'err');
    }
    await prepareBackground();
  }
  async function prepareBackground() {
    state.busy = 'Preparando fundo…'; state.stage = 'fundo'; state.result = null; state.saved = null; state.undo = []; draw();
    try {
      const copy = { width: state.original.width, height: state.original.height, data: new Uint8ClampedArray(state.original.data) };
      const out = await run({ type: 'prepare', image: copy, removeBackground: state.removeBackground }, [copy.data.buffer]);
      state.full = out.full; state.mode = out.mode; state.warnings = out.warnings || []; state.box = alphaBox(state.full); state.error = '';
    } catch (error) { state.full = null; state.box = null; state.error = error.message; state.warnings = error.warnings || []; }
    state.busy = ''; state.stage = ''; state.zoom = 0; draw();
  }
  // Apagar / Restaurar: pincel redondo na imagem preparada; desfazer por blocos de 64 px (sem copiar a imagem inteira).
  function paint(x, y, stroke) {
    const { full, original } = state, r = state.brush / 2, x0 = Math.max(0, Math.floor(x - r)), y0 = Math.max(0, Math.floor(y - r)), x1 = Math.min(full.width - 1, Math.ceil(x + r)), y1 = Math.min(full.height - 1, Math.ceil(y + r));
    for (let ty = Math.floor(y0 / 64); ty <= Math.floor(y1 / 64); ty++) for (let tx = Math.floor(x0 / 64); tx <= Math.floor(x1 / 64); tx++) {
      const key = tx + ':' + ty; if (stroke.tiles.has(key)) continue;
      const w = Math.min(64, full.width - tx * 64), h = Math.min(64, full.height - ty * 64), save = new Uint8ClampedArray(w * h * 4);
      for (let row = 0; row < h; row++) save.set(full.data.subarray(((ty * 64 + row) * full.width + tx * 64) * 4, ((ty * 64 + row) * full.width + tx * 64 + w) * 4), row * w * 4);
      stroke.tiles.set(key, { tx, ty, w, h, save });
    }
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      if ((xx - x) ** 2 + (yy - y) ** 2 > r * r) continue;
      const i = (yy * full.width + xx) * 4;
      if (state.tool === 'apagar') full.data[i + 3] = 0;
      else { full.data[i] = original.data[i]; full.data[i + 1] = original.data[i + 1]; full.data[i + 2] = original.data[i + 2]; full.data[i + 3] = original.data[i + 3]; }
    }
  }
  function undo() {
    const stroke = state.undo.pop(); if (!stroke) return;
    for (const { tx, ty, w, h, save } of stroke.tiles.values()) for (let row = 0; row < h; row++) state.full.data.set(save.subarray(row * w * 4, (row + 1) * w * 4), ((ty * 64 + row) * state.full.width + tx * 64) * 4);
    afterMaskChange();
  }
  function afterMaskChange() {
    state.box = alphaBox(state.full); state.result = null; state.saved = null;
    if (!state.box) { state.error = 'O recorte apagou a imagem inteira. Use Desfazer ou Restaurar.'; } else state.error = '';
    draw();
  }

  // ------------------------------------------------------------------ vetorizar
  async function vectorizeNow() {
    if (state.busy) return;
    const s = sizes();
    if (!s || !state.box) return;
    state.busy = 'Vetorizando…'; state.stage = 'regioes'; state.result = null; state.saved = null; state.error = ''; draw();
    const started = performance.now();
    try {
      const source = art(), scale = workScale();
      let work = source;
      if (scale < 1) { // resolução de impressão (escolha visível na tela): menos pixels, mesmo tamanho físico
        const w = Math.max(1, Math.round(source.width * scale)), h = Math.max(1, Math.round(source.height * scale)), c = new OffscreenCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(imageToCanvas(source), 0, 0, w, h);
        work = { width: w, height: h, data: g.getImageData(0, 0, w, h).data };
      }
      const transfer = new Uint8ClampedArray(work.data);
      const out = await run({ type: 'vectorize', art: { width: work.width, height: work.height, data: transfer }, size: { reference: s.reference, value: s.reference === 'altura' ? s.heightCm : s.widthCm }, offset: scale === 1 ? { x: state.box.x0, y: state.box.y0 } : { x: 0, y: 0 }, title: state.name }, [transfer.buffer], stage => { state.stage = stage; drawStages(); });
      state.stage = 'png'; drawStages();
      const render = await renderSvg(out.svg, work.width, work.height);
      // Pontos para conferir: só áreas que se veem (pelo menos 0,02% da arte e 400 px), da maior para a menor.
      const minArea = Math.max(400, work.width * work.height * 0.0002), review = (out.summary.needsReview || []).filter(r => r.area >= minArea).sort((a, b) => b.area - a.area);
      state.result = { svg: out.svg, summary: out.summary, review, engine: out.engine, work, render, sizes: s, ms: Math.round(performance.now() - started), workScale: scale, labels: out.labels, opaque: out.opaque, edits: [] };
      state.view = 'lado'; state.zoom = 0; state.pick = null; colorEdit.reset();
    } catch (error) {
      // O erro fica escrito na tela (o aviso some sozinho): o dono vê o que aconteceu e tenta de novo.
      if (!/cancel/i.test(error?.message || '')) { state.error = 'Não foi possível vetorizar: ' + (error?.message || error); toast(state.error, 'err'); }
    }
    state.busy = ''; state.stage = ''; draw();
  }

  // ------------------------------------------------------------------ arquivos
  const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const fileBase = () => `${slug(state.name)}_${cm(state.result.sizes.widthCm).replace(',', '-')}cm`;
  async function pngBytes() {
    const { svg, sizes: s } = state.result, out = await exportPng(svg, { widthCm: s.widthCm, heightCm: s.heightCm, dpi: state.dpi });
    if (out.info.width !== out.expected.width || out.info.height !== out.expected.height || out.info.dpi !== state.dpi) throw new Error(`PNG saiu ${out.info.width} × ${out.info.height} px / ${out.info.dpi} DPI (esperado ${out.expected.width} × ${out.expected.height} / ${state.dpi}).`);
    return out;
  }
  async function downloadPng(button) {
    button.disabled = true; const label = button.textContent; button.textContent = 'Gerando PNG…';
    try { const out = await pngBytes(); download(new Blob([out.bytes], { type: 'image/png' }), `${fileBase()}_${state.dpi}dpi.png`); toast(`PNG conferido: ${out.info.width} × ${out.info.height} px, ${out.info.dpi} DPI gravado no arquivo.`, 'ok'); }
    catch (error) { toast(error.message, 'err'); }
    finally { button.disabled = false; button.textContent = label; }
  }
  async function rasterPng() { // alternativa explícita: a imagem preparada, sem vetorizar
    const s = state.result?.sizes || sizes(), source = art(), p = printPx(s), c = new OffscreenCanvas(p.width, p.height), g = c.getContext('2d');
    g.imageSmoothingQuality = 'high'; g.drawImage(imageToCanvas(source), 0, 0, p.width, p.height);
    const bytes = setPngDpi(new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()), state.dpi);
    download(new Blob([bytes], { type: 'image/png' }), `${slug(state.name)}_${cm(s.widthCm).replace(',', '-')}cm_${state.dpi}dpi_raster.png`);
    if (p.width > source.width * 1.05) toast('Atenção: a imagem tem menos pixels que a impressão pede; ampliar não recupera detalhe.', 'err');
  }
  async function saveToLibrary(button, thenFilm) {
    if (state.saved) { if (thenFilm) queueToFilm([{ assetId: state.saved.assetId, quantity: 1, companyName: 'Biblioteca ZERO19' }]); return; }
    const name = (document.querySelector('#vzName')?.value || state.name).trim();
    if (!name) return toast('Dê um nome para a arte.', 'err');
    button.disabled = true; const label = button.textContent; button.textContent = 'Salvando…';
    const uploaded = [];
    try {
      const owner = accountOwnerId(), user = sessionUserId(), workspace = await libraryWorkspace();
      if (!owner || !user || !workspace?.id) throw new Error('Biblioteca de artes não encontrada.');
      // Mesma pasta que o envio de arte usa ("Artes prontas" da biblioteca, a de cima primeiro); criada se não existir.
      const found = await supabase.from('z19p_folders').select('id').eq('owner_id', owner).eq('workspace_id', workspace.id).eq('purpose', 'artes_prontas').order('parent_id', { ascending: true, nullsFirst: true }).limit(1);
      if (found.error) throw found.error;
      let folder = found.data?.[0];
      if (!folder) { folder = { id: crypto.randomUUID(), owner_id: owner, workspace_id: workspace.id, project_id: null, parent_id: null, name: 'Artes prontas', purpose: 'artes_prontas', sort_order: 20, created_by: user, updated_by: user }; const made = await supabase.from('z19p_folders').insert(folder); if (made.error) throw made.error; }
      const out = await pngBytes(), assetId = crypto.randomUUID(), base = `${user}/${workspace.id}/${folder.id}/${assetId}`, ext = (state.file?.name?.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
      const files = [[`${base}/original.${ext}`, state.file, state.file?.type || 'image/png'], [`${base}/processed.png`, new Blob([out.bytes], { type: 'image/png' }), 'image/png'], [`${base}/vetor.svg`, new Blob([state.result.svg], { type: 'image/svg+xml' }), 'image/svg+xml']];
      for (const [path, blob, type] of files) { await uploadFile(path, blob, { contentType: type }); uploaded.push(path); }
      const s = state.result.sizes, summary = state.result.summary;
      const asset = { id: assetId, owner_id: owner, workspace_id: workspace.id, project_id: null, folder_id: folder.id, name, asset_type: 'arte', original_path: files[0][0], processed_path: files[1][0], mime_type: 'image/png', size_bytes: out.bytes.length, width: out.info.width, height: out.info.height, dpi: state.dpi, alpha_trimmed: true, background_removed: state.mode === 'fundo-uniforme', maximized: false, created_by: user, updated_by: user,
        metadata: { print_ready_intent: true, source_name: state.file?.name || null, requested_width_cm: s.widthCm, requested_height_cm: s.heightCm, vectorized: { engine: state.result.engine, svg_path: files[2][0], reference: s.reference, regions: summary.regions, linear: summary.linear, radial: summary.radial, shaded: summary.zoned || 0, color_edits: state.result.edits.length, needs_review: state.result.review.length, work_scale: state.result.workScale } } };
      const inserted = await supabase.from('z19p_assets').insert(asset); if (inserted.error) throw inserted.error;
      const profile = await supabase.from('z19p_asset_print_profiles').upsert({ asset_id: assetId, owner_id: owner, project_id: null, default_width_cm: s.widthCm, default_height_cm: s.heightCm, aspect_ratio: s.widthCm / s.heightCm, halftone: false, allow_internal_nesting: true, rotation_policy: 'free', ready_for_print: true, created_by: user, updated_by: user, updated_at: new Date().toISOString() }, { onConflict: 'asset_id' });
      if (profile.error) { await supabase.from('z19p_assets').delete().eq('id', assetId).eq('owner_id', owner); throw profile.error; }
      state.saved = { assetId, workspaceId: workspace.id, name };
      toast('Arte salva em Artes prontas, com a medida de ' + cm(s.widthCm) + ' × ' + cm(s.heightCm) + ' cm.', 'ok');
      if (thenFilm) queueToFilm([{ assetId, quantity: 1, companyName: 'Biblioteca ZERO19' }]); else draw();
    } catch (error) {
      if (uploaded.length) void supabase.storage.from(ctx.bucket).remove(uploaded).catch(() => {});
      toast('Não foi possível salvar: ' + (error.message || error), 'err');
      button.disabled = false; button.textContent = label;
    }
  }

  // ------------------------------------------------------------------ tela
  function render() {
    css(); pasteOff?.();
    // Arte já salva = trabalho terminado: ao voltar para a tela, começa uma nova. Sem salvar, a arte continua aqui (não perde).
    if (state.saved && !state.busy) { state = blank(); colorEdit.reset(); }
    state.from = new URLSearchParams(location.hash.split('?')[1] || '').get('from') || '';
    app.innerHTML = shell('<main class="container vz-page"><section class="vz-hero"><div><div class="eyebrow">DTF · SVG VETORIAL E PNG 300 DPI</div><h1>Vetorizar arte</h1><p>Envie a arte, confira o fundo, informe a medida e gere o vetor. Degradês saem como degradês, sem virar faixas.</p></div><div class="vz-hero-actions">' + (state.from === 'filme' ? '<button class="btn" type="button" data-vz-film>← Voltar para o filme</button>' : '') + '</div></section><div id="vzRoot"></div></main>', { back: true });
    bindCommon();
    app.querySelector('[data-vz-film]')?.addEventListener('click', () => nav('/filme'));
    const onPaste = event => { const file = [...(event.clipboardData?.items || [])].find(item => item.type.startsWith('image/'))?.getAsFile(); if (file && document.getElementById('vzRoot')) { event.preventDefault(); void load(file); } };
    document.addEventListener('paste', onPaste);
    const offRoute = () => { if (!location.hash.startsWith('#/vetorizar')) { document.removeEventListener('paste', onPaste); window.removeEventListener('hashchange', offRoute); } };
    window.addEventListener('hashchange', offRoute); pasteOff = () => { document.removeEventListener('paste', onPaste); window.removeEventListener('hashchange', offRoute); };
    draw();
  }

  function draw() {
    const root = document.getElementById('vzRoot'); if (!root) return;
    if (!state.original) { root.innerHTML = uploadHTML(); bindUpload(root); return; }
    const s = sizes(), p = printPx(s), scale = workScale(), box = state.box;
    const modeText = { 'fundo-uniforme': 'Fundo removido (cor lisa encostada na borda).', 'alfa-existente': 'A imagem já tinha fundo transparente: transparência mantida.', 'nao-uniforme': 'Fundo não é liso: nada foi removido automaticamente. Use Apagar para tirar o fundo.', mantido: 'Fundo mantido: ele faz parte da arte e entra na medida.' }[state.mode] || '';
    const summaryLine = s ? `Arte: ${cm(s.widthCm)} × ${cm(s.heightCm)} cm • ${state.mode === 'mantido' ? 'Fundo mantido' : 'Fundo transparente'} • PNG: ${state.dpi} DPI (${p.width} × ${p.height} px)` : 'Informe a largura ou a altura em cm.';
    root.innerHTML = `<div class="vz-layout">
      <section class="vz-card vz-stage-card" aria-label="Arte">
        <div class="vz-toolbar">
          ${state.result ? `<div class="vz-seg" role="group" aria-label="Comparar">${[['lado', 'Lado a lado'], ['sobrepor', 'Sobrepor'], ['resultado', 'Resultado'], ['original', 'Original completo']].map(([k, t]) => `<button type="button" data-vz-view="${k}" aria-pressed="${state.view === k}">${t}</button>`).join('')}</div>` : `<div class="vz-seg" role="group" aria-label="Corrigir recorte"><button type="button" data-vz-tool="" aria-pressed="${!state.tool}">Mover</button><button type="button" data-vz-tool="apagar" aria-pressed="${state.tool === 'apagar'}">Apagar</button><button type="button" data-vz-tool="restaurar" aria-pressed="${state.tool === 'restaurar'}">Restaurar</button></div>
          <label class="vz-brush">Pincel <input type="range" min="4" max="240" value="${state.brush}" data-vz-brush><b>${state.brush}px</b></label>
          <button type="button" class="btn small" data-vz-undo ${state.undo.length ? '' : 'disabled'}>Desfazer</button><button type="button" class="btn small" data-vz-reset>Recorte automático</button>`}
          <div class="vz-seg vz-bg" role="group" aria-label="Fundo da visualização">${[['xadrez', 'Xadrez'], ['preto', 'Preto'], ['branco', 'Branco']].map(([k, t]) => `<button type="button" data-vz-bg="${k}" aria-pressed="${state.bg === k}">${t}</button>`).join('')}</div>
          <div class="vz-zoom"><button type="button" class="btn small" data-vz-zoom="-" aria-label="Diminuir">−</button><button type="button" class="btn small" data-vz-zoom="fit">Ajustar</button><button type="button" class="btn small" data-vz-zoom="+" aria-label="Aumentar">+</button></div>
        </div>
        <div class="vz-viewer ${state.result && state.view === 'lado' ? 'is-two' : ''}${state.result && state.view !== 'original' ? ' is-result' : ''}${state.pick?.dropper ? ' is-dropper' : ''}" data-vz-viewer>
          <figure><canvas data-vz-canvas="a"></canvas><figcaption>${state.result ? (state.view === 'original' ? 'Original completo (enviado)' : state.view === 'sobrepor' ? 'Esquerda: preparada · direita: vetor (arraste a linha)' : 'Preparada') : 'Preparada · a linha tracejada é a área medida'}</figcaption></figure>
          ${state.result && state.view === 'lado' ? '<figure><canvas data-vz-canvas="b"></canvas><figcaption>Vetor (SVG desenhado)</figcaption></figure>' : ''}
        </div>
        ${state.result && state.view === 'sobrepor' ? `<input class="vz-split" type="range" min="0" max="1000" value="${Math.round(state.split * 1000)}" data-vz-split aria-label="Posição da sobreposição">` : ''}
        <p class="vz-hint">${state.result ? (state.pick?.dropper ? 'Toque na arte para pegar a cor daquele ponto.' : 'Toque numa parte para trocar a cor dela. Roda do mouse ou pinça: zoom (as duas imagens juntas). Arraste para mover.') : state.tool ? 'Pinte na imagem para ' + (state.tool === 'apagar' ? 'apagar (fica transparente).' : 'restaurar o original.') : 'Roda do mouse ou pinça: zoom. Arraste para mover.'}</p>
      </section>
      <aside class="vz-card vz-side">
        <div class="vz-file"><b>${esc(state.file?.name || 'Print colado')}</b><span>${state.original.width} × ${state.original.height} px</span><button type="button" class="btn small" data-vz-new>Outra imagem</button></div>
        <label class="vz-check"><input type="checkbox" data-vz-remove ${state.removeBackground ? 'checked' : ''} ${state.busy ? 'disabled' : ''}> <span><b>Remover fundo</b><small>${esc(modeText)}</small></span></label>
        ${state.warnings.map(w => `<p class="vz-warn">${esc(w)}</p>`).join('')}${state.error ? `<p class="vz-error" role="alert">${esc(state.error)}</p>` : ''}
        <div class="vz-measure"><h2>Medida da arte</h2>
          <div class="vz-inputs"><label>Largura (cm)<input inputmode="decimal" autocomplete="off" data-vz-size="largura" value="${esc(state.reference === 'largura' ? state.widthText : cm(s?.widthCm))}" placeholder="ex.: 28"></label><span>×</span><label>Altura (cm)<input inputmode="decimal" autocomplete="off" data-vz-size="altura" value="${esc(state.reference === 'altura' ? state.heightText : cm(s?.heightCm))}" placeholder="ex.: 14"></label></div>
          <small>Digite uma; a outra acompanha a proporção da arte. Conta só a área com arte (sem margem transparente)${box ? `: ${box.width} × ${box.height} px` : ''}.</small>
          <label class="vz-dpi">Resolução do PNG <select data-vz-dpi>${[150, 200, 300, 600].map(d => `<option value="${d}" ${state.dpi === d ? 'selected' : ''}>${d} DPI${d === 300 ? ' (padrão)' : ''}</option>`).join('')}</select></label>
          ${s && box && p.width < box.width * 0.95 ? `<label class="vz-check small"><input type="checkbox" data-vz-printres ${state.printRes ? 'checked' : ''}> <span><b>Calcular na resolução de impressão</b><small>${p.width} × ${p.height} px é o que ${state.dpi} DPI pede nessa medida (a arte tem ${box.width} × ${box.height} px). Mais rápido, mesmo tamanho na impressão.</small></span></label>` : s && box && p.width > box.width * 1.05 ? `<p class="vz-warn">A arte tem ${box.width} px de largura e ${state.dpi} DPI nessa medida pede ${p.width} px: o vetor amplia sem perder nitidez nas bordas, mas detalhes que não existem na imagem não aparecem.</p>` : ''}
        </div>
        <p class="vz-summary">${esc(summaryLine)}</p>
        <button type="button" class="btn primary vz-go" data-vz-go ${s && box && !state.busy ? '' : 'disabled'}>${state.result ? 'Vetorizar de novo' : 'Vetorizar'}</button>
        ${state.busy ? stagesHTML() : ''}
        ${state.result ? resultHTML() : ''}
      </aside>
    </div>`;
    bindMain(root); paintViewer();
  }
  const stagesHTML = () => `<div class="vz-progress" role="status" aria-live="polite"><b>${esc(state.busy)}</b><ol>${STAGES.filter(([k]) => k !== 'pronto').map(([k, t]) => { const order = STAGES.findIndex(x => x[0] === k), now = STAGES.findIndex(x => x[0] === state.stage); return `<li class="${order < now ? 'done' : order === now ? 'now' : ''}">${t}</li>`; }).join('')}</ol><button type="button" class="btn" data-vz-cancel>Cancelar</button></div>`;
  function drawStages() { const box = document.querySelector('.vz-progress'); if (box) { box.outerHTML = stagesHTML(); document.querySelector('[data-vz-cancel]')?.addEventListener('click', cancel); } }
  function resultHTML() {
    const { summary: m, sizes: s, ms, workScale: ws, review } = state.result, heavy = m.regions > 60000 || (m.regions > 25000 && !m.zoned);
    const kind = heavy ? ['warn', 'Arte muito detalhada (parecida com foto)', 'O vetor tem muitas partes. Confira de perto; se não ficar bom, use o PNG da imagem preparada (não é vetor).']
      : review.length ? ['warn', `Vetor com ${review.length} ponto(s) para conferir`, 'Essas áreas ficaram mais longe da original (degradê ou textura difícil). Toque para ver de perto.']
      : ['ok', 'Vetor pronto', 'Nenhuma área ficou com diferença alta em relação à arte preparada. Confira as letras e os detalhes no zoom.'];
    return `<section class="vz-result"><p class="vz-kind ${kind[0]}"><b>${kind[1]}</b><small>${kind[2]}</small></p>
      ${review.length && !heavy ? `<div class="vz-review">${review.slice(0, 12).map((r, i) => `<button type="button" class="btn small" data-vz-review="${i}">Área ${i + 1} · ${r.model === 'solid' ? 'cor lisa' : 'degradê'}</button>`).join('')}</div>` : ''}
      <p class="vz-stats">${m.regions.toLocaleString('pt-BR')} partes · ${m.linear + m.radial} degradês (${m.linear} lineares, ${m.radial} radiais)${m.zoned ? ` · ${m.zoned} com sombreado esfumado` : ''} · ${Math.round(ms / 100) / 10} s${ws < 1 ? ` · calculado em ${state.result.work.width} × ${state.result.work.height} px` : ''} · SVG ${(state.result.svg.length / 1048576).toFixed(1)} MB, sem imagem dentro</p>
      ${paintHTML()}
      <label class="vz-name">Nome da arte<input id="vzName" value="${esc(state.saved?.name || state.name)}" maxlength="120"></label>
      <div class="vz-actions">
        <button type="button" class="btn" data-vz-svg>Baixar SVG (vetor)</button>
        <button type="button" class="btn" data-vz-png>Baixar PNG ${state.dpi} DPI</button>
        <button type="button" class="btn primary" data-vz-film-save>${state.saved ? 'Jogar no filme' : 'Salvar e jogar no filme'}</button>
        <button type="button" class="btn" data-vz-save ${state.saved ? 'disabled' : ''}>${state.saved ? '✓ Salva em Artes prontas' : 'Salvar na biblioteca'}</button>
      </div>
      <p class="vz-files">Arquivos: ${esc(fileBase())}.svg · ${esc(fileBase())}_${state.dpi}dpi.png (${cm(s.widthCm)} × ${cm(s.heightCm)} cm)</p>
      <details class="vz-raster"><summary>Alternativa: PNG da imagem preparada (não é vetor)</summary><p>Para foto ou arte que o vetor não reproduz bem. É a imagem recortada, no tamanho de impressão, sem vetorizar.</p><button type="button" class="btn small" data-vz-raster>Baixar PNG da imagem preparada</button></details>
    </section>`;
  }

  function uploadHTML() {
    return `<section class="vz-card vz-upload" data-vz-drop>${state.busy ? `<p class="vz-progress"><b>${esc(state.busy)}</b></p>` : ''}<div class="vz-drop-icon">⇪</div><h2>Envie a arte</h2><p>PNG, JPG ou WEBP: print, foto ou arquivo da arte. Arraste para cá ou cole um print (⌘V / Ctrl+V).</p><input type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" hidden data-vz-file><button type="button" class="btn primary" data-vz-choose ${state.busy ? 'disabled' : ''}>Escolher imagem</button><small>Remover fundo já vem marcado. A medida é pedida antes de vetorizar.</small></section>`;
  }
  function bindUpload(root) {
    const input = root.querySelector('[data-vz-file]'), drop = root.querySelector('[data-vz-drop]');
    root.querySelector('[data-vz-choose]')?.addEventListener('click', () => input.click());
    input.onchange = () => void load(input.files[0]);
    drop.ondragover = event => { event.preventDefault(); drop.classList.add('drag'); };
    drop.ondragleave = () => drop.classList.remove('drag');
    drop.ondrop = event => { event.preventDefault(); drop.classList.remove('drag'); void load([...event.dataTransfer.files].find(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name))); };
  }
  function bindMain(root) {
    const on = (sel, fn) => root.querySelectorAll(sel).forEach(el => el.addEventListener('click', () => fn(el)));
    on('[data-vz-new]', () => { if (state.busy) cancel(); state = { ...blank(), from: state.from }; draw(); });
    on('[data-vz-view]', el => { state.view = el.dataset.vzView; state.zoom = 0; draw(); });
    on('[data-vz-tool]', el => { state.tool = el.dataset.vzTool; draw(); });
    on('[data-vz-bg]', el => { state.bg = el.dataset.vzBg; draw(); });
    on('[data-vz-undo]', undo);
    on('[data-vz-reset]', () => void prepareBackground());
    on('[data-vz-zoom]', el => zoomBy(el.dataset.vzZoom));
    on('[data-vz-go]', () => void vectorizeNow());
    on('[data-vz-cancel]', cancel);
    on('[data-vz-svg]', () => download(new Blob([state.result.svg], { type: 'image/svg+xml' }), fileBase() + '.svg'));
    on('[data-vz-png]', el => void downloadPng(el));
    on('[data-vz-raster]', () => void rasterPng());
    on('[data-vz-save]', el => void saveToLibrary(el, false));
    on('[data-vz-film-save]', el => void saveToLibrary(el, true));
    on('[data-vz-review]', el => focusReview(Number(el.dataset.vzReview)));
    root.querySelector('[data-vz-brush]')?.addEventListener('input', event => { state.brush = Number(event.target.value); event.target.nextElementSibling.textContent = state.brush + 'px'; });
    root.querySelector('[data-vz-remove]')?.addEventListener('change', event => { state.removeBackground = event.target.checked; void prepareBackground(); });
    root.querySelector('[data-vz-dpi]')?.addEventListener('change', event => { state.dpi = Number(event.target.value); state.result = null; draw(); });
    root.querySelector('[data-vz-printres]')?.addEventListener('change', event => { state.printRes = event.target.checked; draw(); });
    root.querySelector('[data-vz-split]')?.addEventListener('input', event => { state.split = Number(event.target.value) / 1000; paintViewer(); });
    root.querySelectorAll('[data-vz-size]').forEach(input => input.addEventListener('input', () => {
      const which = input.dataset.vzSize, value = parse(input.value);
      state.reference = which; if (which === 'largura') { state.widthText = input.value; state.widthCm = value; } else { state.heightText = input.value; state.heightCm = value; }
      if (state.result) state.result = null;
      const s = sizes(), other = root.querySelector(`[data-vz-size="${which === 'largura' ? 'altura' : 'largura'}"]`);
      if (other) other.value = s ? cm(which === 'largura' ? s.heightCm : s.widthCm) : '';
      const summary = root.querySelector('.vz-summary'), go = root.querySelector('[data-vz-go]'), p = printPx(s);
      if (summary) summary.textContent = s ? `Arte: ${cm(s.widthCm)} × ${cm(s.heightCm)} cm • ${state.mode === 'mantido' ? 'Fundo mantido' : 'Fundo transparente'} • PNG: ${state.dpi} DPI (${p.width} × ${p.height} px)` : 'Informe a largura ou a altura em cm.';
      if (go) go.disabled = !(s && state.box && !state.busy);
      input.setAttribute('aria-invalid', String(Boolean(input.value.trim()) && !value));
    }));
    root.querySelectorAll('[data-vz-size]').forEach(input => input.addEventListener('change', () => draw()));
    colorEdit.bind(root);
    bindViewer(root);
  }

  // ------------------------------------------------------------------ trocar a cor de uma parte (06/11, dono: "às vezes fica
  // manchado; permita clicar num elemento e trocar a cor dele para uma cor sólida ou degradê começando de uma cor e terminando em
  // outra, e o degradê faz sozinho"). Toque numa parte do vetor; "Juntar parecidas" pega a mancha inteira (partes vizinhas de cor
  // parecida). Prévia na hora; Aplicar redesenha o SVG no processo separado (as partes de uma troca usam o MESMO degradê, então
  // ficam contínuas). O degradê automático segue o claro/escuro da arte original na seleção.
  const colorEdit = (() => {
    const self = { version: 0, outline: null, busy: false, preview: null, stats: null };
    const hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
    const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const lab = (r, g, b) => { const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }, R = f(r), G = f(g), B = f(b), t = v => v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116, X = t((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), Y = t(0.2126 * R + 0.7152 * G + 0.0722 * B), Z = t((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883); return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]; };
    self.reset = () => { self.preview = null; self.outline = null; self.stats = null; self.version++; };
    self.shown = () => self.preview || state.result.render;
    function stats() { // caixa, área e cor média de cada parte (uma passada pela arte)
      if (self.stats?.result === state.result) return self.stats;
      const { labels, work, opaque } = state.result, W = work.width, count = opaque.length, box = new Int32Array(count * 4).fill(-1), area = new Float64Array(count), sum = new Float64Array(count * 3);
      for (let p = 0; p < labels.length; p++) {
        const r = labels[p]; if (r < 0) continue; const x = p % W, y = (p - x) / W, o = r * 4;
        if (box[o] < 0) { box[o] = x; box[o + 1] = y; box[o + 2] = x; box[o + 3] = y; } else { if (x < box[o]) box[o] = x; if (x > box[o + 2]) box[o + 2] = x; box[o + 3] = y; }
        area[r]++; sum[r * 3] += work.data[p * 4]; sum[r * 3 + 1] += work.data[p * 4 + 1]; sum[r * 3 + 2] += work.data[p * 4 + 2];
      }
      return self.stats = { result: state.result, box, area, sum, count };
    }
    function info(ids) { // seleção: caixa, área, amostras dos pixels ORIGINAIS (x, y, r, g, b, luz)
      const st = stats(), { labels, work } = state.result, W = work.width, sel = new Uint8Array(st.count);
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, area = 0;
      for (const id of ids) { sel[id] = 1; const o = id * 4; x0 = Math.min(x0, st.box[o]); y0 = Math.min(y0, st.box[o + 1]); x1 = Math.max(x1, st.box[o + 2]); y1 = Math.max(y1, st.box[o + 3]); area += st.area[id]; }
      const step = Math.max(1, Math.floor(Math.sqrt(area / 60000))), samples = [];
      for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) { const p = y * W + x; if (!sel[labels[p]]) continue; const r = work.data[p * 4], g = work.data[p * 4 + 1], b = work.data[p * 4 + 2]; samples.push([x + 0.5, y + 0.5, r, g, b, lum(r, g, b)]); }
      return { sel, x0, y0, x1, y1, area, samples };
    }
    function defaults(inf) {
      const s = inf.samples, n = Math.max(1, s.length), mean = [0, 1, 2].map(c => s.reduce((a, v) => a + v[2 + c], 0) / n);
      const byLum = [...s].sort((a, b) => a[5] - b[5]), k = Math.max(1, Math.round(n * 0.15)), avg = list => [0, 1, 2].map(c => list.reduce((a, v) => a + v[2 + c], 0) / Math.max(1, list.length));
      const dark = avg(byLum.slice(0, k)), light = avg(byLum.slice(-k));
      // Direção automática: plano da luz (claro/escuro) da arte original na seleção; o degradê vai do lado escuro ao claro.
      let mx = 0, my = 0, ml = 0; for (const v of s) { mx += v[0]; my += v[1]; ml += v[5]; } mx /= n; my /= n; ml /= n;
      let sxx = 0, sxy = 0, syy = 0, sxl = 0, syl = 0; for (const v of s) { const dx = v[0] - mx, dy = v[1] - my, dl = v[5] - ml; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; sxl += dx * dl; syl += dy * dl; }
      const det = sxx * syy - sxy * sxy; let gx = det ? (syy * sxl - sxy * syl) / det : 0, gy = det ? (sxx * syl - sxy * sxl) / det : 1; const len = Math.hypot(gx, gy) || 1; gx /= len; gy /= len; if (!det || len < 1e-6) { gx = 0; gy = 1; }
      const t = s.map(v => (v[0] - mx) * gx + (v[1] - my) * gy).sort((a, b) => a - b), t0 = t[Math.floor(t.length * 0.02)] ?? 0, t1 = t[Math.floor(t.length * 0.98)] ?? 1;
      const auto = { x1: mx + gx * t0, y1: my + gy * t0, x2: mx + gx * t1, y2: my + gy * t1 };
      // Redondo: centro no brilho (parte mais clara), raio até quase o ponto mais longe da seleção.
      const top = byLum.slice(-k); let cx = 0, cy = 0; for (const v of top) { cx += v[0]; cy += v[1]; } cx /= top.length || 1; cy /= top.length || 1;
      const dist = s.map(v => Math.hypot(v[0] - cx, v[1] - cy)).sort((a, b) => a - b), r = Math.max(4, dist[Math.floor(dist.length * 0.98)] || 4);
      return { mean, dark, light, auto, radial: { cx, cy, r } };
    }
    function geometry(pick) {
      const { x0, y0, x1, y1 } = pick.info, cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
      return { auto: pick.def.auto, down: { x1: cx, y1: y0, x2: cx, y2: y1 + 1 }, right: { x1: x0, y1: cy, x2: x1 + 1, y2: cy }, diag: { x1: x0, y1: y0, x2: x1 + 1, y2: y1 + 1 }, diag2: { x1: x0, y1: y1 + 1, x2: x1 + 1, y2: y0 } }[pick.dir] || pick.def.auto;
    }
    function fillOf(pick) {
      if (pick.mode === 'solid') return { type: 'solid', color: rgb(pick.color) };
      if (pick.mode === 'radial') return { type: 'radial', ...pick.def.radial, from: rgb(pick.center), to: rgb(pick.edge) };
      return { type: 'linear', ...geometry(pick), from: rgb(pick.from), to: rgb(pick.to) };
    }
    function colorAt(fill, x, y) {
      if (fill.type === 'solid') return fill.color;
      let t;
      if (fill.type === 'linear') { const dx = fill.x2 - fill.x1, dy = fill.y2 - fill.y1; t = ((x - fill.x1) * dx + (y - fill.y1) * dy) / Math.max(1e-9, dx * dx + dy * dy); }
      else t = Math.hypot(x - fill.cx, y - fill.cy) / fill.r;
      t = Math.max(0, Math.min(1, t)); return [0, 1, 2].map(c => fill.from[c] + (fill.to[c] - fill.from[c]) * t);
    }
    function repaint() { // prévia: só os pixels da seleção mudam (rápido); a transparência de cada pixel fica
      const pick = state.pick, base = state.result.render;
      if (!pick) { self.preview = null; self.version++; return; }
      if (!self.preview) self.preview = { width: base.width, height: base.height, data: new Uint8ClampedArray(base.data) };
      const { labels, work } = state.result, W = work.width, { sel, x0, y0, x1, y1 } = pick.info, fill = fillOf(pick), d = self.preview.data;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const p = y * W + x; if (!sel[labels[p]]) continue; const c = colorAt(fill, x + 0.5, y + 0.5); d[p * 4] = c[0]; d[p * 4 + 1] = c[1]; d[p * 4 + 2] = c[2]; }
      self.version++;
    }
    function outline() { // contorno laranja da seleção, com espessura que se vê no zoom atual (arte grande vista inteira também)
      const pick = state.pick; if (!pick) { self.outline = null; return; }
      const t = Math.max(1, Math.min(24, Math.ceil(2.5 / Math.min(1, state.zoom || 1)))), m = t + 1;
      const { labels, work } = state.result, W = work.width, H = work.height, { sel, x0, y0, x1, y1 } = pick.info, w = x1 - x0 + 1 + 2 * m, h = y1 - y0 + 1 + 2 * m, img = new ImageData(w, h);
      const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && sel[labels[y * W + x]] === 1;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (!inside(x, y) || (inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1))) continue;
        for (let dy = -t; dy <= t; dy++) for (let dx = -t; dx <= t; dx++) { if (inside(x + dx, y + dy)) continue; const o = ((y + dy - y0 + m) * w + (x + dx - x0 + m)) * 4; img.data[o] = 255; img.data[o + 1] = 100; img.data[o + 2] = 40; img.data[o + 3] = 255; }
      }
      const canvas = new OffscreenCanvas(w, h); canvas.getContext('2d').putImageData(img, 0, 0); self.outline = { canvas, x0: x0 - m, y0: y0 - m, zoom: state.zoom || 1 };
    }
    let rezoom = 0;
    self.checkZoom = () => { // zoom mudou bastante: refaz a espessura do contorno (sem travar o arrastar)
      if (!self.outline || !state.pick || Math.abs(Math.log((state.zoom || 1) / self.outline.zoom)) < 0.6) return;
      clearTimeout(rezoom); rezoom = setTimeout(() => { outline(); paintViewer(); }, 150);
    };
    function select(ids, keepColors = false) {
      const inf = info(ids), def = defaults(inf), old = state.pick;
      state.pick = { ids, info: inf, def, mode: old?.mode || 'solid', dir: old?.dir || 'auto', add: old?.add || false, tol: old?.tol || 0, dropper: '', touched: keepColors && old?.touched,
        color: keepColors && old?.touched ? old.color : hex(def.mean), from: keepColors && old?.touched ? old.from : hex(def.dark), to: keepColors && old?.touched ? old.to : hex(def.light), center: keepColors && old?.touched ? old.center : hex(def.light), edge: keepColors && old?.touched ? old.edge : hex(def.dark) };
      self.preview = null; outline(); repaint(); draw();
    }
    self.tap = (x, y) => {
      const { labels, work } = state.result; if (x < 0 || y < 0 || x >= work.width || y >= work.height) return;
      const pick = state.pick;
      if (pick?.dropper) { const p = (y * work.width + x) * 4; pick[pick.dropper] = hex([work.data[p], work.data[p + 1], work.data[p + 2]]); pick.dropper = ''; pick.touched = true; repaint(); draw(); return; }
      const id = labels[y * work.width + x];
      if (id < 0) return toast('Aí é fundo transparente: toque numa parte da arte.', 'err');
      if (pick?.add) { const ids = pick.ids.includes(id) ? pick.ids.filter(v => v !== id) : [...pick.ids, id]; if (!ids.length) { state.pick = null; self.reset(); draw(); return; } return select(ids, true); }
      select([id]);
    };
    function similar() { // junta as partes vizinhas de cor parecida com a seleção (cada toque aumenta a tolerância)
      const pick = state.pick, st = stats(), { labels, work } = state.result, W = work.width, H = work.height, tol = Math.min(40, (pick.tol || 4) + 6);
      let ids = new Set(pick.ids); const meanOf = list => { let a = 0; const m = [0, 0, 0]; for (const id of list) { a += st.area[id]; for (let c = 0; c < 3; c++) m[c] += st.sum[id * 3 + c]; } return lab(...m.map(v => v / Math.max(1, a))); };
      const target = meanOf(ids);
      for (let round = 0; round < 60; round++) {
        const sel = new Uint8Array(st.count); let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1; for (const id of ids) { sel[id] = 1; const o = id * 4; x0 = Math.min(x0, st.box[o]); y0 = Math.min(y0, st.box[o + 1]); x1 = Math.max(x1, st.box[o + 2]); y1 = Math.max(y1, st.box[o + 3]); }
        const near = new Set();
        for (let y = Math.max(0, y0 - 1); y <= Math.min(H - 1, y1 + 1); y++) for (let x = Math.max(0, x0 - 1); x <= Math.min(W - 1, x1 + 1); x++) { const r = labels[y * W + x]; if (r < 0 || sel[r]) continue; if ((x > 0 && sel[labels[y * W + x - 1]]) || (x < W - 1 && sel[labels[y * W + x + 1]]) || (y > 0 && sel[labels[(y - 1) * W + x]]) || (y < H - 1 && sel[labels[(y + 1) * W + x]])) near.add(r); }
        let added = 0; for (const r of near) { const c = lab(...[0, 1, 2].map(k => st.sum[r * 3 + k] / Math.max(1, st.area[r]))); if (Math.hypot(c[0] - target[0], c[1] - target[1], c[2] - target[2]) <= tol) { ids.add(r); added++; } }
        if (!added) break;
      }
      select([...ids], true); state.pick.tol = tol; draw();
    }
    async function recolorWith(edits, message) {
      self.busy = true; draw();
      try {
        const out = await run({ type: 'recolor', edits });
        const render = await renderSvg(out.svg, state.result.work.width, state.result.work.height);
        Object.assign(state.result, { svg: out.svg, render, edits }); state.pick = null; state.saved = null; self.reset();
        toast(message, 'ok');
      } catch (error) { toast('Não foi possível trocar a cor: ' + (error?.message || error), 'err'); }
      self.busy = false; draw();
    }
    self.html = () => {
      const r = state.result, pick = state.pick, edits = r.edits.length, total = r.work.width * r.work.height;
      const history = edits ? `<div class="vz-paint-history"><span>${edits} troca(s) de cor aplicada(s)</span><button type="button" class="btn small" data-vz-undo-color ${self.busy ? 'disabled' : ''}>Desfazer a última</button><button type="button" class="btn small" data-vz-reset-color ${self.busy ? 'disabled' : ''}>Voltar ao original</button></div>` : '';
      if (!pick) return `<section class="vz-paint"><h3>Trocar a cor de uma parte</h3><p>Ficou alguma mancha? <b>Toque na parte</b> no vetor (imagem da direita) e troque por cor sólida ou degradê.</p>${history}</section>`;
      const color = (key, label) => `<label class="vz-color"><span>${label}</span><input type="color" value="${pick[key]}" data-vz-color="${key}"><button type="button" class="btn small${pick.dropper === key ? ' is-on' : ''}" data-vz-dropper="${key}" title="Pegar a cor da arte original">${pick.dropper === key ? 'Toque na arte…' : '💧 Pegar da arte'}</button></label>`;
      const dirs = [['auto', 'Automático'], ['down', '↓'], ['right', '→'], ['diag', '↘'], ['diag2', '↗']];
      const body = pick.mode === 'solid' ? color('color', 'Cor')
        : pick.mode === 'radial' ? `${color('center', 'Cor do centro')}${color('edge', 'Cor da borda')}<button type="button" class="btn small" data-vz-swap>⇄ Inverter cores</button>`
        : `${color('from', 'Cor do início')}${color('to', 'Cor do fim')}<div class="vz-dirs" role="group" aria-label="Direção">${dirs.map(([k, t]) => `<button type="button" class="btn small" data-vz-dir="${k}" aria-pressed="${pick.dir === k}">${t}</button>`).join('')}</div><button type="button" class="btn small" data-vz-swap>⇄ Inverter cores</button><small>Automático: segue o claro e o escuro da arte original nessa parte.</small>`;
      return `<section class="vz-paint is-open"><h3>Trocar a cor de uma parte</h3>
        <p class="vz-paint-sel"><b>${pick.ids.length} parte(s) selecionada(s)</b> · ${(pick.info.area / total * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% da arte${pick.tol ? ` · parecidas até ${pick.tol}` : ''}</p>
        <div class="vz-paint-row"><button type="button" class="btn small" data-vz-similar>✚ Juntar parecidas</button><button type="button" class="btn small" data-vz-add aria-pressed="${pick.add}">${pick.add ? '✓ Tocando junta mais' : '✚ Tocar para juntar mais'}</button><button type="button" class="btn small" data-vz-unpick>Limpar</button></div>
        <div class="vz-seg" role="group" aria-label="Tipo de cor">${[['solid', 'Cor sólida'], ['linear', 'Degradê'], ['radial', 'Redondo']].map(([k, t]) => `<button type="button" data-vz-mode="${k}" aria-pressed="${pick.mode === k}">${t}</button>`).join('')}</div>
        <div class="vz-paint-body">${body}</div>
        <div class="vz-paint-actions"><button type="button" class="btn primary" data-vz-apply ${self.busy ? 'disabled' : ''}>${self.busy ? 'Aplicando…' : 'Aplicar'}</button><button type="button" class="btn" data-vz-unpick ${self.busy ? 'disabled' : ''}>Cancelar</button></div>
        ${history}</section>`;
    };
    self.bind = root => {
      const on = (sel, fn) => root.querySelectorAll(sel).forEach(el => el.addEventListener('click', () => fn(el)));
      const pick = () => state.pick;
      on('[data-vz-mode]', el => { pick().mode = el.dataset.vzMode; pick().dropper = ''; repaint(); draw(); });
      on('[data-vz-dir]', el => { pick().dir = el.dataset.vzDir; repaint(); draw(); });
      on('[data-vz-swap]', () => { const p = pick(); if (p.mode === 'radial') [p.center, p.edge] = [p.edge, p.center]; else [p.from, p.to] = [p.to, p.from]; p.touched = true; repaint(); draw(); });
      on('[data-vz-dropper]', el => { const p = pick(); p.dropper = p.dropper === el.dataset.vzDropper ? '' : el.dataset.vzDropper; draw(); });
      on('[data-vz-add]', () => { pick().add = !pick().add; draw(); });
      on('[data-vz-similar]', () => similar());
      on('[data-vz-unpick]', () => { state.pick = null; self.reset(); draw(); });
      on('[data-vz-apply]', () => { const p = pick(); void recolorWith([...state.result.edits, { ids: [...p.ids], fill: fillOf(p) }], p.mode === 'solid' ? 'Cor trocada. O SVG e o PNG já saem com a cor nova.' : 'Degradê aplicado. O SVG e o PNG já saem com ele.'); });
      on('[data-vz-undo-color]', () => void recolorWith(state.result.edits.slice(0, -1), 'Última troca desfeita.'));
      on('[data-vz-reset-color]', () => void recolorWith([], 'Cores de volta ao original.'));
      let frame = 0;
      root.querySelectorAll('[data-vz-color]').forEach(input => input.addEventListener('input', () => { const p = pick(); p[input.dataset.vzColor] = input.value; p.touched = true; cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { repaint(); paintViewer(); }); }));
    };
    return self;
  })();
  const paintHTML = () => colorEdit.html();

  // ------------------------------------------------------------------ visualizador (zoom e posição iguais nas duas imagens)
  let sources = { a: null, b: null, key: '' };
  function viewerSources() {
    const key = [state.view, state.result ? 'r' : 'p', state.full?.data?.byteLength, state.box && Object.values(state.box).join(','), state.undo.length, colorEdit.version].join('|');
    if (sources.key === key && sources.a) return sources;
    sources = { key, a: null, b: null, w: 0, h: 0 };
    if (state.result) {
      const work = state.result.work;
      sources.w = work.width; sources.h = work.height;
      if (state.view === 'original') { sources.a = imageToCanvas(state.original); sources.w = state.original.width; sources.h = state.original.height; }
      else if (state.view === 'resultado') sources.a = imageToCanvas(colorEdit.shown());
      else if (state.view === 'sobrepor') { sources.a = imageToCanvas(work); sources.b = imageToCanvas(colorEdit.shown()); }
      else { sources.a = imageToCanvas(work); sources.b = imageToCanvas(colorEdit.shown()); }
    } else if (state.full) { sources.a = imageToCanvas(state.full); sources.w = state.full.width; sources.h = state.full.height; }
    return sources;
  }
  function paintViewer() {
    const viewer = document.querySelector('[data-vz-viewer]'); if (!viewer) return;
    const src = viewerSources(); if (!src.a) return;
    const canvases = [...viewer.querySelectorAll('canvas')];
    for (const canvas of canvases) { const rect = canvas.parentElement.getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1); canvas.width = Math.max(1, Math.round(rect.width * dpr)); canvas.height = Math.max(1, Math.round(Math.min(rect.width * 0.85, 640) * dpr)); canvas.style.height = Math.round(canvas.height / dpr) + 'px'; }
    const W = canvases[0].width, H = canvases[0].height;
    if (!state.zoom) { state.zoom = Math.min(W / src.w, H / src.h) * 0.96; state.panX = (W - src.w * state.zoom) / 2; state.panY = (H - src.h * state.zoom) / 2; }
    canvases.forEach((canvas, index) => {
      const g = canvas.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); background(g, canvas.width, canvas.height);
      g.imageSmoothingEnabled = state.zoom < 2; g.imageSmoothingQuality = 'high';
      g.setTransform(state.zoom, 0, 0, state.zoom, state.panX, state.panY);
      if (state.result && state.view === 'sobrepor') {
        g.drawImage(src.a, 0, 0); const cut = state.split * canvas.width; g.setTransform(1, 0, 0, 1, 0, 0); g.save(); g.beginPath(); g.rect(cut, 0, canvas.width - cut, canvas.height); g.clip();
        background(g, canvas.width, canvas.height); g.setTransform(state.zoom, 0, 0, state.zoom, state.panX, state.panY); g.drawImage(src.b || imageToCanvas(colorEdit.shown()), 0, 0); g.restore();
        g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#ff6428'; g.fillRect(cut - 1, 0, 2, canvas.height);
      } else g.drawImage(index === 0 ? src.a : src.b, 0, 0);
      if (state.result && state.view !== 'original' && colorEdit.outline) { colorEdit.checkZoom(); g.setTransform(state.zoom, 0, 0, state.zoom, state.panX, state.panY); g.imageSmoothingEnabled = false; g.drawImage(colorEdit.outline.canvas, colorEdit.outline.x0, colorEdit.outline.y0); }
      if (!state.result && state.box) { g.setTransform(1, 0, 0, 1, 0, 0); g.setLineDash([6, 5]); g.strokeStyle = '#ff6428'; g.lineWidth = 2; g.strokeRect(state.panX + state.box.x0 * state.zoom, state.panY + state.box.y0 * state.zoom, state.box.width * state.zoom, state.box.height * state.zoom); g.setLineDash([]); }
    });
  }
  function background(g, w, h) {
    if (state.bg === 'preto') { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); return; }
    if (state.bg === 'branco') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); return; }
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#d4d4d8'; for (let y = 0; y < h; y += 12) for (let x = (y / 12) % 2 ? 12 : 0; x < w; x += 24) g.fillRect(x, y, 12, 12);
  }
  function zoomBy(how, cx, cy) {
    const viewer = document.querySelector('[data-vz-canvas="a"]'); if (!viewer) return;
    if (how === 'fit') { state.zoom = 0; return paintViewer(); }
    const factor = typeof how === 'number' ? how : how === '+' ? 1.4 : 1 / 1.4, x = cx ?? viewer.width / 2, y = cy ?? viewer.height / 2, next = Math.max(0.01, Math.min(40, state.zoom * factor));
    state.panX = x - (x - state.panX) * next / state.zoom; state.panY = y - (y - state.panY) * next / state.zoom; state.zoom = next; paintViewer();
  }
  function focusReview(index) {
    const r = state.result.review[index], canvas = document.querySelector('[data-vz-canvas="a"]'); if (!r || !canvas) return;
    const w = r.box.maxX - r.box.minX, h = r.box.maxY - r.box.minY, z = Math.min(canvas.width / (w * 1.6), canvas.height / (h * 1.6), 12);
    state.zoom = z; state.panX = canvas.width / 2 - (r.box.minX + w / 2) * z; state.panY = canvas.height / 2 - (r.box.minY + h / 2) * z; state.view = 'lado'; draw();
  }
  function bindViewer(root) {
    const viewer = root.querySelector('[data-vz-viewer]'); if (!viewer) return;
    const pointers = new Map(); let last = null, stroke = null, pinch = null, down = null;
    const local = (canvas, event) => { const rect = canvas.getBoundingClientRect(), k = canvas.width / rect.width; return { x: (event.clientX - rect.left) * k, y: (event.clientY - rect.top) * k }; };
    const imagePoint = p => ({ x: (p.x - state.panX) / state.zoom, y: (p.y - state.panY) / state.zoom });
    viewer.addEventListener('wheel', event => { event.preventDefault(); const canvas = event.target.closest('canvas') || viewer.querySelector('canvas'), p = local(canvas, event); zoomBy(Math.exp(-event.deltaY * 0.0015), p.x, p.y); }, { passive: false });
    viewer.addEventListener('pointerdown', event => {
      const canvas = event.target.closest('canvas'); if (!canvas) return; canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, local(canvas, event)); down = { x: event.clientX, y: event.clientY, moved: false };
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: state.zoom }; stroke = null; return; }
      if (state.tool && !state.result && state.full) { stroke = { tiles: new Map(), canvas }; const p = imagePoint(local(canvas, event)); paint(p.x, p.y, stroke); paintViewer(); }
      else last = local(canvas, event);
    });
    viewer.addEventListener('pointermove', event => {
      const canvas = event.target.closest('canvas'); if (!canvas || !pointers.has(event.pointerId)) return;
      const p = local(canvas, event); pointers.set(event.pointerId, p); if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) down.moved = true;
      if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y); zoomBy(pinch.zoom * d / pinch.d / state.zoom, (a.x + b.x) / 2, (a.y + b.y) / 2); return; }
      if (stroke) { const q = imagePoint(p); paint(q.x, q.y, stroke); paintViewer(); return; }
      if (last) { state.panX += p.x - last.x; state.panY += p.y - last.y; last = p; paintViewer(); }
    });
    const end = event => {
      const canvas = event.target.closest?.('canvas');
      if (event.type === 'pointerup' && down && !down.moved && !pinch && pointers.size === 1 && canvas && state.result && state.view !== 'original' && !colorEdit.busy) { const q = imagePoint(local(canvas, event)); colorEdit.tap(Math.floor(q.x), Math.floor(q.y)); }
      down = null; pointers.delete(event.pointerId); if (pointers.size < 2) pinch = null; if (stroke && !pointers.size) { if (stroke.tiles.size) state.undo.push(stroke); stroke = null; afterMaskChange(); } last = null; };
    viewer.addEventListener('pointerup', end); viewer.addEventListener('pointercancel', end);
  }

  return { render };
}
