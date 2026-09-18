import {analyzeRgba} from './production-cost-core.js?v=2.17.3';

const abortError=()=>new DOMException('Análise da arte cancelada.','AbortError');
const checkAbort=signal=>{if(signal?.aborted)throw abortError();};

export async function analyzeRgbaInWorker(imageData,{channelMode='CMYW',signal}={}){
  checkAbort(signal);
  if(typeof Worker==='undefined')return analyzeRgba(imageData.data,imageData.width,imageData.height,{channelMode});
  const worker=new Worker(new URL('./production-cost-worker.js?v=2.17.3',import.meta.url),{type:'module'});
  return new Promise((resolve,reject)=>{
    let finished=false;
    const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',onAbort);worker.terminate();error?reject(error):resolve(value);};
    const onAbort=()=>finish(abortError()),timer=setTimeout(()=>finish(new Error('A análise da arte demorou demais. Tente novamente.')),15000);
    signal?.addEventListener('abort',onAbort,{once:true});
    if(signal?.aborted){onAbort();return;}
    worker.onmessage=event=>event.data?.ok?finish(null,event.data.analysis):finish(new Error(event.data?.error||'Não foi possível analisar a arte.'));
    worker.onerror=event=>finish(new Error(event.message||'Não foi possível iniciar a análise de cores.'));
    // Copy only the small sample: callers retain their canvas/imageData pixels.
    try{
      const pixels=new Uint8ClampedArray(imageData.data);
      worker.postMessage({id:1,buffer:pixels.buffer,width:imageData.width,height:imageData.height,channelMode},[pixels.buffer]);
    }catch(error){finish(error);}
  });
}

export async function analyzeImageForProduction(url,{channelMode='CMYW',maxDimension=512,signal}={}){
  checkAbort(signal);
  if(typeof url!=='string'||!url)throw new Error('A arte não possui imagem disponível para estimar seu consumo.');
  if(!Number.isInteger(maxDimension)||maxDimension<1||maxDimension>512)throw new Error('A amostra de análise deve ter entre 1 e 512 pixels por dimensão.');
  let response;
  try{response=await fetch(url,{mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',signal});}
  catch(error){if(signal?.aborted)throw abortError();throw new Error('Não foi possível ler a arte para estimar as cores. Confira a conexão e a permissão de acesso à imagem.');}
  if(!response.ok)throw new Error('Não foi possível baixar a arte para análise de custos.');
  const blob=await response.blob();checkAbort(signal);let image=null,objectUrl=null,canvas=null;
  try{
    if(typeof createImageBitmap==='function'){try{image=await createImageBitmap(blob);}catch{checkAbort(signal);}}
    if(!image){objectUrl=URL.createObjectURL(blob);image=new Image();image.src=objectUrl;try{await image.decode();}catch{throw new Error('O arquivo desta arte não pôde ser lido como imagem.');}}
    checkAbort(signal);
    const sourceWidth=image.width||image.naturalWidth,sourceHeight=image.height||image.naturalHeight;
    if(!(sourceWidth>0&&sourceHeight>0)||sourceWidth*sourceHeight>100e6)throw new Error('A imagem tem dimensões inválidas ou excede o limite seguro de análise.');
    const ratio=Math.min(1,maxDimension/Math.max(sourceWidth,sourceHeight)),width=Math.max(1,Math.round(sourceWidth*ratio)),height=Math.max(1,Math.round(sourceHeight*ratio));
    canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(width,height):document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Seu navegador não disponibilizou a análise de imagem.');
    context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.clearRect(0,0,width,height);context.drawImage(image,0,0,width,height);
    let pixels;try{pixels=context.getImageData(0,0,width,height);}catch{throw new Error('Esta imagem não autorizou a leitura de pixels. O consumo não será presumido.');}
    const analysis=await analyzeRgbaInWorker(pixels,{channelMode,signal});
    return {...analysis,sourceWidth,sourceHeight,sampled:width!==sourceWidth||height!==sourceHeight};
  }finally{image?.close?.();if(objectUrl)URL.revokeObjectURL(objectUrl);if(canvas)canvas.width=canvas.height=1;}
}
