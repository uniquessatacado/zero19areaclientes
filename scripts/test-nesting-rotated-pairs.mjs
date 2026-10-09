import assert from 'node:assert/strict';
import {nestItems} from '../nesting-core.js';
// Caso real 09/10: filme 58 cm, arte 29,63 × 28 cm, distância 5 mm. Em pé + deitada
// não cabem lado a lado; as duas deitadas (28 + 28 cm) cabem e economizam ~40%.
const items=Array.from({length:6},(_,i)=>({id:'a'+i,label:'22',widthMm:296.3,heightMm:280,quantity:1,rotationPolicy:'free',allowInternalNesting:true}));
const result=nestItems(items,{filmWidthMm:580,mode:'maximum',gapMm:5,cellMm:1});
assert.ok(result.lengthMm<=920,'6 artes devem ocupar 3 linhas de duas (atual '+result.lengthMm+' mm)');
assert.equal(result.placements.filter(p=>p.xMm>250).length,3,'metade das artes vai para a lateral do filme');
const many=nestItems(Array.from({length:30},(_,i)=>({id:'b'+i,label:'22',widthMm:296.3,heightMm:280,quantity:1,rotationPolicy:'free'})),{filmWidthMm:580,mode:'maximum',gapMm:3,cellMm:1});
assert.ok(many.lengthMm<=15*300+10,'30 artes continuam duas por linha (atual '+many.lengthMm+' mm)');
console.log('PASS encaixe: artes giradas lado a lado aproveitam a lateral do filme ('+result.lengthMm/10+' cm para 6 artes).');
