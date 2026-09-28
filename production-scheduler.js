// Shared verbatim with Novo Vendus. Durations are estimates, never automatic
// completion of real production. Work is removed only by recorded progress.
export const PRODUCTION_DEFAULTS = Object.freeze({
  art_minutes:30, print_minutes_per_meter:50, film_width_cm:58, print_batch_cm:100,
  cut_minutes_per_art:5, oven_width_cm:29.7, oven_height_cm:42,
  cure_minutes_per_cycle:2, cure_cycles:2, press_minutes_per_side:5,
  default_art_width_cm:28, default_art_height_cm:28, gap_cm:0.4,
});
export const PRODUCTION_FIELDS = [
  ['art_minutes','Desenvolver uma arte','min',0,240],
  ['print_minutes_per_meter','Imprimir 1 metro','min',1,480],
  ['film_width_cm','Largura útil do filme','cm',10,200],
  ['print_batch_cm','Comprimento máximo do lote','cm',10,500],
  ['cut_minutes_per_art','Cortar e aplicar poliamida por estampa','min',0,120],
  ['oven_width_cm','Largura útil do forno','cm',10,200],
  ['oven_height_cm','Altura útil do forno','cm',10,200],
  ['cure_minutes_per_cycle','Tempo de cada ciclo do forno','min',0.1,60],
  ['cure_cycles','Ciclos de cura (2 = virar e repetir)','ciclos',1,10],
  ['press_minutes_per_side','Prensar cada lado da camisa','min',0,120],
  ['default_art_width_cm','Largura estimada quando não informada','cm',1,100],
  ['default_art_height_cm','Altura estimada quando não informada','cm',1,200],
  ['gap_cm','Espaço entre estampas no filme','cm',0,5],
];
export function productionSettings(raw={}) {
  const result={...PRODUCTION_DEFAULTS};
  for(const [key,, ,min,max] of PRODUCTION_FIELDS){const value=Number(raw?.[key]);if(raw?.[key]!=null&&Number.isFinite(value)&&value>=min&&value<=max)result[key]=value;}
  result.cure_cycles=Math.ceil(result.cure_cycles);return result;
}
const finite=(value,fallback)=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):fallback;
const round=value=>Math.round(value*10)/10;
const terminal=new Set(['ready_pickup','delivered','cancelled']);
const stages=['printing','cutting','curing','pressing'];
const preparationStages=new Set(['awaiting_art','art_received','awaiting_halftone','needs_font']);
function currentStage(value){
  const stage=String(value||'awaiting_art').toLowerCase();
  if(stage==='awaiting_font')return 'needs_font';
  if(stage==='awaiting_production')return 'ready_production';
  return stage;
}
// Business time is always São Paulo, independent of the browser's timezone.
const zoneParts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function localParts(value){const p=Object.fromEntries(zoneParts.formatToParts(new Date(value)).map(x=>[x.type,x.value]));return {key:`${p.year}-${p.month}-${p.day}`,hour:Number(p.hour),minute:Number(p.minute),second:Number(p.second)};}
function localInstant(key,time){return new Date(`${key}T${time}:00-03:00`);}
function nextDay(key){return new Date(Date.parse(`${key}T12:00:00Z`)+86400000).toISOString().slice(0,10);}
export function addProductionMinutes(source,minutes,holidays=[]) {
  let date=new Date(source),remaining=Math.max(0,Number(minutes)||0);
  if(!Number.isFinite(date.getTime()))throw new Error('Data de produção inválida.');
  const closed=new Set(holidays.map(x=>String(x).slice(0,10)));
  for(let guard=0;guard<36600;guard++){
    const p=localParts(date),sunday=new Date(`${p.key}T12:00:00Z`).getUTCDay()===0;
    if(sunday||closed.has(p.key)||p.hour>=18){date=localInstant(nextDay(p.key),'10:00');continue;}
    if(p.hour<10)date=localInstant(p.key,'10:00');
    const end=localInstant(p.key,'18:00'),available=(end-date)/60000;
    if(remaining<=available)return new Date(date.getTime()+remaining*60000);
    remaining-=available;date=localInstant(nextDay(p.key),'10:00');
  }
  throw new Error('Fila excede o limite do calendário.');
}

// A shelf has an exact width and height: small rectangles share space, while
// oversized artwork is never silently treated as if it fit on an A3 sheet.
export function packProductionRectangles(rectangles,width,height=Infinity,gap=0){
  const batches=[];
  for(const rect of rectangles){
    let placed=false;
    for(const batch of batches){
      for(const shelf of batch.shelves){
        const options=[[rect.width,rect.height],[rect.height,rect.width]];
        const fit=options.find(([w,h])=>w<=width-shelf.used+1e-6&&h<=shelf.height+1e-6);
        if(!fit)continue;
        shelf.used+=fit[0]+gap;batch.items.push(rect);placed=true;break;
      }
      if(placed)break;
      const fit=[[rect.width,rect.height],[rect.height,rect.width]].filter(([w,h])=>w<=width+1e-6&&batch.length+h+(batch.shelves.length?gap:0)<=height+1e-6).sort((a,b)=>a[1]-b[1])[0];
      if(fit){batch.length+=fit[1]+(batch.shelves.length?gap:0);batch.shelves.push({used:fit[0]+gap,height:fit[1]});batch.items.push(rect);placed=true;break;}
    }
    if(!placed){
      const fit=[[rect.width,rect.height],[rect.height,rect.width]].filter(([w,h])=>w<=width+1e-6&&h<=height+1e-6).sort((a,b)=>a[1]-b[1])[0];
      if(!fit)throw new Error('Estampa maior que a área disponível.');
      batches.push({length:fit[1],shelves:[{used:fit[0]+gap,height:fit[1]}],items:[rect]});
    }
  }
  return batches;
}
function normalizeProductionSide(value,fallback='front'){
  const side=String(value||fallback).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[\s-]+/g,'_');
  if(/^(front|frente|peito)(_|$)/.test(side))return 'front';
  if(/^(back|costas|traseira)(_|$)/.test(side))return 'back';
  if(/^(left_sleeve|sleeve_left|manga_esquerda)(_|$)/.test(side))return 'left_sleeve';
  if(/^(right_sleeve|sleeve_right|manga_direita)(_|$)/.test(side))return 'right_sleeve';
  return side;
}
function artworkForItem(item,settings){
  const details=(item.metadata?.details||[]).filter(x=>x.production);
  const specs=details.length?details.map(x=>x.production):[item.production||{}];
  // Prepared placements are authoritative: they carry real dimensions/side.
  const prepared=Array.isArray(item.prepared_artworks)?item.prepared_artworks:[];
  if(prepared.length)return prepared.map(x=>({width:finite(x.width_cm,settings.default_art_width_cm),height:finite(x.height_cm,settings.default_art_height_cm),side:normalizeProductionSide(x.side||x.surface,'back'),key:x.asset_id||item.id,estimated:!x.width_cm||!x.height_cm}));
  return specs.map((p,index)=>{
    let width=Number(p.width_cm),height=Number(p.height_cm),estimated=false;
    if(p.kind==='DTF_METER'||item.kind==='DTF_METER'){
      estimated=!(width>0&&(height>0||Number(p.meters)>0));
      width=finite(width,settings.film_width_cm);height=finite(height,finite(p.meters,1)*100);
    }
    else if(['NAME_NUMBER','PHRASE'].includes(p.kind||item.kind)){
      const lines=String(p.top_text||item.text_value||'').split('\n').filter(Boolean);
      estimated=!(width>0&&height>0);
      width=finite(width,28);height=finite(height,(lines.length?lines.length*finite(p.letter_height_cm||p.name_height_cm,5):0)+(p.number?finite(p.number_height_cm,28)+3:0));
    }
    if(!(width>0&&height>0)){width=finite(width,settings.default_art_width_cm);height=finite(height,settings.default_art_height_cm);estimated=true;}
    const side=normalizeProductionSide(p.side||p.position_code,['NAME_NUMBER','PHRASE'].includes(item.kind)?'back':'front');
    return {width,height,side,key:p.asset_id||p.file_path||`${item.id}:${index}`,estimated,
      develop:p.art_source==='DEVELOP'&&!item.art_ready_at&&preparationStages.has(currentStage(item.stage))};
  });
}
function reserveWorker(calendar,ready,duration){
  if(duration<=0)return ready;
  let start=ready;
  for(const slot of calendar){if(start+duration<=slot.start)break;if(start<slot.end)start=slot.end;}
  const slot={start,end:start+duration};calendar.push(slot);calendar.sort((a,b)=>a.start-b.start);return slot.end;
}
function calculateProductionPhase(snapshot={},options={}){
  const settings=productionSettings(snapshot.production_settings),now=options.now||new Date(),holidays=snapshot.holidays||[];
  const raw=[...(snapshot.production_items||[]),...(options.extraItems||[])];
  const active=raw.filter(x=>!terminal.has(currentStage(x.stage)));
  const pauses=snapshot.pauses||[],pausedIds=new Set(pauses.filter(x=>x.scope==='order'&&!x.ended_at).map(x=>x.project_id));
  const printerPaused=Boolean(snapshot.printer_pause||pauses.some(x=>x.scope==='printer'&&!x.ended_at));
  const projects=new Map(),rectangles=[],worker=[],warnings=new Set();
  const detailedUnits=(snapshot.production_items||[]).filter(x=>!terminal.has(currentStage(x.stage))).reduce((sum,x)=>sum+Math.max(1,Math.floor(finite(x.quantity,1))),0);
  const missingBacklog=Math.max(0,(Number(snapshot.backlog_quantity)||0)-detailedUnits);
  const baselineBusy=missingBacklog*finite(snapshot.baseline_minutes_per_shirt,30);
  if(baselineBusy){worker.push({start:0,end:baselineBusy});warnings.add('Fila sem medidas detalhadas: reserva provisória de 30 minutos por unidade.');}
  const breakdown={art:0,preparation:0,baseline:baselineBusy,printing:0,cutting:0,curing:0,pressing:0,filmMeters:0,printBatches:0,ovenBatches:0};
  let artClock=baselineBusy,backlogUnits=missingBacklog;
  active.sort((a,b)=>(Date.parse(a.promised_at)||Infinity)-(Date.parse(b.promised_at)||Infinity)||(Date.parse(a.created_at)||0)-(Date.parse(b.created_at)||0));
  for(const item of active){
    const id=item.project_id||item.id,qty=Math.max(1,Math.floor(finite(item.quantity,1))),stage=currentStage(item.stage);
    // A downstream step is authoritative only after production was actually
    // started. A stale pressing flag on a reopened art request cannot skip work.
    const progress=stage==='production'&&stages.includes(item.production_step)?item.production_step:'printing';
    let project=projects.get(id);if(!project){project={project_id:id,quantity:0,finish:0,paused:pausedIds.has(id),sides:new Map(),itemIds:[],estimated:false};projects.set(id,project);}
    project.quantity+=qty;project.itemIds.push(item.id);backlogUnits+=qty;
    const arts=artworkForItem(item,settings);project.estimated||=arts.some(x=>x.estimated);
    if(project.estimated)warnings.add('Artes sem medidas finais são calculadas separadamente, sem economia presumida de encaixe.');
    const developed=new Set();let ready=0;
    for(const art of arts){
      if(!preparationStages.has(stage)||developed.has(art.key))continue;
      developed.add(art.key);
      artClock=reserveWorker(worker,artClock,settings.art_minutes);ready=artClock;
      if(art.develop)breakdown.art+=settings.art_minutes;
      else breakdown.preparation+=settings.art_minutes;
    }
    if(preparationStages.has(stage))warnings.add(`Pendências de arte, fonte e halftone reservam ${settings.art_minutes} min de preparação por arte; envio/aprovação e liberação ainda podem alterar o prazo.`);
    const pressSides=new Set(arts.map(x=>x.side));
    // One pressing per garment side, even for several elements on that side.
    // An explicit physical garment key can consolidate multiple customizations.
    if(!item.without_application){
      const detailGarmentKey=(item.metadata?.details||item.details||[]).find(x=>x.production?.garment_key)?.production.garment_key;
      const garmentKey=detailGarmentKey||item.production?.garment_key||item.metadata?.production_garment_key||item.id;
      for(const side of pressSides){const key=`${garmentKey}:${side}`;project.sides.set(key,{qty:Math.max(qty,project.sides.get(key)?.qty||0),progress});}
    }
    if(qty>10000){warnings.add('Quantidade excede o planejamento automático: divida em lotes antes de prometer o prazo.');project.invalid=true;continue;}
    if(qty>2000){warnings.add('Quantidade muito alta: confira o planejamento em lotes.');}
    for(const art of arts)for(let copy=0;copy<Math.min(qty,10000);copy++){
      // Cohorts are frozen from the CURRENT persisted stage and step. Future
      // simulated readiness never admits another stage into a shared batch.
      // Unfinished/unknown designs and paused work get their own reserved run.
      const shareable=!art.estimated&&!project.paused&&['ready_production','production'].includes(stage);
      const cohort=shareable?`${stage}:${progress}`:`isolated:${item.id}:${art.key}:${copy}`;
      const rect={...art,projectId:id,itemId:item.id,cohort,stage,ready,step:stages.indexOf(progress),withoutApplication:item.without_application};
      if(Math.min(rect.width,rect.height)>settings.film_width_cm){warnings.add('Há arte mais larga que o filme: ajuste a medida antes de prometer o prazo.');project.invalid=true;}
      rectangles.push(rect);
    }
  }
  let printClock=baselineBusy,ovenClock=baselineBusy;
  const pending=rectangles.filter(x=>x.step<=0&&!projects.get(x.projectId).invalid),finishedPrint=rectangles.filter(x=>x.step>0).map(x=>({...x,printedAt:0}));
  while(pending.length){
    const nextReady=Math.min(...pending.map(x=>x.ready));printClock=Math.max(printClock,nextReady);
    const readyNow=pending.filter(x=>x.ready<=printClock);
    const available=readyNow.filter(x=>x.cohort===readyNow[0].cohort);
    // Long continuous meter jobs remain a single print; other orders fill
    // rectangular batches and pay only the actual shared film length.
    const first=available[0],long=Math.min(first.width,first.height)<=settings.film_width_cm&&Math.max(first.width,first.height)>settings.print_batch_cm;
    const batch=long?packProductionRectangles([first],settings.film_width_cm,Infinity,settings.gap_cm)[0]:packProductionRectangles(available.filter(x=>Math.min(x.width,x.height)<=settings.film_width_cm&&Math.min(x.width,x.height)<=settings.print_batch_cm&&Math.max(x.width,x.height)<=Math.max(settings.film_width_cm,settings.print_batch_cm)),settings.film_width_cm,settings.print_batch_cm,settings.gap_cm)[0];
    if(!batch){warnings.add('Dimensões incompatíveis com o lote de impressão.');for(const rect of available){projects.get(rect.projectId).invalid=true;pending.splice(pending.indexOf(rect),1);}continue;}
    const duration=batch.length/100*settings.print_minutes_per_meter;printClock+=duration;breakdown.printing+=duration;breakdown.filmMeters+=batch.length/100;breakdown.printBatches++;
    for(const rect of batch.items){pending.splice(pending.indexOf(rect),1);finishedPrint.push({...rect,printedAt:printClock});}
  }
  // Cutting and pressing share one operator. Art development reserves that
  // same operator; automatic printing/oven may run while the operator works.
  const ovenRects=[];
  for(const rect of finishedPrint.sort((a,b)=>a.printedAt-b.printedAt)){
    const cut=rect.step<=1?settings.cut_minutes_per_art:0;
    rect.cutAt=reserveWorker(worker,rect.printedAt,cut);breakdown.cutting+=cut;
    if(rect.step>=3){projects.get(rect.projectId).finish=Math.max(projects.get(rect.projectId).finish,rect.cutAt);continue;}
    // Art larger than A3 needs multiple oven zones; never shrink the artwork.
    const orientations=[[rect.width,rect.height],[rect.height,rect.width]].sort((a,b)=>Math.ceil(a[0]/settings.oven_width_cm)*Math.ceil(a[1]/settings.oven_height_cm)-Math.ceil(b[0]/settings.oven_width_cm)*Math.ceil(b[1]/settings.oven_height_cm));
    const [w,h]=orientations[0],columns=Math.ceil(w/settings.oven_width_cm),rows=Math.ceil(h/settings.oven_height_cm);
    for(let x=0;x<columns;x++)for(let y=0;y<rows;y++)ovenRects.push({...rect,width:Math.min(settings.oven_width_cm,w-x*settings.oven_width_cm),height:Math.min(settings.oven_height_cm,h-y*settings.oven_height_cm)});
  }
  while(ovenRects.length){
    ovenClock=Math.max(ovenClock,Math.min(...ovenRects.map(x=>x.cutAt)));
    const first=ovenRects.filter(x=>x.cutAt<=ovenClock).sort((a,b)=>a.cutAt-b.cutAt)[0];
    // The oven uses the exact same frozen current-stage cohort as the film.
    // It never pools a currently curing order with one still awaiting artwork
    // just because the latter may be ready during this simulated timetable.
    const available=ovenRects.filter(x=>x.cohort===first.cohort),batch=packProductionRectangles(available,settings.oven_width_cm,settings.oven_height_cm,0)[0];
    const duration=settings.cure_minutes_per_cycle*settings.cure_cycles;ovenClock=Math.max(ovenClock,...batch.items.map(x=>x.cutAt))+duration;breakdown.curing+=duration;breakdown.ovenBatches++;
    for(const rect of batch.items){ovenRects.splice(ovenRects.indexOf(rect),1);projects.get(rect.projectId).finish=Math.max(projects.get(rect.projectId).finish,ovenClock);}
  }
  const ordered=[...projects.values()].sort((a,b)=>a.finish-b.finish);
  for(const project of ordered){
    if(project.invalid)continue;
    const press=[...project.sides.values()].reduce((sum,x)=>sum+x.qty*settings.press_minutes_per_side,0);
    project.finish=reserveWorker(worker,project.finish,press);breakdown.pressing+=press;
  }
  const totalMinutes=Math.max(baselineBusy,...ordered.filter(x=>!x.invalid).map(x=>x.finish));
  const scheduledUnits=missingBacklog+ordered.filter(x=>!x.invalid).reduce((sum,x)=>sum+x.quantity,0);
  const pausedCount=new Set([...ordered.filter(x=>x.paused).map(x=>x.project_id),...pausedIds]).size,invalid=ordered.some(x=>x.invalid);
  if(pausedCount)warnings.add(`${pausedCount} pedido(s) parado(s): todo o trabalho restante está reservado, mas a previsão depende da retomada e não inclui o tempo de espera desconhecido.`);
  if(printerPaused)warnings.add('Manutenção ativa: prazo depende da retomada.');
  const conditionalNextAvailableAt=invalid?null:addProductionMinutes(now,totalMinutes||finite(snapshot.baseline_minutes_per_shirt,30),holidays).toISOString();
  return {settings,backlogUnits,totalMinutes:round(totalMinutes),estimatedMinutesPerUnit:scheduledUnits?round(totalMinutes/scheduledUnits):finite(snapshot.baseline_minutes_per_shirt,30),
    nextAvailableAt:printerPaused||pausedCount||invalid?null:conditionalNextAvailableAt,conditionalNextAvailableAt,
    projects:ordered.map(p=>({project_id:p.project_id,quantity:p.quantity,paused:p.paused,estimated:p.estimated,minutes:round(p.finish),predictedAt:pausedCount||printerPaused||p.invalid?null:addProductionMinutes(now,p.finish,holidays).toISOString(),conditionalPredictedAt:p.invalid?null:addProductionMinutes(now,p.finish,holidays).toISOString()})),
    breakdown:Object.fromEntries(Object.entries(breakdown).map(([key,value])=>[key,round(value)])),warnings:[...warnings],pausedCount,printerPaused,
    invalid,pendingPreparationCount:active.filter(x=>preparationStages.has(currentStage(x.stage))).length};
}

function itemPriority(item){
  const specs=[item,...(item.metadata?.details||item.details||[]).map(x=>x.production||{}),item.production||{}];
  const priority=specs.some(x=>x.priority==='in_store')?'in_store':specs.some(x=>x.priority==='manual_deadline')?'manual_deadline':'normal';
  return {priority,requestedAt:specs.map(x=>Date.parse(x.priority_requested_at)).find(Number.isFinite)||Date.parse(item.created_at)||Infinity};
}

// Priority is explicit, never inferred from the number/size of pieces. Each
// priority boundary reserves the ENTIRE prior workflow (operator, printer and
// oven), so a new small job cannot silently jump into an older job's idle gap.
// Within a normal backlog block, the exact current-stage cohort rules above
// still let genuinely prepared pieces share film and oven capacity.
export function calculateProductionSchedule(snapshot={},options={}){
  const now=options.now||new Date(),holidays=snapshot.holidays||[];
  const persisted=(snapshot.production_items||[]).filter(x=>!terminal.has(currentStage(x.stage)));
  const extras=(options.extraItems||[]).filter(x=>!terminal.has(currentStage(x.stage)));
  const existingIds=new Set(persisted.map(x=>x.project_id||x.id)),groups=new Map();
  for(const item of [...persisted,...extras]){
    const id=item.project_id||item.id,p=itemPriority(item);
    let group=groups.get(id);
    if(!group){group={id,items:[],priority:'normal',requestedAt:Infinity,deadline:Infinity,createdAt:Infinity,existing:existingIds.has(id)};groups.set(id,group);}
    group.items.push(item);
    if(p.priority==='in_store'||(p.priority==='manual_deadline'&&group.priority==='normal'))group.priority=p.priority;
    group.requestedAt=Math.min(group.requestedAt,p.requestedAt);
    group.deadline=Math.min(group.deadline,Date.parse(item.promised_at)||Infinity);
    group.createdAt=Math.min(group.createdAt,Date.parse(item.created_at)||Infinity);
  }
  const values=[...groups.values()],phases=[];
  const byAge=(a,b)=>a.createdAt-b.createdAt||a.requestedAt-b.requestedAt;
  const rush=values.filter(x=>x.priority==='in_store').sort((a,b)=>a.requestedAt-b.requestedAt||byAge(a,b));
  for(const group of rush)phases.push({groups:[group],kind:'in_store'});
  const detailedUnits=persisted.reduce((sum,x)=>sum+Math.max(1,Math.floor(finite(x.quantity,1))),0);
  const missingBacklog=Math.max(0,(Number(snapshot.backlog_quantity)||0)-detailedUnits);
  // Unknown older work remains reserved after express service, before ordinary
  // new work. With no identifiers/deadlines it cannot be safely reprioritized.
  if(missingBacklog)phases.push({groups:[],kind:'baseline',missingBacklog});
  const backlog=values.filter(x=>x.priority!=='in_store'&&(x.existing||x.priority==='manual_deadline'))
    .sort((a,b)=>a.deadline-b.deadline||byAge(a,b));
  let block=[];
  const flush=()=>{if(block.length){phases.push({groups:block,kind:'normal'});block=[];}};
  for(const group of backlog){
    if(group.priority==='manual_deadline'){flush();phases.push({groups:[group],kind:'manual_deadline'});}
    else block.push(group);
  }
  flush();
  // Normal new orders are deliberately outside all existing capacity. A
  // deadline suggested to their draft is not permission to cut the queue.
  for(const group of values.filter(x=>!x.existing&&x.priority==='normal').sort(byAge))phases.push({groups:[group],kind:'new_normal'});
  if(!phases.length)phases.push({groups:[],kind:'normal'});
  const parts=[],projects=[],warnings=new Set();let offset=0;
  for(const phase of phases){
    const items=phase.groups.flatMap(x=>x.items);
    const part=calculateProductionPhase({...snapshot,production_items:items,backlog_quantity:phase.missingBacklog||0},{now:addProductionMinutes(now,offset,holidays)});
    parts.push(part);for(const warning of part.warnings)warnings.add(warning);
    for(const project of part.projects){
      const group=groups.get(project.project_id);
      projects.push({...project,startMinutes:round(offset),minutes:round(offset+project.minutes),priority:group.priority,promisedAt:Number.isFinite(group.deadline)?new Date(group.deadline).toISOString():null});
    }
    offset+=part.totalMinutes;
  }
  const pausedIds=new Set((snapshot.pauses||[]).filter(x=>x.scope==='order'&&!x.ended_at).map(x=>x.project_id));
  const pausedCount=pausedIds.size,printerPaused=parts.some(x=>x.printerPaused),invalid=parts.some(x=>x.invalid),unavailable=pausedCount>0||printerPaused||invalid;
  const settings=parts[0].settings,backlogUnits=parts.reduce((sum,x)=>sum+x.backlogUnits,0),totalMinutes=round(offset);
  const newUnitReserveMinutes=finite(snapshot.baseline_minutes_per_shirt,30);
  const conditionalNextAvailableAt=invalid?null:addProductionMinutes(now,totalMinutes||newUnitReserveMinutes,holidays).toISOString();
  const nextAvailableAt=unavailable?null:conditionalNextAvailableAt;
  const newUnitAvailableAt=unavailable?null:addProductionMinutes(now,totalMinutes+newUnitReserveMinutes,holidays).toISOString();
  for(const project of projects){
    project.predictedAt=unavailable?null:project.conditionalPredictedAt;
    project.atRisk=Boolean(project.promisedAt&&project.conditionalPredictedAt&&Date.parse(project.conditionalPredictedAt)>Date.parse(project.promisedAt));
    project.delayMinutes=project.atRisk?Math.ceil((Date.parse(project.conditionalPredictedAt)-Date.parse(project.promisedAt))/60000):0;
  }
  const atRiskProjects=projects.filter(x=>x.atRisk);
  if(rush.length)warnings.add(`${rush.length} pedido(s) expresso(s), cliente na loja: fluxo reservado antes da fila. Os prazos já combinados não foram alterados.`);
  if(values.some(x=>x.priority==='manual_deadline'))warnings.add('Prazo manual define a posição na fila, mas não elimina o trabalho necessário. Confira os pedidos com risco de atraso.');
  if(atRiskProjects.length)warnings.add(`${atRiskProjects.length} pedido(s) podem ultrapassar o prazo combinado nesta simulação. A promessa original foi preservada.`);
  return {settings,backlogUnits,totalMinutes,estimatedMinutesPerUnit:backlogUnits?round(totalMinutes/backlogUnits):newUnitReserveMinutes,
    nextAvailableAt,conditionalNextAvailableAt,newUnitAvailableAt,newUnitReserveMinutes,projects,atRiskProjects,
    breakdown:Object.fromEntries(Object.keys(parts[0].breakdown).map(key=>[key,round(parts.reduce((sum,part)=>sum+part.breakdown[key],0))])),
    warnings:[...warnings],pausedCount,printerPaused,invalid,pendingPreparationCount:parts.reduce((sum,x)=>sum+x.pendingPreparationCount,0),
    phases:phases.map((phase,index)=>({kind:phase.kind,projectIds:phase.groups.map(x=>x.id),minutes:parts[index].totalMinutes}))};
}
