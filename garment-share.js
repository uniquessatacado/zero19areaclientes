import {normalizeGarmentScene,GARMENT_SIDES} from './garment-scene.js?v=2.17.3';
import {GARMENT_COLORS,validGarmentHex} from './garment-colors.js?v=2.17.11';
export const GARMENT_SHARE_MAX_BYTES=512*1024;
const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
export const isGarmentSharePath=path=>typeof path==='string'&&new RegExp(`^${uuid}/presentations/${uuid}/scene\\.json$`,'i').test(path);
export const isPublicGarmentArtPath=path=>typeof path==='string'&&path.length<=2048&&new RegExp(`^${uuid}/`,'i').test(path)&&!/[\\%?#:\x00-\x1f\x7f]/.test(path)&&!path.split('/').some(part=>!part||part==='.'||part==='..')&&/\.(png|jpe?g|webp)$/i.test(path);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
function validScene(scene){
  const validColor=object(scene)&&(GARMENT_COLORS.some(color=>color.id===scene.color)||(/^custom-[0-9a-f]{6}$/i.test(scene.color||'')&&validGarmentHex(scene.colorHex)&&scene.color.slice(7).toLowerCase()===scene.colorHex.slice(1).toLowerCase()));
  if(!object(scene)||!['normal','oversized'].includes(scene.model)||!validColor||!Array.isArray(scene.layers)||scene.layers.length>40)throw new Error('A montagem 3D está em formato inválido.');
  if(!object(scene.measurements)||Object.values(scene.measurements).some(value=>!Number.isFinite(value)||value<5||value>150))throw new Error('As medidas da peça são inválidas.');
  for(const key of ['bodyWidth','bodyLength','sleeveWidth','sleeveLength'])if(!Number.isFinite(scene.measurements[key]))throw new Error('Faltam medidas da peça.');
  for(const layer of scene.layers){
    if(!object(layer)||!isPublicGarmentArtPath(layer.path)||!GARMENT_SIDES.includes(layer.side)||!['width','ratio','x','y'].every(key=>Number.isFinite(layer[key]))||layer.width<.1||layer.width>200||layer.ratio<.001||layer.ratio>1000||Math.abs(layer.x)>350||Math.abs(layer.y)>350)throw new Error('Uma das artes da montagem é inválida ou não está na biblioteca pública de imagens.');
  }
  return scene;
}
export function createGarmentSharePayload(input){
  const scene=validScene(normalizeGarmentScene(input));
  const payload={version:1,kind:'z19p-garment-3d',scene:{title:scene.title,model:scene.model,color:scene.color,colorHex:scene.colorHex,colorName:scene.colorName,measurements:scene.measurements,layers:scene.layers.map((layer,index)=>({id:`print-${index+1}`,name:layer.name,path:layer.path,side:layer.side,width:layer.width,ratio:layer.ratio,x:layer.x,y:layer.y,locked:true}))}};
  if(new TextEncoder().encode(JSON.stringify(payload)).length>GARMENT_SHARE_MAX_BYTES)throw new Error('A apresentação excede o limite de tamanho.');
  return payload;
}
export function parseGarmentSharePayload(payload){
  if(!object(payload)||payload.version!==1||payload.kind!=='z19p-garment-3d')throw new Error('Esta apresentação 3D está em formato incompatível.');
  validScene(payload.scene);
  // Recreate from a strict whitelist: no database identifiers, commands or costs.
  return createGarmentSharePayload(payload.scene).scene;
}
// Ownership is the database row, not the storage prefix: legacy team uploads
// legitimately start with the employee UUID while belonging to the same account.
export async function assertGarmentAssetsBelongToAccount(ctx,scene,signal){
  const owner=ctx.accountOwnerId(),user=ctx.state().session?.user?.id,layers=scene.layers||[];
  signal?.throwIfAborted();if(!layers.length)return;
  const ids=[...new Set(layers.map(layer=>layer.assetId).filter(Boolean))];
  if(!ids.length||layers.some(layer=>!layer.assetId))throw new Error('Uma estampa perdeu o vínculo com o cadastro. Reabra a arte antes de compartilhar.');
  const result=await ctx.supabase.from('z19p_assets').select('id,owner_id,original_path,processed_path,metadata').eq('owner_id',owner).in('id',ids);
  signal?.throwIfAborted();if(ctx.accountOwnerId()!==owner||ctx.state().session?.user?.id!==user)throw new Error('A conta mudou. Reabra a montagem.');
  if(result.error)throw result.error;
  const records=new Map((result.data||[]).map(record=>[record.id,record]));
  if(layers.some(layer=>{const record=records.get(layer.assetId);return !record||record.owner_id!==owner||![record.original_path,record.processed_path,...(Array.isArray(record.metadata?.revision_paths)?record.metadata.revision_paths:[])].includes(layer.path)}))throw new Error('Uma estampa não está disponível nesta conta ou mudou de arquivo. Reabra essa arte na biblioteca antes de publicar.');
}
