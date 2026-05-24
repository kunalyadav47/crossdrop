const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const cors     = require('cors');
const crypto   = require('crypto');
const path     = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] } });

app.use(cors());
app.use(express.json());

// Serve a dynamic config so the client always talks to the correct backend origin
app.get('/js/config.js', (req, res) => {
    const origin = req.protocol + '://' + req.get('host');
    res.type('application/javascript');
    res.send(`// Dynamically generated config\nconst BACKEND_URL = '${origin}';`);
});

// Serve the frontend client files automatically
app.use(express.static(path.join(__dirname, '../client')));

// Health check + keep-alive target
app.get('/ping', (_, res) => res.send('CrossDrop signaling OK'));

// 2 MB random payload for bandwidth test
const speedPayload = crypto.randomBytes(2 * 1024 * 1024);
app.get('/speedtest', (_, res) => {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.send(speedPayload);
});

// Health endpoint
app.get('/health', (req, res) => {
    let totalLobby = 0;
    for (const map of lobby.values()) totalLobby += map.size;
    let roomCount = 0;
    for (const [id, room] of io.sockets.adapter.rooms.entries()) {
        if (!io.sockets.sockets.has(id)) roomCount++;
    }
    res.json({ status: "ok", rooms: roomCount, lobby: totalLobby, uptime: process.uptime() });
});

// ── Lobby — groups sockets by /24 IP prefix ─────────────────────────────────
// prefix → Map(socketId → { deviceName, joinedAt })
const lobby = new Map();

function ipPrefix(socket) {
    let ip = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address || '';
    if (ip.includes(',')) ip = ip.split(',')[0].trim();
    ip = ip.replace(/^::ffff:/, '');
    if (ip.includes('.')) return ip.split('.').slice(0, 3).join('.');   // IPv4 /24
    return ip.split(':').slice(0, 4).join(':');                          // IPv6 /64-ish
}

function broadcastLobby(prefix) {
    const map = lobby.get(prefix);
    if (!map) return;
    const list = Array.from(map.entries()).map(([id, d]) => ({ socketId: id, deviceName: d.deviceName }));
    map.forEach((_, id) => io.to(id).emit('lobby', list.filter(p => p.socketId !== id)));
}

// Stale cleanup every 5 min
setInterval(() => {
    const deadline = Date.now() - 5 * 60 * 1000;
    for (const [prefix, map] of lobby.entries()) {
        for (const [id, d] of map.entries()) if (d.joinedAt < deadline) map.delete(id);
        if (map.size === 0) lobby.delete(prefix); else broadcastLobby(prefix);
    }
}, 60_000);

const roomTimeouts = new Map();

io.on('connection', socket => {

    socket.on('register-lobby', deviceName => {
        const prefix = ipPrefix(socket);
        if (!lobby.has(prefix)) lobby.set(prefix, new Map());
        const prefixMap = lobby.get(prefix);
        if (prefixMap.size >= 2 && !prefixMap.has(socket.id)) {
            socket.emit('error', 'Lobby limit reached for this IP');
            return;
        }
        prefixMap.set(socket.id, { deviceName, joinedAt: Date.now() });
        socket._lobbyPrefix = prefix;
        broadcastLobby(prefix);
    });

    socket.on('join-room', (roomId, deviceName) => {
        const currentRooms = Array.from(socket.rooms).filter(r => r !== socket.id);
        if (currentRooms.length >= 1 && !currentRooms.includes(roomId)) {
            socket.emit('error', 'Already in a room');
            return;
        }
        if (roomTimeouts.has(roomId)) {
            clearTimeout(roomTimeouts.get(roomId));
            roomTimeouts.delete(roomId);
        }
        socket.join(roomId);
        socket.to(roomId).emit('user-joined', socket.id, deviceName);
    });

    socket.on('offer',         (room, offer)      => socket.to(room).emit('offer', socket.id, offer));
    socket.on('answer',        (room, answer)      => socket.to(room).emit('answer', socket.id, answer));
    socket.on('ice-candidate', (room, cand)        => socket.to(room).emit('ice-candidate', socket.id, cand));

    // Sender taps a bubble → asks that device to receive
    socket.on('request-pair', (targetId, name) => {
        // Rate limit: only allow if no pending request from this socket
        if (socket._pendingPairTarget) {
            socket.emit('error', 'Request already pending');
            return;
        }
        socket._pendingPairTarget = targetId;
        socket.to(targetId).emit('pair-requested', socket.id, name);
    });

    // Receiver accepts → creates a room and tells the sender the code
    socket.on('pair-accepted', (targetId, roomId) => {
        socket.to(targetId).emit('pair-accepted', roomId);
        // Clear pending state on the sender's socket
        const senderSocket = io.sockets.sockets.get(targetId);
        if (senderSocket) senderSocket._pendingPairTarget = null;
    });

    // Receiver declines → tell the sender
    socket.on('pair-declined', (targetId) => {
        socket.to(targetId).emit('pair-declined');
        const senderSocket = io.sockets.sockets.get(targetId);
        if (senderSocket) senderSocket._pendingPairTarget = null;
    });

    socket.on('disconnecting', () => {
        // Clear pending pair if this socket disconnects mid-request
        if (socket._pendingPairTarget) {
            socket.to(socket._pendingPairTarget).emit('pair-declined');
        }
        // Remove from lobby
        if (socket._lobbyPrefix && lobby.has(socket._lobbyPrefix)) {
            const map = lobby.get(socket._lobbyPrefix);
            map.delete(socket.id);
            if (map.size === 0) lobby.delete(socket._lobbyPrefix);
            else broadcastLobby(socket._lobbyPrefix);
        }
        // Notify rooms
        for (const room of socket.rooms) {
            if (room !== socket.id) {
                socket.to(room).emit('user-disconnected', socket.id);
                // Room cleanup timeout
                const clients = io.sockets.adapter.rooms.get(room);
                if (clients && clients.size === 2) { // 1 remaining after this disconnects
                    if (!roomTimeouts.has(room)) {
                        const timer = setTimeout(() => {
                            io.in(room).socketsLeave(room);
                            roomTimeouts.delete(room);
                        }, 30000);
                        roomTimeouts.set(room, timer);
                    }
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`CrossDrop server on :${PORT}`));
