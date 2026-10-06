import {assertCurrentLetteringRevisions} from './film-phrase-parts.js?v=2.17.50';

const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export function assertCurrentLetteringSnapshots(items,rows){
  const current=new Map(rows.map(row=>[row.id,row]));
  for(const item of items){
    if(!item.letteringProductionSnapshot||!Array.isArray(item.letteringApplicationParts))throw new Error('Este rascunho antigo não possui a conferência da escrita do pedido. Remova a aplicação antiga e adicione novamente por Aguardando produção; o arquivo histórico não foi alterado.');
    const row=current.get(item.zero19WorkItemId),expectedQuantity=Number(item.applicationQuantity??item.quantity),font=item.customizationSetId||item.sourceId;
    if(row?.stage==='cancelled')throw new Error('Esta aplicação foi cancelada. Remova-a do filme; nenhum arquivo será preparado e nenhuma produção será liberada.');
    if(JSON.stringify(canonical(item.letteringProductionSnapshot))!==JSON.stringify(canonical(row?.metadata?.details?.[0]?.production||{}))||font!==row?.metadata?.font_set_id||expectedQuantity!==Number(row?.quantity)||Number(item.quantity)!==expectedQuantity)throw new Error('Texto, fonte ou quantidade deste pedido mudou. Remova o conjunto antigo e adicione a aplicação atual novamente antes de exportar.');
  }
  return true;
}

// Read only, current authenticated account. No source/token/personal data leaves
// this check and no old draft is silently rewritten to the latest order text.
export async function verifyFilmLetteringRevisions({supabase,ownerId,items,isCurrent=()=>true}){
  const lettering=items.filter(item=>item.type==='team_customization'&&item.zero19WorkItemId),ids=[...new Set(lettering.map(item=>item.zero19WorkItemId))];
  if(!ids.length)return [];
  if(!ownerId||!isCurrent())throw new Error('A conta mudou. Reabra o filme antes de exportar.');
  const rows=[];
  for(let index=0;index<ids.length;index+=64){
    const {data,error}=await supabase.from('z19p_zero19_work_items').select('id,quantity,stage,metadata').eq('owner_id',ownerId).in('id',ids.slice(index,index+64));
    if(!isCurrent())throw new Error('A conta mudou durante a conferência da escrita. Reabra o filme.');
    if(error)throw new Error('Não foi possível conferir a escrita atual do pedido: '+(error.message||'tente novamente.'));
    rows.push(...(data||[]));
  }
  assertCurrentLetteringRevisions(lettering,rows);
  assertCurrentLetteringSnapshots(lettering,rows);
  return rows;
}
