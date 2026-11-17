// Cartões da equipe. Aplicar depois do v103 preserva as etapas anteriores do build.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const read = file => fs.readFileSync(path.join(dist, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(dist, file), content);
if (!read('index.html').includes('content="2.17.103"')) throw new Error('v104 exige a base 2.17.103.');

let sync = read('zero19-pdv-sync.js');
function update(before, after) {
  if (sync.split(before).length !== 2) throw new Error('v104: trecho ausente ou duplicado: ' + before);
  sync = sync.replace(before, () => after);
}

update('import {queueHeadHTML,', 'import {queueCustomerName,queueCustomerHTML,queueCountLabel,queueHeadHTML,');
update("<h3>'+h(w.client_name||w.company_name||'Cliente')+'</h3><small>'+h(w.phone||'Sem WhatsApp')+",
  "'+queueCustomerHTML(queueCustomerName(summary),summary.queue?.source_customer_name,true)+'<small>'+(summary.queue?.source_customer_name&&w.phone?'Contato da Venduss · ':'')+h(w.phone||'Sem WhatsApp')+");
update("[orderNo(row.project),row.workspace?.client_name,", "[orderNo(row.project),queueCustomerName(row),row.workspace?.client_name,");
update("<span>'+h(w.client_name||w.company_name||'Cliente')+'</span><span>'+qty",
  "'+queueCustomerHTML(queueCustomerName(summary),summary.queue?.source_customer_name)+'<span>'+qty");
update("<b>'+h(row.customer_name||'Cliente')+'</b><span class=\"phone\">'+h(row.whatsapp||'Sem WhatsApp')+",
  "'+queueCustomerHTML(row.source_customer_name||row.customer_name,row.source_customer_name)+'<span class=\"phone\">'+(row.source_customer_name&&row.whatsapp?'Contato da Venduss · ':'')+h(row.whatsapp||'Sem WhatsApp')+");
update("data?rows.length+' pedido(s) em aberto':''", "data?queueCountLabel(rows):''");
update("return '<div class=\"z19-flow\">'+chips.join('')+'</div>';",
  "if(flow.shipping_adjustment_note)chips.push('<p class=\"z19q-adjustment\">'+h(flow.shipping_adjustment_note)+'</p>');\n    return '<div class=\"z19-flow\">'+chips.join('')+'</div>';");
write('zero19-pdv-sync.js', sync);

function renew(directory) {
  for (const entry of fs.readdirSync(path.join(dist, directory), {withFileTypes:true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (directory || entry.name === 'vetor') renew(file);
    } else if (/\.(js|css|html)$/.test(entry.name)) {
      const original = read(file);
      const updated = original.replace(/\b2\.17\.103\b/g, '2.17.104');
      if (updated !== original) write(file, updated);
    }
  }
}
renew('');
for (const file of ['zero19-pdv-sync.js', 'zero19-production-queue.js']) {
  execFileSync(process.execPath, ['--check', path.join(dist, file)], {stdio:'inherit'});
}
console.log('019 2.17.104 · Nome do comprador nos cartões da produção.');
