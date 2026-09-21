import assert from 'node:assert/strict';
import {saveOfficialGarmentMockup} from '../garment-official.js';
const owner='11111111-1111-4111-8111-111111111111',workspace='22222222-2222-4222-8222-222222222222',project='33333333-3333-4333-8333-333333333333',art='44444444-4444-4444-8444-444444444444';
let activeOwner=owner,failRead=false,failUpload=false,failSave=false,crossWorkspace=false;
const uploads=[],inserts=[],selections=[],original={id:art,owner_id:owner,workspace_id:workspace,asset_type:'arte',original_path:owner+'/art.png',processed_path:owner+'/art.png',metadata:{keep:true}};
const scene={color:'navy',layers:[{id:'layer',assetId:art,path:original.original_path,name:'Estampa frontal',side:'front',width:20,ratio:2,x:27,y:24}]};
globalThis.Image=class{width=1254;height=1254;async decode(){}};
globalThis.document={createElement(){const context={drawImage(){},fillRect(){},strokeRect(){},setLineDash(){},fillText(){},measureText(){return {width:100}},save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},clip(){}};return {width:0,height:0,getContext:()=>context,toBlob:fn=>fn(new Blob(['mockup-fixture'],{type:'image/png'}))};}};
const ctx={accountOwnerId:()=>activeOwner,state:()=>({session:{user:{id:owner}}}),publicUrl:path=>path,supabase:{
  from(table){
    let mode='read',payload,filters=[];
    const query={select(columns){selections.push([table,columns]);return query},eq(key,value){filters.push([key,value]);return query},in(key,value){filters.push([key,value]);return query},single(){return query},insert(row){mode='insert';payload=row;return query},then(resolve){
      assert.ok(mode==='insert'||filters.some(([key,value])=>key==='owner_id'&&value===owner));
      if(mode==='insert'){inserts.push(structuredClone(payload));resolve(failSave?{error:{message:'fixture write failed'}}:{data:payload});return;}
      if(failRead){resolve({error:new Error('fixture read failed')});return;}
      resolve({data:table==='z19p_projects'?{id:project,workspace_id:workspace,owner_id:owner}:[{...original,workspace_id:crossWorkspace?'other':workspace}]});
    }};
    return query;
  },
  storage:{from(bucket){assert.equal(bucket,'z19p-assets');return {async upload(path,blob,config){uploads.push({path,blob,config});return failUpload?{error:new Error('upload failed')}:{data:{path}};}};}}
}};
const before=JSON.stringify(original),row=await saveOfficialGarmentMockup(ctx,scene,{workspaceId:workspace,projectId:project});assert.equal(row.asset_type,'mockup');assert.equal(row.project_id,project);assert.equal(row.workspace_id,workspace);assert.equal(row.owner_id,owner);assert.equal(row.metadata.official_mockup,true);assert.equal(row.metadata.garment_scene.color,'navy');assert.equal(row.metadata.garment_scene.layers[0].assetId,art);assert.equal(row.metadata.garment_scene.layers[0].width,20);assert.equal(row.metadata.placement_origin,'surface-top-left');assert.equal(row.metadata.placement_units,'cm');assert.deepEqual(row.metadata.reference_asset_ids,[art]);assert.equal(row.alpha_trimmed,false);assert.equal(row.original_path,row.processed_path);assert.equal(uploads[0].config.upsert,false);assert.equal(inserts.length,1);assert.equal(JSON.stringify(original),before,'source artwork never overwritten');
crossWorkspace=true;await assert.rejects(saveOfficialGarmentMockup(ctx,scene,{workspaceId:workspace,projectId:project}),/desta empresa/);assert.equal(uploads.length,1);crossWorkspace=false;failRead=true;await assert.rejects(saveOfficialGarmentMockup(ctx,scene,{workspaceId:workspace,projectId:project}),/read failed/);assert.equal(uploads.length,1);failRead=false;
failUpload=true;await assert.rejects(saveOfficialGarmentMockup(ctx,scene,{workspaceId:workspace,projectId:project}),/upload failed/);assert.equal(inserts.length,1);failUpload=false;failSave=true;await assert.rejects(saveOfficialGarmentMockup(ctx,scene,{workspaceId:workspace,projectId:project}),/não foi possível confirmar/);assert.equal(inserts.length,2);failSave=false;
const aborted=new AbortController();aborted.abort();await assert.rejects(saveOfficialGarmentMockup(ctx,scene,{workspaceId:workspace,projectId:project,signal:aborted.signal}),error=>error.name==='AbortError');await assert.rejects(saveOfficialGarmentMockup(ctx,scene,{workspaceId:workspace}),/pelo pedido/);
console.log('Official garment mockup: new annotated asset, tenant/company/project linkage, preserved source, upload/read/database failure and cancellation checks passed.');
