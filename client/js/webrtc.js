// BACKEND_URL is defined in config.js (loaded first)
const socket = io(BACKEND_URL, {
  transports: ['websocket'],
  upgrade: false
});

const WebRTC = {
    peer: null,
    dataChannels: [],
    roomId: null,
    isSender: false,
    NUM_CHANNELS: 16,          // ← bumped from 12 for max throughput
    connected: false,
    _peerName: '',

    networkMode: 'strict',
    sctpMaxMessageSize: 256 * 1024,
    safetyAbortTimer: null,
    connectionType: 'unknown',

    isPrivateIp(ip) {
        if (!ip) return false;
        if (ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) return true;
        if (ip.startsWith('10.')) return true;
        if (ip.startsWith('192.168.')) return true;
        if (ip.startsWith('127.')) return true;
        const m = ip.match(/^172\.(\d+)\./);
        if (m && +m[1] >= 16 && +m[1] <= 31) return true;
        if (ip.endsWith('.local')) return true;
        return false;
    },

    parseCandidate(candStr) {
        const parts = candStr.split(' ');
        const ip = parts[4] || '';
        const typeIndex = parts.indexOf('typ');
        const type = typeIndex !== -1 ? parts[typeIndex + 1] : 'unknown';
        const costMatch = candStr.match(/network-cost (\d+)/);
        const cost = costMatch ? parseInt(costMatch[1], 10) : null;
        const idMatch = candStr.match(/network-id (\d+)/);
        const id = idMatch ? parseInt(idMatch[1], 10) : null;
        const info = { ip, type, cost, id };
        console.log('parseCandidate ->', candStr, '=>', info);
        return info;
    },

    startReceiver() {
        this.isSender = false;
        this.roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        const codeEl = document.getElementById('room-code');
        if (codeEl) codeEl.textContent = this.roomId;
        generateQR(this.roomId, 'qr-container');

        // Put room code in URL hash so sender can share link
        window.location.hash = this.roomId;

        this.setupPeer();
        socket.emit('join-room', this.roomId, window.myName);
    },

    joinRoom(code) {
        console.log('WebRTC.joinRoom called with code:', code);
        this.isSender = true;
        this.roomId = code.trim().toUpperCase();

        const waiting = document.getElementById('send-waiting');
        if (waiting) {
            waiting.classList.remove('hidden');
            if (!socket.connected) {
                waiting.textContent = "❌ Not connected to server. Reload the page.";
                return;
            }
            waiting.textContent = "Joining room…";
        }

        this.setupPeer();
        socket.emit('join-room', this.roomId, window.myName);

        setTimeout(() => {
            if (waiting) waiting.textContent = "Creating connection offer…";
            this.makeOffer();
        }, 1500);
    },

    setupPeer() {
        console.log('WebRTC.setupPeer: creating RTCPeerConnection');
        this.peer = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        });

        if (this.networkMode === 'strict') {
            clearTimeout(this.safetyAbortTimer);
            this.safetyAbortTimer = setTimeout(() => {
                if (!this.connected) {
                    const wait = this.isSender
                        ? document.getElementById('send-waiting')
                        : document.getElementById('receive-waiting');
                    if (wait) wait.textContent = "❌ No LAN path found. Ensure both devices are on the SAME WiFi, or loosen Network Rules in ⚙ Advanced.";
                    if (window.Feedback) window.Feedback.play('error');
                    if (this.peer) { this.peer.close(); this.peer = null; }
                }
            }, 15000);
        }

        this.peer.onicecandidate = (e) => {
            if (!e.candidate) return;
            const candStr = e.candidate.candidate || '';
            const candInfo = this.parseCandidate(candStr);
            console.log('onicecandidate:', candStr, candInfo, 'networkMode=', this.networkMode);

            // Filtering with logs to understand why candidates may be rejected
            if (this.networkMode === 'strict') {
                if (candInfo.type !== 'host' || !this.isPrivateIp(candInfo.ip)) {
                    console.log('onicecandidate: rejected (strict) - type/ip', candInfo.type, candInfo.ip);
                    return;
                }
                if (candInfo.cost !== null && candInfo.cost >= 900) { console.log('onicecandidate: rejected cost', candInfo.cost); return; }
            } else if (this.networkMode === 'wifi') {
                if (candInfo.type === 'relay') { console.log('onicecandidate: rejected relay'); return; }
                if (candInfo.cost !== null && candInfo.cost >= 900) { console.log('onicecandidate: rejected cost', candInfo.cost); return; }
            }

            console.log('onicecandidate: emitting candidate');
            socket.emit('ice-candidate', this.roomId, e.candidate);
        };

        this.peer.oniceconnectionstatechange = () => {
            const state = this.peer ? this.peer.iceConnectionState : 'closed';
            console.log('WebRTC.oniceconnectionstatechange ->', state);
            const el = this.isSender
                ? document.getElementById('send-waiting')
                : document.getElementById('receive-waiting');
            if (el) {
                el.classList.remove('hidden');
                if (state === 'checking') el.textContent = "Checking network path…";
                if (state === 'connected' || state === 'completed') {
                    el.textContent = "✅ ICE Connected! Verifying route…";
                    this.verifyAndFinalize();
                }
                if (state === 'failed') {
                    el.textContent = this.networkMode === 'strict'
                        ? "❌ Strict LAN: no direct route. Try 'WiFi Router' mode in ⚙ Advanced."
                        : "❌ Connection failed. Ensure devices can reach each other.";
                    if (window.Feedback) window.Feedback.play('error');
                }
                if (state === 'disconnected') el.textContent = "⚠️ Peer disconnected.";
            }
        };

        if (this.isSender) {
            const sorted = [];
            for (let i = 0; i < this.NUM_CHANNELS; i++) {
                const dc = this.peer.createDataChannel(`ch-${i}`, { ordered: false, maxRetransmits: 0 });
                console.log('WebRTC.setupPeer: created datachannel ch-' + i);
                this.setupDataChannel(dc, i);
                sorted.push(dc);
            }
            this.dataChannels = sorted;
        } else {
            this.peer.ondatachannel = (e) => {
                console.log('WebRTC.ondatachannel ->', e.channel.label);
                const idx = parseInt(e.channel.label.split('-')[1], 10) || this.dataChannels.length;
                this.setupDataChannel(e.channel, idx);
                this.dataChannels[idx] = e.channel;
                const opened = this.dataChannels.filter(Boolean).length;
                const el = document.getElementById('receive-waiting');
                if (el) el.textContent = `Channels ${opened}/${this.NUM_CHANNELS} open…`;
            };
        }
    },

    setupDataChannel(dc, idx) {
        dc.binaryType = 'arraybuffer';
        dc.bufferedAmountLowThreshold = 2 * 1024 * 1024;
        dc.onopen  = () => { console.log('DataChannel.onopen ->', dc.label, 'idx=', idx); this.verifyAndFinalize(); };
        dc.onmessage = (e) => { if (window.FileTransfer) window.FileTransfer.onMessage(e.data); };
        dc.onclose = () => { if (this.connected) this.disconnect(); };
        dc.onbufferedamountlow = () => {
            if (dc._onLowBuffer) {
                const resolve = dc._onLowBuffer;
                dc._onLowBuffer = null;
                resolve();
            }
        };
    },

    async getRTT() {
        if (!this.peer || !this.connected) return 50;
        try {
            const stats = await this.peer.getStats();
            let rtt = 50;
            stats.forEach(report => {
                if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                    if (report.currentRoundTripTime !== undefined) {
                        rtt = report.currentRoundTripTime * 1000;
                    }
                }
            });
            return rtt;
        } catch (e) { return 50; }
    },

    async verifyAndFinalize() {
        console.log('WebRTC.verifyAndFinalize: enter, connected=', this.connected);
        if (this.connected || !this.peer) return;

        const iceState = this.peer.iceConnectionState;
        const iceReady = iceState === 'connected' || iceState === 'completed';
        const validChannels = this.dataChannels.filter(Boolean);
        const minChannels = Math.min(4, this.NUM_CHANNELS);
        const channelsReady = validChannels.length >= minChannels
                   && validChannels.every(c => c.readyState === 'open');

        console.log('WebRTC.verifyAndFinalize: iceState=', iceState, 'validChannels=', validChannels.length, 'channelsReady=', channelsReady);

        if (!iceReady || !channelsReady) return;

        clearTimeout(this.safetyAbortTimer);

            try {
            const stats = await this.peer.getStats();
                console.log('WebRTC.verifyAndFinalize: stats fetched');
                console.log('WebRTC.verifyAndFinalize: got stats, entries=', stats.size || '(collection)');
            let localType = '', remoteType = '', localIp = '', remoteIp = '', networkType = 'unknown';

            stats.forEach(report => {
                if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                    const loc = stats.get(report.localCandidateId);
                    const rem = stats.get(report.remoteCandidateId);
                    if (loc && rem) {
                        localType = loc.candidateType; remoteType = rem.candidateType;
                        localIp = loc.ip || loc.address; remoteIp = rem.ip || rem.address;
                        networkType = loc.networkType || 'unknown';
                    }
                }
            });

            const isPureLan = localType === 'host' && remoteType === 'host'
                           && this.isPrivateIp(localIp) && this.isPrivateIp(remoteIp);

            if (this.networkMode === 'strict' && !isPureLan) {
                const wait = this.isSender
                    ? document.getElementById('send-waiting')
                    : document.getElementById('receive-waiting');
                console.warn('WebRTC.verifyAndFinalize: Strict LAN required but pure LAN not detected. Falling back to wifi mode.');
                if (wait) wait.textContent = "⚠️ Internet path detected in Strict LAN mode. Falling back to 'WiFi Router' mode…";

                // If we've already retried once, don't loop — give up and show error
                if (this._relaxedOnce) {
                    if (wait) wait.textContent = "❌ No direct route found. Try changing Network mode in ⚙ Advanced.";
                    if (window.Feedback) window.Feedback.play('error');
                    this.peer.close(); this.peer = null; this.dataChannels = [];
                    return;
                }

                // Mark we've relaxed once to avoid infinite retries
                this._relaxedOnce = true;
                // Switch to wifi mode and restart negotiation by tearing down and re-creating the peer
                this.networkMode = 'wifi';
                console.log('WebRTC.verifyAndFinalize: relaxing networkMode -> wifi and retrying negotiation');
                if (wait) wait.textContent = "Retrying connection with relaxed network rules…";

                // Close current peer and clear data channels
                if (this.peer) { try { this.peer.close(); } catch(e){} }
                this.peer = null; this.dataChannels = [];

                // Re-init peer and restart offer/answer depending on role
                setTimeout(() => {
                    try {
                        this.setupPeer();
                        if (this.isSender) {
                            // Re-join and create a fresh offer
                            if (this.roomId) socket.emit('join-room', this.roomId, window.myName);
                            this.makeOffer();
                        } else {
                            // Receiver: join room to ensure signalling is ready
                            if (this.roomId) socket.emit('join-room', this.roomId, window.myName);
                        }
                    } catch (e) { console.warn('Relax retry failed', e); }
                }, 600);

                return;
            }

            if (this.networkMode === 'wifi' && networkType === 'cellular') {
                const wait = this.isSender
                    ? document.getElementById('send-waiting')
                    : document.getElementById('receive-waiting');
                if (wait) wait.textContent = "❌ Cellular path detected. Aborted to save data.";
                if (window.Feedback) window.Feedback.play('error');
                this.peer.close(); this.peer = null; this.dataChannels = [];
                return;
            }

            this.connectionType = isPureLan ? 'lan'
                                : (localType === 'relay' || remoteType === 'relay') ? 'relay'
                                : 'internet';

            this.connected = true;
            if (window.Feedback) window.Feedback.play('paired');
            console.log('WebRTC.verifyAndFinalize: connection finalized, calling onConnected, peerName=', this._peerName, 'isSender=', this.isSender);
            this.onConnected(this._peerName);
            if (window.TrustPanel) window.TrustPanel.start(this.peer);

        } catch (e) {
            console.error("Verification failed", e);
            if (this.networkMode === 'strict' && this.peer) { this.peer.close(); return; }
            this.connectionType = 'unknown';
            this.connected = true;
            if (window.Feedback) window.Feedback.play('paired');
            console.log('WebRTC.verifyAndFinalize: verification failed but falling back to connected=true; calling onConnected');
            this.onConnected(this._peerName);
            if (window.TrustPanel) window.TrustPanel.start(this.peer);
        }
    },

    async makeOffer() {
        try {
            const offer = await this.peer.createOffer();
            await this.peer.setLocalDescription(offer);
            socket.emit('offer', this.roomId, offer);
            const el = document.getElementById('send-waiting');
            if (el) el.textContent = "Offer sent, waiting for answer…";
        } catch (e) {
            console.error("makeOffer failed", e);
            const el = document.getElementById('send-waiting');
            if (el) el.textContent = "❌ Offer failed: " + e.message;
        }
    },

    onConnected(peerName) {
        console.log('WebRTC.onConnected ->', peerName, 'isSender=', this.isSender, 'connectionType=', this.connectionType);
        if (window.FileTransfer) window.FileTransfer.init();
        window.location.hash = ''; // clear hash after connect

        // Update peer header
        const peerNameEl = document.getElementById('peer-name');
        if (peerNameEl) peerNameEl.textContent = peerName || 'Unknown Device';

        // Update connection type badge
        const badge = document.getElementById('conn-type-badge');
        if (badge) {
            const type = this.connectionType;
            badge.textContent = type === 'lan' ? '🛡️ Pure LAN' : type === 'relay' ? '☁️ Relay' : '🌐 Internet';
            badge.className = 'conn-badge ' + (type === 'lan' ? 'badge-lan' : 'badge-internet');
        }

        if (this.isSender) {
            document.getElementById('sender-panel').classList.remove('hidden');
            document.getElementById('receiver-panel').classList.add('hidden');
        } else {
            document.getElementById('receiver-panel').classList.remove('hidden');
            document.getElementById('sender-panel').classList.add('hidden');
        }

        try { showView('connected'); } catch (e) { console.warn('showView failed in onConnected', e); }
    },

    disconnect() {
        if (window.TrustPanel) window.TrustPanel.stop();
        if (window.Orbit) window.Orbit.stop();
        if (window.FileTransfer) window.FileTransfer.reset();
        if (this.peer) { this.peer.close(); this.peer = null; }
        this.dataChannels = [];
        this.connected = false;
        this.isSender = false;
        this.roomId = null;
        this.connectionType = 'unknown';
        window.location.hash = '';
        socket.disconnect();
        socket.connect();
    }
};

// ── Socket Status Dot ──────────────────────────────────────────────────────
socket.on('connect', () => {
    const txt = document.getElementById('status-text');
    const dot = document.querySelector('.status-dot');
    if (txt) txt.textContent = 'Ready';
    if (dot) { dot.classList.add('online'); dot.classList.remove('offline'); }
});

socket.on('disconnect', () => {
    const txt = document.getElementById('status-text');
    const dot = document.querySelector('.status-dot');
    if (txt) txt.textContent = 'Offline';
    if (dot) { dot.classList.add('offline'); dot.classList.remove('online'); }
});

// ── Signaling Handlers ─────────────────────────────────────────────────────
WebRTC._peerName = '';

socket.on('user-joined', (id, deviceName) => {
    WebRTC._peerName = deviceName;
    if (!WebRTC.isSender) {
        const wait = document.getElementById('receive-waiting');
        if (wait) { wait.classList.remove('hidden'); wait.textContent = '📶 Sender found! Waiting for offer…'; }
    }
});

socket.on('offer', async (id, offer) => {
    if (!WebRTC.isSender) {
        const wait = document.getElementById('receive-waiting');
        if (wait) wait.textContent = "Offer received, connecting…";
        try {
            console.log('socket: offer received from', id);
            await WebRTC.peer.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await WebRTC.peer.createAnswer();
            console.log('socket: created answer, setting local description');
            await WebRTC.peer.setLocalDescription(answer);
            socket.emit('answer', WebRTC.roomId, answer);
        } catch (e) {
            console.error("Answer creation failed", e);
            if (wait) wait.textContent = "❌ Answer failed: " + e.message;
        }
    }
});

socket.on('answer', async (id, answer) => {
    if (WebRTC.isSender) {
        const wait = document.getElementById('send-waiting');
        if (wait) wait.textContent = 'Answer received, finalising ICE…';
        try {
            console.log('socket: answer received from', id);
            await WebRTC.peer.setRemoteDescription(new RTCSessionDescription(answer));
            console.log('socket: remote description set from answer');
        } catch (e) {
            console.error('Set answer failed', e);
            if (wait) wait.textContent = '❌ Set answer failed: ' + e.message;
        }
    }
});

socket.on('ice-candidate', async (id, candidate) => {
    if (!WebRTC.peer) return;
    try {
        const candStr = candidate.candidate || '';
        const candInfo = WebRTC.parseCandidate(candStr);
        if (WebRTC.networkMode === 'strict') {
            if (candInfo.type !== 'host' || !WebRTC.isPrivateIp(candInfo.ip)) return;
            if (candInfo.cost !== null && candInfo.cost >= 900) return;
        } else if (WebRTC.networkMode === 'wifi') {
            if (candInfo.type === 'relay') return;
            if (candInfo.cost !== null && candInfo.cost >= 900) return;
        }
        await WebRTC.peer.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
        console.warn('ICE candidate add failed', e.message);
    }
});

socket.on('user-disconnected', () => {
    if (!WebRTC.connected) return;
    WebRTC.disconnect();
    if (window.Feedback) window.Feedback.play('error');
    showView('home');
    // Show a non-blocking toast instead of alert
    if (window.showToast) showToast('📴 Peer disconnected');
});
