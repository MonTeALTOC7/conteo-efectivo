import { defineConfig } from 'vite';

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
  plugins: [{
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
  if (request.mode === 'navigate') {
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
