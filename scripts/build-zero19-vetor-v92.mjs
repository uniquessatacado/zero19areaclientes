// 2.17.92 on top of 2.17.91 (06/11, dono, com a arte da TH Pinturas que "deu faixa quando fiz no vetorize ia": "pode fazer a tela
// dentro do 019; pode fazer um botão no menu lateral e também na tela de filme um botão para vetorizar uma arte"; "quero o negócio
// funcionando perfeitamente: eu mando a imagem e o negócio deixa top vetorizado; foco para os degradês não virar faixa").
// Tela "Vetorizar arte" (vetor/page.js, motor em vetor/engine, processo separado em vetor/worker.js): enviar → fundo (Remover fundo
// marcado, Apagar/Restaurar) → medida em cm → Vetorizar (etapas e Cancelar) → comparar → baixar SVG/PNG com DPI ou salvar em
// Artes prontas e jogar no filme. Entra pelo menu (Ferramentas de produção) e pelo botão "✨ Vetorizar arte" do Montar filme.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.91"'))throw new Error('v92 exige a base 2.17.91.');
if(!fs.existsSync(path.join(dist,'vetor/page.js'))||!fs.existsSync(path.join(dist,'vetor/engine/index.js')))throw new Error('v92: a pasta vetor/ (tela e motor) não foi copiada para o dist.');
function patch(name,pairs){let source=read(name);for(const [before,after,times=1] of pairs){const count=source.split(before).length-1;if(count!==times)throw new Error('v92 '+name+': trecho alterado ou repetido ('+count+'×): '+before.slice(0,120));source=source.split(before).join(after);}write(name,source);}

patch('app.js',[
  ["import { createVendussArtworkArchive } from './venduss-artwork-archive.js?v=2.17.91';",
   "import { createVendussArtworkArchive } from './venduss-artwork-archive.js?v=2.17.91';\nimport { createVectorizerPage } from './vetor/page.js?v=2.17.91';"],
  ["queueAssetToFilm:request=>productionModule.queueLibraryAssetRequest(request),toast:(message,kind)=>toast(message,kind)});\nasync function renderCurrentRoute(){",
   "queueAssetToFilm:request=>productionModule.queueLibraryAssetRequest(request),toast:(message,kind)=>toast(message,kind)});\n// 2.17.92: Vetorizar arte (menu e botão do filme).\nconst vectorizerPage=createVectorizerPage({supabase,app,shell:(content,options)=>shell(content,options),bindCommon:()=>bindCommon(),nav:target=>nav(target),toast:(message,kind)=>toast(message,kind),accountOwnerId:()=>accountOwnerId(),sessionUserId:()=>session?.user?.id,libraryWorkspace:async()=>{await ensureDefaults();return libraryWorkspaces.library_artes;},uploadFile:(target,blob,options)=>storageUploader.upload(target,blob,options),bucket:BUCKET,queueToFilm:list=>productionModule.queueLibraryAssetsRequest(list)});\nasync function renderCurrentRoute(){"],
  ["  if(session&&current==='/acervo-venduss')return vendussArtworkArchive.render();",
   "  if(session&&current.split('?')[0]==='/vetorizar')return vectorizerPage.render();\n  if(session&&current==='/acervo-venduss')return vendussArtworkArchive.render();"],
  ['<button class="${active(\'/filme\')}" data-nav="/filme">Montar filme DTF</button>',
   '<button class="${active(\'/filme\')}" data-nav="/filme">Montar filme DTF</button><button class="${active(\'/vetorizar\')}" data-nav="/vetorizar">✨ Vetorizar arte</button>'],
]);
patch('production-v217.js',[
  ['<button class="btn film-action film-action-art" id="quickUploadFilmAsset">⇧ Subir arte na biblioteca</button>',
   '<button class="btn film-action film-action-art" id="quickUploadFilmAsset">⇧ Subir arte na biblioteca</button><button class="btn film-action film-action-art" id="openVectorizer" type="button">✨ Vetorizar arte</button>'],
  ["app.querySelector('#quickUploadFilmAsset').onclick=()=>safe(()=>ctx.quickUploadFilmArt?.());",
   "app.querySelector('#quickUploadFilmAsset').onclick=()=>safe(()=>ctx.quickUploadFilmArt?.());app.querySelector('#openVectorizer')?.addEventListener('click',()=>ctx.nav('/vetorizar?from=filme'));"],
  // Arte da biblioteca (vetorizada ou subida na biblioteca) não tem pedido: a mensagem não fala em "ligada ao pedido".
  ["else if(added)ctx.toast(added>1?added+' artes adicionadas ao filme e ligadas aos pedidos. Confira as quantidades.':'Arte adicionada ao filme e ligada ao pedido.','ok');return;}",
   "else if(added){const library=request.batch.every(one=>one.libraryOnly);ctx.toast(library?(added>1?added+' artes adicionadas ao filme. Confira as quantidades.':'Arte adicionada ao filme.'):(added>1?added+' artes adicionadas ao filme e ligadas aos pedidos. Confira as quantidades.':'Arte adicionada ao filme e ligada ao pedido.'),'ok');}return;}"],
]);

// Versão nova em todos os arquivos, inclusive os da pasta vetor/ (tela, processo separado e motor).
const files=[...fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n))];
(function walk(dir){for(const e of fs.readdirSync(path.join(dist,dir),{withFileTypes:true})){const rel=path.join(dir,e.name);if(e.isDirectory())walk(rel);else if(/\.(js|css)$/.test(e.name))files.push(rel);}})('vetor');
for(const name of files)write(name,read(name).replace(/\b2\.17\.91\b/g,'2.17.92'));
if(!read('index.html').includes('content="2.17.92"'))throw new Error('v92: versão não foi renovada.');
for(const name of ['app.js','production-v217.js','vetor/page.js','vetor/worker.js',...fs.readdirSync(path.join(dist,'vetor/engine')).filter(n=>n.endsWith('.js')).map(n=>'vetor/engine/'+n)])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
console.log('019 2.17.92: Vetorizar arte (menu e filme), degradês sem faixa, SVG e PNG com DPI, salvar em Artes prontas e jogar no filme.');
