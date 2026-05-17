const QRScanner = {
    stream: null,
    interval: null,
    start(videoEl, onScan) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(function(stream) {
            document.getElementById('scanner-overlay').innerHTML = ''; // Clear error if any
            QRScanner.stream = stream;
            videoEl.srcObject = stream;
            videoEl.setAttribute("playsinline", true);
            videoEl.play();
            
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d", { willReadFrequently: true });

            QRScanner.interval = setInterval(() => {
                if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
                    canvas.height = videoEl.videoHeight;
                    canvas.width = videoEl.videoWidth;
                    context.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                    const code = jsQR(imageData.data, imageData.width, imageData.height, {
                        inversionAttempts: "dontInvert",
                    });
                    if (code && code.data.length === 6) {
                        onScan(code.data);
                    }
                }
            }, 500);
        }).catch(err => {
            console.warn("Camera access denied or unavailable", err);
            const overlay = document.getElementById('scanner-overlay');
            if (overlay) {
                overlay.innerHTML = '<div style="color:var(--danger-color); padding: 40px 20px; text-align: center; background: rgba(0,0,0,0.8); width:100%; height:100%; display:flex; align-items:center; justify-content:center; flex-direction:column; gap: 10px;"><span>📷 Camera Blocked</span><span style="font-size:12px; color:var(--text-muted);">Type code manually below</span></div>';
            }
        });
    },
    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
};

function generateQR(text, canvas) {
    QRCode.toCanvas(canvas, text, {
        width: 250,
        margin: 2,
        color: {
            dark: "#000000",
            light: "#ffffff"
        }
    }, function (error) {
        if (error) console.error(error);
    });
}
