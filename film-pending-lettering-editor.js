// Edit one source application before preparing a film; never mutate a draft.
export function normalizePendingLettering(value){
 return String(value??'').normalize('NFC').replace(/\s+/gu,' ').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu,'').trim().toUpperCase();
}
export function pendingLetteringExpected(row){
 return {text_value:row.text_value??null,production:structuredClone(row.metadata?.details?.[0]?.production??{}),font_set_id:row.metadata?.font_set_id??null,lettering_revision:row.metadata?.lettering_revision??null};
}
export function pendingLetteringValues(row){
 const recipe=row.metadata?.details?.[0]?.production||{};
 return {name:String(recipe.top_text??row.text_value??''),number:String(recipe.number??'')};
}
export async function savePendingLettering({row,name,number,isCurrent,makePreview,write}){
 if(!isCurrent())throw new Error('A página ou a conta mudou. Abra a seleção novamente.');
 const cleanName=normalizePendingLettering(name),cleanNumber=String(number??'').trim();
 if(Array.from(cleanName).length>1000||(cleanNumber&&!/^\d{1,6}$/.test(cleanNumber)))throw new Error('Use até 1000 caracteres na escrita e até 6 algarismos no número.');
 if(!cleanName&&!cleanNumber)throw new Error('Mantenha uma escrita ou número nesta aplicação.');
 const expected=pendingLetteringExpected(row);
 // The production renderer checks official letters before any source write.
 const item=await makePreview(row,{name:cleanName,number:cleanNumber});
 if(!isCurrent())throw new Error('A página ou a conta mudou. Nenhuma edição foi enviada.');
 const response=await write({p_work_item_id:row.id,p_top_text:cleanName,p_number:cleanNumber,p_expected:expected});
 if(response?.error)throw response.error;
 const result=response?.data;
 if(!result||result.work_item_id!==row.id||!result.metadata)throw new Error('A resposta da edição não foi confirmada. Atualize a lista antes de montar o filme.');
 const renderedFont=row.set?.id||row.metadata?.font_set_id||row.metadata?.details?.[0]?.production?.font_set_id;
 const savedFont=result.metadata.font_set_id||result.metadata.details?.[0]?.production?.font_set_id;
 if(renderedFont&&savedFont!==renderedFont)throw new Error('A escrita está salva, mas a fonte desta aplicação mudou. Feche e reabra a seleção para conferir a nova prévia.');
 return {result,item,current:isCurrent()};
}
const escapeText=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function openEditor({entry,parent,isCurrent,getActor,getOwner,makePreview,write,onSaved,onClose,onError}){
 const actor=getActor(),account=getOwner(),original=pendingLetteringValues(entry.row),priorFocus=document.activeElement;
 const editor=document.createElement('div');editor.className='modal-backdrop';editor.style.zIndex='140';
 const identifier='pending-lettering-'+entry.row.id;
 editor.innerHTML='<form class="modal compact" style="width:min(620px,calc(100vw - 24px));max-height:calc(100dvh - 24px);display:flex;flex-direction:column;overflow:hidden" role="dialog" aria-modal="true" aria-labelledby="'+identifier+'"><div class="modal-head"><div><div class="eyebrow">ANTES DA PRODUÇÃO</div><h2 id="'+identifier+'">Editar escrita</h2><p style="overflow-wrap:anywhere">'+escapeText(entry.title)+'</p></div><button type="button" class="btn ghost small" data-close-lettering aria-label="Fechar edição" style="min-height:44px">×</button></div><div style="min-height:0;overflow-y:auto;overflow-x:hidden;display:grid;gap:12px;padding:2px"><div class="hint">Altere letras, palavras, acentos ou pontuação. A fonte, medidas e demais aplicações deste pedido serão preservadas.</div><label style="display:grid;gap:6px">Escrita<textarea data-lettering-name rows="3" maxlength="1000" style="width:100%;min-height:88px;resize:vertical;box-sizing:border-box">'+escapeText(original.name)+'</textarea></label><label style="display:grid;gap:6px">Número (opcional)<input data-lettering-number inputmode="numeric" maxlength="6" value="'+escapeText(original.number)+'" style="width:100%;min-height:44px;box-sizing:border-box"></label><div data-lettering-preview style="height:130px;min-height:130px;display:flex;justify-content:center;align-items:center;background:#fff;border-radius:12px;overflow:hidden;color:#111" aria-label="Prévia com a fonte do pedido">Preparando prévia…</div><small data-lettering-note role="status" aria-live="polite">Conferindo a fonte oficial…</small><p data-lettering-error role="alert" hidden style="color:#ffb4ab;overflow-wrap:anywhere;margin:0"></p></div><div class="modal-footer" style="flex-wrap:wrap"><button type="button" class="btn" data-close-lettering style="min-height:44px">Cancelar</button><button type="submit" class="btn primary" data-save-lettering disabled style="min-height:44px;background:#a8caff;color:#071426;border-color:#a8caff;font-weight:800">Salvar escrita</button></div></form>';
 document.body.appendChild(editor);
 const field=editor.querySelector('[data-lettering-name]'),number=editor.querySelector('[data-lettering-number]'),save=editor.querySelector('[data-save-lettering]'),preview=editor.querySelector('[data-lettering-preview]'),note=editor.querySelector('[data-lettering-note]'),error=editor.querySelector('[data-lettering-error]');
 const background=document.createElement('button');background.type='button';background.className='btn small';background.style.cssText='min-height:44px;justify-self:start;background:#fff;color:#111;border:1px solid #a8a8b1;font-weight:700';background.setAttribute?.('aria-label','Trocar apenas o fundo visual da prévia');note.before(background);
 let backdrop=0;
 const setBackdrop=()=>{preview.style.background=backdrop===1?'#17171d':backdrop===2?'#fff':'repeating-conic-gradient(#747474 0% 25%,#888 0% 50%) 0 0/20px 20px';preview.style.color=backdrop===2?'#111':'#fff';background.textContent='Fundo '+['quadriculado','escuro','claro'][backdrop]+' · trocar';};
 background.onclick=()=>{backdrop=(backdrop+1)%3;setBackdrop();};setBackdrop();
 let closed=false,saving=false,generation=0,timer,watch;
 const current=()=>!closed&&editor.isConnected&&parent.isConnected&&isCurrent()&&getActor()===actor&&getOwner()===account;
 const close=()=>{if(closed||saving)return;closed=true;clearTimeout(timer);clearInterval(watch);editor.remove();onClose();if(priorFocus?.isConnected)priorFocus.focus?.();};
 const showError=failure=>{error.hidden=false;error.textContent=failure?.message||String(failure);save.disabled=false;};
 const showPreview=item=>{const img=document.createElement('img');img.alt='Escrita com a fonte e medidas desta aplicação';img.style.cssText='display:block;width:100%;height:100%;max-width:100%;max-height:130px;object-fit:contain';img.src=item.previewDataUrl;preview.replaceChildren(img);note.textContent=item.symbolFallbackCharacters?.length?'Fonte alternativa somente nos sinais: '+item.symbolFallbackCharacters.join(' '):'Prévia conferida na fonte oficial. Só esta aplicação será alterada.';};
 const refreshPreview=async()=>{
  const token=++generation;save.disabled=true;note.textContent='Conferindo a fonte oficial…';error.hidden=true;
  try{const name=normalizePendingLettering(field.value),digits=number.value.trim();if(!name&&!digits)throw new Error('Mantenha uma escrita ou número nesta aplicação.');if(digits&&!/^\d{1,6}$/.test(digits))throw new Error('O número deve conter até 6 algarismos.');
   const item=await makePreview(entry.row,{name,number:digits});if(!current()||token!==generation||saving)return;showPreview(item);save.disabled=false;
  }catch(failure){if(!current()||token!==generation||saving)return;preview.textContent='Confira a escrita abaixo';note.textContent='A fonte oficial não será substituída.';showError(failure);save.disabled=true;}
 };
 const changed=()=>{if(!current()||saving)return;generation++;clearTimeout(timer);save.disabled=true;timer=setTimeout(refreshPreview,180);};
 field.oninput=changed;number.oninput=changed;
 editor.querySelectorAll('[data-close-lettering]').forEach(button=>button.onclick=close);
 editor.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}else if(event.key==='Tab'){const controls=Array.from(editor.querySelectorAll('button,input,textarea')).filter(control=>!control.disabled),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};
 editor.querySelector('form').onsubmit=async event=>{
  event.preventDefault();if(saving||!current())return;saving=true;clearTimeout(timer);generation++;save.disabled=true;save.textContent='Salvando escrita…';error.hidden=true;field.disabled=true;number.disabled=true;
  editor.querySelectorAll('[data-close-lettering]').forEach(button=>button.disabled=true);
  try{const outcome=await savePendingLettering({row:entry.row,name:field.value,number:number.value,isCurrent:current,makePreview,write});
   if(!outcome.current)return;
   await onSaved(entry,outcome.result,outcome.item);saving=false;close();
  }catch(failure){if(current()){showError(failure);onError?.(failure);}}
  finally{saving=false;if(!current()){close();return;}field.disabled=false;number.disabled=false;editor.querySelectorAll('[data-close-lettering]').forEach(button=>button.disabled=false);save.disabled=false;save.textContent='Salvar escrita';}
 };
 watch=setInterval(()=>{if(!saving&&!current())close();},500);
 field.focus({preventScroll:true});field.select?.();void refreshPreview();
}

export function bindPendingLetteringActions({entries,modal,isCurrent,getActor,getOwner,getBusy,setBusy,updateCount,supabase,makePreview,onSaved,onError}){
 if(!supabase?.rpc||typeof makePreview!=='function')return;
 entries.forEach((entry,index)=>{
  if(entry.kind!=='font'||!entry.row?.id)return;
  const row=modal.querySelector('[data-entry="'+index+'"]')?.closest('.film-pending-row');if(!row)return;
  let wrapper=row.closest('.film-pending-application');
  if(!wrapper){wrapper=document.createElement('div');wrapper.className='film-pending-application';row.before(wrapper);wrapper.appendChild(row);}
  const action=document.createElement('button');action.type='button';action.className='btn small';action.dataset.pendingLettering=entry.row.id;action.textContent='✎ Editar escrita';
  action.style.cssText='display:inline-flex;min-height:44px;width:auto;max-width:100%;padding:6px 8px;white-space:normal;background:#e7effb;color:#27466e;border:1px solid #c5d5eb;font-size:10px;font-weight:700;border-radius:9px';
  if(!wrapper._pendingActions){const actions=document.createElement('div');actions.className='film-pending-actions';actions.style.cssText='display:flex;flex-wrap:wrap;gap:6px;padding:4px 0 0;align-items:center';wrapper._pendingActions=actions;(row.querySelector?.('.film-pending-copy')||wrapper).appendChild(actions);}
  action.disabled=entry.alreadyInFilm;action.title=entry.alreadyInFilm?'Remova esta aplicação do filme para editar a escrita na origem.':'Editar somente esta aplicação antes de adicionar ao filme';wrapper._pendingActions.appendChild(action);
  action.onclick=event=>{
   event.preventDefault();event.stopPropagation();if(getBusy()||!isCurrent()||action.disabled||entry.completed)return;
   setBusy(true);updateCount();
   openEditor({entry,parent:modal,isCurrent,getActor,getOwner,makePreview,write:params=>supabase.rpc('z19p_zero19_edit_pending_lettering',params),onSaved:(...args)=>onSaved?.(...args,index),onError,
    onClose:()=>{setBusy(false);if(modal.isConnected)updateCount();}});
  };
 });
}
