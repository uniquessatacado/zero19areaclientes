import test from 'node:test';
import assert from 'node:assert/strict';
import {unavailablePendingEntries,watchPendingStatuses} from '../film-pending-status.js';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),owner=id(9999);
const entry=(n,kind='font')=>({key:kind+':'+n,kind,row:kind==='placed'?{placement:{id:id(n)}}:{id:id(n)},quantity:1});
function db(rows,{error=null}={}){
 const calls=[];return {calls,from(table){return {select(columns){return {eq(key,value){assert.equal(key,'owner_id');assert.equal(value,owner);return {async in(field,ids){assert.equal(field,'id');calls.push({table,columns,ids});return error?{error:{message:error}}:{data:rows.filter(r=>ids.includes(r.id))};}};}};}};}};
}
const stageRows=stages=>stages.map((stage,index)=>({id:id(index+1),stage}));

test('Pronto, entregue, cancelado e em produção saem; pedido ainda liberado fica',async()=>{
 const entries=[1,2,3,4,5].map(n=>entry(n));
 const source=db(stageRows(['ready_pickup','delivered','cancelled','production','ready_production']));
 assert.deepEqual([...await unavailablePendingEntries(source,owner,entries)],entries.slice(0,4).map(e=>e.key));
});
test('Consulta por aplicação, não pela imagem ou pelo pedido inteiro',async()=>{
 const a=entry(1,'vdr'),b=entry(2,'vdr');a.row.project_id=b.row.project_id=id(50);a.row.asset_id=b.row.asset_id=id(60);
 assert.deepEqual([...await unavailablePendingEntries(db(stageRows(['ready_pickup','ready_production'])),owner,[a,b])],[a.key]);
});
test('Voltar ao fluxo volta a permitir a aplicação numa nova leitura',async()=>{
 const source=db([{id:id(1),stage:'ready_production'}]);
 assert.equal((await unavailablePendingEntries(source,owner,[entry(1)])).size,0);
});
test('Arte colocada usa a etapa da aplicação sem alterar o arquivo',async()=>{
 const e=entry(1,'placed');assert.deepEqual([...await unavailablePendingEntries(db([{id:id(1),production_state:'printed'}]),owner,[e])],[e.key]);
 assert.equal(e.completed,undefined);
});
test('Aplicação sem acesso ou excluída não pode ser adicionada pela lista antiga',async()=>{
 const e=entry(1);assert.deepEqual([...await unavailablePendingEntries(db([]),owner,[e])],[e.key]);
});
test('Outras empresas e pedidos genéricos não são confundidos com ZERO19',async()=>{
 const source=db([]);assert.equal((await unavailablePendingEntries(source,owner,[entry(1,'generic')])).size,0);assert.equal(source.calls.length,0);
});
test('Consulta é dividida em blocos de 100 sem truncar a fila',async()=>{
 const entries=Array.from({length:251},(_,i)=>entry(i+1)),source=db(entries.map(e=>({id:e.row.id,stage:'ready_production'})));
 assert.equal((await unavailablePendingEntries(source,owner,entries)).size,0);assert.deepEqual(source.calls.map(c=>c.ids.length),[100,100,51]);
});
test('Falha de rede bloqueia a leitura, não presume que foi produzido',async()=>{
 const e=entry(1);await assert.rejects(()=>unavailablePendingEntries(db([],{error:'offline'}),owner,[e]),/offline/);assert.equal(e.completed,undefined);
});
test('Identidade inválida falha antes de consultar dados',async()=>{
 const source=db([]);await assert.rejects(()=>unavailablePendingEntries(source,'invalid',[entry(1)]));assert.equal(source.calls.length,0);
});
class Button extends EventTarget{click(){this.dispatchEvent(new Event('click',{cancelable:true}));}}
function ui(entries,source){
 let busy=false,valid=true,changes=0;const selected=new Set(entries.map(e=>e.key)),button=new Button(),removed=[];
 const modal={isConnected:true,querySelector(selector){if(selector==='[data-add-pending]')return button;const match=selector.match(/^\[data-entry="(\d+)"\]$/);if(match)return {closest(){return {closest(){return null},remove(){removed.push(Number(match[1]))}}}};return null;}};
 const controller=watchPendingStatuses({supabase:source,ownerId:owner,entries,modal,isCurrent:()=>valid,getBusy:()=>busy,setBusy:value=>{busy=value},selected,updateCount(){},onChanged:async()=>{changes++}});
 return {controller,modal,button,selected,removed,get busy(){return busy},get changes(){return changes},invalidate(){valid=false}};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
test('Lista aberta remove pronto e preserva seleção e filme dos demais',async()=>{
 const entries=[entry(1),entry(2)],state=ui(entries,db(stageRows(['ready_pickup','ready_production'])));
 try{await state.controller.check();assert.equal(entries[0].completed,true);assert.equal(entries[1].completed,undefined);assert.deepEqual([...state.selected],[entries[1].key]);assert.deepEqual(state.removed,[0]);assert.equal(state.changes,1);}finally{state.controller.dispose();}
});
test('Antes de adicionar, consulta novamente; pronto não chega ao handler original',async()=>{
 const entries=[entry(1)],state=ui(entries,db(stageRows(['ready_pickup'])));let adds=0;state.button.addEventListener('click',()=>adds++);
 try{state.button.click();await tick();assert.equal(adds,0);assert.equal(state.selected.size,0);assert.equal(state.busy,false);}finally{state.controller.dispose();}
});
test('Aplicação liberada chega uma única vez ao handler de adicionar',async()=>{
 const state=ui([entry(1)],db(stageRows(['ready_production'])));let adds=0;state.button.addEventListener('click',()=>adds++);
 try{state.button.click();await tick();assert.equal(adds,1);}finally{state.controller.dispose();}
});
test('Rede indisponível não permite adicionar pela informação velha',async()=>{
 const state=ui([entry(1)],db([],{error:'offline'}));let adds=0;state.button.addEventListener('click',()=>adds++);
 try{state.button.click();await tick();assert.equal(adds,0);assert.equal(state.selected.size,1);assert.equal(state.busy,false);}finally{state.controller.dispose();}
});
test('Troca de conta/página descarta respostas e não remove nada',async()=>{
 const state=ui([entry(1)],db(stageRows(['ready_pickup'])));try{state.invalidate();assert.equal(await state.controller.check(),false);assert.equal(state.removed.length,0);}finally{state.controller.dispose();}
});
