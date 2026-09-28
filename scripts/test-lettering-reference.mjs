import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {officialNameReference} from '../lettering-layout-v2176.js';
const set='3dd7b508-a3d0-4752-84dd-82ac24622c48';
assert.equal(officialNameReference({sourceId:set}),'O');
assert.equal(officialNameReference({fontSource:{id:'488c3140-fc74-4124-832a-fdb62e127c26'}}),'O');
assert.equal(officialNameReference({sourceId:'3180009d-1149-4a4c-9456-1df22d5317ba'}),null);
assert.equal(officialNameReference({label:'Palmeiras azul',name:'JOÃO'}),null,'never infer calibration from name/label');
const source=await fs.readFile(new URL('./film-v2176-functions.txt',import.meta.url),'utf8');
const upgrade=source.slice(source.indexOf('  async function upgradeCurrentLettering('),source.indexOf('  function mountFilmTools('));
const items=[{localId:'name',type:'team_customization',sourceId:set,name:'JOÃO',nameHeightCm:5.5,numberHeightCm:28,widthCm:12,heightCm:5.5,letteringMetricsVersion:3,previewDataUrl:'old'},
 {localId:'digit',type:'team_customization',sourceId:set,name:'',number:'8',widthCm:15,heightCm:28,letteringMetricsVersion:3},
 {localId:'other',type:'team_customization',sourceId:'other',name:'GABRIEL',widthCm:25,heightCm:5.5,letteringMetricsVersion:3}];
let cleared=0;
const run=new Function('filmItems','officialNameReference','prepareLetteringLayout','filmMaskCache','let productionAccountGeneration=1;'+upgrade+';return upgradeCurrentLettering;')(items,officialNameReference,async item=>({widthCm:item.widthCm,heightCm:item.nameReferenceChar?9.66:item.heightCm}),{clear(){cleared++}});
assert.deepEqual([...await run()],['name']);assert.equal(items[0].nameReferenceChar,'O');assert.equal(items[0].nameHeightCm,5.5);assert.equal(items[0].previewDataUrl,undefined);assert.equal(cleared,1);
assert.equal(items[1].nameReferenceChar,undefined);assert.equal(items[2].nameReferenceChar,undefined);
assert.equal((await run()).size,0,'recalculation idempotent');
console.log('Letter reference: explicit source scope, old draft upgrade, stale preview/mask invalidation, unchanged number/other font passed.');
