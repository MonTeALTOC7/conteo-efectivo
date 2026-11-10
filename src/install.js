export function setupInstallNotice(showError) {
  const notice = document.getElementById('installNotice');
  const now = document.getElementById('installNow');
  const chrome = document.getElementById('installChrome');
  const sheet = document.getElementById('sheet');
  const standalone = matchMedia('(display-mode: standalone)');
  const sessionKey = 'conteo-efectivo:install-dismissed';
  const embeddedAndroid = location.protocol === 'https:' && /Android/i.test(navigator.userAgent) &&
    /; wv\)|FBAN|FBAV|Instagram|MicroMessenger/i.test(navigator.userAgent);
  let promptEvent;
  let installed = false;
  let dismissed = false;
  try { dismissed = sessionStorage.getItem(sessionKey) === '1'; } catch { /* Session storage can be blocked. */ }

  function dismiss() {
    dismissed = true;
    try { sessionStorage.setItem(sessionKey, '1'); } catch { /* Keep dismissal in memory. */ }
    notice.close();
  }

  function offer() {
    if (dismissed || installed || standalone.matches || navigator.standalone || document.hidden) return;
    if (!promptEvent && !embeddedAndroid) return;
    if (sheet.open || document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return;

    now.hidden = !promptEvent;
    chrome.hidden = Boolean(promptEvent);
    document.getElementById('installDescription').textContent = promptEvent
      ? 'Agregá el ícono a tu pantalla de inicio para abrir tus conteos con un toque.'
      : 'Abrí Conteo en Chrome para agregarlo a tu pantalla de inicio.';
    if (!notice.open) notice.showModal();
  }

  if (embeddedAndroid) chrome.href = 'intent://' + location.host + location.pathname + '#Intent;scheme=https;package=com.android.chrome;end';
  chrome.addEventListener('click', dismiss);
  document.getElementById('installLater').addEventListener('click', dismiss);
  notice.addEventListener('cancel', event => {
    event.preventDefault();
    dismiss();
  });
  now.addEventListener('click', async () => {
    const ready = promptEvent;
    if (!ready) return;
    promptEvent = null;
    dismiss();
    try {
      await ready.prompt();
    } catch {
      dismissed = false;
      try { sessionStorage.removeItem(sessionKey); } catch { /* Retry in a new session. */ }
      showError('No se pudo abrir el instalador. Volvé a abrir Conteo para intentarlo de nuevo.');
    }
  });
  window.addEventListener('beforeinstallprompt', event => {
    if (dismissed || installed || standalone.matches || navigator.standalone) return;
    event.preventDefault();
    promptEvent = event;
    offer();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    promptEvent = null;
    notice.close();
  });
  standalone.addEventListener('change', () => {
    if (standalone.matches) notice.close();
    else offer();
  });
  sheet.addEventListener('close', offer);
  document.addEventListener('focusout', () => {
    if (promptEvent || embeddedAndroid) setTimeout(offer, 0);
  });
  document.addEventListener('visibilitychange', offer);
  offer();
}
