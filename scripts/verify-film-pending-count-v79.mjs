// 2.17.79: contador de Aguardando produção e tamanho digitado nas artes da empresa. Sem rede nem banco.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const dist=path.resolve(process.argv[2]||'dist');
const {filmPendingSummary,filmPendingBadge,filmPendingArrivals}=await import(pathToFileURL(path.join(dist,'film-pending-count.js')).href);
const {filmOrderRowKey,pendingQuantity}=await import(pathToFileURL(path.join(dist,'film-production.js')).href);
const rows={
  vdrRows:[{id:'v1'},{id:'v2'}],vendussRows:[{id:'n1',asset_id:'A9'}],fontRows:[{id:'f1'}],
  officialRows:[{placement:{id:'p1'},asset:{id:'A1'}},{placement:{id:'p2'},asset:{id:'A9'}}],
  orderRows:[{kind:'quote_item',quote_item_id:'q1',remaining_quantity:3,width_cm:10,height_cm:10},{kind:'legacy_review',quote_item_id:'q9',quantity:1}]
};
const base={...rows,pendingQuantity,rowKey:filmOrderRowKey};
let s=filmPendingSummary({...base,filmItems:[]});
// v1,v2,n1,f1,p1 (p2 é da Venduss e já conta pelo n1), q1 = 6 para adicionar; revisão antiga fora.
assert.equal(s.toAdd,6);assert.equal(s.inFilm,0);
s=filmPendingSummary({...base,filmItems:[{zero19WorkItemId:'v1'},{officialPlacementId:'p1'},{orderLink:{quoteItemId:'q1'},quantity:3}]});
assert.equal(s.toAdd,3,'v2, n1, f1');assert.equal(s.inFilm,3,'v1, p1 e q1 já no filme');
const parcial=filmPendingSummary({...base,filmItems:[{orderLink:{quoteItemId:'q1'},quantity:1}]});
assert.ok(parcial.waiting.has('generic:q1'),'pedido com saldo continua para adicionar');
// Arte nova chegando enquanto adiciona.
const before=s.keys,after=filmPendingSummary({...base,vdrRows:[...rows.vdrRows,{id:'v3'}],filmItems:[{zero19WorkItemId:'v1'},{officialPlacementId:'p1'},{orderLink:{quoteItemId:'q1'},quantity:3}]});
assert.deepEqual(filmPendingArrivals(before,after),['vdr:v3']);assert.deepEqual(filmPendingArrivals(null,after),[],'primeira leitura não avisa');
assert.match(filmPendingBadge(after),/4 para adicionar.*3 no filme/);assert.match(filmPendingBadge(null),/contando/);assert.match(filmPendingBadge(null,true),/toque para ver/,'leitura que falha não fica contando para sempre');
assert.match(filmPendingBadge({toAdd:0,inFilm:5}),/nada para adicionar.*5 no filme/);
const prod=fs.readFileSync(path.join(dist,'production-v217.js'),'utf8');
for(const mark of ['showPendingCount(pendingButton)','pendingPoll','data-show-new-pending','openUnifiedPendingPicker({keep:keepSelected})','ordersLoading=true'])assert.ok(prod.includes(mark),'filme com '+mark);
assert.ok(!prod.includes("'+totalPending+'</b>'"),'contador antigo (só número de linhas) saiu');
const picker=fs.readFileSync(path.join(dist,'film-picker.js'),'utf8');
for(const mark of ['useTypedSize(form, entry)','startSelection(entry)','Vale na hora para este filme'])assert.ok(picker.includes(mark),'seletor com '+mark);
console.log('019 2.17.79: contador da fila (para adicionar / no filme / chegou nova) e tamanho digitado conferidos.');
