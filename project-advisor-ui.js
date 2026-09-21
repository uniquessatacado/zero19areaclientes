import {evaluateProjectAdvice,renderProjectAdvice} from './project-advisor.js?v=2.17.3';
import {buildQueueSnapshot} from './queue-core.js?v=2.17.3';

const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const datasets={
  workspaces:['z19p_workspaces','owner_id','id','Empresas'],projects:['z19p_projects','owner_id','id','Projetos'],statuses:['z19p_statuses','owner_id','id','Status'],
  quotes:['z19p_quotes','owner_id','id','Orçamentos'],quoteItems:['z19p_quote_items','owner_id','id','Itens dos orçamentos'],assets:['z19p_assets','owner_id','id','Artes'],
  printProfiles:['z19p_asset_print_profiles','owner_id','asset_id','Medidas e liberação'],folders:['z19p_folders','owner_id','id','Pastas'],documents:['z19p_quote_documents','owner_id','id','PDFs'],teamProfiles:['z19p_profiles','account_owner_id','id','Equipe']
};
const time=value=>Date.parse(value||'')||0;
const adviceIndexes=new WeakMap();
const grouped=(rows,key)=>{const map=new Map();for(const row of rows||[]){const list=map.get(row[key])||[];list.push(row);map.set(row[key],list)}return map};
function indexBundle(bundle){
  if(adviceIndexes.has(bundle))return adviceIndexes.get(bundle);
  const index={projects:grouped(bundle.projects,'workspace_id'),quotes:grouped(bundle.quotes,'project_id'),legacyQuotes:grouped((bundle.quotes||[]).filter(row=>!row.project_id),'workspace_id'),assets:grouped(bundle.assets,'project_id'),folders:grouped(bundle.folders,'project_id'),quoteItems:grouped(bundle.quoteItems,'quote_id'),documents:grouped(bundle.documents,'quote_id'),printProfiles:grouped(bundle.printProfiles,'asset_id'),statuses:new Map((bundle.statuses||[]).map(row=>[row.id,row])),teamProfiles:new Map((bundle.teamProfiles||[]).map(row=>[row.id,row])),queueRows:grouped(bundle.queueSnapshot?.rows?.map(row=>({...row,workspace_id:row.workspace?.id})),'workspace_id')};adviceIndexes.set(bundle,index);return index;
}
export function latestAdvisorProject(projects,workspaceId){return (projects||[]).filter(project=>project.workspace_id===workspaceId).slice().sort((a,b)=>(Number(b.sequence_no)||0)-(Number(a.sequence_no)||0)||time(b.started_at||b.created_at)-time(a.started_at||a.created_at)||String(b.id).localeCompare(String(a.id)))[0]||null;}
export async function fetchProjectAdvisorBundle(supabase,ownerId,{pageSize=500,now=()=>new Date().toISOString()}={}){
  if(!ownerId)throw new Error('Entre na sua conta para consultar o orientador.');
  const bundle={ownerId,known:{},errors:{},readAt:{},loadedAt:null};
  await Promise.all(Object.entries(datasets).map(async([name,[table,ownerColumn,orderColumn]])=>{
    const rows=[];try{for(let from=0;;from+=pageSize){const result=await supabase.from(table).select('*').eq(ownerColumn,ownerId).order(orderColumn).range(from,from+pageSize-1);if(result.error)throw result.error;if(!Array.isArray(result.data))throw new Error('Resposta de consulta incompleta.');if(result.data.some(row=>row[ownerColumn]!==ownerId))throw new Error('A consulta retornou registros fora da conta atual.');rows.push(...result.data);if(result.data.length<pageSize)break;}bundle[name]=rows;bundle.known[name]=true;}
    catch(error){bundle[name]=[];bundle.known[name]=false;bundle.errors[name]=error?.message||String(error)}bundle.readAt[name]=now();
  }));
  bundle.loadedAt=now();bundle.queueSnapshot=['projects','workspaces','statuses','quotes'].every(name=>bundle.known[name])?buildQueueSnapshot(bundle):{rows:[],error:'Leitura incompleta das filas.'};return bundle;
}
export function adviceForWorkspace(bundle,workspace,project){
  const index=indexBundle(bundle),projects=index.projects.get(workspace.id)||[],selected=project===undefined?latestAdvisorProject(projects,workspace.id):project,quotes=selected?index.quotes.get(selected.id)||[]:[],assets=selected?index.assets.get(selected.id)||[]:[],responsible=workspace.responsible_user_id||selected?.responsible_user_id;
  const companyAssets=(bundle.assets||[]).filter(asset=>asset.workspace_id===workspace.id);
  const advice=evaluateProjectAdvice({workspace,project:selected,projects,quotes:[...quotes,...index.legacyQuotes.get(workspace.id)||[]],assets:companyAssets,folders:selected?index.folders.get(selected.id)||[]:[],quoteItems:quotes.flatMap(row=>index.quoteItems.get(row.id)||[]),documents:quotes.flatMap(row=>index.documents.get(row.id)||[]),printProfiles:companyAssets.flatMap(row=>index.printProfiles.get(row.id)||[]),statuses:[...new Set([selected?.status_id,workspace.status_id])].map(id=>index.statuses.get(id)).filter(Boolean),teamProfiles:responsible&&index.teamProfiles.has(responsible)?[index.teamProfiles.get(responsible)]:[],known:bundle.known,queueSnapshot:bundle.queueSnapshot?.error?bundle.queueSnapshot:{rows:index.queueRows.get(workspace.id)||[]}});
  for(const name of ['workspaces','projects'])if(bundle.known[name]===false&&!advice.incomplete.includes(name))advice.incomplete.push(name);
  if(advice.incomplete.length)advice.confidence='partial';return advice;
}

export function createProjectAdvisorUI(ctx){
  let cached=null,inflight=null,inflightIdentity=null,request=0,dashboardVersion=0,workspaceVersion=0;const advices=new Map();
  const app=ctx.app,state=()=>ctx.state(),owner=()=>ctx.accountOwnerId(),route=()=>ctx.route(),toast=(message,type='err')=>ctx.toast?.(message,type);
  const workspacePath=id=>`/ambiente/${encodeURIComponent(id)}`;
  const activeProject=(snapshot=state())=>latestAdvisorProject(snapshot.currentProjects,snapshot.currentWorkspace?.id);
  const isClient=workspace=>workspace&&(!workspace.workspace_type||workspace.workspace_type==='client');
  const dateLabel=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'não confirmado'};
  async function load(force=false){
    const account=owner(),viewer=state().session?.user?.id,identity=`${account}|${viewer}`;if(!account||!viewer)throw new Error('Entre na conta para consultar o orientador.');
    if(cached?.ownerId!==account||cached?.viewerId!==viewer){cached=null;advices.clear()}
    if(inflight&&inflightIdentity===identity)return inflight;
    if(!force&&cached&&Date.now()-Date.parse(cached.loadedAt)<45000)return cached;
    const token=++request;inflightIdentity=identity;const promise=fetchProjectAdvisorBundle(ctx.supabase,account);inflight=promise;
    try{const data=await promise;if(owner()!==account||state().session?.user?.id!==viewer||token!==request)throw new Error('A conta mudou durante a consulta. Reabra o orientador.');cached={...data,viewerId:viewer};return cached}finally{if(inflight===promise){inflight=null;inflightIdentity=null}}
  }
  function decorateCards(){
    if(!cached||cached.ownerId!==owner()||cached.viewerId!==state().session?.user?.id)return;
    const visible=state().workspaces||[],byId=new Map(cached.workspaces.map(workspace=>[workspace.id,workspace]));
    for(const card of app.querySelectorAll('.workspace-card')){
      const id=card.dataset.workspace||card.querySelector('.open-workspace[data-id]')?.dataset.id,workspace=byId.get(id)||visible.find(item=>item.id===id);
      card.querySelectorAll('[data-project-advisor-badge]').forEach(node=>node.remove());if(!id||!isClient(workspace))continue;
      const advice=adviceForWorkspace(cached,workspace);advices.set(id,advice);if(!advice.applicable||advice.closed)continue;
      const button=document.createElement('button');button.type='button';button.className='project-advisor-card-button';button.dataset.projectAdvisorBadge=id;button.innerHTML=renderProjectAdvice(advice,{compact:true});button.title=`Abrir projeto · consulta ${dateLabel(cached.loadedAt)}`;button.setAttribute('aria-label',`${workspace.company_name||'Empresa'}: ${advice.summary}. Abrir projeto.`);button.onclick=event=>{event.stopPropagation();if(owner()!==cached?.ownerId)return toast('A conta mudou. Atualize a página.');ctx.nav(workspacePath(id))};
      const actions=card.querySelector('.card-actions');actions?actions.before(button):card.append(button);
    }
  }
  async function refreshDashboard({force=true}={}){
    const token=++dashboardVersion,startRoute=route(),account=owner();try{await load(force);if(token!==dashboardVersion||route()!==startRoute||account!==owner())return;decorateCards()}catch(error){if(token===dashboardVersion&&route()===startRoute)console.warn('Orientador:',error.message)}
  }
  function guard(expected){
    const snapshot=state(),project=activeProject(snapshot);
    if(owner()!==expected.ownerId||snapshot.session?.user?.id!==expected.viewerId||route()!==expected.route||snapshot.currentWorkspace?.id!==expected.workspaceId||(project?.id||null)!==expected.projectId||snapshot.currentWorkspace?.owner_id&&snapshot.currentWorkspace.owner_id!==expected.ownerId||project?.owner_id&&project.owner_id!==expected.ownerId)throw new Error('O ambiente ou o projeto ativo mudou. Reabra o orientador antes de continuar.');
    return {snapshot,project,workspace:snapshot.currentWorkspace};
  }
  const byData=(selector,id)=>[...app.querySelectorAll(selector)].find(node=>node.dataset.id===id);
  const showElement=element=>{if(!element)throw new Error('Este controle ainda não está disponível. Reabra o ambiente para atualizar.');element.scrollIntoView({behavior:'smooth',block:'center'});if(element.disabled||!element.matches('button,input,select,a,[tabindex]'))element.setAttribute('tabindex','-1');element.focus?.({preventScroll:true});return element};
  const invoke=async element=>{if(!element||element.disabled)throw new Error('Esta ação não está disponível neste projeto. Confira o cadastro antes de continuar.');if(typeof element.onclick==='function')return await element.onclick.call(element,new MouseEvent('click',{bubbles:true}));element.click()};
  async function perform(action,expected){
    let {snapshot,project,workspace}=guard(expected);
    if(action.workspaceId!==expected.workspaceId||(action.projectId||null)!==expected.projectId)throw new Error('A sugestão não pertence ao projeto ativo. Atualize a leitura.');
    const currentQuote=id=>(snapshot.currentQuotes||[]).find(quote=>quote.id===id&&quote.project_id===expected.projectId&&quote.workspace_id===expected.workspaceId);
    switch(action.type){
      case 'new_quote':if(action.quoteId){if(!currentQuote(action.quoteId))throw new Error('O orçamento não está no projeto ativo.');await invoke(byData('.edit-quote[data-id]',action.quoteId))}else{if(!ctx.openQuote)throw new Error('Cadastro de orçamento não disponível.');await ctx.openQuote()}break;
      case 'new_project':await invoke(app.querySelector('#startNewProjectV217'));break;
      case 'upload_art':await invoke(app.querySelector('#uploadBtn'));break;
      case 'edit_workspace':if(!ctx.editWorkspace)throw new Error('Cadastro da empresa não disponível.');await ctx.editWorkspace(workspace);break;
      case 'edit_print_profile':{const asset=(snapshot.currentAssets||[]).find(asset=>asset.id===action.assetId&&asset.project_id===expected.projectId&&asset.workspace_id===expected.workspaceId);if(!asset||!ctx.openPrintProfile)throw new Error('A arte não está carregada no projeto ativo. Reabra o ambiente.');await ctx.openPrintProfile(asset);break}
      case 'review_status':showElement(app.querySelector('#workspaceStatus'));break;
      case 'view_history':showElement(app.querySelector('.project-history'));break;
      case 'review_payment':{const quoteId=action.quoteId||snapshot.currentQuotes?.find(quote=>quote.project_id===expected.projectId)?.id;if(action.quoteId&&!currentQuote(action.quoteId))throw new Error('O orçamento não está no projeto ativo.');showElement(quoteId?byData('.edit-quote[data-id]',quoteId)?.closest('.quote-summary'):app.querySelector('.quotes-admin'));toast('Confira o recebimento no orçamento. Nenhum pagamento foi alterado.','ok');break}
      case 'open_quote_pdf':if(!currentQuote(action.quoteId))throw new Error('O orçamento não está no projeto ativo.');await invoke(byData('.pdf-quote[data-id]',action.quoteId));break;
      case 'open_film':ctx.nav('/filme');break;
      case 'open_queue':if(!['art_work','ready_production','production'].includes(action.stage))throw new Error('Etapa de fila não reconhecida.');ctx.nav(`/fila/${action.stage}`);break;
      case 'open_workspace':ctx.nav(workspacePath(expected.workspaceId));break;
      case 'set_delivery':{
        if(!project||!ctx.askDeliveryDate)throw new Error('Projeto ou calendário indisponível.');const date=await ctx.askDeliveryDate(project.delivery_date||'');if(!date)return;guard(expected);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(`${date}T12:00:00Z`))||new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)!==date)throw new Error('Escolha uma data de entrega válida.');
        const latest=await ctx.supabase.from('z19p_projects').select('id,owner_id,workspace_id,delivery_date,updated_at,finalized_at,desisted_at').eq('owner_id',expected.ownerId).eq('workspace_id',expected.workspaceId).order('sequence_no',{ascending:false}).order('started_at',{ascending:false}).limit(1).maybeSingle();if(latest.error)throw latest.error;guard(expected);
        if(latest.data?.id!==expected.projectId||latest.data.finalized_at||latest.data.desisted_at)throw new Error('O projeto ativo mudou ou foi encerrado. Reabra o ambiente antes de definir a entrega.');
        const payload={delivery_date:date,updated_at:new Date().toISOString(),updated_by:state().session?.user?.id};let query=ctx.supabase.from('z19p_projects').update(payload).eq('owner_id',expected.ownerId).eq('workspace_id',expected.workspaceId).eq('id',expected.projectId).is('finalized_at',null).is('desisted_at',null);if(latest.data.updated_at)query=query.eq('updated_at',latest.data.updated_at);
        const result=await query.select('id,delivery_date,updated_at').maybeSingle();if(result.error)throw result.error;if(!result.data)throw new Error('O projeto mudou durante o salvamento ou não há permissão para alterá-lo. Atualize e tente novamente.');
        if(owner()===expected.ownerId){cached=null;const local=(state().currentProjects||[]).find(row=>row.id===expected.projectId&&row.workspace_id===expected.workspaceId);if(local)Object.assign(local,result.data)}
        toast('Entrega do projeto salva. Confira prazos nos orçamentos/PDFs.','ok');try{guard(expected);await enhanceWorkspace({force:true})}catch{}break;
      }
      default:throw new Error('Esta sugestão ainda não tem uma ação disponível. Abra o projeto para conferir.');
    }
  }
  function ensurePanel(){let panel=app.querySelector('[data-project-advisor-panel]');if(!panel){const banner=app.querySelector('.workspace-banner');if(!banner)return null;panel=document.createElement('section');panel.dataset.projectAdvisorPanel='';panel.className='project-advisor-panel';panel.setAttribute('aria-label','Próximo passo do projeto');banner.after(panel)}return panel;}
  async function enhanceWorkspace({force=true}={}){
    const snapshot=state(),workspace=snapshot.currentWorkspace;if(!isClient(workspace)||route()!==workspacePath(workspace.id))return;
    const project=activeProject(snapshot),expected={ownerId:owner(),viewerId:snapshot.session?.user?.id,route:route(),workspaceId:workspace.id,projectId:project?.id||null},token=++workspaceVersion,panel=ensurePanel();if(!panel)return;
    panel.setAttribute('aria-busy','true');if(!panel.innerHTML)panel.innerHTML='<p class="project-advisor-loading">Conferindo dados do projeto…</p>';
    try{
      const bundle=await load(force);guard(expected);if(token!==workspaceVersion||!panel.isConnected)return;
      const freshWorkspace=bundle.workspaces.find(row=>row.id===workspace.id)||workspace,freshProject=latestAdvisorProject(bundle.projects,workspace.id),staleProject=bundle.known.projects&&(freshProject?.id||null)!==expected.projectId,advice=adviceForWorkspace(bundle,freshWorkspace,bundle.known.projects?freshProject:project),next=advice.nextAction;
      if(!advice.applicable){panel.remove();return}advices.set(workspace.id,advice);
      const expanded=panel.querySelector('[data-advisor-details]')?.open;
      panel.innerHTML=`<div class="project-advisor-top"><div><span class="eyebrow">Orientador do projeto · regras locais</span><h2>${escape(staleProject?'O projeto ativo mudou em outra tela':advice.summary)}</h2><p>${staleProject?'Reabra o ambiente para trabalhar no projeto mais recente.':advice.confidence==='partial'?'Consulta parcial: confira os dados antes de decidir. Nenhuma etapa é alterada automaticamente.':'Sugestões baseadas nos registros deste projeto. Nenhuma etapa é alterada automaticamente.'}</p></div><div class="project-advisor-actions"><button class="btn primary small" data-advisor-next>${escape(staleProject?'Reabrir ambiente':next?.label||'Abrir projeto')}</button><button class="btn small" data-advisor-refresh>Atualizar leitura</button></div></div><div class="project-advisor-read-time">Consultado ${escape(dateLabel(bundle.loadedAt))}${advice.queuePosition?` · posição #${advice.queuePosition} na fila`:''} · ${advice.counts.arts} arte(s) / ${advice.counts.readyArts} liberada(s)</div><p class="project-advisor-action-error" role="alert"></p><details data-advisor-details ${expanded?'open':''}><summary>${advice.issues.length?`${advice.issues.length} orientação(ões)`:advice.confidence==='partial'?'Ver limites desta leitura':'Ver verificações'} e evidências</summary>${renderProjectAdvice(advice)}<div class="project-advisor-sources"><b>Fontes consultadas</b>${Object.entries(datasets).map(([name,[,,,label]])=>`<div><span>${escape(label)}</span><small>${bundle.known[name]?`${bundle[name].length} registro(s) · ${escape(dateLabel(bundle.readAt[name]))}`:`Não confirmado: ${escape(bundle.errors[name]||'consulta indisponível')}`}</small></div>`).join('')}</div></details>`;
      panel.querySelector('[data-advisor-refresh]').onclick=()=>enhanceWorkspace({force:true});
      const act=async action=>{const buttons=[...panel.querySelectorAll('button')].filter(button=>!button.disabled);buttons.forEach(button=>button.disabled=true);const errorNode=panel.querySelector('.project-advisor-action-error');errorNode.textContent='';try{if(staleProject){guard(expected);ctx.nav(workspacePath(expected.workspaceId));return}await perform(action,expected)}catch(error){if(panel.isConnected)errorNode.textContent=error?.message||String(error);toast(error?.message||String(error))}finally{buttons.forEach(button=>{if(button.isConnected)button.disabled=false})}};
      panel.querySelector('[data-advisor-next]').onclick=()=>act(next);panel.querySelectorAll('[data-advisor-code]').forEach(button=>{const action=button.dataset.advisorCode==='next'?next:advice.issues.find(issue=>issue.code===button.dataset.advisorCode)?.recommendedAction;button.onclick=()=>act(action)});
    }catch(error){if(token===workspaceVersion&&panel.isConnected&&route()===expected.route){panel.innerHTML=`<div class="project-advisor-top"><div><span class="eyebrow">Orientador do projeto</span><h2>Não foi possível concluir a leitura</h2><p>${escape(error.message)} Nenhuma pendência foi presumida como resolvida.</p></div><button class="btn small" data-advisor-retry>Tentar novamente</button></div>`;panel.querySelector('[data-advisor-retry]').onclick=()=>enhanceWorkspace({force:true})}}
    finally{if(panel.isConnected)panel.removeAttribute('aria-busy')}
  }
  return {refreshDashboard,decorateCards,enhanceWorkspace,invalidate(){cached=null;advices.clear()},getAdvice:workspaceId=>advices.get(workspaceId)||null};
}
