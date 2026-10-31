// 2.17.88 on top of 2.17.87 (31/10, dono: "permita montar kit de personalização de uma camisa específica, escolho em artes
// todas as artes que vão na camisa, salvo o kit com nome e quando quiser adiciono no filme, já vai tudo certo; no filme só
// diminuo e aumento a quantidade de kits"). Botão "Kits de camisa" no filme (film-kits.js, no código-fonte); a lista do filme
// ganha a barra do kit com − / + ; o seletor de artes abre em modo kit; kit não aparece na lista de filmes salvos.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.87"'))throw new Error('v88 exige a base 2.17.87.');
if(!fs.existsSync(path.join(dist,'film-kits.js')))throw new Error('v88: film-kits.js não foi copiado para o dist.');
function patch(name,pairs){let source=read(name);for(const [before,after,times=1] of pairs){const count=source.split(before).length-1;if(count!==times)throw new Error('v88 '+name+': trecho alterado ou ausente ('+count+'×): '+before.slice(0,70));source=source.split(before).join(after);}write(name,source);}
let production=read('production-v217.js');
const importLine=production.match(/import \{openFilmAssetPicker,filmItemFromLibraryAsset\} from '\.\/film-picker\.js\?v=[0-9.]+';/);
if(!importLine)throw new Error('v88: import do film-picker não encontrado.');
write('production-v217.js',production.replace(importLine[0],importLine[0].replace('{openFilmAssetPicker,','{buildFilmAssetCatalogue,openFilmAssetPicker,')+"\nimport {addKitToFilm,createFilmKitStore,filmKitBarsHTML,filmKitGroups,openFilmKits,setFilmKitCount} from './film-kits.js?v=2.17.87';"));
patch('production-v217.js',[
  ['id="addFilmAsset">＋ Arte de empresa</button>','id="addFilmAsset">＋ Arte de empresa</button><button class="btn film-action film-action-kit" id="openFilmKits">🧩 Kits de camisa</button>'],
  ["app.querySelector('#addFilmAsset').onclick=","app.querySelector('#openFilmKits').onclick=()=>safe(()=>openKitsForFilm(profiles,assetMap,refreshItems));app.querySelector('#addFilmAsset').onclick="],
  ["+(filmItems.length?filmItems.map(i=>{","+filmKitBarsHTML(filmItems)+(filmItems.length?filmItems.map(i=>{"],
  ["${locked||linkedLettering?'disabled title=\"Quantidade do conjunto/pedido\"':''}","${locked||linkedLettering||i.kit?'disabled title=\"Quantidade do conjunto/pedido/kit\"':''}"],
  ["${locked||linkedLettering?'disabled':''}>Duplicar","${locked||linkedLettering||i.kit?'disabled':''}>Duplicar"],
  ["app.querySelectorAll('.film-item-qty').forEach(input=>input.onchange=async()=>{if(!pageCurrent())return;",
   "const kitGroup=id=>filmKitGroups(filmItems).find(row=>row.groupId===id),kitCount=async(id,count)=>{if(!pageCurrent())return;setFilmKitCount(filmItems,id,count);await refreshItems()};app.querySelectorAll('[data-kit-step]').forEach(button=>button.onclick=()=>{const group=kitGroup(button.dataset.kitGroup);if(group)void kitCount(group.groupId,group.count+Number(button.dataset.kitStep))});app.querySelectorAll('[data-kit-count]').forEach(input=>input.onchange=()=>{const group=kitGroup(input.dataset.kitGroup),count=Number(input.value);if(!group)return;if(!Number.isSafeInteger(count)||count<1){input.value=group.count;return ctx.toast('A quantidade de kits deve ser um número inteiro positivo.','err')}void kitCount(group.groupId,count)});app.querySelectorAll('[data-kit-remove]').forEach(button=>button.onclick=async()=>{if(!pageCurrent())return;const group=kitGroup(button.dataset.kitGroup);if(!group)return;for(const item of group.items)removeCurrentFilmEntry(item.localId,media);await refreshItems();drawOrders()});app.querySelectorAll('.film-item-qty').forEach(input=>input.onchange=async()=>{if(!pageCurrent())return;"],
  ["async function pickFilmAsset(profiles,assetMap,done){",
   `async function openKitsForFilm(profiles,assetMap,done){
    const generation=productionAccountGeneration,account=String(owner()||''),route=typeof location==='undefined'?'':location.hash;
    const current=()=>generation===productionAccountGeneration&&account===String(owner()||'')&&(typeof location==='undefined'||location.hash===route);
    const results=await preloadFilmPickerMeta();
    await ctx.assetUrls?.hydrate([...assetMap.values()]);
    if(!current())return;
    const previewUrl=path=>{if(ctx.assetUrls?.isPrivatePath(path))return ctx.publicUrl(path);try{return supabase.storage.from('z19p-assets').getPublicUrl(path,{transform:{width:520,height:520,resize:'contain',quality:72}})?.data?.publicUrl||ctx.publicUrl(path)}catch{return ctx.publicUrl(path)}};
    const source={profiles,assetMap,workspaces:results[0],projects:results[1],folders:results[2]};
    return openFilmKits({store:createFilmKitStore({supabase,owner,user:uid}),catalogue:buildFilmAssetCatalogue(source),previewUrl,publicUrl:ctx.publicUrl,toast:ctx.toast,
      pickArts:onPicked=>openFilmAssetPicker({...source,publicUrl:ctx.publicUrl,previewUrl,toast:ctx.toast,kitMode:true,onAdd:async items=>onPicked(items)}),
      addKit:async(kit,count,entries)=>{if(!current())return;addKitToFilm(filmItems,kit,entries,count);await done()}});
  }
  async function pickFilmAsset(profiles,assetMap,done){`],
]);
patch('film-picker.js',[
  ['previewUrl = null, onAdd, onGarment, onMockup, onEdit, toast} = {}) {','previewUrl = null, onAdd, onGarment, onMockup, onEdit, toast, kitMode = false} = {}) {'],
  ['<h2 id="${modalId}-title">Escolha as artes do filme</h2><p>Combine empresas, confira as medidas e adicione tudo de uma vez.</p>','<h2 id="${modalId}-title">${kitMode?\'Escolha as artes do kit\':\'Escolha as artes do filme\'}</h2><p>${kitMode?\'Escolha todas as artes que vão nesta camisa. Quantidade = quantas vezes a arte vai em cada camisa.\':\'Combine empresas, confira as medidas e adicione tudo de uma vez.\'}</p>'],
  ['✓ NO FILME · ${quantity}×','${kitMode?\'✓ NO KIT\':\'✓ NO FILME\'} · ${quantity}×'],
  ['✓ NO FILME · ${quantityOf(dims.quantity)}×','${kitMode?\'✓ NO KIT\':\'✓ NO FILME\'} · ${quantityOf(dims.quantity)}×'],
  ["＋ Adicionar${quantity > 1 ? ` ${quantity}` : ''} ao filme","＋ Adicionar${quantity > 1 ? ` ${quantity}` : ''} ${kitMode?'ao kit':'ao filme'}"],
  ["＋ Adicionar${quantityOf(dims.quantity)>1?` ${quantityOf(dims.quantity)}`:''} ao filme","＋ Adicionar${quantityOf(dims.quantity)>1?` ${quantityOf(dims.quantity)}`:''} ${kitMode?'ao kit':'ao filme'}"],
  ["'Vão entrar no filme · toque para revisar' : 'Toque em “Adicionar ao filme” nas artes.'","(kitMode ? 'Vão entrar no kit · toque para revisar' : 'Vão entrar no filme · toque para revisar') : (kitMode ? 'Toque em “Adicionar ao kit” nas artes.' : 'Toque em “Adicionar ao filme” nas artes.')"],
  ["Escolha outras ou toque em “Colocar no filme”.","Escolha outras ou toque em “${kitMode?'Usar no kit':'Colocar no filme'}”."],
  ["submit.innerHTML = busy ? 'Adicionando…' : rows.length ? `Colocar no filme <span class=\"fp-submit-count\">${totalQuantity} ${totalQuantity===1?'impressão':'impressões'}</span>` : 'Colocar no filme';","submit.innerHTML = busy ? 'Adicionando…' : rows.length ? `${kitMode?'Usar no kit':'Colocar no filme'} <span class=\"fp-submit-count\">${totalQuantity} ${totalQuantity===1?'impressão':'impressões'}</span>` : (kitMode?'Usar no kit':'Colocar no filme');"],
]);
patch('film-job-list.js',[
  ["const JOB_KIND_FILTER = 'settings_snapshot->>kind.is.null,settings_snapshot->>kind.neq.' + NAMED_DRAFT_KIND;","const JOB_KIND_FILTER = 'settings_snapshot->>kind.is.null,settings_snapshot->>kind.not.in.(' + NAMED_DRAFT_KIND + ',film_kit_v1)';"],
]);
let css=read('qr-screens.css');
css+=`
/* 2.17.88 · Kits de camisa */
html body .film-page .film-action-kit{background:linear-gradient(135deg,#ccfbf1,#d1fae5)!important;color:#134e4a!important;border-color:#5eead4!important}
.fk-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:16px;background:rgba(15,23,42,.6)}
.fk-modal{display:flex;flex-direction:column;width:min(780px,100%);max-height:calc(100dvh - 32px);overflow:hidden;border-radius:20px;background:#fff;color:#151515;box-shadow:0 24px 60px rgba(0,0,0,.35)}
.fk-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid #e5e7eb}
.fk-eyebrow{font-size:11px;font-weight:900;letter-spacing:.12em;color:#0f766e}
.fk-head h2{margin:2px 0;font-size:22px;font-weight:900;color:#151515}
.fk-head p{margin:0;font-size:14px;line-height:1.35;color:#3f4a45}
.fk-close{flex:none;display:grid;place-items:center;width:44px;height:44px;border:1px solid #d1d5db;border-radius:12px;background:#fff;color:#151515;font-size:22px;cursor:pointer}
.fk-body{flex:1;min-height:0;overflow-y:auto;padding:14px 18px 18px}
.fk-new{width:100%;min-height:52px;border:2px dashed #14b8a6;border-radius:14px;background:#f0fdfa;color:#115e59;font-size:16px;font-weight:900;cursor:pointer}
.fk-list,.fk-rows{display:grid;gap:10px;margin-top:12px}
.fk-card{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px 12px;padding:12px;border:1px solid #e5e7eb;border-radius:16px;background:#fff}
.fk-thumbs{display:grid;grid-template-columns:repeat(2,44px);grid-auto-rows:44px;gap:4px}
.fk-thumbs span,.fk-row-thumb{display:grid;place-items:center;overflow:hidden;border-radius:8px;background:#e5e7eb}
.fk-thumbs img,.fk-row-thumb img{width:100%;height:100%;object-fit:contain}
.fk-noimage{font-weight:900;color:#4b5563}
.fk-info{display:grid;gap:3px;align-content:center;min-width:0}
.fk-info b{font-size:16px;font-weight:900;color:#151515;overflow-wrap:anywhere}
.fk-info small{font-size:13px;line-height:1.3;color:#3f4a45;overflow-wrap:anywhere}
.fk-info .fk-warn{color:#b42318;font-weight:800}
.fk-controls{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.fk-qty{display:inline-flex;align-items:center;gap:4px}
.fk-step{width:44px;height:44px;border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc;color:#151515;font-size:22px;font-weight:900;cursor:pointer}
.fk-step:disabled{opacity:.4;cursor:not-allowed}
.fk-qty input,.fk-row-qty input{width:68px;height:44px;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:12px;background:#fff;color:#151515;font-size:17px;font-weight:900;text-align:center}
.fk-primary{flex:1 1 180px;min-height:48px;padding:8px 16px;border:0;border-radius:12px;background:#c2410c;color:#fff;font-size:16px;font-weight:900;cursor:pointer}
.fk-primary:disabled{background:#d1d5db;color:#374151;cursor:not-allowed}
.fk-links{grid-column:1/-1;display:flex;gap:16px}
.fk-link{min-height:40px;padding:4px 2px;border:0;background:none;color:#115e59;font-size:14px;font-weight:800;text-decoration:underline;cursor:pointer}
.fk-danger{color:#b42318}
.fk-empty{margin:14px 0 0;padding:14px;border-radius:12px;background:#f8fafc;color:#3f4a45;font-size:14px;text-align:center}
.fk-empty p{margin:4px 0 0}
.fk-field{display:grid;gap:6px;margin-bottom:12px;font-size:14px;font-weight:800;color:#151515}
.fk-field input{height:48px;box-sizing:border-box;padding:0 12px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;color:#151515;font-size:16px}
.fk-row{display:grid;grid-template-columns:56px minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:8px;border:1px solid #e5e7eb;border-radius:14px}
.fk-row-thumb{width:56px;height:56px}
.fk-row-qty{display:grid;gap:2px;font-size:12px;font-weight:800;color:#3f4a45;text-align:center}
.fk-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px}
.fk-footer .fk-primary{flex:0 1 220px}
.fk-rows+.fk-new{margin-top:12px}
.fk-status{display:none;padding:10px 18px;background:#ecfdf5;color:#065f46;font-size:14px;font-weight:800}
.fk-status.is-visible{display:block}
.fk-status[data-tone="err"]{background:#fef2f2;color:#991b1b}
.fk-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin-bottom:10px;padding:10px 12px;border:2px solid #5eead4;border-radius:14px;background:#f0fdfa;color:#134e4a}
.fk-bar-copy{flex:1 1 200px;display:grid;gap:2px;min-width:0}
.fk-bar-copy b{font-size:15px;font-weight:900;color:#134e4a;overflow-wrap:anywhere}
.fk-bar-copy small{font-size:12px;color:#235e58}
.fk-bar-unit{font-size:13px;font-weight:800;color:#134e4a}
@media(max-width:700px){.fk-backdrop{padding:0}.fk-modal{width:100%;height:100dvh;max-height:100dvh;border-radius:0}.fk-row{grid-template-columns:48px minmax(0,1fr) auto}.fk-row-thumb{width:48px;height:48px}.fk-row-qty{grid-column:2}.fk-row .fk-close{grid-column:3;grid-row:1}}
`;
write('qr-screens.css',css);
for(const name of fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n)))write(name,read(name).replace(/\b2\.17\.87\b/g,'2.17.88'));
if(!read('index.html').includes('content="2.17.88"'))throw new Error('v88: versão não foi renovada.');
for(const name of ['production-v217.js','film-picker.js','film-kits.js','film-job-list.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
console.log('019 2.17.88: kits de camisa no filme.');
