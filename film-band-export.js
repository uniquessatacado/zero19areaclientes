// Long films do not fit in one browser canvas (32767 px / ~900 MB). These helpers
// render the SAME film in horizontal bands on the original pixel grid and stream
// rows to the PNG/TIFF encoder. Nothing is resized, split into files or moved.
const ROWS=64;
const cancelled=signal=>{if(signal?.aborted)throw new DOMException('Exportação cancelada.','AbortError')};

export function filmBandRows(width,budgetBytes=128e6){
  const rows=Math.floor(budgetBytes/(Math.max(1,width)*4)/ROWS)*ROWS;
  return Math.max(ROWS,Math.min(16384,rows));
}

export function needsBandedFilm(width,height){return height>32767||width*height*4>900e6}

// renderBand({top,rows,signal}) must return a canvas `width` px wide and `rows` px
// tall containing the film translated by -top (integer pixels only).
export function createBandReader({width,height,renderBand,signal,bandRows=filmBandRows(width)}){
  let band=null;
  const release=()=>{if(band){band.canvas.width=1;band.canvas.height=1;band=null}};
  async function ensure(index){
    if(band?.index===index)return band;
    release();cancelled(signal);
    const top=index*bandRows,rows=Math.min(bandRows,height-top),canvas=await renderBand({top,rows,signal});
    const context=canvas?.getContext('2d',{willReadFrequently:true});
    if(!context||canvas.width!==width||canvas.height!==rows){if(canvas){canvas.width=1;canvas.height=1}throw new Error('Falta memória para preparar uma faixa do filme.')}
    band={index,top,rows,canvas,context};return band;
  }
  return {
    bandRows,
    async read(x,y,w,n){
      const out=new Uint8ClampedArray(w*n*4);let done=0;
      while(done<n){const current=await ensure(Math.floor((y+done)/bandRows)),local=y+done-current.top,take=Math.min(n-done,current.rows-local);out.set(current.context.getImageData(x,local,w,take).data,done*w*4);done+=take}
      return out;
    },
    dispose:release
  };
}

export async function scanBandAlpha({width,height,renderBand,signal,onProgress=()=>{},bandRows}){
  const reader=createBandReader({width,height,renderBand,signal,bandRows});
  let left=width,top=height,right=-1,bottom=-1;
  try{
    for(let start=0;start<height;start+=ROWS){
      cancelled(signal);
      const count=Math.min(ROWS,height-start),rgba=await reader.read(0,start,width,count);
      for(let y=0;y<count;y++){const row=y*width*4;for(let x=0;x<width;x++)if(rgba[row+x*4+3]!==0){if(x<left)left=x;if(x>right)right=x;if(start+y<top)top=start+y;bottom=start+y}}
      onProgress({stage:'bounds',done:start+count,total:height});
      if(start%1024===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
  }finally{reader.dispose()}
  cancelled(signal);
  if(right<left)throw new Error('O filme está totalmente transparente. Confira as artes antes de exportar.');
  return {x:left,y:top,width:right-left+1,height:bottom-top+1};
}

const CRC_TABLE=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0}return table})();
function crc32(bytes,crc=0xffffffff){for(let i=0;i<bytes.length;i++)crc=CRC_TABLE[(crc^bytes[i])&255]^(crc>>>8);return crc}
export function pngChunk(type,data){
  const out=new Uint8Array(12+data.length),view=new DataView(out.buffer);
  view.setUint32(0,data.length);for(let i=0;i<4;i++)out[4+i]=type.charCodeAt(i);out.set(data,8);
  view.setUint32(8+data.length,(crc32(out.subarray(4,8+data.length))^0xffffffff)>>>0);return out;
}

// RGBA 8-bit PNG, Sub filter, pHYs in DPI. readRows(y,count) returns unpremultiplied
// RGBA rows of the final (already cropped) image.
export async function encodePngRows({width,height,readRows,dpi=300,signal,onProgress=()=>{}}){
  if(typeof CompressionStream!=='function')throw new Error('Este navegador não consegue gerar PNG longo. Use Chrome ou Edge atualizado.');
  const signature=Uint8Array.from([137,80,78,71,13,10,26,10]),ihdr=new Uint8Array(13),ihdrView=new DataView(ihdr.buffer);
  ihdrView.setUint32(0,width);ihdrView.setUint32(4,height);ihdr[8]=8;ihdr[9]=6;
  const phys=new Uint8Array(9),physView=new DataView(phys.buffer),ppm=Math.round(dpi/0.0254);physView.setUint32(0,ppm);physView.setUint32(4,ppm);phys[8]=1;
  const parts=[signature,pngChunk('IHDR',ihdr),pngChunk('pHYs',phys)],stream=new CompressionStream('deflate'),writer=stream.writable.getWriter(),reader=stream.readable.getReader();
  const collect=(async()=>{for(;;){const {done,value}=await reader.read();if(done)break;if(value?.length)parts.push(pngChunk('IDAT',value))}})();
  const stride=width*4;
  try{
    for(let y=0;y<height;y+=ROWS){
      cancelled(signal);
      const count=Math.min(ROWS,height-y),rgba=await readRows(y,count),filtered=new Uint8Array(count*(stride+1));
      for(let r=0;r<count;r++){
        const src=r*stride,dst=r*(stride+1);filtered[dst]=1;
        for(let i=0;i<4&&i<stride;i++)filtered[dst+1+i]=rgba[src+i];
        for(let i=4;i<stride;i++)filtered[dst+1+i]=(rgba[src+i]-rgba[src+i-4])&255;
      }
      await writer.write(filtered);
      onProgress({stage:'encode',done:y+count,total:height});
    }
    await writer.close();await collect;
  }catch(error){try{await writer.abort(error)}catch{}try{await collect}catch{}throw error}
  parts.push(pngChunk('IEND',new Uint8Array(0)));
  return new Blob(parts,{type:'image/png'});
}

export async function exportBandedPng({width,height,renderBand,signal,dpi=300,onProgress=()=>{}}){
  const bounds=await scanBandAlpha({width,height,renderBand,signal,onProgress});
  const reader=createBandReader({width,height,renderBand,signal});
  try{
    const blob=await encodePngRows({width:bounds.width,height:bounds.height,dpi,signal,onProgress,readRows:(y,count)=>reader.read(bounds.x,bounds.y+y,bounds.width,count)});
    return {blob,width:bounds.width,height:bounds.height,bounds};
  }finally{reader.dispose()}
}

// Shared band painter for PNG and TIFF. Images are decoded only while a band needs
// them, so very long films do not keep every source image in memory.
export function createFilmBandPainter({width,placements,loadImage,drawPlacement,check=()=>{}}){
  const images=new Map();
  const dispose=()=>{for(const image of images.values())if(image)image.src='';images.clear()};
  async function renderBand({top,rows,signal}){
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=rows;
    const g=canvas.getContext('2d',{willReadFrequently:true});
    if(!g){canvas.width=canvas.height=1;throw new Error('Falta memória para renderizar uma faixa do filme.')}
    try{
      const needed=placements.filter(p=>p.y<top+rows+2&&p.y+p.h>top-2),keys=new Set(needed.map(p=>p.id));
      for(const [key,image] of images)if(!keys.has(key)){if(image)image.src='';images.delete(key)}
      g.translate(0,-top);
      for(const p of needed){
        cancelled(signal);check();
        if(!images.has(p.id))images.set(p.id,await loadImage(p));
        cancelled(signal);check();
        await drawPlacement(g,p,images.get(p.id));
      }
      return canvas;
    }catch(error){canvas.width=canvas.height=1;throw error}
  }
  return {renderBand,dispose};
}
