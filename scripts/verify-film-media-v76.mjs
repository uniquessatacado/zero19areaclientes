// Film preview loader: parallel, no short give-up, clear "file missing" error,
// automatic retry and direct-image fallback. Fake DOM, mocked network.
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const dist=path.resolve(process.argv[2]||'dist');
const {createFilmMedia,makeFilmPreview}=await import(pathToFileURL(path.join(dist,'film-media-v74.js')).href);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
let inFlight=0,maxInFlight=0;const hits={};
globalThis.fetch=async(url)=>{hits[url]=(hits[url]||0)+1;inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);
  try{await new Promise(r=>setTimeout(r,40));
    if(url.includes('missing'))return new Response('no',{status:404});
    if(url.includes('flaky')&&hits[url]===1)throw new TypeError('network');
    if(url.includes('cors'))throw new TypeError('cors');
    return new Response(png,{headers:{'content-type':'image/png'}});
  }finally{inFlight--;}};
class FakeImage{set src(v){this._s=v;if(v)setTimeout(()=>v.includes('cors')?this.onload?.():this.onerror?.(),5);}get src(){return this._s;}}
const win={devicePixelRatio:1,matchMedia:()=>({matches:false}),Image:FakeImage};
const doc={defaultView:win,createElement:()=>({getContext:()=>null,width:1,height:1})};
const node=id=>{const img={style:{width:'200px',height:'200px'},attrs:{},getAttribute(k){return this.attrs[k];},removeAttribute(k){delete this.attrs[k];},set src(v){this.attrs.src=v;},get src(){return this.attrs.src;}};
  const note={textContent:'',title:'',removeAttribute(){this.title='';}};
  return {dataset:{itemId:id},isConnected:true,clientWidth:200,clientHeight:200,addEventListener(){},querySelector:s=>s==='img'?img:note,img,note};};
const items=['ok1','ok2','ok3','missing','flaky','cors'].map(k=>({localId:k,type:'asset',path:k+'.png'}));
const nodes=items.map(i=>node(i.localId));let last;
const media=createFilmMedia({shell:{ownerDocument:doc},items,resolveSource:async i=>'https://files.test/'+i.path,onProgress:p=>{last=p;}});
media.sync(nodes);
const until=async(fn,ms=8000)=>{const end=Date.now()+ms;while(!fn()){if(Date.now()>end)throw new Error('tempo esgotado: '+JSON.stringify(last));await new Promise(r=>setTimeout(r,20));}};
await until(()=>last&&last.ready+last.errors===6);
const state=n=>n.dataset.mediaState;
assert.ok(maxInFlight>=2,'downloads run in parallel ('+maxInFlight+')');
for(const k of ['ok1','ok2','ok3','flaky'])assert.equal(state(nodes[items.findIndex(i=>i.localId===k)]),'ready',k+' shows');
const cors=nodes[5];assert.equal(state(cors),'ready','direct file fallback shows the art');assert.equal(cors.img.src,'https://files.test/cors.png');
const missing=nodes[3];assert.equal(state(missing),'error');assert.match(missing.note.textContent,/não encontrado.*erro 404/);assert.equal(hits['https://files.test/missing.png'],1,'missing file is not hammered');
assert.equal(last.ready,5);assert.equal(last.errors,1);
const small=await makeFilmPreview('https://files.test/ok1.png',{doc,target:1536});assert.equal(small.full,true,'small original is shown untouched');
media.destroy();
console.log('verify-film-media-v76: ok (paralelo '+maxInFlight+', erro 404 claro, nova tentativa e arquivo direto).');
