
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const num=v=>Number(String(v??'').replace(',','.'));
const uuid=()=>globalThis.crypto?.randomUUID?.()||('z19-'+Date.now()+'-'+Math.random().toString(36).slice(2));
export const GARMENT_MODELS=Object.freeze({
  normal:{label:'Camiseta normal',bodyWidth:54,bodyLength:74,sleeveWidth:18,sleeveLength:22},
  oversized:{label:'Oversized',bodyWidth:64,bodyLength:76,sleeveWidth:24,sleeveLength:27},
  babylook:{label:'Baby Look feminina',bodyWidth:46,bodyLength:64,sleeveWidth:15,sleeveLength:18},
  kids:{label:'Infantil',bodyWidth:38,bodyLength:52,sleeveWidth:14,sleeveLength:17}
});
export const GARMENT_COLORS=Object.freeze([
  {id:'black',label:'Preta',hex:'#17191c'},{id:'offwhite',label:'Off-white',hex:'#e7dfcb'},
  {id:'white',label:'Branca',hex:'#f4f4f1'},{id:'charcoal',label:'Cinza chumbo',hex:'#46484d'},
  {id:'navy',label:'Azul-marinho',hex:'#1b2c48'},{id:'red',label:'Vermelha',hex:'#b32631'},
  {id:'beige',label:'Bege',hex:'#c9b48f'},{id:'brown',label:'Marrom',hex:'#6d4634'}
]);
const SURFACE_LABELS={front:'Frente',back:'Costas',left_sleeve:'Manga esquerda',right_sleeve:'Manga direita'};

export function workspaceOfficialOrderState(projects=[],workspaceId){
  const orders=projects.filter(p=>p.workspace_id===workspaceId&&String(p.official_order_ref||'').trim());
  return {hasOfficialOrder:orders.length>0,count:orders.length,orders};
}
export function officialOrderItems(project){
  const payload=project?.official_order_payload&&typeof project.official_order_payload==='object'?project.official_order_payload:{};
  const rows=Array.isArray(payload.items)?payload.items:Array.isArray(payload.order_items)?payload.order_items:Array.isArray(payload.products)?payload.products:[];
  return rows.map((row,index)=>({
    ref:String(row.id??row.order_item_id??row.external_id??index+1),
    name:String(row.product_name??row.name??row.title??'Camiseta'),
    image:String(row.product_image??row.image??row.image_url??''),
    size:String(row.size??row.tamanho??''),
    colorName:String(row.color_name??row.color??row.cor??''),
    category:String(row.category??row.categoria??''),
    model:String(row.model??row.style??row.modelo??''),
    quantity:Math.max(1,parseInt(row.quantity??row.quantidade??1,10)||1),
    raw:row
  }));
}
function modelFrom(item={}){
  const text=norm([item.model,item.category,item.name].filter(Boolean).join(' '));
  if(/oversized|over size|oversize/.test(text))return 'oversized';
  if(/baby ?look|feminin/.test(text))return 'babylook';
  if(/infantil|kids|crianca|juvenil/.test(text))return 'kids';
  return 'normal';
}
function colorFrom(item={}){
  const text=norm(item.colorName);
  const found=GARMENT_COLORS.find(c=>norm(c.label)===text||text.includes(norm(c.label).split('-')[0]));
  if(found)return found.id;
  if(text.includes('preto'))return 'black';if(text.includes('off'))return 'offwhite';if(text.includes('branc'))return 'white';
  if(text.includes('chumbo')||text.includes('cinza'))return 'charcoal';if(text.includes('marinho'))return 'navy';
  if(text.includes('vermel'))return 'red';if(text.includes('bege'))return 'beige';if(text.includes('marrom'))return 'brown';
  return 'black';
}
function colorInfo(id){return GARMENT_COLORS.find(c=>c.id===id)||GARMENT_COLORS[0]}
function surfaceMetrics(model,surface){
  const m=GARMENT_MODELS[model]||GARMENT_MODELS.normal,sleeve=surface==='left_sleeve'||surface==='right_sleeve';
  return sleeve?{width:m.sleeveWidth,length:m.sleeveLength}:{width:m.bodyWidth,length:m.bodyLength};
}
function fits(model,surface,width,height){
  const m=surfaceMetrics(model,surface),sleeve=surface.includes('sleeve');
  return width<=m.width*(sleeve?.86:.9)&&height<=m.length*(sleeve?.84:.86);
}
function fitsPosition(model,surface,position,width,height){
  if(!position||!fits(model,surface,width,height))return false;
  const m=surfaceMetrics(model,surface),halfW=width/m.width/2,halfH=height/m.length/2,x=Number(position.anchor_x),y=Number(position.anchor_y),margin=surface.includes('sleeve')?.06:.04;
  return x-halfW>=margin&&x+halfW<=1-margin&&y-halfH>=margin&&y+halfH<=1-margin;
}
function positionFits(model,surface,width,height,position){
  if(!fits(model,surface,width,height)||!position)return false;
  const m=surfaceMetrics(model,surface),halfW=width/m.width/2,halfH=height/m.length/2,margin=surface.includes('sleeve')?.035:.025,x=Number(position.anchor_x),y=Number(position.anchor_y);
  return x-halfW>=margin&&x+halfW<=1-margin&&y-halfH>=margin&&y+halfH<=1-margin;
}
function surfaceBox(surface){
  if(surface==='left_sleeve')return {x:.055,y:.195,w:.205,h:.285};
  if(surface==='right_sleeve')return {x:.74,y:.195,w:.205,h:.285};
  return {x:.235,y:.155,w:.53,h:.69};
}
function shirtPath(model){
  if(model==='oversized')return 'M255 195 L370 125 Q450 190 530 125 L645 195 L820 390 L700 505 L655 450 L660 1020 L240 1020 L245 450 L200 505 L80 390 Z';
  if(model==='babylook')return 'M295 205 L382 145 Q450 195 518 145 L605 205 L760 370 L665 465 L620 425 L650 1010 Q450 955 250 1010 L280 425 L235 465 L140 370 Z';
  if(model==='kids')return 'M305 215 L390 160 Q450 205 510 160 L595 215 L720 350 L635 440 L605 415 L625 970 L275 970 L295 415 L265 440 L180 350 Z';
  return 'M285 200 L380 135 Q450 195 520 135 L615 200 L785 370 L675 480 L630 435 L650 1020 L250 1020 L270 435 L225 480 L115 370 Z';
}
function mockupSvg(model,colorId,surface){
  const color=colorInfo(colorId),stroke=colorId==='black'?'#4a4d53':'#aaa59c',path=shirtPath(model);
  const surfaceHint=surfaceBox(surface),rx=surfaceHint.x*900,ry=surfaceHint.y*1120,rw=surfaceHint.w*900,rh=surfaceHint.h*1120;
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1120" viewBox="0 0 900 1120"><defs><filter id="s"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-opacity=".22"/></filter><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".18"/><stop offset=".55" stop-color="#000000" stop-opacity=".03"/><stop offset="1" stop-color="#000000" stop-opacity=".16"/></linearGradient></defs><rect width="900" height="1120" rx="34" fill="#d8d8da"/><path d="'+path+'" fill="'+color.hex+'" stroke="'+stroke+'" stroke-width="4" filter="url(#s)"/><path d="'+path+'" fill="url(#g)" opacity=".42"/><rect x="'+rx+'" y="'+ry+'" width="'+rw+'" height="'+rh+'" rx="16" fill="none" stroke="#ff7a36" stroke-opacity=".24" stroke-width="3" stroke-dasharray="10 10"/></svg>';
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
function placementCss(position,surface,widthCm,heightCm,model){
  const box=surfaceBox(surface),metrics=surfaceMetrics(model,surface);
  const w=Math.min(box.w,(widthCm/metrics.width)*box.w),h=Math.min(box.h,(heightCm/metrics.length)*box.h);
  const cx=box.x+Number(position?.anchor_x??.5)*box.w,cy=box.y+Number(position?.anchor_y??.5)*box.h;
  return {left:(cx-w/2)*100,top:(cy-h/2)*100,width:w*100,height:h*100};
}
async function loadImage(src){const img=new Image();img.crossOrigin='anonymous';img.src=src;await img.decode();return img}

export function createOfficialOrderWorkflow(ctx){
  const {supabase}=ctx,owner=()=>ctx.accountOwnerId(),user=()=>ctx.userId(),state=()=>ctx.state();
  let positionsCache=null,positionsOwner=null;
  async function loadPositions(force=false){
    const account=owner();if(!account)return [];
    if(!force&&positionsOwner===account&&positionsCache)return positionsCache;
    const {data,error}=await supabase.from('z19p_print_positions').select('*').eq('owner_id',account).eq('active',true).order('sort_order').order('label');
    if(error)throw error;positionsOwner=account;positionsCache=data||[];return positionsCache;
  }
  async function openPositionSettings(){
    const positions=await loadPositions(true),modal=document.createElement('div');modal.className='modal-backdrop official-position-settings';
    const draw=()=>{modal.innerHTML='<div class="modal wide"><div class="modal-head"><div><div class="eyebrow">CONFIGURAÇÕES</div><h2>Posições de estampa</h2><p>Cadastre os pontos que aparecem ao posicionar uma arte na peça.</p></div><button class="btn ghost small" data-close>×</button></div><div class="official-position-list">'+(positions.length?positions.map(p=>'<article><div><b>'+esc(p.label)+'</b><small>'+esc(SURFACE_LABELS[p.surface]||p.surface)+' · '+Math.round(Number(p.anchor_x)*100)+'% / '+Math.round(Number(p.anchor_y)*100)+'%</small></div><button class="btn small danger" data-delete-position="'+esc(p.id)+'">Excluir</button></article>').join(''):'<div class="empty mini">Nenhuma posição cadastrada.</div>')+'</div><form data-position-form class="official-position-form"><div class="field"><label>Nome *</label><input name="label" required placeholder="Ex.: Peito esquerdo"></div><div class="field"><label>Área *</label><select name="surface"><option value="front">Frente</option><option value="back">Costas</option><option value="left_sleeve">Manga esquerda</option><option value="right_sleeve">Manga direita</option></select></div><div class="field"><label>Posição horizontal (%)</label><input name="x" type="number" min="5" max="95" value="50"></div><div class="field"><label>Posição vertical (%)</label><input name="y" type="number" min="5" max="95" value="50"></div><button class="btn primary" type="submit">+ Adicionar posição</button></form></div>';
      modal.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>modal.remove());
      modal.querySelectorAll('[data-delete-position]').forEach(b=>b.onclick=async()=>{const id=b.dataset.deletePosition;if(!confirm('Excluir esta posição? Mockups já salvos continuam preservados.'))return;const {error}=await supabase.from('z19p_print_positions').delete().eq('id',id).eq('owner_id',owner());if(error)return ctx.toast(error.message,'err');const index=positions.findIndex(p=>p.id===id);if(index>=0)positions.splice(index,1);positionsCache=null;draw();});
      modal.querySelector('[data-position-form]').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),label=String(f.get('label')||'').trim(),surface=String(f.get('surface')||'front'),x=Math.max(.05,Math.min(.95,Number(f.get('x'))/100)),y=Math.max(.05,Math.min(.95,Number(f.get('y'))/100));if(!label)return;const code=norm(label).replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')+'_'+Date.now().toString(36);const row={owner_id:owner(),code,label,surface,zone:'custom',anchor_x:x,anchor_y:y,sort_order:(positions.at(-1)?.sort_order||0)+10,created_by:user(),updated_by:user()};const {data,error}=await supabase.from('z19p_print_positions').insert(row).select().single();if(error)return ctx.toast(error.message,'err');positions.push(data);positionsCache=null;draw();};
    };
    document.body.appendChild(modal);draw();
  }
  function productCards(project){
    return officialOrderItems(project);
  }
  async function loadManualGarments(workspaceId){
    if(!workspaceId)return [];
    const {data,error}=await supabase.from('z19p_manual_garments').select('*').eq('owner_id',owner()).eq('workspace_id',workspaceId).eq('active',true).order('created_at',{ascending:false});
    if(error)throw error;return data||[];
  }
  function manualModelOptions(category){
    if(category==='infantil')return ['kids'];
    if(category==='feminina')return ['babylook','normal','oversized'];
    return ['normal','oversized'];
  }
  function manualSizeOptions(category){
    return category==='infantil'?['2','4','6','8','10','12','14','16']:['PP','P','M','G','GG','G1','G2','G3','G4','G5'];
  }
  async function createManualGarment(workspace){
    const modal=document.createElement('div');modal.className='manual-garment-backdrop';
    let step=0,category='masculina',model='normal',size='M',color='black',busy=false;
    const steps=['Categoria','Modelagem','Tamanho','Cor'];
    return new Promise(resolve=>{
      const close=value=>{modal.remove();resolve(value||null)};
      const save=async()=>{if(busy)return;busy=true;draw();try{
        const colorData=colorInfo(color),name=[category==='masculina'?'Masculina':category==='feminina'?'Feminina':'Infantil',GARMENT_MODELS[model]?.label||model,size,colorData.label].join(' · ');
        const row={owner_id:owner(),workspace_id:workspace.id,project_id:null,name,category,garment_model:model,size,color,color_name:colorData.label,created_by:user(),updated_by:user()};
        const {data,error}=await supabase.from('z19p_manual_garments').insert(row).select().single();if(error)throw error;close(data);
      }catch(error){busy=false;draw();ctx.toast(error.message||'Não foi possível criar a camiseta.','err')}};
      const draw=()=>{
        const progress=steps.map((label,index)=>'<span class="'+(index===step?'active':index<step?'done':'')+'">'+(index+1)+'<small>'+label+'</small></span>').join('');
        let body='';
        if(step===0)body='<div class="manual-choice-grid"><button data-category="masculina" class="'+(category==='masculina'?'active':'')+'"><b>Masculina</b><small>Camiseta adulto</small></button><button data-category="feminina" class="'+(category==='feminina'?'active':'')+'"><b>Feminina</b><small>Baby Look ou camiseta feminina</small></button><button data-category="infantil" class="'+(category==='infantil'?'active':'')+'"><b>Infantil</b><small>Camiseta infantil</small></button></div>';
        if(step===1)body='<div class="manual-choice-grid">'+manualModelOptions(category).map(id=>'<button data-model="'+id+'" class="'+(model===id?'active':'')+'"><b>'+esc(GARMENT_MODELS[id]?.label||id)+'</b><small>Modelagem da peça</small></button>').join('')+'</div>';
        if(step===2)body='<div class="manual-size-grid">'+manualSizeOptions(category).map(value=>'<button data-size="'+value+'" class="'+(size===value?'active':'')+'">'+esc(value)+'</button>').join('')+'</div>';
        if(step===3)body='<div class="manual-color-grid">'+GARMENT_COLORS.map(item=>'<button data-color="'+item.id+'" class="'+(color===item.id?'active':'')+'"><i style="background:'+esc(item.hex)+'"></i><b>'+esc(item.label)+'</b></button>').join('')+'</div>';
        modal.innerHTML='<section class="manual-garment-page"><header><div><div class="eyebrow">CAMISETA SEM PEDIDO</div><h2>Criar camiseta manual</h2><p>'+esc(workspace.client_name||workspace.company_name||'Cliente')+' · etapa '+(step+1)+' de 4</p></div><button class="btn ghost" data-close>Cancelar</button></header><div class="manual-stepper">'+progress+'</div><main><h3>'+steps[step]+'</h3>'+body+'</main><footer><button class="btn" data-back '+(step===0?'disabled':'')+'>Voltar</button><div class="manual-garment-summary"><b>'+esc([category,GARMENT_MODELS[model]?.label,size,colorInfo(color).label].filter(Boolean).join(' · '))+'</b></div><button class="btn primary" data-next '+(busy?'disabled':'')+'>'+(busy?'Salvando…':step===3?'Criar camiseta':'Continuar')+'</button></footer></section>';
        modal.querySelector('[data-close]').onclick=()=>close(null);
        modal.querySelector('[data-back]').onclick=()=>{if(step>0){step--;draw()}};
        modal.querySelector('[data-next]').onclick=()=>step===3?save():(step++,draw());
        modal.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{category=b.dataset.category;model=manualModelOptions(category)[0];size=manualSizeOptions(category)[0];draw()});
        modal.querySelectorAll('[data-model]').forEach(b=>b.onclick=()=>{model=b.dataset.model;draw()});
        modal.querySelectorAll('[data-size]').forEach(b=>b.onclick=()=>{size=b.dataset.size;draw()});
        modal.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{color=b.dataset.color;draw()});
      };
      document.body.appendChild(modal);draw();
    });
  }
  async function chooseManualGarment(workspace){
    const garments=await loadManualGarments(workspace.id);
    if(!garments.length)return createManualGarment(workspace);
    const modal=document.createElement('div');modal.className='manual-garment-backdrop';
    return new Promise(resolve=>{
      const close=value=>{modal.remove();resolve(value||null)};
      modal.innerHTML='<section class="manual-garment-page choose-existing"><header><div><div class="eyebrow">CAMISETA SEM PEDIDO</div><h2>Qual camiseta vai receber esta arte?</h2><p>Use a mesma camiseta já criada ou cadastre uma nova.</p></div><button class="btn ghost" data-close>Cancelar</button></header><main><div class="manual-existing-grid">'+garments.map(g=>'<button data-garment="'+g.id+'"><div class="manual-garment-thumb"><img src="'+mockupSvg(g.garment_model,g.color,'front')+'" alt=""></div><span><b>'+esc(g.name)+'</b><small>'+esc([g.category,g.size,g.color_name].filter(Boolean).join(' · '))+'</small></span></button>').join('')+'<button class="create-new" data-new><div class="manual-garment-plus">＋</div><span><b>Criar nova camiseta</b><small>Outra peça para este cliente</small></span></button></div></main></section>';
      modal.querySelector('[data-close]').onclick=()=>close(null);
      modal.querySelectorAll('[data-garment]').forEach(b=>b.onclick=()=>close(garments.find(g=>g.id===b.dataset.garment)));
      modal.querySelector('[data-new]').onclick=async()=>{modal.remove();resolve(await createManualGarment(workspace))};
      document.body.appendChild(modal);
    });
  }
  async function generateMockup(asset,choice,position,widthCm,heightCm){
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1493;const g=canvas.getContext('2d');if(!g)throw new Error('Seu navegador não conseguiu gerar o mockup.');
    const [base,art]=await Promise.all([loadImage(mockupSvg(choice.model,choice.color,choice.surface)),loadImage(ctx.publicUrl(asset.processed_path||asset.original_path))]);
    g.drawImage(base,0,0,canvas.width,canvas.height);
    const css=placementCss(position,choice.surface,widthCm,heightCm,choice.model),x=css.left/100*canvas.width,y=css.top/100*canvas.height,w=css.width/100*canvas.width,h=css.height/100*canvas.height;
    g.drawImage(art,x,y,w,h);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Falha ao gerar mockup.')),'image/png',.95));canvas.width=canvas.height=1;return blob;
  }
  async function savePlacement(asset,workspace,project,product,choice,position,widthCm,heightCm,manualGarment=null){
    const account=owner(),actor=user(),projectId=project?.id||null,color=colorInfo(choice.color),placementId=uuid(),mockupId=uuid();
    const blob=await generateMockup(asset,choice,position,widthCm,heightCm),path=account+'/'+workspace.id+'/auto-mockups/'+mockupId+'.png';
    let uploaded=false,assetInserted=false;
    try{
      let result=await supabase.storage.from(ctx.bucket).upload(path,blob,{contentType:'image/png',upsert:false});if(result.error)throw result.error;uploaded=true;
      result=await supabase.from('z19p_assets').insert({id:mockupId,owner_id:account,workspace_id:workspace.id,project_id:projectId,folder_id:null,name:'Mockup · '+asset.name+' · '+position.label,asset_type:'mockup',original_path:path,processed_path:path,mime_type:'image/png',size_bytes:blob.size,width:1200,height:1493,dpi:300,alpha_trimmed:false,background_removed:false,maximized:false,created_by:actor,updated_by:actor,metadata:{auto_mockup:true,source_asset_id:asset.id,placement_id:placementId,manual_garment_id:manualGarment?.id||null,garment_model:choice.model,garment_color:choice.color,surface:choice.surface,position_code:position.code}});if(result.error)throw result.error;assetInserted=true;
      const row={id:placementId,owner_id:account,workspace_id:workspace.id,project_id:projectId,asset_id:asset.id,position_id:position.id,manual_garment_id:manualGarment?.id||null,external_order_ref:project?.official_order_ref||null,external_order_item_ref:product?.ref||null,garment_model:choice.model,garment_color:choice.color,garment_color_name:color.label,garment_size:choice.size||'',garment_category:choice.category||'',surface:choice.surface,position_code:position.code,width_cm:widthCm,height_cm:heightCm,mockup_asset_id:mockupId,production_state:'pending',metadata:{order_quantity:product?.quantity||1,product_name:product?.name||'',product_image:product?.image||'',anchor_x:Number(position.anchor_x),anchor_y:Number(position.anchor_y)},created_by:actor,updated_by:actor};
      result=await supabase.from('z19p_asset_placements').insert(row);if(result.error)throw result.error;
      const existing=await supabase.from('z19p_asset_print_profiles').select('*').eq('asset_id',asset.id).maybeSingle();if(existing.error)throw existing.error;
      const ratio=widthCm/heightCm,profile={asset_id:asset.id,owner_id:account,project_id:projectId,default_width_cm:widthCm,default_height_cm:heightCm,aspect_ratio:ratio,halftone:Boolean(existing.data?.halftone),allow_internal_nesting:existing.data?.allow_internal_nesting!==false,rotation_policy:existing.data?.rotation_policy||'free',ready_for_print:true,created_by:existing.data?.created_by||actor,updated_by:actor,updated_at:new Date().toISOString()};
      result=await supabase.from('z19p_asset_print_profiles').upsert(profile,{onConflict:'asset_id'});if(result.error)throw result.error;
      const metrics=surfaceMetrics(choice.model,choice.surface),metadata={...(asset.metadata||{}),official_placement_id:placementId,manual_garment_id:manualGarment?.id||null,shirt_placement:{...(asset.metadata?.shirt_placement||{}),side:choice.surface==='left_sleeve'?'left':choice.surface==='right_sleeve'?'right':choice.surface,color:choice.color,shirt_width_cm:(GARMENT_MODELS[choice.model]||GARMENT_MODELS.normal).bodyWidth,shirt_length_cm:(GARMENT_MODELS[choice.model]||GARMENT_MODELS.normal).bodyLength,sleeve_width_cm:(GARMENT_MODELS[choice.model]||GARMENT_MODELS.normal).sleeveWidth,sleeve_length_cm:(GARMENT_MODELS[choice.model]||GARMENT_MODELS.normal).sleeveLength,width_cm:widthCm,x_cm:Number(position.anchor_x)*metrics.width,y_cm:Number(position.anchor_y)*metrics.length,position_code:position.code,garment_model:choice.model,garment_size:choice.size||''}};
      result=await supabase.from('z19p_assets').update({metadata,updated_by:actor,updated_at:new Date().toISOString()}).eq('id',asset.id).eq('owner_id',account);if(result.error)throw result.error;
      return {placementId,mockupId};
    }catch(error){
      if(assetInserted)try{await supabase.from('z19p_assets').delete().eq('id',mockupId).eq('owner_id',account)}catch{}
      if(uploaded)try{await supabase.storage.from(ctx.bucket).remove([path])}catch{}
      throw error;
    }
  }
  async function openPlacementWizard(asset,{workspace=state().currentWorkspace,project=null,manualGarment=null}={}){
    if(!asset||!workspace)return null;const positions=await loadPositions(),projects=(state().currentProjects||[]).filter(p=>p.workspace_id===workspace.id),official=project&&project.official_order_ref?project:projects.find(p=>p.official_order_ref)||project||projects[0]||null,products=productCards(official);
    const modal=document.createElement('div');modal.className='official-placement-backdrop';let selectedProduct=products[0]||null,model=manualGarment?.garment_model||modelFrom(selectedProduct||{}),color=manualGarment?.color||colorFrom(selectedProduct||{}),size=manualGarment?.size||selectedProduct?.size||'',category=manualGarment?.category||selectedProduct?.category||'',surface='front',position=null,ratio=(asset.width&&asset.height?asset.width/asset.height:1),widthCm=9,heightCm=9/ratio,busy=false;
    const chooseDefault=()=>{const available=positions.filter(p=>p.surface===surface&&positionFits(model,surface,widthCm,heightCm,p));position=available[0]||null};chooseDefault();
    const draw=()=>{
      const availableSurfaces=['front','back','left_sleeve','right_sleeve'].filter(s=>fits(model,s,widthCm,heightCm)),surfacePositions=positions.filter(p=>p.surface===surface&&positionFits(model,surface,widthCm,heightCm,p));if(!availableSurfaces.includes(surface)){surface=availableSurfaces[0]||'front';position=null}if(!position||position.surface!==surface||!surfacePositions.some(p=>p.id===position.id))position=surfacePositions[0]||null;
      const css=position?placementCss(position,surface,widthCm,heightCm,model):{left:45,top:40,width:10,height:10},base=mockupSvg(model,color,surface),art=ctx.publicUrl(asset.processed_path||asset.original_path),orderWarning=official?.official_order_ref?'':'<div class="official-order-missing"><b>Pendente de pedido oficial</b><span>O pedido ainda não veio do outro sistema. Você pode posicionar manualmente agora; o vínculo oficial poderá ser associado depois.</span></div>';
      modal.innerHTML='<section class="official-placement-page"><header><div><div class="eyebrow">POSICIONAR ARTE</div><h2>'+esc(asset.name)+'</h2><p>Escolha a peça, informe a medida real e marque exatamente onde a estampa vai ficar.</p></div><button class="btn ghost" data-close>Fechar</button></header>'+orderWarning+'<div class="official-placement-layout"><main><section class="official-step"><h3>1. Camisa / produto</h3>'+(products.length?'<div class="official-product-grid">'+products.map(p=>'<button class="official-product-card '+(selectedProduct?.ref===p.ref?'active':'')+'" data-product="'+esc(p.ref)+'">'+(p.image?'<img src="'+esc(p.image)+'" loading="lazy" decoding="async" alt="">':'<span class="official-product-placeholder">CAMISA</span>')+'<div><b>'+esc(p.name)+'</b><small>'+esc([p.category,p.colorName,p.size].filter(Boolean).join(' · '))+'</small><em>'+p.quantity+' un.</em></div></button>').join('')+'</div>':'<p class="official-manual-note">Sem produtos sincronizados. Selecione abaixo o nosso mockup correspondente.</p>')+(manualGarment?'<div class="official-manual-garment-summary"><div class="manual-garment-thumb"><img src="'+mockupSvg(model,color,'front')+'" alt=""></div><div><b>'+esc(manualGarment.name)+'</b><small>'+esc([category,GARMENT_MODELS[model]?.label,size,colorInfo(color).label].filter(Boolean).join(' · '))+'</small><span>Camiseta manual deste cliente</span></div></div>':'<div class="official-garment-fields"><label>Modelo<select data-model>'+Object.entries(GARMENT_MODELS).map(([id,m])=>'<option value="'+id+'" '+(id===model?'selected':'')+'>'+esc(m.label)+'</option>').join('')+'</select></label><label>Cor<select data-color>'+GARMENT_COLORS.map(c=>'<option value="'+c.id+'" '+(c.id===color?'selected':'')+'>'+esc(c.label)+'</option>').join('')+'</select></label><label>Tamanho<input data-size value="'+esc(size)+'" placeholder="Ex.: G"></label><label>Categoria<input data-category value="'+esc(category)+'" placeholder="Ex.: Masculina"></label></div>')+'</section><section class="official-step"><h3>2. Tamanho real da estampa</h3><div class="official-size-fields"><label>Largura (cm)<input data-width inputmode="decimal" value="'+String(Number(widthCm.toFixed(3))).replace('.',',')+'"></label><span>×</span><label>Altura (cm)<input data-height inputmode="decimal" value="'+String(Number(heightCm.toFixed(3))).replace('.',',')+'"></label></div><small>A proporção original é preservada. Você pode editar largura ou altura.</small></section><section class="official-step"><h3>3. Onde vai a estampa?</h3><div class="official-surface-buttons">'+['front','back','left_sleeve','right_sleeve'].map(s=>'<button class="'+(surface===s?'active':'')+'" data-surface="'+s+'" '+(availableSurfaces.includes(s)?'':'disabled')+'>'+esc(SURFACE_LABELS[s])+'</button>').join('')+'</div><div class="official-position-buttons">'+(surfacePositions.length?surfacePositions.map(p=>'<button class="'+(position?.id===p.id?'active':'')+'" data-position="'+p.id+'">'+esc(p.label)+'</button>').join(''):'<p>Esta estampa não cabe com segurança nesta área. Reduza o tamanho ou escolha outra parte da peça.</p>')+'</div></section></main><aside><div class="official-mockup-preview"><img class="official-shirt-base" src="'+base+'" alt="Mockup '+esc(GARMENT_MODELS[model].label)+'"><img class="official-art-layer" src="'+art+'" alt="'+esc(asset.name)+'" style="left:'+css.left+'%;top:'+css.top+'%;width:'+css.width+'%;height:'+css.height+'%"></div><div class="official-preview-summary"><b>'+esc(position?.label||'Escolha uma posição')+'</b><span>'+esc(GARMENT_MODELS[model].label)+' · '+esc(colorInfo(color).label)+(size?' · '+esc(size):'')+'</span><small>'+Number(widthCm).toLocaleString('pt-BR',{maximumFractionDigits:2})+' × '+Number(heightCm).toLocaleString('pt-BR',{maximumFractionDigits:2})+' cm</small></div><button class="btn primary official-save-placement" data-save '+(!position||busy?'disabled':'')+'>'+(busy?'Salvando…':'Salvar posição e criar mockup')+'</button></aside></div></section>';
      modal.querySelector('[data-close]').onclick=()=>{if(!busy)modal.remove()};
      modal.querySelectorAll('[data-product]').forEach(b=>b.onclick=()=>{selectedProduct=products.find(p=>p.ref===b.dataset.product)||null;model=modelFrom(selectedProduct||{});color=colorFrom(selectedProduct||{});size=selectedProduct?.size||'';category=selectedProduct?.category||'';chooseDefault();draw()});
      modal.querySelector('[data-model]')?.addEventListener('change',e=>{model=e.target.value;chooseDefault();draw()});modal.querySelector('[data-color]')?.addEventListener('change',e=>{color=e.target.value;draw()});modal.querySelector('[data-size]')?.addEventListener('input',e=>{size=e.target.value});modal.querySelector('[data-category]')?.addEventListener('input',e=>{category=e.target.value});
      const w=modal.querySelector('[data-width]'),h=modal.querySelector('[data-height]');w.onchange=()=>{const v=num(w.value);if(v>0){widthCm=v;heightCm=v/ratio;chooseDefault();draw()}};h.onchange=()=>{const v=num(h.value);if(v>0){heightCm=v;widthCm=v*ratio;chooseDefault();draw()}};
      modal.querySelectorAll('[data-surface]').forEach(b=>b.onclick=()=>{surface=b.dataset.surface;chooseDefault();draw()});modal.querySelectorAll('[data-position]').forEach(b=>b.onclick=()=>{position=positions.find(p=>p.id===b.dataset.position)||position;draw()});
      modal.querySelector('[data-save]').onclick=async()=>{if(!position||busy)return;busy=true;draw();try{await savePlacement(asset,workspace,official,selectedProduct,{model,color,size,category,surface},position,widthCm,heightCm,manualGarment);ctx.toast('Arte posicionada. Mockup criado e liberado para o filme.','ok');modal.remove();await ctx.onSaved?.()}catch(error){busy=false;draw();ctx.toast(error.message||'Não foi possível salvar a posição.','err')}};
    };
    document.body.appendChild(modal);draw();return modal;
  }
  async function openPlacementPreview(asset){
    if(!asset?.id)return false;
    const {data:placement,error}=await supabase.from('z19p_asset_placements').select('*').eq('owner_id',owner()).eq('asset_id',asset.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(error)throw error;if(!placement)return false;
    let mockup=null;if(placement.mockup_asset_id){const result=await supabase.from('z19p_assets').select('id,name,processed_path,original_path').eq('id',placement.mockup_asset_id).maybeSingle();if(result.error)throw result.error;mockup=result.data}
    const source=mockup?.processed_path||mockup?.original_path;if(!source)return false;
    const modal=document.createElement('div');modal.className='official-placement-preview-backdrop';
    modal.innerHTML='<section class="official-placement-preview-page"><header><div><div class="eyebrow">POSIÇÃO SALVA</div><h2>'+esc(asset.name)+'</h2><p>Visualização do mockup oficial usado para produção.</p></div><button class="btn ghost" data-close>Fechar</button></header><main><img src="'+esc(ctx.publicUrl(source))+'" alt="Mockup '+esc(asset.name)+'"><div class="official-placement-preview-info"><b>'+esc(placement.position_code)+'</b><span>'+esc([placement.garment_category,placement.garment_color_name,placement.garment_size].filter(Boolean).join(' · '))+'</span><strong>'+Number(placement.width_cm).toLocaleString('pt-BR',{maximumFractionDigits:2})+' × '+Number(placement.height_cm).toLocaleString('pt-BR',{maximumFractionDigits:2})+' cm</strong></div></main></section>';
    modal.querySelector('[data-close]').onclick=()=>modal.remove();modal.onkeydown=e=>{if(e.key==='Escape')modal.remove()};document.body.appendChild(modal);modal.querySelector('[data-close]').focus();return true;
  }

  async function offerAfterUpload(assets,{workspace=state().currentWorkspace,projects=state().currentProjects||[],allowWithoutOrder=true}={}){
    const official=projects.find(p=>p.workspace_id===workspace?.id&&p.official_order_ref)||null;
    if(workspace?.workspace_type==='client'&&!official&&!allowWithoutOrder)throw new Error('Este cliente ainda não possui pedido oficial.');
    const fallback=projects.find(p=>p.workspace_id===workspace?.id)||null,arts=(assets||[]).filter(a=>a?.asset_type==='arte');
    for(const asset of arts){
      let manualGarment=null;
      if(workspace?.workspace_type==='client'&&!official){
        manualGarment=await chooseManualGarment(workspace);
        if(!manualGarment)throw new Error('A arte foi salva, mas a escolha da camiseta foi cancelada.');
      }
      await new Promise((resolve,reject)=>{let finished=false;const finish=error=>{if(finished)return;finished=true;clearInterval(watch);error?reject(error):resolve()};const watch=setInterval(()=>{if(!document.querySelector('.official-placement-backdrop'))finish()},180);openPlacementWizard(asset,{workspace,project:official||fallback,manualGarment}).catch(finish)})
    }
  }
  async function pendingRows(){
    const account=owner();if(!account)return [];
    const {data:placements,error}=await supabase.from('z19p_asset_placements').select('*').eq('owner_id',account).eq('production_state','pending').order('created_at');if(error)throw error;if(!placements?.length)return [];
    const assetIds=[...new Set(placements.flatMap(p=>[p.asset_id,p.mockup_asset_id].filter(Boolean)))],projectIds=[...new Set(placements.map(p=>p.project_id).filter(Boolean))],workspaceIds=[...new Set(placements.map(p=>p.workspace_id))];
    const [ar,pr,wr]=await Promise.all([supabase.from('z19p_assets').select('id,name,processed_path,original_path,metadata').in('id',assetIds),supabase.from('z19p_projects').select('id,workspace_id,title,official_order_ref,official_order_status,official_order_payload').in('id',projectIds),supabase.from('z19p_workspaces').select('id,company_name,client_name').in('id',workspaceIds)]);if(ar.error)throw ar.error;if(pr.error)throw pr.error;if(wr.error)throw wr.error;
    const am=new Map((ar.data||[]).map(a=>[a.id,a])),pm=new Map((pr.data||[]).map(p=>[p.id,p])),wm=new Map((wr.data||[]).map(w=>[w.id,w]));
    return placements.map(p=>({placement:p,asset:am.get(p.asset_id),mockup:am.get(p.mockup_asset_id),project:pm.get(p.project_id),workspace:wm.get(p.workspace_id)})).filter(r=>r.asset&&r.project?.official_order_ref);
  }
  function filmItemFromPending(row){
    const p=row.placement,a=row.asset,w=row.workspace;
    return {localId:uuid(),type:'asset',sourceId:a.id,label:(w?.company_name||w?.client_name||'Cliente')+' • '+a.name,quantity:Math.max(1,Number(p.metadata?.order_quantity||1)),widthCm:Number(p.width_cm),heightCm:Number(p.height_cm),path:a.processed_path||a.original_path,workspaceId:p.workspace_id,companyName:w?.company_name||w?.client_name||'',halftone:false,rotationPolicy:'free',allowInternalNesting:true,officialPlacementId:p.id,officialProjectId:p.project_id,officialOrderRef:p.external_order_ref,externalOrderItemRef:p.external_order_item_ref};
  }
  async function openPendingProductionPicker({onAdd}={}){
    const rows=await pendingRows(),modal=document.createElement('div');modal.className='official-production-backdrop';const selected=new Set(rows.map(r=>r.placement.id));
    const draw=()=>{const groups=new Map();for(const row of rows){const key=row.project.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)}
      modal.innerHTML='<section class="official-production-page"><header><div><div class="eyebrow">AGUARDANDO PRODUÇÃO</div><h2>Pedidos oficiais pendentes</h2><p>Escolha as estampas que vão entrar neste filme. O mockup serve só para conferência visual.</p></div><button class="btn ghost" data-close>Fechar</button></header><div class="official-production-groups">'+(rows.length?[...groups.entries()].map(([projectId,list])=>'<section class="official-production-group"><div class="official-production-group-head"><div><b>'+esc(list[0].workspace?.company_name||list[0].workspace?.client_name||'Cliente')+'</b><small>Pedido '+esc(list[0].project.official_order_ref)+' · '+esc(list[0].project.title||'Projeto')+'</small></div><button class="btn small" data-select-project="'+projectId+'">Selecionar pedido</button></div><div class="official-production-grid">'+list.map(row=>{const img=row.mockup?.processed_path||row.mockup?.original_path||row.asset.processed_path||row.asset.original_path;return '<label class="official-production-card '+(selected.has(row.placement.id)?'active':'')+'"><input type="checkbox" data-placement="'+row.placement.id+'" '+(selected.has(row.placement.id)?'checked':'')+'><img src="'+esc(ctx.publicUrl(img))+'" loading="lazy" decoding="async" alt=""><div><b>'+esc(row.asset.name)+'</b><small>'+esc([row.placement.garment_color_name,row.placement.garment_size,row.placement.position_code].filter(Boolean).join(' · '))+'</small><span>'+Number(row.placement.width_cm).toLocaleString('pt-BR',{maximumFractionDigits:2})+' × '+Number(row.placement.height_cm).toLocaleString('pt-BR',{maximumFractionDigits:2})+' cm</span></div></label>'}).join('')+'</div></section>').join(''):'<div class="empty"><b>Nenhum pedido oficial aguardando produção.</b><p>Quando a integração criar pedidos e as artes forem posicionadas, eles aparecerão aqui.</p></div>')+'</div><footer><span>'+selected.size+' estampa(s) selecionada(s)</span><button class="btn primary" data-add '+(!selected.size?'disabled':'')+'>Adicionar ao filme</button></footer></section>';
      modal.querySelector('[data-close]').onclick=()=>modal.remove();modal.querySelectorAll('[data-placement]').forEach(input=>input.onchange=()=>{input.checked?selected.add(input.dataset.placement):selected.delete(input.dataset.placement);draw()});modal.querySelectorAll('[data-select-project]').forEach(b=>b.onclick=()=>{rows.filter(r=>r.project.id===b.dataset.selectProject).forEach(r=>selected.add(r.placement.id));draw()});modal.querySelector('[data-add]')?.addEventListener('click',async()=>{const items=rows.filter(r=>selected.has(r.placement.id)).map(filmItemFromPending);if(!items.length)return;await onAdd?.(items);modal.remove()});
    };document.body.appendChild(modal);draw();return modal;
  }
  function exportGroups(items=[]){
    const groups=new Map();for(const item of items){if(!item.officialProjectId)continue;const id=item.officialProjectId;if(!groups.has(id))groups.set(id,{projectId:id,orderRef:item.officialOrderRef||'',companyName:item.companyName||item.label?.split(' • ')[0]||'Cliente',placementIds:[]});if(item.officialPlacementId)groups.get(id).placementIds.push(item.officialPlacementId)}
    return [...groups.values()];
  }
  async function markProduction(items,selectedProjectIds){
    const selected=new Set(selectedProjectIds||[]),groups=exportGroups(items).filter(g=>selected.has(g.projectId));if(!groups.length)return {projects:0,placements:0};
    const projectIds=groups.map(g=>g.projectId),placementIds=[...new Set(groups.flatMap(g=>g.placementIds))],{data,error}=await supabase.rpc('z19p_mark_official_order_production',{p_project_ids:projectIds,p_placement_ids:placementIds});if(error)throw error;return data||{projects:0,placements:0};
  }
  return {loadPositions,loadManualGarments,chooseManualGarment,openPositionSettings,openPlacementWizard,openPlacementPreview,offerAfterUpload,openPendingProductionPicker,exportGroups,markProduction,pendingRows};
}
