// 2.17.91 on top of 2.17.90 (06/11, dono: "estou tentando subir uma arte e vincular no pedido 50704 e fala que não há uma
// personalização de arte disponível neste pedido; só subir a arte; quando tiver vinculado pergunte onde vai a arte: as 10 camisas
// são todas com a mesma arte, então só tem 2 posições, pergunte qual posição de acordo com o que tirou no PDV; deixa disponível no
// Aguardando produção; quando está subindo arte vinculada a um pedido ou cliente fica pedindo pasta: deixa uma pasta geral pronta
// para impressão sempre selecionada automática; o botão de pronta para impressão não precisa, a gente só sobe arte pronta";
// "na fila em próximos pedidos deixe 2 botões: pronto e não entregue (fica pronto aguardando o cliente retirar) e pronto e entregue
// (já finaliza tudo)").
// Causa do erro: o envio prendia cada arquivo a UMA aplicação (camisa) e, com dois arquivos ou contexto de outra camisa, não sobrava
// aplicação livre. Agora a arte ligada a um pedido escolhe a POSIÇÃO (grupo das aplicações do PDV com a mesma posição e medida) e
// vale para todas as camisas daquela posição (z19p_zero19_mark_art_ready em cada uma; a arte fica sem personalization_sale_id quando
// serve a mais de uma camisa). Medida e nome vêm da posição; uma posição só = escolhida sozinha; cliente com um pedido aberto =
// vinculado sozinho ("Não é deste pedido" desfaz). Pasta "Artes prontas" criada e escolhida sozinha em qualquer ambiente; a chave
// "Arte pronta para impressão" saiu (toda arte sobe pronta). Pedido sem estampa esperando arte: a arte só fica salva no cliente.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.90"'))throw new Error('v91 exige a base 2.17.90.');
function patch(name,pairs){let source=read(name);for(const [before,after,times=1] of pairs){const count=source.split(before).length-1;if(count!==times)throw new Error('v91 '+name+': trecho alterado ou ausente ('+count+'×): '+before.slice(0,90));source=source.split(before).join(after);}write(name,source);}
// Troca um bloco inteiro entre dois marcadores (funções escritas pela 2.17.90).
function replaceBlock(name,start,end,after){const source=read(name),a=source.indexOf(start),b=a<0?-1:source.indexOf(end,a);if(a<0||b<0||source.indexOf(start,a+1)>=0)throw new Error('v91 '+name+': bloco ausente '+start.slice(0,60));write(name,source.slice(0,a)+after+source.slice(b));}

// ---------------------------------------------------------------------------------------------------------------- sincronização
patch('zero19-pdv-sync.js',[
  ["  async function pendingArtFilmRows(){",
   `  // 2.17.91: posições de arte de um pedido = aplicações do PDV com a mesma posição e medida (ex.: 10 camisas · Peito esquerdo 9 cm).
  const ART_UPLOAD_STAGES=['awaiting_art','art_received','awaiting_halftone','ready_production'];
  function artGroupKey(item){const p=item?.metadata?.details?.[0]?.production||{};return [p.position_label||p.position_code||item?.text_value||'Arte',Number(p.width_cm)||0,Number(p.height_cm)||0].join('|');}
  function artGroups(items){
    const groups=new Map();
    for(const item of items||[]){
      if(['NAME_NUMBER','PHRASE'].includes(String(item.kind||'').toUpperCase())||!ART_UPLOAD_STAGES.includes(item.stage))continue;
      const p=item.metadata?.details?.[0]?.production||{},key=artGroupKey(item);
      if(!groups.has(key))groups.set(key,{key,label:p.position_label||p.position_code||item.text_value||'Arte',widthCm:Number(p.width_cm)||0,heightCm:Number(p.height_cm)||0,qty:0,items:[],waiting:0});
      const group=groups.get(key);group.items.push(item);group.qty+=Math.max(1,Number(item.quantity)||1);if(item.stage!=='ready_production'||!item.asset_id)group.waiting++;
    }
    return [...groups.values()].sort((a,b)=>Number(b.waiting>0)-Number(a.waiting>0));
  }
  async function orderArtPositions(projectId){
    const data=await load(true),summary=data.summaries.find(row=>row.project.id===projectId);
    if(!summary)return {project:null,workspace:null,orderNo:'',groups:[]};
    return {project:summary.project,workspace:summary.workspace,orderNo:orderNo(summary.project),groups:artGroups(summary.items)};
  }
  async function openOrdersForWorkspace(workspaceId){
    const data=await load(true);
    return data.summaries.filter(row=>row.workspace?.id===workspaceId).map(row=>({projectId:row.project.id,orderNo:orderNo(row.project),groups:artGroups(row.items).filter(group=>group.waiting>0)})).filter(row=>row.groups.length);
  }
  async function pendingArtFilmRows(){`],
  // Cartão: um "Subir arte" por posição (antes era um por camisa).
  ["    for(const item of summary.items){\n      const label=h(item.text_value||item.garment_name||'Personalização');\n      if(item.stage==='awaiting_art')actions.push('<button class=\"btn primary\" data-z19-upload-workspace=",
   "    const uploadSeen=new Set();\n    for(const item of summary.items){\n      const label=h(item.text_value||item.garment_name||'Personalização');\n      if(item.stage==='awaiting_art'&&!uploadSeen.has(artGroupKey(item))&&uploadSeen.add(artGroupKey(item)))actions.push('<button class=\"btn primary\" data-z19-upload-workspace="],
  ["root.querySelectorAll('[data-z19-upload-workspace]').forEach(b=>b.onclick=()=>startUploadForWorkspace?.(b.dataset.z19UploadWorkspace,{projectId:b.dataset.projectId,workItemId:b.dataset.workItemId,personalizationSaleId:b.dataset.saleId}));",
   "root.querySelectorAll('[data-z19-upload-workspace]').forEach(b=>b.onclick=()=>startUploadForWorkspace?.(b.dataset.z19UploadWorkspace,{projectId:b.dataset.projectId,workItemId:b.dataset.workItemId,personalizationSaleId:b.dataset.saleId,pickedItem:true}));"],
  // Próximos pedidos: "Pronto · não entregue" e "Pronto e entregue".
  ["      if(/^[0-9a-f-]{36}$/i.test(p.official_order_ref||''))actions.push('<a class=\"btn ghost\" href=\"https://venduss.com/producao/pronto/'+h(p.official_order_ref)+'\" target=\"_blank\" rel=\"noopener noreferrer\">Abrir no QR</a>');\n      const qty=",
   "      actions.push('<button type=\"button\" class=\"btn z19q-ready\" data-next-ready=\"'+h(p.id)+'\">✓ Pronto · não entregue</button>','<button type=\"button\" class=\"btn z19q-done\" data-next-delivered=\"'+h(p.id)+'\">✓ Pronto e entregue</button>');\n      if(/^[0-9a-f-]{36}$/i.test(p.official_order_ref||''))actions.push('<a class=\"btn ghost\" href=\"https://venduss.com/producao/pronto/'+h(p.official_order_ref)+'\" target=\"_blank\" rel=\"noopener noreferrer\">Abrir no QR</a>');\n      const qty="],
  ["    let origin='all',limit=30,data=null,failure='';\n    const onKey=event=>{if(event.key==='Escape')close()};",
   "    let origin='all',limit=30,data=null,failure='',confirming=false;\n    const onKey=event=>{if(event.key==='Escape'&&!confirming)close()};\n    // Pronto · não entregue = Finalizar pedido inteiro (fica Pronto, aguardando retirada/envio). Pronto e entregue = também Entregue.\n    const finishOrder=async(projectId,delivered)=>{\n      const summary=data?.summaries.find(row=>row.project.id===projectId);if(!summary)return;const number=orderNo(summary.project);\n      confirming=true;modal.style.display='none';\n      const ok=await confirmAction({eyebrow:delivered?'PRONTO E ENTREGUE':'PRONTO · NÃO ENTREGUE',title:'Pedido #'+number+(delivered?' pronto e já entregue?':' está pronto?'),message:delivered?'Conclui todas as personalizações e marca o pedido como entregue: sai da fila e vai para Entregues (dá para reabrir depois).':'Conclui todas as personalizações (também as que aparecem com pendência). O pedido fica Pronto, aguardando o cliente retirar ou o envio.',confirmLabel:delivered?'Sim, pronto e entregue':'Sim, está pronto'});\n      modal.style.display='';confirming=false;if(!ok)return;\n      let result=await supabase.rpc('z19p_zero19_force_stage',{p_project_id:projectId,p_stage:'ready_pickup'});\n      if(!result.error&&delivered)result=await supabase.rpc('z19p_zero19_mark_delivered',{p_project_id:projectId});\n      if(result.error)return toast(result.error.message||'Não foi possível concluir o pedido.','err');\n      invalidate();toast(delivered?'Pedido #'+number+' pronto e entregue.':'Pedido #'+number+' pronto · aguardando retirada ou envio.','ok');\n      try{data=await load(true);}catch{}if(modal.isConnected)draw();\n    };"],
  ["      modal.querySelectorAll('[data-next-font]').forEach(button=>button.onclick=()=>{close();chooseFont(button.dataset.nextFont);});",
   "      modal.querySelectorAll('[data-next-font]').forEach(button=>button.onclick=()=>{close();chooseFont(button.dataset.nextFont);});\n      modal.querySelectorAll('[data-next-ready]').forEach(button=>button.onclick=()=>void finishOrder(button.dataset.nextReady,false));\n      modal.querySelectorAll('[data-next-delivered]').forEach(button=>button.onclick=()=>void finishOrder(button.dataset.nextDelivered,true));"],
  ["pendingArtFilmRows,openNextOrders,addAssetsToFilm};", "pendingArtFilmRows,openNextOrders,addAssetsToFilm,orderArtPositions,openOrdersForWorkspace};"],
  ["⇧ Subir arte'+(art.length>1?' ('+art.length+')':'')+'</button>');",
   "⇧ Subir arte'+(new Set(art.map(artGroupKey)).size>1?' ('+new Set(art.map(artGroupKey)).size+' posições)':'')+'</button>');"],
  ["<span>'+qty+' '+(qty===1?'peça':'peças')+'</span>", "<span>'+qty+' '+(qty===1?'aplicação':'aplicações')+'</span>"],
]);
fs.appendFileSync(path.join(dist,'zero19-production-queue.js'),"\n// 2.17.91: Pronto · não entregue / Pronto e entregue (Próximos pedidos) e envio de arte por posição.\nexport const queueStylesV91 = `\n.z19q-next-actions .btn.z19q-ready{background:#dcfce7;color:#14532d;border:2px solid #86efac}\n.z19q-next-actions .btn.z19q-done{background:#16a34a;color:#fff;border:2px solid #15803d}\n.upload-position{grid-column:1/-1;display:grid;gap:6px;border-radius:12px;border:2px solid #fdba74;background:#fff7ed;padding:8px 10px;color:#7c2d12}\n.upload-position.is-set{border-color:#86efac;background:#f0fdf4;color:#14532d}\n.upload-position>label{font-size:12px;font-weight:900;letter-spacing:.3px;text-transform:uppercase}\n.upload-position-options{display:flex;flex-wrap:wrap;gap:8px}\n.upload-position-options button{min-height:44px;border-radius:12px;border:2px solid #cbd5e1;background:#fff;color:#0f172a;padding:6px 12px;font-weight:900;text-align:left;cursor:pointer;max-width:100%;overflow-wrap:anywhere}\n.upload-position-options button[aria-pressed=\"true\"]{background:#0f172a;border-color:#0f172a;color:#fff}\n.upload-position-options button small{display:block;font-weight:700;opacity:.8}\n.upload-folder-auto .btn{min-height:40px;width:100%;justify-content:flex-start}\n.upload-order-link .upload-order-picks{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}\n.upload-order-link .upload-order-picks .btn{min-height:44px}\n`;\n");
patch('zero19-pdv-sync.js',[
  ["import {queueHeadHTML,missingChipsHTML,sortByQueue,matchesOrigin,queueStyles} from './zero19-production-queue.js?v=2.17.90';",
   "import {queueHeadHTML,missingChipsHTML,sortByQueue,matchesOrigin,queueStyles,queueStylesV91} from './zero19-production-queue.js?v=2.17.90';"],
  ["queueStyle.textContent=queueStyles;", "queueStyle.textContent=queueStyles+queueStylesV91;"],
]);

// ---------------------------------------------------------------------------------------------------------------- filme
// Vários pedidos de uma vez (Jogar no filme com várias camisas): monta tudo e calcula o filme uma vez só.
patch('production-v217.js',[
  ["if(request.batch){let added=0;const failed=[];for(const one of request.batch){try{pendingZero19AssetRequest=one;await consumeZero19AssetRequest();added++;}catch(error){failed.push(error?.message||String(error));}}pendingZero19AssetRequest=null;if(failed.length)",
   "if(request.batch){let added=0;const failed=[];for(const one of request.batch){try{pendingZero19AssetRequest={...one,batchItem:true};await consumeZero19AssetRequest();added++;}catch(error){failed.push(error?.message||String(error));}}pendingZero19AssetRequest=null;if(added)await refreshItems();if(failed.length)"],
  ["else if(added>1)ctx.toast(added+' artes adicionadas ao filme. Confira as quantidades.','ok');return;}",
   "else if(added)ctx.toast(added>1?added+' artes adicionadas ao filme e ligadas aos pedidos. Confira as quantidades.':'Arte adicionada ao filme e ligada ao pedido.','ok');return;}"],
  ["filmItems.push(await ctx.zero19Orders.prepareVdrFilmItem(request.workItemId));await refreshItems();",
   "filmItems.push(await ctx.zero19Orders.prepareVdrFilmItem(request.workItemId));if(request.batchItem)return;await refreshItems();"],
  ["        filmItems.push(filmItemFromLibraryAsset(asset,profile,request));\n        await refreshItems();",
   "        filmItems.push(filmItemFromLibraryAsset(asset,profile,request));\n        if(request.batchItem)return;await refreshItems();"],
  ["        productionGroupKeys:['order:'+request.projectId],zero19WorkItemId:request.workItemId||null\n      });\n      await refreshItems();",
   "        productionGroupKeys:['order:'+request.projectId],zero19WorkItemId:request.workItemId||null\n      });\n      if(request.batchItem)return;await refreshItems();"],
]);

// ---------------------------------------------------------------------------------------------------------------- envio de arte
patch('app.js',[
  // Pasta Artes prontas em qualquer ambiente (cliente, biblioteca).
  ["  const workspace=currentWorkspace;if(!workspace?.id||workspace.workspace_type!=='client')return '';\n  const folder={id:crypto.randomUUID(),owner_id:accountOwnerId(),workspace_id:workspace.id,project_id:orderContext?.projectId||null,",
   "  const workspace=currentWorkspace;if(!workspace?.id)return '';\n  const folder={id:crypto.randomUUID(),owner_id:accountOwnerId(),workspace_id:workspace.id,project_id:workspace.workspace_type==='client'?orderContext?.projectId||null:null,"],
  ["  if(orderContext?.quick&&presetType==='arte'&&!defaultReadyFolderId())void ensureQuickReadyFolder(orderContext)",
   "  if(presetType==='arte'&&!defaultReadyFolderId())void ensureQuickReadyFolder(orderContext)"],
  ["<b>Organização obrigatória</b><small>Antes de salvar cada arte, informe um nome claro e escolha uma pasta.</small>",
   "<b>Pasta automática: Artes prontas</b><small>Toda arte sobe pronta para impressão. No pedido, o nome e a medida já vêm da posição; fora dele, dê um nome.</small>"],
  // Pedido vinculado: posições; cliente com um pedido aberto: vincula sozinho.
  ["    if(fromFilm){const back=document.createElement('button');back.type='button';back.className='btn small upload-back-film';",
   "    if(presetType==='arte'){if(orderContext?.projectId){m.pickedItem=Boolean(orderContext.pickedItem);void loadUploadPositions(m);}\n      else if(currentWorkspace?.workspace_type==='client'&&zero19Sync?.openOrdersForWorkspace&&!standaloneHalftone){const wsId=currentWorkspace.id;void zero19Sync.openOrdersForWorkspace(wsId).then(orders=>{if(!m.isConnected||m.orderContext||currentWorkspace?.id!==wsId)return;m.workspaceOrders=orders;if(orders.length===1){m.orderContext={projectId:orders[0].projectId};m.autoLinked=true;void loadUploadPositions(m);}else if(orders.length>1)paintUploadOrderBar(m);}).catch(error=>console.warn('upload orders',error));}}\n    if(fromFilm){const back=document.createElement('button');back.type='button';back.className='btn small upload-back-film';"],
  ["try{const bmp=await createImageBitmap(f);let c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;c.getContext('2d',{willReadFrequently:true}).drawImage(bmp,0,0);bmp.close?.();if(presetType!=='mockup')c=trimTransparentSafe(c);item.aspectRatio=c.height>0?c.width/c.height:0;c.width=c.height=1}catch(error){console.warn('Não foi possível ler a proporção da arte.',error)}",
   "try{const bmp=await createImageBitmap(f);let c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;c.getContext('2d',{willReadFrequently:true}).drawImage(bmp,0,0);bmp.close?.();if(presetType!=='mockup')c=trimTransparentSafe(c);item.aspectRatio=c.height>0?c.width/c.height:0;c.width=c.height=1}catch(error){console.warn('Não foi possível ler a proporção da arte.',error)}\n      applyUploadPosition(m,item);"],
  // Linha do arquivo: onde vai a arte, pasta automática e sem a chave de pronta para impressão.
  ["    const autoReady=q.type==='arte'&&Boolean(productionModule?.folderInReadyTree(q.folderId||null));if(autoReady)q.readyForPrint=true;",
   "    const autoReady=q.type==='arte'&&Boolean(productionModule?.folderInReadyTree(q.folderId||null));if(autoReady)q.readyForPrint=true;\n    if(q.type==='arte'&&!q.standaloneHalftone)q.readyForPrint=true;\n    const autoFolder=q.type==='arte'&&q.folderId&&!q.showFolder&&autoReady,folderLabel=(currentFolders||[]).find(folder=>folder.id===q.folderId)?.name||'Artes prontas';"],
  ["      <div class=\"upload-folder\"><label>Pasta${q.type==='arte'?' *':''}</label><select data-i=\"${i}\" data-k=\"folderId\"><option value=\"\">${q.type==='arte'?'Escolha uma pasta':'Sem pasta'}</option>${folderOptionHTML(currentFolders,q.folderId||'')}</select></div>",
   "      ${autoFolder?`<div class=\"upload-folder upload-folder-auto\"><label>Pasta</label><button type=\"button\" class=\"btn small\" data-folder-change=\"${i}\">${escapeHTML(folderLabel)} · trocar</button></div>`:`<div class=\"upload-folder\"><label>Pasta${q.type==='arte'?' *':''}</label><select data-i=\"${i}\" data-k=\"folderId\"><option value=\"\">${q.type==='arte'?'Escolha uma pasta':'Sem pasta'}</option>${folderOptionHTML(currentFolders,q.folderId||'')}</select></div>`}"],
  ["<label class=\"upload-ready-switch ${autoReady?'automatic':''}\"><span class=\"switch\"><input type=\"checkbox\" data-ready=\"${i}\" ${q.readyForPrint?'checked':''} ${autoReady?'disabled':''}><span></span></span><span><b>Arte pronta para impressão</b><small>${autoReady?'Ativada automaticamente pela pasta Artes prontas.':'Ative para liberar no Montar Filme depois de posicionar.'}</small></span></label>`:''}",
   "`:''}${q.type==='arte'&&m.orderPositions?.groups?.length?uploadPositionHTML(m,q,i):''}"],
  ["const q=uploadQueue[+el.dataset.i],oldFolder=q.folderId;q[el.dataset.k]=el.value;",
   "const q=uploadQueue[+el.dataset.i],oldFolder=q.folderId;q[el.dataset.k]=el.value;if(el.dataset.k==='name')q.autoName=false;"],
  ["else{const complete=uploadQueue.length&&uploadQueue.every(item=>item.name.trim()&&(item.type!=='arte'||item.folderId));$('#processUpload',m).disabled=!complete}",
   "else{$('#processUpload',m).disabled=!uploadComplete(m)}"],
  ["  const complete=uploadQueue.length&&uploadQueue.every(q=>q.name.trim()&&(q.type!=='arte'||q.folderId));$('#processUpload',m).disabled=!complete;",
   "  $$('[data-position]',list).forEach(button=>button.onclick=()=>{const q=uploadQueue[+button.dataset.position],group=m.orderPositions?.groups?.find(row=>row.key===button.dataset.key);if(!q||!group)return;applyUploadPosition(m,q,group);renderUploadList(m,{lockedType});});\n  $$('[data-folder-change]',list).forEach(button=>button.onclick=()=>{uploadQueue[+button.dataset.folderChange].showFolder=true;renderUploadList(m,{lockedType});});\n  $('#processUpload',m).disabled=!uploadComplete(m);"],
  // Salvar: posição escolhida em vez de "qual personalização"; a pasta não trava.
  ["  if(uploadQueue.some(q=>!String(q.name||'').trim()))return toast('Dê um nome claro para cada arquivo antes de salvar.','err');\n  if(uploadQueue.some(q=>q.type==='arte'&&!q.folderId))return toast('Escolha uma pasta para cada arte antes de salvar.','err');\n  if(!mockupMode&&currentWorkspace?.workspace_type==='client'&&!clientUploadWithoutOrderEnabled&&!workspaceHasOfficialOrder(currentWorkspace.id))return toast('Este cliente ainda não possui pedido oficial. Libere temporariamente em Configurações ou sincronize o pedido.','err');\n\n  const uploadWorkspace=",
   "  if(!mockupMode&&m.orderContext?.projectId&&!m.orderPositions)await loadUploadPositions(m);\n  for(const q of uploadQueue)applyUploadPosition(m,q);\n  if(!mockupMode&&m.orderPositions?.groups?.length&&uploadQueue.some(q=>q.type==='arte'&&!q.positionKey)){renderUploadList(m,{lockedType:mockupMode});return toast('Escolha onde vai cada arte (posição do pedido).','err');}\n  if(uploadQueue.some(q=>!String(q.name||'').trim()))return toast('Dê um nome claro para cada arquivo antes de salvar.','err');\n  if(uploadQueue.some(q=>q.type==='arte'&&!q.folderId)){const folderId=await ensureQuickReadyFolder(m.orderContext);for(const q of uploadQueue)if(q.type==='arte'&&!q.folderId)q.folderId=folderId;}\n  if(uploadQueue.some(q=>q.type==='arte'&&!q.folderId))return toast('Escolha uma pasta para cada arte antes de salvar.','err');\n  if(!mockupMode&&currentWorkspace?.workspace_type==='client'&&!clientUploadWithoutOrderEnabled&&!workspaceHasOfficialOrder(currentWorkspace.id))return toast('Este cliente ainda não possui pedido oficial. Libere temporariamente em Configurações ou sincronize o pedido.','err');\n\n  const uploadWorkspace="],
  ["    for(const q of queue.filter(q=>q.type==='arte')){\n      if(uploadWorkspace?.workspace_type!=='client')continue;\n      const target=await zero19Sync.chooseUploadTarget(uploadWorkspace.id,{...(m.orderContext||{}),excludeSaleIds:usedSales});\n      if(target){uploadTargets.set(q,target);usedSales.push(target.item.personalization_sale_id);}\n    }",
   "    const positions=m.orderPositions;\n    for(const q of queue.filter(q=>q.type==='arte')){\n      if(uploadWorkspace?.workspace_type!=='client')continue;\n      // 2.17.91: pedido vinculado = a posição escolhida (todas as camisas dela). Sem estampa esperando arte: só salva no cliente.\n      if(m.orderContext?.projectId&&positions){const group=positions.groups.find(row=>row.key===q.positionKey);if(group&&positions.project)uploadTargets.set(q,{project:positions.project,item:group.items[0],group});continue;}\n      let target=null;try{target=await zero19Sync.chooseUploadTarget(uploadWorkspace.id,{...(m.orderContext||{}),excludeSaleIds:usedSales});}catch(error){if(/cancelad/i.test(error?.message||''))throw error;toast((error?.message||'Sem personalização para vincular.')+' A arte fica salva no cliente.','err');}\n      if(target){uploadTargets.set(q,target);usedSales.push(target.item.personalization_sale_id);}\n    }"],
  ["Object.assign(assetRow.metadata,{personalization_sale_id:target.item.personalization_sale_id,zero19_work_item_id:target.item.id,pdv_position_code:production.position_code||null,pdv_position_label:production.position_label||null});}",
   "Object.assign(assetRow.metadata,{personalization_sale_id:target.item.personalization_sale_id,zero19_work_item_id:target.item.id,pdv_position_code:production.position_code||null,pdv_position_label:production.position_label||null});if(target.group&&target.group.items.length>1)Object.assign(assetRow.metadata,{personalization_sale_id:null,zero19_work_item_id:null,zero19_work_item_ids:target.group.items.map(item=>item.id),pdv_position_label:target.group.label});}"],
  ["  stage(uploadWorkspace?.workspace_type==='client'?`Concluído: ${done} de ${queue.length}. Abrindo posição…`:`Concluído: ${done} de ${queue.length}. Arte salva na biblioteca.`);\n  uploadQueue.forEach(item=>item.preview&&URL.revokeObjectURL(item.preview));uploadQueue=[];m.remove();\n  const quickUpload=Boolean(m.orderContext?.quick)&&uploadWorkspace?.workspace_type==='client';",
   "  stage(uploadWorkspace?.workspace_type==='client'?`Concluído: ${done} de ${queue.length}. Arte salva.`:`Concluído: ${done} de ${queue.length}. Arte salva na biblioteca.`);\n  uploadQueue.forEach(item=>item.preview&&URL.revokeObjectURL(item.preview));uploadQueue=[];m.remove();\n  const quickUpload=uploadWorkspace?.workspace_type==='client'&&(quickDone.length>0||Boolean(m.orderContext?.projectId));"],
  ["      const result=await finishQuickUpload(quickDone),linkedIds=new Set(result.linked.map(row=>row.asset.id)),rest=savedAssets.filter(asset=>!linkedIds.has(asset.id));",
   "      const result=await finishQuickUpload(quickDone),linkedIds=new Set(result.linked.map(row=>row.asset.id)),rest=quickDone.map(row=>row.asset).filter(asset=>!linkedIds.has(asset.id));\n      if(!quickDone.length)toast('Arte salva no cliente. Este pedido não tem estampa esperando arte.','ok');"],
]);
replaceBlock('app.js','async function finishQuickUpload(done){','\nfunction showQuickUploadBar(',`async function finishQuickUpload(done){
  const linked=[],skipped=[];
  for(const {asset,target,widthCm,heightCm} of done){
    const items=target?.group?.items||(target?.item?[target.item]:[]);
    if(!target?.project?.id||!items.length||!(widthCm>0||heightCm>0)){skipped.push(asset);continue;}
    const profile=await supabase.from('z19p_asset_print_profiles').update({ready_for_print:true,updated_by:session.user.id,updated_at:new Date().toISOString()}).eq('asset_id',asset.id).eq('owner_id',accountOwnerId());
    if(profile.error){console.warn('upload profile',profile.error);skipped.push(asset);continue;}
    const ids=[];let qty=0,failure='';
    for(const item of items){const result=await supabase.rpc('z19p_zero19_mark_art_ready',{p_project_id:target.project.id,p_personalization_sale_id:item.personalization_sale_id,p_asset_id:asset.id});if(result.error){console.warn('upload link',result.error);failure=result.error.message||'';}else{ids.push(item.id);qty+=Math.max(1,Number(item.quantity)||1);}}
    if(!ids.length){toast('Arte salva, mas não foi possível ligar ao pedido: '+(failure||'tente de novo.'),'err');skipped.push(asset);continue;}
    if(failure)toast('Arte ligada a '+ids.length+' de '+items.length+' camisas: '+failure,'err');
    linked.push({asset,workItemId:ids[0],workItemIds:ids,qty,label:target.group?.label||target.item?.metadata?.details?.[0]?.production?.position_label||'',orderNo:target.project.official_order_payload?.display_id||String(target.project.official_order_ref||'').slice(0,8)});
  }
  zero19Sync?.invalidate?.();
  return {linked,skipped};
}`);
replaceBlock('app.js','function showQuickUploadBar(result,','\nfunction openUploadModal(',`function showQuickUploadBar(result,{fromFilm=false,workspace=null,projects=[]}={}){
  document.querySelector('.z19-upload-done')?.remove();document.querySelector('.z19-back-to-film')?.remove();
  if(!result?.linked?.length)return;
  const orders=[...new Set(result.linked.map(row=>row.orderNo).filter(Boolean))].join(', #'),single=result.linked.every(row=>(row.workItemIds||[row.workItemId]).length===1);
  const where=result.linked.map(row=>escapeHTML(row.label||'arte')+(row.qty?' · '+row.qty+' camisa'+(row.qty===1?'':'s'):'')).join(' · ');
  const bar=document.createElement('div');bar.className='z19-upload-done';bar.setAttribute('role','status');
  bar.innerHTML='<span>✓ Arte salva no pedido'+(orders?' #'+escapeHTML(orders):'')+'<small>'+where+' · pronta em Aguardando produção do Montar filme.</small></span><button class="btn primary" type="button" data-quick-film>⇢ Jogar no filme agora</button>'+(single?'<button class="btn" type="button" data-quick-place>Posicionar no mockup</button>':'')+(fromFilm?'<button class="btn ghost" type="button" data-quick-back>← Voltar para o filme</button>':'')+'<button class="btn ghost small" type="button" aria-label="Fechar" data-quick-close>×</button>';
  bar.querySelector('[data-quick-film]').onclick=()=>{bar.remove();void zero19Sync?.addAssetsToFilm?.(result.linked.flatMap(row=>row.workItemIds||[row.workItemId]));};
  bar.querySelector('[data-quick-place]')?.addEventListener('click',async()=>{bar.remove();try{await officialOrders?.offerAfterUpload?.(result.linked.map(row=>row.asset),{workspace,projects,allowWithoutOrder:true});}catch(error){toast(error.message||'Não foi possível abrir a posição.','err');}});
  bar.querySelector('[data-quick-back]')?.addEventListener('click',()=>{bar.remove();nav('/filme');});
  bar.querySelector('[data-quick-close]').onclick=()=>bar.remove();
  document.body.appendChild(bar);const off=()=>{bar.remove();window.removeEventListener('hashchange',off)};window.addEventListener('hashchange',off);
}
// 2.17.91: arte ligada a pedido escolhe a POSIÇÃO (grupo das camisas do PDV com a mesma posição e medida).
async function loadUploadPositions(m){
  const projectId=m.orderContext?.projectId;if(!projectId||!zero19Sync?.orderArtPositions)return;
  let positions=null;try{positions=await zero19Sync.orderArtPositions(projectId);}catch(error){console.warn('upload positions',error);}
  if(!m.isConnected||m.orderContext?.projectId!==projectId)return;
  m.orderPositions=positions&&Array.isArray(positions.groups)?positions:{project:null,workspace:null,orderNo:'',groups:[]};
  for(const q of uploadQueue)applyUploadPosition(m,q);
  paintUploadOrderBar(m);if(uploadQueue.length)renderUploadList(m,{lockedType:false});
}
function defaultUploadGroup(m){
  const groups=m.orderPositions?.groups||[];if(groups.length===1)return groups[0];
  if(m.pickedItem&&m.orderContext?.workItemId)return groups.find(group=>group.items.some(item=>item.id===m.orderContext.workItemId))||null;
  return null;
}
function applyUploadPosition(m,q,group){
  if(!q||q.type!=='arte'||!m.orderPositions?.groups?.length)return;
  const chosen=group||m.orderPositions.groups.find(row=>row.key===q.positionKey)||defaultUploadGroup(m);if(!chosen)return;
  const changed=q.positionKey!==chosen.key;q.positionKey=chosen.key;
  const ratio=Number(q.aspectRatio)||0,cm=value=>String(Math.round(value*100)/100).replace('.',',');
  if(changed||!(Number(String(q.widthCm||'').replace(',','.'))>0||Number(String(q.heightCm||'').replace(',','.'))>0)){
    if(chosen.widthCm>0){q.widthCm=cm(chosen.widthCm);q.heightCm=ratio>0?cm(chosen.widthCm/ratio):'';q.sizeAxis='width';}
    else if(chosen.heightCm>0){q.heightCm=cm(chosen.heightCm);q.widthCm=ratio>0?cm(chosen.heightCm*ratio):'';q.sizeAxis='height';}
  }
  if(!String(q.name||'').trim()||q.autoName){q.name='Pedido #'+(m.orderPositions.orderNo||'')+' · '+chosen.label;q.autoName=true;}
}
function uploadPositionHTML(m,q,i){
  const groups=m.orderPositions.groups,cm=value=>String(Math.round(Number(value)*100)/100).replace('.',',');
  return '<div class="upload-position'+(q.positionKey?' is-set':'')+'"><label>'+(groups.length>1?'Onde vai esta arte? *':'Posição do pedido')+'</label><div class="upload-position-options">'+groups.map(group=>'<button type="button" data-position="'+i+'" data-key="'+escapeHTML(group.key)+'" aria-pressed="'+(q.positionKey===group.key)+'">'+escapeHTML(group.label)+(group.widthCm>0?' · '+cm(group.widthCm)+' cm':group.heightCm>0?' · altura '+cm(group.heightCm)+' cm':'')+'<small>'+group.qty+' camisa'+(group.qty===1?'':'s')+(group.waiting?'':' · já tem arte (troca)')+'</small></button>').join('')+'</div></div>';
}
const uploadComplete=m=>uploadQueue.length>0&&uploadQueue.every(q=>String(q.name||'').trim()&&(q.type!=='arte'||q.folderId)&&(q.type!=='arte'||!m.orderPositions?.groups?.length||q.positionKey));
function paintUploadOrderBar(m){
  const bar=m.querySelector('.upload-order-link');if(!bar)return;
  if(!m.orderContext){
    const orders=m.workspaceOrders||[];
    bar.innerHTML='<div><b>Vincular a um pedido pendente</b><small>'+(orders.length?'Este cliente tem '+orders.length+' pedidos esperando arte: toque no pedido ou busque outro.':'Número do pedido, nome do cliente ou WhatsApp. A arte vai para o pedido e fica pronta em Aguardando produção.')+'</small>'+(orders.length?'<div class="upload-order-picks">'+orders.map((order,index)=>'<button type="button" class="btn" data-upload-order="'+index+'">Pedido #'+escapeHTML(order.orderNo)+' · '+order.groups.map(group=>escapeHTML(group.label)).join(', ')+'</button>').join('')+'</div>':'')+'</div><form class="upload-order-search"><input id="uploadOrderQuery" placeholder="Ex.: 49801, Ana ou (19) 99999-0000" autocomplete="off" aria-label="Número do pedido, nome ou WhatsApp"><button class="btn primary" type="submit">Buscar pedido</button></form>';
    bar.querySelectorAll('[data-upload-order]').forEach(button=>button.onclick=()=>{const order=orders[Number(button.dataset.uploadOrder)];if(!order)return;m.orderContext={projectId:order.projectId};m.autoLinked=true;m.orderPositions=null;bar.innerHTML='<div><b>Carregando as posições do pedido #'+escapeHTML(order.orderNo)+'…</b></div>';void loadUploadPositions(m);});
    bar.querySelector('form')?.addEventListener('submit',event=>{event.preventDefault();const query=m.querySelector('#uploadOrderQuery').value.trim();if(!query){toast('Digite o número do pedido, o nome ou o WhatsApp.','err');return}if(!zero19Sync?.openGlobalUpload){toast('Busca de pedidos indisponível agora.','err');return}
      pendingUploadCarry={at:Date.now(),fromFilm:m.fromFilm,readyForPrint:true,items:uploadQueue.map(q=>({file:q.file,name:q.autoName?'':q.name,widthCm:q.widthCm,heightCm:q.heightCm,sizeAxis:q.sizeAxis,aspectRatio:q.aspectRatio,preview:q.preview}))};
      uploadQueue=[];m.remove();void zero19Sync.openGlobalUpload(query);});
    return;
  }
  const positions=m.orderPositions,groups=positions?.groups||[];
  bar.innerHTML='<div><b>✓ Vinculada ao pedido'+(positions?.orderNo?' #'+escapeHTML(positions.orderNo):'')+'</b><small>'+(!positions?'Carregando as posições do pedido…':groups.length?(groups.length>1?'Escolha em cada arte onde ela vai: ':'Posição: ')+groups.map(group=>escapeHTML(group.label)+' ('+group.qty+' camisa'+(group.qty===1?'':'s')+')').join(' · ')+'. Ao salvar, a arte fica pronta em Aguardando produção, sem mockup.':'Este pedido não tem estampa esperando arte: a arte fica salva no cliente.')+'</small></div>'+(m.autoLinked?'<button type="button" class="btn small" data-upload-unlink>Não é deste pedido</button>':'');
  bar.querySelector('[data-upload-unlink]')?.addEventListener('click',()=>{m.orderContext=null;m.orderPositions=null;m.autoLinked=false;for(const q of uploadQueue){delete q.positionKey;if(q.autoName){q.name='';q.autoName=false;}}paintUploadOrderBar(m);renderUploadList(m,{lockedType:false});});
}`);

for(const name of fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n)))write(name,read(name).replace(/\b2\.17\.90\b/g,'2.17.91'));
if(!read('index.html').includes('content="2.17.91"'))throw new Error('v91: versão não foi renovada.');
for(const name of ['zero19-pdv-sync.js','production-v217.js','app.js','zero19-production-queue.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
console.log('019 2.17.91: arte do pedido por posição (todas as camisas), pasta automática, sem chave de pronta, Pronto/Pronto e entregue nos próximos pedidos.');
