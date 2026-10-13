// Display-only thumbnails. Production paths, dimensions and export bytes are untouched.
export async function decodeFilmThumbnail(url,{doc=document,signal,maxPixels=320,timeoutMs=14000}={}){
 if(!url)throw new Error('Arquivo da prévia indisponível.');
 const win=doc.defaultView||globalThis,image=new win.Image();image.crossOrigin='anonymous';image.decoding='async';
 let timer;const abort=()=>{image.src='';};
 try{
  await new Promise((resolve,reject)=>{
   let settled=false;
   const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);image.onload=image.onerror=null;signal?.removeEventListener('abort',cancel);error?reject(error):resolve();};
   const cancel=()=>{abort();finish(signal?.reason||new DOMException('Prévia cancelada.','AbortError'));};
   image.onload=()=>finish();image.onerror=()=>finish(new Error('A imagem não carregou. Toque em Tentar novamente.'));
   timer=setTimeout(()=>{abort();finish(new Error('A imagem demorou para carregar. Tente novamente.'));},timeoutMs);
   signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)return cancel();image.src=url;
   if(image.complete&&image.naturalWidth)finish();
  });
  if(signal?.aborted)throw signal.reason;
  const w=image.naturalWidth,h=image.naturalHeight;if(!w||!h)throw new Error('Imagem sem dimensões.');
  const scale=Math.min(1,maxPixels/Math.max(w,h)),canvas=doc.createElement('canvas');canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
  try{const g=canvas.getContext('2d');if(!g)throw new Error('Memória de prévia indisponível.');g.drawImage(image,0,0,canvas.width,canvas.height);const blob=await new Promise((res,rej)=>canvas.toBlob(b=>b?res(b):rej(new Error('Não foi possível preparar a prévia.')),'image/png'));if(signal?.aborted)throw signal.reason;return URL.createObjectURL(blob);}finally{canvas.width=canvas.height=1;}
 }finally{clearTimeout(timer);abort();}
}
export function createFilmMedia({shell,items,resolveSource,isCurrent=()=>true,onProgress=()=>{},concurrency=1}){
 const doc=shell.ownerDocument,win=doc.defaultView,itemMap=new Map(items.map(i=>[i.localId,i])),states=new Map(),nodes=new Map(),visible=new Set(),queue=[];
 let alive=true,active=0,epoch=0;const controller=new AbortController();
 const identity=item=>item.type==='asset'?`${item.storageBucket||'z19p-assets'}:${item.path}`:`text:${item.previewDataUrl||item.localId}`;
 function stateFor(item){const key=identity(item);let s=states.get(key);if(!s){s={key,item,status:'idle',url:null,nodes:new Set(),error:null,last:0};states.set(key,s);}return s;}
 const current=()=>alive&&isCurrent();
 function report(){if(!current())return;const demand=[...states.values()].filter(s=>[...s.nodes].some(n=>visible.has(n))),ready=demand.filter(s=>s.status==='ready').length,errors=demand.filter(s=>s.status==='error').length;onProgress({ready,total:demand.length,errors,all:states.size});}
 function paint(s){for(const node of s.nodes){if(!node.isConnected)continue;node.dataset.mediaState=s.status;const img=node.querySelector('img'),note=node.querySelector('[data-media-note]');if(s.status==='ready'&&s.url){if(img.getAttribute('src')!==s.url)img.src=s.url;note.textContent='';}else{img.removeAttribute('src');note.textContent=s.status==='error'?'Prévia indisponível · tentar novamente':s.status==='loading'?'Carregando arte…':'Prévia ao rolar';}if(s.error)note.title=s.error.message||String(s.error);}report();}
 function request(s,force=false){if(!current()||s.status==='loading'||s.status==='queued'||s.status==='ready')return;if(s.status==='error'&&!force)return;s.status='queued';s.force=force;queue.push(s);drain();}
 function prune(){const cached=[...states.values()].filter(s=>s.url&&!([...s.nodes].some(n=>visible.has(n)))).sort((a,b)=>a.last-b.last);let count=[...states.values()].filter(s=>s.url).length;for(const s of cached){if(count<=64)break;URL.revokeObjectURL(s.url);s.url=null;s.status='idle';paint(s);count--;}}
 async function load(s){
  s.status='loading';paint(s);let error;
  for(let attempt=0;attempt<2&&current();attempt++){
   try{
    const candidates=await resolveSource(s.item,{force:s.force||attempt>0,signal:controller.signal});if(!current())return;
    const list=Array.isArray(candidates)?candidates:[candidates];let result;
    for(const src of list.filter(Boolean)){try{const largest=Math.max(64,...[...s.nodes].filter(n=>visible.has(n)).map(n=>Math.max(n.clientWidth,n.clientHeight)*1.5));result=await decodeFilmThumbnail(src,{doc,signal:controller.signal,maxPixels:Math.min(384,largest)});break;}catch(e){error=e;if(controller.signal.aborted)throw e;}}
    if(!result)throw error||new Error('Arquivo de prévia indisponível.');
    if(!current()){URL.revokeObjectURL(result);return;}s.url=result;s.status='ready';s.error=null;s.last=++epoch;paint(s);prune();return;
   }catch(e){error=e;if(controller.signal.aborted)return;}
  }
  if(current()){s.status='error';s.error=error;paint(s);}
 }
 function drain(){if(!current())return;while(active<concurrency&&queue.length){const s=queue.shift();if(![...s.nodes].some(n=>visible.has(n))){s.status='idle';continue;}active++;load(s).finally(()=>{active--;if(current()){report();drain();}});}}
 const observer=win.IntersectionObserver?new win.IntersectionObserver(entries=>{for(const e of entries){const s=nodes.get(e.target);if(!s)continue;if(e.isIntersecting){visible.add(e.target);s.last=++epoch;request(s);}else visible.delete(e.target);}report();prune();},{root:shell,rootMargin:'180px 0px'}):null;
 function sync(placements){const live=new Set(placements);for(const [node,s] of nodes)if(!live.has(node)){observer?.unobserve(node);visible.delete(node);s.nodes.delete(node);nodes.delete(node);}for(const node of placements){if(nodes.has(node))continue;const item=itemMap.get(node.dataset.itemId);if(!item)continue;const s=stateFor(item);nodes.set(node,s);s.nodes.add(node);node.querySelector('img').onerror=()=>{if(s.status==='ready'){if(s.url)URL.revokeObjectURL(s.url);s.url=null;s.status='error';s.error=new Error('A prévia não pôde ser exibida.');paint(s);}};paint(s);if(observer)observer.observe(node);else{visible.add(node);request(s);}}report();}
 function retry(){for(const s of states.values())if(s.status==='error'&&[...s.nodes].some(n=>visible.has(n)))request(s,true);}
 function destroy(){if(!alive)return;alive=false;controller.abort();observer?.disconnect();queue.length=0;for(const s of states.values())if(s.url)URL.revokeObjectURL(s.url);states.clear();nodes.clear();visible.clear();}
 return {sync,retry,destroy};
}
