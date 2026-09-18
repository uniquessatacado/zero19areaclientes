import {isGalleryPath,parseGallery,PRESENTATION_BASE} from './garment-presentation.js?v=2.17.3';
// Public read-only JSON manifest. No stored HTML, scripts, tabs or account session.
const status=document.querySelector('#status'),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
window.addEventListener('pagehide',()=>controller.abort(),{once:true});
try{
  const path=new URLSearchParams(location.search).get('path')||'';
  if(!isGalleryPath(path))throw new Error('Este link de apresentação é inválido. Peça um novo link à Zero 19.');
  const response=await fetch(PRESENTATION_BASE+path,{credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
  if(!response.ok)throw new Error('Esta apresentação não está disponível. Confira o link com a Zero 19.');
  const limit=16384;if(Number(response.headers.get('content-length'))>limit)throw new Error('Apresentação inválida: tamanho excedido.');
  const reader=response.body.getReader(),chunks=[];let bytes=0;try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>limit)throw new Error('Apresentação inválida: tamanho excedido.');chunks.push(value)}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  const buffer=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length}const gallery=parseGallery(JSON.parse(new TextDecoder().decode(buffer)),path);
  document.title=gallery.title+' — Zero 19';const main=document.createElement('main');main.className='customer-gallery';const header=document.createElement('header'),brand=document.createElement('small'),title=document.createElement('h1'),description=document.createElement('p');brand.textContent='ZERO 19 / SUA CAMISETA';title.textContent=gallery.title;description.textContent=gallery.model+' · '+gallery.color+' — Role para conferir todas as vistas. Amplie com o gesto de pinça.';header.append(brand,title,description);main.append(header);
  for(const [index,view] of gallery.views.entries()){const figure=document.createElement('figure'),caption=document.createElement('figcaption'),image=document.createElement('img');caption.textContent=view.label;image.src=PRESENTATION_BASE+view.path;image.alt=view.label+' da camiseta personalizada';image.width=view.width;image.height=view.height;image.loading=index?'lazy':'eager';image.decoding='async';image.onerror=()=>{const error=document.createElement('p');error.textContent='Não foi possível carregar esta vista. Atualize a página ou peça um novo link.';image.replaceWith(error)};figure.append(caption,image);main.append(figure)}
  const footer=document.createElement('footer');footer.textContent='Simulação visual. Confirme medidas e posições antes da produção; as cores podem variar entre telas.';main.append(footer);status.replaceWith(main);
}catch(error){status.querySelector('p').textContent=error.name==='AbortError'?'O carregamento demorou demais. Confira a conexão e atualize.':error.message||'Não foi possível abrir a apresentação.'}finally{clearTimeout(timer)}
