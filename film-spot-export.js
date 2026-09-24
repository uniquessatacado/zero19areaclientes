import {cmToPx} from './nesting-core.js?v=2.17.9';
import {createSpotTiffHeader} from './film-tiff-core.js?v=2.17.9';

const ROWS=64,MB=1e6;
export function throwIfSpotCancelled(signal){if(signal?.aborted)throw new DOMException('Exportação cancelada.','AbortError')}

// Both PNG and TIFF render at the ORIGINAL film origin before trimming alpha.
// Rendering on a smaller shifted canvas changes browser sampling by up to one
// RGB level even at 90 degrees. Cropping must not cause a second color render.
export function spotCanvasGeometry(layout,trim){
  const fullWidth=cmToPx(layout.filmWidthMm/10),fullHeight=cmToPx(layout.lengthMm/10);
  const placements=layout.placements.filter(p=>p.yMm>=-.001&&p.yMm+p.heightMm<=layout.lengthMm+.001).map(p=>({...p,x:cmToPx(p.xMm/10),y:cmToPx(p.yMm/10),w:cmToPx(p.widthMm/10),h:cmToPx(p.heightMm/10)}));
  if(!placements.length)throw new Error('O filme está vazio. Recalcule a montagem.');
  return {placements,left:0,top:0,width:fullWidth,height:fullHeight};
}

export function preflightSpotExport({width,height,streaming=false,deviceMemory=globalThis.navigator?.deviceMemory}){
  const tiff=createSpotTiffHeader({width,height,dpi:300});
  if(width>32767||height>32767)throw new Error('O TIFF ultrapassa o limite de dimensão do navegador. Divida o job manualmente; o filme não será separado nem terá o DPI reduzido.');
  const canvasBytes=width*height*4,stripBytes=width*Math.min(ROWS,height)*24;
  const gb=Number(deviceMemory)||0;
  // navigator.deviceMemory is privacy-rounded and tops out at coarse buckets.
  // When File System Access is available we stream every converted strip directly
  // to disk, so the large TIFF output is never retained as a Blob in memory.
  // Keep non-streaming/mobile budgets unchanged; only the 4 GB desktop bucket
  // gets a targeted headroom increase for direct-to-disk jobs such as ~818 MB.
  const budget=gb>=8?1500*MB:gb>=4?(streaming?950:700)*MB:gb>=2?350*MB:gb>0?250*MB:512*MB;
  // Canvas/backing copies, live source images, WASM and one in-flight strip.
  // Blob fallback also retains the output and allows for a construction copy.
  const estimatedPeak=canvasBytes*2+96*MB+stripBytes+(streaming?0:tiff.totalBytes*2);
  if(!streaming&&tiff.totalBytes>192*MB)throw new Error('Este TIFF precisa de gravação direta em disco. Abra no Chrome ou Edge de computador e escolha onde salvar; neste navegador o arquivo excede o limite seguro de download. O filme não será dividido.');
  if(canvasBytes>900*MB||estimatedPeak>budget)throw new Error('O filme excede a estimativa segura de memória deste navegador ('+Math.ceil(estimatedPeak/MB)+' MB). Use um computador com mais memória ou divida o job manualmente. Não reduziremos o DPI nem separaremos as artes automaticamente.');
  return {...tiff,canvasBytes,stripBytes,estimatedPeak,budget,streaming};
}

export async function findSpotAlphaBounds(canvas,{signal,onProgress=()=>{}}={}){
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context)throw new Error('Não foi possível ler o filme. Falta memória no navegador.');
  const {width,height}=canvas;let left=width,top=height,right=-1,bottom=-1;
  for(let start=0;start<height;start+=ROWS){
    throwIfSpotCancelled(signal);
    const count=Math.min(ROWS,height-start),rgba=context.getImageData(0,start,width,count).data;
    for(let y=0;y<count;y++)for(let x=0;x<width;x++)if(rgba[(y*width+x)*4+3]!==0){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,start+y);bottom=Math.max(bottom,start+y)}
    onProgress({stage:'bounds',done:start+count,total:height});
    if(start%512===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  throwIfSpotCancelled(signal);
  if(right<left)throw new Error('O filme está totalmente transparente. Confira as artes antes de exportar.');
  return {x:left,y:top,width:right-left+1,height:bottom-top+1};
}

export function createSpotWorkerClient({signal,workerFactory=()=>new Worker(new URL('./film-spot-worker.js?v=2.17.9',import.meta.url),{type:'module'}),timeoutMs=60000}={}){
  throwIfSpotCancelled(signal);
  const worker=workerFactory();let pending=null,sequence=0,closed=false;
  const fail=error=>{if(pending){const task=pending;pending=null;clearTimeout(task.timer);task.reject(error)}};
  const dispose=()=>{if(closed)return;closed=true;worker.terminate();signal?.removeEventListener('abort',abort);fail(new DOMException('Exportação encerrada.','AbortError'))};
  const abort=()=>dispose();signal?.addEventListener('abort',abort,{once:true});
  worker.onerror=event=>{event.preventDefault?.();fail(new Error('Falha no conversor CMYK: '+(event.message||'não foi possível carregar o processamento local.')));dispose()};
  worker.onmessage=({data})=>{
    if(!pending)return;
    if(data.type==='error'){fail(new Error(data.message||'Falha na conversão CMYK.'));return}
    if(pending.kind==='init'&&data.type==='ready'||pending.kind==='convert'&&data.type==='converted'&&data.id===pending.id){const task=pending;pending=null;clearTimeout(task.timer);task.resolve(data)}
  };
  function request(kind,message,transfer=[]){
    throwIfSpotCancelled(signal);
    if(closed)return Promise.reject(new Error('O conversor já foi encerrado.'));
    if(pending)return Promise.reject(new Error('Somente uma faixa pode ser processada por vez.'));
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{fail(new Error('O conversor demorou demais. Cancele e tente novamente.'));dispose()},timeoutMs);
      pending={kind,id:message.id,resolve,reject,timer};
      try{worker.postMessage(message,transfer)}catch(error){fail(error);dispose()}
    });
  }
  return {ready:()=>request('init',{type:'init'}),dispose,async convert(rgba){
    const expected=rgba.byteLength/4*5,id=++sequence;
    const {buffer}=await request('convert',{type:'convert',id,rgba:rgba.buffer},[rgba.buffer]);
    if(!(buffer instanceof ArrayBuffer)||buffer.byteLength!==expected)throw new Error('O conversor retornou uma faixa TIFF incompleta.');
    return new Uint8Array(buffer);
  }};
}

// write() is awaited for every strip: disk backpressure, no queued full-image buffers.
export async function writeSpotCanvas({canvas,bounds,converter,write,signal,onProgress=()=>{}}){
  const header=createSpotTiffHeader({width:bounds.width,height:bounds.height,dpi:300});
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context)throw new Error('Não foi possível ler os pixels do filme.');
  let written=0;throwIfSpotCancelled(signal);
  await write(header.header);written+=header.header.byteLength;
  for(let y=0;y<bounds.height;y+=ROWS){
    throwIfSpotCancelled(signal);
    const rows=Math.min(ROWS,bounds.height-y),rgba=context.getImageData(bounds.x,bounds.y+y,bounds.width,rows).data;
    const converted=await converter.convert(rgba);throwIfSpotCancelled(signal);
    if(converted.byteLength!==bounds.width*rows*5)throw new Error('Tamanho inválido de uma faixa TIFF.');
    await write(converted);written+=converted.byteLength;
    onProgress({stage:'convert',done:y+rows,total:bounds.height,bytes:written});
  }
  throwIfSpotCancelled(signal);
  if(written!==header.totalBytes)throw new Error('O arquivo TIFF ficou incompleto. Nenhum download foi concluído.');
  return {width:bounds.width,height:bounds.height,bytes:written};
}

export async function exportCanvasWithSpot({name,geometry,renderCanvas,trim,signal,onProgress=()=>{},deviceMemory,workerFactory,picker=globalThis.showSaveFilePicker}){
  let streaming=typeof picker==='function',handle=null,sink=null,canvas=null,converter=null;
  let parts=[];
  preflightSpotExport({...geometry,streaming,deviceMemory});
  throwIfSpotCancelled(signal);
  if(typeof Worker==='undefined'&&!workerFactory)throw new Error('Este navegador não oferece o processamento local necessário ao TIFF. Use Chrome, Edge, Firefox ou Safari atualizado.');
  try{
    // Called directly from the click handler, before losing transient user activation.
    if(streaming){
      try{handle=await picker.call(globalThis,{suggestedName:name,types:[{description:'TIFF CMYK + Cor Spot 1',accept:{'image/tiff':['.tif']}}]})}
      catch(error){
        if(error.name==='AbortError')throw error;
        if(!['SecurityError','NotAllowedError','NotSupportedError'].includes(error.name))throw error;
        streaming=false;preflightSpotExport({...geometry,streaming,deviceMemory});
      }
    }
    throwIfSpotCancelled(signal);
    onProgress({stage:'profiles',done:0,total:0});
    converter=createSpotWorkerClient({signal,workerFactory});await converter.ready();
    throwIfSpotCancelled(signal);
    canvas=await renderCanvas({signal,onProgress});
    const alphaBounds=await findSpotAlphaBounds(canvas,{signal,onProgress});
    const bounds=trim?alphaBounds:{x:0,y:0,width:canvas.width,height:canvas.height};
    if(handle){sink=await handle.createWritable();throwIfSpotCancelled(signal)}
    const result=await writeSpotCanvas({canvas,bounds,converter,signal,onProgress,write:async bytes=>{if(sink)await sink.write(bytes);else parts.push(bytes)}});
    onProgress({stage:'finish',done:0,total:0});throwIfSpotCancelled(signal);
    if(sink){await sink.close();sink=null;return {...result,saved:true,name}}
    const blob=new Blob(parts,{type:'image/tiff'});parts=[];
    if(blob.size!==result.bytes)throw new Error('O download TIFF ficou incompleto.');
    return {...result,saved:false,name,blob};
  }catch(error){if(sink)try{await sink.abort()}catch{}throw error}
  finally{converter?.dispose();if(canvas){canvas.width=1;canvas.height=1}parts=[]}
}
