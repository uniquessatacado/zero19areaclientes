import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// 20/10 (dono): a fila tinha 1108 itens e o Supabase entrega no máximo 1000 linhas por consulta;
// os pedidos mais novos (números do estúdio do #50417) sumiam do filme. A leitura vai em páginas.
const source=fs.readFileSync(new URL('../zero19-pdv-sync.js',import.meta.url),'utf8');
const start=source.indexOf('  const PAGE_ROWS=1000,ID_CHUNK=120;'),end=source.indexOf('  async function load(force=false){',start);
assert(start>=0&&end>start,'Leitura em páginas existe antes do load');
const loadBody=source.slice(end,source.indexOf('  function invalidate(){',end));
assert(/readAllRows\(withCount=>supabase\.from\('z19p_zero19_work_items'\)\.select\('\*',countOption\(withCount\)\)\.eq\('owner_id',owner\)\.in\('stage',STAGE_ORDER\)/.test(loadBody),'Fila principal lida em páginas');
for(const table of ['personalization_sales','z19p_projects','z19p_workspaces'])assert(new RegExp("readRowsByIds\\([a-zA-Z]+,\\(part,withCount\\)=>supabase\\.from\\('"+table+"'\\)").test(loadBody),table+' em partes');
assert(/readRowsByIds\(ids,\(part,withCount\)=>supabase\.from\('z19p_zero19_work_items'\)\.select\('id,project_id,stage'/.test(loadBody),'Progresso do pedido em partes');
assert(!/\.in\('id',(saleIds|projectIds|workspaceIds)\)/.test(loadBody),'Nenhuma lista inteira de IDs na mesma consulta');

const CAP=1000,MAX_IDS=120,calls=[];
function table(name,rows){
  return {select(fields,options){
    const filters=[],orders=[];let range=null;
    const query={
      eq(key,value){filters.push(row=>row[key]===value);return query;},
      in(key,values){assert(values.length<=MAX_IDS,'lista de IDs dentro do limite em '+name);filters.push(row=>values.includes(row[key]));return query;},
      order(key,opts={}){orders.push([key,opts]);return query;},
      range(from,to){range=[from,to];return query;},
      then(resolve,reject){
        try{
          calls.push({name,count:options?.count||null,range});
          let list=rows.filter(row=>filters.every(test=>test(row)));
          const total=list.length;
          list=[...list].sort((a,b)=>{for(const [key,opts] of orders){const x=a[key],y=b[key];if(x===y)continue;if(x==null)return opts.nullsFirst?-1:1;if(y==null)return opts.nullsFirst?1:-1;const result=x<y?-1:1;return opts.ascending===false?-result:result;}return 0;});
          const [from,to]=range||[0,list.length-1];
          resolve({data:list.slice(from,Math.min(to+1,from+CAP)),error:null,count:options?.count==='exact'?total:null});
        }catch(error){reject(error);}
      }
    };
    return query;
  }};
}
const STAGES=['awaiting_release','awaiting_art','art_received','awaiting_halftone','awaiting_font','ready_production','production','ready_pickup'];
const pad=n=>String(n).padStart(4,'0');
const items=[];
for(let n=0;n<1097;n++)items.push({id:'old-'+pad(n),owner_id:'owner',stage:n<827?'ready_pickup':'production',project_id:'p-'+pad(n%354),promised_at:'2026-10-'+String(10+Math.floor(n/100)).padStart(2,'0')+'T10:00:00Z',created_at:'2026-10-01T00:00:00Z'});
for(let n=0;n<11;n++)items.push({id:'novo-'+pad(n),owner_id:'owner',stage:'ready_production',project_id:'p-50417',promised_at:'2026-10-24T'+String(10+n).padStart(2,'0')+':00:00Z',created_at:'2026-10-20T00:00:00Z'});
items.push({id:'outra-conta',owner_id:'other',stage:'ready_production',project_id:'p-x',promised_at:'2026-10-30T00:00:00Z',created_at:'2026-10-20T00:00:00Z'});
const projects=[...new Set(items.map(row=>row.project_id))].map((id,index)=>({id,owner_id:'owner',source_order_created_at:index%7?'2026-10-'+String(1+index%28).padStart(2,'0')+'T00:00:00Z':null}));
const supabase={from:name=>table(name,name==='z19p_zero19_work_items'?items:name==='z19p_projects'?projects:[])};
const api=vm.runInNewContext(source.slice(start,end)+';({readAllRows,readRowsByIds,countOption,newestOrderFirst})',{});

const all=await api.readAllRows(withCount=>supabase.from('z19p_zero19_work_items').select('*',api.countOption(withCount)).eq('owner_id','owner').in('stage',STAGES).order('promised_at',{ascending:true,nullsFirst:false}).order('created_at').order('id'));
assert.equal(all.error,null);
assert.equal(all.data.length,1108,'Todos os 1108 itens da conta, além do limite de 1000');
assert.equal(new Set(all.data.map(row=>row.id)).size,1108,'Sem item repetido entre páginas');
assert.deepEqual(Array.from(all.data.filter(row=>row.stage==='ready_production'),row=>row.id),Array.from({length:11},(_,n)=>'novo-'+pad(n)),'Os 11 itens novos prontos para o filme chegam');
assert(!all.data.some(row=>row.owner_id!=='owner'),'Só a conta atual');
const pages=calls.filter(call=>call.name==='z19p_zero19_work_items');
assert.equal(pages.length,2,'Duas páginas: 1000 + 108');assert.equal(pages[0].count,'exact');assert.equal(pages[1].count,null);

calls.length=0;
const projectIds=[...new Set(all.data.map(row=>row.project_id))];
const read=await api.readRowsByIds(projectIds,(part,withCount)=>supabase.from('z19p_projects').select('*',api.countOption(withCount)).eq('owner_id','owner').in('id',part).order('id'));
assert.equal(read.error,null);assert.equal(read.data.length,projectIds.length,'Todos os pedidos');
assert(calls.length>=3,'Lista de IDs dividida');
const sorted=[...read.data].sort(api.newestOrderFirst);
const times=sorted.map(row=>row.source_order_created_at);
assert.equal(times.at(-1),null,'Pedido sem data vai para o fim');
const dated=times.filter(Boolean);assert.deepEqual(dated,[...dated].sort().reverse(),'Mais novo primeiro, como antes');

const failing={from:()=>({select:()=>{const q={eq:()=>q,in:()=>q,order:()=>q,range:()=>q,then:resolve=>resolve({data:null,error:new Error('falhou')})};return q;}})};
const failed=await api.readAllRows(withCount=>failing.from('x').select('*',api.countOption(withCount)).eq('a',1).order('id'));
assert.equal(failed.data,null);assert.equal(failed.error.message,'falhou','Erro do banco continua aparecendo');
const empty=await api.readRowsByIds([],()=>{throw new Error('não consulta sem IDs');});
assert.equal(empty.error,null);assert.equal(empty.data.length,0);
console.log('PASS fila ZERO19 inteira: 1108 itens em 2 páginas (limite 1000), itens novos do filme chegam, listas de IDs em partes, ordem dos pedidos mantida, erro do banco preservado.');
