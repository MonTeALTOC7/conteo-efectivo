import { defineConfig, loadEnv } from 'vite';

function requireReleaseConfig(_, { mode }) {
  if (mode !== 'release') return;
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const required = ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'APP_ID'];
  const missing = required.filter(key => !env['VITE_FIREBASE_' + key]?.trim());
  if (missing.length) throw new Error('Configurá Firebase antes de publicar: ' + missing.join(', '));
  if (env.VITE_USE_FIREBASE_EMULATOR === '1') throw new Error('Desactivá el emulador antes de publicar.');
}

export default defineConfig({
  base: './',
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'firestore', test: /[\\/]node_modules[\\/]@firebase[\\/]firestore[\\/]/, priority: 10 },
            { name: 'firebase-auth', test: /[\\/]node_modules[\\/]@firebase[\\/]auth[\\/]/, priority: 10 },
            { name: 'firebase-core', test: /[\\/]node_modules[\\/]/ }
          ]
        }
      }
    }
  },
  plugins: [{ name: 'firebase-release-config', config: requireReleaseConfig }, {
    name: 'offline-shell',
    apply: 'build',
    generateBundle(_, bundle) {
      const assets = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png'];
      assets.push(...Object.keys(bundle).filter(name => name.startsWith('assets/')).map(name => './' + name));
      const version = Object.keys(bundle).filter(name => name.endsWith('.js') || name.endsWith('.css')).join('|');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `
const cacheName = 'conteo-v1-' + self.registration.scope + ${JSON.stringify(version)};
const shell = ${JSON.stringify(assets)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(shell)));
});
self.addEventListener('activate', event => {
  const prefix = 'conteo-v1-' + self.registration.scope;
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(prefix) && key !== cacheName).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;
  const url = new URL(request.url);
  const relative = './' + url.pathname.slice(new URL(self.registration.scope).pathname.length);
  // Firebase Auth owns /__/auth/handler and must receive the actual network response.
  if (relative.startsWith('./__/')) return;
  if (request.mode === 'navigate' && (relative === './' || relative === './index.html')) {
    event.respondWith(caches.open(cacheName).then(cache => cache.match('./index.html')).then(response => response || fetch(request)));
  } else if (shell.includes(relative)) {
    event.respondWith(caches.open(cacheName).then(cache => cache.match(relative)).then(response => response || fetch(request)));
  }
});
`
      });
    }
  }]
});
