/**
 * Orbit — canvas animation shown during transfers
 * A particle that orbits a glowing core, visualising data in flight.
 */
window.Orbit = {
    canvas: null,
    ctx: null,
    raf: null,
    t: 0,
    phase: 'idle',  // idle | sending | done

    start() {
        this.canvas = document.getElementById('orbit-canvas');
        if (!this.canvas) return;
        this.canvas.classList.remove('hidden');
        this.ctx = this.canvas.getContext('2d');
        this.phase = 'sending';
        this.t = 0;
        if (!this.raf) this._loop();
    },

    complete() {
        this.phase = 'done';
        setTimeout(() => { this.stop(); }, 1200);
    },

    stop() {
        cancelAnimationFrame(this.raf);
        this.raf = null;
        this.phase = 'idle';
        if (this.canvas) this.canvas.classList.add('hidden');
        if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    },

    _loop() {
        this.raf = requestAnimationFrame(() => this._loop());
        const c   = this.canvas;
        const ctx = this.ctx;
        const W   = c.width, H = c.height;
        const cx  = W / 2, cy = H / 2;

        ctx.clearRect(0, 0, W, H);
        this.t += 0.04;

        // Core glow
        const coreR = this.phase === 'done' ? 22 : 16 + Math.sin(this.t * 3) * 3;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.5);
        g.addColorStop(0, this.phase === 'done' ? 'rgba(255,92,53,0.9)' : 'rgba(255,92,53,0.7)');
        g.addColorStop(1, 'rgba(255,92,53,0)');
        ctx.beginPath(); ctx.arc(cx, cy, coreR * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,92,53,0.9)'; ctx.fill();

        if (this.phase === 'sending') {
            // Orbit ring
            ctx.beginPath();
            ctx.ellipse(cx, cy, 70, 18, 0, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,92,53,0.15)';
            ctx.lineWidth = 1.5; ctx.stroke();

            // Two particles on orbit
            [-0, Math.PI].forEach((offset, i) => {
                const angle = this.t * (i === 0 ? 2 : -1.4) + offset;
                const px = cx + Math.cos(angle) * 70;
                const py = cy + Math.sin(angle) * 18;
                const trail = ctx.createRadialGradient(px, py, 0, px, py, 9);
                trail.addColorStop(0, 'rgba(255,92,53,0.9)');
                trail.addColorStop(1, 'rgba(255,92,53,0)');
                ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2);
                ctx.fillStyle = trail; ctx.fill();
            });
        }
    }
};
