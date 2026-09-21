import {normalizeGarmentScene,garmentFrame,garmentAnchors,layerOutsideSurface,renderGarmentPresentation} from './garment-scene.js?v=2.17.11';

// A quote must start from its own current final artwork, never a montage left
// on the first reference asset by another project. Saved positions are reused
// only from this order's official mockup and refreshed with current print sizes.
export function quoteGarmentScene(quote,assets,profiles,owner){
  const items=(quote.items||[]).filter(item=>item.item_kind==='art');
  if(!quote.project_id||!quote.workspace_id)throw new Error('Salve o orçamento vinculado ao pedido antes de criar o mockup.');
  if(!items.length||items.some(item=>!item.final_asset_id))throw new Error('Vincule a arte final de cada item do orçamento antes de criar o mockup oficial.');
  if(items.length>40)throw new Error('Este mockup comporta até 40 estampas. Separe a preparação em pedidos antes de continuar.');
  const byId=new Map(assets.map(asset=>[asset.id,asset])),byProfile=new Map(profiles.map(profile=>[profile.asset_id,profile])),ids=new Set(items.map(item=>item.final_asset_id));
  const official=byId.get(quote.official_mockup_asset_id),previous=official?.metadata?.garment_scene;
  const reusable=official?.owner_id===owner&&official.workspace_id===quote.workspace_id&&official.project_id===quote.project_id&&official.asset_type==='mockup'&&official.metadata?.official_mockup===true&&Array.isArray(previous?.layers)&&[...ids].every(id=>previous.layers.some(layer=>layer.assetId===id));
  const scene=normalizeGarmentScene(reusable?previous:{title:quote.title||'Mockup do pedido'}),used=new Set();
  scene.layers=items.map(item=>{
    const asset=byId.get(item.final_asset_id),profile=byProfile.get(item.final_asset_id);
    if(!asset||asset.owner_id!==owner||asset.workspace_id!==quote.workspace_id||asset.asset_type!=='arte'||!(asset.processed_path||asset.original_path))throw new Error('Uma arte final não está mais disponível nesta empresa. Confira os vínculos do orçamento.');
    const width=Number(profile?.default_width_cm),height=Number(profile?.default_height_cm);
    if(profile?.owner_id!==owner||!Number.isFinite(width)||!Number.isFinite(height)||width<.1||width>200||height<.1||height>200||width/height<.001||width/height>1000)throw new Error(`Configure as medidas de produção de ${asset.name||'cada arte final'} antes de criar o mockup.`);
    const placement=item.metadata?.placement||'Frente',plannedSide=placement==='Manga esquerda'?'left':placement==='Manga direita'?'right':['Costas','Nuca'].includes(placement)?'back':'front';
    const candidates=reusable?previous.layers.filter(layer=>!used.has(layer)&&layer.assetId===asset.id&&['front','back','left','right'].includes(layer.side)):[],saved=candidates.find(layer=>layer.side===plannedSide)||candidates[0],side=saved?.side||plannedSide;
    if(saved)used.add(saved);
    const frame=garmentFrame(scene,side),anchor=garmentAnchors(scene,side).find(value=>value.id===(placement==='Peito esquerdo'?'chest-left':placement==='Peito direito'?'chest-right':side==='front'||side==='back'?'chest-center':'sleeve-center'));
    return {id:saved?.id||crypto.randomUUID(),assetId:asset.id,name:asset.name||item.product_name||'Arte final',path:asset.processed_path||asset.original_path,side,width,ratio:width/height,x:Number.isFinite(saved?.x)?saved.x:anchor?.x??frame.widthCm/2,y:Number.isFinite(saved?.y)?saved.y:anchor?.y??frame.lengthCm*.3,locked:Boolean(saved?.locked),halftone:Boolean(profile.halftone)};
  });
  return scene;
}

export async function prepareQuoteGarmentMockup(ctx,quote,{signal}={}){
  const owner=ctx.accountOwnerId(),snapshot=structuredClone(quote),finalIds=[...new Set((snapshot.items||[]).filter(item=>item.item_kind==='art').map(item=>item.final_asset_id).filter(Boolean))];
  if(!owner)throw new Error('Entre novamente na conta para preparar o mockup.');
  if(!finalIds.length||(snapshot.items||[]).some(item=>item.item_kind==='art'&&!item.final_asset_id))throw new Error('Vincule a arte final de cada item do orçamento antes de criar o mockup oficial.');
  const read=query=>signal&&query.abortSignal?query.abortSignal(signal):query;
  const results=await Promise.all([
    read(ctx.supabase.from('z19p_assets').select('id,owner_id,workspace_id,project_id,name,asset_type,original_path,processed_path,metadata').eq('owner_id',owner).eq('workspace_id',snapshot.workspace_id).in('id',[...new Set([...finalIds,snapshot.official_mockup_asset_id].filter(Boolean))])),
    read(ctx.supabase.from('z19p_asset_print_profiles').select('asset_id,owner_id,default_width_cm,default_height_cm,halftone').eq('owner_id',owner).in('asset_id',finalIds)),
  ]);
  signal?.throwIfAborted();if(ctx.accountOwnerId()!==owner)throw new DOMException('A conta mudou.','AbortError');
  for(const result of results)if(result.error)throw result.error;
  return {asset:null,projectId:snapshot.project_id,workspaceId:snapshot.workspace_id,initialScene:quoteGarmentScene(snapshot,results[0].data||[],results[1].data||[],owner)};
}

export function validateOfficialGarmentScene(input){
  if(!input||!Array.isArray(input.layers)||!input.layers.length||input.layers.length>40)throw new Error('Adicione as artes finais antes de salvar o mockup do pedido.');
  for(const layer of input.layers)if(!layer?.assetId||!layer.path||!['front','back','left','right'].includes(layer.side)||!['width','ratio','x','y'].every(key=>Number.isFinite(layer[key]))||layer.width<=0||layer.ratio<=0)throw new Error('Confira a origem, as medidas e a posição de cada estampa.');
  const scene=normalizeGarmentScene(input);
  if(scene.layers.some(layer=>layerOutsideSurface(scene,layer)))throw new Error('Existe uma estampa fora da superfície medida. Ajuste tamanho ou posição antes de salvar o mockup oficial.');
  return scene;
}

// A separate, annotated presentation asset; never replaces a production image.
export async function saveOfficialGarmentMockup(ctx,input,{workspaceId,projectId,signal}={}){
  const scene=validateOfficialGarmentScene(input),owner=ctx.accountOwnerId(),user=ctx.state().session?.user?.id;
  const guard=()=>{signal?.throwIfAborted();if(!owner||!user||ctx.accountOwnerId()!==owner||ctx.state().session?.user?.id!==user)throw new DOMException('A conta mudou. Reabra o mockup.','AbortError');};
  guard();if(!workspaceId||!projectId)throw new Error('Abra esta montagem pelo pedido para salvar um mockup oficial vinculado.');
  const ids=[...new Set(scene.layers.map(layer=>layer.assetId))],results=await Promise.all([
    ctx.supabase.from('z19p_projects').select('id,workspace_id,owner_id').eq('owner_id',owner).eq('workspace_id',workspaceId).eq('id',projectId).single(),
    ctx.supabase.from('z19p_assets').select('id,owner_id,workspace_id,asset_type,original_path,processed_path,metadata').eq('owner_id',owner).in('id',ids),
  ]);guard();for(const result of results)if(result.error)throw result.error;
  if(!results[0].data||results[0].data.owner_id!==owner||results[0].data.workspace_id!==workspaceId)throw new Error('Este pedido não está disponível nesta conta.');
  const records=new Map((results[1].data||[]).map(row=>[row.id,row]));
  for(const layer of scene.layers){const row=records.get(layer.assetId);if(!row||row.owner_id!==owner||row.workspace_id!==workspaceId||row.asset_type!=='arte'||![row.original_path,row.processed_path,...(Array.isArray(row.metadata?.revision_paths)?row.metadata.revision_paths:[])].includes(layer.path))throw new Error('Use somente artes desta empresa no mockup oficial; uma referência está ausente ou mudou de arquivo.');}
  const canvas=await renderGarmentPresentation(scene,{annotations:true,publicUrl:ctx.publicUrl});let blob,width,height;
  try{guard();width=canvas.width;height=canvas.height;blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Não foi possível gerar o mockup oficial.')),'image/png'));guard();if(ctx.setPngDpi)blob=await ctx.setPngDpi(blob,300);guard();}finally{canvas.width=canvas.height=1;}
  const id=crypto.randomUUID(),path=`${owner}/${workspaceId}/mockups/${id}/official.png`,row={id,owner_id:owner,workspace_id:workspaceId,project_id:projectId,folder_id:null,name:`Mockup oficial — ${scene.title}`.slice(0,180),asset_type:'mockup',original_path:path,processed_path:path,mime_type:'image/png',size_bytes:blob.size,width,height,dpi:300,alpha_trimmed:false,background_removed:false,maximized:false,created_by:user,updated_by:user,metadata:{garment_scene:scene,official_mockup:true,placement_units:'cm',placement_origin:'surface-top-left',reference_asset_ids:ids}};
  const upload=await ctx.supabase.storage.from('z19p-assets').upload(path,blob,{contentType:'image/png',upsert:false});guard();if(upload.error)throw upload.error;
  const saved=await ctx.supabase.from('z19p_assets').insert(row).select().single();guard();if(saved.error)throw new Error('A imagem foi enviada, mas não foi possível confirmar seu cadastro. Nenhuma arte original foi alterada. '+saved.error.message);
  if(saved.data?.id!==id||saved.data?.owner_id!==owner||saved.data?.project_id!==projectId)throw new Error('O cadastro do mockup não foi confirmado. Atualize o pedido antes de tentar novamente.');
  return saved.data;
}
