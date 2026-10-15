// 2.17.78 (15/10, dono: "na lateral as miniaturas não estão aparecendo, deveriam aparecer rapidamente").
// Miniaturas da lista "Artes adicionadas" do filme. Só visualização: arquivo de impressão, medidas,
// encaixe e exportação não mudam.
// Antes: desde a abertura rápida (2.17.75) as artes privadas (site/checkout) só eram registradas, sem
// link; a lista desenhava "ARTE" e nunca pedia o link. Depois de 15 min o link vencia e voltava a "ARTE".
// Agora: cada arte pede o próprio link (uma arte com problema não esconde as outras), usa a miniatura
// leve quando existe, reduz para o tamanho da lista e a imagem pequena fica guardada nesta página.
import {makeFilmPreview} from './film-media-v74.js?v=2.17.77';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const stateStyle='display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:3px;text-align:center;font-size:9px;line-height:1.15;font-weight:800;letter-spacing:.02em;color:#475569;background:rgba(255,255,255,.72)';
export function createFilmListThumbs({resolveSource,isCurrent=()=>true,items=()=>[],doc=typeof document==='undefined'?null:document,concurrency}={}){
 const win=doc?.defaultView||globalThis,coarse=!!win.matchMedia?.('(pointer:coarse)').matches;
 const limit=concurrency||(coarse?3:4),target=Math.round(64*Math.min(3,Math.max(1,win.devicePixelRatio||1)));
 const states=new Map(),queue=[];let active=0,alive=true,root=null,visibleObserver=null,changeObserver=null,scanTimer=0;
 const keyOf=item=>`${item.storageBucket||item.storage_bucket||'z19p-assets'}:${item.path}`;
 const isAsset=item=>item?.type==='asset'&&Boolean(item.path);
 const current=()=>{if(alive&&!isCurrent())destroy();return alive;};
 const itemById=id=>(items()||[]).find(item=>item.localId===id);
 function waiting(item,state){
  const error=state?.status==='error';
  return `<span data-film-thumb="${esc(item.localId)}" data-thumb-state="${error?'error':'loading'}" style="${stateStyle}"${error?` title="${esc(state.message)}"`:''}>${error?'Sem prévia · toque':'Carregando…'}</span>`;
 }
 // HTML imediato da miniatura (a lista é redesenhada várias vezes; nunca perde o que já carregou).
 function markup(item){
  if(item?.previewDataUrl)return `<img src="${esc(item.previewDataUrl)}" alt="" decoding="async">`;
  if(!isAsset(item))return `<span>${item?.type==='team_customization'?'ESCRITA':'ARTE'}</span>`;
  const state=states.get(keyOf(item));
  return state?.status==='ready'?`<img src="${esc(state.url)}" alt="" decoding="async">`:waiting(item,state);
 }
 function paint(state){
  if(!root?.isConnected)return;
  for(const node of root.querySelectorAll('[data-film-thumb]')){
   const item=itemById(node.dataset.filmThumb);if(!item||!isAsset(item)||keyOf(item)!==state.key)continue;
   if(state.status==='ready'){const img=doc.createElement('img');img.alt='';img.decoding='async';img.src=state.url;node.replaceWith(img);}
   else node.outerHTML=waiting(item,state);
  }
 }
 function request(item,{front=false,force=false}={}){
  if(!current()||!isAsset(item))return;
  const key=keyOf(item);let state=states.get(key);
  if(!state){state={key,item,status:'idle',url:'',message:'',tries:0};states.set(key,state);}
  if(state.status==='ready'||state.status==='loading'||state.status==='queued')return;
  if(state.status==='error'&&!force)return;
  state.item=item;state.status='queued';const at=queue.indexOf(state);if(at>=0)queue.splice(at,1);
  front?queue.unshift(state):queue.push(state);drain();
 }
 async function load(state){
  state.status='loading';state.tries++;
  try{
   const sources=await resolveSource(state.item,{force:state.tries>1});if(!current())return;
   const list=(Array.isArray(sources)?sources:[sources]).filter(Boolean);let result,error;
   // A miniatura leve vem primeiro; o arquivo de impressão é a última opção.
   for(const src of list){try{result=await makeFilmPreview(src,{doc,target});break;}catch(failure){error=failure;}}
   if(!result)throw error||new Error('Prévia indisponível.');
   if(!current()){if(result.owned)URL.revokeObjectURL(result.url);return;}
   state.url=result.url;state.owned=result.owned;state.status='ready';state.message='';
  }catch(error){
   if(!current())return;
   state.status='error';state.message=error?.message||'Prévia indisponível.';
   // Uma nova tentativa sozinha (internet oscilando, link vencido); arquivo inexistente não insiste.
   if(state.tries<2&&!/não encontrado/i.test(state.message))setTimeout(()=>{if(current()&&state.status==='error')request(state.item,{force:true});},4000);
  }
  paint(state);
 }
 function drain(){
  while(current()&&active<limit&&queue.length){
   const state=queue.shift();if(state.status!=='queued')continue;active++;
   load(state).finally(()=>{active--;drain();});
  }
 }
 function scan(){
  scanTimer=0;if(!current()||!root?.isConnected)return;
  for(const node of root.querySelectorAll('[data-film-thumb]')){
   const item=itemById(node.dataset.filmThumb);if(!item)continue;
   const state=isAsset(item)?states.get(keyOf(item)):null;
   if(state?.status==='ready'||state?.status==='error'&&node.dataset.thumbState!=='error'){paint(state);continue;}
   if(!node.dataset.thumbWired){node.dataset.thumbWired='1';node.addEventListener('click',()=>{const latest=itemById(node.dataset.filmThumb),st=latest&&states.get(keyOf(latest));if(st?.status==='error'){st.tries=0;request(latest,{front:true,force:true});}});}
   if(visibleObserver)visibleObserver.observe(node);
   // Computador: carrega a lista toda aos poucos (as visíveis passam na frente). Celular: só o que aparece.
   if(!visibleObserver||!coarse)request(item);
  }
 }
 function attach(element){
  if(!current()||!element)return;
  if(element!==root){
   visibleObserver?.disconnect();changeObserver?.disconnect();root=element;
   visibleObserver=win.IntersectionObserver?new win.IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;visibleObserver.unobserve(entry.target);const item=itemById(entry.target.dataset.filmThumb);if(item)request(item,{front:true});}},{rootMargin:'240px 0px'}):null;
   changeObserver=win.MutationObserver?new win.MutationObserver(()=>{if(!scanTimer)scanTimer=setTimeout(scan,30);}):null;
   changeObserver?.observe(root,{childList:true,subtree:true});
  }
  scan();
 }
 function destroy(){
  if(!alive)return;alive=false;clearTimeout(scanTimer);visibleObserver?.disconnect();changeObserver?.disconnect();queue.length=0;
  for(const state of states.values())if(state.owned&&state.url)URL.revokeObjectURL(state.url);
  states.clear();root=null;
 }
 return {markup,attach,destroy,states};
}
