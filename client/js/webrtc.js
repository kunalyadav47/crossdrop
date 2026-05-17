// BACKEND_URL is defined in config.js — loaded before this file
const socket = io(BACKEND_URL, {
  transports: ['websocket'],
  upgrade: false
});

const WebRTC = {
    peer: null,
    dataChannels: [],
    roomId: null,
    isSender: false,
    NUM_CHANNELS: 4, // Reduced for reliability across mobile networks
    connected: false,

    startReceiver() {
        this.isSender = false;
        this.roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        document.getElementById('room-code').textContent = this.roomId;
        generateQR(this.roomId, 'qr-container');

        this.setupPeer(); // Set up peer FIRST so it's ready when sender arrives
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
        this.setupPeer(); // Sender sets up peer (creates data channels)
        socket.emit('join-room', this.roomId, window.myName);

        // After joining, wait 1.5s then make the offer
        // (gives server time to relay and receiver to be ready)
        setTimeout(() => {
            waiting.textContent = "Creating connection offer...";
            this.makeOffer();
        }, 1500);
    },

    setupPeer() {
        this.peer = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                // Free TURN server for fallback when STUN fails (common on mobile)
                {
                    urls: 'turn:openrelay.metered.ca:80',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                {
                    urls: 'turn:openrelay.metered.ca:443',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                }
            ]
        });

        this.peer.onicecandidate = (e) => {
            if (e.candidate) {
                socket.emit('ice-candidate', this.roomId, e.candidate);
            }
        };

        this.peer.oniceconnectionstatechange = () => {
            const state = this.peer.iceConnectionState;
            const el = this.isSender
                ? document.getElementById('send-waiting')
                : document.getElementById('receive-waiting');
            if (el) {
                el.classList.remove('hidden');
                if (state === 'checking') el.textContent = "Checking network path...";
                if (state === 'connected' || state === 'completed') el.textContent = "✅ ICE Connected!";
                if (state === 'failed') el.textContent = "❌ Connection failed. Try again.";
                if (state === 'disconnected') el.textContent = "⚠️ Peer disconnected.";
            }
        };

        if (this.isSender) {
            // Sender creates all data channels
            for (let i = 0; i < this.NUM_CHANNELS; i++) {
                const dc = this.peer.createDataChannel(`channel-${i}`, { ordered: true });
                this.setupDataChannel(dc);
                this.dataChannels.push(dc);
            }
        } else {
            // Receiver listens for incoming data channels
            this.peer.ondatachannel = (e) => {
                this.setupDataChannel(e.channel);
                this.dataChannels.push(e.channel);
                // Check connection after each channel is added
                const el = document.getElementById('receive-waiting');
                if (el) el.textContent = `Channel ${this.dataChannels.length}/${this.NUM_CHANNELS} open...`;
            };
        }
    },

    setupDataChannel(dc) {
        dc.binaryType = 'arraybuffer';
        dc.bufferedAmountLowThreshold = 64 * 1024 * 4;

        dc.onopen = () => {
            if (this.dataChannels.length === this.NUM_CHANNELS &&
                this.dataChannels.every(c => c.readyState === 'open') &&
                !this.connected) {
                this.connected = true;
                this.onConnected(this._peerName);
            }
        };
        dc.onmessage = (e) => {
            if (window.FileTransfer) window.FileTransfer.onMessage(e.data);
        };
        dc.onclose = () => {
            if (this.connected) this.disconnect();
        };
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
        // Initialise file transfer listeners
        if (window.FileTransfer) window.FileTransfer.init();

        // Show peer name in banner
        document.getElementById('peer-name').textContent = peerName || 'Unknown Device';

        // Show correct panel
        if (this.isSender) {
            document.getElementById('sender-panel').classList.remove('hidden');
            document.getElementById('receiver-panel').classList.add('hidden');
        } else {
            document.getElementById('receiver-panel').classList.remove('hidden');
            document.getElementById('sender-panel').classList.add('hidden');
        }

        // Switch to the connected dashboard
        showView('connected');
    },

    disconnect() {
        if (this.peer) { this.peer.close(); this.peer = null; }
        this.dataChannels = [];
        this.connected = false;
        this.isSender = false;
        this.roomId = null;
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

// Store peer name for use in onConnected
WebRTC._peerName = '';

// When someone joins the room
socket.on('user-joined', (id, deviceName) => {
    WebRTC._peerName = deviceName;
    if (!WebRTC.isSender) {
        const wait = document.getElementById('receive-waiting');
        if (wait) { wait.classList.remove('hidden'); wait.textContent = 'Peer found! Waiting for offer...'; }
    }
});

// Receiver handles incoming offer from sender
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

// Sender handles answer from receiver — also captures receiver's name from deviceName field
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

// Both sides exchange ICE candidates
socket.on('ice-candidate', async (id, candidate) => {
    if (WebRTC.peer) {
        try {
            await WebRTC.peer.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.warn('ICE candidate add failed (non-fatal)', e.message);
        }
    }
});

socket.on('user-disconnected', () => {
    WebRTC.disconnect();
    alert("Peer disconnected.");
    document.querySelectorAll('.back-btn')[0].click();
});