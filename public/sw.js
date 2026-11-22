/**
 * Service worker : rend l'application utilisable hors ligne.
 *
 * À l'installation, tous les fichiers de l'appli sont copiés dans un cache versionné.
 * Ensuite, chaque requête est servie depuis ce cache (réponse instantanée, même sans réseau).
 * Pour publier une mise à jour : modifier les fichiers PUIS incrémenter VERSION.
 * Le navigateur détecte le nouveau sw.js, prépare le nouveau cache, et l'appli propose
 * « Mettre à jour » ; l'ancien cache est supprimé à l'activation.
 *
 * Seules les requêtes GET vers le site lui-même sont interceptées : rien d'autre ne transite ici.
 */

const VERSION = '1.0.0';
const CACHE_PREFIX = 'suivi-carburant-';
const CACHE = `${CACHE_PREFIX}${VERSION}`;

// Liste vérifiée par le test tests/unit/precache.test.js : chaque fichier publié doit y figurer.
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './css/screens.css',
  './js/main.js',
  './js/app.js',
  './js/core/dom.js',
  './js/core/router.js',
  './js/core/sw-register.js',
  './js/domain/constants.js',
  './js/domain/consumption.js',
  './js/domain/dates.js',
  './js/domain/demo.js',
  './js/domain/numbers.js',
  './js/domain/reminders.js',
  './js/domain/stats.js',
  './js/domain/validation.js',
  './js/data/backup.js',
  './js/data/crypto.js',
  './js/data/csv.js',
  './js/data/db.js',
  './js/data/ids.js',
  './js/data/repositories.js',
  './js/ui/files.js',
  './js/ui/flows.js',
  './js/ui/routes.js',
  './js/ui/components/charts.js',
  './js/ui/components/common.js',
  './js/ui/components/dialog.js',
  './js/ui/components/fields.js',
  './js/ui/components/icons.js',
  './js/ui/components/tabbar.js',
  './js/ui/components/toast.js',
  './js/ui/screens/fillup-form.js',
  './js/ui/screens/history.js',
  './js/ui/screens/home.js',
  './js/ui/screens/reminder-form.js',
  './js/ui/screens/stats.js',
  './js/ui/screens/vehicle-form.js',
  './js/ui/screens/vehicle.js',
  './assets/fonts/inter-latin-wght-normal.woff2',
  './assets/fonts/space-grotesk-latin-wght-normal.woff2',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

// L'appli envoie ce message quand l'utilisateur accepte la mise à jour.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Toutes les pages mènent à l'appli (la navigation interne passe par le #hash).
    event.respondWith(caches.match('./index.html', { cacheName: CACHE }).then((cached) => cached ?? fetch(request)));
    return;
  }
  event.respondWith(caches.match(request, { cacheName: CACHE }).then((cached) => cached ?? fetch(request)));
});
