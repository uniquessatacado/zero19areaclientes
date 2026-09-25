import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import picaFactory from 'https://esm.sh/pica@9.0.1';
import { createProductionModule } from './production-v217.js?v=2.17.5';
import { createArtStudio } from './art-studio.js?v=2.17.5';
import { bindProjectHistory } from './project-history.js?v=2.17.5';
import { createProductionCostUI } from './production-cost-ui.js?v=2.17.5';
import { createProductionCostStore, fetchFilmCommissions } from './cost-store.js?v=2.17.5';
import { createRouteViewportController } from './route-viewport.js?v=2.17.5';
import { createProjectAdvisorUI } from './project-advisor-ui.js?v=2.17.5';
import { attachAssetStudioActions } from './asset-studio-actions.js?v=2.17.5';
import { renderStudioHome } from './studio-home.js?v=2.17.5';
import { createProductionFinanceUI } from './production-finance.js?v=2.17.5';
import { assetPreviewPath, replacePreviewMarkup } from './asset-preview.js?v=2.17.9';
import { createResilientReadFetch } from './network-read.js?v=2.17.9';
import { openServiceQuoteModal } from './quote-service-ui.js?v=2.17.11';
import { QUOTE_SERVICES, QUOTE_ITEM_LABELS, serviceBreakdown, quotePreparationSummary } from './quote-service-core.js?v=2.17.11';
import { customerState, customerView } from './customer-view-core.js?v=2.17.11';
import { installMobileViewport } from './mobile-viewport.js?v=2.17.11';
import { createCompanyPortalAdmin } from './company-portal-admin.js?v=2.17.12';
import { createCompanyOrderOperations } from './company-order-operations.js?v=2.17.12';
import { createOfficialOrderWorkflow, workspaceOfficialOrderState } from './official-order-workflow.js?v=2.17.17';
import { createReliableStorageUploader } from './storage-upload.js?v=2.17.21';

const SUPABASE_URL = 'https://kedggjyerexnzmipaick.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WoobBV7n0p5Jf-4DLJVzIA_4sUoAvsT';
const BUCKET = 'z19p-assets';
const BRAND_LOGO = '/zero19-logo.png?v=2.17';
const APP_VERSION = '2.17.5';
function brandLogoHTML(cls='brand-logo-ui'){ return `<img class="${cls}" src="${BRAND_LOGO}" alt="Zero 19">`; }
const QUALITY_PRESETS = { original: 0, alta: 4032, ultra: 6000, maxima: 8192 };
const DEFAULT_QUALITY = 'ultra';
const STATUS_STALE_MS = 24 * 60 * 60 * 1000;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true }, global: { fetch: createResilientReadFetch({origin:SUPABASE_URL}) } });
const storageUploader=createReliableStorageUploader({supabase,projectUrl:SUPABASE_URL,publishableKey:SUPABASE_KEY,bucket:BUCKET});
const pica = picaFactory({ features: ['js','wasm','ww'] });

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const escapeHTML = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmtDate = d => new Date(d).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
const fmtBytes = n => !n ? '—' : n < 1024*1024 ? `${(n/1024).toFixed(0)} KB` : `${(n/1024/1024).toFixed(1)} MB`;
const slug = s => (s||'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9-_]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase();
const publicUrl = path => path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : '';
const app = document.getElementById('app');
installMobileViewport();
let session = null;
let workspaces = [];
let currentWorkspace = null;
let currentFolders = [];
let currentAssets = [];
let activeFolder = 'all';
let uploadQueue = [];
let statuses = [];
let products = [];
let folderTemplates = [];
let currentQuotes = [];
let libraryWorkspaces = {};
let dashboardAgingTimer = null;
let unreadQualityComments = 0;
let productionModule = null;
let artStudio = null;
let officialOrders = null;
let pendingQuickUploadWorkspaceId = null;
let productionCosts = null;
let productionCostOwner = null;
let projectAdvisor = null;
function getProductionCosts(){
  const id=accountOwnerId();
  if(!canViewProductionCosts()){productionCosts?.destroy?.();productionCosts=null;return null;}
  if(!productionCosts||productionCostOwner!==id){
    productionCostOwner=id;
    const costStore=createProductionCostStore({supabase,owner:accountOwnerId,user:()=>session?.user?.id,isAdmin:canViewProductionCosts});
    productionCosts=createProductionCostUI({costStore,isAdmin:canViewProductionCosts,canView:canViewProductionCosts,toast,publicUrl});
  }
  return productionCosts;
}
function getProductionFinance(){return canViewProductionCosts()?createProductionFinanceUI({supabase,owner:accountOwnerId,user:()=>session?.user?.id,canView:canViewProductionCosts,app,shell,bindCommon,toast}):null;}

let logoutInProgress=false;
async function signOutWithDraftGuard(){
  if(logoutInProgress)return;
  logoutInProgress=true;
  const userId=session?.user?.id,button=$('#logoutBtn'),previousHTML=button?.innerHTML;
  try{
    if(button)button.disabled=true;
    if(productionModule?.hasPendingFilmDraft?.()){
      if(button)button.textContent='Salvando filme…';
      let saved=false;
      try{saved=await productionModule.flushFilmDraft();}catch{}
      if(session?.user?.id!==userId)return;
      if(!saved&&!confirm('As últimas alterações do filme ainda não foram confirmadas na nuvem. Sair agora pode perder essas alterações. Deseja sair mesmo assim?'))return;
    }
    if(session?.user?.id!==userId)return;
    const result=await supabase.auth.signOut();
    if(result?.error)throw result.error;
    nav('/');
  }catch(error){toast(`Não foi possível sair: ${error?.message||'tente novamente.'}`);}
  finally{logoutInProgress=false;if(button?.isConnected){button.disabled=false;button.innerHTML=previousHTML;}}
}


const DEFAULT_STATUSES = [
  {name:'Em atendimento',color:'#ff6b2c',sort_order:10,queue_stage:'none',is_finalized:false},
  {name:'Aguardando chegar o produto para realizar a personalização',color:'#f0b429',sort_order:20},
  {name:'Cliente não responde',color:'#8b93a7',sort_order:30},
  {name:'Cliente desistiu',color:'#d65c6a',sort_order:40},
  {name:'Finalizado',color:'#38d39f',sort_order:50,queue_stage:'none',is_finalized:true}
];
const DEFAULT_PRODUCTS = [
  '30.1','Oversize Suedine','Oversize 100% algodão','Pima Egípcia','Malha peruana','Cotton','Dry Fit Premium','Dry Fit com poliamida'
];
const DEFAULT_FOLDER_TEMPLATES = [
  {name:'Artes enviadas pelo cliente',purpose:'artes_cliente'},
  {name:'Artes prontas',purpose:'artes_prontas'},
  {name:'Logo da empresa',purpose:'logo_empresa'},
  {name:'Mockups',purpose:'mockups'}
];
const PRINT_PLACEMENTS = ['Frente','Meio do peito','Ponta do peito esquerda','Ponta do peito direita','Costas','Manga esquerda','Manga direita'];

const moneyNumber = v => {
  if(typeof v==='number') return Number.isFinite(v)?v:0;
  let x=String(v??'').trim().replace(/R\$\s?/gi,'').replace(/\s/g,'');
  if(x.includes(',')) x=x.replace(/\./g,'').replace(',','.');
  x=x.replace(/[^0-9.-]/g,'');
  const n=parseFloat(x); return Number.isFinite(n)?n:0;
};
const fmtMoney = v => moneyNumber(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const normalizeWaPhone = phone => {
  let d=String(phone||'').replace(/\D/g,'');
  if((d.length===10||d.length===11)&&!d.startsWith('55')) d='55'+d;
  return d;
};
function openWhatsApp(phone){
  const d=normalizeWaPhone(phone);if(!d)return toast('Cadastre o telefone do cliente primeiro.','err');
  window.open(`https://wa.me/${d}`,'_blank','noopener,noreferrer');
}
function quoteItemUnit(item){
  if(item.pricing_mode==='piece_plus_print') return moneyNumber(item.piece_price)+(Array.isArray(item.prints)?item.prints:[]).reduce((sum,p)=>sum+moneyNumber(p.price),0);
  return moneyNumber(item.total_unit_price);
}
function quoteTotal(quote){return (quote.items||[]).reduce((sum,i)=>sum+Math.max(1,parseInt(i.quantity)||1)*quoteItemUnit(i),0);}
function statusById(id){return statuses.find(s=>s.id===id)||null;}
function statusOptions(selected=''){return statuses.map(s=>`<option value="${s.id}" ${s.id===selected?'selected':''}>${escapeHTML(s.name)}</option>`).join('');}
function statusPill(status){return status?`<span class="status-pill" style="--status:${escapeHTML(status.color||'#ff6b2c')}"><i></i>${escapeHTML(status.name)}</span>`:'<span class="status-pill muted"><i></i>Sem status</span>';}
function isFinalizedStatus(status){return Boolean(status?.is_finalized);}
function formatStatusAge(ms){
  const totalHours=Math.max(0,Math.floor(ms/3600000));
  const days=Math.floor(totalHours/24),hours=totalHours%24;
  if(days>0)return `${days} ${days===1?'dia':'dias'}${hours?` e ${hours}h`:''}`;
  return `${totalHours}h`;
}
function workspaceStatusDuration(w){
  const st=statusById(w?.status_id);
  if(!st||isFinalizedStatus(st))return null;
  const changedAt=w?.status_changed_at||w?.updated_at||w?.created_at;
  const t=changedAt?new Date(changedAt).getTime():NaN;
  if(!Number.isFinite(t))return null;
  const ms=Math.max(0,Date.now()-t);
  return {ms,label:formatStatusAge(ms),changedAt:new Date(t),status:st};
}
function workspaceStatusAttention(w){
  const age=workspaceStatusDuration(w);
  if(!age||age.ms<STATUS_STALE_MS)return null;
  return age;
}
function sortWorkspacesByAttention(items){
  return [...items].sort((a,b)=>{const aa=workspaceStatusAttention(a),bb=workspaceStatusAttention(b);if(aa&&bb)return bb.ms-aa.ms;if(aa)return -1;if(bb)return 1;return 0;});
}


function toast(msg, kind=''){
  const el=document.createElement('div'); el.className=`toast ${kind}`; el.textContent=msg; $('#toast-root').appendChild(el); setTimeout(()=>el.remove(),4200);
}
function icon(name){
  if(name==='folder')return '<svg class="ui-icon folder-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.8 6.25c0-1.1.9-2 2-2h4.05c.55 0 1.07.23 1.45.63l1.15 1.22h5.75c1.1 0 2 .9 2 2v8.45c0 1.1-.9 2-2 2H5.8c-1.1 0-2-.9-2-2V6.25Z" fill="currentColor" opacity=".2"/><path d="M4.5 8h15M5.8 4.75h4.05c.42 0 .83.18 1.12.49L12.63 7h5.57c.83 0 1.5.67 1.5 1.5v8.05c0 .83-.67 1.5-1.5 1.5H5.8c-.83 0-1.5-.67-1.5-1.5V6.25c0-.83.67-1.5 1.5-1.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const icons={home:'⌂',plus:'＋',image:'▧',download:'⇩',share:'↗',back:'←',trash:'⌫',edit:'✎',upload:'⇧',logout:'↪',check:'✓',close:'×',search:'⌕',copy:'⧉',user:'◉',phone:'☎',settings:'⚙',quote:'R$',whatsapp:'WA'}; return icons[name]||'•';
}
function route(){ return location.hash.replace(/^#/,'') || '/'; }
function nav(path){
  const target=String(path||'/');
  if(route()===target){ Promise.resolve().then(()=>renderRoute()); return; }
  location.hash=target;
}
window.addEventListener('hashchange', ()=>{ void renderRoute(); });

async function init(){
  try{if('serviceWorker' in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.unregister()));}if('caches' in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('019-personalizacoes')).map(k=>caches.delete(k)));}}catch{}
  try{
    const authResult=await Promise.race([
      supabase.auth.getSession(),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('Tempo excedido ao recuperar a sessão.')),12000))
    ]);
    if(authResult?.error)throw authResult.error;
    session=authResult?.data?.session||null;
  }catch(error){
    console.error('Falha ao recuperar sessão',error);
    session=null;
  }
  supabase.auth.onAuthStateChange((event,s)=>{
    const previous=session?.user?.id;session=s;
    if(previous!==s?.user?.id)clearAccountContext();
    // Refreshing a token must not replace the page the user is currently editing.
    if(event==='TOKEN_REFRESHED')return;
    if(event==='INITIAL_SESSION'&&previous===s?.user?.id)return;
    if(previous!==s?.user?.id||event==='USER_UPDATED')queueMicrotask(()=>{void renderRoute()});
  });
  await renderRoute();
}

function shell(content, {back=false}={}){
  return `<div class="app-shell">
    <header class="topbar">
      ${back?`<button class="btn ghost small" data-nav="/">${icon('back')}</button>`:''}
      <div class="brand" data-nav="/" role="button" tabindex="0">
        ${brandLogoHTML()}<div><div class="brand-title">019 Personalizações</div><div class="brand-sub">Artes • Mockups • DTF</div></div>
      </div>
      <div class="top-actions"><span class="app-version-badge" title="Versão do sistema">v${APP_VERSION}</span>${session?`<button class="btn ghost small" id="logoutBtn">${icon('logout')} <span class="label">Sair</span></button>`:''}</div>
    </header>${content}</div>`;
}
function bindCommon(){
  $$('[data-nav]').forEach(el=>{el.onclick=()=>nav(el.dataset.nav);if(el.getAttribute('role')==='button')el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();nav(el.dataset.nav)}}});
  $('#logoutBtn')?.addEventListener('click',signOutWithDraftGuard);
}

async function renderRoute(){
  if(dashboardAgingTimer){clearInterval(dashboardAgingTimer);dashboardAgingTimer=null;}
  const r=route();
  if(r.startsWith('/cliente/')) return renderPublic(r.split('/')[2]);
  if(!session) return renderAuth();
  if(r.startsWith('/biblioteca/')) return renderLibrary(r.split('/')[2]);
  if(r.startsWith('/ambiente/')) return renderWorkspace(r.split('/')[2]);
  return renderDashboard();
}

function renderAuth(mode='login'){
  app.innerHTML=`<div class="auth"><div class="auth-card">
    <div class="brand">${brandLogoHTML()}<div><div class="brand-title">019 Personalizações</div><div class="brand-sub">Central de produção</div></div></div>
    <h1>${mode==='signup'?'Criar acesso':'Entrar'}</h1><p>${mode==='signup'?'Cadastre o acesso interno da equipe.':'Acesse os ambientes, artes e mockups.'}</p>
    <form id="authForm"><div class="field"><label>E-mail</label><input type="email" name="email" required autocomplete="email"></div>
    <div class="field"><label>Senha</label><input type="password" name="password" required minlength="6" autocomplete="current-password"></div>
    <button class="btn primary" type="submit">${mode==='signup'?'Criar conta':'Entrar'}</button></form>
    <div class="auth-switch">${mode==='signup'?'Já possui acesso? <span class="link" id="switchAuth">Entrar</span>':'Primeiro acesso? <span class="link" id="switchAuth">Criar conta</span>'}</div>
    <div class="auth-version">Versão ${APP_VERSION}</div>
  </div></div>`;
  $('#switchAuth').onclick=()=>renderAuth(mode==='signup'?'login':'signup');
  $('#authForm').onsubmit=async e=>{
    e.preventDefault(); const fd=new FormData(e.currentTarget); const email=fd.get('email'),password=fd.get('password');
    const btn=e.currentTarget.querySelector('button'); btn.disabled=true; btn.innerHTML='<span class="loading"></span>';
    const res = mode==='signup' ? await supabase.auth.signUp({email,password}) : await supabase.auth.signInWithPassword({email,password});
    btn.disabled=false; btn.textContent=mode==='signup'?'Criar conta':'Entrar';
    if(res.error) return toast(res.error.message,'err');
    if(mode==='signup' && !res.data.session) toast('Conta criada. Confirme o e-mail para entrar.','ok'); else {session=res.data.session; nav('/');}
  };
}

async function ensureDefaults(){
  if(!session?.user?.id)return;
  const uid=session.user.id;
  const [{count:statusCount},{count:productCount},{count:folderTemplateCount}]=await Promise.all([
    supabase.from('z19p_statuses').select('id',{count:'exact',head:true}).eq('owner_id',uid),
    supabase.from('z19p_products').select('id',{count:'exact',head:true}).eq('owner_id',uid),
    supabase.from('z19p_folder_templates').select('id',{count:'exact',head:true}).eq('owner_id',uid)
  ]);
  // Só cria os padrões no primeiro uso. Depois disso, exclusões e edições do usuário são respeitadas.
  if(!statusCount){
    await supabase.from('z19p_statuses').insert(DEFAULT_STATUSES.map(x=>({...x,owner_id:uid})));
  }
  if(!productCount){
    await supabase.from('z19p_products').insert(DEFAULT_PRODUCTS.map((name,i)=>({owner_id:uid,name,sort_order:(i+1)*10})));
  }
  if(!folderTemplateCount){
    await supabase.from('z19p_folder_templates').insert(DEFAULT_FOLDER_TEMPLATES.map((x,i)=>({owner_id:uid,name:x.name,purpose:x.purpose,sort_order:(i+1)*10})));
  }
  await ensureLibraries();
}
async function ensureLibraries(){
  if(!session?.user?.id)return;
  const uid=session.user.id;
  const {data,error}=await supabase.from('z19p_workspaces').select('*').eq('owner_id',uid).in('workspace_type',['library_artes','library_mockups','library_videos','library_zero19']);
  if(error){console.error(error);return;}
  const byType=Object.fromEntries((data||[]).map(w=>[w.workspace_type,w]));
  const missing=[];
  if(!byType.library_artes) missing.push({owner_id:uid,company_name:'Artes',client_name:'Biblioteca interna de artes',notes:'Ambiente interno para organizar e transferir artes entre celular e computador.',share_enabled:false,client_can_download:false,workspace_type:'library_artes'});
  if(!byType.library_mockups) missing.push({owner_id:uid,company_name:'Mockups',client_name:'Biblioteca interna de mockups',notes:'Ambiente interno para organizar e transferir mockups entre celular e computador.',share_enabled:false,client_can_download:false,workspace_type:'library_mockups'});
  if(missing.length){
    const {error:ie}=await supabase.from('z19p_workspaces').insert(missing);if(ie)console.error(ie);
  }
  const {data:fresh}=await supabase.from('z19p_workspaces').select('*').eq('owner_id',uid).in('workspace_type',['library_artes','library_mockups','library_videos','library_zero19']);
  libraryWorkspaces=Object.fromEntries((fresh||[]).map(w=>[w.workspace_type,w]));
}
async function loadConfig(){
  if(!session)return;
  const stillCurrent=accountReadGuard();
  const [{data:s,error:se},{data:p,error:pe},{data:f,error:fe}]=await Promise.all([
    supabase.from('z19p_statuses').select('*').order('sort_order').order('name'),
    supabase.from('z19p_products').select('*').order('sort_order').order('name'),
    supabase.from('z19p_folder_templates').select('*').order('sort_order').order('name')
  ]);
  if(!stillCurrent())return;
  if(se)toast('Não foi possível carregar os status.','err');else statuses=s||[];
  if(pe)toast('Não foi possível carregar os produtos.','err');else products=p||[];
  if(fe)toast('Não foi possível carregar as pastas padrão.','err');else folderTemplates=f||[];
}
async function loadWorkspaces(){
  const stillCurrent=accountReadGuard();
  const {data,error}=await supabase.from('z19p_workspaces').select('*').eq('workspace_type','client').order('created_at',{ascending:false});
  if(!stillCurrent())return [];
  if(error){toast('Não foi possível carregar os ambientes.','err');return [];}
  let rows=data||[];
  const ids=rows.map(w=>w.id);
  if(ids.length){
    const {data:logoFolders}=await supabase.from('z19p_folders').select('id,workspace_id').in('workspace_id',ids).eq('purpose','logo_empresa');
    if(!stillCurrent())return [];
    const folderIds=(logoFolders||[]).map(f=>f.id);
    if(folderIds.length){
      const {data:logoAssets}=await supabase.from('z19p_assets').select('id,workspace_id,folder_id,processed_path,original_path,created_at').in('folder_id',folderIds).order('created_at',{ascending:false});
      if(!stillCurrent())return [];
      const latest={};for(const a of logoAssets||[])if(!latest[a.workspace_id])latest[a.workspace_id]=a;
      rows=rows.map(w=>({...w,_logo_url:latest[w.id]?publicUrl(latest[w.id].processed_path||latest[w.id].original_path):''}));
    }
  }
  workspaces=rows;return workspaces;
}
async function renderLibrary(kind){
  const stillCurrent=accountReadGuard(true);
  await ensureDefaults();
  if(!stillCurrent())return;
  const type=kind==='mockups'?'library_mockups':kind==='videos'?'library_videos':'library_artes';
  await ensureLibraries();
  if(!stillCurrent())return;
  const w=libraryWorkspaces[type];
  if(!w){toast('Biblioteca não encontrada.','err');return nav('/');}
  return renderWorkspace(w.id);
}

async function renderDashboard(){
  await ensureDefaults();
  await Promise.all([loadConfig(),loadWorkspaces()]);
  const content=`<main class="container simple-container"><section class="simple-hero"><div><div class="eyebrow">019 Personalizações</div><h1>Empresas</h1><p>Acompanhe o atendimento, orçamentos, artes e mockups de cada cliente.</p></div><div class="hero-actions"><button class="btn" id="settingsBtn">${icon('settings')} Configurações</button><button class="btn primary" id="newWorkspace">${icon('plus')} Nova empresa</button></div></section>
  <section class="library-launcher three-libraries"><button class="library-card" id="openArtsLibrary"><span class="library-symbol">A</span><span><b>Artes</b><small>Organize artes gerais em pastas e subpastas.</small></span><i>→</i></button><button class="library-card" id="openMockupsLibrary"><span class="library-symbol">M</span><span><b>Mockups</b><small>Central de mockups para celular e computador.</small></span><i>→</i></button><button class="library-card" id="openVideosLibrary"><span class="library-symbol">▶</span><span><b>Vídeos</b><small>Arquivo interno de vídeos e demonstrações.</small></span><i>→</i></button><button class="library-card commercial-card" id="openQualityAdmin"><span class="library-symbol">Q</span><span><b>Demonstrações</b><small>Produtos, preços, medidas e avaliações.${unreadQualityComments?` • ${unreadQualityComments} comentário${unreadQualityComments===1?'':'s'} novo${unreadQualityComments===1?'':'s'}`:''}</small></span><i>${unreadQualityComments?`<em class="comment-alert-count">${unreadQualityComments}</em>`:'→'}</i></button><button class="library-card" id="openPortfolioAdmin"><span class="library-symbol">▣</span><span><b>Portfólio</b><small>Provas sociais com fotos, vídeos e empresas.</small></span><i>→</i></button></section>
  <div class="toolbar clean-toolbar"><div class="search">${icon('search')}<input id="workspaceSearch" placeholder="Buscar empresa, cliente, telefone ou estado..."></div><div class="status-filter-wrap"><select id="statusFilter" class="btn compact-select"><option value="all">Todos os status</option><option value="none">Sem status</option>${statuses.map(s=>`<option value="${s.id}">${escapeHTML(s.name)}</option>`).join('')}</select></div></div>
  <div id="workspaceGrid" class="grid workspace-grid-clean">${renderWorkspaceCards(workspaces)}</div></main>`;
  app.innerHTML=shell(content); bindCommon();
  $('#newWorkspace').onclick=()=>openWorkspaceModal();
  $('#settingsBtn').onclick=()=>openSettingsModal();
  $('#openArtsLibrary').onclick=()=>nav('/biblioteca/artes');
  $('#openMockupsLibrary').onclick=()=>nav('/biblioteca/mockups');$('#openVideosLibrary')?.addEventListener('click',()=>nav('/biblioteca/videos'));$('#openQualityAdmin')?.addEventListener('click',()=>{location.href='/comercial-admin.html?tab=quality'});$('#openPortfolioAdmin')?.addEventListener('click',()=>{location.href='/comercial-admin.html?tab=portfolio'});
  const redraw=()=>{const q=($('#workspaceSearch').value||'').toLowerCase(),st=$('#statusFilter').value;const f=workspaces.filter(w=>`${w.company_name} ${w.client_name||''} ${w.phone||''} ${w.state||''}`.toLowerCase().includes(q)&&(st==='all'||(st==='none'&&!w.status_id)||w.status_id===st));$('#workspaceGrid').innerHTML=renderWorkspaceCards(f);bindWorkspaceCards();};
  $('#workspaceSearch').oninput=redraw;$('#statusFilter').onchange=redraw;bindWorkspaceCards();
  if(dashboardAgingTimer)clearInterval(dashboardAgingTimer);dashboardAgingTimer=setInterval(()=>{if(route()==='/')redraw();},60000);
}
function renderWorkspaceCards(items){
  if(!items.length) return `<div class="empty" style="grid-column:1/-1"><div class="big">◫</div><b>Nenhuma empresa encontrada</b><div>Crie uma empresa ou altere os filtros.</div></div>`;
  return sortWorkspacesByAttention(items).map(w=>{const st=statusById(w.status_id),attention=workspaceStatusAttention(w);const logo=w._logo_url?`<img src="${w._logo_url}" alt="Logo ${escapeHTML(w.company_name)}">`:`<img class="default-card-brand" src="${BRAND_LOGO}" alt="Zero 19">`;const alert=attention?`<div class="status-aging-alert"><span class="attention-pulse"></span><div><b>${escapeHTML(attention.label)} sem alteração de status</b><small>${w.phone?'Confira o cliente no WhatsApp e atualize o status.':'Revise o atendimento e atualize o status.'}</small></div></div>`:'';return `<article class="workspace-card clean ${attention?'needs-status-attention':''}" data-status-age="${attention?Math.floor(attention.ms/3600000):0}"><div class="workspace-head"><div class="workspace-icon ${w._logo_url?'has-logo':''}">${logo}</div><div class="workspace-copy"><div class="workspace-name-line"><h3>${escapeHTML(w.company_name)}</h3>${w.state?`<span class="workspace-state">${escapeHTML(w.state)}</span>`:''}</div><div class="meta">${escapeHTML(w.client_name||'Cliente não informado')}</div>${w.phone?`<div class="meta">${escapeHTML(w.phone)}</div>`:''}</div></div>${alert}<div class="card-status"><label>Status</label><select class="status-select card-status-select" data-id="${w.id}"><option value="">Sem status</option>${statusOptions(w.status_id)}</select><span class="status-dot" style="--status:${escapeHTML(st?.color||'#555')}"></span></div><div class="card-actions">${w.phone?`<button class="btn whatsapp small wa-workspace ${attention?'attention-wa':''}" data-id="${w.id}">WA <span>WhatsApp</span></button>`:''}<button class="btn primary small open-workspace" data-id="${w.id}">Abrir</button><button class="btn ghost small workspace-more" data-id="${w.id}" aria-label="Opções">•••</button></div></article>`}).join('');
}
function bindWorkspaceCards(){
  $$('.open-workspace').forEach(b=>b.onclick=()=>nav(`/ambiente/${b.dataset.id}`));
  $$('.workspace-more').forEach(b=>b.onclick=()=>openWorkspaceActions(workspaces.find(w=>w.id===b.dataset.id)));
  $$('.wa-workspace').forEach(b=>b.onclick=()=>openWhatsApp(workspaces.find(w=>w.id===b.dataset.id)?.phone));
  $$('.card-status-select').forEach(sel=>sel.onchange=async()=>{const ok=await updateWorkspaceStatus(sel.dataset.id,sel.value||null);if(ok)renderDashboard();});
}
async function updateWorkspaceStatus(workspaceId,statusId,{rerender=false}={}){
  const {error}=await supabase.from('z19p_workspaces').update({status_id:statusId||null,updated_at:new Date().toISOString()}).eq('id',workspaceId);
  if(error){toast(error.message,'err');return false;}
  const changedAt=new Date().toISOString();const w=workspaces.find(x=>x.id===workspaceId);if(w){w.status_id=statusId||null;w.status_changed_at=changedAt;}if(currentWorkspace?.id===workspaceId){currentWorkspace.status_id=statusId||null;currentWorkspace.status_changed_at=changedAt;}
  toast('Status atualizado.','ok');if(rerender)renderWorkspace(workspaceId);return true;
}
function openWorkspaceModal(existing=null){
  const modal=document.createElement('div'); modal.className='modal-backdrop'; modal.innerHTML=`<div class="modal compact"><div class="modal-head"><h2>${existing?'Editar empresa':'Nova empresa'}</h2><button class="btn ghost small close">${icon('close')}</button></div><form id="workspaceForm"><div class="form-grid"><div class="field full"><label>Empresa *</label><input name="company_name" required value="${escapeHTML(existing?.company_name||'')}" placeholder="Ex.: Oliveira Vidraçaria"></div><div class="field"><label>Nome do cliente</label><input name="client_name" value="${escapeHTML(existing?.client_name||'')}"></div><div class="field"><label>Telefone / WhatsApp</label><input name="phone" value="${escapeHTML(existing?.phone||'')}" inputmode="tel"></div><div class="field"><label>Estado (UF)</label><select name="state">${stateOptions(existing?.state||'')}</select></div><div class="field full"><label>Status</label><select name="status_id"><option value="">Sem status</option>${statusOptions(existing?.status_id||statuses[0]?.id||'')}</select></div><div class="field full"><label>Observações</label><textarea name="notes" placeholder="Opcional">${escapeHTML(existing?.notes||'')}</textarea></div></div><div class="modal-footer"><button type="button" class="btn close">Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form></div>`;
  document.body.appendChild(modal); $$('.close',modal).forEach(b=>b.onclick=()=>modal.remove());
  $('#workspaceForm',modal).onsubmit=async e=>{e.preventDefault(); const fd=new FormData(e.currentTarget); const payload={company_name:fd.get('company_name').trim(),client_name:fd.get('client_name').trim()||null,phone:fd.get('phone').trim()||null,notes:fd.get('notes').trim()||null,status_id:fd.get('status_id')||null,owner_id:session.user.id,updated_at:new Date().toISOString()};
    const {data,error}=existing?await supabase.from('z19p_workspaces').update(payload).eq('id',existing.id).select().single():await supabase.from('z19p_workspaces').insert(payload).select().single(); if(error)return toast(error.message,'err'); if(!existing)await createDefaultFoldersForWorkspace(data.id); modal.remove(); toast(existing?'Empresa salva.':'Empresa criada com as pastas padrão.','ok'); if(existing&&currentWorkspace?.id===existing.id)renderWorkspace(existing.id); else if(existing)renderDashboard(); else nav(`/ambiente/${data.id}`);
  };
}
function openWorkspaceActions(w){
  if(!w)return;const m=document.createElement('div');m.className='modal-backdrop';m.innerHTML=`<div class="modal action-sheet"><div class="modal-head"><div><div class="eyebrow">Empresa</div><h2>${escapeHTML(w.company_name)}</h2></div><button class="btn ghost small close">×</button></div><div class="action-list">${w.phone?`<button class="action-item whatsapp-item" id="waChat">WA<span><b>Chamar no WhatsApp</b><small>${escapeHTML(w.phone)}</small></span></button>`:''}<button class="action-item" id="waEdit">${icon('edit')}<span><b>Editar dados</b><small>Nome, cliente, telefone, status e observações</small></span></button><button class="action-item" id="waShare">${icon('share')}<span><b>Copiar link do cliente</b><small>Compartilhar orçamento, artes e mockups</small></span></button><button class="action-item danger-item" id="waDelete">${icon('trash')}<span><b>Excluir empresa</b><small>Apaga ambiente, pastas e arquivos</small></span></button></div></div>`;document.body.appendChild(m);$('.close',m).onclick=()=>m.remove();
  $('#waChat',m)?.addEventListener('click',()=>openWhatsApp(w.phone));$('#waEdit',m).onclick=()=>{m.remove();openWorkspaceModal(w)};$('#waShare',m).onclick=()=>copyShare(w.share_token);$('#waDelete',m).onclick=()=>deleteWorkspace(w,m);
}

function openSettingsModal(){
  const m=document.createElement('div');m.className='modal-backdrop';
  const draw=()=>{m.innerHTML=`<div class="modal wide settings-modal"><div class="modal-head"><div><div class="eyebrow">Configurações</div><h2>Status, produtos e pastas</h2></div><button class="btn ghost small close">×</button></div><div class="settings-grid settings-grid-three"><section class="settings-section"><div class="settings-head"><div><b>Status das empresas</b><small>Você pode usar e alterar o status direto no card.</small></div><button class="btn small" id="addStatus">${icon('plus')} Status</button></div><div class="settings-list">${statuses.length?statuses.map(s=>`<div class="settings-row"><span class="status-color" style="--status:${escapeHTML(s.color||'#ff6b2c')}"></span><div class="settings-name">${escapeHTML(s.name)}</div><button class="icon-more edit-config" data-kind="status" data-id="${s.id}">${icon('edit')}</button><button class="icon-more delete-config" data-kind="status" data-id="${s.id}">${icon('trash')}</button></div>`).join(''):'<div class="empty mini">Nenhum status cadastrado.</div>'}</div></section><section class="settings-section"><div class="settings-head"><div><b>Produtos / camisetas</b><small>Catálogo usado na criação dos orçamentos.</small></div><button class="btn small" id="addProduct">${icon('plus')} Produto</button></div><div class="settings-list">${products.length?products.map(p=>`<div class="settings-row"><div class="settings-name">${escapeHTML(p.name)}${p.default_unit_price!=null?`<small>${fmtMoney(p.default_unit_price)}</small>`:''}</div><button class="icon-more edit-config" data-kind="product" data-id="${p.id}">${icon('edit')}</button><button class="icon-more delete-config" data-kind="product" data-id="${p.id}">${icon('trash')}</button></div>`).join(''):'<div class="empty mini">Nenhum produto cadastrado.</div>'}</div></section><section class="settings-section folder-template-section"><div class="settings-head"><div><b>Pastas padrão das empresas</b><small>Estas pastas são criadas automaticamente em toda nova empresa.</small></div><button class="btn small" id="addFolderTemplate">${icon('plus')} Pasta</button></div><div class="settings-list">${folderTemplates.length?folderTemplates.map(f=>`<div class="settings-row folder-template-row"><span class="settings-folder-icon">${icon('folder')}</span><div class="settings-name">${escapeHTML(f.name)}</div><button class="icon-more edit-config" data-kind="folder" data-id="${f.id}">${icon('edit')}</button><button class="icon-more delete-config" data-kind="folder" data-id="${f.id}">${icon('trash')}</button></div>`).join(''):'<div class="empty mini">Nenhuma pasta padrão cadastrada.</div>'}</div><div class="settings-note">Alterações nas pastas padrão valem para novas empresas. As pastas que já existem em uma empresa continuam preservadas.</div></section></div></div>`;
    $('.close',m).onclick=()=>m.remove();
    $('#addStatus',m).onclick=()=>openConfigEditor('status',null,m,draw);
    $('#addProduct',m).onclick=()=>openConfigEditor('product',null,m,draw);
    $('#addFolderTemplate',m).onclick=()=>openConfigEditor('folder',null,m,draw);
    $$('.edit-config',m).forEach(b=>{const kind=b.dataset.kind;const list=kind==='status'?statuses:kind==='product'?products:folderTemplates;b.onclick=()=>openConfigEditor(kind,list.find(x=>x.id===b.dataset.id),m,draw)});
    $$('.delete-config',m).forEach(b=>b.onclick=async()=>{const kind=b.dataset.kind,list=kind==='status'?statuses:kind==='product'?products:folderTemplates,item=list.find(x=>x.id===b.dataset.id);if(!item||!confirm(`Excluir “${item.name}”?`))return;const table=kind==='status'?'z19p_statuses':kind==='product'?'z19p_products':'z19p_folder_templates';const {error}=await supabase.from(table).delete().eq('id',item.id);if(error)return toast(error.message,'err');await loadConfig();if(kind==='status')await loadWorkspaces();toast(kind==='folder'?'Pasta padrão excluída.':'Item excluído.','ok');draw();});
  };
  document.body.appendChild(m);draw();
}
function openConfigEditor(kind,item,parent,redraw){
  const isStatus=kind==='status',isFolder=kind==='folder',label=isStatus?'status':isFolder?'pasta padrão':'produto',x=document.createElement('div');x.className='modal-backdrop nested';
  const semantic=isStatus?`<div class="field full"><label>Fila operacional</label><select name="queue_stage"><option value="none" ${(item?.queue_stage||'none')==='none'?'selected':''}>Nenhuma</option><option value="art_work" ${item?.queue_stage==='art_work'?'selected':''}>Desenvolver arte</option><option value="ready_production" ${item?.queue_stage==='ready_production'?'selected':''}>Iniciar produção</option><option value="production" ${item?.queue_stage==='production'?'selected':''}>Estampar</option></select><small>A automação usa esta chave, mesmo se o nome do status mudar.</small></div><div class="field full"><label class="check-row"><input name="is_finalized" type="checkbox" ${item?.is_finalized?'checked':''}> Este status encerra/finaliza o projeto</label></div><div class="field full"><label class="check-row"><input name="active" type="checkbox" ${item?.active!==false?'checked':''}> Status ativo</label></div>`:'';
  x.innerHTML=`<div class="modal compact"><div class="modal-head"><h2>${item?'Editar':'Adicionar'} ${label}</h2><button class="btn ghost small close">×</button></div><form id="configForm"><div class="form-grid"><div class="field ${isStatus?'':'full'}"><label>Nome *</label><input name="name" required value="${escapeHTML(item?.name||'')}" placeholder="${isFolder?'Ex.: Artes enviadas pelo cliente':''}"></div>${isStatus?`<div class="field"><label>Cor</label><input name="color" type="color" value="${escapeHTML(item?.color||'#ff6b2c')}"></div>${semantic}`:isFolder?'':`<div class="field full"><label>Preço padrão da peça (opcional)</label><input name="price" inputmode="decimal" value="${item?.default_unit_price!=null?String(item.default_unit_price).replace('.',','):''}" placeholder="Ex.: 60,00"></div>`}</div>${isFolder?'<div class="hint" style="margin-top:10px">Ao criar uma nova empresa, esta pasta já aparecerá pronta para receber as artes.</div>':''}<div class="modal-footer"><button type="button" class="btn close">Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form></div>`;document.body.appendChild(x);$$('.close',x).forEach(b=>b.onclick=()=>x.remove());
  $('#configForm',x).onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget),payload={name:fd.get('name').trim(),owner_id:accountOwnerId(),updated_at:new Date().toISOString()};if(isStatus){payload.color=fd.get('color')||'#ff6b2c';payload.sort_order=item?.sort_order??((statuses.length+1)*10);payload.queue_stage=fd.get('queue_stage')||'none';payload.is_finalized=fd.get('is_finalized')==='on';payload.active=fd.get('active')==='on';if(payload.is_finalized&&payload.queue_stage!=='none')return toast('Um status finalizado não pode pertencer a uma fila operacional.','err');}else if(isFolder){payload.sort_order=item?.sort_order??((folderTemplates.length+1)*10);}else{payload.default_unit_price=fd.get('price')?.trim()?moneyNumber(fd.get('price')):null;payload.sort_order=item?.sort_order??((products.length+1)*10);}const table=isStatus?'z19p_statuses':isFolder?'z19p_folder_templates':'z19p_products',res=item?await supabase.from(table).update(payload).eq('id',item.id):await supabase.from(table).insert(payload);if(res.error)return toast(res.error.message,'err');x.remove();await loadConfig();if(isStatus)await loadWorkspaces();toast(isFolder?'Pasta padrão salva.':'Configuração salva.','ok');redraw();};
}
async function createDefaultFoldersForWorkspace(workspaceId){
  if(!workspaceId||!session?.user?.id)return true;
  if(!folderTemplates.length)await loadConfig();
  if(!folderTemplates.length)return true;
  const rows=folderTemplates.map((f,i)=>({owner_id:session.user.id,workspace_id:workspaceId,name:f.name,purpose:f.purpose||null,sort_order:f.sort_order??((i+1)*10)}));
  const {error}=await supabase.from('z19p_folders').insert(rows);
  if(error){toast('A empresa foi criada, mas não foi possível gerar as pastas padrão.','err');return false;}
  return true;
}

async function deleteWorkspace(w,modal=null){
  if(!confirm(`Excluir a empresa “${w.company_name}” e todos os arquivos dela? Essa ação não pode ser desfeita.`))return;
  const {data:assets,error:ae}=await supabase.from('z19p_assets').select('original_path,processed_path').eq('workspace_id',w.id);if(ae)return toast(ae.message,'err');
  const paths=(assets||[]).flatMap(a=>[a.original_path,a.processed_path]).filter(Boolean);
  const {error}=await supabase.from('z19p_workspaces').delete().eq('id',w.id);if(error)return toast(error.message,'err');
  // Delete records first: paid orders and print jobs may prohibit deletion.
  for(let i=0;i<paths.length;i+=100){const {error:storageError}=await supabase.storage.from(BUCKET).remove([...new Set(paths.slice(i,i+100))]);if(storageError){toast('Empresa excluída. Alguns arquivos permaneceram no armazenamento para limpeza posterior.','err');break}}
  modal?.remove();toast('Empresa excluída.','ok');if(currentWorkspace?.id===w.id){currentWorkspace=null;nav('/')}else renderDashboard();
}

async function loadQuotes(workspaceId,projectId=null){
  const stillCurrent=accountReadGuard();
  let query=supabase.from('z19p_quotes').select('*').eq('workspace_id',workspaceId).order('created_at',{ascending:false});if(projectId)query=query.eq('project_id',projectId);
  const {data:q,error}=await query;
  if(!stillCurrent())return [];
  if(error){toast('Não foi possível carregar o orçamento.','err');currentQuotes=[];return currentQuotes;}
  const qs=q||[];if(!qs.length){currentQuotes=[];return currentQuotes;}
  const {data:items,error:ie}=await supabase.from('z19p_quote_items').select('*').in('quote_id',qs.map(x=>x.id)).order('sort_order');
  if(!stillCurrent())return [];
  if(ie){toast('Não foi possível carregar os itens do orçamento.','err');currentQuotes=qs.map(x=>({...x,items:[]}));return currentQuotes;}
  currentQuotes=qs.map(x=>({...x,items:(items||[]).filter(i=>i.quote_id===x.id)}));return currentQuotes;
}
function renderQuotesAdmin(){
  if(!currentQuotes.length)return `<div class="quote-empty"><div><b>Nenhum orçamento criado</b><span>Monte o orçamento e ele aparecerá automaticamente na área do cliente.</span></div><button class="btn primary small" id="newQuote">${icon('plus')} Criar orçamento</button></div>`;
  return `<div class="quote-list">${currentQuotes.map(q=>`<article class="quote-summary"><div><div class="quote-title-line"><b>${escapeHTML(q.title||'Orçamento')}</b><span>${fmtMoney(quoteTotal(q))}</span></div><small>${q.items?.length||0} item(ns)${q.delivery_term?` • Prazo: ${escapeHTML(q.delivery_term)}`:''}</small></div><div class="quote-actions"><button class="btn small edit-quote" data-id="${q.id}">${icon('edit')} Editar</button><button class="btn ghost small delete-quote" data-id="${q.id}">${icon('trash')}</button></div></article>`).join('')}</div>`;
}
function bindQuoteAdmin(){
  $('#newQuote')?.addEventListener('click',()=>openQuoteModal());$('#addQuote')?.addEventListener('click',()=>openQuoteModal());
  $$('.edit-quote').forEach(b=>b.onclick=()=>openQuoteModal(currentQuotes.find(q=>q.id===b.dataset.id)));
  $$('.delete-quote').forEach(b=>b.onclick=async()=>{const q=currentQuotes.find(x=>x.id===b.dataset.id);if(!q||!confirm(`Excluir “${q.title||'Orçamento'}”?`))return;const {error}=await supabase.from('z19p_quotes').delete().eq('id',q.id);if(error)return toast(error.message,'err');toast('Orçamento excluído.','ok');renderWorkspace(currentWorkspace.id);});
}
function defaultQuoteItem(){
  const p=products[0];return {id:crypto.randomUUID(),product_id:p?.id||null,product_name:p?.name||'',quantity:1,pricing_mode:'total_unit',piece_price:p?.default_unit_price??'',total_unit_price:'',prints:[{placement:'Frente',width_cm:'',price:''}]};
}
async function openQuoteModal(existing=null){
  if(existing&&!existing.service_type)return openLegacyQuoteModal(existing);
  const workspace=currentWorkspace,owner=accountOwnerId(),stillCurrent=accountReadGuard(true);
  if(!workspace?.id)return;
  try{const project=existing?.project_id?currentProjects.find(p=>p.id===existing.project_id):await getLatestProject(workspace.id);if(!stillCurrent()||currentWorkspace?.id!==workspace.id||accountOwnerId()!==owner)return;
    return openServiceQuoteModal({supabase,workspace,project,products,accountOwnerId,publicUrl,toast,onSaved:()=>renderWorkspace(workspace.id),onCreateMockup:({asset,projectId,workspaceId,initialScene,onSaved})=>artStudio.openGarment(asset,{projectId,workspaceId,initialScene,onOfficialSaved:onSaved})},existing);
  }catch(error){if(stillCurrent())toast(error.message||'Não foi possível abrir o orçamento.','err');}
}
function openLegacyQuoteModal(existing=null){
  const draft={id:existing?.id||null,title:existing?.title||'Orçamento',delivery_term:existing?.delivery_term||'',delivery_date:existing?.delivery_date||'',notes:existing?.notes||'',items:(existing?.items?.length?existing.items:[defaultQuoteItem()]).map(i=>({...i,_key:i.id||crypto.randomUUID(),prints:(Array.isArray(i.prints)&&i.prints.length?i.prints:[{placement:'Frente',width_cm:'',price:''}]).map(p=>({...p}))}))};
  const m=document.createElement('div');m.className='modal-backdrop';document.body.appendChild(m);
  const render=()=>{m.innerHTML=`<div class="modal wide quote-modal"><div class="modal-head"><div><div class="eyebrow">Orçamento do cliente</div><h2>${existing?'Editar orçamento':'Novo orçamento'}</h2></div><button class="btn ghost small close">×</button></div><div class="quote-top form-grid"><div class="field"><label>Nome do orçamento</label><input id="quoteTitle" value="${escapeHTML(draft.title)}" placeholder="Orçamento"></div><div class="field"><label>Data de entrega (opcional agora)</label><input id="quoteDeliveryDate" type="date" value="${escapeHTML(draft.delivery_date)}"></div><div class="field full"><label>Observação de prazo (legado/opcional)</label><input id="quoteDelivery" value="${escapeHTML(draft.delivery_term)}" placeholder="Ex.: depende da aprovação da arte"></div></div><div class="quote-items-head"><div><b>Produtos e personalizações</b><small>Informe largura da estampa; a altura acompanha proporcionalmente.</small></div><button class="btn small" id="addQuoteItem">${icon('plus')} Produto</button></div><div id="quoteItems">${draft.items.map((item,i)=>renderQuoteItem(item,i)).join('')}</div><div class="field quote-notes"><label>Observações para o cliente</label><textarea id="quoteNotes" placeholder="Opcional">${escapeHTML(draft.notes)}</textarea></div><div class="quote-total"><span>Total do orçamento</span><b id="quoteGrandTotal">${fmtMoney(quoteTotal(draft))}</b></div>${quoteCommissionPreviewHTML(draft)}<div class="modal-footer"><button class="btn close">Cancelar</button><button class="btn primary" id="saveQuote">Salvar orçamento</button></div></div>`;
    $$('.close',m).forEach(b=>b.onclick=()=>m.remove());
    $('#quoteTitle',m).oninput=e=>draft.title=e.target.value;$('#quoteDelivery',m).oninput=e=>draft.delivery_term=e.target.value;$('#quoteDeliveryDate',m).oninput=e=>draft.delivery_date=e.target.value;$('#quoteNotes',m).oninput=e=>draft.notes=e.target.value;
    $('#addQuoteItem',m).onclick=()=>{draft.items.push(defaultQuoteItem());render();};
    bindQuoteItemFields();$('#saveQuote',m).onclick=()=>saveQuoteDraft(draft,m);
    if(existing?.payment_status==='paid'){
      $$('input,select,textarea,button:not(.close)',m).forEach(control=>control.disabled=true);
      const notice=document.createElement('p');notice.className='hint';notice.textContent='Orçamento legado pago: consulta somente. Valores, quantidades e histórico preservados; não será convertido automaticamente.';$('.modal-footer',m).before(notice);$('#saveQuote',m).textContent='Histórico preservado';
    }
  };
  function renderQuoteItem(item,i){
    const separated=item.pricing_mode==='piece_plus_print';return `<section class="quote-item" data-item="${i}"><div class="quote-item-head"><b>Item ${i+1}</b>${draft.items.length>1?`<button class="btn ghost small remove-quote-item" data-i="${i}">${icon('trash')} Remover</button>`:''}</div><div class="quote-item-grid"><div class="field product-field"><label>Produto / camiseta</label><select class="qi-product" data-i="${i}"><option value="">Selecione</option>${products.map(p=>`<option value="${p.id}" ${p.id===item.product_id?'selected':''}>${escapeHTML(p.name)}</option>`).join('')}</select></div><div class="field"><label>Quantidade</label><input class="qi-qty" data-i="${i}" inputmode="numeric" value="${escapeHTML(item.quantity||1)}"></div><div class="field pricing-field"><label>Forma de preço</label><select class="qi-mode" data-i="${i}"><option value="total_unit" ${!separated?'selected':''}>Valor total por peça (com estampa)</option><option value="piece_plus_print" ${separated?'selected':''}>Peça + estampa separado</option></select></div>${separated?`<div class="field"><label>Valor da peça</label><input class="qi-piece-price" data-i="${i}" inputmode="decimal" value="${escapeHTML(item.piece_price??'')}" placeholder="0,00"></div>`:`<div class="field"><label>Valor total por peça</label><input class="qi-total-price" data-i="${i}" inputmode="decimal" value="${escapeHTML(item.total_unit_price??'')}" placeholder="0,00"></div>`}</div><div class="prints-title"><div><b>Estampas</b><small>Posição e largura de cada aplicação.</small></div><button class="btn ghost small add-print" data-i="${i}">${icon('plus')} Estampa</button></div><div class="prints-list">${item.prints.map((pr,j)=>`<div class="print-row"><div class="field"><label>Posição</label><select class="qp-placement" data-i="${i}" data-j="${j}">${PRINT_PLACEMENTS.map(x=>`<option ${x===pr.placement?'selected':''}>${escapeHTML(x)}</option>`).join('')}</select></div><div class="field"><label>Largura (cm)</label><input class="qp-width" data-i="${i}" data-j="${j}" inputmode="decimal" value="${escapeHTML(pr.width_cm??'')}" placeholder="Ex.: 9"></div>${separated?`<div class="field"><label>Valor da estampa</label><input class="qp-price" data-i="${i}" data-j="${j}" inputmode="decimal" value="${escapeHTML(pr.price??'')}" placeholder="0,00"></div>`:''}<button class="print-remove" data-i="${i}" data-j="${j}" aria-label="Remover estampa">×</button></div>`).join('')}</div><div class="quote-item-subtotal"><span>Subtotal do item</span><b>${fmtMoney(Math.max(1,parseInt(item.quantity)||1)*quoteItemUnit(item))}</b></div></section>`;
  }
  function bindQuoteItemFields(){
    $$('.remove-quote-item',m).forEach(b=>b.onclick=()=>{draft.items.splice(+b.dataset.i,1);render();});
    $$('.qi-product',m).forEach(el=>el.onchange=()=>{const i=+el.dataset.i,p=products.find(x=>x.id===el.value);draft.items[i].product_id=p?.id||null;draft.items[i].product_name=p?.name||'';if(draft.items[i].pricing_mode==='piece_plus_print'&&!draft.items[i].piece_price&&p?.default_unit_price!=null)draft.items[i].piece_price=p.default_unit_price;render();});
    $$('.qi-qty',m).forEach(el=>el.oninput=()=>{draft.items[+el.dataset.i].quantity=Math.max(1,parseInt(el.value.replace(/\D/g,''))||1);updateTotal();});
    $$('.qi-mode',m).forEach(el=>el.onchange=()=>{const i=+el.dataset.i;draft.items[i].pricing_mode=el.value;const p=products.find(x=>x.id===draft.items[i].product_id);if(el.value==='piece_plus_print'&&!draft.items[i].piece_price&&p?.default_unit_price!=null)draft.items[i].piece_price=p.default_unit_price;render();});
    $$('.qi-piece-price',m).forEach(el=>el.oninput=()=>{draft.items[+el.dataset.i].piece_price=el.value;updateTotal();});
    $$('.qi-total-price',m).forEach(el=>el.oninput=()=>{draft.items[+el.dataset.i].total_unit_price=el.value;updateTotal();});
    $$('.add-print',m).forEach(b=>b.onclick=()=>{draft.items[+b.dataset.i].prints.push({placement:'Frente',width_cm:'',price:''});render();});
    $$('.qp-placement',m).forEach(el=>el.onchange=()=>draft.items[+el.dataset.i].prints[+el.dataset.j].placement=el.value);
    $$('.qp-width',m).forEach(el=>el.oninput=()=>draft.items[+el.dataset.i].prints[+el.dataset.j].width_cm=el.value);
    $$('.qp-price',m).forEach(el=>el.oninput=()=>{draft.items[+el.dataset.i].prints[+el.dataset.j].price=el.value;updateTotal();});
    $$('.print-remove',m).forEach(b=>b.onclick=()=>{const i=+b.dataset.i,j=+b.dataset.j;draft.items[i].prints.splice(j,1);if(!draft.items[i].prints.length)draft.items[i].prints.push({placement:'Frente',width_cm:'',price:''});render();});
  }
  function updateTotal(){const el=$('#quoteGrandTotal',m);if(el)el.textContent=fmtMoney(quoteTotal(draft));const preview=commissionPreviewForDraft(draft),commissionEl=$('#quoteCommissionPreviewAmount',m);if(preview&&commissionEl)commissionEl.textContent=fmtMoney(preview.amount);$$('.quote-item',m).forEach((node,i)=>{const b=$('.quote-item-subtotal b',node);if(b)b.textContent=fmtMoney(Math.max(1,parseInt(draft.items[i].quantity)||1)*quoteItemUnit(draft.items[i]));});}
  render();
}
async function saveQuoteDraft(draft,m){
  if(!draft.items.length)return toast('Adicione pelo menos um produto.','err');
  for(const item of draft.items){if(!item.product_name)return toast('Selecione o produto em todos os itens.','err');}
  const payload={owner_id:session.user.id,workspace_id:currentWorkspace.id,title:draft.title.trim()||'Orçamento',delivery_term:draft.delivery_term.trim()||null,delivery_date:draft.delivery_date||null,notes:draft.notes.trim()||null,updated_at:new Date().toISOString()};
  let quoteId=draft.id;if(quoteId){const {error}=await supabase.from('z19p_quotes').update(payload).eq('id',quoteId);if(error)return toast(error.message,'err');const {error:de}=await supabase.from('z19p_quote_items').delete().eq('quote_id',quoteId);if(de)return toast(de.message,'err');}
  else{const {data,error}=await supabase.from('z19p_quotes').insert(payload).select().single();if(error)return toast(error.message,'err');quoteId=data.id;}
  const rows=draft.items.map((item,i)=>({owner_id:session.user.id,quote_id:quoteId,product_id:item.product_id||null,product_name:item.product_name,quantity:Math.max(1,parseInt(item.quantity)||1),pricing_mode:item.pricing_mode,piece_price:item.pricing_mode==='piece_plus_print'?moneyNumber(item.piece_price):null,total_unit_price:item.pricing_mode==='total_unit'?moneyNumber(item.total_unit_price):null,prints:(item.prints||[]).map(p=>({placement:p.placement||'Frente',width_cm:String(p.width_cm||'').trim(),price:item.pricing_mode==='piece_plus_print'?moneyNumber(p.price):0})),sort_order:i}));
  const {error}=await supabase.from('z19p_quote_items').insert(rows);if(error)return toast(error.message,'err');m.remove();toast('Orçamento salvo e disponível para o cliente.','ok');renderWorkspace(currentWorkspace.id);
}

async function renderWorkspace(id){
  await ensureDefaults();
  await loadConfig();
  const [{data:w,error:we},{data:f},{data:a}]=await Promise.all([
    supabase.from('z19p_workspaces').select('*').eq('id',id).single(),
    supabase.from('z19p_folders').select('*').eq('workspace_id',id).order('sort_order').order('name'),
    supabase.from('z19p_assets').select('*').eq('workspace_id',id).order('created_at',{ascending:false})
  ]);
  if(we||!w){toast('Ambiente não encontrado.','err');return nav('/');}
  currentWorkspace=w;currentFolders=f||[];currentAssets=a||[];activeFolder='all';
  const isLibrary=w.workspace_type&&w.workspace_type!=='client';
  const isMockupsLibrary=w.workspace_type==='library_mockups';
  // v2.17.15: orçamento saiu do fluxo visual de clientes. O código legado
  // permanece preservado para a integração futura, mas não é consultado aqui.
  currentQuotes=[];
  const st=statusById(w.status_id);
  const logoFolder=currentFolders.find(x=>x.purpose==='logo_empresa');
  const logoAsset=logoFolder?currentAssets.find(a=>a.folder_id===logoFolder.id):null;
  const logoUrl=logoAsset?publicUrl(logoAsset.processed_path||logoAsset.original_path):'';
  const bannerIcon=logoUrl?`<div class="workspace-banner-logo"><img src="${logoUrl}" alt="Logo"></div>`:'';
  const bannerActions=isLibrary
    ? `<button class="btn primary" id="uploadBtn">${icon('upload')} ${isMockupsLibrary?'Adicionar mockup':'Subir arte'}</button>`
    : `${w.phone?`<button class="btn whatsapp" id="workspaceWhatsapp">WA WhatsApp</button>`:''}<button class="btn" id="mockupBtn">${icon('image')} Adicionar mockup</button><button class="btn primary" id="uploadBtn">${icon('upload')} Subir arte</button><button class="btn ghost" id="workspaceMore">•••</button>`;
  const attention=isLibrary?null:workspaceStatusAttention(w);
  const agingNotice=attention?`<div class="workspace-aging-notice"><span class="attention-pulse"></span><div><b>Status sem alteração há ${escapeHTML(attention.label)}</b><small>${w.phone?'Entre em contato pelo WhatsApp e atualize o andamento.':'Revise este atendimento e atualize o status.'}</small></div>${w.phone?`<button class="btn whatsapp small" id="agingWhatsapp">WA WhatsApp</button>`:''}</div>`:'';
  const controls=isLibrary?'':`${agingNotice}<div class="workspace-control-row"><div class="workspace-status-block"><div class="workspace-status-control"><span class="status-dot" style="--status:${escapeHTML(st?.color||'#555')}"></span><div><small>Status da empresa</small><select id="workspaceStatus" class="status-select"><option value="">Sem status</option>${statusOptions(w.status_id)}</select></div></div>${statusAgeDetail}</div><div class="share-strip compact-share"><div class="share-info"><span class="share-status ${w.share_enabled?'on':''}"></span><div><b>Área do cliente</b><small>${w.share_enabled?'Link ativo':'Link desativado'}</small></div></div><div class="share-actions"><button class="btn small" id="copyShare">${icon('copy')} Copiar link</button><label class="switch"><input type="checkbox" id="shareEnabled" ${w.share_enabled?'checked':''}><span></span></label></div></div></div>`;
  const quoteSection=isLibrary?'':`<section class="quotes-admin"><div class="section-title-row"><div><div class="eyebrow">Comercial</div><h2>Orçamento</h2><p>O cliente visualiza este orçamento no próprio ambiente.</p></div>${currentQuotes.length?`<button class="btn small" id="addQuote">${icon('plus')} Novo orçamento</button>`:''}</div>${renderQuotesAdmin()}</section>`;
  const sideTitle=isLibrary?(isMockupsLibrary?'Pastas de mockups':'Pastas de artes'):'Pastas da empresa';
  const kindLabel=isLibrary?(isMockupsLibrary?'Biblioteca de mockups':'Biblioteca de artes'):'Empresa';
  const meta=isLibrary?(isMockupsLibrary?'Organize seus mockups e acesse do celular ou computador.':'Organize suas artes em pastas e subpastas e acesse de qualquer dispositivo.'):`${escapeHTML(w.client_name||'Cliente não informado')} ${w.phone?`• ${escapeHTML(w.phone)}`:''}${w.state?` • ${escapeHTML(w.state)}`:''}`;
  const typeFilter=isLibrary?'':`<select id="typeFilter" class="btn compact-select"><option value="all">Tudo</option><option value="arte">Artes</option><option value="mockup">Mockups</option></select>`;
  const content=`<main class="container simple-container"><div class="workspace-banner clean library-aware">${bannerIcon}<div><div class="eyebrow">${kindLabel}</div><h1>${escapeHTML(w.company_name)}</h1><div class="meta">${meta}</div></div><div class="spacer"></div>${bannerActions}</div>
  ${controls}${quoteSection}
  <div class="workspace-layout clean-layout"><aside class="sidebar"><div class="side-title"><b>${sideTitle}</b><button class="btn ghost small" id="newFolder" title="Criar pasta">${icon('plus')}</button></div><button class="folder active" data-folder="all">${icon('image')} <span>Todos</span></button><button class="folder" data-folder="root">${icon('folder')} <span>Sem pasta</span></button>${renderFolderTree()}</aside><section class="workspace-main"><div class="toolbar clean-toolbar asset-toolbar"><div class="search">${icon('search')}<input id="assetSearch" placeholder="Buscar arquivo..."></div>${typeFilter}</div><div id="assetGrid" class="asset-grid clean-assets">${renderAssets(currentAssets)}</div></section></div></main>`;
  app.innerHTML=shell(content,{back:true});bindCommon();bindWorkspaceUI();if(!isLibrary)bindQuoteAdmin();
}
function folderChildren(parentId=null,folders=currentFolders){
  return folders.filter(f=>(f.parent_id||null)===(parentId||null)).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||a.name.localeCompare(b.name,'pt-BR'));
}
function renderFolderTree(parentId=null,depth=0,seen=new Set()){
  const rows=[];
  for(const f of folderChildren(parentId)){
    if(seen.has(f.id))continue;seen.add(f.id);
    const purpose=f.purpose?` data-purpose="${escapeHTML(f.purpose)}"`:'';
    rows.push(`<div class="folder-row folder-depth-${Math.min(depth,6)}" style="--depth:${depth}"><button class="folder" data-folder="${f.id}"${purpose}>${icon('folder')} <span>${escapeHTML(f.name)}</span></button><button class="folder-more" data-id="${f.id}" aria-label="Opções da pasta">•••</button></div>`);
    rows.push(renderFolderTree(f.id,depth+1,seen));
  }
  return rows.join('');
}
function folderOptionHTML(folders=currentFolders,selected='',excludeId=''){
  const out=[];const seen=new Set();
  const walk=(parentId=null,depth=0)=>{
    for(const f of folderChildren(parentId,folders)){
      if(f.id===excludeId||seen.has(f.id))continue;seen.add(f.id);
      out.push(`<option value="${f.id}" ${selected===f.id?'selected':''}>${'— '.repeat(depth)}${escapeHTML(f.name)}</option>`);
      walk(f.id,depth+1);
    }
  };walk();return out.join('');
}
function renderAssets(items){
  if(!items.length){const isLib=currentWorkspace?.workspace_type&&currentWorkspace.workspace_type!=='client',mock=currentWorkspace?.workspace_type==='library_mockups',video=currentWorkspace?.workspace_type==='library_videos';return `<div class="empty" style="grid-column:1/-1"><div class="big">${video?'▶':'▧'}</div><b>${video?'Nenhum vídeo aqui':'Nenhum arquivo aqui'}</b><div>${isLib?(video?'Adicione vídeos de demonstração e organize em pastas.':mock?'Adicione seus mockups e organize em pastas.':'Suba suas artes e organize em pastas e subpastas.'):'Suba uma arte ou adicione um mockup.'}</div><div class="empty-actions"><button class="btn primary" id="emptyUpload">${icon('upload')} ${video?'Adicionar vídeo':mock?'Adicionar mockup':'Subir arte'}</button>${isLib?'':`<button class="btn" id="emptyMockup">Adicionar mockup</button>`}</div></div>`;}
  return items.map(a=>{const url=publicUrl(a.processed_path||a.original_path);const q=a.metadata?.quality_target?`${a.metadata.quality_target}px`:'';return `<article class="asset-card clean" data-asset="${a.id}"><button class="preview-wrap asset-preview-btn" data-id="${a.id}" aria-label="Visualizar ${escapeHTML(a.name)}"><span class="badge">${a.asset_type==='mockup'?'MOCKUP':'ARTE'}</span><img loading="lazy" decoding="async" src="${publicUrl(assetPreviewPath(a))}" alt="${escapeHTML(a.name)}"></button><div class="asset-body"><div class="asset-title-row"><h4 title="${escapeHTML(a.name)}">${escapeHTML(a.name)}</h4><button class="icon-more more-asset" data-id="${a.id}" aria-label="Editar arquivo">•••</button></div><div class="asset-meta"><span>${a.width||'?'}×${a.height||'?'}</span>${a.asset_type==='arte'&&a.alpha_trimmed?'<span>sem prancheta</span>':''}${q?`<span>${q}</span>`:''}</div><div class="asset-actions"><button class="btn small dl-asset" data-id="${a.id}">${icon('download')} Baixar PNG</button></div></div></article>`}).join('');
}
function bindWorkspaceUI(){
  const isLibrary=currentWorkspace?.workspace_type&&currentWorkspace.workspace_type!=='client';
  const isMockupsLibrary=currentWorkspace?.workspace_type==='library_mockups';
  $('#workspaceMore')?.addEventListener('click',()=>openWorkspaceActions(currentWorkspace));
  $('#workspaceWhatsapp')?.addEventListener('click',()=>openWhatsApp(currentWorkspace.phone));
  $('#agingWhatsapp')?.addEventListener('click',()=>openWhatsApp(currentWorkspace.phone));
  $('#workspaceStatus')?.addEventListener('change',async e=>{await updateWorkspaceStatus(currentWorkspace.id,e.target.value||null,{rerender:true});});
  $('#uploadBtn')?.addEventListener('click',()=>isVideosLibrary?openVideoUploadModal():openUploadModal({presetType:isMockupsLibrary?'mockup':'arte'}));$('#demoComposerBtn')?.addEventListener('click',()=>openDemoComposer());
  $('#mockupBtn')?.addEventListener('click',()=>openUploadModal({presetType:'mockup'}));
  $('#newFolder')?.addEventListener('click',()=>createFolder(activeFolder!=='all'&&activeFolder!=='root'?activeFolder:null));
  $('#copyShare')?.addEventListener('click',()=>copyShare(currentWorkspace.share_token));
  $('#shareEnabled')?.addEventListener('change',async e=>{const {error}=await supabase.from('z19p_workspaces').update({share_enabled:e.target.checked}).eq('id',currentWorkspace.id); if(error)toast(error.message,'err'); else {currentWorkspace.share_enabled=e.target.checked;toast(e.target.checked?'Link do cliente ativado.':'Link do cliente desativado.','ok');renderWorkspace(currentWorkspace.id);}});
  $$('.folder').forEach(b=>b.onclick=()=>{activeFolder=b.dataset.folder;$$('.folder').forEach(x=>x.classList.toggle('active',x===b));filterAssets();});
  $$('.folder-more').forEach(b=>b.onclick=e=>{e.stopPropagation();openFolderActions(currentFolders.find(f=>f.id===b.dataset.id));});
  $('#assetSearch')?.addEventListener('input',filterAssets); $('#typeFilter')?.addEventListener('change',filterAssets); bindAssetCards();bindEmptyActions();
}
function bindEmptyActions(){
  const mock=currentWorkspace?.workspace_type==='library_mockups',video=currentWorkspace?.workspace_type==='library_videos';
  $('#emptyUpload')?.addEventListener('click',()=>video?openVideoUploadModal():openUploadModal({presetType:mock?'mockup':'arte'}));
  $('#emptyMockup')?.addEventListener('click',()=>openUploadModal({presetType:'mockup'}));
}
function filterAssets(){
  const q=($('#assetSearch')?.value||'').toLowerCase(), t=$('#typeFilter')?.value||'all'; let list=currentAssets.filter(a=>(activeFolder==='all'||(activeFolder==='root'&&!a.folder_id)||a.folder_id===activeFolder)&&(t==='all'||a.asset_type===t)&&a.name.toLowerCase().includes(q)); replacePreviewMarkup($('#assetGrid'),renderAssets(list));bindAssetCards();bindEmptyActions();
}
function bindAssetCards(){
  $$('.asset-preview-btn').forEach(b=>b.onclick=()=>openAssetPreview(currentAssets.find(a=>a.id===b.dataset.id)));
  $$('.dl-asset').forEach(b=>b.onclick=()=>downloadAsset(currentAssets.find(a=>a.id===b.dataset.id)));
  $$('.more-asset').forEach(b=>b.onclick=()=>openAssetActions(currentAssets.find(a=>a.id===b.dataset.id)));
  bindStudioAssetCards();
  productionModule?.enhanceAssetCards?.();
}
function assetStudioHandlers(beforeOpen=()=>{}){return {
  garmentEnabled:garmentStudioEnabled,
  openGarment:asset=>{beforeOpen();if(!garmentStudioEnabled)return;return artStudio.openGarment(asset)},
  open3D:asset=>{beforeOpen();if(!garmentStudioEnabled)return;return artStudio.openGarment(asset,{initialAction:'3d'})},
  openPresentation:asset=>{beforeOpen();if(!garmentStudioEnabled)return;return artStudio.openGarment(asset,{initialAction:'share3d'})},
  openBlank:asset=>{beforeOpen();if(!garmentStudioEnabled)return;return artStudio.openGarment(asset,{initialAction:'blank'})},
  openMockup:async asset=>{beforeOpen();if(await officialOrders?.openPlacementPreview?.(asset))return;return artStudio.openMockup(asset)},
  openEditor:asset=>{beforeOpen();return artStudio.openEditor(asset)},
  onError:error=>toast(error.message||'Não foi possível abrir o estúdio.','err')
}}
function bindStudioAssetCards(){
  const handlers=assetStudioHandlers();
  for(const card of app.querySelectorAll('[data-asset]')){
    const asset=currentAssets.find(item=>item.id===card.dataset.asset);if(asset)attachAssetStudioActions(card,asset,handlers);
  }
}
async function createFolder(parentId=null){
  const parent=parentId?currentFolders.find(f=>f.id===parentId):null;
  const name=prompt(parent?`Nome da subpasta dentro de “${parent.name}”:`:'Nome da pasta:');if(!name?.trim())return;
  const {error}=await supabase.from('z19p_folders').insert({owner_id:session.user.id,workspace_id:currentWorkspace.id,parent_id:parentId||null,name:name.trim(),sort_order:(currentFolders.length+1)*10});if(error)return toast(error.message,'err');toast(parent?'Subpasta criada.':'Pasta criada.','ok');renderWorkspace(currentWorkspace.id);
}
function openFolderActions(folder){
  if(!folder)return;const m=document.createElement('div');m.className='modal-backdrop';m.innerHTML=`<div class="modal action-sheet"><div class="modal-head"><div><div class="eyebrow">Pasta</div><h2>${escapeHTML(folder.name)}</h2></div><button class="btn ghost small close">×</button></div><div class="action-list"><button class="action-item" id="folderSub">${icon('folder')}<span><b>Criar subpasta</b><small>Organize este conteúdo em mais níveis</small></span></button><button class="action-item" id="folderRename">${icon('edit')}<span><b>Renomear pasta</b><small>Altere o nome da pasta</small></span></button><button class="action-item" id="folderMove">${icon('folder')}<span><b>Mover pasta</b><small>Coloque dentro de outra pasta ou na raiz</small></span></button><button class="action-item danger-item" id="folderDelete">${icon('trash')}<span><b>Excluir pasta</b><small>Subpastas também serão removidas; as artes ficam sem pasta</small></span></button></div></div>`;document.body.appendChild(m);$('.close',m).onclick=()=>m.remove();
  $('#folderSub',m).onclick=()=>{m.remove();createFolder(folder.id)};
  $('#folderRename',m).onclick=async()=>{const name=prompt('Novo nome da pasta:',folder.name);if(!name?.trim())return;const {error}=await supabase.from('z19p_folders').update({name:name.trim(),updated_at:new Date().toISOString()}).eq('id',folder.id);if(error)return toast(error.message,'err');m.remove();toast('Pasta renomeada.','ok');renderWorkspace(currentWorkspace.id)};
  $('#folderMove',m).onclick=()=>{const x=document.createElement('div');x.className='modal-backdrop nested';x.innerHTML=`<div class="modal compact"><div class="modal-head"><h2>Mover ${escapeHTML(folder.name)}</h2><button class="btn ghost small close">×</button></div><div class="field"><label>Nova localização</label><select id="moveFolderParent"><option value="">Raiz</option>${folderOptionHTML(currentFolders,folder.parent_id||'',folder.id)}</select></div><div class="modal-footer"><button class="btn close">Cancelar</button><button class="btn primary" id="confirmMoveFolder">Mover pasta</button></div></div>`;document.body.appendChild(x);$$('.close',x).forEach(b=>b.onclick=()=>x.remove());$('#confirmMoveFolder',x).onclick=async()=>{const parent_id=$('#moveFolderParent',x).value||null;const {error}=await supabase.from('z19p_folders').update({parent_id,updated_at:new Date().toISOString()}).eq('id',folder.id);if(error)return toast(error.message,'err');x.remove();m.remove();toast('Pasta movida.','ok');renderWorkspace(currentWorkspace.id)};};
  $('#folderDelete',m).onclick=async()=>{if(!confirm(`Excluir a pasta “${folder.name}”? As subpastas também serão excluídas. As artes continuarão salvas em “Sem pasta”.`))return;const {error}=await supabase.from('z19p_folders').delete().eq('id',folder.id);if(error)return toast(error.message,'err');m.remove();toast('Pasta excluída.','ok');renderWorkspace(currentWorkspace.id)};
}

function makeShareLink(token){return `${location.origin}${location.pathname}#/cliente/${token}`;}
async function copyShare(token){try{await navigator.clipboard.writeText(makeShareLink(token));toast('Link do cliente copiado.','ok');}catch{prompt('Copie o link:',makeShareLink(token));}}
async function forceDownload(path,name){
  try{const r=await fetch(publicUrl(path));if(!r.ok)throw new Error('Falha ao baixar');const blob=await r.blob();const png=blob.type==='image/png'?blob:new Blob([blob],{type:'image/png'});const url=URL.createObjectURL(png);const link=document.createElement('a');link.href=url;link.download=`${slug(name)||'arte'}.png`;link.rel='noopener';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);toast('PNG preparado para download.','ok');}
  catch(e){toast('Não foi possível baixar o arquivo.','err');}
}
function downloadAsset(a){if(!a)return;const path=a.processed_path||a.original_path;if(!path)return;forceDownload(path,a.name);}
function openImageAsset(a){if(!a)return;const path=a.processed_path||a.original_path;if(path)window.open(publicUrl(path),'_blank','noopener');}
async function saveImageAsset(a){
  if(!a)return;try{const path=a.processed_path||a.original_path;const r=await fetch(publicUrl(path));if(!r.ok)throw new Error();const blob=await r.blob();const file=new File([blob],`${slug(a.name)||'arte'}.png`,{type:'image/png'});if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:a.name});return;}openImageAsset(a);}catch(e){if(e?.name!=='AbortError')openImageAsset(a);}
}
function openAssetPreview(a){
  if(!a)return;const url=publicUrl(a.processed_path||a.original_path);const m=document.createElement('div');m.className='modal-backdrop';m.innerHTML=`<div class="modal preview-modal"><div class="modal-head"><div><div class="eyebrow">${a.asset_type==='mockup'?'Mockup':'Arte'}</div><h2>${escapeHTML(a.name)}</h2></div><button class="btn ghost small close">×</button></div><div class="large-preview check" id="largePreview"><img src="${url}" alt="${escapeHTML(a.name)}"></div><div class="preview-controls"><div class="seg" id="previewBg"><button data-bg="check" class="active">Transparente</button><button data-bg="white">Branco</button><button data-bg="black">Preto</button></div><div class="preview-dims">${a.width||'?'} × ${a.height||'?'} px • ${a.dpi||300} DPI</div></div><div class="modal-footer spread"><button class="btn" id="previewImage">Salvar como imagem</button><button class="btn primary" id="previewDownload">${icon('download')} Baixar PNG</button></div></div>`;document.body.appendChild(m);$('.close',m).onclick=()=>m.remove();
  $$('#previewBg button',m).forEach(b=>b.onclick=()=>{$$('#previewBg button',m).forEach(x=>x.classList.toggle('active',x===b));const p=$('#largePreview',m);p.classList.remove('check','white','black');p.classList.add(b.dataset.bg);});
  $('#previewDownload',m).onclick=()=>downloadAsset(a);$('#previewImage',m).onclick=()=>saveImageAsset(a);
  attachAssetStudioActions($('.preview-controls',m),a,assetStudioHandlers(()=>m.remove()));
}
function openAssetActions(a){
  if(!a)return;const m=document.createElement('div');m.className='modal-backdrop';m.innerHTML=`<div class="modal compact"><div class="modal-head"><div><div class="eyebrow">Editar arquivo</div><h2>${escapeHTML(a.name)}</h2></div><button class="btn ghost small close">×</button></div><div class="form-grid"><div class="field full"><label>Nome da arte / arquivo</label><input id="renameAsset" value="${escapeHTML(a.name)}"></div><div class="field"><label>Tipo</label><select id="assetType"><option value="arte" ${a.asset_type==='arte'?'selected':''}>Arte</option><option value="mockup" ${a.asset_type==='mockup'?'selected':''}>Mockup</option><option value="outro" ${a.asset_type==='outro'?'selected':''}>Outro</option></select></div><div class="field"><label>Pasta / projeto</label><select id="assetFolder"><option value="">Sem pasta</option>${folderOptionHTML(currentFolders,a.folder_id||'')}</select></div></div>${a.asset_type==='arte'?`<div class="production-size-callout"><div><b>Medida física para produção</b><span>Cadastre largura/altura, proporção e informe se é halftone.</span></div><button class="btn primary" id="assetProductionSize">Definir / editar medida</button></div>`:''}<div class="file-actions"><button class="btn" id="assetDownload">${icon('download')} Baixar PNG</button><button class="btn" id="assetSaveImage">Salvar como imagem</button><button class="btn" id="assetPreview">Visualizar</button></div><div class="modal-footer"><button class="btn danger" id="deleteAsset">${icon('trash')} Excluir</button><div class="spacer"></div><button class="btn primary" id="saveAsset">Salvar alterações</button></div></div>`;document.body.appendChild(m);$('.close',m).onclick=()=>m.remove();
  $('#assetDownload',m).onclick=()=>downloadAsset(a);$('#assetSaveImage',m).onclick=()=>saveImageAsset(a);$('#assetPreview',m).onclick=()=>openAssetPreview(a);$('#assetProductionSize',m)?.addEventListener('click',()=>{m.remove();productionModule.openPrintProfile(a)});
  attachAssetStudioActions($('.file-actions',m),a,assetStudioHandlers(()=>m.remove()));
  $('#saveAsset',m).onclick=async()=>{const name=$('#renameAsset',m).value.trim();if(!name)return toast('Digite um nome para o arquivo.','err');const {error}=await supabase.from('z19p_assets').update({name,asset_type:$('#assetType',m).value,folder_id:$('#assetFolder',m).value||null}).eq('id',a.id);if(error)return toast(error.message,'err');m.remove();toast('Arquivo atualizado.','ok');renderWorkspace(currentWorkspace.id);};
  $('#deleteAsset',m).onclick=async()=>{if(!confirm(`Excluir “${a.name}” definitivamente?`))return;const {error}=await supabase.from('z19p_assets').delete().eq('id',a.id);if(error)return toast(error.code==='23503'?'Esta arte está vinculada a um filme salvo e deve ser preservada.':error.message,'err');const paths=[...new Set([a.original_path,a.processed_path].filter(Boolean))];if(paths.length){const {error:se}=await supabase.storage.from(BUCKET).remove(paths);if(se)toast('Cadastro excluído; o arquivo foi preservado no armazenamento por falha na limpeza.','err')}m.remove();toast('Arquivo excluído.','ok');renderWorkspace(currentWorkspace.id);};
}

function openUploadModal({presetType='arte'}={}){
  if(presetType==='arte'&&currentWorkspace?.workspace_type==='client'&&!clientUploadWithoutOrderEnabled&&!workspaceHasOfficialOrder(currentWorkspace.id)){
    toast('Este cliente ainda não possui pedido oficial. Ative “Permitir subir arte em cliente sem pedido” em Configurações para liberar temporariamente.','err');return;
  }
  uploadQueue=[];const isMockupMode=presetType==='mockup';const m=document.createElement('div');m.className='modal-backdrop';m.innerHTML=`<div class="modal wide upload-modal"><div class="modal-head"><div><div class="eyebrow">${isMockupMode?'Mockup do projeto':'Preparar para produção'}</div><h2>${isMockupMode?'Adicionar mockup':'Subir arte'}</h2></div><button class="btn ghost small close">×</button></div><div class="dropzone" id="dropzone"><div class="dz-icon">⇧</div><h3>${isMockupMode?'Selecione um ou vários mockups':'Selecione uma ou várias artes'}</h3><p>PNG, JPG ou WEBP. O nome original do arquivo não será usado como nome da arte.</p><input id="fileInput" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden><button class="btn primary" id="chooseFiles" style="margin-top:12px">Escolher arquivos</button></div>${isMockupMode?'':`<div class="upload-required-bar"><div><b>Organização obrigatória</b><small>Antes de salvar cada arte, informe um nome claro e escolha uma pasta.</small></div><button class="btn small" id="uploadCreateFolder" type="button">${icon('plus')} Criar pasta</button></div>`}<div id="uploadList" class="upload-list"></div>${isMockupMode?'':`<div class="process-card"><div class="process-title"><div><b>Tratamento da arte</b><span>Configurações simples para o arquivo final.</span></div></div><label class="option minimal"><input type="checkbox" id="optTrim" checked><div><b>Remover prancheta transparente</b><span>Encontra o limite real dos pixels visíveis sem cortar a borda da arte.</span></div></label><div class="quality-row"><div><b>Qualidade / dimensão máxima</b><span>Nunca reduz o arquivo original. Só amplia quando necessário.</span></div><select id="qualityPreset"><option value="original">Original — sem ampliar</option><option value="alta">Alta — até 4032 px</option><option value="ultra" selected>Ultra — até 6000 px</option><option value="maxima">Máxima — até 8192 px</option></select></div></div>`}<div class="hint quality-hint">Saída de arte: PNG transparente, 300 DPI, sem redução do original. Ampliação usa interpolação de alta qualidade; ela preserva e suaviza melhor, mas não cria detalhes que não existiam na imagem de origem.</div><div class="progress hidden" id="progress"><div></div></div><div id="progressText" class="hint" style="margin-top:7px"></div><div class="modal-footer"><button class="btn close" type="button">Cancelar</button><button class="btn primary" id="processUpload" disabled>${isMockupMode?'Salvar mockup':'Processar e salvar'}</button></div></div>`;document.body.appendChild(m);$$('.close',m).forEach(b=>b.onclick=()=>m.remove());
  const input=$('#fileInput',m),dz=$('#dropzone',m);$('#chooseFiles',m).onclick=()=>input.click();input.onchange=()=>addFiles([...input.files]);dz.ondragover=e=>{e.preventDefault();dz.classList.add('drag')};dz.ondragleave=()=>dz.classList.remove('drag');dz.ondrop=e=>{e.preventDefault();dz.classList.remove('drag');addFiles([...e.dataTransfer.files].filter(f=>f.type.startsWith('image/')))};
  $('#uploadCreateFolder',m)?.addEventListener('click',async()=>{try{const name=prompt('Nome da nova pasta:');if(!name?.trim())return;const projectId=currentWorkspace?.workspace_type==='client'?(currentProjects[0]?.id||null):null,folder={id:crypto.randomUUID(),owner_id:accountOwnerId(),workspace_id:currentWorkspace.id,project_id:projectId,parent_id:null,name:name.trim(),sort_order:(currentFolders.length+1)*10,created_by:session.user.id,updated_by:session.user.id};const {error}=await supabase.from('z19p_folders').insert(folder);if(error)throw error;currentFolders=[...currentFolders,folder];for(const item of uploadQueue)if(item.type==='arte'&&!item.folderId)item.folderId=folder.id;renderUploadList(m,{lockedType:isMockupMode});toast('Pasta criada e selecionada.','ok')}catch(error){console.error(error);toast(error.message||'Não foi possível criar a pasta.','err')}});
  function addFiles(files){for(const f of files)uploadQueue.push({file:f,name:'',type:presetType,folderId:'',readyForPrint:false,preview:URL.createObjectURL(f)});renderUploadList(m,{lockedType:isMockupMode});setTimeout(()=>$('#uploadList input[data-k="name"]',m)?.focus(),0);}
  $('#processUpload',m).onclick=()=>processQueue(m,{mockupMode:isMockupMode});
}
function renderUploadList(m,{lockedType=false}={}){
  const list=$('#uploadList',m);list.innerHTML=uploadQueue.map((q,i)=>{const autoReady=q.type==='arte'&&Boolean(productionModule?.folderInReadyTree(q.folderId||null));if(autoReady)q.readyForPrint=true;return `<div class="upload-row clean-upload ${q.type==='arte'?'has-ready':''}"><img class="upload-thumb" src="${q.preview}"><div class="upload-name"><label>Nome</label><input data-i="${i}" data-k="name" value="${escapeHTML(q.name)}" placeholder="Nome da arte"></div>${lockedType?'':`<div><label>Tipo</label><select data-i="${i}" data-k="type"><option value="arte" ${q.type==='arte'?'selected':''}>Arte</option><option value="mockup" ${q.type==='mockup'?'selected':''}>Mockup</option><option value="outro" ${q.type==='outro'?'selected':''}>Outro</option></select></div>`}<div><label>Pasta${q.type==='arte'?' *':''}</label><select data-i="${i}" data-k="folderId"><option value="">${q.type==='arte'?'Escolha uma pasta':'Sem pasta'}</option>${folderOptionHTML(currentFolders,q.folderId||'')}</select></div>${q.type==='arte'?`<label class="upload-ready-switch ${autoReady?'automatic':''}"><span class="switch"><input type="checkbox" data-ready="${i}" ${q.readyForPrint?'checked':''} ${autoReady?'disabled':''}><span></span></span><span><b>Arte pronta para impressão</b><small>${autoReady?'Ativada automaticamente pela pasta Artes prontas.':'Ative para informar medida e liberar no Montar Filme.'}</small></span></label>`:''}<button class="remove-upload" data-remove="${i}" title="Remover">×</button></div>`}).join('');
  $$('[data-i][data-k]',list).forEach(el=>{const update=()=>{const q=uploadQueue[+el.dataset.i],oldFolder=q.folderId;q[el.dataset.k]=el.value;if(el.dataset.k==='type'&&q.type!=='arte')q.readyForPrint=false;if(el.dataset.k==='type'&&q.type==='arte'&&productionModule?.folderInReadyTree(q.folderId||null))q.readyForPrint=true;if(el.dataset.k==='folderId'){const wasReady=productionModule?.folderInReadyTree(oldFolder||null),isReady=productionModule?.folderInReadyTree(q.folderId||null);if(isReady)q.readyForPrint=true;else if(wasReady)q.readyForPrint=false}if(el.dataset.k!=='name')renderUploadList(m,{lockedType});else{const complete=uploadQueue.length&&uploadQueue.every(item=>item.name.trim()&&(item.type!=='arte'||item.folderId));$('#processUpload',m).disabled=!complete}};el.dataset.k==='name'?el.addEventListener('input',update):el.addEventListener('change',update)});$$('[data-ready]',list).forEach(el=>el.onchange=()=>{uploadQueue[+el.dataset.ready].readyForPrint=el.checked});$$('[data-remove]',list).forEach(b=>b.onclick=()=>{const q=uploadQueue.splice(+b.dataset.remove,1)[0];if(q?.preview)URL.revokeObjectURL(q.preview);renderUploadList(m,{lockedType});});const complete=uploadQueue.length&&uploadQueue.every(q=>q.name.trim()&&(q.type!=='arte'||q.folderId));$('#processUpload',m).disabled=!complete;
}

async function processQueue(m,{mockupMode=false}={}){
  if(!uploadQueue.length)return;
  if(uploadQueue.some(q=>!q.name.trim()))return toast('Dê um nome claro para cada arquivo antes de salvar.','err');
  if(uploadQueue.some(q=>q.type==='arte'&&!q.folderId))return toast('Escolha uma pasta para cada arte antes de salvar.','err');
  if(!mockupMode&&currentWorkspace?.workspace_type==='client'&&!clientUploadWithoutOrderEnabled&&!workspaceHasOfficialOrder(currentWorkspace.id))return toast('Este cliente ainda não possui pedido oficial. Libere temporariamente em Configurações ou sincronize o pedido.','err');
  const trim=mockupMode?false:$('#optTrim',m).checked,quality=mockupMode?'original':($('#qualityPreset',m)?.value||DEFAULT_QUALITY),btn=$('#processUpload',m),prog=$('#progress',m),status=$('#progressText',m);
  btn.disabled=true;prog.classList.remove('hidden');let done=0;const savedAssets=[],uploadWorkspace=currentWorkspace,uploadProjects=[...currentProjects],queue=[...uploadQueue];
  const stage=text=>{if(status?.isConnected)status.textContent=text};
  for(const q of queue){
    try{
      stage(`${mockupMode?'Salvando':'Processando'} ${done+1}/${queue.length}: ${q.name}`);
      const isMockup=q.type==='mockup',doTrim=isMockup?false:trim,qualityTarget=isMockup?0:(QUALITY_PRESETS[quality]||0);
      const result=await processImage(q.file,{trim:doTrim,targetMax:qualityTarget,onStage:text=>stage(`${done+1}/${queue.length} · ${text}`)});
      const assetId=crypto.randomUUID(),base=`${session.user.id}/${uploadWorkspace.id}/${q.folderId||'root'}/${assetId}`,ext=(q.file.name.split('.').pop()||'bin').toLowerCase(),originalPath=`${base}/original.${ext}`,processedPath=`${base}/processed.png`;
      stage(`${done+1}/${queue.length} · Enviando arquivo original…`);
      let up=await supabase.storage.from(BUCKET).upload(originalPath,q.file,{contentType:q.file.type||'application/octet-stream',upsert:false});if(up.error)throw up.error;
      stage(`${done+1}/${queue.length} · Enviando PNG final…`);
      up=await supabase.storage.from(BUCKET).upload(processedPath,result.blob,{contentType:'image/png',upsert:false});if(up.error)throw up.error;
      stage(`${done+1}/${queue.length} · Salvando no cliente…`);
      const assetRow={id:assetId,owner_id:accountOwnerId(),workspace_id:uploadWorkspace.id,folder_id:q.folderId||null,name:q.name.trim(),asset_type:q.type,original_path:originalPath,processed_path:processedPath,mime_type:'image/png',size_bytes:result.blob.size,width:result.width,height:result.height,dpi:300,alpha_trimmed:doTrim,background_removed:false,maximized:result.upscaled,metadata:{source_name:q.file.name,source_size:q.file.size,source_width:result.sourceWidth,source_height:result.sourceHeight,quality_preset:quality,quality_target:qualityTarget||null,upscaled:result.upscaled,processing_engine:result.engine||'native'}};
      const {data:savedAsset,error}=await supabase.from('z19p_assets').insert(assetRow).select('*').single();if(error)throw error;savedAssets.push(savedAsset||assetRow);
      done++;prog.firstElementChild.style.width=`${Math.round(done/queue.length*100)}%`;
    }catch(err){
      console.error('upload artwork',err);toast(`Erro em ${q.name}: ${err.message||err}`,'err');
    }
  }
  if(!done){
    stage('Não foi possível concluir o arquivo. Tente novamente; nenhuma arte nova foi salva.');
    btn.disabled=false;return;
  }
  stage(`Concluído: ${done} de ${queue.length}. Abrindo tamanho e posição…`);
  uploadQueue.forEach(q=>q.preview&&URL.revokeObjectURL(q.preview));uploadQueue=[];m.remove();
  try{
    if(savedAssets.length&&officialOrders&&uploadWorkspace?.id){
      await officialOrders.offerAfterUpload(savedAssets,{workspace:uploadWorkspace,projects:uploadProjects,allowWithoutOrder:clientUploadWithoutOrderEnabled});
    }
  }catch(error){
    console.error('placement after upload',error);toast((error.message||'Arte salva, mas não foi possível abrir tamanho e posição.')+' A arte continua salva no cliente.','err');
  }
  if(currentWorkspace?.id===uploadWorkspace?.id&&!document.querySelector('.official-placement-backdrop'))await renderWorkspace(uploadWorkspace.id);
}

async function processImage(file,{trim,targetMax=0,onStage=()=>{}}={}){
  onStage('Lendo imagem…');
  const bmp=await createImageBitmap(file);let source=document.createElement('canvas');source.width=bmp.width;source.height=bmp.height;const sourceCtx=source.getContext('2d',{willReadFrequently:true,alpha:true});if(!sourceCtx){bmp.close?.();throw new Error('Não foi possível preparar a imagem neste aparelho.')}sourceCtx.drawImage(bmp,0,0);const sourceWidth=bmp.width,sourceHeight=bmp.height;bmp.close?.();
  if(trim){onStage('Removendo prancheta transparente…');source=trimTransparentSafe(source);}
  const workingWidth=source.width,workingHeight=source.height;let out=source,upscaled=false,engine='original',outputWidth=workingWidth,outputHeight=workingHeight;
  if(targetMax>0&&Math.max(workingWidth,workingHeight)<targetMax){
    const scale=targetMax/Math.max(workingWidth,workingHeight),w=Math.max(1,Math.round(workingWidth*scale)),h=Math.max(1,Math.round(workingHeight*scale)),touchDevice=(navigator.maxTouchPoints||0)>1||/iPhone|iPad|iPod|Android/i.test(navigator.userAgent||'');
    outputWidth=w;outputHeight=h;onStage(`Ajustando qualidade para ${Math.max(w,h)} px…`);
    out=document.createElement('canvas');out.width=w;out.height=h;
    const nativeResize=touchDevice||targetMax>=6000||(workingWidth*workingHeight)>12000000;
    if(nativeResize){
      const g=out.getContext('2d',{alpha:true});if(!g)throw new Error('Memória insuficiente para ampliar esta imagem.');g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(source,0,0,w,h);engine=touchDevice?'native-mobile':'native-large';
    }else{
      try{
        await Promise.race([
          pica.resize(source,out,{quality:3,alpha:true,unsharpAmount:50,unsharpRadius:.55,unsharpThreshold:2}),
          new Promise((_,reject)=>setTimeout(()=>reject(new Error('Redimensionamento demorou demais.')),15000))
        ]);
        engine='pica';
      }catch(error){
        console.warn('pica resize fallback',error);const g=out.getContext('2d',{alpha:true});if(!g)throw error;g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(source,0,0,w,h);engine='native-fallback';
      }
    }
    upscaled=true;
  }
  onStage('Gerando PNG transparente 300 DPI…');
  const raw=await new Promise((resolve,reject)=>{let settled=false;const timer=setTimeout(()=>{if(!settled){settled=true;reject(new Error('A geração do PNG demorou demais. Tente novamente ou use “Original — sem ampliar”.'))}},30000);out.toBlob(b=>{if(settled)return;settled=true;clearTimeout(timer);b?resolve(b):reject(new Error('O navegador não conseguiu finalizar o PNG. Tente “Original — sem ampliar” para este arquivo.'))},'image/png',1)});
  const blob=await setPngDpi(raw,300);
  if(out!==source){out.width=out.height=1}source.width=source.height=1;
  return{blob,width:outputWidth,height:outputHeight,sourceWidth,sourceHeight,upscaled,engine};
}

function trimTransparentSafe(canvas){
  const ctx=canvas.getContext('2d',{willReadFrequently:true}),w=canvas.width,h=canvas.height,data=ctx.getImageData(0,0,w,h).data;
  const rowVisible=y=>{for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>=2)return true;return false};
  const colVisible=x=>{for(let y=0;y<h;y++)if(data[(y*w+x)*4+3]>=2)return true;return false};
  let top=0,bottom=h-1,left=0,right=w-1;while(top<h&&!rowVisible(top))top++;while(bottom>=top&&!rowVisible(bottom))bottom--;while(left<w&&!colVisible(left))left++;while(right>=left&&!colVisible(right))right--;
  if(top>bottom||left>right)return canvas;
  // Protege a antialiasação: inclui imediatamente qualquer pixel semi-transparente encostado no limite detectado.
  while(top>0&&edgeHasAlphaRow(top-1,left,right))top--;while(bottom<h-1&&edgeHasAlphaRow(bottom+1,left,right))bottom++;while(left>0&&edgeHasAlphaCol(left-1,top,bottom))left--;while(right<w-1&&edgeHasAlphaCol(right+1,top,bottom))right++;
  const nw=right-left+1,nh=bottom-top+1;if(nw===w&&nh===h)return canvas;const out=document.createElement('canvas');out.width=nw;out.height=nh;out.getContext('2d',{alpha:true}).drawImage(canvas,left,top,nw,nh,0,0,nw,nh);return out;
  function edgeHasAlphaRow(y,x1,x2){for(let x=x1;x<=x2;x++)if(data[(y*w+x)*4+3]>0)return true;return false}
  function edgeHasAlphaCol(x,y1,y2){for(let y=y1;y<=y2;y++)if(data[(y*w+x)*4+3]>0)return true;return false}
}

async function setPngDpi(blob,dpi){
  const bytes=new Uint8Array(await blob.arrayBuffer());if(bytes.length<33)return blob;const ppm=Math.round(dpi/0.0254);const data=new Uint8Array(9);const dv=new DataView(data.buffer);dv.setUint32(0,ppm);dv.setUint32(4,ppm);data[8]=1;const type=new TextEncoder().encode('pHYs');const crcInput=new Uint8Array(type.length+data.length);crcInput.set(type);crcInput.set(data,type.length);const chunk=new Uint8Array(4+4+9+4);new DataView(chunk.buffer).setUint32(0,9);chunk.set(type,4);chunk.set(data,8);new DataView(chunk.buffer).setUint32(17,crc32(crcInput));const out=new Uint8Array(bytes.length+chunk.length);out.set(bytes.slice(0,33),0);out.set(chunk,33);out.set(bytes.slice(33),33+chunk.length);return new Blob([out],{type:'image/png'});
}
function crc32(buf){let table=crc32.table;if(!table){table=crc32.table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}}let c=0xffffffff;for(const b of buf)c=table[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}

function renderPublicQuotes(quotes){
  if(quotes?.some(q=>q.service_type))return quotes.map(q=>q.service_type?renderPublicServiceQuote(q):renderPublicQuotes([q])).join('');
  if(!quotes?.length)return '';
  return `<section class="client-quotes"><div class="public-section-head"><div><div class="eyebrow">Orçamento</div><h2>Seu orçamento</h2></div></div>${quotes.map(q=>`<article class="client-quote-card"><div class="client-quote-head"><div><h3>${escapeHTML(q.title||'Orçamento')}</h3>${q.delivery_term?`<p>Prazo de entrega: <b>${escapeHTML(q.delivery_term)}</b></p>`:''}</div><div class="client-quote-total"><small>Total</small><b>${fmtMoney(quoteTotal(q))}</b></div></div><div class="client-quote-items">${(q.items||[]).map(i=>`<div class="client-quote-item"><div class="client-item-main"><div><b>${escapeHTML(i.product_name)}</b><small>${i.quantity} unidade(s)</small></div><strong>${fmtMoney(Math.max(1,parseInt(i.quantity)||1)*quoteItemUnit(i))}</strong></div>${i.pricing_mode==='piece_plus_print'?`<div class="client-price-detail"><span>Peça: ${fmtMoney(i.piece_price)}</span><span>Estampas: ${fmtMoney((i.prints||[]).reduce((s,p)=>s+moneyNumber(p.price),0))} / peça</span></div>`:`<div class="client-price-detail"><span>${fmtMoney(i.total_unit_price)} por peça, com personalização</span></div>`}${(i.prints||[]).length?`<div class="client-prints">${i.prints.map(p=>`<span>${escapeHTML(p.placement||'Estampa')}${p.width_cm?` • ${escapeHTML(String(p.width_cm))} cm de largura`:''}</span>`).join('')}</div>`:''}</div>`).join('')}</div>${q.notes?`<div class="client-quote-notes"><b>Observações</b><p>${escapeHTML(q.notes).replace(/\n/g,'<br>')}</p></div>`:''}</article>`).join('')}</section>`;
}
async function renderPublic(token){
  app.innerHTML=`<div class="public-shell"><div class="public-header"><div class="public-header-inner">${brandLogoHTML()}<div><h1>Carregando ambiente…</h1><p>019 Personalizações</p></div></div></div><div class="public-content"><div class="empty"><span class="loading"></span></div></div></div>`;
  const {data,error}=await supabase.rpc('z19p_get_public_workspace',{p_token:token});if(error||!data?.workspace)return app.innerHTML=`<div class="auth"><div class="auth-card"><div class="brand">${brandLogoHTML()}<div class="brand-title">019 Personalizações</div></div><h1>Link indisponível</h1><p>Esse ambiente não existe ou o compartilhamento foi desativado.</p></div></div>`;
  const w=data.workspace,assets=data.assets||[],folders=data.folders||[],quotes=data.quotes||[];const mockups=assets.filter(a=>a.asset_type==='mockup'),files=assets.filter(a=>a.asset_type!=='mockup'&&a.asset_type!=='video');
  app.innerHTML=`<div class="public-shell"><div class="public-header"><div class="public-header-inner">${brandLogoHTML()}<div class="public-company"><div class="eyebrow">Área do cliente</div><h1>${escapeHTML(w.company_name)}</h1><p>${escapeHTML(w.client_name||'Artes e personalizações')}</p>${w.status?statusPill(w.status):''}</div></div></div><div class="public-content">${renderPublicQuotes(quotes)}${mockups.length?`<section class="public-mockups"><div class="public-section-head"><div><div class="eyebrow">Mockup</div><h2>Como sua peça vai ficar</h2><p>Visual de referência do projeto.</p></div><div class="seg public-bg-control"><button data-bg="check" class="active">Transparente</button><button data-bg="white">Branco</button><button data-bg="black">Preto</button></div></div><div class="asset-grid public-mockup-grid">${renderPublicAssets(mockups,w.client_can_download)}</div></section>`:''}<section class="public-files"><div class="public-section-head"><div><div class="eyebrow">Arquivos</div><h2>Artes do projeto</h2><p>${files.length} arquivo(s) disponível(is)</p></div><div class="seg public-bg-control"><button data-bg="check" class="active">Transparente</button><button data-bg="white">Branco</button><button data-bg="black">Preto</button></div></div><div class="toolbar"><div class="search">${icon('search')}<input id="publicSearch" placeholder="Buscar arquivo..."></div><select class="btn" id="publicFolder"><option value="all">Todas as pastas</option><option value="root">Sem pasta</option>${folders.map(f=>`<option value="${f.id}">${escapeHTML(f.name)}</option>`).join('')}</select></div><div id="publicGrid" class="asset-grid">${renderPublicAssets(files,w.client_can_download)}</div></section></div></div>`;
  const bindBg=()=>{$$('.public-bg-control button').forEach(b=>b.onclick=()=>{const group=b.closest('.public-bg-control');$$('button',group).forEach(x=>x.classList.toggle('active',x===b));const section=b.closest('section');$$('.public-preview',section).forEach(p=>{p.classList.remove('white','black');if(b.dataset.bg!=='check')p.classList.add(b.dataset.bg);});});};
  const redraw=()=>{const q=($('#publicSearch')?.value||'').toLowerCase(),f=$('#publicFolder')?.value||'all';const list=files.filter(a=>a.name.toLowerCase().includes(q)&&(f==='all'||(f==='root'&&!a.folder_id)||a.folder_id===f));replacePreviewMarkup($('#publicGrid'),renderPublicAssets(list,w.client_can_download));bindPublicDownload();};$('#publicSearch')&&( $('#publicSearch').oninput=redraw);$('#publicFolder')&&($('#publicFolder').onchange=redraw);bindBg();bindPublicDownload();
}
function renderPublicAssets(items,canDownload){if(!items.length)return `<div class="empty" style="grid-column:1/-1">Nenhum arquivo nesta pasta.</div>`;return items.map(a=>`<article class="asset-card"><div class="preview-wrap public-preview"><span class="badge">${a.asset_type==='mockup'?'MOCKUP':'ARTE'}</span><img loading="lazy" decoding="async" src="${publicUrl(assetPreviewPath(a))}" alt="${escapeHTML(a.name)}"></div><div class="asset-body"><h4>${escapeHTML(a.name)}</h4><div class="asset-meta"><span>${a.width||'?'}×${a.height||'?'}</span><span>${a.dpi||300} DPI</span></div>${canDownload?`<div class="asset-actions"><button class="btn small public-download" data-path="${escapeHTML(a.processed_path||a.original_path)}" data-name="${escapeHTML(a.name)}">${icon('download')} Baixar PNG</button></div>`:''}</div></article>`).join('');}
function applyPublicBg(bg){$$('.public-preview').forEach(p=>{p.classList.remove('white','black');if(bg!=='check')p.classList.add(bg);});}
function bindPublicDownload(){$$('.public-download').forEach(b=>b.onclick=()=>forceDownload(b.dataset.path,b.dataset.name));}

/* === 019 TEAM / CRM / PRODUTIVIDADE === */
let currentProfile=null, teamProfiles=[], currentProjects=[], auditEntries=[];
let accountContextEpoch=0,teamContextPending=null,routeAccessCheck=null;
let myCommissionSummary={enabled:false,pending:0,approved:0,paid:0,rejected:0},myCommissionRules=[],commissionTiers=[];
const accountOwnerId=()=>currentProfile?.id===session?.user?.id?(currentProfile?.account_owner_id||session?.user?.id||null):session?.user?.id||null;
const profileById=id=>teamProfiles.find(p=>p.id===id)||null;
const profileName=id=>profileById(id)?.full_name||'Não definido';
const isAdmin=()=>Boolean(session?.user?.id&&currentProfile?.id===session.user.id&&currentProfile?.active&&currentProfile?.role==='admin');
const canViewProductionCosts=()=>Boolean(isAdmin()&&session.user.id===accountOwnerId());
const norm=s=>String(s||'').trim().toLocaleLowerCase('pt-BR');
const isDesistedStatus=s=>['desistiu','cliente desistiu'].includes(norm(s?.name));
const isRemarcadoStatus=s=>norm(s?.name)==='remarcado';
const isTerminalStatus=s=>isFinalizedStatus(s)||isDesistedStatus(s);
const nowISO=()=>new Date().toISOString();
const BRAZIL_STATES=['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const stateOptions=value=>`<option value="">Não informado</option>`+BRAZIL_STATES.map(uf=>`<option value="${uf}" ${uf===String(value||'').toUpperCase()?'selected':''}>${uf}</option>`).join('');
const clientKey=w=>normalizeWaPhone(w?.phone)||norm(w?.client_name)||norm(w?.company_name)||w?.id;
const uniqueClients=list=>new Set((list||[]).map(clientKey).filter(Boolean)).size;

async function loadCommissionContext(){
  const stillCurrent=accountReadGuard();
  myCommissionSummary={enabled:false,pending:0,approved:0,paid:0,rejected:0};myCommissionRules=[];commissionTiers=[];garmentStudioEnabled=false;garmentFeatureOwner=null;
  if(!session?.user?.id)return myCommissionSummary;
  const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),15000);
  try{
    const [{data:summary,error:summaryError},{data:rules,error:rulesError},{data:tiers,error:tiersError}]=await Promise.all([
      supabase.rpc('z19p_get_my_commission_summary').abortSignal(controller.signal),
      supabase.from('z19p_commission_rules').select('*').eq('seller_user_id',session.user.id).eq('active',true).abortSignal(controller.signal),
      supabase.from('z19p_price_tiers').select('*').eq('active',true).order('min_qty',{ascending:false}).abortSignal(controller.signal)
    ]);
    if(!stillCurrent())return;
    if(summaryError||rulesError||tiersError)throw summaryError||rulesError||tiersError;
    myCommissionSummary={...myCommissionSummary,...(summary||{})};
    if(!rulesError)myCommissionRules=rules||[];
    if(!tiersError)commissionTiers=tiers||[];
  }catch(error){if(stillCurrent()){
    myCommissionSummary={enabled:false,unavailable:true,pending:null,approved:null,paid:null,rejected:null};myCommissionRules=[];commissionTiers=[];
    toast(controller.signal.aborted?'A consulta de comissões excedeu 15 segundos. Os valores estão indisponíveis; tente novamente.':'Não foi possível carregar as comissões. Os valores estão indisponíveis; tente novamente.','err');
    console.warn('commission context',{kind:controller.signal.aborted?'timeout':'read-error'});
  }}finally{clearTimeout(deadline)}
  return myCommissionSummary;
}

function commissionPreviewForDraft(draft){
  if(isAdmin()||!myCommissionSummary.enabled||!session?.user?.id)return null;
  const expectedSeller=currentWorkspace?.responsible_user_id||session.user.id;
  if(expectedSeller!==session.user.id)return null;
  let amount=0,matched=0;
  for(const item of draft?.items||[]){
    const quantity=Math.max(1,parseInt(item.quantity)||1);
    const tier=commissionTiers.find(t=>Number(t.min_qty)<=quantity&&(t.max_qty==null||quantity<=Number(t.max_qty)));
    const rule=tier&&myCommissionRules.find(r=>r.tier_id===tier.id&&r.active!==false);
    if(!rule)continue;
    const breakdown=quoteBreakdownFromItems([item]);
    if(rule.basis==='product')amount+=breakdown.shirt*moneyNumber(rule.product_percent)/100;
    else if(rule.basis==='print')amount+=breakdown.print*moneyNumber(rule.print_percent)/100;
    else if(rule.basis==='split')amount+=breakdown.shirt*moneyNumber(rule.product_percent)/100+breakdown.print*moneyNumber(rule.print_percent)/100;
    else amount+=breakdown.total*moneyNumber(rule.total_percent)/100;
    matched++;
  }
  return {amount,matched};
}

function quoteCommissionPreviewHTML(draft){
  const preview=commissionPreviewForDraft(draft);if(!preview)return '';
  return `<div class="quote-commission-preview"><span><small>Sua comissão estimada</small><b id="quoteCommissionPreviewAmount">${fmtMoney(preview.amount)}</b></span><p>${preview.matched?'Valor previsto se o orçamento for aprovado e pago.':'Ainda não existe uma regra de comissão para esta quantidade.'}</p></div>`;
}

function clearAccountContext(){
  window.dispatchEvent(new Event('z19:account-changing'));
  accountContextEpoch++;teamContextPending=null;routeAccessCheck=null;currentProfile=null;teamProfiles=[];workspaces=[];currentWorkspace=null;currentProjects=[];currentAssets=[];currentFolders=[];currentQuotes=[];auditEntries=[];statuses=[];products=[];folderTemplates=[];libraryWorkspaces={};
  myCommissionSummary={enabled:false,pending:0,approved:0,paid:0,rejected:0};myCommissionRules=[];commissionTiers=[];
  productionCosts?.destroy?.();productionCosts=null;productionCostOwner=null;projectAdvisor?.invalidate();productionModule?.resetAccountState?.();
  if(dashboardAgingTimer){clearInterval(dashboardAgingTimer);dashboardAgingTimer=null}
  document.querySelectorAll('.modal-backdrop,.art-studio-backdrop,.garment-library-backdrop').forEach(node=>node.remove());document.body.style.overflow='';
}
function accountReadGuard(includeRoute=false){
  const userId=session?.user?.id,epoch=accountContextEpoch,path=includeRoute?route():null;
  return ()=>userId===session?.user?.id&&epoch===accountContextEpoch&&(!includeRoute||path===route());
}
function renderPublicServiceQuote(quote){
  const totals=serviceBreakdown(quote.items),service=QUOTE_SERVICES[quote.service_type];
  return `<section class="client-quotes"><article class="client-quote-card"><div class="client-quote-head"><div><h3>${escapeHTML(quote.title||'Orçamento')}</h3><p>${escapeHTML(service?.label||'Serviço personalizado')}${quote.delivery_date?` • Entrega: ${fmtDate(quote.delivery_date+'T12:00:00')}`:''}</p></div><div class="client-quote-total"><small>Total</small><b>${fmtMoney(quoteTotal(quote))}</b></div></div><div class="client-quote-items">${(quote.items||[]).map(item=>`<div class="client-quote-item"><div class="client-item-main"><div><b>${escapeHTML(item.product_name)}</b><small>${escapeHTML(QUOTE_ITEM_LABELS[item.item_kind]||'Item')} • ${item.quantity} unidade(s)</small></div><strong>${fmtMoney(Number(item.quantity)*quoteItemUnit(item))}</strong></div><div class="client-price-detail"><span>${fmtMoney(quoteItemUnit(item))} por unidade${item.item_kind==='removal'&&quoteItemUnit(item)===0?' • Remoção gratuita':''}</span></div></div>`).join('')}</div><div class="client-price-detail">${Object.keys(QUOTE_ITEM_LABELS).filter(kind=>(quote.items||[]).some(item=>item.item_kind===kind)).map(kind=>`<span>${QUOTE_ITEM_LABELS[kind]}: ${fmtMoney(totals[kind])}</span>`).join('')}</div>${quote.notes?`<div class="client-quote-notes"><b>Observações</b><p>${escapeHTML(quote.notes).replace(/\n/g,'<br>')}</p></div>`:''}</article></section>`;
}
async function loadTeamContext({reuseRoute=false}={}){
  const userId=session?.user?.id,epoch=accountContextEpoch;
  if(!userId){currentProfile=null;teamProfiles=[];return false}
  const access=reuseRoute&&routeAccessCheck?.userId===userId&&routeAccessCheck.epoch===epoch&&routeAccessCheck.path===route()?routeAccessCheck:null;
  if(access?.confirmed&&currentProfile?.id===userId&&currentProfile.active)return true;
  if(!reuseRoute&&routeAccessCheck)routeAccessCheck.confirmed=false;
  if(teamContextPending?.userId===userId&&teamContextPending.epoch===epoch)return teamContextPending.promise;
  const pending={userId,epoch,promise:null},stillCurrent=()=>session?.user?.id===userId&&accountContextEpoch===epoch;
  pending.promise=(async()=>{
    try{
      const {data:p,error}=await supabase.from('z19p_profiles').select('*').eq('id',userId).maybeSingle();
      if(!stillCurrent())return false;
      if(error||!p){currentProfile=null;teamProfiles=[];if(error)console.error(error);toast(error?'Não foi possível confirmar seu acesso. Tente novamente.':'Seu perfil interno ainda não foi configurado.','err');return false}
      if(!p.active){currentProfile=null;teamProfiles=[];await supabase.auth.signOut();toast('Este acesso está desativado.','err');return false}
      const result=await supabase.from('z19p_profiles').select('*').eq('account_owner_id',p.account_owner_id).order('full_name');
      if(!stillCurrent())return false;currentProfile=p;teamProfiles=result.data||[p];
      const loginKey=`z19p_login_${userId}_${session.access_token?.slice(-8)||'s'}`;
      try{if(!sessionStorage.getItem(loginKey)){sessionStorage.setItem(loginKey,'1');void supabase.rpc('z19p_mark_login').then(()=>{},()=>{})}}catch{}
      if(access&&routeAccessCheck===access&&access.path===route())access.confirmed=true;
      return true;
    }catch(error){if(stillCurrent()){currentProfile=null;teamProfiles=[];console.error(error)}return false}
    finally{if(teamContextPending===pending)teamContextPending=null}
  })();teamContextPending=pending;return pending.promise;
}
async function logEvent(action,description,{workspaceId=null,projectId=null,entityType=null,entityId=null,metadata={}}={}){
  try{await supabase.rpc('z19p_log_event',{p_action:action,p_description:description,p_workspace_id:workspaceId,p_project_id:projectId,p_entity_type:entityType,p_entity_id:entityId,p_metadata:metadata});}catch(e){console.warn('audit',e)}
}
function sellerBadge(w){
  const creator=profileById(w.created_by),resp=profileById(w.responsible_user_id);
  return `<div class="seller-lines"><span><i>Cadastrado por</i><b>${escapeHTML(creator?.full_name||'Equipe 019')}</b></span><span class="responsible"><i>Responsável</i><b>${escapeHTML(resp?.full_name||'Não definido')}</b></span></div>`;
}
function reminderInfo(w){
  const st=statusById(w?.status_id); if(!isRemarcadoStatus(st)||!w?.reminder_at)return null;
  const t=new Date(w.reminder_at).getTime(); if(!Number.isFinite(t))return null;
  const diff=t-Date.now(); const abs=Math.abs(diff);
  const totalH=Math.ceil(abs/3600000),days=Math.floor(totalH/24),hours=totalH%24;
  const label=days?`${days} ${days===1?'dia':'dias'}${hours?` e ${hours}h`:''}`:`${Math.max(1,totalH)}h`;
  return {due:diff<=0,label:diff<=0?`Retorno vencido há ${label}`:`Retorno em ${label}`,date:new Date(t)};
}
workspaceStatusAttention = function(w){
  const st=statusById(w?.status_id); if(!st||isFinalizedStatus(st))return null;
  const rem=reminderInfo(w); if(rem)return rem.due?{ms:Date.now()-rem.date.getTime(),label:rem.label,changedAt:w.reminder_at,status:st,reminder:true}:null;
  const age=workspaceStatusDuration(w);if(!age||age.ms<STATUS_STALE_MS)return null;return age;
};

shell = function(content,{back=false}={}){
  const who=session&&currentProfile?`<div class="user-chip"><span>${escapeHTML((currentProfile.full_name||'U').slice(0,1).toUpperCase())}</span><div><b>${escapeHTML(currentProfile.full_name)}</b><small>${isAdmin()?'Administrador':'Equipe'}</small></div></div>`:'';
  const adminMenu=isAdmin()?`<div class="drawer-section"><small>Administração</small><a href="/comercial-admin.html">Gestão comercial</a><a href="/comercial-admin.html?tab=commissions">Comissões</a><button data-nav="/equipe">Equipe</button><button data-nav="/produtividade">Dashboard</button><button data-app-action="settings">Configurações</button></div>`:'';
  const current=route(),active=path=>current===path?'active':'';
  return `<div class="app-shell"><header class="topbar"><button class="nav-menu-trigger" type="button" data-drawer-open aria-label="Abrir menu" aria-controls="appDrawer">&#9776;</button>${back?`<button class="btn ghost small top-back" data-nav="/" aria-label="Voltar ao início">${icon('back')}</button>`:''}<div class="brand" data-nav="/" role="button" tabindex="0" aria-label="Ir para o início">${brandLogoHTML()}</div><div class="top-actions"><span class="app-version-badge" title="Versão do sistema">v${APP_VERSION}</span>${who}${session?`<button class="btn ghost small" id="logoutBtn">${icon('logout')} <span class="label">Sair</span></button>`:''}</div></header>
    <div class="app-drawer-backdrop" data-drawer-close></div><aside class="app-drawer" id="appDrawer" aria-hidden="true"><div class="drawer-head">${brandLogoHTML('drawer-logo')}<button type="button" data-drawer-close aria-label="Fechar menu">×</button></div><nav><div class="drawer-section"><small>Principal</small><button class="${active('/')}" data-nav="/">Clientes e empresas</button><button class="${active('/empresas-parceiras')}" data-nav="/empresas-parceiras">Empresas parceiras</button><button class="${active('/links')}" data-nav="/links">Links para compartilhar</button></div><div class="drawer-section"><small>Produção</small>${canViewProductionCosts()?`<button class="${active('/financeiro-impressao')}" data-nav="/financeiro-impressao">Financeiro de impressão · privado</button>`:''}${garmentStudioEnabled?`<button class="${active('/studio')}" data-nav="/studio">Estúdio de mockups</button>`:''}<button class="${active('/filme')}" data-nav="/filme">Montar filme DTF</button><button class="${active('/times')}" data-nav="/times">Times / Personalizações</button></div><div class="drawer-section"><small>Bibliotecas</small><button data-nav="/biblioteca/artes">Artes</button><button data-nav="/biblioteca/videos">Vídeos</button><button data-nav="/biblioteca/mockups">Mockups</button></div>${adminMenu}</nav><div class="drawer-user">${who}<span>v${APP_VERSION}</span></div></aside>
    ${content}
    <nav class="mobile-bottom-nav" aria-label="Navegação principal"><button data-drawer-open><i>&#9776;</i><span>Menu</span></button><button class="${active('/biblioteca/artes')}" data-nav="/biblioteca/artes"><i>A</i><span>Artes</span></button><button class="main ${active('/')}" data-nav="/"><i>019</i><span>Clientes</span></button><button class="${active('/biblioteca/videos')}" data-nav="/biblioteca/videos"><i>&#9654;</i><span>Vídeos</span></button>${garmentStudioEnabled?`<button class="${active('/studio')}" data-nav="/studio"><i>M</i><span>Estúdio</span></button>`:''}<button class="${active('/links')}" data-nav="/links"><i>&#8599;</i><span>Links</span></button></nav></div>`;
};

bindCommon = function(){
  document.body.classList.remove('drawer-open');
  const drawer=$('#appDrawer');
  const setDrawer=open=>{document.body.classList.toggle('drawer-open',open);drawer?.setAttribute('aria-hidden',open?'false':'true');};
  $$('[data-nav]').forEach(el=>{el.onclick=()=>{setDrawer(false);nav(el.dataset.nav);};if(el.getAttribute('role')==='button')el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setDrawer(false);nav(el.dataset.nav);}}});
  $$('[data-drawer-open]').forEach(el=>el.onclick=()=>setDrawer(true));
  $$('[data-drawer-close]').forEach(el=>el.onclick=()=>setDrawer(false));
  $$('[data-app-action="settings"]').forEach(el=>el.onclick=()=>{setDrawer(false);openSettingsModal();});
  $('#logoutBtn')?.addEventListener('click',signOutWithDraftGuard);
};

renderAuth = function(){
  app.innerHTML=`<div class="auth"><div class="auth-card"><div class="brand">${brandLogoHTML()}</div><h1>Entrar</h1><p>Acesse os ambientes, artes, clientes e sua fila de atendimento.</p><form id="authForm"><div class="field"><label>E-mail</label><input type="email" name="email" required autocomplete="email"></div><div class="field"><label>Senha</label><input type="password" name="password" required minlength="6" autocomplete="current-password"></div><button class="btn primary" type="submit">Entrar</button></form><div class="auth-switch">Primeiro acesso? Use o convite recebido por e-mail para definir sua senha.</div></div></div>`;
  $('#authForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget),btn=e.currentTarget.querySelector('button');btn.disabled=true;btn.innerHTML='<span class="loading"></span>';const res=await supabase.auth.signInWithPassword({email:fd.get('email'),password:fd.get('password')});btn.disabled=false;btn.textContent='Entrar';if(res.error)return toast(res.error.message,'err');session=res.data.session;await loadTeamContext();nav(route());};
};
function renderSetPassword(){
  app.innerHTML=`<div class="auth"><div class="auth-card"><div class="brand">${brandLogoHTML()}</div><h1>Definir sua senha</h1><p>Crie sua senha de acesso. Ela é pessoal e não fica visível para o administrador.</p><form id="firstPasswordForm"><div class="field"><label>Nova senha</label><input type="password" name="password" required minlength="6" autocomplete="new-password"></div><div class="field"><label>Confirmar senha</label><input type="password" name="confirm" required minlength="6" autocomplete="new-password"></div><button class="btn primary">Salvar senha e entrar</button></form></div></div>`;
  $('#firstPasswordForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);if(fd.get('password')!==fd.get('confirm'))return toast('As senhas não são iguais.','err');const {error}=await supabase.auth.updateUser({password:fd.get('password')});if(error)return toast(error.message,'err');await supabase.rpc('z19p_complete_first_access');await logEvent('first_access','Definiu a senha no primeiro acesso',{entityType:'profile',entityId:session.user.id});history.replaceState({},'',location.pathname+'#/');nav('/');};
}

renderRoute = async function(){
  if(dashboardAgingTimer){clearInterval(dashboardAgingTimer);dashboardAgingTimer=null;}
  const r=route(); if(r.startsWith('/cliente/'))return renderPublic(r.split('/')[2]);
  if(!session)return renderAuth();
  const stillCurrent=accountReadGuard(true);if(!await loadTeamContext({reuseRoute:true})||!stillCurrent())return;
  const qs=new URLSearchParams(location.search);if(qs.get('first_access')==='1'||qs.get('reset_password')==='1')return renderSetPassword();
  if(r==='/equipe')return renderTeamAdmin();
  if(r==='/produtividade')return renderProductivity();
  if(r==='/links')return renderShareLinks();
  if(r.startsWith('/biblioteca/'))return renderLibrary(r.split('/')[2]);
  if(r.startsWith('/ambiente/'))return renderWorkspace(r.split('/')[2]);
  return renderDashboard();
};

ensureDefaults = async function(){
  if(!session?.user?.id)return; if(!currentProfile&&!await loadTeamContext())return; const uid=accountOwnerId(),epoch=accountContextEpoch;
  const counts=await Promise.all([
    supabase.from('z19p_statuses').select('id',{count:'exact',head:true}).eq('owner_id',uid),
    supabase.from('z19p_products').select('id',{count:'exact',head:true}).eq('owner_id',uid),
    supabase.from('z19p_folder_templates').select('id',{count:'exact',head:true}).eq('owner_id',uid),
    supabase.from('z19p_folder_templates').select('id',{count:'exact',head:true}).eq('owner_id',uid).eq('purpose','artes_prontas'),
    ensureLibraries()
  ]);
  if(epoch!==accountContextEpoch||uid!==accountOwnerId())return;
  const failure=counts.slice(0,4).find(result=>result.error);if(failure)throw failure.error;
  const [{count:statusCount},{count:productCount},{count:folderTemplateCount},{count:readyTemplateCount}]=counts;
  const writes=[];
  if(!statusCount)writes.push(supabase.from('z19p_statuses').insert([...DEFAULT_STATUSES.filter(x=>norm(x.name)!=='cliente desistiu'),{name:'Desistiu',color:'#d65c6a',sort_order:40},{name:'Remarcado',color:'#6f7cff',sort_order:45}].map(x=>({...x,owner_id:uid}))));
  if(!productCount)writes.push(supabase.from('z19p_products').insert(DEFAULT_PRODUCTS.map((name,i)=>({owner_id:uid,name,sort_order:(i+1)*10}))));
  if(!folderTemplateCount)writes.push(supabase.from('z19p_folder_templates').insert(DEFAULT_FOLDER_TEMPLATES.map((x,i)=>({owner_id:uid,name:x.name,purpose:x.purpose,sort_order:(i+1)*10}))));
  else if(!readyTemplateCount)writes.push(supabase.from('z19p_folder_templates').insert({owner_id:uid,name:'Artes prontas',purpose:'artes_prontas',sort_order:20}));
  const results=await Promise.all(writes),writeError=results.find(result=>result.error);if(writeError)throw writeError.error;
};
ensureLibraries = async function(){
  if(!session?.user?.id)return; const uid=accountOwnerId(),epoch=accountContextEpoch;
  const {data,error}=await supabase.from('z19p_workspaces').select('*').eq('owner_id',uid).in('workspace_type',['library_artes','library_mockups','library_videos','library_zero19']);if(error)throw error;
  if(epoch!==accountContextEpoch||uid!==accountOwnerId())return;
  const byType=Object.fromEntries((data||[]).map(w=>[w.workspace_type,w])),missing=[];
  if(!byType.library_artes)missing.push({owner_id:uid,company_name:'Artes',client_name:'Biblioteca interna de artes',notes:'Ambiente interno para organizar e transferir artes entre celular e computador.',share_enabled:false,client_can_download:false,workspace_type:'library_artes',created_by:session.user.id});
  if(!byType.library_mockups)missing.push({owner_id:uid,company_name:'Mockups',client_name:'Biblioteca interna de mockups',notes:'Ambiente interno para organizar e transferir mockups entre celular e computador.',share_enabled:false,client_can_download:false,workspace_type:'library_mockups',created_by:session.user.id});
  if(!byType.library_videos)missing.push({owner_id:uid,company_name:'Vídeos de demonstração',client_name:'Biblioteca interna de vídeos de qualidade',notes:'Ambiente interno para salvar vídeos de demonstração, baixar depois e compartilhar com clientes.',share_enabled:false,client_can_download:false,workspace_type:'library_videos',created_by:session.user.id});
  if(!missing.length){libraryWorkspaces=byType;return;}
  const inserted=await supabase.from('z19p_workspaces').insert(missing);if(inserted.error)throw inserted.error;
  const {data:fresh,error:freshError}=await supabase.from('z19p_workspaces').select('*').eq('owner_id',uid).in('workspace_type',['library_artes','library_mockups','library_videos','library_zero19']);if(freshError)throw freshError;
  if(epoch===accountContextEpoch&&uid===accountOwnerId())libraryWorkspaces=Object.fromEntries((fresh||[]).map(w=>[w.workspace_type,w]));
};

async function loadProjects(){const stillCurrent=accountReadGuard();const {data,error}=await supabase.from('z19p_projects').select('*').order('started_at',{ascending:false});if(!stillCurrent())return [];if(error){console.error(error);return [];}currentProjects=data||[];return currentProjects;}
async function getLatestProject(workspaceId){const {data}=await supabase.from('z19p_projects').select('*').eq('workspace_id',workspaceId).order('sequence_no',{ascending:false}).limit(1).maybeSingle();return data||null;}
async function startNewProject(workspace,newStatusId,{reminderAt=null}={}){
  const last=await getLatestProject(workspace.id),seq=(last?.sequence_no||0)+1;const {data,error}=await supabase.from('z19p_projects').insert({owner_id:accountOwnerId(),workspace_id:workspace.id,sequence_no:seq,title:`Projeto ${seq}`,created_by:session.user.id,responsible_user_id:workspace.responsible_user_id||session.user.id,status_id:newStatusId||null,reminder_at:reminderAt}).select().single();if(error){toast(error.message,'err');return null;}await logEvent('project_started',`Iniciou o Projeto ${seq}`,{workspaceId:workspace.id,projectId:data.id,entityType:'project',entityId:data.id});return data;
}
function quoteBreakdownFromItems(items){let shirt=0,print=0,total=0;for(const i of items||[]){const q=Math.max(1,parseInt(i.quantity)||1);if(i.pricing_mode==='piece_plus_print'){const sh=moneyNumber(i.piece_price)*q,pr=(i.prints||[]).reduce((s,p)=>s+moneyNumber(p.price),0)*q;shirt+=sh;print+=pr;total+=sh+pr;}else{const u=moneyNumber(i.total_unit_price),prod=products.find(p=>p.id===i.product_id),base=Math.min(u,moneyNumber(prod?.default_unit_price||u));shirt+=base*q;print+=Math.max(0,u-base)*q;total+=u*q;}}return{shirt,print,total};}
async function getLatestQuoteBreakdown(workspaceId){const {data:q}=await supabase.from('z19p_quotes').select('*').eq('workspace_id',workspaceId).order('created_at',{ascending:false}).limit(1).maybeSingle();if(!q)return{quote:null,shirt:0,print:0,total:0};const {data:items}=await supabase.from('z19p_quote_items').select('*').eq('quote_id',q.id);return{quote:q,...quoteBreakdownFromItems(items||[])};}
function askReminder(){return new Promise(resolve=>{const m=document.createElement('div');m.className='modal-backdrop';const dt=new Date(Date.now()+24*3600000);const local=new Date(dt.getTime()-dt.getTimezoneOffset()*60000).toISOString().slice(0,16);m.innerHTML=`<div class="modal compact"><div class="modal-head"><div><div class="eyebrow">Retorno programado</div><h2>Remarcar atendimento</h2></div><button class="btn ghost small close">×</button></div><div class="field"><label>Data e hora do retorno *</label><input id="reminderAt" type="datetime-local" value="${local}" required></div><div class="field"><label>Observação</label><textarea id="reminderNote" placeholder="Ex.: Cliente pediu para chamar na sexta"></textarea></div><div class="modal-footer"><button class="btn close">Cancelar</button><button class="btn primary" id="saveReminder">Remarcar</button></div></div>`;document.body.appendChild(m);$$('.close',m).forEach(b=>b.onclick=()=>{m.remove();resolve(null)});$('#saveReminder',m).onclick=()=>{const v=$('#reminderAt',m).value;if(!v)return toast('Informe a data do retorno.','err');const d=new Date(v);if(!Number.isFinite(d.getTime()))return toast('Data inválida.','err');const out={reminder_at:d.toISOString(),reminder_note:$('#reminderNote',m).value.trim()||null};m.remove();resolve(out)};});}
function askFinalization(workspaceId){return new Promise(async resolve=>{const b=await getLatestQuoteBreakdown(workspaceId);const m=document.createElement('div');m.className='modal-backdrop';m.innerHTML=`<div class="modal compact"><div class="modal-head"><div><div class="eyebrow">Fechar projeto</div><h2>Valores finalizados</h2><p class="modal-sub">Confirme a divisão para o dashboard ficar correto.</p></div><button class="btn ghost small close">×</button></div><div class="form-grid"><div class="field"><label>Valor em camisas</label><input id="finalShirt" inputmode="decimal" value="${String(b.shirt.toFixed(2)).replace('.',',')}"></div><div class="field"><label>Valor em estampas</label><input id="finalPrint" inputmode="decimal" value="${String(b.print.toFixed(2)).replace('.',',')}"></div><div class="field full total-field"><label>Total</label><strong id="finalTotal">${fmtMoney(b.shirt+b.print)}</strong></div></div><div class="hint">${b.quote?`Baseado em “${escapeHTML(b.quote.title||'Orçamento')}”. Você pode corrigir os valores antes de finalizar.`:'Sem orçamento salvo: informe os valores manualmente.'}</div><div class="modal-footer"><button class="btn close">Cancelar</button><button class="btn primary" id="confirmFinal">Finalizar projeto</button></div></div>`;document.body.appendChild(m);const upd=()=>$('#finalTotal',m).textContent=fmtMoney(moneyNumber($('#finalShirt',m).value)+moneyNumber($('#finalPrint',m).value));$('#finalShirt',m).oninput=upd;$('#finalPrint',m).oninput=upd;$$('.close',m).forEach(b=>b.onclick=()=>{m.remove();resolve(null)});$('#confirmFinal',m).onclick=()=>{const shirt=moneyNumber($('#finalShirt',m).value),print=moneyNumber($('#finalPrint',m).value);m.remove();resolve({shirt,print,total:shirt+print,quote_id:b.quote?.id||null})};});}

updateWorkspaceStatus = async function(workspaceId,statusId,{rerender=false}={}){
  const w=workspaces.find(x=>x.id===workspaceId)||currentWorkspace;if(!w)return false;const oldSt=statusById(w.status_id),newSt=statusById(statusId);if((w.status_id||null)===(statusId||null))return true;
  let reminder=null,finalData=null;if(isRemarcadoStatus(newSt)){reminder=await askReminder();if(!reminder)return false;}if(isFinalizedStatus(newSt)){finalData=await askFinalization(workspaceId);if(!finalData)return false;}
  let project=await getLatestProject(workspaceId);if(isTerminalStatus(oldSt)&&newSt&&!isTerminalStatus(newSt))project=await startNewProject(w,statusId,{reminderAt:reminder?.reminder_at});if(!project)project=await getLatestProject(workspaceId);if(!project)project=await startNewProject(w,statusId,{reminderAt:reminder?.reminder_at});
  const changed=nowISO(),payload={status_id:statusId||null,status_changed_at:changed,updated_at:changed,reminder_at:reminder?.reminder_at||null,reminder_note:reminder?.reminder_note||null};if(isDesistedStatus(newSt))payload.last_desisted_at=changed;const {error}=await supabase.from('z19p_workspaces').update(payload).eq('id',workspaceId);if(error){toast(error.message,'err');return false;}
  if(project){const pp={status_id:statusId||null,reminder_at:reminder?.reminder_at||null,updated_at:changed};if(isFinalizedStatus(newSt))Object.assign(pp,{finalized_at:changed,finalized_by:session.user.id,shirt_revenue:finalData.shirt,print_revenue:finalData.print,total_revenue:finalData.total,quote_id:finalData.quote_id});if(isDesistedStatus(newSt))pp.desisted_at=changed;await supabase.from('z19p_projects').update(pp).eq('id',project.id);}
  await supabase.from('z19p_status_history').insert({owner_id:accountOwnerId(),workspace_id:workspaceId,project_id:project?.id||null,from_status_id:w.status_id||null,to_status_id:statusId||null,changed_by:session.user.id,reminder_at:reminder?.reminder_at||null});
  await logEvent('status_changed',`Alterou o status de ${oldSt?.name||'Sem status'} para ${newSt?.name||'Sem status'}`,{workspaceId,projectId:project?.id||null,entityType:'workspace',entityId:workspaceId,metadata:{from:oldSt?.name||null,to:newSt?.name||null,reminder_at:reminder?.reminder_at||null}});
  w.status_id=statusId||null;w.status_changed_at=changed;w.reminder_at=payload.reminder_at;w.reminder_note=payload.reminder_note;if(isDesistedStatus(newSt))w.last_desisted_at=changed;if(currentWorkspace?.id===workspaceId)Object.assign(currentWorkspace,w);
  toast(isRemarcadoStatus(newSt)?'Retorno remarcado.':'Status atualizado.','ok');if(rerender)renderWorkspace(workspaceId);return true;
};

async function claimWorkspace(w,{openChat=true}={}){
  if(!w)return;const st=statusById(w.status_id),changed=nowISO();if(!isFinalizedStatus(st)){const {error}=await supabase.from('z19p_workspaces').update({responsible_user_id:session.user.id,last_contact_by:session.user.id,last_contact_at:changed,updated_at:changed}).eq('id',w.id);if(error)return toast(error.message,'err');const p=await getLatestProject(w.id);if(p)await supabase.from('z19p_projects').update({responsible_user_id:session.user.id,updated_at:changed}).eq('id',p.id);w.responsible_user_id=session.user.id;w.last_contact_by=session.user.id;w.last_contact_at=changed;await logEvent('claim_contact',`${currentProfile.full_name} assumiu o atendimento e iniciou contato`,{workspaceId:w.id,projectId:p?.id||null,entityType:'workspace',entityId:w.id});}
  if(openChat){const d=normalizeWaPhone(w.phone);if(!d)return toast('Cadastre o telefone do cliente primeiro.','err');const first=(w.client_name||'').trim().split(/\s+/)[0]||'cliente';const msg=`Olá, ${first}! Sou ${currentProfile.full_name}, da Zero 19. Estou responsável pelo desenvolvimento do seu projeto agora. Vamos continuar seu atendimento por aqui.`;window.open(`https://wa.me/${d}?text=${encodeURIComponent(msg)}`,'_blank','noopener,noreferrer');}
  setTimeout(()=>{if(route()==='/')renderDashboard();else if(currentWorkspace?.id===w.id)renderWorkspace(w.id)},250);
}

function workspaceSpecialCallout(w){const st=statusById(w.status_id);if(isDesistedStatus(st)){const d=w.last_desisted_at||w.status_changed_at;return `<div class="terminal-callout desist"><b>Desistiu${d?` em ${fmtDate(d)}`:''}</b><small>Cliente pode ser retomado futuramente.</small></div>`;}const rem=reminderInfo(w);if(rem)return `<div class="terminal-callout reminder ${rem.due?'due':''}"><b>${escapeHTML(rem.label)}</b><small>${escapeHTML(w.reminder_note||`Retorno marcado para ${rem.date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}`)}</small></div>`;return '';}

renderWorkspaceCards = function(items){
  if(!items.length)return `<div class="empty" style="grid-column:1/-1"><div class="big">◫</div><b>Nenhuma empresa encontrada</b><div>Crie uma empresa ou altere os filtros.</div></div>`;
  return customerView(items,{ownerId:accountOwnerId(),userId:session?.user?.id,scope:'all',projects:currentProjects,statuses}).map(w=>{
    const info=customerState(w,{projects:currentProjects,statuses}),st=info.status,attention=info.closed?null:workspaceStatusAttention(w),age=info.closed?null:workspaceStatusDuration(w),rem=info.closed?null:reminderInfo(w);
    const logo=w._logo_url?`<img src="${escapeHTML(w._logo_url)}" alt="Logo ${escapeHTML(w.company_name)}" loading="lazy" decoding="async">`:brandLogoHTML('default-card-brand');
    const ageLine=age?`<div class="status-age-inline ${attention?'stale':''}" data-status-age-since="${escapeHTML(age.changedAt.toISOString())}"><span class="status-age-dot"></span><span>Há <b>${escapeHTML(age.label)}</b> neste status</span></div>`:'';
    const alert=info.closed?'':info.overdue?'<div class="customer-card-attention">Prazo de entrega vencido. Revise o pedido.</div>':attention?`<div class="customer-card-attention">${attention.reminder?escapeHTML(attention.label):`Sem atualização há ${escapeHTML(attention.label)}. Confira o andamento.`}</div>`:'';
    const pull=!info.closed&&w.responsible_user_id!==session.user.id?`<button class="btn small claim-workspace" data-id="${w.id}">Puxar pra mim</button>`:'';
    const delivery=info.deadline&&!info.closed?`<p class="customer-deadline ${info.overdue?'overdue':''}">Entrega · ${escapeHTML(new Date(info.deadline).toLocaleDateString('pt-BR',{timeZone:'UTC'}))}</p>`:'';
    return `<article class="workspace-card clean customer-card ${info.attention?'needs-status-attention':''} ${info.closed?'is-closed':''}" data-workspace="${escapeHTML(w.id)}"><div class="workspace-head"><div class="workspace-icon ${w._logo_url?'has-logo':''}">${logo}</div><div class="workspace-copy"><div class="workspace-name-line"><h3>${escapeHTML(w.company_name)}</h3>${w.state?`<span class="workspace-state">${escapeHTML(w.state)}</span>`:''}</div><div class="meta">${escapeHTML(w.client_name||'Cliente não informado')}</div></div></div><div class="customer-order-line"><span class="customer-service">${escapeHTML(info.serviceLabel)}</span>${statusPill(st)}</div>${delivery}${alert}<details class="customer-secondary"><summary>Status e responsável</summary>${sellerBadge(w)}${w.phone?`<div class="meta">${escapeHTML(w.phone)}</div>`:''}${info.closed?'':workspaceSpecialCallout(w)}<div class="card-status"><label for="customer-status-${escapeHTML(w.id)}">Alterar status</label><select id="customer-status-${escapeHTML(w.id)}" class="status-select card-status-select" data-id="${w.id}"><option value="">Sem status</option>${statusOptions(w.status_id)}</select></div>${ageLine}${pull}</details><div class="card-actions"><button class="btn primary small open-workspace" data-id="${w.id}">${info.closed?'Ver histórico':'Abrir pedido'}</button>${w.phone?`<button class="btn small wa-workspace" data-id="${w.id}">WhatsApp</button>`:''}<button class="btn ghost small workspace-more" data-id="${w.id}" aria-label="Mais opções de ${escapeHTML(w.company_name)}">•••</button></div></article>`;
  }).join('');
};
bindWorkspaceCards = function(){
  $$('.open-workspace').forEach(b=>b.onclick=()=>nav(`/ambiente/${b.dataset.id}`));$$('.workspace-more').forEach(b=>b.onclick=()=>openWorkspaceActions(workspaces.find(w=>w.id===b.dataset.id)));$$('.wa-workspace').forEach(b=>b.onclick=()=>claimWorkspace(workspaces.find(w=>w.id===b.dataset.id),{openChat:true}));$$('.claim-workspace').forEach(b=>b.onclick=()=>claimWorkspace(workspaces.find(w=>w.id===b.dataset.id),{openChat:true}));$$('.card-status-select').forEach(sel=>sel.onchange=async()=>{await updateWorkspaceStatus(sel.dataset.id,sel.value||null);renderDashboard();});
  productionModule?.enhanceDashboardCards();
};

function dateRangePreset(key,customStart=null,customEnd=null,month=null){const n=new Date(),start=new Date(n),end=new Date(n);start.setHours(0,0,0,0);end.setHours(23,59,59,999);if(key==='yesterday'){start.setDate(start.getDate()-1);end.setDate(end.getDate()-1);}if(key==='7d'){start.setDate(start.getDate()-6);}if(key==='30d'){start.setDate(start.getDate()-29);}if(key==='last_month'){start.setDate(1);start.setMonth(start.getMonth()-1);end.setDate(0);end.setHours(23,59,59,999);}if(key==='month'&&month){const [y,m]=month.split('-').map(Number);start.setFullYear(y,m-1,1);start.setHours(0,0,0,0);end.setFullYear(y,m,0);end.setHours(23,59,59,999);}if(key==='custom'&&customStart&&customEnd){start.setTime(new Date(customStart+'T00:00:00').getTime());end.setTime(new Date(customEnd+'T23:59:59.999').getTime());}return{start,end};}
function inRange(v,r){if(!v)return false;const t=new Date(v).getTime();return t>=r.start.getTime()&&t<=r.end.getTime();}
async function loadQualityCommentCount(){
  if(!session||!isAdmin()){unreadQualityComments=0;return 0;}
  try{const {count,error}=await supabase.from('z19p_quality_comments').select('id',{count:'exact',head:true}).eq('owner_id',accountOwnerId()).is('seen_at',null);if(error)throw error;unreadQualityComments=count||0;}catch(e){console.warn('quality comment count',e);unreadQualityComments=0;}return unreadQualityComments;
}
function publicDiscoveryBannerHTML(){return `<section class="public-discovery"><div><div class="eyebrow">Conheça antes de escolher</div><h2>Veja nossas qualidades e trabalhos reais</h2><p>Assista aos vídeos de tecido, confira faixas de preço e veja projetos já produzidos.</p></div><div class="public-discovery-actions"><a class="btn primary" href="/qualidades.html" target="_blank" rel="noopener">▶ Demonstrações de qualidade</a><a class="btn" href="/portfolio.html" target="_blank" rel="noopener">▣ Ver portfólio</a></div></section>`;}
function homeSummaryHTML(){const r=dateRangePreset('today'),accountProjects=currentProjects.filter(p=>p.owner_id===accountOwnerId()),accountCustomers=workspaces.filter(w=>w.owner_id===accountOwnerId()&&w.workspace_type==='client');const started=accountProjects.filter(p=>inRange(p.started_at,r)).length,finalized=accountProjects.filter(p=>inRange(p.finalized_at,r)),revenue=finalized.reduce((s,p)=>s+moneyNumber(p.total_revenue),0),active=accountCustomers.filter(w=>!customerState(w,{projects:accountProjects,statuses}).closed).length,overdue=accountCustomers.filter(w=>customerState(w,{projects:accountProjects,statuses}).attention).length;return `<section class="daily-summary compact-daily-summary"><div class="summary-head"><div><div class="eyebrow">Resumo de hoje</div><h2>Operação em tempo real</h2></div>${isAdmin()?'<button class="btn small" id="productivityBtn">Ver produtividade →</button>':''}</div><div class="summary-cards"><div><small>Em andamento</small><b>${active}</b></div><div class="warn"><small>Precisam de atenção</small><b>${overdue}</b></div><div><small>Iniciados hoje</small><b>${started}</b></div><div><small>Finalizados hoje</small><b>${finalized.length}</b></div><div class="money"><small>Faturamento hoje</small><b>${fmtMoney(revenue)}</b></div></div></section>`;}

function myCommissionCardHTML(){
  if(isAdmin())return '';
  if(myCommissionSummary.unavailable)return '<section class="my-commission-card" role="status"><div><div class="eyebrow">Minha comissão</div><h2>Valores indisponíveis</h2><p>Não foi possível atualizar as comissões. Isso não significa saldo zero. Reabra esta página para tentar novamente.</p></div></section>';
  if(!myCommissionSummary.enabled)return '';
  return `<section class="my-commission-card"><div><div class="eyebrow">Minha comissão</div><h2>Seus valores</h2><p>Somente você e o administrador conseguem ver estes valores.</p></div><div class="my-commission-values"><span><small>Aguardando</small><b>${fmtMoney(myCommissionSummary.pending)}</b></span><span><small>Aprovada</small><b>${fmtMoney(myCommissionSummary.approved)}</b></span><span class="paid"><small>Recebida</small><b>${fmtMoney(myCommissionSummary.paid)}</b></span></div></section>`;
}

function dashboardClientListsHTML(items=workspaces){
  const groups={urgent:[],regular:[],closed:[]};for(const w of items){const info=customerState(w,{projects:currentProjects,statuses});groups[info.closed?'closed':info.attention?'urgent':'regular'].push(w);}const {urgent,regular,closed}=groups;
  return `<section id="attentionClients" class="attention-clients ${urgent.length?'':'hidden'}"><div class="client-section-head"><h2>Precisam de atenção</h2><span id="attentionCount">${urgent.length}</span></div><div id="attentionGrid" class="grid workspace-grid-clean priority-grid">${urgent.length?renderWorkspaceCards(urgent):''}</div></section><section class="clients-section"><div class="client-section-head"><h2>Em andamento</h2><span>${regular.length}</span></div><div id="workspaceGrid" class="grid workspace-grid-clean">${regular.length?renderWorkspaceCards(regular):(urgent.length||closed.length?'<div class="empty mini" style="grid-column:1/-1">Nenhum outro atendimento ativo neste filtro.</div>':renderWorkspaceCards([]))}</div></section>${closed.length?`<details class="customer-closed"><summary>Concluídos · ${closed.length}</summary><div class="grid workspace-grid-clean">${renderWorkspaceCards(closed)}</div></details>`:''}`;
}

let dashboardCustomerScope='mine',dashboardCustomerIdentity='';
renderDashboard = async function(){
  const stillCurrent=accountReadGuard(true);if(!await loadTeamContext({reuseRoute:true})||!stillCurrent())return;await ensureDefaults();if(!stillCurrent())return;await Promise.all([loadConfig(),loadWorkspaces(),loadProjects(),loadQualityCommentCount(),loadCommissionContext()]);if(!stillCurrent())return;
  const identity=`${accountOwnerId()}:${session.user.id}`;if(identity!==dashboardCustomerIdentity){dashboardCustomerIdentity=identity;dashboardCustomerScope='mine';}
  const filtered=()=>customerView(workspaces,{ownerId:accountOwnerId(),userId:session.user.id,scope:dashboardCustomerScope,projects:currentProjects,statuses,query:$('#workspaceSearch')?.value||'',statusId:$('#statusFilter')?.value||'all'});
  const content=`<main class="container simple-container dashboard-home"><section class="simple-hero dashboard-hero"><div><h1>Clientes</h1></div><div class="hero-actions"><button class="btn partner-home-button" data-nav="/empresas-parceiras">Empresas parceiras</button><button class="btn primary" id="newWorkspace">${icon('plus')} Novo cliente</button></div></section><details class="customer-summary"><summary>Resumo de hoje · toda a equipe</summary>${homeSummaryHTML()}</details>${myCommissionCardHTML()}<div class="client-scope-bar"><div class="customer-scope" role="group" aria-label="Clientes exibidos"><button type="button" data-customer-scope="mine" aria-pressed="${dashboardCustomerScope==='mine'}">Meus clientes</button><button type="button" data-customer-scope="all" aria-pressed="${dashboardCustomerScope==='all'}">Todos os clientes</button></div><p class="client-scope-note">Somente clientes da sua conta e equipe.</p></div><div class="toolbar clean-toolbar client-toolbar"><div class="search">${icon('search')}<input id="workspaceSearch" type="search" aria-label="Buscar clientes" placeholder="Buscar cliente ou telefone"></div><div class="status-filter-wrap"><select id="statusFilter" class="btn compact-select" aria-label="Filtrar status"><option value="all">Todos os status</option><option value="none">Sem status</option>${statuses.map(s=>`<option value="${s.id}">${escapeHTML(s.name)}</option>`).join('')}</select></div></div><div id="dashboardClientLists">${dashboardClientListsHTML(customerView(workspaces,{ownerId:accountOwnerId(),userId:session.user.id,scope:dashboardCustomerScope,projects:currentProjects,statuses}))}</div></main>`;
  app.innerHTML=shell(content);bindCommon();$('#newWorkspace').onclick=()=>openWorkspaceModal();$('#productivityBtn')?.addEventListener('click',()=>nav('/produtividade'));
  const redraw=()=>{if(!stillCurrent()||!$('#dashboardClientLists'))return;const opened=new Set($$('.customer-secondary[open]').map(node=>node.closest('[data-workspace]')?.dataset.workspace));const closedOpen=Boolean($('.customer-closed')?.open);$('#dashboardClientLists').innerHTML=dashboardClientListsHTML(filtered());$$('.customer-secondary').forEach(node=>{node.open=opened.has(node.closest('[data-workspace]')?.dataset.workspace)});if($('.customer-closed'))$('.customer-closed').open=closedOpen;bindWorkspaceCards();};$('#workspaceSearch').oninput=redraw;$('#statusFilter').onchange=redraw;$$('[data-customer-scope]').forEach(button=>button.onclick=()=>{dashboardCustomerScope=button.dataset.customerScope;$$('[data-customer-scope]').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.customerScope===dashboardCustomerScope)));redraw();});bindWorkspaceCards();updateStatusAgeLabels();clearInterval(dashboardAgingTimer);dashboardAgingTimer=setInterval(()=>{if(route()==='/'){redraw();updateStatusAgeLabels();}},60000);
};

function absoluteAppUrl(path){return new URL(path,location.origin).href;}
async function copyText(value,message='Link copiado.'){
  try{await navigator.clipboard.writeText(value);toast(message,'ok');}catch{prompt('Copie o link:',value);}
}
async function activateClientShare(w){
  if(!w||w.share_enabled)return true;
  const {error}=await supabase.from('z19p_workspaces').update({share_enabled:true,updated_at:nowISO()}).eq('id',w.id);if(error){toast(error.message,'err');return false;}w.share_enabled=true;return true;
}
function shareLinkFor(kind,w=null){
  if(kind==='quality')return absoluteAppUrl('/qualidades.html');
  if(kind==='portfolio')return absoluteAppUrl('/portfolio.html');
  return w?.share_token?makeShareLink(w.share_token):'';
}
async function sendSharedLink(kind,w){
  if(!w)return toast('Selecione um cliente.','err');if(!w.phone)return toast('Este cliente não possui WhatsApp cadastrado.','err');if(kind==='client'&&!await activateClientShare(w))return;
  const url=shareLinkFor(kind,w),label=kind==='quality'?'demonstrações de qualidade':kind==='portfolio'?'portfólio de trabalhos':'área do seu projeto';const first=(w.client_name||'').trim().split(/\s+/)[0]||'cliente';const msg=`Olá, ${first}! Segue o link da Zero 19 para acessar ${label}: ${url}`;window.open(`https://wa.me/${normalizeWaPhone(w.phone)}?text=${encodeURIComponent(msg)}`,'_blank','noopener,noreferrer');
}
async function renderShareLinks(){
  await loadWorkspaces();const options=workspaces.map(w=>`<option value="${w.id}">${escapeHTML(w.company_name)}${w.client_name?` — ${escapeHTML(w.client_name)}`:''}</option>`).join('');
  const content=`<main class="container simple-container share-links-page"><section class="simple-hero"><div><div class="eyebrow">Compartilhamento</div><h1>Links rápidos</h1><p>Abra, copie ou envie pelo WhatsApp sem misturar essa tarefa com a tela de clientes.</p></div></section><section class="share-link-grid"><article class="share-link-card"><span class="share-link-icon">▶</span><div><h2>Demonstrações de qualidade</h2><p>Vídeos, fotos, tecidos, medidas e valores por quantidade.</p></div><div class="share-link-actions"><a class="btn" href="/qualidades.html" target="_blank" rel="noopener">Abrir</a><button class="btn primary copy-general-link" data-kind="quality">Copiar</button></div></article><article class="share-link-card"><span class="share-link-icon">▣</span><div><h2>Portfólio</h2><p>Trabalhos reais publicados para apresentar aos clientes.</p></div><div class="share-link-actions"><a class="btn" href="/portfolio.html" target="_blank" rel="noopener">Abrir</a><button class="btn primary copy-general-link" data-kind="portfolio">Copiar</button></div></article></section><section class="share-send-panel"><div><div class="eyebrow">Enviar no WhatsApp</div><h2>Escolha o cliente e o conteúdo</h2><p>O sistema já monta a mensagem com o link correto.</p></div><div class="share-send-controls"><select id="shareClient" class="btn compact-select"><option value="">Selecione um cliente</option>${options}</select><div><button class="btn send-general-link" data-kind="quality">Enviar qualidades</button><button class="btn send-general-link" data-kind="portfolio">Enviar portfólio</button><button class="btn primary send-general-link" data-kind="client">Enviar área do cliente</button></div></div></section><section class="client-links-list"><div class="client-section-head"><div><div class="eyebrow">Áreas individuais</div><h2>Links dos clientes</h2></div></div>${workspaces.length?workspaces.map(w=>`<article class="client-link-row"><span class="client-link-avatar">${escapeHTML((w.company_name||'?').slice(0,1).toUpperCase())}</span><div><b>${escapeHTML(w.company_name)}</b><small>${escapeHTML(w.client_name||'Cliente não informado')} • ${w.share_enabled?'link ativo':'será ativado ao compartilhar'}</small></div><button class="btn small copy-client-link" data-id="${w.id}">Copiar</button><button class="btn whatsapp small send-client-link" data-id="${w.id}" ${w.phone?'':'disabled'}>WA</button></article>`).join(''):'<div class="empty">Nenhum cliente cadastrado.</div>'}</section></main>`;
  app.innerHTML=shell(content,{back:true});bindCommon();
  $$('.copy-general-link').forEach(b=>b.onclick=()=>copyText(shareLinkFor(b.dataset.kind)));
  $$('.send-general-link').forEach(b=>b.onclick=()=>sendSharedLink(b.dataset.kind,workspaces.find(w=>w.id===$('#shareClient').value)));
  $$('.copy-client-link').forEach(b=>b.onclick=async()=>{const w=workspaces.find(x=>x.id===b.dataset.id);if(w&&await activateClientShare(w))copyText(shareLinkFor('client',w),'Link do cliente copiado.');});
  $$('.send-client-link').forEach(b=>b.onclick=()=>sendSharedLink('client',workspaces.find(x=>x.id===b.dataset.id)));
}

let garmentStudioEnabled=false,clientUploadWithoutOrderEnabled=true,garmentFeatureOwner=null;
async function loadUiFeatureSettings({force=false}={}){
  const owner=accountOwnerId();if(!owner){garmentStudioEnabled=false;clientUploadWithoutOrderEnabled=true;garmentFeatureOwner=null;return false}
  if(!force&&garmentFeatureOwner===owner)return garmentStudioEnabled;
  const {data,error}=await supabase.from('z19p_public_settings').select('*').eq('owner_id',owner).maybeSingle();
  if(error){console.warn('ui feature settings',error);garmentStudioEnabled=false;clientUploadWithoutOrderEnabled=true;garmentFeatureOwner=owner;return false}
  garmentStudioEnabled=Boolean(data?.garment_studio_enabled);clientUploadWithoutOrderEnabled=data?.client_upload_without_order_enabled!==false;garmentFeatureOwner=owner;return garmentStudioEnabled;
}
async function saveGarmentStudioEnabled(enabled){
  const owner=accountOwnerId();if(!owner)return false;
  const payload={owner_id:owner,slug:'zero19',garment_studio_enabled:Boolean(enabled),updated_at:nowISO()};
  const {error}=await supabase.from('z19p_public_settings').upsert(payload,{onConflict:'owner_id'});
  if(error){toast(error.code==='42703'||error.code==='PGRST204'?'A chave ainda não existe no banco. Execute a migration v2.17.15 antes de ativar.':error.message,'err');return false}
  garmentStudioEnabled=Boolean(enabled);garmentFeatureOwner=owner;toast(garmentStudioEnabled?'Montar camiseta e 3D ativados.':'Montar camiseta e 3D desativados.','ok');return true;
}
async function saveClientUploadWithoutOrderEnabled(enabled){
  const owner=accountOwnerId();if(!owner)return false;
  const payload={owner_id:owner,slug:'zero19',client_upload_without_order_enabled:Boolean(enabled),updated_at:nowISO()};
  const {error}=await supabase.from('z19p_public_settings').upsert(payload,{onConflict:'owner_id'});
  if(error){toast(error.message||'Não foi possível salvar esta configuração.','err');return false}
  clientUploadWithoutOrderEnabled=Boolean(enabled);garmentFeatureOwner=owner;
  toast(clientUploadWithoutOrderEnabled?'Upload em cliente sem pedido liberado.':'Cliente sem pedido oficial ficará bloqueado para novas artes.','ok');return true;
}
function workspaceHasOfficialOrder(workspaceId){
  return currentProjects.some(project=>project.workspace_id===workspaceId&&String(project.official_order_ref||'').trim());
}

const clientDisplayName=w=>String(w?.client_name||w?.company_name||'Cliente');
const optionalCompanyName=w=>{const client=String(w?.client_name||'').trim(),company=String(w?.company_name||'').trim();return company&&company!==client?company:''};

openWorkspaceModal = function(existing=null){
  const activeProfiles=teamProfiles.filter(p=>p.active||p.id===existing?.responsible_user_id),client=existing?.client_name||existing?.company_name||'',company=existing&&existing.company_name!==client?existing.company_name:'';
  const modal=document.createElement('div');modal.className='modal-backdrop';modal.innerHTML=`<div class="modal compact client-form-clean"><div class="modal-head"><div><div class="eyebrow">Cliente</div><h2>${existing?'Editar cliente':'Novo cliente'}</h2></div><button class="btn ghost small close">×</button></div><form id="workspaceForm"><div class="form-grid"><div class="field full"><label>Nome do cliente *</label><input name="client_name" required autocomplete="name" value="${escapeHTML(client)}" placeholder="Ex.: Rodrigo"></div><div class="field full"><label>Nome da empresa <small>(opcional)</small></label><input name="company_name" value="${escapeHTML(company)}" placeholder="Ex.: Rodrigo Auto Peças"></div><div class="field full"><label>WhatsApp *</label><input name="phone" required inputmode="tel" autocomplete="tel" value="${escapeHTML(existing?.phone||'')}" placeholder="(19) 99999-9999"></div><div class="field full"><label>Responsável *</label><select name="responsible_user_id" required><option value="">Selecione</option>${activeProfiles.map(p=>`<option value="${p.id}" ${(existing?.responsible_user_id||session.user.id)===p.id?'selected':''}>${escapeHTML(p.full_name)}</option>`).join('')}</select></div></div><div class="modal-footer"><button type="button" class="btn close">Cancelar</button><button class="btn primary" type="submit">Salvar cliente</button></div></form></div>`;
  document.body.appendChild(modal);$$('.close',modal).forEach(b=>b.onclick=()=>modal.remove());
  $('#workspaceForm',modal).onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget),clientName=String(fd.get('client_name')||'').trim(),companyName=String(fd.get('company_name')||'').trim(),phone=String(fd.get('phone')||'').trim(),responsible=String(fd.get('responsible_user_id')||'').trim();
    if(!clientName)return toast('Digite o nome do cliente.','err');if(!phone)return toast('Digite o WhatsApp do cliente.','err');if(!responsible)return toast('Escolha o responsável.','err');
    const payload={company_name:companyName||clientName,client_name:clientName,phone,responsible_user_id:responsible,owner_id:accountOwnerId(),updated_at:nowISO()};
    if(!existing)Object.assign(payload,{created_by:session.user.id,status_id:null,status_changed_at:nowISO()});
    const {data,error}=existing?await supabase.from('z19p_workspaces').update(payload).eq('id',existing.id).select().single():await supabase.from('z19p_workspaces').insert(payload).select().single();
    if(error)return toast(error.message,'err');modal.remove();toast(existing?'Cliente atualizado.':'Cliente criado.','ok');if(existing&&currentWorkspace?.id===existing.id)renderWorkspace(existing.id);else if(existing)renderDashboard();else nav(`/ambiente/${data.id}`);
  };
};

openWorkspaceActions = function(w){
  if(!w)return;const m=document.createElement('div');m.className='modal-backdrop';m.innerHTML=`<div class="modal action-sheet"><div class="modal-head"><div><div class="eyebrow">Cliente</div><h2>${escapeHTML(clientDisplayName(w))}</h2></div><button class="btn ghost small close">×</button></div><div class="action-list">${w.phone?`<button class="action-item whatsapp-item" id="waChat">WA<span><b>Chamar no WhatsApp</b><small>${escapeHTML(w.phone)}</small></span></button>`:''}<button class="action-item" id="waEdit">${icon('edit')}<span><b>Editar cliente</b><small>Nome, empresa, WhatsApp e responsável</small></span></button><button class="action-item danger-item" id="waDelete">${icon('trash')}<span><b>Excluir cliente</b><small>Remove o cadastro e os dados vinculados permitidos pelo sistema</small></span></button></div></div>`;document.body.appendChild(m);$('.close',m).onclick=()=>m.remove();$('#waChat',m)?.addEventListener('click',()=>openWhatsApp(w.phone));$('#waEdit',m).onclick=()=>{m.remove();openWorkspaceModal(w)};$('#waDelete',m).onclick=()=>deleteWorkspace(w,m);
};

renderWorkspaceCards = function(items){
  if(!items.length)return '<div class="empty" style="grid-column:1/-1"><div class="big">◫</div><b>Nenhum cliente encontrado</b><div>Cadastre um cliente ou altere a busca.</div></div>';
  return items.map(w=>{
    const client=clientDisplayName(w),company=optionalCompanyName(w),resp=profileById(w.responsible_user_id),orderState=workspaceOfficialOrderState(currentProjects,w.id),logo=w._logo_url||BRAND_LOGO;
    return `<article class="workspace-card clean client-card-simple"><div class="workspace-head"><div class="workspace-icon ${w._logo_url?'has-logo':''}"><img src="${escapeHTML(logo)}" alt="${w._logo_url?'Logo '+escapeHTML(company||client):'Zero 19'}" loading="lazy" decoding="async"></div><div class="workspace-copy"><div class="workspace-name-line"><h3>${escapeHTML(client)}</h3></div>${company?`<div class="client-company-name">${escapeHTML(company)}</div>`:''}${w.phone?`<div class="meta">${escapeHTML(w.phone)}</div>`:''}<div class="client-responsible-badge">Responsável · ${escapeHTML(resp?.full_name||'Não definido')}</div></div></div>${orderState.hasOfficialOrder?`<div class="official-order-ready">${orderState.count} pedido(s) oficial(is) sincronizado(s)</div>`:`<div class="official-order-alert"><b>Pendente de pedido oficial</b><span>Aguardando sincronização do pedido no outro sistema.</span></div>`}<div class="card-actions"><button class="btn small quick-upload-workspace" data-id="${w.id}">＋ Subir arte</button>${w.phone?`<button class="btn whatsapp small wa-workspace" data-id="${w.id}">WA <span>WhatsApp</span></button>`:''}<button class="btn primary small open-workspace" data-id="${w.id}">Abrir</button><button class="btn ghost small workspace-more" data-id="${w.id}" aria-label="Opções">•••</button></div></article>`;
  }).join('');
};
bindWorkspaceCards = function(){
  $$('.open-workspace').forEach(b=>b.onclick=()=>nav(`/ambiente/${b.dataset.id}`));
  $$('.quick-upload-workspace').forEach(b=>b.onclick=()=>{pendingQuickUploadWorkspaceId=b.dataset.id;nav(`/ambiente/${b.dataset.id}`)});
  $$('.workspace-more').forEach(b=>b.onclick=()=>openWorkspaceActions(workspaces.find(w=>w.id===b.dataset.id)));
  $$('.wa-workspace').forEach(b=>b.onclick=()=>openWhatsApp(workspaces.find(w=>w.id===b.dataset.id)?.phone));
};
dashboardClientListsHTML = function(items=workspaces){return `<section class="clients-section client-list-simple"><div class="client-section-head"><h2>Clientes</h2><span>${items.length}</span></div><div id="workspaceGrid" class="grid workspace-grid-clean">${renderWorkspaceCards(items)}</div></section>`;};

openSettingsModal = async function(){
  await loadUiFeatureSettings({force:true});const m=document.createElement('div');m.className='modal-backdrop';
  const draw=()=>{m.innerHTML=`<div class="modal compact settings-modal clean-settings"><div class="modal-head"><div><div class="eyebrow">Configurações</div><h2>Recursos do sistema</h2></div><button class="btn ghost small close">×</button></div><section class="settings-section feature-settings"><div class="settings-head"><div><b>Montar camiseta e 3D</b><small>Controla Montar camiseta, Ver em 3D e Link 3D / cliente. “Ver tamanho na camisa” continua disponível.</small></div><label class="switch"><input id="garmentFeatureToggle" type="checkbox" ${garmentStudioEnabled?'checked':''}><span></span></label></div><div class="settings-note">${garmentStudioEnabled?'Ativado para esta conta.':'Desativado por enquanto.'}</div></section><section class="settings-section feature-settings"><div class="settings-head"><div><b>Permitir subir arte em cliente sem pedido</b><small>Temporário enquanto a sincronização dos pedidos não está completa. Ligado: permite seguir para tamanho e posição mesmo sem pedido oficial.</small></div><label class="switch"><input id="clientUploadWithoutOrderToggle" type="checkbox" ${clientUploadWithoutOrderEnabled?'checked':''}><span></span></label></div><div class="settings-note">${clientUploadWithoutOrderEnabled?'Permitido por enquanto.':'Bloqueado: o cliente precisa ter pedido oficial.'}</div></section><section class="settings-section"><div class="settings-head"><div><b>Posições de estampa</b><small>Frente, costas e mangas. Cadastre ou remova os pontos usados no mockup automático.</small></div><button class="btn small" id="managePrintPositions">Gerenciar</button></div></section></div>`;$('.close',m).onclick=()=>m.remove();$('#garmentFeatureToggle',m).onchange=async e=>{const wanted=e.target.checked;e.target.disabled=true;const ok=await saveGarmentStudioEnabled(wanted);e.target.disabled=false;if(!ok)e.target.checked=garmentStudioEnabled;else{m.remove();await renderRoute();}};$('#clientUploadWithoutOrderToggle',m).onchange=async e=>{const wanted=e.target.checked;e.target.disabled=true;const ok=await saveClientUploadWithoutOrderEnabled(wanted);e.target.disabled=false;if(!ok)e.target.checked=clientUploadWithoutOrderEnabled;else draw();};$('#managePrintPositions',m).onclick=()=>officialOrders?.openPositionSettings?.();};
  document.body.appendChild(m);draw();
};

createDefaultFoldersForWorkspace = async function(workspaceId){if(!workspaceId||!session?.user?.id)return true;if(!folderTemplates.length)await loadConfig();if(!folderTemplates.length)return true;const rows=folderTemplates.map((f,i)=>({owner_id:accountOwnerId(),workspace_id:workspaceId,name:f.name,purpose:f.purpose||null,sort_order:f.sort_order??((i+1)*10),created_by:session.user.id,updated_by:session.user.id}));const {error}=await supabase.from('z19p_folders').insert(rows);if(error){toast('A empresa foi criada, mas não foi possível gerar as pastas padrão.','err');return false;}return true;};

async function renderTeamAdmin(){
  const stillCurrent=accountReadGuard(true);if(!await loadTeamContext({reuseRoute:true})||!stillCurrent())return;if(!isAdmin()){toast('Área disponível apenas para o administrador.','err');return nav('/');}
  const {data:loginHistory}=await supabase.from('z19p_audit_log').select('*').eq('action','login').order('created_at',{ascending:false}).limit(80);
  if(!stillCurrent())return;
  const rows=teamProfiles.map(p=>`<article class="team-row ${p.active?'':'disabled'}"><div class="avatar">${escapeHTML((p.full_name||'?').slice(0,1).toUpperCase())}</div><div class="team-copy"><b>${escapeHTML(p.full_name)}</b><span>${escapeHTML(p.email||'')}</span><small>${p.phone?escapeHTML(p.phone)+' • ':''}${p.role==='admin'?'Administrador':'Funcionário'}${p.last_login_at?` • Último acesso ${new Date(p.last_login_at).toLocaleString('pt-BR')}`:''}</small></div><div class="team-actions">${p.id!==session.user.id?`<button class="btn small reset-user" data-id="${p.id}">Redefinir senha</button><button class="btn small toggle-user" data-id="${p.id}" data-active="${p.active?'0':'1'}">${p.active?'Desativar':'Reativar'}</button>`:''}<button class="btn ghost small edit-profile" data-id="${p.id}">Editar</button></div></article>`).join('');
  app.innerHTML=shell(`<main class="container simple-container"><section class="simple-hero"><div><div class="eyebrow">Administração</div><h1>Equipe</h1><p>Convites, contatos, acessos e histórico da equipe.</p></div><div class="hero-actions"><button class="btn" data-nav="/produtividade">Produtividade</button><button class="btn primary" id="inviteUser">+ Novo usuário</button></div></section><div class="security-note"><b>Senhas são privadas.</b><span>O funcionário define a própria senha no primeiro acesso. O administrador pode enviar uma redefinição, mas não visualizar a senha atual.</span></div><section class="team-list">${rows}</section><section class="activity-section login-history"><div class="section-title-row"><div><div class="eyebrow">Segurança</div><h2>Histórico de acessos</h2><p>Entradas registradas por usuário.</p></div></div><div class="activity-list">${(loginHistory||[]).length?(loginHistory||[]).map(a=>`<div class="activity-row"><span class="avatar tiny">${escapeHTML(profileName(a.actor_user_id).slice(0,1))}</span><div><b>${escapeHTML(profileName(a.actor_user_id))}</b><p>Entrou no sistema</p><small>${new Date(a.created_at).toLocaleString('pt-BR')}</small></div></div>`).join(''):'<div class="empty mini">Nenhum acesso registrado ainda.</div>'}</div></section></main>`,{back:true});bindCommon();$('#inviteUser').onclick=openInviteUser;$$('.reset-user').forEach(b=>b.onclick=()=>teamAdminAction('reset_password',{user_id:b.dataset.id}));$$('.toggle-user').forEach(b=>b.onclick=()=>teamAdminAction('set_active',{user_id:b.dataset.id,active:b.dataset.active==='1'}));$$('.edit-profile').forEach(b=>b.onclick=()=>openEditProfile(profileById(b.dataset.id)));
}
function openInviteUser(){const m=document.createElement('div');m.className='modal-backdrop';m.innerHTML=`<div class="modal compact"><div class="modal-head"><div><div class="eyebrow">Equipe</div><h2>Convidar funcionário</h2></div><button class="btn ghost small close">×</button></div><form id="inviteForm"><div class="field"><label>Nome completo *</label><input name="full_name" required></div><div class="field"><label>WhatsApp</label><input name="phone" inputmode="tel"></div><div class="field"><label>E-mail *</label><input name="email" type="email" required></div><div class="hint">Ele receberá um convite por e-mail e criará a própria senha no primeiro acesso.</div><div class="modal-footer"><button type="button" class="btn close">Cancelar</button><button class="btn primary">Enviar convite</button></div></form></div>`;document.body.appendChild(m);$$('.close',m).forEach(b=>b.onclick=()=>m.remove());$('#inviteForm',m).onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const ok=await teamAdminAction('invite',{full_name:fd.get('full_name').trim(),phone:fd.get('phone').trim(),email:fd.get('email').trim()},{quiet:true});if(ok){m.remove();toast('Convite enviado.','ok');await loadTeamContext();renderTeamAdmin();}};}
async function teamAdminAction(action,data,{quiet=false}={}){const {data:res,error}=await supabase.functions.invoke('z19p-team-admin',{body:{action,...data}});if(error||res?.error){toast(res?.error||error?.message||'Falha na operação.','err');return false;}if(!quiet)toast(res?.message||'Operação concluída.','ok');await loadTeamContext();if(route()==='/equipe')renderTeamAdmin();return true;}
function openEditProfile(p){if(!p)return;const m=document.createElement('div');m.className='modal-backdrop';m.innerHTML=`<div class="modal compact"><div class="modal-head"><h2>Editar perfil</h2><button class="btn ghost small close">×</button></div><form id="profileForm"><div class="field"><label>Nome</label><input name="full_name" value="${escapeHTML(p.full_name||'')}"></div><div class="field"><label>WhatsApp</label><input name="phone" inputmode="tel" value="${escapeHTML(p.phone||'')}"></div><div class="modal-footer"><button type="button" class="btn close">Cancelar</button><button class="btn primary">Salvar</button></div></form></div>`;document.body.appendChild(m);$$('.close',m).forEach(b=>b.onclick=()=>m.remove());$('#profileForm',m).onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const {error}=await supabase.from('z19p_profiles').update({full_name:fd.get('full_name').trim(),phone:fd.get('phone').trim()||null,updated_at:nowISO()}).eq('id',p.id);if(error)return toast(error.message,'err');await logEvent('profile_updated',`Atualizou o perfil de ${fd.get('full_name').trim()}`,{entityType:'profile',entityId:p.id});m.remove();await loadTeamContext();renderTeamAdmin();};}

function periodLabel(key,range){return key==='today'?'Hoje':key==='yesterday'?'Ontem':key==='7d'?'Últimos 7 dias':key==='30d'?'Últimos 30 dias':key==='last_month'?'Mês passado':`${range.start.toLocaleDateString('pt-BR')} a ${range.end.toLocaleDateString('pt-BR')}`;}
async function renderProductivity(){
  const stillCurrent=accountReadGuard(true);if(!await loadTeamContext({reuseRoute:true})||!stillCurrent())return;await Promise.all([loadConfig(),loadWorkspaces(),loadProjects()]);if(!stillCurrent())return;if(!isAdmin()){toast('Dashboard de produtividade disponível para o administrador.','err');return nav('/');}
  const {data:a}=await supabase.from('z19p_audit_log').select('*').order('created_at',{ascending:false}).limit(500);if(!stillCurrent())return;auditEntries=a||[];
  app.innerHTML=shell(`<main class="container simple-container"><section class="simple-hero"><div><div class="eyebrow">Gestão</div><h1>Produtividade</h1><p>Atendimentos, conversão, faturamento e responsabilidade por usuário.</p></div><div class="hero-actions"><button class="btn" data-nav="/equipe">Equipe</button></div></section><div class="period-toolbar"><select id="periodPreset" class="btn compact-select"><option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option><option value="last_month">Mês passado</option><option value="month">Escolher mês</option><option value="custom">Data personalizada</option></select><input id="periodMonth" type="month" class="btn period-extra hidden"><input id="periodStart" type="date" class="btn period-extra hidden"><input id="periodEnd" type="date" class="btn period-extra hidden"><select id="sellerFilter" class="btn compact-select"><option value="all">Todos os vendedores</option>${teamProfiles.map(p=>`<option value="${p.id}">${escapeHTML(p.full_name)}</option>`).join('')}</select></div><div id="productivityBody"></div></main>`,{back:true});bindCommon();const redraw=()=>drawProductivity($('#periodPreset').value,$('#sellerFilter').value);$('#periodPreset').onchange=()=>{const v=$('#periodPreset').value;$('#periodMonth').classList.toggle('hidden',v!=='month');$('#periodStart').classList.toggle('hidden',v!=='custom');$('#periodEnd').classList.toggle('hidden',v!=='custom');redraw();};$('#sellerFilter').onchange=redraw;$('#periodMonth').onchange=redraw;$('#periodStart').onchange=redraw;$('#periodEnd').onchange=redraw;redraw();
}
function drawProductivity(key,sellerId='all'){
  let range=dateRangePreset(key,$('#periodStart')?.value,$('#periodEnd')?.value,$('#periodMonth')?.value);const sellers=sellerId==='all'?teamProfiles:teamProfiles.filter(p=>p.id===sellerId);const sellerSet=new Set(sellers.map(p=>p.id));const pStarted=currentProjects.filter(p=>inRange(p.started_at,range)&&(sellerId==='all'||sellerSet.has(p.created_by)));const pFinal=currentProjects.filter(p=>inRange(p.finalized_at,range)&&(sellerId==='all'||sellerSet.has(p.finalized_by||p.responsible_user_id)));const companies=workspaces.filter(w=>w.workspace_type==='client'&&inRange(w.created_at,range)&&(sellerId==='all'||sellerSet.has(w.created_by)));const clients=uniqueClients(companies);const shirt=pFinal.reduce((s,p)=>s+moneyNumber(p.shirt_revenue),0),print=pFinal.reduce((s,p)=>s+moneyNumber(p.print_revenue),0),total=pFinal.reduce((s,p)=>s+moneyNumber(p.total_revenue),0);const activeWs=workspaces.filter(w=>w.workspace_type==='client'&&!isTerminalStatus(statusById(w.status_id))&&(sellerId==='all'||sellerSet.has(w.responsible_user_id)));const overdue=workspaces.filter(w=>w.workspace_type==='client'&&workspaceStatusAttention(w)&&(sellerId==='all'||sellerSet.has(w.responsible_user_id)));const desisted=workspaces.filter(w=>w.workspace_type==='client'&&isDesistedStatus(statusById(w.status_id))&&(sellerId==='all'||sellerSet.has(w.responsible_user_id)));const statusCounts=statuses.map(s=>({s,count:workspaces.filter(w=>w.workspace_type==='client'&&w.status_id===s.id&&(sellerId==='all'||sellerSet.has(w.responsible_user_id))).length})).filter(x=>x.count);const stateCounts=BRAZIL_STATES.map(uf=>({uf,count:companies.filter(w=>w.state===uf).length})).filter(x=>x.count);const noState=companies.filter(w=>!w.state).length;
  const rows=sellers.map(u=>{const createdList=workspaces.filter(w=>w.workspace_type==='client'&&w.created_by===u.id&&inRange(w.created_at,range)),created=createdList.length,clientCount=uniqueClients(createdList),started=currentProjects.filter(p=>p.created_by===u.id&&inRange(p.started_at,range)).length,fin=currentProjects.filter(p=>(p.finalized_by||p.responsible_user_id)===u.id&&inRange(p.finalized_at,range)),assigned=workspaces.filter(w=>w.workspace_type==='client'&&w.responsible_user_id===u.id&&!isTerminalStatus(statusById(w.status_id))).length,late=workspaces.filter(w=>w.workspace_type==='client'&&w.responsible_user_id===u.id&&workspaceStatusAttention(w)).length,rv=fin.reduce((s,p)=>s+moneyNumber(p.total_revenue),0),statusNow=statuses.map(s=>({name:s.name,n:workspaces.filter(w=>w.workspace_type==='client'&&w.responsible_user_id===u.id&&w.status_id===s.id).length})).filter(x=>x.n).map(x=>`${x.name}: ${x.n}`).join(' • ')||'—',statesNow=BRAZIL_STATES.map(uf=>({uf,n:createdList.filter(w=>w.state===uf).length})).filter(x=>x.n).map(x=>`${x.uf}: ${x.n}`).join(' • ')||'—';return `<tr><td><b>${escapeHTML(u.full_name)}</b></td><td>${clientCount}</td><td>${created}</td><td>${started}</td><td>${fin.length}</td><td>${assigned}</td><td class="${late?'bad':''}">${late}</td><td class="status-cell">${escapeHTML(statusNow)}</td><td class="status-cell">${escapeHTML(statesNow)}</td><td>${fmtMoney(rv)}</td></tr>`;}).join('');
  const acts=auditEntries.filter(a=>inRange(a.created_at,range)&&(sellerId==='all'||sellerSet.has(a.actor_user_id))).slice(0,80);
  $('#productivityBody').innerHTML=`<section class="dashboard-title"><div><div class="eyebrow">${escapeHTML(periodLabel(key,range))}</div><h2>Visão geral</h2></div></section><div class="kpi-grid"><div><small>Clientes cadastrados</small><b>${clients}</b></div><div><small>Empresas cadastradas</small><b>${companies.length}</b></div><div><small>Projetos iniciados</small><b>${pStarted.length}</b></div><div><small>Finalizados</small><b>${pFinal.length}</b></div><div><small>Em atendimento agora</small><b>${activeWs.length}</b></div><div class="warn"><small>Vencidos / atenção</small><b>${overdue.length}</b></div><div><small>Desistiram</small><b>${desisted.length}</b></div><div class="money"><small>Camisas</small><b>${fmtMoney(shirt)}</b></div><div class="money"><small>Estampas</small><b>${fmtMoney(print)}</b></div><div class="money total"><small>Faturamento total</small><b>${fmtMoney(total)}</b></div></div><div class="breakdown-grid"><section class="status-breakdown"><h3>Status atuais</h3><div>${statusCounts.map(x=>`<span style="--status:${escapeHTML(x.s.color)}"><i></i>${escapeHTML(x.s.name)} <b>${x.count}</b></span>`).join('')||'<small>Sem dados.</small>'}</div></section><section class="status-breakdown"><h3>Empresas cadastradas por estado</h3><div>${stateCounts.map(x=>`<span class="state-chip">${escapeHTML(x.uf)} <b>${x.count}</b></span>`).join('')}${noState?`<span class="state-chip muted">Sem UF <b>${noState}</b></span>`:''}${!stateCounts.length&&!noState?'<small>Sem dados.</small>':''}</div></section></div><section class="dashboard-table"><div class="section-title-row"><div><div class="eyebrow">Equipe</div><h2>Produtividade por vendedor</h2></div></div><div class="table-scroll"><table><thead><tr><th>Vendedor</th><th>Clientes</th><th>Empresas</th><th>Iniciados</th><th>Finalizados</th><th>Ativos</th><th>Atenção</th><th>Status atuais</th><th>Estados</th><th>Faturamento</th></tr></thead><tbody>${rows}</tbody></table></div></section><section class="activity-section"><div class="section-title-row"><div><div class="eyebrow">Auditoria</div><h2>Histórico de atividades</h2></div></div><div class="activity-list">${acts.length?acts.map(a=>`<div class="activity-row"><span class="avatar tiny">${escapeHTML((profileName(a.actor_user_id)||'?').slice(0,1))}</span><div><b>${escapeHTML(profileName(a.actor_user_id))}</b><p>${escapeHTML(a.description)}</p><small>${new Date(a.created_at).toLocaleString('pt-BR')}</small></div></div>`).join(''):'<div class="empty mini">Nenhuma atividade no período.</div>'}</div></section>`;
}

saveQuoteDraft = async function(draft,m){
  if(!draft.items.length)return toast('Adicione pelo menos um produto.','err');for(const item of draft.items)if(!item.product_name)return toast('Selecione o produto em todos os itens.','err');const project=await getLatestProject(currentWorkspace.id);const payload={owner_id:accountOwnerId(),workspace_id:currentWorkspace.id,title:draft.title.trim()||'Orçamento',delivery_term:draft.delivery_term.trim()||null,delivery_date:draft.delivery_date||null,notes:draft.notes.trim()||null,project_id:project?.id||null,updated_by:session.user.id,updated_at:nowISO()};let quoteId=draft.id;if(quoteId){const {error}=await supabase.from('z19p_quotes').update(payload).eq('id',quoteId);if(error)return toast(error.message,'err');const {error:de}=await supabase.from('z19p_quote_items').delete().eq('quote_id',quoteId);if(de)return toast(de.message,'err');}else{payload.created_by=session.user.id;const {data,error}=await supabase.from('z19p_quotes').insert(payload).select().single();if(error)return toast(error.message,'err');quoteId=data.id;}const rows=draft.items.map((item,i)=>({owner_id:accountOwnerId(),quote_id:quoteId,product_id:item.product_id||null,product_name:item.product_name,quantity:Math.max(1,parseInt(item.quantity)||1),pricing_mode:item.pricing_mode,piece_price:item.pricing_mode==='piece_plus_print'?moneyNumber(item.piece_price):null,total_unit_price:item.pricing_mode==='total_unit'?moneyNumber(item.total_unit_price):null,prints:(item.prints||[]).map(p=>({placement:p.placement||'Frente',width_cm:String(p.width_cm||'').trim(),price:item.pricing_mode==='piece_plus_print'?moneyNumber(p.price):0})),sort_order:i,created_by:session.user.id,updated_by:session.user.id}));const {error}=await supabase.from('z19p_quote_items').insert(rows);if(error)return toast(error.message,'err');if(project&&payload.delivery_date)await supabase.from('z19p_projects').update({delivery_date:payload.delivery_date,updated_at:nowISO(),updated_by:session.user.id}).eq('id',project.id);await logEvent(draft.id?'quote_updated':'quote_created',`${draft.id?'Atualizou':'Criou'} o orçamento “${payload.title}”`,{workspaceId:currentWorkspace.id,projectId:project?.id||null,entityType:'quote',entityId:quoteId});m.remove();toast('Orçamento salvo e disponível para o cliente.','ok');renderWorkspace(currentWorkspace.id);
};

const _baseCreateFolder=createFolder;
createFolder = async function(parentId=null){const parent=parentId?currentFolders.find(f=>f.id===parentId):null;const name=prompt(parent?`Nome da subpasta dentro de “${parent.name}”:`:'Nome da pasta:');if(!name?.trim())return;const {error}=await supabase.from('z19p_folders').insert({owner_id:accountOwnerId(),workspace_id:currentWorkspace.id,parent_id:parentId||null,name:name.trim(),sort_order:(currentFolders.length+1)*10,created_by:session.user.id,updated_by:session.user.id});if(error)return toast(error.message,'err');toast(parent?'Subpasta criada.':'Pasta criada.','ok');renderWorkspace(currentWorkspace.id);};

const _baseProcessQueue=processQueue;
processQueue = async function(m,{mockupMode=false}={}){
  if(!uploadQueue.length)return;
  if(uploadQueue.some(q=>!String(q.name||'').trim()))return toast('Dê um nome claro para cada arquivo antes de salvar.','err');
  if(uploadQueue.some(q=>q.type==='arte'&&!q.folderId))return toast('Escolha uma pasta para cada arte antes de salvar.','err');
  if(!mockupMode&&currentWorkspace?.workspace_type==='client'&&!clientUploadWithoutOrderEnabled&&!workspaceHasOfficialOrder(currentWorkspace.id))return toast('Este cliente ainda não possui pedido oficial. Libere temporariamente em Configurações ou sincronize o pedido.','err');

  const uploadWorkspace=currentWorkspace,uploadProjects=[...currentProjects],queue=[...uploadQueue],trim=mockupMode?false:$('#optTrim',m).checked,quality=mockupMode?'original':($('#qualityPreset',m)?.value||DEFAULT_QUALITY),btn=$('#processUpload',m),prog=$('#progress',m),status=$('#progressText',m),savedAssets=[];
  btn.disabled=true;prog.classList.remove('hidden');let done=0;
  const stage=text=>{if(status?.isConnected)status.textContent=text};

  for(const q of queue){
    try{
      const isMockup=q.type==='mockup',doTrim=isMockup?false:trim,qualityTarget=isMockup?0:(QUALITY_PRESETS[quality]||0);
      stage(`${mockupMode?'Salvando':'Processando'} ${done+1}/${queue.length}: ${q.name}`);
      const result=await processImage(q.file,{trim:doTrim,targetMax:qualityTarget,onStage:text=>stage(`${done+1}/${queue.length} · ${text}`)});
      const assetId=crypto.randomUUID(),base=`${session.user.id}/${uploadWorkspace.id}/${q.folderId||'root'}/${assetId}`,ext=(q.file.name.split('.').pop()||'bin').toLowerCase(),originalPath=`${base}/original.${ext}`,processedPath=`${base}/processed.png`;
      const officialProject=uploadProjects.find(project=>project.workspace_id===uploadWorkspace.id&&String(project.official_order_ref||'').trim())||null;
      const assetRow={id:assetId,owner_id:accountOwnerId(),workspace_id:uploadWorkspace.id,project_id:officialProject?.id||null,folder_id:q.folderId||null,name:q.name.trim(),asset_type:q.type,original_path:originalPath,processed_path:processedPath,mime_type:'image/png',size_bytes:result.blob.size,width:result.width,height:result.height,dpi:300,alpha_trimmed:doTrim,background_removed:false,maximized:Boolean(result.upscaled),created_by:session.user.id,updated_by:session.user.id,metadata:{print_ready_intent:q.type==='arte'&&Boolean(q.readyForPrint||productionModule?.folderInReadyTree?.(q.folderId||null)),source_name:q.file.name,source_size:q.file.size,source_width:result.sourceWidth,source_height:result.sourceHeight,quality_preset:quality,quality_target:qualityTarget||null,upscaled:result.upscaled,processing_engine:result.engine||'native'}};

      const uploadBytes=q.file.size+result.blob.size,updateUploadProgress=(step,progress,baseBytes)=>{const totalPercent=Math.min(100,Math.round((baseBytes+Number(progress.loaded||0))/uploadBytes*100)),fileProgress=(done+totalPercent/100)/queue.length*100;stage(`${done+1}/${queue.length} · Etapa ${step}/2 · ${step===1?'Original':'PNG final'} ${progress.percent}% · Total ${totalPercent}%`);if(prog.firstElementChild)prog.firstElementChild.style.width=Math.min(100,fileProgress)+'%'};
      await storageUploader.upload(originalPath,q.file,{contentType:q.file.type||'application/octet-stream',onProgress:progress=>updateUploadProgress(1,progress,0)});
      await storageUploader.upload(processedPath,result.blob,{contentType:'image/png',onProgress:progress=>updateUploadProgress(2,progress,q.file.size)});
      stage(`${done+1}/${queue.length} · Etapa 2/2 concluída · Salvando no cliente…`);
      const {data:saved,error}=await supabase.from('z19p_assets').insert(assetRow).select('*').single();if(error)throw error;
      savedAssets.push(saved||assetRow);done++;prog.firstElementChild.style.width=`${Math.round(done/queue.length*100)}%`;
    }catch(err){
      console.error('upload artwork',err);toast(`Erro em ${q.name}: ${err.message||err}`,'err');
    }
  }

  if(!done){
    stage('Não foi possível concluir o arquivo. Nenhuma arte nova foi salva.');
    btn.disabled=false;return;
  }

  stage(`Concluído: ${done} de ${queue.length}. Abrindo tamanho e posição…`);
  uploadQueue.forEach(item=>item.preview&&URL.revokeObjectURL(item.preview));uploadQueue=[];m.remove();
  try{
    if(savedAssets.length&&officialOrders&&uploadWorkspace?.workspace_type==='client'){
      await officialOrders.offerAfterUpload(savedAssets,{workspace:uploadWorkspace,projects:uploadProjects,allowWithoutOrder:clientUploadWithoutOrderEnabled});
    }else if(uploadWorkspace?.id){
      await renderWorkspace(uploadWorkspace.id);
    }
  }catch(error){
    console.error('placement after upload',error);toast((error.message||'Arte salva, mas não foi possível abrir tamanho e posição.')+' A arte continua salva no cliente.','err');
    if(uploadWorkspace?.id)await renderWorkspace(uploadWorkspace.id);
  }
};

const VIDEO_MAX_BYTES=50*1024*1024;
function isVideoAsset(a){return a?.asset_type==='video'||String(a?.mime_type||'').startsWith('video/');}
function videoExtension(a){const m=String(a?.mime_type||'').toLowerCase();if(m.includes('quicktime'))return 'mov';if(m.includes('webm'))return 'webm';return 'mp4';}
function videoDurationLabel(a){const sec=Math.round(Number(a?.metadata?.duration_seconds)||0);if(!sec)return '';const m=Math.floor(sec/60),s=sec%60;return m?`${m}:${String(s).padStart(2,'0')}`:`${s}s`;}
async function getVideoMetadata(file){return new Promise(resolve=>{const v=document.createElement('video'),url=URL.createObjectURL(file),finish=(out={})=>{URL.revokeObjectURL(url);resolve(out)};v.preload='metadata';v.muted=true;v.playsInline=true;v.onloadedmetadata=()=>finish({duration:Number.isFinite(v.duration)?v.duration:null,width:v.videoWidth||null,height:v.videoHeight||null});v.onerror=()=>finish({duration:null,width:null,height:null});v.src=url;});}
async function forceDownloadRaw(path,name,mime,ext){try{const r=await fetch(publicUrl(path));if(!r.ok)throw new Error('Falha ao baixar');const blob=await r.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${slug(name)||'arquivo'}.${ext||'bin'}`;link.rel='noopener';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);toast('Arquivo preparado para download.','ok');}catch(e){console.error(e);toast('Não foi possível baixar o arquivo.','err');}}
const _downloadAssetImage=downloadAsset;
downloadAsset=function(a){if(!a)return;if(isVideoAsset(a)){const path=a.original_path||a.processed_path;if(path)return forceDownloadRaw(path,a.name,a.mime_type,videoExtension(a));}return _downloadAssetImage(a);};
function videoDemoDescription(a){return String(a?.metadata?.description||'').trim();}
function videoDemoLink(a){const t=a?.quality_share_token||a?.share_token;return t?`${location.origin}/qualidades.html?p=${encodeURIComponent(t)}`:`${location.origin}/qualidades.html`;}
function buildDemoWhatsAppMessage(w,videos,{fullCatalog=false}={}){
  const client=w.client_name||w.company_name||'cliente',seller=currentProfile?.full_name||'equipe Zero 19';
  if(fullCatalog||videos.length!==1)return `👕 *Demonstrações de qualidade — Zero 19*

Olá, *${client}*! Aqui é ${seller}. Preparei uma página com nossas qualidades para você comparar tecido, composição, medidas e valores.

👉 *Clique no link abaixo para ver todas as demonstrações:*
${location.origin}/qualidades.html

Se quiser, me chama por aqui que eu te ajudo a escolher a melhor opção. 🙂`;
  const a=videos[0],desc=videoDemoDescription(a)||'Demonstração de qualidade';
  return `👕 *Demonstração de qualidade — Zero 19*

Olá, *${client}*! Aqui é ${seller}. Separei esta opção para você conhecer melhor:

🎥 *${desc}*

👉 *Clique no link abaixo para abrir diretamente esta qualidade:*
${videoDemoLink(a)}

Na mesma página você também pode comparar outras opções. 🙂`;
}
function openVideoUploadModal(){
  let videoQueue=[];const m=document.createElement('div');m.className='modal-backdrop';m.innerHTML=`<div class="modal wide upload-modal"><div class="modal-head"><div><div class="eyebrow">Biblioteca de qualidade</div><h2>Adicionar vídeos de demonstração</h2><p class="modal-sub">Cadastre o nome e a descrição que o cliente verá no link de demonstração.</p></div><button class="btn ghost small close">×</button></div><div class="dropzone" id="videoDropzone"><div class="dz-icon">▶</div><h3>Selecione um ou vários vídeos</h3><p>MP4, MOV ou WEBM • até 50 MB por vídeo • arquivo original, sem reduzir qualidade.</p><input id="videoInput" type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" multiple hidden><button class="btn primary" id="chooseVideos" style="margin-top:12px">Escolher vídeos</button></div><div id="videoUploadList" class="upload-list"></div><div class="progress hidden" id="videoProgress"><div></div></div><div id="videoProgressText" class="hint" style="margin-top:7px"></div><div class="modal-footer"><button class="btn close" type="button">Cancelar</button><button class="btn primary" id="saveVideos" disabled>Salvar vídeos</button></div></div>`;document.body.appendChild(m);$$('.close',m).forEach(b=>b.onclick=()=>m.remove());
  const input=$('#videoInput',m),dz=$('#videoDropzone',m),list=$('#videoUploadList',m),save=$('#saveVideos',m);$('#chooseVideos',m).onclick=()=>input.click();input.onchange=()=>add([...input.files]);dz.ondragover=e=>{e.preventDefault();dz.classList.add('drag')};dz.ondragleave=()=>dz.classList.remove('drag');dz.ondrop=e=>{e.preventDefault();dz.classList.remove('drag');add([...e.dataTransfer.files].filter(f=>f.type.startsWith('video/')))};
  function draw(){list.innerHTML=videoQueue.map((q,i)=>`<div class="upload-row video-upload-row"><div class="video-upload-icon">▶</div><div class="upload-name"><label>Nome</label><input data-i="${i}" data-k="name" value="${escapeHTML(q.name)}"></div><div><label>Pasta</label><select data-i="${i}" data-k="folderId"><option value="">Sem pasta</option>${folderOptionHTML(currentFolders,q.folderId||'')}</select></div><div class="video-file-meta"><b>${fmtBytes(q.file.size)}</b><small>${escapeHTML((q.file.name.split('.').pop()||'vídeo').toUpperCase())}</small></div><button class="remove-upload" data-remove="${i}" title="Remover">×</button><div class="video-description-field"><label>Descrição para o cliente</label><textarea data-i="${i}" data-k="description" placeholder="Ex.: Demonstração do toque, caimento e acabamento da camiseta Suedine 240 g/m².">${escapeHTML(q.description||'')}</textarea></div></div>`).join('');$$('input[data-i],select[data-i],textarea[data-i]',list).forEach(el=>el.oninput=()=>videoQueue[+el.dataset.i][el.dataset.k]=el.value);$$('[data-remove]',list).forEach(b=>b.onclick=()=>{videoQueue.splice(+b.dataset.remove,1);draw()});save.disabled=!videoQueue.length;}
  function add(files){for(const f of files){if(!f.type.startsWith('video/')&&!/\.(mp4|mov|webm)$/i.test(f.name)){toast(`${f.name}: formato não suportado.`,'err');continue;}if(f.size>VIDEO_MAX_BYTES){toast(`${f.name}: o limite atual é 50 MB por vídeo.`,'err');continue;}videoQueue.push({file:f,name:f.name.replace(/\.[^.]+$/,''),description:'',folderId:activeFolder!=='all'&&activeFolder!=='root'?activeFolder:''});}draw();}
  save.onclick=async()=>{if(!videoQueue.length)return;save.disabled=true;const prog=$('#videoProgress',m);prog.classList.remove('hidden');let done=0;for(const q of videoQueue){try{$('#videoProgressText',m).textContent=`Salvando ${done+1}/${videoQueue.length}: ${q.name}`;const meta=await getVideoMetadata(q.file),assetId=crypto.randomUUID(),ext=(q.file.name.split('.').pop()||videoExtension({mime_type:q.file.type})).toLowerCase(),base=`${accountOwnerId()}/${currentWorkspace.id}/${q.folderId||'root'}/${assetId}`,originalPath=`${base}/original.${ext}`;const up=await supabase.storage.from(BUCKET).upload(originalPath,q.file,{contentType:q.file.type||'video/mp4',upsert:false});if(up.error)throw up.error;const {error}=await supabase.from('z19p_assets').insert({id:assetId,owner_id:accountOwnerId(),workspace_id:currentWorkspace.id,folder_id:q.folderId||null,name:q.name.trim()||'Vídeo sem nome',asset_type:'video',original_path:originalPath,processed_path:null,mime_type:q.file.type||'video/mp4',size_bytes:q.file.size,width:meta.width,height:meta.height,dpi:300,alpha_trimmed:false,background_removed:false,maximized:false,created_by:session.user.id,updated_by:session.user.id,metadata:{source_name:q.file.name,source_size:q.file.size,duration_seconds:meta.duration||null,description:q.description.trim()}});if(error)throw error;done++;prog.firstElementChild.style.width=`${Math.round(done/videoQueue.length*100)}%`;}catch(err){console.error(err);toast(`Erro em ${q.name}: ${err.message||err}`,'err');}}$('#videoProgressText',m).textContent=`Concluído: ${done} de ${videoQueue.length}.`;toast(`${done} vídeo(s) salvo(s).`,'ok');setTimeout(()=>{m.remove();renderWorkspace(currentWorkspace.id)},400);};
}
function openVideoPreview(a){if(!a)return;const url=publicUrl(a.original_path||a.processed_path),dur=videoDurationLabel(a),desc=videoDemoDescription(a);const m=document.createElement('div');m.className='modal-backdrop';m.innerHTML=`<div class="modal preview-modal video-preview-modal"><div class="modal-head"><div><div class="eyebrow">Vídeo de demonstração</div><h2>${escapeHTML(a.name)}</h2></div><button class="btn ghost small close">×</button></div><div class="large-video-preview"><video src="${url}" controls playsinline preload="metadata"></video></div>${desc?`<div class="video-preview-description">${escapeHTML(desc)}</div>`:''}<div class="video-detail-line"><span>${fmtBytes(a.size_bytes)}</span>${dur?`<span>${dur}</span>`:''}${a.width&&a.height?`<span>${a.width}×${a.height}</span>`:''}</div><div class="modal-footer spread"><button class="btn whatsapp" id="videoDemonstrate">WA Demonstrar</button><button class="btn primary" id="videoDownload">${icon('download')} Baixar vídeo</button></div></div>`;document.body.appendChild(m);$('.close',m).onclick=()=>m.remove();$('#videoDownload',m).onclick=()=>downloadAsset(a);$('#videoDemonstrate',m).onclick=()=>openDemoComposer([a.id]);}
async function openDemoComposer(preselected=[]){
  await loadWorkspaces();const videos=currentAssets.filter(isVideoAsset);if(!videos.length)return toast('Adicione pelo menos um vídeo de demonstração.','err');const selectedId=preselected.find(Boolean)||'';const clients=workspaces.filter(w=>w.workspace_type==='client');const m=document.createElement('div');m.className='modal-backdrop';m.innerHTML=`<div class="modal wide demo-composer"><div class="modal-head"><div><div class="eyebrow">WhatsApp</div><h2>Enviar demonstrações de qualidade</h2><p class="modal-sub">Envie a página completa ou abra diretamente em uma qualidade específica. O cliente recebe apenas um link.</p></div><button class="btn ghost small close">×</button></div><div class="demo-composer-grid"><section><div class="demo-step-title"><b>1. O que enviar</b><span>um único link</span></div><label class="demo-video-choice"><input type="radio" name="demoMode" value="full" ${selectedId?'':'checked'}><span class="demo-video-choice-play">▦</span><span><b>Página completa</b><small>Todas as qualidades, preços, medidas e avaliações.</small></span></label><div class="demo-video-list">${videos.map(a=>`<label class="demo-video-choice"><input type="radio" name="demoMode" value="${a.id}" ${selectedId===a.id?'checked':''}><span class="demo-video-choice-play">▶</span><span><b>${escapeHTML(videoDemoDescription(a)||a.name)}</b><small>Abrir a página diretamente nesta demonstração.</small></span></label>`).join('')}</div></section><section><div class="demo-step-title"><b>2. Cliente</b><span>abre direto no WhatsApp</span></div><div class="search video-client-search">${icon('search')}<input id="demoClientSearch" placeholder="Buscar empresa, cliente ou telefone..."></div><div id="demoClientList" class="video-client-list">${clients.map(w=>`<button class="video-client-row demo-client-send" data-client="${w.id}" ${w.phone?'':'disabled'}><span class="video-client-avatar">${escapeHTML((w.company_name||'?').slice(0,1).toUpperCase())}</span><span><b>${escapeHTML(w.company_name)}</b><small>${escapeHTML(w.client_name||'Cliente não informado')}${w.phone?` • ${escapeHTML(w.phone)}`:' • sem WhatsApp'}</small></span><i>WA</i></button>`).join('')}</div></section></div></div>`;document.body.appendChild(m);$('.close',m).onclick=()=>m.remove();$('#demoClientSearch',m).oninput=e=>{const q=e.target.value.toLowerCase();$$('.demo-client-send',m).forEach(b=>{const w=clients.find(x=>x.id===b.dataset.client);b.style.display=`${w?.company_name||''} ${w?.client_name||''} ${w?.phone||''}`.toLowerCase().includes(q)?'flex':'none';});};$$('.demo-client-send',m).forEach(b=>b.onclick=async()=>{const w=clients.find(x=>x.id===b.dataset.client);if(!w?.phone)return;const mode=$('input[name="demoMode"]:checked',m)?.value||'full';let chosen=[];if(mode!=='full'){const asset=videos.find(v=>v.id===mode);if(!asset)return toast('Demonstração não encontrada.','err');const {data:links}=await supabase.from('z19p_quality_media').select('asset_id,z19p_quality_products(share_token,product_name,description)').eq('asset_id',asset.id).limit(1);const q=links?.[0]?.z19p_quality_products;chosen=[{...asset,quality_share_token:q?.share_token||asset.share_token,metadata:{...(asset.metadata||{}),description:q?.description||videoDemoDescription(asset)||q?.product_name||asset.name}}];}const msg=buildDemoWhatsAppMessage(w,chosen,{fullCatalog:mode==='full'}),phone=normalizeWaPhone(w.phone);window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,'_blank','noopener,noreferrer');});
}
async function openVideoShareClients(a){return openDemoComposer(a?[a.id]:[]);}
function openVideoActions(a){if(!a)return;const desc=videoDemoDescription(a),m=document.createElement('div');m.className='modal-backdrop';m.innerHTML=`<div class="modal compact"><div class="modal-head"><div><div class="eyebrow">Editar vídeo</div><h2>${escapeHTML(a.name)}</h2></div><button class="btn ghost small close">×</button></div><div class="form-grid"><div class="field full"><label>Nome do vídeo</label><input id="renameVideo" value="${escapeHTML(a.name)}"></div><div class="field full"><label>Descrição para o cliente</label><textarea id="videoDescription" placeholder="Explique o tecido, toque, caimento, acabamento ou o que este vídeo demonstra.">${escapeHTML(desc)}</textarea></div><div class="field full"><label>Pasta</label><select id="videoFolder"><option value="">Sem pasta</option>${folderOptionHTML(currentFolders,a.folder_id||'')}</select></div></div><div class="file-actions"><button class="btn" id="videoActionDownload">${icon('download')} Baixar vídeo</button><button class="btn" id="videoActionPreview">Visualizar</button><button class="btn whatsapp" id="videoActionShare">WA Demonstrar</button></div><div class="modal-footer"><button class="btn danger" id="deleteVideo">${icon('trash')} Excluir</button><div class="spacer"></div><button class="btn primary" id="saveVideo">Salvar alterações</button></div></div>`;document.body.appendChild(m);$('.close',m).onclick=()=>m.remove();$('#videoActionDownload',m).onclick=()=>downloadAsset(a);$('#videoActionPreview',m).onclick=()=>openVideoPreview(a);$('#videoActionShare',m).onclick=()=>openDemoComposer([a.id]);$('#saveVideo',m).onclick=async()=>{const name=$('#renameVideo',m).value.trim(),description=$('#videoDescription',m).value.trim();if(!name)return toast('Digite um nome para o vídeo.','err');const metadata={...(a.metadata||{}),description};const {error}=await supabase.from('z19p_assets').update({name,folder_id:$('#videoFolder',m).value||null,metadata,updated_by:session.user.id,updated_at:nowISO()}).eq('id',a.id);if(error)return toast(error.message,'err');m.remove();toast('Vídeo atualizado.','ok');renderWorkspace(currentWorkspace.id);};$('#deleteVideo',m).onclick=async()=>{if(!confirm(`Excluir “${a.name}” definitivamente?`))return;const paths=[a.original_path,a.processed_path].filter(Boolean);if(paths.length){const {error:se}=await supabase.storage.from(BUCKET).remove(paths);if(se)return toast('Não foi possível apagar o vídeo do armazenamento.','err');}const {error}=await supabase.from('z19p_assets').delete().eq('id',a.id);if(error)return toast(error.message,'err');m.remove();toast('Vídeo excluído.','ok');renderWorkspace(currentWorkspace.id);};}

const _renderAssetsBase=renderAssets;
renderAssets = function(items){
  if(!items.length)return _renderAssetsBase(items);
  return items.map(a=>{const url=publicUrl(a.processed_path||a.original_path),q=a.metadata?.quality_target?`${a.metadata.quality_target}px`:'';if(isVideoAsset(a)){const dur=videoDurationLabel(a),desc=videoDemoDescription(a);return `<article class="asset-card clean video-asset-card" data-asset="${a.id}"><button class="preview-wrap asset-preview-btn video-card-preview" data-id="${a.id}" aria-label="Visualizar ${escapeHTML(a.name)}"><span class="badge">VÍDEO</span><video src="${url}#t=0.1" muted playsinline preload="metadata"></video><span class="video-play-mark">▶</span></button><div class="asset-body"><div class="asset-title-row"><h4 title="${escapeHTML(a.name)}">${escapeHTML(a.name)}</h4><button class="icon-more more-asset" data-id="${a.id}">•••</button></div>${desc?`<p class="video-card-description">${escapeHTML(desc)}</p>`:''}<div class="asset-owner">Enviado por <b>${escapeHTML(profileName(a.created_by))}</b></div><div class="asset-meta"><span>${fmtBytes(a.size_bytes)}</span>${dur?`<span>${dur}</span>`:''}${a.width&&a.height?`<span>${a.width}×${a.height}</span>`:''}</div><div class="asset-actions video-actions"><button class="btn small dl-asset" data-id="${a.id}">${icon('download')} Baixar</button><button class="btn whatsapp small demonstrate-video" data-id="${a.id}">WA Demonstrar</button></div></div></article>`;}return `<article class="asset-card clean" data-asset="${a.id}"><button class="preview-wrap asset-preview-btn" data-id="${a.id}" aria-label="Visualizar ${escapeHTML(a.name)}"><span class="badge">${a.asset_type==='mockup'?'MOCKUP':'ARTE'}</span><img loading="lazy" decoding="async" src="${publicUrl(assetPreviewPath(a))}" alt="${escapeHTML(a.name)}"></button><div class="asset-body"><div class="asset-title-row"><h4 title="${escapeHTML(a.name)}">${escapeHTML(a.name)}</h4><button class="icon-more more-asset" data-id="${a.id}">•••</button></div><div class="asset-owner">Enviado por <b>${escapeHTML(profileName(a.created_by))}</b></div><div class="asset-meta"><span>${a.width||'?'}×${a.height||'?'}</span>${a.asset_type==='arte'&&a.alpha_trimmed?'<span>sem prancheta</span>':''}${q?`<span>${q}</span>`:''}</div><div class="asset-actions"><button class="btn small dl-asset" data-id="${a.id}">${icon('download')} Baixar PNG</button></div></div></article>`}).join('');
};
bindAssetCards = function(){
  $$('.asset-preview-btn').forEach(b=>b.onclick=()=>{const a=currentAssets.find(x=>x.id===b.dataset.id);isVideoAsset(a)?openVideoPreview(a):openAssetPreview(a);});
  $$('.dl-asset').forEach(b=>b.onclick=()=>downloadAsset(currentAssets.find(a=>a.id===b.dataset.id)));
  $$('.more-asset').forEach(b=>b.onclick=()=>{const a=currentAssets.find(x=>x.id===b.dataset.id);isVideoAsset(a)?openVideoActions(a):openAssetActions(a);});
  $$('.demonstrate-video').forEach(b=>b.onclick=()=>openDemoComposer([b.dataset.id]));
  bindStudioAssetCards();
  productionModule?.enhanceAssetCards?.();
};


renderQuotesAdmin = function(){
  if(!currentQuotes.length)return `<div class="quote-empty"><div><b>Nenhum orçamento criado</b><span>Monte o orçamento e ele aparecerá automaticamente na área do cliente.</span></div><button class="btn primary small" id="newQuote">${icon('plus')} Criar orçamento</button></div>`;
  return `<div class="quote-list">${currentQuotes.map(q=>{
    const project=currentProjects.find(p=>p.id===q.project_id),closed=project&&(project.finalized_at||isFinalizedStatus(statusById(project.status_id))),pending=closed?[]:quotePreparationSummary(q);
    return `<article class="quote-summary"><div><div class="quote-title-line"><b>${escapeHTML(q.title||'Orçamento')}</b><span>${fmtMoney(quoteTotal(q))}</span></div><small>${q.service_type?escapeHTML(QUOTE_SERVICES[q.service_type]?.label||'Serviço')+' • ':''}${q.items?.length||0} item(ns)${q.delivery_term?` • Prazo: ${escapeHTML(q.delivery_term)}`:''} • por ${escapeHTML(profileName(q.created_by))}</small>${pending.length?`<small class="quote-preparation-pending">Próxima etapa: ${escapeHTML(pending.join('; '))}.</small>`:''}</div><div class="quote-actions"><button class="btn small edit-quote" data-id="${q.id}">${icon('edit')} ${q.service_type&&q.payment_status==='paid'&&!closed?'Preparar pedido':'Editar'}</button><button class="btn ghost small delete-quote" data-id="${q.id}">${icon('trash')}</button></div></article>`;
  }).join('')}</div>`;
};

openWorkspaceActions = function(w){
  if(!w)return;const m=document.createElement('div');m.className='modal-backdrop';m.innerHTML=`<div class="modal action-sheet"><div class="modal-head"><div><div class="eyebrow">Empresa</div><h2>${escapeHTML(w.company_name)}</h2></div><button class="btn ghost small close">×</button></div><div class="action-list">${w.phone?`<button class="action-item whatsapp-item" id="waChat">WA<span><b>Assumir e chamar no WhatsApp</b><small>${escapeHTML(w.phone)}</small></span></button>`:''}<button class="action-item" id="waEdit">${icon('edit')}<span><b>Editar dados</b><small>Nome, cliente, telefone, estado, status e responsável</small></span></button><button class="action-item" id="waShare">${icon('share')}<span><b>Copiar link do cliente</b><small>Compartilhar orçamento, artes e mockups</small></span></button><button class="action-item danger-item" id="waDelete">${icon('trash')}<span><b>Excluir empresa</b><small>Apaga ambiente, pastas e arquivos</small></span></button></div></div>`;document.body.appendChild(m);$('.close',m).onclick=()=>m.remove();$('#waChat',m)?.addEventListener('click',()=>{m.remove();claimWorkspace(w,{openChat:true})});$('#waEdit',m).onclick=()=>{m.remove();openWorkspaceModal(w)};$('#waShare',m).onclick=()=>copyShare(w.share_token);$('#waDelete',m).onclick=()=>deleteWorkspace(w,m);
};

renderWorkspace = async function(id){
  const stillCurrent=accountReadGuard(true);if(!await loadTeamContext({reuseRoute:true})||!stillCurrent())return;await ensureDefaults();if(!stillCurrent())return;await Promise.all([loadConfig(),loadCommissionContext()]);if(!stillCurrent())return;const [{data:w,error:we},{data:f,error:fe},{data:a,error:ae},{data:ps,error:pe}]=await Promise.all([supabase.from('z19p_workspaces').select('*').eq('id',id).single(),supabase.from('z19p_folders').select('*').eq('workspace_id',id).order('sort_order').order('name'),supabase.from('z19p_assets').select('*').eq('workspace_id',id).order('created_at',{ascending:false}),supabase.from('z19p_projects').select('*').eq('workspace_id',id).order('sequence_no',{ascending:false})]);if(!stillCurrent())return;for(const [error,part] of [[we,'os dados da empresa'],[fe,'as pastas da empresa'],[ae,'as artes da empresa'],[pe,'os projetos da empresa']])if(error)throw new Error('Não foi possível carregar '+part+'. Verifique a conexão e tente novamente.');if(!w){toast('Ambiente não encontrado.','err');return nav('/');}currentWorkspace=w;currentProjects=ps||[];const isLibrary=w.workspace_type&&w.workspace_type!=='client',isMockupsLibrary=w.workspace_type==='library_mockups',isVideosLibrary=w.workspace_type==='library_videos',activeProject=currentProjects[0]||null;currentFolders=isLibrary?(f||[]):(f||[]).filter(folder=>activeProject?folder.project_id===activeProject.id:!folder.project_id);currentAssets=isLibrary?(a||[]):(a||[]).filter(asset=>activeProject?asset.project_id===activeProject.id:!asset.project_id);activeFolder='all';if(isLibrary)currentQuotes=[];else{await loadQuotes(id,activeProject?.id);if(!stillCurrent())return;}let audits=[];if(isAdmin()&&!isLibrary){const {data}=await supabase.from('z19p_audit_log').select('*').eq('workspace_id',id).order('created_at',{ascending:false}).limit(30);if(!stillCurrent())return;audits=data||[];}const st=statusById(w.status_id),logoFolder=currentFolders.find(x=>x.purpose==='logo_empresa'),logoAsset=logoFolder?currentAssets.find(a=>a.folder_id===logoFolder.id):null,logoUrl=logoAsset?publicUrl(logoAsset.processed_path||logoAsset.original_path):'',bannerIcon=logoUrl?`<div class="workspace-banner-logo"><img src="${logoUrl}" alt="Logo"></div>`:'';const bannerActions=isLibrary?`${isVideosLibrary?`<button class="btn" id="qualityCatalogAdmin">Gerenciar qualidades</button><button class="btn whatsapp" id="demoComposerBtn">WA Demonstrar</button>`:''}<button class="btn primary" id="uploadBtn">${icon('upload')} ${isVideosLibrary?'Salvar vídeo':isMockupsLibrary?'Adicionar mockup':'Subir arte'}</button>`:`${w.phone?`<button class="btn whatsapp" id="workspaceWhatsapp">WA WhatsApp</button>`:''}<button class="btn" id="mockupBtn">${icon('image')} Adicionar mockup</button><button class="btn primary" id="uploadBtn">${icon('upload')} Subir arte</button><button class="btn ghost" id="workspaceMore">•••</button>`;const attention=isLibrary?null:workspaceStatusAttention(w),statusAge=isLibrary?null:workspaceStatusDuration(w),agingNotice=attention?`<div class="workspace-aging-notice"><span class="attention-pulse"></span><div><b>${attention.reminder?escapeHTML(attention.label):`Status sem alteração há ${escapeHTML(attention.label)}`}</b><small>Entre em contato e atualize o andamento.</small></div>${w.phone?`<button class="btn whatsapp small" id="agingWhatsapp">WA WhatsApp</button>`:''}</div>`:'',statusAgeDetail=statusAge?`<div class="workspace-status-age" data-status-age-since="${escapeHTML(statusAge.changedAt.toISOString())}"><span class="status-age-dot"></span><span>Há <b>${escapeHTML(statusAge.label)}</b> neste status</span></div>`:'';
  const lifetime=currentProjects.reduce((o,p)=>{o.projects++;if(p.finalized_at)o.finalized++;o.shirt+=moneyNumber(p.shirt_revenue);o.print+=moneyNumber(p.print_revenue);o.total+=moneyNumber(p.total_revenue);return o;},{projects:0,finalized:0,shirt:0,print:0,total:0});const latest=currentProjects[0];const teamInfo=isLibrary?'':`<section class="workspace-team-card"><div><small>Cadastrado por</small><b>${escapeHTML(profileName(w.created_by))}</b></div><div><small>Responsável atual</small><b>${escapeHTML(profileName(w.responsible_user_id))}</b></div>${!isFinalizedStatus(st)&&w.responsible_user_id!==session.user.id?`<button class="btn small" id="claimWorkspaceDetail">Puxar pra mim</button>`:''}${isAdmin()?`<select id="assignResponsible" class="btn compact-select">${teamProfiles.filter(p=>p.active).map(p=>`<option value="${p.id}" ${w.responsible_user_id===p.id?'selected':''}>${escapeHTML(p.full_name)}</option>`).join('')}</select>`:''}</section>`;
  const lifetimeHTML=isLibrary?'':`<section class="lifetime-summary"><div><small>Projetos</small><b>${lifetime.projects}</b></div><div><small>Finalizados</small><b>${lifetime.finalized}</b></div><div><small>Camisas</small><b>${fmtMoney(lifetime.shirt)}</b></div><div><small>Estampas</small><b>${fmtMoney(lifetime.print)}</b></div><div class="total"><small>Total da empresa</small><b>${fmtMoney(lifetime.total)}</b></div></section>`;
  const projectHistory=isLibrary?'':`<section class="project-history"><div class="section-title-row"><div><div class="eyebrow">Projetos</div><h2>Histórico da empresa</h2></div></div><div class="project-history-list">${currentProjects.length?currentProjects.map(p=>{const pst=statusById(p.status_id),when=p.finalized_at||p.desisted_at||p.started_at;return `<div class="project-history-row"><div><b>${escapeHTML(p.title||`Projeto ${p.sequence_no}`)}</b><small>Iniciado em ${new Date(p.started_at).toLocaleDateString('pt-BR')} • ${escapeHTML(profileName(p.responsible_user_id||p.created_by))}</small></div><span>${pst?escapeHTML(pst.name):'Sem status'}</span><strong>${p.finalized_at?fmtMoney(p.total_revenue):when?new Date(when).toLocaleDateString('pt-BR'):'—'}</strong></div>`}).join(''):'<div class="empty mini">Nenhum projeto registrado.</div>'}</div></section>`;
  const controls=isLibrary?'':`${workspaceSpecialCallout(w)}${agingNotice}<div class="workspace-control-row"><div class="workspace-status-block"><div class="workspace-status-control"><span class="status-dot" style="--status:${escapeHTML(st?.color||'#555')}"></span><div><small>Status da empresa</small><select id="workspaceStatus" class="status-select"><option value="">Sem status</option>${statusOptions(w.status_id)}</select></div></div>${statusAgeDetail}</div><div class="share-strip compact-share"><div class="share-info"><span class="share-status ${w.share_enabled?'on':''}"></span><div><b>Área do cliente</b><small>${w.share_enabled?'Link ativo':'Link desativado'}</small></div></div><div class="share-actions"><button class="btn small" id="copyShare">${icon('copy')} Copiar link</button><label class="switch"><input type="checkbox" id="shareEnabled" ${w.share_enabled?'checked':''}><span></span></label></div></div></div>`;const quoteSection=isLibrary?'':`<section class="quotes-admin"><div class="section-title-row"><div><div class="eyebrow">Comercial</div><h2>Orçamento</h2><p>O cliente visualiza este orçamento no próprio ambiente.</p></div>${currentQuotes.length?`<button class="btn small" id="addQuote">${icon('plus')} Novo orçamento</button>`:''}</div>${renderQuotesAdmin()}</section>`;const activity=isLibrary||!isAdmin()?'':`<section class="activity-section workspace-activity"><div class="section-title-row"><div><div class="eyebrow">Histórico</div><h2>Quem fez o quê</h2></div></div><div class="activity-list">${audits.length?audits.map(x=>`<div class="activity-row"><span class="avatar tiny">${escapeHTML(profileName(x.actor_user_id).slice(0,1))}</span><div><b>${escapeHTML(profileName(x.actor_user_id))}</b><p>${escapeHTML(x.description)}</p><small>${new Date(x.created_at).toLocaleString('pt-BR')}</small></div></div>`).join(''):'<div class="empty mini">Ainda sem histórico.</div>'}</div></section>`;const sideTitle=isLibrary?(isVideosLibrary?'Pastas de vídeos':isMockupsLibrary?'Pastas de mockups':'Pastas de artes'):'Pastas da empresa',kindLabel=isLibrary?(isVideosLibrary?'Biblioteca de vídeos':isMockupsLibrary?'Biblioteca de mockups':'Biblioteca de artes'):'Empresa',meta=isLibrary?(isVideosLibrary?'Salve demonstrações de qualidade, baixe quando quiser e encaminhe aos clientes pelo WhatsApp.':isMockupsLibrary?'Organize seus mockups e acesse do celular ou computador.':'Organize suas artes em pastas e subpastas e acesse de qualquer dispositivo.'):`${escapeHTML(w.client_name||'Cliente não informado')} ${w.phone?`• ${escapeHTML(w.phone)}`:''}`,typeFilter=isLibrary?'':`<select id="typeFilter" class="btn compact-select"><option value="all">Tudo</option><option value="arte">Artes</option><option value="mockup">Mockups</option></select>`;
  app.innerHTML=shell(`<main class="container simple-container"><div class="workspace-banner clean library-aware">${bannerIcon}<div><div class="eyebrow">${kindLabel}${latest?` • ${escapeHTML(latest.title||`Projeto ${latest.sequence_no}`)}`:''}</div><h1>${escapeHTML(w.company_name)}</h1><div class="meta">${meta}</div></div><div class="spacer"></div>${bannerActions}</div>${teamInfo}${lifetimeHTML}${controls}${projectHistory}${quoteSection}<div class="workspace-layout clean-layout"><aside class="sidebar"><div class="side-title"><b>${sideTitle}</b><button class="btn ghost small" id="newFolder">${icon('plus')}</button></div><button class="folder active" data-folder="all">${icon('image')} <span>Todos</span></button><button class="folder" data-folder="root">${icon('folder')} <span>Sem pasta</span></button>${renderFolderTree()}</aside><section class="workspace-main"><div class="toolbar clean-toolbar asset-toolbar"><div class="search">${icon('search')}<input id="assetSearch" placeholder="Buscar arquivo..."></div>${typeFilter}</div><div id="assetGrid" class="asset-grid clean-assets">${renderAssets(currentAssets)}</div></section></div>${activity}</main>`,{back:true});bindCommon();bindWorkspaceUI();if(!isLibrary){bindQuoteAdmin();updateStatusAgeLabels();dashboardAgingTimer=setInterval(()=>{if(route().startsWith('/ambiente/'))updateStatusAgeLabels();},60000);}$('#claimWorkspaceDetail')?.addEventListener('click',()=>claimWorkspace(currentWorkspace,{openChat:true}));$('#assignResponsible')?.addEventListener('change',async e=>{const id=e.target.value;await supabase.from('z19p_workspaces').update({responsible_user_id:id,updated_at:nowISO()}).eq('id',w.id);const p=await getLatestProject(w.id);if(p)await supabase.from('z19p_projects').update({responsible_user_id:id,updated_at:nowISO()}).eq('id',p.id);await logEvent('assigned',`Atribuiu o atendimento para ${profileName(id)}`,{workspaceId:w.id,projectId:p?.id||null});renderWorkspace(w.id);});
};

function updateStatusAgeLabels(root=document){
  $$('[data-status-age-since]',root).forEach(el=>{
    const t=new Date(el.dataset.statusAgeSince||'').getTime();
    if(!Number.isFinite(t))return;
    const b=el.querySelector('b');
    if(b)b.textContent=formatStatusAge(Date.now()-t);
  });
}

bindWorkspaceUI = function(){
  const isLibrary=currentWorkspace?.workspace_type&&currentWorkspace.workspace_type!=='client',isMockupsLibrary=currentWorkspace?.workspace_type==='library_mockups',isVideosLibrary=currentWorkspace?.workspace_type==='library_videos';$('#workspaceMore')?.addEventListener('click',()=>openWorkspaceActions(currentWorkspace));$('#workspaceWhatsapp')?.addEventListener('click',()=>claimWorkspace(currentWorkspace,{openChat:true}));$('#agingWhatsapp')?.addEventListener('click',()=>claimWorkspace(currentWorkspace,{openChat:true}));$('#workspaceStatus')?.addEventListener('change',async e=>{const ok=await updateWorkspaceStatus(currentWorkspace.id,e.target.value||null,{rerender:true});if(!ok)renderWorkspace(currentWorkspace.id);});$('#uploadBtn')?.addEventListener('click',()=>isVideosLibrary?openVideoUploadModal():openUploadModal({presetType:isMockupsLibrary?'mockup':'arte'}));$('#demoComposerBtn')?.addEventListener('click',()=>openDemoComposer());$('#qualityCatalogAdmin')?.addEventListener('click',()=>{location.href='/comercial-admin.html?tab=quality'});$('#mockupBtn')?.addEventListener('click',()=>openUploadModal({presetType:'mockup'}));$('#newFolder')?.addEventListener('click',()=>createFolder(activeFolder!=='all'&&activeFolder!=='root'?activeFolder:null));$('#copyShare')?.addEventListener('click',()=>copyShare(currentWorkspace.share_token));$('#shareEnabled')?.addEventListener('change',async e=>{const {error}=await supabase.from('z19p_workspaces').update({share_enabled:e.target.checked}).eq('id',currentWorkspace.id);if(error)toast(error.message,'err');else{currentWorkspace.share_enabled=e.target.checked;toast(e.target.checked?'Link do cliente ativado.':'Link do cliente desativado.','ok');renderWorkspace(currentWorkspace.id);}});$$('.folder').forEach(b=>b.onclick=()=>{activeFolder=b.dataset.folder;$$('.folder').forEach(x=>x.classList.toggle('active',x===b));filterAssets();});$$('.folder-more').forEach(b=>b.onclick=e=>{e.stopPropagation();openFolderActions(currentFolders.find(f=>f.id===b.dataset.id));});$('#assetSearch')?.addEventListener('input',filterAssets);$('#typeFilter')?.addEventListener('change',filterAssets);bindAssetCards();bindEmptyActions();
};

renderPublic = async function(token){
  app.innerHTML=`<div class="public-shell"><div class="public-header"><div class="public-header-inner">${brandLogoHTML()}<div><h1>Carregando ambiente…</h1><p>019 Personalizações</p></div></div></div><div class="public-content"><div class="empty"><span class="loading"></span></div></div></div>`;const {data,error}=await supabase.rpc('z19p_get_public_workspace',{p_token:token});if(error||!data?.workspace)return app.innerHTML=`<div class="auth"><div class="auth-card"><div class="brand">${brandLogoHTML()}<div class="brand-title">019 Personalizações</div></div><h1>Link indisponível</h1><p>Esse ambiente não existe ou o compartilhamento foi desativado.</p></div></div>`;const w=data.workspace,assets=data.assets||[],folders=data.folders||[],quotes=data.quotes||[],mockups=assets.filter(a=>a.asset_type==='mockup'),files=assets.filter(a=>a.asset_type!=='mockup'&&a.asset_type!=='video'),r=w.responsible;const seller=r?`<section class="public-seller"><div class="avatar">${escapeHTML((r.name||'0').slice(0,1))}</div><div><small>Responsável pelo seu projeto</small><h3>${escapeHTML(r.name)}</h3><p>Atendimento das ${escapeHTML(w.service_hours||'9h às 18h')}</p></div>${r.phone?`<button class="btn whatsapp" id="publicSellerWa">WA Falar agora</button>`:''}</section>`:'';app.innerHTML=`<div class="public-shell"><div class="public-header"><div class="public-header-inner">${brandLogoHTML()}<div class="public-company"><div class="eyebrow">Área do cliente</div><h1>${escapeHTML(w.company_name)}</h1><p>${escapeHTML(w.client_name||'Artes e personalizações')}</p>${w.status?statusPill(w.status):''}</div></div></div><div class="public-content">${seller}${publicDiscoveryBannerHTML()}${renderPublicQuotes(quotes)}${mockups.length?`<section class="public-mockups"><div class="public-section-head"><div><div class="eyebrow">Mockup</div><h2>Como sua peça vai ficar</h2><p>Visual de referência do projeto.</p></div><div class="seg public-bg-control"><button data-bg="check" class="active">Transparente</button><button data-bg="white">Branco</button><button data-bg="black">Preto</button></div></div><div class="asset-grid public-mockup-grid">${renderPublicAssets(mockups,w.client_can_download)}</div></section>`:''}<section class="public-files"><div class="public-section-head"><div><div class="eyebrow">Arquivos</div><h2>Artes do projeto</h2><p>${files.length} arquivo(s) disponível(is)</p></div><div class="seg public-bg-control"><button data-bg="check" class="active">Transparente</button><button data-bg="white">Branco</button><button data-bg="black">Preto</button></div></div><div class="toolbar"><div class="search">${icon('search')}<input id="publicSearch" placeholder="Buscar arquivo..."></div><select class="btn" id="publicFolder"><option value="all">Todas as pastas</option><option value="root">Sem pasta</option>${folders.map(f=>`<option value="${f.id}">${escapeHTML(f.name)}</option>`).join('')}</select></div><div id="publicGrid" class="asset-grid">${renderPublicAssets(files,w.client_can_download)}</div></section></div></div>`;$('#publicSellerWa')?.addEventListener('click',()=>{const d=normalizeWaPhone(r.phone);if(d)window.open(`https://wa.me/${d}?text=${encodeURIComponent(`Olá, ${r.name}! Estou entrando em contato pelo meu projeto na Zero 19.`)}`,'_blank','noopener,noreferrer')});const bindBg=()=>{$$('.public-bg-control button').forEach(b=>b.onclick=()=>{const group=b.closest('.public-bg-control');$$('button',group).forEach(x=>x.classList.toggle('active',x===b));const section=b.closest('section');$$('.public-preview',section).forEach(p=>{p.classList.remove('white','black');if(b.dataset.bg!=='check')p.classList.add(b.dataset.bg);});});};const redraw=()=>{const q=($('#publicSearch')?.value||'').toLowerCase(),f=$('#publicFolder')?.value||'all',list=files.filter(a=>a.name.toLowerCase().includes(q)&&(f==='all'||(f==='root'&&!a.folder_id)||a.folder_id===f));replacePreviewMarkup($('#publicGrid'),renderPublicAssets(list,w.client_can_download));bindPublicDownload();};if($('#publicSearch'))$('#publicSearch').oninput=redraw;if($('#publicFolder'))$('#publicFolder').onchange=redraw;bindBg();bindPublicDownload();
};

officialOrders=createOfficialOrderWorkflow({
  supabase,bucket:BUCKET,accountOwnerId,userId:()=>session?.user?.id,publicUrl,toast,
  uploadFile:(path,blob,options)=>storageUploader.upload(path,blob,options),
  state:()=>({currentWorkspace,currentProjects,currentAssets,currentFolders,session}),
  onSaved:async()=>{if(currentWorkspace?.id)await renderWorkspace(currentWorkspace.id);}
});

productionModule=createProductionModule({
  supabase,app,escapeHTML,fmtMoney,quoteTotal,quoteItemUnit,publicUrl,setPngDpi,toast,nav,shell,bindCommon,
  accountOwnerId,profileName,logEvent,getLatestProject,startNewProject,createDefaultFoldersForWorkspace,
  renderWorkspace:(id)=>renderWorkspace(id),
  openProjectQuote:async(id,quoteId)=>{const current=accountReadGuard();await renderWorkspace(id);if(current()&&currentWorkspace?.id===id)openQuoteModal(quoteId?currentQuotes.find(quote=>quote.id===quoteId):null)},
  renderDashboard:()=>renderDashboard(),
  getCostUI:getProductionCosts,
  onFilmExported:details=>getProductionFinance()?.offerRecord(details),
  enhanceAdviceCards:()=>projectAdvisor?.decorateCards(),
  getFilmCommissions:items=>fetchFilmCommissions({supabase,owner:accountOwnerId,user:()=>session?.user?.id,isAdmin},items),
  isGarmentStudioEnabled:()=>garmentStudioEnabled,
  officialOrders,
  openArtMockup:async(asset,options)=>{if(await officialOrders?.openPlacementPreview?.(asset))return;return artStudio.openMockup(asset,options)},openArtEditor:(asset,options)=>artStudio.openEditor(asset,options),openArtGarment:(asset,options)=>garmentStudioEnabled?artStudio.openGarment(asset,options):null,
  openArt3D:asset=>garmentStudioEnabled?artStudio.openGarment(asset,{initialAction:'3d'}):null,openArtPresentation:asset=>garmentStudioEnabled?artStudio.openGarment(asset,{initialAction:'share3d'}):null,openArtBlank:asset=>garmentStudioEnabled?artStudio.openGarment(asset,{initialAction:'blank'}):null,
  prepareDashboard:async()=>{const stillCurrent=accountReadGuard(true);if(!await loadTeamContext({reuseRoute:true})||!stillCurrent())return;await ensureDefaults();if(!stillCurrent())return;await Promise.all([loadConfig(),loadWorkspaces(),loadProjects()]);},
  state:()=>({session,currentProfile,teamProfiles,workspaces,currentProjects,currentWorkspace,currentFolders,currentAssets,currentQuotes,statuses})
});

artStudio=createArtStudio({supabase,publicUrl,setPngDpi,toast,logEvent,accountOwnerId,getCostUI:getProductionCosts,isGarmentStudioEnabled:()=>garmentStudioEnabled,state:()=>({session}),onAssetChanged:async()=>{if(route().startsWith('/ambiente/')&&currentWorkspace)await renderWorkspace(currentWorkspace.id);else if(route()==='/filme')await productionModule.renderFilm()}});

projectAdvisor=createProjectAdvisorUI({supabase,app,accountOwnerId,route,nav,toast,state:()=>({workspaces,currentWorkspace,currentProjects,currentAssets,currentFolders,currentQuotes,statuses,teamProfiles,session}),openQuote:()=>openQuoteModal(),editWorkspace:workspace=>openWorkspaceModal(workspace),openPrintProfile:asset=>productionModule.openPrintProfile(asset),askDeliveryDate:initial=>productionModule.askDeliveryDate(initial),renderWorkspace:id=>renderWorkspace(id)});

const renderDashboardV216=renderDashboard;
renderDashboard=async function(){const stillCurrent=accountReadGuard(true);const ticket=!renderingRoute?routeViewport.begin(route()):null;await renderDashboardV216();if(!stillCurrent())return;const libraries=app.querySelector('.library-launcher'),zero19=libraryWorkspaces.library_zero19;if(zero19&&libraries&&!libraries.querySelector('[data-open-zero19]')){libraries.insertAdjacentHTML('afterbegin','<button class="library-card zero19-library-card" data-open-zero19><span class="library-symbol">019</span><span><b>Biblioteca ZERO19</b><small>Artes próprias da marca, separadas dos clientes.</small></span><i>→</i></button>');libraries.querySelector('[data-open-zero19]').onclick=()=>nav(`/ambiente/${zero19.id}`)}if(garmentStudioEnabled&&libraries&&!libraries.querySelector('[data-open-studio]')){libraries.insertAdjacentHTML('afterbegin','<button class="library-card studio-launch-card" data-open-studio><span class="library-symbol">◈</span><span><b>Estúdio de mockups</b><small>Comece pela camiseta. Monte frente, costas e mangas.</small></span><i>→</i></button>');libraries.querySelector('[data-open-studio]').onclick=()=>nav('/studio')}await productionModule.enhanceDashboard();if(!stillCurrent())return;await projectAdvisor.refreshDashboard();if(!stillCurrent())return;if(ticket)routeViewport.complete(ticket);};

const renderWorkspaceV216=renderWorkspace;
renderWorkspace=async function(id){
  const stillCurrent=accountReadGuard(true),ticket=!renderingRoute?routeViewport.begin(route()):null;
  await renderWorkspaceV216(id);if(!stillCurrent())return;
  if(currentWorkspace?.id===id&&currentWorkspace.workspace_type==='client'){
    await loadProjects();if(!stillCurrent())return;
    const w=currentWorkspace,banner=app.querySelector('.workspace-banner'),client=clientDisplayName(w),company=optionalCompanyName(w),resp=profileById(w.responsible_user_id);
    banner?.querySelector('h1')&&(banner.querySelector('h1').textContent=client);
    const meta=banner?.querySelector('.meta');if(meta)meta.textContent=[company,w.phone,resp?.full_name?'Responsável: '+resp.full_name:null].filter(Boolean).join(' • ');
    app.querySelector('#mockupBtn')?.remove();app.querySelector('#workspaceMore')?.remove();app.querySelector('.workspace-aging-notice')?.remove();app.querySelector('.workspace-control-row')?.remove();app.querySelector('.quotes-admin')?.remove();
    app.querySelector('.project-history')?.remove();app.querySelector('.lifetime-summary')?.remove();app.querySelector('.workspace-team-card')?.remove();app.querySelector('.workspace-activity')?.remove();
    const sidebar=app.querySelector('.workspace-layout .sidebar');sidebar?.remove();const layout=app.querySelector('.workspace-layout');layout?.classList.add('client-simple-layout');app.querySelector('#typeFilter')?.remove();
    const projects=currentProjects.filter(p=>p.workspace_id===id&&String(p.official_order_ref||'').trim()).sort((a,b)=>new Date(b.official_order_synced_at||b.updated_at||0)-new Date(a.official_order_synced_at||a.updated_at||0));
    const projectHtml=projects.length?projects.map(p=>{const date=p.official_order_synced_at?new Date(p.official_order_synced_at).toLocaleString('pt-BR'):'',status=p.official_order_status||'Sincronizado';return `<article class="client-project-row"><div><b>Pedido ${escapeHTML(p.official_order_ref)} · ${escapeHTML(p.title||'Pedido oficial')}</b><small>${date?escapeHTML(date)+' • ':''}${escapeHTML(status)}</small></div><span>Pedido oficial</span></article>`}).join(''):'<div class="empty mini">Nenhum pedido oficial sincronizado ainda.</div>';
    const warning=projects.length?'':`<div class="official-order-page-alert"><i></i><div><strong>Pendente de pedido oficial</strong><span>Este cliente ainda não recebeu um pedido sincronizado do outro sistema. Assim que o pedido oficial chegar, esta pendência desaparece automaticamente.</span></div></div>`;
    banner?.insertAdjacentHTML('afterend',warning+`<section class="client-projects-simple"><div class="section-title-row"><div><div class="eyebrow">Projetos</div><h2>Pedidos do cliente</h2><p>Somente pedidos oficiais sincronizados aparecem aqui.</p></div></div><div class="client-project-list">${projectHtml}</div></section>`);
    if(pendingQuickUploadWorkspaceId===id){pendingQuickUploadWorkspaceId=null;setTimeout(()=>{if(currentWorkspace?.id===id)openUploadModal({presetType:'arte'})},0);}
  }
  if(ticket)routeViewport.complete(ticket);
};

const renderPublicV216=renderPublic;
renderPublic=async function(token){await renderPublicV216(token);await productionModule.enhancePublic(token);};

const updateWorkspaceStatusV216=updateWorkspaceStatus;
updateWorkspaceStatus=async function(workspaceId,statusId,options={}){
  const next=statusById(statusId);
  if(next&&['art_work','ready_production','production'].includes(next.queue_stage)){
    const ok=await productionModule.changeOperationalStatus(workspaceId,statusId);
    if(ok){await loadWorkspaces();if(options.rerender)await renderWorkspace(workspaceId);}
    return ok;
  }
  return updateWorkspaceStatusV216(workspaceId,statusId,options);
};

const renderRouteV216=renderRoute;
const companyPortalAdmin=createCompanyPortalAdmin({app,supabase,shell,bindCommon,nav,toast,accountOwnerId,copyText,state:()=>({session})});
const companyOrderOperations=createCompanyOrderOperations({app,supabase,shell,bindCommon,nav,toast,accountOwnerId,escapeHTML,publicUrl,
  openPrintProfile:(asset,options)=>productionModule.openPrintProfile(asset,options),askDeliveryDate:date=>productionModule.askDeliveryDate(date),
  prepareDashboard:async()=>{const current=accountReadGuard(true);await loadConfig();if(!current())return;await Promise.all([loadWorkspaces(),loadProjects()]);},
  state:()=>({session,currentProfile,teamProfiles,workspaces,currentProjects,statuses,products})});
window.addEventListener('z19:account-changing',()=>{companyPortalAdmin.reset();companyOrderOperations.reset();});
const routeViewport=createRouteViewportController({getRoute:route,root:app});
let renderingRoute=false,routeRequested=false;
async function renderCurrentRoute(){
  const stillCurrent=accountReadGuard(true);
  if(dashboardAgingTimer){clearInterval(dashboardAgingTimer);dashboardAgingTimer=null;}
  const current=route();
  const accessParams=new URLSearchParams(location.search);
  if(accessParams.get('first_access')==='1'||accessParams.get('reset_password')==='1')return renderRouteV216();
  if(session&&!current.startsWith('/cliente/')&&!await loadTeamContext({reuseRoute:true}))throw new Error('Não foi possível confirmar o perfil desta conta. Tente novamente ou entre novamente.');
  if(!stillCurrent())return;
  if(session)await loadUiFeatureSettings();if(!stillCurrent())return;
  if(session&&(current==='/times'||current==='/filme'))await loadConfig();
  if(!stillCurrent())return;
  if(session&&current.startsWith('/fila/'))return nav('/filme');
  if(session&&current==='/times')return productionModule.renderTeams();
  if(session&&current==='/filme')return productionModule.renderFilm();
  if(session&&current==='/empresas-parceiras')return companyPortalAdmin.render();
  if(session&&current.startsWith('/pedido-empresa/'))return companyOrderOperations.renderPartnerOrder(current.split('/')[2]);
  if(session&&current==='/studio'){if(!garmentStudioEnabled){toast('Montar camiseta e 3D estão desativados em Configurações.','err');return nav('/')}return renderStudioHome({app,shell,bindCommon,artStudio,publicUrl,toast});}
  if(session&&current==='/financeiro-impressao'){
    if(canViewProductionCosts())return getProductionFinance().render();
    app.innerHTML=shell('<main class="container"><div class="empty"><h2>Acesso restrito</h2><p>Este financeiro é exclusivo do titular da conta.</p><button class="btn" data-nav="/">Voltar ao início</button></div></main>',{back:true});bindCommon();return;
  }
  return renderRouteV216();
};
renderRoute=async function(){
  routeRequested=true;if(renderingRoute)return;
  renderingRoute=true;
  try{
    while(routeRequested){
      routeRequested=false;const ticket=routeViewport.begin(route());
      routeAccessCheck={userId:session?.user?.id,epoch:accountContextEpoch,path:ticket.path,confirmed:false};
      try{await renderCurrentRoute()}catch(error){
        if(ticket.path!==route()||routeRequested){routeRequested=true;continue}
        console.error('Falha ao abrir tela',error);
        app.innerHTML=shell(`<main class="container"><div class="empty"><h2>Não foi possível abrir esta tela</h2><p>${escapeHTML(error?.message||'Confira a conexão e tente novamente.')}</p><button class="btn primary" id="retryCurrentRoute">Tentar novamente</button></div></main>`,{back:true});bindCommon();$('#retryCurrentRoute').onclick=()=>renderRoute();
      }
      if(ticket.path!==route()){routeRequested=true;continue}
      routeViewport.complete(ticket);
    }
  }finally{renderingRoute=false;routeAccessCheck=null}
};


init().catch(error=>{
  console.error('Falha ao iniciar o sistema',error);
  app.innerHTML=`<div class="auth"><div class="auth-card"><div class="brand">${brandLogoHTML()}</div><h1>Não foi possível iniciar o sistema</h1><p>${escapeHTML(error?.message||'Erro inesperado ao iniciar.')}</p><button class="btn primary" type="button" onclick="location.reload()">Tentar novamente</button></div></div>`;
});
