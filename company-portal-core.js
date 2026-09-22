export const PORTAL_LIMITS=Object.freeze({maxFileBytes:25*1024*1024,maxItems:100,maxQuantity:1000,maxTotalQuantity:5000});
export const PORTAL_SIZES=Object.freeze(['PP','P','M','G','GG','XG','XXG','EXG','G1','G2','G3','G4','G5','Único','2','4','6','8','10','12','14','16']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const escapePortalHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function readPortalToken(locationLike){
  try{
    const url=new URL(typeof locationLike==='string'?locationLike:locationLike.href);
    const hash=decodeURIComponent(url.hash.slice(1));
    const candidate=(hash.startsWith('token=')?new URLSearchParams(hash).get('token'):hash.replace(/^\//,''))||url.searchParams.get('token')||'';
    return UUID.test(candidate)?candidate.toLowerCase():null;
  }catch{return null;}
}
export function portalAssetUrl(path,supabaseUrl){
  if(typeof path!=='string'||!path||path.startsWith('/')||/[\\\x00-\x1f]/.test(path))return '';
  const segments=path.split('/');
  if(segments.some(part=>!part||part==='.'||part==='..'))return '';
  try{
    const base=new URL(supabaseUrl);
    if(base.protocol!=='https:'||base.username||base.password)return '';
    return `${base.origin}/storage/v1/object/public/z19p-assets/${segments.map(encodeURIComponent).join('/')}`;
  }catch{return '';}
}
export function portalStatus(status={}){
  const stage=status.stage||'none';
  const finalized=status.finalized===true;
  return {name:String(status.name||'Pendente de produção'),color:/^#[0-9a-f]{6}$/i.test(status.color||'')?status.color:'#ff803f',stage,finalized,step:finalized?3:stage==='production'?2:stage==='ready_production'?1:0};
}
export function validatePortalFile(file){
  if(!file)return 'Escolha a arte deste item.';
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))return 'Envie a arte em PNG, JPG ou WebP.';
  if(!Number.isSafeInteger(file.size)||file.size<1)return 'O arquivo da arte está vazio ou inválido.';
  if(file.size>PORTAL_LIMITS.maxFileBytes)return 'Cada arte pode ter até 25 MB.';
  return '';
}
export function validatePortalOrder({title='',notes='',items=[]}={},products=[],sizes=PORTAL_SIZES,catalog=[]){
  if(title.length>160)return 'Use até 160 caracteres no nome do pedido.';
  if(notes.length>3000)return 'Use até 3.000 caracteres nas observações.';
  if(!items.length)return 'Adicione pelo menos um item ao pedido.';
  if(items.length>PORTAL_LIMITS.maxItems)return 'Cada pedido pode ter até 100 itens.';
  const productIds=new Set(products.map(product=>product.id));
  let quantity=0;
  for(let i=0;i<items.length;i++){
    const item=items[i],prefix=`Item ${i+1}: `;
    if(!productIds.has(item.product_id))return prefix+'escolha um produto do catálogo.';
    if(!sizes.includes(item.size))return prefix+'escolha o tamanho.';
    if(!String(item.color||'').trim()||String(item.color).length>60)return prefix+'informe a cor da peça (até 60 caracteres).';
    if(!Number.isSafeInteger(Number(item.quantity))||Number(item.quantity)<1||Number(item.quantity)>PORTAL_LIMITS.maxQuantity)return prefix+'informe uma quantidade entre 1 e 1.000.';
    if(!String(item.art_name||'').trim())return prefix+'dê um nome para a arte.';
    if(String(item.art_name).length>160)return prefix+'use até 160 caracteres no nome da arte.';
    if(!Number.isFinite(Number(item.width_cm))||Number(item.width_cm)<.1||Number(item.width_cm)>100)return prefix+'informe uma largura da arte entre 0,1 e 100 cm.';
    if(item.art_mode==='catalog'){
      const asset=catalog.find(art=>art.id===item.reference_asset_id);
      if(!asset)return prefix+'selecione uma arte já salva.';
      const ratio=Number(asset.height)/Number(asset.width)||Number(asset.height_cm)/Number(asset.width_cm);
      if(!Number.isFinite(ratio)||ratio<=0)return prefix+'esta arte ainda precisa ter suas medidas conferidas pela equipe.';
      if(Number(item.width_cm)*ratio>300)return prefix+'a altura proporcional da arte deve ser de até 300 cm.';
    }else{const error=validatePortalFile(item.file);if(error)return prefix+error;if(item.processing)return prefix+'aguarde a preparação da arte.';if(!item.processed?.processedBlob)return prefix+'selecione uma arte válida para preparar o envio.';if(Number(item.width_cm)*item.processed.height/item.processed.width>300)return prefix+'a altura proporcional da arte deve ser de até 300 cm.';}
    quantity+=Number(item.quantity);
  }
  if(quantity>PORTAL_LIMITS.maxTotalQuantity)return 'Cada pedido pode ter até 5.000 peças.';
  return '';
}
export function normalizePortalRead(data){
  if(!data||!data.company||typeof data.company.company_name!=='string'||!Array.isArray(data.products)||!Array.isArray(data.orders)||data.orders.some(order=>!order.id||!Array.isArray(order.items)))throw new Error('Não foi possível conferir os dados recebidos. Tente atualizar novamente.');
  if(data.catalog!==undefined&&!Array.isArray(data.catalog))throw new Error('Não foi possível conferir o catálogo de artes. Tente atualizar novamente.');
  return {...data,catalog:data.catalog||[],sizes:Array.isArray(data.sizes)&&data.sizes.length?data.sizes:PORTAL_SIZES,orders:data.orders.map(order=>({...order,status:portalStatus(order.status)}))};
}
export function mergePortalOrders(current,incoming){
  const merged=new Map(current.map(order=>[order.id,order]));
  for(const order of incoming)merged.set(order.id,order);
  return [...merged.values()].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))||String(b.id).localeCompare(String(a.id)));
}
export function buildPortalSubmission(draft){
  return {title:String(draft.title||'').trim(),notes:String(draft.notes||'').trim(),items:draft.items.map(item=>{
    const base={product_id:item.product_id,size:item.size,color:String(item.color||'').trim(),quantity:Number(item.quantity),art_name:String(item.art_name||'').trim(),width_cm:Number(item.width_cm),height_cm:Number(item.height_cm)};
    return item.art_mode==='catalog'?{...base,reference_asset_id:item.reference_asset_id}:{...base,pixel_width:item.processed.width,pixel_height:item.processed.height,upload_id:item.id,processed_upload_id:item.processed_id};
  })};
}
export function portalRequestId(){
  if(typeof crypto?.randomUUID==='function')return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function isPortalDuplicateUpload(error){
  return ['Duplicate','ResourceAlreadyExists'].includes(error?.error)||['Duplicate','ResourceAlreadyExists'].includes(error?.code)||/^(The resource already exists|Asset Already Exists|The resource already exists\.)$/i.test(String(error?.message||''));
}
