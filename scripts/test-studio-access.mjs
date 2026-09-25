import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {attachAssetStudioActions} from '../asset-studio-actions.js';
class Element {
  children=[];dataset={};isConnected=true;
  append(node){node.parent=this;this.children.push(node)}
  replaceChildren(){this.children=[]}
  querySelector(selector){return this.children.find(node=>selector==='.'+node.className)||null}
  remove(){this.parent.children=this.parent.children.filter(node=>node!==this)}
}
globalThis.document={createElement:()=>new Element()};
const card=new Element(),body=new Element();body.className='asset-body';card.append(body);
card.querySelector=selector=>selector==='.asset-body'?body:body.querySelector(selector);
const calls=[],asset={id:'art',asset_type:'arte',original_path:'a.png'},handlers={openGarment:a=>calls.push(['garment',a.id]),openMockup:a=>calls.push(['mockup',a.id]),openEditor:a=>calls.push(['editor',a.id])};
let group=attachAssetStudioActions(card,asset,handlers);assert.equal(group.children.length,3);assert.equal(group.children[0].textContent,'Montar camiseta');
for(const button of group.children)await button.onclick({stopPropagation(){}});
assert.deepEqual(calls,[['garment','art'],['mockup','art'],['editor','art']]);
attachAssetStudioActions(card,asset,handlers);assert.equal(body.children.length,1,'idempotent during filter/enhancement');
attachAssetStudioActions(card,{asset_type:'mockup',original_path:'photo.jpg'},handlers);assert.equal(body.children.length,0,'photo cannot be placed as print or pretend editable3D');
group=attachAssetStudioActions(card,{asset_type:'mockup',metadata:{garment_scene:{layers:[]}}},handlers);assert.equal(group.children.length,1);assert.equal(group.children[0].textContent,'Editar montagem');
attachAssetStudioActions(card,{asset_type:'video'},handlers);assert.equal(body.children.length,0);
group=attachAssetStudioActions(card,asset,{openGarment(){throw Error('Fixture failure')},onError:error=>calls.push(error.message)});await group.children[0].onclick({stopPropagation(){}});assert.equal(calls.at(-1),'Fixture failure');assert.equal(group.children[0].disabled,false);
assert.equal(attachAssetStudioActions(card,asset,{}),null,'no dead controls');
const source=await readFile(new URL('../app.js',import.meta.url),'utf8'),finalBinder=source.slice(source.lastIndexOf('bindAssetCards = function(){')).split('\n};')[0];
assert.ok(finalBinder.includes('bindStudioAssetCards();'),'final overridden binder retains studio controls');assert.ok(finalBinder.includes('productionModule?.enhanceAssetCards?.();'));
assert.ok(source.includes("if(session&&current==='/studio'){if(!garmentStudioEnabled)"),'studio route must honor the feature flag');assert.ok(source.includes("return renderStudioHome({app,shell,bindCommon,artStudio,publicUrl,toast});}"),'enabled studio route must still open the mockup studio');assert.ok(source.includes('data-nav="/studio">Estúdio de mockups'));assert.ok(source.includes('data-nav="/studio"><i>M</i><span>Estúdio'));
assert.ok(source.includes("attachAssetStudioActions($('.preview-controls',m)"));assert.ok(source.includes("attachAssetStudioActions($('.file-actions',m)"));
console.log('Studio access: visible real actions, filtering idempotence, error recovery, no fake3D/photo controls, final binder, preview/menu/mobile routing passed.');
