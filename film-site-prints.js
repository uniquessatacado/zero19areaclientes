// 2.17.99 (14/11, dono: "no 019 permita baixar as estampas do estúdio (Estampa Política) em alta, PNG 300 DPI no mínimo, para eu fazer
// halftone e subir de novo; então trocar a estampa atual chapada pela halftone e usar a partir de agora; um botão no Montar filme").
// Lista as estampas do site com a arte que a produção usa; "Baixar PNG" (o arquivo de impressão, com DPI na medida), "Subir halftone"
// (PNG com pelo menos 300 DPI na mesma largura; vale para os pedidos novos e para os que esperam produção) e "Voltar para a original".
// Banco: z19p_site_prints_list / z19p_site_print_set_halftone / z19p_site_print_restore.
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const COLLECTIONS = [['all', 'Todas'], ['GTA6', 'GTA VI'], ['BOLSONARO', 'Bolsonaro'], ['LULA', 'Lula'], ['HALFTONE', 'Já com halftone']];
const plain = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmt = (value, digits = 1) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: digits });
let cssDone = false;
function injectCss() {
  if (cssDone) return; cssDone = true;
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = new URL('./film-site-prints.css?v=2.17.99', import.meta.url).href; document.head.appendChild(link);
}

export function openSitePrints({ supabase, toast = message => alert(message), owner }) {
  injectCss();
  const back = document.createElement('div');
  back.className = 'sp-back';
  back.innerHTML = `<section class="sp-modal" role="dialog" aria-modal="true" aria-labelledby="sp-title">
    <header class="sp-head"><div><p>ESTAMPAS DO SITE · ESTAMPA POLÍTICA E GTA VI</p><h2 id="sp-title">Baixar e trocar por halftone</h2><small>1) Baixe o PNG · 2) Faça o halftone (mesma medida, 300 DPI ou mais) · 3) Suba de volta. Pedidos novos e os que esperam produção passam a usar o halftone.</small></div><button type="button" class="sp-x" aria-label="Fechar">✕</button></header>
    <div class="sp-tools"><input class="sp-search" type="search" placeholder="Buscar estampa (ex.: GTA VI #08 costas)" aria-label="Buscar estampa"><div class="sp-chips">${COLLECTIONS.map(([key, label]) => `<button type="button" data-col="${key}" aria-pressed="${key === 'all'}">${label}</button>`).join('')}</div></div>
    <div class="sp-body"><p class="sp-loading">Carregando as estampas…</p></div>
    <input type="file" accept="image/png" class="sp-file" hidden>
  </section>`;
  document.body.appendChild(back);
  const body = back.querySelector('.sp-body'), search = back.querySelector('.sp-search'), file = back.querySelector('.sp-file');
  let rows = [], collection = 'all', limit = 40, uploadFor = null, busy = '';
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = event => { if (event.key === 'Escape' && !busy) close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('mousedown', event => { if (event.target === back && !busy) close(); });
  back.querySelector('.sp-x').onclick = () => { if (!busy) close(); };

  const filtered = () => {
    const term = plain(search.value).trim();
    return rows.filter(row => (collection === 'all' || (collection === 'HALFTONE' ? row.halftone : row.candidate === collection)) && (!term || term.split(/\s+/).every(part => plain(row.name).includes(part))));
  };
  const minPx = row => Math.ceil(Number(row.width_cm || 0) / 2.54 * 300);
  const render = () => {
    const list = filtered();
    if (!list.length) { body.innerHTML = '<p class="sp-empty">Nenhuma estampa nesta busca.</p>'; return; }
    body.innerHTML = `<p class="sp-count">${list.length} estampa${list.length === 1 ? '' : 's'}</p><ul class="sp-list">${list.slice(0, limit).map(row => `<li class="sp-row${row.halftone ? ' is-halftone' : ''}" data-id="${esc(row.print_id)}">
      <div class="sp-thumb${row.candidate === 'GTA6' || /costas|frente/i.test(row.name) ? ' dark' : ''}"><img src="${esc(row.preview_url)}" alt="" loading="lazy"></div>
      <div class="sp-info"><b>${esc(row.name)}</b>
        <span>${fmt(row.width_cm)} × ${fmt(row.height_cm)} cm · ${esc(row.width_px)} × ${esc(row.height_px)} px · <strong class="${Number(row.dpi) >= 300 ? 'ok' : 'low'}">${esc(row.dpi || '?')} DPI</strong></span>
        <span class="sp-tags">${row.halftone ? '<em class="ht">HALFTONE em uso</em>' : '<em>Chapada (original)</em>'}${row.pending ? `<em class="wait">${row.pending} na fila</em>` : ''}</span></div>
      <div class="sp-actions"><button type="button" data-act="download" ${busy ? 'disabled' : ''}>⬇ Baixar PNG</button><button type="button" data-act="upload" class="main" ${busy ? 'disabled' : ''}>${busy === row.print_id ? 'Enviando…' : '⇧ Subir halftone'}</button>${row.halftone ? `<button type="button" data-act="restore" class="soft" ${busy ? 'disabled' : ''}>↺ Voltar original</button>` : ''}</div>
      <small class="sp-hint">Halftone: PNG transparente com pelo menos ${minPx(row)} px de largura (300 DPI em ${fmt(row.width_cm)} cm).</small>
    </li>`).join('')}</ul>${list.length > limit ? `<button type="button" class="sp-more">Mostrar mais (${list.length - limit})</button>` : ''}`;
  };
  const load = async () => {
    const { data, error } = await supabase.rpc('z19p_site_prints_list');
    if (error) { body.innerHTML = `<p class="sp-empty">Não foi possível abrir: ${esc(error.message)}</p>`; return; }
    rows = data || []; render();
  };
  search.addEventListener('input', () => { limit = 40; render(); });
  back.querySelectorAll('[data-col]').forEach(button => button.addEventListener('click', () => { collection = button.dataset.col; limit = 40; back.querySelectorAll('[data-col]').forEach(item => item.setAttribute('aria-pressed', String(item === button))); render(); }));
  body.addEventListener('click', async event => {
    if (event.target.closest('.sp-more')) { limit += 40; render(); return; }
    const button = event.target.closest('[data-act]'); if (!button || busy) return;
    const row = rows.find(item => item.print_id === button.closest('.sp-row')?.dataset.id); if (!row) return;
    if (button.dataset.act === 'download') {
      button.disabled = true; button.textContent = 'Baixando…';
      try {
        const { data, error } = await supabase.storage.from(row.bucket).createSignedUrl(row.path, 600);
        if (error || !data?.signedUrl) throw new Error(error?.message || 'arquivo não encontrado');
        const blob = await (await fetch(data.signedUrl)).blob();
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = `${row.name.replace(/[\\/:*?"<>|·]+/g, ' ').replace(/\s+/g, ' ').trim()} - ${fmt(row.width_cm)}cm ${row.dpi}dpi.png`;
        document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
        toast(`PNG baixado: ${row.width_px} × ${row.height_px} px (${row.dpi} DPI em ${fmt(row.width_cm)} cm).`, 'ok');
      } catch (error) { toast('Não foi possível baixar: ' + error.message, 'err'); }
      finally { button.disabled = false; button.textContent = '⬇ Baixar PNG'; }
    } else if (button.dataset.act === 'upload') { uploadFor = row; file.value = ''; file.click(); }
    else if (button.dataset.act === 'restore') {
      if (!confirm(`Voltar "${row.name}" para a arte original (chapada)?\n\nPedidos novos e os que esperam produção voltam a usar a original.`)) return;
      busy = row.print_id; render();
      const { data, error } = await supabase.rpc('z19p_site_print_restore', { p_print_id: row.print_id });
      busy = '';
      if (error) { toast(error.message, 'err'); render(); return; }
      rows = data.list || rows; render(); toast(`Voltou para a original${data.pending_swapped ? ` · ${data.pending_swapped} da fila trocados` : ''}.`, 'ok');
    }
  });
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0], row = uploadFor; uploadFor = null;
    if (!chosen || !row) return;
    if (chosen.type !== 'image/png') { toast('Envie o halftone em PNG (com transparência).', 'err'); return; }
    let width = 0, height = 0;
    try { const bitmap = await createImageBitmap(chosen); width = bitmap.width; height = bitmap.height; bitmap.close?.(); }
    catch { toast('Não foi possível ler o PNG.', 'err'); return; }
    if (width < minPx(row)) { toast(`O halftone tem ${width} px de largura: em ${fmt(row.width_cm)} cm isso dá ${Math.round(width / (row.width_cm / 2.54))} DPI. Envie com pelo menos ${minPx(row)} px (300 DPI).`, 'err'); return; }
    const ratioOld = row.width_px / row.height_px, ratioNew = width / height;
    if (Math.abs(ratioNew - ratioOld) / ratioOld > 0.03 && !confirm(`A proporção do halftone é diferente da original (altura ${fmt(row.width_cm * height / width)} cm em vez de ${fmt(row.height_cm)} cm).\n\nUsar mesmo assim? A largura continua ${fmt(row.width_cm)} cm.`)) return;
    if (!confirm(`Trocar "${row.name}" pelo halftone (${width} × ${height} px, ${Math.round(width / (row.width_cm / 2.54))} DPI)?\n\nPedidos NOVOS e os que ESPERAM produção${row.pending ? ` (${row.pending} agora)` : ''} passam a usar o halftone. O que já foi impresso não muda.`)) return;
    busy = row.print_id; render();
    try {
      const path = `${owner()}/vdr-political/${crypto.randomUUID()}/halftone.png`;
      const { error: upError } = await supabase.storage.from('z19p-private').upload(path, chosen, { contentType: 'image/png', upsert: false });
      if (upError) throw new Error(upError.message);
      const { data, error } = await supabase.rpc('z19p_site_print_set_halftone', { p_print_id: row.print_id, p_path: path, p_width_px: width, p_height_px: height });
      if (error) throw new Error(error.message);
      rows = data.list || rows;
      toast(`Halftone em uso em "${row.name}" (${fmt(data.width_cm)} × ${fmt(data.height_cm)} cm)${data.pending_swapped ? ` · ${data.pending_swapped} pedidos da fila trocados` : ''}.`, 'ok');
    } catch (error) { toast('Não foi possível trocar: ' + error.message, 'err'); }
    finally { busy = ''; render(); }
  });
  void load();
}
