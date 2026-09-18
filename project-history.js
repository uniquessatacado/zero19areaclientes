const escapeHTML=(value='')=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const dateLabel=value=>{if(!value)return 'Não informada';const date=new Date(String(value).length===10?`${value}T12:00:00`:value);return Number.isFinite(date.getTime())?date.toLocaleDateString('pt-BR'):'Não informada';};
const fileKind=asset=>asset.asset_type==='mockup'?'Mockup':asset.asset_type==='video'||String(asset.mime_type||'').startsWith('video/')?'Vídeo':'Arte';

async function readRows(supabase,table,filters,inFilter=null){
  const output=[];
  for(let offset=0;;offset+=500){
    let query=supabase.from(table).select('*');for(const [key,value] of Object.entries(filters))query=query.eq(key,value);
    if(inFilter)query=query.in(inFilter.key,inFilter.values);
    const {data,error}=await query.order('id').range(offset,offset+499);if(error)throw new Error(error.message||String(error));
    output.push(...(data||[]));if((data||[]).length<500)return output;
  }
}

export async function loadProjectHistory(supabase,{workspaceId,projectId,ownerId}){
  if(!workspaceId||!projectId||!ownerId)throw new Error('Não foi possível identificar o projeto desta empresa.');
  const {data:project,error}=await supabase.from('z19p_projects').select('*').eq('id',projectId).eq('workspace_id',workspaceId).eq('owner_id',ownerId).maybeSingle();
  if(error)throw new Error(error.message||String(error));if(!project)throw new Error('Projeto não encontrado nesta empresa ou sem permissão de acesso.');
  const filters={workspace_id:workspaceId,project_id:projectId,owner_id:ownerId},warnings=[];
  const optional=async(label,read)=>{try{return await read()}catch(issue){warnings.push(`${label}: ${issue.message}`);return null}};
  const [assets,folders,quotes,profiles,jobs,history]=await Promise.all([
    optional('Arquivos',()=>readRows(supabase,'z19p_assets',filters)),
    optional('Pastas',()=>readRows(supabase,'z19p_folders',filters)),
    optional('Orçamentos',()=>readRows(supabase,'z19p_quotes',filters)),
    optional('Medidas',()=>readRows(supabase,'z19p_asset_print_profiles',{project_id:projectId,owner_id:ownerId})),
    optional('Filmes',()=>readRows(supabase,'z19p_print_jobs',{project_id:projectId,owner_id:ownerId})),
    optional('Mudanças de status',()=>readRows(supabase,'z19p_status_history',filters))
  ]);
  let items=[],documents=[];
  const quoteIds=(quotes||[]).map(quote=>quote.id);
  for(let index=0;index<quoteIds.length;index+=100){
    const ids=quoteIds.slice(index,index+100),[pageItems,pageDocs]=await Promise.all([
      optional('Itens de orçamento',()=>readRows(supabase,'z19p_quote_items',{owner_id:ownerId},{key:'quote_id',values:ids})),
      optional('PDFs arquivados',()=>readRows(supabase,'z19p_quote_documents',{owner_id:ownerId},{key:'quote_id',values:ids}))
    ]);
    if(pageItems&&items!==null)items.push(...pageItems);else if(!pageItems)items=null;
    if(pageDocs&&documents!==null)documents.push(...pageDocs);else if(!pageDocs)documents=null;
  }
  return {project,assets,folders,profiles,jobs,history,quotes:quotes?.map(quote=>({...quote,items:items?.filter(item=>item.quote_id===quote.id).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0))??null,documents:documents?.filter(document=>document.quote_id===quote.id).sort((a,b)=>(b.document_version||0)-(a.document_version||0))??null}))??null,warnings};
}

export function filterProjectHistoryAssets(assets,{query='',kind='all',folder='all'}={}){
  const needle=String(query).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  return (assets||[]).filter(asset=>String(asset.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(needle)
    &&(kind==='all'||fileKind(asset).toLowerCase()===kind)&&(folder==='all'||(folder==='root'?!asset.folder_id:asset.folder_id===folder)));
}

export function bindProjectHistory(root,context){
  const {workspace,projects=[],statuses=[]}=context;if(!workspace||workspace.workspace_type&&workspace.workspace_type!=='client')return;
  const snapshot={...context,workspace:{...workspace},projects:projects.map(project=>({...project})),statuses:statuses.map(status=>({...status}))};
  root.querySelectorAll('.project-history-row').forEach((row,index)=>{
    const project=snapshot.projects[index];if(!project)return;
    row.dataset.historyProject=project.id;row.classList.add('project-history-row-interactive');
    row.querySelector('[data-project-history-open]')?.remove();row.querySelector('.project-history-current')?.remove();
    if(index===0){const badge=document.createElement('span');badge.className='project-history-current';badge.textContent='Projeto atual';row.querySelector('div')?.appendChild(badge)}
    const button=document.createElement('button');button.type='button';button.className='btn small';button.dataset.projectHistoryOpen=project.id;button.textContent='Consultar projeto';
    button.setAttribute('aria-label',`Consultar ${project.title||`Projeto ${project.sequence_no}`} em modo leitura`);button.onclick=()=>openProjectHistory(root,snapshot,project);row.appendChild(button);
  });
}

export function openProjectHistory(root,ctx,chosenProject){
  const h=escapeHTML,modal=document.createElement('div'),previousFocus=document.activeElement,previousInert=root.inert,previousOverflow=document.body.style.overflow;
  modal.className='modal-backdrop project-history-backdrop';let closed=false,data=null,preview=null,generation=0;
  const statusName=id=>ctx.statuses?.find(status=>status.id===id)?.name||'Sem status',profileName=id=>id?ctx.profileName(id):'Não informado',money=value=>ctx.fmtMoney(Number(value)||0);
  const closePreview=()=>{preview?.querySelectorAll('video').forEach(video=>video.pause());preview?.remove();preview=null};
  const close=()=>{if(closed)return;closed=true;generation++;closePreview();modal.remove();root.inert=previousInert;document.body.style.overflow=previousOverflow;window.removeEventListener('hashchange',close);previousFocus?.focus?.()};
  const download=async(path,name,button)=>{
    if(!path)return ctx.toast('Arquivo não disponível neste registro.','err');const previousLabel=button.textContent;button.disabled=true;button.textContent='Baixando…';
    try{const {data:blob,error}=await ctx.supabase.storage.from('z19p-assets').download(path);if(error)throw error;const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=String(name||'arquivo').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-');document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(error){ctx.toast(error.message||'Não foi possível baixar o arquivo.','err')}finally{button.disabled=false;button.textContent=previousLabel}
  };
  const assetFilename=asset=>{const path=asset.processed_path||asset.original_path||'',extension=path.match(/\.[a-z0-9]+$/i)?.[0]||'';return `${asset.name||'arquivo'}${extension&&!String(asset.name||'').toLowerCase().endsWith(extension.toLowerCase())?extension:''}`};
  const bindKeyboard=(backdrop,onClose)=>{backdrop.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose()}else if(event.key==='Tab'){const controls=[...backdrop.querySelectorAll('button:not([disabled]),a[href],input,select,summary,video[controls]')].filter(control=>control.getClientRects().length&&!control.closest('[hidden]')),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}}};
  const viewAsset=asset=>{
    closePreview();const path=asset.processed_path||asset.original_path,url=ctx.publicUrl(path),profile=data.profiles?.find(item=>item.asset_id===asset.id),video=fileKind(asset)==='Vídeo';
    preview=document.createElement('div');preview.className='modal-backdrop project-history-preview-backdrop';
    preview.innerHTML=`<div class="modal project-history-asset-preview" role="dialog" aria-modal="true" aria-labelledby="historyAssetTitle"><div class="modal-head"><div><div class="eyebrow">${fileKind(asset)} do projeto · consulta</div><h2 id="historyAssetTitle">${h(asset.name)}</h2></div><button class="btn ghost small" data-close-preview aria-label="Fechar visualização">×</button></div><div class="history-asset-full">${video?`<video src="${h(url)}" controls playsinline preload="metadata"></video>`:`<img src="${h(url)}" alt="${h(asset.name)}">`}</div><div class="history-asset-facts"><span>${Number(asset.width)||'?'} × ${Number(asset.height)||'?'} px</span>${profile?`<span>${Number(profile.default_width_cm).toLocaleString('pt-BR')} × ${Number(profile.default_height_cm).toLocaleString('pt-BR')} cm</span><span>${profile.halftone?'Halftone':'Sem halftone'}</span><span>${profile.ready_for_print?'Marcada como pronta':'Preparo pendente'}</span>`:'<span>Sem medida de impressão registrada</span>'}<span>Enviado por ${h(profileName(asset.created_by))}</span></div><div class="modal-footer"><button class="btn" data-close-preview>Voltar ao histórico</button><button class="btn primary" data-download-preview>Baixar arquivo</button></div></div>`;
    const currentPreview=preview,previewFocus=document.activeElement,finish=()=>{closePreview();previewFocus?.focus?.()};
    currentPreview.querySelectorAll('[data-close-preview]').forEach(button=>button.onclick=finish);currentPreview.querySelector('[data-download-preview]').onclick=event=>download(path,assetFilename(asset),event.currentTarget);currentPreview.onclick=event=>{if(event.target===currentPreview)finish()};bindKeyboard(currentPreview,finish);document.body.appendChild(currentPreview);currentPreview.querySelector('[data-close-preview]').focus();
  };
  const quoteHTML=quote=>{
    const paid=quote.payment_status==='paid';
    return `<details class="history-quote"><summary><span><b>${h(quote.title||'Orçamento')}</b><small>${dateLabel(quote.created_at)} · ${quote.items===null?'Itens indisponíveis':`${quote.items.length} item(ns)`}</small></span><span class="payment-badge ${paid?'paid':'pending'}">${paid?'PAGO':'PENDENTE'}</span><strong>${quote.items===null?'Total indisponível':money(ctx.quoteTotal(quote))}</strong></summary><div class="history-quote-body"><div class="history-asset-facts"><span>Entrega: ${dateLabel(quote.delivery_date)}</span>${paid?`<span>Pago em ${dateLabel(quote.paid_at)}</span>`:''}<span>Responsável pelo orçamento: ${h(profileName(quote.created_by))}</span></div>${quote.delivery_term?`<p>Prazo registrado: ${h(quote.delivery_term)}</p>`:''}<div class="history-quote-items">${quote.items===null?'<p>Não foi possível consultar os itens deste orçamento.</p>':quote.items.map(item=>`<article><div><b>${h(item.product_name||'Produto')}</b><span>${Number(item.quantity)||1} unidade(s) · ${money(ctx.quoteItemUnit(item))} / unidade</span></div><strong>${money(Math.max(1,parseInt(item.quantity)||1)*ctx.quoteItemUnit(item))}</strong>${Array.isArray(item.prints)&&item.prints.length?`<div class="history-item-prints">${item.prints.map(print=>`<span>${h(print.placement||'Estampa')}${print.width_cm?` · ${h(print.width_cm)} cm` :''}${print.height_cm?` × ${h(print.height_cm)} cm`:''}</span>`).join('')}</div>`:''}</article>`).join('')}</div>${quote.notes?`<div class="history-quote-notes"><b>Observações</b><p>${h(quote.notes)}</p></div>`:''}<div class="history-document-links">${quote.documents===null?'<small>Não foi possível consultar os PDFs arquivados.</small>':quote.documents.length?quote.documents.map(document=>`<button class="btn small" data-history-pdf="${h(document.id)}">Baixar PDF v${Number(document.document_version)||1}${document.stale?' · versão anterior':''}</button>`).join(''):'<small>Nenhum PDF arquivado para este orçamento.</small>'}</div></div></details>`;
  };
  const drawAssets=()=>{
    const result=filterProjectHistoryAssets(data.assets,{query:modal.querySelector('[data-history-search]').value,kind:modal.querySelector('[data-history-kind]').value,folder:modal.querySelector('[data-history-folder]').value}),grid=modal.querySelector('[data-history-grid]'),folders=new Map((data.folders||[]).map(folder=>[folder.id,folder]));
    modal.querySelector('[data-history-count]').textContent=`${result.length} arquivo(s)`;
    grid.innerHTML=data.assets===null?'<div class="empty mini">Não foi possível consultar os arquivos. Use “Atualizar consulta” para tentar novamente.</div>':result.length?result.map(asset=>{const path=asset.processed_path||asset.original_path,profile=data.profiles?.find(item=>item.asset_id===asset.id),url=ctx.publicUrl(path);return `<article class="history-asset-card"><button class="history-asset-thumb" data-history-preview="${h(asset.id)}" aria-label="Visualizar ${h(asset.name)}">${fileKind(asset)==='Vídeo'?'<span class="history-video-mark">▶ Vídeo</span>':`<img loading="lazy" src="${h(url)}" alt="${h(asset.name)}">`}<span>${fileKind(asset)}</span></button><div class="history-asset-copy"><h4>${h(asset.name)}</h4><small>${h(folders.get(asset.folder_id)?.name||'Sem pasta')}</small>${profile?`<b>${Number(profile.default_width_cm).toLocaleString('pt-BR')} × ${Number(profile.default_height_cm).toLocaleString('pt-BR')} cm${profile.halftone?' · halftone':''}</b>`:'<small>Sem medida cadastrada</small>'}<button class="btn small" data-history-download="${h(asset.id)}">Baixar arquivo</button></div></article>`}).join(''):'<div class="empty mini">Nenhum arquivo deste projeto corresponde aos filtros.</div>';
    grid.querySelectorAll('[data-history-preview]').forEach(button=>button.onclick=()=>viewAsset(data.assets.find(asset=>asset.id===button.dataset.historyPreview)));
    grid.querySelectorAll('[data-history-download]').forEach(button=>button.onclick=()=>{const asset=data.assets.find(item=>item.id===button.dataset.historyDownload);download(asset.processed_path||asset.original_path,assetFilename(asset),button)});
    grid.querySelectorAll('img').forEach(image=>image.onerror=()=>{image.hidden=true;image.parentElement.insertAdjacentHTML('beforeend','<span class="history-image-missing">Prévia indisponível</span>')});
  };
  const draw=()=>{
    const project=data.project,isCurrent=ctx.projects[0]?.id===project.id,paid=(data.quotes||[]).filter(quote=>quote.payment_status==='paid').length;
    modal.innerHTML=`<div class="modal project-history-modal" role="dialog" aria-modal="true" aria-labelledby="historyProjectTitle"><div class="modal-head"><div><div class="eyebrow">${h(ctx.workspace.company_name)} · histórico</div><h2 id="historyProjectTitle">${h(project.title||`Projeto ${project.sequence_no}`)}</h2></div><button class="btn ghost small" data-close-history aria-label="Fechar histórico">×</button></div><div class="history-readonly-note"><b>${isCurrent?'Consulta do projeto atual':'Projeto anterior · somente consulta'}</b><span>Visualize os registros e baixe os arquivos preservados deste projeto.</span></div>${data.warnings.length?`<details class="history-load-warning"><summary>Alguns registros não puderam ser carregados</summary>${data.warnings.map(warning=>`<p>${h(warning)}</p>`).join('')}</details>`:''}<div class="history-project-facts"><div><small>Status registrado</small><b>${h(statusName(project.status_id))}</b></div><div><small>Entrega</small><b>${dateLabel(project.delivery_date)}</b></div><div><small>Iniciado</small><b>${dateLabel(project.started_at)}</b></div><div><small>${project.desisted_at?'Desistência':'Finalizado'}</small><b>${dateLabel(project.finalized_at||project.desisted_at)}</b></div><div><small>Responsável</small><b>${h(profileName(project.responsible_user_id))}</b></div><div><small>Criado por</small><b>${h(profileName(project.created_by))}</b></div><div><small>Orçamentos pagos</small><b>${data.quotes===null?'Indisponível':paid}</b></div><div><small>Total finalizado registrado</small><b>${project.finalized_at?money(project.total_revenue):'Ainda não finalizado'}</b></div></div><section class="history-quotes-section"><h3>Orçamentos do projeto</h3>${data.quotes===null?'<div class="empty mini">Orçamentos indisponíveis nesta consulta.</div>':data.quotes.length?data.quotes.map(quoteHTML).join(''):'<div class="empty mini">Nenhum orçamento vinculado a este projeto.</div>'}</section><section class="history-files-section"><div class="history-section-heading"><h3>Artes e mockups</h3><span data-history-count></span></div><div class="history-file-filters"><label><span>Buscar arquivo</span><input data-history-search placeholder="Nome da arte ou mockup…" type="search"></label><label><span>Tipo</span><select data-history-kind><option value="all">Todos</option><option value="arte">Artes</option><option value="mockup">Mockups</option><option value="vídeo">Vídeos</option></select></label><label><span>Pasta</span><select data-history-folder><option value="all">Todas as pastas</option><option value="root">Sem pasta</option>${(data.folders||[]).map(folder=>`<option value="${h(folder.id)}">${h(folder.name)}</option>`).join('')}</select></label></div><div class="history-asset-grid" data-history-grid></div></section>${data.jobs?.length?`<details class="history-extra-details"><summary>Filmes vinculados (${data.jobs.length})</summary>${data.jobs.map(job=>`<div><b>${h(job.name||'Filme')}</b><span>${Number(job.film_width_cm)||'—'} × ${Number(job.calculated_length_cm)||'—'} cm · ${h(job.status||'Rascunho')}</span></div>`).join('')}</details>`:''}${data.history?.length?`<details class="history-extra-details"><summary>Mudanças de status (${data.history.length})</summary>${[...data.history].sort((a,b)=>new Date(b.changed_at||b.created_at||0)-new Date(a.changed_at||a.created_at||0)).map(entry=>`<div><b>${h(statusName(entry.from_status_id))} → ${h(statusName(entry.to_status_id))}</b><span>${dateLabel(entry.changed_at||entry.created_at)} · ${h(profileName(entry.changed_by))}</span></div>`).join('')}</details>`:''}<div class="modal-footer history-modal-footer"><button class="btn" data-reload-history>Atualizar consulta</button><button class="btn primary" data-close-history>Voltar ao projeto atual</button></div></div>`;
    modal.querySelectorAll('[data-close-history]').forEach(button=>button.onclick=close);modal.querySelector('[data-reload-history]').onclick=load;
    modal.querySelector('[data-history-search]').oninput=drawAssets;modal.querySelector('[data-history-kind]').onchange=drawAssets;modal.querySelector('[data-history-folder]').onchange=drawAssets;
    modal.querySelectorAll('[data-history-pdf]').forEach(button=>button.onclick=()=>{const document=(data.quotes||[]).flatMap(quote=>quote.documents||[]).find(item=>item.id===button.dataset.historyPdf);if(document)download(document.storage_path,`orcamento-projeto-${project.sequence_no}-v${document.document_version}.pdf`,button)});
    drawAssets();modal.querySelector('[data-close-history]').focus();
  };
  const load=async()=>{
    const request=++generation;modal.innerHTML='<div class="modal project-history-modal" role="dialog" aria-modal="true" aria-label="Carregando histórico"><div class="modal-head"><h2>Consultando projeto…</h2><button class="btn ghost small" data-close-history aria-label="Fechar histórico">×</button></div><div class="empty"><span class="loading"></span><p>Buscando arquivos e orçamentos deste projeto.</p></div></div>';modal.querySelector('[data-close-history]').onclick=close;modal.querySelector('[data-close-history]').focus();
    try{const loaded=await loadProjectHistory(ctx.supabase,{workspaceId:ctx.workspace.id,projectId:chosenProject.id,ownerId:ctx.workspace.owner_id});if(closed||request!==generation)return;data=loaded;draw()}catch(error){if(closed||request!==generation)return;modal.innerHTML=`<div class="modal project-history-modal" role="dialog" aria-modal="true" aria-labelledby="historyLoadError"><h2 id="historyLoadError">Não foi possível abrir o histórico</h2><p>${h(error.message)}</p><div class="modal-footer"><button class="btn" data-retry-history>Tentar novamente</button><button class="btn primary" data-close-history>Voltar ao projeto atual</button></div></div>`;modal.querySelector('[data-retry-history]').onclick=load;modal.querySelector('[data-close-history]').onclick=close;modal.querySelector('[data-close-history]').focus()}
  };
  modal.onclick=event=>{if(event.target===modal)close()};bindKeyboard(modal,close);root.inert=true;document.body.style.overflow='hidden';document.body.appendChild(modal);window.addEventListener('hashchange',close);load();return {close};
}
