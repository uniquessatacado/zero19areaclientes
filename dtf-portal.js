// Área do cliente "DTF por metro" da ZERO19 (13/11, dono). Página própria (dtf.html, /dtf), login por e-mail e senha.
// O cliente sobe as artes (cortadas e em 300 DPI), organiza em pastas, monta o filme 58 ou 28 cm (mesmo encaixe do 019),
// vê o comprimento e o preço e envia para a produção: vira pedido no PDV da ZERO19 (pagamento a combinar) e aparece no
// "Pedidos DTF metro" do Montar filme. Ele acompanha o andamento em "Meus pedidos". Cada função tem um balão de ajuda no
// primeiro toque, com "Já entendi" (nunca mais aparece).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { createTips } from './dtf-tips.js?v=2.17.96';
import { filmPrice, formatMoney } from './dtf-pricing.js?v=2.17.96';
import { ACCEPT, analyzeFile, buildPrint, quality, dpiOf, releaseEntry } from './dtf-upload.js?v=2.17.96';
import { nestFilm, drawFilm } from './dtf-nest.js?v=2.17.96';

const SUPABASE_URL = 'https://kedggjyerexnzmipaick.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WoobBV7n0p5Jf-4DLJVzIA_4sUoAvsT';
const BUCKET = 'z19p-private';
const STORE_WHATSAPP = '5519995125752';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'z19p-dtf-client' } });
const root = document.getElementById('dtfApp');

// ───────────── balões de ajuda (um por função) ─────────────
const TIPS = {
  'nav-arts': { title: 'Minhas artes', text: 'Aqui ficam todas as artes que você subiu, organizadas em pastas.', affects: 'Só mostra a lista: nada muda.' },
  'nav-film': { title: 'Montar filme', text: 'Aqui você monta o filme: escolhe a largura (58 ou 28 cm), põe as artes, o tamanho e a quantidade de cada uma.', affects: 'Os filmes em montagem ficam salvos sozinhos até você enviar.' },
  'nav-orders': { title: 'Meus pedidos', text: 'Aqui você acompanha os filmes que enviou para a ZERO19: na fila, em produção, pronto e entregue.', affects: 'Só mostra o andamento.' },
  'menu': { title: 'Sua conta', text: 'Aqui você fala com a ZERO19, revê as dicas ou sai da sua conta.' },
  'menu-whats': { title: 'Falar com a ZERO19', text: 'Abre o WhatsApp da ZERO19 para tirar dúvidas, combinar pagamento ou entrega.' },
  'menu-tips': { title: 'Rever as dicas', text: 'Faz os balões de ajuda aparecerem de novo em cada botão, como no primeiro uso.' },
  'menu-logout': { title: 'Sair', text: 'Sai da sua conta neste aparelho. Para entrar de novo, use seu e-mail e senha.', affects: 'Suas artes, filmes e pedidos continuam salvos.' },
  'intro-arts': { title: 'Bem-vindo à sua área de DTF! 👋', text: 'Comece subindo suas artes em "Subir artes". Depois vá em "Montar filme", ponha as artes e envie para a ZERO19 imprimir.' },
  'upload': { title: 'Subir artes', text: 'Escolha arquivos PNG, JPG ou PDF do celular ou do computador. Pode escolher vários de uma vez (no computador, também dá para arrastar).', affects: 'Cada arte é cortada na sobra transparente e preparada em 300 DPI para impressão. Seu arquivo no aparelho não muda.' },
  'folder-chip': { title: 'Pastas', text: 'Toque numa pasta para ver só as artes dela. "Todas" mostra tudo.', affects: 'Só filtra a lista.' },
  'folder-new': { title: 'Nova pasta', text: 'Crie pastas para organizar suas artes (ex.: Clientes, Camisetas, Bonés).', affects: 'Só organiza: não muda nenhuma arte nem filme.' },
  'folder-rename': { title: 'Renomear pasta', text: 'Troca o nome desta pasta.', affects: 'As artes continuam nela.' },
  'folder-delete': { title: 'Excluir pasta', text: 'Apaga só a pasta.', affects: 'As artes dela NÃO são apagadas: vão para "Sem pasta".' },
  'search': { title: 'Buscar', text: 'Digite parte do nome da arte para achar rápido.', affects: 'Só filtra a lista.' },
  'select': { title: 'Selecionar várias', text: 'Marque várias artes para pôr no filme, mover de pasta ou excluir de uma vez.', affects: 'Aparece uma barra embaixo com o que dá para fazer com as marcadas.' },
  'art-view': { title: 'Ver a arte', text: 'Abre a arte grande, em fundo xadrez (o xadrez é a parte transparente, que não é impressa).' },
  'art-film': { title: 'Pôr no filme', text: 'Coloca esta arte no filme que você está montando (se não tiver nenhum, cria um filme novo).', affects: 'A arte entra no tamanho dela, 1 unidade. No filme você muda o tamanho e a quantidade.' },
  'art-more': { title: 'Mais opções', text: 'Renomear, mudar o tamanho de impressão, mover de pasta ou excluir esta arte.' },
  'art-rename': { title: 'Renomear arte', text: 'Troca o nome que aparece na lista e no pedido.', affects: 'O arquivo da arte não muda.' },
  'art-size': { title: 'Tamanho de impressão', text: 'É o tamanho padrão com que a arte entra no filme. Digite a largura OU a altura: a outra muda junto, sem distorcer.', affects: 'Vale para os próximos filmes. Filmes já montados e pedidos enviados não mudam.' },
  'art-move': { title: 'Mover de pasta', text: 'Leva esta arte para outra pasta.', affects: 'Só organiza.' },
  'art-delete': { title: 'Excluir arte', text: 'Tira a arte da sua lista.', affects: 'Ela sai também dos filmes em montagem. Pedidos já enviados não mudam.' },
  'sel-film': { title: 'Pôr as marcadas no filme', text: 'Coloca todas as artes marcadas no filme que você está montando.', affects: 'Cada arte entra com 1 unidade no tamanho dela.' },
  'sel-move': { title: 'Mover as marcadas', text: 'Leva todas as artes marcadas para uma pasta.' },
  'sel-delete': { title: 'Excluir as marcadas', text: 'Tira todas as artes marcadas da sua lista.', affects: 'Elas saem também dos filmes em montagem. Pedidos enviados não mudam.' },
  'sel-clear': { title: 'Desmarcar', text: 'Desmarca todas as artes.' },
  'up-folder': { title: 'Salvar na pasta', text: 'Escolha em qual pasta as artes novas vão ficar.' },
  'up-size': { title: 'Medida de impressão', text: 'Digite a largura OU a altura em centímetros: a outra muda junto, sem distorcer. Já vem a medida do arquivo.', affects: 'É o tamanho da arte no filme e muda a qualidade (DPI) mostrada ao lado.' },
  'up-name': { title: 'Nome da arte', text: 'O nome que aparece na sua lista e no pedido.' },
  'up-remove': { title: 'Tirar da lista', text: 'Esta arte não vai ser enviada.' },
  'up-save': { title: 'Salvar as artes', text: 'Corta a sobra, prepara em 300 DPI e guarda as artes na sua conta.', affects: 'Depois de salvas, elas aparecem em "Minhas artes" e podem ir para o filme.' },
  'intro-film': { title: 'Montar filme 🎞️', text: 'Crie um filme, escolha a largura, ponha as artes com o tamanho e a quantidade. O sistema encaixa sozinho para gastar o mínimo de filme e mostra o valor.' },
  'film-new': { title: 'Novo filme', text: 'Começa um filme novo, vazio.', affects: 'Os outros filmes em montagem continuam salvos.' },
  'film-open': { title: 'Abrir filme', text: 'Continua montando este filme de onde parou.' },
  'film-delete-draft': { title: 'Excluir filme', text: 'Apaga este filme em montagem.', affects: 'As artes continuam em "Minhas artes".' },
  'film-back': { title: 'Voltar', text: 'Volta para a lista dos seus filmes em montagem.', affects: 'O filme fica salvo como está.' },
  'film-name': { title: 'Nome do filme', text: 'Dê um nome para achar fácil (ex.: Pedido da loja X).' },
  'film-width': { title: 'Largura do filme', text: 'Escolha o filme de 58 cm ou de 28 cm de largura. O preço do metro é diferente em cada um.', affects: 'O encaixe e o valor são refeitos na hora.' },
  'film-rotate': { title: 'Girar para economizar', text: 'Deixa o sistema deitar artes no filme quando isso gasta menos filme.', affects: 'A arte impressa é a mesma; só muda a posição dela no filme.' },
  'film-add': { title: 'Adicionar artes', text: 'Escolha artes da sua lista para pôr neste filme.', affects: 'Cada arte entra com 1 unidade no tamanho dela.' },
  'film-size': { title: 'Tamanho da arte no filme', text: 'Digite a largura OU a altura em centímetros: a outra muda junto, sem distorcer.', affects: 'Muda só neste filme. O encaixe e o valor são refeitos.' },
  'film-qty': { title: 'Quantidade', text: 'Quantas vezes esta arte vai ser impressa neste filme. Use − e + ou digite.', affects: 'O encaixe, o comprimento e o valor são refeitos.' },
  'film-remove': { title: 'Tirar do filme', text: 'Tira esta arte só deste filme.', affects: 'A arte continua em "Minhas artes".' },
  'film-preview': { title: 'Prévia do filme', text: 'Mostra como as artes ficam no filme. A linha vermelha tracejada marca cada metro. O xadrez é a parte sem impressão.' },
  'film-price': { title: 'Valor do filme', text: 'Mostra o comprimento do filme e como ele é cobrado (pelo metro ou por arte, como combinado com a ZERO19).', affects: 'O pagamento é combinado com a ZERO19.' },
  'film-send': { title: 'Enviar para produção', text: 'Manda este filme para a ZERO19 imprimir. Vira um pedido com número, que você acompanha em "Meus pedidos".', affects: 'Depois de enviado, o filme não muda mais (dá para cancelar enquanto estiver na fila).' },
  'film-delete': { title: 'Excluir filme', text: 'Apaga este filme em montagem.', affects: 'As artes continuam em "Minhas artes".' },
  'send-delivery': { title: 'Como você vai receber', text: 'Retirar na loja da ZERO19 (Indaiatuba/SP) ou receber em casa (o frete é combinado com a ZERO19).' },
  'send-note': { title: 'Observação', text: 'Escreva algo que a ZERO19 precisa saber (prazo, cor do filme, etc.).' },
  'send-confirm': { title: 'Confirmar o envio', text: 'Envia o pedido para a ZERO19.', affects: 'O filme vai para "Meus pedidos" e entra na fila de impressão.' },
  'intro-orders': { title: 'Meus pedidos 📦', text: 'Aqui você acompanha cada filme enviado: na fila, em produção, pronto e entregue. A página atualiza sozinha.' },
  'order-details': { title: 'Ver detalhes', text: 'Mostra as artes, os tamanhos, as quantidades e o valor deste pedido.' },
  'order-again': { title: 'Montar de novo', text: 'Cria um filme novo igual a este, para você mudar o que quiser e enviar de novo.', affects: 'O pedido antigo não muda.' },
  'order-cancel': { title: 'Cancelar pedido', text: 'Cancela o pedido enquanto ele ainda está na fila (antes da ZERO19 começar).', affects: 'O pedido fica cancelado e não é impresso.' },
  'order-whats': { title: 'Falar sobre o pedido', text: 'Abre o WhatsApp da ZERO19 já com o número deste pedido.' },
  'refresh': { title: 'Atualizar', text: 'Busca de novo as informações mais novas.' },
};

// ───────────── utilidades ─────────────
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (value, digits = 1) => Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: digits });
const cmText = (w, h) => num(w) + ' × ' + num(h) + ' cm';
const metersText = cm => Number(cm) < 100 ? num(cm, 1) + ' cm' : num(cm / 100, 2) + ' m';
const parseNum = value => { const n = Number(String(value ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const dateText = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
const greeting = () => { const h = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(new Date())); return h < 12 && h >= 5 ? 'Bom dia' : h < 18 && h >= 12 ? 'Boa tarde' : 'Boa noite'; };
const waLink = text => 'https://wa.me/' + STORE_WHATSAPP + '?text=' + encodeURIComponent(text);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const friendly = error => {
  const m = String(error?.message || error || '');
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha errados.';
  if (/Email not confirmed/i.test(m)) return 'Este e-mail ainda não foi confirmado. Use o link de acesso que a ZERO19 mandou.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sem internet ou conexão instável. Confira e tente de novo.';
  if (/Payload too large|exceeded the maximum allowed size|413/i.test(m)) return 'Arquivo maior que o limite de envio. Diminua a arte ou fale com a ZERO19.';
  if (/JWT|session|refresh token/i.test(m)) return 'Sua sessão venceu. Entre de novo.';
  return m.replace(/^Error:\s*/, '') || 'Algo deu errado. Tente de novo.';
};

let toastTimer = null;
function toast(message, kind = 'ok') {
  let node = document.getElementById('dtfToast');
  if (!node) { node = document.createElement('div'); node.id = 'dtfToast'; node.setAttribute('role', 'status'); document.body.appendChild(node); }
  node.className = 'dtf-toast is-' + kind + ' is-on'; node.textContent = message;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('is-on'), kind === 'err' ? 6500 : 3500);
}

// Janela (no celular vira folha que sobe de baixo).
function openModal({ title, body = '', footer = '', size = '', onClose, dismissible = true }) {
  const back = document.createElement('div');
  back.className = 'dtf-modal-back';
  back.innerHTML = '<div class="dtf-modal ' + size + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><header class="dtf-modal-head"><h2>' + esc(title) + '</h2>'
    + (dismissible ? '<button type="button" class="dtf-x" data-close aria-label="Fechar">✕</button>' : '') + '</header><div class="dtf-modal-body">' + body + '</div>'
    + (footer ? '<footer class="dtf-modal-foot">' + footer + '</footer>' : '') + '</div>';
  document.body.appendChild(back); document.body.classList.add('dtf-locked');
  const previous = document.activeElement;
  let closed = false;
  const close = value => { if (closed) return; closed = true; back.remove(); if (!document.querySelector('.dtf-modal-back')) document.body.classList.remove('dtf-locked'); document.removeEventListener('keydown', onKey); onClose?.(value); try { previous?.focus?.({ preventScroll: true }); } catch { /* ok */ } };
  const onKey = event => { if (event.key === 'Escape' && !event.defaultPrevented && dismissible && !document.querySelector('.dtf-tip') && back === [...document.querySelectorAll('.dtf-modal-back')].pop()) close(null); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('mousedown', event => { if (event.target === back && dismissible) close(null); });
  back.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => close(null)));
  requestAnimationFrame(() => back.classList.add('is-open'));
  return { el: back.querySelector('.dtf-modal'), close, back };
}
function confirmDialog({ title, text, ok = 'Confirmar', danger = false, cancel = 'Voltar' }) {
  return new Promise(resolve => {
    const m = openModal({ title, size: 'is-small', body: '<p class="dtf-confirm-text">' + text + '</p>', onClose: resolve,
      footer: '<button type="button" class="dtf-btn" data-no>' + esc(cancel) + '</button><button type="button" class="dtf-btn ' + (danger ? 'dtf-btn-danger' : 'dtf-btn-primary') + '" data-yes>' + esc(ok) + '</button>' });
    m.el.querySelector('[data-no]').onclick = () => m.close(false);
    m.el.querySelector('[data-yes]').onclick = () => m.close(true);
    m.el.querySelector('[data-yes]').focus();
  });
}
function promptDialog({ title, label, value = '', ok = 'Salvar', max = 80, placeholder = '' }) {
  return new Promise(resolve => {
    const m = openModal({ title, size: 'is-small', onClose: resolve,
      body: '<form class="dtf-form" data-form><label class="dtf-field"><span>' + esc(label) + '</span><input class="dtf-input" name="v" maxlength="' + max + '" value="' + esc(value) + '" placeholder="' + esc(placeholder) + '" required autocomplete="off"></label></form>',
      footer: '<button type="button" class="dtf-btn" data-close>Cancelar</button><button type="button" class="dtf-btn dtf-btn-primary" data-yes>' + esc(ok) + '</button>' });
    const input = m.el.querySelector('input'), submit = () => { const v = input.value.trim(); if (!v) { input.focus(); return; } m.close(v); };
    m.el.querySelector('[data-yes]').onclick = submit;
    m.el.querySelector('[data-form]').onsubmit = event => { event.preventDefault(); submit(); };
    setTimeout(() => { input.focus(); input.select(); }, 60);
  });
}
function busyButton(button, text) { if (!button) return () => {}; const html = button.innerHTML, disabled = button.disabled; button.disabled = true; button.innerHTML = '<span class="dtf-spin" aria-hidden="true"></span>' + esc(text); return () => { button.disabled = disabled; button.innerHTML = html; }; }

// ───────────── arquivos privados (links assinados) ─────────────
const urls = new Map();
async function signPaths(paths) {
  const now = Date.now(), missing = [...new Set(paths.filter(Boolean))].filter(p => !(urls.get(p)?.expires > now + 25 * 60000));
  for (let i = 0; i < missing.length; i += 80) {
    const chunk = missing.slice(i, i + 80), { data, error } = await sb.storage.from(BUCKET).createSignedUrls(chunk, 3600);
    if (error) throw error;
    for (const row of data || []) if (row.signedUrl) urls.set(row.path, { url: row.signedUrl, expires: now + 3600000 });
  }
}
const urlOf = path => urls.get(path)?.url || '';
const imageCache = new Map();
function imageFor(path) {
  if (!path) return null;
  let image = imageCache.get(path);
  if (!image) { image = new Image(); image.decoding = 'async'; image.crossOrigin = 'anonymous'; image.src = urlOf(path); imageCache.set(path, image); }
  return image;
}

// ───────────── estado ─────────────
const state = { me: null, tab: 'arts', folders: [], assets: [], films: [], orders: [], folder: 'all', search: '', selected: new Set(), filmId: null, layout: null, layoutKey: '', nesting: false, nestError: '', saving: false, loaded: false };
let tips = null;
const assetById = id => state.assets.find(a => a.id === id);
// Qualidade real da arte numa medida: pela resolução de ORIGEM (ampliar para 300 DPI não cria detalhe).
const realDpi = (a, widthCm = a.width_cm) => Number(a.source_dpi || a.dpi) * Number(a.width_cm) / Number(widthCm);
const currentFilm = () => state.films.find(f => f.id === state.filmId) || null;

// ───────────── entrar ─────────────
function readInvite() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, '')), query = new URLSearchParams(location.search);
  return hash.get('convite') || query.get('convite') || '';
}
async function accessFn(action, token, password) {
  const response = await fetch(SUPABASE_URL + '/functions/v1/z19p-dtf-access', { method: 'POST', headers: { 'content-type': 'application/json', apikey: SUPABASE_KEY }, body: JSON.stringify({ action, token, password }) });
  const data = await response.json().catch(() => ({ ok: false, error: 'O servidor não respondeu. Tente de novo.' }));
  return data;
}
function authShell(inner) {
  root.innerHTML = '<div class="dtf-auth"><div class="dtf-auth-card"><img class="dtf-auth-logo" src="/zero19-logo.png" alt="ZERO19"><div class="dtf-auth-tag">DTF por metro · área do cliente</div>' + inner + '</div>'
    + '<p class="dtf-auth-foot">Dúvidas? <a href="' + waLink(greeting() + '! Preciso de ajuda com a área do cliente DTF por metro.') + '" target="_blank" rel="noopener">Fale com a ZERO19 no WhatsApp</a></p></div>';
}
function passwordToggle(scope) {
  scope.querySelectorAll('[data-eye]').forEach(button => button.addEventListener('click', () => { const input = scope.querySelector('#' + button.dataset.eye); input.type = input.type === 'password' ? 'text' : 'password'; button.textContent = input.type === 'password' ? 'Mostrar' : 'Esconder'; }));
}
function renderLogin({ email = '', message = '', kind = 'err' } = {}) {
  authShell('<h1>Entrar</h1><p class="dtf-auth-sub">Use o e-mail cadastrado na ZERO19 e a sua senha.</p>'
    + (message ? '<div class="dtf-alert is-' + kind + '">' + esc(message) + '</div>' : '')
    + '<form class="dtf-form" id="loginForm" novalidate><label class="dtf-field"><span>E-mail</span><input class="dtf-input" id="loginEmail" type="email" autocomplete="email" inputmode="email" required value="' + esc(email) + '"></label>'
    + '<label class="dtf-field"><span>Senha</span><div class="dtf-pass"><input class="dtf-input" id="loginPass" type="password" autocomplete="current-password" required><button type="button" class="dtf-eye" data-eye="loginPass">Mostrar</button></div></label>'
    + '<button class="dtf-btn dtf-btn-primary dtf-btn-block" type="submit">Entrar</button></form>'
    + '<button type="button" class="dtf-link" id="forgot">Primeiro acesso ou esqueceu a senha?</button><div class="dtf-forgot" id="forgotBox" hidden></div>');
  passwordToggle(root);
  const form = root.querySelector('#loginForm');
  form.onsubmit = async event => {
    event.preventDefault();
    const mail = root.querySelector('#loginEmail').value.trim().toLowerCase(), pass = root.querySelector('#loginPass').value;
    if (!mail || !pass) { toast('Preencha o e-mail e a senha.', 'err'); return; }
    const done = busyButton(form.querySelector('button[type=submit]'), 'Entrando…');
    const { error } = await sb.auth.signInWithPassword({ email: mail, password: pass });
    if (error) { done(); renderLogin({ email: mail, message: friendly(error) }); return; }
    enter();
  };
  root.querySelector('#forgot').onclick = () => {
    const box = root.querySelector('#forgotBox'), mail = root.querySelector('#loginEmail').value.trim();
    box.hidden = false;
    box.innerHTML = '<p><b>O acesso é criado pela ZERO19.</b> Peça seu link de acesso pelo WhatsApp: com ele você cria (ou troca) a sua senha em 1 minuto.</p>'
      + '<a class="dtf-btn dtf-btn-green dtf-btn-block" target="_blank" rel="noopener" href="' + waLink(greeting() + '! Preciso do meu link de acesso do DTF por metro.' + (mail ? ' Meu e-mail é ' + mail + '.' : '')) + '">Pedir link no WhatsApp</a>';
  };
  setTimeout(() => root.querySelector(email ? '#loginPass' : '#loginEmail')?.focus(), 50);
}
async function renderInvite(token) {
  authShell('<div class="dtf-auth-loading"><span class="dtf-spin"></span> Conferindo seu link de acesso…</div>');
  let info;
  try { info = await accessFn('check', token); } catch { info = { ok: false, error: 'Sem internet. Confira e abra o link de novo.' }; }
  const clearUrl = () => history.replaceState(null, '', location.pathname);
  if (!info.ok) { clearUrl(); renderLogin({ message: info.error }); return; }
  if (info.existingAccount) { clearUrl(); renderLogin({ email: info.email, message: 'Você já tem uma conta com este e-mail no sistema. Entre com a senha que você já usa.', kind: 'info' }); return; }
  const first = info.purpose === 'first';
  authShell('<h1>' + (first ? 'Olá, ' + esc(String(info.name).split(' ')[0]) + '! Crie sua senha' : 'Crie uma senha nova') + '</h1>'
    + '<p class="dtf-auth-sub">' + (first ? 'Com ela você entra na sua área de DTF por metro para subir artes, montar filmes e acompanhar pedidos.' : 'Depois é só entrar com o e-mail e a senha nova.') + '</p>'
    + '<form class="dtf-form" id="inviteForm" novalidate><label class="dtf-field"><span>Seu e-mail (é o seu login)</span><input class="dtf-input" value="' + esc(info.email) + '" readonly></label>'
    + '<label class="dtf-field"><span>Senha (mínimo 6 letras ou números)</span><div class="dtf-pass"><input class="dtf-input" id="newPass" type="password" autocomplete="new-password" minlength="6" required><button type="button" class="dtf-eye" data-eye="newPass">Mostrar</button></div></label>'
    + '<label class="dtf-field"><span>Repita a senha</span><div class="dtf-pass"><input class="dtf-input" id="newPass2" type="password" autocomplete="new-password" minlength="6" required><button type="button" class="dtf-eye" data-eye="newPass2">Mostrar</button></div></label>'
    + '<div class="dtf-alert is-err" id="inviteErr" hidden></div><button class="dtf-btn dtf-btn-primary dtf-btn-block" type="submit">' + (first ? 'Criar senha e entrar' : 'Salvar senha e entrar') + '</button></form>');
  passwordToggle(root);
  const form = root.querySelector('#inviteForm'), err = root.querySelector('#inviteErr');
  const fail = text => { err.hidden = false; err.textContent = text; };
  form.onsubmit = async event => {
    event.preventDefault();
    const p1 = root.querySelector('#newPass').value, p2 = root.querySelector('#newPass2').value;
    if (p1.length < 6) return fail('A senha precisa ter pelo menos 6 letras ou números.');
    if (p1 !== p2) return fail('As duas senhas não são iguais.');
    const done = busyButton(form.querySelector('button[type=submit]'), 'Salvando…');
    let result;
    try { result = await accessFn('set', token, p1); } catch { result = { ok: false, error: 'Sem internet. Tente de novo.' }; }
    if (!result.ok) { done(); if (result.code === 'existing_account') { clearUrl(); renderLogin({ email: info.email, message: result.error, kind: 'info' }); return; } return fail(result.error); }
    clearUrl();
    const { error } = await sb.auth.signInWithPassword({ email: info.email, password: p1 });
    if (error) { renderLogin({ email: info.email, message: 'Senha criada! Entre com ela agora.', kind: 'ok' }); return; }
    enter();
  };
  setTimeout(() => root.querySelector('#newPass')?.focus(), 50);
}
function renderBlocked(kind) {
  const text = kind === 'staff' ? 'Este login é da equipe do 019. A área do cliente DTF é só para clientes: entre no 019 normal.'
    : kind === 'inactive' ? 'Seu acesso ao DTF por metro está desativado. Fale com a ZERO19.'
    : 'Este e-mail não tem acesso ao DTF por metro. Peça para a ZERO19 cadastrar você.';
  authShell('<h1>Sem acesso</h1><div class="dtf-alert is-info">' + esc(text) + '</div><button type="button" class="dtf-btn dtf-btn-block" id="out">Sair e entrar com outro e-mail</button>');
  root.querySelector('#out').onclick = async () => { await sb.auth.signOut(); location.reload(); };
}
async function enter() {
  authShell('<div class="dtf-auth-loading"><span class="dtf-spin"></span> Abrindo sua área…</div>');
  const { data, error } = await sb.rpc('z19p_dtf_me');
  if (error) { if (/JWT|session|token/i.test(error.message)) await sb.auth.signOut(); renderLogin({ message: friendly(error) }); return; }
  if (!data || data.error) { renderBlocked(data?.error); return; }
  state.me = data;
  if (!tips) tips = createTips({ catalog: TIPS, seen: data.seenTips || [], storageKey: 'dtf-tips-' + data.id, save: key => { sb.rpc('z19p_dtf_tip_seen', { p_key: key }).then(() => {}, () => {}); } });
  const saved = (() => { try { return sessionStorage.getItem('dtf-tab'); } catch { return null; } })();
  state.tab = ['arts', 'film', 'orders'].includes(saved) ? saved : 'arts';
  renderApp();
  await refreshAll();
}

// ───────────── dados ─────────────
async function refreshAll({ quiet = false } = {}) {
  try {
    const [folders, assets, films] = await Promise.all([
      sb.from('z19p_dtf_folders').select('id,name,sort_order,created_at').order('sort_order').order('name'),
      sb.from('z19p_dtf_assets').select('id,folder_id,name,print_path,thumb_path,original_path,width_px,height_px,dpi,source_dpi,width_cm,height_cm,has_alpha,upscaled,created_at').is('deleted_at', null).order('created_at', { ascending: false }).limit(2000),
      sb.from('z19p_dtf_films').select('id,name,film_width_cm,allow_rotate,items,status,updated_at,created_at').eq('status', 'draft').order('updated_at', { ascending: false }),
    ]);
    for (const r of [folders, assets, films]) if (r.error) throw r.error;
    state.folders = folders.data || []; state.assets = assets.data || []; state.films = films.data || [];
    if (state.filmId && !currentFilm()) state.filmId = null;
    await signPaths(state.assets.map(a => a.thumb_path));
    state.loaded = true;
    await refreshOrders({ render: false });
    renderTab();
  } catch (error) { if (!quiet) toast(friendly(error), 'err'); }
}
async function refreshOrders({ render = true } = {}) {
  const { data, error } = await sb.rpc('z19p_dtf_my_orders');
  if (error) { if (render) toast(friendly(error), 'err'); return; }
  state.orders = data || [];
  try { await signPaths(state.orders.flatMap(o => (o.items || []).map(i => i.thumbPath))); } catch { /* miniaturas depois */ }
  updateBadges();
  if (render && state.tab === 'orders') renderTab();
}

// ───────────── casca ─────────────
function renderApp() {
  const first = esc(String(state.me.name).split(' ')[0]);
  root.innerHTML = '<div class="dtf-app"><header class="dtf-top"><div class="dtf-wrap dtf-top-in"><img class="dtf-logo" src="/zero19-logo.png" alt="ZERO19"><span class="dtf-top-tag">DTF por metro</span>'
    + '<button type="button" class="dtf-user" id="userBtn" data-tip="menu" aria-haspopup="menu"><span class="dtf-avatar">' + first.charAt(0).toUpperCase() + '</span><span class="dtf-user-name">' + first + '</span><span aria-hidden="true">▾</span></button></div></header>'
    + '<nav class="dtf-nav" aria-label="Seções"><div class="dtf-wrap dtf-nav-in">'
    + '<button type="button" data-tab="arts" data-tip="nav-arts"><span class="dtf-nav-ico" aria-hidden="true">🖼️</span><span>Minhas artes</span></button>'
    + '<button type="button" data-tab="film" data-tip="nav-film"><span class="dtf-nav-ico" aria-hidden="true">🎞️</span><span>Montar filme</span><b class="dtf-badge" id="badgeFilm" hidden></b></button>'
    + '<button type="button" data-tab="orders" data-tip="nav-orders"><span class="dtf-nav-ico" aria-hidden="true">📦</span><span>Meus pedidos</span><b class="dtf-badge" id="badgeOrders" hidden></b></button>'
    + '</div></nav><main class="dtf-wrap dtf-main" id="dtfMain"></main></div>';
  root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  root.querySelector('#userBtn').addEventListener('click', openMenu);
  renderTab();
}
function setTab(tab) {
  state.tab = tab; state.selected.clear();
  try { sessionStorage.setItem('dtf-tab', tab); } catch { /* ok */ }
  renderTab(); window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  if (tab === 'orders') refreshOrders();
}
function updateBadges() {
  const open = state.orders.filter(o => ['sent', 'printing', 'ready'].includes(o.status)).length, drafts = state.films.length;
  const bo = document.getElementById('badgeOrders'), bf = document.getElementById('badgeFilm');
  if (bo) { bo.hidden = !open; bo.textContent = open; }
  if (bf) { bf.hidden = !drafts; bf.textContent = drafts; }
}
function renderTab() {
  const main = document.getElementById('dtfMain');
  if (!main) return;
  root.querySelectorAll('[data-tab]').forEach(b => { b.classList.toggle('is-on', b.dataset.tab === state.tab); b.setAttribute('aria-current', b.dataset.tab === state.tab ? 'page' : 'false'); });
  updateBadges();
  if (!state.loaded) { main.innerHTML = '<div class="dtf-loading"><span class="dtf-spin"></span> Carregando…</div>'; return; }
  if (state.tab === 'arts') renderArts(main);
  else if (state.tab === 'film') renderFilmTab(main);
  else renderOrders(main);
}
function openMenu() {
  const m = openModal({ title: state.me.name, size: 'is-small', body: '<p class="dtf-muted">' + esc(state.me.email) + '</p><div class="dtf-menu">'
    + '<a class="dtf-btn dtf-btn-green dtf-btn-block" data-tip="menu-whats" target="_blank" rel="noopener" href="' + waLink(greeting() + '! Aqui é ' + state.me.name + ', cliente do DTF por metro.') + '">💬 Falar com a ZERO19</a>'
    + '<button type="button" class="dtf-btn dtf-btn-block dtf-btn-lilac" data-tip="menu-tips" id="mTips">💡 Rever as dicas</button>'
    + '<button type="button" class="dtf-btn dtf-btn-block dtf-btn-rose" data-tip="menu-logout" id="mOut">Sair da conta</button></div>' });
  m.el.querySelector('#mTips').onclick = () => { tips.reset(); sb.rpc('z19p_dtf_tip_seen', { p_key: '*reset*' }).then(() => {}, () => {}); m.close(); toast('Pronto! As dicas vão aparecer de novo em cada botão.'); };
  m.el.querySelector('#mOut').onclick = async () => { await sb.auth.signOut(); try { sessionStorage.removeItem('dtf-tab'); } catch { /* ok */ } location.reload(); };
}

// ───────────── Minhas artes ─────────────
function visibleAssets() {
  const term = state.search.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return state.assets.filter(a => (state.folder === 'all' || (state.folder === 'none' ? !a.folder_id : a.folder_id === state.folder))
    && (!term || a.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(term)));
}
function artCard(a) {
  const q = quality(realDpi(a)), sel = state.selected.has(a.id);
  return '<article class="dtf-art' + (sel ? ' is-sel' : '') + '" data-id="' + a.id + '">'
    + '<label class="dtf-check" data-tip="select" title="Selecionar"><input type="checkbox" data-act="sel"' + (sel ? ' checked' : '') + ' aria-label="Selecionar ' + esc(a.name) + '"><span></span></label>'
    + '<button type="button" class="dtf-art-img dtf-checker" data-act="view" data-tip="art-view" aria-label="Ver ' + esc(a.name) + '"><img loading="lazy" alt="" src="' + esc(urlOf(a.thumb_path)) + '"></button>'
    + '<div class="dtf-art-body"><b class="dtf-art-name" title="' + esc(a.name) + '">' + esc(a.name) + '</b><span class="dtf-art-meta">' + cmText(a.width_cm, a.height_cm) + '</span><span class="dtf-q is-' + q.level + '">' + q.label + '</span></div>'
    + '<div class="dtf-art-actions"><button type="button" class="dtf-btn dtf-btn-sm dtf-btn-orange" data-act="film" data-tip="art-film">＋ Filme</button><button type="button" class="dtf-btn dtf-btn-sm dtf-btn-icon" data-act="more" data-tip="art-more" aria-label="Mais opções">⋯</button></div></article>';
}
function renderArts(main) {
  const counts = new Map(); let none = 0;
  for (const a of state.assets) { if (a.folder_id) counts.set(a.folder_id, (counts.get(a.folder_id) || 0) + 1); else none++; }
  const folder = state.folders.find(f => f.id === state.folder), list = visibleAssets();
  main.innerHTML = '<section class="dtf-head"><div><h1>Minhas artes</h1><p>Suba suas artes uma vez e use em quantos filmes quiser.</p></div><button type="button" class="dtf-btn dtf-btn-primary dtf-btn-lg" id="upBtn" data-tip="upload">⇧ Subir artes</button></section>'
    + '<div class="dtf-chips" role="tablist" aria-label="Pastas">'
    + '<button type="button" class="dtf-chip' + (state.folder === 'all' ? ' is-on' : '') + '" data-folder="all" data-tip="folder-chip">Todas <b>' + state.assets.length + '</b></button>'
    + (none && state.folders.length ? '<button type="button" class="dtf-chip' + (state.folder === 'none' ? ' is-on' : '') + '" data-folder="none" data-tip="folder-chip">Sem pasta <b>' + none + '</b></button>' : '')
    + state.folders.map(f => '<button type="button" class="dtf-chip' + (state.folder === f.id ? ' is-on' : '') + '" data-folder="' + f.id + '" data-tip="folder-chip">📁 ' + esc(f.name) + ' <b>' + (counts.get(f.id) || 0) + '</b></button>').join('')
    + '<button type="button" class="dtf-chip dtf-chip-add" id="newFolder" data-tip="folder-new">＋ Nova pasta</button></div>'
    + (folder ? '<div class="dtf-folderbar"><span>📁 <b>' + esc(folder.name) + '</b></span><button type="button" class="dtf-btn dtf-btn-sm dtf-btn-blue" id="renFolder" data-tip="folder-rename">✎ Renomear</button><button type="button" class="dtf-btn dtf-btn-sm dtf-btn-rose" id="delFolder" data-tip="folder-delete">🗑 Excluir pasta</button></div>' : '')
    + (state.assets.length ? '<div class="dtf-searchrow"><input class="dtf-input dtf-search" id="artSearch" type="search" placeholder="Buscar arte pelo nome" value="' + esc(state.search) + '" data-tip="search" autocomplete="off"></div>' : '')
    + '<div class="dtf-drop" id="dropZone">' + (list.length ? '<div class="dtf-grid">' + list.map(artCard).join('') + '</div>'
      : state.assets.length ? '<div class="dtf-empty"><div class="dtf-empty-ico">🔎</div><b>Nenhuma arte aqui.</b><p>' + (state.search ? 'Nada com esse nome.' : 'Esta pasta está vazia. Suba artes com ela aberta ou mova artes para cá.') + '</p></div>'
      : '<div class="dtf-empty"><div class="dtf-empty-ico">🖼️</div><b>Você ainda não subiu nenhuma arte.</b><p>Toque em <b>Subir artes</b> e escolha PNG, JPG ou PDF.<br>No computador você também pode arrastar os arquivos para cá.</p><button type="button" class="dtf-btn dtf-btn-primary" id="upBtn2">⇧ Subir minha primeira arte</button></div>')
    + '<div class="dtf-drop-hint" aria-hidden="true">Solte os arquivos para subir</div></div>'
    + selectionBar();
  main.querySelector('#upBtn').onclick = () => pickFiles();
  main.querySelector('#upBtn2')?.addEventListener('click', () => pickFiles());
  main.querySelectorAll('[data-folder]').forEach(b => b.addEventListener('click', () => { state.folder = b.dataset.folder; state.selected.clear(); renderTab(); }));
  main.querySelector('#newFolder').onclick = createFolder;
  main.querySelector('#renFolder')?.addEventListener('click', () => renameFolder(folder));
  main.querySelector('#delFolder')?.addEventListener('click', () => deleteFolder(folder));
  const search = main.querySelector('#artSearch');
  if (search) search.addEventListener('input', debounce(() => { state.search = search.value; const grid = main.querySelector('#dropZone'); const keep = search.selectionStart; renderArts(main); const s2 = main.querySelector('#artSearch'); s2.focus(); try { s2.setSelectionRange(keep, keep); } catch { /* ok */ } void grid; }, 220));
  main.querySelector('.dtf-grid')?.addEventListener('click', onArtClick);
  main.querySelector('.dtf-grid')?.addEventListener('change', event => { if (event.target.matches('[data-act=sel]')) { const id = event.target.closest('[data-id]').dataset.id; event.target.checked ? state.selected.add(id) : state.selected.delete(id); event.target.closest('.dtf-art').classList.toggle('is-sel', event.target.checked); refreshSelectionBar(); } });
  bindSelectionBar(main);
  bindDrop(main.querySelector('#dropZone'));
  tips?.intro(main.querySelector('.dtf-head h1'), 'intro-arts');
}
function selectionBar() {
  const n = state.selected.size;
  return '<div class="dtf-selbar' + (n ? ' is-on' : '') + '" id="selBar" aria-live="polite"><span><b id="selCount">' + n + '</b> marcada' + (n === 1 ? '' : 's') + '</span>'
    + '<button type="button" class="dtf-btn dtf-btn-sm dtf-btn-orange" id="selFilm" data-tip="sel-film">＋ Pôr no filme</button>'
    + '<button type="button" class="dtf-btn dtf-btn-sm dtf-btn-blue" id="selMove" data-tip="sel-move">📁 Mover</button>'
    + '<button type="button" class="dtf-btn dtf-btn-sm dtf-btn-rose" id="selDel" data-tip="sel-delete">🗑 Excluir</button>'
    + '<button type="button" class="dtf-btn dtf-btn-sm dtf-btn-icon" id="selClear" data-tip="sel-clear" aria-label="Desmarcar todas">✕</button></div>';
}
function refreshSelectionBar() {
  const bar = document.getElementById('selBar'); if (!bar) return;
  const n = state.selected.size; bar.classList.toggle('is-on', n > 0);
  bar.querySelector('span').innerHTML = '<b id="selCount">' + n + '</b> marcada' + (n === 1 ? '' : 's');
}
function bindSelectionBar(main) {
  main.querySelector('#selFilm').onclick = () => addToFilm([...state.selected]);
  main.querySelector('#selMove').onclick = () => moveAssets([...state.selected]);
  main.querySelector('#selDel').onclick = () => deleteAssets([...state.selected]);
  main.querySelector('#selClear').onclick = () => { state.selected.clear(); renderTab(); };
}
function onArtClick(event) {
  const button = event.target.closest('[data-act]'); if (!button || button.dataset.act === 'sel') return;
  const asset = assetById(button.closest('[data-id]').dataset.id); if (!asset) return;
  if (button.dataset.act === 'view') viewAsset(asset);
  else if (button.dataset.act === 'film') addToFilm([asset.id]);
  else if (button.dataset.act === 'more') assetMenu(asset);
}
function bindDrop(zone) {
  if (!zone) return;
  let depth = 0;
  zone.addEventListener('dragenter', event => { if ([...(event.dataTransfer?.types || [])].includes('Files')) { depth++; zone.classList.add('is-drag'); event.preventDefault(); } });
  zone.addEventListener('dragover', event => { if ([...(event.dataTransfer?.types || [])].includes('Files')) event.preventDefault(); });
  zone.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) zone.classList.remove('is-drag'); });
  zone.addEventListener('drop', event => { event.preventDefault(); depth = 0; zone.classList.remove('is-drag'); const files = [...(event.dataTransfer?.files || [])]; if (files.length) openUpload(files); });
}
async function createFolder() {
  const name = await promptDialog({ title: 'Nova pasta', label: 'Nome da pasta', placeholder: 'Ex.: Camisetas', max: 60, ok: 'Criar pasta' });
  if (!name) return;
  const { data, error } = await sb.from('z19p_dtf_folders').insert({ client_id: state.me.id, name, sort_order: state.folders.length }).select('id,name,sort_order,created_at').single();
  if (error) return toast(friendly(error), 'err');
  state.folders.push(data); state.folder = data.id; renderTab(); toast('Pasta "' + name + '" criada.');
}
async function renameFolder(folder) {
  const name = await promptDialog({ title: 'Renomear pasta', label: 'Novo nome', value: folder.name, max: 60 });
  if (!name || name === folder.name) return;
  const { error } = await sb.from('z19p_dtf_folders').update({ name, updated_at: new Date().toISOString() }).eq('id', folder.id);
  if (error) return toast(friendly(error), 'err');
  folder.name = name; renderTab(); toast('Pasta renomeada.');
}
async function deleteFolder(folder) {
  const n = state.assets.filter(a => a.folder_id === folder.id).length;
  if (!await confirmDialog({ title: 'Excluir a pasta "' + esc(folder.name) + '"?', text: n ? 'As ' + n + ' artes dela <b>não</b> são apagadas: vão para "Sem pasta".' : 'A pasta está vazia.', ok: 'Excluir pasta', danger: true })) return;
  const { error } = await sb.from('z19p_dtf_folders').delete().eq('id', folder.id);
  if (error) return toast(friendly(error), 'err');
  state.folders = state.folders.filter(f => f.id !== folder.id);
  for (const a of state.assets) if (a.folder_id === folder.id) a.folder_id = null;
  state.folder = 'all'; renderTab(); toast('Pasta excluída. As artes estão em "Sem pasta".');
}
function folderOptions(selected) {
  return '<option value="">Sem pasta</option>' + state.folders.map(f => '<option value="' + f.id + '"' + (f.id === selected ? ' selected' : '') + '>' + esc(f.name) + '</option>').join('');
}
async function viewAsset(asset) {
  const m = openModal({ title: asset.name, size: 'is-wide', body: '<div class="dtf-view dtf-checker"><img alt="" src="' + esc(urlOf(asset.thumb_path)) + '" id="viewImg"></div>'
    + '<div class="dtf-view-meta"><span>📐 ' + cmText(asset.width_cm, asset.height_cm) + '</span><span class="dtf-q is-' + quality(realDpi(asset)).level + '">' + quality(realDpi(asset)).label + '</span>' + (asset.upscaled ? '<span class="dtf-chip-mini">ampliada para 300 DPI</span>' : '') + '<span>' + asset.width_px + ' × ' + asset.height_px + ' px</span>' + (asset.has_alpha ? '' : '<span class="dtf-warn-chip">Sem fundo transparente</span>') + '</div>'
    + '<p class="dtf-muted dtf-small">O xadrez é a parte transparente: não é impressa.</p>',
    footer: '<button type="button" class="dtf-btn" data-close>Fechar</button><button type="button" class="dtf-btn dtf-btn-orange" id="vFilm" data-tip="art-film">＋ Pôr no filme</button>' });
  m.el.querySelector('#vFilm').onclick = () => { m.close(); addToFilm([asset.id]); };
  // Imagem maior (reduzida pelo servidor); se não der, fica a miniatura.
  try {
    const { data } = await sb.storage.from(BUCKET).createSignedUrl(asset.print_path, 900, { transform: { width: 1400, height: 1400, resize: 'contain' } });
    if (data?.signedUrl) { const big = new Image(); big.onload = () => { const img = m.el.querySelector('#viewImg'); if (img) img.src = big.src; }; big.src = data.signedUrl; }
  } catch { /* fica a miniatura */ }
}
function assetMenu(asset) {
  const m = openModal({ title: asset.name, size: 'is-small', body: '<div class="dtf-menu">'
    + '<button type="button" class="dtf-btn dtf-btn-block dtf-btn-orange" data-a="film" data-tip="art-film">＋ Pôr no filme</button>'
    + '<button type="button" class="dtf-btn dtf-btn-block dtf-btn-blue" data-a="rename" data-tip="art-rename">✎ Renomear</button>'
    + '<button type="button" class="dtf-btn dtf-btn-block dtf-btn-lilac" data-a="size" data-tip="art-size">📐 Tamanho de impressão · ' + cmText(asset.width_cm, asset.height_cm) + '</button>'
    + '<button type="button" class="dtf-btn dtf-btn-block dtf-btn-amber" data-a="move" data-tip="art-move">📁 Mover de pasta</button>'
    + '<button type="button" class="dtf-btn dtf-btn-block dtf-btn-rose" data-a="delete" data-tip="art-delete">🗑 Excluir arte</button></div>' });
  m.el.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', async () => {
    m.close();
    if (b.dataset.a === 'film') addToFilm([asset.id]);
    else if (b.dataset.a === 'rename') {
      const name = await promptDialog({ title: 'Renomear arte', label: 'Nome da arte', value: asset.name, max: 120 });
      if (!name || name === asset.name) return;
      const { error } = await sb.from('z19p_dtf_assets').update({ name, updated_at: new Date().toISOString() }).eq('id', asset.id);
      if (error) return toast(friendly(error), 'err');
      asset.name = name; renderTab(); toast('Arte renomeada.');
    } else if (b.dataset.a === 'size') resizeAsset(asset);
    else if (b.dataset.a === 'move') moveAssets([asset.id]);
    else deleteAssets([asset.id]);
  }));
}
function sizeFieldsHTML(w, h, tipKey) {
  return '<div class="dtf-size" data-tip-wrap><label class="dtf-mini"><span>Largura</span><input class="dtf-input" data-f="w" inputmode="decimal" value="' + num(w, 2) + '" data-tip="' + tipKey + '" aria-label="Largura em cm"><em>cm</em></label>'
    + '<span class="dtf-times" aria-hidden="true">×</span><label class="dtf-mini"><span>Altura</span><input class="dtf-input" data-f="h" inputmode="decimal" value="' + num(h, 2) + '" data-tip="' + tipKey + '" aria-label="Altura em cm"><em>cm</em></label></div>';
}
// Liga os dois campos (largura ↔ altura) pela proporção da arte. onChange(w, h) com números válidos.
function bindSize(scope, ratio, onChange, { max = 1000 } = {}) {
  const wi = scope.querySelector('[data-f=w]'), hi = scope.querySelector('[data-f=h]');
  const apply = (from) => {
    const src = from === 'w' ? wi : hi, v = parseNum(src.value);
    if (!(v > 0) || v > max) { src.classList.add('is-bad'); return; }
    src.classList.remove('is-bad');
    const w = from === 'w' ? v : Math.round(v / ratio * 100) / 100, h = from === 'w' ? Math.round(v * ratio * 100) / 100 : v;
    (from === 'w' ? hi : wi).value = num(from === 'w' ? h : w, 2); (from === 'w' ? hi : wi).classList.remove('is-bad');
    onChange(w, h);
  };
  wi.addEventListener('input', () => apply('w')); hi.addEventListener('input', () => apply('h'));
  for (const input of [wi, hi]) input.addEventListener('blur', () => { const v = parseNum(input.value); if (v > 0) input.value = num(v, 2); });
}
function resizeAsset(asset) {
  let w = Number(asset.width_cm), h = Number(asset.height_cm);
  const ratio = asset.height_px / asset.width_px;
  const m = openModal({ title: 'Tamanho de impressão', size: 'is-small', body: '<p class="dtf-muted">' + esc(asset.name) + '</p>' + sizeFieldsHTML(w, h, 'art-size')
    + '<p class="dtf-q-line">Qualidade nesta medida: <span class="dtf-q" id="rsQ"></span></p><p class="dtf-muted dtf-small">Vale para os próximos filmes. Filmes já montados não mudam.</p>',
    footer: '<button type="button" class="dtf-btn" data-close>Cancelar</button><button type="button" class="dtf-btn dtf-btn-primary" id="rsSave">Salvar tamanho</button>' });
  const q = m.el.querySelector('#rsQ'), paint = () => { const k = quality(realDpi(asset, w)); q.className = 'dtf-q is-' + k.level; q.textContent = k.label; };
  paint();
  bindSize(m.el, ratio, (nw, nh) => { w = nw; h = nh; paint(); });
  m.el.querySelector('#rsSave').onclick = async () => {
    const { error } = await sb.from('z19p_dtf_assets').update({ width_cm: w, height_cm: h, updated_at: new Date().toISOString() }).eq('id', asset.id);
    if (error) return toast(friendly(error), 'err');
    asset.width_cm = w; asset.height_cm = h; m.close(); renderTab(); toast('Tamanho salvo: ' + cmText(w, h) + '.');
  };
}
async function moveAssets(ids) {
  if (!ids.length) return;
  if (!state.folders.length) { toast('Crie uma pasta primeiro em "＋ Nova pasta".', 'info'); return; }
  const m = openModal({ title: ids.length > 1 ? 'Mover ' + ids.length + ' artes' : 'Mover arte', size: 'is-small',
    body: '<label class="dtf-field"><span>Para a pasta</span><select class="dtf-input" id="mvSel">' + folderOptions(state.folder !== 'all' && state.folder !== 'none' ? state.folder : '') + '</select></label>',
    footer: '<button type="button" class="dtf-btn" data-close>Cancelar</button><button type="button" class="dtf-btn dtf-btn-primary" id="mvOk">Mover</button>' });
  m.el.querySelector('#mvOk').onclick = async () => {
    const folder = m.el.querySelector('#mvSel').value || null;
    const { error } = await sb.from('z19p_dtf_assets').update({ folder_id: folder, updated_at: new Date().toISOString() }).in('id', ids);
    if (error) return toast(friendly(error), 'err');
    for (const a of state.assets) if (ids.includes(a.id)) a.folder_id = folder;
    m.close(); state.selected.clear(); renderTab(); toast(ids.length > 1 ? ids.length + ' artes movidas.' : 'Arte movida.');
  };
}
async function deleteAssets(ids) {
  if (!ids.length) return;
  const inDrafts = state.films.filter(f => (f.items || []).some(i => ids.includes(i.assetId)));
  if (!await confirmDialog({ title: ids.length > 1 ? 'Excluir ' + ids.length + ' artes?' : 'Excluir esta arte?',
    text: 'Elas somem da sua lista.' + (inDrafts.length ? ' Também saem de <b>' + inDrafts.length + ' filme(s) em montagem</b>.' : '') + ' Pedidos já enviados não mudam.', ok: 'Excluir', danger: true })) return;
  const now = new Date().toISOString();
  const { error } = await sb.from('z19p_dtf_assets').update({ deleted_at: now, updated_at: now }).in('id', ids);
  if (error) return toast(friendly(error), 'err');
  for (const film of inDrafts) { film.items = film.items.filter(i => !ids.includes(i.assetId)); await saveFilmNow(film); }
  // Apaga os arquivos que nenhum pedido usa (os de pedidos enviados ficam guardados para a ZERO19 imprimir).
  const used = new Set(state.orders.flatMap(o => (o.items || []).map(i => i.assetId)));
  const gone = state.assets.filter(a => ids.includes(a.id));
  const paths = gone.filter(a => !used.has(a.id)).flatMap(a => [a.print_path, a.thumb_path, a.original_path]).filter(p => p && !state.assets.some(o => !ids.includes(o.id) && o.original_path === p));
  if (paths.length) sb.storage.from(BUCKET).remove(paths).then(() => {}, () => {});
  state.assets = state.assets.filter(a => !ids.includes(a.id)); ids.forEach(id => state.selected.delete(id));
  renderTab(); toast(ids.length > 1 ? ids.length + ' artes excluídas.' : 'Arte excluída.');
}

// ───────────── subir artes ─────────────
function pickFiles() {
  const input = document.createElement('input');
  input.type = 'file'; input.multiple = true; input.accept = ACCEPT; input.style.display = 'none';
  input.addEventListener('change', () => { const files = [...(input.files || [])]; input.remove(); if (files.length) openUpload(files); });
  input.addEventListener('cancel', () => input.remove());
  document.body.appendChild(input); input.click();
}
function openUpload(files) {
  const entries = [];   // { status: 'reading'|'ready'|'error'|'saving'|'saved', ... }
  const folderDefault = state.folder !== 'all' && state.folder !== 'none' ? state.folder : '';
  let saving = false;
  const m = openModal({ title: 'Subir artes', size: 'is-wide', dismissible: true, onClose: () => entries.forEach(releaseEntry),
    body: '<div class="dtf-up-top"><label class="dtf-field dtf-field-inline"><span>Salvar na pasta</span><select class="dtf-input" id="upFolder" data-tip="up-folder">' + folderOptions(folderDefault) + '</select></label>'
      + '<button type="button" class="dtf-btn dtf-btn-sm dtf-btn-blue" id="upMore" data-tip="upload">＋ Mais arquivos</button></div>'
      + '<p class="dtf-muted dtf-small">A sobra transparente em volta é cortada e a arte é preparada em 300 DPI. Confira a medida de impressão de cada uma.</p><div class="dtf-up-list" id="upList"></div>',
    footer: '<span class="dtf-up-status" id="upStatus"></span><button type="button" class="dtf-btn" data-close>Cancelar</button><button type="button" class="dtf-btn dtf-btn-primary" id="upSave" data-tip="up-save" disabled>Salvar artes</button>' });
  const list = m.el.querySelector('#upList'), saveBtn = m.el.querySelector('#upSave'), status = m.el.querySelector('#upStatus');
  const card = e => {
    if (e.status === 'reading') return '<div class="dtf-up" data-e="' + e.key + '"><div class="dtf-up-thumb dtf-checker"><span class="dtf-spin"></span></div><div class="dtf-up-main"><b>' + esc(e.fileName) + '</b><span class="dtf-muted">' + esc(e.stage || 'Lendo…') + '</span></div></div>';
    if (e.status === 'error') return '<div class="dtf-up is-error" data-e="' + e.key + '"><div class="dtf-up-thumb">⚠️</div><div class="dtf-up-main"><b>' + esc(e.fileName) + '</b><span class="dtf-err-text">' + esc(e.error) + '</span></div><button type="button" class="dtf-btn dtf-btn-sm dtf-btn-icon" data-rm aria-label="Tirar da lista" data-tip="up-remove">✕</button></div>';
    const q = quality(dpiOf(e.box.width, e.w)), fits = Math.min(e.w, e.h) <= 58;
    return '<div class="dtf-up' + (e.status === 'saved' ? ' is-saved' : '') + '" data-e="' + e.key + '"><div class="dtf-up-thumb dtf-checker"><img alt="" src="' + e.thumbUrl + '"></div>'
      + '<div class="dtf-up-main"><input class="dtf-input dtf-up-name" data-name value="' + esc(e.name) + '" maxlength="120" aria-label="Nome da arte" data-tip="up-name"' + (e.status !== 'ready' ? ' disabled' : '') + '>'
      + sizeFieldsHTML(e.w, e.h, 'up-size')
      + '<div class="dtf-up-info"><span class="dtf-q is-' + q.level + '" data-q>' + q.label + '</span>' + (e.trimmed ? '<span class="dtf-ok-chip">✂ Sobra cortada</span>' : '') + (e.page ? '<span class="dtf-chip-mini">PDF · pág. ' + e.page + '</span>' : '')
      + (fits ? '' : '<span class="dtf-warn-chip" data-fit>Maior que 58 cm dos dois lados: não cabe no filme</span>') + '</div>'
      + e.warnings.map(w => '<p class="dtf-warn">' + esc(w) + '</p>').join('')
      + (e.status === 'saving' ? '<p class="dtf-muted dtf-small"><span class="dtf-spin"></span> ' + esc(e.stage || 'Enviando…') + '</p>' : e.status === 'saved' ? '<p class="dtf-ok-text">✓ Salva</p>' : e.saveError ? '<p class="dtf-err-text">' + esc(e.saveError) + '</p>' : '')
      + '</div>' + (e.status === 'ready' ? '<button type="button" class="dtf-btn dtf-btn-sm dtf-btn-icon" data-rm aria-label="Tirar da lista" data-tip="up-remove">✕</button>' : '') + '</div>';
  };
  const paint = () => {
    list.innerHTML = entries.map(card).join('');
    for (const e of entries) {
      const node = list.querySelector('[data-e="' + e.key + '"]'); if (!node) continue;
      node.querySelector('[data-rm]')?.addEventListener('click', () => { releaseEntry(e); entries.splice(entries.indexOf(e), 1); paint(); });
      if (e.status === 'ready') {
        node.querySelector('[data-name]').addEventListener('input', ev => { e.name = ev.target.value; });
        bindSize(node, e.ratio, (w, h) => {
          e.w = w; e.h = h; const q = quality(dpiOf(e.box.width, w)), chip = node.querySelector('[data-q]'); chip.className = 'dtf-q is-' + q.level; chip.textContent = q.label;
          const fit = Math.min(w, h) <= 58; let warn = node.querySelector('[data-fit]');
          if (fit && warn) warn.remove(); else if (!fit && !warn) node.querySelector('.dtf-up-info').insertAdjacentHTML('beforeend', '<span class="dtf-warn-chip" data-fit>Maior que 58 cm dos dois lados: não cabe no filme</span>');
          updateFooter();
        });
      }
    }
    updateFooter();
  };
  const updateFooter = () => {
    const ready = entries.filter(e => e.status === 'ready'), reading = entries.filter(e => e.status === 'reading').length, bad = ready.filter(e => !(e.w > 0 && e.h > 0) || Math.min(e.w, e.h) > 58).length;
    saveBtn.disabled = saving || reading > 0 || !ready.length || bad > 0;
    saveBtn.textContent = ready.length > 1 ? 'Salvar ' + ready.length + ' artes' : 'Salvar arte';
    status.textContent = reading ? 'Preparando ' + reading + ' arquivo(s)…' : bad ? 'Ajuste a medida das artes marcadas.' : '';
  };
  let keySeq = 0;
  const addFiles = async picked => {
    const jobs = picked.map(file => { const e = { key: 'f' + (++keySeq), fileName: file.name, status: 'reading', stage: 'Na fila…', file }; entries.push(e); return e; });
    paint();
    for (const job of jobs) {
      if (!entries.includes(job)) continue;
      const setStage = text => { job.stage = text; const node = list.querySelector('[data-e="' + job.key + '"] .dtf-muted'); if (node) node.textContent = text; };
      try {
        const found = await analyzeFile(job.file, { onStage: setStage });
        const at = entries.indexOf(job); if (at < 0) { found.forEach(releaseEntry); continue; }
        const ready = found.map(entry => ({ ...entry, key: 'f' + (++keySeq), fileName: job.fileName, status: 'ready', w: entry.widthCm, h: entry.heightCm, thumbUrl: URL.createObjectURL(entry.thumbBlob) }));
        entries.splice(at, 1, ...ready);
      } catch (error) { job.status = 'error'; job.error = friendly(error); }
      paint();
    }
  };
  m.el.querySelector('#upMore').onclick = () => {
    const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.accept = ACCEPT; input.style.display = 'none';
    input.addEventListener('change', () => { const f = [...(input.files || [])]; input.remove(); if (f.length) addFiles(f); }); document.body.appendChild(input); input.click();
  };
  saveBtn.onclick = async () => {
    saving = true; updateFooter();
    const folder = m.el.querySelector('#upFolder').value || null, uid = (await sb.auth.getUser()).data.user?.id;
    if (!uid) { saving = false; toast('Sua sessão venceu. Entre de novo.', 'err'); return; }
    let ok = 0, failed = 0;
    const originals = new Map();   // um PDF de várias páginas sobe uma vez só
    for (const e of entries.filter(x => x.status === 'ready')) {
      e.status = 'saving'; e.saveError = ''; paint();
      const node = () => list.querySelector('[data-e="' + e.key + '"] .dtf-up-main p.dtf-small');
      const stage = text => { e.stage = text; const n = node(); if (n) n.innerHTML = '<span class="dtf-spin"></span> ' + esc(text); };
      const id = crypto.randomUUID(), base = uid + '/dtf/' + id + '/', uploaded = [];
      try {
        const print = await buildPrint(e, e.w, e.h, { onStage: stage });
        stage('Enviando a arte… (' + (print.blob.size / 1048576).toFixed(1).replace('.', ',') + ' MB)');
        const up = async (path, blob, type) => { const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false, cacheControl: '3600' }); if (error) throw error; uploaded.push(path); };
        await up(base + 'print.png', print.blob, 'image/png');
        await up(base + 'thumb.png', e.thumbBlob, 'image/png');
        let originalPath = null;
        if (e.original) {
          if (originals.has(e.original)) originalPath = originals.get(e.original);
          else { const ext = e.originalKind === 'pdf' ? 'pdf' : e.originalKind === 'jpg' ? 'jpg' : e.originalKind; originalPath = base + 'original.' + ext; await up(originalPath, e.original, e.original.type || (ext === 'pdf' ? 'application/pdf' : 'image/' + ext)); originals.set(e.original, originalPath); }
        }
        stage('Salvando…');
        const row = { id, client_id: state.me.id, folder_id: folder, name: (e.name || 'Arte').trim().slice(0, 120) || 'Arte', print_path: base + 'print.png', thumb_path: base + 'thumb.png', original_path: originalPath,
          original_mime: (e.original || e.file)?.type || 'image/png', size_bytes: print.blob.size, width_px: print.widthPx, height_px: print.heightPx, dpi: Math.round(print.dpi * 100) / 100,
          width_cm: Math.round(e.w * 100) / 100, height_cm: Math.round(e.h * 100) / 100, has_alpha: e.hasAlpha, trimmed: !!e.trimmed, upscaled: print.upscaled,
          source_dpi: Math.round(dpiOf(e.box.width, e.w) * 100) / 100 };
        const { data, error } = await sb.from('z19p_dtf_assets').insert(row).select('id,folder_id,name,print_path,thumb_path,original_path,width_px,height_px,dpi,source_dpi,width_cm,height_cm,has_alpha,upscaled,created_at').single();
        if (error) throw error;
        urls.set(row.thumb_path, { url: e.thumbUrl, expires: Date.now() + 3000000 });
        state.assets.unshift(data); e.status = 'saved'; ok++;
      } catch (error) {
        // Desfaz o que subiu desta arte (o PDF original fica se outra página dele já foi salva).
        const sharedOriginal = e.original && entries.some(x => x !== e && x.original === e.original && x.status === 'saved') ? originals.get(e.original) : null;
        const drop = uploaded.filter(p => p !== sharedOriginal);
        if (drop.length) sb.storage.from(BUCKET).remove(drop).then(() => {}, () => {});
        if (e.original && drop.includes(originals.get(e.original))) originals.delete(e.original);
        e.status = 'ready'; e.saveError = 'Não salvou: ' + friendly(error); failed++;
      }
      paint();
    }
    saving = false; updateFooter();
    if (ok) { await signPaths(state.assets.map(a => a.thumb_path)).catch(() => {}); if (state.tab === 'arts') renderTab(); }
    if (!failed) { m.close(); toast(ok > 1 ? ok + ' artes salvas!' : 'Arte salva!'); }
    else toast(ok + ' salva(s), ' + failed + ' com erro. Confira e tente de novo.', 'err');
  };
  addFiles(files);
}

// ───────────── filmes ─────────────
const priceSettings = () => ({ price58: Number(state.me.price58), price28: Number(state.me.price28), mode: state.me.mode, artTable: state.me.artTable || [] });
const widthAvailable = w => Number(w === 28 ? state.me.price28 : state.me.price58) > 0;
const saveQueue = new Map();
async function saveFilmNow(film) {
  const { error } = await sb.from('z19p_dtf_films').update({ name: film.name, film_width_cm: film.film_width_cm, allow_rotate: film.allow_rotate, items: film.items, updated_at: new Date().toISOString() }).eq('id', film.id);
  if (error) throw error;
}
function scheduleSave(film) {
  clearTimeout(saveQueue.get(film.id));
  setSaved('saving');
  saveQueue.set(film.id, setTimeout(async () => { saveQueue.delete(film.id); try { await saveFilmNow(film); setSaved('ok'); } catch (error) { setSaved('err'); toast('Não salvou o filme: ' + friendly(error), 'err'); } }, 700));
}
async function flushSave(film) { if (saveQueue.has(film.id)) { clearTimeout(saveQueue.get(film.id)); saveQueue.delete(film.id); await saveFilmNow(film); setSaved('ok'); } }
function setSaved(kind) { const n = document.getElementById('savedFlag'); if (!n) return; n.className = 'dtf-saved is-' + kind; n.textContent = kind === 'saving' ? 'Salvando…' : kind === 'err' ? 'Não salvo' : '✓ Salvo'; }
async function newFilm({ items = [], name = '', width = null } = {}) {
  const film_width_cm = width && widthAvailable(width) ? width : widthAvailable(58) ? 58 : 28;
  const n = state.films.length + state.orders.length + 1;
  const { data, error } = await sb.from('z19p_dtf_films').insert({ client_id: state.me.id, name: (name || 'Filme ' + n).slice(0, 80), film_width_cm, items }).select('id,name,film_width_cm,allow_rotate,items,status,updated_at,created_at').single();
  if (error) throw error;
  state.films.unshift(data); return data;
}
async function addToFilm(ids) {
  const assets = ids.map(assetById).filter(Boolean); if (!assets.length) return;
  try {
    let film = currentFilm();
    if (!film && state.films.length === 1) film = state.films[0];
    if (!film && state.films.length > 1) { film = await chooseFilm(); if (!film) return; }
    if (!film) film = await newFilm();
    for (const a of assets) {
      const found = film.items.find(i => i.assetId === a.id && Math.abs(i.widthCm - a.width_cm) < 0.01 && Math.abs(i.heightCm - a.height_cm) < 0.01);
      if (found) found.quantity = Math.min(999, found.quantity + 1); else film.items.push({ assetId: a.id, widthCm: Number(a.width_cm), heightCm: Number(a.height_cm), quantity: 1 });
    }
    await saveFilmNow(film);
    state.filmId = film.id; state.selected.clear();
    toast(assets.length > 1 ? assets.length + ' artes no filme "' + film.name + '".' : '"' + assets[0].name + '" no filme "' + film.name + '".');
    setTab('film');
  } catch (error) { toast(friendly(error), 'err'); }
}
function chooseFilm() {
  return new Promise(resolve => {
    const m = openModal({ title: 'Em qual filme?', size: 'is-small', onClose: resolve, body: '<div class="dtf-menu">' + state.films.map(f => '<button type="button" class="dtf-btn dtf-btn-block dtf-btn-blue" data-f="' + f.id + '">🎞️ ' + esc(f.name) + ' · ' + f.film_width_cm + ' cm · ' + f.items.length + ' arte(s)</button>').join('')
      + '<button type="button" class="dtf-btn dtf-btn-block dtf-btn-orange" data-new data-tip="film-new">＋ Novo filme</button></div>' });
    m.el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => m.close(state.films.find(f => f.id === b.dataset.f)));
    m.el.querySelector('[data-new]').onclick = async () => { try { m.close(await newFilm()); } catch (error) { toast(friendly(error), 'err'); m.close(null); } };
  });
}
function renderFilmTab(main) {
  const film = currentFilm();
  if (film) return renderBuilder(main, film);
  main.innerHTML = '<section class="dtf-head"><div><h1>Montar filme</h1><p>Monte o filme, confira o comprimento e o valor e envie para a ZERO19 imprimir.</p></div><button type="button" class="dtf-btn dtf-btn-primary dtf-btn-lg" id="newFilm" data-tip="film-new">＋ Novo filme</button></section>'
    + '<div class="dtf-prices">' + [58, 28].map(w => '<div class="dtf-price-card' + (widthAvailable(w) ? '' : ' is-off') + '"><span class="dtf-price-w">Filme ' + w + ' cm</span><b>' + (widthAvailable(w) ? formatMoney(w === 28 ? state.me.price28 : state.me.price58) + '<small>/metro</small>' : 'Indisponível') + '</b><span class="dtf-muted dtf-small">' + w + ' × 100 cm</span></div>').join('') + '</div>'
    + (state.me.mode !== 'meter' ? '<p class="dtf-note">' + modeNote() + '</p>' : '')
    + (state.films.length ? '<h2 class="dtf-h2">Filmes em montagem</h2><div class="dtf-films">' + state.films.map(f => {
      const units = f.items.reduce((s, i) => s + Number(i.quantity || 0), 0);
      return '<article class="dtf-film-card"><div class="dtf-film-ico" aria-hidden="true">🎞️</div><div class="dtf-film-main"><b>' + esc(f.name) + '</b><span class="dtf-muted">Filme ' + f.film_width_cm + ' cm · ' + f.items.length + ' arte(s) · ' + units + ' impressão(ões) · mexido ' + dateText(f.updated_at) + '</span></div>'
        + '<div class="dtf-film-actions"><button type="button" class="dtf-btn dtf-btn-sm dtf-btn-orange" data-open="' + f.id + '" data-tip="film-open">Abrir</button><button type="button" class="dtf-btn dtf-btn-sm dtf-btn-icon dtf-btn-rose" data-del="' + f.id + '" data-tip="film-delete-draft" aria-label="Excluir filme">🗑</button></div></article>';
    }).join('') + '</div>'
      : '<div class="dtf-empty"><div class="dtf-empty-ico">🎞️</div><b>Nenhum filme em montagem.</b><p>' + (state.assets.length ? 'Toque em <b>Novo filme</b> e ponha suas artes.' : 'Primeiro suba suas artes em <b>Minhas artes</b>.') + '</p>' + (state.assets.length ? '' : '<button type="button" class="dtf-btn dtf-btn-primary" id="goArts">Ir para Minhas artes</button>') + '</div>');
  main.querySelector('#newFilm').onclick = async () => { try { const f = await newFilm(); state.filmId = f.id; renderTab(); } catch (error) { toast(friendly(error), 'err'); } };
  main.querySelector('#goArts')?.addEventListener('click', () => setTab('arts'));
  main.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { state.filmId = b.dataset.open; state.layout = null; renderTab(); });
  main.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteFilm(state.films.find(f => f.id === b.dataset.del)));
  tips?.intro(main.querySelector('.dtf-head h1'), 'intro-film');
}
function modeNote() {
  if (state.me.mode === 'art') return 'Seu combinado com a ZERO19: cobrança <b>por arte</b>, pelo tamanho de cada uma.';
  if (state.me.mode === 'auto') return 'Seu combinado com a ZERO19: filme com <b>menos de 1 metro</b> é cobrado <b>por arte</b> (nunca mais que 1 metro); a partir de 1 metro, <b>pelo metro</b>.';
  return '';
}
async function deleteFilm(film) {
  if (!film || !await confirmDialog({ title: 'Excluir o filme "' + esc(film.name) + '"?', text: 'As artes continuam em "Minhas artes".', ok: 'Excluir filme', danger: true })) return;
  const { error } = await sb.from('z19p_dtf_films').delete().eq('id', film.id);
  if (error) return toast(friendly(error), 'err');
  state.films = state.films.filter(f => f.id !== film.id); if (state.filmId === film.id) state.filmId = null;
  renderTab(); toast('Filme excluído.');
}
const itemFits = (item, film) => item.widthCm <= film.film_width_cm + 0.01 || (film.allow_rotate && item.heightCm <= film.film_width_cm + 0.01);
function filmKey(film) { return JSON.stringify([film.film_width_cm, film.allow_rotate, film.items.map(i => [i.assetId, i.widthCm, i.heightCm, i.quantity])]); }
function renderBuilder(main, film) {
  film.items = film.items.filter(i => assetById(i.assetId));
  main.innerHTML = '<section class="dtf-head dtf-head-film"><div class="dtf-head-film-in"><button type="button" class="dtf-btn dtf-btn-sm" id="fBack" data-tip="film-back">← Meus filmes</button>'
    + '<input class="dtf-input dtf-film-name" id="fName" value="' + esc(film.name) + '" maxlength="80" aria-label="Nome do filme" data-tip="film-name"><span class="dtf-saved is-ok" id="savedFlag">✓ Salvo</span></div></section>'
    + '<div class="dtf-builder"><div class="dtf-col">'
    + '<section class="dtf-card"><h3><span class="dtf-step">1</span> Largura do filme</h3><div class="dtf-seg" role="radiogroup" aria-label="Largura do filme">'
    + [58, 28].map(w => '<button type="button" role="radio" aria-checked="' + (film.film_width_cm === w) + '" class="dtf-seg-btn' + (film.film_width_cm === w ? ' is-on' : '') + '" data-w="' + w + '" data-tip="film-width"' + (widthAvailable(w) ? '' : ' disabled') + '><b>' + w + ' cm</b><span>' + (widthAvailable(w) ? formatMoney(w === 28 ? state.me.price28 : state.me.price58) + '/m' : 'indisponível') + '</span></button>').join('')
    + '</div><label class="dtf-switch" data-tip="film-rotate"><input type="checkbox" id="fRotate"' + (film.allow_rotate ? ' checked' : '') + '><span class="dtf-switch-ui" aria-hidden="true"></span><span>Girar artes para economizar filme</span></label></section>'
    + '<section class="dtf-card"><div class="dtf-card-head"><h3><span class="dtf-step">2</span> Artes do filme</h3><button type="button" class="dtf-btn dtf-btn-sm dtf-btn-orange" id="fAdd" data-tip="film-add">＋ Adicionar artes</button></div><div class="dtf-items" id="fItems"></div></section>'
    + '</div><div class="dtf-col dtf-col-side"><section class="dtf-card dtf-preview-card"><h3><span class="dtf-step">3</span> Prévia e valor</h3>'
    + '<div class="dtf-preview" id="fPreview" data-tip="film-preview" tabindex="0" aria-label="Prévia do filme"><canvas id="fCanvas"></canvas></div><div class="dtf-summary" id="fSummary" data-tip="film-price" tabindex="0"></div>'
    + '<button type="button" class="dtf-btn dtf-btn-primary dtf-btn-block dtf-btn-lg" id="fSend" data-tip="film-send">Enviar para produção</button>'
    + '<button type="button" class="dtf-btn dtf-btn-block dtf-btn-rose dtf-btn-sm" id="fDelete" data-tip="film-delete">🗑 Excluir filme</button></section></div></div>'
    + '<div class="dtf-sendbar" id="fBar"><div><b id="fBarTotal">—</b><span id="fBarLen"></span></div><button type="button" class="dtf-btn dtf-btn-primary" id="fBarSend" data-tip="film-send">Enviar</button></div>';
  const changed = () => { scheduleSave(film); paintItems(); computeLayout(film); };
  main.querySelector('#fBack').onclick = async () => { try { await flushSave(film); } catch { /* aviso já mostrado */ } state.filmId = null; state.layout = null; renderTab(); };
  main.querySelector('#fName').addEventListener('input', event => { film.name = event.target.value.trim() || 'Meu filme'; scheduleSave(film); });
  main.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { const w = Number(b.dataset.w); if (film.film_width_cm === w) return; film.film_width_cm = w; main.querySelectorAll('[data-w]').forEach(x => { x.classList.toggle('is-on', Number(x.dataset.w) === w); x.setAttribute('aria-checked', String(Number(x.dataset.w) === w)); }); changed(); });
  main.querySelector('#fRotate').onchange = event => { film.allow_rotate = event.target.checked; changed(); };
  main.querySelector('#fAdd').onclick = () => pickForFilm(film, changed);
  main.querySelector('#fDelete').onclick = () => deleteFilm(film);
  main.querySelector('#fSend').onclick = () => sendFilm(film);
  main.querySelector('#fBarSend').onclick = () => sendFilm(film);
  const paintItems = () => {
    const box = main.querySelector('#fItems');
    if (!film.items.length) { box.innerHTML = '<div class="dtf-empty dtf-empty-sm"><b>Filme vazio.</b><p>Toque em <b>＋ Adicionar artes</b>.</p></div>'; return; }
    box.innerHTML = film.items.map((item, index) => {
      const a = assetById(item.assetId), q = quality(realDpi(a, item.widthCm)), fits = itemFits(item, film);
      return '<div class="dtf-item' + (fits ? '' : ' is-bad') + '" data-i="' + index + '"><div class="dtf-item-thumb dtf-checker"><img alt="" src="' + esc(urlOf(a.thumb_path)) + '"></div>'
        + '<div class="dtf-item-main"><b class="dtf-item-name" title="' + esc(a.name) + '">' + esc(a.name) + '</b>' + sizeFieldsHTML(item.widthCm, item.heightCm, 'film-size')
        + '<div class="dtf-item-info"><span class="dtf-q is-' + q.level + '" data-q>' + q.label + '</span>' + (fits ? '' : '<span class="dtf-warn-chip">Não cabe no filme de ' + film.film_width_cm + ' cm</span>') + '</div></div>'
        + '<div class="dtf-item-side"><div class="dtf-qty" data-tip="film-qty"><button type="button" data-q="-1" aria-label="Menos uma">−</button><input inputmode="numeric" value="' + item.quantity + '" aria-label="Quantidade" data-qi><button type="button" data-q="1" aria-label="Mais uma">+</button></div>'
        + '<button type="button" class="dtf-btn dtf-btn-sm dtf-btn-icon dtf-btn-rose" data-rm data-tip="film-remove" aria-label="Tirar do filme">🗑</button></div></div>';
    }).join('');
    box.querySelectorAll('.dtf-item').forEach(node => {
      const item = film.items[Number(node.dataset.i)], a = assetById(item.assetId);
      bindSize(node, a.height_px / a.width_px, (w, h) => {
        item.widthCm = w; item.heightCm = h; scheduleSave(film);
        const q = quality(realDpi(a, w)), chip = node.querySelector('[data-q]'); chip.className = 'dtf-q is-' + q.level; chip.textContent = q.label;
        node.classList.toggle('is-bad', !itemFits(item, film)); computeLayout(film);
      }, { max: 500 });
      const qi = node.querySelector('[data-qi]');
      const setQ = v => { const n = Math.max(1, Math.min(999, Math.round(v) || 1)); item.quantity = n; qi.value = n; scheduleSave(film); computeLayout(film); };
      node.querySelectorAll('[data-q]').forEach(b => { if (b.tagName === 'BUTTON') b.onclick = () => setQ(item.quantity + Number(b.dataset.q)); });
      qi.addEventListener('change', () => setQ(parseNum(qi.value)));
      qi.addEventListener('focus', () => qi.select());
      node.querySelector('[data-rm]').onclick = () => { film.items.splice(Number(node.dataset.i), 1); changed(); };
    });
  };
  paintItems();
  state.layout = null; state.layoutKey = '';
  computeLayout(film);
  const preview = main.querySelector('#fPreview');
  previewObserver?.disconnect();
  if (typeof ResizeObserver !== 'undefined') { let lastW = 0; previewObserver = new ResizeObserver(() => { const w = preview.clientWidth; if (Math.abs(w - lastW) > 4) { lastW = w; paintPreview(film); } }); previewObserver.observe(preview); }
}
let nestTimer = null, nestGen = 0, previewObserver = null;
function computeLayout(film) {
  clearTimeout(nestTimer);
  const key = filmKey(film);
  if (key === state.layoutKey && state.layout) { paintSummary(film); paintPreview(film); return; }
  state.nesting = true; state.nestError = ''; paintSummary(film);
  nestTimer = setTimeout(async () => {
    const gen = ++nestGen;
    const bad = film.items.filter(i => !itemFits(i, film));
    if (bad.length) { state.layout = null; state.layoutKey = ''; state.nesting = false; state.nestError = bad.length + ' arte(s) não cabem no filme de ' + film.film_width_cm + ' cm. Diminua a medida' + (film.allow_rotate ? '' : ' ou ligue "Girar artes"') + '.'; paintSummary(film); paintPreview(film); return; }
    try {
      const layout = await nestFilm(film.items.map((i, k) => ({ key: k, widthCm: i.widthCm, heightCm: i.heightCm, quantity: i.quantity })), { filmWidthCm: film.film_width_cm, allowRotate: film.allow_rotate });
      if (gen !== nestGen || currentFilm() !== film) return;
      state.layout = layout; state.layoutKey = key; state.nesting = false;
    } catch (error) { if (gen !== nestGen) return; state.layout = null; state.layoutKey = ''; state.nesting = false; state.nestError = friendly(error); }
    paintSummary(film); paintPreview(film);
  }, 260);
}
function filmLengthCm() { return state.layout ? Math.ceil(state.layout.lengthMm) / 10 : 0; }
function currentPrice(film) {
  const len = filmLengthCm();
  return filmPrice(priceSettings(), { filmWidthCm: film.film_width_cm, lengthCm: len, items: film.items.map(i => ({ ...i, name: assetById(i.assetId)?.name })) });
}
function paintSummary(film) {
  const box = document.getElementById('fSummary'); if (!box) return;
  const sendBtns = [document.getElementById('fSend'), document.getElementById('fBarSend')], barTotal = document.getElementById('fBarTotal'), barLen = document.getElementById('fBarLen');
  const disable = v => sendBtns.forEach(b => { if (b) b.disabled = v; });
  if (!film.items.length) { box.innerHTML = '<p class="dtf-muted">Ponha artes no filme para ver o comprimento e o valor.</p>'; disable(true); barTotal.textContent = '—'; barLen.textContent = 'Filme vazio'; return; }
  if (state.nestError) { box.innerHTML = '<p class="dtf-err-text">' + esc(state.nestError) + '</p>'; disable(true); barTotal.textContent = '—'; barLen.textContent = 'Ajuste as artes'; return; }
  if (state.nesting || !state.layout) { box.innerHTML = '<p class="dtf-muted"><span class="dtf-spin"></span> Encaixando as artes…</p>'; disable(true); barLen.textContent = 'Calculando…'; return; }
  const len = filmLengthCm(), price = currentPrice(film), units = film.items.reduce((s, i) => s + i.quantity, 0);
  let how = '';
  if (price.charged === 'meter') how = '<div class="dtf-sum-line"><span>' + price.meter.meters + ' m × ' + formatMoney(price.meter.perMeter) + '</span><b>' + formatMoney(price.meter.total) + '</b></div><p class="dtf-muted dtf-small">Cobrado pelo metro (o comprimento é arredondado para o metro de cima).' + (price.art && !price.art.complete ? ' Alguma arte não tem preço por tamanho combinado.' : price.mode === 'auto' && price.art?.complete ? ' Por arte daria ' + formatMoney(price.art.total) + '.' : '') + '</p>';
  else if (price.charged === 'art') how = price.art.lines.map(l => '<div class="dtf-sum-line"><span>' + l.quantity + '× ' + esc(l.name || 'arte') + ' <small>' + cmText(l.widthCm, l.heightCm) + '</small></span><b>' + formatMoney(l.subtotal) + '</b></div>').join('') + '<p class="dtf-muted dtf-small">Cobrado por arte, pelo tamanho de cada uma' + (price.mode === 'auto' && price.meter ? ' (1 metro sairia ' + formatMoney(price.meter.total) + ').' : '.') + '</p>';
  box.innerHTML = '<div class="dtf-sum-big"><div><span>Comprimento</span><b>' + metersText(len) + '</b></div><div><span>Impressões</span><b>' + units + '</b></div></div>' + how
    + (price.total ? '<div class="dtf-sum-total"><span>Total</span><b>' + formatMoney(price.total) + '</b></div><p class="dtf-pay-note">💬 Pagamento combinado com a ZERO19.</p>' : '<p class="dtf-err-text">O preço deste filme não está cadastrado. Fale com a ZERO19.</p>');
  disable(!price.total);
  barTotal.textContent = price.total ? formatMoney(price.total) : '—'; barLen.textContent = metersText(len) + ' de filme';
}
function paintPreview(film) {
  const box = document.getElementById('fPreview'), canvas = document.getElementById('fCanvas'); if (!box || !canvas) return;
  const images = new Map();
  film.items.forEach((item, k) => { const a = assetById(item.assetId), img = imageFor(a?.thumb_path); if (img) { images.set(String(k), img); if (!img.complete) img.onload = () => paintPreview(film); } });
  drawFilm(canvas, { filmWidthCm: film.film_width_cm, layout: state.layout || { placements: [], lengthMm: 0 }, images, cssWidth: Math.max(140, box.clientWidth - 2) });
}
function pickForFilm(film, onDone) {
  if (!state.assets.length) { toast('Suba artes primeiro em "Minhas artes".', 'info'); return; }
  const chosen = new Set(); let folder = 'all', term = '';
  const m = openModal({ title: 'Adicionar artes ao filme', size: 'is-wide', body: '<div class="dtf-chips" id="pkFolders"></div><input class="dtf-input dtf-search" id="pkSearch" type="search" placeholder="Buscar arte" autocomplete="off"><div class="dtf-grid dtf-grid-pick" id="pkGrid"></div>',
    footer: '<span class="dtf-up-status" id="pkCount"></span><button type="button" class="dtf-btn" data-close>Cancelar</button><button type="button" class="dtf-btn dtf-btn-primary" id="pkOk" disabled>Adicionar</button>' });
  const grid = m.el.querySelector('#pkGrid'), ok = m.el.querySelector('#pkOk'), count = m.el.querySelector('#pkCount');
  const paint = () => {
    m.el.querySelector('#pkFolders').innerHTML = '<button type="button" class="dtf-chip' + (folder === 'all' ? ' is-on' : '') + '" data-pf="all">Todas</button>' + state.folders.map(f => '<button type="button" class="dtf-chip' + (folder === f.id ? ' is-on' : '') + '" data-pf="' + f.id + '">📁 ' + esc(f.name) + '</button>').join('');
    const t = term.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const list = state.assets.filter(a => (folder === 'all' || a.folder_id === folder) && (!t || a.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(t)));
    const inFilm = new Set(film.items.map(i => i.assetId));
    grid.innerHTML = list.length ? list.map(a => '<button type="button" class="dtf-pick' + (chosen.has(a.id) ? ' is-on' : '') + '" data-pk="' + a.id + '" aria-pressed="' + chosen.has(a.id) + '"><span class="dtf-pick-img dtf-checker"><img loading="lazy" alt="" src="' + esc(urlOf(a.thumb_path)) + '"></span><b>' + esc(a.name) + '</b><span class="dtf-muted dtf-small">' + cmText(a.width_cm, a.height_cm) + '</span>' + (inFilm.has(a.id) ? '<span class="dtf-chip-mini">já no filme</span>' : '') + '<span class="dtf-pick-mark" aria-hidden="true">✓</span></button>').join('') : '<p class="dtf-muted">Nenhuma arte aqui.</p>';
    m.el.querySelectorAll('[data-pf]').forEach(b => b.onclick = () => { folder = b.dataset.pf; paint(); });
    ok.disabled = !chosen.size; ok.textContent = chosen.size > 1 ? 'Adicionar ' + chosen.size + ' artes' : 'Adicionar'; count.textContent = chosen.size ? chosen.size + ' marcada(s)' : 'Toque nas artes para marcar';
  };
  grid.addEventListener('click', event => { const b = event.target.closest('[data-pk]'); if (!b) return; const id = b.dataset.pk; chosen.has(id) ? chosen.delete(id) : chosen.add(id); b.classList.toggle('is-on', chosen.has(id)); b.setAttribute('aria-pressed', String(chosen.has(id))); ok.disabled = !chosen.size; ok.textContent = chosen.size > 1 ? 'Adicionar ' + chosen.size + ' artes' : 'Adicionar'; count.textContent = chosen.size ? chosen.size + ' marcada(s)' : 'Toque nas artes para marcar'; });
  m.el.querySelector('#pkSearch').addEventListener('input', debounce(event => { term = event.target.value; paint(); }, 200));
  ok.onclick = () => {
    for (const id of chosen) { const a = assetById(id), found = film.items.find(i => i.assetId === id && Math.abs(i.widthCm - a.width_cm) < 0.01 && Math.abs(i.heightCm - a.height_cm) < 0.01); if (found) found.quantity = Math.min(999, found.quantity + 1); else film.items.push({ assetId: id, widthCm: Number(a.width_cm), heightCm: Number(a.height_cm), quantity: 1 }); }
    m.close(); onDone(); toast(chosen.size > 1 ? chosen.size + ' artes adicionadas.' : 'Arte adicionada.');
  };
  paint();
}
async function sendFilm(film) {
  if (!state.layout || state.nesting) return;
  try { await flushSave(film); } catch (error) { toast('Não salvou o filme: ' + friendly(error), 'err'); return; }
  const len = filmLengthCm(), price = currentPrice(film), units = film.items.reduce((s, i) => s + i.quantity, 0);
  let delivery = 'pickup';
  const m = openModal({ title: 'Enviar para produção', size: 'is-small',
    body: '<div class="dtf-send-sum"><div><span>Filme</span><b>' + film.film_width_cm + ' cm</b></div><div><span>Comprimento</span><b>' + metersText(len) + '</b></div><div><span>Impressões</span><b>' + units + '</b></div><div><span>Total</span><b>' + formatMoney(price.total) + '</b></div></div>'
      + '<p class="dtf-field-title">Como você vai receber?</p><div class="dtf-radio-cards" data-tip="send-delivery">'
      + '<button type="button" class="dtf-radio is-on" data-d="pickup" aria-pressed="true"><b>🏪 Retirar na loja</b><span>ZERO19 · Indaiatuba/SP</span></button>'
      + '<button type="button" class="dtf-radio" data-d="shipping" aria-pressed="false"><b>🚚 Receber</b><span>Frete combinado com a ZERO19</span></button></div>'
      + '<label class="dtf-field"><span>Observação (opcional)</span><textarea class="dtf-input" id="sNote" rows="2" maxlength="600" placeholder="Ex.: preciso até sexta" data-tip="send-note"></textarea></label>'
      + '<p class="dtf-pay-note">💬 O pagamento é combinado com a ZERO19. Depois de enviado, o filme não muda mais; enquanto estiver na fila, dá para cancelar.</p><div class="dtf-alert is-err" id="sErr" hidden></div>',
    footer: '<button type="button" class="dtf-btn" data-close>Voltar</button><button type="button" class="dtf-btn dtf-btn-primary" id="sOk" data-tip="send-confirm">Confirmar e enviar</button>' });
  m.el.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { delivery = b.dataset.d; m.el.querySelectorAll('[data-d]').forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); });
  m.el.querySelector('#sOk').onclick = async () => {
    const done = busyButton(m.el.querySelector('#sOk'), 'Enviando…'), err = m.el.querySelector('#sErr'); err.hidden = true;
    const { data, error } = await sb.rpc('z19p_dtf_send_film', { p_film_id: film.id, p_length_cm: len, p_delivery: delivery, p_note: m.el.querySelector('#sNote').value.trim() || null });
    if (error) { done(); err.hidden = false; err.textContent = friendly(error); return; }
    m.close(); state.films = state.films.filter(f => f.id !== film.id); state.filmId = null; state.layout = null;
    await refreshOrders({ render: false });
    const ok = openModal({ title: 'Pedido enviado! 🎉', size: 'is-small', body: '<div class="dtf-success"><div class="dtf-success-ico">✅</div><p>Seu pedido <b>#' + esc(data.orderNumber) + '</b> chegou na ZERO19.</p><p class="dtf-muted">Filme ' + film.film_width_cm + ' cm · ' + metersText(len) + ' · ' + formatMoney(data.total) + '</p><p>Acompanhe em <b>Meus pedidos</b>. O pagamento é combinado com a ZERO19.</p></div>',
      footer: '<a class="dtf-btn dtf-btn-green" target="_blank" rel="noopener" href="' + waLink(greeting() + '! Aqui é ' + state.me.name + '. Acabei de enviar o pedido DTF #' + data.orderNumber + ' (filme ' + film.film_width_cm + ' cm, ' + metersText(len) + ').') + '">💬 Avisar no WhatsApp</a><button type="button" class="dtf-btn dtf-btn-primary" id="goOrders">Ver meus pedidos</button>' });
    ok.el.querySelector('#goOrders').onclick = () => { ok.close(); setTab('orders'); };
    if (state.tab === 'film') renderTab();
  };
}

// ───────────── Meus pedidos ─────────────
const STEPS = [['sent', 'Recebido', '📨'], ['printing', 'Em produção', '🖨️'], ['ready', 'Pronto', '✅'], ['delivered', 'Entregue', '📦']];
function statusLabel(o) {
  if (o.status === 'cancelled') return 'Cancelado';
  if (o.status === 'sent') return 'Na fila da ZERO19';
  if (o.status === 'printing') return 'Em produção';
  if (o.status === 'ready') return o.delivery === 'shipping' ? 'Pronto para envio' : 'Pronto para retirar';
  return o.delivery === 'shipping' ? 'Enviado' : 'Entregue';
}
function paymentText(o) {
  const p = o.payment || {};
  if (p.status === 'PAGO') return '<span class="dtf-pay is-paid">✓ Pago</span>';
  if (p.status === 'PARCIAL' || Number(p.paid) > 0) return '<span class="dtf-pay is-part">Pago ' + formatMoney(p.paid) + ' de ' + formatMoney(p.total) + '</span>';
  if (o.status === 'cancelled') return '';
  return '<span class="dtf-pay">💬 Pagamento a combinar</span>';
}
function orderCard(o) {
  const at = { sent: o.sentAt, printing: o.printingAt, ready: o.readyAt, delivered: o.deliveredAt };
  const current = STEPS.findIndex(s => s[0] === o.status), units = (o.items || []).reduce((s, i) => s + Number(i.quantity || 0), 0);
  const timeline = o.status === 'cancelled' ? '<div class="dtf-cancel">✕ Pedido cancelado' + (o.cancelledAt ? ' · ' + dateText(o.cancelledAt) : '') + (o.cancelReason ? '<br><small>' + esc(o.cancelReason) + '</small>' : '') + '</div>'
    : '<ol class="dtf-steps">' + STEPS.map((s, k) => '<li class="' + (k < current ? 'is-done' : k === current ? 'is-now' : '') + '"><span class="dtf-step-dot" aria-hidden="true">' + (k < current || (k === current && s[0] === 'delivered') ? '✓' : s[2]) + '</span><b>' + (s[0] === 'ready' && o.delivery === 'shipping' ? 'Pronto p/ envio' : s[0] === 'delivered' && o.delivery === 'shipping' ? 'Enviado' : s[1]) + '</b><small>' + (k <= current && at[s[0]] ? dateText(at[s[0]]) : '') + '</small></li>').join('') + '</ol>';
  return '<article class="dtf-order is-' + o.status + '" data-o="' + o.id + '"><header class="dtf-order-head"><div><b class="dtf-order-n">Pedido #' + esc(o.orderNumber || '—') + '</b><span class="dtf-muted dtf-small">' + esc(o.name) + ' · enviado ' + dateText(o.sentAt) + '</span></div><span class="dtf-status is-' + o.status + '">' + statusLabel(o) + '</span></header>'
    + timeline
    + '<div class="dtf-order-facts"><span>🎞️ Filme ' + o.filmWidthCm + ' cm</span><span>📏 ' + metersText(Number(o.lengthCm)) + '</span><span>🖼️ ' + units + ' impressões</span><span>🚚 ' + (o.delivery === 'shipping' ? 'Receber' : 'Retirar na loja') + '</span><b>' + formatMoney(o.total) + '</b>' + paymentText(o) + '</div>'
    + '<div class="dtf-order-actions"><button type="button" class="dtf-btn dtf-btn-sm dtf-btn-blue" data-oa="details" data-tip="order-details">Ver detalhes</button><button type="button" class="dtf-btn dtf-btn-sm dtf-btn-lilac" data-oa="again" data-tip="order-again">↻ Montar de novo</button>'
    + '<a class="dtf-btn dtf-btn-sm dtf-btn-green" data-tip="order-whats" target="_blank" rel="noopener" href="' + waLink(greeting() + '! Aqui é ' + state.me.name + ', sobre o meu pedido DTF #' + o.orderNumber + '.') + '">💬 WhatsApp</a>'
    + (o.status === 'sent' ? '<button type="button" class="dtf-btn dtf-btn-sm dtf-btn-rose" data-oa="cancel" data-tip="order-cancel">Cancelar pedido</button>' : '') + '</div></article>';
}
function renderOrders(main) {
  const open = state.orders.filter(o => ['sent', 'printing', 'ready'].includes(o.status)), done = state.orders.filter(o => !['sent', 'printing', 'ready'].includes(o.status));
  main.innerHTML = '<section class="dtf-head"><div><h1>Meus pedidos</h1><p>Acompanhe cada filme enviado. A página atualiza sozinha.</p></div><button type="button" class="dtf-btn dtf-btn-blue" id="oRefresh" data-tip="refresh">↻ Atualizar</button></section>'
    + (state.orders.length ? (open.length ? '<h2 class="dtf-h2">Em andamento</h2><div class="dtf-orders">' + open.map(orderCard).join('') + '</div>' : '')
      + (done.length ? '<h2 class="dtf-h2">Anteriores</h2><div class="dtf-orders">' + done.map(orderCard).join('') + '</div>' : '')
      : '<div class="dtf-empty"><div class="dtf-empty-ico">📦</div><b>Você ainda não enviou nenhum filme.</b><p>Monte um filme em <b>Montar filme</b> e toque em <b>Enviar para produção</b>.</p><button type="button" class="dtf-btn dtf-btn-primary" id="goFilm">Montar filme</button></div>');
  main.querySelector('#oRefresh').onclick = async event => { const done2 = busyButton(event.currentTarget, 'Atualizando…'); await refreshOrders(); done2(); };
  main.querySelector('#goFilm')?.addEventListener('click', () => setTab('film'));
  main.querySelectorAll('[data-oa]').forEach(b => b.addEventListener('click', () => {
    const o = state.orders.find(x => x.id === b.closest('[data-o]').dataset.o); if (!o) return;
    if (b.dataset.oa === 'details') orderDetails(o); else if (b.dataset.oa === 'again') orderAgain(o); else cancelOrder(o);
  }));
  tips?.intro(main.querySelector('.dtf-head h1'), 'intro-orders');
}
function orderDetails(o) {
  const items = o.items || [], p = o.price || {};
  const how = p.charged === 'meter' && p.meter ? '<div class="dtf-sum-line"><span>' + p.meter.meters + ' m × ' + formatMoney(p.meter.perMeter) + '</span><b>' + formatMoney(p.meter.total) + '</b></div>'
    : (p.art?.lines || []).map(l => '<div class="dtf-sum-line"><span>' + l.quantity + '× ' + esc(l.name || 'arte') + '</span><b>' + formatMoney(l.subtotal) + '</b></div>').join('');
  openModal({ title: 'Pedido #' + (o.orderNumber || ''), size: 'is-wide', body: '<div class="dtf-detail-list">' + items.map(i => '<div class="dtf-detail"><span class="dtf-item-thumb dtf-checker"><img alt="" src="' + esc(urlOf(i.thumbPath)) + '"></span><div><b>' + esc(i.name) + '</b><span class="dtf-muted dtf-small">' + cmText(i.widthCm, i.heightCm) + '</span></div><b class="dtf-detail-q">' + i.quantity + '×</b></div>').join('') + '</div>'
    + '<div class="dtf-summary dtf-summary-static"><div class="dtf-sum-big"><div><span>Filme</span><b>' + o.filmWidthCm + ' cm</b></div><div><span>Comprimento</span><b>' + metersText(Number(o.lengthCm)) + '</b></div></div>' + how + '<div class="dtf-sum-total"><span>Total</span><b>' + formatMoney(o.total) + '</b></div>' + paymentText(o) + '</div>'
    + (o.note ? '<p class="dtf-muted"><b>Sua observação:</b> ' + esc(o.note) + '</p>' : ''), footer: '<button type="button" class="dtf-btn dtf-btn-primary" data-close>Fechar</button>' });
}
async function orderAgain(o) {
  const items = (o.items || []).filter(i => assetById(i.assetId)).map(i => ({ assetId: i.assetId, widthCm: Number(i.widthCm), heightCm: Number(i.heightCm), quantity: Number(i.quantity) }));
  const missing = (o.items || []).length - items.length;
  if (!items.length) { toast('As artes deste pedido foram excluídas da sua lista.', 'err'); return; }
  try {
    const film = await newFilm({ items, name: (o.name + ' (de novo)').slice(0, 80), width: o.filmWidthCm });
    state.filmId = film.id; setTab('film');
    toast(missing ? 'Filme criado. ' + missing + ' arte(s) que você excluiu ficaram de fora.' : 'Filme criado igual ao pedido #' + o.orderNumber + '. Mude o que quiser e envie.', missing ? 'info' : 'ok');
  } catch (error) { toast(friendly(error), 'err'); }
}
async function cancelOrder(o) {
  if (!await confirmDialog({ title: 'Cancelar o pedido #' + esc(o.orderNumber) + '?', text: 'O filme não será impresso. Se quiser de novo, use "Montar de novo".', ok: 'Cancelar pedido', danger: true })) return;
  const { error } = await sb.rpc('z19p_dtf_cancel_film', { p_film_id: o.id, p_reason: null });
  if (error) { toast(friendly(error), 'err'); await refreshOrders(); return; }
  toast('Pedido cancelado.'); await refreshOrders();
}

// Atualiza "Meus pedidos" sozinho (a cada 30 s com a página à vista) e ao voltar para a aba.
setInterval(() => { if (state.me && document.visibilityState === 'visible' && state.tab === 'orders' && !document.querySelector('.dtf-modal-back')) refreshOrders(); }, 30000);
// Os links das miniaturas valem 1 hora: renova antes de vencer.
setInterval(async () => { if (!state.me) return; try { await signPaths([...state.assets.map(a => a.thumb_path), ...state.orders.flatMap(o => (o.items || []).map(i => i.thumbPath))]); } catch { /* tenta na próxima */ } }, 20 * 60000);
document.addEventListener('visibilitychange', () => { if (state.me && document.visibilityState === 'visible') refreshOrders({ render: state.tab === 'orders' && !document.querySelector('.dtf-modal-back') }); });
sb.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT' && state.me) location.reload(); });

(async () => {
  const token = readInvite();
  if (token) { renderInvite(token); return; }
  const { data } = await sb.auth.getSession();
  if (!data?.session) { renderLogin(); return; }
  enter();
})();
