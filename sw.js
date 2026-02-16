const CACHE_NAME = 'avantix-v24';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/main.js',
    '/img/avantix_one_logo.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => response || fetch(event.request))
    );
});
