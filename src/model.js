const billTones = [
  ['#28614f','#d5e9db'], ['#944c60','#f6e0e6'], ['#856035','#f2e6cf'],
  ['#2c637e','#d7ebf3'], ['#624b82','#e9dff3'], ['#965938','#f5e2d3'],
  ['#526b39','#e9f0d9'], ['#4e6063','#e3eaeb']
];
export const MAX_QUANTITY = 999999;
export const MAX_EXPECTED = 1_000_000_000_000;
export const MAX_PNG = 450 * 1024;
export const denominations = [
  ...[1000,500,200,100,50,20,10,5].map((value, i) => ({
    id: 'b' + value, cents: value * 100, kind: 'bill', label: 'C$ ' + value.toLocaleString('en-US'), mark: value >= 1000 ? '1K' : value, tone: billTones[i]
  })),
  ...[500,100,1000,50,25,10,5].map(cents => ({
    id: 'm' + cents, cents, kind: 'coin',
    label: cents >= 100 ? 'C$ ' + cents / 100 : cents + ' ¢', mark: cents >= 100 ? cents / 100 : cents, tone: ['#7d673a','#f1e9d2'],
    extra: cents !== 500 && cents !== 100
  }))
];
const currency = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integers = new Intl.NumberFormat('en-US');
export const money = cents => 'C$ ' + currency.format(cents / 100);
export const quantity = value => integers.format(value);
export const today = (date = new Date()) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return date.getFullYear() + '-' + month + '-' + day;
};
export const showDate = date => date.split('-').reverse().join('/');
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01') return false;
  const date = new Date(value);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}
export function parseExpected(value) {
  let text = value.trim();
  if (!text) return null;
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(text)) text = text.replaceAll(',', '');
  else if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(text)) text = text.replaceAll('.', '').replace(',', '.');
  else if (/^\d+(,\d{1,2})?$/.test(text)) text = text.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return undefined;
  const [whole, decimal = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents <= MAX_EXPECTED ? cents : undefined;
}
export function emptyDraft() {
  return { id: null, name: '', destination: '', notes: '', date: today(), expected: '', counts: {} };
}
export function summarize(counts) {
  const result = { total: 0, billTotal: 0, coinTotal: 0, billPieces: 0, coinPieces: 0, billKinds: 0, coinKinds: 0, rows: [] };
  for (const denom of denominations) {
    const count = counts[denom.id] ?? 0;
    if (!count) continue;
    const subtotal = count * denom.cents;
    result.total += subtotal;
    result[denom.kind + 'Total'] += subtotal;
    result[denom.kind + 'Pieces'] += count;
    result[denom.kind + 'Kinds']++;
    result.rows.push({ ...denom, count, subtotal });
  }
  return result;
}
export function asRecord(draft, now = new Date().toISOString()) {
  if (!validDate(draft.date)) throw new Error('Revisá la fecha del conteo.');
  const expectedCents = parseExpected(draft.expected);
  if (expectedCents === undefined) throw new Error('Revisá el monto previsto. Usá hasta dos decimales.');
  const counts = {};
  for (const { id } of denominations) {
    const count = draft.counts[id] ?? 0;
    if (!Number.isSafeInteger(count) || count < 0 || count > MAX_QUANTITY) throw new Error('Hay una cantidad de efectivo inválida.');
    if (count) counts[id] = count;
  }
  if (!Object.keys(counts).length) throw new Error('Ingresá al menos un billete o moneda.');
  return {
    id: draft.id || crypto.randomUUID(),
    name: draft.name.trim() || 'Conteo sin nombre',
    destination: draft.destination.trim(),
    notes: draft.notes.trim(),
    date: draft.date,
    expectedCents,
    counts,
    total: summarize(counts).total,
    updatedAt: now
  };
}
export function asDraft(record) {
  return {
    id: record.id, name: record.name, destination: record.destination, notes: record.notes,
    date: record.date, expected: record.expectedCents === null ? '' : (record.expectedCents / 100).toFixed(2),
    counts: Object.fromEntries(denominations.filter(({id}) => record.counts[id]).map(({id}) => [id, record.counts[id]]))
  };
}
export function normalized(text) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}
export function receiptName(record, ext = 'png') {
  const name = normalized(record.name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'conteo';
  return record.date + '_' + name + '_' + record.id.slice(0, 8) + '.' + ext;
}
export function legacyDraft(source) {
  if (!source || typeof source !== 'object' || typeof source.name !== 'string' || typeof source.note !== 'string' ||
      source.name.length > 100 || source.note.length > 1000 || !source.counts || (source.expected !== '' &&
      (typeof source.expected !== 'number' || parseExpected(String(source.expected)) === undefined))) throw new Error('El respaldo del HTML contiene un conteo inválido.');
  const draft = emptyDraft();
  draft.name = source.name;
  draft.notes = source.note;
  draft.expected = String(source.expected);
  for (const value of [1000,500,200,100,50,20,10]) {
    const count = source.counts[value];
    if (!Number.isSafeInteger(count) || count < 0 || count > MAX_QUANTITY) throw new Error('El respaldo contiene una cantidad inválida.');
    if (count) draft.counts['b' + value] = count;
  }
  if (source.createdAt) {
    const date = new Date(source.createdAt);
    if (!Number.isFinite(+date)) throw new Error('El respaldo contiene una fecha inválida.');
    draft.date = today(date);
  }
  return draft;
}
export async function legacyId(id) {
  if (typeof id !== 'string' || !id || id.length > 200) throw new Error('Identificador inválido en el respaldo.');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('mi-conteo-nio:' + id));
  return 'legacy-' + [...new Uint8Array(bytes)].slice(0, 16).map(byte => byte.toString(16).padStart(2, '0')).join('');
}
