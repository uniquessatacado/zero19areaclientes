import assert from 'node:assert/strict';
import {separateFilmPhrase,assertCompleteFilmPhrases,filmPhraseProblems} from '../film-phrase-parts.js';
import {removeFilmEntry} from '../film-edit-core.js';

// 20/10 (dono): exportar mesmo faltando palavra, dizendo QUAL frase e QUAL palavra falta.
let sequence=0;const id=()=>'p'+(++sequence);
const base={localId:'full',type:'team_customization',sourceId:'font',zero19WorkItemId:'application',externalOrderItemRef:'sale',officialProjectId:'project',compositionGroupId:'composition',name:'VAI BRASIL',number:'',nameHeightCm:4,nameTrackingCm:0,widthCm:30,heightCm:5,quantity:1,letteringRevision:'r1',fontSource:{id:'font-file',path:'private/font.ttf'},label:'Cliente · Pedido 10'};
const other={...base,localId:'other',zero19WorkItemId:'other-application',officialProjectId:'project-2',name:'CONFIRMA',label:'Outro · Pedido 11'};
const split=separateFilmPhrase([base,other],'full',{id});
const layout={placements:split.items.map(item=>({id:item.localId,copy:0}))};
assert.deepEqual(filmPhraseProblems(split.items,layout),[],'Filme completo: nenhum aviso');
assert.deepEqual(filmPhraseProblems([{localId:'a',type:'asset',quantity:1}]),[],'Arte comum nunca gera aviso');

const brasil=split.parts.find(part=>part.name==='BRASIL');
const removed=removeFilmEntry(split.items,layout,{id:brasil.localId,copy:0});
assert.throws(()=>assertCompleteFilmPhrases(removed.items,removed.layout),/faltam palavras/,'Tirar da fila continua exigindo a frase inteira');
const problems=filmPhraseProblems(removed.items,removed.layout);
assert.equal(problems.length,1,'Só a aplicação incompleta aparece');
assert.equal(problems[0].text,'VAI BRASIL');
assert.deepEqual(problems[0].missing,['BRASIL']);
assert.equal(problems[0].label,'Cliente · Pedido 10');
assert.match(problems[0].message,/faltam palavras/);
assert(problems[0].items.every(item=>item.officialProjectId==='project'),'Itens do pedido certo para desmarcar da fila');
console.log('Frase incompleta: exporta com aviso de qual frase/palavra falta; fila continua exigindo a frase inteira.');
