// 2.17.95 (12/11, dono: "quando eu for subir a arte, em cada arte que eu subir permita identificar de qual pedido ela é pelo número
// do pedido, pelo telefone ou pelo nome do cliente; quando eu selecionar o pedido abra modal perguntando em qual posição é, sempre
// mostrando as opções que já foram cadastradas no pedido quando tirou no PDV; no caso de outra arte no mesmo upload tenho que
// identificar, mas já disponibilizar o pedido achado da outra arte como atalho e a posição faltante; se eu quiser pesquisar também pode").
// Janela de uma arte: atalhos (pedidos já escolhidos neste envio, com a posição que falta) + busca → posição do pedido.
// Devolve {order, group} (order = posições do pedido, como orderArtPositions), {none:true} (sem pedido) ou null (fechou).
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
const cmText = value => String(Math.round(Number(value) * 10) / 10).replace('.', ',');
const measure = group => group.widthCm > 0 ? `${cmText(group.widthCm)} cm de largura` : group.heightCm > 0 ? `${cmText(group.heightCm)} cm de altura` : 'medida a conferir';
const clientOf = order => order?.workspace?.client_name || order?.workspace?.company_name || 'Cliente';

const CSS = `
.uao-back{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:12px;background:rgba(15,23,42,.55)}
.uao{display:flex;flex-direction:column;width:min(640px,100%);max-height:calc(100dvh - 24px);overflow:hidden;border-radius:22px;background:#f6f7fb;color:#0f172a;box-shadow:0 24px 60px rgba(0,0,0,.35)}
.uao-head{display:flex;gap:12px;align-items:center;padding:14px 16px;background:#0f172a;color:#fff}
.uao-head img{width:64px;height:64px;flex:0 0 64px;object-fit:contain;border-radius:12px;background:#fff linear-gradient(45deg,#e5e7eb 25%,transparent 25%,transparent 75%,#e5e7eb 75%) 0 0/12px 12px}
.uao-head div{min-width:0;flex:1}.uao-head small{display:block;font-size:11px;font-weight:900;letter-spacing:.08em;color:#fdba74}
.uao-head h2{margin:2px 0 0;font-size:19px;line-height:1.2;color:#fff}
.uao-head button{flex:0 0 auto;width:42px;height:42px;border:0;border-radius:12px;background:#1e293b;color:#fff;font-size:20px;font-weight:900;cursor:pointer}
.uao-body{display:grid;gap:12px;padding:14px 16px 16px;overflow-y:auto}
.uao-label{margin:0;font-size:12px;font-weight:900;letter-spacing:.06em;color:#475569;text-transform:uppercase}
.uao-card{display:grid;gap:3px;width:100%;padding:12px 14px;border:2px solid #e2e8f0;border-radius:14px;background:#fff;color:#0f172a;text-align:left;cursor:pointer;font:inherit}
.uao-card:hover,.uao-card:focus-visible{border-color:#ff6428;outline:none;box-shadow:0 0 0 3px rgba(255,100,40,.15)}
.uao-card b{font-size:16px;font-weight:900}.uao-card span{font-size:14px;font-weight:700;color:#334155}.uao-card small{font-size:12px;font-weight:700;color:#64748b}
.uao-card.is-shortcut{border-color:#fdba74;background:#fff7ed}
.uao-card .uao-missing{display:inline-block;width:fit-content;margin-top:3px;padding:3px 9px;border-radius:999px;background:#ff6428;color:#111;font-size:12px;font-weight:900}
.uao-card .uao-done{display:inline-block;width:fit-content;margin-top:3px;padding:3px 9px;border-radius:999px;background:#dcfce7;color:#14532d;font-size:12px;font-weight:900}
.uao-search{position:relative}.uao-search input{width:100%;min-height:50px;box-sizing:border-box;padding:0 14px 0 40px;border:2px solid #cbd5e1;border-radius:14px;background:#fff;color:#0f172a;font-size:16px;font-weight:700}
.uao-search input:focus{outline:none;border-color:#ff6428;box-shadow:0 0 0 3px rgba(255,100,40,.18)}.uao-search span{position:absolute;left:13px;top:50%;transform:translateY(-50%);color:#64748b}
.uao-list{display:grid;gap:8px}.uao-empty{padding:14px;border:2px dashed #cbd5e1;border-radius:14px;text-align:center;font-weight:800;color:#475569;background:#fff}
.uao-pos{display:grid;gap:4px;width:100%;padding:14px;border:3px solid #e2e8f0;border-radius:16px;background:#fff;color:#0f172a;text-align:left;cursor:pointer;font:inherit}
.uao-pos b{font-size:18px;font-weight:900;text-transform:uppercase}.uao-pos span{font-size:14px;font-weight:800;color:#334155}
.uao-pos.is-missing{border-color:#ff6428;background:#fff7ed}.uao-pos.is-used{border-color:#cbd5e1;background:#f1f5f9}
.uao-pos em{display:inline-block;width:fit-content;font-style:normal;padding:3px 9px;border-radius:999px;font-size:12px;font-weight:900}
.uao-pos .tag-wait{background:#ff6428;color:#111}.uao-pos .tag-has{background:#e2e8f0;color:#334155}.uao-pos .tag-used{background:#0f172a;color:#fff}
.uao-pos:hover,.uao-pos:focus-visible{border-color:#ff6428;outline:none}
.uao-foot{display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between}
.uao-foot button{min-height:44px;padding:8px 14px;border:2px solid #cbd5e1;border-radius:12px;background:#fff;color:#0f172a;font:inherit;font-size:14px;font-weight:900;cursor:pointer}
.uao-error{margin:0;padding:10px 12px;border-radius:12px;background:#fef2f2;color:#7f1d1d;font-weight:800}
.uao-loading{padding:16px;text-align:center;font-weight:800;color:#475569}
`;

function ensureStyle(doc) {
  if (doc.getElementById('uao-style')) return;
  const style = doc.createElement('style');style.id = 'uao-style';style.textContent = CSS;doc.head.appendChild(style);
}

/** Posições que outras artes deste envio já pegaram, por pedido (project id → Set de chaves). */
export function usedPositions(items, orderOf, except) {
  const used = new Map();
  for (const item of items || []) {
    if (item === except) continue;
    const order = orderOf(item), key = item.positionKey;
    if (!order?.project?.id || !key) continue;
    if (!used.has(order.project.id)) used.set(order.project.id, new Set());
    used.get(order.project.id).add(key);
  }
  return used;
}

/** Atalhos: pedidos já escolhidos neste envio, com as posições que ainda esperam arte e ninguém pegou. */
export function orderShortcuts(orders, used) {
  const seen = new Map();
  for (const order of orders || []) if (order?.project?.id && !seen.has(order.project.id)) seen.set(order.project.id, order);
  return [...seen.values()].map(order => {
    const taken = used.get(order.project.id) || new Set();
    return {order, missing: (order.groups || []).filter(group => group.waiting > 0 && !taken.has(group.key))};
  });
}

export function openArtOrderPicker({shortcuts = [], used = new Map(), search, resolve, preview = '', title = 'Arte', allowNone = true, doc = document} = {}) {
  ensureStyle(doc);
  return new Promise(done => {
    const back = doc.createElement('div');back.className = 'uao-back';
    back.innerHTML = '<div class="uao" role="dialog" aria-modal="true" aria-labelledby="uao-title"><div class="uao-head">' + (preview ? '<img alt="" src="' + esc(preview) + '">' : '')
      + '<div><small>DE QUAL PEDIDO É ESTA ARTE?</small><h2 id="uao-title">' + esc(title) + '</h2></div><button type="button" data-uao-close aria-label="Fechar">×</button></div><div class="uao-body"></div></div>';
    const body = back.querySelector('.uao-body');
    let closed = false, timer = 0, request = 0;
    const finish = value => { if (closed) return;closed = true;clearTimeout(timer);back.remove();doc.removeEventListener('keydown', onKey, true);done(value); };
    const onKey = event => { if (event.key === 'Escape') { event.stopPropagation();finish(null); } };
    doc.addEventListener('keydown', onKey, true);
    back.addEventListener('click', event => { if (event.target === back) finish(null); });
    back.querySelector('[data-uao-close]').onclick = () => finish(null);

    const positions = (order, fromShortcut) => {
      const taken = used.get(order.project?.id) || new Set(), groups = order.groups || [];
      body.innerHTML = '<p class="uao-label">Pedido #' + esc(order.orderNo) + ' · ' + esc(clientOf(order)) + '</p><h3 style="margin:0;font-size:20px">Em qual posição vai esta arte?</h3>'
        + (groups.length ? '<div class="uao-list">' + groups.map((group, index) => {
          const isUsed = taken.has(group.key), isMissing = group.waiting > 0 && !isUsed;
          return '<button type="button" class="uao-pos' + (isMissing ? ' is-missing' : isUsed ? ' is-used' : '') + '" data-uao-pos="' + index + '"><b>' + esc(group.label) + '</b><span>' + esc(measure(group)) + ' · ' + group.qty + ' camisa' + (group.qty === 1 ? '' : 's') + '</span>'
            + (isUsed ? '<em class="tag-used">Outra arte deste envio já vai aqui</em>' : group.waiting > 0 ? '<em class="tag-wait">Esperando arte</em>' : '<em class="tag-has">Já tem arte · esta troca</em>') + '</button>';
        }).join('') + '</div>'
          : '<p class="uao-empty">Este pedido não tem estampa esperando arte (só nome e número, ou já entregue). A arte fica salva no cliente.</p>')
        + '<div class="uao-foot"><button type="button" data-uao-back>← ' + (fromShortcut ? 'Outro pedido' : 'Voltar à busca') + '</button>' + (groups.length ? '' : '<button type="button" data-uao-keep>Salvar só no cliente</button>') + '</div>';
      body.querySelectorAll('[data-uao-pos]').forEach(button => button.onclick = () => finish({order, group: groups[Number(button.dataset.uaoPos)]}));
      body.querySelector('[data-uao-back]').onclick = () => home();
      body.querySelector('[data-uao-keep]')?.addEventListener('click', () => finish({order, group: null}));
      body.querySelector('.uao-pos.is-missing, .uao-pos')?.focus();
    };

    const open = async row => {
      body.innerHTML = '<p class="uao-loading">Abrindo o pedido #' + esc(row.display_id || '') + '…</p>';
      try { const order = await resolve(row);if (closed) return;positions(order, false); }
      catch (error) { if (closed) return;home();const note = doc.createElement('p');note.className = 'uao-error';note.textContent = error?.message || 'Não foi possível abrir este pedido.';body.prepend(note); }
    };

    const home = (query = '') => {
      body.innerHTML = (shortcuts.length ? '<p class="uao-label">Pedidos deste envio</p><div class="uao-list">' + shortcuts.map((item, index) => '<button type="button" class="uao-card is-shortcut" data-uao-short="' + index + '"><b>Pedido #' + esc(item.order.orderNo) + ' · ' + esc(clientOf(item.order)) + '</b>'
        + (item.missing.length ? '<span class="uao-missing">Falta: ' + esc(item.missing.map(group => group.label).join(' · ')) + '</span>' : '<span class="uao-done">Todas as posições já têm arte</span>') + '</button>').join('') + '</div>' : '')
        + '<p class="uao-label">Buscar pedido</p><label class="uao-search"><span aria-hidden="true">🔎</span><input type="search" data-uao-q autocomplete="off" enterkeyhint="search" placeholder="Número do pedido, nome ou WhatsApp" aria-label="Número do pedido, nome do cliente ou WhatsApp" value="' + esc(query) + '"></label><div class="uao-list" data-uao-results></div>'
        + (allowNone ? '<div class="uao-foot"><button type="button" data-uao-none>Não é de pedido · só biblioteca</button></div>' : '');
      body.querySelectorAll('[data-uao-short]').forEach(button => button.onclick = () => positions(shortcuts[Number(button.dataset.uaoShort)].order, true));
      body.querySelector('[data-uao-none]')?.addEventListener('click', () => finish({none: true}));
      const input = body.querySelector('[data-uao-q]'), results = body.querySelector('[data-uao-results]');
      const run = async () => {
        const term = input.value.trim(), mine = ++request;
        if (!term) { results.innerHTML = '<p class="uao-empty">Digite o número do pedido, o nome ou o WhatsApp do cliente.</p>';return; }
        results.innerHTML = '<p class="uao-loading">Buscando…</p>';
        try {
          const rows = await search(term);if (closed || mine !== request) return;
          results.innerHTML = rows.length ? rows.map((row, index) => '<button type="button" class="uao-card" data-uao-row="' + index + '"><b>Pedido #' + esc(row.display_id || String(row.order_id || '').slice(0, 8)) + ' · ' + esc(row.customer_name || 'Cliente') + '</b><span>' + esc(row.whatsapp || 'Sem WhatsApp') + '</span>'
            + '<small>' + esc([row.created_at ? new Date(row.created_at).toLocaleDateString('pt-BR') : '', row.personalization_count ? row.personalization_count + ' personalização(ões)' : ''].filter(Boolean).join(' · ')) + '</small></button>').join('')
            : '<p class="uao-empty">Nenhum pedido encontrado para "' + esc(term) + '".</p>';
          results.querySelectorAll('[data-uao-row]').forEach(button => button.onclick = () => void open(rows[Number(button.dataset.uaoRow)]));
        } catch (error) { if (!closed && mine === request) results.innerHTML = '<p class="uao-error">' + esc(error?.message || 'Busca indisponível agora.') + '</p>'; }
      };
      input.addEventListener('input', () => { clearTimeout(timer);timer = setTimeout(run, 280); });
      input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault();clearTimeout(timer);void run(); } });
      void run();
      setTimeout(() => { if (!closed) input.focus(); }, 30);
    };
    doc.body.appendChild(back);home();
  });
}
