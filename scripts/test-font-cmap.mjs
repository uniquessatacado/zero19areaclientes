import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {parseFontCmap} from '../font-cmap.js';

function format4({first=65,last=67,delta=-64,glyphs=null}={}){
  const length=32+(glyphs?.length||0)*2,buffer=new ArrayBuffer(length),view=new DataView(buffer);
  view.setUint16(0,4);view.setUint16(2,length);view.setUint16(6,4);view.setUint16(8,4);view.setUint16(10,1);
  view.setUint16(14,last);view.setUint16(16,0xffff);view.setUint16(20,first);view.setUint16(22,0xffff);
  view.setInt16(24,delta);view.setInt16(26,1);view.setUint16(28,glyphs?4:0);
  glyphs?.forEach((glyph,index)=>view.setUint16(32+index*2,glyph));return new Uint8Array(buffer);
}
function formatGroups(format,groups){const buffer=new ArrayBuffer(16+groups.length*12),view=new DataView(buffer);view.setUint16(0,format);view.setUint32(4,buffer.byteLength);view.setUint32(12,groups.length);groups.forEach(([first,last,glyph],index)=>{const offset=16+index*12;view.setUint32(offset,first);view.setUint32(offset+4,last);view.setUint32(offset+8,glyph);});return new Uint8Array(buffer);}
function sfnt(records,{numGlyphs=200,otf=false}={}){
  const cmapLength=4+records.length*8+records.reduce((total,record)=>total+record.data.length,0),maxpOffset=Math.ceil((44+cmapLength)/4)*4,buffer=new ArrayBuffer(maxpOffset+6),view=new DataView(buffer),bytes=new Uint8Array(buffer);
  view.setUint32(0,otf?0x4f54544f:0x00010000);view.setUint16(4,2);
  bytes.set(new TextEncoder().encode('cmap'),12);view.setUint32(20,44);view.setUint32(24,cmapLength);
  bytes.set(new TextEncoder().encode('maxp'),28);view.setUint32(36,maxpOffset);view.setUint32(40,6);
  view.setUint32(maxpOffset,otf?0x00005000:0x00010000);view.setUint16(maxpOffset+4,numGlyphs);
  view.setUint16(46,records.length);let offset=4+records.length*8;
  records.forEach((record,index)=>{const at=48+index*8;view.setUint16(at,record.platform??3);view.setUint16(at+2,record.encoding??1);view.setUint32(at+4,offset);bytes.set(record.data,44+offset);offset+=record.data.length;});return bytes;
}

const simple=sfnt([{data:format4()}]);
const bmp=parseFontCmap(simple);
assert.equal(bmp.format,4);assert.equal(bmp.glyphIndex('A'),1);assert.equal(bmp.glyphIndex('B'),2);assert.equal(bmp.glyphIndex('C'),3);assert.equal(bmp.glyphIndex('D'),0);
assert.equal(bmp.hasGlyph('A'),true);assert.equal(bmp.hasGlyph('D'),false);assert.equal(bmp.hasGlyph('AB'),false);assert.equal(bmp.hasGlyph(-1),false);assert.equal(bmp.hasGlyph(0xd800),false);assert.equal(bmp.hasGlyph(0x110000),false);
assert.deepEqual(bmp.missingGlyphs('AADA🦄🦄'),['D','🦄']);
assert.equal(parseFontCmap(sfnt([{data:format4({delta:-65})}])).hasGlyph('A'),false,'glyph zero stays .notdef');
const indexed=parseFontCmap(sfnt([{data:format4({glyphs:[3,0,4],delta:10})}]));
assert.equal(indexed.glyphIndex('A'),13);assert.equal(indexed.glyphIndex('B'),0,'zero glyphIdArray entry must not receive idDelta');assert.equal(indexed.glyphIndex('C'),14);
const outsideMaxp=parseFontCmap(sfnt([{data:format4({delta:100})}],{numGlyphs:30}));assert.equal(outsideMaxp.hasGlyph('A'),false,'glyph outside maxp cannot be treated as real');

const ucs=sfnt([{data:formatGroups(12,[[65,67,1],[0x1f600,0x1f602,40]]),encoding:10}]);
const full=parseFontCmap(ucs);assert.equal(full.format,12);assert.equal(full.glyphIndex('😀'),40);assert.equal(full.glyphIndex('😂'),42);assert.equal(full.hasGlyph('🦄'),false);
const otf=parseFontCmap(sfnt([{data:format4()}],{otf:true}));assert.equal(otf.hasGlyph('A'),true,'CFF OTF uses the same cmap wrapper');
const many=parseFontCmap(sfnt([{platform:0,encoding:6,data:formatGroups(13,[[0x2600,0x26ff,5],[0x1f300,0x1f399,0]])}]));
assert.equal(many.glyphIndex('☀'),5);assert.equal(many.glyphIndex('☃'),5);assert.equal(many.hasGlyph(0x1f300),false);

const fullBeforeBMP=parseFontCmap(sfnt([{data:format4()},{data:formatGroups(12,[[0x1f600,0x1f600,40]]),encoding:10}]));
assert.equal(fullBeforeBMP.hasGlyph('A'),false,'maps are exclusive; do not invent coverage by merging Unicode subtables');assert.equal(fullBeforeBMP.hasGlyph('😀'),true);
const inconsistent=parseFontCmap(sfnt([{platform:0,encoding:3,data:format4({first:66,last:67})},{data:format4()}]));
assert.equal(inconsistent.glyphIndex('A'),1);assert.equal(inconsistent.hasGlyph('A'),false,'platform-alternative maps must agree on coverage');
const padded=new Uint8Array(simple.length+25);padded.set(simple,7);assert.equal(parseFontCmap(padded.subarray(7,7+simple.length)).glyphIndex('C'),3,'typed array offset must be honored');

const unsupported=new Uint8Array(10);new DataView(unsupported.buffer).setUint16(0,6);assert.throws(()=>parseFontCmap(sfnt([{data:unsupported}])),/formato cmap 6/);
assert.throws(()=>parseFontCmap(sfnt([{platform:3,encoding:0,data:format4()}])),/mapa Unicode/,'symbol encoding cannot be mistaken for Unicode');
const collection=new ArrayBuffer(12);new DataView(collection).setUint32(0,0x74746366);assert.throws(()=>parseFontCmap(collection),/TTC\/OTC/);
for(const end of [0,1,11,12,20,44,simple.length-1])assert.throws(()=>parseFontCmap(simple.subarray(0,end)),/validar os caracteres/,'truncated font must fail closed');
const badOffset=Uint8Array.from(simple);new DataView(badOffset.buffer).setUint32(52,0xffffffff);assert.throws(()=>parseFontCmap(badOffset),/endereço inválido/);
const badRange=format4({glyphs:[3,0,4],delta:0});new DataView(badRange.buffer).setUint16(28,0xfffe);assert.throws(()=>parseFontCmap(sfnt([{data:badRange}])),/endereço inválido/);
assert.throws(()=>parseFontCmap(sfnt([{data:formatGroups(12,[[65,70,199]]),encoding:10}])),/fora da fonte/);
assert.throws(()=>parseFontCmap(sfnt([{data:formatGroups(12,[[70,80,1],[65,67,30]]),encoding:10}])),/grupos cmap 12 inválidos/);
const hugeCount=formatGroups(12,[[65,67,1]]);new DataView(hugeCount.buffer).setUint32(12,0xffffffff);assert.throws(()=>parseFontCmap(sfnt([{data:hugeCount,encoding:10}])),/endereço inválido/);

const realFonts=[];
for(const filename of ['arial.ttf','segoeui.ttf','times.ttf']){
  const path=`C:/Windows/Fonts/${filename}`;
  if(!existsSync(path))continue;
  const coverage=parseFontCmap(readFileSync(path));
  assert.deepEqual(coverage.missingGlyphs('CLOVIS10 ÁÉÍÓÚÇÃÕ'),[]);
  assert.equal(coverage.hasGlyph(0x10ffff),false);
  realFonts.push({filename,format:coverage.format,numGlyphs:coverage.numGlyphs});
}
console.log(JSON.stringify({ok:true,syntheticFormats:[4,12,13],realFonts},null,2));
