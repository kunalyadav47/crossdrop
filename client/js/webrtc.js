// BACKEND_URL is defined in config.js — do not redefine here
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
    
    connected: false,

    startReceiver() {
        this.isSender = false;
        this.roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        document.getElementById('room-code').textContent = this.roomId;
        generateQR(this.roomId, document.getElementById('qr-canvas'));
        
        socket.emit('join-room', this.roomId, window.myName);
        this.setupPeer();
    },

    joinRoom(code) {
        this.roomId = code;
        this.isSender = true; // The one joining via code is the Sender
        document.getElementById('send-waiting').classList.remove('hidden');
        document.getElementById('send-waiting').textContent = "Connecting...";
        
        this.setupPeer();
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
        dc.bufferedAmountLowThreshold = 64 * 1024 * 4; 
        
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
        socket.connect(); 
    }
};

// Signaling Handlers
socket.on('user-joined', async (id, deviceName) => {
    // If we are the receiver and someone joined, they are the sender
    if (!WebRTC.isSender) {
        document.getElementById('sender-name').textContent = deviceName;
        // Reply back so they know our name and can make the offer
        socket.emit('name-reply', id, window.myName);
    }
});

socket.on('name-reply', async (id, deviceName) => {
    // We are the sender, we got the receiver's name. Let's make the offer.
    if (WebRTC.isSender) {
        document.getElementById('receiver-name').textContent = deviceName;
        await WebRTC.makeOffer();
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
    document.querySelectorAll('.back-btn')[0].click();
});