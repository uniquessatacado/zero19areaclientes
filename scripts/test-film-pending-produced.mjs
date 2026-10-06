import assert from 'node:assert/strict';
import {bindPendingProducedActions} from '../film-pending-produced.js';
class Node {
 constructor(){this.children=[];this.dataset={};this.style={};this.isConnected=true;this.disabled=false;}
 before(node){node.parent=this.parent;this.parent.children.splice(this.parent.children.indexOf(this),0,node);}
 appendChild(node){if(node.parent)node.parent.children=node.parent.children.filter(n=>n!==node);node.parent=this;this.children.push(node);return node;}
 closest(){return this;}
 remove(){this.parent.children=this.parent.children.filter(n=>n!==this);this.isConnected=false;}
 querySelectorAll(){return this.children.flatMap(n=>[n,...n.querySelectorAll()]).filter(n=>n.dataset.pendingProduced);}
}
globalThis.document={createElement:()=>new Node()};
const modal=new Node(),entries=[{key:'font:a',kind:'font',row:{id:'a'}},{key:'vdr:b',kind:'vdr',row:{id:'b'},alreadyInFilm:true},{key:'venduss:c',kind:'venduss',row:{id:'c'}},{key:'generic:d',kind:'generic',row:{id:'d'}}];
const rows=entries.map(()=>modal.appendChild(new Node()));modal.querySelector=selector=>rows[Number(selector.match(/"(\d+)"/)[1])];
const selected=new Set(['font:a','venduss:c','generic:d']),calls=[];let busy=false,confirmed=false,current=true,updates=0;
bindPendingProducedActions({entries,modal,isCurrent:()=>current,getBusy:()=>busy,setBusy:value=>{busy=value},selected,updateCount:()=>updates++,markProduced:async id=>{calls.push(id);return confirmed;},onProduced:async()=>{updates++;}});
const buttons=modal.querySelectorAll();assert.equal(buttons.length,3);assert.equal(buttons[1].disabled,true);
const event={preventDefault(){},stopPropagation(){}};
await buttons[0].onclick(event);assert.equal(entries[0].completed,undefined);assert(selected.has('font:a'),'cancel keeps selection and item');
assert.equal(busy,false);confirmed=true;await buttons[0].onclick(event);
assert.equal(entries[0].completed,true);assert(!selected.has('font:a'));assert(selected.has('venduss:c'));assert.equal(entries[2].completed,undefined,'sibling remains pending');
assert.equal(modal.querySelectorAll().length,2);assert.equal(busy,false);
await buttons[1].onclick(event);assert.deepEqual(calls,['a','a'],'an item already in the film cannot be manually completed');
current=false;await buttons[2].onclick(event);assert.deepEqual(calls,['a','a']);
assert(updates>=5);assert.match(buttons[0].style.cssText,/min-height:44px/);assert.match(buttons[0].style.cssText,/background:#fff;color:#111113/);
delete globalThis.document;
console.log('PASS pending selector produced action: confirmed application only, cancel/route/draft guards, siblings/selection preserved, visible touch target.');
