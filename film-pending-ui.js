// 2.17.94 (12/11, dono: "no modal de Aguardando produção melhore o layout, mais visual e mais funcional; as mini imagens estão
// demorando muito para abrir; coloque uma barra de pesquisa para pesquisar nome do cliente, número do pedido ou número de
// WhatsApp para achar as artes deste pedido ou cliente para colocar no filme").
// Só a janela: o que entra no filme, as medidas, a fila e a exportação não mudam.
//  - Miniaturas: antes cada uma baixava o PNG de impressão inteiro (8 a 16 MB). Agora pede ao Supabase uma imagem pequena
//    (240 px, transparência mantida), só quando o cartão aparece na tela e no máximo 6 por vez; se falhar, usa o arquivo de sempre.
//  - Artes agrupadas por pedido (cabeçalho com cliente, pedido, WhatsApp e "Selecionar pedido inteiro"), sem mudar a ordem da
//    fila: a ordem dos pedidos é a da primeira arte de cada um. Só a ordem visual muda (CSS order), os índices continuam os mesmos.
//  - Busca por nome do cliente, número do pedido ou WhatsApp (sem acento, com ou sem 55/DDD). Com busca, "Selecionar todos"
//    marca só o que foi encontrado.
export const PENDING_THUMB_PX = 240;
const PRIVATE_BUCKETS = new Set(['z19p-private', 'venduss-print-artworks']);
const PREVIEW_BUCKETS = new Set(['z19p-private', 'z19p-assets', 'venduss-print-artworks']);
const thumbCache = new Map();

export const pendingFold = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const digitsOf = value => String(value ?? '').replace(/\D/g, '');
const stripCountry = digits => digits.length >= 12 && digits.startsWith('55') ? digits.slice(2) : digits;

function projectOf(row) { return row?.summary?.project || row?.project || null; }
function workspaceOf(row) { return row?.summary?.workspace || row?.workspace || null; }

export function pendingOrderNumber(row) {
  const project = projectOf(row), payload = project?.official_order_payload || {};
  return String(payload.display_id || project?.official_order_ref || row?.order_number || '').replace(/^#/, '');
}

function payloadCustomer(row) {
  const payload = projectOf(row)?.official_order_payload || {}, customer = payload.customer || payload.client || {};
  return {
    name: customer.name || customer.full_name || payload.customer_name || payload.client_name || '',
    phone: customer.whatsapp || customer.phone || customer.mobile || payload.customer_whatsapp || payload.customer_phone || payload.whatsapp || payload.phone || '',
  };
}

export function pendingCustomer(entry) {
  const row = entry?.row || {}, workspace = workspaceOf(row) || {}, payload = payloadCustomer(row);
  const name = workspace.client_name || payload.name || row.client_name || workspace.company_name || row.companyName || row.company_name
    || String(entry?.title || '').split(' · ')[0] || 'Cliente';
  const phone = workspace.phone || workspace.whatsapp || payload.phone || row.client_phone || row.customer_phone || row.phone || '';
  return {name: String(name), phone: String(phone || ''), order: pendingOrderNumber(row)};
}

export function formatPendingPhone(phone) {
  const digits = stripCountry(digitsOf(phone));
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return phone ? String(phone) : '';
}

export function pendingSearchIndex(entry) {
  const row = entry?.row || {}, workspace = workspaceOf(row) || {}, customer = pendingCustomer(entry), payload = payloadCustomer(row);
  const text = [entry?.title, entry?.detail, entry?.note, customer.name, workspace.client_name, workspace.company_name, row.company_name, row.companyName, payload.name, row.project_title, customer.order && 'pedido ' + customer.order]
    .filter(Boolean).join(' | ');
  const phones = [customer.phone, workspace.phone, workspace.whatsapp, payload.phone].map(digitsOf).filter(Boolean);
  return {text: pendingFold(text), phones: [...new Set(phones.flatMap(digits => [digits, stripCountry(digits)]))], order: digitsOf(customer.order)};
}

/** Cada palavra da busca precisa aparecer (nome, pedido ou WhatsApp). Número com 3+ dígitos também procura no WhatsApp e no pedido. */
export function pendingMatches(index, query) {
  const words = pendingFold(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  return words.every(word => {
    const clean = word.replace(/^#/, ''), digits = digitsOf(clean);
    if (index.text.includes(clean)) return true;
    if (digits && digits.length === clean.replace(/[()\-.+]/g, '').length) {
      if (index.order && index.order.includes(digits)) return true;
      if (digits.length >= 3) { const local = stripCountry(digits); return index.phones.some(phone => phone.includes(local)); }
    }
    return false;
  });
}

export function pendingGroupKey(entry) {
  const row = entry?.row || {};
  return String(row.project?.id || row.summary?.project?.id || row.project_id || row.quote_id || row.company_order_id || entry?.key || '');
}

/** Pedidos na ordem em que aparecem (a primeira arte de cada pedido decide a posição). */
export function groupPendingEntries(entries) {
  const groups = new Map();
  entries.forEach((entry, index) => {
    const key = pendingGroupKey(entry);
    if (!groups.has(key)) groups.set(key, {key, indexes: [], customer: pendingCustomer(entry)});
    groups.get(key).indexes.push(index);
  });
  return [...groups.values()];
}

/** De onde sai a miniatura: arquivo da aplicação vendida (site/PDV) ou arte da biblioteca. */
export function pendingThumbSource(entry, {isPrivatePath} = {}) {
  const row = entry?.row || {}, production = row.metadata?.details?.[0]?.production || {};
  if (['vdr', 'venduss', 'art'].includes(entry?.kind)) {
    const path = production.file_path || row.source_file_path;
    if (path && PREVIEW_BUCKETS.has(production.storage_bucket)) return {bucket: production.storage_bucket, path};
    // Arte subida pelo "Subir arte" do pedido sem posição: o arquivo é o da arte da biblioteca (asset_id).
    const asset = entry.assetPath;
    return asset ? {bucket: isPrivatePath?.(asset) ? 'z19p-private' : 'z19p-assets', path: asset} : null;
  }
  const path = entry?.kind === 'placed' ? (row.asset?.thumbnail_path || row.asset?.processed_path || row.asset?.original_path)
    : entry?.kind === 'generic' ? (row.processed_path || row.original_path) : null;
  if (!path || /^(data|blob|https?):/i.test(path)) return null;
  return {bucket: isPrivatePath?.(path) ? 'z19p-private' : 'z19p-assets', path};
}

export async function pendingThumbUrl(supabase, source) {
  if (!supabase?.storage || !source?.path) return '';
  const key = source.bucket + '\n' + source.path, hit = thumbCache.get(key);
  if (hit && (hit.expiresAt === Infinity || hit.expiresAt > Date.now() + 60000)) return hit.url;
  const transform = {width: PENDING_THUMB_PX, height: PENDING_THUMB_PX, resize: 'contain', quality: 70};
  if (!PRIVATE_BUCKETS.has(source.bucket)) {
    const url = supabase.storage.from(source.bucket).getPublicUrl(source.path, {transform})?.data?.publicUrl || '';
    if (url) thumbCache.set(key, {url, expiresAt: Infinity});
    return url;
  }
  const {data, error} = await supabase.storage.from(source.bucket).createSignedUrl(source.path, 1800, {transform});
  if (error || !data?.signedUrl) throw error || new Error('Sem link da miniatura.');
  thumbCache.set(key, {url: data.signedUrl, expiresAt: Date.now() + 1800 * 1000});
  return data.signedUrl;
}

function searchIndexFor(customer, extra = []) {
  const phone = digitsOf(customer?.phone);
  return {text: pendingFold([customer?.name, customer?.order && 'pedido ' + customer.order, ...extra].filter(Boolean).join(' | ')), phones: phone ? [...new Set([phone, stripCountry(phone)])] : [], order: digitsOf(customer?.order)};
}

/** Desfaz o "Arte já impressa": por pedido, as personalizações (sale ids) e as posições (placements) que tinham saído da fila. */
export async function undoPendingPrinted(picked, undo) {
  const byProject = new Map();
  for (const entry of picked) {
    const row = entry.row || {}, project = row.project_id || row.project?.id || row.summary?.project?.id || row.placement?.project_id || null;
    if (!project) continue;if (!byProject.has(project)) byProject.set(project, {sales: new Set(), placements: new Set()});
    const bucket = byProject.get(project);
    if (entry.kind === 'placed') { if (row.placement?.id) bucket.placements.add(row.placement.id); } else if (row.personalization_sale_id) bucket.sales.add(row.personalization_sale_id);
  }
  for (const [project, {sales, placements}] of byProject) await undo(project, [...sales], [...placements]);
}

function canMarkPrinted(group, entries) { return group.indexes.some(index => entries[index].kind !== 'generic' && !entries[index].completed); }

/** Tira o pedido da fila como se o filme tivesse sido gerado (mesma função do banco da exportação): etapa "em produção". */
export async function markPendingPrinted(supabase, picked) {
  const byProject = new Map();
  for (const entry of picked) {
    const row = entry.row || {}, project = row.project_id || row.project?.id || row.summary?.project?.id || row.placement?.project_id || null;
    const key = project || 'none';if (!byProject.has(key)) byProject.set(key, {project, sales: new Set(), placements: new Set()});
    const bucket = byProject.get(key);
    if (entry.kind === 'placed') { if (row.placement?.id) bucket.placements.add(row.placement.id); }
    else if (row.personalization_sale_id) bucket.sales.add(row.personalization_sale_id);
  }
  let total = 0;
  for (const {project, sales, placements} of byProject.values()) {
    if (!sales.size && !placements.size) throw new Error('Esta arte não tem vínculo com o pedido. Coloque no filme e gere o arquivo.');
    const {data, error} = await supabase.rpc('z19p_mark_selected_order_production', {p_project_ids: project ? [project] : [], p_placement_ids: [...placements], p_sale_ids: [...sales]});
    if (error) throw error;
    total += Number(data?.personalizations || 0) + Number(data?.placements || 0);
  }
  return total;
}

const CSS = `
.film-pending-modal.fpu{width:min(1040px,calc(100vw - 20px))!important;background:#f6f7fb}
.fpu .fpu-search{display:grid;gap:6px;padding:10px 2px 8px;border-bottom:1px solid #e2e8f0;background:#f6f7fb}
.fpu .fpu-search-box{position:relative;display:flex;align-items:center}
.fpu .fpu-search-box>span{position:absolute;left:13px;font-size:17px;color:#64748b;pointer-events:none}
.fpu .fpu-search input{width:100%;min-height:50px;padding:0 44px 0 40px;border:2px solid #cbd5e1;border-radius:14px;background:#fff;color:#0f172a;font-size:16px;font-weight:700;box-sizing:border-box}
.fpu .fpu-search input:focus{outline:none;border-color:#ff6428;box-shadow:0 0 0 3px rgba(255,100,40,.18)}
.fpu .fpu-clear{position:absolute;right:6px;width:38px;height:38px;border:0;border-radius:10px;background:#e2e8f0;color:#0f172a;font-size:18px;font-weight:900;cursor:pointer}
.fpu .fpu-summary{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12px;font-weight:800;color:#475569}
.fpu .fpu-summary b{padding:3px 9px;border-radius:999px;background:#fff;border:1px solid #e2e8f0;color:#0f172a}
.fpu .film-pending-list{gap:8px!important;padding:8px 2px 12px;align-content:start;grid-template-columns:minmax(0,1fr)}
.fpu .film-pending-list{grid-auto-rows:max-content}
.fpu .film-pending-list>*,.fpu .fpu-waiting>*{min-height:max-content}
.fpu .fpu-order{display:grid;grid-auto-rows:max-content;gap:8px;padding:0 0 10px;border:3px solid #0f172a;border-radius:18px;background:#f1f5f9}
.fpu .fpu-order>.fpu-group{border-radius:15px 15px 0 0}
.fpu .fpu-waiting{display:grid;grid-auto-rows:max-content;gap:8px}.fpu .fpu-waiting[hidden]{display:none!important}
.fpu .fpu-waiting-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:52px;margin-top:6px;padding:10px 14px;border:3px solid #f59e0b;border-radius:16px;background:#fffbeb;color:#78350f;font:inherit;font-size:15px;font-weight:900;text-align:left;cursor:pointer}
.fpu .fpu-waiting-bar span{flex:0 0 auto;padding:6px 12px;border-radius:10px;background:#f59e0b;color:#111;font-size:13px}
.fpu .fpu-order.fpu-only-missing{border-color:#f59e0b}
.fpu .fpu-order.fpu-finished{border-color:#16a34a;opacity:.85}
.fpu .fpu-order>.film-pending-row,.fpu .fpu-order>.film-pending-application,.fpu .fpu-order>.fpu-missing{margin:0 10px}
.fpu .fpu-order .film-pending-copy>b{display:none}
.fpu .fpu-group{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:10px 12px;background:#0f172a;color:#fff}
.fpu .fpu-only-missing>.fpu-group{background:#78350f}
.fpu .fpu-missing{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border:2px dashed #f59e0b;border-radius:14px;background:#fffbeb;color:#78350f}
.fpu .fpu-missing b{font-size:15px;font-weight:900}.fpu .fpu-missing ul{margin:4px 0 0;padding-left:18px;font-size:14px;font-weight:800}
.fpu .fpu-missing button{min-height:46px;padding:8px 16px;border:0;border-radius:12px;background:#f59e0b;color:#111;font-size:15px;font-weight:900;cursor:pointer}
.fpu .fpu-group .fpu-finish{background:#e0f2fe;color:#0c4a6e}
.fpu .fpu-group .fpu-undo{background:#fde68a;color:#78350f}
.fpu .fpu-group strong{font-size:16px;font-weight:900;line-height:1.2;overflow-wrap:anywhere}
.fpu .fpu-group .fpu-chip{padding:3px 9px;border-radius:999px;background:#ff6428;color:#111;font-size:13px;font-weight:900;white-space:nowrap}
.fpu .fpu-group .fpu-phone{padding:3px 9px;border-radius:999px;background:#1e293b;color:#bbf7d0;font-size:13px;font-weight:800;white-space:nowrap}
.fpu .fpu-group .fpu-count{font-size:12px;font-weight:700;color:#cbd5e1}
.fpu .fpu-actions{display:flex;flex-wrap:wrap;gap:6px;margin-left:auto}
.fpu .fpu-group button{min-height:40px;padding:6px 12px;border:0;border-radius:10px;background:#fff;color:#0f172a;font-size:13px;font-weight:900;cursor:pointer}
.fpu .fpu-group button:disabled{opacity:.55;cursor:default}
.fpu .fpu-group .fpu-add{background:#ff6428;color:#111}
.fpu .fpu-group .fpu-printed{background:#bbf7d0;color:#052e16}
.fpu .film-pending-row.is-in-film{background:#f0fdf4!important;color:#14532d}
.fpu [role=status][hidden]{display:none!important}
.fpu .fpu-printed-row{border-color:#16a34a!important;background:#f0fdf4!important;cursor:default}
.fpu .film-pending-copy>strong.fpu-printed-tag{display:inline-block;width:fit-content;padding:4px 9px;border-radius:8px;background:#15803d!important;color:#fff!important;font-size:12px;opacity:1}
.fpu img[data-fpu-full]{display:none!important}
.fpu .film-pending-preview img:not([data-fpu-full])+.fpu-loading{display:none}
.fpu .film-pending-row{grid-template-columns:26px 104px minmax(0,1fr)!important;gap:12px!important;padding:10px 12px!important;border:2px solid #e2e8f0;border-radius:14px;background:#fff;color:#0f172a;cursor:pointer;transition:border-color .12s,box-shadow .12s}
.fpu .film-pending-row:hover{border-color:#94a3b8}
.fpu .film-pending-row:has(input[data-entry]:checked){border-color:#ff6428;box-shadow:0 0 0 3px rgba(255,100,40,.16);background:#fff8f3}
.fpu .film-pending-row input[data-entry]{width:24px;height:24px;accent-color:#ff6428;cursor:pointer}
.fpu .film-pending-row.fpu-wide{grid-template-columns:26px minmax(0,1fr)!important}
.fpu .film-pending-preview:not(.fpu-writing){width:104px!important;height:104px!important;align-items:center;justify-content:center;border-radius:12px;border:1px solid #e2e8f0;background-color:#fff;background-image:linear-gradient(45deg,#e8ecf2 25%,transparent 25%),linear-gradient(-45deg,#e8ecf2 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e8ecf2 75%),linear-gradient(-45deg,transparent 75%,#e8ecf2 75%);background-size:14px 14px;background-position:0 0,0 7px,7px -7px,-7px 0}
.fpu .film-pending-preview:not(.fpu-writing) img{width:96px!important;height:96px!important;max-width:96px!important;max-height:96px!important;object-fit:contain}
.fpu .film-pending-preview small{font-size:11px;font-weight:800;color:#64748b;text-align:center}
.fpu .fpu-loading{display:block;width:100%;height:100%;border-radius:12px;background:linear-gradient(100deg,#eef2f7 30%,#f8fafc 50%,#eef2f7 70%);background-size:300% 100%;animation:fpu-shine 1.1s linear infinite}
@keyframes fpu-shine{to{background-position:-300% 0}}
.fpu .film-pending-copy>b{font-size:15px;line-height:1.25}
.fpu .film-pending-copy>span:not(.film-pending-preview){font-size:14px;font-weight:800}
.fpu .film-pending-copy>small{font-size:12px;color:#475569;font-weight:700}
.fpu .film-pending-copy>strong{display:inline-block;width:fit-content;padding:2px 9px;border-radius:999px;background:#e0f2fe;color:#075985;font-size:12px}
.fpu .film-pending-row [data-select-order]{display:none!important}
.fpu .fpu-empty{padding:28px 12px;text-align:center;font-size:15px;font-weight:800;color:#475569;background:#fff;border:2px dashed #cbd5e1;border-radius:14px}
@media (max-width:640px){.fpu .film-pending-row{grid-template-columns:24px 76px minmax(0,1fr)!important;gap:9px!important;padding:9px!important}
.fpu .film-pending-preview:not(.fpu-writing){width:76px!important;height:76px!important}.fpu .film-pending-preview:not(.fpu-writing) img{width:70px!important;height:70px!important;max-width:70px!important;max-height:70px!important}
.fpu .fpu-actions{margin-left:0;width:100%}.fpu .fpu-group button{flex:1 1 auto}}
`;

function ensureStyle(doc) {
  if (doc.getElementById('fpu-style')) return;
  const style = doc.createElement('style');style.id = 'fpu-style';style.textContent = CSS;doc.head.appendChild(style);
}

/**
 * Melhora a janela já montada. entries = a mesma lista da janela (índices de data-entry/data-preview).
 * fullUrl(entry) = o link de sempre (usado se a miniatura falhar).
 */
export function enhancePendingPicker({modal, entries, supabase, isPrivatePath, isCurrent = () => true, updateCount, markPrinted, undoPrinted, finishOrder, onUploadArt, pendingArt = [], onPrinted, onError, focusSearch = false, doc = document} = {}) {
  if (!modal || !entries || !entries.length && !pendingArt?.length) return null;
  ensureStyle(doc);
  const dialog = modal.querySelector('.film-pending-modal'), list = modal.querySelector('.film-pending-list');
  if (!dialog || !list) return null;
  dialog.classList.add('fpu');
  const rowOf = index => modal.querySelector('[data-entry="' + index + '"]')?.closest('.film-pending-row');
  // "Já está pronta" põe o cartão dentro de um envelope (.film-pending-application): a ordem e a busca valem para o envelope.
  const itemOf = index => { const row = rowOf(index), parent = row?.parentElement;return parent?.classList.contains('film-pending-application') ? parent : row; };
  entries.forEach((entry, index) => { entry.searchIndex = pendingSearchIndex(entry); if (entry.kind === 'font') { rowOf(index)?.classList.add('fpu-wide'); modal.querySelector('[data-preview="' + index + '"]')?.classList.add('fpu-writing'); } });

  const boxOf = index => modal.querySelector('[data-entry="' + index + '"]');
  const selectable = group => group.indexes.filter(index => !entries[index].alreadyInFilm && !entries[index].completed && boxOf(index) && !boxOf(index).disabled);
  const setBox = (index, value) => { const box = boxOf(index);if (!box || box.disabled || box.checked === value) return;box.checked = value;box.dispatchEvent(new Event('change', {bubbles: true})); };
  const toggleGroup = group => { const list = selectable(group), all = list.length > 0 && list.every(index => boxOf(index).checked);list.forEach(index => setBox(index, !all));syncGroups(); };
  const addGroup = group => {
    const list = selectable(group);if (!list.length) return;
    entries.forEach((_, index) => { if (!group.indexes.includes(index)) setBox(index, false); });
    list.forEach(index => setBox(index, true));
    modal.querySelector('[data-add-pending]')?.click();
  };
  const printedGroup = async group => {
    const list = group.indexes.filter(index => !entries[index].completed && entries[index].kind !== 'generic');
    if (!list.length || !markPrinted) return;
    const name = group.customer.name + (group.customer.order ? ' · Pedido #' + group.customer.order : '');
    if (!confirm('Marcar como IMPRESSO o pedido ' + name + '?\n\n' + list.length + ' arte(s) saem de Aguardando produção e ficam "Em produção" (mesmo que gerar o filme). Use só se já imprimiu estas artes.')) return;
    const button = group.head.querySelector('[data-fpu-printed]');if (button) { button.disabled = true;button.textContent = 'Tirando da fila…'; }
    try {
      await markPrinted(list.map(index => entries[index]));
      for (const index of list) {
        const entry = entries[index], row = rowOf(index), box = boxOf(index);entry.completed = true;
        if (box) { if (box.checked) setBox(index, false);box.checked = false;box.disabled = true; }
        if (row) { row.classList.add('fpu-printed-row');const tag = doc.createElement('strong');tag.className = 'fpu-printed-tag';tag.textContent = '✓ Impresso · saiu da fila (em produção)';row.querySelector('.film-pending-copy')?.appendChild(tag); }
      }
      group.printed = list;
      if (button) { button.textContent = '✓ Impresso · saiu da fila';if (undoPrinted) { const undo = doc.createElement('button');undo.type = 'button';undo.className = 'fpu-undo';undo.textContent = '↶ Desfazer';undo.onclick = event => { event.preventDefault();event.stopPropagation();void undoGroup(group, undo, button); };button.after(undo); } }
      syncGroups();onPrinted?.(group);
    } catch (error) {
      if (button) { button.disabled = false;button.textContent = '✓ Arte já impressa · tirar da fila'; }
      onError?.(error);
    }
  };
  // Desfazer o "Arte já impressa" (dono 12/11: "marquei errado, tem como desfazer?").
  const undoGroup = async (group, undo, printedButton) => {
    const list = group.printed || [];if (!list.length) return;
    undo.disabled = true;undo.textContent = 'Desfazendo…';
    try {
      await undoPendingPrinted(list.map(index => entries[index]), undoPrinted);
      for (const index of list) {
        const entry = entries[index], row = rowOf(index), box = boxOf(index);entry.completed = false;
        if (box) box.disabled = Boolean(entry.alreadyInFilm);
        if (row) { row.classList.remove('fpu-printed-row');row.querySelector('.fpu-printed-tag')?.remove(); }
      }
      group.printed = null;undo.remove();if (printedButton) { printedButton.disabled = false;printedButton.textContent = '✓ Arte já impressa · tirar da fila'; }
      syncGroups();onPrinted?.(group, {undone: true});
    } catch (error) { undo.disabled = false;undo.textContent = '↶ Desfazer';onError?.(error); }
  };
  // Pronto e entregue (dono 12/11): conclui o pedido inteiro e marca entregue (o mesmo dos Próximos pedidos).
  const finishGroup = async (group, button) => {
    if (!finishOrder) return;
    const name = group.customer.name + (group.customer.order ? ' · Pedido #' + group.customer.order : '');
    if (!confirm('Pedido ' + name + ' PRONTO E ENTREGUE?\n\nConclui todas as personalizações do pedido e marca como entregue: sai da fila e vai para Entregues (dá para reabrir no 019).')) return;
    button.disabled = true;button.textContent = 'Concluindo…';
    try {
      await finishOrder(group.key, true);
      for (const index of group.indexes) {
        const entry = entries[index], row = rowOf(index), box = boxOf(index);entry.completed = true;
        if (box) { if (box.checked) setBox(index, false);box.disabled = true; }
        row?.classList.add('fpu-printed-row');
      }
      group.section?.classList.add('fpu-finished');group.section?.querySelector('.fpu-missing')?.remove();
      button.textContent = '✓ Pronto e entregue';group.head.querySelectorAll('button').forEach(node => { node.disabled = true; });
      syncGroups();onPrinted?.(group, {finished: true});
    } catch (error) { button.disabled = false;button.textContent = '✓ Pronto e entregue';onError?.(error); }
  };
  const syncGroups = () => { for (const group of groups) { if (!group.selectButton || !group.indexes.length) continue;const list = selectable(group), all = list.length > 0 && list.every(index => boxOf(index).checked);
    group.selectButton.disabled = !list.length;group.selectButton.textContent = !list.length ? 'Já no filme' : all ? 'Desmarcar' : (list.length === 1 ? 'Selecionar' : 'Selecionar as ' + list.length);
    const add = group.head.querySelector('[data-fpu-add]');if (add) add.disabled = !list.length; } };

  // Um bloco por pedido (dono 12/11: "a faixa em cima do pedido parece uma coisa e a arte outra; mescle os módulos do mesmo pedido"):
  // cabeçalho + artes dentro da mesma moldura. Os cartões mudam de lugar no DOM, mas data-entry/data-preview continuam os mesmos.
  const groups = groupPendingEntries(entries);
  // Pedidos que ainda esperam arte (dono 12/11: "pedidos como o da Adriana estão sem arte: mostre no Aguardando produção mas deixe
  // pendente de subir arte, com botão para subir arte por lá mesmo"): entram no bloco do mesmo pedido ou num bloco próprio.
  for (const row of pendingArt || []) {
    const key = String(row?.projectId || '');if (!key || !row.groups?.length) continue;
    let group = groups.find(item => item.key === key);
    const customer = {name: row.workspace?.client_name || row.workspace?.company_name || 'Cliente', phone: row.workspace?.phone || '', order: String(row.orderNo || '')};
    if (!group) { group = {key, indexes: [], customer};groups.push(group); }
    group.missing = row.groups;group.missingIndex = searchIndexFor(customer, row.groups.map(item => item.label));
  }
  // Pedidos que só esperam arte ficam juntos numa seção que abre com um toque (ou sozinha na busca): com 60+ pedidos a lista
  // ficava só com as faixas dos cabeçalhos.
  const waitingBar = doc.createElement('button');waitingBar.type = 'button';waitingBar.className = 'fpu-waiting-bar';waitingBar.hidden = true;
  const waitingWrap = doc.createElement('div');waitingWrap.className = 'fpu-waiting';waitingWrap.hidden = true;
  let waitingCount = 0, waitingOpen = !entries.length;
  const paintWaiting = (shownWaiting = waitingCount) => {
    const searching = Boolean(input?.value.trim()), open = waitingOpen || searching && shownWaiting > 0;
    waitingWrap.hidden = !open;waitingBar.hidden = !waitingCount || searching && !shownWaiting;
    waitingBar.innerHTML = '';const label = doc.createElement('b');label.textContent = '⚠ ' + (searching ? shownWaiting + ' de ' : '') + waitingCount + (waitingCount === 1 ? ' pedido esperando arte' : ' pedidos esperando arte') + ' · subir a arte';
    const action = doc.createElement('span');action.textContent = open ? 'Esconder' : 'Mostrar';waitingBar.append(label, action);
  };
  for (const group of groups) {
    const section = doc.createElement('section');section.className = 'fpu-order' + (group.indexes.length ? '' : ' fpu-only-missing');
    const head = doc.createElement('div');head.className = 'fpu-group';
    const {name, phone, order: number} = group.customer, total = group.indexes.length;
    head.innerHTML = '<strong></strong>' + (number ? '<span class="fpu-chip"></span>' : '') + (phone ? '<span class="fpu-phone"></span>' : '') + '<span class="fpu-count"></span>';
    head.querySelector('strong').textContent = name;
    if (number) head.querySelector('.fpu-chip').textContent = 'Pedido #' + number;
    if (phone) head.querySelector('.fpu-phone').textContent = '☎ ' + formatPendingPhone(phone);
    const waiting = group.missing?.length || 0;
    head.querySelector('.fpu-count').textContent = [total ? total + (total === 1 ? ' arte pronta' : ' artes prontas') : '', waiting ? waiting + (waiting === 1 ? ' posição sem arte' : ' posições sem arte') : ''].filter(Boolean).join(' · ');
    const actions = doc.createElement('div');actions.className = 'fpu-actions';
    const zero19 = group.missing || group.indexes.some(index => entries[index].kind !== 'generic');
    actions.innerHTML = (total ? '<button type="button" data-fpu-select></button><button type="button" data-fpu-add class="fpu-add">＋ Pôr no filme</button>' : '')
      + (total && canMarkPrinted(group, entries) ? '<button type="button" data-fpu-printed class="fpu-printed">✓ Arte já impressa · tirar da fila</button>' : '')
      + (finishOrder && zero19 ? '<button type="button" data-fpu-finish class="fpu-finish">✓ Pronto e entregue</button>' : '');
    head.appendChild(actions);group.selectButton = actions.querySelector('[data-fpu-select]');
    actions.querySelector('[data-fpu-select]')?.addEventListener('click', event => { event.preventDefault();event.stopPropagation();toggleGroup(group); });
    actions.querySelector('[data-fpu-add]')?.addEventListener('click', event => { event.preventDefault();event.stopPropagation();addGroup(group); });
    actions.querySelector('[data-fpu-printed]')?.addEventListener('click', event => { event.preventDefault();event.stopPropagation();void printedGroup(group); });
    actions.querySelector('[data-fpu-finish]')?.addEventListener('click', event => { event.preventDefault();event.stopPropagation();void finishGroup(group, event.currentTarget); });
    section.appendChild(head);group.head = head;group.section = section;
    for (const index of group.indexes) { const item = itemOf(index);if (item) section.appendChild(item); }
    if (waiting) {
      const cm = value => String(Math.round(Number(value) * 10) / 10).replace('.', ',');
      const block = doc.createElement('div');block.className = 'fpu-missing';
      block.innerHTML = '<div><b>⚠ Falta subir arte</b><ul></ul></div>' + (onUploadArt ? '<button type="button" data-fpu-upload>⇧ Subir arte</button>' : '');
      const ul = block.querySelector('ul');
      for (const item of group.missing) { const li = doc.createElement('li');li.textContent = [item.label, item.widthCm > 0 ? cm(item.widthCm) + ' cm de largura' : item.heightCm > 0 ? cm(item.heightCm) + ' cm de altura' : '', item.qty + (item.qty === 1 ? ' camisa' : ' camisas')].filter(Boolean).join(' · ');ul.appendChild(li); }
      block.querySelector('[data-fpu-upload]')?.addEventListener('click', event => { event.preventDefault();event.stopPropagation();onUploadArt(group.customer.order, group); });
      section.appendChild(block);
    }
    if (group.indexes.length) list.appendChild(section);else { waitingWrap.appendChild(section);waitingCount++; }
  }
  if (waitingCount) {
    waitingBar.hidden = false;list.appendChild(waitingBar);list.appendChild(waitingWrap);
    waitingBar.onclick = event => { event.preventDefault();waitingOpen = !waitingOpen;paintWaiting(); };
  }

  // Busca.
  const search = doc.createElement('div');search.className = 'fpu-search';
  search.innerHTML = '<label class="fpu-search-box"><span aria-hidden="true">🔎</span><input type="search" data-fpu-search autocomplete="off" enterkeyhint="search" placeholder="Buscar cliente, nº do pedido ou WhatsApp" aria-label="Buscar por nome do cliente, número do pedido ou WhatsApp"><button type="button" class="fpu-clear" aria-label="Limpar busca" hidden>×</button></label><div class="fpu-summary" aria-live="polite"></div>';
  list.before(search);
  const input = search.querySelector('input'), clear = search.querySelector('.fpu-clear'), summary = search.querySelector('.fpu-summary');
  const empty = doc.createElement('div');empty.className = 'fpu-empty';empty.hidden = true;empty.style.order = '999999';list.appendChild(empty);
  const toggle = modal.querySelector('[data-select-all-pending]');
  let query = '';
  const visibleIndexes = () => entries.map((_, index) => index).filter(index => { const row = itemOf(index);return row && row.style.display !== 'none'; });
  const relabel = () => {
    if (!toggle || !query) return;
    const selectable = visibleIndexes().filter(index => !entries[index].alreadyInFilm && !entries[index].completed);
    const inputs = selectable.map(index => modal.querySelector('[data-entry="' + index + '"]'));
    const all = selectable.length > 0 && inputs.every(item => item?.checked);
    const text = all ? 'Desmarcar os encontrados' : 'Selecionar os ' + selectable.length + ' encontrados';
    if (toggle.textContent !== text) toggle.textContent = text;
    if (!toggle.disabled !== selectable.length > 0) toggle.disabled = !selectable.length;
  };
  const apply = () => {
    query = input.value.trim();clear.hidden = !query;
    let shown = 0;const shownGroups = new Set();
    for (const group of groups) {
      let any = false;
      for (const index of group.indexes) {
        const row = itemOf(index);if (!row) continue;
        const ok = pendingMatches(entries[index].searchIndex, query);
        row.style.display = ok ? '' : 'none';if (ok) { any = true;shown++; }
      }
      if (!any && group.missing && pendingMatches(group.missingIndex, query)) any = true;
      group.section.style.display = any ? '' : 'none';if (any) shownGroups.add(group.key);
    }
    paintWaiting(groups.filter(group => !group.indexes.length && group.section.style.display !== 'none').length);
    const totalGroups = groups.length;
    summary.innerHTML = '';
    const pill = text => { const node = doc.createElement('b');node.textContent = text;summary.appendChild(node); };
    if (query) { pill(shown + ' de ' + entries.length + ' artes');pill(shownGroups.size + (shownGroups.size === 1 ? ' pedido encontrado' : ' pedidos encontrados')); }
    else { pill(entries.length + (entries.length === 1 ? ' arte pronta' : ' artes prontas'));pill(totalGroups + (totalGroups === 1 ? ' pedido' : ' pedidos'));const waiting = groups.filter(group => group.missing?.length).length;if (waiting) pill(waiting + (waiting === 1 ? ' pedido sem arte' : ' pedidos sem arte')); }
    empty.hidden = shownGroups.size > 0;empty.textContent = 'Nada encontrado para "' + query + '". Confira o nome, o número do pedido ou o WhatsApp.';
    if (query) relabel(); else updateCount?.();
    syncGroups();
    observeThumbs();
  };
  input.addEventListener('input', apply);
  input.addEventListener('keydown', event => { if (event.key === 'Escape' && input.value) { event.stopPropagation();input.value = '';apply(); } if (event.key === 'Enter') event.preventDefault(); });
  clear.onclick = () => { input.value = '';apply();input.focus(); };
  // Com busca, "Selecionar todos" marca só o que apareceu (o resto da janela continua igual).
  modal.addEventListener('click', event => {
    if (!query || !toggle || event.target !== toggle && !toggle.contains(event.target)) return;
    event.stopPropagation();event.preventDefault();
    if (toggle.disabled) return;
    const indexes = visibleIndexes().filter(index => !entries[index].alreadyInFilm && !entries[index].completed);
    const all = indexes.length > 0 && indexes.every(index => modal.querySelector('[data-entry="' + index + '"]')?.checked);
    for (const index of indexes) { const box = modal.querySelector('[data-entry="' + index + '"]');if (!box || box.disabled || box.checked === !all) continue;box.checked = !all;box.dispatchEvent(new Event('change', {bubbles: true})); }
    relabel();
  }, true);
  if (toggle) new MutationObserver(() => relabel()).observe(toggle, {childList: true, characterData: true, subtree: true});
  modal.addEventListener('change', () => queueMicrotask(() => { relabel();syncGroups(); }));

  // Miniaturas leves: só quando aparecem na tela, 6 por vez.
  const pending = [], loading = new Set();let active = 0;
  const pump = () => {
    while (active < 6 && pending.length) {
      const index = pending.shift(), entry = entries[index], preview = modal.querySelector('[data-preview="' + index + '"]'), img = preview?.querySelector('img[data-fpu-full]');
      if (!img || !modal.isConnected || !isCurrent()) continue;
      active++;
      const full = img.dataset.fpuFull, fallback = img.onerror;
      const useFull = () => { img.onerror = fallback;img.removeAttribute('data-fpu-full');if (full) img.src = full;else fallback?.call(img); };
      const source = pendingThumbSource(entry, {isPrivatePath});
      Promise.resolve(source ? pendingThumbUrl(supabase, source) : '').then(url => {
        if (!modal.isConnected || !isCurrent()) return;
        if (!url) return useFull();
        img.onerror = useFull;img.onload = () => { img.onload = null;img.removeAttribute('data-fpu-full'); };img.src = url;
      }).catch(useFull).finally(() => { active--;pump(); });
    }
  };
  const want = index => { if (loading.has(index)) return;loading.add(index);pending.push(index);pump(); };
  const watcher = typeof IntersectionObserver === 'function' ? new IntersectionObserver(items => {
    for (const item of items) if (item.isIntersecting) { watcher.unobserve(item.target);want(Number(item.target.dataset.preview)); }
  }, {root: list, rootMargin: '300px 0px'}) : null;
  function observeThumbs() {
    modal.querySelectorAll('img[data-fpu-full]').forEach(img => {
      const preview = img.closest('[data-preview]');if (!preview) return;
      const index = Number(preview.dataset.preview);if (loading.has(index)) return;
      if (watcher) watcher.observe(preview);else want(index);
    });
  }
  apply();
  // Artes sem imagem na montagem da janela, mas com arte da biblioteca: busca os arquivos de uma vez e mostra a miniatura.
  const missing = entries.map((entry, index) => ({entry, index})).filter(({entry, index}) => !entry.image && entry.row?.asset_id && ['art', 'vdr', 'venduss'].includes(entry.kind)
    && !pendingThumbSource(entry, {isPrivatePath}) && modal.querySelector('[data-preview="' + index + '"]'));
  if (missing.length && supabase?.from) {
    const ids = [...new Set(missing.map(({entry}) => entry.row.asset_id))];
    Promise.resolve(supabase.from('z19p_assets').select('id,processed_path,original_path').in('id', ids)).then(({data, error}) => {
      if (error || !modal.isConnected || !isCurrent()) return;
      const paths = new Map((data || []).map(asset => [asset.id, asset.processed_path || asset.original_path]));
      for (const {entry, index} of missing) {
        const path = paths.get(entry.row.asset_id), preview = modal.querySelector('[data-preview="' + index + '"]');
        if (!path || !preview || entry.completed) continue;
        entry.assetPath = path;preview.innerHTML = pendingThumbHtml('', value => String(value));
        preview.querySelector('img').onerror = () => { preview.innerHTML = '<small>Prévia indisponível</small>'; };
      }
      observeThumbs();
    }).catch(() => {});
  }
  if (focusSearch || doc.defaultView?.matchMedia?.('(pointer:fine)').matches) setTimeout(() => { if (modal.isConnected && !modal.querySelector('.modal-backdrop .modal-backdrop')) input.focus({preventScroll: true}); }, 60);
  return {input, apply};
}

/** HTML da miniatura na montagem da janela: a imagem nasce sem baixar nada; a miniatura leve entra quando aparecer. */
export function pendingThumbHtml(url, escape) {
  return '<img width="96" height="96" style="display:block;width:96px;height:96px;object-fit:contain" data-fpu-full="' + escape(url) + '" alt="Prévia da estampa"><span class="fpu-loading" aria-hidden="true"></span>';
}
