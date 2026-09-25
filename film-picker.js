import {assetPreviewPath,replacePreviewMarkup} from './asset-preview.js?v=2.17.9';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
const decimal = value => Number(String(value ?? '').trim().replace(',', '.'));
const formatCm = value => Number(value).toLocaleString('pt-BR', {maximumFractionDigits: 2});
const formatInput = value => Number(value).toLocaleString('pt-BR', {useGrouping:false,maximumFractionDigits:4});
const quantityOf = value => Math.min(999, Math.max(1, Math.floor(decimal(value) || 1)));
const asMap = values => values instanceof Map ? values : new Map((Array.isArray(values) ? values : Object.values(values || {})).map(value => [value.id, value]));
const icons = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m3 16 6-5 5 5 3-3 4 4"/></svg>',
  stack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m12 3 10 5-10 5L2 8l10-5Zm-9 9 9 5 9-5M3 17l9 5 9-5"/></svg>',
  shirt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M8 3 3 5 1 10l4 2 2-3v12h10V9l2 3 4-2-2-5-5-2a4 4 0 0 1-8 0Z"/></svg>'
};

/** Only dimensions explicitly approved for print enter the film catalogue. */
export function buildFilmAssetCatalogue({profiles = [], assetMap = new Map(), workspaces = [], projects = [], folders = []} = {}) {
  const assets = asMap(assetMap), workspaceMap = asMap(workspaces), projectMap = asMap(projects), folderMap = asMap(folders);
  const seen = new Set();
  return profiles.flatMap(profile => {
    const asset = assets.get(profile.asset_id), widthCm = Number(profile.default_width_cm), heightCm = Number(profile.default_height_cm);
    if (!asset || asset.asset_type !== 'arte' || profile.ready_for_print !== true || !(widthCm > 0 && heightCm > 0) || !Number.isFinite(widthCm + heightCm) || seen.has(asset.id)) return [];
    const path = asset.processed_path || asset.original_path;
    if (!path) return [];
    seen.add(asset.id);
    const workspace = workspaceMap.get(asset.workspace_id), project = projectMap.get(asset.project_id), folder = folderMap.get(asset.folder_id);
    const companyName = workspace?.company_name || workspace?.client_name || asset.company_name || 'Biblioteca sem empresa vinculada';
    const clientName = workspace?.client_name || '';
    const projectName = project?.title || (project?.sequence_no ? `Projeto ${project.sequence_no}` : '');
    const folderName = folder?.name || (asset.folder_id ? '' : 'Sem pasta');
    const ownLibrary=workspace?.workspace_type!=='client'||/^(zero\s*19|zero19|019)(\b|\s)/i.test(String(companyName).trim());
    return [{id:asset.id, asset, profile, workspaceId:asset.workspace_id || '_unassigned', companyName, clientName, workspaceType:workspace?.workspace_type||'client', ownLibrary, projectName, folderName, path, widthCm, heightCm, aspect:widthCm/heightCm,
      search:normalize([asset.name, companyName, clientName, projectName, folderName,ownLibrary?'biblioteca zero19':''].join(' '))}];
  }).sort((left, right) => left.companyName.localeCompare(right.companyName, 'pt-BR') || String(left.asset.name).localeCompare(String(right.asset.name), 'pt-BR'));
}

export function filmItemFromSelection(entry, selection = {}) {
  const widthCm = Number(selection.widthCm ?? entry.widthCm), heightCm = Number(selection.heightCm ?? entry.heightCm);
  if (!(widthCm > 0 && heightCm > 0) || !Number.isFinite(widthCm + heightCm)) throw new Error('Informe medidas válidas para a arte.');
  return {
    localId:globalThis.crypto?.randomUUID?.() || `film-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type:'asset', sourceId:entry.id, label:`${entry.companyName} • ${entry.asset.name || 'Arte sem nome'}`,
    workspaceId:entry.workspaceId,companyName:entry.companyName,
    widthCm, heightCm, quantity:quantityOf(selection.quantity), halftone:Boolean(entry.profile.halftone),
    allowInternalNesting:Boolean(entry.profile.allow_internal_nesting), rotationPolicy:entry.profile.rotation_policy || 'none',
    path:entry.path, sizeOverride:Math.abs(widthCm-entry.widthCm) > .0001 || Math.abs(heightCm-entry.heightCm) > .0001
  };
}

/** Opens a local selection draft. Nothing is added or persisted until onAdd succeeds. */
export function openFilmAssetPicker({profiles = [], assetMap = new Map(), workspaces = [], projects = [], folders = [], publicUrl = path => path, onAdd, onGarment, onMockup, onEdit, toast} = {}) {
  const catalogue = buildFilmAssetCatalogue({profiles, assetMap, workspaces, projects, folders});
  const entries = new Map(catalogue.map(entry => [entry.id, entry]));
  const companies = new Map();
  for (const workspace of asMap(workspaces).values()) {const name=workspace.company_name || workspace.client_name || 'Biblioteca sem nome',ownLibrary=workspace.workspace_type!=='client'||/^(zero\s*19|zero19|019)(\b|\s)/i.test(String(name).trim());companies.set(workspace.id,{id:workspace.id,name,client:workspace.client_name||'',ownLibrary,count:0});}
  for (const entry of catalogue) {
    if (!companies.has(entry.workspaceId)) companies.set(entry.workspaceId, {id:entry.workspaceId, name:entry.companyName, client:entry.clientName, ownLibrary:Boolean(entry.ownLibrary), count:0});
    companies.get(entry.workspaceId).count++;
  }
  const companyList = [...companies.values()].sort((a,b) => Number(b.count>0)-Number(a.count>0) || a.name.localeCompare(b.name, 'pt-BR'));
  const selected = new Map();
  const returnFocus = document.activeElement, oldBodyOverflow = document.body.style.overflow;
  let activeCompany = 'all', companyQuery = '', artQuery = '', trayOpen = false, sizeEditing = null, busy = false, closed = false;
  const modalId = `film-picker-${Math.random().toString(36).slice(2)}`;
  const root = document.createElement('div');
  root.className = 'film-picker-backdrop';
  root.innerHTML = `<section class="film-picker" role="dialog" aria-modal="true" aria-labelledby="${modalId}-title" tabindex="-1">
    <header class="fp-header"><div class="fp-heading-icon">${icons.stack}</div><div class="fp-heading"><span class="fp-eyebrow">SUA BIBLIOTECA DE PRODUÇÃO</span><h2 id="${modalId}-title">Escolha as artes do filme</h2><p>Combine empresas, confira as medidas e adicione tudo de uma vez.</p></div><button class="fp-icon-button" data-action="close" aria-label="Fechar seleção de artes">×</button></header>
    <div class="fp-body"><aside class="fp-companies"><label class="fp-search">${icons.search}<input data-input="company-search" type="search" placeholder="Empresa ou cliente" aria-label="Buscar empresa ou cliente" autocomplete="off"></label><nav class="fp-company-list" aria-label="Empresas e clientes"></nav></aside>
      <main class="fp-catalogue"><div class="fp-catalogue-head"><div><h3 data-company-title>Todas as empresas</h3><p data-catalogue-count></p></div><span class="fp-ready-label"><i></i> Prontas para impressão</span></div>
        <div class="fp-art-toolbar"><label class="fp-search">${icons.search}<input data-input="art-search" type="search" placeholder="Buscar arte, pasta ou projeto" aria-label="Buscar arte, pasta ou projeto" autocomplete="off"></label><button class="fp-button fp-button-subtle" data-action="select-visible">Selecionar visíveis</button></div>
        <div class="fp-art-grid"></div>
      </main></div>
    <section class="fp-selection-tray" aria-label="Artes selecionadas" hidden><div class="fp-tray-head"><b>Sua seleção</b><span>Tamanhos ajustados aqui valem só para este filme.</span><button class="fp-button fp-button-subtle" data-action="clear">Limpar seleção</button></div><div class="fp-selection-list"></div></section>
    <div class="fp-status" aria-live="polite" role="status"></div>
    <footer class="fp-footer"><button class="fp-selection-summary" data-action="toggle-tray" aria-expanded="false" aria-label="Ver artes selecionadas"><span class="fp-count">0</span><span><b>Nenhuma arte selecionada</b><small>Escolha uma ou várias empresas.</small></span><span aria-hidden="true">⌃</span></button><div class="fp-footer-actions"><button class="fp-button fp-cancel" data-action="close">Cancelar</button><button class="fp-button fp-button-primary" data-action="submit" disabled>Adicionar ao filme <span aria-hidden="true">↗</span></button></div></footer>
  </section>`;
  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';
  const dialog = root.querySelector('.film-picker');
  const find = selector => root.querySelector(selector);
  const report = message => { find('.fp-status').textContent = message; };
  const imageURL = entry => { try { return publicUrl(assetPreviewPath(entry.asset) || entry.path) || ''; } catch { return ''; } };
  const visibleEntries = () => catalogue.filter(entry => (activeCompany === 'all' || entry.workspaceId === activeCompany) && (!artQuery || entry.search.includes(artQuery)));
  const defaults = entry => ({widthCm:entry.widthCm, heightCm:entry.heightCm, quantity:1});
  const focusAction = (action,id) => [...root.querySelectorAll('[data-action]')].find(button => button.dataset.action === action && (!id || button.dataset.id === id))?.focus({preventScroll:true});
  const lifetime = new AbortController();
  const accountChanged = () => { selected.clear();close(true); };
  window.addEventListener('z19:account-changing',accountChanged);

  function close(force = false) {
    if (closed || (busy&&!force)) return;
    closed = true;
    lifetime.abort();
    window.removeEventListener('z19:account-changing',accountChanged);
    root.remove();
    document.body.style.overflow = oldBodyOverflow;
    if (!force&&returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
  }
  function refreshAsset(asset, profile) {
    if (closed || !asset?.id) return null;
    const previous = entries.get(asset.id), selection = selected.get(asset.id);
    const mergedAsset = {...(previous?.asset || {}), ...asset};
    const updatedProfile = profile === undefined ? previous?.profile : profile;
    const [next] = buildFilmAssetCatalogue({profiles:updatedProfile?[updatedProfile]:[],assetMap:new Map([[asset.id,mergedAsset]]),workspaces,projects,folders});
    const oldIndex = catalogue.findIndex(entry=>entry.id===asset.id);
    if (oldIndex >= 0) catalogue.splice(oldIndex,1);
    if (previous && companies.has(previous.workspaceId)) companies.get(previous.workspaceId).count--;
    entries.delete(asset.id);
    if (next) {
      catalogue.push(next);
      catalogue.sort((a,b)=>a.companyName.localeCompare(b.companyName,'pt-BR')||String(a.asset.name).localeCompare(String(b.asset.name),'pt-BR'));
      entries.set(next.id,next);
      if (!companies.has(next.workspaceId)) companies.set(next.workspaceId,{id:next.workspaceId,name:next.companyName,client:next.clientName,ownLibrary:Boolean(next.ownLibrary),count:0});
      companies.get(next.workspaceId).count++;
      if (selection) {
        const overridden = previous && (Math.abs(selection.widthCm-previous.widthCm)>.0001 || Math.abs(selection.heightCm-previous.heightCm)>.0001);
        selected.set(next.id,{quantity:selection.quantity,widthCm:overridden?selection.widthCm:next.widthCm,heightCm:overridden?selection.widthCm/next.aspect:next.heightCm});
      }
    } else selected.delete(asset.id);
    companyList.splice(0,companyList.length,...[...companies.values()].sort((a,b)=>Number(b.count>0)-Number(a.count>0)||a.name.localeCompare(b.name,'pt-BR')));
    sizeEditing=null;
    renderAll();
    report(next?'Arte atualizada na seleção.':'A arte não está liberada para impressão e foi retirada desta seleção.');
    focusAction('toggle',asset.id);
    return next || null;
  }
  function imageHTML(entry, small = false) {
    const url = imageURL(entry);
    return `<div class="fp-image ${small?'fp-image-small':''} ${url?'is-loading':'is-error'}"><span class="fp-image-placeholder">${icons.image}<span>${url?'Carregando arte…':'Prévia indisponível'}</span></span>${url?`<img src="${escapeHTML(url)}" alt="${escapeHTML(entry.asset.name || 'Arte')}" loading="${small?'eager':'lazy'}" fetchpriority="${small?'high':'auto'}" decoding="async">`:''}</div>`;
  }
  function watchImages(scope) {
    scope.querySelectorAll('.fp-image img').forEach(img => {
      const settle = () => {
        const failed = !img.naturalWidth;
        img.parentElement.classList.remove('is-loading');
        img.parentElement.classList.toggle('is-error',failed);
        if (failed) img.parentElement.querySelector('.fp-image-placeholder span').textContent = 'Prévia indisponível';
      };
      img.onload = settle;
      img.onerror = settle;
      if (img.complete) settle();
    });
  }
  function renderCompanies() {
    const matching = companyList.filter(company => normalize(`${company.name} ${company.client}`).includes(companyQuery));
    find('.fp-company-list').innerHTML = `<button class="fp-company ${activeCompany==='all'?'is-active':''}" data-action="company" data-company="all" aria-pressed="${activeCompany==='all'}"><span class="fp-company-avatar">${icons.stack}</span><span><b>Todas as empresas</b><small>Biblioteca completa</small></span><span class="fp-company-count">${catalogue.length}</span></button><div class="fp-company-divider">EMPRESAS E CLIENTES <span>${matching.length}</span></div>${matching.map(company => {
      const selectionCount = [...selected.keys()].filter(id => entries.get(id)?.workspaceId === company.id).length;
      return `<button class="fp-company ${activeCompany===company.id?'is-active':''} ${company.count?'':'is-empty'} ${company.ownLibrary?'is-own-library':''}" data-action="company" data-company="${escapeHTML(company.id)}" aria-pressed="${activeCompany===company.id}"><span class="fp-company-avatar">${company.ownLibrary?'019':escapeHTML(company.name.slice(0,2).toUpperCase())}</span><span><b>${escapeHTML(company.name)}</b><small>${escapeHTML(company.ownLibrary?'Biblioteca própria ZERO19':company.client || (company.count?'Artes de produção':'Sem artes liberadas'))}</small></span><span class="fp-company-count ${selectionCount?'has-selection':''}" aria-label="${company.count} artes, ${selectionCount} selecionadas">${selectionCount?`${selectionCount} ✓`:company.count}</span></button>`;
    }).join('')}${matching.length?'':'<p class="fp-no-companies">Nenhuma empresa ou cliente encontrado.</p>'}`;
  }
  function cardHTML(entry) {
    const chosen = selected.get(entry.id), dims = chosen || defaults(entry), changed = Math.abs(dims.widthCm-entry.widthCm) > .0001 || Math.abs(dims.heightCm-entry.heightCm) > .0001;
    return `<article class="fp-art-card ${chosen?'is-selected':''}" data-card-id="${escapeHTML(entry.id)}">
      <button class="fp-preview-button" data-action="toggle" data-id="${escapeHTML(entry.id)}" aria-pressed="${Boolean(chosen)}" aria-label="${chosen?'Remover':'Selecionar'} ${escapeHTML(entry.asset.name || 'arte')}">${imageHTML(entry)}<span class="fp-check" aria-hidden="true">${chosen?'✓':'＋'}</span>${entry.profile.halftone?'<span class="fp-halftone">Halftone</span>':''}</button>
      <div class="fp-art-copy"><small>${escapeHTML(entry.companyName)}</small><h4 title="${escapeHTML(entry.asset.name)}">${escapeHTML(entry.asset.name || 'Arte sem nome')}</h4><p class="fp-art-location">${escapeHTML([entry.projectName,entry.folderName].filter(Boolean).join(' / ') || 'Biblioteca de artes')}</p>
        <div class="fp-size-line"><strong>${formatCm(dims.widthCm)} <span>×</span> ${formatCm(dims.heightCm)} <small>cm</small></strong><button class="fp-text-button" data-action="size" data-id="${escapeHTML(entry.id)}" aria-expanded="${sizeEditing===entry.id}">Alterar tamanho</button></div><p class="fp-size-caption">${changed?'Tamanho personalizado neste filme':'Tamanho cadastrado · proporção original'}</p>
        <label class="fp-card-quantity">Quantidade desta arte<input data-input="quantity" data-id="${escapeHTML(entry.id)}" type="number" inputmode="numeric" min="1" max="999" step="1" value="${quantityOf(dims.quantity)}" aria-label="Quantidade de ${escapeHTML(entry.asset.name || 'arte')}"></label>
        ${sizeEditing===entry.id?sizeFormHTML(entry,dims):''}
        <div class="fp-card-actions"><button class="fp-button ${chosen?'fp-button-selected':'fp-button-quick'}" data-action="${chosen?'toggle':'quick'}" data-id="${escapeHTML(entry.id)}">${chosen?'✓ Selecionada':'＋ Adicionar rápido'}</button></div>
        ${[onMockup,onEdit].some(callback=>typeof callback==='function')?`<div class="fp-studio-actions" aria-label="Ferramentas da arte">${typeof onMockup==='function'?`<button class="fp-button" data-action="mockup" data-id="${escapeHTML(entry.id)}" aria-label="Ver ${escapeHTML(entry.asset.name || 'arte')} na camisa"><span>Ver na camisa</span></button>`:''}${typeof onEdit==='function'?`<button class="fp-button" data-action="edit" data-id="${escapeHTML(entry.id)}" aria-label="Editar ${escapeHTML(entry.asset.name || 'arte')}"><span>Editar arte</span></button>`:''}</div>`:''}
      </div></article>`;
  }
  function sizeFormHTML(entry,dims) {
    return `<form class="fp-size-form" data-size-form="${escapeHTML(entry.id)}"><p><span aria-hidden="true">↔</span> Proporção travada</p><div class="fp-size-fields"><label>Largura (cm)<input name="width" inputmode="decimal" value="${formatInput(dims.widthCm)}" autocomplete="off" aria-label="Largura da arte em centímetros"></label><span aria-hidden="true">×</span><label>Altura (cm)<input name="height" inputmode="decimal" value="${formatInput(dims.heightCm)}" autocomplete="off" aria-label="Altura da arte em centímetros"></label></div><div class="fp-size-error" role="alert"></div><div class="fp-size-actions"><button type="button" class="fp-text-button" data-action="restore-size" data-id="${escapeHTML(entry.id)}">Restaurar cadastrado</button><button type="submit" class="fp-button fp-button-primary">Usar tamanho</button></div><small>O tamanho original da arte permanece salvo.</small></form>`;
  }
  function renderGrid() {
    const visible = visibleEntries();
    find('[data-company-title]').textContent = activeCompany === 'all' ? 'Todas as empresas' : companies.get(activeCompany)?.name || 'Biblioteca de artes';
    find('[data-catalogue-count]').textContent = `${visible.length} ${visible.length===1?'arte disponível':'artes disponíveis'}${artQuery?' nesta busca':''}`;
    find('[data-action="select-visible"]').disabled = !visible.length || busy;
    replacePreviewMarkup(find('.fp-art-grid'), visible.length ? visible.map(cardHTML).join('') : `<div class="fp-empty">${icons.image}<h4>${artQuery?'Nenhuma arte encontrada':'Nenhuma arte liberada ainda'}</h4><p>${artQuery?'Tente outro nome de arte, pasta ou projeto.':'Para aparecer aqui, a arte precisa estar pronta para impressão e ter largura e altura cadastradas.'}</p>${artQuery?'<button class="fp-button" data-action="clear-search">Limpar busca</button>':''}</div>`);
    watchImages(find('.fp-art-grid'));
  }
  function renderSelection() {
    const rows = [...selected.entries()], totalQuantity = rows.reduce((total,[,item]) => total+quantityOf(item.quantity),0);
    const summary = find('.fp-selection-summary');
    summary.querySelector('.fp-count').textContent = rows.length;
    summary.querySelector('b').textContent = rows.length ? `${rows.length} ${rows.length===1?'arte selecionada':'artes selecionadas'}` : 'Nenhuma arte selecionada';
    summary.querySelector('small').textContent = rows.length ? `${totalQuantity} ${totalQuantity===1?'impressão':'impressões'} · toque para revisar` : 'Escolha uma ou várias empresas.';
    summary.setAttribute('aria-expanded',String(trayOpen));
    find('.fp-selection-tray').hidden = !trayOpen;
    replacePreviewMarkup(find('.fp-selection-list'), rows.length ? rows.map(([id,item]) => {
      const entry = entries.get(id);
      return `<article class="fp-selection-item">${imageHTML(entry,true)}<div class="fp-selected-copy"><b>${escapeHTML(entry.asset.name || 'Arte sem nome')}</b><small>${escapeHTML(entry.companyName)}</small><button class="fp-text-button" data-action="cart-size" data-id="${escapeHTML(id)}">${formatCm(item.widthCm)} × ${formatCm(item.heightCm)} cm <span aria-hidden="true">✎</span></button></div><label class="fp-quantity">Cópias<input data-input="quantity" data-id="${escapeHTML(id)}" type="number" inputmode="numeric" min="1" max="999" step="1" value="${quantityOf(item.quantity)}" aria-label="Quantidade de ${escapeHTML(entry.asset.name || 'arte')}"></label><button class="fp-icon-button" data-action="remove" data-id="${escapeHTML(id)}" aria-label="Remover ${escapeHTML(entry.asset.name || 'arte')}">×</button></article>`;
    }).join('') : '<p class="fp-empty-selection">Selecione as miniaturas para montar seu filme.</p>');
    const submit = find('[data-action="submit"]');
    submit.disabled = busy || !rows.length;
    submit.innerHTML = busy ? 'Adicionando…' : `Adicionar${rows.length?` ${rows.length}`:''} ao filme <span aria-hidden="true">↗</span>`;
    watchImages(find('.fp-selection-list'));
  }
  function renderAll() { renderCompanies(); renderGrid(); renderSelection(); }
  function select(entry, restore = false) {
    if (!selected.has(entry.id) || restore) selected.set(entry.id,defaults(entry));
    report(`${entry.asset.name || 'Arte'} adicionada à seleção. Você pode escolher outras empresas antes de concluir.`);
  }
  function openSize(id) {
    const entry = entries.get(id);
    if (!entry) return;
    if (activeCompany!=='all' && activeCompany!==entry.workspaceId) activeCompany=entry.workspaceId;
    if (!visibleEntries().some(item=>item.id===id)) { artQuery=''; find('[data-input="art-search"]').value=''; }
    sizeEditing=id;
    renderCompanies(); renderGrid();
    const form=[...root.querySelectorAll('[data-size-form]')].find(item=>item.dataset.sizeForm===id);
    form?.scrollIntoView({block:'nearest',behavior:'smooth'});
    form?.querySelector('[name="width"]')?.focus({preventScroll:true});
  }
  function readSize(form,entry) {
    const width = decimal(form.elements.width.value), height = decimal(form.elements.height.value);
    if (!(width >= .01 && width <= 1000 && height >= .01 && height <= 1000)) throw new Error('Use medidas entre 0,01 e 1.000 cm.');
    // Width is the canonical value; derived height never changes the original aspect ratio.
    return {widthCm:width,heightCm:width/entry.aspect};
  }
  root.addEventListener('input',event=>{
    if (closed || busy) return;
    const input=event.target;
    if (input.dataset.input==='company-search') { companyQuery=normalize(input.value); renderCompanies(); }
    if (input.dataset.input==='art-search') { artQuery=normalize(input.value); sizeEditing=null; renderGrid(); }
    const form=input.closest('[data-size-form]');
    if (form && ['width','height'].includes(input.name)) {
      const entry=entries.get(form.dataset.sizeForm),value=decimal(input.value);
      if (value>0 && Number.isFinite(value)) form.elements[input.name==='width'?'height':'width'].value=formatInput(input.name==='width'?value/entry.aspect:value*entry.aspect);
      form.querySelector('.fp-size-error').textContent='';
    }
  });
  root.addEventListener('change',event=>{
    if (closed || busy || event.target.dataset.input!=='quantity') return;
    const id=event.target.dataset.id,entry=entries.get(id);if(!entry)return;const item=selected.get(id)||defaults(entry);selected.set(id,item);
    if (!item) return;
    item.quantity=quantityOf(event.target.value);
    renderAll();
    [...root.querySelectorAll('[data-input="quantity"]')].find(input=>input.dataset.id===id)?.focus({preventScroll:true});
  });
  root.addEventListener('submit',event=>{
    if(closed)return;
    const form=event.target.closest('[data-size-form]');
    if (!form) return;
    event.preventDefault();
    if (busy) return;
    const entry=entries.get(form.dataset.sizeForm);
    try {
      const size=readSize(form,entry);
      selected.set(entry.id,{...(selected.get(entry.id)||defaults(entry)),...size});
      sizeEditing=null;
      renderAll();
      focusAction('size',entry.id);
      report(`Tamanho de ${entry.asset.name || 'arte'}: ${formatCm(size.widthCm)} por ${formatCm(size.heightCm)} cm. O cadastro original foi preservado.`);
    } catch(error) { form.querySelector('.fp-size-error').textContent=error.message; }
  });
  root.addEventListener('click',async event=>{
    if(closed)return;
    if (event.target===root) { close(); return; }
    const button=event.target.closest('[data-action]');
    if (!button || busy) return;
    const {action,id}=button.dataset,entry=entries.get(id);
    if (action==='close') { close(); return; }
    if (action==='company') { activeCompany=button.dataset.company;sizeEditing=null;renderCompanies();renderGrid();find('.fp-catalogue').scrollTop=0;return; }
    if (action==='clear-search') { artQuery='';find('[data-input="art-search"]').value='';renderGrid();find('[data-input="art-search"]').focus();return; }
    if (action==='toggle-tray') { trayOpen=!trayOpen;renderSelection();return; }
    if (action==='select-visible') { visibleEntries().forEach(item=>{if(!selected.has(item.id))selected.set(item.id,defaults(item));});renderAll();report(`${selected.size} artes selecionadas. Confira as quantidades na sua seleção.`);focusAction(action);return; }
    if (action==='clear') { selected.clear();sizeEditing=null;renderAll();report('Seleção limpa. Nenhum cadastro foi alterado.');focusAction('toggle-tray');return; }
    if (action==='remove') { selected.delete(id);renderAll();report('Arte removida da seleção.');focusAction('toggle-tray');return; }
    if (action==='toggle' && entry) { if(selected.has(id)){selected.delete(id);report('Arte removida da seleção.');}else select(entry);renderAll();focusAction('toggle',id);return; }
    if (action==='quick' && entry) { select(entry,true);renderAll();focusAction('toggle',id);return; }
    if ((action==='size'||action==='cart-size') && entry) { if(sizeEditing===id && action==='size'){sizeEditing=null;renderGrid();focusAction('size',id);}else openSize(id);return; }
    if (action==='restore-size' && entry) { const form=button.closest('form');form.elements.width.value=formatInput(entry.widthCm);form.elements.height.value=formatInput(entry.heightCm);form.querySelector('.fp-size-error').textContent='';return; }
    if ((action==='mockup'||action==='edit') && entry) {
      const callback=action==='mockup'?onMockup:onEdit;
      try { if(closed)return;await callback?.(entry.asset,entry.profile,{signal:lifetime.signal});if(closed)return; }
      catch(error) { if(closed)return;report(error.message||'Não foi possível abrir a arte.');toast?.(error.message||'Não foi possível abrir a arte.','err'); }
      return;
    }
    if (action==='submit' && selected.size) {
      try {
        if (typeof onAdd!=='function') throw new Error('A ação de adicionar ao filme não está disponível.');
        const items=[...selected].map(([assetId,selection])=>filmItemFromSelection(entries.get(assetId),selection));
        busy=true;
        dialog.setAttribute('aria-busy','true');
        renderSelection();
        if(closed||lifetime.signal.aborted)return;
        await onAdd(items,{signal:lifetime.signal});
        if(closed||lifetime.signal.aborted)return;
        busy=false;
        close();
      } catch(error) {
        if(closed)return;
        busy=false;dialog.removeAttribute('aria-busy');renderSelection();report(error.message||'Não foi possível adicionar as artes. Sua seleção foi mantida.');toast?.(error.message||'Não foi possível adicionar as artes.','err');
      }
    }
  });
  root.addEventListener('keydown',event=>{
    if(closed)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(sizeEditing){sizeEditing=null;renderGrid();}else close();return;}
    if(event.key!=='Tab')return;
    const focusable=[...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex="0"]')].filter(element=>element.getClientRects().length);
    const first=focusable[0],last=focusable[focusable.length-1];
    if(!first){event.preventDefault();dialog.focus();return;}
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  renderAll();
  find('[data-input="company-search"]').focus({preventScroll:true});
  return {close, element:root, selected, refreshAsset};
}
