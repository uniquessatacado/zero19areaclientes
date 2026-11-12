// 2.17.95 on top of 2.17.94 (12/11, dono: "quando eu for subir a arte, em cada arte que eu subir permita identificar de qual pedido
// ela é pelo número do pedido, pelo telefone ou pelo nome do cliente; quando eu selecionar o pedido abra modal perguntando em qual
// posição é, sempre mostrando as opções que já foram cadastradas no pedido quando tirou no PDV; no caso de outra arte no mesmo upload
// tenho que identificar, mas já disponibilizar o pedido achado da outra arte como atalho e a posição faltante; se eu quiser pesquisar
// também pode; quando eu subir já fica disponível na produção").
// Cada arte tem o seu pedido (q.order = posições do pedido, como orderArtPositions); sem pedido próprio vale o pedido da janela
// (QR, página do cliente), como antes. A arte é salva no cliente do pedido dela (pasta "Artes prontas" desse cliente) e ligada às
// camisas da posição escolhida (z19p_zero19_mark_art_ready, o mesmo de antes): fica pronta em Aguardando produção e aparece na
// página do QR da produção (NovoVenduss, OrderArtViews).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.94"'))throw new Error('v95 exige a base 2.17.94.');
if(!fs.existsSync(path.join(dist,'upload-art-order.js')))throw new Error('v95: upload-art-order.js não foi copiado para o dist.');
function patch(name,pairs){let source=read(name);for(const [before,after,times=1] of pairs){const count=source.split(before).length-1;if(count!==times)throw new Error('v95 '+name+': trecho alterado ou ausente ('+count+'×): '+before.slice(0,90));source=source.split(before).join(after);}write(name,source);}
function replaceBlock(name,start,end,replacement){const source=read(name),a=source.indexOf(start),b=source.indexOf(end,a+1);if(a<0||b<0||source.indexOf(start,a+1)>=0)throw new Error('v95 '+name+': bloco não encontrado: '+start.slice(0,60));write(name,source.slice(0,a)+replacement+source.slice(b));}
function patchAfter(name,marker,before,after){const source=read(name),at=source.indexOf(marker);if(at<0)throw new Error('v95 '+name+': marcador ausente '+marker.slice(0,50));const i=source.indexOf(before,at);if(i<0)throw new Error('v95 '+name+': trecho ausente depois do marcador: '+before.slice(0,80));write(name,source.slice(0,i)+after+source.slice(i+before.length));}

// zero19-pdv-sync: busca de pedido e posições pelo número/nome/WhatsApp, sem trocar de tela.
patch('zero19-pdv-sync.js',[
  ['  async function openOrdersForWorkspace(workspaceId){',
   "  // 2.17.95: identificar o pedido de cada arte no envio (busca e posições do PDV), sem sair da janela.\n"
   +"  async function searchOrdersForArt(query){const {data,error}=await supabase.rpc('z19p_zero19_order_picker',{p_limit:20,p_offset:0,p_query:String(query||'').trim()||null});if(error)throw error;return Array.isArray(data?.rows)?data.rows:[];}\n"
   +"  async function orderPositionsForOrder(orderId){const result=await supabase.rpc('z19p_sync_zero19_order',{p_order_id:orderId});if(result.error)throw result.error;const projectId=result.data?.project_id;if(!projectId)throw new Error('Não encontrei este pedido no Personalizações.');invalidate();const positions=await orderArtPositions(projectId);if(!positions.project)throw new Error('Pedido ainda sem personalização no Personalizações. Atualize e tente de novo.');return positions;}\n"
   +"  // 2.17.95 (Aguardando produção): pedidos que ainda esperam arte, pronto/entregue e desfazer o Já impresso.\n"
   +"  async function pendingArtUploadRows(){const data=await load(true);return data.summaries.map(summary=>({projectId:summary.project.id,orderNo:orderNo(summary.project),workspace:summary.workspace,project:summary.project,stage:summary.stage,groups:artGroups(summary.items).filter(group=>group.items.some(item=>['awaiting_art','art_received','awaiting_halftone'].includes(item.stage)))})).filter(row=>row.groups.length&&!['ready_pickup','delivered','cancelled'].includes(row.stage));}\n"
   +"  async function finishOrderQuick(projectId,delivered){let result=await supabase.rpc('z19p_zero19_force_stage',{p_project_id:projectId,p_stage:'ready_pickup'});if(!result.error&&delivered)result=await supabase.rpc('z19p_zero19_mark_delivered',{p_project_id:projectId});if(result.error)throw result.error;invalidate();return true;}\n"
   +"  async function undoPrinted(projectId,saleIds,placementIds){const {data,error}=await supabase.rpc('z19p_zero19_undo_printed',{p_project_id:projectId,p_sale_ids:saleIds||[],p_placement_ids:placementIds||[]});if(error)throw error;invalidate();return data;}\n"
   +'  async function openOrdersForWorkspace(workspaceId){'],
  ['return {renderHome,','return {searchOrdersForArt,orderPositionsForOrder,pendingArtUploadRows,finishOrderQuick,undoPrinted,renderHome,'],
]);

const app='app.js';
patch(app,[["import { createProductionModule } from './production-v217.js?v=2.17.94';","import { createProductionModule } from './production-v217.js?v=2.17.94';\nimport { openArtOrderPicker, orderShortcuts, usedPositions } from './upload-art-order.js?v=2.17.94';"]]);
replaceBlock(app,'function defaultUploadGroup(m){','function paintUploadOrderBar(m){',`// 2.17.95: cada arte tem o seu pedido (q.order); sem pedido próprio vale o da janela. q.noOrder = "não é de pedido".
const uploadOrderOf=(m,q)=>q?.noOrder?null:q?.order||m.orderPositions||null;
function defaultUploadGroup(m,q){
  const order=uploadOrderOf(m,q),groups=order?.groups||[];if(groups.length===1)return groups[0];
  if(!q?.order&&m.pickedItem&&m.orderContext?.workItemId)return groups.find(group=>group.items.some(item=>item.id===m.orderContext.workItemId))||null;
  return null;
}
function applyUploadPosition(m,q,group){
  const order=uploadOrderOf(m,q);
  if(!q||q.type!=='arte'||!order?.groups?.length)return;
  const chosen=group||order.groups.find(row=>row.key===q.positionKey)||defaultUploadGroup(m,q);if(!chosen)return;
  const changed=q.positionKey!==chosen.key;q.positionKey=chosen.key;
  const ratio=Number(q.aspectRatio)||0,cm=value=>String(Math.round(value*100)/100).replace('.',',');
  if(changed||!(Number(String(q.widthCm||'').replace(',','.'))>0||Number(String(q.heightCm||'').replace(',','.'))>0)){
    if(chosen.widthCm>0){q.widthCm=cm(chosen.widthCm);q.heightCm=ratio>0?cm(chosen.widthCm/ratio):'';q.sizeAxis='width';}
    else if(chosen.heightCm>0){q.heightCm=cm(chosen.heightCm);q.widthCm=ratio>0?cm(chosen.heightCm*ratio):'';q.sizeAxis='height';}
  }
  if(!String(q.name||'').trim()||q.autoName){q.name='Pedido #'+(order.orderNo||'')+' · '+chosen.label;q.autoName=true;}
}
function uploadPositionHTML(m,q,i){
  const order=uploadOrderOf(m,q),groups=order?.groups||[],cm=value=>String(Math.round(Number(value)*100)/100).replace('.',','),client=order?.workspace?.client_name||order?.workspace?.company_name||'';
  const head='<div class="upload-art-order'+(order?' is-linked':'')+'"><span>'+(order?'<b>Pedido #'+escapeHTML(order.orderNo||'')+'</b>'+(client?' · '+escapeHTML(client):''):'<b>Pedido não identificado</b><small>Sem pedido a arte fica só na pasta.</small>')+'</span><button type="button" class="btn small'+(order?'':' primary')+'" data-art-order="'+i+'">'+(order?'Trocar pedido':'🔎 Identificar pedido')+'</button></div>';
  if(!order)return head;
  if(!groups.length)return head+'<small class="upload-art-order-note">Este pedido não tem estampa esperando arte: a arte fica salva no cliente.</small>';
  return head+'<div class="upload-position'+(q.positionKey?' is-set':'')+'"><label>'+(groups.length>1?'Onde vai esta arte? *':'Posição do pedido')+'</label><div class="upload-position-options">'+groups.map(group=>'<button type="button" data-position="'+i+'" data-key="'+escapeHTML(group.key)+'" aria-pressed="'+(q.positionKey===group.key)+'">'+escapeHTML(group.label)+(group.widthCm>0?' · '+cm(group.widthCm)+' cm':group.heightCm>0?' · altura '+cm(group.heightCm)+' cm':'')+'<small>'+group.qty+' camisa'+(group.qty===1?'':'s')+(group.waiting?'':' · já tem arte (troca)')+'</small></button>').join('')+'</div></div>';
}
const uploadComplete=m=>uploadQueue.length>0&&uploadQueue.every(q=>String(q.name||'').trim()&&(q.type!=='arte'||q.folderId||uploadOrderOf(m,q))&&(q.type!=='arte'||!uploadOrderOf(m,q)?.groups?.length||q.positionKey));
// Pasta "Artes prontas" do cliente do pedido (a arte vai para o cliente certo, mesmo subindo pela biblioteca).
async function readyFolderIn(workspace){
  if(!workspace?.id)return '';
  if(workspace.id===currentWorkspace?.id){const own=defaultReadyFolderId();if(own)return own;}
  const found=await supabase.from('z19p_folders').select('id').eq('owner_id',accountOwnerId()).eq('workspace_id',workspace.id).eq('purpose','artes_prontas').is('parent_id',null).limit(1).maybeSingle();
  if(found.data?.id)return found.data.id;
  const folder={id:crypto.randomUUID(),owner_id:accountOwnerId(),workspace_id:workspace.id,project_id:null,parent_id:null,name:'Artes prontas',purpose:'artes_prontas',sort_order:20,created_by:session.user.id,updated_by:session.user.id};
  const {error}=await supabase.from('z19p_folders').insert(folder);if(error)throw error;return folder.id;
}
async function pickArtOrder(m,index,lockedType){
  const q=uploadQueue[index];if(!q)return;
  if(!zero19Sync?.searchOrdersForArt||!zero19Sync?.orderPositionsForOrder)return toast('Busca de pedidos indisponível agora. Atualize a página.','err');
  const used=usedPositions(uploadQueue,item=>uploadOrderOf(m,item),q);
  const shortcuts=orderShortcuts([m.orderPositions,...uploadQueue.map(item=>item.order)].filter(order=>order?.project?.id),used);
  const picked=await openArtOrderPicker({shortcuts,used,preview:q.preview,title:q.name||'Arte '+(index+1),search:query=>zero19Sync.searchOrdersForArt(query),resolve:row=>zero19Sync.orderPositionsForOrder(row.order_id)});
  if(!picked||!m.isConnected||uploadQueue[index]!==q)return;
  if(picked.none){q.order=null;q.noOrder=true;delete q.positionKey;if(q.autoName){q.name='';q.autoName=false;}}
  else{q.order=picked.order;q.noOrder=false;delete q.positionKey;if(q.autoName){q.name='';q.autoName=false;}if(picked.group)applyUploadPosition(m,q,picked.group);else applyUploadPosition(m,q);}
  renderUploadList(m,{lockedType});
}
`);
patch(app,[
  // Cada arte mostra o pedido dela (ou "Identificar pedido"); a barra de cima não leva mais para outra tela.
  ["${q.type==='arte'&&m.orderPositions?.groups?.length?uploadPositionHTML(m,q,i):''}","${q.type==='arte'&&!q.standaloneHalftone?uploadPositionHTML(m,q,i):''}"],
  ["  $$('[data-position]',list).forEach(button=>button.onclick=()=>{const q=uploadQueue[+button.dataset.position],group=m.orderPositions?.groups?.find(row=>row.key===button.dataset.key);",
   "  $$('[data-art-order]',list).forEach(button=>button.onclick=()=>void pickArtOrder(m,+button.dataset.artOrder,lockedType));\n  $$('[data-position]',list).forEach(button=>button.onclick=()=>{const q=uploadQueue[+button.dataset.position],group=uploadOrderOf(m,q)?.groups?.find(row=>row.key===button.dataset.key);"],
  ['<form class="upload-order-search"><input id="uploadOrderQuery" placeholder="Ex.: 49801, Ana ou (19) 99999-0000" autocomplete="off" aria-label="Número do pedido, nome ou WhatsApp"><button class="btn primary" type="submit">Buscar pedido</button></form>','',2],
  ["Número do pedido, nome do cliente ou WhatsApp. A arte vai para a personalização do pedido e o status muda sozinho. Os arquivos escolhidos vão junto.","Escolha os arquivos e toque em “🔎 Identificar pedido” em cada arte: número do pedido, nome ou WhatsApp, e depois a posição do PDV."],
  ["'Número do pedido, nome do cliente ou WhatsApp. A arte vai para o pedido e fica pronta em Aguardando produção.'","'Toque em “🔎 Identificar pedido” em cada arte: número do pedido, nome ou WhatsApp, e depois a posição do PDV.'"],
  ["pedidos esperando arte: toque no pedido ou busque outro.","pedidos esperando arte: toque no pedido (vale para todas as artes) ou identifique em cada arte."],
  ["  if(!mockupMode&&m.orderPositions?.groups?.length&&uploadQueue.some(q=>q.type==='arte'&&!q.positionKey)){","  if(!mockupMode&&uploadQueue.some(q=>q.type==='arte'&&uploadOrderOf(m,q)?.groups?.length&&!q.positionKey)){"],
  ["      if(uploadWorkspace?.workspace_type!=='client')continue;\n","      const qOrder=uploadOrderOf(m,q);if(qOrder?.project){const group=qOrder.groups.find(row=>row.key===q.positionKey);if(group)uploadTargets.set(q,{project:qOrder.project,item:group.items[0],group,workspace:qOrder.workspace});continue;}\n      if(q.noOrder||uploadWorkspace?.workspace_type!=='client')continue;\n"],
  ["for(const q of uploadQueue){delete q.positionKey;if(q.autoName){q.name='';q.autoName=false;}}paintUploadOrderBar(m);","for(const q of uploadQueue){if(q.order)continue;delete q.positionKey;if(q.autoName){q.name='';q.autoName=false;}}paintUploadOrderBar(m);"],
  ["  const quickUpload=uploadWorkspace?.workspace_type==='client'&&(quickDone.length>0||Boolean(m.orderContext?.projectId));","  const quickUpload=quickDone.length>0||uploadWorkspace?.workspace_type==='client'&&Boolean(m.orderContext?.projectId);"],
  ["assetRow={id:assetId,owner_id:accountOwnerId(),workspace_id:uploadWorkspace.id,project_id:officialProject?.id||null,folder_id:q.folderId||null,","assetRow={id:assetId,owner_id:accountOwnerId(),workspace_id:assetWorkspace.id,project_id:officialProject?.id||null,folder_id:assetFolder||null,"],
]);
// A arte vai para o cliente do pedido dela (pasta Artes prontas desse cliente).
patchAfter(app,'processQueue = async function',"base=`${session.user.id}/${uploadWorkspace.id}/${q.folderId||'root'}/${assetId}`",
  "base=`${session.user.id}/${assetWorkspace.id}/${assetFolder||'root'}/${assetId}`");
patchAfter(app,'processQueue = async function',"      const byHeight=",
  "      const preTarget=uploadTargets.get(q),assetWorkspace=preTarget?.workspace?.id&&preTarget.workspace.id!==uploadWorkspace?.id?preTarget.workspace:uploadWorkspace,assetFolder=assetWorkspace===uploadWorkspace?q.folderId:await readyFolderIn(assetWorkspace);\n      const byHeight=");
// Estilo da linha do pedido em cada arte.
const css="\n/* 2.17.95: pedido de cada arte no envio */\n.upload-art-order{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border:2px dashed #fdba74;border-radius:14px;background:#fff7ed;color:#0f172a}\n.upload-art-order.is-linked{border-style:solid;border-color:#86efac;background:#f0fdf4}\n.upload-art-order span{display:grid;gap:2px;min-width:0}.upload-art-order b{font-size:15px;font-weight:900}.upload-art-order small{font-size:12px;font-weight:700;color:#475569}\n.upload-art-order .btn{min-height:44px}\n.upload-art-order-note{grid-column:1/-1;font-weight:700;color:#475569}\n";
write('qr-screens.css',read('qr-screens.css')+css);

const files=fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n));
(function walk(dir){for(const e of fs.readdirSync(path.join(dist,dir),{withFileTypes:true})){const rel=path.join(dir,e.name);if(e.isDirectory())walk(rel);else if(/\.(js|css)$/.test(e.name))files.push(rel);}})('vetor');
for(const name of files)write(name,read(name).replace(/\b2\.17\.94\b/g,'2.17.95'));
if(!read('index.html').includes('content="2.17.95"'))throw new Error('v95: versão não foi renovada.');
for(const name of ['app.js','zero19-pdv-sync.js','upload-art-order.js','production-v217.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
console.log('019 2.17.95: cada arte do envio identifica o seu pedido (número, nome ou WhatsApp) e a posição do PDV, com atalho do pedido de outra arte e a posição que falta.');
