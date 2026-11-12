// 2.17.94 on top of 2.17.93 (12/11, dono: "no modal de Aguardando produção melhore o layout, mais visual e mais funcional; as mini
// imagens estão demorando muito para abrir; coloque uma barra de pesquisa para pesquisar nome do cliente, número do pedido ou número
// de WhatsApp para achar as artes deste pedido ou cliente para colocar no filme"; e "no filme coloque um botão para abrir um modal
// onde colocamos o número do pedido, nome do cliente ou telefone, localiza o pedido, adiciona o pedido lá e pode marcar como impresso
// aquele pedido, tirando da fila e deixando no status correto").
// film-pending-ui.js: busca, artes agrupadas por pedido (Selecionar · Pôr no filme · Já impresso), miniaturas leves (240 px pelo
// Supabase, só quando aparecem, 6 por vez; se falhar, o arquivo de sempre). "Já impresso" usa a MESMA função do banco da exportação
// (z19p_mark_selected_order_production): a aplicação vai para "em produção" e o pedido segue o fluxo normal.
// Botão novo "🔎 Buscar pedido" no filme abre a mesma janela já com a busca.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.93"'))throw new Error('v94 exige a base 2.17.93.');
if(!fs.existsSync(path.join(dist,'film-pending-ui.js')))throw new Error('v94: film-pending-ui.js não foi copiado para o dist.');
function patch(name,pairs){let source=read(name);for(const [before,after,times=1] of pairs){const count=source.split(before).length-1;if(count!==times)throw new Error('v94 '+name+': trecho alterado ou ausente ('+count+'×): '+before.slice(0,90));source=source.split(before).join(after);}write(name,source);}
patch('production-v217.js',[
  ["import {installPendingBatchAdd} from './film-bulk-add.js?v=2.17.93';",
   "import {installPendingBatchAdd} from './film-bulk-add.js?v=2.17.93';\nimport {enhancePendingPicker,markPendingPrinted,pendingThumbHtml} from './film-pending-ui.js?v=2.17.93';"],
  ["(entry.image?'<img width=\"72\" height=\"72\" style=\"display:block;width:72px;height:72px;max-width:72px;max-height:72px;object-fit:contain\" src=\"'+h(entry.image)+'\" alt=\"Prévia da estampa\" loading=\"lazy\">'",
   "(entry.image?pendingThumbHtml(entry.image,h)"],
  ["const openUnifiedPendingPicker=async({keep,preselectProject}={})=>{",
   "const openUnifiedPendingPicker=async({keep,preselectProject,focusSearch}={})=>{"],
  // Pedidos que ainda esperam arte também abrem a janela (com "Subir arte"), mesmo sem nenhuma arte pronta.
  ["      if(!entries.length)return ctx.toast('Nada aguardando produção agora.','ok');",
   "      let pendingArtOrders=[];try{pendingArtOrders=await ctx.zero19Orders?.pendingArtUploadRows?.()||[];}catch(error){console.warn('pedidos sem arte',error);}\n      if(!pageCurrent())return;\n      if(!entries.length&&!pendingArtOrders.length)return ctx.toast('Nada aguardando produção agora.','ok');"],
  ["      document.body.appendChild(modal);updateCount();",
   "      document.body.appendChild(modal);updateCount();\n"
   +"      try{enhancePendingPicker({modal,entries,supabase,isPrivatePath:path=>Boolean(ctx.assetUrls?.isPrivatePath?.(path)),isCurrent:pageCurrent,updateCount,focusSearch,\n"
   +"        markPrinted:picked=>markPendingPrinted(supabase,picked),pendingArt:pendingArtOrders,\n"
   +"        undoPrinted:ctx.zero19Orders?.undoPrinted?(project,sales,placements)=>ctx.zero19Orders.undoPrinted(project,sales,placements):null,\n"
   +"        finishOrder:ctx.zero19Orders?.finishOrderQuick?(project,delivered)=>ctx.zero19Orders.finishOrderQuick(project,delivered):null,\n"
   +"        onUploadArt:ctx.zero19Orders?.openGlobalUpload?(orderNo)=>{modal.remove();void ctx.zero19Orders.openGlobalUpload(String(orderNo||''),{quick:true,fromFilm:true});}:null,\n"
   +"        onPrinted:(group,info)=>{ctx.toast(info?.undone?'Desfeito: as artes voltaram para Aguardando produção.':info?.finished?'Pedido pronto e entregue: saiu da fila.':'Arte marcada como impressa: saiu de Aguardando produção e está em produção.','ok');void refreshOrders().catch(()=>{});},\n"
   +"        onError:error=>ctx.toast(error?.message||'Não foi possível tirar da fila. Nada foi alterado.','err')});}catch(error){console.warn('janela aguardando produção',error);}"],
  ["<button class=\"btn film-action film-action-pending\" id=\"addOfficialPending\">◷ Aguardando produção</button>",
   "<button class=\"btn film-action film-action-pending\" id=\"addOfficialPending\">◷ Aguardando produção</button><button class=\"btn film-action film-action-pending\" id=\"findFilmOrder\">🔎 Buscar pedido</button>"],
  ["app.querySelector('#addOfficialPending').onclick=()=>safe(()=>openUnifiedPendingPicker());",
   "app.querySelector('#addOfficialPending').onclick=()=>safe(()=>openUnifiedPendingPicker());{const find=app.querySelector('#findFilmOrder');if(find)find.onclick=()=>safe(()=>openUnifiedPendingPicker({focusSearch:true}));}"],
]);
// Natan, pedido 50836 (dono 12/11: "não está deixando eu marcar como pronto, os outros dão mas esse não"): arte subida pelo
// "Subir arte" do pedido sem posicionar (tipo 'art', 2.17.90) ficou sem o botão "✓ Já está pronta".
patch('film-pending-produced.js',[["['font','vdr','venduss'].includes(entry.kind)","['font','vdr','venduss','art'].includes(entry.kind)"]]);
const files=fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n));
(function walk(dir){for(const e of fs.readdirSync(path.join(dist,dir),{withFileTypes:true})){const rel=path.join(dir,e.name);if(e.isDirectory())walk(rel);else if(/\.(js|css)$/.test(e.name))files.push(rel);}})('vetor');
for(const name of files)write(name,read(name).replace(/\b2\.17\.93\b/g,'2.17.94'));
if(!read('index.html').includes('content="2.17.94"'))throw new Error('v94: versão não foi renovada.');
for(const name of ['production-v217.js','film-pending-ui.js','film-pending-produced.js','app.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
console.log('019 2.17.94: Aguardando produção com busca (cliente, pedido, WhatsApp), grupos por pedido, miniaturas leves, "Já impresso" e botão Buscar pedido.');
