// 2.17.96 (13/11, dono): subir PNG de 2 m e "✂ Dividir em partes" de até 1 m — no app inteiro do dist, banco e
// armazenamento SIMULADOS (o simulador grava as artes e guarda os arquivos que iriam para o servidor).
// Confere: caixa "✂ Arte com 2,00 m de altura" na arte alta; dividir pelo DPI do arquivo (300) em "ana 1/2" e "ana 2/2",
// cortes em linha sem pixel, medida travada e exata; "Desfazer divisão"; salvar manda o PNG de cada parte com os pixels
// EXATOS do original (decodificado aqui e comparado byte a byte) e a medida exata; PNG grande (47 milhões de pixels)
// lido sem canvas: a outra medida aparece sozinha e o PNG final sai com os pixels exatos; sem erro de tela.
// Uso: node scripts/zero19-split-art-browser-qa.mjs [pasta das fotos]   (rode depois do build)
// A base (servidor, Chrome, simulador do Supabase) é a mesma do scripts/zero19-queue-browser-qa.mjs.
import fsSync from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url)),baseScript=fsSync.readFileSync(path.join(here,'zero19-queue-browser-qa.mjs'),'utf8');
const cut=baseScript.indexOf('  // 1) Tela inicial:');
if(cut<0)throw new Error('Base do teste de envio mudou: marcador "1) Tela inicial" não encontrado.');
let head=baseScript.slice(0,cut);
// O simulador expõe os dados gravados e guarda o que o envio mandaria para o Storage.
head=head.replace("window.qa={rpc:[],writes:[]};","window.qa={rpc:[],writes:[]};window.qaData=data;");
if(!head.includes('window.qaData=data'))throw new Error('Base do teste de envio mudou: simulador sem window.qa.');
head="import fsSync from 'node:fs';\n"+head;
head=head.replace("const watchdog=setTimeout(()=>{console.log('watchdog');process.exit(2)},420000);","const watchdog=setTimeout(()=>{console.log('watchdog');process.exit(2)},600000);");

const steps=String.raw`
  // Arquivos de teste: PNG RGBA 300 DPI com artes separadas por faixas vazias (e borda suave de alfa 4).
  const PX=11811/100;
  const pngFile=(name,W,H,blocks)=>{
    const rowBytes=W*4,raw=Buffer.alloc((rowBytes+1)*H),rows=[];
    for(let y=0;y<H;y++){const r=Buffer.alloc(rowBytes);for(const b of blocks){const [x0,x1,y0,y1,c]=b;if(y>=y0-1&&y<=y1+1){const soft=y<y0||y>y1;for(let x=x0;x<=x1;x++){const o=x*4;r[o]=c[0];r[o+1]=(c[1]+x+y)&255;r[o+2]=c[2];r[o+3]=soft?4:255;}}}rows.push(r);raw[y*(rowBytes+1)]=0;r.copy(raw,y*(rowBytes+1)+1);}
    const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0}),crc=buf=>{let c=0xffffffff;for(const v of buf)c=table[(c^v)&255]^(c>>>8);return (c^0xffffffff)>>>0};
    const chunk=(type,d)=>{const len=Buffer.alloc(4);len.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(type),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([len,td,c])};
    const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(H,4);ihdr[8]=8;ihdr[9]=6;const phys=Buffer.alloc(9);phys.writeUInt32BE(11811,0);phys.writeUInt32BE(11811,4);phys[8]=1;
    const comp=zlib.deflateSync(raw,{level:6}),idat=[];for(let at=0;at<comp.length;at+=65536)idat.push(chunk('IDAT',comp.subarray(at,at+65536)));
    const file=path.join(out,name);fsSync.writeFileSync(file,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('pHYs',phys),...idat,chunk('IEND',Buffer.alloc(0))]));
    return {file,W,H,rows};
  };
  const decode=buf=>{let off=8,ihdr,idat=[],phys=null;while(off<buf.length){const len=buf.readUInt32BE(off),type=buf.toString('latin1',off+4,off+8),d=buf.subarray(off+8,off+8+len);if(type==='IHDR')ihdr=d;if(type==='IDAT')idat.push(d);if(type==='pHYs')phys=d;off+=12+len;if(type==='IEND')break;}
    const W=ihdr.readUInt32BE(0),H=ihdr.readUInt32BE(4),rb=W*4,raw=zlib.inflateSync(Buffer.concat(idat)),rows=[];let prev=Buffer.alloc(rb);
    const pa=(a,b,c)=>{const p=a+b-c,x=Math.abs(p-a),y=Math.abs(p-b),z=Math.abs(p-c);return x<=y&&x<=z?a:y<=z?b:c};
    for(let y=0;y<H;y++){const t=raw[y*(rb+1)],f=raw.subarray(y*(rb+1)+1,(y+1)*(rb+1)),o=Buffer.alloc(rb);for(let i=0;i<rb;i++){const a=i>=4?o[i-4]:0,b=prev[i],c=i>=4?prev[i-4]:0;o[i]=(f[i]+[0,a,b,(a+b)>>1,pa(a,b,c)][t])&255;}rows.push(o);prev=o;}
    return {W,H,rows,ppm:phys?phys.readUInt32BE(0):0};
  };
  // ana.png: 2 m a 300 DPI; A e B cabem no 1º metro, C começa depois de 99 cm e vai para a 2ª parte.
  const ana=pngFile('ana.png',1200,23622,[[100,1100,100,5000,[220,30,40]],[50,1150,5200,11700,[30,90,220]],[200,900,11750,16000,[20,160,70]],[60,1000,16100,23000,[240,200,30]]]);
  const big=pngFile('grande.png',2000,23622,[[40,1960,300,9000,[200,40,160]],[100,1900,9400,23300,[10,140,200]]]);
  const fileInput=async files=>{const {root}=await send('DOM.getDocument');const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'.upload-modal #fileInput'});await send('DOM.setFileInputFiles',{nodeId,files});};
  await send('Page.addScriptToEvaluateOnNewDocument',{source:"(()=>{const open=XMLHttpRequest.prototype.open,sendX=XMLHttpRequest.prototype.send;window.qaUploads=[];XMLHttpRequest.prototype.open=function(m,u){this.__qa={method:m,url:String(u)};return open.apply(this,arguments)};XMLHttpRequest.prototype.send=function(body){if(this.__qa&&/storage\\/v1\\/object\\//.test(this.__qa.url)&&body instanceof Blob)window.qaUploads.push({url:this.__qa.url,blob:body,size:body.size});return sendX.apply(this,arguments)};})()"});
  const uploadBytes=async pathPart=>Buffer.from(await evaluate("(async()=>{const u=window.qaUploads.find(x=>x.url.includes("+JSON.stringify(pathPart)+"));if(!u)return '';const b=new Uint8Array(await u.blob.arrayBuffer());let s='';for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,i+32768));return btoa(s)})()"),'base64');

  // 1) Montar filme → Subir arte na biblioteca → ana.png (2 m, 300 DPI no arquivo).
  await send('Page.navigate',{url:origin+'/index.html#/filme'});
  await wait('document.querySelector("#quickUploadFilmAsset")','Montar filme',40000);
  await evaluate('document.querySelector("#quickUploadFilmAsset").click()');
  await wait('document.querySelector(".upload-modal #fileInput")','janela de subir arte',30000);
  await fileInput([ana.file]);
  await wait('document.querySelector("#uploadList input[data-k=name]")','ana na lista',30000);
  await evaluate("(()=>{const i=document.querySelector('#uploadList input[data-k=name]');i.value='ana';i.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await wait('document.querySelector("[data-split-run]")','caixa Dividir em partes',20000);
  const boxText=await evaluate('document.querySelector(".upload-split").innerText');report.push('caixa: '+boxText.replace(/\s+/g,' ').slice(0,160));
  assert.match(boxText,/2,00 m de altura/,'mostra 2,00 m pelo DPI do arquivo');assert.match(boxText,/ana 1\/2/,'explica os nomes');
  await shot('1-caixa-dividir');
  // 2) Ver opções: até 3, cada uma com mapa; a 1ª é a recomendada (corte reto). Ampliar mostra o mapa grande. Nada é gravado
  //    antes de escolher; ao usar a opção: 2 partes, nomes, medida travada e exata, mapa com os cortes.
  await evaluate('document.querySelector("[data-split-run]").click()');
  await wait('document.querySelector(".upload-split.is-choosing [data-split-choose]")','opções de corte',120000);
  const opts=await evaluate("[...document.querySelectorAll('.upload-split-option')].map(o=>({title:o.querySelector('b').textContent,text:o.innerText.replace(/\\s+/g,' '),map:o.querySelector('canvas').width}))");
  report.push('opções (ana): '+opts.map(o=>o.text.slice(0,80)).join(' | '));
  assert(opts.length>=2&&opts.length<=3,'2 ou 3 opções');assert.match(opts[0].title,/recomendada/);assert(opts.every(o=>o.map>10),'mapa em cada opção');
  // B e C estão a 4 mm: a recomendada (mais segura) junta as duas como se fossem uma estampa (3 partes); a de 2 partes vem como opção.
  assert.match(opts[0].text,/5 mm/,'recomendada junta peças a menos de 5 mm');const two=opts.findIndex(o=>/· 2 partes/.test(o.text));assert(two>0,'opção com 2 partes oferecida');assert.match(opts[two].text,/Corte reto entre as estampas/);
  assert.equal(await evaluate('document.querySelectorAll("#uploadList .upload-row").length'),1,'nada muda antes de escolher');
  await shot('2a-opcoes');
  await evaluate('document.querySelector("[data-split-zoom]").click()');
  await wait('document.querySelector(".upload-split-zoom canvas")','ampliar a opção',10000);await shot('2b-ampliar');
  await evaluate('document.querySelector("[data-zoom-close]").click()');
  await wait('!document.querySelector(".upload-split-zoom")','fechar o ampliar',5000);
  await evaluate('document.querySelectorAll("[data-split-choose]")['+two+'].click()');
  await wait('document.querySelector(".upload-split.is-done")','divisão pronta',120000);
  const rows=await evaluate("[...document.querySelectorAll('#uploadList .upload-row')].map(r=>({name:r.querySelector('input[data-k=name]').value,w:r.querySelector('[data-size-axis=width]').value,h:r.querySelector('[data-size-axis=height]').value,ro:r.querySelector('[data-size-axis=width]').readOnly&&r.querySelector('[data-size-axis=height]').readOnly,thumb:(r.querySelector('.upload-thumb')?.src||'').slice(0,22)}))");
  report.push('partes na lista: '+JSON.stringify(rows));
  assert.deepEqual(rows.map(r=>r.name),['ana 1/2','ana 2/2'],'nomes ana 1/2 e ana 2/2');
  assert(rows.every(r=>r.ro),'medida da parte travada');assert(rows.every(r=>r.thumb.startsWith('data:image/png')),'miniatura de cada parte');
  const map=await evaluate("(()=>{const c=document.querySelector('[data-split-map]');return c?{w:c.width,h:c.height}:null})()");assert(map&&map.h>100,'mapa com os cortes');
  await shot('2-dividida');
  await wait('!document.querySelector("#processUpload").disabled','salvar liberado depois de dividir',10000);
  // 3) Desfazer e dividir de novo.
  await evaluate('document.querySelector("[data-split-undo]").click()');
  await wait('document.querySelectorAll("#uploadList .upload-row").length===1&&document.querySelector("#uploadList input[data-k=name]").value==="ana"','desfazer volta a arte inteira',10000);
  await evaluate('document.querySelector("[data-split-run]").click()');
  await wait('document.querySelector(".upload-split.is-choosing [data-split-choose]")','opções de novo (já lida)',60000);
  await evaluate('document.querySelectorAll("[data-split-choose]")['+two+'].click()');
  await wait('document.querySelector(".upload-split.is-done")','divisão de novo',60000);
  // 4) Salvar: duas artes, PNG com os pixels exatos do original, medida exata.
  const assetsBefore=await evaluate('(window.qa.assets||[]).length');
  await evaluate('document.querySelector("#processUpload").click()');
  await wait('(window.qa.assets||[]).length>='+(assetsBefore+2),'2 artes salvas',120000);await delay(800);
  const saved=await evaluate("(window.qa.assets||[]).slice("+assetsBefore+").map(a=>({id:a.id,name:a.name,w:a.width,h:a.height,dpi:a.dpi,original:a.original_path,processed:a.processed_path,engine:a.metadata?.processing_engine,split:a.metadata?.split_part}))");
  const profiles=await evaluate("window.qaData.z19p_asset_print_profiles.filter(p=>"+JSON.stringify(saved.map(a=>a.id))+".includes(p.asset_id)).map(p=>({asset:p.asset_id,w:p.default_width_cm,h:p.default_height_cm,r:p.aspect_ratio}))");
  report.push('salvas: '+saved.map(a=>a.name+' '+a.w+'×'+a.h+' px '+a.dpi+' DPI ('+a.engine+')').join(' | '));
  assert.deepEqual(saved.map(a=>a.name),['ana 1/2','ana 2/2']);
  const expected=[{top:99,bottom:11701,left:50,right:1150},{top:11749,bottom:23001,left:60,right:1000}];
  for(const [k,a] of saved.entries()){
    const e=expected[k],w=e.right-e.left+1,h=e.bottom-e.top+1;
    assert.equal(a.w,w,a.name+': largura em px');assert.equal(a.h,h,a.name+': altura em px');assert.equal(a.dpi,300,a.name+': 300 DPI');
    assert.equal(a.split.index,k+1);assert.equal(a.split.total,2);assert.equal(a.engine,'png-split',a.name+': sem canvas');
    const p=profiles.find(x=>x.asset===a.id);assert(p,a.name+': perfil de impressão');
    assert(Math.abs(p.w-w/PX)<1e-9&&Math.abs(p.h-h/PX)<1e-9,a.name+': medida exata '+p.w+' × '+p.h);
    const processed=decode(await uploadBytes(a.processed)),original=decode(await uploadBytes(a.original));
    assert.equal(processed.ppm,11811,a.name+': DPI gravado no PNG');
    for(const img of [processed,original]){assert.equal(img.W,w);assert.equal(img.H,h);for(let y=0;y<h;y++)assert(img.rows[y].equals(ana.rows[e.top+y].subarray(e.left*4,(e.right+1)*4)),a.name+': pixel diferente do original na linha '+(e.top+y));}
  }
  report.push('ana 1/2 e 2/2: pixels idênticos ao original, medidas '+profiles.map(p=>p.w.toFixed(3)+'×'+p.h.toFixed(3)).join(' e ')+' cm');
  await wait('!document.querySelector(".upload-modal")','janela fechada depois de salvar',30000);
  await shot('3-salvas');

  // 5) PNG grande (2000 × 23622 = 47 milhões de pixels) sem dividir: medida aparece sozinha e o PNG final sai exato.
  await send('Page.navigate',{url:origin+'/index.html#/filme'});
  await wait('document.querySelector("#quickUploadFilmAsset")','Montar filme de novo',40000);
  await evaluate('document.querySelector("#quickUploadFilmAsset").click()');
  await wait('document.querySelector(".upload-modal #fileInput")','janela de subir arte (grande)',30000);
  const t0=Date.now();await fileInput([big.file]);
  await wait('document.querySelector("#uploadList input[data-k=name]")','grande na lista',60000);
  await wait('document.querySelector("[data-split-run]")','arte grande lida (caixa de dividir)',120000);
  report.push('PNG de 47 milhões de pixels lido em '+(Date.now()-t0)+' ms');
  const boxW=1960-40+1,typedW=Math.round(boxW/PX*100)/100;
  await evaluate("(()=>{const set=(sel,v)=>{const i=document.querySelector(sel);i.value=v;i.dispatchEvent(new Event('input',{bubbles:true}))};set('#uploadList input[data-k=name]','grande inteira');set('#uploadList input[data-size-axis=width]','"+String(typedW).replace('.',',')+"')})()");
  const autoH=await evaluate("document.querySelector('#uploadList input[data-size-axis=height]').value");report.push('altura calculada sozinha: '+autoH+' cm');
  assert(Math.abs(Number(autoH.replace(',','.'))-typedW*(23301-299+1)/boxW)<0.02,'altura pela proporção da arte sem prancheta');
  await shot('4-grande-lida');
  // Celular: a caixa de dividir cabe sem rolagem lateral.
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await delay(400);
  await evaluate('document.querySelector(".upload-split")?.scrollIntoView({block:"center"})');await delay(200);
  const phone=await evaluate("(()=>{const b=document.querySelector('.upload-split'),r=b.getBoundingClientRect(),btn=document.querySelector('[data-split-run]').getBoundingClientRect();return {left:r.left,right:r.right,vw:innerWidth,btnW:btn.width,btnH:btn.height,doc:document.documentElement.scrollWidth}})()");
  report.push('celular: '+JSON.stringify(phone));assert(phone.left>=0&&phone.right<=phone.vw+1&&phone.doc<=phone.vw+1,'caixa de dividir cabe no celular');assert(phone.btnH>=40,'botão Dividir fácil de tocar');
  await shot('5-celular');
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});await delay(300);
  const before2=await evaluate('(window.qa.assets||[]).length');
  await evaluate('document.querySelector("#processUpload").click()');
  await wait('(window.qa.assets||[]).length>'+before2,'arte grande salva',180000);await delay(500);
  const g=await evaluate("(()=>{const a=(window.qa.assets||[]).at(-1);return {name:a.name,w:a.width,h:a.height,engine:a.metadata?.processing_engine,exact:a.metadata?.exact_pixels,processed:a.processed_path}})()");
  report.push('grande: '+JSON.stringify(g));
  assert.equal(g.engine,'png-exact','PNG grande sem canvas');assert.equal(g.w,boxW);assert.equal(g.h,23301-299+1);
  const gp=decode(await uploadBytes(g.processed));
  for(let y=0;y<gp.H;y+=97)assert(gp.rows[y].equals(big.rows[299+y].subarray(40*4,(40+boxW)*4)),'grande: pixel diferente na linha '+(299+y));
  report.push('grande: PNG final com os pixels do original (sem passar pelo canvas)');


  // 6) Sem nenhuma linha reta vazia (3 colunas de estampas em escada) e partes de até 50 cm: o corte contorna as artes.
  //    Opções com mapa; a recomendada não separa a estampa de 2 peças que fica onde o corte cairia; ao salvar, cada parte
  //    leva só as artes dela (o resto transparente), nenhum pixel visível perdido nem repetido, pixels iguais ao original.
  const designs=[];
  for(const [x0,x1,y0] of [[40,480,30],[520,960,530],[1000,1440,1030]])for(let top=y0;top+1499<11960;top+=1560){
    if(x0===520&&top===5210){designs.push([x0,x1,5210,5899,[200,0,90]],[x0,x1,5920,6709,[200,0,90]]);continue;}
    designs.push([x0,x1,top,top+1499,[(x0*3)&255,(top>>3)&255,120]]);
  }
  const stairs=pngFile('escada.png',1500,12000,designs);
  for(let y=40;y<11880;y+=7)assert(stairs.rows[y].some((v,i)=>i%4===3&&v>=8),'teste sem linha reta vazia ('+y+')');
  await send('Page.navigate',{url:origin+'/index.html#/filme'});
  await wait('document.querySelector("#quickUploadFilmAsset")','Montar filme (escada)',40000);
  await evaluate('document.querySelector("#quickUploadFilmAsset").click()');
  await wait('document.querySelector(".upload-modal #fileInput")','janela de subir arte (escada)',30000);
  await fileInput([stairs.file]);
  await wait('document.querySelector("#uploadList input[data-k=name]")','escada na lista',60000);
  await evaluate("(()=>{const i=document.querySelector('#uploadList input[data-k=name]');i.value='escada';i.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await wait('document.querySelector("[data-split-max]")','caixa de dividir (escada)',30000);
  await evaluate("(()=>{const i=document.querySelector('[data-split-max]');i.value='50';i.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await wait('document.querySelector("[data-split-run]")','caixa com 50 cm',10000);
  await evaluate('document.querySelector("[data-split-run]").click()');
  await wait('document.querySelector(".upload-split.is-choosing [data-split-choose]")','opções com contorno',120000);
  const sopts=await evaluate("[...document.querySelectorAll('.upload-split-option')].map(o=>o.innerText.replace(/\\s+/g,' '))");
  report.push('opções (escada): '+sopts.map(t=>t.slice(0,110)).join(' | '));
  assert(sopts.length>=2&&sopts.length<=3,'2 ou 3 opções');assert.match(sopts[0],/recomendada/);assert.match(sopts[0],/Contorna as estampas/);
  await shot('6a-opcoes-contorno');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await delay(400);
  await evaluate('document.querySelector(".upload-split-option")?.scrollIntoView({block:"start"})');await delay(200);
  const phone2=await evaluate("(()=>{const o=[...document.querySelectorAll('.upload-split-option')].map(e=>e.getBoundingClientRect());return {ok:o.every(r=>r.left>=0&&r.right<=innerWidth+1),vw:innerWidth,doc:document.documentElement.scrollWidth}})()");
  report.push('opções no celular: '+JSON.stringify(phone2));assert(phone2.ok&&phone2.doc<=phone2.vw+1,'opções cabem no celular');
  await shot('6a2-opcoes-celular');
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});await delay(300);
  await evaluate('document.querySelector("[data-split-zoom]").click()');
  await wait('document.querySelector(".upload-split-zoom canvas")','ampliar contorno',10000);await shot('6b-ampliar-contorno');
  await evaluate('document.querySelector("[data-zoom-close]").click()');
  await evaluate('document.querySelector("[data-split-choose]").click()');
  await wait('document.querySelector(".upload-split.is-done")','contorno escolhido',120000);await shot('6c-contorno-dividido');
  const names=await evaluate("[...document.querySelectorAll('#uploadList input[data-k=name]')].map(i=>i.value)");report.push('partes (escada): '+names.join(', '));
  const n=names.length;assert(n>=3&&names.every((v,k)=>v==='escada '+(k+1)+'/'+n),'nomes escada 1/'+n+'…');
  const before3=await evaluate('(window.qa.assets||[]).length');
  await evaluate('document.querySelector("#processUpload").click()');
  await wait('(window.qa.assets||[]).length>='+(before3+n),'partes da escada salvas',180000);await delay(800);
  const sparts=await evaluate("(window.qa.assets||[]).slice("+before3+").map(a=>({name:a.name,w:a.width,h:a.height,processed:a.processed_path,split:a.metadata?.split_part}))");
  const where=new Int8Array(1500*12000).fill(-1);
  for(const [k,a] of sparts.entries()){
    assert(a.h<=Math.floor(50*PX+1e-6),a.name+': passa de 50 cm');assert.equal(a.split.cut,'contorno');
    const img=decode(await uploadBytes(a.processed)),box=a.split.source_box;
    assert.equal(img.W,box.width);assert.equal(img.H,box.height);
    for(let y=0;y<img.H;y++){const row=img.rows[y],src=stairs.rows[box.top+y];for(let x=0;x<img.W;x++){const o=x*4;if(!row[o]&&!row[o+1]&&!row[o+2]&&!row[o+3])continue;const so=(box.left+x)*4;assert(row[o]===src[so]&&row[o+1]===src[so+1]&&row[o+2]===src[so+2]&&row[o+3]===src[so+3],a.name+': pixel diferente do original');if(row[o+3]>=8){const i=(box.top+y)*1500+box.left+x;assert.equal(where[i],-1,a.name+': pixel repetido em duas partes');where[i]=k;}}}
  }
  for(let y=0;y<12000;y++){const r=stairs.rows[y];for(let x=0;x<1500;x++)if(r[x*4+3]>=8)assert(where[y*1500+x]>=0,'pixel visível perdido em '+x+','+y);}
  for(const [x0,x1,top,bottom] of designs){const first=where[top*1500+x0];for(let y=top;y<=bottom;y+=37)for(let x=x0;x<=x1;x+=29)assert.equal(where[y*1500+x],first,'estampa dividida entre partes ('+x0+','+top+')');}
  assert.equal(where[5500*1500+700],where[6300*1500+700],'a estampa de 2 peças ficou inteira numa parte');
  report.push('escada: '+n+' partes de até 50 cm, cada estampa inteira numa parte, pixels iguais ao original');
  const tela=errors.filter(e=>!/ResizeObserver/.test(e));if(tela.length)console.log('ERROS DE TELA:',[...new Set(tela)].slice(0,8).join(' | '));assert(!tela.length,'erro de tela');
  console.log(report.join('\n'));
  console.log('PASS dividir arte de 2 m: opções com mapa e ampliar, partes ana 1/2 e 2/2 com pixels e medidas exatas, desfazer, PNG grande sem canvas, contorno sem linha reta (estampas inteiras). Fotos: '+out);
}finally{socket?.close();child.kill();server.close()}
`;
const tmp=path.join(here,'.zero19-split-art-qa.generated.mjs');
fsSync.writeFileSync(tmp,head+steps);
try{await import(tmp+'?'+Date.now());}finally{fsSync.rmSync(tmp,{force:true});}
