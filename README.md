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

1. Creá un proyecto Firebase dedicado en **Spark**. En Authentication, habilitá el proveedor Google y agregá `montealtoc7.github.io` como dominio autorizado. En Firestore, creá una base **Standard**, en modo de producción. Registrá una aplicación Web en el mismo proyecto.
2. Publicá las reglas e índices de este repositorio en ese proyecto. Usá el CLI oficial con tu sesión y especificá el ID del proyecto:

   ```bash
   npx firebase-tools@15.35.0 login
   npx firebase-tools@15.35.0 deploy --only firestore:rules,firestore:indexes --project ID_DEL_PROYECTO
   ```

3. Copiá los cuatro campos públicos del SDK Web de Firebase a las variables de Actions indicadas en `.env.example`. Para una validación local, podés usar `.env.local`.
4. Tras aprobar e integrar el PR, seleccioná **GitHub Actions** en Settings → Pages. Ejecutá manualmente **Publicar en GitHub Pages** desde `main`. El flujo exige la configuración de Firebase antes de publicar.
5. En el enlace publicado, probá con dos sesiones y con Chrome en un Android físico. Comprobá instalación, inicio de sesión, recuperación del PNG y compartir en WhatsApp.

El repositorio contiene código. Los datos privados se almacenan bajo el identificador de cada usuario en Firestore. Conservá el plan Spark y el origen HTTPS de la app. El límite de almacenamiento gratuito del proyecto es de 1 GiB.

## Datos y sincronización

IndexedDB guarda el borrador y la cola por cuenta. La confirmación de Firestore cambia el estado a **Guardado en la nube**. Un ID de mutación permite repetir un envío sin duplicarlo. Las reglas exigen propietario, importes consistentes, revisión consecutiva y que el registro y el PNG de hasta 450 KiB se escriban juntos. La eliminación conserva una marca mínima de revisión y quita el archivo. Cada PNG remoto se solicita al abrirlo y se conserva en el dispositivo tras la primera consulta.

Denominaciones de referencia del Banco Central de Nicaragua.

- [Billetes actuales](https://www.bcn.gob.ni/billetes-actuales)
- [Monedas actuales](https://www.bcn.gob.ni/monedas-actuales)
