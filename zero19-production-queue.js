// Fila de produção da ZERO19 no 019 (2.17.90 · 05/11, dono: "quando fazemos um pedido no PDV, até mesmo que venha do site, na 019
// crie uma fila para podermos saber qual pedido está na frente para fazer e ir pela ordem, considerando prazo de entrega e frete que
// o cliente escolheu; PDV tem preferência se tiver que entregar próximo da data atual"; "no montar filme coloque um botão de ver
// próximos pedidos e destaque o que falta subir arte, produzir e tal"; "deixa mais organizado a fila de produção, destaque o que é
// PDV, o que foi no site").
// A ordem vem do banco (public.zero19_production_order_queue), igual ao "Próximo urgente" do QR da produção:
//   retirada = dia e hora da retirada · envio = último dia de postar para o frete escolhido chegar no dia que o cliente viu
//   (feriados e horários de postagem das Regras de frete) · data alterada pela equipe vale como está.
//   Atrasados primeiro; no mesmo dia o PDV vai na frente; pedido em espera (QR) vai para o fim.
// Só leitura: aqui nada muda pedido, etapa, estoque ou filme.

const SP = 'America/Sao_Paulo';
const keyFormat = new Intl.DateTimeFormat('en-CA', {timeZone: SP, year: 'numeric', month: '2-digit', day: '2-digit'});
const dayFormat = new Intl.DateTimeFormat('pt-BR', {timeZone: SP, weekday: 'short', day: '2-digit', month: '2-digit'});
const timeFormat = new Intl.DateTimeFormat('pt-BR', {timeZone: SP, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[c]));
const validDate = value => { const date = value instanceof Date ? value : new Date(value); return Number.isFinite(date.getTime()) ? date : null; };

export const spKey = value => { const date = validDate(value); return date ? keyFormat.format(date) : ''; };
const shiftKey = (key, days) => new Date(Date.parse(key + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
export const dayLabel = key => key ? dayFormat.format(new Date(key + 'T12:00:00-03:00')).replace('.', '').replace(/^./, c => c.toUpperCase()) : '';
const hourLabel = value => { const date = validDate(value); return date ? timeFormat.format(date).replace(':00', 'h').replace(':', 'h') : ''; };

/** Pedido do PDV, do site ou da Venduss: rótulo grande no cartão. */
export function originInfo(queue) {
  const origin = String(queue?.origin || '').toUpperCase();
  if (!origin) return null;
  if (origin === 'PDV') return {key: 'pdv', label: 'PDV · LOJA'};
  if (origin === 'SITE') return {key: 'site', label: 'SITE'};
  if (origin === 'VENDUSS') return {key: 'venduss', label: 'VENDUSS'};
  return {key: 'other', label: origin};
}

/** Prazo do pedido na fila: título, dia/hora e o tom (late, today, soon, ok). */
export function queueDue(queue, now = new Date()) {
  if (!queue) return null;
  const today = spKey(now), tomorrow = shiftKey(today, 1);
  const when = key => key === today ? 'Hoje' : key === tomorrow ? 'Amanhã' : dayLabel(key);
  const tone = key => !key ? 'today' : key < today ? 'late' : key === today ? 'today' : key === tomorrow ? 'soon' : 'ok';
  const freight = [queue.freight_name, queue.customer_date ? 'cliente espera ' + dayLabel(queue.customer_date) : ''].filter(Boolean).join(' · ');
  const dueKey = spKey(queue.due_at), dueLate = validDate(queue.due_at) && validDate(queue.due_at).getTime() < now.getTime();
  if (queue.kind === 'PICKUP' || queue.kind === 'MANUAL') {
    const pickup = queue.pickup !== false && (queue.kind === 'PICKUP' || queue.pickup);
    const title = (pickup ? 'Retirada' : 'Enviar até') + (queue.kind === 'MANUAL' ? ' · data alterada' : '');
    if (!dueKey) return {title, main: 'Sem data', note: '', tone: 'ok'};
    return {title: dueLate ? 'Atrasado · ' + title.toLowerCase() : title, main: when(dueKey) + ' ' + hourLabel(queue.due_at), note: dueLate ? 'era ' + dayLabel(dueKey) : pickup ? '' : freight, tone: dueLate ? 'late' : tone(dueKey)};
  }
  if (queue.kind === 'SEND_LATE') return {title: 'Atrasado · enviar já', main: when(queue.dispatch) + ' até ' + queue.cutoff_hour + 'h', note: ['era até ' + dayLabel(queue.last_post), freight].filter(Boolean).join(' · '), tone: 'late'};
  if (queue.kind === 'SEND_BY') return {title: 'Enviar até', main: when(queue.send_by) + ' até ' + queue.cutoff_hour + 'h', note: freight, tone: tone(queue.send_by)};
  return {title: 'Enviar o quanto antes', main: when(queue.dispatch) + ' até ' + queue.cutoff_hour + 'h', note: 'prazo do frete a conferir no pedido', tone: 'today'};
}

const MISSING = [
  ['awaiting_release', 'Aguardando liberação', 'gray'],
  ['awaiting_art', 'Falta subir arte', 'red'],
  ['art_received', 'Falta organizar arte', 'amber'],
  ['awaiting_halftone', 'Falta halftone', 'amber'],
  ['awaiting_font', 'Falta escolher fonte', 'amber'],
  ['ready_production', 'Pronta · falta jogar no filme', 'violet'],
  ['production', 'No filme · falta prensar', 'orange'],
  ['ready_pickup', 'Pronta', 'green'],
];
/** O que falta em cada pedido, por aplicação (estampa/escrita). */
export function missingParts(items = []) {
  const count = new Map();
  for (const item of items) if (!['delivered', 'cancelled'].includes(item.stage)) count.set(item.stage, (count.get(item.stage) || 0) + Math.max(1, Number(item.quantity) || 1));
  return MISSING.filter(([stage]) => count.get(stage)).map(([stage, label, tone]) => ({stage, label, tone, count: count.get(stage)}));
}
export const missingChipsHTML = items => {
  const parts = missingParts(items);
  return parts.length ? '<div class="z19q-missing"><b>O que falta</b>' + parts.map(part => '<span class="z19q-miss z19q-' + part.tone + '">' + esc(part.label) + ' · ' + part.count + '</span>').join('') + '</div>' : '';
};

/** Cabeçalho da fila no cartão: posição, PDV/SITE e o prazo. */
export function queueHeadHTML(summary, now = new Date()) {
  const queue = summary.queue;
  if (!queue) return '';
  const origin = originInfo(queue), due = queueDue(queue, now), held = Boolean(queue.held_until);
  return '<div class="z19q-head z19q-tone-' + (held ? 'held' : due?.tone || 'ok') + '">'
    + '<span class="z19q-pos">' + (held ? 'Em espera' : 'Nº ' + esc(queue.position) + '<small>na fila</small>') + '</span>'
    + (origin ? '<span class="z19q-origin z19q-origin-' + origin.key + '">' + esc(origin.label) + '</span>' : '')
    + (due ? '<span class="z19q-due"><small>' + esc(due.title) + '</small><strong>' + esc(due.main) + '</strong>' + (due.note ? '<em>' + esc(due.note) + '</em>' : '') + '</span>' : '')
    + '</div>';
}

/** Ordem da fila: quem precisa produzir pela posição do banco; pronto para retirada depois. Ordem antiga vale no empate. */
export function sortByQueue(summaries = []) {
  const open = row => !['ready_pickup', 'delivered', 'cancelled'].includes(row.stage);
  return summaries.slice().sort((a, b) => {
    if (open(a) !== open(b)) return open(a) ? -1 : 1;
    const pa = Number(a.queue?.position) || 0, pb = Number(b.queue?.position) || 0;
    if (pa && pb) return pa - pb;
    if (pa || pb) return pa ? -1 : 1;
    return 0;
  });
}

/** Filtro PDV / Site / Venduss. */
export const matchesOrigin = (summary, origin) => !origin || origin === 'all' || originInfo(summary.queue)?.key === origin;

export const queueStyles = `
.z19q-head{display:flex;flex-wrap:wrap;align-items:stretch;gap:8px;margin-top:2px}
.z19q-pos{display:flex;flex-direction:column;justify-content:center;min-width:64px;border-radius:14px;background:#0f172a;color:#fff;padding:6px 10px;font-size:20px;font-weight:900;line-height:1;text-align:center}
.z19q-pos small{display:block;margin-top:2px;font-size:10px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#cbd5e1}
.z19q-origin{display:flex;align-items:center;border-radius:14px;padding:6px 12px;font-size:15px;font-weight:900;letter-spacing:.3px;border:3px solid currentColor}
.z19q-origin-pdv{background:#ffedd5;color:#9a3412}
.z19q-origin-site{background:#dbeafe;color:#1e3a8a}
.z19q-origin-venduss{background:#ede9fe;color:#4c1d95}
.z19q-origin-other{background:#f1f5f9;color:#334155}
.z19q-due{display:flex;flex:1 1 180px;flex-direction:column;min-width:0;border-radius:14px;padding:6px 10px;background:#ecfdf5;color:#064e3b;border:2px solid #6ee7b7}
.z19q-due small{font-size:11px;font-weight:900;letter-spacing:.3px;text-transform:uppercase}
.z19q-due strong{font-size:17px;font-weight:900;line-height:1.15}
.z19q-due em{font-style:normal;font-size:12px;font-weight:700;overflow-wrap:anywhere}
.z19q-tone-late .z19q-due{background:#fee2e2;color:#7f1d1d;border-color:#ef4444}
.z19q-tone-today .z19q-due{background:#ffedd5;color:#7c2d12;border-color:#fb923c}
.z19q-tone-soon .z19q-due{background:#fef9c3;color:#713f12;border-color:#facc15}
.z19q-tone-held .z19q-due{background:#f1f5f9;color:#334155;border-color:#cbd5e1}
.z19q-tone-held .z19q-pos{background:#64748b}
.z19q-missing{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.z19q-missing b{font-size:11px;font-weight:900;letter-spacing:.4px;text-transform:uppercase;color:#475569}
.z19q-miss{display:inline-flex;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:900;line-height:1.2;max-width:100%;overflow-wrap:anywhere}
.z19q-red{background:#fecaca;color:#7f1d1d;box-shadow:inset 0 0 0 2px #f87171}
.z19q-amber{background:#fde68a;color:#451a03}
.z19q-violet{background:#ddd6fe;color:#2e1065}
.z19q-orange{background:#fed7aa;color:#431407}
.z19q-green{background:#bbf7d0;color:#052e16}
.z19q-gray{background:#e2e8f0;color:#1e293b}
.z19q-origin-filter{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}
.z19q-origin-filter button{min-height:44px;border-radius:999px;border:2px solid #cbd5e1;background:#fff;color:#0f172a;padding:6px 14px;font-weight:900;cursor:pointer}
.z19q-origin-filter button[aria-pressed="true"]{background:#0f172a;border-color:#0f172a;color:#fff}
.z19q-rule{margin:0 0 10px;color:#475569;font-size:13px;font-weight:700}
.z19q-next{width:min(960px,calc(100vw - 24px));max-height:calc(100dvh - 24px);display:flex;flex-direction:column;overflow:hidden;background:#f8fafc;color:#0f172a}
.z19q-next .modal-head h2,.z19q-next .modal-head p{color:#0f172a}
.z19q-next-list{display:grid;gap:10px;min-height:0;overflow-y:auto;overflow-x:hidden;padding:2px}
.z19q-next-row{display:grid;gap:8px;border-radius:18px;background:#fff;border:1px solid #e2e8f0;padding:12px;box-shadow:0 4px 14px rgba(15,23,42,.06)}
.z19q-next-row.is-current{box-shadow:0 0 0 3px #f97316}
.z19q-next-title{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 10px;min-width:0}
.z19q-next-title strong{font-size:16px;font-weight:900}
.z19q-next-title span{font-size:14px;font-weight:700;color:#334155;overflow-wrap:anywhere}
.z19q-next-actions{display:flex;flex-wrap:wrap;gap:8px}
.z19q-next-actions .btn{min-height:44px}
.z19q-next-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-top:10px}
.z19q-next-empty{padding:24px;text-align:center;font-weight:800;color:#475569}
.z19-upload-done{position:fixed;left:50%;bottom:16px;z-index:13000;transform:translateX(-50%);display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;width:min(900px,calc(100vw - 24px));border-radius:20px;background:#0f172a;color:#fff;padding:12px 14px;box-shadow:0 18px 40px rgba(0,0,0,.35)}
.z19-upload-done>span{flex:1 1 220px;min-width:0;font-weight:900;overflow-wrap:anywhere}
.z19-upload-done>span small{display:block;font-weight:700;color:#cbd5e1}
.z19-upload-done .btn{min-height:44px}
.z19-upload-quick-note{margin:0 0 10px;border-radius:14px;border:2px solid #86efac;background:#f0fdf4;color:#14532d;padding:10px 12px;font-weight:800}
@media(max-width:560px){.z19q-pos{min-width:56px;font-size:18px}.z19q-origin{font-size:13px;padding:5px 9px}.z19q-due strong{font-size:15px}.z19-upload-done{bottom:8px}}
`;
