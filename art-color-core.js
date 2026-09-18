// Manual colour selection only. Alpha is never increased; canvas bounds are preserved.
export function colorDistance(r,g,b,color){return Math.max(Math.abs(r-color[0]),Math.abs(g-color[1]),Math.abs(b-color[2]))}
export function applyColorRules(pixels,rules=[],selection=null){
  let selected=0,remaining=0;
  for(let i=0;i<pixels.length;i+=4){
    if(!pixels[i+3])continue;
    for(const rule of rules){
      const distance=colorDistance(pixels[i],pixels[i+1],pixels[i+2],rule.color),tolerance=Math.max(0,Number(rule.tolerance)||0),feather=Math.max(0,Number(rule.feather)||0);
      if(distance<=tolerance){pixels[i+3]=0;break}
      if(feather&&distance<tolerance+feather)pixels[i+3]=Math.round(pixels[i+3]*(distance-tolerance)/feather);
    }
    if(pixels[i+3])remaining++;
    if(selection&&pixels[i+3]&&colorDistance(pixels[i],pixels[i+1],pixels[i+2],selection.color)<=selection.tolerance){
      selected++;pixels[i]=Math.round(pixels[i]*.35+255*.65);pixels[i+1]=Math.round(pixels[i+1]*.35+70*.65);pixels[i+2]=Math.round(pixels[i+2]*.35+90*.65);
    }
  }
  return {selected,remaining};
}
