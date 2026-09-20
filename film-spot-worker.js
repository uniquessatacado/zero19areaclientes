import {loadCmykConverter} from './film-cmyk-converter.js?v=2.17.9';
import {composeCmykSpot} from './film-tiff-core.js?v=2.17.9';

// A single export owns this worker. Main thread sends only one strip at a time;
// cancellation terminates the worker and its entire WASM heap immediately.
let converter=null,initializing=null,closed=false;
const MAX_RGBA_BYTES=16*1024*1024;

async function initialize(){
  if(closed)throw new Error('A exportação TIFF já foi encerrada.');
  if(converter)return converter;
  if(!initializing){
    initializing=loadCmykConverter().then(instance=>{
      if(closed){instance.close();throw new Error('A exportação TIFF foi cancelada.');}
      converter=instance;return instance;
    }).catch(error=>{initializing=null;throw error;});
  }
  return initializing;
}

self.onmessage=async event=>{
  const message=event.data||{};
  try{
    if(message.type==='dispose'){
      closed=true;converter?.close();converter=null;self.close();return;
    }
    if(message.type==='init'){
      await initialize();self.postMessage({type:'ready'});return;
    }
    if(message.type!=='convert')throw new Error('Solicitação de exportação TIFF desconhecida.');
    if(closed||!converter)throw new Error('O conversor CMYK ainda não está pronto.');
    if(!(message.rgba instanceof ArrayBuffer)||!message.rgba.byteLength||message.rgba.byteLength%4||message.rgba.byteLength>MAX_RGBA_BYTES)throw new Error('Faixa RGBA inválida ou muito grande para o TIFF.');
    const rgba=new Uint8Array(message.rgba),pixels=rgba.length/4,rgb=new Uint8Array(pixels*3);
    for(let i=0,j=0;i<rgba.length;i+=4,j+=3){rgb[j]=rgba[i];rgb[j+1]=rgba[i+1];rgb[j+2]=rgba[i+2];}
    const cmyk=converter.convertRGB(rgb);
    const result=composeCmykSpot(rgba,cmyk);
    if(!(result instanceof Uint8Array)||result.length!==pixels*5)throw new Error('Saída CMYK + Spot inválida.');
    self.postMessage({type:'converted',id:message.id,buffer:result.buffer},[result.buffer]);
  }catch(error){
    if(!closed)self.postMessage({type:'error',id:message.id,message:error?.message||'Falha na conversão CMYK + Spot.'});
  }
};
