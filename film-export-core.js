// Scan native export pixels, including partially transparent antialiasing.
// No thumbnail, resampling, color threshold or background color participates.
export async function findCanvasAlphaBounds(canvas){
  const width=canvas.width,height=canvas.height,context=canvas.getContext('2d',{willReadFrequently:true});
  let left=width,top=height,right=-1,bottom=-1;
  for(let y0=0;y0<height;y0+=64){
    const rows=Math.min(64,height-y0),rgba=context.getImageData(0,y0,width,rows).data;
    for(let y=0;y<rows;y++)for(let x=0;x<width;x++)if(rgba[(y*width+x)*4+3]!==0){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y0+y);bottom=Math.max(bottom,y0+y)}
    if(y0%512===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  return right<left?null:{x:left,y:top,width:right-left+1,height:bottom-top+1};
}
export async function cropCanvasToAlpha(canvas){
  const bounds=await findCanvasAlphaBounds(canvas);if(!bounds)throw new Error('O segmento está totalmente transparente. Confira as artes antes de exportar.');
  if(bounds.x===0&&bounds.y===0&&bounds.width===canvas.width&&bounds.height===canvas.height)return {canvas,bounds};
  const cropped=document.createElement('canvas');cropped.width=bounds.width;cropped.height=bounds.height;const context=cropped.getContext('2d');context.imageSmoothingEnabled=false;
  context.drawImage(canvas,bounds.x,bounds.y,bounds.width,bounds.height,0,0,bounds.width,bounds.height);
  return {canvas:cropped,bounds};
}
