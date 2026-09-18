import {assetPixelDimensions,createStudioPreviewCache} from './studio-art-preview.js?v=2.17.3';
const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const STUDIO_ART_PAGE_SIZE=24;
export const STUDIO_ART_FIELDS='id,owner_id,workspace_id,project_id,folder_id,name,asset_type,processed_path,original_path,width,height,size_bytes,created_at,updated_at,metadata';
export function dateBound(value,nextDay=false){
  if(!value)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Informe uma data válida.');
  const [year,month,day]=value.split('-').map(Number),date=new Date(year,month-1,day);
  if(date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day)throw new Error('Informe uma data válida.');
  if(nextDay)date.setDate(date.getDate()+1);return date.toISOString();
}
export function buildStudioAssetQuery(supabase,owner,{page=0,name='',workspaceId='',from='',to='',sort='recent'}={},signal){
  if(!owner)throw new Error('Entre na sua conta para escolher artes.');
  if(from&&to&&from>to)throw new Error('A data inicial deve ser anterior à final.');
  let query=supabase.from('z19p_assets').select(STUDIO_ART_FIELDS).eq('owner_id',owner).eq('asset_type','arte');
  if(workspaceId)query=query.eq('workspace_id',workspaceId);
  if(name.trim())query=query.ilike('name',`%${name.trim().replace(/[\\%_]/g,'\\$&')}%`);
  if(from)query=query.gte('created_at',dateBound(from));if(to)query=query.lt('created_at',dateBound(to,true));
  query=query.order(sort==='name'?'name':'created_at',{ascending:sort!=='recent'}).order('id',{ascending:true}).range(page*STUDIO_ART_PAGE_SIZE,page*STUDIO_ART_PAGE_SIZE+STUDIO_ART_PAGE_SIZE);
  return signal&&query.abortSignal?query.abortSignal(signal):query;
}
export async function openStudioArtPicker(ctx,{signal,maxSelection=40,previewCache,onChoose}={}){
  if(signal?.aborted)return;
  if(!document.querySelector('link[data-studio-picker-css]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./studio-art-picker.css?v=2.17.3',import.meta.url).href;link.dataset.studioPickerCss='';document.head.append(link);}
  const owner=ctx.accountOwnerId(),controller=new AbortController(),cache=previewCache||createStudioPreviewCache(ctx,{signal:controller.signal}),chosen=new Map(),workspaces=new Map(),previous=document.activeElement,oldOverflow=document.body.style.overflow;
  const modal=document.createElement('div');modal.className='garment-library-backdrop studio-art-picker-backdrop';
  modal.innerHTML=`<section class="studio-art-picker garment-library" role="dialog" aria-modal="true" aria-labelledby="studio-picker-title"><header><div><span class="studio-eyebrow">BIBLIOTECA / SUA CAMISETA</span><h2 id="studio-picker-title">Escolha as próximas estampas</h2><p>Selecione várias artes, inclusive de empresas diferentes.</p></div><button class="studio-close" aria-label="Fechar seleção de artes">×</button></header><div class="sap-filters"><label>Empresa ou cliente<input type="search" data-company-search placeholder="Buscar empresa ou cliente" autocomplete="off"></label><label>Escolher empresa<select data-company><option value="">Todas as empresas e bibliotecas</option></select></label><label class="sap-name">Nome da arte<input type="search" data-name placeholder="Ex.: logo, frente, patrocínio"></label><label>De<input type="date" data-from></label><label>Até<input type="date" data-to></label><label>Ordem<select data-sort><option value="recent">Mais recentes</option><option value="oldest">Mais antigas</option><option value="name">Nome A–Z</option></select></label></div><p class="sap-company-status" role="status"></p><div class="sap-scroll"><div class="garment-library-grid sap-grid" aria-busy="true"></div></div><div class="sap-pagination"><button class="studio-secondary" data-prev disabled>← Anterior</button><span data-page>Página 1</span><button class="studio-secondary" data-next disabled>Próxima →</button></div><footer class="garment-library-footer"><div><strong data-selection>0 selecionadas</strong><p class="studio-note">A seleção permanece ao filtrar. Prévias leves; originais preservados na exportação.</p><button class="sap-clear" data-clear disabled>Limpar seleção</button><p class="sap-status" role="status" aria-live="polite"></p></div><button class="studio-primary" data-add-chosen disabled>Escolha as artes</button></footer></section>`;
  document.body.append(modal);document.body.style.overflow='hidden';const find=s=>modal.querySelector(s),grid=find('.sap-grid'),status=find('.sap-status'),add=find('[data-add-chosen]');
  let closed=false,busy=false,page=0,hasNext=false,records=[],pageController=null,companyController=null,observer=null,filterTimer=null,companyTimer=null,generation=0;
  let resolveDone;const done=new Promise(resolve=>resolveDone=resolve);
  const live=()=>!closed&&!controller.signal.aborted&&ctx.accountOwnerId()===owner;
  const close=()=>{if(closed)return;closed=true;controller.abort();pageController?.abort();companyController?.abort();observer?.disconnect();clearTimeout(filterTimer);clearTimeout(companyTimer);signal?.removeEventListener('abort',close);window.removeEventListener('z19:account-changing',close);if(!previewCache)cache.dispose();modal.remove();document.body.style.overflow=oldOverflow;if(previous?.isConnected)previous.focus();resolveDone();};
  signal?.addEventListener('abort',close,{once:true});window.addEventListener('z19:account-changing',close);find('.studio-close').onclick=close;modal.onclick=e=>{if(e.target===modal)close();};
  modal.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}if(e.key==='Tab'){const controls=[...modal.querySelectorAll('button,input,select')].filter(node=>!node.disabled&&node.getClientRects().length),first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
  function sync(){
    find('[data-selection]').textContent=`${chosen.size} selecionada(s) · limite ${maxSelection}`;add.disabled=busy||!chosen.size;add.textContent=busy?'Adicionando…':chosen.size?`Adicionar ${chosen.size} à vista atual`:'Escolha as artes';find('[data-clear]').disabled=busy||!chosen.size;
    modal.querySelectorAll('.sap-filters input,.sap-filters select').forEach(input=>input.disabled=busy);find('[data-prev]').disabled=busy||page===0;find('[data-next]').disabled=busy||!hasNext;
    grid.querySelectorAll('[data-pick-art]').forEach(button=>{const selected=chosen.has(button.dataset.pickArt),asset=records.find(item=>item.id===button.dataset.pickArt),unavailable=!(asset?.processed_path||asset?.original_path);button.setAttribute('aria-pressed',String(selected));button.disabled=busy||unavailable;button.querySelector('[data-choice]').textContent=unavailable?'Arquivo indisponível':selected?'✓ Selecionada':'＋ Selecionar';});
  }
  function requestPreview(button,asset,currentSignal){
    if(button.dataset.requested)return;button.dataset.requested='true';
    cache.get(asset,{signal:currentSignal}).then(preview=>{if(!live()||currentSignal.aborted||!button.isConnected)return;const image=button.querySelector('img');image.src=preview.url;image.hidden=false;button.querySelector('.sap-preview-label').hidden=true;}).catch(error=>{if(!live()||currentSignal.aborted||!button.isConnected)return;button.querySelector('.sap-preview-label').textContent=error.name==='AbortError'?'Prévia cancelada':'Prévia indisponível';});
  }
  async function loadPage(){
    if(!live())return;pageController?.abort();observer?.disconnect();pageController=new AbortController();const ownSignal=pageController.signal,token=++generation;grid.setAttribute('aria-busy','true');grid.innerHTML='<p class="sap-empty">Buscando artes desta página…</p>';hasNext=false;sync();status.textContent='';
    try{
      const result=await buildStudioAssetQuery(ctx.supabase,owner,{page,name:find('[data-name]').value,workspaceId:find('[data-company]').value,from:find('[data-from]').value,to:find('[data-to]').value,sort:find('[data-sort]').value},ownSignal);
      if(!live()||ownSignal.aborted||token!==generation)return;if(result.error)throw result.error;
      hasNext=(result.data||[]).length>STUDIO_ART_PAGE_SIZE;records=(result.data||[]).slice(0,STUDIO_ART_PAGE_SIZE);
      const missingCompanies=[...new Set(records.map(asset=>asset.workspace_id).filter(id=>id&&!workspaces.has(id)))];
      if(missingCompanies.length){try{let q=ctx.supabase.from('z19p_workspaces').select('id,company_name,client_name').eq('owner_id',owner).in('id',missingCompanies);if(q.abortSignal)q=q.abortSignal(ownSignal);const companies=await q;if(!companies.error)for(const company of companies.data||[])workspaces.set(company.id,company);}catch{}}
      if(!live()||ownSignal.aborted||token!==generation)return;
      grid.innerHTML=records.map(asset=>{const company=workspaces.get(asset.workspace_id),date=asset.created_at?new Date(asset.created_at).toLocaleDateString('pt-BR'):'';return `<button class="sap-card" data-pick-art="${h(asset.id)}" aria-pressed="${chosen.has(asset.id)}"><span class="sap-preview"><img alt="" hidden decoding="async"><span class="sap-preview-label">Preparando prévia…</span><span data-choice>＋ Selecionar</span></span><b>${h(asset.name||'Arte sem nome')}</b><small>${h(company?.company_name||company?.client_name||(asset.workspace_id?'Empresa não disponível':'Biblioteca'))} ${date?'· '+h(date):''}</small></button>`;}).join('')||'<p class="sap-empty">Nenhuma arte encontrada com estes filtros.</p>';
      find('[data-page]').textContent=`Página ${page+1} · ${records.length} arte(s)`;
      const buttons=[...grid.querySelectorAll('[data-pick-art]')];
      if(typeof IntersectionObserver==='function'){observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){const button=entry.target;observer?.unobserve(button);requestPreview(button,records.find(asset=>asset.id===button.dataset.pickArt),ownSignal);}}),{root:find('.sap-scroll'),rootMargin:'80px'});buttons.forEach(button=>observer.observe(button));}else buttons.forEach(button=>requestPreview(button,records.find(asset=>asset.id===button.dataset.pickArt),ownSignal));
      sync();
    }catch(error){if(live()&&!ownSignal.aborted){grid.innerHTML='<p class="sap-empty">Não foi possível carregar esta página. Altere os filtros para tentar novamente.</p>';status.textContent=error.message||'Falha na consulta de artes.';}}
    finally{if(live()&&token===generation)grid.setAttribute('aria-busy','false');}
  }
  async function loadCompanies(){
    companyController?.abort();companyController=new AbortController();const ownSignal=companyController.signal,value=find('[data-company-search]').value.trim(),selected=find('[data-company]').value;
    const query=column=>{let q=ctx.supabase.from('z19p_workspaces').select('id,company_name,client_name').eq('owner_id',owner);if(value)q=q.ilike(column,`%${value.replace(/[\\%_]/g,'\\$&')}%`);q=q.order('company_name').range(0,49);return q.abortSignal?q.abortSignal(ownSignal):q;};
    try{const results=await Promise.all(value?[query('company_name'),query('client_name')]:[query('company_name')]);if(!live()||ownSignal.aborted)return;for(const result of results){if(result.error)throw result.error;for(const company of result.data||[])workspaces.set(company.id,company);}
      const matches=new Map(results.flatMap(result=>result.data||[]).map(company=>[company.id,company]));if(selected&&workspaces.has(selected))matches.set(selected,workspaces.get(selected));
      find('[data-company]').innerHTML='<option value="">Todas as empresas e bibliotecas</option>'+[...matches.values()].sort((a,b)=>(a.company_name||'').localeCompare(b.company_name||'','pt-BR')).map(company=>`<option value="${h(company.id)}">${h(company.company_name||'Sem nome')}${company.client_name?' · '+h(company.client_name):''}</option>`).join('');find('[data-company]').value=selected;
      find('.sap-company-status').textContent=value?`${matches.size} empresa(s) encontrada(s). Escolha uma acima para filtrar as artes.`:results[0].data?.length===50?'Mostrando até 50 empresas. Busque pelo nome para localizar outras.':'';
    }catch(error){if(live()&&!ownSignal.aborted)find('.sap-company-status').textContent='Empresas indisponíveis no momento. A busca por nome e data continua disponível.';}
  }
  grid.onclick=e=>{const button=e.target.closest('[data-pick-art]');if(!button||busy)return;const id=button.dataset.pickArt;if(chosen.has(id))chosen.delete(id);else{if(chosen.size>=maxSelection){status.textContent=`Você pode adicionar mais ${maxSelection} arte(s) nesta montagem.`;return;}chosen.set(id,records.find(asset=>asset.id===id));}status.textContent='';sync();};
  find('[data-clear]').onclick=()=>{chosen.clear();sync();};find('[data-prev]').onclick=()=>{page--;loadPage();};find('[data-next]').onclick=()=>{page++;loadPage();};
  const reload=()=>{page=0;loadPage();};find('[data-name]').oninput=()=>{clearTimeout(filterTimer);filterTimer=setTimeout(reload,250);};for(const selector of ['[data-company]','[data-from]','[data-to]','[data-sort]'])find(selector).onchange=reload;
  find('[data-company-search]').oninput=()=>{clearTimeout(companyTimer);companyTimer=setTimeout(loadCompanies,250);};
  add.onclick=async()=>{
    if(busy||!chosen.size||!live())return;busy=true;sync();let completed=0;const total=chosen.size;
    try{
      let query=ctx.supabase.from('z19p_asset_print_profiles').select('*').eq('owner_id',owner).in('asset_id',[...chosen.keys()]);if(query.abortSignal)query=query.abortSignal(controller.signal);const result=await query;if(!live())return;if(result.error)throw result.error;const profiles=new Map((result.data||[]).map(profile=>[profile.asset_id,profile]));
      for(const [id,asset] of [...chosen]){
        if(!live())return;status.textContent=`Adicionando ${completed+1} de ${total}…`;
        const dimensions=assetPixelDimensions(asset)||await cache.get(asset,{signal:controller.signal,pin:true});if(!live())return;
        await onChoose(asset,{profile:profiles.get(id)||null,dimensions,previewUrl:cache.peek(asset)?.url||null,signal:controller.signal});if(!live())return;chosen.delete(id);completed++;sync();
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      close();
    }catch(error){if(live())status.textContent=`${completed?`${completed} arte(s) adicionada(s). `:''}${error.message||'Não foi possível adicionar. Tente novamente.'}`;}
    finally{busy=false;if(live())sync();}
  };
  find('[data-name]').focus();loadCompanies();loadPage();await done;
}
