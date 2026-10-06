import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {separateFilmPhrase,reuniteFilmPhrase,resizeFilmPhraseHeight,filmPhraseNominalHeight,assertCompleteFilmPhrases,letteringApplicationPart} from '../film-phrase-parts.js';

const source=readFileSync(new URL('../production-v217.js',import.meta.url),'utf8');
const start=source.indexOf('  function editableFilmLetterHeight('),end=source.indexOf('  function editFilmItem(',start);
assert(start>0&&end>start,'Test the actual UI editor, not an imitation');
const base={localId:'phrase',type:'team_customization',sourceId:'font',name:'IGUAL A PISCINA!',number:'',nameHeightCm:2.17,nameTrackingCm:.059,widthCm:34.15,heightCm:2.71,quantity:2,applicationQuantity:2,zero19WorkItemId:'work',externalOrderItemRef:'sale',compositionGroupId:'composition',letteringRevision:'source-revision',letteringProductionSnapshot:{top_text:'IGUAL A PISCINA!',letter_height_cm:5.5},fontSource:{id:'private',path:'original-private.ttf'},label:'Fonte oficial'};
base.letteringApplicationParts=[letteringApplicationPart(base)];
const number={...structuredClone(base),localId:'number',name:'',number:'22',nameHeightCm:5.5,numberHeightCm:28,widthCm:29.6,heightCm:28};
base.letteringApplicationParts.push(letteringApplicationPart(number));number.letteringApplicationParts=structuredClone(base.letteringApplicationParts);
const split=separateFilmPhrase([base,number],'phrase');
const makeButton=()=>({disabled:false,onclick:null});
function setup(items,{fontDefaultHeightCm=null}={}){
 let modal,failText='',failDraw='',delayHook=null,layouts=0,draws=0,done=0,focus=0,clears=0;
 const notes=[],measured=[];
 const document={activeElement:{focus(){focus++;}},body:{append(node){modal=node;node.isConnected=true;}},createElement(kind){
  if(kind==='canvas')return {width:0,height:0,getContext(){return {};},toDataURL(){return 'data:image/png;base64,current-preview';}};
  const save=makeButton(),error={textContent:''},input={value:'',disabled:false,focus(){focus++;},select(){}},cancel=[makeButton(),makeButton()],restore=makeButton(),form={elements:{letterHeight:input},onsubmit:null};
  return {isConnected:false,_html:'',set innerHTML(value){this._html=value;input.value=value.match(/name="letterHeight"[^>]*value="([^"]+)"/)[1];},get innerHTML(){return this._html;},remove(){this.isConnected=false;},querySelector(selector){return selector==='form'?form:selector==='[data-height-save]'?save:selector==='[data-height-error]'?error:selector==='[data-restore-height]'&&this._html.includes('data-restore-height')?restore:null;},querySelectorAll(selector){return selector==='[data-close]'?cancel:[];}};
 }};
 const context={structuredClone,separateFilmPhrase,reuniteFilmPhrase,resizeFilmPhraseHeight,filmPhraseNominalHeight,assertCompleteFilmPhrases,filmItems:structuredClone(items),filmDraftChange:0,productionAccountGeneration:1,account:'owner',owner:()=>context.account,location:{hash:'#/filme'},document,ctx:{toast:(...args)=>notes.push(args)},h:value=>String(value||'').replaceAll('<','&lt;'),lastFilm:{previous:true},filmMaskCache:{clear(){clears++;}},prepareLetteringLayout:async item=>{layouts++;measured.push({text:item.name,height:item.nameHeightCm,tracking:item.nameTrackingCm});await delayHook?.(item);if(item.name===failText)throw new Error('Falha da fonte oficial');return {widthCm:[...item.name].length*item.nameHeightCm*.6,heightCm:item.nameHeightCm+.4,nameLine:{parts:[...item.name].map(char=>({char}))},numberLine:{parts:[]}};},drawTeamCustomization:async(_g,item)=>{draws++;if(item.name===failDraw)throw new Error('Falha ao renderizar prévia');}};
 runInNewContext(source.slice(start,end)+';this.openEditor=openFilmLetterHeightEditor;',context);
 const selected=context.filmItems.find(item=>item.phrasePart)||context.filmItems[0];
 context.openEditor(selected,async()=>done++,{fontDefaultHeightCm});
 return {context,selected,get modal(){return modal;},get form(){return modal.querySelector('form');},get input(){return this.form.elements.letterHeight;},get error(){return modal.querySelector('[data-height-error]').textContent;},set failText(value){failText=value;},set failDraw(value){failDraw=value;},set delayHook(value){delayHook=value;},counts:()=>({layouts,draws,done,focus,clears}),notes,measured,save:()=>modal.querySelector('[data-height-save]'),submit(){return this.form.onsubmit({preventDefault(){}});}};
}
const initial=JSON.stringify(split.items);
const cancelled=setup(split.items);cancelled.input.value='5,5';cancelled.modal.querySelectorAll('[data-close]')[1].onclick();assert.equal(cancelled.modal.isConnected,false);assert.equal(JSON.stringify(cancelled.context.filmItems),initial);assert.equal(cancelled.counts().layouts,0,'Cancel before applying never prepares/mutates a phrase');
await cancelled.submit();assert.equal(JSON.stringify(cancelled.context.filmItems),initial,'A late submit callback after Cancel must not change the film');assert.equal(cancelled.counts().layouts,0,'Detached editor callback is inert');
const escaped=setup(split.items);let prevented=false;escaped.modal.onkeydown({key:'Escape',preventDefault(){prevented=true;}});assert(prevented);assert(!escaped.modal.isConnected);assert.equal(JSON.stringify(escaped.context.filmItems),initial);
const restored=setup(split.items);assert.match(restored.modal.innerHTML,/Restaurar altura padrão: 5,5 cm/);restored.modal.querySelector('[data-restore-height]').onclick();assert.equal(restored.input.value,'5,5');assert.equal(JSON.stringify(restored.context.filmItems),initial,'Restore button only fills the explicit field until Apply');
await restored.submit();assert(!restored.modal.isConnected);assert.deepEqual(restored.context.filmItems.filter(item=>item.phrasePart).map(item=>item.name),['IGUAL','A','PISCINA!']);
assert(restored.context.filmItems.filter(item=>item.phrasePart).every(item=>item.nameHeightCm===5.5&&item.nameTrackingCm===.059&&item.quantity===2&&item.previewDataUrl?.includes('current-preview')));
assert.equal(restored.context.filmItems.find(item=>item.localId==='number').numberHeightCm,28,'Number is not resized with phrase');assert.equal(restored.counts().done,1);assert.equal(restored.counts().clears,1);assert.equal(restored.counts().layouts,4,'Original phrase plus each whole word measured before one atomic commit');assert.equal(restored.counts().draws,3);assert.equal(restored.context.lastFilm,null);
assert.equal(assertCompleteFilmPhrases(restored.context.filmItems),true);assert.equal(JSON.stringify(restored.context.filmItems[0].letteringProductionSnapshot),JSON.stringify(base.letteringProductionSnapshot));

for(const phase of ['font','draw']){
 const failed=setup(split.items),original=failed.context.filmItems;failed.input.value='6';if(phase==='font')failed.failText='PISCINA!';else failed.failDraw='A';
 await failed.submit();assert.equal(failed.context.filmItems,original);assert.equal(JSON.stringify(failed.context.filmItems),initial);assert(failed.modal.isConnected);assert.match(failed.error,/Falha/);assert.equal(failed.save().disabled,false);assert.equal(failed.input.disabled,false);assert.equal(failed.counts().done,0);assert.equal(failed.counts().clears,0,'Failure cannot discard a current mask/layout');
 failed.failText='';failed.failDraw='';await failed.submit();assert.equal(failed.counts().done,1,'Failed render is retryable without a partial update');
}
for(const change of ['draft','list','account','generation','route']){
 const raced=setup(split.items),original=raced.context.filmItems;raced.input.value='6';let once=false;
 raced.delayHook=()=>{if(once)return;once=true;if(change==='draft')raced.context.filmDraftChange++;if(change==='list')raced.context.filmItems=[...raced.context.filmItems];if(change==='account')raced.context.account='other';if(change==='generation')raced.context.productionAccountGeneration++;if(change==='route')raced.context.location.hash='#/inicio';};
 await raced.submit();assert.equal(JSON.stringify(raced.context.filmItems),initial);if(change!=='list')assert.equal(raced.context.filmItems,original);assert.equal(raced.counts().done,0);assert.equal(raced.counts().clears,0);assert.match(raced.error,/montagem mudou/,'Async editor cannot overwrite a newer account/route/film');
}
const repeated=setup(split.items);repeated.input.value='6';let release;const gate=new Promise(resolve=>release=resolve);repeated.delayHook=()=>gate;
const firstSave=repeated.submit();await repeated.submit();assert.equal(repeated.counts().layouts,1,'A double tap never starts a second group render');assert.equal(JSON.stringify(repeated.context.filmItems),initial);release();await firstSave;assert.equal(repeated.counts().done,1);assert.equal(assertCompleteFilmPhrases(repeated.context.filmItems),true);
const invalid=setup(split.items);for(const value of ['0','-3','101','abc']){invalid.input.value=value;await invalid.submit();assert.match(invalid.error,/altura/);}assert.equal(invalid.counts().layouts,0);assert.equal(JSON.stringify(invalid.context.filmItems),initial);
const currentChanged=setup(split.items);currentChanged.context.filmDraftChange++;currentChanged.input.value='6';await currentChanged.submit();assert(!currentChanged.modal.isConnected);assert.equal(currentChanged.counts().layouts,0);
const whole=setup([base,number]);whole.input.value='6';await whole.submit();assert.equal(whole.context.filmItems[0].nameHeightCm,6);assert.equal(whole.context.filmItems[1].numberHeightCm,28);assert.equal(whole.counts().layouts,1);assert.equal(assertCompleteFilmPhrases(whole.context.filmItems),true);
const legacy=setup([{...base,letteringProductionSnapshot:undefined,letteringApplicationParts:undefined}]);assert.equal(legacy.modal.querySelector('[data-restore-height]'),null,'Unknown legacy nominal height has no invented restore action');
const defaulted=setup([{...base,letteringProductionSnapshot:undefined,letteringApplicationParts:undefined}],{fontDefaultHeightCm:4});assert.match(defaulted.modal.innerHTML,/Restaurar altura padrão: 4 cm/);
console.log('PASS actual film height editor: intact whole-word group/source measurement and atomic commit, restore explicit, fixed tracking/font/source/quantity, cancel/Escape/double tap, invalid input, failed font/preview retry, stale draft/list/account/generation/route guards; number and unknown historical recipes unchanged.');
