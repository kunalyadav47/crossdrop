window.Wizard = {
    show() {
        const ua = navigator.userAgent.toLowerCase();
        let family = 'Android';
        if (ua.includes('iphone') || ua.includes('ipad')) family = 'iOS';
        else if (ua.includes('samsung') || ua.includes('sm-')) family = 'Samsung';
        else if (ua.includes('miui') || ua.includes('xiaomi') || ua.includes('redmi') || ua.includes('poco')) family = 'Xiaomi';
        else if (ua.includes('pixel')) family = 'Pixel';
        else if (ua.includes('oplus') || ua.includes('oneplus')) family = 'OnePlus';

        const content = {
            'iOS': {
                icon: '🍎',
                reason: "iPhones strictly block local network connections between devices sharing their hotspot.",
                steps: ["You cannot fix this setting on iOS.", "Instead, use a Mac or Windows laptop as the hotspot host.", "Or connect both devices to a real WiFi router."]
            },
            'Samsung': {
                icon: '📱',
                reason: "Samsung hides devices from each other on hotspots by default.",
                steps: ["Go to Settings → Connections", "Tap Mobile Hotspot and Tethering", "Tap Mobile Hotspot → Configure", "Uncheck 'Hide my device'"]
            },
            'Xiaomi': {
                icon: '📱',
                reason: "MIUI enables AP Isolation by default to save battery.",
                steps: ["Go to Settings → Portable Hotspot", "Tap Hotspot Settings", "Uncheck 'Allow others to find my phone'", "Ensure AP isolation is OFF in Advanced"]
            },
            'Pixel': {
                icon: '📱',
                reason: "Stock Android protects hotspot clients from each other.",
                steps: ["Go to Settings → Network & Internet → Hotspot", "Ensure AP Isolation is disabled", "Ensure 'Hide hotspot' is off"]
            },
            'Android': {
                icon: '🤖',
                reason: "Your phone likely has AP Isolation enabled, which blocks devices from connecting.",
                steps: ["Go to Hotspot Settings", "Look for 'AP Isolation', 'Client Isolation', or 'Hide devices'", "Turn that setting OFF"]
            },
            'OnePlus': {
                icon: '📱',
                reason: "OxygenOS restricts hotspot client communication.",
                steps: ["Go to Settings → Connection & Sharing → Personal Hotspot", "Tap Hotspot settings", "Turn off 'AP isolation'"]
            }
        };

        const info = content[family] || content['Android'];
        
        let modal = document.getElementById('wizard-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'wizard-modal';
            modal.className = 'modal hidden';
            document.body.appendChild(modal);
        }
        
        modal.innerHTML = `
            <div class="modal-content" style="text-align:left;">
                <h3 style="margin-top:0"><span style="font-size:24px;">${info.icon}</span> Hotspot Fix Guide</h3>
                <p style="color:var(--text-muted); font-size:14px; margin-bottom:16px;">${info.reason}</p>
                <ol style="margin-left:20px; font-size:14px; margin-bottom:24px;">
                    ${info.steps.map(s => `<li style="margin-bottom:8px;">${s}</li>`).join('')}
                </ol>
                <div class="modal-actions" style="display:flex; gap:10px;">
                    <button class="secondary-btn" id="wiz-close" style="flex:1;">Close</button>
                    <button class="primary-btn" id="wiz-retest" style="flex:1;">Test Again</button>
                </div>
            </div>
        `;
        
        modal.classList.remove('hidden');
        document.getElementById('wiz-close').onclick = () => modal.classList.add('hidden');
        document.getElementById('wiz-retest').onclick = async () => {
            modal.classList.add('hidden');
            if(window.runDiagnostics) window.runDiagnostics();
        };
    }
};
