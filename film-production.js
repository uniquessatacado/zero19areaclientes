// A generated file is production preparation, not proof of printing or delivery.
// Identity is independent of PNG/TIFF/trim so reexports keep one accounting key.
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const filmOrderRowKey=row=>row.kind==='company_order'?`company:${row.company_order_item_id}`:row.quote_item_id;
const companyLink=link=>Boolean(link?.companyOrderItemId);
export async function filmExportIdentity(items,layout,{digest=bytes=>crypto.subtle.digest('SHA-256',bytes)}={}){
  const artifact={version:1,width:layout.filmWidthMm,length:layout.lengthMm,
    items:items.map(item=>({id:item.localId,type:item.type,sourceId:item.sourceId,path:item.path||null,width:item.widthCm,height:item.heightCm,quantity:item.quantity,orderLink:item.orderLink||null,officialPlacementId:item.officialPlacementId||null,officialProjectId:item.officialProjectId||null,officialOrderRef:item.officialOrderRef||null,
      recipe:item.type==='team_customization'?Object.fromEntries(Object.entries(item).filter(([key])=>!['previewDataUrl','previewUrl','mask','_mask'].includes(key))):null})).sort((a,b)=>a.id.localeCompare(b.id)),
    placements:layout.placements.map(p=>({id:p.id,copy:p.copy,x:p.xMm,y:p.yMm,width:p.widthMm,height:p.heightMm,angle:p.rotation||0})).sort((a,b)=>a.id.localeCompare(b.id)||(a.copy||0)-(b.copy||0))};
  const hash=await digest(new TextEncoder().encode(JSON.stringify(canonical(artifact))));
  const fingerprint=[...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  return {fingerprint,exportId:`${fingerprint.slice(0,8)}-${fingerprint.slice(8,12)}-5${fingerprint.slice(13,16)}-a${fingerprint.slice(17,20)}-${fingerprint.slice(20,32)}`};
}
export function linkedFilmQuantities(items,layout){
  const counts=new Map();for(const placement of layout.placements)counts.set(placement.id,(counts.get(placement.id)||0)+1);
  return items.filter(item=>item.orderLink).map(item=>{
    const link=item.orderLink,quantity=counts.get(item.localId)||0;
    const partner=companyLink(link),lineId=partner?link.companyOrderItemId:link.quoteItemId;
    if(partner&&(link.quoteItemId||typeof item.path!=='string'||!item.path)||![item.localId,lineId,link.projectId,item.sourceId].every(id=>uuidPattern.test(String(id)))||quantity<1)throw new Error('Vínculo de produção incompleto. Adicione a arte novamente pela lista de pedidos.');
    return {film_item_id:item.localId,...(partner?{company_order_item_id:lineId,source_path:item.path}:{quote_item_id:lineId}),project_id:link.projectId,asset_id:item.sourceId,quantity,width_cm:item.widthCm,height_cm:item.heightCm};
  }).sort((a,b)=>a.film_item_id.localeCompare(b.film_item_id));
}
export function pendingQuantity(row,items){
  const exported=new Map((row.allocations||[]).map(entry=>[entry.film_item_id,Number(entry.quantity)]));
  const inDraft=items.filter(item=>row.kind==='company_order'?item.orderLink?.companyOrderItemId===row.company_order_item_id:!companyLink(item.orderLink)&&item.orderLink?.quoteItemId===row.quote_item_id).reduce((sum,item)=>sum+Math.max(0,Number(item.quantity||0)-(exported.get(item.localId)||0)),0);
  return Math.max(0,Number(row.remaining_quantity)-inDraft);
}
export function filmItemFromOrder(row,quantity=Number(row.remaining_quantity)){
  const partner=row.kind==='company_order',ids=partner?[row.company_order_item_id]:[row.quote_id,row.quote_item_id];
  if(partner&&row.quote_item_id||![row.project_id,...ids,row.asset_id,row.workspace_id].every(id=>uuidPattern.test(String(id)))||!(row.processed_path||row.original_path))throw new Error('Pedido sem identificação ou arquivo final válido. Atualize a lista.');
  if(!Number.isInteger(quantity)||quantity<1||quantity>Number(row.remaining_quantity)||!Number.isFinite(Number(row.width_cm))||!Number.isFinite(Number(row.height_cm))||Number(row.width_cm)<=0||Number(row.height_cm)<=0)throw new Error('Quantidade ou medida inválida para este pedido.');
  return {localId:crypto.randomUUID(),type:'asset',sourceId:row.asset_id,label:`${row.company_name} • ${row.asset_name||row.label}${partner&&row.size?' • '+row.size:''}${partner&&row.color?' • '+row.color:''}`,quantity,widthCm:Number(row.width_cm),heightCm:Number(row.height_cm),path:row.processed_path||row.original_path,
    workspaceId:row.workspace_id,companyName:row.company_name,halftone:row.halftone===true,rotationPolicy:row.rotation_policy||'none',allowInternalNesting:row.allow_internal_nesting!==false,
    orderLink:partner?{projectId:row.project_id,companyOrderItemId:row.company_order_item_id}:{projectId:row.project_id,quoteId:row.quote_id,quoteItemId:row.quote_item_id}};
}
export function createFilmProduction({supabase,isCurrent=()=>true}={}){
  return {
    async pending(){const {data,error}=await supabase.rpc('z19p_pending_film_items');if(error)throw new Error(`Não foi possível conferir pedidos liberados: ${error.message}`);if(!isCurrent())return null;if(!Array.isArray(data))throw new Error('A consulta de produção retornou um formato inválido.');return data;},
    async record(items,layout,identity){
      if(!isCurrent())throw new Error('Conta alterada durante a exportação.');
      const linked=linkedFilmQuantities(items,layout);
      if(!linked.length)return {export_id:identity.exportId,replayed:false,added_quantity:0,unlinked:true};
      const {data,error}=await supabase.rpc('z19p_record_film_export',{p_export_id:identity.exportId,p_fingerprint:identity.fingerprint,p_items:linked});
      if(error)throw new Error(`Arquivo gerado, mas a fila ainda não foi atualizada: ${error.message}`);
      if(!isCurrent())throw new Error('Conta alterada durante a confirmação. Reabra os pedidos para conferir.');
      if(!data||data.export_id!==identity.exportId||typeof data.replayed!=='boolean'||typeof data.has_previous_items!=='boolean'||!Number.isInteger(data.added_quantity)||data.added_quantity<0)throw new Error('Arquivo gerado, mas a confirmação da fila não foi recebida. Tente atualizar a fila novamente.');
      return data;
    }
  };
}
