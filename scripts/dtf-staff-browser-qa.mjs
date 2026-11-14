// Teste do lado da equipe do DTF por metro (13/11) no app inteiro do dist, com o banco SIMULADO da conta da ZERO19:
// botão "🎞 Pedidos DTF metro" no Montar filme com contador; janela com os pedidos; "Pôr no meu filme" coloca cada arte do
// pedido como item próprio (medida e quantidade do cliente) e marca "em produção"; Pronto; cadastro de cliente com tabela
// por arte e link de acesso (/dtf#convite=…); "🎞 Clientes DTF metro" no menu; outra conta não vê nada; celular.
// Uso: node scripts/dtf-staff-browser-qa.mjs [pasta das fotos]   (rode depois do build)
import fsSync from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url)),baseScript=fsSync.readFileSync(path.join(here,'zero19-queue-browser-qa.mjs'),'utf8');
const cut=baseScript.indexOf('  // 1) Tela inicial:');
if(cut<0)throw new Error('Base do teste mudou: marcador "1) Tela inicial" não encontrado.');
let head=baseScript.slice(0,cut);
const OTHER=process.env.DTF_QA_OTHER_ACCOUNT==='1';
if(!OTHER)head=head.replace("OWNER='5b0f6a52-6a0e-4a8e-9d3c-1f2a3b4c5d6e'","OWNER='96d8732c-9576-4af9-9fe7-cdee065c14e6'");
if(!OTHER&&!head.includes("OWNER='96d8732c-9576-4af9-9fe7-cdee065c14e6'"))throw new Error('Base do teste mudou: OWNER.');
head=head.replace("async function rpc(name,args={}){await new Promise(r=>setTimeout(r,25));window.qa.rpc.push(name);","async function rpc(name,args={}){await new Promise(r=>setTimeout(r,25));window.qa.rpc.push(name);if(name.startsWith('z19p_dtf_'))return window.qaDtf(name,args);");
if(!head.includes('window.qaDtf(name,args)'))throw new Error('Base do teste mudou: rpc do simulador.');

const steps=String.raw`
  // Banco simulado do DTF: 2 pedidos (1 novo, 1 em produção) e 1 cliente.
  await send('Page.addScriptToEvaluateOnNewDocument',{source:"(()=>{const calls=[];window.qaDtfCalls=calls;const items=[{assetId:'a1',name:'Logo grande',path:'u1/dtf/a1/print.png',thumbPath:'u1/dtf/a1/thumb.png',widthCm:25,heightCm:30,quantity:4,widthPx:2953,heightPx:3543},{assetId:'a2',name:'Peito',path:'u1/dtf/a2/print.png',thumbPath:'u1/dtf/a2/thumb.png',widthCm:9,heightCm:9,quantity:10,widthPx:1063,heightPx:1063}];const orders=[{id:'f1',name:'Pedido loja',status:'sent',filmWidthCm:58,lengthCm:70.3,total:80,price:{charged:'meter',meter:{meters:1,perMeter:80,total:80}},items,delivery:'pickup',note:'Preciso até sexta',orderId:'o1',orderNumber:51001,sentAt:new Date(Date.now()-3600e3).toISOString(),payment:{status:'PENDENTE',paid:0,total:80},clientId:'c1',clientName:'Ana Estamparia',clientWhatsapp:'(19) 98888-7777',clientEmail:'ana@exemplo.com'},{id:'f2',name:'Bonés',status:'printing',filmWidthCm:28,lengthCm:120,total:90,items:items.slice(1),delivery:'shipping',orderId:'o2',orderNumber:51002,sentAt:new Date(Date.now()-86400e3).toISOString(),printingAt:new Date().toISOString(),payment:{status:'PARCIAL',paid:40,total:90},clientId:'c1',clientName:'Ana Estamparia',clientWhatsapp:'(19) 98888-7777'}];const clients=[{id:'c1',name:'Ana Estamparia',email:'ana@exemplo.com',whatsapp:'(19) 98888-7777',price58:80,price28:45,mode:'auto',artTable:[{maxWidthCm:10,maxHeightCm:10,price:5}],active:true,hasAccess:true,lastLoginAt:new Date().toISOString(),arts:12,orders:2,linkPending:false}];window.qaDtf=async(name,args)=>{calls.push({name,args});if(name==='z19p_dtf_staff_count')return {data:orders.filter(o=>o.status==='sent').length,error:null};if(name==='z19p_dtf_staff_orders')return {data:JSON.parse(JSON.stringify(orders)),error:null};if(name==='z19p_dtf_staff_clients')return {data:JSON.parse(JSON.stringify(clients)),error:null};if(name==='z19p_dtf_staff_set_status'){const o=orders.find(x=>x.id===args.p_film_id);if(args.p_status==='printing'&&o.status==='sent'){o.status='printing';o.printingAt=new Date().toISOString();}else if(args.p_status!=='printing')o.status=args.p_status;return {data:{ok:true},error:null};}if(name==='z19p_dtf_save_client'){const p=args.p;if(!p.whatsapp)return {data:null,error:{message:'Informe o WhatsApp do cliente com DDD (é o cadastro dele no PDV).'}};const c={...p,id:p.id||'c'+(clients.length+1),hasAccess:false,arts:0,orders:0,linkPending:false};const i=clients.findIndex(x=>x.id===c.id);i>=0?clients[i]=c:clients.push(c);return {data:{id:c.id},error:null};}if(name==='z19p_dtf_issue_access')return {data:{token:'TOKENqa1234567890abcdefgh',purpose:'first',expiresAt:new Date(Date.now()+7*86400e3).toISOString()},error:null};return {data:null,error:{message:'rpc '+name}};};})()"});
  await send('Page.reload');
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:origin+'/index.html#/filme'});
  await wait('document.querySelector("#addFilmAsset")','Montar filme',40000);
  ${process.env.DTF_QA_OTHER_ACCOUNT==='1'?`
  await delay(2500);
  assert.equal(await evaluate('!!document.querySelector("#openDtfOrders")'),false,'outra conta não vê o botão');
  assert.equal(await evaluate('!!document.querySelector("[data-dtf-panel]")'),false,'outra conta não vê o menu');
  assert.equal(await evaluate('window.qaDtfCalls.length'),0,'outra conta não consulta o DTF');
  report.push('outra conta: sem botão, sem menu, sem consulta');
  `:`
  await wait('document.querySelector("#openDtfOrders")','botão Pedidos DTF metro');
  await wait('document.querySelector("#openDtfOrders [data-dtf-badge]")&&!document.querySelector("#openDtfOrders [data-dtf-badge]").hidden','contador do botão',15000);
  assert.equal(await evaluate('document.querySelector("#openDtfOrders [data-dtf-badge]").textContent'),'1','1 pedido novo');
  assert.ok(await evaluate('!!document.querySelector("[data-dtf-panel=clients]")'),'item Clientes DTF metro no menu');
  const unitsOf=()=>evaluate('parseInt(document.querySelector("[data-film-units]")?.textContent||"0",10)||0');const before=await unitsOf();
  await evaluate('document.querySelector("#openDtfOrders").click()');
  await wait('document.querySelectorAll(".z19dtf-order").length===2','janela com os 2 pedidos');
  const first=await evaluate('document.querySelector(".z19dtf-order").innerText');report.push('pedido: '+first.replace(/\s+/g,' ').slice(0,260));
  assert.match(first,/Ana Estamparia/);assert.match(first,/51001/);assert.match(first,/Novo · na fila/);assert.match(first,/A receber/);assert.match(first,/Preciso até sexta/);
  await wait('[...document.querySelectorAll(".z19dtf-thumb img")].every(i=>i.complete&&i.naturalWidth>0)','miniaturas');
  await shot('dtf-01-pedidos');await noSideScroll('pedidos dtf');
  await evaluate('[...document.querySelectorAll(".z19dtf-order")][0].querySelector("[data-a=film]").click()');
  await wait('!document.querySelector(".z19dtf-back")','janela fechou depois de pôr no filme',15000);
  await wait('document.querySelector("#filmItems")&&document.querySelector("#filmItems").innerText.includes("Ana Estamparia")','artes do cliente no filme',20000);
  const listText=await evaluate('document.querySelector("#filmItems").innerText');report.push('no filme: '+listText.replace(/\s+/g,' ').slice(0,300));
  assert.match(listText,/Logo grande/);assert.match(listText,/Peito/);
  const calls=await evaluate('window.qaDtfCalls.filter(c=>c.name==="z19p_dtf_staff_set_status").map(c=>c.args)');
  assert.deepEqual(calls,[{p_film_id:'f1',p_status:'printing'}],'marcou em produção');
  // Itens separados (um por arte), com a quantidade do cliente: 4 + 10 = 14 unidades a mais.
  await wait('parseInt(document.querySelector("[data-film-units]").textContent,10)==='+(before+14),'14 unidades a mais no filme',15000);
  const perArt=await evaluate('(document.querySelector("#filmItems").innerText.match(/Ana Estamparia/g)||[]).length');report.push('itens do cliente no filme: '+perArt+' · unidades '+(await unitsOf()));
  assert.ok(perArt>=2,'uma linha por arte');
  await wait('document.querySelector("#filmCanvas,canvas.film-canvas,.film-preview canvas,.film-preview img")','prévia do filme',30000);
  await shot('dtf-02-no-filme');
  // De novo: pedido já "em produção" pede confirmação para pôr outra vez; Pronto.
  await evaluate('document.querySelector("#openDtfOrders").click()');
  await wait('document.querySelectorAll(".z19dtf-order").length===2','janela de novo');
  assert.match(await evaluate('document.querySelector(".z19dtf-order").innerText'),/Em produção/);
  await evaluate('[...document.querySelectorAll(".z19dtf-order")].find(o=>o.innerText.includes("51001")).querySelector("[data-a=ready]").click()');
  await wait('window.qaDtfCalls.some(c=>c.name==="z19p_dtf_staff_set_status"&&c.args.p_status==="ready")','Pronto');
  // Clientes: cadastro sem WhatsApp recusa; com WhatsApp, abre o link de acesso.
  await evaluate('document.querySelector("[data-t=clients]").click()');
  await wait('document.querySelector(".z19dtf-client-row")','lista de clientes');
  assert.match(await evaluate('document.querySelector(".z19dtf-client-row").innerText'),/Último acesso/);
  await evaluate('document.querySelector("[data-new]").click()');
  await wait('document.querySelector("[data-form] input[name=name]")','formulário de cliente');
  await evaluate('(()=>{const f=document.querySelector("[data-form]").elements;f.name.value="Bia Camisetas";f.email.value="bia@exemplo.com";f.price58.value="85,50";f.price28.value="48";document.querySelector("[data-form] input[name=mode][value=art]").click();})()');
  await wait('!document.querySelector("[data-table]").hidden','tabela por arte aparece');
  await evaluate('(()=>{const r=document.querySelectorAll("[data-r]");const set=(n,k,v)=>{const i=r[n].querySelector("[data-k="+k+"]");i.value=v;i.dispatchEvent(new Event("input",{bubbles:true}))};set(0,"price","6,5");set(1,"price","15");})()');
  await shot('dtf-03-novo-cliente');
  await evaluate('document.querySelector("[data-save]").click()');
  await wait('!document.querySelector("[data-err]").hidden','sem WhatsApp recusa');
  assert.match(await evaluate('document.querySelector("[data-err]").textContent'),/WhatsApp/);
  await evaluate('(()=>{const f=document.querySelector("[data-form]").elements;f.whatsapp.value="(19) 97777-6666";})()');
  await evaluate('document.querySelector("[data-save]").click()');
  await wait('document.querySelector("[data-link]")','link de acesso',15000);
  const link=await evaluate('document.querySelector("[data-link]").value');report.push('link: '+link);
  assert.equal(link,origin+'/dtf#convite=TOKENqa1234567890abcdefgh');
  const saved=await evaluate('window.qaDtfCalls.filter(c=>c.name==="z19p_dtf_save_client").pop().args.p');report.push('salvo: '+JSON.stringify(saved));
  assert.equal(saved.price58,85.5);assert.equal(saved.price28,48);assert.equal(saved.mode,'art');assert.deepEqual(saved.artTable.map(r=>r.price),[6.5,15]);
  const wa=await evaluate('document.querySelector(".z19dtf-foot a.primary")?.href||""');assert.match(decodeURIComponent(wa),/5519977776666/);assert.match(decodeURIComponent(wa),/bia@exemplo.com/);
  await shot('dtf-04-link');
  await evaluate('document.querySelectorAll(".z19dtf-back").forEach(b=>b.remove())');
  // Celular: janela de pedidos.
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(500);
  await evaluate('document.querySelector("#openDtfOrders").click()');
  await wait('document.querySelectorAll(".z19dtf-order").length===2','pedidos no celular');
  await shot('dtf-05-pedidos-celular');await noSideScroll('pedidos dtf celular');
  `}
  const tela=errors.filter(e=>e&&!/ResizeObserver/.test(e));if(tela.length)console.log('ERROS DE TELA:',[...new Set(tela)].slice(0,8).join(' | '));assert(!tela.length,'erro de tela');
  console.log(report.join('\n'));
  console.log(${process.env.DTF_QA_OTHER_ACCOUNT==='1'?"'PASS DTF por metro: outra conta não vê nada'":"'PASS DTF por metro · equipe: botão com contador, pedidos, pôr no filme (artes separadas, medida e quantidade do cliente), pronto, cadastro com tabela por arte e link de acesso, celular'"});
}finally{socket?.close();child.kill();server.close()}
`;
const script=head+steps;
const file=path.join(here,'.dtf-staff-qa-run.mjs');fsSync.writeFileSync(file,script);
try{await import(file+'?t='+Date.now());}finally{setTimeout(()=>{try{fsSync.unlinkSync(file)}catch{}},2000);}
