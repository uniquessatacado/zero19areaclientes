// 2.17.90 on top of 2.17.89 (05/11, dono: "quando fazemos um pedido no PDV, até mesmo que venha do site, na 019 crie uma fila para
// podermos saber qual pedido está na frente para fazer e ir pela ordem, considerando prazo de entrega e frete que o cliente escolheu;
// PDV tem preferência se tiver que entregar próximo da data atual"; "no montar filme coloque um botão de ver próximos pedidos e
// destaque o que falta subir arte, produzir e tal"; "quando eu subir arte pelo montar filme no botão de subir na biblioteca, quando
// carregar mostre botão de jogar no filme"; "quando eu entrar em arte de empresa, coloque as mais recentes adicionadas primeiro";
// "no QR de subir arte do papel de produção, ao subir não precisa posicionar a arte no mockup, só subir normal e já dá opção de jogar
// no filme"; "deixa mais organizado a fila de produção, destaque o que é PDV, o que foi no site, mas não tire funções").
//  1. Fila: zero19-pdv-sync.js lê public.zero19_production_order_queue (banco) e ordena os cartões; cada cartão mostra Nº na fila,
//     PDV · LOJA / SITE / VENDUSS, o prazo (retirada ou enviar até pelo frete) e "O que falta". Filtro Todos / PDV / Site / Venduss.
//  2. Montar filme: "📋 Ver próximos pedidos" (janela com a fila, o que falta e Subir arte / Jogar no filme / Escolher fonte).
//  3. Subir arte na biblioteca pelo filme: ao terminar, "Jogar no filme" coloca as artes no filme na medida informada.
//  4. Arte de empresa: as artes mais novas primeiro.
//  5. QR "Subir arte" do cupom (#/zero19-fila?pedido=N) e "Subir arte" da janela de próximos pedidos: abre direto o pedido, já com
//     a medida do pedido e a pasta Artes prontas; ao salvar, a arte vai para o pedido pronta para o filme (sem a tela do mockup) e
//     aparece "Jogar no filme agora" e "Posicionar no mockup" (opcional, a função antiga continua). Halftone e arte sem medida
//     seguem o caminho de antes (posicionar). A arte sem posição aparece em Aguardando produção no filme (tipo 'art').
// Nada muda no banco além do que a tela já gravava (arte, perfil de impressão, z19p_zero19_mark_art_ready).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.89"'))throw new Error('v90 exige a base 2.17.89.');
if(!fs.existsSync(path.join(dist,'zero19-production-queue.js')))throw new Error('v90: zero19-production-queue.js não foi copiado para o dist.');
function patch(name,pairs){let source=read(name);for(const [before,after,times=1] of pairs){const count=source.split(before).length-1;if(count!==times)throw new Error('v90 '+name+': trecho alterado ou ausente ('+count+'×): '+before.slice(0,90));source=source.split(before).join(after);}write(name,source);}

// ---------------------------------------------------------------------------------------------------------------- sincronização
patch('zero19-pdv-sync.js',[
  ["import {hydrateProductionArtworkPreviews} from './production-artwork-previews.js?v=2.17.89';",
   "import {hydrateProductionArtworkPreviews} from './production-artwork-previews.js?v=2.17.89';\nimport {queueHeadHTML,missingChipsHTML,sortByQueue,matchesOrigin,queueStyles} from './zero19-production-queue.js?v=2.17.89';"],
  ["function installStyles(){\n  if(document.getElementById('zero19PdvSyncStyles'))return;",
   "function installStyles(){\n  if(!document.getElementById('zero19QueueStyles')){const queueStyle=document.createElement('style');queueStyle.id='zero19QueueStyles';queueStyle.textContent=queueStyles;document.head.appendChild(queueStyle);}\n  if(document.getElementById('zero19PdvSyncStyles'))return;"],
  ["homeSelected='all',homeQuery='',countdownTimer=null",
   "homeSelected='all',homeQuery='',homeOrigin='all',countdownTimer=null"],
  // Arte subida sem posição (QR/filme): pronta para o filme, sem posição pendente → tipo 'art' no Aguardando produção.
  ["    items=await hydrateProductionArtworkPreviews({supabase,items,isCurrent:previewCurrent});",
   "    items=await hydrateProductionArtworkPreviews({supabase,items,isCurrent:previewCurrent});\n    await markQuickArt(owner,items);"],
  ["orderIds.length?supabase.rpc('zero19_orders_flow',{p_order_ids:orderIds}).then(r=>r,()=>({data:null})):{data:null}]);",
   "orderIds.length?supabase.rpc('zero19_orders_flow',{p_order_ids:orderIds}).then(r=>r,()=>({data:null})):{data:null}]);\n    const queueMap=orderIds.length?await readProductionQueue():new Map();"],
  ["      if(ap!==bp)return ap-bp;return new Date(a.project.source_order_created_at||a.project.created_at||0)-new Date(b.project.source_order_created_at||b.project.created_at||0);\n    });",
   "      if(ap!==bp)return ap-bp;return new Date(a.project.source_order_created_at||a.project.created_at||0)-new Date(b.project.source_order_created_at||b.project.created_at||0);\n    });\n    // 2.17.90: ordem da fila do banco (prazo + frete escolhido; PDV na frente no mesmo dia). Sem a fila, fica a ordem de antes.\n    {for(const row of summaries)row.queue=queueMap.get(String(row.project.official_order_ref||''))||null;const ordered=sortByQueue(summaries);summaries.splice(0,summaries.length,...ordered);}"],
  ["  function invalidate(){cache=null;cacheAt=0}",
   `  // 2.17.90: fila de produção (posição global de todos os pedidos abertos). Banco sem a função: sem fila, nada quebra.
  async function readProductionQueue(){
    const out=new Map();
    try{const {data,error}=await supabase.rpc('zero19_production_order_queue',{p_order_ids:null});if(error)throw error;for(const row of Array.isArray(data)?data:[])if(row?.order_id)out.set(String(row.order_id),row);}
    catch(error){console.warn('production queue',error)}
    return out;
  }
  async function markQuickArt(owner,items){
    const candidates=items.filter(item=>{const p=item.metadata?.details?.[0]?.production||{};return item.stage==='ready_production'&&item.asset_id&&!p.vdr_bundle_id&&!(p.checkout_application_id&&p.art_source==='CHECKOUT_CATALOG_ASSET')&&p.storage_bucket!=='venduss-print-artworks'&&!['NAME_NUMBER','PHRASE'].includes(String(item.kind||'').toUpperCase());});
    if(!candidates.length)return;
    const ids=[...new Set(candidates.map(item=>item.asset_id))],placed=new Set();
    try{for(let offset=0;offset<ids.length;offset+=150){const {data,error}=await supabase.from('z19p_asset_placements').select('asset_id').eq('owner_id',owner).eq('production_state','pending').in('asset_id',ids.slice(offset,offset+150));if(error)throw error;for(const row of data||[])placed.add(row.asset_id);}}
    catch(error){console.warn('quick art placements',error);return;}
    for(const item of candidates)if(!placed.has(item.asset_id))item._quickArt=true;
  }
  function invalidate(){cache=null;cacheAt=0}`],
  // Cartão: Nº na fila, PDV/SITE, prazo e o que falta; arte sem posição ganha "Adicionar estampa ao filme".
  ["'</small></div></div>'+flowChips(summary.flow)+pauseNotice+",
   "'</small></div></div>'+queueHeadHTML(summary)+missingChipsHTML(summary.items)+flowChips(summary.flow)+pauseNotice+"],
  // Com a fila, o prazo fica no quadro da fila; na retirada fica também a contagem regressiva (no envio a data antiga era a do cliente).
  ["const itemCount=Math.max(1,Number(summary.qty)||1),deadline=summary.promised?",
   "const itemCount=Math.max(1,Number(summary.qty)||1),deadline=summary.queue?(summary.queue.pickup&&summary.promised?'<span class=\"z19-deadline-countdown\" data-deadline-countdown=\"'+h(summary.promised)+'\"></span>':''):summary.promised?"],
  ["||stageItem?.asset_id&&(stageItem?.without_application||",
   "||stageItem?.asset_id&&(stageItem?._quickArt||stageItem?.without_application||"],
  // Tela inicial: filtro de origem e a regra da fila.
  ["const visible=()=>open.filter(row=>(homeSelected==='all'||row.items.some(item=>item.stage===homeSelected))&&",
   "const visible=()=>open.filter(row=>matchesOrigin(row,homeOrigin)&&(homeSelected==='all'||row.items.some(item=>item.stage===homeSelected))&&"],
  ["standalone=homeSelected==='all'||homeSelected==='awaiting_halftone'?data.standaloneHalftones||[]:[]",
   "standalone=homeOrigin==='all'&&(homeSelected==='all'||homeSelected==='awaiting_halftone')?data.standaloneHalftones||[]:[]"],
  ["<h2>Próximas ações</h2><p>Cada cartão mostra o próximo passo para a produção continuar.</p>",
   "<h2>Fila de produção</h2><p>Pela ordem: o Nº 1 é o próximo a fazer. Cada cartão mostra de onde veio, o prazo e o que falta.</p>"],
  ["<div class=\"production-search\">",
   "<div class=\"z19q-origin-filter\" role=\"group\" aria-label=\"Origem do pedido\"><button type=\"button\" data-home-origin=\"all\">Todos</button><button type=\"button\" data-home-origin=\"pdv\">PDV · loja</button><button type=\"button\" data-home-origin=\"site\">Site</button><button type=\"button\" data-home-origin=\"venduss\">Venduss</button></div><p class=\"z19q-rule\">Ordem: atrasados primeiro, depois o dia em que tem de ficar pronto (retirada: dia da retirada · envio: último dia de postar pelo frete que o cliente escolheu). No mesmo dia, o PDV vai na frente.</p><div class=\"production-search\">"],
  ["    app.querySelectorAll('[data-home-stage-filter]').forEach(button=>button.onclick=()=>{homeSelected=button.dataset.homeStageFilter;draw()});",
   "    app.querySelectorAll('[data-home-stage-filter]').forEach(button=>button.onclick=()=>{homeSelected=button.dataset.homeStageFilter;draw()});\n    const originButtons=[...app.querySelectorAll('[data-home-origin]')],paintOrigin=()=>originButtons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.homeOrigin===homeOrigin)));paintOrigin();originButtons.forEach(button=>button.onclick=()=>{homeOrigin=button.dataset.homeOrigin||'all';paintOrigin();draw()});"],
  // QR "Subir arte" do cupom: pedido exato abre direto, sem posicionar no mockup.
  ["  async function openGlobalUpload(initialQuery=''){",
   "  async function openGlobalUpload(initialQuery='',options={}){"],
  ["        startUploadForWorkspace?.(workspaceId,{projectId,workItemId:pending?.id||null,personalizationSaleId:pending?.personalization_sale_id||null,orderId:row.order_id});",
   "        startUploadForWorkspace?.(workspaceId,{projectId,workItemId:pending?.id||null,personalizationSaleId:pending?.personalization_sale_id||null,orderId:row.order_id,...(options.quick?{quick:true,fromFilm:Boolean(options.fromFilm),...orderMeasure(pending)}:{})});"],
  ["    document.body.appendChild(modal);draw();await fetchPage(true);\n  }",
   "    document.body.appendChild(modal);draw();await fetchPage(true);\n    // 2.17.90: QR do cupom com o número do pedido: abre o pedido direto.\n    const exact=options.quick?rows.filter(row=>String(row.display_id||'')===String(query||'').trim()):[];\n    if(exact.length===1&&modal.isConnected)void choose(exact[0]);\n  }"],
  ["    if(orderParam){history.replaceState(null,'','#/zero19-fila');setTimeout(()=>openGlobalUpload(orderParam),60)}",
   "    if(orderParam){history.replaceState(null,'','#/zero19-fila');setTimeout(()=>openGlobalUpload(orderParam,{quick:true}),60)}"],
  // Aguardando produção do filme: artes subidas sem posição.
  ["  async function refreshArtworkPreview(workItemId){",
   `  async function pendingArtFilmRows(){
    const data=await load(true);
    return data.items.filter(item=>item._quickArt).map(item=>({...item,summary:data.summaries.find(row=>row.project.id===item.project_id)})).filter(item=>item.summary);
  }
  async function refreshArtworkPreview(workItemId){`],
  ["  async function sourceImageSize(blob){",
   `  // 2.17.90: medida do pedido para já vir preenchida no envio da arte (vale o lado da largura; a altura sai da arte).
  function orderMeasure(item){const p=item?.metadata?.details?.[0]?.production||{},width=Number(p.width_cm),height=Number(p.height_cm);return width>0?{widthCm:width,sizeAxis:'width'}:height>0?{heightCm:height,sizeAxis:'height'}:{};}
  // Várias artes do pedido no filme de uma vez (Jogar no filme depois de subir sem posição).
  async function addAssetsToFilm(workItemIds){
    const data=await load(true),requests=[];
    for(const id of workItemIds||[]){
      const item=findWorkItem(data,id),summary=item&&data.summaries.find(row=>row.project.id===item.project_id);
      if(!item||!summary||item.stage!=='ready_production'||!item.asset_id)continue;
      requests.push({workItemId:item.id,projectId:summary.project.id,orderRef:orderNo(summary.project),personalizationSaleId:item.personalization_sale_id,clientName:summary.workspace?.client_name||summary.workspace?.company_name||'Cliente ZERO19',assetId:item.asset_id,quantity:item.quantity||1,vdrBundleId:item.metadata?.details?.[0]?.production?.vdr_bundle_id||null});
    }
    if(!requests.length)return toast('A arte ainda não está liberada para o filme. Atualize e tente de novo.','err');
    queueAssetToFilm?.(requests.length===1?requests[0]:requests);
  }
  // 2.17.90 (dono 05/11): "Ver próximos pedidos" no Montar filme, com o que falta em cada um.
  async function openNextOrders({openPending=null}={}){
    const modal=document.createElement('div');modal.className='modal-backdrop';modal.style.zIndex='12000';
    let origin='all',limit=30,data=null,failure='';
    const onKey=event=>{if(event.key==='Escape')close()};
    const close=()=>{modal.remove();document.removeEventListener('keydown',onKey)};
    const openRows=()=>(data?.summaries||[]).filter(row=>!['ready_pickup','delivered','cancelled'].includes(row.stage)&&matchesOrigin(row,origin));
    const rowHtml=summary=>{
      const p=summary.project,w=summary.workspace||{},items=summary.items||[],art=items.filter(item=>item.stage==='awaiting_art'),ready=items.filter(item=>item.stage==='ready_production'),font=items.find(item=>item.stage==='awaiting_font'),actions=[];
      if(art.length)actions.push('<button type="button" class="btn primary" data-next-upload="'+h(p.id)+'">⇧ Subir arte'+(art.length>1?' ('+art.length+')':'')+'</button>');
      if(ready.length)actions.push('<button type="button" class="btn" data-next-film="'+h(p.id)+'">⇢ Jogar no filme'+(ready.length>1?' ('+ready.length+')':'')+'</button>');
      if(font)actions.push('<button type="button" class="btn" data-next-font="'+h(font.id)+'">Escolher fonte</button>');
      if(/^[0-9a-f-]{36}$/i.test(p.official_order_ref||''))actions.push('<a class="btn ghost" href="https://venduss.com/producao/pronto/'+h(p.official_order_ref)+'" target="_blank" rel="noopener noreferrer">Abrir no QR</a>');
      const qty=Math.max(1,Number(summary.qty)||1);
      return '<article class="z19q-next-row">'+queueHeadHTML(summary)+'<div class="z19q-next-title"><strong>Pedido #'+h(orderNo(p))+'</strong><span>'+h(w.client_name||w.company_name||'Cliente')+'</span><span>'+qty+' '+(qty===1?'peça':'peças')+'</span></div>'+missingChipsHTML(items)+flowChips(summary.flow)+(actions.length?'<div class="z19q-next-actions">'+actions.join('')+'</div>':'')+'</article>';
    };
    const draw=()=>{
      const rows=openRows(),shown=rows.slice(0,limit);
      modal.innerHTML='<section class="modal wide z19q-next" role="dialog" aria-modal="true" aria-labelledby="z19q-next-title"><div class="modal-head"><div><div class="eyebrow">FILA DE PRODUÇÃO</div><h2 id="z19q-next-title">Próximos pedidos</h2><p>Pela ordem da fila: atrasados primeiro; retirada pelo dia da retirada; envio pelo último dia de postar no frete escolhido. No mesmo dia, o PDV vai na frente.</p></div><button type="button" class="btn ghost small" data-next-close aria-label="Fechar">×</button></div>'
        +'<div class="z19q-origin-filter" role="group" aria-label="Origem do pedido">'+[['all','Todos'],['pdv','PDV · loja'],['site','Site'],['venduss','Venduss']].map(([key,label])=>'<button type="button" data-next-origin="'+key+'" aria-pressed="'+(origin===key)+'">'+label+'</button>').join('')+'</div>'
        +'<div class="z19q-next-list">'+(!data?(failure?'<div class="z19q-next-empty">'+h(failure)+'</div>':'<div class="z19q-next-empty"><span class="loading"></span> Carregando a fila…</div>'):shown.length?shown.map(rowHtml).join(''):'<div class="z19q-next-empty">Nenhum pedido em aberto neste filtro.</div>')+'</div>'
        +'<div class="z19q-next-foot"><small>'+(data?rows.length+' pedido(s) em aberto':'')+'</small><span style="display:flex;flex-wrap:wrap;gap:8px">'+(rows.length>limit?'<button type="button" class="btn" data-next-more>Mostrar mais 30</button>':'')+'<button type="button" class="btn" data-next-home>Abrir a fila completa</button><button type="button" class="btn primary" data-next-close>Fechar</button></span></div></section>';
      modal.querySelectorAll('[data-next-close]').forEach(button=>button.onclick=close);
      modal.querySelectorAll('[data-next-origin]').forEach(button=>button.onclick=()=>{origin=button.dataset.nextOrigin||'all';limit=30;draw()});
      modal.querySelector('[data-next-more]')?.addEventListener('click',()=>{limit+=30;draw()});
      modal.querySelector('[data-next-home]')?.addEventListener('click',()=>{close();nav('/')});
      modal.querySelectorAll('[data-next-upload]').forEach(button=>button.onclick=()=>{const summary=data.summaries.find(row=>row.project.id===button.dataset.nextUpload),item=summary?.items.find(row=>row.stage==='awaiting_art');if(!summary||!item)return;close();startUploadForWorkspace?.(summary.workspace?.id,{projectId:summary.project.id,workItemId:item.id,personalizationSaleId:item.personalization_sale_id,orderId:summary.project.official_order_ref,quick:true,fromFilm:true,...orderMeasure(item)});});
      modal.querySelectorAll('[data-next-film]').forEach(button=>button.onclick=()=>{close();if(openPending)openPending({preselectProject:button.dataset.nextFilm});else nav('/filme');});
      modal.querySelectorAll('[data-next-font]').forEach(button=>button.onclick=()=>{close();chooseFont(button.dataset.nextFont);});
      updateDeadlineCountdowns(modal);
    };
    document.addEventListener('keydown',onKey);modal.onclick=event=>{if(event.target===modal)close()};
    document.body.appendChild(modal);draw();
    try{data=await load(true);}catch(error){failure='Não foi possível carregar a fila: '+(error?.message||'falha de conexão');}
    if(modal.isConnected)draw();
  }
  async function sourceImageSize(blob){`],
  ["prepareVdrFilmItem,refreshArtworkPreview,resolveOrderArtwork,chooseUploadTarget,orderProgress,markItemProduced,openGlobalUpload};",
   "prepareVdrFilmItem,refreshArtworkPreview,resolveOrderArtwork,chooseUploadTarget,orderProgress,markItemProduced,openGlobalUpload,pendingArtFilmRows,openNextOrders,addAssetsToFilm};"],
]);

// ---------------------------------------------------------------------------------------------------------------- filme
patch('production-v217.js',[
  ["  function queueLibraryAssetRequest(request){pendingZero19AssetRequest={assetId:request.assetId,quantity:request.quantity,companyName:request.companyName,libraryOnly:true};ctx.nav('/filme');}",
   "  function queueLibraryAssetRequest(request){pendingZero19AssetRequest={assetId:request.assetId,quantity:request.quantity,companyName:request.companyName,libraryOnly:true};ctx.nav('/filme');}\n  // 2.17.90: várias artes de uma vez (Jogar no filme depois de subir na biblioteca ou no pedido).\n  function queueLibraryAssetsRequest(requests){pendingZero19AssetRequest={batch:(requests||[]).map(request=>({assetId:request.assetId,quantity:request.quantity,companyName:request.companyName,libraryOnly:true}))};ctx.nav('/filme');}"],
  ["  function queueZero19AssetRequest(request){pendingZero19AssetRequest={...(request||{})};ctx.nav('/filme');}",
   "  function queueZero19AssetRequest(request){pendingZero19AssetRequest=Array.isArray(request)?{batch:request.map(one=>({...one}))}:{...(request||{})};ctx.nav('/filme');}"],
  ["      const request=pendingZero19AssetRequest;if(!request)return;\n      pendingZero19AssetRequest=null;\n      if(request.vdrBundleId)",
   "      const request=pendingZero19AssetRequest;if(!request)return;\n      pendingZero19AssetRequest=null;\n      if(request.batch){let added=0;const failed=[];for(const one of request.batch){try{pendingZero19AssetRequest=one;await consumeZero19AssetRequest();added++;}catch(error){failed.push(error?.message||String(error));}}pendingZero19AssetRequest=null;if(failed.length)ctx.toast((added?added+' arte(s) no filme. ':'')+'Não entrou '+failed.length+': '+failed[0],'err');else if(added>1)ctx.toast(added+' artes adicionadas ao filme. Confira as quantidades.','ok');return;}\n      if(request.vdrBundleId)"],
  ["queueZero19TeamRequest,queueZero19AssetRequest,queueLibraryAssetRequest};",
   "queueZero19TeamRequest,queueZero19AssetRequest,queueLibraryAssetRequest,queueLibraryAssetsRequest};"],
  ["<button class=\"btn film-action film-action-pending\" id=\"addOfficialPending\">◷ Aguardando produção</button>",
   "<button class=\"btn film-action film-action-pending\" id=\"addOfficialPending\">◷ Aguardando produção</button><button class=\"btn film-action film-action-next\" id=\"viewNextOrders\" type=\"button\">📋 Ver próximos pedidos</button>"],
  ["app.querySelector('#addOfficialPending').onclick=()=>safe(()=>openUnifiedPendingPicker());",
   "app.querySelector('#addOfficialPending').onclick=()=>safe(()=>openUnifiedPendingPicker());app.querySelector('#viewNextOrders')?.addEventListener('click',()=>safe(()=>ctx.zero19Orders?.openNextOrders?.({openPending:options=>void safe(()=>openUnifiedPendingPicker(options))})));"],
  ["vdrPendingRows=[],ordersRequest=0;", "vdrPendingRows=[],artPendingRows=[],ordersRequest=0;"],
  ["vendussRows:vendussPendingRows,vdrRows:vdrPendingRows,filmItems,", "vendussRows:vendussPendingRows,vdrRows:[...vdrPendingRows,...artPendingRows],filmItems,"],
  ["+availableVenduss.length+vdrPendingRows.length;", "+availableVenduss.length+vdrPendingRows.length+artPendingRows.length;"],
  ["const [rows,fonts,officialRows,vendussRows,vdrRows]=await Promise.all([production.pending(),loadZero19FontProductionRows(readySets),ctx.officialOrders?.pendingRows?.()||[],ctx.zero19Orders?.pendingVendussFilmRows?.()||[],ctx.zero19Orders?.pendingVdrFilmRows?.()||[]]);",
   "const [rows,fonts,officialRows,vendussRows,vdrRows,artRows]=await Promise.all([production.pending(),loadZero19FontProductionRows(readySets),ctx.officialOrders?.pendingRows?.()||[],ctx.zero19Orders?.pendingVendussFilmRows?.()||[],ctx.zero19Orders?.pendingVdrFilmRows?.()||[],ctx.zero19Orders?.pendingArtFilmRows?.().catch?.(()=>[])||[]]);"],
  ["vdrPendingRows=vdrRows||[];drawOrders();", "vdrPendingRows=vdrRows||[];artPendingRows=artRows||[];drawOrders();"],
  ["    const openUnifiedPendingPicker=async({keep}={})=>{", "    const openUnifiedPendingPicker=async({keep,preselectProject}={})=>{"],
  ["        ...vendussRows.map(row=>{const p=row.metadata?.details?.[0]?.production||{};return {key:'venduss:'+row.id,",
   "        ...artPendingRows.map(row=>{const p=row.metadata?.details?.[0]?.production||{};return {key:'art:'+row.id,kind:'art',row,title:(row.summary?.workspace?.client_name||row.summary?.workspace?.company_name||'Cliente')+' · Pedido #'+orderNoForPicker(row.summary?.project),detail:row.text_value||'Estampa',note:[row.garment_size,p.position_label,'arte subida sem posição'].filter(Boolean).join(' · '),image:row._artworkPreview||null,quantity:Math.max(1,Number(row.quantity)||1)};}),\n        ...vendussRows.map(row=>{const p=row.metadata?.details?.[0]?.production||{};return {key:'venduss:'+row.id,"],
  ["entry.alreadyInFilm=['venduss','font','vdr'].includes(entry.kind)?", "entry.alreadyInFilm=['venduss','font','vdr','art'].includes(entry.kind)?"],
  ["if(keep)entries.forEach((entry,index)=>{if(!keep.has(entry.key)||entry.alreadyInFilm)return;const input=modal.querySelector('[data-entry=\"'+index+'\"]');if(input&&!input.disabled&&!input.checked){input.checked=true;input.onchange?.();}});",
   "if(keep||preselectProject)entries.forEach((entry,index)=>{if(!(keep?.has(entry.key)||preselectProject&&progressProject(entry)===preselectProject)||entry.alreadyInFilm)return;const input=modal.querySelector('[data-entry=\"'+index+'\"]');if(input&&!input.disabled&&!input.checked){input.checked=true;input.onchange?.();}});if(preselectProject)modal.querySelector('.film-pending-row input:checked')?.closest('.film-pending-row')?.scrollIntoView({block:'center'});"],
]);

patch('film-bulk-add.js',[
  ["const WORK=new Set(['vdr','font','venduss']);", "const WORK=new Set(['vdr','font','venduss','art']);"],
  ["const artRows=candidates.filter(({entry,row})=>['vdr','venduss'].includes(entry.kind)&&row.asset_id);", "const artRows=candidates.filter(({entry,row})=>['vdr','venduss','art'].includes(entry.kind)&&row.asset_id);"],
  ["const vendorIds=candidates.filter(({entry,row})=>entry.kind==='venduss'&&row.asset_id).map(x=>x.row.asset_id);", "const vendorIds=candidates.filter(({entry,row})=>(entry.kind==='venduss'||entry.kind==='art')&&row.asset_id).map(x=>x.row.asset_id);"],
  ["      }else if(entry.kind==='venduss'){",
   "      }else if(entry.kind==='art'){\n        // 2.17.90: arte subida no pedido sem posição: medida do perfil de impressão, ligada à aplicação do pedido.\n        const asset=assets.get(row.asset_id),profile=profiles.get(row.asset_id),project=entry.row.summary?.project||{},workspace=entry.row.summary?.workspace||{};\n        if(!asset||!profile?.ready_for_print)throw new Error('A arte deste pedido precisa de arquivo e medida liberados para impressão.');\n        const orderRef=project.official_order_payload?.display_id||project.official_order_ref||String(row.project_id).slice(0,8);\n        items=[{...makeAsset(asset,profile,{quantity:row.quantity,companyName:workspace.client_name||workspace.company_name||'Cliente ZERO19'}),officialProjectId:row.project_id,officialOrderRef:orderRef,externalOrderItemRef:row.personalization_sale_id,productionGroupKeys:['order:'+row.project_id],zero19WorkItemId:row.id}];\n      }else if(entry.kind==='venduss'){"],
]);

// ---------------------------------------------------------------------------------------------------------------- Arte de empresa
patch('film-picker.js',[
  ["const formatCm = value => cmFormat.format(Number(value));",
   "const formatCm = value => cmFormat.format(Number(value));\n// 2.17.90 (dono 05/11): as artes mais novas primeiro.\nconst newestFirst = (left, right) => (Date.parse(right.asset?.created_at || '') || 0) - (Date.parse(left.asset?.created_at || '') || 0) || left.companyName.localeCompare(right.companyName, 'pt-BR') || String(left.asset.name).localeCompare(String(right.asset.name), 'pt-BR');"],
  ["  }).sort((left, right) => left.companyName.localeCompare(right.companyName, 'pt-BR') || String(left.asset.name).localeCompare(String(right.asset.name), 'pt-BR'));", "  }).sort(newestFirst);"],
  ["      catalogue.sort((a,b)=>a.companyName.localeCompare(b.companyName,'pt-BR')||String(a.asset.name).localeCompare(String(b.asset.name),'pt-BR'));", "      catalogue.sort(newestFirst);"],
]);

// ---------------------------------------------------------------------------------------------------------------- envio de arte
patch('app.js',[
  [`function showBackToFilm(){
  document.querySelector('.z19-back-to-film')?.remove();
  const bar=document.createElement('div');bar.className='z19-back-to-film';bar.setAttribute('role','status');
  bar.innerHTML='<span>✓ Arte salva na biblioteca</span><button class="btn primary" type="button">← Voltar para o filme</button><button class="btn ghost small" type="button" aria-label="Fechar">×</button>';
  const [back,dismiss]=bar.querySelectorAll('button');back.onclick=()=>{bar.remove();nav('/filme')};dismiss.onclick=()=>bar.remove();
  document.body.appendChild(bar);const off=()=>{bar.remove();window.removeEventListener('hashchange',off)};window.addEventListener('hashchange',off);
}`,
   `// 2.17.90 (dono 05/11): "quando carregar mostre botão de jogar no filme" (sem voltar e procurar em Arte de empresa).
function showBackToFilm(assets=[],workspace=null){
  document.querySelector('.z19-back-to-film')?.remove();document.querySelector('.z19-upload-done')?.remove();
  const arts=(assets||[]).filter(asset=>asset?.asset_type==='arte'),filmable=arts.filter(asset=>Number(asset?.metadata?.requested_width_cm)>0||Number(asset?.metadata?.requested_height_cm)>0);
  const bar=document.createElement('div');bar.className='z19-back-to-film';bar.setAttribute('role','status');
  bar.innerHTML='<span>✓ Arte salva na biblioteca'+(arts.length&&!filmable.length?'<small>Sem medida: informe a medida em Arte de empresa para jogar no filme.</small>':'')+'</span>'+(filmable.length?'<button class="btn primary" type="button" data-film-add>⇢ Jogar no filme'+(filmable.length>1?' ('+filmable.length+')':'')+'</button>':'')+'<button class="btn'+(filmable.length?' z19-film-back-light':' primary')+'" type="button" data-film-back>← Voltar para o filme</button><button class="btn ghost small" type="button" aria-label="Fechar" data-film-close>×</button>';
  bar.querySelector('[data-film-add]')?.addEventListener('click',()=>{bar.remove();const company=workspace?.company_name||workspace?.client_name||'Biblioteca ZERO19';if(productionModule?.queueLibraryAssetsRequest)productionModule.queueLibraryAssetsRequest(filmable.map(asset=>({assetId:asset.id,quantity:1,companyName:company})));else nav('/filme');});
  bar.querySelector('[data-film-back]').onclick=()=>{bar.remove();nav('/filme')};bar.querySelector('[data-film-close]').onclick=()=>bar.remove();
  document.body.appendChild(bar);const off=()=>{bar.remove();window.removeEventListener('hashchange',off)};window.addEventListener('hashchange',off);
}
// 2.17.90 (dono 05/11): "no QR de subir arte do papel de produção, ao subir não precisa posicionar a arte no mockup, só subir normal e
// já dá opção de jogar no filme". A arte vai para a personalização do pedido pronta para o filme (perfil de impressão liberado e
// z19p_zero19_mark_art_ready, o mesmo que o posicionamento grava no fim). Halftone ou sem medida: segue para posicionar como antes.
async function ensureQuickReadyFolder(orderContext){
  const existing=defaultReadyFolderId();if(existing)return existing;
  const workspace=currentWorkspace;if(!workspace?.id||workspace.workspace_type!=='client')return '';
  const folder={id:crypto.randomUUID(),owner_id:accountOwnerId(),workspace_id:workspace.id,project_id:orderContext?.projectId||null,parent_id:null,name:'Artes prontas',purpose:'artes_prontas',sort_order:20,created_by:session.user.id,updated_by:session.user.id};
  const {error}=await supabase.from('z19p_folders').insert(folder);
  if(error){console.warn('quick ready folder',error);return '';}
  if(currentWorkspace?.id===workspace.id)currentFolders=[...(currentFolders||[]),folder];
  return folder.id;
}
async function finishQuickUpload(done){
  const linked=[],skipped=[];
  for(const {asset,target,widthCm,heightCm} of done){
    const production=target?.item?.metadata?.details?.[0]?.production||{},halftone=target?.item?.stage==='awaiting_halftone'||String(production.needs_halftone)==='true';
    if(!target?.project?.id||!target.item?.personalization_sale_id||!(widthCm>0||heightCm>0)||halftone){skipped.push(asset);continue;}
    const profile=await supabase.from('z19p_asset_print_profiles').update({ready_for_print:true,updated_by:session.user.id,updated_at:new Date().toISOString()}).eq('asset_id',asset.id).eq('owner_id',accountOwnerId());
    if(profile.error){console.warn('quick upload profile',profile.error);skipped.push(asset);continue;}
    const result=await supabase.rpc('z19p_zero19_mark_art_ready',{p_project_id:target.project.id,p_personalization_sale_id:target.item.personalization_sale_id,p_asset_id:asset.id});
    if(result.error){console.warn('quick upload link',result.error);toast('Arte salva, mas não foi possível ligar ao pedido: '+(result.error.message||'tente posicionar.'),'err');skipped.push(asset);continue;}
    linked.push({asset,workItemId:target.item.id,orderNo:target.project.official_order_payload?.display_id||String(target.project.official_order_ref||'').slice(0,8)});
  }
  zero19Sync?.invalidate?.();
  return {linked,skipped};
}
function showQuickUploadBar(result,{fromFilm=false,workspace=null,projects=[]}={}){
  document.querySelector('.z19-upload-done')?.remove();document.querySelector('.z19-back-to-film')?.remove();
  if(!result?.linked?.length)return;
  const orders=[...new Set(result.linked.map(row=>row.orderNo).filter(Boolean))].join(', #');
  const bar=document.createElement('div');bar.className='z19-upload-done';bar.setAttribute('role','status');
  bar.innerHTML='<span>✓ Arte salva no pedido'+(orders?' #'+escapeHTML(orders):'')+'<small>Pronta para o filme · também aparece em Aguardando produção no Montar filme.</small></span><button class="btn primary" type="button" data-quick-film>⇢ Jogar no filme agora</button><button class="btn" type="button" data-quick-place>Posicionar no mockup</button>'+(fromFilm?'<button class="btn ghost" type="button" data-quick-back>← Voltar para o filme</button>':'')+'<button class="btn ghost small" type="button" aria-label="Fechar" data-quick-close>×</button>';
  bar.querySelector('[data-quick-film]').onclick=()=>{bar.remove();void zero19Sync?.addAssetsToFilm?.(result.linked.map(row=>row.workItemId));};
  bar.querySelector('[data-quick-place]').onclick=async()=>{bar.remove();try{await officialOrders?.offerAfterUpload?.(result.linked.map(row=>row.asset),{workspace,projects,allowWithoutOrder:true});}catch(error){toast(error.message||'Não foi possível abrir a posição.','err');}};
  bar.querySelector('[data-quick-back]')?.addEventListener('click',()=>{bar.remove();nav('/filme');});
  bar.querySelector('[data-quick-close]').onclick=()=>bar.remove();
  document.body.appendChild(bar);const off=()=>{bar.remove();window.removeEventListener('hashchange',off)};window.addEventListener('hashchange',off);
}`],
  ["  m.orderContext=orderContext;m.fromFilm=fromFilm;",
   "  m.orderContext=orderContext;m.fromFilm=fromFilm;\n  if(orderContext?.quick&&presetType==='arte'&&!defaultReadyFolderId())void ensureQuickReadyFolder(orderContext).then(id=>{if(!id||!m.isConnected)return;for(const item of uploadQueue)if(item.type==='arte'&&!item.folderId)item.folderId=id;if(uploadQueue.length)renderUploadList(m,{lockedType:isMockupMode});});"],
  ["· ao salvar, a arte vai para a personalização deste pedido e o status muda sozinho.</small>",
   "· ${orderContext.quick?'sem posicionar no mockup: ao salvar, a arte já fica pronta para o filme, na medida do pedido.':'ao salvar, a arte vai para a personalização deste pedido e o status muda sozinho.'}</small>"],
  ["      uploadQueue.push({file:f,name:'',type:presetType,folderId:presetType==='arte'?defaultReadyFolderId():'',readyForPrint:Boolean(readyForPrint),widthCm:'',heightCm:'',aspectRatio:0,standaloneHalftone:Boolean(standaloneHalftone),preview});",
   "      const orderSize=presetType==='arte'&&m.orderContext?m.orderContext:{},sizeText=value=>Number(value)>0?String(Math.round(Number(value)*100)/100).replace('.',','):'';\n      uploadQueue.push({file:f,name:'',type:presetType,folderId:presetType==='arte'?defaultReadyFolderId():'',readyForPrint:Boolean(readyForPrint),widthCm:sizeText(orderSize.widthCm),heightCm:orderSize.widthCm>0?'':sizeText(orderSize.heightCm),...(orderSize.sizeAxis?{sizeAxis:orderSize.sizeAxis}:{}),aspectRatio:0,standaloneHalftone:Boolean(standaloneHalftone),preview});"],
  ["readyForPrint:mode==='film',orderContext,fromFilm:mode==='film'",
   "readyForPrint:mode==='film'||Boolean(orderContext?.quick),orderContext,fromFilm:mode==='film'||Boolean(orderContext?.fromFilm)"],
  ["  const uploadTargets=new Map(),usedSales=[];", "  const uploadTargets=new Map(),usedSales=[],quickDone=[];"],
  ["      savedAssets.push(saved||assetRow);done++;", "      savedAssets.push(saved||assetRow);if(target)quickDone.push({asset:saved||assetRow,target,widthCm,heightCm});done++;"],
  ["  if(m.fromFilm)setTimeout(showBackToFilm,300);\n  try{\n    if(savedAssets.length&&officialOrders&&uploadWorkspace?.workspace_type==='client'){",
   "  const quickUpload=Boolean(m.orderContext?.quick)&&uploadWorkspace?.workspace_type==='client';\n  if(m.fromFilm&&!quickUpload)setTimeout(()=>showBackToFilm(savedAssets,uploadWorkspace),300);\n  try{\n    if(quickUpload){\n      const result=await finishQuickUpload(quickDone),linkedIds=new Set(result.linked.map(row=>row.asset.id)),rest=savedAssets.filter(asset=>!linkedIds.has(asset.id));\n      if(currentWorkspace?.id===uploadWorkspace.id)await renderWorkspace(uploadWorkspace.id);\n      showQuickUploadBar(result,{fromFilm:m.fromFilm,workspace:uploadWorkspace,projects:uploadProjects});\n      if(rest.length&&officialOrders)await officialOrders.offerAfterUpload(rest,{workspace:uploadWorkspace,projects:uploadProjects,allowWithoutOrder:clientUploadWithoutOrderEnabled});\n    }else if(savedAssets.length&&officialOrders&&uploadWorkspace?.workspace_type==='client'){"],
]);

fs.appendFileSync(path.join(dist,'qr-screens.css'),`
/* 2.17.90: Ver próximos pedidos no filme e barra de arte salva (Jogar no filme). */
html body .film-page .film-action-next{background:linear-gradient(135deg,#fef3c7,#fde68a)!important;color:#713f12!important;border-color:#f59e0b!important}
body .z19-back-to-film>span small{display:block;font-size:12px;font-weight:700;color:#cbd5e1}
body .z19-back-to-film .btn.z19-film-back-light{min-height:48px;background:#fff!important;color:#0f172a!important;border-color:#fff!important}
body .z19-upload-done .btn{background:#fff!important;color:#0f172a!important;border-color:#fff!important}
body .z19-upload-done .btn.primary{background:#ff6428!important;border-color:#ff6428!important;color:#fff!important}
body .z19-upload-done .btn.ghost{background:transparent!important;color:#fff!important;border-color:#334155!important}
`);

for(const name of fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n)))write(name,read(name).replace(/\b2\.17\.89\b/g,'2.17.90'));
if(!read('index.html').includes('content="2.17.90"'))throw new Error('v90: versão não foi renovada.');
for(const name of ['zero19-pdv-sync.js','production-v217.js','film-bulk-add.js','film-picker.js','app.js','zero19-production-queue.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
console.log('019 2.17.90: fila de produção (prazo + frete, PDV na frente), Ver próximos pedidos, Jogar no filme, Arte de empresa nova primeiro e Subir arte do QR sem mockup.');
