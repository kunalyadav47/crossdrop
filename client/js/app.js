// BACKEND_URL is defined in config.js — loaded before this file

window.myName = generateDeviceName();

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('my-device-name').textContent = window.myName;
    
    if (window.FileTransfer) {
        window.FileTransfer.init();
    }

    const views = {
        home: document.getElementById('view-home'),
        send: document.getElementById('view-send'),
        receive: document.getElementById('view-receive'),
    };

    function showView(viewName) {
        Object.values(views).forEach(v => v.classList.remove('active'));
        views[viewName].classList.add('active');
    }

    document.getElementById('btn-send').addEventListener('click', () => {
        showView('send');
        QRScanner.start(document.getElementById('scanner-video'), (code) => {
            QRScanner.stop();
            document.getElementById('manual-code').value = code;
            WebRTC.joinRoom(code);
        });
    });

    document.getElementById('btn-receive').addEventListener('click', () => {
        showView('receive');
        WebRTC.startReceiver();
    });

    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            showView('home');
            WebRTC.disconnect();
            QRScanner.stop();
            
            // reset UI state
            document.getElementById('send-setup').classList.remove('hidden');
            document.getElementById('send-active').classList.add('hidden');
            document.getElementById('receive-setup').classList.remove('hidden');
            document.getElementById('receive-active').classList.add('hidden');
            document.getElementById('send-waiting').classList.add('hidden');
        });
    });

    document.getElementById('join-btn').addEventListener('click', () => {
        const code = document.getElementById('manual-code').value.trim().toUpperCase();
        if(code.length === 6) {
            QRScanner.stop();
            WebRTC.joinRoom(code);
        }
    });

    document.getElementById('close-tip').addEventListener('click', () => {
        document.getElementById('wifi-tip').classList.add('hidden');
        localStorage.setItem('crossdrop_tip_shown', 'true');
    });

    // Register Service Worker with forced auto-reload on update
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').then(reg => {
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
                        // SW updated, reload immediately to fetch fresh UI
                        window.location.reload();
                    }
                });
            });
        }).catch(err => {
            console.log('SW Registration failed: ', err);
        });

        let refreshing;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });
    }
});

// Check bandwidth for 5GHz prompt
window.addEventListener('load', async () => {
    if (!localStorage.getItem('crossdrop_tip_shown')) {
        const speed = await measureBandwidth();
        if (speed < 15) {
            document.getElementById('wifi-tip').classList.remove('hidden');
        } else {
            localStorage.setItem('crossdrop_tip_shown', 'true');
        }
    }
});

// Keep Render free server alive — ping every 10 minutes
setInterval(() => {
  fetch(BACKEND_URL + '/')
    .catch(() => {}); // silent fail is fine
}, 10 * 60 * 1000);