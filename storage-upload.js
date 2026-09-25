const MB=1024*1024;
const TUS_THRESHOLD=6*MB;
const TUS_CHUNK=6*MB;

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const encodePath=path=>String(path||'').split('/').map(part=>encodeURIComponent(part)).join('/');
const safeText=async response=>{try{return (await response.text()).slice(0,500)}catch{return ''}};
const utf8Base64=value=>{
  const bytes=new TextEncoder().encode(String(value??''));let binary='';
  for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(binary);
};
const tusMetadata=fields=>Object.entries(fields).map(([key,value])=>key+' '+utf8Base64(value)).join(',');

export function createReliableStorageUploader({
  supabase,
  projectUrl,
  publishableKey,
  bucket,
  fetchImpl=globalThis.fetch?.bind(globalThis),
  xhrFactory=()=>new XMLHttpRequest(),
  standardTimeoutMs=120000,
  tusCreateTimeoutMs=30000,
  tusChunkTimeoutMs=180000,
}={}){
  if(!supabase||!projectUrl||!publishableKey||!bucket||typeof fetchImpl!=='function')throw new Error('Uploader do Storage não foi configurado.');
  const projectOrigin=new URL(projectUrl).origin;
  const ref=new URL(projectUrl).hostname.split('.')[0];
  const directStorageOrigin='https://'+ref+'.storage.supabase.co';

  async function authHeaders(){
    const {data,error}=await supabase.auth.getSession();
    if(error)throw error;
    const token=data?.session?.access_token;
    if(!token)throw new Error('Sua sessão expirou. Entre novamente antes de enviar a arte.');
    return {authorization:'Bearer '+token,apikey:publishableKey};
  }

  function xhrRequest({method,url,headers,body,timeoutMs,onProgress,baseOffset=0,totalSize=0}){
    return new Promise((resolve,reject)=>{
      const xhr=xhrFactory();let settled=false;
      const finish=(ok,value)=>{if(settled)return;settled=true;ok?resolve(value):reject(value)};
      xhr.open(method,url,true);xhr.timeout=timeoutMs;
      for(const [name,value] of Object.entries(headers||{}))xhr.setRequestHeader(name,value);
      if(xhr.upload&&typeof onProgress==='function')xhr.upload.onprogress=event=>{
        if(!event.lengthComputable&&method!=='PATCH')return;
        const loaded=method==='PATCH'?Math.min(totalSize,baseOffset+event.loaded):event.loaded;
        const total=method==='PATCH'?totalSize:(event.total||totalSize);
        if(total>0)onProgress(loaded,total);
      };
      xhr.onerror=()=>finish(false,new Error('Falha de rede durante o envio ao Storage.'));
      xhr.ontimeout=()=>finish(false,new Error('O envio ao Storage demorou demais e foi interrompido.'));
      xhr.onabort=()=>finish(false,new Error('O envio ao Storage foi cancelado.'));
      xhr.onload=()=>{
        if(xhr.status>=200&&xhr.status<300){
          const offset=Number(xhr.getResponseHeader?.('Upload-Offset'));
          finish(true,{status:xhr.status,offset:Number.isFinite(offset)?offset:null,responseText:xhr.responseText||''});
        }else{
          finish(false,Object.assign(new Error((xhr.responseText||'Falha no Storage.').slice(0,500)),{status:xhr.status}));
        }
      };
      xhr.send(body);
    });
  }

  async function fetchWithTimeout(url,init,timeoutMs){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new Error('A conexão com o Storage demorou demais.')),timeoutMs);
    try{return await fetchImpl(url,{...init,signal:controller.signal})}catch(error){
      if(controller.signal.aborted)throw new Error('A conexão com o Storage demorou demais.');
      throw error;
    }finally{clearTimeout(timer)}
  }

  async function standardUpload(path,blob,{contentType,onProgress}){
    const auth=await authHeaders(),url=projectOrigin+'/storage/v1/object/'+encodeURIComponent(bucket)+'/'+encodePath(path);
    await xhrRequest({method:'POST',url,headers:{...auth,'content-type':contentType||blob.type||'application/octet-stream','x-upsert':'false','cache-control':'3600'},body:blob,timeoutMs:standardTimeoutMs,onProgress,totalSize:blob.size});
    onProgress?.(blob.size,blob.size);return {path,mode:'standard'};
  }

  async function readTusOffset(uploadUrl,auth){
    const response=await fetchWithTimeout(uploadUrl,{method:'HEAD',headers:{...auth,'Tus-Resumable':'1.0.0'}},tusCreateTimeoutMs);
    if(!response.ok)throw new Error('Não foi possível confirmar o ponto do upload resumível.');
    const offset=Number(response.headers.get('upload-offset'));return Number.isFinite(offset)?offset:0;
  }

  async function resumableUpload(path,blob,{contentType,onProgress}){
    const auth=await authHeaders(),endpoint=directStorageOrigin+'/storage/v1/upload/resumable';
    const create=await fetchWithTimeout(endpoint,{method:'POST',headers:{
      ...auth,
      'Tus-Resumable':'1.0.0',
      'Upload-Length':String(blob.size),
      'Upload-Metadata':tusMetadata({bucketName:bucket,objectName:path,contentType:contentType||blob.type||'application/octet-stream',cacheControl:'3600',metadata:'{}'}),
      'x-upsert':'false',
    }},tusCreateTimeoutMs);
    if(!create.ok)throw new Error((await safeText(create))||('Storage recusou o início do upload ('+create.status+').'));
    const location=create.headers.get('location');if(!location)throw new Error('Storage não devolveu o endereço do upload resumível.');
    const uploadUrl=new URL(location,endpoint).href;let offset=Number(create.headers.get('upload-offset')||0);
    if(!Number.isFinite(offset)||offset<0)offset=0;onProgress?.(offset,blob.size);
    const retryDelays=[0,1500,3500,7000];
    while(offset<blob.size){
      let advanced=false,lastError=null;
      for(const delay of retryDelays){
        if(delay)await sleep(delay);
        const start=offset,end=Math.min(blob.size,start+TUS_CHUNK),chunk=blob.slice(start,end);
        try{
          const result=await xhrRequest({method:'PATCH',url:uploadUrl,headers:{...auth,'Tus-Resumable':'1.0.0','Upload-Offset':String(start),'content-type':'application/offset+octet-stream'},body:chunk,timeoutMs:tusChunkTimeoutMs,onProgress,baseOffset:start,totalSize:blob.size});
          const serverOffset=result.offset;
          offset=Number.isFinite(serverOffset)&&serverOffset>=end?serverOffset:end;
          onProgress?.(Math.min(offset,blob.size),blob.size);advanced=true;break;
        }catch(error){
          lastError=error;
          try{
            const serverOffset=await readTusOffset(uploadUrl,auth);
            if(serverOffset>offset){offset=serverOffset;onProgress?.(Math.min(offset,blob.size),blob.size);advanced=true;break}
          }catch{}
        }
      }
      if(!advanced)throw lastError||new Error('Não foi possível continuar o upload resumível.');
    }
    return {path,mode:'tus'};
  }

  async function upload(path,blob,{contentType=blob?.type,onProgress=()=>{}}={}){
    if(!(blob instanceof Blob)||!Number.isFinite(blob.size)||blob.size<1)throw new Error('Arquivo inválido para upload.');
    const progress=(loaded,total)=>onProgress({loaded,total,percent:Math.min(100,Math.max(0,Math.round(loaded/total*100)))});
    return blob.size>TUS_THRESHOLD?resumableUpload(path,blob,{contentType,onProgress:progress}):standardUpload(path,blob,{contentType,onProgress:progress});
  }

  return {upload,TUS_THRESHOLD,TUS_CHUNK};
}
