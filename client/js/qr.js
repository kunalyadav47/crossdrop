const QRScanner = {
    stream: null,
    interval: null,

    start(videoEl, onScan) {
        const container = videoEl.parentElement;
        if (!navigator.mediaDevices?.getUserMedia) {
            container.innerHTML = `<div class="cam-blocked">📷 Camera not available<br><small>Use the code below instead</small></div>`;
            return;
        }
        navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        }).then(stream => {
            QRScanner.stream = stream;
            videoEl.srcObject = stream;
            videoEl.play();
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            QRScanner.interval = setInterval(() => {
                if (videoEl.readyState !== videoEl.HAVE_ENOUGH_DATA) return;
                canvas.width  = videoEl.videoWidth;
                canvas.height = videoEl.videoHeight;
                ctx.drawImage(videoEl, 0, 0);
                const img  = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
                if (code?.data) {
                    // Accept full URL with hash OR bare 6-char code
                    let found = '';
                    try {
                        const url  = new URL(code.data);
                        const hash = url.hash.replace('#','').trim().toUpperCase();
                        if (hash.length === 6) found = hash;
                    } catch {
                        const bare = code.data.trim().toUpperCase();
                        if (bare.length === 6) found = bare;
                    }
                    if (found) { QRScanner.stop(); onScan(found); }
                }
            }, 250);
        }).catch(err => {
            console.warn('Camera blocked:', err.name);
            container.innerHTML = `<div class="cam-blocked">📷 Camera blocked (${err.name})<br><small>Allow camera permission and refresh,<br>or type the code below</small></div>`;
        });
    },

    stop() {
        this.stream?.getTracks().forEach(t => t.stop());
        this.stream = null;
        clearInterval(this.interval);
        this.interval = null;
    }
};

function generateQR(text, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    if (typeof QRCode === 'undefined') {
        container.innerHTML = `<div style="padding:12px;color:#888">QR failed to load — use code below</div>`;
        return;
    }
    // Encode full URL with hash so scanning auto-joins
    const shareUrl = window.location.origin + window.location.pathname + '#' + text;
    try {
        new QRCode(container, {
            text: shareUrl,
            width: 200, height: 200,
            colorDark: '#000000', colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
    } catch (e) {
        container.innerHTML = `<div style="padding:12px;color:red">QR Error: ${e.message}</div>`;
    }
}

window.QRScanner = QRScanner;
