const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('CrossDrop signaling server is running.');
});

const speedtestPayload = crypto.randomBytes(1024 * 1024 * 2);
app.get('/speedtest', (req, res) => {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.send(speedtestPayload);
});

// Lobby tracking: ipPrefix -> Map(socketId -> { deviceName, joinedAt })
const lobby = new Map();

function getIpPrefix(socket) {
    let ip = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    if (ip.includes(',')) ip = ip.split(',')[0].trim();
    if (ip.includes(':') && !ip.includes('.')) {
        return ip.split(':').slice(0, 4).join(':'); // rough IPv6 prefix
    }
    return ip.split('.').slice(0, 3).join('.'); // IPv4 /24 mask
}

function broadcastLobbyUpdate(prefix) {
    const clientsMap = lobby.get(prefix);
    if (!clientsMap) return;
    
    const clients = Array.from(clientsMap.entries()).map(([socketId, data]) => ({
        socketId,
        deviceName: data.deviceName
    }));
    
    clientsMap.forEach((_, socketId) => {
        const others = clients.filter(c => c.socketId !== socketId);
        io.to(socketId).emit('lobby', others);
    });
}

// Clean up stale lobby entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [prefix, clientsMap] of lobby.entries()) {
        for (const [socketId, data] of clientsMap.entries()) {
            if (now - data.joinedAt > 5 * 60 * 1000) { // 5 minutes inactivity
                clientsMap.delete(socketId);
            }
        }
        if (clientsMap.size === 0) lobby.delete(prefix);
        else broadcastLobbyUpdate(prefix);
    }
}, 60 * 1000);

io.on('connection', (socket) => {
    socket.on('register-lobby', (deviceName) => {
        const prefix = getIpPrefix(socket);
        if (!lobby.has(prefix)) lobby.set(prefix, new Map());
        lobby.get(prefix).set(socket.id, { deviceName, joinedAt: Date.now() });
        socket.ipPrefix = prefix;
        broadcastLobbyUpdate(prefix);
    });

    socket.on('join-room', (roomId, deviceName) => {
        socket.join(roomId);
        socket.to(roomId).emit('user-joined', socket.id, deviceName);
    });

    socket.on('name-reply', (targetId, deviceName) => {
        socket.to(targetId).emit('name-reply', socket.id, deviceName);
    });

    socket.on('offer', (roomId, offer) => {
        socket.to(roomId).emit('offer', socket.id, offer);
    });

    socket.on('answer', (roomId, answer) => {
        socket.to(roomId).emit('answer', socket.id, answer);
    });

    socket.on('ice-candidate', (roomId, candidate) => {
        socket.to(roomId).emit('ice-candidate', socket.id, candidate);
    });
    
    socket.on('request-pair', (targetSocketId, myName) => {
        socket.to(targetSocketId).emit('pair-requested', socket.id, myName);
    });
    
    socket.on('pair-accepted', (targetSocketId, roomId) => {
        socket.to(targetSocketId).emit('pair-accepted', roomId);
    });

    socket.on('disconnecting', () => {
        if (socket.ipPrefix && lobby.has(socket.ipPrefix)) {
            const prefixMap = lobby.get(socket.ipPrefix);
            prefixMap.delete(socket.id);
            if (prefixMap.size === 0) lobby.delete(socket.ipPrefix);
            else broadcastLobbyUpdate(socket.ipPrefix);
        }
        
        for (const room of socket.rooms) {
            if (room !== socket.id) {
                socket.to(room).emit('user-disconnected', socket.id);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`CrossDrop server running on port ${PORT}`);
});
