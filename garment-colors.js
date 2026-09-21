// The palette is presentation data, never a transformation of artwork pixels.
export const GARMENT_COLORS=Object.freeze([
  {id:'black',name:'Preto',hex:'#16181b'},
  {id:'offwhite',name:'Off-white',hex:'#e7dfcb'},
  {id:'charcoal',name:'Cinza chumbo',hex:'#44464b'},
  {id:'red',name:'Vermelho',hex:'#b5222d'},
  {id:'navy',name:'Azul-marinho',hex:'#182b49'},
  {id:'white',name:'Branco',hex:'#f4f4f1'},
  {id:'beige',name:'Bege',hex:'#c9b48f'},
  {id:'brown',name:'Marrom',hex:'#6e4633'},
]);
export const validGarmentHex=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
export function normalizeCustomGarmentColors(values=[]){
  const found=new Map();
  for(const entry of Array.isArray(values)?values:[]){
    if(!entry||!validGarmentHex(entry.hex))continue;
    const hex=entry.hex.toLowerCase(),name=String(entry.name||hex).trim().slice(0,40)||hex;
    if(!found.has(hex))found.set(hex,{id:'custom-'+hex.slice(1),name,hex});
    if(found.size===32)break;
  }
  return [...found.values()];
}
export function garmentColor(scene={}){
  const preset=GARMENT_COLORS.find(color=>color.id===scene.color);
  if(preset)return {...preset};
  const hex=validGarmentHex(scene.colorHex)?scene.colorHex.toLowerCase():/^custom-[0-9a-f]{6}$/i.test(scene.color||'')?'#'+scene.color.slice(7).toLowerCase():null;
  if(!hex)return {...GARMENT_COLORS[0]};
  return {id:'custom-'+hex.slice(1),name:String(scene.colorName||hex).trim().slice(0,40)||hex,hex};
}
export function garmentPalette(scene={},additional=[]){
  const current=garmentColor(scene),custom=normalizeCustomGarmentColors([...(current.id.startsWith('custom-')?[current]:[]),...(scene.customColors||[]),...additional]);
  return [...GARMENT_COLORS,...custom];
}
export const needsGarmentTint=scene=>!['black','white','offwhite'].includes(garmentColor(scene).id);

// Calibrated silhouettes of the existing white photographic reference atlases.
// Coordinates are local to one 627px atlas cell. Both CSS and Canvas use them.
// This is a visual color simulation, not a measured fabric/Pantone conversion.
export function garmentSilhouette(scene,side){
  const over=scene.model==='oversized',sleeve=side==='left'||side==='right';
  let points;
  if(sleeve){
    points=over?[[.62,.003],[.658,.06],[.69,.139],[.714,.233],[.721,.345],[.722,.48],[.741,.936],[.729,.947],[.66,.959],[.568,.969],[.457,.968],[.357,.956],[.259,.929],[.291,.429],[.307,.295],[.336,.178],[.387,.091],[.48,.042],[.55,.009]]:[[.617,.017],[.65,.063],[.69,.146],[.714,.252],[.727,.426],[.743,.914],[.719,.931],[.651,.947],[.565,.958],[.46,.959],[.366,.947],[.292,.916],[.319,.349],[.327,.3],[.367,.19],[.412,.112],[.539,.031],[.59,.023]];
    if(side==='right')points=points.map(([x,y])=>[1-x,y]);
  }else if(over){
    points=[[.408,.049],[.373,.065],[.242,.12],[.016,.364],[.165,.517],[.205,.47],[.192,.93],[.81,.93],[.797,.47],[.839,.517],[.987,.364],[.76,.12],[.626,.065],[.59,.049],[.563,.065],[.526,.074],[.486,.075],[.447,.065]];
  }else{
    points=[[.411,.046],[.377,.061],[.239,.115],[.037,.28],[.152,.422],[.21,.395],[.203,.935],[.797,.935],[.79,.395],[.847,.422],[.961,.28],[.761,.115],[.623,.062],[.589,.046],[.55,.061],[.503,.066],[.454,.061]];
  }
  return points;
}
export const garmentTintClip=(scene,side)=>'polygon('+garmentSilhouette(scene,side).map(([x,y])=>`${x*100}% ${y*100}%`).join(',')+')';
export function paintGarmentTint(context,scene,side,width,height){
  if(!needsGarmentTint(scene))return;
  context.save();context.beginPath();garmentSilhouette(scene,side).forEach(([x,y],index)=>context[index?'lineTo':'moveTo'](x*width,y*height));context.closePath();context.clip();context.globalCompositeOperation='multiply';context.fillStyle=garmentColor(scene).hex;context.fillRect(0,0,width,height);context.restore();
}

// Read only a small projection, not every scene's artwork or every asset file.
// Missing/failed cloud reads do not prevent creating a montage or erase colors.
export async function loadSavedGarmentColors(ctx,{signal}={}){
  const owner=ctx.accountOwnerId(),user=ctx.state().session?.user?.id;
  if(!owner||!user)throw new Error('Entre na conta para carregar suas cores.');
  const read=(table,columns)=>{let query=ctx.supabase.from(table).select(columns).eq('owner_id',owner);if(query.not)query=query.not(table==='z19p_assets'?'metadata->garment_scene->customColors':'scene->customColors','is',null);query=query.order('updated_at',{ascending:false}).range(0,99);if(signal&&query.abortSignal)query=query.abortSignal(signal);return query;};
  const results=await Promise.allSettled([
    read('z19p_garment_scenes','custom_colors:scene->customColors,color:scene->>color,color_hex:scene->>colorHex,color_name:scene->>colorName'),
    read('z19p_assets','custom_colors:metadata->garment_scene->customColors,color:metadata->garment_scene->>color,color_hex:metadata->garment_scene->>colorHex,color_name:metadata->garment_scene->>colorName'),
  ]);
  signal?.throwIfAborted();if(ctx.accountOwnerId()!==owner||ctx.state().session?.user?.id!==user)throw new DOMException('A conta mudou.','AbortError');
  const colors=[],warnings=[];
  for(const result of results){if(result.status==='rejected'||result.value.error){warnings.push('Não foi possível carregar todas as cores salvas. As cores desta montagem foram preservadas.');continue;}
    for(const row of result.value.data||[]){const scene=row.scene||row.metadata?.garment_scene||{color:row.color,colorHex:row.color_hex,colorName:row.color_name,customColors:row.custom_colors};colors.push(...normalizeCustomGarmentColors(scene.customColors));const current=garmentColor(scene);if(current.id.startsWith('custom-'))colors.push(current);}
  }
  return {colors:normalizeCustomGarmentColors(colors),warning:warnings[0]||''};
}
