import fs from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const OLD_ROOT = 'https://raw.githubusercontent.com/uniquessatacado/venduss/019-personalizacoes-assets/019-personalizacoes-assets/';
const V28 = ['v28/v28-p0.txt','v28/v28-p1.txt','v28/v28-p2.txt','v28/v28-p3.txt','v28/v28-p4.txt','v28/v28-p5.txt','v28/v28-p6.txt','v28/v28-tail.txt'];

async function text(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status} ao buscar ${url}`);
  return (await r.text()).trim();
}
function ungzipB64(v) {
  return gunzipSync(Buffer.from(v, 'base64')).toString('utf8');
}

const baseB64 = (await Promise.all(V28.map(p => text(OLD_ROOT + p)))).join('');
const payload = JSON.parse(ungzipB64(baseB64));
const patch = JSON.parse(ungzipB64(await text(OLD_ROOT + 'v29/v29-patch.gz.b64')));
let lines = payload.js.split('\n');
for (const op of [...patch.ops].sort((a,b) => b.i1 - a.i1)) {
  lines.splice(op.i1, op.i2 - op.i1, ...op.lines);
}
let js = lines.join('\n');
const css = payload.css + (patch.css_append || '');

const oldReturn = "  return `👕 *Demonstrações de qualidade — Zero 19*\\n\\nOlá, *${client}*! Aqui é ${seller}. Separei algumas demonstrações para você conhecer melhor nossas opções:\\n\\n${blocks}\\n\\nSe quiser, me chama por aqui que eu te ajudo a escolher a melhor opção. 🙂`;";
const newReturn = "  return `👕 *Demonstrações de qualidade — Zero 19*\\n\\nOlá, *${client}*! Aqui é ${seller}. Separei algumas demonstrações de qualidade para você conhecer melhor as opções:\\n\\n${videos.map((a,i)=>{const desc=videoDemoDescription(a)||a.name,link=videoDemoLink(a);return `🎥 *${i+1}. ${a.name}*\\n${desc}\\n\\n👉 *Clique no link abaixo para assistir ao vídeo da demonstração de qualidade — ${desc}:*\\n${link}`;}).join('\\n\\n')}\\n\\nSe quiser, me chama por aqui que eu te ajudo a escolher a melhor opção. 🙂`;";
if (!js.includes(oldReturn) && !js.includes(newReturn)) throw new Error('Trecho do WhatsApp não encontrado na base v2.9');
js = js.replace(oldReturn, newReturn);

await fs.writeFile('app.js', js + '\n');
await fs.writeFile('styles.css', css + '\n');

let demo = await text('https://019-personalizacoes.vercel.app/demo.html');
demo = demo.replace('preload="metadata"', 'preload="auto"');
await fs.writeFile('demo.html', demo + '\n');

const index = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#0b0b0d">
  <meta name="color-scheme" content="dark">
  <meta name="z19-version" content="2.10">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <title>019 Personalizações</title>
  <link rel="stylesheet" href="/styles.css?v=2.10">
</head>
<body>
  <div id="app"><div style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#09090b;color:#fff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><b>Carregando 019 Personalizações…</b></div></div>
  <div id="toast-root" aria-live="polite"></div>
  <script type="module">
    import('/app.js?v=2.10').catch((error) => {
      console.error(error);
      document.getElementById('app').innerHTML = '<div style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#09090b;color:#fff;font-family:system-ui"><div style="text-align:center"><h2>Não foi possível iniciar o sistema</h2><p style="color:#9797a4">'+String(error?.message||error)+'</p><button onclick="location.reload()" style="border:0;border-radius:12px;background:#ff5a1f;color:#111;font-weight:800;padding:12px 18px">Tentar novamente</button></div></div>';
    });
  </script>
</body>
</html>`;
await fs.writeFile('index.html', index + '\n');

await fs.writeFile('vercel.json', JSON.stringify({headers:[
  {source:'/index.html',headers:[{key:'Cache-Control',value:'no-store, max-age=0'}]},
  {source:'/app.js',headers:[{key:'Cache-Control',value:'no-cache, max-age=0, must-revalidate'}]},
  {source:'/styles.css',headers:[{key:'Cache-Control',value:'no-cache, max-age=0, must-revalidate'}]},
  {source:'/demo.html',headers:[{key:'Cache-Control',value:'no-cache, max-age=0, must-revalidate'}]}
]}, null, 2) + '\n');

const oldMemory = await text(OLD_ROOT + 'PROJECT_MEMORY.md');
const preface = `# REGRA CANÔNICA A PARTIR DA v2.10\n\n- Repositório fonte de verdade: **uniquessatacado/zero19areaclientes**, branch **main**.\n- Antes de qualquer alteração: ler este arquivo inteiro.\n- Toda alteração: registrar versão aqui, alterar, validar preview, commitar e só então publicar produção.\n- Toda correção de bug deve registrar: causa, correção e prevenção.\n- Não reintroduzir loader com gzip/base64/DecompressionStream para iniciar o app. Isso causou Failed to decode data / Failed to fetch.\n- Rollback deve ser feito por commit conhecido deste repositório.\n\n`;
const v210 = `\n\n### v2.10 — GitHub como fonte de verdade + boot estático\n- Repositório oficial movido para uniquessatacado/zero19areaclientes.\n- Causa do erro: v2.9 iniciava via chunks compactados e DecompressionStream no navegador; alguns navegadores retornaram Failed to decode data.\n- Correção: index.html simples carrega styles.css e app.js diretamente, sem chunks, sem gzip/base64 e sem buscar deployment antigo.\n- Cache de index/app/css/demo desabilitado durante estabilização.\n- Vídeos preservados: biblioteca, descrição, seleção múltipla, WhatsApp e preview público com download.\n- Mensagem do WhatsApp passa a listar cada demonstração com descrição e link individual.\n- demo.html usa o arquivo original e preload=auto.\n- Regra permanente: nenhuma produção sem commit correspondente e sem leitura prévia deste arquivo.\n`;
await fs.writeFile('PROJECT_MEMORY.md', preface + oldMemory + v210 + '\n');

console.log('v2.10 reconstruída com sucesso');
