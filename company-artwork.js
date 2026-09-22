import {cropCanvasToAlpha} from './film-export-core.js?v=2.17.12';

export const ARTWORK_RULER_HINT='Meça com uma régua sobre a camisa para ter certeza do tamanho da arte.';
export function artworkPhysicalSize(widthCm,pixelWidth,pixelHeight){
  const width=Number(String(widthCm??'').trim().replace(',','.'));
  if(!Number.isFinite(width)||width<0.1||width>100)throw new Error('Informe a largura da arte entre 0,1 e 100 cm.');
  if(!Number.isSafeInteger(pixelWidth)||!Number.isSafeInteger(pixelHeight)||pixelWidth<1||pixelHeight<1)throw new Error('Não foi possível conferir as dimensões da arte.');
  const height=Number((width*pixelHeight/pixelWidth).toFixed(4));
  if(height<0.1||height>300)throw new Error('A altura proporcional da arte deve ficar entre 0,1 e 300 cm. Confira a largura.');
  return {widthCm:width,heightCm:height};
}

let crcTable;
function crc32(bytes){
  if(!crcTable){crcTable=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c>>>0;}}
  let c=0xffffffff;for(const byte of bytes)c=crcTable[(c^byte)&255]^(c>>>8);return (c^0xffffffff)>>>0;
}
export async function setArtworkPngDpi(blob,dpi=300){
  const bytes=new Uint8Array(await blob.arrayBuffer()),signature=[137,80,78,71,13,10,26,10];
  if(bytes.length<45||signature.some((byte,index)=>bytes[index]!==byte))throw new Error('Não foi possível gerar um PNG válido para a arte.');
  if(!Number.isFinite(dpi)||dpi<=0||dpi>10000)throw new Error('Resolução PNG inválida.');
  const phys=new Uint8Array(21),view=new DataView(phys.buffer),ppm=Math.round(dpi/0.0254);
  view.setUint32(0,9);phys.set([112,72,89,115],4);view.setUint32(8,ppm);view.setUint32(12,ppm);phys[16]=1;view.setUint32(17,crc32(phys.subarray(4,17)));
  const chunks=[bytes.subarray(0,8)],input=new DataView(bytes.buffer);let offset=8,inserted=false,ended=false;
  while(offset+12<=bytes.length){
    const length=input.getUint32(offset),end=offset+12+length;if(end>bytes.length)throw new Error('O PNG gerado está incompleto.');
    const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
    if(type!=='pHYs')chunks.push(bytes.subarray(offset,end));
    if(type==='IHDR'&&!inserted){chunks.push(phys);inserted=true;}
    offset=end;if(type==='IEND'){ended=true;break;}
  }
  if(!inserted||!ended)throw new Error('O PNG gerado está incompleto.');
  return new Blob(chunks,{type:'image/png'});
}

// The company and film use the same exact alpha crop. Preserve every visible
// pixel, including alpha=1; keep the original file as a separate upload.
export async function processCompanyArtwork(file,widthCm=null){
  if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size<1||file.size>25*1024*1024)throw new Error('Envie uma arte PNG, JPG ou WebP de até 25 MB.');
  const bitmap=await createImageBitmap(file);let canvas,trimmed;
  try{
    const sourceWidth=bitmap.width,sourceHeight=bitmap.height;
    if(sourceWidth>16384||sourceHeight>16384||sourceWidth*sourceHeight>40000000)throw new Error('A imagem é grande demais para preparar neste navegador. Envie uma versão de até 40 megapixels.');
    canvas=document.createElement('canvas');canvas.width=sourceWidth;canvas.height=sourceHeight;
    const context=canvas.getContext('2d',{willReadFrequently:true,alpha:true});if(!context)throw new Error('Não foi possível abrir a imagem.');context.drawImage(bitmap,0,0);
    const cropped=await cropCanvasToAlpha(canvas);trimmed=cropped.canvas;
    const width=trimmed.width,height=trimmed.height,physical=widthCm===null?{widthCm:null,heightCm:null}:artworkPhysicalSize(widthCm,width,height);
    const raw=await new Promise((resolve,reject)=>trimmed.toBlob(blob=>blob?resolve(blob):reject(new Error('Não foi possível preparar a arte.')),'image/png'));
    const processedBlob=await setArtworkPngDpi(raw,300);
    if(processedBlob.size>25*1024*1024)throw new Error('O PNG preparado ultrapassou 25 MB. Envie uma arte com dimensões menores.');
    return {originalFile:file,processedBlob,width,height,...physical,sourceWidth,sourceHeight,dpi:300,alphaTrimmed:true};
  }finally{bitmap.close?.();if(canvas){canvas.width=0;canvas.height=0;}if(trimmed&&trimmed!==canvas){trimmed.width=0;trimmed.height=0;}}
}
