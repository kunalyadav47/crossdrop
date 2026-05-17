// BACKEND_URL is defined in config.js — loaded before this file

window.myName = generateDeviceName();

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('my-device-name').textContent = window.myName;

    const views = {
        home:      document.getElementById('view-home'),
        send:      document.getElementById('view-send'),
        receive:   document.getElementById('view-receive'),
        connected: document.getElementById('view-connected'),
    };

    // ── View switcher (inline style, avoids CSS class conflicts) ──
    window.showView = function(viewName) {
        Object.values(views).forEach(v => { v.style.display = 'none'; });
        if (views[viewName]) views[viewName].style.display = 'flex';
    };

    // Start on home
    showView('home');

    // ── SEND button — opens QR scanner to scan receiver's QR ──
    document.getElementById('btn-send').addEventListener('click', () => {
        showView('send');
        QRScanner.start(document.getElementById('scanner-video'), (code) => {
            QRScanner.stop();
            document.getElementById('manual-code').value = code;
            WebRTC.joinRoom(code);
        });
    });

    // ── RECEIVE button — generates room code and QR ──
    document.getElementById('btn-receive').addEventListener('click', () => {
        showView('receive');
        WebRTC.startReceiver();
    });

    // ── Manual code connect ──
    document.getElementById('join-btn').addEventListener('click', () => {
        const code = document.getElementById('manual-code').value.trim().toUpperCase();
        if (code.length === 6) {
            QRScanner.stop();
            WebRTC.joinRoom(code);
        } else {
            document.getElementById('send-waiting').textContent = '⚠️ Enter a 6-character code.';
            document.getElementById('send-waiting').classList.remove('hidden');
        }
    });

    // Allow pressing Enter in the code input
    document.getElementById('manual-code').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('join-btn').click();
    });

    // ── Back buttons (all views) ──
    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _resetToHome();
        });
    });

    // ── Disconnect button on the connected dashboard ──
    document.getElementById('btn-disconnect').addEventListener('click', () => {
        WebRTC.disconnect();
        _resetToHome();
    });

    // ── WiFi tip dismiss ──
    document.getElementById('close-tip').addEventListener('click', () => {
        document.getElementById('wifi-tip').classList.add('hidden');
        localStorage.setItem('crossdrop_tip_shown', 'true');
    });

    // ── Advanced: Allow Internet Route Toggle ──
    const internetToggle = document.getElementById('allow-internet-toggle');
    if (internetToggle) {
        const saved = localStorage.getItem('crossdrop_allow_internet') === 'true';
        internetToggle.checked = saved;
        WebRTC.allowInternetRoute = saved;
        WebRTC.localOnly = true; // Hardcode default localOnly safety
        
        internetToggle.addEventListener('change', () => {
            WebRTC.allowInternetRoute = internetToggle.checked;
            localStorage.setItem('crossdrop_allow_internet', internetToggle.checked);
            
            const guarantee = document.querySelector('.data-guarantee');
            if (guarantee) {
                guarantee.classList.toggle('data-guarantee-off', internetToggle.checked);
                const small = guarantee.querySelector('small');
                if (small) {
                    small.textContent = internetToggle.checked
                        ? '⚠️ Internet route enabled — transfers may use mobile data.'
                        : 'Transfers run on your LAN only — physically cannot use cellular data.';
                }
            }
        });
        
        // Trigger UI update immediately for loaded state
        if (saved) {
            const guarantee = document.querySelector('.data-guarantee');
            if (guarantee) {
                guarantee.classList.add('data-guarantee-off');
                const small = guarantee.querySelector('small');
                if (small) small.textContent = '⚠️ Internet route enabled — transfers may use mobile data.';
            }
        }
    }

    // ── Service Worker with forced update ──
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').then(reg => {
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
                        window.location.reload();
                    }
                });
            });
        }).catch(err => console.log('SW error:', err));

        let refreshing;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });
    }
});

// ── Reset everything back to home ──
function _resetToHome() {
    QRScanner.stop();
    WebRTC.disconnect();

    // Reset send view
    document.getElementById('send-setup').style.display = '';
    document.getElementById('send-waiting').classList.add('hidden');
    document.getElementById('send-waiting').textContent = '';
    document.getElementById('manual-code').value = '';

    // Reset receive view
    document.getElementById('receive-setup').style.display = '';
    document.getElementById('receive-waiting').classList.add('hidden');
    document.getElementById('receive-waiting').textContent = '';
    document.getElementById('qr-container').innerHTML = '';
    document.getElementById('room-code').textContent = '------';

    // Reset connected view
    document.getElementById('sender-panel').classList.add('hidden');
    document.getElementById('receiver-panel').classList.add('hidden');
    document.getElementById('send-queue').innerHTML = '';
    document.getElementById('receive-queue').innerHTML = '';
    document.getElementById('speed-bar-wrap').classList.add('hidden');
    document.getElementById('speed-bar-fill').style.width = '0%';
    document.getElementById('transfer-speed-label').textContent = '⚡ 0 MB/s';

    const badge = document.getElementById('connection-type-badge');
    if (badge) {
        badge.className = 'hidden conn-badge';
        badge.textContent = '';
    }

    showView('home');
}

// ── Bandwidth check for 5GHz tip ──
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

// ── Keep Render free server alive ──
setInterval(() => {
    fetch(BACKEND_URL + '/').catch(() => {});
}, 10 * 60 * 1000);