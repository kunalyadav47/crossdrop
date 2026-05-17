# CrossDrop

**AirDrop for everyone.**

CrossDrop is a cross-platform file sharing app that works between iPhone and Android (and any device) at near-AirDrop speeds, with zero app installation required. It uses WebRTC to establish a pure peer-to-peer connection for fast, private, and local transfers.

## Features
- **Cross-Platform:** Works on Safari (iPhone), Chrome (Android), Windows, Mac, etc.
- **Pure P2P:** Files never touch any server. They go directly between devices.
- **Parallel Chunking:** Transfers are split across 16 channels for maximum bandwidth utilization.
- **Smart Compression:** Automatically compresses text/code files on the fly.
- **No Installation:** Runs entirely in the browser (PWA supported).

## How to use
1. Connect both devices to the same local network.
   *(Tip: For the best experience, turn on your Mobile Hotspot and have the other device join it. **💡 Switch your hotspot to 5GHz in settings for 2x faster transfers**!)*
2. Open CrossDrop on both devices.
3. Tap **"📤 Send Files"** on the sending device. It will display a QR code.
4. Tap **"📥 Receive Files"** on the receiving device and scan the QR code.
5. Select files to send. They will instantly transfer!

## How to run locally
1. Ensure you have Node.js installed.
2. Run the following command in the terminal inside the `crossdrop` folder:
   ```bash
   npm install && node server/index.js
   ```
3. Open `http://localhost:3000` (or your local IP address, e.g., `http://192.168.1.5:3000`) on your devices.

## Deployment
For a permanent setup, you can deploy the `server/index.js` to any free hosting provider like Render or Railway. The signaling server is extremely lightweight and only used for the initial handshake.

## Browser Compatibility
| Browser | Support |
|---|---|
| Chrome (Android/Desktop) | ✅ Full |
| Safari (iOS/macOS) | ✅ Full (iOS 16.4+ for auto-compression, falls back gracefully) |
| Firefox | ✅ Full |
| Edge | ✅ Full |
