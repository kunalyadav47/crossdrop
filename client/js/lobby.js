window.Lobby = {
    renderCards(clients) {
        let container = document.getElementById('nearby-cards');
        if (!container) return;
        
        container.innerHTML = '';
        if (!clients || clients.length === 0) {
            container.style.display = 'none';
            return;
        }
        
        container.style.display = 'flex';
        clients.forEach((c, index) => {
            const card = document.createElement('div');
            card.className = 'nearby-card';
            card.style.animationDelay = `${index * 100}ms`;
            
            const emojis = ['🎨','🚀','🦊','🐼','🦁','🐯','🐸','🐙','🐒','🦄'];
            const eIdx = c.deviceName.split('').reduce((a, b) => a + b.charCodeAt(0), 0) % emojis.length;
            const emoji = emojis[eIdx];

            card.innerHTML = `
                <div class="nearby-avatar">${emoji}</div>
                <div class="nearby-name">${c.deviceName.split(' ').join('<br>')}</div>
                <div class="nearby-tap">⚡ tap</div>
            `;
            
            card.addEventListener('click', () => {
                socket.emit('request-pair', c.socketId, window.myName);
                if(window.Feedback) window.Feedback.play('paired');
            });
            
            container.appendChild(card);
        });
    }
};

if (typeof socket !== 'undefined') {
    socket.on('lobby', (clients) => {
        if (document.getElementById('view-receive') && !document.getElementById('view-receive').classList.contains('hidden')) {
            window.Lobby.renderCards(clients);
        }
    });

    socket.on('pair-requested', (fromSocketId, fromName) => {
        if (!WebRTC.isSender && WebRTC.roomId) {
            socket.emit('pair-accepted', fromSocketId, WebRTC.roomId);
            if(window.Feedback) window.Feedback.play('paired');
        }
    });

    socket.on('pair-accepted', (roomId) => {
        if (WebRTC.isSender) {
            document.getElementById('manual-code').value = roomId;
            document.getElementById('join-btn').click();
        }
    });
}
