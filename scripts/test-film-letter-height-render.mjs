import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {parseFontCmap} from '../font-cmap.js';
import {measureLetteringItem} from '../lettering-core.js';
import {refineLetteringLayout,officialNameReference} from '../lettering-layout-v2176.js';
import {letteringFontForCharacter} from '../lettering-symbols.js';
import {separateFilmPhrase,assertCompleteFilmPhrases} from '../film-phrase-parts.js';

// Optional real-font QA: node this-script.mjs <original Brasil TTF>. The regular
// build uses deterministic synthetic metrics without requiring private files.
// Real mode reads official TTF glyph bounding boxes/advances, not a substitute
// font. Canvas painting is stubbed; this checks physical recipe/body geometry.
function ttfMetrics(bytes){
 const coverage=parseFontCmap(bytes),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),tables=new Map();
 for(let n=0;n<view.getUint16(4);n++){const at=12+n*16,tag=String.fromCharCode(...[0,1,2,3].map(offset=>view.getUint8(at+offset)));tables.set(tag,view.getUint32(at+8));}
 for(const tag of ['head','hhea','hmtx','loca','glyf'])assert(tables.has(tag),'TrueType fixture has '+tag);
 const units=view.getUint16(tables.get('head')+18),longLocations=view.getInt16(tables.get('head')+50)===1,metricCount=view.getUint16(tables.get('hhea')+34),scale=1000/units;
 const offset=index=>longLocations?view.getUint32(tables.get('loca')+index*4):view.getUint16(tables.get('loca')+index*2)*2;
 return {coverage,measure(char){const index=coverage.glyphIndex(char);assert(index||char===' ','Real fixture glyph exists: '+char);const width=view.getUint16(tables.get('hmtx')+Math.min(index,metricCount-1)*4)*scale,start=offset(index),end=offset(index+1);if(start===end)return {width,actualBoundingBoxAscent:0,actualBoundingBoxDescent:0,actualBoundingBoxLeft:0,actualBoundingBoxRight:0};const at=tables.get('glyf')+start,xMin=view.getInt16(at+2)*scale,yMin=view.getInt16(at+4)*scale,xMax=view.getInt16(at+6)*scale,yMax=view.getInt16(at+8)*scale;return {width,actualBoundingBoxAscent:yMax,actualBoundingBoxDescent:-yMin,actualBoundingBoxLeft:-xMin,actualBoundingBoxRight:xMax};}};
}
const synthetic={coverage:{hasGlyph:()=>true},measure(char){return {width:char===' '?300:500,actualBoundingBoxAscent:/[ÁÉÓ]/u.test(char)?880:700,actualBoundingBoxDescent:0,actualBoundingBoxLeft:0,actualBoundingBoxRight:char===' '?0:500};}};
const realPath=process.argv[2],official=realPath?ttfMetrics(readFileSync(realPath)):synthetic;
const fallback=realPath?ttfMetrics(readFileSync('C:/Windows/Fonts/arial.ttf')):synthetic;
const source=readFileSync(new URL('../production-v217.js',import.meta.url),'utf8'),rendererFunction=source.includes('  async function prepareLegacyLetteringLayout(')?'prepareLegacyLetteringLayout':'prepareLetteringLayout',prepareStart=source.indexOf(`  async function ${rendererFunction}(`),prepareEnd=source.indexOf('  function customizationDefaults(',prepareStart),pieceStart=source.indexOf('  async function makeFilmLetteringPiece('),pieceEnd=source.indexOf('  function openFilmLetteringBatchComposer(',pieceStart),defaultsStart=source.indexOf('  function customizationDefaults('),defaultsEnd=source.indexOf('  function orderCustomizationSettings(',defaultsStart);
assert(prepareStart>0&&prepareEnd>prepareStart&&pieceStart>0&&pieceEnd>pieceStart&&defaultsEnd>defaultsStart);
const canvasDocument={createElement(){return {width:0,height:0,getContext(){return {font:'',measureText(char){return (this.font.includes('"official"')?official:fallback).measure(char);}};},toDataURL(){return 'data:image/png;base64,stubbed-paint';}};}};
const legacyContext={measureLetteringItem,letteringFontForCharacter,loadOfficialFont:async()=> 'official',fontCoverageByFamily:new Map([['official',official.coverage]]),document:canvasDocument,glyphAspect:()=>.6};
const legacy=runInNewContext(source.slice(prepareStart,prepareEnd)+`;${rendererFunction}`,legacyContext);
const previousDocument=globalThis.document;globalThis.document=canvasDocument;
try{
 let layouts=0;const measured=[],drawn=[];
 const prepareLetteringLayout=async item=>{layouts++;const initial=await legacy(item),layout=await refineLetteringLayout({...item,letteringMetricsVersion:3,spacingMode:'rectangular'},initial,{drawLine:async()=>{},sanitizeSvg:value=>value,hasGlyph:(_family,char)=>official.coverage.hasGlyph(char)});measured.push(layout);return layout;};
 const pieceFunction=source.slice(pieceStart,pieceEnd).replace('name:cleanName,number:cleanNumber,fontSource:set._source||null,fontSources:set._sources||[],',"name:cleanName.normalize('NFC'),number:cleanNumber,letteringMetricsVersion:3,spacingMode:'optical',fontSource:set._source||null,fontSources:set._sources||[],");
 assert.match(pieceFunction,/letteringMetricsVersion:3/,'Mirror the build body-metric opt-in for the actual production function');
 const api=runInNewContext(source.slice(defaultsStart,defaultsEnd)+pieceFunction+';makeFilmLetteringPiece',{prepareLetteringLayout,officialNameReference,document:canvasDocument,drawTeamCustomization:async(_context,item)=>drawn.push({name:item.name,height:item.nameHeightCm,tracking:item.nameTrackingCm}),customizationName:set=>set.name,customizationKind:()=> 'lettering',crypto,structuredClone,sanitizeSvg:value=>value});
 const set={id:'brasil-2026',name:'Brasil 2026',default_name_height_cm:5.5,default_number_height_cm:28,letter_tracking_cm:.15,digit_spacing_cm:.2,name_number_gap_cm:1.5,_source:{id:'brasil-ttf',path:'private/original.ttf'}};
 const settings={nameHeightCm:5.5,numberHeightCm:28,nameTrackingCm:.15,digitSpacingCm:.2,gapCm:1.5,maxTextWidthCm:34};
 const phrase='IGUAL A PISCINA: SE ACHA QUE DÁ PÉ, SÓ VEM!';
 const item=await api(set,{name:phrase,settings,pieceType:'name',groupId:'physical-application'});
 assert.equal(item.nameHeightCm,5.5);assert.equal(item.defaultNameHeightCm,5.5);assert.equal(item.nameTrackingCm,.15);assert(item.widthCm>34,'The film keeps a long line wider than the shirt preview; it never fits to 34cm automatically');assert.equal(layouts,1,'One layout, not a second measurement at a reduced height');assert.equal(measured[0].nameLine.bodyHeightCm,5.5);
 assert.deepEqual(drawn,[{name:phrase,height:5.5,tracking:.15}],'Preview receives the same unshrunk physical recipe');
 item.localId='full';const split=separateFilmPhrase([item],'full');assert.equal(split.parts[0].name,'IGUAL');
 for(const part of split.parts){const layout=await prepareLetteringLayout(part);assert.equal(layout.nameLine.text,part.name);assert.equal(layout.nameLine.bodyHeightCm,5.5);assert.equal(part.nameHeightCm,5.5);assert.equal(part.nameTrackingCm,.15);assert.deepEqual([...layout.nameLine.parts].map(glyph=>glyph.char).join(''),part.name,'The renderer produces one whole word; no glyph is turned into a separate film item');const baselines=layout.nameLine.parts.filter(glyph=>glyph.kind==='font').map(glyph=>glyph.baselineCm);assert(baselines.every(baseline=>Math.abs(baseline-baselines[0])<1e-9),'All characters of a word share the line baseline');part.widthCm=layout.widthCm;part.heightCm=layout.heightCm;}
 assert.equal(assertCompleteFilmPhrases(split.items),true);assert.equal(split.parts.find(part=>part.name==='DÁ').nameHeightCm,5.5);
 console.log(JSON.stringify({mode:realPath?'real-original-Brasil-TTF-glyph-metrics':'deterministic-geometry',bodyHeightCm:item.nameHeightCm,lineWidthCm:item.widthCm,lineInkHeightCm:item.heightCm,wholeIGUAL:split.parts[0].name,trackingCm:item.nameTrackingCm,words:split.parts.length,paintStubbed:true}));
 console.log('PASS actual makeFilmLetteringPiece: no safe-width shrink, fixed nominal height/tracking, official body refinement, accents/punctuation and indivisible single-baseline words; physical recipe/source untouched.');
}finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
