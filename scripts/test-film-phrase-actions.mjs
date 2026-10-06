import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {canSeparateFilmPhrase,separateFilmPhrase,reuniteFilmPhrase,assertCompleteFilmPhrases,letteringApplicationPart} from '../film-phrase-parts.js';

const source=readFileSync(new URL('../production-v217.js',import.meta.url),'utf8'),start=source.indexOf("      app.querySelectorAll('[data-separate-film-phrase],[data-reunite-film-phrase]')"),end=source.indexOf("      app.querySelectorAll('.edit-film-item')",start);
assert(start>0&&end>start);
const base={localId:'phrase',type:'team_customization',sourceId:'font',name:'EU SOU DE DIREITA!',number:'',nameHeightCm:5.5,nameTrackingCm:.15,widthCm:75,heightCm:5.5,quantity:2,fontSource:{path:'original-private.ttf'},label:'Cliente <teste>'};
let current=true,readCount=0,refreshes=0,draws=0,failedWord='',changing=false;
const button={dataset:{separateFilmPhrase:'phrase'},disabled:false,isConnected:true},measures=[],notes=[];
const context={canSeparateFilmPhrase,separateFilmPhrase,reuniteFilmPhrase,assertCompleteFilmPhrases,structuredClone,pageCurrent:()=>current,filmItems:[structuredClone(base)],filmDraftChange:0,app:{querySelectorAll:()=>[button]},safe:fn=>fn(),prepareLetteringLayout:async item=>{readCount++;measures.push({text:item.name,font:item.fontSource.path,height:item.nameHeightCm,tracking:item.nameTrackingCm});if(item.name===failedWord)throw new Error('Fonte indisponível');if(changing)context.filmDraftChange++;return {widthCm:[...item.name].length*2,heightCm:item.nameHeightCm};},filmMaskCache:{clear:()=>{}},refreshItems:async()=>refreshes++,drawOrders:()=>draws++,ctx:{toast:(...args)=>notes.push(args)}};
runInNewContext(source.slice(start,end),context);
await button.onclick();
assert.deepEqual(context.filmItems.map(item=>item.name),['EU','SOU','DE','DIREITA!']);assert.equal(readCount,4);assert.equal(refreshes,1);assert.equal(draws,1);assert.equal(button.disabled,false);
assert(measures.every(item=>item.font==='original-private.ttf'&&item.height===5.5&&item.tracking===.15),'Every whole word gets actual layout with one unchanged physical recipe');
assert(context.filmItems.every(item=>item.widthCm===[...item.name].length*2),'Old full-line dimensions are replaced before committing');
assert.match(notes[0][0],/Palavras inteiras/);
const manifestId=context.filmItems[0].phrasePart.manifestId;
button.dataset={reuniteFilmPhrase:manifestId};await button.onclick();assert.equal(context.filmItems.length,1);assert.equal(context.filmItems[0].name,base.name);assert.equal(context.filmItems[0].quantity,2);assert.equal(context.filmItems[0].nameHeightCm,5.5);

button.dataset={separateFilmPhrase:'phrase'};context.filmItems=[structuredClone(base)];const original=context.filmItems;failedWord='SOU';await assert.rejects(button.onclick(),/Fonte indisponível/);assert.equal(context.filmItems,original);assert.equal(context.filmItems.length,1);assert.equal(button.disabled,false,'Error restores action without partial mutation');failedWord='';
changing=true;await button.onclick();assert.equal(context.filmItems,original,'Typing/quantity edits during async layout cannot overwrite the newer film');assert.equal(button.disabled,false);changing=false;
current=false;const readsBefore=readCount;await button.onclick();assert.equal(readCount,readsBefore,'Detached route cannot split');current=true;

const editableStart=source.indexOf('  function editableFilmLetterHeight('),editableEnd=source.indexOf('  function openFilmLetterHeightEditor(',editableStart);
assert(editableStart>0&&editableEnd>editableStart,'The actual lettering size eligibility helper is tested');
const editableFilmLetterHeight=runInNewContext(source.slice(editableStart,editableEnd)+';editableFilmLetterHeight');
const htmlStart=source.indexOf('  function filmItemsHTML()'),htmlEnd=source.indexOf('\n  async function openFilmVectorColorEditor(',htmlStart),htmlContext={filmItems:[structuredClone(base)],filmItemPreview:()=>'<span>Preview</span>',hasEditableVectorColor:()=>false,h:value=>String(value||'').replaceAll('<','&lt;').replaceAll('>','&gt;'),canSeparateFilmPhrase,editableFilmLetterHeight};
const html=runInNewContext(source.slice(htmlStart,htmlEnd)+';filmItemsHTML()',htmlContext);assert.match(html,/data-separate-film-phrase="phrase"/);assert.match(html,/Cliente &lt;teste&gt;/);assert.doesNotMatch(html,/data-reunite-film-phrase/);
const split=separateFilmPhrase([base],'phrase');const wordHtml=runInNewContext(source.slice(htmlStart,htmlEnd)+';filmItemsHTML()',{...htmlContext,filmItems:split.items});assert.equal((wordHtml.match(/data-reunite-film-phrase=/g)||[]).length,4);assert.doesNotMatch(wordHtml,/data-separate-film-phrase/);assert.equal((wordHtml.match(/class="film-item-qty"[^>]+ disabled/g)||[]).length,4);assert.match(wordHtml,/Palavra 1\/4/);assert.match(wordHtml,/Uma só aplicação/);
assert.equal((wordHtml.match(/edit-film-item[^>]+ disabled/g)||[]).length,0,'Tamanho is enabled for a whole-word group without unlocking application quantity');
assert.match(wordHtml,/Tamanho ajusta a altura do conjunto inteiro/);
assert.equal(editableFilmLetterHeight({...base,number:'22'}),false,'A number/unified composition never enters the phrase-only height editor');
assert.equal(editableFilmLetterHeight({...split.items[0],vectorSource:{path:'drawing.svg'}}),false,'A whole illustration keeps its image size editor');
const linked={...base,zero19WorkItemId:'work',applicationQuantity:2,letteringProductionSnapshot:{top_text:base.name},letteringApplicationParts:[]};linked.letteringApplicationParts=[letteringApplicationPart(linked)];
const linkedHtml=runInNewContext(source.slice(htmlStart,htmlEnd)+';filmItemsHTML()',{...htmlContext,filmItems:[linked]});assert.match(linkedHtml,/class="film-item-qty"[^>]+ disabled/);assert.match(linkedHtml,/duplicate-film-item[^>]+ disabled/);assert.match(linkedHtml,/Escrita e quantidade do pedido/);
const css=readFileSync(new URL('../production-v217.css',import.meta.url),'utf8');assert.match(css,/\[data-separate-film-phrase\].*min-height:44px!important;background:#fff;color:#111113/,'Full-width legible 44px touch actions');
assert.match(source,/button\.dataset\.separateFilmPhrase\?separateFilmPhrase/);assert.match(source,/source!==filmItems\|\|change!==filmDraftChange/);
console.log('PASS film phrase actions: whole-word rendering/layout before atomic commit, lossless reunite, no mutation on font failure/stale edit/route, visible source/split actions, protected word/application quantity, escaped text and responsive contrast/touch CSS.');
