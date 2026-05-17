window.Preflight = {
    async run() {
        return new Promise((resolve) => {
            let status = 'Checking...';
            let ips = [];
            let networkType = 'Unknown';
            let hotspotSuspected = false;
            let message = 'Gathering network diagnostics...';

            if (navigator.connection) {
                networkType = navigator.connection.type || navigator.connection.effectiveType || 'Unknown';
            }

            const pc = new RTCPeerConnection({ iceServers: [], iceCandidatePoolSize: 10 });
            pc.createDataChannel('probe');

            const timeout = setTimeout(() => finishProbe(), 2000);

            pc.onicecandidate = (e) => {
                if (e.candidate) {
                    const c = e.candidate.candidate;
                    if (c.includes('typ host')) {
                        const ipMatch = c.split(' ')[4];
                        if (ipMatch && !ips.includes(ipMatch)) {
                            ips.push(ipMatch);
                        }
                    }
                }
            };

            pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(() => finishProbe());

            function finishProbe() {
                clearTimeout(timeout);
                pc.close();

                let hasLan = false;
                ips.forEach(ip => {
                    if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) || ip.startsWith('fe80:') || ip.endsWith('.local')) {
                        hasLan = true;
                    }
                });

                if (ips.length === 0) {
                    status = 'No WiFi LAN found';
                    message = 'Could not detect any local network interfaces. Check your WiFi.';
                } else if (hasLan) {
                    if (ips.length === 1 && (ips[0].startsWith('192.168.43.') || ips[0].startsWith('192.168.137.'))) {
                        status = 'Hotspot detected — may need fix';
                        message = 'We detected a common phone hotspot IP. AP Isolation might be active.';
                        hotspotSuspected = true;
                    } else {
                        status = 'Ready for Pure LAN transfer';
                        message = 'Full WiFi detected. Transfers should be blazing fast.';
                    }
                } else {
                    status = 'No LAN detected';
                    message = 'Only non-local IPs found. Connections might fail.';
                }

                resolve({ status, ips, networkType, hotspotSuspected, message });
            }
        });
    }
};
