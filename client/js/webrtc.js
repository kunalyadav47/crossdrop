// BACKEND_URL is defined in config.js
const socket = io(BACKEND_URL, {
  transports: ['websocket'],
  upgrade: false
});

const WebRTC = {
    peer: null,
    dataChannels: [],
    roomId: null,
    isSender: false,
    NUM_CHANNELS: 12,
    connected: false,
    _peerName: '',

    localOnly: true,
    allowInternetRoute: false,
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

    extractIpFromCandidate(candStr) {
        const parts = candStr.split(' ');
        return parts[4] || null;
    },

    startReceiver() {
        this.isSender = false;
        this.roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        document.getElementById('room-code').textContent = this.roomId;
        generateQR(this.roomId, 'qr-container');

        this.setupPeer();
        socket.emit('join-room', this.roomId, window.myName);
    },

    joinRoom(code) {
        this.isSender = true;
        this.roomId = code.trim().toUpperCase();

        const waiting = document.getElementById('send-waiting');
        waiting.classList.remove('hidden');

        if (!socket.connected) {
            waiting.textContent = "❌ Not connected to server. Reload the page.";
            return;
        }

        waiting.textContent = "Joining room...";
        this.setupPeer();
        socket.emit('join-room', this.roomId, window.myName);

        setTimeout(() => {
            waiting.textContent = "Creating connection offer...";
            this.makeOffer();
        }, 1500);
    },

    setupPeer() {
        this.peer = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 8
        });

        if (this.localOnly && !this.allowInternetRoute) {
            clearTimeout(this.safetyAbortTimer);
            this.safetyAbortTimer = setTimeout(() => {
                if (!this.connected) {
                    const wait = this.isSender ? document.getElementById('send-waiting') : document.getElementById('receive-waiting');
                    if (wait) wait.textContent = "❌ No LAN path found. Ensure both devices are on the SAME WiFi (not a hotspot with AP isolation), or enable 'Allow Internet Route' in Advanced settings.";
                    if (this.peer) { this.peer.close(); this.peer = null; }
                }
            }, 15000);
        }

        this.peer.onicecandidate = (e) => {
            if (e.candidate) {
                const candStr = e.candidate.candidate || '';
                const isHost = candStr.includes('typ host');
                const ip = this.extractIpFromCandidate(candStr);

                if (this.localOnly && !this.allowInternetRoute) {
                    if (!isHost || !this.isPrivateIp(ip)) {
                        console.log('[LAN-only 🛡️] blocked local non-private candidate:', candStr);
                        return;
                    }
                }
                socket.emit('ice-candidate', this.roomId, e.candidate);
            }
        };

        this.peer.oniceconnectionstatechange = () => {
            const state = this.peer.iceConnectionState;
            const el = this.isSender ? document.getElementById('send-waiting') : document.getElementById('receive-waiting');
            if (el) {
                el.classList.remove('hidden');
                if (state === 'checking') el.textContent = "Checking network path...";
                if (state === 'connected' || state === 'completed') {
                    el.textContent = "✅ ICE Connected! Verifying route...";
                    this.verifyAndFinalize();
                }
                if (state === 'failed') {
                    el.textContent = (this.localOnly && !this.allowInternetRoute)
                        ? "❌ Local-Only mode: no LAN route found. Disable Local-Only or use a real WiFi router (not hotspot AP-isolation)."
                        : "❌ Connection failed. Make sure both devices are on the SAME WiFi.";
                }
                if (state === 'disconnected') el.textContent = "⚠️ Peer disconnected.";
            }
        };

        if (this.isSender) {
            for (let i = 0; i < this.NUM_CHANNELS; i++) {
                const dc = this.peer.createDataChannel(`ch-${i}`, { ordered: false, maxRetransmits: 50 });
                this.setupDataChannel(dc);
                this.dataChannels.push(dc);
            }
        } else {
            this.peer.ondatachannel = (e) => {
                this.setupDataChannel(e.channel);
                this.dataChannels.push(e.channel);
                const el = document.getElementById('receive-waiting');
                if (el) el.textContent = `Channel ${this.dataChannels.length}/${this.NUM_CHANNELS} open...`;
            };
        }
    },

    setupDataChannel(dc) {
        dc.binaryType = 'arraybuffer';
        dc.bufferedAmountLowThreshold = 1024 * 1024; // 1MB

        dc.onopen = () => {
            this.verifyAndFinalize();
        };
        dc.onmessage = (e) => {
            if (window.FileTransfer) window.FileTransfer.onMessage(e.data);
        };
        dc.onclose = () => {
            if (this.connected) this.disconnect();
        };
    },

    async verifyAndFinalize() {
        if (this.connected || !this.peer) return;

        const iceState = this.peer.iceConnectionState;
        const iceReady = iceState === 'connected' || iceState === 'completed';
        const channelsReady = this.dataChannels.length === this.NUM_CHANNELS && this.dataChannels.every(c => c.readyState === 'open');

        if (!iceReady || !channelsReady) return;

        clearTimeout(this.safetyAbortTimer);

        try {
            const stats = await this.peer.getStats();
            let localType = '', remoteType = '', localIp = '', remoteIp = '';

            stats.forEach(report => {
                if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                    const localCand = stats.get(report.localCandidateId);
                    const remoteCand = stats.get(report.remoteCandidateId);
                    if (localCand && remoteCand) {
                        localType = localCand.candidateType;
                        remoteType = remoteCand.candidateType;
                        localIp = localCand.ip || localCand.address;
                        remoteIp = remoteCand.ip || remoteCand.address;
                    }
                }
            });

            const isPureLan = localType === 'host' && remoteType === 'host' && this.isPrivateIp(localIp) && this.isPrivateIp(remoteIp);

            if (this.localOnly && !this.allowInternetRoute && !isPureLan) {
                console.error("LAN-only mode violated. Connection rejected.");
                const wait = this.isSender ? document.getElementById('send-waiting') : document.getElementById('receive-waiting');
                if (wait) wait.textContent = "❌ Route verification failed. Internet path detected while in LAN-only mode.";
                this.peer.close();
                this.peer = null;
                this.dataChannels = [];
                return;
            }

            if (isPureLan) this.connectionType = 'lan';
            else if (localType === 'relay' || remoteType === 'relay') this.connectionType = 'relay';
            else this.connectionType = 'internet';

            this.connected = true;
            this.onConnected(this._peerName);

        } catch (e) {
            console.error("Verification failed", e);
            if (this.localOnly && !this.allowInternetRoute) {
                if (this.peer) this.peer.close();
                return;
            }
            this.connectionType = 'unknown';
            this.connected = true;
            this.onConnected(this._peerName);
        }
    },

    async makeOffer() {
        try {
            const offer = await this.peer.createOffer();
            await this.peer.setLocalDescription(offer);
            socket.emit('offer', this.roomId, offer);
            const el = document.getElementById('send-waiting');
            if (el) el.textContent = "Offer sent, waiting for answer...";
        } catch (e) {
            console.error("makeOffer failed", e);
            const el = document.getElementById('send-waiting');
            if (el) el.textContent = "❌ Offer failed: " + e.message;
        }
    },

    onConnected(peerName) {
        if (window.FileTransfer) window.FileTransfer.init();

        document.getElementById('peer-name').textContent = peerName || 'Unknown Device';

        const badge = document.getElementById('connection-type-badge');
        if (badge) {
            badge.className = 'conn-badge'; // reset
            badge.classList.remove('hidden');
            if (this.connectionType === 'lan') {
                badge.classList.add('badge-lan');
                badge.textContent = '🚀 Pure LAN';
            } else if (this.connectionType === 'internet') {
                badge.classList.add('badge-internet');
                badge.textContent = '🌐 Public IP Route';
            } else if (this.connectionType === 'relay') {
                badge.classList.add('badge-relay');
                badge.textContent = '🐢 TURN Relay';
            } else {
                badge.classList.add('hidden');
            }
        }

        if (this.isSender) {
            document.getElementById('sender-panel').classList.remove('hidden');
            document.getElementById('receiver-panel').classList.add('hidden');
        } else {
            document.getElementById('receiver-panel').classList.remove('hidden');
            document.getElementById('sender-panel').classList.add('hidden');
        }

        showView('connected');
    },

    disconnect() {
        if (this.peer) { this.peer.close(); this.peer = null; }
        this.dataChannels = [];
        this.connected = false;
        this.isSender = false;
        this.roomId = null;
        this.connectionType = 'unknown';
        socket.disconnect();
        socket.connect();
    }
};

// ---- Socket Connection Status Dot ----
socket.on('connect', () => {
    const txt = document.getElementById('status-text');
    const dot = document.querySelector('.dot');
    if (txt) txt.textContent = 'Ready';
    if (dot) { dot.classList.add('online'); dot.classList.remove('offline'); }
});

socket.on('disconnect', () => {
    const txt = document.getElementById('status-text');
    const dot = document.querySelector('.dot');
    if (txt) txt.textContent = 'Offline';
    if (dot) { dot.classList.add('offline'); dot.classList.remove('online'); }
});

// ---- Signaling Handlers ----

WebRTC._peerName = '';

socket.on('user-joined', (id, deviceName) => {
    WebRTC._peerName = deviceName;
    if (!WebRTC.isSender) {
        const wait = document.getElementById('receive-waiting');
        if (wait) { wait.classList.remove('hidden'); wait.textContent = 'Peer found! Waiting for offer...'; }
    }
});

socket.on('offer', async (id, offer) => {
    if (!WebRTC.isSender) {
        const wait = document.getElementById('receive-waiting');
        if (wait) wait.textContent = "Offer received, connecting...";
        try {
            await WebRTC.peer.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await WebRTC.peer.createAnswer();
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
        if (wait) wait.textContent = 'Answer received, finalising ICE...';
        try {
            await WebRTC.peer.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (e) {
            console.error('Set answer failed', e);
            if (wait) wait.textContent = '❌ Set answer failed: ' + e.message;
        }
    }
});

socket.on('ice-candidate', async (id, candidate) => {
    if (WebRTC.peer) {
        try {
            if (WebRTC.localOnly && !WebRTC.allowInternetRoute) {
                const candStr = candidate.candidate || '';
                const isHost = candStr.includes('typ host');
                const ip = WebRTC.extractIpFromCandidate(candStr);
                if (!isHost || !WebRTC.isPrivateIp(ip)) {
                    console.log('[LAN-only 🛡️] dropping incoming non-host candidate');
                    return;
                }
            }
            await WebRTC.peer.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.warn('ICE candidate add failed', e.message);
        }
    }
});

socket.on('user-disconnected', () => {
    WebRTC.disconnect();
    alert("Peer disconnected.");
    document.querySelectorAll('.back-btn')[0].click();
});