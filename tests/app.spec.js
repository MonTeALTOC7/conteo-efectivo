import { devices, expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const route = '/';
const phone = { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } };
const label = (page, id) => page.locator('[data-denom="' + id + '"]');

async function waitReady(page) {
  await expect(page.locator('#save')).toBeEnabled();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}
async function download(page, name) {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name, exact:true }).click();
  const item = await event;
  return { name: item.suggestedFilename(), bytes: await readFile(await item.path()) };
}
async function history(page) {
  await page.getByRole('button', { name: 'Historial', exact: true }).click();
}
async function close(page) {
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
}
async function selectEntry(page, title) {
  await page.locator('.history-card').filter({ hasText: title }).getByRole('button', { name: 'Ver conteo' }).click();
}

async function dispatchInstallPrompt(page) {
  return page.evaluate(() => {
    const event = new Event('beforeinstallprompt', {cancelable:true});
    event.prompt = async () => {
      document.body.dataset.installPromptCalled = 'yes';
      window.dispatchEvent(new Event('appinstalled'));
      return { outcome:'accepted' };
    };
    return window.dispatchEvent(event);
  });
}

test('instalación: ofrece el instalador sin buscar un botón y espera si hay otro diálogo', async ({browser}) => {
  const context = await browser.newContext({...phone, viewport:{width:360,height:780}});
  const page = await context.newPage();
  await page.goto(route);
  await waitReady(page);
  await page.getByRole('button', {name:'Cuenta y sincronización'}).click();
  expect(await dispatchInstallPrompt(page)).toBe(false);
  const notice = page.getByRole('dialog', {name:'Instalá Conteo de Efectivo'});
  await expect(notice).toBeHidden();
  await close(page);
  await expect(notice).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await expect(page.locator('body')).not.toHaveAttribute('data-install-prompt-called', 'yes');
  await notice.getByRole('button', {name:'Instalar ahora'}).click();
  await expect(page.locator('body')).toHaveAttribute('data-install-prompt-called', 'yes');
  await expect(notice).toBeHidden();
  await dispatchInstallPrompt(page);
  await expect(notice).toBeHidden();
  await context.close();
});

test('instalación: respeta Ahora no y omite la invitación en modo instalado', async ({page, browser}) => {
  await page.goto(route);
  await waitReady(page);
  await dispatchInstallPrompt(page);
  const notice = page.getByRole('dialog', {name:'Instalá Conteo de Efectivo'});
  await notice.getByRole('button', {name:'Ahora no'}).click();
  await page.reload();
  await waitReady(page);
  expect(await dispatchInstallPrompt(page)).toBe(true);
  await expect(notice).toBeHidden();

  const installed = await browser.newContext(phone);
  const app = await installed.newPage();
  await app.addInitScript(() => {
    const match = window.matchMedia.bind(window);
    window.matchMedia = query => query === '(display-mode: standalone)'
      ? {matches:true, addEventListener() {}}
      : match(query);
  });
  await app.goto(route);
  await waitReady(app);
  expect(await dispatchInstallPrompt(app)).toBe(true);
  await expect(app.getByRole('dialog', {name:'Instalá Conteo de Efectivo'})).toBeHidden();
  await installed.close();
});

test('móvil: cuenta centavos, conserva borrador offline y exporta PNG/PDF', async ({browser}) => {
  const context = await browser.newContext(phone);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(route);
  await waitReady(page);
  await expect(page.locator('#total')).toHaveText('C$ 0.00');
  await expect(page.getByText('By Carlos Tijerino')).toBeVisible();
  const portrait = page.getByRole('img', { name: 'Carlos José vestido de doctor' });
  await expect(portrait).toBeVisible();
  await expect.poll(() => portrait.evaluate(img => img.naturalWidth > 0)).toBe(true);
  await expect(page.locator('#bills .currency-thumb')).toHaveCount(8);
  await expect.poll(() => page.locator('#bills .currency-thumb').evaluateAll(images => images.every(img => img.naturalWidth === 300))).toBe(true);
  await label(page, 'b1000').fill('2.5');
  await expect(page.locator('#total')).toHaveText('C$ 0.00');
  await label(page, 'b1000').fill('2');
  await page.getByRole('button', { name: 'Sumar billetes de C$ 500' }).click();
  await label(page, 'b5').fill('1');
  await page.locator('#coinPanel > summary').click();
  await expect(page.locator('#coins .denom-row')).toHaveCount(2);
  await label(page, 'm500').fill('1');
  await expect(label(page, 'm25')).toBeHidden();
  await page.locator('#extraCoinsPanel > summary').click();
  await label(page, 'm25').fill('3');
  await label(page, 'm5').fill('1');
  await page.locator('#countName').fill('Banpro · Noviembre');
  await page.locator('#destination').fill('Depósito para pagar tarjeta');
  await page.locator('#expected').fill('2.510,81');
  await page.locator('#notes').fill('Verificar el recibo del banco.\nPago del mes.');
  await expect(page.locator('#total')).toHaveText('C$ 2,510.80');
  await expect(page.locator('#difference')).toHaveText('Faltan C$ 0.01');
  await expect(page.locator('#miniTotal')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#countName')).toHaveValue('Banpro · Noviembre');
  await expect(page.locator('#total')).toHaveText('C$ 2,510.80');
  await expect(label(page, 'm25')).toHaveValue('3');
  await expect.poll(() => page.locator('#bills .currency-thumb').evaluateAll(images => images.every(img => img.naturalWidth === 300))).toBe(true);
  await page.getByRole('button', { name: 'Guardar conteo', exact: true }).click();
  await expect(page.locator('#draftStatus')).toHaveText('Guardado en el dispositivo');
  await page.getByRole('button', { name: 'Ver PNG' }).click();
  const png = await download(page, 'Descargar PNG');
  expect(png.name).toMatch(/banpro-noviembre.*\.png$/);
  expect(png.bytes.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
  expect(png.bytes.readUInt32BE(16)).toBeGreaterThanOrEqual(643);
  expect(png.bytes.length).toBeLessThanOrEqual(450 * 1024);
  const pdf = await download(page, 'PDF');
  expect(pdf.bytes.subarray(0,8).toString()).toBe('%PDF-1.4');
  if (process.env.CAPTURE_QA === '1') {
    await mkdir('../qa', {recursive:true});
    await writeFile('../qa/comprobante.png', png.bytes);
    await writeFile('../qa/comprobante.pdf', pdf.bytes);
  }
  await close(page);
  await history(page);
  await page.getByRole('searchbox').fill('noviembre');
  await expect(page.locator('.history-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Respaldo', exact: true }).click();
  const backup = JSON.parse((await download(page, 'Descargar respaldo')).bytes.toString());
  expect(backup.version).toBe(3);
  expect(backup.records).toHaveLength(1);
  expect(backup.records[0]).not.toHaveProperty('png');
  await close(page);
  await selectEntry(page, 'Banpro');
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(page.locator('#countName')).toHaveValue('Banpro · Noviembre');
  await expect(page.locator('#save')).toBeDisabled();
  if (process.env.CAPTURE_QA === '1') {
    await page.evaluate(() => { document.querySelector('#toast').hidden = true; });
    await page.screenshot({path:'../qa/android.png'});
  }
  expect(errors).toEqual([]);
  await context.close();
});

test('conserva la última cantidad si se recarga inmediatamente sin conexión', async ({browser}) => {
  const context = await browser.newContext(phone);
  const page = await context.newPage();
  await page.goto(route);
  await waitReady(page);
  await context.setOffline(true);
  const navigated = page.waitForEvent('framenavigated');
  await page.evaluate(() => {
    const last = document.querySelector('[data-denom="m25"]');
    last.value = '3';
    last.dispatchEvent(new Event('input', {bubbles:true}));
    location.reload();
  });
  await navigated;
  await expect(page.locator('#total')).toHaveText('C$ 0.75');
  await context.close();
});

test('respaldo anterior: importa sin duplicar y conserva notas', async ({page}) => {
  await page.goto(route);
  await waitReady(page);
  await history(page);
  const item = {id:'legado-1',name:'Conteo antiguo',note:'Nota histórica',expected:250.25,
    counts:{10:0,20:0,50:1,100:0,200:1,500:0,1000:0},createdAt:'2026-11-08T18:00:00Z',updatedAt:'2026-11-08T19:00:00Z'};
  for (const number of [1,0]) {
    await page.locator('#backupFile').setInputFiles({name:'mi-conteo.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'mi-conteo-nio',version:1,records:[item]}))});
    await page.getByRole('button', {name:'Importar', exact:true}).click();
    await expect(page.locator('#sheetBody')).toContainText(number + ' conteos nuevos importados.');
    await close(page);
  }
  const oldRecord = {
    ...item, id: crypto.randomUUID(), name: 'Respaldo v2', destination: '', notes: 'Solo datos',
    date: '2026-11-08', expected: '', counts: { b50: 1 }, png: 'Imagen anterior ignorada'
  };
  await page.locator('#backupFile').setInputFiles({
    name: 'conteo-v2.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ app: 'conteo-efectivo', version: 2, records: [oldRecord] }))
  });
  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  await expect(page.locator('#sheetBody')).toContainText('1 conteos nuevos importados.');
  await close(page);
  await expect(page.locator('.history-card').filter({ hasText: 'Respaldo v2' })).toBeVisible();
  await selectEntry(page, 'Conteo antiguo');
  await expect(page.locator('#sheetBody')).toContainText('Nota histórica');
  await expect(page.locator('#sheetBody')).toContainText('08/11/2026 · C$ 250.00');
  await page.getByRole('button', {name:'Abrir PNG'}).click();
  const png = await download(page, 'Descargar PNG');
  expect(png.bytes.length).toBeGreaterThan(10000);
});

const authApi = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-conteo';
async function testAccount(request, prefix) {
  const email = prefix + '-' + crypto.randomUUID() + '@example.test';
  const password = 'demoPass123';
  const response = await request.post(authApi, {data:{email,password,returnSecureToken:true}});
  expect(response.ok()).toBeTruthy();
  return { email, password, ...await response.json() };
}
async function signIn(page, account) {
  await page.goto(route);
  await waitReady(page);
  await page.getByRole('button', { name:'Cuenta y sincronización' }).click();
  await page.locator('#emulatorEmail').fill(account.email);
  await page.locator('#emulatorPassword').fill(account.password);
  await page.getByRole('button', {name:'Ingresar al emulador'}).click();
  await expect(page.locator('#sheet')).not.toBeVisible();
  await expect(page.locator('#account')).toHaveAttribute('data-state','online');
}
test('Firebase: cola offline, PNG local, aislamiento y edición concurrente', async ({browser, request}) => {
  test.skip(!process.env.FIRESTORE_EMULATOR_HOST, 'Requiere emuladores');
  const owner = await testAccount(request, 'owner');
  const other = await testAccount(request, 'other');
  const a = await browser.newContext(phone);
  const b = await browser.newContext();
  const first = await a.newPage();
  const second = await b.newPage();
  await signIn(first, owner);
  await signIn(second, owner);
  await a.setOffline(true);
  await label(first, 'b500').fill('3');
  await label(first, 'b5').fill('2');
  await first.locator('#coinPanel > summary').click();
  await label(first, 'm500').fill('1');
  await expect(first.locator('#total')).toHaveText('C$ 1,515.00');
  await first.locator('#countName').fill('Pago Managua');
  await first.locator('#notes').fill('PNG original de prueba.');
  await first.getByRole('button', {name:'Guardar conteo', exact:true}).click();
  await expect(first.locator('#draftStatus')).toContainText('Pendiente de sincronizar');
  await first.getByRole('button', {name:'Ver PNG'}).click();
  const original = await download(first, 'Descargar PNG');
  const saved = await first.evaluate(async () => {
    const db = await new Promise(resolve => { const r = indexedDB.open('conteo-efectivo-v1'); r.onsuccess = () => resolve(r.result); });
    return new Promise(resolve => { const r = db.transaction('records').objectStore('records').getAll(); r.onsuccess = () => resolve(r.result[0]); });
  });
  expect(saved).not.toHaveProperty('png');
  const docId = saved.record.id;
  await first.close();
  const reopened = await a.newPage();
  await reopened.goto(route);
  await expect(reopened.locator('#countName')).toHaveValue('Pago Managua');
  await history(reopened);
  await expect(reopened.locator('.history-card')).toContainText('Pendiente de sincronizar');
  await history(second);
  await expect(second.locator('.history-card')).toHaveCount(0);
  await a.setOffline(false);
  await expect(reopened.locator('.history-card')).toContainText('Guardado en la nube');
  await expect(second.locator('.history-card')).toContainText('Pago Managua');
  await selectEntry(second, 'Pago Managua');
  await b.setOffline(true);
  await second.getByRole('button', {name:'Abrir PNG'}).click();
  await expect(second.getByRole('img', { name: 'Conteo de efectivo de Pago Managua por C$ 1,515.00' })).toBeVisible();
  const regenerated = await download(second, 'Descargar PNG');
  expect(regenerated.name).toBe(original.name);
  expect(regenerated.bytes.subarray(0, 8)).toEqual(original.bytes.subarray(0, 8));
  await close(second);
  await b.setOffline(false);

  const path = 'http://127.0.0.1:8080/v1/projects/demo-conteo-efectivo/databases/(default)/documents/users/' + owner.localId;
  const headers = { Authorization: 'Bearer ' + other.idToken };
  for (const collection of ['counts','images']) {
    expect((await request.get(path + '/' + collection + '/' + docId, {headers})).status()).toBe(403);
  }
  const ownerHeaders = { Authorization: 'Bearer ' + owner.idToken };
  const originalDoc = await request.get(path + '/counts/' + docId, {headers:ownerHeaders});
  expect(originalDoc.ok()).toBeTruthy();
  const { fields } = await originalDoc.json();
  expect(fields.counts.mapValue.fields.b5.integerValue).toBe('2');
  expect(fields.counts.mapValue.fields.m500.integerValue).toBe('1');
  fields.revision = { integerValue:'2' };
  fields.mutation = { stringValue:crypto.randomUUID() };
  fields.total = { integerValue:'1' };
  expect((await request.patch(path + '/counts/' + docId, {headers:ownerHeaders,data:{fields}})).status()).toBe(403);
  const imageUrl = path + '/images/' + docId;
  expect((await request.get(imageUrl, {headers:ownerHeaders})).status()).toBe(404);
  expect((await request.patch(imageUrl, {headers:ownerHeaders, data:{fields:{
    revision: { integerValue:'1' }, mutation: (await originalDoc.json()).fields.mutation,
    png: { bytesValue: original.bytes.toString('base64') }
  }}})).status()).toBe(403);
  await selectEntry(reopened, 'Pago Managua');
  await reopened.getByRole('button', {name:'Editar', exact:true}).click();
  await a.setOffline(true);
  await reopened.locator('#notes').fill('Cambio offline');
  await reopened.locator('#countName').fill('Versión offline');
  await reopened.getByRole('button', {name:'Actualizar conteo', exact:true}).click();
  await expect(reopened.locator('#draftStatus')).toContainText('Pendiente de sincronizar');
  await selectEntry(second, 'Pago Managua');
  await second.getByRole('button', {name:'Editar', exact:true}).click();
  await second.locator('#notes').fill('Cambio guardado en la nube');
  await second.getByRole('button', {name:'Actualizar conteo', exact:true}).click();
  await expect(second.locator('#draftStatus')).toHaveText('Guardado en la nube');
  await history(second);
  await a.setOffline(false);
  await history(reopened);
  await expect(reopened.locator('.history-card')).toContainText('Revisar cambio de otro dispositivo');
  await reopened.getByRole('button', {name:'Revisar', exact:true}).click();
  await reopened.getByRole('button', {name:'Guardar mi versión como copia', exact:true}).click();
  await expect(reopened.locator('.history-card')).toHaveCount(2);
  await expect(second.locator('.history-card')).toHaveCount(2);
  await a.setOffline(true);
  await reopened.getByRole('button', {name:'Nuevo conteo', exact:true}).click();
  await label(reopened, 'b50').fill('1');
  await reopened.locator('#countName').fill('Cancelar antes de sincronizar');
  await reopened.getByRole('button', {name:'Guardar conteo', exact:true}).click();
  await expect(reopened.locator('#draftStatus')).toContainText('Pendiente de sincronizar');
  await history(reopened);
  await selectEntry(reopened, 'Cancelar antes de sincronizar');
  await reopened.getByRole('button', {name:'Eliminar', exact:true}).click();
  await reopened.getByRole('button', {name:'Eliminar', exact:true}).click();
  await expect(reopened.locator('.history-card')).toHaveCount(2);
  await a.setOffline(false);
  await expect.poll(() => reopened.evaluate(async () => {
    const db = await new Promise(resolve => { const r = indexedDB.open('conteo-efectivo-v1'); r.onsuccess = () => resolve(r.result); });
    return new Promise(resolve => { const r = db.transaction('records').objectStore('records').getAll(); r.onsuccess = () => resolve(r.result.filter(entry => entry.status === 'pending').length); });
  })).toBe(0);
  await expect(second.locator('.history-card')).toHaveCount(2);

  // Admin access is limited to this emulator. Simulate an image written by v1.
  const originalFields = (await originalDoc.json()).fields;
  const seed = await request.patch(imageUrl, {headers:{Authorization:'Bearer owner'}, data:{fields:{
    revision: originalFields.revision, mutation: originalFields.mutation,
    png: { bytesValue: original.bytes.toString('base64') }
  }}});
  expect(seed.ok()).toBeTruthy();
  await selectEntry(second, 'Pago Managua');
  await second.getByRole('button', {name:'Eliminar', exact:true}).click();
  await second.getByRole('button', {name:'Eliminar', exact:true}).click();
  await expect(reopened.locator('.history-card')).toHaveCount(1);
  expect((await request.get(imageUrl, {headers:ownerHeaders})).status()).toBe(404);
  await a.close();
  await b.close();
});
