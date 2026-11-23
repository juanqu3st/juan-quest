import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

async function scanBlobWithHtml5Qrcode(fileOrBlob) {
    const tempId = `jq-qr-file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const el = document.createElement('div');
    el.id = tempId;
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    el.style.top = '-9999px';
    el.style.width = '1px';
    el.style.height = '1px';
    el.style.overflow = 'hidden';
    document.body.appendChild(el);

    const scanner = new Html5Qrcode(tempId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        useBarCodeDetectorIfSupported: true,
        verbose: false,
    });

    try {
        const file =
            fileOrBlob instanceof File
                ? fileOrBlob
                : new File([fileOrBlob], 'qr.png', { type: fileOrBlob.type || 'image/png' });
        return await scanner.scanFile(file, false);
    } finally {
        try {
            scanner.clear();
        } catch {
            // ignore cleanup error
        }
        el.remove();
    }
}

function loadHtmlImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = (err) => {
            URL.revokeObjectURL(url);
            reject(err);
        };
        img.src = url;
    });
}

function renderRegionToBlob(img, sx, sy, sw, sh, maxSide = 1100, pad = 24) {
    return new Promise((resolve, reject) => {
        const scale = Math.min(1, maxSide / Math.max(sw, sh));
        const dw = Math.max(1, Math.round(sw * scale));
        const dh = Math.max(1, Math.round(sh * scale));
        const canvas = document.createElement('canvas');
        canvas.width = dw + pad * 2;
        canvas.height = dh + pad * 2;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, sx, sy, sw, sh, pad, pad, dw, dh);
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas encode failed'));
        }, 'image/png');
    });
}

/**
 * Multi-pass QR image decoder that handles downloaded PNG cards, Messenger compressed photos,
 * and full-screen mobile screenshots reliably.
 */
export async function decodeQrFromImageFile(file) {
    if (!file) throw new Error('Walang napiling larawan.');

    // Pass 1: Native hardware BarcodeDetector (instant ~15ms on Android Chrome / Edge / Chrome)
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        try {
            const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
            const bitmap = await createImageBitmap(file);
            try {
                const hits = await detector.detect(bitmap);
                const text = hits?.[0]?.rawValue;
                if (text) return text;
            } finally {
                bitmap.close?.();
            }
        } catch {
            // Fall through to Html5Qrcode passes
        }
    }

    // Pass 2: Direct scan on original image file
    try {
        const text = await scanBlobWithHtml5Qrcode(file);
        if (text) return text;
    } catch {
        // Continue to scaled/cropped passes
    }

    // Pass 3 & 4: Normalize resolution and try center crop (handles full phone screenshots & Messenger photos!)
    const img = await loadHtmlImage(file);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;

    const passes = [
        // Full image scaled down cleanly to ~1000px with white quiet margin
        [0, 0, w, h, 1000],
        // Center region crop (where Result QR sits on phone screenshots)
        [Math.round(w * 0.05), Math.round(h * 0.16), Math.round(w * 0.9), Math.round(h * 0.68), 900],
        // Tighter middle crop
        [Math.round(w * 0.12), Math.round(h * 0.25), Math.round(w * 0.76), Math.round(h * 0.5), 800],
    ];

    for (const [sx, sy, sw, sh, maxSide] of passes) {
        try {
            const blob = await renderRegionToBlob(img, sx, sy, sw, sh, maxSide, 32);
            const text = await scanBlobWithHtml5Qrcode(blob);
            if (text) return text;
        } catch {
            // try next pass
        }
    }

    throw new Error(
        'Walang mabasang QR code sa larawan. Tiyaking malinaw at hindi putol ang QR code sa picture.'
    );
}
