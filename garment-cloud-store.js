import {normalizeGarmentScene} from './garment-scene.js?v=2.17.3';
import {createGarmentDraftStore} from './garment-draft.js?v=2.17.3';
const clone=value=>JSON.parse(JSON.stringify(value));
const uuid=value=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value||'');
const same=(a,b)=>JSON.stringify(normalizeGarmentScene(a))===JSON.stringify(normalizeGarmentScene(b));
const databaseError=error=>new Error(['42P01','PGRST205'].includes(error?.code)?'O cadastro de montagens na nuvem ainda não está disponível. Seus dados antigos foram preservados.':error?.message||'Não foi possível acessar as montagens na nuvem.');

// The database is canonical. Browser storage is READ ONLY except for removing a
// legacy draft after a verified, identical cloud write. No new local drafts.
export function createGarmentCloudStore(ctx,{storage}={}){
  const owner=ctx.accountOwnerId(),user=ctx.state().session?.user?.id;
  if(!owner||!user)throw new Error('Entre na conta para abrir suas montagens.');
  const guard=()=>{if(ctx.accountOwnerId()!==owner||ctx.state().session?.user?.id!==user)throw new Error('A conta mudou. Reabra o estúdio.');};
  const legacy=createGarmentDraftStore({owner:()=>{guard();return owner},storage});
  const parse=row=>{if(!row||row.owner_id!==owner||!uuid(row.id)||!Number.isFinite(Date.parse(row.updated_at))||!row.scene||row.scene.version!==1||!Array.isArray(row.scene.layers)||row.scene.layers.length>40)throw new Error('A montagem recebida é inválida. Nenhum dado foi alterado.');return {id:row.id,title:row.scene.title,scene:normalizeGarmentScene(row.scene),updatedAt:row.updated_at,revision:row.updated_at,storage:'cloud'};};
  const query=()=>ctx.supabase.from('z19p_garment_scenes');
  const readCloud=async id=>{guard();const result=await query().select('*').eq('owner_id',owner).eq('id',id).maybeSingle();guard();if(result.error)throw databaseError(result.error);return result.data?parse(result.data):null;};
  const localRecords=()=>legacy.list().map(record=>({...record,id:'legacy:'+record.id,legacyId:record.id,storage:'legacy-local'}));
  const list=async()=>{
    guard();let locals=[],warning='';try{locals=localRecords()}catch(error){warning=error.message}
    const records=[];
    try{for(let start=0;start<=10000;start+=100){const result=await query().select('*').eq('owner_id',owner).order('updated_at',{ascending:false}).order('id').range(start,start+99);guard();if(result.error)throw databaseError(result.error);if(start===10000&&result.data?.length)throw new Error('Há mais de 10 mil montagens. Refine a consulta antes de continuar.');records.push(...(result.data||[]).map(parse));if((result.data||[]).length<100)break}
      return {records:[...locals.filter(local=>!records.some(record=>record.id===local.legacyId&&same(record.scene,local.scene))),...records],cloudAvailable:true,warning};
    }catch(error){guard();return {records:locals,cloudAvailable:false,warning:[warning,error.message].filter(Boolean).join(' ')}}
  };
  const get=async id=>{guard();if(String(id).startsWith('legacy:'))return localRecords().find(record=>record.id===id)||null;if(!uuid(id))throw new Error('Identificador de montagem inválido.');return readCloud(id);};
  const save=async(input,{record}={})=>{
    guard();if(!input||!Array.isArray(input.layers)||input.layers.length>40)throw new Error('A montagem deve ter até 40 estampas.');
    const scene=normalizeGarmentScene(input);if(scene.layers.some(layer=>!layer.path||!layer.assetId))throw new Error('Uma estampa perdeu a referência de origem. Reabra a arte antes de salvar.');
    const isLegacy=record?.storage==='legacy-local',original=isLegacy?legacy.get(record.legacyId):null;
    if(isLegacy&&(!original||original.revision!==record.revision))throw new Error('O rascunho antigo mudou em outra aba. Reabra-o antes de transferir.');
    const id=record?.storage==='cloud'?record.id:isLegacy&&uuid(record.legacyId)?record.legacyId:crypto.randomUUID();
    let response;
    if(record?.storage==='cloud')response=await query().update({scene,updated_by:user}).eq('owner_id',owner).eq('id',id).eq('updated_at',record.revision).select('*').maybeSingle();
    else response=await query().insert({id,owner_id:owner,scene,created_by:user,updated_by:user}).select('*').single();
    guard();
    if(response.error?.code==='23505'&&isLegacy){const current=await readCloud(id);if(!current||!same(current.scene,scene))throw new Error('Esta montagem já existe na nuvem com alterações. Abra a versão da nuvem para evitar sobrescrevê-la.');response={data:{id:current.id,owner_id:owner,scene:current.scene,updated_at:current.revision}};}
    if(response.error)throw databaseError(response.error);
    if(!response.data)throw new Error('Esta montagem mudou em outro aparelho. Reabra a versão da nuvem antes de salvar.');
    const result=parse(response.data);if(result.id!==id||!same(result.scene,scene))throw new Error('O banco não confirmou a montagem completa. O rascunho antigo foi preservado.');
    if(isLegacy){
      // Cloud confirmation is final. Browser cleanup is best effort and must not
      // turn a successful save into a failure (nor discard a newer local edit).
      let removed=false;try{removed=legacy.removeMigrated(record.legacyId,record.revision,original.scene)}catch{}
      if(!removed)result.warning='Montagem salva e confirmada na nuvem. A cópia antiga deste aparelho foi preservada porque mudou ou o navegador não permitiu a limpeza.';
    }
    return clone(result);
  };
  return {list,get,save};
}
