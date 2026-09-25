import {cmToPx,nestItems,snapFilmPlacement,rotatedBoundsMm} from './nesting-core.js?v=2.17.5';
import {openFilmAssetPicker} from './film-picker.js?v=2.17.5';
import {mountFilmPreview} from './film-preview.js?v=2.17.5';
import {removeFilmEntry} from './film-edit-core.js?v=2.17.9';
import {createFilmMaskCache} from './film-mask-cache.js?v=2.17.10';
import {listFilmJobs,getFilmJob} from './film-job-list.js?v=2.17.10';
import {findCanvasAlphaBounds,cropCanvasToAlpha} from './film-export-core.js?v=2.17.5';
import {exportCanvasWithSpot,spotCanvasGeometry,throwIfSpotCancelled} from './film-spot-export.js?v=2.17.9';
import {buildQueueSnapshot,fetchQueueRecords,missingQueueStages,scopeQueueRows} from './queue-core.js?v=2.17.12';
import {measureLetteringItem,measureLetteringLine} from './lettering-core.js?v=2.17.5';
import {openCustomizationPreparer} from './customization-preparer.js?v=2.17.5';
import {resolveFilmDraftMedia} from './film-draft.js?v=2.17.5';
import {createCloudFilmDraftStore} from './film-cloud-draft.js?v=2.17.5';
import {attachAssetStudioActions} from './asset-studio-actions.js?v=2.17.5';
import {createFilmProduction,filmExportIdentity,filmItemFromOrder,filmOrderRowKey,pendingQuantity} from './film-production.js?v=2.17.12';
import {isCompanyPortalProject} from './service-readiness.js?v=2.17.12';

const OPERATIONAL_STAGES=new Set(['art_work','ready_production','production']);
const STAGE_LABELS={art_work:'Preparar artes',ready_production:'Liberados',production:'Em produção'};
const SERVICE_LABELS={full_shirt:'Camiseta completa',dtf_only:'Somente DTF',customer_shirt:'Camiseta do cliente',refurbishment:'Reforma'};
const PRIVATE_BUCKET='z19p-private';
const bytes=(...parts)=>{const size=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(size);let o=0;for(const p of parts){out.set(p,o);o+=p.length}return out};
const enc=value=>new TextEncoder().encode(value);
const blobFromCanvas=(canvas,type='image/png',quality=.94)=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Falha ao gerar imagem.')),type,quality));

export function groupTeamHierarchy(teams=[],kits=[],sets=[]){
  return teams.map(team=>({team,kits:kits.filter(kit=>kit.team_id===team.id).map(kit=>({kit,sets:sets.filter(set=>set.kit_id===kit.id)}))}));
}
const SET_KIND_PREFIX={lettering:'[NOMES_NUMEROS] ',sponsors:'[ALL_SPONSOR] ',special:'[ARTE_ESPECIAL] '};
const SET_KIND_LABEL={lettering:'Fontes e números',sponsors:'All Sponsor',special:'Arte especial'};
export function customizationKind(set){if(set?.set_type)return set.set_type;const name=String(set?.name||'');if(name.startsWith(SET_KIND_PREFIX.sponsors))return 'sponsors';if(name.startsWith(SET_KIND_PREFIX.special))return 'special';return 'lettering'}
export function customizationName(set){const name=String(set?.name||'');return name.replace(/^\[(?:NOMES_NUMEROS|ALL_SPONSOR|ARTE_ESPECIAL)\]\s*/,'')}

export function createProductionModule(ctx){
  const {supabase,app}=ctx;
  let queueRows=[],queueSnapshot=null,queueRequest=0,lastFilm=null,filmItems=[],launcherScope='mine',pendingZero19TeamRequest=null,pendingZero19AssetRequest=null;
  let filmSettings={mediaId:null,mode:'maximum',gapMm:3,freeRotation:false,angleStep:30,name:'',nameCustom:false};
  let filmPreviewGeneration=0,filmCostPanel=null;
  let detachProductionListener=null;
  const fontCache=new Map(),fontCoverageByFamily=new Map(),vectorMarkupCache=new Map();
  let fontFaceSequence=0,productionAccountGeneration=0;
  const state=()=>ctx.state();
  const h=ctx.escapeHTML;
  const owner=()=>ctx.accountOwnerId();
  const uid=()=>state().session?.user?.id;
  const stageOf=statusId=>state().statuses.find(s=>s.id===statusId)?.queue_stage||'none';
  const finalized=statusId=>Boolean(state().statuses.find(s=>s.id===statusId)?.is_finalized);
  const dateOnly=value=>value?new Date(`${String(value).slice(0,10)}T12:00:00`):null;
  const dateLabel=value=>dateOnly(value)?.toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'})||'Sem entrega';
  const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const safe=async(fn,fallback=null)=>{try{return await fn()}catch(error){console.error(error);ctx.toast(error?.message||String(error),'err');return fallback}};
  function queueZero19TeamRequest(request){pendingZero19TeamRequest={...(request||{})};ctx.nav('/filme');}
  function queueZero19AssetRequest(request){pendingZero19AssetRequest={...(request||{})};ctx.nav('/filme');}

  async function signedSourceUrl(path,expiresIn=900){
    const {data,error}=await supabase.storage.from(PRIVATE_BUCKET).createSignedUrl(path,expiresIn);
    if(error)throw error;return data.signedUrl;
  }
  async function loadOfficialFont(source){
    if(!source||!['ttf','otf'].includes(source.source_type))throw new Error('Esta fonte de camisa não possui TTF/OTF de trabalho.');
    if(!source.storage_path)throw new Error('O arquivo da fonte oficial não foi encontrado.');
    const key=`${source.id}:${source.storage_path}`,accountGeneration=productionAccountGeneration;
    if(fontCache.has(key))return fontCache.get(key);
    const loading=(async()=>{
      const family=`z19_${String(source.id||'official').replace(/[^a-z0-9_]/gi,'_')}_${++fontFaceSequence}`,url=await signedSourceUrl(source.storage_path),response=await fetch(url);
      if(!response.ok)throw new Error('Não foi possível baixar a fonte oficial. Confira a conexão e tente novamente.');
      const buffer=await response.arrayBuffer(),{parseFontCmap}=await import('./font-cmap.js?v=2.17.5'),coverage=parseFontCmap(buffer),face=new FontFace(family,buffer);
      await face.load();if(face.status!=='loaded')throw new Error('A fonte oficial não carregou. Tente novamente.');
      if(accountGeneration!==productionAccountGeneration)throw new Error('A conta mudou durante o carregamento da fonte. Reabra a personalização.');
      document.fonts.add(face);fontCoverageByFamily.set(family,coverage);return family;
    })();
    fontCache.set(key,loading);
    try{return await loading}catch(error){if(fontCache.get(key)===loading)fontCache.delete(key);throw error}
  }
  async function loadPrivateVectorImage(source){
    if(!source?.storage_path)throw new Error('O SVG final desta personalização não foi encontrado.');
    const image=new Image();image.crossOrigin='anonymous';image.src=await signedSourceUrl(source.storage_path);await image.decode();return image;
  }
  function sanitizeSvg(markup){
    const doc=new DOMParser().parseFromString(markup,'image/svg+xml'),root=doc.documentElement;
    if(root.nodeName.toLowerCase()!=='svg'||doc.querySelector('parsererror'))throw new Error('SVG inválido. Exporte novamente como SVG padrão.');
    doc.querySelectorAll('script,foreignObject,iframe,object,embed').forEach(node=>node.remove());
    doc.querySelectorAll('*').forEach(node=>[...node.attributes].forEach(attr=>{const name=attr.name.toLowerCase(),value=attr.value.trim();if(name.startsWith('on')||((name==='href'||name.endsWith(':href'))&&!value.startsWith('#')))node.removeAttribute(attr.name)}));
    root.setAttribute('preserveAspectRatio','xMidYMid meet');return new XMLSerializer().serializeToString(root);
  }
  function canonicalVectorColor(value){
    const raw=String(value||'').trim().toUpperCase();
    if(/^#[0-9A-F]{3}$/.test(raw))return '#'+[...raw.slice(1)].map(char=>char+char).join('');
    if(/^#[0-9A-F]{6}$/.test(raw))return raw;
    if(raw==='WHITE')return '#FFFFFF';if(raw==='BLACK')return '#000000';
    return null;
  }
  function vectorSvgColors(markup){
    const doc=new DOMParser().parseFromString(sanitizeSvg(markup),'image/svg+xml'),colors=new Set();
    const add=value=>{const color=canonicalVectorColor(value);if(color)colors.add(color)};
    doc.querySelectorAll('*').forEach(node=>{add(node.getAttribute('fill'));add(node.getAttribute('stroke'));add(node.style?.fill);add(node.style?.stroke)});
    return [...colors];
  }
  function applyVectorColorOverrides(markup,overrides={}){
    const doc=new DOMParser().parseFromString(sanitizeSvg(markup),'image/svg+xml'),map=new Map();
    for(const [from,to] of Object.entries(overrides||{})){const source=canonicalVectorColor(from),target=canonicalVectorColor(to);if(source&&target&&source!==target)map.set(source,target)}
    if(!map.size)return new XMLSerializer().serializeToString(doc.documentElement);
    const replace=value=>{const key=canonicalVectorColor(value);return key&&map.has(key)?map.get(key):value};
    doc.querySelectorAll('*').forEach(node=>{
      for(const name of ['fill','stroke'])if(node.hasAttribute(name))node.setAttribute(name,replace(node.getAttribute(name)));
      if(node.style){if(node.style.fill)node.style.fill=replace(node.style.fill);if(node.style.stroke)node.style.stroke=replace(node.style.stroke)}
    });
    return new XMLSerializer().serializeToString(doc.documentElement);
  }
  async function privateVectorMarkup(source){
    if(!source?.storage_path)throw new Error('O SVG final desta personalização não foi encontrado.');
    const key=String(source.id||source.storage_path);if(vectorMarkupCache.has(key))return vectorMarkupCache.get(key);
    const loading=(async()=>{const response=await fetch(await signedSourceUrl(source.storage_path));if(!response.ok)throw new Error('Não foi possível carregar o SVG para editar as cores.');return sanitizeSvg(await response.text())})();
    vectorMarkupCache.set(key,loading);try{return await loading}catch(error){if(vectorMarkupCache.get(key)===loading)vectorMarkupCache.delete(key);throw error}
  }

  function runNesting(items,options){
    if(!window.Worker)return Promise.resolve(options.operation==='move'?snapFilmPlacement(items,options.placements,options.moving,options):nestItems(items,options));
    return new Promise((resolve,reject)=>{
      const worker=new Worker(new URL('./nesting-worker.js?v=2.17.5',import.meta.url),{type:'module'}),timer=setTimeout(()=>{worker.terminate();reject(new Error('O cálculo excedeu o tempo seguro. Reduza a quantidade de itens.'))},120000);
      const finish=()=>{clearTimeout(timer);worker.terminate()};
      worker.onmessage=event=>{finish();event.data?.ok?resolve(event.data.result):reject(new Error(event.data?.error||'Falha no cálculo do filme.'))};
      worker.onerror=event=>{finish();reject(new Error(event.message||'Falha ao iniciar o cálculo do filme.'))};
      worker.postMessage({items,options});
    });
  }

  async function ensureMediaProfiles(){
    const {data,error}=await supabase.from('z19p_print_media_profiles').select('*').order('nominal_width_cm');
    if(!error&&data?.length)return data;
    if(error)throw new Error(['42P01','PGRST205'].includes(error.code)?'O cadastro de perfis de filme ainda não foi habilitado no banco.':`Não foi possível consultar os perfis de filme: ${error.message||'confira a conexão'}`);
    const rows=[28,58].map(width=>({owner_id:owner(),name:`Filme ${width} cm`,nominal_width_cm:width===28?30:60,usable_width_cm:width,created_by:uid(),updated_by:uid()}));
    const result=await supabase.from('z19p_print_media_profiles').insert(rows).select();if(result.error)throw result.error;return result.data||[];
  }

  async function loadQueues(){
    const request=++queueRequest,account=owner();
    try{
      const [records,readiness]=await Promise.all([fetchQueueRecords(supabase,account),typeof supabase.rpc==='function'?supabase.rpc('z19p_queue_readiness'):Promise.resolve({data:[]})]);
      if(readiness.error||!Array.isArray(readiness.data))throw new Error('Não foi possível conferir a liberação dos pedidos: '+(readiness.error?.message||'resposta incompleta'));
      if(request!==queueRequest||account!==owner())return queueRows;
      queueSnapshot=buildQueueSnapshot({...records,workspaces:state().workspaces,statuses:state().statuses,releaseIssues:readiness.data});
      queueRows=queueSnapshot.rows;
    }catch(error){
      if(request!==queueRequest)return queueRows;
      console.warn('v2.17 queues',error);queueRows=[];
      queueSnapshot={rows:[],cards:[],blocked:[],missingStages:[],error:error.message||'Não foi possível carregar as filas.'};
    }
    return queueRows;
  }


  function enhanceDashboardCards(){
    if(!app.querySelector('.dashboard-home'))return;
    const byWorkspace=new Map((queueSnapshot?.cards||[]).map(row=>[row.workspace.id,row]));
    app.querySelectorAll('.workspace-card').forEach(card=>{
      const id=card.dataset.workspace||card.querySelector('.open-workspace[data-id]')?.dataset.id,row=byWorkspace.get(id);
      card.querySelectorAll('[data-queue-card-details]').forEach(node=>node.remove());
      card.classList.toggle('mine',Boolean(row&&!row.closed&&row.responsibleId===uid()));
      card.classList.toggle('in-production-queue',Boolean(row?.position));
      card.removeAttribute('data-queue-stage');
      if(!row||row.closed)return;
      const partner=row.payment==='partner',paid=row.payment==='paid',payment=partner?'EMPRESA PARCEIRA':paid?'PAGO':row.payment==='pending'?'PENDENTE':row.payment==='unlinked'?'REVISAR ORÇAMENTO':'SEM ORÇAMENTO';
      const badge=`<span class="payment-badge ${paid?'paid':'pending'}" title="${partner?'Pedido enviado pela empresa parceira':paid?'Existe orçamento pago neste projeto':row.payment==='pending'?'Orçamento ainda não pago':row.payment==='unlinked'?'Orçamento antigo sem vínculo com o projeto atual':'Este projeto ainda não tem orçamento'}">${payment}</span>`;
      const position=row.position?`<span class="queue-position">#${row.position} para ${STAGE_LABELS[row.stage].toLocaleLowerCase('pt-BR')}</span>`:'';
      const pending=!row.closed&&row.reasons.length?`<small class="queue-card-pending">${h(row.reasons.join(' '))}</small>`:'';
      const delivery=row.deliveryDate&&!row.closed?`<small class="queue-card-delivery">Entrega ${h(dateLabel(row.deliveryDate))}</small>`:'';
      const service=SERVICE_LABELS[row.quote?.service_type||row.project?.service_type];
      card.querySelector('.workspace-copy')?.insertAdjacentHTML('beforeend',`<div class="workspace-production-details" data-queue-card-details>${service?`<small>${h(service)}</small>`:''}${position}<div class="workspace-payment-line">${badge}${delivery}</div>${pending}</div>`);
      if(row.position)card.dataset.queueStage=row.stage;
    });
    ctx.enhanceAdviceCards?.();
  }

  async function configureQueues(onSaved){
    if(state().currentProfile?.role!=='admin')return ctx.toast('Somente o administrador pode configurar as filas.','err');
    const missing=missingQueueStages(state().statuses);
    if(!missing.length)return ctx.toast('As três filas já estão configuradas.','ok');
    const modal=document.createElement('div');modal.className='modal-backdrop';
    modal.innerHTML=`<div class="modal compact" role="dialog" aria-modal="true" aria-labelledby="queueSetupTitle"><div class="modal-head"><div><div class="eyebrow">Operação</div><h2 id="queueSetupTitle">Ativar filas de produção</h2></div><button class="btn ghost small" data-close aria-label="Fechar">×</button></div><p>Serão adicionados os status necessários para estas etapas:</p><div class="queue-setup-list">${missing.map(stage=>`<div><b>${STAGE_LABELS[stage]}</b><small>Pedidos pagos, ordenados pela data de entrega</small></div>`).join('')}</div><p class="hint">Os pedidos entram na fila ao receberem o status correspondente, com pagamento e entrega registrados.</p><div class="modal-footer"><button class="btn" data-close>Cancelar</button><button class="btn primary" data-activate>Ativar filas</button></div></div>`;
    const previousFocus=document.activeElement,close=()=>{modal.remove();previousFocus?.focus?.()};
    modal.querySelectorAll('[data-close]').forEach(button=>button.onclick=close);
    modal.onkeydown=event=>{if(event.key==='Escape'&&!modal.querySelector('[data-activate]').disabled)close()};
    modal.querySelector('[data-activate]').onclick=async event=>{
      const button=event.currentTarget;button.disabled=true;button.textContent='Ativando…';
      try{
        const {data:existing,error}=await supabase.from('z19p_statuses').select('*').eq('owner_id',owner());if(error)throw error;
        const stages=missingQueueStages(existing),colors={art_work:'#9b8afb',ready_production:'#ff9f43',production:'#36bfd1'},now=new Date().toISOString();
        const maxOrder=Math.max(0,...(existing||[]).map(status=>Number(status.sort_order)||0));
        const rows=stages.map((stage,index)=>{const row={owner_id:owner(),name:STAGE_LABELS[stage],queue_stage:stage,is_finalized:false,active:true,color:colors[stage],sort_order:maxOrder+(index+1)*10,updated_at:now};for(const key of ['created_by','updated_by'])if((existing||[]).some(status=>Object.hasOwn(status,key)))row[key]=uid();return row});
        if(rows.length){const result=await supabase.from('z19p_statuses').insert(rows);if(result.error)throw result.error;await ctx.logEvent('production_queues_configured',`Ativou as filas: ${stages.map(stage=>STAGE_LABELS[stage]).join(', ')}`,{entityType:'status',metadata:{stages}})}
        close();ctx.toast('Filas ativadas. Escolha a etapa no status do pedido.','ok');await ctx.prepareDashboard();await onSaved?.();
      }catch(error){ctx.toast(error.code==='23505'?'As filas foram configuradas por outra pessoa. Atualize a página.':error.message,'err');button.disabled=false;button.textContent='Ativar filas'}
    };
    document.body.appendChild(modal);modal.querySelector('[data-activate]').focus();
  }

  async function enhanceDashboard({reload=true}={}){
    if(reload)await loadQueues();
    app.querySelector('.operation-launcher')?.remove();
    enhanceDashboardCards();
  }

  async function renderQueue(stage){
    if(!OPERATIONAL_STAGES.has(stage)){ctx.toast('Fila não encontrada.','err');return ctx.nav('/')}
    await ctx.prepareDashboard();await loadQueues();let scope=launcherScope;
    const draw=()=>{
      const snapshot=queueSnapshot,rows=scopeQueueRows(queueRows,uid(),scope).filter(row=>row.stage===stage),blocked=scopeQueueRows(snapshot.blocked,uid(),scope).filter(row=>row.blockedStage===stage),missing=snapshot.missingStages.includes(stage);
      const notice=snapshot.error?`<div class="queue-notice error" role="alert"><b>Consulta indisponível</b><p>${h(snapshot.error)}</p><button class="btn" data-retry-queues>Tentar novamente</button></div>`:missing?`<div class="queue-notice"><b>Esta fila precisa ser configurada</b><p>Associe um status à etapa ${h(STAGE_LABELS[stage])} para começar.</p>${state().currentProfile?.role==='admin'?'<button class="btn primary" data-configure-queues>Configurar filas</button>':'<small>Peça ao administrador para ativar a etapa.</small>'}</div>`:'';
      const empty=snapshot.error||missing?'':`<div class="empty"><b>${blocked.length?'Há pedidos aguardando liberação':scope==='mine'?'Nenhum pedido atribuído a você nesta fila':'Nenhum pedido liberado nesta etapa'}</b><div>${blocked.length?'Revise as pendências abaixo para liberar a produção.':scope==='mine'?'Use “Todos da equipe” para consultar a fila completa.':'O projeto precisa estar nesta etapa, com orçamento pago e data de entrega.'}</div></div>`;
      app.innerHTML=ctx.shell(`<main class="container simple-container queue-page"><section class="simple-hero"><div><div class="eyebrow">Fila operacional</div><h1>${h(STAGE_LABELS[stage])}</h1><p>Entrega mais próxima primeiro. A posição é a mesma nos cards da empresa.</p></div><div class="queue-scope" role="group" aria-label="Filtro da fila"><button class="${scope==='all'?'active':''}" aria-pressed="${scope==='all'}" data-scope="all">Todos da equipe</button><button class="${scope==='mine'?'active':''}" aria-pressed="${scope==='mine'}" data-scope="mine">Meus</button></div></section>${notice}<div class="queue-list">${rows.length?rows.map(row=>`<article class="queue-card ${row.responsibleId===uid()?'mine':''}"><span class="queue-number">#${row.position}</span><div><h2>${h(row.workspace.company_name||'Empresa')}</h2><p>${h(row.project.title||`Projeto ${row.project.sequence_no}`)} • ${h(row.responsibleId?ctx.profileName(row.responsibleId):'Sem responsável')}${row.responsibleId===uid()?' · Seu pedido':''}</p><div class="queue-meta"><span>Entrega ${h(dateLabel(row.deliveryDate))}</span><span class="payment-badge ${row.payment==='partner'?'pending':'paid'}">${row.payment==='partner'?'EMPRESA PARCEIRA':'PAGO'}</span><span>${h(row.status?.name||'')}</span></div></div><button class="btn primary" data-open-workspace="${h(row.workspace.id)}" data-project-id="${h(row.project?.id||'')}" data-partner-order="${row.payment==='partner'}">Abrir pedido</button></article>`).join(''):empty}</div>${blocked.length?`<section class="queue-blocked-list"><div class="section-title-row"><div><div class="eyebrow">Aguardando liberação</div><h2>${blocked.length} ${blocked.length===1?'pedido com pendências':'pedidos com pendências'}</h2></div></div>${blocked.map(row=>`<article class="queue-card queue-blocked"><span class="queue-number" aria-label="Pendente">!</span><div><h2>${h(row.workspace.company_name||'Empresa')}</h2><p>${h(row.reasons.join(' '))}</p><div class="queue-meta"><span class="payment-badge ${row.payment==='paid'?'paid':'pending'}">${row.payment==='partner'?'EMPRESA PARCEIRA':row.payment==='paid'?'PAGO':row.payment==='unlinked'?'REVISAR ORÇAMENTO':'PENDENTE'}</span></div></div><button class="btn" data-open-workspace="${h(row.workspace.id)}" data-project-id="${h(row.project?.id||'')}" data-partner-order="${row.payment==='partner'}">Revisar pedido</button></article>`).join('')}</section>`:''}</main>`,{back:true});
      ctx.bindCommon();app.querySelectorAll('[data-scope]').forEach(button=>button.onclick=()=>{scope=button.dataset.scope;launcherScope=scope;draw()});
      app.querySelectorAll('[data-open-workspace]').forEach(button=>button.onclick=()=>ctx.nav(button.dataset.partnerOrder==='true'?`/pedido-empresa/${encodeURIComponent(button.dataset.projectId)}`:`/ambiente/${button.dataset.openWorkspace}`));
      app.querySelector('[data-retry-queues]')?.addEventListener('click',()=>renderQueue(stage));
      app.querySelector('[data-configure-queues]')?.addEventListener('click',()=>configureQueues(()=>renderQueue(stage)));
    };draw();
  }

  function askDeliveryDate(initial=''){
    return new Promise(resolve=>{let cursor=initial?dateOnly(initial):new Date(),selected=initial?String(initial).slice(0,10):'';cursor=new Date(cursor.getFullYear(),cursor.getMonth(),1);const modal=document.createElement('div');modal.className='modal-backdrop';const draw=()=>{const year=cursor.getFullYear(),month=cursor.getMonth(),first=new Date(year,month,1).getDay(),days=new Date(year,month+1,0).getDate(),today=new Date();today.setHours(0,0,0,0);const cells=Array(first).fill('<span></span>');for(let day=1;day<=days;day++){const d=new Date(year,month,day),iso=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`,delta=Math.round((d-today)/86400000),hint=delta===0?'Hoje':delta===1?'Amanhã':d.toLocaleDateString('pt-BR',{weekday:'short'});cells.push(`<button type="button" class="calendar-day ${selected===iso?'selected':''} ${delta<0?'past':''}" data-date="${iso}"><b>${day}</b><small>${hint.replace('.','')}</small></button>`)}modal.innerHTML=`<div class="modal compact delivery-modal"><div class="modal-head"><div><div class="eyebrow">Produção</div><h2>Escolha a data de entrega</h2><p>Nenhum dia é escolhido automaticamente.</p></div><button class="btn ghost small close">×</button></div><div class="calendar-nav"><button class="btn ghost" id="prevMonth">←</button><select id="calendarMonth">${Array.from({length:12},(_,i)=>`<option value="${i}" ${i===month?'selected':''}>${new Date(2020,i,1).toLocaleDateString('pt-BR',{month:'long'})}</option>`).join('')}</select><input id="calendarYear" inputmode="numeric" value="${year}"><button class="btn ghost" id="nextMonth">→</button></div><div class="calendar-week"><span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span></div><div class="calendar-grid">${cells.join('')}</div><div class="modal-footer"><button class="btn close">Cancelar</button><button class="btn primary" id="confirmDate" ${selected?'':'disabled'}>Confirmar ${selected?dateLabel(selected):''}</button></div></div>`;modal.querySelectorAll('.close').forEach(b=>b.onclick=()=>{modal.remove();resolve(null)});modal.querySelector('#prevMonth').onclick=()=>{cursor=new Date(year,month-1,1);draw()};modal.querySelector('#nextMonth').onclick=()=>{cursor=new Date(year,month+1,1);draw()};modal.querySelector('#calendarMonth').onchange=e=>{cursor=new Date(year,Number(e.target.value),1);draw()};modal.querySelector('#calendarYear').onchange=e=>{const y=Number(e.target.value);if(y>=2020&&y<=2100){cursor=new Date(y,month,1);draw()}};modal.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>{selected=b.dataset.date;draw()});modal.querySelector('#confirmDate').onclick=()=>{const picked=dateOnly(selected);if(picked<today&&!confirm('Essa data já passou. Deseja usar mesmo assim?'))return;modal.remove();resolve(selected)}};document.body.contains(modal)?draw():(document.body.appendChild(modal),draw())});
  }

  async function markPaid(quote,project){
    const delivery=await askDeliveryDate(quote.delivery_date||project?.delivery_date||'');if(!delivery)return false;
    const {error}=await supabase.rpc('z19p_mark_quote_paid_for_production',{p_quote_id:quote.id,p_delivery_date:delivery});if(error){ctx.toast(error.message,'err');return false}ctx.toast('Orçamento pago e entrega definida.','ok');return true;
  }

  async function changeOperationalStatus(workspaceId,statusId){
    const s=state(),status=s.statuses.find(x=>x.id===statusId),project=await ctx.getLatestProject(workspaceId);if(!project)return ctx.toast('Este cliente ainda não possui projeto.','err'),false;
    if(project.finalized_at||project.desisted_at||finalized(project.status_id)){ctx.toast('Pedido encerrado. Crie um novo projeto para preservar o histórico.','err');return false}
    if(isCompanyPortalProject(project)){ctx.nav(`/pedido-empresa/${encodeURIComponent(project.id)}`);return false}
    const {data:quotes,error}=await supabase.from('z19p_quotes').select('*').eq('project_id',project.id).order('created_at',{ascending:false});if(error)return ctx.toast(error.message,'err'),false;
    const quote=quotes?.find(q=>q.payment_status==='paid')||quotes?.[0];if(!quote){ctx.toast('Crie um orçamento antes de liberar para produção.','err');if(ctx.openProjectQuote)await ctx.openProjectQuote(workspaceId);else ctx.nav(`/ambiente/${workspaceId}`);return false}
    const readiness=await supabase.rpc('z19p_quote_release_issues',{p_quote_id:quote.id,p_prepared:['ready_production','production'].includes(status?.queue_stage)});
    if(readiness.error){ctx.toast('Não foi possível conferir a liberação: '+readiness.error.message,'err');return false}
    if(!Array.isArray(readiness.data)){ctx.toast('A conferência da liberação não foi recebida. Tente novamente.','err');return false}
    if(readiness.data.length&&['ready_production','production'].includes(status?.queue_stage)){
      const summary=readiness.data.join(' ');
      if(!confirm('Há avisos de preparação: '+summary+'\n\nVocê conferiu o pedido e quer LIBERAR MESMO ASSIM para produção?'))return false;
    }else if(readiness.data.length){ctx.toast(readiness.data.join(' '),'err');await ctx.openProjectQuote?.(workspaceId,quote.id);return false}
    if(quote.payment_status!=='paid'){if(!confirm('O orçamento está PENDENTE. Deseja definir a entrega e marcar como pago agora?'))return false;if(!await markPaid(quote,project))return false;const refreshed=await supabase.from('z19p_projects').select('delivery_date').eq('id',project.id).single();if(refreshed.error)throw refreshed.error;project.delivery_date=refreshed.data.delivery_date}
    if(!project.delivery_date){const delivery=await askDeliveryDate(quote.delivery_date||'');if(!delivery)return false;const {error:updateError}=await supabase.from('z19p_projects').update({delivery_date:delivery,updated_at:new Date().toISOString(),updated_by:uid()}).eq('id',project.id);if(updateError)return ctx.toast(updateError.message,'err'),false}
    const {error:transitionError}=await supabase.rpc('z19p_transition_project',{p_project_id:project.id,p_status_id:status.id});if(transitionError)return ctx.toast(transitionError.message,'err'),false;
    ctx.toast(`Projeto enviado para ${STAGE_LABELS[status.queue_stage]}.`,'ok');return true;
  }

  async function startNewProject(){
    const s=state(),workspace=s.currentWorkspace,current=s.currentProjects?.[0];if(!workspace)return;
    if(current&&!finalized(current.status_id)&&!confirm('O projeto atual ainda está ativo. Criar outro projeto separado mesmo assim?'))return;
    const initial=s.statuses.find(st=>st.active!==false&&!st.is_finalized&&(st.queue_stage||'none')==='none');if(!initial)return ctx.toast('Cadastre um status inicial não operacional.','err');
    const project=await ctx.startNewProject(workspace,initial.id);if(!project)return;await ctx.createDefaultFoldersForWorkspace(workspace.id);await supabase.from('z19p_workspaces').update({status_id:initial.id,status_changed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',workspace.id);ctx.toast('Novo projeto criado sem misturar o histórico anterior.','ok');ctx.renderWorkspace(workspace.id);
  }

  function pdfFromJpeg(jpeg,width,height,pages){
    const objects=[],add=data=>objects.push(data instanceof Uint8Array?data:enc(data));
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add('<< /Type /Pages /Kids ['+pages.map((_,i)=>(6+i*2)+' 0 R').join(' ')+'] /Count '+pages.length+' >>');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    add(bytes(enc('<< /Type /XObject /Subtype /Image /Width '+width+' /Height '+height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>\nstream\n'),jpeg,enc('\nendstream')));
    pages.forEach((commands,index)=>{
      add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Logo 5 0 R >> >> /Contents '+(7+index*2)+' 0 R >>');
      const stream=enc(commands.join('\n'));add(bytes(enc('<< /Length '+stream.length+' >>\nstream\n'),stream,enc('\nendstream')));
    });
    const chunks=[enc('%PDF-1.4\n%Zero19\n')],offsets=[0];let offset=chunks[0].length;
    objects.forEach((obj,i)=>{offsets.push(offset);const part=bytes(enc((i+1)+' 0 obj\n'),obj,enc('\nendobj\n'));chunks.push(part);offset+=part.length});
    const xref=offset;let table='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
    for(let i=1;i<offsets.length;i++)table+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
    chunks.push(enc(table+'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF'));
    return new Blob(chunks,{type:'application/pdf'});
  }

  async function buildQuotePdf(quote,snapshot={}){
    if(!quote)throw new Error('Orçamento não encontrado.');
    const accountId=owner(),actorId=uid(),assertAccount=()=>{if(!accountId||!actorId||owner()!==accountId||uid()!==actorId)throw new Error('A conta mudou. Reabra o orçamento antes de gerar o PDF.');};assertAccount();
    quote=structuredClone(quote);
    const s=state(),workspace=structuredClone(snapshot.workspace||s.currentWorkspace||{}),project=structuredClone(snapshot.project||(s.currentProjects||[]).find(p=>p.id===quote.project_id)||null);
    if(!workspace.id||quote.workspace_id!==workspace.id||(quote.owner_id&&quote.owner_id!==accountId)||(workspace.owner_id&&workspace.owner_id!==accountId))throw new Error('Abra a empresa deste orçamento para gerar o PDF correto.');
    const sellerId=project?.responsible_user_id||workspace?.responsible_user_id||quote.created_by,seller=(s.teamProfiles||[]).find(p=>p.id===sellerId);
    const logo=new Image();logo.src=new URL('./zero19-logo.png',import.meta.url).href;
    try{await logo.decode()}catch{throw new Error('Não foi possível carregar o logo oficial. Reabra a página e tente gerar o PDF novamente.')}assertAccount();
    const logoCanvas=document.createElement('canvas');logoCanvas.width=1080;logoCanvas.height=Math.max(1,Math.round(1080*logo.naturalHeight/logo.naturalWidth));
    const logoContext=logoCanvas.getContext('2d');logoContext.fillStyle='#fff';logoContext.fillRect(0,0,logoCanvas.width,logoCanvas.height);logoContext.drawImage(logo,0,0,logoCanvas.width,logoCanvas.height);
    const logoBlob=await blobFromCanvas(logoCanvas,'image/jpeg',.96),jpeg=new Uint8Array(await logoBlob.arrayBuffer());
    const measure=document.createElement('canvas').getContext('2d'),pages=[],PAGE_HEIGHT=841.89,LEFT=42,RIGHT=553,BOTTOM=761,ORANGE=[1,.392,.157],INK=[.09,.09,.1],MUTED=[.36,.37,.4];
    const special=new Map([['€',128],['‚',130],['ƒ',131],['„',132],['…',133],['†',134],['‡',135],['ˆ',136],['‰',137],['Š',138],['‹',139],['Œ',140],['Ž',142],['‘',145],['’',146],['“',147],['”',148],['•',149],['–',150],['—',151],['˜',152],['™',153],['š',154],['›',155],['œ',156],['ž',158],['Ÿ',159]]);
    const pdfText=value=>[...String(value??'').normalize('NFC')].map(char=>{let code=special.get(char)??char.charCodeAt(0);if(code===10||code===13)return ' ';if(code>255)code=63;if(code<32||code>=127)return '\\'+code.toString(8).padStart(3,'0');return ['\\','(',')'].includes(char)?'\\'+char:char}).join('');
    const font=(size,bold)=>{measure.font=(bold?'700 ':'400 ')+size+'px Arial'};
    const textWidth=(value,size=10,bold=false)=>{font(size,bold);return measure.measureText(String(value)).width};
    const wrap=(value,width,size=10,bold=false)=>{
      const result=[];font(size,bold);
      for(const paragraph of String(value??'').split(/\r?\n/)){
        let line='';
        for(const word of paragraph.trim().split(/\s+/).filter(Boolean)){
          if(measure.measureText(line?line+' '+word:word).width<=width){line=line?line+' '+word:word;continue}
          if(line){result.push(line);line=''}
          if(measure.measureText(word).width<=width){line=word;continue}
          for(const char of word){if(line&&measure.measureText(line+char).width>width){result.push(line);line=''}line+=char}
        }
        result.push(line);
      }
      return result;
    };
    let commands=[],y=0;
    const rect=(x,top,w,height,color)=>commands.push(color.join(' ')+' rg '+x.toFixed(2)+' '+(PAGE_HEIGHT-top-height).toFixed(2)+' '+w.toFixed(2)+' '+height.toFixed(2)+' re f');
    const text=(value,x,baseline,size=10,bold=false,color=INK,align='left')=>{
      if(align==='right')x-=textWidth(value,size,bold);
      commands.push('BT /'+(bold?'F2':'F1')+' '+size+' Tf '+color.join(' ')+' rg 1 0 0 1 '+x.toFixed(2)+' '+(PAGE_HEIGHT-baseline).toFixed(2)+' Tm ('+pdfText(value)+') Tj ET');
    };
    const rule=top=>rect(LEFT,top,RIGHT-LEFT,.6,[.87,.88,.9]);
    const tableHeader=()=>{rect(LEFT,y,RIGHT-LEFT,25,[.95,.95,.96]);text('PRODUTO / PERSONALIZAÇÃO',LEFT+9,y+16,8,true,MUTED);text('QTD.',353,y+16,8,true,MUTED,'right');text('UNITÁRIO',448,y+16,8,true,MUTED,'right');text('TOTAL',RIGHT-9,y+16,8,true,MUTED,'right');y+=37};
    const newPage=(table=false)=>{
      commands=[];pages.push(commands);rect(0,0,595.28,108,[1,1,1]);rect(LEFT,105,RIGHT-LEFT,3,ORANGE);
      commands.push('q 158 0 0 52.67 42 '+(PAGE_HEIGHT-80.67).toFixed(2)+' cm /Logo Do Q');
      text('ORÇAMENTO',RIGHT,49,19,true,INK,'right');text('Nº '+String(quote.id||'').slice(0,8).toUpperCase(),RIGHT,68,9,false,MUTED,'right');
      text(quote.payment_status==='paid'?'PAGO':'PENDENTE',RIGHT,87,9,true,quote.payment_status==='paid'?[.05,.45,.28]:[.8,.3,.08],'right');
      y=137;if(table)tableHeader();
    };
    const ensure=(height,table=false)=>{if(y+height>BOTTOM)newPage(table)};
    const paragraph=(value,{size=10,bold=false,color=INK,width=RIGHT-LEFT,after=7}={})=>{
      for(const line of wrap(value,width,size,bold)){ensure(size+7);text(line,LEFT,y,size,bold,color);y+=size+5}y+=after;
    };
    newPage();
    paragraph(workspace?.company_name||'Cliente',{size:20,bold:true,after:5});
    const clientLine=[workspace?.client_name,workspace?.phone,workspace?.state].filter(Boolean).join('  |  ');
    if(clientLine)paragraph(clientLine,{size:10,color:MUTED,after:8});
    paragraph(quote.title||'Orçamento',{size:13,bold:true,after:3});
    if(SERVICE_LABELS[quote.service_type])paragraph('Serviço: '+SERVICE_LABELS[quote.service_type],{color:MUTED,after:3});
    paragraph('Projeto: '+(project?.title||(project?.sequence_no?'Projeto '+project.sequence_no:quote.project_id?String(quote.project_id).slice(0,8):'Não informado')),{color:MUTED,after:1});
    paragraph('Responsável: '+(seller?.full_name||ctx.profileName(sellerId)||'Não informado')+(seller?.phone?'  |  '+seller.phone:''),{color:MUTED,after:1});
    const created=quote.created_at?new Date(quote.created_at):null;
    paragraph('Criado em: '+(created&&!Number.isNaN(created.getTime())?created.toLocaleDateString('pt-BR'):'Não informado')+'  |  Entrega: '+(quote.delivery_date?dateLabel(quote.delivery_date):'A combinar'),{color:MUTED,after:9});
    if(quote.delivery_term)paragraph('Condição de entrega: '+quote.delivery_term,{color:MUTED});
    ensure(65);tableHeader();
    for(const [index,item] of (quote.items||[]).entries()){
      const quantity=Math.max(1,parseInt(item.quantity,10)||1),unit=ctx.quoteItemUnit(item),details=[];
      const addDetail=value=>{for(const line of wrap(value,269,9))details.push(line)};
      const fabric=item.fabric_name||item.fabric_model||item.fabric;if(fabric)addDetail('Tecido: '+fabric);
      if(item.pricing_mode==='piece_plus_print'&&(!item.item_kind||item.item_kind==='product'))addDetail('Peça: '+ctx.fmtMoney(Number(String(item.piece_price||0).replace(',','.'))));
      for(const print of item.prints||[]){
        const dimensions=[print.width_cm?String(print.width_cm)+' cm larg.':'',print.height_cm?String(print.height_cm)+' cm alt.':''].filter(Boolean).join(' × ');
        const kindLabel={art:'Arte / DTF',application:'Aplicação',removal:'Remoção'}[item.item_kind]||'Estampa';
        addDetail(kindLabel+': '+(print.placement||'Posição não informada')+(dimensions?' | '+dimensions:'')+(item.pricing_mode==='piece_plus_print'?' | '+ctx.fmtMoney(Number(String(print.price||0).replace(',','.'))):''));
      }
      if(item.notes)addDetail(item.notes);
      const names=wrap((index+1)+'. '+(item.product_name||'Produto'),269,11,true);
      ensure(Math.min(100,names.length*15+details.length*13+20),true);
      let first=true;
      for(const line of names){ensure(18,true);text(line,LEFT+8,y+2,11,true);if(first){text(String(quantity),353,y+2,10,false,INK,'right');text(ctx.fmtMoney(unit),448,y+2,10,false,INK,'right');text(ctx.fmtMoney(unit*quantity),RIGHT-9,y+2,10,true,INK,'right');first=false}y+=15}
      for(const detail of details){ensure(16,true);text(detail,LEFT+8,y,9,false,MUTED);y+=13}
      y+=7;ensure(10,true);rule(y);y+=17;
    }
    ensure(100);
    const total=ctx.quoteTotal(quote);
    text('Subtotal',LEFT+8,y+6,11,false,MUTED);text(ctx.fmtMoney(total),RIGHT-9,y+6,11,false,INK,'right');y+=23;
    rect(LEFT,y,RIGHT-LEFT,49,INK);text('TOTAL DO ORÇAMENTO',LEFT+14,y+30,11,true,[1,1,1]);text(ctx.fmtMoney(total),RIGHT-14,y+31,21,true,[1,.59,.39],'right');y+=74;
    if(quote.notes){ensure(35);paragraph('Observações',{size:12,bold:true,after:2});paragraph(quote.notes,{size:10,color:MUTED,after:10})}
    for(let index=0;index<pages.length;index++){
      commands=pages[index];rule(786);text('Atendimento: 9h às 18h',LEFT,805,9,false,MUTED);text('Página '+(index+1)+' de '+pages.length,RIGHT,805,9,false,MUTED,'right');
    }
    assertAccount();return pdfFromJpeg(jpeg,logoCanvas.width,logoCanvas.height,pages);
  }

  async function persistPdf(quote,blob,{accountId=owner(),actorId=uid(),assertCurrent}={}){
    const guard=()=>{if(!accountId||!actorId||owner()!==accountId||uid()!==actorId)throw new Error('A conta mudou. Reabra o orçamento.');assertCurrent?.();};guard();
    if(quote.owner_id!==accountId||!quote.id||blob?.type!=='application/pdf')throw new Error('Documento ou conta inválidos.');
    const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()),hash=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');guard();
    const documents=()=>supabase.from('z19p_quote_documents');
    const revisionEqual=(a,b)=>(a||null)===(b||null);
    const checkRevision=async()=>{guard();const result=await supabase.from('z19p_quotes').select('id,owner_id,workspace_id,project_id,updated_at').eq('id',quote.id).eq('owner_id',accountId).single();guard();if(result.error)throw result.error;if(!result.data||result.data.owner_id!==accountId||result.data.workspace_id!==quote.workspace_id||result.data.project_id!==quote.project_id||!revisionEqual(result.data.updated_at,quote.updated_at)){const error=new Error('Este orçamento mudou durante a geração. Reabra e gere o PDF atualizado.');error.code='QUOTE_REVISION_CHANGED';throw error}};
    const latest=async()=>{const result=await documents().select('*').eq('owner_id',accountId).eq('quote_id',quote.id).order('document_version',{ascending:false}).limit(1);guard();if(result.error)throw result.error;return result.data?.[0]||null;};
    const matches=doc=>doc?.owner_id===accountId&&doc.quote_id===quote.id&&doc.project_id===(quote.project_id||null)&&doc.content_hash===hash&&revisionEqual(doc.quote_updated_at,quote.updated_at)&&doc.stale===false&&Number.isInteger(doc.document_version)&&doc.document_version>0&&String(doc.storage_path).startsWith(accountId+'/quote-documents/'+quote.id+'/')&&String(doc.storage_path).endsWith('.pdf');
    await checkRevision();let previous=await latest();if(matches(previous))return previous;
    // The nonce makes rollback exclusively target this new upload, never an
    // older published version or another device's simultaneous PDF.
    const path=accountId+'/quote-documents/'+quote.id+'/orcamento-'+crypto.randomUUID()+'.pdf';
    let uploaded=false,confirmed=false,insertAttempted=false,definiteRejection=false,stored=null;
    const cleanup=async()=>{if(!uploaded||confirmed||owner()!==accountId||uid()!==actorId)return false;try{const result=await supabase.storage.from('z19p-assets').remove([path]);return !result.error}catch{return false}};
    try{
      const upload=await supabase.storage.from('z19p-assets').upload(path,blob,{contentType:'application/pdf',upsert:false});if(upload.error)throw upload.error;uploaded=true;guard();
      await checkRevision();
      for(let attempt=0;attempt<3;attempt++){
        const version=(Number(previous?.document_version)||0)+1,payload={owner_id:accountId,quote_id:quote.id,project_id:quote.project_id||null,storage_path:path,content_hash:hash,quote_updated_at:quote.updated_at||null,document_version:version,generated_by:actorId,metadata:{total:ctx.quoteTotal(quote)}};
        insertAttempted=true;const result=await documents().insert(payload).select().single();guard();
        if(result.error){definiteRejection=/^[0-9A-Z]{5}$/.test(result.error.code||'');if(result.error.code==='23505'){previous=await latest();if(matches(previous)){await cleanup();return previous}if(attempt<2)continue}throw result.error}
        if(!matches(result.data)||result.data.storage_path!==path)throw new Error('O banco não confirmou o registro completo do PDF.');
        stored=result.data;confirmed=true;break;
      }
      await checkRevision();return stored;
    }catch(error){
      // If the insert response was lost, check our exact unique path before any
      // cleanup. A possibly committed document must never lose its PDF.
      if(uploaded&&insertAttempted&&!confirmed&&owner()===accountId&&uid()===actorId){
        try{const probe=await documents().select('*').eq('owner_id',accountId).eq('quote_id',quote.id).eq('storage_path',path).maybeSingle();guard();if(!probe.error&&matches(probe.data)){stored=probe.data;confirmed=true;await checkRevision();return stored}}catch{}
      }
      if(confirmed){
        if(error.code==='QUOTE_REVISION_CHANGED'&&owner()===accountId&&uid()===actorId){try{await documents().update({stale:true}).eq('owner_id',accountId).eq('id',stored.id).eq('storage_path',path)}catch{}}
        throw new Error((error.message||'Não foi possível confirmar a revisão do orçamento.')+' O PDF não será apresentado como atualizado; gere novamente.');
      }
      const removed=uploaded&&(!insertAttempted||definiteRejection)?await cleanup():false;
      const suffix=uploaded&&!removed?' A confirmação ficou incompleta; nenhum link novo foi divulgado. Reabra o orçamento antes de tentar novamente.':'';
      throw new Error((error.message||'Não foi possível registrar o PDF.')+suffix);
    }
  }

  function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2500)}
  const quotePdfBusy=new Set();
  async function pdfAction(quote,action){
    const accountId=owner(),actorId=uid(),workspaceId=state().currentWorkspace?.id,key=accountId+':'+quote?.id;
    if(!accountId||!actorId||!quote?.id||!workspaceId)return ctx.toast('Entre na conta e abra a empresa deste orçamento.','err');
    if(quotePdfBusy.has(key))return;
    const assertCurrent=()=>{if(owner()!==accountId||uid()!==actorId||state().currentWorkspace?.id!==workspaceId)throw new Error('A conta ou empresa mudou. Reabra o orçamento.');};
    quotePdfBusy.add(key);const controls=[...app.querySelectorAll('.pdf-quote,.share-pdf')].filter(button=>button.dataset.id===quote.id);controls.forEach(button=>button.disabled=true);
    try{return await safe(async()=>{
      assertCurrent();
      const fresh=await supabase.from('z19p_quotes').select('*').eq('id',quote.id).eq('owner_id',accountId).single();assertCurrent();if(fresh.error)throw fresh.error;
      quote=fresh.data;if(!quote||quote.owner_id!==accountId||quote.workspace_id!==workspaceId)throw new Error('O orçamento não pertence à empresa aberta.');
      const workspaceResult=await supabase.from('z19p_workspaces').select('*').eq('id',workspaceId).eq('owner_id',accountId).single();assertCurrent();if(workspaceResult.error)throw workspaceResult.error;
      const workspace=workspaceResult.data;if(!workspace||workspace.owner_id!==accountId)throw new Error('Empresa indisponível para esta conta.');
      let project=null;if(quote.project_id){const result=await supabase.from('z19p_projects').select('*').eq('id',quote.project_id).eq('owner_id',accountId).eq('workspace_id',workspaceId).single();assertCurrent();if(result.error)throw result.error;project=result.data}
      const blob=await buildQuotePdf(quote,{workspace,project});assertCurrent();
      const doc=await persistPdf(quote,blob,{accountId,actorId,assertCurrent});assertCurrent();
      const file=new File([blob],'orcamento-'+quote.id.slice(0,8)+'.pdf',{type:'application/pdf'});
      if(action!=='share'){downloadBlob(blob,'orcamento-v'+doc.document_version+'.pdf');ctx.toast('PDF gerado e registrado.','ok');return doc}
      const canShareFile=Boolean(navigator.share&&navigator.canShare?.({files:[file]}));
      let clientUrl='';
      if(workspace.share_token){
        if(!workspace.share_enabled){
          const result=await supabase.from('z19p_workspaces').update({share_enabled:true}).eq('id',workspaceId).eq('owner_id',accountId).select('id,owner_id,share_enabled,share_token').single();assertCurrent();
          if(result.error||result.data?.id!==workspaceId||result.data?.owner_id!==accountId||result.data?.share_enabled!==true){downloadBlob(blob,file.name);ctx.toast('PDF baixado. Não foi possível confirmar a ativação do link do cliente.','err');return doc}
          workspace.share_token=result.data.share_token;workspace.share_enabled=true;if(state().currentWorkspace?.id===workspaceId)state().currentWorkspace.share_enabled=true;
        }
        if(typeof workspace.share_token==='string'&&workspace.share_token){const hosted=/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)?'https://019-personalizacoes.vercel.app/':location.origin+location.pathname;clientUrl=hosted+'#/cliente/'+encodeURIComponent(workspace.share_token)}
      }
      assertCurrent();const modal=document.createElement('div');modal.className='modal-backdrop';
      const message='Olá! Segue o orçamento da Zero 19: '+clientUrl;
      modal.innerHTML='<div class="modal compact" role="dialog" aria-modal="true" aria-label="Compartilhar orçamento"><div class="modal-head"><div><div class="eyebrow">Orçamento</div><h2>PDF pronto para compartilhar</h2></div><button class="btn ghost small close" aria-label="Fechar">×</button></div><p>'+(clientUrl?'O link abre a área do cliente com o PDF atualizado.':'Baixe o arquivo ou compartilhe diretamente pelo seu dispositivo.')+'</p><div class="modal-footer" style="flex-wrap:wrap">'+(canShareFile?'<button class="btn primary" data-share-pdf-file>Compartilhar arquivo</button>':'')+(clientUrl?'<a class="btn whatsapp" href="https://wa.me/?text='+encodeURIComponent(message)+'" target="_blank" rel="noopener noreferrer">Enviar link pelo WhatsApp</a>':'')+'<button class="btn" data-download-pdf>Baixar PDF</button></div>'+(clientUrl?'<div class="field"><label>Link público do cliente</label><input data-client-pdf-url aria-label="Link público do orçamento" readonly value="'+h(clientUrl)+'"><button class="btn" data-copy-pdf-link>Copiar link</button></div>':'')+'<div class="hint" role="status">O envio de link pelo WhatsApp não anexa o arquivo automaticamente.</div></div>';
      const previousFocus=document.activeElement,close=()=>{modal.remove();window.removeEventListener('z19:account-changing',close);if(previousFocus?.isConnected)previousFocus.focus()};
      document.body.appendChild(modal);modal.querySelector('.close').onclick=close;modal.querySelector('.close').focus();window.addEventListener('z19:account-changing',close,{once:true});
      modal.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close()}if(event.key==='Tab'){const nodes=[...modal.querySelectorAll('button,a[href]')],first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}});
      modal.querySelector('[data-copy-pdf-link]')?.addEventListener('click',async()=>{try{assertCurrent();await navigator.clipboard.writeText(clientUrl);assertCurrent();modal.querySelector('.hint').textContent='Link copiado. Envie-o ao cliente pelo aplicativo de sua preferência.'}catch(error){if(owner()!==accountId||uid()!==actorId||state().currentWorkspace?.id!==workspaceId){close();return}const input=modal.querySelector('[data-client-pdf-url]');input?.focus();input?.select();modal.querySelector('.hint').textContent='Selecione e copie o endereço acima.'}});
      modal.querySelector('[data-download-pdf]').onclick=()=>{try{assertCurrent();downloadBlob(blob,file.name)}catch(error){close();ctx.toast(error.message,'err')}};
      modal.querySelector('a')?.addEventListener('click',event=>{try{assertCurrent()}catch(error){event.preventDefault();close();ctx.toast(error.message,'err')}});
      modal.querySelector('[data-share-pdf-file]')?.addEventListener('click',async()=>{try{assertCurrent();await navigator.share({title:quote.title||'Orçamento Zero 19',files:[file]})}catch(error){if(error?.name!=='AbortError')ctx.toast('O dispositivo não compartilhou o arquivo. Use Baixar PDF ou o link do WhatsApp.','err')}});
      return doc;
    })}finally{quotePdfBusy.delete(key);controls.forEach(button=>{if(button.isConnected)button.disabled=false})}
  }
  function folderInReadyTree(folderId){const folders=state().currentFolders||[];let folder=folders.find(f=>f.id===folderId),guard=0;while(folder&&guard++<50){if(folder.purpose==='artes_prontas')return true;folder=folders.find(f=>f.id===folder.parent_id)}return false}
  async function openPrintProfile(asset,options={}){
    if(!asset)return;
    const profileAccount=owner(),profileActor=uid(),isCurrent=()=>owner()===profileAccount&&uid()===profileActor&&(!options.isCurrent||options.isCurrent()),assertCurrent=()=>{if(!isCurrent()||asset.owner_id&&asset.owner_id!==profileAccount)throw new Error('A conta ou o pedido mudou. Reabra a arte antes de salvar a medida.');};
    let profile;
    try{assertCurrent();const result=await supabase.from('z19p_asset_print_profiles').select('*').eq('asset_id',asset.id).maybeSingle();assertCurrent();if(result.error)throw result.error;profile=result.data}catch(error){ctx.toast(error.message,'err');options.onCancel?.();return}
    const ratio=(asset.width||1)/(asset.height||1),modal=document.createElement('div');modal.className='modal-backdrop';let width=Number(profile?.default_width_cm)||Number(asset.metadata?.requested_width_cm)||0,height=Number(profile?.default_height_cm)||Number(asset.metadata?.requested_height_cm)||0,mode='width',busy=false;if(width>0&&!(height>0))height=width/ratio;else if(height>0&&!(width>0))width=height*ratio;
    const required=folderInReadyTree(asset.folder_id),ready=profile?profile.ready_for_print:(required||options.required||asset.metadata?.print_ready_intent===true);
    modal.innerHTML=`<div class="modal compact print-profile-modal" role="dialog" aria-modal="true" aria-label="Medida de produção"><div class="modal-head"><div><div class="eyebrow">Arte para produção</div><h2>Medida de produção</h2></div><button class="btn ghost small close" aria-label="Fechar">×</button></div><div class="size-preview"><img src="${ctx.publicUrl(asset.processed_path||asset.original_path)}" alt=""><div><b>${h(asset.name)}</b><span>${asset.width} × ${asset.height}px</span></div></div><label class="print-ready-toggle"><span><b>Arte pronta para impressão</b><small>Ative para disponibilizar no Montar Filme.</small></span><span class="switch"><input id="profileReady" type="checkbox" ${ready?'checked':''}><span></span></span></label><div class="seg"><button class="active" data-mode="width">Largura</button><button data-mode="height">Altura</button></div><div class="form-grid"><div class="field"><label for="sizeWidth">Largura (cm)</label><input id="sizeWidth" inputmode="decimal" value="${width?String(width).replace('.',','):''}" placeholder="Ex.: 28"></div><div class="field"><label for="sizeHeight">Altura (cm)</label><input id="sizeHeight" inputmode="decimal" value="${height?String(Number(height.toFixed(3))).replace('.',','):''}" readonly placeholder="Proporcional"></div><div class="field full"><label class="check-row"><input id="sizeHalftone" type="checkbox" ${profile?.halftone?'checked':''}> Esta arte é halftone</label></div><div class="field full"><label class="check-row"><input id="sizeInternal" type="checkbox" ${profile?.allow_internal_nesting!==false&&!profile?.halftone?'checked':''}> Permitir encaixe em áreas vazias internas</label></div></div><div class="field"><label>Rotação permitida no filme</label><select id="sizeRotation">${[['none','Sem rotação'],['180','0° e 180°'],['90','0° e 90°'],['free','0°, 90°, 180° e 270°']].map(([value,label])=>`<option value="${value}" ${(profile?.rotation_policy||'180')===value?'selected':''}>${label}</option>`).join('')}</select></div><div class="size-output"><span>Proporção ${ratio.toFixed(4)}</span><span data-size-pixels>Informe a medida em centímetros</span></div><div class="modal-footer"><button class="btn close">${options.required?'Deixar pendente':'Cancelar'}</button><button class="btn primary" id="savePrintProfile">Salvar medida</button></div></div>`;
    document.body.append(modal);const close=()=>{if(busy)return;modal.remove();options.onCancel?.()};
    modal.querySelectorAll('.close').forEach(b=>b.onclick=close);modal.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
    const widthInput=modal.querySelector('#sizeWidth'),heightInput=modal.querySelector('#sizeHeight'),parse=value=>Number(String(value).replace(',','.'));
    const update=()=>{modal.querySelector('[data-size-pixels]').textContent=width>0?`${cmToPx(width)} × ${cmToPx(height)} px • 300 DPI`:'Informe a medida em centímetros'};
    modal.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;widthInput.readOnly=mode!=='width';heightInput.readOnly=mode!=='height';modal.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('active',x===b));(mode==='width'?widthInput:heightInput).focus()});
    widthInput.oninput=()=>{width=parse(widthInput.value)||0;height=width/ratio;heightInput.value=width?String(Number(height.toFixed(3))).replace('.',','):'';update()};
    heightInput.oninput=()=>{height=parse(heightInput.value)||0;width=height*ratio;widthInput.value=height?String(Number(width.toFixed(3))).replace('.',','):'';update()};
    modal.querySelector('#sizeHalftone').onchange=e=>{modal.querySelector('#sizeInternal').disabled=e.target.checked;if(e.target.checked)modal.querySelector('#sizeInternal').checked=false};
    modal.querySelector('#sizeInternal').disabled=Boolean(profile?.halftone);update();widthInput.focus();
    modal.querySelector('#savePrintProfile').onclick=async()=>{
      if(!(Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0&&width<=1000&&height<=1000))return ctx.toast('Informe uma medida válida maior que zero.','err');
      const button=modal.querySelector('#savePrintProfile');if(busy)return;busy=true;button.disabled=true;
      try{
        assertCurrent();
        const halftone=modal.querySelector('#sizeHalftone').checked,payload={asset_id:asset.id,owner_id:profileAccount,project_id:asset.project_id||null,default_width_cm:width,default_height_cm:height,aspect_ratio:ratio,halftone,allow_internal_nesting:!halftone&&modal.querySelector('#sizeInternal').checked,rotation_policy:modal.querySelector('#sizeRotation').value,ready_for_print:modal.querySelector('#profileReady').checked,created_by:profile?.created_by||profileActor,updated_by:profileActor,updated_at:new Date().toISOString()};
        const {error}=await supabase.from('z19p_asset_print_profiles').upsert(payload,{onConflict:'asset_id'});if(error)throw error;
        assertCurrent();
        await ctx.logEvent('asset_print_profile_updated',`Definiu ${width.toFixed(2)} × ${height.toFixed(2)} cm para ${asset.name}`,{workspaceId:asset.workspace_id,projectId:asset.project_id||null,entityType:'asset',entityId:asset.id,metadata:{width_cm:width,height_cm:height,halftone,ready:payload.ready_for_print}});
        modal.remove();ctx.toast(payload.ready_for_print?'Medida salva. Arte liberada no Montar Filme.':'Medida salva. Arte fora do Montar Filme.','ok');options.onSaved?.(payload);if(options.render!==false)await ctx.renderWorkspace(asset.workspace_id);
      }catch(error){ctx.toast(error.message||'Não foi possível salvar a medida.','err')}finally{busy=false;button.disabled=false}
    };
  }

  async function enhanceAssetCards(){
    const s=state();
    // Studio access is independent of print readiness and of the profiles request.
    // The shared binder is idempotent, including after folder/search re-renders.
    for(const asset of s.currentAssets||[]){const card=app.querySelector(`[data-asset="${asset.id}"]`);if(card)attachAssetStudioActions(card,asset,{garmentEnabled:ctx.isGarmentStudioEnabled?.()===true,openGarment:ctx.openArtGarment,openMockup:ctx.openArtMockup,openEditor:ctx.openArtEditor,open3D:ctx.openArt3D,openPresentation:ctx.openArtPresentation,openBlank:ctx.openArtBlank,onError:error=>ctx.toast(error.message||'Não foi possível abrir o estúdio.','err')});}
    const assetIds=(s.currentAssets||[]).filter(a=>a.asset_type==='arte').map(a=>a.id);if(!assetIds.length)return;
    const result=await supabase.from('z19p_asset_print_profiles').select('*').in('asset_id',assetIds);if(result.error){console.warn('print profiles',result.error);return}
    const profiles=new Map((result.data||[]).map(profile=>[profile.asset_id,profile]));
    for(const asset of s.currentAssets||[]){
      if(asset.asset_type!=='arte')continue;const card=app.querySelector(`[data-asset="${asset.id}"]`);if(!card)continue;
      card.querySelectorAll('.define-size,.ready-size,.missing-size').forEach(node=>node.remove());
      const profile=profiles.get(asset.id),required=folderInReadyTree(asset.folder_id)||asset.metadata?.print_ready_intent;
      card.querySelector('.asset-meta')?.insertAdjacentHTML('beforeend',profile?`<span class="${profile.ready_for_print?'ready-size':'missing-size'}">${Number(profile.default_width_cm).toFixed(1)} × ${Number(profile.default_height_cm).toFixed(1)} cm${profile.halftone?' • halftone':''}${profile.ready_for_print?'':' • não liberada'}</span>`:required?'<span class="missing-size">MEDIDA PENDENTE</span>':'');
      const button=document.createElement('button');button.className=`btn small define-size ${required&&!profile?.ready_for_print?'primary':''}`;button.textContent=profile?'Medida / impressão':'Definir medida';button.onclick=()=>openPrintProfile(asset);card.querySelector('.asset-actions')?.prepend(button);
    }
  }

  async function enhanceWorkspace(){
    const s=state(),workspace=s.currentWorkspace;if(!workspace||workspace.workspace_type&&workspace.workspace_type!=='client')return;
    const project=s.currentProjects?.[0],readyFolder=(s.currentFolders||[]).find(folder=>folder.purpose==='artes_prontas'||['artes prontas','arte pronta'].includes(norm(folder.name)));
    if(project&&!readyFolder){const {error}=await supabase.from('z19p_folders').insert({owner_id:owner(),workspace_id:workspace.id,project_id:project.id,name:'Artes prontas',purpose:'artes_prontas',sort_order:20,created_by:uid(),updated_by:uid()});if(!error){await ctx.renderWorkspace(workspace.id);return}console.warn('ready folder',error)}
    if(readyFolder&&readyFolder.purpose!=='artes_prontas'){const {error}=await supabase.from('z19p_folders').update({purpose:'artes_prontas',updated_by:uid(),updated_at:new Date().toISOString()}).eq('id',readyFolder.id);if(!error){await ctx.renderWorkspace(workspace.id);return}console.warn('ready folder purpose',error)}
    app.querySelector('.project-history .section-title-row')?.insertAdjacentHTML('beforeend','<button class="btn primary small" id="startNewProjectV217">＋ Iniciar novo projeto</button>');app.querySelector('#startNewProjectV217')?.addEventListener('click',startNewProject);
    for(const quote of s.currentQuotes||[]){const edit=app.querySelector(`.edit-quote[data-id="${quote.id}"]`),card=edit?.closest('.quote-summary');if(!card)continue;card.classList.add(`payment-${quote.payment_status||'unpaid'}`);card.querySelector('.quote-title-line')?.insertAdjacentHTML('beforeend',`<span class="payment-badge ${quote.payment_status==='paid'?'paid':'pending'}">${quote.payment_status==='paid'?'PAGO':'PENDENTE'}</span>`);const actions=card.querySelector('.quote-actions');actions?.insertAdjacentHTML('afterbegin',`${quote.payment_status==='paid'?'':`<button class="btn primary small pay-quote" data-id="${quote.id}">Marcar pago</button>`}<button class="btn small pdf-quote" data-id="${quote.id}">PDF</button><button class="btn ghost small share-pdf" data-id="${quote.id}">Compartilhar</button>`);if(quote.payment_status==='paid'){edit.disabled=true;edit.title='Venda paga exige estorno explícito para edição.';const del=card.querySelector('.delete-quote');if(del){del.disabled=true;del.title='Venda paga exige estorno explícito.'}}}
    app.querySelectorAll('.pay-quote').forEach(b=>b.onclick=async()=>{const q=s.currentQuotes.find(x=>x.id===b.dataset.id),project=s.currentProjects.find(p=>p.id===q.project_id)||s.currentProjects[0];if(await markPaid(q,project))ctx.renderWorkspace(workspace.id)});app.querySelectorAll('.pdf-quote').forEach(b=>b.onclick=()=>pdfAction(s.currentQuotes.find(x=>x.id===b.dataset.id),'download'));app.querySelectorAll('.share-pdf').forEach(b=>b.onclick=()=>pdfAction(s.currentQuotes.find(x=>x.id===b.dataset.id),'share'));
    await enhanceAssetCards();
  }

  async function enhancePublic(token){
    const {data,error}=await supabase.rpc('z19p_get_public_quote_documents',{p_workspace_token:token});if(error){console.warn('PDF público indisponível',error);return}if(!Array.isArray(data)||!data.length)return;const section=app.querySelector('.client-quotes');if(!section)return;
    const byQuote=new Map();
    for(const doc of data){if(doc.stale||!doc.storage_path)continue;const previous=byQuote.get(doc.quote_id);if(!previous||Number(doc.document_version)>Number(previous.document_version)||Number(doc.document_version)===Number(previous.document_version)&&new Date(doc.generated_at||0)>new Date(previous.generated_at||0))byQuote.set(doc.quote_id,doc)}
    const latest=[...byQuote.values()];section.querySelector('.public-pdf-list')?.remove();if(!latest.length)return;
    section.insertAdjacentHTML('beforeend',`<div class="public-pdf-list">${latest.map(d=>`<a class="btn primary" href="${h(ctx.publicUrl(d.storage_path))}" target="_blank" rel="noopener">Abrir PDF do orçamento · versão ${Number(d.document_version)}</a>`).join('')}</div>`);
  }

  async function renderTeams(){
    const [teamsResult,kitsResult,setsResult,sourcesResult]=await Promise.all([
      supabase.from('z19p_teams').select('*').order('name'),
      supabase.from('z19p_team_kits').select('*').order('season',{ascending:false}),
      supabase.from('z19p_customization_sets').select('*').order('updated_at',{ascending:false}),
      supabase.from('z19p_customization_sources').select('id,set_id,source_type,original_name,is_working_source')
    ]);
    if(teamsResult.error)return schemaMissing(teamsResult.error);
    const teams=teamsResult.data||[],kits=kitsResult.data||[],sets=setsResult.data||[],sources=sourcesResult.data||[],teamMap=new Map(teams.map(x=>[x.id,x])),kitMap=new Map(kits.map(x=>[x.id,x]));
    const sourceMap=new Map();for(const source of sources){const list=sourceMap.get(source.set_id)||[];list.push(source);sourceMap.set(source.set_id,list)}
    const setHTML=set=>{const setSources=sourceMap.get(set.id)||[],kind=customizationKind(set),isLettering=kind==='lettering',description=isLettering?`Nome ${Number(set.default_name_height_cm)} cm • Número ${Number(set.default_number_height_cm)} cm`:kind==='sponsors'?'Patrocínios compostos da camisa, mantendo posição e proporção.':'Aplicação exclusiva criada para esta camisa.';return `<article class="team-set-card" data-kind="${kind}"><div><div class="eyebrow">${SET_KIND_LABEL[kind]}</div><h3>${h(customizationName(set))}</h3><p>${description}</p><small>${setSources.length} arquivo(s) privado(s)${set.tested_at?' • teste aprovado':''}</small></div><span class="set-status ${set.status}">${set.status==='ready'?'PRONTO':set.status==='preparing'?'EM PREPARAÇÃO':'RASCUNHO'}</span><div class="team-set-actions"><button class="btn small upload-source" data-id="${set.id}">${isLettering?'Fonte / vetores':'Arquivos'}</button><button class="btn small test-set" data-id="${set.id}">${isLettering?'Testar nome e número':'Pré-visualizar'}</button>${set.status!=='ready'?`<button class="btn primary small ready-set" data-id="${set.id}">Liberar para produção</button>`:''}</div></article>`};
    const kitActions=kit=>`<div class="kit-customization-actions" aria-label="Adicionar personalização à camisa"><button class="btn ghost small add-customization" data-kit="${kit.id}" data-kind="lettering">＋ Fontes e números</button><button class="btn ghost small add-customization" data-kit="${kit.id}" data-kind="sponsors">＋ All Sponsor</button><button class="btn ghost small add-customization" data-kit="${kit.id}" data-kind="special">＋ Arte especial</button></div>`;
    const treeHTML=groupTeamHierarchy(teams,kits,sets).map(({team,kits:teamKits})=>`<section class="team-group"><header><div><div class="eyebrow">Time cadastrado</div><h2>${h(team.name)}</h2></div><button class="btn small add-kit-for" data-team="${team.id}">＋ Camisa</button></header><div class="kit-list">${teamKits.length?teamKits.map(({kit,sets:kitSets})=>`<article class="kit-group"><div class="kit-head"><div><small>${h(kit.season)}</small><h3>${h(kit.name)}</h3></div>${kitActions(kit)}</div><div class="kit-sets">${kitSets.length?kitSets.map(setHTML).join(''):'<div class="empty mini">Camisa salva. Adicione fontes e números, All Sponsor ou uma arte especial.</div>'}</div></article>`).join(''):'<div class="empty mini">Time salvo. Agora cadastre a primeira camisa/temporada.</div>'}</div></section>`).join('');
    app.innerHTML=ctx.shell(`<main class="container simple-container teams-page"><section class="simple-hero"><div><div class="eyebrow">Biblioteca oficial privada</div><h1>Times / Personalizações</h1><p>Cada camisa guarda suas fontes e números, All Sponsor e artes especiais. O CDR fica arquivado; o SVG ou a fonte oficial é testado antes da produção.</p></div><div class="hero-actions"><button class="btn primary" id="newTeam">＋ Time</button><button class="btn" id="newKit">＋ Camisa</button></div></section><div class="team-tree">${treeHTML||'<div class="empty">Cadastre o primeiro time para começar.</div>'}</div></main>`,{back:true});
    ctx.bindCommon();
    app.querySelector('#newTeam').onclick=()=>simpleCreate('Time','Nome do time',async name=>supabase.from('z19p_teams').insert({owner_id:owner(),name,created_by:uid(),updated_by:uid()}),renderTeams);
    app.querySelector('#newKit').onclick=()=>selectCreate('Nova camisa',teams,async(teamId,name,extra)=>supabase.from('z19p_team_kits').insert({owner_id:owner(),team_id:teamId,season:extra||String(new Date().getFullYear()),name,created_by:uid(),updated_by:uid()}),renderTeams,'Temporada/ano');
    app.querySelectorAll('.add-kit-for').forEach(button=>button.onclick=()=>selectCreate('Nova camisa',teams,async(teamId,name,extra)=>supabase.from('z19p_team_kits').insert({owner_id:owner(),team_id:teamId,season:extra||String(new Date().getFullYear()),name,created_by:uid(),updated_by:uid()}),renderTeams,'Temporada/ano',button.dataset.team));
    app.querySelectorAll('.add-customization').forEach(button=>button.onclick=()=>createCustomization(button.dataset.kit,button.dataset.kind));
    app.querySelectorAll('.upload-source').forEach(b=>b.onclick=()=>uploadCustomizationSource(sets.find(set=>set.id===b.dataset.id)));
    app.querySelectorAll('.test-set').forEach(b=>b.onclick=()=>safe(()=>testCustomization(sets.find(x=>x.id===b.dataset.id))));
    app.querySelectorAll('.ready-set').forEach(b=>b.onclick=()=>safe(async()=>{
      const set=sets.find(x=>x.id===b.dataset.id),kind=customizationKind(set),setSources=sourceMap.get(set.id)||[],hasFont=setSources.some(source=>['ttf','otf'].includes(source.source_type)),hasSvg=setSources.some(source=>source.source_type==='svg');
      if(kind==='lettering'){const {count:glyphCount}=await supabase.from('z19p_customization_glyphs').select('id',{count:'exact',head:true}).eq('set_id',set.id);if(!hasFont&&!glyphCount)throw new Error('Envie uma fonte TTF/OTF ou mapeie ao menos um SVG antes de liberar.')}else if(!hasSvg)throw new Error(`Envie o SVG final de ${SET_KIND_LABEL[kind]} antes de liberar.`);
      if(!set.tested_at)throw new Error(kind==='lettering'?'Execute e confira o teste CLOVIS 10 antes de liberar.':'Abra a pré-visualização e aprove o arquivo antes de liberar.');
      const {error}=await supabase.from('z19p_customization_sets').update({status:'ready',updated_by:uid(),updated_at:new Date().toISOString()}).eq('id',set.id);if(error)throw error;await renderTeams();
    }))
  }

  function simpleCreate(title,label,save,done){const name=prompt(`${title} — ${label}:`);if(!name?.trim())return;safe(async()=>{const {error}=await save(name.trim());if(error)throw error;done()})}
  function createCustomization(kitId,kind){const defaults={lettering:'Oficial',sponsors:'All Sponsor',special:'Especial'},examples={lettering:'Ex.: Oficial 2026, Libertadores ou retrô',sponsors:'Use um SVG final já montado para manter a posição dos patrocínios.',special:'Ex.: patch de campeão, homenagem ou aplicação exclusiva'};const modal=document.createElement('div');modal.className='modal-backdrop';modal.innerHTML=`<div class="modal compact"><div class="modal-head"><div><div class="eyebrow">Dentro desta camisa</div><h2>${SET_KIND_LABEL[kind]}</h2></div><button class="btn ghost small close">×</button></div><div class="hint">${examples[kind]}</div><div class="field"><label>Identificação</label><input id="customizationName" value="${defaults[kind]}" required></div><div class="modal-footer"><button class="btn close">Cancelar</button><button class="btn primary" id="saveCustomization">Salvar</button></div></div>`;document.body.appendChild(modal);modal.querySelectorAll('.close').forEach(b=>b.onclick=()=>modal.remove());modal.querySelector('#customizationName').select();modal.querySelector('#saveCustomization').onclick=()=>safe(async()=>{const friendlyName=modal.querySelector('#customizationName').value.trim();if(!friendlyName)throw new Error('Digite uma identificação.');const button=modal.querySelector('#saveCustomization');button.disabled=true;const {error}=await supabase.from('z19p_customization_sets').insert({owner_id:owner(),kit_id:kitId,name:`${SET_KIND_PREFIX[kind]}${friendlyName}`,created_by:uid(),updated_by:uid()});if(error){button.disabled=false;throw error}modal.remove();ctx.toast(`${SET_KIND_LABEL[kind]} adicionado à camisa.`,'ok');await renderTeams()})}
  function selectCreate(title,items,save,done,extraLabel='',selectedId=''){if(!items.length)return ctx.toast('Cadastre o item anterior primeiro.','err');const modal=document.createElement('div');modal.className='modal-backdrop';modal.innerHTML=`<div class="modal compact"><div class="modal-head"><h2>${title}</h2><button class="btn ghost small close">×</button></div><div class="field"><label>Vincular a</label><select id="parentItem">${items.map(i=>`<option value="${i.id}" ${i.id===selectedId?'selected':''}>${h(i.name)}${i.season?` • ${h(i.season)}`:''}</option>`).join('')}</select></div>${extraLabel?`<div class="field"><label>${extraLabel}</label><input id="extraItem" value="${new Date().getFullYear()}"></div>`:''}<div class="field"><label>Nome</label><input id="newItemName" required></div><div class="modal-footer"><button class="btn close">Cancelar</button><button class="btn primary" id="saveItem">Salvar</button></div></div>`;document.body.appendChild(modal);modal.querySelectorAll('.close').forEach(b=>b.onclick=()=>modal.remove());modal.querySelector('#saveItem').onclick=async()=>{const name=modal.querySelector('#newItemName').value.trim();if(!name)return ctx.toast('Digite um nome.','err');const button=modal.querySelector('#saveItem');button.disabled=true;const {error}=await save(modal.querySelector('#parentItem').value,name,modal.querySelector('#extraItem')?.value.trim());if(error){button.disabled=false;return ctx.toast(error.message,'err')}modal.remove();await done()}}
  function uploadCustomizationSource(set){
    if(!set)return;
    return safe(()=>openCustomizationPreparer({set,kind:customizationKind(set),supabase,ownerId:owner(),userId:uid(),sanitizeSvg,signedSourceUrl,toast:ctx.toast,onChanged:renderTeams}));
  }
  function vectorLine(text,glyphMap,kind){return [...text.toUpperCase()].map(char=>char===' '?'<span class="glyph-space"></span>':`<span class="glyph-vector ${kind}">${glyphMap.get(char)?.svg_markup||''}</span>`).join('')}
  async function prepareLetteringLayout(item){
    const sources=item.fontSources||[],sourceMap=new Map(sources.map(source=>[source.id,source])),glyphMap=new Map((item.glyphs||[]).map(glyph=>[glyph.glyph_key,glyph])),needed=new Map();
    if(item.fontSource)sourceMap.set(item.fontSource.id,item.fontSource);
    for(const char of `${item.name||''}${item.number||''}`){const glyph=glyphMap.get(char);if(glyph?.svg_markup||glyph?.source_kind==='vector')continue;const source=glyph?.font_source_id?sourceMap.get(glyph.font_source_id):item.fontSource;if(source)needed.set(source.id,source)}
    const families=new Map(await Promise.all([...needed.values()].map(async source=>[source.id,await loadOfficialFont(source)]))),measure=document.createElement('canvas').getContext('2d');
    if(!measure)throw new Error('Seu navegador não disponibilizou o desenho da personalização.');
    const layout=measureLetteringItem({...item,measureFont:(char,source)=>{const family=families.get(source.id);if(!family)throw new Error('A fonte mapeada para este caractere não foi carregada.');const coverage=fontCoverageByFamily.get(family);if(!coverage?.hasGlyph(char)){const code=`U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')}`;throw new Error(`A fonte oficial não contém “${char}” (${code}). Cadastre o SVG deste caractere ou uma fonte que o inclua.`)}measure.font=`1000px "${family}"`;measure.textAlign='left';measure.textBaseline='alphabetic';return measure.measureText(char)},glyphAspect:glyph=>glyphAspect(glyph.svg_markup)});
    return {...layout,families};
  }
  async function drawPreparedLetteringLine(g,line,families,x,y,color,vectorColorOverrides=null){
    g.textAlign='left';g.textBaseline='alphabetic';g.fillStyle=color;
    for(const part of line.parts){
      if(part.kind==='font'){g.save();g.translate(x+part.xCm,y+part.baselineCm);g.scale(part.fontSizeCm/1000,part.fontSizeCm/1000);g.font=`1000px "${families.get(part.source.id)}"`;g.fillText(part.char,part.metrics.left,0);g.restore();}
      else if(part.kind==='vector'){
        const url=URL.createObjectURL(new Blob([applyVectorColorOverrides(part.glyph.svg_markup,vectorColorOverrides||{})],{type:'image/svg+xml'}));
        try{const image=new Image();image.src=url;await image.decode();g.drawImage(image,x+part.xCm,y+part.yCm,part.widthCm,part.heightCm)}finally{URL.revokeObjectURL(url)}
      }
    }
  }
  function customizationDefaults(set){return {nameHeightCm:Number(set.default_name_height_cm)||5.5,numberHeightCm:Number(set.default_number_height_cm)||28,gapCm:Number(set.name_number_gap_cm??1.5),nameTrackingCm:Number(set.letter_tracking_cm??.15),digitSpacingCm:Number(set.digit_spacing_cm??.2),widthCm:Number(set.default_width_cm)||((set._kind||customizationKind(set))==='sponsors'?28:15)}}
  function openCustomizationComposer(sets,{testMode=false,onSubmit}={}){
    const available=(sets||[]).filter(set=>testMode||(set.status==='ready'&&set.tested_at));
    if(!available.length){ctx.toast('Nenhuma personalização testada e liberada. Abra a camisa, faça o teste e libere para produção.','err');return Promise.resolve(null)}
    return new Promise(resolve=>{
      const modal=document.createElement('div');modal.className='modal-backdrop';let ticket=0,timer=null,prepared=null,closed=false,busy=false,vectorDimension='width';
      const priorFocus=document.activeElement,parse=value=>Number(String(value).replace(',','.')),fmt=value=>String(Number(value.toFixed(3))).replace('.',','),field=name=>modal.querySelector(`[name="${name}"]`);
      modal.innerHTML=`<div class="modal customization-composer-modal" role="dialog" aria-modal="true" aria-labelledby="customizationComposerTitle"><div class="modal-head"><div><div class="eyebrow">Personalização oficial</div><h2 id="customizationComposerTitle">${testMode?'Teste visual da camisa':'Adicionar personalização ao filme'}</h2></div><button type="button" class="btn ghost small" data-close aria-label="Fechar">×</button></div><form><div class="field"><label for="customizationSet">Camisa e personalização</label><select id="customizationSet" name="set">${available.map(set=>`<option value="${h(set.id)}">${h(set._path||customizationName(set))}</option>`).join('')}</select></div><div class="customization-composer-grid"><div class="customization-composer-controls"><div data-lettering-fields class="form-grid"><div class="field"><label>Nome</label><input name="name" value="CLOVIS" maxlength="40" autocomplete="off"></div><div class="field"><label>Número</label><input name="number" value="10" maxlength="6" inputmode="numeric" autocomplete="off"></div><div class="field"><label>Altura real do nome (cm)</label><input name="nameHeightCm" inputmode="decimal"></div><div class="field"><label>Altura real do número (cm)</label><input name="numberHeightCm" inputmode="decimal"></div><div class="field"><label>Espaço entre letras (cm)</label><input name="nameTrackingCm" inputmode="decimal"></div><div class="field"><label>Espaço entre números (cm)</label><input name="digitSpacingCm" inputmode="decimal"></div><div class="field full"><label>Distância nome / número (cm)</label><input name="gapCm" inputmode="decimal"></div></div><div class="form-grid"><div class="field"><label>Largura total (cm)</label><input name="widthCm" inputmode="decimal"></div><div class="field"><label>Altura total (cm)</label><input name="heightCm" inputmode="decimal"></div><div class="field"><label>Quantidade</label><input name="quantity" inputmode="numeric" value="1" ${testMode?'readonly':''}></div><div class="field"><label>Proporção preservada</label><button class="btn" type="button" data-reset>Restaurar medidas</button></div></div><p class="hint">Ajustar largura ou altura total redimensiona proporcionalmente esta aplicação. As medidas cadastradas da camisa são preservadas.</p></div><div class="customization-live-preview"><div class="customization-preview-canvas"><canvas aria-label="Prévia da personalização com medidas proporcionais"></canvas></div><output data-measure-summary aria-live="polite">Preparando prévia…</output><p data-character-note class="hint"></p><p data-preview-error class="error-text" role="alert"></p></div></div><div class="modal-footer"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit" disabled>${testMode?'Aprovar teste':'Adicionar ao filme'}</button></div></form></div>`;
      const submit=modal.querySelector('[type="submit"]'),errorOutput=modal.querySelector('[data-preview-error]'),summary=modal.querySelector('[data-measure-summary]');
      const selected=()=>available.find(set=>set.id===field('set').value),close=result=>{if(closed||busy)return;closed=true;ticket++;clearTimeout(timer);modal.remove();priorFocus?.focus?.();resolve(result||null)};
      const reset=()=>{const set=selected(),defaults=customizationDefaults(set),lettering=(set._kind||customizationKind(set))==='lettering';modal.querySelector('[data-lettering-fields]').hidden=!lettering;for(const key of ['nameHeightCm','numberHeightCm','gapCm','nameTrackingCm','digitSpacingCm','widthCm'])field(key).value=fmt(defaults[key]);field('heightCm').value='';vectorDimension='width';prepared=null;refresh()};
      const refresh=async()=>{
        const current=++ticket;prepared=null;submit.disabled=true;errorOutput.textContent='';summary.textContent='Atualizando prévia…';
        try{
          const set=selected(),kind=set._kind||customizationKind(set),quantity=parse(field('quantity').value);if(!Number.isInteger(quantity)||quantity<1||quantity>1000)throw new Error('Informe uma quantidade inteira entre 1 e 1000.');
          const defaults=customizationDefaults(set),item={type:'team_customization',customizationKind:kind,sourceId:set.id,label:set._path||customizationName(set),quantity,halftone:Boolean(set.halftone),allowInternalNesting:false,rotationPolicy:'none'};let note='';
          if(kind==='lettering'){
            Object.assign(item,{name:field('name').value.trim().toUpperCase(),number:field('number').value.trim(),fontSource:set._source||null,fontSources:set._sources||[],glyphs:set._glyphs||[],palette:set._palette||[]});
            if(item.number&&!/^\d{1,6}$/.test(item.number))throw new Error('Use somente algarismos no campo número.');
            for(const key of ['nameHeightCm','numberHeightCm','gapCm','nameTrackingCm','digitSpacingCm'])item[key]=parse(field(key).value);
            const layout=await prepareLetteringLayout(item);item.widthCm=layout.widthCm;item.heightCm=layout.heightCm;item.label+=` • ${[item.name,item.number].filter(Boolean).join(' ')}`;
            item.sizeOverride=['nameHeightCm','numberHeightCm','gapCm','nameTrackingCm','digitSpacingCm'].some(key=>Math.abs(item[key]-defaults[key])>.0001);
            const vectorCount=layout.nameLine.vectorCharacters.length+layout.numberLine.vectorCharacters.length,fontCount=layout.nameLine.fontCharacters.length+layout.numberLine.fontCharacters.length;
            note=`${vectorCount} ${vectorCount===1?'caractere em SVG':'caracteres em SVG'}${fontCount?` · ${fontCount} pela fonte oficial com cobertura Unicode verificada.`:'. Todos os caracteres estão mapeados em vetores.'} SVGs mapeados têm prioridade e mantêm suas cores.`;
          }else{
            if(!set._vectorSource)throw new Error('O SVG final desta personalização não está disponível.');
            const image=await loadPrivateVectorImage(set._vectorSource),ratio=image.naturalWidth/image.naturalHeight;if(!(ratio>0))throw new Error('Não foi possível medir o SVG final.');
            item.widthCm=vectorDimension==='height'?parse(field('heightCm').value)*ratio:parse(field('widthCm').value);item.heightCm=item.widthCm/ratio;item.vectorSource=set._vectorSource;item.sizeOverride=Math.abs(item.widthCm-defaults.widthCm)>.0001;note='Proporções, cores e posições do SVG final preservadas.';
          }
          if(![item.widthCm,item.heightCm].every(value=>Number.isFinite(value)&&value>0&&value<=300))throw new Error('As medidas totais devem estar entre zero e 300 cm.');
          const canvas=document.createElement('canvas'),scale=Math.min(600/item.widthCm,420/item.heightCm);canvas.width=Math.max(1,Math.ceil(item.widthCm*scale));canvas.height=Math.max(1,Math.ceil(item.heightCm*scale));
          await drawTeamCustomization(canvas.getContext('2d'),item,0,0,canvas.width,canvas.height);
          if(current!==ticket||closed)return;
          const visible=modal.querySelector('canvas');visible.width=canvas.width;visible.height=canvas.height;visible.getContext('2d').drawImage(canvas,0,0);
          item.previewDataUrl=canvas.toDataURL('image/png');prepared={item,set};field('widthCm').value=fmt(item.widthCm);field('heightCm').value=fmt(item.heightCm);
          summary.textContent=`${fmt(item.widthCm)} × ${fmt(item.heightCm)} cm · ${item.quantity} ${item.quantity===1?'aplicação':'aplicações'}`;modal.querySelector('[data-character-note]').textContent=note;submit.disabled=false;
        }catch(error){if(current===ticket&&!closed){errorOutput.textContent=error.message||String(error);summary.textContent='Ajuste os campos para visualizar.';modal.querySelector('[data-character-note]').textContent=''}}
      };
      const schedule=()=>{clearTimeout(timer);prepared=null;submit.disabled=true;ticket++;timer=setTimeout(refresh,140)};
      field('set').onchange=reset;modal.querySelector('[data-reset]').onclick=reset;
      modal.querySelectorAll('input').forEach(input=>{if(!['widthCm','heightCm'].includes(input.name))input.oninput=schedule});
      for(const dimension of ['widthCm','heightCm'])field(dimension).onchange=()=>{
        const target=parse(field(dimension).value),set=selected();
        if((set._kind||customizationKind(set))==='lettering'){
          if(!prepared||!(target>0)){errorOutput.textContent='Aguarde a prévia e informe uma medida maior que zero.';return;}
          const multiplier=target/prepared.item[dimension];for(const key of ['nameHeightCm','numberHeightCm','gapCm','nameTrackingCm','digitSpacingCm'])field(key).value=fmt(prepared.item[key]*multiplier);
        }else vectorDimension=dimension==='heightCm'?'height':'width';refresh();
      };
      modal.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>close());
      modal.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();close()}else if(event.key==='Tab'){const controls=[...modal.querySelectorAll('button:not([disabled]),input:not([readonly]),select')].filter(control=>!control.closest('[hidden]')),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}};
      modal.querySelector('form').onsubmit=async event=>{
        event.preventDefault();if(!prepared||busy)return;const result=prepared;busy=true;submit.disabled=true;submit.textContent=testMode?'Aprovando…':'Adicionando…';
        try{
          if(!testMode){const {data:latest,error}=await supabase.from('z19p_customization_sets').select('id,status,tested_at,updated_at').eq('id',result.set.id).single();if(error)throw error;if(latest.status!=='ready'||!latest.tested_at)throw new Error('Esta personalização precisa ser testada e liberada antes de entrar no filme.');if(result.set.updated_at&&latest.updated_at!==result.set.updated_at)throw new Error('A camisa foi alterada. Feche e abra o seletor para carregar a versão atual.');}
          await onSubmit?.(result.item,result.set);busy=false;close(result.item);
        }catch(error){busy=false;errorOutput.textContent=error.message||String(error);submit.disabled=false;submit.textContent=testMode?'Aprovar teste':'Adicionar ao filme'}
      };
      document.body.appendChild(modal);field('set').focus();reset();
    });
  }

  async function makeFilmLetteringPiece(set,{name='',number='',settings,compositionMode='split',pieceType='unified',groupId}={}){
    const defaults=customizationDefaults(set),cleanName=String(name||'').trim().toUpperCase(),cleanNumber=String(number||'').trim();
    const item={
      type:'team_customization',customizationKind:'lettering',sourceId:set.id,quantity:1,
      halftone:Boolean(set.halftone),allowInternalNesting:!set.halftone,rotationPolicy:'90',
      name:cleanName,number:cleanNumber,fontSource:set._source||null,fontSources:set._sources||[],
      glyphs:set._glyphs||[],palette:set._palette||[],compositionMode,pieceType,compositionGroupId:groupId||crypto.randomUUID(),
      nameHeightCm:Number(settings.nameHeightCm),numberHeightCm:Number(settings.numberHeightCm),
      gapCm:compositionMode==='unified'?Number(settings.gapCm):0,
      nameTrackingCm:Number(settings.nameTrackingCm),
      digitSpacingCm:compositionMode==='unified'?Number(settings.digitSpacingCm):0
    };
    const labelBase=set._path||customizationName(set);
    item.label=pieceType==='name'?`${labelBase} • Nome ${cleanName}`:pieceType==='digit'?`${labelBase} • Número ${cleanNumber}`:`${labelBase} • ${[cleanName,cleanNumber].filter(Boolean).join(' ')}`;
    const layout=await prepareLetteringLayout(item);item.widthCm=layout.widthCm;item.heightCm=layout.heightCm;
    item.sizeOverride=['nameHeightCm','numberHeightCm','gapCm','nameTrackingCm','digitSpacingCm'].some(key=>Math.abs(Number(settings[key])-Number(defaults[key]))>.0001);
    const directGlyph=pieceType==='digit'&&cleanNumber.length===1?(item.glyphs||[]).find(glyph=>glyph.glyph_key===cleanNumber&&glyph.svg_markup):null;
    if(directGlyph){item.previewDataUrl='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(sanitizeSvg(directGlyph.svg_markup));item.previewQualityVersion=3;return item;}
    const previewTargetPx=1600,scale=Math.max(1,Math.min(64,previewTargetPx/item.widthCm,previewTargetPx/item.heightCm)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.ceil(item.widthCm*scale));canvas.height=Math.max(1,Math.ceil(item.heightCm*scale));
    const context=canvas.getContext('2d');if(!context)throw new Error('Seu navegador não conseguiu preparar a prévia desta personalização.');
    await drawTeamCustomization(context,item,0,0,canvas.width,canvas.height);item.previewDataUrl=canvas.toDataURL('image/png');item.previewQualityVersion=2;
    canvas.width=1;canvas.height=1;return item;
  }

  function openFilmLetteringBatchComposer(sets,{allowLegacy=false}={}){
    const available=(sets||[]).filter(set=>(set._kind||customizationKind(set))==='lettering'&&set.status==='ready'&&set.tested_at);
    if(!available.length)return Promise.resolve(allowLegacy?{legacy:true}:null);
    return new Promise(resolve=>{
      const modal=document.createElement('div'),priorFocus=document.activeElement;let rows=[],busy=false,closed=false;
      modal.className='modal-backdrop';
      modal.innerHTML=`<div class="modal customization-composer-modal team-batch-composer" role="dialog" aria-modal="true" aria-labelledby="teamBatchTitle">
        <div class="modal-head"><div><div class="eyebrow">Personalização oficial</div><h2 id="teamBatchTitle">Adicionar nomes e números</h2><p>Escolha a camisa, monte sua lista e envie tudo de uma vez para o encaixe.</p></div><button type="button" class="btn ghost small" data-close aria-label="Fechar">×</button></div>
        <form>
          <div class="form-grid">
            <label class="field"><span>Time</span><select name="team"></select></label>
            <label class="field"><span>Ano</span><select name="season"></select></label>
            <label class="field"><span>Camisa</span><select name="kit"></select></label>
            <label class="field"><span>Fonte / personalização</span><select name="set"></select></label>
          </div>
          <div class="team-batch-entry" style="margin-top:16px;padding:16px;border:1px solid #34343a;border-radius:16px;background:#111114">
            <div class="form-grid">
              <label class="field"><span>Nome <small>(opcional)</small></span><input name="name" maxlength="40" autocomplete="off" placeholder="Ex.: CLOVIS"></label>
              <label class="field"><span>Número <small>(opcional)</small></span><input name="number" maxlength="6" inputmode="numeric" autocomplete="off" placeholder="Ex.: 10"></label>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:stretch;margin-top:12px">
              <label style="flex:1;min-width:210px;display:flex;gap:10px;padding:12px;border:1px solid #39393f;border-radius:14px;cursor:pointer"><input type="radio" name="composition" value="split" checked style="width:20px;height:20px;accent-color:#ff6428"><span><b>Mesclar encaixe</b><small style="display:block;color:#aaa;margin-top:5px;line-height:1.45">Nome fica inteiro; cada algarismo vira uma peça separada para economizar filme.</small></span></label>
              <label style="flex:1;min-width:210px;display:flex;gap:10px;padding:12px;border:1px solid #39393f;border-radius:14px;cursor:pointer"><input type="radio" name="composition" value="unified" style="width:20px;height:20px;accent-color:#ff6428"><span><b>Unificar tudo</b><small style="display:block;color:#aaa;margin-top:5px;line-height:1.45">Mantém nome em cima e número embaixo como uma única aplicação.</small></span></label>
            </div>
            <details data-advanced style="margin-top:12px"><summary class="btn" style="display:inline-flex;cursor:pointer">Editar fonte / medidas deste lote</summary>
              <div class="form-grid" style="margin-top:12px">
                <label class="field"><span>Altura do nome (cm)</span><input name="nameHeightCm" inputmode="decimal"></label>
                <label class="field"><span>Altura do número (cm)</span><input name="numberHeightCm" inputmode="decimal"></label>
                <label class="field"><span>Espaço entre letras (cm)</span><input name="nameTrackingCm" inputmode="decimal"></label>
                <label class="field"><span>Espaço entre números (cm) <small>somente unificado</small></span><input name="digitSpacingCm" inputmode="decimal"></label>
                <label class="field"><span>Distância nome / número (cm) <small>somente unificado</small></span><input name="gapCm" inputmode="decimal"></label>
              </div><p class="hint">Esses ajustes valem apenas para as próximas linhas adicionadas nesta janela. O padrão salvo da fonte não é alterado.</p>
            </details>
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:12px;flex-wrap:wrap"><small data-default-summary class="hint"></small><button type="button" class="btn" data-add-row>＋ Adicionar à lista</button></div>
            <p data-entry-error class="error-text" role="alert"></p>
          </div>
          <section style="margin-top:18px"><div class="section-title-row"><div><div class="eyebrow">Lote</div><h3 style="margin:4px 0">Personalizações adicionadas</h3></div><span data-row-count class="badge">0</span></div><div data-batch-rows class="team-batch-rows"></div></section>
          <p data-batch-error class="error-text" role="alert"></p>
          <div class="modal-footer">${allowLegacy?'<button type="button" class="btn ghost" data-legacy>All Sponsor / arte especial</button>':''}<button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit" disabled>Adicionar tudo ao filme</button></div>
        </form>
      </div>`;
      const q=name=>modal.querySelector(`[name="${name}"]`),submit=modal.querySelector('[type="submit"]'),rowsHost=modal.querySelector('[data-batch-rows]'),entryError=modal.querySelector('[data-entry-error]'),batchError=modal.querySelector('[data-batch-error]');
      const parse=value=>Number(String(value).trim().replace(',','.')),fmt=value=>String(Number(Number(value).toFixed(3))).replace('.',',');
      const setById=id=>available.find(set=>String(set.id)===String(id));
      const teamId=set=>String(set._team?.id||set._kit?.team_id||'sem-time'),season=set=>String(set._kit?.season||'Sem ano'),kitId=set=>String(set._kit?.id||set.kit_id||'sem-camisa');
      const unique=(values,key)=>[...new Map(values.map(value=>[key(value),value])).values()];
      const currentTeamSets=()=>available.filter(set=>teamId(set)===q('team').value);
      const currentSeasonSets=()=>currentTeamSets().filter(set=>season(set)===q('season').value);
      const currentKitSets=()=>currentSeasonSets().filter(set=>kitId(set)===q('kit').value);
      const selectedSet=()=>setById(q('set').value);
      const option=(value,label)=>`<option value="${h(value)}">${h(label)}</option>`;
      const applyDefaults=()=>{const set=selectedSet();if(!set)return;const defaults=customizationDefaults(set);for(const key of ['nameHeightCm','numberHeightCm','nameTrackingCm','digitSpacingCm','gapCm'])q(key).value=fmt(defaults[key]);modal.querySelector('[data-default-summary]').textContent=`Padrão salvo: nome ${fmt(defaults.nameHeightCm)} cm · número ${fmt(defaults.numberHeightCm)} cm · letras ${fmt(defaults.nameTrackingCm)} cm`;};
      const fillSet=()=>{const list=currentKitSets();q('set').innerHTML=list.map(set=>option(set.id,customizationName(set))).join('');applyDefaults()};
      const fillKit=()=>{const list=unique(currentSeasonSets(),kitId);q('kit').innerHTML=list.map(set=>option(kitId(set),set._kit?.name||'Camisa')).join('');fillSet()};
      const fillSeason=()=>{const list=unique(currentTeamSets(),season);q('season').innerHTML=list.map(set=>option(season(set),season(set))).join('');fillKit()};
      const fillTeam=()=>{const list=unique(available,teamId);q('team').innerHTML=list.map(set=>option(teamId(set),set._team?.name||'Time')).join('');fillSeason()};
      const readSettings=()=>{const values={};for(const key of ['nameHeightCm','numberHeightCm','nameTrackingCm','digitSpacingCm','gapCm'])values[key]=parse(q(key).value);if(!(values.nameHeightCm>0&&values.nameHeightCm<=100))throw new Error('Altura do nome inválida.');if(!(values.numberHeightCm>0&&values.numberHeightCm<=100))throw new Error('Altura do número inválida.');if(!Number.isFinite(values.nameTrackingCm)||values.nameTrackingCm<0||values.nameTrackingCm>10)throw new Error('Espaço entre letras inválido.');if(!Number.isFinite(values.digitSpacingCm)||values.digitSpacingCm<0||values.digitSpacingCm>10)throw new Error('Espaço entre números inválido.');if(!Number.isFinite(values.gapCm)||values.gapCm<0||values.gapCm>50)throw new Error('Distância nome / número inválida.');return values;};
      const renderRows=()=>{modal.querySelector('[data-row-count]').textContent=String(rows.length);submit.disabled=!rows.length||busy;rowsHost.innerHTML=rows.length?rows.map(row=>`<article style="display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid #2d2d33"><div style="flex:1;min-width:0"><b>${h([row.name,row.number].filter(Boolean).join(' · '))}</b><small style="display:block;color:#aaa;margin-top:4px">${h(row.setPath)} · ${row.mode==='split'?'Mesclar encaixe':'Unificar tudo'}</small></div><button type="button" class="btn ghost small" data-remove-row="${h(row.id)}">Remover</button></article>`).join(''):'<div class="empty mini">Digite um nome, um número ou os dois e adicione à lista.</div>';rowsHost.querySelectorAll('[data-remove-row]').forEach(button=>button.onclick=()=>{rows=rows.filter(row=>row.id!==button.dataset.removeRow);renderRows()});};
      const stageCurrent=()=>{entryError.textContent='';const set=selectedSet();if(!set)throw new Error('Escolha uma fonte/personalização.');const name=q('name').value.trim().toUpperCase(),number=q('number').value.trim();if(!name&&!number)throw new Error('Informe um nome, um número ou os dois.');if(number&&!/^\d{1,6}$/.test(number))throw new Error('Use somente algarismos no campo número.');const mode=modal.querySelector('[name="composition"]:checked')?.value||'split',settings=readSettings();rows.push({id:crypto.randomUUID(),setId:set.id,setUpdatedAt:set.updated_at||null,setPath:set._path||customizationName(set),name,number,mode,settings});q('name').value='';q('number').value='';q('name').focus();renderRows();return true;};
      const close=result=>{if(closed||busy)return;closed=true;modal.remove();priorFocus?.focus?.();resolve(result??null)};
      q('team').onchange=fillSeason;q('season').onchange=fillKit;q('kit').onchange=fillSet;q('set').onchange=applyDefaults;
      modal.querySelector('[data-add-row]').onclick=()=>{try{stageCurrent()}catch(error){entryError.textContent=error.message||String(error)}};
      modal.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>close());modal.querySelector('[data-legacy]')?.addEventListener('click',()=>close({legacy:true}));
      modal.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();close()}else if(event.key==='Tab'){const controls=[...modal.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary')].filter(control=>!control.closest('[hidden]')),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}};
      modal.querySelector('form').onsubmit=async event=>{event.preventDefault();if(busy)return;batchError.textContent='';try{if(q('name').value.trim()||q('number').value.trim())stageCurrent();if(!rows.length)throw new Error('Adicione ao menos uma personalização.');busy=true;submit.disabled=true;submit.textContent='Preparando peças…';const ids=[...new Set(rows.map(row=>row.setId))],latestResult=await supabase.from('z19p_customization_sets').select('id,status,tested_at,updated_at').in('id',ids);if(latestResult.error)throw latestResult.error;const latestMap=new Map((latestResult.data||[]).map(set=>[set.id,set]));for(const row of rows){const latest=latestMap.get(row.setId);if(!latest||latest.status!=='ready'||!latest.tested_at)throw new Error('Uma das personalizações não está mais liberada para produção.');if(row.setUpdatedAt&&latest.updated_at!==row.setUpdatedAt)throw new Error('Uma das fontes foi alterada. Feche e abra novamente para carregar a versão atual.');}const items=[];for(const row of rows){const set=setById(row.setId),groupId=crypto.randomUUID();if(row.mode==='unified')items.push(await makeFilmLetteringPiece(set,{name:row.name,number:row.number,settings:row.settings,compositionMode:'unified',pieceType:'unified',groupId}));else{if(row.name)items.push(await makeFilmLetteringPiece(set,{name:row.name,settings:row.settings,compositionMode:'split',pieceType:'name',groupId}));for(const digit of row.number)items.push(await makeFilmLetteringPiece(set,{number:digit,settings:row.settings,compositionMode:'split',pieceType:'digit',groupId}));}}busy=false;closed=true;modal.remove();priorFocus?.focus?.();resolve(items);}catch(error){busy=false;batchError.textContent=error.message||String(error);submit.disabled=!rows.length;submit.textContent='Adicionar tudo ao filme'}};
      document.body.appendChild(modal);fillTeam();renderRows();q('name').focus();
    });
  }

  async function testCustomization(set){
    const kind=customizationKind(set);
    if(kind!=='lettering'){
      const {data:sources,error}=await supabase.from('z19p_customization_sources').select('*').eq('set_id',set.id).order('created_at',{ascending:false});if(error)throw error;
      const svgSources=(sources||[]).filter(source=>source.source_type==='svg'&&source.is_working_source===true).slice(0,1);if(!svgSources.length)throw new Error(`Abra Arquivos e selecione o SVG final de ${SET_KIND_LABEL[kind]} antes do teste.`);
      const previews=await Promise.all(svgSources.map(async source=>({source,url:await signedSourceUrl(source.storage_path)}))),modal=document.createElement('div');modal.className='modal-backdrop';modal.innerHTML=`<div class="modal compact"><div class="modal-head"><div><div class="eyebrow">${SET_KIND_LABEL[kind]}</div><h2>${h(customizationName(set))}</h2></div><button class="btn ghost small close">×</button></div><div class="customization-preview vector-preview">${previews.map(({source,url})=>`<figure><img src="${h(url)}" alt="${h(source.original_name)}"><figcaption>${h(source.original_name)}</figcaption></figure>`).join('')}</div><div class="hint">${kind==='sponsors'?'Confirme se o SVG final já contém todos os patrocínios nas posições corretas.':'Confira proporção, contornos, detalhes internos e transparência.'}</div><div class="modal-footer"><button class="btn close">Reprovar</button><button class="btn primary" id="approveCustomizationTest">Aprovar arquivo</button></div></div>`;document.body.appendChild(modal);modal.querySelectorAll('.close').forEach(button=>button.onclick=()=>modal.remove());modal.querySelector('#approveCustomizationTest').onclick=async()=>{const {error:updateError}=await supabase.from('z19p_customization_sets').update({status:set.status==='ready'?'ready':'preparing',tested_at:new Date().toISOString(),tested_by:uid(),updated_by:uid(),updated_at:new Date().toISOString()}).eq('id',set.id);if(updateError)return ctx.toast(updateError.message,'err');modal.remove();ctx.toast(`${SET_KIND_LABEL[kind]} aprovado para liberação.`,'ok');await renderTeams()};return;
    }
    const [{data:sources,error:sourceError},{data:glyphs,error:glyphError},{data:palette,error:paletteError}]=await Promise.all([supabase.from('z19p_customization_sources').select('*').eq('set_id',set.id),supabase.from('z19p_customization_glyphs').select('*').eq('set_id',set.id),supabase.from('z19p_customization_palettes').select('*').eq('set_id',set.id)]);if(sourceError)throw sourceError;if(glyphError)throw glyphError;if(paletteError)throw paletteError;
    const candidate={...set,_kind:'lettering',_sources:sources||[],_source:(sources||[]).filter(source=>['ttf','otf'].includes(source.source_type)&&source.is_working_source===true).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)||String(b.id).localeCompare(String(a.id)))[0]||null,_glyphs:glyphs||[],_palette:palette||[]};
    const result=await openCustomizationComposer([candidate],{testMode:true,onSubmit:async()=>{const {error}=await supabase.from('z19p_customization_sets').update({status:set.status==='ready'?'ready':'preparing',tested_at:new Date().toISOString(),tested_by:uid(),updated_by:uid(),updated_at:new Date().toISOString()}).eq('id',set.id);if(error)throw error}});
    if(result){ctx.toast('Teste visual aprovado. A personalização pode ser liberada.','ok');await renderTeams()}
  }
  function schemaMissing(error){console.error(error);const schemaError=['42P01','42703','PGRST202','PGRST205'].includes(error?.code);app.innerHTML=ctx.shell(`<main class="container"><div class="empty"><b>${schemaError?'Estrutura de produção indisponível':'Não foi possível carregar esta tela'}</b><p>${h(error.message||'Confira a conexão e tente novamente.')}</p><button class="btn primary" id="retryProductionView">Tentar novamente</button></div></main>`,{back:true});ctx.bindCommon();app.querySelector('#retryProductionView').onclick=()=>safe(()=>location.hash.includes('/times')?renderTeams():renderFilm())}

  async function allProductionRows(table,columns='*',configure=query=>query,key='id'){
    try{const rows=[];for(let start=0;start<100000;start+=500){const query=configure(supabase.from(table).select(columns).eq('owner_id',owner()));const result=await query.order(key).range(start,start+499);if(result.error)throw result.error;rows.push(...(result.data||[]));if((result.data||[]).length<500)return rows}throw new Error('Biblioteca muito grande para carregar de uma vez. Refine os registros.');}
    catch(error){const contextual=new Error('Não foi possível carregar '+table.replace(/^z19p_/,'')+': '+(error?.message||'confira a conexão e tente novamente.'));contextual.code=error?.code;throw contextual;}
  }
  async function productionByIds(table,key,ids){const rows=[];for(let start=0;start<ids.length;start+=150)rows.push(...await allProductionRows(table,'*',query=>query.in(key,ids.slice(start,start+150))));return rows}
  let filmDraftOwner=null,filmDraftUser=null,filmDraftStore=null,filmDraftTimer=null,filmDraftLoaded=false,filmDraftSavedAt=null,filmDraftWarning='',filmDraftNote='',filmDraftDirty=false,filmDraftRestoring=null,filmCalculationGeneration=0,filmDraftSaving=false,filmDraftChange=0,filmDraftConflict=false,filmDraftLegacy=null,filmDraftLegacyActive=false,filmDraftWrite=null;
  let filmPickerMetaOwner=null,filmPickerMetaPromise=null;
  const freshFilmSettings=()=>({mediaId:null,mode:'maximum',gapMm:3,freeRotation:false,angleStep:30,name:'',nameCustom:false});
  function suggestedFilmName(media){
    const profile=media?.find(m=>m.id===filmSettings.mediaId)||media?.find(m=>m.id===app.querySelector('#filmMedia')?.value)||media?.[0],width=Number(profile?.usable_width_cm||0);
    const clients=[...new Set(filmItems.map(item=>String(item.companyName||item.label?.split(' • ')[0]||'').trim()).filter(Boolean))];
    const now=new Date(),date=now.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}).replace('/','-'),time=now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}).replace(':','h');
    return ['Filme '+(width?Number(width.toFixed(2)).toLocaleString('pt-BR')+' cm':'DTF'),clients.length?clients.join(' - '):'Sem cliente',date+' '+time].join(' — ');
  }
  function filmExportBase(media){
    const name=String(filmSettings.name||suggestedFilmName(media)).trim()||'Filme DTF';
    return name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim().slice(0,150);
  }
  function preloadFilmPickerMeta(){
    const account=String(owner()||'');
    if(filmPickerMetaOwner===account&&filmPickerMetaPromise)return filmPickerMetaPromise;
    filmPickerMetaOwner=account;
    filmPickerMetaPromise=Promise.all([allProductionRows('z19p_workspaces','id,company_name,client_name,workspace_type'),allProductionRows('z19p_projects','id,workspace_id,title,sequence_no,status_id'),allProductionRows('z19p_folders','id,workspace_id,project_id,parent_id,name')]).catch(error=>{if(filmPickerMetaOwner===account)filmPickerMetaPromise=null;throw error});
    return filmPickerMetaPromise;
  }
  function resetAccountState(){
    detachProductionListener?.();detachProductionListener=null;
    productionAccountGeneration++;filmCalculationGeneration++;filmPreviewGeneration++;queueRequest++;
    clearTimeout(filmDraftTimer);filmDraftTimer=null;filmDraftDirty=false;filmDraftRestoring=null;filmDraftOwner=null;filmDraftUser=null;filmDraftStore=null;filmDraftLoaded=false;filmDraftSavedAt=null;filmDraftWarning='';filmDraftNote='';filmDraftSaving=false;filmDraftChange=0;filmDraftConflict=false;filmDraftLegacy=null;filmDraftLegacyActive=false;filmDraftWrite=null;
    queueRows=[];queueSnapshot=null;launcherScope='mine';lastFilm=null;filmItems=[];pendingZero19TeamRequest=null;pendingZero19AssetRequest=null;filmSettings=freshFilmSettings();filmPickerMetaOwner=null;filmPickerMetaPromise=null;filmCostPanel?.destroy();filmCostPanel=null;filmMaskCache.clear();
    if(typeof document!=='undefined'){for(const face of document.fonts||[])if(fontCoverageByFamily.has(face.family))document.fonts.delete(face);document.querySelector('[data-film-draft-confirm]')?.remove();}
    fontCache.clear();fontCoverageByFamily.clear();vectorMarkupCache.clear();
    if(typeof clearLetteringLayoutCache==='function')clearLetteringLayoutCache();
  }
  function filmDraftBanner(){
    const page=app.querySelector('.film-page');if(!page)return;
    let banner=page.querySelector('[data-film-draft]');if(!banner){banner=document.createElement('section');banner.dataset.filmDraft='';banner.className='film-draft-banner';banner.setAttribute('aria-live','polite');banner.style.cssText='display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:14px 16px;margin:0 0 18px;border:1px solid #34333b;border-radius:14px;background:#141317';page.querySelector('.simple-hero')?.insertAdjacentElement('afterend',banner);}
    const time=filmDraftSavedAt?new Date(filmDraftSavedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):null;
    const message=filmDraftWarning||(filmDraftSaving?'Salvando no banco… aguarde a confirmação antes de fechar.':filmDraftDirty?'Alterações ainda não confirmadas na nuvem. Mantenha esta aba aberta.':filmDraftNote||(time?'Confirmado na nuvem às '+time+'. Disponível para seu usuário em outro aparelho.':'O filme será salvo automaticamente no banco, por conta e usuário. Não são criadas novas cópias locais.'));
    banner.innerHTML='<div style="flex:1;min-width:180px"><b>Rascunho na nuvem · seu usuário</b><small style="display:block;margin-top:5px;line-height:1.5;color:'+(filmDraftWarning?'#ffa997':'#aaa7b4')+'">'+h(message)+'</small></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn small" data-save-film-cloud '+(filmDraftSaving?'disabled':'')+'>'+(filmDraftConflict?'Usar montagem aberta':'Salvar na nuvem')+'</button><button class="btn ghost small" data-load-film-cloud '+(filmDraftSaving?'disabled':'')+'>Carregar da nuvem</button>'+(filmDraftLegacy?.data?'<button class="btn ghost small" data-legacy-film-cloud '+(filmDraftSaving?'disabled':'')+'>Recuperar rascunho antigo</button>':'')+'<button class="btn ghost small" data-discard-film-draft '+(filmDraftSaving||!filmItems.length&&!filmDraftLoaded?'disabled':'')+'>Descartar rascunho</button></div>';
    banner.querySelector('[data-discard-film-draft]').onclick=confirmDiscardFilmDraft;
    banner.querySelector('[data-load-film-cloud]').onclick=()=>safe(()=>reloadFilmDraft(false));
    banner.querySelector('[data-save-film-cloud]').onclick=()=>safe(()=>filmDraftConflict||filmDraftStore?.revision===undefined?reloadFilmDraft(true):persistFilmDraft(true));
    banner.querySelector('[data-legacy-film-cloud]')?.addEventListener('click',()=>safe(async()=>{if(!filmDraftLegacy?.data||filmDraftSaving)return;if(!confirm('Substituir a montagem aberta pelo rascunho antigo desta aba e salvá-lo na nuvem? A cópia antiga só será removida após confirmação do banco.'))return;applyFilmDraft(filmDraftLegacy.data,filmDraftLegacy.warnings);filmDraftLegacyActive=true;filmDraftDirty=true;filmDraftChange++;await regenerateFilmDraftPreviews();await renderFilm();await persistFilmDraft()}));
  }
  async function persistFilmDraft(force=false){
    clearTimeout(filmDraftTimer);filmDraftTimer=null;
    if(!filmDraftStore||filmDraftOwner!==String(owner()||'')||filmDraftUser!==String(uid()||'')||filmDraftSaving||filmDraftConflict||!filmDraftDirty&&!force)return;
    let layout=lastFilm;if(layout&&filmItems.length){try{layout=checkedFilmSnapshot({filmItems,lastFilm:layout}).layout;}catch(error){layout=null;filmDraftNote='Itens preservados. O encaixe precisa ser recalculado: '+error.message;}}
    const store=filmDraftStore,change=filmDraftChange,generation=productionAccountGeneration;filmDraftSaving=true;filmDraftBanner();
    const writing=store.save({items:filmItems,layout,settings:filmSettings},{migrateLegacy:filmDraftLegacyActive});filmDraftWrite=writing;const result=await writing;if(filmDraftWrite===writing)filmDraftWrite=null;
    if(generation!==productionAccountGeneration||store!==filmDraftStore)return;
    filmDraftSaving=false;filmDraftWarning=result.ok?(result.warnings||[]).join(' '):result.warning;
    if(result.ok){filmDraftLoaded=true;filmDraftSavedAt=result.savedAt;filmDraftConflict=false;if(change===filmDraftChange)filmDraftDirty=false;if(filmDraftLegacyActive){if(!result.legacyPreserved)filmDraftLegacy=null;filmDraftLegacyActive=false;}if(filmDraftDirty)filmDraftTimer=setTimeout(persistFilmDraft,700);}
    else{filmDraftDirty=true;filmDraftConflict=result.code==='DRAFT_CONFLICT';}
    filmDraftBanner();
  }
  function saveFilmDraft(immediate=false){filmDraftDirty=true;filmDraftChange++;clearTimeout(filmDraftTimer);filmDraftBanner();if(immediate)void persistFilmDraft();else filmDraftTimer=setTimeout(persistFilmDraft,700);}
  const hasPendingFilmDraft=()=>filmDraftDirty||filmDraftSaving;
  async function flushFilmDraft({timeoutMs=12000}={}){
    clearTimeout(filmDraftTimer);const generation=productionAccountGeneration,deadline=Date.now()+Math.max(1,Math.min(12000,Number(timeoutMs)||12000));
    const bounded=promise=>new Promise(resolve=>{const timer=setTimeout(()=>resolve(false),Math.max(1,deadline-Date.now()));Promise.resolve(promise).then(()=>{clearTimeout(timer);resolve(true)},()=>{clearTimeout(timer);resolve(false)})});
    if(filmDraftWrite&&!await bounded(filmDraftWrite))return false;
    if(generation!==productionAccountGeneration||filmDraftConflict)return false;
    if(filmDraftDirty&&!await bounded(persistFilmDraft(true)))return false;
    return generation===productionAccountGeneration&&!hasPendingFilmDraft();
  }
  async function regenerateFilmDraftPreviews(){
    const account=filmDraftOwner,accountGeneration=productionAccountGeneration,items=filmItems;let success=true;
    for(const item of items){
      if(item.type!=='team_customization'||item.previewDataUrl&&Number(item.previewQualityVersion)>=2)continue;
      try{
        // Prefer the real SVG for an isolated mapped digit so zoom remains vector-sharp.
        const directGlyph=item.pieceType==='digit'&&String(item.number||'').length===1?(item.glyphs||[]).find(glyph=>glyph.glyph_key===String(item.number)&&glyph.svg_markup):null;
        if(directGlyph){item.previewDataUrl='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(applyVectorColorOverrides(directGlyph.svg_markup,item.vectorColorOverrides||{}));item.previewQualityVersion=3;continue;}
        // Names/composites are rendered much larger than the screen preview.
        const targetPx=1600,canvas=document.createElement('canvas'),scale=Math.max(1,Math.min(64,targetPx/item.widthCm,targetPx/item.heightCm));canvas.width=Math.max(1,Math.ceil(item.widthCm*scale));canvas.height=Math.max(1,Math.ceil(item.heightCm*scale));
        try{await drawTeamCustomization(canvas.getContext('2d'),item,0,0,canvas.width,canvas.height);if(accountGeneration!==productionAccountGeneration||account!==filmDraftOwner||account!==String(owner()||''))return false;item.previewDataUrl=canvas.toDataURL('image/png');item.previewQualityVersion=2;}finally{canvas.width=canvas.height=1;}
      }catch(error){if(accountGeneration!==productionAccountGeneration||account!==filmDraftOwner)return false;success=false;filmDraftNote=`Os itens foram recuperados, mas a prévia de “${item.label||'personalização'}” não pôde ser refeita: ${error.message}. Confira o acesso à fonte/SVG e tente calcular novamente.`;}
    }
    return success;
  }
  function applyFilmDraft(draft,warnings=[]){
    filmDraftLoaded=Boolean(draft);filmDraftSavedAt=draft?.savedAt||null;filmItems=draft?.items||[];filmSettings=draft?.settings||freshFilmSettings();filmDraftNote=warnings.join(' ');lastFilm=null;
    if(draft?.layout&&filmItems.length){try{lastFilm=checkedFilmSnapshot({filmItems,lastFilm:draft.layout}).layout;}catch(error){filmDraftNote='Itens recuperados. Recalcule o encaixe: '+error.message;}}
    else if(filmItems.length&&!filmDraftNote)filmDraftNote='Itens recuperados. Calcule o filme para restaurar o encaixe.';
  }
  async function restoreFilmDraft(){
    const account=String(owner()||''),user=String(uid()||''),accountGeneration=productionAccountGeneration;if(!account||!user)return;
    if(filmDraftOwner===account&&filmDraftUser===user){if(filmDraftRestoring)await filmDraftRestoring;return;}
    clearTimeout(filmDraftTimer);filmDraftTimer=null;
    if(filmDraftOwner!==null){filmItems=[];lastFilm=null;filmSettings=freshFilmSettings();filmMaskCache.clear();}
    filmDraftOwner=account;filmDraftUser=user;filmDraftStore=createCloudFilmDraftStore({supabase,owner,user:uid,legacyStorage:()=>window.sessionStorage});filmDraftLoaded=false;filmDraftSavedAt=null;filmDraftWarning='';filmDraftNote='';filmDraftDirty=false;filmDraftConflict=false;filmDraftLegacy=null;filmDraftLegacyActive=false;
    const store=filmDraftStore,pending=(async()=>{const result=await store.load();if(accountGeneration!==productionAccountGeneration||store!==filmDraftStore)return;filmDraftLegacy=result.legacy;
      if(!result.ok){filmDraftWarning=result.warning;if(!filmItems.length&&result.legacy?.data){applyFilmDraft(result.legacy.data,result.legacy.warnings);filmDraftLegacyActive=true;filmDraftDirty=true;filmDraftChange++;}}
      else if(result.data){applyFilmDraft(result.data,result.warnings);if(result.legacy?.data)filmDraftNote='Versão da nuvem recuperada. Um rascunho antigo desta aba também foi preservado; use Recuperar rascunho antigo se precisar.';}
      else if(result.legacy?.data){applyFilmDraft(result.legacy.data,result.legacy.warnings);filmDraftLegacyActive=true;filmDraftDirty=true;filmDraftChange++;filmDraftNote='Recuperado da versão antiga. A cópia desta aba será removida somente após confirmação da migração para a nuvem.';}
      else if(!result.ok)return;
      if(!await regenerateFilmDraftPreviews()&&accountGeneration===productionAccountGeneration&&store===filmDraftStore)lastFilm=null;
    })();filmDraftRestoring=pending;try{await pending;}finally{if(filmDraftRestoring===pending)filmDraftRestoring=null;}
  }
  async function reloadFilmDraft(useOpen){
    if(!filmDraftStore||filmDraftSaving)return;
    if(useOpen&&!confirm('Usar a montagem aberta como rascunho da nuvem? Isso substitui a versão de outro aparelho, se houver. Artes e jobs salvos não serão alterados.'))return;
    if(!useOpen&&filmDraftDirty&&!confirm('Carregar a nuvem e descartar as alterações desta montagem que ainda não foram sincronizadas?'))return;
    clearTimeout(filmDraftTimer);const store=filmDraftStore,generation=productionAccountGeneration,change=filmDraftChange;filmDraftSaving=true;filmDraftBanner();const result=await store.load();
    if(generation!==productionAccountGeneration||store!==filmDraftStore)return;filmDraftSaving=false;
    if(!result.ok){filmDraftWarning=result.warning;filmDraftBanner();return;}
    filmDraftLegacy=result.legacy;filmDraftWarning='';filmDraftConflict=false;
    if(useOpen){filmDraftDirty=true;filmDraftChange++;await persistFilmDraft();}
    else if(change!==filmDraftChange){filmDraftConflict=true;filmDraftWarning='Você alterou a montagem durante a consulta. Os itens abertos foram preservados; escolha qual versão deseja manter.';filmDraftBanner();}
    else{applyFilmDraft(result.data,result.warnings);filmDraftDirty=false;filmDraftLegacyActive=false;await regenerateFilmDraftPreviews();await renderFilm();}
  }
  function confirmDiscardFilmDraft(){
    if(document.querySelector('[data-film-draft-confirm]')||filmDraftSaving)return;
    const modal=document.createElement('div'),focus=document.activeElement,store=filmDraftStore;let clearing=false;modal.className='modal-backdrop';modal.dataset.filmDraftConfirm='';
    modal.innerHTML='<div class="modal compact" role="dialog" aria-modal="true" aria-labelledby="filmDraftConfirmTitle"><div class="modal-head"><h2 id="filmDraftConfirmTitle">Descartar rascunho da nuvem?</h2><button class="btn ghost small" data-draft-cancel aria-label="Fechar">×</button></div><p>Isso substitui o rascunho do seu usuário por um filme vazio no banco. Nenhuma arte, personalização ou job salvo será apagado. Uma alteração simultânea em outro aparelho bloqueará a operação.</p><p data-draft-clear-error role="alert" style="color:#ffa997"></p><div class="modal-footer"><button class="btn" data-draft-cancel>Manter montagem</button><button class="btn primary" data-draft-confirm>Descartar rascunho</button></div></div>';
    const close=()=>{if(clearing)return;modal.remove();if(focus?.isConnected)focus.focus();};modal.querySelectorAll('[data-draft-cancel]').forEach(button=>button.onclick=close);modal.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();close()}else if(event.key==='Tab'){const controls=[...modal.querySelectorAll('button:not(:disabled)')],first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}};
    modal.querySelector('[data-draft-confirm]').onclick=async()=>{if(store!==filmDraftStore||clearing)return;clearing=true;clearTimeout(filmDraftTimer);const result=await store.save({items:[],layout:null,settings:filmSettings},{migrateLegacy:filmDraftLegacyActive});clearing=false;if(store!==filmDraftStore){modal.remove();return;}if(!result.ok){modal.querySelector('[data-draft-clear-error]').textContent=result.warning;filmDraftConflict=result.code==='DRAFT_CONFLICT';return;}filmDraftDirty=false;filmDraftLoaded=true;filmDraftSavedAt=result.savedAt;filmDraftWarning='';filmDraftNote='Rascunho esvaziado na nuvem. Artes e jobs continuam preservados.';filmItems=[];lastFilm=null;if(filmDraftLegacyActive){if(!result.legacyPreserved)filmDraftLegacy=null;filmDraftLegacyActive=false;}close();await renderFilm();};
    document.body.appendChild(modal);modal.querySelector('[data-draft-cancel]').focus();
  }
  if(typeof window!=='undefined'){window.addEventListener('pagehide',()=>void persistFilmDraft());document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')void persistFilmDraft();});window.addEventListener('beforeunload',event=>{if(filmDraftDirty||filmDraftSaving){event.preventDefault();event.returnValue='';}});}
  async function renderFilm(){
    detachProductionListener?.();detachProductionListener=null;
    const renderGeneration=++filmCalculationGeneration,renderAccount=String(owner()||''),renderAccountGeneration=productionAccountGeneration,renderRoute=typeof location==='undefined'?'':location.hash;
    const renderCurrent=()=>renderGeneration===filmCalculationGeneration&&renderAccountGeneration===productionAccountGeneration&&renderAccount===String(owner()||'')&&(typeof location==='undefined'||renderRoute===location.hash);
    await restoreFilmDraft();
    if(!renderCurrent())return false;
    void preloadFilmPickerMeta();
    filmCostPanel?.destroy();filmCostPanel=null;
    const [profilesResult,mediaResult,setsResult]=await Promise.all([allProductionRows('z19p_asset_print_profiles','*',q=>q.eq('ready_for_print',true),'asset_id').then(data=>({data})).catch(error=>({error})),ensureMediaProfiles().then(data=>({data})).catch(error=>({error})),allProductionRows('z19p_customization_sets','*',q=>q.eq('status','ready')).then(data=>({data})).catch(error=>({error}))]);
    if(!renderCurrent())return false;
    for(const result of [profilesResult,mediaResult,setsResult])if(result.error)return schemaMissing(result.error);
    const profiles=profilesResult.data||[],media=mediaResult.data||[],readySets=setsResult.data||[],assetIds=profiles.map(p=>p.asset_id),setIds=readySets.map(set=>set.id);let assets,sources,glyphs,palettes;try{[assets,sources,glyphs,palettes]=await Promise.all([productionByIds('z19p_assets','id',assetIds),productionByIds('z19p_customization_sources','set_id',setIds),productionByIds('z19p_customization_glyphs','set_id',setIds),productionByIds('z19p_customization_palettes','set_id',setIds)])}catch(error){return renderCurrent()?schemaMissing(error):false}if(!renderCurrent())return false;const assetMap=new Map(assets.map(a=>[a.id,a]));
    const kitIds=[...new Set(readySets.map(set=>set.kit_id))];let readyKits,readyTeams;try{readyKits=await productionByIds('z19p_team_kits','id',kitIds);readyTeams=await productionByIds('z19p_teams','id',[...new Set(readyKits.map(kit=>kit.team_id))])}catch(error){return renderCurrent()?schemaMissing(error):false}if(!renderCurrent())return false;const readyKitMap=new Map(readyKits.map(kit=>[kit.id,kit])),readyTeamMap=new Map(readyTeams.map(team=>[team.id,team]));
    for(const set of readySets){const kit=readyKitMap.get(set.kit_id),team=readyTeamMap.get(kit?.team_id),setSources=(sources||[]).filter(source=>source.set_id===set.id);set._team=team;set._kit=kit;set._kind=customizationKind(set);set._sources=setSources;set._source=setSources.filter(source=>['ttf','otf'].includes(source.source_type)&&source.is_working_source).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0))[0]||null;set._vectorSource=setSources.filter(source=>source.source_type==='svg'&&source.is_working_source).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0))[0]||null;set._glyphs=(glyphs||[]).filter(glyph=>glyph.set_id===set.id);set._palette=(palettes||[]).filter(color=>color.set_id===set.id);set._path=[team?.name,kit?.season,kit?.name,SET_KIND_LABEL[set._kind],customizationName(set)].filter(Boolean).join(' → ')}
    if(!renderCurrent())return false;
    if(filmDraftLoaded||filmItems.length){const reconciled=resolveFilmDraftMedia(filmSettings,lastFilm,media);filmSettings=reconciled.settings;lastFilm=reconciled.layout;if(reconciled.changed){filmDraftDirty=true;filmDraftNote=reconciled.warning;}}
    // Saved job payloads are loaded only when opened, never before the editor.
    app.innerHTML=ctx.shell(`<main class="container film-page"><section class="simple-hero film-hero"><div><div class="eyebrow">DTF 300 DPI</div><h1>Montar filme</h1><p>Monte o filme para gastar o mínimo possível de comprimento. O modo máximo usa os pixels reais da arte quando disponível.</p></div></section><section data-film-jobs aria-live="polite"><small>Carregando filmes salvos…</small></section><section class="film-controls film-primary-controls"><div class="field film-name-field"><label>Nome do filme</label><input id="filmName" value="${h(filmSettings.name||'')}" placeholder="Nome automático"></div><div class="field film-media-field"><label>Filme</label><select id="filmMedia">${media.map(m=>`<option value="${m.id}" data-width="${m.usable_width_cm}" data-segment="${m.max_segment_cm}">${h(m.name)}</option>`).join('')}</select></div><button class="btn film-action film-action-art" id="addFilmAsset">＋ Arte de empresa</button><button class="btn film-action film-action-pending" id="addOfficialPending">◷ Aguardando produção</button><button class="btn film-action film-action-personalization" id="addFilmTeam" ${readySets.length?'':'disabled'}>＋ Personalização</button><button class="btn primary film-action film-action-update" id="calculateFilm">Atualizar filme</button><div class="field"><label>Modo</label><select id="filmMode"><option value="normal">Normal — corte fácil</option><option value="maximum">Máximo — economizar filme</option></select></div><div class="field"><label>Espaço entre artes (mm)</label><input id="filmGap" inputmode="decimal" value="3"></div></section><section class="film-workspace"><aside class="film-items-panel"><div class="film-panel-title"><div><small>ITENS DO FILME</small><h2>Artes adicionadas</h2></div><span>${filmItems.reduce((sum,item)=>sum+Number(item.quantity||0),0)} un.</span></div><div id="filmItems">${filmItemsHTML()}</div></aside><div class="film-canvas-panel"><div id="filmMetrics" class="film-metrics"></div><div class="film-preview-shell"><div id="filmPreview" class="film-preview"><div class="empty">Adicione itens e use Atualizar filme para organizar o encaixe.</div></div></div><div class="film-export-actions"><button class="btn primary" id="exportFilm" disabled>Exportar PNG 300 DPI</button><button class="btn" id="saveFilm" disabled>Salvar filme</button></div></div></section></main>`,{back:true});
    app.querySelector('#filmGap').closest('.field').insertAdjacentHTML('afterend','<label class="film-free-rotation"><span><input id="filmFreeRotation" type="checkbox"> Otimizar com rotação livre</span><small>Busca adicional a cada 30° · sem mudar as medidas</small></label>');const freeControl=app.querySelector('#filmFreeRotation');freeControl.checked=Boolean(filmSettings.freeRotation);
    const page=app.querySelector('.film-page'),pageCurrent=()=>page.isConnected&&page===app.querySelector('.film-page')&&renderAccountGeneration===productionAccountGeneration&&renderAccount===String(owner()||'')&&(typeof location==='undefined'||renderRoute===location.hash);
    // Keep everyday actions visible; advanced packing settings remain accessible.
    const advanced=document.createElement('details');advanced.className='film-advanced';advanced.innerHTML='<summary>Opções de encaixe</summary><div class="film-controls"></div>';
    const controls=app.querySelector('.film-controls');controls.after(advanced);
    for(const node of [app.querySelector('#filmMode').closest('.field'),app.querySelector('#filmGap').closest('.field'),freeControl.closest('.film-free-rotation')])advanced.querySelector('div').append(node);
    const ordersSlot=document.createElement('section');ordersSlot.className='film-order-pending';ordersSlot.dataset.filmOrders='';ordersSlot.hidden=true;controls.before(ordersSlot);
    let orderRows=null,fontOrderRows=[],officialPendingRows=[],ordersRequest=0;
    const production=createFilmProduction({supabase,isCurrent:pageCurrent});
    const drawOrders=()=>{
      if(!pageCurrent()||!orderRows)return;
      const linkedRows=orderRows.filter(row=>row.kind!=='legacy_review'),legacyRows=orderRows.filter(row=>row.kind==='legacy_review');
      const remaining=linkedRows.filter(row=>pendingQuantity(row,filmItems)>0),count=remaining.reduce((sum,row)=>sum+pendingQuantity(row,filmItems),0),fontCount=fontOrderRows.reduce((sum,row)=>sum+Math.max(1,Number(row.quantity)||1),0),officialCount=officialPendingRows.length,pendingButton=app.querySelector('#addOfficialPending'),totalPending=count+fontCount+officialCount;if(pendingButton)pendingButton.innerHTML='◷ Aguardando produção <b style="margin-left:6px;border-radius:999px;padding:2px 7px;background:#ff6428;color:#111">'+totalPending+'</b>';
      ordersSlot.innerHTML=`<div class="film-order-heading"><div><b>${count?`${count} estampa(s) liberada(s) para montar`:'Nenhum saldo vinculado fora desta montagem'}</b><small>Pedidos e solicitações de empresas liberados para impressão. O saldo muda após gerar PNG ou TIFF.</small></div><button class="btn small" data-refresh-orders>Atualizar</button></div>${remaining.length?`<details open><summary>Escolher pedidos (${remaining.length} artes)</summary><div class="film-order-list">${remaining.map(row=>`<article><div><b>${h(row.company_name)}</b><span>${h(row.asset_name||row.label)}</span>${row.kind==='company_order'?`<small>${h(row.project_title||'Pedido da empresa')} · ${h(row.product_name||'Produto')} · ${h(row.size||'')}${row.color?' · '+h(row.color):''}</small>`:''}<small>${Number(row.width_cm)} × ${Number(row.height_cm)} cm · faltam ${pendingQuantity(row,filmItems)} · entrega ${h(dateLabel(row.delivery_date))}</small></div><label>Quantidade<input type="number" min="1" max="${Math.min(999,pendingQuantity(row,filmItems))}" value="${Math.min(999,pendingQuantity(row,filmItems))}" inputmode="numeric" data-order-qty="${h(filmOrderRowKey(row))}"></label><button class="btn primary small" data-add-order="${h(filmOrderRowKey(row))}">Adicionar</button></article>`).join('')}</div></details>`:''}${legacyRows.length?`<details class="film-legacy-review"><summary>Pedidos antigos para conferir (${legacyRows.length})</summary><p>Estes pedidos precisam de conferência dos vínculos de arte final e das quantidades por estampa. Não há vínculo automático nem quantidade presumida. Abrir o pedido não altera os valores do orçamento.</p><div class="film-legacy-list">${legacyRows.map(row=>`<article><div><b>${h(row.company_name||'Cliente')}</b><span>${h(row.project_title||'Pedido anterior')}</span><small>Entrega ${h(dateLabel(row.delivery_date))}</small></div><button class="btn small" data-review-legacy-order="${h(row.workspace_id)}">Abrir pedido</button></article>`).join('')}</div></details>`:''}`;
      ordersSlot.querySelector('[data-refresh-orders]').onclick=()=>void refreshOrders();
      ordersSlot.querySelectorAll('[data-review-legacy-order]').forEach(button=>button.onclick=()=>{
        if(pageCurrent()&&button.dataset.reviewLegacyOrder)ctx.nav(`/ambiente/${encodeURIComponent(button.dataset.reviewLegacyOrder)}`);
      });
      ordersSlot.querySelectorAll('[data-add-order]').forEach(button=>button.onclick=()=>{
        if(!pageCurrent())return;
        const row=linkedRows.find(row=>filmOrderRowKey(row)===button.dataset.addOrder);
        if(!row)return;
        const input=[...ordersSlot.querySelectorAll('[data-order-qty]')].find(node=>node.dataset.orderQty===filmOrderRowKey(row)),quantity=Number(input?.value);
        if(!Number.isInteger(quantity)||quantity<1||quantity>Math.min(999,pendingQuantity(row,filmItems)))return ctx.toast('Confira a quantidade pendente deste pedido.','err');
        filmItems.push(filmItemFromOrder(row,quantity));void refreshItems();drawOrders();
      });
    };
    const refreshOrders=async()=>{const request=++ordersRequest;ordersSlot.innerHTML='<small>Conferindo pedidos liberados…</small>';try{const [rows,fonts,officialRows]=await Promise.all([production.pending(),loadZero19FontProductionRows(readySets),ctx.officialOrders?.pendingRows?.()||Promise.resolve([])]);if(!pageCurrent()||request!==ordersRequest)return;orderRows=rows||[];fontOrderRows=fonts||[];officialPendingRows=officialRows||[];drawOrders()}catch(error){if(!pageCurrent()||request!==ordersRequest)return;ordersSlot.innerHTML=`<p role="status">${h(error.message)} Sua montagem continua disponível.</p><button class="btn small">Tentar novamente</button>`;ordersSlot.querySelector('button').onclick=()=>void refreshOrders()}};
    // Removed automatically with the page, not a growing global listener per visit.
    detachProductionListener=()=>{};
    const bindItems=()=>{
      app.querySelectorAll('.film-item-qty').forEach(input=>input.onchange=async()=>{if(!pageCurrent())return;const item=filmItems.find(i=>i.localId===input.dataset.id),quantity=Number(input.value);if(!item)return;if(!Number.isInteger(quantity)||quantity<1||quantity>999){input.value=item.quantity;return ctx.toast('Quantidade deve ser inteira, de 1 a 999.','err')}item.quantity=quantity;await refreshItems()});
      app.querySelectorAll('.edit-film-item').forEach(b=>b.onclick=()=>{if(pageCurrent())editFilmItem(filmItems.find(i=>i.localId===b.dataset.id),refreshItems)});
      app.querySelectorAll('.duplicate-film-item').forEach(b=>b.onclick=()=>{if(pageCurrent())duplicateFilmItem(filmItems.find(i=>i.localId===b.dataset.id),refreshItems)});
      app.querySelectorAll('.color-film-vector').forEach(b=>b.onclick=()=>{if(pageCurrent())safe(()=>openFilmVectorColorEditor(filmItems.find(i=>i.localId===b.dataset.id),refreshItems))});
      app.querySelectorAll('.remove-film-item').forEach(b=>b.onclick=()=>{if(pageCurrent()){removeCurrentFilmEntry(b.dataset.id,media);drawOrders()}});
    };
    const refreshItems=async()=>{if(!pageCurrent())return;filmCalculationGeneration++;filmPreviewGeneration++;filmCostPanel?.invalidate?.();
      lastFilm=null;filmDraftNote='Itens adicionados/atualizados. Preparando imagens e calculando o encaixe…';
      app.querySelector('#filmItems').innerHTML=filmItemsHTML();bindItems();
      refreshAutoName();
      app.querySelector('#filmMetrics').textContent=filmDraftNote;app.querySelector('#filmInspector')?.remove();
      app.querySelector('#exportFilm').disabled=true;app.querySelector('#saveFilm').disabled=true;
      if(typeof mountFilmTools==='function')mountFilmTools(media);
      saveFilmDraft();
      // Return to the picker immediately. Never reload catalogs or wait for
      // originals/alpha masks here; a later edit invalidates this scheduled run.
      const scheduled=filmCalculationGeneration;
      setTimeout(()=>{if(pageCurrent()&&scheduled===filmCalculationGeneration&&filmItems.length)void calculateFilm(media)},0);
    };
    const consumeZero19AssetRequest=async()=>{
      const request=pendingZero19AssetRequest;if(!request)return;
      pendingZero19AssetRequest=null;
      const asset=assetMap.get(request.assetId),profile=profiles.find(row=>row.asset_id===request.assetId);
      if(!asset)throw new Error('A arte deste pedido não está disponível no Montar filme.');
      if(!profile||!profile.ready_for_print)throw new Error('Defina a medida da arte e marque-a como pronta para impressão antes de montar o filme.');
      filmItems.push({
        localId:crypto.randomUUID(),type:'asset',sourceId:asset.id,
        label:(request.clientName||'Cliente ZERO19')+' • '+(asset.name||'DTF'),
        quantity:Math.max(1,Number(request.quantity)||1),
        widthCm:Number(profile.default_width_cm),heightCm:Number(profile.default_height_cm),
        path:asset.processed_path||asset.original_path,workspaceId:asset.workspace_id,
        companyName:request.clientName||'Cliente ZERO19',halftone:Boolean(profile.halftone),
        rotationPolicy:profile.rotation_policy||'none',allowInternalNesting:profile.allow_internal_nesting!==false,
        officialProjectId:request.projectId,officialOrderRef:request.orderRef||'',
        externalOrderItemRef:request.personalizationSaleId||'',
        productionGroupKeys:['order:'+request.projectId],zero19WorkItemId:request.workItemId||null
      });
      await refreshItems();ctx.toast('DTF adicionado ao filme e vinculado ao pedido ZERO19.','ok');
    };
    const consumeZero19TeamRequest=async()=>{
      const request=pendingZero19TeamRequest;if(!request)return;
      pendingZero19TeamRequest=null;
      const set=readySets.find(candidate=>candidate.id===request.fontSetId);
      if(!set)throw new Error('A fonte escolhida neste pedido não está mais liberada. Volte à fila ZERO19 e escolha outra.');
      const settings=customizationDefaults(set),name=String(request.name||'').trim().toUpperCase(),number=String(request.number||'').replace(/\D/g,''),quantity=Math.max(1,Number(request.quantity)||1),groupId=crypto.randomUUID(),items=[];
      if(name)items.push(await makeFilmLetteringPiece(set,{name,settings,compositionMode:'split',pieceType:'name',groupId}));
      for(const digit of number)items.push(await makeFilmLetteringPiece(set,{number:digit,settings,compositionMode:'split',pieceType:'digit',groupId}));
      if(!items.length)throw new Error('O pedido não possui nome nem número para montar no filme.');
      for(const item of items)Object.assign(item,{
        localId:crypto.randomUUID(),quantity,
        officialProjectId:request.projectId,
        officialOrderRef:request.orderRef||'',
        externalOrderItemRef:request.personalizationSaleId||'',
        companyName:request.clientName||'Cliente ZERO19',
        productionGroupKeys:['order:'+request.projectId],
        zero19WorkItemId:request.workItemId||null
      });
      filmItems.push(...items);await refreshItems();ctx.toast('Nome e número adicionados ao filme e vinculados ao pedido ZERO19.','ok');
    };

    const openUnifiedPendingPicker=async()=>{
      if(!orderRows)await refreshOrders();
      const genericRows=(orderRows||[]).filter(row=>row.kind!=='legacy_review'&&pendingQuantity(row,filmItems)>0);
      const fontRows=[...(fontOrderRows||[])];
      const placedRows=[...(officialPendingRows||[])];
      if(!genericRows.length&&!fontRows.length&&!placedRows.length){ctx.toast('Nada aguardando produção agora.','ok');return}

      const selectedGeneric=new Set(genericRows.map(row=>filmOrderRowKey(row)));
      const selectedFonts=new Set(fontRows.map(row=>row.id));
      const selectedPlaced=new Set(placedRows.map(row=>row.placement?.id).filter(Boolean));
      const genericQty=new Map(genericRows.map(row=>[filmOrderRowKey(row),Math.min(999,pendingQuantity(row,filmItems))]));
      const placedQty=new Map(placedRows.map(row=>[row.placement?.id,Math.max(1,Number(row.garment?.quantity||row.placement?.metadata?.order_quantity||1))]));
      const modal=document.createElement('div');modal.className='modal-backdrop';let busy=false;

      const rowLabel=row=>row.workspace?.company_name||row.workspace?.client_name||row.company_name||'Cliente';
      const draw=()=>{
        const genericHtml=genericRows.map(row=>{const key=filmOrderRowKey(row),max=Math.min(999,pendingQuantity(row,filmItems));return '<label class="z19-transfer-row" style="display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center"><input type="checkbox" data-pending-generic="'+h(key)+'" '+(selectedGeneric.has(key)?'checked':'')+'><span><b>'+h(row.company_name||'Cliente')+'</b><span>'+h(row.asset_name||row.label||'Arte')+'</span><small>'+Number(row.width_cm)+' × '+Number(row.height_cm)+' cm · faltam '+max+' · entrega '+h(dateLabel(row.delivery_date))+'</small></span><input style="width:72px" type="number" min="1" max="'+max+'" value="'+genericQty.get(key)+'" data-pending-generic-qty="'+h(key)+'"></label>'}).join('');
        const fontHtml=fontRows.map(row=>{const project=row.project||{},orderRef=project.official_order_payload?.display_id||project.official_order_ref||String(project.id||'').slice(0,8),company=row.workspace?.company_name||row.workspace?.client_name||'Cliente',prod=row.metadata?.details?.[0]?.production||{},detail=[prod.top_text,prod.number].filter(Boolean).join(' · ');return '<label class="z19-transfer-row" style="display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center"><input type="checkbox" data-pending-font="'+h(row.id)+'" '+(selectedFonts.has(row.id)?'checked':'')+'><span><b>'+h(company)+' · Pedido #'+h(orderRef)+'</b><span>'+h(detail||row.text_value||'Nome/número')+'</span><small>'+h(row.metadata?.font_name||row.set?._path||'Fonte definida')+' · '+Math.max(1,Number(row.quantity)||1)+' peça(s)</small></span></label>'}).join('');
        const placedHtml=placedRows.map(row=>{const id=row.placement?.id,detail=[row.garment?.product_name||row.placement?.garment_category,row.placement?.garment_color_name,row.placement?.garment_size,row.placement?.position_code].filter(Boolean).join(' · '),max=999;return '<label class="z19-transfer-row" style="display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center"><input type="checkbox" data-pending-placed="'+h(id)+'" '+(selectedPlaced.has(id)?'checked':'')+'><span><b>'+h(rowLabel(row))+'</b><span>'+h(row.asset?.name||'Arte posicionada')+'</span><small>'+h(detail)+' · '+Number(row.placement?.width_cm||0).toLocaleString('pt-BR',{maximumFractionDigits:2})+' × '+Number(row.placement?.height_cm||0).toLocaleString('pt-BR',{maximumFractionDigits:2})+' cm</small></span><input style="width:72px" type="number" min="1" max="'+max+'" value="'+placedQty.get(id)+'" data-pending-placed-qty="'+h(id)+'"></label>'}).join('');
        const selectedCount=selectedGeneric.size+selectedFonts.size+selectedPlaced.size;
        modal.innerHTML='<div class="modal wide"><div class="modal-head"><div><div class="eyebrow">AGUARDANDO PRODUÇÃO</div><h2>Selecionar itens para o filme</h2><p>Marque somente o que você quer colocar neste filme. Nada muda para Em produção até a exportação e o checklist final.</p></div><button class="btn ghost small close">×</button></div><div style="display:grid;gap:16px;max-height:65dvh;overflow:auto">'+(genericHtml?'<section><b>Pedidos liberados</b><div class="z19-transfer-list" style="margin-top:8px">'+genericHtml+'</div></section>':'')+(fontHtml?'<section><b>Nome / número com fonte definida</b><div class="z19-transfer-list" style="margin-top:8px">'+fontHtml+'</div></section>':'')+(placedHtml?'<section><b>Artes já posicionadas</b><div class="z19-transfer-list" style="margin-top:8px">'+placedHtml+'</div></section>':'')+'</div><div class="modal-footer"><span style="margin-right:auto">'+selectedCount+' item(ns) selecionado(s)</span><button class="btn close">Cancelar</button><button class="btn primary" data-add-pending '+(!selectedCount?'disabled':'')+'>Adicionar selecionados ao filme</button></div></div>';
        modal.querySelectorAll('.close').forEach(button=>button.onclick=()=>!busy&&modal.remove());
        modal.querySelectorAll('[data-pending-generic]').forEach(input=>input.onchange=()=>{input.checked?selectedGeneric.add(input.dataset.pendingGeneric):selectedGeneric.delete(input.dataset.pendingGeneric);draw()});
        modal.querySelectorAll('[data-pending-font]').forEach(input=>input.onchange=()=>{input.checked?selectedFonts.add(input.dataset.pendingFont):selectedFonts.delete(input.dataset.pendingFont);draw()});
        modal.querySelectorAll('[data-pending-placed]').forEach(input=>input.onchange=()=>{input.checked?selectedPlaced.add(input.dataset.pendingPlaced):selectedPlaced.delete(input.dataset.pendingPlaced);draw()});
        modal.querySelectorAll('[data-pending-generic-qty]').forEach(input=>input.onchange=()=>{const key=input.dataset.pendingGenericQty,row=genericRows.find(row=>filmOrderRowKey(row)===key),max=Math.min(999,pendingQuantity(row,filmItems)),qty=Math.max(1,Math.min(max,Number(input.value)||1));genericQty.set(key,qty);input.value=String(qty)});
        modal.querySelectorAll('[data-pending-placed-qty]').forEach(input=>input.onchange=()=>{const id=input.dataset.pendingPlacedQty,qty=Math.max(1,Math.min(999,Number(input.value)||1));placedQty.set(id,qty);input.value=String(qty)});
        modal.querySelector('[data-add-pending]').onclick=async()=>{
          if(busy)return;busy=true;const button=modal.querySelector('[data-add-pending]');button.disabled=true;button.textContent='Adicionando…';
          try{
            const items=[];
            for(const row of genericRows){const key=filmOrderRowKey(row);if(selectedGeneric.has(key))items.push(filmItemFromOrder(row,genericQty.get(key)))}
            for(const row of fontRows)if(selectedFonts.has(row.id))items.push(...await zero19FontFilmItems(row));
            const selectedPlacedRows=placedRows.filter(row=>selectedPlaced.has(row.placement?.id));
            if(selectedPlacedRows.length){
              const prepared=ctx.officialOrders?.pendingFilmItems?.(selectedPlacedRows,placedQty)||[];
              items.push(...prepared);
            }
            if(!items.length)throw new Error('Selecione ao menos um item.');
            filmItems.push(...items);modal.remove();await refreshItems();drawOrders();
          }catch(error){busy=false;ctx.toast(error.message||String(error),'err');draw()}
        };
      };
      document.body.appendChild(modal);draw();
    };

    ctx.bindCommon();const mediaControl=app.querySelector('#filmMedia'),modeControl=app.querySelector('#filmMode'),gapControl=app.querySelector('#filmGap'),nameControl=app.querySelector('#filmName');mediaControl.value=media.some(m=>m.id===filmSettings.mediaId)?filmSettings.mediaId:media[0]?.id||'';filmSettings.mediaId=mediaControl.value;modeControl.value=filmSettings.mode;gapControl.value=String(filmSettings.gapMm).replace('.',',');const refreshAutoName=()=>{if(!filmSettings.nameCustom){filmSettings.name=suggestedFilmName(media);if(nameControl)nameControl.value=filmSettings.name}};refreshAutoName();if(nameControl)nameControl.oninput=()=>{filmSettings={...filmSettings,name:nameControl.value,nameCustom:true};saveFilmDraft()};const invalidate=()=>{filmCostPanel?.invalidate?.();filmCalculationGeneration++;filmPreviewGeneration++;filmSettings={...filmSettings,mediaId:mediaControl.value,mode:modeControl.value,gapMm:Number(gapControl.value.replace(',','.')),freeRotation:freeControl.checked};lastFilm=null;filmCostPanel?.refresh?.();filmDraftNote='';saveFilmDraft();app.querySelector('#filmPreview').innerHTML='<div class="empty">Configuração alterada. Calcule o filme novamente.</div>';app.querySelector('#filmMetrics').innerHTML='';app.querySelector('#filmInspector')?.remove();app.querySelector('#exportFilm').disabled=true;app.querySelector('#saveFilm').disabled=true};mediaControl.onchange=()=>{invalidate();refreshAutoName()};modeControl.onchange=invalidate;gapControl.oninput=invalidate;freeControl.onchange=invalidate;app.querySelector('#addFilmAsset').onclick=()=>safe(()=>pickFilmAsset(profiles,assetMap,refreshItems));app.querySelector('#addOfficialPending').onclick=()=>safe(()=>openUnifiedPendingPicker());app.querySelector('#addFilmTeam').onclick=()=>safe(()=>pickFilmTeam(readySets,refreshItems));app.querySelector('#calculateFilm').onclick=()=>calculateFilm(media);app.querySelector('#exportFilm').onclick=()=>safe(()=>exportFilm(media,assetMap));app.querySelector('#saveFilm').onclick=()=>saveFilmJob(media);bindItems();bindFilmJobs(media);if(lastFilm){drawFilm(media);app.querySelector('#exportFilm').disabled=false;app.querySelector('#saveFilm').disabled=false}
    void refreshOrders();void refreshFilmJobs(media);if(pendingZero19TeamRequest)void safe(()=>consumeZero19TeamRequest());if(pendingZero19AssetRequest)void safe(()=>consumeZero19AssetRequest());filmDraftBanner();if(filmDraftDirty)saveFilmDraft();return true;
  }
  async function refreshFilmJobs(media){
    const slot=app.querySelector('[data-film-jobs]');if(!slot)return;
    const generation=productionAccountGeneration,account=String(owner()||''),route=typeof location==='undefined'?'':location.hash;
    const current=()=>slot.isConnected&&slot===app.querySelector('[data-film-jobs]')&&generation===productionAccountGeneration&&account===String(owner()||'')&&(typeof location==='undefined'||location.hash===route);
    slot.innerHTML='<small>Carregando filmes salvos…</small>';
    try{
      const jobs=await listFilmJobs(supabase,account);if(!current())return;
      slot.innerHTML=jobs.length?`<details class="saved-film-jobs"><summary>Filmes salvos (${jobs.length})</summary><div>${jobs.map(job=>`<button class="saved-film-job" data-job="${h(job.id)}"><b>${h(job.name)}${job.commit_state==='pending'?' · salvamento incompleto':''}</b><span>${Number(job.film_width_cm)} cm × ${Number(job.calculated_length_cm||0).toFixed(1)} cm • ${new Date(job.updated_at).toLocaleString('pt-BR')}</span></button>`).join('')}</div></details>`:'';
      bindFilmJobs(media);
    }catch(error){
      if(!current())return;
      slot.innerHTML='<div data-film-jobs-error role="status"><p>'+h(error.message||'Não foi possível consultar os jobs salvos.')+' Sua montagem continua disponível.</p><button class="btn small">Tentar novamente</button></div>';
      slot.querySelector('button').onclick=()=>refreshFilmJobs(media);
    }
  }
  function bindFilmJobs(media){
    app.querySelectorAll('[data-job]').forEach(button=>button.onclick=()=>safe(async()=>{
      if(button.disabled||filmJobOpening||filmJobSaving)return;
      const generation=productionAccountGeneration,account=String(owner()||''),change=filmDraftChange,route=typeof location==='undefined'?'':location.hash;
      button.disabled=true;
      try{
        const job=await getFilmJob(supabase,account,button.dataset.job);
        if(!button.isConnected||generation!==productionAccountGeneration||account!==String(owner()||'')||(typeof location!=='undefined'&&location.hash!==route))return;
        if(change!==filmDraftChange)throw new Error('A montagem mudou durante a consulta. Ela foi preservada; tente abrir o job novamente.');
        if(!job)throw new Error('Este job não está mais disponível para sua conta. Atualize a lista.');
        if(await openFilmJob(job,media))saveFilmDraft(true);
      }finally{if(button.isConnected)button.disabled=false;}
    }));
  }
  function filmItemPreview(item){const url=item.previewDataUrl||(item.path?ctx.publicUrl(item.path):'');return url?`<img src="${h(url)}" alt="" loading="lazy" decoding="async">`:'<span>ARTE</span>'}
  function hasEditableVectorColor(item){return item?.type==='team_customization'&&Boolean(item.vectorSource||(item.glyphs||[]).some(glyph=>glyph.svg_markup))}
  function filmItemsHTML(){return filmItems.length?filmItems.map(i=>`<article class="film-item editable-film-item"><div class="film-item-thumb">${filmItemPreview(i)}</div><div class="film-item-main"><div class="film-item-head"><div><b>${h(i.label)}</b><small>${i.widthCm.toFixed(2)} × ${i.heightCm.toFixed(2)} cm${i.halftone?' • halftone':''}</small></div><button class="film-remove-item remove-film-item" data-id="${i.localId}" aria-label="Remover ${h(i.label)}">×</button></div><div class="film-item-edit"><label>Quantidade<input class="film-item-qty" data-id="${i.localId}" type="number" inputmode="numeric" min="1" max="999" value="${i.quantity}"></label><button class="btn small edit-film-item" data-id="${i.localId}">Tamanho</button><button class="btn small duplicate-film-item" data-id="${i.localId}">Duplicar</button>${hasEditableVectorColor(i)?`<button class="btn small color-film-vector" data-id="${i.localId}">Cor vetor</button>`:''}</div></div></article>`).join(''):'<div class="empty mini">Nenhum item. Adicione uma arte ou personalização.</div>'}
  async function openFilmVectorColorEditor(item,done){
    if(!hasEditableVectorColor(item))return;let markups=[];
    if(item.vectorSource)markups=[await privateVectorMarkup(item.vectorSource)];else{const used=new Set([...(String(item.name||'')),...(String(item.number||''))]);markups=(item.glyphs||[]).filter(glyph=>glyph.svg_markup&&(!used.size||used.has(String(glyph.glyph_key)))).map(glyph=>glyph.svg_markup)}
    const colors=[...new Set(markups.flatMap(vectorSvgColors))];if(!colors.length)throw new Error('Não encontrei cores sólidas editáveis neste vetor.');
    const current={...(item.vectorColorOverrides||{})},palette=[...new Map((item.palette||[]).map(entry=>[canonicalVectorColor(entry.color_hex),entry]).filter(([key])=>key)).values()];let active=colors[0];
    const modal=document.createElement('div');modal.className='modal-backdrop';modal.innerHTML=`<div class="modal compact vector-color-modal" role="dialog" aria-modal="true"><div class="modal-head"><div><div class="eyebrow">COR DO VETOR</div><h2>${h(item.label)}</h2><p>Troque somente a cor escolhida. As outras cores e o desenho do SVG são preservados.</p></div><button class="btn ghost small close">×</button></div><div class="vector-color-list">${colors.map(color=>{const value=canonicalVectorColor(current[color])||color;return `<label class="vector-color-row" data-vector-source="${color}"><span class="vector-original-swatch" style="--vector-color:${color}"></span><span><b>${color}</b><small>Cor encontrada no vetor</small></span><input type="color" data-vector-color value="${value}"><button type="button" class="btn small" data-eyedrop ${typeof EyeDropper==='undefined'?'hidden':''}>Conta-gotas</button><button type="button" class="btn ghost small" data-vector-reset>Original</button></label>`}).join('')}</div>${palette.length?`<div class="vector-palette"><small>CORES CADASTRADAS</small><div>${palette.map(entry=>`<button type="button" data-palette-color="${h(canonicalVectorColor(entry.color_hex))}" style="--vector-color:${h(canonicalVectorColor(entry.color_hex))}" title="${h(entry.role||entry.name||entry.color_hex)}"></button>`).join('')}</div></div>`:''}<div class="modal-footer"><button class="btn close" type="button">Cancelar</button><button class="btn primary" data-save-vector type="button">Aplicar cor no vetor</button></div></div>`;
    document.body.appendChild(modal);const selectRow=row=>{active=row?.dataset.vectorSource||active;modal.querySelectorAll('[data-vector-source]').forEach(node=>node.classList.toggle('active',node.dataset.vectorSource===active))};selectRow(modal.querySelector('[data-vector-source]'));
    modal.querySelectorAll('[data-vector-source]').forEach(row=>row.onclick=event=>{if(!event.target.closest('button,input'))selectRow(row)});
    modal.querySelectorAll('[data-vector-color]').forEach(input=>{input.onfocus=()=>selectRow(input.closest('[data-vector-source]'));input.oninput=()=>{const source=input.closest('[data-vector-source]').dataset.vectorSource;current[source]=canonicalVectorColor(input.value)||source}});
    modal.querySelectorAll('[data-vector-reset]').forEach(button=>button.onclick=()=>{const row=button.closest('[data-vector-source]'),source=row.dataset.vectorSource;delete current[source];row.querySelector('[data-vector-color]').value=source;selectRow(row)});
    modal.querySelectorAll('[data-eyedrop]').forEach(button=>button.onclick=async()=>{selectRow(button.closest('[data-vector-source]'));try{const result=await new EyeDropper().open(),input=button.closest('[data-vector-source]').querySelector('[data-vector-color]');input.value=result.sRGBHex;input.dispatchEvent(new Event('input',{bubbles:true}))}catch(error){if(error?.name!=='AbortError')throw error}});
    modal.querySelectorAll('[data-palette-color]').forEach(button=>button.onclick=()=>{const row=[...modal.querySelectorAll('[data-vector-source]')].find(node=>node.dataset.vectorSource===active),input=row?.querySelector('[data-vector-color]');if(input){input.value=button.dataset.paletteColor;input.dispatchEvent(new Event('input',{bubbles:true}))}});
    const close=()=>modal.remove();modal.querySelectorAll('.close').forEach(button=>button.onclick=close);modal.querySelector('[data-save-vector]').onclick=()=>safe(async()=>{const cleaned={};for(const source of colors){const target=canonicalVectorColor(current[source]);if(target&&target!==source)cleaned[source]=target}item.vectorColorOverrides=cleaned;delete item.previewDataUrl;delete item.previewQualityVersion;lastFilm=null;filmMaskCache.clear();await regenerateFilmDraftPreviews();saveFilmDraft();close();await done();ctx.toast('Cor do vetor atualizada neste filme.','ok')});
  }
  function duplicateFilmItem(item,done){
    if(!item)return;const copy=structuredClone(item);copy.localId=crypto.randomUUID();copy.quantity=1;const index=filmItems.indexOf(item);filmItems.splice(index<0?filmItems.length:index+1,0,copy);
    const modal=document.createElement('div');modal.className='modal-backdrop';modal.innerHTML=`<div class="modal compact" role="dialog" aria-modal="true" aria-label="Duplicar item"><div class="modal-head"><div><div class="eyebrow">Duplicar arte</div><h2>${h(item.label)}</h2></div><button class="btn ghost small close">×</button></div><p>Escolha se a cópia mantém a medida atual ou será usada em outro tamanho.</p><div class="modal-footer"><button class="btn close" data-keep>Manter tamanho</button><button class="btn primary" data-resize>Alterar tamanho</button></div></div>`;document.body.appendChild(modal);let settled=false;const finish=async resize=>{if(settled)return;settled=true;modal.remove();if(resize)editFilmItem(copy,done);else await done()};modal.querySelectorAll('.close').forEach(button=>button.onclick=()=>finish(false));modal.querySelector('[data-keep]').onclick=()=>finish(false);modal.querySelector('[data-resize]').onclick=()=>finish(true);
  }
  function editFilmItem(item,done){
    if(!item)return;
    const generation=productionAccountGeneration,account=String(owner()||''),route=typeof location==='undefined'?'':location.hash;
    const current=()=>generation===productionAccountGeneration&&account===String(owner()||'')&&(typeof location==='undefined'||route===location.hash)&&filmItems.includes(item);
    const modal=document.createElement('div');modal.className='modal-backdrop';const ratio=item.widthCm/item.heightCm;
    modal.innerHTML=`<form class="modal compact" role="dialog" aria-modal="true" aria-label="Editar item do filme"><div class="modal-head"><h2>Editar item</h2><button type="button" class="btn small close">×</button></div><p>${h(item.label)}</p><div class="form-grid"><label class="field">Largura (cm)<input name="width" inputmode="decimal" value="${String(item.widthCm).replace('.',',')}"></label><label class="field">Altura (cm)<input name="height" inputmode="decimal" value="${String(item.heightCm).replace('.',',')}"></label><label class="field full">Quantidade<input name="quantity" type="number" inputmode="numeric" min="1" max="999" value="${item.quantity}"></label></div><p class="hint">Proporção preservada. A alteração vale somente para este filme e recalcula o encaixe.</p><div class="modal-footer"><button type="button" class="btn close">Cancelar</button><button class="btn primary">Aplicar e recalcular</button></div></form>`;
    document.body.append(modal);const form=modal.querySelector('form'),parse=v=>Number(String(v).replace(',','.'));modal.querySelectorAll('.close').forEach(b=>b.onclick=()=>modal.remove());form.elements.width.oninput=()=>{const w=parse(form.elements.width.value);if(w>0)form.elements.height.value=String(Number((w/ratio).toFixed(4))).replace('.',',')};form.elements.height.oninput=()=>{const h=parse(form.elements.height.value);if(h>0)form.elements.width.value=String(Number((h*ratio).toFixed(4))).replace('.',',')};form.onsubmit=async e=>{e.preventDefault();if(!current()){modal.remove();return}const w=parse(form.elements.width.value),q=Number(form.elements.quantity.value);if(!(w>0&&w<=1000&&Number.isInteger(q)&&q>0&&q<=999))return ctx.toast('Informe medidas positivas e quantidade inteira de 1 a 999.','err');if(item.type==='team_customization'){const factor=w/item.widthCm;for(const key of ['nameHeightCm','numberHeightCm','gapCm','nameTrackingCm','digitSpacingCm'])if(Number.isFinite(item[key]))item[key]*=factor}item.widthCm=w;item.heightCm=w/ratio;item.quantity=q;item.sizeOverride=true;modal.remove();await done()};form.elements.width.focus();
  }
  async function pickFilmAsset(profiles,assetMap,done){
    const generation=productionAccountGeneration,account=String(owner()||''),route=typeof location==='undefined'?'':location.hash;
    const current=()=>generation===productionAccountGeneration&&account===String(owner()||'')&&(typeof location==='undefined'||location.hash===route);
    const results=await preloadFilmPickerMeta();
    if(!current())return;
    const previewUrl=path=>{try{return supabase.storage.from('z19p-assets').getPublicUrl(path,{transform:{width:520,height:520,resize:'contain',quality:72}})?.data?.publicUrl||ctx.publicUrl(path)}catch{return ctx.publicUrl(path)}};
    const picker=openFilmAssetPicker({profiles,assetMap,workspaces:results[0],projects:results[1],folders:results[2],publicUrl:ctx.publicUrl,previewUrl,toast:ctx.toast,onAdd:async(items,{signal}={})=>{if(!current()||signal?.aborted)return;filmItems.push(...items);await done()},onMockup:typeof ctx.openArtMockup==='function'?asset=>current()&&ctx.openArtMockup(asset,{onSaved:profile=>current()&&picker.refreshAsset(asset,profile)}):undefined,onEdit:typeof ctx.openArtEditor==='function'?asset=>current()&&ctx.openArtEditor(asset,{onSaved:async updated=>{if(!current())return;const result=await supabase.from('z19p_asset_print_profiles').select('*').eq('asset_id',updated.id).maybeSingle();if(!current())return;if(result.error){ctx.toast('Arte salva. Reabra a seleção para atualizar as medidas.','err');return}picker.refreshAsset(updated,result.data)}}):undefined});return picker;
  }
  function glyphAspect(markup){try{const root=new DOMParser().parseFromString(markup,'image/svg+xml').documentElement,view=(root.getAttribute('viewBox')||'').trim().split(/[ ,]+/).map(Number);if(view.length===4&&view[2]>0&&view[3]>0)return view[2]/view[3];const width=parseFloat(root.getAttribute('width')),height=parseFloat(root.getAttribute('height'));return width>0&&height>0?width/height:.65}catch{return .65}}
  async function pickFilmTeam(sets,done){
    const generation=productionAccountGeneration,account=String(owner()||'');
    const current=()=>generation===productionAccountGeneration&&account===String(owner()||'');
    const letteringSets=(sets||[]).filter(set=>(set._kind||customizationKind(set))==='lettering'),otherSets=(sets||[]).filter(set=>(set._kind||customizationKind(set))!=='lettering');
    if(letteringSets.length){
      const result=await openFilmLetteringBatchComposer(letteringSets,{allowLegacy:otherSets.length>0});if(!result||!current())return;
      if(result.legacy){const item=await openCustomizationComposer(otherSets);if(!item||!current())return;filmItems.push({...item,localId:crypto.randomUUID()});await done?.();return;}
      filmItems.push(...result.map(item=>({...item,localId:item.localId||crypto.randomUUID()})));await done?.();return;
    }
    const item=await openCustomizationComposer(otherSets);if(!item||!current())return;filmItems.push({...item,localId:crypto.randomUUID()});await done?.();
  }

  async function loadZero19FontProductionRows(readySets=[]){
    const account=owner();if(!account)return [];
    const {data,error}=await supabase.from('z19p_zero19_work_items').select('id,project_id,personalization_sale_id,text_value,quantity,promised_at,metadata,garment_name,garment_size,garment_color').eq('owner_id',account).eq('stage','ready_production').order('promised_at',{ascending:true,nullsFirst:false}).order('created_at');
    if(error)throw error;
    const setMap=new Map((readySets||[]).map(set=>[set.id,set])),rows=(data||[]).filter(row=>row.metadata?.font_set_id&&setMap.has(row.metadata.font_set_id));
    if(!rows.length)return [];
    const projectIds=[...new Set(rows.map(row=>row.project_id).filter(Boolean))],{data:projects,error:projectError}=await supabase.from('z19p_projects').select('id,workspace_id,title,official_order_ref,official_order_payload').in('id',projectIds);if(projectError)throw projectError;
    const projectMap=new Map((projects||[]).map(project=>[project.id,project])),workspaceIds=[...new Set((projects||[]).map(project=>project.workspace_id).filter(Boolean))];
    const {data:workspaces,error:workspaceError}=workspaceIds.length?await supabase.from('z19p_workspaces').select('id,company_name,client_name,phone').in('id',workspaceIds):{data:[],error:null};if(workspaceError)throw workspaceError;
    const workspaceMap=new Map((workspaces||[]).map(workspace=>[workspace.id,workspace]));
    return rows.map(row=>({...row,set:setMap.get(row.metadata.font_set_id),project:projectMap.get(row.project_id)||null,workspace:workspaceMap.get(projectMap.get(row.project_id)?.workspace_id)||null}));
  }
  async function zero19FontFilmItems(row){
    const set=row.set;if(!set)throw new Error('A fonte vinculada a este pedido não está mais liberada.');
    const production=row.metadata?.details?.[0]?.production||{},rawName=String(production.top_text||'').trim(),number=String(production.number||'').trim(),lines=rawName.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
    if(!lines.length&&!number)throw new Error('O pedido não possui nome, frase ou número para produzir.');
    const settings=customizationDefaults(set),groupId=crypto.randomUUID(),items=[];
    for(const line of lines)items.push(await makeFilmLetteringPiece(set,{name:line,settings,compositionMode:'split',pieceType:'name',groupId}));
    for(const digit of number)items.push(await makeFilmLetteringPiece(set,{number:digit,settings,compositionMode:'split',pieceType:'digit',groupId}));
    const qty=Math.max(1,Number(row.quantity)||1),project=row.project||{},workspace=row.workspace||{},orderRef=project.official_order_payload?.display_id||project.official_order_ref||String(project.id||'').slice(0,8),company=workspace.company_name||workspace.client_name||'Cliente';
    return items.map(item=>({...item,localId:crypto.randomUUID(),quantity:qty,projectId:row.project_id,officialProjectId:row.project_id,officialOrderRef:String(orderRef),externalOrderItemRef:row.personalization_sale_id,productionGroupKeys:['order:'+row.project_id],companyName:company,zero19WorkItemId:row.id,label:company+' • Pedido #'+orderRef+' • '+item.label}));
  }
  async function openZero19FontProductionPicker(rows,{onAdd,onOther}={}){
    const modal=document.createElement('div');modal.className='modal-backdrop';let selected=new Set((rows||[]).map(row=>row.id)),busy=false;
    const draw=()=>{
      modal.innerHTML='<div class="modal wide"><div class="modal-head"><div><div class="eyebrow">CAMISA DE TIME · FONTE DEFINIDA</div><h2>Nome e número prontos para o filme</h2><p>Estes pedidos já possuem fonte oficial escolhida no PDV. O pedido só muda para Em produção depois do checklist da exportação.</p></div><button class="btn ghost small close">×</button></div><div class="z19-transfer-list">'+((rows||[]).length?(rows||[]).map(row=>{const prod=row.metadata?.details?.[0]?.production||{},project=row.project||{},orderRef=project.official_order_payload?.display_id||project.official_order_ref||String(project.id||'').slice(0,8),company=row.workspace?.company_name||row.workspace?.client_name||'Cliente',detail=[prod.top_text,prod.number].filter(Boolean).join(' · '),font=row.metadata?.font_name||row.set?._path||customizationName(row.set);return '<label class="z19-transfer-row" style="display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start"><input type="checkbox" data-font-row="'+h(row.id)+'" '+(selected.has(row.id)?'checked':'')+'><span><b>'+h(company)+' · Pedido #'+h(orderRef)+'</b><span>'+h(detail||row.text_value||'Nome/número')+'</span><small>'+h(font)+' · '+Math.max(1,Number(row.quantity)||1)+' peça(s) · prazo '+h(dateLabel(row.promised_at))+'</small></span></label>'}).join(''):'<div class="empty mini">Nenhum nome/número com fonte definida aguardando produção.</div>')+'</div><div class="modal-footer"><button class="btn" data-other>Ver outras artes</button><div class="spacer"></div><button class="btn close">Cancelar</button><button class="btn primary" data-add-font '+(!selected.size?'disabled':'')+'>Adicionar selecionados ao filme</button></div></div>';
      modal.querySelectorAll('.close').forEach(button=>button.onclick=()=>!busy&&modal.remove());
      modal.querySelectorAll('[data-font-row]').forEach(input=>input.onchange=()=>{input.checked?selected.add(input.dataset.fontRow):selected.delete(input.dataset.fontRow);draw()});
      modal.querySelector('[data-other]').onclick=()=>{if(busy)return;modal.remove();onOther?.()};
      modal.querySelector('[data-add-font]').onclick=async()=>{if(busy||!selected.size)return;busy=true;const button=modal.querySelector('[data-add-font]');button.disabled=true;button.textContent='Preparando fontes…';try{const result=[];for(const row of rows.filter(row=>selected.has(row.id)))result.push(...await zero19FontFilmItems(row));await onAdd?.(result);modal.remove()}catch(error){busy=false;ctx.toast(error.message||String(error),'err');draw()}};
    };
    document.body.appendChild(modal);draw();return modal;
  }

  const filmMaskCache=createFilmMaskCache({prepare:prepareFilmMask});
  async function maskForItem(item){
    if(item.halftone)return null;
    const source=item.type==='asset'&&item.path?ctx.publicUrl(item.path):item.type==='team_customization'&&item.previewDataUrl?item.previewDataUrl:null;
    if(!source)return null;
    try{return await filmMaskCache.get(source)}catch(error){if(error?.name==='AbortError')throw error;console.warn('mask',error);return null}
  }
  async function prepareFilmMask(source,{signal}){
    const check=()=>{if(signal.aborted)throw signal.reason||new DOMException('Preparação cancelada.','AbortError')};
    let canvas;check();
    try{
      const image=new Image();if(!source.startsWith('data:'))image.crossOrigin='anonymous';
      await new Promise((resolve,reject)=>{
        let timer;
        const finish=error=>{clearTimeout(timer);signal.removeEventListener('abort',abort);error?reject(error):resolve()};
        const abort=()=>{image.src='';finish(signal.reason||new DOMException('Preparação cancelada.','AbortError'))};
        signal.addEventListener('abort',abort,{once:true});
        timer=setTimeout(()=>{image.src='';finish(new Error('A imagem demorou para carregar; o encaixe usará o retângulo seguro.'))},30000);
        image.src=source;image.decode().then(()=>finish(),finish);
      });check();
      const iw=image.naturalWidth,ih=image.naturalHeight,w=Math.min(180,iw),height=Math.max(1,Math.ceil(w*ih/iw));
      if(!iw||!ih||iw*ih>68e6||height>2000)return null;
      canvas=document.createElement('canvas');canvas.width=iw;canvas.height=Math.min(64,ih);const g=canvas.getContext('2d',{willReadFrequently:true}),data=new Uint8Array(w*height);
      for(let row=0;row<ih;row+=64){check();const rows=Math.min(64,ih-row);g.clearRect(0,0,iw,64);g.drawImage(image,0,row,iw,rows,0,0,iw,rows);const rgba=g.getImageData(0,0,iw,rows).data;
        for(let y=0;y<rows;y++){const my=Math.min(height-1,Math.floor((row+y)*height/ih));for(let x=0;x<iw;x++)if(rgba[(y*iw+x)*4+3]>0)data[my*w+Math.min(w-1,Math.floor(x*w/iw))]=1}
        if(row%1024===0)await new Promise(resolve=>setTimeout(resolve,0));
      }
      check();return {w,h:height,data};
    }finally{if(canvas)canvas.width=canvas.height=1;}
  }
  async function filmNestingItems(){return Promise.all(filmItems.map(async item=>({id:item.localId,label:item.label,widthMm:item.widthCm*10,heightMm:item.heightCm*10,quantity:item.quantity,halftone:item.halftone,allowInternalNesting:item.halftone?false:true,rotationPolicy:filmSettings.freeRotation?'free':(item.rotationPolicy&&item.rotationPolicy!=='none'?item.rotationPolicy:'free'),mask:await maskForItem(item)})))}
  async function calculateFilm(media){
    if(!filmItems.length)return ctx.toast('Adicione ao menos um item.','err');
    const button=app.querySelector('#calculateFilm');if(!button)return;
    const generation=++filmCalculationGeneration,account=String(owner()||''),accountGeneration=productionAccountGeneration,route=typeof location==='undefined'?'':location.hash,current=()=>generation===filmCalculationGeneration&&accountGeneration===productionAccountGeneration&&account===String(owner()||'')&&(typeof location==='undefined'||route===location.hash)&&button===app.querySelector('#calculateFilm');button.dataset.calculation=String(generation);button.disabled=true;button.textContent='Preparando imagens…';
    try{
      const profile=media.find(m=>m.id===app.querySelector('#filmMedia').value),mode=app.querySelector('#filmMode').value,rawGap=app.querySelector('#filmGap').value.trim(),gap=Number(rawGap.replace(',','.'));
      if(!profile)throw new Error('Escolha um perfil de filme válido.');if(!rawGap||!Number.isFinite(gap)||gap<0||gap>50)throw new Error('Informe uma distância de 0 a 50 mm entre as artes.');
      filmSettings={...filmSettings,mediaId:profile.id,mode,gapMm:gap};
      const items=await filmNestingItems();if(!current())return;
      button.textContent='Calculando encaixe…';
      const result=await runNesting(items,{filmWidthMm:Number(profile.usable_width_cm)*10,mode,gapMm:gap,cellMm:mode==='maximum'?1:2,freeRotation:filmSettings.freeRotation,angleStep:filmSettings.angleStep,lockedPlacements:lastFilm?.placements.filter(p=>p.locked)||[],baselinePlacements:lastFilm?.placements||[]});if(!current())return;
      const previewsReady=await regenerateFilmDraftPreviews();if(!current())return;if(!previewsReady){lastFilm=null;throw new Error(filmDraftNote);}
      lastFilm=result;filmDraftNote='';saveFilmDraft(true);if(result.rotationSearchWarning)ctx.toast(result.rotationSearchWarning,'warn');if(result.nestingSearchWarning)ctx.toast(result.nestingSearchWarning,'warn');
      drawFilm(media);app.querySelector('#exportFilm').disabled=false;app.querySelector('#saveFilm').disabled=false;
    }catch(error){if(current()){console.error(error);filmDraftNote='Itens preservados. Não foi possível concluir o encaixe: '+(error.message||String(error));filmDraftBanner();const metrics=app.querySelector('#filmMetrics');if(metrics)metrics.textContent=filmDraftNote;ctx.toast(error.message||String(error),'err')}}finally{if(button.isConnected&&button===app.querySelector('#calculateFilm')&&button.dataset.calculation===String(generation)){button.disabled=false;button.textContent='Atualizar filme'}}
  }
  function removeCurrentFilmEntry(id,media,copy){
    const result=removeFilmEntry(filmItems,lastFilm,{id,copy});if(!result.changed)return false;
    filmCalculationGeneration++;filmPreviewGeneration++;filmItems=result.items;lastFilm=result.layout;
    filmCostPanel?.invalidate?.();filmDraftNote='Peça removida. As demais posições foram preservadas; use Otimizar espaços para fechar o vazio.';
    const quantity=[...app.querySelectorAll('.film-item-qty')].find(control=>control.dataset.id===id),item=filmItems.find(entry=>entry.localId===id);
    if(item&&quantity)quantity.value=item.quantity;else quantity?.closest('article')?.remove();
    const host=app.querySelector('#filmItems');if(host&&!filmItems.length)host.innerHTML='<div class="empty mini">Nenhum item.</div>';
    if(lastFilm?.placements.length)drawFilm(media);
    else{
      const metrics=app.querySelector('#filmMetrics');if(metrics)metrics.innerHTML='';
      const preview=app.querySelector('#filmPreview');if(preview)preview.innerHTML='<div class="empty">'+(filmItems.length?'Itens preservados. Calcule o filme para organizar.':'Filme vazio. Adicione itens para continuar.')+'</div>';
      app.querySelector('#filmInspector')?.remove();filmCostPanel?.refresh?.();
    }
    for(const selector of ['#exportFilm','#saveFilm']){const button=app.querySelector(selector);if(button)button.disabled=!lastFilm?.placements.length;}
    if(typeof mountFilmTools==='function')mountFilmTools(media);
    saveFilmDraft();return true;
  }
  function drawFilm(media){
    const preview=app.querySelector('#filmPreview');if(!preview||!lastFilm)return;const generation=++filmPreviewGeneration,account=String(owner()||''),accountGeneration=productionAccountGeneration,route=typeof location==='undefined'?'':location.hash;
    let shownLayout=lastFilm;
    const current=()=>generation===filmPreviewGeneration&&accountGeneration===productionAccountGeneration&&account===String(owner()||'')&&(typeof location==='undefined'||route===location.hash)&&preview.isConnected&&preview===app.querySelector('#filmPreview')&&lastFilm===shownLayout;
    const metrics=()=>{const target=app.querySelector('#filmMetrics');if(!current()||!target)return;const pct=value=>Number.isFinite(value)?value.toFixed(1)+'%':'—';target.innerHTML=`<span><small>Filme</small><b>${shownLayout.filmWidthMm/10} cm</b></span><span><small>Comprimento</small><b>${(shownLayout.lengthMm/10).toFixed(1)} cm</b></span><span><small>Metros</small><b>${(shownLayout.lengthMm/1000).toFixed(3)} m</b></span><span><small>Aproveitamento aprox.</small><b>${pct(shownLayout.efficiency)}</b></span><span><small>Desperdício aprox.</small><b>${pct(shownLayout.waste)}</b></span><span><small>Modo</small><b>${shownLayout.mode==='maximum'?'Máximo':'Normal'}</b></span>${shownLayout.metricsNeedRecalculation?'<small>Posições preservadas. Use Otimizar espaços para recalcular o aproveitamento.</small>':''}`};
    metrics();mountFilmPreview({element:preview,layout:shownLayout,items:filmItems,publicUrl:ctx.publicUrl,isCurrent:current,
      validate:async (placements,moving,validationOptions={})=>{
        if(!current())return null;const snapshot=shownLayout,calculation=filmCalculationGeneration,valid=()=>current()&&shownLayout===snapshot&&calculation===filmCalculationGeneration;
        const settings={filmWidthMm:snapshot.filmWidthMm,mode:snapshot.mode,gapMm:snapshot.gapMm,cellMm:snapshot.cellMm||2,freeRotation:validationOptions.allowFreeRotation===true?true:snapshot.freeRotation,angleStep:snapshot.angleStep};
        let items=await filmNestingItems();if(validationOptions.allowFreeRotation===true)items=items.map(item=>({...item,rotationPolicy:'free'}));if(!valid())return null;
        let result;
        if(moving)result=await runNesting(items,{...settings,operation:'move',placements,moving,lengthMm:snapshot.lengthMm});
        else{const {validateFilmPlacements}=await import('./nesting-core.js?v=2.17.5');if(!valid())return null;result=validateFilmPlacements(items,placements,settings);}
        return valid()?result:null;
      },
      onChange:layout=>{if(!current()||!layout?.placements)return false;filmCalculationGeneration++;lastFilm=shownLayout=layout;filmSettings={...filmSettings,freeRotation:Boolean(layout.freeRotation)};const rotationControl=app.querySelector('#filmFreeRotation');if(rotationControl)rotationControl.checked=filmSettings.freeRotation;filmDraftNote='';saveFilmDraft();metrics();filmCostPanel?.refresh();return true},
      onDelete:placement=>{if(!current())return false;return removeCurrentFilmEntry(placement.id,media,placement.copy)},
      onRepack:async lockedPlacements=>{
        if(!current())return null;const snapshot=shownLayout,calculation=filmCalculationGeneration,valid=()=>current()&&shownLayout===snapshot&&calculation===filmCalculationGeneration;
        const settings={filmWidthMm:snapshot.filmWidthMm,mode:snapshot.mode,gapMm:snapshot.gapMm,cellMm:snapshot.cellMm||2,freeRotation:snapshot.freeRotation,angleStep:snapshot.angleStep,lockedPlacements,baselinePlacements:snapshot.placements};
        const items=await filmNestingItems();if(!valid())return null;const result=await runNesting(items,settings);return valid()?result:null;
      }});
    if(ctx.getCostUI?.()){let slot=app.querySelector('#filmCostSummary');if(!slot){slot=document.createElement('section');slot.id='filmCostSummary';app.querySelector('.film-workspace').insertAdjacentElement('afterend',slot)}filmCostPanel?.destroy();filmCostPanel=ctx.getCostUI().mountFilmCost(slot,{getLayout:()=>lastFilm,getItems:()=>filmItems,getImageUrl:item=>item.previewDataUrl||(item.path?ctx.publicUrl(item.path):null),getCommission:()=>ctx.getFilmCommissions?.(filmItems)})}
  }
  const colorFor=(item,role)=>item.palette?.find(color=>color.role===role)?.color_hex||item.palette?.find(color=>color.role==='primary')?.color_hex||'#ffffff';
  function drawPlacedImage(g,image,x,y,w,height,rotation=0,sourceW=w,sourceH=height){g.save();g.translate(x+w/2,y+height/2);g.rotate(rotation*Math.PI/180);g.drawImage(image,-sourceW/2,-sourceH/2,sourceW,sourceH);g.restore()}
  async function drawVectorLine(g,text,glyphMap,x,y,maxWidth,heightCm,spacingCm){
    const line=measureLetteringLine(text,{heightCm,trackingCm:spacingCm??0,glyphs:[...glyphMap.values()],glyphAspect:glyph=>glyphAspect(glyph.svg_markup)}),pixelsPerCm=300/2.54;
    g.save();try{g.translate(x+(maxWidth-line.widthCm*pixelsPerCm)/2,y);g.scale(pixelsPerCm,pixelsPerCm);await drawPreparedLetteringLine(g,line,new Map(),0,0,'#fff')}finally{g.restore()}
  }
  async function drawTeamCustomization(g,item,x,y,w,height){
    if(item.vectorSource){if(item.vectorColorOverrides&&Object.keys(item.vectorColorOverrides).length){const markup=applyVectorColorOverrides(await privateVectorMarkup(item.vectorSource),item.vectorColorOverrides),url=URL.createObjectURL(new Blob([markup],{type:'image/svg+xml'}));try{const image=new Image();image.src=url;await image.decode();g.drawImage(image,x,y,w,height)}finally{URL.revokeObjectURL(url)}}else{const image=await loadPrivateVectorImage(item.vectorSource);g.drawImage(image,x,y,w,height)}return}
    const layout=await prepareLetteringLayout({...item,nameTrackingCm:item.nameTrackingCm??item.letterTrackingCm??0,digitSpacingCm:item.digitSpacingCm??0});
    g.save();try{
      g.translate(x,y);g.scale(w/layout.widthCm,height/layout.heightCm);
      await drawPreparedLetteringLine(g,layout.nameLine,layout.families,(layout.widthCm-layout.nameLine.widthCm)/2,0,colorFor(item,'name'),item.vectorColorOverrides);
      await drawPreparedLetteringLine(g,layout.numberLine,layout.families,(layout.widthCm-layout.numberLine.widthCm)/2,layout.numberYcm,colorFor(item,'number'),item.vectorColorOverrides);
    }finally{g.restore()}
  }
  async function exportFilm(media,assetMap){
    if(!lastFilm||document.querySelector('.film-export-modal'))return;
    const startingAccount=String(owner()||''),startingGeneration=productionAccountGeneration,exportRoute=location.hash;
    const {items,layout}=checkedFilmSnapshot({filmItems,lastFilm}),profile=media.find(m=>m.id===app.querySelector('#filmMedia').value);
    const identity=await filmExportIdentity(items,layout),exportId=identity.exportId;
    if(startingAccount!==String(owner()||'')||startingGeneration!==productionAccountGeneration||exportRoute!==location.hash||document.querySelector('.film-export-modal'))return;
    if(!profile)throw new Error('Selecione um perfil de filme válido.');
    // Exportação para o RIP é sempre um único PNG contínuo. Não dividir o filme
    // automaticamente: a medida física calculada na prancheta precisa chegar inteira ao RIP.
    const fullWidthPixels=cmToPx(layout.filmWidthMm/10),fullHeightPixels=cmToPx(layout.lengthMm/10);
    if(fullWidthPixels<=0||fullHeightPixels<=0||fullWidthPixels>32767||fullHeightPixels>32767)throw new Error('O filme ultrapassa o limite de dimensão de um único PNG neste navegador. Reduza o comprimento do job antes de exportar.');
    const estimatedRgbaBytes=fullWidthPixels*fullHeightPixels*4;
    if(estimatedRgbaBytes>900e6)throw new Error('Este filme é grande demais para gerar um único PNG com segurança neste navegador. Divida o job manualmente em dois filmes; a exportação automática nunca separa as artes.');
    const segments=[{start:0,end:layout.lengthMm}],modal=document.createElement('div'),previousFocus=document.activeElement,urls=new Set();let busy=false,closed=false,exportRecorded=false,spotController=null;
    const exportAccount=String(owner()||''),exportGeneration=productionAccountGeneration;
    const currentExport=()=>!closed&&exportGeneration===productionAccountGeneration&&exportAccount===String(owner()||'')&&exportRoute===location.hash;
    const requireCurrentExport=()=>{if(!currentExport())throw new DOMException('Exportação encerrada por troca de conta.','AbortError')};
    modal.className='modal-backdrop';modal.innerHTML='<style>.film-export-modal{width:min(650px,calc(100vw - 24px));max-height:calc(100dvh - 30px);overflow:auto}.film-export-options{display:grid;gap:12px;margin:20px 0}.film-export-option{display:flex;gap:12px;padding:15px;border:1px solid #39393f;border-radius:14px;cursor:pointer;align-items:flex-start}.film-export-option input{width:20px;height:20px;flex:0 0 20px;accent-color:#ff6428}.film-export-option small{display:block;line-height:1.5;color:#a9a9b5;margin-top:6px}.film-export-result{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;padding:14px 0;border-top:1px solid #35353b}.film-export-result small{display:block;color:#aaa;line-height:1.5}.film-export-error{color:#ff9d91;min-height:24px}.film-export-hint{font-size:12px;line-height:1.6;color:#aaa}@media(max-width:480px){.film-export-result{grid-template-columns:1fr}.film-export-result .btn{justify-content:center;width:100%}}</style><div class="modal film-export-modal" role="dialog" aria-modal="true" aria-labelledby="filmExportTitle"><div class="modal-head"><div><div class="eyebrow">Arquivo final · fundo transparente</div><h2 id="filmExportTitle">Exportar filme em 300 DPI</h2></div><button class="btn ghost small" data-close-film-export aria-label="Fechar">×</button></div><p class="film-export-hint"><b>Recorte automático no limite real das artes.</b> O arquivo sempre remove margens transparentes externas, sem ampliar, reduzir ou alterar as posições. Será gerado um único filme contínuo em 300 DPI.</p><p class="film-export-error" role="alert" data-film-export-error></p><div data-film-export-results></div><div class="modal-footer"><button class="btn" data-close-film-export>Fechar</button><button class="btn primary" data-generate-film-export>Preparar PNG</button></div></div>';
    const close=()=>{if(busy||closed)return;closed=true;modal.remove();for(const url of urls)URL.revokeObjectURL(url);previousFocus?.focus?.();document.removeEventListener('keydown',onKey);window.removeEventListener('z19:account-changing',accountChanging);window.removeEventListener('hashchange',accountChanging)};
    const accountChanging=()=>{spotController?.abort();busy=false;close()};window.addEventListener('z19:account-changing',accountChanging);
    window.addEventListener('hashchange',accountChanging);
    const onKey=event=>{if(event.key==='Escape')close();if(event.key==='Tab'){const controls=[...modal.querySelectorAll('button:not(:disabled):not([hidden]),input:not(:disabled),a[href]')].filter(node=>node.getClientRects().length),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}};
    const spotHint=document.createElement('p');spotHint.className='film-export-hint';spotHint.textContent='TIFF CMYK + Cor Spot 1, 300 DPI, em um único arquivo. O branco segue somente a transparência das artes. No Photoshop, o composto pode aparecer com fundo branco porque este TIFF não contém camadas editáveis; confira o canal Spot. Primeira utilização: conferir no RIP antes de produzir.';modal.querySelector('[data-film-export-error]').before(spotHint);
    const spotStatus=document.createElement('div');spotStatus.hidden=true;spotStatus.dataset.spotStatus='';spotStatus.innerHTML='<p role="status" aria-live="polite" data-spot-stage></p><progress style="width:100%" aria-label="Progresso do TIFF"></progress><button class="btn small" data-cancel-spot-export>Cancelar TIFF</button>';modal.querySelector('[data-film-export-results]').before(spotStatus);
    const spotButton=document.createElement('button');spotButton.className='btn';spotButton.dataset.generateSpotExport='';spotButton.textContent='Baixar com Spot';modal.querySelector('[data-generate-film-export]').before(spotButton);modal.querySelector('.modal-footer').style.flexWrap='wrap';
    const productionRecorder=createFilmProduction({supabase,isCurrent:currentExport});
    const productionNotice=document.createElement('div');productionNotice.className='film-export-hint';productionNotice.dataset.productionResult='';modal.querySelector('[data-film-export-results]').after(productionNotice);
    const productionGroups=ctx.officialOrders?.exportGroups?.(items)||[],selectedProductionGroups=new Set(productionGroups.map(group=>group.key));
    if(productionGroups.length){const box=document.createElement('section');box.className='film-export-orders';box.innerHTML='<b>Marcar como em produção</b><small>Pedidos oficiais e grupos manuais vêm marcados. Desmarque o que ainda não foi impresso neste arquivo.</small><div>'+productionGroups.map(group=>'<label><input type="checkbox" data-production-group="'+h(group.key)+'" checked><span>'+h(group.companyName)+' · '+(group.projectId?'Pedido '+h(group.orderRef||group.projectId.slice(0,8)):h(group.groupName||'Grupo manual'))+'</span></label>').join('')+'</div>';productionNotice.before(box);box.querySelectorAll('[data-production-group]').forEach(input=>input.onchange=()=>input.checked?selectedProductionGroups.add(input.dataset.productionGroup):selectedProductionGroups.delete(input.dataset.productionGroup));}
    const recordExportOnce=async()=>{
      if(!currentExport()||exportRecorded)return;
      productionNotice.textContent=items.some(item=>item.orderLink)?'Atualizando as quantidades dos pedidos…':'';
      try{
        const recorded=await productionRecorder.record(items,layout,identity);
        if(!currentExport())return;
        const officialRecorded=await ctx.officialOrders?.markProduction?.(items,[...selectedProductionGroups]);
        if(!currentExport())return;
        exportRecorded=true;
        let skipFinance=false;
        if(!recorded.unlinked){productionNotice.textContent=recorded.added_quantity>0?`${recorded.added_quantity} estampa(s) registrada(s). Pedidos em produção; as quantidades restantes continuam pendentes.`:'Filme já registrado. Reexportação sem duplicar quantidades.';if(recorded.has_previous_items&&recorded.added_quantity>0)productionNotice.textContent+=' Esta montagem também contém peças já registradas; o custo anterior não será lançado novamente.';skipFinance=recorded.added_quantity===0||recorded.has_previous_items;}
        if(officialRecorded?.projects||officialRecorded?.placements)productionNotice.textContent+=(productionNotice.textContent?' ':'')+`${officialRecorded?.projects||0} pedido(s) e ${officialRecorded?.placements||0} item(ns) marcados como em produção.`;
        if(skipFinance)return;
      }catch(error){
        if(!currentExport())return;
        productionNotice.textContent=error.message+' O arquivo continua disponível abaixo. Não gere outro filme para tentar corrigir.';
        const retry=document.createElement('button');retry.className='btn small';retry.textContent='Tentar atualizar a fila';retry.onclick=()=>{retry.disabled=true;void recordExportOnce()};productionNotice.append(document.createElement('br'),retry);return;
      }
      if(!ctx.getCostUI?.()||!ctx.onFilmExported)return;
      const financeItems=items.map(item=>({...item,workspaceId:item.workspaceId||assetMap.get(item.sourceId)?.workspace_id||null}));
      const companies=financeItems.filter(item=>item.workspaceId).map(item=>({id:item.workspaceId,name:item.companyName||state().workspaces?.find(workspace=>workspace.id===item.workspaceId)?.company_name||item.label?.split(' • ')[0]||'Empresa'}));
      ctx.onFilmExported({exportId,items:financeItems,snapshot:filmCostPanel?.getSnapshot?.()||null,companies});
    };
    spotButton.onclick=async()=>{
      if(busy||!currentExport())return;busy=true;spotController=new AbortController();
      const signal=spotController.signal,trim=true,errorOutput=modal.querySelector('[data-film-export-error]'),output=modal.querySelector('[data-film-export-results]');
      for(const url of urls)URL.revokeObjectURL(url);urls.clear();output.innerHTML='';errorOutput.textContent='';modal.querySelectorAll('button,input').forEach(control=>control.disabled=true);spotStatus.hidden=false;
      const cancel=spotStatus.querySelector('button');cancel.disabled=false;cancel.onclick=()=>{cancel.disabled=true;spotController?.abort()};
      const progress=info=>{const labels={profiles:'Carregando perfis CMYK locais',render:'Preparando as artes originais',bounds:'Conferindo a transparência',convert:'Convertendo CMYK, curva e Spot',finish:'Finalizando a gravação (não é mais possível cancelar)'};if(info.stage==='finish')cancel.disabled=true;spotStatus.querySelector('[data-spot-stage]').textContent=(labels[info.stage]||'Preparando TIFF')+(info.total?' · '+Math.round(info.done/info.total*100)+'%':'…');const bar=spotStatus.querySelector('progress');if(info.total){bar.max=info.total;bar.value=info.done}else bar.removeAttribute('value')};
      try{
        const geometry=spotCanvasGeometry(layout,trim);
        const result=await exportCanvasWithSpot({name:filmExportBase(media)+'-spot.tif',geometry,trim,signal,onProgress:progress,renderCanvas:async({signal,onProgress})=>{
          const canvas=document.createElement('canvas');canvas.width=geometry.width;canvas.height=geometry.height;const g=canvas.getContext('2d',{willReadFrequently:true});
          if(!g){canvas.width=canvas.height=1;throw new Error('Falta memória para renderizar o filme em tamanho real.')}
          try{
            let completed=0;onProgress({stage:'render',done:0,total:geometry.placements.length});
            for(const p of geometry.placements){
              throwIfSpotCancelled(signal);
              const item=items.find(item=>item.localId===p.id),x=p.x-geometry.left,y=p.y-geometry.top,sourceW=cmToPx((p.sourceWidthMm||item.widthCm*10)/10),sourceH=cmToPx((p.sourceHeightMm||item.heightCm*10)/10);
              if(item.type==='asset'){
                const asset=assetMap.get(item.sourceId),source=item.path||asset?.processed_path||asset?.original_path;if(!source)throw new Error('Uma arte não tem arquivo para exportar.');
                const image=new Image();image.crossOrigin='anonymous';image.src=ctx.publicUrl(source);await image.decode();throwIfSpotCancelled(signal);drawPlacedImage(g,image,x,y,p.w,p.h,p.rotation,sourceW,sourceH);
              }else{g.save();try{g.translate(x+p.w/2,y+p.h/2);g.rotate((p.rotation||0)*Math.PI/180);await drawTeamCustomization(g,item,-sourceW/2,-sourceH/2,sourceW,sourceH)}finally{g.restore()}}
              onProgress({stage:'render',done:++completed,total:geometry.placements.length});await new Promise(resolve=>setTimeout(resolve,0));
            }
            throwIfSpotCancelled(signal);return canvas;
          }catch(error){canvas.width=canvas.height=1;throw error}
        }});
        if(!currentExport())return;
        const row=document.createElement('div');row.className='film-export-result';const description=document.createElement('div'),title=document.createElement('b'),detail=document.createElement('small');title.textContent=result.name;detail.textContent=result.width+' × '+result.height+' px · '+(result.width/300*2.54).toLocaleString('pt-BR',{maximumFractionDigits:3})+' × '+(result.height/300*2.54).toLocaleString('pt-BR',{maximumFractionDigits:3})+' cm · TIFF 300 DPI · CMYK + Cor Spot 1';description.append(title,detail);row.append(description);
        if(result.saved){const saved=document.createElement('span');saved.textContent='Arquivo salvo';row.append(saved)}else{const url=URL.createObjectURL(result.blob);urls.add(url);const link=document.createElement('a');link.className='btn primary';link.dataset.downloadSpotExport='';link.href=url;link.download=result.name;link.textContent='Baixar TIFF com Spot';row.append(link)}
        output.append(row);spotStatus.hidden=true;ctx.toast(result.saved?'TIFF com Spot salvo. Confira o primeiro arquivo no RIP.':'TIFF com Spot preparado. Toque em “Baixar TIFF com Spot”.','ok');await recordExportOnce();
      }catch(error){if(!closed){errorOutput.textContent=error.name==='AbortError'?'TIFF cancelado. Nenhuma exportação foi concluída.':error.message||'Não foi possível gerar o TIFF.';spotStatus.hidden=true}}
      finally{busy=false;spotController=null;modal.querySelectorAll('button,input').forEach(control=>control.disabled=false)}
    };
    document.body.appendChild(modal);document.addEventListener('keydown',onKey);modal.querySelectorAll('[data-close-film-export]').forEach(button=>button.onclick=close);modal.querySelector('input')?.focus();
    modal.querySelector('[data-generate-film-export]').onclick=async()=>{
      if(busy||!currentExport())return;busy=true;const button=modal.querySelector('[data-generate-film-export]'),output=modal.querySelector('[data-film-export-results]'),errorOutput=modal.querySelector('[data-film-export-error]'),trim=true;
      spotStatus.hidden=true;
      for(const url of urls)URL.revokeObjectURL(url);urls.clear();output.innerHTML='';errorOutput.textContent='';modal.querySelectorAll('button,input').forEach(control=>control.disabled=true);
      try{
        for(const [index,segment] of segments.entries()){
          button.textContent='Preparando filme completo…';
          const placements=layout.placements.filter(p=>p.yMm>=segment.start-.001&&p.yMm+p.heightMm<=segment.end+.001).map(p=>({...p,x:cmToPx(p.xMm/10),y:cmToPx((p.yMm-segment.start)/10),w:cmToPx(p.widthMm/10),h:cmToPx(p.heightMm/10)}));
          if(!placements.length)throw new Error('O filme está vazio. Recalcule a montagem.');
          // Render at one original origin, then crop native alpha. Rendering at
          // a shifted origin changes Canvas RGB rounding even for 90° rotations.
          const left=0,top=0,widthPx=cmToPx(layout.filmWidthMm/10),heightPx=cmToPx((segment.end-segment.start)/10);
          if(widthPx<=0||heightPx<=0||widthPx>32767||heightPx>32767||widthPx*heightPx*4>900e6)throw new Error('O filme completo ultrapassa o limite de memória segura para um único PNG neste navegador. Divida o job manualmente; o sistema não separa mais a exportação automaticamente.');
          const canvas=document.createElement('canvas');canvas.width=widthPx;canvas.height=heightPx;const g=canvas.getContext('2d',{willReadFrequently:true});
          if(!g)throw new Error('O navegador não tem memória suficiente para gerar o filme completo em um único PNG.');
          try{
            for(const p of placements){requireCurrentExport();const item=items.find(item=>item.localId===p.id),x=p.x-left,y=p.y-top,sourceW=cmToPx((p.sourceWidthMm||item.widthCm*10)/10),sourceH=cmToPx((p.sourceHeightMm||item.heightCm*10)/10);if(item.type==='asset'){const asset=assetMap.get(item.sourceId),source=item.path||asset?.processed_path||asset?.original_path;if(!source)throw new Error('Uma arte não tem arquivo para exportar.');const image=new Image();image.crossOrigin='anonymous';image.src=ctx.publicUrl(source);await image.decode();requireCurrentExport();drawPlacedImage(g,image,x,y,p.w,p.h,p.rotation,sourceW,sourceH)}else{g.save();try{g.translate(x+p.w/2,y+p.h/2);g.rotate((p.rotation||0)*Math.PI/180);await drawTeamCustomization(g,item,-sourceW/2,-sourceH/2,sourceW,sourceH);requireCurrentExport()}finally{g.restore()}}}
            let rendered=canvas,bounds;if(trim){const cropped=await cropCanvasToAlpha(canvas);rendered=cropped.canvas;bounds=cropped.bounds}else{bounds=await findCanvasAlphaBounds(canvas);if(!bounds)throw new Error('O segmento está totalmente transparente. Confira as artes antes de exportar.');}
            requireCurrentExport();const finalWidth=rendered.width,finalHeight=rendered.height;let blob=await blobFromCanvas(rendered);if(rendered!==canvas){rendered.width=1;rendered.height=1}requireCurrentExport();blob=await ctx.setPngDpi(blob,300);requireCurrentExport();
            const name=filmExportBase(media)+'.png',url=URL.createObjectURL(blob);urls.add(url);const row=document.createElement('div');row.className='film-export-result';row.innerHTML='<div><b>'+h(name)+'</b><small>'+finalWidth+' × '+finalHeight+' px · '+(finalWidth/300*2.54).toLocaleString('pt-BR',{maximumFractionDigits:3})+' × '+(finalHeight/300*2.54).toLocaleString('pt-BR',{maximumFractionDigits:3})+' cm<br>300 DPI · '+'Recorte externo automático, sem redimensionar'+'</small></div><a class="btn primary" data-download-film-export href="'+url+'" download="'+h(name)+'">Baixar PNG</a>';output.appendChild(row);
          }finally{canvas.width=1;canvas.height=1}
          await new Promise(resolve=>setTimeout(resolve,0));
        }
        requireCurrentExport();ctx.toast('PNG completo preparado. Toque em “Baixar PNG” para salvar o filme inteiro.','ok');
        await recordExportOnce();
      }catch(error){if(currentExport())errorOutput.textContent=error.message||'Não foi possível preparar o PNG completo.'}
      finally{busy=false;modal.querySelectorAll('button,input').forEach(control=>control.disabled=false);button.textContent='Preparar novamente'}
    };
  }
  let filmJobSaving=false,filmJobOpening=false;

  function checkedFilmSnapshot(snapshot){
    if(snapshot?.commit_state==='pending')throw new Error('Este job ficou com um salvamento incompleto. Refaça o salvamento a partir da montagem aberta.');
    const items=JSON.parse(JSON.stringify(snapshot?.filmItems||null)),layout=JSON.parse(JSON.stringify(snapshot?.lastFilm||null));
    if(!Array.isArray(items)||!items.length||!layout||!Array.isArray(layout.placements))throw new Error('Este job antigo não possui um snapshot completo para reabrir.');
    const ids=new Set();
    for(const item of items){
      if(!item.localId||ids.has(item.localId)||!['asset','team_customization'].includes(item.type)||!item.sourceId||!(Number(item.widthCm)>0&&Number(item.heightCm)>0)||!Number.isFinite(Number(item.widthCm)+Number(item.heightCm))||!Number.isInteger(Number(item.quantity))||Number(item.quantity)<1)throw new Error('O job possui um item incompleto ou uma medida inválida.');
      ids.add(item.localId);item.widthCm=Number(item.widthCm);item.heightCm=Number(item.heightCm);item.quantity=Number(item.quantity);
    }
    const width=Number(layout.filmWidthMm),length=Number(layout.lengthMm),copies=new Set();
    if(!(width>0&&length>0)||!Number.isFinite(width+length)||!['normal','maximum'].includes(layout.mode)||!Number.isFinite(Number(layout.gapMm))||Number(layout.gapMm)<0)throw new Error('As configurações do filme salvo estão incompletas.');
    if(layout.freeRotation!=null&&typeof layout.freeRotation!=='boolean'||layout.angleStep!=null&&![15,30].includes(Number(layout.angleStep)))throw new Error('A configuração de rotação livre deste job é inválida.');
    layout.freeRotation=layout.freeRotation===true;layout.angleStep=Number(layout.angleStep||30);layout.rotationSearch=layout.freeRotation?'discrete-heuristic':'orthogonal';
    for(const placement of layout.placements){
      const item=items.find(candidate=>candidate.localId===placement.id),key=placement.id+':'+placement.copy,rotation=Number(placement.rotation??0);
      if(!item||copies.has(key)||!Number.isInteger(placement.copy)||placement.copy<0||placement.copy>=item.quantity||![placement.xMm,placement.yMm,placement.widthMm,placement.heightMm,rotation].every(Number.isFinite)||placement.xMm<0||placement.yMm<0||placement.widthMm<=0||placement.heightMm<=0||placement.xMm+placement.widthMm>width+.001||placement.yMm+placement.heightMm>length+.001||rotation<0||rotation>=360)throw new Error('O posicionamento salvo contém uma peça fora dos limites ou incompleta.');
      const policy=item.rotationPolicy||'none',permitted={none:[0],'90':[0,90],'180':[0,180],free:[0,90,180,270]}[policy];
      if(!permitted||!(layout.freeRotation&&policy!=='none')&&!permitted.includes(rotation))throw new Error('O ângulo salvo não é permitido para esta arte. Confira a rotação livre e recalcule o filme.');
      const sourceWidthMm=item.widthCm*10,sourceHeightMm=item.heightCm*10,bounds=rotatedBoundsMm(sourceWidthMm,sourceHeightMm,rotation);
      if(Math.abs(placement.widthMm-bounds.widthMm)>.001||Math.abs(placement.heightMm-bounds.heightMm)>.001)throw new Error('As medidas originais não correspondem ao limite rotacionado da arte. Recalcule o filme antes de salvar ou exportar.');
      for(const [field,expected] of [['sourceWidthMm',sourceWidthMm],['sourceHeightMm',sourceHeightMm]])if(placement[field]!=null&&(!Number.isFinite(Number(placement[field]))||Math.abs(Number(placement[field])-expected)>.001))throw new Error('A medida original de uma arte mudou desde o encaixe. Recalcule o filme.');
      Object.assign(placement,bounds,{rotation,sourceWidthMm,sourceHeightMm});
      copies.add(key);
    }
    if(copies.size!==items.reduce((sum,item)=>sum+item.quantity,0))throw new Error('O job salvo não contém todas as cópias das artes. Recalcule antes de salvar.');
    return {items,layout};
  }

  function reviewLegacyFilmLettering(items,isCurrent=()=>true){
    const legacy=items.filter(item=>item.type==='team_customization'&&!item.vectorSource&&(item.nameTrackingCm==null&&item.letterTrackingCm==null||item.digitSpacingCm==null));
    if(!legacy.length)return Promise.resolve(false);
    return new Promise(resolve=>{
      const modal=document.createElement('div');modal.className='modal-backdrop';
      let finished=false;
      const finish=value=>{if(finished)return;finished=true;if(typeof window!=='undefined'){window.removeEventListener('z19:account-changing',cancel);window.removeEventListener('hashchange',cancel)}modal.remove();resolve(value)};
      const cancel=()=>finish(null);
      if(typeof window!=='undefined'){window.addEventListener('z19:account-changing',cancel,{once:true});window.addEventListener('hashchange',cancel,{once:true})}
      const fields=legacy.map((item,index)=>'<section style="margin:18px 0"><b>'+h(item.label||[item.name,item.number].filter(Boolean).join(' '))+'</b><div class="form-grid"><div class="field"><label>Espaço entre letras (cm)</label><input inputmode="decimal" name="name-'+index+'" value="'+h(item.nameTrackingCm??item.letterTrackingCm??(item.fontSource?0:.15))+'"></div><div class="field"><label>Espaço entre números (cm)</label><input inputmode="decimal" name="number-'+index+'" value="'+h(item.digitSpacingCm??(item.fontSource?0:.2))+'"></div></div></section>').join('');
      modal.innerHTML='<div class="modal wide"><div class="modal-head"><div><div class="eyebrow">Revisão de job antigo</div><h2>Confira o espaço entre os caracteres</h2></div><button class="btn ghost small" data-cancel aria-label="Fechar">×</button></div><p>Este job não registrou todos os espaçamentos. Revise as sugestões abaixo; as medidas serão recalculadas e será necessário calcular o filme novamente antes de exportar. O job original continua preservado.</p><form>'+fields+'<div class="modal-footer"><button class="btn" type="button" data-cancel>Cancelar</button><button class="btn primary" type="submit">Revisar e abrir montagem</button></div></form></div>';
      document.body.appendChild(modal);modal.querySelectorAll('[data-cancel]').forEach(button=>button.onclick=cancel);
      modal.querySelector('form').onsubmit=async event=>{
        event.preventDefault();if(finished||!isCurrent())return finish(null);const button=event.currentTarget.querySelector('[type="submit"]');button.disabled=true;
        try{
          const replacements=[];
          for(const [index,item] of legacy.entries()){
            const parse=name=>{const value=modal.querySelector('[name="'+name+'"]').value.trim(),number=Number(value.replace(',','.'));if(!value||!Number.isFinite(number)||number<0)throw new Error('Informe espaçamentos de zero ou maiores.');return number};
            const reviewed={...item,nameTrackingCm:parse('name-'+index),digitSpacingCm:parse('number-'+index)},layout=await prepareLetteringLayout(reviewed);
            if(finished||!isCurrent())return finish(null);
            replacements.push({...reviewed,widthCm:layout.widthCm,heightCm:layout.heightCm,legacySpacingReviewed:true});
          }
          for(const item of replacements)Object.assign(items.find(old=>old.localId===item.localId),item);
          finish(true);
        }catch(error){if(finished||!isCurrent())return finish(null);ctx.toast(error.message||'Não foi possível revisar a personalização.','err');button.disabled=false}
      };
    });
  }

  async function openFilmJob(job,media){
    if(filmJobOpening||filmJobSaving)return false;filmJobOpening=true;
    const generation=productionAccountGeneration,account=String(owner()||''),change=filmDraftChange,route=typeof location==='undefined'?'':location.hash;
    const current=(checkEdits=true)=>generation===productionAccountGeneration&&account===String(owner()||'')&&(!checkEdits||change===filmDraftChange)&&(typeof location==='undefined'||route===location.hash);
    try{
      const snapshot=job?.settings_snapshot||{},restored=checkedFilmSnapshot(snapshot);
      const matching=media.find(profile=>profile.id===job.media_profile_id&&Math.abs(Number(profile.usable_width_cm)*10-restored.layout.filmWidthMm)<.001)||media.find(profile=>Math.abs(Number(profile.usable_width_cm)*10-restored.layout.filmWidthMm)<.001);
      if(!matching)throw new Error('O perfil de filme de '+(restored.layout.filmWidthMm/10)+' cm não está disponível. Cadastre essa largura para reabrir as posições originais.');
      const revised=await reviewLegacyFilmLettering(restored.items,()=>current());if(revised===null)return false;
      if(!current())return false;
      filmItems=restored.items;lastFilm=revised?null:restored.layout;
      filmSettings={mediaId:matching.id,mode:restored.layout.mode,gapMm:Number(restored.layout.gapMm),freeRotation:Boolean(restored.layout.freeRotation),angleStep:restored.layout.angleStep||30,name:job.name||'',nameCustom:Boolean(job.name)};
      const rendered=await renderFilm();
      if(!rendered||!current(false))return false;
      const mediaInput=app.querySelector('#filmMedia');if(mediaInput)mediaInput.value=matching.id;
      if(app.querySelector('#filmMode'))app.querySelector('#filmMode').value=restored.layout.mode;
      if(app.querySelector('#filmGap'))app.querySelector('#filmGap').value=String(restored.layout.gapMm);
      ctx.toast(revised?'Personalizações revisadas. Atualize o filme novamente antes de exportar.':'Filme reaberto a partir das medidas e posições salvas.','ok');return true;
    }catch(error){console.error(error);ctx.toast(error.message||'Não foi possível reabrir o job.','err');return false}
    finally{filmJobOpening=false}
  }

  async function saveFilmJob(media){
    if(filmJobSaving||filmJobOpening||!lastFilm)return null;filmJobSaving=true;
    const button=app.querySelector('#saveFilm'),previousLabel=button?.textContent;
    if(button){button.disabled=true;button.textContent='Salvando…'}
    const jobId=crypto.randomUUID(),accountId=owner(),actorId=uid();let attempted=false,published=false,finalizing=false;
    try{
      const {items,layout}=checkedFilmSnapshot({filmItems,lastFilm}),profile=media.find(m=>m.id===app.querySelector('#filmMedia')?.value);
      if(!profile||Math.abs(Number(profile.usable_width_cm)*10-layout.filmWidthMm)>.001)throw new Error('A largura selecionada mudou. Calcule o filme novamente antes de salvar.');
      if(app.querySelector('#filmFreeRotation')&&app.querySelector('#filmFreeRotation').checked!==Boolean(layout.freeRotation))throw new Error('A opção de rotação mudou. Recalcule o filme antes de salvar.');
      const selectedMode=app.querySelector('#filmMode')?.value,selectedGap=Number(String(app.querySelector('#filmGap')?.value??layout.gapMm).replace(',','.'));
      if(selectedMode&&selectedMode!==layout.mode||!Number.isFinite(selectedGap)||Math.abs(selectedGap-layout.gapMm)>.0001)throw new Error('O modo ou a distância entre artes mudou. Calcule o filme novamente antes de salvar.');
      const assetIds=[...new Set(items.filter(item=>item.type==='asset').map(item=>item.sourceId))],assetProjects=new Map();
      for(let start=0;start<assetIds.length;start+=200){
        const result=await supabase.from('z19p_assets').select('id,project_id').in('id',assetIds.slice(start,start+200));
        if(result.error)throw result.error;
        for(const asset of result.data||[])assetProjects.set(asset.id,asset.project_id||null);
      }
      if(assetIds.some(id=>!assetProjects.has(id)))throw new Error('Uma das artes foi removida ou não está mais acessível. Revise os itens antes de salvar.');
      for(const item of items)if(item.type==='asset')item.projectId=assetProjects.get(item.sourceId);
      const projectIds=new Set(items.map(item=>item.type==='asset'?item.projectId:null)),projectId=projectIds.size===1&&![...projectIds].includes(null)?[...projectIds][0]:null;
      const snapshot={snapshot_version:2,renderer_version:'2.17.17',commit_state:'pending',efficiency:layout.efficiency,waste:layout.waste,lastFilm:layout,filmItems:items};
      const jobPayload={id:jobId,owner_id:accountId,project_id:projectId,name:String(filmSettings.name||suggestedFilmName(media)).trim(),media_profile_id:profile.id,film_width_cm:layout.filmWidthMm/10,nesting_mode:layout.mode,gap_mm:layout.gapMm,status:'draft',calculated_length_cm:layout.lengthMm/10,settings_snapshot:snapshot,created_by:actorId,updated_by:actorId};
      attempted=true;
      const inserted=await supabase.from('z19p_print_jobs').insert(jobPayload).select('id').single();if(inserted.error)throw inserted.error;if(inserted.data?.id!==jobId)throw new Error('Não foi possível confirmar o registro do job.');
      const rows=items.map((item,index)=>{
        const placements=layout.placements.filter(p=>p.id===item.localId),first=placements[0];
        return {owner_id:accountId,job_id:jobId,item_type:item.type,asset_id:item.type==='asset'?item.sourceId:null,customization_set_id:item.type==='team_customization'?item.sourceId:null,label:item.label||'Personalização',quantity:item.quantity,width_cm:item.widthCm,height_cm:item.heightCm,rotation_deg:first.rotation||0,position_x_mm:first.xMm,position_y_mm:first.yMm,bounds:{width_mm:first.widthMm,height_mm:first.heightMm},locked:placements.every(p=>p.locked),halftone:Boolean(item.halftone),size_override:Boolean(item.sizeOverride),sort_order:index,created_by:actorId,updated_by:actorId,metadata:{local_id:item.localId,name:item.name,number:item.number,path:item.path,project_id:item.projectId||null,official_project_id:item.officialProjectId||null,official_placement_id:item.officialPlacementId||null,official_order_ref:item.officialOrderRef||null,external_order_item_ref:item.externalOrderItemRef||null,production_placement_ids:item.productionPlacementIds||[],production_group_keys:item.productionGroupKeys||[],manual_garment_group_id:item.manualGarmentGroupId||null,composition_mode:item.compositionMode||null,piece_type:item.pieceType||null,composition_group_id:item.compositionGroupId||null,placements}};
      });
      const savedItems=await supabase.from('z19p_print_job_items').insert(rows);if(savedItems.error)throw savedItems.error;
      finalizing=true;const completed=await supabase.from('z19p_print_jobs').update({status:'calculated',settings_snapshot:{...snapshot,commit_state:'complete'},updated_at:new Date().toISOString(),updated_by:actorId}).eq('id',jobId).eq('owner_id',accountId).select('id').single();
      if(completed.error)throw completed.error;if(completed.data?.id!==jobId)throw new Error('Não foi possível confirmar a conclusão do job.');published=true;
      try{await ctx.logEvent?.('print_job_created','Salvou filme com '+layout.placements.length+' peça(s)',{projectId,entityType:'print_job',entityId:jobId,metadata:{width_cm:layout.filmWidthMm/10,length_cm:layout.lengthMm/10,items:items.length}})}catch(error){console.warn('Auditoria de print job',error)}
      ctx.toast('Print job salvo com itens, medidas e posições.','ok');await renderFilm();return {id:jobId,project_id:projectId};
    }catch(error){
      console.error(error);
      if(published){ctx.toast('O job foi salvo. Não foi possível atualizar a lista; reabra Montar filme.','err');return {id:jobId}}
      let cleanupFailed=false;
      if(attempted){try{const rollback=await supabase.from('z19p_print_jobs').delete().eq('id',jobId).eq('owner_id',accountId);if(rollback.error){cleanupFailed=true;console.error('Falha ao remover job incompleto',rollback.error)}}catch(rollbackError){cleanupFailed=true;console.error(rollbackError)}}
      ctx.toast((error.message||'Não foi possível salvar o job.')+(cleanupFailed?(finalizing?' Não foi possível confirmar o estado final. Confira a lista de jobs ao restabelecer a conexão.':' O rascunho incompleto ficou identificado e não será aberto como filme pronto. A montagem continua nesta tela.'):' A montagem continua nesta tela; tente salvar novamente.'),'err');return null;
    }finally{filmJobSaving=false;if(button?.isConnected){button.disabled=!lastFilm;button.textContent=previousLabel||'Salvar filme'}}
  }

  return {buildQuotePdf,pdfAction,enhanceDashboard,enhanceDashboardCards,enhanceAssetCards,renderQueue,changeOperationalStatus,enhanceWorkspace,enhancePublic,renderTeams,renderFilm,openPrintProfile,folderInReadyTree,askDeliveryDate,loadQueues,resetAccountState,hasPendingFilmDraft,flushFilmDraft,queueZero19TeamRequest,queueZero19AssetRequest};
}
