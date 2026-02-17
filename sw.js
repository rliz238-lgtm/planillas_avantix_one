const CACHE_NAME = 'avantix-v27';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/main.js',
    '/img/avantix_one_logo.png'
];

// Instalar y forzar activación inmediata
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
});

// Limpiar cachés antiguas
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

// Estrategia: Network First para scripts y estilos, Cache First para imágenes
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // No interceptar peticiones a CDNs si causan problemas de CSP, 
    // o simplemente dejar que el navegador las maneje si fallan en el SW
    if (url.origin !== self.location.origin) {
        return; // Dejar que el navegador maneje peticiones externas
    }

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Si la red funciona, actualizamos el caché
                if (response && response.status === 200 && ASSETS.includes(url.pathname)) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
                }
                return response;
            })
            .catch(() => {
                // Si falla la red, intentamos el caché
                return caches.match(event.request);
            })
    );
});
