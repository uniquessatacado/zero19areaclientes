// Private originals/prepared PNGs never fall back to the public artwork bucket.
// Signed URLs live only in memory and are refreshed before decoding/exporting.
export function createAssetUrlResolver({supabase,publicUrl,now=()=>Date.now()}={}){
  const buckets=new Map(),signed=new Map(),pending=new Map();let generation=0;
  function register(asset){
    const bucket=asset?.storageBucket||asset?.storage_bucket||asset?.metadata?.storage_bucket;
    if(bucket!=='z19p-private')return;
    for(const path of [asset.path,asset.original_path,asset.processed_path,asset.thumbnail_path])if(path)buckets.set(path,bucket);
  }
  function pathUrl(path){if(!path)return '';if(!buckets.has(path))return publicUrl(path);const entry=signed.get(path);return entry&&entry.expiresAt>now()+60000?entry.url:'';}
  async function resolvePath(path){
    if(!path)return '';if(!buckets.has(path))return publicUrl(path);
    const cached=pathUrl(path);if(cached)return cached;
    if(pending.has(path))return pending.get(path);
    const current=generation,promise=(async()=>{
      const {data,error}=await supabase.storage.from('z19p-private').createSignedUrl(path,900);
      if(error)throw error;if(!data?.signedUrl)throw new Error('Não foi possível carregar a arte privada.');
      if(current!==generation)throw new Error('A conta mudou durante o carregamento da arte.');
      signed.set(path,{url:data.signedUrl,expiresAt:now()+900000});return data.signedUrl;
    })();pending.set(path,promise);
    try{return await promise}finally{if(pending.get(path)===promise)pending.delete(path)}
  }
  async function hydrate(assets){
    const paths=new Set();for(const asset of assets||[]){register(asset);for(const path of [asset.path,asset.processed_path,asset.original_path,asset.thumbnail_path])if(path&&buckets.has(path))paths.add(path)}
    const missing=[...paths].filter(path=>!pathUrl(path)),current=generation;
    for(let offset=0;offset<missing.length;offset+=64){
      const chunk=missing.slice(offset,offset+64),{data,error}=await supabase.storage.from('z19p-private').createSignedUrls(chunk,900);
      if(error)throw error;if(current!==generation)throw new Error('A conta mudou durante o carregamento da arte.');
      for(const path of chunk){const row=(data||[]).find(entry=>entry.path===path);if(!row?.signedUrl)throw new Error('Não foi possível carregar a arte privada.');signed.set(path,{url:row.signedUrl,expiresAt:now()+900000})}
    }
    return assets;
  }
  async function sourceUrl(asset){register(asset);return resolvePath(asset?.path||asset?.processed_path||asset?.original_path);}
  function clear(){generation++;buckets.clear();signed.clear();pending.clear();}
  return {register,pathUrl,resolvePath,hydrate,sourceUrl,clear,isPrivatePath:path=>buckets.has(path)};
}
