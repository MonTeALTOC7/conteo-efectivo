import './style.css';
import { asDraft, asRecord, denominations, emptyDraft, legacyDraft, legacyId, MAX_PNG, MAX_QUANTITY, money, normalized, parseExpected, quantity, receiptName, showDate, summarize, today } from './model.js';
import './personal-card.js';
import { createPdf, createPng } from './receipt.js';
import { adoptGuest, changeLocal, importLocal, listLocal, mergeRemote, readDraft, writeDraft } from './store.js';
import { configured, connectAccount, connectTestAccount, disconnectAccount, emulator, fetchPng, observeAccount, observeHistory, push, SyncConflict } from './cloud.js';

const icons = {
  wallet:'<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 9V7a2 2 0 0 1 2-2l11-3M21 11h-5a2 2 0 1 0 0 4h5m-4-2h.01"/>',
  grid:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  history:'<path d="M3 12a9 9 0 1 1 2.8 6.5M3 12V6m0 6h6m3-5v5l3 2"/>',
  cloud:'<path d="M6.5 18h11a4 4 0 0 0 .6-7.95 6.1 6.1 0 0 0-11.7-1.6A4.8 4.8 0 0 0 6.5 18z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  bills:'<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M7 7V4h10m-9 9h.01M16 13h.01"/><circle cx="12" cy="13" r="2"/>',
  coin:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7v10m2.5-8h-3.8a1.5 1.5 0 1 0 0 3h2.6a1.5 1.5 0 1 1 0 3H9.5"/>',
  chevron:'<path d="m6 9 6 6 6-6"/>',
  tag:'<path d="M3 4h8l10 10-7 7L3 11z"/><circle cx="8" cy="9" r="1"/>',
  check:'<path d="m5 12 4 4 10-10"/>',
  image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m3 17 5-4 3 2 4-5 6 7"/>',
  search:'<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/>',
  download:'<path d="M12 4v11m-4-4 4 4 4-4M5 16v4h14v-4"/>',
  shield:'<path d="M12 22S4 18 4 11V5l8-3 8 3v6c0 7-8 11-8 11z"/><path d="m9 12 2 2 4-4"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  share:'<path d="M12 15V3m-4 4 4-4 4 4M5 13v7h14v-7"/>'
};
const $ = id => document.getElementById(id);
const dom = (tag, text, cls) => {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (cls) element.className = cls;
  return element;
};
function icon(element) {
  element.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[element.dataset.icon] + '</svg>';
}
document.querySelectorAll('[data-icon]').forEach(icon);
let profile = 'guest';
let user = null;
let draft = emptyDraft();
let records = [];
let remoteRecords = new Map();
let stopHistory;
let view = 'count';
let syncRun;
let retryAt = 0;
let generation = 0;
let accountReady = false;
let toastTimer;
let sheetVersion = 0;
let objectUrl;
let installPrompt;
let saving = false;
let editingMutation = null;
let savedDraft = '';
const accountChanges = [];
const BACKUP_LIMIT = 64 * 1024 * 1024;
let applyingAccount = false;

function warn(message) {
  $('storageWarning').hidden = false;
  $('storageWarning').textContent = message;
}
function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => $('toast').hidden = true, 4200);
}
function localFailure(error) {
  console.error(error);
  warn('El navegador no pudo guardar los datos en este dispositivo. Revisá el espacio disponible y conservá una copia del PNG.');
}
function storeDraft() {
  return writeDraft(profile, structuredClone(draft)).catch(localFailure);
}
function button(label, action, kind = 'ghost', symbol) {
  const result = dom('button', '', 'button ' + kind);
  result.type = 'button';
  if (symbol) {
    const marker = dom('span');
    marker.dataset.icon = symbol;
    icon(marker);
    result.append(marker);
  }
  result.append(label);
  result.onclick = action;
  return result;
}
function showSheet(kicker, title) {
  sheetVersion++;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  $('sheetKicker').textContent = kicker;
  $('sheetTitle').textContent = title;
  $('sheetBody').replaceChildren();
  if (!$('sheet').open) $('sheet').showModal();
  return $('sheetBody');
}
function sheetButtons(...buttons) {
  const wrapper = dom('div', '', 'sheet-buttons');
  wrapper.append(...buttons);
  return wrapper;
}
function confirmSheet(title, message, action, label) {
  showSheet('CONFIRMAR', title).append(dom('p', message), sheetButtons(
    button('Cancelar', () => $('sheet').close()),
    button(label, () => { $('sheet').close(); action(); }, 'primary')
  ));
}
$('closeSheet').onclick = () => $('sheet').close();
$('sheet').addEventListener('close', () => {
  if ($('sheet').open) return;
  sheetVersion++;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
});
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = dom('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
}
function setView(target) {
  view = target;
  $('countView').hidden = target !== 'count';
  $('historyView').hidden = target !== 'history';
  for (const nav of document.querySelectorAll('[data-view]')) {
    if (nav.dataset.view === target) nav.setAttribute('aria-current', 'page');
    else nav.removeAttribute('aria-current');
  }
  $('miniTotal').hidden = true;
  if (target === 'history') renderHistory();
  window.scrollTo(0, 0);
}
for (const nav of document.querySelectorAll('[data-view]')) nav.onclick = () => setView(nav.dataset.view);
$('home').onclick = () => setView('count');
const heroObserver = new IntersectionObserver(([entry]) => {
  $('miniTotal').hidden = view !== 'count' || entry.isIntersecting || entry.boundingClientRect.top > 0;
}, { rootMargin: '-66px 0px 0px 0px' });
heroObserver.observe($('hero'));

const controls = new Map();
const billKinds = denominations.filter(item => item.kind === 'bill').length;
for (const denom of denominations) {
  const row = dom('div', '', 'denom-row');
  const label = dom('div', '', 'denom');
  const mark = dom('span', String(denom.mark), 'cash-mark ' + denom.kind);
  mark.style.setProperty('--tone', denom.tone[0]);
  mark.style.setProperty('--tint', denom.tone[1]);
  mark.setAttribute('aria-hidden', 'true');
  label.append(mark, denom.label);
  const qty = dom('div', '', 'quantity');
  const name = (denom.kind === 'bill' ? 'billetes de ' : 'monedas de ') + denom.label;
  const input = dom('input');
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.placeholder = '0';
  input.dataset.denom = denom.id;
  input.setAttribute('aria-label', 'Cantidad de ' + name);
  const dec = dom('button', '−');
  const inc = dom('button', '+');
  for (const [control, delta] of [[dec, -1], [inc, 1]]) {
    control.type = 'button';
    control.setAttribute('aria-label', (delta < 0 ? 'Restar ' : 'Sumar ') + name);
    control.onclick = () => {
      const next = Math.min(MAX_QUANTITY, Math.max(0, (draft.counts[denom.id] || 0) + delta));
      input.value = next || '';
      updateQuantity(denom.id, next);
    };
  }
  input.oninput = () => {
    if (!/^\d{0,6}$/.test(input.value)) {
      input.value = draft.counts[denom.id] || '';
      toast('Ingresá una cantidad entera entre 0 y 999,999.');
      return;
    }
    updateQuantity(denom.id, Number(input.value || '0'));
  };
  input.onfocus = () => input.select();
  input.onkeydown = event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const visible = [...controls.values()].map(value => value.input).filter(element => element.getClientRects().length);
    (visible[visible.indexOf(input) + 1] || $('countName')).focus();
  };
  qty.append(dec, input, inc);
  const subtotal = dom('div', 'C$ 0.00', 'subtotal zero');
  row.append(label, qty, subtotal);
  $(denom.kind === 'bill' ? 'bills' : denom.extra ? 'extraCoins' : 'coins').append(row);
  controls.set(denom.id, { row, input, subtotal, inc, dec, denom });
}
function updateQuantity(id, value) {
  if (value) draft.counts[id] = value;
  else delete draft.counts[id];
  renderSummary();
  storeDraft();
}
const fields = { countName: 'name', countDate: 'date', expected: 'expected', destination: 'destination', notes: 'notes' };
for (const [id, key] of Object.entries(fields)) {
  $(id).oninput = () => {
    draft[key] = $(id).value;
    renderSummary();
    storeDraft();
  };
}
$('detailsForm').onsubmit = event => event.preventDefault();
function renderSummary() {
  const total = summarize(draft.counts);
  for (const { denom, row, subtotal, dec, inc } of controls.values()) {
    const count = draft.counts[denom.id] || 0;
    row.dataset.active = Boolean(count);
    subtotal.textContent = money(count * denom.cents);
    subtotal.classList.toggle('zero', !count);
    dec.disabled = !count;
    inc.disabled = count >= MAX_QUANTITY;
  }
  $('total').textContent = money(total.total);
  $('total').classList.toggle('compact', $('total').textContent.length >= 14);
  $('miniAmount').textContent = money(total.total);
  $('billTotal').textContent = money(total.billTotal);
  $('coinTotal').textContent = money(total.coinTotal);
  $('billPieces').textContent = '· ' + quantity(total.billPieces);
  $('coinPieces').textContent = '· ' + quantity(total.coinPieces);
  $('activeBills').textContent = total.billKinds + ' de ' + billKinds;
  $('activeCoins').textContent = total.coinKinds ? quantity(total.coinPieces) + ' piezas · ' + money(total.coinTotal) : 'C$ 1 y C$ 5';
  const expected = parseExpected(draft.expected);
  const difference = $('difference');
  difference.hidden = expected === null;
  if (expected === undefined) {
    difference.dataset.state = 'invalid';
    difference.textContent = 'Ingresá un monto con hasta dos decimales.';
  } else if (expected !== null) {
    const delta = total.total - expected;
    difference.dataset.state = delta < 0 ? 'short' : 'ok';
    difference.textContent = delta === 0 ? 'El efectivo coincide con el monto previsto.' : (delta < 0 ? 'Faltan ' : 'Sobran ') + money(Math.abs(delta));
  }
  const unchanged = savedDraft === JSON.stringify(draft);
  $('save').disabled = !accountReady || saving || unchanged;
  $('saveLabel').textContent = unchanged ? 'Conteo guardado' : draft.id ? 'Actualizar conteo' : 'Guardar conteo';
  renderStatus();
}
function renderEditor() {
  for (const [id, key] of Object.entries(fields)) $(id).value = draft[key];
  for (const [id, {input}] of controls) input.value = draft.counts[id] || '';
  $('coinPanel').open = denominations.some(item => item.kind === 'coin' && draft.counts[item.id]);
  $('extraCoinsPanel').open = denominations.some(item => item.extra && draft.counts[item.id]);
  renderSummary();
}
function hasChanges() {
  return JSON.stringify(draft) !== savedDraft && (Object.keys(draft.counts).length || draft.name || draft.notes || draft.destination || draft.expected || draft.date !== today());
}
function replaceDraft(next, entry) {
  draft = next;
  editingMutation = entry?.record.mutation ?? null;
  draft.baseMutation = editingMutation;
  savedDraft = entry ? JSON.stringify(draft) : '';
  renderEditor();
  storeDraft();
}
function newCount() {
  const clear = () => {
    replaceDraft(emptyDraft());
    setView('count');
    if (matchMedia('(min-width: 680px)').matches) controls.get('b1000').input.focus();
  };
  if (hasChanges()) confirmSheet('Empezar un conteo nuevo', 'El borrador actual se reemplazará. Los conteos guardados seguirán en tu historial.', clear, 'Empezar');
  else clear();
}
$('newCount').onclick = $('historyNew').onclick = newCount;

const statusText = { synced: 'Guardado en la nube', pending: 'Pendiente de sincronizar', local: 'Guardado en el dispositivo', conflict: 'Revisar cambio de otro dispositivo' };
function renderStatus() {
  const pending = records.filter(entry => entry.status === 'pending').length;
  const conflict = records.some(entry => entry.status === 'conflict');
  $('account').dataset.state = user && navigator.onLine ? 'online' : 'local';
  $('accountLabel').textContent = user ? (pending ? 'Nube · ' + pending : 'Nube') : 'Nube';
  const active = records.find(entry => entry.record.id === draft.id);
  const unchanged = savedDraft === JSON.stringify(draft);
  let message = unchanged && active ? statusText[active.status] : 'Borrador en este dispositivo';
  if (user && pending && !navigator.onLine) message += ' · Sin conexión';
  if (conflict && !active) message += ' · Revisá el historial';
  $('draftStatus').textContent = message;
}
function matchesHistory(record, query) {
  return normalized([record.name || 'Conteo eliminado', record.destination || '', record.date || '', record.date ? showDate(record.date) : ''].join(' ')).includes(query);
}
function renderHistory() {
  const query = normalized($('search').value.trim());
  const list = records.filter(entry => !entry.record.deleted || entry.status === 'conflict')
    .filter(({record}) => matchesHistory(record, query))
    .sort((a, b) => (b.record.date || '').localeCompare(a.record.date || '') || b.record.updatedAt.localeCompare(a.record.updatedAt));
  const rows = list.map(entry => {
    const { record } = entry;
    const article = dom('article', '', 'history-card');
    const identity = dom('div');
    identity.append(dom('h3', record.name || 'Eliminación pendiente'), dom('p', [record.date && showDate(record.date), record.destination].filter(Boolean).join(' · ')));
    const badge = dom('p', statusText[entry.status], 'status-badge');
    badge.dataset.status = entry.status;
    article.append(identity, dom('strong', record.deleted ? '—' : money(record.total)), badge, button(entry.status === 'conflict' ? 'Revisar' : 'Ver conteo', () => showHistoryEntry(entry), 'secondary'));
    return article;
  });
  if (!rows.length) {
    const empty = dom('div', '', 'empty');
    empty.append(dom('strong', query ? 'Sin coincidencias' : 'Todavía no hay conteos'), dom('p', query ? 'Probá con otro nombre, destino o fecha.' : 'Tus conteos guardados aparecerán aquí.'));
    rows.push(empty);
  }
  $('historyList').replaceChildren(...rows);
}
$('search').oninput = renderHistory;

async function refreshLocal(expectedProfile = profile) {
  const list = await listLocal(expectedProfile);
  if (expectedProfile !== profile) return;
  records = list;
  renderStatus();
  if (view === 'history') renderHistory();
}
function newEntry(record, png, baseRevision = 0, owner = profile) {
  return { record: { ...record, revision: baseRevision + 1, mutation: crypto.randomUUID(), deleted: Boolean(record.deleted) },
    png, baseRevision, status: owner === 'guest' ? 'local' : 'pending' };
}
async function saveCount() {
  if (saving) return;
  let record;
  try { record = asRecord(draft); } catch (error) { toast(error.message); return; }
  const owner = profile;
  const activeDraft = draft;
  const formVersion = JSON.stringify(draft);
  const baseMutation = editingMutation;
  saving = true;
  renderSummary();
  try {
    const png = await createPng(record);
    if (owner !== profile) return;
    let committed;
    await changeLocal(owner, record.id, previous => {
      if (previous && (previous.record.mutation !== baseMutation || previous.status === 'conflict' || previous.record.deleted)) return;
      const base = previous?.status === 'synced' ? previous.record.revision : previous?.baseRevision || 0;
      committed = newEntry(record, png, base, owner);
      return committed;
    });
    if (!committed) {
      toast('El conteo cambió en otro dispositivo. Abrí su versión actual desde el historial.');
      return;
    }
    if (owner !== profile) return;
    if (activeDraft === draft && formVersion === JSON.stringify(draft)) replaceDraft(asDraft(record), committed);
    else if (activeDraft === draft) {
      draft.id = record.id;
      editingMutation = draft.baseMutation = committed.record.mutation;
      storeDraft();
    }
    await refreshLocal(owner);
    toast(owner === 'guest' ? 'Conteo y PNG guardados en el teléfono.' : 'Conteo y PNG guardados. Revisá el estado de sincronización.');
    sync();
  } catch (error) {
    toast(error.message || 'No se pudo guardar el conteo.');
  } finally {
    saving = false;
    renderSummary();
  }
}
$('save').onclick = saveCount;

async function getPng(entry) {
  const { record } = entry;
  if (entry.png) return entry.png;
  if (!user || !navigator.onLine) throw new Error('Conectate para abrir este PNG por primera vez en el dispositivo.');
  const owner = profile;
  const png = await fetchPng(user.uid, record.id, record.mutation);
  if (owner !== profile) throw new Error('La cuenta cambió. Abrí el conteo nuevamente.');
  await changeLocal(owner, record.id, latest => latest?.record.mutation === record.mutation ? { ...latest, png } : undefined);
  return png;
}
function showReceipt(record, imagePromise, original = false) {
  const body = showSheet('COMPROBANTE', 'PNG del conteo');
  const version = sheetVersion;
  const redesign = original ? [button('Diseño actual', () => showReceipt(record, createPng(record)))] : [];
  body.append(dom('p', 'Preparando la imagen…'));
  Promise.resolve(imagePromise).then(png => {
    if (version !== sheetVersion) return;
    const pngName = receiptName(record);
    const file = new File([png], pngName, { type: 'image/png' });
    const image = dom('img');
    objectUrl = URL.createObjectURL(png);
    image.src = objectUrl;
    image.alt = 'Conteo de efectivo de ' + record.name + ' por ' + money(record.total);
    const receiptStatus = dom('p', '');
    const share = button('Compartir', async () => {
      try {
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: record.name });
        } else {
          download(png, pngName);
          receiptStatus.textContent = 'PNG descargado. Adjuntalo en WhatsApp desde Descargas.';
        }
      } catch (error) {
        if (error.name !== 'AbortError') receiptStatus.textContent = 'Usá Descargar PNG y adjuntá el archivo en WhatsApp.';
      }
    }, 'secondary', 'share');
    const pdf = button('PDF', async () => {
      pdf.disabled = true;
      try { download(await createPdf(png), receiptName(record, 'pdf')); }
      catch { receiptStatus.textContent = 'No se pudo crear el PDF. El PNG sigue disponible.'; }
      finally { pdf.disabled = false; }
    });
    body.replaceChildren(sheetButtons(button('Descargar PNG', () => download(png, pngName), 'primary', 'download'), share, pdf, ...redesign),
      receiptStatus, image);
  }).catch(error => {
    if (version === sheetVersion) body.replaceChildren(dom('p', error.message || 'No se pudo abrir el PNG.'), ...redesign);
  });
}
$('preview').onclick = () => {
  try {
    const existing = savedDraft === JSON.stringify(draft) && records.find(entry => entry.record.id === draft.id);
    if (existing) showReceipt(existing.record, getPng(existing), true);
    else {
      const record = asRecord(draft);
      showReceipt(record, createPng(record));
    }
  } catch (error) { toast(error.message); }
};

function showHistoryEntry(entry) {
  const { record } = entry;
  const body = showSheet('HISTORIAL', record.name || 'Cambio pendiente');
  body.append(dom('p', record.date ? showDate(record.date) + ' · ' + money(record.total) : 'El registro cambió en otro dispositivo.'));
  if (record.destination) body.append(dom('p', 'Destino · ' + record.destination));
  if (record.notes) body.append(dom('p', record.notes));
  body.append(dom('p', statusText[entry.status]));
  if (entry.status === 'conflict') {
    const keep = button('Usar versión de la nube', () => resolveConflict(entry, false));
    if (record.deleted) body.append(sheetButtons(keep));
    else body.append(sheetButtons(button('Guardar mi versión como copia', () => resolveConflict(entry, true), 'primary'), keep));
    return;
  }
  const edit = () => {
    $('sheet').close();
    replaceDraft(asDraft(record), entry);
    setView('count');
  };
  body.append(sheetButtons(button('Abrir PNG', () => showReceipt(record, getPng(entry), true), 'primary', 'image'),
    button('Editar', () => {
      if (hasChanges()) confirmSheet('Abrir conteo guardado', 'Se reemplazará el borrador actual.', edit, 'Abrir');
      else edit();
    }), button('Eliminar', () => confirmSheet('Eliminar conteo', 'Se quitará del historial y se sincronizará el cambio cuando haya conexión.', () => deleteRecord(entry), 'Eliminar'))));
}
async function deleteRecord(entry) {
  const owner = profile;
  try {
    await changeLocal(owner, entry.record.id, previous => {
      if (previous?.record.mutation !== entry.record.mutation) return;
      if (owner === 'guest') return null;
      return { ...newEntry({ id: entry.record.id, updatedAt: new Date().toISOString(), deleted: true }, null,
        previous.status === 'synced' ? previous.record.revision : previous.baseRevision, owner), previousMutation: previous.record.mutation };
    });
    if (owner !== profile) return;
    if (draft.id === entry.record.id) replaceDraft(emptyDraft());
    await refreshLocal(owner);
    sync();
  } catch (error) { localFailure(error); }
}
async function resolveConflict(entry, keepCopy) {
  const owner = profile;
  const current = remoteRecords.get(entry.record.id);
  if (!current) { toast('Conectate para recuperar la versión de la nube.'); return; }
  $('sheet').close();
  try {
    if (keepCopy) {
      const record = asRecord({ ...asDraft(entry.record), id: null });
      const png = await createPng(record);
      if (profile !== owner) return;
      await changeLocal(owner, record.id, () => newEntry(record, png, 0, owner));
    }
    await changeLocal(owner, entry.record.id, latest => latest?.record.mutation === entry.record.mutation
      ? { record: current, png: null, status: 'synced', baseRevision: current.revision } : undefined);
    if (owner !== profile) return;
    if (draft.id === entry.record.id) replaceDraft(emptyDraft());
    await refreshLocal(owner);
    sync();
  } catch (error) { toast(error.message); }
}

async function uploadPending(owner, account, session) {
  if (!account || !navigator.onLine || Date.now() < retryAt) return;
  const local = await listLocal(owner);
  for (const entry of local.filter(item => item.status === 'pending')) {
    if (session !== generation || !navigator.onLine) break;
    try {
      const result = await push(account.uid, entry);
      await changeLocal(owner, entry.record.id, latest => {
        if (latest?.record.mutation === entry.record.mutation) {
          return result ? { ...latest, record: result, status: 'synced', baseRevision: result.revision } : null;
        }
        if (result && latest?.status === 'pending' && latest.baseRevision === entry.baseRevision) {
          return { ...latest, baseRevision: result.revision, record: { ...latest.record, revision: result.revision + 1 } };
        }
      });
    } catch (error) {
      if (error instanceof SyncConflict) {
        await changeLocal(owner, entry.record.id, latest => latest?.record.mutation === entry.record.mutation ? { ...latest, status: 'conflict' } : undefined);
        continue;
      }
      retryAt = Date.now() + (error.code === 'resource-exhausted' ? 300000 : 30000);
      if (owner === profile && navigator.onLine && ['permission-denied','resource-exhausted'].includes(error.code)) {
        warn(error.code === 'resource-exhausted' ? 'Se alcanzó una cuota de Firebase. Tus conteos nuevos quedan en el teléfono.' : 'Firebase no confirmó el guardado. Revisá la configuración y las reglas publicadas.');
      }
      console.info('Sincronización pendiente', error.code || error.message);
      break;
    }
  }
}
function sync() {
  if (syncRun || !user || !navigator.onLine || Date.now() < retryAt) return;
  const owner = profile;
  const account = user;
  const session = generation;
  const work = () => uploadPending(owner, account, session);
  syncRun = (navigator.locks ? navigator.locks.request('conteo-sync:' + owner, work) : work())
    .then(() => refreshLocal(owner)).catch(localFailure)
    .finally(() => { syncRun = null; });
}
function queueAccount(next) {
  accountChanges.push(next);
  if (applyingAccount) return;
  applyingAccount = true;
  void (async () => {
    try {
      while (accountChanges.length) {
        const nextUser = accountChanges.shift();
        const session = ++generation;
        const owner = nextUser ? 'account:' + nextUser.uid : 'guest';
        accountReady = false;
        $('countView').inert = $('historyView').inert = true;
        renderSummary();
        if ($('sheet').open) $('sheet').close();
        stopHistory?.();
        stopHistory = null;
        user = nextUser;
        profile = owner;
        remoteRecords = new Map();
        records = [];
        retryAt = 0;
        if (user) await adoptGuest(owner);
        draft = await readDraft(owner) || emptyDraft();
        editingMutation = draft.baseMutation || null;
        await refreshLocal(owner);
        const active = records.find(entry => entry.record.id === draft.id && !entry.record.deleted);
        savedDraft = active && JSON.stringify({ ...asDraft(active.record), baseMutation: active.record.mutation }) === JSON.stringify(draft)
          ? JSON.stringify(draft) : '';
        accountReady = true;
        $('countView').inert = $('historyView').inert = false;
        renderEditor();
        if (user) {
          stopHistory = observeHistory(user.uid, items => {
            if (session !== generation) return;
            remoteRecords = new Map(items.map(record => [record.id, record]));
            mergeRemote(owner, items).then(() => refreshLocal(owner)).catch(localFailure);
          }, error => {
            if (session === generation && error.code === 'permission-denied') warn('No se pudo leer el historial privado. Revisá las reglas de Firebase.');
          });
          sync();
        }
      }
    } catch (error) {
      localFailure(error);
    } finally {
      applyingAccount = false;
      accountReady = true;
      $('countView').inert = $('historyView').inert = false;
      renderSummary();
    }
  })();
}
$('account').onclick = () => {
  const body = showSheet('SINCRONIZACIÓN', user ? 'Tu cuenta de Google' : 'Guardado en la nube');
  if (user) {
    body.append(dom('p', user.email || 'Cuenta conectada'), dom('p', 'Los conteos y PNG se sincronizan al guardar. Si perdés la señal, la app reintenta al recuperar conexión.'));
    body.append(sheetButtons(button('Sincronizar ahora', () => {
      retryAt = 0;
      sync();
      $('sheet').close();
      toast(navigator.onLine ? 'Revisando cambios pendientes.' : 'Sin conexión. Se sincronizará al volver.');
    }, 'primary'), button('Cerrar sesión', () => disconnectAccount().catch(() => toast('No se pudo cerrar la sesión.')))));
  } else if (configured) {
    body.append(dom('p', 'Conectá tu cuenta para recuperar el historial y los PNG en otro teléfono. Los conteos locales se vincularán a esa cuenta.'));
    const start = button('Continuar con Google', () => {
      start.disabled = true;
      connectAccount().catch(error => {
        start.disabled = false;
        feedback.textContent = error.code === 'auth/unauthorized-domain' ? 'Este dominio todavía no está autorizado en Firebase.' :
          'No se completó la conexión. Revisá tu internet y volvé a intentar.';
      });
    }, 'primary');
    const feedback = dom('p');
    body.append(sheetButtons(start), feedback);
    if (emulator) {
      const email = dom('input');
      email.type = 'email'; email.placeholder = 'Correo de prueba'; email.id = 'emulatorEmail';
      const password = dom('input');
      password.type = 'password'; password.placeholder = 'Contraseña de prueba'; password.id = 'emulatorPassword';
      body.append(email, password, button('Ingresar al emulador', () => connectTestAccount(email.value, password.value).catch(() => feedback.textContent = 'Usuario de prueba inválido.')));
    }
  } else {
    body.append(dom('p', 'Modo local. La sincronización estará disponible al conectar el proyecto Firebase de esta app.'));
  }
};
window.addEventListener('online', () => { retryAt = 0; renderStatus(); sync(); });
window.addEventListener('offline', renderStatus);
window.addEventListener('focus', () => { refreshLocal().catch(localFailure); sync(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
setInterval(() => { if (!document.hidden) sync(); }, 20000);

async function backup(query) {
  const owner = profile;
  const entries = (await listLocal(owner)).filter(entry => !entry.record.deleted && matchesHistory(entry.record, query));
  if (!entries.length) throw new Error('No hay conteos para respaldar con esta búsqueda.');
  const items = [];
  let size = 100;
  for (const entry of entries) {
    if (owner !== profile) throw new Error('La cuenta cambió.');
    const png = await getPng(entry);
    const bytes = new Uint8Array(await png.arrayBuffer());
    let binary = '';
    for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
    const record = entry.record;
    const item = { ...asDraft(record), updatedAt: record.updatedAt, png: btoa(binary) };
    size += new Blob([JSON.stringify(item)]).size + 1;
    if (size > BACKUP_LIMIT) throw new Error('El respaldo supera 64 MB. Buscá por año o mes, por ejemplo 2026-11, y descargalo por partes.');
    items.push(item);
  }
  if (owner !== profile) throw new Error('La cuenta cambió.');
  download(new Blob([JSON.stringify({ app: 'conteo-efectivo', version: 2, records: items })], { type: 'application/json' }), 'conteos_' + today() + '.json');
}
async function restore(file) {
  if (!file || file.size > BACKUP_LIMIT) throw new Error('Usá un respaldo JSON de hasta 64 MB.');
  const data = JSON.parse(await file.text());
  const legacy = data.app === 'mi-conteo-nio' && data.version === 1;
  if ((!legacy && !(data.app === 'conteo-efectivo' && data.version === 2)) ||
    !Array.isArray(data.records) || data.records.length > 10000) throw new Error('El archivo no es un respaldo válido.');
  const owner = profile;
  const prepared = [];
  for (const item of data.records) {
    const input = legacy ? { ...legacyDraft(item), id: await legacyId(item.id) } : item;
    if (!input || typeof input.id !== 'string' || !/^[a-f0-9-]{36}$|^legacy-[a-f0-9]{32}$/.test(input.id) ||
        typeof input.name !== 'string' || input.name.length > 100 || typeof input.destination !== 'string' || input.destination.length > 120 ||
        typeof input.notes !== 'string' || input.notes.length > 1000 || typeof input.expected !== 'string' || !input.counts ||
        typeof input.date !== 'string' || typeof item.updatedAt !== 'string' || !Number.isFinite(Date.parse(item.updatedAt))) {
      throw new Error('El respaldo contiene un registro inválido.');
    }
    const record = asRecord(input, new Date(item.updatedAt).toISOString());
    let png;
    if (legacy) png = await createPng(record);
    else {
      if (typeof item.png !== 'string' || item.png.length > Math.ceil(MAX_PNG / 3) * 4) throw new Error('El respaldo contiene un PNG inválido.');
      const bytes = Uint8Array.from(atob(item.png), byte => byte.charCodeAt(0));
      if (bytes.length < 33 || bytes.length > MAX_PNG || ![137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) throw new Error('El respaldo contiene un PNG inválido.');
      const header = new DataView(bytes.buffer);
      if (header.getUint32(16) < 1 || header.getUint32(16) > 960 || header.getUint32(20) < 1 || header.getUint32(20) > 8192) {
        throw new Error('La imagen del respaldo tiene dimensiones inválidas.');
      }
      png = new Blob([bytes], { type: 'image/png' });
    }
    prepared.push(newEntry(record, png, 0, owner));
  }
  if (owner !== profile) throw new Error('La cuenta cambió.');
  const amount = await importLocal(owner, prepared);
  await refreshLocal(owner);
  sync();
  return amount;
}
$('backup').onclick = () => {
  const query = normalized($('search').value.trim());
  const exportButton = button('Descargar respaldo', async () => {
    exportButton.disabled = true;
    status.textContent = 'Preparando los conteos y las imágenes…';
    try { await backup(query); status.textContent = 'Respaldo descargado.'; }
    catch (error) { status.textContent = error.message || 'No se pudo descargar el respaldo.'; }
    finally { exportButton.disabled = false; }
  }, 'primary');
  const status = dom('p');
  showSheet('HISTORIAL', 'Respaldo del historial').append(dom('p', query ? 'La descarga incluirá los conteos y PNG de la búsqueda actual.' : 'Podés descargar los conteos y sus PNG, o importar un respaldo de esta app o de Mi Conteo.'), sheetButtons(exportButton,
    button('Importar JSON', () => $('backupFile').click())), status);
};
$('backupFile').onchange = async () => {
  const file = $('backupFile').files[0];
  $('backupFile').value = '';
  if (!file) return;
  const body = showSheet('HISTORIAL', 'Importar respaldo');
  body.append(dom('p', 'Los conteos existentes se conservan. Los registros nuevos se agregarán al historial de esta cuenta.'));
  const apply = button('Importar', async () => {
    apply.disabled = true;
    status.textContent = 'Validando el respaldo…';
    try { status.textContent = (await restore(file)) + ' conteos nuevos importados.'; }
    catch (error) { status.textContent = error instanceof SyntaxError ? 'El archivo no contiene JSON válido.' : error.message; }
    finally { apply.disabled = false; }
  }, 'primary');
  const status = dom('p');
  body.append(sheetButtons(apply), status);
};

window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
$('install').onclick = async () => {
  if (matchMedia('(display-mode: standalone)').matches) { toast('La app ya está instalada.'); return; }
  if (installPrompt) {
    await installPrompt.prompt();
    installPrompt = null;
    return;
  }
  showSheet('ANDROID', 'Instalar Conteo').append(dom('p', 'Abrí la app en Chrome. En el menú ⋮ tocá «Instalar aplicación» o «Agregar a pantalla principal».'));
};
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(new URL('sw.js', document.baseURI)).catch(error => console.info('Modo sin conexión no disponible', error.message));
}
renderEditor();
observeAccount(queueAccount);
