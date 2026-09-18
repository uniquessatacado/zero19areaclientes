const MAX_BYTES=2*1024*1024,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const cents=value=>Math.round((value+Number.EPSILON)*100),money=value=>cents(value)/100;
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const workspace=value=>value==null||value===''?null:typeof value==='string'&&value.length<=200?value:(()=>{throw new Error('Empresa inválida no lançamento.')})();
function copy(value){try{const json=JSON.stringify(value,(_key,next)=>{if(typeof next==='number'&&!Number.isFinite(next))throw new Error();return next});if(!json||new TextEncoder().encode(json).length>MAX_BYTES)throw new Error();return JSON.parse(json)}catch{throw new Error('O lançamento contém dados inválidos ou ultrapassa 2 MB.')}}
export function financeDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Informe uma data válida.');
  const date=new Date(value+'T12:00:00Z');if(!Number.isFinite(date.valueOf())||date.toISOString().slice(0,10)!==value)throw new Error('Informe uma data válida.');return value;
}
export function financeAmount(value,optional=false){
  if(value==null||typeof value==='string'&&!value.trim()){if(optional)return null;throw new Error('Informe o custo deste lançamento.')}
  if(!['number','string'].includes(typeof value))throw new Error('Informe um valor não negativo dentro do limite permitido.');
  const n=Number(String(value).replace(',','.'));if(!Number.isFinite(n)||n<0||n>1e9)throw new Error('Informe um valor não negativo dentro do limite permitido.');return money(n);
}
function checkedItems(items){
  if(!Array.isArray(items)||!items.length||items.length>10000)throw new Error('O filme precisa conter entre 1 e 10.000 artes.');
  const ids=new Set();return items.map((item,index)=>{
    if(!plain(item))throw new Error('O filme contém uma arte inválida.');
    const quantity=Number(item.quantity),widthCm=Number(item.widthCm),heightCm=Number(item.heightCm),id=String(item.localId||item.id||'item-'+(index+1));
    if(!Number.isInteger(quantity)||quantity<1||quantity>10000||![widthCm,heightCm].every(value=>Number.isFinite(value)&&value>0&&value<=1e6)||id.length>200||ids.has(id))throw new Error('O filme tem medidas, quantidades ou identificadores inválidos.');ids.add(id);
    return {id,name:String(item.label||item.name||'Arte').slice(0,200),workspaceId:workspace(item.workspaceId),quantity,widthCm,heightCm,area:widthCm*heightCm*quantity};
  });
}
// Largest remainder keeps every cent exactly once without giving accumulated
// rounding differences to whichever company happens to be last.
function allocate(total,weights){
  if(total==null)return weights.map(()=>null);const sum=weights.reduce((sum,value)=>sum+value,0),parts=weights.map((weight,index)=>{const exact=total*(weight/sum);return {index,value:Math.floor(exact),remainder:exact-Math.floor(exact)}});
  let remaining=total-parts.reduce((sum,part)=>sum+part.value,0);const order=[...parts].sort((a,b)=>b.remainder-a.remainder||a.index-b.index);
  for(let index=0;remaining>0;index++,remaining--)order[index%order.length].value++;
  return parts.map(part=>part.value);
}
export function buildFinanceRecord({items,estimate,profileName='',cost,sale,productionDate,notes='',companies=[],amountSource='estimate'}){
  const rows=checkedItems(items),amount=financeAmount(cost),revenue=financeAmount(sale,true),companyMap=new Map((Array.isArray(companies)?companies:[]).map(row=>[row.id,row.name])),weights=new Map();
  for(const row of rows){const key=row.workspaceId||'';weights.set(key,(weights.get(key)||0)+row.area)}
  const entries=[...weights],costParts=allocate(cents(amount),entries.map(([,area])=>area)),saleParts=allocate(revenue==null?null:cents(revenue),entries.map(([,area])=>area));
  const allocations=entries.map(([workspaceId],index)=>({workspaceId:workspaceId||null,name:String(companyMap.get(workspaceId)||'Sem empresa vinculada').slice(0,200),cost:costParts[index]/100,sale:saleParts[index]==null?null:saleParts[index]/100}));
  const record={version:1,productionDate:financeDate(productionDate),cost:amount,sale:revenue,amountSource:amountSource==='manual'?'manual':'estimate',estimated:true,profileName:String(profileName).slice(0,180),notes:String(notes).trim().slice(0,2000),items:rows.map(({area,...row})=>row),allocations,allocationMethod:'bounding-area',estimate:estimate?{complete:Boolean(estimate.complete),total:estimate.totals?.total??null,known:estimate.totals?.known??null,rows:estimate.rows||[],perArt:estimate.perArt||[],film:estimate.film||null,timeEstimate:estimate.timeEstimate||null,warnings:estimate.warnings||[],assumptions:estimate.assumptions||[],ripMode:estimate.rip?.mode||null}:null};
  return copy(record);
}
export function validateFinanceRecord(data){
  if(!plain(data)||data.version!==1||data.allocationMethod!=='bounding-area')throw new Error('O lançamento financeiro está em formato inválido.');
  financeDate(data.productionDate);const cost=financeAmount(data.cost),sale=financeAmount(data.sale,true),items=checkedItems(data.items),expected=new Set(items.map(item=>item.workspaceId||''));
  if(data.items.some(item=>typeof item.id!=='string'||typeof item.quantity!=='number'||typeof item.widthCm!=='number'||typeof item.heightCm!=='number'))throw new Error('As medidas e quantidades salvas no lançamento precisam ser numéricas.');
  if(typeof data.cost!=='number'||data.cost!==cost||data.sale!==sale||!Array.isArray(data.allocations)||data.allocations.length!==expected.size)throw new Error('Os valores ou rateios do lançamento são inválidos.');
  let totalCost=0,totalSale=0;for(const part of data.allocations){if(!plain(part))throw new Error('Rateio inválido.');const key=workspace(part.workspaceId)||'';if(!expected.delete(key))throw new Error('Há empresa duplicada ou incompatível no rateio.');const partCost=financeAmount(part.cost),partSale=financeAmount(part.sale,true);if(part.cost!==partCost||part.sale!==partSale||(sale==null)!==(partSale==null))throw new Error('Os centavos ou receitas do rateio são inválidos.');totalCost+=cents(partCost);totalSale+=partSale==null?0:cents(partSale);}
  if(totalCost!==cents(cost)||sale!=null&&totalSale!==cents(sale))throw new Error('A soma do rateio não corresponde ao valor do lançamento.');
  if(data.estimate!=null&&!plain(data.estimate))throw new Error('A cópia da estimativa é inválida.');
  if(data.estimate&&['rows','perArt','warnings','assumptions'].some(key=>!Array.isArray(data.estimate[key])))throw new Error('A cópia dos componentes e hipóteses da estimativa é inválida.');
  return true;
}
export function financeSummary(records,{from='',to='',workspaceId='all'}={}){
  if(from)financeDate(from);if(to)financeDate(to);if(from&&to&&from>to)throw new Error('A data inicial não pode ser posterior à final.');if(!Array.isArray(records))throw new Error('O histórico financeiro é inválido.');
  const seen=new Set();for(const record of records){if(!plain(record))throw new Error('Lançamento inválido no histórico.');validateFinanceRecord(record.data);if(record.export_id){if(seen.has(record.export_id))throw new Error('Há exportações duplicadas no histórico. Atualize antes de somar os custos.');seen.add(record.export_id);}}
  const filtered=records.filter(record=>(!from||record.data.productionDate>=from)&&(!to||record.data.productionDate<=to)).flatMap(record=>{const data=record.data;if(workspaceId==='all')return [{...record,shownCost:data.cost,shownSale:data.sale}];const part=data.allocations.find(row=>(row.workspaceId||'')===workspaceId);return part?[{...record,shownCost:part.cost,shownSale:part.sale}]:[]});
  const cost=filtered.reduce((sum,row)=>sum+cents(row.shownCost),0)/100,knownSale=filtered.reduce((sum,row)=>sum+(row.shownSale==null?0:cents(row.shownSale)),0)/100,completeRevenue=filtered.every(row=>row.shownSale!=null);
  return {records:filtered,cost,knownSale,completeRevenue,contribution:completeRevenue?money(knownSale-cost):null};
}
export function createProductionFinanceStore({supabase,owner,user,canView}){
  const accountId=owner(),guard=()=>{if(!accountId||owner()!==accountId||user()!==accountId||canView()!==true)throw new Error('Financeiro de impressão restrito ao titular da conta.');};
  const failure=error=>new Error(['42P01','PGRST205'].includes(error?.code)?'O financeiro de impressão ainda não foi habilitado na conta. Nenhum lançamento foi salvo.':error?.message||'Não foi possível confirmar o financeiro na nuvem.');
  return {
    async list(){guard();const rows=[],seen=new Set();for(let start=0;start<=10000;start+=500){const result=await supabase.from('z19p_production_ledger').select('*').eq('owner_id',accountId).order('production_date',{ascending:false}).order('id',{ascending:false}).range(start,start+499);guard();if(result.error)throw failure(result.error);if(!Array.isArray(result.data))throw new Error('O histórico retornou dados inválidos; nenhum total foi calculado.');for(const row of result.data){if(row.owner_id!==accountId||row.production_date!==row.data?.productionDate||!UUID.test(row.export_id||'')||seen.has(row.export_id))throw new Error('O histórico contém um lançamento incompatível ou duplicado. Atualize antes de somar os custos.');validateFinanceRecord(row.data);seen.add(row.export_id);rows.push(copy(row));}if(rows.length>10000)throw new Error('Este histórico supera 10.000 registros. É necessário ampliar a paginação antes de somar os resultados.');if(result.data.length<500)return rows;}throw new Error('Não foi possível concluir a paginação do financeiro.');},
    async save(exportId,data){guard();if(!UUID.test(exportId||''))throw new Error('Identificador de exportação inválido.');const snapshot=copy(data);validateFinanceRecord(snapshot);const result=await supabase.from('z19p_production_ledger').insert({owner_id:accountId,export_id:exportId,production_date:snapshot.productionDate,data:snapshot,created_by:user()}).select().single();guard();if(result.error){if(result.error.code==='23505')throw new Error('Esta exportação já tem um lançamento. Nenhum custo foi duplicado.');throw failure(result.error)}if(!result.data||result.data.owner_id!==accountId||result.data.export_id!==exportId)throw new Error('Não foi possível confirmar o lançamento salvo. Atualize o histórico antes de tentar novamente.');return copy(result.data);}
  };
}
