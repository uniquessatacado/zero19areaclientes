import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {pendingQuantity} from '../film-production.js';

// Execute the real, narrowly scoped renderer with a minimal DOM double. This
// intentionally fails if a legacy row reaches quantity/accounting logic.
const source=readFileSync(new URL('../production-v217.js',import.meta.url),'utf8');
const start=source.indexOf('const drawOrders=()=>{');
const end=source.indexOf('const refreshOrders=async()=>',start);
assert.ok(start>=0&&end>start,'drawOrders source boundaries exist');
const renderer=source.slice(start,end)+'\ndrawOrders();';
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

class Slot{
  html='';nodes=[];
  set innerHTML(value){
    this.html=value;
    this.nodes=[...value.matchAll(/<(?:button|input)\b[^>]*>/g)].map(([tag])=>{
      const dataset={};
      for(const match of tag.matchAll(/\bdata-([\w-]+)(?:="([^"]*)")?/g))dataset[match[1].replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=match[2]||'';
      return {dataset,value:tag.match(/\bvalue="([^"]*)"/)?.[1]??''};
    });
  }
  get innerHTML(){return this.html;}
  querySelectorAll(selector){
    const attribute=selector.match(/^\[data-([\w-]+)\]$/)?.[1];
    assert.ok(attribute,`supported selector ${selector}`);
    const key=attribute.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
    return this.nodes.filter(node=>Object.hasOwn(node.dataset,key));
  }
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
function render(orderRows,filmItems=[]){
  const slot=new Slot(),calls={quantities:[],navigate:[],added:[],errors:[],refresh:0,refreshItems:0};
  let current=true;
  runInNewContext(renderer,{
    orderRows,filmItems,ordersSlot:slot,pageCurrent:()=>current,h:escapeHTML,dateLabel:value=>value||'Sem prazo',
    pendingQuantity:(row,items)=>{assert.notEqual(row.kind,'legacy_review','legacy rows cannot reach quantity calculation');calls.quantities.push(row.quote_item_id);return pendingQuantity(row,items);},
    filmItemFromOrder:(row,quantity)=>{assert.notEqual(row.kind,'legacy_review');calls.added.push(row.quote_item_id);return {localId:'new-item',orderLink:{quoteItemId:row.quote_item_id},quantity};},
    refreshOrders:()=>calls.refresh++,refreshItems:()=>calls.refreshItems++,
    ctx:{nav:route=>calls.navigate.push(route),toast:message=>calls.errors.push(message)},
  });
  return {slot,calls,filmItems,setCurrent:value=>current=value};
}
const legacy={kind:'legacy_review',workspace_id:'workspace-a',project_id:'old-project',quote_id:'old-quote',company_name:'Cliente antigo',project_title:'Pedido anterior',delivery_date:'2026-10-10'};
const linked={workspace_id:'workspace-b',project_id:'project-b',quote_id:'quote-b',quote_item_id:'art-b',remaining_quantity:5,width_cm:10,height_cm:20,company_name:'Cliente atual',asset_name:'Arte final',delivery_date:'2026-10-11'};
let checks=0;
function test(name,fn){fn();checks++;console.log(`PASS ${name}`);}

test('legacy-only section is collapsed, explicit and never counted or addable',()=>{
  const rows=[{...legacy}],before=JSON.stringify(rows),f=render(rows);
  assert.match(f.slot.innerHTML,/<details class="film-legacy-review">/);
  assert.doesNotMatch(f.slot.innerHTML,/<details[^>]*\bopen\b/);
  assert.match(f.slot.innerHTML,/Pedidos antigos para conferir \(1\)/);
  assert.match(f.slot.innerHTML,/Não há vínculo automático nem quantidade presumida/);
  assert.match(f.slot.innerHTML,/não altera os valores do orçamento/);
  assert.match(f.slot.innerHTML,/Nenhum saldo vinculado fora desta montagem/);
  assert.equal(f.slot.querySelectorAll('[data-order-qty]').length,0);
  assert.equal(f.slot.querySelectorAll('[data-add-order]').length,0);
  assert.deepEqual(f.calls.quantities,[]);
  assert.equal(JSON.stringify(rows),before);
});
test('review button opens the existing workspace route without mutation',()=>{
  const f=render([{...legacy,workspace_id:'workspace/a'}]);
  f.slot.querySelector('[data-review-legacy-order]').onclick();
  assert.deepEqual(f.calls.navigate,['/ambiente/workspace%2Fa']);
  assert.deepEqual(f.filmItems,[]);assert.deepEqual(f.calls.added,[]);assert.equal(f.calls.refreshItems,0);
});
test('stale-page controls cannot navigate or add items',()=>{
  const f=render([legacy,linked]);f.setCurrent(false);
  f.slot.querySelector('[data-review-legacy-order]').onclick();
  f.slot.querySelector('[data-add-order]').onclick();
  assert.deepEqual(f.calls.navigate,[]);assert.deepEqual(f.filmItems,[]);
});
test('mixed orders count and reserve only real linked quantities',()=>{
  const f=render([legacy,linked],[{localId:'existing',orderLink:{quoteItemId:'art-b'},quantity:2}]);
  assert.match(f.slot.innerHTML,/3 estampa\(s\) liberada\(s\) para montar/);
  assert.equal(f.slot.querySelectorAll('[data-add-order]').length,1);
  assert.equal(f.slot.querySelector('[data-order-qty]').value,'3');
  assert.equal(f.slot.querySelectorAll('[data-review-legacy-order]').length,1);
  f.slot.querySelector('[data-add-order]').onclick();
  assert.deepEqual(f.calls.added,['art-b']);assert.equal(f.filmItems[1].quantity,3);
  assert.equal(f.slot.querySelectorAll('[data-add-order]').length,0);
  assert.equal(f.slot.querySelectorAll('[data-review-legacy-order]').length,1);
});
test('out-of-range draft quantity remains blocked for linked orders',()=>{
  const f=render([legacy,linked]);f.slot.querySelector('[data-order-qty]').value='6';
  f.slot.querySelector('[data-add-order]').onclick();
  assert.equal(f.calls.errors.length,1);assert.deepEqual(f.filmItems,[]);
});
test('legacy labels and attribute values are HTML escaped',()=>{
  const f=render([{...legacy,company_name:'<img src=x onerror=alert(1)>',project_title:'"<script>bad</script>',workspace_id:'" onclick="bad'}]);
  assert.doesNotMatch(f.slot.innerHTML,/<img|<script|data-review-legacy-order="" onclick=/);
  assert.match(f.slot.innerHTML,/&lt;img/);assert.match(f.slot.innerHTML,/&lt;script&gt;/);
});
test('normal linked-only and empty responses do not show legacy section',()=>{
  for(const rows of [[],[linked]])assert.doesNotMatch(render(rows).slot.innerHTML,/film-legacy-review/);
  const f=render([]);f.slot.querySelector('[data-refresh-orders]').onclick();assert.equal(f.calls.refresh,1);
});
test('legacy records missing optional display fields still render safely',()=>{
  const f=render([{kind:'legacy_review'}]);
  assert.match(f.slot.innerHTML,/Cliente/);assert.match(f.slot.innerHTML,/Pedido anterior/);assert.match(f.slot.innerHTML,/Sem prazo/);
  f.slot.querySelector('[data-review-legacy-order]').onclick();assert.deepEqual(f.calls.navigate,[]);
});
console.log(`${checks} film legacy review regressions passed.`);
