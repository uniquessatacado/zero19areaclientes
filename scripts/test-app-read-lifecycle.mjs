import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Execute actual local helpers against delayed query spies; no application boot,
// credentials, Storage, Auth service or database is used.
const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
function between(start,end){const i=source.indexOf(start),j=source.indexOf(end,i);assert.ok(i>=0&&j>i,start);return source.slice(i,j);}
const guard=between('function accountReadGuard(','async function loadTeamContext(');
const profile=between('async function loadTeamContext(','async function logEvent(');
const loaders=between('async function loadConfig(){','async function renderLibrary(')+
  between('async function loadQuotes(','function renderQuotesAdmin(')+
  between('async function loadProjects(){','async function getLatestProject(')+
  between('async function loadCommissionContext(){','function commissionPreviewForDraft(');
const fullWorkspace=between('renderWorkspace = async function(id){','function updateStatusAgeLabels(');
const dashboardPrefix=between('renderDashboard = async function(){','  const content=')+'};';
const legacyRoute=between('renderRoute = async function(){','ensureDefaults = async function(){');
const currentRoute=between('async function renderCurrentRoute(){','renderRoute=async function(){');
const finalRoute=source.slice(source.lastIndexOf('renderRoute=async function(){'),source.lastIndexOf('init().catch('));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
let checks=0;
async function test(name,run){await run();checks++;console.log('PASS '+name);}

function dataFixture({blockTable=null,queryResult}={}){
  const pending=deferred(),calls=[],signals=[],warnings=[];
  const ctx={session:{user:{id:'account-a'}},accountContextEpoch:0,currentRoute:'/ambiente/workspace-a',
    statuses:[],products:[],folderTemplates:[],workspaces:[],currentProjects:[],currentQuotes:[],currentAssets:[],currentFolders:[],currentWorkspace:null,
    myCommissionSummary:{enabled:false},myCommissionRules:[],commissionTiers:[],console:{warn(){},error(){}},toast:message=>warnings.push(message),publicUrl:p=>p,
    route:()=>ctx.currentRoute,app:{innerHTML:'unchanged'},loadTeamContext:async()=>true,ensureDefaults:async()=>{},Promise,AbortController,setTimeout,clearTimeout};
  const defaultResult=table=>table==='rpc'?{data:{enabled:true,pending:123}}:{data:[{id:'old-'+table,owner_id:'account-a'}],error:null};
  async function result(table,signal){
    calls.push(table);
    if(table===blockTable||blockTable==='all')await new Promise((resolve,reject)=>{
      const cancel=()=>reject(signal.reason),done=()=>{signal?.removeEventListener('abort',cancel);resolve();};
      signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();pending.promise.then(done,reject);
    });
    return (queryResult||defaultResult)(table);
  }
  function query(table){const q={};let signal;for(const method of ['select','eq','in','order','single'])q[method]=()=>q;q.abortSignal=value=>{signal=value;signals.push({table,signal});return q;};q.then=(resolve,reject)=>result(table,signal).then(resolve,reject);return q;}
  ctx.supabase={rpc:()=>query('rpc'),from:query};
  vm.createContext(ctx);vm.runInContext(guard+loaders,ctx);
  return {ctx,calls,pending,signals,warnings,changeAccount(){ctx.session={user:{id:'account-b'}};ctx.accountContextEpoch++;for(const field of ['statuses','products','folderTemplates','workspaces','currentProjects','currentQuotes','currentAssets','currentFolders','myCommissionRules','commissionTiers'])ctx[field]=[{id:'new-'+field}];ctx.myCommissionSummary={enabled:true,pending:456};ctx.currentWorkspace={id:'new-workspace'};}};
}

await test('late configuration cannot repopulate the next account',async()=>{
  const f=dataFixture({blockTable:'all'}),reading=f.ctx.loadConfig();await tick();assert.equal(f.calls.length,3);f.changeAccount();f.pending.resolve();await reading;
  for(const field of ['statuses','products','folderTemplates'])assert.equal(f.ctx[field][0].id,'new-'+field);
});
await test('late projects cannot repopulate the next account',async()=>{
  const f=dataFixture({blockTable:'all'}),reading=f.ctx.loadProjects();await tick();f.changeAccount();f.pending.resolve();await reading;assert.equal(f.ctx.currentProjects[0].id,'new-currentProjects');
});
await test('late commissions cannot disclose previous account totals or rules',async()=>{
  const f=dataFixture({blockTable:'all'}),reading=f.ctx.loadCommissionContext();await tick();assert.equal(f.calls.length,3);f.changeAccount();f.pending.resolve();await reading;
  assert.equal(f.ctx.myCommissionSummary.pending,456);assert.equal(f.ctx.myCommissionRules[0].id,'new-myCommissionRules');assert.equal(f.ctx.commissionTiers[0].id,'new-commissionTiers');
});
await test('workspace catalog stops at either stale primary or logo-folder reply',async()=>{
  for(const blockTable of ['z19p_workspaces','z19p_folders']){
    const f=dataFixture({blockTable}),reading=f.ctx.loadWorkspaces();await tick();assert.ok(f.calls.includes(blockTable));f.changeAccount();f.pending.resolve();await reading;
    assert.equal(f.ctx.workspaces[0].id,'new-workspaces');assert.ok(!f.calls.includes('z19p_assets'),'stale response must not start logo query');
  }
});
await test('quotes stop at either stale header or item response',async()=>{
  for(const blockTable of ['z19p_quotes','z19p_quote_items']){
    const f=dataFixture({blockTable}),reading=f.ctx.loadQuotes('workspace-a');await tick();f.changeAccount();f.pending.resolve();await reading;assert.equal(f.ctx.currentQuotes[0].id,'new-currentQuotes');
    if(blockTable==='z19p_quotes')assert.equal(f.calls.length,1);
  }
});
await test('workspace renderer discards a late catalog before state/DOM commit',async()=>{
  const f=dataFixture({blockTable:'all'});f.ctx.loadConfig=async()=>{};f.ctx.loadCommissionContext=async()=>{};
  vm.runInContext(fullWorkspace,f.ctx);const rendering=f.ctx.renderWorkspace('workspace-a');await tick();assert.equal(f.calls.length,4);f.changeAccount();f.pending.resolve();await rendering;
  assert.equal(f.ctx.app.innerHTML,'unchanged');assert.equal(f.ctx.currentWorkspace.id,'new-workspace');assert.equal(f.ctx.currentAssets[0].id,'new-currentAssets');
});
await test('workspace renderer also discards replies after route change',async()=>{
  const f=dataFixture({blockTable:'all'});f.ctx.loadConfig=async()=>{};f.ctx.loadCommissionContext=async()=>{};
  vm.runInContext(fullWorkspace,f.ctx);const rendering=f.ctx.renderWorkspace('workspace-a');await tick();f.ctx.currentRoute='/filme';f.pending.resolve();await rendering;
  assert.equal(f.ctx.app.innerHTML,'unchanged');assert.equal(f.ctx.currentWorkspace,null);
});

await test('partial workspace read errors never masquerade as empty catalogs',async()=>{
  for(const [failedTable,label] of [['z19p_workspaces','dados'],['z19p_folders','pastas'],['z19p_assets','artes'],['z19p_projects','projetos']]){
    const f=dataFixture({queryResult:table=>table===failedTable?{data:null,error:{message:'secret https://private.invalid'}}:table==='z19p_workspaces'?{data:{id:'workspace-a'}}:{data:[]}});
    f.ctx.loadConfig=async()=>{};f.ctx.loadCommissionContext=async()=>{};f.ctx.currentWorkspace={id:'preserved'};f.ctx.currentAssets=[{id:'preserved-art'}];
    vm.runInContext(fullWorkspace,f.ctx);
    await assert.rejects(f.ctx.renderWorkspace('workspace-a'),error=>{
      assert.match(error.message,new RegExp(label));assert.doesNotMatch(error.message,/private|secret/);return true;
    });
    assert.equal(f.ctx.currentWorkspace.id,'preserved');assert.equal(f.ctx.currentAssets[0].id,'preserved-art');assert.equal(f.ctx.app.innerHTML,'unchanged');
  }
});
await test('commission deadline aborts all three reads at 15s without RPC retries',async()=>{
  const f=dataFixture({blockTable:'rpc'}),timers=[],cleared=[];
  f.ctx.setTimeout=(callback,ms)=>{timers.push({callback,ms});return 7;};f.ctx.clearTimeout=id=>cleared.push(id);
  const reading=f.ctx.loadCommissionContext();await tick();assert.equal(f.calls.length,3);assert.equal(timers[0].ms,15000);assert.equal(f.signals.length,3);
  assert.ok(f.signals.every(entry=>entry.signal===f.signals[0].signal));timers[0].callback();await reading;
  assert.ok(f.signals.every(entry=>entry.signal.aborted));assert.equal(f.calls.filter(table=>table==='rpc').length,1);assert.deepEqual(cleared,[7]);
  assert.equal(f.ctx.myCommissionSummary.unavailable,true);assert.equal(f.ctx.myCommissionSummary.pending,null);assert.match(f.warnings[0],/15 segundos/);
  f.ctx.isAdmin=()=>false;vm.runInContext(between('function myCommissionCardHTML(){','function dashboardClientListsHTML('),f.ctx);
  assert.match(f.ctx.myCommissionCardHTML(),/não significa saldo zero/);
});
await test('commission success clears deadline and partial errors remain explicitly unavailable',async()=>{
  const success=dataFixture(),cleared=[];success.ctx.setTimeout=()=>9;success.ctx.clearTimeout=id=>cleared.push(id);await success.ctx.loadCommissionContext();
  assert.equal(success.ctx.myCommissionSummary.pending,123);assert.deepEqual(cleared,[9]);assert.ok(success.signals.every(entry=>!entry.signal.aborted));
  for(const failedTable of ['rpc','z19p_commission_rules','z19p_price_tiers']){
    const f=dataFixture({queryResult:table=>table===failedTable?{data:null,error:{message:'fixture read error'}}:table==='rpc'?{data:{enabled:true,pending:123}}:{data:[]}});
    await f.ctx.loadCommissionContext();assert.equal(f.ctx.myCommissionSummary.unavailable,true);assert.equal(f.ctx.myCommissionSummary.pending,null);assert.equal(f.warnings.length,1);
  }
});

function routeFixture(){
  const counts={profile:0,team:0,dashboard:0},session={user:{id:'user-a'}},row={id:'user-a',account_owner_id:'owner-a',active:true,role:'employee'};
  const ctx={session,accountContextEpoch:0,teamContextPending:null,routeAccessCheck:null,currentProfile:null,teamProfiles:[],dashboardAgingTimer:null,
    renderingRoute:false,routeRequested:false,currentPath:'/',location:{search:''},URLSearchParams,Promise,console:{error(){}},
    route:()=>ctx.currentPath,routeViewport:{begin:path=>({path}),complete(){}},sessionStorage:{getItem:()=>true},toast(){},
    loadConfig:async()=>{},loadWorkspaces:async()=>{},loadProjects:async()=>{},loadQualityCommentCount:async()=>{},loadCommissionContext:async()=>{},ensureDefaults:async()=>{},
    app:{innerHTML:''},shell:x=>x,bindCommon(){},escapeHTML:x=>x,$:()=>({}),clearInterval(){},renderAuth(){},renderSetPassword(){},
    renderPublic(){},renderTeamAdmin(){},renderProductivity(){},renderShareLinks(){},renderLibrary(){},renderWorkspace(){},profileRow:row};
  ctx.supabase={from(){const q={select:()=>q,eq:()=>q,maybeSingle:async()=>{counts.profile++;return{data:ctx.profileRow};},order:async()=>{counts.team++;return{data:[ctx.profileRow]};}};return q;},rpc:async()=>({}),auth:{signOut:async()=>{ctx.session=null;}}};
  vm.createContext(ctx);vm.runInContext(guard+profile+dashboardPrefix+legacyRoute+'\nconst renderRouteV216=renderRoute;\n'+currentRoute+finalRoute,ctx);
  return {ctx,counts};
}
await test('real route, legacy dispatcher and dashboard share one profile/team pair',async()=>{
  const {ctx,counts}=routeFixture();await ctx.renderRoute();assert.equal(counts.profile,1);assert.equal(counts.team,1);assert.equal(ctx.routeAccessCheck,null,'completed transition must release privilege reuse');
  await ctx.renderRoute();assert.equal(counts.profile,2,'same-route next transition revalidates');assert.equal(counts.team,2);
});
await test('direct profile reads outside a transition never use a TTL cache',async()=>{
  const {ctx,counts}=routeFixture();await ctx.renderRoute();await ctx.loadTeamContext({reuseRoute:true});await ctx.loadTeamContext({reuseRoute:true});assert.equal(counts.profile,3);assert.equal(counts.team,3);
});
await test('a new transition observes a newly inactive profile',async()=>{
  const {ctx,counts}=routeFixture();await ctx.renderRoute();ctx.profileRow={...ctx.profileRow,active:false};await ctx.renderRoute();assert.equal(counts.profile,2);assert.equal(counts.team,1);assert.equal(ctx.currentProfile,null);assert.equal(ctx.session,null);assert.equal(ctx.routeAccessCheck,null);
});

console.log(`App read lifecycle: ${checks} groups passed; real extracted functions, synthetic delayed results only.`);
