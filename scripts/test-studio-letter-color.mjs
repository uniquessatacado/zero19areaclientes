import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {sanitizeFilmDraft} from '../film-draft.js';
import {separateFilmPhrase} from '../film-phrase-parts.js';
import {officialNameReference} from '../lettering-layout-v2176.js';
const source=readFileSync(new URL('../production-v217.js',import.meta.url),'utf8');
const settingsStart=source.indexOf('  function orderCustomizationSettings('),settingsEnd=source.indexOf('  function openCustomizationComposer(',settingsStart);
const settings=runInNewContext(source.slice(settingsStart,settingsEnd)+';orderCustomizationSettings',{customizationDefaults:()=>({nameHeightCm:5.5,numberHeightCm:28,gapCm:1.5,nameTrackingCm:.15,digitSpacingCm:.2})});
const makeStart=source.indexOf('  async function makeFilmLetteringPiece('),makeEnd=source.indexOf('  function openFilmLetteringBatchComposer(',makeStart);
const drawn=[];
let simulatedWidth=30;
const make=runInNewContext(source.slice(makeStart,makeEnd)+';makeFilmLetteringPiece',{officialNameReference,customizationDefaults:()=>({nameHeightCm:5.5}),prepareLetteringLayout:async item=>({widthCm:simulatedWidth*item.nameHeightCm/5.5,heightCm:item.nameHeightCm,nameLine:{parts:[]},numberLine:{parts:[]}}),customizationName:()=> 'Brasil 2026',crypto,document:{createElement:()=>({getContext:()=>({}),toDataURL:()=> 'data:image/png;base64,QA'})},drawTeamCustomization:async(_context,item)=>drawn.push(item.inkColor),sanitizeSvg:x=>x});
const colorStart=source.indexOf('  const colorFor='),colorEnd=source.indexOf('  function drawPlacedImage(',colorStart);
const colorFor=runInNewContext(source.slice(colorStart,colorEnd)+';colorFor');
for(const color of ['#1565C0','#FFFFFF','#000000','#D32F2F','#FFCC00','#267B3B']){
 const recipe={ink_color:color,letter_height_cm:5,max_text_width_cm:30};
 const configured=settings({},recipe);assert.equal(configured.inkColor,color);assert.equal(configured.nameHeightCm,5);
 const item=await make({id:'font',name:'Brasil 2026',_palette:[{role:'primary',color_hex:'#267B3B'}]},{name:'BRUNA GOMES',settings:configured,pieceType:'name'});
 assert.equal(item.inkColor,color);assert.equal(drawn.at(-1),color);assert.equal(colorFor(item,'name'),color);assert.equal(colorFor(item,'number'),color);
 Object.assign(item,{localId:'phrase',quantity:1,zero19WorkItemId:'work',applicationQuantity:1,externalOrderItemRef:'sale',officialProjectId:'project'});
 const split=separateFilmPhrase([item],'phrase');assert(split.parts.every(part=>part.inkColor===color));
 const draft=sanitizeFilmDraft({version:1,ownerId:'owner',items:split.items,settings:{gapMm:3}});assert(draft.data.items.every(part=>part.inkColor===color));
}
assert.equal(colorFor({palette:[{role:'primary',color_hex:'#267B3B'}]},'name'),'#267B3B');
assert.equal(settings({},{ink_color:'url(unsafe)'}).inkColor,undefined);
simulatedWidth=100;
for(const height of [5.5,5,4]){
 const configuration=settings({},{letter_height_cm:height,max_text_width_cm:24,studio_text_layout:'TWENTY_LETTERS'});
 const fitted=await make({id:'font'},{name:'PALAVRA',settings:configuration,pieceType:'name'});
 assert.equal(fitted.nameHeightCm,height-.5);assert.equal(fitted.defaultNameHeightCm,height);
 const legacy=await make({id:'font'},{name:'PALAVRA',settings:settings({},{letter_height_cm:height,max_text_width_cm:24}),pieceType:'name'});
 assert.equal(legacy.nameHeightCm,height);
 const editSettings=settings({},{letter_height_cm:height,max_text_width_cm:24,studio_text_layout:'TWENTY_LETTERS'},{preserveHeight:true});
 const edited=await make({id:'font'},{name:'FRASE MUITO LONGA COM ACENTUAÇÃO',settings:editSettings,pieceType:'name'});
 assert.equal(edited.nameHeightCm,height,'Editing a phrase or accent never reapplies width-based height reduction');
}
console.log('PASS studio ink -> production settings -> film preview/render colour -> whole words/draft; blue/white/black/red/yellow/green, legacy palette preserved. Raster and physical printer require visual QA.');
