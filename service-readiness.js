import {validateServiceDraft,QUOTE_SERVICES} from './quote-service-core.js?v=2.17.11';
const positive=value=>Number.isFinite(Number(value))&&Number(value)>0;
const coordinate=value=>value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value));
// Pure read model shared by cards/queues/advisor. Server enforces independently.
export function serviceReadiness(quote,{items=[],assets=[],printProfiles=[],prepared=true}={}){
  if(!quote?.service_type)return [];
  const rows=items.filter(item=>item.quote_id===quote.id||!item.quote_id),issues=validateServiceDraft({...quote,items:rows});
  if(!prepared)return issues;
  const asset=id=>assets.find(row=>row.id===id&&row.workspace_id===quote.workspace_id&&(!quote.owner_id||!row.owner_id||quote.owner_id===row.owner_id));
  for(const item of rows.filter(item=>item.item_kind==='art')){
    const final=asset(item.final_asset_id),profile=printProfiles.find(row=>row.asset_id===final?.id&&(!quote.owner_id||!row.owner_id||row.owner_id===quote.owner_id));
    if(!final||final.asset_type!=='arte'||!(final.processed_path||final.original_path)||!profile?.ready_for_print||!positive(profile.default_width_cm)||!positive(profile.default_height_cm))issues.push('Vincule a arte final pronta, com medidas, a cada estampa orçada.');
  }
  if(QUOTE_SERVICES[quote.service_type]?.mockup){
    const mockup=asset(quote.official_mockup_asset_id),layers=mockup?.metadata?.garment_scene?.layers;
    if(!mockup||mockup.asset_type!=='mockup'||mockup.project_id!==quote.project_id||!(mockup.processed_path||mockup.original_path))issues.push('Salve e selecione o mockup oficial deste pedido.');
    else if(mockup.metadata?.official_mockup!==true||!Array.isArray(layers)||!layers.length||layers.some(layer=>!positive(layer.width)||!positive(layer.ratio)||!coordinate(layer.x)||!coordinate(layer.y)||!['front','back','left','right'].includes(layer.side)||asset(layer.assetId)?.asset_type!=='arte'))issues.push('O mockup oficial precisa registrar artes, medidas e posições.');
    else if(rows.some(item=>item.item_kind==='art'&&item.final_asset_id&&!layers.some(layer=>layer.assetId===item.final_asset_id)))issues.push('O mockup oficial precisa mostrar cada arte final orçada.');
    else if(rows.some(item=>{if(item.item_kind!=='art')return false;const profile=printProfiles.find(row=>row.asset_id===item.final_asset_id);return profile&&!layers.some(layer=>layer.assetId===item.final_asset_id&&Math.abs(Number(layer.width)-Number(profile.default_width_cm))<=.01&&Math.abs(Number(layer.width)/Number(layer.ratio)-Number(profile.default_height_cm))<=.01)}))issues.push('Atualize o mockup oficial com as medidas atuais das artes finais.');
  }
  return [...new Set(issues)];
}
