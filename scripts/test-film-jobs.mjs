import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {rotatedBoundsMm} from '../nesting-core.js';

const source=await fs.readFile(new URL('../production-v217.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('  let filmJobSaving='),source.lastIndexOf('  return {buildQuotePdf'));
assert.ok(code.includes('async function saveFilmJob'));
const copy=value=>JSON.parse(JSON.stringify(value));
const item=(id='a1')=>({localId:'local-'+id,type:'asset',sourceId:id,label:'Arte '+id,quantity:1,widthCm:10,heightCm:5,path:id+'/processed.png'});
const layoutFor=items=>({filmWidthMm:280,lengthMm:50,mode:'normal',gapMm:3,efficiency:60,waste:40,placements:items.map((art,index)=>({id:art.localId,copy:0,xMm:index*104,yMm:0,widthMm:100,heightMm:50,rotation:0,locked:false}))});

function harness({items=[item()],projects={a1:'project-1'},failItems=false,failCleanup=false,gate=null}={}){
  const jobs=new Map(),rows=[],calls=[],messages=[],elements={'#saveFilm':{disabled:false,textContent:'Salvar job',isConnected:true},'#filmMedia':{value:'media-28'},'#filmMode':{value:'normal'},'#filmGap':{value:'3'}};
  const supabase={from(table){let action='select',payload=null,filters={},ids=null,promise;
    const query={select(){return query},insert(value){action='insert';payload=copy(value);return query},update(value){action='update';payload=copy(value);return query},delete(){action='delete';return query},eq(key,value){filters[key]=value;return query},in(key,value){ids=value;return query},single(){return query},then(resolve,reject){if(!promise)promise=(async()=>{
      calls.push({table,action,payload,filters});
      if(table==='z19p_assets'){assert.equal(action,'select');if(gate)await gate;return {data:ids.filter(id=>id in projects).map(id=>({id,project_id:projects[id]}))}}
      if(table==='z19p_print_job_items'){if(failItems)return {error:{message:'Falha simulada ao inserir itens'}};rows.push(...payload);return {data:null}}
      if(action==='insert'){jobs.set(payload.id,payload);return {data:{id:payload.id}}}
      if(action==='update'){const job=jobs.get(filters.id);Object.assign(job,payload);return {data:{id:filters.id}}}
      if(action==='delete'){if(failCleanup)return {error:{message:'Sem conexão na compensação'}};jobs.delete(filters.id);for(let i=rows.length-1;i>=0;i--)if(rows[i].job_id===filters.id)rows.splice(i,1);return {data:null}}
      throw new Error('Consulta inesperada');
    })();return promise.then(resolve,reject)}};return query}};
  const ctx={toast:(message,kind)=>messages.push({message,kind}),logEvent:async()=>{}},app={querySelector:selector=>elements[selector]||null};
  const factory=new Function('supabase','app','ctx','initialItems','initialLayout','console','rotatedBoundsMm',`let filmItems=initialItems,lastFilm=initialLayout,filmSettings={}; const owner=()=> 'owner',uid=()=> 'user',h=String,renderFilm=async()=>{},prepareLetteringLayout=async()=>({widthCm:20,heightCm:30}); ${code};return {saveFilmJob,openFilmJob,checkedFilmSnapshot,reviewLegacyFilmLettering,current:()=>({items:filmItems,layout:lastFilm,settings:filmSettings})};`);
  const api=factory(supabase,app,ctx,copy(items),layoutFor(items),{error(){},warn(){}},rotatedBoundsMm);
  return {api,jobs,rows,calls,messages,elements,media:[{id:'media-28',usable_width_cm:28}]};
}

const happy=harness();const saved=await happy.api.saveFilmJob(happy.media);
assert.equal(saved.project_id,'project-1');assert.equal(happy.jobs.size,1);assert.equal(happy.rows.length,1);
const savedJob=happy.jobs.get(saved.id);assert.equal(savedJob.status,'calculated');assert.equal(savedJob.settings_snapshot.commit_state,'complete');assert.equal(savedJob.settings_snapshot.filmItems[0].path,'a1/processed.png');assert.equal(happy.rows[0].position_x_mm,0);
assert.deepEqual(happy.calls.filter(call=>call.table==='z19p_print_jobs').map(call=>call.action),['insert','update']);
assert.equal(await happy.api.openFilmJob(savedJob,happy.media),true);assert.equal(happy.api.current().settings.mediaId,'media-28');
savedJob.settings_snapshot.filmItems[0].widthCm=999;assert.equal(happy.api.current().items[0].widthCm,10,'abrir deve criar cópia de trabalho, não modificar o snapshot persistido');

const mixed=harness({items:[item('a1'),item('a2')],projects:{a1:'project-1',a2:'project-2'}});
const mixedSaved=await mixed.api.saveFilmJob(mixed.media);assert.equal(mixedSaved.project_id,null,'filme misto não pertence arbitrariamente a um dos projetos');

const failed=harness({failItems:true});assert.equal(await failed.api.saveFilmJob(failed.media),null);assert.equal(failed.jobs.size,0,'falha dos itens remove somente o novo job');assert.equal(failed.rows.length,0);assert.equal(failed.api.current().items.length,1,'montagem local permanece após falha');
const offline=harness({failItems:true,failCleanup:true});await offline.api.saveFilmJob(offline.media);assert.equal(offline.jobs.size,1);const incomplete=[...offline.jobs.values()][0];assert.equal(incomplete.status,'draft');assert.throws(()=>offline.api.checkedFilmSnapshot(incomplete.settings_snapshot),/incompleto/);

let release;const gate=new Promise(resolve=>{release=resolve}),double=harness({gate});const pending=double.api.saveFilmJob(double.media);assert.equal(await double.api.saveFilmJob(double.media),null);release();await pending;assert.equal(double.jobs.size,1,'duplo clique não duplica job');
const stale=harness();stale.elements['#filmGap'].value='9';await stale.api.saveFilmJob(stale.media);assert.equal(stale.jobs.size,0,'configuração alterada exige recalcular');
const missing=harness({projects:{}});await missing.api.saveFilmJob(missing.media);assert.equal(missing.jobs.size,0,'arte removida não cria job parcial');

let cancel,html='';const originalDocument=globalThis.document;
globalThis.document={body:{appendChild(){}},createElement:()=>({set innerHTML(value){html=value},querySelectorAll:()=>[{set onclick(callback){cancel=callback}}],querySelector:()=>({}),remove(){}})};
try{const review=happy.api.reviewLegacyFilmLettering([{...item(),type:'team_customization',name:'CLOVIS',number:'10'}]);assert.ok(html.includes('não registrou todos os espaçamentos'));cancel();assert.equal(await review,null,'legado exige revisão explícita, sem aceitação automática')}finally{globalThis.document=originalDocument}
const legacyChecked=happy.api.checkedFilmSnapshot({filmItems:[item()],lastFilm:layoutFor([item()])});assert.equal(legacyChecked.layout.placements[0].sourceWidthMm,100);assert.equal(legacyChecked.layout.placements[0].sourceHeightMm,50);assert.equal(legacyChecked.layout.freeRotation,false);
const angularItem={...item(),rotationPolicy:'90'},bounds=rotatedBoundsMm(100,50,37.25),angularLayout={...layoutFor([angularItem]),lengthMm:bounds.heightMm,freeRotation:true,angleStep:30,placements:[{...layoutFor([angularItem]).placements[0],...bounds,rotation:37.25}]};
const angularChecked=happy.api.checkedFilmSnapshot({filmItems:[angularItem],lastFilm:angularLayout});assert.equal(angularChecked.layout.placements[0].rotation,37.25);assert.equal(angularChecked.layout.placements[0].sourceWidthMm,100);assert.equal(angularChecked.layout.placements[0].sourceHeightMm,50);
for(const mutate of [layout=>layout.freeRotation=false,layout=>layout.angleStep=5,layout=>layout.placements[0].sourceWidthMm=101,layout=>layout.placements[0].widthMm=100,layout=>layout.placements[0].rotation=NaN]){const candidate=copy(angularLayout);mutate(candidate);assert.throws(()=>happy.api.checkedFilmSnapshot({filmItems:[angularItem],lastFilm:candidate}));}
assert.throws(()=>happy.api.checkedFilmSnapshot({filmItems:[{...angularItem,rotationPolicy:'none'}],lastFilm:angularLayout}),/ângulo/);
console.log('print job persistence: legacy and arbitrary-angle snapshots, physical dimensions, policy validation, plus 9 persistence scenarios ok');
