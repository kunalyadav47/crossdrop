document.addEventListener('DOMContentLoaded', async () => {
    // ---- PWA Service Worker ----
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(err => console.error("SW reg failed", err));
    }

    // ---- Init ----
    window.myName = window.DeviceDetect ? window.DeviceDetect.generateName() : 'Unknown Device';
    document.getElementById('my-device-name').textContent = window.myName;
    
    if (window.Feedback) window.Feedback.init();

    // ---- Mute Toggle ----
    const muteToggle = document.getElementById('mute-toggle');
    if (muteToggle && window.Feedback) {
        muteToggle.checked = window.Feedback.muted;
        muteToggle.addEventListener('change', (e) => {
            window.Feedback.muted = e.target.checked;
            localStorage.setItem('crossdrop_muted', window.Feedback.muted);
        });
    }

    // ---- Network Mode Toggle ----
    const radios = document.querySelectorAll('input[name="net_mode"]');
    if (radios.length > 0) {
        const savedMode = localStorage.getItem('crossdrop_net_mode') || 'strict';
        WebRTC.networkMode = savedMode;
        radios.forEach(r => {
            if (r.value === savedMode) r.checked = true;
            r.addEventListener('change', (e) => {
                if (e.target.checked) {
                    WebRTC.networkMode = e.target.value;
                    localStorage.setItem('crossdrop_net_mode', e.target.value);
                }
            });
        });
    }

    // ---- Preflight Probe ----
    window.runDiagnostics = async function() {
        const pill = document.getElementById('preflight-pill');
        const text = document.getElementById('preflight-text');
        if (!pill || !window.Preflight) return;
        
        pill.className = 'preflight-pill pill-wait';
        text.textContent = 'Checking...';
        
        const result = await window.Preflight.run();
        text.textContent = result.status;
        
        if (result.status.includes('Ready')) pill.className = 'preflight-pill pill-ready';
        else if (result.status.includes('Hotspot')) pill.className = 'preflight-pill pill-warn';
        else pill.className = 'preflight-pill pill-error';
        
        pill.onclick = () => {
            if (result.hotspotSuspected || result.status.includes('No WiFi')) {
                if(window.Wizard) window.Wizard.show();
            } else {
                alert(result.message + "\nIPs: " + result.ips.join(', '));
            }
        };
    };
    
    runDiagnostics();

    // ---- Views ----
    window.showView = function(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById('view-' + viewId).classList.add('active');
        if (viewId === 'home') runDiagnostics();
    };

    // ---- Buttons ----
    document.getElementById('btn-send').addEventListener('click', () => {
        showView('send');
        if(window.QRScanner) window.QRScanner.startScanner();
    });

    document.getElementById('btn-receive').addEventListener('click', () => {
        showView('receive');
        WebRTC.startReceiver();
        // Register lobby to show nearby devices
        if(typeof socket !== 'undefined' && socket.connected) {
            socket.emit('register-lobby', window.myName);
        }
    });

    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if(window.QRScanner) window.QRScanner.stopScanner();
            if(WebRTC.connected) WebRTC.disconnect();
            showView('home');
        });
    });

    document.getElementById('join-btn').addEventListener('click', () => {
        const code = document.getElementById('manual-code').value.toUpperCase();
        if (code.length === 6) {
            if(window.QRScanner) window.QRScanner.stopScanner();
            WebRTC.joinRoom(code);
        } else {
            alert("Enter a 6-character code");
        }
    });

    document.getElementById('btn-disconnect').addEventListener('click', () => {
        WebRTC.disconnect();
        showView('home');
    });

    // ---- File Selection ----
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    
    if (dropZone) {
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = 'var(--accent-lime)';
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.style.borderColor = 'var(--card-border)';
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = 'var(--card-border)';
            if (e.dataTransfer.files.length) {
                window.FileTransfer.queueFiles(e.dataTransfer.files);
            }
        });
        
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length) {
                window.FileTransfer.queueFiles(fileInput.files);
            }
            fileInput.value = '';
        });
    }

    // Modal buttons
    document.getElementById('btn-accept').addEventListener('click', () => {
        document.getElementById('incoming-modal').classList.add('hidden');
        window.FileTransfer.acceptCurrentFile();
    });
    document.getElementById('btn-decline').addEventListener('click', () => {
        document.getElementById('incoming-modal').classList.add('hidden');
        window.FileTransfer.declineCurrentFile();
    });
});