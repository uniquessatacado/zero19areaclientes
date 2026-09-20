import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {getEventListeners} from 'node:events';
import {rotatedBoundsMm} from '../nesting-core.js';

const source=await fs.readFile(new URL('../production-v217.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('  let filmJobSaving='),source.lastIndexOf('  return {buildQuotePdf'));
assert.ok(code.includes('async function saveFilmJob'));
const copy=value=>JSON.parse(JSON.stringify(value));
const item=(id='a1')=>({localId:'local-'+id,type:'asset',sourceId:id,label:'Arte '+id,quantity:1,widthCm:10,heightCm:5,path:id+'/processed.png'});
const layoutFor=items=>({filmWidthMm:280,lengthMm:50,mode:'normal',gapMm:3,efficiency:60,waste:40,placements:items.map((art,index)=>({id:art.localId,copy:0,xMm:index*104,yMm:0,widthMm:100,heightMm:50,rotation:0,locked:false}))});

function harness({items=[item()],projects={a1:'project-1'},failItems=false,failCleanup=false,gate=null}={}){
  const jobs=new Map(),rows=[],calls=[],messages=[],elements={'#saveFilm':{disabled:false,textContent:'Salvar job',isConnected:true},'#filmMedia':{value:'media-28'},'#filmMode':{value:'normal'},'#filmGap':{value:'3'}};
  const runtime={account:'owner',renders:0,preparations:0,onRender:null,prepareGate:null},location={hash:'#/film'},modals=[],window=new EventTarget();
  // Exercise the actual modal callbacks and their await, not a stubbed review result.
  const document={body:{appendChild(modal){modals.push(modal)}},createElement(tag){
    assert.equal(tag,'div');const fields=new Map(),cancelButtons=[{},{}],submitButton={disabled:false},form={querySelector:selector=>{assert.equal(selector,'[type="submit"]');return submitButton}};
    return {html:'',removed:false,set innerHTML(value){this.html=value;for(const match of value.matchAll(/name="([^"]+)" value="([^"]*)"/g))fields.set(match[1],{value:match[2]})},
      querySelectorAll:selector=>{assert.equal(selector,'[data-cancel]');return cancelButtons},
      querySelector(selector){if(selector==='form')return form;const name=/^\[name="([^"]+)"\]$/.exec(selector)?.[1];assert.ok(fields.has(name),'campo de revisão conhecido: '+selector);return fields.get(name)},
      remove(){this.removed=true},submit:()=>form.onsubmit({preventDefault(){},currentTarget:form}),cancel:()=>cancelButtons[0].onclick()};
  }};
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
  const factory=new Function('supabase','app','ctx','initialItems','initialLayout','console','rotatedBoundsMm','runtime','location','document','window',`let filmItems=initialItems,lastFilm=initialLayout,filmSettings={},productionAccountGeneration=0,filmDraftChange=0; const owner=()=>runtime.account,uid=()=> 'user',h=String,renderFilm=async()=>{runtime.renders++;return runtime.onRender?await runtime.onRender():true},prepareLetteringLayout=async()=>{runtime.preparations++;if(runtime.prepareGate)await runtime.prepareGate;return {widthCm:20,heightCm:30}}; ${code};return {saveFilmJob,openFilmJob,checkedFilmSnapshot,reviewLegacyFilmLettering,bumpAccountGeneration:()=>productionAccountGeneration++,bumpDraftChange:()=>filmDraftChange++,replaceDraft:(items,layout,settings={})=>{filmItems=items;lastFilm=layout;filmSettings=settings;filmDraftChange++},current:()=>({items:filmItems,layout:lastFilm,settings:filmSettings})};`);
  const api=factory(supabase,app,ctx,copy(items),layoutFor(items),{error(){},warn(){}},rotatedBoundsMm,runtime,location,document,window);
  return {api,jobs,rows,calls,messages,elements,runtime,location,modals,window,media:[{id:'media-28',usable_width_cm:28}]};
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

const legacyItem={...item('legacy'),type:'team_customization',name:'CLOVIS',number:'10'};
const assertReviewListeners=(fixture,count)=>{for(const event of ['z19:account-changing','hashchange'])assert.equal(getEventListeners(fixture.window,event).length,count,event+': listeners da revisão')};
const review=happy.api.reviewLegacyFilmLettering([legacyItem]),cancelModal=happy.modals.at(-1);
assertReviewListeners(happy,1);assert.ok(cancelModal.html.includes('não registrou todos os espaçamentos'));cancelModal.cancel();assert.equal(await review,null,'legado exige revisão explícita, sem aceitação automática');assert.equal(cancelModal.removed,true);assertReviewListeners(happy,0);
const legacyJob=()=>({media_profile_id:'media-28',settings_snapshot:{commit_state:'complete',filmItems:[copy(legacyItem)],lastFilm:layoutFor([legacyItem])}});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}};
const reviewRaces=[
  ['geração da conta',fixture=>fixture.api.bumpAccountGeneration()],
  ['proprietário da conta',fixture=>{fixture.runtime.account='another-owner'}],
  ['rota',fixture=>{fixture.location.hash='#/dashboard'}],
  ['edição do filme',fixture=>{const replacement=[item('edited')];fixture.api.replaceDraft(replacement,layoutFor(replacement),{gapMm:9})}]
];
for(const phase of ['modal aberto','preparação pendente'])for(const [name,mutate] of reviewRaces){
  const fixture=harness(),job=legacyJob(),originalSnapshot=copy(job),opening=fixture.api.openFilmJob(job,fixture.media),modal=fixture.modals.at(-1);
  assert.ok(modal&&!modal.removed,phase+': revisão realmente aberta');assert.equal(fixture.runtime.renders,0);
  assert.equal(await fixture.api.openFilmJob(job,fixture.media),false,'reabertura simultânea bloqueada');assert.equal(await fixture.api.saveFilmJob(fixture.media),null,'salvamento bloqueado durante reabertura');
  let submitting,preparation;
  if(phase==='preparação pendente'){preparation=deferred();fixture.runtime.prepareGate=preparation.promise;submitting=modal.submit();assert.equal(fixture.runtime.preparations,1);assert.equal(modal.removed,false)}
  mutate(fixture);const expected=copy(fixture.api.current());
  if(preparation)preparation.resolve();else submitting=modal.submit();
  await submitting;assert.equal(await opening,false,name+' durante '+phase+' cancela adoção antiga');
  assert.deepEqual(fixture.api.current(),expected,name+': não sobrescreve o filme atual');assert.deepEqual(job,originalSnapshot,'snapshot persistido não é modificado pela revisão');
  assert.equal(fixture.runtime.renders,0,'cancelamento antes da adoção não renderiza o editor');assert.deepEqual(fixture.calls,[],'não grava nem consulta dados');assert.deepEqual(fixture.messages,[],'não anuncia reabertura cancelada');assert.equal(modal.removed,true);assertReviewListeners(fixture,0);
  const nextJob={media_profile_id:'media-28',settings_snapshot:{filmItems:[item()],lastFilm:layoutFor([item()])}};
  assert.equal(await fixture.api.openFilmJob(nextJob,fixture.media),true,'guarda liberada após cancelamento, sem travar próximas aberturas');
}
for(const event of ['z19:account-changing','hashchange'])for(const phase of ['modal aberto','preparação pendente']){
  const fixture=harness(),job=legacyJob(),originalSnapshot=copy(job),originalDraft=copy(fixture.api.current()),opening=fixture.api.openFilmJob(job,fixture.media),modal=fixture.modals.at(-1);
  assertReviewListeners(fixture,1);let submitting,preparation;
  if(phase==='preparação pendente'){preparation=deferred();fixture.runtime.prepareGate=preparation.promise;submitting=modal.submit();assert.equal(fixture.runtime.preparations,1)}
  // Account-changing is intentionally dispatched before owner changes, as in logout.
  if(event==='hashchange')fixture.location.hash='#/dashboard';fixture.window.dispatchEvent(new Event(event));
  assert.equal(modal.removed,true,event+': fecha o modal sem confirmação adicional');assertReviewListeners(fixture,0);
  assert.equal(await opening,false,event+': cancela antes de terminar qualquer preparação');assert.deepEqual(fixture.api.current(),originalDraft);assert.equal(fixture.runtime.renders,0);assert.deepEqual(fixture.messages,[]);assert.deepEqual(fixture.calls,[]);
  const nextJob={media_profile_id:'media-28',settings_snapshot:{filmItems:[item('new-open')],lastFilm:layoutFor([item('new-open')])}};
  assert.equal(await fixture.api.openFilmJob(nextJob,fixture.media),true,'cancelamento libera abertura seguinte imediatamente');const nextDraft=copy(fixture.api.current()),nextMessages=copy(fixture.messages);
  if(preparation){preparation.resolve();await submitting}else{await modal.submit();assert.equal(fixture.runtime.preparations,0,'callback antigo de modal fechado não inicia preparação')}
  assert.deepEqual(fixture.api.current(),nextDraft,'preparação antiga não sobrescreve job aberto depois');assert.deepEqual(fixture.messages,nextMessages,'conclusão antiga não emite toast');assert.deepEqual(job,originalSnapshot);assertReviewListeners(fixture,0);
}
const accepted=harness(),acceptedJob=legacyJob(),acceptedSnapshot=copy(acceptedJob),acceptedOpening=accepted.api.openFilmJob(acceptedJob,accepted.media);
await accepted.modals.at(-1).submit();assert.equal(await acceptedOpening,true,'revisão válida ainda abre o job');
assert.equal(accepted.api.current().items[0].legacySpacingReviewed,true);assert.equal(accepted.api.current().items[0].widthCm,20);assert.equal(accepted.api.current().items[0].heightCm,30);assert.equal(accepted.api.current().layout,null,'revisão exige novo encaixe');assert.deepEqual(acceptedJob,acceptedSnapshot);assert.equal(accepted.runtime.renders,1);assertReviewListeners(accepted,0);
for(const [name,mutate] of reviewRaces.slice(0,3)){
  const fixture=harness(),rendering=deferred(),entered=deferred();fixture.runtime.onRender=()=>{entered.resolve();return rendering.promise};
  const opening=fixture.api.openFilmJob({media_profile_id:'media-28',settings_snapshot:{filmItems:[item()],lastFilm:layoutFor([item()])}},fixture.media);await entered.promise;
  mutate(fixture);fixture.elements['#filmGap'].value='9';rendering.resolve(true);
  assert.equal(await opening,false,name+' durante renderização não finaliza a abertura');assert.equal(fixture.elements['#filmGap'].value,'9','não atualiza controles de outra tela/conta');assert.deepEqual(fixture.messages,[]);
}
const autosave=harness();autosave.runtime.onRender=()=>{autosave.api.bumpDraftChange();return true};
assert.equal(await autosave.api.openFilmJob({media_profile_id:'media-28',settings_snapshot:{filmItems:[item()],lastFilm:layoutFor([item()])}},autosave.media),true,'autosave do próprio render não cancela abertura válida');
const obsoleteRender=harness();obsoleteRender.elements['#filmGap'].value='9';obsoleteRender.runtime.onRender=()=>false;
assert.equal(await obsoleteRender.api.openFilmJob({media_profile_id:'media-28',settings_snapshot:{filmItems:[item()],lastFilm:layoutFor([item()])}},obsoleteRender.media),false,'render obsoleto não finaliza abertura');assert.equal(obsoleteRender.elements['#filmGap'].value,'9');assert.deepEqual(obsoleteRender.messages,[]);
const legacyChecked=happy.api.checkedFilmSnapshot({filmItems:[item()],lastFilm:layoutFor([item()])});assert.equal(legacyChecked.layout.placements[0].sourceWidthMm,100);assert.equal(legacyChecked.layout.placements[0].sourceHeightMm,50);assert.equal(legacyChecked.layout.freeRotation,false);
const angularItem={...item(),rotationPolicy:'90'},bounds=rotatedBoundsMm(100,50,37.25),angularLayout={...layoutFor([angularItem]),lengthMm:bounds.heightMm,freeRotation:true,angleStep:30,placements:[{...layoutFor([angularItem]).placements[0],...bounds,rotation:37.25}]};
const angularChecked=happy.api.checkedFilmSnapshot({filmItems:[angularItem],lastFilm:angularLayout});assert.equal(angularChecked.layout.placements[0].rotation,37.25);assert.equal(angularChecked.layout.placements[0].sourceWidthMm,100);assert.equal(angularChecked.layout.placements[0].sourceHeightMm,50);
for(const mutate of [layout=>layout.freeRotation=false,layout=>layout.angleStep=5,layout=>layout.placements[0].sourceWidthMm=101,layout=>layout.placements[0].widthMm=100,layout=>layout.placements[0].rotation=NaN]){const candidate=copy(angularLayout);mutate(candidate);assert.throws(()=>happy.api.checkedFilmSnapshot({filmItems:[angularItem],lastFilm:candidate}));}
assert.throws(()=>happy.api.checkedFilmSnapshot({filmItems:[{...angularItem,rotationPolicy:'none'}],lastFilm:angularLayout}),/ângulo/);
console.log('print job persistence: 8 real legacy-modal races, 4 automatic event cancellations/listener cleanup, 3 render scope races, successful review/autosave, obsolete render, arbitrary-angle snapshots and all persistence scenarios ok');
