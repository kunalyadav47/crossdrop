const COMPRESSIBLE = new Set([
    'txt','log','md','rtf','csv','tsv','json','xml','html','htm','css','js','ts',
    'jsx','tsx','svg','yaml','yml','ini','conf','sql'
]);
const MAX_COMPRESS_SIZE = 10 * 1024 * 1024; // 10MB cap

window.FileTransfer = {
    CHUNK_SIZE: 256 * 1024, // 256KB for massive TCP-like speed

    // Sender state
    sendQueue: [],
    isSending: false,
    startTime: 0,
    bytesSent: 0,

    // Receiver state
    incomingMeta: null,
    receiveBuffer: [],
    receivedChunks: 0,
    bytesReceived: 0,
    lastSpeedUpdate: 0,

    init() {
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');

        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('dragover'); });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) this.queueFiles(e.dataTransfer.files);
        });
        dropZone.addEventListener('click', () => { fileInput.click(); });
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length) this.queueFiles(fileInput.files);
        });

        document.getElementById('btn-accept').addEventListener('click', () => {
            document.getElementById('incoming-modal').classList.add('hidden');
            this.acceptIncoming();
        });
        document.getElementById('btn-decline').addEventListener('click', () => {
            document.getElementById('incoming-modal').classList.add('hidden');
            this.sendControl({ type: 'decline' });
            this.incomingMeta = null;
        });
    },

    queueFiles(files) {
        for (let file of files) {
            const id = Math.random().toString(36).substring(2,9);
            this.sendQueue.push({ file, id });
            this.addFileToUI(file, id, 'send-queue');
        }
        this.processQueue();
    },

    addFileToUI(file, id, containerId) {
        const container = document.getElementById(containerId);
        const div = document.createElement('div');
        div.className = 'file-item';
        div.id = `file-${id}`;
        let size = (file.size / (1024*1024)).toFixed(2) + ' MB';
        div.innerHTML = `
            <div class="file-item-header">
                <div class="filename-wrap">
                    <span>📄</span>
                    <span class="filename" title="${file.name}">${file.name}</span>
                </div>
                <span class="filesize" id="size-${id}">${size}</span>
            </div>
            <div class="progress-container">
                <div class="progress-bar" id="prog-${id}"></div>
            </div>
        `;
        container.appendChild(div);
    },

    updateSpeedUI(mbps) {
        const wrap = document.getElementById('speed-bar-wrap');
        const fill = document.getElementById('speed-bar-fill');
        const label = document.getElementById('transfer-speed-label');
        if (!wrap) return;
        wrap.classList.remove('hidden');
        label.textContent = `⚡ ${mbps.toFixed(1)} MB/s`;
        const pct = Math.min((mbps / 100) * 100, 100);
        fill.style.width = pct + '%';
    },

    hideSpeedUI() {
        const wrap = document.getElementById('speed-bar-wrap');
        if (wrap) wrap.classList.add('hidden');
    },

    async processQueue() {
        if (this.isSending || this.sendQueue.length === 0) return;
        this.isSending = true;
        const item = this.sendQueue.shift();
        await this.sendFile(item);
        this.isSending = false;
        this.processQueue();
    },

    async sendFile(item) {
        let fileOrBlob = item.file;
        const ext = fileOrBlob.name.split('.').pop().toLowerCase();
        let compressed = false;

        const onLan = WebRTC.connectionType === 'lan';
        const shouldCompress = !onLan
                               && COMPRESSIBLE.has(ext)
                               && fileOrBlob.size < MAX_COMPRESS_SIZE
                               && window.CompressionStream;

        if (shouldCompress) {
            document.getElementById(`size-${item.id}`).textContent += ' (Compressing...)';
            try {
                const stream = fileOrBlob.stream().pipeThrough(new CompressionStream('gzip'));
                const response = new Response(stream);
                fileOrBlob = await response.blob();
                compressed = true;
                document.getElementById(`size-${item.id}`).textContent = (fileOrBlob.size / (1024*1024)).toFixed(2) + ' MB (Zipped)';
            } catch (e) {
                console.warn('Compression failed or aborted, sending uncompressed', e);
                fileOrBlob = item.file;
                compressed = false;
            }
        }

        const totalChunks = Math.ceil(fileOrBlob.size / this.CHUNK_SIZE);
        const meta = {
            type: 'meta',
            id: item.id,
            filename: item.file.name,
            filesize: fileOrBlob.size,
            originalSize: item.file.size,
            totalChunks,
            compressed,
            mimetype: item.file.type
        };

        this.sendControl(meta);
        if(window.Orbit) window.Orbit.start();
        if(window.Feedback) window.Feedback.play('start');

        return new Promise((resolve) => {
            this.onAccept = async () => {
                this.startTime = performance.now();
                this.bytesSent = 0;

                const speedInt = setInterval(() => {
                    const el = performance.now() - this.startTime;
                    if (el > 0) {
                        const mbps = (this.bytesSent / (1024*1024)) / (el / 1000);
                        this.updateSpeedUI(mbps);
                    }
                }, 500);

                let nextChunk = 0;

                const channelWorker = async (channel) => {
                    while (true) {
                        const idx = nextChunk++;
                        if (idx >= totalChunks) return;

                        // Backpressure check
                        if (channel.bufferedAmount > channel.bufferedAmountLowThreshold) {
                            await new Promise(r => {
                                const handler = () => { channel.removeEventListener('bufferedamountlow', handler); r(); };
                                channel.addEventListener('bufferedamountlow', handler);
                            });
                        }

                        const start = idx * this.CHUNK_SIZE;
                        const end = Math.min(start + this.CHUNK_SIZE, fileOrBlob.size);
                        const blobChunk = fileOrBlob.slice(start, end);
                        const chunkData = await blobChunk.arrayBuffer();

                        const payload = new Uint8Array(4 + chunkData.byteLength);
                        new DataView(payload.buffer).setUint32(0, idx, true);
                        payload.set(new Uint8Array(chunkData), 4);

                        let sent = false;
                        while (!sent) {
                            try {
                                channel.send(payload);
                                sent = true;
                                this.bytesSent += payload.byteLength;
                                if (idx % 10 === 0 || idx === totalChunks - 1) {
                                    document.getElementById(`prog-${item.id}`).style.width = `${((idx+1) / totalChunks) * 100}%`;
                                }
                            } catch (e) {
                                await new Promise(r => setTimeout(r, 20));
                            }
                        }
                    }
                };

                const workers = WebRTC.dataChannels.map(ch => channelWorker(ch));
                await Promise.all(workers);

                clearInterval(speedInt);
                this.sendControl({ type: 'done', id: item.id });
                if(window.Orbit) window.Orbit.complete();
                if(window.Feedback) window.Feedback.play('complete');
                document.getElementById(`prog-${item.id}`).style.width = '100%';
                document.getElementById(`prog-${item.id}`).style.background = 'var(--success-color)';
                this.hideSpeedUI();
                resolve();
            };

            this.onDecline = () => {
                document.getElementById(`file-${item.id}`).style.opacity = '0.5';
                resolve();
            };
        });
    },

    sendControl(msg) {
        if (WebRTC.dataChannels[0] && WebRTC.dataChannels[0].readyState === 'open') {
            WebRTC.dataChannels[0].send(JSON.stringify(msg));
        }
    },

    onMessage(data) {
        if (typeof data === 'string') {
            const msg = JSON.parse(data);
            if (msg.type === 'meta') {
                this.incomingMeta = msg;
                document.getElementById('incoming-filename').textContent = msg.filename;
                document.getElementById('incoming-filesize').textContent = (msg.originalSize / (1024*1024)).toFixed(2) + ' MB';
                document.getElementById('incoming-modal').classList.remove('hidden');

                this.addFileToUI({ name: msg.filename, size: msg.originalSize }, msg.id, 'receive-queue');
                if(window.Feedback) window.Feedback.play('start');
            } else if (msg.type === 'accept') {
                if (this.onAccept) this.onAccept();
            } else if (msg.type === 'decline') {
                if (this.onDecline) this.onDecline();
            } else if (msg.type === 'done') {
                this.finishReceive();
            }
        } else if (data instanceof ArrayBuffer) {
            if (!this.startTime) this.startTime = performance.now();

            const view = new DataView(data);
            const index = view.getUint32(0, true);
            const chunkData = data.slice(4);

            this.receiveBuffer[index] = chunkData;
            this.receivedChunks++;
            this.bytesReceived = (this.bytesReceived || 0) + data.byteLength;

            const now = performance.now();
            if (now - (this.lastSpeedUpdate || 0) > 500) {
                const el = (now - this.startTime) / 1000;
                const mbps = (this.bytesReceived / (1024*1024)) / el;
                this.updateSpeedUI(mbps);
                this.lastSpeedUpdate = now;
            }

            const total = this.incomingMeta.totalChunks;
            if (this.receivedChunks % 10 === 0 || this.receivedChunks === total) {
                document.getElementById(`prog-${this.incomingMeta.id}`).style.width = `${(this.receivedChunks / total) * 100}%`;
            }
        }
    },

    acceptIncoming() {
        this.receiveBuffer = new Array(this.incomingMeta.totalChunks);
        this.receivedChunks = 0;
        this.startTime = 0;
        this.bytesReceived = 0;
        this.lastSpeedUpdate = 0;
        this.sendControl({ type: 'accept' });
    },

    async finishReceive() {
        this.hideSpeedUI();
        document.getElementById(`prog-${this.incomingMeta.id}`).style.background = 'var(--success-color)';
        const idle = document.getElementById('receiver-idle-card');
        if (idle) idle.style.display = 'none';

        let blob = new Blob(this.receiveBuffer);
        this.receiveBuffer = []; // free memory

        if (this.incomingMeta.compressed && window.DecompressionStream) {
            document.getElementById(`size-${this.incomingMeta.id}`).textContent = 'Decompressing...';
            try {
                const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
                const response = new Response(stream);
                blob = await response.blob();
            } catch (e) {
                console.error("Decompression failed", e);
            }
        }

        document.getElementById(`size-${this.incomingMeta.id}`).textContent = 'Saved!';

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.incomingMeta.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if(window.Orbit) window.Orbit.complete();
        if(window.Feedback) window.Feedback.play('complete');
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
};
