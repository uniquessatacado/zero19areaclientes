// Read-only reconciliation. A ready garment does not imply a new film export.
const WORK_KINDS=new Set(['font','vdr','venduss']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function unavailablePendingEntries(supabase,ownerId,entries){
  if(!UUID.test(String(ownerId)))throw new Error('Conta de produção inválida.');
  const groups=[
    {table:'z19p_zero19_work_items',field:'stage',expected:'ready_production',rows:entries.filter(e=>!e.completed&&WORK_KINDS.has(e.kind)).map(e=>({entry:e,id:e.row?.id}))},
    {table:'z19p_asset_placements',field:'production_state',expected:'pending',rows:entries.filter(e=>!e.completed&&e.kind==='placed').map(e=>({entry:e,id:e.row?.placement?.id}))}
  ];
  const unavailable=new Set();
  for(const group of groups){
    const ids=[...new Set(group.rows.map(r=>r.id))];
    if(ids.some(id=>!UUID.test(String(id))))throw new Error('Aplicação sem vínculo válido. Atualize a fila.');
    const current=new Map();
    for(let offset=0;offset<ids.length;offset+=100){
      const {data,error}=await supabase.from(group.table).select('id,'+group.field).eq('owner_id',ownerId).in('id',ids.slice(offset,offset+100));
      if(error)throw new Error('Não foi possível conferir a etapa atual: '+error.message);
      if(!Array.isArray(data))throw new Error('Resposta inválida ao conferir a fila de produção.');
      for(const row of data)current.set(row.id,row[group.field]);
    }
    for(const {entry,id} of group.rows)if(current.get(id)!==group.expected)unavailable.add(entry.key);
  }
  return unavailable;
}

export function watchPendingStatuses({supabase,ownerId,entries,modal,isCurrent,getBusy,setBusy,selected,updateCount,onChanged,intervalMs=10000}){
  if(!supabase||!ownerId)return {dispose(){},check:async()=>true};
  const button=modal.querySelector('[data-add-pending]');
  if(!button)return {dispose(){},check:async()=>true};
  const doc=modal.ownerDocument||globalThis.document,win=doc?.defaultView||globalThis.window;
  let stopped=false,attached=false,forwarding=false,confirming=false,pollPromise=null;
  let timer,observer;
  const current=()=>!stopped&&isCurrent()&&modal.isConnected;
  const message=(text,error=false)=>{
    if(!current())return;
    let note=modal.querySelector('[data-live-pending-note]');
    if(!note&&doc){note=doc.createElement('p');note.dataset.livePendingNote='';const footer=modal.querySelector('.modal-footer');if(footer)footer.before(note);else modal.appendChild(note);}
    if(note){note.textContent=text;note.setAttribute('role',error?'alert':'status');}
  };
  const check=async(force=false)=>{
    if(!current()||(!force&&getBusy()))return false;
    const removed=await unavailablePendingEntries(supabase,ownerId,entries);
    if(!current()||(!force&&getBusy()))return false;
    let count=0;
    entries.forEach((entry,index)=>{
      if(entry.completed||!removed.has(entry.key))return;
      entry.completed=true;selected.delete(entry.key);count++;
      const row=modal.querySelector('[data-entry="'+index+'"]')?.closest('.film-pending-row');
      (row?.closest('.film-pending-application')||row)?.remove();
    });
    if(count){
      updateCount();message(count+' aplicação(ões) não aguardam mais produção e saíram desta lista. O filme montado não foi alterado.');
      try{await onChanged?.();}catch(error){message('Fila conferida. Não foi possível atualizar o resumo: '+(error.message||error),true);}
    }
    return current();
  };
  const poll=()=>{
    if(!isCurrent()){dispose();return;}
    if(!modal.isConnected){if(attached)dispose();return;}
    attached=true;
    if(doc?.hidden||getBusy()||confirming||pollPromise)return;
    pollPromise=check().catch(error=>message(error.message||String(error),true)).finally(()=>{pollPromise=null;});
  };
  const onClick=async event=>{
    if(forwarding)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(!current()||getBusy()||confirming)return;
    confirming=true;setBusy(true);updateCount();let forwarded=false;
    try{
      if(pollPromise)await pollPromise;
      if(!await check(true))return;
      setBusy(false);updateCount();
      if(!current()||!selected.size)return;
      forwarding=true;forwarded=true;
      try{button.click();}finally{forwarding=false;}
    }catch(error){message(error.message||String(error),true);}
    finally{confirming=false;if(!forwarded){setBusy(false);if(current())updateCount();}}
  };
  const onVisibility=()=>{if(!doc?.hidden)poll();};
  function dispose(){
    if(stopped)return;stopped=true;clearInterval(timer);observer?.disconnect();
    button.removeEventListener('click',onClick,true);win?.removeEventListener('focus',poll);doc?.removeEventListener('visibilitychange',onVisibility);
  }
  button.addEventListener('click',onClick,true);
  win?.addEventListener('focus',poll);doc?.addEventListener('visibilitychange',onVisibility);
  const Observer=win?.MutationObserver||globalThis.MutationObserver;
  if(Observer&&doc?.body){observer=new Observer(()=>{if(modal.isConnected)attached=true;else if(attached||!isCurrent())dispose();});observer.observe(doc.body,{childList:true,subtree:true});}
  timer=setInterval(poll,intervalMs);timer.unref?.();
  return {dispose,check};
}
