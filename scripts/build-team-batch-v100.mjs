// 2.17.100 on top of 2.17.99 (14/11, dono: "Fontes de time: melhore o layout do modal Personalização oficial · adicionar nomes e números,
// está muito confuso; o do estúdio está top, tem que ser assim, dinâmico, fácil e visual; o nome e número adicionado à lista já deve
// mostrar na fonte oficial, a miniatura oficial, a cor, o número, o vetor; tem texto escuro com fundo escuro"; "nunca deixe rolar o mouse
// mudar número"; "marque as estampas que não são halftone; alerte o botão do halftone"). Mesma lógica de produção (makeFilmLetteringPiece, as mesmas peças e medidas): só a janela muda.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.99"'))throw new Error('v100 exige a base 2.17.99.');
for(const name of ['film-team-batch.css','no-wheel-number.js'])if(!fs.existsSync(path.join(dist,name)))throw new Error('v100: '+name+' não foi copiado.');
let src=read('production-v217.js');
const once=(before,after)=>{const count=src.split(before).length-1;if(count!==1)throw new Error('v100: trecho ('+count+'×): '+before.slice(0,90));src=src.replace(before,after);};
// 1) A janela nova (mesmos campos e ganchos: team, season, kit, set, name, number, composition, medidas, data-*).
const start=src.indexOf('modal.innerHTML=`<div class="modal customization-composer-modal team-batch-composer"');
const end=src.indexOf("const q=name=>modal.querySelector(`[name=\"${name}\"]`)",start);
if(start<0||end<0)throw new Error('v100: janela de nomes e números não encontrada.');
const field=(name,label,extra='')=>`<label class="tb-field">${label}<input name="${name}" inputmode="decimal"${extra}></label>`;
const template='modal.innerHTML=`<div class="modal tb-modal" role="dialog" aria-modal="true" aria-labelledby="teamBatchTitle">'
 +'<header class="tb-head"><div><p>FONTES DE TIME · NOME E NÚMERO</p><h2 id="teamBatchTitle">Adicionar nomes e números</h2><small>Escolha a camisa, digite e veja na fonte oficial. Monte a lista e mande tudo para o filme.</small></div><button type="button" class="tb-x" data-close aria-label="Fechar">✕</button></header>'
 +'<form><div class="tb-body">'
 +'<section class="tb-card"><h3>1 · Camisa e fonte</h3><div class="tb-kit"><label class="tb-field">Time<select name="team"></select></label><label class="tb-field">Ano<select name="season"></select></label><label class="tb-field">Camisa<select name="kit"></select></label><label class="tb-field">Fonte<select name="set"></select></label></div></section>'
 +'<section class="tb-card"><h3>2 · Nome e número</h3><div class="tb-entry"><div class="tb-inputs">'
 +'<div class="tb-pair"><label class="tb-field tb-big">Nome <small>(opcional)</small><input name="name" maxlength="40" autocomplete="off" placeholder="CLOVIS"></label><label class="tb-field tb-big">Número <small>(opcional)</small><input name="number" maxlength="6" inputmode="numeric" autocomplete="off" placeholder="10"></label></div>'
 +'<div class="tb-mode"><label><input type="radio" name="composition" value="split" checked><span><b>Mesclar encaixe</b><small>Nome inteiro e cada algarismo separado (economiza filme).</small></span></label><label><input type="radio" name="composition" value="unified"><span><b>Unificar tudo</b><small>Nome em cima e número embaixo numa peça só.</small></span></label></div>'
 +'<button type="button" class="tb-add" data-add-row>＋ Adicionar à lista</button><p data-entry-error class="tb-error" role="alert"></p><p data-default-summary class="tb-hint"></p>'
 +'<details data-advanced><summary>Medidas deste lote</summary><div class="tb-adv">'+field('nameHeightCm','Altura do nome (cm)')+field('numberHeightCm','Altura do número (cm)')+field('nameTrackingCm','Espaço entre letras (cm)')+field('digitSpacingCm','Espaço entre números (cm) <small>unificado</small>')+field('gapCm','Nome ↕ número (cm) <small>unificado</small>')+'</div><p class="tb-hint">Valem só para as próximas linhas desta janela. O padrão da fonte não muda.</p></details>'
 +'</div><div class="tb-preview" data-live-preview><div class="tb-preview-bg"><button type="button" data-bg="dark">Fundo escuro</button><button type="button" data-bg="light">Fundo claro</button></div><div class="tb-preview-empty">Digite um nome ou número para ver na fonte oficial</div></div></div></section>'
 +'<section class="tb-card"><div class="tb-list-head"><h3 style="margin:0">3 · Lista</h3><span data-row-count class="tb-count">0</span></div><div data-batch-rows class="tb-rows"></div></section>'
 +'<p data-batch-error class="tb-error" role="alert"></p></div>'
 +'<div class="tb-foot"><span class="tb-total" data-total>Nenhum na lista</span>${allowLegacy?\'<button type="button" data-legacy>All Sponsor / arte especial</button>\':\'\'}<button type="button" data-close>Cancelar</button><button type="submit" disabled>Adicionar tudo ao filme</button></div>'
 +'</form></div>`;\n      ';
src=src.slice(0,start)+template+src.slice(end);
// 2) Lista com a miniatura oficial e prévia ao vivo.
const renderStart=src.indexOf('const renderRows=()=>{modal.querySelector(\'[data-row-count]\')',start);
const renderEnd=src.indexOf('const stageCurrent=()=>',renderStart);
if(renderStart<0||renderEnd<0)throw new Error('v100: lista não encontrada.');
const newRender="const renderRows=()=>{modal.querySelector('[data-row-count]').textContent=String(rows.length);const total=modal.querySelector('[data-total]');if(total)total.textContent=rows.length?`${rows.length} ${rows.length===1?'personalização':'personalizações'} na lista`:'Nenhum na lista';submit.disabled=!rows.length||busy;rowsHost.innerHTML=rows.length?rows.map(row=>`<article class=\"tb-row\"><div class=\"tb-row-img\">${row.preview?`<img src=\"${h(row.preview)}\" alt=\"\">`:row.previewError?'<span>Sem prévia</span>':'<span>Preparando…</span>'}</div><div class=\"tb-row-info\"><div><b>${h([row.name,row.number].filter(Boolean).join(' · '))}</b><small>${h(row.setPath)} · ${row.mode==='split'?'Mesclar encaixe':'Unificar tudo'}</small></div><button type=\"button\" class=\"tb-remove\" data-remove-row=\"${h(row.id)}\">✕ Tirar</button></div></article>`).join(''):'<div class=\"tb-empty\">Digite um nome, um número ou os dois e toque em Adicionar à lista (ou Enter).</div>';rowsHost.querySelectorAll('[data-remove-row]').forEach(button=>button.onclick=()=>{rows=rows.filter(row=>row.id!==button.dataset.removeRow);renderRows()});};\n"
 +"      const live=modal.querySelector('[data-live-preview]');let liveSeq=0,liveTimer=0;\n"
 +"      const showLive=(url,caption)=>{live.querySelectorAll('img,.tb-preview-empty,.tb-preview-caption').forEach(node=>node.remove());if(url){const img=document.createElement('img');img.src=url;img.alt='Prévia na fonte oficial';live.appendChild(img);if(caption){const cap=document.createElement('span');cap.className='tb-preview-caption';cap.textContent=caption;live.appendChild(cap);}}else{const empty=document.createElement('div');empty.className='tb-preview-empty';empty.textContent=caption||'Digite um nome ou número para ver na fonte oficial';live.appendChild(empty);}};\n"
 +"      const updateLive=()=>{clearTimeout(liveTimer);liveTimer=setTimeout(async()=>{const id=++liveSeq,set=selectedSet(),name=q('name').value.trim().toUpperCase(),number=q('number').value.trim();if(!set||(!name&&!number)){showLive('');return;}if(number&&!/^\\d{1,6}$/.test(number)){showLive('','Use só algarismos no número.');return;}try{const settings=readSettings(),mode=modal.querySelector('[name=\"composition\"]:checked')?.value||'split';const piece=await makeFilmLetteringPiece(set,{name,number,settings,compositionMode:'unified',pieceType:'unified',previewTargetPx:520});if(id!==liveSeq||closed)return;showLive(piece.previewDataUrl,`${fmt(piece.widthCm)} × ${fmt(piece.heightCm)} cm${mode==='split'&&name&&number?' · no filme: nome e algarismos separados':''}`);}catch(error){if(id===liveSeq&&!closed)showLive('',error.message||'Não foi possível mostrar a prévia.');}},280);};\n      ";
src=src.slice(0,renderStart)+newRender+src.slice(renderEnd);
// 3) Ao adicionar: miniatura oficial na lista.
once("rows.push({id:crypto.randomUUID(),setId:set.id,setUpdatedAt:set.updated_at||null,setPath:set._path||customizationName(set),name,number,mode,settings});q('name').value='';q('number').value='';q('name').focus();renderRows();return true;};",
 "const row={id:crypto.randomUUID(),setId:set.id,setUpdatedAt:set.updated_at||null,setPath:set._path||customizationName(set),name,number,mode,settings};rows.push(row);q('name').value='';q('number').value='';q('name').focus();renderRows();updateLive();makeFilmLetteringPiece(set,{name,number,settings,compositionMode:'unified',pieceType:'unified',previewTargetPx:360}).then(piece=>{row.preview=piece.previewDataUrl;if(!closed)renderRows();}).catch(()=>{row.previewError=true;if(!closed)renderRows();});return true;};");
// 4) Prévia ao digitar, Enter adiciona, fundo claro/escuro.
once("q('team').onchange=fillSeason;q('season').onchange=fillKit;q('kit').onchange=fillSet;q('set').onchange=applyDefaults;",
 "q('team').onchange=()=>{fillSeason();updateLive()};q('season').onchange=()=>{fillKit();updateLive()};q('kit').onchange=()=>{fillSet();updateLive()};q('set').onchange=()=>{applyDefaults();updateLive()};"
 +"for(const key of ['name','number','nameHeightCm','numberHeightCm','nameTrackingCm','digitSpacingCm','gapCm'])q(key).addEventListener('input',updateLive);modal.querySelectorAll('[name=\"composition\"]').forEach(input=>input.addEventListener('change',updateLive));"
 +"for(const key of ['name','number'])q(key).addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();try{stageCurrent()}catch(error){entryError.textContent=error.message||String(error)}}});"
 +"modal.querySelectorAll('[data-bg]').forEach(button=>button.onclick=()=>live.classList.toggle('light',button.dataset.bg==='light'));");
// 5) Estampas do site: alerta no botão quando há pedido esperando e a estampa ainda está sem halftone.
once("import {openSitePrints} from './film-site-prints.js?v=2.17.99';","import {openSitePrints,watchSitePrintsAlert} from './film-site-prints.js?v=2.17.99';");
once("app.querySelector('#openSitePrints')?.addEventListener('click',()=>openSitePrints({supabase,toast:(m,k)=>ctx.toast(m,k),owner:()=>String(owner()||'')}));",
 "app.querySelector('#openSitePrints')?.addEventListener('click',()=>openSitePrints({supabase,toast:(m,k)=>ctx.toast(m,k),owner:()=>String(owner()||'')}));watchSitePrintsAlert(supabase);");
// 6) Trava global: número nunca muda rolando o mouse.
once("import {installFilmToolbar} from './film-toolbar.js?v=2.17.99';","import {installFilmToolbar} from './film-toolbar.js?v=2.17.99';\nimport './no-wheel-number.js?v=2.17.99';");
write('production-v217.js',src);
let index=read('index.html');
if(!index.includes('<link rel="stylesheet" href="/film-picker-mobile.css?v=2.17.99">'))throw new Error('v100: link do film-picker-mobile.css não encontrado.');
index=index.replace('<link rel="stylesheet" href="/film-picker-mobile.css?v=2.17.99">','<link rel="stylesheet" href="/film-picker-mobile.css?v=2.17.99">\n  <link rel="stylesheet" href="/film-team-batch.css?v=2.17.99">');write('index.html',index);
const files=fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n));
(function walk(dir){for(const e of fs.readdirSync(path.join(dist,dir),{withFileTypes:true})){const rel=path.join(dir,e.name);if(e.isDirectory())walk(rel);else if(/\.(js|css)$/.test(e.name))files.push(rel);}})('vetor');
for(const name of files)write(name,read(name).replace(/\b2\.17\.99\b/g,'2.17.100'));
if(!read('index.html').includes('content="2.17.100"'))throw new Error('v100: versão não foi renovada.');
for(const name of ['production-v217.js','no-wheel-number.js','film-site-prints.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
console.log('019 2.17.100: Fontes de time (nomes e números) com prévia oficial ao vivo e lista com miniaturas; número nunca muda rolando o mouse.');
