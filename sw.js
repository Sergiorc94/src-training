// SRC Training – Service Worker
// Estrategia: Cache First para assets estáticos, Network First para API

const CACHE_NAME = 'src-training-v22';
const STATIC_ASSETS = [
  '/src-training/',
  '/src-training/index.html',
  '/src-training/manifest.json',
  '/src-training/icon-192.png',
  '/src-training/icon-512.png',
];

// Instalar: pre-cachear assets estáticos
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activar: limpiar cachés antiguas
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch: Network First para Supabase API, Cache First para resto
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // No interceptar requests de Supabase (siempre necesitan red)
  if (url.includes('supabase.co')) {
    return; // deja pasar sin SW
  }

  // Para navegación (HTML), Network First con fallback a caché
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(new Request(event.request, {cache: 'no-store'})).then(function(response) {
        // Guardar copia en caché
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, clone);
        });
        return response;
      }).catch(function() {
        // Sin red → servir desde caché
        return caches.match('/src-training/index.html').then(function(cached) {
          return cached || caches.match('/src-training/');
        });
      })
    );
    return;
  }

  // Para el resto: Cache First
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});
