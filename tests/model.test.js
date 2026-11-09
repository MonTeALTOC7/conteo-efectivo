import assert from 'node:assert/strict';
import test from 'node:test';
import { asRecord, emptyDraft, legacyDraft, legacyId, money, parseExpected, receiptName, summarize, validDate } from '../src/model.js';

test('billetes y monedas de C$ 10 se calculan y muestran por separado', () => {
  const total = summarize({b1000: 2, b500: 3, b10: 1, m1000: 2, m25: 3, m5: 3});
  assert.equal(total.billTotal, 351000);
  assert.equal(total.coinTotal, 2090);
  assert.equal(total.total, 353090);
  assert.equal(total.billPieces, 6);
  assert.equal(total.coinPieces, 8);
  assert.equal(money(total.total), 'C$ 3,530.90');
});
test('monto previsto conserva centavos y admite separadores de uso común', () => {
  for (const input of ['3530.9','3530,90','3,530.90','3.530,90']) assert.equal(parseExpected(input), 353090);
  assert.equal(parseExpected(''), null);
  assert.equal(parseExpected('0'), 0);
  assert.equal(parseExpected('1,200'), 120000);
  for (const input of ['-1','1e3','0.005','1.2345','10000000000.01','1,2.3']) assert.equal(parseExpected(input), undefined);
});
test('valida fechas reales, límites y campos del conteo', () => {
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2026-11-31'), false);
  assert.throws(() => asRecord(emptyDraft()), /billete o moneda/);
  assert.throws(() => asRecord({...emptyDraft(), counts:{b1000: 1000000}}), /cantidad/);
  assert.throws(() => asRecord({...emptyDraft(), counts:{m5: 1}, expected:'1e3'}), /monto previsto/);
  const record = asRecord({...emptyDraft(), id:'abcdef00-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name:' Págó Banpró ', date:'2026-11-08', counts:{m5:1}, expected:'0.05'});
  assert.equal(record.name, 'Págó Banpró');
  assert.equal(record.total, 5);
  assert.equal(record.expectedCents, 5);
  assert.equal(receiptName(record), '2026-11-08_pago-banpro_abcdef00.png');
});
test('legado convierte cantidades y notas, conserva fecha e IDs estables', async () => {
  const draft = legacyDraft({name:'Banco', note:'Retiro', expected:10.75, createdAt:'2026-11-08T15:00:00Z', counts:{10:1,20:0,50:0,100:0,200:0,500:0,1000:0}});
  assert.deepEqual(draft.counts, {b10:1});
  assert.equal(draft.expected, '10.75');
  assert.equal(draft.notes, 'Retiro');
  assert.equal(draft.date, '2026-11-08');
  assert.match(await legacyId('conteo-1'), /^legacy-[0-9a-f]{32}$/);
  assert.equal(await legacyId('conteo-1'), await legacyId('conteo-1'));
  assert.notEqual(await legacyId('conteo-1'), await legacyId('conteo-2'));
});
