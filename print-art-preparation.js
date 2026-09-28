// Prepare from a stable source; never repeatedly enlarge the previous review.
export async function preparePrintArt(asset,{widthCm,heightCm,owner,actor,bucket,supabase,processImage,uploadFile,onStage=()=>{}}){
  if(!processImage)throw new Error('Preparação de impressão indisponível. Recarregue o sistema antes de salvar.');
  const previous=asset.metadata?.print_preparation;
  const unchanged=Boolean(previous?.output_path)&&previous.output_path===asset.processed_path;
  const source=(unchanged&&previous.source_path)||asset.processed_path||asset.original_path;
  if(unchanged&&previous?.version===1&&previous.width_cm===widthCm&&previous.height_cm===heightCm&&asset.alpha_trimmed&&asset.processed_path!==source)return asset;
  if(!(widthCm>0&&heightCm>0)||!source)throw new Error('Confira o arquivo e as medidas da arte.');
  onStage('Lendo o arquivo para impressão…');
  const downloaded=await supabase.storage.from(bucket).download(source);if(downloaded.error)throw downloaded.error;
  const result=await processImage(downloaded.data,{trim:true,targetWidthCm:widthCm,targetHeightCm:heightCm,onStage});
  const path=owner+'/'+asset.workspace_id+'/print-ready/'+asset.id+'/'+crypto.randomUUID()+'.png';
  onStage('Salvando PNG preparado para impressão…');
  if(uploadFile)await uploadFile(path,result.blob,{contentType:'image/png'});
  else{const uploaded=await supabase.storage.from(bucket).upload(path,result.blob,{contentType:'image/png',upsert:false});if(uploaded.error)throw uploaded.error;}
  const patch={processed_path:path,mime_type:'image/png',size_bytes:result.blob.size,width:result.width,height:result.height,dpi:300,alpha_trimmed:true,maximized:Boolean(result.upscaled),updated_by:actor,updated_at:new Date().toISOString(),metadata:{...asset.metadata,print_preparation:{version:1,source_path:source,output_path:path,width_cm:widthCm,height_cm:heightCm,dpi:300,engine:result.engine,prepared_at:new Date().toISOString()}}};
  // Preserve previous files, including ones used by existing film snapshots.
  const saved=await supabase.from('z19p_assets').update(patch).eq('id',asset.id).eq('owner_id',owner).select('*').single();
  if(saved.error)throw saved.error;
  return saved.data;
}
