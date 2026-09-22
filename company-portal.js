import {PORTAL_LIMITS,escapePortalHTML as esc,readPortalToken,portalAssetUrl,portalStatus,validatePortalFile,validatePortalOrder,normalizePortalRead,mergePortalOrders,buildPortalSubmission,portalRequestId,isPortalDuplicateUpload} from './company-portal-core.js?v=2.17.12';
import {processCompanyArtwork,artworkPhysicalSize,ARTWORK_RULER_HINT} from './company-artwork.js?v=2.17.12';

const SUPABASE_URL='https://kedggjyerexnzmipaick.supabase.co';
const SUPABASE_KEY='sb_publishable_WoobBV7n0p5Jf-4DLJVzIA_4sUoAvsT';
const PAGE_SIZE=30;
const ICONS={plus:'<path d="M12 5v14M5 12h14"/>',box:'<path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z"/><path d="m3 8 9 5 9-5M12 13v8M7.5 5.5l9 5"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',check:'<path d="m5 12 4 4L19 6"/>',shirt:'<path d="m8 3-5 3-2 6 5 2v7h12v-7l5-2-2-6-5-3c0 4-8 4-8 0Z"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 13 3M18 18a8 8 0 0 1-13-3"/>',chevron:'<path d="m6 9 6 6 6-6"/>',upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]||ICONS.box}</svg>`;
const count=value=>new Intl.NumberFormat('pt-BR').format(Number(value)||0);
const formatDate=(value,options)=>{if(!value)return '';const date=new Date(/^\d{4}-\d{2}-\d{2}$/.test(value)?`${value}T12:00:00`:value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('pt-BR',options||{day:'2-digit',month:'short',year:'numeric'}).format(date):'';};
const header=()=>'<header class="portal-header"><div class="portal-wrap portal-header-inner"><img class="portal-logo" src="/zero19-logo.png" alt="Zero 19"><span class="portal-header-label">Área da empresa</span></div></header>';

// Bound waiting without automatically retrying order writes. A timeout is an unknown outcome.
async function portalFetch(input,init={}){
  const abort=new AbortController(),source=init.signal||input?.signal;
  const cancel=()=>abort.abort(source?.reason);
  if(source?.aborted)cancel();else source?.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(()=>abort.abort(),String(input?.url||input).includes('/storage/v1/')?180000:35000);
  try{return await fetch(input,{...init,signal:abort.signal});}
  finally{clearTimeout(timer);source?.removeEventListener('abort',cancel);}
}

export function renderPortalOrder(order){
  const status=portalStatus(order.status),total=order.items.reduce((sum,item)=>sum+(Number(item.quantity)||0),0);
  const itemHTML=order.items.map(item=>{
    const artUrl=portalAssetUrl(item.original_path,SUPABASE_URL);
    return `<div class="portal-order-item">${artUrl?`<a class="portal-art-thumb" href="${esc(artUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir arte ${esc(item.art_name||item.product_name)}"><img src="${esc(artUrl)}" alt="${esc(item.art_name||'Arte enviada')}" loading="lazy" decoding="async"></a>`:'<span class="portal-art-thumb portal-art-fallback">Arte indisponível</span>'}<div class="portal-item-copy"><b>${esc(item.product_name)}</b><p>Tamanho ${esc(item.size)}${item.color?' · '+esc(item.color):''} · ${esc(item.art_name||'Arte enviada')}</p>${item.width_cm&&item.height_cm?`<p>Arte: ${count(item.width_cm)} × ${count(item.height_cm)} cm</p>`:''}</div><div class="portal-item-count">${count(item.quantity)} ${Number(item.quantity)===1?'peça':'peças'}${Number(item.exported_quantity)>0?`<small title="Quantidade incluída no arquivo de produção. A entrega é confirmada pelo status do pedido.">${count(item.exported_quantity)} em filme</small>`:''}</div></div>`;
  }).join('');
  return `<article class="portal-order" data-order-id="${esc(order.id)}"><div class="portal-order-head"><div class="portal-order-heading"><div class="portal-order-number">Pedido ${esc(order.number?'#'+order.number:order.id.slice(0,8))}</div><h3>${esc(order.title||'Solicitação de produção')}</h3><div class="portal-order-meta"><span>${esc(formatDate(order.created_at))}</span><span>${count(total)} ${total===1?'peça':'peças'} · ${count(order.items.length)} ${order.items.length===1?'item':'itens'}</span>${order.delivery_date?`<span>Entrega: ${esc(formatDate(order.delivery_date))}</span>`:''}</div></div><div class="portal-status-box"><small>Status do pedido</small><span class="portal-status" style="--status:${status.color}">${esc(status.name)}</span></div></div><details class="portal-order-details"><summary><span>Ver itens e artes do pedido</span>${icon('chevron')}</summary><div class="portal-order-items">${itemHTML}</div>${order.notes?`<p class="portal-order-notes">${esc(order.notes)}</p>`:''}</details></article>`;
}

export async function mountCompanyPortal({root,client,token,pendingStorage=globalThis.sessionStorage}={}){
  if(!root||!client||!token)throw new Error('A página precisa de um link de empresa válido.');
  let data=null,orders=[],filter='all',pages=1,catalogPages=1,hasMore=false,reading=false,sending=false,disposed=false,dialog=null,requestId=null,pending=null;
  let draft={title:'',notes:'',items:[]},lastOrdersHTML='',lastReadAt=null,readTimer=null,formLocked=false;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  const pendingKey='z19-company-submit-'+[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('').slice(0,24);
  try{const stored=JSON.parse(pendingStorage?.getItem(pendingKey)||'null');if(stored&&typeof stored.requestId==='string'&&stored.order&&Array.isArray(stored.order.items))pending=stored;}catch{}
  const $=selector=>root.querySelector(selector);
  const call=async(name,args)=>{const result=await client.rpc(name,args);if(result.error)throw result.error;return result.data;};
  const savePending=()=>{try{pendingStorage?.setItem(pendingKey,JSON.stringify(pending));}catch{/* The open form remains the retry source when browser storage is unavailable. */}};
  const clearPending=()=>{pending=null;try{pendingStorage?.removeItem(pendingKey);}catch{}};
  const notice=(message,type='error')=>{const target=$('#portalNotice');if(target){target.className=`portal-notice ${type}`;target.textContent=message;target.hidden=!message;}};
  function initialError(message){root.innerHTML=`${header()}<main class="portal-wrap portal-loading"><div class="portal-empty-icon">${icon('box')}</div><h1>Não foi possível abrir a página</h1><p>${esc(message)}</p><button class="portal-btn" id="portalRetry">${icon('refresh')}Tentar novamente</button></main>`;$('#portalRetry').onclick=()=>refresh();}
  function renderShell(){
    root.innerHTML=`${header()}<main class="portal-wrap portal-main"><section class="portal-hero"><div class="portal-company-copy"><div class="portal-eyebrow">Seus pedidos, do envio à produção</div><h1 id="portalCompanyName"></h1><p id="portalContact"></p></div><button class="portal-btn primary" id="portalNewOrder">${icon('plus')}Solicitar peças para produção</button></section><div id="portalNotice" class="portal-notice" role="status" hidden></div><div id="portalRecovery" class="portal-notice portal-recovery" hidden></div><section id="portalSummary" class="portal-stats" aria-label="Resumo dos pedidos"></section><section aria-labelledby="portalOrdersTitle"><div class="portal-section-heading"><div><h2 id="portalOrdersTitle">Seus pedidos</h2><p>Acompanhe o andamento e consulte as artes enviadas.</p><div class="portal-sync" id="portalSync"><span class="portal-sync-dot"></span><span>Atualização automática</span></div></div><button class="portal-btn quiet small" id="portalRefresh" aria-label="Atualizar pedidos">${icon('refresh')}<span class="portal-refresh-label">Atualizar</span></button></div><div class="portal-filters" role="group" aria-label="Filtrar pedidos"><button class="portal-filter active" data-filter="all" aria-pressed="true">Todos</button><button class="portal-filter" data-filter="active" aria-pressed="false">Em andamento</button><button class="portal-filter" data-filter="completed" aria-pressed="false">Encerrados</button></div><div id="portalOrders" class="portal-orders"></div><button id="portalMore" class="portal-btn quiet portal-load-more" hidden>Carregar mais pedidos</button></section><footer class="portal-footer"><span>Produção e personalização · Zero 19</span><span>O andamento é atualizado pela nossa equipe.</span></footer></main>`;
    $('#portalNewOrder').onclick=openForm;$('#portalRefresh').onclick=()=>refresh();$('#portalMore').onclick=loadMore;
    root.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;root.querySelectorAll('[data-filter]').forEach(other=>{other.classList.toggle('active',other===button);other.setAttribute('aria-pressed',String(other===button));});renderOrders();});
    root.addEventListener('error',imageError,true);
    showRecovery();
  }
  function imageError(event){const image=event.target;if(image.tagName==='IMG'&&image.closest('.portal-art-thumb')){const fallback=document.createElement('span');fallback.className='portal-art-fallback';fallback.textContent='Abrir arte';image.replaceWith(fallback);}}
  function showRecovery(){
    const recovery=$('#portalRecovery');if(!recovery)return;
    recovery.hidden=!pending;if(!pending)return;
    recovery.innerHTML=`<p>A confirmação de um pedido ficou pendente. Confira o envio para continuar.</p><button class="portal-btn small" id="portalRecover">Conferir envio</button>`;
    $('#portalRecover').onclick=recoverPending;
  }
  function renderData(){
    $('#portalCompanyName').textContent=data.company.company_name;
    $('#portalContact').textContent=data.company.client_name?`Responsável: ${data.company.client_name}`:'Sua página exclusiva de produção';
    document.title=`${data.company.company_name} · Pedidos · Zero 19`;
    const summary=data.summary||{total:orders.length,active:orders.filter(order=>!order.status.finalized).length,completed:orders.filter(order=>order.status.finalized).length,pieces:orders.reduce((sum,order)=>sum+order.items.reduce((qty,item)=>qty+(Number(item.quantity)||0),0),0)};
    $('#portalSummary').innerHTML=[['Pedidos enviados',summary.total,'box'],['Em andamento',summary.active,'clock'],['Encerrados',summary.completed,'check'],['Peças solicitadas',summary.pieces,'shirt']].map(([label,value,shape],index)=>`<div class="portal-stat ${index===1?'accent':''}"><div class="portal-stat-top"><span class="portal-stat-label">${label}</span>${icon(shape)}</div><div class="portal-stat-value">${count(value)}</div></div>`).join('');
    $('#portalSync').classList.remove('stale');$('#portalSync').lastElementChild.textContent=`Atualizado às ${formatDate(lastReadAt,{hour:'2-digit',minute:'2-digit'})} · atualização automática`;
    renderOrders();
  }
  function renderOrders(){
    const visible=orders.filter(order=>filter==='all'||(filter==='completed')===order.status.finalized);
    const markup=visible.length?visible.map(renderPortalOrder).join(''):`<div class="portal-empty"><div class="portal-empty-icon">${icon('shirt')}</div><h3>${orders.length?'Nenhum pedido neste filtro':'Tudo pronto para o primeiro pedido'}</h3><p>${orders.length?'Os pedidos aparecem aqui conforme o andamento da produção.':'Escolha os produtos, informe os tamanhos e envie as artes. Você acompanha cada etapa por aqui.'}</p>${!orders.length?`<button class="portal-btn primary" id="portalFirstOrder">${icon('plus')}Solicitar peças para produção</button>`:''}</div>`;
    if(markup!==lastOrdersHTML){const opened=new Set([...root.querySelectorAll('.portal-order-details[open]')].map(details=>details.closest('[data-order-id]').dataset.orderId));$('#portalOrders').innerHTML=markup;root.querySelectorAll('[data-order-id]').forEach(card=>{if(opened.has(card.dataset.orderId))card.querySelector('details').open=true;});$('#portalFirstOrder')?.addEventListener('click',openForm);lastOrdersHTML=markup;}
    $('#portalMore').hidden=!hasMore;
  }
  async function refresh(){
    if(reading||disposed)return;reading=true;$('#portalRefresh')?.setAttribute('disabled','');
    try{
      let next=null,fresh=[],more=false;
      for(let page=0;page<pages;page++){
        const chunk=normalizePortalRead(await call('z19p_company_portal_read',{p_token:token,p_limit:PAGE_SIZE,p_offset:page*PAGE_SIZE}));
        if(disposed)return;next=next||chunk;fresh=mergePortalOrders(fresh,chunk.orders);more=chunk.has_more===true;
        if(!more)break;
      }
      for(let page=1;page<catalogPages&&next.catalog_has_more;page++){const chunk=await call('z19p_company_portal_catalog',{p_token:token,p_limit:100,p_offset:next.catalog.length});if(!Array.isArray(chunk?.catalog))throw new Error('Catálogo indisponível.');next.catalog.push(...chunk.catalog);next.catalog_has_more=chunk.has_more===true;}
      const first=!data;data=next;orders=fresh;hasMore=more;lastReadAt=new Date().toISOString();
      if(first)renderShell();else if($('#portalNotice')?.dataset.readError){notice('');delete $('#portalNotice').dataset.readError;}
      renderData();updateCatalogSelectors();
    }catch(error){
      if(disposed)return;
      if(!data)initialError(error?.code==='P0001'?'Este link está indisponível ou foi desativado. Confira o link enviado pela Zero 19.':'Não conseguimos consultar os pedidos agora. Verifique a conexão e tente novamente.');
      else{notice('Não foi possível atualizar agora. Os pedidos abaixo são da última consulta; seu formulário continua preservado.');$('#portalNotice').dataset.readError='true';$('#portalSync').classList.add('stale');$('#portalSync').lastElementChild.textContent='Atualização pendente · tente novamente';}
    }finally{reading=false;$('#portalRefresh')?.removeAttribute('disabled');}
  }
  async function loadMore(){
    if(reading||disposed)return;reading=true;const button=$('#portalMore');button.disabled=true;
    try{const chunk=normalizePortalRead(await call('z19p_company_portal_read',{p_token:token,p_limit:PAGE_SIZE,p_offset:orders.length}));if(disposed)return;orders=mergePortalOrders(orders,chunk.orders);hasMore=chunk.has_more===true;pages+=1;renderOrders();}
    catch{notice('Não foi possível carregar os próximos pedidos. Tente novamente.');}
    finally{reading=false;if(button.isConnected)button.disabled=false;}
  }
  function updateCatalogSelectors(){
    if(!dialog)return;
    for(const select of dialog.querySelectorAll('[data-catalog]')){const selected=select.value;const next=`<option value="">${data.catalog.length?'Selecione uma arte':'Nenhuma arte salva ainda'}</option>`+data.catalog.map(art=>`<option value="${esc(art.id)}">${esc(art.name)}</option>`).join('');if(select.dataset.catalogMarkup!==next){select.innerHTML=next;select.value=selected;select.dataset.catalogMarkup=next;}}
    dialog.querySelectorAll('[data-more-catalog]').forEach(button=>{button.hidden=!data.catalog_has_more;});
  }
  async function loadMoreCatalog(){
    if(reading||sending||disposed)return;reading=true;dialog?.querySelectorAll('[data-more-catalog]').forEach(button=>{button.disabled=true;button.textContent='Carregando artes…';});
    try{const chunk=await call('z19p_company_portal_catalog',{p_token:token,p_limit:100,p_offset:data.catalog.length});if(!Array.isArray(chunk?.catalog))throw new Error('Catálogo indisponível.');const catalog=new Map(data.catalog.map(art=>[art.id,art]));for(const art of chunk.catalog)catalog.set(art.id,art);data.catalog=[...catalog.values()];data.catalog_has_more=chunk.has_more===true;catalogPages+=1;updateCatalogSelectors();}
    catch{formError('Não foi possível carregar mais artes. Tente novamente.');}
    finally{reading=false;dialog?.querySelectorAll('[data-more-catalog]').forEach(button=>{button.disabled=false;button.textContent='Carregar mais artes';});}
  }
  function newRow(productId=''){return {id:portalRequestId(),processed_id:portalRequestId(),product_id:productId,size:'',color:'',quantity:1,art_mode:'new',art_name:'',width_cm:'',height_cm:null,file:null,processed:null,processing:false,preview:null,error:''};}
  function openForm(){
    if(pending){recoverPending();return;}
    if(!data.products.length){notice('O catálogo de produtos ainda não está disponível para novos pedidos. A equipe precisa cadastrar os produtos.');return;}
    if(dialog){dialog.showModal();return;}
    if(!draft.items.length)draft.items.push(newRow());
    dialog=document.createElement('dialog');dialog.className='portal-dialog';dialog.setAttribute('aria-labelledby','portalFormTitle');
    dialog.innerHTML=`<form id="portalOrderForm" novalidate><div class="portal-dialog-head"><div><div class="portal-eyebrow">Novo pedido</div><h2 id="portalFormTitle">Solicitar peças para produção</h2><p>Monte seu pedido e envie a arte de cada item.</p></div><button class="portal-icon-button" type="button" id="portalCloseForm" aria-label="Fechar formulário">${icon('close')}</button></div><div class="portal-form-body"><fieldset class="portal-form-fields" id="portalFormFields"><div class="portal-field"><label for="portalOrderTitle">Nome do pedido <small>opcional</small></label><input id="portalOrderTitle" maxlength="160" placeholder="Ex.: Coleção de verão" autocomplete="off" value="${esc(draft.title)}"></div><section class="portal-form-section"><div class="portal-form-section-head"><h3>Produtos e artes</h3><span class="portal-field-label" id="portalItemsCount"></span></div><p class="portal-form-hint">Use uma linha para cada produto, tamanho e arte. Para camisas com artes diferentes, adicione mais uma linha.</p><div class="portal-draft-items" id="portalDraftItems"></div><button class="portal-btn portal-add-item" id="portalAddItem" type="button">${icon('plus')}Adicionar produto / tamanho</button></section><div class="portal-field"><label for="portalOrderNotes">Observações <small>opcional</small></label><textarea id="portalOrderNotes" maxlength="3000" placeholder="Cores das camisas, posição das estampas ou outras orientações para a equipe.">${esc(draft.notes)}</textarea></div></fieldset><div class="portal-notice error portal-form-error" id="portalFormError" role="alert" hidden></div><p class="portal-submit-status" id="portalSubmitStatus" role="status" hidden></p><p class="portal-submission-lock" id="portalSubmissionLock" hidden>O envio já começou. A conferência mantém os mesmos itens para evitar pedidos duplicados.</p></div><div class="portal-form-footer"><div class="portal-order-total"><b id="portalOrderTotal">0 peças</b><small>para solicitar</small></div><div class="portal-form-actions"><button class="portal-btn quiet" type="button" id="portalCancelForm">Fechar</button><button class="portal-btn primary" id="portalSubmit" type="submit">Enviar pedido ${icon('arrow')}</button></div></div></form>`;
    const colors=document.createElement('datalist');colors.id='portalColorOptions';colors.innerHTML=['Preta','Branca','Off-white','Azul','Azul-marinho','Vermelha','Verde','Amarela','Cinza','Rosa','Bege'].map(color=>`<option value="${color}"></option>`).join('');dialog.appendChild(colors);
    root.appendChild(dialog);const q=selector=>dialog.querySelector(selector);
    const editButton=document.createElement('button');editButton.type='button';editButton.id='portalEditSubmission';editButton.className='portal-btn quiet';editButton.textContent='Editar pedido';editButton.hidden=true;editButton.onclick=resetSubmission;q('.portal-form-actions').prepend(editButton);
    q('#portalOrderTitle').oninput=event=>{draft.title=event.target.value;};q('#portalOrderNotes').oninput=event=>{draft.notes=event.target.value;};
    q('#portalAddItem').onclick=()=>{if(draft.items.length>=PORTAL_LIMITS.maxItems)return;draft.items.push(newRow(draft.items.at(-1)?.product_id));appendRow(draft.items.at(-1));updateTotal();dialog.querySelector(`[data-draft-id="${draft.items.at(-1).id}"] select`).focus();};
    q('#portalCloseForm').onclick=q('#portalCancelForm').onclick=()=>{if(!sending)dialog.close();};
    dialog.addEventListener('cancel',event=>{if(sending)event.preventDefault();});q('#portalOrderForm').onsubmit=event=>{event.preventDefault();submitOrder();};
    for(const row of draft.items)appendRow(row);updateTotal();dialog.showModal();
  }
  function appendRow(row){
    const index=draft.items.indexOf(row)+1,element=document.createElement('article');element.className='portal-draft-item';element.dataset.draftId=row.id;
    element.innerHTML=`<div class="portal-draft-item-head"><b>Item <span data-row-number>${index}</span></b><button class="portal-icon-button" type="button" data-remove aria-label="Remover item ${index}">${icon('trash')}</button></div><div class="portal-draft-fields"><div class="portal-field"><label for="product-${row.id}">Produto</label><select id="product-${row.id}" data-product required><option value="">Selecione um produto</option>${data.products.map(product=>`<option value="${esc(product.id)}"${product.id===row.product_id?' selected':''}>${esc(product.name)}</option>`).join('')}</select></div><div class="portal-field"><label for="size-${row.id}">Tamanho</label><select id="size-${row.id}" data-size required><option value="">Selecione</option>${data.sizes.map(size=>`<option value="${esc(size)}"${size===row.size?' selected':''}>${esc(size)}</option>`).join('')}</select></div><div class="portal-field"><label for="color-${row.id}">Cor da peça</label><input id="color-${row.id}" data-color list="portalColorOptions" maxlength="60" required placeholder="Ex.: Preta" value="${esc(row.color)}"></div><div class="portal-field"><label for="quantity-${row.id}">Quantidade</label><input id="quantity-${row.id}" data-quantity type="number" min="1" max="1000" step="1" inputmode="numeric" required value="${esc(row.quantity)}"></div></div><div class="portal-art-mode" role="group" aria-label="Origem da arte do item ${index}"><button type="button" data-art-mode="new" class="active" aria-pressed="true">Enviar nova arte</button><button type="button" data-art-mode="catalog" aria-pressed="false">Usar arte já salva</button></div><div data-new-art><label class="portal-upload"><span class="portal-upload-icon" data-file-preview>${icon('upload')}</span><span class="portal-upload-copy"><b data-file-name>Escolher arte deste item</b><small data-file-meta>PNG, JPG ou WebP · até 25 MB<br>A arte será preparada em PNG 300 DPI.</small></span><span class="portal-upload-action">Selecionar</span><input data-file type="file" accept="image/png,image/jpeg,image/webp" aria-label="Arte do item ${index}"></label><p class="portal-file-error" data-file-error hidden></p></div><div data-catalog-art hidden><div class="portal-field"><label for="catalog-${row.id}">Artes salvas da empresa</label><select id="catalog-${row.id}" data-catalog><option value="">${data.catalog.length?'Selecione uma arte':'Nenhuma arte salva ainda'}</option>${data.catalog.map(art=>`<option value="${esc(art.id)}">${esc(art.name)}</option>`).join('')}</select></div><div class="portal-catalog-preview" data-catalog-preview hidden></div><p class="portal-form-hint portal-catalog-hint">As novas artes ficam salvas aqui após o envio do pedido.</p></div><div class="portal-field portal-art-name"><label for="artname-${row.id}">Nome da arte <span class="portal-required">obrigatório</span></label><input id="artname-${row.id}" data-art-name required maxlength="160" autocomplete="off" placeholder="Digite um nome para identificar esta arte" value="${esc(row.art_name)}"></div><div class="portal-art-measures"><p class="portal-ruler-hint">${esc(ARTWORK_RULER_HINT)}</p><div class="portal-measure-fields"><div class="portal-field"><label for="width-${row.id}">Largura da arte (cm)</label><input id="width-${row.id}" data-art-width type="number" min="0.1" max="100" step="0.1" inputmode="decimal" required placeholder="Ex.: 28" value="${esc(row.width_cm)}"></div><div class="portal-measure-height"><span>Altura proporcional</span><strong data-art-height aria-live="polite">— cm</strong></div></div><p class="portal-proportion-hint">Ao mudar a largura, a altura se ajusta automaticamente, mantendo a proporção.</p></div>`;
    const q=selector=>element.querySelector(selector);
    const moreCatalog=document.createElement('button');moreCatalog.type='button';moreCatalog.className='portal-btn quiet small portal-catalog-more';moreCatalog.dataset.moreCatalog='';moreCatalog.textContent='Carregar mais artes';moreCatalog.hidden=!data.catalog_has_more;moreCatalog.onclick=loadMoreCatalog;q('[data-catalog-art]').appendChild(moreCatalog);
    q('[data-product]').onchange=event=>{row.product_id=event.target.value;};q('[data-size]').onchange=event=>{row.size=event.target.value;};q('[data-color]').oninput=event=>{row.color=event.target.value;};q('[data-quantity]').oninput=event=>{row.quantity=event.target.value;updateTotal();};
    q('[data-art-name]').oninput=event=>{row.art_name=event.target.value;};q('[data-art-width]').oninput=event=>{row.width_cm=event.target.value;updateMeasurements();};
    function updateMeasurements(){
      const art=row.art_mode==='catalog'?data.catalog.find(asset=>asset.id===row.reference_asset_id):row.processed;
      row.height_cm=null;q('[data-art-height]').textContent='— cm';q('[data-art-height]').title='';
      if(!art||row.width_cm==='')return;
      try{const physical=artworkPhysicalSize(row.width_cm,Number(art.width),Number(art.height));row.height_cm=physical.heightCm;q('[data-art-height]').textContent=count(physical.heightCm)+' cm';}
      catch(error){q('[data-art-height]').textContent='Confira a largura';q('[data-art-height]').title=error.message;}
    }
    element.querySelectorAll('[data-art-mode]').forEach(button=>button.onclick=()=>{
      if(formLocked)return;const mode=button.dataset.artMode;if(row.art_mode===mode)return;row.art_mode=mode;
      element.querySelectorAll('[data-art-mode]').forEach(other=>{other.classList.toggle('active',other===button);other.setAttribute('aria-pressed',String(other===button));});
      q('[data-new-art]').hidden=mode!=='new';q('[data-catalog-art]').hidden=mode!=='catalog';q('[data-art-name]').readOnly=mode==='catalog';
      const selected=data.catalog.find(asset=>asset.id===row.reference_asset_id);row.art_name=mode==='catalog'?(selected?.name||''):row.new_art_name||'';q('[data-art-name]').value=row.art_name;
      if(mode==='catalog'&&selected){row.width_cm=selected.width_cm||'';q('[data-art-width]').value=row.width_cm;}
      updateMeasurements();
    });
    q('[data-art-name]').oninput=event=>{row.art_name=event.target.value;row.new_art_name=row.art_name;};
    q('[data-catalog]').onchange=event=>{
      row.reference_asset_id=event.target.value;const art=data.catalog.find(asset=>asset.id===row.reference_asset_id);row.art_name=art?.name||'';q('[data-art-name]').value=row.art_name;row.width_cm=art?.width_cm||'';q('[data-art-width]').value=row.width_cm;
      const preview=q('[data-catalog-preview]');preview.replaceChildren();preview.hidden=!art;
      if(art){const url=portalAssetUrl(art.processed_path||art.original_path,SUPABASE_URL);if(url){const image=document.createElement('img');image.src=url;image.alt=art.name;image.loading='lazy';image.onerror=()=>image.remove();preview.appendChild(image);}const name=document.createElement('span');name.textContent=art.name;preview.appendChild(name);}
      updateMeasurements();
    };
    element.querySelector('[data-remove]').onclick=()=>{if(formLocked)return;const oldIndex=draft.items.indexOf(row);if(row.preview)URL.revokeObjectURL(row.preview);draft.items=draft.items.filter(item=>item!==row);element.remove();if(!draft.items.length){draft.items.push(newRow());appendRow(draft.items[0]);}dialog.querySelectorAll('[data-row-number]').forEach((number,i)=>number.textContent=i+1);updateTotal();const remaining=dialog.querySelectorAll('[data-draft-id]');remaining[Math.min(oldIndex,remaining.length-1)].querySelector('select').focus();};
    element.querySelector('[data-file]').onchange=async event=>{
      const file=event.target.files?.[0];if(!file)return;
      const error=validatePortalFile(file),errorTarget=element.querySelector('[data-file-error]');errorTarget.hidden=!error;errorTarget.textContent=error;
      if(error){event.target.value='';return;}
      const generation=Symbol();row.fileGeneration=generation;row.processing=true;q('[data-file-meta]').textContent='Preparando arte e conferindo suas proporções…';
      try{
        const prepared=await processCompanyArtwork(file);
        if(disposed||row.fileGeneration!==generation||!draft.items.includes(row))return;
        if(row.preview)URL.revokeObjectURL(row.preview);row.file=file;row.processed=prepared;row.preview=URL.createObjectURL(prepared.processedBlob);row.error='';
        const preview=document.createElement('img');preview.src=row.preview;preview.alt='Prévia da arte preparada';preview.onerror=()=>{preview.replaceWith(document.createTextNode('Arte'));};q('[data-file-preview]').replaceChildren(preview);
        q('[data-file-name]').textContent=file.name;q('[data-file-meta]').textContent=`PNG 300 DPI · ${prepared.width} × ${prepared.height} px · bordas transparentes ajustadas`;updateMeasurements();
      }catch(failure){if(row.fileGeneration===generation){errorTarget.hidden=false;errorTarget.textContent=failure.message||'Não foi possível preparar esta arte. Escolha outro arquivo.';q('[data-file-meta]').textContent=row.file?'A arte selecionada anteriormente foi preservada.':'Escolha um arquivo PNG, JPG ou WebP válido.';}}
      finally{if(row.fileGeneration===generation)row.processing=false;}
    };
    dialog.querySelector('#portalDraftItems').appendChild(element);
    if(row.processed&&row.file&&row.preview){const image=document.createElement('img');image.src=row.preview;image.alt='Prévia da arte preparada';q('[data-file-preview]').replaceChildren(image);q('[data-file-name]').textContent=row.file.name;q('[data-file-meta]').textContent=`PNG 300 DPI · ${row.processed.width} × ${row.processed.height} px · bordas transparentes ajustadas`;}
    if(row.art_mode==='catalog'){const width=row.width_cm;row.art_mode='new';q('[data-catalog]').value=row.reference_asset_id||'';q('[data-art-mode="catalog"]').click();row.width_cm=width;q('[data-art-width]').value=width;}
    updateMeasurements();
  }
  function updateTotal(){
    if(!dialog)return;
    const total=draft.items.reduce((sum,row)=>sum+(Number(row.quantity)||0),0);dialog.querySelector('#portalOrderTotal').textContent=`${count(total)} ${total===1?'peça':'peças'}`;dialog.querySelector('#portalItemsCount').textContent=`${count(draft.items.length)} ${draft.items.length===1?'item':'itens'}`;dialog.querySelector('#portalAddItem').disabled=draft.items.length>=PORTAL_LIMITS.maxItems;
  }
  function formError(message){const target=dialog?.querySelector('#portalFormError');if(target){target.textContent=message;target.hidden=!message;if(message)target.scrollIntoView({block:'nearest',behavior:'smooth'});}}
  function progress(message){const target=dialog?.querySelector('#portalSubmitStatus');if(target){target.textContent=message;target.hidden=!message;}}
  function lockForm(locked){formLocked=locked;if(dialog){dialog.querySelector('#portalFormFields').disabled=locked;dialog.querySelector('#portalSubmissionLock').hidden=!locked;}}
  function setSending(value){sending=value;if(dialog){dialog.querySelector('#portalSubmit').disabled=value;dialog.querySelector('#portalCloseForm').disabled=value;dialog.querySelector('#portalCancelForm').disabled=value;const edit=dialog.querySelector('#portalEditSubmission');edit.hidden=!formLocked||Boolean(pending);edit.disabled=value;}const recover=$('#portalRecover');if(recover)recover.disabled=value;}
  function resetSubmission(){
    if(pending||sending||!dialog)return;requestId=null;lockForm(false);
    for(const row of draft.items){row.id=portalRequestId();row.processed_id=portalRequestId();row.uploadedOriginal=false;row.uploadedProcessed=false;}
    dialog.querySelector('#portalDraftItems').replaceChildren();for(const row of draft.items)appendRow(row);updateTotal();formError('');progress('');dialog.querySelector('#portalSubmit').innerHTML=`Enviar pedido ${icon('arrow')}`;dialog.querySelector('#portalEditSubmission').hidden=true;
  }
  function finishSubmission(result){
    if(!result?.order_id)throw new Error('A confirmação recebida está incompleta. Confira novamente usando este mesmo pedido.');
    clearPending();showRecovery();for(const row of draft.items)if(row.preview)URL.revokeObjectURL(row.preview);
    dialog?.close();dialog?.remove();dialog=null;draft={title:'',notes:'',items:[]};requestId=null;formLocked=false;
    notice(`Pedido ${result.number?'#'+result.number+' ':''}enviado! Ele está pendente de produção e pode ser acompanhado aqui.`,'success');filter='all';root.querySelectorAll('[data-filter]').forEach(button=>{button.classList.toggle('active',button.dataset.filter==='all');button.setAttribute('aria-pressed',String(button.dataset.filter==='all'));});refresh();$('#portalOrdersTitle')?.scrollIntoView({block:'start',behavior:'smooth'});
  }
  async function submitOrder(){
    if(sending||disposed)return;
    if(pending){await recoverPending();return;}
    const validation=validatePortalOrder(draft,data.products,data.sizes,data.catalog);if(validation){formError(validation);return;}
    for(const row of draft.items){const art=row.art_mode==='catalog'?data.catalog.find(asset=>asset.id===row.reference_asset_id):row.processed;try{row.height_cm=artworkPhysicalSize(row.width_cm,Number(art.width),Number(art.height)).heightCm;}catch(error){formError(error.message);return;}}
    const uploadEntries=draft.items.flatMap((row,index)=>row.art_mode==='catalog'?[]:[{row,index,client_id:row.id,name:row.file.name,file:row.file,doneKey:'uploadedOriginal'},{row,index,client_id:row.processed_id,name:row.art_name.trim()+'.png',file:row.processed.processedBlob,doneKey:'uploadedProcessed'}]);
    if(uploadEntries.reduce((sum,entry)=>sum+entry.file.size,0)>250*1024*1024){formError('As artes deste pedido ultrapassam 250 MB. Divida as peças em mais de um pedido.');return;}
    formError('');setSending(true);lockForm(true);requestId=requestId||portalRequestId();
    try{
      progress('Preparando o envio das artes…');
      const files=uploadEntries.map(entry=>({client_id:entry.client_id,name:entry.name,mime_type:entry.file.type,size_bytes:entry.file.size}));
      const reservation=await call('z19p_company_portal_reserve',{p_token:token,p_request_id:requestId,p_files:files});
      if(!reservation||reservation.request_id!==requestId||!Array.isArray(reservation.uploads)||reservation.uploads.length!==files.length)throw new Error('Não foi possível reservar o envio das artes. Tente novamente.');
      for(let index=0;index<uploadEntries.length;index++){
        const entry=uploadEntries[index],row=entry.row,upload=reservation.uploads.find(item=>item.client_id===entry.client_id);
        if(!upload||upload.bucket!=='z19p-assets'||!portalAssetUrl(upload.path,SUPABASE_URL))throw new Error('O destino de uma arte não pôde ser conferido. Tente novamente.');
        progress(`Enviando arquivo ${index+1} de ${uploadEntries.length}: ${entry.name}`);
        if(!row[entry.doneKey]){const result=await client.storage.from(upload.bucket).upload(upload.path,entry.file,{upsert:false,contentType:entry.file.type,cacheControl:'3600'});if(result.error&&!isPortalDuplicateUpload(result.error))throw new Error(`Não foi possível enviar a arte do item ${entry.index+1}. Verifique sua conexão e tente novamente.`);row[entry.doneKey]=true;}
      }
      pending={requestId,order:buildPortalSubmission(draft),createdAt:new Date().toISOString()};savePending();showRecovery();progress('Confirmando o pedido…');
      const result=await call('z19p_company_portal_submit',{p_token:token,p_request_id:requestId,p_order:pending.order});finishSubmission(result);
    }catch(error){
      if(pending&&error?.code==='P0001'){clearPending();showRecovery();setSending(false);resetSubmission();formError(error.message||'Confira os itens e tente enviar novamente.');}
      else{formError(pending?'As artes foram enviadas, mas a confirmação do pedido ficou pendente. Clique em Conferir envio; o mesmo pedido será conferido sem duplicar.':error?.message||'Não foi possível enviar agora. Seus itens e artes continuam neste formulário. Tente novamente.');progress('');if(dialog)dialog.querySelector('#portalSubmit').innerHTML=pending?'Conferir envio':'Tentar enviar novamente';}
    }
    finally{setSending(false);}
  }
  async function recoverPending(){
    if(!pending||sending||disposed)return;setSending(true);formError('');progress('Conferindo o envio do pedido…');
    try{const result=await call('z19p_company_portal_submit',{p_token:token,p_request_id:pending.requestId,p_order:pending.order});finishSubmission(result);}
    catch{const message='Ainda não foi possível confirmar o envio. Tente conferir novamente; a identificação do pedido foi preservada para evitar duplicação.';notice(message);formError(message);progress('');}
    finally{setSending(false);}
  }
  const onFocus=()=>{if(!document.hidden)refresh();};
  const beforeUnload=event=>{if(sending||draft.title||draft.notes||draft.items.some(row=>row.file||row.reference_asset_id||row.product_id||row.color||row.art_name)||pending){event.preventDefault();event.returnValue='';}};
  window.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onFocus);window.addEventListener('beforeunload',beforeUnload);
  await refresh();readTimer=setInterval(onFocus,20000);
  return {refresh,dispose(){disposed=true;clearInterval(readTimer);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onFocus);window.removeEventListener('beforeunload',beforeUnload);root.removeEventListener('error',imageError,true);for(const row of draft.items)if(row.preview)URL.revokeObjectURL(row.preview);dialog?.close();dialog?.remove();}};
}

async function boot(){
  const root=document.getElementById('companyPortal');if(!root)return;
  const token=readPortalToken(location);
  if(!token){root.innerHTML=`${header()}<main class="portal-wrap portal-loading"><div class="portal-empty-icon">${icon('box')}</div><h1>Abra o link exclusivo da sua empresa</h1><p>Use o endereço enviado pela Zero 19 para solicitar peças e acompanhar seus pedidos.</p></main>`;return;}
  // Move a query token into the fragment before any service request or external module loads.
  if(location.search){const url=new URL(location.href);url.searchParams.delete('token');url.hash='/'+token;history.replaceState(null,'',url.pathname+url.search+url.hash);}
  try{
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.57.4');
    const client=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'z19-company-portal-anon'},global:{fetch:portalFetch}});
    await mountCompanyPortal({root,client,token});
    window.addEventListener('hashchange',()=>{if(readPortalToken(location)!==token)location.reload();});
  }catch{root.innerHTML=`${header()}<main class="portal-wrap portal-loading"><h1>Não foi possível carregar a página</h1><p>Verifique sua conexão e tente abrir o link novamente.</p><button class="portal-btn" id="portalBootRetry">Tentar novamente</button></main>`;document.getElementById('portalBootRetry').onclick=()=>location.reload();}
}
if(typeof document!=='undefined')boot();
