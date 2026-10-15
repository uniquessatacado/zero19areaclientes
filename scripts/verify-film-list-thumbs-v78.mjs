// 2.17.78: miniaturas da lista "Artes adicionadas". DOM simulado, rede simulada; nada real é baixado.
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const dist=path.resolve(process.argv[2]||'dist');
const {createFilmListThumbs}=await import(pathToFileURL(path.join(dist,'film-list-thumbs.js')).href);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
let inFlight=0,maxInFlight=0;const hits={};
globalThis.fetch=async url=>{hits[url]=(hits[url]||0)+1;inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);
 try{await new Promise(r=>setTimeout(r,25));if(url.includes('missing'))return new Response('no',{status:404});return new Response(png,{headers:{'content-type':'image/png'}});}finally{inFlight--;}};
const win={devicePixelRatio:2,matchMedia:()=>({matches:false})};
// DOM mínimo: lista com nós de miniatura que podem ser trocados por <img>.
const root={isConnected:true,nodes:[],querySelectorAll(selector){assert.equal(selector,'[data-film-thumb]');return this.nodes.filter(n=>n.dataset.filmThumb);}};
const parse=html=>{const id=/data-film-thumb="([^"]+)"/.exec(html)?.[1];const state=/data-thumb-state="([^"]+)"/.exec(html)?.[1];return {html,dataset:id?{filmThumb:id,thumbState:state}:{},addEventListener(){},
 replaceWith(next){root.nodes[root.nodes.indexOf(this)]=next;},set outerHTML(value){root.nodes[root.nodes.indexOf(this)]=parse(value);}};};
const doc={defaultView:win,createElement:tag=>{assert.equal(tag,'img');return {tag,dataset:{}};}};
let current=true;
const items=[...Array.from({length:10},(_,n)=>({localId:'site'+n,type:'asset',path:`site/${n}.png`,storageBucket:'z19p-private'})),
 {localId:'gone',type:'asset',path:'site/missing.png',storageBucket:'z19p-private'},
 {localId:'letter',type:'team_customization',previewDataUrl:'data:image/png;base64,AAAA'}];
const asked=[];
const thumbs=createFilmListThumbs({doc,items:()=>items,isCurrent:()=>current,resolveSource:async item=>{asked.push(item.localId);return item.path.includes('missing')?['https://files.test/thumb-missing.png','https://files.test/missing.png']:[`https://files.test/thumb-${item.localId}.png`,`https://files.test/${item.path}`];}});
// Antes de carregar: nunca "ARTE" para arte que existe; escrita aparece na hora.
assert.match(thumbs.markup(items[0]),/data-film-thumb="site0"[^>]*>Carregando…/);
assert.match(thumbs.markup(items.at(-1)),/^<img src="data:image\/png;base64,AAAA"/);
root.nodes=items.map(item=>parse(thumbs.markup(item)));
thumbs.attach(root);
const until=async(fn,ms=8000)=>{const end=Date.now()+ms;while(!fn()){if(Date.now()>end)throw new Error('tempo esgotado');await new Promise(r=>setTimeout(r,15));}};
await until(()=>[...thumbs.states.values()].length===11&&[...thumbs.states.values()].every(s=>s.status==='ready'||s.status==='error'));
assert.ok(maxInFlight>=2&&maxInFlight<=4,'carrega em paralelo, com limite ('+maxInFlight+')');
for(let n=0;n<10;n++){const node=root.nodes[n];assert.equal(node.tag,'img','arte '+n+' com miniatura');assert.match(node.src,/^blob:/);}
assert.equal(hits['https://files.test/thumb-site0.png'],1,'miniatura leve primeiro');assert.equal(hits['https://files.test/site/0.png'],undefined,'não baixa o arquivo de impressão quando a leve serve');
const gone=root.nodes[10];assert.equal(gone.dataset.thumbState,'error','arte sem arquivo mostra o problema');assert.match(gone.html,/Sem prévia/);assert.match(gone.html,/não encontrado/);
assert.equal(asked.filter(id=>id==='gone').length,1,'arquivo inexistente não insiste');
// Lista redesenhada (ex.: depois de 15 min, ao mudar quantidade): miniatura continua, sem baixar de novo.
const before=Object.values(hits).reduce((a,b)=>a+b,0);
assert.match(thumbs.markup(items[3]),/^<img src="blob:/);
assert.equal(Object.values(hits).reduce((a,b)=>a+b,0),before);
// Página trocada: para tudo e libera a memória.
current=false;thumbs.attach(root);assert.equal(thumbs.states.size,0);
console.log('019 2.17.78: miniaturas da lista carregam em paralelo, leves primeiro, uma arte com problema não esconde as outras e não somem ao redesenhar.');
