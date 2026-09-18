export const GARMENT_SIDES=['front','back','left','right'];
export const SIDE_LABELS={front:'Frente',back:'Costas',left:'Manga esquerda',right:'Manga direita'};
export const GARMENT_DEFAULTS={normal:{bodyWidth:54,bodyLength:74,sleeveWidth:18,sleeveLength:22},oversized:{bodyWidth:64,bodyLength:76,sleeveWidth:24,sleeveLength:27}};
const number=(v,fallback)=>['number','string'].includes(typeof v)&&String(v).trim()&&Number.isFinite(Number(v))&&Number(v)>0?Number(v):fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const measurementsFor=value=>{const defaults=GARMENT_DEFAULTS[value?.model==='oversized'?'oversized':'normal'];return Object.fromEntries(Object.entries(defaults).map(([key,fallback])=>[key,clamp(number(value?.measurements?.[key],fallback),5,150)]))};
export function garmentFrame(scene,side){
  if(!GARMENT_SIDES.includes(side))throw new Error('Selecione frente, costas ou uma das mangas.');
  const sleeve=side==='left'||side==='right',measure=measurementsFor(scene),oversized=scene.model==='oversized';
  // Calibrated image-space print surfaces, shared by preview and every export.
  const dimensions=sleeve?{widthCm:measure.sleeveWidth,lengthCm:measure.sleeveLength,left:side==='left'?(oversized?.395:.435):(oversized?.34:.335),top:oversized?.20:.15,fraction:oversized?.28:.23,heightFraction:oversized?.35:.32}:{widthCm:measure.bodyWidth,lengthCm:measure.bodyLength,left:.205,top:.05,fraction:.59,heightFraction:.89};
  const column=side==='front'||side==='left'?0:1;
  const shared=scene.model==='normal'&&scene.color!=='offwhite';
  const path=shared?(sleeve?'assets/shirt-sleeves-atlas.png':'assets/shirt-studio-atlas.png'):`assets/shirt-${scene.model}-${scene.color}.png`;
  const row=shared?(scene.color==='white'?1:0):(sleeve?1:0);
  return {...dimensions,path,column,row,ratio:(dimensions.lengthCm/dimensions.widthCm)*(dimensions.fraction/dimensions.heightFraction)};
}
export function garmentAnchors(scene,side){const frame=garmentFrame(scene,side),w=frame.widthCm,h=frame.lengthCm;if(side==='left'||side==='right')return[{id:'sleeve-center',label:'Centro da manga',x:w*.5,y:h*.5},{id:'sleeve-low',label:'Próximo à barra',x:w*.5,y:h*.75}];const back=side==='back',left=back?.28:.72,right=1-left;return[{id:'chest-left',label:back?'Costas · lado esquerdo':'Peito esquerdo',x:w*left,y:h*.28},{id:'chest-right',label:back?'Costas · lado direito':'Peito direito',x:w*right,y:h*.28},{id:'chest-center',label:back?'Costas superior':'Peito central',x:w*.5,y:h*.30},{id:'body-center',label:'Centro do corpo',x:w*.5,y:h*.52},{id:'hem-left',label:'Barra esquerda',x:w*left,y:h*.81},{id:'hem-center',label:'Barra central',x:w*.5,y:h*.81}]}
export function nearestGarmentAnchor(scene,layer){return garmentAnchors(scene,layer.side).reduce((best,anchor)=>Math.hypot(anchor.x-layer.x,anchor.y-layer.y)<Math.hypot(best.x-layer.x,best.y-layer.y)?anchor:best)}
export function normalizeGarmentScene(value={}){
  if(!value||typeof value!=='object'||Array.isArray(value))value={};
  const model=value.model==='oversized'?'oversized':'normal',measurements=measurementsFor(value),ids=new Set();
  const layers=(Array.isArray(value.layers)?value.layers:[]).filter(layer=>layer&&typeof layer==='object'&&!Array.isArray(layer)).slice(0,40).map(layer=>{
    let id=String(layer.id||crypto.randomUUID()).slice(0,200);if(ids.has(id))id=crypto.randomUUID();ids.add(id);
    const side=GARMENT_SIDES.includes(layer.side)?layer.side:'front',sleeve=side==='left'||side==='right',surfaceWidth=sleeve?measurements.sleeveWidth:measurements.bodyWidth,surfaceLength=sleeve?measurements.sleeveLength:measurements.bodyLength,ratio=clamp(number(layer.ratio,1),.001,1000),width=clamp(number(layer.width,20),.1,Math.min(200,ratio*200));
    const coordinate=(v,fallback,max)=>v!==null&&v!==''&&['number','string'].includes(typeof v)&&Number.isFinite(Number(v))?clamp(Number(v),-200,max+200):fallback;
    return {id,assetId:String(layer.assetId||'').slice(0,200),name:String(layer.name||'Arte').slice(0,160),path:String(layer.path||'').slice(0,4096),side,width,ratio,x:coordinate(layer.x,surfaceWidth/2,surfaceWidth),y:coordinate(layer.y,surfaceLength*(sleeve?.5:.3),surfaceLength),locked:Boolean(layer.locked),halftone:Boolean(layer.halftone)};
  });
  return {version:1,title:String(value.title||'Sua camiseta personalizada').slice(0,140),model,color:['black','white','offwhite'].includes(value.color)?value.color:'black',measurements,layers};
}
export function layerOutsideSurface(scene,layer){const f=garmentFrame(scene,layer.side),height=layer.width/layer.ratio;return layer.x-layer.width/2<0||layer.x+layer.width/2>f.widthCm||layer.y-height/2<0||layer.y+height/2>f.lengthCm}

async function loadedImage(src){const image=new Image();image.crossOrigin='anonymous';image.src=src;await image.decode();return image}
/** Canvas contains no internal costs, owner names, edit handles or account identifiers. */
export async function renderGarmentView(scene,side,{width=2000,annotations=true,blank=false,publicUrl=path=>path}={}){
  scene=normalizeGarmentScene(scene);
  if(!Number.isInteger(width)||width<200||width>4000)throw new Error('A resolução da vista deve ser de 200 a 4.000 pixels.');
  const frame=garmentFrame(scene,side),canvas=document.createElement('canvas'),photo=await loadedImage(new URL(frame.path,import.meta.url).href),s=width*frame.fraction/frame.widthCm;
  canvas.width=width;const photoHeight=Math.round(width*frame.ratio),visible=blank?[]:scene.layers.filter(layer=>layer.side===side),legendHeight=annotations?Math.max(130,100+visible.length*35):0;
  if(photoHeight+legendHeight>16000||width*(photoHeight+legendHeight)>24e6)throw new Error('As proporções informadas excedem o tamanho seguro da imagem. Confira as medidas reais da camiseta.');
  canvas.height=photoHeight+legendHeight;const g=canvas.getContext('2d');if(!g)throw new Error('Memória insuficiente para montar esta vista.');g.fillStyle='#e8e8e8';g.fillRect(0,0,width,canvas.height);g.drawImage(photo,frame.column*photo.width/2,frame.row*photo.height/2,photo.width/2,photo.height/2,0,0,width,photoHeight);
  for(const [index,layer] of visible.entries()){const image=await loadedImage(publicUrl(layer.path)),w=layer.width*s,h=w/layer.ratio,x=frame.left*width+layer.x*s-w/2,y=frame.top*photoHeight+layer.y*s-h/2;g.drawImage(image,x,y,w,h);if(annotations){g.strokeStyle='#dd6d24';g.lineWidth=2;g.setLineDash([9,6]);g.strokeRect(x,y,w,h);g.setLineDash([]);g.font='bold 24px system-ui';const text=`${index+1} · ${layer.width.toLocaleString('pt-BR',{maximumFractionDigits:2})} × ${(layer.width/layer.ratio).toLocaleString('pt-BR',{maximumFractionDigits:2})} cm`,tw=g.measureText(text).width;g.fillStyle='#161616';g.fillRect(Math.max(0,x),Math.max(0,y-35),Math.min(tw+20,width),34);g.fillStyle='#fff';g.fillText(text,Math.max(0,x)+10,Math.max(0,y-35)+25)}}
  if(annotations){g.fillStyle='#141416';g.fillRect(0,photoHeight,width,legendHeight);g.fillStyle='#fff';g.font='bold 32px system-ui';g.fillText(`${SIDE_LABELS[side]} · ${scene.model==='oversized'?'Oversized':'Normal'} · ${scene.color==='black'?'Preta':scene.color==='white'?'Branca':'Off-white'}`,38,photoHeight+47);g.fillStyle='#c2bdba';g.font='23px system-ui';g.fillText(`Superfície de referência: ${frame.widthCm} × ${frame.lengthCm} cm. Confirme as medidas da peça real.`,38,photoHeight+82);visible.forEach((layer,index)=>g.fillText(`${index+1}. ${layer.name}`.slice(0,115),38,photoHeight+119+index*35))}
  return canvas;
}
export async function renderGarmentPresentation(scene,options={}){
  scene=normalizeGarmentScene(scene);const sides=GARMENT_SIDES.filter(side=>options.includeEmptyViews||scene.layers.some(layer=>layer.side===side));if(!sides.length)sides.push('front');
  const width=1400,columns=Math.min(2,sides.length),height=Math.max(...sides.map(side=>Math.round(width*garmentFrame(scene,side).ratio)+(options.annotations===false?0:Math.max(130,100+scene.layers.filter(layer=>layer.side===side).length*35)))),sheet=document.createElement('canvas');
  if(height*Math.ceil(sides.length/columns)>16000||width*columns*height*Math.ceil(sides.length/columns)>32e6)throw new Error('As proporções da ficha excedem o limite seguro. Exporte as vistas separadas ou confira as medidas da peça.');
  sheet.width=width*columns;sheet.height=height*Math.ceil(sides.length/columns);const g=sheet.getContext('2d');if(!g)throw new Error('Memória insuficiente para gerar a ficha.');g.fillStyle='#141416';g.fillRect(0,0,sheet.width,sheet.height);
  try{for(const [index,side] of sides.entries()){const canvas=await renderGarmentView(scene,side,{...options,width});g.drawImage(canvas,index%columns*width,Math.floor(index/columns)*height);canvas.width=canvas.height=1}return sheet}catch(error){sheet.width=sheet.height=1;throw error}
}
