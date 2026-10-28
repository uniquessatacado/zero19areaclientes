// 28/10 (dono): "remover a prancheta sobrando sem distorcer… até onde tem pixel".
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {placementDimensions} from '../official-order-workflow.js';
import {buildFilmAssetCatalogue} from '../film-picker.js';

// 1) Corte da prancheta: só o que tem pixel visível (pó quase invisível não segura a prancheta).
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=source.indexOf('function trimTransparentSafe(canvas){'),end=source.indexOf('\nasync function setPngDpi',start);
assert(start>0&&end>start,'trimTransparentSafe no app.js');
const fakeCanvas=(w,h,alpha)=>({width:w,height:h,getContext:()=>({getImageData:()=>{const data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)data[(y*w+x)*4+3]=alpha(x,y);return {data};},drawImage(){}})});
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){}})})};
const trim=new Function(source.slice(start,end)+'\nreturn trimTransparentSafe;')();
// Arte 40×20 no meio de uma prancheta 200×200 com pó de alfa 1–3 espalhado.
const art=(x,y)=>x>=80&&x<120&&y>=90&&y<110?255:((x*7+y*13)%5===0?3:0);
let out=trim(fakeCanvas(200,200,art));
// No máximo 2 px de borda suave de cada lado (0,17 mm a 300 DPI); antes a prancheta inteira ficava.
assert(out.width>=40&&out.width<=44&&out.height>=20&&out.height<=24,`corte ${out.width}×${out.height}`);
// Antialiasação encostada (alfa baixo até 2 px) fica; prancheta não.
out=trim(fakeCanvas(100,100,(x,y)=>x>=40&&x<60&&y>=40&&y<60?255:(x===39||x===60)&&y>=40&&y<60?4:0));
assert.equal(out.width,22);assert.equal(out.height,20);

// 2) Medida feita antes de tirar a prancheta não estica: vale a largura, altura pela proporção.
const asset={width:2000,height:1000,metadata:{}};
let d=placementDimensions(asset,{default_width_cm:28,default_height_cm:28});
assert.equal(d.width,28);assert.equal(d.height,14);
d=placementDimensions(asset,{default_width_cm:28,default_height_cm:14.05});
assert.equal(d.height,14.05,'diferença de arredondamento (<1%) continua');
d=placementDimensions(asset,{default_width_cm:0,default_height_cm:10});
assert.equal(d.width,20);

// 3) Filme: o mesmo vale ao entrar na lista de artes do filme.
const assetRow={id:'a1',asset_type:'arte',width:2000,height:1000,processed_path:'x.png',workspace_id:'w',name:'Arte'};
const list=buildFilmAssetCatalogue({profiles:[{asset_id:'a1',default_width_cm:28,default_height_cm:28,ready_for_print:true}],assetMap:new Map([['a1',assetRow]])});
assert.equal(list.length,1);
assert.match(JSON.stringify(list[0]),/"heightCm":14\b/);
console.log('prancheta e proporção: ok');
