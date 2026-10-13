// A checked build-time patch on the deployed v2.17.71, never a runtime loader.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
function replaceOnce(source,before,after,label){
 const count=source.split(before).length-1;if(count!==1)throw new Error('Build do lote: âncora '+label+' mudou ('+count+'). Revisar antes de publicar.');
 return source.replace(before,after);
}
const productionPath=path.join(dist,'production-v217.js');let production=fs.readFileSync(productionPath,'utf8');
if(!fs.readFileSync(path.join(dist,'index.html'),'utf8').includes('content="2.17.71"'))throw new Error('O build do lote exige a base publicada 2.17.71.');
production="import {installPendingBatchAdd} from './film-bulk-add.js?v=2.17.72';\nimport {createFilmReader} from './film-bulk-read.js?v=2.17.72';\n"+production;
const handlerStart="      button.onclick=async()=>{\n        if(busy||!pageCurrent())return;busy=true;updateCount();button.textContent='Preparando artes…';";
const handlerEnd='      document.body.appendChild(modal);updateCount();';
assert.equal(production.split(handlerStart).length,2,'handler de inclusão único');
const start=production.indexOf(handlerStart),end=production.indexOf(handlerEnd,start);
assert.ok(end>start);const previous=production.slice(start,end);
assert.ok(previous.includes('prepareVdrFilmItem(entry.row.id)')&&previous.includes('filmItems.push(...items)'));
const replacement=`      const bulkOwner=owner(),bulkActor=uid();
      installPendingBatchAdd({supabase,ownerId:bulkOwner,actorId:bulkActor,entries,modal,button,selected,
        isCurrent:()=>pageCurrent()&&owner()===bulkOwner&&uid()===bulkActor,
        getBusy:()=>busy,setBusy:value=>{busy=value},updateCount,
        getFilmItems:()=>filmItems,makeAsset:filmItemFromLibraryAsset,
        makeFont:row=>zero19FontFilmItems(row),
        makePlaced:(row,quantity)=>ctx.officialOrders?.pendingFilmItems?.([row],new Map([[row.placement.id,quantity]]))||[],
        makeGeneric:(row,quantity)=>{if(quantity>pendingQuantity(row,filmItems))throw new Error('O saldo deste pedido mudou. Confira a quantidade.');return filmItemFromOrder(row,quantity);},
        makeVenduss:row=>ctx.zero19Orders.prepareVendussFilmItem(row.id,row),
        readGeneric:()=>production.pending(),
        commit:items=>{filmItems.push(...items);saveFilmDraft();},
        afterCommit:async()=>{
          // Adding the batch never waits for original images, masks or nesting.
          await refreshItems({autoCalculate:false,skipHydrate:true});drawOrders();
          const snapshot=filmItems.slice(),current=()=>pageCurrent()&&owner()===bulkOwner&&uid()===bulkActor;
          const reader=createFilmReader({supabase,ownerId:bulkOwner,actorId:bulkActor,isCurrent:current});
          void reader.read(async()=>({data:await ctx.assetUrls?.hydrate(snapshot)})).then(()=>{
            if(!current())return;const byId=new Map(filmItems.map(item=>[item.localId,item]));
            app.querySelectorAll('.remove-film-item').forEach(button=>{const item=byId.get(button.dataset.id),thumb=button.closest('article')?.querySelector('.film-item-thumb');if(item&&thumb)thumb.innerHTML=filmItemPreview(item);});
          }).catch(()=>{if(current())ctx.toast('Artes incluídas. Use Atualizar filme para tentar carregar as prévias que faltarem.','err');});
        }
      });
`;
production=production.slice(0,start)+replacement+production.slice(end);
production=replaceOnce(production,'const refreshItems=async()=>{if(!pageCurrent())return;', 'const refreshItems=async({autoCalculate=true,skipHydrate=false}={})=>{if(!pageCurrent())return;','refreshItems');
const refreshStart=production.indexOf('    const refreshItems=async('),refreshEnd=production.indexOf('    const consumeZero19AssetRequest=',refreshStart);
let refresh=production.slice(refreshStart,refreshEnd);
refresh=replaceOnce(refresh,'await ctx.assetUrls?.hydrate(filmItems);if(!pageCurrent())return;', 'if(skipHydrate){for(const item of filmItems)ctx.assetUrls?.register?.(item);}else await ctx.assetUrls?.hydrate(filmItems);if(!pageCurrent())return;','hidratação');
refresh=replaceOnce(refresh,"filmDraftNote='Itens adicionados/atualizados. Preparando imagens e calculando o encaixe…';", "filmDraftNote=autoCalculate?'Itens adicionados/atualizados. Preparando imagens e calculando o encaixe…':filmItems.length+' itens no filme. Toque em Atualizar filme para calcular o encaixe.';",'mensagem');
refresh=replaceOnce(refresh,'setTimeout(()=>{if(pageCurrent()&&scheduled===filmCalculationGeneration&&filmItems.length)void calculateFilm(media)},0);','if(autoCalculate)setTimeout(()=>{if(pageCurrent()&&scheduled===filmCalculationGeneration&&filmItems.length)void calculateFilm(media)},0);','encaixe adiado');
production=production.slice(0,refreshStart)+refresh+production.slice(refreshEnd);
const fontStart=production.indexOf('  async function zero19FontFilmItems(row){'),fontEnd=production.indexOf('  async function openZero19FontProductionPicker(',fontStart);
assert.ok(fontStart>0&&fontEnd>fontStart);let font=production.slice(fontStart,fontEnd);
assert.equal(font.split('groupId}));').length,3,'duas prévias de letra/número');
font=font.replaceAll('groupId}));','groupId,previewTargetPx:420}));');
production=production.slice(0,fontStart)+font+production.slice(fontEnd);
production=replaceOnce(production,"const entry=entries[index];if(entry.kind!=='font'||entry.completed)continue;if(!modal.isConnected||!pageCurrent())break;", "const entry=entries[index];if(entry.kind!=='font'||entry.completed)continue;while(busy&&modal.isConnected&&pageCurrent())await new Promise(resolve=>setTimeout(resolve,80));if(!modal.isConnected||!pageCurrent())break;",'pausar prévias enquanto inclui');
fs.writeFileSync(productionPath,production);
const syncPath=path.join(dist,'zero19-pdv-sync.js');let sync=fs.readFileSync(syncPath,'utf8');
sync=replaceOnce(sync,"async function prepareVendussFilmItem(workItemId){\n    const owner=accountOwnerId(),item=(await pendingVendussFilmRows()).find(row=>row.id===workItemId);", "async function prepareVendussFilmItem(workItemId,batchItem=null){\n    const owner=accountOwnerId(),item=batchItem||(await pendingVendussFilmRows()).find(row=>row.id===workItemId);",'Venduss sem recarregar dashboard');
fs.writeFileSync(syncPath,sync);
const watcherPath=path.join(dist,'film-pending-status.js');let watcher=fs.readFileSync(watcherPath,'utf8');
watcher="import {createFilmReader} from './film-bulk-read.js?v=2.17.72';\n"+watcher;
watcher=replaceOnce(watcher,'if(forwarding)return;',"if(forwarding||button.dataset?.filmBulkGuard==='true')return;",'um único controlador do clique');
watcher=replaceOnce(watcher,"const {data,error}=await supabase.from(group.table).select('id,'+group.field).eq('owner_id',ownerId).in('id',ids.slice(offset,offset+100));", "const {data,error}=await createFilmReader({supabase,ownerId,strictAuth:false}).read(signal=>{const query=supabase.from(group.table).select('id,'+group.field).eq('owner_id',ownerId).in('id',ids.slice(offset,offset+100));return typeof query.abortSignal==='function'?query.abortSignal(signal):query;});",'renovação no observador');
fs.writeFileSync(watcherPath,watcher);
for(const name of fs.readdirSync(dist).filter(name=>/\.(js|html|css)$/.test(name))){const file=path.join(dist,name);fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace(/\b2\.17\.71\b/g,'2.17.72'));}
for(const name of ['production-v217.js','zero19-pdv-sync.js','film-pending-status.js','film-bulk-read.js','film-bulk-add.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
// Exercise the actual library-to-film constructor shipped in dist, not a substitute.
const {filmItemFromLibraryAsset}=await import(pathToFileURL(path.join(dist,'film-picker.js')));
const item=filmItemFromLibraryAsset({id:'asset',workspace_id:'workspace',asset_type:'arte',name:'PNG vendido',processed_path:'sold.png',metadata:{storage_bucket:'z19p-private'}},{asset_id:'asset',default_width_cm:22.1,default_height_cm:28,ready_for_print:true,halftone:false,rotation_policy:'180',allow_internal_nesting:true},{quantity:3,companyName:'Pedido'});
assert.equal(item.widthCm,22.1);assert.equal(item.heightCm,28);assert.equal(item.path,'sold.png');assert.equal(item.storageBucket,'z19p-private');assert.equal(item.quantity,3);
execFileSync(process.execPath,['--test',path.join(root,'scripts/test-film-bulk-add.mjs')],{stdio:'inherit'});
console.log('019 2.17.72: lote por IDs; sessão renovável; progresso e cancelamento; inclusão separada do encaixe. Integração compilada e construtor original verificados.');
