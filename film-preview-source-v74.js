import {createFilmReader} from './film-bulk-read.js';
// A thumbnail is eligible only for the exact saved source. Never substitute the
// current library artwork for a different PNG sold and frozen in an order.
export function createFilmPreviewSource({supabase,ownerId,actorId,items,assetUrls,publicUrl,isCurrent}){
 const reader=createFilmReader({supabase,ownerId,actorId,isCurrent});let metadata;
 const load=()=>metadata||(metadata=reader.rows('z19p_assets',[...new Set(items.filter(i=>i.type==='asset').map(i=>i.sourceId))],{columns:'id,processed_path,original_path,thumbnail_path,metadata'}).then(rows=>new Map(rows.map(r=>[r.id,r]))).catch(()=>new Map()));
 return async(item,{force=false}={})=>{
  reader.check();if(item.type!=='asset')return item.previewDataUrl||'';
  const map=await load();reader.check();const row=map.get(item.sourceId),source=item.path;
  if(!source)throw new Error('Esta arte não possui arquivo para visualizar.');
  if(force)assetUrls?.invalidatePath?.(source);
  const resolve=asset=>reader.read(async()=>({data:assetUrls?await assetUrls.sourceUrl(asset):publicUrl(asset.path)})).then(r=>r.data);
  const original=()=>resolve(item),thumbnail=row?.thumbnail_path;
  const sameSource=row&&(source===(row.processed_path||row.original_path));
  if(sameSource&&thumbnail&&thumbnail!==source){
   const thumb={...item,path:thumbnail,storageBucket:row.metadata?.storage_bucket||item.storageBucket};
   if(force)assetUrls?.invalidatePath?.(thumbnail);
   try{return [await resolve(thumb),await original()];}catch{reader.check();return original();}
  }
  return original();
 };
}
