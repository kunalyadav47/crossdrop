/**
 * Wizard — hotspot setup guide modal
 * Shown when preflight detects slow/no WiFi
 */
window.Wizard = {
    show() {
        let modal = document.getElementById('wizard-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'wizard-modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width:360px">
                    <div style="font-size:32px;text-align:center;margin-bottom:12px">📡</div>
                    <h3 style="font-size:20px;font-weight:700;margin-bottom:16px;text-align:center">Hotspot Setup Guide</h3>
                    <div style="font-size:13px;color:rgba(240,237,230,0.6);line-height:1.8;margin-bottom:20px">
                        <p style="margin-bottom:10px"><strong style="color:#F0EDE6">On iPhone (Sender or Receiver):</strong></p>
                        <ol style="padding-left:18px;display:flex;flex-direction:column;gap:6px">
                            <li>Settings → Personal Hotspot → toggle ON</li>
                            <li>Tap <em>Allow Others to Join</em></li>
                            <li>For 5GHz: Settings → Personal Hotspot → <em>Maximise Compatibility OFF</em></li>
                        </ol>
                        <p style="margin-top:14px;margin-bottom:10px"><strong style="color:#F0EDE6">On Android (join the hotspot):</strong></p>
                        <ol style="padding-left:18px;display:flex;flex-direction:column;gap:6px">
                            <li>Settings → WiFi → find the iPhone hotspot</li>
                            <li>Enter the hotspot password</li>
                            <li>Open Chrome → go to crossdrop URL</li>
                        </ol>
                        <p style="margin-top:14px;padding:10px;background:rgba(200,255,95,0.08);border-radius:8px;border:1px solid rgba(200,255,95,0.2)">
                            💡 <strong style="color:#C8FF5F">Tip:</strong> Turning off <em>Maximise Compatibility</em> forces 5GHz and roughly doubles transfer speed.
                        </p>
                    </div>
                    <button id="wizard-close" class="primary-btn">Got it ✓</button>
                </div>`;
            document.body.appendChild(modal);
            document.getElementById('wizard-close').addEventListener('click', () => Wizard.hide());
            modal.addEventListener('click', e => { if (e.target === modal) Wizard.hide(); });
        }
        modal.style.display = 'flex';
    },

    hide() {
        const modal = document.getElementById('wizard-modal');
        if (modal) modal.style.display = 'none';
    }
};
