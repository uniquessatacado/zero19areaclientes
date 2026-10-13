// Display-only previews. Production paths, dimensions and export bytes are untouched.
// 2.17.76: parallel downloads without a short give-up timer, resolution that follows
// the zoom (sharp on screen), automatic retries and a direct-image fallback, so a
// slow or very large PNG never stays blank in the film.
const sleep=(ms,signal)=>new Promise((resolve,reject)=>{const t=setTimeout(resolve,ms);signal?.addEventListener('abort',()=>{clearTimeout(t);reject(signal.reason);},{once:true});});
function httpError(status){
 if(status===400||status===404)return new Error(`Arquivo da arte não encontrado no armazenamento (erro ${status}). Confira esta arte antes de exportar.`);
 if(status===401||status===403)return new Error(`O acesso ao arquivo expirou (erro ${status}). Tentando de novo…`);
 return new Error(`O servidor de arquivos respondeu erro ${status}. Tentando de novo…`);
}
// Waits as long as bytes keep arriving; only a stalled connection is abandoned.
async function fetchArt(url,{signal,reload=false,stallMs=30000,maxMs=240000}={}){
 if(/^(data|blob):/i.test(url)){const r=await fetch(url,{signal});return r.blob();}
 const ctrl=new AbortController(),stop=reason=>{if(!ctrl.signal.aborted)ctrl.abort(reason);},onAbort=()=>stop(signal.reason);
 signal?.addEventListener('abort',onAbort,{once:true});if(signal?.aborted)onAbort();
 let stall=setTimeout(()=>stop(new Error('A conexão parou de responder ao baixar a arte.')),stallMs);
 const total=setTimeout(()=>stop(new Error('A arte demorou demais para baixar.')),maxMs);
 try{
  const response=await fetch(url,{signal:ctrl.signal,cache:reload?'reload':'default',credentials:'omit'});
  if(!response.ok)throw httpError(response.status);
  const type=response.headers.get('content-type')||'';
  if(!response.body)return await response.blob();
  const reader=response.body.getReader(),chunks=[];
  for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);clearTimeout(stall);stall=setTimeout(()=>stop(new Error('A conexão parou de responder ao baixar a arte.')),stallMs);}
  return new Blob(chunks,{type:/^image\//.test(type)?type:'image/png'});
 }catch(error){if(ctrl.signal.aborted&&ctrl.signal.reason)throw ctrl.signal.reason;if(error instanceof TypeError)throw new Error('Falha de conexão ao baixar a arte.');throw error;}
 finally{clearTimeout(stall);clearTimeout(total);signal?.removeEventListener('abort',onAbort);}
}
async function pngSize(blob){
 try{const b=new Uint8Array(await blob.slice(0,24).arrayBuffer());if(b[0]!==0x89||b[1]!==0x50||b[2]!==0x4e||b[3]!==0x47)return null;const v=new DataView(b.buffer);const w=v.getUint32(16),h=v.getUint32(20);return w&&h?{w,h}:null;}catch{return null;}
}
async function decodeFull(blob,win){
 if(win.createImageBitmap){try{const bitmap=await win.createImageBitmap(blob);return {source:bitmap,w:bitmap.width,h:bitmap.height,close:()=>bitmap.close?.()};}catch{}}
 const url=URL.createObjectURL(blob),image=new win.Image();image.decoding='async';image.src=url;
 try{await image.decode();}catch{URL.revokeObjectURL(url);throw new Error('O arquivo baixado não é uma imagem válida.');}
 return {source:image,w:image.naturalWidth,h:image.naturalHeight,close:()=>URL.revokeObjectURL(url)};
}
function canvasBlob(canvas){return new Promise((res,rej)=>canvas.toBlob(b=>b?res(b):rej(new Error('Memória insuficiente para preparar a prévia.')),'image/webp',0.95));}
// Returns an object URL no larger than `target` pixels on the longest side.
// When the original already fits, the original bytes are shown untouched.
export async function makeFilmPreview(src,{doc=document,signal,target=1536,reload=false}={}){
 const win=doc.defaultView||globalThis,blob=await fetchArt(src,{signal,reload});
 if(signal?.aborted)throw signal.reason;
 if(!blob.size)throw new Error('O arquivo da arte está vazio.');
 const dims=await pngSize(blob);
 if(dims&&Math.max(dims.w,dims.h)<=target)return {url:URL.createObjectURL(blob),owned:true,px:Math.max(dims.w,dims.h),full:true};
 let canvas=doc.createElement('canvas'),g;
 try{
  if(dims&&win.createImageBitmap){
   const k=target/Math.max(dims.w,dims.h),rw=Math.max(1,Math.round(dims.w*k)),rh=Math.max(1,Math.round(dims.h*k));
   try{const bitmap=await win.createImageBitmap(blob,{resizeWidth:rw,resizeHeight:rh,resizeQuality:'high'});canvas.width=rw;canvas.height=rh;g=canvas.getContext('2d');g.drawImage(bitmap,0,0);bitmap.close?.();if(signal?.aborted)throw signal.reason;return {url:URL.createObjectURL(await canvasBlob(canvas)),owned:true,px:Math.max(rw,rh),full:false};}catch(error){if(signal?.aborted)throw error;}
  }
  const full=await decodeFull(blob,win);
  try{
   if(!full.w||!full.h)throw new Error('Imagem sem dimensões.');
   if(Math.max(full.w,full.h)<=target)return {url:URL.createObjectURL(blob),owned:true,px:Math.max(full.w,full.h),full:true};
   // Step down by halves for a sharp, alias-free reduction.
   let source=full.source,w=full.w,h=full.h;const k=target/Math.max(w,h),tw=Math.max(1,Math.round(w*k)),th=Math.max(1,Math.round(h*k));
   while(w/2>=tw&&h/2>=th){const step=doc.createElement('canvas');step.width=Math.round(w/2);step.height=Math.round(h/2);const sg=step.getContext('2d');if(!sg)throw new Error('Memória insuficiente para preparar a prévia.');sg.imageSmoothingQuality='high';sg.drawImage(source,0,0,step.width,step.height);if(source!==full.source&&source.width)source.width=source.height=1;source=step;w=step.width;h=step.height;}
   canvas.width=tw;canvas.height=th;g=canvas.getContext('2d');if(!g)throw new Error('Memória insuficiente para preparar a prévia.');g.imageSmoothingQuality='high';g.drawImage(source,0,0,tw,th);if(source!==full.source&&source.width)source.width=source.height=1;
   if(signal?.aborted)throw signal.reason;
   return {url:URL.createObjectURL(await canvasBlob(canvas)),owned:true,px:Math.max(tw,th),full:false};
  }finally{full.close();}
 }finally{canvas.width=canvas.height=1;}
}
// Last resort: let the browser show the file itself (no canvas, no CORS needed).
function probeDirect(url,{doc,signal,timeoutMs=180000}){
 return new Promise((resolve,reject)=>{const image=new (doc.defaultView||globalThis).Image();let t;
  const done=error=>{clearTimeout(t);image.onload=image.onerror=null;signal?.removeEventListener('abort',abort);error?reject(error):resolve({url,owned:false,px:Infinity,full:true});};
  const abort=()=>{image.src='';done(signal.reason);};
  t=setTimeout(()=>{image.src='';done(new Error('A arte demorou demais para abrir.'));},timeoutMs);
  image.onload=()=>done();image.onerror=()=>done(new Error('O navegador não conseguiu abrir o arquivo da arte.'));
  signal?.addEventListener('abort',abort,{once:true});image.decoding='async';image.src=url;});
}
// Kept for callers of the 2.17.74 API.
export async function decodeFilmThumbnail(url,{doc=document,signal,maxPixels=320}={}){return (await makeFilmPreview(url,{doc,signal,target:maxPixels})).url;}
export function createFilmMedia({shell,items,resolveSource,isCurrent=()=>true,onProgress=()=>{},concurrency}){
 const doc=shell.ownerDocument,win=doc.defaultView,itemMap=new Map(items.map(i=>[i.localId,i])),states=new Map(),nodes=new Map(),visible=new Set(),queue=[];
 const coarse=!!win.matchMedia?.('(pointer:coarse)').matches,maxTarget=coarse?1536:3072,cacheLimit=coarse?24:64,limit=concurrency||(coarse?2:3);
 const buckets=[384,512,768,1024,1536,2048,3072];
 let alive=true,active=0,epoch=0;const controller=new AbortController();
 const identity=item=>item.type==='asset'?`${item.storageBucket||'z19p-assets'}:${item.path}`:`text:${item.previewDataUrl||item.localId}`;
 function stateFor(item){const key=identity(item);let s=states.get(key);if(!s){s={key,item,status:'idle',url:null,owned:false,px:0,full:false,busy:false,nodes:new Set(),error:null,last:0,auto:0};states.set(key,s);}return s;}
 const current=()=>alive&&isCurrent();
 const seen=s=>[...s.nodes].some(n=>visible.has(n));
 // Pixels the art really occupies on screen (zoom × screen density), rounded up.
 function need(s){const dpr=Math.min(3,win.devicePixelRatio||1);let px=0;for(const n of s.nodes){if(!visible.has(n))continue;const img=n.querySelector('img');px=Math.max(px,parseFloat(img?.style.width)||0,parseFloat(img?.style.height)||0,n.clientWidth,n.clientHeight);}const want=Math.min(maxTarget,px*dpr*1.15);return buckets.find(b=>b>=want)||maxTarget;}
 function report(){if(!current())return;const demand=[...states.values()].filter(seen),ready=demand.filter(s=>s.status==='ready').length,errors=demand.filter(s=>s.status==='error').length;onProgress({ready,total:demand.length,errors,all:states.size});}
 function paint(s){for(const node of s.nodes){if(!node.isConnected)continue;node.dataset.mediaState=s.status;const img=node.querySelector('img'),note=node.querySelector('[data-media-note]');if(s.status==='ready'&&s.url){if(img.getAttribute('src')!==s.url)img.src=s.url;note.textContent='';note.removeAttribute('title');}else{img.removeAttribute('src');note.textContent=s.status==='error'?'Prévia não carregou · toque aqui para tentar de novo'+(s.error?.message?' — '+s.error.message:''):s.status==='idle'?'Prévia ao rolar':'Carregando arte…';if(s.error)note.title=s.error.message||String(s.error);}}report();}
 function request(s,{force=false,upgrade=false}={}){if(!current()||s.busy)return;if(s.status==='ready'&&!upgrade)return;if(s.status==='error'&&!force)return;s.busy=true;s.force=force;if(s.status!=='ready'){s.status='queued';paint(s);}queue.push(s);drain();}
 function release(r){if(r?.owned&&r.url)URL.revokeObjectURL(r.url);}
 function prune(){const cached=[...states.values()].filter(s=>s.url&&!seen(s)).sort((a,b)=>a.last-b.last);let count=[...states.values()].filter(s=>s.url).length;for(const s of cached){if(count<=cacheLimit)break;release(s);s.url=null;s.owned=false;s.px=0;s.full=false;s.status='idle';paint(s);count--;}}
 function upgrades(){for(const s of states.values())if(s.status==='ready'&&!s.full&&!s.busy&&!(s.noUpgradeUntil>Date.now())&&seen(s)&&need(s)>s.px*1.2)request(s,{upgrade:true});}
 async function load(s){
  const upgrade=s.status==='ready';if(!upgrade){s.status='loading';paint(s);}
  let error;
  for(let attempt=0;attempt<3&&current();attempt++){
   try{
    if(attempt)await sleep(1200*attempt,controller.signal);
    const candidates=await resolveSource(s.item,{force:s.force||attempt>0,signal:controller.signal});if(!current())return;
    const all=(Array.isArray(candidates)?candidates:[candidates]).filter(Boolean),list=upgrade?all.slice(-1):all,target=need(s);let result;
    // The last candidate is the exact print file; thumbnails come first only to show faster.
    for(const src of list){try{result=await makeFilmPreview(src,{doc,signal:controller.signal,target,reload:attempt>0});if(src!==list.at(-1))result.full=false;break;}catch(e){error=e;if(controller.signal.aborted)throw e;}}
    if(!result&&!upgrade&&!/não encontrado/.test(error?.message||'')){for(const src of [...list].reverse()){try{result=await probeDirect(src,{doc,signal:controller.signal});break;}catch(e){if(controller.signal.aborted)throw e;}}}
    if(!result)throw error||new Error('Arquivo de prévia indisponível.');
    if(!current()){release(result);return;}
    if(upgrade&&result.px<=s.px){release(result);s.full=true;return;}
    release(s);s.url=result.url;s.owned=result.owned;s.px=result.px;s.full=result.full;s.status='ready';s.error=null;s.auto=0;s.last=++epoch;paint(s);prune();return;
   }catch(e){error=e;if(controller.signal.aborted)return;if(/não encontrado/.test(e?.message||''))break;}
  }
  if(upgrade){s.noUpgradeUntil=Date.now()+30000;return;}
  if(!current())return;
  s.status='error';s.error=error;paint(s);
  // One more quiet try a few seconds later (connection hiccups, expired links).
  if(s.auto<2&&!/não encontrado/.test(error?.message||'')){s.auto++;sleep(6000*s.auto,controller.signal).then(()=>{if(current()&&s.status==='error'&&seen(s))request(s,{force:true});},()=>{});}
 }
 function drain(){if(!current())return;while(active<limit&&queue.length){let i=queue.findIndex(q=>q.status!=='ready');if(i<0)i=0;const s=queue.splice(i,1)[0];if(!seen(s)){s.busy=false;if(s.status==='queued'){s.status='idle';paint(s);}continue;}active++;load(s).finally(()=>{s.busy=false;active--;if(current()){report();upgrades();drain();}});}}
 const observer=win.IntersectionObserver?new win.IntersectionObserver(entries=>{for(const e of entries){const s=nodes.get(e.target);if(!s)continue;if(e.isIntersecting){visible.add(e.target);s.last=++epoch;request(s);}else visible.delete(e.target);}upgrades();report();prune();},{root:shell,rootMargin:'400px 200px'}):null;
 function sync(placements){const live=new Set(placements);for(const [node,s] of nodes)if(!live.has(node)){observer?.unobserve(node);visible.delete(node);s.nodes.delete(node);nodes.delete(node);}for(const node of placements){if(nodes.has(node))continue;const item=itemMap.get(node.dataset.itemId);if(!item)continue;const s=stateFor(item);nodes.set(node,s);s.nodes.add(node);
   node.querySelector('img').onerror=()=>{const st=nodes.get(node);if(st?.status==='ready'){release(st);st.url=null;st.owned=false;st.px=0;st.full=false;st.status='idle';paint(st);request(st,{force:true});}};
   node.addEventListener('click',()=>{const st=nodes.get(node);if(st?.status==='error'){st.auto=0;request(st,{force:true});}});
   paint(s);if(observer)observer.observe(node);else{visible.add(node);request(s);}}
  upgrades();report();}
 function retry(){for(const s of states.values())if(s.status==='error'&&seen(s)){s.auto=0;request(s,{force:true});}}
 function destroy(){if(!alive)return;alive=false;controller.abort();observer?.disconnect();queue.length=0;for(const s of states.values())release(s);states.clear();nodes.clear();visible.clear();}
 return {sync,retry,destroy};
}
