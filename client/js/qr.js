const QRScanner = {
    stream: null,
    interval: null,

    start(videoEl, onScan) {
        const container = videoEl.parentElement;

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            container.innerHTML = '<div style="color:#a0a0a0;padding:20px;text-align:center;">Camera not available.<br>Use the code below instead.</div>';
            return;
        }

        navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }
        }).then(stream => {
            QRScanner.stream = stream;
            videoEl.srcObject = stream;
            videoEl.setAttribute("playsinline", true);
            videoEl.setAttribute("muted", true);
            videoEl.play();

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d", { willReadFrequently: true });

            QRScanner.interval = setInterval(() => {
                if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
                    canvas.width = videoEl.videoWidth;
                    canvas.height = videoEl.videoHeight;
                    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const code = jsQR(imageData.data, imageData.width, imageData.height, {
                        inversionAttempts: "dontInvert"
                    });
                    if (code && code.data && code.data.trim().length === 6) {
                        onScan(code.data.trim().toUpperCase());
                    }
                }
            }, 300);
        }).catch(err => {
            console.warn("Camera blocked:", err.name);
            container.innerHTML = `<div style="color:#a0a0a0;padding:20px;text-align:center;">
                📷 Camera blocked (${err.name}).<br>
                <small>Allow camera permission and refresh,<br>or use the code below.</small>
            </div>`;
        });
    },

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
};

function generateQR(text, containerId) {
    const container = document.getElementById(containerId);
    if (!container) { console.error("QR container not found:", containerId); return; }

    container.innerHTML = '';

    if (typeof QRCode === 'undefined') {
        container.innerHTML = '<div style="color:red;padding:10px;">QR library failed to load.<br>Use the code below.</div>';
        return;
    }

    try {
        const qr = new QRCode(container, {
            text: text,
            width: 220,
            height: 220,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });
        console.log("QR generated for:", text, qr);
    } catch (e) {
        console.error("QR Generation failed:", e);
        container.innerHTML = `<div style="color:red;padding:10px;">QR failed: ${e.message}<br>Use code: <strong>${text}</strong></div>`;
    }
}
