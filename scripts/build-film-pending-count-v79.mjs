// 2.17.79 on top of the tested 2.17.78 build (15/10, dono: Aguardando produção sem contador; chegam artes
// novas enquanto adiciona). Botão mostra "N para adicionar · M no filme", lê a fila ao abrir o filme e a
// cada 30 s (e ao voltar para a aba), avisa quando chega arte nova e a janela aberta oferece "Mostrar na
// lista" sem perder a seleção. Só leitura da fila: não muda pedido, fila, filme nem arquivo.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.78"'))throw new Error('v79 exige a base 2.17.78.');
if(!fs.existsSync(path.join(dist,'film-pending-count.js')))throw new Error('v79: film-pending-count.js ausente no build.');
for(const name of fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n)))write(name,read(name).replace(/\b2\.17\.78\b/g,'2.17.79'));
let prod=read('production-v217.js');
const once=(needle,next)=>{const parts=prod.split(needle);if(parts.length!==2)throw new Error('v79: trecho mudou ('+parts.length+'x): '+needle.slice(0,90));prod=parts[0]+next+parts[1];};
prod="import {filmPendingSummary,filmPendingBadge,filmPendingArrivals} from './film-pending-count.js?v=2.17.79';\n"+prod;
// Estado do contador e da leitura silenciosa (sem aviso de erro a cada 30 s).
once("let orderRows=null,fontOrderRows=[],officialPendingRows=[],vendussPendingRows=[],vdrPendingRows=[],ordersRequest=0;",
"let orderRows=null,fontOrderRows=[],officialPendingRows=[],vendussPendingRows=[],vdrPendingRows=[],ordersRequest=0;\n"+
"    // 2.17.79: quantas faltam adicionar e quantas já estão no filme, na hora e sozinho.\n"+
"    let quietOrdersRefresh=false,ordersLoading=false,seenPendingKeys=null;\n"+
"    const pendingNow=()=>orderRows?filmPendingSummary({orderRows,fontRows:fontOrderRows,officialRows:officialPendingRows,vendussRows:vendussPendingRows,vdrRows:vdrPendingRows,filmItems,pendingQuantity,rowKey:filmOrderRowKey}):null;\n"+
"    const showPendingCount=button=>{const now=pendingNow();button.innerHTML=filmPendingBadge(now);if(!now)return;button.title=now.toAdd+' arte(s) esperando para entrar no filme · '+now.inFilm+' já neste filme';const arrived=filmPendingArrivals(seenPendingKeys,now);if(arrived.length&&!document.querySelector('.film-pending-modal'))ctx.toast('Chegou '+arrived.length+' arte(s) nova(s) em Aguardando produção.','ok');seenPendingKeys=new Set([...(seenPendingKeys||[]),...now.keys]);};");
once("if(pendingButton)pendingButton.innerHTML='◷ Aguardando produção <b style=\"margin-left:6px;border-radius:999px;padding:2px 7px;background:#ff6428;color:#111\">'+totalPending+'</b>';",
"if(pendingButton)showPendingCount(pendingButton);");
once("const refreshOrders=async()=>{const request=++ordersRequest;try{","const refreshOrders=async()=>{const request=++ordersRequest;ordersLoading=true;try{");
once("}catch(error){if(pageCurrent()&&request===ordersRequest)ctx.toast('Não foi possível atualizar os pedidos: '+(error.message||error),'err');return false;}};",
"}catch(error){if(pageCurrent()&&request===ordersRequest&&!quietOrdersRefresh)ctx.toast('Não foi possível atualizar os pedidos: '+(error.message||error),'err');return false;}finally{if(request===ordersRequest)ordersLoading=false;}};");
// Lê a fila logo depois de abrir (sem segurar a abertura) e a cada 30 s / ao voltar para a aba.
once("setTimeout(()=>{if(pageCurrent())void refreshFilmJobs(media)},0);",
"setTimeout(()=>{if(pageCurrent())void refreshFilmJobs(media)},0);\n"+
"    {const pendingButton=app.querySelector('#addOfficialPending');if(pendingButton&&!orderRows)pendingButton.innerHTML=filmPendingBadge(null);\n"+
"     const pendingPoll=async()=>{if(!pageCurrent()||ordersLoading||document.visibilityState==='hidden'||ordersSlot.contains(document.activeElement))return;quietOrdersRefresh=true;try{await ensureFilmCatalog();if(pageCurrent())await refreshOrders();}catch{}finally{quietOrdersRefresh=false;}const button=app.querySelector('#addOfficialPending');if(button&&!orderRows&&pageCurrent())button.innerHTML=filmPendingBadge(null,true);};\n"+
"     setTimeout(()=>void pendingPoll(),1200);const pendingTimer=setInterval(()=>{if(!pageCurrent()){clearInterval(pendingTimer);document.removeEventListener('visibilitychange',pendingVisible);return;}void pendingPoll();},30000);\n"+
"     const pendingVisible=()=>{if(!pageCurrent()){document.removeEventListener('visibilitychange',pendingVisible);return;}if(document.visibilityState==='visible')void pendingPoll();};document.addEventListener('visibilitychange',pendingVisible);}");
// Janela aberta: avisa quando chega arte nova e reabre com a mesma seleção.
once("const openUnifiedPendingPicker=async()=>{\n      await ensureFilmCatalog();","const openUnifiedPendingPicker=async({keep}={})=>{\n      await ensureFilmCatalog();");
once("      document.body.appendChild(modal);updateCount();","      document.body.appendChild(modal);updateCount();\n"+
"      // 2.17.79 (dono 15/10): seleção mantida ao reabrir e aviso de arte nova sem fechar a janela.\n"+
"      if(keep)entries.forEach((entry,index)=>{if(!keep.has(entry.key)||entry.alreadyInFilm)return;const input=modal.querySelector('[data-entry=\"'+index+'\"]');if(input&&!input.disabled&&!input.checked){input.checked=true;input.onchange?.();}});\n"+
"      {const known=new Set(entries.map(entry=>entry.key)),notice=document.createElement('div');notice.hidden=true;notice.setAttribute('role','status');notice.style.cssText='display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0;padding:10px 12px;border-radius:12px;background:#fff4e5;border:2px solid #ff6428;color:#4a1d00';\n"+
"       (modal.querySelector('.film-pending-list')||modal.querySelector('.modal-head'))?.before(notice);\n"+
"       const watch=setInterval(async()=>{if(!modal.isConnected||!pageCurrent()){clearInterval(watch);return;}if(busy||ordersLoading||document.visibilityState==='hidden')return;quietOrdersRefresh=true;try{await refreshOrders();}catch{}finally{quietOrdersRefresh=false;}if(!modal.isConnected)return;const now=pendingNow(),fresh=now?[...now.waiting].filter(key=>!known.has(key)):[];if(!fresh.length){notice.hidden=true;return;}notice.hidden=false;notice.innerHTML='<b style=\"flex:1 1 220px\">🔔 Chegou '+fresh.length+' arte(s) nova(s) em Aguardando produção</b><button class=\"btn primary small\" type=\"button\" data-show-new-pending>Mostrar na lista (mantém a seleção)</button>';notice.querySelector('[data-show-new-pending]').onclick=()=>{if(busy)return;const keepSelected=new Set(selected);clearInterval(watch);modal.remove();void safe(()=>openUnifiedPendingPicker({keep:keepSelected}));};},20000);}");
write('production-v217.js',prod);
for(const name of ['production-v217.js','film-pending-count.js','film-picker.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
execFileSync(process.execPath,[path.join(root,'scripts/verify-film-pending-count-v79.mjs'),dist],{stdio:'inherit',timeout:60000});
console.log('019 2.17.79: Aguardando produção mostra quantas faltam e quantas já estão no filme, sozinho; tamanho digitado nas artes da empresa vale na hora.');
