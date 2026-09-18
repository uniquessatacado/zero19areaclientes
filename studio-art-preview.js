// Browser-only, account-scoped preview cache. Originals are never replaced or uploaded.
export function assetPixelDimensions(asset){
  const width=Number(asset?.width),height=Number(asset?.height);
  return Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0&&width<=100000&&height<=100000?{width,height}:null;
}
export function previewSize(width,height,max=384){const scale=Math.min(1,max/Math.max(width,height));return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};}
const abortError=()=>new DOMException('Carregamento da prévia cancelado.','AbortError');
const pathFor=asset=>asset?.processed_path||asset?.original_path||asset?.path;

export function createStudioPreviewCache(ctx,{signal,concurrency=2,maxEntries=64,loader}={}){
  const entries=new Map(),queue=[];let running=0,disposed=false;
  const limit=Math.max(1,Math.min(3,Number(concurrency)||2)),capacity=Math.max(40,Number(maxEntries)||64);
  async function load(asset,requestSignal){
    const dimensions=assetPixelDimensions(asset),thumbnail=dimensions?asset.metadata?.thumbnail_path:null;
    const response=await fetch(ctx.publicUrl(thumbnail||pathFor(asset)),{signal:requestSignal,credentials:'omit'});
    if(!response.ok)throw new Error('A prévia não carregou. Tente novamente.');
    if(Number(response.headers.get('content-length'))>64*1024*1024)throw new Error('Arquivo muito grande para a prévia. A arte original foi preservada.');
    const blob=await response.blob();if(requestSignal.aborted)throw abortError();
    if(blob.size>64*1024*1024)throw new Error('Arquivo muito grande para a prévia.');
    let bitmap=null,objectURL=null,canvas=null;
    try{
      let sourceWidth=dimensions?.width,sourceHeight=dimensions?.height;
      if(typeof createImageBitmap==='function'){
        const size=dimensions&&!thumbnail?previewSize(sourceWidth,sourceHeight):null;
        bitmap=await createImageBitmap(blob,size?{resizeWidth:size.width,resizeHeight:size.height,resizeQuality:'high'}:undefined);
      }else{
        objectURL=URL.createObjectURL(blob);bitmap=new Image();bitmap.src=objectURL;await bitmap.decode();
      }
      if(requestSignal.aborted)throw abortError();
      // A separate thumbnail cannot tell us the original pixel dimensions.
      if(!sourceWidth||!sourceHeight){sourceWidth=bitmap.width;sourceHeight=bitmap.height;}
      const size=previewSize(bitmap.width,bitmap.height);canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
      canvas.getContext('2d').drawImage(bitmap,0,0,size.width,size.height);
      const preview=await new Promise((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(new Error('Falha ao preparar a prévia.')),'image/webp',.88));
      if(requestSignal.aborted)throw abortError();
      return {url:URL.createObjectURL(preview),width:sourceWidth,height:sourceHeight,previewWidth:size.width,previewHeight:size.height};
    }finally{bitmap?.close?.();if(objectURL)URL.revokeObjectURL(objectURL);if(canvas)canvas.width=canvas.height=1;}
  }
  function prune(){
    for(const [key,entry] of entries){if(entries.size<=capacity)break;if(entry.value&&!entry.pinned&&!entry.users){URL.revokeObjectURL(entry.value.url);entries.delete(key);}}
  }
  function pump(){
    if(disposed)return;
    while(running<limit&&queue.length){
      const entry=queue.shift();if(entry.controller.signal.aborted)continue;running++;entry.started=true;
      const timer=setTimeout(()=>entry.controller.abort(),30000);
      Promise.resolve().then(()=> (loader||load)(entry.asset,entry.controller.signal)).then(value=>{
        if(disposed||entry.controller.signal.aborted){URL.revokeObjectURL(value.url);throw abortError();}
        entry.value=value;entry.resolve(value);
      }).catch(error=>{if(entries.get(entry.key)===entry)entries.delete(entry.key);entry.reject(error);}).finally(()=>{clearTimeout(timer);running--;prune();pump();});
    }
  }
  function get(asset,{signal:consumerSignal,pin=false}={}){
    if(disposed||consumerSignal?.aborted)return Promise.reject(abortError());
    const key=pathFor(asset);if(!key)return Promise.reject(new Error('Esta arte não possui arquivo de imagem.'));
    let entry=entries.get(key);
    if(entry){entries.delete(key);entries.set(key,entry);}
    if(!entry){
      entry={key,asset,controller:new AbortController(),users:0,pinned:false,value:null,started:false};
      entry.promise=new Promise((resolve,reject)=>{entry.resolve=resolve;entry.reject=reject;});entry.promise.catch(()=>{});entries.set(key,entry);queue.push(entry);
    }
    entry.pinned ||= pin;if(entry.value)return Promise.resolve(entry.value);
    entry.users++;
    const result=new Promise((resolve,reject)=>{
      let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;consumerSignal?.removeEventListener('abort',cancel);entry.users--;if(!entry.users&&!entry.pinned&&!entry.value){entry.controller.abort();if(entries.get(key)===entry)entries.delete(key);if(!entry.started)entry.reject(abortError());}error?reject(error):resolve(value);};
      const cancel=()=>finish(abortError());consumerSignal?.addEventListener('abort',cancel,{once:true});entry.promise.then(value=>finish(null,value),error=>finish(error));
    });pump();return result;
  }
  const dispose=()=>{if(disposed)return;disposed=true;signal?.removeEventListener('abort',dispose);for(const entry of entries.values()){entry.controller.abort();entry.reject(abortError());if(entry.value)URL.revokeObjectURL(entry.value.url);}entries.clear();queue.length=0;};
  signal?.addEventListener('abort',dispose,{once:true});if(signal?.aborted)dispose();
  return {get,peek:asset=>entries.get(typeof asset==='string'?asset:pathFor(asset))?.value||null,retain:paths=>{const pinned=new Set(paths);for(const [key,entry] of entries)entry.pinned=pinned.has(key);prune();},dispose,stats:()=>({running,queued:queue.filter(entry=>!entry.controller.signal.aborted).length,entries:entries.size})};
}
