// Bounded recovery for idempotent Data API reads only. No auth/RPC/write retries.
// No response cache, token logging, changed RLS or successful-looking fallback data.
export function createResilientReadFetch({origin,fetchImpl=globalThis.fetch.bind(globalThis),timeoutMs=15000,retryDelayMs=300,maxResponseBytes=64*1024*1024,onDiagnostic=event=>console.warn('[019:leitura]',event)}={}){
  const allowedOrigin=new URL(origin).origin;
  if(!Number.isSafeInteger(maxResponseBytes)||maxResponseBytes<1)throw new RangeError('Limite de resposta inválido.');
  return async function readFetch(input,init={}){
    const rawUrl=typeof input==='string'||input instanceof URL?String(input):input.url;
    let url;try{url=new URL(rawUrl)}catch{return fetchImpl(input,init)}
    const method=String(init.method||input?.method||'GET').toUpperCase();
    if(url.origin!==allowedOrigin||!['GET','HEAD'].includes(method)||!url.pathname.startsWith('/rest/v1/')||url.pathname.startsWith('/rest/v1/rpc/'))return fetchImpl(input,init);
    const signal=init.signal||input?.signal;
    for(let attempt=1;attempt<=2;attempt++){
      if(signal?.aborted)throw signal.reason||new DOMException('Consulta cancelada.','AbortError');
      const controller=new AbortController();let timedOut=false;
      const abort=()=>controller.abort(signal.reason);signal?.addEventListener('abort',abort,{once:true});
      const timer=setTimeout(()=>{timedOut=true;controller.abort(new Error('A consulta demorou demais. Confira a conexão e tente novamente.'))},timeoutMs);
      const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort)};
      let response,error;
      try{response=await fetchImpl(input,{...init,signal:controller.signal})}catch(caught){error=caught}
      if(signal?.aborted){cleanup();throw signal.reason||new DOMException('Consulta cancelada.','AbortError')}
      const transient=response&&[408,502,503,504,520,521,522,523,524].includes(response.status);
      if(response&&(!transient||attempt===2)){
        if(transient)onDiagnostic({kind:'http',status:response.status,resource:url.pathname.split('/')[3],attempts:attempt});
        // Fetch resolves at headers, not EOF. Keep the original deadline and
        // caller's abort connection alive until the SDK finishes reading JSON.
        // Once a response is handed to the SDK, body failure is NOT retried.
        if(!response.body){cleanup();return response}
        try{return guardedResponse(response,{controller,cleanup,maxResponseBytes,onError:kind=>{
          if(!signal?.aborted)onDiagnostic({kind:timedOut?'timeout':kind,status:response.status,resource:url.pathname.split('/')[3],attempts:attempt});
        }})}catch(caught){cleanup();throw caught}
      }
      cleanup();
      if(attempt===2){
        // Table name only. Never log credentials, filters, object paths or response bodies.
        onDiagnostic({kind:timedOut?'timeout':response?'http':'network',status:response?.status||null,resource:url.pathname.split('/')[3],attempts:attempt});
        throw new Error(timedOut?'A consulta demorou demais. Confira a conexão e tente novamente.':'Falha de conexão ao carregar os dados. Confira a internet e tente novamente.',{cause:error});
      }
      // Cancellation is best effort, never a new unbounded wait before retry.
      if(response)try{void response.body?.cancel()?.catch(()=>{})}catch{}
      await new Promise((resolve,reject)=>{
        const cancel=()=>{clearTimeout(wait);signal?.removeEventListener('abort',cancel);reject(signal.reason||new DOMException('Consulta cancelada.','AbortError'))};
        const wait=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve()},retryDelayMs);
        signal?.addEventListener('abort',cancel,{once:true});
        if(signal?.aborted)cancel();
      });
    }
  };
}

function guardedResponse(response,{controller,cleanup,maxResponseBytes,onError}){
  const reader=response.body.getReader();let ended=false,bytes=0,output;
  const finish=()=>{if(ended)return false;ended=true;cleanup();controller.signal.removeEventListener('abort',onAbort);return true};
  const fail=(error,kind='body')=>{
    if(!finish())return;
    output.error(error);void reader.cancel(error).catch(()=>{});onError(kind);
  };
  const onAbort=()=>fail(controller.signal.reason||new DOMException('Consulta cancelada.','AbortError'));
  const body=new ReadableStream({
    start(stream){output=stream;controller.signal.addEventListener('abort',onAbort,{once:true});if(controller.signal.aborted)onAbort()},
    async pull(stream){
      try{
        const item=await reader.read();if(ended)return;
        if(item.done){finish();reader.releaseLock();stream.close();return}
        bytes+=item.value.byteLength;
        if(bytes>maxResponseBytes){fail(new Error('A resposta de dados excedeu o limite seguro. Reduza o filtro da consulta e tente novamente.'),'body-limit');return}
        stream.enqueue(item.value);
      }catch(error){fail(error)}
    },
    cancel(reason){if(!finish())return;return reader.cancel(reason)},
  });
  const result=new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
  // Preserve ordinary fetch metadata while delivering identical response bytes.
  Object.defineProperties(result,{url:{value:response.url},redirected:{value:response.redirected},type:{value:response.type}});
  return result;
}
