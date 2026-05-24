/**
 * Feedback — Web Audio API sound effects (no files needed)
 * Uses oscillators to generate tones — works fully offline.
 */
window.Feedback = {
    ctx: null,
    muted: localStorage.getItem('crossdrop_muted') === 'true',

    init() {
        // Lazy AudioContext (must be created after user gesture)
        document.addEventListener('click', () => {
            if (!this.ctx) {
                try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
                catch(e) { /* audio not supported */ }
            }
        }, { once: false });
    },

    play(type) {
        if (this.muted || !this.ctx) return;
        try {
            const ac = this.ctx;
            if (ac.state === 'suspended') ac.resume();

            const play = (freq, startTime, duration, gain = 0.18, type = 'sine') => {
                const osc = ac.createOscillator();
                const env = ac.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, startTime);
                env.gain.setValueAtTime(0, startTime);
                env.gain.linearRampToValueAtTime(gain, startTime + 0.01);
                env.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
                osc.connect(env); env.connect(ac.destination);
                osc.start(startTime); osc.stop(startTime + duration + 0.02);
            };

            const t = ac.currentTime;
            switch (type) {
                case 'paired':   // two rising tones
                    play(440, t,       0.12);
                    play(660, t + 0.1, 0.18);
                    break;
                case 'start':    // soft blip
                    play(520, t, 0.10, 0.12);
                    break;
                case 'complete': // three ascending tones
                    play(440, t,       0.10, 0.15);
                    play(550, t + 0.1, 0.10, 0.15);
                    play(660, t + 0.2, 0.18, 0.2);
                    break;
                case 'error':    // two descending tones
                    play(330, t,       0.12, 0.15, 'square');
                    play(220, t + 0.12,0.18, 0.15, 'square');
                    break;
            }
        } catch(e) { /* ignore audio errors silently */ }
    }
};
