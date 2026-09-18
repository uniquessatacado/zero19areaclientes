import {normalizeGarmentScene} from './garment-scene.js?v=2.17.3';

// Explicit, account-scoped local drafts. No database or synchronization claims.
const MAX_DRAFTS=100,MAX_BYTES=4*1024*1024;
const clone=value=>JSON.parse(JSON.stringify(value));
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
export function createGarmentDraftStore({owner,storage}={}){
  const resolveOwner=()=>typeof owner==='function'?owner():owner,ownerId=resolveOwner();
  if(!ownerId)throw new Error('Entre na sua conta para guardar montagens locais.');
  const key=`z19p:garment-drafts:v1:${ownerId}`;
  const guard=()=>{if(resolveOwner()!==ownerId)throw new Error('A conta mudou. Reabra o estúdio antes de salvar.');};
  const target=()=>{try{const result=storage||globalThis.localStorage;if(result)return result}catch{}throw new Error('O navegador não disponibilizou armazenamento local. Baixe a apresentação para preservar seu trabalho.');};
  const read=()=>{
    guard();let raw;try{raw=target().getItem(key)}catch(error){throw new Error('Não foi possível ler as montagens locais. '+error.message)}
    if(!raw)return [];if(new TextEncoder().encode(raw).length>MAX_BYTES)throw new Error('O arquivo de montagens locais excede o limite de 4 MB. Os dados foram preservados.');
    let state;try{state=JSON.parse(raw)}catch{throw new Error('O arquivo de montagens locais está inválido. Ele foi preservado; não será sobrescrito automaticamente.');}
    if(!object(state)||state.version!==1||state.ownerId!==ownerId||!Array.isArray(state.drafts)||state.drafts.length>MAX_DRAFTS)throw new Error('As montagens locais estão em formato incompatível. Os dados existentes foram preservados.');
    const ids=new Set();return state.drafts.map(draft=>{if(!object(draft)||typeof draft.id!=='string'||!draft.id||draft.id.length>200||ids.has(draft.id)||!object(draft.scene)||!Number.isInteger(draft.revision)||draft.revision<1||!Number.isFinite(Date.parse(draft.updatedAt)))throw new Error('Uma montagem local está inválida. Os dados existentes foram preservados.');ids.add(draft.id);const scene=normalizeGarmentScene(draft.scene);return {id:draft.id,title:scene.title,scene,updatedAt:draft.updatedAt,revision:draft.revision}});
  };
  const list=()=>clone(read().sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)||a.id.localeCompare(b.id)));
  const get=id=>list().find(draft=>draft.id===id)||null;
  const save=(input,{id,expectedRevision}={})=>{
    guard();if(!object(input))throw new Error('Montagem inválida.');const scene=normalizeGarmentScene(input),drafts=read(),index=id?drafts.findIndex(draft=>draft.id===id):-1;
    if(id&&index<0)throw new Error('Esta montagem local não foi encontrada. Reabra o estúdio antes de salvar.');
    if(index>=0&&drafts[index].revision!==expectedRevision)throw new Error('A montagem foi alterada em outra aba. Reabra a versão salva antes de sobrescrever.');
    if(index<0&&drafts.length>=MAX_DRAFTS)throw new Error('Este navegador já guarda 100 montagens. Exporte suas apresentações antes de organizar os rascunhos.');
    const draft={id:id||crypto.randomUUID(),title:scene.title,scene,updatedAt:new Date().toISOString(),revision:index<0?1:drafts[index].revision+1};
    if(index<0)drafts.push(draft);else drafts[index]=draft;const encoded=JSON.stringify({version:1,ownerId,drafts});if(new TextEncoder().encode(encoded).length>MAX_BYTES)throw new Error('As montagens locais excedem 4 MB. Baixe sua apresentação antes de guardar novas montagens.');
    try{target().setItem(key,encoded)}catch{throw new Error('Não foi possível salvar no navegador. O espaço pode estar cheio ou bloqueado. Baixe a apresentação para preservar seu trabalho.');}
    return clone(draft);
  };
  const removeMigrated=(id,revision,scene)=>{guard();const drafts=read(),record=drafts.find(draft=>draft.id===id);if(!record||record.revision!==revision||JSON.stringify(record.scene)!==JSON.stringify(scene))return false;try{target().setItem(key,JSON.stringify({version:1,ownerId,drafts:drafts.filter(draft=>draft.id!==id)}));return true}catch{return false}};
  return {list,get,save,removeMigrated};
}
