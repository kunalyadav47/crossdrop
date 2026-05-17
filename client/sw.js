const CACHE_NAME = 'crossdrop-v2';
const ASSETS = [
    '/',
    '/index.html',
    '/css/app.css',
    '/js/config.js',
    '/js/app.js',
    '/js/webrtc.js',
    '/js/transfer.js',
    '/js/qr.js',
    '/js/detect.js',
    '/icons/icon.svg',
    '/manifest.json'
];

self.addEventListener('install', (e) => {
    // Skip waiting to force the new service worker to activate immediately
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (e) => {
    // Claim clients immediately so the new SW takes control
    e.waitUntil(clients.claim());
    // Clear out old buggy caches (e.g., crossdrop-v1)
    e.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(keys.map(key => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        })
    );
});

// Network-first strategy for rapid development & reliability
self.addEventListener('fetch', (e) => {
    e.respondWith(
        fetch(e.request)
            .then(response => {
                // Clone and cache the fresh network response
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(e.request, clone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Fallback to cache ONLY if fully offline
                return caches.match(e.request);
            })
    );
});
