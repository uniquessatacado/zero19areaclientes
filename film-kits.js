// Kits de camisa do filme (31/10, dono: "permita montar kit de personalização de uma camisa específica, escolho em artes todas
// as artes que vão na camisa, salvo o kit com nome e quando quiser adiciono no filme, já vai tudo certo; no filme só diminuo e
// aumento a quantidade de kits"). O kit é só uma lista salva de artes: não cria pedido, fila, venda nem estoque e não muda o
// cadastro das artes. Fica em z19p_print_jobs (kind film_kit_v1), como os rascunhos: sem tabela nova e visível para a equipe.
import {assetPreviewPath} from './asset-preview.js?v=2.17.9';
import {filmItemFromSelection} from './film-picker.js?v=2.17.5';

export const FILM_KIT_KIND='film_kit_v1';
const NAME_MAX=80,KITS_MAX=200,COUNT_MAX=10000;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cm=value=>Number(value).toLocaleString('pt-BR',{maximumFractionDigits:2});
const uuid=()=>globalThis.crypto?.randomUUID?.()||`kit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const whole=(value,fallback=1)=>{const number=Math.floor(Number(value));return Number.isSafeInteger(number)&&number>=1?number:fallback};
const plural=(value,one,many)=>`${value} ${value===1?one:many}`;

/** Confere o kit antes de salvar: nome e artes com medida e quantidade por camisa. */
export function checkedKit(name,rows){
  const title=String(name||'').trim();
  if(!title)throw new Error('Dê um nome ao kit.');
  if(title.length>NAME_MAX)throw new Error(`O nome do kit pode ter até ${NAME_MAX} letras.`);
  if(!Array.isArray(rows)||!rows.length)throw new Error('Escolha pelo menos uma arte para o kit.');
  const seen=new Set(),clean=rows.map(row=>{
    const assetId=String(row?.assetId||''),widthCm=Number(row?.widthCm),heightCm=Number(row?.heightCm),perKit=Number(row?.perKit);
    if(!assetId||seen.has(assetId))throw new Error('Há uma arte repetida no kit. Use a quantidade por camisa.');
    if(!(widthCm>0&&heightCm>0)||!Number.isFinite(widthCm+heightCm))throw new Error('Confira as medidas das artes do kit.');
    if(!Number.isSafeInteger(perKit)||perKit<1)throw new Error('A quantidade por camisa deve ser um número inteiro positivo.');
    seen.add(assetId);return {assetId,widthCm,heightCm,perKit,name:String(row?.name||'').slice(0,160)};
  });
  return {name:title,rows:clean};
}

/** Transforma o kit em itens do filme. Arte que saiu da biblioteca nunca some calada: volta em `missing`. */
export function kitFilmItems(kit,entries,count=1,groupId=uuid()){
  const kits=whole(count),items=[],missing=[];
  for(const row of kit.rows||[]){
    const entry=entries.get(row.assetId);
    if(!entry){missing.push(row.name||'Arte sem nome');continue;}
    const sameSize=Math.abs(row.widthCm-entry.widthCm)<=.0001,heightCm=sameSize?entry.heightCm:row.widthCm/entry.aspect;
    const item=filmItemFromSelection(entry,{widthCm:sameSize?entry.widthCm:row.widthCm,heightCm,quantity:row.perKit*kits});
    items.push({...item,label:`Kit ${kit.name} • ${entry.asset.name||'Arte sem nome'}`,kit:{groupId,kitId:kit.id,name:kit.name,perKit:row.perKit}});
  }
  return {items,missing};
}

/** Kits que estão no filme. A quantidade vem das próprias artes: Delete numa cópia não deixa o número mentindo. */
export function filmKitGroups(items){
  const groups=new Map();
  for(const item of items||[]){
    if(!item?.kit?.groupId)continue;
    const group=groups.get(item.kit.groupId)||{groupId:item.kit.groupId,kitId:item.kit.kitId,name:item.kit.name,count:0,prints:0,items:[]};
    group.items.push(item);group.prints+=Number(item.quantity)||0;
    group.count=Math.max(group.count,Math.ceil((Number(item.quantity)||0)/(Number(item.kit.perKit)||1)));
    groups.set(item.kit.groupId,group);
  }
  return [...groups.values()];
}

/** Aumenta ou diminui o kit inteiro: toda arte fica com quantidade por camisa × kits. */
export function setFilmKitCount(items,groupId,count){
  const kits=Math.min(COUNT_MAX,whole(count));
  for(const item of items)if(item?.kit?.groupId===groupId)item.quantity=item.kit.perKit*kits;
  return kits;
}

/** Colocar um kit que já está no filme só aumenta a quantidade dele, sem repetir as artes. */
export function addKitToFilm(items,kit,entries,count=1){
  const kits=whole(count),group=filmKitGroups(items).find(row=>row.kitId===kit.id);
  if(group)return {items:[],missing:[],count:setFilmKitCount(items,group.groupId,group.count+kits)};
  const result=kitFilmItems(kit,entries,kits);
  if(result.missing.length)throw new Error(`Este kit tem arte que não está mais liberada: ${result.missing.join(', ')}. Edite o kit.`);
  items.push(...result.items);
  return {...result,count:kits};
}

export function filmKitBarsHTML(items){
  return filmKitGroups(items).map(group=>`<section class="fk-bar" aria-label="Kit ${esc(group.name)}"><div class="fk-bar-copy"><b>🧩 Kit ${esc(group.name)}</b><small>${plural(group.items.length,'arte','artes')} por camisa · ${plural(group.prints,'impressão','impressões')} no filme</small></div><div class="fk-qty"><button type="button" class="fk-step" data-kit-step="-1" data-kit-group="${esc(group.groupId)}" aria-label="Um kit a menos" ${group.count<=1?'disabled':''}>−</button><input data-kit-count data-kit-group="${esc(group.groupId)}" type="number" inputmode="numeric" min="1" step="1" value="${group.count}" aria-label="Quantidade de kits ${esc(group.name)}"><button type="button" class="fk-step" data-kit-step="1" data-kit-group="${esc(group.groupId)}" aria-label="Um kit a mais">+</button></div><span class="fk-bar-unit">${group.count===1?'kit':'kits'}</span><button type="button" class="fk-link" data-kit-remove data-kit-group="${esc(group.groupId)}">Tirar kit</button></section>`).join('');
}

export function createFilmKitStore({supabase,owner,user}){
  const account=String(owner()||''),actor=String(user()||'');
  const guard=()=>{if(!account||!actor||account!==String(owner()||''))throw new Error('A conta mudou. Reabra o filme.');};
  const table=()=>supabase.from('z19p_print_jobs');
  const fromRow=row=>({id:row.id,name:row.name,rows:Array.isArray(row.settings_snapshot?.kit?.rows)?row.settings_snapshot.kit.rows:[]});
  const snapshot=kit=>({kind:FILM_KIT_KIND,format_version:1,commit_state:'complete',kit:{rows:kit.rows}});
  return {
    async list(){guard();const result=await table().select('id,name,settings_snapshot').eq('owner_id',account).eq('settings_snapshot->>kind',FILM_KIT_KIND).order('name').range(0,KITS_MAX-1);guard();if(result.error)throw result.error;return (result.data||[]).map(fromRow);},
    async save(id,name,rows){
      guard();const kit=checkedKit(name,rows),now=new Date().toISOString();
      if(id){const result=await table().update({name:kit.name,updated_by:actor,updated_at:now,settings_snapshot:snapshot(kit)}).eq('id',id).eq('owner_id',account).eq('settings_snapshot->>kind',FILM_KIT_KIND).select('id,name,settings_snapshot').maybeSingle();guard();if(result.error)throw result.error;if(!result.data)throw new Error('Este kit não existe mais. Atualize a lista.');return fromRow(result.data);}
      const newId=uuid(),result=await table().insert({id:newId,owner_id:account,created_by:actor,updated_by:actor,name:kit.name,project_id:null,media_profile_id:null,film_width_cm:60,status:'draft',settings_snapshot:snapshot(kit)}).select('id,name,settings_snapshot').single();
      guard();if(result.error)throw result.error;if(result.data?.id!==newId)throw new Error('Não foi possível confirmar o kit.');return fromRow(result.data);
    },
    async remove(id){guard();const result=await table().delete().eq('id',id).eq('owner_id',account).eq('settings_snapshot->>kind',FILM_KIT_KIND).select('id').maybeSingle();guard();if(result.error)throw result.error;if(!result.data)throw new Error('Este kit não existe mais. Atualize a lista.');},
  };
}

/** Janela de kits. O filme só muda ao tocar em "Colocar no filme". */
export function openFilmKits({store,catalogue,previewUrl,publicUrl=path=>path,pickArts,addKit,toast}){
  const entries=new Map(catalogue.map(entry=>[entry.id,entry])),counts=new Map(),returnFocus=document.activeElement,overflow=document.body.style.overflow;
  let kits=[],view='list',draft=null,busy=false,closed=false,loading=true,loadError='',confirmDelete='',timer=0,picker=null;
  const root=document.createElement('div');root.className='fk-backdrop';
  root.innerHTML='<section class="fk-modal" role="dialog" aria-modal="true" aria-labelledby="fkTitle" tabindex="-1"><header class="fk-head"><div><span class="fk-eyebrow">FILME · KITS DE CAMISA</span><h2 id="fkTitle">Kits de camisa</h2><p>Todas as estampas de uma camisa juntas. Escolha quantos kits e coloque no filme.</p></div><button type="button" class="fk-close" data-action="close" aria-label="Fechar kits">×</button></header><div class="fk-body"></div><div class="fk-status" role="status" aria-live="polite"></div></section>';
  document.body.append(root);document.body.style.overflow='hidden';
  const body=root.querySelector('.fk-body'),title=root.querySelector('#fkTitle');
  const report=(message,tone='ok')=>{const status=root.querySelector('.fk-status');status.textContent=message;status.dataset.tone=tone;status.classList.add('is-visible');clearTimeout(timer);timer=setTimeout(()=>status.classList.remove('is-visible'),4000);};
  const image=(assetId,name)=>{const entry=entries.get(assetId);let url='';try{const path=entry?assetPreviewPath(entry.asset)||entry.path:'';url=path?previewUrl?.(path,entry.asset)||publicUrl(path):'';}catch{url='';}return url?`<img src="${esc(url)}" alt="${esc(name||'Arte')}" loading="lazy" decoding="async">`:'<span class="fk-noimage" aria-hidden="true">?</span>';};
  const rowName=row=>entries.get(row.assetId)?.asset?.name||row.name||'Arte sem nome';
  const missingRows=kit=>kit.rows.filter(row=>!entries.has(row.assetId));
  const countOf=kit=>whole(counts.get(kit.id));
  const kitCard=kit=>{
    const missing=missingRows(kit),sizes=kit.rows.map(row=>`${cm(row.widthCm)} × ${cm(row.heightCm)} cm${row.perKit>1?` (${row.perKit}×)`:''}`).join(' · '),count=countOf(kit);
    return `<article class="fk-card"><div class="fk-thumbs">${kit.rows.slice(0,4).map(row=>`<span>${image(row.assetId,rowName(row))}</span>`).join('')}</div><div class="fk-info"><b>${esc(kit.name)}</b><small>${plural(kit.rows.length,'arte','artes')} por camisa · ${esc(sizes)}</small>${missing.length?`<small class="fk-warn">Arte fora da biblioteca: ${esc(missing.map(rowName).join(', '))}. Edite o kit.</small>`:''}</div><div class="fk-controls"><div class="fk-qty"><button type="button" class="fk-step" data-action="minus" data-id="${esc(kit.id)}" aria-label="Um kit a menos" ${count<=1?'disabled':''}>−</button><input data-input="count" data-id="${esc(kit.id)}" type="number" inputmode="numeric" min="1" step="1" value="${count}" aria-label="Quantos kits de ${esc(kit.name)}"><button type="button" class="fk-step" data-action="plus" data-id="${esc(kit.id)}" aria-label="Um kit a mais">+</button></div><button type="button" class="fk-primary" data-action="add" data-id="${esc(kit.id)}" ${missing.length?'disabled':''}>Colocar no filme</button></div><div class="fk-links"><button type="button" class="fk-link" data-action="edit" data-id="${esc(kit.id)}">Editar</button><button type="button" class="fk-link fk-danger" data-action="delete" data-id="${esc(kit.id)}">${confirmDelete===kit.id?'Confirmar exclusão':'Excluir'}</button></div></article>`;
  };
  const listHTML=()=>`<button type="button" class="fk-new" data-action="new">＋ Novo kit</button>${loading?'<p class="fk-empty">Carregando kits…</p>':loadError?`<div class="fk-empty"><p>${esc(loadError)}</p><button type="button" class="fk-link" data-action="reload">Tentar de novo</button></div>`:kits.length?`<div class="fk-list">${kits.map(kitCard).join('')}</div>`:'<div class="fk-empty"><b>Nenhum kit ainda</b><p>Crie o primeiro: dê um nome e escolha todas as artes que vão na camisa.</p></div>'}`;
  const rowHTML=row=>`<article class="fk-row"><span class="fk-row-thumb">${image(row.assetId,rowName(row))}</span><div class="fk-info"><b>${esc(rowName(row))}</b><small>${cm(row.widthCm)} × ${cm(row.heightCm)} cm</small></div><label class="fk-row-qty">Por camisa<input data-input="per-kit" data-id="${esc(row.assetId)}" type="number" inputmode="numeric" min="1" step="1" value="${row.perKit}"></label><button type="button" class="fk-close" data-action="remove-row" data-id="${esc(row.assetId)}" aria-label="Tirar ${esc(rowName(row))} do kit">×</button></article>`;
  const formHTML=()=>`<label class="fk-field">Nome do kit<input data-input="name" maxlength="${NAME_MAX}" value="${esc(draft.name)}" placeholder="Ex.: Camisa Palmeiras frente e costas" autocomplete="off"></label><div class="fk-rows">${draft.rows.length?draft.rows.map(rowHTML).join(''):'<p class="fk-empty">Nenhuma arte ainda. Escolha as artes que vão nesta camisa.</p>'}</div><button type="button" class="fk-new" data-action="pick">＋ Escolher artes</button><div class="fk-footer"><button type="button" class="fk-link" data-action="back">Cancelar</button><button type="button" class="fk-primary" data-action="save" ${busy?'disabled':''}>${busy?'Salvando…':'Salvar kit'}</button></div>`;
  const render=()=>{title.textContent=view==='form'?(draft.id?'Editar kit':'Novo kit'):'Kits de camisa';body.innerHTML=view==='form'?formHTML():listHTML();};
  const load=async()=>{loading=true;loadError='';render();try{kits=await store.list();if(closed)return;}catch{if(closed)return;loadError='Não foi possível carregar os kits. Confira a internet e tente de novo.';}loading=false;render();};
  const close=()=>{if(closed||busy)return;closed=true;clearTimeout(timer);picker?.close?.(true);root.remove();document.removeEventListener('keydown',onKey);document.body.style.overflow=overflow;if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});};
  const onKey=event=>{if(event.key==='Escape'&&!document.querySelector('.film-picker-backdrop')){if(view==='form'){view='list';draft=null;render();}else close();}};
  const pick=()=>{picker=pickArts(items=>{for(const item of items){const row={assetId:item.sourceId,widthCm:item.widthCm,heightCm:item.heightCm,perKit:whole(item.quantity),name:String(item.label||'').split(' • ').pop()},index=draft.rows.findIndex(current=>current.assetId===row.assetId);if(index>=0)draft.rows[index]=row;else draft.rows.push(row);}picker=null;render();});};
  root.addEventListener('input',event=>{const input=event.target;if(input.dataset.input==='name')draft.name=input.value;if(input.dataset.input==='per-kit'){const row=draft.rows.find(item=>item.assetId===input.dataset.id);if(row)row.perKit=whole(input.value,row.perKit);}if(input.dataset.input==='count')counts.set(input.dataset.id,whole(input.value));});
  root.addEventListener('change',event=>{const input=event.target;if(input.dataset.input==='count'||input.dataset.input==='per-kit')render();});
  root.addEventListener('click',async event=>{
    if(event.target===root){close();return;}
    const button=event.target.closest('[data-action]');if(!button||busy)return;
    const {action,id}=button.dataset,kit=kits.find(item=>item.id===id);
    if(action==='close')return close();
    if(action==='reload')return void load();
    if(action==='new'){draft={id:'',name:'',rows:[]};view='form';confirmDelete='';render();root.querySelector('[data-input="name"]')?.focus();return;}
    if(action==='edit'&&kit){draft={id:kit.id,name:kit.name,rows:kit.rows.map(row=>({...row}))};view='form';confirmDelete='';render();return;}
    if(action==='back'){view='list';draft=null;render();return;}
    if(action==='pick')return pick();
    if(action==='remove-row'){draft.rows=draft.rows.filter(row=>row.assetId!==id);render();return;}
    if((action==='minus'||action==='plus')&&kit){counts.set(id,Math.max(1,countOf(kit)+(action==='plus'?1:-1)));render();return;}
    if(action==='save'){busy=true;render();try{const saved=await store.save(draft.id,draft.name,draft.rows);if(closed)return;kits=[...kits.filter(item=>item.id!==saved.id),saved].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));busy=false;view='list';draft=null;render();report(`✓ Kit ${saved.name} salvo.`);}catch(error){busy=false;if(closed)return;render();report(error.message||'Não foi possível salvar o kit.','err');}return;}
    if(action==='delete'&&kit){if(confirmDelete!==id){confirmDelete=id;render();return;}busy=true;render();try{await store.remove(id);if(closed)return;kits=kits.filter(item=>item.id!==id);confirmDelete='';busy=false;render();report(`Kit ${kit.name} excluído. O filme não muda.`);}catch(error){busy=false;if(closed)return;render();report(error.message||'Não foi possível excluir o kit.','err');}return;}
    if(action==='add'&&kit){const count=countOf(kit);busy=true;render();try{await addKit(kit,count,entries);busy=false;if(closed)return;toast?.(`✓ ${plural(count,'kit','kits')} de ${kit.name} no filme.`);close();}catch(error){busy=false;if(closed)return;render();report(error.message||'Não foi possível colocar o kit no filme.','err');}}
  });
  document.addEventListener('keydown',onKey);
  void load();
  return {close,element:root};
}
