export function authErrorMessage(error) {
  switch (error?.code) {
    case 'auth/unauthorized-domain': return 'Este dominio no está autorizado para iniciar sesión. Abrí la dirección oficial de la app.';
    case 'auth/operation-not-allowed': return 'El acceso con Google aún no está habilitado en Firebase. Contactá al administrador.';
    case 'auth/popup-blocked': return 'El navegador bloqueó la ventana de Google. Permití ventanas emergentes y volvé a intentar.';
    case 'auth/popup-closed-by-user': return 'Se cerró la ventana de Google antes de terminar. Podés intentarlo otra vez.';
    case 'auth/network-request-failed': return 'No se pudo conectar con Google. Revisá tu conexión e intentá de nuevo.';
    default: return 'No se completó el acceso con Google. Revisá tu conexión y volvé a intentar.';
  }
}
export function useRedirect(userAgent, hostname, authDomain) {
  return /Android/i.test(userAgent) && hostname === authDomain;
}
