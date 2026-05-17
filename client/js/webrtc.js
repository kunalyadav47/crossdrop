// 🔧 REPLACE THIS URL with your Render backend URL after deploying server
const BACKEND_URL = 'YOUR_RENDER_BACKEND_URL'; // e.g. https://crossdrop-backend.onrender.com
const socket = io(BACKEND_URL, {
  transports: ['websocket'],
  upgrade: false
});

const WebRTC = {
    peer: null,
    dataChannels: [],
    roomId: null,
    isSender: false,
    NUM_CHANNELS: 16,
    
    // State for signaling
    connected: false,

    startSender() {
        this.isSender = true;
        this.roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        document.getElementById('room-code').textContent = this.roomId;
        generateQR(this.roomId, document.getElementById('qr-canvas'));
        
        socket.emit('join-room', this.roomId, window.myName);
        this.setupPeer();
    },

    startReceiver() {
        this.isSender = false;
        this.setupPeer();
    },

    joinRoom(code) {
        this.roomId = code;
        document.getElementById('receive-waiting').classList.remove('hidden');
        document.getElementById('receive-waiting').textContent = "Connecting...";
        socket.emit('join-room', this.roomId, window.myName);
    },

    setupPeer() {
        this.peer = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
        });

        this.peer.onicecandidate = (e) => {
            if (e.candidate) {
                socket.emit('ice-candidate', this.roomId, e.candidate);
            }
        };

        if (this.isSender) {
            // Create data channels
            for (let i = 0; i < this.NUM_CHANNELS; i++) {
                const dc = this.peer.createDataChannel(`channel-${i}`, {
                    ordered: true
                });
                this.setupDataChannel(dc);
                this.dataChannels.push(dc);
            }
        } else {
            this.peer.ondatachannel = (e) => {
                this.setupDataChannel(e.channel);
                this.dataChannels.push(e.channel);
            };
        }
    },

    setupDataChannel(dc) {
        dc.binaryType = 'arraybuffer';
        dc.bufferedAmountLowThreshold = 64 * 1024 * 4; // 256KB threshold
        
        dc.onopen = () => {
            if (this.dataChannels.every(c => c.readyState === 'open') && !this.connected) {
                this.connected = true;
                this.onConnected();
            }
        };
        dc.onmessage = (e) => {
            if (window.FileTransfer) {
                window.FileTransfer.onMessage(e.data);
            }
        };
        dc.onclose = () => {
            this.disconnect();
        };
    },

    async makeOffer() {
        const offer = await this.peer.createOffer();
        await this.peer.setLocalDescription(offer);
        socket.emit('offer', this.roomId, offer);
    },

    onConnected() {
        document.getElementById('send-setup').classList.add('hidden');
        document.getElementById('receive-setup').classList.add('hidden');
        if (this.isSender) {
            document.getElementById('send-active').classList.remove('hidden');
        } else {
            document.getElementById('receive-active').classList.remove('hidden');
        }
    },

    disconnect() {
        if (this.peer) this.peer.close();
        this.dataChannels = [];
        this.connected = false;
        socket.disconnect();
        socket.connect(); // reconnect to socket for new session
    }
};

// Signaling
socket.on('user-joined', async (id, deviceName) => {
    if (WebRTC.isSender) {
        document.getElementById('receiver-name').textContent = deviceName;
        await WebRTC.makeOffer();
    } else {
        document.getElementById('sender-name').textContent = deviceName;
    }
});

socket.on('offer', async (id, offer) => {
    if (!WebRTC.isSender) {
        await WebRTC.peer.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await WebRTC.peer.createAnswer();
        await WebRTC.peer.setLocalDescription(answer);
        socket.emit('answer', WebRTC.roomId, answer);
    }
});

socket.on('answer', async (id, answer) => {
    if (WebRTC.isSender) {
        await WebRTC.peer.setRemoteDescription(new RTCSessionDescription(answer));
    }
});

socket.on('ice-candidate', async (id, candidate) => {
    try {
        await WebRTC.peer.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
        console.error('Error adding ICE candidate', e);
    }
});

socket.on('user-disconnected', () => {
    WebRTC.disconnect();
    alert("Peer disconnected.");
    document.querySelectorAll('.back-btn')[0].click(); // Return to home
});
