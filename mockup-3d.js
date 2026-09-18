import {GARMENT_SHARE_MAX_BYTES,isGarmentSharePath,isPublicGarmentArtPath,parseGarmentSharePayload} from './garment-share.js?v=2.17.3';
const status=document.querySelector('#status'),storageBase='https://kedggjyerexnzmipaick.supabase.co/storage/v1/object/public/z19p-assets/',presentationBase='https://kedggjyerexnzmipaick.supabase.co/storage/v1/object/public/z19p-presentations/';
const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);let currentViewer;
window.addEventListener('pagehide',()=>{controller.abort();currentViewer?.close?.()},{once:true});
async function readPresentation(response){
  if(!response.ok)throw new Error('Esta apresentação não está disponível. Peça um novo link à Zero 19.');
  if(Number(response.headers.get('content-length'))>GARMENT_SHARE_MAX_BYTES)throw new Error('A apresentação excede o limite de tamanho.');
  if(!response.body)throw new Error('Não foi possível ler a apresentação.');
  const reader=response.body.getReader(),chunks=[];let bytes=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>GARMENT_SHARE_MAX_BYTES)throw new Error('A apresentação excede o limite de tamanho.');chunks.push(value)}}catch(error){await reader.cancel().catch(()=>{});throw error}finally{reader.releaseLock()}
  const combined=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){combined.set(chunk,offset);offset+=chunk.length}return JSON.parse(new TextDecoder().decode(combined));
}
try{
  const path=new URLSearchParams(location.search).get('path')||'';
  if(!isGarmentSharePath(path))throw new Error('Este link 3D é inválido. Peça um novo link à Zero 19.');
  const response=await fetch(presentationBase+path,{credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal}),scene=parseGarmentSharePayload(await readPresentation(response));clearTimeout(timeout);
  document.title=`${scene.title} — Zero 19`;
  const open=async()=>{try{const {openGarment3D}=await import('./garment-3d.js?v=2.17.3');currentViewer=await openGarment3D({publicUrl:artPath=>{if(!isPublicGarmentArtPath(artPath))throw new Error('Caminho de imagem inválido.');return storageBase+artPath.split('/').map(encodeURIComponent).join('/')}},scene,{readOnly:true,publicPresentation:true});status.hidden=true;await currentViewer.done;status.hidden=false;status.querySelector('p').textContent='Sua camiseta está pronta para visualizar novamente.'}catch(error){status.hidden=false;status.querySelector('p').textContent=error.message||'Não foi possível abrir o 3D neste aparelho.'}};
  const button=document.createElement('button');button.textContent='Abrir camiseta em 3D';button.onclick=open;status.append(button);await open();
}catch(error){status.querySelector('p').textContent=error.name==='AbortError'?'O carregamento demorou demais. Confira sua conexão e atualize a página.':error.message||'Não foi possível abrir a apresentação.'}finally{clearTimeout(timeout)}
