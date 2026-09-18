// Unicode coverage for the exact SFNT bytes sent to FontFace. Browser font
// loading alone cannot distinguish a real glyph from a silent fallback font.
// Format definitions: https://learn.microsoft.com/en-us/typography/opentype/spec/cmap
// Directory: https://learn.microsoft.com/en-us/typography/opentype/spec/otff
const fail=detail=>{throw new Error(`Não foi possível validar os caracteres da fonte: ${detail}. Exporte uma fonte TTF/OTF Unicode válida ou cadastre os caracteres em SVG.`);};
const scalar=value=>Number.isInteger(value)&&value>=0&&value<=0x10ffff&&(value<0xd800||value>0xdfff);
const codePointOf=value=>typeof value==='number'?value:typeof value==='string'&&[...value].length===1?value.codePointAt(0):-1;

export function parseFontCmap(bytes){
  const view=bytes instanceof ArrayBuffer?new DataView(bytes):ArrayBuffer.isView(bytes)?new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength):null;
  if(!view)fail('arquivo binário ausente');
  const range=(start,length,limit=view.byteLength)=>{if(!Number.isSafeInteger(start)||!Number.isSafeInteger(length)||start<0||length<0||start+length>limit)fail('tabela truncada ou com endereço inválido');};
  range(0,12);
  const signature=view.getUint32(0);
  if(signature===0x74746366)fail('coleções TTC/OTC não são aceitas; use uma fonte individual');
  if(![0x00010000,0x4f54544f,0x74727565].includes(signature))fail('o arquivo não é uma fonte SFNT TTF/OTF compatível');
  const tableCount=view.getUint16(4);range(12,tableCount*16);
  let cmap=null,maxp=null;
  for(let index=0;index<tableCount;index++){
    const at=12+index*16,tag=String.fromCharCode(...[0,1,2,3].map(offset=>view.getUint8(at+offset))),offset=view.getUint32(at+8),length=view.getUint32(at+12);
    if(tag!=='cmap'&&tag!=='maxp')continue;
    range(offset,length);
    if(offset<12+tableCount*16)fail('tabela sobreposta ao cabeçalho');
    if(tag==='cmap'){if(cmap)fail('tabela cmap duplicada');cmap={offset,length};}
    else{if(maxp)fail('tabela maxp duplicada');maxp={offset,length};}
  }
  if(!cmap||!maxp)fail('tabela cmap ou maxp ausente');
  if(maxp.length<6)fail('tabela maxp incompleta');
  const maxpVersion=view.getUint32(maxp.offset),numGlyphs=view.getUint16(maxp.offset+4);
  if(![0x00005000,0x00010000].includes(maxpVersion)||!numGlyphs)fail('quantidade de glifos inválida');
  const cmapEnd=cmap.offset+cmap.length;
  range(cmap.offset,4,cmapEnd);
  if(view.getUint16(cmap.offset)!==0)fail('versão cmap não suportada');
  const count=view.getUint16(cmap.offset+2),recordsEnd=cmap.offset+4+count*8;
  range(cmap.offset+4,count*8,cmapEnd);
  const records=[];
  for(let index=0;index<count;index++){
    const at=cmap.offset+4+index*8,platformId=view.getUint16(at),encodingId=view.getUint16(at+2);
    const unicode=platformId===0&&[0,1,2,3,4,6].includes(encodingId)||platformId===3&&[1,10].includes(encodingId);
    if(!unicode)continue; // Symbol and legacy encodings are not Unicode coverage.
    const start=cmap.offset+view.getUint32(at+4);range(start,2,cmapEnd);
    if(start<recordsEnd)fail('subtabela sobreposta aos registros cmap');
    const format=view.getUint16(start);
    // Full-repertoire tables take precedence over BMP, per OpenType. Format 14
    // only supplements a base table and is never accepted as base coverage.
    const full=[8,10,12,13].includes(format),priority=(full?100:0)+(platformId===3?20:10)+encodingId;
    records.push({start,format,platformId,encodingId,priority});
  }
  if(!records.length)fail('a fonte não possui um mapa Unicode de caracteres');
  records.sort((a,b)=>b.priority-a.priority);
  const primary=records[0];
  if(![4,12,13].includes(primary.format))fail(`formato cmap ${primary.format} ainda não suportado`);
  const parsed=new Map();
  function parseRecord(record){
    if(parsed.has(record.start))return parsed.get(record.start);
    const {start,format}=record;
    let lookup;
    if(format===4){
      range(start,16,cmapEnd);
      const length=view.getUint16(start+2),end=start+length,segmentsX2=view.getUint16(start+6),segments=segmentsX2/2;
      if(length<16||segmentsX2<2||segmentsX2%2)fail('segmentos cmap 4 inválidos');
      range(start,length,cmapEnd);range(start,16+segments*8,end);
      const endBase=start+14,startBase=endBase+segments*2+2,deltaBase=startBase+segments*2,offsetBase=deltaBase+segments*2,glyphBase=offsetBase+segments*2;
      const ranges=[];
      for(let index=0;index<segments;index++){
        const first=view.getUint16(startBase+index*2),last=view.getUint16(endBase+index*2),delta=view.getInt16(deltaBase+index*2),word=offsetBase+index*2,offset=view.getUint16(word);
        if(first>last||(index&&first<=ranges[index-1].last))fail('segmentos cmap 4 sobrepostos ou fora de ordem');
        if(offset){if(offset%2||word+offset<glyphBase)fail('endereço de glifo cmap 4 inválido');range(word+offset,(last-first+1)*2,end);}
        ranges.push({first,last,delta,word,offset});
      }
      if(ranges.at(-1).first!==0xffff||ranges.at(-1).last!==0xffff)fail('terminador cmap 4 ausente');
      lookup=point=>{
        if(point>0xffff)return 0;
        let low=0,high=ranges.length-1;
        while(low<=high){const mid=(low+high)>>1,segment=ranges[mid];if(point>segment.last){low=mid+1;continue;}if(point<segment.first){high=mid-1;continue;}
          if(!segment.offset)return (point+segment.delta)&0xffff;
          const glyph=view.getUint16(segment.word+segment.offset+(point-segment.first)*2);
          return glyph?(glyph+segment.delta)&0xffff:0;
        }
        return 0;
      };
    }else if(format===12||format===13){
      range(start,16,cmapEnd);
      const length=view.getUint32(start+4),end=start+length,groups=view.getUint32(start+12);
      if(length<16)fail(`tamanho cmap ${format} inválido`);
      range(start,length,cmapEnd);range(start+16,groups*12,end);
      const ranges=[];
      for(let index=0;index<groups;index++){
        const at=start+16+index*12,first=view.getUint32(at),last=view.getUint32(at+4),glyph=view.getUint32(at+8),lastGlyph=format===13?glyph:glyph+(last-first);
        if(first>last||last>0x10ffff||(index&&first<=ranges[index-1].last))fail(`grupos cmap ${format} inválidos`);
        if(lastGlyph>=numGlyphs)fail(`glifo cmap ${format} fora da fonte`);
        ranges.push({first,last,glyph});
      }
      lookup=point=>{let low=0,high=ranges.length-1;while(low<=high){const mid=(low+high)>>1,group=ranges[mid];if(point<group.first)high=mid-1;else if(point>group.last)low=mid+1;else return group.glyph+(format===13?0:point-group.first);}return 0;};
    }else fail(`formato cmap ${format} ainda não suportado`);
    const guarded=point=>{if(!scalar(point))return 0;const glyph=lookup(point);return glyph>0&&glyph<numGlyphs?glyph:0;};
    parsed.set(record.start,guarded);return guarded;
  }
  const primaryLookup=parseRecord(primary);
  // Same-format Unicode records may be chosen differently across operating
  // systems. Require coverage in each alternative, never combine their ranges.
  const equivalent=[...new Map(records.filter(record=>record.format===primary.format).map(record=>[record.start,record])).values()].map(parseRecord);
  const glyphIndex=value=>{const point=codePointOf(value);return scalar(point)?primaryLookup(point):0;};
  const hasGlyph=value=>{const point=codePointOf(value);return scalar(point)&&equivalent.every(lookup=>lookup(point)>0);};
  return Object.freeze({format:primary.format,platformId:primary.platformId,encodingId:primary.encodingId,numGlyphs,glyphIndex,hasGlyph,missingGlyphs:text=>[...new Set([...String(text||'')].filter(character=>!hasGlyph(character)))]});
}
