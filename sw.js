// Nombre de la caché
const CACHE_NAME = 'snic-electric-v1';

// Archivos principales a almacenar en caché para funcionamiento offline
const ASSETS_TO_CACHE = [
  '/snic_electric_app/',
  '/snic_electric_app/index.html',
  '/snic_electric_app/manifest.json',
  '/snic_electric_app/icons/icon-192x192.png',
  '/snic_electric_app/icons/icon-512x512.png'
];

// 1. Evento Install: Guarda en caché los archivos estáticos requeridos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching app shell');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. Evento Activate: Limpia cachés antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Evento Fetch: Intercepta las solicitudes de red (Network First / Cache Fallback)
self.addEventListener('fetch', (event) => {
  // Solo interceptar peticiones GET dentro de la app
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Si hay red, actualizamos la caché con la respuesta recibida
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Si no hay red (offline), sirve la versión de la caché
        return caches.match(event.request);
      })
  );
});

// 4. Soporte para Notificaciones Push (opcional)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.text() : 'Notificación de SNIC Electric';
  event.waitUntil(
    self.registration.showNotification('SNIC Electric', {
      body: data,
      icon: '/snic_electric_app/icons/icon-192x192.png'
    })
  );
});
