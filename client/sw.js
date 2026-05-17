const CACHE_NAME = 'crossdrop-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/css/app.css',
    '/js/app.js',
    '/js/webrtc.js',
    '/js/transfer.js',
    '/js/qr.js',
    '/js/detect.js',
    '/icons/icon.svg',
    '/manifest.json'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => response || fetch(e.request))
    );
});
