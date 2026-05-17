const CACHE_NAME = 'crossdrop-v5-airdrop-clone';
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
    '/js/preflight.js',
    '/js/feedback.js',
    '/js/wizard.js',
    '/js/lobby.js',
    '/js/trust-panel.js',
    '/js/orbit.js',
    '/icons/icon.svg',
    '/manifest.json'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(clients.claim());
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

self.addEventListener('fetch', (e) => {
    e.respondWith(
        fetch(e.request)
            .then(response => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(e.request, clone);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(e.request);
            })
    );
});
