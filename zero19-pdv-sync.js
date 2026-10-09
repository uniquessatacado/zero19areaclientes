import {calculateProductionSchedule} from './production-scheduler.js';
import {createProductionPlanningUI} from './production-planning-ui.js';
import {filmItemFromLibraryAsset} from './film-picker.js';
import {orderItemProgress} from './order-item-progress.js';
import {hydrateProductionArtworkPreviews} from './production-artwork-previews.js?v=2.17.49';
const STAGE_ORDER=['awaiting_release','awaiting_art','art_received','awaiting_halftone','awaiting_font','ready_production','production','ready_pickup'];
const STAGE_LABELS={
  awaiting_release:'Venduss · pendente de liberação',
  awaiting_art:'Pendente de subir arte',
  art_received:'Arte recebida · organizar',
  awaiting_halftone:'Aguardando halftone',
  awaiting_font:'Pendente de definir fonte',
  ready_production:'Aguardando produção',
  production:'Em produção',
  ready_pickup:'Pronto para retirada',
  delivered:'Entregue',
  cancelled:'Cancelado'
};
const STAGE_HINTS={
  awaiting_release:'Aguardando pagamento confirmado ou liberação antecipada pela Venduss. Não separar nem produzir ainda.',
  awaiting_art:'O pedido veio do PDV ZERO19 e ainda precisa receber a arte final.',
  art_received:'O arquivo chegou pelo PDV e precisa ser importado, medido e posicionado antes da produção.',
  awaiting_halftone:'A arte foi recebida e precisa do tratamento em halftone antes de entrar no filme.',
  awaiting_font:'Nome, número ou frase aguardando a fonte correta antes da impressão.',
  ready_production:'Arte preparada e liberada para entrar no próximo filme.',
  production:'Pedido marcado no filme e em execução na produção.',
  ready_pickup:'Produção concluída. Avise o cliente e aguarde a retirada.'
};
const ZERO19_TENANT_ID='0e885daf-b461-4384-b2c2-8ed2cf33478b';
const INSTAGRAM_HANDLE='zero19indaiatuba';
const INSTAGRAM_URL='https://www.instagram.com/'+INSTAGRAM_HANDLE;

function installStyles(){
  if(document.getElementById('zero19PdvSyncStyles'))return;
  const style=document.createElement('style');style.id='zero19PdvSyncStyles';
  style.textContent='.z19-sync-strip{margin:18px 0 24px;padding:18px;border:1px solid #27272a;border-radius:22px;background:linear-gradient(145deg,#111113,#171719);box-shadow:0 18px 50px rgba(0,0,0,.18)}.z19-order-picker-toolbar{display:grid;grid-template-columns:1fr auto;gap:10px;margin:12px 0}.z19-order-picker-toolbar input{min-width:0}.z19-order-picker-row{display:grid;gap:4px}.z19-order-picker-row b{font-size:14px}.z19-order-picker-row strong{color:#ff8a5b;font-size:12px}.z19-order-picker-row .phone{font-weight:800;color:#d4d4d8}.z19-order-picker-footer{display:flex;justify-content:center;padding-top:10px}.z19-sync-head{display:flex;gap:14px;align-items:center;justify-content:space-between;margin-bottom:14px}.z19-sync-head h2{margin:2px 0 0;font-size:20px}.z19-sync-head p{margin:4px 0 0;color:#a1a1aa;font-size:13px}.z19-sync-actions{display:flex;gap:8px;flex-wrap:wrap}.z19-sync-counts{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}.z19-sync-count{border:1px solid #303036;border-radius:16px;padding:12px;background:#0c0c0e;text-align:left;color:inherit}.z19-sync-count strong{display:block;font-size:24px;line-height:1}.z19-sync-count span{display:block;margin-top:7px;font-size:11px;color:#b8b8c0;line-height:1.25}.z19-sync-count.danger{border-color:#7f1d1d;background:#1c0c0c}.z19-sync-count.warn{border-color:#854d0e;background:#1d1406}.z19-zero19-page{display:grid;gap:18px}.z19-zero19-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}.z19-zero19-summary button{min-height:84px;border:1px solid #303036;border-radius:18px;background:#111113;color:inherit;text-align:left;padding:14px;cursor:pointer}.z19-zero19-summary b{display:block;font-size:26px}.z19-zero19-summary span{font-size:11px;color:#aaa}.z19-zero19-section{display:grid;gap:10px}.z19-zero19-section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px}.z19-zero19-section-head h2{margin:0}.z19-zero19-section-head p{margin:4px 0 0;color:#9f9fa8;font-size:13px}.z19-zero19-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.z19-zero19-card{border:1px solid #2d2d32;border-radius:20px;background:#111113;padding:16px;display:grid;gap:12px}.z19-zero19-card.overdue{border-color:#991b1b;box-shadow:inset 0 0 0 1px rgba(239,68,68,.16)}.z19-zero19-card-head{display:flex;justify-content:space-between;gap:12px}.z19-zero19-card h3{margin:0;font-size:18px}.z19-zero19-card small{color:#a1a1aa}.z19-zero19-order{font-size:12px;color:#fb923c;font-weight:800}.z19-zero19-meta{display:flex;gap:7px;flex-wrap:wrap}.z19-zero19-meta span{border:1px solid #303036;border-radius:999px;padding:5px 9px;font-size:11px;color:#c7c7cc}.z19-zero19-items{display:grid;gap:6px}.z19-zero19-item{padding:9px 10px;border-radius:12px;background:#0a0a0c;font-size:12px;color:#c7c7cc}.z19-zero19-item b{color:#fff}.z19-zero19-card-actions{display:flex;gap:8px;flex-wrap:wrap}.z19-sync-overdue{font-size:11px;font-weight:800;color:#fca5a5}.z19-sync-settings{margin-top:12px}.z19-sync-settings-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end}.z19-transfer-list{display:grid;gap:9px;max-height:55dvh;overflow:auto}.z19-transfer-row{border:1px solid #333;border-radius:14px;padding:12px;text-align:left;background:#121214;color:inherit;cursor:pointer}.z19-transfer-row b,.z19-transfer-row span,.z19-transfer-row small{display:block}.z19-transfer-row span{margin-top:3px}.z19-transfer-row small{margin-top:5px;color:#aaa}.z19-transfer-button{margin-left:auto}.z19-ready-message{white-space:pre-wrap;background:#0b0b0d;border:1px solid #2d2d32;border-radius:14px;padding:12px;font-size:12px;line-height:1.5;color:#d4d4d8}@media(max-width:780px){.z19-sync-head{align-items:flex-start;flex-direction:column}.z19-sync-counts,.z19-zero19-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.z19-zero19-summary button:last-child,.z19-sync-count:last-child{grid-column:1/-1}.z19-zero19-grid{grid-template-columns:1fr}.z19-zero19-card-actions .btn{flex:1 1 44%;justify-content:center}.z19-sync-settings-row{grid-template-columns:1fr}.z19-sync-settings-row .btn{width:100%;justify-content:center}}';
  document.head.appendChild(style);
  style.textContent+='.z19-zero19-item{min-width:0;overflow-wrap:anywhere;display:flow-root}.z19-produced-action{display:flex;justify-content:flex-end;clear:both;margin-top:9px}.z19-produced-action .btn{min-height:44px;max-width:100%;white-space:normal;background:#fff;color:#111113;border:1px solid #fff;font-weight:800}.z19-produced-action .btn:disabled{opacity:.55;cursor:not-allowed}.z19-produced-action .btn:focus-visible{outline:3px solid #facc15;outline-offset:3px}@media(max-width:420px){.z19-produced-action .btn{width:100%;justify-content:center}}';
}
function digits(v){return String(v||'').replace(/\D/g,'')}
function h(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function dt(v){if(!v)return 'Sem prazo';const d=new Date(v);if(!Number.isFinite(d.getTime()))return 'Sem prazo';return d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
function slotDt(v){if(!v)return 'Sem prazo';const d=new Date(v);if(!Number.isFinite(d.getTime()))return 'Sem prazo';const weekday=d.toLocaleDateString('pt-BR',{weekday:'long'});return weekday.charAt(0).toUpperCase()+weekday.slice(1)+', '+d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' às '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
function orderNo(project){const value=project?.official_order_payload?.display_id;return value?String(value):String(project?.official_order_ref||'').slice(0,8)}
function notifyMessage(name){
  const first=String(name||'cliente').trim().split(/\s+/)[0]||'cliente';
  return 'Olá, '+first+'! 😊 Seu produto na ZERO19 está pronto para retirada.\n\nEstamos abertos das 9h às 18h, de segunda a sábado.\n\nSe desejar algum vídeo ou foto do produto, é só solicitar que podemos enviar agora.\n\nUma ajuda que faz muita diferença para a gente: quando pegar seu produto, se puder marcar a @'+INSTAGRAM_HANDLE+' nos Stories e contar como ficou a qualidade, ficamos muito felizes. Seu feedback ajuda a ZERO19 a melhorar cada vez mais o serviço.\n\nSiga a gente no Instagram: '+INSTAGRAM_URL+'\n\nQualquer dúvida, estamos à disposição.';
}
function normalizeBusinessTime(source,holidays=[]){
  const date=new Date(source);
  const closed=new Set((holidays||[]).map(value=>String(value).slice(0,10)));
  while(true){
    const key=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
    if(date.getDay()===0||closed.has(key)){date.setDate(date.getDate()+1);date.setHours(10,0,0,0);continue}
    const minutes=date.getHours()*60+date.getMinutes();
    if(minutes<600){date.setHours(10,0,0,0);return date}
    if(minutes>=1080){date.setDate(date.getDate()+1);date.setHours(10,0,0,0);continue}
    return date;
  }
}
function addBusinessMinutes(source,minutes,holidays=[]){
  let date=normalizeBusinessTime(source,holidays),remaining=Math.max(0,Number(minutes)||0);
  while(remaining>.001){
    date=normalizeBusinessTime(date,holidays);const end=new Date(date);end.setHours(18,0,0,0);
    const available=Math.max(0,(end-date)/60000);
    if(remaining<=available){date=new Date(date.getTime()+remaining*60000);remaining=0;break}
    remaining-=available;date=new Date(end);date.setDate(date.getDate()+1);date.setHours(10,0,0,0);
  }
  return normalizeBusinessTime(date,holidays);
}
function stageFromProject(project,items){
  if(project?.official_order_status&&STAGE_LABELS[project.official_order_status])return project.official_order_status;
  for(const stage of STAGE_ORDER)if(items.some(i=>i.stage===stage))return stage;
  return items[0]?.stage||'awaiting_art';
}
export function createZero19PdvSync(ctx){
  installStyles();
  const {supabase,app,shell,bindCommon,accountOwnerId,nav,toast,bucket,state,startUploadForWorkspace,startStandaloneHalftone,offerAfterUpload,queueTeamToFilm,queueAssetToFilm}=ctx;
  let cache=null,cacheAt=0,lastAutoSyncAt=0,autoSyncPromise=null,homeSelected='all',homeQuery='',countdownTimer=null,liveTimer=null,liveBusy=false;
  const producedItemLocks=new Set();
  const planningUI=createProductionPlanningUI({supabase,load,toast,onSaved:async()=>{invalidate();if(productionViewActive())await refreshProductionViewAt(window.scrollY)}});
  function ensureLiveRefresh(){
    if(liveTimer)return;
    liveTimer=window.setInterval(async()=>{
      if(liveBusy||document.hidden||!accountOwnerId()||!productionViewActive()||document.querySelector('.modal-backdrop')||/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||''))return;
      liveBusy=true;try{await refreshProductionViewAt(window.scrollY)}catch(error){console.warn('production refresh',error)}finally{liveBusy=false}
    },15000);
  }
  function countdownLabel(value){
    const deadline=new Date(value),difference=deadline.getTime()-Date.now();if(!Number.isFinite(deadline.getTime()))return {label:'Sem prazo',tone:'none'};
    const totalMinutes=difference>=0?Math.ceil(difference/60000):Math.floor(Math.abs(difference)/60000),days=Math.floor(totalMinutes/1440),hours=Math.floor(totalMinutes%1440/60),minutes=totalMinutes%60,time=(days?days+'d ':'')+String(hours).padStart(2,'0')+'h '+String(minutes).padStart(2,'0')+'min';
    return difference<0?{label:'Vencido há '+time,tone:'overdue'}:difference<=24*60*60*1000?{label:'Faltam '+time,tone:'urgent'}:{label:'Faltam '+time,tone:'normal'};
  }
  function updateDeadlineCountdowns(root=document){
    root.querySelectorAll('[data-deadline-countdown]').forEach(element=>{const result=countdownLabel(element.dataset.deadlineCountdown);element.textContent=result.label;element.dataset.tone=result.tone});
    root.querySelectorAll('[data-pause-elapsed]').forEach(element=>{const started=new Date(element.dataset.pauseElapsed).getTime(),minutes=Number.isFinite(started)?Math.floor(Math.max(0,Date.now()-started)/60000):0;const days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60);element.textContent='Parado há '+days+'d '+String(hours).padStart(2,'0')+'h '+String(minutes%60).padStart(2,'0')+'min'});
  }
  function ensureCountdownTimer(){if(countdownTimer)return;updateDeadlineCountdowns();countdownTimer=window.setInterval(()=>updateDeadlineCountdowns(),1000)}
  async function ensureAutomaticSync(force=false){
    const now=Date.now();
    if(!force&&now-lastAutoSyncAt<60000)return;
    if(autoSyncPromise)return autoSyncPromise;
    autoSyncPromise=(async()=>{
      try{
        const {data,error}=await supabase.rpc('z19p_sync_zero19_recent',{p_limit:30});
        if(error)throw error;
        lastAutoSyncAt=Date.now();
        if(Number(data?.synced)||0){cache=null;cacheAt=0}
      }catch(error){
        console.warn('zero19 automatic sync',error);
      }finally{autoSyncPromise=null}
    })();
    return autoSyncPromise;
  }
  async function load(force=false){
    const owner=accountOwnerId();if(!owner)return {items:[],projects:[],workspaces:[],summaries:[]};
    const actor=state().session?.user?.id,previewCurrent=()=>owner===accountOwnerId()&&actor===state().session?.user?.id;
    if(!force&&cache&&Date.now()-cacheAt<12000)return cache;
    void ensureAutomaticSync(false);
    const [wi,sla,libraryResult,pauseResult,reasonsResult]=await Promise.all([
      supabase.from('z19p_zero19_work_items').select('*').eq('owner_id',owner).in('stage',STAGE_ORDER).order('promised_at',{ascending:true,nullsFirst:false}).order('created_at'),
      supabase.rpc('zero19_personalization_ops_snapshot',{p_tenant_id:ZERO19_TENANT_ID}),
      supabase.from('z19p_workspaces').select('*').eq('owner_id',owner).eq('workspace_type','library_zero19').limit(1),
      supabase.from('z19p_production_pauses').select('id,project_id,scope,reason_id,note,started_at').eq('owner_id',owner).is('ended_at',null),
      supabase.from('z19p_pause_reasons').select('*').eq('owner_id',owner).order('sort_order').order('name')
    ]);
    const firstError=wi.error||libraryResult.error;if(firstError)throw firstError;
    let items=wi.data||[];const saleIds=[...new Set(items.map(row=>row.personalization_sale_id).filter(Boolean))];
    if(saleIds.length){const source=await supabase.from('personalization_sales').select('id,public_tracking_token,personalization_code').in('id',saleIds);if(!source.error){const sourceMap=new Map((source.data||[]).map(row=>[row.id,row]));items=items.map(item=>({...item,metadata:{...(item.metadata||{}),public_tracking_token:sourceMap.get(item.personalization_sale_id)?.public_tracking_token||item.metadata?.public_tracking_token,personalization_code:sourceMap.get(item.personalization_sale_id)?.personalization_code||item.metadata?.personalization_code}}))}}
    items=await hydrateProductionArtworkPreviews({supabase,items,isCurrent:previewCurrent});
    const projectIds=[...new Set(items.map(row=>row.project_id).filter(Boolean))];
    const pr=projectIds.length?await supabase.from('z19p_projects').select('*').eq('owner_id',owner).in('id',projectIds).order('source_order_created_at',{ascending:false,nullsFirst:false}):{data:[],error:null};
    if(pr.error)throw pr.error;
    const projects=pr.data||[],workspaceIds=[...new Set(projects.map(row=>row.workspace_id).filter(Boolean))],zero19Library=libraryResult.data?.[0]||null;
    const ws=workspaceIds.length?await supabase.from('z19p_workspaces').select('*').eq('owner_id',owner).in('id',workspaceIds):{data:[],error:null};
    if(ws.error)throw ws.error;
    const workspaces=[...(ws.data||[])];if(zero19Library&&!workspaces.some(row=>row.id===zero19Library.id))workspaces.push(zero19Library);
    const pm=new Map(projects.map(x=>[x.id,x])),wm=new Map(workspaces.map(x=>[x.id,x])),groups=new Map();
    let standaloneHalftones=[];
    if(zero19Library){
      const halftones=await supabase.from('z19p_assets').select('*').eq('owner_id',owner).eq('workspace_id',zero19Library.id).eq('asset_type','arte').order('created_at',{ascending:true});
      if(halftones.error)throw halftones.error;
      standaloneHalftones=(halftones.data||[]).filter(asset=>asset.metadata?.standalone_halftone_pending===true);
    }
    for(const item of items){if(!groups.has(item.project_id))groups.set(item.project_id,[]);groups.get(item.project_id).push(item)}
    const allReasons=reasonsResult.error?[]:reasonsResult.data||[],reasonNames=new Map(allReasons.map(row=>[row.id,row.name])),reasons=allReasons.filter(row=>row.active);
    const pauses=(pauseResult.error?[]:pauseResult.data||[]).map(row=>({...row,reason:reasonNames.get(row.reason_id)||row.note||'Motivo não registrado'})),pauseByProject=new Map(pauses.filter(row=>row.scope==='order').map(row=>[row.project_id,row])),printerPause=pauses.find(row=>row.scope==='printer')||sla?.data?.printer_pause||null;
    const measuredAverage=Number(sla?.data?.avg_minutes_per_shirt),avgMinutes=Number.isFinite(measuredAverage)&&measuredAverage>=1&&measuredAverage<=240?measuredAverage:30,holidays=Array.isArray(sla?.data?.holidays)?sla.data.holidays:[],summaries=projects.map(project=>{
      const rows=groups.get(project.id)||[],workspace=wm.get(project.workspace_id)||null,stage=stageFromProject(project,rows),qty=rows.reduce((s,x)=>s+Math.max(1,Number(x.quantity)||1),0),promised=project.promised_at||rows.map(x=>x.promised_at).filter(Boolean).sort()[0]||null;
      const requiresProduction=!['ready_pickup','delivered','cancelled'].includes(stage);
      return {project,workspace,items:rows,stage,qty,promised,pause:requiresProduction?pauseByProject.get(project.id)||null:null,printerPause:requiresProduction?printerPause:null,overdue:promised&&new Date(promised).getTime()<Date.now()&&requiresProduction};
    }).filter(x=>x.items.length).sort((a,b)=>{
      if(a.overdue!==b.overdue)return a.overdue?-1:1;
      const ap=a.promised?new Date(a.promised).getTime():Number.POSITIVE_INFINITY,bp=b.promised?new Date(b.promised).getTime():Number.POSITIVE_INFINITY;
      if(ap!==bp)return ap-bp;return new Date(a.project.source_order_created_at||a.project.created_at||0)-new Date(b.project.source_order_created_at||b.project.created_at||0);
    });
    const schedule=calculateProductionSchedule({...sla?.data,production_items:sla?.data?.production_items||items,pauses:sla?.data?.pauses||pauses});
    if(sla.error||pauseResult.error){schedule.nextAvailableAt=null;schedule.newUnitAvailableAt=null;schedule.projects=schedule.projects.map(row=>({...row,predictedAt:null}));schedule.warnings.push('Não foi possível confirmar calendário e pausas. Atualize antes de prometer um prazo.');console.warn('production schedule unavailable',sla.error||pauseResult.error)}
    const progressByProject=await orderProgress(projectIds);
    for(const summary of summaries)summary.progress=progressByProject.get(summary.project.id);
    const predictions=new Map(schedule.projects.map(row=>[row.project_id,row]));
    let cumulative=0;
    for(const summary of summaries){
      if(['ready_pickup','delivered','cancelled'].includes(summary.stage))continue;
      cumulative+=Math.max(1,summary.qty);const prediction=predictions.get(summary.project.id);summary.predicted=prediction?.predictedAt?new Date(prediction.predictedAt):null;
      summary.risk=Boolean(summary.promised&&summary.predicted&&summary.predicted.getTime()>new Date(summary.promised).getTime());
    }
    cache={items,projects,workspaces,summaries,pm,wm,avgMinutes:schedule.estimatedMinutesPerUnit,measuredAvgMinutes:avgMinutes,schedule,holidays,sla:sla?.data||{},reasons,printerPause,pauseSchemaReady:!pauseResult.error&&!reasonsResult.error,zero19Library,standaloneHalftones};cacheAt=Date.now();return cache;
  }
  async function orderProgress(projectIds){
    const ids=[...new Set(projectIds.filter(Boolean))];
    if(!ids.length)return new Map();
    const {data,error}=await supabase.from('z19p_zero19_work_items').select('id,project_id,stage').eq('owner_id',accountOwnerId()).in('project_id',ids);
    if(error)throw error;
    return new Map(ids.map(id=>[id,orderItemProgress((data||[]).filter(item=>item.project_id===id))]));
  }
  function invalidate(){cache=null;cacheAt=0}
  function productionViewActive(){const path=(location.hash.slice(1).split('?')[0]||'/');return path==='/'||path==='/zero19-fila'}
  function counts(summaries,standaloneHalftones=[]){const out={};for(const s of STAGE_ORDER)out[s]=0;for(const row of summaries)for(const stage of new Set(row.items.map(item=>item.stage)))if(out[stage]!=null)out[stage]++;out.awaiting_halftone+=(standaloneHalftones||[]).length;return out}
  function itemLine(item,{paused=false}={}){
    const title=item.text_value||item.garment_name||item.kind||'Personalização',garment=[item.garment_name,item.garment_color,item.garment_size].filter(Boolean).join(' · ');
    const production=item.metadata?.details?.[0]?.production||{};
    const canMarkProduced=['awaiting_art','art_received','awaiting_halftone','awaiting_font','ready_production','production'].includes(item.stage);
    return '<div class="z19-zero19-item">'+(item._artworkPreview?'<img src="'+h(item._artworkPreview)+'" loading="lazy" alt="Estampa do pedido" style="width:64px;height:64px;object-fit:contain;background:#fff;border-radius:8px;float:left;margin:0 10px 8px 0">':'')+'<b>'+h(title)+'</b> · '+h(item.quantity)+' un.'+(garment?' · '+h(garment):'')+(production.position_label?'<br><strong>Posição: '+h(production.position_label)+'</strong>':'')+(production.venduss_display_id?'<br>VENDUSS #'+h(production.venduss_display_id):'')+(canMarkProduced?'<div class="z19-produced-action"><button class="btn" data-z19-produced-item="'+h(item.id)+'" aria-label="Já está pronta: '+h(title)+'"'+(paused?' disabled title="Retome a produção antes de concluir esta aplicação"':' title="Confirmar que somente esta aplicação já foi produzida"')+'>✓ Já está pronta</button></div>':'')+'</div>';
  }
  function card(summary){
    const p=summary.project,w=summary.workspace||{},stage=summary.stage,phone=digits(w.phone),actions=[],paused=Boolean(summary.pause||summary.printerPause),requiresProduction=!['ready_pickup','delivered','cancelled'].includes(stage);
    const stageItem=summary.items.find(i=>i.stage===stage)||summary.items[0];
    const trackingItem=summary.items.find(item=>item.metadata?.public_tracking_token)||summary.items[0],trackingToken=trackingItem?.metadata?.public_tracking_token,trackingCode=trackingItem?.metadata?.personalization_code;
    for(const item of summary.items){
      const label=h(item.text_value||item.garment_name||'Personalização');
      if(item.stage==='awaiting_art')actions.push('<button class="btn primary" data-z19-upload-workspace="'+h(w.id)+'" data-project-id="'+h(p.id)+'" data-work-item-id="'+h(item.id)+'" data-sale-id="'+h(item.personalization_sale_id)+'">Subir arte · '+label+'</button>');
      if(item.stage==='art_received')actions.push('<button class="btn primary" data-z19-import-source="'+h(item.id)+'">Organizar · '+label+'</button>');
      if(item.stage==='awaiting_halftone')actions.push('<button class="btn primary" '+(item.asset_id?'data-z19-halftone-ready':'data-z19-import-source')+'="'+h(item.id)+'">'+(item.asset_id?'Halftone pronto':'Importar para halftone')+' · '+label+'</button>');
      if(item.stage==='awaiting_font')actions.push('<button class="btn primary" data-z19-choose-font="'+h(item.id)+'">Escolher fonte · '+label+'</button>');
      if(item.stage==='ready_production'&&stage!=='ready_production')actions.push('<button class="btn" '+(['NAME_NUMBER','PHRASE'].includes(String(item.kind).toUpperCase())?'data-z19-team-film="'+h(item.id)+'"':'data-z19-film')+'>Produzir pronta · '+label+'</button>');
    }
    if(stage==='ready_production'){
      const fontSet=stageItem?.metadata?.font_set_id||stageItem?.metadata?.details?.[0]?.production?.font_set_id;
      if(fontSet&&['NAME_NUMBER','PHRASE'].includes(String(stageItem?.kind||'').toUpperCase()))actions.push('<button class="btn primary" data-z19-team-film="'+h(stageItem.id)+'">Adicionar ao filme</button>');
      else if(stageItem?.metadata?.details?.[0]?.production?.storage_bucket==='venduss-print-artworks'||stageItem?.asset_id&&(stageItem?.without_application||stageItem?.metadata?.details?.[0]?.production?.vdr_bundle_id||stageItem?.metadata?.details?.[0]?.production?.checkout_application_id))actions.push('<button class="btn primary" data-z19-asset-film="'+h(stageItem.id)+'">Adicionar estampa ao filme</button>');
      else actions.push('<button class="btn primary" data-z19-film>Abrir montar filme</button>');
    }
    if(summary.items.every(item=>item.stage==='production'))actions.push('<button class="btn" data-z19-ready="'+h(p.id)+'">Concluir todas as personalizações</button>');
    if(['awaiting_art','art_received','awaiting_halftone','awaiting_font','ready_production'].includes(stage))actions.push('<button class="btn" data-z19-force-ready="'+h(p.id)+'">Finalizar pedido inteiro</button>');
    if(paused)for(let index=0;index<actions.length;index++)actions[index]=actions[index].replace('<button ','<button disabled title="Retome o pedido antes de avançar a produção" ');
    if(requiresProduction)actions.push('<button class="btn '+(summary.pause?'primary':'ghost z19-pause-button')+'" data-z19-pause="'+h(p.id)+'" data-z19-paused="'+(summary.pause?'true':'false')+'">'+(summary.pause?'Retomar pedido':'Parar pedido')+'</button>');
    if(summary.printerPause)actions.push('<button class="btn ghost" data-z19-printer-pause data-z19-paused="true">Encerrar manutenção</button>');
    if(stage==='ready_pickup'){if(phone)actions.push('<button class="btn whatsapp" data-z19-notify="'+h(p.id)+'">Avisar cliente</button>');actions.push('<button class="btn primary" data-z19-delivered="'+h(p.id)+'">Entregue</button>');actions.push('<button class="btn ghost" data-z19-reopen="'+h(p.id)+'">Voltar ao fluxo</button>')}
    if(stage==='production')actions.push('<button class="btn ghost" data-z19-production-step="'+h(p.id)+'">Etapa da produção</button>');
    actions.push('<button class="btn ghost" data-z19-deadline="'+h(p.id)+'">Novo prazo</button>');
    if(phone){actions.push('<button class="btn ghost" data-z19-wa="'+h(w.phone||'')+'" data-z19-wa-name="'+h(w.client_name||w.company_name||'Cliente')+'" data-z19-wa-order="'+h(orderNo(p))+'">WhatsApp</button>');actions.push('<button class="btn ghost" data-z19-wa-qr="'+h(p.id)+'">QR WhatsApp</button>')}
    if(phone&&(trackingToken||trackingCode))actions.push('<button class="btn ghost" data-z19-status-link="'+h(trackingToken||'')+'" data-z19-status-code="'+h(trackingCode||'')+'" data-z19-status-phone="'+h(w.phone||'')+'" data-z19-status-order="'+h(orderNo(p))+'">Enviar acompanhamento</button>');
    const itemCount=Math.max(1,Number(summary.qty)||1),deadline=summary.promised?'<span class="z19-deadline-countdown" data-deadline-countdown="'+h(summary.promised)+'"></span><span>Entrega '+h(dt(summary.promised))+'</span>':'<span>Entrega sem prazo definido</span>';
    const pauseNotice=[summary.pause,summary.printerPause].filter(Boolean).map(pause=>'<div class="z19-order-pause"><strong>'+(pause.scope==='printer'?'Produção parada · impressora em manutenção':'Pedido parado')+' · '+h(pause.reason||'Motivo não registrado')+'</strong><span data-pause-elapsed="'+h(pause.started_at)+'"></span>'+(pause.note&&pause.note!==pause.reason?'<small>'+h(pause.note)+'</small>':'')+'</div>').join('');
    return '<article class="z19-zero19-card '+(summary.overdue||summary.risk?'overdue ':'')+(paused?'is-paused':'')+'" data-stage="'+h(stage)+'"><div class="z19-zero19-card-head"><div><div class="z19-zero19-order">PEDIDO #'+h(orderNo(p))+'</div><h3>'+h(w.client_name||w.company_name||'Cliente')+'</h3><small>'+h(w.phone||'Sem WhatsApp')+'</small></div><div class="z19-card-stage" data-stage="'+h(stage)+'"'+(paused?' data-paused="true"':'')+'><b>'+h(paused?'Pedido parado':STAGE_LABELS[stage]||stage)+'</b><small><strong>'+h(itemCount)+'</strong> '+(itemCount===1?'item':'itens')+'</small></div></div>'+pauseNotice+'<div class="z19-zero19-meta">'+deadline+(summary.risk&&!summary.overdue?'<span class="z19-sync-overdue">RISCO DE ATRASO · previsão '+h(dt(summary.predicted))+'</span>':'')+'</div>'+(summary.progress?.total?'<div style="padding:10px;border-radius:12px;background:#182c29;color:#c7f9df;font-size:12px"><strong>'+h(summary.progress.label)+'</strong><br>'+h(summary.progress.detail)+'</div>':'')+'<div class="z19-zero19-items">'+summary.items.map(item=>itemLine(item,{paused})+'<small>'+h(STAGE_LABELS[item.stage]||item.stage)+'</small>').join('')+'</div><div class="z19-zero19-card-actions">'+actions.join('')+'</div></article>';
  }
  async function enhanceDashboard(){
    try{
      if(!app||app.querySelector('[data-z19-sync-strip]'))return;
      const data=await load(true),c=counts(data.summaries,data.standaloneHalftones),overdue=data.summaries.filter(x=>x.overdue).length,risk=data.summaries.filter(x=>x.risk&&!x.overdue).length,hero=app.querySelector('.simple-hero');
      if(!hero)return;
      const section=document.createElement('section');section.className='z19-sync-strip';section.dataset.z19SyncStrip='';
      section.innerHTML='<div class="z19-sync-head"><div><div class="eyebrow">PDV ZERO19 ↔ PERSONALIZAÇÕES</div><h2>Fila sincronizada em tempo real</h2><p>'+(overdue?'<b>'+overdue+' pedido(s) com prazo vencido.</b> ':'')+(risk?'<b>'+risk+' pedido(s) com risco de atraso.</b> ':'')+'Média atual '+Number(data.avgMinutes||30).toLocaleString('pt-BR',{maximumFractionDigits:1})+' min/camisa. Pedidos novos do PDV entram aqui automaticamente.</p></div><div class="z19-sync-actions"><button class="btn primary" data-z19-global-upload>＋ Subir arte</button><button class="btn" data-z19-open-queue>Abrir fila</button></div></div><div class="z19-sync-counts">'+STAGE_ORDER.map(stage=>'<button class="z19-sync-count '+(stage==='awaiting_art'&&c[stage]?'danger':stage==='awaiting_font'&&c[stage]?'warn':'')+'" data-z19-open-stage="'+stage+'"><strong>'+c[stage]+'</strong><span>'+h(STAGE_LABELS[stage])+'</span></button>').join('')+'</div>';
      hero.insertAdjacentElement('afterend',section);
      bindRoot(section);
    }catch(error){console.warn('zero19 sync dashboard',error)}
  }
  async function renderHome({loading=true}={}){
    const requestedHash=location.hash,requestedOwner=accountOwnerId();
    if(loading){app.innerHTML=shell('<main class="container simple-container production-home"><section class="production-home-loading" aria-live="polite"><span class="loading"></span><div><b>Organizando a produção</b><small>Buscando somente as personalizações em aberto da Loja Zero19.</small></div></section></main>');bindCommon()}
    let data;try{data=await load(true)}catch(error){console.error('production home',error);app.innerHTML=shell('<main class="container simple-container production-home"><section class="production-load-error"><div class="eyebrow">CONEXÃO COM A PRODUÇÃO</div><h1>Não foi possível carregar a fila</h1><p>'+h(error?.message||'Falha de conexão')+'</p><button class="btn primary" data-production-retry>Tentar novamente</button></section></main>');bindCommon();app.querySelector('[data-production-retry]').onclick=()=>{invalidate();renderHome()};return}
    if(location.hash!==requestedHash||accountOwnerId()!==requestedOwner)return;
    const open=data.summaries.filter(row=>STAGE_ORDER.includes(row.stage)),c=counts(open,data.standaloneHalftones),overdue=open.filter(row=>row.overdue).length,risk=open.filter(row=>row.risk&&!row.overdue).length;
    const standaloneHtml=asset=>'<article class="z19-zero19-card production-home-card"><div class="z19-zero19-card-head"><div><div class="z19-zero19-order">HALFTONE AVULSO</div><h3>'+h(asset.name)+'</h3><small>Biblioteca ZERO19 · sem cliente vinculado</small></div><div><b>Aguardando halftone</b><small>1 arte</small></div></div><div class="z19-zero19-card-actions"><button class="btn" data-z19-open="'+h(asset.workspace_id)+'">Abrir arte</button><button class="btn primary" data-z19-standalone-halftone-ready="'+h(asset.id)+'">Halftone pronto</button></div></article>';
    const visible=()=>open.filter(row=>(homeSelected==='all'||row.items.some(item=>item.stage===homeSelected))&&(!homeQuery||[orderNo(row.project),row.workspace?.client_name,row.workspace?.company_name,row.workspace?.phone,...row.items.map(item=>item.text_value||item.garment_name||'')].join(' ').toLocaleLowerCase('pt-BR').includes(homeQuery)));
    const draw=()=>{const rows=visible(),standalone=homeSelected==='all'||homeSelected==='awaiting_halftone'?data.standaloneHalftones||[]:[],grid=app.querySelector('[data-production-open-grid]');if(!grid)return;grid.innerHTML=rows.map(summary=>card(summary).replace('z19-zero19-card ','z19-zero19-card production-home-card ')).join('')+standalone.map(standaloneHtml).join('')||'<div class="production-home-empty"><b>Nenhuma personalização neste filtro.</b><span>Pedidos com personalização da Loja Zero19 aparecerão aqui automaticamente.</span></div>';app.querySelector('[data-production-result-count]').textContent=String(rows.length+standalone.length);app.querySelectorAll('[data-home-stage-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.homeStageFilter===homeSelected)));bindRoot(grid)};
    const total=open.length+(data.standaloneHalftones||[]).length;
    const localBacklogUnits=open.filter(row=>!['ready_pickup','delivered','cancelled'].includes(row.stage)).reduce((total,row)=>total+Math.max(1,Number(row.qty)||1),0),reportedBacklogUnits=Math.max(0,Number(data.sla?.backlog_quantity)||0),backlogUnits=Math.max(localBacklogUnits,reportedBacklogUnits);
    const nextAvailable=data.printerPause?'Impressora em manutenção':data.schedule.newUnitAvailableAt?slotDt(data.schedule.newUnitAvailableAt):'Previsão indisponível — conferir fila';
    app.innerHTML=shell('<main class="container simple-container production-home"><section class="production-home-hero"><div><div class="eyebrow">LOJA ZERO19 → PERSONALIZAÇÕES</div><h1>Produção de personalizações</h1><p>Veja o que precisa ser feito agora, do recebimento da arte até a retirada. Clientes sem trabalho aberto ficam fora desta tela.</p></div><div class="production-home-actions"><button class="btn primary" data-z19-global-upload>+ Subir arte</button><button class="btn" data-z19-home-refresh>Atualizar</button><button class="btn ghost" data-nav="/clientes">Todos os clientes</button></div></section><section class="production-health '+(overdue?'has-overdue':'')+'"><div><small>Em aberto</small><strong>'+total+'</strong></div><p>'+(overdue?'<b>'+overdue+' com prazo vencido.</b> ':'')+(risk?'<b>'+risk+' com risco de atraso.</b> ':'')+(overdue||risk?'Comece pelos pedidos destacados.':'A fila está dentro do prazo informado.')+'</p><span>Sincronização automática ativa</span></section><section class="production-stage-board" aria-label="Etapas da produção"><button data-home-stage-filter="all" aria-pressed="true"><strong>'+total+'</strong><span>Tudo em aberto</span></button>'+STAGE_ORDER.map(stage=>'<button data-home-stage-filter="'+stage+'" aria-pressed="false"><strong>'+c[stage]+'</strong><span>'+h(STAGE_LABELS[stage])+'</span></button>').join('')+'</section><section class="production-open-section"><div class="production-open-head"><div><div class="eyebrow">TRABALHO EM ABERTO</div><h2>Próximas ações</h2><p>Cada cartão mostra o próximo passo para a produção continuar.</p></div><span data-production-result-count>'+total+'</span></div><div class="production-search"><span>⌕</span><input type="search" data-production-search placeholder="Buscar pedido, cliente, WhatsApp ou personalização" aria-label="Buscar na produção"></div><div class="z19-zero19-grid production-open-grid" data-production-open-grid></div></section></main>');
    const hero=app.querySelector('.production-home-hero'),health=app.querySelector('.production-health');
    if(hero&&health){
      const archive=document.createElement('button');archive.className='btn ghost';archive.dataset.nav='/zero19-entregues';archive.textContent='Entregues';hero.querySelector('.production-home-actions')?.appendChild(archive);
      const maintenance=document.createElement('button');maintenance.className='btn '+(data.printerPause?'primary':'ghost');maintenance.dataset.z19PrinterPause='';maintenance.dataset.z19Paused=String(Boolean(data.printerPause));maintenance.textContent=data.printerPause?'Retomar impressora':'Impressora em manutenção';hero.querySelector('.production-home-actions')?.appendChild(maintenance);
      const reasons=document.createElement('button');reasons.className='btn ghost';reasons.dataset.z19ManageReasons='';reasons.textContent='Motivos de pausa';hero.querySelector('.production-home-actions')?.appendChild(reasons);
      const holidays=document.createElement('button');holidays.className='btn ghost';holidays.dataset.z19ManageHolidays='';holidays.textContent='Feriados';hero.querySelector('.production-home-actions')?.appendChild(holidays);
      const timing=document.createElement('button');timing.className='btn ghost';timing.dataset.z19ProductionSettings='';timing.textContent='Tempos da produção';hero.querySelector('.production-home-actions')?.appendChild(timing);
      if(!data.pauseSchemaReady){for(const button of [maintenance,reasons,holidays]){button.disabled=true;button.title='Aguardando a atualização segura do banco de dados'}const pending=document.createElement('small');pending.className='production-config-pending';pending.textContent='Pausas e feriados aguardando atualização do banco.';hero.querySelector('.production-home-actions')?.appendChild(pending)}
      const b=data.schedule.breakdown,detail='Arte/preparação: '+((b.art||0)+(b.preparation||0))+' min · Impressão: '+b.printing+' min ('+b.printBatches+' lotes) · Corte: '+b.cutting+' min · Forno: '+b.curing+' min · Prensa: '+b.pressing+' min';
      const metrics=document.createElement('section');metrics.className='production-live-metrics';metrics.innerHTML='<article><small>Tempo estimado por camisa</small><strong>'+Number(data.avgMinutes).toLocaleString('pt-BR',{maximumFractionDigits:1})+' min</strong><span>Calculado por etapas. Média medida: '+Number(data.measuredAvgMinutes).toLocaleString('pt-BR',{maximumFractionDigits:1})+' min · '+(Number(data.sla?.completed_sample_count)||0)+' produções novas</span></article><article><small>Próximo prazo disponível</small><strong>'+h(nextAvailable)+'</strong><span>'+backlogUnits+' unidade(s) · '+data.schedule.totalMinutes+' min na fila + '+data.schedule.newUnitReserveMinutes+' min para nova unidade · segunda a sábado, 10h–18h</span><details><summary>Como este prazo foi calculado</summary><p>'+h(detail)+'</p><p>Somente peças da mesma etapa e com medidas confirmadas compartilham lotes. Máquinas e operador podem trabalhar em paralelo. A previsão acima inclui a reserva para uma nova unidade depois de toda a fila.</p></details><span>'+h(data.schedule.warnings.join(' '))+'</span></article>';health.before(metrics);
    }
    bindCommon();bindRoot(app);draw();
    app.querySelectorAll('[data-home-stage-filter]').forEach(button=>button.onclick=()=>{homeSelected=button.dataset.homeStageFilter;draw()});
    const search=app.querySelector('[data-production-search]');search.value=homeQuery;search.oninput=event=>{homeQuery=String(event.target.value||'').trim().toLocaleLowerCase('pt-BR');draw()};
    app.querySelector('[data-z19-home-refresh]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;button.textContent='Atualizando…';await ensureAutomaticSync(true);invalidate();await renderHome()};
  }
  function bindRoot(root=document){
    updateDeadlineCountdowns(root);ensureCountdownTimer();ensureLiveRefresh();
    root.querySelectorAll('[data-z19-production-settings]').forEach(b=>b.onclick=()=>planningUI.openSettings());
    root.querySelectorAll('[data-z19-production-step]').forEach(b=>b.onclick=()=>planningUI.openStep(b.dataset.z19ProductionStep));
    root.querySelectorAll('[data-z19-open-queue]').forEach(b=>b.onclick=()=>nav('/zero19-fila'));
    root.querySelectorAll('[data-z19-open-stage]').forEach(b=>b.onclick=()=>{nav('/zero19-fila');sessionStorage.setItem('z19-zero19-stage',b.dataset.z19OpenStage||'')});
    root.querySelectorAll('[data-z19-sync-now]').forEach(b=>b.onclick=()=>syncRecent());
    root.querySelectorAll('[data-z19-global-upload]').forEach(b=>b.onclick=()=>openGlobalUpload());
    root.querySelectorAll('[data-z19-upload-workspace]').forEach(b=>b.onclick=()=>startUploadForWorkspace?.(b.dataset.z19UploadWorkspace,{projectId:b.dataset.projectId,workItemId:b.dataset.workItemId,personalizationSaleId:b.dataset.saleId}));
    root.querySelectorAll('[data-z19-import-source]').forEach(b=>b.onclick=()=>runArtworkAction(b,()=>importSourceArtwork(b.dataset.z19ImportSource)));
    root.querySelectorAll('[data-z19-halftone-ready]').forEach(b=>b.onclick=()=>runArtworkAction(b,()=>finishHalftone(b.dataset.z19HalftoneReady)));
    root.querySelectorAll('[data-z19-standalone-halftone-ready]').forEach(b=>b.onclick=()=>finishStandaloneHalftone(b.dataset.z19StandaloneHalftoneReady));
    root.querySelectorAll('[data-z19-open]').forEach(b=>b.onclick=()=>nav('/ambiente/'+encodeURIComponent(b.dataset.z19Open)));
    root.querySelectorAll('[data-z19-times]').forEach(b=>b.onclick=()=>nav('/times'));
    root.querySelectorAll('[data-z19-film]').forEach(b=>b.onclick=()=>nav('/filme'));
    root.querySelectorAll('[data-z19-choose-font]').forEach(b=>b.onclick=()=>chooseFont(b.dataset.z19ChooseFont));
    root.querySelectorAll('[data-z19-team-film]').forEach(b=>b.onclick=()=>addTeamToFilm(b.dataset.z19TeamFilm));
    root.querySelectorAll('[data-z19-asset-film]').forEach(b=>b.onclick=()=>addAssetToFilm(b.dataset.z19AssetFilm));
    root.querySelectorAll('[data-z19-ready]').forEach(b=>b.onclick=()=>markReady(b.dataset.z19Ready,b));
    root.querySelectorAll('[data-z19-complete-item]').forEach(b=>b.onclick=()=>completeItem(b.dataset.z19CompleteItem,b));
    root.querySelectorAll('[data-z19-produced-item]').forEach(b=>b.onclick=()=>markItemProduced(b.dataset.z19ProducedItem,b));
    root.querySelectorAll('[data-z19-force-ready]').forEach(b=>b.onclick=()=>forceReady(b.dataset.z19ForceReady));
    root.querySelectorAll('[data-z19-notify]').forEach(b=>b.onclick=()=>notifyProject(b.dataset.z19Notify));
    root.querySelectorAll('[data-z19-delivered]').forEach(b=>b.onclick=()=>markDelivered(b.dataset.z19Delivered));
    root.querySelectorAll('[data-z19-reopen]').forEach(b=>b.onclick=()=>openReopenModal(b.dataset.z19Reopen));
    root.querySelectorAll('[data-z19-deadline]').forEach(b=>b.onclick=()=>openDeadlineModal(b.dataset.z19Deadline));
    root.querySelectorAll('[data-z19-pause]').forEach(b=>b.onclick=()=>openPauseModal(b.dataset.z19Pause,b.dataset.z19Paused==='true'));
    root.querySelectorAll('[data-z19-printer-pause]').forEach(b=>b.onclick=()=>openPauseModal(null,b.dataset.z19Paused==='true'));
    root.querySelectorAll('[data-z19-manage-reasons]').forEach(b=>b.onclick=()=>openReasonsManager());
    root.querySelectorAll('[data-z19-manage-holidays]').forEach(b=>b.onclick=()=>openHolidaysManager());
    root.querySelectorAll('[data-z19-wa]').forEach(b=>b.onclick=()=>{const d=digits(b.dataset.z19Wa),message=whatsappContactMessage(b.dataset.z19WaName,b.dataset.z19WaOrder);if(d)window.open('https://wa.me/'+(d.startsWith('55')?d:'55'+d)+'?text='+encodeURIComponent(message),'_blank','noopener,noreferrer')});
    root.querySelectorAll('[data-z19-wa-qr]').forEach(b=>b.onclick=()=>openWhatsappQr(b.dataset.z19WaQr));
    root.querySelectorAll('[data-z19-status-link]').forEach(button=>button.onclick=()=>{const phone=digits(button.dataset.z19StatusPhone),base='https://venduss.com/acompanhar-personalizacao/zero19',url=button.dataset.z19StatusLink?base+'/'+encodeURIComponent(button.dataset.z19StatusLink):base+'?codigo='+encodeURIComponent(button.dataset.z19StatusCode||''),message='Olá! Acompanhe o andamento do seu pedido #'+(button.dataset.z19StatusOrder||'')+' da ZERO19 neste link: '+url;if(phone)window.open('https://wa.me/'+(phone.startsWith('55')?phone:'55'+phone)+'?text='+encodeURIComponent(message),'_blank','noopener,noreferrer')});
  }
  async function renderQueue({loading=true}={}){
    if(loading){app.innerHTML=shell('<main class="container simple-container z19-zero19-page"><section class="production-home-loading" aria-live="polite"><span class="loading"></span><div><b>Abrindo a fila por etapas</b><small>Carregando somente os pedidos em aberto.</small></div></section></main>',{back:true});bindCommon()}
    let data;try{data=await load(true)}catch(error){console.error('production queue',error);app.innerHTML=shell('<main class="container simple-container z19-zero19-page"><section class="production-load-error"><h1>Não foi possível carregar a fila</h1><p>'+h(error?.message||'Falha de conexão')+'</p><button class="btn primary" data-production-retry>Tentar novamente</button></section></main>',{back:true});bindCommon();app.querySelector('[data-production-retry]').onclick=renderQueue;return}
    const c=counts(data.summaries,data.standaloneHalftones),hashQuery=(location.hash.split('?')[1]||''),hashParams=new URLSearchParams(hashQuery),stageParam=hashParams.get('stage')||'',orderParam=hashParams.get('pedido')||'',saved=stageParam||sessionStorage.getItem('z19-zero19-stage')||'';sessionStorage.removeItem('z19-zero19-stage');
    app.innerHTML=shell('<main class="container simple-container z19-zero19-page"><section class="simple-hero"><div><div class="eyebrow">Integração ZERO19</div><h1>Personalizações do PDV</h1><p>Uma única fila para arte, produção, conclusão e retirada.</p></div><div class="hero-actions"><button class="btn primary" data-z19-global-upload>＋ Subir arte</button><button class="btn" data-app-action="settings">Configurações</button></div></section><section class="z19-zero19-summary">'+STAGE_ORDER.map(stage=>'<button data-z19-jump="'+stage+'"><b>'+c[stage]+'</b><span>'+h(STAGE_LABELS[stage])+'</span></button>').join('')+'</section>'+STAGE_ORDER.map(stage=>{const rows=data.summaries.filter(x=>x.items.some(item=>item.stage===stage)),standalone=stage==='awaiting_halftone'?(data.standaloneHalftones||[]):[],total=rows.length+standalone.length;const standaloneHtml=standalone.map(asset=>'<article class="z19-zero19-card"><div class="z19-zero19-card-head"><div><div class="z19-zero19-order">HALFTONE AVULSO</div><h3>'+h(asset.name)+'</h3><small>Biblioteca ZERO19 · sem cliente vinculado</small></div><div><b>Aguardando halftone</b><small>1 arte</small></div></div><div class="z19-zero19-meta"><span>Pode vincular a um cliente depois</span></div><div class="z19-zero19-card-actions"><button class="btn" data-z19-open="'+h(asset.workspace_id)+'">Abrir arte</button><button class="btn primary" data-z19-standalone-halftone-ready="'+h(asset.id)+'">Halftone pronto</button></div></article>').join('');return '<section class="z19-zero19-section" id="z19-stage-'+stage+'"><div class="z19-zero19-section-head"><div><h2>'+h(STAGE_LABELS[stage])+'</h2><p>'+h(STAGE_HINTS[stage])+'</p></div><b>'+total+'</b></div><div class="z19-zero19-grid">'+(total?rows.map(card).join('')+standaloneHtml:'<div class="empty mini">Nenhum pedido nesta etapa.</div>')+'</div></section>'}).join('')+'</main>',{back:true});
    bindCommon();bindRoot(app);app.querySelectorAll('[data-z19-jump]').forEach(b=>b.onclick=()=>document.getElementById('z19-stage-'+b.dataset.z19Jump)?.scrollIntoView({behavior:'smooth',block:'start'}));
    if(saved)setTimeout(()=>document.getElementById('z19-stage-'+saved)?.scrollIntoView({behavior:'smooth',block:'start'}),50);
    if(orderParam){history.replaceState(null,'','#/zero19-fila');setTimeout(()=>openGlobalUpload(orderParam),60)}
  }
  function whatsappContactMessage(name,order){
    const hour=new Date().getHours(),greeting=hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite',firstName=String(name||'cliente').trim().split(/\s+/)[0]||'cliente';
    return greeting+', '+firstName+'! Tudo bem? Estou entrando em contato sobre o seu pedido #'+(order||'')+' da ZERO19.';
  }
  async function openWhatsappQr(projectId){
    const data=await load(true),summary=data.summaries.find(row=>row.project.id===projectId);if(!summary)return toast('Pedido não encontrado.','err');const workspace=summary.workspace||{},phone=digits(workspace.phone);if(!phone)return toast('Cliente sem WhatsApp cadastrado.','err');
    const message=whatsappContactMessage(workspace.client_name||workspace.company_name,orderNo(summary.project)),url='https://wa.me/'+(phone.startsWith('55')?phone:'55'+phone)+'?text='+encodeURIComponent(message),modal=document.createElement('div');modal.className='modal-backdrop';
    modal.innerHTML='<div class="modal compact z19-whatsapp-qr-modal" role="dialog" aria-modal="true"><div class="modal-head"><div><div class="eyebrow">WHATSAPP DO CLIENTE</div><h2>Aponte a câmera do celular</h2><p>'+h(workspace.client_name||workspace.company_name||'Cliente')+' · Pedido #'+h(orderNo(summary.project))+'</p></div><button class="btn ghost small close">×</button></div><div class="z19-whatsapp-qr"><span class="loading"></span><small>Gerando QR Code…</small></div><div class="z19-ready-message">'+h(message)+'</div><div class="modal-footer"><button class="btn close">Fechar</button><a class="btn whatsapp" href="'+h(url)+'" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a></div></div>';
    document.body.appendChild(modal);modal.querySelectorAll('.close').forEach(button=>button.onclick=()=>modal.remove());
    try{if(!window.Z19QRCode?.toDataURL)throw new Error('Gerador de QR indisponível');const image=await window.Z19QRCode.toDataURL(url,{width:360,margin:2,errorCorrectionLevel:'M',color:{dark:'#08110d',light:'#ffffff'}});const area=modal.querySelector('.z19-whatsapp-qr');if(area)area.innerHTML='<img src="'+h(image)+'" alt="QR Code para abrir o WhatsApp de '+h(workspace.client_name||workspace.company_name||'cliente')+'"><b>Leia com a câmera do celular</b>'}catch(error){modal.remove();toast('Não foi possível gerar o QR Code. Atualize a página e tente novamente.','err')}
  }
  async function renderDelivered(){
    app.innerHTML=shell('<main class="container simple-container z19-zero19-page"><section class="production-home-loading"><span class="loading"></span><div><b>Abrindo entregues</b><small>Buscando o histórico recente.</small></div></section></main>',{back:true});bindCommon();
    const owner=accountOwnerId(),itemsResult=await supabase.from('z19p_zero19_work_items').select('*').eq('owner_id',owner).eq('stage','delivered').order('delivered_at',{ascending:false,nullsFirst:false}).limit(300);
    if(itemsResult.error)throw itemsResult.error;
    const items=itemsResult.data||[],projectIds=[...new Set(items.map(item=>item.project_id).filter(Boolean))],projectsResult=projectIds.length?await supabase.from('z19p_projects').select('*').eq('owner_id',owner).in('id',projectIds):{data:[],error:null};
    if(projectsResult.error)throw projectsResult.error;
    const projects=projectsResult.data||[],workspaceIds=[...new Set(projects.map(project=>project.workspace_id).filter(Boolean))],workspacesResult=workspaceIds.length?await supabase.from('z19p_workspaces').select('*').eq('owner_id',owner).in('id',workspaceIds):{data:[],error:null};
    if(workspacesResult.error)throw workspacesResult.error;
    const workspaces=new Map((workspacesResult.data||[]).map(row=>[row.id,row])),groups=new Map();for(const item of items){if(!groups.has(item.project_id))groups.set(item.project_id,[]);groups.get(item.project_id).push(item)}
    const rows=projects.map(project=>({project,workspace:workspaces.get(project.workspace_id),items:groups.get(project.id)||[]})).filter(row=>row.items.length).sort((a,b)=>new Date(b.project.finalized_at||b.items[0]?.delivered_at||0)-new Date(a.project.finalized_at||a.items[0]?.delivered_at||0));
    app.innerHTML=shell('<main class="container simple-container z19-zero19-page"><section class="simple-hero"><div><div class="eyebrow">HISTÓRICO DA PRODUÇÃO</div><h1>Pedidos entregues</h1><p>Consulte entregas e recoloque um pedido no fluxo quando uma etapa tiver sido marcada por engano.</p></div><button class="btn" data-nav="/">Voltar à produção</button></section><section class="production-open-section"><div class="production-open-head"><div><h2>Entregues recentemente</h2><p>Mais recentes primeiro.</p></div><span>'+rows.length+'</span></div><div class="z19-zero19-grid">'+(rows.map(row=>'<article class="z19-zero19-card"><div class="z19-zero19-card-head"><div><div class="z19-zero19-order">PEDIDO #'+h(orderNo(row.project))+'</div><h3>'+h(row.workspace?.client_name||row.workspace?.company_name||'Cliente')+'</h3><small>'+h(row.workspace?.phone||'Sem WhatsApp')+'</small></div><div><b>Entregue</b><small>'+h(dt(row.project.finalized_at||row.items[0]?.delivered_at))+'</small></div></div><div class="z19-zero19-items">'+row.items.map(itemLine).join('')+'</div><div class="z19-zero19-card-actions"><button class="btn primary" data-archive-reopen="'+h(row.project.id)+'">Reabrir pedido</button></div></article>').join('')||'<div class="empty">Nenhum pedido entregue encontrado.</div>')+'</div></section></main>',{back:true});
    bindCommon();app.querySelectorAll('[data-archive-reopen]').forEach(button=>button.onclick=()=>openReopenModal(button.dataset.archiveReopen,{after:renderDelivered}));
  }
  function findWorkItem(data,id){return data.items.find(item=>item.id===id)}
  async function chooseUploadTarget(workspaceId,context={}){
    const data=await load(true),rows=data.summaries.filter(s=>s.workspace?.id===workspaceId).flatMap(summary=>summary.items.map(item=>({item,project:summary.project})));
    let candidates=rows.filter(({item,project})=>!['NAME_NUMBER','PHRASE'].includes(String(item.kind).toUpperCase())&&['awaiting_art','art_received','awaiting_halftone','ready_production'].includes(item.stage)&&(!context.projectId||project.id===context.projectId)&&(!context.workItemId||item.id===context.workItemId)&&(!context.personalizationSaleId||item.personalization_sale_id===context.personalizationSaleId)&&!(context.excludeSaleIds||[]).includes(item.personalization_sale_id));
    if(!candidates.length){
      const historical=(state().currentProjects||[]).some(p=>p.workspace_id===workspaceId&&p.official_order_ref);
      if(!context.projectId&&!historical&&!rows.length)return null;
      throw new Error('Não há uma personalização de arte disponível neste pedido. Escolha o item correto; nome/número deve usar Escolher fonte.');
    }
    if(context.workItemId&&candidates.length===1)return candidates[0];
    // Generic upload must explicitly choose the order and item, not the first
    // (possibly cancelled) historical project for this customer.
    return new Promise((resolve,reject)=>{
      const modal=document.createElement('div');modal.className='modal-backdrop';modal.style.zIndex='12000';
      modal.innerHTML='<section class="modal"><div class="modal-head"><div><div class="eyebrow">VINCULAR ARTE</div><h2>Qual personalização receberá este arquivo?</h2><p>Fonte e outras artes do pedido não serão alteradas.</p></div></div><div class="z19-transfer-list">'+candidates.map(({item,project},i)=>'<button class="z19-transfer-row" data-target="'+i+'"><b>Pedido #'+h(orderNo(project))+' · '+h(item.text_value||item.garment_name)+'</b><small>'+h(STAGE_LABELS[item.stage])+'</small></button>').join('')+'</div><div class="modal-footer"><button class="btn" data-cancel>Cancelar</button></div></section>';
      modal.querySelectorAll('[data-target]').forEach(button=>button.onclick=()=>{modal.remove();resolve(candidates[Number(button.dataset.target)])});modal.querySelector('[data-cancel]').onclick=()=>{modal.remove();reject(new Error('Upload cancelado antes de salvar o arquivo.'))};document.body.appendChild(modal);
    });
  }
  async function openGlobalUpload(initialQuery=''){
    await ensureAutomaticSync(true);
    const local=await load(true),modal=document.createElement('div');modal.className='modal-backdrop';
    let rows=[],offset=0,total=0,query=String(initialQuery||'').trim(),busy=false,searchTimer=null;
    const stageLabel=stage=>STAGE_LABELS[stage]||stage||'Ainda não sincronizado';
    const orderDate=value=>{const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):''};

    const choose=async row=>{
      if(busy)return;busy=true;draw();
      try{
        const result=await supabase.rpc('z19p_sync_zero19_order',{p_order_id:row.order_id});
        if(result.error)throw result.error;
        invalidate();const data=await load(true),projectId=result.data?.project_id,workspaceId=result.data?.workspace_id,summary=data.summaries.find(item=>item.project.id===projectId),pending=summary?.items.find(item=>item.stage==='awaiting_art')||summary?.items[0]||null;
        if(!workspaceId)throw new Error('Não encontrei o cliente deste pedido no Personalizações.');
        modal.remove();
        startUploadForWorkspace?.(workspaceId,{projectId,workItemId:pending?.id||null,personalizationSaleId:pending?.personalization_sale_id||null,orderId:row.order_id});
      }catch(error){busy=false;toast(error.message||'Não foi possível abrir este pedido.','err');draw()}
    };

    const draw=()=>{
      const list=rows.length?rows.map((row,index)=>'<button class="z19-transfer-row z19-order-picker-row" data-order-index="'+index+'" '+(busy?'disabled':'')+'><strong>Pedido #'+h(row.display_id||String(row.order_id).slice(0,8))+'</strong><b>'+h(row.customer_name||'Cliente')+'</b><span class="phone">'+h(row.whatsapp||'Sem WhatsApp')+'</span><small>'+h(orderDate(row.personalization_created_at||row.created_at))+' · '+h(row.personalization_count||1)+' personalização(ões) · '+h(stageLabel(row.integrated_stage))+'</small></button>').join(''):'<div class="empty mini">'+(query?'Nenhum pedido encontrado para esta busca.':'Nenhum pedido com personalização encontrado.')+'</div>';
      const canMore=offset+rows.length<total;
      modal.innerHTML='<div class="modal wide"><div class="modal-head"><div><div class="eyebrow">SUBIR ARTE</div><h2>Escolha o pedido da ZERO19</h2><p>Mostrando os pedidos mais recentes. Busque por nome, número do pedido ou WhatsApp.</p></div><button class="btn ghost small close">×</button></div><div class="z19-order-picker-toolbar"><div class="search">⌕<input data-order-search type="search" value="'+h(query)+'" placeholder="Nome, pedido ou WhatsApp"></div><span class="btn" style="pointer-events:none">'+h(total)+' encontrado(s)</span></div><div class="z19-transfer-list">'+list+'</div>'+(canMore?'<div class="z19-order-picker-footer"><button class="btn" data-order-more '+(busy?'disabled':'')+'>Carregar mais 30</button></div>':'')+(local.zero19Library?'<button class="z19-transfer-row" data-standalone-halftone style="width:100%;margin-top:12px"><b>Halftone avulso · sem cliente</b><span>Salvar direto na Biblioteca ZERO19.</span><small>Pode vincular ao cliente depois.</small></button>':'')+'<div class="modal-footer"><small style="margin-right:auto">A sincronização é automática; não precisa usar botão separado.</small><button class="btn close">Fechar</button></div></div>';
      modal.querySelectorAll('.close').forEach(button=>button.onclick=()=>!busy&&modal.remove());
      modal.querySelectorAll('[data-order-index]').forEach(button=>button.onclick=()=>choose(rows[Number(button.dataset.orderIndex)]));
      const input=modal.querySelector('[data-order-search]');
      if(input){input.oninput=()=>{query=input.value.trim();clearTimeout(searchTimer);searchTimer=setTimeout(()=>void fetchPage(true),260)};requestAnimationFrame(()=>{if(document.activeElement?.dataset?.orderSearch)input.setSelectionRange(input.value.length,input.value.length)})}
      modal.querySelector('[data-order-more]')?.addEventListener('click',()=>void fetchPage(false));
      const standalone=modal.querySelector('[data-standalone-halftone]');if(standalone)standalone.onclick=()=>{modal.remove();startStandaloneHalftone?.(local.zero19Library.id)};
    };

    const fetchPage=async reset=>{
      if(busy)return;busy=true;if(reset){offset=0;rows=[]}draw();
      const {data,error}=await supabase.rpc('z19p_zero19_order_picker',{p_limit:30,p_offset:offset,p_query:query||null});
      if(error){busy=false;toast(error.message,'err');draw();return}
      const next=Array.isArray(data?.rows)?data.rows:[];total=Number(data?.total)||0;
      if(reset)rows=next;else rows=[...rows,...next];
      offset=rows.length;busy=false;draw();
    };

    document.body.appendChild(modal);draw();await fetchPage(true);
  }
  async function sourceImageSize(blob){
    if(!String(blob.type||'').startsWith('image/'))return {width:null,height:null};
    const url=URL.createObjectURL(blob);
    try{const img=new Image();img.src=url;await img.decode();return {width:img.naturalWidth||null,height:img.naturalHeight||null}}finally{URL.revokeObjectURL(url)}
  }
  async function ensureDtfProfile(item,asset){
    const production=item.metadata?.details?.[0]?.production||{},ratio=(Number(asset.width)||0)/(Number(asset.height)||1);
    let width=Number(production.width_cm)||0,height=Number(production.height_cm)||0;
    if(width>0&&!(height>0)&&ratio>0)height=width/ratio;
    if(height>0&&!(width>0)&&ratio>0)width=height*ratio;
    if(!(width>0&&height>0))throw new Error('Este DTF ainda não tem medida física completa. Abra a arte e defina largura ou altura antes de liberar.');
    const owner=accountOwnerId(),actor=state().session?.user?.id||owner,payload={asset_id:asset.id,owner_id:owner,project_id:item.project_id||null,default_width_cm:width,default_height_cm:height,aspect_ratio:ratio>0?ratio:width/height,halftone:Boolean(production.needs_halftone),allow_internal_nesting:!production.needs_halftone,rotation_policy:'180',ready_for_print:true,created_by:actor,updated_by:actor,updated_at:new Date().toISOString()};
    const result=await supabase.from('z19p_asset_print_profiles').upsert(payload,{onConflict:'asset_id'});if(result.error)throw result.error;return payload;
  }
  async function runArtworkAction(button,action){
    if(button.disabled)return;const label=button.textContent;button.disabled=true;button.textContent='Abrindo arte…';
    try{await action()}catch(error){console.error('organize artwork',error);toast(error.message||'Não foi possível abrir a arte. Tente novamente.','err')}
    finally{button.disabled=false;button.textContent=label}
  }
  function orderArtworkItems(summary){return summary.items.filter(item=>(item.source_file_path||item.asset_id)&&!['cancelled','delivered'].includes(item.stage))}
  async function openOrderArtworkPicker(summary){
    const modal=document.createElement('div');modal.className='modal-backdrop z19-order-art-picker';
    let busy=false;
    const closed=new Promise(resolve=>{
      const draw=()=>{
        const items=orderArtworkItems(summary);
        modal.innerHTML='<section class="modal"><div class="modal-head"><div><div class="eyebrow">ARTES DO PEDIDO #'+h(orderNo(summary.project))+'</div><h2>'+items.length+' artes / posições</h2><p>Cada posição tem seu próprio arquivo e tamanho. Escolha uma arte para organizar; as outras continuam nesta lista.</p></div><button class="btn ghost" data-close>Fechar</button></div><div class="z19-order-art-list">'+items.map(item=>{
          const p=item.metadata?.details?.[0]?.production||{},editable=['art_received','awaiting_halftone','ready_production'].includes(item.stage);
          return '<article class="z19-order-art-row"><span class="z19-art-placeholder" data-preview="'+h(item.id)+'">ARTE</span><div><b>'+h(item.text_value||p.position_label||'Arte do pedido')+'</b><small>'+h([p.position_label,item.garment_name,item.garment_size].filter(Boolean).join(' · '))+'</small><small>'+h(STAGE_LABELS[item.stage]||item.stage)+'</small>'+(p.width_cm||p.height_cm?'<small>Medida do PDV: '+h(p.width_cm||'proporcional')+' × '+h(p.height_cm||'proporcional')+' cm · ajustes já salvos são mantidos</small>':'')+'<button class="btn primary" data-organize="'+h(item.id)+'" '+(!editable?'disabled':'')+'>'+(editable?(item.stage==='ready_production'?'Revisar arte e medidas':'Importar e organizar'):'Já encaminhada à produção')+'</button></div></article>';
        }).join('')+'</div><p class="z19-inline-error" data-error role="alert" hidden></p></section>';
        modal.querySelector('[data-close]').onclick=()=>{if(!busy){modal.remove();resolve()}};
        modal.querySelectorAll('[data-organize]').forEach(button=>button.onclick=async()=>{
          if(busy)return;busy=true;const original=button.textContent;button.textContent='Abrindo arte…';modal.querySelectorAll('button').forEach(b=>b.disabled=true);
          const errorBox=modal.querySelector('[data-error]');errorBox.hidden=true;
          try{const review=await importSourceArtwork(button.dataset.organize,{single:true});const latest=await load(true);summary=latest.summaries.find(s=>s.project.id===summary.project.id)||summary;
            if(review?.completed&&orderArtworkItems(summary).every(item=>['ready_production','production'].includes(item.stage))){modal.remove();resolve();toast('Revisão concluída. Artes prontas em Aguardando produção.','ok');}
            else draw();}
          catch(error){errorBox.textContent=error.message||'Não foi possível organizar esta arte.';errorBox.hidden=false;errorBox.scrollIntoView({block:'nearest'});button.textContent=original;modal.querySelectorAll('button').forEach(b=>b.disabled=false)}
          finally{busy=false}
        });
        for(const item of items){if(!item.source_file_path)continue;void supabase.storage.from(item.source_bucket||'personalization-artwork').createSignedUrl(item.source_file_path,600).then(result=>{
          const placeholder=modal.querySelector('[data-preview="'+item.id+'"]');if(!placeholder||result.error||!result.data?.signedUrl)return;
          const img=document.createElement('img');img.width=64;img.height=64;img.loading='lazy';img.decoding='async';img.alt=item.text_value||'Arte';img.src=result.data.signedUrl;img.onerror=()=>img.replaceWith(placeholder);placeholder.replaceWith(img);
        }).catch(()=>{})}
      };
      document.body.appendChild(modal);draw();
    });
    await closed;
  }
  async function resolveOrderArtwork(projectId,saleId){
    const data=await load(true),item=data.items?.find(row=>row.project_id===projectId&&row.personalization_sale_id===saleId)||data.summaries.find(s=>s.project.id===projectId)?.items.find(row=>row.personalization_sale_id===saleId);
    if(!item||!['art_received','ready_production'].includes(item.stage)||item.without_application)throw new Error('Esta posição ainda não está disponível para organizar. Confira o arquivo e a etapa do pedido.');
    return importSourceArtwork(item.id,{single:true,prepareOnly:true});
  }
  async function importSourceArtwork(workItemId,{single=false,prepareOnly=false}={}){
    const data=await load(true),item=findWorkItem(data,workItemId);if(!item)return toast('Item não encontrado.','err');
    const summary=data.summaries.find(row=>row.project.id===item.project_id);if(!summary)return toast('Pedido não encontrado.','err');
    if(!single&&orderArtworkItems(summary).length>1)return openOrderArtworkPicker(summary);
    if(item.asset_id){
      if(!prepareOnly)return finishHalftone(item.id);
      const result=await supabase.from('z19p_assets').select('*').eq('id',item.asset_id).eq('owner_id',accountOwnerId()).single();if(result.error)throw result.error;return result.data;
    }
    if(!item.source_file_path){startUploadForWorkspace?.(summary.workspace.id,{projectId:summary.project.id,workItemId:item.id,personalizationSaleId:item.personalization_sale_id});return}
    try{
      const production=item.metadata?.details?.[0]?.production||{};
      const downloaded=await supabase.storage.from('personalization-artwork').download(item.source_file_path);if(downloaded.error)throw downloaded.error;
      const blob=downloaded.data,dims=await sourceImageSize(blob),assetId=crypto.randomUUID(),owner=accountOwnerId(),actor=state().session?.user?.id||owner;
      const ext=(item.source_file_path.split('.').pop()||'bin').replace(/[^a-z0-9]/gi,'').toLowerCase()||'bin';
      const path=actor+'/'+summary.workspace.id+'/pdv-import/'+assetId+'/original.'+ext;
      const uploaded=await supabase.storage.from(bucket).upload(path,blob,{contentType:blob.type||'application/octet-stream',upsert:false});if(uploaded.error)throw uploaded.error;
      const row={id:assetId,owner_id:owner,workspace_id:summary.workspace.id,project_id:summary.project.id,folder_id:null,name:item.text_value||'Arte do pedido #'+orderNo(summary.project),asset_type:'arte',original_path:path,processed_path:path,mime_type:blob.type||'application/octet-stream',size_bytes:blob.size,width:dims.width,height:dims.height,dpi:300,alpha_trimmed:false,background_removed:false,maximized:false,metadata:{imported_from_zero19_pdv:true,personalization_sale_id:item.personalization_sale_id,needs_halftone:item.stage==='awaiting_halftone'||Boolean(production.needs_halftone),source_file_path:item.source_file_path,pdv_position_code:production.position_code||null,pdv_position_label:production.position_label||null,pdv_width_cm:Number(production.width_cm)||null,pdv_height_cm:Number(production.height_cm)||null,pdv_art_source:production.art_source||null,pdv_existing_workspace_id:production.existing_workspace_id||null},created_by:actor,updated_by:actor};
      const saved=await supabase.from('z19p_assets').insert(row).select('*').single();if(saved.error)throw saved.error;
      const linked=await supabase.from('z19p_zero19_work_items').update({asset_id:assetId,updated_at:new Date().toISOString()}).eq('id',item.id).eq('owner_id',owner);if(linked.error)throw linked.error;
      invalidate();
      if(prepareOnly)return saved.data;
      if(item.stage==='awaiting_halftone'){toast('Arte importada. Faça o halftone e depois use “Halftone pronto”.','ok');nav('/ambiente/'+summary.workspace.id);return}
      if(item.without_application){await ensureDtfProfile(item,saved.data);const reviewed=await supabase.rpc('z19p_zero19_mark_art_reviewed',{p_work_item_id:item.id,p_asset_id:assetId});if(reviewed.error)throw reviewed.error;invalidate();toast('DTF liberado para Aguardando produção.','ok');if(productionViewActive())await refreshProductionViewAt(window.scrollY);return}
      const review=await offerAfterUpload?.([saved.data],{workspace:summary.workspace,projects:[summary.project],allowWithoutOrder:true,reviewRefs:orderArtworkItems(summary).filter(row=>!row.without_application&&['art_received','ready_production'].includes(row.stage)).map(row=>row.personalization_sale_id)});
      invalidate();if(productionViewActive())await refreshProductionViewAt(window.scrollY);
      return review;
    }catch(error){console.error('import zero19 artwork',error);throw error}
  }
  async function finishHalftone(workItemId){
    const data=await load(true),item=findWorkItem(data,workItemId);if(!item)return toast('Item não encontrado.','err');
    const summary=data.summaries.find(row=>row.project.id===item.project_id);if(!summary)return;
    if(!item.asset_id)return importSourceArtwork(item.id,{single:true});
    const asset=await supabase.from('z19p_assets').select('*').eq('id',item.asset_id).eq('owner_id',accountOwnerId()).single();if(asset.error)return toast(asset.error.message,'err');
    if(asset.data?.metadata?.personalization_sale_id&&asset.data.metadata.personalization_sale_id!==item.personalization_sale_id)throw new Error('Esta arte está vinculada a outra posição do pedido. O vínculo precisa ser corrigido antes de continuar.');
    if(item.without_application){try{await ensureDtfProfile(item,asset.data)}catch(error){return toast(error.message,'err')}const reviewed=await supabase.rpc('z19p_zero19_mark_art_reviewed',{p_work_item_id:item.id,p_asset_id:item.asset_id});if(reviewed.error)return toast(reviewed.error.message,'err');invalidate();toast('Halftone liberado para Aguardando produção.','ok');if(productionViewActive())return refreshProductionViewAt(window.scrollY);return}
    const review=await offerAfterUpload?.([asset.data],{workspace:summary.workspace,projects:[summary.project],allowWithoutOrder:true,reviewRefs:orderArtworkItems(summary).filter(row=>!row.without_application&&['art_received','ready_production'].includes(row.stage)).map(row=>row.personalization_sale_id)});invalidate();if(productionViewActive())await refreshProductionViewAt(window.scrollY);return review;
  }
  async function finishStandaloneHalftone(assetId){
    const data=await load(true),asset=(data.standaloneHalftones||[]).find(row=>row.id===assetId);if(!asset)return toast('Halftone avulso não encontrado.','err');
    const metadata={...(asset.metadata||{}),standalone_halftone_pending:false,standalone_halftone_completed_at:new Date().toISOString()};
    const result=await supabase.from('z19p_assets').update({metadata,updated_at:new Date().toISOString()}).eq('id',assetId).eq('owner_id',accountOwnerId());if(result.error)return toast(result.error.message,'err');
    invalidate();toast('Halftone concluído. A arte continua na Biblioteca ZERO19 para você transferir quando quiser.','ok');if(productionViewActive())await refreshProductionViewAt(window.scrollY);
  }
  async function chooseFont(workItemId){
    if(!workItemId)return;
    const owner=accountOwnerId(),[setsResult,kitsResult,teamsResult]=await Promise.all([
      supabase.from('z19p_customization_sets').select('id,kit_id,name,default_name_height_cm,default_number_height_cm,tested_at,status').eq('owner_id',owner).eq('status','ready').not('tested_at','is',null),
      supabase.from('z19p_team_kits').select('id,team_id,name,season,active').eq('owner_id',owner).eq('active',true),
      supabase.from('z19p_teams').select('id,name,active').eq('owner_id',owner).eq('active',true)
    ]);
    const error=setsResult.error||kitsResult.error||teamsResult.error;if(error)return toast(error.message,'err');
    const kits=new Map((kitsResult.data||[]).map(row=>[row.id,row])),teams=new Map((teamsResult.data||[]).map(row=>[row.id,row]));
    const fonts=(setsResult.data||[]).map(set=>{const kit=kits.get(set.kit_id),team=teams.get(kit?.team_id);return {...set,kit,team,label:[team?.name,kit?.season,kit?.name,set.name].filter(Boolean).join(' · ')}}).filter(row=>row.kit&&row.team).sort((a,b)=>a.label.localeCompare(b.label,'pt-BR'));
    const modal=document.createElement('div');modal.className='modal-backdrop';
    modal.innerHTML='<div class="modal compact"><div class="modal-head"><div><div class="eyebrow">Camisa de time</div><h2>Escolher fonte</h2><p>A fonte precisa estar testada e liberada.</p></div><button class="btn ghost small close">×</button></div><div class="field"><label>Fonte / temporada</label><select data-font-select><option value="">Escolha</option>'+fonts.map(font=>'<option value="'+h(font.id)+'">'+h(font.label)+'</option>').join('')+'</select></div><div class="modal-footer"><button class="btn close">Cancelar</button><button class="btn primary" data-font-confirm disabled>Usar esta fonte</button></div></div>';
    document.body.appendChild(modal);modal.querySelectorAll('.close').forEach(b=>b.onclick=()=>modal.remove());
    const select=modal.querySelector('[data-font-select]'),button=modal.querySelector('[data-font-confirm]');select.onchange=()=>button.disabled=!select.value;
    button.onclick=async()=>{button.disabled=true;const result=await supabase.rpc('z19p_zero19_set_font',{p_work_item_id:workItemId,p_font_set_id:select.value});if(result.error){button.disabled=false;return toast(result.error.message,'err')}modal.remove();invalidate();toast('Fonte definida para esta personalização. As demais pendências do pedido foram mantidas.','ok');if(productionViewActive())await refreshProductionViewAt(window.scrollY)};
  }
  const vendussImports=new Map();
  async function importVendussOrderAsset(item,summary){
    if(vendussImports.has(item.id))return vendussImports.get(item.id);
    const task=(async()=>{
      const owner=accountOwnerId(),actor=state().session?.user?.id,assetId=crypto.randomUUID(),production=item.metadata?.details?.[0]?.production||{};
      const path=owner+'/'+summary.workspace.id+'/venduss-order/'+assetId+'/prepared.png';
      let uploaded=false,saved=false;
      const checkAccount=()=>{if(owner!==accountOwnerId()||actor!==state().session?.user?.id)throw new Error('A conta mudou. Abra o pedido novamente.');};
      try{
        const downloaded=await supabase.storage.from('venduss-print-artworks').download(item.source_file_path);if(downloaded.error)throw downloaded.error;
        checkAccount();const blob=downloaded.data,dims=await sourceImageSize(blob);
        const result=await supabase.storage.from(bucket).upload(path,blob,{contentType:'image/png',upsert:false});if(result.error)throw result.error;uploaded=true;checkAccount();
        const asset={id:assetId,owner_id:owner,workspace_id:summary.workspace.id,project_id:summary.project.id,name:item.text_value||'Estampa Venduss',asset_type:'arte',original_path:path,processed_path:path,mime_type:'image/png',size_bytes:blob.size,width:dims.width,height:dims.height,dpi:300,alpha_trimmed:true,created_by:actor,updated_by:actor,metadata:{venduss_order_id:production.venduss_order_id,personalization_sale_id:item.personalization_sale_id,print_position_code:production.position_code,print_position_label:production.position_label,source_file_path:item.source_file_path}};
        const insert=await supabase.from('z19p_assets').insert(asset);if(insert.error)throw insert.error;saved=true;
        await ensureDtfProfile(item,asset);checkAccount();
        const linked=await supabase.from('z19p_zero19_work_items').update({asset_id:assetId,updated_at:new Date().toISOString()}).eq('id',item.id).eq('owner_id',owner).is('asset_id',null).select('asset_id').maybeSingle();if(linked.error)throw linked.error;
        if(!linked.data){
          await supabase.from('z19p_assets').delete().eq('id',assetId);saved=false;
          await supabase.storage.from(bucket).remove([path]);uploaded=false;
          const current=await supabase.from('z19p_zero19_work_items').select('asset_id').eq('id',item.id).single();if(current.error||!current.data?.asset_id)throw current.error||new Error('Atualize o pedido e tente novamente.');
          return current.data.asset_id;
        }
        invalidate();return assetId;
      }catch(error){
        if(saved)await supabase.from('z19p_assets').delete().eq('id',assetId);
        if(uploaded)await supabase.storage.from(bucket).remove([path]);
        throw error;
      }
    })();
    vendussImports.set(item.id,task);
    try{return await task;}finally{vendussImports.delete(item.id);}
  }
  async function pendingVendussFilmRows(){
    const data=await load(true);
    return data.items.filter(item=>item.stage==='ready_production'&&item.metadata?.details?.[0]?.production?.storage_bucket==='venduss-print-artworks').map(item=>({...item,summary:data.summaries.find(row=>row.project.id===item.project_id)})).filter(item=>item.summary);
  }
  async function pendingVdrFilmRows(){
    const data=await load(true);
    return data.items.filter(item=>{const p=item.metadata?.details?.[0]?.production;return item.stage==='ready_production'&&item.asset_id&&(p?.vdr_bundle_id||p?.checkout_application_id&&p?.art_source==='CHECKOUT_CATALOG_ASSET');}).map(item=>({...item,summary:data.summaries.find(row=>row.project.id===item.project_id)})).filter(item=>item.summary);
  }
  async function refreshArtworkPreview(workItemId){
    const owner=accountOwnerId(),actor=state().session?.user?.id;
    const current=()=>owner===accountOwnerId()&&actor===state().session?.user?.id;
    const result=await supabase.from('z19p_zero19_work_items').select('id,owner_id,source_file_path,metadata').eq('id',workItemId).eq('owner_id',owner).single();
    if(result.error)throw result.error;
    const [row]=await hydrateProductionArtworkPreviews({supabase,items:[result.data],isCurrent:current});
    if(!row?._artworkPreview)throw new Error(row?._artworkPreviewError||'Não foi possível carregar o PNG preparado deste pedido.');
    return row._artworkPreview;
  }
  async function prepareVdrFilmItem(workItemId){
    const owner=accountOwnerId(),item=(await pendingVdrFilmRows()).find(row=>row.id===workItemId);
    if(!item)throw new Error('A estampa deste pedido não está mais aguardando produção. Atualize a seleção.');
    const production=item.metadata?.details?.[0]?.production||{},width=Number(production.width_cm),height=Number(production.height_cm);
    if(!(width>0&&height>0))throw new Error('Confira as medidas desta aplicação antes de montar o filme.');
    const [asset,current]=await Promise.all([supabase.from('z19p_assets').select('*').eq('id',item.asset_id).eq('owner_id',owner).single(),supabase.from('z19p_zero19_work_items').select('stage,asset_id,metadata').eq('id',item.id).eq('owner_id',owner).single()]);
    if(asset.error||current.error)throw asset.error||current.error;
    if(owner!==accountOwnerId()||current.data.stage!=='ready_production'||current.data.asset_id!==item.asset_id||JSON.stringify(current.data.metadata?.details?.[0]?.production)!==JSON.stringify(production))throw new Error('O pedido ou a liberação mudou. Abra a seleção novamente.');
    const storageBucket=production.storage_bucket||asset.data.metadata?.storage_bucket||'z19p-assets';
    if(!['z19p-private','z19p-assets'].includes(storageBucket))throw new Error('O armazenamento desta aplicação VDR não está disponível para o filme. Confira a arte vinculada.');
    // A later library edit must not replace the prepared PNG sold in this order.
    // Clone for selection only; keep the reusable asset and its profile intact.
    const filmAsset={...asset.data,processed_path:production.file_path||asset.data.processed_path,metadata:{...asset.data.metadata,storage_bucket:storageBucket}};
    const companyName=item.summary.workspace?.client_name||item.summary.workspace?.company_name||'Cliente ZERO19';
    // Per-order measures must never overwrite the reusable source-art profile.
    const profile={asset_id:asset.data.id,default_width_cm:width,default_height_cm:height,aspect_ratio:width/height,halftone:Boolean(production.needs_halftone),rotation_policy:'180',allow_internal_nesting:!production.needs_halftone,ready_for_print:true};
    return {...filmItemFromLibraryAsset(filmAsset,profile,{quantity:item.quantity,companyName}),storageBucket,officialProjectId:item.project_id,officialOrderRef:orderNo(item.summary.project),externalOrderItemRef:item.personalization_sale_id,productionGroupKeys:['order:'+item.project_id],zero19WorkItemId:item.id};
  }
  // Estúdio no filme (09/10): mesma preparação de PNG 300 DPI do PDV (zero19-vdr-import-art).
  // Medida por aplicação no filme; a arte padrão e o original privado não são alterados.
  async function prepareStudioArtFilmItem({printId,printName,heightCm,quantity}){
    const owner=accountOwnerId(),height=Number(heightCm),qty=Number(quantity);
    if(!(height>=1&&height<=100))throw new Error('Altura da estampa entre 1 e 100 cm.');
    if(!Number.isSafeInteger(qty)||qty<1)throw new Error('Quantidade inválida.');
    const call=async body=>{
      const {data,error}=await supabase.functions.invoke('zero19-vdr-import-art',{body:{tenant_id:ZERO19_TENANT_ID,political_print_id:printId,...body}});
      if(error){let message=error.message;try{const detail=await error.context?.json?.();if(detail?.error)message=detail.error}catch{}throw new Error((printName?printName+': ':'')+(message||'não foi possível preparar a estampa.'))}
      if(data?.error)throw new Error((printName?printName+': ':'')+data.error);return data;
    };
    let asset=(await call({action:'default'})).asset;
    if(!asset?.id)asset=(await call({action:'import',dimension:'height',size_cm:height})).asset;
    if(!asset?.id)throw new Error('A estampa '+(printName||'')+' não voltou preparada. Tente novamente.');
    const row=await supabase.from('z19p_assets').select('*').eq('id',asset.id).eq('owner_id',owner).single();
    if(row.error)throw row.error;if(owner!==accountOwnerId())throw new Error('A conta mudou. Abra o estúdio novamente.');
    const storageBucket=asset.storage_bucket||row.data.metadata?.storage_bucket||'z19p-assets';
    if(!['z19p-private','z19p-assets'].includes(storageBucket))throw new Error('O armazenamento desta estampa não está disponível para o filme.');
    const ratio=Number(asset.width_cm)>0&&Number(asset.height_cm)>0?Number(asset.width_cm)/Number(asset.height_cm):Number(row.data.width)/Number(row.data.height);
    if(!(ratio>0))throw new Error('A estampa não tem proporção válida.');
    const filmAsset={...row.data,processed_path:asset.path||row.data.processed_path,metadata:{...row.data.metadata,storage_bucket:storageBucket}};
    const profile={asset_id:row.data.id,default_width_cm:height*ratio,default_height_cm:height,aspect_ratio:ratio,halftone:false,rotation_policy:'180',allow_internal_nesting:true,ready_for_print:true};
    const item={...filmItemFromLibraryAsset(filmAsset,profile,{quantity:qty,companyName:'Estúdio'}),storageBucket,studioPrintId:printId};
    if(printName)item.label='Estúdio • '+printName+' • '+String(height).replace('.',',')+' cm';
    return item;
  }
  async function prepareVendussFilmItem(workItemId){
    const owner=accountOwnerId(),item=(await pendingVendussFilmRows()).find(row=>row.id===workItemId);
    if(!item)throw new Error('O pedido Venduss não está mais aguardando produção. Atualize a seleção.');
    const assetId=item.asset_id||await importVendussOrderAsset(item,item.summary);
    const [asset,profile,current]=await Promise.all([
      supabase.from('z19p_assets').select('*').eq('id',assetId).eq('owner_id',owner).single(),
      supabase.from('z19p_asset_print_profiles').select('*').eq('asset_id',assetId).eq('owner_id',owner).single(),
      supabase.from('z19p_zero19_work_items').select('stage').eq('id',item.id).eq('owner_id',owner).single()
    ]);
    if(asset.error||profile.error||current.error)throw asset.error||profile.error||current.error;
    if(owner!==accountOwnerId()||current.data.stage!=='ready_production')throw new Error('A liberação ou a conta mudou. Abra a seleção novamente.');
    const production=item.metadata?.details?.[0]?.production||{},companyName='Venduss #'+(production.venduss_display_id||orderNo(item.summary.project));
    return {...filmItemFromLibraryAsset(asset.data,profile.data,{quantity:item.quantity,companyName}),
      officialProjectId:item.project_id,officialOrderRef:orderNo(item.summary.project),
      externalOrderItemRef:item.personalization_sale_id,productionGroupKeys:['order:'+item.project_id],zero19WorkItemId:item.id};
  }
  async function addAssetToFilm(workItemId){
    const data=await load(true),item=findWorkItem(data,workItemId);if(!item)return toast('DTF não encontrado.','err');
    const summary=data.summaries.find(row=>row.project.id===item.project_id);if(!summary)return toast('Pedido não encontrado.','err');
    if(item.stage!=='ready_production')return toast('Este pedido ainda não está liberado para entrar no filme.','err');
    let assetId=item.asset_id;
    if(!assetId&&item.metadata?.details?.[0]?.production?.storage_bucket==='venduss-print-artworks'){
      try{assetId=await importVendussOrderAsset(item,summary);}catch(error){return toast(error.message||'Não foi possível preparar a estampa Venduss.','err');}
    }
    if(!assetId)return toast('Este DTF ainda não possui arte vinculada.','err');
    queueAssetToFilm?.({
      workItemId:item.id,projectId:summary.project.id,orderRef:orderNo(summary.project),
      personalizationSaleId:item.personalization_sale_id,clientName:summary.workspace?.client_name||summary.workspace?.company_name||'Cliente ZERO19',
      assetId,quantity:item.quantity||1,vdrBundleId:item.metadata?.details?.[0]?.production?.vdr_bundle_id||null
    });
  }
  async function addTeamToFilm(workItemId){
    const data=await load(true),item=findWorkItem(data,workItemId);if(!item)return toast('Personalização não encontrada.','err');
    const summary=data.summaries.find(row=>row.project.id===item.project_id);if(!summary)return toast('Pedido não encontrado.','err');
    const production=item.metadata?.details?.[0]?.production||{},fontSetId=item.metadata?.font_set_id||production.font_set_id;
    if(!fontSetId)return chooseFont(item.id);
    queueTeamToFilm?.({
      workItemId:item.id,projectId:summary.project.id,orderRef:orderNo(summary.project),
      personalizationSaleId:item.personalization_sale_id,clientName:summary.workspace?.client_name||summary.workspace?.company_name||'Cliente ZERO19',
      fontSetId,name:production.top_text||'',number:production.number||'',quantity:item.quantity||1,letteringRevision:item.metadata?.lettering_revision??null,applicationQuantity:Number(item.quantity)||1,letteringProductionSnapshot:structuredClone(production),letterHeightCm:production.letter_height_cm||production.name_height_cm||null,nameMaxWidthCm:production.name_max_width_cm||production.max_text_width_cm||null
    });
  }
  async function markFontReady(id){
    if(!id)return;const {error}=await supabase.rpc('z19p_zero19_mark_font_ready',{p_work_item_id:id});if(error)return toast(error.message,'err');invalidate();toast('Fonte liberada. Pedido movido para Aguardando produção.','ok');if(productionViewActive())await refreshProductionViewAt(window.scrollY);
  }
  function confirmAction({eyebrow='CONFIRMAR AÇÃO',title,message,confirmLabel='Confirmar',danger=false}){
    return new Promise(resolve=>{
      const modal=document.createElement('div');modal.className='modal-backdrop';let finished=false;
      const close=value=>{if(finished)return;finished=true;modal.remove();resolve(value)};
      modal.innerHTML='<div class="modal compact" role="dialog" aria-modal="true"><div class="modal-head"><div><div class="eyebrow">'+h(eyebrow)+'</div><h2>'+h(title)+'</h2></div><button class="btn ghost small" data-confirm-no aria-label="Fechar">×</button></div><p>'+h(message)+'</p><div class="modal-footer"><button class="btn" data-confirm-no>Cancelar</button><button class="btn '+(danger?'danger':'primary')+'" data-confirm-yes>'+h(confirmLabel)+'</button></div></div>';
      document.body.appendChild(modal);modal.querySelectorAll('[data-confirm-no]').forEach(button=>button.onclick=()=>close(false));modal.querySelector('[data-confirm-yes]').onclick=()=>close(true);modal.onclick=event=>{if(event.target===modal)close(false)};modal.onkeydown=event=>{if(event.key==='Escape')close(false)};modal.querySelector('[data-confirm-yes]').focus();
    });
  }
  async function forceReady(projectId){
    if(!projectId||!await confirmAction({eyebrow:'FINALIZAR PEDIDO INTEIRO',title:'Todas as personalizações estão concluídas?',message:'Esta ação conclui TODAS, inclusive itens que aparecem com pendências. Para concluir apenas uma, use o botão Já está pronta ao lado dela. Confirme somente se o pedido inteiro já estiver pronto.',confirmLabel:'Sim, todas estão prontas'}))return;
    const {error}=await supabase.rpc('z19p_zero19_force_stage',{p_project_id:projectId,p_stage:'ready_pickup'});
    if(error)return toast(error.message,'err');
    invalidate();toast('Pedido finalizado e movido para Pronto para retirada.','ok');
    if(productionViewActive())await refreshProductionViewAt(window.scrollY);else enhanceDashboard();
  }
  async function completeItem(id,button){
    if(!await confirmAction({title:'Concluir esta personalização?',message:'Confirme somente se esta personalização já foi produzida. As outras continuarão nas suas etapas.',confirmLabel:'Sim, foi produzida'}))return;
    const scrollTop=window.scrollY;button.disabled=true;
    try{
      const {error}=await supabase.rpc('z19p_zero19_complete_work_item',{p_work_item_id:id});if(error)throw error;
      invalidate();toast('Personalização concluída. As demais etapas foram preservadas.','ok');await refreshProductionViewAt(scrollTop);
    }catch(error){toast(error.message,'err');button.disabled=false;}
  }
  async function markItemProduced(id,button,isCurrent=()=>true){
    const actor=state()?.session?.user?.id,account=accountOwnerId();
    if(!id||!actor||!account||!isCurrent()||producedItemLocks.has(id)||button?.disabled)return false;
    producedItemLocks.add(id);if(button)button.disabled=true;
    const scrollTop=window.scrollY;
    try{
      const confirmed=await confirmAction({eyebrow:'APLICAÇÃO JÁ PRODUZIDA',title:'Esta aplicação já foi produzida?',message:'Ela sairá da fila; demais aplicações permanecem. Confirme somente se esta aplicação já está pronta, não apenas o arquivo da arte.',confirmLabel:'Sim, já está pronta'});
      if(!confirmed||!isCurrent()||actor!==state()?.session?.user?.id||account!==accountOwnerId())return false;
      const {error}=await supabase.rpc('z19p_zero19_mark_work_item_produced',{p_work_item_id:id});if(error)throw error;
      invalidate();toast('Aplicação concluída. As demais aplicações permanecem no fluxo.','ok');
      if(productionViewActive())await refreshProductionViewAt(scrollTop);
      return true;
    }catch(error){toast(error?.message||'Não foi possível concluir esta aplicação. Tente novamente.','err');return false;}
    finally{producedItemLocks.delete(id);if(button)button.disabled=false;}
  }
  async function refreshProductionViewAt(scrollTop){
    if(location.hash.includes('/zero19-fila'))await renderQueue({loading:false});else await renderHome({loading:false});
    requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo(0,Math.max(0,scrollTop||0))));
  }
  async function markReady(projectId,button){
    const data=await load(),summary=data.summaries.find(x=>x.project.id===projectId);if(!summary)return;
    const scrollTop=window.scrollY;if(button){button.disabled=true;button.textContent='Atualizando…'}
    const {error}=await supabase.rpc('z19p_zero19_mark_ready',{p_project_id:projectId});if(error){if(button){button.disabled=false;button.textContent='Marcar como pronto'}return toast(error.message,'err')}
    invalidate();toast('Pedido marcado como pronto para retirada.','ok');await refreshProductionViewAt(scrollTop);openReadyModal(summary);
  }
  function openReadyModal(summary){
    const w=summary.workspace||{},message=notifyMessage(w.client_name||w.company_name),modal=document.createElement('div');modal.className='modal-backdrop';
    modal.innerHTML='<div class="modal compact"><div class="modal-head"><div><div class="eyebrow">Pedido #'+h(orderNo(summary.project))+'</div><h2>Produto pronto</h2></div><button class="btn ghost small close">×</button></div><p>O pedido já está como <b>Pronto para retirada</b>. Deseja avisar o cliente agora?</p><div class="z19-ready-message">'+h(message)+'</div><div class="modal-footer"><button class="btn close">Avisar depois</button><button class="btn whatsapp" data-notify-now>WA Avisar cliente</button></div></div>';
    document.body.appendChild(modal);modal.querySelectorAll('.close').forEach(b=>b.onclick=()=>modal.remove());const now=modal.querySelector('[data-notify-now]');if(!digits(w.phone))now.disabled=true;now.onclick=async()=>{modal.remove();await notifyProject(summary.project.id)};
  }
  async function notifyProject(projectId){
    const data=await load(true),summary=data.summaries.find(x=>x.project.id===projectId);if(!summary)return;
    const phone=digits(summary.workspace?.phone);if(!phone)return toast('Cliente sem WhatsApp cadastrado.','err');
    const target='https://wa.me/'+(phone.startsWith('55')?phone:'55'+phone)+'?text='+encodeURIComponent(notifyMessage(summary.workspace?.client_name||summary.workspace?.company_name)),win=window.open('about:blank','_blank');
    const {error}=await supabase.rpc('z19p_zero19_mark_notified',{p_project_id:projectId});
    if(error){try{win?.close()}catch{}return toast(error.message,'err')}
    invalidate();if(win)win.location.href=target;else window.open(target,'_blank','noopener,noreferrer');toast('Aviso registrado e WhatsApp aberto.','ok');
    if(location.hash.includes('/zero19-fila'))renderQueue();
  }
  async function markDelivered(projectId){
    if(!await confirmAction({eyebrow:'RETIRADA DO CLIENTE',title:'Confirmar entrega?',message:'O pedido irá para o histórico de entregues. Ele poderá ser reaberto e enviado para qualquer etapa do fluxo.',confirmLabel:'Sim, pedido entregue'}))return;
    const {error}=await supabase.rpc('z19p_zero19_mark_delivered',{p_project_id:projectId});if(error)return toast(error.message,'err');invalidate();toast('Pedido entregue e sincronizado com a ZERO19.','ok');if(productionViewActive())await refreshProductionViewAt(window.scrollY);
  }
  async function openReopenModal(projectId,{after=null}={}){
    if(!projectId)return;
    const modal=document.createElement('div');modal.className='modal-backdrop';
    const options=STAGE_ORDER.filter(stage=>stage!=='ready_pickup').map(stage=>'<option value="'+stage+'">'+h(STAGE_LABELS[stage])+'</option>').join('');
    modal.innerHTML='<div class="modal compact" role="dialog" aria-modal="true"><div class="modal-head"><div><div class="eyebrow">CORRIGIR O FLUXO</div><h2>Para qual etapa o pedido deve voltar?</h2><p>Use isto quando uma entrega ou conclusão foi marcada por engano.</p></div><button class="btn ghost small close">×</button></div><div class="field"><label>Etapa correta<select data-reopen-stage>'+options+'</select></label></div><div class="modal-footer"><button class="btn close">Cancelar</button><button class="btn primary" data-reopen-confirm>Colocar novamente no fluxo</button></div></div>';
    document.body.appendChild(modal);modal.querySelectorAll('.close').forEach(button=>button.onclick=()=>modal.remove());
    modal.querySelector('[data-reopen-confirm]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;const stage=modal.querySelector('[data-reopen-stage]').value,{error}=await supabase.rpc('z19p_zero19_force_stage',{p_project_id:projectId,p_stage:stage});if(error){button.disabled=false;return toast(error.message,'err')}modal.remove();invalidate();toast('Pedido recolocado em '+STAGE_LABELS[stage]+'.','ok');if(after)await after();else if(productionViewActive())await refreshProductionViewAt(window.scrollY)};
  }
  async function openDeadlineModal(projectId){
    const data=await load(true),summary=data.summaries.find(row=>row.project.id===projectId);if(!summary)return toast('Pedido não encontrado.','err');
    const current=summary.promised?new Date(summary.promised):new Date(Date.now()+24*60*60*1000),pad=value=>String(value).padStart(2,'0'),localDate=pad(current.getFullYear())+'-'+pad(current.getMonth()+1)+'-'+pad(current.getDate()),localTime=pad(current.getHours())+':'+pad(current.getMinutes()),modal=document.createElement('div');modal.className='modal-backdrop';
    modal.innerHTML='<div class="modal compact" role="dialog" aria-modal="true"><div class="modal-head"><div><div class="eyebrow">PEDIDO #'+h(orderNo(summary.project))+'</div><h2>Definir novo prazo</h2><p>A data e a hora serão atualizadas no projeto inteiro e no acompanhamento do cliente.</p></div><button class="btn ghost small close">×</button></div><div class="cost-grid two"><label>Nova data<input type="date" data-deadline-date value="'+h(localDate)+'"></label><label>Novo horário<input type="time" data-deadline-time value="'+h(localTime)+'"></label></div><div class="modal-footer"><button class="btn close">Cancelar</button><button class="btn primary" data-deadline-save>Salvar novo prazo</button></div></div>';
    const controls=document.createElement('div');controls.innerHTML='<label class="field">Prioridade<select data-deadline-priority><option value="manual_deadline">Prazo forçado — encaixar pela entrega</option><option value="normal">Normal — manter na fila</option><option value="in_store">Cliente aguardando na loja — fazer primeiro</option></select></label><p class="hint" data-deadline-impact aria-live="polite"></p>';modal.querySelector('.modal-footer').before(controls);
    const preview=()=>{const date=modal.querySelector('[data-deadline-date]').value,time=modal.querySelector('[data-deadline-time]').value,area=modal.querySelector('[data-deadline-impact]');if(!date||!time)return;const promised=new Date(date+'T'+time+':00');if(!Number.isFinite(promised.getTime()))return;const priority=modal.querySelector('[data-deadline-priority]').value;
      const items=(data.sla.production_items||data.items).map(item=>item.project_id!==projectId?item:{...item,promised_at:promised.toISOString(),metadata:{...item.metadata,details:(item.metadata?.details?.length?item.metadata.details:[{}]).map(detail=>({...detail,production:{...detail.production,priority}}))}}),schedule=calculateProductionSchedule({...data.sla,production_items:items,pauses:data.sla.pauses||[]}),own=schedule.projects.find(row=>row.project_id===projectId),risks=schedule.projects.filter(row=>row.project_id!==projectId&&row.atRisk);
      area.textContent=(own?.predictedAt?'Previsão deste pedido: '+slotDt(own.predictedAt)+'. ':'A previsão depende da retomada ou revisão da fila. ')+(risks.length?risks.length+' outro(s) pedido(s) podem ultrapassar a entrega prometida. ':'')+'As datas já combinadas dos outros pedidos não serão alteradas.';};
    document.body.appendChild(modal);modal.querySelectorAll('.close').forEach(button=>button.onclick=()=>modal.remove());modal.querySelectorAll('input,select').forEach(control=>control.addEventListener('change',preview));preview();
    modal.querySelector('[data-deadline-save]').onclick=async event=>{const button=event.currentTarget,date=modal.querySelector('[data-deadline-date]').value,time=modal.querySelector('[data-deadline-time]').value;if(!date||!time)return toast('Informe a nova data e o horário.','err');const parsed=new Date(date+'T'+time+':00');if(!Number.isFinite(parsed.getTime()))return toast('Prazo inválido.','err');const promisedAt=parsed.toISOString();button.disabled=true;button.textContent='Atualizando…';
      let result;try{result=await supabase.rpc('z19p_reschedule_order',{p_project_id:projectId,p_promised_at:promisedAt,p_priority:modal.querySelector('[data-deadline-priority]').value})}catch(error){result={error}}
      if(result.error){button.disabled=false;button.textContent='Salvar novo prazo';return toast(result.error.message||'Não foi possível salvar. Nenhum prazo foi alterado.','err')}
      modal.remove();invalidate();toast('Novo prazo salvo no pedido inteiro.','ok');await refreshProductionViewAt(window.scrollY)};
  }
  async function openPauseModal(projectId,isPaused=false){
    const global=projectId==null;
    if(isPaused){
      if(!await confirmAction({eyebrow:global?'IMPRESSORA':'PRODUÇÃO',title:global?'Encerrar manutenção?':'Retomar este pedido?',message:global?'A pausa geral será encerrada. Pedidos com pausa individual continuam parados.':'A pausa individual será encerrada. Se a impressora estiver em manutenção, a produção continuará parada.',confirmLabel:'Retomar agora'}))return;
      try{const {error}=await supabase.rpc('z19p_set_production_pause',{p_project_id:projectId,p_paused:false,p_reason_id:null,p_note:null});if(error)throw error;invalidate();toast(global?'Manutenção encerrada. Pausas individuais foram preservadas.':'Pausa individual encerrada.','ok');return refreshProductionViewAt(window.scrollY)}catch(error){return toast(error.message||'Não foi possível retomar. Tente novamente.','err')}
    }
    const data=await load(true);if(!data.pauseSchemaReady)return toast('Pausas ainda aguardam a atualização do banco. Nenhuma configuração foi perdida.','err');const modal=document.createElement('div');modal.className='modal-backdrop';
    modal.innerHTML='<div class="modal compact" role="dialog" aria-modal="true"><div class="modal-head"><div><div class="eyebrow">'+(global?'MANUTENÇÃO GERAL':'PARAR PEDIDO')+'</div><h2>'+h(global?'Pausar toda a produção?':'Por que este pedido ficará parado?')+'</h2><p>O período parado não entrará na média de tempo por camisa. O prazo combinado continua visível.</p></div><button class="btn ghost small close">×</button></div><div class="field"><label>Motivo<select data-pause-reason><option value="">Escolha o motivo</option>'+data.reasons.map(reason=>'<option value="'+h(reason.id)+'">'+h(reason.name)+'</option>').join('')+'</select></label><button class="btn ghost small" data-pause-manage-reasons>Gerenciar motivos</button></div><div class="field"><label>Observação opcional<textarea data-pause-note rows="3" maxlength="300" placeholder="Explique apenas se for necessário"></textarea></label></div><div class="modal-footer"><button class="btn close">Cancelar</button><button class="btn primary" data-pause-confirm disabled>Confirmar pausa</button></div></div>';
    document.body.appendChild(modal);modal.querySelectorAll('.close').forEach(button=>button.onclick=()=>modal.remove());const select=modal.querySelector('[data-pause-reason]'),confirm=modal.querySelector('[data-pause-confirm]');select.onchange=()=>confirm.disabled=!select.value;
    if(global){const maintenance=data.reasons.find(reason=>/impressora.*manuten/i.test(reason.name));if(maintenance){select.value=maintenance.id;confirm.disabled=false}}
    modal.querySelector('[data-pause-manage-reasons]').onclick=async()=>{await openReasonsManager({onClose:async()=>{const fresh=await load(true),chosen=select.value;select.innerHTML='<option value="">Escolha o motivo</option>'+fresh.reasons.map(reason=>'<option value="'+h(reason.id)+'">'+h(reason.name)+'</option>').join('');select.value=chosen;confirm.disabled=!select.value}})};
    confirm.onclick=async()=>{confirm.disabled=true;try{const {data:saved,error}=await supabase.rpc('z19p_set_production_pause',{p_project_id:projectId,p_paused:true,p_reason_id:select.value,p_note:modal.querySelector('[data-pause-note]').value});if(error)throw error;if(!saved?.id)throw new Error('A pausa não foi confirmada. Atualize e tente novamente.');modal.remove();invalidate();toast(global?'Impressora em manutenção. Todos os relógios foram pausados.':'Pedido parado.','ok');await refreshProductionViewAt(window.scrollY)}catch(error){confirm.disabled=false;toast(error.message||'Não foi possível parar o pedido. Tente novamente.','err')}};
  }
  async function openReasonsManager({onClose=null}={}){
    const owner=accountOwnerId();if(!owner)return toast('Entre na conta da loja para gerenciar os motivos.','err');
    const modal=document.createElement('div');modal.className='modal-backdrop';let editing=null,rows=[],busy=false,changed=false;
    const close=async()=>{if(busy)return;modal.remove();try{if(onClose)await onClose();else if(changed&&productionViewActive())await refreshProductionViewAt(window.scrollY)}catch(error){toast(error.message||'Não foi possível atualizar a fila.','err')}};
    const showError=error=>{const box=modal.querySelector('[data-reason-error]');box.textContent=error?.code==='23505'?'Já existe um motivo com esse nome. Edite o motivo existente.':error?.message||'Não foi possível salvar. Tente novamente.';box.hidden=false};
    const setBusy=value=>{busy=value;modal.querySelectorAll('button,input').forEach(element=>element.disabled=value)};
    const saveResult=async operation=>{const {data,error}=await operation.select('id,name,active,sort_order').single();if(error)throw error;if(!data?.id)throw new Error('A alteração não foi confirmada. Atualize a página e tente novamente.');const index=rows.findIndex(row=>row.id===data.id);if(index<0)rows.push(data);else rows[index]={...rows[index],...data};changed=true;invalidate();return data};
    const draw=()=>{
      modal.innerHTML='<div class="modal compact z19-reasons-manager" role="dialog" aria-modal="true" aria-label="Motivos de pausa"><div class="modal-head"><div><div class="eyebrow">CONFIGURAÇÃO DA PRODUÇÃO</div><h2>Motivos de pausa</h2><p>Crie, edite ou exclua os motivos usados para parar pedidos.</p></div><button type="button" class="btn ghost small close" aria-label="Fechar">×</button></div><div class="z19-reason-list">'+rows.filter(row=>row.active).map(row=>'<div class="z19-reason-row"><span>'+h(row.name)+'</span><div class="z19-reason-actions"><button type="button" class="btn ghost small" data-edit-reason="'+h(row.id)+'">Editar</button><button type="button" class="btn ghost small" data-delete-reason="'+h(row.id)+'">Excluir</button></div></div>').join('')+'</div><form data-reason-form><div class="field"><label>'+(editing?'Editar motivo':'Criar novo motivo')+'<input data-reason-input required maxlength="100" value="'+h(editing?.name||'')+'" placeholder="Ex.: aguardando chegar camisa"></label></div><p data-reason-error class="z19-inline-error" role="alert" hidden></p><div class="modal-footer"><button type="button" class="btn close">Fechar</button>'+(editing?'<button type="button" class="btn ghost" data-new-reason>Cancelar edição / Novo</button>':'')+'<button type="submit" class="btn primary" data-save-reason>'+(editing?'Salvar alteração':'Adicionar motivo')+'</button></div></form></div>';
      modal.querySelectorAll('.close').forEach(button=>button.onclick=close);
      const input=modal.querySelector('[data-reason-input]');
      modal.querySelector('[data-new-reason]')?.addEventListener('click',()=>{editing=null;draw();modal.querySelector('[data-reason-input]').focus()});
      modal.querySelectorAll('[data-edit-reason]').forEach(button=>button.onclick=()=>{editing=rows.find(row=>row.id===button.dataset.editReason);draw();modal.querySelector('[data-reason-input]').focus()});
      modal.querySelectorAll('[data-delete-reason]').forEach(button=>button.onclick=async()=>{if(busy)return;const row=rows.find(row=>row.id===button.dataset.deleteReason);if(!row||!await confirmAction({title:'Excluir “'+row.name+'”?',message:'O motivo sairá da lista de novas pausas. Pedidos e pausas já registrados serão preservados.',confirmLabel:'Excluir motivo',danger:true}))return;setBusy(true);try{await saveResult(supabase.from('z19p_pause_reasons').update({active:false,updated_at:new Date().toISOString()}).eq('owner_id',owner).eq('id',row.id));if(editing?.id===row.id)editing=null;draw();toast('Motivo excluído da lista.','ok')}catch(error){showError(error)}finally{setBusy(false)}});
      modal.querySelector('[data-reason-form]').onsubmit=async event=>{event.preventDefault();if(busy)return;const name=String(input.value||'').trim();if(!name){showError(new Error('Informe o nome do motivo.'));input.focus();return}const duplicate=rows.find(row=>row.id!==editing?.id&&row.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'));if(duplicate?.active){showError(new Error('Já existe um motivo com esse nome. Edite o motivo existente.'));return}setBusy(true);try{const target=editing||duplicate,operation=target?supabase.from('z19p_pause_reasons').update({name,active:true,updated_at:new Date().toISOString()}).eq('owner_id',owner).eq('id',target.id):supabase.from('z19p_pause_reasons').insert({owner_id:owner,name,sort_order:100});await saveResult(operation);editing=null;draw();toast('Motivo salvo.','ok')}catch(error){showError(error)}finally{setBusy(false)}};
    };
    document.body.appendChild(modal);modal.innerHTML='<div class="modal compact" role="status">Carregando motivos…</div>';
    try{const {data,error}=await supabase.from('z19p_pause_reasons').select('*').eq('owner_id',owner).order('sort_order').order('name');if(error)throw error;rows=data||[];draw()}catch(error){draw();showError(error)}
  }
  async function openHolidaysManager(){
    const owner=accountOwnerId(),modal=document.createElement('div');modal.className='modal-backdrop';
    const draw=async()=>{const {data,error}=await supabase.from('z19p_production_holidays').select('*').eq('owner_id',owner).order('holiday_date');if(error)throw error;const rows=data||[];modal.innerHTML='<div class="modal compact" role="dialog" aria-modal="true"><div class="modal-head"><div><div class="eyebrow">CALENDÁRIO PRODUTIVO</div><h2>Feriados sem contagem de tempo</h2><p>Nessas datas o relógio da produção não avança.</p></div><button class="btn ghost small close">×</button></div><div class="z19-reason-list">'+rows.map(row=>'<div><span class="btn ghost">'+h(String(row.holiday_date).split('-').reverse().join('/'))+' · '+h(row.name)+'</span><button class="btn ghost small" data-delete-holiday="'+h(row.id)+'">×</button></div>').join('')+'</div><div class="cost-grid two"><label>Data<input type="date" data-holiday-date></label><label>Nome<input data-holiday-name maxlength="100" placeholder="Ex.: Natal"></label></div><div class="modal-footer"><button class="btn close">Fechar</button><button class="btn primary" data-save-holiday>Adicionar feriado</button></div></div>';modal.querySelectorAll('.close').forEach(button=>button.onclick=()=>modal.remove());modal.querySelectorAll('[data-delete-holiday]').forEach(button=>button.onclick=async()=>{const {error:removeError}=await supabase.from('z19p_production_holidays').delete().eq('owner_id',owner).eq('id',button.dataset.deleteHoliday);if(removeError)return toast(removeError.message,'err');invalidate();void draw()});modal.querySelector('[data-save-holiday]').onclick=async()=>{const holiday_date=modal.querySelector('[data-holiday-date]').value,name=String(modal.querySelector('[data-holiday-name]').value||'').trim();if(!holiday_date||!name)return toast('Informe a data e o nome do feriado.','err');const {error:saveError}=await supabase.from('z19p_production_holidays').upsert({owner_id:owner,holiday_date,name},{onConflict:'owner_id,holiday_date'});if(saveError)return toast(saveError.message,'err');invalidate();void draw()}};
    document.body.appendChild(modal);try{await draw()}catch(error){modal.remove();toast('O calendário de feriados ainda aguarda a atualização do banco.','err')}
  }
  async function syncRecent(limit=30){
    const n=Math.max(1,Math.min(100,Number(limit)||30)),{data,error}=await supabase.rpc('z19p_sync_zero19_recent',{p_limit:n});
    if(error)return toast(error.message,'err');lastAutoSyncAt=Date.now();invalidate();toast((data?.synced||0)+' pedido(s) sincronizado(s).','ok');if(productionViewActive())await refreshProductionViewAt(window.scrollY);else enhanceDashboard();
  }
  async function enhanceSettings(modal){
    if(!modal||modal.querySelector('[data-zero19-sync-settings]'))return;
    const section=document.createElement('section');section.className='settings-section z19-sync-settings';section.dataset.zero19SyncSettings='';
    section.innerHTML='<div class="settings-head"><div><b>Sincronização PDV ZERO19</b><small>Automática. O sistema verifica pedidos novos em segundo plano e o botão Subir arte abre 30 por vez. A busca encontra pedidos antigos mesmo fora dos 30 carregados.</small></div></div>';
    const host=modal.querySelector('.clean-settings')||modal.querySelector('.settings-modal');host?.appendChild(section);
  }
  async function openWorkspaceStage(workspaceId){
    const data=await load(true),orders=data.summaries.filter(summary=>summary.workspace?.id===workspaceId).sort((a,b)=>new Date(b.project.source_order_created_at||b.project.created_at||0)-new Date(a.project.source_order_created_at||a.project.created_at||0));
    if(!orders.length)return toast('Este cliente ainda não possui pedido ZERO19 sincronizado.','err');
    const modal=document.createElement('div');modal.className='modal-backdrop';
    modal.innerHTML='<div class="modal compact"><div class="modal-head"><div><div class="eyebrow">AJUSTE MANUAL</div><h2>Atualizar etapa do pedido</h2><p>Use somente para corrigir pedidos antigos ou que já estavam adiantados. O fluxo normal continua automático.</p></div><button class="btn ghost small close">×</button></div><div class="field"><label>Pedido</label><select data-stage-project>'+orders.map(summary=>'<option value="'+h(summary.project.id)+'">#'+h(orderNo(summary.project))+' · '+h(summary.workspace?.client_name||summary.workspace?.company_name||'Cliente')+' · '+h(STAGE_LABELS[summary.stage]||summary.stage)+'</option>').join('')+'</select></div><div class="field"><label>Enviar para</label><select data-force-stage><option value="awaiting_art">Aguardando subir arte</option><option value="ready_production">Aguardando produção</option><option value="production">Em produção</option><option value="ready_pickup">Finalizado / pronto para retirada</option><option value="delivered">Entregue</option></select></div><div class="hint">A alteração atualiza o pedido integrado. Nenhuma arte ou arquivo é apagado.</div><div class="modal-footer"><button class="btn close">Cancelar</button><button class="btn primary" data-force-apply>Atualizar etapa</button></div></div>';
    document.body.appendChild(modal);modal.querySelectorAll('.close').forEach(button=>button.onclick=()=>modal.remove());
    modal.querySelector('[data-force-apply]').onclick=async()=>{const button=modal.querySelector('[data-force-apply]');button.disabled=true;const projectId=modal.querySelector('[data-stage-project]').value,stage=modal.querySelector('[data-force-stage]').value,{error}=await supabase.rpc('z19p_zero19_force_stage',{p_project_id:projectId,p_stage:stage});if(error){button.disabled=false;return toast(error.message,'err')}invalidate();modal.remove();toast('Etapa atualizada.','ok');if(location.hash.includes('/zero19-fila'))renderQueue();else nav('/')};
  }
  async function openTransfer(asset){
    const data=await load(true),clientsResult=await supabase.from('z19p_workspaces').select('*').eq('owner_id',accountOwnerId()).eq('workspace_type','client').order('client_name',{ascending:true}),clients=clientsResult.data||[],pending=data.summaries.filter(s=>['awaiting_art','awaiting_font','ready_production'].includes(s.stage)),modal=document.createElement('div');modal.className='modal-backdrop';
    const pendingRows=[];for(const s of pending){const artItems=s.items.filter(i=>i.stage==='awaiting_art');if(artItems.length){for(const item of artItems)pendingRows.push({summary:s,item})}}
    modal.innerHTML='<div class="modal compact"><div class="modal-head"><div><div class="eyebrow">Biblioteca ZERO19</div><h2>Transferir arte</h2><p>'+h(asset.name)+'</p></div><button class="btn ghost small close">×</button></div><div class="z19-transfer-list">'+(pendingRows.length?pendingRows.map((row,index)=>'<button class="z19-transfer-row" data-transfer-index="'+index+'"><b>'+h(row.summary.workspace?.client_name||row.summary.workspace?.company_name||'Cliente')+' · Pedido #'+h(orderNo(row.summary.project))+'</b><span>'+h(row.item.text_value||row.item.garment_name||'Arte pendente')+'</span><small>'+h(STAGE_LABELS[row.item.stage])+' · prazo '+h(dt(row.summary.promised))+'</small></button>').join(''):'<div class="empty mini">Nenhum pedido aguardando arte agora.</div>')+'</div><div class="field"><label>Ou transferir apenas para outro cliente</label><select data-transfer-workspace><option value="">Escolha um cliente</option>'+clients.map(w=>'<option value="'+h(w.id)+'">'+h(w.client_name||w.company_name)+'</option>').join('')+'</select></div><div class="modal-footer"><button class="btn close">Cancelar</button><button class="btn" data-transfer-only disabled>Transferir para cliente</button></div></div>';
    document.body.appendChild(modal);modal.querySelectorAll('.close').forEach(b=>b.onclick=()=>modal.remove());
    const only=modal.querySelector('[data-transfer-only]'),select=modal.querySelector('[data-transfer-workspace]');select.onchange=()=>only.disabled=!select.value;only.onclick=()=>transferAsset(asset,{workspace:clients.find(w=>w.id===select.value),project:null,item:null},modal);
    modal.querySelectorAll('[data-transfer-index]').forEach(b=>b.onclick=()=>{const row=pendingRows[Number(b.dataset.transferIndex)];transferAsset(asset,{workspace:row.summary.workspace,project:row.summary.project,item:row.item},modal)});
  }
  async function transferAsset(asset,target,modal){
    const owner=accountOwnerId(),workspace=target.workspace;if(!workspace)return;const project=target.project||null,newId=crypto.randomUUID(),base=owner+'/'+workspace.id+'/'+(project?.id||'library-transfer')+'/transfer/'+newId,copied=[];
    const copyOne=async(path,name)=>{if(!path)return null;const ext=(path.split('.').pop()||'bin').replace(/[^a-zA-Z0-9]/g,'').toLowerCase()||'bin',dest=base+'/'+name+'.'+ext,{error}=await supabase.storage.from(bucket).copy(path,dest);if(error)throw error;copied.push(dest);return dest};
    let original=null,processed=null;
    try{
      original=await copyOne(asset.original_path,'original');processed=asset.processed_path&&asset.processed_path!==asset.original_path?await copyOne(asset.processed_path,'processed'):original;
      const row={id:newId,owner_id:owner,workspace_id:workspace.id,project_id:project?.id||null,folder_id:null,name:asset.name,asset_type:asset.asset_type||'arte',original_path:original,processed_path:processed,mime_type:asset.mime_type||'image/png',size_bytes:asset.size_bytes||null,width:asset.width||null,height:asset.height||null,dpi:asset.dpi||300,alpha_trimmed:Boolean(asset.alpha_trimmed),background_removed:Boolean(asset.background_removed),maximized:Boolean(asset.maximized),metadata:{...(asset.metadata||{}),transferred_from_asset_id:asset.id,transferred_from_library:'ZERO19'},created_by:state().session?.user?.id||owner,updated_by:state().session?.user?.id||owner};
      const {error}=await supabase.from('z19p_assets').insert(row);if(error)throw error;
      if(project&&target.item){
        if(target.item.without_application){
          const imported={...row,id:newId};await ensureDtfProfile(target.item,imported);const linked=await supabase.rpc('z19p_zero19_mark_art_reviewed',{p_work_item_id:target.item.id,p_asset_id:newId});if(linked.error)throw linked.error;
          invalidate();modal?.remove();toast('DTF transferido e liberado para Aguardando produção.','ok');nav('/ambiente/'+encodeURIComponent(workspace.id));return;
        }
        const imported={...row,id:newId};modal?.remove();invalidate();toast('Arte transferida. Confira medida e posição antes de liberar para produção.','ok');await offerAfterUpload?.([imported],{workspace,projects:[project],allowWithoutOrder:true});return;
      }
      invalidate();modal?.remove();toast('Arte transferida para o cliente.','ok');nav('/ambiente/'+encodeURIComponent(workspace.id));
    }catch(error){if(copied.length)await supabase.storage.from(bucket).remove(copied);toast(error.message||'Não foi possível transferir a arte.','err')}
  }
  function enhanceWorkspace(workspace,assets){
    if(!workspace||workspace.workspace_type!=='library_zero19')return;
    for(const card of app.querySelectorAll('[data-asset]')){const id=card.dataset.asset,asset=(assets||[]).find(a=>a.id===id),actions=card.querySelector('.asset-actions');if(!asset||!actions||actions.querySelector('[data-z19-transfer]'))continue;const b=document.createElement('button');b.className='btn small z19-transfer-button';b.dataset.z19Transfer=id;b.textContent='Transferir para cliente';b.onclick=()=>openTransfer(asset);actions.appendChild(b)}
  }
  return {renderHome,enhanceDashboard,renderQueue,renderDelivered,enhanceSettings,enhanceWorkspace,load,openTransfer,openWorkspaceStage,syncRecent,invalidate,ensureAutomaticSync,pendingVendussFilmRows,prepareVendussFilmItem,pendingVdrFilmRows,prepareStudioArtFilmItem,prepareVdrFilmItem,refreshArtworkPreview,resolveOrderArtwork,chooseUploadTarget,orderProgress,markItemProduced};
}
