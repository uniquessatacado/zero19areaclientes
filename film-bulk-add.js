import {createFilmReader,filmMapLimit,filmAbort,waitFilm} from './film-bulk-read.js';
const WORK=new Set(['vdr','font','venduss']);
const FIELDS='id,owner_id,tenant_id,workspace_id,project_id,personalization_sale_id,asset_id,quantity,metadata,stage,text_value,source_file_path';
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const json=value=>JSON.stringify(stable(value));
const genericKey=row=>row.kind==='company_order'?'company:'+row.company_order_item_id:row.quote_item_id;
export function pendingRecipe(entry,row=entry.row){
  if(WORK.has(entry.kind))return json({id:row.id,project:row.project_id,sale:row.personalization_sale_id,quantity:Number(row.quantity),asset:entry.kind==='font'?null:row.asset_id||null,production:row.metadata?.details?.[0]?.production||{},font:row.metadata?.font_set_id||null,revision:row.metadata?.lettering_revision??null});
  if(entry.kind==='placed'){const p=row.placement||row;return json({id:p.id,project:p.project_id,asset:p.asset_id,width:p.width_cm,height:p.height_cm,ref:p.external_order_item_ref,metadata:p.metadata});}
  return json({id:genericKey(row),project:row.project_id,asset:row.asset_id,path:row.processed_path||row.original_path,width:row.width_cm,height:row.height_cm});
}
const asMap=(rows,key='id')=>new Map(rows.map(row=>[row[key],row]));
const yieldUI=()=>new Promise(resolve=>setTimeout(resolve,0));

// Reads only selected work/asset IDs, not the whole production dashboard per art.
// Original PNG, quantity, physical size and per-order identity are preserved.
export async function preparePendingBatch({supabase,ownerId,actorId,entries,isCurrent=()=>true,signal,onProgress=()=>{},makeAsset,makeFont,makePlaced,makeGeneric,makeVenduss,readGeneric}={}){
  const reader=createFilmReader({supabase,ownerId,actorId,isCurrent,signal}),errors=[],unavailable=[],candidates=[];
  const unique=[...new Map(entries.filter(e=>!e.completed&&!e.alreadyInFilm).map(e=>[e.key,e])).values()];
  if(!unique.length)return {ready:[],errors,unavailable};
  const progress=(phase,done,total,percent)=>{reader.check();onProgress({phase,done,total,percent});};
  progress('Renovando e conferindo sessão',0,unique.length,1);await reader.ensure();
  const workEntries=unique.filter(e=>WORK.has(e.kind)),placedEntries=unique.filter(e=>e.kind==='placed'),genericEntries=unique.filter(e=>e.kind==='generic');
  progress('Conferindo aplicações selecionadas',0,workEntries.length,4);
  const [workRows,placementRows,genericRows]=await Promise.all([
    reader.rows('z19p_zero19_work_items',workEntries.map(e=>e.row.id),{columns:FIELDS,onChunk:(n,t)=>progress('Conferindo aplicações selecionadas',n,t,4+16*n/t)}),
    reader.rows('z19p_asset_placements',placedEntries.map(e=>e.row.placement.id)),
    genericEntries.length?reader.read(async()=>({data:await readGeneric()})).then(r=>{if(!Array.isArray(r.data))throw new Error('Não foi possível conferir o saldo dos pedidos.');return r.data;}):[]
  ]);
  const works=asMap(workRows),placements=asMap(placementRows),generics=new Map(genericRows.map(row=>[genericKey(row),row]));
  for(const entry of unique){
    const row=WORK.has(entry.kind)?works.get(entry.row.id):entry.kind==='placed'?placements.get(entry.row.placement.id):generics.get(genericKey(entry.row));
    if(!row||(WORK.has(entry.kind)&&row.stage!=='ready_production')||(entry.kind==='placed'&&row.production_state!=='pending')){unavailable.push(entry);continue;}
    if(pendingRecipe(entry,row)!==pendingRecipe(entry)){errors.push({entry,message:'O pedido foi alterado. Reabra a lista para conferir a arte e as medidas atuais.'});continue;}
    candidates.push({entry,row});
  }
  reader.check();
  const artRows=candidates.filter(({entry,row})=>['vdr','venduss'].includes(entry.kind)&&row.asset_id);
  const vendorIds=candidates.filter(({entry,row})=>entry.kind==='venduss'&&row.asset_id).map(x=>x.row.asset_id);
  const fontEntries=candidates.filter(x=>x.entry.kind==='font');
  progress('Buscando os arquivos uma vez por arte',0,artRows.length,23);
  const [assetRows,profileRows,fontRows]=await Promise.all([
    reader.rows('z19p_assets',artRows.map(x=>x.row.asset_id),{onChunk:(n,t)=>progress('Buscando os arquivos uma vez por arte',n,t,23+12*n/t)}),
    reader.rows('z19p_asset_print_profiles',vendorIds,{key:'asset_id'}),
    reader.rows('z19p_customization_sets',fontEntries.map(x=>x.entry.row.set?.id),{columns:'id,status,tested_at,updated_at'})
  ]);
  const assets=asMap(assetRows),profiles=asMap(profileRows,'asset_id'),fonts=asMap(fontRows);
  let done=0;
  const prepared=await filmMapLimit(candidates,3,async candidate=>{
    const {entry,row}=candidate;reader.check();
    try{
      let items;
      if(entry.kind==='vdr'){
        const p=row.metadata?.details?.[0]?.production||{},asset=assets.get(row.asset_id),width=Number(p.width_cm),height=Number(p.height_cm);
        if(!asset||!(width>0&&height>0)||!Number.isFinite(width+height))throw new Error('Confira o arquivo e as medidas desta aplicação.');
        const storageBucket=p.storage_bucket||asset.metadata?.storage_bucket||'z19p-assets';
        if(!['z19p-private','z19p-assets'].includes(storageBucket))throw new Error('Armazenamento da arte não disponível para este pedido.');
        const filmAsset={...asset,processed_path:p.file_path||asset.processed_path,metadata:{...asset.metadata,storage_bucket:storageBucket}};
        const workspace=entry.row.summary?.workspace||{},project=entry.row.summary?.project||{},companyName=workspace.client_name||workspace.company_name||'Cliente ZERO19';
        const profile={asset_id:asset.id,default_width_cm:width,default_height_cm:height,aspect_ratio:width/height,halftone:Boolean(p.needs_halftone),rotation_policy:'180',allow_internal_nesting:!p.needs_halftone,ready_for_print:true};
        items=[{...makeAsset(filmAsset,profile,{quantity:row.quantity,companyName}),storageBucket,officialProjectId:row.project_id,officialOrderRef:project.official_order_payload?.display_id||project.official_order_ref||String(row.project_id).slice(0,8),externalOrderItemRef:row.personalization_sale_id,productionGroupKeys:['order:'+row.project_id],zero19WorkItemId:row.id}];
      }else if(entry.kind==='venduss'){
        if(row.asset_id){
          const asset=assets.get(row.asset_id),profile=profiles.get(row.asset_id),p=row.metadata?.details?.[0]?.production||{},project=entry.row.summary?.project||{};
          if(!asset||!profile?.ready_for_print)throw new Error('A arte Venduss precisa de arquivo e medidas liberadas.');
          const orderRef=project.official_order_payload?.display_id||project.official_order_ref||String(row.project_id).slice(0,8);
          items=[{...makeAsset(asset,profile,{quantity:row.quantity,companyName:'Venduss #'+(p.venduss_display_id||orderRef)}),officialProjectId:row.project_id,officialOrderRef:orderRef,externalOrderItemRef:row.personalization_sale_id,productionGroupKeys:['order:'+row.project_id],zero19WorkItemId:row.id}];
        }else{
          // Existing idempotent import, only when the partner PNG was never imported.
          // No blind retry of its writes; the next click reads the resulting asset link.
          const item=await waitFilm(makeVenduss({...entry.row,...row}),{signal,timeoutMs:45000});items=[item];candidate.row={...row,asset_id:item.sourceId};
        }
      }else if(entry.kind==='font'){
        const set=entry.row.set,latest=fonts.get(set?.id);
        if(!latest||latest.status!=='ready'||!latest.tested_at||(set.updated_at&&latest.updated_at!==set.updated_at))throw new Error('A fonte foi alterada ou não está liberada. Reabra a lista.');
        items=(await reader.read(async()=>({data:await waitFilm(makeFont({...entry.row,...row}),{signal,timeoutMs:30000})}))).data;
      }else if(entry.kind==='placed')items=await makePlaced({...entry.row,placement:row},entry.quantity);
      else if(entry.kind==='generic')items=[await makeGeneric(row,entry.quantity)];
      else throw new Error('Tipo de aplicação não reconhecido.');
      reader.check();if(!items?.length)throw new Error('Nenhuma arte válida foi preparada para esta aplicação.');
      return {...candidate,items};
    }catch(error){reader.check();errors.push({entry,message:error.message||String(error)});return null;}
    finally{done++;progress('Preparando itens para o filme',done,candidates.length,36+44*done/Math.max(1,candidates.length));await yieldUI();}
  });
  // Recheck after preparation: another device may have completed or edited a shirt.
  const results=prepared.filter(Boolean);progress('Conferência final dos pedidos',0,results.length,83);
  const [finalWork,finalPlacements,finalGeneric]=await Promise.all([
    reader.rows('z19p_zero19_work_items',results.filter(x=>WORK.has(x.entry.kind)).map(x=>x.row.id),{columns:FIELDS}),
    reader.rows('z19p_asset_placements',results.filter(x=>x.entry.kind==='placed').map(x=>x.row.id)),
    results.some(x=>x.entry.kind==='generic')?reader.read(async()=>({data:await readGeneric()})).then(r=>r.data):[]
  ]);
  const fw=asMap(finalWork),fp=asMap(finalPlacements),fg=new Map((finalGeneric||[]).map(r=>[genericKey(r),r])),ready=[];
  for(const result of results){
    const {entry,row}=result,current=WORK.has(entry.kind)?fw.get(row.id):entry.kind==='placed'?fp.get(row.id):fg.get(genericKey(row));
    if(!current||(WORK.has(entry.kind)&&current.stage!=='ready_production')||(entry.kind==='placed'&&current.production_state!=='pending')){unavailable.push(entry);continue;}
    if(pendingRecipe(entry,current)!==pendingRecipe(entry,row)){errors.push({entry,message:'Pedido alterado durante a inclusão. Reabra a lista para conferir.'});continue;}
    if(entry.kind==='generic'&&Number(current.remaining_quantity)<Number(entry.quantity)){errors.push({entry,message:'O saldo deste pedido mudou. Confira a quantidade restante.'});continue;}
    ready.push(result);
  }
  reader.check();progress('Itens conferidos',ready.length,unique.length,100);return {ready,errors,unavailable};
}

// Atomic local append after validation. Failed/cancelled reads never append later.
export function installPendingBatchAdd(options){
  const {modal,button,entries,selected,isCurrent,getBusy,setBusy,updateCount,commit,afterCommit,getFilmItems}=options;
  button.dataset.filmBulkGuard='true';
  const doc=modal.ownerDocument||document;
  const progress=doc.createElement('section');progress.dataset.bulkFilmProgress='';progress.hidden=true;
  progress.style.cssText='padding:12px;border:1px solid #a7c8bb;border-radius:12px;background:#f0fdf4;color:#14532d;display:none';
  const label=doc.createElement('div');label.setAttribute('role','status');label.setAttribute('aria-live','polite');
  const bar=doc.createElement('progress');bar.max=100;bar.value=0;bar.style.cssText='width:100%;height:16px;margin:8px 0';bar.setAttribute('aria-label','Progresso da inclusão no filme');
  const stop=doc.createElement('button');stop.type='button';stop.className='btn small';stop.textContent='Interromper';
  progress.append(label,bar,stop);modal.querySelector('.modal-footer').before(progress);
  let controller=null,running=false;
  stop.onclick=()=>controller?.abort(filmAbort());
  const showError=text=>{const alert=modal.querySelector('.film-pending-error');if(alert){alert.hidden=false;alert.textContent=text;}};
  const markUnavailable=entry=>{entry.completed=true;selected.delete(entry.key);const index=entries.indexOf(entry),row=modal.querySelector('[data-entry="'+index+'"]')?.closest('.film-pending-row');(row?.closest('.film-pending-application')||row)?.remove();};
  const exists=entry=>{const film=getFilmItems();if(WORK.has(entry.kind))return film.some(i=>i.zero19WorkItemId===entry.row.id);if(entry.kind==='placed')return film.some(i=>i.officialPlacementId===entry.row.placement.id||(i.productionPlacementIds||[]).includes(entry.row.placement.id));return entry.alreadyInFilm;};
  const markAdded=entry=>{
    entry.alreadyInFilm=true;selected.delete(entry.key);const index=entries.indexOf(entry),input=modal.querySelector('[data-entry="'+index+'"]');
    if(input){input.checked=false;input.disabled=true;const row=input.closest('.film-pending-row');row?.classList.add('is-in-film');if(row)row.title='Já adicionado ao filme';}
  };
  button.onclick=async()=>{
    if(running||getBusy()||!isCurrent()||!modal.isConnected)return;
    const chosen=entries.filter(e=>selected.has(e.key)&&!e.completed&&!e.alreadyInFilm);if(!chosen.length)return;
    running=true;setBusy(true);updateCount();controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(filmAbort('A conexão demorou. Inclusão interrompida sem duplicar a montagem; tente novamente.')),120000);
    progress.hidden=false;progress.style.display='block';stop.disabled=false;button.textContent='Conferindo sessão…';
    modal.setAttribute('aria-busy','true');modal.querySelectorAll('input').forEach(input=>input.disabled=true);
    const alert=modal.querySelector('.film-pending-error');if(alert){alert.hidden=true;alert.textContent='';}
    const current=()=>isCurrent()&&modal.isConnected;
    try{
      const result=await preparePendingBatch({...options,entries:chosen,signal:controller.signal,isCurrent:current,onProgress:p=>{if(!current())return;bar.value=p.percent;label.textContent=p.phase+' · '+p.done+'/'+p.total;button.textContent=Math.round(p.percent)+'% · '+p.done+'/'+p.total;}});
      if(!current()||controller.signal.aborted)return;
      result.unavailable.forEach(markUnavailable);
      const inBatch=new Set();
      const ready=result.ready.filter(({entry})=>{const key=WORK.has(entry.kind)?'work:'+entry.row.id:entry.kind==='placed'?'placed:'+entry.row.placement.id:entry.key;if(exists(entry)||inBatch.has(key)){markAdded(entry);return false;}inBatch.add(key);return true;});
      if(ready.length){
        // commit is deliberately synchronous: no remote request between checking and append.
        commit(ready.flatMap(r=>r.items));ready.forEach(({entry})=>markAdded(entry));
        label.textContent=ready.length+' aplicação(ões) adicionadas. Atualizando a montagem…';
        try{await afterCommit();}catch{showError('As artes já entraram no filme. Use Atualizar filme para recarregar as prévias.');}
      }
      if(!current())return;
      if(result.errors.length){showError(ready.length+' aplicação(ões) adicionadas; '+result.errors.length+' precisam de atenção. '+result.errors.slice(0,3).map(x=>(x.entry.title||'Pedido')+': '+x.message).join(' | '));}
      else if(ready.length||result.unavailable.length){modal.remove();}
      else{label.textContent='Os itens selecionados já estão no filme.';}
    }catch(error){if(current())showError(error.message||'Não foi possível incluir as artes. Sua seleção foi mantida.');}
    finally{
      clearTimeout(timer);running=false;setBusy(false);stop.disabled=true;
      if(modal.isConnected){modal.setAttribute('aria-busy','false');button.textContent='Adicionar selecionados ao filme';modal.querySelectorAll('input').forEach(input=>{const entry=input.hasAttribute('data-entry')?entries[Number(input.dataset.entry)]:null;input.disabled=Boolean(entry&&(entry.alreadyInFilm||entry.completed));});updateCount();}
    }
  };
  return {cancel:()=>controller?.abort(filmAbort())};
}
