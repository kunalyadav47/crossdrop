/**
 * TrustPanel — live connection stats
 * Shows: route IPs, path type, RTT, channel count, bytes sent/received
 */
window.TrustPanel = {
    timer: null,
    totalSent: 0,
    totalRecv: 0,

    start(peer) {
        this.peer = peer;
        this.totalSent = 0;
        this.totalRecv = 0;
        clearInterval(this.timer);
        this.timer = setInterval(() => this._update(), 2000);
        this._update();
    },

    stop() {
        clearInterval(this.timer);
        this.timer = null;
        this.peer  = null;
    },

    async _update() {
        if (!this.peer) return;
        try {
            const stats = await this.peer.getStats();
            let localIp = '—', remoteIp = '—', rtt = '—', path = '—';
            let bytesSent = 0, bytesRecv = 0;

            stats.forEach(r => {
                if (r.type === 'candidate-pair' && r.state === 'succeeded') {
                    const loc = stats.get(r.localCandidateId);
                    const rem = stats.get(r.remoteCandidateId);
                    if (loc) localIp  = (loc.ip || loc.address || '?') + ':' + (loc.port || '?');
                    if (rem) remoteIp = (rem.ip || rem.address || '?') + ':' + (rem.port || '?');
                    rtt  = r.currentRoundTripTime ? (r.currentRoundTripTime * 1000).toFixed(0) + ' ms' : '—';
                    if (loc && rem) {
                        const lt = loc.candidateType, rt = rem.candidateType;
                        path = lt === 'host' && rt === 'host' ? '🟢 Direct LAN'
                             : lt === 'relay' || rt === 'relay' ? '🔴 Relay (TURN)'
                             : '🟡 Internet';
                    }
                }
                if (r.type === 'data-channel') {
                    bytesSent += r.bytesSent || 0;
                    bytesRecv += r.bytesReceived || 0;
                }
            });

            this.totalSent = bytesSent;
            this.totalRecv = bytesRecv;

            const set = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.textContent = val;
            };

            set('tp-route-loc', localIp);
            set('tp-route-rem', remoteIp);
            set('tp-path',  path);
            set('tp-rtt',   rtt);
            set('tp-sent', (bytesSent / 1048576).toFixed(2) + ' MB');
            set('tp-recv', (bytesRecv / 1048576).toFixed(2) + ' MB');

            // Channel dots
            const dotsEl = document.getElementById('tp-channels');
            if (dotsEl && WebRTC.dataChannels) {
                dotsEl.innerHTML = WebRTC.dataChannels
                    .map(ch => ch
                        ? `<span style="color:${ch.readyState==='open'?'var(--lime)':'#888'}">●</span>`
                        : `<span style="color:#444">●</span>`)
                    .join('');
            }
        } catch(e) { /* peer closed */ }
    }
};
