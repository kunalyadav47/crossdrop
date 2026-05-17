const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());

// Serve static client files
app.use(express.static(path.join(__dirname, '../client')));

// Speedtest payload (2MB) for measuring bandwidth locally
const speedtestPayload = crypto.randomBytes(1024 * 1024 * 2);
app.get('/speedtest', (req, res) => {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.send(speedtestPayload);
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    socket.on('join-room', (roomId, deviceName) => {
        socket.join(roomId);
        socket.to(roomId).emit('user-joined', socket.id, deviceName);
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

    socket.on('disconnecting', () => {
        for (const room of socket.rooms) {
            if (room !== socket.id) {
                socket.to(room).emit('user-disconnected', socket.id);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`CrossDrop signaling server running on port ${PORT}`);
});
