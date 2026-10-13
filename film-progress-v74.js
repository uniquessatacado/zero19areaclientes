// Progress reports completed work, not a clock-based invented percentage.
export function createFilmProgress(panel,{onCancel=()=>{}}={}){
 panel.querySelector('[data-film-calculation-progress]')?.remove();
 const doc=panel.ownerDocument,box=doc.createElement('section');box.dataset.filmCalculationProgress='';box.className='film-calculation-progress';
 box.innerHTML='<div class="film-progress-heading"><b data-title>Preparando filme</b><button type="button" class="btn small" data-stop>Interromper</button></div><progress aria-label="Progresso da etapa do filme"></progress><span data-detail role="status" aria-live="polite"></span>';
 panel.prepend(box);const bar=box.querySelector('progress'),title=box.querySelector('[data-title]'),detail=box.querySelector('[data-detail]'),stop=box.querySelector('[data-stop]');stop.onclick=()=>{stop.disabled=true;onCancel();};
 function update(label,done=null,total=null,note=''){
  title.textContent=label;
  if(Number.isFinite(done)&&Number.isFinite(total)&&total>0){bar.max=total;bar.value=Math.min(total,Math.max(0,done));detail.textContent=`${Math.min(total,done)} / ${total}${note?' · '+note:''}`;}
  else{bar.removeAttribute('value');detail.textContent=note||'Trabalhando nesta etapa…';}
 }
 function finish(note,error=false){title.textContent=error?'Montagem preservada':'Filme atualizado';bar.max=1;bar.value=1;detail.textContent=note;box.dataset.error=String(error);stop.hidden=true;}
 return {update,finish,element:box};
}
export const yieldFilmUI=()=>new Promise(resolve=>setTimeout(resolve,0));
export function runFilmWorker({url,items,options,signal,isCurrent=()=>true,onProgress=()=>{},fallback,timeoutMs=40000}){
 if(typeof Worker==='undefined')return Promise.resolve().then(()=>fallback());
 return new Promise((resolve,reject)=>{
  const worker=new Worker(url,{type:'module'});let checkpoint=null,finished=false;
  const cleanup=()=>{clearTimeout(timer);clearInterval(check);signal?.removeEventListener('abort',abort);worker.terminate();};
  const end=(fn,value)=>{if(finished)return;finished=true;cleanup();fn(value);};
  const abort=()=>end(reject,signal?.reason||new DOMException('Cálculo interrompido. As artes foram preservadas.','AbortError'));
  const timer=setTimeout(()=>checkpoint?end(resolve,{...checkpoint,nestingSearchLimited:true,nestingSearchWarning:'Limite de tempo da busca adicional. Mantido o melhor encaixe completo já validado.'}):end(reject,new Error('O cálculo excedeu o tempo seguro. As artes foram preservadas.')),timeoutMs);
  const check=setInterval(()=>{if(!isCurrent())abort();},150);
  signal?.addEventListener('abort',abort,{once:true});
  worker.onmessage=({data})=>{if(!isCurrent())return abort();if(data?.type==='progress'){onProgress(data);return;}if(data?.type==='checkpoint'){checkpoint=data.result;onProgress({label:'Melhor encaixe validado',note:(checkpoint.lengthMm/1000).toFixed(3)+' m · buscando alternativas'});return;}if(data?.ok)end(resolve,data.result);else end(reject,new Error(data?.error||'Falha ao calcular o filme.'));};
  worker.onerror=event=>end(reject,new Error(event.message||'Não foi possível iniciar o cálculo.'));
  try{worker.postMessage({items,options});}catch(error){end(reject,error);}
  if(signal?.aborted)abort();
 });
}
