const QRScanner = {
    stream: null,
    interval: null,
    start(videoEl, onScan) {
        const label = document.querySelector('.manual-entry span');
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn("Camera API not available.");
            if (label) label.textContent = "Camera unavailable. Enter code:";
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
            if (label) label.textContent = "Camera blocked. Enter code:";
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

function generateQR(text, imgEl) {
    if (typeof QRCode === 'undefined') {
        console.error("QRCode library failed to load");
        return;
    }
    QRCode.toDataURL(text, {
        width: 250,
        margin: 2,
        color: {
            dark: "#000000",
            light: "#ffffff"
        }
    }, function (error, url) {
        if (error) {
            console.error("QR Error", error);
        } else {
            imgEl.src = url;
        }
    });
}
