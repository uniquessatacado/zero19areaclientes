import {garmentFrame,renderGarmentView,GARMENT_DEFAULTS} from './garment-scene.js?v=2.17.22';
import {garmentColor,needsGarmentTint,garmentTintClip} from './garment-colors.js?v=2.17.22';

export const ZERO19_VENDUS_TENANT='0e885daf-b461-4384-b2c2-8ed2cf33478b';
const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const sideForSurface=surface=>surface==='left_sleeve'?'left':surface==='right_sleeve'?'right':surface==='back'?'back':'front';

export function isBlankShirtCategory(name=''){
  const value=norm(name);
  if(/time|brasil|waffle|cueca|meia/.test(value))return false;
  return /(camis|algod|dry ?fit|malha fria|peruan|suedine|oversized|manga longa|polo|pima)/.test(value);
}
export function modelForCatalog(category='',product=''){
  return /oversized|oversize|over size/.test(norm(category+' '+product))?'oversized':'normal';
}
export function colorForCatalog(name='',hex=''){
  const value=norm(name),clean=/^#[0-9a-f]{6}$/i.test(String(hex||''))?String(hex).toLowerCase():'';
  if(value.includes('preta')||value.includes('preto'))return {id:'black',name:name||'Preta',hex:clean||'#16181b'};
  if(value.includes('off'))return {id:'offwhite',name:name||'Off-white',hex:clean||'#e7dfcb'};
  if(value.includes('branc'))return {id:'white',name:name||'Branca',hex:clean||'#f4f4f1'};
  if(value.includes('chumbo')||value==='cinza')return {id:'charcoal',name:name||'Cinza',hex:clean||'#44464b'};
  if(value.includes('marinho'))return {id:'navy',name:name||'Azul-marinho',hex:clean||'#182b49'};
  if(value.includes('vermel'))return {id:'red',name:name||'Vermelha',hex:clean||'#b5222d'};
  if(value.includes('bege')||value.includes('areia'))return {id:'beige',name:name||'Bege',hex:clean||'#c9b48f'};
  if(value.includes('marrom'))return {id:'brown',name:name||'Marrom',hex:clean||'#6e4633'};
  return clean?{id:'custom-'+clean.slice(1),name:name||clean,hex:clean}:{id:'black',name:name||'Preta',hex:'#16181b'};
}

export async function loadBlankShirtCatalog(supabase,{tenantId=ZERO19_VENDUS_TENANT}={}){
  const {data:products,error}=await supabase.from('products')
    .select('id,name,subcategory_id,color_id,main_image_url,subcategories!products_subcategory_id_fkey(id,name),colors!products_color_id_fkey(id,name,hex_code)')
    .eq('tenant_id',tenantId).eq('is_active',true).order('name').range(0,999);
  if(error)throw error;
  const rows=(products||[]).filter(row=>isBlankShirtCategory(row.subcategories?.name));
  const ids=rows.map(row=>row.id),variants=[];
  for(let start=0;start<ids.length;start+=150){
    const batch=ids.slice(start,start+150);if(!batch.length)continue;
    const result=await supabase.from('product_variants').select('id,product_id,size,available_quantity').in('product_id',batch).order('size');
    if(result.error)throw result.error;variants.push(...(result.data||[]));
  }
  const variantsByProduct=new Map();
  for(const variant of variants){const list=variantsByProduct.get(variant.product_id)||[];list.push(variant);variantsByProduct.set(variant.product_id,list)}
  const categories=new Map();
  for(const row of rows){
    const category=row.subcategories;if(!category)continue;
    if(!categories.has(category.id))categories.set(category.id,{id:category.id,name:category.name,products:[]});
    const color=colorForCatalog(row.colors?.name,row.colors?.hex_code);
    categories.get(category.id).products.push({
      id:row.id,name:row.name,image:row.main_image_url||'',subcategoryId:category.id,subcategoryName:category.name,
      model:modelForCatalog(category.name,row.name),colorId:color.id,colorName:color.name,colorHex:color.hex,
      variants:(variantsByProduct.get(row.id)||[]).map(v=>({id:v.id,size:String(v.size||''),available:Number(v.available_quantity||0)}))
    });
  }
  return [...categories.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
}

export function pieceScene(piece={}){
  const model=piece.garment_model==='oversized'?'oversized':'normal',color=colorForCatalog(piece.color_name,piece.color_hex);
  return {version:1,title:piece.name||piece.product_name||'Camiseta',model,color:color.id,colorHex:color.hex,colorName:color.name,customColors:color.id.startsWith('custom-')?[color]:[],measurements:{...GARMENT_DEFAULTS[model]},layers:[]};
}

export function realMockupPreview(piece,{surface='front',artUrl='',position=null,widthCm=0,heightCm=0,escapeHTML=value=>String(value)}={}){
  const scene=pieceScene(piece),side=sideForSurface(surface),frame=garmentFrame(scene,side),color=garmentColor(scene);
  const bg='/'+frame.path,positionStyle=frame.column*100+'% '+frame.row*100+'%';
  const tint=needsGarmentTint(scene)?'<span class="real-shirt-tint" style="background-color:'+escapeHTML(color.hex)+';background-image:url(\''+escapeHTML(bg)+'\');background-size:200% 200%;background-position:'+positionStyle+';background-blend-mode:multiply;clip-path:'+escapeHTML(garmentTintClip(scene,side))+'"></span>':'';
  let art='';
  if(artUrl&&position&&widthCm>0&&heightCm>0){
    const wp=widthCm/frame.widthCm*frame.fraction*100,hp=heightCm/frame.lengthCm*frame.heightFraction*100,cx=(frame.left+Number(position.anchor_x)*frame.fraction)*100,cy=(frame.top+Number(position.anchor_y)*frame.heightFraction)*100;
    art='<img class="real-shirt-art" src="'+escapeHTML(artUrl)+'" alt="" style="left:'+(cx-wp/2)+'%;top:'+(cy-hp/2)+'%;width:'+wp+'%;height:'+hp+'%">';
  }
  return '<div class="real-shirt-photo" style="aspect-ratio:1 / '+frame.ratio+';background-image:url(\''+escapeHTML(bg)+'\');background-size:200% 200%;background-position:'+positionStyle+'">'+tint+art+'</div>';
}

export async function renderPieceMockup(asset,piece,{surface='front',position,widthCm,heightCm,publicUrl}={}){
  const scene=pieceScene(piece),side=sideForSurface(surface),frame=garmentFrame(scene,side),ratio=widthCm/heightCm;
  scene.layers=[{id:crypto.randomUUID(),assetId:asset.id,name:asset.name,path:asset.processed_path||asset.original_path,side,width:widthCm,ratio,x:Number(position.anchor_x)*frame.widthCm,y:Number(position.anchor_y)*frame.lengthCm,locked:true,halftone:false}];
  return renderGarmentView(scene,side,{width:1200,annotations:false,blank:false,publicUrl});
}
