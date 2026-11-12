import assert from 'node:assert/strict';
import test from 'node:test';
import { authErrorMessage, useRedirect } from '../src/auth-flow.js';

test('Android usa redirección solo en el dominio seguro de Auth', () => {
  assert.equal(useRedirect('Mozilla Android Chrome', 'conteo-de-efectivo.firebaseapp.com', 'conteo-de-efectivo.firebaseapp.com'), true);
  assert.equal(useRedirect('Mozilla Android Chrome', 'otro.web.app', 'conteo-de-efectivo.firebaseapp.com'), false);
  assert.equal(useRedirect('Mozilla Windows Chrome', 'conteo-de-efectivo.firebaseapp.com', 'conteo-de-efectivo.firebaseapp.com'), false);
});
test('errores de acceso tienen mensajes entendibles', () => {
  assert.match(authErrorMessage({code:'auth/operation-not-allowed'}), /no está habilitado/);
  assert.match(authErrorMessage({code:'auth/unauthorized-domain'}), /no está autorizado/);
  assert.match(authErrorMessage({code:'auth/popup-blocked'}), /bloqueó/);
  assert.match(authErrorMessage({code:'auth/network-request-failed'}), /conexión/);
  assert.match(authErrorMessage({code:'auth/other'}), /intent/);
});
