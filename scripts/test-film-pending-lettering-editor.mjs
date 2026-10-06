import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizePendingLettering,pendingLetteringExpected,pendingLetteringValues,savePendingLettering,bindPendingLetteringActions} from '../film-pending-lettering-editor.js';

const row={id:'work-application',text_value:'ORIGINAL',quantity:2,metadata:{font_set_id:'official-font',details:[{quantity:2,production:{kind:'PHRASE',font_set_id:'official-font',top_text:'ORIGINAL',number:'',letter_height_cm:5.5,name_max_width_cm:34,position_label:'Costas'}}]}};
assert.equal(normalizePendingLettering('  joa\u0303o\n#ação, é? sim! - “confirma”.\u200b  '),'JOÃO #AÇÃO, É? SIM! - “CONFIRMA”.');
assert.equal(normalizePendingLettering('A\tB\u0000\u202e!'),'A B!','whitespace separates words; only hidden controls removed');
assert.deepEqual(pendingLetteringValues(row),{name:'ORIGINAL',number:''});
assert.deepEqual(pendingLetteringValues({...row,metadata:{details:[{production:{top_text:'',number:'22'}}]}}),{name:'',number:'22'},'number-only does not create a fake name');
const expected=pendingLetteringExpected(row);assert.equal(expected.lettering_revision,null);assert.notEqual(expected.production,row.metadata.details[0].production,'CAS has its own immutable snapshot');
let current=true,writes=0;const calls=[];const metadata=structuredClone(row.metadata);metadata.lettering_revision='revision-1';
const makePreview=async(application,values)=>{calls.push(['preview',application.id,values]);return {previewDataUrl:'data:image/png;base64,preview',symbolFallbackCharacters:['“','”']};};
const write=async params=>{writes++;calls.push(['write',params]);return {data:{work_item_id:row.id,text_value:params.p_top_text,metadata}};};
const before=JSON.stringify(row);
const saved=await savePendingLettering({row,name:'#ação, sim! - confirma?',number:'22',isCurrent:()=>current,makePreview,write});
assert.equal(saved.current,true);assert.equal(saved.result.metadata.lettering_revision,'revision-1');assert.equal(writes,1);assert.equal(calls[0][0],'preview');assert.equal(calls[1][0],'write');
assert.deepEqual(calls[1][1],{p_work_item_id:row.id,p_top_text:'#AÇÃO, SIM! - CONFIRMA?',p_number:'22',p_expected:expected});
assert.equal(JSON.stringify(row),before,'helper does not mutate source, font, measurements or sibling applications');
assert(saved.item.symbolFallbackCharacters.includes('“'),'explicit symbol-only fallback from real renderer is retained');
for(const [name,number,message] of [['','',/Mantenha/],['name','1234567',/algarismos/],['name','22!',/algarismos/],['a'.repeat(1001),'',/1000/]]){
 await assert.rejects(()=>savePendingLettering({row,name,number,isCurrent:()=>true,makePreview,write}),message);
}
assert.equal(writes,1,'invalid input never writes');
await assert.rejects(()=>savePendingLettering({row,name:'NO GLYPH',number:'',isCurrent:()=>true,makePreview:async()=>{throw new Error('Fonte oficial não contém este caractere');},write}),/Fonte oficial/);assert.equal(writes,1,'missing official letters never saved by silent fallback');
current=false;await assert.rejects(()=>savePendingLettering({row,name:'VALID',number:'',isCurrent:()=>current,makePreview,write}),/conta mudou/);assert.equal(writes,1);
current=true;await assert.rejects(()=>savePendingLettering({row,name:'VALID',number:'',isCurrent:()=>current,makePreview:async()=>{current=false;return {};},write}),/Nenhuma edição foi enviada/);assert.equal(writes,1,'route/account change during preview prevents write');
current=true;const changed=await savePendingLettering({row,name:'VALID',number:'',isCurrent:()=>current,makePreview,write:async params=>{const result=await write(params);current=false;return result;}});assert.equal(changed.current,false,'late response cannot mutate a different account view');
await assert.rejects(()=>savePendingLettering({row,name:'VALID',number:'',isCurrent:()=>true,makePreview,write:async()=>({error:new Error('Outra pessoa alterou a escrita')})}),/Outra pessoa/);
await assert.rejects(()=>savePendingLettering({row,name:'VALID',number:'',isCurrent:()=>true,makePreview,write:async()=>({data:{work_item_id:'sibling',metadata}})}),/não foi confirmada/);
await assert.rejects(()=>savePendingLettering({row,name:'VALID',number:'',isCurrent:()=>true,makePreview,write:async()=>({data:{work_item_id:row.id,metadata:{...metadata,font_set_id:'changed-font'},already_saved:true}})}),/fonte desta aplicação mudou/,'no-op retry never keeps the old font preview');
const editor=readFileSync(new URL('../film-pending-lettering-editor.js',import.meta.url),'utf8');
for(const rule of [/entry\.kind!=='font'/,/entry\.alreadyInFilm/,/getBusy\(\)/,/getActor\(\)===actor/,/getOwner\(\)===account/,/if\(saving\|\|!current\(\)\)return/,/min-height:44px/,/background:#a8caff;color:#071426/,/max-height:calc\(100dvh - 24px\)/,/overflow-x:hidden/,/event\.key==='Tab'/,/event\.key==='Escape'/])assert.match(editor,rule);
const production=readFileSync(new URL('../production-v217.js',import.meta.url),'utf8');assert.match(production,/bindPendingLetteringActions\(\{entries,modal/);assert.match(production,/previewGeneration!==\(entry.previewGeneration\|\|0\)/,'old preview cannot overwrite edited one');
const migration=readFileSync(new URL('../supabase/migrations/20261006173437_zero19_edit_pending_lettering.sql',import.meta.url),'utf8');
for(const rule of [/set search_path = ''/,/auth\.uid\(\) is null/,/current_content is distinct from p_expected/,/siblings_before is distinct from siblings_after/,/order by id for update nowait/,/exception when lock_not_available/,/new_revision:=gen_random_uuid\(\)/,/zero19_pending_lettering_edited/,/IN_PROGRESS/,/revoke all .* from public,anon/,/jsonb_typeof\(source_sale\.details\) is distinct from 'array'/])assert.match(migration,rule);
assert.doesNotMatch(migration,/create or replace function public\.z19p_mark_selected_order_production\(/,'historical RPC signature/body remains intact');

// Minimal DOM exercises actual edit/cancel/save binding, without a browser or DB.
class Node {
 constructor(tag='div'){this.tag=tag;this.children=[];this.parent=null;this.dataset={};this.style={};this.isConnected=true;this.disabled=false;this.value='';}
 set innerHTML(value){this.html=value;if(value.includes('data-lettering-name')){this.fields=new Map();for(const selector of ['[data-lettering-name]','[data-lettering-number]','[data-save-lettering]','[data-lettering-preview]','[data-lettering-note]','[data-lettering-error]','form'])this.fields.set(selector,new Node());this.fields.get('[data-lettering-name]').value='ORIGINAL';this.fields.get('[data-lettering-number]').value='';this.closes=[new Node('button'),new Node('button')];}}
 get innerHTML(){return this.html||'';}
 closest(selector){if(selector==='.film-pending-row')return this.row||this;if(selector==='.film-pending-application')return this.parent?.className==='film-pending-application'?this.parent:null;return null;}
 before(node){if(!this.parent)return;node.parent=this.parent;this.parent.children.splice(this.parent.children.indexOf(this),0,node);}
 appendChild(node){if(node.parent)node.parent.children=node.parent.children.filter(n=>n!==node);node.parent=this;this.children.push(node);return node;}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.isConnected=false;}
 replaceChildren(...nodes){this.children=[];for(const node of nodes)this.appendChild(node);}
 querySelector(selector){return this.fields?.get(selector)||null;}
 querySelectorAll(selector){if(selector==='[data-close-lettering]')return this.closes||[];if(selector==='button,input,textarea')return [this.fields?.get('[data-lettering-name]'),this.fields?.get('[data-lettering-number]'),...(this.closes||[]),this.fields?.get('[data-save-lettering]')].filter(Boolean);return this.children.flatMap(node=>[node,...node.querySelectorAll(selector)]).filter(node=>node.dataset.pendingLettering);}
 focus(){document.activeElement=this;}
 select(){}
}
const actualInterval=globalThis.setInterval,actualClear=globalThis.clearInterval;
globalThis.setInterval=()=>1;globalThis.clearInterval=()=>{};
globalThis.document={body:new Node(),activeElement:new Node(),createElement:tag=>new Node(tag)};
const modal=new Node(),fontEntry={key:'font:a',kind:'font',title:'QA order',row:structuredClone(row)},pngEntry={key:'vdr:b',kind:'vdr',row:{id:'png'}};
const entries=[fontEntry,pngEntry,{key:'font:c',kind:'font',title:'already',row:{id:'in-draft'},alreadyInFilm:true}];const rows=entries.map(()=>modal.appendChild(new Node()));modal.querySelector=selector=>rows[Number(selector.match(/"(\d+)"/)[1])];
let busy=false,actor='a',account='o',writeCount=0,savedCount=0,resolveRpc;
bindPendingLetteringActions({entries,modal,isCurrent:()=>true,getActor:()=>actor,getOwner:()=>account,getBusy:()=>busy,setBusy:value=>{busy=value},updateCount:()=>{},makePreview:async()=>({previewDataUrl:'data:image/png;base64,preview'}),supabase:{rpc:async(name,params)=>{assert.equal(name,'z19p_zero19_edit_pending_lettering');assert.equal(params.p_work_item_id,row.id);writeCount++;return await new Promise(resolve=>{resolveRpc=resolve;});}},onSaved:()=>{savedCount++;}});
const editButtons=modal.querySelectorAll();assert.equal(editButtons.length,2,'only font applications get Editar escrita');assert(editButtons[1].disabled,'source editing blocked for application already in draft');
const click={preventDefault(){},stopPropagation(){}};
editButtons[0].onclick(click);assert.equal(busy,true,'parent cannot add film or complete while editor is open');let dialog=document.body.children.at(-1);await Promise.resolve();
dialog.querySelectorAll('[data-close-lettering]')[0].onclick();assert.equal(busy,false);assert.equal(writeCount,0,'cancel sends no source edit');
editButtons[0].onclick(click);dialog=document.body.children.at(-1);await Promise.resolve();dialog.querySelector('[data-lettering-name]').value='UPDATED #Á, SIM?';
const saving=dialog.querySelector('form').onsubmit(click);await Promise.resolve();const duplicate=dialog.querySelector('form').onsubmit(click);await duplicate;assert.equal(writeCount,1,'double tap submits exactly once');assert(dialog.querySelector('[data-lettering-name]').disabled);assert.equal(busy,true);
resolveRpc({data:{work_item_id:row.id,text_value:'UPDATED #Á, SIM?',metadata}});await saving;assert.equal(savedCount,1);assert.equal(busy,false);assert(!dialog.isConnected);assert.equal(entries[1].row.id,'png','sibling artwork untouched');
editButtons[0].onclick(click);dialog=document.body.children.at(-1);await Promise.resolve();dialog.querySelector('[data-lettering-name]').value='AFTER ACCOUNT CHANGE';const changing=dialog.querySelector('form').onsubmit(click);account='other';await changing;assert.equal(writeCount,1,'account change before source write cancels editor');assert.equal(busy,false);assert(!dialog.isConnected);
delete globalThis.document;globalThis.setInterval=actualInterval;globalThis.clearInterval=actualClear;
console.log('PASS pending lettering editor: source CAS, immutable recipe, punctuation/accents, official preview first, missing glyphs and invalid inputs blocked, route/account race, no stale preview or film edits, audit/SQL isolation and mobile controls.');
