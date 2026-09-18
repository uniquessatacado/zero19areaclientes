import assert from 'node:assert/strict';
import {regularGarmentPoint,relaxedGarmentPoint,garmentCameraDistance,garmentSnapshotSize} from '../garment-3d.js';
const measures={bodyWidth:54,bodyLength:74};
assert.deepEqual(regularGarmentPoint(0,37,5,measures),[0,37,5],'Collar center preserved');
assert.deepEqual(regularGarmentPoint(20,-20,10,measures),[20,-20,10],'Lower torso preserved');
for(let x=0;x<=45;x+=.25)for(let y=-37;y<=37;y+=.5){const a=regularGarmentPoint(x,y,12,measures),b=regularGarmentPoint(-x,y,12,measures);assert.ok(a.every(Number.isFinite));assert.ok(Math.abs(a[0]+b[0])<1e-9);assert.equal(a[1],b[1]);assert.equal(a[2],b[2]);assert.ok(a[2]>=9,'Volumetric thickness retained');assert.ok(a[1]>=y);if(x)assert.ok(a[0]>0,'No fold-over across body axis')}
const sleeve=regularGarmentPoint(36,20,12,measures);assert.ok(sleeve[0]<36&&sleeve[1]>20&&sleeve[2]<12,'Sleeve is shortened and narrowed, not a renamed unchanged mesh');
console.log('3D normal derivative: preserved collar/torso, finite continuous symmetric deformation, shortened sleeves, volume and no axis inversion passed.');
for(const model of ['normal','oversized'])for(let x=-45;x<=45;x+=.5)for(let y=-37;y<=37;y+=.5){const a=relaxedGarmentPoint(x,y,10,measures,model),b=relaxedGarmentPoint(-x,y,10,measures,model);assert.ok(a.every(Number.isFinite));assert.equal(a[0],x);assert.equal(a[2],10);assert.ok(a[1]<=y&&a[1]>=y-8);assert.equal(a[1],b[1]);if(y<0)assert.equal(a[1],y)}
assert.ok(garmentCameraDistance({width:90,height:75,depth:25,aspect:.5})>garmentCameraDistance({width:90,height:75,depth:25,aspect:2}),'Fit responds to viewport aspect ratio');
assert.ok(garmentCameraDistance({width:90,height:75,depth:25,aspect:.5,side:'left'})<garmentCameraDistance({width:90,height:75,depth:25,aspect:.5}),'Side views fit model depth rather than sleeve span');
for(const [width,height] of [[390,844],[390,400],[400,390],[390,390],[1240,571],[1000,50]]){const size=garmentSnapshotSize(width,height);assert.equal(Math.max(size.width,size.height+size.creditHeight),2000);assert.ok(Math.abs(size.width-size.height*width/height)<=1.1,'Export reserves credit strip without distorting the model');assert.equal(size.creditHeight,90)}
assert.throws(()=>garmentSnapshotSize(0,10));assert.throws(()=>garmentSnapshotSize(Infinity,10));console.log('3D snapshot: 2K output, permanent credit strip and preserved aspect ratio including square canvases passed.');
