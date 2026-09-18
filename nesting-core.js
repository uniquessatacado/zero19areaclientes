const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const EPSILON=1e-7;
const MASK_CELL_LIMIT=32e6;

export function cmToPx(cm,dpi=300){return Math.round(Number(cm)/2.54*dpi)}
export function pxToCm(px,dpi=300){return Number(px)/dpi*2.54}

/** Physical axis-aligned bounds of the original art rotated clockwise.
 * The source dimensions are never resized; only its enclosing box changes.
 */
export function rotatedBoundsMm(widthMm,heightMm,rotation=0){
  const width=Number(widthMm),height=Number(heightMm),angle=Number(rotation);
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||!Number.isFinite(angle)||angle<0||angle>=360)throw new Error('Medidas ou ângulo de rotação inválidos.');
  if(angle%90===0)return angle%180?{widthMm:height,heightMm:width}:{widthMm:width,heightMm:height};
  const radians=angle*Math.PI/180,cos=Math.abs(Math.cos(radians)),sin=Math.abs(Math.sin(radians));
  return {widthMm:width*cos+height*sin,heightMm:width*sin+height*cos};
}

function fullMask(w,h){return {w,h,data:new Uint8Array(w*h).fill(1)}}
function rotateMask(mask){
  const out={w:mask.h,h:mask.w,data:new Uint8Array(mask.w*mask.h)};
  for(let y=0;y<mask.h;y++)for(let x=0;x<mask.w;x++)out.data[x*mask.h+(mask.h-1-y)]=mask.data[y*mask.w+x];
  return out;
}

// A collision cell is occupied whenever ANY source cell touches it. Sampling only
// its center would erase thin strokes and allow another print to overlap them.
function normalizedMask(item,cellMm,maximum){
  const w=Math.max(1,Math.ceil(item.widthMm/cellMm)),h=Math.max(1,Math.ceil(item.heightMm/cellMm));
  if(w*h>MASK_CELL_LIMIT)throw new Error('A máscara da arte excede o limite seguro. Reduza as medidas ou aumente a célula de cálculo.');
  if(!maximum||item.halftone||item.allowInternalNesting===false||!item.mask?.data)return fullMask(w,h);
  const src=item.mask;
  if(!Number.isInteger(src.w)||!Number.isInteger(src.h)||src.w<1||src.h<1||src.data.length!==src.w*src.h)throw new Error('Máscara de impressão inválida.');
  const out={w,h,data:new Uint8Array(w*h)};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const x0=Math.floor(x*cellMm/item.widthMm*src.w),x1=Math.min(src.w,Math.ceil((x+1)*cellMm/item.widthMm*src.w));
    const y0=Math.floor(y*cellMm/item.heightMm*src.h),y1=Math.min(src.h,Math.ceil((y+1)*cellMm/item.heightMm*src.h));
    occupied:for(let sy=y0;sy<y1;sy++)for(let sx=x0;sx<x1;sx++)if(src.data[sy*src.w+sx]){out.data[y*w+x]=1;break occupied;}
  }
  if(!out.data.some(Boolean))throw new Error(`A arte ${item.label||item.id} não contém pixels imprimíveis.`);
  return out;
}

// Rotating already conservative cells and rasterizing every touched target cell
// can over-reserve a thin contour, but cannot erase an ink stroke. Each source
// cell is clipped to the ORIGINAL physical dimensions before rotation. Thus no
// stretched artwork or rotated grid-padding leaks into the physical bounding box.
function arbitraryMask(item,cellMm,maximum,rotation,bounds){
  const w=Math.max(1,Math.ceil(bounds.widthMm/cellMm)),h=Math.max(1,Math.ceil(bounds.heightMm/cellMm));
  if(w*h>MASK_CELL_LIMIT)throw new Error('A máscara rotacionada excede o limite seguro de cálculo.');
  if(!maximum||item.halftone||item.allowInternalNesting===false||!item.mask?.data)return fullMask(w,h);
  const source=normalizedMask(item,cellMm,true),data=new Uint8Array(w*h),radians=rotation*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians);
  const centerX=item.widthMm/2,centerY=item.heightMm/2,offsetX=bounds.widthMm/2,offsetY=bounds.heightMm/2;
  for(let y=0;y<source.h;y++)for(let x=0;x<source.w;x++){
    if(!source.data[y*source.w+x])continue;
    const x0=x*cellMm-centerX,x1=Math.min((x+1)*cellMm,item.widthMm)-centerX,y0=y*cellMm-centerY,y1=Math.min((y+1)*cellMm,item.heightMm)-centerY;
    const corners=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(([sx,sy])=>[sx*cos-sy*sin+offsetX,sx*sin+sy*cos+offsetY]);
    const left=Math.max(0,Math.floor(Math.min(...corners.map(point=>point[0]))/cellMm)),right=Math.min(w,Math.ceil(Math.max(...corners.map(point=>point[0]))/cellMm));
    const top=Math.max(0,Math.floor(Math.min(...corners.map(point=>point[1]))/cellMm)),bottom=Math.min(h,Math.ceil(Math.max(...corners.map(point=>point[1]))/cellMm));
    for(let row=top;row<bottom;row++)data.fill(1,row*w+left,row*w+right);
  }
  return {w,h,data};
}

// Cache occupied runs once per orientation, rather than scan transparent pixels
// for every candidate position. Sparse art stays fast even with extra angles.
function maskRuns(mask){
  if(mask.runs)return mask.runs;
  const runs=[];let count=0;
  for(let y=0;y<mask.h;y++){let x=0;while(x<mask.w){while(x<mask.w&&!mask.data[y*mask.w+x])x++;if(x===mask.w)break;const start=x;while(x<mask.w&&mask.data[y*mask.w+x])x++;runs.push([y,start,x]);count+=x-start;}}
  mask.occupiedCount=count;return mask.runs=runs;
}
function maskCount(mask){maskRuns(mask);return mask.occupiedCount;}

function collides(board,bw,bh,mask,px,py){
  if(px<0||py<0||px+mask.w>bw||py+mask.h>bh)return true;
  for(const [y,start,end] of maskRuns(mask))for(let x=start;x<end;x++)if(board[(py+y)*bw+px+x])return true;
  return false;
}

// Store the clearance AROUND occupied pixels, including outside the mask bounds.
// The next item is checked without a second dilation, so the gap is not doubled.
function stampWithGap(board,bw,bh,mask,px,py,gapCells){
  for(const [y,start,end] of maskRuns(mask)){
      const left=Math.max(0,px+start-gapCells),right=Math.min(bw,px+end+gapCells);
      for(let yy=Math.max(0,py+y-gapCells);yy<Math.min(bh,py+y+gapCells+1);yy++)board.fill(1,yy*bw+left,yy*bw+right);
  }
}

function rotationAllowed(item,rotation,freeRotation){
  const policy=item.rotationPolicy||'none';
  return Number.isFinite(rotation)&&rotation>=0&&rotation<360&&(policy==='free'&&freeRotation||{none:[0],'90':[0,90],'180':[0,180],free:[0,90,180,270]}[policy].includes(rotation));
}

function orientation(item,rotation,{cell,maximum,maskBudget}){
  const bounds=rotatedBoundsMm(item.widthMm,item.heightMm,rotation);let raw;
  if(maskBudget){maskBudget.cells+=Math.ceil(bounds.widthMm/cell)*Math.ceil(bounds.heightMm/cell);if(maskBudget.cells>MASK_CELL_LIMIT)throw new Error('As máscaras e os ângulos excedem o limite seguro de memória. Reduza o filme ou aumente a célula de cálculo.');}
  if(rotation%90===0){
    let mask=maximum&&!item.halftone&&item.allowInternalNesting!==false?item.mask:undefined;
    if(mask?.data&&(!Number.isInteger(mask.w)||!Number.isInteger(mask.h)||mask.w<1||mask.h<1||mask.data.length!==mask.w*mask.h||mask.w*mask.h>MASK_CELL_LIMIT))throw new Error('Máscara de impressão inválida ou acima do limite seguro.');
    for(let turn=0;mask&&turn<rotation/90;turn++)mask=rotateMask(mask);
    raw=normalizedMask({...item,...bounds,mask},cell,maximum);
  }
  else raw=arbitraryMask(item,cell,maximum,rotation,bounds);
  return {raw,rotation,...bounds};
}

function itemOptions(item,settings){
  const {cell,maximum,freeRotation,angleStep,width=Infinity,maxLength=Infinity}=settings,policy=item.rotationPolicy||'none',angles=[0];
  if(policy==='90'||policy==='free')angles.push(90);
  if(policy==='180'||policy==='free')angles.push(180);
  if(policy==='free')angles.push(270);
  if(freeRotation&&policy==='free')for(let angle=angleStep;angle<360;angle+=angleStep)if(!angles.includes(angle))angles.push(angle);
  let allocatedCells=0;
  return angles.filter(angle=>{const bounds=rotatedBoundsMm(item.widthMm,item.heightMm,angle);return bounds.widthMm<=width+EPSILON&&bounds.heightMm<=maxLength+EPSILON;}).map(angle=>{
    const bounds=rotatedBoundsMm(item.widthMm,item.heightMm,angle);allocatedCells+=Math.ceil(bounds.widthMm/cell)*Math.ceil(bounds.heightMm/cell);
    if(allocatedCells>MASK_CELL_LIMIT)throw new Error('A busca de ângulos excede o limite seguro de memória. Aumente a célula ou desative a rotação livre.');
    return orientation(item,angle,settings);
  });
}

const placementKey=(id,copy)=>JSON.stringify([id,copy]);

function calculationSettings({filmWidthMm,mode='normal',gapMm=3,cellMm=2,maxLengthMm=100000,freeRotation=false,angleStep=30}={}){
  const width=Number(filmWidthMm),gap=Number(gapMm),cell=Number(cellMm),maxLength=Number(maxLengthMm);
  if(!Number.isFinite(width)||width<=0)throw new Error('Largura de filme inválida.');
  if(!Number.isFinite(gap)||gap<0)throw new Error('Distância entre artes inválida.');
  if(!Number.isFinite(cell)||cell<.5||!Number.isFinite(maxLength)||maxLength<=0)throw new Error('Limites de cálculo inválidos.');
  if(!['normal','maximum'].includes(mode))throw new Error('Modo de encaixe inválido.');
  if(typeof freeRotation!=='boolean'||![15,30].includes(Number(angleStep)))throw new Error('Use rotação livre ligada ou desligada e busca em passos de 15° ou 30°.');
  return {width,gap,cell,maxLength,mode,freeRotation,angleStep:Number(angleStep)};
}

function expandItems(items){
  if(!Array.isArray(items))throw new Error('Lista de itens do filme inválida.');
  const expanded=[],ids=new Set();
  for(const [originalIndex,source] of items.entries()){
    if(!source||source.id==null||source.id==='')throw new Error('Um item do filme está sem identificação.');
    if(ids.has(source.id))throw new Error('Há itens com a mesma identificação no filme.');
    ids.add(source.id);
    const item={...source,widthMm:Number(source.widthMm),heightMm:Number(source.heightMm),originalIndex},quantity=source.quantity==null?1:Number(source.quantity);
    if(!Number.isFinite(item.widthMm)||!Number.isFinite(item.heightMm)||item.widthMm<=0||item.heightMm<=0)throw new Error(`Medida inválida para ${item.label||item.id}.`);
    if(!['none','90','180','free'].includes(item.rotationPolicy||'none'))throw new Error(`Política de rotação inválida para ${item.label||item.id}.`);
    if(!Number.isInteger(quantity)||quantity<1||quantity>10000||expanded.length+quantity>10000)throw new Error('Informe uma quantidade inteira entre 1 e 10.000 peças por filme.');
    for(let copy=0;copy<quantity;copy++)expanded.push({...item,copy});
  }
  expanded.sort((a,b)=>(b.widthMm*b.heightMm)-(a.widthMm*a.heightMm)||String(a.id).localeCompare(String(b.id))||a.copy-b.copy);
  return expanded;
}

function layoutResult(placements,{width,gap,cell,maximum,freeRotation=false,angleStep=30},occupiedCells){
  const lengthMm=placements.reduce((length,placement)=>Math.max(length,placement.yMm+placement.heightMm),0);
  const efficiency=clamp(occupiedCells*cell*cell/Math.max(1,width*lengthMm)*100,0,100);
  return {placements,lengthMm,filmWidthMm:width,mode:maximum?'maximum':'normal',gapMm:gap,cellMm:cell,freeRotation,angleStep,rotationSearch:freeRotation?'discrete-heuristic':'orthogonal',efficiency,waste:100-efficiency};
}

// Validate original source dimensions, copy identity and rotation before using
// any caller-supplied coordinates. Masks always come from the original items.
function resolvePlacement(proposed,itemByKey,prepared,settings){
  const {width,cell,maxLength,maximum,freeRotation}=settings;
  if(!proposed||!Number.isInteger(proposed.copy)||proposed.copy<0)throw new Error('Uma posição do filme está sem uma cópia válida.');
  const key=placementKey(proposed.id,proposed.copy),item=itemByKey.get(key);
  if(!item)throw new Error('Uma posição travada ou editada pertence a um item ou cópia que não existe mais no filme.');
  const xMm=Number(proposed.xMm),yMm=Number(proposed.yMm),rotation=proposed.rotation==null?0:Number(proposed.rotation);
  if(!Number.isFinite(xMm)||!Number.isFinite(yMm)||xMm<0||yMm<0)throw new Error(`Posição inválida para ${item.label||item.id}. Use coordenadas positivas ou zero.`);
  const x=Math.round(xMm/cell),y=Math.round(yMm/cell);
  if(Math.abs(x*cell-xMm)>EPSILON||Math.abs(y*cell-yMm)>EPSILON)throw new Error(`A posição de ${item.label||item.id} deve seguir a grade de ${cell} mm.`);
  if(!rotationAllowed(item,rotation,freeRotation))throw new Error(`A rotação de ${rotation}° não é permitida para ${item.label||item.id}. Ative a rotação livre para ângulos não ortogonais.`);
  const expected=rotatedBoundsMm(item.widthMm,item.heightMm,rotation);
  for(const dimension of ['widthMm','heightMm'])if(proposed[dimension]!=null&&(!Number.isFinite(Number(proposed[dimension]))||Math.abs(Number(proposed[dimension])-expected[dimension])>EPSILON))throw new Error(`A medida de ${item.label||item.id} mudou. Recalcule o filme antes de travar esta posição.`);
  for(const [dimension,source] of [['sourceWidthMm',item.widthMm],['sourceHeightMm',item.heightMm]])if(proposed[dimension]!=null&&(!Number.isFinite(Number(proposed[dimension]))||Math.abs(Number(proposed[dimension])-source)>EPSILON))throw new Error(`A medida original de ${item.label||item.id} mudou. Recalcule o filme.`);
  if(xMm+expected.widthMm>width+EPSILON||yMm+expected.heightMm>maxLength+EPSILON)throw new Error(`A arte ${item.label||item.id} ultrapassa os limites do filme.`);
  let options=prepared.get(item.originalIndex);
  if(!options){options=[];prepared.set(item.originalIndex,options);}
  let option=options.find(candidate=>candidate.rotation===rotation);
  if(!option){option=orientation(item,rotation,settings);options.push(option);}
  return {key,item,option,x,y,placement:{id:item.id,copy:item.copy,xMm:x*cell,yMm:y*cell,widthMm:option.widthMm,heightMm:option.heightMm,sourceWidthMm:item.widthMm,sourceHeightMm:item.heightMm,rotation,locked:Boolean(proposed.locked),label:item.label||''}};
}

/** Validate every copy after a manual move/rotation using the nesting grid.
 * Returns the complete layout, or throws without changing items or placements.
 */
export function validateFilmPlacements(items,placements,options={}){
  const settings={...calculationSettings(options),maskBudget:{cells:0}},expanded=expandItems(items),maximum=settings.mode==='maximum';
  if(Math.ceil(settings.width/settings.cell)*Math.ceil(settings.maxLength/settings.cell)>64e6)throw new Error('O filme excede o limite seguro de cálculo. Reduza o comprimento ou aumente a célula de cálculo.');
  if(!Array.isArray(placements))throw new Error('Lista de posições do filme inválida.');
  if(placements.length!==expanded.length)throw new Error('O filme precisa conter exatamente a quantidade de cópias de cada item.');
  const itemByKey=new Map(expanded.map(item=>[placementKey(item.id,item.copy),item])),prepared=new Map(),seen=new Set(),validated=[];
  // Check all bounds before allocating the board. A malicious/offline snapshot
  // cannot force an unbounded allocation by moving a copy far below the film.
  const resolved=placements.map(proposed=>{
    const result=resolvePlacement(proposed,itemByKey,prepared,{...settings,maximum});
    if(seen.has(result.key))throw new Error('Uma mesma cópia aparece mais de uma vez no filme.');
    seen.add(result.key);return result;
  });
  const bw=Math.ceil(settings.width/settings.cell),bh=Math.max(1,...resolved.map(result=>result.y+result.option.raw.h)),gapCells=Math.ceil(settings.gap/settings.cell);
  if(bw*bh>64e6)throw new Error('O filme excede o limite seguro de cálculo. Reduza o comprimento ou aumente a célula de cálculo.');
  const board=new Uint8Array(bw*bh);let occupiedCells=0;
  for(const result of resolved){
    if(collides(board,bw,bh,result.option.raw,result.x,result.y))throw new Error(`A arte ${result.item.label||result.item.id} encosta em outra impressão ou invade a distância mínima entre artes.`);
    stampWithGap(board,bw,bh,result.option.raw,result.x,result.y,gapCells);
    occupiedCells+=maskCount(result.option.raw);
    validated.push(result.placement);
  }
  return layoutResult(validated,{...settings,maximum},occupiedCells);
}

function calculateLayout(expanded,settings){
  settings={...settings,maskBudget:{cells:0}};
  const {width,gap,cell,maxLength,maximum,lockedPlacements=[],freeRotation=false,angleStep=30,searchFreeRotation=freeRotation}=settings;
  const bw=Math.ceil(width/cell),bh=Math.ceil(maxLength/cell),gapCells=Math.ceil(gap/cell);
  if(bw*bh>64e6)throw new Error('O filme excede o limite seguro de cálculo. Reduza o comprimento ou aumente a célula de cálculo.');
  const useBoard=maximum||lockedPlacements.length>0,board=useBoard?new Uint8Array(bw*bh):null,placements=[],prepared=new Map(),searchPrepared=new Map(),lockedKeys=new Set();
  let usedRows=0,shelfX=0,shelfY=0,shelfH=0,lengthMm=0,occupiedCells=0,angleChecks=0;
  if(lockedPlacements.length){
    const itemByKey=new Map(expanded.map(item=>[placementKey(item.id,item.copy),item]));
    for(const proposed of lockedPlacements){
      const resolved=resolvePlacement({...proposed,locked:true},itemByKey,prepared,settings);
      if(lockedKeys.has(resolved.key))throw new Error('Uma mesma cópia foi travada mais de uma vez.');
      if(collides(board,bw,bh,resolved.option.raw,resolved.x,resolved.y))throw new Error(`A posição travada de ${resolved.item.label||resolved.item.id} colide com outra arte ou com a distância mínima.`);
      stampWithGap(board,bw,bh,resolved.option.raw,resolved.x,resolved.y,gapCells);
      lockedKeys.add(resolved.key);placements.push(resolved.placement);usedRows=Math.max(usedRows,resolved.y+resolved.option.raw.h);
      occupiedCells+=maskCount(resolved.option.raw);
    }
  }
  for(const item of expanded){
    if(lockedKeys.has(placementKey(item.id,item.copy)))continue;
    let options=searchPrepared.get(item.originalIndex);
    if(!options){options=itemOptions(item,{...settings,freeRotation:searchFreeRotation});searchPrepared.set(item.originalIndex,options);}
    if(!options.length)throw new Error(`O item ${item.label||item.id} não cabe no filme nas rotações permitidas.`);
    let found=null;
    const searchAngles=searchFreeRotation&&item.rotationPolicy==='free';
    if(useBoard){
      const lastY=Math.min(bh-1,usedRows+gapCells);
      outer:for(let y=0;y<=lastY;y++){
        for(let x=0;x<bw;x++)for(const option of options){
          if(x*cell+option.widthMm>width+EPSILON||y*cell+option.heightMm>maxLength+EPSILON)continue;
          if(searchAngles&&++angleChecks>2e6)throw new Error('A busca de ângulos atingiu o limite de segurança; mantido o melhor encaixe já validado.');
          if(!collides(board,bw,bh,option.raw,x,y)){
            const candidate={x,y,...option};
            // Mesmo sem rotação livre, políticas ortogonais como 0°/90° precisam
            // comparar as orientações válidas. Na primeira linha utilizável,
            // escolha a menor altura física para reduzir o comprimento do filme.
            if(!found||candidate.heightMm<found.heightMm-EPSILON||Math.abs(candidate.heightMm-found.heightMm)<=EPSILON&&candidate.x<found.x)found=candidate;
          }
        }
        // Discrete bottom-left heuristic, not a global optimum search. Once the
        // earliest usable row is found, prefer its shortest physical orientation.
        if(found)break;
      }
    }else{
      const fitting=()=>options.filter(candidate=>shelfX*cell+candidate.widthMm<=width+EPSILON).sort((a,b)=>searchAngles?(Math.max(shelfH,a.raw.h)-Math.max(shelfH,b.raw.h)||a.raw.w-b.raw.w):0);
      let option=fitting()[0];
      if(!option){shelfY+=shelfH+gapCells;shelfX=0;shelfH=0;option=fitting()[0];}
      if(shelfY*cell+option.heightMm<=maxLength+EPSILON){found={x:shelfX,y:shelfY,...option};shelfX+=option.raw.w+gapCells;shelfH=Math.max(shelfH,option.raw.h);}
    }
    if(!found)throw new Error(`O item ${item.label||item.id} não cabe no comprimento seguro do filme.`);
    if(useBoard)stampWithGap(board,bw,bh,found.raw,found.x,found.y,gapCells);
    usedRows=Math.max(usedRows,found.y+found.raw.h);
    occupiedCells+=maskCount(found.raw);
    const placement={id:item.id,copy:item.copy,xMm:found.x*cell,yMm:found.y*cell,widthMm:found.widthMm,heightMm:found.heightMm,sourceWidthMm:item.widthMm,sourceHeightMm:item.heightMm,rotation:found.rotation,locked:Boolean(item.locked),label:item.label||''};
    placements.push(placement);lengthMm=Math.max(lengthMm,placement.yMm+placement.heightMm);
  }
  if(lockedPlacements.length){const order=new Map(expanded.map((item,index)=>[placementKey(item.id,item.copy),index]));placements.sort((a,b)=>order.get(placementKey(a.id,a.copy))-order.get(placementKey(b.id,b.copy)));}
  return layoutResult(placements,settings,occupiedCells);
}

export function nestItems(items,options={}){
  const normalized=calculationSettings(options),{width,gap,cell,maxLength,mode,freeRotation,angleStep}=normalized,lockedPlacements=options.lockedPlacements||[];
  if(!Array.isArray(lockedPlacements))throw new Error('Lista de posições travadas inválida.');
  const expanded=expandItems(items);
  if(!expanded.length&&lockedPlacements.length)throw new Error('Há posições travadas de itens que não existem mais no filme.');
  if(!expanded.length)return layoutResult([],{...normalized,maximum:mode==='maximum'},0);
  const settings={...normalized,lockedPlacements};
  const solve=searchFreeRotation=>{
    const searchSettings={...settings,searchFreeRotation};
    if(mode==='normal')return calculateLayout(expanded,{...searchSettings,maximum:false});
    // A maximum layout must never use more film than the easy-cut alternative.
    let baseline=null;try{baseline=calculateLayout(expanded,{...searchSettings,maximum:false})}catch{}
    const useBaseline=()=>validateFilmPlacements(items,baseline.placements,{...options,mode:'maximum'});
    try{
      const packed=calculateLayout(expanded,{...searchSettings,maximum:true});
      return baseline&&baseline.lengthMm<packed.lengthMm?useBaseline():packed;
    }catch(error){if(baseline){const result=useBaseline();return searchFreeRotation?{...result,rotationSearchLimited:true,rotationSearchWarning:error.message}:result;}throw error;}
  };
  if(!freeRotation)return solve(false);
  // Extra angles may reorder a greedy layout. Keep the validated orthogonal
  // baseline whenever it uses less film, while preserving arbitrary-angle locks.
  let baseline=null;try{baseline=solve(false)}catch{}
  try{const packed=solve(true);return baseline&&baseline.lengthMm<packed.lengthMm?{...baseline,...(packed.rotationSearchLimited?{rotationSearchLimited:true,rotationSearchWarning:packed.rotationSearchWarning}:{})}:packed;}
  catch(error){if(baseline)return {...baseline,rotationSearchLimited:true,rotationSearchWarning:error.message};throw error;}
}

export function placementsOverlap(a,b,gapMm=0){
  return !(a.xMm+a.widthMm+gapMm<=b.xMm+EPSILON||b.xMm+b.widthMm+gapMm<=a.xMm+EPSILON||a.yMm+a.heightMm+gapMm<=b.yMm+EPSILON||b.yMm+b.heightMm+gapMm<=a.yMm+EPSILON);
}

// Magnetic drop: choose the closest legal grid point inside the current film.
// Other copies are stamped once, so transparent nesting and gap rules are shared.
export function snapFilmPlacement(items,placements,moving,options={}){
  const settings={...calculationSettings(options),maskBudget:{cells:0}},maximum=settings.mode==='maximum',expanded=expandItems(items),lookup=new Map(expanded.map(item=>[placementKey(item.id,item.copy),item])),prepared=new Map();
  const index=placements.findIndex(p=>p.id===moving.id&&p.copy===moving.copy);if(index<0)throw new Error('Arte movida não encontrada.');
  const proposal=placements[index],key=placementKey(proposal.id,proposal.copy),length=Number(options.lengthMm);
  if(!Number.isFinite(length)||length<=0)throw new Error('Comprimento de filme inválido.');
  const resolved=resolvePlacement({...proposal,xMm:0,yMm:0},lookup,prepared,{...settings,maximum}),bw=Math.ceil(settings.width/settings.cell),bh=Math.ceil(length/settings.cell),gapCells=Math.ceil(settings.gap/settings.cell);
  if(bw*bh>64e6)throw new Error('Filme grande demais para ajuste interativo.');
  const board=new Uint8Array(bw*bh),seen=new Set([key]);
  for(let i=0;i<placements.length;i++){if(i===index)continue;const other=resolvePlacement(placements[i],lookup,prepared,{...settings,maximum});if(seen.has(other.key))throw new Error('Há cópias duplicadas no filme.');seen.add(other.key);if(other.placement.yMm+other.placement.heightMm>length+EPSILON||collides(board,bw,bh,other.option.raw,other.x,other.y))throw new Error('Outra arte está fora do filme ou sobreposta. Recalcule o encaixe.');stampWithGap(board,bw,bh,other.option.raw,other.x,other.y,gapCells)}
  const maxX=Math.floor((settings.width-resolved.placement.widthMm+EPSILON)/settings.cell),maxY=Math.floor((length-resolved.placement.heightMm+EPSILON)/settings.cell),wantedX=clamp(Math.round(Number(proposal.xMm)/settings.cell),0,maxX),wantedY=clamp(Math.round(Number(proposal.yMm)/settings.cell),0,maxY);
  if(maxX<0||maxY<0||!Number.isFinite(wantedX+wantedY))throw new Error('Esta arte não cabe no filme atual.');
  let best=null,distance=Infinity,checked=0;
  // Search rings in increasing vertical distance. Once a legal result is known,
  // candidates farther than it are skipped, including entire rows.
  for(let delta=0;delta<=maxY&&delta*delta<=distance;delta++)for(const y of delta?[wantedY-delta,wantedY+delta]:[wantedY]){
    if(y<0||y>maxY)continue;
    for(let dx=0;dx<=maxX&&delta*delta+dx*dx<=distance;dx++)for(const x of dx?[wantedX-dx,wantedX+dx]:[wantedX]){
      if(x<0||x>maxX)continue;const d=delta*delta+dx*dx;if(d>=distance)continue;
      if(++checked>2e6)throw new Error('Ajuste muito extenso. Reotimize o filme antes de mover esta arte.');
      if(!collides(board,bw,bh,resolved.option.raw,x,y)){best={x,y};distance=d}
    }
  }
  if(!best)throw new Error('Não há espaço livre próximo dentro do filme. Reotimize as artes.');
  const next=placements.map((p,i)=>i===index?{...p,xMm:best.x*settings.cell,yMm:best.y*settings.cell}:{...p});
  return validateFilmPlacements(items,next,options);
}

export function buildSafeSegments(placements,lengthMm,maxSegmentMm){
  const length=Number(lengthMm),limit=Number(maxSegmentMm),segments=[];
  if(!Number.isFinite(length)||length<0||!Number.isFinite(limit)||limit<=0)throw new Error('Limites de exportação inválidos.');
  const intervals=(placements||[]).map(p=>({start:Number(p.yMm),end:Number(p.yMm)+Number(p.heightMm)})).sort((a,b)=>a.start-b.start),blocks=[];
  for(const interval of intervals){
    if(!Number.isFinite(interval.start)||!Number.isFinite(interval.end)||interval.start<0||interval.end<=interval.start||interval.end>length+EPSILON)throw new Error('Uma arte ultrapassa os limites do filme.');
    const previous=blocks.at(-1);
    if(previous&&interval.start<previous.end-EPSILON)previous.end=Math.max(previous.end,interval.end);else blocks.push({...interval});
  }
  let start=0;
  while(start<length-EPSILON){
    let end=Math.min(start+limit,length);
    const crossing=blocks.find(block=>block.start<end-EPSILON&&block.end>end+EPSILON);
    // Overlapping vertical spans form an indivisible block. Moving the cut just
    // before one item without merging these spans could cut another item.
    if(crossing)end=crossing.start>start+EPSILON?crossing.start:crossing.end;
    if(end<=start+EPSILON)throw new Error('Não foi possível criar um corte seguro para o filme.');
    segments.push({start,end});start=end;
    if(segments.length>10000)throw new Error('Quantidade de segmentos acima do limite seguro.');
  }
  return segments;
}
