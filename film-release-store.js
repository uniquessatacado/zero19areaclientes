// 13/10 (dono): filme já gerado que ainda não saiu da fila Aguardando produção.
// Fica guardado neste aparelho (IndexedDB: filme grande não cabe no localStorage)
// até sair da fila, mesmo se a tela for atualizada ou fechada. Só guarda o que é
// preciso para tirar da fila; não guarda arquivo, prévia nem imagem.
const DB='z19p-film-release',STORE='pending',VERSION=1;
const runtimeKeys=new Set(['previewDataUrl','previewUrl','signedUrl','signed_url','image','canvas','mask','_mask','blob','buffer']);
export const compactFilmRelease=value=>value==null?value:JSON.parse(JSON.stringify(value,(key,entry)=>runtimeKeys.has(key)||typeof entry==='function'?undefined:entry));
const keyOf=(ownerId,id)=>String(ownerId||'')+':'+String(id||'');

export function createFilmReleaseStore({indexedDB:idb=globalThis.indexedDB}={}){
  const open=()=>new Promise((resolve,reject)=>{
    if(!idb)return reject(new Error('Este navegador não consegue guardar o filme pendente.'));
    const request=idb.open(DB,VERSION);
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'key'});};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('Não foi possível abrir o armazenamento do filme pendente.'));
  });
  async function run(mode,work){
    const db=await open();
    try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode),request=work(tx.objectStore(STORE));let result;if(request)request.onsuccess=()=>{result=request.result};tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Não foi possível guardar o filme pendente.'));});}
    finally{db.close();}
  }
  return {
    put(entry){const record={...compactFilmRelease({...entry,items:undefined,layout:undefined}),items:compactFilmRelease(entry.items),layout:compactFilmRelease(entry.layout),ownerId:String(entry.ownerId||''),key:keyOf(entry.ownerId,entry.id),updatedAt:new Date().toISOString()};return run('readwrite',store=>store.put(record));},
    remove(ownerId,id){return run('readwrite',store=>store.delete(keyOf(ownerId,id)));},
    async list(ownerId){const all=await run('readonly',store=>store.getAll());return (all||[]).filter(entry=>entry.ownerId===String(ownerId||'')).sort((a,b)=>String(b.savedAt||'').localeCompare(String(a.savedAt||'')));}
  };
}

export const pendingReleaseKeys=entry=>(entry?.selectedKeys||[]).filter(key=>!(entry.releasedKeys||[]).includes(key));
