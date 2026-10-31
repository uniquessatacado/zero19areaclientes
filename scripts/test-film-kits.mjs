// Kits de camisa do filme (31/10, dono): montar uma vez, colocar no filme e só aumentar ou diminuir os kits.
import assert from 'node:assert/strict';
import {addKitToFilm,checkedKit,createFilmKitStore,FILM_KIT_KIND,filmKitBarsHTML,filmKitGroups,kitFilmItems,setFilmKitCount} from '../film-kits.js';
import {buildFilmAssetCatalogue} from '../film-picker.js';
import {sanitizeFilmDraft} from '../film-draft.js';

const art=(id,name,width,height,px=[1000,500])=>({asset:{id,name,asset_type:'arte',workspace_id:'w1',processed_path:`p/${id}.png`,width:px[0],height:px[1]},profile:{asset_id:id,default_width_cm:width,default_height_cm:height,ready_for_print:true,rotation_policy:'free'}});
const arts=[art('frente','Frente',25,12.5),art('costas','Costas',7,3.5),art('manga','Manga',8,4)];
const catalogue=buildFilmAssetCatalogue({profiles:arts.map(a=>a.profile),assetMap:arts.map(a=>a.asset),workspaces:[{id:'w1',company_name:'ZERO19',workspace_type:'library'}]});
const entries=new Map(catalogue.map(entry=>[entry.id,entry]));
const kit={id:'k1',name:'Camisa Time',rows:[{assetId:'frente',widthCm:25,heightCm:12.5,perKit:1},{assetId:'costas',widthCm:7,heightCm:3.5,perKit:1},{assetId:'manga',widthCm:8,heightCm:4,perKit:2}]};
const quantities=items=>items.map(item=>item.quantity);

// Salvar exige nome e artes; a mesma arte não entra duas vezes (usa a quantidade por camisa).
assert.throws(()=>checkedKit('',kit.rows),/nome/);
assert.throws(()=>checkedKit('Kit',[]),/arte/);
assert.throws(()=>checkedKit('Kit',[kit.rows[0],kit.rows[0]]),/repetida/);
assert.throws(()=>checkedKit('Kit',[{...kit.rows[0],perKit:0}]),/quantidade/);
assert.equal(checkedKit('  Camisa  ',kit.rows).name,'Camisa');

// Colocar no filme: todas as artes, nas medidas do kit, vezes a quantidade de kits.
const film=[];
addKitToFilm(film,kit,entries,3);
assert.deepEqual(quantities(film),[3,3,6],'3 kits: frente 3, costas 3, manga 6');
assert.deepEqual(film.map(item=>[item.widthCm,item.heightCm]),[[25,12.5],[7,3.5],[8,4]]);
assert.equal(film[0].type,'asset');
for(const field of ['zero19WorkItemId','orderId','projectId'])assert.equal(film[0][field],undefined,'kit não cria vínculo com pedido');
assert.deepEqual(filmKitGroups(film).map(group=>[group.name,group.count,group.prints]),[['Camisa Time',3,12]]);

// Só aumentar e diminuir: todas as artes juntas, nunca abaixo de 1 kit.
const groupId=film[0].kit.groupId;
setFilmKitCount(film,groupId,5);assert.deepEqual(quantities(film),[5,5,10]);
setFilmKitCount(film,groupId,1);assert.deepEqual(quantities(film),[1,1,2]);
setFilmKitCount(film,groupId,0);assert.deepEqual(quantities(film),[1,1,2],'zero vira 1; para tirar existe Tirar kit');
// O mesmo kit de novo soma, sem repetir as artes; outro kit fica separado.
addKitToFilm(film,kit,entries,2);assert.equal(film.length,3);assert.deepEqual(quantities(film),[3,3,6]);
addKitToFilm(film,{...kit,id:'k2',name:'Outra',rows:[kit.rows[0]]},entries,1);assert.equal(film.length,4);assert.equal(filmKitGroups(film).length,2);
// Delete numa cópia não deixa a quantidade mentindo; o − e o + voltam ao certo.
film[1].quantity=2;assert.equal(filmKitGroups(film)[0].count,3);setFilmKitCount(film,groupId,4);assert.deepEqual(quantities(film).slice(0,3),[4,4,8]);

// Medida própria do kit vale; a arte não estica se a imagem mudou de proporção.
const custom=kitFilmItems({...kit,rows:[{assetId:'frente',widthCm:20,heightCm:10,perKit:1}]},entries,1).items[0];
assert.deepEqual([custom.widthCm,custom.heightCm,custom.sizeOverride],[20,10,true]);
// Arte fora da biblioteca: o kit não entra pela metade e diz qual é.
const broken={...kit,rows:[...kit.rows,{assetId:'sumiu',widthCm:5,heightCm:5,perKit:1,name:'Peito'}]},before=film.length;
assert.throws(()=>addKitToFilm(film,{...broken,id:'k3'},entries,1),/Peito/);assert.equal(film.length,before);

// O rascunho do filme guarda a marca do kit: fechar e abrir não perde o − / +.
const saved=sanitizeFilmDraft({version:1,ownerId:'o',savedAt:new Date().toISOString(),items:film,settings:{},layout:null});
assert.equal(saved.data.items[0].kit.groupId,groupId);assert.equal(filmKitGroups(saved.data.items).length,2);
assert.match(filmKitBarsHTML(film),/Kit Camisa Time/);
assert.match(filmKitBarsHTML([{kit:{groupId:'<x>',name:'<b>',perKit:1},quantity:1}]),/&lt;b&gt;/,'nome do kit escapado');

// Banco: mesma tabela dos rascunhos, marcado como kit, sem projeto; lista só kits da conta; conta trocada não grava.
const calls=[];let rows=[];
const chain=(op,payload)=>{const c={eqs:{},select(){return c},eq(k,v){c.eqs[k]=v;return c},order(){return c},range(){return run(c)},single(){return run(c)},maybeSingle(){return run(c)}};const run=q=>{calls.push({op,eqs:q.eqs,payload});if(op==='insert'){rows.push(payload);return {data:payload,error:null}}if(op==='list')return {data:rows,error:null};if(op==='update'){Object.assign(rows[0],payload);return {data:rows[0],error:null}}if(op==='delete'){const row=rows[0];rows=[];return {data:row,error:null}}};return c};
const supabase={from:table=>{assert.equal(table,'z19p_print_jobs');return {select:()=>chain('list'),insert:p=>chain('insert',p),update:p=>chain('update',p),delete:()=>chain('delete')}}};
let account='dono';const store=createFilmKitStore({supabase,owner:()=>account,user:()=>'func'});
const created=await store.save('','Camisa Time',kit.rows);
assert.equal(rows[0].settings_snapshot.kind,FILM_KIT_KIND);assert.equal(rows[0].project_id,null);assert.equal(rows[0].owner_id,'dono');assert.equal(rows[0].status,'draft');
assert.equal((await store.list())[0].rows.length,3);assert.equal(calls.at(-1).eqs['settings_snapshot->>kind'],FILM_KIT_KIND);assert.equal(calls.at(-1).eqs.owner_id,'dono');assert.equal(calls.at(-1).eqs.created_by,undefined,'kit é da equipe, não de quem criou');
await store.save(created.id,'Novo nome',kit.rows.slice(0,2));assert.equal(rows[0].name,'Novo nome');assert.equal(rows[0].settings_snapshot.kit.rows.length,2);
await store.remove(created.id);assert.equal(rows.length,0);
account='outra';await assert.rejects(store.list(),/conta/);
console.log('PASS kits do filme: salvar, colocar, aumentar e diminuir, somar, arte fora da biblioteca, rascunho e banco.');
