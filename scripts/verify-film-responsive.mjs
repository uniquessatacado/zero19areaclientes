import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
const base=process.argv[2]||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {nestItems,validateFilmPlacements,cmToPx}=await import(pathToFileURL(path.join(base,'nesting-core.js')));
const {nestBatchRectangles}=await import(pathToFileURL(path.join(base,'nesting-batch-core.js')));
const {filmViewportScale}=await import(pathToFileURL(path.join(base,'film-mobile-ui.js')));
const options={filmWidthMm:580,mode:'maximum',gapMm:3,cellMm:1,maxLengthMm:100000};let passed=0;
for(const n of [101,386,1000]){const items=Array.from({length:n},(_,i)=>({id:'art'+i,widthMm:i%3?221:264.8,heightMm:i%3?280:55.1,quantity:1,rotationPolicy:'free'})),before=JSON.stringify(items),start=performance.now(),r=nestItems(items,options);assert.equal(r.placements.length,n);assert.equal(validateFilmPlacements(items,r.placements,options).lengthMm,r.lengthMm);assert.equal(JSON.stringify(items),before);assert.ok(r.efficiency>0&&r.efficiency<=100);assert.ok(r.lengthMm>0);assert.ok(cmToPx(r.lengthMm/10)>0);assert.ok(performance.now()-start<8000);assert.deepEqual(r,nestItems(items,options));console.log('PASS lote real do algoritmo: '+n+' cópias; '+Math.round(performance.now()-start)+' ms; '+(r.lengthMm/1000).toFixed(3)+' m');passed+=7;}
const items=[{id:'fixed',widthMm:160.3,heightMm:97.7,quantity:120,rotationPolicy:'none'}],r=nestItems(items,options);assert.ok(r.placements.every(p=>p.rotation===0&&p.sourceWidthMm===160.3&&p.sourceHeightMm===97.7));passed++;
const locked={...r.placements[0],locked:true},withLock=nestItems(items,{...options,lockedPlacements:[locked],baselinePlacements:r.placements});assert.deepEqual(withLock.placements[0],locked);passed++;
assert.throws(()=>nestItems(items,{...options,lockedPlacements:[locked,locked]}));passed++;
const corrupt=structuredClone(r.placements);corrupt[0].sourceWidthMm=4;assert.throws(()=>validateFilmPlacements(items,corrupt,options));passed++;
const duplicate=structuredClone(r.placements);duplicate[1]={...duplicate[0]};assert.throws(()=>validateFilmPlacements(items,duplicate,options));passed++;
const cross=structuredClone(r.placements);cross[1]={...cross[1],xMm:0,yMm:0};assert.throws(()=>validateFilmPlacements(items,cross,options));passed++;
assert.throws(()=>nestBatchRectangles([{id:'wide',widthMm:590,heightMm:40,quantity:120,rotationPolicy:'none'}],options));passed++;
assert.equal(nestBatchRectangles([{id:'wide',widthMm:590,heightMm:40,quantity:120,rotationPolicy:'90'}],options).placements.length,120);passed++;
for(const w of [320,375,390,430,768,1280]){const el={parentElement:{clientWidth:w,clientHeight:500}},s=filmViewportScale(el,r),overview=filmViewportScale(el,r,1,true);assert.ok(r.filmWidthMm*s+52<=w);assert.ok(r.lengthMm*overview+52<=500.00001);passed+=2;}
const p=fs.readFileSync(path.join(base,'production-v217.js'),'utf8'),v=fs.readFileSync(path.join(base,'film-preview.js'),'utf8'),html=fs.readFileSync(path.join(base,'index.html'),'utf8');assert.ok(p.includes('rectanglesOnly?null:await maskForItem(item)'));assert.ok(p.includes('Cópias no filme'));assert.ok(p.includes("drawFilm(media);app.querySelector('#exportFilm').disabled=false"));assert.ok(v.includes('attachFilmViewport'));assert.ok(v.includes('loading="lazy"'));assert.ok(html.indexOf('film-mobile.css')>html.indexOf('qr-screens.css'));passed+=6;
console.log('PASS '+passed+' verificações de lote/medidas/identidade/limites/zoom e integração compilada.');
