import {loadBlankShirtCatalog,realMockupPreview,renderPieceMockup,colorForCatalog,modelForCatalog} from './manual-shirt-catalog.js?v=2.17.22';

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
  if(surface==='front'||surface==='back')return true;
  const m=surfaceMetrics(model,surface),halfW=width/m.width/2,halfH=height/m.length/2,margin=.035,x=Number(position.anchor_x),y=Number(position.anchor_y);
  return x-halfW>=margin&&x+halfW<=1-margin&&y-halfH>=margin&&y+halfH<=1-margin;
}
function safePosition(model,surface,width,height,position){
  const m=surfaceMetrics(model,surface),margin=surface.includes('sleeve')?.035:.025,halfW=Math.min(.49,width/m.width/2),halfH=Math.min(.49,height/m.length/2);
  return {...position,anchor_x:Math.max(margin+halfW,Math.min(1-margin-halfW,Number(position.anchor_x))),anchor_y:Math.max(margin+halfH,Math.min(1-margin-halfH,Number(position.anchor_y)))};
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
  let positionsCache=null,positionsOwner=null,catalogCache=null,catalogPromise=null;
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
  async function blankCatalog(){
    if(catalogCache)return catalogCache;
    if(!catalogPromise)catalogPromise=loadBlankShirtCatalog(supabase).then(rows=>(catalogCache=rows)).finally(()=>{catalogPromise=null});
    return catalogPromise;
  }
  async function loadManualGroups(workspaceId){
    if(!workspaceId)return [];
    const [groupsResult,garmentsResult]=await Promise.all([
      supabase.from('z19p_manual_garment_groups').select('*').eq('owner_id',owner()).eq('workspace_id',workspaceId).eq('active',true).order('created_at',{ascending:false}),
      supabase.from('z19p_manual_garments').select('*').eq('owner_id',owner()).eq('workspace_id',workspaceId).eq('active',true).order('created_at')
    ]);
    if(groupsResult.error)throw groupsResult.error;if(garmentsResult.error)throw garmentsResult.error;
    const map=new Map((groupsResult.data||[]).map(group=>[group.id,{...group,garments:[]}]));
    for(const garment of garmentsResult.data||[]){if(garment.group_id&&map.has(garment.group_id))map.get(garment.group_id).garments.push(garment)}
    return [...map.values()].filter(group=>group.garments.length);
  }
  function manualPiecePreview(piece,surface='front',artUrl='',position=null,widthCm=0,heightCm=0){
    return realMockupPreview(piece,{surface,artUrl,position,widthCm,heightCm,escapeHTML:esc});
  }
  function pieceTitle(piece){return [piece.category,piece.garment_model==='oversized'?'Oversized':'Normal',piece.size,piece.color_name].filter(Boolean).join(' · ')}
  async function editManualPiece(workspace,initial={}){
    const categories=await blankCatalog();if(!categories.length)throw new Error('Não encontrei camisetas lisas no catálogo ZERO19/Vendus.');
    let step=0,categoryId=initial.vendus_subcategory_id||categories[0].id,model=initial.garment_model||'normal',size=String(initial.size||''),productId=Number(initial.vendus_product_id||0)||null,quantity=Math.max(1,Number(initial.quantity||1)),busy=false;
    const modal=document.createElement('div');modal.className='manual-garment-backdrop';
    const steps=['Qualidade','Modelagem','Tamanho','Cor','Quantidade'];
    return new Promise(resolve=>{
      const close=value=>{modal.remove();resolve(value||null)};
      const data=()=>{
        const category=categories.find(row=>row.id===categoryId)||categories[0],sizes=[...new Set(category.products.flatMap(product=>product.variants.map(v=>v.size)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
        if(!size||!sizes.includes(size))size=sizes[0]||'M';
        const eligible=category.products.filter(product=>product.variants.some(v=>v.size===size));let product=eligible.find(row=>row.id===productId)||eligible[0]||category.products[0];
        if(product)productId=product.id;
        if(!initial.garment_model&&step===0)model=modelForCatalog(category.name,product?.name||'');
        const variant=product?.variants.find(v=>v.size===size)||product?.variants[0]||null;
        return {category,sizes,eligible,product,variant};
      };
      const finish=()=>{const {category,product,variant}=data();if(!product||!variant)return;const color=colorForCatalog(product.colorName,product.colorHex);close({
        id:initial.id||null,category:category.name,garment_model:model,size,quantity,
        color:color.id,color_name:color.name,color_hex:color.hex,
        vendus_subcategory_id:category.id,vendus_product_id:product.id,vendus_variant_id:variant.id,
        product_name:product.name,product_image_url:product.image||'',name:[category.name,model==='oversized'?'Oversized':'Normal',size,color.name].join(' · ')
      })};
      const draw=()=>{
        const {category,sizes,eligible,product}=data(),progress=steps.map((label,index)=>'<span class="'+(index===step?'active':index<step?'done':'')+'">'+(index+1)+'<small>'+label+'</small></span>').join('');
        let body='';
        if(step===0)body='<div class="manual-catalog-grid">'+categories.map(row=>'<button data-category="'+row.id+'" class="'+(category.id===row.id?'active':'')+'"><b>'+esc(row.name)+'</b><small>'+row.products.length+' cor(es)/produto(s)</small></button>').join('')+'</div>';
        if(step===1)body='<div class="manual-choice-grid"><button data-model="normal" class="'+(model==='normal'?'active':'')+'"><b>Camiseta normal</b><small>Mockup fotográfico normal</small></button><button data-model="oversized" class="'+(model==='oversized'?'active':'')+'"><b>Oversized</b><small>Mockup fotográfico oversized</small></button></div>';
        if(step===2)body='<div class="manual-size-grid">'+sizes.map(value=>'<button data-size="'+esc(value)+'" class="'+(size===value?'active':'')+'">'+esc(value)+'</button>').join('')+'</div>';
        if(step===3)body='<div class="manual-product-grid">'+eligible.map(item=>{const color=colorForCatalog(item.colorName,item.colorHex);return '<button data-product="'+item.id+'" class="'+(product?.id===item.id?'active':'')+'">'+(item.image?'<img src="'+esc(item.image)+'" loading="lazy" decoding="async" alt="">':'')+'<span><i style="background:'+esc(color.hex)+'"></i><b>'+esc(color.name)+'</b><small>'+esc(item.name)+'</small></span></button>'}).join('')+'</div>';
        if(step===4){const preview=manualPiecePreview({category:category.name,garment_model:model,size,color_name:product?.colorName,color_hex:product?.colorHex,name:product?.name});body='<div class="manual-quantity-step">'+preview+'<label>Quantidade de camisetas<input data-quantity type="number" min="1" max="999" inputmode="numeric" value="'+quantity+'"></label><small>Se duas camisetas são exatamente iguais, use quantidade 2 em vez de cadastrar duas linhas.</small></div>'}
        modal.innerHTML='<section class="manual-garment-page"><header><div><div class="eyebrow">CAMISETA SEM PEDIDO</div><h2>Montar camiseta do grupo</h2><p>'+esc(workspace.client_name||workspace.company_name||'Cliente')+' · etapa '+(step+1)+' de '+steps.length+'</p></div><button class="btn ghost" data-close>Cancelar</button></header><div class="manual-stepper five">'+progress+'</div><main><h3>'+steps[step]+'</h3>'+body+'</main><footer><button class="btn" data-back '+(step===0?'disabled':'')+'>Voltar</button><div class="manual-garment-summary"><b>'+esc([category.name,model==='oversized'?'Oversized':'Normal',size,product?.colorName].filter(Boolean).join(' · '))+'</b></div><button class="btn primary" data-next '+(busy?'disabled':'')+'>'+(step===steps.length-1?'Usar esta camiseta':'Continuar')+'</button></footer></section>';
        modal.querySelector('[data-close]').onclick=()=>close(null);modal.querySelector('[data-back]').onclick=()=>{if(step>0){step--;draw()}};modal.querySelector('[data-next]').onclick=()=>step===steps.length-1?finish():(step++,draw());
        modal.querySelectorAll('[data-category]').forEach(button=>button.onclick=()=>{categoryId=button.dataset.category;productId=null;size='';const d=data();model=modelForCatalog(d.category.name,d.product?.name||'');draw()});
        modal.querySelectorAll('[data-model]').forEach(button=>button.onclick=()=>{model=button.dataset.model;draw()});modal.querySelectorAll('[data-size]').forEach(button=>button.onclick=()=>{size=button.dataset.size;productId=null;draw()});modal.querySelectorAll('[data-product]').forEach(button=>button.onclick=()=>{productId=Number(button.dataset.product);draw()});
        modal.querySelector('[data-quantity]')?.addEventListener('input',event=>{quantity=Math.max(1,Math.min(999,parseInt(event.target.value||'1',10)||1))});
      };
      document.body.appendChild(modal);draw();
    });
  }
  async function persistManualGroup(workspace,pieces){
    const account=owner(),actor=user(),groupName='Grupo de camisetas · '+new Date().toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    const {data:group,error}=await supabase.from('z19p_manual_garment_groups').insert({owner_id:account,workspace_id:workspace.id,project_id:null,name:groupName,created_by:actor,updated_by:actor}).select().single();if(error)throw error;
    const rows=pieces.map(piece=>({owner_id:account,workspace_id:workspace.id,project_id:null,group_id:group.id,name:piece.name,category:piece.category,garment_model:piece.garment_model,size:piece.size,color:piece.color,color_name:piece.color_name,color_hex:piece.color_hex,quantity:piece.quantity,vendus_subcategory_id:piece.vendus_subcategory_id,vendus_product_id:piece.vendus_product_id,vendus_variant_id:piece.vendus_variant_id,product_name:piece.product_name,product_image_url:piece.product_image_url,created_by:actor,updated_by:actor}));
    const inserted=await supabase.from('z19p_manual_garments').insert(rows).select('*');if(inserted.error){await supabase.from('z19p_manual_garment_groups').delete().eq('id',group.id).eq('owner_id',account);throw inserted.error}
    return {...group,garments:inserted.data||[]};
  }
  async function buildManualGroup(workspace,seed=null){
    const first=await editManualPiece(workspace,seed||{});if(!first)return null;let pieces=[first],modal=document.createElement('div');modal.className='manual-garment-backdrop';
    return new Promise(resolve=>{
      const close=value=>{modal.remove();resolve(value||null)};
      const draw=()=>{modal.innerHTML='<section class="manual-garment-page group-builder"><header><div><div class="eyebrow">GRUPO DE CAMISETAS</div><h2>Quais peças recebem esta estampa?</h2><p>Cadastre peças iguais pela quantidade ou adicione outra camiseta com tamanho/cor/categoria diferente.</p></div><button class="btn ghost" data-cancel>Cancelar</button></header><main><div class="manual-group-pieces">'+pieces.map((piece,index)=>'<article>'+manualPiecePreview(piece)+'<div><b>'+esc(pieceTitle(piece))+'</b><small>Quantidade: '+piece.quantity+'</small><div><button class="btn small" data-edit="'+index+'">Editar</button><button class="btn small" data-duplicate="'+index+'">Duplicar e alterar</button><button class="btn ghost small" data-remove="'+index+'" '+(pieces.length===1?'disabled':'')+'>Remover</button></div></div></article>').join('')+'</div><button class="btn manual-add-shirt" data-add>＋ Adicionar outra camiseta</button></main><footer><span></span><button class="btn primary" data-save>Salvar grupo com '+pieces.reduce((sum,p)=>sum+p.quantity,0)+' camiseta(s)</button></footer></section>';
        modal.querySelector('[data-cancel]').onclick=()=>close(null);modal.querySelector('[data-add]').onclick=async()=>{modal.remove();const next=await editManualPiece(workspace,pieces.at(-1)||{});if(next)pieces.push(next);document.body.appendChild(modal);draw()};
        modal.querySelectorAll('[data-edit]').forEach(button=>button.onclick=async()=>{const index=Number(button.dataset.edit);modal.remove();const next=await editManualPiece(workspace,pieces[index]);if(next)pieces[index]=next;document.body.appendChild(modal);draw()});
        modal.querySelectorAll('[data-duplicate]').forEach(button=>button.onclick=async()=>{const index=Number(button.dataset.duplicate);modal.remove();const next=await editManualPiece(workspace,{...pieces[index],id:null});if(next)pieces.splice(index+1,0,next);document.body.appendChild(modal);draw()});
        modal.querySelectorAll('[data-remove]').forEach(button=>button.onclick=()=>{pieces.splice(Number(button.dataset.remove),1);draw()});
        modal.querySelector('[data-save]').onclick=async()=>{const button=modal.querySelector('[data-save]');button.disabled=true;button.textContent='Salvando grupo…';try{close(await persistManualGroup(workspace,pieces))}catch(error){button.disabled=false;button.textContent='Tentar salvar novamente';ctx.toast(error.message||'Não foi possível salvar o grupo.','err')}};
      };
      document.body.appendChild(modal);draw();
    });
  }
  async function chooseManualGroup(workspace){
    const groups=await loadManualGroups(workspace.id);if(!groups.length)return buildManualGroup(workspace);
    const modal=document.createElement('div');modal.className='manual-garment-backdrop';let active=groups[0].id,selected=new Set(groups[0].garments.map(g=>g.id));
    return new Promise(resolve=>{
      const close=value=>{modal.remove();resolve(value||null)};
      const draw=()=>{const group=groups.find(g=>g.id===active)||groups[0];modal.innerHTML='<section class="manual-garment-page choose-existing"><header><div><div class="eyebrow">GRUPO DE CAMISETAS</div><h2>Usar qual grupo?</h2><p>Marque somente as camisetas que vão receber esta nova estampa.</p></div><button class="btn ghost" data-close>Cancelar</button></header><main><div class="manual-group-tabs">'+groups.map(g=>'<button data-group="'+g.id+'" class="'+(g.id===active?'active':'')+'">'+esc(g.name)+'<small>'+g.garments.reduce((s,p)=>s+p.quantity,0)+' peça(s)</small></button>').join('')+'</div><div class="manual-group-select">'+group.garments.map(piece=>'<label class="'+(selected.has(piece.id)?'active':'')+'"><input type="checkbox" data-piece="'+piece.id+'" '+(selected.has(piece.id)?'checked':'')+'>'+manualPiecePreview(piece)+'<span><b>'+esc(pieceTitle(piece))+'</b><small>Quantidade '+piece.quantity+'</small></span></label>').join('')+'</div><button class="btn" data-new>＋ Criar novo grupo</button></main><footer><span>'+selected.size+' tipo(s) selecionado(s)</span><button class="btn primary" data-use '+(!selected.size?'disabled':'')+'>Usar camisetas selecionadas</button></footer></section>';
        modal.querySelector('[data-close]').onclick=()=>close(null);modal.querySelectorAll('[data-group]').forEach(button=>button.onclick=()=>{active=button.dataset.group;const next=groups.find(g=>g.id===active);selected=new Set(next?.garments.map(g=>g.id)||[]);draw()});modal.querySelectorAll('[data-piece]').forEach(input=>input.onchange=()=>{input.checked?selected.add(input.dataset.piece):selected.delete(input.dataset.piece);draw()});modal.querySelector('[data-use]').onclick=()=>close({...group,garments:group.garments.filter(g=>selected.has(g.id))});modal.querySelector('[data-new]').onclick=async()=>{modal.remove();resolve(await buildManualGroup(workspace,group.garments[0]||null))};
      };
      document.body.appendChild(modal);draw();
    });
  }
  function pieceForPlacement(product,choice,manualGarment){
    if(manualGarment)return manualGarment;
    const color=colorInfo(choice.color);
    return {garment_model:choice.model==='oversized'?'oversized':'normal',color:choice.color,color_name:color.label,color_hex:color.hex,size:choice.size||'',category:choice.category||'',quantity:Math.max(1,Number(product?.quantity||1)),product_name:product?.name||'Camiseta',product_image_url:product?.image||'',name:[product?.name||'Camiseta',choice.size,color.label].filter(Boolean).join(' · ')};
  }
  async function generateMockup(asset,piece,position,widthCm,heightCm,surface){
    const canvas=await renderPieceMockup(asset,piece,{surface,position,widthCm,heightCm,publicUrl:ctx.publicUrl}),width=canvas.width,height=canvas.height;
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Falha ao gerar o mockup fotográfico.')),'image/png',.94));canvas.width=canvas.height=1;
    return {blob,width,height};
  }
  async function savePlacement(asset,workspace,project,product,choice,position,widthCm,heightCm,manualGarment=null,manualGroup=null,onProgress=()=>{}){
    const account=owner(),actor=user(),projectId=project?.official_order_ref?project.id:null,piece=pieceForPlacement(product,choice,manualGarment),model=piece.garment_model==='oversized'?'oversized':'normal',safe=safePosition(model,choice.surface,widthCm,heightCm,position),placementId=uuid(),mockupId=uuid();
    const generated=await generateMockup(asset,piece,safe,widthCm,heightCm,choice.surface),path=account+'/'+workspace.id+'/auto-mockups/'+mockupId+'.png';
    let uploaded=false,assetInserted=false;
    try{
      if(ctx.uploadFile)await ctx.uploadFile(path,generated.blob,{contentType:'image/png',onProgress});
      else{const up=await supabase.storage.from(ctx.bucket).upload(path,generated.blob,{contentType:'image/png',upsert:false});if(up.error)throw up.error}
      uploaded=true;
      let result=await supabase.from('z19p_assets').insert({id:mockupId,owner_id:account,workspace_id:workspace.id,project_id:projectId,folder_id:null,name:'Mockup · '+asset.name+' · '+pieceTitle(piece)+' · '+position.label,asset_type:'mockup',original_path:path,processed_path:path,mime_type:'image/png',size_bytes:generated.blob.size,width:generated.width,height:generated.height,dpi:300,alpha_trimmed:false,background_removed:false,maximized:false,created_by:actor,updated_by:actor,metadata:{auto_mockup:true,source_asset_id:asset.id,placement_id:placementId,manual_garment_id:manualGarment?.id||null,manual_garment_group_id:manualGroup?.id||manualGarment?.group_id||null,garment_model:model,garment_color:piece.color||null,surface:choice.surface,position_code:position.code}}).select().single();if(result.error)throw result.error;assetInserted=true;
      const row={id:placementId,owner_id:account,workspace_id:workspace.id,project_id:projectId,asset_id:asset.id,position_id:position.id,manual_garment_id:manualGarment?.id||null,manual_garment_group_id:manualGroup?.id||manualGarment?.group_id||null,external_order_ref:project?.official_order_ref||null,external_order_item_ref:product?.ref||null,garment_model:model,garment_color:piece.color||colorForCatalog(piece.color_name,piece.color_hex).id,garment_color_name:piece.color_name||'',garment_size:piece.size||'',garment_category:piece.category||'',surface:choice.surface,position_code:position.code,width_cm:widthCm,height_cm:heightCm,mockup_asset_id:mockupId,production_state:'pending',metadata:{order_quantity:Math.max(1,Number(piece.quantity||product?.quantity||1)),product_name:piece.product_name||product?.name||'',product_image:piece.product_image_url||product?.image||'',anchor_x:Number(safe.anchor_x),anchor_y:Number(safe.anchor_y),awaiting_production:true},created_by:actor,updated_by:actor};
      result=await supabase.from('z19p_asset_placements').insert(row);if(result.error)throw result.error;
      const existing=await supabase.from('z19p_asset_print_profiles').select('*').eq('asset_id',asset.id).maybeSingle();if(existing.error)throw existing.error;
      const ratio=widthCm/heightCm,profile={asset_id:asset.id,owner_id:account,project_id:projectId,default_width_cm:widthCm,default_height_cm:heightCm,aspect_ratio:ratio,halftone:Boolean(existing.data?.halftone),allow_internal_nesting:existing.data?.allow_internal_nesting!==false,rotation_policy:existing.data?.rotation_policy||'free',ready_for_print:true,created_by:existing.data?.created_by||actor,updated_by:actor,updated_at:new Date().toISOString()};
      result=await supabase.from('z19p_asset_print_profiles').upsert(profile,{onConflict:'asset_id'});if(result.error)throw result.error;
      const metrics=surfaceMetrics(model,choice.surface),metadata={...(asset.metadata||{}),official_placement_id:placementId,manual_garment_id:manualGarment?.id||null,manual_garment_group_id:manualGroup?.id||manualGarment?.group_id||null,production_state:'pending',shirt_placement:{...(asset.metadata?.shirt_placement||{}),side:choice.surface==='left_sleeve'?'left':choice.surface==='right_sleeve'?'right':choice.surface,color:piece.color||'black',shirt_width_cm:(GARMENT_MODELS[model]||GARMENT_MODELS.normal).bodyWidth,shirt_length_cm:(GARMENT_MODELS[model]||GARMENT_MODELS.normal).bodyLength,sleeve_width_cm:(GARMENT_MODELS[model]||GARMENT_MODELS.normal).sleeveWidth,sleeve_length_cm:(GARMENT_MODELS[model]||GARMENT_MODELS.normal).sleeveLength,width_cm:widthCm,x_cm:Number(safe.anchor_x)*metrics.width,y_cm:Number(safe.anchor_y)*metrics.length,position_code:position.code,garment_model:model,garment_size:piece.size||''}};
      result=await supabase.from('z19p_assets').update({metadata,updated_by:actor,updated_at:new Date().toISOString()}).eq('id',asset.id).eq('owner_id',account);if(result.error)throw result.error;
      return {placementId,mockupId};
    }catch(error){
      if(assetInserted)try{await supabase.from('z19p_assets').delete().eq('id',mockupId).eq('owner_id',account)}catch{}
      if(uploaded)try{await supabase.storage.from(ctx.bucket).remove([path])}catch{}
      throw error;
    }
  }
  async function openPlacementWizard(asset,{workspace=state().currentWorkspace,project=null,manualGroup=null}={}){
    if(!asset||!workspace)return null;
    const positions=await loadPositions(),projects=(state().currentProjects||[]).filter(p=>p.workspace_id===workspace.id),official=project&&project.official_order_ref?project:projects.find(p=>p.official_order_ref)||null,products=productCards(official),groupPieces=(manualGroup?.garments||[]).filter(Boolean),firstPiece=groupPieces[0]||null;
    const modal=document.createElement('div');modal.className='official-placement-backdrop';
    let selectedProduct=products[0]||null,model=firstPiece?.garment_model||modelFrom(selectedProduct||{}),color=firstPiece?.color||colorFrom(selectedProduct||{}),size=firstPiece?.size||selectedProduct?.size||'',category=firstPiece?.category||selectedProduct?.category||'',surface='front',position=null,ratio=(asset.width&&asset.height?asset.width/asset.height:1),widthCm=9,heightCm=9/ratio,busy=false,saveText='';
    const targetModels=()=>groupPieces.length?groupPieces.map(piece=>piece.garment_model==='oversized'?'oversized':'normal'):[model==='oversized'?'oversized':'normal'];
    const surfaceFits=s=>targetModels().every(value=>fits(value,s,widthCm,heightCm));
    const positionFitsAll=p=>targetModels().every(value=>positionFits(value,surface,widthCm,heightCm,p));
    const chooseDefault=()=>{const available=positions.filter(p=>p.surface===surface&&positionFitsAll(p));position=available[0]||null};chooseDefault();
    const previewPiece=()=>firstPiece||{garment_model:model,color,color_name:colorInfo(color).label,color_hex:colorInfo(color).hex,size,category,product_name:selectedProduct?.name||'Camiseta',name:selectedProduct?.name||'Camiseta'};
    const draw=()=>{
      const availableSurfaces=['front','back','left_sleeve','right_sleeve'].filter(surfaceFits),surfacePositions=positions.filter(p=>p.surface===surface&&positionFitsAll(p));
      if(!availableSurfaces.includes(surface)){surface=availableSurfaces[0]||'front';position=null}
      if(!position||position.surface!==surface||!surfacePositions.some(p=>p.id===position.id))position=surfacePositions[0]||null;
      const safe=position?safePosition(targetModels()[0],surface,widthCm,heightCm,position):null,artUrl=ctx.publicUrl(asset.processed_path||asset.original_path),preview=manualPiecePreview(previewPiece(),surface,artUrl,safe,widthCm,heightCm),orderWarning=official?.official_order_ref?'':'<div class="official-order-missing"><b>Sem pedido oficial · modo manual liberado</b><span>Esta arte será vinculada ao grupo de camisetas e entrará automaticamente em Aguardando produção.</span></div>';
      const groupSummary=groupPieces.length?'<div class="placement-group-summary"><b>Grupo selecionado · '+groupPieces.reduce((sum,p)=>sum+Number(p.quantity||1),0)+' camiseta(s)</b><div>'+groupPieces.map(piece=>'<span>'+manualPiecePreview(piece,surface)+'<small>'+esc(pieceTitle(piece))+' · '+piece.quantity+' un.</small></span>').join('')+'</div></div>':'';
      const officialProducts=products.length?'<div class="official-product-grid">'+products.map(p=>'<button class="official-product-card '+(selectedProduct?.ref===p.ref?'active':'')+'" data-product="'+esc(p.ref)+'">'+(p.image?'<img src="'+esc(p.image)+'" loading="lazy" decoding="async" alt="">':'<span class="official-product-placeholder">CAMISA</span>')+'<div><b>'+esc(p.name)+'</b><small>'+esc([p.category,p.colorName,p.size].filter(Boolean).join(' · '))+'</small><em>'+p.quantity+' un.</em></div></button>').join('')+'</div>':'';
      modal.innerHTML='<section class="official-placement-page"><header><div><div class="eyebrow">POSICIONAR ARTE</div><h2>'+esc(asset.name)+'</h2><p>Defina a medida real uma vez e aplique a mesma posição às camisetas selecionadas.</p></div><button class="btn ghost" data-close>Fechar</button></header>'+orderWarning+'<div class="official-placement-layout"><main><section class="official-step"><h3>1. Camiseta / grupo</h3>'+groupSummary+officialProducts+'</section><section class="official-step"><h3>2. Tamanho real da estampa</h3><div class="official-size-fields"><label>Largura (cm)<input data-width inputmode="decimal" value="'+String(Number(widthCm.toFixed(3))).replace('.',',')+'"></label><span>×</span><label>Altura (cm)<input data-height inputmode="decimal" value="'+String(Number(heightCm.toFixed(3))).replace('.',',')+'"></label></div><small>A proporção original é preservada. Você pode editar largura ou altura.</small></section><section class="official-step"><h3>3. Onde vai a estampa?</h3><div class="official-surface-buttons">'+['front','back','left_sleeve','right_sleeve'].map(s=>'<button class="'+(surface===s?'active':'')+'" data-surface="'+s+'" '+(availableSurfaces.includes(s)?'':'disabled')+'>'+esc(SURFACE_LABELS[s])+'</button>').join('')+'</div><div class="official-position-buttons">'+(surfacePositions.length?surfacePositions.map(p=>'<button class="'+(position?.id===p.id?'active':'')+'" data-position="'+p.id+'">'+esc(p.label)+'</button>').join(''):'<p>Esta estampa não cabe nesta área nas camisetas selecionadas. Reduza o tamanho ou escolha outra área.</p>')+'</div></section></main><aside>'+preview+'<div class="official-preview-summary"><b>'+esc(position?.label||'Escolha uma posição')+'</b><span>'+esc(groupPieces.length?pieceTitle(firstPiece):[GARMENT_MODELS[model]?.label,colorInfo(color).label,size].filter(Boolean).join(' · '))+'</span><small>'+Number(widthCm).toLocaleString('pt-BR',{maximumFractionDigits:2})+' × '+Number(heightCm).toLocaleString('pt-BR',{maximumFractionDigits:2})+' cm</small></div><div class="placement-save-progress '+(busy?'active':'')+'"><span></span><small>'+esc(saveText||'')+'</small></div><button class="btn primary official-save-placement" data-save '+(!position||busy?'disabled':'')+'>'+(busy?'Salvando…':'Salvar e enviar para Aguardando produção')+'</button></aside></div></section>';
      modal.querySelector('[data-close]').onclick=()=>{if(!busy)modal.remove()};
      modal.querySelectorAll('[data-product]').forEach(button=>button.onclick=()=>{selectedProduct=products.find(p=>p.ref===button.dataset.product)||null;model=modelFrom(selectedProduct||{});color=colorFrom(selectedProduct||{});size=selectedProduct?.size||'';category=selectedProduct?.category||'';chooseDefault();draw()});
      const w=modal.querySelector('[data-width]'),h=modal.querySelector('[data-height]');w.onchange=()=>{const value=num(w.value);if(value>0){widthCm=value;heightCm=value/ratio;chooseDefault();draw()}};h.onchange=()=>{const value=num(h.value);if(value>0){heightCm=value;widthCm=value*ratio;chooseDefault();draw()}};
      modal.querySelectorAll('[data-surface]').forEach(button=>button.onclick=()=>{surface=button.dataset.surface;chooseDefault();draw()});modal.querySelectorAll('[data-position]').forEach(button=>button.onclick=()=>{position=positions.find(p=>p.id===button.dataset.position)||position;draw()});
      modal.querySelector('[data-save]').onclick=async()=>{
        if(!position||busy)return;busy=true;saveText='Preparando mockup…';draw();
        try{
          const targets=groupPieces.length?groupPieces:[null],results=[];
          for(let index=0;index<targets.length;index++){
            const piece=targets[index];saveText='Camiseta '+(index+1)+'/'+targets.length+' · gerando mockup';draw();
            const result=await savePlacement(asset,workspace,official,selectedProduct,{model:piece?.garment_model||model,color:piece?.color||color,size:piece?.size||size,category:piece?.category||category,surface},position,widthCm,heightCm,piece,manualGroup,progress=>{
              const overall=Math.round(((index+(Number(progress.percent||0)/100))/targets.length)*100);saveText='Camiseta '+(index+1)+'/'+targets.length+' · salvando mockup '+progress.percent+'% · total '+overall+'%';const bar=modal.querySelector('.placement-save-progress span');if(bar)bar.style.width=overall+'%';const label=modal.querySelector('.placement-save-progress small');if(label)label.textContent=saveText;
            });results.push(result);
          }
          ctx.toast((groupPieces.length?groupPieces.reduce((sum,p)=>sum+Number(p.quantity||1),0):Number(selectedProduct?.quantity||1))+' camiseta(s) em Aguardando produção.','ok');modal.remove();await ctx.onSaved?.();
        }catch(error){busy=false;saveText='';draw();ctx.toast(error.message||'Não foi possível salvar a posição.','err')}
      };
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
    const arts=(assets||[]).filter(a=>a?.asset_type==='arte');let manualGroup=null;
    if(workspace?.workspace_type==='client'&&!official&&arts.length){
      manualGroup=await chooseManualGroup(workspace);
      if(!manualGroup)throw new Error('As artes foram salvas, mas a escolha do grupo de camisetas foi cancelada.');
    }
    for(const asset of arts){
      await new Promise((resolve,reject)=>{let finished=false;const finish=error=>{if(finished)return;finished=true;clearInterval(watch);error?reject(error):resolve()};const watch=setInterval(()=>{if(!document.querySelector('.official-placement-backdrop'))finish()},180);openPlacementWizard(asset,{workspace,project:official,manualGroup}).catch(finish)})
    }
  }
  async function pendingRows(){
    const account=owner();if(!account)return [];
    const {data:placements,error}=await supabase.from('z19p_asset_placements').select('*').eq('owner_id',account).eq('production_state','pending').order('created_at');if(error)throw error;if(!placements?.length)return [];
    const assetIds=[...new Set(placements.flatMap(p=>[p.asset_id,p.mockup_asset_id].filter(Boolean)))],projectIds=[...new Set(placements.map(p=>p.project_id).filter(Boolean))],workspaceIds=[...new Set(placements.map(p=>p.workspace_id).filter(Boolean))],groupIds=[...new Set(placements.map(p=>p.manual_garment_group_id).filter(Boolean))],garmentIds=[...new Set(placements.map(p=>p.manual_garment_id).filter(Boolean))];
    const queryIn=(table,columns,ids)=>ids.length?supabase.from(table).select(columns).in('id',ids):Promise.resolve({data:[],error:null});
    const [ar,pr,wr,gr,mr,pfr]=await Promise.all([
      queryIn('z19p_assets','id,name,processed_path,original_path,metadata',assetIds),
      queryIn('z19p_projects','id,workspace_id,title,official_order_ref,official_order_status,official_order_payload',projectIds),
      queryIn('z19p_workspaces','id,company_name,client_name',workspaceIds),
      queryIn('z19p_manual_garment_groups','id,workspace_id,name',groupIds),
      queryIn('z19p_manual_garments','id,group_id,name,quantity,category,garment_model,size,color_name,product_name',garmentIds),
      assetIds.length?supabase.from('z19p_asset_print_profiles').select('asset_id,halftone,allow_internal_nesting,rotation_policy').in('asset_id',assetIds):Promise.resolve({data:[],error:null})
    ]);
    for(const result of [ar,pr,wr,gr,mr,pfr])if(result.error)throw result.error;
    const am=new Map((ar.data||[]).map(a=>[a.id,a])),pm=new Map((pr.data||[]).map(p=>[p.id,p])),wm=new Map((wr.data||[]).map(w=>[w.id,w])),gm=new Map((gr.data||[]).map(g=>[g.id,g])),mm=new Map((mr.data||[]).map(m=>[m.id,m])),pfm=new Map((pfr.data||[]).map(p=>[p.asset_id,p]));
    return placements.map(p=>({placement:p,asset:am.get(p.asset_id),mockup:am.get(p.mockup_asset_id),project:pm.get(p.project_id),workspace:wm.get(p.workspace_id),group:gm.get(p.manual_garment_group_id),garment:mm.get(p.manual_garment_id),profile:pfm.get(p.asset_id)})).filter(row=>row.asset&&(row.project?.official_order_ref||row.group||row.garment));
  }
  function productionGroupKey(row){return row.project?.official_order_ref?'order:'+row.project.id:row.group?.id?'manual:'+row.group.id:row.garment?.id?'shirt:'+row.garment.id:'workspace:'+row.placement.workspace_id}
  function pendingQuantity(row){return Math.max(1,Number(row.garment?.quantity||row.placement.metadata?.order_quantity||1))}
  function filmItemsFromPending(rows,quantities=new Map()){
    const grouped=new Map();
    for(const row of rows){
      const p=row.placement,a=row.asset,w=row.workspace,quantity=Math.max(1,Number(quantities.get(p.id)||pendingQuantity(row))),key=[a.id,Number(p.width_cm).toFixed(3),Number(p.height_cm).toFixed(3),Boolean(row.profile?.halftone)].join('|');
      if(!grouped.has(key))grouped.set(key,{localId:uuid(),type:'asset',sourceId:a.id,label:(w?.company_name||w?.client_name||'Cliente')+' • '+a.name,quantity:0,widthCm:Number(p.width_cm),heightCm:Number(p.height_cm),path:a.processed_path||a.original_path,workspaceId:p.workspace_id,companyName:w?.company_name||w?.client_name||'',halftone:Boolean(row.profile?.halftone),rotationPolicy:row.profile?.rotation_policy||'free',allowInternalNesting:row.profile?.allow_internal_nesting!==false,officialPlacementId:p.id,officialProjectId:p.project_id,officialOrderRef:p.external_order_ref,externalOrderItemRef:p.external_order_item_ref,productionPlacementIds:[],productionGroupKeys:[],manualGarmentGroupId:p.manual_garment_group_id||null});
      const item=grouped.get(key);item.quantity+=quantity;item.productionPlacementIds.push(p.id);const groupKey=productionGroupKey(row);if(!item.productionGroupKeys.includes(groupKey))item.productionGroupKeys.push(groupKey);
    }
    return [...grouped.values()];
  }
  async function openPendingProductionPicker({onAdd}={}){
    const rows=await pendingRows(),modal=document.createElement('div');modal.className='official-production-backdrop',selected=new Set(rows.map(row=>row.placement.id)),quantities=new Map(rows.map(row=>[row.placement.id,pendingQuantity(row)]));
    const draw=()=>{
      const groups=new Map();for(const row of rows){const key=productionGroupKey(row);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)}
      const groupHtml=[...groups.entries()].map(([groupKey,list])=>{const first=list[0],official=Boolean(first.project?.official_order_ref),title=first.workspace?.company_name||first.workspace?.client_name||'Cliente',subtitle=official?'Pedido '+first.project.official_order_ref+' · '+(first.project.title||'Pedido oficial'):(first.group?.name||'Grupo manual de camisetas');return '<section class="official-production-group"><div class="official-production-group-head"><div><b>'+esc(title)+'</b><small>'+esc(subtitle)+'</small></div><div class="pending-group-actions"><button class="btn small" data-select-group="'+esc(groupKey)+'">Selecionar grupo</button><button class="btn small primary" data-add-group="'+esc(groupKey)+'">Adicionar grupo inteiro</button></div></div><div class="official-production-grid">'+list.map(row=>{const img=row.mockup?.processed_path||row.mockup?.original_path||row.asset.processed_path||row.asset.original_path,id=row.placement.id,detail=[row.garment?.product_name||row.placement.garment_category,row.placement.garment_color_name,row.placement.garment_size,row.placement.position_code].filter(Boolean).join(' · ');return '<article class="official-production-card '+(selected.has(id)?'active':'')+'"><label class="pending-card-select"><input type="checkbox" data-placement="'+id+'" '+(selected.has(id)?'checked':'')+'><img src="'+esc(ctx.publicUrl(img))+'" loading="lazy" decoding="async" alt=""><div><b>'+esc(row.asset.name)+'</b><small>'+esc(detail)+'</small><span>'+Number(row.placement.width_cm).toLocaleString('pt-BR',{maximumFractionDigits:2})+' × '+Number(row.placement.height_cm).toLocaleString('pt-BR',{maximumFractionDigits:2})+' cm</span></div></label><label class="pending-quantity">Qtd.<input type="number" min="1" max="999" inputmode="numeric" data-pending-qty="'+id+'" value="'+quantities.get(id)+'"></label></article>'}).join('')+'</div></section>'}).join('');
      modal.innerHTML='<section class="official-production-page"><header><div><div class="eyebrow">AGUARDANDO PRODUÇÃO</div><h2>Artes prontas para o filme</h2><p>Pedido oficial e grupos manuais aparecem juntos. Selecione artes, ajuste quantidade ou adicione o grupo inteiro.</p></div><button class="btn ghost" data-close>Fechar</button></header><div class="official-production-groups">'+(groupHtml||'<div class="empty"><b>Nada aguardando produção.</b><p>Quando uma arte pronta for posicionada em uma camiseta, ela entra aqui automaticamente.</p></div>')+'</div><footer><span>'+selected.size+' item(ns) selecionado(s)</span><button class="btn primary" data-add '+(!selected.size?'disabled':'')+'>Adicionar selecionados ao filme</button></footer></section>';
      modal.querySelector('[data-close]').onclick=()=>modal.remove();
      modal.querySelectorAll('[data-placement]').forEach(input=>input.onchange=()=>{input.checked?selected.add(input.dataset.placement):selected.delete(input.dataset.placement);draw()});
      modal.querySelectorAll('[data-pending-qty]').forEach(input=>input.onchange=()=>{quantities.set(input.dataset.pendingQty,Math.max(1,Math.min(999,parseInt(input.value||'1',10)||1)));input.value=quantities.get(input.dataset.pendingQty)});
      modal.querySelectorAll('[data-select-group]').forEach(button=>button.onclick=()=>{rows.filter(row=>productionGroupKey(row)===button.dataset.selectGroup).forEach(row=>selected.add(row.placement.id));draw()});
      modal.querySelectorAll('[data-add-group]').forEach(button=>button.onclick=async()=>{const list=rows.filter(row=>productionGroupKey(row)===button.dataset.addGroup),items=filmItemsFromPending(list,quantities);if(!items.length)return;await onAdd?.(items);modal.remove()});
      modal.querySelector('[data-add]')?.addEventListener('click',async()=>{const items=filmItemsFromPending(rows.filter(row=>selected.has(row.placement.id)),quantities);if(!items.length)return;await onAdd?.(items);modal.remove()});
    };
    document.body.appendChild(modal);draw();return modal;
  }
  function exportGroups(items=[]){
    const groups=new Map();
    for(const item of items){
      const keys=item.productionGroupKeys?.length?item.productionGroupKeys:[item.officialProjectId?'order:'+item.officialProjectId:item.manualGarmentGroupId?'manual:'+item.manualGarmentGroupId:null].filter(Boolean);
      const placementIds=item.productionPlacementIds?.length?item.productionPlacementIds:[item.officialPlacementId].filter(Boolean);
      for(const key of keys){
        if(!groups.has(key))groups.set(key,{key,projectId:key.startsWith('order:')?key.slice(6):null,orderRef:item.officialOrderRef||'',companyName:item.companyName||item.label?.split(' • ')[0]||'Cliente',groupName:key.startsWith('manual:')?'Grupo manual':'',placementIds:[]});
        groups.get(key).placementIds.push(...placementIds);
      }
    }
    return [...groups.values()].map(group=>({...group,placementIds:[...new Set(group.placementIds)]}));
  }
  async function markProduction(items,selectedGroupKeys){
    const selected=new Set(selectedGroupKeys||[]),groups=exportGroups(items).filter(group=>selected.has(group.key));if(!groups.length)return {projects:0,placements:0};
    const projectIds=[...new Set(groups.map(group=>group.projectId).filter(Boolean))],placementIds=[...new Set(groups.flatMap(group=>group.placementIds))],{data,error}=await supabase.rpc('z19p_mark_official_order_production',{p_project_ids:projectIds,p_placement_ids:placementIds});if(error)throw error;return data||{projects:0,placements:0};
  }
  return {loadPositions,loadManualGroups,chooseManualGroup,openPositionSettings,openPlacementWizard,openPlacementPreview,offerAfterUpload,openPendingProductionPicker,exportGroups,markProduction,pendingRows};
}
