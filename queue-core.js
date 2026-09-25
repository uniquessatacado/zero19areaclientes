// One read model for the home cards and operational queues. No writes or inferred payments.
import {isCompanyPortalProject} from './service-readiness.js?v=2.17.12';
export const QUEUE_STAGES=['art_work','ready_production','production'];

const timestamp=value=>{const time=Date.parse(value||'');return Number.isFinite(time)?time:Number.MAX_SAFE_INTEGER;};
const newest=(a,b)=>timestamp(b.created_at||b.started_at)-timestamp(a.created_at||a.started_at)||String(b.id).localeCompare(String(a.id));
const latestProject=(a,b)=>(Number(b.sequence_no)||0)-(Number(a.sequence_no)||0)||newest(a,b);
const paidFirst=(a,b)=>timestamp(a.paid_at)-timestamp(b.paid_at)||newest(a,b);
const isClient=workspace=>!workspace.workspace_type||workspace.workspace_type==='client';
const dateValue=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))&&Number.isFinite(Date.parse(`${value}T12:00:00`))?String(value):null;

export function missingQueueStages(statuses=[]){
  return QUEUE_STAGES.filter(stage=>!statuses.some(status=>status.queue_stage===stage&&status.active!==false&&!status.is_finalized));
}

export function buildQueueSnapshot({projects=[],workspaces=[],statuses=[],quotes=[],releaseIssues=[]}={}){
  const statusById=new Map(statuses.map(status=>[status.id,status]));
  const projectsByWorkspace=new Map(),quotesByProject=new Map(),unlinkedQuotesByWorkspace=new Map();
  for(const project of projects){
    const list=projectsByWorkspace.get(project.workspace_id)||[];list.push(project);projectsByWorkspace.set(project.workspace_id,list);
  }
  for(const quote of quotes){
    const target=quote.project_id?quotesByProject:unlinkedQuotesByWorkspace,key=quote.project_id||quote.workspace_id;
    const list=target.get(key)||[];list.push(quote);target.set(key,list);
  }
  const cards=[],rows=[],blocked=[];
  for(const workspace of workspaces.filter(isClient)){
    const sorted=(projectsByWorkspace.get(workspace.id)||[]).sort(latestProject),latest=sorted[0]||null;
    // Every partner order remains independently actionable, including older open orders.
    const relevant=[latest,...sorted.filter(project=>project!==latest&&isCompanyPortalProject(project))];
    for(const project of relevant){
    const partner=isCompanyPortalProject(project);
    const workspaceStatus=statusById.get(workspace.status_id),status=project?statusById.get(project.status_id):workspaceStatus;
    const projectQuotes=project?(quotesByProject.get(project.id)||[]).filter(quote=>!quote.workspace_id||quote.workspace_id===workspace.id):[];
    const paidQuotes=projectQuotes.filter(quote=>quote.payment_status==='paid').sort(paidFirst);
    const quote=paidQuotes[0]||[...projectQuotes].sort(newest)[0]||null;
    const legacyQuotes=unlinkedQuotesByWorkspace.get(workspace.id)||[];
    const stage=QUEUE_STAGES.includes(status?.queue_stage)?status.queue_stage:'none';
    const workspaceStage=QUEUE_STAGES.includes(workspaceStatus?.queue_stage)?workspaceStatus.queue_stage:'none';
    const closed=Boolean(project?project.finalized_at||project.desisted_at||status?.is_finalized:workspaceStatus?.is_finalized);
    const payment=partner?'partner':paidQuotes.length?'paid':projectQuotes.length?'pending':legacyQuotes.length?'unlinked':'none';
    const row={project,workspace,status,quote,stage,payment,paidCount:paidQuotes.length,quoteCount:projectQuotes.length,
      deliveryDate:dateValue(project?.delivery_date),responsibleId:workspace.responsible_user_id||project?.responsible_user_id||null,
      position:null,reasons:[],closed};
    if(project===latest)cards.push(row);
    if(closed)continue;
    const operational=stage!=='none'||!partner&&workspaceStage!=='none';
    if(!operational)continue;
    if(!project)row.reasons.push('Esta empresa ainda não possui projeto vinculado.');
    if(!partner&&stage==='none'&&workspaceStage!=='none')row.reasons.push('O status do projeto precisa ser atualizado para esta etapa.');
    if(!partner&&!paidQuotes.length){
      row.reasons.push(payment==='unlinked'?'O orçamento antigo precisa ser vinculado ao projeto atual.':payment==='none'?'Crie um orçamento para este projeto.':'O orçamento deste projeto ainda está pendente de pagamento.');
    }
    if(!partner&&!row.deliveryDate)row.reasons.push('Defina a data de entrega do projeto.');
    const readiness=releaseIssues.find(entry=>entry.project_id===project?.id);if(readiness?.issues?.length)row.reasons.push(...readiness.issues);
    if(row.reasons.length){row.blockedStage=stage!=='none'?stage:workspaceStage;blocked.push(row);continue;}
    rows.push(row);
    }
  }
  rows.sort((a,b)=>(a.deliveryDate||'9999-12-31').localeCompare(b.deliveryDate||'9999-12-31')
    ||timestamp(a.project.status_entered_at||a.project.started_at)-timestamp(b.project.status_entered_at||b.project.started_at)
    ||timestamp(a.quote?.paid_at)-timestamp(b.quote?.paid_at)
    ||timestamp(a.project.created_at||a.project.started_at)-timestamp(b.project.created_at||b.project.started_at)
    ||String(a.project.id).localeCompare(String(b.project.id)));
  const positions=new Map();
  for(const row of rows){row.position=(positions.get(row.stage)||0)+1;positions.set(row.stage,row.position);}
  return {rows,cards,blocked,missingStages:missingQueueStages(statuses),error:null};
}

export function scopeQueueRows(rows,userId,scope='all'){
  return rows.filter(row=>scope!=='mine'||row.responsibleId===userId);
}

export async function fetchQueueRecords(supabase,ownerId,pageSize=500){
  if(!ownerId)throw new Error('Entre novamente para consultar as filas.');
  const fetchTable=async(table,columns)=>{
    const rows=[];
    for(let start=0;;start+=pageSize){
      const {data,error}=await supabase.from(table).select(columns).eq('owner_id',ownerId).order('id').range(start,start+pageSize-1);
      if(error)throw new Error(`Não foi possível carregar ${table==='z19p_projects'?'os projetos':'os pagamentos'}: ${error.message||error}`);
      rows.push(...(data||[]));
      if((data||[]).length<pageSize)return rows;
    }
  };
  const [projectRows,quotes]=await Promise.all([
    fetchTable('z19p_projects','id,workspace_id,sequence_no,title,status_id,service_type,official_order_ref,official_order_source,official_order_status,delivery_date,status_entered_at,started_at,finalized_at,desisted_at,responsible_user_id,created_at'),
    fetchTable('z19p_quotes','id,workspace_id,project_id,title,service_type,payment_status,paid_at,delivery_date,created_at,updated_at')
  ]);
  const projects=projectRows.map(project=>({...project,source_kind:project.source_kind||'internal',company_order_id:project.company_order_id||null}));
  return {projects,quotes};
}
