import assert from 'node:assert/strict';
import {buildFilmAssetCatalogue} from '../film-picker.js';

const asset={id:'asset-1',asset_type:'arte',workspace_id:'client-1',project_id:'order-1',name:'Arte do cliente',processed_path:'private/asset.png'};
const profile={asset_id:asset.id,ready_for_print:true,default_width_cm:20,default_height_cm:28};
const base={profiles:[profile],assetMap:new Map([[asset.id,asset]]),workspaces:[{id:'client-1',company_name:'Cliente'}]};
assert.equal(buildFilmAssetCatalogue({...base,projects:[{id:'order-1',official_order_source:'zero19_pdv',official_order_status:'ready_production'}]}).length,1);
assert.equal(buildFilmAssetCatalogue({...base,projects:[{id:'order-1',official_order_source:'zero19_pdv',official_order_status:'cancelled'}]}).length,0);
assert.equal(buildFilmAssetCatalogue({...base,projects:[{id:'order-1',official_order_source:'manual',official_order_status:'cancelled'}]}).length,1);
console.log('Cancelled ZERO19 artwork stays saved but leaves the film picker.');
