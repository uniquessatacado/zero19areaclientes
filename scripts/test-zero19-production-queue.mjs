// 2.17.90 (05/11, dono): regras da fila de produção na tela do 019 (zero19-production-queue.js). Só regra, sem banco.
// Uso: node scripts/test-zero19-production-queue.mjs
import assert from 'node:assert/strict';
import {queueDue, sortByQueue, missingParts, originInfo, matchesOrigin, queueHeadHTML, spKey, dayLabel} from '../zero19-production-queue.js';

const now = new Date('2026-11-05T15:00:00-03:00'); // quinta 15h
assert.equal(spKey(now), '2026-11-05');
assert.equal(dayLabel('2026-11-06'), 'Sex, 06/11');

// Origem: PDV · LOJA, SITE, VENDUSS.
assert.equal(originInfo({origin: 'PDV'}).label, 'PDV · LOJA');
assert.equal(originInfo({origin: 'site'}).key, 'site');
assert.equal(originInfo({origin: 'VENDUSS'}).label, 'VENDUSS');
assert.equal(originInfo(null), null);

// Retirada: dia e hora; hoje = laranja, amanhã = amarelo, vencida = atrasado.
assert.deepEqual(queueDue({kind: 'PICKUP', pickup: true, due_at: '2026-11-05T21:00:00Z'}, now), {title: 'Retirada', main: 'Hoje 18h', note: '', tone: 'today'});
assert.equal(queueDue({kind: 'PICKUP', pickup: true, due_at: '2026-11-06T17:30:00Z'}, now).main, 'Amanhã 14h30');
assert.equal(queueDue({kind: 'PICKUP', pickup: true, due_at: '2026-11-06T17:30:00Z'}, now).tone, 'soon');
const late = queueDue({kind: 'PICKUP', pickup: true, due_at: '2026-11-03T21:00:00Z'}, now);
assert.equal(late.tone, 'late'); assert.match(late.title, /^Atrasado/); assert.equal(late.note, 'era Ter, 03/11');

// Envio: enviar até o último dia de postar, com o frete e quando o cliente espera.
const send = queueDue({kind: 'SEND_BY', pickup: false, send_by: '2026-11-09', cutoff_hour: 18, freight_name: 'J&T Express', customer_date: '2026-11-11'}, now);
assert.deepEqual(send, {title: 'Enviar até', main: 'Seg, 09/11 até 18h', note: 'J&T Express · cliente espera Qua, 11/11', tone: 'ok'});
const sendLate = queueDue({kind: 'SEND_LATE', pickup: false, dispatch: '2026-11-05', last_post: '2026-11-02', cutoff_hour: 18, freight_name: 'PAC'}, now);
assert.equal(sendLate.title, 'Atrasado · enviar já'); assert.equal(sendLate.main, 'Hoje até 18h'); assert.match(sendLate.note, /^era até Seg, 02\/11 · PAC/); assert.equal(sendLate.tone, 'late');
assert.equal(queueDue({kind: 'SEND_UNKNOWN', pickup: false, dispatch: '2026-11-06', cutoff_hour: 19}, now).main, 'Amanhã até 19h');
// Data alterada pela equipe (com a senha): vale como está.
const manualShip = queueDue({kind: 'MANUAL', pickup: false, due_at: '2026-11-10T15:00:00Z', freight_name: 'SEDEX'}, now);
assert.equal(manualShip.title, 'Enviar até · data alterada'); assert.equal(manualShip.main, 'Ter, 10/11 12h');
assert.equal(queueDue({kind: 'MANUAL', pickup: true, due_at: '2026-11-10T15:00:00Z'}, now).title, 'Retirada · data alterada');

// O que falta: soma as peças por etapa; entregue/cancelado não contam.
assert.deepEqual(missingParts([{stage: 'awaiting_art', quantity: 2}, {stage: 'awaiting_art', quantity: 1}, {stage: 'ready_production', quantity: 3}, {stage: 'cancelled', quantity: 9}]).map(p => p.label + ' ' + p.count),
  ['Falta subir arte 3', 'Pronta · falta jogar no filme 3']);

// Ordem: posição da fila; pronto para retirada depois; sem posição fica na ordem antiga, depois dos que têm.
const rows = [
  {id: 'pronto', stage: 'ready_pickup', queue: null},
  {id: 'c', stage: 'awaiting_art', queue: {position: 3}},
  {id: 'sem', stage: 'awaiting_art', queue: null},
  {id: 'a', stage: 'production', queue: {position: 1}},
  {id: 'b', stage: 'ready_production', queue: {position: 2}},
];
assert.deepEqual(sortByQueue(rows).map(r => r.id), ['a', 'b', 'c', 'sem', 'pronto']);
assert.equal(rows[0].id, 'pronto', 'não mexe na lista original');

// Filtro de origem.
assert.equal(matchesOrigin({queue: {origin: 'PDV'}}, 'pdv'), true);
assert.equal(matchesOrigin({queue: {origin: 'SITE'}}, 'pdv'), false);
assert.equal(matchesOrigin({queue: null}, 'all'), true);

// Cabeçalho do cartão: escapa o texto e mostra "Em espera" para pedido parado no QR.
const head = queueHeadHTML({queue: {position: 4, origin: 'SITE', kind: 'SEND_BY', send_by: '2026-11-09', cutoff_hour: 18, freight_name: '<b>X</b>'}}, now);
assert.match(head, /Nº 4/); assert.match(head, /SITE/); assert.ok(!head.includes('<b>X</b>'));
assert.match(queueHeadHTML({queue: {position: 9, origin: 'PDV', kind: 'PICKUP', pickup: true, due_at: '2026-11-06T21:00:00Z', held_until: '2026-11-06T12:00:00Z'}}, now), /Em espera/);
assert.equal(queueHeadHTML({queue: null}), '');
console.log('PASS fila de produção do 019: origem, prazo (retirada, enviar até, atrasado, data alterada), o que falta, ordem e filtro.');
