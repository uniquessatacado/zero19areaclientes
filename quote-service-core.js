// Independent commercial lines. Compatibility fields keep legacy totals and
// commissions exact: only products use piece_price; services use print prices.
export const QUOTE_SERVICES = Object.freeze({
  full_shirt: {label:'Camiseta completa',description:'Nossa camiseta + DTF + aplicação',product:true,application:true,mockup:true},
  dtf_only: {label:'Somente arte / DTF',description:'Só a estampa para o cliente aplicar',product:false,application:false,mockup:false},
  customer_shirt: {label:'Camiseta do cliente',description:'DTF e aplicação na peça trazida pelo cliente',product:false,application:true,mockup:true},
  refurbishment: {label:'Reforma de camiseta',description:'Remoção da estampa antiga + nova estampa',product:false,application:true,removal:true,mockup:true}
});
export const QUOTE_ITEM_LABELS=Object.freeze({product:'Produto',art:'Arte / DTF',application:'Aplicação',removal:'Remoção'});
export function quoteMoney(value){
  if(typeof value==='number')return Number.isFinite(value)?value:NaN;
  const raw=String(value??'').trim();if(!raw)return NaN;
  const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;
  return /^\d+(?:\.\d{1,2})?$/.test(normalized)?Number(normalized):NaN;
}
export const quoteCents=value=>Math.round((Number.isFinite(quoteMoney(value))?quoteMoney(value):0)*100);
export function serviceItemUnit(item){
  if(item.unit_price!==undefined)return quoteMoney(item.unit_price);
  return item.pricing_mode==='piece_plus_print'?quoteMoney(item.piece_price??0)+(Array.isArray(item.prints)?item.prints:[]).reduce((sum,print)=>sum+(quoteMoney(print.price)||0),0):quoteMoney(item.total_unit_price);
}
export function serviceBreakdown(items=[]){
  const cents={product:0,art:0,application:0,removal:0};
  for(const item of items){const quantity=Number(item.quantity);if(item.item_kind in cents&&Number.isInteger(quantity)&&quantity>0)cents[item.item_kind]+=quoteCents(serviceItemUnit(item))*quantity;}
  return {...Object.fromEntries(Object.entries(cents).map(([key,value])=>[key,value/100])),total:Object.values(cents).reduce((sum,value)=>sum+value,0)/100};
}
export function newServiceItem(kind,{product=null,asset=null,uuid=()=>crypto.randomUUID()}={}){
  return {id:uuid(),item_kind:kind,product_id:kind==='product'?product?.id||null:null,product_name:kind==='product'?product?.name||'':kind==='art'?asset?.name||'Arte / DTF':QUOTE_ITEM_LABELS[kind],quantity:1,unit_price:kind==='product'?(product?.default_unit_price??''):'',reference_asset_id:asset?.id||null,final_asset_id:null,metadata:{price_override:false,catalog_unit_price:kind==='product'?(product?.default_unit_price??null):null,removal_free:false}};
}
export function createServiceDraft(existing,{workspaceId,projectId,products=[],uuid=()=>crypto.randomUUID()}={}){
  const service=existing?.service_type||'full_shirt';
  if(!QUOTE_SERVICES[service])throw new Error('Tipo de serviço inválido.');
  return {id:existing?.id||uuid(),is_new:!existing?.id,workspace_id:existing?.workspace_id||workspaceId,project_id:existing?.project_id||projectId||null,title:existing?.title||'Orçamento',delivery_date:existing?.delivery_date||'',delivery_term:existing?.delivery_term||'',notes:existing?.notes||'',service_type:service,schema_version:2,official_mockup_asset_id:existing?.official_mockup_asset_id||null,updated_at:existing?.updated_at||null,payment_status:existing?.payment_status||'unpaid',items:existing?(existing.items||[]).map(item=>({...item,unit_price:serviceItemUnit(item),metadata:{...item.metadata}})):[newServiceItem('product',{product:products[0],uuid}),newServiceItem('application',{uuid})]};
}
export function changeQuoteService(draft,service,{products=[],uuid=()=>crypto.randomUUID()}={}){
  const config=QUOTE_SERVICES[service];if(!config)throw new Error('Tipo de serviço inválido.');
  const allowed=new Set(['art',...(config.product?['product']:[]),...(config.application?['application']:[]),...(config.removal?['removal']:[])]);
  draft.items=draft.items.filter(item=>allowed.has(item.item_kind));draft.service_type=service;
  for(const kind of allowed)if(kind!=='art'&&!draft.items.some(item=>item.item_kind===kind))draft.items.push(newServiceItem(kind,{product:products[0],uuid}));
  if(!config.mockup)draft.official_mockup_asset_id=null;
  return draft;
}
export function setQuoteProduct(item,product){
  item.product_id=product?.id||null;item.product_name=product?.name||'';
  item.unit_price=product?.default_unit_price??'';item.metadata={...item.metadata,price_override:false,catalog_unit_price:product?.default_unit_price??null};
}
export function validateServiceDraft(draft){
  const config=QUOTE_SERVICES[draft.service_type],errors=[];
  if(!config)return ['Escolha um tipo de serviço.'];
  const items=draft.items||[],kinds=new Set(items.map(item=>item.item_kind)),ids=new Set();
  if(!kinds.has('art'))errors.push('Selecione pelo menos uma arte do acervo desta empresa.');
  if(config.product&&!kinds.has('product'))errors.push('Adicione a camiseta ou produto que será vendido.');
  if(config.application&&!kinds.has('application'))errors.push('Informe a aplicação, mesmo quando incluída/gratuita (R$ 0).');
  if(config.removal&&!kinds.has('removal'))errors.push('Informe a remoção; marque gratuita quando não houver cobrança.');
  for(const [index,item] of items.entries()){
    const name=`${QUOTE_ITEM_LABELS[item.item_kind]||'Item'} ${index+1}`;
    if(!item.id||ids.has(item.id))errors.push('Há itens repetidos no orçamento. Reabra e confira.');ids.add(item.id);
    if(!QUOTE_ITEM_LABELS[item.item_kind]||item.item_kind==='product'&&!config.product||item.item_kind==='application'&&!config.application||item.item_kind==='removal'&&!config.removal)errors.push(`${name}: não se aplica ao serviço escolhido.`);
    if(!Number.isInteger(Number(item.quantity))||Number(item.quantity)<1||Number(item.quantity)>100000)errors.push(`${name}: informe uma quantidade inteira de 1 a 100.000.`);
    const price=serviceItemUnit(item);if(!Number.isFinite(price)||price<0||price>99999999.99)errors.push(`${name}: informe o preço unitário; zero é permitido.`);
    if(item.item_kind==='product'&&(!item.product_id||!item.product_name))errors.push(`${name}: selecione um produto.`);
    if(item.item_kind==='art'&&!item.reference_asset_id)errors.push(`${name}: selecione a arte de referência.`);
    if(item.item_kind==='removal'&&item.metadata?.removal_free&&price!==0)errors.push('Remoção gratuita deve ter valor zero.');
    if(item.item_kind==='removal'&&price===0&&!item.metadata?.removal_free)errors.push('Marque a opção de remoção gratuita para confirmar o valor zero.');
  }
  if(serviceBreakdown(items).total<=0)errors.push('O total do orçamento precisa ser maior que zero.');
  return [...new Set(errors)];
}
export function serializeServiceDraft(draft){
  const errors=validateServiceDraft(draft);if(errors.length)throw new Error(errors[0]);
  const p_quote={id:draft.id,workspace_id:draft.workspace_id,project_id:draft.project_id||null,title:String(draft.title||'').trim()||'Orçamento',delivery_date:draft.delivery_date||null,delivery_term:String(draft.delivery_term||'').trim()||null,notes:String(draft.notes||'').trim()||null,service_type:draft.service_type,schema_version:2,official_mockup_asset_id:draft.official_mockup_asset_id||null};
  const p_items=draft.items.map((item,sort_order)=>{
    const product=item.item_kind==='product',art=item.item_kind==='art',price=quoteCents(serviceItemUnit(item))/100,metadata={...item.metadata};
    return {id:item.id,item_kind:item.item_kind,product_id:product?item.product_id:null,product_name:String(item.product_name||QUOTE_ITEM_LABELS[item.item_kind]).trim(),quantity:Number(item.quantity),pricing_mode:'piece_plus_print',piece_price:product?price:0,total_unit_price:null,prints:product?[]:[{price,placement:metadata.placement||QUOTE_ITEM_LABELS[item.item_kind],width_cm:String(metadata.width_cm||''),height_cm:String(metadata.height_cm||''),kind:item.item_kind}],reference_asset_id:art?item.reference_asset_id:null,final_asset_id:art?item.final_asset_id||null:null,metadata,sort_order};
  });
  return {p_quote,p_items,p_expected_updated_at:draft.updated_at||null};
}
export function quotePreparationSummary(quote){
  if(!QUOTE_SERVICES[quote?.service_type])return [];
  const arts=(quote.items||[]).filter(item=>item.item_kind==='art'),pending=[];
  const missing=arts.filter(item=>!item.final_asset_id).length;
  if(missing)pending.push(`Vincular ${missing} arte(s) final(is) com as medidas de produção`);
  if(QUOTE_SERVICES[quote.service_type].mockup&&!quote.official_mockup_asset_id)pending.push('Criar e vincular o mockup oficial com posições e medidas');
  return pending;
}
export function buildQuoteAssetQuery(supabase,{ownerId,workspaceId,projectId,type='arte',name='',page=0,pageSize=24,signal}={}){
  if(!ownerId||!workspaceId)throw new Error('Selecione a empresa antes de escolher uma arte.');
  let query=supabase.from('z19p_assets').select('id,owner_id,workspace_id,project_id,folder_id,name,asset_type,original_path,processed_path,width,height,metadata,created_at').eq('owner_id',ownerId).eq('workspace_id',workspaceId).eq('asset_type',type);
  if(type==='mockup'&&projectId)query=query.eq('project_id',projectId);
  if(name.trim())query=query.ilike('name',`%${name.trim().replace(/[\\%_]/g,'\\$&')}%`);
  query=query.order('created_at',{ascending:false}).order('id',{ascending:true}).range(page*pageSize,(page+1)*pageSize);
  return signal&&query.abortSignal?query.abortSignal(signal):query;
}
