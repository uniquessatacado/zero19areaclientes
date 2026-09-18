import assert from 'node:assert/strict';
import {measureLetteringLine,measureLetteringItem} from '../lettering-core.js';

const font={id:'letters',source_type:'ttf'},digits=[{glyph_key:'1',source_kind:'vector',svg_markup:'one',ratio:.3},{glyph_key:'0',source_kind:'vector',svg_markup:'zero',ratio:.6}];
const calls=[];
const resources={fontSource:font,glyphs:digits,glyphAspect:glyph=>glyph.ratio,measureFont(char,source){calls.push({char,source});return {width:600,actualBoundingBoxAscent:700,actualBoundingBoxDescent:0,actualBoundingBoxLeft:20,actualBoundingBoxRight:480}}};

const mixed=measureLetteringItem({name:'AB',number:'10',nameHeightCm:5.5,numberHeightCm:28,gapCm:1.5,nameTrackingCm:.15,digitSpacingCm:.2,...resources});
assert.deepEqual(calls.map(call=>call.char),['A','B'],'a registered TTF must never replace explicitly mapped number SVGs');
assert.deepEqual(mixed.numberLine.parts.map(part=>part.kind),['vector','vector']);
assert.equal(mixed.numberLine.widthCm,28*.3+28*.6+.2);
assert.equal(mixed.heightCm,35);
assert.ok(Math.abs(mixed.nameLine.parts[0].fontSizeCm-1000*5.5/700)<1e-10,'5.5 cm of painted glyphs is not the same as a 5.5 cm em box');
assert.ok(Math.abs(mixed.nameLine.parts[0].heightCm-5.5)<1e-10);
assert.ok(Math.abs(mixed.nameLine.widthCm-(500/700*5.5*2+.15))<1e-10,'font widths and tracking are measured in the same physical units');
assert.equal(mixed.numberYcm,7);

const noTracking=measureLetteringLine('10',{...resources,heightCm:28,trackingCm:0});
const customTracking=measureLetteringLine('10',{...resources,heightCm:28,trackingCm:1.37});
assert.ok(Math.abs(customTracking.widthCm-noTracking.widthCm-1.37)<1e-10,'nondefault saved tracking changes the final measured width exactly');

const accent=measureLetteringLine('ÁG',{heightCm:6,trackingCm:0,fontSource:font,glyphs:[],measureFont:char=>({width:600,actualBoundingBoxAscent:char==='Á'?850:700,actualBoundingBoxDescent:char==='G'?150:0,actualBoundingBoxLeft:0,actualBoundingBoxRight:600})});
assert.equal(accent.parts[0].yCm,0);
assert.ok(Math.abs(accent.parts[1].yCm+accent.parts[1].heightCm-6)<1e-10,'accents and descenders remain inside the chosen physical line height');

const numberOnly=measureLetteringItem({name:'',number:'10',nameHeightCm:5.5,numberHeightCm:28,gapCm:1.5,...resources});
assert.equal(numberOnly.heightCm,28,'no empty name line or gap is added for number-only printing');
assert.equal(numberOnly.numberYcm,0);

assert.throws(()=>measureLetteringLine('2',{heightCm:28,glyphs:digits,glyphAspect:glyph=>glyph.ratio}),/Caractere oficial ausente/);
assert.throws(()=>measureLetteringLine('A',{heightCm:5.5,fontSource:font,measureFont:()=>({width:500})}),/Não foi possível medir/,'missing actual bounds must not silently fall back to the em size');
assert.throws(()=>measureLetteringLine('1',{heightCm:28,fontSource:font,glyphs:[{glyph_key:'1',source_kind:'vector'}]}),/sem arquivo SVG/,'a broken explicit mapping cannot silently use the font');
assert.throws(()=>measureLetteringLine('A',{heightCm:5.5,fontSource:font,glyphs:[{glyph_key:'A',source_kind:'font',font_source_id:'missing'}]}),/Caractere oficial ausente/,'an explicit font mapping cannot silently use a different font');
assert.throws(()=>measureLetteringLine('1',{...resources,heightCm:28,trackingCm:-.2}),/zero ou maior/);

const secondFont={id:'alternate',source_type:'otf'};
const mapped=measureLetteringLine('A',{...resources,heightCm:5.5,fontSources:[secondFont],glyphs:[{glyph_key:'A',source_kind:'font',font_source_id:'alternate'}]});
assert.equal(mapped.parts[0].source.id,'alternate');

console.log('lettering regression tests: mixed SVG/font priority, physical bounds, spacing, accents, absent mappings and standalone numbers passed');
