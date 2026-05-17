window.Orbit = {
    canvas: null,
    ctx: null,
    animFrame: null,
    dots: [],
    active: false,
    width: 320,
    height: 120,
    
    start() {
        this.canvas = document.getElementById('orbit-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.active = true;
        this.dots = [];
        this.canvas.classList.remove('hidden');
        
        for (let i=0; i<WebRTC.NUM_CHANNELS; i++) {
            this.dots.push({
                t: Math.random(),
                speed: 0.5 + Math.random() * 0.5,
                offset: (Math.random() - 0.5) * 40,
                active: true
            });
        }
        
        this.drawLoop();
    },
    
    drawLoop() {
        if (!this.active) return;
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        this.ctx.fillStyle = 'rgba(255,255,255,0.05)';
        for(let x=0; x<this.width; x+=10) {
            for(let y=0; y<this.height; y+=10) {
                this.ctx.fillRect(x,y,1,1);
            }
        }
        
        this.ctx.beginPath(); this.ctx.arc(40, 60, 20, 0, Math.PI*2); this.ctx.fillStyle = 'rgba(255,255,255,0.1)'; this.ctx.fill();
        this.ctx.beginPath(); this.ctx.arc(280, 60, 20, 0, Math.PI*2); this.ctx.fillStyle = 'rgba(255,255,255,0.1)'; this.ctx.fill();
        
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = '#C7FF6B';
        this.ctx.fillStyle = '#C7FF6B';
        
        const dt = 1/60;
        this.dots.forEach(d => {
            if (!d.active) return;
            d.t += d.speed * dt;
            if (d.t > 1) d.t = 0;
            
            const startX = 40, startY = 60;
            const endX = 280, endY = 60;
            const cp1X = 120, cp1Y = 60 + d.offset;
            const cp2X = 200, cp2Y = 60 - d.offset;
            
            const cx = 3 * (cp1X - startX);
            const bx = 3 * (cp2X - cp1X) - cx;
            const ax = endX - startX - cx - bx;
            const cy = 3 * (cp1Y - startY);
            const by = 3 * (cp2Y - cp1Y) - cy;
            const ay = endY - startY - cy - by;
            
            const x = ax*d.t*d.t*d.t + bx*d.t*d.t + cx*d.t + startX;
            const y = ay*d.t*d.t*d.t + by*d.t*d.t + cy*d.t + startY;
            
            this.ctx.beginPath();
            this.ctx.arc(x, y, 3, 0, Math.PI*2);
            this.ctx.fill();
        });
        
        this.ctx.shadowBlur = 0;
        this.animFrame = requestAnimationFrame(() => this.drawLoop());
    },
    
    complete() {
        this.dots.forEach(d => d.t = 1);
        setTimeout(() => this.stop(), 800);
    },
    
    stop() {
        this.active = false;
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
        if (this.ctx) this.ctx.clearRect(0,0,this.width,this.height);
        if (this.canvas) this.canvas.classList.add('hidden');
    }
};
