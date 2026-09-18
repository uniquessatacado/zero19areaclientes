import {sanitizeFilmDraft,FILM_DRAFT_MAX_BYTES} from './film-draft.js?v=2.17.6';
export const NAMED_FILM_DRAFT_KIND='named_film_draft_v1';
export function checkedNamedDraft(input,ownerId){
  if(!input||!Array.isArray(input.items))throw new Error('Montagem inválida.');
  const {data,warnings}=sanitizeFilmDraft({version:1,ownerId:String(ownerId),savedAt:input.savedAt||new Date().toISOString(),items:input.items,settings:input.settings,layout:input.layout||null});
  if(data.items.length!==input.items.length)throw new Error('O rascunho contém itens inválidos. Nenhuma montagem foi substituída.');
  if(new TextEncoder().encode(JSON.stringify(data)).length>FILM_DRAFT_MAX_BYTES)throw new Error('O rascunho ultrapassa 8 MB. A montagem atual foi preservada.');
  return {data,warnings};
}

/** Independent immutable snapshots. Existing single autosave/CAS remains intact.
 * Reuses private team-scoped print jobs; no schema or RLS change is needed. */
export function createSavedFilmDrafts({supabase,owner,user}){
  const account=String(owner()||''),actor=String(user()||'');
  const guard=()=>{if(!account||!actor||account!==String(owner()||'')||actor!==String(user()||''))throw new Error('A conta mudou. Reabra o filme.');};
  const base=()=>supabase.from('z19p_print_jobs').select('id,name,updated_at,film_width_cm,calculated_length_cm').eq('owner_id',account).eq('created_by',actor).eq('settings_snapshot->>kind',NAMED_FILM_DRAFT_KIND);
  return {
    async list(offset=0){guard();const result=await base().order('updated_at',{ascending:false}).order('id').range(offset,offset+49);guard();if(result.error)throw result.error;return {rows:result.data||[],more:(result.data||[]).length===50};},
    async save(input,title,widthCm,mediaId=null){
      guard();const name=String(title||'').trim();if(!name||name.length>120)throw new Error('Dê um nome ao rascunho (até 120 caracteres).');
      const {data}=checkedNamedDraft(input,account);if(!data.items.length)throw new Error('Adicione itens antes de salvar um rascunho.');
      const width=Number(widthCm);if(!(width>0&&Number.isFinite(width)))throw new Error('Escolha a largura do filme antes de salvar.');
      const id=crypto.randomUUID(),payload={id,owner_id:account,created_by:actor,updated_by:actor,name,project_id:null,media_profile_id:mediaId,
        film_width_cm:width,nesting_mode:data.settings.mode,gap_mm:data.settings.gapMm,status:'draft',calculated_length_cm:data.layout?Number(data.layout.lengthMm)/10:null,
        settings_snapshot:{kind:NAMED_FILM_DRAFT_KIND,format_version:1,renderer_version:'2.17.6',commit_state:'complete',draft:data}};
      const result=await supabase.from('z19p_print_jobs').insert(payload).select('id,name').single();guard();if(result.error)throw result.error;
      if(result.data?.id!==id)throw new Error('Não foi possível confirmar o rascunho. Sua montagem atual foi mantida.');
      return result.data;
    },
    async load(id){
      guard();const result=await supabase.from('z19p_print_jobs').select('*').eq('id',id).eq('owner_id',account).eq('created_by',actor).eq('settings_snapshot->>kind',NAMED_FILM_DRAFT_KIND).single();guard();if(result.error)throw result.error;
      const row=result.data;if(row?.owner_id!==account||row?.created_by!==actor||row.settings_snapshot?.kind!==NAMED_FILM_DRAFT_KIND||row.settings_snapshot?.draft?.ownerId!==account)throw new Error('Rascunho não disponível para este usuário.');
      return {...checkedNamedDraft(row.settings_snapshot.draft,account),name:row.name};
    }
  };
}

export function filmNameProof(items){
  const groups=new Map();
  for(const item of items||[]){if(item.type!=='team_customization'||item.vectorSource)continue;
    const key=item.compositionGroupId||item.localId;
    if(!groups.has(key))groups.set(key,{name:'',digits:[],quantity:item.quantity||1});
    const entry=groups.get(key);if(item.name)entry.name=String(item.name);
    if(item.number)entry.digits.push(String(item.number));
  }
  return [...groups.values()].map(row=>({...row,number:row.digits.join('')}));
}

/** Modal consumes callbacks from the actual film controller, not DOM-scraped
 * names. No deletion action; loading first preserves any nonempty open film. */
export function openSavedFilmDialog({mode='save',snapshot,store,saveCurrent,switchTo,escapeHTML:h}){
  if(document.querySelector('[data-saved-film-dialog]'))return;
  const root=document.createElement('div'),focus=document.activeElement;let busy=false,offset=0;
  root.className='modal-backdrop';root.dataset.savedFilmDialog='';
  const label=mode==='load'?'Abrir rascunho':mode==='new'?'Salvar e iniciar outro filme':'Salvar rascunho';
  root.innerHTML=`<div class="modal wide" role="dialog" aria-modal="true"><div class="modal-head"><h2>${label}</h2><button class="btn ghost small" data-close aria-label="Fechar">×</button></div><p>${mode==='load'?'Sua montagem atual será guardada separadamente antes de abrir outra.':mode==='new'?'O filme atual será guardado no banco antes de abrir um filme vazio.':'Salva uma cópia independente, mesmo sem calcular o encaixe.'}</p>${mode==='load'?'<div data-list></div><button class="btn" data-more hidden>Carregar mais</button>':'<label class="field">Nome do rascunho<input maxlength="120" data-title placeholder="Ex.: Camisas do time — continuar depois"></label>'}<p class="error-text" role="alert" data-error></p><div class="modal-footer"><button class="btn" data-close>Cancelar</button>${mode==='load'?'':'<button class="btn primary" data-confirm>'+label+'</button>'}</div></div>`;
  const error=root.querySelector('[data-error]'),close=()=>{if(busy)return;root.remove();focus?.isConnected&&focus.focus();};
  const setBusy=value=>{busy=value;root.querySelectorAll('button,input').forEach(b=>b.disabled=value);};
  const run=async action=>{if(busy)return;setBusy(true);error.textContent='';try{await action();busy=false;close();}catch(e){setBusy(false);error.textContent=e.message||String(e);}};
  root.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
  root.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const controls=[...root.querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(c=>!c.hidden);const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
  if(mode!=='load'){
    root.querySelector('[data-title]').value='Filme '+new Date().toLocaleString('pt-BR');
    root.querySelector('[data-confirm]').onclick=()=>run(async()=>{const title=root.querySelector('[data-title]').value;await saveCurrent(title);if(mode==='new')await switchTo(null);});
  }else{
    const list=root.querySelector('[data-list]'),more=root.querySelector('[data-more]');
    const load=async()=>{try{const result=await store.list(offset);for(const row of result.rows){const b=document.createElement('button');b.className='saved-film-job';b.style.width='100%';b.innerHTML='<b>'+h(row.name)+'</b><span>'+h(new Date(row.updated_at).toLocaleString('pt-BR'))+' · '+Number(row.film_width_cm)+' cm</span>';b.onclick=()=>run(async()=>{const target=await store.load(row.id);if(snapshot().items.length)await saveCurrent('Antes de abrir '+row.name+' — '+new Date().toLocaleString('pt-BR'));await switchTo(target.data);});list.appendChild(b);}offset+=result.rows.length;more.hidden=!result.more;if(!offset)list.textContent='Nenhum rascunho salvo ainda.';}catch(e){error.textContent=e.message||String(e);}};
    more.onclick=load;void load();
  }
  document.body.appendChild(root);(root.querySelector('input')||root.querySelector('[data-close]'))?.focus();
}
