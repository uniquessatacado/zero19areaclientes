// 2.17.101 (14/11, dono: "subi o halftone mas a arte em produção, quando adiciono no filme, vem normal sem halftone").
// O pedido já apontava para o halftone (metadata.art_override_asset_id, migração 20261114210000), mas ao pôr no filme o 019 usava o
// arquivo da receita do pedido (o original). Com a arte substituta da mesma estampa, o filme usa o arquivo e o armazenamento dela,
// na mesma largura do pedido (altura pela proporção do halftone).
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.100"'))throw new Error('v101 exige a base 2.17.100.');
let src=read('zero19-pdv-sync.js');
const once=(a,b)=>{const c=src.split(a).length-1;if(c!==1)throw new Error('v101: trecho ('+c+'×): '+a.slice(0,80));src=src.replace(a,b);};
once("const production=item.metadata?.details?.[0]?.production||{},width=Number(production.width_cm),height=Number(production.height_cm);",
 "const production=item.metadata?.details?.[0]?.production||{},width=Number(production.width_cm);let height=Number(production.height_cm);");
once("const storageBucket=production.storage_bucket||asset.data.metadata?.storage_bucket||'z19p-assets';",
 "const halftoneOverride=item.metadata?.art_override_asset_id===item.asset_id&&Boolean(asset.data.processed_path||asset.data.original_path);if(halftoneOverride&&asset.data.width>0&&asset.data.height>0)height=Math.round(width*asset.data.height/asset.data.width*1000)/1000;const storageBucket=halftoneOverride?(asset.data.metadata?.storage_bucket||'z19p-assets'):(production.storage_bucket||asset.data.metadata?.storage_bucket||'z19p-assets');");
once("const filmAsset={...asset.data,processed_path:production.file_path||asset.data.processed_path,",
 "const filmAsset={...asset.data,processed_path:halftoneOverride?(asset.data.processed_path||asset.data.original_path):(production.file_path||asset.data.processed_path),");
write('zero19-pdv-sync.js',src);
const files=fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n));
(function walk(dir){for(const e of fs.readdirSync(path.join(dist,dir),{withFileTypes:true})){const rel=path.join(dir,e.name);if(e.isDirectory())walk(rel);else if(/\.(js|css)$/.test(e.name))files.push(rel);}})('vetor');
for(const name of files)write(name,read(name).replace(/\b2\.17\.100\b/g,'2.17.101'));
if(!read('index.html').includes('content="2.17.101"'))throw new Error('v101: versão não renovada.');
execFileSync(process.execPath,['--check',path.join(dist,'zero19-pdv-sync.js')],{stdio:'inherit'});
console.log('019 2.17.101: estampa do site com halftone vai para o filme com o arquivo halftone.');
