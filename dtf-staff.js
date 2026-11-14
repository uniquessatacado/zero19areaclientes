// 019 · lado da equipe do "DTF por metro" (13/11, dono): "no 019 eu cadastro o cliente; no meu Montar filme mostra que um
// cliente mandou o filme para imprimirmos; então eu posso adicionar o filme dele no meu filme, as artes deles, e posso mexer,
// modificar tamanhos, tudo como é; cadastramos o preço do metro para esse cliente (58 × 100 e 28 × 100)"; "no Montar filme um
// botão de pedidos DTF metro deve gerar uma notificação com a quantidade de pedidos para adicionar em nosso filme; quando
// adicionar vem para o nosso filme as artes, tudo separadinho, e a gente pode modificar como quiser".
//  - Botão "🎞 Pedidos DTF metro" no Montar filme com contador (pedidos novos na fila) e aviso quando chega pedido novo.
//  - Janela com Pedidos (Pôr no meu filme, Pronto, Entregue, Voltar para a fila, Cancelar, WhatsApp) e Clientes (cadastro,
//    preços 58/28, cobrança por metro/por arte/automática com a tabela de tamanhos, link de acesso).
//  - "Pôr no meu filme": cada arte do pedido entra no filme como item próprio (medida e quantidade do cliente), editável como
//    qualquer arte; o pedido fica "Em produção" para o cliente.
const ZERO19_OWNER = '96d8732c-9576-4af9-9fe7-cdee065c14e6';
const BUCKET = 'z19p-private';
const PENDING_KEY = 'z19p-dtf-pending-import';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = value => value === null || value === undefined || value === '' ? '—' : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (value, digits = 1) => Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: digits });
const dateText = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
const greeting = () => { const h = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(new Date())); return h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite'; };
const phoneDigits = value => { let d = String(value || '').replace(/\D/g, ''); if (d.length === 10 || d.length === 11) d = '55' + d; return d.length >= 12 ? d : ''; };
const parseNum = value => { const n = Number(String(value ?? '').replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const MODE_LABEL = { meter: 'Por metro', art: 'Por arte (tabela)', auto: 'Automático: menos de 1 m por arte, depois por metro' };
const STATUS = { sent: ['Novo · na fila', 'is-new'], printing: ['Em produção', 'is-printing'], ready: ['Pronto', 'is-ready'], delivered: ['Entregue', 'is-done'], cancelled: ['Cancelado', 'is-cancel'] };

let api = null, lastCount = null, pollTimer = null, filmAdder = null;

function injectCss() {
  if (document.querySelector('link[data-dtf-staff]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = new URL('./dtf-staff.css?v=2.17.96', import.meta.url).href; link.dataset.dtfStaff = '1';
  document.head.appendChild(link);
}
const isZero19 = () => String(api?.owner?.() || '') === ZERO19_OWNER;

// Chamado uma vez quando o 019 monta a produção.
export function installDtfStaff({ supabase, toast, nav, owner }) {
  api = { supabase, toast: toast || ((m) => alert(m)), nav, owner };
  injectCss();
  if (!installDtfStaff.listening) {
    installDtfStaff.listening = true;
    document.addEventListener('click', event => {
      const button = event.target.closest?.('[data-dtf-panel]');
      if (!button) return;
      event.preventDefault();
      openDtfPanel({ tab: button.dataset.dtfPanel || 'orders', addToFilm: document.querySelector('.film-page') ? filmAdder : null });
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshCount(); });
  }
  clearInterval(pollTimer);
  pollTimer = setInterval(refreshCount, 30000);
  setTimeout(refreshCount, 1500);
}
async function refreshCount() {
  if (!api || !isZero19() || document.visibilityState !== 'visible') { paintBadges(); return; }
  const { data, error } = await api.supabase.rpc('z19p_dtf_staff_count');
  if (error) return;
  const count = Number(data) || 0;
  if (lastCount !== null && count > lastCount) api.toast('🎞 Chegou ' + (count - lastCount === 1 ? 'um pedido novo' : (count - lastCount) + ' pedidos novos') + ' de DTF por metro. Veja em "Pedidos DTF metro" no Montar filme.', 'ok');
  lastCount = count; paintBadges();
}
function paintBadges() { for (const badge of document.querySelectorAll('[data-dtf-badge]')) { const show = isZero19() && lastCount > 0; badge.hidden = !show; badge.textContent = show ? String(lastCount) : ''; } }
export function dtfFilmButtonHTML() {
  if (!isZero19()) return '';
  return '<button class="btn film-action film-action-dtf" type="button" data-dtf-panel="orders" id="openDtfOrders">🎞 Pedidos DTF metro <b class="z19dtf-badge" data-dtf-badge hidden></b></button>';
}
export function dtfMenuButtonHTML() {
  return isZero19() ? '<button type="button" data-dtf-panel="clients">🎞 Clientes DTF metro <b class="z19dtf-badge" data-dtf-badge hidden></b></button>' : '';
}
// O Montar filme registra como pôr itens no filme; se veio do menu com um pedido para importar, importa agora.
export function bindDtfFilm(addToFilm) {
  filmAdder = addToFilm; paintBadges();
  let pending = null;
  try { pending = sessionStorage.getItem(PENDING_KEY); sessionStorage.removeItem(PENDING_KEY); } catch { /* ok */ }
  if (pending && addToFilm) setTimeout(() => importById(pending, addToFilm), 300);
}
async function importById(filmId, addToFilm) {
  const { data, error } = await api.supabase.rpc('z19p_dtf_staff_orders', { p_scope: 'all' });
  if (error) { api.toast(error.message, 'err'); return; }
  const order = (data || []).find(o => o.id === filmId);
  if (!order) { api.toast('O pedido DTF não foi encontrado.', 'err'); return; }
  await importOrder(order, addToFilm, { confirmAgain: false });
}

// ───────────── janela ─────────────
function modal({ title, body, footer = '', wide = false }) {
  const back = document.createElement('div');
  back.className = 'z19dtf-back';
  back.innerHTML = '<div class="z19dtf-modal' + (wide ? ' is-wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><header class="z19dtf-head"><h2>' + title + '</h2><button type="button" class="z19dtf-x" data-x aria-label="Fechar">✕</button></header><div class="z19dtf-body">' + body + '</div>' + (footer ? '<footer class="z19dtf-foot">' + footer + '</footer>' : '') + '</div>';
  document.body.appendChild(back);
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = event => { if (event.key === 'Escape' && back === [...document.querySelectorAll('.z19dtf-back')].pop()) close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('mousedown', event => { if (event.target === back) close(); });
  back.querySelector('[data-x]').onclick = close;
  return { el: back.querySelector('.z19dtf-modal'), close };
}
function ask({ title, text, ok = 'Confirmar', danger = false, input = null }) {
  return new Promise(resolve => {
    const m = modal({ title: esc(title), body: '<p class="z19dtf-text">' + text + '</p>' + (input ? '<label class="z19dtf-field"><span>' + esc(input.label) + '</span><input class="z19dtf-input" data-ask maxlength="300" placeholder="' + esc(input.placeholder || '') + '"></label>' : ''),
      footer: '<button type="button" class="btn ghost" data-no>Voltar</button><button type="button" class="btn ' + (danger ? 'danger' : 'primary') + '" data-yes>' + esc(ok) + '</button>' });
    const done = value => { m.close(); resolve(value); };
    m.el.querySelector('[data-no]').onclick = () => done(null);
    m.el.querySelector('[data-yes]').onclick = () => done(input ? (m.el.querySelector('[data-ask]').value.trim() || '') : true);
    m.el.querySelector('[data-x]').onclick = () => done(null);
  });
}

export async function openDtfPanel({ tab = 'orders', addToFilm = null } = {}) {
  if (!api) return;
  if (!isZero19()) { api.toast('O DTF por metro é da conta da ZERO19.', 'err'); return; }
  let scope = 'open', clients = [], orders = [], search = '';
  const m = modal({ title: '🎞 DTF por metro', wide: true, body: '<div class="z19dtf-tabs" role="tablist"><button type="button" data-t="orders">Pedidos <b data-count-orders></b></button><button type="button" data-t="clients">Clientes</button></div><div data-pane></div>' });
  const pane = m.el.querySelector('[data-pane]');
  const setTab = next => { tab = next; m.el.querySelectorAll('[data-t]').forEach(b => b.classList.toggle('is-on', b.dataset.t === tab)); paint(); };
  m.el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => setTab(b.dataset.t));
  const loadOrders = async () => {
    pane.innerHTML = '<p class="z19dtf-loading">Carregando os pedidos…</p>';
    const { data, error } = await api.supabase.rpc('z19p_dtf_staff_orders', { p_scope: scope });
    if (error) { pane.innerHTML = '<p class="z19dtf-error">' + esc(error.message) + '</p>'; return; }
    orders = data || [];
    const paths = orders.flatMap(o => (o.items || []).map(i => i.thumbPath)).filter(Boolean);
    if (paths.length) { try { const { data: signed } = await api.supabase.storage.from(BUCKET).createSignedUrls([...new Set(paths)], 3600); for (const row of signed || []) if (row?.signedUrl) urls.set(row.path, row.signedUrl); } catch { /* sem miniatura: o pedido aparece igual */ } }
    const fresh = orders.filter(o => o.status === 'sent').length;
    const badge = m.el.querySelector('[data-count-orders]'); badge.textContent = fresh ? fresh : ''; badge.hidden = !fresh;
    if (tab === 'orders') paintOrders();
  };
  const loadClients = async () => {
    pane.innerHTML = '<p class="z19dtf-loading">Carregando os clientes…</p>';
    const { data, error } = await api.supabase.rpc('z19p_dtf_staff_clients');
    if (error) { pane.innerHTML = '<p class="z19dtf-error">' + esc(error.message) + '</p>'; return; }
    clients = data || [];
    if (tab === 'clients') paintClients();
  };
  const urls = new Map();
  const paint = () => tab === 'orders' ? loadOrders() : loadClients();

  // ── pedidos ──
  const orderCard = o => {
    const [label, cls] = STATUS[o.status] || STATUS.sent, units = (o.items || []).reduce((s, i) => s + Number(i.quantity || 0), 0);
    const pay = o.payment?.status === 'PAGO' ? '<span class="z19dtf-pill is-ok">Pago</span>' : Number(o.payment?.paid) > 0 ? '<span class="z19dtf-pill is-warn">Pago ' + money(o.payment.paid) + ' de ' + money(o.payment.total) + '</span>' : '<span class="z19dtf-pill is-warn">A receber · PDV "Pagamentos na retirada"</span>';
    const phone = phoneDigits(o.clientWhatsapp);
    return '<article class="z19dtf-order ' + cls + '" data-o="' + o.id + '"><header><div><b class="z19dtf-client">' + esc(o.clientName) + '</b><span class="z19dtf-sub">Pedido #' + esc(o.orderNumber) + ' · enviado ' + dateText(o.sentAt) + (o.printingAt ? ' · no filme ' + dateText(o.printingAt) : '') + '</span></div><span class="z19dtf-status ' + cls + '">' + label + '</span></header>'
      + '<div class="z19dtf-facts"><span><b>Filme ' + o.filmWidthCm + ' cm</b></span><span>📏 ' + num(Number(o.lengthCm) / 100, 2) + ' m</span><span>🖼 ' + (o.items || []).length + ' arte(s) · ' + units + ' impressões</span><span>' + (o.delivery === 'shipping' ? '🚚 Receber (frete a combinar)' : '🏪 Retira na loja') + '</span><b class="z19dtf-total">' + money(o.total) + '</b>' + pay + '</div>'
      + (o.note ? '<p class="z19dtf-note">💬 ' + esc(o.note) + '</p>' : '')
      + '<div class="z19dtf-arts">' + (o.items || []).map(i => '<figure title="' + esc(i.name) + '"><span class="z19dtf-thumb"><img alt="" loading="lazy" src="' + esc(urls.get(i.thumbPath) || '') + '"></span><figcaption><b>' + i.quantity + '×</b> ' + num(i.widthCm) + ' × ' + num(i.heightCm) + ' cm</figcaption></figure>').join('') + '</div>'
      + '<div class="z19dtf-actions">'
      + (['sent', 'printing', 'ready'].includes(o.status) ? '<button type="button" class="btn primary small" data-a="film">＋ Pôr no meu filme</button>' : '')
      + (['sent', 'printing'].includes(o.status) ? '<button type="button" class="btn small z19dtf-green" data-a="ready">✓ Pronto</button>' : '')
      + (['sent', 'printing', 'ready'].includes(o.status) ? '<button type="button" class="btn small z19dtf-gray" data-a="delivered">Entregue</button>' : '')
      + (['printing', 'ready'].includes(o.status) ? '<button type="button" class="btn small ghost" data-a="sent">↶ Voltar para a fila</button>' : '')
      + (phone ? '<a class="btn small z19dtf-wa" target="_blank" rel="noopener" href="https://wa.me/' + phone + '?text=' + encodeURIComponent(greeting() + ', ' + String(o.clientName).split(' ')[0] + '! Aqui é da ZERO19, sobre o seu pedido DTF #' + o.orderNumber + '.') + '">WhatsApp</a>' : '')
      + (['sent', 'printing', 'ready'].includes(o.status) ? '<button type="button" class="btn small z19dtf-rose" data-a="cancelled">Cancelar</button>' : '')
      + '</div></article>';
  };
  const paintOrders = () => {
    pane.innerHTML = '<div class="z19dtf-bar"><div class="z19dtf-seg"><button type="button" data-s="open" class="' + (scope === 'open' ? 'is-on' : '') + '">Em aberto</button><button type="button" data-s="all" class="' + (scope === 'all' ? 'is-on' : '') + '">Todos · 60 dias</button></div><button type="button" class="btn small ghost" data-reload>↻ Atualizar</button></div>'
      + (!addToFilm ? '<p class="z19dtf-hint">"Pôr no meu filme" abre o Montar filme e coloca as artes do pedido lá.</p>' : '')
      + (orders.length ? '<div class="z19dtf-orders">' + orders.map(orderCard).join('') + '</div>' : '<div class="z19dtf-empty">Nenhum pedido DTF ' + (scope === 'open' ? 'em aberto' : 'nos últimos 60 dias') + '.<br><small>Os clientes enviam pela área do cliente: ' + esc(location.origin) + '/dtf</small></div>');
    pane.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { scope = b.dataset.s; loadOrders(); });
    pane.querySelector('[data-reload]').onclick = loadOrders;
    pane.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
      const o = orders.find(x => x.id === b.closest('[data-o]').dataset.o); if (!o) return;
      const action = b.dataset.a;
      if (action === 'film') {
        if (!addToFilm) { try { sessionStorage.setItem(PENDING_KEY, o.id); } catch { /* ok */ } m.close(); api.nav('/filme'); return; }
        if (await importOrder(o, addToFilm)) { m.close(); refreshCount(); }
        return;
      }
      let reason = null;
      if (action === 'cancelled') { reason = await ask({ title: 'Cancelar o pedido #' + o.orderNumber + '?', text: 'O pedido do PDV também é cancelado e o cliente vê "Cancelado".', ok: 'Cancelar pedido', danger: true, input: { label: 'Motivo (o cliente vê)', placeholder: 'Ex.: arte com problema' } }); if (reason === null) return; }
      if (action === 'delivered' && !await ask({ title: 'Marcar o pedido #' + o.orderNumber + ' como entregue?', text: 'O pedido do PDV fica Entregue. Se ainda não foi pago, o valor continua em "Pagamentos na retirada" do PDV para receber.', ok: 'Marcar entregue' })) return;
      b.disabled = true;
      const { error } = await api.supabase.rpc('z19p_dtf_staff_set_status', { p_film_id: o.id, p_status: action, p_reason: reason || null });
      if (error) { b.disabled = false; api.toast(error.message, 'err'); return; }
      api.toast(action === 'ready' ? 'Pedido #' + o.orderNumber + ' pronto. O cliente já vê.' : action === 'delivered' ? 'Pedido #' + o.orderNumber + ' entregue.' : action === 'sent' ? 'Pedido #' + o.orderNumber + ' voltou para a fila.' : 'Pedido #' + o.orderNumber + ' cancelado.', 'ok');
      refreshCount(); loadOrders();
    });
  };

  // ── clientes ──
  const clientRow = c => {
    const access = c.hasAccess ? (c.lastLoginAt ? '<span class="z19dtf-pill is-ok">✓ Último acesso ' + dateText(c.lastLoginAt) + '</span>' : '<span class="z19dtf-pill is-ok">✓ Senha criada</span>') : c.linkPending ? '<span class="z19dtf-pill is-warn">Link enviado · ainda não criou a senha</span>' : '<span class="z19dtf-pill">Sem acesso ainda · gere o link</span>';
    return '<article class="z19dtf-client-row' + (c.active ? '' : ' is-off') + '" data-c="' + c.id + '"><div class="z19dtf-client-main"><b>' + esc(c.name) + (c.active ? '' : ' · desativado') + '</b><span class="z19dtf-sub">' + esc(c.email) + (c.whatsapp ? ' · ' + esc(c.whatsapp) : '') + '</span>'
      + '<span class="z19dtf-sub">58 cm: ' + (Number(c.price58) > 0 ? money(c.price58) + '/m' : '—') + ' · 28 cm: ' + (Number(c.price28) > 0 ? money(c.price28) + '/m' : '—') + ' · ' + esc(MODE_LABEL[c.mode] || c.mode) + (c.mode !== 'meter' ? ' (' + (c.artTable || []).length + ' faixa(s))' : '') + '</span>'
      + '<span class="z19dtf-sub">' + c.arts + ' arte(s) · ' + c.orders + ' pedido(s)</span>' + access + '</div>'
      + '<div class="z19dtf-actions"><button type="button" class="btn small" data-ca="edit">✎ Editar</button><button type="button" class="btn small primary" data-ca="link">🔗 ' + (c.hasAccess ? 'Link para trocar a senha' : 'Link de acesso') + '</button></div></article>';
  };
  const paintClients = () => {
    const t = search.toLowerCase(), list = clients.filter(c => !t || (c.name + ' ' + c.email + ' ' + (c.whatsapp || '')).toLowerCase().includes(t));
    pane.innerHTML = '<div class="z19dtf-bar"><input class="z19dtf-input" data-search type="search" placeholder="Buscar cliente por nome, e-mail ou WhatsApp" value="' + esc(search) + '"><button type="button" class="btn primary" data-new>＋ Novo cliente DTF</button></div>'
      + '<p class="z19dtf-hint">O cliente entra em <b>' + esc(location.origin) + '/dtf</b> com o e-mail e a senha que ele cria pelo link de acesso. Os pedidos dele chegam aqui e no PDV (pagar na retirada = a combinar).</p>'
      + (list.length ? '<div class="z19dtf-clients">' + list.map(clientRow).join('') + '</div>' : '<div class="z19dtf-empty">' + (clients.length ? 'Nenhum cliente com esse nome.' : 'Nenhum cliente DTF cadastrado ainda.<br><small>Toque em "＋ Novo cliente DTF".</small>') + '</div>');
    const s = pane.querySelector('[data-search]');
    s.oninput = () => { search = s.value; const pos = s.selectionStart; paintClients(); const s2 = pane.querySelector('[data-search]'); s2.focus(); try { s2.setSelectionRange(pos, pos); } catch { /* ok */ } };
    pane.querySelector('[data-new]').onclick = () => editClient(null);
    pane.querySelectorAll('[data-ca]').forEach(b => b.onclick = () => { const c = clients.find(x => x.id === b.closest('[data-c]').dataset.c); if (b.dataset.ca === 'edit') editClient(c); else accessLink(c); });
  };
  const editClient = c => {
    const rows = (c?.artTable?.length ? c.artTable : [{ maxWidthCm: 10, maxHeightCm: 10, price: '' }, { maxWidthCm: 30, maxHeightCm: 30, price: '' }]).map(r => ({ ...r }));
    let mode = c?.mode || 'meter';
    const f = modal({ title: c ? 'Editar cliente DTF' : 'Novo cliente DTF', body: '<form class="z19dtf-form" data-form>'
      + '<label class="z19dtf-field"><span>Nome do cliente *</span><input class="z19dtf-input" name="name" maxlength="120" required value="' + esc(c?.name || '') + '"></label>'
      + '<div class="z19dtf-grid2"><label class="z19dtf-field"><span>E-mail (login do cliente) *</span><input class="z19dtf-input" name="email" type="email" required value="' + esc(c?.email || '') + '"' + (c?.hasAccess ? ' readonly title="O cliente já criou a senha com este e-mail"' : '') + '></label>'
      + '<label class="z19dtf-field"><span>WhatsApp com DDD *</span><input class="z19dtf-input" name="whatsapp" inputmode="tel" required placeholder="(19) 99999-9999" value="' + esc(c?.whatsapp || '') + '"></label></div>'
      + '<div class="z19dtf-grid2"><label class="z19dtf-field"><span>Preço do metro · filme 58 cm (58 × 100)</span><input class="z19dtf-input" name="price58" inputmode="decimal" placeholder="0,00" value="' + (Number(c?.price58) > 0 ? num(c.price58, 2) : '') + '"></label>'
      + '<label class="z19dtf-field"><span>Preço do metro · filme 28 cm (28 × 100)</span><input class="z19dtf-input" name="price28" inputmode="decimal" placeholder="0,00" value="' + (Number(c?.price28) > 0 ? num(c.price28, 2) : '') + '"></label></div>'
      + '<p class="z19dtf-small">Largura sem preço não aparece para o cliente.</p>'
      + '<fieldset class="z19dtf-modes"><legend>Como cobrar</legend>' + ['meter', 'art', 'auto'].map(k => '<label class="z19dtf-mode"><input type="radio" name="mode" value="' + k + '"' + (mode === k ? ' checked' : '') + '><span><b>' + (k === 'meter' ? 'Por metro' : k === 'art' ? 'Por arte' : 'Automático') + '</b><small>' + (k === 'meter' ? 'Comprimento arredondado para o metro de cima × preço do metro.' : k === 'art' ? 'Cada arte pelo tamanho, pela tabela abaixo.' : 'Menos de 1 m: por arte (nunca mais que 1 metro). 1 m ou mais: por metro.') + '</small></span></label>').join('') + '</fieldset>'
      + '<div class="z19dtf-table" data-table><div class="z19dtf-table-head"><b>Preço por arte (pelo tamanho)</b><small>A arte cai na menor faixa em que cabe (pode estar deitada).</small></div><div data-rows></div><button type="button" class="btn small ghost" data-addrow>＋ Faixa de tamanho</button></div>'
      + '<label class="z19dtf-field"><span>Observação (só a equipe vê)</span><textarea class="z19dtf-input" name="notes" rows="2" maxlength="1000">' + esc(c?.notes || '') + '</textarea></label>'
      + (c ? '<label class="z19dtf-check"><input type="checkbox" name="active"' + (c.active ? ' checked' : '') + '> Cliente ativo (desmarcado: não consegue entrar nem enviar)</label>' : '')
      + '<p class="z19dtf-error" data-err hidden></p></form>',
      footer: '<button type="button" class="btn ghost" data-cancel>Cancelar</button><button type="button" class="btn primary" data-save>' + (c ? 'Salvar' : 'Cadastrar cliente') + '</button>' });
    const form = f.el.querySelector('[data-form]'), err = f.el.querySelector('[data-err]');
    const paintRows = () => {
      f.el.querySelector('[data-table]').hidden = mode === 'meter';
      f.el.querySelector('[data-rows]').innerHTML = rows.map((r, k) => '<div class="z19dtf-row" data-r="' + k + '"><span>Até</span><input class="z19dtf-input" data-k="maxWidthCm" inputmode="decimal" value="' + (r.maxWidthCm ?? '') + '" aria-label="Largura máxima em cm"><span>×</span><input class="z19dtf-input" data-k="maxHeightCm" inputmode="decimal" value="' + (r.maxHeightCm ?? '') + '" aria-label="Altura máxima em cm"><span>cm =</span><input class="z19dtf-input" data-k="price" inputmode="decimal" placeholder="R$" value="' + (r.price === '' || r.price === undefined ? '' : num(r.price, 2)) + '" aria-label="Preço"><button type="button" class="btn small ghost" data-rm aria-label="Tirar faixa">✕</button></div>').join('');
      f.el.querySelectorAll('[data-r]').forEach(node => {
        const r = rows[Number(node.dataset.r)];
        node.querySelectorAll('[data-k]').forEach(input => input.oninput = () => { r[input.dataset.k] = input.value; });
        node.querySelector('[data-rm]').onclick = () => { rows.splice(Number(node.dataset.r), 1); paintRows(); };
      });
    };
    paintRows();
    form.querySelectorAll('input[name=mode]').forEach(r => r.onchange = () => { mode = r.value; paintRows(); });
    f.el.querySelector('[data-addrow]').onclick = () => { rows.push({ maxWidthCm: '', maxHeightCm: '', price: '' }); paintRows(); };
    f.el.querySelector('[data-cancel]').onclick = f.close;
    f.el.querySelector('[data-save]').onclick = async event => {
      const fd = new FormData(form), fail = text => { err.hidden = false; err.textContent = text; };
      err.hidden = true;
      const table = rows.map(r => ({ maxWidthCm: parseNum(r.maxWidthCm), maxHeightCm: parseNum(r.maxHeightCm), price: parseNum(r.price) })).filter(r => r.maxWidthCm > 0 || r.maxHeightCm > 0 || r.price >= 0);
      if (mode !== 'meter' && table.some(r => !(r.maxWidthCm > 0 && r.maxHeightCm > 0 && r.price >= 0))) return fail('Complete cada faixa: largura, altura e preço (ou tire a faixa).');
      const payload = { id: c?.id || null, name: String(fd.get('name') || '').trim(), email: String(fd.get('email') || '').trim(), whatsapp: String(fd.get('whatsapp') || '').trim(),
        price58: parseNum(fd.get('price58')) || 0, price28: parseNum(fd.get('price28')) || 0, mode, artTable: mode === 'meter' ? (c?.artTable || []) : table, notes: String(fd.get('notes') || ''), active: c ? fd.get('active') === 'on' : true };
      const button = event.currentTarget; button.disabled = true;
      const { data, error } = await api.supabase.rpc('z19p_dtf_save_client', { p: payload });
      button.disabled = false;
      if (error) return fail(error.message);
      f.close(); api.toast(c ? 'Cliente salvo.' : 'Cliente cadastrado.', 'ok');
      await loadClients();
      if (!c) { const fresh = clients.find(x => x.id === data?.id); if (fresh) accessLink(fresh); }
    };
  };
  const accessLink = async c => {
    const { data, error } = await api.supabase.rpc('z19p_dtf_issue_access', { p_client_id: c.id });
    if (error) { api.toast(error.message, 'err'); return; }
    const link = location.origin + '/dtf#convite=' + data.token, phone = phoneDigits(c.whatsapp), first = String(c.name).split(' ')[0];
    const message = greeting() + ', ' + first + '! Aqui é da ZERO19 😊\n' + (data.purpose === 'first' ? 'Este é o seu acesso à área do cliente DTF por metro:' : 'Este é o link para criar uma senha nova na área do cliente DTF por metro:') + '\n' + link
      + '\n\nO seu login é o e-mail ' + c.email + '. ' + (data.purpose === 'first' ? 'Crie sua senha e já pode subir suas artes, montar seus filmes e acompanhar seus pedidos.' : 'Crie a senha nova e entre normalmente.') + '\nO link vale 7 dias e só pode ser usado uma vez.';
    const l = modal({ title: '🔗 ' + (data.purpose === 'first' ? 'Link de acesso' : 'Link para trocar a senha') + ' · ' + esc(c.name), body: '<p class="z19dtf-text">Mande este link para o cliente. Ele cria a senha e entra com o e-mail <b>' + esc(c.email) + '</b>. Vale 7 dias e uma vez só (gerar outro cancela este).</p>'
      + '<input class="z19dtf-input" readonly value="' + esc(link) + '" data-link><p class="z19dtf-small">Depois, o cliente entra sempre por <b>' + esc(location.origin) + '/dtf</b>.</p>',
      footer: '<button type="button" class="btn ghost" data-copy>Copiar link</button><button type="button" class="btn ghost" data-copymsg>Copiar mensagem</button>' + (phone ? '<a class="btn primary" target="_blank" rel="noopener" href="https://wa.me/' + phone + '?text=' + encodeURIComponent(message) + '">Mandar no WhatsApp do cliente</a>' : '<span class="z19dtf-small">Sem WhatsApp no cadastro: copie e mande.</span>') });
    const copy = async (text, label) => { try { await navigator.clipboard.writeText(text); api.toast(label + ' copiado.', 'ok'); } catch { const input = l.el.querySelector('[data-link]'); input.select(); document.execCommand?.('copy'); api.toast(label + ' copiado.', 'ok'); } };
    l.el.querySelector('[data-copy]').onclick = () => copy(link, 'Link');
    l.el.querySelector('[data-copymsg]').onclick = () => copy(message, 'Mensagem');
    loadClients();
  };
  setTab(tab);
}

// Cada arte do pedido vira um item do filme (medida e quantidade do cliente), editável como qualquer arte.
export function dtfFilmItems(order) {
  return (order.items || []).map(item => ({
    localId: globalThis.crypto?.randomUUID?.() || 'dtf-' + Date.now() + '-' + Math.random().toString(36).slice(2),
    type: 'asset', sourceId: 'dtf:' + item.assetId, label: order.clientName + ' • ' + item.name, workspaceId: null, companyName: 'DTF · ' + order.clientName,
    widthCm: Number(item.widthCm), heightCm: Number(item.heightCm), quantity: Math.max(1, Number(item.quantity) || 1), halftone: false,
    allowInternalNesting: true, rotationPolicy: '90', path: item.path, storageBucket: BUCKET, sizeOverride: false,
    dtfFilmId: order.id, dtfOrderNumber: order.orderNumber,
  }));
}
async function importOrder(order, addToFilm, { confirmAgain = true } = {}) {
  if (confirmAgain && order.printingAt && !await ask({ title: 'Colocar de novo?', text: 'As artes do pedido #' + esc(order.orderNumber) + ' já foram colocadas num filme em ' + dateText(order.printingAt) + '. Colocar de novo neste filme?', ok: 'Colocar de novo' })) return false;
  const items = dtfFilmItems(order);
  if (!items.length) { api.toast('Este pedido não tem artes.', 'err'); return false; }
  await addToFilm(items);
  const { error } = await api.supabase.rpc('z19p_dtf_staff_set_status', { p_film_id: order.id, p_status: 'printing' });
  api.toast(items.length + ' arte(s) do pedido #' + order.orderNumber + ' (' + order.clientName + ') no filme' + (error ? ', mas não deu para marcar "Em produção": ' + error.message : '. O cliente vê "Em produção".'), error ? 'err' : 'ok');
  return true;
}
