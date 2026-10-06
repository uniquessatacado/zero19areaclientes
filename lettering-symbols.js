// Only a printable sign absent from the official face may use this fallback.
// Official letters, digits and mapped SVG glyphs never change their source.
export const SYMBOL_FONT_FALLBACK='"Arial Narrow",Arial,sans-serif';
export function letteringFontForCharacter(char,family,coverage){
 if(!family)throw new Error('A fonte mapeada para este caractere não foi carregada.');
 if(coverage?.hasGlyph(char))return {fontFamily:`"${family}"`,fallback:false};
 if(char===' ')return {fontFamily:`"${family}"`,fallback:false};
 if(/^[\p{P}\p{S}]$/u.test(char))return {fontFamily:SYMBOL_FONT_FALLBACK,fallback:true};
 const code=`U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')}`;
 throw new Error(`A fonte oficial não contém “${char}” (${code}). Cadastre o SVG deste caractere ou uma fonte que o inclua.`);
}
