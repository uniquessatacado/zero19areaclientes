export const FILM_DRAFT_MAX_BYTES=8*1024*1024;
export const filmDraftKey=ownerId=>`z19p:film-draft:v1:${encodeURIComponent(String(ownerId||''))}`;
const runtimeKeys=new Set(['previewDataUrl','previewUrl','signedUrl','signed_url','image','canvas','mask','_mask','blob','buffer']);
const stripRuntime=value=>JSON.parse(JSON.stringify(value,(key,entry)=>runtimeKeys.has(key)||typeof entry==='function'||typeof entry==='symbol'||typeof entry==='object'&&entry!==null&&(ArrayBuffer.isView(entry)||entry instanceof ArrayBuffer)?undefined:entry));
const storageBytes=text=>Math.max(text.length*2,new TextEncoder().encode(text).length);

export function sanitizeFilmDraft(data){
  if(!data||data.version!==1||!Array.isArray(data.items))throw new Error('O rascunho desta aba está em um formato inválido.');
  const items=[],ids=new Set(),warnings=[];let dropped=0;
  for(const candidate of data.items){
    if(!candidate||!candidate.localId||ids.has(candidate.localId)||!['asset','team_customization'].includes(candidate.type)||!candidate.sourceId){dropped++;continue;}
    const widthCm=Number(candidate.widthCm),heightCm=Number(candidate.heightCm),quantity=Number(candidate.quantity),policy=candidate.rotationPolicy||'none';
    if(!Number.isFinite(widthCm)||!Number.isFinite(heightCm)||widthCm<=0||heightCm<=0||widthCm>1000||heightCm>1000||!Number.isInteger(quantity)||quantity<1||quantity>10000||!['none','90','180','free'].includes(policy)){dropped++;continue;}
    const item=stripRuntime(candidate);Object.assign(item,{widthCm,heightCm,quantity,rotationPolicy:policy});items.push(item);ids.add(item.localId);
  }
  if(dropped)warnings.push(`${dropped} ${dropped===1?'item inválido não pôde ser recuperado':'itens inválidos não puderam ser recuperados'}. Os demais itens foram mantidos; recalcule o filme.`);
  const source=data.settings||{},validGap=typeof source.gapMm==='number'&&Number.isFinite(source.gapMm)&&source.gapMm>=0&&source.gapMm<=50;
  const settings={mediaId:typeof source.mediaId==='string'?source.mediaId:null,mode:['normal','maximum'].includes(source.mode)?source.mode:'maximum',gapMm:validGap?source.gapMm:3,freeRotation:source.freeRotation===true,angleStep:[15,30].includes(source.angleStep)?source.angleStep:30};
  const settingsChanged=!validGap||settings.mode!==source.mode||source.freeRotation!=null&&typeof source.freeRotation!=='boolean'||source.angleStep!=null&&![15,30].includes(source.angleStep);
  if(settingsChanged)warnings.push('Alguma configuração local estava incompleta. Confira as opções e recalcule o filme.');
  return {data:{version:1,ownerId:String(data.ownerId||''),savedAt:typeof data.savedAt==='string'?data.savedAt:null,items,settings,layout:!dropped&&!settingsChanged&&data.layout?stripRuntime(data.layout):null},warnings};
}

/** Reconcile a restored roll with current profiles without changing dimensions.
 * An absent/incompatible width invalidates only the layout, never its source items.
 */
export function resolveFilmDraftMedia(settings,layout,media=[]){
  const available=media.filter(profile=>profile?.id&&Number.isFinite(Number(profile.usable_width_cm))&&Number(profile.usable_width_cm)>0),selected=available.find(profile=>profile.id===settings.mediaId);
  if(layout){
    const matches=profile=>Math.abs(Number(profile.usable_width_cm)*10-Number(layout.filmWidthMm))<.001,compatible=selected&&matches(selected)?selected:available.find(matches);
    if(compatible)return {settings:{...settings,mediaId:compatible.id},layout,changed:compatible.id!==settings.mediaId,warning:compatible.id!==settings.mediaId?`Perfil anterior indisponível ou alterado. Rascunho recuperado no perfil compatível de ${Number(compatible.usable_width_cm)} cm, sem mudar as posições.`:''};
    return {settings:{...settings,mediaId:selected?.id||available[0]?.id||null},layout:null,changed:true,warning:`O perfil compatível com a largura salva de ${Number(layout.filmWidthMm)/10} cm não está disponível. Os itens foram preservados; escolha o filme e recalcule o encaixe.`};
  }
  if(settings.mediaId&&!selected)return {settings:{...settings,mediaId:available[0]?.id||null},layout:null,changed:true,warning:'O perfil de filme do rascunho não está disponível. Confira a largura selecionada e recalcule o encaixe.'};
  return {settings:{...settings},layout:null,changed:false,warning:''};
}

/** Session storage is already isolated by browser tab. No account data is sent
 * to a backend and only the exact owner-scoped draft key may be removed.
 */
export function createFilmDraftStore({ownerId,storage,maxBytes=FILM_DRAFT_MAX_BYTES,now=()=>new Date().toISOString()}={}){
  const account=String(ownerId||''),key=filmDraftKey(account);
  const access=()=>{if(!account)throw new Error('Conta não identificada para o rascunho.');const target=typeof storage==='function'?storage():storage;if(!target?.getItem||!target?.setItem||!target?.removeItem)throw new Error('Armazenamento desta aba indisponível.');return target;};
  const failure=error=>({ok:false,data:null,warning:`Não foi possível guardar ou ler o rascunho desta aba. A montagem aberta continua disponível; use Salvar job. ${error?.message||''}`.trim()});
  return {key,
    load(){try{const text=access().getItem(key);if(text==null)return {ok:true,data:null,warnings:[]};if(storageBytes(text)>maxBytes)throw new Error('O rascunho ultrapassa o limite de 8 MB.');const parsed=JSON.parse(text);if(parsed.ownerId!==account)throw new Error('Este rascunho pertence a outra conta.');const result=sanitizeFilmDraft(parsed);return {ok:true,...result};}catch(error){return failure(error);}},
    save({items,layout=null,settings}={}){try{
      const savedAt=now(),{data,warnings}=sanitizeFilmDraft({version:1,ownerId:account,savedAt,items,layout,settings});
      // Never silently discard current items while saving an oversized/bad draft.
      if(data.items.length!==items?.length)throw new Error('Há itens inválidos; o rascunho anterior foi preservado.');
      const text=JSON.stringify(data),bytes=storageBytes(text);if(bytes>maxBytes)throw new Error('A montagem ultrapassa o limite local de 8 MB. O rascunho anterior foi preservado.');
      access().setItem(key,text);return {ok:true,savedAt,bytes,warnings};
    }catch(error){return failure(error);}},
    clear(){try{access().removeItem(key);return {ok:true};}catch(error){return failure(error);}}
  };
}
