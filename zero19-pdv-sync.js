const STAGE_ORDER=['awaiting_art','art_received','awaiting_halftone','awaiting_font','ready_production','production','ready_pickup'];
const STAGE_LABELS={
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
}
function digits(v){return String(v||'').replace(/\D/g,'')}
function h(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function dt(v){if(!v)return 'Sem prazo';const d=new Date(v);if(!Number.isFinite(d.getTime()))return 'Sem prazo';return d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
function orderNo(project){const value=project?.official_order_payload?.display_id;return value?String(value):String(project?.official_order_ref||'').slice(0,8)}
function notifyMessage(name){
  const first=String(name||'cliente').trim().split(/\s+/)[0]||'cliente';
  return 'Olá, '+first+'! 😊 Seu produto na ZERO19 está pronto para retirada.\n\nEstamos abertos das 9h às 18h, de segunda a sábado.\n\nSe desejar algum vídeo ou foto do produto, é só solicitar que podemos enviar agora.\n\nUma ajuda que faz muita diferença para a gente: quando pegar seu produto, se puder marcar a @'+INSTAGRAM_HANDLE+' nos Stories e contar como ficou a qualidade, ficamos muito felizes. Seu feedback ajuda a ZERO19 a melhorar cada vez mais o serviço.\n\nSiga a gente no Instagram: '+INSTAGRAM_URL+'\n\nQualquer dúvida, estamos à disposição.';
}
function normalizeBusinessTime(source){
  const date=new Date(source);
  while(true){
    if(date.getDay()===0){date.setDate(date.getDate()+1);date.setHours(10,0,0,0);continue}
    const minutes=date.getHours()*60+date.getMinutes();
    if(minutes<600){date.setHours(10,0,0,0);return date}
    if(minutes>=1080){date.setDate(date.getDate()+1);date.setHours(10,0,0,0);continue}
    return date;
  }
}
function addBusinessMinutes(source,minutes){
  let date=normalizeBusinessTime(source),remaining=Math.max(0,Number(minutes)||0);
  while(remaining>.001){
    date=normalizeBusinessTime(date);const end=new Date(date);end.setHours(18,0,0,0);
    const available=Math.max(0,(end-date)/60000);
    if(remaining<=available){date=new Date(date.getTime()+remaining*60000);remaining=0;break}
    remaining-=available;date=new Date(end);date.setDate(date.getDate()+1);date.setHours(10,0,0,0);
  }
  return normalizeBusinessTime(date);
}
function stageFromProject(project,items){
  if(project?.official_order_status&&STAGE_LABELS[project.official_order_status])return project.official_order_status;
  for(const stage of STAGE_ORDER)if(items.some(i=>i.stage===stage))return stage;
  return items[0]?.stage||'awaiting_art';
}
export function createZero19PdvSync(ctx){
  installStyles();
  const {supabase,app,shell,bindCommon,accountOwnerId,nav,toast,bucket,state,startUploadForWorkspace,startStandaloneHalftone,offerAfterUpload,queueTeamToFilm,queueAssetToFilm}=ctx;
  let cache=null,cacheAt=0,lastAutoSyncAt=0,autoSyncPromise=null;
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
    await ensureAutomaticSync(false);
    if(!force&&cache&&Date.now()-cacheAt<12000)return cache;
    const [wi,pr,ws,sla]=await Promise.all([
      supabase.from('z19p_zero19_work_items').select('*').eq('owner_id',owner).order('promised_at',{ascending:true,nullsFirst:false}).order('created_at'),
      supabase.from('z19p_projects').select('*').eq('owner_id',owner).eq('official_order_source','zero19_pdv').order('source_order_created_at',{ascending:false,nullsFirst:false}),
      supabase.from('z19p_workspaces').select('*').eq('owner_id',owner).order('created_at',{ascending:false}),
      supabase.rpc('zero19_personalization_ops_snapshot',{p_tenant_id:ZERO19_TENANT_ID})
    ]);
    const err=wi.error||pr.error||ws.error;if(err)throw err;
    const projects=pr.data||[],workspaces=ws.data||[],items=wi.data||[],pm=new Map(projects.map(x=>[x.id,x])),wm=new Map(workspaces.map(x=>[x.id,x])),groups=new Map();
    const zero19Library=workspaces.find(w=>w.workspace_type==='library_zero19')||null;
    let standaloneHalftones=[];
    if(zero19Library){
      const halftones=await supabase.from('z19p_assets').select('*').eq('owner_id',owner).eq('workspace_id',zero19Library.id).eq('asset_type','arte').order('created_at',{ascending:true});
      if(halftones.error)throw halftones.error;
      standaloneHalftones=(halftones.data||[]).filter(asset=>asset.metadata?.standalone_halftone_pending===true);
    }
    for(const item of items){if(!groups.has(item.project_id))groups.set(item.project_id,[]);groups.get(item.project_id).push(item)}
    const avgMinutes=Math.max(1,Number(sla?.data?.avg_minutes_per_shirt)||30),summaries=projects.map(project=>{
      const rows=groups.get(project.id)||[],workspace=wm.get(project.workspace_id)||null,stage=stageFromProject(project,rows),qty=rows.reduce((s,x)=>s+Math.max(1,Number(x.quantity)||1),0),promised=project.promised_at||rows.map(x=>x.promised_at).filter(Boolean).sort()[0]||null;
      return {project,workspace,items:rows,stage,qty,promised,overdue:promised&&new Date(promised).getTime()<Date.now()&&!['ready_pickup','delivered','cancelled'].includes(stage)};
    }).filter(x=>x.items.length).sort((a,b)=>{
      const ap=a.promised?new Date(a.promised).getTime():Number.POSITIVE_INFINITY,bp=b.promised?new Date(b.promised).getTime():Number.POSITIVE_INFINITY;
      if(ap!==bp)return ap-bp;return new Date(a.project.source_order_created_at||a.project.created_at||0)-new Date(b.project.source_order_created_at||b.project.created_at||0);
    });
    let cumulative=0;
    for(const summary of summaries){
      if(['ready_pickup','delivered','cancelled'].includes(summary.stage))continue;
      cumulative+=Math.max(1,summary.qty);summary.predicted=addBusinessMinutes(new Date(),cumulative*avgMinutes);
      summary.risk=Boolean(summary.promised&&summary.predicted.getTime()>new Date(summary.promised).getTime());
    }
    cache={items,projects,workspaces,summaries,pm,wm,avgMinutes,zero19Library,standaloneHalftones};cacheAt=Date.now();return cache;
  }
  function invalidate(){cache=null;cacheAt=0}
  function counts(summaries,standaloneHalftones=[]){const out={};for(const s of STAGE_ORDER)out[s]=0;for(const row of summaries)if(out[row.stage]!=null)out[row.stage]++;out.awaiting_halftone+=(standaloneHalftones||[]).length;return out}
  function itemLine(item){
    const title=item.text_value||item.garment_name||item.kind||'Personalização',garment=[item.garment_name,item.garment_color,item.garment_size].filter(Boolean).join(' · ');
    return '<div class="z19-zero19-item"><b>'+h(title)+'</b> · '+h(item.quantity)+' un.'+(garment?' · '+h(garment):'')+'</div>';
  }
  function card(summary){
    const p=summary.project,w=summary.workspace||{},stage=summary.stage,phone=digits(w.phone),actions=[];
    const stageItem=summary.items.find(i=>i.stage===stage)||summary.items[0];
    if(stage==='awaiting_art')actions.push('<button class="btn primary" data-z19-upload-workspace="'+h(w.id)+'">Subir arte</button>');
    if(stage==='art_received')actions.push('<button class="btn primary" data-z19-import-source="'+h(stageItem?.id||'')+'">Importar e organizar</button>');
    if(stage==='awaiting_halftone'){
      if(stageItem?.asset_id){actions.push('<button class="btn" data-z19-open="'+h(w.id)+'">Abrir arte</button>');actions.push('<button class="btn primary" data-z19-halftone-ready="'+h(stageItem.id)+'">Halftone pronto</button>')}
      else actions.push('<button class="btn primary" data-z19-import-source="'+h(stageItem?.id||'')+'">Importar para halftone</button>');
    }
    if(stage==='awaiting_font')actions.push('<button class="btn primary" data-z19-choose-font="'+h(summary.items.find(i=>i.stage==='awaiting_font')?.id||'')+'">Escolher fonte</button>');
    if(stage==='ready_production'){
      const fontSet=stageItem?.metadata?.font_set_id||stageItem?.metadata?.details?.[0]?.production?.font_set_id;
      if(fontSet&&['NAME_NUMBER','PHRASE'].includes(String(stageItem?.kind||'').toUpperCase()))actions.push('<button class="btn primary" data-z19-team-film="'+h(stageItem.id)+'">Adicionar ao filme</button>');
      else if(stageItem?.asset_id&&stageItem?.without_application)actions.push('<button class="btn primary" data-z19-asset-film="'+h(stageItem.id)+'">Adicionar DTF ao filme</button>');
      else actions.push('<button class="btn primary" data-z19-film>Abrir montar filme</button>');
    }
    if(stage==='production')actions.push('<button class="btn primary" data-z19-ready="'+h(p.id)+'">Marcar como pronto</button>');
    if(['awaiting_art','art_received','awaiting_halftone','awaiting_font','ready_production'].includes(stage))actions.push('<button class="btn" data-z19-force-ready="'+h(p.id)+'">Finalizar / pronto</button>');
    if(stage==='ready_pickup'){if(phone)actions.push('<button class="btn whatsapp" data-z19-notify="'+h(p.id)+'">Avisar cliente</button>');actions.push('<button class="btn primary" data-z19-delivered="'+h(p.id)+'">Entregue</button>')}
    if(phone)actions.push('<button class="btn ghost" data-z19-wa="'+h(w.phone||'')+'">WhatsApp</button>');
    return '<article class="z19-zero19-card '+(summary.overdue||summary.risk?'overdue':'')+'" data-stage="'+h(stage)+'"><div class="z19-zero19-card-head"><div><div class="z19-zero19-order">PEDIDO #'+h(orderNo(p))+'</div><h3>'+h(w.client_name||w.company_name||'Cliente')+'</h3><small>'+h(w.phone||'Sem WhatsApp')+'</small></div><div><b>'+h(STAGE_LABELS[stage]||stage)+'</b><small>'+h(summary.qty)+' item(ns)</small></div></div><div class="z19-zero19-meta"><span>Prazo '+h(dt(summary.promised))+'</span>'+(summary.overdue?'<span class="z19-sync-overdue">PRAZO VENCIDO</span>':summary.risk?'<span class="z19-sync-overdue">RISCO DE ATRASO · previsão '+h(dt(summary.predicted))+'</span>':'')+'<span>'+h(STAGE_HINTS[stage]||'')+'</span></div><div class="z19-zero19-items">'+summary.items.map(itemLine).join('')+'</div><div class="z19-zero19-card-actions">'+actions.join('')+'</div></article>';
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
  function bindRoot(root=document){
    root.querySelectorAll('[data-z19-open-queue]').forEach(b=>b.onclick=()=>nav('/zero19-fila'));
    root.querySelectorAll('[data-z19-open-stage]').forEach(b=>b.onclick=()=>{nav('/zero19-fila');sessionStorage.setItem('z19-zero19-stage',b.dataset.z19OpenStage||'')});
    root.querySelectorAll('[data-z19-sync-now]').forEach(b=>b.onclick=()=>syncRecent());
    root.querySelectorAll('[data-z19-global-upload]').forEach(b=>b.onclick=()=>openGlobalUpload());
    root.querySelectorAll('[data-z19-upload-workspace]').forEach(b=>b.onclick=()=>startUploadForWorkspace?.(b.dataset.z19UploadWorkspace));
    root.querySelectorAll('[data-z19-import-source]').forEach(b=>b.onclick=()=>importSourceArtwork(b.dataset.z19ImportSource));
    root.querySelectorAll('[data-z19-halftone-ready]').forEach(b=>b.onclick=()=>finishHalftone(b.dataset.z19HalftoneReady));
    root.querySelectorAll('[data-z19-standalone-halftone-ready]').forEach(b=>b.onclick=()=>finishStandaloneHalftone(b.dataset.z19StandaloneHalftoneReady));
    root.querySelectorAll('[data-z19-open]').forEach(b=>b.onclick=()=>nav('/ambiente/'+encodeURIComponent(b.dataset.z19Open)));
    root.querySelectorAll('[data-z19-times]').forEach(b=>b.onclick=()=>nav('/times'));
    root.querySelectorAll('[data-z19-film]').forEach(b=>b.onclick=()=>nav('/filme'));
    root.querySelectorAll('[data-z19-choose-font]').forEach(b=>b.onclick=()=>chooseFont(b.dataset.z19ChooseFont));
    root.querySelectorAll('[data-z19-team-film]').forEach(b=>b.onclick=()=>addTeamToFilm(b.dataset.z19TeamFilm));
    root.querySelectorAll('[data-z19-asset-film]').forEach(b=>b.onclick=()=>addAssetToFilm(b.dataset.z19AssetFilm));
    root.querySelectorAll('[data-z19-ready]').forEach(b=>b.onclick=()=>markReady(b.dataset.z19Ready));
    root.querySelectorAll('[data-z19-force-ready]').forEach(b=>b.onclick=()=>forceReady(b.dataset.z19ForceReady));
    root.querySelectorAll('[data-z19-notify]').forEach(b=>b.onclick=()=>notifyProject(b.dataset.z19Notify));
    root.querySelectorAll('[data-z19-delivered]').forEach(b=>b.onclick=()=>markDelivered(b.dataset.z19Delivered));
    root.querySelectorAll('[data-z19-wa]').forEach(b=>b.onclick=()=>{const d=digits(b.dataset.z19Wa);if(d)window.open('https://wa.me/'+(d.startsWith('55')?d:'55'+d),'_blank','noopener,noreferrer')});
  }
  async function renderQueue(){
    const data=await load(true),c=counts(data.summaries,data.standaloneHalftones),hashQuery=(location.hash.split('?')[1]||''),hashParams=new URLSearchParams(hashQuery),stageParam=hashParams.get('stage')||'',orderParam=hashParams.get('pedido')||'',saved=stageParam||sessionStorage.getItem('z19-zero19-stage')||'';sessionStorage.removeItem('z19-zero19-stage');
    app.innerHTML=shell('<main class="container simple-container z19-zero19-page"><section class="simple-hero"><div><div class="eyebrow">Integração ZERO19</div><h1>Personalizações do PDV</h1><p>Uma única fila para arte, produção, conclusão e retirada.</p></div><div class="hero-actions"><button class="btn primary" data-z19-global-upload>＋ Subir arte</button><button class="btn" data-app-action="settings">Configurações</button></div></section><section class="z19-zero19-summary">'+STAGE_ORDER.map(stage=>'<button data-z19-jump="'+stage+'"><b>'+c[stage]+'</b><span>'+h(STAGE_LABELS[stage])+'</span></button>').join('')+'</section>'+STAGE_ORDER.map(stage=>{const rows=data.summaries.filter(x=>x.stage===stage),standalone=stage==='awaiting_halftone'?(data.standaloneHalftones||[]):[],total=rows.length+standalone.length;const standaloneHtml=standalone.map(asset=>'<article class="z19-zero19-card"><div class="z19-zero19-card-head"><div><div class="z19-zero19-order">HALFTONE AVULSO</div><h3>'+h(asset.name)+'</h3><small>Biblioteca ZERO19 · sem cliente vinculado</small></div><div><b>Aguardando halftone</b><small>1 arte</small></div></div><div class="z19-zero19-meta"><span>Pode vincular a um cliente depois</span></div><div class="z19-zero19-card-actions"><button class="btn" data-z19-open="'+h(asset.workspace_id)+'">Abrir arte</button><button class="btn primary" data-z19-standalone-halftone-ready="'+h(asset.id)+'">Halftone pronto</button></div></article>').join('');return '<section class="z19-zero19-section" id="z19-stage-'+stage+'"><div class="z19-zero19-section-head"><div><h2>'+h(STAGE_LABELS[stage])+'</h2><p>'+h(STAGE_HINTS[stage])+'</p></div><b>'+total+'</b></div><div class="z19-zero19-grid">'+(total?rows.map(card).join('')+standaloneHtml:'<div class="empty mini">Nenhum pedido nesta etapa.</div>')+'</div></section>'}).join('')+'</main>',{back:true});
    bindCommon();bindRoot(app);app.querySelectorAll('[data-z19-jump]').forEach(b=>b.onclick=()=>document.getElementById('z19-stage-'+b.dataset.z19Jump)?.scrollIntoView({behavior:'smooth',block:'start'}));
    if(saved)setTimeout(()=>document.getElementById('z19-stage-'+saved)?.scrollIntoView({behavior:'smooth',block:'start'}),50);
    if(orderParam){history.replaceState(null,'','#/zero19-fila');setTimeout(()=>openGlobalUpload(orderParam),60)}
  }
  function findWorkItem(data,id){return data.items.find(item=>item.id===id)}
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
  async function importSourceArtwork(workItemId){
    const data=await load(true),item=findWorkItem(data,workItemId);if(!item)return toast('Item não encontrado.','err');
    const summary=data.summaries.find(row=>row.project.id===item.project_id);if(!summary)return toast('Pedido não encontrado.','err');
    if(item.asset_id)return finishHalftone(item.id);
    if(!item.source_file_path){startUploadForWorkspace?.(summary.workspace.id);return}
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
      if(item.stage==='awaiting_halftone'){toast('Arte importada. Faça o halftone e depois use “Halftone pronto”.','ok');nav('/ambiente/'+summary.workspace.id);return}
      if(item.without_application){await ensureDtfProfile(item,saved.data);const reviewed=await supabase.rpc('z19p_zero19_mark_art_reviewed',{p_work_item_id:item.id,p_asset_id:assetId});if(reviewed.error)throw reviewed.error;invalidate();toast('DTF liberado para Aguardando produção.','ok');if(location.hash.includes('/zero19-fila'))renderQueue();return}
      await offerAfterUpload?.([saved.data],{workspace:summary.workspace,projects:[summary.project],allowWithoutOrder:true});
      invalidate();
    }catch(error){console.error('import zero19 artwork',error);toast(error.message||'Não foi possível importar a arte recebida no PDV.','err')}
  }
  async function finishHalftone(workItemId){
    const data=await load(true),item=findWorkItem(data,workItemId);if(!item)return toast('Item não encontrado.','err');
    const summary=data.summaries.find(row=>row.project.id===item.project_id);if(!summary)return;
    if(!item.asset_id)return importSourceArtwork(item.id);
    const asset=await supabase.from('z19p_assets').select('*').eq('id',item.asset_id).eq('owner_id',accountOwnerId()).single();if(asset.error)return toast(asset.error.message,'err');
    if(item.without_application){try{await ensureDtfProfile(item,asset.data)}catch(error){return toast(error.message,'err')}const reviewed=await supabase.rpc('z19p_zero19_mark_art_reviewed',{p_work_item_id:item.id,p_asset_id:item.asset_id});if(reviewed.error)return toast(reviewed.error.message,'err');invalidate();toast('Halftone liberado para Aguardando produção.','ok');return renderQueue()}
    try{await offerAfterUpload?.([asset.data],{workspace:summary.workspace,projects:[summary.project],allowWithoutOrder:true});invalidate()}catch(error){toast(error.message||'Não foi possível abrir tamanho e posição.','err')}
  }
  async function finishStandaloneHalftone(assetId){
    const data=await load(true),asset=(data.standaloneHalftones||[]).find(row=>row.id===assetId);if(!asset)return toast('Halftone avulso não encontrado.','err');
    const metadata={...(asset.metadata||{}),standalone_halftone_pending:false,standalone_halftone_completed_at:new Date().toISOString()};
    const result=await supabase.from('z19p_assets').update({metadata,updated_at:new Date().toISOString()}).eq('id',assetId).eq('owner_id',accountOwnerId());if(result.error)return toast(result.error.message,'err');
    invalidate();toast('Halftone concluído. A arte continua na Biblioteca ZERO19 para você transferir quando quiser.','ok');if(location.hash.includes('/zero19-fila'))renderQueue();
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
    button.onclick=async()=>{button.disabled=true;const result=await supabase.rpc('z19p_zero19_set_font',{p_work_item_id:workItemId,p_font_set_id:select.value});if(result.error){button.disabled=false;return toast(result.error.message,'err')}modal.remove();invalidate();toast('Fonte definida. Pedido liberado para Aguardando produção.','ok');if(location.hash.includes('/zero19-fila'))renderQueue()};
  }
  async function addAssetToFilm(workItemId){
    const data=await load(true),item=findWorkItem(data,workItemId);if(!item)return toast('DTF não encontrado.','err');
    const summary=data.summaries.find(row=>row.project.id===item.project_id);if(!summary)return toast('Pedido não encontrado.','err');
    if(!item.asset_id)return toast('Este DTF ainda não possui arte vinculada.','err');
    queueAssetToFilm?.({
      workItemId:item.id,projectId:summary.project.id,orderRef:orderNo(summary.project),
      personalizationSaleId:item.personalization_sale_id,clientName:summary.workspace?.client_name||summary.workspace?.company_name||'Cliente ZERO19',
      assetId:item.asset_id,quantity:item.quantity||1
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
      fontSetId,name:production.top_text||'',number:production.number||'',quantity:item.quantity||1
    });
  }
  async function markFontReady(id){
    if(!id)return;const {error}=await supabase.rpc('z19p_zero19_mark_font_ready',{p_work_item_id:id});if(error)return toast(error.message,'err');invalidate();toast('Fonte liberada. Pedido movido para Aguardando produção.','ok');if(location.hash.includes('/zero19-fila'))renderQueue();
  }
  async function forceReady(projectId){
    if(!projectId||!confirm('Marcar este pedido como finalizado/pronto para retirada? Use isto para limpar pedidos antigos que já foram produzidos.'))return;
    const {error}=await supabase.rpc('z19p_zero19_force_stage',{p_project_id:projectId,p_stage:'ready_pickup'});
    if(error)return toast(error.message,'err');
    invalidate();toast('Pedido finalizado e movido para Pronto para retirada.','ok');
    if(location.hash.includes('/zero19-fila'))renderQueue();else enhanceDashboard();
  }
  async function markReady(projectId){
    const data=await load(),summary=data.summaries.find(x=>x.project.id===projectId);if(!summary)return;
    const {error}=await supabase.rpc('z19p_zero19_mark_ready',{p_project_id:projectId});if(error)return toast(error.message,'err');invalidate();toast('Pedido marcado como pronto para retirada.','ok');openReadyModal(summary);if(location.hash.includes('/zero19-fila'))setTimeout(()=>renderQueue(),150);
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
    if(!confirm('Confirmar que o cliente retirou este pedido?'))return;
    const {error}=await supabase.rpc('z19p_zero19_mark_delivered',{p_project_id:projectId});if(error)return toast(error.message,'err');invalidate();toast('Pedido entregue e sincronizado com a ZERO19.','ok');if(location.hash.includes('/zero19-fila'))renderQueue();
  }
  async function syncRecent(limit=30){
    const n=Math.max(1,Math.min(100,Number(limit)||30)),{data,error}=await supabase.rpc('z19p_sync_zero19_recent',{p_limit:n});
    if(error)return toast(error.message,'err');lastAutoSyncAt=Date.now();invalidate();toast((data?.synced||0)+' pedido(s) sincronizado(s).','ok');if(location.hash.includes('/zero19-fila'))renderQueue();else enhanceDashboard();
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
    const data=await load(true),pending=data.summaries.filter(s=>['awaiting_art','awaiting_font','ready_production'].includes(s.stage)),modal=document.createElement('div');modal.className='modal-backdrop';
    const pendingRows=[];for(const s of pending){const artItems=s.items.filter(i=>i.stage==='awaiting_art');if(artItems.length){for(const item of artItems)pendingRows.push({summary:s,item})}}
    modal.innerHTML='<div class="modal compact"><div class="modal-head"><div><div class="eyebrow">Biblioteca ZERO19</div><h2>Transferir arte</h2><p>'+h(asset.name)+'</p></div><button class="btn ghost small close">×</button></div><div class="z19-transfer-list">'+(pendingRows.length?pendingRows.map((row,index)=>'<button class="z19-transfer-row" data-transfer-index="'+index+'"><b>'+h(row.summary.workspace?.client_name||row.summary.workspace?.company_name||'Cliente')+' · Pedido #'+h(orderNo(row.summary.project))+'</b><span>'+h(row.item.text_value||row.item.garment_name||'Arte pendente')+'</span><small>'+h(STAGE_LABELS[row.item.stage])+' · prazo '+h(dt(row.summary.promised))+'</small></button>').join(''):'<div class="empty mini">Nenhum pedido aguardando arte agora.</div>')+'</div><div class="field"><label>Ou transferir apenas para outro cliente</label><select data-transfer-workspace><option value="">Escolha um cliente</option>'+data.workspaces.filter(w=>w.workspace_type==='client').map(w=>'<option value="'+h(w.id)+'">'+h(w.client_name||w.company_name)+'</option>').join('')+'</select></div><div class="modal-footer"><button class="btn close">Cancelar</button><button class="btn" data-transfer-only disabled>Transferir para cliente</button></div></div>';
    document.body.appendChild(modal);modal.querySelectorAll('.close').forEach(b=>b.onclick=()=>modal.remove());
    const only=modal.querySelector('[data-transfer-only]'),select=modal.querySelector('[data-transfer-workspace]');select.onchange=()=>only.disabled=!select.value;only.onclick=()=>transferAsset(asset,{workspace:data.workspaces.find(w=>w.workspace_type==='client'&&w.id===select.value),project:null,item:null},modal);
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
  return {enhanceDashboard,renderQueue,enhanceSettings,enhanceWorkspace,load,openTransfer,openWorkspaceStage,syncRecent,invalidate,ensureAutomaticSync};
}
