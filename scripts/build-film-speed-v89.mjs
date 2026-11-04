// 2.17.89 on top of 2.17.88 (03/11, dono: "quando seleciono artes em Aguardando produção para jogar no filme, ele não
// recalcula o filme sozinho; quando clico numa arte no filme e aperto delete, ele buga a tela, não consigo mais clicar em
// nenhum; quando aperto em Arte de empresa demora para abrir; quando adiciono artes demora para mostrar a arte no filme;
// deixe tudo liso, sem bug").
//  1. Delete: o filme redesenhado ficava com a marca "is-validating" do filme anterior (pointer-events:none) e nada mais
//     recebia clique. A marca é limpa ao montar, e a troca no lugar (applyRemoval) volta a valer: a geração da prévia só
//     muda quando o filme é redesenhado de verdade.
//  2. Aguardando produção: depois de adicionar, o filme calcula sozinho (antes ficava esperando Atualizar filme).
//  3. Prévia, miniaturas da lista e análise de transparência usam a imagem leve (film-light-image.js, 1536 px) e só baixam
//     o PNG de impressão quando o zoom pede; a máscara fica guardada pelo caminho do arquivo (o link assinado muda a cada
//     15 min e fazia baixar de novo). A coluna thumbnail_path não existe em z19p_assets: a leitura falhava calada.
//  4. Arte de empresa: catálogo, pastas e links das artes privadas são preparados logo que o filme abre; os links são
//     pedidos 4 por vez (antes um pedido depois do outro) e um arquivo que falta não impede a janela de abrir; cartões
//     fora da tela só são montados ao rolar e o formato de centímetros é criado uma vez.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.88"'))throw new Error('v89 exige a base 2.17.88.');
if(!fs.existsSync(path.join(dist,'film-light-image.js')))throw new Error('v89: film-light-image.js não foi copiado para o dist.');
function patch(name,pairs){let source=read(name);for(const [before,after,times=1] of pairs){const count=source.split(before).length-1;if(count!==times)throw new Error('v89 '+name+': trecho alterado ou ausente ('+count+'×): '+before.slice(0,70));source=source.split(before).join(after);}write(name,source);}

patch('film-preview.js',[
  ['element._filmViewport?.destroy?.();const keep=element._filmKeepView;delete element._filmKeepView;',
   "element._filmViewport?.destroy?.();element.classList.remove('is-validating');const keep=element._filmKeepView;delete element._filmKeepView;"],
  ['finally{delete element._filmKeepView;if(active())setBusy(false);}}',
   "finally{delete element._filmKeepView;if(active())setBusy(false);else if(!element._filmViewport||element._filmViewport===api)element.classList.remove('is-validating');}}"],
]);

patch('production-v217.js',[
  ["import {createFilmMaskCache} from './film-mask-cache.js?v=2.17.88';",
   "import {createFilmMaskCache} from './film-mask-cache.js?v=2.17.88';\nimport {filmImageBucket,filmLightImageUrl} from './film-light-image.js?v=2.17.88';"],
  ['filmCalculationGeneration++;filmPreviewGeneration++;filmItems=result.items;lastFilm=result.layout;',
   'filmCalculationGeneration++;filmItems=result.items;lastFilm=result.layout;if(!(inPlace&&lastFilm?.placements.length))filmPreviewGeneration++;'],
  ['if(inPlace&&viewport?.applyRemoval){inPlace(lastFilm);if(!viewport.applyRemoval(lastFilm))drawFilm(media);}else drawFilm(media);',
   'if(inPlace&&viewport?.applyRemoval){inPlace(lastFilm);if(viewport.applyRemoval(lastFilm))filmCostPanel?.refresh?.();else drawFilm(media);}else drawFilm(media);'],
  ['          // Adding the batch never waits for original images, masks or nesting.\n          await refreshItems({autoCalculate:false,skipHydrate:true});drawOrders();',
   '          // 2.17.89 (dono 03/11): o filme calcula sozinho depois de adicionar; o cálculo roda depois, sem segurar a janela.\n          await refreshItems({skipHydrate:true});drawOrders();'],
  ["  async function maskForItem(item){\n    if(item.halftone)return null;\n    const source=item.type==='asset'&&item.path?await ctx.assetUrls?.sourceUrl(item)||ctx.publicUrl(item.path):item.type==='team_customization'&&item.previewDataUrl?item.previewDataUrl:null;\n    if(!source)return null;",
   "  // 2.17.89: a máscara de cada arte fica guardada pelo caminho do arquivo e sai da imagem leve; o PNG de impressão só se ela falhar.\n  const filmMaskAssets=new Map();\n  async function maskForItem(item){\n    if(item.halftone)return null;\n    let source=item.type==='team_customization'&&item.previewDataUrl?item.previewDataUrl:null;\n    if(item.type==='asset'&&item.path){source='asset:'+filmImageBucket(item,{assetUrls:ctx.assetUrls})+':'+item.path;filmMaskAssets.set(source,item);}\n    if(!source)return null;"],
  ['  async function prepareFilmMask(source,{signal}){',
   "  async function prepareFilmMask(source,{signal}){\n    if(!source.startsWith('asset:'))return prepareFilmMaskFromUrl(source,{signal});\n    const item=filmMaskAssets.get(source);if(!item)return null;\n    let light='';try{light=await filmLightImageUrl(supabase,{bucket:filmImageBucket(item,{assetUrls:ctx.assetUrls}),path:item.path});}catch{}\n    if(light){try{const mask=await prepareFilmMaskFromUrl(light,{signal});if(mask)return mask;}catch(error){if(signal.aborted)throw error;}}\n    const full=await ctx.assetUrls?.sourceUrl(item)||ctx.publicUrl(item.path);\n    return full?prepareFilmMaskFromUrl(full,{signal}):null;\n  }\n  async function prepareFilmMaskFromUrl(source,{signal}){"],
  // Contador "N un." de Artes adicionadas: era calculado só ao abrir a página (ficava 0 depois de adicionar).
  ["<span>${filmItems.reduce((sum,item)=>sum+Number(item.quantity||0),0)} un.</span>","<span data-film-units>${filmItems.reduce((sum,item)=>sum+Number(item.quantity||0),0)} un.</span>"],
  ["app.querySelector('#filmItems').innerHTML=filmItemsHTML();bindItems();","app.querySelector('#filmItems').innerHTML=filmItemsHTML();bindItems();refreshFilmUnits();"],
  ["    saveFilmDraft();return true;\n  }\n  function drawFilm(media){","    refreshFilmUnits();saveFilmDraft();return true;\n  }\n  function refreshFilmUnits(){const badge=app.querySelector('[data-film-units]');if(badge)badge.textContent=filmItems.reduce((sum,item)=>sum+Number(item.quantity||0),0)+' un.';}\n  function drawFilm(media){"],
  // Custo do filme: a cobertura de tinta é estimada em 512 px; usa a imagem leve em vez do PNG de impressão.
  ["getImageUrl:item=>item.previewDataUrl||(item.path?ctx.publicUrl(item.path):null)",
   "getImageUrl:async item=>item.previewDataUrl||(item.path?(await filmLightImageUrl(supabase,{bucket:filmImageBucket(item,{assetUrls:ctx.assetUrls}),path:item.path}).catch(()=>'')||ctx.publicUrl(item.path)):null)"],
  ["app.querySelector('#addFilmAsset').onclick=()=>safe(async()=>{await ensureFilmCatalog();return pickFilmAsset(profiles,assetMap,refreshItems);});",
   "app.querySelector('#addFilmAsset').onclick=()=>safe(async()=>{await ensureFilmCatalog();return pickFilmAsset(profiles,assetMap,refreshItems);});setTimeout(()=>{if(!pageCurrent())return;ensureFilmCatalog().then(()=>{if(!pageCurrent())return;void preloadFilmPickerMeta().catch(()=>{});return ctx.assetUrls?.hydrate([...assetMap.values()]);}).catch(()=>{});},700);"],
]);

patch('film-preview-source-v74.js',[
  ["import {createFilmReader,waitFilm} from './film-bulk-read.js?v=2.17.88';",
   "import {createFilmReader,waitFilm} from './film-bulk-read.js?v=2.17.88';\nimport {filmImageBucket,filmLightImageUrl} from './film-light-image.js?v=2.17.88';"],
  ["{columns:'id,processed_path,original_path,thumbnail_path,metadata'}","{columns:'id,processed_path,original_path,metadata'}"],
  ['  return original();\n };\n}',
   "  // 2.17.89: imagem leve primeiro; o arquivo exato fica como reserva e para o zoom.\n  let light='';try{light=await filmLightImageUrl(supabase,{bucket:filmImageBucket(item,{assetUrls,row}),path:source});}catch{}\n  reader.check();if(signal?.aborted)throw signal.reason;\n  return light?[light,await original()]:original();\n };\n}"],
]);

// Arte de empresa: os cartões fora da tela não são montados até rolar (antes a janela redesenhava a página inteira com
// todas as artes) e o formato de centímetros é criado uma vez só (era um por número, milhares por abertura).
patch('film-picker.js',[
  ["const formatCm = value => Number(value).toLocaleString('pt-BR', {maximumFractionDigits: 2});\nconst formatInput = value => Number(value).toLocaleString('pt-BR', {useGrouping:false,maximumFractionDigits:4});",
   "const cmFormat = new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 2}), inputFormat = new Intl.NumberFormat('pt-BR', {useGrouping:false,maximumFractionDigits:4});\nconst formatCm = value => cmFormat.format(Number(value));\nconst formatInput = value => inputFormat.format(Number(value));"],
]);
fs.appendFileSync(path.join(dist,'film-picker.css'),'\n/* 2.17.89: cartões fora da tela só são montados ao rolar (janela abre rápido com centenas de artes). */\n.fp-art-card{content-visibility:auto;contain-intrinsic-size:auto 330px}\n@media(max-width:700px){.fp-art-card{contain-intrinsic-size:auto 170px}}\n');

patch('private-asset-urls.js',[
  [`    for(let offset=0;offset<missing.length;offset+=64){
      const chunk=missing.slice(offset,offset+64),{data,error}=await supabase.storage.from('z19p-private').createSignedUrls(chunk,900);
      if(error)throw error;if(current!==generation)throw new Error('A conta mudou durante o carregamento da arte.');
      for(const path of chunk){const row=(data||[]).find(entry=>entry.path===path);if(!row?.signedUrl)throw new Error('Não foi possível carregar a arte privada.');signed.set(path,{url:row.signedUrl,expiresAt:now()+900000})}
    }`,
   `    // 2.17.89: quatro pedidos ao mesmo tempo (antes um depois do outro). Um arquivo que falta fica sem link aqui e
    // dá o erro só quando for usado (resolvePath), sem impedir as outras artes de abrir.
    const chunks=[];for(let offset=0;offset<missing.length;offset+=64)chunks.push(missing.slice(offset,offset+64));
    let next=0;
    await Promise.all(Array.from({length:Math.min(4,chunks.length)},async()=>{
      for(let chunk=chunks[next++];chunk;chunk=chunks[next++]){
        const {data,error}=await supabase.storage.from('z19p-private').createSignedUrls(chunk,900);
        if(error)throw error;if(current!==generation)throw new Error('A conta mudou durante o carregamento da arte.');
        const rows=new Map((data||[]).map(entry=>[entry.path,entry]));
        for(const path of chunk){const row=rows.get(path);if(row?.signedUrl)signed.set(path,{url:row.signedUrl,expiresAt:now()+900000})}
      }
    }));`],
]);

for(const name of fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n)))write(name,read(name).replace(/\b2\.17\.88\b/g,'2.17.89'));
if(!read('index.html').includes('content="2.17.89"'))throw new Error('v89: versão não foi renovada.');
for(const name of ['production-v217.js','film-preview.js','film-preview-source-v74.js','private-asset-urls.js','film-light-image.js','film-picker.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
console.log('019 2.17.89: Delete sem travar, cálculo automático da fila, imagem leve no filme e Arte de empresa rápida.');
