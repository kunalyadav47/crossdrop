window.TrustPanel = {
    interval: null,
    cellularBytes: 0,
    lastSent: 0,
    lastRecv: 0,
    
    start(peer) {
        this.stop();
        this.cellularBytes = 0;
        this.lastSent = 0;
        this.lastRecv = 0;
        
        const el = document.getElementById('trust-panel');
        if (el) el.classList.remove('hidden');
        
        this.interval = setInterval(async () => {
            if (!peer || peer.iceConnectionState === 'closed') return this.stop();
            
            try {
                const stats = await peer.getStats();
                let rtt = 0, sent = 0, recv = 0;
                let locIp = '-', remIp = '-', locType = '-', remType = '-';
                let netType = 'unknown';
                
                stats.forEach(r => {
                    if (r.type === 'candidate-pair' && r.state === 'succeeded') {
                        rtt = r.currentRoundTripTime || 0;
                        sent = r.bytesSent || 0;
                        recv = r.bytesReceived || 0;
                        
                        const loc = stats.get(r.localCandidateId);
                        const rem = stats.get(r.remoteCandidateId);
                        if (loc) { locIp = loc.ip || loc.address; locType = loc.candidateType; netType = loc.networkType || 'unknown'; }
                        if (rem) { remIp = rem.ip || rem.address; remType = rem.candidateType; }
                    }
                });
                
                const dSent = sent - this.lastSent;
                const dRecv = recv - this.lastRecv;
                this.lastSent = sent;
                this.lastRecv = recv;
                
                if (netType === 'cellular' || (locIp && locIp !== '-' && !WebRTC.isPrivateIp(locIp) && WebRTC.networkMode !== 'strict')) {
                    this.cellularBytes += (dSent + dRecv);
                }
                
                const format = (b) => (b / 1024 / 1024).toFixed(2) + ' MB';
                
                const eLoc = document.getElementById('tp-route-loc'); if(eLoc) eLoc.textContent = locIp;
                const eRem = document.getElementById('tp-route-rem'); if(eRem) eRem.textContent = remIp;
                const ePath = document.getElementById('tp-path'); if(ePath) ePath.textContent = `Direct (${locType}↔${remType})`;
                const eRtt = document.getElementById('tp-rtt'); if(eRtt) eRtt.textContent = `${(rtt * 1000).toFixed(1)}ms`;
                const eCell = document.getElementById('tp-cell'); 
                if(eCell) {
                    eCell.textContent = `${(this.cellularBytes / 1024).toFixed(1)} KB ${this.cellularBytes === 0 ? '✓' : '⚠️'}`;
                    eCell.style.color = this.cellularBytes === 0 ? 'var(--accent-lime)' : 'var(--accent-red)';
                }
                const eSent = document.getElementById('tp-sent'); if(eSent) eSent.textContent = format(sent);
                const eRecv = document.getElementById('tp-recv'); if(eRecv) eRecv.textContent = format(recv);
                
                const channels = WebRTC.dataChannels || [];
                const openCount = channels.filter(c => c.readyState === 'open').length;
                let chHTML = '';
                for (let i=0; i<WebRTC.NUM_CHANNELS; i++) {
                    chHTML += `<span style="display:inline-block;width:8px;height:4px;margin-right:2px;background:${i < openCount ? 'var(--accent-lime)' : '#333'}"></span>`;
                }
                chHTML += ` ${openCount}/${WebRTC.NUM_CHANNELS}`;
                const eChan = document.getElementById('tp-channels'); if(eChan) eChan.innerHTML = chHTML;
                
            } catch (e) {}
        }, 1000);
    },
    
    stop() {
        if (this.interval) clearInterval(this.interval);
        const el = document.getElementById('trust-panel');
        if (el) el.classList.add('hidden');
    }
};
