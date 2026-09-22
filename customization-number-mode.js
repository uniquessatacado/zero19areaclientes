// Explicit numbering policy. Source files and existing vector mappings are never deleted.
export const NUMBER_MODES=Object.freeze({
  none:'Somente nomes (sem números)',
  font:'Usar números do arquivo TTF / OTF',
  vector:'Usar vetores SVG individuais dos números',
  legacy:'Manter configuração atual (TTF + SVG)'
});
export function numberMode(set){
  const mode=set?.number_source_mode??'legacy';
  if(!Object.hasOwn(NUMBER_MODES,mode))throw new Error('Modo de números inválido. Reabra o cadastro.');
  return mode;
}
const fontType=source=>['ttf','otf'].includes(source?.source_type);
function belongs(source,set){
  return source&&(!source.set_id||!set.id||source.set_id===set.id)&&(!source.owner_id||!set.owner_id||source.owner_id===set.owner_id);
}
export function letteringSources(set,number=''){
  const mode=numberMode(set),digits=String(number??'').trim();
  if(digits&&!/^\d{1,6}$/.test(digits))throw new Error('Use somente algarismos no campo número.');
  if(mode==='none'&&digits)throw new Error('Esta fonte está cadastrada somente para nomes. Altere a opção de números no cadastro para usá-los.');
  const sources=(set._sources||[]).filter(source=>belongs(source,set));
  const fallback=belongs(set._source,set)?set._source:null;
  let glyphs=(set._glyphs||[]).filter(glyph=>belongs(glyph,set)).map(glyph=>({...glyph}));
  if(mode==='font'){
    const chosen=set.number_font_source_id?sources.find(source=>source.id===set.number_font_source_id):fallback;
    if(digits&&(!fontType(chosen)||!chosen.storage_path))throw new Error('Selecione um arquivo TTF / OTF para os números e salve a preparação.');
    // Ignore saved digit vectors only in the recipe; keep their database records.
    glyphs=glyphs.filter(glyph=>!/^\d$/.test(glyph.glyph_key));
    if(fontType(chosen))glyphs.push(...[...'0123456789'].map(glyph_key=>({glyph_key,source_kind:'font',font_source_id:chosen.id,svg_markup:null})));
  }
  if(mode==='vector'){
    const missing=[...new Set(digits)].filter(digit=>!glyphs.some(glyph=>glyph.glyph_key===digit&&glyph.svg_markup));
    if(missing.length)throw new Error(`Faltam vetores SVG para: ${missing.join(', ')}. Mapeie os números no cadastro ou escolha os números do TTF.`);
  }
  return {fontSource:fallback,fontSources:sources,glyphs,numberSourceMode:mode};
}
export function setNumberInputs(modal,set,{sample=false}={}){
  const mode=numberMode(set),input=modal.querySelector('[name="number"]');
  if(!input)return;
  input.disabled=mode==='none';
  input.title=NUMBER_MODES[mode];input.placeholder=mode==='none'?'Somente nomes':'Ex.: 10';
  if(mode==='none')input.value='';else if(sample&&!input.value)input.value='10';
  for(const name of ['numberHeightCm','digitSpacingCm','gapCm']){
    const field=modal.querySelector(`[name="${name}"]`);if(field)field.disabled=mode==='none';
  }
}
