import {createFilmReader,waitFilm} from './film-bulk-read.js?v=2.17.75';
// Resolve only the source requested by the visible-preview queue.
// No full library fetch and no change to print paths or physical dimensions.
export function createFilmPreviewSource({supabase,ownerId,actorId,items,assetUrls,publicUrl,isCurrent,preparePreview}){
 const reader=createFilmReader({supabase,ownerId,actorId,isCurrent}),metadata=new Map();
 const load=id=>{if(!metadata.has(id)){const task=reader.rows('z19p_assets',[id],{columns:'id,processed_path,original_path,thumbnail_path,metadata'}).then(rows=>rows[0]||null).catch(error=>{metadata.delete(id);return null;});metadata.set(id,task);}return metadata.get(id);};
 return async(item,{force=false,signal}={})=>{
  reader.check();if(signal?.aborted)throw signal.reason;
  if(item.type!=='asset'){
   if(item.previewDataUrl)return item.previewDataUrl;
   if(typeof preparePreview!=='function')throw new Error('A prévia desta escrita ainda não está disponível.');
   await reader.ensure();
   const url=await waitFilm(preparePreview(item),{signal,timeoutMs:45000});reader.check();
   if(!url)throw new Error('Não foi possível preparar a prévia desta escrita. Tente novamente.');
   return url;
  }
  const source=item.path;if(!source)throw new Error('Esta arte não possui arquivo para visualizar.');
  if(force){metadata.delete(item.sourceId);assetUrls?.invalidatePath?.(source);}
  const row=await load(item.sourceId);reader.check();if(signal?.aborted)throw signal.reason;
  const resolve=asset=>reader.read(async()=>({data:assetUrls?await assetUrls.sourceUrl(asset):publicUrl(asset.path)})).then(r=>r.data);
  const original=()=>resolve(item),thumbnail=row?.thumbnail_path,sameSource=row&&source===(row.processed_path||row.original_path);
  if(sameSource&&thumbnail&&thumbnail!==source){
   const thumb={...item,path:thumbnail,storageBucket:row.metadata?.storage_bucket||item.storageBucket};
   if(force)assetUrls?.invalidatePath?.(thumbnail);
   try{return [await resolve(thumb),await original()];}catch{reader.check();return original();}
  }
  return original();
 };
}
