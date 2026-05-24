/**
 * Preflight — network diagnostics
 * Checks: online, wifi vs cellular, estimated bandwidth
 */
window.Preflight = {
    async run() {
        if (!navigator.onLine) {
            return { status: '❌ No Internet — connect to WiFi hotspot', message: 'No network connection detected.' };
        }

        // Connection type check (where supported)
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (conn) {
            const type = conn.type || '';
            const eff  = conn.effectiveType || '';
            if (type === 'cellular' || eff === '2g' || eff === '3g') {
                return {
                    status: '⚠️ Cellular detected — switch to WiFi',
                    message: 'CrossDrop works best over WiFi hotspot, not mobile data.',
                    hotspotSuspected: false
                };
            }
        }

        // Bandwidth test via backend
        let mbps = 0;
        try {
            const start = performance.now();
            const resp  = await fetch(BACKEND_URL + '/speedtest?t=' + Date.now(), { cache: 'no-store' });
            await resp.blob();
            const elapsed = (performance.now() - start) / 1000;
            mbps = (2 / elapsed); // 2 MB payload
        } catch (e) {
            return {
                status: '⚠️ Server unreachable — check URL in config.js',
                message: 'Cannot reach the CrossDrop signaling server.'
            };
        }

        if (mbps < 5) {
            return {
                status: `⚠️ Slow: ${mbps.toFixed(1)} MB/s — try 5GHz hotspot`,
                message: `Network is ${mbps.toFixed(1)} MB/s. Switch iPhone hotspot to 5GHz for best speed.`,
                hotspotSuspected: true
            };
        }

        if (mbps < 15) {
            return {
                status: `⚡ OK: ${mbps.toFixed(1)} MB/s (2.4GHz?)`,
                message: `Network is ${mbps.toFixed(1)} MB/s. 5GHz hotspot could double this.`,
                hotspotSuspected: true
            };
        }

        return {
            status: `✅ Ready — ${mbps.toFixed(0)} MB/s`,
            message: `Network is fast at ${mbps.toFixed(0)} MB/s. You're good to go!`
        };
    }
};
