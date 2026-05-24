// ─── Device Name Generator ───────────────────────────────────────────────────
const DEVICE_NAMES = {
    adjectives: ["Swift", "Blue", "Neon", "Cosmic", "Hyper", "Turbo", "Quantum",
                 "Sonic", "Lunar", "Solar", "Cyber", "Mega", "Pulse", "Storm"],
    nouns: ["Mango", "Falcon", "Panther", "Fox", "Vortex", "Comet", "Pulse",
            "Wave", "Spark", "Nova", "Photon", "Glitch", "Ember", "Drift"]
};

function detectDeviceType() {
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua)) return { type: "iPhone", icon: "📱" };
    if (/Android/.test(ua)) return { type: "Android", icon: "🤖" };
    if (/Mac OS X/.test(ua)) return { type: "Mac", icon: "💻" };
    if (/Windows/.test(ua)) return { type: "Windows", icon: "💻" };
    return { type: "Device", icon: "📱" };
}

function generateDeviceName() {
    let name = localStorage.getItem('crossdrop_device_name');
    if (!name) {
        const adj = DEVICE_NAMES.adjectives[Math.floor(Math.random() * DEVICE_NAMES.adjectives.length)];
        const noun = DEVICE_NAMES.nouns[Math.floor(Math.random() * DEVICE_NAMES.nouns.length)];
        name = `${adj} ${noun}`;
        localStorage.setItem('crossdrop_device_name', name);
    }
    const device = detectDeviceType();
    return `${device.icon} ${name}`;
}

async function measureBandwidth() {
    try {
        const start = performance.now();
        const resp = await fetch(BACKEND_URL + '/speedtest');
        const blob = await resp.blob();
        const end = performance.now();
        const duration = (end - start) / 1000;
        const sizeMB = blob.size / (1024 * 1024);
        return sizeMB / duration;
    } catch (e) {
        return 20; // assume good on error
    }
}

// ─── DeviceDetect namespace (fixes "DeviceDetect is not defined") ─────────────
window.DeviceDetect = {
    generateName() { return generateDeviceName(); },
    getType() { return detectDeviceType(); }
};
