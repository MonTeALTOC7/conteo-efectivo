# Conteo de Efectivo

PWA independiente para Android. Contá billetes y monedas en córdobas, anotá el destino del efectivo y compartí el PNG del conteo. Los importes se calculan en centavos enteros.

## Uso

1. Contá con los botones o el teclado numérico. El monto previsto es opcional.
2. Agregá nombre, fecha y notas. Tocá **Guardar conteo**. El borrador y los registros se guardan en el navegador del dispositivo.
3. En **Nube**, conectá tu cuenta de Google. Los conteos guardados y sus PNG se envían juntos cuando hay conexión. Volvé a abrir la app para reanudar el envío si la cerraste sin señal.
4. Desde el historial podés buscar, editar, recuperar el PNG original o exportar un PDF. Los cambios simultáneos se revisan y se pueden conservar como copias.
5. En Chrome para Android, usá **Instalar app** o el menú ⋮ de Chrome. Abrí la app con internet al menos una vez para descargar su interfaz.

El historial de otra cuenta queda separado. En un teléfono nuevo, iniciá sesión con la misma cuenta y conectate para abrir cada PNG por primera vez. El primer acceso con Google requiere internet. La PWA conserva los cambios pendientes si se alcanza la cuota de Firebase.

**Respaldo** exporta JSON con registros y PNG. También admite los registros del JSON de Mi Conteo v1 y evita duplicados al reimportarlos. Los borradores se guardan por dispositivo.

## Desarrollo

Requiere Node.js 24. Java 21 para los emuladores de Firebase.

```bash
npm ci
npm run dev
npm test
npx playwright install chromium
npm run test:firebase
npm run build
npm run preview
```

La versión local sin configuración funciona con almacenamiento del dispositivo. Para probar la app con los emuladores fuera de las pruebas, iniciá Auth y Firestore en el proyecto `demo-conteo-efectivo` y definí `VITE_USE_FIREBASE_EMULATOR=1`. El acceso al emulador solo aparece en localhost.

## Activación del plan gratuito

1. Creá un proyecto Firebase dedicado en **Spark**. En Authentication, habilitá el proveedor Google. En Firestore, creá una base **Standard** en modo de producción. Registrá una aplicación Web en el mismo proyecto.
2. Copiá los cuatro campos del SDK Web indicados en `.env.example` a `.env.local`. Usá el `authDomain` asignado por Firebase y mantené el mismo ID de proyecto para Hosting, Auth y Firestore.
3. Tras aprobar e integrar el PR, ejecutá desde `main`:

   ```bash
   npm ci
   npm test
   npm run build:release
   npx firebase-tools@15.35.0 login
   npx firebase-tools@15.35.0 deploy --only firestore:rules,firestore:indexes --project ID_DEL_PROYECTO
   npx firebase-tools@15.35.0 deploy --only hosting --project ID_DEL_PROYECTO
   ```

4. Usá el enlace HTTPS `ID_DEL_PROYECTO.firebaseapp.com` que corresponde al `authDomain`. Probá dos sesiones y Chrome en un Android físico. Comprobá instalación, inicio de sesión, recuperación del PNG y compartir en WhatsApp.

El código vive en GitHub y la PWA usa el dominio gratuito y exclusivo del proyecto Firebase. El origen exclusivo separa el almacenamiento del navegador de otras apps en `montealtoc7.github.io`. Los datos privados se guardan bajo el identificador de cada usuario en Firestore. Conservá el plan Spark. El límite de almacenamiento gratuito de Firestore es de 1 GiB.

## Datos y sincronización

El borrador se escribe en el dispositivo en cada cambio. IndexedDB guarda los conteos, imágenes y cola de sincronización por cuenta. La confirmación de Firestore cambia el estado a **Guardado en la nube**. Un ID de mutación permite repetir un envío sin duplicarlo. Las reglas exigen propietario, importes consistentes, revisión consecutiva y que el registro y el PNG de hasta 450 KiB se escriban juntos. La eliminación conserva una marca mínima de revisión y quita el archivo. Cada PNG remoto se solicita al abrirlo y se conserva en el dispositivo tras la primera consulta.

Denominaciones de referencia del Banco Central de Nicaragua.

- [Billetes actuales](https://www.bcn.gob.ni/billetes-actuales)
- [Billete conmemorativo de C$5](https://www.bcn.gob.ni/nota-de-prensa/bcn-emite-nuevo-billete-de-5-cordobas-y-monedas-conmemorativas-en-su-60-aniversario)
- [Monedas actuales](https://www.bcn.gob.ni/monedas-actuales)

La pantalla y los comprobantes identifican cada denominación con una ficha de color y su valor. La tarjeta personal de Carlos José admite una foto opcional guardada en el navegador del dispositivo, separada del historial y de los comprobantes.
