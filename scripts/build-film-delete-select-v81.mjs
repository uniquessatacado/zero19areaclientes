// 2.17.81 on top of the tested 2.17.80 build (20/10, dono: "permita exportar mesmo faltando frase…
// não avisa de qual frase é"; "delete numa arte selecionada remova do filme e não bugue";
// "selecionar uma arte no filme já mostre ela selecionada na lateral e leve até ela").
// - Exportar: frase/escrita incompleta vira AVISO (qual frase, qual palavra falta) e não bloqueia.
//   O pedido dessa escrita vem desmarcado de "Marcar como em produção" e continua aguardando
//   (tirar da fila continua exigindo a aplicação inteira, por pedido).
// - Rascunho não perde o encaixe quando falta uma palavra.
// - Delete/Backspace remove a arte selecionada mesmo sem foco nela; o filme fica no mesmo zoom,
//   rolagem e tela ampliada; clique sem arrastar não trava o filme validando posição.
// - Arte selecionada no filme fica destacada na lista "Artes adicionadas", que rola até ela.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.80"'))throw new Error('v81 exige a base 2.17.80.');
function patch(name,pairs){
  let source=read(name);
  for(const [before,after,times=1] of pairs){const count=source.split(before).length-1;if(count!==times)throw new Error('v81 '+name+': trecho alterado ou ausente ('+count+'/'+times+'): '+before.slice(0,120));source=source.split(before).join(after);}
  write(name,source);
}
if(!read('film-phrase-parts.js').includes('export function filmPhraseProblems('))throw new Error('v81: filmPhraseProblems ausente no film-phrase-parts.js.');

patch('production-v217.js',[
  ["filmPhraseNominalHeight,assertCompleteFilmPhrases,letteringApplicationPart} from './film-phrase-parts.js?v=2.17.80'","filmPhraseNominalHeight,assertCompleteFilmPhrases,filmPhraseProblems,letteringApplicationPart} from './film-phrase-parts.js?v=2.17.80'"],
  ["    assertCompleteFilmPhrases(items,layout);\n    await verifyFilmLetteringRevisions({supabase,ownerId:startingAccount,","    const phraseProblems=filmPhraseProblems(items,layout);\n    await verifyFilmLetteringRevisions({supabase,ownerId:startingAccount,"],
  ["        assertCompleteFilmPhrases(items,layout);\n        await verifyFilmLetteringRevisions({supabase,ownerId:exportAccount,items,isCurrent:currentExport});","        await verifyFilmLetteringRevisions({supabase,ownerId:exportAccount,items,isCurrent:currentExport});",2],
  ["    assertCompleteFilmPhrases(items,layout);\n    return {items,layout};","    return {items,layout};"],
  ["const productionGroups=ctx.officialOrders?.exportGroups?.(items)||[],selectedProductionGroups=new Set(productionGroups.map(group=>group.key));",
   "const productionGroups=ctx.officialOrders?.exportGroups?.(items)||[],phraseBlockedGroups=new Set((phraseProblems.length?ctx.officialOrders?.exportGroups?.(phraseProblems.flatMap(problem=>problem.items))||[]:[]).map(group=>group.key)),selectedProductionGroups=new Set(productionGroups.map(group=>group.key).filter(key=>!phraseBlockedGroups.has(key)));\n"+
   "    if(phraseProblems.length){const warn=document.createElement('div');warn.className='film-phrase-warning';warn.setAttribute('role','alert');warn.style.cssText='margin:12px 0;padding:12px 14px;border:3px solid #f59e0b;border-radius:14px;background:#fffbeb;color:#78350f;line-height:1.5;font-size:14px';warn.innerHTML='<b>⚠ Falta parte da escrita neste filme · pode gerar o arquivo mesmo assim</b><ul style=\"margin:6px 0;padding-left:20px;overflow-wrap:anywhere\">'+phraseProblems.map(problem=>'<li><b>“'+h(problem.text)+'”</b>'+(problem.label&&problem.label!==problem.text?' · '+h(problem.label):'')+' — '+(problem.missing.length?'falta: <b>'+h(problem.missing.join(', '))+'</b>':h(problem.message))+'</li>').join('')+'</ul><small style=\"display:block;color:inherit\">Esse pedido NÃO sai de Aguardando produção com este arquivo, porque a escrita não está inteira. Imprima o que falta em outro filme ou use \"Já está pronta\" na fila.</small>';modal.querySelector('.modal-head').after(warn);}"],
  ["'<label><input type=\"checkbox\" data-production-group=\"'+h(group.key)+'\" checked><span>'+h(group.companyName)+' · '+(group.projectId?'Pedido '+h(group.orderRef||group.projectId.slice(0,8)):h(group.groupName||'Grupo manual'))+'</span></label>'",
   "'<label><input type=\"checkbox\" data-production-group=\"'+h(group.key)+'\"'+(phraseBlockedGroups.has(group.key)?' disabled':' checked')+'><span>'+h(group.companyName)+' · '+(group.projectId?'Pedido '+h(group.orderRef||group.projectId.slice(0,8)):h(group.groupName||'Grupo manual'))+(phraseBlockedGroups.has(group.key)?' <b style=\"color:#b45309\">· falta parte da escrita, continua aguardando</b>':'')+'</span></label>'"],
  ["box.querySelectorAll('[data-production-group]').forEach(input=>input.onchange=()=>input.checked?selectedProductionGroups.add(input.dataset.productionGroup):selectedProductionGroups.delete(input.dataset.productionGroup));",
   "box.querySelectorAll('[data-production-group]').forEach(input=>input.onchange=()=>{if(phraseBlockedGroups.has(input.dataset.productionGroup)){input.checked=false;return;}input.checked?selectedProductionGroups.add(input.dataset.productionGroup):selectedProductionGroups.delete(input.dataset.productionGroup);});"],
  ["Uma só aplicação: exportação exige todas as palavras e cópias. Tamanho ajusta a altura do conjunto inteiro.","Uma só aplicação: se faltar palavra, o filme exporta, mas o pedido continua em Aguardando produção. Tamanho ajusta a altura do conjunto inteiro."],
]);

patch('official-order-workflow.js',[
  ["    assertCompleteFilmPhrases(items,layout);\n    const selected=new Set(selectedGroupKeys||[]),groups=exportGroups(items).filter(group=>selected.has(group.key)),result={projects:0,placements:0,done:[],failed:[]};if(!groups.length)return result;\n    for(const group of groups){\n      try{const data=await markProductionGroup(items,group);",
   "    const selected=new Set(selectedGroupKeys||[]),groups=exportGroups(items).filter(group=>selected.has(group.key)),result={projects:0,placements:0,done:[],failed:[]};if(!groups.length)return result;\n    for(const group of groups){\n      try{assertCompleteFilmPhrases(items.filter(item=>exportGroups([item]).some(entry=>entry.key===group.key)),layout);const data=await markProductionGroup(items,group);"],
]);

patch('film-preview.js',[
  [" element._filmViewport?.destroy?.();\n"," element._filmViewport?.destroy?.();const keep=element._filmKeepView;delete element._filmKeepView;\n"],
  ["setBusy(true);try{await onDelete({...p});if(active()){selected=null;message('Peça removida. Demais posições preservadas.');}}catch(e){if(active())message(e.message,true);}finally{if(active())setBusy(false);}}",
   "setBusy(true);element._filmKeepView={zoom,overview,expanded,top:shell.scrollTop,left:shell.scrollLeft,background:sheet.dataset.background};try{await onDelete({...p});if(active()){selected=null;message('Peça removida. Demais posições preservadas.');}}catch(e){if(active())message(e.message,true);}finally{delete element._filmKeepView;if(active())setBusy(false);}}"],
  ["function select(k){selected=k;for(const [id,n] of nodeMap){n.classList.toggle('selected',id===k);n.setAttribute('aria-pressed',String(id===k));}selection();}",
   "function select(k){selected=k;for(const [id,n] of nodeMap){n.classList.toggle('selected',id===k);n.setAttribute('aria-pressed',String(id===k));}selection();markList(true);}\n"+
   " function markList(scroll){const list=doc.querySelector('#filmItems');if(!list)return;const p=placement(),control=p?[...list.querySelectorAll('[data-id]')].find(n=>n.dataset.id===p.id):null,card=control?.closest('article')||null;list.querySelectorAll('.film-item-picked').forEach(n=>{if(n!==card)n.classList.remove('film-item-picked');});if(!card)return;card.classList.add('film-item-picked');if(!scroll||list.scrollHeight<=list.clientHeight+1)return;const box=list.getBoundingClientRect(),r=card.getBoundingClientRect();if(r.top<box.top||r.bottom>box.bottom)list.scrollTo({top:Math.max(0,list.scrollTop+r.top-box.top-Math.max(8,(list.clientHeight-r.height)/2)),behavior:'smooth'});}"],
  ["node.onpointerup=e=>{if(!drag||drag.id!==e.pointerId)return;const d=drag;drag=null;void move(","node.onpointerup=e=>{if(!drag||drag.id!==e.pointerId)return;const d=drag;drag=null;if(Math.abs(e.clientX-d.x)<3&&Math.abs(e.clientY-d.y)<3){render();return;}void move("],
  [" const keyboard=e=>{if(!expanded)return;"," const keyboard=e=>{if((e.key==='Delete'||e.key==='Backspace')&&!e.defaultPrevented&&!e.repeat&&active()&&placement()&&!e.target?.closest?.('input,textarea,select,[contenteditable]')&&!doc.querySelector('.modal-backdrop:not([hidden])')){e.preventDefault();void removeSelected();return;}if(!expanded)return;"],
  [" const api={destroy,getLayout:()=>layout,deleteSelected:removeSelected};element._filmViewport=api;render();return api;",
   " if(!doc.getElementById('film-picked-style')){const style=doc.createElement('style');style.id='film-picked-style';style.textContent='body .film-page .film-items-panel .film-item.film-item-picked{border-color:#ff6428!important;box-shadow:0 0 0 3px rgba(255,100,40,.35)!important;background:#fff7ed!important}';doc.head.append(style);}\n"+
   " const api={destroy,getLayout:()=>layout,deleteSelected:removeSelected};element._filmViewport=api;render();\n"+
   " if(keep){if(keep.expanded)full(true);zoom=keep.zoom;overview=keep.overview;get('[data-zoom]').value=String(Math.round(zoom*100));sheet.dataset.background=keep.background||'check';get('[data-background]').value=sheet.dataset.background;render();shell.scrollTop=keep.top;shell.scrollLeft=keep.left;message('Arte removida do filme. As outras ficaram no lugar; use Otimizar espaços para fechar o vazio.');}\n"+
   " markList(false);return api;"],
]);

for(const name of fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n)))write(name,read(name).replace(/\b2\.17\.80\b/g,'2.17.81'));
if(!read('production-v217.js').includes("film-phrase-parts.js?v=2.17.81")||!read('production-v217.js').includes("film-preview.js?v=2.17.81")||!read('official-order-workflow.js').includes("film-phrase-parts.js?v=2.17.81"))throw new Error('v81: cache dos módulos alterados não foi renovado.');
for(const name of ['production-v217.js','official-order-workflow.js','film-preview.js','film-phrase-parts.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/test-film-phrase-problems.mjs'],{cwd:root,stdio:'inherit'});
console.log('019 2.17.81: exporta com frase incompleta (avisa qual), Delete remove a arte selecionada, lista lateral acompanha a seleção.');
