const STAGE_ORDER=['awaiting_art','awaiting_font','ready_production','production','ready_pickup'];
const STAGE_LABELS={
  awaiting_art:'Pendente de subir arte',
  awaiting_font:'Pendente de definir fonte',
  ready_production:'Aguardando produção',
  production:'Em produção',
  ready_pickup:'Pronto para retirada',
  delivered:'Entregue',
  cancelled:'Cancelado'
};
const STAGE_HINTS={
  awaiting_art:'O pedido veio do PDV ZERO19 e ainda precisa receber a arte final.',
  awaiting_font:'Nome, número ou frase aguardando a fonte correta antes da impressão.',
  ready_production:'Arte preparada e liberada para entrar no próximo filme.',
  production:'Pedido marcado no filme e em execução na produção.',
  ready_pickup:'Produção concluída. Avise o cliente e aguarde a retirada.'
};
const INSTAGRAM_HANDLE='zero19indaiatuba';
const INSTAGRAM_URL='https://www.instagram.com/'+INSTAGRAM_HANDLE;

function installStyles(){
  if(document.getElementById('zero19PdvSyncStyles'))return;
  const style=document.createElement('style');style.id='zero19PdvSyncStyles';
  style.textContent='.z19-sync-strip{margin:18px 0 24px;padding:18px;border:1px solid #27272a;border-radius:22px;background:linear-gradient(145deg,#111113,#171719);box-shadow:0 18px 50px rgba(0,0,0,.18)}.z19-sync-head{display:flex;gap:14px;align-items:center;justify-content:space-between;margin-bottom:14px}.z19-sync-head h2{margin:2px 0 0;font-size:20px}.z19-sync-head p{margin:4px 0 0;color:#a1a1aa;font-size:13px}.z19-sync-actions{display:flex;gap:8px;flex-wrap:wrap}.z19-sync-counts{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.z19-sync-count{border:1px solid #303036;border-radius:16px;padding:12px;background:#0c0c0e;text-align:left;color:inherit}.z19-sync-count strong{display:block;font-size:24px;line-height:1}.z19-sync-count span{display:block;margin-top:7px;font-size:11px;color:#b8b8c0;line-height:1.25}.z19-sync-count.danger{border-color:#7f1d1d;background:#1c0c0c}.z19-sync-count.warn{border-color:#854d0e;background:#1d1406}.z19-zero19-page{display:grid;gap:18px}.z19-zero19-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.z19-zero19-summary button{min-height:84px;border:1px solid #303036;border-radius:18px;background:#111113;color:inherit;text-align:left;padding:14px;cursor:pointer}.z19-zero19-summary b{display:block;font-size:26px}.z19-zero19-summary span{font-size:11px;color:#aaa}.z19-zero19-section{display:grid;gap:10px}.z19-zero19-section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px}.z19-zero19-section-head h2{margin:0}.z19-zero19-section-head p{margin:4px 0 0;color:#9f9fa8;font-size:13px}.z19-zero19-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.z19-zero19-card{border:1px solid #2d2d32;border-radius:20px;background:#111113;padding:16px;display:grid;gap:12px}.z19-zero19-card.overdue{border-color:#991b1b;box-shadow:inset 0 0 0 1px rgba(239,68,68,.16)}.z19-zero19-card-head{display:flex;justify-content:space-between;gap:12px}.z19-zero19-card h3{margin:0;font-size:18px}.z19-zero19-card small{color:#a1a1aa}.z19-zero19-order{font-size:12px;color:#fb923c;font-weight:800}.z19-zero19-meta{display:flex;gap:7px;flex-wrap:wrap}.z19-zero19-meta span{border:1px solid #303036;border-radius:999px;padding:5px 9px;font-size:11px;color:#c7c7cc}.z19-zero19-items{display:grid;gap:6px}.z19-zero19-item{padding:9px 10px;border-radius:12px;background:#0a0a0c;font-size:12px;color:#c7c7cc}.z19-zero19-item b{color:#fff}.z19-zero19-card-actions{display:flex;gap:8px;flex-wrap:wrap}.z19-sync-overdue{font-size:11px;font-weight:800;color:#fca5a5}.z19-sync-settings{margin-top:12px}.z19-sync-settings-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end}.z19-transfer-list{display:grid;gap:9px;max-height:55dvh;overflow:auto}.z19-transfer-row{border:1px solid #333;border-radius:14px;padding:12px;text-align:left;background:#121214;color:inherit;cursor:pointer}.z19-transfer-row b,.z19-transfer-row span,.z19-transfer-row small{display:block}.z19-transfer-row span{margin-top:3px}.z19-transfer-row small{margin-top:5px;color:#aaa}.z19-transfer-button{margin-left:auto}.z19-ready-message{white-space:pre-wrap;background:#0b0b0d;border:1px solid #2d2d32;border-radius:14px;padding:12px;font-size:12px;line-height:1.5;color:#d4d4d8}@media(max-width:780px){.z19-sync-head{align-items:flex-start;flex-direction:column}.z19-sync-counts,.z19-zero19-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.z19-zero19-summary button:last-child,.z19-sync-count:last-child{grid-column:1/-1}.z19-zero19-grid{grid-template-columns:1fr}.z19-zero19-card-actions .btn{flex:1 1 44%;justify-content:center}.z19-sync-settings-row{grid-template-columns:1fr}.z19-sync-settings-row .btn{width:100%;justify-content:center}}';
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
function stageFromProject(project,items){
  if(project?.official_order_status&&STAGE_LABELS[project.official_order_status])return project.official_order_status;
  for(const stage of STAGE_ORDER)if(items.some(i=>i.stage===stage))return stage;
  return items[0]?.stage||'awaiting_art';
}
export function createZero19PdvSync(ctx){
  installStyles();
  const {supabase,app,shell,bindCommon,accountOwnerId,nav,toast,bucket,state}=ctx;
  let cache=null,cacheAt=0;
  async function load(force=false){
    const owner=accountOwnerId();if(!owner)return {items:[],projects:[],workspaces:[],summaries:[]};
    if(!force&&cache&&Date.now()-cacheAt<12000)return cache;
    const [wi,pr,ws]=await Promise.all([
      supabase.from('z19p_zero19_work_items').select('*').eq('owner_id',owner).order('promised_at',{ascending:true,nullsFirst:false}).order('created_at'),
      supabase.from('z19p_projects').select('*').eq('owner_id',owner).eq('official_order_source','zero19_pdv').order('source_order_created_at',{ascending:false,nullsFirst:false}),
      supabase.from('z19p_workspaces').select('*').eq('owner_id',owner).eq('workspace_type','client').order('created_at',{ascending:false})
    ]);
    const err=wi.error||pr.error||ws.error;if(err)throw err;
    const projects=pr.data||[],workspaces=ws.data||[],items=wi.data||[],pm=new Map(projects.map(x=>[x.id,x])),wm=new Map(workspaces.map(x=>[x.id,x])),groups=new Map();
    for(const item of items){if(!groups.has(item.project_id))groups.set(item.project_id,[]);groups.get(item.project_id).push(item)}
    const summaries=projects.map(project=>{
      const rows=groups.get(project.id)||[],workspace=wm.get(project.workspace_id)||null,stage=stageFromProject(project,rows),qty=rows.reduce((s,x)=>s+Math.max(1,Number(x.quantity)||1),0),promised=project.promised_at||rows.map(x=>x.promised_at).filter(Boolean).sort()[0]||null;
      return {project,workspace,items:rows,stage,qty,promised,overdue:promised&&new Date(promised).getTime()<Date.now()&&!['ready_pickup','delivered','cancelled'].includes(stage)};
    }).filter(x=>x.items.length);
    cache={items,projects,workspaces,summaries,pm,wm};cacheAt=Date.now();return cache;
  }
  function invalidate(){cache=null;cacheAt=0}
  function counts(summaries){const out={};for(const s of STAGE_ORDER)out[s]=0;for(const row of summaries)if(out[row.stage]!=null)out[row.stage]++;return out}
  function itemLine(item){
    const title=item.text_value||item.garment_name||item.kind||'Personalização',garment=[item.garment_name,item.garment_color,item.garment_size].filter(Boolean).join(' · ');
    return '<div class="z19-zero19-item"><b>'+h(title)+'</b> · '+h(item.quantity)+' un.'+(garment?' · '+h(garment):'')+'</div>';
  }
  function card(summary){
    const p=summary.project,w=summary.workspace||{},stage=summary.stage,phone=digits(w.phone),actions=[];
    if(stage==='awaiting_art')actions.push('<button class="btn primary" data-z19-open="'+h(w.id)+'">Subir arte</button>');
    if(stage==='awaiting_font'){actions.push('<button class="btn" data-z19-times>Definir fonte</button>');actions.push('<button class="btn primary" data-z19-font-ready="'+h(summary.items.find(i=>i.stage==='awaiting_font')?.id||'')+'">Fonte definida</button>')}
    if(stage==='ready_production')actions.push('<button class="btn primary" data-z19-film>Abrir montar filme</button>');
    if(stage==='production')actions.push('<button class="btn primary" data-z19-ready="'+h(p.id)+'">Marcar como pronto</button>');
    if(stage==='ready_pickup'){if(phone)actions.push('<button class="btn whatsapp" data-z19-notify="'+h(p.id)+'">Avisar cliente</button>');actions.push('<button class="btn primary" data-z19-delivered="'+h(p.id)+'">Entregue</button>')}
    if(phone)actions.push('<button class="btn ghost" data-z19-wa="'+h(w.phone||'')+'">WhatsApp</button>');
    return '<article class="z19-zero19-card '+(summary.overdue?'overdue':'')+'" data-stage="'+h(stage)+'"><div class="z19-zero19-card-head"><div><div class="z19-zero19-order">PEDIDO #'+h(orderNo(p))+'</div><h3>'+h(w.client_name||w.company_name||'Cliente')+'</h3><small>'+h(w.phone||'Sem WhatsApp')+'</small></div><div><b>'+h(STAGE_LABELS[stage]||stage)+'</b><small>'+h(summary.qty)+' item(ns)</small></div></div><div class="z19-zero19-meta"><span>Prazo '+h(dt(summary.promised))+'</span>'+(summary.overdue?'<span class="z19-sync-overdue">PRAZO VENCIDO</span>':'')+'<span>'+h(STAGE_HINTS[stage]||'')+'</span></div><div class="z19-zero19-items">'+summary.items.map(itemLine).join('')+'</div><div class="z19-zero19-card-actions">'+actions.join('')+'</div></article>';
  }
  async function enhanceDashboard(){
    try{
      if(!app||app.querySelector('[data-z19-sync-strip]'))return;
      const data=await load(true),c=counts(data.summaries),overdue=data.summaries.filter(x=>x.overdue).length,hero=app.querySelector('.simple-hero');
      if(!hero)return;
      const section=document.createElement('section');section.className='z19-sync-strip';section.dataset.z19SyncStrip='';
      section.innerHTML='<div class="z19-sync-head"><div><div class="eyebrow">PDV ZERO19 ↔ PERSONALIZAÇÕES</div><h2>Fila sincronizada em tempo real</h2><p>'+(overdue?'<b>'+overdue+' pedido(s) com prazo vencido.</b> ':'')+'Pedidos novos do PDV entram aqui automaticamente.</p></div><div class="z19-sync-actions"><button class="btn" data-z19-sync-now>Sincronizar antigos</button><button class="btn primary" data-z19-open-queue>Abrir fila</button></div></div><div class="z19-sync-counts">'+STAGE_ORDER.map(stage=>'<button class="z19-sync-count '+(stage==='awaiting_art'&&c[stage]?'danger':stage==='awaiting_font'&&c[stage]?'warn':'')+'" data-z19-open-stage="'+stage+'"><strong>'+c[stage]+'</strong><span>'+h(STAGE_LABELS[stage])+'</span></button>').join('')+'</div>';
      hero.insertAdjacentElement('afterend',section);
      bindRoot(section);
    }catch(error){console.warn('zero19 sync dashboard',error)}
  }
  function bindRoot(root=document){
    root.querySelectorAll('[data-z19-open-queue]').forEach(b=>b.onclick=()=>nav('/zero19-fila'));
    root.querySelectorAll('[data-z19-open-stage]').forEach(b=>b.onclick=()=>{nav('/zero19-fila');sessionStorage.setItem('z19-zero19-stage',b.dataset.z19OpenStage||'')});
    root.querySelectorAll('[data-z19-sync-now]').forEach(b=>b.onclick=()=>syncRecent());
    root.querySelectorAll('[data-z19-open]').forEach(b=>b.onclick=()=>nav('/ambiente/'+encodeURIComponent(b.dataset.z19Open)));
    root.querySelectorAll('[data-z19-times]').forEach(b=>b.onclick=()=>nav('/times'));
    root.querySelectorAll('[data-z19-film]').forEach(b=>b.onclick=()=>nav('/filme'));
    root.querySelectorAll('[data-z19-font-ready]').forEach(b=>b.onclick=()=>markFontReady(b.dataset.z19FontReady));
    root.querySelectorAll('[data-z19-ready]').forEach(b=>b.onclick=()=>markReady(b.dataset.z19Ready));
    root.querySelectorAll('[data-z19-notify]').forEach(b=>b.onclick=()=>notifyProject(b.dataset.z19Notify));
    root.querySelectorAll('[data-z19-delivered]').forEach(b=>b.onclick=()=>markDelivered(b.dataset.z19Delivered));
    root.querySelectorAll('[data-z19-wa]').forEach(b=>b.onclick=()=>{const d=digits(b.dataset.z19Wa);if(d)window.open('https://wa.me/'+(d.startsWith('55')?d:'55'+d),'_blank','noopener,noreferrer')});
  }
  async function renderQueue(){
    const data=await load(true),c=counts(data.summaries),saved=sessionStorage.getItem('z19-zero19-stage')||'';sessionStorage.removeItem('z19-zero19-stage');
    app.innerHTML=shell('<main class="container simple-container z19-zero19-page"><section class="simple-hero"><div><div class="eyebrow">Integração ZERO19</div><h1>Personalizações do PDV</h1><p>Uma única fila para arte, produção, conclusão e retirada.</p></div><div class="hero-actions"><button class="btn" data-z19-sync-now>Sincronizar antigos</button><button class="btn" data-app-action="settings">Configurações</button></div></section><section class="z19-zero19-summary">'+STAGE_ORDER.map(stage=>'<button data-z19-jump="'+stage+'"><b>'+c[stage]+'</b><span>'+h(STAGE_LABELS[stage])+'</span></button>').join('')+'</section>'+STAGE_ORDER.map(stage=>{const rows=data.summaries.filter(x=>x.stage===stage);return '<section class="z19-zero19-section" id="z19-stage-'+stage+'"><div class="z19-zero19-section-head"><div><h2>'+h(STAGE_LABELS[stage])+'</h2><p>'+h(STAGE_HINTS[stage])+'</p></div><b>'+rows.length+'</b></div><div class="z19-zero19-grid">'+(rows.length?rows.map(card).join(''):'<div class="empty mini">Nenhum pedido nesta etapa.</div>')+'</div></section>'}).join('')+'</main>',{back:true});
    bindCommon();bindRoot(app);app.querySelectorAll('[data-z19-jump]').forEach(b=>b.onclick=()=>document.getElementById('z19-stage-'+b.dataset.z19Jump)?.scrollIntoView({behavior:'smooth',block:'start'}));
    if(saved)setTimeout(()=>document.getElementById('z19-stage-'+saved)?.scrollIntoView({behavior:'smooth',block:'start'}),50);
  }
  async function markFontReady(id){
    if(!id)return;const {error}=await supabase.rpc('z19p_zero19_mark_font_ready',{p_work_item_id:id});if(error)return toast(error.message,'err');invalidate();toast('Fonte liberada. Pedido movido para Aguardando produção.','ok');if(location.hash.includes('/zero19-fila'))renderQueue();
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
  async function syncRecent(limit){
    let n=Number(limit);if(![10,20,50,100].includes(n)){
      const {data}=await supabase.from('z19p_public_settings').select('zero19_sync_recent_limit').eq('owner_id',accountOwnerId()).maybeSingle();n=Number(data?.zero19_sync_recent_limit)||20;
    }
    const {data,error}=await supabase.rpc('z19p_sync_zero19_recent',{p_limit:n});if(error)return toast(error.message,'err');invalidate();toast((data?.synced||0)+' pedido(s) antigos sincronizado(s).','ok');if(location.hash.includes('/zero19-fila'))renderQueue();else enhanceDashboard();
  }
  async function enhanceSettings(modal){
    if(!modal||modal.querySelector('[data-zero19-sync-settings]'))return;
    const owner=accountOwnerId(),{data}=await supabase.from('z19p_public_settings').select('zero19_sync_recent_limit').eq('owner_id',owner).maybeSingle(),value=Number(data?.zero19_sync_recent_limit)||20,section=document.createElement('section');
    section.className='settings-section z19-sync-settings';section.dataset.zero19SyncSettings='';
    section.innerHTML='<div class="settings-head"><div><b>Sincronização PDV ZERO19</b><small>Pedidos novos entram automaticamente. Este botão busca pedidos antigos que ainda não foram importados.</small></div></div><div class="z19-sync-settings-row"><div class="field"><label>Buscar últimos pedidos não sincronizados</label><select data-z19-sync-limit><option value="10">10 pedidos</option><option value="20">20 pedidos</option><option value="50">50 pedidos</option><option value="100">100 pedidos</option></select></div><button class="btn primary" data-z19-settings-sync>Sincronizar agora</button></div>';
    const host=modal.querySelector('.clean-settings')||modal.querySelector('.settings-modal');host?.appendChild(section);section.querySelector('[data-z19-sync-limit]').value=String(value);
    section.querySelector('[data-z19-sync-limit]').onchange=async e=>{const n=Number(e.target.value);const {error}=await supabase.from('z19p_public_settings').update({zero19_sync_recent_limit:n,updated_at:new Date().toISOString()}).eq('owner_id',owner);if(error)toast(error.message,'err')};
    section.querySelector('[data-z19-settings-sync]').onclick=()=>syncRecent(Number(section.querySelector('[data-z19-sync-limit]').value));
  }
  async function openTransfer(asset){
    const data=await load(true),pending=data.summaries.filter(s=>['awaiting_art','awaiting_font','ready_production'].includes(s.stage)),modal=document.createElement('div');modal.className='modal-backdrop';
    const pendingRows=[];for(const s of pending){const artItems=s.items.filter(i=>i.stage==='awaiting_art');if(artItems.length){for(const item of artItems)pendingRows.push({summary:s,item})}}
    modal.innerHTML='<div class="modal compact"><div class="modal-head"><div><div class="eyebrow">Biblioteca ZERO19</div><h2>Transferir arte</h2><p>'+h(asset.name)+'</p></div><button class="btn ghost small close">×</button></div><div class="z19-transfer-list">'+(pendingRows.length?pendingRows.map((row,index)=>'<button class="z19-transfer-row" data-transfer-index="'+index+'"><b>'+h(row.summary.workspace?.client_name||row.summary.workspace?.company_name||'Cliente')+' · Pedido #'+h(orderNo(row.summary.project))+'</b><span>'+h(row.item.text_value||row.item.garment_name||'Arte pendente')+'</span><small>'+h(STAGE_LABELS[row.item.stage])+' · prazo '+h(dt(row.summary.promised))+'</small></button>').join(''):'<div class="empty mini">Nenhum pedido aguardando arte agora.</div>')+'</div><div class="field"><label>Ou transferir apenas para outro cliente</label><select data-transfer-workspace><option value="">Escolha um cliente</option>'+data.workspaces.map(w=>'<option value="'+h(w.id)+'">'+h(w.client_name||w.company_name)+'</option>').join('')+'</select></div><div class="modal-footer"><button class="btn close">Cancelar</button><button class="btn" data-transfer-only disabled>Transferir para cliente</button></div></div>';
    document.body.appendChild(modal);modal.querySelectorAll('.close').forEach(b=>b.onclick=()=>modal.remove());
    const only=modal.querySelector('[data-transfer-only]'),select=modal.querySelector('[data-transfer-workspace]');select.onchange=()=>only.disabled=!select.value;only.onclick=()=>transferAsset(asset,{workspace:data.workspaces.find(w=>w.id===select.value),project:null,item:null},modal);
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
      if(project&&target.item){const linked=await supabase.rpc('z19p_zero19_mark_art_ready',{p_project_id:project.id,p_personalization_sale_id:target.item.personalization_sale_id,p_asset_id:newId});if(linked.error)throw linked.error}
      invalidate();modal?.remove();toast(project?'Arte transferida e pedido liberado para produção.':'Arte transferida para o cliente.','ok');nav('/ambiente/'+encodeURIComponent(workspace.id));
    }catch(error){if(copied.length)await supabase.storage.from(bucket).remove(copied);toast(error.message||'Não foi possível transferir a arte.','err')}
  }
  function enhanceWorkspace(workspace,assets){
    if(!workspace||workspace.workspace_type!=='library_zero19')return;
    for(const card of app.querySelectorAll('[data-asset]')){const id=card.dataset.asset,asset=(assets||[]).find(a=>a.id===id),actions=card.querySelector('.asset-actions');if(!asset||!actions||actions.querySelector('[data-z19-transfer]'))continue;const b=document.createElement('button');b.className='btn small z19-transfer-button';b.dataset.z19Transfer=id;b.textContent='Transferir para cliente';b.onclick=()=>openTransfer(asset);actions.appendChild(b)}
  }
  return {enhanceDashboard,renderQueue,enhanceSettings,enhanceWorkspace,load,openTransfer,syncRecent,invalidate};
}
