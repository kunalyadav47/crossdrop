document.addEventListener('DOMContentLoaded', async () => {

    // ── History ────────────────────────────────────────────────────────────
    window.loadHistory = function() {
        const historyEl = document.getElementById('history-content');
        if (!historyEl) return;
        let history = [];
        try { history = JSON.parse(localStorage.getItem('crossdrop_history') || '[]'); } catch(e){}
        if (history.length === 0) {
            historyEl.innerHTML = '<div style="color:var(--muted);text-align:center;font-size:12px;padding:8px;">No recent transfers</div>';
            return;
        }
        historyEl.innerHTML = history.slice(0, 5).map(h => `
            <div class="history-item">
                <div class="history-item-left">
                    <span style="font-weight:600;color:var(--text);">${h.filename}</span>
                    <span style="color:var(--muted);">${(h.size/1048576).toFixed(2)} MB • ${h.direction === 'send' ? '📤 Sent' : '📥 Received'}</span>
                </div>
                <div class="history-item-right">
                    <span style="color:var(--lime);">${h.speed} MB/s</span><br>
                    <span>${new Date(h.timestamp).toLocaleDateString()}</span>
                </div>
            </div>
        `).join('');
    };
    window.loadHistory();

    // ── Service Worker ─────────────────────────────────────────────────────
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(e => console.warn("SW reg failed", e));
    }

    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferredPrompt = e;
        window.deferredInstallPrompt = e; // Export for transfer.js to trigger
    });

    document.getElementById('btn-install-accept')?.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        document.getElementById('install-banner')?.classList.add('hidden');
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            deferredPrompt = null;
        }
    });

    document.getElementById('btn-install-dismiss')?.addEventListener('click', () => {
        document.getElementById('install-banner')?.classList.add('hidden');
    });

    // ── Device Name ────────────────────────────────────────────────────────
    window.myName = window.DeviceDetect ? window.DeviceDetect.generateName() : '📡 Device';
    const nameEl = document.getElementById('my-device-name');
    if (nameEl) nameEl.textContent = window.myName;

    // ── Toast helper ───────────────────────────────────────────────────────
    window.showToast = function(msg) {
        let toast = document.getElementById('toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add('toast-show');
        clearTimeout(toast._t);
        toast._t = setTimeout(() => toast.classList.remove('toast-show'), 3000);
    };

    // ── Sound ──────────────────────────────────────────────────────────────
    if (window.Feedback) window.Feedback.init();

    // Auto-show radar empty hint after 8s if no peers found
    setTimeout(() => {
        const radarSection = document.getElementById('radar-section');
        const hint = document.getElementById('radar-empty-hint');
        if (hint && radarSection && radarSection.classList.contains('hidden')) {
            hint.classList.remove('hidden');
            setTimeout(() => hint.classList.add('hidden'), 6000);
        }
    }, 8000);

    const muteToggle = document.getElementById('mute-toggle');
    if (muteToggle && window.Feedback) {
        muteToggle.checked = window.Feedback.muted;
        muteToggle.addEventListener('change', e => {
            window.Feedback.muted = e.target.checked;
            localStorage.setItem('crossdrop_muted', window.Feedback.muted);
        });
    }

    // ── Network Mode ───────────────────────────────────────────────────────
    const radios = document.querySelectorAll('input[name="net_mode"]');
    const savedMode = localStorage.getItem('crossdrop_net_mode') || 'strict';
    WebRTC.networkMode = savedMode;
    radios.forEach(r => {
        if (r.value === savedMode) r.checked = true;
        r.addEventListener('change', e => {
            if (e.target.checked) {
                WebRTC.networkMode = e.target.value;
                localStorage.setItem('crossdrop_net_mode', e.target.value);
            }
        });
    });

    // ── Preflight ──────────────────────────────────────────────────────────
    window.runDiagnostics = async function () {
        const pill = document.getElementById('preflight-pill');
        const text = document.getElementById('preflight-text');
        if (!pill || !window.Preflight) return;

        pill.className = 'preflight-pill pill-wait';
        text.textContent = 'Checking…';

        const result = await window.Preflight.run();
        text.textContent = result.status;

        if (result.status.includes('Ready')) pill.className = 'preflight-pill pill-ready';
        else if (result.status.includes('Hotspot')) pill.className = 'preflight-pill pill-warn';
        else pill.className = 'preflight-pill pill-error';

        pill.onclick = () => {
            if (result.hotspotSuspected || result.status.includes('No WiFi')) {
                if (window.Wizard) window.Wizard.show();
            } else {
                showToast('📶 ' + result.message);
            }
        };
    };
    runDiagnostics();

    // ── Bandwidth check (5 GHz banner) ─────────────────────────────────────
    if (!localStorage.getItem('crossdrop_bw_dismissed') && window.DeviceDetect) {
        window.DeviceDetect.measureBandwidth().then(mbps => {
            if (mbps < 15) {
                const banner = document.getElementById('bandwidth-banner');
                if (banner) banner.classList.remove('hidden');
            }
        });
    }
    document.getElementById('banner-dismiss')?.addEventListener('click', () => {
        document.getElementById('bandwidth-banner')?.classList.add('hidden');
        localStorage.setItem('crossdrop_bw_dismissed', '1');
    });

    // ── Keep-alive ping (prevent Render free-tier spin-down) ───────────────
    setInterval(() => fetch(BACKEND_URL + '/').catch(() => {}), 10 * 60 * 1000);

    // ── View Routing ───────────────────────────────────────────────────────
    window.showView = function (viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const target = document.getElementById('view-' + viewId);
        if (target) target.classList.add('active');
        if (viewId === 'home') runDiagnostics();
    };

    // ── Auto-join from URL hash ────────────────────────────────────────────
    const hash = window.location.hash.replace('#', '').trim().toUpperCase();
    if (hash.length === 6) {
        showView('send');
        const codeInput = document.getElementById('manual-code');
        if (codeInput) codeInput.value = hash;
        window.location.hash = '';
        // Small delay so socket connects first
        setTimeout(() => {
            window.QRScanner?.stop();
            WebRTC.joinRoom(hash);
        }, 800);
    }

    // ── SEND button ────────────────────────────────────────────────────────
    document.getElementById('btn-send')?.addEventListener('click', () => {
        showView('send');
        const videoEl = document.getElementById('scanner-video');
        if (videoEl && window.QRScanner) {
            window.QRScanner.start(videoEl, (scannedCode) => {
                window.QRScanner.stop();
                const codeInput = document.getElementById('manual-code');
                if (codeInput) codeInput.value = scannedCode;
                WebRTC.joinRoom(scannedCode);
            });
        }
    });

    // ── RECEIVE button ─────────────────────────────────────────────────────
    document.getElementById('btn-receive')?.addEventListener('click', () => {
        showView('receive');
        WebRTC.startReceiver();
        if (typeof socket !== 'undefined' && socket.connected) {
            socket.emit('register-lobby', window.myName);
        }
    });

    // ── Back buttons ───────────────────────────────────────────────────────
    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            window.QRScanner?.stop();
            if (WebRTC.connected) WebRTC.disconnect();
            showView('home');
        });
    });

    // ── Join by code ───────────────────────────────────────────────────────
    document.getElementById('join-btn')?.addEventListener('click', () => {
        const code = document.getElementById('manual-code')?.value?.trim().toUpperCase() || '';
        if (code.length === 6) {
            window.QRScanner?.stop();
            WebRTC.joinRoom(code);
        } else {
            showToast('Enter a 6-character room code');
        }
    });

    // Enter key on code input
    document.getElementById('manual-code')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('join-btn')?.click();
    });

    // ── Disconnect ─────────────────────────────────────────────────────────
    document.getElementById('btn-disconnect')?.addEventListener('click', () => {
        WebRTC.disconnect();
        showView('home');
    });

    // ── Share room code (receive view) ────────────────────────────────────
    document.getElementById('btn-share-code')?.addEventListener('click', () => {
        const code    = document.getElementById('room-code')?.textContent || '';
        const shareUrl = window.location.origin + window.location.pathname + '#' + code;
        if (navigator.share) {
            navigator.share({ title: 'CrossDrop', text: `Join my CrossDrop room: ${code}`, url: shareUrl })
                .catch(() => {});
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(shareUrl).then(() => showToast('🔗 Link copied!'));
        } else {
            showToast(`Code: ${code}`);
        }
    });

    // ── Incoming file modal buttons ───────────────────────────────────────
    document.getElementById('btn-accept')?.addEventListener('click', () => {
        window.FileTransfer?.acceptCurrentFile();
    });
    document.getElementById('btn-decline')?.addEventListener('click', () => {
        window.FileTransfer?.declineCurrentFile();
    });

    // ── Send Clipboard ──────────────────────────────────────────────────────
    document.getElementById('btn-clipboard')?.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (!text) { showToast('Clipboard is empty'); return; }
            const file = new File([text], `clipboard-${Date.now()}.txt`, { type: 'text/plain' });
            if (window.FileTransfer) window.FileTransfer.queueFiles([file]);
        } catch (e) {
            showToast('Clipboard access denied or unsupported');
        }
    });

    // ── Send as ZIP ───────────────────────────────────────────────────────
    document.getElementById('btn-zip')?.addEventListener('click', () => {
        if (window.FileTransfer && window.FileTransfer.sendQueue.length > 0) {
            window.FileTransfer.zipAndSendQueue();
        }
    });
});
