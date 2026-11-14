// 2.17.98 on top of 2.17.97 (14/11, dono: "o 019 não está gerando o TIFF, não carrega, fica bugado e não gera").
// (1) PNG e TIFF de filme a partir de 160 MB (ex.: 58 × 52 cm) são feitos em faixas (film-band-export.js, needsBandedFilm):
//     o filme inteiro numa imagem só (58 × 120 cm = 390 MB, e o TIFF precisava de duas, mais a arte aberta) fazia o Chrome
//     travar ou fechar a aba em computador com pouca memória. Mesmo tempo, mesmo arquivo (no máximo 1 nível de cor de diferença
//     em algum pixel, como já acontecia nos filmes longos).
// (2) Arquivos internos saem do site: RODAR_NO_SUPABASE_*.sql, political_checkout_*.sql e a pasta docs/ estavam públicos.
// (3) Vai junto o filtro "GTA VI" do Montar no estúdio do filme (commit de 13/11).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.97"'))throw new Error('v98 exige a base 2.17.97.');
if(!read('film-band-export.js').includes('FILM_BAND_MIN_BYTES=160e6'))throw new Error('v98: film-band-export.js sem as faixas a partir de 160 MB.');
if(!read('film-studio.js').includes("['GTA6','GTA VI']"))throw new Error('v98: filtro GTA VI ausente no film-studio.js.');
let removed=0;
for(const name of fs.readdirSync(dist))if(/\.(sql|md)$/i.test(name)){fs.rmSync(path.join(dist,name));removed++;}
if(fs.existsSync(path.join(dist,'docs'))){fs.rmSync(path.join(dist,'docs'),{recursive:true});removed++;}
const files=fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n));
(function walk(dir){for(const e of fs.readdirSync(path.join(dist,dir),{withFileTypes:true})){const rel=path.join(dir,e.name);if(e.isDirectory())walk(rel);else if(/\.(js|css)$/.test(e.name))files.push(rel);}})('vetor');
for(const name of files)write(name,read(name).replace(/\b2\.17\.97\b/g,'2.17.98'));
if(!read('index.html').includes('content="2.17.98"'))throw new Error('v98: versão não foi renovada.');
for(const name of ['production-v217.js','film-spot-export.js'])if(!read(name).includes('film-band-export.js?v=2.17.98'))throw new Error('v98: cache do film-band-export.js não foi renovado em '+name+'.');
for(const name of ['app.js','production-v217.js','film-band-export.js','film-spot-export.js','film-studio.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
if(fs.readdirSync(dist).some(n=>/\.sql$/i.test(n)))throw new Error('v98: ainda há SQL no site.');
console.log('019 2.17.98: PNG/TIFF em faixas a partir de 160 MB (não trava em PC com pouca memória); '+removed+' arquivos internos fora do site.');
