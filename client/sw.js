const CACHE = 'crossdrop-v2';
const PRECACHE = [
    '/', '/index.html', '/manifest.json',
    '/css/app.css',
    '/js/config.js', '/js/detect.js', '/js/qr.js',
    '/js/preflight.js', '/js/feedback.js', '/js/wizard.js',
    '/js/lobby.js', '/js/transfer.js', '/js/webrtc.js',
    '/js/trust-panel.js', '/js/orbit.js', '/js/app.js',
    '/icons/icon.svg', '/offline.html'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    // Never cache API/signaling calls
    if (e.request.url.includes('/socket.io') || e.request.url.includes('/speedtest')) return;
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
            if (resp.ok && e.request.method === 'GET') {
                const clone = resp.clone();
                caches.open(CACHE).then(c => c.put(e.request, clone));
            }
            return resp;
        }).catch(err => {
            if (e.request.mode === 'navigate') {
                return caches.match('/offline.html');
            }
            throw err;
        }))
    );
});
