// Opening is independent of images, font rendering and the print catalogue.
// No persistence writes, cache deletion or changes to the saved layout.
export async function loadFilmOpening({restore,readMedia,isCurrent=()=>true,onStage=()=>{}}){
  const check=()=>{if(!isCurrent())throw new DOMException('A página mudou.','AbortError');};
  check();onStage('Carregando a montagem salva…');
  const mediaTask=Promise.resolve().then(readMedia);
  const mediaResult=mediaTask.then(data=>({data}),error=>({error}));
  await restore();check();onStage('Abrindo as posições e medidas salvas…');
  const result=await mediaResult;check();if(result.error)throw result.error;
  if(!Array.isArray(result.data)||!result.data.length)throw new Error('Não foi possível carregar o perfil do filme. Sua montagem salva não foi apagada.');
  return result.data;
}
export function lazyFilmCatalogue(load,{isCurrent=()=>true,onState=()=>{}}={}){
  let task=null,ready=false;
  return async()=>{
    if(!isCurrent())throw new DOMException('A página mudou.','AbortError');
    if(ready)return;
    if(task)return task;
    onState('Carregando catálogo para adicionar artes…');
    task=Promise.resolve().then(load).then(()=>{
      if(!isCurrent())throw new DOMException('A página mudou.','AbortError');
      ready=true;onState('');
    }).catch(error=>{if(isCurrent())onState('O filme continua aberto. '+(error.message||'Tente adicionar novamente.'));throw error;}).finally(()=>{task=null;});
    return task;
  };
}
export function showFilmOpeningFailure({app,isCurrent,error,retry,back}){
  if(!isCurrent())return;
  const boot=app.querySelector('.film-boot');if(!boot)return;
  boot.innerHTML='<div style="width:100%;max-width:520px"><b>Não foi possível abrir o filme agora</b><p data-film-open-error role="alert"></p><p>A montagem salva foi preservada. Nenhum filme foi esvaziado.</p><button class="btn primary" data-film-open-retry>Tentar abrir novamente</button><button class="btn" data-film-open-back>Voltar para produção</button></div>';
  boot.querySelector('[data-film-open-error]').textContent=error?.message||'Confira a conexão.';
  boot.querySelector('[data-film-open-retry]').onclick=()=>void retry();
  boot.querySelector('[data-film-open-back]').onclick=back;
}
