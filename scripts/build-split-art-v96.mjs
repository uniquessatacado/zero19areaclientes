// 2.17.96 on top of 2.17.95 (13/11, dono: "estou com problema ao tentar subir uma arte PNG de 2 metros, diz que tamanho
// excedido, tire isso e permita eu subir; e crie uma função de dividir o arquivo em partes de 1 metro para imprimir uma de
// cada vez; achar uma linha sem pixel, transparente, para cortar sem afetar tamanhos e sem distorcer; ana → ana 1/2, ana 2/2").
// (1) PNG grande (mais de 40 milhões de pixels) não é mais aberto inteiro no navegador ao escolher nem ao salvar: é lido
//     linha por linha (png-split.js, num Worker) e, se já está em 300 DPI ou mais na medida, o PNG final sai com os pixels
//     exatos do original (sem canvas, sem limite de tempo do canvas). Abaixo de 300 DPI segue o caminho de sempre (amplia).
// (2) "✂ Dividir em partes" na arte PNG mais alta que o limite (padrão 100 cm): cortes só em linhas sem pixel visível
//     (alfa ≥ 8, mesma regra da prancheta), partes recortadas até a arte, medida exata (mesma escala), nomes "ana 1/2"…,
//     mapa com os cortes e "Desfazer divisão". Cada parte é salva como uma arte normal (original = a parte exata).
// (3) Erro de tamanho do servidor vira mensagem clara (limite de envio do Supabase).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.95"'))throw new Error('v96 exige a base 2.17.95.');
for(const name of ['png-split.js','png-split-worker.js','upload-split.js'])if(!fs.existsSync(path.join(dist,name)))throw new Error('v96: '+name+' não foi copiado para o dist.');
function patch(name,pairs){let source=read(name);for(const [before,after,times=1] of pairs){const count=source.split(before).length-1;if(count!==times)throw new Error('v96 '+name+': trecho alterado ou ausente ('+count+'×): '+before.slice(0,90));source=source.split(before).join(after);}write(name,source);}
function patchAfter(name,marker,before,after){const source=read(name),at=source.indexOf(marker);if(at<0)throw new Error('v96 '+name+': marcador ausente '+marker.slice(0,50));const i=source.indexOf(before,at);if(i<0||source.indexOf(before,i+1)>=0)throw new Error('v96 '+name+': trecho ausente ou repetido depois do marcador: '+before.slice(0,80));write(name,source.slice(0,i)+after+source.slice(i+before.length));}

const app='app.js';
patch(app,[
  // Módulo da divisão.
  ["import { openArtOrderPicker, orderShortcuts, usedPositions } from './upload-art-order.js?v=2.17.95';",
   "import { openArtOrderPicker, orderShortcuts, usedPositions } from './upload-art-order.js?v=2.17.95';\nimport * as uploadSplit from './upload-split.js?v=2.17.95';"],
  // Ao escolher: PNG grande lido linha por linha (antes abria a imagem inteira no canvas e travava em 2 m).
  ["try{const bmp=await createImageBitmap(f);let c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;c.getContext('2d',{willReadFrequently:true}).drawImage(bmp,0,0);bmp.close?.();if(presetType!=='mockup')c=trimTransparentSafe(c);item.aspectRatio=c.height>0?c.width/c.height:0;c.width=c.height=1}catch(error){console.warn('Não foi possível ler a proporção da arte.',error)}",
   "if(!(await uploadSplit.prepare(item,{trim:presetType!=='mockup',onChange:()=>{if(m.isConnected&&uploadQueue.includes(item))renderUploadList(m,{lockedType:isMockupMode})}}))){try{const bmp=await createImageBitmap(f);let c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;c.getContext('2d',{willReadFrequently:true}).drawImage(bmp,0,0);bmp.close?.();if(presetType!=='mockup')c=trimTransparentSafe(c);item.aspectRatio=c.height>0?c.width/c.height:0;c.width=c.height=1}catch(error){console.warn('Não foi possível ler a proporção da arte.',error)}}"],
  // Caixa "✂ Dividir em partes" logo abaixo da medida.
  ["<small data-size-info=\"${i}\">${sizeInfo(q)}</small></div>`:''}",
   "<small data-size-info=\"${i}\">${sizeInfo(q)}</small></div>`:''}${uploadSplit.boxHTML(q,i)}"],
  // Medida da parte é a exata (mesma escala do arquivo): não se edita.
  ['placeholder="Largura cm">','placeholder="Largura cm"${q.splitPart?\' readonly title="Medida exata da parte"\':\'\'}>'],
  ['placeholder="Altura cm">','placeholder="Altura cm"${q.splitPart?\' readonly title="Medida exata da parte"\':\'\'}>'],
  ["  $$('[data-i][data-k]',list).forEach(el=>{",
   "  uploadSplit.bind(list,{queue:()=>uploadQueue,rerender:()=>{if(m.isConnected)renderUploadList(m,{lockedType})},toast,trim:()=>$('#optTrim',m)?.checked!==false});\n  $$('[data-i][data-k]',list).forEach(el=>{"],
  // Não salva enquanto divide.
  ["const uploadComplete=m=>uploadQueue.length>0&&","const uploadComplete=m=>!uploadSplit.busy(uploadQueue)&&uploadQueue.length>0&&"],
]);
// Salvar: parte dividida e PNG grande em 300 DPI vão com os pixels exatos; medida exata da parte.
const marker='processQueue = async function';
patchAfter(app,marker,"let isMockup=q.type==='mockup',doTrim=isMockup?false:trim,widthCm=isMockup?0:Number(String(q.widthCm||'').replace(',','.'))||0,heightCm=isMockup?0:Number(String(q.heightCm||'').replace(',','.'))||0,qualityTarget=0;",
  "let isMockup=q.type==='mockup',doTrim=isMockup?false:trim,widthCm=isMockup?0:Number(String(q.widthCm||'').replace(',','.'))||0,heightCm=isMockup?0:Number(String(q.heightCm||'').replace(',','.'))||0,qualityTarget=0;\n      if(q.splitPart){doTrim=false;widthCm=q.splitPart.widthCm;heightCm=q.splitPart.heightCm;}");
patchAfter(app,marker,"const result=await processImage(q.file,{trim:doTrim,targetWidthCm:byHeight?0:widthCm,targetHeightCm:byHeight?heightCm:0,onStage:text=>stage(`${done+1}/${queue.length} · ${text}`)});",
  "const result=(await uploadSplit.exactResult(q,{trim:doTrim,widthCm,heightCm,byHeight,onStage:text=>stage(`${done+1}/${queue.length} · ${text}`)}))||await processImage(q.file,{trim:doTrim,targetWidthCm:byHeight?0:widthCm,targetHeightCm:byHeight?heightCm:0,onStage:text=>stage(`${done+1}/${queue.length} · ${text}`)});");
patchAfter(app,marker,"if(!isMockup&&result.width>0&&result.height>0&&(widthCm>0||heightCm>0)){const r=result.width/result.height;",
  "if(!q.splitPart&&!isMockup&&result.width>0&&result.height>0&&(widthCm>0||heightCm>0)){const r=result.width/result.height;");
patchAfter(app,marker,"      if(target){const production=target.item.metadata",
  "      uploadSplit.decorateAsset(assetRow,q,result);\n      if(target){const production=target.item.metadata");
patchAfter(app,marker,"console.error('upload artwork',err);toast(`Erro em ${q.name}: ${err.message||err}`,'err');",
  "console.error('upload artwork',err);toast(`Erro em ${q.name}: ${uploadSplit.uploadErrorText(err)}`,'err');");

const css="\n/* 2.17.96: dividir arte grande em partes */\n.upload-split{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:12px 14px;border:2px dashed #93c5fd;border-radius:14px;background:#eff6ff;color:#0f172a}\n.upload-split-text{display:grid;gap:4px;flex:1 1 260px;min-width:0}\n.upload-split-text b{font-size:14px;font-weight:900}\n.upload-split small{color:#334155;font-size:12px;line-height:1.4}\n.upload-split-max{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:800;color:#0f172a}\n.upload-split-max input{width:72px;min-height:40px;text-align:center;font-weight:900}\n.upload-split-run{min-height:44px;background:#1d4ed8!important;border-color:#1d4ed8!important;color:#fff!important;font-weight:900}\n.upload-split-status{flex-basis:100%;font-weight:800;color:#1e3a8a!important}\n.upload-split-error{flex-basis:100%;font-weight:800;color:#b91c1c!important}\n.upload-split-note{flex-basis:100%;font-weight:800;color:#166534!important}\n.upload-split.is-blocked{border-color:#fca5a5;background:#fef2f2}\n.upload-split.is-done{border-style:solid;border-color:#86efac;background:#f0fdf4;align-items:flex-start}\n.upload-split.is-done ul{margin:4px 0;padding-left:18px;font-size:13px;font-weight:800}\n.upload-split-map{max-height:220px;max-width:120px;width:auto;height:auto;border:1px solid #cbd5e1;border-radius:8px;background:#fff;image-rendering:auto}\n.upload-split-part{padding:8px 12px;border-style:solid;border-color:#bbf7d0;background:#f0fdf4}\n.upload-split-mini{padding:6px 12px;border-style:solid}\n.upload-split-warn{color:#b91c1c!important}\n.upload-size-inputs input[readonly]{background:#f1f5f9;color:#0f172a;cursor:not-allowed}\n";
write('qr-screens.css',read('qr-screens.css')+css);

const files=fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n));
(function walk(dir){for(const e of fs.readdirSync(path.join(dist,dir),{withFileTypes:true})){const rel=path.join(dir,e.name);if(e.isDirectory())walk(rel);else if(/\.(js|css)$/.test(e.name))files.push(rel);}})('vetor');
for(const name of files)write(name,read(name).replace(/\b2\.17\.95\b/g,'2.17.96'));
if(!read('index.html').includes('content="2.17.96"'))throw new Error('v96: versão não foi renovada.');
for(const name of ['upload-split.js','png-split-worker.js'])if(!read(name).includes('?v=2.17.96'))throw new Error('v96: versão dos módulos da divisão não foi renovada em '+name+'.');
for(const name of ['app.js','png-split.js','png-split-worker.js','upload-split.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/test-png-split.mjs'],{cwd:root,stdio:'inherit'});
console.log('019 2.17.96: PNG grande sem travar (pixels exatos) e "✂ Dividir em partes" de até 1 m, cortando só em linha sem pixel.');
