import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {quoteGarmentScene,prepareQuoteGarmentMockup} from '../garment-official.js';

const owner='owner',workspace='workspace',project='project';
const quote={title:'Pedido atual',workspace_id:workspace,project_id:project,official_mockup_asset_id:null,items:[{id:'line-a',item_kind:'art',final_asset_id:'a',metadata:{placement:'Frente'}},{id:'line-b',item_kind:'art',final_asset_id:'b',metadata:{placement:'Costas'}}]};
const assets=['a','b'].map(id=>({id,owner_id:owner,workspace_id:workspace,project_id:project,asset_type:'arte',name:'Arte '+id,original_path:id+'-original.png',processed_path:id+'-atual.png',metadata:{garment_scene:{title:'Montagem de outro pedido',color:'red',layers:[{assetId:'invasor',path:'invasor.png',side:'left',width:2,ratio:1,x:3,y:4}]}}}));
const profiles=[{asset_id:'a',owner_id:owner,default_width_cm:20,default_height_cm:10,halftone:false},{asset_id:'b',owner_id:owner,default_width_cm:28,default_height_cm:35,halftone:true}];
const untouched=JSON.stringify({quote,assets,profiles}),fresh=quoteGarmentScene(quote,assets,profiles,owner);
assert.deepEqual(fresh.layers.map(layer=>[layer.assetId,layer.path,layer.side,layer.width,layer.ratio]),[['a','a-atual.png','front',20,2],['b','b-atual.png','back',28,.8]]);
assert.equal(fresh.color,'black');assert.equal(fresh.title,'Pedido atual');assert.equal(fresh.layers[1].halftone,true);assert.equal(JSON.stringify({quote,assets,profiles}),untouched,'original artwork and quote remain unchanged');
const official={id:'mockup',asset_type:'mockup',owner_id:owner,workspace_id:workspace,project_id:project,metadata:{official_mockup:true,garment_scene:{...fresh,color:'custom-33bb66',colorHex:'#33bb66',colorName:'Verde',layers:fresh.layers.map((layer,i)=>({...layer,path:'stale.png',width:2,ratio:1,x:30+i,y:24+i,side:i?'back':'right'}))}}};
const linked={...quote,official_mockup_asset_id:official.id},restored=quoteGarmentScene(linked,[...assets,official],profiles,owner);
assert.equal(restored.colorHex,'#33bb66');assert.deepEqual(restored.layers.map(layer=>[layer.assetId,layer.path,layer.side,layer.width,layer.ratio,layer.x,layer.y]),[['a','a-atual.png','right',20,2,30,24],['b','b-atual.png','back',28,.8,31,25]],'only final placements/color reused; paths and sizes come from current profiles');
for(const changed of [{...official,project_id:'other'},{...official,workspace_id:'other'},{...official,owner_id:'other'},{...official,metadata:{...official.metadata,garment_scene:{...official.metadata.garment_scene,layers:[fresh.layers[0]]}}}]){const result=quoteGarmentScene(linked,[...assets,changed],profiles,owner);assert.equal(result.color,'black');assert.equal(result.layers[0].side,'front');}
assert.throws(()=>quoteGarmentScene({...quote,items:[...quote.items,{item_kind:'art',final_asset_id:null}]},assets,profiles,owner),/Vincule/);
assert.throws(()=>quoteGarmentScene(quote,assets,[profiles[0]],owner),/medidas/);
assert.throws(()=>quoteGarmentScene(quote,[assets[0],{...assets[1],workspace_id:'another'}],profiles,owner),/empresa/);
let activeOwner=owner,failed=false,changeDuringRead=false;const reads=[];
const ctx={accountOwnerId:()=>activeOwner,supabase:{from(table){const read={table,filters:[]};reads.push(read);const q={select(columns){read.columns=columns;return q},eq(key,value){read.filters.push([key,value]);return q},in(key,value){read.filters.push([key,value]);return q},abortSignal(){return q},then(resolve){if(changeDuringRead)activeOwner='other';resolve(failed?{error:Error('read failed')}:{data:table==='z19p_assets'?assets:profiles});}};return q;}}};
let captured;
const prepared=await prepareQuoteGarmentMockup(ctx,quote);(({asset,projectId,workspaceId,initialScene})=>{captured={asset,projectId,workspaceId,initialScene};})(prepared);
assert.equal(captured.asset,null);assert.equal(captured.projectId,project);assert.equal(captured.workspaceId,workspace);assert.equal(captured.initialScene.layers.length,2);assert.equal(captured.initialScene.layers[1].assetId,'b');
assert.ok(reads.every(read=>read.filters.some(([key,value])=>key==='owner_id'&&value===owner)));assert.ok(reads[0].filters.some(([key,value])=>key==='workspace_id'&&value===workspace));
failed=true;await assert.rejects(prepareQuoteGarmentMockup(ctx,quote),/read failed/);failed=false;changeDuringRead=true;await assert.rejects(prepareQuoteGarmentMockup(ctx,quote),error=>error.name==='AbortError');
const app=await fs.readFile(new URL('../app.js',import.meta.url),'utf8'),ui=await fs.readFile(new URL('../quote-service-ui.js',import.meta.url),'utf8'),composer=await fs.readFile(new URL('../garment-composer.js',import.meta.url),'utf8');
assert.match(app,/onCreateMockup:\(\{asset,projectId,workspaceId,initialScene,onSaved\}\)=>artStudio\.openGarment\(asset,\{projectId,workspaceId,initialScene,onOfficialSaved:onSaved\}\)/);
assert.match(ui,/prepareQuoteGarmentMockup\(ctx,draft,\{signal:controller\.signal\}\)/);assert.match(ui,/ctx\.onCreateMockup\(\{\.\.\.prepared,onSaved:/);assert.match(composer,/\[payload\.scene\.color\]:h\(garmentColor\(payload\.scene\)\.name\)/,'custom color names escaped in HTML sharing modal');
console.log('Quote mockup: every current final art, print sizes, current paths, saved official same-order placement, isolation, missing prep errors and complete hook propagation passed.');
