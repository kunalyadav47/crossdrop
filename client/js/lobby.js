/**
 * CrossDrop Lobby — Xender-style automatic nearby device discovery
 *
 * HOW IT WORKS:
 *  1. When the app loads, socket registers with the server (register-lobby event)
 *  2. Server groups all sockets sharing the same /24 IP prefix (same hotspot/WiFi)
 *  3. Server pushes the peer list to everyone in that group instantly
 *  4. Radar UI renders each peer as a floating bubble orbiting the center
 *  5. Tapping a bubble fires a pair-request → receiver gets a modal → accepts → WebRTC starts
 *  No QR code, no room code — fully automatic like Xender/AirDrop
 */
window.Lobby = {
    peers: [],          // current peer list from server
    radarAngle: {},     // socketId → current orbit angle
    radarRAF: null,     // requestAnimationFrame handle
    pendingPair: null,  // socketId we sent a request to

    init() {
        // Auto-register on connect and reconnect
        socket.on('connect', () => {
            socket.emit('register-lobby', window.myName || '📡 Device');
        });

        // If already connected when init runs
        if (socket.connected) {
            socket.emit('register-lobby', window.myName || '📡 Device');
        }

        // Server pushes peer list whenever someone joins/leaves same subnet
        socket.on('lobby', (peers) => {
            this.peers = peers;
            this.renderRadar(peers);
            this.updateDevicePills(peers);

            // Show/hide the radar section
            const section = document.getElementById('radar-section');
            if (!section) return;
            if (peers.length > 0) {
                section.classList.remove('hidden');
                if (!this.radarRAF) this.startRadarAnimation();
            } else {
                section.classList.add('hidden');
                this.stopRadarAnimation();
            }
        });

        // Someone tapped us on their radar — show incoming pair request modal
        socket.on('pair-requested', (fromSocketId, theirName) => {
            if (WebRTC.connected) return; // already in a session

            const modal = document.getElementById('pair-request-modal');
            const nameEl = document.getElementById('pair-requester-name');
            if (modal) modal.classList.remove('hidden');
            if (nameEl) nameEl.textContent = theirName;

            // Store who's asking so accept/decline buttons know
            window._pairRequestFrom = fromSocketId;
        });

        // Our request was accepted — server gives us the room code → join it
        socket.on('pair-accepted', (roomId) => {
            this.pendingPair = null;
            this.hidePairSending();
            window.showToast?.('✅ Accepted! Connecting…');
            // Navigate to send view and join room
            showView('send');
            const waiting = document.getElementById('send-waiting');
            if (waiting) { waiting.classList.remove('hidden'); waiting.textContent = 'Connecting via radar…'; }
            WebRTC.joinRoom(roomId);
        });

        // Our request was declined
        socket.on('pair-declined', () => {
            this.pendingPair = null;
            this.hidePairSending();
            window.showToast?.('❌ Request declined');
        });

        // Wire accept/decline buttons in the pair-request modal
        document.getElementById('btn-pair-accept')?.addEventListener('click', () => {
            const fromId = window._pairRequestFrom;
            if (!fromId) return;
            document.getElementById('pair-request-modal')?.classList.add('hidden');

            // We become the receiver/host
            const roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
            socket.emit('pair-accepted', fromId, roomId);

            // Set up as receiver
            showView('receive');
            WebRTC.roomId = roomId;
            WebRTC.isSender = false;
            WebRTC.setupPeer();
            socket.emit('join-room', roomId, window.myName);
            const codeEl = document.getElementById('room-code');
            if (codeEl) codeEl.textContent = roomId;
            generateQR(roomId, 'qr-container');
            const waiting = document.getElementById('receive-waiting');
            if (waiting) { waiting.classList.remove('hidden'); waiting.textContent = '📡 Radar pairing — connecting…'; }
        });

        document.getElementById('btn-pair-decline')?.addEventListener('click', () => {
            const fromId = window._pairRequestFrom;
            if (fromId) socket.emit('pair-declined', fromId);
            document.getElementById('pair-request-modal')?.classList.add('hidden');
            window._pairRequestFrom = null;
        });
    },

    // Tap a radar bubble → send pair request
    requestPair(targetSocketId, targetName) {
        if (WebRTC.connected) { window.showToast?.('Already in a session'); return; }
        if (this.pendingPair) { window.showToast?.('Request already pending'); return; }
        this.pendingPair = targetSocketId;
        this.showPairSending(targetName);
        socket.emit('request-pair', targetSocketId, window.myName);

        // Auto-cancel after 15s if no response
        setTimeout(() => {
            if (this.pendingPair === targetSocketId) {
                this.pendingPair = null;
                this.hidePairSending();
                window.showToast?.('⏱ No response — try again');
            }
        }, 15000);
    },

    showPairSending(name) {
        const overlay = document.getElementById('radar-sending-overlay');
        const label   = document.getElementById('radar-sending-label');
        if (overlay) overlay.classList.remove('hidden');
        if (label)   label.textContent = `Requesting ${name}…`;
    },

    hidePairSending() {
        document.getElementById('radar-sending-overlay')?.classList.add('hidden');
    },

    // ── Radar canvas animation ────────────────────────────────────────────
    renderRadar(peers) {
        // Assign stable orbit angles to peers
        peers.forEach(p => {
            if (this.radarAngle[p.socketId] === undefined) {
                // Space them evenly, with a little randomness
                const existingCount = Object.keys(this.radarAngle).length;
                this.radarAngle[p.socketId] = (existingCount * (2 * Math.PI / Math.max(peers.length, 1))) + (Math.random() * 0.3);
            }
        });
        // Clean up departed peers
        Object.keys(this.radarAngle).forEach(id => {
            if (!peers.find(p => p.socketId === id)) delete this.radarAngle[id];
        });
    },

    startRadarAnimation() {
        const canvas = document.getElementById('radar-canvas');
        if (!canvas) return;
        canvas.classList.remove('hidden');
        const ctx = canvas.getContext('2d');
        let t = 0;

        const draw = () => {
            this.radarRAF = requestAnimationFrame(draw);
            t += 0.008;

            const W = canvas.width, H = canvas.height;
            const cx = W / 2, cy = H / 2;
            const orbitR = Math.min(W, H) * 0.34;

            ctx.clearRect(0, 0, W, H);

            // ── Radar rings ──
            [0.28, 0.56, 0.85].forEach(frac => {
                const r = orbitR * frac / 0.85 * 1.15;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(255,255,255,0.1)';
                ctx.lineWidth = 1;
                ctx.stroke();
            });

            // ── Radar sweep line ──
            const sweepAngle = t * 1.2;
            const grad = ctx.createConicalGradient
                ? ctx.createConicalGradient(cx, cy, sweepAngle)
                : null;

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(sweepAngle);
            const sweep = ctx.createLinearGradient(0, 0, orbitR * 1.2, 0);
            sweep.addColorStop(0,   'rgba(255,92,53,0.5)'); // #FF5C35
            sweep.addColorStop(0.6, 'rgba(255,92,53,0.1)');
            sweep.addColorStop(1,   'rgba(255,92,53,0)');
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, orbitR * 1.2, -0.35, 0);
            ctx.fillStyle = sweep;
            ctx.fill();
            ctx.restore();

            // ── Center dot ──
            const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 18);
            cg.addColorStop(0, 'rgba(255,92,53,0.9)'); // #FF5C35
            cg.addColorStop(1, 'rgba(255,92,53,0)');
            ctx.beginPath(); ctx.arc(cx, cy, 18, 0, Math.PI * 2);
            ctx.fillStyle = cg; ctx.fill();
            ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2);
            ctx.fillStyle = '#FF5C35'; ctx.fill();

            // ── Connecting Lines & Peer bubbles ──
            this.peers.forEach(peer => {
                const baseAngle = this.radarAngle[peer.socketId] ?? 0;
                const floatAngle = baseAngle + t * 0.18 + Math.sin(t * 0.7 + baseAngle) * 0.08;
                const floatR     = orbitR + Math.sin(t * 1.1 + baseAngle * 2) * 8;

                const px = cx + Math.cos(floatAngle) * floatR;
                const py = cy + Math.sin(floatAngle) * floatR;

                // Connecting Line (gradient from orange to green)
                const lineGrad = ctx.createLinearGradient(cx, cy, px, py);
                lineGrad.addColorStop(0, 'rgba(255,92,53,0.6)'); // Orange #FF5C35
                lineGrad.addColorStop(1, 'rgba(74,222,128,0.6)'); // Green #4ADE80
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(px, py);
                ctx.strokeStyle = lineGrad;
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // Glow (Green)
                const glow = ctx.createRadialGradient(px, py, 0, px, py, 38);
                glow.addColorStop(0, 'rgba(74,222,128,0.18)'); // #4ADE80
                glow.addColorStop(1, 'rgba(74,222,128,0)');
                ctx.beginPath(); ctx.arc(px, py, 38, 0, Math.PI * 2);
                ctx.fillStyle = glow; ctx.fill();

                // Bubble circle
                ctx.beginPath(); ctx.arc(px, py, 26, 0, Math.PI * 2);
                ctx.fillStyle = '#141414';
                ctx.fill();
                ctx.strokeStyle = this.pendingPair === peer.socketId
                    ? '#FFB84D' : '#4ADE80';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // Emoji
                ctx.font = '18px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(peer.deviceName.charAt(0), px, py - 2);

                // Name label below bubble
                ctx.font = '500 10px Inter, sans-serif';
                ctx.fillStyle = '#FFFFFF';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                const shortName = peer.deviceName.slice(2).split(' ')[0]; // first word only
                ctx.fillText(shortName, px, py + 30);

                // Store hit-zone for click detection
                peer._px = px; peer._py = py;
            });
        };

        draw();

        // Click detection on canvas
        canvas.onclick = (e) => {
            const rect  = canvas.getBoundingClientRect();
            const scaleX = canvas.width  / rect.width;
            const scaleY = canvas.height / rect.height;
            const mx = (e.clientX - rect.left) * scaleX;
            const my = (e.clientY - rect.top)  * scaleY;

            for (const peer of this.peers) {
                if (peer._px === undefined) continue;
                const dist = Math.hypot(mx - peer._px, my - peer._py);
                if (dist < 32) {
                    this.requestPair(peer.socketId, peer.deviceName);
                    return;
                }
            }
        };

        // Touch support
        canvas.ontouchend = (e) => {
            e.preventDefault();
            canvas.onclick(e.changedTouches[0]);
        };
    },

    stopRadarAnimation() {
        cancelAnimationFrame(this.radarRAF);
        this.radarRAF = null;
        const canvas = document.getElementById('radar-canvas');
        if (canvas) {
            canvas.classList.add('hidden');
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    if (typeof socket !== 'undefined') Lobby.init();
});

// ── Update device pills in receive view ────────────────────────────────────
window.Lobby.updateDevicePills = function(peers) {
    const container = document.getElementById('nearby-cards');
    const section   = document.getElementById('nearby-section');
    if (!container || !section) return;

    if (peers.length === 0) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');

    container.innerHTML = '';
    peers.forEach((peer, i) => {
        const card = document.createElement('div');
        card.className = 'nearby-card';
        card.style.animationDelay = `${i * 0.06}s`;
        const icon = peer.deviceName.charAt(0);
        const name = peer.deviceName.slice(2);
        card.innerHTML = `
            <div class="nearby-card-av">${icon}</div>
            <div>
                <div class="nearby-card-name">${name}</div>
                <div class="nearby-card-sub">same network</div>
            </div>
            <div class="nearby-card-beam">Beam</div>`;
        card.addEventListener('click', () => Lobby.requestPair(peer.socketId, peer.deviceName));
        container.appendChild(card);
    });

    // Update radar count label
    const lbl = document.getElementById('radar-count-label');
    if (lbl) lbl.textContent = `${peers.length} device${peers.length > 1 ? 's' : ''} nearby`;
};
