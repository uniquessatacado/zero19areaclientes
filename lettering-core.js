const positive=(value,label)=>{const number=Number(value);if(!Number.isFinite(number)||number<=0)throw new Error(`${label} deve ser maior que zero.`);return number;};

// The requested line height is the actual painted height, not the font's em box.
// Every mapped vector wins over a font fallback for the same character.
export function measureLetteringLine(text,{heightCm,trackingCm=0,glyphs=[],fontSource=null,fontSources=[],measureFont,glyphAspect}={}){
  const value=String(text||'').trim(),height=positive(heightCm,'A altura'),tracking=Number(trackingCm);
  if(!Number.isFinite(tracking)||tracking<0)throw new Error('O espaço entre caracteres deve ser zero ou maior.');
  if(!value)return {text:'',widthCm:0,heightCm:0,parts:[],fontCharacters:[],vectorCharacters:[]};
  const glyphMap=new Map(glyphs.map(glyph=>[glyph.glyph_key,glyph])),sources=new Map(fontSources.map(source=>[source.id,source]));
  if(fontSource)sources.set(fontSource.id,fontSource);
  const parts=[...value].map(char=>{
    const glyph=glyphMap.get(char);
    if(glyph?.source_kind==='vector'||glyph?.svg_markup){
      if(!glyph.svg_markup)throw new Error(`O vetor oficial de “${char}” está sem arquivo SVG.`);
      return {kind:'vector',char,glyph,aspect:positive(glyphAspect(glyph),'A proporção do vetor')};
    }
    const source=glyph?.font_source_id?sources.get(glyph.font_source_id):fontSource;
    if(!source){if(char===' ')return {kind:'space',char,ratio:.4};throw new Error(`Caractere oficial ausente: “${char}”. Cadastre um SVG ou a fonte correspondente.`);}
    const metrics=measureFont(char,source);
    if(char===' ')return {kind:'space',char,metrics,source};
    const ascent=Number(metrics.actualBoundingBoxAscent),descent=Number(metrics.actualBoundingBoxDescent),left=Number(metrics.actualBoundingBoxLeft),right=Number(metrics.actualBoundingBoxRight);
    if(![ascent,descent,left,right].every(Number.isFinite)||ascent+descent<=0||left+right<=0)throw new Error(`Não foi possível medir o desenho de “${char}”. Confira a fonte ou cadastre o SVG deste caractere.`);
    return {kind:'font',char,source,metrics:{ascent,descent,left,right}};
  });
  const fontParts=parts.filter(part=>part.kind==='font'),maxAscent=Math.max(0,...fontParts.map(part=>part.metrics.ascent)),maxDescent=Math.max(0,...fontParts.map(part=>part.metrics.descent)),fontInkHeight=maxAscent+maxDescent;
  let cursor=0;
  for(const part of parts){
    part.xCm=cursor;part.yCm=0;
    if(part.kind==='vector'){part.widthCm=height*part.aspect;part.heightCm=height;}
    else if(part.kind==='space'){part.widthCm=height*(part.metrics&&fontInkHeight?part.metrics.width/fontInkHeight:part.ratio||.4);part.heightCm=0;}
    else{const scale=height/fontInkHeight;part.widthCm=(part.metrics.left+part.metrics.right)*scale;part.heightCm=(part.metrics.ascent+part.metrics.descent)*scale;part.yCm=(maxAscent-part.metrics.ascent)*scale;part.fontSizeCm=1000*scale;part.originOffsetCm=part.metrics.left*scale;part.baselineCm=maxAscent*scale;}
    cursor+=part.widthCm+tracking;
  }
  return {text:value,widthCm:cursor-tracking,heightCm:height,trackingCm:tracking,parts,fontCharacters:fontParts.map(part=>part.char),vectorCharacters:parts.filter(part=>part.kind==='vector').map(part=>part.char)};
}

export function measureLetteringItem({name,number,nameHeightCm,numberHeightCm,gapCm=0,nameTrackingCm=0,digitSpacingCm=0,...resources}){
  const gap=Number(gapCm);if(!Number.isFinite(gap)||gap<0)throw new Error('A distância entre nome e número deve ser zero ou maior.');
  const nameLine=measureLetteringLine(name,{...resources,heightCm:nameHeightCm,trackingCm:nameTrackingCm});
  const numberLine=measureLetteringLine(number,{...resources,heightCm:numberHeightCm,trackingCm:digitSpacingCm});
  if(!nameLine.parts.length&&!numberLine.parts.length)throw new Error('Informe um nome ou número para visualizar.');
  return {nameLine,numberLine,widthCm:Math.max(nameLine.widthCm,numberLine.widthCm),heightCm:nameLine.heightCm+numberLine.heightCm+(nameLine.parts.length&&numberLine.parts.length?gap:0),numberYcm:nameLine.parts.length?nameLine.heightCm+(numberLine.parts.length?gap:0):0};
}
