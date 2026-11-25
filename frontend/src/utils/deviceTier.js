// Unified hardware, RAM, and GPU tier detection for smooth 50-60 FPS WebGL on budget classroom devices.
// Memoized once per page load; temporary probe WebGL context is explicitly released immediately.

let cachedProfile = null;

function probeGpuRenderer() {
    if (typeof document === 'undefined') return '';
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return '';
        let renderer = '';
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) {
            renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
        }
        if (!renderer) {
            renderer = String(gl.getParameter(gl.RENDERER) || '');
        }
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return renderer;
    } catch {
        return '';
    }
}

export function getDeviceProfile() {
    if (cachedProfile) return cachedProfile;

    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        cachedProfile = {
            isMobile: false,
            isLowEnd: false,
            gpuRenderer: '',
        };
        return cachedProfile;
    }

    const isMobile = Boolean(
        window.matchMedia?.('(pointer: coarse)')?.matches ||
            /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')
    );

    const cores = Number(navigator.hardwareConcurrency || 8);
    const memoryGb = Number(navigator.deviceMemory || 0); // 0 if unsupported (Safari/Firefox)
    const gpuRenderer = probeGpuRenderer();

    const isSoftwareGpu = /SwiftShader|llvmpipe|Software Rasterizer|Microsoft Basic Render/i.test(gpuRenderer);
    const isWeakMobileGpu =
        /PowerVR|Mali-4\d\d|Mali-T\d+|Mali-G31|Mali-G52|Mali-G57|Adreno\s*\(TM\)\s*(3\d\d|4\d\d|5\d\d|610|612)/i.test(
            gpuRenderer
        );

    const lowCores = cores <= 4;
    const lowRam = memoryGb > 0 && memoryGb <= 4;
    const isLowEnd = Boolean(
        isSoftwareGpu ||
            (isMobile && (lowRam || lowCores || isWeakMobileGpu)) ||
            (!isMobile && lowRam && lowCores)
    );

    cachedProfile = {
        isMobile,
        isLowEnd,
        lowRam,
        lowCores,
        isWeakMobileGpu,
        isSoftwareGpu,
        gpuRenderer,
    };
    return cachedProfile;
}
