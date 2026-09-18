/** v2.17.6: cap/body height is independent of accents. Legacy jobs opt in only
 * on recalculation, so exporting an old job never silently changes its geometry. */
export const LETTERING_METRICS_VERSION = 2;
export const baseCharacter = char => String(char).normalize('NFD').replace(/\p{M}/gu, '');
const nextFrame = () => new Promise(resolve => setTimeout(resolve, 0));
const finiteMetrics = m => m && ['actualBoundingBoxAscent','actualBoundingBoxDescent','actualBoundingBoxLeft','actualBoundingBoxRight'].every(k=>Number.isFinite(m[k]));

/** Conservative optical clearance between raster contours in a common grid.
 * Occupied pixels are cells, not centers. Includes diagonal/vertical clearance. */
export function opticalOffset(right, left, gap, minimum = 0) {
  let position = minimum;
  const radius = Math.ceil(gap) + 1;
  for (let y=0; y<left.length; y++) {
    if (!Number.isFinite(left[y])) continue;
    for (let r=Math.max(0,y-radius); r<=Math.min(right.length-1,y+radius); r++) {
      if (!Number.isFinite(right[r])) continue;
      const dy=Math.max(0,Math.abs(y-r)-1);
      if (dy>gap) continue;
      position=Math.max(position,right[r]+Math.sqrt(Math.max(0,gap*gap-dy*dy))-left[y]);
    }
  }
  return Math.ceil(position);
}

function alphaGeometry(canvas) {
  const w=canvas.width,h=canvas.height,g=canvas.getContext('2d',{willReadFrequently:true});
  const rgba=g.getImageData(0,0,w,h).data,rows=new Uint32Array(h);
  let x0=w,y0=h,x1=-1,y1=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(rgba[(y*w+x)*4+3]){rows[y]++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  if(x1<x0)throw new Error('Um vetor de letra está completamente transparente.');
  const bands=[];let start=-1,area=0;
  for(let y=y0;y<=y1+1;y++){if(rows[y]){if(start<0)start=y;area+=rows[y];}else if(start>=0){bands.push({top:start,height:y-start,area});start=-1;area=0;}}
  return {x:x0,y:y0,width:x1-x0+1,height:y1-y0+1,bands};
}

const vectorCache=new Map();
async function vectorGeometry(glyph, sanitizeSvg) {
  const key=glyph.svg_markup;
  if(vectorCache.has(key))return vectorCache.get(key);
  const pending=(async()=>{
    const url=URL.createObjectURL(new Blob([sanitizeSvg(key)],{type:'image/svg+xml'}));
    const canvas=document.createElement('canvas');
    try{
      const image=new Image();image.src=url;await image.decode();
      const scale=Math.min(1024/image.naturalWidth,1024/image.naturalHeight);
      canvas.width=Math.max(1,Math.ceil(image.naturalWidth*scale));canvas.height=Math.max(1,Math.ceil(image.naturalHeight*scale));
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      const geometry=alphaGeometry(canvas);
      return {...geometry,sourceWidth:canvas.width,sourceHeight:canvas.height};
    }finally{URL.revokeObjectURL(url);canvas.width=canvas.height=1;}
  })();
  if(vectorCache.size>=64)vectorCache.delete(vectorCache.keys().next().value);
  vectorCache.set(key,pending);
  try{return await pending;}catch(error){vectorCache.delete(key);throw error;}
}

async function vectorPart(part, height, item, sanitizeSvg) {
  const ink=await vectorGeometry(part.glyph,sanitizeSvg),base=baseCharacter(part.char);
  let body={top:ink.y,height:ink.height};
  if(base!==part.char){
    // Independent diacritics form separate vertical ink bands. The letter body
    // has the greatest ink area, not necessarily the greatest vertical span.
    const largest=[...ink.bands].sort((a,b)=>b.area-a.area)[0];
    if(ink.bands.length>1&&largest.area>ink.bands.reduce((sum,b)=>sum+b.area,0)*.55)body=largest;
    else {
      const baseGlyph=(item.glyphs||[]).find(g=>g.glyph_key===base&&g.svg_markup);
      if(!baseGlyph)throw new Error('O vetor de “'+part.char+'” precisa do vetor base “'+base+'” para medir o corpo sem o sinal. A fonte original foi preservada.');
      const plain=await vectorGeometry(baseGlyph,sanitizeSvg),bodyHeight=plain.height*(ink.width/plain.width);
      if(!(bodyHeight>0&&bodyHeight<=ink.height+2))throw new Error('Não foi possível medir com segurança o corpo de “'+part.char+'”. Confira os vetores base e acentuado.');
      const below=/[\u0323\u0327\u0328\u0331]/u.test(part.char.normalize('NFD'));
      body={top:below?ink.y:ink.y+ink.height-bodyHeight,height:Math.min(ink.height,bodyHeight)};
    }
  }
  const scale=height/body.height;
  return {...part,widthCm:ink.width*scale,heightCm:ink.height*scale,
    topCm:(ink.y-body.top-body.height)*scale,
    sourceCrop:{x:ink.x/ink.sourceWidth,y:ink.y/ink.sourceHeight,width:ink.width/ink.sourceWidth,height:ink.height/ink.sourceHeight}};
}

/** Receives the verified original font families and glyph map; never substitutes
 * the official font with a system font and never strips marks from output. */
export async function refineLetteringLayout(item, legacy, {drawLine,sanitizeSvg,hasGlyph}={}) {
  if(item.letteringMetricsVersion!==LETTERING_METRICS_VERSION||!legacy.nameLine.parts.length)return legacy;
  const height=Number(item.nameHeightCm);
  if(!(height>0&&Number.isFinite(height)))throw new Error('A altura-base do nome é inválida.');
  const measurement=document.createElement('canvas'),measure=measurement.getContext('2d');
  const metrics=(char,source)=>{
    const family=legacy.families.get(source.id);if(!family)throw new Error('Fonte oficial indisponível.');
    measure.font='1000px "'+family+'"';measure.textAlign='left';measure.textBaseline='alphabetic';
    return measure.measureText(char);
  };
  let ascent=0,descent=0;
  const references=new Map();
  for(const part of legacy.nameLine.parts)if(part.kind==='font'){
    const family=legacy.families.get(part.source.id);
    // A fixed cap reference keeps the em scale identical across different names.
    const reference=references.get(part.source.id)||['H','E','I','A','O'].find(c=>!hasGlyph||hasGlyph(family,c))||baseCharacter(part.char);
    references.set(part.source.id,reference);
    const base=metrics(reference,part.source);
    if(!finiteMetrics(base)||base.actualBoundingBoxAscent+base.actualBoundingBoxDescent<=0)throw new Error('Não foi possível medir a letra base de “'+part.char+'”.');
    ascent=Math.max(ascent,base.actualBoundingBoxAscent);descent=Math.max(descent,base.actualBoundingBoxDescent);
  }
  const scale=ascent+descent?height/(ascent+descent):0,parts=[];
  for(const original of legacy.nameLine.parts){
    const part={...original};
    if(part.kind==='font'){
      const m=part.metrics;
      Object.assign(part,{widthCm:(m.left+m.right)*scale,heightCm:(m.ascent+m.descent)*scale,fontSizeCm:1000*scale,originOffsetCm:m.left*scale,topCm:-m.ascent*scale});
    }else if(part.kind==='vector')Object.assign(part,await vectorPart(part,height,item,sanitizeSvg));
    else if(part.kind==='space'){part.widthCm=part.metrics&&scale?part.metrics.width*scale:height*.4;part.heightCm=0;}
    parts.push(part);
  }
  const painted=parts.filter(p=>p.kind!=='space'),top=Math.min(...painted.map(p=>p.topCm)),bottom=Math.max(...painted.map(p=>p.topCm+p.heightCm));
  const lineHeight=bottom-top;
  for(const part of parts){part.yCm=part.kind==='space'?0:part.topCm-top;if(part.kind==='font')part.baselineCm=-top;}
  const tracking=Number(item.nameTrackingCm??item.letterTrackingCm??0);
  if(!Number.isFinite(tracking)||tracking<0)throw new Error('O espaço entre letras é inválido.');
  let cursor=0;
  const pxPerCm=Math.min(96,768/lineHeight),rowCount=Math.max(1,Math.ceil(lineHeight*pxPerCm)+4),right=new Float64Array(rowCount).fill(-Infinity);
  const canvas=document.createElement('canvas');
  let previous=null;
  try{
    for(const part of parts){
      if(part.kind==='space'){part.xCm=cursor;cursor+=part.widthCm+tracking;previous=part;continue;}
      if(item.spacingMode==='rectangular'){part.xCm=cursor;cursor+=part.widthCm+tracking;previous=part;continue;}
      canvas.width=Math.max(1,Math.ceil(part.widthCm*pxPerCm)+4);canvas.height=rowCount;
      const g=canvas.getContext('2d',{willReadFrequently:true});g.scale(pxPerCm,pxPerCm);
      await drawLine(g,{parts:[{...part,xCm:0}]},legacy.families,0,0,'#fff');
      const rgba=g.getImageData(0,0,canvas.width,rowCount).data,left=new Float64Array(rowCount).fill(Infinity),edges=new Float64Array(rowCount).fill(-Infinity);
      for(let y=0;y<rowCount;y++)for(let x=0;x<canvas.width;x++)if(rgba[(y*canvas.width+x)*4+3]){left[y]=Math.min(left[y],x);edges[y]=x+1;}
      const ordered=previous&&previous.kind!=='space'?previous.xCm+Math.min(previous.widthCm,part.widthCm)*.15:cursor;
      const offset=previous&&previous.kind!=='space'?opticalOffset(right,left,tracking*pxPerCm,ordered*pxPerCm)/pxPerCm:cursor;
      // A rectangular gap is always a safe fallback. Optical fitting can only
      // tighten excess empty corners, never stretch the name or change letters.
      part.xCm=Math.min(cursor,offset);
      const shift=part.xCm*pxPerCm;
      for(let y=0;y<rowCount;y++)if(Number.isFinite(edges[y]))right[y]=Math.max(right[y],shift+edges[y]);
      cursor=Math.max(cursor-tracking,part.xCm+part.widthCm)+tracking;previous=part;
      await nextFrame();
    }
  }finally{canvas.width=canvas.height=1;measurement.width=measurement.height=1;}
  const width=Math.max(...painted.map(p=>p.xCm+p.widthCm));
  const nameLine={...legacy.nameLine,parts,widthCm:width,heightCm:lineHeight,bodyHeightCm:height,extraTopCm:Math.max(0,-top-ascent*scale),extraBottomCm:Math.max(0,bottom-descent*scale),spacingMode:item.spacingMode||'optical'};
  const numberLine=legacy.numberLine,hasNumber=numberLine.parts.length>0,gap=hasNumber?Number(item.gapCm||0):0;
  return {...legacy,nameLine,widthCm:Math.max(width,numberLine.widthCm),heightCm:lineHeight+numberLine.heightCm+gap,numberYcm:lineHeight+gap};
}
