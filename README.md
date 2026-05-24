# CrossDrop v1.0

CrossDrop is a high-speed, purely P2P AirDrop alternative that works across iOS, Android, macOS, and Windows. It uses WebRTC DataChannels over a local WiFi network or Mobile Hotspot to achieve true device-to-device speeds (50-65 MB/s) without routing traffic through cellular data limits.

## Features
- **Zero Mobile Data**: Strict LAN filtering forces traffic over internal router/hotspot bands.
- **16-Channel Multiplexing**: Splits files across 16 parallel un-ordered DataChannels to bypass TCP head-of-line blocking.
- **Auto-compression**: Silently gzips highly compressible text files via Web Workers before sending.
- **IndexedDB Resilience**: Resumes broken transfers seamlessly by caching chunks locally.
- **Nearby Devices**: IP-based subnet discovery eliminates the need to scan QR codes for users on the same WiFi.

## Running Locally

1. Install dependencies for the signaling server:
   ```bash
   cd server
   npm install
   ```

2. Start the signaling server:
   ```bash
   npm start
   ```
   (Runs on port 3000)

3. Serve the client static files (you can use Live Server, python http.server, etc.):
   ```bash
   cd client
   python3 -m http.server 8080
   ```

## Deployment
CrossDrop is designed to be easily deployed on Render.com using the included `render.yaml`. It spins up a Node.js web service for signaling and a Static Site for the frontend PWA.
