import assert from 'node:assert/strict';
import {serviceReadiness} from '../service-readiness.js';
import {quotePreparationSummary,serializeServiceDraft} from '../quote-service-core.js';

// Pure synthetic fixtures: no customer data, network calls or status/payment writes.
function fixture(service='full_shirt'){
  const quote={id:'quote',owner_id:'owner',workspace_id:'company',project_id:'order',service_type:service,payment_status:'paid',delivery_date:'2026-10-10',official_mockup_asset_id:null};
  const line=(id,item_kind,unit_price,extra={})=>({id,quote_id:'quote',owner_id:'owner',product_name:id,item_kind,unit_price,quantity:2,metadata:{},...extra});
  const items=[line('print','art',10,{reference_asset_id:'art',final_asset_id:'art'})];
  if(service==='full_shirt')items.push(line('shirt','product',40,{product_id:'product'}));
  if(service!=='dtf_only')items.push(line('application','application',0));
  if(service==='refurbishment')items.push(line('removal','removal',0,{metadata:{removal_free:true}}));
  quote.items=items;
  const assets=[{id:'art',owner_id:'owner',workspace_id:'company',project_id:'older-order',asset_type:'arte',original_path:'art.png'}];
  const printProfiles=[{asset_id:'art',owner_id:'owner',default_width_cm:10,default_height_cm:20,ready_for_print:true}];
  return {quote,items,assets,printProfiles};
}
const results=[];
function check(name,test){test();results.push(name);}
for(const service of ['full_shirt','customer_shirt','refurbishment','dtf_only']){
  for(const missing of [null,undefined,''])check(`${service}: mockup ${String(missing)} does not block production`,()=>{
    const f=fixture(service);f.quote.official_mockup_asset_id=missing;
    const before=JSON.stringify(f);
    assert.deepEqual(serviceReadiness(f.quote,f),[]);
    assert.deepEqual(quotePreparationSummary(f.quote),[]);
    assert.equal(serializeServiceDraft(f.quote).p_quote.official_mockup_asset_id,null);
    assert.equal(JSON.stringify(f),before,'validation must not change quote, payment or quantities');
  });
  check(`${service}: missing final still blocks without mockup`,()=>{
    const f=fixture(service);f.items[0].final_asset_id=null;
    assert.match(serviceReadiness(f.quote,f).join(' '),/arte final/i);
    assert.ok(!serviceReadiness(f.quote,f).some(x=>/mockup/i.test(x)));
    assert.equal(quotePreparationSummary(f.quote).length,1);
  });
  check(`${service}: unready artwork remains blocked`,()=>{
    const f=fixture(service);f.printProfiles[0].ready_for_print=false;
    assert.match(serviceReadiness(f.quote,f).join(' '),/arte final/i);
  });
  check(`${service}: foreign-account final remains blocked`,()=>{
    const f=fixture(service);f.assets[0].owner_id='another-owner';
    assert.match(serviceReadiness(f.quote,f).join(' '),/arte final/i);
  });
}
for(const invalid of [0,-1,null,'',Infinity,NaN])check(`invalid final dimensions ${String(invalid)} remain blocked`,()=>{
  const f=fixture();f.printProfiles[0].default_width_cm=invalid;
  assert.match(serviceReadiness(f.quote,f).join(' '),/medidas/i);
});
check('explicitly linked mockup remains available and its integrity is checked',()=>{
  const f=fixture();f.quote.official_mockup_asset_id='mockup';
  f.assets.push({id:'mockup',owner_id:'owner',workspace_id:'company',project_id:'order',asset_type:'mockup',original_path:'mockup.png',metadata:{official_mockup:true,garment_scene:{layers:[{assetId:'art',side:'front',width:10,ratio:.5,x:20,y:20}]}}});
  assert.deepEqual(serviceReadiness(f.quote,f),[]);
  f.assets[1].project_id='other-order';
  assert.match(serviceReadiness(f.quote,f).join(' '),/mockup oficial/i);
  f.quote.official_mockup_asset_id=null;
  assert.deepEqual(serviceReadiness(f.quote,f),[],'unlinked mockup is not a release prerequisite');
});
check('invalid pricing still blocks production without a mockup',()=>{
  const f=fixture();f.items[0].unit_price=-1;
  assert.match(serviceReadiness(f.quote,f).join(' '),/preço/i);
});
check('draft remains saveable before final preparation',()=>{
  const f=fixture();f.items[0].final_asset_id=null;
  assert.deepEqual(serviceReadiness(f.quote,{...f,prepared:false}),[]);
});
console.log(JSON.stringify({optionalMockup:{passed:results.length,failed:0,cases:results}},null,2));
