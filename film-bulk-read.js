// Authenticated, bounded READ recovery. Never retries order/stock/export writes.
const refreshes=new WeakMap();
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validFilmId=value=>uuid.test(String(value||''));
export const expiredFilmJwt=error=>/jwt[^\n]*(?:expired|expirad)|(?:expired|expirad)[^\n]*jwt/i.test(String(error?.message||error||''));
export function filmAbort(message='Inclusão interrompida. A montagem existente foi preservada.'){
  return new DOMException(message,'AbortError');
}
export function waitFilm(promise,{signal,timeoutMs=20000}={}){
  return new Promise((resolve,reject)=>{
    let settled=false,timer;
    const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);fn(value);};
    const abort=()=>finish(reject,signal.reason||filmAbort());
    timer=setTimeout(()=>finish(reject,new Error('A conexão demorou para responder. Sua seleção foi mantida; tente novamente.')),timeoutMs);
    signal?.addEventListener('abort',abort,{once:true});
    Promise.resolve(promise).then(value=>finish(resolve,value),error=>finish(reject,error));
    if(signal?.aborted)abort();
  });
}
export async function filmMapLimit(rows,limit,task){
  const output=new Array(rows.length);let next=0,failure;
  await Promise.all(Array.from({length:Math.min(limit,rows.length)},async()=>{
    while(!failure){const index=next++;if(index>=rows.length)return;
      try{output[index]=await task(rows[index],index);}catch(error){failure=error;}
    }
  }));
  if(failure)throw failure;return output;
}
export function createFilmReader({supabase,ownerId,actorId,isCurrent=()=>true,signal,timeoutMs=20000,strictAuth=true}={}){
  if(!supabase||!validFilmId(ownerId))throw new Error('Conta de produção inválida.');
  let capturedActor=actorId||null;
  const check=()=>{if(signal?.aborted)throw signal.reason||filmAbort();if(!isCurrent())throw filmAbort('A página ou a conta mudou. Nenhuma arte foi adicionada.');};
  async function ensure(force=false,failedToken=null){
    check();
    if(!supabase.auth?.getSession){if(strictAuth)throw new Error('Entre novamente na conta da produção.');return null;}
    let result=await waitFilm(supabase.auth.getSession(),{signal,timeoutMs:12000});check();
    if(result?.error)throw new Error('Não foi possível renovar sua sessão. Entre novamente, sem apagar o filme salvo.');
    let session=result?.data?.session;
    if(!session?.user?.id)throw new Error('Sua sessão terminou. Entre novamente para continuar; o filme salvo foi preservado.');
    if(!capturedActor)capturedActor=session.user.id;
    if(session.user.id!==capturedActor)throw filmAbort('A conta mudou. Abra a seleção novamente.');
    const nearExpiry=!session.expires_at||session.expires_at*1000<Date.now()+120000;
    if(nearExpiry||(force&&(!failedToken||failedToken===session.access_token))){
      let pending=refreshes.get(supabase);
      if(!pending){
        pending=Promise.resolve().then(()=>supabase.auth.refreshSession());refreshes.set(supabase,pending);
        pending.then(()=>{if(refreshes.get(supabase)===pending)refreshes.delete(supabase);},()=>{if(refreshes.get(supabase)===pending)refreshes.delete(supabase);});
      }
      result=await waitFilm(pending,{signal,timeoutMs:12000});check();session=result?.data?.session;
      if(result?.error||!session?.user?.id)throw new Error('Não foi possível renovar sua sessão. Entre novamente para continuar com segurança.');
      if(session.user.id!==capturedActor)throw filmAbort('A conta mudou durante a renovação.');
    }
    return session;
  }
  async function read(factory){
    let session=await ensure();
    for(let attempt=0;attempt<2;attempt++){
      check();const controller=new AbortController(),abort=()=>controller.abort(signal?.reason||filmAbort());
      signal?.addEventListener('abort',abort,{once:true});let result;
      try{result=await waitFilm(Promise.resolve().then(()=>factory(controller.signal)),{signal,timeoutMs});check();if(result?.error)throw result.error;return result;}
      catch(error){
        check();if(attempt===0&&expiredFilmJwt(error)){session=await ensure(true,session?.access_token);continue;}
        if(expiredFilmJwt(error))throw new Error('A sessão não pôde ser renovada. Entre novamente; sua seleção não foi adicionada em duplicidade.');
        throw error;
      }finally{signal?.removeEventListener('abort',abort);controller.abort();}
    }
  }
  async function rows(table,ids,{key='id',columns='*',onChunk}={}){
    const unique=[...new Set(ids.filter(Boolean))];if(unique.some(id=>!validFilmId(id)))throw new Error('Aplicação sem vínculo válido. Reabra a lista.');
    const chunks=[];for(let i=0;i<unique.length;i+=100)chunks.push(unique.slice(i,i+100));let done=0;
    const result=await filmMapLimit(chunks,3,async chunk=>{
      const response=await read(abortSignal=>{
        const query=supabase.from(table).select(columns).eq('owner_id',ownerId).in(key,chunk);
        return typeof query.abortSignal==='function'?query.abortSignal(abortSignal):query;
      });
      if(!Array.isArray(response?.data))throw new Error('A consulta da produção retornou uma resposta incompleta.');
      done+=chunk.length;onChunk?.(done,unique.length);return response.data;
    });check();return result.flat();
  }
  return {read,rows,ensure,check};
}
