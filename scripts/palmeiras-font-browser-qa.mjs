// Optional local regression using the owner's original TTF files. No font is
// copied into the repository, deployment, or public storage.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const downloads=process.argv[2];if(!downloads)throw Error('Pass the directory containing the two original TTF files.');
const fonts=await Promise.all(['Estampa Camisa Terceiro Uniforme Palmeiras 2026 - 2027.ttf','Corinthians 2026 (1).ttf'].map(async name=>(await fs.readFile(path.join(downloads,name))).toString('base64')));
const core=(await fs.readFile(new URL('../lettering-core.js',import.meta.url),'utf8')).replaceAll('export ','');
const refine=(await fs.readFile(new URL('../lettering-layout-v2176.js',import.meta.url),'utf8')).replaceAll('export ','');
const prod=await fs.readFile(new URL('../production-v217.js',import.meta.url),'utf8');
const draw=prod.slice(prod.indexOf('  async function drawPreparedLetteringLine('),prod.indexOf('  function customizationDefaults('));
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'z19-font-qa-')),port=14300+Math.floor(Math.random()*200);
const child=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));let socket,id=0;const pending=new Map();
function send(method,params={}){return new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>reject(Error('CDP timeout')),30000);pending.set(key,{resolve:r=>{clearTimeout(timer);resolve(r)},reject});socket.send(JSON.stringify({id:key,method,params}))})}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
try{
 let url;for(let i=0;i<80;i++){try{url=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(t=>t.type==='page')?.webSocketDebuggerUrl;if(url)break}catch{}await delay(150)}if(!url)throw Error('Browser unavailable');
 socket=new WebSocket(url);await new Promise(r=>socket.addEventListener('open',r,{once:true}));socket.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}});
 const result=await evaluate(`(async()=>{${core}\n${refine}\n${draw}
 const fonts=${JSON.stringify(fonts)};
 for(let i=0;i<fonts.length;i++){const f=new FontFace('official'+i,'url(data:font/ttf;base64,'+fonts[i]+')');await f.load();document.fonts.add(f)}
 const results=[];
 for(const [i,name] of ['JOÃO','GABRIEL'].entries()){
  const source={id:i===0?'488c3140-fc74-4124-832a-fdb62e127c26':'corinthians'},family='official'+i;
  const item={name,number:'8',nameHeightCm:5.5,numberHeightCm:28,gapCm:1.5,nameTrackingCm:.15,digitSpacingCm:.2,fontSource:source,glyphs:[],letteringMetricsVersion:3,spacingMode:'rectangular'};
  const measure=document.createElement('canvas').getContext('2d');measure.font='1000px "'+family+'"';
  const legacy={...measureLetteringItem({...item,measureFont:c=>measure.measureText(c)}),families:new Map([[source.id,family]])};
  const old=await refineLetteringLayout(item,legacy);
  item.nameReferenceChar=officialNameReference(item);
  const layout=await refineLetteringLayout(item,legacy),ppm=300/2.54,parts=[];
  for(const part of layout.nameLine.parts){
   const canvas=document.createElement('canvas');canvas.width=Math.ceil(part.widthCm*ppm)+8;canvas.height=Math.ceil(layout.nameLine.heightCm*ppm)+8;
   const g=canvas.getContext('2d');g.translate(4,4);g.scale(ppm,ppm);await drawPreparedLetteringLine(g,{parts:[{...part,xCm:0}]},layout.families,0,0,'#fff');
   const data=g.getImageData(0,0,canvas.width,canvas.height).data;let min=canvas.height,max=-1;
   for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(data[(y*canvas.width+x)*4+3]>127){min=Math.min(min,y);max=Math.max(max,y)}
   parts.push({char:part.char,heightCm:part.heightCm,printedCm:(max-min+1)/ppm,fontSizeCm:part.fontSizeCm});
  }
  const optical=await refineLetteringLayout({...item,spacingMode:'optical'},legacy,{drawLine:drawPreparedLetteringLine});
  results.push({name,parts,oldParts:old.nameLine.parts.map(p=>({char:p.char,heightCm:p.heightCm})),numberUnchanged:JSON.stringify(old.numberLine)===JSON.stringify(layout.numberLine),opticalHeights:optical.nameLine.parts.map(p=>p.heightCm)});
 }
 return results;
})()`);
 console.log(JSON.stringify(result,null,2));
 // Browser glyph hinting/antialiasing can move the ink edge by several pixels;
 // allow at most 0.5 mm at 300 DPI, never the old ~1.5 cm undersizing.
 const [pal,cor]=result;for(const p of pal.parts.filter(p=>p.char==='O')){assert(Math.abs(p.heightCm-5.5)<1e-8);assert(Math.abs(p.printedCm-5.5)<.05)}
 assert(pal.parts[0].heightCm>5.5);assert(pal.parts.every(p=>p.fontSizeCm===pal.parts[0].fontSizeCm),'uniform scale preserves proportions');
 assert.deepEqual(cor.parts.map(p=>({char:p.char,heightCm:p.heightCm})),cor.oldParts,'Corinthians unchanged');
 for(const r of result){assert(r.numberUnchanged,'numbers unchanged');assert.deepEqual(r.opticalHeights,r.parts.map(p=>p.heightCm))}
 console.log('PASS original TTFs: O=5.5 cm reference, uniform proportions, optical/rectangular, Corinthians and numbers unchanged.');
}finally{socket?.close();child.kill();}
