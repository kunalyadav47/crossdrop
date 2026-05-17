const QRScanner = {
    stream: null,
    interval: null,
    start(videoEl, onScan) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn("Camera API not available. This usually requires HTTPS or localhost.");
            // Script won't crash now. User can gracefully use manual fallback code input.
            return;
        }

        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(function(stream) {
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
