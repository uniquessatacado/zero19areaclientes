import {
  instantiate, LCMS_VERSION, TYPE_RGB_8, TYPE_CMYK_8,
  INTENT_RELATIVE_COLORIMETRIC, cmsFLAGS_NOOPTIMIZE,
  cmsFLAGS_BLACKPOINTCOMPENSATION,
} from './vendor/lcms-wasm/1.0.5/lcms.js';

// Fixed, measured production recipe. Never substitute a generic RGB->CMYK formula.
export const CMYK_CONVERSION_FLAGS=cmsFLAGS_BLACKPOINTCOMPENSATION|cmsFLAGS_NOOPTIMIZE;
export const CMYK_ENGINE_VERSION=LCMS_VERSION;
const MAX_PIXELS=4*1024*1024;
const wasmURL=new URL('./vendor/lcms-wasm/1.0.5/lcms.wasm',import.meta.url);
export const CMYK_ASSETS=Object.freeze({
  source:Object.freeze({path:'./assets/print/sRGB-IEC61966-2.1.icc',bytes:3144,sha256:'2b3aa1645779a9e634744faf9b01e9102b0c9b88fd6deced7934df86b949af7e'}),
  destination:Object.freeze({path:'./assets/print/swop-custom-019.icc',bytes:724164,sha256:'45d7d7ca4ee66545884c007d90e0efa96ab87c0ddbcb1aa1ee2095cc95c29fae'}),
  wasm:Object.freeze({path:'./vendor/lcms-wasm/1.0.5/lcms.wasm',bytes:315910,sha256:'dbcbee3fb3a49459a60bb6b29d6ab25fe7c219b0cc0c2b9579c0cc78f7390ddd'}),
});

function byteArray(value,label){
  if(value instanceof ArrayBuffer)return new Uint8Array(value);
  if(value instanceof Uint8Array||value instanceof Uint8ClampedArray)return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
  throw new TypeError(label+': bytes de 8 bits inválidos.');
}
function checkedProfile(value,space,label){
  const bytes=byteArray(value,label);
  if(bytes.length<128||bytes.length>2*1024*1024)throw new Error(label+': tamanho de perfil ICC inválido.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const tag=offset=>String.fromCharCode(...bytes.subarray(offset,offset+4));
  if(view.getUint32(0,false)!==bytes.length||tag(36)!=='acsp'||tag(16)!==space)throw new Error(label+': perfil ICC incompatível.');
  return bytes;
}

export async function createCmykConverter({sourceProfileBytes,destinationProfileBytes,wasmBinary}={}){
  const sourceBytes=checkedProfile(sourceProfileBytes,'RGB ','Origem RGB');
  const destinationBytes=checkedProfile(destinationProfileBytes,'CMYK','Destino CMYK');
  const options={locateFile:()=>wasmURL.href};
  if(wasmBinary!==undefined)options.wasmBinary=byteArray(wasmBinary,'Motor WASM');
  const lcms=await instantiate(options);
  let source=0,destination=0,transform=0;
  try{
    source=lcms.cmsOpenProfileFromMem(sourceBytes,sourceBytes.length);
    destination=lcms.cmsOpenProfileFromMem(destinationBytes,destinationBytes.length);
    if(!source||!destination)throw new Error('Não foi possível abrir os perfis ICC do TIFF.');
    transform=lcms.cmsCreateTransform(source,TYPE_RGB_8,destination,TYPE_CMYK_8,INTENT_RELATIVE_COLORIMETRIC,CMYK_CONVERSION_FLAGS);
    if(!transform)throw new Error('Não foi possível preparar a conversão CMYK do TIFF.');
  }finally{
    if(source)lcms.cmsCloseProfile(source);
    if(destination)lcms.cmsCloseProfile(destination);
  }
  return {
    convertRGB(rgb){
      if(!transform)throw new Error('O conversor CMYK já foi encerrado.');
      const input=byteArray(rgb,'Faixa RGB');
      if(!input.length||input.length%3!==0)throw new Error('Faixa RGB inválida: são necessários três canais por pixel.');
      const pixels=input.length/3;
      if(pixels>MAX_PIXELS)throw new Error('Faixa de conversão muito grande; processe o filme em faixas menores.');
      const converted=lcms.cmsDoTransform(transform,input,pixels);
      if(!(converted instanceof Uint8Array)||converted.length!==pixels*4)throw new Error('O conversor não produziu os quatro canais CMYK esperados.');
      return converted;
    },
    close(){if(transform){lcms.cmsDeleteTransform(transform);transform=0;}},
  };
}

async function fetchVerifiedAsset(asset){
  if(!globalThis.crypto?.subtle)throw new Error('A exportação TIFF precisa de conexão segura (HTTPS ou localhost).');
  const url=new URL(asset.path,import.meta.url);
  const response=await fetch(url,{credentials:'same-origin',redirect:'error'});
  if(!response.ok)throw new Error('Não foi possível carregar um recurso de cor do TIFF ('+response.status+').');
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length!==asset.bytes)throw new Error('Recurso de cor incompleto. Recarregue o sistema e tente novamente.');
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const hash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  if(hash!==asset.sha256)throw new Error('Integridade do recurso de cor inválida. Recarregue o sistema e tente novamente.');
  return bytes;
}

export async function loadCmykConverter(){
  const [sourceProfileBytes,destinationProfileBytes,wasmBinary]=await Promise.all([
    fetchVerifiedAsset(CMYK_ASSETS.source),fetchVerifiedAsset(CMYK_ASSETS.destination),fetchVerifiedAsset(CMYK_ASSETS.wasm),
  ]);
  return createCmykConverter({sourceProfileBytes,destinationProfileBytes,wasmBinary});
}
