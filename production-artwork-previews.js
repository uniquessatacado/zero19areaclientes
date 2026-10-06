// Use the sold application's prepared PNG, never a catalog substitute or the
// current library version. URLs are signed with the current user's session and
// live only in the in-memory production list; no bucket visibility is changed.
const PREVIEW_BUCKETS=new Set(['z19p-private','z19p-assets','venduss-print-artworks']);

export function productionArtworkPreviewSource(item){
  const production=item?.metadata?.details?.[0]?.production||{};
  const storageBucket=production.storage_bucket;
  const path=production.file_path||item?.source_file_path;
  return path&&PREVIEW_BUCKETS.has(storageBucket)?{storageBucket,path}:null;
}

export async function hydrateProductionArtworkPreviews({supabase,items=[],isCurrent=()=>true}={}){
  const sources=new Map(),urls=new Map(),failures=new Map();
  for(const item of items){const source=productionArtworkPreviewSource(item);if(!source)continue;
    if(!sources.has(source.storageBucket))sources.set(source.storageBucket,new Set());
    sources.get(source.storageBucket).add(source.path);
  }
  for(const [storageBucket,paths] of sources){
    const allPaths=[...paths];
    for(let offset=0;offset<allPaths.length;offset+=64){
      if(!isCurrent())throw new Error('A conta mudou durante o carregamento da prévia.');
      const chunk=allPaths.slice(offset,offset+64);
      try{
        const {data,error}=await supabase.storage.from(storageBucket).createSignedUrls(chunk,600);
        if(!isCurrent())throw new Error('A conta mudou durante o carregamento da prévia.');
        if(error)throw error;
        const rows=new Map((data||[]).map(row=>[row.path,row]));
        for(const path of chunk){const key=storageBucket+'\n'+path,row=rows.get(path);
          if(row?.signedUrl&&!row.error)urls.set(key,row.signedUrl);
          else failures.set(key,row?.error?.message||row?.error||'Não foi possível carregar o PNG preparado deste pedido.');
        }
      }catch(error){
        if(!isCurrent())throw new Error('A conta mudou durante o carregamento da prévia.');
        for(const path of chunk)failures.set(storageBucket+'\n'+path,error?.message||String(error));
      }
    }
  }
  if(!isCurrent())throw new Error('A conta mudou durante o carregamento da prévia.');
  return items.map(item=>{const source=productionArtworkPreviewSource(item);if(!source)return item;
    const key=source.storageBucket+'\n'+source.path;
    return {...item,_artworkPreview:urls.get(key)||null,_artworkPreviewError:failures.get(key)||null};
  });
}
