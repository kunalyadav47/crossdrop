/**
 * CrossDrop Transfer Engine - V2 with High-Speed UDP Protocol
 */

const COMPRESSIBLE = new Set([
    'txt','log','md','rtf','csv','tsv','json','xml','html','htm',
    'css','js','ts','jsx','tsx','yaml','yml','ini','conf','sql',
    'svg','bmp','tiff','tif','wav','aiff','psd','ai'
]);

window.FileTransfer = {
    CHUNK_SIZE: 512 * 1024,   // Default 512 KB

    // Sender state
    sendQueue:    [],
    isSending:    false,
    startTime:    0,
    bytesSent:    0,
    currentItem:  null,
    onAccept:     null,
    onDecline:    null,
    senderPayload: null, // Holds the current blob/file being sent

    // Receiver state
    incomingMeta:     null,
    receiveBuffer:    [],
    receivedChunksSet: new Set(),
    bytesReceived:    0,
    lastSpeedUpdate:  0,
    fsaWritable:      null,

    // ── Init ─────────────────────────────────────────────────────────────
    init() {
        const dropZone  = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');
        if (!dropZone || !fileInput) return;

        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length) this.queueFiles(fileInput.files);
            fileInput.value = '';
        });

        dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', async e => {
            e.preventDefault(); dropZone.classList.remove('dragover');
            const items = e.dataTransfer.items;
            if (items) {
                const files = await this._expandItems(items);
                if (files.length) this.queueFiles(files);
            } else if (e.dataTransfer.files.length) {
                this.queueFiles(e.dataTransfer.files);
            }
        });

        const _folderInput = document.getElementById('folder-input');
        if (_folderInput) _folderInput.addEventListener('change', e => {
            if (e.target.files.length) this.queueFiles(e.target.files);
            e.target.value = '';
        });
    },

    async _expandItems(items) {
        const files = [];
        const traverse = (entry) => new Promise(resolve => {
            if (entry.isFile) {
                entry.file(f => {
                    Object.defineProperty(f, 'relativePath', { value: entry.fullPath });
                    files.push(f); resolve();
                });
            } else if (entry.isDirectory) {
                const reader = entry.createReader();
                const readBatch = () => {
                    reader.readEntries(async entries => {
                        if (!entries.length) return resolve();
                        await Promise.all(entries.map(traverse));
                        readBatch();
                    });
                };
                readBatch();
            } else resolve();
        });
        await Promise.all(Array.from(items).map(i => {
            const e = i.webkitGetAsEntry ? i.webkitGetAsEntry() : null;
            return e ? traverse(e) : Promise.resolve();
        }));
        return files;
    },

    reset() {
        this.sendQueue = []; this.isSending = false;
        this.startTime = 0; this.bytesSent = 0;
        this.currentItem = null; this.onAccept = null; this.onDecline = null;
        this.incomingMeta = null; this.receiveBuffer = []; this.receivedChunksSet.clear();
        this.bytesReceived = 0; this.lastSpeedUpdate = 0;
        const sq = document.getElementById('send-queue');
        const rq = document.getElementById('receive-queue');
        if (sq) sq.innerHTML = '';
        if (rq) rq.innerHTML = '';
        this.hideSpeedUI();
        this.updateZipButton();
    },

    queueFiles(fileList) {
        for (const file of fileList) {
            const id = Math.random().toString(36).slice(2, 9);
            this.sendQueue.push({ file, id });
            this.addFileToUI(file, id, 'send-queue');
        }
        this.updateZipButton();
        this.processQueue();
    },

    updateZipButton() {
        const zipBtn = document.getElementById('btn-zip');
        if (!zipBtn) return;
        if (this.sendQueue.length >= 3 && !this.isSending) {
            zipBtn.classList.remove('hidden');
        } else {
            zipBtn.classList.add('hidden');
        }
    },

    async zipAndSendQueue() {
        if (!window.fflate) { showToast('ZIP library not loaded'); return; }
        
        let totalSize = 0;
        const zipObj = {};
        for (const item of this.sendQueue) {
            totalSize += item.file.size;
        }
        if (totalSize > 100 * 1024 * 1024) {
            showToast('Cannot ZIP: Total size exceeds 100MB limit for mobile stability. Sending individually.');
            this.processQueue();
            return;
        }

        window.showToast('Compressing files into ZIP...');
        try {
            for (const item of this.sendQueue) {
                const arr = new Uint8Array(await item.file.arrayBuffer());
                zipObj[item.file.name] = arr;
            }
            const zipped = fflate.zipSync(zipObj);
            const zipBlob = new Blob([zipped], { type: 'application/zip' });
            const zipFile = new File([zipBlob], `CrossDrop-${Date.now()}.zip`, { type: 'application/zip' });
            
            // Clear queue and UI
            this.sendQueue = [];
            document.getElementById('send-queue').innerHTML = '';
            
            // Queue the single ZIP
            this.queueFiles([zipFile]);
        } catch (e) {
            showToast('Failed to create ZIP');
            console.error(e);
        }
    },

    addFileToUI(file, id, containerId) {
        const c = document.getElementById(containerId);
        if (!c) return;
        const idle = document.getElementById('receiver-idle-card');
        if (idle) idle.style.display = 'none';
        const div = document.createElement('div');
        div.className = 'file-item'; div.id = `file-${id}`;
        const mb = (file.size / 1048576).toFixed(2);
        div.innerHTML = `
            <div class="file-item-header">
                <div class="filename-wrap">
                    <span class="file-icon">${this._icon(file.name)}</span>
                    <span class="filename" title="${file.name}">${file.name}</span>
                </div>
                <span class="filesize" id="size-${id}">${mb} MB</span>
            </div>
            <div class="progress-container">
                <div class="progress-bar" id="prog-${id}"></div>
            </div>`;
        c.appendChild(div);
        requestAnimationFrame(() => div.classList.add('file-item-visible'));
    },

    _icon(name) {
        const e = name.split('.').pop().toLowerCase();
        if (['jpg','jpeg','png','gif','webp','heic','heif','avif'].includes(e)) return '🖼️';
        if (['mp4','mov','avi','mkv','webm','m4v'].includes(e)) return '🎬';
        if (['mp3','aac','flac','wav','m4a','ogg'].includes(e)) return '🎵';
        if (['pdf'].includes(e)) return '📄';
        if (['zip','rar','tar','gz','7z','bz2','xz'].includes(e)) return '📦';
        if (['doc','docx','pages','odt'].includes(e)) return '📝';
        if (['xls','xlsx','numbers','ods'].includes(e)) return '📊';
        if (['ppt','pptx','key','odp'].includes(e)) return '📑';
        if (['js','ts','py','java','c','cpp','go','rs','html','css','json'].includes(e)) return '💻';
        if (['apk','ipa'].includes(e)) return '📱';
        return '📁';
    },

    updateSpeedUI(mbps) {
        const wrap  = document.getElementById('speed-bar-wrap');
        const fill  = document.getElementById('speed-bar-fill');
        const label = document.getElementById('transfer-speed-label');
        if (!wrap) return;
        wrap.classList.remove('hidden');
        if (label) label.innerHTML = `${mbps.toFixed(1)}<span class="spd-unit">MB/s</span>`;
        if (fill) {
            fill.className = mbps >= 30 ? 'speed-fill spd-green' : mbps >= 10 ? 'speed-fill spd-amber' : 'speed-fill spd-red';
            fill.style.width = Math.min((mbps / 60) * 100, 100) + '%';
            fill.className = 'spd-fill';
        }
    },
    updateTimerUI(start) {
        const el = document.getElementById('transfer-time-label');
        if (!el) return;
        const s = Math.floor((performance.now() - start) / 1000);
        el.textContent = `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
    },
    hideSpeedUI() {
        const _wrap = document.getElementById('speed-bar-wrap');
        if (_wrap) _wrap.classList.add('hidden');
        const t = document.getElementById('transfer-time-label');
        if (t) t.textContent = '00:00';
    },

    async processQueue() {
        if (this.isSending || !this.sendQueue.length) return;
        this.isSending = true;
        this.updateZipButton();
        this.currentItem = this.sendQueue.shift();
        await this.sendFile(this.currentItem);
        this.isSending = false;
        this.currentItem = null;
        this.processQueue();
    },

    async sendFile(item) {
        let payload = item.file;
        const ext = payload.name.split('.').pop().toLowerCase();
        let compressed = false;

        const rtt = await WebRTC.getRTT();
        if (rtt > 50) this.CHUNK_SIZE = 256 * 1024;
        else if (rtt < 10) this.CHUNK_SIZE = 1024 * 1024;
        else this.CHUNK_SIZE = 512 * 1024;

        if (WebRTC.connectionType !== 'lan' && COMPRESSIBLE.has(ext) && payload.size < 30 * 1048576 && window.CompressionStream) {
            const sizeEl = document.getElementById(`size-${item.id}`);
            if (sizeEl) sizeEl.textContent += ' ⏳';
            try {
                const stream = payload.stream().pipeThrough(new CompressionStream('gzip'));
                payload = await new Response(stream).blob();
                compressed = true;
                if (sizeEl) sizeEl.textContent = `${(payload.size/1048576).toFixed(2)} MB 🗜️`;
            } catch (e) {
                payload = item.file;
            }
        }

        const totalChunks = Math.ceil(payload.size / this.CHUNK_SIZE);
        this.senderPayload = payload;

        const meta = {
            type:         'meta',
            id:           item.id,
            filename:     item.file.name,
            filesize:     payload.size,
            originalSize: item.file.size,
            totalChunks,
            compressed,
            mimetype:     item.file.type || 'application/octet-stream',
            senderName:   window.myName || 'Unknown',
            relativePath: item.file.relativePath || ''
        };

        this.sendControl(meta);
            if (window.Orbit) { window.Orbit.start(); }
            if (window.Feedback) { window.Feedback.play('start'); }

        return new Promise(resolve => {
            this.onAccept = async (resumeChunks = []) => {
                this.startTime = performance.now();
                this.bytesSent = 0;

                const speedInt = setInterval(() => {
                    const elapsed = performance.now() - this.startTime;
                    if (elapsed > 0) {
                        this.updateSpeedUI((this.bytesSent / 1048576) / (elapsed / 1000));
                        this.updateTimerUI(this.startTime);
                    }
                }, 350);

                let chunksToSend = [];
                const resumeSet = new Set(resumeChunks);
                for (let i = 0; i < totalChunks; i++) {
                    if (!resumeSet.has(i)) chunksToSend.push(i);
                }

                await this.sendChunksParalleled(item.id, chunksToSend, totalChunks);

                // Wait for NACKs or done
                this.onNack = async (missing) => {
                    await this.sendChunksParalleled(item.id, missing, totalChunks);
                    this.sendControl({ type: 'eof', id: item.id });
                };

                this.sendControl({ type: 'eof', id: item.id });

                this.onDone = () => {
                    clearInterval(speedInt);
                    this.logHistory(item.file.name, item.file.size, 'send');
                        if (window.Orbit) { window.Orbit.complete(); }
                        if (window.Feedback) { window.Feedback.play('complete'); }
                    const bar = document.getElementById(`prog-${item.id}`);
                    const sizeEl = document.getElementById(`size-${item.id}`);
                    if (bar) { bar.style.width = '100%'; bar.classList.add('prog-done'); }
                    if (sizeEl) sizeEl.textContent = '✅ Sent';
                    this.hideSpeedUI();
                    
                    // Trigger PWA install if available
                    if (window.deferredInstallPrompt) {
                        const installBanner = document.getElementById('install-banner');
                        if (installBanner) installBanner.classList.remove('hidden');
                    }
                    
                    resolve();
                };
            };

            this.onDecline = () => {
                const sizeEl = document.getElementById(`size-${item.id}`);
                if (sizeEl) sizeEl.textContent = '❌ Declined';
                if (window.Feedback) window.Feedback.play('error');
                resolve();
            };
        });
    },

    async sendChunksParalleled(fileId, indices, totalChunks) {
        if (!this.senderPayload) return;
        let nextIndex = 0;
        const channels = WebRTC.dataChannels.filter(c => c && c.readyState === 'open');
        if (!channels.length) return;

        const worker = async (ch) => {
            while (nextIndex < indices.length) {
                const idx = indices[nextIndex++];
                while (ch.bufferedAmount > 2 * 1048576) {
                    await new Promise(r => { ch._onLowBuffer = r; });
                }

                const start = idx * this.CHUNK_SIZE;
                const end = Math.min(start + this.CHUNK_SIZE, this.senderPayload.size);
                const chunk = await this.senderPayload.slice(start, end).arrayBuffer();
                const buf = new Uint8Array(4 + chunk.byteLength);
                new DataView(buf.buffer).setUint32(0, idx, true);
                buf.set(new Uint8Array(chunk), 4);

                try { ch.send(buf); this.bytesSent += buf.byteLength; } catch(e) {}

                if (idx % 10 === 0 || idx === totalChunks - 1) {
                    const bar = document.getElementById(`prog-${fileId}`);
                    if (bar) bar.style.width = `${((totalChunks - indices.length + nextIndex)/totalChunks)*100}%`;
                }
            }
        };
        await Promise.all(channels.map(ch => worker(ch)));
    },

    sendControl(msg) {
        const ch = WebRTC.dataChannels.find(c => c && c.readyState === 'open');
        if (ch) ch.send(JSON.stringify(msg));
    },

    onMessage(data) {
        if (typeof data === 'string') {
            let msg; try { msg = JSON.parse(data); } catch { return; }

            if (msg.type === 'meta') {
                this.incomingMeta = msg;
                this.receiveBuffer = new Array(msg.totalChunks);
                this.receivedChunksSet.clear();
                this.bytesReceived = 0;
                this.lastSpeedUpdate = 0;
                this.startTime = 0;
                
                document.getElementById('incoming-filename').textContent = msg.filename;
                document.getElementById('incoming-filesize').textContent = `${(msg.originalSize / 1048576).toFixed(2)} MB`;
                const senderEl = document.getElementById('incoming-sender');
                if (senderEl) senderEl.textContent = 'from ' + (msg.senderName || 'Unknown');
                document.getElementById('incoming-modal').classList.remove('hidden');
                
                const iconMatch = this._icon(msg.filename);
                const iconEl = document.getElementById('incoming-icon');
                if (iconEl) iconEl.textContent = iconMatch;
                
                this.addFileToUI({ name: msg.filename, size: msg.originalSize }, msg.id, 'receive-queue');
                if (window.Feedback) window.Feedback.play('start');

                        } else if (msg.type === 'accept')  { if (this.onAccept) this.onAccept(msg.resumeChunks || []); }
                            else if (msg.type === 'decline') { if (this.onDecline) this.onDecline(); }
                            else if (msg.type === 'eof')     { this.checkEof(msg.id); }
                            else if (msg.type === 'nack')    { if (this.onNack) this.onNack(msg.missing); }
                            else if (msg.type === 'done')    { if (this.onDone) this.onDone(); }

        } else if (data instanceof ArrayBuffer) {
            if (!this.startTime) this.startTime = performance.now();
            
            // Zero-copy view parsing
            const dv = new DataView(data);
            const idx = dv.getUint32(0, true);
            
            if (!this.receivedChunksSet.has(idx)) {
                this.receiveBuffer[idx] = new Uint8Array(data, 4);
                this.receivedChunksSet.add(idx);
                this.bytesReceived += (data.byteLength - 4);
            }

            const now = performance.now();
            if (now - this.lastSpeedUpdate > 350) {
                const mbps = (this.bytesReceived / 1048576) / ((now - this.startTime) / 1000);
                this.updateSpeedUI(mbps);
                this.updateTimerUI(this.startTime);
                this.lastSpeedUpdate = now;
            }
            if (this.incomingMeta) {
                const total = this.incomingMeta.totalChunks;
                if (this.receivedChunksSet.size % 10 === 0 || this.receivedChunksSet.size === total) {
                    const bar = document.getElementById(`prog-${this.incomingMeta.id}`);
                    if (bar) bar.style.width = `${(this.receivedChunksSet.size / total) * 100}%`;
                }
            }
        }
    },

    checkEof(id) {
        if (!this.incomingMeta || this.incomingMeta.id !== id) return;
        const total = this.incomingMeta.totalChunks;
        if (this.receivedChunksSet.size === total) {
            this.sendControl({ type: 'done', id });
            this.finishReceive();
        } else {
            const missing = [];
            for (let i = 0; i < total; i++) {
                if (!this.receivedChunksSet.has(i)) missing.push(i);
            }
            this.sendControl({ type: 'nack', id, missing });
        }
    },

    acceptCurrentFile() {
        document.getElementById('incoming-modal').classList.add('hidden');
        if (window.Orbit) window.Orbit.start();
        // Resume logic: if we already have chunks for this exact file id (e.g. reconnection)
        const resumeChunks = Array.from(this.receivedChunksSet);
        this.sendControl({ type: 'accept', resumeChunks });
    },
    declineCurrentFile() {
        document.getElementById('incoming-modal').classList.add('hidden');
        this.sendControl({ type: 'decline' });
        this.incomingMeta = null; this.receiveBuffer = []; this.receivedChunksSet.clear();
    },

    async finishReceive() {
        if (!this.incomingMeta) return;
        this.hideSpeedUI();

        const bar = document.getElementById(`prog-${this.incomingMeta.id}`);
        const sizeEl = document.getElementById(`size-${this.incomingMeta.id}`);
        if (bar) { bar.style.width = '100%'; bar.classList.add('prog-done'); }

        // Assemble Blob (zero-copy views)
        let blob = new Blob(this.receiveBuffer);
        this.receiveBuffer = [];
        this.receivedChunksSet.clear();

        if (this.incomingMeta.compressed && window.DecompressionStream) {
            if (sizeEl) sizeEl.textContent = 'Decompressing…';
            try {
                blob = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
            } catch (e) { console.error('Decompression failed', e); }
        }

        if (sizeEl) sizeEl.textContent = '✅ Saved';

        let saved = false;
        if (window.showSaveFilePicker) {
            try {
                const handle = await showSaveFilePicker({ suggestedName: this.incomingMeta.filename });
                const writable = await handle.createWritable();
                const stream = blob.stream();
                const reader = stream.getReader();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    await writable.write(value);
                }
                await writable.close();
                saved = true;
            } catch (e) {
                if (e.name !== 'AbortError') console.warn('FSA failed', e);
            }
        }

        if (!saved) {
            const url = URL.createObjectURL(blob);
            const a = Object.assign(document.createElement('a'), { href: url, download: this.incomingMeta.filename });
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 3000);
        }

        this.logHistory(this.incomingMeta.filename, this.incomingMeta.filesize, 'receive');
            if (window.Orbit) { window.Orbit.complete(); }
            if (window.Feedback) { window.Feedback.play('complete'); }
            if (window.showToast) { window.showToast(`✅ ${this.incomingMeta.filename} saved`); }
        
        // Add celebration particle
        const particle = document.createElement('div');
        particle.className = 'celebrate-particle';
        particle.textContent = '🎉';
        particle.style.left = '50%';
        particle.style.top = '20%';
        particle.style.fontSize = '40px';
        document.body.appendChild(particle);
        setTimeout(() => particle.remove(), 2000);

        // PWA prompt trigger
        if (window.deferredInstallPrompt) {
            const installBanner = document.getElementById('install-banner');
            if (installBanner) installBanner.classList.remove('hidden');
        }

        this.incomingMeta = null;
    },

    logHistory(filename, size, direction) {
        const h = {
            filename, size, direction,
            timestamp: Date.now(),
            speed: (function(){ const el = document.getElementById('transfer-speed-label'); return el && el.textContent ? (el.textContent.split(' ')[1] || '0.0') : '0.0'; })()
        };
        try {
            let history = JSON.parse(localStorage.getItem('crossdrop_history') || '[]');
            history.unshift(h);
            history = history.slice(0, 50);
            localStorage.setItem('crossdrop_history', JSON.stringify(history));
            if (window.loadHistory) window.loadHistory();
        } catch(e) {}
    }
};
