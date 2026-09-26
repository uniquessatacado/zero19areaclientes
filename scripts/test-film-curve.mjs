import assert from 'node:assert/strict';
import {createInkCurveLut} from '../film-curve.js';
import {CURVE_INK_LUT} from '../film-tiff-core.js';

const standard=createInkCurveLut(54,34);
assert.deepEqual([...standard],[...CURVE_INK_LUT],'A curva padrão 54→34 precisa permanecer idêntica à curva aprovada.');

const custom=createInkCurveLut(60,42);
assert.equal(custom.length,256);
assert.equal(custom[0],0);
assert.equal(custom[255],255);
assert.ok(custom.every((value,index)=>index===0||value>=custom[index-1]),'A curva precisa ser monotônica.');
assert.ok(Math.abs(custom[Math.round(255*.6)]-Math.round(255*.42))<=1,'O ponto entrada/saída precisa ser respeitado.');

console.log('film curve tests: ok');
