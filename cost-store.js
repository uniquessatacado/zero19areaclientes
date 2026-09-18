// Account-private cost configuration. Writes never silently fall back to localStorage.
import {validateRipSettings} from './rip-calibration.js?v=2.17.3';
const TABLE='z19p_production_cost_settings',MAX_BYTES=2*1024*1024,CHANNELS=['C','M','Y','K','W'];
const emptyData=()=>({version:1,activeProfileId:null,purchases:[],profiles:[]});
const resolve=value=>typeof value==='function'?value():value;
const failure=(code,message,cause)=>Object.assign(new Error(message),{code,cause});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const missingSchema=error=>['42P01','PGRST205'].includes(error?.code);
function numeric(value,label,{nullable=true,positive=false}={}){if(value==null&&nullable)return;if(typeof value!=='number'||!Number.isFinite(value)||(positive?value<=0:value<0))throw failure('COST_INVALID',`${label}: informe ${positive?'um número maior que zero':'zero ou um valor positivo'}${nullable?' (ou deixe sem informação)':''}.`);}
function textId(value,label){if(typeof value!=='string'||!value.trim()||value.length>300)throw failure('COST_INVALID',`${label} inválido.`);}
function jsonClone(value){
  const ancestors=new Set();
  const check=(node,depth=0)=>{if(depth>25)throw failure('COST_INVALID','Configuração muito aninhada.');if(node===null||['string','boolean'].includes(typeof node))return;if(typeof node==='number'){if(!Number.isFinite(node))throw failure('COST_INVALID','A configuração contém um número inválido.');return}if(typeof node!=='object'||ancestors.has(node)||(!Array.isArray(node)&&Object.getPrototypeOf(node)!==Object.prototype&&Object.getPrototypeOf(node)!==null))throw failure('COST_INVALID','A configuração precisa conter somente dados JSON.');ancestors.add(node);for(const [key,child] of Object.entries(node)){if(['__proto__','prototype','constructor'].includes(key))throw failure('COST_INVALID','Campo não permitido na configuração.');if(child===undefined&&!Array.isArray(node))continue;check(child,depth+1)}ancestors.delete(node)};
  check(value);const encoded=JSON.stringify(value);if(new TextEncoder().encode(encoded).length>MAX_BYTES)throw failure('COST_TOO_LARGE','A configuração deve ter no máximo 2 MB.');return JSON.parse(encoded);
}
export function validateProductionCostData(input){
  const data=jsonClone(input);if(!object(data)||data.version!==1||!Array.isArray(data.purchases)||!Array.isArray(data.profiles))throw failure('COST_INVALID','Configuração incompatível: use versão 1 com compras e perfis.');
  const purchaseIds=new Set(),profileIds=new Set();
  for(const purchase of data.purchases){
    if(!object(purchase))throw failure('COST_INVALID','Compra inválida.');textId(purchase.id,'Identificador da compra');textId(purchase.name,'Nome da compra');if(purchaseIds.has(purchase.id))throw failure('COST_INVALID','Há compras com o mesmo identificador.');purchaseIds.add(purchase.id);
    if(!['film','powder','ink'].includes(purchase.kind))throw failure('COST_INVALID','Tipo de insumo inválido.');numeric(purchase.quantity,'Quantidade comprada',{nullable:false,positive:true});numeric(purchase.totalPrice,'Preço total');if(purchase.totalPrice===undefined)purchase.totalPrice=null;
    if(purchase.kind==='film'&&(![30,60].includes(purchase.widthCm)||purchase.unit!=='m'))throw failure('COST_INVALID','Filme: use largura 30 ou 60 cm e quantidade em metros.');
    if(purchase.kind==='ink'&&(!CHANNELS.includes(purchase.channel)||purchase.unit!=='ml'))throw failure('COST_INVALID','Tinta: selecione o canal e use quantidade em ml.');
    if(purchase.kind==='powder'&&(!['white','black'].includes(purchase.color)||purchase.unit!=='g'))throw failure('COST_INVALID','Pó: selecione branco/preto e use quantidade em gramas.');
    if(purchase.purchasedAt!=null&&purchase.purchasedAt!==''&&(typeof purchase.purchasedAt!=='string'||!Number.isFinite(Date.parse(purchase.purchasedAt))))throw failure('COST_INVALID','Data da compra inválida.');
  }
  for(const profile of data.profiles){
    if(!object(profile))throw failure('COST_INVALID','Perfil inválido.');textId(profile.id,'Identificador do perfil');textId(profile.name,'Nome do perfil');if(profileIds.has(profile.id))throw failure('COST_INVALID','Há perfis com o mesmo identificador.');profileIds.add(profile.id);
    if(!['CMYW','CMYKW'].includes(profile.channelMode))throw failure('COST_INVALID','Modo de canais inválido.');
    validateRipSettings(profile.rip);
    for(const key of ['film30PurchaseId','film60PurchaseId','powderPurchaseId'])if(profile[key]!=null&&profile[key]!=='')textId(profile[key],'Compra selecionada');
    if(profile.inkPurchaseIds!=null){if(!object(profile.inkPurchaseIds))throw failure('COST_INVALID','Seleção de tintas inválida.');for(const [channel,id] of Object.entries(profile.inkPurchaseIds)){if(!CHANNELS.includes(channel))throw failure('COST_INVALID','Canal de tinta inválido.');if(id!=null&&id!=='')textId(id,'Compra de tinta')}}
    const calibration=profile.calibration;if(calibration!=null){if(!object(calibration))throw failure('COST_INVALID','Calibração inválida.');for(const [key,value] of Object.entries(calibration)){if(key==='inkMlPerM2'){if(!object(value))throw failure('COST_INVALID','Consumo de tintas inválido.');for(const [channel,amount] of Object.entries(value)){if(!CHANNELS.includes(channel))throw failure('COST_INVALID','Canal de calibração inválido.');numeric(amount,`Consumo ${channel}`)}}else if(key==='time30Mode'){if(!['proportional','measured'].includes(value))throw failure('COST_INVALID','Modo do tempo para 30 cm inválido.')}else numeric(value,`Calibração ${key}`)}}
  }
  if(data.activeProfileId==null||data.activeProfileId==='')data.activeProfileId=null;else if(!profileIds.has(data.activeProfileId))throw failure('COST_INVALID','O perfil ativo não existe nesta configuração.');
  return data;
}
export function exportProductionCostConfig(data){return JSON.stringify(validateProductionCostData(data),null,2);}
export function importProductionCostConfig(text){if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BYTES)throw failure('COST_TOO_LARGE','O arquivo deve ter no máximo 2 MB.');let parsed;try{parsed=JSON.parse(text)}catch{throw failure('COST_INVALID','Este arquivo não contém JSON válido.')}return validateProductionCostData(parsed);}

const canonical=value=>JSON.stringify(value,(_key,child)=>object(child)?Object.fromEntries(Object.keys(child).sort().map(key=>[key,child[key]])):child);
const same=(a,b)=>canonical(a)===canonical(b);
function migrationId(kind,original,value){const input=canonical(value);let hash=2166136261;for(let index=0;index<input.length;index++){hash^=input.charCodeAt(index);hash=Math.imul(hash,16777619)}return `local-${kind}-${String(original).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40)}-${(hash>>>0).toString(16)}`;}

// Union by stable IDs. Existing cloud entries are never overwritten by a legacy device copy.
export function mergeProductionCostDraft(cloudInput,localInput,{preserveBoth=false}={}){
  const cloud=validateProductionCostData(cloudInput),draft=validateProductionCostData(localInput),data=jsonClone(cloud),conflicts=[],summary={addedPurchases:0,addedProfiles:0,copiedPurchases:0,copiedProfiles:0,unchangedPurchases:0,unchangedProfiles:0};
  const purchaseMap=new Map(data.purchases.map(row=>[row.id,row])),profileMap=new Map(data.profiles.map(row=>[row.id,row])),purchaseIds=new Map(),profileIds=new Map();
  const addCopy=(rows,map,row,kind)=>{let key=migrationId(kind,row.id,row),suffix=1;const copyFor=id=>({...row,id,name:`${row.name.slice(0,260)} (deste aparelho)`});while(map.has(key)&&!same(map.get(key),copyFor(key)))key=`${migrationId(kind,row.id,row)}-${++suffix}`;if(!map.has(key)){const copy=copyFor(key);rows.push(copy);map.set(key,copy)}return key;};
  for(const row of draft.purchases){const existing=purchaseMap.get(row.id);if(!existing){data.purchases.push(row);purchaseMap.set(row.id,row);purchaseIds.set(row.id,row.id);summary.addedPurchases++}else if(same(existing,row)){purchaseIds.set(row.id,row.id);summary.unchangedPurchases++}else if(preserveBoth){purchaseIds.set(row.id,addCopy(data.purchases,purchaseMap,row,'compra'));summary.copiedPurchases++}else conflicts.push({kind:'purchase',id:row.id,name:row.name});}
  const remap=key=>purchaseIds.get(key)||key;
  for(const original of draft.profiles){const row=jsonClone(original);for(const key of ['film30PurchaseId','film60PurchaseId','powderPurchaseId'])if(row[key])row[key]=remap(row[key]);if(row.inkPurchaseIds)for(const channel of Object.keys(row.inkPurchaseIds))if(row.inkPurchaseIds[channel])row.inkPurchaseIds[channel]=remap(row.inkPurchaseIds[channel]);const existing=profileMap.get(row.id);if(!existing){data.profiles.push(row);profileMap.set(row.id,row);profileIds.set(row.id,row.id);summary.addedProfiles++}else if(same(existing,row)){profileIds.set(row.id,row.id);summary.unchangedProfiles++}else if(preserveBoth){profileIds.set(row.id,addCopy(data.profiles,profileMap,row,'perfil'));summary.copiedProfiles++}else conflicts.push({kind:'profile',id:row.id,name:row.name});}
  for(const [key,value] of Object.entries(draft)){if(['version','activeProfileId','purchases','profiles'].includes(key))continue;if(!(key in data))data[key]=value;else if(!same(data[key],value))conflicts.push({kind:'setting',id:key,name:key});}
  if(!data.activeProfileId&&draft.activeProfileId)data.activeProfileId=profileIds.get(draft.activeProfileId)||draft.activeProfileId;
  return {data:validateProductionCostData(data),summary,conflicts,canSync:conflicts.length===0,preserveBoth};
}

export function createProductionCostStore({supabase,owner,user,isAdmin,storage}={}){
  const accountId=resolve(owner);if(!accountId)throw failure('COST_ACCOUNT','Entre em uma conta para configurar os custos.');const key=`z19p:production-costs:v1:${accountId}`;
  let revision,available=false,loaded=false,busy=false,pendingMigration=null;
  const guard=()=>{if(resolve(owner)!==accountId)throw failure('COST_ACCOUNT_CHANGED','A conta mudou. Reabra a configuração de custos.');if(resolve(user)!==accountId||!resolve(isAdmin))throw failure('COST_PERMISSION','Custos de produção são exclusivos do titular da conta.');};
  const local=()=>{if(storage)return storage;try{return globalThis.localStorage}catch{return null}};
  const readDraft=()=>{try{const raw=local()?.getItem(key);if(!raw)return null;const draft=JSON.parse(raw);if(draft.ownerId!==accountId||draft.dirty!==true)return null;return {...draft,raw,data:validateProductionCostData(draft.data)}}catch{return null}};
  const clearLocalDraft=()=>{guard();throw failure('COST_LOCAL_PROTECTED','A cópia deste aparelho só é removida após sincronização confirmada na nuvem.');};
  const envelope=(data,mode,warning='',extra={})=>({data:validateProductionCostData(data),mode,warning,...extra});
  const draftInfo=draft=>({hasLocalDraft:Boolean(draft),localDraftData:draft?validateProductionCostData(draft.data):null,localDraftSavedAt:draft?.savedAt??null});
  async function queryCloud(){const result=await supabase.from(TABLE).select('owner_id,data,updated_at,updated_by').eq('owner_id',accountId).maybeSingle();guard();if(result.error)throw result.error;if(result.data&&(result.data.owner_id!==accountId||!result.data.updated_at))throw failure('COST_CLOUD_INVALID','A resposta da nuvem não identifica a conta ou versão esperada.');return {data:validateProductionCostData(result.data?.data??emptyData()),revision:result.data?.updated_at??null};}
  async function load({preferCloud=false}={}){
    guard();if(busy)throw failure('COST_BUSY','Aguarde o salvamento terminar.');const draft=readDraft();pendingMigration=null;
    try{const cloud=await queryCloud();available=true;loaded=true;revision=cloud.revision;
      const cloudEmpty=!cloud.data.purchases.length&&!cloud.data.profiles.length,plan=draft?mergeProductionCostDraft(cloud.data,draft.data):null;
      if(draft&&cloudEmpty&&!preferCloud)return envelope(draft.data,'local-draft','Cadastros antigos deste aparelho preservados, ainda não sincronizados. Use “Sincronizar cadastros deste aparelho” para enviá-los à nuvem sem recadastrar.',{updatedAt:draft.savedAt,cloudAvailable:true,cloudData:cloud.data,cloudEmpty:true,migrationConflicts:plan.conflicts,...draftInfo(draft)});
      return envelope(cloud.data,'cloud',draft?'A nuvem é a versão usada nesta conta. Também há cadastros antigos neste aparelho, preservados para sincronização explícita.':'',{updatedAt:revision,cloudAvailable:true,cloudEmpty,migrationConflicts:plan?.conflicts||[],...draftInfo(draft)});
    }catch(error){if(['COST_ACCOUNT_CHANGED','COST_PERMISSION'].includes(error?.code))throw error;available=false;loaded=true;revision=undefined;const reason=missingSchema(error)?'O cadastro de custos na nuvem ainda não foi habilitado.':'Não foi possível consultar os custos na nuvem.';return envelope(draft?.data??emptyData(),draft?'local-draft':'unavailable',`${reason} ${draft?'Os cadastros antigos deste aparelho foram preservados somente para leitura e exportação.':'Novos cadastros só podem ser salvos na nuvem.'}`,{cloudAvailable:false,updatedAt:draft?.savedAt??null,errorCode:error?.code??'COST_NETWORK',...draftInfo(draft)})}
  }
  async function writeCloud(data,expectedRevision){
      const payload={owner_id:accountId,data,updated_by:resolve(user)||null};let result;
      try{result=expectedRevision===null?await supabase.from(TABLE).insert(payload).select('owner_id,data,updated_at,updated_by').single():await supabase.from(TABLE).update({data,updated_by:payload.updated_by}).eq('owner_id',accountId).eq('updated_at',expectedRevision).select('owner_id,data,updated_at,updated_by').maybeSingle();}catch(error){throw failure('COST_SAVE_UNCONFIRMED','A conexão falhou durante o salvamento. Recarregue para conferir a nuvem. A cópia antiga deste aparelho foi preservada.',error)}
      guard();if(result.error){if(result.error.code==='23505')throw failure('COST_CONFLICT','Outro usuário já criou esta configuração. Recarregue antes de salvar.',result.error);throw failure(result.error.code||'COST_SAVE','Não foi possível salvar na nuvem. Nenhum rascunho local foi criado automaticamente. '+(result.error.message||''),result.error)}
      if(!result.data)throw failure('COST_CONFLICT','A configuração mudou em outra sessão ou não há permissão para alterá-la. Recarregue antes de salvar; suas alterações não foram enviadas.');
      let confirmed;try{confirmed=validateProductionCostData(result.data.data)}catch(error){throw failure('COST_SAVE_UNCONFIRMED','A resposta da nuvem veio incompleta. A cópia deste aparelho foi preservada; recarregue para conferir.',error)}
      if(result.data.owner_id!==accountId||!result.data.updated_at||!same(confirmed,data))throw failure('COST_SAVE_UNCONFIRMED','A nuvem não confirmou todos os cadastros enviados. A cópia deste aparelho foi preservada; recarregue para conferir.');
      revision=result.data.updated_at;available=true;loaded=true;return confirmed;
  }
  async function save(input,{localOnly=false}={}){
    guard();if(localOnly)throw failure('COST_LOCAL_DISABLED','Novos cadastros são salvos somente na nuvem. Exporte um JSON se precisar proteger alterações enquanto a conexão não está disponível.');if(busy)throw failure('COST_BUSY','Já existe um salvamento em andamento.');const data=validateProductionCostData(input);busy=true;
    try{if(!loaded||!available)throw failure('COST_CLOUD_UNAVAILABLE','A nuvem não está disponível. Recarregue e tente novamente. Nenhum novo cadastro foi salvo somente neste aparelho.');if(revision===undefined)throw failure('COST_CONFLICT','Recarregue a configuração da nuvem antes de salvar.');const confirmed=await writeCloud(data,revision);pendingMigration=null;const draft=readDraft();return envelope(confirmed,'cloud',draft?'Salvo na nuvem. A cópia antiga deste aparelho continua preservada para sincronização separada.':'',{updatedAt:revision,cloudAvailable:true,...draftInfo(draft)});
    }finally{busy=false}
  }
  async function prepareLocalDraftSync({preserveBoth=false}={}){
    guard();if(busy)throw failure('COST_BUSY','Aguarde o salvamento terminar.');busy=true;
    try{const draft=readDraft();if(!draft)throw failure('COST_NO_LOCAL_DRAFT','Não há cadastros antigos válidos neste aparelho para sincronizar.');const cloud=await queryCloud(),plan=mergeProductionCostDraft(cloud.data,draft.data,{preserveBoth});available=true;loaded=true;revision=cloud.revision;const token=globalThis.crypto.randomUUID();pendingMigration=plan.canSync?{...plan,token,raw:draft.raw,revision:cloud.revision,cloudData:cloud.data}:null;return {token:plan.canSync?token:null,canSync:plan.canSync,summary:plan.summary,conflicts:plan.conflicts,preserveBoth,cloudHasData:Boolean(cloud.data.purchases.length||cloud.data.profiles.length)};
    }finally{busy=false}
  }
  async function syncLocalDraft({token}={}){
    guard();if(busy)throw failure('COST_BUSY','Aguarde o salvamento terminar.');const plan=pendingMigration;if(!plan||token!==plan.token)throw failure('COST_MIGRATION_CONFIRM','Revise a sincronização antes de confirmar.');busy=true;
    try{const draft=readDraft();if(!draft||draft.raw!==plan.raw)throw failure('COST_CONFLICT','Os cadastros deste aparelho mudaram em outra aba. Revise a sincronização novamente.');const cloud=await queryCloud();if(cloud.revision!==plan.revision||!same(cloud.data,plan.cloudData))throw failure('COST_CONFLICT','Os cadastros na nuvem mudaram. Nenhum cadastro foi sobrescrito; revise a sincronização novamente.');const confirmed=await writeCloud(plan.data,plan.revision);let removed=false;try{const target=local();if(target?.getItem(key)===plan.raw){target.removeItem(key);removed=target.getItem(key)===null}}catch{}pendingMigration=null;return envelope(confirmed,'cloud',removed?'Cadastros deste aparelho sincronizados e confirmados na nuvem.':'Cadastros confirmados na nuvem. A cópia deste aparelho foi preservada porque mudou em outra aba ou não pôde ser removida.',{updatedAt:revision,cloudAvailable:true,synchronized:true,...draftInfo(readDraft())});
    }finally{busy=false}
  }
  return {load,save,prepareLocalDraftSync,syncLocalDraft,clearLocalDraft,exportLocalDraft:()=>{guard();const draft=readDraft();if(!draft)throw failure('COST_NO_LOCAL_DRAFT','Não há cadastros antigos válidos neste aparelho.');return exportProductionCostConfig(draft.data)},exportConfig:exportProductionCostConfig,importConfig:importProductionCostConfig};
}

// This is the commission for WHOLE PROJECTS, never an inferred artwork/job allocation.
export async function fetchFilmCommissions({supabase,owner,user,isAdmin},items=[]){
  const ownerId=resolve(owner),userId=resolve(user),admin=Boolean(resolve(isAdmin)),warnings=[];
  const result={scope:'project',enabled:false,projectTotal:0,rows:[],projectIds:[],warnings,complete:true,included:false};
  if(!ownerId||!userId)return {...result,projectTotal:null,complete:false,warnings:['Entre em uma conta para consultar comissões.']};
  const paged=async(table,columns,configure)=>{const records=[];for(let start=0;;start+=500){const response=await configure(supabase.from(table).select(columns).eq('owner_id',ownerId)).order('id').range(start,start+499);if(response.error)throw response.error;records.push(...(response.data||[]));if((response.data||[]).length<500)break;}return records;};
  try{
    const config=await supabase.from('z19p_commission_config').select('enabled').eq('owner_id',ownerId).maybeSingle();if(config.error)throw config.error;if(!config.data?.enabled)return result;result.enabled=true;
    const isAsset=item=>(item.type??item.kind)==='asset',assetId=item=>item.sourceId??item.assetId;
    const assetIds=[...new Set(items.filter(item=>isAsset(item)&&assetId(item)).map(assetId))],assets=[];
    for(let index=0;index<assetIds.length;index+=150)assets.push(...await paged('z19p_assets','id,project_id',query=>query.in('id',assetIds.slice(index,index+150))));
    const found=new Set(assets.map(asset=>asset.id));if(assetIds.some(id=>!found.has(id))){warnings.push('Algumas artes não foram encontradas ou não estão acessíveis; suas comissões não puderam ser verificadas.');result.complete=false}
    if(items.some(item=>!isAsset(item))||assets.some(asset=>!asset.project_id))warnings.push('Há itens sem projeto vinculado; não foi atribuída comissão automaticamente a eles.');
    result.projectIds=[...new Set(assets.map(asset=>asset.project_id).filter(Boolean))];const commissions=[];
    for(let index=0;index<result.projectIds.length;index+=150)commissions.push(...await paged('z19p_commissions','id,project_id,quote_id,seller_user_id,commission_amount,status',query=>query.in('project_id',result.projectIds.slice(index,index+150)).neq('status','rejected')));
    // Shares divide an existing commission and MUST NOT be added again to its full amount.
    const unique=[...new Map(commissions.map(row=>[row.id,row])).values()].filter(row=>row.status!=='rejected');
    let cents=0;for(const row of unique){const amount=Number(row.commission_amount);if(!Number.isFinite(amount)||amount<0){result.complete=false;warnings.push('Uma comissão tem valor inválido e não foi somada.');continue}cents+=Math.round(amount*100);result.rows.push({...row,commission_amount:amount})}
    result.projectTotal=cents/100;if(!admin){result.complete=false;warnings.push('Seu acesso pode mostrar apenas parte das comissões. O valor exibido não é o total garantido dos projetos.');}
    if(result.projectIds.length)warnings.push('Valor referente às comissões inteiras dos projetos, sem rateio por arte ou filme. Inclua somente após confirmar esse critério.');
    return result;
  }catch(error){return {...result,projectTotal:null,rows:[],complete:false,warnings:[...warnings,'Não foi possível consultar as comissões. Não considere esse valor como zero.'],errorCode:error?.code??'COMMISSION_READ_FAILED'}}
}
