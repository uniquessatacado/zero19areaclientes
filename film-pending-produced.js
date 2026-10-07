// Reuses the audited per-application action; never completes an entire order.
export function bindPendingProducedActions({entries,modal,isCurrent,getBusy,setBusy,selected,updateCount,markProduced,onProduced,onError}){
 if(typeof markProduced!=='function')return;
 entries.forEach((entry,index)=>{
  if(!['font','vdr','venduss'].includes(entry.kind)||!entry.row?.id)return;
  const row=modal.querySelector('[data-entry="'+index+'"]')?.closest('.film-pending-row');if(!row)return;
  const wrapper=document.createElement('div');wrapper.className='film-pending-application';row.before(wrapper);wrapper.appendChild(row);
  const action=document.createElement('button');action.type='button';action.className='btn small';action.dataset.pendingProduced=entry.row.id;
  action.textContent='✓ Já está pronta';action.style.cssText='display:inline-flex;min-height:44px;width:auto;max-width:100%;padding:6px 8px;white-space:normal;background:#e8f3e9;color:#205831;border:1px solid #c5dec8;font-size:10px;font-weight:700;border-radius:9px';
  const actions=document.createElement('div');actions.className='film-pending-actions';actions.style.cssText='display:flex;flex-wrap:wrap;gap:6px;padding:4px 0 0;align-items:center';wrapper._pendingActions=actions;(row.querySelector?.('.film-pending-copy')||wrapper).appendChild(actions);
  action.disabled=entry.alreadyInFilm;action.title=entry.alreadyInFilm?'Remova esta aplicação do filme antes de concluir manualmente.':'Concluir somente esta aplicação já produzida';actions.appendChild(action);
  action.onclick=async event=>{
   event.preventDefault();event.stopPropagation();if(getBusy()||!isCurrent()||action.disabled)return;
   setBusy(true);updateCount();
   modal.querySelectorAll('[data-pending-produced]').forEach(button=>button.disabled=true);
   try{
    const success=await markProduced(entry.row.id,undefined,isCurrent);
    if(!success||!isCurrent()||!modal.isConnected)return;
    entry.completed=true;selected.delete(entry.key);wrapper.remove();await onProduced?.(entry);
   }catch(error){onError?.(error);}finally{
    setBusy(false);if(modal.isConnected){modal.querySelectorAll('[data-pending-produced]').forEach(button=>button.disabled=entries.some(item=>item.row?.id===button.dataset.pendingProduced&&item.alreadyInFilm));updateCount();}
   }
  };
 });
}
