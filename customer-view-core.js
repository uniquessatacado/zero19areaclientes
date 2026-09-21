/* Customer visibility is a UI filter on already-authorized rows, never a replacement for RLS. */
const SERVICE_LABELS = Object.freeze({full_shirt:'Camiseta completa',dtf_only:'Somente arte / DTF',customer_shirt:'Camiseta do cliente',refurbishment:'Reforma de camiseta'});
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const timestamp = value => { const result = value ? new Date(value).getTime() : NaN; return Number.isFinite(result) ? result : null; };
export function latestCustomerProject(workspace, projects = []) {
  return projects.filter(project => project.workspace_id === workspace.id && (!workspace.owner_id || project.owner_id === workspace.owner_id))
    .sort((a,b) => (Number(b.sequence_no)||0)-(Number(a.sequence_no)||0) || (timestamp(b.started_at)||0)-(timestamp(a.started_at)||0))[0] || null;
}
export function customerState(workspace, {projects = [], statuses = [], now = Date.now()} = {}) {
  const project = latestCustomerProject(workspace, projects);
  const status = statuses.find(item => item.id === (project?.status_id || workspace.status_id)) || null;
  const statusName = normalize(status?.name);
  const closed = Boolean(project?.delivered_at || project?.finalized_at || project?.desisted_at || status?.is_finalized || /^(entregue|finalizado|desistiu|cliente desistiu|cancelado)$/.test(statusName));
  const deadline = timestamp(project?.delivery_date || project?.expected_delivery_date || workspace.delivery_date);
  const reminder = timestamp(project?.reminder_at || workspace.reminder_at);
  const changedAt = timestamp(workspace.status_changed_at || workspace.updated_at || workspace.created_at);
  const overdue = !closed && deadline !== null && deadline + 86400000 <= now;
  const reminderDue = !closed && reminder !== null && reminder <= now;
  const stale = !closed && !reminder && changedAt !== null && now-changedAt >= 86400000;
  return {project,status,closed,deadline,overdue,reminderDue,stale,attention:overdue||reminderDue||stale,changedAt,serviceLabel:SERVICE_LABELS[project?.service_type || workspace.service_type] || 'Serviço a definir'};
}
export function customerView(workspaces, {ownerId,userId,scope='mine',query='',statusId='all',projects=[],statuses=[],now=Date.now()} = {}) {
  if(!ownerId || !userId)return [];
  const search=normalize(query).trim();
  return workspaces.filter(workspace => workspace.owner_id===ownerId && (!workspace.workspace_type || workspace.workspace_type==='client'))
    .filter(workspace => scope==='all' || (workspace.responsible_user_id || workspace.created_by || workspace.owner_id)===userId)
    .filter(workspace => !search || normalize([workspace.company_name,workspace.client_name,workspace.phone,workspace.state].join(' ')).includes(search))
    .map(workspace => ({workspace,state:customerState(workspace,{projects,statuses,now})}))
    .filter(({workspace,state}) => statusId==='all' || (statusId==='none' && !state.status && !workspace.status_id) || (state.status?.id || workspace.status_id)===statusId)
    .sort((a,b) => Number(a.state.closed)-Number(b.state.closed)
      || (a.state.closed ? (timestamp(b.state.project?.finalized_at || b.workspace.updated_at)||0)-(timestamp(a.state.project?.finalized_at || a.workspace.updated_at)||0)
        : (a.state.deadline ?? Infinity)-(b.state.deadline ?? Infinity) || Number(b.state.attention)-Number(a.state.attention) || (a.state.changedAt ?? Infinity)-(b.state.changedAt ?? Infinity))
      || String(a.workspace.company_name||'').localeCompare(String(b.workspace.company_name||''),'pt-BR'))
    .map(({workspace}) => workspace);
}
