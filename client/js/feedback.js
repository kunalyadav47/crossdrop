window.Feedback = {
    audioCtx: null,
    muted: localStorage.getItem('crossdrop_muted') === 'true',
    
    init() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },
    
    play(type) {
        if (this.muted) return;
        this.init();
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        
        const t = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        
        if (type === 'paired') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(400, t);
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.15, t + 0.005);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
            osc.start(t);
            osc.stop(t + 0.08);
            if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
        } 
        else if (type === 'start') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(200, t);
            osc.frequency.exponentialRampToValueAtTime(800, t + 0.2);
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.1, t + 0.1);
            gain.gain.linearRampToValueAtTime(0, t + 0.2);
            osc.start(t);
            osc.stop(t + 0.2);
        }
        else if (type === 'complete') {
            osc.type = 'sine';
            gain.gain.setValueAtTime(0, t);
            
            osc.frequency.setValueAtTime(440, t);
            gain.gain.linearRampToValueAtTime(0.1, t + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
            
            osc.frequency.setValueAtTime(554, t + 0.12);
            gain.gain.linearRampToValueAtTime(0.1, t + 0.13);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.22);
            
            osc.frequency.setValueAtTime(659, t + 0.24);
            gain.gain.linearRampToValueAtTime(0.15, t + 0.25);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
            
            osc.start(t);
            osc.stop(t + 0.4);
            if (navigator.vibrate) navigator.vibrate([60]);
        }
        else if (type === 'error') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(100, t);
            osc.frequency.exponentialRampToValueAtTime(60, t + 0.2);
            gain.gain.setValueAtTime(0.15, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
            osc.start(t);
            osc.stop(t + 0.2);
            if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 100]);
        }
    },
    
    toggleMute() {
        this.muted = !this.muted;
        localStorage.setItem('crossdrop_muted', this.muted);
    }
};
