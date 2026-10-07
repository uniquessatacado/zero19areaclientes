// Package owner-provided Corel SVGs and their declared PNG dependencies.
// No pixel editing, tracing, network access, overwriting or source mutation.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function packageDigit(svg, png, digit) {
  assert(/^[0-9]$/.test(String(digit)),'Expected a single digit.');
  assert(png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'Dependency must be PNG.');
  assert.equal(png.toString('ascii',12,16),'IHDR');
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  assert(width>0&&height>0&&width*height<=25000000,'Unexpected PNG dimensions.');
  assert(!/<(?:script|foreignObject|iframe|object|embed)\b|\bon\w+\s*=|<!ENTITY|url\s*\(/i.test(svg),'Active SVG content is not allowed.');
  const links=[...svg.matchAll(/(?:xlink:)?href\s*=\s*"([^"]+)"/g)];
  const expected=`numero ${digit}_Images\\numero ${digit}_ImgID1.png`;
  assert.equal(links.length,1,'Expected exactly one declared dependency.');
  assert.equal(links[0][1].replaceAll('/','\\'),expected,'Dependency does not match this digit.');
  assert.equal((svg.match(/<image\b/g)||[]).length,1,'Expected one raster image, not a vector drawing.');
  const box=svg.match(/viewBox\s*=\s*"([^\"]+)"/)?.[1].trim().split(/\s+/).map(Number);
  assert(box?.length===4&&box.every(Number.isFinite)&&box[2]>0&&box[3]>0,'Invalid SVG viewBox.');
  const heightMm=Number(svg.match(/\bheight="([\d.]+)mm"/)?.[1]);
  const widthMm=Number(svg.match(/\bwidth="([\d.]+)mm"/)?.[1]);
  assert.equal(heightMm,280,'Owner source height must remain 28 cm.');
  assert(widthMm>0,'Missing physical width.');
  const standalone=svg.replace(links[0][0],`xlink:href="data:image/png;base64,${png.toString('base64')}"`);
  const restored=Buffer.from(standalone.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/)[1],'base64');
  assert(restored.equals(png),'Packaging changed the original pixels.');
  return {standalone,meta:{digit:String(digit),format:'svg_with_embedded_png',pixel_width:width,pixel_height:height,width_cm:widthMm/10,height_cm:heightMm/10,effective_vertical_dpi:Number((height/(heightMm/25.4)).toFixed(2)),png_sha256:sha256(png),svg_sha256:sha256(Buffer.from(svg)),standalone_sha256:sha256(Buffer.from(standalone))}};
}

export async function prepareDirectory(input) {
  const inputRoot=await fs.realpath(path.resolve(input));
  const output=await fs.mkdtemp(path.join(os.tmpdir(),'zero19-brasil-numbers-'));
  const entries=[];
  for(let digit=0;digit<=9;digit++) {
    const svgPath=path.join(inputRoot,`numero ${digit}.svg`);
    const pngPath=path.join(inputRoot,`numero ${digit}_Images`,`numero ${digit}_ImgID1.png`);
    for(const file of [svgPath,pngPath])assert((await fs.realpath(file)).startsWith(inputRoot+path.sep),'Source dependency escaped its directory.');
    const svgBytes=await fs.readFile(svgPath),png=await fs.readFile(pngPath);
    const {standalone,meta}=packageDigit(svgBytes.toString('utf8'),png,digit);
    const dir=path.join(output,String(digit));await fs.mkdir(dir);
    await fs.copyFile(svgPath,path.join(dir,'original.svg'));
    await fs.mkdir(path.join(dir,`numero ${digit}_Images`));
    await fs.copyFile(pngPath,path.join(dir,`numero ${digit}_Images`,`numero ${digit}_ImgID1.png`));
    await fs.copyFile(pngPath,path.join(dir,'production-original.png'));
    await fs.writeFile(path.join(dir,'standalone.svg'),standalone);
    assert.equal(sha256(await fs.readFile(svgPath)),sha256(svgBytes));
    assert.equal(sha256(await fs.readFile(pngPath)),meta.png_sha256);
    entries.push(meta);
  }
  const manifest={version:1,created_at:new Date().toISOString(),status:'PREPARED_NOT_UPLOADED',preserve_original_colours:true,notes:'These SVGs contain raster PNGs, not editable vector paths. Do not recolour or replace historical font sets. Checkout pricing and number range require owner confirmation.',entries};
  await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
  await fs.writeFile(path.join(output,'preview.html'),`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Números Brasil — conferência</title><style>body{font:16px system-ui;margin:20px;background:#fafaf5;color:#152b25}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:16px}article{padding:16px;background:white;border:1px solid #d9e4db;border-radius:16px}img{display:block;width:100%;height:280px;object-fit:contain}h1{font-size:24px}</style><h1>Números Brasil · originais completos</h1><p>Pacote local de conferência. Não publicado para compra.</p><main>${entries.map(e=>`<article><b>Número ${e.digit}</b><img alt="Número ${e.digit}" src="${e.digit}/standalone.svg"><p>${e.height_cm} cm · ${e.effective_vertical_dpi} DPI de origem</p></article>`).join('')}</main></html>`);
  return {output,manifest,preview:path.join(output,'preview.html')};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  assert(process.argv[2],'Usage: node scripts/prepare-brasil-numbers.mjs <owner-source-directory>');
  const result=await prepareDirectory(process.argv[2]);
  console.log(JSON.stringify({output:result.output,preview:result.preview,status:result.manifest.status,digits:result.manifest.entries.map(e=>({digit:e.digit,height_cm:e.height_cm,dpi:e.effective_vertical_dpi}))}));
}
